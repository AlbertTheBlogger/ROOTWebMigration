// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,advanceTutorial,projectTutorial,tutorialCatalog} from '../backend/tutorials.mjs';

import {tutorialAction} from './helpers/tutorial-actions.mjs';

function lizardStep(id){
 let run=createTutorial({id:'learner',username:'Learner'},'lizard');
 for(let n=0;projectTutorial(run,0).tutorial.stepId!==id;n++){
  assert.ok(n<100);const room=projectTutorial(run,n);
  run=advanceTutorial(run,room.tutorial.ready?{type:'next'}:{type:'action',action:tutorialAction(room)});
 }
 return run;
}

test('all six tutorial chapters complete through real rules and checked goals',()=>{
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

test('Lizard chapter uses v6 and preserves real cards through all 19 checked scenes',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'lizard');let commands=0;const seen=new Set();
 while(!run.completed){
  const room=projectTutorial(run,commands);seen.add(room.tutorial.stepId);
  assert.equal(room.game.ruleset,'root-lizard-cult-v6');assert.equal(room.game.stateSchemaVersion,6);
  assert.equal(room.game.players.find(p=>p.id==='learner').faction,'lizard');
  const s=run.game,all=[...s.deck,...s.discard,...s.dominanceAvailable,...s.lizard.lostSouls,...s.lizard.revealed,...s.alliance.supporters,
   ...s.players.flatMap(p=>[...p.hand,...p.crafted]),...Object.values(s.bird.decree).flat().filter(c=>!c.vizier),...(s.combat?.ambushCard?[s.combat.ambushCard]:[])];
  assert.equal(all.length,54,room.tutorial.stepId);assert.equal(new Set(all.map(c=>c.id)).size,54,room.tutorial.stepId);
  const serialized=JSON.parse(JSON.stringify(run));assert.deepEqual(projectTutorial(serialized,commands),room);
  run=advanceTutorial(serialized,room.tutorial.ready?{type:'next'}:{type:'action',action:tutorialAction(room)});
  assert.ok(commands++<100);
 }
 assert.equal(seen.size,19);
});

test('Lizard continuous ritual scenes retain displayed cards, reveal them publicly and return before craft',()=>{
 let run=lizardStep('liz-recruit');const initial=structuredClone(run.game);
 let room=projectTutorial(run,0);const action=tutorialAction(room);
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{...action,clearing:2}}),/本节目标/);
 run=advanceTutorial(run,{type:'action',action});assert.equal(run.game.lizard.revealed.length,1);
 const shown=run.game.lizard.revealed[0].id;
 run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,initial);
 run=advanceTutorial(run,{type:'action',action});run=advanceTutorial(run,{type:'next'});
 room=projectTutorial(run,1);assert.equal(room.tutorial.stepId,'liz-build');assert.equal(room.tutorial.newScene,false);
 assert.equal(room.game.lizard.revealed[0].id,shown);
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'ritual-build',clearing:4,card:shown}}));
 run=lizardStep('liz-return');assert.equal(run.game.lizard.revealed.length,2);
 run=advanceTutorial(run,{type:'action',action:{type:'end'}});assert.equal(run.game.lizard.revealed.length,0);assert.equal(run.game.phase,'lizard-craft');
});

test('Lizard crusade requires the intended two-warrior move and battle, and cannot skip the followup',()=>{
 let run=lizardStep('liz-crusade'),room=projectTutorial(run,0),action=tutorialAction(room);
 assert.equal(action.count,2);
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{...action,count:1}}),/本节目标/);
 run=advanceTutorial(run,{type:'action',action});assert.equal(run.ready,false);
 room=projectTutorial(run,1);assert.equal(room.game.choice.kind,'lizard-crusade-battle');assert.deepEqual(room.game.choice.options.map(o=>o.id),['bird']);
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'choice',choiceId:room.game.choice.choiceId,optionId:'pass'}}),/本节目标/);
 run=advanceTutorial(run,{type:'action',action:tutorialAction(room)});assert.equal(run.ready,true);assert.equal(run.game.lizard.acolytes,0);
 const direct=lizardStep('liz-battle'),directRoom=projectTutorial(direct,0);
 assert.ok(directRoom.game.factionActions.length>0);assert.ok(directRoom.game.factionActions.every(o=>o.action.from===undefined));
 assert.throws(()=>advanceTutorial(direct,{type:'action',action:{type:'crusade',from:2,to:direct.game.board[2].links[0],count:1}}),/本节目标/);
});

test('two selected discards persist into the next Birdsong and enable discounted convert then sanctify',()=>{
 let run=lizardStep('liz-discard'),room=projectTutorial(run,0);const hero=room.game.players.find(p=>p.id==='learner');
 const wrong=hero.hand.find(c=>c.suit!=='rabbit');assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'discard',card:wrong.id}}),/本节目标/);
 for(let i=0;i<2;i++)run=advanceTutorial(run,{type:'action',action:tutorialAction(projectTutorial(run,i))});
 assert.equal(run.ready,true);const discarded=run.game.lizard.lostSouls.map(c=>c.id);
 run=advanceTutorial(run,{type:'next'});assert.deepEqual(run.game.lizard.lostSouls.map(c=>c.id),discarded);
 assert.equal(run.game.phase,'birdsong');run=advanceTutorial(run,{type:'action',action:{type:'birdsong-end'}});
 assert.equal(run.game.lizard.hated,true);assert.equal(run.game.lizard.lostSouls.length,0);
 run=advanceTutorial(run,{type:'next'});run=advanceTutorial(run,{type:'action',action:tutorialAction(projectTutorial(run,0))});assert.equal(run.game.lizard.acolytes,2);
 run=advanceTutorial(run,{type:'next'});run=advanceTutorial(run,{type:'action',action:tutorialAction(projectTutorial(run,0))});assert.equal(run.game.lizard.acolytes,0);
 assert.ok(run.game.board[11].buildings.some(b=>b.type==='garden-rabbit'));
});

test('fear checkpoint retry restores the pre-roll state and produces the same tutorial result',()=>{
 let run=lizardStep('liz-fear');const before=structuredClone(run.game);const command={type:'action',action:tutorialAction(projectTutorial(run,0))};
 run=advanceTutorial(run,command);const after=structuredClone(run.game);assert.equal(run.ready,true);assert.equal(after.lizard.lostSouls.length,1);
 run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,before);
 run=advanceTutorial(run,command);assert.deepEqual(run.game,after);
});
