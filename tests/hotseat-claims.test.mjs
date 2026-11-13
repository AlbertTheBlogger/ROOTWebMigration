// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../backend/server.mjs';
import {applyAction} from '../backend/rules/versions/registry.mjs';

const publicOnly=room=>{assert.equal(room.viewerId,null);if(room.game){assert.ok(room.game.players.every(p=>!p.hand));assert.ok(!room.game.alliance.supporters);assert.ok(!room.game.choice?.options);}};
async function harness(t){
 const folder=mkdtempSync(join(tmpdir(),'hotseat-claims-'));let app,base;
 const start=async()=>{app=createApp({dbPath:join(folder,'test.sqlite'),rateLimit:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;};await start();
 t.after(async()=>{await app.close();rmSync(folder,{recursive:true,force:true});});
 const users=Array.from({length:3},(_,i)=>({controller:randomUUID(),phone:i>0}));
 const req=async(user,path,data)=>{const res=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{cookie:user.cookie||'','Content-Type':'application/json','X-Woodland-Controller':user.controller,'X-Woodland-Companion':user.phone?'1':'0'},body:data===undefined?undefined:JSON.stringify(data)});if(res.headers.get('set-cookie'))user.cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,body:await res.json()};};
 for(const [i,user] of users.entries()){const r=await req(user,'/api/auth/register',{username:'claim_user_'+i,password:'claims-only-password'});user.id=r.body.user.id;}
 let room=(await req(users[0],'/api/rooms',{name:'猫',playMode:'hotseat',password:'room-password'})).body.room;
 const cmd=async(user,c,id=randomUUID(),version=room.version)=>{const r=await req(user,`/api/rooms/${room.code}/command`,{commandId:id,version,command:c});if(r.status===200&&r.body.room)room=r.body.room;return r;};
 await cmd(users[0],{type:'local-add',seat:1});const seat=room.members[1].userId;
 for(const m of room.members)await cmd(users[0],{type:'local-profile',userId:m.userId,name:m.name,faction:m.faction,ready:true});
 return {get app(){return app;},get room(){return room;},users,seat,req,cmd,restart:async()=>{await app.close();await start();},get:async user=>{const r=await req(user,`/api/rooms/${room.code}`);if(r.status===200)room=r.body.room;return r;},join:async user=>{const r=await req(user,`/api/rooms/${room.code}/companion`,{password:'room-password'});if(r.status===200)room=r.body.room;return r;}};
}
test('account claims need host approval, preserve seats, reject conflicts and survive restart',async t=>{
 const h=await harness(t),[host,phone,other]=h.users;
 assert.equal((await h.req(phone,`/api/rooms/${h.room.code}/companion`,{password:'wrong'})).status,403);
 assert.equal((await h.join(phone)).status,200);publicOnly(h.room);
 await h.join(other);await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.cmd(other,{type:'claim-request',seatId:h.seat});
 publicOnly(h.room);assert.equal(h.room.claimRequests.length,0);
 await h.get(host);assert.equal(h.room.claimRequests.length,2);const request=h.room.claimRequests.find(q=>q.username==='claim_user_1');
 await h.cmd(host,{type:'claim-approve',requestId:request.id});assert.equal(h.room.members.length,2);
 await h.get(phone);assert.equal(h.room.companion.seatId,h.seat);publicOnly(h.room);
 assert.equal((await h.cmd(phone,{type:'claim-request',seatId:host.id})).status,409);
 assert.equal((await h.cmd(other,{type:'claim-request',seatId:h.seat})).status,409);
 for(const type of ['claim-approve','claim-release','local-add','hotseat-confirm','new-game'])assert.equal((await h.cmd(phone,{type,seatId:h.seat})).status,403);
 await h.restart();await h.get(phone);assert.equal(h.room.companion.seatId,h.seat);publicOnly(h.room);
 await h.get(host);await h.cmd(host,{type:'claim-release',seatId:h.seat});await h.get(phone);assert.equal(h.room.companion.seatId,null);publicOnly(h.room);
 await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.cmd(phone,{type:'claim-cancel'});await h.get(host);assert.equal(h.room.claimRequests.length,0);
});
test('bound phone only receives its own pending decision, release revokes it and PC can continue',async t=>{
 const h=await harness(t),[host,phone,other]=h.users;
 await h.join(phone);await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.get(host);
 await h.cmd(host,{type:'claim-approve',requestId:h.room.claimRequests[0].id});await h.cmd(host,{type:'start',ruleset:'root-base-four-v5'});
 // Explicit isolated battle fixture; the browser test does not inject game states.
 const payload=JSON.parse(h.app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(h.room.code).payload);let g=payload.game;
 while(!g.setup.complete){const q=g.effects.frames[0];g=applyAction(g,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},()=>0);}
 g.turn=g.players.findIndex(p=>p.id===host.id);g.phase='daylight';g.actions=3;g.effects.frames=[];
 for(const p of g.players)g.deck.push(...p.hand.splice(0));
 const defender=g.players.find(p=>p.id===h.seat),index=g.deck.findIndex(c=>c.kind==='ambush'&&c.suit==='wild');assert.ok(index>=0);defender.hand.push(...g.deck.splice(index,1));
 g.board[0].warriors.cat=3;g.board[0].warriors.bird=3;payload.game=g;payload.controlEpoch++;
 h.app.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(payload),h.room.code);h.app.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(g),h.room.gameId);
 await h.get(phone);publicOnly(h.room);assert.equal(h.room.companion.canDecide,false);assert.equal((await h.cmd(phone,{type:'mobile-confirm'})).status,403);
 await h.get(host);await h.cmd(host,{type:'hotseat-confirm',actorId:host.id,epoch:h.room.hotseat.epoch});await h.cmd(host,{type:'action',action:{type:'battle',clearing:0,defender:'bird'}});
 await h.get(phone);assert.equal(h.room.companion.canDecide,true);publicOnly(h.room);
 await h.cmd(phone,{type:'mobile-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch});assert.equal(h.room.viewerId,h.seat);assert.equal(h.room.game.choice.kind,'ambush');assert.ok(h.room.game.players.find(p=>p.id===h.seat).hand);
 await h.restart();await h.get(phone);publicOnly(h.room);assert.equal(h.room.companion.seatId,h.seat);assert.equal(h.room.companion.canDecide,true);
 await h.cmd(phone,{type:'mobile-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch});
 assert.ok(h.room.game.players.filter(p=>p.id!==h.seat).every(p=>!p.hand));
 assert.equal((await h.cmd(phone,{type:'action',action:{type:'end'}})).status,422);
 await h.join(other);publicOnly(h.room);
 await h.get(host);publicOnly(h.room);await h.cmd(host,{type:'claim-release',seatId:h.seat});
 await h.get(phone);publicOnly(h.room);assert.equal(h.room.companion.canDecide,false);assert.equal((await h.cmd(phone,{type:'action',action:{type:'choice'}})).status,403);
 await h.get(host);await h.cmd(host,{type:'hotseat-confirm',actorId:h.seat,epoch:h.room.hotseat.epoch});const q=h.room.game.choice;
 assert.equal((await h.cmd(host,{type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:'pass'}})).status,200);
});
test('host phone has companion restrictions; rejection, departure and seat removal clear requests',async t=>{
 const h=await harness(t),[host,phone]=h.users,hostPhone={...host,phone:true,controller:randomUUID()};
 await h.join(hostPhone);await h.cmd(hostPhone,{type:'claim-request',seatId:host.id});await h.get(host);
 await h.cmd(host,{type:'claim-approve',requestId:h.room.claimRequests[0].id});await h.get(hostPhone);assert.equal(h.room.companion.seatId,host.id);
 assert.equal((await h.cmd(hostPhone,{type:'local-remove',userId:h.seat})).status,403);
 await h.cmd(hostPhone,{type:'companion-leave'});await h.get(host);assert.ok(!h.room.members[0].claimed);assert.equal(h.room.status,'waiting');
 await h.join(phone);await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.get(host);await h.cmd(host,{type:'claim-reject',requestId:h.room.claimRequests[0].id});
 await h.get(phone);assert.equal(h.room.companion.pending,null);
 await h.cmd(phone,{type:'claim-request',seatId:h.seat});await h.get(host);await h.cmd(host,{type:'local-remove',userId:h.seat});await h.get(phone);assert.equal(h.room.companion.pending,null);assert.equal(h.room.members.length,1);
});
