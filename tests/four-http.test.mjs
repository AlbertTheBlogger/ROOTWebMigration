// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../backend/server.mjs';

test('four-player room, private pending Outrage, restart and idempotent resolution',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'woodland-four-http-'));
  let app,base;
  async function start(){
    app=createApp({dbPath:join(directory,'qa.sqlite'),rateLimit:false});
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const users=Array.from({length:5},()=>({}));
  async function request(user,path,data){
    const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{Cookie:user.cookie||'','Content-Type':'application/json',Origin:base},body:data===undefined?undefined:JSON.stringify(data)});
    if(response.headers.get('set-cookie'))user.cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,body:await response.json()};
  }
  for(const [index,user] of users.entries()){
    const response=await request(user,'/api/auth/register',{username:'four_http_'+index,password:'four-http-only-123'});
    user.id=response.body.user.id;assert.equal(response.status,200);
  }
  let room=(await request(users[0],'/api/rooms',{capacity:4,name:'猫',password:''})).body.room;
  for(let index=1;index<4;index++)room=(await request(users[index],`/api/rooms/${room.code}/join`,{name:'玩家'+index,password:''})).body.room;
  assert.equal(room.capacity,4);
  assert.equal((await request(users[4],`/api/rooms/${room.code}/join`,{name:'第五人',password:''})).status,409);
  async function command(user,value,id=randomUUID(),version=room.version){
    return request(user,`/api/rooms/${room.code}/command`,{commandId:id,version,command:value});
  }
  // Full rooms can swap factions without needing an empty seat.
  room=(await command(users[0],{type:'profile',name:'猫',faction:'bird'})).body.room;
  assert.equal(room.members.filter(player=>player.faction==='bird').length,2);
  room=(await command(users[1],{type:'ready',ready:true})).body.room;
  const conflict=await command(users[0],{type:'ready',ready:true});
  assert.equal(conflict.status,409);assert.match(conflict.body.error,/阵营/);
  const unchanged=(await request(users[0],`/api/rooms/${room.code}`)).body.room;
  assert.equal(unchanged.version,room.version);assert.equal(unchanged.members[0].ready,false);
  room=(await command(users[1],{type:'ready',ready:false})).body.room;
  room=(await command(users[0],{type:'ready',ready:true})).body.room;
  // Editing a ready profile releases its reservation.
  room=(await command(users[0],{type:'profile',name:'猫',faction:'cat'})).body.room;
  assert.equal(room.members[0].ready,false);
  for(const user of users.slice(0,4))room=(await command(user,{type:'ready',ready:true})).body.room;
  assert.equal((await command(users[0],{type:'start',ruleset:'root-cats-birds-v4'})).status,422);
  room=(await command(users[0],{type:'start',ruleset:'root-base-four-v5'})).body.room;
  assert.equal(room.game.stateSchemaVersion,5);
  while(!room.game.setup.complete){
    const user=users.find(user=>user.id===room.game.choice.playerId);
    room=(await request(user,`/api/rooms/${room.code}`)).body.room;
    const choice=room.game.choice;
    room=(await command(user,{type:'action',action:{type:'choice',choiceId:choice.choiceId,optionId:choice.options[0].id}})).body.room;
  }
  assert.equal((await command(users[0],{type:'resign'})).status,409);
  const row=app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code);
  const payload=JSON.parse(row.payload),game=payload.game;
  game.turn=game.players.findIndex(player=>player.faction==='cat');game.phase='daylight';game.actions=3;game.march=0;game.effects.frames=[];
  game.board[0].warriors.cat=3;game.board[3].sympathy=true;
  const cat=game.players.find(player=>player.faction==='cat');
  if(!cat.hand.some(card=>card.suit==='rabbit'||card.suit==='wild')){
    const index=game.deck.findIndex(card=>card.suit==='rabbit'||card.suit==='wild');cat.hand.push(game.deck.splice(index,1)[0]);
  }
  app.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(payload),room.code);
  app.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(game),payload.gameId);
  const id=randomUUID(),version=room.version;
  const action={type:'action',action:{type:'move',from:0,to:3,count:1}};
  room=(await command(users[0],action,id,version)).body.room;
  assert.equal(room.game.choice.kind,'outrage');
  const before=(await request(users[0],`/api/rooms/${room.code}`)).body.room;
  const observer=(await request(users[1],`/api/rooms/${room.code}`)).body.room;
  assert.equal(observer.game.choice.options,undefined);
  assert.equal(observer.game.alliance.supporters,undefined);
  const alliance=(await request(users[2],`/api/rooms/${room.code}`)).body.room;
  const supportCount=alliance.game.alliance.supporterCount;
  await app.close();await start();
  assert.deepEqual((await request(users[0],`/api/rooms/${room.code}`)).body.room,before);
  const snapshots=app.db.prepare('SELECT count(*) count FROM snapshots').get().count;
  const retry=await command(users[0],action,id,version);
  assert.equal(retry.status,200);assert.equal(retry.body.room.version,room.version);
  assert.equal(app.db.prepare('SELECT count(*) count FROM snapshots').get().count,snapshots);
  const choice=before.game.choice;
  assert.equal((await command(users[1],{type:'action',action:{type:'choice',choiceId:choice.choiceId,optionId:choice.options[0].id}})).status,422);
  room=(await command(users[0],{type:'action',action:{type:'choice',choiceId:choice.choiceId,optionId:choice.options[0].id}})).body.room;
  assert.equal((await request(users[2],`/api/rooms/${room.code}`)).body.room.game.alliance.supporterCount,supportCount+1);
});
