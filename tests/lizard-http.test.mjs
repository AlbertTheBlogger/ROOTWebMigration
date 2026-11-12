// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../backend/server.mjs';
import { candidates } from '../backend/bots/test-policy.mjs';
import { applyAction,projectGame } from '../backend/rules/versions/registry.mjs';

async function harness(t,botDelay=0){
  const dir=mkdtempSync(join(tmpdir(),'woodland-lizard-'));let app,base;
  async function start(){app=createApp({dbPath:join(dir,'test.sqlite'),rateLimit:false,botDelay});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;}
  await start();t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  async function req(user,path,body){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Cookie:user.cookie||'','Content-Type':'application/json',Origin:base},body:body===undefined?undefined:JSON.stringify(body)});if(response.headers.get('set-cookie'))user.cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,...await response.json()};}
  async function register(name){const user={};const result=await req(user,'/api/auth/register',{username:name,password:'lizard-local-test-123'});assert.equal(result.status,200);user.id=result.user.id;return user;}
  async function command(user,room,command,id=randomUUID()){return req(user,`/api/rooms/${room.code}/command`,{commandId:id,version:room.version,command});}
  return {get app(){return app;},req,register,command,restart:async()=>{await app.close();await start();}};
}

test('Lizard room selection, reservation, persistent ruleset and idempotent setup survive restart',async t=>{
  const h=await harness(t,60000),a=await h.register('lizard_host'),b=await h.register('lizard_guest');
  let room=(await h.req(a,'/api/rooms',{capacity:2,ruleset:'root-base-four-v5',name:'A'})).room;
  assert.equal((await h.command(a,room,{type:'profile',name:'A',faction:'lizard'})).status,422);
  room=(await h.req(b,`/api/rooms/${room.code}/join`,{name:'B'})).room;
  assert.equal((await h.command(b,room,{type:'ruleset',ruleset:'root-lizard-cult-v6'})).status,403);
  room=(await h.command(a,room,{type:'ruleset',ruleset:'root-lizard-cult-v6'})).room;assert.ok(room.availableFactions.includes('lizard'));
  room=(await h.command(a,room,{type:'profile',name:'A',faction:'lizard'})).room;
  room=(await h.command(b,room,{type:'profile',name:'B',faction:'lizard'})).room;
  room=(await h.command(a,room,{type:'ready',ready:true})).room;
  assert.equal((await h.command(b,room,{type:'ready',ready:true})).status,409);
  room=(await h.command(b,room,{type:'profile',name:'B',faction:'bird'})).room;
  assert.equal((await h.command(a,room,{type:'ruleset',ruleset:'root-base-four-v5'})).status,409);
  await h.restart();room=(await h.req(a,`/api/rooms/${room.code}`)).room;assert.equal(room.ruleset,'root-lizard-cult-v6');
  room=(await h.command(b,room,{type:'ready',ready:true})).room;
  room=(await h.command(a,room,{type:'start',ruleset:'root-lizard-cult-v6'})).room;
  while(!room.game.setup.complete){
    const user=room.game.choice.playerId===a.id?a:b;room=(await h.req(user,`/api/rooms/${room.code}`)).room;
    const c=room.game.choice,id=randomUUID(),value={type:'action',action:{type:'choice',choiceId:c.choiceId,optionId:c.options[0].id}};
    const before=room,next=await h.command(user,room,value,id);assert.equal(next.status,200,JSON.stringify(next));
    const duplicate=await h.command(user,before,value,id);assert.equal(duplicate.room.version,next.room.version);room=next.room;
    await h.restart();room=(await h.req(a,`/api/rooms/${room.code}`)).room;
  }
  assert.equal(room.game.stateSchemaVersion,6);
  const view=(await h.req(b,`/api/rooms/${room.code}`)).room.game;assert.equal(view.players.find(p=>p.id===a.id).hand,undefined);assert.equal(view.lizard.acolytes,0);
});

test('one Lizard human and three room bots finish a natural game across restart and next game', {timeout:120000},async t=>{
  const h=await harness(t),host=await h.register('lizard_bot_game');
  let room=(await h.req(host,'/api/rooms',{capacity:4,ruleset:'root-lizard-cult-v6',name:'Cult'})).room;
  room=(await h.command(host,room,{type:'profile',name:'Cult',faction:'lizard'})).room;
  for(const faction of ['cat','bird','alliance'])room=(await h.command(host,room,{type:'bot-add',faction})).room;
  room=(await h.command(host,room,{type:'ready',ready:true})).room;
  room=(await h.command(host,room,{type:'start',ruleset:'root-lizard-cult-v6'})).room;
  let iterations=0,restarted=false;
  while(room.status==='playing'&&iterations++<15000){
    assert.equal(room.botError,null);
    if(!restarted&&room.game.round>=2){await h.restart();room=(await h.req(host,`/api/rooms/${room.code}`)).room;restarted=true;}
    const raw=h.app.db.prepare('SELECT payload,version FROM rooms WHERE code=?').get(room.code),s=JSON.parse(raw.payload).game;
    const actor=s.effects.frames[0]?.playerId||s.players[s.turn].id;
    if(actor===host.id){
      const view=projectGame(s,actor),p=view.players.find(p=>p.id===actor);let action;
      for(const a of candidates(view,p,{developmentRound:1})){try{applyAction(s,actor,a);action=a;break;}catch(e){if(e.status!==422)throw e;}}
      assert.ok(action,`No Lizard action in ${view.phase}`);room.version=raw.version;const response=await h.command(host,room,{type:'action',action});assert.equal(response.status,200,JSON.stringify(response));room=response.room;
    }else{await delay(2);room=(await h.req(host,`/api/rooms/${room.code}`)).room;}
  }
  assert.equal(room.status,'finished');assert.ok(restarted);assert.ok(room.game.winner);
  t.diagnostic(`Natural Lizard HTTP game: round ${room.game.round}, winner ${room.game.players.find(p=>p.id===room.game.winner).faction}`);
  room=(await h.command(host,room,{type:'new-game'})).room;assert.equal(room.ruleset,'root-lizard-cult-v6');assert.ok(room.members.filter(p=>p.bot).every(p=>p.ready));
  assert.equal((await h.req(host,`/api/rooms/${room.code}/delete`,{version:room.version})).status,200);
});
