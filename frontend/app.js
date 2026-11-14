// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
import { moveCamera, resetCamera } from '/map-camera.js';
import {mountCompanionMap,unmountCompanionMap} from '/companion-map.js';
import { showPreferences } from '/sound.js';
import { renderLogGroups } from '/log-ui.js';
import { mountMapControls, pickMapClearing, resetMapControls } from '/map-controls.js';
import { decorate, observe, showEvents, previewCard, previewLeader, showPublicDetails } from '/experience.js';
import { clearingContents, clearingLabel } from '/clearing-ui.js';
const app=document.querySelector('#app');
let ART={cards:{},portraits:{},leaders:{},items:{},symbols:{},illustrations:{}};
function artImage(source,alt,className=''){
  return source?`<img src="${esc(source)}" alt="${esc(alt)}" class="${className}" loading="lazy" decoding="async">`:'';
}
function suitImage(suit){return artImage(ART.suits?.[suit],names[suit]||'花色','suit-art');}
function characterDetails(character){
  const details=ART.characterDetails?.[character];
  return details?`<section class="character-ability"><h3>${esc(details.name)} · ${esc(details.ability)}</h3><p>${esc(details.cost)}</p><p>${esc(details.description)}</p></section>`:'';
}
function originalHero(){return ART.illustrations.hero?artImage(ART.illustrations.hero,'ROOT 原版插画','original-hero'):forest();}
let companionMode=/^#companion=/.test(location.hash);
let controllerId=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
const viewerId=()=>S.room?.playMode==='hotseat'?S.room.viewerId:S.user?.id;
const S={user:null,rooms:[],room:null,mode:'login',selected:0,card:null,stream:null,busy:false,connected:false,history:null,ruleset:'root-lizard-cult-v6'};
const waitingDrafts=new Map();
const names={otter:'河岸商会','trade-post-fox':'狐狸贸易站','trade-post-mouse':'老鼠贸易站','trade-post-rabbit':'兔子贸易站',lizard:'蜥蜴神教','garden-fox':'狐狸花园','garden-rabbit':'兔子花园','garden-mouse':'老鼠花园',alliance:'森林联盟',vagabond:'神秘游侠',sympathy:'民意', 'base-fox':'狐狸基地','base-rabbit':'兔子基地','base-mouse':'老鼠基地',bag:'背包',boot:'靴子',crossbow:'弩',hammer:'锤子',sword:'长剑',tea:'茶壶',coin:'钱币',torch:'火把',thief:'盗贼',tinker:'工匠',ranger:'猎人',cat:'猫咪贵族',bird:'飞鹰王朝',fox:'狐狸',rabbit:'兔子',mouse:'老鼠',wild:'鸟类',sawmill:'锯木厂',workshop:'工坊',recruiter:'征兵所',roost:'鸟巢',wood:'木材',keep:'城堡',move:'移动',recruit:'招募',battle:'战斗',build:'建造',despot:'制裁者',commander:'指挥者',charismatic:'号召者',builder:'建设者'};
const phases={services:'清晨开始 · 购买商会服务','rf-prices':'夜晚 · 调整服务价格','lizard-conspiracies':'清晨 · 侍僧密谋','lizard-craft':'夜晚 · 花园锻造',wood:'清晨 · 分配木材',daylight:'白昼 · 阵营行动',revolt:'清晨 · 起义',spread:'清晨 · 传播民意',military:'夜晚 · 军事行动',refresh:'清晨 · 恢复物品',slip:'清晨 · 潜行',capacity:'夜晚 · 行囊容量','decree-add':'清晨 · 添加法令','new-roost':'清晨 · 安置鸟巢',decree:'白昼 · 执行法令',leader:'动乱 · 更换领袖',discard:'夜晚 · 弃牌',finished:'对局结束',birdsong:'清晨 · 持续牌效果',craft:'白昼 · 锻造',setup:'标准开局设置'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,cls='',disabled=false,extra='')=>`<button type="button" class="${cls}" data-action="${action}" ${disabled?'disabled':''} ${extra}>${label}</button>`;
const brand=`<svg class="brand-mark" viewBox="0 0 44 48" aria-hidden="true"><path fill="#2e5844" d="M22 0 3 13v22l19 13 19-13V13z"/><path fill="#e6d9af" d="m22 8-10 15h6l-9 12h11v7h4v-7h11l-9-12h6z"/></svg>`;
function toast(text,kind='system'){const t=document.querySelector('#toast');t.textContent=text;t.classList.toggle('game-hint',kind==='game');t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),4500);}
async function api(path,data){
  const requestControllerId=controllerId,requestCompanionMode=companionMode;
  const started=performance.now();
  const indicator=document.querySelector('#request-status')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'request-status',hidden:true}));
  if(data!==undefined){indicator.textContent='正在提交操作…';indicator.hidden=false;}
  // Reads and room commands with a persisted command ID can be retried safely.
  const retryable=data===undefined||(/\/command$/.test(path)&&typeof data.commandId==='string');
  let response;
  let attempts=0;
  try{
    while(!response){
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),retryable?(attempts===0?1500:10000):30000);
      try{
        response=await fetch(path,{method:data===undefined?'GET':'POST',signal:controller.signal,cache:'no-store',headers:{'X-Woodland-Controller':requestControllerId,'X-Woodland-Companion':requestCompanionMode?'1':'0',...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
        const headersAt=performance.now();
        const result=await response.json();
        try{
          const timings=JSON.parse(sessionStorage.getItem('woodland-request-times')||'[]');
          timings.push({path:path.split('?')[0],headersMs:Math.round(headersAt-started),totalMs:Math.round(performance.now()-started),attempts:attempts+1,server:response.headers.get('server-timing')});
          sessionStorage.setItem('woodland-request-times',JSON.stringify(timings.slice(-50)));
        }catch{}
        if(!response.ok){const error=new Error(result.error||'请求失败');error.status=response.status;throw error;}
        return result;
      }catch(error){
        if(retryable&&attempts===0&&(error.name==='AbortError'||error instanceof TypeError)){
          attempts++;
          response=null;
          if(data!==undefined)indicator.textContent='连接等待较久，正在重新连接…';
          continue;
        }
        if(error.name==='AbortError')throw new Error('连接超时，请刷新确认服务器进度后再操作');
        throw error;
      }finally{clearTimeout(timeout);}
    }
  }finally{if(data!==undefined)indicator.hidden=true;}
}

function closeStream(){S.stream?.close();S.stream=null;S.connected=false;}
function watch(code){
  closeStream();
  const stream=new EventSource(`/api/rooms/${code}/events?controller=${controllerId}&companion=${companionMode?'1':'0'}`);
  S.stream=stream;
  stream.onopen=()=>{S.connected=true;connection();};
  stream.onerror=()=>{if(S.stream!==stream)return;S.connected=false;connection();if(S.room?.playMode==='hotseat'){
    stream.close();controllerId=commandId();maskHotseat();
    const recover=async()=>{if(S.room?.code!==code||S.stream!==stream)return;try{const result=await api(`/api/rooms/${code}`);if(S.room?.code!==code||S.stream!==stream)return;S.room=result.room;render();watch(code);}catch(error){if(S.room?.code!==code||S.stream!==stream)return;if([403,404].includes(error.status)){await loadLobby();return;}if(error.status===401){closeStream();S.user=null;S.room=null;render();return;}setTimeout(recover,2000);}};
    setTimeout(recover,1500);
  }};
  stream.onmessage=event=>{
    if(S.stream!==stream)return;
    const room=JSON.parse(event.data);
    if(S.room?.code!==room.code)return;
    if(room.version>S.room.version){S.room=room;render();}
  };
  function returnToLobby(message){
    if(S.room?.code!==code)return;
    loadLobby().catch(error=>toast(error.message));
    if(message)toast(message);
  }
  stream.addEventListener('revoked',()=>{closeStream();S.user=null;S.mode='login';S.page='lobby';S.room=null;S.history=null;location.hash='';render();toast('登录状态已由管理员注销，请重新登录');});
  stream.addEventListener('removed',()=>returnToLobby());
  stream.addEventListener('deleted',()=>returnToLobby('房主已删除房间及其全部存档'));
}
function syncBusyButtons(){
  for(const button of app.querySelectorAll('button,.room-seats input,.room-seats select,#ruleset')){
    if(S.busy){if(!('busyDisabled' in button.dataset))button.dataset.busyDisabled=button.dataset.motionDisabled??String(button.disabled);button.disabled=true;}
    else if('busyDisabled' in button.dataset){button.disabled=button.dataset.busyDisabled==='true'||'motionDisabled' in button.dataset;delete button.dataset.busyDisabled;}
  }
}
function connection(){const e=document.querySelector('.connection');if(e){e.textContent=S.connected?'● 已连接 · 自动保存':'○ 正在重连 · 保留服务器进度';e.classList.toggle('offline',!S.connected);}syncBusyButtons();}
function frame(content){unmountCompanionMap();document.documentElement.classList.toggle('companion-active',!!(S.user&&S.room?.game&&S.room.companion));app.innerHTML=`<header class="topbar"><div class="brand" data-action="lobby" role="button" tabindex="0">${brand}<div><div class="brand-name">林间议事厅</div><div class="brand-sub">WOODLAND ROOMS</div></div></div><nav class="nav">${S.user?`${S.user.role==='admin'?btn('管理控制台','lobby','quiet'):btn('新手教程','tutorials','quiet')+btn('我的对局','history','quiet')}<span class="avatar">${esc(S.user.username[0].toUpperCase())}</span><span class="username muted">${esc(S.user.username)}</span>${btn('退出','logout','quiet')}`:'<span class="badge">v1.1 发布版</span>'}</nav></header><main class="wrap ${S.room?.game?'game-wrap':''}">${content}</main><footer class="footer"><span>WOODLAND ROOMS</span><span>v1.1 发布版</span></footer>${S.history?historyModal():''}`;connection();}
function limitations(){
  const ruleset=S.room?.game?.ruleset||S.room?.ruleset||S.ruleset;
  const standard=['root-cats-birds-v4','root-base-four-v5','root-lizard-cult-v6','root-riverfolk-v7'].includes(ruleset);
  const title=ruleset==='root-riverfolk-v7'?'扩展标准局 · 河岸商会':ruleset==='root-lizard-cult-v6'?'扩展标准局 · 蜥蜴神教':ruleset==='root-base-four-v5'?'基础四阵营标准局':standard?'猫鹰标准局':'历史模式';
  const lines=standard?[
    '使用秋季地图与基础牌组。',
    '依次设置城堡、初始建筑与领袖，随后按清晨、白昼、夜晚行动。',
    '两人局移除统治牌，三至四人局加入统治牌。',
  ]:['使用所选模式的地图、牌组与行动规则。','对局进度自动保存，可在离开后继续。'];
  return `<div class="notice"><details><summary><strong>${title}</strong> · ${ruleset==='root-core-lab-v1'?'基础地图':'秋季地图'} <span>查看规则</span></summary><ul>${lines.map(line=>`<li>${esc(line)}</li>`).join('')}</ul></details></div>`;
}
function forest(){return `<svg class="forest-art" viewBox="0 0 500 220" aria-hidden="true"><path fill="#dce4ce" d="M0 180Q80 80 170 140T350 110T500 145V220H0Z"/><path fill="#c5d3b8" d="M0 205Q110 120 220 180T500 160V220H0Z"/>${[[40,110,1],[100,70,1.2],[180,125,.8],[300,100,1],[380,55,1.4],[450,120,.7]].map(([x,y,z])=>`<g transform="translate(${x} ${y}) scale(${z})"><path fill="#647f5d" d="m0-45-28 60h16l-26 40h76L12 15h16z"/><path fill="#8d8064" d="M-3 52h6v25h-6z"/></g>`).join('')}<path d="M185 220Q230 160 280 220" fill="#eee8d3"/><circle cx="230" cy="46" r="22" fill="#d9b96d"/><path d="m225 155-9-17-9 8-9-8-6 18v24h35z" fill="#b96e43"/><path d="m245 165 20-14 15 15-15 22z" fill="#527793"/></svg>`;}
function loginView(){frame(`<section class="hero"><div class="hero-copy"><div class="eyebrow">A PLACE IN THE WOODLAND</div><h1>在林间相聚，<br>开启下一场博弈。</h1><p>给朋友一个房间号。选择你的阵营，以这一局的名字进入森林。离开片刻，进度也会在这里等你。</p>${originalHero()}<div class="caption">独立账号 · 可选房间密码 · 服务器保存进度</div></div><section class="login"><div class="tabs">${btn('登录','tab-login',S.mode==='login'?'active':'')}${btn('注册账号','tab-register',S.mode==='register'?'active':'')}</div><h2>${S.mode==='login'?'欢迎回到森林':'留一个林间席位'}</h2><p class="muted">${S.mode==='login'?'登录后继续你的对局，或创建新的房间。':'账号用于登录，每局都可以另取玩家名。'}</p><form id="auth"><label>账号<input name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[a-zA-Z0-9_]+" placeholder="字母、数字、下划线" required></label><label>密码<input name="password" type="password" autocomplete="${S.mode==='login'?'current-password':'new-password'}" minlength="8" maxlength="128" placeholder="至少 8 位" required></label><button class="primary">${S.mode==='login'?'进入议事厅 →':'创建账号 →'}</button></form></section></section>`);}
function roomCard(r){
  const status={playing:'对局进行中',finished:'对局已结束',waiting:'等待玩家',closed:'已关闭'}[r.status];
  const unavailable=r.status==='closed'||(!r.mine&&(r.count>=(r.capacity||2)||r.status!=='waiting'));
  return `<article class="room-card"><div class="row"><span class="badge ${r.locked?'locked':''}">${r.playMode==='hotseat'?'同屏游玩':r.locked?'◈ 密码房间':'○ 公共房间'}</span><span class="muted">${r.count} / ${r.capacity||2}</span></div>
    <h3>${esc(r.title)}</h3><div class="room-code"># ${r.code}</div><small>${r.playMode==='hotseat'?'同屏游玩 · ':''}${status}${r.canDelete?' · 房主':r.mine?' · 已加入':''}</small>
    <div class="room-buttons">${btn(r.mine?'回到房间':'加入 →','open-room',r.mine?'':'primary',unavailable,`data-code="${r.code}" data-mine="${r.mine}"`)}
      ${r.canDelete?btn('删除房间','delete-room','quiet danger',false,`data-code="${r.code}"`):''}
    </div></article>`;
}
function lobbyView(){frame(`<div class="heading"><div><div class="eyebrow">THE GATHERING PLACE</div><h1>今晚，谁来执掌森林？</h1><p class="muted">找一个席位，或为朋友们开一间房。</p></div><span class="badge">${S.rooms.filter(r=>r.status==='waiting').length} 个房间等待中</span></div>${limitations()}<div class="lobby-grid"><section class="panel"><div class="panel-header"><h2>林间房间</h2>${btn('↻ 刷新','refresh','quiet')}</div><div class="room-grid">${S.rooms.map(roomCard).join('')||'<div class="empty"><div class="empty-symbol">♧</div>森林还很安静。<br>创建第一间房，邀请朋友加入。</div>'}</div></section><aside><section class="panel"><h2>创建房间</h2><form id="create"><label>游玩方式<select name="playMode"><option value="online">线上联机</option><option value="hotseat">同屏游玩 · 共用这台PC</option></select></label><label>游戏模式<select name="ruleset"><option value="root-riverfolk-v7">扩展标准局 · 六大阵营</option><option value="root-lizard-cult-v6">扩展标准局 · 五大阵营</option><option value="root-base-four-v5">基础四阵营标准局</option></select></label><p class="caption create-seat-note">固定四席 · 线上可添加人机，同屏由房主配置本地玩家</p><label>房间名称<input name="title" maxlength="24" placeholder="例如：周末林间小聚" required></label><label>本局玩家名<input name="name" maxlength="24" value="${esc(S.user.username)}" required></label><label>房间密码 <small>可不填，即公共房间</small><input name="password" type="password" maxlength="128" autocomplete="new-password" placeholder="留空即可公开加入"></label><button class="primary">＋ 创建房间</button></form></section><section class="panel"><h3>手机认领同屏席位</h3><form id="companion-join"><label>同屏房间号<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><label>房间密码（如有）<input name="password" type="password" maxlength="128"></label><button>进入辅助屏 / 申请认领</button></form></section><section class="panel"><h3>有朋友的房间号？</h3><form id="join"><label>六位房间号<input name="code" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" placeholder="例如 123456" required></label><label>本局玩家名<input name="name" value="${esc(S.user.username)}" maxlength="24" required></label><label>房间密码<input name="password" type="password" maxlength="128" placeholder="公共房间留空"></label><button>加入朋友的房间 →</button></form></section></aside></div>`);}
function claimManagement(room){
  if(room.playMode!=='hotseat'||room.companion)return '';
  const requests=room.claimRequests||[];
  return `<details class="panel claim-manager" ${requests.length?'open':''}><summary>手机认领管理${requests.length?` · ${requests.length}项待确认`:''}</summary><p class="caption">手机登录自己的账号，使用大厅“手机认领同屏席位”，输入房间号 ${room.code}。申请经你确认后才会绑定。</p>${requests.map(q=>{const p=room.members.find(m=>m.userId===q.seatId);return `<div class="claim-request"><span>账号 <strong>${esc(q.username)}</strong> 申请认领 ${esc(p?.name||'已移除席位')}（${names[p?.faction]||''}）</span>${btn('允许认领','claim-approve','primary',false,`data-request="${esc(q.id)}"`)}${btn('拒绝','claim-reject','quiet',false,`data-request="${esc(q.id)}"`)}</div>`;}).join('')}${room.members.filter(m=>m.claimed).map(m=>`<div class="claim-request"><span>${esc(m.name)} 已绑定账号 ${esc(m.claimedBy)}</span>${btn('解除绑定','claim-release','quiet danger',false,`data-user="${esc(m.userId)}"`)}</div>`).join('')}</details>`;
}
function companionPanel(room){
  const own=room.members.find(m=>m.userId===room.companion.seatId);
  if(own)return `<div class="panel companion-summary">已认领 <strong>${esc(own.name)} · ${names[own.faction]}</strong><small>平时查看公共棋盘；自己的临时决策需要确认后处理。</small>${btn('退出辅助屏并解除绑定','companion-leave','quiet')}</div>`;
  return `<section class="panel companion-claims"><h2>认领你的席位</h2><p>选择你的本地玩家，等待PC房主确认。申请期间只能查看公共信息。</p><div class="claim-seats">${room.members.map(m=>`<article>${artImage(ART.portraits[m.faction],names[m.faction],'score-portrait')}<strong>${esc(m.name)}</strong><span>${names[m.faction]}</span>${room.companion.pending?.seatId===m.userId?`<small>等待房主确认</small>${btn('撤回申请','claim-cancel','quiet')}`:btn(m.claimed?'已被认领':'申请认领','claim-request','primary',!!m.claimed,`data-user="${esc(m.userId)}"`)}</article>`).join('')}</div>${btn('返回大厅','companion-leave','quiet')}</section>`;
}
function roomHeader(){
  const room=S.room;
  if(room.tutorial)return `<div class="heading"><div>${btn('← 教程目录','tutorials','quiet')}<h1 class="room-title">${esc(room.title)}</h1><span class="badge">${room.tutorial.legacy?'旧版学习进度 · 重新开始可学习新版':'单人练习 · 服务器保存进度'}</span></div><div class="room-host-tools">${btn('声音与动画','preferences','quiet')}${btn('重新开始本章','tutorial-restart','quiet')}</div></div>`;
  return `<div class="heading"><div>${btn('← 房间大厅','lobby','quiet')}<h1 class="room-title">${esc(room.title)}</h1><span class="code-large"># ${room.code}</span> ${btn('复制房间号','copy','quiet')} <span class="badge ${room.locked?'locked':''}">${room.playMode==='hotseat'?'同屏游玩':room.locked?'密码房间':'公共房间'}</span></div>
    <div class="room-host-tools">${btn('声音与动画','preferences','quiet')}<span class="connection"></span>${room.ownerId===S.user.id&&!room.companion?btn('删除房间','delete-room','quiet danger',false,`data-code="${room.code}"`):''}</div></div>${room.companion?'':claimManagement(room)}`;
}
function captureWaitingDraft(){
  for(const f of document.querySelectorAll('form[data-local-profile]'))if(!f.elements.name.readOnly)waitingDrafts.set(S.room.code+'|'+f.dataset.localProfile,{name:f.elements.name.value,faction:f.elements.faction.value});
  const form=document.querySelector('#profile[data-room]');
  if(form&&!form.elements.name.readOnly)waitingDrafts.set(form.dataset.room+'|'+form.dataset.user,{name:form.elements.name.value,faction:form.elements.faction.value});
}
function waitingView(){if(S.room.companion){frame(roomHeader()+companionPanel(S.room));return;}
  captureWaitingDraft();
  const focused=document.activeElement;
  const focus=focused?.closest('#profile')?{name:focused.name,start:focused.selectionStart,end:focused.selectionEnd}:null;
  const room=S.room,host=room.ownerId===S.user.id;
  S.ruleset=room.ruleset||S.ruleset;
  const available=room.availableFactions||['cat','bird','alliance','vagabond'];
  const options=(value,userId)=>available.map(faction=>{
    const reserved=room.members.some(p=>p.userId!==userId&&p.ready&&p.faction===faction);
    return `<option value="${faction}" ${faction===value?'selected':''}>${names[faction]}${reserved?' · 已准备':''}</option>`;
  }).join('');
  const seats=Array.from({length:4},(_,seat)=>{
    const player=room.members.find(p=>p.seat===seat),locked=seat>=(room.capacity||2);
    if(!player)return `<article class="player-seat room-seat empty-seat ${locked?'locked-seat':''}" data-seat="${seat}" aria-label="席位${seat+1} · ${locked?'未开放':'空位'}"><div class="seat-topline"><span>席位 ${seat+1}</span><span>${locked?'旧房间容量限制':'可留空'}</span></div><div class="empty-seat-art" aria-hidden="true">${brand}</div><h3>${locked?'未开放席位':'虚位以待'}</h3><p>${room.playMode==='hotseat'?'由房主添加本地玩家，<br>轮流使用这台电脑。':'将房间号分享给朋友，<br>等待新的旅伴入座。'}</p>${host&&!locked?btn(room.playMode==='hotseat'?'添加本地玩家':'添加人机',room.playMode==='hotseat'?'local-add':'bot-add','',false,`data-seat="${seat}"`):'<span class="caption">等待房主安排</span>'}</article>`;
    const localDraft=(!player.ready?waitingDrafts.get(room.code+'|'+player.userId):null)||player;
    if(room.playMode==='hotseat')return `<article class="player-seat room-seat ${player.faction} ${player.ready?'seat-ready':''}" data-seat="${seat}" data-user="${esc(player.userId)}"><div class="seat-topline"><span>席位 ${seat+1}</span><span>本地玩家${player.userId===room.ownerId?' · 房主':''}</span></div><div class="seat-portrait-wrap">${artImage(ART.portraits[player.faction],names[player.faction],'seat-portrait')}</div><h3>${esc(player.name)}</h3><span class="badge">${player.ready?'✓ 已准备':'设置本地身份'}</span><form class="seat-profile-form" data-local-profile="${esc(player.userId)}"><label>玩家名字<input name="name" value="${esc(localDraft.name)}" maxlength="24" required ${player.ready?'readonly':''}></label><label>阵营<select name="faction" ${player.ready?'disabled':''}>${options(localDraft.faction,player.userId)}</select></label>${player.ready?btn('修改身份','local-unready','quiet',false,`data-user="${esc(player.userId)}"`):'<button type="submit" class="primary">准备</button>'}</form>${player.userId!==room.ownerId?btn('移除本地玩家','local-remove','quiet danger',false,`data-user="${esc(player.userId)}"`):''}</article>`;
    const mine=player.userId===S.user.id;
    let draft=(!player.ready&&mine?waitingDrafts.get(room.code+'|'+player.userId):null)||player;
    if(!available.includes(draft.faction))draft={...draft,faction:player.faction};
    const faction=draft.faction;
    const identity=mine?`<form id="profile" class="seat-profile-form" data-room="${room.code}" data-user="${esc(player.userId)}"><label>本局名字<input name="name" value="${esc(draft.name)}" maxlength="24" required autocomplete="off" ${player.ready?'readonly':''}></label><label>选择阵营<select name="faction" ${player.ready?'disabled':''}>${options(faction,player.userId)}</select></label>${player.ready?btn('取消准备','ready','quiet'): '<button class="primary" type="submit">准备</button>'}</form>`:player.bot&&host?`<div class="bot-seat-controls"><label>人机阵营<select data-bot-faction="${esc(player.userId)}" aria-label="席位${seat+1}人机阵营">${options(faction,player.userId)}</select></label><span class="caption">选择后自动准备</span>${btn('移除人机','bot-remove','quiet danger',false,`data-user="${esc(player.userId)}"`)}</div>`:`<div class="seat-observer"><strong>${esc(names[faction])}</strong><p>${player.ready?'已准备，等待房主启程':'正在选择阵营…'}</p></div>`;
    return `<article class="player-seat room-seat ${faction} ${player.ready?'seat-ready':''} ${mine?'own-seat':''}" data-seat="${seat}" data-user="${esc(player.userId)}"><div class="seat-topline"><span>席位 ${seat+1}</span><span>${player.userId===room.ownerId?'房主':player.bot?'人机':mine?'你':'旅伴'}</span></div><div class="seat-portrait-wrap">${artImage(ART.portraits[faction],names[faction],'seat-portrait')}<span class="seat-faction-title">${names[faction]}</span></div><h3 class="player-name seat-display-name">${esc(draft.name)}</h3><span class="badge seat-status">${player.ready?'✓ 已准备':'选择身份后准备'}${player.bot?' · 人机':''}</span>${identity}</article>`;
  }).join('');
  const ready=room.members.filter(p=>p.ready).length;
  const canStart=room.members.length>=2&&ready===room.members.length&&new Set(room.members.map(p=>p.faction)).size===room.members.length;
  const mode=host?`<label>本局规则<select id="ruleset">${[['root-riverfolk-v7','扩展标准局 · 六大阵营'],['root-lizard-cult-v6','扩展标准局 · 五大阵营'],['root-base-four-v5','基础四阵营标准局'],['root-cats-birds-v4','猫鹰标准局'],['root-card-lab-v3','基础牌组与物品锻造'],['root-battle-lab-v2','秋季地图与战斗'],['root-core-lab-v1','旧基础模式']].filter(([id])=>room.playMode!=='hotseat'||['root-base-four-v5','root-lizard-cult-v6','root-riverfolk-v7'].includes(id)).map(([id,title])=>`<option value="${id}" ${room.ruleset===id?'selected':''}>${title}</option>`).join('')}</select></label>`:`<p>${room.ruleset==='root-lizard-cult-v6'?'扩展标准局 · 五大阵营':'由房主设置本局规则'}</p>`;
  frame(`${roomHeader()}<div class="waiting-layout"><section class="room-seats" aria-label="玩家席位">${seats}</section><aside class="panel room-settings"><div class="eyebrow">进入森林前</div><h2>旅伴已入座</h2>${mode}<div class="waiting-readiness" role="status"><strong>${ready} / ${room.members.length}</strong><span>已入座的参与者准备完成</span></div><p class="caption">${room.playMode==='hotseat'?'至少两位本地玩家准备后即可开始；对局中按提示交接操作。':'至少两位参与者即可开始。空席可以留空，也可以由房主添加人机。'}</p><p class="caption">准备后保留所选阵营；取消准备即可重新选择。</p>${(room.capacity||2)<4?`<p class="caption">此旧房间保留原${room.capacity||2}人容量。新建房间固定四席。</p>`:''}${host?btn('开始游戏','start','primary seat-start',!canStart):'<p class="caption">等待房主开始游戏</p>'}${btn('离开房间','leave','quiet danger')}<details class="waiting-rules"><summary>查看规则说明</summary>${limitations()}</details></aside></div>`);
  if(focus){const input=document.querySelector('#profile')?.elements[focus.name];if(input&&!input.disabled&&!input.readOnly){input.focus({preventScroll:true});if(input.tagName==='INPUT'&&focus.start!==null)input.setSelectionRange(focus.start,focus.end);}}
}

function board(game){
  const original=game.mapId&&ART.board;
  const areas=game.board.map(area=>({...area,...(original?.clearings[area.id]||{})}));
  const roads=areas.flatMap(area=>area.links.filter(id=>id>area.id).map(id=>{
    const target=areas.find(other=>other.id===id);
    return `<path class="path" d="M${area.x} ${area.y}L${target.x} ${target.y}"/><path class="path-dot" d="M${area.x} ${area.y}L${target.x} ${target.y}"/>`;
  })).join('');
  const rivers=areas.flatMap(area=>(area.riverLinks||[]).filter(id=>id>area.id).map(id=>{
    const target=areas.find(other=>other.id===id);
    return `<path class="river-path" d="M${area.x} ${area.y}L${target.x} ${target.y}"/>`;
  })).join('');
  const nodes=areas.map(area=>{
    return `<g class="clearing ${S.selected===area.id?'selected':''}" data-action="clearing" data-id="${area.id}" tabindex="0" role="button" aria-label="${esc(clearingLabel(area))}"><ellipse class="ground" cx="${area.x}" cy="${area.y}" rx="66" ry="54"/><foreignObject x="${area.x-78}" y="${area.y-60}" width="156" height="138"><div xmlns="http://www.w3.org/1999/xhtml" class="clearing-marker flat-marker">${clearingContents(area,ART)}</div></foreignObject></g>`;
  }).join('');
  const forestMarkers=game.vagabond&&game.players.some(player=>player.faction==='vagabond')?Object.entries(ART.board.forests||{}).map(([id,node])=>`<foreignObject x="${node.x-28}" y="${node.y-24}" width="80" height="90"><div xmlns="http://www.w3.org/1999/xhtml" class="flat-forest"><button type="button" class="forest-marker" data-action="forest-info" data-id="${id}">林 ${id}${game.vagabond.position===Number(id)?artImage(ART.symbols.vagabond,'游侠棋子'):''}</button></div></foreignObject>`).join(''):'';
  const backdrop=original?`<image href="${esc(original.texture)}" x="0" y="${original.imageY}" width="${original.width}" height="${original.imageHeight}" preserveAspectRatio="none"/><path d="${original.riverPath}" fill="#619fa5"/>`:'';
  const selected=game.board.find(area=>area.id===S.selected)||game.board[0];
  return `<div class="map-card"><div class="map-toolbar"><div class="map-label">秋季地图 · 点击林地选择目标</div></div><svg viewBox="${original?`15 20 ${original.width-30} ${original.height-40}`:'0 0 720 670'}" class="map ${original?'original-map':''}" aria-label="林地游戏地图">${backdrop}${original?'':roads+rivers}${nodes}${forestMarkers}</svg></div><p class="selected-clearing-info" role="status">${esc(clearingLabel(selected))}</p>`;
}
function selectAreas(g,name,value=S.selected){return `<select name="${name}">${g.board.map(c=>`<option value="${c.id}" ${c.id===value?'selected':''}>${c.id} · ${c.name} / ${names[c.suit]}</option>`).join('')}</select>`;}
function cardSelect(me,name='card'){return `<select name="${name}" required><option value="">选择一张手牌</option>${(me.hand||[]).map(c=>`<option value="${c.id}" ${S.card===c.id?'selected':''}>${esc(c.name)} · ${names[c.suit]}</option>`).join('')}</select>`;}
function ruler(c){
  const strengths=Object.entries(c.warriors).map(([faction,count])=>({faction,count:count+c.buildings.filter(building=>building.faction===faction).length}));
  const maximum=Math.max(...strengths.map(entry=>entry.count));
  if(!maximum)return null;
  const tied=strengths.filter(entry=>entry.count===maximum);
  return tied.some(entry=>entry.faction==='bird')?'bird':tied.length===1?tied[0].faction:null;
}
function woodOptions(g){const seen=new Set(),queue=[S.selected];while(queue.length){const id=queue.pop(),c=g.board[id];if(seen.has(id)||ruler(c)!=='cat')continue;seen.add(id);queue.push(...c.links);}return [...seen].flatMap(id=>Array(g.board[id].wood).fill(id));}
function targetSelect(game,me){
  return `<label>目标玩家<select name="target">${game.players.filter(player=>player.id!==me.id).map(player=>`<option value="${player.faction}">${esc(player.name)} · ${names[player.faction]}</option>`).join('')}</select></label>`;
}
function dominanceControls(game,me){
  if(!['craft','daylight','decree'].includes(game.phase))return '';
  const cards=me.hand.filter(card=>card.kind==='dominance');
  let html='';
  if(me.score>=10&&!me.dominance&&!me.coalition&&cards.length&&(me.faction!=='vagabond'||game.players.length>=4)){
    html+=`<details class="action-section"><summary>${me.faction==='vagabond'?'结盟':'激活统治牌'}</summary><form data-type="dominance"><label>统治牌<select name="card">${cards.map(card=>`<option value="${card.id}">${esc(card.name)}</option>`).join('')}</select></label>${me.faction==='vagabond'?targetSelect(game,me):''}<p class="caption">${me.faction==='vagabond'?'与其他阵营中最低分者结盟，改为共同获胜。':'激活后按统治条件获胜，停止获得胜利分。'}</p><button>确认激活</button></form></details>`;
  }
  if(game.dominanceAvailable?.length){
    html+=`<details class="action-section"><summary>换取可用统治牌</summary><form data-type="take-dominance"><select name="dominance">${game.dominanceAvailable.map(card=>`<option value="${card.id}">${esc(card.name)}</option>`).join('')}</select>${cardSelect(me)}<button>支付匹配牌并换取</button></form></details>`;
  }
  return html;
}
function newFactionControls(game,me){
  let html='';
  if(game.phase==='rf-prices')return `<form data-type="set-prices">${['cards','boats','mercenaries'].map(k=>`<label>${{cards:'手牌',boats:'河船',mercenaries:'雇佣兵'}[k]}价格<select name="${k}">${[1,2,3,4].map(n=>`<option value="${n}" ${(S.room?.tutorial?.guide?.action?.prices?.[k]??game.riverfolk.prices[k])===n?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}<button>确认价格，结束回合</button></form>`;
  for(const option of game.effectOptions||[]){
    html+=`<form data-type="effect"><input type="hidden" name="card" value="${esc(option.card)}">${option.clearing?selectAreas(game,'clearing'):''}${option.target?targetSelect(game,me):''}<button>使用${esc(option.name)}</button></form>`;
  }
  if(me.faction!=='otter'&&['daylight','lizard-craft'].includes(game.phase)){
    for(const option of game.craftOptions||[]){
      html+=`<form data-type="craft"><input type="hidden" name="card" value="${esc(option.card)}"><p class="caption">${esc(option.name)} · ${option.cost.map(suit=>suit==='wild'?'任意':names[suit]).join(' + ')}</p><label>锻造点（可选，留空自动支付）<input name="pieces" placeholder="编号见阵营面板"></label><button>锻造${esc(option.name)}</button></form>`;
    }
  }
  const categories=[...new Set((game.factionActions||[]).map(option=>option.category))];
  const translate=text=>String(text).replace(/\b(bag|boot|crossbow|hammer|sword|tea|coin|torch)\b/g,key=>names[key]);
  for(const category of categories){
    const options=game.factionActions.map((option,index)=>({...option,index})).filter(option=>option.category===category);
    const payment=me.faction==='alliance'&&['起义','传播民意'].includes(category)
      ?`<details><summary>指定支付的支持者（可选）</summary><div class="supporter-payment">${game.alliance.supporters.map(card=>`<label><input type="checkbox" name="supporter" value="${esc(card.id)}">${artImage(ART.cards[card.archetype]||ART.dominance?.[card.archetype],card.name,'supporter-art')}${esc(card.name)} · ${names[card.suit]}</label>`).join('')}</div></details>`:'';
    html+=`<details class="action-section faction-action-group" data-category="${category}" ${categories.length===1?'open':''}><summary>${category} · ${options.length} 个选项</summary><form data-type="faction-action"><select name="option" aria-label="目标领地或行动">${options.map(option=>`<option value="${option.index}">${esc(translate(option.label))}</option>`).join('')}</select>${payment}${!S.room?.tutorial&&me.faction==='otter'?riverfolkPayment(game):''}${!S.room?.tutorial&&me.faction==='vagabond'&&game.phase==='services'?`<details><summary>指定支付物品（可选）</summary>${game.vagabond.items.filter(i=>!i.exhausted&&!i.damaged).map(i=>`<label><input type="checkbox" name="serviceItem" value="${esc(i.id)}">${names[i.type]}</label>`).join('')}</details>`:''}<button>执行${category}</button></form></details>`;
  }
  const endings={services:['结束购买，开始清晨 →','services-done'],'lizard-conspiracies':['结束密谋，进入白昼 →','conspiracies-done'],'lizard-craft':['结束夜晚锻造，抽牌 →','lizard-craft-done'],birdsong:['结束清晨牌效果 →','birdsong-end'],revolt:['起义完成，传播民意 →','revolt-done'],spread:['传播完成，进入白昼 →','spread-done'],refresh:['恢复完成，开始潜行 →','refresh-done'],slip:['跳过潜行，进入白昼 →','slip-done'],daylight:['进入夜晚 →','end'],military:['结束军事行动，抽牌 →','military-done']};
  if(game.phase==='refresh')html+=`<p class="caption">还可恢复 ${game.vagabond.refreshLeft} 个物品。</p>`;
  if(game.phase==='military')html+=`<p class="caption">剩余军事行动 ${game.alliance.operations} / 长官 ${game.alliance.officers}</p>`;
  if(game.phase==='capacity')html+='<p class="caption">行囊超重，请选择物品永久丢弃。</p>';
  if(game.phase==='discard')return html+`<form id="discard">${cardSelect(me)}<button>弃置所选牌</button></form>`;
  if(game.revealedHand)html+=`<p class="caption">破译者所见 ${game.revealedHand.cards.map(card=>artImage(ART.cards[card.archetype],card.name,'supporter-art')+esc(card.name)).join('、')}</p>`;
  const ending=endings[game.phase];
  return html+(ending?`<div class="action-section">${btn(ending[0],ending[1],'primary')}</div>`:'');
}
function vagabondRelations(game,own=false){
  const vg=game.vagabond;
  const levels={'-1':'敌对',0:'冷淡',1:'友善',2:'亲密',3:'盟友'};
  return game.players.filter(player=>player.faction!=='vagabond').map(player=>{const level=vg.relations[player.faction]||0;return `<span class="relation">${esc(player.name)} · ${levels[level]}${level===3?' · 援助 +2分':level>=0?' · 下次晋升 +'+(level+1)+'分':''}${own?' · 本轮援助 '+(vg.aidCounts[player.faction]||0):''}</span>`;}).join('');
}
function publicQuests(game){
  return game.quests.map(quest=>`<article class="quest-card">${artImage(ART.quests?.[quest.id],quest.name,'quest-art')}<strong>${esc(quest.name)}</strong><span>${quest.items.map(type=>artImage(ART.items[type],names[type],'faction-icon')).join('')}</span></article>`).join('');
}
function birdOverview(game){
  const bird=game.bird;
  return `<h3>飞鹰领袖 · ${names[bird.leader]||'尚未选择'}</h3>${bird.leader?btn(names[bird.leader]+' · 查看牌面与效果','leader-preview','quiet',false,`data-leader="${bird.leader}"`):''}<div class="decree">${['recruit','move','battle','build'].map(column=>`<div data-decree-column="${column}">${names[column]}<div>${bird.decree[column].map(card=>`<span class="pip" title="${names[card.suit]}${card.vizier?' · 大臣':''}">${suitImage(card.suit)}${card.vizier?'·':''}</span>`).join('')}</div></div>`).join('')}</div>`;
}
function riverfolkCustody(game,faction){const r=game.riverfolk;return r?[...r.payments,...r.funds,...r.committed,...r.crafting.map(x=>x.fund)].filter(f=>f.faction===faction).length:0;}
function riverfolkPayment(game){return `<details><summary>指定支付资金（可选，按行动所需数量勾选）</summary><div class="rf-funds">${game.riverfolk.funds.map(f=>`<label><input type="checkbox" name="fund" value="${esc(f.id)}">${artImage(ART.units[f.faction],names[f.faction],'faction-icon')}${names[f.faction]} · ${esc(f.id)}</label>`).join('')}</div></details>`;}
function riverfolkOverview(game){const r=game.riverfolk;if(!r)return '';const merchant=game.players.find(p=>p.faction==='otter');
 const tokens=fs=>fs.map(f=>`<span class="rf-token ${f.faction}" title="${names[f.faction]} ${esc(f.id)}">${artImage(ART.units[f.faction],names[f.faction],'faction-icon')}</span>`).join('')||'<small>空</small>';
 return `<section class="panel riverfolk-panel"><h3>河岸商会 · 公开账本</h3><div class="rf-ledger">${[['payments','收入',r.payments],['funds','资金',r.funds],['committed','承诺',r.committed],['crafting','锻造承诺',r.crafting.map(x=>x.fund)]].map(([id,label,fs])=>`<div data-fund-zone="${id}"><strong>${label} ${fs.length}</strong><div>${tokens(fs)}</div></div>`).join('')}</div><p class="caption">调用：移至承诺，下回合归集。花费：退回原阵营供应。清晨先分红，再归集。</p><p>服务价格：手牌 ${r.prices.cards} · 河船 ${r.prices.boats} · 雇佣兵 ${r.prices.mercenaries}</p><div class="rf-tracks">${['fox','rabbit','mouse'].map(suit=>`<span>${artImage(ART.symbols['trade-post-'+suit],names[suit],'faction-icon')}${names[suit]} 已解锁 ${r.unlocked[suit]}/3 · 已用 ${r.crafting.filter(x=>x.slot.startsWith(suit+'-')).length}</span>`).join('')}</div><h3>公开售牌 ${merchant.hand?.length??merchant.handCount??0} 张</h3><div class="rf-market">${(merchant.hand||[]).map(c=>`<button type="button" data-action="riverfolk-card" data-card="${esc(c.id)}">${artImage(ART.cards[c.archetype]||ART.dominance?.[c.archetype],c.name,'supporter-art')}<small>${esc(c.name)}</small></button>`).join('')}</div></section>`;}
function lizardOverview(game){
  const liz=game.lizard;if(!liz)return '';
  const cards=list=>list.map(card=>`<span class="public-lizard-card">${artImage(ART.cards[card.archetype]||ART.dominance?.[card.archetype],card.name,'supporter-art')}<small>${esc(card.name)} · ${names[card.suit]}</small></span>`).join('')||'<small>无</small>';
  return `<h3>蜥蜴神教</h3><p>被逐者：${names[liz.outcast]||'待选择'}${liz.hated?' · 憎恨（密谋少花1侍僧）':''} · 侍僧 ${liz.acolytes}</p><div class="lizard-tracks">${(liz.gardenTracks||[]).map(track=>`<div><strong>${names[track.suit]}花园 ${track.built} / 5</strong><span class="scoring-spaces">${track.points.slice(1).map((points,index)=>`<span class="${track.built===index+1?'current':''}">${index+1}座<small>仪式 +${points}分${index===1?' · 抽牌+1':''}</small></span>`).join('')}</span></div>`).join('')}</div><p class="caption">鸟牌仅可用于献祭，仪式展示牌在夜晚收回；每花色每回合得分一次。只用被逐者花色花园在夜晚锻造。</p><h3>本轮公开展示 ${liz.revealed.length} 张</h3><div class="lizard-public-cards">${cards(liz.revealed)}</div><h3>失魂堆 ${liz.lostSouls.length} 张</h3><div class="lizard-public-cards">${cards(liz.lostSouls)}</div>`;
}
function newFactionOverview(game,me){
  if(!['root-base-four-v5','root-lizard-cult-v6','root-riverfolk-v7'].includes(game.ruleset))return '';
  let html='';
  if(me.faction==='bird')html+=`<section class="panel bird-panel">${birdOverview(game)}</section>`;
  if(me.faction==='alliance'&&game.players.some(player=>player.faction==='alliance')){
    const bases=['fox','rabbit','mouse'].map(suit=>{
      const built=game.board.find(area=>area.buildings.some(building=>building.type==='base-'+suit));
      return `<span class="base-track ${built?'built':''}">${artImage(ART.symbols['base-'+suit],names[suit]+'基地','faction-icon')}${built?'秋林 '+built.id:'供应中'}</span>`;
    }).join('');
    const supporters=me.faction==='alliance'?`<div class="supporter-cards">${game.alliance.supporters.map(card=>`<article>${artImage(ART.cards[card.archetype]||ART.dominance?.[card.archetype],card.name,'supporter-art')}<span>${esc(card.name)}</span><small>${names[card.suit]}</small></article>`).join('')||'<small>暂无支持者</small>'}</div>`:'';
    const crafting=me.faction==='alliance'?`<p class="caption">民意锻造点 ${game.board.filter(area=>area.sympathy).map(area=>`sympathy-${area.id}（${names[area.suit]}）`).join('、')||'无'}</p>`:'';
    html+=`<section class="panel alliance-panel"><h3>森林联盟</h3><p>支持者 ${game.alliance.supporterCount} · 长官 ${game.alliance.officers} · 民意 ${game.board.filter(area=>area.sympathy).length} / 10</p><div class="base-tracks">${bases}</div>${supporters}${crafting}${game.outrageReveal?`<p class="caption">民愤：对方没有匹配牌，展示的手牌 ${game.outrageReveal.cards.map(card=>artImage(ART.cards[card.archetype],card.name,'supporter-art')+esc(card.name)).join('、')||'无'}</p>`:''}</section>`;
  }
  if(me.faction==='vagabond'&&game.players.some(player=>player.faction==='vagabond')){
    const vg=game.vagabond;
    const inventory=vg.items.map(item=>`<article class="vg-item ${item.damaged?'damaged':item.exhausted?'exhausted':'ready'}">${artImage(ART.items[item.type],names[item.type],'inventory-art')}<strong>${names[item.type]}</strong><small>${item.damaged?'损坏':item.exhausted?'耗竭':item.track?'轨道 · 可用':'可用'}</small>${me.faction==='vagabond'?`<small>${item.id}</small>`:''}</article>`).join('');
    const relations=vagabondRelations(game,true);
    const quests=publicQuests(game);
    html+=`<section class="panel vagabond-panel"><h3>神秘游侠 · ${names[vg.character]||'选择角色'}</h3><p>${vg.position===null?'准备入场':(vg.position>=12?'森林 ':'秋林 ')+vg.position} · 已完成任务 ${vg.completedQuests.length}</p>${artImage(ART.characters?.[vg.character],names[vg.character],'choice-art own-character-card')}${characterDetails(vg.character)}<div class="vg-inventory">${inventory}</div><div class="relations">${relations}</div><h3>公开任务</h3><div class="quest-cards">${quests}</div></section>`;
  }
  return html+riverfolkOverview(game)+(game.lizard?`<section class="panel lizard-panel">${lizardOverview(game)}</section>`:'');
}
function controls(g,me){
  const standard=['root-cats-birds-v4','root-base-four-v5','root-lizard-cult-v6','root-riverfolk-v7'].includes(g.ruleset);
  if(g.winner)return `<h2>林间落幕</h2><p>${g.players.filter(player=>(g.winners||[g.winner]).includes(player.id)).map(player=>esc(player.name)).join(' 与 ')} 获胜</p><p class="muted">本局进度已保存在服务器。</p>${S.room.ownerId===S.user.id?btn('开下一局','new-game','primary'):''}${btn('离开房间','leave','quiet')}`;
  if(g.choice){
    if(g.choice.waiting){
      const owner=g.players.find(player=>player.id===g.choice.playerId);
      return `<h2>等待选择</h2><p class="muted">${esc(owner?.name)} 正在处理当前选择。</p><p class="caption">你可继续查看地图和公开信息。</p>`;
    }
    return `<h2>由你决定</h2><p>${esc(g.choice.prompt)}</p><div class="stack">${g.choice.options.map(option=>btn(artImage(ART.leaders[option.id]||ART.characters?.[option.id],option.label,'choice-art')+esc(option.label),'choice','',false,`data-choice="${esc(g.choice.choiceId)}" data-option="${esc(option.id)}"`)).join('')}</div><p class="caption">选择自动保存，刷新后可继续。</p>`;
  }
  if(g.pending){const l=g.pending.losses[0];if(l.faction!==me.faction)return '<h2>战损结算</h2><p class="muted">等待对方选择移除的建筑或标记。</p>';const c=g.board[g.pending.clearing];const pieces=[...new Set(c.buildings.filter(b=>b.faction===me.faction).map(b=>b.type).concat(me.faction==='cat'?[...(c.keep?['keep']:[]),...(c.wood?['wood']:[])]:[]))];return `<h2>选择战损</h2><p class="muted">${c.name}还需承受 ${l.hits} 点伤害。</p><div class="stack">${pieces.map(p=>btn(`移除${names[p]}`,'loss','',false,`data-piece="${p}"`)).join('')}</div>`;}
  if(g.players[g.turn].id!==me.id)return `<h2>静候下一步</h2><p class="muted">当前由 ${esc(g.players[g.turn].name)} 行动。</p><p class="caption">你仍可查看地图、自己的手牌和公开法令。</p>`;
  let html=`<h2>轮到你了</h2><span class="phase">${g.phase==='evening'?'夜晚 · 自选牌效果':g.phase==='evening-end'?'夜晚 · 回合结束前':phases[g.phase]}</span>`;
  if(['root-base-four-v5','root-lizard-cult-v6','root-riverfolk-v7'].includes(g.ruleset))html+=dominanceControls(g,me);
  if(['evening','evening-end'].includes(g.phase)||g.nightCobbler&&['cat','bird'].includes(me.faction)){
    const moves=(g.factionActions||[]).map((option,index)=>({...option,index})).filter(option=>option.action.cobbler);
    if(moves.length)html+=`<details class="action-section faction-action-group" data-category="补鞋匠" open><summary>补鞋匠 · 夜晚额外移动一次</summary><form data-type="faction-action"><select name="option">${moves.map(option=>`<option value="${option.index}">${esc(option.label)}</option>`).join('')}</select><button>使用补鞋匠移动</button></form></details>`;
    if(g.phase==='evening')return html+`<p class="caption">抽牌后不能再使用牌效果。若不移动，可直接抽牌结束。</p>${btn('抽牌并结束夜晚 →','evening-continue','primary')}`;
    if(g.phase==='evening-end')return html+btn('结束夜晚 →','evening-end','primary');
  }
  if(g.phase==='services'||['alliance','vagabond','lizard','otter'].includes(me.faction))return html+newFactionControls(g,me);
  if(standard){
    for(const option of g.effectOptions||[]){
      html+=`<form data-type="effect"><input type="hidden" name="card" value="${esc(option.card)}">${option.clearing?selectAreas(g,'clearing'):''}${option.target?targetSelect(g,me):''}<button>使用${esc(option.name)}</button></form>`;
    }
    if(g.revealedHand)html+=`<p class="caption">破译者查看的手牌 ${g.revealedHand.cards.map(card=>esc(card.name)+' · '+names[card.suit]).join('、')||'无'}</p>`;
    if(g.phase==='birdsong')return html+btn('结束清晨牌效果 →','birdsong-end','primary');
    if(g.phase==='craft'){
      const type=me.faction==='cat'?'workshop':'roost';
      const facilities=g.board.flatMap(area=>area.buildings.flatMap((building,index)=>building.faction===me.faction&&building.type===type&&!g.craftingUsed.includes(`${area.id}-${index}`)?[`${area.id}-${index} (${names[area.suit]})`]:[]));
      html+=`<p class="caption">可用锻造点 ${facilities.join('、')||'无'}</p>`;
      for(const option of g.craftOptions||[])html+=`<form data-type="craft"><input type="hidden" name="card" value="${esc(option.card)}"><label>${esc(option.name)} · ${option.cost.map(suit=>suit==='wild'?'任意':names[suit]).join(' + ')}<input name="pieces" placeholder="锻造点编号，逗号分隔；留空自动选择"></label><button>锻造${esc(option.name)}</button></form>`;
      return html+btn(me.faction==='cat'?'完成锻造，开始行动 →':'完成锻造，执行法令 →','craft-done','primary');
    }
  }
  if(g.phase==='wood')return html+`<p class="muted">选择要生产木材的锯木厂。木材总量上限为 8。</p><form id="wood">${selectAreas(g,'clearing')}<button class="primary">放置一枚木材</button></form>`;
  if(g.phase==='discard')return html+`<p class="muted">弃牌至 5 张，目前 ${me.hand.length} 张。</p><form id="discard">${cardSelect(me)}<button>弃置所选牌</button></form>`;
  if(g.phase==='leader')return html+`<form id="leader"><label>新领袖<select name="leader">${g.leaders.map(l=>`<option value="${l}">${names[l]}</option>`).join('')}</select></label><div class="leader-previews">${g.leaders.map(leader=>btn(names[leader]+' · 查看牌面与效果','leader-preview','quiet',false,`data-leader="${leader}"`)).join('')}</div><button type="submit">任命领袖，进入夜晚</button></form>`;
  if(g.phase==='new-roost')return html+`<p class="muted">选择可放置且士兵最少的林地。</p><form id="new-roost">${selectAreas(g,'clearing')}<button>放置鸟巢与士兵</button></form>`;
  if(g.phase==='decree-add')return html+`<p class="muted">本回合已添加 ${g.bird.added} 张法令。需添加 1–2 张，其中鸟类牌最多 1 张。</p><form id="decree-add">${cardSelect(me)}<select name="column">${['recruit','move','battle','build'].map(c=>`<option value="${c}">${names[c]}</option>`).join('')}</select><button ${g.bird.added>=2?'disabled':''}>加入法令</button></form><div class="action-section">${btn('开始执行法令','decree-ready','primary',g.bird.added<1)}</div>`;
  const bird=me.faction==='bird',col=g.currentDecreeColumn;
  if(g.craftOptions?.length){
    html+=`<div class="action-section"><h3>可锻造卡牌</h3><div class="stack">${g.craftOptions.map(option=>btn(`锻造${esc(option.name)}`,'craft','',false,`data-card="${esc(option.card)}"`)).join('')}</div></div>`;
  }
  if(bird){
    const remaining=g.bird.remaining[col]||[];
    const suits=[...new Set(remaining.map(card=>card.suit))];
    html+=`<p class="muted">${col?'当前法令：'+names[col]:'本轮法令全部完成'}</p><label>选择本次法令花色<select id="decree-card">${suits.map(suit=>{const cards=remaining.filter(card=>card.suit===suit);return `<option value="${cards[0].id}">${names[suit]} · 待执行 ${cards.length} 次</option>`;}).join('')}</select></label>`;
  }
  else html+=`<p class="muted">剩余行动：${g.actions} ${g.march?'· 行军还可移动 1 次':''}</p>`;
  const allowed=t=>!bird||col===t;
  if(allowed('move'))html+=`<details class="action-section" open><summary>${bird?'执行移动法令':'行军 · 一次行动最多两次移动'}</summary><form id="move"><label>起点${selectAreas(g,'from')}</label><label>终点${selectAreas(g,'to',g.board[S.selected].links[0])}</label><label>士兵数量<input name="count" type="number" value="1" min="1" max="25" required></label><button>移动士兵</button></form>${g.march?btn('结束行军','march-end','quiet'):''}</details>`;
  if(allowed('recruit')){const recruitIds=g.board.flatMap(c=>c.buildings.filter(b=>b.type==='recruiter').map(()=>c.id));const reserve=25-g.board.reduce((n,c)=>n+c.warriors.cat,0);html+=`<details class="action-section"><summary>招募</summary><form id="recruit">${bird?selectAreas(g,'clearing'):`<label>分配林地编号（逗号分隔）<input name="clearings" value="${recruitIds.slice(0,reserve).join(',')}" required></label><small>每个征兵所放 1 名士兵；余量不足时可自行调整顺序。</small>`}<button ${!bird&&g.recruited?'disabled':''}>招募</button></form></details>`;}
  if(allowed('build'))html+=`<details class="action-section"><summary>建造</summary><form id="build"><label>林地${selectAreas(g,'clearing')}</label>${bird?'':`<label>建筑<select name="building">${['sawmill','workshop','recruiter'].map(t=>{const n=g.board.reduce((n,c)=>n+c.buildings.filter(b=>b.type===t).length,0);return `<option value="${t}">${names[t]} · ${[0,1,2,3,3,4][n]??'—'} 木材</option>`;}).join('')}</select></label><label>消耗木材所在林地编号<input name="wood" placeholder="例如 0,0,3；按成本填入" value=""></label><small>当前选中林地可连通的木材：${woodOptions(g).join(', ')||'无'}。每枚木材填写一次编号。</small>`}<button>建造${bird?'鸟巢':''}</button></form></details>`;
  if(allowed('battle'))html+=`<details class="action-section"><summary>战斗</summary><form id="battle">${selectAreas(g,'clearing')}<button>发起战斗</button></form><p class="caption">${g.ruleset!=='root-core-lab-v1'?'双方依次完成伏击、战损与医院选择，骰子由服务器保存。':'旧基础模式使用服务器基础战斗结算。'}</p></details>`;
  if(!bird)html+=`<details class="action-section"><summary>过劳 / 额外行动</summary><form id="overwork">${selectAreas(g,'clearing')}${cardSelect(me)}<button>消耗行动与匹配牌，生产木材</button></form><div class="divider"></div><form id="extra">${cardSelect(me)}<button>花费鸟类牌 +1 行动</button></form></details>`;
  return html+`<div class="action-section">${btn('进入夜晚 →','end','primary',!!g.march||(bird&&!!col))}</div>`;
}
function victoryTrack(player,compact=false){
  return `<div class="victory-track">${compact?'':`<span>${player.coalition?'结盟胜利':player.dominance?'统治胜利':'胜利分'} · ${player.score} / 30</span>`}<progress max="30" value="${player.score}" aria-label="${esc(player.name)}的胜利分"></progress><div class="victory-ticks"><small>0</small><small>10</small><small>20</small><small>30</small></div></div>`;
}
function factionScoring(game,player){
  if(player.faction==='otter')return '<p class="caption">贸易站 +2分 · 清晨有站时，旧资金每2点分红1分 · 锻造按牌面得分</p>';
  if(player.faction==='bird'&&game.factionScoreTracks){
    const count=game.board.filter(area=>area.buildings.some(building=>building.faction==='bird'&&building.type==='roost')).length;
    return `<h3>夜晚鸟巢得分轨道</h3><div class="scoring-spaces">${game.factionScoreTracks.bird.map((points,index)=>`<span class="${index===count?'current':''}">${index}巢<small>+${points}分</small></span>`).join('')}</div>`;
  }
  if(player.faction==='alliance'&&game.factionScoreTracks){
    const count=game.board.filter(area=>area.sympathy).length;
    return `<h3>民意轨道 · 基础成本 / 得分</h3><div class="scoring-spaces">${game.factionScoreTracks.alliance.map((space,index)=>`<span class="${index===count?'current':index<count?'used':''}">第${index+1}枚<small>${space.cost}支持者</small><strong>+${space.points}分</strong></span>`).join('')}</div>`;
  }
  if(player.faction==='vagabond')return `<h3>任务得分进度</h3><div class="scoring-spaces">${['fox','rabbit','mouse'].map(suit=>{const count=game.vagabond.completedQuests.filter(quest=>quest.suit===suit).length;return `<span>${names[suit]} · 已完成${count}<small>下一次选得分 +${count+1}</small></span>`;}).join('')}</div>`;
  return '';
}
function pieceStock(game,player){
  const faction=player.faction;
  const army=game.board.reduce((sum,area)=>sum+(area.warriors[faction]||0),0);
  const officers=faction==='alliance'?(game.alliance?.officers||0):0;
  const total={cat:25,bird:20,alliance:10,lizard:25,otter:15}[faction];
  const acolytes=faction==='lizard'?(game.lizard?.acolytes||0):0;
  const types=faction==='cat'?['sawmill','workshop','recruiter']:faction==='bird'?['roost']:faction==='alliance'?['base-fox','base-rabbit','base-mouse']:faction==='lizard'?['garden-fox','garden-rabbit','garden-mouse']:[];
  let html=victoryTrack(player)+factionScoring(game,player);
  if(total)html+=`<div class="army-counts"><span>地图军队 <b>${army}</b></span><span>储备 <b>${Math.max(0,total-army-officers-acolytes-riverfolkCustody(game,faction))} / ${total}</b></span>${faction==='alliance'?`<span>长官 <b>${officers}</b></span>`:''}</div>`;
  html+=`<div class="building-stock">${types.map(type=>{
    const used=game.board.reduce((sum,area)=>sum+area.buildings.filter(b=>b.faction===faction&&b.type===type).length,0);
    const limit=faction==='cat'?6:faction==='bird'?7:faction==='lizard'?5:1;
    const track=game.catBuildingTracks?.find(track=>track.type===type);
    const next=track?.spaces[used];
    return `<span title="${names[type]}剩余 ${limit-used}，总量 ${limit}">${artImage(ART.symbols[type],names[type],'stock-art')}<span>${names[type]}<b>${limit-used} / ${limit}</b>${track?`<small>${next?'下一座 '+next.wood+' 木材 · '+next.points+' 分':'建筑已全部使用'}</small><span class="building-track">${track.spaces.map((space,index)=>`<small class="${index<used?'built':index===used?'next':''}" title="第${index+1}座">${space.wood}木<br>${space.points}分</small>`).join('')}</span>`:''}</span></span>`;
  }).join('')}</div>`;
  if(faction==='lizard'&&game.lizard)html+=`<p class="caption lizard-summary">侍僧 ${game.lizard.acolytes} · 被逐者 ${names[game.lizard.outcast]||'待选择'}${game.lizard.hated?'（憎恨）':''} · 展示牌 ${game.lizard.revealed.length} · 失魂 ${game.lizard.lostSouls.length}</p>`;
  if(faction==='alliance')html+=`<p class="caption">民意剩余 ${10-game.board.filter(a=>a.sympathy).length} / 10 · 支持者 ${game.alliance.supporterCount}</p>`;
  return html;
}
function itemPool(game){
  if(!game.itemSupply)return '';
  return `<section class="panel public-item-pool"><h3>公共锻造物供应</h3><p class="caption">剩余 / 总量</p><div class="item-pool-grid">${Object.entries(game.itemSupply).map(([type,count])=>`<div class="${count===0?'empty-stock':''}" title="${names[type]}剩余 ${count}">${artImage(ART.items[type],names[type],'stock-art')}<span>${names[type]}<b>${count} / ${['crossbow','hammer'].includes(type)?1:2}</b></span></div>`).join('')}</div></section>`;
}
function playerPublicDetails(game,player){
  let html=`<section class="public-player-details">${pieceStock(game,player)}${player.faction==='otter'?riverfolkOverview(game):''}`;
  if(player.faction==='vagabond'){
    const vg=game.vagabond;
    html+=`<h3>角色 · ${names[vg.character]||'尚未选择'}</h3>${artImage(ART.characters?.[vg.character],names[vg.character],'choice-art')}${characterDetails(vg.character)}<p>位置 ${vg.position>=12?'森林':'秋林'} ${vg.position??'未设置'} · 已完成任务 ${vg.completedQuests.length}</p><div class="vg-inventory">${vg.items.map(item=>`<article class="vg-item ${item.damaged?'damaged':item.exhausted?'exhausted':'ready'}">${artImage(ART.items[item.type],names[item.type],'inventory-art')}<strong>${names[item.type]}</strong><small>${item.damaged?'损坏':item.exhausted?'耗竭':item.track?'轨道可用':'可用'}</small></article>`).join('')}</div><h3>阵营关系</h3><div class="relations">${vagabondRelations(game)}</div><h3>三个公开任务</h3><div class="quest-cards">${publicQuests(game)}</div>`;
  }else{
    html+=`<h3>持有物品</h3><div class="public-owned-items">${(player.items||[]).map(type=>`<span>${artImage(ART.items[type],names[type],'stock-art')}${names[type]}</span>`).join('')||'<small>暂无物品</small>'}</div>`;
  }
  html+=`<h3>持续效果牌</h3><div class="public-crafted-cards">${(player.crafted||[]).map(card=>`<span>${artImage(ART.cards[card.archetype],card.name,'crafted-art')}${esc(card.name)}</span>`).join('')||'<small>暂无持续牌</small>'}</div>`;
  if(player.faction==='bird'){
    html+=birdOverview(game);
  }
  if(player.faction==='lizard')html+=lizardOverview(game);
  if(player.faction==='alliance')html+='<p class="caption">军队和长官共用10名战士供应。</p>';
  return html+'</section>';
}
let sidebarObserver=null;
function fitSidebars(){
  sidebarObserver?.disconnect();
  const stage=document.querySelector('.game-stage'),map=stage?.querySelector('.map-card');
  if(!map)return;
  const fit=()=>stage.style.setProperty('--board-height',Math.ceil(map.getBoundingClientRect().height)+'px');
  fit();sidebarObserver=new ResizeObserver(fit);sidebarObserver.observe(map);
}
function tutorialListView(){
  const lessons=S.tutorials||[];
  frame(`<div class="heading"><div><h1>新手教程</h1><p class="muted">从基础操作开始，再学习基础与扩展阵营。</p></div>${btn('返回房间大厅','lobby')}</div><div class="notice">每节都有明确目标，进度由服务器保存。正式联机从大厅创建或加入房间，选择本局玩家名与阵营，全部准备后由房主开始。</div><div class="tutorial-catalog">${lessons.map((lesson,index)=>`<article class="panel tutorial-lesson" data-lesson="${lesson.id}">${artImage(ART.portraits[lesson.faction],names[lesson.faction],'tutorial-portrait')}<div><small>第 ${index+1} 章 · ${lesson.stepCount} 节</small><h2>${esc(lesson.title)}</h2><p>${esc(lesson.summary)}</p><p class="caption">${lesson.completed?'已完成，可再次练习':lesson.started?'进行到第 '+(lesson.step+1)+' 节':'尚未开始'}</p>${btn(lesson.started?'继续学习':'开始学习','tutorial-start','primary',false,`data-lesson="${lesson.id}"`)}</div></article>`).join('')}</div>`);
}
function tutorialCoach(meta){
  if(meta.guide){
    const guide=meta.guide,acting=guide.mode==='act';
    const next=meta.completed?(meta.lessonId==='basics'?btn('前往猫咪贵族','tutorial-start','primary',false,'data-lesson="cats"'):btn('返回教程目录','tutorials','primary')):guide.canAdvance?btn('继续 ▸','tutorial-guide-next','primary'):meta.ready?btn(meta.index+1===meta.total?'结束旅程':'继续 ▸','tutorial-next','primary'):guide.watch&&!guide.auto?btn(guide.condensed?'观看这一段 ▸':'观看这一步 ▸','tutorial-coach-next','primary'):'';
    return `<section class="tutorial-coach tutorial-dialogue" aria-label="林间引导" data-tutorial-version="${S.room.version}" data-guide-mode="${guide.mode}" data-guide-faction="${esc(meta.faction||'cat')}"><div class="guide-character">${artImage(ART.portraits[guide.speakerFaction||meta.faction||'cat'],guide.speaker,'guide-portrait')}<span>${esc(guide.speaker)}</span></div><div class="guide-copy"><div class="guide-heading"><h3>${esc(meta.heading)}</h3><small>${meta.index+1} / ${meta.total}</small></div><p class="guide-line" aria-live="polite">${esc(guide.text)}</p><div class="guide-evidence"></div><div class="guide-footer"><span class="guide-cue">${acting?(guide.watch?(guide.auto?'◆ 观看中':'◆ 观察对手'):'◆ 等待你的命令'):meta.completed?'旅程已记录':`◆ ${Math.min(guide.cursor+1,guide.total)} / ${guide.total}`}${meta.goalCount>1?` · ${meta.count}/${meta.goalCount}`:''}</span><div class="tutorial-buttons">${guide.previewCard||guide.previewLeader||guide.previewCharacter?btn(guide.previewLeader?'查看领袖':guide.previewCharacter?'查看角色':guide.previewLabel||'查看锻造手牌','tutorial-craft-preview','quiet'):''}${guide.canBack?btn('上句话','tutorial-guide-back','quiet'):''}${next}${!meta.reading&&!meta.completed?btn('重试','tutorial-retry','quiet'):''}${btn('离开教程','tutorials','quiet')}</div></div></div></section>`;
  }
  const context=meta.context;
  const location=context.from!==undefined?`秋林 ${context.from} → 秋林 ${context.to}`:context.clearing!==undefined?`秋林 ${context.clearing}`:context.to!==undefined?`前往秋林 ${context.to}`:'';
  return `<section class="panel tutorial-coach"><small>第 ${meta.index+1} / ${meta.total} 节</small><h3>${esc(meta.heading)}</h3><p>${esc(meta.text)}</p>${location&&!meta.reading&&!meta.completed?`<p class="tutorial-target">本节目标 · ${esc(location)}</p>`:''}${meta.goalCount>1?`<p>已完成 ${meta.count} / ${meta.goalCount} 次</p>`:''}<p class="caption">${meta.newScene?'本节使用预置练习局面。':'沿用当前练习局面。'}${meta.completed?'本章进度已保存。':meta.reading?'阅读后可以继续。':meta.ready?'目标已完成。':'完成实操后解锁继续。'}</p>${meta.result?`<p class="tutorial-result">${esc(meta.result)}</p>`:''}<div class="tutorial-buttons">${meta.completed?`<strong>本章学习完成</strong>${btn('返回教程目录','tutorials','primary')}`:btn(meta.reading?'读完，继续':meta.index+1===meta.total?'完成本章':'继续下一节','tutorial-next','primary',!meta.ready)}${!meta.completed&&!meta.reading?btn('重试本节','tutorial-retry','quiet'):''}${meta.completed?btn('返回房间大厅','lobby','quiet'):btn('教程目录','tutorials','quiet')}</div></section>`;
}
function filterTutorialControls(meta){
  const source=document.querySelector('.actions');
  if(!source)return;
  if(meta.context.story){
    for(const payment of source.querySelectorAll('.supporter-payment'))payment.closest('details').remove();
    for(const input of source.querySelectorAll('[name=pieces]'))input.closest('label').remove();
  }
  const decree=source.querySelector('#decree-card');
  if(decree&&(!decree.options.length||!meta.actionTypes.some(type=>['move','recruit','battle','build'].includes(type))))decree.closest('label').remove();
  for(const form of source.querySelectorAll('form')){
    const type=form.dataset.type||form.id;
    if(!meta.actionTypes.includes(type)&&!(type==='faction-action'&&S.room.game.factionActions.length))form.remove();
  }
  for(const button of source.querySelectorAll('button[data-action]')){
    if(!meta.actionTypes.includes(button.dataset.action))button.remove();
  }
  if(meta.ready){const prompt=meta.reading?'阅读本节说明':'本节目标已完成';if(source.querySelector('h2'))source.querySelector('h2').textContent=prompt;if(source.querySelector('.phase'))source.querySelector('.phase').textContent=prompt;}
  const expected=meta.guide?.allowAlternatives?null:meta.guide?.action;
  if(meta.guide?.allowAlternatives){
    const alternatives=meta.guide.alternatives||[];
    for(const form of source.querySelectorAll('form'))for(const field of form.querySelectorAll('select[name]')){
      const type=form.dataset.type||form.id;
      const values=alternatives.filter(a=>a.type===type&&a[field.name]!==undefined).map(a=>String(a[field.name]));
      if(!values.length)continue;
      for(const option of field.options)option.disabled=!values.includes(option.value);
      field.value=values[0];
    }
  }
  if(expected){
    for(const form of source.querySelectorAll('form'))for(const field of form.querySelectorAll('[name]')){
      if(expected[field.name]===undefined)continue;
      if(field.tagName==='SELECT'){
        const wanted=String(expected[field.name]);
        for(const option of field.options)option.disabled=option.value!==wanted;
        field.value=wanted;
      }else if(field.type!=='checkbox')field.value=Array.isArray(expected[field.name])?expected[field.name].join(','):String(expected[field.name]);
    }
  }
}
function showTutorialPreview(guide){
  if(guide.previewLeader)previewLeader(guide.previewLeader,ART,names,{minimizable:true});
  else if(guide.previewCharacter)previewCard({name:names[guide.previewCharacter],image:ART.characters[guide.previewCharacter],description:'盗贼起始拥有靴子、火把、茶和剑。白天耗竭火把，可偷窃同地其他阵营一张随机手牌。'},ART,names,{minimizable:true});
  else if(guide.previewCard)previewCard(guide.previewCard,ART,names,{minimizable:true});
}
function updateBasicGuide({from=null,picked=null,choice=false,action:mapAction=null}={}){
  const meta=S.room?.tutorial,guide=meta?.guide;
  if(!guide)return;
  const board=document.querySelector('.map-card'),dialogue=board?.querySelector('.tutorial-dialogue');
  if(!dialogue)return;
  const acting=guide.mode==='act',game=S.room.game;
  clearTimeout(tutorialAutoTimer);
  if(guide.auto&&acting&&!meta.ready){
    const version=S.room.version;
    const advance=()=>{
      if(S.room?.version!==version||S.room.tutorial?.id!==meta.id||S.room.tutorial.guide?.mode!=='act'||!S.room.tutorial.guide.auto)return;
      if(S.busy||document.hidden||document.querySelector('.map-card')?.dataset.presentationBusy==='true'){tutorialAutoTimer=setTimeout(advance,100);return;}
      safely(()=>tutorialCommand({type:'coach-next'}));
    };
    tutorialAutoTimer=setTimeout(advance,650);
  }
  const target=guide.allowAlternatives?(mapAction||{}):guide.action||game.factionActions[0]?.action||game.mapActions[0]||{};
  const context={...(guide.allowAlternatives?{}:meta.context),...(target.from!==undefined?{from:target.from,to:target.to}:{}),...(target.clearing!==undefined?{clearing:target.clearing}:{}),...(target.clearings?{clearings:target.clearings}:{} )},moving=context.from!==undefined&&target.type!=='slip';
  const phase=choice?'choice':picked!==null?'confirm':moving&&from!==null?'destination':'source';
  let instruction=guide.prompts[phase]||meta.text;
  if(acting&&!guide.watch&&phase==='source'&&!meta.context.story){
    if(meta.stepId==='bird-execute')instruction=game.phase==='decree-add'?'新法令已写好。点击“开始执行法令”，准备履行承诺。':game.phase==='craft'?'这次没有要锻造的牌。结束锻造，开始依次执行法令。':game.currentDecreeColumn==='recruit'?'先履行招募法令：点秋林1的鸟巢，确认招募一名战士。':game.currentDecreeColumn==='move'?'接下来履行移动法令：先点秋林1的部队，再点秋林0，检查人数并确认。':'最后履行建造法令：点我们控制的秋林0，建起第二座鸟巢。';
    if(meta.stepId==='wa-organize')instruction=game.phase==='daylight'?'结束白天，进入长官指挥的夜晚。':game.board[meta.context.to].warriors.alliance?'战士已经就位。切换到组织，点秋林1，收回战士并放置民意。':'第一次军事行动：选择移动，点秋林0的战士，再点秋林1，确认移动一名。';
    if(meta.stepId==='vg-slip')instruction=game.phase==='refresh'?'物品恢复完毕。点击结束恢复，进入潜行阶段。':'点亮起的秋林0，确认清晨潜行。这一步不耗竭靴子。';
  }
  const legacyStageHint=!meta.context.story&&['bird-execute','wa-organize','vg-slip'].includes(meta.stepId);
  dialogue.querySelector('.guide-line').textContent=acting&&(phase!=='source'||legacyStageHint)?instruction:guide.text;
  dialogue.dataset.guideStage=acting?phase:guide.focus;
  const focus=acting?(phase==='destination'?'to':phase==='source'&&moving?'from':moving?'route':'clearing'):guide.focus;
  let ids=focus==='home'?[0]:focus==='from'?[context.from]:focus==='to'?[context.to]:focus==='route'?[context.from,context.to]:focus==='clearing'?[context.clearing??context.to,...(context.clearings||[]),...(['explore','aid','quest','special'].includes(target.type)?[game.vagabond?.position]:[])]:[];
  if(acting&&guide.allowAlternatives&&phase==='source'&&picked===null){
    ids=(guide.alternatives||[]).filter(a=>!target.type||a.type===target.type).flatMap(a=>a.from!==undefined?[a.from]:a.clearing!==undefined?[a.clearing]:a.to!==undefined?[a.to]:a.clearings||[]);
  }
  if(meta.lessonId==='basics'&&focus==='clearing'&&!ids.some(id=>id!==undefined))ids=[3];
  ids=ids.filter(id=>id!==undefined);
  if(acting&&!ids.length)ids=[...board.querySelectorAll('.clearing.actionable')].map(n=>Number(n.dataset.id));
  const previewKey=[meta.id,meta.stepId,meta.attempt,guide.previewCard?.id||guide.previewLeader||guide.previewCharacter].join('|');
  if(['card','leader'].includes(guide.focus)&&(guide.previewCard||guide.previewLeader||guide.previewCharacter)&&!tutorialPreviewSeen.has(previewKey)){tutorialPreviewSeen.add(previewKey);requestAnimationFrame(()=>{if(S.room?.tutorial?.id===meta.id&&S.room.tutorial.stepId===meta.stepId){showTutorialPreview(guide);}});}
  for(const node of board.querySelectorAll('.clearing')){
    node.classList.toggle('guide-focus',ids.includes(Number(node.dataset.id)));
    node.classList.toggle('guide-suit',focus==='suits');
    if(acting)node.setAttribute('aria-disabled',String(!node.classList.contains('actionable')));
    else node.removeAttribute('aria-disabled');
  }
  board.querySelector('.guide-route')?.remove();
  const map=board.querySelector('svg.map');
  map.dataset.fullView ||= map.getAttribute('viewBox');
  const cameraIds=moving&&['from','to','route'].includes(focus)?[context.from,context.to]:ids;
  const camera=cameraIds.map(id=>board.querySelector(`.clearing[data-id="${id}"] .ground`)).filter(Boolean);
  const height=innerWidth<=760?330:Math.min(520,Math.max(360,innerHeight*.52));
  map.style.height=height+'px';
  if(camera.length){
    const xs=camera.map(node=>Number(node.getAttribute('cx'))),ys=camera.map(node=>Number(node.getAttribute('cy')));
    const aspect=map.clientWidth/height;
    let width=Math.max(innerWidth<=760?420:620,Math.max(...xs)-Math.min(...xs)+280);
    let boxHeight=Math.max(Math.max(...ys)-Math.min(...ys)+270,width/aspect);width=boxHeight*aspect;
    const x=Math.max(15,Math.min((Math.min(...xs)+Math.max(...xs)-width)/2,ART.board.width-width-15));
    const y=Math.max(20,Math.min((Math.min(...ys)+Math.max(...ys)-boxHeight)/2,ART.board.height-boxHeight-20));
    moveCamera(map,[x,y,width,boxHeight],S.room.gameId+'|'+(meta.attempt||0));
  }else{
    moveCamera(map,map.dataset.fullView,S.room.gameId+'|'+(meta.attempt||0));
  }
  if(context.from!==undefined&&['route','to'].includes(focus)){
    const centers=[context.from,context.to].map(id=>board.querySelector(`.clearing[data-id="${id}"] .ground`));
    if(centers.every(Boolean)){
      const route=document.createElementNS('http://www.w3.org/2000/svg','path');
      route.setAttribute('d',`M ${centers[0].getAttribute('cx')} ${centers[0].getAttribute('cy')} L ${centers[1].getAttribute('cx')} ${centers[1].getAttribute('cy')}`);
      route.setAttribute('class','guide-route');route.setAttribute('aria-hidden','true');
      map.insertBefore(route,map.querySelector('.clearing'));
    }
  }
  const hero=S.room.game.players.find(p=>p.id===S.user.id);
  const evidence=dialogue.querySelector('.guide-evidence');
  if(focus==='suits')evidence.innerHTML=['fox','rabbit','mouse'].map(suit=>`<span>${suitImage(suit)}${names[suit]}</span>`).join('');
  else if(focus==='score')evidence.innerHTML=`<span class="guide-score">${names[meta.faction||'cat']}的声望　${hero.score} / 30</span>`;
  else if(acting&&['battle','defenseless'].includes(meta.stepId))evidence.innerHTML=meta.stepId==='battle'?'<small>本次骰子 3 / 1：进攻方取大数；骰子命中受本方士兵数限制。</small>':'<small>本次骰子 0 / 0：敌方没有守军，进攻方仍有额外命中 +1。</small>';
  else evidence.replaceChildren();
  if(guide.resources){const r=guide.resources;evidence.innerHTML=`<span>第 ${r.round} 轮</span><span>声望 ${r.score}</span><span>手牌 ${r.hand}</span>`+(meta.faction==='cat'?`<span>木材 ${r.wood}</span>`:meta.faction==='alliance'?`<span>长官 ${r.officers}</span>`:meta.faction==='vagabond'?`<span>可用物品 ${r.items}</span>`:'');}
  if(guide.evidence)evidence.insertAdjacentHTML('beforeend',guide.evidence.map(text=>`<span>${esc(text)}</span>`).join(''));
  for(const panel of document.querySelectorAll('.hand-panel,.own-resources,.map-action-menu'))panel.classList.toggle('guide-panel-focus',acting&&!guide.watch&&(panel.matches('.map-action-menu')||['craft','decree-add','mobilize','train','discard','extra'].includes(target.type)&&panel.matches('.hand-panel')));
  for(const column of document.querySelectorAll('[data-decree-column]'))column.classList.toggle('guide-panel-focus',!!meta.context.story&&column.dataset.decreeColumn===(target.column||game.currentDecreeColumn));
  if(guide.outcome){
    const outcome=guide.outcome;
    evidence.innerHTML=(outcome.dice?`<span class="guide-dice" aria-label="掷骰结果 ${outcome.dice.join(' / ')}">${outcome.dice.map(value=>`<b>${value}</b>`).join('')}</span>`:'')+
      `<span>猫咪 ${outcome.cat.join(' → ')}</span><span>飞鹰 ${outcome.bird.join(' → ')}</span><span>鸟巢 ${outcome.roost.join(' → ')}</span><span>声望 +${outcome.points}</span>`;
  }
  for(const track of document.querySelectorAll('.victory-track'))track.classList.toggle('guide-score-focus',focus==='score');
  board.dataset.guideActing=String(acting);
}
function focusLessonMap(meta){
  if(!meta||meta.guide)return;
  const map=document.querySelector('svg.map');if(!map)return;
  map.dataset.fullView ||= map.getAttribute('viewBox');
  const context=meta.context||{},ids=[context.from,context.to,context.clearing,...(context.clearings||[])].filter(id=>id!==undefined);
  const points=ids.map(id=>ART.board.clearings[id]||ART.board.forests?.[id]).filter(Boolean);
  for(const el of map.querySelectorAll('.clearing'))el.classList.toggle('guide-focus',ids.includes(Number(el.dataset.id)));
  let box=map.dataset.fullView;
  if(points.length){
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y),width=Math.max(620,Math.max(...xs)-Math.min(...xs)+280),height=Math.max(360,Math.max(...ys)-Math.min(...ys)+280);
    box=[Math.max(15,Math.min((Math.min(...xs)+Math.max(...xs)-width)/2,ART.board.width-width-15)),Math.max(20,Math.min((Math.min(...ys)+Math.max(...ys)-height)/2,ART.board.height-height-20)),width,height];
  }
  moveCamera(map,box,S.room.gameId+'|'+(meta.attempt||0));
}
async function loadTutorials(){
  const result=await api('/api/tutorials');closeStream();S.room=null;S.history=null;S.page='tutorials';S.tutorials=result.lessons;location.hash='tutorials';render();
}
function enterTutorial(room){
  closeStream();S.history=null;S.room=room;S.page='tutorial';S.selected=0;S.card=null;location.hash=`tutorial=${room.tutorial.lessonId}`;render();
  requestAnimationFrame(()=>document.querySelector(room.tutorial.guide?'.map-card':innerWidth<=760?'.tutorial-coach':'.map-card')?.scrollIntoView({block:room.tutorial.guide?'start':innerWidth<=760?'start':'center'}));
}
async function tutorialCommand(command){
  const room=S.room;
  try{
    const result=await api(`/api/tutorials/${room.tutorial.lessonId}/command`,{runId:room.tutorial.id,version:room.version,commandId:commandId(),command});
    if(S.room?.tutorial?.lessonId===result.room.tutorial.lessonId){S.room=result.room;render();}
  }catch(error){
    if(error.status===409){const result=await api(`/api/tutorials/${room.tutorial.lessonId}`);if(S.room?.tutorial?.lessonId===room.tutorial.lessonId){S.room=result.room;render();}}
    throw error;
  }
}
let tutorialObservationKey=null,tutorialAutoTimer=null;
const tutorialPreviewSeen=new Set();
let companionPanels={gameId:null,info:false,private:false,viewer:null};
function companionGameView(){
  const room=S.room,game=room.game,active=!!room.viewerId&&!room.hotseat.locked;
  const own=room.members.find(m=>m.userId===room.companion.seatId),actor=room.hotseat.actor;
  const me=active?game.players.find(p=>p.id===room.viewerId):null;
  if(companionPanels.gameId!==room.gameId)companionPanels={gameId:room.gameId,info:false,private:false,viewer:room.viewerId};
  if(companionPanels.viewer!==room.viewerId){companionPanels.private=false;companionPanels.viewer=room.viewerId;}
  const prompt=game.winner?`${game.players.filter(p=>(game.winners||[game.winner]).includes(p.id)).map(p=>p.name).join(' 与 ')} 获胜`:active?(game.choice?.prompt||'处理你的决策'):room.companion.canDecide?'有一项属于你的决策，请确认后操作':`等待${actor?.name||'下一位玩家'}操作 · 公共棋盘实时同步`;
  const hand=me?(me.hand||[]).map(card=>`<button class="card" data-action="card" data-card="${esc(card.id)}">${artImage(ART.cards[card.archetype]||ART.dominance?.[card.archetype],card.name,'card-art')}<span>${esc(card.name)}</span><small>${names[card.suit]}</small></button>`).join(''):'';
  const scores=game.players.map(p=>`<article class="companion-score">${artImage(ART.portraits[p.faction],names[p.faction],'score-portrait')}<span><strong>${esc(p.name)}</strong><small>${names[p.faction]} · 手牌${p.handCount}</small></span><b>${p.score}分</b></article>`).join('');
  const spatial=active&&game.choice?.options?.length&&game.choice.options.every(o=>/^\d+$/.test(o.id));
  frame(`<section class="companion-shell ${active?'companion-deciding':''}" data-companion-view="${active?'private':'public'}" aria-label="手机辅助屏"><header class="companion-top"><button data-action="lobby" class="quiet" aria-label="返回大厅">←</button><div class="companion-identity"><strong>${own?esc(own.name)+' · '+names[own.faction]:'公共辅助屏'}</strong><small>#${room.code} <span class="connection"></span></small></div><span class="companion-rotate">横屏看棋盘</span>${btn('全屏','companion-fullscreen','quiet')}${active?btn('隐藏','companion-hide','quiet'):''}</header><div class="companion-board">${board(game)}${active?`<section class="panel actions">${controls(game,me)}</section>`:''}<div class="companion-camera" aria-label="地图缩放"><button data-companion-camera="in" aria-label="放大地图">＋</button><button data-companion-camera="out" aria-label="缩小地图">−</button><button data-companion-camera="reset">全图</button>${spatial?'<button data-companion-camera="focus">目标</button>':''}</div></div><footer class="companion-bottom"><span role="status">${esc(prompt)}</span>${!active&&room.companion.canDecide?btn('确认处理','mobile-confirm','primary'):''}</footer><details class="companion-info" ${companionPanels.info?'open':''}><summary>棋局 / 席位</summary><div class="companion-sheet"><h3>公共棋局信息</h3><div class="companion-scores">${scores}</div>${riverfolkOverview(game)}<p>${esc(clearingLabel(game.board.find(c=>c.id===S.selected)||game.board[0]))}</p>${companionPanel(room)}${btn('声音与动画','preferences','quiet')}<h3>林间纪事</h3>${renderLogGroups(game)}</div></details>${active?`<details class="companion-private" ${companionPanels.private?'open':''}><summary>我的信息</summary><div class="companion-sheet"><h3>私人信息 · ${esc(me.name)}</h3><section class="hand-panel"><h3>我的手牌</h3><div class="hand">${hand||'<small>暂无手牌</small>'}</div></section>${newFactionOverview(game,me)}</div></details>`:''}</section>`);
  decorate(game,active?room.viewerId:null,ART,names);
  if(active)mountMapControls({game,userId:room.viewerId,version:room.version,gameId:room.gameId});else resetMapControls();
  mountCompanionMap(document.querySelector('.companion-board svg.map'),room.gameId);
  for(const [selector,key] of [['.companion-info','info'],['.companion-private','private']]){
    const details=document.querySelector(selector);details?.addEventListener('toggle',()=>{if(details.isConnected)companionPanels[key]=details.open;});
  }
  if(tutorialObservationKey!==null){observe(null,ART);tutorialObservationKey=null;}
  observe(game,ART,{context:room.gameId+'|game'});
}
function maskHotseat(){
  if(S.room?.playMode!=='hotseat'||!S.room.game)return;
  const game=structuredClone(S.room.game);
  for(const player of game.players)if(player.faction!=='otter')delete player.hand;
  if(game.alliance)delete game.alliance.supporters;
  delete game.revealedHand;delete game.outrageReveal;
  if(game.choice)game.choice={choiceId:game.choice.choiceId,playerId:game.choice.playerId,kind:game.choice.kind,waiting:true};
  for(const key of ['mapActions','factionActions','craftOptions','effectOptions'])game[key]=[];
  S.room={...S.room,game,viewerId:null,hotseat:{...S.room.hotseat,locked:true}};render();
}
function hotseatPublicView(){
  const room=S.room,game=room.game,next=room.hotseat.actor,previous=room.hotseat.previous;
  const scores=game.players.map(p=>`<div class="score">${artImage(ART.portraits[p.faction],names[p.faction],'score-portrait')}<div><strong>${esc(p.name)}</strong><small>${names[p.faction]} · ${p.handCount}张手牌</small></div><strong>${p.score}</strong></div>`).join('');
  const title=game.winner?'本局已结束':room.companion?(room.companion.canDecide?'轮到你作出决策':'公共棋盘'):previous?`${esc(previous.name)}的操作已结束`:'请交接操作';
  const message=game.winner?`${game.players.filter(p=>(game.winners||[game.winner]).includes(p.id)).map(p=>esc(p.name)).join(' 与 ')} 获胜，棋局已经保存。`:room.companion?`当前由 ${esc(next?.name||'下一位玩家')}（${names[next?.faction]||''}）操作。`: `接下来请 ${esc(next?.name||'下一位玩家')}（${names[next?.faction]||''}）进行操作。`;
  frame(`${roomHeader()}${room.companion?companionPanel(room):''}<div class="game-stage hotseat-public"><aside class="left-sidebar"><div class="scoreboard">${scores}</div>${riverfolkOverview(game)}</aside><section class="game-board">${board(game)}</section></div>`);
  decorate(game,null,ART,names);
  document.querySelector('.map-card').insertAdjacentHTML('afterbegin',`<section class="hotseat-handoff" role="region" aria-label="同屏操作交接"><div>${next?artImage(ART.portraits[next.faction],names[next.faction],'handoff-portrait'):''}</div><div><h2>${title}</h2><p>${message}</p><small>${game.winner?'':room.companion?'只有属于你的决策需要确认操作。':!game.setup?.complete?'请完成本阵营的开局设置。':room.hotseat.interruption?'当前有一项待决策，处理后将继续原回合。':'私人信息已隐藏，请其他玩家暂时移开视线。'}</small></div><div>${room.companion?(room.companion.canDecide?btn('确认，处理我的决策','mobile-confirm','primary'):'<span>实时查看中</span>'):game.winner?btn('开下一局','new-game','primary'):btn('确认，开始我的操作','hotseat-confirm','primary')}</div></section>`);
  if(tutorialObservationKey!==null){observe(null,ART);tutorialObservationKey=null;}
  observe(game,ART,{context:room.gameId+'|game'});
}
function gameView(){
  if(S.room.companion)return companionGameView();
  if(S.room.playMode==='hotseat'&&(!S.room.viewerId||S.room.hotseat.locked))return hotseatPublicView();
  const game=S.room.game;
  const me=game.players.find(player=>player.id===viewerId());
  const scores=game.players.map(player=>{
    const items=player.faction==='vagabond'?(game.vagabond?.items.length||0):(player.items||[]).length;
    return `<div class="score ${player.id===(game.choice?.playerId||game.players[game.turn].id)?'current':''}" role="button" tabindex="0" data-action="player-public" data-player="${esc(player.id)}" aria-label="查看${esc(player.name)}的公开详情">${artImage(player.faction==='vagabond'?(ART.characters?.[game.vagabond?.character]||ART.portraits.vagabond):ART.portraits[player.faction],player.faction==='vagabond'?(names[game.vagabond?.character]||names.vagabond):names[player.faction],'score-portrait')}<div class="player-info"><strong class="player-name">${esc(player.name)}</strong><span>${names[player.faction]}${player.id===viewerId()?' · 你':''}</span><small>手牌 ${player.handCount} · 物品 ${items} · 持续牌 ${(player.crafted||[]).length}</small></div><strong class="player-score">${player.coalition||player.dominance?'':'<span class="score-caption">胜利分</span>'}${player.coalition?'结盟':player.dominance?'统治':player.score}<small>${player.dominance||player.coalition?'':' / 30'}</small></strong>${victoryTrack(player,true)}</div>`;
  }).join('');
  const hand=(me.hand||[]).map(card=>`<button class="card ${S.card===card.id?'selected':''}" data-action="card" data-card="${esc(card.id)}">${artImage(ART.cards[card.archetype]||ART.dominance?.[card.archetype],card.name,'card-art')}<span class="suit-icon">${suitImage(card.suit)}</span><span>${esc(card.name)}</span><small>${names[card.suit]}${card.effectImplemented===false?' · 当前不可使用':''}</small></button>`).join('')||'<small>暂无手牌</small>';
  const logs=renderLogGroups(game);
  const actorId=game.choice?.playerId||game.players[game.turn].id;
  const activeBot=S.room.members.find(member=>member.userId===actorId&&member.bot);
  const botStatus=S.room.botError?`<div class="notice" role="status">${esc(S.room.botError)} ${S.room.ownerId===viewerId()?btn('重试人机','bot-retry'):''}</div>`:activeBot&&!game.winner?`<div class="notice game-notice" role="status">${esc(activeBot.name)} 正在自动行动…</div>`:'';
  frame(`${roomHeader()}${S.room.playMode==='hotseat'?`<div class="hotseat-status">当前操作：${esc(me.name)} · ${names[me.faction]} ${btn('隐藏信息 / 暂停交接',S.room.companion?'companion-hide':'hotseat-lock','quiet')}</div>`:''}${S.room.tutorial?.guide?'':limitations()}${botStatus}<div class="game-stage ${S.room.tutorial?'tutorial-game':''} ${S.room.tutorial?.guide?'guided-tutorial':''}">
    <aside class="left-sidebar"><div class="scoreboard">${scores}</div>${itemPool(game)}</aside>
    <section class="game-board">${board(game)}<section class="panel actions">${controls(game,me)}</section></section>
    <aside class="right-sidebar game-panels ${S.room.tutorial?'tutorial-panels':''}">
      ${S.room.tutorial&&!S.room.tutorial.guide?tutorialCoach(S.room.tutorial):''}
      <section class="panel info-pane"><h3>我的阵营 · ${names[me.faction]}</h3><section class="own-resources">${pieceStock(game,me)}</section>
        <section class="hand-panel"><div class="row"><h3>我的手牌</h3><small>${me.faction==='otter'?'公开售牌 · 所有玩家可见':'仅你可见'} · 余牌 ${game.deckCount}</small></div><div class="hand">${hand}</div></section>
        ${newFactionOverview(game,me)}
      </section>
      <section class="panel log-pane"><div class="row"><h3>林间纪事</h3><small>第 ${(game.turnsCompleted??0)+1} 轮</small></div>${btn('查看近期操作','recent-actions','quiet')}<div class="logs">${logs}</div>${!S.room.tutorial&&S.room.playMode!=='hotseat'&&!game.winner&&game.players.length===2?btn('认输并结束本局','resign','quiet danger'):''}</section>
    </aside>
  </div>`);
  if(S.room.tutorial?.guide)document.querySelector('.map-card').insertAdjacentHTML('afterbegin',tutorialCoach(S.room.tutorial));
  if(S.room.tutorial)filterTutorialControls(S.room.tutorial);
  decorate(game,viewerId(),ART,names);
  mountMapControls({game,userId:viewerId(),version:S.room.version,gameId:S.room.gameId,tutorial:S.room.tutorial,onTutorialStage:updateBasicGuide});
  focusLessonMap(S.room.tutorial);
  fitSidebars();
  const observationKey=S.room.tutorial?S.room.gameId+'|'+S.room.tutorial.index+'|'+(S.room.tutorial.attempt||0):null;
  if(observationKey!==tutorialObservationKey){observe(null,ART);tutorialObservationKey=observationKey;}
  observe(game,ART,{context:S.room.gameId+'|'+(observationKey||'game')});
}
function historyModal(){const h=S.history;return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="我的对局"><div class="panel-header"><h2>我的服务器存档</h2>${btn('关闭','close-history','quiet')}</div>${h.game?`<p class="muted">存档查看 · ${esc(h.game.ruleset)}</p>${h.game.players.map(p=>`<div class="history-item">${esc(p.name)} · ${names[p.faction]} · ${p.score} 分 · 手牌 ${p.handCount} 张</div>`).join('')}<div class="logs">${renderLogGroups(h.game)}</div>${btn('返回列表','history','quiet')}`:h.games.map(g=>`<article class="history-item"><h3>${g.players.map(p=>esc(p.name)).join(' × ')}</h3><p class="muted">房间 #${g.roomCode} · 第 ${g.round} 轮 · ${g.winner?'已结束':'进行中'}</p><div class="row"><small>${new Date(g.updatedAt).toLocaleString()}</small>${btn('查看存档','view-history','',false,`data-id="${g.id}"`)}</div></article>`).join('')||'<p class="muted">开始第一局后，服务器存档会显示在这里。</p>'}</section></div>`;}
function adminView(){
  const data=S.admin||{users:[],rooms:[]};
  const users=data.users.map(user=>`<article class="admin-card" data-admin-user="${esc(user.id)}">
    <h3>${esc(user.username)} <small>${user.role==='admin'?'管理员':'玩家'} · ${user.disabled?'已停用':'正常'} · 会话 ${user.sessions}</small></h3>
    <div class="row">${btn('强制注销','admin-user-logout','',false,`data-id="${esc(user.id)}"`)}${btn(user.disabled?'启用账号':'停用账号',user.disabled?'admin-user-enable':'admin-user-disable','',user.id===S.user.id,`data-id="${esc(user.id)}"`)}</div>
    <form data-admin="password" data-id="${esc(user.id)}"><label>新密码<input name="password" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><button>重置密码并注销会话</button></form>
  </article>`).join('');
  const rooms=data.rooms.map(room=>`<article class="admin-card" data-admin-room="${room.code}">
    <h3>#${room.code} · ${esc(room.title)}</h3><p class="caption">${esc({waiting:'等待开局',playing:'进行中',finished:'已结束',closed:'已关闭'}[room.status]||room.status)} · ${room.locked?'私密':'公开'} · ${room.hasPassword?'已设密码':'未设密码'} · ${room.members.map(member=>esc(member.name)).join('、')}</p>
    <form data-admin="room-access" data-code="${room.code}" data-version="${room.version}"><label>房间访问<select name="visibility"><option value="public" ${room.locked?'':'selected'}>强制公开</option><option value="private" ${room.locked?'selected':''}>强制私密</option></select></label>
      <label>设置新房间密码<input name="password" type="password" maxlength="128" autocomplete="new-password" placeholder="留空保留现有密码"></label><p class="caption">公开时清除密码。私密且未设密码时仅限现有成员。</p><button>保存房间访问设置</button></form>
    ${btn('强制删除房间及存档','admin-room-delete','danger',false,`data-code="${room.code}" data-version="${room.version}"`)}
  </article>`).join('');
  frame(`<div class="heading"><div><h1>管理控制台</h1><p class="muted">${data.users.length} 个账号 · ${data.rooms.length} 个房间</p></div>${btn('刷新管理数据','admin-refresh')}</div><div class="admin-grid"><section class="panel"><h2>账号管理</h2>${users||'<p>正在加载账号</p>'}</section><section class="panel"><h2>房间管理</h2>${rooms||'<p>暂无房间</p>'}</section></div>`);
}
async function loadAdmin(){
  closeStream();S.room=null;S.history=null;location.hash='';
  const [users,rooms]=await Promise.all([api('/api/admin/users'),api('/api/admin/rooms')]);
  S.admin={users:users.users,rooms:rooms.rooms};render();
}
async function adminRequest(path,data){
  try{await api(path,data);}catch(error){if(error.status===409)await loadAdmin();throw error;}
  await loadAdmin();toast('管理操作已完成');
}
let renderedViewer=null;
function render(){const key=S.room?.gameId+'|'+viewerId();if(key!==renderedViewer){resetMapControls();document.querySelectorAll('dialog.card-preview').forEach(d=>d.remove());S.card=null;S.history=null;document.querySelector('#toast')?.classList.remove('show');renderedViewer=key;}if(!S.room?.game){observe(null,ART);resetCamera();}if(!S.user)loginView();else if(S.user.role==='admin')adminView();else if(S.page==='tutorials')tutorialListView();else if(!S.room)lobbyView();else if(!S.room.game)waitingView();else gameView();}
async function loadLobby(){companionMode=false;controllerId=commandId();if(S.user?.role==='admin')return loadAdmin();S.page='lobby';closeStream();S.room=null;S.history=null;location.hash='';const b=await api('/api/rooms');S.rooms=b.rooms;render();}
async function enter(room){companionMode=!!room.companion;if(room.playMode==='hotseat'&&room.game){controllerId=commandId();room=(await api(`/api/rooms/${room.code}`)).room;}S.page='room';S.room=room;S.selected=0;S.card=null;location.hash=`${companionMode?'companion':'room'}=${room.code}`;render();watch(room.code);requestAnimationFrame(()=>document.querySelector('.map-card')?.scrollIntoView({block:'center',behavior:'auto'}));}
function commandId(){
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function command(c){
  const room=S.room;
  const requestController=controllerId;
  if(room.tutorial)return tutorialCommand(c);
  const data={commandId:commandId(),version:room.version,command:c};
  try{
    const result=await api(`/api/rooms/${room.code}/command`,data);
    if(room.playMode==='hotseat'&&requestController!==controllerId)return;
    if(!room.game)document.querySelector('#toast')?.classList.remove('show');
    if(!result.room){await loadLobby();return;}
    if(c.type==='local-profile')waitingDrafts.delete(room.code+'|'+c.userId);
    if(['ready','profile'].includes(c.type))waitingDrafts.delete(room.code+'|'+S.user.id);
    if(S.room?.code===room.code&&result.room.version>=S.room.version){S.room=result.room;render();}
  }catch(error){
    if(error.status===409){
      const result=await api(`/api/rooms/${room.code}`);
      if(room.playMode==='hotseat'&&requestController!==controllerId)return;
      if(S.room?.code===room.code&&result.room.version>=S.room.version){S.room=result.room;render();}
    }
    throw error;
  }
}
async function deleteRoom(code,title,version){
  if(!confirm(`永久删除房间“${title}”（${code}）？\n该房间的当前对局、全部历史存档和操作记录会一并删除，所有玩家将退出房间。此操作无法撤销。`))return;
  try{await api(`/api/rooms/${code}/delete`,{version});}
  catch(error){
    if(error.status===409){
      if(S.room?.code===code){S.room=(await api(`/api/rooms/${code}`)).room;render();}
      else{S.rooms=(await api('/api/rooms')).rooms;render();}
    }
    if(error.status!==404)throw error;
  }
  if(S.room?.code===code||!S.room)await loadLobby();
  toast('房间及其全部存档已删除');
}
async function safely(fn){if(S.busy)return;S.busy=true;syncBusyButtons();try{await fn();}catch(e){toast(e.message);if(e.status===401){S.user=null;S.mode='login';S.page='lobby';S.room=null;S.history=null;closeStream();render();}}finally{S.busy=false;syncBusyButtons();}}
app.addEventListener('submit',event=>{event.preventDefault();const form=event.target,data=Object.fromEntries(new FormData(form));safely(async()=>{
  if(form.dataset.admin==='password'){
    await adminRequest(`/api/admin/users/${form.dataset.id}/password`,{password:data.password});return;
  }
  if(form.dataset.admin==='room-access'){
    await adminRequest(`/api/admin/rooms/${form.dataset.code}/access`,{version:Number(form.dataset.version),visibility:data.visibility,password:data.password});return;
  }
  if(form.id==='auth'){
    const button=form.querySelector('button');
    const originalLabel=button.textContent;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    button.innerHTML='<span class="request-spinner" aria-hidden="true"></span> 正在'+(S.mode==='register'?'创建账号':'登录')+'…';
    const status=document.createElement('p');
    status.className='caption';
    status.setAttribute('role','status');
    status.textContent='正在连接服务器，请稍候。';
    form.append(status);
    const slowTimer=setTimeout(()=>{status.textContent='服务器尚未返回结果，请稍候。刷新后可检查登录状态。';},3000);
    try{
      const b=await api(`/api/auth/${S.mode}`,data);
      S.user=b.user;
      if(S.user.role==='admin'){await loadAdmin();return;}
      S.rooms=[];
      render();
      toast('已登录，正在加载房间…');
      const userId=b.user.id;
      api('/api/rooms').then(result=>{if(S.user?.id!==userId)return;S.rooms=result.rooms;if(!S.room&&!S.busy)render();}).catch(error=>toast(error.message));
    }finally{
      clearTimeout(slowTimer);
      status.remove();
      button.disabled=false;
      button.removeAttribute('aria-busy');
      button.textContent=originalLabel;
    }
    return;
  }
  if(form.id==='create'){data.capacity=4;await enter((await api('/api/rooms',data)).room);return;}
  if(form.id==='companion-join'){companionMode=true;try{await enter((await api(`/api/rooms/${data.code}/companion`,{password:data.password})).room);}catch(e){companionMode=false;throw e;}return;}
  if(form.id==='join'){await enter((await api(`/api/rooms/${data.code}/join`,data)).room);return;}
  if(form.dataset.localProfile){await command({type:'local-profile',userId:form.dataset.localProfile,...data,ready:true});return;}
  if(form.id==='profile'){await command({type:'ready',ready:true,...data});return;}
  if(form.dataset.type==='faction-action'){
    const option=S.room.game.factionActions[Number(data.option)];
    if(!option)throw new Error('行动已更新，请重新选择');
    const action=structuredClone(option.action);
    const cards=new FormData(form).getAll('supporter');
    if(cards.length)action.cards=cards;
    const chosenFunds=new FormData(form).getAll('fund');if(chosenFunds.length)action.funds=chosenFunds;
    const chosenItems=new FormData(form).getAll('serviceItem');if(chosenItems.length)action.items=chosenItems;
    await command({type:'action',action});return;
  }
  if(form.dataset.type==='set-prices'){await command({type:'action',action:{type:'set-prices',prices:Object.fromEntries(['cards','boats','mercenaries'].map(k=>[k,Number(data[k])]))}});return;}
  const action={type:form.dataset.type||form.id,...data};for(const k of ['from','to','clearing','count'])if(k in action)action[k]=Number(action[k]);
  if('pieces' in action){if(action.pieces.trim())action.pieces=action.pieces.split(',').map(value=>value.trim());else delete action.pieces;}
  for(const k of ['wood','clearings'])if(k in action)action[k]=action[k].trim()?action[k].split(',').map(v=>Number(v.trim())):[];
  const d=document.querySelector('#decree-card');if(d)action.decreeCard=d.value;
  await command({type:'action',action});
});});
app.addEventListener('click',event=>{const b=event.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;
  if(action==='preferences'){showPreferences();return;}
  if(action==='companion-fullscreen'){safely(async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('当前浏览器不支持全屏，可直接横屏查看');}catch{toast('无法进入全屏，可继续使用辅助屏');}});return;}
  if(action==='riverfolk-card'){const card=S.room.game.players.find(p=>p.faction==='otter')?.hand?.find(c=>c.id===b.dataset.card);if(card)previewCard(card,ART,names);return;}
  if(action==='leader-preview'){previewLeader(b.dataset.leader,ART,names);return;}
  if(action==='player-public'){const player=S.room.game.players.find(player=>player.id===b.dataset.player);if(player){showPublicDetails(player.name+' · '+names[player.faction],playerPublicDetails(S.room.game,player));decorate(S.room.game,viewerId(),ART,names);}return;}
  if(action==='recent-actions'){showEvents(S.room.game);return;}
  if(action==='forest-info'){if(pickMapClearing(Number(b.dataset.id)))return;toast(`森林 ${b.dataset.id} · 游侠可在清晨潜行进出`,'game');return;}
  if(action==='tutorial-craft-preview'){const guide=S.room?.tutorial?.guide;if(guide)showTutorialPreview(guide);return;}
  if(action==='clearing'){if(S.room?.tutorial?.guide?.mode==='act'&&!b.classList.contains('actionable'))return;S.selected=Number(b.dataset.id);render();pickMapClearing(S.selected);return;}if(action==='card'){S.card=b.dataset.card;const card=S.room.game.players.find(player=>player.id===viewerId()).hand.find(card=>card.id===S.card);render();if(card)previewCard(card,ART,names);return;}
  safely(async()=>{
    if(action==='tab-login'||action==='tab-register'){S.mode=action.slice(4);render();return;}
    if(action==='tutorials'){await loadTutorials();return;}
    if(action==='tutorial-start'){enterTutorial((await api(`/api/tutorials/${b.dataset.lesson}/start`,{})).room);return;}
    if(action==='tutorial-next'){await tutorialCommand({type:'next'});return;}
    if(action==='tutorial-coach-next'){await tutorialCommand({type:'coach-next'});return;}
    if(action==='tutorial-guide-next'||action==='tutorial-guide-back'){
      await tutorialCommand({type:action==='tutorial-guide-next'?'guide-next':'guide-back'});
      document.querySelector('.tutorial-dialogue .tutorial-buttons .primary')?.focus({preventScroll:true});return;
    }
    if(action==='tutorial-retry'){await tutorialCommand({type:'retry-step'});return;}
    if(action==='tutorial-restart'){if(confirm('从本章第一节重新开始？'))await tutorialCommand({type:'restart'});return;}
    if(action==='admin-refresh'){await loadAdmin();return;}
    if(['admin-user-logout','admin-user-disable','admin-user-enable'].includes(action)){
      await adminRequest(`/api/admin/users/${b.dataset.id}/${action.slice('admin-user-'.length)}`,{});return;
    }
    if(action==='admin-room-delete'){
      if(confirm(`强制删除房间 #${b.dataset.code} 及其全部存档？`))await adminRequest(`/api/admin/rooms/${b.dataset.code}/delete`,{version:Number(b.dataset.version)});return;
    }
    if(action==='lobby'){if(S.user)await loadLobby();return;}
    if(action==='logout'){await api('/api/auth/logout',{});S.user=null;S.mode='login';S.page='lobby';S.room=null;S.history=null;closeStream();location.hash='';render();return;}
    if(action==='refresh'){S.rooms=(await api('/api/rooms')).rooms;render();return;}
    if(action==='delete-room'){
      const room=S.room?.code===b.dataset.code?S.room:S.rooms.find(room=>room.code===b.dataset.code);
      if(room)await deleteRoom(room.code,room.title,room.version);
      return;
    }
    if(action==='copy'){if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(S.room.code);toast('房间号已复制');}else toast(`房间号 ${S.room.code}`);return;}
    if(action==='history'){S.history=await api('/api/games');render();return;}
    if(action==='view-history'){S.history=await api(`/api/games/${b.dataset.id}`);render();return;}
    if(action==='close-history'){S.history=null;render();return;}
    if(action==='open-room'){if(b.dataset.mine==='true'){await enter((await api(`/api/rooms/${b.dataset.code}`)).room);}else{const f=document.querySelector('#join');f.elements.code.value=b.dataset.code;f.elements.name.focus();f.scrollIntoView({behavior:'smooth',block:'center'});toast('填写本局玩家名后加入');}return;}
    if(action==='bot-add'){await command({type:'bot-add',seat:Number(b.dataset.seat)});return;}
    if(action==='bot-remove'){await command({type:'bot-remove',userId:b.dataset.user});return;}
    if(action==='bot-retry'){await command({type:'bot-retry'});return;}
    if(action==='claim-request'){await command({type:'claim-request',seatId:b.dataset.user});return;}
    if(action==='claim-cancel'){await command({type:'claim-cancel'});return;}
    if(action==='claim-approve'||action==='claim-reject'){await command({type:action,requestId:b.dataset.request});return;}
    if(action==='claim-release'){await command({type:'claim-release',seatId:b.dataset.user});return;}
    if(action==='mobile-confirm'){await command({type:'mobile-confirm',actorId:S.room.hotseat.actor.id,epoch:S.room.hotseat.epoch});return;}
    if(action==='companion-hide'){controllerId=commandId();maskHotseat();watch(S.room.code);await command({type:'companion-hide'});return;}
    if(action==='companion-leave'){await command({type:'companion-leave'});await loadLobby();return;}
    if(action==='local-add'){await command({type:'local-add',seat:Number(b.dataset.seat)});return;}
    if(action==='local-remove'){await command({type:'local-remove',userId:b.dataset.user});return;}
    if(action==='local-unready'){const p=S.room.members.find(m=>m.userId===b.dataset.user);await command({type:'local-profile',userId:p.userId,name:p.name,faction:p.faction,ready:false});return;}
    if(action==='hotseat-confirm'){await command({type:'hotseat-confirm',actorId:S.room.hotseat.actor.id,epoch:S.room.hotseat.epoch});return;}
    if(action==='hotseat-lock'){controllerId=commandId();maskHotseat();watch(S.room.code);await command({type:'hotseat-lock'});return;}
    if(action==='ready'){await command({type:'ready',ready:!S.room.members.find(m=>m.userId===S.user.id).ready});return;}
    if(action==='start'){await command({type:'start',ruleset:S.room.ruleset||S.ruleset});return;}
    if(action==='choice'){await command({type:'action',action:{type:'choice',choiceId:b.dataset.choice,optionId:b.dataset.option}});return;}
    if(action==='craft'){await command({type:'action',action:{type:'craft',card:b.dataset.card}});return;}
    if(action==='resign'){if(confirm('确定认输并结束当前对局？存档会保留。'))await command({type:'resign'});return;}
    if(['leave','new-game'].includes(action)){await command({type:action});return;}
    await command({type:'action',action:{type:action,...(action==='loss'?{piece:b.dataset.piece}:{})}});
  });
});
app.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target.matches('[role=button]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
app.addEventListener('input',event=>{const form=event.target.closest('#profile');if(!form)return;captureWaitingDraft();const seat=form.closest('.room-seat');seat.querySelector('.seat-display-name').textContent=form.elements.name.value;const faction=form.elements.faction.value;seat.classList.remove('cat','bird','alliance','vagabond','lizard','otter');seat.classList.add(faction);const portrait=seat.querySelector('.seat-portrait');portrait.src=ART.portraits[faction];portrait.alt=names[faction];seat.querySelector('.seat-faction-title').textContent=names[faction];});
app.addEventListener('change',event=>{if(event.target.dataset.botFaction){const userId=event.target.dataset.botFaction,faction=event.target.value;safely(async()=>{await command({type:'bot-profile',userId,faction});});return;}if(event.target.id==='ruleset'){const ruleset=event.target.value;safely(async()=>{await command({type:'ruleset',ruleset});});}});
window.addEventListener('beforeunload',closeStream);
async function init(){try{const [session,art]=await Promise.all([api('/api/me'),api('/asset-manifest.json')]);ART=art;S.user=session.user;if(S.user){if(S.user.role==='admin'){await loadAdmin();return;}if(location.hash==='#tutorials'){await loadTutorials();return;}const tutorial=location.hash.match(/^#tutorial=([a-z-]+)$/);if(tutorial){enterTutorial((await api(`/api/tutorials/${tutorial[1]}/start`,{})).room);return;}S.rooms=(await api('/api/rooms')).rooms;const m=location.hash.match(/^#(?:room|companion)=(\d{6})$/);if(m){try{await enter((await api(`/api/rooms/${m[1]}`)).room);return;}catch{location.hash='';}}}render();}catch{app.innerHTML='<div class="loading">连接服务器失败，请刷新重试。</div>';}}
setInterval(async()=>{if(S.user&&!S.room&&!S.busy&&!S.history){try{const rooms=(await api('/api/rooms')).rooms;S.rooms=rooms;const grid=document.querySelector('.room-grid');if(grid)grid.innerHTML=rooms.map(roomCard).join('')||'<div class="empty">暂无房间，创建一间邀请朋友加入。</div>';}catch{}}},8000);
init();
