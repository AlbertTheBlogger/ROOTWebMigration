// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,advanceTutorial,projectTutorial,tutorialCatalog} from '../backend/tutorials.mjs';

import {tutorialAction,tutorialCommandFor} from './helpers/tutorial-actions.mjs';

function lizardStep(id){
 let run=createTutorial({id:'learner',username:'Learner'},'lizard',{curriculumVersion:6});
 for(let n=0;projectTutorial(run,0).tutorial.stepId!==id;n++){
  assert.ok(n<100);const room=projectTutorial(run,n);
  run=advanceTutorial(run,tutorialCommandFor(room));
 }
 return run;
}

test('all seven tutorial chapters complete through real rules and checked goals',()=>{
 for(const lesson of tutorialCatalog()){
  let run=createTutorial({id:'learner',username:'Learner'},lesson.id);let actions=0;const seen=new Set();
  while(!run.completed){
   assert.ok(actions++<250,lesson.id);const room=projectTutorial(run,actions);seen.add(room.tutorial.stepId);
   if(!run.ready){assert.equal(room.tutorial.guide.mode,'act',lesson.id+': operation prompt must open its controls immediately');assert.equal(room.tutorial.guide.canAdvance,false);}
   if(!run.ready&&room.tutorial.guide.watch&&!room.tutorial.guide.auto){const guide=room.tutorial.guide;assert.equal(guide.speakerFaction||lesson.faction,lesson.faction,'observing opponents must retain learner perspective');if(lesson.id==='cats'){assert.ok(guide.text.includes('阁下'));assert.ok(!guide.text.includes('陛下'));assert.ok(!guide.text.includes('请下令'));}}
   if(room.tutorial.guide?.outcome){
    assert.deepEqual(room.tutorial.guide.outcome.dice,room.tutorial.stepId==='battle'?[3,1]:[0,0]);assert.equal(room.tutorial.guide.outcome.points,1);
    assert.equal(room.tutorial.guide.outcome.bird[1],0);assert.equal(room.tutorial.guide.outcome.roost[1],0);
   }
   run=advanceTutorial(run,tutorialCommandFor(room));
  }
  assert.equal(seen.size,lesson.stepCount);assert.equal(run.everCompleted,true);
 }
});

test('off-goal actions and premature completion are rejected; retry restores the same lesson checkpoint',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'basics');
 while(run.step===0||projectTutorial(run,0).tutorial.guide?.canAdvance)run=advanceTutorial(run,tutorialCommandFor(projectTutorial(run,0)));
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

test('basics dialogue persists line by line, gates actions and resets cleanly on retry',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'basics');
 const original=structuredClone(run.game);
 assert.equal(projectTutorial(run,0).tutorial.guide.cursor,0);
 assert.throws(()=>advanceTutorial(run,{type:'next'}),/听完/);
 assert.throws(()=>advanceTutorial(run,{type:'guide-back'}),/当前引导/);
 run=advanceTutorial(run,{type:'guide-next'});
 assert.equal(projectTutorial(run,0).tutorial.guide.cursor,1);
 assert.deepEqual(run.game,original);
 const saved=JSON.parse(JSON.stringify(run));assert.deepEqual(projectTutorial(saved,2),projectTutorial(run,2));
 run=advanceTutorial(saved,{type:'guide-back'});assert.equal(run.guideCursor,0);
 while(run.step===0)run=advanceTutorial(run,tutorialCommandFor(projectTutorial(run,0)));
 assert.ok(projectTutorial(run,0).game.mapActions.length>0,'the movement prompt and its controls appear together');
 assert.equal(projectTutorial(run,0).tutorial.guide.canAdvance,false);
 const room=projectTutorial(run,0);assert.equal(room.tutorial.guide.mode,'act');
 assert.ok(room.game.mapActions.every(a=>a.type==='move'&&a.count===1&&a.from===0&&a.to===3));
 assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'move',from:0,to:3,count:3}}),/本节目标/);
 const before=structuredClone(run.game);
 run=advanceTutorial(run,{type:'action',action:tutorialAction(room)});
 assert.equal(run.ready,true);assert.equal(projectTutorial(run,0).tutorial.guide.mode,'result');
 assert.throws(()=>advanceTutorial(run,{type:'next'}),/听完/);
 run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,before);
 assert.equal(run.guideCursor,0);assert.equal(run.ready,false);
 // Saves created before the dialogue upgrade start at the first line safely.
 delete run.guideCursor;run.curriculumVersion=2;
 assert.equal(projectTutorial(run,0).tutorial.guide.cursor,0);
});

test('Lizard chapter uses v6 and preserves real cards through all 19 checked scenes',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'lizard',{curriculumVersion:6});let commands=0;const seen=new Set();
 while(!run.completed){
  const room=projectTutorial(run,commands);seen.add(room.tutorial.stepId);
  assert.equal(room.game.ruleset,'root-lizard-cult-v6');assert.equal(room.game.stateSchemaVersion,6);
  assert.equal(room.game.players.find(p=>p.id==='learner').faction,'lizard');
  const s=run.game,all=[...s.deck,...s.discard,...s.dominanceAvailable,...s.lizard.lostSouls,...s.lizard.revealed,...s.alliance.supporters,
   ...s.players.flatMap(p=>[...p.hand,...p.crafted]),...Object.values(s.bird.decree).flat().filter(c=>!c.vizier),...(s.combat?.ambushCard?[s.combat.ambushCard]:[])];
  assert.equal(all.length,54,room.tutorial.stepId);assert.equal(new Set(all.map(c=>c.id)).size,54,room.tutorial.stepId);
  const serialized=JSON.parse(JSON.stringify(run));assert.deepEqual(projectTutorial(serialized,commands),room);
  run=advanceTutorial(serialized,tutorialCommandFor(room));
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

test('fear with no optional defense resolves automatically and retry restores the same completed checkpoint',()=>{
 let run=lizardStep('liz-fear');const after=structuredClone(run.game);
 assert.equal(run.ready,true);assert.equal(after.lizard.lostSouls.length,1);assert.equal(after.combat,null);
 assert.equal(after.effects.frames.length,0);
 run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,after);assert.equal(run.ready,true);
});

test('four faction journeys preserve two complete turns, resources and the opponents actual replies',()=>{
 for(const lessonId of ['cats','eyrie','alliance','vagabond']){
  let run=createTutorial({id:'learner',username:'Learner'},lessonId,{curriculumVersion:lessonId==='cats'?4:5}),commands=0;
  const boundaries=new Map(),actions=[];
  while(!run.completed){
   assert.ok(commands++<250,lessonId);
   const room=projectTutorial(run,commands),meta=room.tutorial;
   if(meta.context.campaign&&meta.stepId.startsWith('journey-')){
    const restored=JSON.parse(JSON.stringify(run));assert.deepEqual(projectTutorial(restored,commands),room);
    assert.equal(room.game.players.length,2);
    assert.equal(meta.guide.resources.score,run.game.players.find(p=>p.id===run.userId).score);
    if(!boundaries.has(meta.stepId))boundaries.set(meta.stepId,structuredClone(run.game));
    if(!meta.ready&&meta.guide.mode==='dialogue'){
     assert.equal(meta.actionTypes.length,0);
     assert.throws(()=>advanceTutorial(run,{type:'coach-next'}));
    }
    if(meta.guide.watch){
     assert.ok(!meta.guide.action,'opponent cards must not leak through suggested actions');
     assert.ok(room.game.players.filter(p=>p.id!==run.userId).every(p=>!p.hand));
    }
    if(meta.guide.action){
     actions.push(meta.guide.action.type);
     assert.throws(()=>advanceTutorial(run,{type:'action',action:{type:'end',unexpected:true}}));
    }
   }
   const command=tutorialCommandFor(room),before=run;
   run=advanceTutorial(run,command);
   if(meta.context.campaign&&meta.stepId.startsWith('journey-')&&command.type==='next'){
    assert.deepEqual(run.game,before.game,'stage transition must not rewrite the game');
   }
  }
  assert.equal(run.game.turnsCompleted,4,lessonId);
  assert.equal(run.game.round,3,lessonId);
  assert.equal(boundaries.get('journey-first').turnsCompleted,0);
  assert.equal(boundaries.get('journey-second').turnsCompleted,2);
  assert.ok(run.context.history.some(e=>e.actor!==run.userId));
  if(lessonId==='cats')assert.ok(run.game.board.flatMap(c=>c.buildings).filter(b=>b.type==='sawmill').length>=2);
  if(lessonId==='eyrie')assert.equal(run.game.bird.decree.recruit.length,2,'both turns promises remain');
  if(lessonId==='alliance'){
   assert.ok(actions.includes('mobilize'));assert.ok(actions.includes('revolt'));
   assert.ok(run.game.board.some(c=>c.buildings.some(b=>b.faction==='alliance')));
  }
  if(lessonId==='vagabond')assert.ok(actions.includes('refresh')&&actions.includes('explore'));
 }
});

test('journey retry restores a real turn checkpoint and old faction progress retains its node',()=>{
 for(const lessonId of ['cats','eyrie','alliance','vagabond']){
  let run=createTutorial({id:'learner',username:'Learner'},lessonId,{curriculumVersion:4});
  // Version 3 indices remain in place: additional continuous practice is appended.
  delete run.guideCursor;run.curriculumVersion=3;
  const initial=projectTutorial(run,0).tutorial.stepId;
  assert.equal(initial,{cats:'cat-setup',eyrie:'bird-leader',alliance:'wa-first',vagabond:'vg-character'}[lessonId]);
  for(let n=0;projectTutorial(run,0).tutorial.stepId!=='journey-second';n++){
   assert.ok(n<250);run=advanceTutorial(run,tutorialCommandFor(projectTutorial(run,0)));
  }
  const checkpoint=structuredClone(run.game),context=structuredClone(run.context);
  if(projectTutorial(run,0).tutorial.guide.canAdvance)run=advanceTutorial(run,{type:'guide-next'});
  run=advanceTutorial(run,tutorialCommandFor(projectTutorial(run,0)));
  run=advanceTutorial(run,{type:'retry-step'});
  assert.deepEqual(run.game,checkpoint);assert.deepEqual(run.context,context);
  assert.equal(run.ready,false);assert.equal(run.guideCursor,0);
 }
});
test('new cats curriculum teaches actions before crafting and retains the actual first-day board into day two',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'cats'),sawFirst=false,sawCraft=false,firstBoard=null,firstHand=null,firstTurn=[];
 for(let n=0;n<250&&!run.completed;n++){
  const room=projectTutorial(run,n),m=room.tutorial;
  if(m.stepId==='cat-setup')assert.equal(room.game.players.length,2);
  if(m.stepId==='cat-first-day'&&m.ready&&!sawFirst){sawFirst=true;firstBoard=structuredClone(run.game.board);firstHand=run.game.players.find(p=>p.id==='learner').hand.map(c=>c.id);assert.ok(!firstTurn.includes('craft'));assert.equal(firstTurn.filter(t=>['build','recruit','move','battle'].includes(t)).length,3);}
  if(m.stepId==='cat-second-morning'&&!m.ready){assert.ok(sawFirst);assert.ok(run.game.board.some((c,i)=>c.buildings.some(b=>b.faction==='cat'&&firstBoard[i].buildings.some(old=>old.type===b.type))));assert.ok(firstHand.every(id=>run.game.players.find(p=>p.id==='learner').hand.some(c=>c.id===id)));}
  if(m.stepId==='cat-craft'&&!sawCraft){sawCraft=true;assert.ok(sawFirst);assert.equal(run.game.turnsCompleted,2);assert.ok(m.guide.previewCard);assert.ok(run.game.players.find(p=>p.id==='learner').hand.some(c=>c.id===m.guide.previewCard.id));assert.equal(run.game.actions,3);}
  const command=tutorialCommandFor(room);if(m.stepId==='cat-first-day'&&command.type==='action')firstTurn.push(command.action.type);run=advanceTutorial(run,command);
 }
 assert.ok(run.completed&&sawCraft);
});
test('v4 saved tutorial indices remain stable and restarting opts into the new curriculum',()=>{
 let run=createTutorial({id:'learner',username:'Learner'},'cats');run.curriculumVersion=4;run.step=2;assert.equal(projectTutorial(run,0).tutorial.stepId,'cat-craft');
 run=advanceTutorial(run,{type:'restart'});assert.equal(run.curriculumVersion,9);assert.equal(projectTutorial(run,0).tutorial.stepId,'cat-setup');assert.equal(run.game.players.length,2);
});


test('cats removes the six duplicated tail lessons and retains old core progress without resetting the board',()=>{
 const user={id:'learner',username:'Learner'},fresh=createTutorial(user,'cats');
 assert.equal(tutorialCatalog().find(l=>l.id==='cats').stepCount,18);
 const old=createTutorial(user,'cats',{curriculumVersion:8}),before=structuredClone(old);
 const room=projectTutorial(old,0);assert.equal(room.tutorial.total,18);assert.equal(room.tutorial.stepId,'cat-setup');assert.deepEqual(old,before);
 const next=advanceTutorial(old,tutorialCommandFor(room));assert.equal(next.curriculumVersion,9);assert.equal(next.game.setup.catCorner,0);
 for(let step=18;step<24;step++){
  const tail={...structuredClone(old),step,ready:false,completed:false};const view=projectTutorial(tail,3);
  assert.equal(view.tutorial.completed,true);assert.equal(view.tutorial.stepId,'cat-finish');assert.equal(view.tutorial.total,18);
  assert.deepEqual(tail.game,before.game,'migration never redeals or rewrites the board');
  assert.equal(advanceTutorial(tail,{type:'restart'}).curriculumVersion,9);
 }
});
