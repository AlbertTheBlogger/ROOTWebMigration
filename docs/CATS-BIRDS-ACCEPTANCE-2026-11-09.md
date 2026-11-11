# 猫鹰标准局验收与交接

日期 2026-11-09。本轮验收范围为猫咪贵族／猫侯国与飞鹰王朝、秋季地图、基础牌组、双人标准开局。规则版本 `root-cats-birds-v4`，存档 schema 4。

## 已实现的规则范围

| 范围 | 实现与验证 |
| --- | --- |
| 标准开局 | 随机先手、各抽三张牌、猫选择四角之一放城堡、对角空缺驻军、城堡及邻地初始三建筑、鹰对角六兵一巢、四领袖和对应忠臣。16 种角落与领袖组合通过检查 |
| 猫咪贵族 | 木材生产与八枚供应限制、三行动、两次移动的完整行军、每回合一次征兵、连通木材建造、按现存建筑轨道计价与得分、过劳、鸟牌额外行动、城堡限制和野战医院 |
| 飞鹰王朝 | 清晨空手补牌、每轮一至两张政令且最多一张鸟牌、无巢恢复、先制作再执行政令、四列顺序、每列任选牌执行、花色限制、足量征兵、领袖能力、强制动乱、忠臣扣分、领袖轮换和晚间计分抽牌 |
| 基础牌组 | 双人使用原版 DrawDeck 50 张牌，38 种原型。两人标准规则移除四张统治牌，所以本模式不加入该独立列表 |
| 制作 | 20 种物品牌、七类物品供应、按设施逐点支付、可选择具体制作点、任意花色成本、设施每回合只用一次、持续效果禁止重复、鹰蔑视贸易与建造者 |
| 持续牌 | 侦察团、鞋匠、指挥所、银行、税吏、破译者、皇家敕令、劫取手牌、工兵、铠甲兵、野蛮战术，共 11 类效果 |
| 即时效果 | 狐狸、老鼠、兔子三类恩惠，先移除所有相应敌棋，再处理移除触发；城堡同时被移除时医院失效 |
| 战斗 | 防守伏击、反伏击、侦察团、骰子上限、防御空缺、指挥官、双方战斗牌时序选择、工兵额外命中、铠甲兵忽略骰子命中、野蛮战术给对手得分、士兵同时伤亡、建筑标记选择、暴君额外分和医院 |
| 存档与隐私 | 整个决策队列持久化、选择编号校验、重复命令幂等、骰子保存、会话恢复、对方手牌与私有选择过滤、破译者查看结果仅本人可见 |

规则采用官方 2025-10-13 Law 基准。原安装包的具体发行版本与规则差异尚未经过原游戏动态逐项比对。地图来自现有静态提取拓扑，显示坐标为人工布局。扩展阵营、冬季／湖泊／山地地图、扩展牌组、进阶开局与原版美术不在此次验收范围。

官方规则源为 [Leder Games Root Law](https://cdn.shopify.com/s/files/1/0106/0162/7706/files/Root_Base_Law_Oct_2025.pdf?v=1774903756)。猫鹰和基础牌的安装包证据见下文。

## 逆向证据

- `research/deck/full-cost-evidence.json` 保存全部 34 种可制作基础牌原型的成本、属性读取地址与数组分配地址。
- 完善 metadata 字段数据引用解析，读取 RuntimeHelpers.InitializeArray 使用的原始常量。三狐狸成本与四任意成本等不再依赖手填。
- `research/deck/EyrieDynastiesPlayer-initialize.json` 与 `AdditionalDraws` 保存原版鸟巢轨道证据。抽牌奖励在第三和第六个巢，得分轨道为 0、1、2、3、4、4、5。
- `research/deck/MarquiseDeCatPlayer-GetTrackInfo.json` 保存猫建筑轨道。征兵所抽牌奖励在第三和第五个建筑，建筑毁坏后按当前轨道回退。
- `backend/data/full-card-catalog.json` 是 v4 使用的数据。v3 的旧目录数据单独保留。
- 元数据布局参考 [Cpp2IL metadata header](https://raw.githubusercontent.com/SamboyCoding/Cpp2IL/development/LibCpp2IL/Metadata/Il2CppGlobalMetadataHeader.cs) 和 [FieldRef 定义](https://raw.githubusercontent.com/SamboyCoding/Cpp2IL/development/LibCpp2IL/Metadata/Il2CppFieldRef.cs)。原始二进制指纹继续核对。

## 验收结果

- 72 项 Node 测试全部通过，结果保存在 `audit/v4/node-tests.txt`。
- 10 项 Python 研究测试全部通过，结果保存在 `audit/v4/research-tests.txt`。
- 最终 HTTP/SQLite 自动对局共 12 局，每局 16–22 轮，共 2,988 次成功操作。12 局均从标准开局正常达到胜利，包含猫、鹰双方获胜，未注入棋局状态。
- 对局间累计执行 91 次服务对象重建和 SQLite 重开，验证会话与精确棋局恢复。每 23 步检查一次重复命令不重复结算。
- 每步检查 50 张实体牌守恒与唯一性、士兵供应、建筑位／废墟、八枚木材、城堡数量及物品守恒。
- 为稳定覆盖长局，自动策略在前 11 轮让猫跳过可选发展，之后再竞争得分，鹰策略偏向政令与动乱路径。这些对局用于流程和持久化验证，不是平衡性或策略强度测试。
- 双 Edge 浏览器通过网页控件完成 24 个玩家回合，进入第 13 轮，149 步操作，中途两次后台进程重启恢复。该流程全程未注入棋局，报告和截图在 `audit/v4/browser-longplay/`。
- 另有双浏览器针对制作、伏击、医院、私有选项、骰子不重掷与手机视口的验收，结果在 `audit/browser-acceptance/v4/`。该专项验证使用临时数据库设置特定战斗与制作局面，操作通过正常网页/API。

## 本轮修复的边界

- 标准开局选领袖前的空政令列导致网页渲染失败，现已初始化为四个空列。
- 飞鹰先制作后判定政令是否能执行，魅力领袖无法放足两兵时发生动乱。
- 医院在税吏抽牌前完成，不能用尚未抽到的牌支付。
- 伏击消灭全部攻击兵后，即使医院把兵送回城堡，战斗也结束。
- 伏击造成胜利时，已经打出的牌仍进入弃牌，保持实体牌守恒。
- 银行在清晨开始时自动执行，其他可选时机牌分别处理。
- 处理请求期间禁用操作按钮，防止快速点击被静默忽略；大厅列表异步载入不占用注册操作锁。

## 复验与维护

```powershell
cd E:\RootWebMigration
node --test tests/*.test.mjs
& research\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_research*.py' -v
$env:QA_GAMES='12'
node tools/cats_birds_selfplay.mjs --http
& research\.venv\Scripts\python.exe tools/browser_v4_longplay.py
$env:QA_RULESET='root-cats-birds-v4'
& research\.venv\Scripts\python.exe tools/browser_acceptance.py
```

长局与浏览器验收均使用临时本地数据库。HTTP 对局使用服务端随机数，报告中的 seed 用于测试选择策略，不表示服务端洗牌种子。若要逐局复现同样的服务端随机结果，需要另外保存相应测试数据库。

新房间默认选择猫鹰标准局。旧 v1、v2、v3 存档继续由各自引擎读取。后续开发优先依据本文件与实际代码，旧轮次报告保留为历史记录。

## 已发布的服务器版本

入口 http://103.236.93.55:233 。服务器隔离目录中 72 项 Node 测试通过，另行完成 12 局正常胜利的 HTTP 长局测试，每局 15–21 轮、共 2,918 步操作与 89 次服务对象重建恢复。本地和服务器两批合计 24 局 HTTP 完整对局、5,906 步操作、180 次服务对象重建恢复。内部 3003 端口使用独立临时数据库做健康检查后关闭。

发布前数据库备份为 `/var/lib/woodland-rooms/backup-before-round03-20261109.sqlite`，旧代码为 `/opt/woodland-rooms-before-round03-20261109`。当前代码为 `/opt/woodland-rooms`，当前数据库继续为 `/var/lib/woodland-rooms/root.sqlite`。

发布后 systemd 服务 active，公网健康接口列出 v1、v2、v3、v4，公网 app.js 的新局默认值为 v4。顶层 health.ruleset 保留旧兼容默认值 v1，应根据 rulesets 数组判断可选版本。

代码回滚前应保留当前代码与发布后数据库。旧代码无法读取 v4 存档，不能在未评估新增对局的情况下覆盖生产数据库。
