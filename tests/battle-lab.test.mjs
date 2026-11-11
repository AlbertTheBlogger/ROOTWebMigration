import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../backend/rules/versions/battle-lab.mjs';

export function fixture() {
  const state = rules.createGame([{ userId: 'a', name: '猫', faction: 'cat' }, { userId: 'b', name: '鹰', faction: 'bird' }], () => 0);
  state.turn = 0;
  state.phase = 'daylight';
  state.players.forEach(owner => { owner.hand = []; owner.crafted = []; });
  const area = state.board[3];
  area.warriors = { cat: 3, bird: 3 };
  area.buildings = [];
  return state;
}
const ambush = id => ({ id, kind: 'ambush', name: '鸟类伏击', suit: 'wild' });
const suit = id => ({ id, kind: 'suit', name: '狐狸测试牌', suit: 'wild' });
function choose(state, user, option, rng = () => 0) {
  return rules.applyAction(state, user, { type: 'choice', choiceId: rules.projectGame(state, user).choice.choiceId, optionId: option }, rng);
}
function start(state, rng = () => 0) { return rules.applyAction(state, 'a', { type: 'battle', clearing: 3 }, rng); }

test('v2 uses extracted fall topology, fixed valid setup and a distinct ruleset', () => {
  const state = rules.createGame([{ userId: 'a', name: '猫', faction: 'cat' }, { userId: 'b', name: '鹰', faction: 'bird' }], () => 0);
  assert.equal(state.ruleset, rules.RULESET);
  assert.equal(state.stateSchemaVersion, 2);
  assert.deepEqual(state.board[0].links, [1, 3, 4]);
  assert.deepEqual(state.board.filter(area => area.ruins).map(area => area.id), [3, 5, 6, 7]);
  assert.ok(state.board.every(area => area.buildings.length + area.ruins <= area.slots));
});

test('defender choice is always offered and hidden options stay private', () => {
  const state = fixture();
  state.players[1].hand.push(ambush('hidden-ambush'));
  const next = start(state);
  assert.equal(next.actions, 2);
  assert.equal(rules.projectGame(next, 'b').choice.options.length, 2);
  const attacker = rules.projectGame(next, 'a');
  assert.equal(attacker.choice.waiting, true);
  assert.ok(!JSON.stringify(attacker).includes('hidden-ambush'));
  assert.equal(attacker.effects, undefined);
  assert.equal(attacker.randomEvents, undefined);
  assert.equal(start(fixture()).effects.frames[0].kind, 'ambush');
});

test('ambush and counter-ambush spend cards once and roll only after the choice', () => {
  let state = fixture();
  state.players[0].hand.push(ambush('counter'));
  state.players[1].hand.push(ambush('ambush'));
  let rolls = 0;
  const rng = () => { rolls++; return 0; };
  state = start(state, rng);
  assert.equal(rolls, 0);
  state = choose(state, 'b', 'ambush', rng);
  assert.equal(rolls, 0);
  state = choose(state, 'a', 'counter', rng);
  assert.equal(rolls, 2);
  assert.equal(state.board[3].warriors.cat, 3);
  assert.equal(state.combat, null);
  assert.equal(state.discard.length, 2);
});

test('hospital choice persists after ambush and does not resume an ended battle', () => {
  let state = fixture();
  state.board[3].warriors.cat = 2;
  state.players[0].hand.push(suit('hospital'));
  state.players[1].hand.push(ambush('ambush'));
  state = choose(start(state), 'b', 'ambush');
  state = choose(state, 'a', 'pass');
  assert.equal(state.board[3].warriors.cat, 0);
  assert.equal(rules.projectGame(state, 'a').choice.kind, 'hospital');
  state = JSON.parse(JSON.stringify(state));
  const before = state.board[0].warriors.cat;
  state = choose(state, 'a', 'hospital', () => { throw new Error('Must not roll'); });
  assert.equal(state.board[0].warriors.cat, before + 2);
  assert.equal(state.combat, null);
  assert.equal(state.randomEvents.length, 0);
});

test('rolled damage removes warriors simultaneously before hospital and restoration never rerolls', () => {
  let state = fixture();
  state.players[0].hand.push(suit('hospital'));
  state = choose(start(state), 'b', 'pass', () => 2);
  assert.deepEqual(state.board[3].warriors, { cat: 1, bird: 1 });
  assert.equal(state.randomEvents.length, 1);
  const id = rules.projectGame(state, 'a').choice.choiceId;
  const before = structuredClone(state);
  assert.throws(() => rules.applyAction(state, 'b', { type: 'choice', choiceId: id, optionId: 'pass' }), /another player/);
  assert.deepEqual(state, before);
  state = choose(JSON.parse(JSON.stringify(state)), 'a', 'hospital', () => { throw new Error('Must not reroll'); });
  assert.equal(state.randomEvents.length, 1);
  assert.equal(state.combat, null);
  assert.throws(() => rules.applyAction(state, 'a', { type: 'choice', choiceId: id, optionId: 'hospital' }), /没有/);
});

test('armorers cancels rolled hits while commander extra hits remain', () => {
  let state = fixture();
  state.turn = 1;
  state.phase = 'decree';
  state.bird.leader = 'commander';
  state.bird.remaining = { recruit: [], move: [], battle: [{ id: 'order', suit: 'wild' }], build: [] };
  state.players[0].crafted = [{ id: 'armor', name: '铠甲兵', suit: 'wild', kind: 'armorers' }];
  state = rules.applyAction(state, 'b', { type: 'battle', clearing: 3, decreeCard: 'order' });
  state = choose(state, 'a', 'pass', () => 2);
  assert.equal(rules.projectGame(state, 'a').choice.kind, 'armorers');
  state = choose(state, 'a', 'armor');
  assert.equal(state.board[3].warriors.cat, 2);
  assert.equal(state.board[3].warriors.bird, 1);
  assert.equal(state.players[0].crafted.length, 0);
});

test('destroyed keep prevents hospitals and cardboard losses are selected by the owner', () => {
  let state = fixture();
  state.turn = 1; state.phase = 'decree';
  state.bird.remaining = { recruit: [], move: [], battle: [{ id: 'order', suit: 'wild' }], build: [] };
  state.board[0].keep = false;
  state.board[3].keep = true;
  state.board[3].warriors.cat = 1;
  state.players[0].hand.push(suit('hospital'));
  state = rules.applyAction(state, 'b', { type: 'battle', clearing: 3, decreeCard: 'order' });
  state = choose(state, 'a', 'pass', () => 3);
  assert.equal(rules.projectGame(state, 'a').choice.kind, 'cardboard-loss');
  state = choose(state, 'a', 'keep');
  assert.equal(state.board[3].keep, false);
  assert.equal(state.effects.frames.length, 0);
  assert.equal(state.players[0].hand.length, 1);
});

test('crafting consumes a matching crafting piece and item supply, then closes on an action', () => {
  let state = fixture();
  state.board[1].suit = 'fox';
  state.players[0].hand = [{ id: 'anvil', name: '铁砧', kind: 'anvil', suit: 'fox' }, { id: 'armor', name: '铠甲兵', kind: 'armorers', suit: 'wild' }];
  state = rules.applyAction(state, 'a', { type: 'craft', card: 'anvil' });
  assert.equal(state.players[0].score, 2);
  assert.equal(state.itemSupply.hammer, 0);
  assert.throws(() => rules.applyAction(state, 'a', { type: 'craft', card: 'armor' }), /不能制作/);
  state = rules.applyAction(state, 'a', { type: 'move', from: 0, to: 1, count: 1 });
  assert.equal(state.craftingClosed, true);
});

test('battle choices block other actions and forged choices cannot mutate the source', () => {
  const state = start(fixture());
  const original = structuredClone(state);
  assert.throws(() => rules.applyAction(state, 'a', { type: 'end' }), /等待/);
  assert.throws(() => rules.applyAction(state, 'b', { type: 'choice', choiceId: 'effect-999', optionId: 'pass' }), /expired/);
  assert.throws(() => rules.applyAction(state, 'b', { type: 'choice', choiceId: state.effects.frames[0].id, optionId: 'free-card' }), /not valid/);
  assert.deepEqual(state, original);
});
