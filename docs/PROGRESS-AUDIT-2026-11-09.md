# 项目进度核对（2026-11-09）

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

本次根据用户要求，对照 HANDOFF、ROADMAP、RULES-COVERAGE、BASE-FOUR-ACCEPTANCE、README、IMPLEMENTATION-STATUS、AUTH-LATENCY 和部署记录，检查实际代码、发布清单与验收产物，并重新执行现有测试及浏览器验收。公网仅执行 GET，不登录或写入生产数据。

## 结论

基础四阵营 v5 与房间测试人机已经实现，当前代码通过本次复测，公网抽查与本地发布文件一致。当前阶段可表述为：**基础四阵营已具备整局试玩条件，正在进行真人反馈与规则、交互收敛；完整目标数字版内容尚未完成。**

按路线图，M1–M3 的主要交付已落地；M0 的原发行版本和动态行为核验尚未闭合；M4 扩展内容仍待实施；M5 的素材、棋盘与基础部署已有成果，但不能据此认定完整表现、容量和运维验收完成。不提供缺少明确分母的整体完成百分比。

## 本次实际执行结果

| 检查 | 结果 | 证据与范围 |
| --- | --- | --- |
| 全部现有 Node 测试 | 105/105 通过，0 失败、0 跳过 | 本轮执行 `node --test tests/*.test.mjs`，输出见本次会话；测试运行约 9.34 秒 |
| JavaScript 语法 | 3 个入口均通过 | `backend/server.mjs`、`backend/engine.mjs`、`frontend/app.js`；与 `npm run check` 的检查项目一致 |
| Python 研究测试 | 10/10 通过 | 使用 `research/.venv/Scripts/python.exe -m unittest discover -s tests -p test_research*.py -v`，包含两份研究测试文件 |
| 浏览器整局 | 通过 | 无界面 Edge，临时本地数据库；真人猫咪席位由脚本点击，三个服务端人机自动行动，49 次真人席位操作，第九轮联盟达到 30 分获胜 |
| 浏览器生命周期 | 通过 | 添加及移除人机、开局、重启后继续、自然胜利、下一局、删除房间；无 pageerror |
| 素材文件 | 完整 | 白名单 85 张图片、秋季场景清单 15 个资源均存在；结束页截图已目视检查 |
| 人机增量发布清单 | 全部一致 | `deploy/bots-files.json` 所列 6 个文件 SHA-256 与当前本地文件一致 |
| 人机发布包 | 与交接记录一致 | SHA-256：`6b8b575aa18c62c5c097f3747ef682c251082f1a85424fc8d159b7d9d8e00ee9` |
| 公网健康接口 | HTTP 200 | `/api/health` 的受支持规则列表包含 v1–v5 |
| 公网前端抽查 | 5/5 一致 | `/`、`/app.js`、`/styles.css`、`/board3d.js`、`/asset-manifest.json` 均 HTTP 200，响应 SHA-256 与本地一致 |
| Git 基线 | 未建立 | 在项目目录执行 `git status --short` 返回 `not a git repository` |

本次浏览器脚本使用偏向结束回合的真人侧策略，并关闭隔离测试服务的频率限制。它验证流程可走通，不等于用户亲自体验、AI 强度、游戏平衡或所有规则组合已验证。历史记录中的 62 次点击与本次 49 次点击属于不同随机对局，不是验收冲突。

本次新证据位于 `audit/progress-check-2026-11-09/`：

- `results.json`：检查时间、语法及研究测试退出状态、文件清单、发布包哈希、公网抽查结果和历史报告快照。
- `python-tests.txt`、`syntax-*.txt`：本次测试与语法检查输出。
- `browser.txt`、`browser/report.json`：本次浏览器整局报告。
- `browser/seats.png`、`browser/finished.png`：本次席位和结束页截图。
- `verify.py`：复核脚本；默认会运行现有检查和隔离浏览器验收，`--summary` 仅读取现有报告。Node 全套测试在本轮先行独立执行，不包含在此脚本中。

## 功能进度与代码依据

| 文档目标 | 核对结论 | 主要依据 |
| --- | --- | --- |
| 独立账号、房间密码、玩家名、权限 | 已实现，相关 HTTP 测试通过 | `backend/server.mjs`、`tests/server.test.mjs` |
| 服务端裁决、SQLite、快照、私有投影、幂等与重启 | 已实现，相关测试通过 | `backend/server.mjs`、`tests/battle-http.test.mjs`、`tests/four-http.test.mjs` |
| 猫鹰正式地图、开局、基础牌与规则 | 已实现既定范围，现有场景测试通过 | `backend/rules/versions/cats-birds.mjs` 及对应测试；不代表已完成对原数字版所有动态行为的比对 |
| 森林联盟与游侠 | 已实现基础范围，26 项 v5 规则测试通过 | `backend/rules/versions/base-four.mjs`、`tests/base-four.test.mjs` |
| 四阵营整局 | 已有引擎与 HTTP 证据，本轮人机整局复测通过 | 四种真人席位分别搭配三人机的测试通过；浏览器本轮复测猫咪席位 |
| 房间人机管理与自动行动 | 已实现 | 服务端 `pendingBot`、`scheduleBot`、`bot-add`、`bot-remove`、`bot-retry`；前端对应入口存在 |
| 人机使用自身视角 | 代码与测试相符 | 调度器先调用 `projectGame`，再将投影视图传给策略；候选行动由规则引擎裁决并保存 |
| 人机等待真人决策与重启接续 | 本轮验证通过 | `tests/bots.test.mjs` 的待选重启与版本稳定性断言；浏览器进程重启流程 |
| 旧存档版本派发 | 已实现，基础兼容测试通过 | `registry.mjs` 注册 v1–v5，并逐版本校验 schema；不是对每一份现存生产存档的逐一复验 |
| 房主删除及空间回收 | 已实现，专项与浏览器检查通过 | `tests/room-deletion.test.mjs`、本次浏览器报告 |
| 原版素材与 3D 棋盘 | 已接入 | 白名单、场景清单、静态资源 HTTP 测试和本次结束页截图 |
| 强策略陪玩 AI | 未完成 | `backend/bots/test-policy.mjs` 为固定优先级测试策略；房间模式 `developmentRound: 1` |
| 扩展阵营、第二游侠、其他地图及牌组、进阶开局、原版动画 | 仍属待办 | 当前覆盖表及规则注册范围；已有资源文件不等于对应玩法已实现 |

## 文档差异和进度边界

1. **README 明显滞后。**仍将 v1、测试地图、两人局和“未部署”描述为当前状态。IMPLEMENTATION-STATUS 和 ROADMAP 的部分状态说明也只更新到早期阶段或 v4。交接顶部和 RULES-COVERAGE 更接近当前代码。旧报告保留历史价值，不应作为当前状态依据。

2. **双人房可选阵营范围小于 v5 引擎范围。**`backend/server.mjs` 的玩家阵营修改和人机添加逻辑，在容量为 2 时仅接受 cat/bird；`frontend/app.js` 也将双人房标记为“猫鹰双人”。引擎测试支持不含猫鹰的阵营组合，但网页双人房并未开放这些组合。因此“支持 2–4 人基础四阵营”不能理解为所有人数下都可任选四阵营。容量 3/4 的房间可选全部基础阵营，实际开局允许至少两名成员。

3. **健康接口单数版本字段是旧常量。**`/api/health` 的 `ruleset` 仍为 `root-core-lab-v1`，来源是 `backend/engine.mjs`；`rulesets` 列表已包含 v5，前端默认也为 v5。不能凭单数 `ruleset` 判断线上仍停留在 v1；该字段表达可以后续澄清。

4. **注册体验已有一轮修复。**AUTH-LATENCY 文档记录已加入提交等待状态、慢请求提示及先进入大厅再加载列表。因此“注册及网络体验优化后置”应理解为进一步优化后置，不能写成此前完全未处理。本次注册至大厅流程通过，但未重跑专门的延迟注入实验。

5. **版本可追溯只完成了一部分。**发布包和文件哈希清单存在，但当前工作目录不是 Git 仓库。ROADMAP 中 Git 基线、完整发布版本管理等计划不能整体标为完成。

6. **四阵营旧发布清单的差异已能解释。**`four-files.json` 共 140 项，其中当前 4 个文件哈希不同：`backend/server.mjs`、`frontend/app.js`、`tools/cats_birds_selfplay.mjs`、`tools/four_selfplay.mjs`。这 4 个文件均在后续人机增量清单中，且与增量哈希一致，属于已记录的后续修改；未发现无法解释的清单差异。

## 仅核查既有证据、未重新执行的事项

- 历史本地四人 HTTP 长局报告：12 局、150 次重启，报告 `passed: true`；本轮读取报告，未再次运行这 12 局。
- 历史服务器 HTTP 长局报告：6 局、94 次重启，报告 `passed: true`；本轮未登录服务器重跑。
- 历史四浏览器报告：230 次变更，进入第七轮，`passed: true`；本轮改为复测交接重点的一真人三人机整局。
- 历史服务器 105 项测试、发布前后数据数量相同及 `integrity_check: ok`：相应报告存在。本轮公网 GET 不能替代当前生产数据库完整性检查，也不能证明所有后端文件、备份和 systemd 配置仍与当时完全一致。
- 定时备份、异地备份、回滚演练、HTTPS、容量目标和移动端完整体验，本轮没有新增通过证据；不可因已有备份脚本或部署示例而视为运维里程碑全部完成。
- 原数字版运行行为、罕见持续牌/盟友/损失组合，以及安装包全部扩展的实际可用范围，仍需单独核验。

## 当前优先级

1. 收集用户本人完整试玩反馈，优先修复阻断对局、规则结果错误和难以理解的操作。
2. 同步陈旧的当前状态说明，并明确双人房阵营限制及健康接口字段含义。
3. 按实际需求改进人机策略，并在覆盖表中保留规则和验证边界。
4. 再推进扩展内容、表现和运维里程碑；任何后续发布保留现有房间与存档。

本次仅新增核对脚本、报告和隔离测试产物，没有修改游戏业务代码、原安装包或生产服务。
