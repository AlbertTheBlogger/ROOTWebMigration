import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp, hashPassword } from '../backend/server.mjs';

async function harness(){
  const app=createApp({dbPath:':memory:',rateLimit:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=async(client,path,data)=>{
    const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(client.cookie?{cookie:client.cookie}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
    const cookie=response.headers.get('set-cookie');if(cookie)client.cookie=cookie.split(';')[0];
    return {status:response.status,body:await response.json()};
  };
  const admin={};const id=randomUUID();
  app.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,'admin',await hashPassword('test-admin-password'),Date.now());
  app.db.prepare("INSERT INTO account_access(user_id,role) VALUES(?,'admin')").run(id);
  assert.equal((await request(admin,'/api/auth/login',{username:'admin',password:'test-admin-password'})).body.user.role,'admin');
  const register=async username=>{const client={};const result=await request(client,'/api/auth/register',{username,password:'test-player-password'});assert.equal(result.status,200);client.id=result.body.user.id;return client;};
  return {app,base,admin,request,register};
}

test('admin access, account revocation and room management preserve game data',async t=>{
  const h=await harness();t.after(()=>h.app.close());
  const {app,admin,request}=h;
  const host=await h.register('hostadminqa'),guest=await h.register('guestadminqa'),outsider=await h.register('outsideradminqa');
  const create=await request(host,'/api/rooms',{name:'host',title:'managed room',capacity:4});let room=create.body.room;
  const get=async()=>{room=(await request(host,`/api/rooms/${room.code}`)).body.room;return room;};
  const command=async(client,command)=>{await get();const result=await request(client,`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command});assert.equal(result.status,200);room=result.body.room;};
  const access=async(visibility,password='')=>request(admin,`/api/admin/rooms/${room.code}/access`,{version:(await get()).version,visibility,password});
  await t.test('normal users cannot manage and admin cannot play',async()=>{
    assert.equal((await request(host,'/api/admin/users')).status,403);
    assert.equal((await request(host,`/api/admin/rooms/${room.code}/access`,{version:room.version,visibility:'private'})).status,403);
    for(const path of ['/api/rooms','/api/games',`/api/rooms/${room.code}`])assert.equal((await request(admin,path)).status,403);
    assert.equal((await request(admin,'/api/rooms',{name:'admin'})).status,403);
    assert.equal((await request(admin,`/api/rooms/${room.code}/join`,{name:'admin'})).status,403);
    assert.equal((await request({},'/api/auth/register',{username:'ADMIN',password:'other-password'})).status,403);
    const users=(await request(admin,'/api/admin/users')).body.users;
    assert.ok(users.every(user=>!('password_hash' in user)));
  });
  await t.test('private without password limits entry; password and public changes work',async()=>{
    assert.equal((await access('private')).status,200);assert.equal((await get()).locked,true);
    assert.ok(!(await request(outsider,'/api/rooms')).body.rooms.some(r=>r.code===room.code));
    assert.equal((await request(guest,`/api/rooms/${room.code}/join`,{name:'guest'})).status,403);
    assert.equal((await access('private','room-secret')).status,200);
    assert.equal((await request(guest,`/api/rooms/${room.code}/join`,{name:'guest',password:'incorrect'})).status,403);
    assert.equal((await request(guest,`/api/rooms/${room.code}/join`,{name:'guest',password:'room-secret'})).status,200);
    assert.equal((await access('public')).status,200);
    assert.equal((await get()).locked,false);
    assert.ok((await request(outsider,'/api/rooms')).body.rooms.some(r=>r.code===room.code));
  });
  await command(host,{type:'ready',ready:true});await command(guest,{type:'ready',ready:true});await command(host,{type:'start',ruleset:'root-base-four-v5'});
  const saved=app.db.prepare('SELECT state FROM games WHERE room_code=?').get(room.code).state;
  await t.test('forced logout closes SSE and reset password revokes old sessions',async()=>{
    const controller=new AbortController();
    const response=await fetch(h.base+`/api/rooms/${room.code}/events`,{headers:{cookie:host.cookie},signal:controller.signal});
    const reader=response.body.getReader();await reader.read();
    const old=host.cookie;
    assert.equal((await request(admin,`/api/admin/users/${host.id}/logout`,{})).status,200);
    const event=await reader.read();assert.match(new TextDecoder().decode(event.value),/revoked/);controller.abort();
    assert.equal((await request({cookie:old},'/api/rooms')).status,401);
    await request(host,'/api/auth/login',{username:'hostadminqa',password:'test-player-password'});
    assert.equal((await request(admin,`/api/admin/users/${host.id}/password`,{password:'changed-player-password'})).status,200);
    assert.equal((await request(host,'/api/rooms')).status,401);
    assert.equal((await request(host,'/api/auth/login',{username:'hostadminqa',password:'test-player-password'})).status,401);
    assert.equal((await request(host,'/api/auth/login',{username:'hostadminqa',password:'changed-player-password'})).status,200);
  });
  await t.test('disable and enable control login and active game remains intact',async()=>{
    assert.equal((await request(admin,`/api/admin/users/${guest.id}/disable`,{})).status,200);
    assert.equal((await request(guest,'/api/rooms')).status,401);
    assert.equal((await request(guest,'/api/auth/login',{username:'guestadminqa',password:'test-player-password'})).status,403);
    assert.equal((await request(admin,`/api/admin/users/${guest.id}/enable`,{})).status,200);
    assert.equal((await request(guest,'/api/auth/login',{username:'guestadminqa',password:'test-player-password'})).status,200);
    assert.equal(app.db.prepare('SELECT state FROM games WHERE room_code=?').get(room.code).state,saved);
    assert.equal((await access('private','new-room-secret')).status,200);
    assert.equal(app.db.prepare('SELECT state FROM games WHERE room_code=?').get(room.code).state,saved);
  });
  await t.test('version conflicts protect concurrent state and deletion removes dependent saves',async()=>{
    const stale=(await get()).version;await access('public');
    assert.equal((await request(admin,`/api/admin/rooms/${room.code}/delete`,{version:stale})).status,409);
    assert.equal((await request(admin,`/api/admin/rooms/${room.code}/delete`,{version:(await get()).version})).status,200);
    for(const table of ['rooms','games','snapshots','commands'])assert.equal(app.db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
    assert.equal((await request(host,`/api/rooms/${room.code}`)).status,404);
  });
});
