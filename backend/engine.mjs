// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { randomInt } from 'node:crypto';

// This is an explicitly named rules laboratory, not the full Root ruleset.
export const RULESET = 'root-core-lab-v1';
export const LIMITATIONS = [
  '仅支持猫侯国与飞鹰王朝两人规则验证局，使用测试地图和花色测试牌堆。',
  '尚未接入原版地图、完整牌库、制作效果、伏击、统治卡与野战医院。',
  '尚未实现森林联盟、游侠、其他扩展阵营及原版存档导入。',
  '不能视为原版 ROOT 的完整实现；正式规则模式暂不开放。',
];
export const LABELS = {cat:'猫侯国',bird:'飞鹰王朝',fox:'狐狸',rabbit:'兔子',mouse:'老鼠',wild:'鸟类',sawmill:'锯木厂',workshop:'工坊',recruiter:'征兵所',roost:'鸟巢',keep:'城堡',wood:'木材'};
export const MAP = [
  [0,'北岭','fox',115,90,2,[1,3]], [1,'白桦林','rabbit',330,65,2,[0,2,4]],
  [2,'晨雾谷','mouse',570,100,2,[1,5]], [3,'溪流口','rabbit',70,245,2,[0,4,6]],
  [4,'古树庭','mouse',290,220,3,[1,3,5,7]], [5,'风铃地','fox',560,265,2,[2,4,8]],
  [6,'橡树林','mouse',120,410,2,[3,7,9]], [7,'苔石坡','fox',355,380,2,[4,6,8,10]],
  [8,'月影滩','rabbit',620,415,2,[5,7,11]], [9,'深林堡','fox',95,570,2,[6,10]],
  [10,'暮色园','rabbit',345,555,2,[7,9,11]], [11,'鹰巢峰','mouse',595,580,2,[8,10]],
].map(([id,name,suit,x,y,slots,links])=>({id,name,suit,x,y,slots,links}));
const leaders = {despot:['move','build'],commander:['move','battle'],charismatic:['recruit','battle'],builder:['recruit','move']};
const columns = ['recruit','move','battle','build'];
const buildingScore = {sawmill:[0,1,2,3,4,5],workshop:[0,2,2,3,4,5],recruiter:[0,1,2,3,3,4]};
const buildingCost = [0,1,2,3,3,4];
export class RuleError extends Error { constructor(message) {super(message);this.status=422;} }
const check = (condition,message)=>{if(!condition)throw new RuleError(message);};
const copy = value=>structuredClone(value);
const own = (s,f)=>s.players.find(p=>p.faction===f);
const area = (s,id)=>{const c=s.board.find(c=>c.id===id);check(c,'林地不存在');return c;};
const buildings = (s,f,type)=>s.board.reduce((n,c)=>n+c.buildings.filter(b=>b.faction===f&&(!type||b.type===type)).length,0);
const count = (s,f)=>s.board.reduce((n,c)=>n+c.warriors[f],0);
const reserve = (s,f)=>(f==='cat'?25:20)-count(s,f);
const free = c=>c.slots-c.buildings.length-(c.ruins||0);
const matches = (card,c)=>card.suit==='wild'||card.suit===c.suit;
const woodCount = s=>s.board.reduce((n,c)=>n+c.wood,0);
const has = (c,f)=>c.warriors[f]>0||c.buildings.some(b=>b.faction===f)||(f==='cat'&&(c.keep||c.wood>0));
export function ruler(c) {
  const cat=c.warriors.cat+c.buildings.filter(b=>b.faction==='cat').length;
  const bird=c.warriors.bird+c.buildings.filter(b=>b.faction==='bird').length;
  if(bird>0&&bird>=cat)return 'bird';
  return cat>bird?'cat':null;
}
function log(s,text){s.log.push(text);if(s.log.length>80)s.log.shift();}
export function points(s,f,n){const p=own(s,f);p.score=Math.max(0,p.score+n);if(p.score>=30){s.winner=p.id;s.phase='finished';log(s,`${p.name} 获胜`);}}
export function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=rng(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function draw(s,p,n,rng){for(let i=0;i<n;i++){if(!s.deck.length&&s.discard.length)s.deck=shuffle(s.discard.splice(0),rng);if(s.deck.length)p.hand.push(s.deck.pop());}}
function take(p,id){const i=p.hand.findIndex(c=>c.id===id);check(i>=0,'这张牌不在你的手中');return p.hand.splice(i,1)[0];}
function leader(s,name){check(Object.hasOwn(leaders,name),'领袖不存在');s.bird.leader=name;s.bird.decree=Object.fromEntries(columns.map(c=>[c,[]]));leaders[name].forEach((c,i)=>s.bird.decree[c].push({id:`vizier-${i}`,suit:'wild',vizier:true}));}
function begin(s,rng){
  const p=s.players[s.turn];s.actions=3;s.march=0;s.recruited=false;s.bird.added=0;s.bird.addedBird=false;
  if(p.faction==='cat'){
    s.phase='wood';s.woodPending=s.board.flatMap(c=>c.buildings.filter(b=>b.type==='sawmill').map(()=>c.id));
    if(!s.woodPending.length||woodCount(s)>=8)s.phase='daylight';
  }else{if(!p.hand.length)draw(s,p,1,rng);s.phase='decree-add';}
  log(s,`${p.name} 的第 ${s.round} 轮回合`);
}
export function createGame(players,rng=randomInt){
  check(players.length===2&&new Set(players.map(p=>p.faction)).size===2&&players.every(p=>['cat','bird'].includes(p.faction)),'验证局需要猫侯国和飞鹰王朝各一人');
  const s={ruleset:RULESET,round:1,turn:0,turnsCompleted:0,phase:'',winner:null,actions:3,march:0,recruited:false,log:[],pending:null,
    players:players.map(p=>({id:p.userId,name:p.name,faction:p.faction,score:0,hand:[]})),
    board:MAP.map(c=>({...copy(c),warriors:{cat:c.id===11?0:1,bird:c.id===11?6:0},buildings:[],wood:0,keep:c.id===0})),
    // Test cards deliberately have no copied artwork or fabricated original card effects.
    deck:shuffle(Array.from({length:48},(_,i)=>({id:`card-${i}`,suit:['fox','rabbit','mouse','wild'][i%4],name:'花色测试牌'})),rng),discard:[],
    bird:{leader:'despot',used:[],decree:{},remaining:{},added:0,addedBird:false}};
  area(s,0).buildings.push({faction:'cat',type:'sawmill'},{faction:'cat',type:'recruiter'});
  area(s,1).buildings.push({faction:'cat',type:'workshop'});area(s,11).buildings.push({faction:'bird',type:'roost'});
  leader(s,'despot');s.players.forEach(p=>draw(s,p,3,rng));s.turn=rng(2);
  log(s,'规则验证局开始：测试地图／花色牌，完整 ROOT 规则尚未开放');begin(s,rng);return s;
}
function evening(s,rng){
  const p=s.players[s.turn];s.phase='discard';
  if(p.faction==='bird')points(s,'bird',[0,0,1,2,3,4,4,5][buildings(s,'bird','roost')]);
  if(s.winner)return;
  const n=p.faction==='bird'?buildings(s,'bird','roost'):buildings(s,'cat','recruiter');
  draw(s,p,1+(n>=3?1:0)+(n>=5?1:0),rng);
  if(p.hand.length<=5)next(s,rng);
}
function next(s,rng){s.turn=(s.turn+1)%2;s.turnsCompleted=(s.turnsCompleted||0)+1;s.round=1+Math.floor(s.turnsCompleted/2);begin(s,rng);}
function networkWood(s,c){
  const visited=new Set();const todo=[c.id];
  while(todo.length){const id=todo.pop();if(visited.has(id)||ruler(area(s,id))!=='cat')continue;visited.add(id);todo.push(...area(s,id).links);}
  return [...visited];
}
function decreeColumn(s){return columns.find(c=>s.bird.remaining[c]?.length);}
function actionOptions(s,f,type,suit='wild'){
  const result=[];for(const c of s.board){
    if(!matches({suit},c))continue;
    if(type==='move'&&c.warriors[f]>0)for(const id of c.links)if(ruler(c)===f||ruler(area(s,id))===f)result.push({from:c.id,to:id});
    if(type==='battle'&&c.warriors[f]>0&&has(c,f==='cat'?'bird':'cat'))result.push({clearing:c.id});
    if(type==='recruit'&&c.buildings.some(b=>b.type==='roost')&&reserve(s,f)>=(s.bird.leader==='charismatic'?2:1))result.push({clearing:c.id});
    if(type==='build'&&ruler(c)===f&&free(c)>0&&!c.keep&&!c.buildings.some(b=>b.type==='roost')&&buildings(s,'bird','roost')<7)result.push({clearing:c.id});
  }return result;
}
export function checkDecree(s){
  if(s.winner||s.pending||s.phase!=='decree')return;
  const col=decreeColumn(s);if(!col)return;
  if(!s.bird.remaining[col].some(card=>actionOptions(s,'bird',col,card.suit).length)){
    const cards=Object.values(s.bird.decree).flat();points(s,'bird',-cards.filter(c=>c.suit==='wild').length);
    s.discard.push(...cards.filter(c=>!c.vizier));s.bird.used.push(s.bird.leader);
    if(s.bird.used.length===4)s.bird.used=[];s.phase='leader';log(s,'飞鹰王朝无法完成政令，发生动乱，等待更换领袖');
  }
}
function permission(s,p,a){
  check(s.phase==='daylight'||s.phase==='decree','当前阶段不能执行该行动');
  if(p.faction==='cat'){
    if(a.type==='move'&&s.march>0){s.march--;return;}
    check(s.march===0,'请先完成或结束当前行军');check(s.actions>0,'本回合行动已用完');s.actions--;
    if(a.type==='move')s.march=1;
  }else{
    const col=decreeColumn(s);check(col===a.type,'必须按征兵、移动、战斗、建造的顺序完成政令');
    const i=s.bird.remaining[col].findIndex(c=>c.id===a.decreeCard);check(i>=0,'请选择待执行的政令牌');
    const clearing=area(s,a.type==='move'?a.from:a.clearing);check(matches(s.bird.remaining[col][i],clearing),'林地花色与政令不符');
    s.bird.remaining[col].splice(i,1);
  }
}
function cardboard(c,f){return c.buildings.filter(b=>b.faction===f).map(b=>b.type).concat(f==='cat'?[...(c.keep?['keep']:[]),...Array(c.wood).fill('wood')]:[]);}
function removeCardboard(s,c,f,type,by){
  if(type==='wood'&&f==='cat'&&c.wood)c.wood--;
  else if(type==='keep'&&f==='cat'&&c.keep)c.keep=false;
  else{const i=c.buildings.findIndex(b=>b.faction===f&&b.type===type);check(i>=0,'无法移除此棋子');c.buildings.splice(i,1);}
  points(s,by,1);
  if(by==='bird'&&s.bird.leader==='despot'&&!s.pending.despot){points(s,by,1);s.pending.despot=true;}
}
function settleBattle(s){
  if(s.winner){s.pending=null;return;}
  const q=s.pending;if(!q)return;
  q.losses=q.losses.filter(l=>l.hits>0&&cardboard(area(s,q.clearing),l.faction).length);
  if(!q.losses.length){s.pending=null;checkDecree(s);}
}
export function applyAction(state,userId,a,rng=randomInt,extensions={}){
  check(a&&typeof a==='object'&&!Array.isArray(a),'操作格式错误');
  const s=copy(state);check(s.ruleset===(extensions.ruleset||RULESET),'存档规则版本不受支持');check(!s.winner,'对局已经结束');
  const p=s.players.find(p=>p.id===userId);check(p,'你不在本局中');
  if(s.pending){
    check(a.type==='loss','等待战损选择');const q=s.pending,l=q.losses[0];check(p.faction===l.faction,'等待另一位玩家选择损失');
    removeCardboard(s,area(s,q.clearing),p.faction,a.piece,l.by);l.hits--;settleBattle(s);return s;
  }
  check(s.players[s.turn].id===userId,'还没有轮到你');
  if(a.type==='wood'){
    check(s.phase==='wood','当前不需要分配木材');const i=s.woodPending.indexOf(a.clearing);check(i>=0&&woodCount(s)<8,'不能在此放置木材');
    area(s,a.clearing).wood++;s.woodPending.splice(i,1);if(!s.woodPending.length||woodCount(s)>=8)s.phase='daylight';return s;
  }
  if(a.type==='discard'){
    check(s.phase==='discard'&&p.hand.length>5,'当前不需要弃牌');s.discard.push(take(p,a.card));if(p.hand.length===5)next(s,rng);return s;
  }
  if(a.type==='leader'){
    check(s.phase==='leader'&&!s.bird.used.includes(a.leader),'不能选择该领袖');leader(s,a.leader);evening(s,rng);return s;
  }
  if(a.type==='decree-add'){
    check(s.phase==='decree-add'&&s.bird.added<2&&columns.includes(a.column),'不能添加政令');const card=take(p,a.card);
    check(card.suit!=='wild'||!s.bird.addedBird,'每轮最多加入一张鸟类政令');s.bird.decree[a.column].push(card);s.bird.added++;if(card.suit==='wild')s.bird.addedBird=true;return s;
  }
  if(a.type==='decree-ready'){
    check(s.phase==='decree-add'&&s.bird.added>=1,'必须先添加至少一张政令');s.bird.remaining=copy(s.bird.decree);
    s.phase=buildings(s,'bird','roost')===0?'new-roost':'decree';checkDecree(s);return s;
  }
  if(a.type==='new-roost'){
    check(s.phase==='new-roost','当前不需要安置新鸟巢');const eligible=s.board.filter(c=>!c.keep&&free(c)>0);check(eligible.length,'没有可以安置鸟巢的林地');
    const min=Math.min(...eligible.map(c=>c.warriors.cat+c.warriors.bird));const c=area(s,a.clearing);
    check(eligible.some(x=>x.id===c.id)&&c.warriors.cat+c.warriors.bird===min,'应选择可放置且士兵最少的林地');
    c.buildings.push({faction:'bird',type:'roost'});c.warriors.bird+=Math.min(3,reserve(s,'bird'));s.phase='decree';checkDecree(s);return s;
  }
  if(a.type==='march-end'){check(p.faction==='cat'&&s.march>0,'没有进行中的行军');s.march=0;return s;}
  if(a.type==='extra'){
    check(p.faction==='cat'&&s.phase==='daylight'&&s.march===0,'当前不能增加行动');const card=take(p,a.card);check(card.suit==='wild','必须花费鸟类牌');s.discard.push(card);s.actions++;return s;
  }
  if(a.type==='end'){
    check(!s.march,'请先结束行军');check((p.faction==='cat'&&s.phase==='daylight')||(p.faction==='bird'&&s.phase==='decree'&&!decreeColumn(s)),'当前阶段尚未完成');evening(s,rng);return s;
  }
  check(['move','recruit','build','overwork','battle'].includes(a.type),'不支持此操作');
  if(p.faction==='bird')check(a.type!=='overwork','此阵营不能过劳');
  permission(s,p,a);const f=p.faction;
  if(a.type==='move'){
    const from=area(s,a.from),to=area(s,a.to);check(from.links.includes(to.id),'两片林地没有道路相连');check(ruler(from)===f||ruler(to)===f,'必须统治起点或终点');
    check(Number.isInteger(a.count)&&a.count>0&&a.count<=from.warriors[f],'移动士兵数量无效');from.warriors[f]-=a.count;to.warriors[f]+=a.count;log(s,`${p.name}：${a.count} 名士兵从${from.name}前往${to.name}`);
  }
  if(a.type==='recruit'){
    if(f==='cat'){
      check(!s.recruited,'每回合只能征兵一次');const total=buildings(s,'cat','recruiter');check(total>0&&reserve(s,f)>0,'没有可用征兵所或后备士兵');
      const needed=Math.min(total,reserve(s,f));check(Array.isArray(a.clearings)&&a.clearings.length===needed,'请分配全部可征募士兵');const usage={};
      for(const id of a.clearings){const c=area(s,id);usage[id]=(usage[id]||0)+1;check(usage[id]<=c.buildings.filter(b=>b.type==='recruiter').length,'征兵所容量不足');c.warriors.cat++;}s.recruited=true;
    }else{const c=area(s,a.clearing),n=s.bird.leader==='charismatic'?2:1;check(c.buildings.some(b=>b.type==='roost')&&reserve(s,f)>=n,'征兵需要鸟巢与足量后备士兵');c.warriors.bird+=n;}
    log(s,`${p.name} 完成征兵`);
  }
  if(a.type==='build'){
    const c=area(s,a.clearing);check(ruler(c)===f&&free(c)>0,'需要统治林地且有空建筑位');
    if(f==='cat'){
      check(Object.hasOwn(buildingScore,a.building),'建筑类型无效');const n=buildings(s,f,a.building);check(n<6,'该类建筑已用完');const cost=buildingCost[n],ids=networkWood(s,c);
      check(Array.isArray(a.wood)&&a.wood.length===cost,'木材数量与建造成本不符');for(const id of a.wood){check(ids.includes(id),'木材必须通过己方统治的林地运送');const source=area(s,id);check(source.wood>0,'木材不足');source.wood--;}
      c.buildings.push({faction:f,type:a.building});points(s,f,buildingScore[a.building][n]);
    }else{check(!c.keep&&!c.buildings.some(b=>b.type==='roost')&&buildings(s,f,'roost')<7,'此处不能建造鸟巢');c.buildings.push({faction:f,type:'roost'});}
    log(s,`${p.name} 在${c.name}建造了${LABELS[f==='cat'?a.building:'roost']}`);
  }
  if(a.type==='overwork'){
    const c=area(s,a.clearing);check(c.buildings.some(b=>b.type==='sawmill')&&woodCount(s)<8,'需要锯木厂及可用木材');const card=take(p,a.card);check(matches(card,c),'牌的花色不符');s.discard.push(card);c.wood++;
  }
  if(a.type==='battle'){
    const c=area(s,a.clearing),enemy=f==='cat'?'bird':'cat';check(c.warriors[f]>0&&has(c,enemy),'战斗需要己方士兵及敌方棋子');
    if(extensions.startBattle){extensions.startBattle(s,p,c,rng);return s;}
    const rolls=[rng(4),rng(4)].sort((a,b)=>b-a);const hitsOnEnemy=Math.min(rolls[0],c.warriors[f])+(c.warriors[enemy]===0?1:0)+(f==='bird'&&s.bird.leader==='commander'?1:0);
    const hitsOnSelf=Math.min(rolls[1],c.warriors[enemy]);s.pending={clearing:c.id,losses:[],despot:false,rolls};
    for(const [victim,by,hits] of [[enemy,f,hitsOnEnemy],[f,enemy,hitsOnSelf]]){const warriors=Math.min(hits,c.warriors[victim]);c.warriors[victim]-=warriors;s.pending.losses.push({faction:victim,by,hits:hits-warriors});}
    log(s,`${p.name} 在${c.name}发起战斗，骰子 ${rolls.join(' / ')}（服务器掷骰）`);settleBattle(s);
  }
  checkDecree(s);return s;
}
export function projectGame(state,userId){
  const s=copy(state);delete s.deck;s.deckCount=state.deck.length;s.discard=copy(state.discard);
  s.players=s.players.map(p=>{p.handCount=p.hand.length;if(p.id!==userId)delete p.hand;return p;});
  s.currentDecreeColumn=decreeColumn(state)||null;s.leaders=Object.keys(leaders).filter(l=>!s.bird.used.includes(l));
  s.limitations=LIMITATIONS;return s;
}
