// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md.
// Presentation metadata is public, bounded, and never participates in legality.
const kinds=new Set(['move','battle','dice','draw','score','build','pieces','turmoil','revolt','craft','aid','supporter','outrage','wood']);
const fields=['playerId','faction','clearing','from','to','count','building','delta','total','reason','target','batch'];
export function present(state,event){
  if(!kinds.has(event.kind))throw new Error('Unknown presentation event');
  const result={seq:(state.presentationSeq||0)+1,kind:event.kind};
  for(const field of fields)if(event[field]!==undefined)result[field]=event[field];
  if(event.kind==='dice')result.values=event.values.slice(0,2);
  if(event.kind==='turmoil')for(const key of ['column','birdCards','discarded','leader','viziers'])if(event[key]!==undefined)result[key]=event[key];
  state.presentationSeq=result.seq;
  state.presentationEvents ||= [];
  state.presentationEvents.push(result);
  state.presentationEvents=state.presentationEvents.slice(-64);
}
export function finishPresentation(before,after){
  const cutoff=before.presentationSeq||0;
  after.presentationBatch=cutoff+1;
  const direct=(after.presentationEvents||[]).filter(event=>event.seq>cutoff);
  for(const area of after.board||[]){
    const old=before.board.find(value=>value.id===area.id);if(!old)continue;
    const count=(buildings,b)=>buildings.filter(value=>value.faction===b.faction&&value.type===b.type).length;
    if(area.wood>old.wood)present(after,{kind:'wood',faction:'cat',clearing:area.id,count:area.wood-old.wood});
    const added=new Set();
    for(const building of area.buildings){
      const key=building.faction+'|'+building.type;
      if(!added.has(key)&&count(area.buildings,building)>count(old.buildings,building)){
        present(after,{kind:'build',faction:building.faction,building:building.type,clearing:area.id,count:count(area.buildings,building)-count(old.buildings,building)});added.add(key);
      }
    }
    for(const [faction,total] of Object.entries(area.warriors)){
      const delta=total-(old.warriors[faction]||0);
      if(delta>0&&!direct.some(event=>event.kind==='move'&&event.faction===faction&&event.to===area.id))present(after,{kind:'pieces',faction,clearing:area.id,count:delta});
    }
  }
  // Put a newly placed building before its score feedback, even if scoring was
  // emitted inside the rules routine. Keep IDs increasing after reordering.
  const order={move:0,battle:1,dice:2,turmoil:3,revolt:3,build:4,pieces:5,craft:6,aid:6,wood:6,outrage:6,supporter:7,draw:7,score:8};
  const fresh=(after.presentationEvents||[]).filter(event=>event.seq>cutoff).sort((a,b)=>order[a.kind]-order[b.kind]);
  after.presentationSeq=cutoff;
  after.presentationEvents=(before.presentationEvents||[]).slice(-64);
  for(const event of fresh)present(after,{...event,batch:cutoff+1});
}
