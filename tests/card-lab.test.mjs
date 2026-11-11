import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as registry from '../backend/rules/versions/registry.mjs';

const catalog = JSON.parse(readFileSync(new URL('../backend/data/base-card-catalog.json', import.meta.url), 'utf8'));
const players = [{ userId: 'a', name: '猫', faction: 'cat' }, { userId: 'b', name: '鹰', faction: 'bird' }];
const create = () => registry.createGame(players, () => 0, 'root-card-lab-v3');
const allCards = state => [...state.deck, ...state.discard, ...state.players.flatMap(owner => [...owner.hand, ...owner.crafted])];
function fixture(archetype, faction = 'cat', leader = 'despot') {
  const state = create();
  const card = allCards(state).find(card => card.archetype === archetype);
  const owner = state.players.find(owner => owner.faction === faction);
  state.deck = allCards(state).filter(entry => entry.id !== card.id);
  state.players.forEach(owner => { owner.hand = []; });
  owner.hand = [card];
  state.turn = state.players.indexOf(owner);
  state.phase = faction === 'cat' ? 'daylight' : 'decree';
  state.bird.leader = leader;
  state.board.forEach(area => { area.buildings = []; });
  const cost = catalog.cards.find(entry => entry.type === archetype).cost;
  for (const suit of cost) {
    const area = state.board.find(area => area.suit === suit && !area.buildings.length);
    area.buildings.push({ faction, type: faction === 'cat' ? 'workshop' : 'roost' });
  }
  return { state, owner, card };
}

test('v3 preserves all 50 original DrawDeck identities and keeps unsupported effects explicit', () => {
  const state = create();
  assert.equal(state.stateSchemaVersion, 3);
  const cards = allCards(state);
  assert.equal(cards.length, 50);
  assert.equal(new Set(cards.map(card => card.id)).size, 50);
  assert.equal(cards.filter(card => card.kind === 'ambush').length, 5);
  assert.equal(cards.filter(card => card.kind === 'item').length, 20);
  assert.equal(cards.filter(card => card.kind === 'armorers').length, 2);
  assert.ok(cards.filter(card => card.kind === 'unimplemented').every(card => card.effectImplemented === false));
  assert.deepEqual(state.itemSupply, { bag: 2, boot: 2, crossbow: 1, hammer: 1, sword: 2, tea: 2, coin: 2 });
  const view = registry.projectGame(state, 'a');
  assert.equal(view.players[1].hand, undefined);
  assert.equal(view.deck, undefined);
  assert.equal(view.effects, undefined);
});

test('every extracted item recipe consumes its complete cost and awards cat points', () => {
  for (const definition of catalog.cards.filter(card => card.kind === 'item')) {
    const { state, owner, card } = fixture(definition.type);
    const before = structuredClone(state);
    const next = registry.applyAction(state, owner.id, { type: 'craft', card: card.id });
    assert.deepEqual(state, before);
    assert.equal(next.players[0].score, definition.points, definition.type);
    assert.deepEqual(next.players[0].items, [definition.item]);
    assert.equal(next.itemSupply[definition.item], state.itemSupply[definition.item] - 1);
    assert.equal(next.craftingUsed.length, definition.cost.length);
    assert.equal(allCards(next).length, 50);
  }
});

test('two-symbol recipes need two distinct unused facilities and reject invalid payments atomically', () => {
  const { state, owner, card } = fixture('BakeSaleRabbit');
  const facilities = state.board.filter(area => area.buildings.length);
  facilities[1].buildings = [];
  const before = structuredClone(state);
  assert.equal(registry.projectGame(state, owner.id).craftOptions.length, 0);
  assert.throws(() => registry.applyAction(state, owner.id, { type: 'craft', card: card.id }));
  assert.deepEqual(state, before);
  facilities[1].buildings = [{ faction: 'cat', type: 'workshop' }];
  state.craftingUsed = [`${facilities[0].id}-0`];
  assert.throws(() => registry.applyAction(state, owner.id, { type: 'craft', card: card.id }));
});

test('Eyrie disdain and Builder points apply to the extracted item recipes', () => {
  for (const [leader, expected] of [['despot', 1], ['builder', 3]]) {
    const { state, owner, card } = fixture('BakeSaleRabbit', 'bird', leader);
    const next = registry.applyAction(state, owner.id, { type: 'craft', card: card.id });
    assert.equal(next.players[1].score, expected);
    assert.equal(next.craftingUsed.length, 2);
  }
});

test('original items require remaining supply and unsupported card effects stay unavailable', () => {
  const { state, owner, card } = fixture('AnvilFox');
  state.itemSupply.hammer = 0;
  assert.throws(() => registry.applyAction(state, owner.id, { type: 'craft', card: card.id }));
  const unsupported = state.deck.find(card => card.kind === 'unimplemented');
  owner.hand.push(unsupported);
  assert.throws(() => registry.applyAction(state, owner.id, { type: 'craft', card: unsupported.id }));
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(registry.projectGame(restored, owner.id), registry.projectGame(state, owner.id));
});
