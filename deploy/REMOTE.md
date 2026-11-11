> 2026-11-09 房间测试人机已发布。房主可在 v5 房间按阵营添加或移除人机，自动执行开局、行动及中断决策，重启后继续。当前采用原自动对局测试策略，房间模式从第一轮开始发展。105 项 Node 测试本地与服务器均通过，网页单真人三人机第九轮正常结束。发布前备份 `/opt/woodland-rooms-before-bots-20261109` 和 `/var/lib/woodland-rooms/backup-before-bots-20261109.sqlite`，发布后数据数量一致且 integrity_check 为 ok。更新包 SHA-256 为 `6b8b575aa18c62c5c097f3747ef682c251082f1a85424fc8d159b7d9d8e00ee9`。证据见 `audit/bots-deploy.json`、`audit/bots-server-node-tests.txt`、`audit/bots-browser/report.json`。

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

> 2026-11-09 基础四阵营 v5 已发布，支持 2–4 人和森林联盟、神秘游侠（三种基础角色）。本地及服务器 102 项 Node 测试通过；本地 12 局、服务器 6 局 HTTP 对局均正常结束，分别覆盖 150 与 94 次重启恢复。85 张原版 UI 图片已接入。备份、版本边界及证据见 [四阵营验收与交接](../docs/BASE-FOUR-ACCEPTANCE-2026-11-09.md)。以下为历史记录。

> 最新验收记录更新于 2026-11-09。猫鹰标准局 v4 已完成规则和开局实现，72 项 Node 测试、10 项研究测试通过；12 局 HTTP 自动对局均超过十轮，双浏览器已完成 12 轮。当前范围、证据及维护信息见 [猫鹰验收与交接](../docs/CATS-BIRDS-ACCEPTANCE-2026-11-09.md)。以下保留早期阶段记录。

> 2026-11-09 房主删除房间已发布。大厅及房间内提供删除入口，确认后清理房间全部对局、快照和命令，并通知在线成员返回大厅。支持本人已关闭房间的清理。当前本地与服务器均为 75 项 Node 测试通过，双浏览器删除、取消和通知验证通过，报告见 `audit/room-deletion-node-tests.txt` 与 `audit/browser-acceptance/v4/report.json`。
>
> 此次启动将旧 SQLite 数据库转为 incremental auto-vacuum 模式，删除提交后执行增量空间回收及 WAL 截断。迁移后的完整性检查为 ok，users/rooms/games/snapshots/commands 数量与发布前备份一致。代码备份为 `/opt/woodland-rooms-before-delete-20261109`，数据库备份为 `/var/lib/woodland-rooms/backup-before-delete-20261109.sqlite`。增量包 `deploy/room-delete-update.tar.gz` 的 SHA-256 为 `03e8ddc9a7873e8d00f13c2233173f2c75e8c6b89f6f63e8db68c478d7e0d74d`。空间回收机制参考 [SQLite PRAGMA 文档](https://sqlite.org/pragma.html#pragma_incremental_vacuum)。

> 2026-11-09 第二轮更新。已导出原版静态牌表，新增可选 v3 与 20 种物品牌制作。当前 54 项 Node 测试、9 项研究测试通过。最新进度见 [第二轮记录](../docs/ROUND-02-2026-11-09.md)。

> 2026-11-09 续作更新。战斗队列已集成并发布，49 项 Node 测试和 7 项研究测试通过。最新状态、限制与交接见 [本轮完成记录](../docs/ROUND-01-COMPLETED-2026-11-09.md)。以下为此前阶段记录。

# 远程部署记录（2026-11-08）

- 测试入口：http://103.236.93.55:233
- 映射：公网 233 → 服务器 80；SSH 公网 55215 → 服务器 22。
- 系统：Ubuntu 22.04，x86_64。
- 代码：`/opt/woodland-rooms`。
- Node：`/opt/woodland-runtime/node-v24.11.1-linux-x64/bin/node`。
- 数据：`/var/lib/woodland-rooms/root.sqlite`（含 SQLite WAL/SHM）。
- systemd：`woodland-rooms.service`，开机自启，故障自动重启。
- 服务账号：`woodland`，仅授予绑定 80 端口所需能力；数据目录仅由服务账号写入。
- 页面来源：`APP_ORIGIN=http://103.236.93.55:233`。

运行环境通过 npmmirror 下载并与同一镜像提供的 SHA-256 清单校验一致；官方 Node 下载站当时无法连接。代码与测试包通过 SSH 上传。密码未写入文件。

## 验证

服务器上运行 `node --test tests/*.test.mjs`：29 项通过。公网 `/api/health` 返回 `{"ok":true,"ruleset":"root-core-lab-v1"}`。页面、服务账号、数据库权限和服务重启另行检查。尚未进行真实浏览器点击验收。

当前为 HTTP 测试入口。正式使用需在获得域名及证书后配置 HTTPS，并将 `APP_ORIGIN` 与 `COOKIE_SECURE` 更新为对应配置。

## 维护

```sh
systemctl status woodland-rooms --no-pager
journalctl -u woodland-rooms -n 100 --no-pager
systemctl restart woodland-rooms
```

一致性备份（输出路径必须是尚不存在的文件）：

```sh
sudo -u woodland env DB_PATH=/var/lib/woodland-rooms/root.sqlite /opt/woodland-runtime/node-v24.11.1-linux-x64/bin/node /opt/woodland-rooms/scripts/backup.mjs /var/lib/woodland-rooms/backup-2026-11-08.sqlite
```

当前只部署规则验证版。原版完整地图 / 牌库、其他阵营及扩展仍待开发；详见 `docs/RULES-COVERAGE.md`。数据库与代码目录分开，更新代码不应覆盖存档。
