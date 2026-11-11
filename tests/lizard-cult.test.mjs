// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../backend/rules/versions/lizard-cult.mjs';
import * as registry from '../backend/rules/versions/registry.mjs';
import * as legacy from '../backend/rules/versions/base-four.mjs';
import { candidates } from '../backend/bots/test-policy.mjs';

const members=factions=>factions.map(faction=>({userId:faction,faction,name:faction}));
const act=(s,f,a,rng=()=>0)=>rules.applyAction(s,f,a,rng);
const player=(s,f)=>s.players.find(p=>p.faction===f);
const card=(id,suit='fox',kind='ambush')=>({id,name:id,suit,kind});
function resolve(s,pick=c=>c.options.find(o=>o.id==='pass')||c.options[0]){
  for(let n=0;s.effects.frames[0]?.type==='choice';n++){
    assert.ok(n<50);const c=s.effects.frames[0];s=act(s,c.playerId,{type:'choice',choiceId:c.id,optionId:pick(c).id});
  }return s;
}
function setup(factions=['cat','bird','alliance','lizard']){
  return resolve(rules.createGame(members(factions),()=>0));
}
function turn(s,f='lizard',phase='daylight'){
  s.turn=s.players.findIndex(p=>p.faction===f);s.phase=phase;s.effects.frames=[];s.combat=null;s.craftingUsed=[];return s;
}
function garden(s,c,n=1){c.keep=false;for(let i=0;i<n;i++)c.buildings.push({faction:'lizard',type:'garden-'+c.suit});}
function options(s){return rules.projectGame(s,'lizard').factionActions;}
function conservation(s){
  const cards=[...s.deck,...s.discard,...s.dominanceAvailable,...s.lizard.lostSouls,...s.lizard.revealed,
    ...s.players.flatMap(p=>[...p.hand,...p.crafted,...(p.dominance?[p.dominance]:[])]),...s.alliance.supporters,
    ...Object.values(s.bird.decree).flat().filter(c=>!c.vizier),...(s.combat?.ambushCard?[s.combat.ambushCard]:[])];
  assert.equal(cards.length,s.players.length>=3?54:50);assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);
  const board=s.board.reduce((n,c)=>n+c.warriors.lizard,0);assert.ok(board+s.lizard.acolytes<=25);assert.ok(s.lizard.acolytes>=0);
  for(const suit of ['fox','rabbit','mouse'])assert.ok(s.board.reduce((n,c)=>n+c.buildings.filter(b=>b.type==='garden-'+suit).length,0)<=5);
  for(const c of s.board)assert.ok(c.buildings.length+c.ruins<=c.slots);
}

test('v6 setup works with every base faction and preserves v5 routing',()=>{
  for(const factions of [['cat','bird','alliance','lizard'],['cat','lizard'],['bird','lizard'],['alliance','lizard'],['vagabond','lizard'],['bird','alliance','vagabond','lizard']]){
    const s=setup(factions),home=s.board[s.setup.lizardCorner];assert.equal(home.warriors.lizard,4);
    for(const id of home.links)assert.equal(s.board[id].warriors.lizard,1);
    assert.notEqual(s.setup.catCorner,s.setup.lizardCorner);assert.notEqual(s.setup.birdCorner,s.setup.lizardCorner);
    assert.equal(s.stateSchemaVersion,6);conservation(s);
    for(const faction of factions)assert.doesNotThrow(()=>registry.projectGame(s,faction));
  }
  const old=legacy.createGame(members(['cat','bird']),()=>0);assert.equal(registry.projectGame(old,'cat').ruleset,'root-base-four-v5');
});
test('Pilgrims override both an overwhelming enemy army and Eyrie ties',()=>{
  const c={warriors:{cat:25,bird:20,lizard:0},buildings:[{faction:'lizard',type:'garden-fox'}]};assert.equal(rules.ruler(c),'lizard');
  c.buildings=[];assert.equal(rules.ruler(c),'cat');
});
test('all spent cards enter Lost Souls; dominance only becomes available on clearing the pile',()=>{
  let s=turn(setup(),'cat','daylight');player(s,'cat').hand=[card('payment','wild'),card('dom','fox','dominance')];
  s=act(s,'cat',{type:'extra',card:'payment'});assert.equal(s.discard.length,0);assert.equal(s.lizard.lostSouls[0].id,'payment');
  s.lizard.lostSouls.push(player(s,'cat').hand.pop());s=turn(s,'lizard','birdsong');s=act(s,'lizard',{type:'birdsong-end'});
  assert.equal(s.lizard.lostSouls.length,0);assert.equal(s.dominanceAvailable[0].id,'dom');assert.ok(s.discard.some(c=>c.id==='payment'));
});
test('Outcast changes on a unique majority; same suit, ties and empty piles become Hated',()=>{
  for(const suits of [[],['fox','rabbit'],['fox','fox'],['wild','wild']]){
    let s=turn(setup(),'lizard','birdsong');s.lizard.outcast='fox';s.lizard.hated=false;s.lizard.lostSouls=suits.map((v,i)=>card('lost'+i,v));
    s=act(s,'lizard',{type:'birdsong-end'});assert.equal(s.lizard.outcast,'fox');assert.equal(s.lizard.hated,true);
  }
  let s=turn(setup(),'lizard','birdsong');s.lizard.outcast='fox';s.lizard.hated=true;s.lizard.lostSouls=[card('rabbit','rabbit')];
  s=act(s,'lizard',{type:'birdsong-end'});assert.equal(s.lizard.outcast,'rabbit');assert.equal(s.lizard.hated,false);
});
test('rituals reveal public cards, forbid bird substitution and reuse, and return them before Evening craft',()=>{
  let s=turn(setup());const c=s.board.find(c=>!c.keep);player(s,'lizard').hand=[card('reveal',c.suit),card('bird','wild')];
  s=act(s,'lizard',{type:'ritual-recruit',clearing:c.id,card:'reveal'});
  const other=rules.projectGame(s,'cat');assert.equal(other.lizard.revealed[0].id,'reveal');assert.equal(other.players.find(p=>p.faction==='lizard').hand,undefined);
  assert.throws(()=>act(s,'lizard',{type:'ritual-recruit',clearing:c.id,card:'reveal'}));
  assert.throws(()=>act(s,'lizard',{type:'ritual-recruit',clearing:c.id,card:'bird'}));
  s=act(s,'lizard',{type:'sacrifice',card:'bird'});assert.equal(s.lizard.acolytes,1);
  s=resolve(act(s,'lizard',{type:'end'}));assert.equal(s.phase,'lizard-craft');assert.equal(s.lizard.revealed.length,0);assert.equal(player(s,'lizard').hand.length,2);
});
test('garden ritual requires rule and free slots; garden supply is five per suit',()=>{
  let s=turn(setup());const c=s.board.find(c=>!c.keep&&c.buildings.length+c.ruins<c.slots);c.warriors={cat:0,bird:0,alliance:0,lizard:1};
  player(s,'lizard').hand=[card('build',c.suit)];s=act(s,'lizard',{type:'ritual-build',clearing:c.id,card:'build'});assert.equal(rules.ruler(s.board[c.id]),'lizard');
  player(s,'lizard').hand=[card('other',c.suit)];s.board[c.id].slots=s.board[c.id].buildings.length+s.board[c.id].ruins;assert.throws(()=>act(s,'lizard',{type:'ritual-build',clearing:c.id,card:'other'}));
  const suit=c.suit;s.board.forEach(area=>area.buildings=area.buildings.filter(b=>b.faction!=='lizard'));
  const matching=s.board.filter(area=>area.suit===suit);matching.forEach(area=>{area.keep=false;area.slots=6;area.ruins=0;area.warriors.lizard=1;});garden(s,matching[0],5);
  assert.throws(()=>act(s,'lizard',{type:'ritual-build',clearing:matching[1].id,card:'other'}));
  assert.equal(player(s,'lizard').hand.length,1);
});
test('scoring requires a garden, spends the card and is once per suit; immediate victory is supported',()=>{
  let s=turn(setup());s.board.forEach(c=>c.buildings=c.buildings.filter(b=>b.faction!=='lizard'));const c=s.board.find(c=>!c.keep&&c.slots-c.ruins>=2);
  player(s,'lizard').hand=[card('score',c.suit),card('again',c.suit)];assert.throws(()=>act(s,'lizard',{type:'ritual-score',card:'score'}));
  garden(s,c,2);s=act(s,'lizard',{type:'ritual-score',card:'score'});assert.equal(player(s,'lizard').score,2);assert.equal(s.lizard.lostSouls.at(-1).id,'score');assert.throws(()=>act(s,'lizard',{type:'ritual-score',card:'again'}));
  s.lizard.scoredSuits=[];player(s,'lizard').score=28;s=act(s,'lizard',{type:'ritual-score',card:'again'});assert.equal(s.winner,'lizard');
});
test('convert pays discounted acolytes, replaces one warrior and resolves cat hospital after placement',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');const c=s.board.find(c=>!c.keep);c.warriors.cat=1;s.lizard.outcast=c.suit;s.lizard.hated=true;s.lizard.acolytes=1;player(s,'cat').hand=[card('hospital',c.suit)];
  s=act(s,'lizard',{type:'convert',clearing:c.id,target:'cat'});assert.equal(s.lizard.acolytes,0);assert.equal(s.board[c.id].warriors.cat,0);assert.ok(s.board[c.id].warriors.lizard>0);assert.equal(s.effects.frames[0].kind,'hospital');
  s=resolve(s,c=>c.options.find(o=>o.id==='hospital'));assert.ok(s.lizard.lostSouls.some(c=>c.id==='hospital'));
});
test('conversion can use the supply returned by paying acolytes, and cannot target a pawn or the keep',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');s.board.forEach(c=>c.warriors.lizard=0);const c=s.board.find(c=>!c.keep);c.warriors.lizard=23;c.warriors.cat=1;s.lizard.acolytes=2;s.lizard.outcast=c.suit;
  s=resolve(act(s,'lizard',{type:'convert',clearing:c.id,target:'cat'}));assert.equal(s.board[c.id].warriors.lizard,24);assert.equal(s.lizard.acolytes,0);
  s.lizard.acolytes=3;s.board[c.id].keep=true;assert.throws(()=>act(s,'lizard',{type:'convert',clearing:c.id,target:'cat'}));
});
test('Sanctify replaces a building even in a full clearing, awards a point and triggers Alliance base loss',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');const c=s.board.find(c=>!c.keep&&c.slots>c.ruins);c.buildings=[{faction:'alliance',type:'base-'+c.suit}];c.slots=c.ruins+1;
  s.lizard.outcast=c.suit;s.lizard.acolytes=3;s.alliance.officers=3;s.alliance.supporters=[card('support',c.suit),card('bird','wild')];
  s=act(s,'lizard',{type:'sanctify',clearing:c.id,target:'alliance',building:'base-'+c.suit});assert.equal(s.board[c.id].buildings[0].type,'garden-'+c.suit);assert.equal(player(s,'lizard').score,1);assert.equal(s.alliance.officers,1);assert.equal(s.alliance.supporters.length,0);assert.equal(s.lizard.lostSouls.length,2);
});
test('Revenge moves only defending battle casualties into acolytes',()=>{
  for(const defense of [true,false]){
    let s=turn(setup(),defense?'cat':'lizard',defense?'daylight':'lizard-conspiracies');const c=s.board.find(c=>!c.keep);c.warriors.cat=3;c.warriors.lizard=3;player(s,'cat').hand=[];player(s,'lizard').hand=[];s.lizard.acolytes=3;s.lizard.outcast=c.suit;
    s=defense?act(s,'cat',{type:'battle',clearing:c.id,defender:'lizard'},()=>3):act(s,'lizard',{type:'crusade',clearing:c.id,defender:'cat'},()=>3);
    const choice=s.effects.frames[0];s=act(s,choice.playerId,{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);s=resolve(s);
    assert.equal(s.board[c.id].warriors.lizard,0);
    if(defense)assert.equal(s.lizard.acolytes,6);else assert.equal(s.lizard.acolytes,1);
  }
});
test('garden loss discards a random unrevealed hand card while preserving revealed cards',()=>{
  let s=turn(setup(),'cat','daylight');const c=s.board.find(c=>!c.keep);c.buildings=[];garden(s,c);c.warriors.lizard=0;c.warriors.cat=1;
  player(s,'lizard').hand=[card('fear-a','fox','item'),card('fear-b','rabbit','item')];s.lizard.revealed=[card('protected','mouse')];
  s=act(s,'cat',{type:'battle',clearing:c.id,defender:'lizard'});const choice=s.effects.frames[0];s=act(s,'lizard',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>0);s=resolve(s);
  assert.equal(player(s,'lizard').hand.length,1);assert.equal(s.lizard.revealed[0].id,'protected');assert.ok(s.lizard.lostSouls.some(c=>c.id==='fear-a'));
});
test('crusade movement finishes outrage before optional destination battle; extra fields cannot bypass legality',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');s.lizard.acolytes=2;const from=s.board[s.setup.lizardCorner],to=s.board[from.links[0]];to.keep=false;to.sympathy=true;to.warriors.cat=1;s.lizard.outcast=from.suit;
  player(s,'lizard').hand=[card('outrage',to.suit)];const action={type:'crusade',from:from.id,to:to.id,count:1};
  assert.throws(()=>act(s,'lizard',{...action,defender:'cat'}));s=act(s,'lizard',action);assert.equal(s.effects.frames[0].kind,'outrage');
  s=resolve(s,c=>c.kind==='outrage'?c.options[0]:c.options.find(o=>o.id==='pass'));assert.equal(s.phase,'lizard-conspiracies');assert.equal(s.lizard.acolytes,0);
});
test('evening crafting activates only Outcast gardens and draws one bonus per suit with two gardens',()=>{
  let s=turn(setup(),'lizard','lizard-craft');s.board.forEach(c=>c.buildings=[]);const fox=s.board.filter(c=>c.suit==='fox'),rabbit=s.board.filter(c=>c.suit==='rabbit');garden(s,fox[0]);garden(s,fox[1]);garden(s,rabbit[0]);garden(s,rabbit[1]);s.lizard.outcast='fox';
  const p=player(s,'lizard');p.hand=[{id:'craft',archetype:'AnvilFox',kind:'item',name:'anvil',suit:'fox'}];
  const craft=rules.projectGame(s,'lizard').craftOptions.find(o=>o.card==='craft');assert.ok(craft);
  assert.throws(()=>act(s,'lizard',{type:'craft',card:'craft',pieces:[`${rabbit[0].id}-0`]}));
  s=act(s,'lizard',{type:'craft',card:'craft'});assert.ok(s.lizard.lostSouls.some(c=>c.id==='craft'));const before=player(s,'lizard').hand.length;
  s=act(s,'lizard',{type:'lizard-craft-done'});assert.equal(player(s,'lizard').hand.length,before+3);
});
test('revealed cards are unavailable to outrage, and an empty deck cannot draw from Lost Souls',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');s.deck=[];s.discard=[];
  const from=s.board[s.setup.lizardCorner],to=s.board[from.links[0]];to.keep=false;to.sympathy=true;s.lizard.outcast=from.suit;s.lizard.acolytes=2;
  player(s,'lizard').hand=[];s.lizard.revealed=[card('shown',to.suit)];s.lizard.lostSouls=[card('lost',to.suit)];const supporters=s.alliance.supporters.length;
  s=act(s,'lizard',{type:'crusade',from:from.id,to:to.id,count:1});s=resolve(s);
  assert.equal(s.alliance.supporters.length,supporters);assert.equal(s.lizard.revealed[0].id,'shown');assert.equal(s.lizard.lostSouls[0].id,'lost');
});
test('pending crusade choices survive serialization and reject stale choice IDs',()=>{
  let s=turn(setup(),'lizard','lizard-conspiracies');const from=s.board[s.setup.lizardCorner],to=s.board[from.links[0]];
  to.keep=false;to.sympathy=false;to.warriors.cat=1;s.lizard.acolytes=2;s.lizard.outcast=from.suit;
  s=act(s,'lizard',{type:'crusade',from:from.id,to:to.id,count:1});assert.equal(s.effects.frames[0].kind,'lizard-crusade-battle');
  const saved=JSON.parse(JSON.stringify(s));assert.deepEqual(rules.projectGame(s,'lizard'),rules.projectGame(saved,'lizard'));
  const c=s.effects.frames[0];assert.throws(()=>act(saved,'lizard',{type:'choice',choiceId:'stale',optionId:'pass'}));
  s=act(saved,'lizard',{type:'choice',choiceId:c.id,optionId:'pass'});assert.equal(s.lizard.acolytes,0);assert.equal(s.effects.frames.length,0);
});
test('v6 natural bot games conserve all cards and components and reach a natural winner',()=>{
  const mixes=[['cat','bird','alliance','lizard'],['cat','bird','vagabond','lizard'],['cat','alliance','vagabond','lizard'],['bird','alliance','vagabond','lizard']];
  for(const factions of mixes){
    let seed=42;const rng=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};let s=rules.createGame(members(factions),rng);let steps=0;
    for(;!s.winner&&steps<4500;steps++){
      const actor=s.effects.frames[0]?.playerId||s.players[s.turn].id,view=rules.projectGame(s,actor),p=view.players.find(p=>p.id===actor);
      const actions=candidates(view,p,{developmentRound:1});let next=null;const errors=[];
      for(const a of actions){try{next=rules.applyAction(s,actor,a,rng);break;}catch(error){errors.push(error.message);}}
      assert.ok(next,`${factions}: ${s.phase} ${actor}: ${errors.join('; ')}`);s=next;conservation(s);
      if(steps%31===0)s=JSON.parse(JSON.stringify(s));
    }
    assert.ok(s.winner,`${factions} stalled at ${s.round} ${s.phase}, steps ${steps}`);
  }
});
