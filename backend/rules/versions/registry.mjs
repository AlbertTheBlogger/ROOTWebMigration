// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import * as lab from '../../engine.mjs';
import * as battleLab from './battle-lab.mjs';
import * as cardLab from './card-lab.mjs';
import * as catsBirds from './cats-birds.mjs';
import * as baseFour from './base-four.mjs';
import * as lizardCult from './lizard-cult.mjs';

// Ruleset and state schema versions are separate from package/database versions.
const implementations = new Map([
  [lab.RULESET, { ...lab, stateSchemaVersion: 1 }],
  [battleLab.RULESET, { ...battleLab, stateSchemaVersion: 2 }],
  [cardLab.RULESET, { ...cardLab, stateSchemaVersion: 3 }],
  [catsBirds.RULESET, { ...catsBirds, stateSchemaVersion: 4 }],
  [baseFour.RULESET, { ...baseFour, stateSchemaVersion: 5 }],
  [lizardCult.RULESET, { ...lizardCult, stateSchemaVersion: 6 }],
]);
function implementation(id) {
  const value = implementations.get(id);
  if (!value) throw Object.assign(new Error('该规则版本尚未实现或不受支持'), { status: 422 });
  return value;
}
function forState(state) {
  const rules = implementation(state?.ruleset);
  // Older lab snapshots had no schema marker; they are the same schema 1.
  if ((state.stateSchemaVersion ?? 1) !== rules.stateSchemaVersion) {
    throw Object.assign(new Error('该存档结构版本不受支持'), { status: 422 });
  }
  return rules;
}
export function createGame(players, rng, ruleset = lab.RULESET) {
  const rules = implementation(ruleset);
  return { ...rules.createGame(players, rng), stateSchemaVersion: rules.stateSchemaVersion };
}
export function applyAction(state, userId, action, rng) {
  return forState(state).applyAction(state, userId, action, rng);
}
export function projectGame(state, userId) {
  return forState(state).projectGame(state, userId);
}
export const supportedRulesets = () => [...implementations.keys()];
