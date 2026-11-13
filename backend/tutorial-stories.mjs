// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import * as rules from './rules/versions/registry.mjs';

const requireThat=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{status:422});};
const hero=run=>run.game.players.find(p=>p.id===run.userId);
const ownFaction=run=>hero(run).faction;
const actor=run=>run.game.effects.frames[0]?.playerId||run.game.players[run.game.turn].id;
const stepOf=(run,lesson)=>lesson.steps[run.step];
const equal=(a,b)=>!!a&&!!b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
export const isStory=run=>run.curriculumVersion>=6&&['eyrie','alliance'].includes(run.lessonId)||run.curriculumVersion>=7&&['vagabond','lizard'].includes(run.lessonId);
function apply(run,id,action){
  let roll=0;
  // Fixed, unequal tutorial dice; random results are still recorded by real rules.
  run.game=rules.applyAction(run.game,id,action,n=>n===4?[3,1][roll++%2]:n-1);
}
export function startStory(run,lesson){
  const faction=lesson.faction;
  run.game=rules.createGame([{userId:'tutorial-cat',name:'猫咪指挥官',faction:'cat'},{userId:run.userId,name:run.playerName,faction}],n=>n-1,faction==='lizard'?'root-lizard-cult-v6':'root-base-four-v5');
  // Standard setup placements, decided once; no mid-course board rewrites.
  while(!run.game.setup.complete){
    const q=run.game.effects.frames[0];if(q.playerId===run.userId)break;
    const option=q.kind==='setup-keep'?'8':q.kind==='setup-building'?String({sawmill:8,workshop:6,recruiter:7}[q.resume.type]):q.options[0].id;
    apply(run,q.playerId,{type:'choice',choiceId:q.id,optionId:option});
  }
  const g=run.game,me=hero(run),cat=g.players.find(p=>p.faction==='cat');
  g.deck.push(...me.hand.splice(0),...cat.hand.splice(0),...g.alliance.supporters.splice(0));
  const refs={};
  const take=(key,predicate,holder)=>{const i=g.deck.findIndex(predicate);requireThat(i>=0,'教学开局卡牌不足：'+key);const [card]=g.deck.splice(i,1);refs[key]=card.id;if(holder)holder.push(card);return card;};
  const plain=suit=>c=>c.suit===suit&&c.kind!=='ambush'&&c.kind!=='dominance';
  const draws=[];
  if(faction==='bird'){
    take('recruitFox',plain('fox'),me.hand);take('armor',c=>c.kind==='armorers',me.hand);take('moveBird',c=>c.suit==='wild'&&!['ambush','armorers','dominance'].includes(c.kind),me.hand);
    draws.push(take('battleRabbit',plain('rabbit')),take('catDraw1',plain('fox')),take('crisisMouse',plain('mouse')),take('rebuildRabbit',plain('rabbit')),take('catDraw2',plain('fox')));
  }else if(faction==='alliance'){
    take('supportFox1',plain('fox'),g.alliance.supporters);take('supportMouse',plain('mouse'),g.alliance.supporters);take('supportFox2',plain('fox'),g.alliance.supporters);
    take('tea',c=>c.archetype==='RootTeaFox',me.hand);take('mobilize1',plain('fox'),me.hand);take('mobilize2',plain('fox'),me.hand);
    draws.push(take('training',plain('fox')),take('catPaymentDraw',plain('fox')),take('laterFox',plain('fox')),take('laterRabbit',plain('rabbit')));
  }else if(faction==='lizard'){
    take('catTea',c=>c.archetype==='RootTeaMouse',cat.hand);take('catBag',c=>c.archetype==='MouseinaSackMouse',cat.hand);take('catInitial',plain('rabbit'),cat.hand);
    take('foxRecruit2',c=>c.archetype==='RootTeaFox',me.hand);
    for(const key of ['foxRecruit1','foxBuild'])take(key,plain('fox'),me.hand);
    const wild=c=>c.suit==='wild'&&c.kind!=='ambush';
    // Initial deal and future draws only. Every later resource change is a rules action.
    draws.push(take('wild1',wild),take('mouseScore',plain('mouse')),take('catDraw1',plain('rabbit')),
      take('wild2',wild),take('mouseExtra',plain('mouse')),take('catDraw2',plain('rabbit')),
      take('mouseLater',plain('mouse')),take('rabbitLater',plain('rabbit')),take('fearMouse',plain('mouse')),take('catDraw3',plain('rabbit')),
      take('lastMouse',plain('mouse')),take('lastRabbit',plain('rabbit')));
  }else if(faction==='vagabond'){
    take('catTea',c=>c.archetype==='RootTeaMouse',cat.hand);take('catInitial1',plain('rabbit'),cat.hand);take('catInitial2',plain('rabbit'),cat.hand);
    take('crossbow',c=>c.archetype==='CrossbowMouse',me.hand);take('aid1',plain('fox'),me.hand);take('aid2',plain('fox'),me.hand);
    draws.push(take('aid3',plain('fox')),take('catDraw1',plain('rabbit')),take('travelCard',plain('mouse')),take('catDraw2',plain('rabbit')));
    const all=[...g.quests,...g.questDeck],first=all.find(q=>q.id==='RepairaShedFox'),last=all.find(q=>q.id==='GiveaSpeechFox');
    g.quests=[first,...all.filter(q=>q!==first&&q!==last).slice(0,2)];
    g.questDeck=[last,...all.filter(q=>q!==last&&!g.quests.includes(q))];
  }
  if(['bird','alliance'].includes(faction))for(let i=0;i<3;i++)take('catInitial'+i,plain('fox'),cat.hand);
  // Draw pops from the end. Scheduled cards are part of the initial deck only.
  g.deck.push(...draws.reverse());
  run.context={story:true,refs,cursor:0,history:[]};
  prepareStoryStep(run,lesson);
}
export function prepareStoryStep(run,lesson){
  const step=stepOf(run,lesson);run.context.cursor=0;run.guideCursor=0;run.count=0;run.attempt=0;run.ready=step.goal==='read';
  run.checkpoint={game:structuredClone(run.game),context:structuredClone(run.context)};
}
function options(run,lesson){
  const g=run.game,q=g.effects.frames[0],step=stepOf(run,lesson),spec=step.sequence?.[run.context.cursor],refs=run.context.refs;
  if(q?.type==='choice'){
    let selected;
    if(spec?.type==='choice')selected=q.options.find(o=>o.id===spec.option);
    else if(q.playerId===run.userId&&q.kind==='vagabond-damage')selected=(step.damageItems||['boot','torch']).map(type=>q.options.find(o=>g.vagabond.items.find(i=>i.id===o.id)?.type===type)).find(Boolean);
    else if(q.playerId===run.userId&&q.kind==='battle-effects')selected=q.options.find(o=>o.id===refs.armor)||q.options.find(o=>o.id==='pass');
    else selected=q.options.find(o=>o.id==='pass')||q.options[0];
    requireThat(selected,'教学选择不可执行');
    return {actions:[{type:'choice',choiceId:q.id,optionId:selected.id}],interrupt:spec?.type!=='choice',spec,q};
  }
  if(g.phase==='discard'){
    const p=g.players[g.turn],reserved=[refs.rebuildRabbit,refs.tea,refs.training,refs.wild1,refs.wild2,refs.mouseScore];
    const preferred=(step.discard||[]).map(key=>p.hand.find(c=>c.id===refs[key])).filter(Boolean);
    const cards=preferred.length?preferred:p.hand.filter(c=>!reserved.includes(c.id));
    return {spec,interrupt:true,notice:'夜晚抽牌后手牌超过五张，先弃至五张，再轮到下一位。教学保留后续需要展示的牌。',actions:(cards.length?cards:p.hand).map(c=>({type:'discard',card:c.id}))};
  }
  if(!spec)return {actions:[],spec};
  const id=spec.actor==='cat'?'tutorial-cat':run.userId;
  requireThat(actor(run)===id,'教学操作者与回合不符：'+step.id);
  const view=rules.projectGame(g,id),p=g.players.find(p=>p.id===id);
  if(spec.type==='military-plan')return {spec,actions:[...view.mapActions.filter(a=>['move','recruit','organize'].includes(a.type)),{type:'military-done'}]};
  if(spec.type==='development-plan')return {spec,actions:view.factionActions.map(o=>o.action).filter(a=>['mobilize','train'].includes(a.type)&&a.card!==refs.tea)};
  if(spec.type==='pilgrim-plan')return {spec,actions:view.factionActions.map(o=>o.action).filter(a=>a.type==='ritual-recruit')};
  if(spec.type==='conspiracy-plan')return {spec,actions:[...view.factionActions.map(o=>o.action).filter(a=>a.type==='convert'),{type:'conspiracies-done'}]};
  if(spec.type==='wanderer-plan')return {spec,actions:view.factionActions.map(o=>o.action).filter(a=>a.type==='quest'&&a.quest==='GiveaSpeechFox'||a.type==='special')};
  if(spec.choose&&spec.type==='recruit')return {spec,actions:view.mapActions.filter(a=>a.type==='recruit')};
  if(spec.choose&&spec.type==='decree-add')return {spec,actions:p.hand.filter(c=>c.suit==='rabbit'||c.suit==='wild').map(c=>({type:'decree-add',column:'build',card:c.id}))};
  const action={};
  for(const [key,value] of Object.entries(spec))if(!['actor','text','focus','preview','previewQuest','decree','choose','repeat'].includes(key))action[key]=value;
  if(action.card)action.card=refs[action.card];
  if(action.decreeCard)action.decreeCard=refs[action.decreeCard];
  if(action.item)action.item=g.vagabond.items.find(i=>i.type===action.item)?.id||action.item;
  if(action.type==='battle'&&id===run.userId&&ownFaction(run)==='bird')delete action.defender;
  if(spec.decree){const cards=g.bird.remaining[action.type];const card=spec.decree==='any'?cards[0]:spec.decree==='vizier'?cards.find(c=>c.vizier):cards.find(c=>c.id===refs[spec.decree]);requireThat(card,'待执行法令不存在');action.decreeCard=card.id;}
  if(spec.choose&&spec.type==='move')return {spec,actions:view.mapActions.filter(a=>a.type==='move'&&a.from===action.from&&a.to===action.to)};
  return {actions:[action],spec};
}
function instruction(run,lesson,detail){
  const {q,spec}=detail,g=run.game;
  if(detail.notice)return detail.notice;
  if(q){
    if(q.kind==='outrage')return '敌军进入了民意领地，激起民愤。观察猫咪交出一张匹配手牌：它会成为我们的支持者，不是手牌。';
    if(q.kind==='battle-effects')return '陛下，昨日锻造的铠甲兵现在派上用场。弃置它，忽略对手骰子造成的伤害，保护这座支撑狐狸招募令的鸟巢。';
    if(q.kind==='hospital')return '猫咪正在决定是否救回伤兵。此处按教学安排不发动医院，随后继续这场真实结算。';
    if(q.kind==='vagabond-damage'){const item=g.vagabond.items.find(i=>i.id===detail.actions?.[0]?.optionId);return `这次命中必须由物品承受。本次先选择${item?.type==='boot'?'靴子':'火把'}受损，保留锤子供明日修理。损坏与耗竭是两种状态：清晨恢复不会修复损坏。`;}
    return spec?.text||q.prompt;
  }
  if(spec?.type==='military-plan')return `今晚还剩${g.alliance.operations}次军事行动。可以招募、移动或组织；也可以提前结束。留意基地守卫，并比较每次行动留下的棋盘。`;
  return spec?.text||stepOf(run,lesson).text;
}
export function advanceStory(source,command,lesson){
  const run=structuredClone(source),step=stepOf(run,lesson);
  if(command.type==='retry-step'){run.game=structuredClone(run.checkpoint.game);run.context=structuredClone(run.checkpoint.context);run.guideCursor=0;run.ready=step.goal==='read';run.count=0;run.attempt=(run.attempt||0)+1;return run;}
  if(command.type==='guide-next'||command.type==='guide-back'){
    const guide=storyGuide(run,lesson);requireThat(command.type==='guide-next'?guide.canAdvance:guide.canBack,'请跟随当前引导');run.guideCursor+=command.type==='guide-next'?1:-1;return run;
  }
  if(command.type==='next'){
    requireThat(run.ready&&!storyGuide(run,lesson).canAdvance,'请先完成本节并听完引导');
    if(run.step+1===lesson.steps.length){run.completed=true;run.everCompleted=true;}else{run.step++;prepareStoryStep(run,lesson);}return run;
  }
  requireThat(!run.ready&&storyGuide(run,lesson).mode==='act','请先听完当前引导');
  const detail=options(run,lesson),id=actor(run),watch=id!==run.userId;
  requireThat(watch?command.type==='coach-next':command.type==='action','请由当前操作者完成');
  const action=watch?detail.actions[0]:command.action;
  requireThat(detail.actions.some(a=>equal(a,action)),'请按本节目标操作');
  // Legality and real costs remain the rule engine's responsibility.
  apply(run,id,action);
  run.context.history.push({step:step.id,actor:id,action:structuredClone(action)});
  if(!detail.interrupt&&!(detail.spec.repeat&&!['military-done','conspiracies-done'].includes(action.type)))run.context.cursor++;
  run.count++;run.guideCursor=0;
  run.ready=run.context.cursor>=step.sequence.length&&!run.game.effects.frames.some(f=>f.type==='choice')&&run.game.phase!=='discard';
  // The introduction is heard once. Subsequent actions use their own current instruction.
  if(!run.ready&&['vagabond','lizard'].includes(run.lessonId))run.guideCursor=step.guidance.before.length;
  return run;
}
export function storyGuide(run,lesson){
  const step=stepOf(run,lesson),reading=step.goal==='read',responding=run.ready&&!reading;
  const lines=responding?step.guidance.after:step.guidance.before;
  const cursor=Math.min(run.guideCursor||0,Math.max(0,lines.length-(reading||responding?1:0)));
  const acting=!run.ready&&cursor===lines.length;
  const detail=!run.ready?options(run,lesson):null;
  const me=hero(run),g=run.game,watch=!!detail&&actor(run)!==run.userId;
  const guide={speaker:step.guidance.speaker,mode:run.completed?'complete':acting?'act':responding?'result':'dialogue',cursor,total:lines.length,
    text:acting?instruction(run,lesson,detail):!responding&&run.context.cursor>0?instruction(run,lesson,detail||{}):lines[cursor]?.text||step.text,focus:acting?(detail.actions[0]?.from!==undefined?'route':'clearing'):lines[cursor]?.focus||'map',
    prompts:{source:instruction(run,lesson,detail||{}),choice:instruction(run,lesson,detail||{}),destination:ownFaction(run)==='bird'?'沿高亮道路选择目标；移动法令检查出发地的花色。':ownFaction(run)==='alliance'?'沿高亮道路选择终点；移动和组织各使用一次军事行动。':ownFaction(run)==='lizard'?'圣战检查出发地的被逐者花色，再按统治条件移动。':'潜行免费；白天移动耗竭靴子，进入有敌对士兵的林地需要两只靴子。',confirm:'核对目标、人数与支付，再确认。'},
    canAdvance:!run.completed&&!acting&&(cursor<lines.length-1||!run.ready),canBack:!run.completed&&cursor>0,watch,
    resources:{round:g.round,score:me.score,hand:me.hand.length,officers:g.alliance.officers,items:g.vagabond.items.filter(i=>!i.exhausted&&!i.damaged).length},
    evidence:ownFaction(run)==='bird'?[`鸟巢 ${g.board.reduce((n,c)=>n+c.buildings.filter(b=>b.type==='roost').length,0)}`,`法令 ${Object.values(g.bird.decree).flat().length} 项`]:[`支持者 ${g.alliance.supporters.length}`,`本晚军事行动 ${g.alliance.operations}`]};
  if(ownFaction(run)==='lizard')guide.evidence=[`侍僧 ${g.lizard.acolytes}`,`失魂 ${g.lizard.lostSouls.length}`,`被逐者 ${ {fox:'狐狸',mouse:'老鼠',rabbit:'兔子'}[g.lizard.outcast]||'待选择'}${g.lizard.hated?' · 憎恨':''}`,`展示 ${g.lizard.revealed.length}`];
  if(ownFaction(run)==='vagabond')guide.evidence=[`耗竭物品 ${g.vagabond.items.filter(i=>i.exhausted).length}`,`损坏 ${g.vagabond.items.filter(i=>i.damaged).length}`,`猫咪关系 ${g.vagabond.relations.cat===-1?'敌对':g.vagabond.relations.cat}`,`完成任务 ${g.vagabond.completedQuests.length}`];
  if(detail&&!watch){guide.action=detail.actions[0];guide.alternatives=detail.actions;guide.allowAlternatives=detail.actions.length>1;}
  const preview=detail?.spec?.preview||step.preview;
  if(preview){const card=g.players.flatMap(p=>p.id===run.userId?p.hand.concat(p.crafted):[]).find(c=>c.id===run.context.refs[preview])||run.checkpoint.game.players.find(p=>p.id===run.userId).hand.find(c=>c.id===run.context.refs[preview]);if(card){guide.previewCard=structuredClone(card);guide.previewLabel='查看本次手牌';}}
  if(step.previewLeader)guide.previewLeader=step.previewLeader;
  if(step.previewCharacter){guide.previewCharacter=step.previewCharacter;guide.focus=acting?'card':guide.focus;}
  const quest=detail?.spec?.previewQuest||step.previewQuest;
  if(quest){guide.previewCard=structuredClone(g.quests.find(q=>q.id===quest)||g.vagabond.completedQuests.find(q=>q.id===quest));guide.previewLabel='查看本次任务';}
  if(acting&&guide.previewCard&&['vagabond','lizard'].includes(run.lessonId))guide.focus='card';
  return guide;
}
export function projectStory(run,version,lesson){
  const step=stepOf(run,lesson),game=rules.projectGame(run.game,run.userId),guide=storyGuide(run,lesson);
  const available=!run.ready&&guide.mode==='act'&&!guide.watch?options(run,lesson).actions:[];
  const permitted=a=>available.some(b=>equal(a,b));
  game.mapActions=game.mapActions.filter(permitted);game.factionActions=game.factionActions.filter(o=>permitted(o.action));
  game.craftOptions=game.craftOptions.filter(o=>permitted({type:'craft',card:o.card}));game.effectOptions=[];
  if(game.choice&&!game.choice.waiting)game.choice.options=game.choice.options.filter(o=>permitted({type:'choice',choiceId:game.choice.choiceId,optionId:o.id}));
  const detail=!run.ready?options(run,lesson):null,action=detail?.actions[0]||{},where=detail?.q?.resume?.clearing;
  const context={story:true,...(step.clearing!==undefined?{clearing:step.clearing}:{}),...(where!==undefined?{clearing:where}:{}),...(action.from!==undefined?{from:action.from,to:action.to}:{}),...(action.clearing!==undefined?{clearing:action.clearing}:{})};
  return {code:`tutorial-${run.lessonId}`,title:`阵营教程 · ${lesson.title}`,ownerId:run.userId,version,status:'playing',capacity:game.players.length,locked:true,members:game.players.map(p=>({userId:p.id,name:p.name,faction:p.faction,ready:true})),gameId:run.id,game,
    tutorial:{guide,id:run.id,lessonId:lesson.id,faction:lesson.faction,title:lesson.title,index:run.step,attempt:run.attempt||0,total:lesson.steps.length,stepId:step.id,heading:step.title,text:step.text,result:run.ready?step.result:'',ready:run.ready,completed:run.completed,actionTypes:[...new Set(available.map(a=>a.type))],context,count:run.count,goalCount:1,reading:step.goal==='read',newScene:false}};
}
