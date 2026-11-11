// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../backend/server.mjs';
import * as rules from '../backend/rules/versions/battle-lab.mjs';

test('HTTP and SQLite restore every battle choice with private SSE views and idempotent answers', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'woodland-choice-'));
  const database = join(directory, 'test.sqlite');
  let app;
  let base;
  async function start() {
    app = createApp({ dbPath: database, rateLimit: false });
    await new Promise(done => app.server.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => {
    await app.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(directory.includes('woodland-choice-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const cat = {};
  const bird = {};
  async function request(user, path, body) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(user.cookie ? { Cookie: user.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) user.cookie = cookie.split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  for (const [user, username] of [[cat, 'http_cat'], [bird, 'http_bird']]) {
    const response = await request(user, '/api/auth/register', { username, password: 'local-test-only-123' });
    assert.equal(response.status, 200);
    user.id = response.body.user.id;
  }
  let room = (await request(cat, '/api/rooms', { name: '猫', password: '' })).body.room;
  room = (await request(bird, `/api/rooms/${room.code}/join`, { name: '鹰', password: '' })).body.room;
  async function command(user, operation) {
    const latest = (await request(user, `/api/rooms/${room.code}`)).body.room;
    const payload = { commandId: randomUUID(), version: latest.version, command: operation };
    const result = await request(user, `/api/rooms/${room.code}/command`, payload);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    room = result.body.room;
    return { result, payload };
  }
  await command(cat, { type: 'ready', ready: true });
  await command(bird, { type: 'ready', ready: true });
  await command(cat, { type: 'start', ruleset: rules.RULESET });
  assert.equal(room.game.ruleset, rules.RULESET);

  const card = (id, kind = 'suit') => ({ id, kind, name: id, suit: 'wild' });
  function scenario(stage) {
    let state = rules.createGame([{ userId: cat.id, name: '猫', faction: 'cat' }, { userId: bird.id, name: '鹰', faction: 'bird' }], () => 0);
    state.turn = 0; state.phase = 'daylight';
    state.players.forEach(owner => { owner.hand = []; owner.crafted = []; });
    state.board[3].warriors = { cat: stage === 'hospital' ? 2 : 3, bird: stage === 'cardboard-loss' ? 0 : 3 };
    state.board[3].buildings = stage === 'cardboard-loss' ? [{ faction: 'bird', type: 'roost' }] : [];
    if (stage === 'counter-ambush' || stage === 'hospital') state.players[1].hand.push(card('defender-ambush', 'ambush'));
    if (stage === 'hospital') state.players[0].hand.push(card('hospital-card'));
    if (stage === 'armorers') state.players[1].crafted.push(card('crafted-armor', 'armorers'));
    state = rules.applyAction(state, cat.id, { type: 'battle', clearing: 3 }, () => 0);
    const answer = (user, option, rng = () => 0) => {
      state = rules.applyAction(state, user.id, { type: 'choice', choiceId: state.effects.frames[0].id, optionId: option }, rng);
    };
    if (stage === 'counter-ambush' || stage === 'hospital') answer(bird, 'defender-ambush');
    if (stage === 'hospital') answer(cat, 'pass');
    if (stage === 'armorers' || stage === 'cardboard-loss') answer(bird, 'pass', () => stage === 'armorers' ? 2 : 0);
    assert.equal(state.effects.frames[0].kind, stage);
    return state;
  }

  for (const stage of ['ambush', 'counter-ambush', 'armorers', 'cardboard-loss', 'hospital']) {
    await t.test(`${stage} saves, restarts and resumes through the normal command API`, async () => {
      const state = scenario(stage);
      // Seed a precise test position in the isolated DB. Public responses and all answers use normal endpoints.
      const row = app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code);
      const payload = JSON.parse(row.payload);
      payload.game = state;
      app.db.prepare('UPDATE rooms SET payload=? WHERE code=?').run(JSON.stringify(payload), room.code);
      app.db.prepare('UPDATE games SET state=? WHERE id=?').run(JSON.stringify(state), payload.gameId);
      const owner = state.effects.frames[0].playerId === cat.id ? cat : bird;
      const observer = owner === cat ? bird : cat;
      const before = (await request(owner, `/api/rooms/${room.code}`)).body.room;
      assert.ok(before.game.choice.options.length > 0);
      const visible = (await request(observer, `/api/rooms/${room.code}`)).body.room;
      assert.equal(visible.game.choice.options, undefined);
      assert.equal(visible.game.effects, undefined);
      await app.close();
      await start();
      const restored = (await request(owner, `/api/rooms/${room.code}`)).body.room;
      assert.deepEqual(restored, before);
      const controller = new AbortController();
      const events = await fetch(`${base}/api/rooms/${room.code}/events`, { headers: { Cookie: observer.cookie }, signal: controller.signal });
      const reader = events.body.getReader();
      const text = new TextDecoder().decode((await reader.read()).value);
      const projected = JSON.parse(text.split('data: ')[1].split('\n')[0]);
      assert.equal(projected.game.choice.options, undefined);
      controller.abort();
      const choice = restored.game.choice;
      const option = choice.options.some(option => option.id === 'pass') ? 'pass' : choice.options[0].id;
      const operation = { type: 'action', action: { type: 'choice', choiceId: choice.choiceId, optionId: option } };
      const count = app.db.prepare('SELECT count(*) n FROM snapshots').get().n;
      const { result, payload: submitted } = await command(owner, operation);
      assert.equal(app.db.prepare('SELECT count(*) n FROM snapshots').get().n, count + 1);
      const duplicate = await request(owner, `/api/rooms/${room.code}/command`, submitted);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.room.version, result.body.room.version);
      assert.equal(app.db.prepare('SELECT count(*) n FROM snapshots').get().n, count + 1);
      const saved = JSON.parse(app.db.prepare('SELECT state FROM games WHERE id=?').get(payload.gameId).state);
      assert.deepEqual(saved.randomEvents, JSON.parse(app.db.prepare('SELECT payload FROM rooms WHERE code=?').get(room.code).payload).game.randomEvents);
    });
  }
});
