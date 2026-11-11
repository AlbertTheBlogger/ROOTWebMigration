# 蜥蜴神教教程提取、适配与验收

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

2026-11-11（Asia/Shanghai）。在已有蜥蜴v6实现上增加第六章教程，19个节点；六章合计58个节点。仅更新代码和Git仓库，继续遵守用户“暂不部署服务器”的限制。

## 原始资料与提取边界

输入是已有Unity安装目录，不是可编辑的Unity工程或原C#源码。`tools/research_lizard_tutorial.py`只读以下原文件：

- `Root_Data/StreamingAssets/Localization/win/localization`：新读取Unity TextAsset中的`zh_CN`和`en_US`。两种语言各50条，包含46个`lct.*`键，以及教程标题/描述和相关提示；保留路径ID、原行号及内容哈希。
- 原教程标题为“神圣的鳞片”（Sacred Scales），标识`TutorialR01`，不是基础五章之后的`Tutorial6`文本键。
- `Root_Data/il2cpp_data/Metadata/global-metadata.dat`：记录源文件哈希，与已有基线中的`TuberRiverfolkTutorialGame1Script`、`TuberRiverfolkTutorialGame1SelectionFiltering`、`TutorialConstants`交叉引用。前两者分别有`innerActions`及`init`等方法元数据，不代表已恢复这些方法的原始实现。
- 新扫描`tutorialmenuprompts_assets_all.bundle`的序列化MonoBehaviour字符串字段，匹配数为0；没有把这个扫描当作已找到原版流程树的证据。

提取结果为`research/lizard/tutorial/original-evidence.json`。本地化包SHA256：`643d20f7d1bf1ccc419782cf6654b884a22d8f4f911f78d2a3c7b4ad59d5fd5c`。没有运行原游戏，也没有修改原安装目录。原文本和提取结果继续排除在项目MIT许可之外，提取工具本身本次也未加入MIT清单。

复现提取：

```powershell
& research/.venv/Scripts/python.exe -B tools/research_lizard_tutorial.py 'D:\Albert Lee\you_gotta_play\games\ROOT\Root.The.Marauder.Expansion-GoldBerg'
```

## 教学适配

原文本中的庭院、仆从、遭弃类型、净化，对应本项目的花园、侍僧、被逐者、圣化。教学主题来自原教程，网页步骤及校验以现有v6真实规则为准，没有将教程特例放进普通对局。

| 网页节点 | 原始键与教学依据 | 实操/检查 |
| --- | --- | --- |
| 概览、标准开局 | lct.intro / place.warriors / adjacent.warriors / pick.outcast | 真实选择合法角落和初始被逐者 |
| 招募、建造、得分 | lct.explain.reveal / recruit.intro / first.build / pilgrims / score / score.2 | 连续局面：招募秋林4→第二座老鼠花园→花费老鼠牌得2分；展示牌不可重复用 |
| 夜晚归牌、锻造、抽牌 | lct.return / t2.craft.2 / garden.draw | 沿用仪式局面；展示牌回手，真实锻造草根茶，两花园抽2牌 |
| 防守复仇 | lct.revenge | 教练进攻，固定3/3骰子，2名防守损失进入侍僧区 |
| 失魂与新被逐者 | lct.lost.souls / enemy.lost.souls / t3.outcast | 2老鼠、1兔子、1鸟的预置堆，玩家推进清晨后由引擎统计与清空 |
| 圣战移动后战斗 | lct.intro.conspiracy / crusade | 强制指定2名士兵的合法移动，再选择指定敌人战斗，不能跳过后续战斗来完成目标 |
| 圣战原地战斗 | lct.t3.crusade.battle / t3.crusade.battle.2 | 仅提供原地战斗，拒绝改为移动浪费全部侍僧；进攻损失不产生复仇 |
| 三次献祭 | lct.hatred.birds / intro.sacrifice / t3.sacrifice | 三张鸟牌逐张公开展示，侍僧0→3，UI显示0/3至3/3 |
| 两次弃牌→下次清晨→憎恨 | lct.t3.discard / t4.hated.outcast | 从7张手牌指定弃2张兔子牌；保留这两张真实弃牌跳到下次清晨；玩家推进，获得兔子憎恨 |
| 转化→圣化 | lct.t4.convert / t4.sanctify | 沿用憎恨场景，3名侍僧先花1替换飞鹰战士，再花2替换同地鸟巢 |
| 花园恐惧 | lct.ftt.garden.removed | 教练拆无人防守花园，服务器固定教程随机源从未展示手牌弃1张，可重试同一检查点 |
| 回顾 | lct.t4.off.rails / goal.12vp / strategy | 明示原教程以12分收尾；本章采用短练习总结，不声称已完成一场原版教程对局 |

适配中特别处理：

- 原教程允许中途再选一次被逐者，原文明确这是教程例外。网页只在真实开局自由选择，后续通过失魂堆学习正常统计规则。
- 中文`lct.garden.draw`存在“每有2个”可能重复计奖的歧义；英文说明与上一轮静态轨道证据一致：每花色第二座花园揭开一次抽牌奖励，而不是第四座再次奖励。
- 起始角落、失魂平票变憎恨等继续沿用项目选定的2025规则；没有切回早期打印版本。
- 复仇和恐惧使用飞鹰教练发起战斗，以聚焦本节机制；并非逐帧复刻原数字版猫咪教练剧情。
- 教练战斗明确固定3/3骰子，教程复试使用同一确定性随机源；正式房间仍使用其正常服务器随机机制。
- 弃牌后到下次清晨是明确标示的预置时间跳转，保留实际弃牌与棋盘，不隐含自动运行了一整轮对手回合。

## 实现与兼容

`backend/tutorials.mjs`通过规则registry按存档分派：旧五章继续显式创建v5，蜥蜴章创建v6。catalog版本增至2，追加第六章；原五章节点定义逐项比较与提交前完全一致，既有按章节保存的进度不会因插入/重排失效。

新增场景、目标检查、精确行动限制和重复次数显示；客户端只提交动作，不能自报完成。沿用`runId`/版本/`commandId`的幂等协议、节初checkpoint、重试、完成标志及持久化。网页目录不再写死“学习四个阵营”。普通房间和对局表不接收教程预置状态。

教程文本及catalog属于用户指定的文本资源排除范围；工程报告中的项目自撰说明纳入MIT清单，不授予原教程文本许可。没有新增图片、美术资源或第三方运行依赖。

## 验证

- 完整162项Node测试通过，`audit/lizard-tutorial-all-tests.txt`。
- 蜥蜴19节点每一步检查54张实体牌守恒及唯一性，检查JSON保存/恢复投影一致；限制错误领地、重复展示、圣战人数/目标、错误弃牌与跳过战斗；重试随机弃牌得到相同教程结果。
- HTTP六章完成并保存；在蜥蜴开局、圣战、憎恨、恐惧等待操作点重建服务，再读结果完全一致。测试仍检查教程与rooms/games分表隔离、旧账号会话、幂等及权限。新增注册仅在临时DB。
- 桌面headless Edge 1366×900通过六章58节点、132次UI命令。原五章仍为89次；蜥蜴43次包含一次献祭后点“重试本节”、再次献祭及刷新验证。`audit/lizard-tutorial-desktop.txt`、同名目录报告/trace/截图。
- 手机Edge模拟390×844完整通过蜥蜴19节点43次UI命令，检查重试、刷新续学和无横向溢出。`audit/lizard-tutorial-mobile.txt`及同名目录。不是iOS/Safari或真实手机测试。
- 两套UI均从注册、教程目录进入，操作通过现有地图/确认控件；没有浏览器注入棋局状态。场景由教程功能的服务器正常准备。最终均无pageerror；截图已检查。
- 扩充浏览器重试检查时的一次脚本缩进错误已修正，最终有效结果为上述132/43次记录；不将该次脚本失败归为产品规则缺陷。

## 交付边界

仅同步GitHub代码与研究资料，不部署服务器、不变更线上数据库、不移动v1.1.0标签。服务器暂缓部署的用户指示仍有效。未宣称恢复原Unity教程源码、逐项游玩原版教程或完全复刻原版剧情/布局。
