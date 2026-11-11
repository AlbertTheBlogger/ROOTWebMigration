let mounted=null;
let state={context:null,version:null,activeKey:null,picked:null,from:null,drafts:new Map()};
let announced='';
const numeric=value=>/^\d+$/.test(String(value));
const element=(tag,className,text)=>{const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;};

function targetOf(action,game){
  if(action.clearing!==undefined)return action.clearing;
  if(action.to!==undefined)return action.to;
  if(action.clearings)return action.clearings[0];
  if(['explore','aid','quest','repair','strike','special'].includes(action.type))return game.vagabond?.position;
  return null;
}
function formKey(form,index){return form.id||`${form.dataset.type}-${form.closest('[data-category]')?.dataset.category||form.querySelector('[name=card]')?.value||index}`;}
function actionsFor(entry,game){
  if(!entry)return [];
  if(entry.form.dataset.type==='faction-action')return [...entry.form.querySelector('[name=option]').options].map(o=>game.factionActions[Number(o.value)]?.action).filter(Boolean);
  const type=entry.form.dataset.type||entry.form.id;
  let actions=(game.mapActions||[]).filter(action=>action.type===type);
  if(!game.mapActions&&type==='move'){
    const faction=game.players[game.turn].faction;
    const ruler=area=>{
      const strengths=Object.entries(area.warriors).map(([f,n])=>[f,n+area.buildings.filter(b=>b.faction===f).length]);
      const maximum=Math.max(...strengths.map(([,n])=>n));const tied=strengths.filter(([,n])=>n===maximum);
      return maximum>0?(tied.some(([f])=>f==='bird')?'bird':tied.length===1?tied[0][0]:null):null;
    };
    actions=game.board.flatMap(from=>from.warriors[faction]>0?from.links.filter(id=>ruler(from)===faction||ruler(game.board[id])===faction).map(to=>({type:'move',from:from.id,to,count:1})):[]);
  }

  if(type==='effect')actions=actions.filter(action=>action.card===entry.form.elements.card?.value);
  const decree=document.querySelector('#decree-card');
  if(decree&&actions.some(action=>action.decreeCard))actions=actions.filter(action=>action.decreeCard===decree.value);
  if(type==='build'&&entry.form.elements.building)actions=actions.filter(action=>action.building===entry.form.elements.building.value);
  return actions;
}
function saveDrafts(){
  if(!mounted)return;
  const decree=mounted.overlay.querySelector('#decree-card');
  if(decree)state.decreeCard=decree.value;
  for(const entry of mounted.entries)state.drafts.set(entry.key,[...new FormData(entry.form).entries()]);
}
function restoreDraft(entry){
  const values=state.drafts.get(entry.key);if(!values)return;
  for(const control of entry.form.querySelectorAll('[name]')){
    if(control.type==='hidden')continue;
    const matches=values.filter(([name])=>name===control.name).map(([,value])=>value);
    if(control.type==='checkbox')control.checked=matches.includes(control.value);
    else if(matches.length)control.value=matches[0];
  }
}
function title(text){
  const value=String(text||'选择操作').replace('放置初始','设置').replace('选择猫咪贵族城堡所在角落','设置城堡').replace('行军 · 一次行动最多两次移动','行军');
  const banner=mounted.banner;banner.textContent=value;
  const key=state.context+'|'+value;
  if(announced!==key){announced=key;banner.classList.remove('stage-intro');void banner.offsetWidth;banner.classList.add('stage-intro');}
}
function positionPopup(id){
  const {board,popup}=mounted;
  const anchor=[...board.querySelectorAll('[data-action=clearing],[data-action=forest-info]')].find(node=>Number(node.dataset.id)===id);
  if(!anchor){popup.classList.add('centered');return;}
  popup.classList.remove('centered');
  const box=board.getBoundingClientRect(),point=anchor.getBoundingClientRect();
  const width=Math.min(popup.classList.contains('compact')?190:370,box.width-20);
  popup.style.width=width+'px';
  popup.style.left=Math.max(10,Math.min(box.width-width-10,point.right-box.left+8))+'px';
  const height=Math.min(popup.scrollHeight,box.height*.65);
  popup.style.top=Math.max(62,Math.min(box.height-height-12,point.top-box.top))+'px';
}
function clearHighlights(){for(const node of mounted.board.querySelectorAll('.actionable'))node.classList.remove('actionable');}
function highlight(ids){
  clearHighlights();
  for(const node of mounted.board.querySelectorAll('[data-action=clearing],[data-action=forest-info]'))node.classList.toggle('actionable',ids.has(Number(node.dataset.id)));
}
function confirmChoice(id){
  const {game,popup}=mounted;
  popup.classList.add('compact');popup.replaceChildren();
  const label=element('p','map-target-label',`${id>=12?'森林':'秋林'} ${id}`);
  const confirm=element('button','primary map-confirm','确认');confirm.type='button';
  confirm.dataset.action='choice';confirm.dataset.choice=game.choice.choiceId;confirm.dataset.option=String(id);
  popup.append(label,confirm,cancelButton());popup.hidden=false;positionPopup(id);
}
function cancelButton(){
  const button=element('button','quiet map-cancel','取消');button.type='button';
  button.addEventListener('click',()=>{state.picked=null;state.from=null;refresh();});return button;
}
function syncMinimize(){
  const {popup,menu,minimize,overlay}=mounted;
  overlay.classList.toggle('minimized',!!state.minimized);
  minimize.textContent=state.minimized?'展开操作':'最小化';
  minimize.setAttribute('aria-label',state.minimized?'展开操作':'最小化操作');
  minimize.setAttribute('aria-expanded',String(!state.minimized));
  if(state.minimized)menu.append(minimize);
  else if(!popup.hidden)popup.prepend(minimize);
  else minimize.remove();
  if(!popup.hidden&&state.picked!==null)positionPopup(state.picked);
}
function refresh(){renderControls();syncMinimize();}
function movementControls(entry,actions){
  const host=mounted.movement;
  host.replaceChildren();
  if(!actions.some(action=>action.type==='move'&&action.from!==undefined))return;
  const selectField=(label,values,value,change)=>{
    const wrapper=element('label','',label);
    const select=element('select','');select.setAttribute('aria-label',label);
    const placeholder=element('option','','请选择');placeholder.value='';select.append(placeholder);
    for(const id of values){const option=element('option','',`秋林 ${id}`);option.value=String(id);select.append(option);}
    select.value=value===null?'':String(value);select.disabled=label==='移动终点'&&state.from===null;select.addEventListener('change',()=>change(select.value===''?null:Number(select.value)));
    wrapper.append(select);host.append(wrapper);
  };
  selectField('移动起点',[...new Set(actions.map(a=>a.from))],state.from,value=>{state.from=value;state.picked=null;refresh();});
  selectField('移动终点',[...new Set(actions.filter(a=>state.from===null||a.from===state.from).map(a=>a.to))],state.picked,value=>{if(value===null){state.picked=null;refresh();}else pickMapClearing(value);});
  const matches=actions.filter(a=>a.from===state.from&&a.to===state.picked);
  if(!matches.length)return;
  const form=entry.form;
  if(form.dataset.type==='faction-action'){
    const label=element('label','','移动数量');const count=element('select','');count.setAttribute('aria-label','移动数量');
    const selected=mounted.game.factionActions[Number(form.elements.option.value)]?.action;
    for(const n of [...new Set(matches.map(a=>a.count))]){const option=element('option','',String(n));option.value=String(n);count.append(option);}
    count.value=String(selected?.count||matches[0].count);
    count.addEventListener('change',()=>{const action=matches.find(a=>a.count===Number(count.value));form.elements.option.value=String(mounted.game.factionActions.findIndex(option=>option.action===action));saveDrafts();});
    label.append(count);host.append(label);
  }
}
function renderControls(){
  const {game,popup,entries,numericChoice}=mounted;
  for(const entry of entries){entry.form.hidden=true;for(const option of entry.form.querySelectorAll('option[data-map-filtered]')){option.disabled=false;delete option.dataset.mapFiltered;}}
  popup.hidden=true;mounted.movement.replaceChildren();
  if(numericChoice){
    title(game.choice.prompt);highlight(new Set(game.choice.options.map(o=>Number(o.id))));
    if(state.picked!==null)confirmChoice(state.picked);return;
  }
  const entry=entries.find(e=>e.key===state.activeKey);
  for(const config of mounted.overlay.querySelectorAll('[data-map-for]'))config.hidden=config.dataset.mapFor!==state.activeKey;
  for(const button of mounted.menu.querySelectorAll('[data-map-mode]'))button.classList.toggle('active',button.dataset.mapMode===state.activeKey);
  if(!entry){clearHighlights();return;}
  popup.classList.remove('compact');
  const actions=actionsFor(entry,game);
  if(entry.form.id==='build'&&game.mapActions&&actions.length===0){
    title('目前无法建造 · 请检查木材、统治和建筑空位');
    clearHighlights();return;
  }
  const moving=actions.some(a=>a.type==='move'&&a.from!==undefined)||entry.form.id==='move';
  movementControls(entry,actions);
  const spatial=!!entry.form.querySelector('[name=clearing],[name=from],[name=to]')||actions.some(a=>targetOf(a,game)!==null);
  title(entry.label+(moving?(state.from===null?' · 选择起点':' · 选择终点'):spatial?' · 点击目标地块':''));
  let available=actions;
  if(moving){
    if(state.from===null){highlight(new Set(actions.map(a=>a.from)));return;}
    available=actions.filter(a=>a.from===state.from);
  }
  let ids=new Set(available.flatMap(a=>a.clearings||[targetOf(a,game)]).filter(id=>id!==null));
  // Older rulesets still use their established target selectors.
  if(spatial&&!game.mapActions&&ids.size===0){const select=entry.form.querySelector('[name=clearing],[name=to]');if(select)ids=new Set([...select.options].map(o=>Number(o.value)));}
  highlight(ids);
  if(spatial&&state.picked===null)return;
  if(spatial&&!ids.has(state.picked)){state.picked=null;return;}
  if(entry.form.dataset.type==='faction-action'&&spatial){for(const option of entry.form.elements.option.options){const action=game.factionActions[Number(option.value)]?.action;if(action&&(targetOf(action,game)!==state.picked||(state.from!==null&&action.from!==state.from))){option.disabled=true;option.dataset.mapFiltered='true';}}}
  entry.form.classList.toggle('map-army-move',moving);
  popup.replaceChildren(entry.form,cancelButton());entry.form.hidden=false;popup.hidden=false;
  if(spatial){const label=element('p','map-target-label',`${state.from!==null?'秋林 '+state.from+' → ':''}${state.picked>=12?'森林':'秋林'} ${state.picked}`);popup.prepend(label);}
  if(spatial)positionPopup(state.picked);else{popup.classList.add('centered');popup.style.removeProperty('left');popup.style.removeProperty('top');}
}
export function pickMapClearing(id){
  if(!mounted)return false;
  const {game,entries,numericChoice}=mounted;
  if(numericChoice){if(!game.choice.options.some(o=>Number(o.id)===id)){state.picked=null;refresh();return false;}state.picked=id;refresh();return true;}
  const entry=entries.find(e=>e.key===state.activeKey);if(!entry)return false;
  const actions=actionsFor(entry,game);
  if((actions.some(a=>a.type==='move'&&a.from!==undefined)||entry.form.id==='move')&&state.from===null){
    if(!actions.some(a=>a.from===id))return false;
    state.from=id;state.picked=null;refresh();return true;
  }
  const action=actions.find(a=>(targetOf(a,game)===id||a.clearings?.includes(id))&&(state.from===null||a.from===state.from));
  if(!action&&game.mapActions){state.picked=null;refresh();return false;}
  state.picked=id;
  state.minimized=false;
  const form=entry.form;
  if(action&&form.dataset.type==='faction-action'){
    const index=game.factionActions.findIndex(option=>option.action===action);
    form.elements.option.value=String(index);
  }else{
    if(form.elements.clearing)form.elements.clearing.value=String(id);
    if(form.elements.to)form.elements.to.value=String(id);
    if(form.elements.from&&state.from!==null)form.elements.from.value=String(state.from);
    if(game.mapActions&&action?.type==='move'&&form.elements.count){const maximum=Math.max(...actions.filter(a=>a.from===state.from&&a.to===id).map(a=>a.count));form.elements.count.max=String(maximum);form.elements.count.value=String(Math.min(Number(form.elements.count.value)||1,maximum));}
    if(action?.wood&&form.elements.wood)form.elements.wood.value=action.wood.join(',');
    if(action?.decreeCard){const select=document.querySelector('#decree-card');if(select)select.value=action.decreeCard;}
  }
  refresh();return true;
}
export function mountMapControls({game,userId,version,gameId,tutorial}){
  const source=document.querySelector('.actions');const board=document.querySelector('.map-card');if(!source||!board)return;
  saveDrafts();mounted?.observer?.disconnect();
  const context=[gameId,game.turn,game.round,game.phase,game.choice?.choiceId].join('|');
  if(state.context!==context)state={context,version,activeKey:null,picked:null,from:null,drafts:new Map()};
  else if(state.version!==version){state.version=version;state.picked=null;state.from=null;state.choiceOption=null;state.drafts.clear();}
  const overlay=element('div','map-controls actions');overlay.dataset.ruleset=game.ruleset;const banner=element('div','map-stage');banner.setAttribute('role','status');
  const menu=element('div','map-action-menu');const popup=element('section','map-context');popup.hidden=true;popup.setAttribute('aria-label','地图操作确认');
  const entries=[...source.querySelectorAll('form')].map((form,index)=>({form,key:formKey(form,index),label:form.closest('details')?.querySelector('summary')?.textContent||form.querySelector('button[type="submit"],button:not([type])')?.textContent||'选择操作'}));
  const numericChoice=!!game.choice&&!game.choice.waiting&&game.choice.options.length>0&&game.choice.options.every(o=>numeric(o.id));
  const status=element('div','map-turn-status');
  const instructions=source.querySelector('h2')?.textContent||'';
  status.textContent=game.winner?instructions+' · '+(source.querySelector('p')?.textContent||''):game.choice?.waiting?`${game.players.find(p=>p.id===game.choice.playerId)?.name||'其他玩家'} 正在选择`:!game.choice&&game.players[game.turn]?.id!==userId&&!game.winner?`${game.players[game.turn].name} 正在行动`:'';
  if(!game.choice&&game.players[game.turn]?.id===userId&&!game.winner){
    if(game.phase==='wood')status.textContent=`待生产木材 ${game.woodPending.length} 枚`;
    if(game.phase==='daylight'&&game.players[game.turn].faction==='cat')status.textContent=`剩余行动 ${game.actions}${game.march?' · 行军中':''}`;
    if(game.phase==='military')status.textContent=`剩余军事行动 ${game.alliance.operations} · 长官 ${game.alliance.officers}`;
    if(game.phase==='refresh')status.textContent=`还可恢复 ${game.vagabond.refreshLeft} 个物品`;
    if(game.phase==='decree-add')status.textContent=`已添加法令 ${game.bird.added} / 2，本轮最多一张鸟类牌`;
    if(game.phase==='discard')status.textContent=`手牌 ${game.players[game.turn].handCount} 张，需弃至5张`;
  }
  const movement=element('div','map-movement');
  if(tutorial)status.textContent=tutorial.reading?'阅读教程面板后继续':tutorial.ready?'本节目标已完成，请在教程面板继续':'按本节目标完成操作';
  mounted={board,game,userId,overlay,banner,menu,popup,entries,numericChoice,movement};
  const minimize=element('button','map-minimize',state.minimized?'展开操作':'最小化操作');minimize.type='button';minimize.dataset.mapMinimize='true';minimize.setAttribute('aria-expanded',String(!state.minimized));
  mounted.minimize=minimize;
  overlay.classList.toggle('minimized',!!state.minimized);
  minimize.addEventListener('click',()=>{saveDrafts();state.minimized=!state.minimized;syncMinimize();});
  const common=element('div','map-common');
  for(const entry of entries)restoreDraft(entry);
  const build=entries.find(e=>e.form.id==='build');
  if(build?.form.elements.building){
    const select=build.form.elements.building;select.closest('label').hidden=true;
    if(game.mapActions){
      const available=new Set(game.mapActions.filter(action=>action.type==='build').map(action=>action.building));
      for(const option of select.options)option.disabled=!available.has(option.value);
      if(!available.has(select.value))select.value=[...select.options].find(option=>!option.disabled)?.value||'';
    }
    const label=element('label','','建筑类型');label.dataset.mapFor=build.key;
    const picker=select.cloneNode(true);picker.removeAttribute('name');picker.dataset.mapBuilding='true';picker.disabled=!!game.mapActions&&![...select.options].some(option=>!option.disabled);
    label.append(picker);common.append(label);
    picker.addEventListener('change',()=>{select.value=picker.value;state.picked=null;saveDrafts();refresh();});
  }
  const decree=source.querySelector('#decree-card');if(decree){
    if([...decree.options].some(option=>option.value===state.decreeCard))decree.value=state.decreeCard;
    common.append(decree.closest('label'));decree.addEventListener('change',()=>{state.decreeCard=decree.value;state.picked=null;state.from=null;refresh();});
  }
  if(!numericChoice){
    for(const entry of entries){
      entry.form.hidden=true;entry.form.dataset.mapKey=entry.key;
      if(entry.form.id==='build'&&entry.form.elements.building)common.querySelector('[data-map-building]').value=entry.form.elements.building.value;
      const submit=entry.form.querySelector('button[type="submit"],button:not([type])');if(submit&&!submit.textContent.startsWith('确认'))submit.textContent='确认'+submit.textContent;
      const button=element('button','map-mode',entry.label);button.type='button';button.dataset.mapMode=entry.key;
      button.addEventListener('click',()=>{saveDrafts();state.activeKey=entry.key;state.picked=null;state.from=null;state.minimized=false;refresh();});menu.append(button);
      entry.form.addEventListener('change',()=>{saveDrafts();refresh();});
    }
    // Action buttons without additional fields stay directly on the map toolbar.
    for(const button of [...source.querySelectorAll('button[data-action]')].filter(b=>!b.closest('form'))){
      if(game.choice){
        const option=button.dataset.option;const label=button.textContent;const image=button.querySelector('img');
        delete button.dataset.action;button.dataset.mapChoice=option;
        button.replaceChildren();if(image)button.append(image);button.append(element('span','map-choice-label','选择'+label));
        button.addEventListener('click',event=>{
          state.choiceOption=option;
          for(const other of popup.querySelectorAll('[data-map-choice]'))other.classList.toggle('active',other===button);
          popup.querySelector('.map-choice-confirmation')?.remove();
          const confirmation=element('div','map-choice-confirmation');
          const confirm=element('button','primary map-confirm','确认');confirm.type='button';confirm.dataset.action='choice';confirm.dataset.choice=game.choice.choiceId;confirm.dataset.option=option;
          const cancel=element('button','quiet','取消');cancel.type='button';cancel.addEventListener('click',()=>{state.choiceOption=null;confirmation.remove();for(const other of popup.querySelectorAll('[data-map-choice]'))other.classList.remove('active');});
          confirmation.append(element('span','map-selected-choice','已选：'+label),confirm,cancel);popup.insertBefore(confirmation,popup.querySelector('[data-map-choice]'));
        });
        popup.append(button);popup.classList.add('centered');
      }
      else menu.append(button);
    }
    if(game.choice){popup.hidden=game.choice.waiting;title(game.choice.waiting?'等待其他玩家选择':game.choice.prompt);}
    else{
      const forced=entries.find(e=>e.form.id===game.phase||e.form.id===game.currentDecreeColumn)|| (entries.length===1?entries[0]:null);
      if(!entries.some(e=>e.key===state.activeKey))state.activeKey=forced?.key||null;
      if(!state.activeKey)title(game.phase==='finished'?'本局结束':source.querySelector('.phase')?.textContent||instructions);
    }
  }
  const resign=document.querySelector('.game-panels [data-action=resign]');if(resign)menu.append(resign);
  const store=element('div','map-form-store');store.hidden=true;
  for(const entry of entries)store.append(entry.form);
  overlay.append(banner,status,menu,common,movement,store,popup);source.remove();board.append(overlay);
  if(!game.choice||numericChoice)refresh();else syncMinimize();
  const reposition=()=>{if(!popup.hidden&&state.picked!==null)positionPopup(state.picked);};
  mounted.observer=new ResizeObserver(reposition);mounted.observer.observe(board);
}
