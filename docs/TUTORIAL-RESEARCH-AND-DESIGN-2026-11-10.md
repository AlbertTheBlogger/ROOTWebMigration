# ROOT 基础教程解析与项目适配

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

> 2026-11-11补充：第六章蜥蜴神教已实现，19节点；当前目录共六章58节点，registry按v5/v6区分引擎。原五章定义不变。新资料提取与162项测试、桌面132次/手机43次UI验收见[LIZARD-TUTORIAL-2026-11-11.md](LIZARD-TUTORIAL-2026-11-11.md)。新章尚未部署服务器。以下为原五章实现的历史记录。

本轮采用原安装包静态解析，提取基础教程文本、Unity界面资源树及IL2CPP教程类型元数据，据此梳理教学目标和逻辑。网页版实现五章39个教学节点，通过现有地图、操作面板和v5规则引擎完成实操，服务器保存个人进度。章节分别为基础操作6节、猫咪贵族8节、飞鹰王朝6节、森林联盟10节、神秘游侠9节。

## 解析来源与证据边界

- 原安装目录为 D:/Albert Lee/you_gotta_play/games/ROOT/Root.The.Marauder.Expansion-GoldBerg。全程只读原文件。
- 原版中文文本已提取到 research/assets/localization/zh_CN.txt。本轮归档184条基础教程及标题描述文本，保留原键名、行号和源文件SHA-256，见 research/tutorial/localized-evidence.json。
- tutorial_assets_all.bundle包含1105个MonoBehaviour，tutorialmenuprompts_assets_all.bundle包含172个MonoBehaviour，分别导出788和128个资源树，解析错误为0。报告 research/tutorial/asset-index.json 记录原包SHA-256。
- research/tutorial/metadata-evidence.json记录原程序教程脚本、选择过滤器和教学辅助类型。五个TuberTutorialGame*Script对应五个TutorialGame*SelectionFiltering。Objective含id、locStr、current、max，MoveCounterForObjective提供移动计数。
- TuberTutorialScript的方法包括WaitForContinue、VisualHighlight、TutorialFocus、CallToAction、IsInPhase、RemainingActions、ObjectiveCompleted、NumUnitsAt、NumRoostsGreaterThan、BadDecreeAssignment、DecreeAssignmentFixed。TutorialCampaignEmitter包含MartialLawAction、BaseRemovedAction、FiveSupportersAction、FirstRollCappedByWarriors、FirstDieSwap、FirstDefenselessEnemy等情境教学方法。
- 类型和方法名能确认原版具有目标计数、选择限制、阶段判断和情境提示机制。章节内部教学顺序由文本和命名归纳，原程序完整的逐帧执行顺序、所有原始数值局面及状态机分支尚未恢复。本轮没有运行原游戏来验证这些时序。网页版的各步触发条件由当前规则引擎实际状态定义，并独立测试。

## 原版教学目标与推进逻辑

| 章节 | 原版目标与证据 | 教学顺序归纳 | 网页版对应 |
| --- | --- | --- | --- |
| 贵族崛起 | tutorial1.turn1.movelesson、control、movelesson.2、goal.clearings、goal.defeatalleyrie、goal.destroy2roosts | 先移动并看到控制变化，再展示行军两次移动。随后生产、建造与招募，扩大控制范围，最后战斗并移除鸟巢 | 地图总览 → 相邻移动 → 同次行军第二移 → 有士兵的战斗 → 无人防守的建筑战 → 回顾得分与控制 |
| 林中征战 | tutorial2.setup.*、turn1.craftcost.*、buildslot、turn2.fhdiscard、goal.15VP | 从标准开局进入工业循环，区分牌面花色与锻造费用。用生产和建造建立得分，再介绍行动预算、补充军队与医院 | 真实四步开局 → 木材 → 锻造 → 有成本的建造 → 多征兵所招募 → 飞鸟增加行动 → 医院救援 → 发展循环 |
| 天下同羽 | tutorial3.opening.*、Birdsong.*、recruit.1、move.1、build.1、Turmoil.*、badDecree.* | 先理解领袖和大臣，再把法令当行动承诺，按列执行并获得鸟巢收入。特意制造失败，让玩家理解动乱与新领袖 | 制裁者开局 → 兔子招募法令 → 招募、移动、建造整链 → 夜晚得分 → 狐狸招募无法执行 → 更换领袖 |
| 团结起来 | tutorial4.opening.*、sympathy.*、mobilize.1、turn2.revolt.*、organize.*、law.1、baseremoved1 | 先用支持者传播，体验相邻、花色、民意条。再动员和起义，让基地与长官连接到夜晚军事行动。通过损失情境讲容量和基地风险 | 两次传播含飞鸟支付 → 两次动员 → 起义 → 训练 → 移动后组织 → 基地招募 → 民愤上限情境 → 基地被毁 → 循环回顾 |
| 孤独旅者 | tutorial5.intro、goal.1至goal.4，以及VagabondItemAcquire、RepairBrokenItem、SlipWarning等方法名 | 目标文本明确援助两次、探索遗迹、完成任务和累计得分。物品状态和角色能力通过情境补充 | 盗贼和森林开局 → 物品恢复 → 潜行 → 探索 → 同回合援助两次 → 任务物品支付 → 偷窃 → 森林休整 → 规划回顾 |

原版的教学重点是动作的用途和后果。把移动与控制联系起来，把建造与工业得分联系起来，把法令与承诺联系起来，把支持者与军事实力联系起来，把游侠物品与可执行动作联系起来。每个阵营最终都需要把单个动作串成自己的资源和得分循环。

## 教学逻辑的项目化处理

每节先展示目标、操作方法和用途，再由玩家亲自在正式地图控件中执行。服务器调用原有规则引擎校验动作，目标完成后才解锁下一节，并解释刚刚发生的结果。阅读节点使用明确的阅读确认，动员和援助等重复任务显示次数。

训练从局部目标开始。第一章把有士兵的战斗和无人防守的建筑战拆开，避免一次承担太多规则。后续阵营章节重用已经学会的选择、地图确认和查看牌面操作。飞鹰把新增法令串成完整执行链，联盟把起义、训练、夜晚移动和组织串起来，游侠把恢复和潜行连起来。

预置局面在教程面板中明确标注，连续教学则沿用上一节。玩家可以重试当前节点，恢复服务器保存的节初检查点，或重开整章。普通房间的布局、手牌或游戏状态不接受教程局面写入。完成教程后，页面提供返回大厅入口，沿用现有房间与测试人机进行完整对局。

原版章节末尾的长线得分目标改为本项目的短任务组合，避免教程变成必须打完的一整局。正文中的得分阈值、原始key名和不同版本文本存在不一致，例如tutorial2.goal.15VP的中文内容写12分，飞鹰和联盟也有不同目标数字。本项目按节点目标和真实规则判断完成，不根据key中的数字判定胜利。

原版部分提示的术语或阶段描述存在差异，例如tutorial3.craft.0将锻造写为清晨。网页教程按当前v5规则先增加法令，再进入白天锻造并依次执行法令。原版联盟基地损失文案没有完整写出飞鸟支持者及长官损失，项目教程使用当前已核实规则说明后果。

本章游侠实操以盗贼展开，介绍工匠和猎人的特殊能力及火把成本。三角色的完整选择仍可在普通对局中使用。每个练习战斗明确写明固定3/3骰子，正式房间继续使用原有随机机制。

## 服务器与界面实现

backend/data/tutorial-catalog.json管理39个节点的目标、文案和原文键名。backend/tutorials.mjs预置情境、调用v5引擎、处理必要的教练选择、检查目标并输出玩家视图。用户输入只包含动作，不能提交练习局面或自报完成结果。

tutorial_runs按用户与章节保存，保存版本、当前节点、真实游戏状态、节初检查点和至多24条命令回执。命令带版本、runId及commandId，支持重试和冲突检测。重开章节保留此前完成标记。教程与rooms、games、snapshots分表，教程进度不计入普通房间数量。

正常玩家导航栏的“新手教程”进入五章目录，章节可以独立选择。桌面右上方为教学目标，中部为自身信息，下方为日志。手机先显示教学目标，再显示地图与其他信息。地图操作复用map-controls，错误操作受服务端限制。管理员的原有游戏权限限制同样覆盖教程接口。

## 验证记录

测试覆盖五章全部节点的实际规则动作、提前跳过及目标外动作拒绝、节初重试、他人手牌和支持者隔离、命令重放、并发版本拒绝、进程重启、普通房间和存档表隔离。

浏览器验收从注册和导航入口开始，通过真实地图控件完成五章，逐章刷新恢复进度，并检查手机无横向溢出。测试场景由教程功能自身生成，浏览器测试未注入游戏局面。最终测试和发布证据见docs/HANDOFF-2026-11-09.md最新章节。

最终验收五章39节点共89次浏览器UI操作通过，本地135项检查及服务器135项检查通过。版本已上线，普通玩家登录后点击顶部“新手教程”。公网test01保存第一章开头状态，刷新续学已确认。
