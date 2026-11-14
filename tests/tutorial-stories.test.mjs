// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,projectTutorial,advanceTutorial} from '../backend/tutorials.mjs';
import {tutorialCommandFor} from './helpers/tutorial-actions.mjs';

const user={id:'learner',username:'Learner'};
function walk(id,visit=()=>{},pick=undefined){
 let run=createTutorial(user,id),n=0;
 for(;!run.completed&&n<260;n++){
  const room=projectTutorial(run,n),command=pick?.(room)||tutorialCommandFor(room),source=run,before=structuredClone(run);
  visit(run,room,command);run=advanceTutorial(run,command);assert.deepEqual(source,before);
  if(command.type==='next')assert.deepEqual(run.game,before.game,'Teaching transitions must not rewrite the board or resources');
  const cards=[...run.game.deck,...run.game.discard,...run.game.alliance.supporters,...run.game.players.flatMap(p=>[...p.hand,...p.crafted]),...Object.values(run.game.bird.decree).flat().filter(c=>!c.vizier),...(run.game.combat?.ambushCard?[run.game.combat.ambushCard]:[])];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50,'Two-player deck must retain its 50 non-dominance cards without injections');
 }
 assert.ok(run.completed,id+' did not finish');return {run,commands:n};
}
for(const id of ['eyrie','alliance'])test(`${id}: four real continuous rounds retain resources and expose no script/checkpoint`,()=>{
 const {run}=walk(id,(run,room)=>{
  assert.deepEqual(projectTutorial(JSON.parse(JSON.stringify(run)),room.version),room,'JSON save/load must retain the current instruction');
  assert.ok(!('refs' in room.tutorial.context)&&!('history' in room.tutorial.context)&&!('checkpoint' in room));
  assert.ok(room.game.players.filter(p=>p.id!==user.id).every(p=>!('hand' in p)));
  if(room.tutorial.guide.watch){assert.ok(!room.tutorial.guide.action);assert.equal(room.tutorial.actionTypes.length,0);}
  if(room.tutorial.guide.mode==='act'&&!room.tutorial.guide.watch&&['move','recruit','battle','build','spread','revolt','organize'].includes(room.tutorial.guide.action?.type))assert.ok(room.game.mapActions.length,'The actual map UI must expose the authored spatial action');
 });
 assert.equal(run.game.turnsCompleted,8);assert.equal(run.game.round,5);
 assert.equal(run.context.history.filter(e=>e.actor===user.id&&e.action.type===(id==='eyrie'?'end':'military-done')).length,id==='eyrie'?3:4);
});
test('Eyrie prepares armor, defends once, loses its real Fox roost, then suffers old-decree turmoil and rebuilds',()=>{
 const seen=new Set();let originalRecruit;
 const {run}=walk('eyrie',(run,room)=>{
  const m=room.tutorial,g=run.game;if(!m.ready||seen.has(m.stepId))return;seen.add(m.stepId);
  if(m.stepId==='bird-add')originalRecruit=g.bird.decree.recruit[0].id;
  if(m.stepId==='bird-defense'){assert.ok(g.board[0].buildings.some(b=>b.type==='roost'));assert.ok(!g.players.find(p=>p.id===user.id).crafted.some(c=>c.kind==='armorers'));assert.ok(g.discard.some(c=>c.kind==='armorers'));}
  if(m.stepId==='bird-day2-execute')assert.equal(g.bird.decree.recruit[0].id,originalRecruit);
  if(m.stepId==='bird-lost-roost'){assert.ok(!g.board[0].buildings.some(b=>b.type==='roost'));assert.equal(g.bird.decree.recruit[0].id,originalRecruit);}
  if(m.stepId==='bird-turmoil'){assert.equal(g.phase,'leader');const event=g.presentationEvents.findLast(e=>e.kind==='turmoil');assert.equal(event.column,'recruit');assert.equal(event.birdCards,3);assert.ok(g.board[1].buildings.some(b=>b.type==='roost'));assert.ok(g.board[2].buildings.some(b=>b.type==='roost'));}
 });
 assert.ok(run.game.board[3].buildings.some(b=>b.type==='roost'));assert.equal(run.game.bird.leader,'builder');
 for(const id of ['bird-defense','bird-lost-roost','bird-turmoil'])assert.ok(seen.has(id));
});
test('Alliance spends yesterday\'s mobilized cards, retains sympathy, sees unequal guerrilla dice and trains before move-organize',()=>{
 const seen=new Set();let supportBeforeTrain;
 walk('alliance',(run,room)=>{
  const m=room.tutorial,g=run.game,p=g.players.find(p=>p.id===user.id),refs=run.context.refs;
  if(m.stepId==='wa-train'&&!m.ready)supportBeforeTrain=g.alliance.supporters.length;
  if(!m.ready||seen.has(m.stepId))return;seen.add(m.stepId);
  if(m.stepId==='wa-mobilize')for(const id of [refs.mobilize1,refs.mobilize2])assert.ok(g.alliance.supporters.some(c=>c.id===id));
  if(m.stepId==='wa-revolt'){
   assert.ok(g.board[5].sympathy);assert.ok(g.board[5].buildings.some(b=>b.type==='base-fox'));assert.equal(g.board[5].warriors.alliance,2);assert.equal(g.alliance.officers,1);
   for(const id of [refs.mobilize1,refs.mobilize2])assert.ok(g.discard.some(c=>c.id===id));
  }
  if(m.stepId==='wa-second-night')assert.equal(g.board[5].warriors.alliance,3);
  if(m.stepId==='wa-guerrilla'){assert.deepEqual(g.randomEvents.findLast(e=>e.type==='battle-dice').values,[3,1]);assert.equal(g.board[5].warriors.alliance,2);assert.equal(g.board[5].warriors.cat,0);assert.equal(g.alliance.officers,1);}
  if(m.stepId==='wa-train'){assert.equal(g.alliance.officers,2);assert.equal(g.alliance.supporters.length,supportBeforeTrain);assert.ok(!p.hand.some(c=>c.id===refs.training));}
  if(m.stepId==='wa-organize'){assert.ok(g.board[4].sympathy);assert.equal(g.board[4].warriors.alliance,0);assert.equal(g.board[5].warriors.alliance,1);}
  if(m.stepId==='wa-craft')assert.ok(p.items.includes('tea'));
 });
 for(const id of ['wa-revolt','wa-guerrilla','wa-train','wa-organize','wa-craft'])assert.ok(seen.has(id));
});
test('final lessons allow alternative recruitment, move counts and Alliance development plans',()=>{
 let moved=0,trained=false;
 walk('eyrie',()=>{},room=>{
  const m=room.tutorial,a=m.guide.alternatives;
  if(m.guide.mode==='act'&&!m.guide.watch&&m.guide.allowAlternatives){const action=m.stepId==='bird-day4-execute'&&a[0].type==='move'?a.at(-1):a[0];if(action.type==='move')moved=action.count;return {type:'action',action};}
 });
 assert.equal(moved,4);
 walk('alliance',()=>{},room=>{
  const m=room.tutorial;if(m.guide.mode!=='act'||m.guide.watch)return;
  if(m.stepId==='wa-development'){const action=m.guide.alternatives.find(a=>a.type==='train');assert.ok(action);trained=true;return {type:'action',action};}
  if(m.stepId==='wa-own-night'&&m.guide.action?.type!=='end')return {type:'action',action:{type:'military-done'}};
 });assert.ok(trained);
});
test('retry restores authored battle checkpoint and old v5 chapters only upgrade on explicit restart',()=>{
 let run=createTutorial(user,'eyrie');
 for(let n=0;projectTutorial(run,n).game.choice?.kind!=='battle-effects';n++){assert.ok(n<100);run=advanceTutorial(run,tutorialCommandFor(projectTutorial(run,n)));}
 const saved=structuredClone(run.checkpoint);run=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(run.game,saved.game);assert.deepEqual(run.context,saved.context);assert.equal(run.guideCursor,0);assert.equal(run.ready,false);
 for(const id of ['eyrie','alliance']){
  let old=createTutorial(user,id,{curriculumVersion:5});for(let n=0;n<8;n++)old=advanceTutorial(old,tutorialCommandFor(projectTutorial(old,n)));
  const restored=JSON.parse(JSON.stringify(old));assert.deepEqual(projectTutorial(restored,2),projectTutorial(old,2));assert.equal(projectTutorial(old,2).tutorial.total,id==='eyrie'?12:16);
  const fresh=advanceTutorial(old,{type:'restart'});assert.equal(fresh.curriculumVersion,9);assert.equal(projectTutorial(fresh,0).tutorial.stepId,id==='eyrie'?'bird-intro':'wa-intro');
 }
});
test('condensed opponent passages fold bookkeeping, retain real actions and stop at their result',()=>{
 for(const [id,targets] of [['eyrie',['bird-recovery-reply','bird-final-reply']],['alliance',['wa-third-reply','wa-final-reply']],['riverfolk',['rf-quiet']]]){
  let run=createTutorial(user,id),seen=new Set();
  for(let n=0;!run.completed;n++){
   assert.ok(n<260);const room=projectTutorial(run,n),meta=room.tutorial;
   if(!targets.includes(meta.stepId))assert.equal(!!meta.guide.auto,false,'new mechanics and player decisions retain manual pacing');
   if(targets.includes(meta.stepId)&&!run.ready){
    const start=run.context.history.length;let commands=0;
    assert.equal(meta.guide.condensed,true);assert.equal(meta.guide.auto,false);
    do{const source=run,before=structuredClone(run);run=advanceTutorial(run,{type:'coach-next'});assert.deepEqual(source,before);commands++;const next=projectTutorial(run,n);assert.equal(next.tutorial.stepId,meta.stepId);if(!run.ready)assert.equal(next.tutorial.guide.auto,true);}while(!run.ready);
    const performed=run.context.history.slice(start);assert.equal(performed.filter(e=>e.action.type!=='discard').length,id==='riverfolk'?17:3,'every authored rules action still executes');assert.ok(commands<performed.length,'no-animation transitions should not require individual commands');
    assert.equal(projectTutorial(run,n).tutorial.guide.auto,false,'reading the result is manual');
    if(id==='riverfolk'){assert.equal(run.game.riverfolk.payments.length,0);assert.equal(run.game.riverfolk.funds.length,5);assert.equal(run.game.turnsCompleted,11);}
    seen.add(meta.stepId);continue;
   }
   run=advanceTutorial(run,tutorialCommandFor(room));
  }
  assert.equal(seen.size,targets.length);
 }
});
