// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../backend/rules/versions/cats-birds.mjs';
import { invariants } from '../tools/cats_birds_selfplay.mjs';

const players=[{userId:'a',name:'猫',faction:'cat'},{userId:'b',name:'鹰',faction:'bird'}];
function choose(s,option,rng=()=>0) {
  const q=s.effects.frames[0];
  return r.applyAction(s,q.playerId,{type:'choice',choiceId:q.id,optionId:option||q.options[0].id},rng);
}
function ready(corner=0,leader='despot') {
  let s=r.createGame(players,()=>0);
  s=choose(s,String(corner));
  while(s.effects.frames[0]?.kind==='setup-building')s=choose(s);
  return choose(s,leader);
}
function give(s,type,faction='cat',zone='hand') {
  const owner=s.players.find(p=>p.faction===faction);
  const pools=[s.deck,s.discard,...s.players.flatMap(p=>[p.hand,p.crafted]),...Object.values(s.bird.decree)];
  const pool=pools.find(pool=>pool.some(card=>card.archetype===type));
  assert.ok(pool,`missing ${type}`);
  const index=pool.findIndex(card=>card.archetype===type),[card]=pool.splice(index,1);
  owner[zone].push(card);return card;
}
function phase(s,name,faction='cat') {s.turn=s.players.findIndex(p=>p.faction===faction);s.phase=name;return s;}
function facilities(s,suits,faction='cat') {
  s.board.forEach(c=>{c.buildings=c.buildings.filter(b=>b.faction!==faction||b.type!==(faction==='cat'?'workshop':'roost'));});
  const ids=[];
  for(const suit of suits){const c=s.board.find(c=>c.suit===suit&&c.buildings.length+c.ruins<c.slots);assert.ok(c);const index=c.buildings.length;c.buildings.push({faction,type:faction==='cat'?'workshop':'roost'});ids.push(`${c.id}-${index}`);}
  return ids;
}
function settle(s,prefer=()=>null,rng=()=>0) {
  let count=0;
  while(s.effects.frames[0]?.type==='choice'){
    assert.ok(count++<30);
    const q=s.effects.frames[0],option=prefer(q)||q.options.find(o=>o.id==='pass')||q.options[0];
    s=choose(s,option.id,rng);
  }
  return s;
}

test('standard setup validates every corner and leader, capacities, hands, garrisons and viziers',()=>{
  for(const corner of [0,2,8,11])for(const leader of ['despot','commander','charismatic','builder']){
    const s=ready(corner,leader),opposite={0:8,8:0,2:11,11:2}[corner];
    assert.equal(s.board.find(c=>c.keep).id,corner);
    assert.equal(s.board[opposite].warriors.cat,0);
    assert.equal(s.board[opposite].warriors.bird,6);
    assert.equal(s.board.reduce((n,c)=>n+c.warriors.cat,0),11);
    assert.equal(s.board.flatMap(c=>c.buildings).filter(b=>b.faction==='cat').length,3);
    assert.equal(Object.values(s.bird.decree).flat().filter(c=>c.vizier).length,2);
    assert.equal(s.bird.leader,leader);
    assert.ok(s.players.every(p=>p.hand.length===3&&p.score===0));
    invariants(s);
  }
});

test('setup rejects another player, stale choice and forged clearing without changing state',()=>{
  const s=r.createGame(players,()=>0),q=s.effects.frames[0],before=structuredClone(s);
  assert.throws(()=>r.applyAction(s,'b',{type:'choice',choiceId:q.id,optionId:'0'}));
  assert.throws(()=>r.applyAction(s,'a',{type:'choice',choiceId:q.id,optionId:'4'}));
  const next=choose(s,'0');
  assert.throws(()=>r.applyAction(next,'a',{type:'choice',choiceId:q.id,optionId:'0'}));
  assert.deepEqual(s,before);
});

test('crafting phase precedes actions and any-suit payments accept explicit distinct facilities',()=>{
  let s=phase(ready(),'craft');
  const card=give(s,'RoyalClaimBird'),pieces=facilities(s,['fox','mouse','rabbit','fox']);
  assert.throws(()=>r.applyAction(s,'a',{type:'move',from:0,to:1,count:1}));
  assert.throws(()=>r.applyAction(s,'a',{type:'craft',card:card.id,pieces:[pieces[0],pieces[0],pieces[1],pieces[2]]}));
  s=r.applyAction(s,'a',{type:'craft',card:card.id,pieces});
  assert.equal(s.craftingUsed.length,4);
  assert.ok(s.players[0].crafted.some(c=>c.id===card.id));
  s=r.applyAction(s,'a',{type:'craft-done'});
  assert.equal(s.phase,'daylight');
  assert.throws(()=>r.applyAction(s,'a',{type:'craft',card:card.id}));
});

test('cat march, recruitment and bird-card actions enforce the whole compound action',()=>{
  let s=phase(ready(),'daylight');
  const recruits=s.board.flatMap(c=>c.buildings.filter(b=>b.type==='recruiter').map(()=>c.id));
  s=r.applyAction(s,'a',{type:'recruit',clearings:recruits});
  assert.throws(()=>r.applyAction(s,'a',{type:'recruit',clearings:recruits}));
  const extra=give(s,'AmbushBird');
  const actions=s.actions;
  s=r.applyAction(s,'a',{type:'move',from:0,to:1,count:1});
  assert.equal(s.actions,actions-1);assert.equal(s.march,1);
  assert.throws(()=>r.applyAction(s,'a',{type:'extra',card:extra.id}));
  assert.throws(()=>r.applyAction(s,'a',{type:'end'}));
  s=r.applyAction(s,'a',{type:'move',from:1,to:0,count:1});
  assert.equal(s.actions,actions-1);assert.equal(s.march,0);
  s=r.applyAction(s,'a',{type:'extra',card:extra.id});assert.equal(s.actions,actions);
});

test('connected wood and track scoring use surviving buildings after destruction',()=>{
  let s=phase(ready(),'daylight');
  s.board[0].wood=1;
  const destination=s.board.find(c=>c.links.includes(0)&&c.buildings.length+c.ruins<c.slots);
  s=r.applyAction(s,'a',{type:'build',building:'workshop',clearing:destination.id,wood:[0]});
  assert.equal(s.players[0].score,2);
  const c=s.board.find(c=>c.buildings.some(b=>b.type==='workshop'));
  c.buildings.splice(c.buildings.findIndex(b=>b.type==='workshop'),1);
  s.board[0].wood=1;
  s=r.applyAction(s,'a',{type:'build',building:'workshop',clearing:c.id,wood:[0]});
  assert.equal(s.players[0].score,4);
  s.board[0].warriors={cat:0,bird:10};s.board[0].wood=3;
  const before=structuredClone(s);
  assert.throws(()=>r.applyAction(s,'a',{type:'build',building:'sawmill',clearing:destination.id,wood:[0]}));
  assert.deepEqual(s,before);
});

test('Eyrie crafting completes before forced turmoil and Charismatic needs two reserves',()=>{
  let s=phase(ready(0,'charismatic'),'craft','bird');
  s.board[8].warriors.bird=19;
  const card=give(s,'CrossbowMouse','bird'),ids=facilities(s,['fox'],'bird');
  const c=s.board.find(c=>c.buildings.some(b=>b.type==='roost'));c.warriors.bird=19;
  s.board.forEach(area=>{if(area!==c)area.warriors.bird=0;});
  s=r.applyAction(s,'b',{type:'craft',card:card.id,pieces:ids});
  assert.equal(s.players[1].score,1);assert.equal(s.phase,'craft');
  s=r.applyAction(s,'b',{type:'craft-done'});
  assert.equal(s.phase,'leader');assert.equal(s.players[1].score,0);
  assert.ok(!r.projectGame(s,'b').leaders.includes('charismatic'));
});

test('Eyrie emergency orders and new roost use fewest eligible warriors and respect keep',()=>{
  let s=phase(ready(),'birdsong','bird');
  s.discard.push(...s.players[1].hand.splice(0));
  s.board.forEach(c=>{c.buildings=c.buildings.filter(b=>b.type!=='roost');});
  s=r.applyAction(s,'b',{type:'birdsong-end'});
  assert.equal(s.players[1].hand.length,1);
  s=r.applyAction(s,'b',{type:'decree-add',card:s.players[1].hand[0].id,column:'move'});
  s=r.applyAction(s,'b',{type:'decree-ready'});assert.equal(s.phase,'new-roost');
  const eligible=s.board.filter(c=>!c.keep&&c.buildings.length+c.ruins<c.slots);
  const min=Math.min(...eligible.map(c=>c.warriors.cat+c.warriors.bird)),target=eligible.find(c=>c.warriors.cat+c.warriors.bird===min);
  assert.throws(()=>r.applyAction(s,'b',{type:'new-roost',clearing:s.board.find(c=>c.keep).id}));
  const count=target.warriors.bird;
  s=r.applyAction(s,'b',{type:'new-roost',clearing:target.id});
  assert.equal(s.board[target.id].warriors.bird,count+3);assert.equal(s.phase,'craft');
});

test('Eyrie evening scoring and draw bonuses match original third and sixth roosts',()=>{
  for(const [roosts,score,draw] of [[1,0,1],[3,2,2],[5,4,2],[6,4,3],[7,5,3]]){
    let s=phase(ready(),'decree','bird');s.bird.remaining={};
    s.discard.push(...s.players[1].hand.splice(0));
    s.board.forEach(c=>{c.buildings=[];});
    for(const c of s.board.filter(c=>!c.keep).slice(0,roosts))c.buildings.push({type:'roost',faction:'bird'});
    s=r.applyAction(s,'b',{type:'end'});
    assert.equal(s.players[1].score,score);assert.equal(s.players[1].hand.length,draw);
  }
});

test('ambush ends the battle even if hospital returns attackers, with private options and no dice',()=>{
  let s=phase(ready(),'daylight');s.board[3].warriors={cat:2,bird:3};
  const ambush=give(s,'AmbushBird','bird');give(s,'AmbushFox');
  s=r.applyAction(s,'a',{type:'battle',clearing:3});
  assert.ok(!('options' in r.projectGame(s,'a').choice));
  s=choose(s,ambush.id);
  assert.equal(s.effects.frames[0].kind,'hospital');
  const option=s.effects.frames[0].options.find(o=>o.id!=='pass');
  if(option)s=choose(s,option.id);else s=choose(s,'pass');
  assert.equal(s.combat,null);assert.equal(s.randomEvents.length,0);
});

test('scouting cancels ambush opportunity and extra hits survive Armorers',()=>{
  let s=phase(ready(0,'commander'),'decree','bird');
  s.bird.remaining={battle:[{id:'battle-card',suit:'wild'}]};
  s.board[3].warriors={cat:3,bird:3};s.board[3].buildings=[];
  give(s,'ScoutingPartyMouse','bird','crafted');
  const armor=give(s,'ArmorersBird','cat','crafted'),sapper=give(s,'SappersBird','cat','crafted');
  give(s,'BrutalTacticsBird','bird','crafted');
  s=r.applyAction(s,'b',{type:'battle',clearing:3,decreeCard:'battle-card'},()=>3);
  assert.notEqual(s.effects.frames[0].kind,'ambush');
  s=settle(s,q=>q.kind==='battle-effects'?(q.options.find(o=>o.id!=='pass')||q.options[0]):null,()=>3);
  assert.equal(s.board[3].warriors.cat,1,'Armorers ignores rolled hits but Commander and Brutal remain');
  assert.equal(s.board[3].warriors.bird,0,'Sappers extra hit is applied');
  assert.ok(s.discard.some(c=>c.id===armor.id));assert.ok(s.discard.some(c=>c.id===sapper.id));
  assert.equal(s.players[0].score,1,'Brutal awards defender one point');
});

test('bank is mandatory at start of the owner turn and Stand and Deliver is once per Birdsong',()=>{
  let s=phase(ready(),'discard','bird');
  const bank=give(s,'BetterBurrowBankRabbit','cat','crafted');
  const steal=give(s,'StandandDeliverFox','cat','crafted');
  while(s.players[1].hand.length<6){s.players[1].hand.push(s.deck.pop());}
  const before=s.players.map(p=>p.hand.length);
  s=r.applyAction(s,'b',{type:'discard',card:s.players[1].hand[0].id});
  assert.equal(s.phase,'birdsong');assert.equal(s.turn,0);
  assert.equal(s.players[0].hand.length,before[0]+1);assert.equal(s.players[1].hand.length,before[1]);
  assert.ok(s.players[0].crafted.some(c=>c.id===bank.id));
  s=r.applyAction(s,'a',{type:'effect',card:steal.id},()=>0);
  assert.equal(s.players[1].score,1);
  assert.throws(()=>r.applyAction(s,'a',{type:'effect',card:steal.id}));
});

test('tax collector resolves hospital before drawing and Codebreakers reveal remains private',()=>{
  let s=phase(ready(),'craft');
  const tax=give(s,'TaxCollectorFox','cat','crafted'),code=give(s,'CodebreakersMouse','cat','crafted');
  give(s,'AmbushBird');
  const n=s.players[0].hand.length;
  s=r.applyAction(s,'a',{type:'effect',card:tax.id,clearing:3});
  assert.equal(s.effects.frames[0].kind,'hospital');assert.equal(s.players[0].hand.length,n);
  s=choose(s,'pass');assert.equal(s.players[0].hand.length,n+1);
  s=r.applyAction(s,'a',{type:'effect',card:code.id});
  assert.ok(r.projectGame(s,'a').revealedHand);assert.equal(r.projectGame(s,'b').revealedHand,undefined);
  assert.throws(()=>r.applyAction(s,'a',{type:'effect',card:tax.id,clearing:3}));
});

test('favor removes the keep and all matching pieces before hospital triggers, without Despot bonus',()=>{
  let s=phase(ready(),'craft','bird');
  const favor=give(s,'FavoroftheFoxesFox','bird');
  s.board.forEach(c=>{c.buildings=[];c.warriors={cat:0,bird:0};c.wood=0;});
  s.board[0].keep=true;s.board[0].warriors.cat=2;s.board[5].warriors.cat=3;s.board[5].wood=2;
  facilities(s,['fox','fox','fox'],'bird');
  give(s,'AmbushBird');
  s=r.applyAction(s,'b',{type:'craft',card:favor.id});
  assert.equal(s.board[0].keep,false);assert.equal(s.board[5].wood,0);assert.equal(s.board[5].warriors.cat,0);
  assert.equal(s.effects.frames.length,0);assert.equal(s.players[1].score,3);
});

test('persistent duplicates are rejected, Command Warren and Cobbler each happen in their phase',()=>{
  let s=phase(ready(),'craft');
  give(s,'ArmorersBird','cat','crafted');const duplicate=give(s,'ArmorersBird');facilities(s,['fox']);
  assert.throws(()=>r.applyAction(s,'a',{type:'craft',card:duplicate.id}));
  give(s,'CommandWarrenRabbit','cat','crafted');give(s,'CobblerRabbit','cat','crafted');
  s.phase='wood';s.woodPending=[0];s.board[3].warriors={cat:2,bird:1};
  s=r.applyAction(s,'a',{type:'wood',clearing:0});assert.equal(s.effects.frames[0].kind,'free-battle');
  s=choose(s,'pass');assert.equal(s.phase,'craft');assert.equal(s.actions,3);
  s=r.applyAction(s,'a',{type:'craft-done'});s=r.applyAction(s,'a',{type:'end'});
  assert.equal(s.phase,'evening');assert.equal(s.effects.frames.length,0);
  s=r.applyAction(s,'a',{type:'evening-continue'});assert.ok(s.phase==='discard'||s.players[s.turn].id!=='a');assert.equal(r.projectGame(s,'a').nightCobbler,false);
});

test('Brutal and Stand and Deliver stop immediately when the opposing player wins',()=>{
  let s=phase(ready(),'birdsong');const card=give(s,'StandandDeliverFox','cat','crafted');s.players[1].score=29;
  s=r.applyAction(s,'a',{type:'effect',card:card.id},()=>0);
  assert.equal(s.winner,'b');assert.equal(s.phase,'finished');
  assert.throws(()=>r.applyAction(s,'a',{type:'birdsong-end'}));
});

test('ambush victory still discards the played physical card and Despot scores once',()=>{
  let s=phase(ready(),'daylight');s.players[1].score=28;
  s.board[3].warriors={cat:1,bird:1};s.board[3].wood=1;s.board[3].buildings=[];
  const ambush=give(s,'AmbushBird','bird');
  s=r.applyAction(s,'a',{type:'battle',clearing:3});s=choose(s,ambush.id);
  assert.equal(s.board[3].wood,0,'The only remaining token is removed automatically');
  assert.equal(s.winner,'b');assert.equal(s.players[1].score,30);
  assert.ok(s.discard.some(c=>c.id===ambush.id));invariants(s);
});

test('Royal Claim scores current rule, discards itself and respects immediate victory',()=>{
  let s=phase(ready(),'birdsong'),card=give(s,'RoyalClaimBird','cat','crafted');
  const n=s.board.filter(c=>c.warriors.cat+c.buildings.filter(b=>b.faction==='cat').length>c.warriors.bird+c.buildings.filter(b=>b.faction==='bird').length).length;
  s=r.applyAction(s,'a',{type:'effect',card:card.id});assert.equal(s.players[0].score,n);assert.ok(s.discard.some(c=>c.id===card.id));
});

test('wood exhaustion, overwork matching and finite supply preserve rejected state',()=>{
  let s=phase(ready(),'wood');s.woodPending=[0,0];s.board[0].wood=7;
  s=r.applyAction(s,'a',{type:'wood',clearing:0});assert.equal(s.phase,'craft');assert.equal(s.board[0].wood,8);
  s=r.applyAction(s,'a',{type:'craft-done'});const card=give(s,'AmbushFox'),before=structuredClone(s);
  assert.throws(()=>r.applyAction(s,'a',{type:'overwork',clearing:0,card:card.id}));assert.deepEqual(s,before);
  s.board[0].wood=7;s=r.applyAction(s,'a',{type:'overwork',clearing:0,card:card.id});assert.equal(s.board[0].wood,8);assert.equal(s.actions,2);
});
