// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTutorial,projectTutorial,advanceTutorial} from '../backend/tutorials.mjs';
import {tutorialCommandFor} from './helpers/tutorial-actions.mjs';
const user={id:'learner',username:'Learner'};
const me=run=>run.game.players.find(p=>p.id===user.id);
const item=(run,type)=>run.game.vagabond.items.find(i=>i.type===type);
function walk(id,visit=()=>{},pick=()=>{}){
 let run=createTutorial(user,id),n=0;
 for(;!run.completed&&n<300;n++){
  const room=projectTutorial(run,n),command=pick(run,room)||tutorialCommandFor(room),before=structuredClone(run);
  visit(run,room,command);const after=advanceTutorial(run,command);assert.deepEqual(run,before,'Commands must not mutate their input');
  if(['next','guide-next','guide-back'].includes(command.type))assert.deepEqual(after.game,run.game,'Dialogue must never rewrite resources or the board');
  run=after;
 }
 assert.ok(run.completed,id+' did not complete');return run;
}
function readyVisit(callback){const seen=new Set();return (run,room)=>{const id=room.tutorial.stepId;if(room.tutorial.ready&&!seen.has(id)){seen.add(id);callback(id,run,room);}};}
for(const id of ['lizard','vagabond'])test(`${id}: continuous real rounds, card/item conservation, no private future state and JSON recovery`,()=>{
 const run=walk(id,(run,room)=>{
  const g=run.game,l=g.lizard,cards=[...g.deck,...g.discard,...g.dominanceAvailable,...g.alliance.supporters,...(l?[...l.revealed,...l.lostSouls]:[]),...g.players.flatMap(p=>[...p.hand,...p.crafted]),...Object.values(g.bird.decree).flat().filter(c=>!c.vizier),...(g.combat?.ambushCard?[g.combat.ambushCard]:[])];
  assert.equal(cards.length,50);assert.equal(new Set(cards.map(c=>c.id)).size,50);
  assert.deepEqual(projectTutorial(JSON.parse(JSON.stringify(run)),room.version),room);
  assert.ok(!('refs' in room.tutorial.context)&&!('history' in room.tutorial.context)&&!('checkpoint' in room)&&!('deck' in room.game));
  assert.ok(!('ruinItems' in room.game.vagabond)&&!('questDeck' in room.game));
  assert.ok(room.game.players.filter(p=>p.id!==user.id).every(p=>!('hand' in p)));
  if(room.tutorial.guide.watch){assert.equal(room.tutorial.guide.action,undefined);assert.deepEqual(room.tutorial.actionTypes,[]);}
  const g2=room.game,m=room.tutorial;
  if(m.guide.mode==='act'&&!m.guide.watch&&m.guide.action){const a=m.guide.action;
   if(!['choice','end','birdsong-end','refresh-done','slip-done','conspiracies-done','lizard-craft-done','discard','craft'].includes(a.type))assert.ok([...g2.mapActions,...g2.factionActions.map(o=>o.action)].some(b=>JSON.stringify(a)===JSON.stringify(b)),'Actual UI must expose '+JSON.stringify(a));
  }
  if(id==='vagabond'){
   const types=['boot','torch','tea','sword','hammer','crossbow','bag','coin'];
   for(const type of types){const supply=g.itemSupply[type]||0,playerItems=g.players.reduce((n,p)=>n+p.items.filter(t=>t===type).length,0),vg=g.vagabond.items.filter(i=>i.type===type),ruins=Object.values(g.vagabond.ruinItems).filter(t=>t===type).length;
    // Starting items are added by the true setup choice; crafted/aid items must come from the shared supply, ruin tools from ruins.
    const fromSupply=vg.filter(i=>['crafted','aid'].includes(i.source)).length;
    const initial={boot:2,tea:2,sword:2,hammer:1,crossbow:1,bag:2,coin:2}[type]||0;
    assert.equal(supply+playerItems+fromSupply,initial,'Crafted/aid supply conserved: '+type);
    if(g.setup.complete&&['boot','hammer','sword','bag'].includes(type))assert.equal(ruins+vg.filter(i=>i.source==='ruin').length,1);
   }
   assert.equal(g.quests.length+g.questDeck.length+g.vagabond.completedQuests.length,15);
  }
 });
 assert.equal(run.game.turnsCompleted,id==='lizard'?8:10);assert.equal(run.game.round,id==='lizard'?5:6);
});
test('Lizard spends yesterday\'s real souls and acolytes, retains displayed cards, crafts and loses a real garden',()=>{
 let foxIDs,scoringCard;
 walk('lizard',readyVisit((id,run)=>{
  const g=run.game,l=g.lizard,refs=run.context.refs;
  if(id==='liz-recruit'){foxIDs=l.revealed.map(c=>c.id);assert.equal(foxIDs.length,2);assert.ok(foxIDs.includes(refs.foxRecruit2));}
  if(id==='liz-first-night'){assert.equal(l.revealed.length,0);for(const c of foxIDs)assert.ok(me(run).hand.some(x=>x.id===c));assert.equal(l.lostSouls.length,0);}
  if(id==='liz-revenge'){assert.equal(l.acolytes,2);assert.equal(g.board[0].warriors.lizard,2);assert.deepEqual(l.lostSouls.map(c=>c.suit),['mouse']);}
  if(id==='liz-outcast'){assert.equal(l.outcast,'mouse');assert.equal(l.hated,false);assert.equal(l.lostSouls.length,0);}
  if(id==='liz-convert'){assert.equal(l.acolytes,0);assert.equal(g.board[4].warriors.cat,0);assert.equal(g.board[4].warriors.lizard,2);}
  if(id==='liz-score'){scoringCard=refs.foxBuild;assert.ok(l.lostSouls.some(c=>c.id===scoringCard));assert.equal(me(run).score,2);}
  if(id==='liz-sacrifice'){assert.equal(l.acolytes,1);assert.ok(l.revealed.some(c=>c.id===refs.wild1));assert.ok(!l.lostSouls.some(c=>c.id===refs.wild1));}
  if(id==='liz-second-defense'){assert.equal(l.acolytes,3);assert.equal(l.lostSouls.filter(c=>c.suit==='mouse').length,2);assert.equal(l.lostSouls.filter(c=>c.suit==='fox').length,1);}
  if(id==='liz-hated'){assert.equal(l.hated,true);assert.equal(l.outcast,'mouse');}
  if(id==='liz-sanctify'){assert.equal(l.acolytes,0);assert.ok(g.board[6].buildings.some(b=>b.type==='garden-mouse'));assert.ok(!g.board[6].buildings.some(b=>b.type==='workshop'));}
  if(id==='liz-third-night'){assert.ok(me(run).items.includes('tea'));assert.ok(l.lostSouls.some(c=>c.id===refs.foxRecruit2));}
  if(id==='liz-fear'){assert.ok(!g.board[0].buildings.some(b=>b.type==='garden-fox'));assert.equal(g.randomEvents.filter(e=>e.type==='garden-fear').length,1);assert.equal(l.acolytes,2);assert.equal(g.board.flatMap(c=>c.buildings).filter(b=>b.faction==='lizard').length,3);}
  if(id==='liz-crusade'){assert.equal(l.acolytes,1,'Attacking losses must not grant revenge');assert.equal(g.board[5].warriors.cat,0);}
 }));assert.ok(scoringCard);
});
test('Vagabond reuses the explored hammer, exchanges actual crafted tea, loses goodwill and distinguishes refresh, repair and forest rest',()=>{
 let hammer,questScore;
 walk('vagabond',readyVisit((id,run)=>{
  const g=run.game,vg=g.vagabond;
  if(id==='vg-explore'){hammer=item(run,'hammer').id;assert.equal(item(run,'hammer').source,'ruin');assert.equal(g.board[5].ruins,0);assert.equal(item(run,'torch').exhausted,true);}
  if(id==='vg-craft'){assert.equal(item(run,'hammer').id,hammer);assert.equal(item(run,'hammer').exhausted,true);assert.equal(item(run,'crossbow').source,'crafted');}
  if(id==='vg-move'){assert.equal(vg.position,4);assert.equal(item(run,'boot').exhausted,true);}
  if(id==='vg-exchange'){assert.equal(vg.items.filter(i=>i.type==='tea').length,2);assert.equal(vg.items.find(i=>i.source==='aid').type,'tea');assert.equal(vg.relations.cat,1);assert.equal(g.players[0].items.length,0);}
  if(id==='vg-aid-twice')assert.equal(vg.relations.cat,2);
  if(id==='vg-quest'){assert.equal(vg.completedQuests[0].id,'RepairaShedFox');assert.equal(item(run,'hammer').id,hammer);assert.equal(item(run,'hammer').exhausted,true);questScore=me(run).score;}
  if(id==='vg-injury'){assert.equal(vg.relations.cat,-1);assert.equal(item(run,'boot').damaged,true);assert.equal(item(run,'torch').damaged,true);assert.equal(item(run,'hammer').damaged,false);assert.equal(me(run).score,questScore,'Defensive removal gives no infamy');}
  if(id==='vg-repair'){assert.equal(item(run,'boot').damaged,false);assert.equal(item(run,'boot').exhausted,true);assert.equal(item(run,'torch').damaged,true);assert.equal(item(run,'hammer').id,hammer);}
  if(id==='vg-strike')assert.equal(me(run).score,questScore,'Crossbow warrior removal gives no battle infamy');
  if(id==='vg-retreat'){assert.equal(vg.position,13);assert.equal(item(run,'torch').damaged,true);}
  if(id==='vg-rest')assert.ok(vg.items.every(i=>!i.damaged&&!i.exhausted));
  if(id==='vg-return'){assert.equal(vg.position,5);assert.equal(item(run,'boot').exhausted,false);assert.equal(vg.relations.cat,-1);assert.ok(g.board[5].warriors.cat>0);}
  if(id==='vg-own-plan'){assert.equal(vg.completedQuests.length,2);assert.equal(me(run).score,questScore+2);}
 }));
});
test('final authored alternatives execute: keep acolytes and recruit elsewhere; quest cards or theft compete for the torch',()=>{
 const liz=walk('lizard',()=>{},(run,room)=>{
  const m=room.tutorial;if(m.guide.mode!=='act'||m.guide.watch)return;
  if(m.stepId==='liz-own-conspiracy')return {type:'action',action:{type:'conspiracies-done'}};
  if(m.stepId==='liz-own-ritual')return {type:'action',action:m.guide.alternatives.at(-1)};
 });assert.equal(liz.game.lizard.acolytes,1);
 for(const branch of ['cards','special']){
  let picked=false;
  const vg=walk('vagabond',()=>{},(run,room)=>{
   const m=room.tutorial;if(m.stepId==='vg-own-plan'&&m.guide.mode==='act'){
    const a=m.guide.alternatives.find(a=>branch==='cards'?a.reward==='cards':a.type==='special');assert.ok(a);picked=true;return {type:'action',action:a};
   }
  });assert.ok(picked);assert.equal(vg.game.vagabond.completedQuests.length,branch==='cards'?2:1);assert.equal(item(vg,'torch').exhausted,true);
 }
});
test('retry restores actual pending damage and random fear; old v6 saves upgrade only after explicit restart',()=>{
 for(const id of ['lizard','vagabond']){
  let checkpointSeen=false;
  walk(id,(run,room)=>{
   if(checkpointSeen||!(id==='vagabond'?room.game.choice?.kind==='vagabond-damage':room.tutorial.stepId==='liz-fear'&&room.tutorial.ready))return;
   const retried=advanceTutorial(run,{type:'retry-step'});assert.deepEqual(retried.game,run.checkpoint.game);assert.deepEqual(retried.context,run.checkpoint.context);checkpointSeen=true;
   let replay=retried;for(let n=0;!replay.ready&&n<50;n++)replay=advanceTutorial(replay,tutorialCommandFor(projectTutorial(replay,n)));
   if(id==='lizard'){assert.deepEqual(replay.game,run.game);assert.equal(replay.game.randomEvents.findLast(e=>e.type==='garden-fear').card,run.game.randomEvents.findLast(e=>e.type==='garden-fear').card);}
  });assert.ok(checkpointSeen);
  let old=createTutorial(user,id,{curriculumVersion:6});for(let n=0;n<9;n++)old=advanceTutorial(old,tutorialCommandFor(projectTutorial(old,n)));
  const room=projectTutorial(old,3);assert.equal(room.tutorial.legacy,true);assert.deepEqual(projectTutorial(JSON.parse(JSON.stringify(old)),3),room);
  const restart=advanceTutorial(old,{type:'restart'});assert.equal(restart.curriculumVersion,9);assert.equal(projectTutorial(restart,0).tutorial.stepId,id==='lizard'?'liz-intro':'vg-intro');
 }
});
