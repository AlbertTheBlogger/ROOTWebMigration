import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueue, enqueue, takeEffect, resolveChoice, projectChoice } from '../backend/rules/effects/queue.mjs';
import * as registry from '../backend/rules/versions/registry.mjs';
import * as lab from '../backend/engine.mjs';

const choice = (playerId = 'defender') => ({ type: 'choice', kind: 'ambush', playerId, prompt: '是否伏击？', options: [{ id: 'card-17', label: '狐狸伏击', value: { cardId: 'private-card-17' } }, { id: 'pass', label: '跳过', value: null }], resume: { battleId: 'private-internal-state' } });

test('choice survives JSON persistence and nested choices preserve continuation order', () => {
  let q = enqueue(createQueue(), [choice(), { type: 'effect', kind: 'roll-dice', data: { battleId: 1 } }]);
  const initial = structuredClone(q);
  const id = q.frames[0].id;
  q = JSON.parse(JSON.stringify(q));
  const result = resolveChoice(q, 'defender', { choiceId: id, optionId: 'card-17' });
  assert.equal(result.resolution.option.value.cardId, 'private-card-17');
  q = enqueue(result.queue, [choice('attacker')], { front: true });
  assert.equal(q.frames[0].id, 'effect-3');
  assert.equal(q.frames[1].kind, 'roll-dice');
  q = resolveChoice(JSON.parse(JSON.stringify(q)), 'attacker', { choiceId: 'effect-3', optionId: 'pass' }).queue;
  const next = takeEffect(q);
  assert.equal(next.effect.kind, 'roll-dice');
  assert.equal(next.queue.frames.length, 0);
  assert.equal(initial.frames.length, 2);
  assert.equal(initial.sequence, 2);
});

test('stale choice, wrong owner and forged options cannot advance queue', () => {
  const q = enqueue(createQueue(), [choice(), choice()]);
  assert.throws(() => resolveChoice(q, 'attacker', { choiceId: 'effect-1', optionId: 'pass' }), /another player/);
  assert.throws(() => resolveChoice(q, 'defender', { choiceId: 'effect-2', optionId: 'pass' }), /expired/);
  assert.throws(() => resolveChoice(q, 'defender', { choiceId: 'effect-1', optionId: 'set-score-30' }), /not valid/);
  const next = resolveChoice(q, 'defender', { choiceId: 'effect-1', optionId: 'pass' }).queue;
  assert.throws(() => resolveChoice(next, 'defender', { choiceId: 'effect-1', optionId: 'pass' }), /expired/);
  assert.throws(() => takeEffect(q), /Waiting/);
  assert.equal(q.frames.length, 2);
});

test('observer receives no hidden card options, future effects or resume data', () => {
  const q = enqueue(createQueue(), [choice(), { type: 'effect', kind: 'private-draw', data: { card: 'secret-deck-card' } }]);
  const observer = JSON.stringify(projectChoice(q, 'attacker'));
  assert.ok(!observer.includes('card-17'));
  assert.ok(!observer.includes('secret'));
  assert.ok(!observer.includes('resume'));
  const owner = projectChoice(q, 'defender');
  assert.equal(owner.options[0].label, '狐狸伏击');
  assert.equal(owner.options[0].value, undefined);
  assert.equal(owner.resume, undefined);
});

test('non-serializable state, duplicate options and unknown schema are rejected', () => {
  assert.throws(() => enqueue(createQueue(), [{ type: 'effect', kind: 'callback', data: () => 1 }]), /JSON/);
  assert.throws(() => enqueue(createQueue(), [{ type: 'effect', kind: 'date', data: new Date() }]), /plain/);
  assert.throws(() => enqueue(createQueue(), [{ ...choice(), options: [{ id: 'x', label: 'a' }, { id: 'x', label: 'b' }] }]), /unique/);
  assert.throws(() => projectChoice({ ...createQueue(), schemaVersion: 2 }, 'a'), /Unsupported/);
  const q = enqueue(createQueue(), [choice()]);
  assert.throws(() => takeEffect({ ...q, frames: [...q.frames, ...q.frames] }), /duplicate/);
});

test('version registry accepts old lab snapshots and rejects unknown versions without mutation', () => {
  const players = [{ userId: 'a', name: '猫', faction: 'cat' }, { userId: 'b', name: '鹰', faction: 'bird' }];
  const old = lab.createGame(players, () => 0);
  assert.equal(old.stateSchemaVersion, undefined);
  assert.deepEqual(registry.projectGame(old, 'a'), lab.projectGame(old, 'a'));
  const current = registry.createGame(players, () => 0);
  assert.equal(current.stateSchemaVersion, 1);
  assert.throws(() => registry.projectGame({ ...old, ruleset: 'root-full' }, 'a'), /规则版本/);
  assert.throws(() => registry.projectGame({ ...old, stateSchemaVersion: 2 }, 'a'), /存档结构/);
  assert.equal(old.stateSchemaVersion, undefined);
});
