// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import {unseenEvents,presentationPlan} from './presentation-model.js';
import {motionDuration,playSound,stopSounds} from './sound.js';
const names={cat:'猫咪贵族',bird:'飞鹰王朝',alliance:'森林联盟',vagabond:'神秘游侠',lizard:'蜥蜴神教'};
const columns={recruit:'招募',move:'移动',battle:'战斗',build:'建造'};
const majors=new Set(['battle','dice','score','draw','craft','aid','supporter','turmoil','revolt']);
let contextKey=null,previous=null,queue=[],active=null,frame=null,art={};
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function board(){return document.querySelector('.map-card');}
function anchor(id){
  const host=board();if(!host)return null;
  const target=host.querySelector(`.clearing[data-id="${Number(id)}"] .ground`)||host.querySelector(`[data-action=forest-info][data-id="${Number(id)}"]`);
  if(!target)return null;
  const r=target.getBoundingClientRect(),b=host.getBoundingClientRect();return {x:r.x+r.width/2-b.x,y:r.y+r.height/2-b.y};
}
function busy(value){
  const host=board();if(host)host.dataset.presentationBusy=String(value);
  for(const button of document.querySelectorAll('.tutorial-buttons [data-action=tutorial-next],.tutorial-buttons [data-action=tutorial-guide-next],.tutorial-buttons [data-action=tutorial-coach-next]')){
    if(value){if(!('motionDisabled' in button.dataset))button.dataset.motionDisabled=button.dataset.busyDisabled??String(button.disabled);button.disabled=true;}
    else if('motionDisabled' in button.dataset){button.disabled=button.dataset.motionDisabled==='true'||'busyDisabled' in button.dataset;delete button.dataset.motionDisabled;}
  }
}
function clearFocus(){document.querySelectorAll('.presentation-focus').forEach(el=>el.classList.remove('presentation-focus'));}
function reset(){cancelAnimationFrame(frame);frame=null;queue=[];for(const slot of active?.slots||[])slot.layer?.remove();active=null;clearFocus();busy(false);stopSounds();}
function label(event){
  const who=names[event.faction]||'林间旅伴';
  return {move:`${who} · 移动 ${event.count||1} 名`,battle:`${who} · 发起战斗`,dice:'战斗掷骰',build:`${who} · 建筑落成`,pieces:`${who} · 战士 +${event.count}`,score:`${who} · ${event.delta>0?'+':''}${event.delta} 分`,draw:`${who} · 抽取 ${event.count} 张牌`,craft:`${who} · 锻造完成`,aid:'援助 · 交付一张手牌',supporter:'森林联盟 · 支持者 +1',turmoil:'飞鹰王朝倒台',revolt:`森林联盟起义 · 秋林 ${event.clearing}`,catchup:'棋局已更新'}[event.kind]||'林间动态';
}
function createLayer(slot){
  const {event,duration}=slot,layer=node('div','presentation-layer'+(majors.has(event.kind)?' presentation-major':''));
  layer.dataset.kind=event.kind;layer.dataset.eventSeq=String(event.seq??'legacy');layer.setAttribute('aria-live','polite');
  layer.style.setProperty('--duration',motionDuration(duration)+'ms');layer.style.setProperty('--major-slot',slot.majorSlot||0);
  const banner=node('div','presentation-announcement',label(event));layer.append(banner);Object.assign(slot,{layer,banner,steps:0});
  if(event.kind==='move'){
    const token=node('div','presentation-moving-unit'),src=art.units?.[event.faction]||art.symbols?.[event.faction];
    if(src){const img=node('img','');img.src=src;img.alt=names[event.faction]||'战士';token.append(img);}
    token.append(node('span','',String(event.count||1)));layer.append(token);slot.token=token;
  }else if(event.kind==='dice'){
    const dice=node('div','presentation-dice');for(let i=0;i<2;i++)dice.append(node('span','presentation-die','•'));banner.prepend(dice);slot.dice=dice;
  }else if(['draw','aid','supporter'].includes(event.kind)){
    const cards=node('div','presentation-card-flight');for(let i=0;i<Math.min(event.count||1,3);i++)cards.append(node('span','presentation-card-back','♧'));banner.prepend(cards);slot.cards=cards;
  }else if(event.kind==='score'){
    const award=node('div','presentation-score',`${event.delta>0?'+':''}${event.delta}`);banner.prepend(award);slot.award=award;
  }else if(event.kind==='battle'||event.kind==='craft')banner.prepend(node('div','presentation-emblem',event.kind==='battle'?'⚔':'⚒'));
  else if(event.kind==='build'||event.kind==='pieces'){
    const source=board().querySelector(`.clearing[data-id="${Number(event.clearing)}"] ${event.kind==='build'?`[data-piece="${event.building}"]`:`.clearing-unit.${event.faction}`}`),image=source?.querySelector('img');
    if(image){const token=node('img','presentation-pop');token.src=image.src;token.alt=event.kind==='build'?'建筑落成':'战士入场';layer.append(token);slot.pop=token;}
  }else if(event.kind==='turmoil'){
    banner.replaceChildren(node('h3','',label(event)));
    const portrait=art.leaders?.[event.leader];if(portrait){const img=node('img','turmoil-leader');img.src=portrait;img.alt='退位的飞鹰领袖';banner.append(img);}
    const stages=node('ol','turmoil-stages');for(const text of ['法令受阻','失去胜利分数','旧领袖退位'])stages.append(node('li','',text));banner.append(stages);
    const details=node('p','turmoil-details');banner.append(details);slot.details=details;slot.stages=stages;
    const decree=node('div','turmoil-decree');for(let i=0;i<Math.min(event.discarded||0,8);i++)decree.append(node('span','presentation-card-back','♧'));banner.append(decree);slot.decree=decree;
  }
  board().append(layer);void playSound(event.kind);
}
function start(){
  if(active||!queue.length||!board())return;
  const first=queue.shift(),events=[first];
  if(first.batch!==undefined)while(queue.length&&queue[0].batch===first.batch)events.push(queue.shift());
  const slots=presentationPlan(events);let majorSlot=0;
  for(const slot of slots)if(majors.has(slot.event.kind)&&slot.delay===0)slot.majorSlot=majorSlot++;
  active={slots,start:performance.now()};busy(true);frame=requestAnimationFrame(tick);
}
function renderSlot(slot,p,host){
  const {event,layer}=slot;layer.style.setProperty('--progress',p);const point=anchor(event.clearing);
  if(event.clearing!==undefined)host.querySelector(`.clearing[data-id="${Number(event.clearing)}"]`)?.classList.add('presentation-focus');
  if(slot.token){
    const from=anchor(event.from),to=anchor(event.to);if(from&&to){slot.token.style.left=(from.x+(to.x-from.x)*p)+'px';slot.token.style.top=(from.y+(to.y-from.y)*p-Math.sin(p*Math.PI)*10)+'px';}
    if(p>slot.steps/3&&slot.steps<3){slot.steps++;if(slot.steps>1)void playSound('move');}
  }
  if(slot.pop&&point){slot.pop.style.left=point.x+'px';slot.pop.style.top=point.y+'px';const scale=p<.3?.35+p*2.8:1.19-Math.min(1,(p-.3)/.25)*.19;slot.pop.style.transform=`translate(-50%,-50%) scale(${scale})`;slot.pop.style.opacity=String(p>.9?(1-p)/.1:1);}
  if(slot.dice&&p>.45){slot.dice.dataset.landed='true';[...slot.dice.children].forEach((el,i)=>el.textContent=String(event.values?.[i]??0));slot.banner.setAttribute('aria-label',`战斗掷骰 ${event.values?.join(' / ')}`);}
  if(slot.cards)slot.cards.style.transform=`translate(${(1-p)*65}px,${-Math.sin(p*Math.PI)*24}px) rotate(${(1-p)*-12}deg)`;
  if(slot.award)slot.award.style.transform=`translateY(${-Math.sin(p*Math.PI)*12}px) scale(${.9+Math.sin(p*Math.PI)*.15})`;
  if(slot.details){
    const stage=Math.min(2,Math.floor(p*3));layer.dataset.turmoilStage=String(stage);
    [...slot.stages.children].forEach((el,i)=>el.classList.toggle('current',i===stage));
    const messages=[`无法执行${columns[event.column]||'当前'}法令，王朝陷入动乱。`,event.birdCards===undefined?`实际失去 ${Math.abs(event.delta||0)} 分。`:`法令中有 ${event.birdCards} 张飞鸟牌，实际失去 ${Math.abs(event.delta||0)} 分。`,event.discarded===undefined?'旧领袖退位，请选择新的领袖。':`弃置 ${event.discarded} 张法令牌，保留 ${event.viziers} 张大臣。旧领袖退位，请选择新的领袖。`];
    if(slot.details.textContent!==messages[stage])slot.details.textContent=messages[stage];
    slot.decree.style.transform=stage===2?`translateY(${(p-2/3)*200}px) rotate(${(p-2/3)*35}deg)`:'none';slot.decree.style.opacity=stage===2?String(Math.max(0,1-(p-2/3)*3)):'.9';
  }
}
function tick(now){
  if(!active)return;const host=board();if(!host){reset();return;}clearFocus();let pending=false;
  for(const slot of active.slots){
    if(slot.done)continue;const elapsed=now-active.start-motionDuration(slot.delay);if(elapsed<0){pending=true;continue;}
    if(!slot.layer)createLayer(slot);if(slot.layer.parentElement!==host)host.append(slot.layer);
    const duration=motionDuration(slot.duration),p=duration?Math.min(1,elapsed/duration):1;renderSlot(slot,p,host);
    if(p<1)pending=true;else{slot.layer.dataset.completed='true';slot.layer.remove();slot.done=true;}
  }
  if(pending){frame=requestAnimationFrame(tick);return;}
  active=null;frame=null;clearFocus();if(queue.length)start();else busy(false);
}
export function observePresentation(game,assets,options={}){
  if(!game){reset();previous=null;contextKey=null;return;}art=assets;
  const key=options.context||game.players.map(p=>p.id).join('|');
  if(document.hidden){reset();contextKey=key;previous=structuredClone(game);return;}
  if(contextKey!==key){reset();contextKey=key;previous=structuredClone(game);return;}
  const fresh=unseenEvents(previous,game);previous=structuredClone(game);queue.push(...fresh);
  while(queue.length>64){const batch=queue[0].batch;if(batch===undefined)queue.shift();else queue=queue.filter(event=>event.batch!==batch);}
  if(active){for(const slot of active.slots)if(slot.layer&&!slot.done)board()?.append(slot.layer);busy(true);}else start();
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
