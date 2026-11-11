import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame,applyAction } from '../backend/engine.mjs';

// Exercise many complete phase transitions on the public action interface.
// This is a lab-rules playthrough, not a claim of full Root fidelity.
test('rules laboratory can reach a natural score victory and resume mid-game',()=>{
  let seed=1234567;const rng=max=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
  let s=createGame([{userId:'cat',name:'猫',faction:'cat'},{userId:'bird',name:'鹰',faction:'bird'}],rng),steps=0;
  const attempt=(id,a)=>{try{s=applyAction(s,id,a,rng);return true;}catch(e){if(e.name!=='Error'&&e.name!=='RuleError')throw e;return false;}};
  while(!s.winner&&steps++<3000){
    // Round-trip the entire authoritative state exactly as SQLite persistence does.
    if(steps%13===0)s=JSON.parse(JSON.stringify(s));
    if(s.pending){const l=s.pending.losses[0],c=s.board[s.pending.clearing];const piece=c.buildings.find(b=>b.faction===l.faction)?.type||(c.wood?'wood':'keep');assert.ok(attempt(l.faction,{type:'loss',piece}));continue;}
    const p=s.players[s.turn],id=p.id;
    if(s.phase==='wood'){assert.ok(attempt(id,{type:'wood',clearing:s.woodPending[0]}));continue;}
    if(s.phase==='discard'){assert.ok(attempt(id,{type:'discard',card:p.hand[0].id}));continue;}
    if(s.phase==='leader'){assert.ok(attempt(id,{type:'leader',leader:['despot','commander','charismatic','builder'].find(x=>!s.bird.used.includes(x))}));continue;}
    if(s.phase==='new-roost'){assert.ok(s.board.some(c=>attempt(id,{type:'new-roost',clearing:c.id})));continue;}
    if(s.phase==='decree-add'){
      if(s.bird.added){assert.ok(attempt(id,{type:'decree-ready'}));continue;}
      // A build decree suited to a potential future clearing encourages expansion.
      assert.ok(attempt(id,{type:'decree-add',card:p.hand[0].id,column:steps%3===0?'move':'build'}));continue;
    }
    if(id==='bird'){
      const col=['recruit','move','battle','build'].find(c=>s.bird.remaining[c].length);
      if(!col){assert.ok(attempt(id,{type:'end'}));continue;}
      let done=false;
      for(const card of s.bird.remaining[col]){for(const c of s.board){
        if(col==='move'){for(const to of c.links){if(attempt(id,{type:col,from:c.id,to,count:Math.max(1,Math.ceil(c.warriors.bird/2)),decreeCard:card.id})){done=true;break;}}}
        else if(attempt(id,{type:col,clearing:c.id,decreeCard:card.id}))done=true;
        if(done)break;
      }if(done)break;}
      assert.ok(done,`unresolved decree in ${s.phase}`);continue;
    }
    if(s.march){assert.ok(attempt(id,{type:'march-end'}));continue;}
    if(!s.actions){assert.ok(attempt(id,{type:'end'}));continue;}
    let done=false;
    const wood=s.board.flatMap(c=>Array(c.wood).fill(c.id));
    for(const type of ['sawmill','recruiter','workshop']){const n=s.board.reduce((n,c)=>n+c.buildings.filter(b=>b.type===type).length,0),cost=[0,1,2,3,3,4][n];if(cost===undefined)continue;
      for(const c of s.board){if(attempt(id,{type:'build',building:type,clearing:c.id,wood:wood.slice(0,cost)})){done=true;break;}}if(done)break;}
    if(done)continue;
    // Battle when blocked; otherwise add soldiers or end the turn.
    for(const c of s.board){if(attempt(id,{type:'battle',clearing:c.id})){done=true;break;}}
    if(done)continue;
    const ids=s.board.flatMap(c=>c.buildings.filter(b=>b.type==='recruiter').map(()=>c.id)).slice(0,25-s.board.reduce((n,c)=>n+c.warriors.cat,0));
    if(attempt(id,{type:'recruit',clearings:ids}))continue;
    assert.ok(attempt(id,{type:'end'}));
  }
  assert.ok(s.winner,`no winner after ${steps} actions`);assert.ok(s.players.some(p=>p.score>=30));assert.ok(steps>30);
});
