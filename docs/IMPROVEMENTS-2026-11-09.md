# 桌面待改善清单落实记录

更新于2026-11-09。依据桌面“待改善清单”中的Word文件及两张截图，本轮改动已发布。

| 清单条目 | 实施与证据 |
| --- | --- |
| 1 响应约20秒 | 默认轻量棋盘减少初次资源竞争，JSON及网页脚本增加gzip和Content-Length，记录Server-Timing和客户端请求耗时，所有提交提供即时等待提示及30秒超时。公网准备命令10次为39–43毫秒，真实开局及行动命令14次为41–55毫秒，见audit/experience-public.json与experience-public-game.json。本轮未复现20秒等待，尚不能确认此前根因或保证所有网络条件下已消失。 |
| 2 操作动画 | 根据真实结算日志显示骰子点数、制作牌面和获得手牌动画。对手手牌采用背面展示。新增近期操作查看入口。动画是网页实现，仍可继续细化动作衔接。 |
| 3 三维加载与历史 | 默认轻量棋盘，三维由用户切换加载。改用新偏好键避免旧默认三维设置继续影响首次体验。近期操作可查看服务器记录，减少切换视图后遗漏信息。 |
| 4 卡牌图片与完整信息 | 手牌、支持者、支付支持者、已制作牌、公开政令、忠臣、领袖、角色选择、公开任务及展示的手牌接入预览。新增15张原版任务牌，弹窗组合原版插画、花色、制作需求、得分和效果说明。 |
| 5 领地联动 | 当前玩家的联盟和游侠可操作目标自动高亮。联盟起义与传播显示花色费用图标及闪烁提示，点击林地同步选择相应操作目标并展开操作栏。其他阵营继续使用现有目标表单，点击林地同步目标编号。 |
| 6 边界冗余 | 轻量棋盘收紧viewBox，三维初始取景范围由10.8收紧到9.5，保留缩放旋转。 |
| 7 整体交互 | 在现有网页与提供的截图上完成调整。原游戏直接启动体验尚未进行。后续继续按真人实操反馈调整。 |

## 验证

本地和服务器各105项Node测试通过。正常网页流程87次真人侧点击后于第16轮结束，包含进程重启、下一局和删除房间。专项浏览器夹具验证牌面弹窗、两张狐狸费用提示、领地目标切换、真实骰子显示以及15张任务图映射，见audit/improvements-detail.json。两个公网临时测试房间和对应账号已清理。

## 发布与维护

代码备份 /opt/woodland-rooms-before-experience-20261109，数据库备份 /var/lib/woodland-rooms/backup-before-experience-20261109.sqlite。更新包deploy/experience-update.tar.gz，SHA-256 a44182e0e190e2d7d6973781791a499e36190075ca37eae5fc3d7de93c8710d7。发布前后用户、房间、对局、快照、命令数量一致，数据库完整性为ok。

主要修改backend/server.mjs、frontend/app.js、frontend/experience.js、frontend/styles.css、frontend/board3d.js、frontend/asset-manifest.json。请求诊断位于浏览器sessionStorage的woodland-request-times，仅记录路径和耗时。

## 本机日常浏览器复测

使用本机正常Edge用户配置和已有leethefatty登录会话，通过Windows UI Automation实际点击页面按钮。首次回到房间约200毫秒。房间443313中实际执行一次秋林1传播同情，按钮到可见状态更新357毫秒，该命令网络耗时98毫秒，服务端处理11.4毫秒。支持者3张降为2张，同情0个增为1个，进度已保存。

三轮实际大厅/房间切换中，第一次返回大厅19390毫秒，其余五次178–237毫秒。该慢请求/api/rooms首部等待19311毫秒，服务端Server-Timing为3.6毫秒。当前会话还记录到其他房间列表请求14084和6121毫秒。本机已复现间歇性长等待，之前独立浏览器的低耗时结论不能代表本机日常会话。

长等待发生在响应首部返回前，服务端业务处理仅数毫秒。具体浏览器连接复用、代理或网络传输原因仍需进一步定位，现有证据尚不能区分。新页面的Resource Timing只有刷新后样本，无法追溯19秒请求的详细连接阶段。基于UI Automation文档ID变化的刷新计时因ID复用而无效，已排除。原始记录audit/local-visible-report.json。本机浏览器保留打开当前房间。

## 2026年11月10日连接等待修复

在同一本机日常Edge和已有登录会话中再次复现19320毫秒导航等待。Resource Timing显示请求发出前等待19242.5毫秒，连接建立33.1毫秒，首字节41毫秒。代理、PAC和自动发现均关闭。问题集中在浏览器获取/复用连接的阶段，具体底层网络设备或浏览器实现原因仍未确定。

已发布两项恢复措施。普通JSON API响应发送Connection: close，避开空闲连接复用路径，房间SSE仍维持推送连接。前端对安全GET以及携带唯一commandId的房间命令，首次等待超过1500毫秒取消并重试一次，第二次最多等待10秒。重试使用完全相同的命令号与请求体，由既有服务端幂等机制避免重复行动。注册等其他提交保持单次请求。诊断存储异常也会被隔离，避免成功提交后因写入sessionStorage失败而显示错误。

最终复测使用同一本机可见Edge日常配置，清除诊断注入并确认原生fetch。十次真实导航181–261毫秒，其中空闲45秒后返回大厅231毫秒、进入房间181毫秒。对应API实际耗时78–115毫秒，全部首次成功。21项定向回归通过，含4项新增客户端连接恢复检查。此次未推进用户对局行动。数据见audit/connection-recovery-report.json，关键原始记录local-net-before-details.txt、local-connection-close-after.json、local-connection-close-details.txt。中途未能确认页面状态的测试轮次不计入结果。

备份为服务器frontend/app-before-connection-retry-20261110.js、backend/server-before-connection-recovery-20261110.mjs，以及/var/lib/woodland-rooms/backup-before-connection-recovery-20261110.sqlite。数据库完整性ok，服务active。前端SHA-256 ad52644a4b8c928c512c3894ef127a0eab07d513e20695bbe291414d90634cf8，后端SHA-256 2512453f9552037bf20ecb14a9a21d0893c50db5182cde7d555e12f1e9d02a64，已核对线上一致。关闭普通API连接复用会增加TCP建连次数，是本轮为规避空闲连接等待采用的取舍，当前本机API耗时如上。


## 2026-11-10 桌面修改意见第二轮已发布

来源为桌面待改善清单目录的待改善清单.docx、手牌缩略图.png与花色图片.png，按四项处理。

1. 游侠角色详情增加技能名称、消耗火把条件和技能效果，自身面板和公开详情同时显示。点击角色牌的完整预览也有技能说明。盗贼、工匠、猎人的名称与描述取自 research/assets/localization/zh_CN.txt 中 root.vagabond.*、*.ability.title 与 *.ability.text，火把消耗由 tooltip.ui.vagabond.vagabond_* 核对。
2. 手牌移除扑克牌字符占位，改成真实花色图片。下拉列表只保留文本花色，公开法令使用图片。
3. 从用户参考图提取狐狸、飞鸟、老鼠、兔子四个圆形标识，透明边缘WebP保存到 frontend/assets/suits，统一替换地图领地、支付提示、手牌、牌面预览的花色。manifest补齐wild及资源白名单，构建脚本保留新映射和角色文本。
4. 对照原版中文文本校正当前基础四阵营主要术语。猫侯国改猫咪贵族，窃贼/修补匠/巡林客改盗贼/工匠/猎人，军官改长官，同情改民意，政令改法令，忠臣改大臣，领袖改为制裁者/指挥者/号召者/建设者，日工/藏身改劳作/隐藏，制作改锻造，征兵动作改招募。建筑名保留原版征兵所。对应原文键包括 factionnames.*、playerinfo.woodlandalliance.officers.label、root.eyrie.*、root.vagabond.*。本轮覆盖当前四阵营主要界面与行动术语，未逐句审校原版全部文本，历史存档中已有日志文本仍使用生成时的名称。

验证结果为112项Node回归通过，猫咪四步设置、四名玩家公开详情、游侠技能文本、手牌花色图片加载和无占位字符、桌面及手机布局专项通过。最终版单真人三人机十轮、56次真人操作完成整局，覆盖重启恢复、下一局准备与删房，浏览器无脚本错误。测试使用隔离数据库。人机训练和招募选择改用action.type，游侠技能优先顺序同步新译名。

已发布并通过健康检查。代码备份 /opt/woodland-feedback-backup-20261110/code.tar.gz，数据库备份 /var/lib/woodland-rooms/backup-before-feedback-20261110.sqlite，备份完整性ok。发布包 deploy/desktop-feedback.tar.gz。修改frontend的app.js/styles.css/experience.js/map-controls.js/clearing-ui.js/asset-manifest.json及花色资源，backend/rules/versions/base-four.mjs、backend/bots/test-policy.mjs。数据库格式与动作标识保持原版本。

本机已有Edge游戏标签页确认盗贼偷窃文字完整、飞鸟/老鼠/兔子手牌花色图加载成功、占位字符为空，检查后关闭详情并返回原来的云服务器标签页，未提交游戏行动。证据 audit/desktop-feedback-local.txt、audit/desktop-feedback-browser.txt、audit/desktop-feedback-tests.txt、audit/desktop-feedback-bots.txt。



## 2026-11-10 16时51分桌面清单已在本地完成 待发布

本节优先于下方历史发布记录。用户明确要求暂不发布，公网服务器有进行中的对局。本轮仅修改本机 E:/RootWebMigration，未上传代码、连接SSH、重启服务或修改线上存档。

### 八项处理结果

1. 民愤无匹配牌补偿。原有规则已经从牌堆抽牌，本轮核查空手、匹配飞鸟、弃牌堆重洗、无基地五支持者上限等分支，并增加补偿日志。无基地且五张支持者时，新增牌依法弃置，日志分别说明抽取和上限弃置。没有把上限误改为可以超收。牌堆和弃牌堆同时为空时明确记载无可抽取补偿牌。仅联盟能查看展示手牌，公共日志不展示支持者牌名和花色。
2. 操作区放大。使用蓝底、深蓝文字及边框，与米白游戏提示和绿色系统提示区分。按钮最小高度42px，输入16px，标签15px，选项图片90×105。地图工具条高度108px，避免放大后与状态提示重叠。
3. 士兵移动增加独立起点、终点选择，可与地图点选配合。猫鹰保留独立数量输入，联盟使用独立数量下拉，替代包含起终点及数量的组合选项。来源均为后端合法行动投影，最终命令仍由后端验证。未选起点时终点暂禁用。游侠单棋子移动保留原目的地选择。
4. 自动损失结算。如果只剩一种建筑/标记可移除，或命中足以移除全部剩余建筑/标记，由服务端自动处理。相同木材多个也自动处理。游侠只有唯一损坏选择、或全部可承受对象均须损失时也自动处理。损失数量不足且有不同结果时保留玩家选择。医院无可支付手牌时略过空选择。
5. 详细公共日志。增加阶段、抽牌数量、得分变化、木材生产、猫鹰招募、建筑与地点及木材数量、联盟动员数量/长官训练/组织、游侠常用行动等。动员仅写数量。飞鹰动乱写无法执行的列、花色、飞鸟牌数量及实际失分。保持原200条日志上限。增加日志不会将完整战斗细节重复播放为大动画。
6. 控制者标记。后端每块领地投影ruler，地图旁以阵营小图标标出，未控制时不显示。重新核对士兵加建筑、标记与游侠棋子不计控制、飞鹰赢平局、移动必须控制起点或终点。原规则符合，保留，并增加回归。
7. 战斗日志。记录原始双骰、双方战力上限、联盟游击战交换骰子、无人防守与指挥者加成，以及应用防护和额外命中后的最终点数和实际移除。原骰子上限及无人防守计算保留，新增针对性回归。
8. 大操作栏可临时最小化。地图工具条增加最小化操作/展开操作，适用于法令表单、非地块选择和地图确认面板。隐藏后可看地图，展开恢复原输入，不提交命令。四玩家测试验证法令选牌保留。

### 本地验证与证据

- Node回归122项全部通过，包括新增10项民愤、自动损失、战斗日志、隐私、控制移动和建造动乱用例。证据 audit/local-feedback-1651-tests.txt。
- 最终四个独立网页玩家经195次正常UI操作完成六轮进入第七轮，覆盖独立移动选择、法令最小化保留、联盟/游侠操作、12领地控制标记与投影比对、进程重启、刷新和手牌隔离，浏览器无脚本错误。证据 audit/local-feedback-1651-four-browser.txt 与 audit/v5/browser/report.json。
- 单真人加三人机经63次真人UI操作于第十二轮自然结束，并验证重启续局、下一局准备与删房。证据 audit/local-feedback-1651-bots.txt。此整局运行在最终工具条高度调整和纯日志补充之前，最终四玩家测试覆盖最新界面与日志版本。
- 开局、四名玩家公开详情、角色技能和手牌花色、桌面左右栏及手机无横向溢出专项通过。1912×948视口下最新棋盘约1228×866，上下边界40–907px。证据 audit/local-feedback-1651-layout.txt。
- 操作栏展开及收起截图 audit/v5/browser/action-expanded.png、action-minimized.png。其他截图 audit/v5/browser/alliance.png、vagabond.png。短视口允许左栏滚动，并修正长名字在卡片内的重叠。

### 待发布文件

frontend/app.js、frontend/styles.css、frontend/map-controls.js、frontend/clearing-ui.js、frontend/experience.js、backend/rules/versions/base-four.mjs。

tests/base-four.test.mjs增加回归。tools/four_browser.py同步新控件入口及最小化/控制标记断言。数据库schema仍为5，新增控制字段只在投影中生成。修改前本地备份 audit/before-local-feedback-1651.tar.gz。

下次发布必须先确认用户已允许发布。线上仍是上一轮已发布版本。本轮未创建或上传发布包。待发布时按原流程备份代码与SQLite，再切换，并核对对局恢复。

规则依据为官方2025年10月13日版Law of Root的2.5、4.2.1、4.3.3至4.3.6、7.2.2及8.2.3/8.2.6。[官方规则书](https://cdn.shopify.com/s/files/1/0106/0162/7706/files/Root_Base_Law_Oct_2025.pdf?v=1774903756)



## 2026-11-10 管理员与分轮日志版本已统一发布

用户最新授权本轮与上一轮八项清单一并发布。本节覆盖下方历史待发布状态。

- 联盟基地被移除时，弃置全部该基地花色和飞鸟支持者，其他花色保留。结算取实际基地类型的花色，新增弃置数量日志。原有长官损失及无基地支持者上限继续执行。
- 最小化按钮位于操作面板内部左上角。最小化后同一按钮移到地图工具条作为展开入口，恢复后返回面板，保留输入。数值地块确认、法令表单及其他选择共用此流程。
- 日志按每位玩家各自回合分组，从第一位玩家的回合起累计第1、2、3轮。游戏规则内部整桌轮数继续供原规则及测试策略使用。新日志以并行logTurns记录回合编号，已有存档按原回合开始标记补分组。兼容日志滚动截断、旧元数据缺失及现有私有手牌投影。对局日志、历史存档和近期操作均分组显示。
- 管理员账号admin已用用户指定密码创建，普通登录入口登录后进入管理控制台。密码仅经隐藏终端输入配置，代码、发布包与文档均不保存明文。账号采用原有scrypt密码哈希机制。
- 管理员可查看账号列表和有效会话数，强制注销全部会话、重置密码并撤销会话、停用和启用账号。强制注销会即时通知打开的房间页面返回登录。管理员自身停用受限制，管理员的游戏接口访问被拒绝。普通用户不能访问管理接口，注册入口保留admin用户名。
- 管理员可查看全部房间，强制公开、强制私密、设置或修改房间密码、强制删除房间及存档。公开会清除密码。私密且没有密码时，仅现有成员可进入，管理员设置密码后新成员可通过密码加入。房间管理使用版本检查保护并发更新，强制删除复用原有依赖数据清理与空间回收。
- 新增account_access权限表，保持users原四列结构。普通旧账号默认player。修改密码与停用账号在事务内撤销会话，登录校验再次核对最新密码哈希。创建房间、加入房间及命令提交在事务中复核会话，加入房间同时检查密码设置是否并发改变。
- 上一轮八项已同步发布，包括民愤补偿日志、蓝色放大操作区、独立移动选择、唯一损失自动处理、详细行动与战斗日志、控制者图标和界面最小化。

### 发布与验证记录

- 本地131项Node检查通过。服务器隔离代码目录125项检查通过，服务器原有测试集合比本地少6个用例，新增管理员和日志用例均在隔离目录执行。证据audit/admin-release-tests.txt、audit/admin-release-server-tests.txt。
- 四个独立网页玩家经229次正常UI操作完成六轮进入第七轮，覆盖基地、动员、移动、建造、战斗、游侠行动、进程重启及隐私隔离。单真人三人机经56次真人操作于第九轮自然结束，并验证重启续局、下一局与删房。证据audit/admin-release-four-browser.txt、audit/admin-release-bots.txt。上一轮本地十二轮整局记录保留在local-feedback-1651-bots.txt。
- 管理页面浏览器专项通过账号操作、公私密与密码设置、SSE强制注销、删除房间、刷新恢复角色与手机无横向溢出。证据audit/admin-release-browser.txt、audit/admin-browser/report.json。管理员配置脚本重复执行保持单一admin，证据audit/admin-bootstrap.json。
- 公网独立Edge会话用指定管理员账号登录，管理台显示6个账号、1个房间，新日志模块200，管理员游戏接口403，无脚本错误，随后正常退出测试会话。证据audit/admin-production-report.json、audit/admin-production.png。公网验证仅执行管理员自身登录与只读查询。
- 服务器代码备份 /opt/woodland-admin-backup-20261110/code.tar.gz。初始SQLite备份 /var/lib/woodland-rooms/backup-before-admin-20261110.sqlite，停止服务后的切换备份 /var/lib/woodland-rooms/backup-at-admin-switch-20261110.sqlite。
- 切换时users=5、rooms=1、games=0、snapshots=0、commands=2。发布后仅users增加至6，其余数量一致，integrity_check为ok，服务active。切换时没有已保存的进行中游戏。本轮没有删除线上房间。证据audit/admin-before-switch.json、audit/admin-release-deploy.json。
- 发布包deploy/admin-and-feedback-20261110.tar.gz，SHA-256为535415743b0e7262fda564fe90e6db8710d16e3fe8d60c4cf121bbb7309db407。

### 文件与后续维护

修改backend/server.mjs、backend/rules/versions/base-four.mjs及frontend/app.js、styles.css、map-controls.js、experience.js、clearing-ui.js，新增frontend/log-ui.js。管理员配置脚本tools/create-admin.mjs读取DB_PATH和ADMIN_PASSWORD环境变量，按需运行，运行后立即清除密码环境变量。该脚本会撤销admin既有会话并更新密码。

新增tests/admin.test.mjs、tests/log-ui.test.mjs，并扩展tests/base-four.test.mjs。管理UI检查tools/admin_browser.py使用独立临时数据库。前端缓存的map-controls.js、experience.js和log-ui.js随服务启动加载，更新后需重启服务。

管理入口与游戏入口相同，账号权限由登录后的服务器会话决定。[公网入口](http://103.236.93.55:233/)

