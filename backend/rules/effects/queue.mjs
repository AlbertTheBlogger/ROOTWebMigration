// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
// Serializable infrastructure for future rulesets. Existing lab battles still use pending.
export class ChoiceError extends Error {
  constructor(message) { super(message); this.status = 422; }
}
const requireThat = (ok, message) => { if (!ok) throw new ChoiceError(message); };
const clone = value => structuredClone(value);

function jsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { requireThat(Number.isFinite(value), 'Invalid JSON number'); return; }
  requireThat(typeof value === 'object' && value !== null, 'Queue must contain only JSON values');
  requireThat(!seen.has(value), 'Queue cannot contain cycles');
  requireThat(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'Queue requires plain objects');
  seen.add(value);
  for (const item of Object.values(value)) jsonValue(item, seen);
  seen.delete(value);
}

function frame(frame) {
  jsonValue(frame);
  requireThat(['effect', 'choice'].includes(frame.type), 'Unknown frame type');
  requireThat(typeof frame.kind === 'string' && frame.kind.length > 0, 'Frame kind required');
  if (frame.type === 'choice') {
    requireThat(typeof frame.playerId === 'string' && frame.playerId.length > 0, 'Choice owner required');
    requireThat(typeof frame.prompt === 'string', 'Choice prompt required');
    requireThat(Array.isArray(frame.options) && frame.options.length > 0, 'Choice options required');
    const ids = new Set();
    for (const option of frame.options) {
      requireThat(typeof option.id === 'string' && option.id.length > 0 && !ids.has(option.id), 'Choice option IDs must be unique');
      requireThat(typeof option.label === 'string', 'Choice option label required');
      ids.add(option.id);
    }
  }
}

function valid(queue) {
  jsonValue(queue);
  requireThat(queue.schemaVersion === 1, 'Unsupported effect queue schema');
  requireThat(Number.isSafeInteger(queue.sequence) && queue.sequence >= 0, 'Invalid effect sequence');
  requireThat(Array.isArray(queue.frames), 'Queue frames required');
  const ids = new Set();
  for (const item of queue.frames) {
    frame(item);
    const match = /^effect-([1-9]\d*)$/.exec(item.id);
    requireThat(match && Number(match[1]) <= queue.sequence && !ids.has(item.id), 'Invalid or duplicate effect ID');
    ids.add(item.id);
  }
}

export function createQueue() { return { schemaVersion: 1, sequence: 0, frames: [] }; }

// These frames are produced by server rules, never accepted directly from a player.
export function enqueue(queue, effects, { front = false } = {}) {
  valid(queue);
  requireThat(Array.isArray(effects), 'Effects must be an array');
  const next = clone(queue);
  const added = effects.map(effect => {
    frame(effect);
    requireThat(!Object.hasOwn(effect, 'id'), 'Effect IDs are server assigned');
    requireThat(next.sequence < Number.MAX_SAFE_INTEGER, 'Effect sequence exhausted');
    return { ...clone(effect), id: `effect-${++next.sequence}` };
  });
  next.frames = front ? [...added, ...next.frames] : [...next.frames, ...added];
  return next;
}

export function takeEffect(queue) {
  valid(queue);
  requireThat(queue.frames.length > 0, 'Queue is empty');
  requireThat(queue.frames[0].type === 'effect', 'Waiting for player choice');
  const next = clone(queue);
  const effect = next.frames.shift();
  return { queue: next, effect };
}

export function resolveChoice(queue, playerId, { choiceId, optionId } = {}) {
  valid(queue);
  const current = queue.frames[0];
  requireThat(current?.type === 'choice', 'No active choice');
  requireThat(current.playerId === playerId, 'Waiting for another player');
  requireThat(current.id === choiceId, 'Choice has expired');
  const option = current.options.find(option => option.id === optionId);
  requireThat(option, 'Option is not valid for this choice');
  const next = clone(queue);
  next.frames.shift();
  return { queue: next, resolution: { effectId: current.id, kind: current.kind, playerId, option: clone(option), resume: clone(current.resume ?? null) } };
}

// A waiting observer must not receive options, private data, or future frames.
export function projectChoice(queue, playerId) {
  valid(queue);
  const current = queue.frames[0];
  if (!current || current.type !== 'choice') return null;
  const common = { choiceId: current.id, playerId: current.playerId, kind: current.kind, waiting: current.playerId !== playerId };
  if (common.waiting) return common;
  return { ...common, prompt: current.prompt, options: current.options.map(({ id, label }) => ({ id, label })) };
}
