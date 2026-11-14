// Copyright (c) 2026 AlbertTheBlogger. Project-authored code: MIT; third-party resources excluded. See LICENSE-SCOPE.md.
// Explain opponents through the learner's own adviser, never as orders to them.
export function observeOpponent(game,viewerId,action){
 const viewer=game.players.find(p=>p.id===viewerId),choice=game.effects.frames[0],actor=game.players.find(p=>p.id===(choice?.playerId||game.players[game.turn].id));
 if(!viewer||!actor||actor.id===viewerId)return null;
 const names={cat:'猫咪',bird:'飞鹰',alliance:'联盟',vagabond:'游侠',lizard:'蜥蜴神教',otter:'商会'},address={cat:'阁下',bird:'陛下',alliance:'同志',vagabond:'旅伴',lizard:'传道者',otter:'会长'}[viewer.faction],who=names[actor.faction],where=action.clearing===undefined?'':`秋林${action.clearing}`;
 const say=text=>`${address}，${text}`;
 if(action.type==='choice'){
  const text={ambush:'正在决定是否打出伏击，先看看我们的部队会不会受到阻击。','counter-ambush':'正在决定是否用伏击牌反制，双方处理完伏击才会继续交战。',hospital:'正在考虑救回伤兵；只有付出匹配牌，伤兵才会回到它们的城堡。',cardboard:'正在选择移除哪座建筑或标记，接下来看看它们失去了什么据点。','battle-effects':'正在处理战斗效果，留意它会怎样改变这场交锋。'}[choice?.kind]||'正在处理眼前的选择，先看它怎样应对。';return say(who+text);
 }
 if(action.type==='move')return say(`${who}正从秋林${action.from}调${action.count}名战士到秋林${action.to}。`+(actor.faction==='bird'?'它们在兑现移动法令，也在向外扩张；留意新兵力离我们的领地有多近。':'它们正在集中兵力。看看目的地有哪些守军或据点，别让自己的防线露出空隙。'));
 if(action.type==='recruit')return say(`${who}正在${where||'征兵所'}补充战士。`+(actor.faction==='bird'?'新兵会增强它们的扩张力量，我们的产业需要留人守护。':'更多守军意味着据点更难攻下，也可能为下一次进攻做准备。'));
 if(action.type==='build')return say(`${who}准备在${where}${actor.faction==='bird'?'建立鸟巢。鸟巢既能招兵，也会在夜晚带来分数；让它们不断建巢，往后就更难应付。':'建造产业。新的建筑会增加它们的收益，也值得我们留意。'}`);
 if(action.type==='battle')return say(`${who}向${where}发起进攻了。`+(action.defender&&action.defender!==viewer.faction?'先看双方怎样分配命中与战损，这场冲突也会改变我们周围的兵力。':'看看我们留下的守军能否挡住它们；若有防守选择，稍后仍由您决定。'));
 if(action.type==='decree-add')return say(`飞鹰正往法令里加入${{recruit:'招募',move:'移动',battle:'战斗',build:'建造'}[action.column]||'新'}命令。法令会一天天积累，它们以后每天都得照办；鸟巢与道路会决定这些承诺能否兑现。`);
 if(action.type==='decree-ready')return say('飞鹰已颁下新令，接下来要逐项执行。看看它们会把新兵与据点布置在哪里。');
 if(action.type==='leader')return say('飞鹰正在更换领袖，新忠臣会改变它们的行动安排。不过，已经建好的鸟巢仍会留下。');
 if(action.type==='buy-service')return say(`${who}正在${{cards:'购买我们的手牌。卡牌归它，货款先进入我们的收入栏，等下个清晨才能使用。',boats:'租借河船。它能把河流当作道路，不过仍要遵守普通移动的统治条件。货款也会留在我们的收入栏。',mercenaries:'雇佣我们的伙计。水獭留在当地，帮它在白昼与夜晚统治、作战，受命中时还要与买方分摊损失。'}[action.service]}`);
 if(action.type==='services-done')return say(`${who}结束购买，准备安排自己的回合。看看它接下来把力量用在哪里。`);
 if(action.type==='craft')return say(`${who}正在锻造。`+(viewer.faction==='otter'?'刚卖出去的牌开始派上用场了；这正是客人愿意付钱的原因。':viewer.faction==='vagabond'?'新制成的物品会留在它的物品区，日后援助时也许能换到手。':viewer.faction==='lizard'?'用掉的牌会进入失魂，可能改变我们明早的被逐者。':'留意它获得的物品、分数或持续效果，接下来的打算可能因此改变。'));
 const descriptions={'birdsong-end':`${who}开始清晨准备。它的据点与产业会为新一天提供力量。`,wood:`${who}的锯木厂正在产木，木材会为之后的建造提供材料。`,'craft-done':`${who}暂时结束锻造，准备调动军队。`,'march-end':`${who}结束这次行军，部队留在刚到达的林地。`,end:actor.faction==='bird'?'飞鹰完成法令，进入夜晚。现存鸟巢会按轨道得分，它们还会抽取新牌，为明天继续颁令做准备。':`${who}进入夜晚，准备补充手牌。看看它把哪些兵力留在了前线。`,discard:`${who}正在整理过多的手牌。弃下的牌离开它的手中，稍后也许会影响森林里的其他阵营。`,'evening-continue':`${who}继续处理夜晚，收下新牌。`,'evening-end':`${who}结束了这一回合。轮到我们时，得把这些兵力与据点变化一起考虑进去。`};
 return say(descriptions[action.type]||`${who}正在行动。留意它付出的资源，以及这一步怎样改变我们周围的局势。`);
}
