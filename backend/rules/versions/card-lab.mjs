import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { shuffle, draw } from '../../engine.mjs';
import * as battle from './battle-lab.mjs';

export const RULESET = 'root-card-lab-v3';
export const LIMITATIONS = [
  '两人猫鹰验证局，秋季地图与固定开局沿用 v2。',
  '接入原版 DrawDeck 的 50 张牌组成、20 种物品牌配方与原版物品供应。',
  '支持物品制作、铠甲兵、伏击和战斗选择恢复。其余卡牌标记为效果待实现，可用于花色支付与政令。',
  '原版独立 DominanceCards 列表的四张统治卡尚未接入，其他阵营与完整开局仍待实现。',
];
const catalog = JSON.parse(readFileSync(new URL('../../data/base-card-catalog.json', import.meta.url), 'utf8'));

export function createGame(players, rng = randomInt) {
  const state = battle.createGame(players, rng);
  state.ruleset = RULESET;
  state.stateSchemaVersion = 3;
  state.deck = shuffle(catalog.cards.flatMap(definition => Array.from({ length: definition.count }, (_, copy) => ({
    id: `${definition.type}-${copy}`, archetype: definition.type, name: definition.name, suit: definition.suit,
    kind: definition.kind, effectImplemented: definition.kind !== 'unimplemented',
  }))), rng);
  state.discard = [];
  state.itemSupply = { ...catalog.item_supply };
  state.deckId = 'original-draw-deck-static-v1';
  for (const owner of state.players) {
    owner.hand = [];
    draw(state, owner, 3, rng);
  }
  state.log = ['原版牌组与物品制作验证局开始'];
  return state;
}

export function applyAction(state, userId, action, rng) {
  return battle.applyAction(state, userId, action, rng, RULESET);
}

export function projectGame(state, userId) {
  return { ...battle.projectGame(state, userId), limitations: LIMITATIONS };
}
