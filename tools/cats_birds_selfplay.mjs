// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createApp } from '../backend/server.mjs';
import * as rules from '../backend/rules/versions/cats-birds.mjs';

import { catBirdCandidates as candidates } from '../backend/bots/test-policy.mjs';
export { candidates };

export function choiceOption(q,seed) {
  if(q.kind==='setup-keep')return q.options[seed%q.options.length];
  if(q.kind==='setup-leader')return q.options.find(o=>o.id==='commander');
  if(q.kind==='cardboard')return q.options.find(o=>o.id==='wood')||q.options.find(o=>o.id!=='keep')||q.options[0];
  if(q.kind==='setup-building')return q.options[(seed>>>2)%q.options.length];
  return q.options.find(o=>o.id!=='pass')||q.options[0];
}
export function invariants(s) {
  assert.equal(s.players.length,2);
  for(const faction of ['cat','bird']){
    const n=s.board.reduce((sum,c)=>sum+c.warriors[faction],0);
    assert.ok(n>=0&&n<=(faction==='cat'?25:20));
  }
  assert.ok(s.board.every(c=>c.buildings.length+c.ruins<=c.slots&&c.wood>=0&&Object.values(c.warriors).every(n=>Number.isInteger(n)&&n>=0)));
  assert.ok(s.board.reduce((sum,c)=>sum+c.wood,0)<=8);
  assert.ok(s.board.filter(c=>c.keep).length<=1);
  const cards=[...s.deck,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.crafted]),...Object.values(s.bird.decree).flat().filter(c=>!c.vizier),...(s.combat?.ambushCard?[s.combat.ambushCard]:[])];
  assert.equal(cards.length,50,'physical card conservation');
  assert.equal(new Set(cards.map(c=>c.id)).size,50,'unique physical card IDs');
  for(const [item,supply] of Object.entries(s.itemSupply)){
    const total=supply+s.players.reduce((n,p)=>n+p.items.filter(i=>i===item).length,0);
    assert.equal(total,['hammer','crossbow'].includes(item)?1:2);
  }
}
export async function run({games=12,http=false}={}) {
  const report={ruleset:rules.RULESET,transport:http?'HTTP/SQLite':'engine',games:[],restarts:0};
  let app,base,directory;
  async function start(){app=createApp({dbPath:join(directory,'qa.sqlite'),rateLimit:false});await new Promise(done=>app.server.listen(0,'127.0.0.1',done));base=`http://127.0.0.1:${app.server.address().port}`;}
  async function request(user,path,data){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(user.cookie?{Cookie:user.cookie}:{}),...(data===undefined?{}:{'Content-Type':'application/json',Origin:base})},body:data===undefined?undefined:JSON.stringify(data)});const cookie=r.headers.get('set-cookie');if(cookie)user.cookie=cookie.split(';')[0];return {status:r.status,body:await r.json()};}
  if(http){directory=mkdtempSync(join(tmpdir(),'root-v4-selfplay-'));await start();}
  try{
    for(let seed=1;seed<=games;seed++){
      let randomSeed=seed;
      const rng=max=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed%max;};
      const users=[{id:'a',faction:'cat'},{id:'b',faction:'bird'}];
      let s,room,steps=0;
      if(http){
        for(const [i,u] of users.entries()){const r=await request(u,'/api/auth/register',{username:`qa_${seed}_${i}`,password:'isolated-qa-only-123'});assert.equal(r.status,200);u.id=r.body.user.id;}
        room=(await request(users[0],'/api/rooms',{name:'猫',password:''})).body.room;
        room=(await request(users[1],`/api/rooms/${room.code}/join`,{name:'鹰',password:''})).body.room;
        for(const u of users){const r=await request(u,`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command:{type:'ready',ready:true}});assert.equal(r.status,200);room=r.body.room;}
        const r=await request(users[0],`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command:{type:'start',ruleset:rules.RULESET}});assert.equal(r.status,200);room=r.body.room;
        s=JSON.parse(app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code).payload).game;
      }else s=rules.createGame(users.map(u=>({userId:u.id,name:u.faction,faction:u.faction})),rng);
      const counts={};
      while(!s.winner&&steps++<4000){
        invariants(s);
        const q=s.effects.frames[0];
        const user=users.find(u=>u.id===(q?.type==='choice'?q.playerId:s.players[s.turn].id));
        const view=http?(await request(user,`/api/rooms/${room.code}`)).body.room.game:rules.projectGame(s,user.id);
        const actions=q?.type==='choice'?[{type:'choice',choiceId:view.choice.choiceId,optionId:choiceOption(view.choice,seed).id}]:candidates(view,view.players.find(p=>p.id===user.id));
        let done=false;
        for(const action of actions){
          if(http){
            const body={version:room.version,commandId:randomUUID(),command:{type:'action',action}};
            const result=await request(user,`/api/rooms/${room.code}/command`,body);
            if(result.status===422)continue;
            assert.equal(result.status,200,JSON.stringify(result.body));room=result.body.room;
            if(steps%23===0){const replay=await request(user,`/api/rooms/${room.code}/command`,body);assert.equal(replay.status,200);assert.equal(replay.body.room.version,room.version);}
            s=JSON.parse(app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code).payload).game;
          }else{
            const savedSeed=randomSeed;
            try{s=rules.applyAction(s,user.id,action,rng);}catch(e){randomSeed=savedSeed;if(e.status===422)continue;throw e;}
          }
          counts[action.type]=(counts[action.type]||0)+1;done=true;break;
        }
        assert.ok(done,`stuck seed=${seed} step=${steps} phase=${s.phase} column=${view.currentDecreeColumn}`);
        if(steps%31===0){
          if(http){const before=structuredClone(s);await app.close();await start();const restored=(await request(user,`/api/rooms/${room.code}`));assert.equal(restored.status,200);s=JSON.parse(app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code).payload).game;assert.deepEqual(s,before);report.restarts++;}
          else s=JSON.parse(JSON.stringify(s));
        }
      }
      invariants(s);assert.ok(s.winner,`No natural victory seed=${seed} round=${s.round}`);assert.ok(s.round>10,`Long-game target seed=${seed}, round=${s.round}`);
      report.games.push({seed,winner:s.players.find(p=>p.id===s.winner).faction,round:s.round,turns:s.turnsCompleted,steps,scores:s.players.map(p=>({faction:p.faction,score:p.score})),actions:counts});
      console.log(JSON.stringify(report.games.at(-1)));
    }
  }finally{if(app)await app.close();if(directory){assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(directory.includes('root-v4-selfplay-'));rmSync(directory,{recursive:true,force:true});}}
  report.passed=true;
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const report=await run({games:Number(process.env.QA_GAMES||12),http:process.argv.includes('--http')});
  mkdirSync('audit/v4',{recursive:true});writeFileSync(`audit/v4/selfplay-${report.transport==='engine'?'engine':'http'}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(`Passed ${report.games.length} complete games, ${report.restarts} database restarts`);
}
