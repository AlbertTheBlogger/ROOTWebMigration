import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../backend/rules/versions/base-four.mjs';

const members = ['cat', 'bird', 'alliance', 'vagabond'].map(faction => ({ userId: faction, faction, name: faction }));
function setup(character = 'thief') {
  let state = rules.createGame(members, () => 0);
  while (!state.setup.complete) {
    const choice = state.effects.frames[0];
    const option = choice.kind === 'setup-character' ? character : choice.options[0].id;
    state = rules.applyAction(state, choice.playerId, { type: 'choice', choiceId: choice.id, optionId: option }, () => 0);
  }
  return state;
}
function current(state, faction, phase) {
  state.turn = state.players.findIndex(player => player.faction === faction);
  state.phase = phase;
  state.effects.frames = [];
  state.combat = null;
  state.craftingUsed = [];
  return state;
}
function player(state, faction) { return state.players.find(player => player.faction === faction); }
function act(state, faction, action, rng = () => 0) { return rules.applyAction(state, faction, action, rng); }
function resolve(state, picker = choice => choice.options.find(option => option.id === 'pass') || choice.options[0]) {
  while (state.effects.frames[0]?.type === 'choice') {
    const choice = state.effects.frames[0];
    state = act(state, choice.playerId, { type: 'choice', choiceId: choice.id, optionId: picker(choice).id });
  }
  return state;
}
function card(id, suit = 'fox') { return { id, suit, kind: 'ambush', name: id }; }
function item(id, type, extra = {}) { return { id, type, exhausted: false, damaged: false, track: false, source: 'fixture', ...extra }; }

test('four-faction setup and private projection', () => {
  const state = setup();
  assert.equal(state.stateSchemaVersion, 5);
  assert.equal(state.players.length, 4);
  assert.equal(state.alliance.supporters.length, 3);
  assert.equal(state.vagabond.items.length, 4);
  assert.equal(state.questDeck.length + state.quests.length, 15);
  assert.equal(state.deck.length + state.players.reduce((sum, p) => sum+p.hand.length, 0) + state.alliance.supporters.length, 54);
  assert.equal(rules.projectGame(state, 'cat').alliance.supporters, undefined);
  assert.equal(rules.projectGame(state, 'alliance').alliance.supporters.length, 3);
  assert.equal(rules.projectGame(state, 'cat').vagabond.ruinItems, undefined);
  assert.equal(rules.projectGame(state, 'cat').questDeck, undefined);
});

test('standard setup supports faction mixes without either militant faction',()=>{
  for(const factions of [['cat','alliance','vagabond'],['bird','alliance','vagabond'],['alliance','vagabond'],['cat','alliance']]){
    let state=rules.createGame(factions.map(faction=>({userId:faction,name:faction,faction})),()=>0);
    while(!state.setup.complete){
      const choice=state.effects.frames[0];
      state=act(state,choice.playerId,{type:'choice',choiceId:choice.id,optionId:choice.options[0].id});
    }
    for(const faction of factions)assert.doesNotThrow(()=>rules.projectGame(state,faction));
    assert.equal(state.players.length,factions.length);
  }
});

test('multiplayer rule counts all warriors and buildings; bird wins ties; pawn does not rule', () => {
  const clearing = { warriors: { cat: 2, bird: 2, alliance: 3 }, buildings: [], vagabond: true };
  assert.equal(rules.ruler(clearing), 'alliance');
  clearing.buildings.push({ faction: 'bird', type: 'roost' });
  assert.equal(rules.ruler(clearing), 'bird');
  clearing.warriors = { cat: 0, bird: 0, alliance: 0 }; clearing.buildings = [];
  assert.equal(rules.ruler(clearing), null);
});

test('sympathy costs, adjacency, martial law and first-token zero score', () => {
  let state = current(setup(), 'alliance', 'spread');
  state.alliance.supporters = [card('fox-1'), card('fox-2'), card('mouse-1', 'mouse')];
  const target = state.board.find(c => c.suit === 'fox' && !c.keep);
  target.warriors.bird = 3;
  assert.throws(() => act(state, 'alliance', { type: 'spread', clearing: target.id, cards: ['fox-1'] }));
  state = act(state, 'alliance', { type: 'spread', clearing: target.id });
  assert.equal(state.alliance.supporters.length, 1);
  assert.equal(player(state, 'alliance').score, 0);
  assert.equal(state.board[target.id].sympathy, true);
  assert.throws(() => act(state, 'alliance', { type: 'spread', clearing: state.setup.catCorner }));
  const distant = state.board.find(c => !target.links.includes(c.id) && c.id !== target.id && !c.keep);
  assert.throws(() => act(state, 'alliance', { type: 'spread', clearing: distant.id }));
});

test('supporter capacity, mobilize, training and officer supply', () => {
  let state = current(setup(), 'alliance', 'daylight');
  state.alliance.supporters = Array.from({ length: 5 }, (_, i) => card('support-'+i));
  const owner = player(state, 'alliance'); owner.hand.push(card('mobilized'));
  state = act(state, 'alliance', { type: 'mobilize', card: 'mobilized' });
  assert.equal(state.alliance.supporters.length, 5);
  assert.ok(state.discard.some(card => card.id === 'mobilized'));
  state.board[1].buildings.push({ faction: 'alliance', type: 'base-rabbit' });
  player(state, 'alliance').hand.push(card('training', 'rabbit'));
  state = act(state, 'alliance', { type: 'train', card: 'training' });
  assert.equal(state.alliance.officers, 1);
});

test('revolt removes all enemies before base placement, including full building slots and Vagabond damage', () => {
  let state = current(setup(), 'alliance', 'revolt');
  const clearing = state.board[6];
  clearing.keep = false; clearing.sympathy = true; clearing.warriors = { cat: 2, bird: 2, alliance: 0 };
  clearing.buildings = [{ faction: 'cat', type: 'workshop' }, { faction: 'bird', type: 'roost' }];
  state.vagabond.position = clearing.id;
  state.alliance.supporters = [card('s1', clearing.suit), card('s2', clearing.suit)];
  state = resolve(act(state, 'alliance', { type: 'revolt', clearing: clearing.id }));
  assert.equal(state.board[6].warriors.cat, 0);
  assert.equal(state.board[6].warriors.bird, 0);
  assert.ok(state.board[6].buildings.some(building => building.type === 'base-'+clearing.suit));
  assert.equal(state.alliance.officers, 1);
  assert.equal(state.vagabond.position, 6);
  assert.equal(state.vagabond.items.filter(item => item.damaged).length, 3);
  assert.equal(player(state, 'alliance').score, 2);
});

test('outrage is a private mandatory choice on warrior movement, but not pawn-only movement', () => {
  let state = current(setup(), 'cat', 'daylight');
  state.board[3].sympathy = true; state.board[0].warriors.cat = 3;
  player(state, 'cat').hand = [card('outrage-payment', state.board[3].suit)];
  state = act(state, 'cat', { type: 'move', from: 0, to: 3, count: 1 });
  assert.equal(state.effects.frames[0].kind, 'outrage');
  assert.equal(rules.projectGame(state, 'bird').choice.options, undefined);
  state = resolve(state);
  assert.ok(state.alliance.supporters.some(card => card.id === 'outrage-payment'));
  current(state, 'vagabond', 'daylight'); state.vagabond.position = 0;
  state = act(state, 'vagabond', { type: 'move', to: 3 });
  assert.equal(state.effects.frames.length, 0);
});

test('no-match outrage reveals only to Alliance and draws a supporter', () => {
  let state = current(setup(), 'cat', 'daylight');
  state.board[3].sympathy = true;
  player(state, 'cat').hand = [card('private-fox', 'fox')];
  state = act(state, 'cat', { type: 'move', from: 0, to: 3, count: 1 });
  assert.equal(rules.projectGame(state, 'alliance').outrageReveal.cards[0].id, 'private-fox');
  assert.equal(rules.projectGame(state, 'bird').outrageReveal, undefined);
});

test('Alliance guerrilla defense exchanges the rolled hits', () => {
  let state = current(setup(), 'cat', 'daylight');
  state.board[3].warriors = { cat: 3, bird: 0, alliance: 3 };
  player(state, 'alliance').hand = [];
  state = act(state, 'cat', { type: 'battle', clearing: 3, defender: 'alliance' });
  const choice = state.effects.frames[0];
  let index = 0;
  state = act(state, 'alliance', { type: 'choice', choiceId: choice.id, optionId: 'pass' }, () => [3, 0][index++]);
  assert.equal(state.board[3].warriors.alliance, 3);
  assert.equal(state.board[3].warriors.cat, 0);
});

test('military operations consume officers count and organize returns a warrior', () => {
  let state = current(setup(), 'alliance', 'military');
  state.alliance.officers = 2; state.alliance.operations = 1;
  state.board[2].warriors.alliance = 1;
  state = act(state, 'alliance', { type: 'organize', clearing: 2 });
  assert.equal(state.board[2].sympathy, true);
  assert.equal(state.board[2].warriors.alliance, 0);
  assert.equal(state.alliance.operations, 0);
  assert.throws(() => act(state, 'alliance', { type: 'organize', clearing: 3 }));
});

test('losing a base removes matching supporters and half officers rounded up', () => {
  let state = current(setup('ranger'), 'vagabond', 'daylight');
  state.vagabond.position = 3;
  state.board[3].warriors = { cat: 0, bird: 0, alliance: 0 };
  state.board[3].buildings = [{ faction: 'alliance', type: 'base-rabbit' }];
  state.alliance.officers = 5;
  state.alliance.supporters = [card('rabbit', 'rabbit'), card('wild', 'wild'), card('fox', 'fox')];
  state = resolve(act(state, 'vagabond', { type: 'strike', target: 'alliance', piece: 'base-rabbit' }));
  assert.equal(state.alliance.officers, 2);
  assert.deepEqual(state.alliance.supporters.map(card => card.id), ['fox']);
});

test('refresh budget uses tea at the start, slip is free, and forests allow resting', () => {
  let state = setup();
  state.vagabond.items.forEach(item => { item.exhausted = true; });
  current(state, 'vagabond', 'refresh'); state.vagabond.refreshLeft = 3;
  const tea = state.vagabond.items.find(item => item.type === 'tea');
  state = act(state, 'vagabond', { type: 'refresh', item: tea.id });
  assert.equal(state.vagabond.refreshLeft, 2);
  state = act(state, 'vagabond', { type: 'refresh-done' });
  const exhausted = state.vagabond.items.filter(item => item.exhausted).length;
  state = act(state, 'vagabond', { type: 'slip', to: 0 });
  assert.equal(state.vagabond.items.filter(item => item.exhausted).length, exhausted);
  current(state, 'vagabond', 'daylight'); state.vagabond.position = 12;
  state.vagabond.items[0].damaged = true;
  state = resolve(act(state, 'vagabond', { type: 'end' }));
  assert.ok(state.vagabond.items.every(item => !item.exhausted && !item.damaged));
});

test('hostile destinations require another boot and cannot be entered without payment', () => {
  let state = current(setup(), 'vagabond', 'daylight');
  state.vagabond.position = 0; state.vagabond.relations.cat = -1;
  const before = structuredClone(state);
  assert.throws(() => act(state, 'vagabond', { type: 'move', to: 3 }));
  assert.deepEqual(state, before);
  state.vagabond.items.push(item('boot-2', 'boot'));
  state = act(state, 'vagabond', { type: 'move', to: 3 });
  assert.equal(state.vagabond.items.filter(item => item.type === 'boot' && item.exhausted).length, 2);
});

test('exploration takes the hidden original ruin item, scores and frees the building slot', () => {
  let state = current(setup(), 'vagabond', 'daylight'); state.vagabond.position = 3;
  const reward = state.vagabond.ruinItems[3];
  state = act(state, 'vagabond', { type: 'explore' });
  assert.equal(state.board[3].ruins, 0);
  assert.ok(state.vagabond.items.some(item => item.source === 'ruin' && item.type === reward));
  assert.equal(player(state, 'vagabond').score, 1);
  assert.throws(() => act(state, 'vagabond', { type: 'explore' }));
});

test('quests require two distinct items and offer either matching-quest score or cards', () => {
  let state = current(setup(), 'vagabond', 'daylight'); state.vagabond.position = 0;
  state.quests = [{ id: 'two-boots', name: '护送', suit: 'fox', items: ['boot', 'boot'] }];
  assert.throws(() => act(state, 'vagabond', { type: 'quest', quest: 'two-boots', reward: 'points' }));
  state.vagabond.items.push(item('other-boot', 'boot'));
  state = act(state, 'vagabond', { type: 'quest', quest: 'two-boots', reward: 'points' });
  assert.equal(state.vagabond.completedQuests.length, 1);
  assert.equal(player(state, 'vagabond').score, 1);
  assert.equal(state.vagabond.items.filter(item => item.type === 'boot' && item.exhausted).length, 2);
});

test('aid improves relationships with per-turn thresholds and can take crafted items', () => {
  let state = current(setup(), 'vagabond', 'daylight'); state.vagabond.position = 0;
  player(state, 'cat').items = ['hammer'];
  player(state, 'vagabond').hand = [card('aid-1'), card('aid-2'), card('aid-3')];
  for (let index = 1; index <= 3; index++) {
    const available = state.vagabond.items.find(item => !item.exhausted && !item.damaged);
    state = act(state, 'vagabond', { type: 'aid', target: 'cat', card: 'aid-'+index, item: available.id, ...(index === 1 ? { takeItem: 0 } : {}) });
  }
  assert.equal(state.vagabond.relations.cat, 2);
  assert.equal(player(state, 'vagabond').score, 3);
  assert.equal(player(state, 'cat').items.length, 0);
  assert.ok(state.vagabond.items.some(item => item.source === 'aid' && item.type === 'hammer'));
});

test('Vagabond battle hostility excludes the first warrior from Infamy', () => {
  let state = current(setup(), 'vagabond', 'daylight'); state.vagabond.position = 3;
  state.board[3].warriors = { cat: 3, bird: 0, alliance: 0 };
  player(state, 'cat').hand = [];
  state.vagabond.items.push(item('sword-2', 'sword'), item('sword-3', 'sword'));
  state = act(state, 'vagabond', { type: 'battle', defender: 'cat' });
  const choice = state.effects.frames[0]; let index = 0;
  state = act(state, 'cat', { type: 'choice', choiceId: choice.id, optionId: 'pass' }, () => [3, 0][index++]);
  assert.equal(player(state, 'vagabond').score, 2);
  assert.equal(state.vagabond.relations.cat, -1);
});

test('item damage is chosen, persisted and never removes the Vagabond pawn', () => {
  let state = current(setup(), 'cat', 'daylight'); state.vagabond.position = 3;
  state.board[3].warriors.cat = 3; player(state, 'vagabond').hand = [];
  state = act(state, 'cat', { type: 'battle', clearing: 3, defender: 'vagabond' });
  const choice = state.effects.frames[0]; let index = 0;
  state = act(state, 'vagabond', { type: 'choice', choiceId: choice.id, optionId: 'pass' }, () => [3, 0][index++]);
  assert.equal(state.effects.frames[0].kind, 'vagabond-damage');
  assert.deepEqual(JSON.parse(JSON.stringify(state)).effects, state.effects);
  state = resolve(state);
  assert.equal(state.vagabond.items.filter(item => item.damaged).length, 3);
  assert.equal(state.vagabond.position, 3);
});

test('coalition needs four players and a lowest-scoring target', () => {
  let state = current(setup(), 'vagabond', 'daylight');
  player(state, 'vagabond').score = 10;
  player(state, 'cat').score = 2; player(state, 'bird').score = 4; player(state, 'alliance').score = 3;
  player(state, 'vagabond').hand.push({ id: 'coalition-card', name: '统治', kind: 'dominance', suit: 'wild' });
  assert.throws(() => act(state, 'vagabond', { type: 'dominance', card: 'coalition-card', target: 'bird' }));
  state = act(state, 'vagabond', { type: 'dominance', card: 'coalition-card', target: 'cat' });
  assert.equal(player(state, 'vagabond').coalition, 'cat');
  current(state, 'cat', 'daylight'); player(state, 'cat').score = 29;
  state.board[3].warriors = { cat: 3, bird: 0, alliance: 0 };
  state.board[3].buildings = [{ faction: 'bird', type: 'roost' }];
  player(state, 'bird').hand = [];
  state = resolve(act(state, 'cat', { type: 'battle', clearing: 3, defender: 'bird' }));
  assert.deepEqual(new Set(state.winners), new Set(['cat', 'vagabond']));
});

test('forced Allied movement uses Allied rule and the moving faction pays outrage', () => {
  let state = current(setup(), 'vagabond', 'daylight');
  state.vagabond.position = 0; state.vagabond.relations.cat = 3;
  state.board[0].warriors.cat = 3; state.board[3].sympathy = true;
  player(state, 'cat').hand = [card('ally-payment',state.board[3].suit)];
  state = act(state,'vagabond',{type:'move',to:3,ally:'cat',count:1});
  assert.equal(state.effects.frames[0].playerId,'cat');
  assert.equal(state.effects.frames[0].kind,'outrage');
});

test('Slip can carry Allied warriors without boots and resolves outrage before Daylight',()=>{
  let state=current(setup(),'vagabond','slip');
  state.vagabond.position=0;state.vagabond.relations.cat=3;
  state.board[0].warriors.cat=3;state.board[3].sympathy=true;
  player(state,'cat').hand=[card('slip-payment',state.board[3].suit)];
  state.vagabond.items.filter(item=>item.type==='boot').forEach(item=>{item.exhausted=true;});
  state=act(state,'vagabond',{type:'slip',to:3,ally:'cat',count:1});
  assert.equal(state.phase,'daylight-start');
  assert.equal(state.effects.frames[0].kind,'outrage');
  state=resolve(state);
  assert.equal(state.phase,'daylight');
  assert.equal(state.vagabond.items.find(item=>item.type==='boot').exhausted,true);
});

test('Allied cat casualties are one hospital batch and excess ally losses make them hostile',()=>{
  let state=current(setup(),'vagabond','daylight');state.vagabond.position=3;
  state.vagabond.relations.cat=3;state.board[3].warriors={cat:3,bird:3,alliance:0};
  player(state,'bird').hand=[];
  state=act(state,'vagabond',{type:'battle',defender:'bird'});
  let choice=state.effects.frames[0];
  assert.equal(choice.kind,'battle-ally');
  state=act(state,'vagabond',{type:'choice',choiceId:choice.id,optionId:'cat'});
  choice=state.effects.frames[0];
  state=act(state,'bird',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);
  for(let i=0;i<3;i++){
    choice=state.effects.frames[0];
    assert.equal(choice.kind,'vagabond-damage');
    state=act(state,'vagabond',{type:'choice',choiceId:choice.id,optionId:'ally'});
  }
  choice=state.effects.frames[0];assert.equal(choice.kind,'hospital');assert.equal(choice.resume.count,3);
  state=resolve(state);
  assert.equal(state.vagabond.relations.cat,-1);
});

test('Vagabond can craft with distinct hammers and current clearing suit', () => {
  let state = current(setup('tinker'),'vagabond','daylight');
  state.vagabond.position = 0;
  const recipe=state.deck.find(card=>card.archetype==='AnvilFox');
  if(!recipe){
    const source=state.players.find(p=>p.hand.some(card=>card.archetype==='AnvilFox'));
    const index=source.hand.findIndex(card=>card.archetype==='AnvilFox');
    player(state,'vagabond').hand.push(source.hand.splice(index,1)[0]);
  }else{
    state.deck.splice(state.deck.indexOf(recipe),1);player(state,'vagabond').hand.push(recipe);
  }
  const cardToCraft=player(state,'vagabond').hand.find(card=>card.archetype==='AnvilFox');
  state=act(state,'vagabond',{type:'craft',card:cardToCraft.id});
  assert.equal(state.vagabond.items.filter(item=>item.type==='hammer').length,2);
  assert.equal(state.vagabond.items.filter(item=>item.type==='hammer'&&item.exhausted).length,1);
  assert.equal(state.itemSupply.hammer,0);
});

test('Tinker retrieves matching discards and Ranger repairs while ending Daylight', () => {
  let state=current(setup('tinker'),'vagabond','daylight');state.vagabond.position=0;
  state.discard.push(card('retrieved','wild'));
  state=act(state,'vagabond',{type:'special',card:'retrieved'});
  assert.ok(player(state,'vagabond').hand.some(card=>card.id==='retrieved'));
  state=current(setup('ranger'),'vagabond','daylight');
  state.vagabond.items.filter(item=>item.type!=='torch').forEach(item=>{item.damaged=true;item.exhausted=true;});
  state.vagabond.position=0;
  state=resolve(act(state,'vagabond',{type:'special'}));
  assert.equal(state.vagabond.items.filter(item=>item.damaged).length,0);
  assert.notEqual(state.players[state.turn].faction,'vagabond');
  assert.ok(state.vagabond.items.some(item=>item.exhausted));
});

test('Vagabond capacity excludes ready track items and requires dropping satchel items', () => {
  let state=current(setup(),'vagabond','daylight');state.vagabond.position=0;
  for(let i=0;i<5;i++)state.vagabond.items.push(item('extra-'+i,'boot'));
  state=act(state,'vagabond',{type:'end'});
  state=resolve(state);
  assert.equal(state.phase,'capacity');
  const tea=state.vagabond.items.find(item=>item.type==='tea');
  assert.throws(()=>act(state,'vagabond',{type:'drop-item',item:tea.id}));
  while(state.phase==='capacity')state=act(state,'vagabond',{type:'drop-item',item:state.vagabond.items.find(item=>!item.track).id});
  assert.equal(state.vagabond.removedItems.length,2);
});

test('dominance is checked at the start of its owner turn', () => {
  let state=setup();
  const bird=player(state,'bird');bird.dominance={id:'active-dom',kind:'dominance',suit:'rabbit'};
  state.board.filter(c=>c.suit==='rabbit').slice(0,3).forEach(c=>{c.warriors={cat:0,bird:3,alliance:0};c.buildings=[];});
  state.turn=(state.players.indexOf(bird)+state.players.length-1)%state.players.length;
  state.phase='discard';state.effects.frames=[];
  const previous=state.players[state.turn];previous.hand=Array.from({length:6},(_,i)=>card('discard-'+i));
  state=act(state,previous.id,{type:'discard',card:'discard-0'});
  assert.equal(state.winner,bird.id);
});


test('map action projection contains only executable cat and Eyrie actions for the owner',()=>{
  for(const faction of ['cat','bird']){
    const state=current(setup(),faction,faction==='cat'?'daylight':'decree');
    state.actions=3;state.march=0;
    state.board.find(c=>c.keep).wood=2;
    if(faction==='bird')state.bird.remaining=structuredClone(state.bird.decree);
    const before=JSON.stringify(state);
    const view=rules.projectGame(state,faction);
    assert.ok(view.mapActions.length>0);
    for(const action of view.mapActions)assert.doesNotThrow(()=>rules.applyAction(state,faction,action,()=>0),JSON.stringify(action));
    assert.equal(JSON.stringify(state),before);
    const observer=state.players.find(p=>p.id!==faction);
    assert.deepEqual(rules.projectGame(state,observer.id).mapActions,[]);
  }
});


test('no-match outrage draws exactly one top card, including empty hand and reshuffled discard',()=>{
  for(const reshuffle of [false,true]){
    let state=current(setup(),'cat','daylight');
    state.board[3].sympathy=true;player(state,'cat').hand=[];
    state.alliance.supporters=[];
    state.deck=reshuffle?[]:[card('compensation','mouse')];
    state.discard=reshuffle?[card('compensation','mouse')]:[];
    state=act(state,'cat',{type:'move',from:0,to:3,count:1});
    assert.equal(state.alliance.supporters.length,1);
    assert.equal(state.alliance.supporters[0].id,'compensation');
    assert.match(state.log.join('\n'),/从牌堆抽取 1 张/);
    assert.equal(rules.projectGame(state,'bird').alliance.supporters,undefined);
  }
});

test('outrage compensation is drawn and discarded at the no-base supporter cap',()=>{
  let state=current(setup(),'cat','daylight');
  state.board[3].sympathy=true;player(state,'cat').hand=[];
  state.alliance.supporters=Array.from({length:5},(_,i)=>card('support-'+i));
  state.deck=[card('overflow')];state.discard=[];
  state=act(state,'cat',{type:'move',from:0,to:3,count:1});
  assert.equal(state.alliance.supporters.length,5);
  assert.ok([...state.discard,...state.deck].some(c=>c.id==='overflow'));
  assert.match(state.log.join('\n'),/支持者已达5张/);
});

test('a built Alliance base allows outrage compensation beyond five supporters',()=>{
  for(const suit of ['fox','rabbit','mouse']){
    let state=current(setup(),'cat','daylight');
    state.board[3].sympathy=true;
    state.board[5].buildings.push({faction:'alliance',type:'base-'+suit});
    player(state,'cat').hand=[];
    state.alliance.supporters=Array.from({length:5},(_,index)=>card('existing-'+index));
    state.deck=[card('base-compensation','mouse')];state.discard=[];
    const hand=player(state,'alliance').hand.map(card=>card.id);
    state=act(state,'cat',{type:'move',from:0,to:3,count:1});
    assert.equal(state.alliance.supporters.length,6);
    assert.equal(state.alliance.supporters.at(-1).id,'base-compensation');
    assert.deepEqual(player(state,'alliance').hand.map(card=>card.id),hand);
    assert.equal(rules.projectGame(state,'alliance').alliance.supporterCount,6);
    assert.ok(rules.projectGame(state,'alliance').alliance.supporters.some(card=>card.id==='base-compensation'));
    assert.equal(rules.projectGame(state,'bird').alliance.supporters,undefined);
    assert.match(state.log.at(-1),/已加入支持者/);
  }
});

test('mandatory cardboard removals auto-resolve one type and all remaining types',()=>{
  for(const buildings of [[{faction:'bird',type:'roost'}],[{faction:'cat',type:'workshop'},{faction:'cat',type:'recruiter'}]]){
    const defender=buildings[0].faction;
    const attacker=defender==='bird'?'cat':'bird';
    let state=current(setup(),attacker,attacker==='cat'?'daylight':'decree');
    const c=state.board[3];c.keep=false;c.sympathy=false;c.wood=0;c.buildings=buildings;c.warriors={cat:0,bird:0,alliance:0};c.warriors[attacker]=3;
    player(state,defender).hand=[];
    if(attacker==='bird'){state.bird.leader='builder';state.bird.remaining={battle:[card('battle','wild')]};}
    state=act(state,attacker,{type:'battle',clearing:3,defender,...(attacker==='bird'?{decreeCard:'battle'}:{})});
    const choice=state.effects.frames[0];
    state=act(state,defender,{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);
    assert.equal(state.board[3].buildings.length,0);
    assert.notEqual(state.effects.frames[0]?.kind,'cardboard');
  }
});

test('partial cardboard damage still allows a meaningful defender choice',()=>{
  let state=current(setup(),'bird','decree');
  state.bird.leader='builder';state.bird.remaining={battle:[card('battle','wild')]};
  const c=state.board[3];c.keep=false;c.sympathy=false;c.wood=1;c.buildings=[{faction:'cat',type:'workshop'},{faction:'cat',type:'recruiter'}];c.warriors={cat:0,bird:1,alliance:0};player(state,'cat').hand=[];
  state=act(state,'bird',{type:'battle',clearing:3,defender:'cat',decreeCard:'battle'});
  const choice=state.effects.frames[0];state=act(state,'cat',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>0);
  assert.equal(state.effects.frames[0].kind,'cardboard');assert.equal(state.effects.frames[0].options.length,3);
});

test('battle logs show capped dice, defenseless bonus and final hits',()=>{
  let state=current(setup(),'cat','daylight');const c=state.board[3];
  c.warriors={cat:1,bird:0,alliance:0};c.buildings=[{faction:'bird',type:'roost'}];player(state,'bird').hand=[];
  state=act(state,'cat',{type:'battle',clearing:3,defender:'bird'});const choice=state.effects.frames[0];
  state=act(state,'bird',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);
  assert.match(state.log.join('\n'),/攻击方战力上限 1/);assert.match(state.log.join('\n'),/无人防守/);assert.match(state.log.join('\n'),/骰子命中 1.*额外 1 = 2/);
});

test('mobilize logs reveal quantity without supporter name or suit',()=>{
  let state=current(setup(),'alliance','daylight');state.alliance.supporters=[];
  player(state,'alliance').hand=[card('private-mobilization-name','rabbit')];const before=state.log.length;
  state=act(state,'alliance',{type:'mobilize',card:'private-mobilization-name'});
  const publicLog=rules.projectGame(state,'bird').log.slice(before).join('\n');assert.match(publicLog,/动员 1 张/);assert.ok(!publicLog.includes('private-mobilization-name'));assert.ok(!publicLog.includes('兔子'));
});

test('projected control matches rule and movement rejects uncontrolled endpoints',()=>{
  let state=current(setup(),'cat','daylight');
  for(const id of [0,3]){const c=state.board[id];c.buildings=[];c.warriors={cat:0,bird:0,alliance:0};}
  state.board[0].warriors={cat:1,bird:1,alliance:0};
  assert.equal(rules.projectGame(state,'cat').board[0].ruler,'bird');
  assert.throws(()=>act(state,'cat',{type:'move',from:0,to:3,count:1}),/统治/);
  state.board[3].warriors.cat=1;
  state=act(state,'cat',{type:'move',from:0,to:3,count:1});assert.equal(state.board[3].warriors.cat,2);
});


test('repeated identical tokens are removed automatically when damage is partial',()=>{
  let state=current(setup(),'bird','decree');state.bird.leader='builder';state.bird.remaining={battle:[card('battle','wild')]};
  const c=state.board[3];c.keep=false;c.sympathy=false;c.wood=3;c.buildings=[];c.warriors={cat:0,bird:1,alliance:0};player(state,'cat').hand=[];
  state=act(state,'bird',{type:'battle',clearing:3,defender:'cat',decreeCard:'battle'});
  const choice=state.effects.frames[0];state=act(state,'cat',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>1);
  assert.equal(state.board[3].wood,1);assert.notEqual(state.effects.frames[0]?.kind,'cardboard');
});

test('all remaining Vagabond items take unavoidable damage without a choice',()=>{
  let state=current(setup(),'bird','decree');state.bird.leader='builder';state.bird.remaining={battle:[card('battle','wild')]};
  state.vagabond.position=3;state.vagabond.items=[item('one','boot'),item('two','torch')];player(state,'vagabond').hand=[];
  state.board[3].warriors={cat:0,bird:3,alliance:0};
  state=act(state,'bird',{type:'battle',clearing:3,defender:'vagabond',decreeCard:'battle'});
  const choice=state.effects.frames[0];state=act(state,'vagabond',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);
  assert.ok(state.vagabond.items.every(item=>item.damaged));assert.notEqual(state.effects.frames[0]?.kind,'vagabond-damage');
});

test('cat construction logs building and clearing and turmoil logs the failed decree',()=>{
  let state=current(setup(),'cat','daylight');const c=state.board[3];c.warriors.cat=1;c.buildings=[];c.ruins=0;
  for(const area of state.board)area.buildings=area.buildings.filter(building=>building.type!=='workshop');
  state=act(state,'cat',{type:'build',clearing:3,building:'workshop',wood:[]});
  assert.ok(state.log.some(line=>line.includes(c.name)&&line.includes('建造工坊')));
  current(state,'bird','craft');
  for(const area of state.board){area.warriors.bird=0;area.buildings=area.buildings.filter(building=>building.faction!=='bird');}
  state.bird.decree={recruit:[],move:[],battle:[],build:[card('impossible','fox')]};
  state=act(state,'bird',{type:'craft-done'});
  assert.ok(state.log.some(line=>line.includes('无法执行建造法令（狐狸）')));
});


test('base loss discards every matching and bird supporter but preserves other suits',()=>{
  let state=current(setup(),'cat','daylight');const c=state.board[3];
  c.keep=false;c.sympathy=false;c.buildings=[{faction:'alliance',type:'base-rabbit'}];c.warriors={cat:3,bird:0,alliance:0};
  player(state,'alliance').hand=[];state.alliance.officers=3;
  state.alliance.supporters=[card('rabbit-one','rabbit'),card('rabbit-two','rabbit'),card('bird-one','wild'),card('bird-two','wild'),card('fox-stays','fox'),card('mouse-stays','mouse')];
  state=act(state,'cat',{type:'battle',clearing:3,defender:'alliance'});const choice=state.effects.frames[0];
  state=act(state,'alliance',{type:'choice',choiceId:choice.id,optionId:'pass'},()=>3);
  assert.deepEqual(state.alliance.supporters.map(card=>card.id),['fox-stays','mouse-stays']);assert.equal(state.alliance.officers,1);
  assert.ok(state.log.some(line=>line.includes('弃置 4 张对应花色及飞鸟支持者')));
});

test('scoring emits public reasons and sequence IDs when loading older saves',()=>{
  let state=current(setup(),'cat','daylight');state.actions=3;state.board[0].wood=8;
  delete state.scoreEvents;delete state.scoreEventSeq;
  const action=rules.projectGame(state,'cat').mapActions.find(action=>action.type==='build'&&action.building==='sawmill');
  assert.ok(action);
  const before=player(state,'cat').score;
  state=act(state,'cat',action);
  const event=state.scoreEvents.at(-1);
  assert.equal(event.reason,'建造锯木厂');assert.equal(event.delta,1);
  assert.equal(event.total,before+1);assert.equal(event.playerId,'cat');assert.equal(event.seq,1);
  assert.deepEqual(rules.projectGame(state,'alliance').scoreEvents.at(-1),event);
  const tracks=rules.projectGame(state,'cat').factionScoreTracks;
  assert.deepEqual(tracks.bird,[0,0,1,2,3,4,4,5]);assert.equal(tracks.alliance.length,10);
});

test('three roosts announce the actual two point evening income',()=>{
  let state=current(setup(),'bird','decree');
  state.bird.remaining={recruit:[],move:[],battle:[],build:[]};
  for(const area of state.board)area.buildings=area.buildings.filter(building=>building.type!=='roost');
  for(const area of state.board.filter(area=>!area.keep&&area.slots-area.ruins-area.buildings.length>0).slice(0,3))area.buildings.push({type:'roost',faction:'bird'});
  state=act(state,'bird',{type:'end'});
  assert.ok(state.scoreEvents.some(event=>event.faction==='bird'&&event.reason==='3个鸟巢'&&event.delta===2));
});
