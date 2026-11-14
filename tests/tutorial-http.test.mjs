// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../backend/server.mjs';
import {tutorialAction,tutorialCommandFor} from './helpers/tutorial-actions.mjs';

test('tutorial HTTP progress, private saves, retries and restart recovery',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'tutorial-api-'));const dbPath=join(folder,'qa.sqlite');
 let app,base;
 const start=async()=>{app=createApp({dbPath,rateLimit:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;};
 await start();t.after(async()=>{await app.close();rmSync(folder,{recursive:true});});
 const request=async(client,path,data)=>{const response=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{...(client.cookie?{cookie:client.cookie}:{}),...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});if(response.headers.get('set-cookie'))client.cookie=response.headers.get('set-cookie').split(';')[0];return {status:response.status,body:await response.json()};};
 const learner={},other={};
 await request(learner,'/api/auth/register',{username:'tutoriallearner',password:'tutorial-only-password'});const second=await request(other,'/api/auth/register',{username:'tutorialother',password:'tutorial-only-password'});
 let room=(await request(learner,'/api/tutorials/basics/start',{})).body.room;
 // Match the real browser's Accept-Encoding while checking the complete body.
 // This cannot emulate the public forwarding fault; real Edge verification is
 // also required when changing response framing.
 const wire=await fetch(base+'/api/tutorials/basics/start',{method:'POST',headers:{cookie:learner.cookie,'Content-Type':'application/json','Accept-Encoding':'gzip, deflate'},body:'{}',signal:AbortSignal.timeout(3000)});
 assert.equal(wire.headers.get('content-encoding'),null);
 const bytes=Buffer.from(await wire.arrayBuffer());
 assert.ok(bytes.length>1024);
 assert.equal(Number(wire.headers.get('content-length')),bytes.length);
 assert.deepEqual(JSON.parse(bytes).room,room);
 assert.equal((await request(other,'/api/tutorials/basics')).status,404);
 assert.equal((await request({},'/api/tutorials')).status,401);
 assert.equal((await request(learner,'/api/tutorials')).body.lessons.length,7);
 const first={runId:room.tutorial.id,version:room.version,commandId:randomUUID(),command:{type:'guide-next'}};
 const next=await request(learner,'/api/tutorials/basics/command',first);room=next.body.room;
 assert.equal((await request(learner,'/api/tutorials/basics/command',first)).body.room.version,room.version);
 assert.equal((await request(learner,'/api/tutorials/basics/command',{...first,command:{type:'restart'}})).status,409);
 assert.equal((await request(learner,'/api/tutorials/basics/command',{...first,commandId:randomUUID()})).status,409);
 assert.equal((await request(learner,'/api/tutorials/basics/command',{runId:room.tutorial.id,version:room.version,commandId:randomUUID(),command:{type:'next'}})).status,422);
 const before=room;
 await app.close();await start();room=(await request(learner,'/api/tutorials/basics')).body.room;assert.deepEqual(room,before);
 for(const lesson of (await request(learner,'/api/tutorials')).body.lessons){
  room=(await request(learner,`/api/tutorials/${lesson.id}/start`,{})).body.room;
  let commands=0,journeyRestored=false,storyRestored=false;
  while(!room.tutorial.completed){
   assert.ok(commands++<250);
   if(!storyRestored&&(room.tutorial.stepId==='bird-defense'&&room.game.choice?.kind==='battle-effects'||room.tutorial.stepId==='wa-guerrilla'&&room.game.choice?.kind==='outrage'||room.tutorial.stepId==='vg-injury'&&room.game.choice?.kind==='vagabond-damage'||room.tutorial.stepId==='liz-third-night'&&room.game.phase==='discard')){
    const saved=room;await app.close();await start();room=(await request(learner,`/api/tutorials/${lesson.id}`)).body.room;assert.deepEqual(room,saved);storyRestored=true;
   }
   if(room.tutorial.stepId==='journey-second'&&!journeyRestored){
    const saved=room;await app.close();await start();
    room=(await request(learner,`/api/tutorials/${lesson.id}`)).body.room;
    assert.deepEqual(room,saved);assert.equal(room.game.turnsCompleted,2);journeyRestored=true;
   }
   if(lesson.id==='lizard'&&['liz-setup','liz-crusade','liz-hated','liz-fear'].includes(room.tutorial.stepId)&&!room.tutorial.ready){
    const saved=room;await app.close();await start();room=(await request(learner,'/api/tutorials/lizard')).body.room;assert.deepEqual(room,saved);
   }
   const command=tutorialCommandFor(room);
   const result=await request(learner,`/api/tutorials/${lesson.id}/command`,{runId:room.tutorial.id,version:room.version,commandId:randomUUID(),command});
   assert.equal(result.status,200,JSON.stringify(result.body));room=result.body.room;
  }
 }
 assert.ok((await request(learner,'/api/tutorials')).body.lessons.every(lesson=>lesson.completed));
 assert.ok((await request(other,'/api/tutorials')).body.lessons.every(lesson=>!lesson.started));
 assert.equal(app.db.prepare('SELECT count(*) n FROM rooms').get().n,0);assert.equal(app.db.prepare('SELECT count(*) n FROM games').get().n,0);assert.equal(app.db.prepare('SELECT count(*) n FROM tutorial_runs').get().n,7);
 room=(await request(learner,'/api/tutorials/vagabond/start',{})).body.room;
 const restart={runId:room.tutorial.id,version:room.version,commandId:randomUUID(),command:{type:'restart'}};
 const fresh=(await request(learner,'/api/tutorials/vagabond/command',restart)).body.room;
 assert.notEqual(fresh.tutorial.id,room.tutorial.id);assert.equal(fresh.tutorial.index,0);
 assert.deepEqual((await request(learner,'/api/tutorials/vagabond/command',restart)).body.room,fresh);
 assert.equal((await request(learner,'/api/tutorials')).body.lessons.find(lesson=>lesson.id==='vagabond').completed,true);
 app.db.prepare("INSERT INTO account_access(user_id,role) VALUES(?,'admin')").run(second.body.user.id);
 assert.equal((await request(other,'/api/tutorials')).status,403);
});
