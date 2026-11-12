// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; original audio excluded. See LICENSE-SCOPE.md.
const defaults={sound:true,volume:.35,motion:'full'};
let preferences={...defaults};
try{const saved=JSON.parse(localStorage.getItem('woodland-experience')||'null');if(saved){preferences.sound=saved.sound!==false;preferences.volume=Number.isFinite(saved.volume)?Math.max(0,Math.min(1,saved.volume)):.35;preferences.motion=['full','reduced','off'].includes(saved.motion)?saved.motion:'full';}}catch{}
let context,manifest;
const buffers=new Map(),active=new Map();
export function motionDuration(milliseconds){
  const reduced=preferences.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  return preferences.motion==='off'?0:reduced?Math.min(milliseconds,100):milliseconds;
}
function applyPreferences(){document.documentElement.dataset.motion=preferences.motion;}
export function unlockAudio(){
  if(!preferences.sound)return;
  try{const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return;context ||= new Audio();void context.resume().catch(()=>{});}catch{}
}
export function stopSounds(){for(const source of active.keys()){try{source.stop();}catch{}}active.clear();}
export async function playSound(kind){
  if(!preferences.sound||!preferences.volume||!context||context.state!=='running'||document.hidden)return;
  const started=performance.now();
  try{
    manifest ||= fetch('/audio-manifest.json').then(r=>{if(!r.ok)throw new Error('audio manifest');return r.json();}).catch(()=>{manifest=null;return null;});
    const catalog=await manifest;if(!catalog)return;
    const aliases={pieces:'build',craft:'draw',aid:'aid',supporter:'draw'};
    const url=catalog.clips[aliases[kind]||kind];if(!url)return;
    if(!buffers.has(url))buffers.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error('audio clip');return r.arrayBuffer();}).then(data=>context.decodeAudioData(data)).catch(()=>null));
    const buffer=await buffers.get(url);
    if(!buffer){buffers.delete(url);return;}
    if(!preferences.sound||!preferences.volume||context.state!=='running'||document.hidden||performance.now()-started>600)return;
    while(active.size>=3){const oldest=active.keys().next().value;try{oldest.stop();}catch{}active.delete(oldest);}
    const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;gain.gain.value=preferences.volume;source.connect(gain);gain.connect(context.destination);source.onended=()=>active.delete(source);active.set(source,gain);source.start();
  }catch{/* A missing/blocked clip must never prevent an action or animation. */}
}
export function showPreferences(){
  if(document.querySelector('.experience-dialog'))return;
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='experience-dialog';
  dialog.setAttribute('aria-label','声音与动画');
  dialog.innerHTML=`<h2>声音与动画</h2><label class="sound-toggle"><input type="checkbox" name="sound" ${preferences.sound?'checked':''}>播放原游戏音效</label><label>音量<input type="range" name="volume" min="0" max="1" step=".05" value="${preferences.volume}"></label><label>动画效果<select name="motion"><option value="full">完整动画</option><option value="reduced">简化动画</option><option value="off">关闭动画</option></select></label><p class="caption">设置保存在当前浏览器。系统的减少动态效果偏好同样有效。</p><div class="row"><button type="button" data-sound-preview>试听掷骰</button><button type="button" data-close-experience class="primary">完成</button></div>`;
  dialog.querySelector('[name=motion]').value=preferences.motion;
  dialog.addEventListener('input',()=>{
    preferences={sound:dialog.querySelector('[name=sound]').checked,volume:Number(dialog.querySelector('[name=volume]').value),motion:dialog.querySelector('[name=motion]').value};
    try{localStorage.setItem('woodland-experience',JSON.stringify(preferences));}catch{}
    applyPreferences();for(const gain of active.values())gain.gain.value=preferences.volume;if(!preferences.sound||!preferences.volume)stopSounds();else unlockAudio();
  });
  dialog.querySelector('[data-sound-preview]').onclick=()=>{unlockAudio();void playSound('dice');};
  dialog.querySelector('[data-close-experience]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(previous?.isConnected)previous.focus({preventScroll:true});});
  document.body.append(dialog);dialog.showModal();
}
if(typeof document!=='undefined'){
  document.addEventListener('pointerdown',unlockAudio,{capture:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSounds();});
  applyPreferences();
}
