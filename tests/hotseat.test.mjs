// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../backend/server.mjs';
import {candidates} from '../backend/bots/test-policy.mjs';
import {applyAction} from '../backend/rules/versions/registry.mjs';

function publicOnly(room){
 assert.equal(room.viewerId,null);assert.ok(room.game.players.every(p=>!p.hand));
 assert.ok(!room.game.alliance?.supporters);assert.ok(!room.game.revealedHand);assert.ok(!room.game.outrageReveal);
 assert.equal(room.game.mapActions.length,0);assert.equal(room.game.factionActions.length,0);
 if(room.game.choice){assert.equal(room.game.choice.waiting,true);assert.ok(!room.game.choice.options);}
}
async function harness(t){
 const folder=mkdtempSync(join(tmpdir(),'woodland-hotseat-'));const dbPath=join(folder,'qa.sqlite');let app,base;
 const start=async()=>{app=createApp({dbPath,rateLimit:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;};
 await start();t.after(async()=>{await app.close();rmSync(folder,{recursive:true,force:true});});
 const host={controller:randomUUID()},other={controller:randomUUID()};
 const request=async(client,path,data)=>{const res=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{cookie:client.cookie||'','Content-Type':'application/json','X-Woodland-Controller':client.controller},body:data===undefined?undefined:JSON.stringify(data)});if(res.headers.get('set-cookie'))client.cookie=res.headers.get('set-cookie').split(';')[0];return {status:res.status,body:await res.json()};};
 for(const [i,c] of [host,other].entries()){const r=await request(c,'/api/auth/register',{username:'hotseat'+i,password:'hotseat-password'});c.id=r.body.user.id;}
 return {get app(){return app;},host,other,request,restart:async()=>{await app.close();await start();}};
}
test('hotseat room ownership, seat validation, controller privacy, history and restart',async t=>{
 const h=await harness(t),{host,other,request}=h;
 let room=(await request(host,'/api/rooms',{name:'主人',playMode:'hotseat'})).body.room;
 const cmd=async(command,client=host,id=randomUUID())=>{const r=await request(client,`/api/rooms/${room.code}/command`,{version:room.version,commandId:id,command});if(r.status===200)room=r.body.room;return r;};
 assert.equal(room.playMode,'hotseat');assert.equal((await request(other,`/api/rooms/${room.code}/join`,{name:'入侵者'})).status,403);
 assert.equal((await request(other,'/api/rooms')).body.rooms.length,0);
 assert.equal((await cmd({type:'bot-add'})).status,422);
 await cmd({type:'local-add',seat:2});assert.equal(room.members.length,2);
 const guest=room.members.find(p=>p.userId!==host.id);
 assert.equal((await cmd({type:'local-remove',userId:host.id})).status,422);
 await cmd({type:'local-profile',userId:host.id,name:'猫',faction:'cat',ready:true});
 assert.equal((await cmd({type:'local-profile',userId:guest.userId,name:'猫',faction:'bird',ready:true})).status,409);
 await cmd({type:'local-profile',userId:guest.userId,name:'鹰',faction:'bird',ready:true});
 assert.equal((await cmd({type:'start',ruleset:'root-cats-birds-v4'})).status,422);
 await cmd({type:'start',ruleset:'root-lizard-cult-v6'});publicOnly(room);
 assert.equal((await cmd({type:'action',action:{type:'end'}})).status,403);
 await cmd({type:'hotseat-confirm',actorId:room.hotseat.actor.id,epoch:room.hotseat.epoch});
 assert.ok(room.viewerId);assert.ok(room.game.players.find(p=>p.id===room.viewerId).hand);
 const second={...host,controller:randomUUID()};publicOnly((await request(second,`/api/rooms/${room.code}`)).body.room);
 const history=(await request(host,`/api/games/${room.gameId}`)).body.game;
 assert.ok(history.players.every(p=>!p.hand));
 await h.restart();room=(await request(host,`/api/rooms/${room.code}`)).body.room;publicOnly(room);
 await cmd({type:'hotseat-confirm',actorId:room.hotseat.actor.id,epoch:room.hotseat.epoch},second);
 publicOnly((await request(host,`/api/rooms/${room.code}`)).body.room);
 await cmd({type:'hotseat-lock'});publicOnly((await request(second,`/api/rooms/${room.code}`)).body.room);
 const waiting=(await request(host,'/api/rooms',{name:'房主',playMode:'hotseat'})).body.room;
 const exit=await request(host,`/api/rooms/${waiting.code}/command`,{version:waiting.version,commandId:randomUUID(),command:{type:'leave'}});
 assert.equal(exit.status,200);assert.equal(exit.body.room,null);
 const closed=h.app.db.prepare('SELECT status,owner_id FROM rooms WHERE code=?').get(waiting.code);
 assert.equal(closed.status,'closed');assert.equal(closed.owner_id,host.id);
});

test('five factions play through setup, interruptions and complete turns using one account',async t=>{
 for(const omitted of ['lizard','vagabond','bird']){
  const h=await harness(t),{host,request}=h;
  let room=(await request(host,'/api/rooms',{name:'本地1',playMode:'hotseat'})).body.room;
  const cmd=async(command)=>{const r=await request(host,`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command});assert.equal(r.status,200,JSON.stringify(r.body));room=r.body.room;};
  for(let seat=1;seat<4;seat++)await cmd({type:'local-add',seat});
  const factions=['cat','bird','alliance','vagabond','lizard'].filter(f=>f!==omitted);
  for(const [i,m] of room.members.entries())await cmd({type:'local-profile',userId:m.userId,name:'本地'+i,faction:factions[i],ready:true});
  await cmd({type:'start',ruleset:omitted==='lizard'?'root-base-four-v5':'root-lizard-cult-v6'});let handoffs=0,actions=0;
  while(room.game.turnsCompleted<120&&!room.game.winner){
   assert.ok(actions++<5000);
   if(room.hotseat.locked){publicOnly(room);await cmd({type:'hotseat-confirm',actorId:room.hotseat.actor.id,epoch:room.hotseat.epoch});handoffs++;}
   const p=room.game.players.find(p=>p.id===room.viewerId);
   const state=JSON.parse(h.app.db.prepare('SELECT state FROM games WHERE id=?').get(room.gameId).state);
   let action;
   for(const candidate of candidates(room.game,p,{developmentRound:1}))try{applyAction(state,p.id,candidate,()=>0);action=candidate;break;}catch{}
   assert.ok(action,p.faction+'/'+room.game.phase);
   const previous=room.viewerId;await cmd({type:'action',action});
   if(room.hotseat.actor?.id!==previous&&!room.game.winner)assert.equal(room.hotseat.locked,true);
  }
  assert.ok(handoffs>=12);assert.ok(room.game.winner,'full hotseat game must end naturally');
  const saved=h.app.db.prepare('SELECT command FROM snapshots WHERE game_id=? ORDER BY id DESC LIMIT 1').get(room.gameId);
  assert.ok(room.members.some(m=>m.userId===JSON.parse(saved.command).actor));
  await cmd({type:'new-game'});assert.equal(room.status,'waiting');assert.equal(room.game,null);assert.ok(room.members.every(m=>!m.ready));assert.equal(room.playMode,'hotseat');
 }
});

test('isolated ambush and counter-ambush require A to B to A handoffs without restoring old access',async t=>{
 const h=await harness(t),{host,request}=h;
 let room=(await request(host,'/api/rooms',{name:'猫',playMode:'hotseat'})).body.room;
 const cmd=async(command)=>{const r=await request(host,`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command});if(r.status===200)room=r.body.room;return r;};
 await cmd({type:'local-add',seat:1});const bird=room.members[1];
 for(const [i,m] of room.members.entries())assert.equal((await cmd({type:'local-profile',userId:m.userId,name:m.name,faction:i===0?'cat':'bird',ready:true})).status,200);
 assert.equal((await cmd({type:'start',ruleset:'root-base-four-v5'})).status,200);
 const row=h.app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code),payload=JSON.parse(row.payload);
 let g=payload.game;
 while(!g.setup.complete){const q=g.effects.frames[0];g=applyAction(g,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},()=>0);}
 g.turn=g.players.findIndex(p=>p.id===host.id);g.phase='daylight';g.effects.frames=[];g.actions=3;
 for(const p of g.players)g.deck.push(...p.hand.splice(0));
 for(const p of g.players){const i=g.deck.findIndex(c=>c.kind==='ambush'&&c.suit==='wild');assert.ok(i>=0);p.hand.push(...g.deck.splice(i,1));}
 g.board[0].warriors.cat=3;g.board[0].warriors.bird=3;
 payload.game=g;payload.controlEpoch=(payload.controlEpoch||0)+1;
 h.app.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(payload),room.code);
 h.app.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(g),room.gameId);
 room=(await request(host,`/api/rooms/${room.code}`)).body.room;
 await cmd({type:'hotseat-confirm',actorId:host.id,epoch:room.hotseat.epoch});
 const epoch=room.hotseat.epoch;
 assert.equal((await cmd({type:'action',action:{type:'battle',clearing:0,defender:'bird'}})).status,200);
 publicOnly(room);assert.equal(room.hotseat.actor.id,bird.userId);
 await cmd({type:'hotseat-confirm',actorId:bird.userId,epoch:room.hotseat.epoch});
 assert.equal(room.game.choice.kind,'ambush');
 const q=room.game.choice,option=q.options.find(o=>o.id!=='pass');assert.ok(option);
 await cmd({type:'action',action:{type:'choice',choiceId:q.choiceId,optionId:option.id}});
 publicOnly(room);assert.equal(room.hotseat.actor.id,host.id);
 assert.equal((await cmd({type:'hotseat-confirm',actorId:host.id,epoch})).status,409);
 await cmd({type:'hotseat-confirm',actorId:host.id,epoch:room.hotseat.epoch});
 assert.equal(room.viewerId,host.id);assert.equal(room.game.choice.kind,'counter-ambush');
 assert.ok(room.game.players.filter(p=>p.id!==host.id).every(p=>!p.hand));
});
test('v7 Riverfolk hotseat and phone show public market while keeping all other hands private',async t=>{
 const h=await harness(t),{host,other,request}=h;let room=(await request(host,'/api/rooms',{name:'猫',playMode:'hotseat',ruleset:'root-riverfolk-v7'})).body.room;
 const cmd=async(command)=>{const r=await request(host,`/api/rooms/${room.code}/command`,{version:room.version,commandId:randomUUID(),command});assert.equal(r.status,200,JSON.stringify(r.body));room=r.body.room;};
 await cmd({type:'local-add',seat:1});const otter=room.members[1].userId;
 for(const m of room.members)await cmd({type:'local-profile',userId:m.userId,name:m.userId===otter?'掌柜':'客户',faction:m.userId===otter?'otter':'cat',ready:true});
 await cmd({type:'start',ruleset:'root-riverfolk-v7'});assert.equal(room.game.ruleset,'root-riverfolk-v7');
 const check=view=>{assert.ok(view.game.players.find(p=>p.faction==='otter').hand);assert.ok(!view.game.players.find(p=>p.faction==='cat').hand);assert.equal(view.game.mapActions.length,0);};check(room);
 const joined=await request(other,`/api/rooms/${room.code}/companion`,{});assert.equal(joined.status,200);check(joined.body.room);room=(await request(host,`/api/rooms/${room.code}`)).body.room;
 let handoffs=0;
 for(let n=0;!room.game.winner;n++){assert.ok(n<1800);if(room.hotseat.locked){check(room);await cmd({type:'hotseat-confirm',actorId:room.hotseat.actor.id,epoch:room.hotseat.epoch});handoffs++;}
 const p=room.game.players.find(p=>p.id===room.viewerId),g=JSON.parse(h.app.db.prepare('SELECT state FROM games WHERE id=?').get(room.gameId).state);const a=candidates(room.game,p,{developmentRound:1}).find(a=>{try{applyAction(g,p.id,a,()=>0);return true;}catch{return false;}});assert.ok(a,p.faction+'/'+room.game.phase);await cmd({type:'action',action:a});
 if(n===30){await h.restart();room=(await request(host,`/api/rooms/${room.code}`)).body.room;check(room);}
 }
 assert.ok(handoffs>6);const saved=await request(host,`/api/games/${room.gameId}`);assert.equal(saved.status,200);assert.ok(saved.body.game.players.find(p=>p.faction==='otter').hand);assert.ok(!saved.body.game.players.find(p=>p.faction==='cat').hand);
});
