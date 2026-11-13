// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as rules from './rules/versions/registry.mjs';
import {candidates} from './bots/test-policy.mjs';
import {RuleError} from './engine.mjs';

const catalog=JSON.parse(readFileSync(new URL('./data/tutorial-catalog.json',import.meta.url),'utf8'));
const recipes=JSON.parse(readFileSync(new URL('./data/full-card-catalog.json',import.meta.url),'utf8')).cards;
const quests=JSON.parse(readFileSync(new URL('./data/four-faction-catalog.json',import.meta.url),'utf8')).quests;
const factions=['cat','bird','alliance','vagabond'];
const labels={cat:'猫咪教练',bird:'飞鹰教练',alliance:'联盟教练',vagabond:'游侠教练'};
const ensure=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{status:422});};
const rng=maximum=>maximum-1;
const player=(state,faction)=>state.players.find(p=>p.faction===faction);
const currentStep=run=>lessonById(run.lessonId).steps[run.step];

export function lessonById(id){const lesson=catalog.lessons.find(lesson=>lesson.id===id);ensure(lesson,'教程不存在');return lesson;}
export function tutorialCatalog(){return catalog.lessons.map(({id,title,faction,summary,steps})=>({id,title,faction,summary,stepCount:steps.length}));}

function resolveOpponents(state,userId){
  for(let count=0;state.effects.frames[0]?.type==='choice'&&state.effects.frames[0].playerId!==userId;count++){
    ensure(count<64,'教程结算超出限制');
    const choice=state.effects.frames[0];
    const option=choice.options.find(option=>option.id==='pass')||choice.options[0];
    state=rules.applyAction(state,choice.playerId,{type:'choice',choiceId:choice.id,optionId:option.id},rng);
  }
  return state;
}
function setupState(run){
  const lesson=lessonById(run.lessonId);
  const selected=lesson.faction==='lizard'?['cat','bird','alliance','lizard']:factions;
  const members=selected.map(faction=>({userId:faction===lesson.faction?run.userId:`tutorial-${faction}`,name:faction===lesson.faction?run.playerName:labels[faction],faction}));
  return resolveOpponents(rules.createGame(members,()=>0,lesson.faction==='lizard'?'root-lizard-cult-v6':'root-base-four-v5'),run.userId);
}
function baseline(run){
  let state=setupState(run);
  while(!state.setup.complete){
    const choice=state.effects.frames[0];
    const option=choice.kind==='setup-character'?'thief':choice.options[0].id;
    state=rules.applyAction(state,choice.playerId,{type:'choice',choiceId:choice.id,optionId:option},()=>0);
  }
  state.deck.push(...state.players.flatMap(p=>p.hand.splice(0)),...state.alliance.supporters.splice(0));
  for(const area of state.board){area.warriors=Object.fromEntries(Object.keys(area.warriors).map(faction=>[faction,0]));area.buildings=[];area.wood=0;area.keep=false;area.sympathy=false;area.ruins=0;}
  state.turn=state.players.findIndex(p=>p.id===run.userId);state.turnsCompleted=0;state.round=1;
  state.phase='daylight';state.actions=3;state.march=0;state.effects.frames=[];state.combat=null;state.winner=null;
  state.log=['已载入本节练习局面'];state.logTurns=[1];
  state.alliance.officers=0;state.alliance.operations=0;state.alliance.operationsUsed=0;
  return state;
}
function deal(state,p,predicate){
  const index=state.deck.findIndex(card=>predicate(card,recipes.find(recipe=>recipe.type===card.archetype)));
  ensure(index>=0,'教程预置卡牌不足');const [card]=state.deck.splice(index,1);p.hand.push(card);return card;
}
function supporter(state,suit){
  const holder={hand:[]};const card=deal(state,holder,card=>card.suit===suit);state.alliance.supporters.push(card);return card;
}
function inventory(state,types){
  state.vagabond.items=types.map((type,index)=>({id:`item-${index+1}`,type,exhausted:false,damaged:false,track:['tea','coin','bag'].includes(type),source:'tutorial'}));
  state.vagabond.nextItem=types.length;state.vagabond.character='thief';
}
function npcBattle(run,attacker,defender,clearing){
  const state=run.game;
  state.turn=state.players.findIndex(p=>p.faction===attacker);state.phase='decree';
  const card=deal(state,player(state,attacker),card=>card.suit==='wild');player(state,attacker).hand.pop();
  state.bird.decree={recruit:[],move:[],battle:[card],build:[]};state.bird.remaining=structuredClone(state.bird.decree);
  state.bird.leader='builder';
  run.game=resolveOpponents(rules.applyAction(state,player(state,attacker).id,{type:'battle',clearing,defender,decreeCard:card.id},rng),run.userId);
}
const campaignStep=run=>currentStep(run).goal.startsWith('campaign-');
function campaignStart(run){
  const faction=lessonById(run.lessonId).faction,opponent=faction==='cat'?'bird':'cat';
  // An explicitly introduced opening, followed by real turns with no scene rewrites.
  let state=rules.createGame([{userId:`tutorial-${opponent}`,name:labels[opponent],faction:opponent},{userId:run.userId,name:run.playerName,faction}],rng,'root-base-four-v5');
  while(!state.setup.complete){
    const choice=state.effects.frames[0];
    const option=choice.kind==='setup-character'?'thief':choice.kind==='setup-leader'?'despot':choice.options[0].id;
    state=rules.applyAction(state,choice.playerId,{type:'choice',choiceId:choice.id,optionId:option},rng);
  }
  ensure(state.players[state.turn].id===run.userId,'连续演练起始顺序错误');
  if(faction==='alliance'){
    const hero=player(state,faction);state.deck.push(...hero.hand.splice(0),...state.alliance.supporters.splice(0));
    supporter(state,'fox');supporter(state,'wild');
    for(let i=0;i<3;i++)deal(state,hero,c=>c.suit==='fox');
  }
  run.game=state;run.context={campaign:true,startTurns:state.turnsCompleted,history:[],turnActions:[]};
}
function campaignActor(run){return run.game.effects.frames.find(f=>f.type==='choice')?.playerId||run.game.players[run.game.turn].id;}
function campaignReady(run){return run.game.turnsCompleted>run.context.startTurns&&(currentStep(run).goal==='campaign-turn'||campaignActor(run)===run.userId);}
function campaignAction(run){
  const state=run.game,id=campaignActor(run),g=rules.projectGame(state,id),p=g.players.find(p=>p.id===id);
  let options=candidates(g,p,{developmentRound:1});
  const own=id===run.userId,done=run.context.turnActions||[];
  if(g.phase==='decree-add'&&!g.bird.added){
    const suits=g.board.filter(c=>c.buildings.some(b=>b.type==='roost')).map(c=>c.suit);
    options=p.hand.filter(c=>c.suit==='wild'||suits.includes(c.suit)).map(c=>({type:'decree-add',card:c.id,column:'recruit'})).concat(options);
  }
  if(g.phase==='decree'&&g.currentDecreeColumn==='move'){
    const preferred=g.mapActions.filter(a=>a.type==='move'&&g.board[a.to].slots>g.board[a.to].buildings.length+g.board[a.to].ruins&&!g.board[a.to].buildings.some(b=>b.type==='roost'));
    preferred.sort((a,b)=>b.count-a.count);options=[...preferred,...options];
  }
  if(p.faction==='alliance'){
    if(g.phase==='spread'&&!done.includes('spread'))options=[...g.factionActions.filter(o=>o.action.type==='spread'&&g.board[o.action.clearing].suit==='fox').map(o=>o.action),...options];
    if(g.phase==='spread'&&done.includes('spread'))options=[{type:'spread-done'}];
    if(g.phase==='daylight'){
      const train=g.factionActions.filter(o=>o.action.type==='train'&&g.alliance.officers<2).map(o=>o.action);
      options=[...train,...g.factionActions.filter(o=>o.action.type==='mobilize').map(o=>o.action),{type:'end'}];
    }
    if(g.phase==='military'){
      const actions=g.factionActions.map(o=>o.action);
      options=[...actions.filter(a=>a.type==='organize'),...actions.filter(a=>a.type==='move'&&!g.board[a.to].sympathy),...actions.filter(a=>a.type==='recruit'),{type:'military-done'}];
    }
  }
  // The observer sees a bounded, visible reply, not a hidden full-turn simulation.
  if(!own&&p.faction==='cat'&&g.phase==='daylight'){
    options=done.includes('recruit')?[{type:'end'}]:[...g.mapActions.filter(a=>a.type==='recruit'),{type:'end'}];
  }
  if(p.faction==='vagabond'&&g.phase==='daylight'&&done.filter(t=>['explore','quest','aid','special','move'].includes(t)).length>=2)options=[{type:'end'}];
  for(const action of options){
    try{rules.applyAction(state,id,action,rng);return action;}
    catch(error){if(!(error instanceof RuleError))throw error;}
  }
  throw new Error(`连续演练没有合法行动：${p.faction}/${g.phase}`);
}
const actionNames={choice:'完成当前选择', 'birdsong-end':'开始清晨',wood:'生产木材',craft:'锻造', 'craft-done':'结束锻造',build:'建造',recruit:'招募',move:'移动',battle:'战斗','march-end':'结束行军',end:'结束白天',discard:'弃牌', 'decree-add':'增加法令','decree-ready':'确认法令',leader:'选择新领袖', 'revolt-done':'结束起义阶段','spread-done':'结束传播阶段',spread:'传播民意',revolt:'起义',mobilize:'动员',train:'训练长官',organize:'组织','military-done':'结束军事行动',refresh:'恢复物品','refresh-done':'结束恢复',slip:'潜行','slip-done':'留在原地',explore:'探索遗迹',aid:'援助',quest:'完成任务',special:'使用角色能力','evening-continue':'继续夜晚','evening-end':'结束回合'};
function campaignInstruction(run,action){
  const type=action.type,where=action.clearing!==undefined?`秋林${action.clearing}`:action.to!==undefined?`${action.to>=12?'森林':'秋林'}${action.to}`:'';
  if(type==='choice'){
    const choice=run.game.effects.frames[0];
    return choice.playerId===run.userId?`${choice.prompt} 这次练习选择：${choice.options.find(o=>o.id===action.optionId).label}。`:'对手正在处理战斗或救援选择。完成后，棋局按真实规则继续结算。';
  }
  const tips={
    'birdsong-end':'新一天开始，先进入本阵营的清晨流程。',wood:'锯木厂在清晨产木。昨天建好的锯木厂，今天也会参加生产。',
    'decree-add':'先检查鸟巢的花色，再给招募列增加一张能兑现的牌。旧法令仍然保留。','decree-ready':'新承诺已写下。确认法令，进入白天。','craft-done':'本次先结束锻造，把注意力放到阵营的主要行动。',
    build:'有统治权、建筑空位和所需资源，才能建造。确认后看看建筑与声望变化。',recruit:'补充战士，观察地图与供应的变化。',
    move:'先点起点部队，再点终点，检查数量后确认。移动会改变双方的统治力量。',battle:'在当前林地发起战斗。本教程骰子固定3/3；伤害仍受战士数量与防御能力限制。','march-end':'本次行军的第一段移动已完成。这次先结束行军，保留在此处的战士。',end:'白天的计划完成了。结束白天后还要处理夜晚，不能直接当成下一轮。',discard:'夜晚手牌超过上限。先亲自弃到五张，才能进入下一轮。',
    spread:'用支持者在相邻、匹配花色的林地传播民意。先选亮起的目标，再确认支付。',mobilize:'把手牌动员为支持者，为下一轮起义积攒力量。',revolt:'昨天的民意和支持者还在。支付两张匹配支持者，把民意变成基地与军队。',
    train:'用匹配基地花色的手牌训练长官，增加今晚的军事行动。',organize:'收回一名战士，放置民意并计分。把军事实力变为居民支持。',
    refresh:'昨天耗竭的装备还在背包里。亲自恢复它，让今天重新有工具可用。',slip:'清晨潜行不耗靴子，先决定今天去哪里。',explore:'耗竭火把探索遗迹。收下物品，再考虑剩下的行动。',aid:'交付匹配林地花色的手牌、耗竭物品，并观察关系。',quest:'检查任务花色和两件所需物品，再确认报酬。',special:'盗贼用火把偷取手牌；火把耗竭后，今天不能再用它探索。'
  };
  return `${tips[type]||'按当前阶段完成这一步，再观察棋局变化。'}${where?` 本次目标：${where}。`:''}${action.from!==undefined?` 从${action.from>=12?'森林':'秋林'}${action.from}出发${type==='slip'?'。':`，移动${action.count}名。`}`:''}`;
}
function prepare(run){
  const step=currentStep(run);run.count=0;
  if(!step.scene)return;
  if(step.scene==='campaign-start'){campaignStart(run);return;}
  run.context={};
  if(step.scene==='basic-march'){
    run.context={from:3,to:run.game.board[3].links.find(id=>id!==0)};return;
  }
  if(['cat-setup','bird-setup','vg-setup','liz-setup'].includes(step.scene)){run.game=setupState(run);return;}
  if(step.scene==='liz-next-birdsong'){
    // Explicit tutorial time jump: retain the learner's two discards and board.
    run.game.turn=run.game.players.findIndex(p=>p.id===run.userId);run.game.phase='birdsong';run.game.effects.frames=[];
    run.game.lizard.scoredSuits=[];run.context={clearing:11,target:'bird'};return;
  }
  const state=baseline(run);run.game=state;
  const hero=state.players.find(p=>p.id===run.userId);
  const area=id=>state.board.find(area=>area.id===id);
  switch(step.scene){
    case 'liz-overview':area(2).warriors.lizard=4;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];state.lizard.outcast='mouse';break;
    case 'liz-rituals':{
      area(2).warriors.lizard=2;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];state.lizard.outcast='mouse';
      for(let i=0;i<3;i++)deal(state,hero,card=>card.suit==='mouse');
      const tea=deal(state,hero,card=>card.archetype==='RootTeaFox');run.context={clearing:4,craftCard:tea.id};break;
    }
    case 'liz-revenge':
      area(2).warriors.lizard=3;area(2).warriors.bird=2;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];state.lizard.outcast='mouse';
      run.context={clearing:2};npcBattle(run,'bird','lizard',2);break;
    case 'liz-outcast':{
      state.phase='birdsong';state.lizard.outcast='fox';state.lizard.hated=false;
      area(2).warriors.lizard=3;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];
      for(const suit of ['mouse','mouse','rabbit','wild']){const holder={hand:[]};state.lizard.lostSouls.push(deal(state,holder,card=>card.suit===suit));}
      break;
    }
    case 'liz-crusade':{
      state.phase='lizard-conspiracies';state.lizard.outcast='mouse';state.lizard.acolytes=2;
      area(2).warriors.lizard=3;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];
      const to=area(2).links[0];area(to).warriors.bird=1;run.context={from:2,to,count:2,target:'bird'};break;
    }
    case 'liz-battle':
      state.phase='lizard-conspiracies';state.lizard.outcast='mouse';state.lizard.acolytes=2;
      area(2).warriors.lizard=2;area(2).warriors.bird=1;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];run.context={clearing:2,target:'bird'};break;
    case 'liz-sacrifice':for(let i=0;i<3;i++)deal(state,hero,card=>card.suit==='wild');break;
    case 'liz-discard':
      state.phase='discard';state.lizard.outcast='rabbit';state.lizard.hated=false;state.lizard.acolytes=3;
      area(1).warriors.lizard=2;area(1).buildings=[{faction:'lizard',type:'garden-rabbit'}];
      area(11).warriors.bird=1;area(11).buildings=[{faction:'bird',type:'roost'}];
      for(let i=0;i<2;i++)deal(state,hero,card=>card.suit==='rabbit');
      for(let i=0;i<5;i++)deal(state,hero,card=>['fox','mouse'].includes(card.suit));break;
    case 'liz-fear':
      area(2).warriors.bird=1;area(2).buildings=[{faction:'lizard',type:'garden-mouse'}];
      for(let i=0;i<2;i++)deal(state,hero,card=>card.kind!=='ambush');run.context={clearing:2};npcBattle(run,'bird','lizard',2);break;
    case 'overview':area(0).warriors.cat=3;area(0).keep=true;deal(state,hero,card=>card.kind==='item');break;
    case 'basic-move':area(0).warriors.cat=3;area(0).keep=true;run.context={from:0,to:3};break;
    case 'basic-defenseless':area(3).warriors.cat=1;area(3).buildings=[{faction:'bird',type:'roost'}];run.context={clearing:3,target:'bird'};break;
    case 'basic-battle':area(3).warriors.cat=3;area(3).warriors.bird=1;area(3).buildings=[{faction:'bird',type:'roost'}];run.context={clearing:3,target:'bird'};break;
    case 'cat-wood':state.phase='wood';state.woodPending=[1];area(1).buildings=[{faction:'cat',type:'sawmill'}];area(1).warriors.cat=1;run.context={clearing:1};break;
    case 'cat-craft':{
      state.phase='craft';area(1).buildings=[{faction:'cat',type:'workshop'}];
      const card=deal(state,hero,(card,recipe)=>card.kind==='item'&&recipe.cost.length===1&&recipe.cost[0]===area(1).suit);
      run.context={card:card.id};break;
    }
    case 'cat-build':area(0).buildings=[{faction:'cat',type:'workshop'}];area(0).warriors.cat=1;area(1).warriors.cat=1;area(1).wood=1;run.context={clearing:1,building:'workshop'};break;
    case 'cat-recruit':for(const id of [1,3])area(id).buildings=[{faction:'cat',type:'recruiter'}];run.context={clearings:[1,3]};break;
    case 'cat-extra':state.actions=0;deal(state,hero,card=>card.suit==='wild');break;
    case 'cat-hospital':area(0).keep=true;area(3).warriors.cat=1;area(3).warriors.bird=3;deal(state,hero,card=>card.suit===area(3).suit&&card.kind!=='ambush');npcBattle(run,'bird','cat',3);break;
    case 'bird-cycle':state.phase='decree-add';area(1).buildings=[{faction:'bird',type:'roost'}];area(1).warriors.bird=6;deal(state,hero,card=>card.suit===area(1).suit);run.context={from:1,to:0};break;
    case 'bird-turmoil':{
      state.phase='craft';area(1).buildings=[{faction:'bird',type:'roost'}];area(1).warriors.bird=3;hero.score=3;
      const card=deal(state,hero,card=>card.suit==='fox');hero.hand.pop();state.bird.decree.recruit=[card];break;
    }
    case 'wa-spread':state.phase='spread';supporter(state,'fox');supporter(state,'wild');run.context={clearing:0};break;
    case 'wa-next':throw new Error('wa-next must carry the preceding exercise');
    case 'wa-mobilize':deal(state,hero,card=>card.suit==='fox');deal(state,hero,card=>card.suit==='wild');break;
    case 'wa-revolt':{
      state.phase='revolt';area(0).sympathy=true;state.board.find(a=>a.suit==='fox'&&a.id!==0).sympathy=true;
      area(0).warriors.cat=2;area(0).buildings=[{faction:'cat',type:'sawmill'}];area(0).wood=1;
      supporter(state,'fox');supporter(state,'wild');deal(state,hero,card=>card.suit==='fox');run.context={clearing:0};break;
    }
    case 'wa-recruit':state.phase='military';state.alliance.officers=1;state.alliance.operations=1;area(0).buildings=[{faction:'alliance',type:'base-fox'}];run.context={clearing:0};break;
    case 'wa-outrage':{
      state.turn=state.players.findIndex(p=>p.faction==='cat');area(1).warriors.cat=2;area(0).sympathy=true;
      for(const suit of ['fox','wild','mouse','rabbit','fox'])supporter(state,suit);
      run.game=resolveOpponents(rules.applyAction(state,player(state,'cat').id,{type:'move',from:1,to:0,count:1},rng),run.userId);break;
    }
    case 'wa-base-loss':area(0).buildings=[{faction:'alliance',type:'base-fox'}];area(0).warriors.bird=3;state.alliance.officers=3;for(const suit of ['fox','wild','mouse'])supporter(state,suit);npcBattle(run,'bird','alliance',0);break;
    case 'vg-refresh':state.phase='refresh';state.vagabond.position=12;inventory(state,['boot','torch','tea','sword']);state.vagabond.items[0].exhausted=true;state.vagabond.items[1].exhausted=true;state.vagabond.refreshLeft=5;break;
    case 'vg-explore':state.vagabond.position=5;inventory(state,['boot','torch','tea','sword']);area(5).ruins=1;state.vagabond.ruinItems[5]='hammer';run.context={clearing:5};break;
    case 'vg-aid':state.vagabond.position=0;inventory(state,['boot','torch','tea','sword']);area(0).warriors.alliance=1;deal(state,hero,card=>card.suit==='fox');deal(state,hero,card=>card.suit==='fox');player(state,'alliance').items=['bag'];state.itemSupply.bag--;run.context={target:'alliance',clearing:0};break;
    case 'vg-quest':{
      const quest=quests.find(quest=>quest.suit==='fox'&&quest.items.includes('torch')&&quest.items.includes('hammer'));
      ensure(quest,'教程任务未找到');state.vagabond.position=0;inventory(state,['boot','torch','hammer','sword']);
      state.quests=structuredClone([quest,quests.find(q=>q.suit==='mouse'),quests.find(q=>q.suit==='rabbit')]);
      state.questDeck=structuredClone(quests.filter(q=>!state.quests.some(selected=>selected.id===q.id)));run.context={quest:quest.id,clearing:0};break;
    }
    case 'vg-steal':state.vagabond.position=0;inventory(state,['boot','torch','tea','sword']);area(0).warriors.cat=1;deal(state,player(state,'cat'),card=>card.kind==='item');run.context={target:'cat',clearing:0};break;
    case 'vg-rest':state.vagabond.position=12;inventory(state,['boot','torch','tea','sword']);state.vagabond.items[0].damaged=true;state.vagabond.items[1].exhausted=true;break;
    default:throw new Error('Unknown tutorial scene '+step.scene);
  }
}
function prepareStep(run){
  const step=currentStep(run);
  if(step.id==='wa-wild'){run.context={clearing:1};run.count=0;}
  else if(step.id==='wa-organize'){run.context={from:0,to:1};run.count=0;}
  else if(step.id==='vg-slip'){run.context={to:0};run.count=0;}
  else prepare(run);
  if(campaignStep(run)){
    run.context.startTurns=run.game.turnsCompleted;
    run.context.turnActions=[];
  }
  run.attempt=0;
  run.guideCursor=0;
  run.ready=step.goal==='read'||(['liz-revenge','liz-fear','base-lost'].includes(step.goal)&&achieved(run,{}));
  run.checkpoint={game:structuredClone(run.game),context:structuredClone(run.context)};
}
export function createTutorial(user,lessonId){
  lessonById(lessonId);
  const run={schemaVersion:1,curriculumVersion:catalog.version,id:randomUUID(),userId:user.id,playerName:user.username,lessonId,step:0,ready:false,completed:false,count:0,context:{},receipts:[]};
  prepareStep(run);return run;
}

function guideFor(run){
  const step=currentStep(run),guide=step.guidance;
  if(!guide)return null;
  if(campaignStep(run)&&!run.ready){
    const action=campaignAction(run),watch=campaignActor(run)!==run.userId,instruction=campaignInstruction(run,action);
    const text=watch?`对手正在${actionNames[action.type]||'行动'}。${instruction}`:instruction;
    return {speaker:guide.speaker,mode:(run.guideCursor||0)===0?'dialogue':'act',cursor:run.guideCursor||0,total:1,text,focus:action.from!==undefined?'route':action.clearing!==undefined?'clearing':'map',prompts:{source:text,destination:action.to!==undefined?`沿亮起的路线前往${action.to>=12?'森林':'秋林'}${action.to}。`:text,confirm:'检查目标和支付，再确认。',choice:text},canAdvance:(run.guideCursor||0)===0,canBack:(run.guideCursor||0)>0,watch};
  }
  const responding=run.ready&&step.goal!=='read';
  const lines=responding?guide.after:guide.before;
  const cursor=Math.max(0,Math.min(run.guideCursor||0,step.goal==='read'||responding?Math.max(0,lines.length-1):lines.length));
  const acting=!run.ready&&cursor===lines.length;
  return {speaker:guide.speaker,mode:run.completed?'complete':acting?'act':responding?'result':'dialogue',cursor,total:lines.length,
    text:lines[cursor]?.text||step.text,focus:lines[cursor]?.focus||'map',prompts:guide.prompts,
    canAdvance:!run.completed&&!acting&&(cursor<lines.length-1||!run.ready),canBack:!run.completed&&cursor>0};
}
function allowed(run,action){
  const step=currentStep(run),context=run.context;
  if(campaignStep(run)){
    if(campaignActor(run)!==run.userId)return false;
    const expected=campaignAction(run);
    return Object.keys(expected).every(key=>JSON.stringify(action[key])===JSON.stringify(expected[key]))&&Object.keys(action).every(key=>key in expected);
  }
  if(!step.actions.includes(action.type))return false;
  if(action.type==='choice'){
    const choice=run.game.effects.frames[0];const option=choice?.options.find(option=>option.id===action.optionId);
    if(!option)return false;
    if(choice.kind==='setup-character')return option.id==='thief';
    if(step.id==='liz-crusade'&&choice.kind==='lizard-crusade-battle')return option.id===context.target;
    if(step.id==='bird-leader'&&choice.kind==='setup-leader')return option.id==='despot';
    return choice.kind!=='hospital'||option.id!=='pass';
  }
  if(action.type==='decree-add')return action.column==='recruit';
  if(action.type==='craft')return action.card===(context.card||context.craftCard);
  if(action.type==='crusade'&&step.id==='liz-crusade')return action.from===context.from&&action.to===context.to&&action.count===context.count;
  if(action.type==='crusade'&&step.id==='liz-battle')return action.from===undefined&&action.clearing===context.clearing&&action.defender===context.target;
  if(action.type==='discard'&&step.id==='liz-discard')return player(run.game,'lizard').hand.find(card=>card.id===action.card)?.suit==='rabbit';
  if(action.type==='build'&&context.building&&action.building!==context.building)return false;
  if(action.type==='quest')return action.quest===context.quest;
  if(action.type==='move')return action.from===context.from&&action.to===context.to&&(!['move','march'].includes(step.id)||action.count===1)&&(step.id!=='wa-organize'||run.game.board[context.to].warriors.alliance===0);
  if(action.type==='slip')return action.to===context.to;
  if(action.type==='organize')return action.clearing===context.to;
  if(action.target!==undefined&&context.target!==undefined&&action.target!==context.target)return false;
  if(action.clearing!==undefined&&context.clearing!==undefined)return action.clearing===context.clearing;
  return true;
}
function achieved(run,action){
  const state=run.game,step=currentStep(run);
  switch(step.goal){
    case 'liz-revenge':return state.lizard.acolytes===2&&!state.combat&&!state.effects.frames.length;
    case 'liz-outcast':return state.phase==='lizard-conspiracies'&&state.lizard.outcast==='mouse'&&!state.lizard.hated&&state.lizard.lostSouls.length===0;
    case 'liz-crusade':return state.lizard.acolytes===0&&state.board[run.context.to].warriors.bird===0&&!state.combat&&!state.effects.frames.length;
    case 'liz-attack':return state.lizard.acolytes===0&&state.board[2].warriors.lizard===1&&state.board[2].warriors.bird===0&&!state.combat;
    case 'liz-sacrifice':return run.count===3&&state.lizard.acolytes===3&&state.lizard.revealed.length===3;
    case 'liz-discard':return run.count===2&&player(state,'lizard').hand.length===5&&state.lizard.lostSouls.filter(card=>card.suit==='rabbit').length===2;
    case 'liz-hated':return state.phase==='lizard-conspiracies'&&state.lizard.outcast==='rabbit'&&state.lizard.hated;
    case 'liz-fear':return player(state,'lizard').hand.length===1&&state.lizard.lostSouls.length===1&&!state.board[2].buildings.some(b=>b.faction==='lizard')&&!state.combat;
    case 'action':return action.type===step.actions[0]&&!state.combat&&!state.effects.frames.some(frame=>frame.type==='choice');
    case 'setup':return state.setup.complete;
    case 'leader':return state.bird.leader==='despot'&&state.setup.complete;
    case 'hospital':return state.board.some(area=>area.keep&&area.warriors.cat>0)&&!state.combat;
    case 'two-roosts':return state.board.flatMap(area=>area.buildings).filter(building=>building.type==='roost').length>=2;
    case 'turmoil':return state.phase==='leader';
    case 'twice':return run.count>=2;
    case 'two-officers':return state.alliance.officers>=2;
    case 'organized':return action.type==='organize'&&state.board[run.context.to].sympathy;
    case 'base-lost':return !state.board.some(area=>area.buildings.some(building=>building.type==='base-fox'))&&!state.combat;
    case 'refreshed':return state.vagabond.items.every(item=>!item.exhausted);
    case 'slipped':return action.type==='slip'&&state.vagabond.position===run.context.to;
    case 'rested':return state.vagabond.items.every(item=>!item.exhausted&&!item.damaged);
    default:return false;
  }
}
export function advanceTutorial(source,command){
  const run=structuredClone(source);
  ensure(!run.completed||command.type==='restart','本章已完成，可返回目录或重新练习');
  if(command.type==='restart'){const fresh=createTutorial({id:run.userId,username:run.playerName},run.lessonId);fresh.everCompleted=!!(run.everCompleted||run.completed);return fresh;}
  if(command.type==='retry-step'){run.game=structuredClone(run.checkpoint.game);run.context=structuredClone(run.checkpoint.context);run.count=0;run.guideCursor=0;run.attempt=(run.attempt||0)+1;const goal=currentStep(run).goal;run.ready=goal==='read'||(['liz-revenge','liz-fear','base-lost'].includes(goal)&&achieved(run,{}));return run;}
  const guide=guideFor(run);
  if(command.type==='guide-next'||command.type==='guide-back'){
    ensure(guide&&(command.type==='guide-next'?guide.canAdvance:guide.canBack),'请跟随当前引导');
    run.guideCursor=guide.cursor+(command.type==='guide-next'?1:-1);return run;
  }
  if(command.type==='next'){
    ensure(run.ready,'请先完成当前教学目标');
    ensure(!guide||!guide.canAdvance,'请先听完当前引导');
    if(run.step+1===lessonById(run.lessonId).steps.length){run.completed=true;run.everCompleted=true;return run;}
    run.step++;prepareStep(run);return run;
  }
  if(command.type==='coach-next'){
    ensure(campaignStep(run)&&campaignActor(run)!==run.userId&&!run.ready&&guide.mode==='act','请按当前教程操作');
    const action=campaignAction(run),actor=campaignActor(run);
    run.game=rules.applyAction(run.game,actor,action,rng);
    run.context.turnActions.push(action.type);run.context.history.push({actor,type:action.type});
    run.ready=campaignReady(run);
    run.guideCursor=0;return run;
  }
  ensure(command.type==='action'&&!run.ready,'请点击继续进入下一节');
  ensure(!guide||guide.mode==='act','请先听完当前引导');
  ensure(command.action&&allowed(run,command.action),'请按本节目标操作，可查看提示或重试本节');
  if(campaignStep(run)){
    run.game=rules.applyAction(run.game,run.userId,command.action,rng);
    run.context.turnActions.push(command.action.type);run.context.history.push({actor:run.userId,type:command.action.type});
    run.ready=campaignReady(run);
    run.guideCursor=0;return run;
  }
  run.game=resolveOpponents(rules.applyAction(run.game,run.userId,command.action,rng),run.userId);
  if(['twice','liz-sacrifice','liz-discard'].includes(currentStep(run).goal))run.count++;
  run.ready=achieved(run,command.action);if(run.ready)run.guideCursor=0;return run;
}
export function projectTutorial(run,version){
  const lesson=lessonById(run.lessonId),step=currentStep(run);
  const game=rules.projectGame(run.game,run.userId);
  const guide=guideFor(run);
  if(guide&&run.ready&&['battle','defenseless'].includes(step.id)){
    const before=run.checkpoint.game,at=run.context.clearing;
    const dice=run.game.randomEvents.filter(event=>event.type==='battle-dice').at(-1)?.values;
    guide.outcome={dice:dice?[...dice]:null,
      cat:[before.board[at].warriors.cat,run.game.board[at].warriors.cat],bird:[before.board[at].warriors.bird,run.game.board[at].warriors.bird],
      roost:[before.board[at].buildings.filter(b=>b.type==='roost').length,run.game.board[at].buildings.filter(b=>b.type==='roost').length],
      points:player(run.game,'cat').score-player(before,'cat').score};
  }
  const campaign=campaignStep(run);
  const expected=campaign&&!run.ready?campaignAction(run):null;
  const context=campaign?{campaign:true,startTurns:run.context.startTurns,...(expected?.from!==undefined?{from:expected.from}:{}),...(expected?.to!==undefined?{to:expected.to}:{}),...(expected?.clearing!==undefined?{clearing:expected.clearing}:{})}:run.context;
  const actionTypes=run.ready||run.completed||(guide&&guide.mode!=='act')?[]:campaign?(guide.watch?[]:[expected.type]):step.actions;
  const permitted=action=>actionTypes.includes(action.type)&&allowed(run,action);
  game.mapActions=game.mapActions.filter(permitted);
  game.factionActions=game.factionActions.filter(option=>permitted(option.action));
  game.craftOptions=game.craftOptions.filter(option=>permitted({type:'craft',card:option.card}));game.effectOptions=[];
  if(game.choice&&!game.choice.waiting)game.choice.options=game.choice.options.filter(option=>permitted({type:'choice',choiceId:game.choice.choiceId,optionId:option.id}));
  if(run.context.campaign&&guide){
    const own=game.players.find(p=>p.id===run.userId);
    guide.resources={round:game.round,score:own.score,hand:own.handCount,wood:game.board.reduce((n,c)=>n+c.wood,0),officers:game.alliance?.officers||0,items:game.vagabond?.items.filter(i=>!i.exhausted&&!i.damaged).length||0};
    if(campaign&&!guide.watch&&!run.ready)guide.action=expected;
  }
  const goalCount=step.goal==='liz-sacrifice'?3:['twice','liz-discard'].includes(step.goal)?2:1;
  return {code:`tutorial-${run.lessonId}`,title:`阵营教程 · ${lesson.title}`,ownerId:run.userId,version,status:'playing',capacity:game.players.length,locked:true,members:game.players.map(p=>({userId:p.id,name:p.name,faction:p.faction,ready:true})),gameId:run.id,game,tutorial:{guide,id:run.id,lessonId:lesson.id,faction:lesson.faction,title:lesson.title,index:run.step,attempt:run.attempt||0,total:lesson.steps.length,stepId:step.id,heading:step.title,text:step.text,result:run.ready?step.result:'',ready:run.ready,completed:run.completed,actionTypes,context,count:run.count,goalCount,reading:step.goal==='read',newScene:!!step.scene&&!['basic-march','wa-next'].includes(step.scene)}};
}
