// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as v4 from '../backend/rules/versions/cats-birds.mjs';
import * as v5 from '../backend/rules/versions/base-four.mjs';
import * as v6 from '../backend/rules/versions/lizard-cult.mjs';
import {createQueue,enqueue} from '../backend/rules/effects/queue.mjs';
function fixture(rules,factions){
 let s=rules.createGame(factions.map(faction=>({userId:faction,name:faction,faction})),()=>0);
 while(!s.setup.complete){const q=s.effects.frames[0];s=rules.applyAction(s,q.playerId,{type:'choice',choiceId:q.id,optionId:q.options[0].id},()=>0);}
 s.effects.frames=[];s.combat=null;s.turn=s.players.findIndex(p=>p.faction==='cat');s.phase='daylight';s.march=0;
 for(const p of s.players)p.hand=[];
 s.players.find(p=>p.faction==='cat').crafted.push({id:'shoe',kind:'cobbler',name:'补鞋匠'});return s;
}
for(const [name,rules,factions] of [['v4',v4,['cat','bird']],['v5',v5,['cat','bird','alliance','vagabond']],['v6',v6,['cat','bird','alliance','lizard']]]){
 const act=(s,id,a)=>rules.applyAction(s,id,a,()=>0);
 test(`${name}: Cobbler remains available before drawing, after discarding, and until Evening ends`,()=>{
  let s=fixture(rules,factions);s=act(s,'cat',{type:'end'});assert.equal(s.phase,'evening');assert.equal(s.effects.frames.length,0);
  const before=structuredClone(s);s=act(s,'cat',{type:'evening-continue'});assert.deepEqual(before.phase,'evening');assert.equal(s.phase,'evening-end');
  let view=rules.projectGame(s,'cat');const option=view.factionActions.find(o=>o.action.cobbler);assert.ok(option);s=act(s,'cat',option.action);
  assert.equal(s.phase,'evening-end');assert.equal(rules.projectGame(s,'cat').nightCobbler,false);assert.throws(()=>act(s,'cat',option.action),/夜晚使用一次/);
  s=act(s,'cat',{type:'evening-end'});assert.notEqual(s.players[s.turn].id,'cat');
  s=fixture(rules,factions);s.phase='discard';s.players.find(p=>p.id==='cat').hand=Array.from({length:6},(_,i)=>({id:'d'+i,kind:'ambush',suit:'fox',name:'discard'}));
  s=act(s,'cat',{type:'discard',card:'d0'});assert.equal(s.phase,'evening-end');assert.ok(rules.projectGame(s,'cat').nightCobbler);
  s=act(s,'cat',{type:'evening-end'});assert.notEqual(s.players[s.turn].id,'cat');
 });
 test(`${name}: no-ambush-only-pass is automatic; actual ambush and hospital decisions remain`,()=>{
  let s=fixture(rules,factions);s.players.find(p=>p.id==='cat').crafted=[];
  s.board.forEach(c=>{c.warriors.cat=0;c.warriors.bird=0;c.buildings=[];c.keep=false;c.wood=0;});
  s.board[3].warriors.cat=1;s.board[3].warriors.bird=1;s.actions=3;
  s=act(s,'cat',{type:'battle',clearing:3,defender:'bird'});
  assert.equal(s.effects.frames.length,0);assert.equal(s.combat,null,'No bot choice/timer required for automatic casualties');
  s=fixture(rules,factions);s.players.find(p=>p.id==='cat').crafted=[];s.board[3].warriors.cat=2;s.board[3].warriors.bird=1;
  s.players.find(p=>p.id==='bird').hand=[{id:'amb',kind:'ambush',suit:'wild',name:'ambush'}];
  s=act(s,'cat',{type:'battle',clearing:3,defender:'bird'});assert.equal(s.effects.frames[0].kind,'ambush');assert.equal(s.effects.frames[0].options.length,2);
  s=act(s,'bird',{type:'choice',choiceId:s.effects.frames[0].id,optionId:'amb'});
  assert.ok(s.effects.frames[0]?.kind!=='counter-ambush','No matching counter-ambush should not require a pass');
 });
}
for(const rules of [v5,v6])test(`${rules.RULESET}: Alliance may recruit, then use Cobbler without spending an officer operation`,()=>{
 let s=fixture(rules,['cat','bird','alliance','vagabond']);s.turn=s.players.findIndex(p=>p.id==='alliance');s.phase='military';s.usedEffects=[];
 s.players.find(p=>p.id==='alliance').crafted=[{id:'shoe-alliance',kind:'cobbler',name:'补鞋匠'}];s.alliance.operations=2;s.alliance.officers=2;
 s.board[3].warriors.alliance=2;s.board[3].buildings=[{faction:'alliance',type:'base-fox'}];
 s=rules.applyAction(s,'alliance',{type:'recruit',clearing:3},()=>0);assert.equal(s.alliance.operations,1);
 const option=rules.projectGame(s,'alliance').factionActions.find(o=>o.action.cobbler&&o.action.from===3);assert.ok(option);
 const restored=JSON.parse(JSON.stringify(s));s=rules.applyAction(restored,'alliance',option.action,()=>0);assert.equal(s.alliance.operations,1);assert.equal(s.phase,'military');
});
for(const rules of [v5,v6])test(`${rules.RULESET}: a saved old beginning-of-Evening pass does not consume Cobbler`,()=>{
 let s=fixture(rules,['cat','bird','alliance','vagabond']);s.turn=s.players.findIndex(p=>p.id==='alliance');s.phase='evening-start';
 s.players.find(p=>p.id==='alliance').crafted=[{id:'legacy-shoe',kind:'cobbler',name:'补鞋匠'}];s.alliance.officers=2;
 s.effects=enqueue(createQueue(),[{type:'choice',kind:'free-move',playerId:'alliance',prompt:'legacy',options:[{id:'pass',label:'跳过',value:null}],resume:{}},{type:'effect',kind:'evening-score',data:{}}]);
 s=rules.applyAction(JSON.parse(JSON.stringify(s)),'alliance',{type:'choice',choiceId:s.effects.frames[0].id,optionId:'pass'},()=>0);
 assert.equal(s.phase,'military');assert.ok(rules.projectGame(s,'alliance').nightCobbler);
});
test('Vagabond can use Cobbler after forest repair and drawing, without exhausting a boot',()=>{
 let s=fixture(v5,['cat','bird','alliance','vagabond']);s.turn=s.players.findIndex(p=>p.id==='vagabond');s.phase='daylight';s.vagabond.position=12;s.usedEffects=[];
 s.players.find(p=>p.id==='vagabond').crafted=[{id:'v-shoe',kind:'cobbler',name:'补鞋匠'}];s.vagabond.items.forEach(i=>{i.damaged=true;i.exhausted=true;});
 s=v5.applyAction(s,'vagabond',{type:'end'},()=>0);assert.equal(s.phase,'evening');s=v5.applyAction(s,'vagabond',{type:'evening-continue'},()=>0);
 assert.equal(s.phase,'evening-end');assert.ok(s.vagabond.items.every(i=>!i.damaged&&!i.exhausted));
 const move=v5.projectGame(s,'vagabond').factionActions.find(o=>o.action.cobbler).action;s=v5.applyAction(s,'vagabond',move,()=>0);
 assert.ok(s.vagabond.items.every(i=>!i.exhausted));assert.equal(s.vagabond.position,move.to);
});
