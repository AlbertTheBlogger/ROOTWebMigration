import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../backend/server.mjs';

test('host deletion removes all room archives atomically and reclaims storage', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'woodland-delete-'));
  const dbPath = join(directory, 'test.sqlite');
  // Exercise migration of a pre-existing database without auto-vacuum metadata.
  const old = new DatabaseSync(dbPath);
  old.exec("CREATE TABLE legacy_marker(value TEXT); INSERT INTO legacy_marker VALUES('preserved');");
  old.close();
  const app = createApp({ dbPath, rateLimit: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  assert.equal(app.db.prepare('PRAGMA auto_vacuum').get().auto_vacuum, 2);
  assert.equal(app.db.prepare('SELECT value FROM legacy_marker').get().value, 'preserved');

  async function request(user, path, body) {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: user.cookie || '', 'Content-Type': 'application/json', Origin: base },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) user.cookie = cookie.split(';')[0];
    return { status: response.status, data: await response.json() };
  }
  const owner = {}, guest = {};
  for (const [user, username] of [[owner, 'delete_owner'], [guest, 'delete_guest']]) {
    const response = await request(user, '/api/auth/register', { username, password: 'local-delete-test-123' });
    assert.equal(response.status, 200);
  }
  async function command(user, room, value) {
    const response = await request(user, `/api/rooms/${room.code}/command`, {
      commandId: randomUUID(), version: room.version, command: value,
    });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    return response.data.room;
  }
  const unrelated = (await request(owner, '/api/rooms', { title: '保留房间', name: '保留猫', password: '' })).data.room;
  let room = (await request(owner, '/api/rooms', { title: '待删房间', name: '猫', password: '' })).data.room;
  room = (await request(guest, `/api/rooms/${room.code}/join`, { name: '鹰', password: '' })).data.room;
  const gameIds = [];
  for (let index = 0; index < 2; index++) {
    room = await command(owner, room, { type: 'ready', ready: true });
    room = await command(guest, room, { type: 'ready', ready: true });
    room = await command(owner, room, { type: 'start', ruleset: 'root-cats-birds-v4' });
    gameIds.push(room.gameId);
    room = await command(owner, room, { type: 'resign' });
    if (index === 0) room = await command(owner, room, { type: 'new-game' });
  }
  const endpoint = `/api/rooms/${room.code}/delete`;
  assert.equal((await request(guest, endpoint, { version: room.version })).status, 403);
  assert.equal((await request({}, endpoint, { version: room.version })).status, 401);
  assert.equal((await request(owner, endpoint, { version: room.version - 1 })).status, 409);
  const ownerList = (await request(owner, '/api/rooms')).data.rooms;
  const guestList = (await request(guest, '/api/rooms')).data.rooms;
  assert.equal(ownerList.find(item => item.code === room.code).canDelete, true);
  assert.equal(guestList.find(item => item.code === room.code).canDelete, false);

  // Create a large valid archive fixture to check physical file reclamation.
  const archived = JSON.parse(app.db.prepare('SELECT state FROM games WHERE id=?').get(gameIds[0]).state);
  archived.log.push('archive storage fixture '.repeat(4000));
  const insert = app.db.prepare('INSERT INTO snapshots(game_id,room_version,state,command,created_at) VALUES(?,?,?,?,?)');
  app.db.exec('BEGIN');
  for (let index = 0; index < 32; index++) insert.run(gameIds[0], index, JSON.stringify(archived), '{}', Date.now());
  app.db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
  const beforeBytes = statSync(dbPath).size;
  const beforeSnapshots = app.db.prepare('SELECT count(*) count FROM snapshots').get().count;
  app.db.exec("CREATE TRIGGER fail_room_delete BEFORE DELETE ON rooms BEGIN SELECT RAISE(ABORT,'fixture rollback'); END;");
  const errorLog = t.mock.method(console, 'error', () => {});
  assert.equal((await request(owner, endpoint, { version: room.version })).status, 500);
  errorLog.mock.restore();
  assert.equal(app.db.prepare('SELECT count(*) count FROM snapshots').get().count, beforeSnapshots);
  assert.equal(app.db.prepare('SELECT count(*) count FROM games').get().count, 2);
  assert.equal(app.db.prepare('SELECT count(*) count FROM commands WHERE room_code=?').get(room.code).count > 0, true);
  app.db.exec('DROP TRIGGER fail_room_delete;');

  const abort = new AbortController();
  const stream = await fetch(base + `/api/rooms/${room.code}/events`, { headers: { Cookie: guest.cookie }, signal: abort.signal });
  const reader = stream.body.getReader();
  await reader.read();
  const deleted = await request(owner, endpoint, { version: room.version });
  assert.equal(deleted.status, 200);
  let events = '';
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    events += new TextDecoder().decode(chunk.value);
  }
  assert.match(events, /event: deleted/);
  abort.abort();
  for (const gameId of gameIds) assert.equal((await request(owner, `/api/games/${gameId}`)).status, 404);
  assert.equal((await request(owner, `/api/rooms/${room.code}`)).status, 404);
  assert.equal((await request(owner, endpoint, { version: room.version })).status, 404);
  assert.equal(app.db.prepare('SELECT count(*) count FROM snapshots').get().count, 0);
  assert.equal(app.db.prepare('SELECT count(*) count FROM games').get().count, 0);
  assert.equal(app.db.prepare('SELECT count(*) count FROM commands WHERE room_code=?').get(room.code).count, 0);
  assert.equal((await request(owner, `/api/rooms/${unrelated.code}`)).status, 200);
  assert.equal(app.db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.ok(statSync(dbPath).size < beforeBytes / 2, 'Archive deletion should return database pages to the filesystem');

  let closed = (await request(owner, '/api/rooms', { title: '已关闭房间', name: '猫', password: '' })).data.room;
  await command(owner, closed, { type: 'leave' });
  closed = (await request(owner, '/api/rooms')).data.rooms.find(item => item.code === closed.code);
  assert.equal(closed.status, 'closed');
  assert.equal(closed.canDelete, true);
  assert.equal((await request(owner, `/api/rooms/${closed.code}/delete`, { version: closed.version })).status, 200);

  let transfer = (await request(owner, '/api/rooms', { title: '转交房主', name: '猫', password: '' })).data.room;
  transfer = (await request(guest, `/api/rooms/${transfer.code}/join`, { name: '鹰', password: '' })).data.room;
  await command(owner, transfer, { type: 'leave' });
  transfer = (await request(guest, `/api/rooms/${transfer.code}`)).data.room;
  assert.equal((await request(owner, `/api/rooms/${transfer.code}/delete`, { version: transfer.version })).status, 403);
  assert.equal((await request(guest, `/api/rooms/${transfer.code}/delete`, { version: transfer.version })).status, 200);
});
