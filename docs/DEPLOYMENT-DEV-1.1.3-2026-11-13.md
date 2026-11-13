# 开发v1.1.3部署记录（公开版本v1.1）

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored engineering documentation: MIT; third-party resources excluded. See LICENSE-SCOPE.md. -->

2026-11-13，北京时间21:55:50部署。用户明确授权将当前内容作为v1.1.3发布并上传Git，之后再次要求核查并继续部署。沿用开发版本与公开版本分离：package为1.1.3-dev，developmentVersion为1.1.3，releaseVersion和网页均为v1.1；开发标签dev-v1.1.3，正式标签v1.1.0不变，不创建GitHub Release。人工验收仍待用户进行。

## 本轮内容

PC同屏完整回合与临时决策交接；手机账号认领、公共辅助屏与本席位临时决策；横竖屏地图手势；猫咪教程顺序和空弹层修正；飞鹰/联盟四轮以及游侠五轮、蜥蜴四轮连续教程；动画、补鞋匠、木材生产和士兵透明显示优化。完整范围与边界见[开发记录](DEVELOPMENT-1.1.3.md)。

## 发布与验证

- 入口：http://103.236.93.55:233/；服务woodland-rooms为active，保留既有APP_ORIGIN、运行账号和数据库路径。
- 先以部署专用known_hosts严格校验主机密钥，只在交互中输入已授权凭据，不写入脚本、仓库或日志。
- 增量包只含程序、配置和测试，共52项更新，复用服务器既有资源。包大小331,393字节，SHA256：825e1c729b96a0fd448cf9bd46ab3d5a6fccf8708a5197fe937f4bc6f8dcc0af。它不是独立全量恢复包。
- 核对线上代码与a663fa4基线；在独立暂存目录叠加更新，411项运行/测试文件校验通过（旧文本允许CRLF/LF等价，更新文件校验原始字节哈希）。服务器完整Node218项通过，未使用生产数据库运行测试。
- 新代码只读投影生产11份教程与2份对局通过；教程课程版本分布为v1九份、v3一份、v4一份。没有推进、重开或迁移这些玩家进度。
- 停服后先备份代码与SQLite，再替换程序；安装411项文件校验通过，数据库完整性ok，切换前后users9、sessions10、rooms3、games2、snapshots579、commands320、tutorial_runs11均一致。线上test账号前后均为0，本地test账号及数据库未上传。
- 公网健康、9项已更新前端资源哈希、PNG类型、1366×900与390×844匿名页面通过，零页面错误，继续显示v1.1发布版。公网检查没有注册、登录或创建对局。
- 本地集中回归结果：Node218项；六章123节点桌面778条/手机尺寸779条UI指令；同屏自然终局430次操作、71次交接、第13轮获胜；四账号联机208次操作至第7轮；手机认领及明确隔离战斗交接、图标修正专项通过。手机为Edge尺寸模拟，隔离战斗不冒充自然完整对局。

## 备份与回滚

- 代码备份：/opt/woodland-backup-dev113-20261113-200647/code.tar.gz。
- SQLite一致性备份：/var/lib/woodland-rooms/backup-before-dev113-20261113-200647.sqlite。
- 暂存目录：/opt/woodland-stage-dev113-20261113-200647；运行代码：/opt/woodland-rooms；数据库：/var/lib/woodland-rooms/root.sqlite。

需要回滚程序时，先停woodland-rooms，核对上述代码备份后解压回/opt/woodland-rooms，再启动服务并检查健康状态。新版本增加而旧版不引用的文件可以保留，不能无差别删除目录。不要自动恢复旧数据库覆盖发布后玩家的新进度；数据恢复必须另行核实故障和授权。

## Git与保留范围

本轮集中提交至main，并推送带注释的dev-v1.1.3标签；实际提交SHA以该标签解析结果为准。部署包不含本地data、audit、凭据或研究虚拟环境。Git保留用户要求的河岸商会设计概念和交接规范；第三方/改编教程JSON、清单和图标仍不属于MIT授权。

本地证据：audit/dev113/consolidated/summary.json、audit/dev113/release/下服务器结果、测试日志和public/report.json。工程说明与浏览器工具在运行代码验证后同步，不改变已验证的产品模块。必要证据和备份暂保留待人工验收；没有启动原游戏。
