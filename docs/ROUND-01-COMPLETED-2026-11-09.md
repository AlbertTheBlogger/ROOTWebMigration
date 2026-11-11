# 第一轮续作完成与交接

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

更新日期 2026-11-09。用户恢复工作后，本轮完成战斗队列集成、浏览器验收及服务器发布。本文件取代旧交接文档中的暂停状态，原报告保留为历史记录。

## 已完成

- 新增 `root-battle-lab-v2`，使用独立 schema 2，旧 `root-core-lab-v1` 对局按旧版读取和结算。
- 接入秋季地图静态提取拓扑，包括 12 林地、道路、河流和废墟。展示坐标为人工布局。
- 战斗支持伏击、反伏击、军械师、双方伤亡、建筑损失选择与野战医院。选择通过普通命令接口提交，存档包含队列与继续执行状态。
- 玩家只能收到自己的合法选择。过期、伪造和重复命令受到校验。骰子结果持久化，恢复过程使用已有结果。
- 接入铁砧和军械师的制作验证流程、制作设施使用与物品供应消耗。
- 前端增加规则版本选择、战斗决策面板、制作操作和公开已制作牌展示。
- 修复公网 HTTP 下 `crypto.randomUUID` 缺失导致命令提交失败的问题，备用路径使用 `crypto.getRandomValues`。

## 实际验证

- 本地完整 Node 测试 49 项通过，Python 研究测试 7 项通过。
- 服务器独立解包目录完整 Node 测试 49 项通过。
- HTTP、SQLite 和 SSE 测试覆盖伏击、反伏击、军械师、建筑损失、医院五种决策的保存、重启、恢复、私有投影及重复提交。
- 双 Edge 浏览器完成注册、密码房间加入、准备、新版开局、战斗选择、刷新及后台进程重启后的医院选择恢复。临时 QA 数据库注入特定战斗局面，后续操作使用正常 UI/API。
- 手机视口 390×844 未发现水平溢出，浏览器 pageerror 为空。
- 公网登录页浏览器返回 200，pageerror 为空。公网完整双人对局未另行重复测试。
- 结果与截图位于 `audit/browser-acceptance/`。浏览器脚本为 `tools/browser_acceptance.py`。

## 发布记录

入口 http://103.236.93.55:233 。发布代码位于 `/opt/woodland-rooms`，数据继续使用 `/var/lib/woodland-rooms/root.sqlite`。服务 `woodland-rooms` 已启动且保持开机自启。

发布前在独立目录运行测试，并使用内部 3001 端口、独立临时数据库验证健康检查与页面。临时实例已停止。

- 数据库备份 `/var/lib/woodland-rooms/backup-before-round01-20261109.sqlite`
- 旧代码 `/opt/woodland-rooms-before-round01-20261109`
- 公网健康检查同时列出 `root-core-lab-v1` 与 `root-battle-lab-v2`。顶层 `ruleset` 继续显示兼容默认值 v1，新房间前端默认选择 v2。

代码回滚时先停止服务，将当前代码目录移至一个新的保留目录，再把上述旧代码目录恢复为 `/opt/woodland-rooms`，最后启动服务。数据库包含 v2 对局时，旧代码无法处理这些对局，应保留当前代码以便恢复。数据库回滚须单独评估发布后新增存档，不能直接覆盖。

## 明确限制与实现选择

当前为两人猫鹰规则验证版。固定开局与 48 张验证牌组为本轮实现选择，其牌数及组成尚未匹配原版完整牌库。仅实现少量牌效果与部分阵营逻辑，完整 ROOT 及扩展仍待逐项开发。

原游戏运行观察、原版地图画面交叉核验、具体游戏版本、完整牌数与成本还原均未完成。地图来自受限静态扫描，尚待动态验证。三个研究卡牌样本的未知数值继续保留 null。

新增 `card-reference-evidence.json` 与 `additional-native-evidence.json` 记录构造函数引用、类型和字面量线索。PE runtime-function 边界可能只覆盖热代码块，例如 GetDeck 的 154 字节片段不能作为完整方法还原。不得据此声称恢复了全部牌库。

官方规则与资源入口已查阅。官方 PDF 下载遇到 CDN DNS 失败，未取得本地 PDF，未完成该 PDF 的地图视觉核验。采用的规则基准参考 [Leder Games 资源页](https://ledergames.com/pages/resources) 与 [Root Law](https://cdn.shopify.com/s/files/1/0106/0162/7706/files/Root_Base_Law_Oct_2025.pdf?v=1774903756)。规则基准和当前安装版本之间仍需比对。

研究环境依赖已更新至 `research/requirements.lock.txt`。部署包只包含运行代码、脚本与测试，研究原始资源没有上传。

## 下一轮入口

1. 运行原版核验地图和初始化语义，确认发行版本及规则差异。
2. 继续恢复原版牌库数量与制作属性，替换验证牌组。
3. 按 `RULES-COVERAGE.md` 扩展猫鹰规则、卡牌与其他阵营，逐项增加必要回归场景。
4. 在新版正常自然对局中完成端到端胜利验收，随后扩展多人房间容量及完整开局设置。
5. 域名与证书确定后配置 HTTPS。当前入口仍为 HTTP。

## 复验

```powershell
cd E:\RootWebMigration
node --test tests/*.test.mjs
& research\.venv\Scripts\python.exe -m unittest discover -s tests -p test_research.py -v
& research\.venv\Scripts\python.exe tools\browser_acceptance.py
```

浏览器测试启动临时本地服务与临时数据库，不连接生产存档。首次启动 Edge 可能需要执行环境授权。
