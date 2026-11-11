const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function groupLogs(game){
  const logs=game.log||[];
  const metadata=game.logTurns||[];
  const starts=logs.flatMap((text,index)=>{
    const match=text.match(/^(.*?) 第 \d+ 轮开始(?: · 清晨)?$/)||text.match(/^(.*?) 的第 \d+ 轮回合$/);
    return match?[{index,player:match[1]}]:[];
  });
  const currentTurn=(game.turnsCompleted??0)+1;
  const last=starts.at(-1);
  const lastTurn=last&&Number.isInteger(metadata[last.index])?metadata[last.index]:currentTurn;
  const firstTurn=Math.max(1,lastTurn-starts.length+1);
  let turn=starts.length?Math.max(0,firstTurn-1):currentTurn;
  let player=turn===0?'开局设置':starts.length?'此前回合':game.players?.[game.turn]?.name||'玩家';
  const groups=[];
  for(let index=0;index<logs.length;index++){
    const start=starts.find(entry=>entry.index===index);
    if(start){turn=firstTurn+starts.indexOf(start);player=start.player;}
    const ordinal=Number.isInteger(metadata[index])?metadata[index]:turn;
    const label=ordinal===0?'开局设置':player;
    let group=groups.at(-1);
    if(!group||group.turn!==ordinal){group={turn:ordinal,player:label,entries:[]};groups.push(group);}
    group.entries.push(start?`${start.player} 回合开始 · 清晨`:logs[index]);
  }
  return groups;
}
export function renderLogGroups(game){
  return groupLogs(game).reverse().map(group=>`<section class="log-turn" data-log-turn="${group.turn}"><h4>${group.turn===0?'开局设置':`第 ${group.turn} 轮 · ${escape(group.player)}`}</h4><ol>${group.entries.slice().reverse().map(text=>`<li>${escape(text)}</li>`).join('')}</ol></section>`).join('');
}
