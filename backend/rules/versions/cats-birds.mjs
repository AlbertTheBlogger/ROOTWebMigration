// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RuleError, ruler, shuffle, LABELS } from '../../engine.mjs';
import { createQueue, enqueue, takeEffect, resolveChoice, projectChoice } from '../effects/queue.mjs';

export const RULESET = 'root-cats-birds-v4';
export const LIMITATIONS = ['秋季地图、基础牌组与猫鹰双人标准开局。两人按规则移除四张统治牌。', '采用 2025-10-13 官方规则基准，扩展阵营、扩展牌组与进阶开局后续接入。'];
const catalog = JSON.parse(readFileSync(new URL('../../data/full-card-catalog.json', import.meta.url), 'utf8'));
const definitions = new Map(catalog.cards.map(card => [card.type, card]));
const map = JSON.parse(readFileSync(new URL('../../data/fall-map.json', import.meta.url), 'utf8'));
const positions = [[95,85],[350,65],[610,85],[330,200],[80,310],[290,350],[490,385],[645,290],[610,590],[420,560],[250,610],[75,555]];
const columns = ['recruit','move','battle','build'];
const leaders = { despot:['move','build'], commander:['move','battle'], charismatic:['recruit','battle'], builder:['recruit','move'] };
const leaderNames = {despot:'暴君',commander:'指挥官',charismatic:'魅力领袖',builder:'建造者'};
const buildingCost = [0,1,2,3,3,4];
const buildingScore = { sawmill:[0,1,2,3,4,5], workshop:[0,2,2,3,4,5], recruiter:[0,1,2,3,3,4] };
const ensure = (ok, message) => { if (!ok) throw new RuleError(message); };
const ownerOf = (s, faction) => s.players.find(p => p.faction === faction);
const current = s => s.players[s.turn];
const enemyOf = faction => faction === 'cat' ? 'bird' : 'cat';
const areaOf = (s, id) => { const area=s.board.find(c => c.id===id); ensure(area,'林地不存在'); return area; };
const matches = (card, suit) => card.suit==='wild' || card.suit===suit;
const buildingCount = (s, faction, type) => s.board.reduce((sum,c) => sum+c.buildings.filter(b => b.faction===faction && b.type===type).length,0);
const reserve = (s, faction) => (faction==='cat'?25:20)-s.board.reduce((sum,c) => sum+c.warriors[faction],0);
const woodCount = s => s.board.reduce((sum,c) => sum+c.wood,0);
const freeSlots = c => c.slots-c.ruins-c.buildings.length;
const hasEnemy = (c,f) => c.warriors[enemyOf(f)]>0 || c.buildings.some(b => b.faction===enemyOf(f)) || (f==='bird' && (c.keep || c.wood>0));
const crafted = (p, kind) => p.crafted.find(c => c.kind===kind);
const frame = (kind,data={}) => ({ type:'effect',kind,data });
function front(s, frames) { s.effects=enqueue(s.effects,frames,{front:true}); }
function record(s,text) { s.log.push(text); if (s.log.length>200) s.log.shift(); }
function draw(s,p,count,rng) {
  for (let i=0;i<count;i++) {
    if (!s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
    if (s.deck.length) p.hand.push(s.deck.pop());
    if (!s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
  }
}
function score(s, faction, points) {
  const owner=ownerOf(s,faction);
  owner.score=Math.max(0,owner.score+points);
  if (owner.score>=30 && !s.winner) { s.winner=owner.id; s.phase='finished'; record(s,`${owner.name} 达到 30 分，获胜`); }
}
function discard(s,p,cardId) {
  const index=p.hand.findIndex(card => card.id===cardId);
  ensure(index>=0,'这张牌不在手中');
  const [card]=p.hand.splice(index,1); s.discard.push(card); return card;
}
function discardCrafted(s,p,cardId) {
  const index=p.crafted.findIndex(card => card.id===cardId);
  ensure(index>=0,'持续牌已经失效');
  const [card]=p.crafted.splice(index,1); s.discard.push(card); return card;
}
function ask(s,kind,p,prompt,options,resume={}) {
  ensure(options.length>0,'选择没有合法选项');
  front(s,[{ type:'choice',kind,playerId:p.id,prompt,options,resume }]);
}
const pass = label => ({ id:'pass',label,value:null });
function leader(s,name) {
  ensure(Object.hasOwn(leaders,name),'领袖无效');
  s.bird.leader=name;
  s.bird.decree=Object.fromEntries(columns.map(c => [c,[]]));
  leaders[name].forEach((column,i) => s.bird.decree[column].push({ id:`vizier-${i}`,suit:'wild',vizier:true }));
}
function activeColumn(s) { return columns.find(col => s.bird.remaining[col]?.length); }
function connectedWood(s,destination) {
  const visited=new Set(),todo=[destination];
  while (todo.length) {
    const id=todo.pop(),c=areaOf(s,id);
    if (visited.has(id) || ruler(c)!=='cat') continue;
    visited.add(id); todo.push(...c.links);
  }
  return [...visited];
}
function moveOptions(s,faction) {
  return s.board.flatMap(from => from.warriors[faction]>0 ? from.links.flatMap(toId => {
    const to=areaOf(s,toId);
    if (ruler(from)!==faction && ruler(to)!==faction) return [];
    return Array.from({length:from.warriors[faction]},(_,i) => ({type:'move',from:from.id,to:toId,count:i+1}));
  }) : []);
}
function battleOptions(s,faction) { return s.board.filter(c => c.warriors[faction]>0 && hasEnemy(c,faction)).map(c => ({type:'battle',clearing:c.id})); }
function decreeOptions(s,column,card) {
  let options=[];
  if (column==='move') options=moveOptions(s,'bird');
  if (column==='battle') options=battleOptions(s,'bird');
  if (column==='recruit' && reserve(s,'bird')>=(s.bird.leader==='charismatic'?2:1)) options=s.board.filter(c => !c.keep && c.buildings.some(b => b.faction==='bird' && b.type==='roost')).map(c => ({type:'recruit',clearing:c.id}));
  if (column==='build' && buildingCount(s,'bird','roost')<7) options=s.board.filter(c => !c.keep && ruler(c)==='bird' && freeSlots(c)>0 && !c.buildings.some(b => b.type==='roost')).map(c => ({type:'build',clearing:c.id}));
  return options.filter(a => matches(card,areaOf(s,a.type==='move'?a.from:a.clearing).suit)).map(a => ({...a,decreeCard:card.id}));
}
function checkDecree(s) {
  if (s.winner || s.phase!=='decree' || s.combat || s.effects.frames.length) return;
  const column=activeColumn(s);
  if (!column || s.bird.remaining[column].some(card => decreeOptions(s,column,card).length)) return;
  const cards=Object.values(s.bird.decree).flat();
  score(s,'bird',-cards.filter(c => c.suit==='wild').length);
  s.discard.push(...cards.filter(c => !c.vizier));
  s.bird.decree=Object.fromEntries(columns.map(c => [c,[]]));
  s.bird.remaining={};
  s.bird.used.push(s.bird.leader);
  if (s.bird.used.length===4) s.bird.used=[];
  s.phase='leader';
  record(s,'政令无法完全执行，飞鹰王朝发生动乱');
}
function beginTurn(s,rng) {
  s.actions=3; s.march=0; s.recruited=false; s.craftingUsed=[]; s.usedEffects=[]; s.privateReveal=null;
  s.bird.added=0; s.bird.addedBird=false; s.phase='birdsong';
  record(s,`${current(s).name} 第 ${s.round} 轮开始`);
  if (crafted(current(s),'bank')) { draw(s,current(s),1,rng); draw(s,ownerOf(s,enemyOf(current(s).faction)),1,rng); }
}
function nextTurn(s,rng) { s.turn=1-s.turn; s.turnsCompleted++; s.round=1+Math.floor(s.turnsCompleted/2); beginTurn(s,rng); }
function daylight(s) { s.phase='daylight-start'; front(s,[frame('commandwarren'),frame('craft-phase')]); }
function evening(s) { s.phase='evening-start'; if(crafted(current(s),'cobbler')&&!s.usedEffects.includes(crafted(current(s),'cobbler').id))s.phase='evening';else front(s,[frame('evening-score')]); }
const eveningPhases=['evening','military','lizard-craft','discard','capacity','evening-end'];
function availableCobbler(s,p=current(s)) { return eveningPhases.includes(s.phase) && p.crafted.find(card=>card.kind==='cobbler'&&!s.usedEffects.includes(card.id)); }
function finishEvening(s,rng) { if(availableCobbler(s))s.phase='evening-end';else nextTurn(s,rng); }
function cobblerOptions(s,p) { return availableCobbler(s,p)?moveOptions(s,p.faction).map(action=>({category:'补鞋匠',label:`${action.from} → ${action.to} · ${action.count} 名`,action:{...action,cobbler:true}})):[]; }

function move(s,p,a) {
  const from=areaOf(s,a.from),to=areaOf(s,a.to);
  ensure(from.links.includes(to.id),'两片林地没有道路相连');
  ensure(ruler(from)===p.faction || ruler(to)===p.faction,'必须统治移动起点或终点');
  ensure(Number.isInteger(a.count) && a.count>0 && a.count<=from.warriors[p.faction],'士兵数量无效');
  from.warriors[p.faction]-=a.count; to.warriors[p.faction]+=a.count;
  record(s,`${p.name} 从${from.name}向${to.name}移动 ${a.count} 名士兵`);
}
function hospital(s,count,suit) {
  if (!count || !s.board.some(c => c.keep)) return;
  const p=ownerOf(s,'cat'),cards=p.hand.filter(card => matches(card,suit));
  ask(s,'hospital',p,`是否救回 ${count} 名猫士兵？`,[pass('不使用野战医院'),...cards.map(card => ({id:card.id,label:`花费${card.name}，救回 ${count} 名士兵`,value:card.id}))],{count,suit});
}
function cardboard(s,faction) {
  const c=areaOf(s,s.combat.clearing);
  return [...new Set(c.buildings.filter(b => b.faction===faction).map(b => b.type).concat(faction==='cat'?[...(c.keep?['keep']:[]),...(c.wood?['wood']:[])]:[]))];
}
function removeCardboard(s,faction,type,by) {
  const c=areaOf(s,s.combat.clearing);
  ensure(cardboard(s,faction).includes(type),'不能移除此棋子');
  if (type==='keep') c.keep=false;
  else if (type==='wood') c.wood--;
  else c.buildings.splice(c.buildings.findIndex(b => b.faction===faction && b.type===type),1);
  let points=1;
  if (by==='bird' && s.bird.leader==='despot' && !s.combat.despotScored) { points++; s.combat.despotScored=true; }
  score(s,by,points);
}
function damage(s,losses,ambush=false) {
  const c=areaOf(s,s.combat.clearing),frames=[];
  let cats=0;
  for (const loss of losses) {
    const n=Math.min(loss.hits,c.warriors[loss.faction]); c.warriors[loss.faction]-=n;
    if (loss.faction==='cat') cats+=n;
    if (loss.hits>n) frames.push(frame('cardboard',{...loss,hits:loss.hits-n}));
  }
  if (ambush && !c.warriors[s.combat.attacker]) s.combat.ended=true;
  if (cats) frames.push(frame('hospital',{count:cats,suit:c.suit}));
  front(s,frames);
}
function startBattle(s,p,c) {
  s.combat={id:`battle-${++s.battleSequence}`,attacker:p.faction,defender:enemyOf(p.faction),clearing:c.id,rolls:null,used:[],passed:[],extraAttacker:0,extraDefender:0,despotScored:false};
  front(s,[frame('ambush'),frame('roll'),frame('battle-window'),frame('battle-damage'),frame('battle-finish')]);
  record(s,`${p.name} 在${c.name}发起战斗`);
}
function battleEffects(s,faction) {
  const p=ownerOf(s,faction),b=s.combat;
  return p.crafted.filter(card => !b.used.includes(card.id) && (card.kind==='armorers' || (card.kind==='brutal' && faction===b.attacker) || (card.kind==='sappers' && faction===b.defender)));
}
function pump(s,rng) {
  while (!s.winner && s.effects.frames[0]?.type==='effect') {
    const taken=takeEffect(s.effects); s.effects=taken.queue;
    const {kind,data}=taken.effect;
    const p=current(s),b=s.combat;
    switch (kind) {
      case 'setup-build': {
        const type=['sawmill','workshop','recruiter'][s.setup.buildings];
        if (!type) {
          const corner=map.opposite_corners[s.setup.catCorner];
          s.setup.birdCorner=corner;
          const c=areaOf(s,corner); c.warriors.bird=6; c.buildings.push({faction:'bird',type:'roost'});
          ask(s,'setup-leader',ownerOf(s,'bird'),'选择飞鹰初始领袖',Object.keys(leaders).map(name => ({id:name,label:leaderNames[name],value:name})));
          break;
        }
        const home=areaOf(s,s.setup.catCorner),eligible=[home.id,...home.links];
        ask(s,'setup-building',ownerOf(s,'cat'),`放置初始${LABELS[type]}`,s.board.filter(c => eligible.includes(c.id) && freeSlots(c)>0).map(c => ({id:String(c.id),label:`${c.name} · ${LABELS[type]}`,value:c.id})),{type});
        break;
      }
      case 'start': s.setup.complete=true; beginTurn(s,rng); break;
      case 'commandwarren': {
        const options=battleOptions(s,p.faction);
        if (crafted(p,'commandwarren') && options.length) ask(s,'free-battle',p,'是否使用指挥所发动一次战斗？',[pass('跳过'),...options.map(a => ({id:String(a.clearing),label:`在${areaOf(s,a.clearing).name}战斗`,value:a}))]);
        break;
      }
      case 'craft-phase': s.phase='craft'; break;
      case 'cobbler': {
        const options=moveOptions(s,p.faction);
        if (crafted(p,'cobbler') && options.length) ask(s,'free-move',p,'是否使用鞋匠移动一次？',[pass('跳过'),...options.map(a => ({id:`${a.from}-${a.to}-${a.count}`,label:`${a.from} → ${a.to}，${a.count} 名士兵`,value:a}))]);
        break;
      }
      case 'evening-score': {
        if (p.faction==='bird') score(s,'bird',[0,0,1,2,3,4,4,5][buildingCount(s,'bird','roost')]);
        if (s.winner) break;
        const n=buildingCount(s,p.faction,p.faction==='cat'?'recruiter':'roost');
        draw(s,p,1+(n>=3?1:0)+(n>=(p.faction==='cat'?5:6)?1:0),rng);
        s.phase='discard';
        if (p.hand.length<=5) finishEvening(s,rng);
        break;
      }
      case 'hospital': hospital(s,data.count,data.suit); break;
      case 'draw': draw(s,ownerOf(s,data.faction),data.count,rng); break;
      case 'ambush-discard': s.discard.push(b.ambushCard); delete b.ambushCard; break;
      case 'ambush': {
        if (crafted(ownerOf(s,b.attacker),'scouting')) break;
        const defender=ownerOf(s,b.defender),suit=areaOf(s,b.clearing).suit;
        const cards=defender.hand.filter(card => card.kind==='ambush' && matches(card,suit));
        if(!cards.length)break;
        ask(s,'ambush',defender,'防守方是否打出伏击？',[pass('不发动伏击'),...cards.map(card => ({id:card.id,label:`打出${card.name}`,value:card.id}))]);
        break;
      }
      case 'ambush-hits': front(s,[frame('ambush-discard')]); damage(s,[{faction:b.attacker,by:b.defender,hits:2}],true); break;
      case 'roll': {
        if (b.ended) break;
        const c=areaOf(s,b.clearing);
        b.rolls=[rng(4),rng(4)].sort((a,b) => b-a);
        b.attackerRolled=Math.min(b.rolls[0],c.warriors[b.attacker]); b.defenderRolled=Math.min(b.rolls[1],c.warriors[b.defender]);
        b.extraAttacker=(c.warriors[b.defender]===0?1:0)+(b.attacker==='bird' && s.bird.leader==='commander'?1:0);
        s.randomEvents.push({type:'battle-dice',battleId:b.id,values:[...b.rolls]}); record(s,`服务器战斗骰子 ${b.rolls.join(' / ')}`);
        break;
      }
      case 'battle-window': {
        if (b.ended) break;
        const factions=[b.attacker,b.defender].filter(f => !b.passed.includes(f) && battleEffects(s,f).length);
        if (!factions.length) break;
        if (factions.length===2) ask(s,'battle-order',ownerOf(s,b.attacker),'选择先处理哪一方的战斗效果',factions.map(f => ({id:f,label:ownerOf(s,f).name,value:f})));
        else front(s,[frame('battle-effects',{faction:factions[0]})]);
        break;
      }
      case 'battle-effects': {
        const owner=ownerOf(s,data.faction);
        ask(s,'battle-effects',owner,'选择战斗效果',[pass('结束使用战斗效果'),...battleEffects(s,data.faction).map(card => ({id:card.id,label:`使用${card.name}`,value:card.id}))],data);
        break;
      }
      case 'battle-damage':
        if (!b.ended) damage(s,[{faction:b.defender,by:b.attacker,hits:(b.ignoreDefender?0:b.attackerRolled)+b.extraAttacker},{faction:b.attacker,by:b.defender,hits:(b.ignoreAttacker?0:b.defenderRolled)+b.extraDefender}]);
        break;
      case 'cardboard': {
        const pieces=cardboard(s,data.faction);
        const c=areaOf(s,b.clearing),total=c.buildings.filter(piece=>piece.faction===data.faction).length+(data.faction==='cat'?Number(c.keep)+c.wood:0);
        if(pieces.length&&data.hits>0&&(pieces.length===1||data.hits>=total)){
          removeCardboard(s,data.faction,pieces[0],data.by);
          if(data.hits>1)front(s,[frame('cardboard',{...data,hits:data.hits-1})]);
        }else if(pieces.length&&data.hits>0)ask(s,'cardboard',ownerOf(s,data.faction),'选择承受命中的建筑或标记',pieces.map(type=>({id:type,label:`移除${LABELS[type]}`,value:type})),data);
        break;
      }
      case 'battle-finish': s.combat=null; break;
      default: throw new RuleError('未知结算步骤');
    }
  }
  if (s.winner) { if (s.combat?.ambushCard) s.discard.push(s.combat.ambushCard); s.effects.frames=[]; s.combat=null; }
  checkDecree(s);
}
function answer(s,userId,a,rng) {
  const result=resolveChoice(s.effects,userId,a); s.effects=result.queue;
  const {kind,option,resume}=result.resolution,value=option.value,p=s.players.find(p => p.id===userId),b=s.combat;
  switch (kind) {
    case 'setup-keep':
      s.setup.catCorner=value; areaOf(s,value).keep=true;
      s.board.forEach(c => { c.warriors.cat=c.id===map.opposite_corners[value]?0:1; });
      front(s,[frame('setup-build')]); break;
    case 'setup-building':
      areaOf(s,value).buildings.push({faction:'cat',type:resume.type}); s.setup.buildings++;
      front(s,[frame('setup-build')]); break;
    case 'setup-leader': leader(s,value); front(s,[frame('start')]); break;
    case 'free-battle': if (value) startBattle(s,p,areaOf(s,value.clearing)); break;
    case 'free-move': if (value) { move(s,p,value); const card=crafted(p,'cobbler');if(card)s.usedEffects.push(card.id); } break;
    case 'hospital':
      if (value) { ensure(s.board.some(c => c.keep),'城堡已被移除'); const card=discard(s,p,value); ensure(matches(card,resume.suit),'医院需要匹配花色'); s.board.find(c => c.keep).warriors.cat+=resume.count; }
      break;
    case 'ambush':
      if (value) {
        b.ambushCard=discard(s,p,value); s.discard.pop();
        record(s,`${p.name} 打出${b.ambushCard.name}（${LABELS[b.ambushCard.suit]}）`);
        const attacker=ownerOf(s,b.attacker),suit=areaOf(s,b.clearing).suit;
        const cards=attacker.hand.filter(card => card.kind==='ambush' && matches(card,suit));
        if(!cards.length){front(s,[frame('ambush-hits')]);break;}
        ask(s,'counter-ambush',attacker,'是否抵消伏击？',[pass('不抵消伏击'),...cards.map(card => ({id:card.id,label:`打出${card.name}`,value:card.id}))]);
      }
      break;
    case 'counter-ambush': if (value) { discard(s,p,value); s.discard.push(b.ambushCard); delete b.ambushCard; } else front(s,[frame('ambush-hits')]); break;
    case 'battle-order': front(s,[frame('battle-effects',{faction:value})]); break;
    case 'battle-effects':
      if (!value) b.passed.push(p.faction);
      else {
        const card=p.crafted.find(card => card.id===value); ensure(card,'持续牌失效'); b.used.push(card.id);
        if (card.kind==='armorers') { discardCrafted(s,p,value); if (p.faction===b.attacker) b.ignoreAttacker=true; else b.ignoreDefender=true; }
        if (card.kind==='sappers') { discardCrafted(s,p,value); b.extraDefender++; }
        if (card.kind==='brutal') { b.extraAttacker++; score(s,b.defender,1); }
      }
      front(s,[frame('battle-window')]); break;
    case 'cardboard': removeCardboard(s,p.faction,value,resume.by); if (resume.hits>1) front(s,[frame('cardboard',{...resume,hits:resume.hits-1})]); break;
    default: throw new RuleError('未知选择');
  }
  pump(s,rng);
}
function craftingPayment(s,p,definition,requested) {
  const type=p.faction==='cat'?'workshop':'roost';
  const pieces=s.board.flatMap(c => c.buildings.flatMap((b,i) => b.faction===p.faction && b.type===type && !s.craftingUsed.includes(`${c.id}-${i}`)?[{id:`${c.id}-${i}`,suit:c.suit}]:[]));
  const available=requested ? requested.map(id => pieces.find(piece => piece.id===id)) : pieces;
  if (available.some(piece => !piece) || (requested && (new Set(requested).size!==requested.length || requested.length!==definition.cost.length))) return null;
  const selected=[];
  for (const suit of [...definition.cost].sort((a,b) => Number(a==='wild')-Number(b==='wild'))) {
    const piece=available.find(piece => !selected.includes(piece.id) && (suit==='wild' || piece.suit===suit));
    if (!piece) return null; selected.push(piece.id);
  }
  return selected;
}
function canCraft(s,p,card) {
  const def=definitions.get(card.archetype);
  return s.phase==='craft' && def && def.cost && (!def.item || s.itemSupply[def.item]>0) && (def.item || def.kind==='favor' || !crafted(p,def.kind)) && craftingPayment(s,p,def)!==null;
}
function craft(s,p,a) {
  const card=p.hand.find(card => card.id===a.card); ensure(card && canCraft(s,p,card),'当前不能制作此牌');
  ensure(a.pieces===undefined || (Array.isArray(a.pieces) && a.pieces.every(id => typeof id==='string')),'制作点编号格式无效');
  const def=definitions.get(card.archetype),payment=craftingPayment(s,p,def,a.pieces);
  ensure(payment,'制作点支付无效'); s.craftingUsed.push(...payment);
  const index=p.hand.findIndex(c => c.id===card.id); p.hand.splice(index,1);
  if (def.item) { s.itemSupply[def.item]--; p.items.push(def.item); s.discard.push(card); score(s,p.faction,p.faction==='bird' && s.bird.leader!=='builder'?1:def.points); }
  else if (def.kind==='favor') {
    s.discard.push(card); let removed=0; const hospitals=[];
    for (const c of s.board.filter(c => c.suit===def.suit)) {
      const enemy=enemyOf(p.faction),cats=enemy==='cat'?c.warriors.cat:0;
      c.warriors[enemy]=0;
      removed+=c.buildings.filter(b => b.faction===enemy).length;
      c.buildings=c.buildings.filter(b => b.faction!==enemy);
      if (enemy==='cat') { removed+=c.wood+(c.keep?1:0); c.wood=0; c.keep=false; }
      if (cats) hospitals.push(frame('hospital',{count:cats,suit:c.suit}));
    }
    score(s,p.faction,removed); front(s,hospitals);
  } else p.crafted.push(card);
  record(s,`${p.name} 制作${card.name}`);
}
export function createGame(players,rng=randomInt) {
  ensure(players.length===2 && new Set(players.map(p => p.faction)).size===2 && players.every(p => ['cat','bird'].includes(p.faction)),'猫鹰标准局需要各一人');
  const s={ruleset:RULESET,stateSchemaVersion:4,round:1,turn:rng(2),turnsCompleted:0,phase:'setup',winner:null,actions:3,march:0,recruited:false,
    setup:{complete:false,catCorner:null,birdCorner:null,buildings:0},effects:createQueue(),combat:null,battleSequence:0,randomEvents:[],craftingUsed:[],usedEffects:[],privateReveal:null,
    players:players.map(p => ({id:p.userId,name:p.name,faction:p.faction,score:0,hand:[],crafted:[],items:[]})),
    board:map.nodes.filter(c => c.node_type==='clearing').map(c => ({id:c.id,name:`秋林 ${c.id}`,suit:c.suit,x:positions[c.id][0],y:positions[c.id][1],slots:c.building_slots,ruins:c.ruin?1:0,links:[...c.paths],riverLinks:[...c.river_neighbors],warriors:{cat:0,bird:0},buildings:[],wood:0,keep:false})),
    deck:shuffle(catalog.cards.flatMap(def => Array.from({length:def.count},(_,i) => ({id:`${def.type}-${i}`,archetype:def.type,name:def.name,suit:def.suit,kind:def.kind,effectImplemented:true}))),rng),discard:[],itemSupply:{...catalog.item_supply},mapId:map.map_id,
    bird:{leader:null,used:[],decree:Object.fromEntries(columns.map(column=>[column,[]])),remaining:{},added:0,addedBird:false},log:[]};
  s.players.forEach(p => draw(s,p,3,rng));
  ask(s,'setup-keep',ownerOf(s,'cat'),'选择猫咪贵族城堡所在角落',map.nodes.filter(c => c.starting).map(c => ({id:String(c.id),label:`秋林 ${c.id}`,value:c.id})));
  return s;
}
function execute(s,p,a,rng) {
  if(a.type==='evening-continue'){ensure(s.phase==='evening','当前不能继续夜晚');front(s,[frame('evening-score')]);return;}
  if(a.type==='evening-end'){ensure(s.phase==='evening-end','请先完成夜晚步骤');nextTurn(s,rng);return;}
  if(a.type==='move'&&a.cobbler){const card=availableCobbler(s,p);ensure(card,'补鞋匠只能在夜晚使用一次');move(s,p,a);s.usedEffects.push(card.id);record(s,`${p.name} 使用补鞋匠额外移动`);return;}

  if (a.type==='birdsong-end') {
    ensure(s.phase==='birdsong','当前不在清晨');
    if (p.faction==='bird') { if (!p.hand.length) draw(s,p,1,rng); s.phase='decree-add'; }
    else { s.woodPending=s.board.flatMap(c => c.buildings.filter(b => b.faction==='cat' && b.type==='sawmill').map(() => c.id)); s.phase='wood'; if (!s.woodPending.length || woodCount(s)===8) daylight(s); }
    return;
  }
  if (a.type==='wood') {
    ensure(s.phase==='wood','当前不能生产木材'); const i=s.woodPending.indexOf(a.clearing);
    ensure(i>=0 && woodCount(s)<8,'锯木厂或木材供应无效'); areaOf(s,a.clearing).wood++; s.woodPending.splice(i,1);
    if (!s.woodPending.length || woodCount(s)===8) daylight(s); return;
  }
  if (a.type==='decree-add') {
    ensure(p.faction==='bird' && s.phase==='decree-add' && s.bird.added<2 && columns.includes(a.column),'当前不能添加政令');
    const card=discard(s,p,a.card); s.discard.pop(); ensure(card.suit!=='wild' || !s.bird.addedBird,'每回合最多添加一张鸟牌');
    s.bird.decree[a.column].push(card); s.bird.added++; if (card.suit==='wild') s.bird.addedBird=true; return;
  }
  if (a.type==='decree-ready') {
    ensure(p.faction==='bird' && s.phase==='decree-add' && s.bird.added>=1,'先加入至少一张政令');
    if (buildingCount(s,'bird','roost')===0) {
      s.phase='new-roost';
      if (!s.board.some(c => !c.keep && freeSlots(c)>0)) daylight(s);
    } else daylight(s); return;
  }
  if (a.type==='new-roost') {
    ensure(s.phase==='new-roost' && p.faction==='bird','当前不需要恢复鸟巢');
    const eligible=s.board.filter(c => !c.keep && freeSlots(c)>0),min=Math.min(...eligible.map(c => c.warriors.cat+c.warriors.bird));
    const c=areaOf(s,a.clearing); ensure(eligible.includes(c) && c.warriors.cat+c.warriors.bird===min,'必须选择可放置且士兵最少的林地');
    c.buildings.push({faction:'bird',type:'roost'}); c.warriors.bird+=Math.min(3,reserve(s,'bird')); daylight(s); return;
  }
  if (a.type==='craft') { craft(s,p,a); return; }
  if (a.type==='craft-done') { ensure(s.phase==='craft','当前不在制作阶段'); if (p.faction==='cat') s.phase='daylight'; else { s.bird.remaining=structuredClone(s.bird.decree); s.phase='decree'; } return; }
  if (a.type==='leader') { ensure(s.phase==='leader' && p.faction==='bird' && !s.bird.used.includes(a.leader),'不能选择此领袖'); leader(s,a.leader); evening(s); return; }
  if (a.type==='discard') { ensure(s.phase==='discard' && p.hand.length>5,'当前不需要弃牌'); discard(s,p,a.card); if (p.hand.length===5) finishEvening(s,rng); return; }
  if (a.type==='effect') { useEffect(s,p,a,rng); return; }
  if (a.type==='march-end') { ensure(p.faction==='cat' && s.phase==='daylight' && s.march>0,'没有进行中的行军'); s.march=0; return; }
  if (a.type==='extra') { ensure(p.faction==='cat' && s.phase==='daylight' && !s.march,'当前不能增加行动'); const card=discard(s,p,a.card); ensure(card.suit==='wild','必须花费鸟牌'); s.actions++; return; }
  if (a.type==='end') { ensure(!s.march && ((p.faction==='cat' && s.phase==='daylight') || (p.faction==='bird' && s.phase==='decree' && !activeColumn(s))),'本阶段尚未完成'); evening(s); return; }
  ensure(['move','recruit','build','overwork','battle'].includes(a.type),'未知行动');
  ensure(s.phase===(p.faction==='cat'?'daylight':'decree'),'当前阶段不能行动');
  if (p.faction==='cat') {
    if (a.type==='move' && s.march) s.march=0;
    else { ensure(!s.march && s.actions>0,'行动不足或行军尚未结束'); s.actions--; if (a.type==='move') s.march=1; }
  } else {
    const col=activeColumn(s); ensure(col===a.type,'按政令列顺序执行');
    const i=s.bird.remaining[col].findIndex(card => card.id===a.decreeCard); ensure(i>=0,'选择待执行的政令');
    const c=areaOf(s,a.type==='move'?a.from:a.clearing); ensure(matches(s.bird.remaining[col][i],c.suit),'政令花色不符'); s.bird.remaining[col].splice(i,1);
  }
  if (a.type==='move') move(s,p,a);
  if (a.type==='battle') { const c=areaOf(s,a.clearing); ensure(c.warriors[p.faction]>0 && hasEnemy(c,p.faction),'此处不能战斗'); startBattle(s,p,c); }
  if (a.type==='overwork') { ensure(p.faction==='cat','此阵营不能过劳'); const c=areaOf(s,a.clearing); ensure(c.buildings.some(b => b.faction==='cat' && b.type==='sawmill') && woodCount(s)<8,'没有锯木厂或木材供应'); const card=discard(s,p,a.card); ensure(matches(card,c.suit),'过劳牌花色不符'); c.wood++; }
  if (a.type==='recruit') {
    if (p.faction==='bird') { const c=areaOf(s,a.clearing),n=s.bird.leader==='charismatic'?2:1; ensure(!c.keep && c.buildings.some(b => b.faction==='bird' && b.type==='roost') && reserve(s,'bird')>=n,'不能完全完成征兵'); c.warriors.bird+=n; }
    else {
      const n=Math.min(buildingCount(s,'cat','recruiter'),reserve(s,'cat'));
      ensure(!s.recruited && n>0 && Array.isArray(a.clearings) && a.clearings.length===n,'征兵数量无效或本回合已征兵');
      const usage={}; for (const id of a.clearings) { const c=areaOf(s,id); usage[id]=(usage[id]||0)+1; ensure(usage[id]<=c.buildings.filter(b => b.faction==='cat' && b.type==='recruiter').length,'征兵所容量不足'); c.warriors.cat++; } s.recruited=true;
    }
  }
  if (a.type==='build') {
    const c=areaOf(s,a.clearing); ensure(ruler(c)===p.faction && freeSlots(c)>0,'需要统治且有空建筑位');
    if (p.faction==='bird') { ensure(!c.keep && !c.buildings.some(b => b.type==='roost') && buildingCount(s,'bird','roost')<7,'不能放置鸟巢'); c.buildings.push({faction:'bird',type:'roost'}); }
    else {
      ensure(Object.hasOwn(buildingScore,a.building),'建筑类型无效'); const n=buildingCount(s,'cat',a.building),cost=buildingCost[n],network=connectedWood(s,c.id);
      ensure(n<6 && Array.isArray(a.wood) && a.wood.length===cost,'建筑供应或木材数量无效');
      for (const id of a.wood) { const source=areaOf(s,id); ensure(network.includes(id) && source.wood>0,'木材必须经己方统治的道路连通'); source.wood--; }
      c.buildings.push({faction:'cat',type:a.building}); score(s,'cat',buildingScore[a.building][n]);
    }
  }
}
function useEffect(s,p,a,rng) {
  ensure(!s.march,'先结束行军'); const card=p.crafted.find(card => card.id===a.card); ensure(card,'持续牌不存在');
  const enemy=ownerOf(s,enemyOf(p.faction));
  if (card.kind==='royalclaim' || card.kind==='standdeliver') {
    ensure(s.phase==='birdsong','此牌在清晨使用');
    if (card.kind==='royalclaim') { discardCrafted(s,p,card.id); score(s,p.faction,s.board.filter(c => ruler(c)===p.faction).length); }
    else { ensure(!s.usedEffects.includes(card.id) && enemy.hand.length>0,'本回合已使用或对方没有手牌'); s.usedEffects.push(card.id); const i=rng(enemy.hand.length); p.hand.push(enemy.hand.splice(i,1)[0]); score(s,enemy.faction,1); }
    return;
  }
  ensure(['craft','daylight','decree'].includes(s.phase),'此牌在白昼使用');
  ensure(!s.usedEffects.includes(card.id),'本回合已经使用');
  if (card.kind==='codebreakers') { s.privateReveal={viewer:p.id,owner:enemy.id,cards:structuredClone(enemy.hand)}; s.usedEffects.push(card.id); return; }
  if (card.kind==='tax') { const c=areaOf(s,a.clearing); ensure(c.warriors[p.faction]>0,'此处没有己方士兵'); c.warriors[p.faction]--; s.usedEffects.push(card.id); front(s,[...(p.faction==='cat'?[frame('hospital',{count:1,suit:c.suit})]:[]),frame('draw',{faction:p.faction,count:1})]); return; }
  throw new RuleError('此牌通过其触发时机使用');
}
export function applyAction(source,userId,a,rng=randomInt) {
  ensure(a && typeof a==='object' && !Array.isArray(a),'行动格式无效'); ensure(!source.winner,'对局已结束');
  const s=structuredClone(source),p=s.players.find(p => p.id===userId); ensure(p,'你不在本局中');
  if (s.effects.frames[0]?.type==='choice') { ensure(a.type==='choice','等待当前选择完成'); answer(s,userId,a,rng); }
  else { ensure(s.setup.complete && current(s).id===userId,'等待当前玩家行动'); execute(s,p,a,rng); pump(s,rng); }
  if (!s.winner && !s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
  return s;
}
export function projectGame(state,userId) {
  const s=structuredClone(state); delete s.deck; delete s.effects; delete s.randomEvents; delete s.privateReveal;
  s.deckCount=state.deck.length;
  s.players=s.players.map(p => { p.handCount=p.hand.length; if (p.id!==userId) delete p.hand; return p; });
  s.choice=projectChoice(state.effects,userId); s.pending=null;
  s.combat=state.combat?{clearing:state.combat.clearing,attacker:state.combat.attacker,defender:state.combat.defender,rolls:state.combat.rolls}:null;
  s.currentDecreeColumn=activeColumn(state)||null; s.leaders=Object.keys(leaders).filter(name => !state.bird.used.includes(name)); s.limitations=LIMITATIONS;
  const p=state.players.find(p => p.id===userId),active=p && current(state).id===userId && state.setup.complete && !s.choice && !state.winner;
  s.craftOptions=active?p.hand.filter(card => canCraft(state,p,card)).map(card => ({card:card.id,name:card.name,cost:definitions.get(card.archetype).cost})):[];
  s.effectOptions=active?p.crafted.filter(card => !state.usedEffects.includes(card.id) && ((state.phase==='birdsong' && ['royalclaim','standdeliver'].includes(card.kind)) || (['craft','daylight','decree'].includes(state.phase) && ['tax','codebreakers'].includes(card.kind)))).map(card => ({card:card.id,name:card.name,clearing:card.kind==='tax'})):[];
  if (state.privateReveal?.viewer===userId) s.revealedHand=structuredClone(state.privateReveal);
  s.nightCobbler=!!(active&&availableCobbler(state,p));
  if(s.nightCobbler){const options=cobblerOptions(state,p);s.factionActions=[...(s.factionActions||[]),...options];s.mapActions=[...(s.mapActions||[]),...options.map(option=>option.action)];}
  return s;
}
