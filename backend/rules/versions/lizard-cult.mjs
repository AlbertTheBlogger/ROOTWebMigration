// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { present as emitPresentation, finishPresentation } from '../presentation.mjs';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RuleError, shuffle, LABELS as CORE_LABELS } from '../../engine.mjs';
import { createQueue, enqueue, takeEffect, resolveChoice, projectChoice } from '../effects/queue.mjs';

const LIZARD_SUITS = ['fox','rabbit','mouse'];
// Original digital board: five spaces, points 0/2/2/3/4; draw bonus on space two.
const GARDEN_POINTS = [0,0,2,2,3,4];
const gardenCount = (s,suit) => buildingCount(s,'lizard','garden-'+suit);
function lizardCraftingPieces(s) {
  return s.board.flatMap(c=>c.buildings.flatMap((b,index)=>b.faction==='lizard'&&b.type==='garden-'+s.lizard.outcast
    ?[{id:`${c.id}-${index}`,suit:c.suit}]:[]));
}
function beginLizardSetup(s) {
  const occupied=[s.setup.catCorner,s.setup.birdCorner].filter(id=>id!==null);
  const corners=map.nodes.filter(c=>c.starting&&!occupied.includes(c.id));
  const opposite=corners.filter(c=>occupied.some(id=>Number(map.opposite_corners[id])===c.id));
  const eligible=opposite.length?opposite:corners;
  ask(s,'setup-lizard-corner',ownerOf(s,'lizard'),'选择蜥蜴起始角落',eligible.map(c=>({id:String(c.id),label:`秋林 ${c.id}`,value:c.id})));
}
function answerLizardChoice(s,p,kind,value,rng) {
  if(kind==='setup-lizard-corner') {
    const c=areaOf(s,value);s.setup.lizardCorner=value;c.warriors.lizard=4;
    c.buildings.push({faction:'lizard',type:'garden-'+c.suit});
    c.links.forEach(id=>areaOf(s,id).warriors.lizard++);
    ask(s,'setup-lizard-outcast',p,'选择初始被逐者花色',LIZARD_SUITS.map(suit=>({id:suit,label:LABELS[suit],value:suit})));
  } else if(kind==='setup-lizard-outcast') {
    s.lizard.outcast=value;s.setup.lizardComplete=true;finishFactionSetup(s,rng);
  } else if(kind==='lizard-crusade-battle') {
    if(value)startBattle(s,p,areaOf(s,value.clearing),value.defender);
  } else return false;
  return true;
}
function adjustOutcast(s) {
  const counts=Object.fromEntries(LIZARD_SUITS.map(suit=>[suit,s.lizard.lostSouls.filter(card=>card.suit===suit).length]));
  const maximum=Math.max(...Object.values(counts));
  const leaders=LIZARD_SUITS.filter(suit=>counts[suit]===maximum);
  if(leaders.length===1&&leaders[0]!==s.lizard.outcast){s.lizard.outcast=leaders[0];s.lizard.hated=false;}
  else s.lizard.hated=true;
  for(const card of s.lizard.lostSouls.splice(0)) {
    if(card.kind==='dominance')s.dominanceAvailable.push(card);else s.discard.push(card);
  }
  record(s,`被逐者：${LABELS[s.lizard.outcast]}${s.lizard.hated?' · 憎恨':''}；失魂已转入弃牌堆`);
}
function pumpLizardEffect(s,kind,data,rng) {
  if(kind==='garden-fear') {
    const p=ownerOf(s,'lizard');
    if(p.hand.length){const index=rng(p.hand.length),card=p.hand[index];discard(s,p,card.id);
      s.randomEvents.push({type:'garden-fear',card:card.id});record(s,'信徒恐惧：随机弃置1张未展示手牌，加入失魂堆');}
  } else if(kind==='lizard-crusade-followup') {
    const p=ownerOf(s,'lizard'),c=areaOf(s,data.clearing);
    const targets=enemiesOf(s,'lizard').filter(enemy=>present(s,c,enemy.faction));
    if(c.warriors.lizard&&targets.length)ask(s,'lizard-crusade-battle',p,'圣战移动完成，是否在目的地战斗？',[
      pass('结束圣战，不战斗'),...targets.map(enemy=>({id:enemy.faction,label:'战斗：'+enemy.name,value:{clearing:c.id,defender:enemy.faction}}))]);
  } else return false;
  return true;
}
function lizardActionOptions(s,userId) {
  const p=current(s);
  if(p.faction!=='lizard'||p.id!==userId||!s.setup.complete||s.winner||s.effects.frames.length)return [];
  const result=[];
  const add=(category,label,action)=>result.push({category,label,action});
  if(s.phase==='lizard-conspiracies') {
    const discount=s.lizard.hated?1:0;
    for(const c of s.board.filter(c=>c.suit===s.lizard.outcast)) {
      if(s.lizard.acolytes>=2-discount) {
        if(c.warriors.lizard>0) {
          for(const enemy of enemiesOf(s,'lizard').filter(enemy=>present(s,c,enemy.faction)))add('圣战',`${c.name} · 对${enemy.name}战斗 · ${2-discount}侍僧`,{type:'crusade',clearing:c.id,defender:enemy.faction});
          for(const move of moveOptions(s,'lizard').filter(move=>move.from===c.id))add('圣战移动',`${c.name} → 秋林 ${move.to} · ${move.count}名士兵 · ${2-discount}侍僧`,{...move,type:'crusade'});
        }
        if(!c.keep)for(const enemy of enemiesOf(s,'lizard').filter(enemy=>c.warriors[enemy.faction]>0))add('转化',`${c.name} · ${enemy.name}士兵 · ${2-discount}侍僧`,{type:'convert',clearing:c.id,target:enemy.faction});
      }
      if(s.lizard.acolytes>=3-discount&&!c.keep&&gardenCount(s,c.suit)<5)for(const b of c.buildings.filter(b=>enemiesOf(s,'lizard').some(enemy=>enemy.faction===b.faction)))
        add('圣化',`${c.name} · ${LABELS[b.type]} → ${LABELS['garden-'+c.suit]} · ${3-discount}侍僧`,{type:'sanctify',clearing:c.id,target:b.faction,building:b.type});
    }
  }
  if(s.phase==='daylight')for(const card of p.hand) {
    if(card.suit==='wild') {
      if(reserve(s,'lizard')>0)add('献祭',`${card.name} · 展示鸟牌，增加1侍僧`,{type:'sacrifice',card:card.id});
      continue;
    }
    const n=gardenCount(s,card.suit);
    if(n>0&&!s.lizard.scoredSuits.includes(card.suit))add('仪式得分',`${card.name} · ${LABELS[card.suit]}花园${n}座 · +${GARDEN_POINTS[n]}分`,{type:'ritual-score',card:card.id});
    for(const c of s.board.filter(c=>c.suit===card.suit&&!c.keep)) {
      if(reserve(s,'lizard')>0)add('仪式招募',`${c.name} · 展示${card.name}`,{type:'ritual-recruit',clearing:c.id,card:card.id});
      if(n<5&&freeSlots(c)>0&&ruler(c)==='lizard')add('仪式建造',`${c.name} · 展示${card.name}`,{type:'ritual-build',clearing:c.id,card:card.id});
    }
  }
  return result;
}
function executeLizard(s,p,a,rng) {
  if(a.type==='birdsong-end') {
    ensure(s.phase==='birdsong','当前不在清晨');adjustOutcast(s);s.phase='lizard-conspiracies';return true;
  }
  if(a.type==='conspiracies-done') {
    ensure(s.phase==='lizard-conspiracies','当前不在密谋阶段');daylight(s);return true;
  }
  if(a.type==='end') {
    ensure(s.phase==='daylight','请先完成当前阶段');p.hand.push(...s.lizard.revealed.splice(0));evening(s);return true;
  }
  if(a.type==='lizard-craft-done') {
    ensure(s.phase==='lizard-craft','当前不在夜晚锻造');
    const bonus=LIZARD_SUITS.filter(suit=>gardenCount(s,suit)>=2).length;
    draw(s,p,1+bonus,rng);s.phase='discard';if(p.hand.length<=5)finishEvening(s,rng);return true;
  }
  const ritual=['ritual-score','ritual-recruit','ritual-build','sacrifice'].includes(a.type);
  const conspiracy=['crusade','convert','sanctify'].includes(a.type);
  if(!ritual&&!conspiracy)return false;
  // Validate against server-generated legal options before paying or revealing anything.
  ensure(lizardActionOptions(s,p.id).some(option=>Object.keys(a).every(key=>Object.hasOwn(option.action,key))&&Object.keys(option.action).every(key=>option.action[key]===a[key])),'当前没有此合法蜥蜴行动');
  if(ritual) {
    const card=takeHand(s,p,a.card);
    if(a.type==='ritual-score') {
      putDiscard(s,card);s.lizard.scoredSuits.push(card.suit);
      score(s,'lizard',GARDEN_POINTS[gardenCount(s,card.suit)],LABELS[card.suit]+'花园仪式');
    } else {
      s.lizard.revealed.push(card);
      if(a.type==='sacrifice')s.lizard.acolytes++;
      if(a.type==='ritual-recruit')areaOf(s,a.clearing).warriors.lizard++;
      if(a.type==='ritual-build')areaOf(s,a.clearing).buildings.push({faction:'lizard',type:'garden-'+card.suit});
    }
    record(s,`${p.name} ${ {'ritual-score':'举行得分仪式','ritual-recruit':'展示手牌招募','ritual-build':'展示手牌建造花园',sacrifice:'展示鸟牌献祭'}[a.type]}${a.clearing!==undefined?' · '+areaOf(s,a.clearing).name:''}`);
  } else {
    s.lizard.acolytes-=(a.type==='sanctify'?3:2)-(s.lizard.hated?1:0);
    if(a.type==='crusade') {
      if(a.from!==undefined){front(s,[frame('lizard-crusade-followup',{clearing:a.to})]);move(s,p,a);}
      else startBattle(s,p,areaOf(s,a.clearing),a.defender);
    } else {
      const c=areaOf(s,a.clearing);
      if(a.type==='convert') {
        c.warriors[a.target]--;c.warriors.lizard++;
        if(a.target==='cat')front(s,[frame('hospital',{count:1,suit:c.suit})]);
      } else {
        removeCardboard(s,a.target,a.building,'lizard',c);
        c.buildings.push({faction:'lizard',type:'garden-'+c.suit});
      }
      record(s,`${p.name} ${a.type==='convert'?'转化敌方士兵':'圣化敌方建筑'} · ${c.name}`);
    }
  }
  return true;
}

export const RULESET = 'root-lizard-cult-v6';
const LABELS = {...CORE_LABELS, lizard:'蜥蜴神教', 'garden-fox':'狐狸花园', 'garden-rabbit':'兔子花园', 'garden-mouse':'老鼠花园', cat:'猫咪贵族', alliance:'森林联盟', vagabond:'神秘游侠', sympathy:'民意', 'base-fox':'狐狸基地', 'base-mouse':'老鼠基地', 'base-rabbit':'兔子基地'};
const expansion = JSON.parse(readFileSync(new URL('../../data/four-faction-catalog.json', import.meta.url), 'utf8'));
const characters = {thief:['boot','torch','tea','sword'], tinker:['boot','torch','bag','hammer'], ranger:['boot','torch','crossbow','sword']};
export const LIMITATIONS = ['秋季地图、基础四阵营与蜥蜴神教，支持二至四人，各阵营限一人。','游侠开放基础角色：盗贼、工匠、猎人。'];
const catalog = JSON.parse(readFileSync(new URL('../../data/full-card-catalog.json', import.meta.url), 'utf8'));
const definitions = new Map(catalog.cards.map(card => [card.type, card]));
const map = JSON.parse(readFileSync(new URL('../../data/fall-map.json', import.meta.url), 'utf8'));
const positions = [[95,85],[350,65],[610,85],[330,200],[80,310],[290,350],[490,385],[645,290],[610,590],[420,560],[250,610],[75,555]];
const columns = ['recruit','move','battle','build'];
const leaders = { despot:['move','build'], commander:['move','battle'], charismatic:['recruit','battle'], builder:['recruit','move'] };
const leaderNames = {despot:'制裁者',commander:'指挥者',charismatic:'号召者',builder:'建设者'};
const buildingCost = [0,1,2,3,3,4];
const roostScore=[0,0,1,2,3,4,4,5];
const buildingScore = { sawmill:[0,1,2,3,4,5], workshop:[0,2,2,3,4,5], recruiter:[0,1,2,3,3,4] };
const ensure = (ok, message) => { if (!ok) throw new RuleError(message); };
const ownerOf = (s, faction) => s.players.find(p => p.faction === faction);
const current = s => s.players[s.turn];
const enemiesOf = (s,faction) => s.players.filter(player => player.faction!==faction && !coalitionPartners(s,faction,player.faction));
const areaOf = (s, id) => { const area=s.board.find(c => c.id===id); ensure(area,'林地不存在'); return area; };
const matches = (card, suit) => card.suit==='wild' || card.suit===suit;
const buildingCount = (s, faction, type) => s.board.reduce((sum,c) => sum+c.buildings.filter(b => b.faction===faction && b.type===type).length,0);
const reserve = (s, faction) => ({cat:25,bird:20,alliance:10,lizard:25}[faction])-s.board.reduce((sum,c) => sum+(c.warriors[faction]||0),0)-(faction==='alliance'?s.alliance.officers:0)-(faction==='lizard'?s.lizard.acolytes:0);
const woodCount = s => s.board.reduce((sum,c) => sum+c.wood,0);
const freeSlots = c => c.slots-c.ruins-c.buildings.length;
const hasEnemy = (s,c,f) => enemiesOf(s,f).some(player => present(s,c,player.faction));
const crafted = (p, kind) => p.crafted.find(c => c.kind===kind);
const frame = (kind,data={}) => ({ type:'effect',kind,data });
function front(s, frames) { s.effects=enqueue(s.effects,frames,{front:true}); }
function record(s,text) {
  s.logTurns ||= s.log.map(()=>null);
  s.log.push(text);s.logTurns.push(s.setup.complete?s.turnsCompleted+1:0);
  if(s.log.length>200){s.log.shift();s.logTurns.shift();}
}
function draw(s,p,count,rng) {
  const before=p.hand.length;
  for (let i=0;i<count;i++) {
    if (!s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
    if (s.deck.length) p.hand.push(s.deck.pop());
    if (!s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
  }
  if(p.name && p.hand.length>before){record(s,`${p.name} 抽取 ${p.hand.length-before} 张牌`);if(p.id)emitPresentation(s,{kind:'draw',playerId:p.id,faction:p.faction,count:p.hand.length-before});}
}
function score(s, faction, points, reason='规则得分') {
  const owner=ownerOf(s,faction);
  if(owner.dominance || owner.coalition)return;
  const before=owner.score;
  owner.score=Math.max(0,owner.score+points);
  if(owner.score!==before){
    record(s,`${owner.name} ${owner.score>before?'获得':'失去'} ${Math.abs(owner.score-before)} 分，当前 ${owner.score} 分`);
    emitPresentation(s,{kind:'score',playerId:owner.id,faction,delta:owner.score-before,total:owner.score,reason});
    s.scoreEventSeq=(s.scoreEventSeq||0)+1;
    s.scoreEvents ||= [];
    s.scoreEvents.push({seq:s.scoreEventSeq,playerId:owner.id,faction,name:owner.name,reason,delta:owner.score-before,total:owner.score});
    if(s.scoreEvents.length>100)s.scoreEvents.shift();
  }
  if (owner.score>=30 && !s.winner) { finishGame(s,owner); record(s,`${owner.name} 达到 30 分，获胜`); }
}
function discard(s,p,cardId) {
  const index=p.hand.findIndex(card => card.id===cardId);
  ensure(index>=0,'这张牌不在手中');
  const [card]=p.hand.splice(index,1); putDiscard(s,card); return card;
}
function discardCrafted(s,p,cardId) {
  const index=p.crafted.findIndex(card => card.id===cardId);
  ensure(index>=0,'持续牌已经失效');
  const [card]=p.crafted.splice(index,1); putDiscard(s,card); return card;
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
  if(faction==='vagabond')return vagabondMoves(s,false);
  return s.board.flatMap(from => from.warriors[faction]>0 ? from.links.flatMap(toId => {
    const to=areaOf(s,toId);
    if (ruler(from)!==faction && ruler(to)!==faction) return [];
    return Array.from({length:from.warriors[faction]},(_,i) => ({type:'move',from:from.id,to:toId,count:i+1}));
  }) : []);
}
function battleOptions(s,faction) { return s.board.filter(c => (faction==='vagabond'?s.vagabond.position===c.id:c.warriors[faction]>0) && hasEnemy(s,c,faction)).map(c => ({type:'battle',clearing:c.id})); }
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
  const failed=structuredClone(s.bird.remaining[column]);
  const cards=Object.values(s.bird.decree).flat();
  const previousScore=ownerOf(s,'bird').score;
  score(s,'bird',-cards.filter(c => c.suit==='wild').length,'王朝倒台');
  putDiscard(s,...cards.filter(c => !c.vizier));
  s.bird.decree=Object.fromEntries(columns.map(c => [c,[]]));
  s.bird.remaining={};
  s.bird.used.push(s.bird.leader);
  if (s.bird.used.length===4) s.bird.used=[];
  s.phase='leader';
  emitPresentation(s,{kind:'turmoil',playerId:ownerOf(s,'bird').id,faction:'bird',delta:ownerOf(s,'bird').score-previousScore,column,birdCards:cards.filter(c=>c.suit==='wild').length,discarded:cards.filter(c=>!c.vizier).length,viziers:cards.filter(c=>c.vizier).length,leader:s.bird.leader});
  record(s,`${current(s).name} 发生动乱：无法执行${{recruit:'招募',move:'移动',battle:'战斗',build:'建造'}[column]}法令（${failed.map(card=>LABELS[card.suit]).join('、')}）；飞鸟牌 ${cards.filter(card=>card.suit==='wild').length} 张，实际失去 ${previousScore-ownerOf(s,'bird').score} 分`);
}
function beginTurn(s,rng) {
  s.actions=3; s.march=0; s.recruited=false; s.craftingUsed=[]; s.usedEffects=[]; s.privateReveal=null;
  s.bird.added=0; s.bird.addedBird=false; s.phase='birdsong';
  record(s,`${current(s).name} 第 ${s.round} 轮开始 · 清晨`);
  if(current(s).faction==='vagabond'){normalizeItems(s);s.vagabond.refreshLeft=3+2*s.vagabond.items.filter(item=>item.type==='tea'&&item.track).length;s.vagabond.aidCounts={};}
  s.alliance.operations=s.alliance.officers;
  if(current(s).faction==='lizard')s.lizard.scoredSuits=[];
  checkDominance(s);
  if(crafted(current(s),'bank')&&!s.winner)front(s,[frame('bank-choice')]);
  pump(s,rng);
}
function nextTurn(s,rng) { s.turn=(s.turn+1)%s.players.length; s.turnsCompleted++; s.round=1+Math.floor(s.turnsCompleted/s.players.length); beginTurn(s,rng); }
function daylight(s) { record(s,`${current(s).name} 进入白天`); s.phase='daylight-start'; front(s,[frame('commandwarren'),frame('craft-phase')]); }
function evening(s) { record(s,`${current(s).name} 进入夜晚`); s.phase='evening-start'; if(crafted(current(s),'cobbler')&&!s.usedEffects.includes(crafted(current(s),'cobbler').id))s.phase='evening';else front(s,[frame('evening-score')]); }
const eveningPhases=['evening','military','lizard-craft'];
function availableCobbler(s,p=current(s)) { return eveningPhases.includes(s.phase) && p.crafted.find(card=>card.kind==='cobbler'&&!s.usedEffects.includes(card.id)); }
function finishEvening(s,rng) { nextTurn(s,rng); }
function cobblerOptions(s,p) { return availableCobbler(s,p)?moveOptions(s,p.faction).map(action=>({category:'补鞋匠',label:`${action.from} → ${action.to} · ${action.count} 名`,action:{...action,cobbler:true}})):[]; }

function move(s,p,a) {
  if(p.faction==='vagabond'){moveVagabond(s,a,false);return;}
  const from=areaOf(s,a.from),to=areaOf(s,a.to);
  ensure(from.links.includes(to.id),'两片林地没有道路相连');
  ensure(ruler(from)===p.faction || ruler(to)===p.faction,'必须统治移动起点或终点');
  ensure(Number.isInteger(a.count) && a.count>0 && a.count<=from.warriors[p.faction],'士兵数量无效');
  from.warriors[p.faction]-=a.count; to.warriors[p.faction]+=a.count;
  emitPresentation(s,{kind:'move',playerId:p.id,faction:p.faction,from:from.id,to:to.id,count:a.count});
  if(to.sympathy&&p.faction!=='alliance')front(s,[frame('outrage',{faction:p.faction,clearing:to.id})]);
  record(s,`${p.name} 从${from.name}向${to.name}移动 ${a.count} 名士兵`);
}
function hospital(s,count,suit) {
  if (!count || !s.board.some(c => c.keep)) return;
  const p=ownerOf(s,'cat'),cards=p.hand.filter(card => matches(card,suit));
  if(!cards.length)return;
  ask(s,'hospital',p,`是否救回 ${count} 名猫士兵？`,[pass('不使用野战医院'),...cards.map(card => ({id:card.id,label:`花费${card.name}，救回 ${count} 名士兵`,value:card.id}))],{count,suit});
}
function cardboard(s,faction,c=areaOf(s,s.combat.clearing)) {
  return [...new Set(c.buildings.filter(b => b.faction===faction).map(b => b.type).concat(faction==='cat'?[...(c.keep?['keep']:[]),...(c.wood?['wood']:[])]:faction==='alliance'&&c.sympathy?['sympathy']:[]))];
}
function removeCardboard(s,faction,type,by,c=areaOf(s,s.combat.clearing)) {
  ensure(cardboard(s,faction,c).includes(type),'不能移除此棋子');
  if(type==='keep')c.keep=false;
  else if(type==='wood')c.wood--;
  else if(type==='sympathy'){
    c.sympathy=false;
    front(s,[frame('outrage',{faction:by,clearing:c.id})]);
  }else{
    c.buildings.splice(c.buildings.findIndex(building=>building.faction===faction&&building.type===type),1);
    if(faction==='lizard'&&type.startsWith('garden-'))front(s,[frame('garden-fear')]);
    if(type.startsWith('base-'))front(s,[frame('base-loss',{suit:type.slice(5)})]);
  }
  record(s,`${ownerOf(s,faction).name} 在${c.name}移除 ${LABELS[type]}`);
  let points=1;
  if(by==='bird'&&s.combat&&s.bird.leader==='despot'&&!s.combat.despotScored){points++;s.combat.despotScored=true;}
  if(by==='vagabond'&&s.combat&&current(s).faction==='vagabond'&&s.vagabond.relations[faction]===-1)points++;
  score(s,by,points,'移除'+LABELS[type]);
}
function damage(s,losses,ambush=false) {
  const c=areaOf(s,s.combat.clearing),frames=[];
  let cats=0;
  for (const loss of losses) {
    if(loss.faction==='vagabond'){frames.push(frame('vagabond-damage',{hits:loss.hits,by:loss.by,battle:true}));continue;}
    const n=Math.min(loss.hits,c.warriors[loss.faction]); c.warriors[loss.faction]-=n;
    removedWarriors(s,loss.by,loss.faction,n,true);
    if(n)record(s,`${ownerOf(s,loss.faction).name} 在${c.name}损失 ${n} 名士兵`);
    if (loss.faction==='cat') cats+=n;
    if (loss.hits>n) frames.push(frame('cardboard',{...loss,hits:loss.hits-n}));
  }
  if (ambush && s.combat.attacker!=='vagabond' && !c.warriors[s.combat.attacker]) s.combat.ended=true;
  if (cats) frames.push(frame('hospital',{count:cats,suit:c.suit}));
  front(s,frames);
}
function startBattle(s,p,c,defender,ally) {
  const targets=enemiesOf(s,p.faction).filter(player=>present(s,c,player.faction));
  if(!defender&&targets.length===1)defender=targets[0].faction;
  if(!defender){ask(s,'battle-target',p,'选择战斗的防守阵营',targets.map(player=>({id:player.faction,label:player.name+' · '+LABELS[player.faction],value:player.faction})),{clearing:c.id});return;}
  ensure(targets.some(player=>player.faction===defender),'目标不是此林地的敌人');
  if(p.faction==='vagabond'&&ally===undefined){
    const allies=s.players.filter(player=>player.faction!==defender&&s.vagabond.relations[player.faction]===3&&c.warriors[player.faction]>0);
    if(allies.length){ask(s,'battle-ally',p,'是否与盟友士兵共同战斗？',[pass('独自战斗'),...allies.map(player=>({id:player.faction,label:player.name,value:player.faction}))],{clearing:c.id,defender});return;}
  }
  s.combat={id:`battle-${++s.battleSequence}`,attacker:p.faction,defender,ally:ally||null,allyRemoved:0,itemHits:0,clearing:c.id,rolls:null,used:[],passed:[],extraAttacker:0,extraDefender:0,despotScored:false};
  emitPresentation(s,{kind:'battle',playerId:p.id,faction:p.faction,clearing:c.id});
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
          if(!ownerOf(s,'bird')){finishFactionSetup(s,rng);break;}
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
      case 'craft-phase': s.phase=['cat','bird'].includes(p.faction)?'craft':'daylight'; break;
      case 'cobbler': {
        const options=moveOptions(s,p.faction);
        if (crafted(p,'cobbler') && options.length) ask(s,'free-move',p,'是否使用鞋匠移动一次？',[pass('跳过'),...options.map(a => ({id:`${a.from}-${a.to}-${a.count}`,label:`${a.from} → ${a.to}，${a.count} 名士兵`,value:a}))]);
        break;
      }
      case 'evening-score': {
        if(p.faction==='lizard'){s.phase='lizard-craft';break;}
        if(p.faction==='alliance'){s.phase='military';s.alliance.operations=s.alliance.officers;s.alliance.operationsUsed=0;break;}
        if(p.faction==='vagabond'){vagabondEvening(s,rng);break;}
        if (p.faction==='bird') score(s,'bird',roostScore[buildingCount(s,'bird','roost')],buildingCount(s,'bird','roost')+'个鸟巢');
        if (s.winner) break;
        const n=buildingCount(s,p.faction,p.faction==='cat'?'recruiter':'roost');
        draw(s,p,1+(n>=3?1:0)+(n>=(p.faction==='cat'?5:6)?1:0),rng);
        s.phase='discard';
        if (p.hand.length<=5) finishEvening(s,rng);
        break;
      }
      case 'hospital': hospital(s,data.count,data.suit); break;
      case 'draw': draw(s,ownerOf(s,data.faction),data.count,rng); break;
      case 'ambush-discard': putDiscard(s,b.ambushCard); delete b.ambushCard; break;
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
        b.attackerRolled=Math.min(b.rolls[b.defender==='alliance'?1:0],battleStrength(s,c,b.attacker)); b.defenderRolled=Math.min(b.rolls[b.defender==='alliance'?0:1],battleStrength(s,c,b.defender));
        b.extraAttacker=(battleStrength(s,c,b.defender)===0?1:0)+(b.attacker==='bird' && s.bird.leader==='commander'?1:0);
        s.randomEvents.push({type:'battle-dice',battleId:b.id,values:[...b.rolls]});emitPresentation(s,{kind:'dice',faction:b.attacker,clearing:b.clearing,values:b.rolls}); record(s,`服务器战斗骰子 ${b.rolls.join(' / ')}；攻击方战力上限 ${battleStrength(s,c,b.attacker)}，防守方战力上限 ${battleStrength(s,c,b.defender)}${b.defender==='alliance'?'；游击战交换高低骰':''}${battleStrength(s,c,b.defender)===0?'；无人防守，攻击方额外命中 +1':''}${b.attacker==='bird'&&s.bird.leader==='commander'?'；指挥者额外命中 +1':''}`);
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
        if (!b.ended) {
          const attackHits=(b.ignoreDefender?0:b.attackerRolled)+b.extraAttacker;
          const defendHits=(b.ignoreAttacker?0:b.defenderRolled)+b.extraDefender;
          record(s,`战斗结算：${ownerOf(s,b.attacker).name} 骰子命中 ${b.attackerRolled}${b.ignoreDefender?'（被防护抵消）':''} + 额外 ${b.extraAttacker} = ${attackHits}；${ownerOf(s,b.defender).name} 骰子命中 ${b.defenderRolled}${b.ignoreAttacker?'（被防护抵消）':''} + 额外 ${b.extraDefender} = ${defendHits}`);
          damage(s,[{faction:b.defender,by:b.attacker,hits:attackHits},{faction:b.attacker,by:b.defender,hits:defendHits}]);
        }
        break;
      case 'cardboard': {
        const pieces=cardboard(s,data.faction);
        const c=areaOf(s,b.clearing);
        const total=c.buildings.filter(piece=>piece.faction===data.faction).length+(data.faction==='cat'?Number(c.keep)+c.wood:data.faction==='alliance'?Number(c.sympathy):0);
        if(pieces.length && data.hits>0 && (pieces.length===1 || data.hits>=total)) {
          removeCardboard(s,data.faction,pieces[0],data.by);
          if(data.hits>1)front(s,[frame('cardboard',{...data,hits:data.hits-1})]);
        } else if (pieces.length && data.hits>0) ask(s,'cardboard',ownerOf(s,data.faction),'选择承受命中的建筑或标记',pieces.map(type => ({id:type,label:`移除${LABELS[type]}`,value:type})),data);
        break;
      }
      case 'battle-finish': if(b.ally&&b.allyRemoved>b.itemHits)s.vagabond.relations[b.ally]=-1; s.combat=null; break;
      default: if(!pumpLizardEffect(s,kind,data,rng))pumpFactionEffect(s,kind,data,rng); break;
    }
  }
  if (s.winner) { if (s.combat?.ambushCard) putDiscard(s,s.combat.ambushCard); s.effects.frames=[]; s.combat=null; }
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
    case 'setup-leader': leader(s,value); finishFactionSetup(s,rng); break;
    case 'free-battle': if (value) startBattle(s,p,areaOf(s,value.clearing)); break;
    case 'free-move': if (value) { move(s,p,value); const card=crafted(p,'cobbler');if(card)s.usedEffects.push(card.id); } break;
    case 'hospital':
      if (value) { ensure(s.board.some(c => c.keep),'城堡已被移除'); const card=discard(s,p,value); ensure(matches(card,resume.suit),'医院需要匹配花色'); s.board.find(c => c.keep).warriors.cat+=resume.count; }
      break;
    case 'ambush':
      if (value) {
        b.ambushCard=takeHand(s,p,value);
        record(s,`${p.name} 打出${b.ambushCard.name}（${LABELS[b.ambushCard.suit]}）`);
        const attacker=ownerOf(s,b.attacker),suit=areaOf(s,b.clearing).suit;
        const cards=attacker.hand.filter(card => card.kind==='ambush' && matches(card,suit));
        if(!cards.length){front(s,[frame('ambush-hits')]);break;}
        ask(s,'counter-ambush',attacker,'是否抵消伏击？',[pass('不抵消伏击'),...cards.map(card => ({id:card.id,label:`打出${card.name}`,value:card.id}))]);
      }
      break;
    case 'counter-ambush': if (value) { discard(s,p,value); putDiscard(s,b.ambushCard); delete b.ambushCard; } else front(s,[frame('ambush-hits')]); break;
    case 'battle-order': front(s,[frame('battle-effects',{faction:value})]); break;
    case 'battle-effects':
      if (!value) b.passed.push(p.faction);
      else {
        const card=p.crafted.find(card => card.id===value); ensure(card,'持续牌失效'); b.used.push(card.id);
        if (card.kind==='armorers') { discardCrafted(s,p,value); if (p.faction===b.attacker) b.ignoreAttacker=true; else b.ignoreDefender=true; }
        if (card.kind==='sappers') { discardCrafted(s,p,value); b.extraDefender++; }
        if (card.kind==='brutal') { b.extraAttacker++; score(s,b.defender,1,'残暴战术补偿'); }
      }
      front(s,[frame('battle-window')]); break;
    case 'cardboard': removeCardboard(s,p.faction,value,resume.by); if (resume.hits>1) front(s,[frame('cardboard',{...resume,hits:resume.hits-1})]); break;
    default: if(!answerLizardChoice(s,p,kind,value,rng))answerFactionChoice(s,p,kind,value,resume,rng); break;
  }
  pump(s,rng);
}
function craftingPayment(s,p,definition,requested) {
  if(p.faction==='lizard')return payCrafting(s,p,definition,requested,lizardCraftingPieces(s));
  if(p.faction==='alliance')return payCrafting(s,p,definition,requested,s.board.filter(c=>c.sympathy).map(c=>({id:`sympathy-${c.id}`,suit:c.suit})));
  if(p.faction==='vagabond')return payCrafting(s,p,definition,requested,s.vagabond.items.filter(item=>item.type==='hammer'&&!item.exhausted&&!item.damaged).map(item=>({id:item.id,suit:s.board.find(c=>c.id===s.vagabond.position)?.suit})));
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
  return (s.phase==='craft'||(p.faction==='lizard'&&s.phase==='lizard-craft')||(['alliance','vagabond'].includes(p.faction)&&s.phase==='daylight')) && def && def.cost && (!def.item || s.itemSupply[def.item]>0) && (def.item || def.kind==='favor' || !crafted(p,def.kind)) && craftingPayment(s,p,def)!==null;
}
function craft(s,p,a) {
  const card=p.hand.find(card => card.id===a.card); ensure(card && canCraft(s,p,card),'当前不能锻造此牌');
  ensure(a.pieces===undefined || (Array.isArray(a.pieces) && a.pieces.every(id => typeof id==='string')),'锻造点编号格式无效');
  const def=definitions.get(card.archetype),payment=craftingPayment(s,p,def,a.pieces);
  ensure(payment,'锻造点支付无效'); if(p.faction==='vagabond')payment.forEach(id=>exhaustItem(s,id)); else s.craftingUsed.push(...payment);
  const index=p.hand.findIndex(c => c.id===card.id); p.hand.splice(index,1);
  if (def.item) { s.itemSupply[def.item]--; if(p.faction==='vagabond')gainItem(s,def.item,'crafted');else p.items.push(def.item); putDiscard(s,card); score(s,p.faction,p.faction==='bird' && s.bird.leader!=='builder'?1:def.points,'锻造'+card.name); }
  else if (def.kind==='favor') {
    putDiscard(s,card);
    for(const c of s.board.filter(c=>c.suit===def.suit))removeAllEnemies(s,c,p.faction);

  } else p.crafted.push(card);
  emitPresentation(s,{kind:'craft',playerId:p.id,faction:p.faction,reason:card.name});
  record(s,`${p.name} 锻造${card.name}`);
}
export function createGame(players,rng=randomInt) {
  ensure(players.length>=2&&players.length<=4&&new Set(players.map(p=>p.faction)).size===players.length&&players.every(p=>['cat','bird','alliance','vagabond','lizard'].includes(p.faction)),'基础局需要二至四人，各阵营限一人');
  players=shuffle([...players],rng);
  const s={ruleset:RULESET,stateSchemaVersion:6,round:1,turn:rng(players.length),turnsCompleted:0,phase:'setup',winner:null,actions:3,march:0,recruited:false,
    setup:{complete:false,catCorner:null,birdCorner:null,buildings:0},effects:createQueue(),combat:null,battleSequence:0,randomEvents:[],craftingUsed:[],usedEffects:[],privateReveal:null,
    players:players.map(p => ({id:p.userId,name:p.name,faction:p.faction,score:0,hand:[],crafted:[],items:[]})),
    board:map.nodes.filter(c => c.node_type==='clearing').map(c => ({id:c.id,name:`秋林 ${c.id}`,suit:c.suit,x:positions[c.id][0],y:positions[c.id][1],slots:c.building_slots,ruins:c.ruin?1:0,links:[...c.paths],riverLinks:[...c.river_neighbors],warriors:{cat:0,bird:0,alliance:0,lizard:0},buildings:[],wood:0,keep:false,sympathy:false})),
    deck:shuffle(catalog.cards.flatMap(def => Array.from({length:def.count},(_,i) => ({id:`${def.type}-${i}`,archetype:def.type,name:def.name,suit:def.suit,kind:def.kind,effectImplemented:true}))),rng),discard:[],itemSupply:{...catalog.item_supply},mapId:map.map_id,
    bird:{leader:null,used:[],decree:Object.fromEntries(columns.map(column=>[column,[]])),remaining:{},added:0,addedBird:false},log:[]};
  initializeFactions(s,rng);
  s.players.forEach(p => draw(s,p,3,rng));
  const corners=map.nodes.filter(c=>c.starting).map(c=>({id:String(c.id),label:`秋林 ${c.id}`,value:c.id}));
  if(ownerOf(s,'cat'))ask(s,'setup-keep',ownerOf(s,'cat'),'选择猫咪贵族城堡所在角落',corners);
  else if(ownerOf(s,'bird'))ask(s,'setup-bird-corner',ownerOf(s,'bird'),'选择飞鹰起始角落',corners);
  else{finishFactionSetup(s,rng);pump(s,rng);}
  return s;
}
function execute(s,p,a,rng) {
  if(a.type==='evening-continue'){ensure(s.phase==='evening','当前不能继续夜晚');front(s,[frame('evening-score')]);return;}
  if(a.type==='evening-end'){ensure(s.phase==='evening-end','请先完成夜晚步骤');nextTurn(s,rng);return;}
  if(a.type==='move'&&a.cobbler){const card=availableCobbler(s,p);ensure(card,'补鞋匠只能在夜晚使用一次');move(s,p,a);s.usedEffects.push(card.id);record(s,`${p.name} 使用补鞋匠额外移动`);return;}

  if(p.faction==='lizard'&&executeLizard(s,p,a,rng))return;
  if (a.type==='birdsong-end') {
    ensure(s.phase==='birdsong','当前不在清晨');
    if(p.faction==='alliance'){s.phase='revolt';return;}
    if(p.faction==='vagabond'){s.phase='refresh';return;}
    if (p.faction==='bird') { if (!p.hand.length) draw(s,p,1,rng); s.phase='decree-add'; }
    else { s.woodPending=s.board.flatMap(c => c.buildings.filter(b => b.faction==='cat' && b.type==='sawmill').map(() => c.id)); s.phase='wood'; if (!s.woodPending.length || woodCount(s)===8) daylight(s); else if(s.woodPending.length<=8-woodCount(s)){for(const id of s.woodPending)areaOf(s,id).wood++;s.woodPending=[];daylight(s);} }
    return;
  }
  if (a.type==='wood') {
    ensure(s.phase==='wood','当前不能生产木材'); const i=s.woodPending.indexOf(a.clearing);
    ensure(i>=0 && woodCount(s)<8,'锯木厂或木材供应无效'); areaOf(s,a.clearing).wood++; record(s,`${p.name} 在${areaOf(s,a.clearing).name}生产 1 枚木材`); s.woodPending.splice(i,1);
    if (!s.woodPending.length || woodCount(s)===8) daylight(s); return;
  }
  if (a.type==='decree-add') {
    ensure(p.faction==='bird' && s.phase==='decree-add' && s.bird.added<2 && columns.includes(a.column),'当前不能添加法令');
    const card=takeHand(s,p,a.card); ensure(card.suit!=='wild' || !s.bird.addedBird,'每回合最多添加一张鸟牌');
    s.bird.decree[a.column].push(card); record(s,`${p.name} 将${card.name}（${LABELS[card.suit]}）加入${{recruit:'招募',move:'移动',battle:'战斗',build:'建造'}[a.column]}法令`); s.bird.added++; if (card.suit==='wild') s.bird.addedBird=true; return;
  }
  if (a.type==='decree-ready') {
    ensure(p.faction==='bird' && s.phase==='decree-add' && s.bird.added>=1,'先加入至少一张法令');
    if (buildingCount(s,'bird','roost')===0) {
      s.phase='new-roost';
      if (!s.board.some(c => !c.keep && freeSlots(c)>0)) daylight(s);
    } else daylight(s); return;
  }
  if (a.type==='new-roost') {
    ensure(s.phase==='new-roost' && p.faction==='bird','当前不需要恢复鸟巢');
    const eligible=s.board.filter(c => !c.keep && freeSlots(c)>0),min=Math.min(...eligible.map(c => Object.values(c.warriors).reduce((sum,count)=>sum+count,0)));
    const c=areaOf(s,a.clearing); ensure(eligible.includes(c) && Object.values(c.warriors).reduce((sum,count)=>sum+count,0)===min,'必须选择可放置且士兵最少的林地');
    c.buildings.push({faction:'bird',type:'roost'}); const reinforcements=Math.min(3,reserve(s,'bird')); c.warriors.bird+=reinforcements; record(s,`${p.name} 在${c.name}恢复鸟巢并放置 ${reinforcements} 名士兵`); daylight(s); return;
  }
  if (a.type==='craft') { craft(s,p,a); return; }
  if (a.type==='craft-done') { ensure(s.phase==='craft','当前不在锻造阶段'); if (p.faction==='cat') s.phase='daylight'; else { s.bird.remaining=structuredClone(s.bird.decree); s.phase='decree'; } return; }
  if (a.type==='leader') { ensure(s.phase==='leader' && p.faction==='bird' && !s.bird.used.includes(a.leader),'不能选择此领袖'); leader(s,a.leader); evening(s); return; }
  if (a.type==='discard') { ensure(s.phase==='discard' && p.hand.length>5,'当前不需要弃牌'); discard(s,p,a.card); if (p.hand.length===5) finishDiscard(s,rng); return; }
  if (a.type==='effect') { useEffect(s,p,a,rng); return; }
  if (a.type==='march-end') { ensure(p.faction==='cat' && s.phase==='daylight' && s.march>0,'没有进行中的行军'); s.march=0; return; }
  if (a.type==='extra') { ensure(p.faction==='cat' && s.phase==='daylight' && !s.march,'当前不能增加行动'); const card=discard(s,p,a.card); ensure(card.suit==='wild','必须花费鸟牌'); s.actions++; return; }
  if(p.faction==='alliance'&&executeAlliance(s,p,a,rng))return;
  if(p.faction==='vagabond'&&executeVagabond(s,p,a,rng))return;
  if(executeDominance(s,p,a))return;
  if (a.type==='end') { ensure(!s.march && ((p.faction==='cat' && s.phase==='daylight') || (p.faction==='bird' && s.phase==='decree' && !activeColumn(s))),'本阶段尚未完成'); evening(s); return; }
  ensure(['move','recruit','build','overwork','battle'].includes(a.type),'未知行动');
  ensure(s.phase===(p.faction==='cat'?'daylight':'decree'),'当前阶段不能行动');
  if (p.faction==='cat') {
    if (a.type==='move' && s.march) s.march=0;
    else { ensure(!s.march && s.actions>0,'行动不足或行军尚未结束'); s.actions--; if (a.type==='move') s.march=1; }
  } else {
    const col=activeColumn(s); ensure(col===a.type,'按法令列顺序执行');
    const i=s.bird.remaining[col].findIndex(card => card.id===a.decreeCard); ensure(i>=0,'选择待执行的法令');
    const c=areaOf(s,a.type==='move'?a.from:a.clearing); ensure(matches(s.bird.remaining[col][i],c.suit),'法令花色不符'); s.bird.remaining[col].splice(i,1);
  }
  if (a.type==='move') move(s,p,a);
  if (a.type==='battle') { const c=areaOf(s,a.clearing); ensure(c.warriors[p.faction]>0 && hasEnemy(s,c,p.faction),'此处不能战斗'); startBattle(s,p,c,a.defender); }
  if (a.type==='overwork') { ensure(p.faction==='cat','此阵营不能过劳'); const c=areaOf(s,a.clearing); ensure(c.buildings.some(b => b.faction==='cat' && b.type==='sawmill') && woodCount(s)<8,'没有锯木厂或木材供应'); const card=discard(s,p,a.card); ensure(matches(card,c.suit),'过劳牌花色不符'); c.wood++; }
  if (a.type==='recruit') {
    if (p.faction==='bird') { const c=areaOf(s,a.clearing),n=s.bird.leader==='charismatic'?2:1; ensure(!c.keep && c.buildings.some(b => b.faction==='bird' && b.type==='roost') && reserve(s,'bird')>=n,'不能完全完成招募'); c.warriors.bird+=n; record(s,`${p.name} 在${c.name}招募 ${n} 名士兵`); }
    else {
      const n=Math.min(buildingCount(s,'cat','recruiter'),reserve(s,'cat'));
      ensure(!s.recruited && n>0 && Array.isArray(a.clearings) && a.clearings.length===n,'招募数量无效或本回合已招募');
      const usage={}; for (const id of a.clearings) { const c=areaOf(s,id); usage[id]=(usage[id]||0)+1; ensure(usage[id]<=c.buildings.filter(b => b.faction==='cat' && b.type==='recruiter').length,'征兵所容量不足'); c.warriors.cat++; } s.recruited=true; record(s,`${p.name} 招募 ${n} 名士兵，领地 ${a.clearings.map(id=>areaOf(s,id).name).join('、')}`);
    }
  }
  if (a.type==='build') {
    const c=areaOf(s,a.clearing); ensure(ruler(c)===p.faction && freeSlots(c)>0,'需要统治且有空建筑位');
    if (p.faction==='bird') { ensure(!c.keep && !c.buildings.some(b => b.type==='roost') && buildingCount(s,'bird','roost')<7,'不能放置鸟巢'); c.buildings.push({faction:'bird',type:'roost'}); }
    else {
      ensure(Object.hasOwn(buildingScore,a.building),'建筑类型无效'); const n=buildingCount(s,'cat',a.building),cost=buildingCost[n],network=connectedWood(s,c.id);
      ensure(n<6 && Array.isArray(a.wood) && a.wood.length===cost,'建筑供应或木材数量无效');
      for (const id of a.wood) { const source=areaOf(s,id); ensure(network.includes(id) && source.wood>0,'木材必须经己方统治的道路连通'); source.wood--; }
      c.buildings.push({faction:'cat',type:a.building}); score(s,'cat',buildingScore[a.building][n],'建造'+LABELS[a.building]);
    }
    record(s,`${p.name} 在${c.name}建造${LABELS[p.faction==='bird'?'roost':a.building]}${p.faction==='cat'?'，消耗 '+a.wood.length+' 枚木材':''}`);
  }
}
function useEffect(s,p,a,rng) {
  ensure(!s.march,'先结束行军'); const card=p.crafted.find(card => card.id===a.card); ensure(card,'持续牌不存在');
  const targets=s.players.filter(player=>player.id!==p.id);
  const enemy=targets.find(player=>player.faction===a.target)||(targets.length===1?targets[0]:null);
  if (card.kind==='royalclaim' || card.kind==='standdeliver') {
    ensure(s.phase==='birdsong','此牌在清晨使用');
    if (card.kind==='royalclaim') { discardCrafted(s,p,card.id); score(s,p.faction,s.board.filter(c => ruler(c)===p.faction).length,'王室宣言'); }
    else { ensure(enemy,'请选择目标阵营');ensure(!s.usedEffects.includes(card.id) && enemy.hand.length>0,'本回合已使用或对方没有手牌'); s.usedEffects.push(card.id); const i=rng(enemy.hand.length); p.hand.push(enemy.hand.splice(i,1)[0]); score(s,enemy.faction,1,'持续效果补偿'); }
    return;
  }
  ensure(['craft','daylight','decree'].includes(s.phase),'此牌在白昼使用');
  ensure(!s.usedEffects.includes(card.id),'本回合已经使用');
  if (card.kind==='codebreakers') { ensure(enemy,'请选择目标阵营');s.privateReveal={viewer:p.id,owner:enemy.id,cards:structuredClone(enemy.hand)}; s.usedEffects.push(card.id); return; }
  if (card.kind==='tax') { const c=areaOf(s,a.clearing); ensure(c.warriors[p.faction]>0,'此处没有己方士兵'); c.warriors[p.faction]--; s.usedEffects.push(card.id); front(s,[...(p.faction==='cat'?[frame('hospital',{count:1,suit:c.suit})]:[]),frame('draw',{faction:p.faction,count:1})]); return; }
  throw new RuleError('此牌通过其触发时机使用');
}
export function applyAction(source,userId,a,rng=randomInt) {
  ensure(a && typeof a==='object' && !Array.isArray(a),'行动格式无效'); ensure(!source.winner,'对局已结束');
  const s=structuredClone(source),p=s.players.find(p => p.id===userId); ensure(p,'你不在本局中');
  if (s.effects.frames[0]?.type==='choice') { ensure(a.type==='choice','等待当前选择完成'); answer(s,userId,a,rng); }
  else { ensure(s.setup.complete && current(s).id===userId,'等待当前玩家行动'); execute(s,p,a,rng);
    const actionNames={refresh:'恢复物品',repair:'修复物品',slip:'潜行',special:({thief:'偷窃',tinker:'劳作',ranger:'隐藏'})[s.vagabond.character],quest:'完成任务',aid:'援助',strike:'弩击',extra:'花费 1 张飞鸟牌增加行动',overwork:'加班生产 1 枚木材',discard:'弃置 1 张手牌',effect:'使用持续效果',dominance:'激活统治牌', 'drop-item':'丢弃超重物品'};
    if(a.type==='aid')emitPresentation(s,{kind:'aid',playerId:p.id,faction:p.faction,target:a.target,count:1});
    if(actionNames[a.type])record(s,`${p.name} ${actionNames[a.type]}${a.to!==undefined?'，前往 '+(a.to>=12?'森林 ':'秋林 ')+a.to:a.clearing!==undefined?'，地点 '+areaOf(s,a.clearing).name:''}${a.type==='aid'?'，向 '+ownerOf(s,a.target).name+' 交付 1 张牌':''}`);
    pump(s,rng); }
  normalizeItems(s);
  if (!s.winner && !s.deck.length && s.discard.length) s.deck=shuffle(s.discard.splice(0),rng);
  finishPresentation(source,s);
  return s;
}
export function projectGame(state,userId) {
  const s=structuredClone(state); delete s.deck; delete s.effects; delete s.randomEvents; delete s.privateReveal; delete s.questDeck; delete s.vagabond.ruinItems; delete s.privateOutrage;
  s.deckCount=state.deck.length;
  s.alliance.supporterCount=state.alliance.supporters.length;
  s.factionScoreTracks={bird:[...roostScore],alliance:expansion.sympathyTrack.map(space=>({cost:space.cost,points:space.points}))};
  s.catBuildingTracks=Object.entries(buildingScore).map(([type,points])=>({type,built:buildingCount(state,'cat',type),spaces:points.map((score,index)=>({wood:buildingCost[index],points:score}))}));
  if(ownerOf(state,'alliance')?.id!==userId)delete s.alliance.supporters;
  s.board.forEach(area=>{area.vagabond=state.vagabond.position===area.id;area.ruler=ruler(area);});
  if(state.privateOutrage?.viewer===userId)s.outrageReveal=structuredClone(state.privateOutrage);
  if(state.lizard)s.lizard.gardenTracks=LIZARD_SUITS.map(suit=>({suit,built:gardenCount(state,suit),points:[...GARDEN_POINTS],drawBonus:gardenCount(state,suit)>=2?1:0}));
  s.factionActions=[...factionActionOptions(state,userId),...lizardActionOptions(state,userId)];
  s.mapActions=mapActionOptions(state,userId);
  s.factionNames=LABELS;
  s.players=s.players.map(p => { p.handCount=p.hand.length; if (p.id!==userId) delete p.hand; return p; });
  s.choice=projectChoice(state.effects,userId); s.pending=null;
  s.combat=state.combat?{clearing:state.combat.clearing,attacker:state.combat.attacker,defender:state.combat.defender,rolls:state.combat.rolls}:null;
  s.currentDecreeColumn=activeColumn(state)||null; s.leaders=Object.keys(leaders).filter(name => !state.bird.used.includes(name)); s.limitations=LIMITATIONS;
  const p=state.players.find(p => p.id===userId),active=p && current(state).id===userId && state.setup.complete && !s.choice && !state.winner;
  s.craftOptions=active?p.hand.filter(card => canCraft(state,p,card)).map(card => ({card:card.id,name:card.name,cost:definitions.get(card.archetype).cost})):[];
  s.effectOptions=active?p.crafted.filter(card => !state.usedEffects.includes(card.id) && ((state.phase==='birdsong' && ['royalclaim','standdeliver'].includes(card.kind)) || (['craft','daylight','decree'].includes(state.phase) && ['tax','codebreakers'].includes(card.kind)))).map(card => ({card:card.id,name:card.name,clearing:card.kind==='tax',target:['codebreakers','standdeliver'].includes(card.kind)})):[];
  if(active)for(const effect of s.effectOptions.filter(effect=>effect.clearing))for(const area of state.board.filter(area=>area.warriors[p.faction]>0))s.mapActions.push({type:'effect',card:effect.card,clearing:area.id});
  if (state.privateReveal?.viewer===userId) s.revealedHand=structuredClone(state.privateReveal);
  s.nightCobbler=!!(active&&availableCobbler(state,p));
  if(s.nightCobbler){const options=cobblerOptions(state,p);s.factionActions=[...(s.factionActions||[]),...options];s.mapActions=[...(s.mapActions||[]),...options.map(option=>option.action)];}
  return s;
}

export function ruler(clearing) {
  if(clearing.buildings.some(building=>building.faction==='lizard'&&building.type.startsWith('garden-')))return 'lizard';
  const strengths = Object.entries(clearing.warriors).map(([faction, count]) => ({
    faction, count: count + clearing.buildings.filter(building => building.faction === faction).length,
  }));
  const maximum = Math.max(...strengths.map(entry => entry.count));
  if (!maximum) return null;
  const tied = strengths.filter(entry => entry.count === maximum);
  if (tied.some(entry => entry.faction === 'bird')) return 'bird';
  return tied.length === 1 ? tied[0].faction : null;
}

function coalitionPartners(s, first, second) {
  const vagabond = ownerOf(s, 'vagabond');
  return Boolean(vagabond?.coalition && ((first === 'vagabond' && second === vagabond.coalition)
    || (second === 'vagabond' && first === vagabond.coalition)));
}

function present(s, clearing, faction) {
  if (faction === 'vagabond') return s.vagabond.position === clearing.id;
  return clearing.warriors[faction] > 0 || clearing.buildings.some(building => building.faction === faction)
    || (faction === 'cat' && (clearing.keep || clearing.wood > 0))
    || (faction === 'alliance' && clearing.sympathy);
}

function finishGame(s, player) {
  s.winner = player.id;
  s.winners = [player.id, ...s.players.filter(other => other.coalition === player.faction).map(other => other.id)];
  s.phase = 'finished';
}

function putDiscard(s, ...cards) {
  for (const card of cards) {
    if(s.lizard){s.lizard.lostSouls.push(card);continue;}
    if (card.kind === 'dominance') s.dominanceAvailable.push(card);
    else s.discard.push(card);
  }
}

function takeHand(s, player, id) {
  const index = player.hand.findIndex(card => card.id === id);
  ensure(index >= 0, '这张牌不在手中');
  return player.hand.splice(index, 1)[0];
}

function initializeFactions(s, rng) {
  if(ownerOf(s,'lizard'))s.lizard={acolytes:0,lostSouls:[],revealed:[],outcast:null,hated:false,scoredSuits:[]};
  s.alliance = { supporters: [], officers: 0, operations: 0, operationsUsed: 0 };
  s.vagabond = { character: null, position: null, items: [], nextItem: 0, removedItems: [],
    refreshLeft: 0, relations: {}, aidCounts: {}, completedQuests: [], ruinItems: {} };
  s.dominanceAvailable = [];
  if (s.players.length >= 3) {
    s.deck.push(...['fox', 'rabbit', 'mouse', 'wild'].map(suit => ({ id: `dominance-${suit}`,
      archetype: `Dominance${suit === 'wild' ? 'Bird' : suit[0].toUpperCase()+suit.slice(1)}`,
      name: `${LABELS[suit]}统治`, suit, kind: 'dominance' })));
    s.deck = shuffle(s.deck, rng);
  }
  s.questDeck = ownerOf(s, 'vagabond') ? shuffle(structuredClone(expansion.quests), rng) : [];
  s.quests = s.questDeck.splice(0, 3);
  if (ownerOf(s, 'vagabond')) {
    const items = shuffle(['bag', 'boot', 'hammer', 'sword'], rng);
    s.board.filter(clearing => clearing.ruins).forEach(clearing => { s.vagabond.ruinItems[clearing.id] = items.pop(); });
    for (const player of s.players.filter(player => player.faction !== 'vagabond')) s.vagabond.relations[player.faction] = 0;
  }
}

function finishFactionSetup(s, rng) {
  if(s.lizard&&!s.setup.lizardComplete){beginLizardSetup(s);return;}
  const alliance = ownerOf(s, 'alliance');
  if (alliance) {
    for (let index = 0; index < 3; index++) gainSupporter(s, drawCard(s, rng));
  }
  const vagabond = ownerOf(s, 'vagabond');
  if (vagabond) {
    const names = { thief: '盗贼', tinker: '工匠', ranger: '猎人' };
    ask(s, 'setup-character', vagabond, '选择游侠角色', Object.keys(characters).map(id => ({ id, label: names[id], value: id })));
  } else front(s, [frame('start')]);
}

function drawCard(s, rng) {
  const holder = { hand: [] };
  draw(s, holder, 1, rng);
  return holder.hand[0] || null;
}

function gainSupporter(s, card) {
  if (!card) return false;
  if (!buildingCount(s, 'alliance', 'base-fox') && !buildingCount(s, 'alliance', 'base-rabbit')
      && !buildingCount(s, 'alliance', 'base-mouse') && s.alliance.supporters.length >= 5) { putDiscard(s, card); record(s,'联盟没有基地且支持者已达5张，新增支持者依规则弃置'); }
  else { s.alliance.supporters.push(card);emitPresentation(s,{kind:'supporter',faction:'alliance',count:1});return true; }
  return false;
}

function hasBase(s) {
  return s.board.some(clearing => clearing.buildings.some(building => building.faction === 'alliance'));
}

function spendSupporters(s, suit, count, requested) {
  ensure(requested===undefined||(Array.isArray(requested)&&requested.every(id=>typeof id==='string')), '支持者选择格式无效');
  const available = s.alliance.supporters.filter(card => matches(card, suit))
    .sort((a, b) => Number(a.suit === 'wild') - Number(b.suit === 'wild'));
  const cards = requested === undefined ? available.slice(0, count)
    : requested.map(id => s.alliance.supporters.find(card => card.id === id));
  ensure(Array.isArray(cards) && cards.length === count && new Set(cards).size === count
    && cards.every(card => card && matches(card, suit)), '支持者数量或花色不符合要求');
  for (const card of cards) {
    s.alliance.supporters.splice(s.alliance.supporters.indexOf(card), 1);
    putDiscard(s, card);
  }
}

function sympathyCount(s) { return s.board.filter(clearing => clearing.sympathy).length; }

function sympathyCost(s, clearing) {
  const track = expansion.sympathyTrack[sympathyCount(s)];
  if (!track) return Infinity;
  const martial = s.players.some(player => player.faction !== 'alliance' && (clearing.warriors[player.faction] || 0) >= 3);
  return track.cost + Number(martial);
}

function canPlaceSympathy(s, clearing, spread) {
  return !clearing.sympathy && !clearing.keep && sympathyCount(s) < 10
    && (!spread || sympathyCount(s) === 0 || clearing.links.some(id => areaOf(s, id).sympathy));
}

function placeSympathy(s, clearing) {
  const track = expansion.sympathyTrack[sympathyCount(s)];
  clearing.sympathy = true;
  score(s, 'alliance', track.points,'放置民意');
}

function removeAllEnemies(s, clearing, by) {
  let cats = 0;
  for (const player of enemiesOf(s, by)) {
    const faction = player.faction;
    if (faction === 'vagabond') {
      if (s.vagabond.position === clearing.id) front(s, [frame('vagabond-damage', { hits: 3, by })]);
      continue;
    }
    const removed = clearing.warriors[faction];
    clearing.warriors[faction] = 0;
    removedWarriors(s, by, faction, removed, false);
    if (faction === 'cat') cats = removed;
    for (const type of cardboard(s, faction, clearing)) {
      while (cardboard(s, faction, clearing).includes(type)) removeCardboard(s, faction, type, by, clearing);
    }
  }
  if (cats) front(s, [frame('hospital', { count: cats, suit: clearing.suit })]);
}

function executeAlliance(s, p, a, rng) {
  if (a.type === 'revolt-done') {
    ensure(s.phase === 'revolt', '当前不在起义阶段'); s.phase = 'spread'; return true;
  }
  if (a.type === 'spread-done') {
    ensure(s.phase === 'spread', '当前不在传播民意阶段'); daylight(s); return true;
  }
  if (a.type === 'revolt') {
    ensure(s.phase === 'revolt', '必须先起义，再传播民意');
    const clearing = areaOf(s, a.clearing);
    ensure(clearing.sympathy && !clearing.keep && clearing.slots > clearing.ruins
      && !s.board.some(other => other.buildings.some(building => building.type === 'base-'+clearing.suit)), '无法在此林地放置对应基地');
    spendSupporters(s, clearing.suit, 2, a.cards);
    removeAllEnemies(s, clearing, 'alliance');
    clearing.buildings.push({ faction: 'alliance', type: 'base-'+clearing.suit });
    const count = s.board.filter(other => other.sympathy && other.suit === clearing.suit).length;
    clearing.warriors.alliance += Math.min(count, reserve(s, 'alliance'));
    if (reserve(s, 'alliance') > 0) s.alliance.officers++;
    emitPresentation(s,{kind:'revolt',playerId:p.id,faction:'alliance',clearing:clearing.id});
    record(s, `${p.name} 在${clearing.name}起义，建立${LABELS[clearing.suit]}基地`);
    return true;
  }
  if (a.type === 'spread') {
    ensure(s.phase === 'spread', '当前不能传播民意');
    const clearing = areaOf(s, a.clearing);
    ensure(canPlaceSympathy(s, clearing, true), '民意必须相邻，且不能放入城堡或重复放置');
    spendSupporters(s, clearing.suit, sympathyCost(s, clearing), a.cards);
    placeSympathy(s, clearing);
    record(s, `${p.name} 在${clearing.name}传播民意`);
    return true;
  }
  if (a.type === 'mobilize') {
    ensure(s.phase === 'daylight', '动员在白昼进行');
    gainSupporter(s, takeHand(s, p, a.card)); record(s,`${p.name} 动员 1 张手牌作为支持者`); return true;
  }
  if (a.type === 'train') {
    ensure(s.phase === 'daylight' && reserve(s, 'alliance') > 0, '当前不能训练长官');
    const card = p.hand.find(card => card.id === a.card);
    ensure(card && s.board.some(clearing => clearing.buildings.some(building => building.faction === 'alliance') && matches(card, clearing.suit)), '需要匹配基地花色的手牌');
    discard(s, p, a.card); s.alliance.officers++; record(s,`${p.name} 训练 1 名长官`); return true;
  }
  if (a.type === 'end') {
    ensure(s.phase === 'daylight', '请先完成当前阶段'); evening(s); return true;
  }
  if (a.type === 'military-done') {
    ensure(s.phase === 'military', '当前不在军事行动阶段');
    draw(s, p, 1+s.board.filter(clearing => clearing.buildings.some(building => building.faction === 'alliance')).length, rng);
    s.phase = 'discard'; if (p.hand.length <= 5) finishEvening(s, rng); return true;
  }
  if (!['move', 'battle', 'recruit', 'organize'].includes(a.type)) return false;
  ensure(s.phase === 'military' && s.alliance.operations > 0, '夜晚军事行动次数不足');
  s.alliance.operations--;
  s.alliance.operationsUsed++;
  if (a.type === 'move') move(s, p, a);
  else {
    const clearing = areaOf(s, a.clearing);
    if (a.type === 'battle') {
      ensure(clearing.warriors.alliance > 0 && hasEnemy(s, clearing, 'alliance'), '此处不能战斗');
      startBattle(s, p, clearing, a.defender);
    }
    if (a.type === 'recruit') {
      ensure(!clearing.keep && clearing.buildings.some(building => building.faction === 'alliance') && reserve(s, 'alliance') > 0, '招募需要基地和士兵供应');
      clearing.warriors.alliance++; record(s,`${p.name} 在${clearing.name}招募 1 名士兵`);
    }
    if (a.type === 'organize') {
      ensure(clearing.warriors.alliance > 0 && canPlaceSympathy(s, clearing, false), '此处不能组织民意');
      clearing.warriors.alliance--; placeSympathy(s, clearing); record(s,`${p.name} 在${clearing.name}组织民意，收回 1 名士兵`);
    }
  }
  return true;
}

function payCrafting(s, p, definition, requested, pieces) {
  const available = pieces.filter(piece => p.faction === 'vagabond' || !s.craftingUsed.includes(piece.id));
  if (requested !== undefined && (!Array.isArray(requested) || new Set(requested).size !== requested.length
      || requested.length !== definition.cost.length)) return null;
  const candidates = requested ? requested.map(id => available.find(piece => piece.id === id)) : available;
  if (candidates.some(piece => !piece)) return null;
  const selected = [];
  for (const suit of [...definition.cost].sort((a, b) => Number(a === 'wild') - Number(b === 'wild'))) {
    const piece = candidates.find(piece => !selected.includes(piece.id) && piece.suit && (suit === 'wild' || piece.suit === suit));
    if (!piece) return null;
    selected.push(piece.id);
  }
  return selected;
}

function gainItem(s, type, source) {
  s.vagabond.items.push({ id: `item-${++s.vagabond.nextItem}`, type, source, exhausted: false, damaged: false, track: false });
  normalizeItems(s);
}

function normalizeItems(s) {
  for (const type of ['tea', 'coin', 'bag']) {
    let count = 0;
    for (const item of s.vagabond.items.filter(item => item.type === type)) {
      item.track = !item.exhausted && !item.damaged && count < 3;
      if (item.track) count++;
    }
  }
}

function exhaustItem(s, id) {
  const item = s.vagabond.items.find(item => item.id === id);
  ensure(item && !item.exhausted && !item.damaged, '该物品无法耗竭');
  item.exhausted = true; item.track = false;
  return item;
}

function exhaustType(s, type, count = 1, requested) {
  const items = s.vagabond.items.filter(item => item.type === type && !item.exhausted && !item.damaged);
  if (requested) {
    const chosen = items.find(item => item.id === requested);
    ensure(chosen && count === 1, '指定物品不可用'); exhaustItem(s, chosen.id); return;
  }
  ensure(items.length >= count, `需要 ${count} 个可用${type}`);
  items.slice(0, count).forEach(item => exhaustItem(s, item.id));
}

function questPayment(s, requirements) {
  const selected = [];
  for (const type of requirements) {
    const item = s.vagabond.items.find(item => item.type === type && !item.exhausted && !item.damaged && !selected.includes(item.id));
    if (!item) return null;
    selected.push(item.id);
  }
  return selected;
}

function location(s, id = s.vagabond.position) {
  const node = map.nodes.find(node => node.id === id);
  ensure(node, '地点不存在');
  return node;
}

function moveVagabond(s, a, pay, slip = false) {
  const origin = location(s), destination = location(s, a.to);
  ensure(origin.neighbors.includes(destination.id), '这两个地点不相邻');
  ensure(slip || destination.node_type === 'clearing', '只有潜行能进入森林');
  if(destination.node_type==='forest'){
    ensure(!a.ally,'士兵不能进入森林');s.vagabond.position=destination.id;return;
  }
  const clearing = areaOf(s, destination.id);
  const hostile = s.players.some(player => s.vagabond.relations[player.faction] === -1 && clearing.warriors[player.faction] > 0);
  if(!slip)exhaustType(s, 'boot', Number(pay)+Number(hostile));
  if (a.ally) {
    const from = s.board.find(clearing => clearing.id === origin.id);
    ensure(from && s.vagabond.relations[a.ally] === 3 && Number.isInteger(a.count) && a.count > 0 && a.count <= from.warriors[a.ally], '只能携带起点的盟友士兵');
    ensure(ruler(from) === a.ally || ruler(clearing) === a.ally, '盟友必须统治移动起点或终点');
    from.warriors[a.ally] -= a.count; clearing.warriors[a.ally] += a.count;
    emitPresentation(s,{kind:'move',faction:a.ally,from:from.id,to:clearing.id,count:a.count});
    if (clearing.sympathy && a.ally !== 'alliance') front(s, [frame('outrage', { faction: a.ally, clearing: clearing.id })]);
  }
  emitPresentation(s,{kind:'move',playerId:ownerOf(s,'vagabond').id,faction:'vagabond',from:origin.id,to:destination.id,count:1});
  s.vagabond.position = destination.id;
}

function vagabondMoves(s, pay, slip = false) {
  const origin = location(s);
  const boots = s.vagabond.items.filter(item => item.type === 'boot' && !item.exhausted && !item.damaged).length;
  return origin.neighbors.flatMap(id => {
    const destination = s.board.find(clearing => clearing.id === id);
    if (!destination) return slip?[{type:'slip',to:id}]:[];
    const hostile = s.players.some(player => s.vagabond.relations[player.faction] === -1 && destination.warriors[player.faction] > 0);
    if (!slip && boots < Number(pay)+Number(hostile)) return [];
    const moves = [{ type: slip?'slip':'move', from: origin.id, to: id, count: 1 }];
    const from = s.board.find(clearing => clearing.id === origin.id);
    if (from) {
      for (const player of s.players.filter(player => s.vagabond.relations[player.faction] === 3)) {
        if (ruler(from) !== player.faction && ruler(destination) !== player.faction) continue;
        for (let count = 1; count <= from.warriors[player.faction]; count++) moves.push({ type: slip?'slip':'move', to: id, ally: player.faction, count });
      }
    }
    return moves;
  });
}

function battleStrength(s, clearing, faction) {
  if (faction !== 'vagabond') return clearing.warriors[faction];
  return s.vagabond.items.filter(item => item.type === 'sword' && !item.damaged).length
    + (s.combat?.attacker === 'vagabond' && s.combat.ally ? clearing.warriors[s.combat.ally] : 0);
}

function removedWarriors(s, by, faction, count, inBattle) {
  if(count&&faction==='lizard'&&inBattle&&s.combat?.defender==='lizard'){s.lizard.acolytes+=count;record(s,`复仇：${count}名防守蜥蜴成为侍僧`);}
  if (!count || by !== 'vagabond') return;
  const wasHostile = s.vagabond.relations[faction] === -1;
  s.vagabond.relations[faction] = -1;
  if (inBattle && current(s).faction === 'vagabond') score(s, 'vagabond', wasHostile ? count : count-1,'移除敌对战士');
}

function finishDiscard(s, rng) {
  normalizeItems(s);
  if (current(s).faction === 'vagabond' && overCapacity(s)) s.phase = 'capacity';
  else finishEvening(s, rng);
}

function overCapacity(s) {
  return s.vagabond.items.filter(item => !item.track).length > 6+2*s.vagabond.items.filter(item => item.type === 'bag' && item.track).length;
}

function vagabondEvening(s, rng) {
  if (location(s).node_type === 'forest') {
    s.vagabond.items.forEach(item => { item.damaged = false; item.exhausted = false; });
  }
  normalizeItems(s);
  draw(s, current(s), 1+s.vagabond.items.filter(item => item.type === 'coin' && item.track).length, rng);
  s.phase = 'discard';
  if (current(s).hand.length <= 5) finishDiscard(s, rng);
}

function executeVagabond(s, p, a, rng) {
  if (a.type === 'refresh') {
    ensure(s.phase === 'refresh' && s.vagabond.refreshLeft > 0, '当前不能恢复物品');
    const item = s.vagabond.items.find(item => item.id === a.item);
    ensure(item?.exhausted, '该物品没有耗竭');
    item.exhausted = false; s.vagabond.refreshLeft--; normalizeItems(s); return true;
  }
  if (a.type === 'refresh-done') {
    ensure(s.phase === 'refresh', '当前不在恢复阶段'); s.phase = 'slip'; return true;
  }
  if (a.type === 'slip' || a.type === 'slip-done') {
    ensure(s.phase === 'slip', '每回合只能在清晨潜行一次');
    if (a.type === 'slip') {
      moveVagabond(s,a,false,true);
    }
    record(s,`${p.name} 进入白天`);
    s.phase='daylight-start';
    s.effects=enqueue(s.effects,[frame('commandwarren'),frame('craft-phase')]);
    return true;
  }
  if (a.type === 'drop-item') {
    ensure(s.phase === 'capacity' && overCapacity(s), '当前无需丢弃物品');
    const index = s.vagabond.items.findIndex(item => item.id === a.item && !item.track);
    ensure(index >= 0, '必须丢弃行囊或损坏区物品');
    s.vagabond.removedItems.push(s.vagabond.items.splice(index, 1)[0]);
    if (!overCapacity(s)) nextTurn(s, rng); return true;
  }
  const actions = ['move', 'battle', 'explore', 'aid', 'quest', 'strike', 'repair', 'special', 'end'];
  if (!actions.includes(a.type)) return false;
  ensure(s.phase === 'daylight', '游侠行动在白昼进行');
  if (a.type === 'end') { evening(s); return true; }
  if (a.type === 'move') { moveVagabond(s, a, true); return true; }
  const clearing = s.board.find(clearing => clearing.id === s.vagabond.position);
  if (a.type === 'repair') {
    const item = s.vagabond.items.find(item => item.id === a.item && item.damaged);
    ensure(item, '请选择损坏物品'); exhaustType(s, 'hammer'); item.damaged = false; normalizeItems(s); return true;
  }
  if (a.type === 'special' && s.vagabond.character === 'ranger') {
    exhaustType(s, 'torch');
    const damaged = s.vagabond.items.filter(item => item.damaged);
    const ids = a.items || damaged.slice(0, 3).map(item => item.id);
    ensure(Array.isArray(ids) && ids.length === Math.min(3, damaged.length) && new Set(ids).size === ids.length
      && ids.every(id => damaged.some(item => item.id === id)), '最多修复三个损坏物品');
    damaged.filter(item => ids.includes(item.id)).forEach(item => { item.damaged = false; });
    normalizeItems(s); evening(s); return true;
  }
  ensure(clearing, '该行动需要位于林地');
  if (a.type === 'battle') {
    ensure(hasEnemy(s, clearing, 'vagabond'), '此处没有敌人');
    exhaustType(s, 'sword'); startBattle(s, p, clearing, a.defender); return true;
  }
  if (a.type === 'explore') {
    ensure(clearing.ruins && s.vagabond.ruinItems[clearing.id], '此处没有可探索的废墟');
    exhaustType(s, 'torch'); gainItem(s, s.vagabond.ruinItems[clearing.id], 'ruin');
    delete s.vagabond.ruinItems[clearing.id]; clearing.ruins = 0; score(s, 'vagabond', 1,'探索废墟'); return true;
  }
  if (a.type === 'quest') {
    const index = s.quests.findIndex(quest => quest.id === a.quest);
    const quest = s.quests[index];
    ensure(quest && quest.suit === clearing.suit && ['points', 'cards'].includes(a.reward), '任务或奖励无效');
    const payment = questPayment(s, quest.items);
    ensure(payment, '缺少任务所需的两个可用物品');
    payment.forEach(id => exhaustItem(s, id));
    s.quests.splice(index, 1); s.vagabond.completedQuests.push(quest);
    if (a.reward === 'cards') draw(s, p, 2, rng);
    else score(s, 'vagabond', s.vagabond.completedQuests.filter(completed => completed.suit === quest.suit).length,'完成'+quest.name);
    if (s.questDeck.length) s.quests.push(s.questDeck.shift()); return true;
  }
  const target = s.players.find(player => player.faction === a.target && player.faction !== 'vagabond');
  if (a.type === 'aid') {
    ensure(target && present(s, clearing, target.faction), '援助目标必须有棋子在此林地');
    const card = p.hand.find(card => card.id === a.card);
    ensure(card && matches(card, clearing.suit), '援助需要匹配林地花色的手牌');
    ensure(a.takeItem === undefined || (Number.isInteger(a.takeItem) && target.items[a.takeItem]), '目标物品不存在');
    exhaustItem(s, a.item); target.hand.push(takeHand(s, p, a.card));
    if (a.takeItem !== undefined) gainItem(s, target.items.splice(a.takeItem, 1)[0], 'aid');
    const relation = s.vagabond.relations[target.faction];
    if (relation === 3) score(s, 'vagabond', 2,'援助盟友');
    else if (relation >= 0) {
      const count = (s.vagabond.aidCounts[target.faction] || 0)+1;
      s.vagabond.aidCounts[target.faction] = count;
      if (count >= relation+1) {
        s.vagabond.relations[target.faction]++;
        s.vagabond.aidCounts[target.faction] = 0;
        score(s, 'vagabond', relation+1,'援助提升关系');
      }
    }
    return true;
  }
  if (a.type === 'strike') {
    ensure(target && !coalitionPartners(s, 'vagabond', target.faction) && present(s, clearing, target.faction), '弩击目标无效');
    exhaustType(s, 'crossbow');
    if (clearing.warriors[target.faction]) {
      clearing.warriors[target.faction]--; removedWarriors(s, 'vagabond', target.faction, 1, false);
      if (target.faction === 'cat') front(s, [frame('hospital', { count: 1, suit: clearing.suit })]);
    } else removeCardboard(s, target.faction, a.piece, 'vagabond', clearing);
    return true;
  }
  if (a.type === 'special' && s.vagabond.character === 'thief') {
    ensure(target && present(s, clearing, target.faction) && target.hand.length, '偷窃目标没有手牌或不在此处');
    exhaustType(s, 'torch'); p.hand.push(target.hand.splice(rng(target.hand.length), 1)[0]); return true;
  }
  if (a.type === 'special' && s.vagabond.character === 'tinker') {
    const index = s.discard.findIndex(card => card.id === a.card);
    ensure(index >= 0 && matches(s.discard[index], clearing.suit), '弃牌花色不匹配');
    exhaustType(s, 'torch'); p.hand.push(s.discard.splice(index, 1)[0]); return true;
  }
  throw new RuleError('游侠行动无效');
}

function checkDominance(s) {
  const player = current(s);
  if (!player.dominance || player.faction === 'vagabond') return;
  const suit = player.dominance.suit;
  const won = suit === 'wild' ? Object.entries(map.opposite_corners).some(([first, second]) =>
    ruler(areaOf(s, Number(first))) === player.faction && ruler(areaOf(s, second)) === player.faction)
    : s.board.filter(clearing => clearing.suit === suit && ruler(clearing) === player.faction).length >= 3;
  if (won) finishGame(s, player);
}

function executeDominance(s, p, a) {
  if (!['dominance', 'take-dominance'].includes(a.type)) return false;
  ensure(['craft', 'daylight', 'decree'].includes(s.phase), '统治牌在白昼使用');
  if (a.type === 'take-dominance') {
    const index = s.dominanceAvailable.findIndex(card => card.id === a.dominance);
    const card = p.hand.find(card => card.id === a.card);
    ensure(index >= 0 && card && matches(card, s.dominanceAvailable[index].suit), '需要匹配统治牌花色的手牌');
    discard(s, p, a.card); p.hand.push(s.dominanceAvailable.splice(index, 1)[0]); return true;
  }
  const card = p.hand.find(card => card.id === a.card);
  ensure(card?.kind === 'dominance' && p.score >= 10 && !p.dominance && !p.coalition, '至少十分且尚未激活统治牌');
  if (p.faction === 'vagabond') {
    ensure(s.players.length >= 4, '至少四人才能结盟');
    const others = s.players.filter(other => other.faction !== 'vagabond' && !other.dominance);
    const minimum = Math.min(...others.map(other => other.score));
    const target = others.find(other => other.faction === a.target);
    ensure(target && target.score === minimum && !target.coalition, '只能与其他阵营中最低分者结盟');
    p.coalition = target.faction;
    if (s.vagabond.relations[target.faction] === -1) s.vagabond.relations[target.faction] = 0;
  }
  p.dominance = takeHand(s, p, a.card); return true;
}

function pumpFactionEffect(s, kind, data, rng) {
  if (kind === 'bank-choice') {
    ask(s, 'bank-target', current(s), '银行：选择另一名玩家共同抽牌', s.players.filter(player => player.id !== current(s).id)
      .map(player => ({ id: player.faction, label: player.name, value: player.faction })));
    return;
  }
  if (kind === 'outrage') {
    if (data.faction === 'alliance' || !ownerOf(s, 'alliance')) return;
    const payer = ownerOf(s, data.faction), suit = areaOf(s, data.clearing).suit;
    const cards = payer.hand.filter(card => matches(card, suit));
    record(s,`${payer.name} 在${areaOf(s,data.clearing).name}触发民愤`);
    emitPresentation(s,{kind:'outrage',faction:'alliance',clearing:data.clearing});
    if (cards.length) ask(s, 'outrage', payer, `民愤：交一张${LABELS[suit]}或鸟牌给联盟`, cards.map(card => ({ id: card.id, label: card.name, value: card.id })));
    else {
      s.privateOutrage = { viewer: ownerOf(s, 'alliance').id, owner: payer.id, cards: structuredClone(payer.hand) };
      const compensation=drawCard(s,rng);
      const gained=gainSupporter(s,compensation);
      record(s,compensation?`${payer.name} 无匹配手牌，联盟从牌堆抽取 1 张作为民愤补偿${gained?'，已加入支持者':'，因支持者上限弃置'}`:'牌堆与弃牌堆均为空，民愤暂无可抽取的补偿牌');
    }
    return;
  }
  if (kind === 'base-loss') {
    const removed = s.alliance.supporters.filter(card => matches(card, data.suit));
    s.alliance.supporters = s.alliance.supporters.filter(card => !removed.includes(card));
    putDiscard(s, ...removed);
    record(s,`联盟${LABELS[data.suit]}基地被移除，弃置 ${removed.length} 张对应花色及飞鸟支持者`);
    s.alliance.officers = Math.floor(s.alliance.officers/2);
    s.alliance.operations=Math.max(0,s.alliance.officers-s.alliance.operationsUsed);
    front(s, [frame('trim-supporters')]); return;
  }
  if (kind === 'trim-supporters') {
    if (!hasBase(s) && s.alliance.supporters.length > 5) ask(s, 'supporter-discard', ownerOf(s, 'alliance'), '没有基地，弃置支持者至五张',
      s.alliance.supporters.map(card => ({ id: card.id, label: `${card.name} · ${LABELS[card.suit]}`, value: card.id })));
    return;
  }
  if (kind === 'vagabond-damage') {
    const options = s.vagabond.items.filter(item => !item.damaged).map(item => ({ id: item.id, label: `损坏 ${item.type}${item.exhausted ? '（已耗竭）' : ''}`, value: item.id }));
    if (data.battle && s.combat?.ally && areaOf(s, s.combat.clearing).warriors[s.combat.ally] > 0) {
      options.push({ id: 'ally', label: `移除一名盟友${LABELS[s.combat.ally]}士兵`, value: 'ally' });
    }
    const damageCapacity=s.vagabond.items.filter(item=>!item.damaged).length+(data.battle&&s.combat?.ally?areaOf(s,s.combat.clearing).warriors[s.combat.ally]:0);
    if(data.hits>0 && options.length && (options.length===1 || data.hits>=damageCapacity))answerFactionChoice(s,ownerOf(s,'vagabond'),'vagabond-damage',options[0].value,data,rng);
    else if (data.hits > 0 && options.length) ask(s, 'vagabond-damage', ownerOf(s, 'vagabond'), '选择物品承受命中', options, data);
    else if(data.allyCats)front(s,[frame('hospital',{count:data.allyCats,suit:areaOf(s,s.combat.clearing).suit})]);
    return;
  }
  throw new RuleError('未知阵营结算步骤');
}

function answerFactionChoice(s, p, kind, value, resume, rng) {
  if(kind==='setup-bird-corner'){
    s.setup.birdCorner=value;
    areaOf(s,value).warriors.bird=6;areaOf(s,value).buildings.push({faction:'bird',type:'roost'});
    ask(s,'setup-leader',p,'选择飞鹰初始领袖',Object.keys(leaders).map(name=>({id:name,label:leaderNames[name],value:name})));
  }else if (kind === 'setup-character') {
    s.vagabond.character = value;
    characters[value].forEach(type => gainItem(s, type, 'starting'));
    ask(s, 'setup-forest', p, '选择起始森林', map.nodes.filter(node => node.node_type === 'forest')
      .map(node => ({ id: String(node.id), label: `森林 ${node.id}`, value: node.id })));
  } else if (kind === 'setup-forest') { s.vagabond.position = value; front(s, [frame('start')]); }
  else if (kind === 'battle-target') startBattle(s, p, areaOf(s, resume.clearing), value);
  else if (kind === 'battle-ally') startBattle(s, p, areaOf(s, resume.clearing), resume.defender, value);
  else if (kind === 'outrage') { gainSupporter(s, takeHand(s, p, value)); record(s,`${p.name} 支付 1 张手牌作为民愤补偿`); }
  else if (kind === 'bank-target') { draw(s, p, 1, rng); draw(s, ownerOf(s, value), 1, rng); }
  else if (kind === 'supporter-discard') {
    const index = s.alliance.supporters.findIndex(card => card.id === value);
    putDiscard(s, s.alliance.supporters.splice(index, 1)[0]); front(s, [frame('trim-supporters')]);
  } else if (kind === 'vagabond-damage') {
    if (value === 'ally') {
      const faction = s.combat.ally;
      areaOf(s, s.combat.clearing).warriors[faction]--; s.combat.allyRemoved++;
      if (faction === 'cat') resume.allyCats=(resume.allyCats||0)+1;
    } else {
      const item = s.vagabond.items.find(item => item.id === value);
      item.damaged = true; item.track = false;
      if (resume.battle) s.combat.itemHits++;
    }
    if (resume.hits > 1) front(s, [frame('vagabond-damage', { ...resume, hits: resume.hits-1 })]);
    else if(resume.allyCats)front(s,[frame('hospital',{count:resume.allyCats,suit:areaOf(s,s.combat.clearing).suit})]);
  } else throw new RuleError('未知阵营选择');
}

function chooseSets(items, count) {
  if (!count) return [[]];
  return items.flatMap((item, index) => chooseSets(items.slice(index+1), count-1).map(rest => [item, ...rest]));
}

function mapActionOptions(s,userId) {
  const p=current(s);
  if(p.id!==userId||s.winner||s.effects.frames.length)return [];
  if(['alliance','vagabond'].includes(p.faction))return factionActionOptions(s,userId).map(option=>option.action);
  if(s.phase==='wood')return [...new Set(s.woodPending)].map(clearing=>({type:'wood',clearing}));
  if(p.faction==='bird'){
    if(s.phase==='decree'){
      const column=activeColumn(s);
      return column?s.bird.remaining[column].flatMap(card=>decreeOptions(s,column,card)):[];
    }
    if(s.phase==='new-roost'){
      const eligible=s.board.filter(c=>!c.keep&&freeSlots(c)>0);
      const minimum=Math.min(...eligible.map(c=>Object.values(c.warriors).reduce((a,b)=>a+b,0)));
      return eligible.filter(c=>Object.values(c.warriors).reduce((a,b)=>a+b,0)===minimum).map(c=>({type:'new-roost',clearing:c.id}));
    }
    return [];
  }
  if(s.phase!=='daylight'||(!s.actions&&!s.march))return [];
  const options=moveOptions(s,'cat');
  if(s.march)return options;
  options.push(...battleOptions(s,'cat'));
  for(const c of s.board){
    if(ruler(c)==='cat'&&freeSlots(c)>0){
      const wood=connectedWood(s,c.id).flatMap(id=>Array(areaOf(s,id).wood).fill(id));
      for(const building of ['sawmill','workshop','recruiter']){
        const count=buildingCount(s,'cat',building),cost=buildingCost[count];
        if(count<6&&wood.length>=cost)options.push({type:'build',clearing:c.id,building,wood:wood.slice(0,cost)});
      }
    }
    if(woodCount(s)<8&&c.buildings.some(b=>b.faction==='cat'&&b.type==='sawmill')){
      for(const card of p.hand.filter(card=>matches(card,c.suit)))options.push({type:'overwork',clearing:c.id,card:card.id});
    }
  }
  if(!s.recruited&&reserve(s,'cat')>0){
    const clearings=s.board.flatMap(c=>c.buildings.filter(b=>b.faction==='cat'&&b.type==='recruiter').map(()=>c.id)).slice(0,reserve(s,'cat'));
    if(clearings.length)options.push({type:'recruit',clearings});
  }
  return options;
}

function factionActionOptions(s, userId) {
  const player = current(s);
  if (!s.setup.complete || player.id !== userId || s.winner || s.effects.frames.length || !['alliance', 'vagabond'].includes(player.faction)) return [];
  const result = [];
  function add(category, label, action) { result.push({ category, label, action }); }
  function battles(faction) {
    for (const clearing of s.board.filter(clearing => present(s, clearing, faction))) {
      if (faction !== 'vagabond' && !clearing.warriors[faction]) continue;
      for (const enemy of enemiesOf(s, faction).filter(enemy => present(s, clearing, enemy.faction))) {
        add('战斗', `${clearing.name} → ${enemy.name}`, { type: 'battle', clearing: clearing.id, defender: enemy.faction });
      }
    }
  }
  function moves(options) {
    for (const action of options) add('移动', `前往${action.to < 12 ? '秋林' : '森林'} ${action.to}${action.ally ? ` · 携带${LABELS[action.ally]} ${action.count}` : player.faction === 'alliance' ? ` · ${action.from}出发，${action.count}士兵` : ''}`, action);
  }
  if (player.faction === 'alliance') {
    if (s.phase === 'revolt' || s.phase === 'spread') {
      for (const clearing of s.board) {
        const matching = s.alliance.supporters.filter(card => matches(card, clearing.suit)).length;
        if (s.phase === 'revolt' && clearing.sympathy && !clearing.keep && clearing.slots > clearing.ruins && matching >= 2
            && !s.board.some(other => other.buildings.some(building => building.type === 'base-'+clearing.suit))) {
          add('起义', `${clearing.name} · 花费2名${LABELS[clearing.suit]}支持者`, { type: 'revolt', clearing: clearing.id });
        }
        if (s.phase === 'spread' && canPlaceSympathy(s, clearing, true) && matching >= sympathyCost(s, clearing)) {
          add('传播民意', `${clearing.name} · ${sympathyCost(s, clearing)}张支持者`, { type: 'spread', clearing: clearing.id });
        }
      }
    }
    if (s.phase === 'daylight') {
      for (const card of player.hand) {
        add('动员', `${card.name} · ${LABELS[card.suit]}`, { type: 'mobilize', card: card.id });
        if (reserve(s, 'alliance') > 0 && s.board.some(clearing => clearing.buildings.some(building => building.faction === 'alliance') && matches(card, clearing.suit))) {
          add('训练长官', card.name, { type: 'train', card: card.id });
        }
      }
    }
    if (s.phase === 'military' && s.alliance.operations > 0) {
      moves(moveOptions(s, 'alliance')); battles('alliance');
      for (const clearing of s.board) {
        if (!clearing.keep && clearing.buildings.some(building => building.faction === 'alliance') && reserve(s, 'alliance') > 0) {
          add('招募', clearing.name, { type: 'recruit', clearing: clearing.id });
        }
        if (clearing.warriors.alliance > 0 && canPlaceSympathy(s, clearing, false)) add('组织', `${clearing.name} · 移除1士兵，放民意`, { type: 'organize', clearing: clearing.id });
      }
    }
    return result;
  }
  const items = s.vagabond.items;
  const ready = items.filter(item => !item.exhausted && !item.damaged);
  const usable = type => ready.some(item => item.type === type);
  if (s.phase === 'refresh' && s.vagabond.refreshLeft > 0) {
    for (const item of items.filter(item => item.exhausted)) add('恢复物品', `${item.type} ${item.id}${item.damaged ? ' · 仍损坏' : ''}`, { type: 'refresh', item: item.id });
  }
  if (s.phase === 'slip') {
    for (const action of vagabondMoves(s,false,true)) add('潜行', `${action.to < 12 ? '秋林' : '森林'} ${action.to}${action.ally?' · 携带'+LABELS[action.ally]+' '+action.count:''}`, action);
  }
  if (s.phase === 'capacity') {
    for (const item of items.filter(item => !item.track)) add('丢弃超重物品', `${item.type} ${item.id}`, { type: 'drop-item', item: item.id });
  }
  if (s.phase !== 'daylight') return result;
  moves(vagabondMoves(s, true));
  if (usable('hammer')) {
    for (const item of items.filter(item => item.damaged)) add('修复', `${item.type} ${item.id}`, { type: 'repair', item: item.id });
  }
  if (usable('torch') && s.vagabond.character === 'ranger') {
    const damaged = items.filter(item => item.damaged).map(item => item.id);
    for (const ids of chooseSets(damaged, Math.min(3, damaged.length))) add('隐藏', `修复 ${ids.join('、') || '零件完好'}，结束白昼`, { type: 'special', items: ids });
  }
  const clearing = s.board.find(clearing => clearing.id === s.vagabond.position);
  if (!clearing) return result;
  if (usable('sword')) battles('vagabond');
  if (usable('torch') && clearing.ruins && s.vagabond.ruinItems[clearing.id]) add('探索废墟', `${clearing.name} · 获得物品与1分`, { type: 'explore' });
  for (const quest of s.quests.filter(quest => quest.suit === clearing.suit && questPayment(s, quest.items))) {
    add('任务', `${quest.name} · 得分`, { type: 'quest', quest: quest.id, reward: 'points' });
    add('任务', `${quest.name} · 抽两张牌`, { type: 'quest', quest: quest.id, reward: 'cards' });
  }
  for (const target of s.players.filter(target => target.faction !== 'vagabond' && present(s, clearing, target.faction))) {
    for (const card of player.hand.filter(card => matches(card, clearing.suit))) {
      for (const item of ready) {
        add('援助', `${target.name} · 交${card.name}，耗竭${item.type}`, { type: 'aid', target: target.faction, card: card.id, item: item.id });
        target.items.forEach((take, index) => add('援助', `${target.name} · 交${card.name}，耗竭${item.type}，取${take}`, { type: 'aid', target: target.faction, card: card.id, item: item.id, takeItem: index }));
      }
    }
    if (usable('torch') && s.vagabond.character === 'thief' && target.hand.length) add('偷窃', target.name, { type: 'special', target: target.faction });
    if (usable('crossbow') && !coalitionPartners(s, 'vagabond', target.faction)) {
      if (clearing.warriors[target.faction]) add('弩击', `${target.name} · 移除1名士兵`, { type: 'strike', target: target.faction });
      else for (const piece of cardboard(s, target.faction, clearing)) add('弩击', `${target.name} · ${LABELS[piece]}`, { type: 'strike', target: target.faction, piece });
    }
  }
  if (usable('torch') && s.vagabond.character === 'tinker') {
    for (const card of s.discard.filter(card => matches(card, clearing.suit))) add('劳作', card.name, { type: 'special', card: card.id });
  }
  return result;
}
