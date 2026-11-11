# 2026-11-12 蜥蜴扩展与基础教程部署

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

用户在基础教程改造完成后明确要求“部署到服务器”，此前暂缓服务器发布的限制已解除。本次将运行代码提交`e428902`部署到既有服务器，包含独立蜥蜴v6、蜥蜴19节教程，以及基础章“贵族崛起”的地图内逐句引导。产品版本和v1.1.0标签保持原状，不将内部规则ID当作产品版本号。

## 目标与发布

- 公网入口：http://103.236.93.55:233/ 。SSH继续使用既有主机指纹校验；凭据仅交互输入，未保存到脚本、仓库或日志。
- 运行目录`/opt/woodland-rooms`，systemd服务`woodland-rooms`，Node24.11.1，数据仍位于`/var/lib/woodland-rooms/root.sqlite`。
- 先上传暂存、校验并完成服务器163项测试，再备份代码、停止服务、通过SQLite备份API生成一致性副本、覆盖程序并重启。systemd记录停止于北京时间00:00:30，重新启动于00:00:31。
- 主包`woodland-e428902-release.tar.gz`为9,450,543字节，SHA256：`9af856a9e78e29f0fcc205cd530e5f6ba99f77a5a84d38ad323d8ab1a19be49a`。另补传测试辅助模块`tools/cats_birds_selfplay.mjs`，SHA256：`95b23882e54e529bc046be45564bbacce89049af7e6034597338feeb5d48c729`。合计387项文件校验通过。
- 初次校验在暂存阶段发现Windows换行问题；规范清单行尾后继续。随后完整测试发现包遗漏上述测试引用的辅助模块，补齐后163项全部通过。两次中断均发生于修改生产服务之前，不是线上规则回归失败。

## 备份与数据

部署操作跨越午夜，备份目录沿用准备时的20261111命名：

- 源码：`/opt/woodland-backup-e428902-20261111/code.tar.gz`，约5MiB。
- 一致性数据库：`/var/lib/woodland-rooms/backup-before-e428902-20261111.sqlite`，约4.3MiB，完整性检查ok。
- 相同备份目录保留`staging-tests.txt`、`staged-hashes.txt`、`installed-hashes.txt`、`database-before.json`、`database-after.json`、`health.json`。

部署前后、开始公网验收之前的数量完全相同：users9、sessions10、rooms2、games1、snapshots205、commands220、tutorial_runs11；两次integrity_check均为ok。没有覆盖生产数据库或现有用户进度。

回滚使用本次源码备份覆盖后重启服务；不要为了撤回界面或规则更新直接还原旧数据库，避免丢失部署后的玩家进度。历史备份保留。

## 公网验收

从公网入口使用全新Edge浏览器上下文注册独立验收账号，正常进入教程目录，通过地图按钮与确认控件完成基础章22次、蜥蜴章41次，共63次命令；检查刷新恢复。另用独立390×844上下文重新登录，核查两章完成标志、手机基础章布局和地图纹理加载。未复用或退出用户日用浏览器的已有账号。

六章目录、新基础章标题、蜥蜴创建房间模式和v6教程规则ID正确。公网app.js、map-controls.js、styles.css、asset-manifest.json与发布时本地SHA256一致，API完整返回，最终无页面错误、无失败请求或手机横向溢出。手机公网验证为重新登录、续学和布局检查；完整手机基础章操作已在前轮本地27次验收中完成，不混称公网完整操作。

验收脚本的目录定位器曾同时匹配article和按钮，已收紧定位器；初次手机截图过早，已补充地图纹理加载完成等待并重新截取。最终记录为`audit/deploy-e428902-public.txt`和`audit/deploy-e428902-public/`中的report、trace、截图。本地原游戏体验截图、数据库、部署包和凭据不上传GitHub。

本次仅对新建验收账号清理其会话和教程记录，不修改任何原用户账号、对局或教程。发布暂存目录与传输用临时文件在验收后清理；保留当前安装和发布前备份。
