// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
// Integrated only by the isolated schema-7 engine; older rulesets stay frozen.
export function riverfolkHooks(api){
 const {ensure,current,ownerOf,areaOf,reserve,record,score,draw,putDiscard,ask,front,frame,move,startBattle,daylight,evening,nextTurn,takeHand,exhaustItem,canCraft,craft,definitions,rule,present,moveOptions}=api;
 const suits=['fox','rabbit','mouse'],services=['cards','boats','mercenaries'];
 const labels={cards:'手牌',boats:'租借小舟',mercenaries:'佣兵',fox:'狐狸',rabbit:'兔子',mouse:'老鼠',cat:'猫咪',bird:'飞鹰',alliance:'联盟',lizard:'蜥蜴',otter:'水獭'};
 const token=(s,faction)=>({id:'fund-'+(++s.riverfolk.nextFund),faction});
 const boardFunds=s=>s.riverfolk?[...s.riverfolk.payments,...s.riverfolk.funds,...s.riverfolk.committed,...s.riverfolk.crafting.map(c=>c.fund)]:[];
 const activeMerc=(s,faction)=>!!s.riverfolk?.services?.mercenaries&&ownerOf(s,faction)?.id===s.riverfolk.services.playerId&&current(s).faction===faction&&!['setup','services','birdsong','refresh','slip','revolt','spread','lizard-conspiracies'].includes(s.phase)&&s.combat?.defender!=='otter';
 function pay(s,ids,n,spend=false,faction=null,slots=null){
  const rf=s.riverfolk;ensure(Array.isArray(ids)&&ids.length===n&&new Set(ids).size===n,'请选择准确数量且不重复的资金');
  const chosen=ids.map(id=>rf.funds.find(f=>f.id===id));ensure(chosen.every(f=>f&&(!faction||f.faction===faction)),'资金不存在或所属阵营不匹配');
  chosen.forEach((f,i)=>{rf.funds.splice(rf.funds.indexOf(f),1);if(slots)rf.crafting.push({slot:slots[i],fund:f});else if(!spend)rf.committed.push(f);});
  rf.events.push({kind:spend?'spend':slots?'craft-commit':'commit',from:'funds',to:spend?'supply':slots?'crafting':'committed',funds:structuredClone(chosen)});
  record(s,`${ownerOf(s,'otter').name} ${spend?'花费':'调用'} ${n} 资金${faction?'（'+labels[faction]+'）':''}`);
 }
 function setup(s){
  const rf=s.riverfolk,p=ownerOf(s,'otter');
  if(rf.setupPlaced<4){ask(s,'setup-rf-warrior',p,`沿河放置第${rf.setupPlaced+1}/4名水獭`,s.board.filter(c=>c.riverLinks.length&&!c.keep).map(c=>({id:String(c.id),label:c.name,value:c.id})));return;}
  if(!rf.startPaid){for(let n=0;n<3&&reserve(s,'otter')>0;n++)rf.payments.push(token(s,'otter'));rf.startPaid=true;}
  const service=services[rf.setupPrice];ask(s,'setup-rf-price',p,'设定'+labels[service]+'起价',[1,2,3,4].map(n=>({id:'price-'+n,label:n+'点资金',value:n})),{service});
 }
 function answer(s,p,kind,value,resume,rng){
  if(kind==='setup-rf-warrior'){const c=areaOf(s,value);ensure(c.riverLinks.length&&!c.keep&&reserve(s,'otter')>0,'非法河流开局');c.warriors.otter++;s.riverfolk.setupPlaced++;setup(s);return true;}
  if(kind==='setup-rf-price'){s.riverfolk.prices[resume.service]=value;s.riverfolk.setupPrice++;if(s.riverfolk.setupPrice<3)setup(s);else{s.riverfolk.setupComplete=true;api.finishFactionSetup(s,rng);}return true;}
  if(kind==='rf-disruption'){const rf=s.riverfolk,n=resume.remaining;ensure(rf.funds.some(f=>f.id===value),'资金已变化');const f=rf.funds.splice(rf.funds.findIndex(f=>f.id===value),1)[0];rf.events.push({kind:'disruption',from:'funds',to:'supply',funds:[f]});if(n>1)disruptionChoice(s,n-1);return true;}
  return false;
 }
 function disruptionChoice(s,n){const rf=s.riverfolk;if(!n||!rf.funds.length)return;ask(s,'rf-disruption',ownerOf(s,'otter'),`贸易阻断：还需退还${n}点资金`,rf.funds.map(f=>({id:f.id,label:labels[f.faction]+'资金 '+f.id,value:f.id})),{remaining:n});}
 function removePost(s,c){const rf=s.riverfolk;ensure(c.tradePost,'没有贸易站');rf.removed.push(c.tradePost);c.tradePost=null;record(s,'贸易站永久移除，已解锁锻造位保留');front(s,[frame('rf-disruption')]);}
 function beginDisruption(s){const n=Math.ceil(s.riverfolk.funds.length/2);record(s,`贸易阻断：资金栏退还${n}点（向上取整）`);disruptionChoice(s,n);}
 function morning(s){const rf=s.riverfolk;if(!rf.payments.length){const n=Math.min(2,reserve(s,'otter'));for(let i=0;i<n&&reserve(s,'otter')>0;i++)rf.payments.push(token(s,'otter'));rf.events.push({kind:'protectionism',from:'supply',to:'payments',count:n});record(s,`贸易保护：${n}名水獭进入收入栏`);}
  const old=rf.funds.length,dividend=s.board.some(c=>c.tradePost)?Math.floor(old/2):0;rf.lastDividend={funds:old,payments:rf.payments.length,committed:rf.committed.length+rf.crafting.length,points:dividend};if(dividend)score(s,'otter',dividend,'清晨分红（归集前资金）');if(s.winner)return;
  const incoming=[...rf.payments.splice(0),...rf.committed.splice(0),...rf.crafting.splice(0).map(c=>c.fund)];rf.funds.push(...incoming);rf.events.push({kind:'gather',from:'income-commitments',to:'funds',count:incoming.length,funds:structuredClone(incoming)});record(s,`分红先按旧资金${old}计${dividend}分，再归集至${rf.funds.length}资金`);daylight(s);
 }
 function startServices(s,p){const rf=s.riverfolk;if(!rf||p.faction==='otter')return false;rf.services={playerId:p.id,boats:false,mercenaries:false,purchased:0,limit:1+s.board.filter(c=>c.tradePost&&present(s,c,p.faction)).length};s.phase='services';return true;}
 function serviceOptions(s,p){const rf=s.riverfolk;if(!rf||s.phase!=='services'||current(s).id!==p.id)return[];if(rf.services.purchased>=rf.services.limit)return[];const seller=ownerOf(s,'otter'),can=n=>p.faction==='vagabond'?s.vagabond.items.filter(i=>!i.exhausted&&!i.damaged).length>=n:reserve(s,p.faction)>=n;
  const result=[];for(const service of services){if(service==='mercenaries'&&p.faction==='vagabond'||service!=='cards'&&rf.services[service])continue;const cost=rf.prices[service];if(!can(cost))continue;
   const choices=service==='cards'?seller.hand.map(c=>({card:c.id,name:c.name})):[{name:labels[service]}];
   for(const choice of choices)result.push({category:'购买'+labels[service],label:choice.name+' · '+cost+(p.faction==='vagabond'?'件物品':'名本阵营士兵'),action:{type:'buy-service',service,...(choice.card?{card:choice.card}:{}),...(p.faction==='vagabond'?{items:s.vagabond.items.filter(i=>!i.exhausted&&!i.damaged).slice(0,cost).map(i=>i.id)}:{})}});
  }return result;
 }
 function craftingSlots(s,definition,requested){const rf=s.riverfolk,slots=suits.flatMap(suit=>Array.from({length:rf.unlocked[suit]},(_,i)=>({id:suit+'-'+i,suit}))).filter(c=>!rf.crafting.some(x=>x.slot===c.id)),selected=[];if(requested!==undefined&&(!Array.isArray(requested)||requested.length!==definition.cost.length||new Set(requested).size!==requested.length))return null;
  const pool=requested?requested.map(id=>slots.find(s=>s.id===id)):slots;if(pool.some(x=>!x))return null;
  for(const suit of [...definition.cost].sort((a,b)=>Number(a==='wild')-Number(b==='wild'))){const slot=pool.find(x=>!selected.includes(x.id)&&(suit==='wild'||x.suit===suit));if(!slot)return null;selected.push(slot.id);}return rf.funds.length>=selected.length?selected:null;
 }
 function options(s,p){if(!s.riverfolk||current(s).id!==p.id||s.effects.frames.length||!s.setup.complete||s.winner)return[];if(s.phase==='services')return serviceOptions(s,p);if(p.faction!=='otter')return[];const rf=s.riverfolk,one=rf.funds.slice(0,1).map(f=>f.id),result=[],add=(category,label,action)=>result.push({category,label,action});
  if(s.phase==='rf-prices')return result;
  if(s.phase!=='daylight')return result;
  if(one.length){for(const a of moveOptions(s,'otter'))add('移动',`${a.from} → ${a.to} · ${a.count}名 · 调用1`,{...a,funds:one});for(const c of s.board.filter(c=>c.warriors.otter&&s.players.some(p=>p.faction!=='otter'&&present(s,c,p.faction))))add('战斗',c.name+' · 调用1',{type:'battle',clearing:c.id,funds:one});add('抽牌','调用1资金，抽取1张手牌',{type:'rf-draw',funds:one});const recruitFund=reserve(s,'otter')>0?one:rf.funds.filter(f=>f.faction==='otter').slice(0,1).map(f=>f.id);if(recruitFund.length)for(const c of s.board.filter(c=>c.riverLinks.length&&!c.keep))add('招募',c.name+' · 花费1',{type:'recruit',clearing:c.id,funds:recruitFund});}
  for(const c of s.board){const ruler=rule(s,c),funds=rf.funds.filter(f=>f.faction===ruler).slice(0,2).map(f=>f.id);if(!c.keep&&!c.tradePost&&ruler&&funds.length===2&&rf.unlocked[c.suit]<3)add('建立贸易站',`${c.name} · 花费2点${labels[ruler]}资金 · +2分`,{type:'trade-post',clearing:c.id,funds});}
  for(const card of p.hand.filter(c=>canCraft(s,p,c))){const def=definitions.get(card.archetype),funds=rf.funds.slice(0,def.cost.length).map(f=>f.id);add('锻造',card.name+' · 调用'+funds.length,{type:'craft',card:card.id,funds});add('出口',card.name+' · 放弃牌面收益，收入+1水獭',{type:'export',card:card.id,funds});}
  return result;
 }
 function execute(s,p,a,rng){const rf=s.riverfolk;if(!rf)return false;
  if(a.type==='services-done'){ensure(s.phase==='services','当前不在购买窗口');api.startBirdsong(s,rng);return true;}
  if(a.type==='buy-service'){
   ensure(s.phase==='services'&&rf.services.playerId===p.id&&rf.services.purchased<rf.services.limit,'当前不能购买服务');ensure(services.includes(a.service),'服务无效');ensure(a.service==='cards'||!rf.services[a.service],'本回合已购买此服务');ensure(!(p.faction==='vagabond'&&a.service==='mercenaries'),'游侠不能购买佣兵');const n=rf.prices[a.service],income=p.faction==='vagabond'?Math.min(n,reserve(s,'otter')):n,seller=ownerOf(s,'otter');const card=a.service==='cards'?seller.hand.find(c=>c.id===a.card):null;ensure(a.service!=='cards'||card,'商品已不在公开手牌');
   if(p.faction==='vagabond'){ensure(Array.isArray(a.items)&&a.items.length===n&&new Set(a.items).size===n,'购买需足够可用物品');a.items.forEach(id=>exhaustItem(s,id));for(let i=0;i<n&&reserve(s,'otter')>0;i++)rf.payments.push(token(s,'otter'));}
   else{ensure(a.items===undefined&&reserve(s,p.faction)>=n,'买家供应不足');for(let i=0;i<n;i++)rf.payments.push(token(s,p.faction));}
   if(card)p.hand.push(takeHand(s,seller,card.id));else rf.services[a.service]=true;rf.services.purchased++;rf.events.push({kind:'purchase',from:p.faction,to:'payments',faction:p.faction==='vagabond'?'otter':p.faction,count:income,service:a.service});record(s,`${p.name} 购买${labels[a.service]}，${income}点${p.faction==='vagabond'?'水獭':labels[p.faction]}进入商会收入栏`);return true;
  }
  if(s.phase==='services')throw new api.RuleError('请先购买服务或结束购买');
  if(p.faction!=='otter')return false;
  if(a.type==='birdsong-end'){ensure(s.phase==='birdsong','当前不在商会清晨');morning(s);return true;}
  if(a.type==='set-prices'){ensure(s.phase==='rf-prices','仅在夜晚调整价格');ensure(a.prices&&Object.keys(a.prices).length===3&&services.every(k=>Number.isInteger(a.prices[k])&&a.prices[k]>=1&&a.prices[k]<=4),'三项价格须为1至4');rf.prices={...a.prices};record(s,'商会调整价格：'+services.map(k=>labels[k]+' '+rf.prices[k]).join('、'));nextTurn(s,rng);return true;}
  if(a.type==='end'){ensure(s.phase==='daylight','请完成当前商会阶段');evening(s);return true;}
  if(a.type==='craft'||a.type==='export'){
   ensure(s.phase==='daylight','商会仅在白天锻造或出口');const card=p.hand.find(c=>c.id===a.card);ensure(card&&canCraft(s,p,card),'必须先满足正常锻造条件');const def=definitions.get(card.archetype),slots=craftingSlots(s,def,a.pieces);ensure(slots,'锻造轨道不足');if(a.type==='export'){pay(s,a.funds,def.cost.length,false,null,slots);putDiscard(s,takeHand(s,p,a.card));const n=Number(reserve(s,'otter')>0);if(n)rf.payments.push(token(s,'otter'));rf.events.push({kind:'export',from:'supply',to:'payments',count:n});record(s,`出口：放弃牌面收益，${n}名水獭进入收入栏`);}else craft(s,p,a);return true;
  }
  if(!['move','battle','rf-draw','recruit','trade-post'].includes(a.type))return false;ensure(s.phase==='daylight','商会行动仅在白天');
  if(a.type==='trade-post'){const c=areaOf(s,a.clearing),r=rule(s,c);ensure(!c.keep&&!c.tradePost&&r&&rf.unlocked[c.suit]<3,'此处不能建贸易站');pay(s,a.funds,2,true,r);const post={id:'post-'+c.suit+'-'+rf.unlocked[c.suit],suit:c.suit};rf.unlocked[c.suit]++;c.tradePost=post;if(reserve(s,'otter')>0)c.warriors.otter++;score(s,'otter',2,'建立贸易站');record(s,c.name+'建立'+labels[c.suit]+'贸易站');return true;}
  pay(s,a.funds,1,a.type==='recruit');if(a.type==='move')move(s,p,a);else if(a.type==='battle')startBattle(s,p,areaOf(s,a.clearing),a.defender);else if(a.type==='rf-draw')draw(s,p,1,rng);else{const c=areaOf(s,a.clearing);ensure(c.riverLinks.length&&!c.keep&&reserve(s,'otter')>0,'只能在合法河流林地招募，且需士兵供应');c.warriors.otter++;}return true;
 }
 return {boardFunds,activeMerc,pay,setup,answer,removePost,disruptionChoice,beginDisruption,startServices,craftingSlots,options,execute};
}
