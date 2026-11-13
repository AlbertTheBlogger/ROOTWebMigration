// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import {projectGame} from './rules/versions/registry.mjs';

export function hotseatActor(game){
  if(!game||game.winner)return null;
  return game.effects?.frames.find(frame=>frame.type==='choice')?.playerId||game.players[game.turn].id;
}
export function hotseatStamp(payload){return `${payload.gameId}|${payload.controlEpoch||0}`;}
export function updateHotseatControl(payload){
  if(payload.playMode!=='hotseat')return;
  const actor=hotseatActor(payload.game),turn=payload.game?.turnsCompleted??-1;
  if(actor!==payload.controlActor||turn!==payload.controlTurn){
    payload.previousActor=payload.controlActor||null;
    payload.controlActor=actor;payload.controlTurn=turn;payload.controlEpoch=(payload.controlEpoch||0)+1;
  }
}
export function publicGame(game){
  const view=projectGame(game,null);
  // Public views always omit command affordances, even at game end.
  view.mapActions=[];view.factionActions=[];view.craftOptions=[];view.effectOptions=[];
  delete view.revealedHand;delete view.outrageReveal;
  return view;
}
