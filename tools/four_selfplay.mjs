import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../backend/server.mjs';
import * as rules from '../backend/rules/versions/base-four.mjs';
import { candidates } from '../backend/bots/test-policy.mjs';
export { candidates };

export function invariants(state) {
  for (const [faction, total] of [['cat',25], ['bird',20], ['alliance',10]]) {
    const count = state.board.reduce((sum,c) => sum+c.warriors[faction], 0)+(faction === 'alliance' ? state.alliance.officers : 0);
    assert.ok(count >= 0 && count <= total, `${faction} supply ${count}`);
  }
  assert.ok(state.board.every(c => c.buildings.length+c.ruins <= c.slots && c.wood >= 0
    && Object.values(c.warriors).every(value => Number.isInteger(value) && value >= 0)));
  assert.ok(state.board.reduce((sum,c) => sum+c.wood, 0) <= 8);
  const cards = [...state.deck, ...state.discard, ...state.players.flatMap(p => [...p.hand, ...p.crafted, ...(p.dominance ? [p.dominance] : [])]),
    ...state.alliance.supporters, ...state.dominanceAvailable, ...Object.values(state.bird.decree).flat().filter(card => !card.vizier),
    ...(state.combat?.ambushCard ? [state.combat.ambushCard] : [])];
  assert.equal(cards.length, 54, 'physical cards');
  assert.equal(new Set(cards.map(card => card.id)).size, 54, 'unique cards');
  for (const [type, supply] of Object.entries(state.itemSupply)) {
    const owned = state.players.reduce((sum,p) => sum+p.items.filter(item => item === type).length, 0);
    const transferred = [...state.vagabond.items, ...state.vagabond.removedItems].filter(item => item.type === type && ['crafted','aid'].includes(item.source)).length;
    assert.equal(supply+owned+transferred, ['crossbow','hammer'].includes(type) ? 1 : 2, `${type} supply`);
  }
  assert.equal(state.questDeck.length+state.quests.length+state.vagabond.completedQuests.length, 15);
}

export async function run({ games = 6, http = false } = {}) {
  const report = { ruleset: rules.RULESET, transport: http ? 'HTTP/SQLite' : 'engine', games: [], restarts: 0 };
  let app, base, directory;
  async function start() {
    app = createApp({ dbPath: join(directory,'qa.sqlite'), rateLimit: false });
    await new Promise(done => app.server.listen(0,'127.0.0.1',done));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function request(user, path, body) {
    const response = await fetch(base+path, { method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: user.cookie || '', 'Content-Type': 'application/json', Origin: base },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const cookie = response.headers.get('set-cookie');
    if (cookie) user.cookie = cookie.split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  if (http) { directory = mkdtempSync(join(tmpdir(),'root-four-')); await start(); }
  try {
    for (let seed = 1; seed <= games; seed++) {
      let randomSeed = seed;
      const rng = max => { randomSeed = (Math.imul(randomSeed,1664525)+1013904223) >>> 0; return randomSeed % max; };
      const users = ['cat','bird','alliance','vagabond'].map(faction => ({ id: faction, faction, userId: faction, name: faction }));
      let state, room, steps = 0;
      if (http) {
        for (const user of users) {
          const response = await request(user,'/api/auth/register',{ username:`four_${seed}_${user.faction}`,password:'temporary-four-test-123' });
          assert.equal(response.status,200); user.id = response.body.user.id; user.userId = user.id;
        }
        room = (await request(users[0],'/api/rooms',{ capacity:4,name:'cat',title:'Four faction QA',password:'' })).body.room;
        for (const user of users.slice(1)) room = (await request(user,`/api/rooms/${room.code}/join`,{ name:user.faction,password:'' })).body.room;
        for (const user of users) {
          const response = await request(user,`/api/rooms/${room.code}/command`,{ commandId:randomUUID(),version:room.version,command:{type:'ready',ready:true} });
          assert.equal(response.status,200); room = response.body.room;
        }
        room = (await request(users[0],`/api/rooms/${room.code}/command`,{ commandId:randomUUID(),version:room.version,command:{type:'start',ruleset:rules.RULESET} })).body.room;
        state = JSON.parse(app.db.prepare('SELECT state FROM games WHERE id=?').get(room.gameId).state);
      } else state = rules.createGame(users,rng);
      const counts = {};
      while (!state.winner && steps < 5000) {
        invariants(state);
        const actorId = state.effects.frames[0]?.playerId || state.players[state.turn].id;
        const user = users.find(user => user.id === actorId);
        const view = rules.projectGame(state,user.id);
        let choices = candidates(view,view.players.find(player => player.id === user.id));
        if(view.choice?.kind==='setup-character'){
          const option=view.choice.options[(seed-1)%3];
          choices=[{type:'choice',choiceId:view.choice.choiceId,optionId:option.id}];
        }
        // Alternate a lower-scoring Alliance policy to cover Vagabond victories too.
        if(!view.choice&&seed%2===0&&user.faction==='alliance'&&view.phase==='daylight')choices=choices.filter(action=>action.type!=='craft');
        if(!view.choice&&seed%2===0&&user.faction==='alliance'&&view.players.find(player=>player.id===user.id).score>=15){
          const finish={revolt:'revolt-done',spread:'spread-done',daylight:'end',military:'military-done'}[view.phase];
          if(finish)choices=[{type:finish}];
        }
        let accepted = false;
        const failures = [];
        for (const action of choices) {
          try {
            // Validate with deterministic test randomness before sending an HTTP action.
            const next = rules.applyAction(state,user.id,action,rng);
            if (http) {
              const id = randomUUID(), version = room.version;
              const response = await request(user,`/api/rooms/${room.code}/command`,{ commandId:id,version,command:{type:'action',action} });
              assert.equal(response.status,200,JSON.stringify(response.body)); room = response.body.room;
              state = JSON.parse(app.db.prepare('SELECT state FROM games WHERE id=?').get(room.gameId).state);
              if (steps % 29 === 0) {
                const retry = await request(user,`/api/rooms/${room.code}/command`,{ commandId:id,version,command:{type:'action',action} });
                assert.equal(retry.body.room.version,room.version);
              }
            } else state = next;
            steps++; counts[action.type] = (counts[action.type] || 0)+1; accepted = true; break;
          } catch (error) {
            if (error.status !== 422) throw error;
            failures.push(error.message);
          }
        }
        assert.ok(accepted, `Stuck ${user.faction} ${state.phase}: ${failures.join(' | ')}`);
        if (http && steps % 37 === 0) {
          const before = structuredClone(state);
          await app.close(); await start(); report.restarts++;
          state = JSON.parse(app.db.prepare('SELECT state FROM games WHERE id=?').get(room.gameId).state);
          assert.deepEqual(state,before);
          assert.equal((await request(user,`/api/rooms/${room.code}`)).status,200);
        }
      }
      invariants(state);
      assert.ok(state.winner,`No natural winner seed ${seed}, phase ${state.phase}, round ${state.round}`);
      const result = { seed, rounds:state.round, steps, winner:state.players.find(player => player.id === state.winner).faction,
        scores:state.players.map(player => ({faction:player.faction,score:player.score})), actions:counts };
      report.games.push(result); console.log(JSON.stringify(result));
    }
  } finally {
    if (app) await app.close();
    if (directory) rmSync(directory,{recursive:true,force:true});
  }
  report.passed = true;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const http = process.argv.includes('--http');
  const report = await run({ games:Number(process.env.QA_GAMES || 6),http });
  mkdirSync('audit/v5',{recursive:true});
  writeFileSync(`audit/v5/selfplay-${http?'http':'engine'}.json`,JSON.stringify(report,null,2)+'\n');
}
