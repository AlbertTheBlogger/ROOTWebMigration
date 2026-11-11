// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,advanceTutorial,projectTutorial,tutorialCatalog} from '../backend/tutorials.mjs';

import {tutorialAction} from './helpers/tutorial-actions.mjs';

test('all five tutorial chapters complete through real rules and checked goals',()=>{
 for(const lesson of tutorialCatalog()){
  let run=createTutorial({id:'learner',username:'Learner'},lesson.id);let actions=0;const seen=new Set();
  while(!run.completed){
   assert.ok(actions++<150,lesson.id);const room=projectTutorial(run,actions);seen.add(room.tutorial.stepId);
   run=advanceTutorial(run,room.tutorial.ready?{type:'next'}:{type:'action',action:tutorialAction(room)});
  }
  assert.equal(seen.size,lesson.stepCount);assert.equal(run.everCompleted,true);
 }
});

test('off-goal actions and premature completion are rejected; retry restores the same lesson checkpoint',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'basics');run=advanceTutorial(run,{type:'next'});
 assert.throws(()=>advanceTutorial(run,{type:'next'}),/教学目标/);
 const original=structuredClone(run.game);
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'end'}}),/本节目标/);
 run=advanceTutorial(run,{type:'action',action:{type:'move',from:0,to:3,count:1}});
 run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,original);assert.equal(run.ready,false);assert.equal(run.attempt,1);
});

test('tutorial projection preserves secret hands and never exposes the checkpoint or future step state',()=>{
 const run=createTutorial({id:'learner',username:'Learner'},'vagabond');
 const room=projectTutorial(run,0);
 assert.ok(!('checkpoint' in room));assert.ok(!('deck' in room.game));assert.ok(!('ruinItems' in room.game.vagabond));
 for(const p of room.game.players)if(p.id!=='learner')assert.ok(!('hand' in p));
 assert.ok(!('supporters' in room.game.alliance));
});
