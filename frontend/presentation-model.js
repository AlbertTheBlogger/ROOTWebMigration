// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
// Pure timing shared by browser playback and the server's production bot scheduler.
export const presentationTimes={move:1800,battle:1800,dice:1800,build:1800,pieces:1600,score:1800,draw:1800,craft:1800,aid:1800,outrage:1000,supporter:1000,wood:1800,turmoil:6000,revolt:2400,catchup:1500};
export function presentationPlan(events){
  const turmoil=events.some(event=>event.kind==='turmoil');
  const visible=events.filter(event=>!(event.kind==='battle'&&events.some(other=>other.kind==='dice'))&&!(turmoil&&event.kind==='score'&&event.faction==='bird'&&event.reason==='王朝倒台'));
  const first=visible.filter(event=>!['score','turmoil'].includes(event.kind));
  const firstLength=Math.max(0,...first.map(event=>presentationTimes[event.kind]||1800));
  const delay=turmoil?Math.min(1800,firstLength):firstLength;
  const travel=events.some(e=>e.kind==='move')?presentationTimes.move:0;
  return visible.map(event=>({event,delay:event.kind==='outrage'?travel:event.kind==='supporter'&&events.some(e=>e.kind==='outrage')?travel+1000:['score','turmoil'].includes(event.kind)?delay:0,duration:presentationTimes[event.kind]||1800}));
}
export function presentationLength(events){return Math.max(0,...presentationPlan(events).map(slot=>slot.delay+slot.duration));}
export function botThinkDelay(random=Math.random){
  const n=Math.max(0,Math.min(1-Number.EPSILON,random()));
  if(n<.7)return 2500+Math.floor(n/.7*2001);
  if(n<.9)return 2000+Math.floor((n-.7)/.2*501);
  return 4500+Math.floor((n-.9)/.1*1001);
}
export function botStepDelay(game,random=Math.random){
  const events=game.presentationEvents||[],last=events.at(-1);
  const id=game.presentationBatch??last?.batch;
  const batch=id===undefined?[]:events.filter(event=>event.batch===id);
  // Leave one rendering/network scheduling margin after the complete animation.
  return Math.max(botThinkDelay(random),presentationLength(batch)+100);
}
export function interpolateBox(from,to,progress){
  const t=Math.max(0,Math.min(1,progress)),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  return to.map((value,index)=>from[index]+(value-from[index])*ease);
}
export function unseenEvents(previous,game){
  if(!previous)return [];
  if(Array.isArray(game.presentationEvents)){
    const last=previous.presentationSeq||0;
    if((game.presentationSeq||0)<last)return [];
    // Reconnect gaps should catch up to the board, not replay a long old battle.
    if(game.presentationEvents.length&&game.presentationEvents[0].seq>last+1)return [{kind:'catchup'}];
    return game.presentationEvents.filter(event=>event.seq>last);
  }
  // Historical lab rulesets keep their old state schema and use public fallbacks.
  const events=(game.scoreEvents||[]).filter(event=>event.seq>(previous.scoreEventSeq||0)).map(event=>({...event,kind:'score'}));
  let overlap=Math.min(previous.log.length,game.log.length);
  while(overlap&&previous.log.slice(-overlap).join('\n')!==game.log.slice(0,overlap).join('\n'))overlap--;
  for(const text of game.log.slice(overlap)){
    const dice=text.match(/^服务器战斗骰子 (\d) \/ (\d)/);
    if(dice)events.push({kind:'dice',values:[Number(dice[1]),Number(dice[2])]});
  }
  for(const player of game.players){
    const old=previous.players.find(value=>value.id===player.id),count=player.handCount-(old?.handCount||0);
    if(old&&count>0)events.push({kind:'draw',playerId:player.id,faction:player.faction,count});
  }
  return events;
}
