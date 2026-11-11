import assert from 'node:assert/strict';
export function tutorialAction(room){
 const g=room.game,meta=room.tutorial,p=g.players.find(p=>p.id===room.ownerId);
 if(g.choice){assert.equal(g.choice.waiting,false);return {type:'choice',choiceId:g.choice.choiceId,optionId:g.choice.options[0].id};}
 if(meta.actionTypes.includes('craft')&&g.craftOptions.length)return {type:'craft',card:g.craftOptions[0].card};
 if(g.phase==='decree-add')return meta.actionTypes.includes('decree-add')?{type:'decree-add',card:p.hand[0].id,column:'recruit'}:{type:'decree-ready'};
 if(g.phase==='craft')return {type:'craft-done'};
 if(g.phase==='leader')return {type:'leader',leader:g.leaders[0]};
 if(g.phase==='revolt'&&meta.actionTypes.includes('revolt-done'))return {type:'revolt-done'};
 if(g.phase==='spread'&&meta.actionTypes.includes('spread-done'))return {type:'spread-done'};
 if(g.phase==='refresh'&&meta.actionTypes.includes('refresh-done'))return {type:'refresh-done'};
 if(meta.actionTypes.includes('extra'))return {type:'extra',card:p.hand.find(card=>card.suit==='wild').id};
 const action=g.factionActions[0]?.action||g.mapActions[0];
 if(action)return action;
 if(meta.actionTypes.includes('end'))return {type:'end'};
 throw new Error('No tutorial action '+meta.stepId+' '+g.phase);
}

