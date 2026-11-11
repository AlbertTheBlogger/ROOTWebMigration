// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { tutorialCatalog, lessonById, createTutorial, advanceTutorial, projectTutorial } from './tutorials.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomInt, randomUUID, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { RULESET, LIMITATIONS } from './engine.mjs';
import { createGame, applyAction, projectGame, supportedRulesets } from './rules/versions/registry.mjs';
import { candidates as botCandidates } from './bots/test-policy.mjs';

const scrypt=promisify(scryptCb);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const artManifest=JSON.parse(readFileSync(resolve(root,'frontend/asset-manifest.json'),'utf8'));
const artFiles=new Set(artManifest.files);
const sceneResources=new Map();
for(const path of ['/clearing-ui.js','/experience.js','/map-controls.js','/log-ui.js']){
  const content=readFileSync(resolve(root,'frontend','.'+path));
  const type=path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.json')?'application/json; charset=utf-8':path.endsWith('.webp')?'image/webp':path.endsWith('.bin')?'application/octet-stream':'text/plain; charset=utf-8';
  const compress=!path.endsWith('.webp');
  sceneResources.set(path,{content,type,gzip:compress?gzipSync(content):null,immutable:/\.[a-f0-9]{12}\./.test(path)});
}
const error=(status,message)=>Object.assign(new Error(message),{status});
const requireThat=(ok,status,message)=>{if(!ok)throw error(status,message);};
const sha=value=>createHash('sha256').update(value).digest('hex');
const nameOf=value=>{requireThat(typeof value==='string',422,'请输入本局玩家名');const n=value.trim();requireThat(n.length>=1&&n.length<=24&&!/[\p{Cc}\p{Cf}]/u.test(n),422,'玩家名应为 1–24 个字符，不含控制字符');return n;};
export async function hashPassword(value){const salt=randomBytes(16).toString('hex');const key=await scrypt(value,salt,64);return `${salt}:${key.toString('hex')}`;}
async function verifyPassword(value,stored){const [salt,hex]=stored.split(':');const key=await scrypt(value,salt,64);return timingSafeEqual(key,Buffer.from(hex,'hex'));}
function password(value,optional=false){requireThat(typeof value==='string'&&value.length<129&&(optional||value.length>=8),422,optional?'房间密码不能超过 128 个字符':'账号密码需为 8–128 个字符');return value;}
const clone=value=>structuredClone(value);
export function configureAccounts(db){
  db.exec("CREATE TABLE IF NOT EXISTS account_access(user_id TEXT PRIMARY KEY REFERENCES users(id),role TEXT NOT NULL DEFAULT 'player' CHECK(role IN ('player','admin')),disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)))");
}

export function createApp({dbPath=process.env.DB_PATH||resolve(root,'data/root.sqlite'),origin=process.env.APP_ORIGIN||null,secure=process.env.COOKIE_SECURE==='true',rateLimit=true,botDelay=600}={}){
  if(dbPath!==':memory:')mkdirSync(dirname(resolve(dbPath)),{recursive:true});
  const db=new DatabaseSync(dbPath);
  if(db.prepare('PRAGMA auto_vacuum').get().auto_vacuum!==2){
    db.exec('PRAGMA auto_vacuum=INCREMENTAL; VACUUM;');
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,password_hash TEXT,version INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY,room_code TEXT NOT NULL,state TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS commands(room_code TEXT NOT NULL,user_id TEXT NOT NULL,command_id TEXT NOT NULL,body_hash TEXT NOT NULL,version INTEGER NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(room_code,user_id,command_id));
    CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT,game_id TEXT NOT NULL REFERENCES games(id),room_version INTEGER NOT NULL,state TEXT NOT NULL,command TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS snapshots_game ON snapshots(game_id,id);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS tutorial_runs(user_id TEXT NOT NULL REFERENCES users(id),lesson_id TEXT NOT NULL,version INTEGER NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,lesson_id));`);
  configureAccounts(db);
  const clients=new Set(),buckets=new Map();let closing=false;
  const botTimers = new Map();
  const dummyHashPromise=hashPassword(randomBytes(24).toString('hex'));
  function getRoom(code){const row=db.prepare('SELECT * FROM rooms WHERE code=?').get(code);requireThat(row,404,'房间不存在');return {...row,payload:JSON.parse(row.payload)};}
  const member=(room,uid)=>room.payload.members.find(m=>m.userId===uid);
  function roomView(room,uid){requireThat(member(room,uid),403,'你不在这个房间');return {code:room.code,title:room.title,ownerId:room.owner_id,version:room.version,status:room.status,capacity:room.payload.capacity||2,locked:!!(room.password_hash||room.payload.adminPrivate),updatedAt:room.updated_at,members:clone(room.payload.members),botError:room.payload.botError||null,gameId:room.payload.gameId||null,game:room.payload.game?projectGame(room.payload.game,uid):null};}
  function allRooms(uid){return db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC LIMIT 500').all().flatMap(row=>{
    const p=JSON.parse(row.payload),mine=p.members.some(m=>m.userId===uid),canDelete=row.owner_id===uid;
    if((row.status==='closed'&&!canDelete)||((row.password_hash||p.adminPrivate)&&!mine&&!canDelete))return [];
    return [{code:row.code,title:row.title,locked:!!(row.password_hash||p.adminPrivate),status:row.status,count:p.members.length,capacity:p.capacity||2,mine,canDelete,version:row.version,updatedAt:row.updated_at}];
  });}
  function token(req){const match=(req.headers.cookie||'').match(/(?:^|;\s*)woodland_session=([a-f0-9]{64})(?:;|$)/);return match?match[1]:null;}
  function session(req){const t=token(req);if(!t)return null;return db.prepare("SELECT u.id,u.username,s.expires_at,COALESCE(a.role,'player') role FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN account_access a ON a.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND COALESCE(a.disabled,0)=0").get(sha(t),Date.now())||null;}
  function cookie(value,maxAge){return `woodland_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?'; Secure':''}`;}
  function json(res,status,data,headers={}){
    const raw=Buffer.from(JSON.stringify(data));
    // Keep API responses uncompressed: the deployed forwarding path repeatedly
    // lost the gzip trailer, leaving response.json() waiting after all JSON arrived.
    // Static assets still use gzip below.
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Connection':'close','Content-Length':raw.length,'Vary':'Accept-Encoding','Server-Timing':`app;dur=${(performance.now()-(res.startedAt||performance.now())).toFixed(1)}`,...headers});
    res.end(raw);
  }
  function throttle(key,limit,window=60000){if(!rateLimit)return;const now=Date.now(),old=buckets.get(key);const b=old&&old.until>now?old:{count:0,until:now+window};b.count++;buckets.set(key,b);requireThat(b.count<=limit,429,'操作太频繁，请稍后重试');}
  async function body(req){requireThat((req.headers['content-type']||'').startsWith('application/json'),415,'请求必须为 JSON');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;requireThat(size<=16384,413,'请求体过大');chunks.push(chunk);}let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw error(400,'JSON 格式错误');}requireThat(result&&typeof result==='object'&&!Array.isArray(result),400,'请求应为 JSON 对象');return result;}
  function notify(code){for(const client of clients){if(client.code!==code)continue;try{const u=session(client.req);if(!u){client.res.end();continue;}const room=getRoom(code);if(!member(room,u.id)){client.res.write('event: removed\ndata: {}\n\n');client.res.end();continue;}client.res.write(`data: ${JSON.stringify(roomView(room,u.id))}\n\n`);}catch{client.res.end();}}}
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}
  function persist(room,command,actor){
    const version=room.version+1,now=Date.now();
    const result=db.prepare('UPDATE rooms SET owner_id=?,version=?,status=?,payload=?,updated_at=? WHERE code=? AND version=?').run(room.owner_id,version,room.status,JSON.stringify(room.payload),now,room.code,room.version);
    requireThat(result.changes===1,409,'房间状态已经更新，请刷新后重试');room.version=version;room.updated_at=now;
    if(room.payload.game&&(command.type==='start'||command.type==='action')){
      const state=JSON.stringify(room.payload.game),id=room.payload.gameId;
      db.prepare('INSERT INTO games(id,room_code,state,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at').run(id,room.code,state,now,now);
      db.prepare('INSERT INTO snapshots(game_id,room_version,state,command,created_at) VALUES(?,?,?,?,?)').run(id,version,state,JSON.stringify({actor,...command}),now);
    }
  }
  function removeRoomData(code){
    db.prepare('DELETE FROM snapshots WHERE game_id IN (SELECT id FROM games WHERE room_code=?)').run(code);
    db.prepare('DELETE FROM games WHERE room_code=?').run(code);
    db.prepare('DELETE FROM commands WHERE room_code=?').run(code);
    db.prepare('DELETE FROM rooms WHERE code=?').run(code);
  }
  function finishRoomDeletion(code){
    clearTimeout(botTimers.get(code));botTimers.delete(code);
    for(const client of clients)if(client.code===code){client.res.write('event: deleted\ndata: {}\n\n');client.res.end();}
    try{db.exec('PRAGMA incremental_vacuum; PRAGMA wal_checkpoint(TRUNCATE);');}
    catch(maintenanceError){console.error('Room deletion storage maintenance failed',maintenanceError);}
  }
  function revokeUser(userId){
    for(const client of clients)if(client.userId===userId){client.res.write('event: revoked\ndata: {}\n\n');client.res.end();}
  }
  function requireCurrentSession(req,expected){
    const user=session(req);requireThat(user&&user.id===expected.id&&user.role===expected.role,401,'登录状态已失效，请重新登录');
  }
  function pendingBot(room) {
    const game = room.payload.game;
    if (room.status !== 'playing' || !game || game.winner || room.payload.botError
        || !room.payload.members.some(player => player.bot)) return null;
    const actorId = game.effects.frames[0]?.playerId || game.players[game.turn].id;
    return room.payload.members.find(player => player.userId === actorId && player.bot);
  }
  function scheduleBot(code) {
    if (closing || botTimers.has(code)) return;
    const row = db.prepare('SELECT * FROM rooms WHERE code=?').get(code);
    if (!row) return;
    const room = { ...row, payload: JSON.parse(row.payload) };
    if (!pendingBot(room)) return;
    const timer = setTimeout(() => {
      botTimers.delete(code);
      if (closing) return;
      try {
        transaction(() => {
          const current = getRoom(code);
          const bot = pendingBot(current);
          if (!bot) return;
          const state = current.payload.game;
          const view = projectGame(state, bot.userId);
          const player = view.players.find(player => player.id === bot.userId);
          const actions = botCandidates(view, player, { developmentRound: 1 });
          let lastError;
          for (const action of actions) {
            let next;
            try { next = applyAction(state, bot.userId, action); }
            catch (failure) {
              if (failure.status !== 422) throw failure;
              lastError = failure;
              continue;
            }
            // Commit the validated result once, including its random outcomes.
            current.payload.game = next;
            if (next.winner) current.status = 'finished';
            persist(current, { type: 'action', action }, bot.userId);
            return;
          }
          throw lastError || new Error('No candidate action for test bot');
        });
      } catch (failure) {
        if (failure.status === 404) return;
        console.error('Test bot stopped', code, failure);
        transaction(() => {
          const current = getRoom(code);
          current.payload.botError = '人机暂时无法继续，请房主重试。';
          persist(current, { type: 'bot-error' }, current.owner_id);
        });
      }
      notify(code);
      scheduleBot(code);
    }, Math.max(0, botDelay));
    timer.unref();
    botTimers.set(code, timer);
  }
  async function route(req,res){
    res.startedAt=performance.now();
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const url=new URL(req.url,'http://local'),path=url.pathname,method=req.method;
    if(method==='GET'&&path==='/api/health')return json(res,200,{ok:true,ruleset:RULESET,rulesets:supportedRulesets()});
    if(method==='GET'&&!path.startsWith('/api/')){
      if(sceneResources.has(path)){
        const resource=sceneResources.get(path);
        const compressed=resource.gzip&&(req.headers['accept-encoding']||'').split(',').some(value=>{
          const [encoding,quality]=value.trim().split(';');
          return encoding==='gzip'&&(!quality||Number(quality.trim().slice(2))>0);
        });
        const content=compressed?resource.gzip:resource.content;
        res.writeHead(200,{'Content-Type':resource.type,'Content-Length':content.length,'Cache-Control':resource.immutable?'public, max-age=31536000, immutable':'no-cache','Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});
        return res.end(content);
      }
      if(artFiles.has(path)){
        const content=readFileSync(resolve(root,'frontend','.'+path));
        res.writeHead(200,{'Content-Type':'image/webp','Content-Length':content.length,'Cache-Control':'public, max-age=31536000, immutable'});
        return res.end(content);
      }
      const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/asset-manifest.json':['asset-manifest.json','application/json; charset=utf-8']};
      const a=assets[path];requireThat(a,404,'页面不存在');const raw=readFileSync(resolve(root,'frontend',a[0]));const compressed=/gzip/.test(req.headers['accept-encoding']||'');const content=compressed?gzipSync(raw):raw;res.writeHead(200,{'Content-Type':a[1],'Cache-Control':'no-cache','Content-Length':content.length,'Vary':'Accept-Encoding',...(compressed?{'Content-Encoding':'gzip'}:{})});return res.end(content);
    }
    requireThat(['GET','POST'].includes(method),405,'不支持的请求方法');
    const ip=req.socket.remoteAddress||'unknown';throttle(`all:${ip}`,300);
    if(method==='POST'){
      const expected=origin||`http://${req.headers.host}`;
      requireThat(!req.headers.origin||req.headers.origin===expected,403,'请求来源不匹配');
      requireThat(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']),403,'拒绝跨站请求');
    }
    if(method==='POST'&&['/api/auth/register','/api/auth/login'].includes(path)){
      throttle(`auth:${ip}`,20);const b=await body(req);requireThat(typeof b.username==='string'&&/^[a-zA-Z0-9_]{3,24}$/.test(b.username),422,'账号使用 3–24 位字母、数字或下划线');
      password(b.password);const username=b.username.toLowerCase();throttle(`account:${username}`,12);
      let user=db.prepare('SELECT * FROM users WHERE username=?').get(username);
      if(path.endsWith('/register')){
        requireThat(username!=='admin',403,'该账号由管理员配置');requireThat(!user,409,'该账号已存在');const hash=await hashPassword(b.password),id=randomUUID();
        try{db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,username,hash,Date.now());}catch(e){if(String(e.message).includes('UNIQUE'))throw error(409,'该账号已存在');throw e;}
        user={id,username};
      }else{const valid=await verifyPassword(b.password,user?.password_hash||await dummyHashPromise);requireThat(user&&valid,401,'账号或密码错误');}
      const access=db.prepare('SELECT role,disabled FROM account_access WHERE user_id=?').get(user.id);
      requireThat(!access?.disabled,403,'账号已被停用');
      if(path.endsWith('/login'))requireThat(db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id)?.password_hash===user.password_hash,401,'密码已更新，请重新登录');
      const t=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sha(t),user.id,Date.now()+7*86400000);
      return json(res,200,{user:{id:user.id,username:user.username,role:access?.role||'player'}},{'Set-Cookie':cookie(t,7*86400)});
    }
    const u=session(req);
    if(method==='GET'&&path==='/api/me')return json(res,200,{user:u?{id:u.id,username:u.username,role:u.role}:null,ruleset:RULESET,limitations:LIMITATIONS});
    requireThat(u,401,'请先登录');
    if(method==='POST'&&path==='/api/auth/logout'){await body(req);db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token(req)));for(const c of clients)if(token(c.req)===token(req))c.res.end();return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
    if(path.startsWith('/api/admin/')){
      requireThat(u.role==='admin',403,'需要管理员权限');
      if(method==='GET'&&path==='/api/admin/users'){
        const users=db.prepare("SELECT u.id,u.username,u.created_at,COALESCE(a.role,'player') role,COALESCE(a.disabled,0) disabled,(SELECT count(*) FROM sessions s WHERE s.user_id=u.id AND s.expires_at>?) sessions FROM users u LEFT JOIN account_access a ON a.user_id=u.id ORDER BY u.created_at").all(Date.now());
        return json(res,200,{users});
      }
      if(method==='GET'&&path==='/api/admin/rooms'){
        const rooms=db.prepare('SELECT * FROM rooms ORDER BY updated_at DESC').all().map(row=>{const payload=JSON.parse(row.payload);return {code:row.code,title:row.title,ownerId:row.owner_id,version:row.version,status:row.status,locked:!!(row.password_hash||payload.adminPrivate),hasPassword:!!row.password_hash,members:payload.members.map(m=>({name:m.name,faction:m.faction,bot:!!m.bot})),updatedAt:row.updated_at};});
        return json(res,200,{rooms});
      }
      const account=path.match(/^\/api\/admin\/users\/([a-f0-9-]+)\/(logout|password|disable|enable)$/);
      if(method==='POST'&&account){
        const [,id,operation]=account,b=await body(req);
        requireThat(db.prepare('SELECT id FROM users WHERE id=?').get(id),404,'账号不存在');
        requireThat(operation!=='disable'||id!==u.id,422,'不能停用当前管理员');
        const hash=operation==='password'?await hashPassword(password(b.password)):null;
        transaction(()=>{
          requireCurrentSession(req,u);
          if(operation==='password')db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,id);
          if(operation==='disable'||operation==='enable')db.prepare("INSERT INTO account_access(user_id,disabled) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET disabled=excluded.disabled").run(id,Number(operation==='disable'));
          if(operation!=='enable')db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
        });
        if(operation!=='enable')revokeUser(id);
        return json(res,200,{ok:true});
      }
      const roomPath=path.match(/^\/api\/admin\/rooms\/(\d{6})\/(access|delete)$/);
      if(method==='POST'&&roomPath){
        const [,code,operation]=roomPath,b=await body(req);
        requireThat(Number.isInteger(b.version)&&b.version>=0,422,'缺少状态版本');
        if(operation==='access')requireThat(['public','private'].includes(b.visibility),422,'请选择公开或私密');
        const pw=operation==='access'?password(b.password??'',true):'';
        const hash=pw?await hashPassword(pw):null;
        transaction(()=>{
          requireCurrentSession(req,u);const room=getRoom(code);requireThat(room.version===b.version,409,'房间内容已更新，请刷新后重试');
          if(operation==='delete')removeRoomData(code);
          else{
            room.payload.adminPrivate=b.visibility==='private';
            const nextHash=b.visibility==='public'?null:hash||room.password_hash;
            db.prepare('UPDATE rooms SET password_hash=? WHERE code=?').run(nextHash,code);
            persist(room,{type:'admin-access'},u.id);
          }
        });
        if(operation==='delete')finishRoomDeletion(code);else notify(code);
        return json(res,200,{ok:true});
      }
      throw error(404,'管理接口不存在');
    }
    requireThat(u.role!=='admin',403,'管理员账号仅可进行管理操作');
    if(method==='GET'&&path==='/api/tutorials'){
      const runs=new Map(db.prepare('SELECT lesson_id,version,payload FROM tutorial_runs WHERE user_id=?').all(u.id).map(row=>[row.lesson_id,JSON.parse(row.payload)]));
      return json(res,200,{lessons:tutorialCatalog().map(lesson=>{const run=runs.get(lesson.id);return {...lesson,started:!!run,step:run?.step??0,completed:!!(run?.completed||run?.everCompleted)};})});
    }
    const tutorialPath=path.match(/^\/api\/tutorials\/([a-z-]+)(?:\/(start|command))?$/);
    if(tutorialPath){
      const [,lessonId,operation]=tutorialPath;lessonById(lessonId);
      const read=()=>db.prepare('SELECT * FROM tutorial_runs WHERE user_id=? AND lesson_id=?').get(u.id,lessonId);
      if(method==='GET'&&!operation){const row=read();requireThat(row,404,'尚未开始本章教程');return json(res,200,{room:projectTutorial(JSON.parse(row.payload),row.version)});}
      if(method==='POST'&&operation==='start'){
        await body(req);
        const row=transaction(()=>{requireCurrentSession(req,u);const existing=read();if(existing)return existing;
          const run=createTutorial(u,lessonId);db.prepare('INSERT INTO tutorial_runs VALUES(?,?,?,?,?)').run(u.id,lessonId,0,JSON.stringify(run),Date.now());return read();});
        return json(res,200,{room:projectTutorial(JSON.parse(row.payload),row.version)});
      }
      if(method==='POST'&&operation==='command'){
        const b=await body(req);
        requireThat(Number.isInteger(b.version)&&typeof b.runId==='string'&&typeof b.commandId==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(b.commandId),422,'教程操作缺少版本或唯一标识');
        requireThat(b.command&&typeof b.command==='object'&&!Array.isArray(b.command),422,'缺少教程操作');
        const hash=sha(JSON.stringify({runId:b.runId,command:b.command}));
        const row=transaction(()=>{
          requireCurrentSession(req,u);const current=read();requireThat(current,404,'尚未开始本章教程');const run=JSON.parse(current.payload);
          const previous=run.receipts.find(receipt=>receipt.id===b.commandId);
          if(previous){requireThat(previous.hash===hash,409,'同一操作标识不能用于不同操作');return current;}
          requireThat(current.version===b.version&&run.id===b.runId,409,'教程进度已更新，请重试');
          const next=advanceTutorial(run,b.command);next.receipts=[...run.receipts,{id:b.commandId,hash}].slice(-24);
          db.prepare('UPDATE tutorial_runs SET version=?,payload=?,updated_at=? WHERE user_id=? AND lesson_id=?').run(current.version+1,JSON.stringify(next),Date.now(),u.id,lessonId);return read();
        });
        return json(res,200,{room:projectTutorial(JSON.parse(row.payload),row.version)});
      }
      throw error(404,'教程接口不存在');
    }
    if(method==='GET'&&path==='/api/rooms')return json(res,200,{rooms:allRooms(u.id)});
    if(method==='GET'&&path==='/api/games'){
      const games=db.prepare('SELECT id,room_code,state,updated_at FROM games ORDER BY updated_at DESC LIMIT 500').all().flatMap(g=>{const s=JSON.parse(g.state);if(!s.players.some(p=>p.id===u.id))return [];return [{id:g.id,roomCode:g.room_code,updatedAt:g.updated_at,round:s.round,winner:s.winner,players:s.players.map(p=>({id:p.id,name:p.name,score:p.score})),ruleset:s.ruleset}];});return json(res,200,{games});
    }
    const gameMatch=path.match(/^\/api\/games\/([a-f0-9-]+)$/);
    if(method==='GET'&&gameMatch){const row=db.prepare('SELECT state FROM games WHERE id=?').get(gameMatch[1]);requireThat(row,404,'对局不存在');const g=JSON.parse(row.state);requireThat(g.players.some(p=>p.id===u.id),403,'无权读取该对局');return json(res,200,{game:projectGame(g,u.id)});}
    if(method==='POST'&&path==='/api/rooms'){
      throttle(`create:${u.id}`,10);const b=await body(req),name=nameOf(b.name),title=nameOf(b.title||'林间小聚'),pw=password(b.password??'',true);
      const capacity=b.capacity??2;requireThat([2,3,4].includes(capacity),422,'房间人数应为二至四人');
      const hash=pw?await hashPassword(pw):null;
      const room=transaction(()=>{requireCurrentSession(req,u);requireThat(db.prepare("SELECT count(*) n FROM rooms WHERE owner_id=? AND status!='closed'").get(u.id).n<10,422,'最多同时拥有 10 个房间');let code;do{code=String(randomInt(100000,1000000));}while(db.prepare('SELECT 1 FROM rooms WHERE code=?').get(code));
        const payload={capacity,members:[{userId:u.id,name,faction:'cat',ready:false}],game:null,gameId:null};db.prepare('INSERT INTO rooms VALUES(?,?,?,?,?,?,?,?)').run(code,u.id,title,hash,0,'waiting',JSON.stringify(payload),Date.now());return getRoom(code);});
      return json(res,201,{room:roomView(room,u.id)});
    }
    const m=path.match(/^\/api\/rooms\/(\d{6})(?:\/(join|events|command|delete))?$/);requireThat(m,404,'接口不存在');const [,code,operation]=m;
    if(method==='POST'&&operation==='delete'){
      const b=await body(req);
      requireThat(Number.isInteger(b.version)&&b.version>=0,422,'缺少状态版本');
      transaction(()=>{
        requireCurrentSession(req,u);const room=getRoom(code);
        requireThat(room.owner_id===u.id,403,'只有房主可以删除房间');
        requireThat(room.version===b.version,409,'房间内容已更新，请重新确认后删除');
        removeRoomData(code);
      });
      finishRoomDeletion(code);
      return json(res,200,{deleted:true});
    }
    if(method==='POST'&&operation==='join'){
      throttle(`join:${u.id}`,20);const b=await body(req),name=nameOf(b.name),pw=password(b.password??'',true);const initial=getRoom(code);
      if(!member(initial,u.id)){
        requireThat(!initial.payload.adminPrivate||initial.password_hash,403,'该私密房间仅限现有成员');
        if(initial.password_hash)requireThat(await verifyPassword(pw,initial.password_hash),403,'房间密码错误');
      }
      const room=transaction(()=>{const r=getRoom(code);requireCurrentSession(req,u);requireThat(r.password_hash===initial.password_hash&&!!r.payload.adminPrivate===!!initial.payload.adminPrivate,409,'房间访问设置已更新，请重试');if(member(r,u.id))return r;requireThat(r.status==='waiting'&&r.payload.members.length<(r.payload.capacity||2),409,'房间已满或对局已经开始');requireThat(!r.payload.members.some(p=>p.name===name),409,'本房间已有同名玩家');
        const factions=(r.payload.capacity||2)>2?['cat','bird','alliance','vagabond']:['cat','bird'];const faction=factions.find(faction=>!r.payload.members.some(player=>player.faction===faction))||factions[0];r.payload.members.push({userId:u.id,name,faction,ready:false});persist(r,{type:'join'},u.id);return r;});notify(code);return json(res,200,{room:roomView(room,u.id)});
    }
    const r=getRoom(code);requireThat(member(r,u.id),403,'你不在这个房间');
    if(method==='GET'&&!operation)return json(res,200,{room:roomView(r,u.id)});
    if(method==='GET'&&operation==='events'){
      requireThat([...clients].filter(c=>c.userId===u.id).length<8,429,'已打开过多房间连接');res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 2500\ndata: ${JSON.stringify(roomView(r,u.id))}\n\n`);
      const client={req,res,userId:u.id,code};clients.add(client);res.on('close',()=>clients.delete(client));return;
    }
    if(method==='POST'&&operation==='command'){
      const b=await body(req);requireThat(typeof b.commandId==='string'&&/^[a-zA-Z0-9-]{8,80}$/.test(b.commandId),422,'操作必须带有唯一标识');requireThat(Number.isInteger(b.version)&&b.version>=0,422,'缺少状态版本');
      requireThat(b.command&&typeof b.command==='object'&&!Array.isArray(b.command),422,'缺少操作');const hash=sha(JSON.stringify(b.command));
      const room=transaction(()=>{requireCurrentSession(req,u);const r=getRoom(code);const me=member(r,u.id);requireThat(me,403,'你不在这个房间');const previous=db.prepare('SELECT body_hash FROM commands WHERE room_code=? AND user_id=? AND command_id=?').get(code,u.id,b.commandId);
        if(previous){requireThat(previous.body_hash===hash,409,'同一操作标识不能用于不同操作');return r;}
        requireThat(r.version===b.version,409,'房间状态已改变，已刷新，请重新操作');const c=b.command;
        if(c.type==='profile'){
          requireThat(r.status==='waiting',409,'开始后不能修改本局玩家资料');const name=nameOf(c.name);requireThat(!r.payload.members.some(p=>p.userId!==u.id&&p.name===name),409,'本房间已有同名玩家');
          requireThat(((r.payload.capacity||2)>2?['cat','bird','alliance','vagabond']:['cat','bird']).includes(c.faction),422,'该房间人数未开放此阵营');me.name=name;me.faction=c.faction;me.ready=false;
        }else if(c.type==='bot-add'){
          requireThat(r.owner_id===u.id,403,'只有房主可以添加人机');
          requireThat(r.status==='waiting',409,'开始后不能添加人机');
          requireThat(r.payload.members.length<(r.payload.capacity||2),409,'房间已满');
          const factions=(r.payload.capacity||2)>2?['cat','bird','alliance','vagabond']:['cat','bird'];
          requireThat(factions.includes(c.faction),422,'该房间未开放此阵营');
          requireThat(!r.payload.members.some(player=>player.ready&&player.faction===c.faction),409,'该阵营已有玩家准备，请选择其他阵营');
          const label={cat:'猫咪',bird:'飞鹰',alliance:'联盟',vagabond:'游侠'}[c.faction];
          const name=nameOf(c.name||`人机·${label}`);
          requireThat(!r.payload.members.some(player=>player.name===name),409,'本房间已有同名玩家');
          r.payload.members.push({userId:`bot-${randomUUID()}`,name,faction:c.faction,ready:true,bot:true});
        }else if(c.type==='bot-remove'){
          requireThat(r.owner_id===u.id,403,'只有房主可以移除人机');
          requireThat(r.status==='waiting',409,'开始后不能移除人机');
          requireThat(r.payload.members.some(player=>player.userId===c.userId&&player.bot),422,'请选择人机席位');
          r.payload.members=r.payload.members.filter(player=>player.userId!==c.userId);
        }else if(c.type==='bot-retry'){
          requireThat(r.owner_id===u.id,403,'只有房主可以重试人机');
          requireThat(r.status==='playing'&&r.payload.botError,409,'当前没有等待重试的人机');
          r.payload.botError=null;
        }else if(c.type==='ready'){requireThat(r.status==='waiting',409,'对局已开始');requireThat(typeof c.ready==='boolean',422,'准备状态错误');if(c.ready)requireThat(!r.payload.members.some(player=>player.userId!==u.id&&player.ready&&player.faction===me.faction),409,'该阵营已有玩家准备，请选择其他阵营');me.ready=c.ready;}
        else if(c.type==='start'){
          requireThat(r.owner_id===u.id,403,'只有房主可以开始');requireThat(r.status==='waiting'&&r.payload.members.length>=2&&r.payload.members.every(m=>m.ready),409,'至少两位玩家，且全部准备');
          requireThat(new Set(r.payload.members.map(player=>player.faction)).size===r.payload.members.length,409,'阵营重复，请重新选择并准备');
          requireThat(c.ruleset==='root-base-four-v5'||r.payload.members.length===2,422,'三至四人请选择基础四阵营规则');
          requireThat(!r.payload.members.some(player=>player.bot)||c.ruleset==='root-base-four-v5',422,'人机对局请选择基础四阵营模式');
          requireThat(supportedRulesets().includes(c.ruleset),422,'不支持所选游戏模式');r.payload.game=createGame(r.payload.members,undefined,c.ruleset);r.payload.gameId=randomUUID();r.status='playing';
        }else if(c.type==='action'){
          requireThat(r.status==='playing'&&r.payload.game,409,'没有进行中的对局');r.payload.game=applyAction(r.payload.game,u.id,c.action);if(r.payload.game.winner)r.status='finished';
        }else if(c.type==='new-game'){
          requireThat(r.owner_id===u.id,403,'只有房主可以新建下一局');requireThat(r.status==='finished',409,'请先完成当前对局');r.payload.game=null;r.payload.gameId=null;r.payload.botError=null;r.payload.members.forEach(m=>m.ready=!!m.bot);r.status='waiting';
        }else if(c.type==='resign'){
          requireThat(r.status==='playing',409,'没有进行中的对局');requireThat(r.payload.game.players.length===2,409,'多人局请由房主删除房间结束');r.payload.game.winner=r.payload.game.players.find(p=>p.id!==u.id).id;r.payload.game.phase='finished';r.payload.game.log.push(`${me.name} 认输`);if(Array.isArray(r.payload.game.logTurns))r.payload.game.logTurns.push((r.payload.game.turnsCompleted??0)+1);r.status='finished';
          // Resignation is a state-changing game action and receives a snapshot.
          persist(r,{type:'action',action:{type:'resign'}},u.id);
        }else if(c.type==='leave'){
          requireThat(r.status!=='playing',409,'请先完成对局或认输，再离开房间');r.payload.members=r.payload.members.filter(m=>m.userId!==u.id);const humans=r.payload.members.filter(player=>!player.bot);if(!humans.length)r.status='closed';else if(r.owner_id===u.id)r.owner_id=humans[0].userId;
        }else throw error(422,'未知房间操作');
        if(c.type!=='resign')persist(r,c,u.id);
        db.prepare('INSERT INTO commands VALUES(?,?,?,?,?,?)').run(code,u.id,b.commandId,hash,r.version,Date.now());return r;});notify(code);scheduleBot(code);
      return json(res,200,{room:member(room,u.id)?roomView(room,u.id):null});
    }
    throw error(404,'接口不存在');
  }
  const server=http.createServer((req,res)=>route(req,res).catch(e=>{if(res.headersSent){res.end();return;}if(!e.status)console.error(e);json(res,e.status||500,{error:e.status?e.message:'服务器内部错误'});}));
  server.requestTimeout=15000;server.headersTimeout=10000;
  const interval=setInterval(()=>{if(closing)return;const now=Date.now();for(const [k,b] of buckets)if(b.until<now)buckets.delete(k);db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);for(const c of clients){if(!session(c.req))c.res.end();else c.res.write(': heartbeat\n\n');}},15000);interval.unref();
  for(const room of db.prepare("SELECT code FROM rooms WHERE status='playing'").all())scheduleBot(room.code);
  return {server,db,close:async()=>{closing=true;clearInterval(interval);for(const timer of botTimers.values())clearTimeout(timer);botTimers.clear();for(const c of clients)c.res.end();await new Promise(resolve=>server.close(resolve));db.close();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createApp(),port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  app.server.listen(port,host,()=>console.log(`Woodland rooms ready: http://${host}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
