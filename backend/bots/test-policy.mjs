// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
// Shared smoke-test policies. Room bots enable development from round one.
function ruler(c) {
  const cat=c.warriors.cat+c.buildings.filter(b=>b.faction==='cat').length;
  const bird=c.warriors.bird+c.buildings.filter(b=>b.faction==='bird').length;
  return bird>0 && bird>=cat?'bird':cat>0?'cat':null;
}
function wood(g,id) {
  const seen=new Set(),todo=[id];
  while(todo.length){const n=todo.pop(),c=g.board[n];if(seen.has(n)||ruler(c)!=='cat')continue;seen.add(n);todo.push(...c.links);}
  return [...seen].flatMap(n=>Array(g.board[n].wood).fill(n));
}
export function catBirdCandidates(g,p,{developmentRound=12}={}) {
  if(g.phase==='birdsong')return [...(g.round>=developmentRound?g.effectOptions.filter(o=>!o.clearing).map(o=>({type:'effect',card:o.card})):[]),{type:'birdsong-end'}];
  if(g.phase==='wood')return g.woodPending.map(clearing=>({type:'wood',clearing}));
  if(g.phase==='craft')return [...(g.round>=developmentRound?g.craftOptions.map(c=>({type:'craft',card:c.card})):[]),{type:'craft-done'}];
  if(g.phase==='discard')return p.hand.map(card=>({type:'discard',card:card.id}));
  if(g.phase==='leader')return g.leaders.map(leader=>({type:'leader',leader}));
  if(g.phase==='new-roost')return g.board.map(c=>({type:'new-roost',clearing:c.id}));
  if(g.phase==='decree-add'){
    if(g.bird.added)return [{type:'decree-ready'}];
    const roostSuits=g.board.filter(c=>c.buildings.some(b=>b.type==='roost')).map(c=>c.suit);
    const cards=[...p.hand].sort((a,b)=>Number(a.suit==='wild'||roostSuits.includes(a.suit))-Number(b.suit==='wild'||roostSuits.includes(b.suit)));
    return cards.map(card=>({type:'decree-add',card:card.id,column:'recruit'}));
  }
  const moves=g.board.flatMap(c=>c.warriors[p.faction]>0?c.links.map(to=>({type:'move',from:c.id,to,count:Math.max(1,Math.ceil(c.warriors[p.faction]/2))})):[]);
  if(p.faction==='bird'){
    const col=g.currentDecreeColumn;
    if(!col)return [{type:'end'}];
    return g.bird.remaining[col].flatMap(card=>(col==='move'?moves:g.board.map(c=>({type:col,clearing:c.id}))).map(a=>({...a,decreeCard:card.id})));
  }
  if(g.march)return [{type:'march-end'}];
  if(g.round<developmentRound||!g.actions)return [{type:'end'}];
  const counts=Object.fromEntries(['sawmill','workshop','recruiter'].map(type=>[type,g.board.reduce((n,c)=>n+c.buildings.filter(b=>b.type===type).length,0)]));
  const types=counts.sawmill<3?['sawmill','workshop','recruiter']:['workshop','recruiter','sawmill'];
  const builds=types.flatMap(building=>{
    const cost=[0,1,2,3,3,4][counts[building]];
    if(cost===undefined)return [];
    return g.board.filter(c=>ruler(c)==='cat' && c.buildings.length+c.ruins<c.slots && wood(g,c.id).length>=cost).map(c=>({type:'build',building,clearing:c.id,wood:wood(g,c.id).slice(0,cost)}));
  });
  const recruit=g.board.flatMap(c=>c.buildings.filter(b=>b.type==='recruiter').map(()=>c.id)).slice(0,25-g.board.reduce((n,c)=>n+c.warriors.cat,0));
  const battles=g.board.filter(c=>c.warriors.cat>0&&(c.warriors.bird>0||c.buildings.some(b=>b.faction==='bird'))).map(c=>({type:'battle',clearing:c.id}));
  const usefulMoves=moves.filter(a=>ruler(g.board[a.to])!=='cat'||g.board[a.to].warriors.bird>0);
  return [...builds,...battles,...(!g.recruited&&recruit.length?[{type:'recruit',clearings:recruit}]:[]),...usefulMoves,{type:'end'}];
}

export function candidates(game, player, policyOptions = {}) {
  if (game.choice) {
    const options = [...game.choice.options].sort((a,b) => Number(b.id === 'pass')-Number(a.id === 'pass'));
    return options.map(option => ({ type: 'choice', choiceId: game.choice.choiceId, optionId: option.id }));
  }
  if (game.phase === 'birdsong') return [{ type: 'birdsong-end' }];
  if (game.phase === 'discard') return player.hand.map(card => ({ type: 'discard', card: card.id }));
  const options = game.factionActions || [];
  if (player.faction === 'alliance') {
    if (game.phase === 'revolt') return [...options.map(option => option.action), { type: 'revolt-done' }];
    if (game.phase === 'spread') return [...options.map(option => option.action), { type: 'spread-done' }];
    if (game.phase === 'daylight') return [
      ...(game.craftOptions || []).map(option => ({ type: 'craft', card: option.card })),
      ...options.filter(option => option.action.type === 'train' && game.alliance.officers < 3).map(option => option.action),
      ...options.filter(option => option.category === '动员').map(option => option.action), { type: 'end' },
    ];
    if (game.phase === 'military') {
      const organized = options.filter(option => option.category === '组织');
      const moves = options.filter(option => option.action.type === 'move' && !game.board[option.action.to].sympathy);
      return [...organized, ...moves, ...options.filter(option => option.action.type === 'recruit')].map(option => option.action).concat({ type: 'military-done' });
    }
  }
  if (player.faction === 'vagabond') {
    if (game.phase === 'refresh') return [...options.map(option => option.action), { type: 'refresh-done' }];
    if (game.phase === 'slip') {
      const damaged = game.vagabond.items.filter(item => item.damaged).length;
      const preferred = options.filter(option => damaged > 1 ? option.action.to >= 12 : game.board[option.action.to]?.ruins);
      return [...preferred, ...options].map(option => option.action).concat({ type: 'slip-done' });
    }
    if (game.phase === 'capacity') return [...options].sort((a,b) => Number(a.label.includes('torch'))-Number(b.label.includes('torch'))).map(option => option.action);
    if (game.phase === 'daylight') {
      const priority = ['探索废墟', '任务', '修复', '援助', '劳作', '偷窃', '移动', '弩击', '战斗', '隐藏'];
      const sorted = [...options].sort((a,b) => priority.indexOf(a.category)-priority.indexOf(b.category));
      return [...(game.craftOptions || []).map(option => ({ type: 'craft', card: option.card })), ...sorted.map(option => option.action), { type: 'end' }];
    }
  }
  return catBirdCandidates(game, player, policyOptions);
}

