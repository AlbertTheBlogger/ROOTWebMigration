// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
import * as rules from './rules/versions/registry.mjs';
export function riverfolkStory(run){
 let calls=0;let g=rules.createGame([{userId:'tutorial-cat',name:'猫咪指挥官',faction:'cat'},{userId:'tutorial-bird',name:'飞鹰领主',faction:'bird'},{userId:run.userId,name:run.playerName,faction:'otter'}],n=>calls++===2?0:n-1,'root-riverfolk-v7');
 while(!g.setup.complete&&g.effects.frames[0]?.playerId!==run.userId){const q=g.effects.frames[0];const option=q.kind==='setup-keep'?'2':q.kind==='setup-building'?String({sawmill:2,workshop:2,recruiter:7}[q.resume.type]):q.kind==='setup-leader'?'builder':q.options[0].id;g=rules.applyAction(g,q.playerId,{type:'choice',choiceId:q.id,optionId:option},n=>n-1);}
 const me=g.players.find(p=>p.id===run.userId),cat=g.players.find(p=>p.faction==='cat'),bird=g.players.find(p=>p.faction==='bird'),refs={};
 g.deck.push(...g.players.flatMap(p=>p.hand.splice(0)));
 const take=(key,predicate,holder)=>{const i=g.deck.findIndex(predicate);if(i<0)throw new Error('商会教学缺少卡牌 '+key);const [c]=g.deck.splice(i,1);refs[key]=c.id;holder?.push(c);return c;};
 const plain=suit=>c=>c.suit===suit&&!['ambush','dominance'].includes(c.kind);
 take('marketTea',c=>c.archetype==='RootTeaRabbit',me.hand);take('crossbow',c=>c.archetype==='CrossbowMouse',me.hand);
 const tea=take('tea',c=>c.archetype==='RootTeaFox'),hammer=take('hammer',c=>c.archetype==='AnvilFox');
 take('giftFox',plain('fox'),me.hand);take('recruit1',plain('rabbit'),bird.hand);take('moveBird',plain('wild'),bird.hand);take('recruit3',plain('rabbit'),bird.hand);
 for(let i=0;i<3;i++)take('catInitial'+i,plain('fox'),cat.hand);
 const draws=[take('cat1',plain('fox')),take('recruit4',plain('rabbit')),take('marketExtra',plain('mouse')),take('cat2',plain('fox')),take('bird2',plain('mouse')),take('cat3',plain('fox')),take('bird3',plain('mouse')),tea,take('cat4',plain('fox')),take('bird4',plain('mouse')),hammer];
 g.deck.push(...draws.reverse());run.game=g;run.context={story:true,refs,cursor:0,history:[]};
}
