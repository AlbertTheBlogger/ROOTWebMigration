// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../backend/server.mjs';
import { candidates } from '../backend/bots/test-policy.mjs';
import { projectGame, applyAction } from '../backend/rules/versions/registry.mjs';

async function harness(t, botDelay = 0) {
  const directory = mkdtempSync(join(tmpdir(), 'woodland-bots-'));
  const dbPath = join(directory, 'rooms.sqlite');
  let app, base;
  async function start(wait) {
    app = createApp({ dbPath, rateLimit: false, botDelay: wait });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start(botDelay);
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(user, path, body) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: user.cookie || '', 'Content-Type': 'application/json', Origin: base },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.headers.get('set-cookie')) user.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, ...await response.json() };
  }
  async function register(name) {
    const user = {};
    const response = await request(user, '/api/auth/register', { username: name, password: 'local-bot-test-123' });
    assert.equal(response.status, 200);
    user.id = response.user.id;
    return user;
  }
  async function command(user, room, value, id = randomUUID()) {
    return request(user, `/api/rooms/${room.code}/command`, { commandId: id, version: room.version, command: value });
  }
  return {
    get app() { return app; }, request, register, command,
    async restart(wait = 0) { await app.close(); await start(wait); },
  };
}

test('host bot seats enforce permissions, capacity, idempotence and human ownership', async t => {
  const h = await harness(t, 100000);
  const host = await h.register('bot_host'), guest = await h.register('bot_guest');
  let room = (await h.request(host, '/api/rooms', { capacity: 4, name: 'Host' })).room;
  room = (await h.request(guest, `/api/rooms/${room.code}/join`, { name: 'Guest' })).room;
  assert.equal((await h.command(guest, room, { type: 'bot-add', faction: 'alliance' })).status, 403);
  const commandId = randomUUID(), before = room;
  room = (await h.command(host, room, { type: 'bot-add', faction: 'alliance' }, commandId)).room;
  const retry = await h.command(host, before, { type: 'bot-add', faction: 'alliance' }, commandId);
  assert.equal(retry.room.version, room.version);
  assert.equal(room.members.filter(player => player.bot).length, 1);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM users').get().n, 2);
  assert.equal((await h.command(host, room, { type: 'bot-add', faction: 'alliance' })).status, 409);
  room = (await h.command(host, room, { type: 'bot-add', faction: 'vagabond' })).room;
  assert.equal((await h.command(host, room, { type: 'bot-add', faction: 'cat' })).status, 409);
  assert.equal((await h.command(host, room, { type: 'bot-remove', userId: guest.id })).status, 422);
  const botId = room.members.find(player => player.bot).userId;
  room = (await h.command(host, room, { type: 'bot-remove', userId: botId })).room;
  room = (await h.command(host, room, { type: 'leave' })).room;
  assert.equal(room, null);
  room = (await h.request(guest, `/api/rooms/${before.code}`)).room;
  assert.equal(room.ownerId, guest.id);
  await h.command(guest, room, { type: 'leave' });
  const stored = h.app.db.prepare('SELECT status,owner_id FROM rooms WHERE code=?').get(room.code);
  assert.equal(stored.status, 'closed');
  assert.equal(stored.owner_id, guest.id);
  assert.equal((await h.request(guest, `/api/rooms/${room.code}/delete`, { version: room.version + 1 })).status, 200);
});

test('room bots resume pending setup after restart and stop safely after deletion', async t => {
  const h = await harness(t, 100000);
  const host = await h.register('bot_restart');
  let room = (await h.request(host, '/api/rooms', { capacity: 4, name: 'Human' })).room;
  room = (await h.command(host, room, { type: 'profile', name: 'Human', faction: 'vagabond' })).room;
  room = (await h.command(host, room, { type: 'bot-add', faction: 'cat' })).room;
  room = (await h.command(host, room, { type: 'ready', ready: true })).room;
  assert.equal((await h.command(host, room, { type: 'start', ruleset: 'root-cats-birds-v4' })).status, 422);
  room = (await h.command(host, room, { type: 'start', ruleset: 'root-base-four-v5' })).room;
  assert.equal(room.game.choice.waiting, true);
  assert.equal((await h.command(host, room, { type: 'bot-remove', userId: room.members.find(p => p.bot).userId })).status, 409);
  const version = room.version;
  await h.restart(1);
  for (let attempt = 0; attempt < 100; attempt++) {
    room = (await h.request(host, `/api/rooms/${room.code}`)).room;
    if (room.game.choice?.playerId === host.id) break;
    await delay(5);
  }
  assert.ok(room.version > version);
  assert.equal(room.game.choice.playerId, host.id);
  assert.ok(room.game.players.filter(p => p.id !== host.id).every(p => !p.hand));
  const stable = room.version;
  await delay(20);
  assert.equal((await h.request(host, `/api/rooms/${room.code}`)).room.version, stable);
  const deletion = await h.request(host, `/api/rooms/${room.code}/delete`, { version: stable });
  assert.equal(deletion.status, 200);
  await delay(15);
  assert.equal(h.app.db.prepare('SELECT COUNT(*) n FROM games').get().n, 0);
});

test('one human seat and three room bots complete games with each human faction', { timeout: 120000 }, async t => {
  const h = await harness(t);
  const host = await h.register('bot_full_game');
  for (const faction of ['cat', 'bird', 'alliance', 'vagabond']) {
    let room = (await h.request(host, '/api/rooms', { capacity: 4, name: 'Human', title: faction })).room;
    room = (await h.command(host, room, { type: 'profile', name: 'Human', faction })).room;
    for (const opponent of ['cat', 'bird', 'alliance', 'vagabond'].filter(value => value !== faction)) {
      room = (await h.command(host, room, { type: 'bot-add', faction: opponent })).room;
    }
    room = (await h.command(host, room, { type: 'ready', ready: true })).room;
    room = (await h.command(host, room, { type: 'start', ruleset: 'root-base-four-v5' })).room;
    let iterations = 0;
    while (room.status === 'playing' && iterations++ < 15000) {
      assert.equal(room.botError, null, `${faction}: ${room.botError}`);
      const raw = h.app.db.prepare('SELECT payload,version FROM rooms WHERE code=?').get(room.code);
      const state = JSON.parse(raw.payload).game;
      const actor = state.effects.frames[0]?.playerId || state.players[state.turn].id;
      if (actor === host.id) {
        room.version = raw.version;
        const view = projectGame(state, host.id);
        const actions = candidates(view, view.players.find(p => p.id === host.id), { developmentRound: 1 });
        let action;
        for (const candidate of actions) {
          try { applyAction(state, host.id, candidate); action = candidate; break; }
          catch (failure) { if (failure.status !== 422) throw failure; }
        }
        assert.ok(action, `No human test action for ${faction} ${view.phase}`);
        const result = await h.command(host, room, { type: 'action', action });
        assert.equal(result.status, 200, JSON.stringify(result));
        room = result.room;
      } else {
        await delay(2);
        room = (await h.request(host, `/api/rooms/${room.code}`)).room;
      }
    }
    assert.equal(room.status, 'finished', `${faction} did not finish`);
    assert.ok(room.game.winner);
    assert.ok(h.app.db.prepare('SELECT COUNT(*) n FROM snapshots WHERE game_id=?').get(room.gameId).n > 10);
    const oldVersion = room.version;
    await delay(10);
    assert.equal((await h.request(host, `/api/rooms/${room.code}`)).room.version, oldVersion);
    room = (await h.command(host, room, { type: 'new-game' })).room;
    assert.ok(room.members.filter(p => p.bot).every(p => p.ready));
    assert.equal(room.members.find(p => !p.bot).ready, false);
    assert.equal((await h.request(host, `/api/rooms/${room.code}/delete`, { version: room.version })).status, 200);
  }
});
