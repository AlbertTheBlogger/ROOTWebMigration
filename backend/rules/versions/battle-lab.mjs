// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { randomInt } from 'node:crypto';
import * as base from '../../engine.mjs';
import { createQueue, enqueue, takeEffect, resolveChoice, projectChoice } from '../effects/queue.mjs';
import { readFileSync } from 'node:fs';

export const RULESET = 'root-battle-lab-v2';
export const LIMITATIONS = [
  '秋季地图静态数据，固定的合法猫鹰初始摆放。',
  '48 张验证牌包含花色测试牌、伏击、铁砧和铠甲兵，完整原版牌库待接入。',
  '支持伏击、反伏击、战损、铠甲兵、战斗触发的野战医院和两种制作。',
  '原版开局选择、其他卡牌效果、其他阵营及扩展仍在开发。',
];
const map = JSON.parse(readFileSync(new URL('../../data/fall-map.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../../data/base-card-catalog.json', import.meta.url), 'utf8'));
const originalRecipes = new Map(catalog.cards.filter(card => ['item','armorers'].includes(card.kind)).map(card => [card.type, card]));
const positions = [[95,85],[350,65],[610,85],[330,200],[80,310],[290,350],[490,385],[645,290],[610,590],[420,560],[250,610],[75,555]];
const definitions = {
  anvil: { name: '铁砧', cost: ['fox'], item: 'hammer', points: 2 },
  armorers: { name: '铠甲兵', cost: ['fox'] },
};
const ensure = (condition, message) => { if (!condition) throw new base.RuleError(message); };
const player = (state, faction) => state.players.find(entry => entry.faction === faction);
const clearing = state => state.board.find(entry => entry.id === state.combat.clearing);
const matches = (card, suit) => card.suit === 'wild' || card.suit === suit;

function record(state, text) {
  state.log.push(text);
  if (state.log.length > 80) state.log.shift();
}

function effect(kind, data = {}) { return { type: 'effect', kind, data }; }
function pushFront(state, frames) { state.effects = enqueue(state.effects, frames, { front: true }); }

function choice(state, kind, owner, prompt, options, resume = null) {
  pushFront(state, [{ type: 'choice', kind, playerId: owner.id, prompt, options, resume }]);
  state.combat.phase = kind;
}

function discardHand(state, owner, cardId) {
  const index = owner.hand.findIndex(card => card.id === cardId);
  ensure(index >= 0, '这张牌不在你的手中');
  const [card] = owner.hand.splice(index, 1);
  state.discard.push(card);
  return card;
}

function askAmbush(state, faction, kind) {
  const owner = player(state, faction);
  const cards = owner.hand.filter(card => card.kind === 'ambush' && matches(card, clearing(state).suit));
  const options = [{ id: 'pass', label: kind === 'ambush' ? '不发动伏击' : '不抵消伏击', value: null }];
  for (const card of cards) options.push({ id: card.id, label: `打出${card.name}`, value: card.id });
  choice(state, kind, owner, kind === 'ambush' ? '防守方是否发动伏击？' : '攻击方是否抵消伏击？', options);
}

function cardboard(state, faction) {
  const area = clearing(state);
  const result = area.buildings.filter(building => building.faction === faction).map(building => building.type);
  if (faction === 'cat') {
    if (area.keep) result.push('keep');
    if (area.wood) result.push('wood');
  }
  return [...new Set(result)];
}

function damage(state, losses, stage) {
  const area = clearing(state);
  const next = [];
  let removedCats = 0;
  // Both sides' warriors leave the clearing before damage choices and triggers.
  for (const loss of losses) {
    const warriors = Math.min(loss.hits, area.warriors[loss.faction]);
    area.warriors[loss.faction] -= warriors;
    if (loss.faction === 'cat') removedCats += warriors;
    if (loss.hits > warriors) next.push(effect('cardboard-loss', { ...loss, hits: loss.hits - warriors }));
  }
  if (stage === 'ambush' && area.warriors[state.combat.attacker] === 0) state.combat.endedByAmbush = true;
  if (removedCats) next.push(effect('hospital', { count: removedCats, suit: area.suit }));
  pushFront(state, next);
}

function finish(state) {
  state.combat = null;
  state.pending = null;
  base.checkDecree(state);
}

function removeCardboard(state, faction, piece, by) {
  const area = clearing(state);
  ensure(cardboard(state, faction).includes(piece), '不能移除此棋子');
  if (piece === 'keep') area.keep = false;
  else if (piece === 'wood') area.wood--;
  else area.buildings.splice(area.buildings.findIndex(building => building.faction === faction && building.type === piece), 1);
  base.points(state, by, 1);
  if (!state.winner && by === 'bird' && state.bird.leader === 'despot' && !state.combat.despotScored) {
    state.combat.despotScored = true;
    base.points(state, by, 1);
  }
}

function pump(state, rng) {
  while (state.effects.frames[0]?.type === 'effect' && !state.winner) {
    const result = takeEffect(state.effects);
    state.effects = result.queue;
    const { kind, data } = result.effect;
    const battle = state.combat;
    const area = clearing(state);
    switch (kind) {
      case 'ambush':
        askAmbush(state, battle.defender, 'ambush');
        break;
      case 'ambush-hits':
        damage(state, [{ faction: battle.attacker, by: battle.defender, hits: 2 }], 'ambush');
        record(state, '伏击造成两点命中');
        break;
      case 'roll': {
        if (battle.endedByAmbush || area.warriors[battle.attacker] === 0) break;
        battle.rolls = [rng(4), rng(4)].sort((left, right) => right - left);
        battle.attackerRolled = Math.min(battle.rolls[0], area.warriors[battle.attacker]);
        battle.defenderRolled = Math.min(battle.rolls[1], area.warriors[battle.defender]);
        battle.attackerExtra = (area.warriors[battle.defender] === 0 ? 1 : 0) + (battle.attacker === 'bird' && state.bird.leader === 'commander' ? 1 : 0);
        state.randomEvents.push({ type: 'battle-dice', battleId: battle.id, values: [...battle.rolls] });
        record(state, `服务器战斗骰子 ${battle.rolls.join(' / ')}`);
        pushFront(state, [effect('armorers', { faction: battle.attacker }), effect('armorers', { faction: battle.defender }), effect('rolled-damage')]);
        break;
      }
      case 'armorers': {
        const owner = player(state, data.faction);
        const card = owner.crafted.find(card => card.kind === 'armorers');
        if (card) choice(state, 'armorers', owner, '是否弃置铠甲兵，忽略对方骰子造成的命中？', [{ id: 'pass', label: '保留铠甲兵', value: null }, { id: card.id, label: '弃置铠甲兵', value: card.id }], { faction: data.faction });
        break;
      }
      case 'rolled-damage':
        damage(state, [
          { faction: battle.defender, by: battle.attacker, hits: (battle.ignoreDefenderRoll ? 0 : battle.attackerRolled) + battle.attackerExtra },
          { faction: battle.attacker, by: battle.defender, hits: battle.ignoreAttackerRoll ? 0 : battle.defenderRolled },
        ], 'roll');
        break;
      case 'cardboard-loss': {
        const pieces = cardboard(state, data.faction);
        if (data.hits > 0 && pieces.length) {
          const options = pieces.map(piece => ({ id: piece, label: `移除${base.LABELS[piece]}`, value: piece }));
          choice(state, 'cardboard-loss', player(state, data.faction), '选择承受命中的建筑或标记', options, data);
        }
        break;
      }
      case 'hospital': {
        const keep = state.board.find(area => area.keep);
        if (!keep) break;
        const owner = player(state, 'cat');
        const cards = owner.hand.filter(card => matches(card, data.suit));
        if (!cards.length) break;
        const options = [{ id: 'pass', label: '不使用野战医院', value: null }];
        for (const card of cards) options.push({ id: card.id, label: `花费${card.name}，救回 ${data.count} 名士兵`, value: card.id });
        choice(state, 'hospital', owner, '是否使用野战医院？', options, data);
        break;
      }
      case 'finish':
        finish(state);
        break;
      default:
        throw new base.RuleError('未知战斗效果');
    }
  }
  if (state.winner) {
    state.effects.frames = [];
    state.combat = null;
    state.pending = null;
  }
}

function startBattle(state, attacker, area, rng) {
  const defender = attacker.faction === 'cat' ? 'bird' : 'cat';
  state.combat = { id: `battle-${++state.battleSequence}`, attacker: attacker.faction, defender, clearing: area.id, phase: 'ambush', rolls: null, despotScored: false };
  state.pending = { kind: 'queued-battle' };
  state.effects = enqueue(state.effects, [effect('ambush'), effect('roll'), effect('finish')]);
  record(state, `${attacker.name} 在${area.name}发起战斗`);
  pump(state, rng);
}

function answer(state, userId, action, rng) {
  const result = resolveChoice(state.effects, userId, action);
  state.effects = result.queue;
  const { kind, option, resume } = result.resolution;
  const battle = state.combat;
  const owner = state.players.find(entry => entry.id === userId);
  if (kind === 'ambush' && option.value) {
    discardHand(state, owner, option.value);
    record(state, `${owner.name} 打出伏击`);
    askAmbush(state, battle.attacker, 'counter-ambush');
  } else if (kind === 'counter-ambush') {
    if (option.value) {
      discardHand(state, owner, option.value);
      record(state, `${owner.name} 抵消伏击`);
    } else pushFront(state, [effect('ambush-hits')]);
  } else if (kind === 'armorers' && option.value) {
    const index = owner.crafted.findIndex(card => card.id === option.value && card.kind === 'armorers');
    ensure(index >= 0, '铠甲兵已经失效');
    state.discard.push(owner.crafted.splice(index, 1)[0]);
    if (resume.faction === battle.attacker) battle.ignoreAttackerRoll = true;
    else battle.ignoreDefenderRoll = true;
    record(state, `${owner.name} 使用铠甲兵`);
  } else if (kind === 'cardboard-loss') {
    removeCardboard(state, owner.faction, option.value, resume.by);
    if (!state.winner && resume.hits > 1) pushFront(state, [effect('cardboard-loss', { ...resume, hits: resume.hits - 1 })]);
  } else if (kind === 'hospital' && option.value) {
    const keep = state.board.find(area => area.keep);
    ensure(keep, '城堡已被移除');
    const card = owner.hand.find(card => card.id === option.value);
    ensure(card && matches(card, resume.suit), '医院需要匹配花色的手牌');
    discardHand(state, owner, card.id);
    keep.warriors.cat += resume.count;
    record(state, `${owner.name} 救回 ${resume.count} 名士兵`);
  }
  pump(state, rng);
}

function craftingPieces(state, owner) {
  const type = owner.faction === 'cat' ? 'workshop' : 'roost';
  return state.board.flatMap(area => area.buildings.flatMap((building, index) => building.type === type ? [{ id: `${area.id}-${index}`, suit: area.suit }] : []));
}

function recipe(state, card) {
  return state.ruleset === 'root-card-lab-v3' ? originalRecipes.get(card.archetype) : definitions[card.kind];
}

function craftingPayment(state, owner, definition) {
  const pieces = craftingPieces(state, owner).filter(piece => !state.craftingUsed.includes(piece.id));
  const selected = [];
  for (const suit of definition.cost) {
    const piece = pieces.find(piece => piece.suit === suit && !selected.includes(piece.id));
    if (!piece) return null;
    selected.push(piece.id);
  }
  return selected;
}

function canCraft(state, owner, card) {
  const definition = recipe(state, card);
  if (!definition || state.craftingClosed) return false;
  if (owner.faction === 'cat' ? state.phase !== 'daylight' : state.phase !== 'decree') return false;
  if (definition.item && !(state.itemSupply[definition.item] > 0)) return false;
  if (!definition.item && owner.crafted.some(entry => entry.kind === card.kind)) return false;
  return craftingPayment(state, owner, definition) !== null;
}

function craft(state, owner, cardId) {
  const card = owner.hand.find(card => card.id === cardId);
  ensure(card && canCraft(state, owner, card), '当前不能制作这张牌');
  const definition = recipe(state, card);
  state.craftingUsed.push(...craftingPayment(state, owner, definition));
  const index = owner.hand.findIndex(entry => entry.id === card.id);
  owner.hand.splice(index, 1);
  if (definition.item) {
    state.itemSupply[definition.item]--;
    owner.items.push(definition.item);
    state.discard.push(card);
    const score = owner.faction === 'bird' && state.bird.leader !== 'builder' ? 1 : definition.points;
    base.points(state, owner.faction, score);
  } else owner.crafted.push(card);
  record(state, `${owner.name} 制作${card.name}`);
}

export function createGame(players, rng = randomInt) {
  const state = base.createGame(players, rng);
  state.ruleset = RULESET;
  state.stateSchemaVersion = 2;
  state.effects = createQueue();
  state.combat = null;
  state.battleSequence = 0;
  state.randomEvents = [];
  state.craftingUsed = [];
  state.craftingClosed = false;
  state.itemSupply = { hammer: 1 };
  state.mapId = map.map_id;
  state.board = map.nodes.filter(node => node.node_type === 'clearing').map(node => ({
    id: node.id, name: `秋林 ${node.id}`, suit: node.suit, x: positions[node.id][0], y: positions[node.id][1],
    slots: node.building_slots, ruins: node.ruin ? 1 : 0, links: [...node.paths], riverLinks: [...node.river_neighbors],
    warriors: { cat: node.id === 8 ? 0 : 1, bird: node.id === 8 ? 6 : 0 }, buildings: [], wood: 0, keep: node.id === 0,
  }));
  state.board[0].buildings.push({ faction: 'cat', type: 'sawmill' });
  state.board[1].buildings.push({ faction: 'cat', type: 'workshop' });
  state.board[4].buildings.push({ faction: 'cat', type: 'recruiter' });
  state.board[8].buildings.push({ faction: 'bird', type: 'roost' });
  const variants = {
    'card-0': { kind: 'ambush', name: '狐狸伏击' }, 'card-1': { kind: 'ambush', name: '兔子伏击' },
    'card-2': { kind: 'ambush', name: '老鼠伏击' }, 'card-3': { kind: 'ambush', name: '鸟类伏击' },
    'card-7': { kind: 'ambush', name: '鸟类伏击' }, 'card-4': { kind: 'anvil', name: '铁砧' },
    'card-11': { kind: 'armorers', name: '铠甲兵' }, 'card-15': { kind: 'armorers', name: '铠甲兵' },
  };
  for (const card of [...state.deck, ...state.players.flatMap(owner => owner.hand)]) Object.assign(card, variants[card.id] || { kind: 'suit' });
  for (const owner of state.players) { owner.crafted = []; owner.items = []; }
  state.log = ['秋季地图与中断流程验证局开始'];
  return state;
}

export function applyAction(source, userId, action, rng = randomInt, ruleset = RULESET) {
  ensure(action && typeof action === 'object' && !Array.isArray(action), '操作格式错误');
  ensure(!source.winner, '对局已经结束');
  const owner = source.players.find(entry => entry.id === userId);
  ensure(owner, '你不在本局中');
  if (source.effects.frames.length) {
    ensure(action.type === 'choice', '等待当前选择完成');
    const state = structuredClone(source);
    answer(state, userId, action, rng);
    return state;
  }
  ensure(action.type !== 'choice', '当前没有待处理选择');
  if (action.type === 'craft') {
    ensure(source.players[source.turn].id === userId, '还没有轮到你');
    const state = structuredClone(source);
    craft(state, state.players.find(entry => entry.id === userId), action.card);
    return state;
  }
  const state = base.applyAction(source, userId, action, rng, { ruleset, startBattle });
  if (['move', 'recruit', 'build', 'overwork', 'battle', 'extra'].includes(action.type)) state.craftingClosed = true;
  if (state.turnsCompleted !== source.turnsCompleted) { state.craftingUsed = []; state.craftingClosed = false; }
  return state;
}

export function projectGame(state, userId) {
  const view = base.projectGame(state, userId);
  delete view.effects;
  delete view.randomEvents;
  delete view.combat;
  view.pending = null;
  view.choice = projectChoice(state.effects, userId);
  view.combat = state.combat ? { clearing: state.combat.clearing, attacker: state.combat.attacker, defender: state.combat.defender, phase: state.combat.phase, rolls: state.combat.rolls } : null;
  view.limitations = LIMITATIONS;
  const owner = state.players.find(entry => entry.id === userId);
  view.craftOptions = owner && state.players[state.turn].id === userId && !state.effects.frames.length ? owner.hand.filter(card => canCraft(state, owner, card)).map(card => ({ card: card.id, name: card.name })) : [];
  return view;
}
