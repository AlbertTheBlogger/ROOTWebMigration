// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../backend/server.mjs';

async function harness(t){
 const folder=mkdtempSync(join(tmpdir(),'woodland-seats-'));let app,base;
 async function start(){app=createApp({dbPath:join(folder,'qa.sqlite'),rateLimit:false,botDelay:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
 await start();t.after(async()=>{await app.close();rmSync(folder,{recursive:true,force:true});});
 async function request(user,path,data){const res=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{cookie:user.cookie||'','Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});if(res.headers.get('set-cookie'))user.cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,...await res.json()};}
 async function register(name){const user={};const result=await request(user,'/api/auth/register',{username:name,password:'local-seat-test-password'});assert.equal(result.status,200);user.id=result.user.id;return user;}
 return {get app(){return app;},request,register,command:(user,room,command,id=randomUUID())=>request(user,`/api/rooms/${room.code}/command`,{version:room.version,commandId:id,command}),restart:async()=>{await app.close();await start();}};
}

test('new rooms default to four stable seats and five factions; bots target empty seats and are host controlled',async t=>{
 const h=await harness(t),host=await h.register('seat_host'),guest=await h.register('seat_guest');
 let room=(await h.request(host,'/api/rooms',{name:'Host'})).room;
 assert.equal(room.capacity,4);assert.equal(room.ruleset,'root-lizard-cult-v6');assert.equal(room.availableFactions.length,5);assert.equal(room.members[0].seat,0);
 room=(await h.request(guest,`/api/rooms/${room.code}/join`,{name:'Guest'})).room;
 assert.equal(room.members[1].seat,1);
 const id=randomUUID(),before=room;
 room=(await h.command(host,room,{type:'bot-add',seat:3},id)).room;
 const bot=room.members.find(p=>p.bot);assert.equal(bot.seat,3);assert.equal(bot.faction,'alliance');
 assert.equal((await h.command(host,before,{type:'bot-add',seat:3},id)).room.version,room.version);
 assert.equal((await h.command(host,room,{type:'bot-add',seat:3})).status,409);
 for(const seat of [-1,4,'2'])assert.equal((await h.command(host,room,{type:'bot-add',seat})).status,422);
 assert.equal((await h.command(guest,room,{type:'bot-profile',userId:bot.userId,faction:'lizard'})).status,403);
 assert.equal((await h.command(host,room,{type:'bot-profile',userId:guest.id,faction:'lizard'})).status,422);
 room=(await h.command(host,room,{type:'bot-profile',userId:bot.userId,faction:'lizard'})).room;
 assert.equal(room.members.find(p=>p.bot).faction,'lizard');assert.equal(room.members.find(p=>p.bot).seat,3);
 const saved=room;await h.restart();assert.deepEqual((await h.request(host,`/api/rooms/${room.code}`)).room,saved);
 assert.equal(h.app.db.prepare('select count(*) n from users').get().n,2);
});

test('ready atomically commits name and faction; conflicts roll back all fields and concurrent reservations serialize',async t=>{
 const h=await harness(t),host=await h.register('identity_host'),guest=await h.register('identity_guest');
 let room=(await h.request(host,'/api/rooms',{name:'Host'})).room;
 room=(await h.request(guest,`/api/rooms/${room.code}/join`,{name:'Guest'})).room;
 room=(await h.command(guest,room,{type:'ready',ready:true,name:'Guest new',faction:'cat'})).room;
 const before=room;
 assert.equal((await h.command(host,room,{type:'ready',ready:true,name:'Host new',faction:'cat'})).status,409);
 assert.deepEqual((await h.request(host,`/api/rooms/${room.code}`)).room,before);
 assert.equal((await h.command(host,room,{type:'ready',ready:true,name:'Guest new',faction:'lizard'})).status,409);
 const id=randomUUID(),command={type:'ready',ready:true,name:'Host new',faction:'lizard'};
 room=(await h.command(host,room,command,id)).room;
 assert.equal(room.members[0].name,'Host new');assert.equal(room.members[0].faction,'lizard');assert.equal(room.members[0].ready,true);
 assert.equal((await h.command(host,before,command,id)).room.version,room.version);
 assert.equal((await h.command(host,room,{...command,faction:'bird'})).status,409);
 room=(await h.command(host,room,{type:'bot-add',seat:3,faction:'bird'})).room;
 assert.equal((await h.command(host,room,{type:'bot-profile',userId:room.members.find(p=>p.bot).userId,faction:'cat'})).status,409);
 room=(await h.command(host,room,{type:'ready',ready:false})).room;
 room=(await h.command(guest,room,{type:'ready',ready:false})).room;
 const concurrent=await Promise.all([h.command(host,room,{type:'ready',ready:true,name:'Host race',faction:'alliance'}),h.command(guest,room,{type:'ready',ready:true,name:'Guest race',faction:'alliance'})]);
 assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 room=(await h.request(host,`/api/rooms/${room.code}`)).room;
 const loser=room.members.find(p=>!p.bot&&!p.ready);
 assert.equal((await h.command(loser.userId===host.id?host:guest,room,{type:'ready',ready:true,name:'Retry name',faction:'alliance'})).status,409);
});

test('leaving and rejoining fill holes without moving others, and starting retains those participants',async t=>{
 const h=await harness(t),a=await h.register('holes_a'),b=await h.register('holes_b'),c=await h.register('holes_c');
 let room=(await h.request(a,'/api/rooms',{name:'A'})).room;
 room=(await h.request(b,`/api/rooms/${room.code}/join`,{name:'B',seat:2})).room;
 room=(await h.command(a,room,{type:'bot-add',seat:3})).room;
 room=(await h.request(c,`/api/rooms/${room.code}/join`,{name:'C',seat:1})).room;
 assert.deepEqual(room.members.map(p=>p.seat),[0,2,3,1]);
 await h.command(a,room,{type:'leave'});
 room=(await h.request(b,`/api/rooms/${room.code}`)).room;assert.equal(room.ownerId,b.id);assert.equal(room.members.find(p=>p.userId===b.id).seat,2);
 room=(await h.request(a,`/api/rooms/${room.code}/join`,{name:'A again'})).room;assert.equal(room.members.find(p=>p.userId===a.id).seat,0);
 for(const user of [a,b,c])room=(await h.command(user,room,{type:'ready',ready:true})).room;
 const expected=[...room.members].sort((a,b)=>a.seat-b.seat).map(p=>p.userId);
 room=(await h.command(b,room,{type:'start',ruleset:room.ruleset})).room;
 assert.deepEqual(room.game.players.map(p=>p.id).sort(),expected.sort());
 assert.equal(room.members.find(p=>p.userId===b.id).seat,2);
 assert.equal((await h.command(b,room,{type:'bot-profile',userId:room.members.find(p=>p.bot).userId,faction:'lizard'})).status,409);
});

test('two and three participants can start four-seat rooms with holes; empty seats are not game players',async t=>{
 const h=await harness(t),a=await h.register('short_a'),b=await h.register('short_b'),c=await h.register('short_c');
 for(const count of [2,3]){
  let room=(await h.request(a,'/api/rooms',{name:'A'})).room;
  assert.equal((await h.command(a,room,{type:'start',ruleset:room.ruleset})).status,409);
  room=(await h.request(b,`/api/rooms/${room.code}/join`,{name:'B',seat:3})).room;
  if(count===3)room=(await h.request(c,`/api/rooms/${room.code}/join`,{name:'C',seat:1})).room;
  for(const user of [a,b,c].slice(0,count))room=(await h.command(user,room,{type:'ready',ready:true})).room;
  room=(await h.command(a,room,{type:'start',ruleset:room.ruleset})).room;
  assert.equal(room.capacity,4);assert.equal(room.game.players.length,count);assert.equal(room.status,'playing');
 }
});

test('legacy waiting rooms gain deterministic seat projections without read-time writes or capacity changes',async t=>{
 const h=await harness(t),host=await h.register('legacy_seat_host'),guest=await h.register('legacy_seat_guest');
 let room=(await h.request(host,'/api/rooms',{capacity:2,ruleset:'root-base-four-v5',name:'Host'})).room;
 room=(await h.request(guest,`/api/rooms/${room.code}/join`,{name:'Guest'})).room;
 const payload=JSON.parse(h.app.db.prepare('select payload from rooms where code=?').get(room.code).payload);
 payload.members.forEach(p=>delete p.seat);const legacy=JSON.stringify(payload);
 h.app.db.prepare('update rooms set payload=? where code=?').run(legacy,room.code);
 room=(await h.request(host,`/api/rooms/${room.code}`)).room;
 assert.deepEqual(room.members.map(p=>p.seat),[0,1]);assert.equal(room.capacity,2);assert.equal(room.ruleset,'root-base-four-v5');
 assert.equal(h.app.db.prepare('select payload from rooms where code=?').get(room.code).payload,legacy);
 await h.restart();assert.deepEqual((await h.request(host,`/api/rooms/${room.code}`)).room,room);
 room=(await h.command(host,room,{type:'ready',ready:true,name:'Host prepared',faction:'cat'})).room;
 assert.equal(JSON.parse(h.app.db.prepare('select payload from rooms where code=?').get(room.code).payload).members[0].seat,0);
});
