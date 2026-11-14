// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../backend/server.mjs';
import {updateHotseatControl} from '../backend/hotseat.mjs';
import * as rules from '../backend/rules/versions/registry.mjs';
async function harness(t){
 const folder=mkdtempSync(join(tmpdir(),'rf-complex-')),dbPath=join(folder,'isolated.sqlite');let app,base,room;
 async function start(){app=createApp({dbPath,rateLimit:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.server.address().port;}await start();
 t.after(async()=>{await app.close();rmSync(folder,{recursive:true,force:true});});
 const users=Array.from({length:3},(_,i)=>({controller:randomUUID(),phone:i===1}));
 async function req(u,path,data){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{cookie:u.cookie||'','Content-Type':'application/json','X-Woodland-Controller':u.controller,'X-Woodland-Companion':u.phone?'1':'0'},body:data===undefined?undefined:JSON.stringify(data)});if(r.headers.get('set-cookie'))u.cookie=r.headers.get('set-cookie').split(';')[0];return {status:r.status,body:await r.json()};}
 for(const [i,u] of users.entries()){const r=await req(u,'/api/auth/register',{username:'rf_complex_'+i,password:'isolated-password'});u.id=r.body.user.id;}
 room=(await req(users[0],'/api/rooms',{name:'RF complex',playMode:'hotseat',ruleset:'root-riverfolk-v7'})).body.room;
 async function cmd(u,command,commandId=randomUUID(),version=room.version){const r=await req(u,`/api/rooms/${room.code}/command`,{version,commandId,command});if(r.body.room)room=r.body.room;return r;}
 await cmd(users[0],{type:'local-add',seat:1});for(const [i,m] of room.members.entries())await cmd(users[0],{type:'local-profile',userId:m.userId,name:i?'Otter':'Cat',faction:i?'otter':'cat',ready:true});await cmd(users[0],{type:'start',ruleset:'root-riverfolk-v7'});
 async function get(u){const r=await req(u,`/api/rooms/${room.code}`);if(r.body.room)room=r.body.room;return r;}
 const seat=room.members[1].userId;
 function fixture(kind){const payload=JSON.parse(app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code).payload);let g=payload.game;while(!g.setup.complete){const q=g.effects.frames[0];g=rules.applyAction(g,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},n=>n-1);}g.turn=g.players.findIndex(p=>p.faction==='cat');g.phase='daylight';g.effects.frames=[];g.combat=null;g.actions=3;for(const c of g.board){for(const f in c.warriors)c.warriors[f]=0;c.buildings=[];c.keep=false;c.tradePost=null;}for(const p of g.players)g.deck.push(...p.hand.splice(0));g.riverfolk.payments=[];
 const add=(zone,n,faction='cat')=>{for(let i=0;i<n;i++)g.riverfolk[zone].push({id:'fund-'+(++g.riverfolk.nextFund),faction});};
 if(kind==='disruption'){add('funds',5);add('payments',1,'otter');add('committed',1);g.board[3].warriors.cat=3;g.board[3].tradePost={id:'post-rabbit-0',suit:'rabbit'};g.riverfolk.unlocked.rabbit=1;g=rules.applyAction(g,users[0].id,{type:'battle',clearing:3,defender:'otter'},n=>n===4?3:n-1);assert.equal(g.effects.frames[0].kind,'rf-disruption');}
 if(kind==='purchase'){g.phase='services';g.riverfolk.services={playerId:users[0].id,boats:false,mercenaries:false,purchased:0,limit:1};g.riverfolk.prices.cards=2;g.players.find(p=>p.faction==='otter').hand.push(g.deck.pop());}
 if(kind==='victory'){g.turn=g.players.findIndex(p=>p.faction==='otter');g.phase='birdsong';add('funds',6);add('payments',1,'otter');add('committed',1);g.board[3].tradePost={id:'post-rabbit-0',suit:'rabbit'};g.riverfolk.unlocked.rabbit=1;g.players.find(p=>p.faction==='otter').score=27;}
 payload.game=g;updateHotseatControl(payload);app.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(payload),room.code);app.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(g),room.gameId);return g;}
 return {get app(){return app;},get room(){return room;},users,seat,req,cmd,get,fixture,restart:async()=>{await app.close();await start();}};
}
const onlyPublic=r=>{assert.equal(r.viewerId,null);assert.ok(r.game.players.filter(p=>p.faction!=='otter').every(p=>!p.hand));assert.ok(!r.game.choice?.options);};
test('RF-C20 partial trade disruption survives real server restart, phone revocation and PC handoff',async t=>{
 const h=await harness(t),[host,phone,other]=h.users;
 assert.equal((await h.req(phone,`/api/rooms/${h.room.code}/companion`,{})).status,200);await h.get(phone);await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.get(host);await h.cmd(host,{type:'claim-approve',requestId:h.room.claimRequests[0].id});h.fixture('disruption');await h.get(phone);onlyPublic(h.room);
 assert.equal((await h.cmd(phone,{type:'mobile-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch})).status,200);let q=h.room.game.choice;assert.ok(q.options,JSON.stringify({q,viewer:h.room.viewerId,seat:h.seat,actor:h.room.hotseat.actor,companion:h.room.companion}));const returned=q.options[0].id;
 assert.equal((await h.cmd(phone,{type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:returned}})).status,200);assert.equal(h.room.game.riverfolk.funds.length,4);
 await h.restart();await h.get(phone);onlyPublic(h.room);await h.cmd(phone,{type:'mobile-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch});q=h.room.game.choice;assert.ok(!q.options.some(o=>o.id===returned));assert.match(q.prompt||q.title||JSON.stringify(q),/2/);
 const rogue={...host,controller:randomUUID()};await h.get(rogue);onlyPublic(h.room);assert.equal((await h.cmd(rogue,{type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:q.options[0].id}})).status,403);
 await h.get(host);await h.cmd(host,{type:'claim-release',seatId:h.seat});await h.get(phone);onlyPublic(h.room);assert.equal((await h.cmd(phone,{type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:q.options[0].id}})).status,403);
 await h.get(host);await h.cmd(host,{type:'hotseat-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch});for(let i=0;i<2;i++){q=h.room.game.choice;assert.equal(q.kind,'rf-disruption');assert.equal((await h.cmd(host,{type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:q.options[0].id}})).status,200);}
 assert.equal(h.room.game.riverfolk.funds.length,2);assert.equal(h.room.game.riverfolk.payments.length,1);assert.equal(h.room.game.riverfolk.committed.length,1);assert.equal(h.room.game.riverfolk.removed.length,1);await h.restart();await h.get(host);assert.equal(h.room.game.riverfolk.funds.length,2);
});
test('RF-C21 duplicate ID and stale purchase commands transfer one card and one payment only',async t=>{
 const h=await harness(t),[host]=h.users;const initial=h.fixture('purchase');await h.get(host);await h.cmd(host,{type:'hotseat-confirm',actorId:host.id,epoch:h.room.hotseat.epoch});const version=h.room.version,commandId=randomUUID(),card=initial.players.find(p=>p.faction==='otter').hand[0].id,command={type:'action',action:{type:'buy-service',service:'cards',card}};
 assert.equal((await h.cmd(host,command,commandId,version)).status,200);const updated=h.room.version;assert.equal((await h.cmd(host,command,commandId,version)).status,200);assert.equal(h.room.version,updated);
 const tab={...host,controller:randomUUID()};assert.equal((await h.cmd(tab,command,randomUUID(),version)).status,409);await h.get(host);assert.equal(h.room.game.riverfolk.payments.length,2);assert.equal(h.room.game.players.find(p=>p.faction==='cat').hand.filter(c=>c.id===card).length,1);assert.ok(!h.room.game.players.find(p=>p.faction==='otter').hand.some(c=>c.id===card));await h.restart();assert.equal((await h.cmd(host,command,commandId,version)).status,200);assert.equal(h.room.game.riverfolk.payments.length,2);assert.equal(h.app.db.prepare('SELECT count(*) AS n FROM commands WHERE command_id=?').get(commandId).n,1);
});
test('RF-C22 server startup persists winning automatic dividend once and stops before gather',async t=>{
 const h=await harness(t),[host]=h.users;h.fixture('victory');await h.restart();await h.get(host);assert.equal(h.room.game.winner,h.seat);assert.equal(h.room.game.riverfolk.funds.length,6);assert.equal(h.room.game.riverfolk.payments.length,1);assert.equal(h.room.game.riverfolk.committed.length,1);const saved=JSON.parse(h.app.db.prepare('SELECT state FROM games WHERE id=?').get(h.room.gameId).state);assert.equal(saved.winner,h.seat);assert.equal(saved.players.find(p=>p.faction==='otter').score,30);const snap=h.app.db.prepare('SELECT count(*) AS n FROM snapshots WHERE game_id=?').get(h.room.gameId).n;await h.restart();await h.get(host);assert.equal(h.app.db.prepare('SELECT count(*) AS n FROM snapshots WHERE game_id=?').get(h.room.gameId).n,snap);
});
