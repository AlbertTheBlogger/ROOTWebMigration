// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { observePresentation } from './motion.js';
import { renderLogGroups } from './log-ui.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const effects = {
 ambush:'作为防守方，在掷骰前打出匹配林地花色的伏击牌，造成2点伤害。进攻方可用匹配伏击牌反制。',
 favor:'移除所有匹配此牌花色林地中的敌方棋子，按移除与阵营规则结算。',
 armorers:'战斗中弃置此牌，忽略对手骰子造成的伤害。',
 brutal:'进攻时可额外造成1点伤害，防守方获得1分。',
 sappers:'防守时可弃置此牌，额外造成1点伤害。',
 cobbler:'夜晚可额外移动一次。',
 tax:'白昼移除一名战士，抽一张匹配林地花色的牌。',
 codebreakers:'白昼查看另一名玩家的手牌。',
 standdeliver:'清晨从另一名玩家手中随机拿取一张牌，该玩家获得1分。',
 royalclaim:'清晨可弃置，每个你统治的林地获得1分。',
 bank:'清晨选择另一名玩家，你和对方各抽一张牌。',
 commandwarren:'白昼开始时可额外发起一次战斗。',
 scouting:'你进攻时，防守方不能打出伏击牌。',
 dominance:'达到10分后可在白昼激活，停止通过胜利分获胜。匹配花色统治牌要求在清晨开始时统治三个匹配林地，鸟类要求统治一对对角林地。四人局游侠可与符合条件的最低分玩家结盟。',
};
const leaderAbilities={despot:'大臣位于移动、建造。每场战斗中移除至少一个敌方建筑或标记时，额外获得1分。',commander:'大臣位于移动、战斗。进攻时额外造成1点伤害。',charismatic:'大臣位于招募、战斗。每次法令招募放置2名战士。',builder:'大臣位于招募、移动。锻造物品获得完整分数。'};
export function previewLeader(leader,art,names,options={}){
  previewCard({name:names[leader]||leader,image:art.leaders[leader],description:leaderAbilities[leader]},art,names,options);
}
function show(title, body) {
  const parent=[...document.querySelectorAll('dialog.card-preview[open]')].at(-1);
  const returnFocus=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='card-preview'+(parent?' nested-preview':'');
  dialog.innerHTML=`<button data-close-preview class="preview-close" aria-label="关闭">×</button><h2>${escape(title)}</h2>${body}`;
  dialog.setAttribute('aria-label',title);
  dialog.addEventListener('click',event=>{
    const bounds=dialog.getBoundingClientRect();
    const backdrop=event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom);
    if(backdrop||event.target.closest('[data-close-preview]'))dialog.close();
  });
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    else if(parent?.open)parent.querySelector('[data-close-preview]')?.focus({preventScroll:true});
  },{once:true});
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
export function previewCard(card, art, names, options={}) {
  const definition=(art.catalog||[]).find(value=>value.type===card.archetype)||{};
  const value={...definition,...card};
  const source=art.cards[value.archetype]||art.dominance?.[value.archetype]||art.quests?.[value.id]||value.image;
  const suit=art.suits[value.suit];
  const cost=(value.cost||[]).map(s=>names[s]||'任意').join(' + ');
  const item=value.item?`锻造获得${names[value.item]}，获得 ${value.points} 分。`:'';
  const quest=value.items?`耗竭 ${value.items.map(type=>names[type]).join(' + ')}。选择抽两张牌，或按已完成的同花色任务数量得分。`:'';
  const dialog=show(value.name||'牌面',`<article class="full-card"><div>${suit?`<img class="faction-icon" src="${escape(suit)}" alt="${escape(names[value.suit])}">`:''}<strong>${escape(names[value.suit]||'')}</strong></div>${source?`<img class="full-card-art" src="${escape(source)}" alt="${escape(value.name)}">`:''}${cost?`<p>锻造要求　${escape(cost)}</p>`:''}<p>${escape(item||quest||value.description||effects[value.kind]||'')}</p></article>`);
  if(options.minimizable){const button=dialog.querySelector('[data-close-preview]');button.textContent='最小化';button.setAttribute('aria-label','最小化手牌详情');dialog.classList.add('tutorial-card-preview');}
}
export function paymentSupporters(supporters, suit, cost) {
  return supporters.filter(card=>card.suit===suit||card.suit==='wild')
    .sort((a,b)=>Number(a.suit==='wild')-Number(b.suit==='wild')).slice(0,cost);
}
export function decorate(game,userId,art,names) {
  if(!game)return;
  for(const button of document.querySelectorAll('[data-action="leader-preview"]')){
    if(button.dataset.previewBound)continue;
    button.dataset.previewBound='true';
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      previewLeader(button.dataset.leader,art,names);
    });
  }
  const cards=[...game.players.flatMap(p=>[...(p.hand||[]),...(p.crafted||[])]),...(game.alliance?.supporters||[]),...Object.values(game.bird?.decree||{}).flat(),...(game.quests||[]),...(game.revealedHand?.cards||[]),...(game.outrageReveal?.cards||[])];
  for(const image of document.querySelectorAll('.card img,.supporter-art,.crafted-art,.choice-art,.quest-art')) {
    // Choice cards are controls: tapping their artwork selects the option.
    if(image.closest('[data-map-choice],[data-action="choice"]'))continue;
    if(image.dataset.previewBound)continue;
    const card=cards.find(card=>card.name===image.alt);
    image.dataset.previewBound='true';image.classList.add('preview-image');image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label','查看完整牌面 '+image.alt);
    const leader=Object.keys(art.leaders||{}).find(key=>new URL(art.leaders[key],location.href).href===image.src);
    const character=Object.keys(art.characters||{}).find(key=>new URL(art.characters[key],location.href).href===image.src);
    const characterInfo=art.characterDetails?.[character];
    const open=event=>{event.preventDefault();event.stopPropagation();previewCard(card||{name:image.alt,image:image.src,description:characterInfo?characterInfo.ability+'。'+characterInfo.cost+characterInfo.description:leaderAbilities[leader]||image.closest('button')?.textContent},art,names);};
    image.addEventListener('click',open);image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')open(event);});
  }
  // Public decree cards retain their visible card identities.
  document.querySelectorAll('.decree > div').forEach((column,index)=>{
    const entries=game.bird?.decree?.[column.dataset.decreeColumn||['recruit','move','battle','build'][index%4]]||[];
    column.querySelectorAll('.pip').forEach((pip,i)=>{
      const card=entries[i];if(!card||pip.dataset.previewBound)return;
      pip.dataset.previewBound='true';pip.tabIndex=0;pip.setAttribute('role','button');
      const open=()=>previewCard(card.vizier?{...card,name:'大臣',image:art.leaders[game.bird.leader],description:'大臣是法令中的永久鸟类牌，动乱时保留。'}:card,art,names);
      pip.addEventListener('click',open);pip.addEventListener('keydown',e=>{if(e.key==='Enter')open();});
    });
  });
  const active=game.players[game.turn]?.id===userId&&!game.choice&&!game.winner;
  const options=active?(game.factionActions||[]):[];
  const areas=new Map();
  for(const option of options){const id=option.action.clearing??option.action.to;if(id!==undefined&&!areas.has(id))areas.set(id,option);}
  document.querySelectorAll('[data-action="clearing"]').forEach(node=>{
    const id=Number(node.dataset.id);const option=areas.get(id);node.classList.toggle('actionable',!!option);
    node.querySelectorAll('.payment-hint').forEach(h=>h.remove());
    if(!option||!['spread','revolt'].includes(option.action.type))return;
    const area=game.board.find(c=>c.id===id);const count=game.board.filter(c=>c.sympathy).length;
    const cost=option.action.type==='revolt'?2:([1,1,1,2,2,2,3,3,3,3][count]||3)+(Object.entries(area.warriors).some(([f,n])=>f!=='alliance'&&n>=3)?1:0);
    const payment=paymentSupporters(game.alliance.supporters||[],area.suit,cost);
    const hint=document.createElement('span');hint.className='payment-hint';
    hint.title=`自动支付 ${payment.map(card=>card.suit==='wild'?'飞鹰万能牌':names[card.suit]+'牌').join(' + ')}`;
    hint.innerHTML=payment.map(card=>{
      const source=card.suit==='wild'?(art.suits.wild||art.symbols.bird||art.units.bird):art.suits[card.suit];
      const label=card.suit==='wild'?'飞鹰万能牌':names[card.suit]+'牌';
      return `<img src="${escape(source)}" alt="${escape(label)}" title="${escape(card.name||label)}">`;
    }).join('');
    const host=node.querySelector('.clearing-marker')||node;host.append(hint);
  });
}
export function selectClearing(game,id) {
  for(const group of document.querySelectorAll('.faction-action-group')){
    const select=group.querySelector('select[name=option]');
    const match=[...select.options].find(option=>{const action=game.factionActions[Number(option.value)]?.action;return action&&(action.clearing===id||action.to===id);});
    if(match){select.value=match.value;group.open=true;}
  }
  for(const select of document.querySelectorAll('form select[name=clearing],form select[name=to]'))if([...select.options].some(o=>Number(o.value)===id))select.value=String(id);
}
export function observe(game,art,options){observePresentation(game,art,options);}
export function showEvents(game){show('近期操作',`<div class="event-history">${renderLogGroups(game||{log:[]})}</div>`);}

export function showPublicDetails(title,body){show(title,body);}
