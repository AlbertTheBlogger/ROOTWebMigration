// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import {present} from '../backend/rules/presentation.mjs';
import {createTutorial,advanceTutorial,projectTutorial} from '../backend/tutorials.mjs';
import {tutorialCommandFor,tutorialAction} from './helpers/tutorial-actions.mjs';
import {interpolateBox,unseenEvents,presentationTimes,presentationPlan,presentationLength,botStepDelay,botThinkDelay} from '../frontend/presentation-model.js';

function at(lesson,id){
 let run=createTutorial({id:'viewer',username:'Learner'},lesson,lesson==='lizard'?{curriculumVersion:6}:undefined);
 for(let n=0;n<160;n++){
  const room=projectTutorial(run,n);
  if(room.tutorial.stepId===id&&!room.tutorial.guide?.canAdvance)return run;
  run=advanceTutorial(run,tutorialCommandFor(room));
 }
 throw new Error('Missing scene '+id);
}
function act(run){const before=structuredClone(run),seq=run.game.presentationSeq||0;const next=advanceTutorial(run,{type:'action',action:tutorialAction(projectTutorial(run,0))});assert.deepEqual(run,before);return {next,events:next.game.presentationEvents.filter(event=>event.seq>seq)};}

test('camera interpolation preserves endpoints, eases between views and clamps progress',()=>{
 const from=[15,20,1170,720],to=[160,90,620,360];
 assert.deepEqual(interpolateBox(from,to,0),from);assert.deepEqual(interpolateBox(from,to,1),to);
 assert.deepEqual(interpolateBox(from,to,-1),from);assert.deepEqual(interpolateBox(from,to,2),to);
 const early=interpolateBox(from,to,.25);assert.ok(early[0]>from[0]&&early[0]<from[0]+(to[0]-from[0])*.25);
});
test('presentation metadata is bounded and strips card payloads',()=>{
 const state={};
 for(let n=0;n<90;n++)present(state,{kind:'draw',playerId:'a',count:2,card:{id:'secret-card'},cards:['hidden']});
 assert.equal(state.presentationSeq,90);assert.equal(state.presentationEvents.length,64);
 assert.ok(state.presentationEvents.every(event=>!('card' in event)&&!('cards' in event)));
 assert.throws(()=>present(state,{kind:'privateReveal'}),/Unknown/);
 assert.deepEqual(unseenEvents({presentationSeq:1},{presentationSeq:90,presentationEvents:state.presentationEvents}),[{kind:'catchup'}]);
});
test('real tutorial move emits one public route, without a duplicate arrival spawn',()=>{
 const run=at('basics','move'),before=projectTutorial(run,0).game,{next,events}=act(run),after=projectTutorial(next,1).game;
 const moves=events.filter(event=>event.kind==='move');assert.equal(moves.length,1);
 assert.deepEqual([moves[0].from,moves[0].to,moves[0].count],[0,3,1]);
 assert.ok(!events.some(event=>event.kind==='pieces'&&event.clearing===3));
 assert.deepEqual(unseenEvents(before,after),events);assert.deepEqual(unseenEvents(after,after),[]);
 assert.deepEqual(unseenEvents(null,after),[]);
 assert.deepEqual(unseenEvents(JSON.parse(JSON.stringify(after)),after),[]);
});
test('tutorial dice and scoring use authoritative results and retry does not replay a prior future',()=>{
 const run=at('basics','battle'),{next,events}=act(run);
 assert.deepEqual(events.find(event=>event.kind==='dice').values,[3,3]);
 assert.equal(events.find(event=>event.kind==='score').delta,1);
 assert.ok(events.findIndex(e=>e.kind==='dice')<events.findIndex(e=>e.kind==='score'));
 const projected=projectTutorial(next,1).game;
 for(const event of projected.presentationEvents)assert.ok(!('card' in event)&&!('cards' in event)&&!('hand' in event));
 assert.equal(projected.players.find(p=>p.id!==run.userId).hand,undefined);
 const retry=advanceTutorial(next,{type:'retry-step'});assert.deepEqual(unseenEvents(projected,projectTutorial(retry,2).game),[]);
});
test('building feedback precedes its score, and drawing reports a count without card faces',()=>{
 const build=act(at('cats','cat-build')).events;
 assert.equal(build.find(event=>event.kind==='build').building,'workshop');
 assert.ok(build.findIndex(e=>e.kind==='build')<build.findIndex(e=>e.kind==='score'));
 const draw=act(at('lizard','liz-draw')).events.find(event=>event.kind==='draw');
 assert.equal(draw.count,2);assert.equal(draw.faction,'lizard');assert.equal(Object.keys(draw).includes('card'),false);
});
test('turmoil and revolt publish a faction-wide announcement with the actual affected clearing',()=>{
 const turmoil=act(at('eyrie','bird-turmoil')).events;assert.ok(turmoil.some(event=>event.kind==='turmoil'&&event.faction==='bird'));
 const event=turmoil.find(event=>event.kind==='turmoil');assert.ok(['recruit','move','battle','build'].includes(event.column));assert.ok(event.birdCards>=2);assert.equal(event.viziers,2);assert.ok(event.leader);assert.ok(event.discarded>=0);
 assert.equal(new Set(turmoil.map(e=>e.batch)).size,1);
 const revolt=act(at('alliance','wa-revolt')).events;
 assert.ok(revolt.some(event=>event.kind==='revolt'&&event.clearing===5));assert.ok(revolt.some(event=>event.kind==='build'&&event.building==='base-fox'));
});

test('bot pacing includes the complete batch, without serializing every recruited warrior',()=>{
 assert.ok(Object.values(presentationTimes).every(duration=>duration>=1000));
 const events=[{kind:'build',batch:1},{kind:'score',batch:1},...Array.from({length:12},()=>({kind:'pieces',batch:1}))];
 assert.equal(presentationLength(events),3600);
 assert.ok(presentationPlan(events).find(slot=>slot.event.kind==='score').delay>=1800);
 const downfall=[{kind:'move',batch:2},{kind:'turmoil',batch:2},{kind:'score',faction:'bird',reason:'王朝倒台',batch:2}];
 assert.equal(presentationLength(downfall),7800);assert.equal(presentationPlan(downfall).length,2);
 for(const batch of [[],events,downfall])for(const n of [0,.1,.5,.99,1]){
  const wait=botStepDelay({presentationEvents:batch},()=>n);assert.ok(wait>=2000&&wait<=8000);assert.ok(wait>=presentationLength(batch));
 }
 assert.equal(botStepDelay({presentationEvents:[...downfall,{kind:'draw',batch:3}]},()=>0),2500);
 assert.equal(botStepDelay({presentationEvents:downfall,presentationBatch:3},()=>.8),2250,'A silent new command must not wait for an old animation again');
});
test('bot thought intervals follow the requested 70/20/10 weighted uniform distribution',()=>{
 const counts=[0,0,0];
 for(let i=0;i<10000;i++){
  const n=(i+.5)/10000,ms=botThinkDelay(()=>n),group=n<.7?0:n<.9?1:2;
  const ranges=[[2500,4500],[2000,2500],[4500,5500]];
  assert.ok(ms>=ranges[group][0]&&ms<=ranges[group][1]);counts[group]++;
 }
 assert.deepEqual(counts,[7000,2000,1000]);
});

test('outrage announces for one second, followed by a one-second supporter flight after arrival',()=>{
 const plan=presentationPlan([{kind:'move'},{kind:'outrage'},{kind:'supporter'}]);
 assert.deepEqual(plan.map(s=>[s.event.kind,s.delay,s.duration]),[['move',0,1800],['outrage',1800,1000],['supporter',2800,1000]]);
 assert.equal(presentationLength(plan.map(s=>s.event)),3800);
});
