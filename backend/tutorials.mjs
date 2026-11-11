import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as rules from './rules/versions/base-four.mjs';

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
  const members=factions.map(faction=>({userId:faction===lesson.faction?run.userId:`tutorial-${faction}`,name:faction===lesson.faction?run.playerName:labels[faction],faction}));
  return resolveOpponents(rules.createGame(members,()=>0),run.userId);
}
function baseline(run){
  let state=setupState(run);
  while(!state.setup.complete){
    const choice=state.effects.frames[0];
    const option=choice.kind==='setup-character'?'thief':choice.options[0].id;
    state=rules.applyAction(state,choice.playerId,{type:'choice',choiceId:choice.id,optionId:option},()=>0);
  }
  state.deck.push(...state.players.flatMap(p=>p.hand.splice(0)),...state.alliance.supporters.splice(0));
  for(const area of state.board){area.warriors={cat:0,bird:0,alliance:0};area.buildings=[];area.wood=0;area.keep=false;area.sympathy=false;area.ruins=0;}
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
function prepare(run){
  const step=currentStep(run);run.count=0;
  if(!step.scene)return;
  run.context={};
  if(step.scene==='basic-march'){
    run.context={from:3,to:run.game.board[3].links.find(id=>id!==0)};return;
  }
  if(['cat-setup','bird-setup','vg-setup'].includes(step.scene)){run.game=setupState(run);return;}
  const state=baseline(run);run.game=state;
  const hero=state.players.find(p=>p.id===run.userId);
  const area=id=>state.board.find(area=>area.id===id);
  switch(step.scene){
    case 'overview':area(0).warriors.cat=3;area(0).keep=true;deal(state,hero,card=>card.kind==='item');break;
    case 'basic-move':area(0).warriors.cat=3;run.context={from:0,to:3};break;
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
  run.attempt=0;
  run.ready=step.goal==='read';
  run.checkpoint={game:structuredClone(run.game),context:structuredClone(run.context)};
}
export function createTutorial(user,lessonId){
  lessonById(lessonId);
  const run={schemaVersion:1,curriculumVersion:catalog.version,id:randomUUID(),userId:user.id,playerName:user.username,lessonId,step:0,ready:false,completed:false,count:0,context:{},receipts:[]};
  prepareStep(run);return run;
}
function allowed(run,action){
  const step=currentStep(run),context=run.context;
  if(!step.actions.includes(action.type))return false;
  if(action.type==='choice'){
    const choice=run.game.effects.frames[0];const option=choice?.options.find(option=>option.id===action.optionId);
    if(!option)return false;
    if(choice.kind==='setup-character')return option.id==='thief';
    if(step.id==='bird-leader'&&choice.kind==='setup-leader')return option.id==='despot';
    return choice.kind!=='hospital'||option.id!=='pass';
  }
  if(action.type==='decree-add')return action.column==='recruit';
  if(action.type==='craft')return action.card===context.card;
  if(action.type==='build'&&context.building&&action.building!==context.building)return false;
  if(action.type==='quest')return action.quest===context.quest;
  if(action.type==='move')return action.from===context.from&&action.to===context.to&&(step.id!=='wa-organize'||run.game.board[context.to].warriors.alliance===0);
  if(action.type==='slip')return action.to===context.to;
  if(action.type==='organize')return action.clearing===context.to;
  if(action.target!==undefined&&context.target!==undefined&&action.target!==context.target)return false;
  if(action.clearing!==undefined&&context.clearing!==undefined)return action.clearing===context.clearing;
  return true;
}
function achieved(run,action){
  const state=run.game,step=currentStep(run);
  switch(step.goal){
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
  if(command.type==='retry-step'){run.game=structuredClone(run.checkpoint.game);run.context=structuredClone(run.checkpoint.context);run.count=0;run.attempt=(run.attempt||0)+1;run.ready=currentStep(run).goal==='read';return run;}
  if(command.type==='next'){
    ensure(run.ready,'请先完成当前教学目标');
    if(run.step+1===lessonById(run.lessonId).steps.length){run.completed=true;run.everCompleted=true;return run;}
    run.step++;prepareStep(run);return run;
  }
  ensure(command.type==='action'&&!run.ready,'请点击继续进入下一节');
  ensure(command.action&&allowed(run,command.action),'请按本节目标操作，可查看提示或重试本节');
  run.game=resolveOpponents(rules.applyAction(run.game,run.userId,command.action,rng),run.userId);
  if(currentStep(run).goal==='twice')run.count++;
  run.ready=achieved(run,command.action);return run;
}
export function projectTutorial(run,version){
  const lesson=lessonById(run.lessonId),step=currentStep(run);
  const game=rules.projectGame(run.game,run.userId);
  const actionTypes=run.ready||run.completed?[]:step.actions;
  const permitted=action=>actionTypes.includes(action.type)&&allowed(run,action);
  game.mapActions=game.mapActions.filter(permitted);
  game.factionActions=game.factionActions.filter(option=>permitted(option.action));
  game.craftOptions=game.craftOptions.filter(option=>permitted({type:'craft',card:option.card}));game.effectOptions=[];
  if(game.choice&&!game.choice.waiting)game.choice.options=game.choice.options.filter(option=>permitted({type:'choice',optionId:option.id}));
  return {code:`tutorial-${run.lessonId}`,title:`基础教程 · ${lesson.title}`,ownerId:run.userId,version,status:'playing',capacity:4,locked:true,members:game.players.map(p=>({userId:p.id,name:p.name,faction:p.faction,ready:true})),gameId:run.id,game,tutorial:{id:run.id,lessonId:lesson.id,title:lesson.title,index:run.step,attempt:run.attempt||0,total:lesson.steps.length,stepId:step.id,heading:step.title,text:step.text,result:run.ready?step.result:'',ready:run.ready,completed:run.completed,actionTypes,context:run.context,count:run.count,goalCount:step.goal==='twice'?2:1,reading:step.goal==='read',newScene:!!step.scene&&!['basic-march','wa-next'].includes(step.scene)}};
}
