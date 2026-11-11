# 基础四阵营验收与交接（2026-11-09）

## 实现

新规则 `root-base-four-v5`、schema 5，支持 2–4 人及基础四阵营不同组合，新建网页房间默认容量 4。旧 v1–v4 引擎保留。服务端裁决全部行动并保存状态、秘密信息和待选决策。多人局暂不支持单人投降，房主仍可删除房间。

森林联盟：支持者和容量限制、同情轨道与戒严、起义、义愤及私有亮牌、游击防守、动员与训练、基地损失和军官军事行动。

神秘游侠：盗贼、修补匠、巡林客三种基础角色，七片森林、潜行和休整、物品刷新/消耗/损坏/维修/负重、四处废墟探索、15 张任务、援助与关系、敌对和恶名、盟友移动/战斗及受伤分配。三人以上使用含四张统治牌的 54 张牌组，四人支持游侠联盟胜利。

原版素材接入联盟战士、三种基地、同情、游侠头像与角色牌、火把、统治牌。白名单共 85 张图片约 4 MB，完整发布包约 5.2 MB。沿用全宽棋盘、方形建筑格、独立战士计数及外置花色。3D 和轻量棋盘均显示游侠森林位置。

## 依据与证据

规则参考官方 Root Base Law（2025-10-13），第 8、9 节及附录 V：https://cdn.shopify.com/s/files/1/0106/0162/7706/files/Root_Base_Law_Oct_2025.pdf?v=1774903756 。安装包静态分析获得同情费用/得分和 15 张任务构造数据，见 `research/four-factions/`、`backend/data/four-faction-catalog.json`。工具为 `tools/research_deck.py`、`tools/build_four_catalog.py`；未修改原安装包。

- `audit/four-regression.txt`：102 项 Node 测试通过，覆盖混合阵营开局、私有信息、义愤、军官、游侠物品/任务、盟友潜行、医院批次、统治及联盟胜利。
- `audit/v5/selfplay-http.json`：12 局四人 HTTP/SQLite 对局正常获胜，8–21 轮，其中 11 局达到十轮；5732 次操作及 150 次重启恢复。每步验证牌、战士、建筑、物品和任务守恒，覆盖命令重放幂等。
- `audit/v5/selfplay-engine.json`：6 局引擎自动对局，9–27 轮。自动策略用于流程覆盖，不代表游戏平衡测试或 AI。
- `audit/v5/browser/report.json`：四个独立 Edge 会话经正常 UI 注册、入房、选阵营与角色；230 次变更完成六轮进入第七轮，包含进程重启、秘密信息检查、85 张图片解码和移动端布局检查。隔离测试关闭请求频率限制，生产配置保留限制。
- `audit/four-v4-browser-regression.txt`：旧猫鹰网页、布局与房主删除功能回归通过。
- `npm run check`：语法检查通过；10 项 Python 研究测试通过。

## 发布信息

入口 http://103.236.93.55:233 。代码 `/opt/woodland-rooms`，数据库 `/var/lib/woodland-rooms/root.sqlite`。发布前备份 `/opt/woodland-rooms-before-four-20261109` 和 `/var/lib/woodland-rooms/backup-before-four-20261109.sqlite`。

发布包 `deploy/four-runtime.tar.gz` SHA-256：`f2b78eae89963ec7c57c27e47276c43c580910f8f68df97714a95a11a1f7dfd2`。服务器验收及发布已完成，详见下方记录。

## 边界

尚未实现扩展游侠角色、第二游侠、其他地图、进阶开局、原版动画及 AI。未完成原发行版本运行时行为逐项交叉核验；罕见持续牌/盟友/损失组合不能宣称与原版动态行为完全一致。注册交互优化按用户要求后置。

增量包 `deploy/four-delta.tar.gz`（295305 字节）SHA-256：`5a0ceee6194387ff3f230d32231d9bd2d2596b375b3446962eb18eec2310776f`。服务器隔离目录已按完整发布清单核对全部 140 个文件 SHA-256，一致；102 项 Node 测试全部通过。

服务器隔离 HTTP 验收 6 局全部获胜，轮次为 12、14、8、37、10、22，重启恢复 94 次，报告 `audit/v5/selfplay-server-http.json`。发布后健康接口包含 v5；数据库完整性为 ok，auto_vacuum 为 2，发布前后 users/rooms/games/snapshots/commands 数量一致，报告 `audit/v5/deploy.json`。

公网验收：登录页浏览器检查通过，无 pageerror（`audit/v5/public-browser.json`）；5 个关键脚本/样式/清单及全部 16 张新增图片逐一 GET 并核对 SHA-256 通过（`audit/v5/public.json`）。首次并发下载全部旧/新素材曾发生读取超时，因此不计为“公网全部 85 图通过”；85 图解码证据来自本地四浏览器，服务器全量文件证据来自 140 文件 SHA 校验。
