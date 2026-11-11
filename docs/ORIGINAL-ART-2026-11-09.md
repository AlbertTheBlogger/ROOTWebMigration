# 原版美术提取与接入

日期 2026-11-09。本轮从用户提供的 Unity 安装目录只读提取图片，应用到网页版。

当前映射 38 种基础牌插画、4 张飞鹰领袖图、2 个阵营头像、7 类物品图标、8 个棋子与建筑图标、3 张插画和一张秋季地图说明图，共 63 个实际使用文件，约 3.76MB。

卡牌插画用于手牌与已制作牌，头像用于房间和得分栏，领袖图用于开局选择，原版棋子及建筑图标用于交互棋盘，物品图用于制作结果，注册插画用于登录页面。

秋季地图说明图带有固定的示例棋局，放在棋盘下方的参考展开区。当前交互地图继续使用提取的拓扑与网页布局。原版三维地图、模型动画、光照和完整 Unity 场景需要进一步转换和重建渲染。

## 提取与对应关系

- `tools/extract_art.py` 读取选定 bundle 的 Texture2D 与 Sprite，解析图集依赖，保留透明通道并导出 WebP。
- `defaultlocalgroup_assets_all.bundle` 的棋子精灵引用 `sharedicons_assets_all.bundle`。已加载该依赖并记录源文件指纹。
- `tools/build_art_manifest.py` 将原型名对应到原版纹理名，38 种基础牌均有图片匹配。
- `research/art/index.json` 记录所检查的图片、源文件与导出指纹，`applied-assets.json` 记录本轮使用资源。
- `frontend/asset-manifest.json` 提供网页映射。图片 URL 带内容指纹，使用长期缓存。
- 后端只提供清单内的图片路径，其他路径返回 404。

导出文件位于 `frontend/assets/original/`。该目录还包含已提取的其他备选图片，部署包按清单仅包含实际应用的 63 张图。

## 验证

73 项 Node 测试通过，包含全部清单图片的 HTTP 响应、WebP 文件头和路径白名单检查。双 Edge 浏览器通过标准开局、卡牌实际解码、制作、伏击、医院及进程重启恢复，手机视口无水平溢出。专项棋局使用临时数据库设置，操作通过正常 UI/API。

报告位于 `audit/browser-acceptance/v4/report.json`，应用效果位于同目录的 `original-art-start.png`。规则回归结果位于 `audit/art-node-tests.txt`。

## 发布

部署包 SHA-256 为 `c589ba3fbe280085d74a6889f202283dc7777b411ca7738549717fad7ebde7d1`。服务器隔离目录中 73 项 Node 测试全部通过，包含全部清单图片验证。

当前代码位于 `/opt/woodland-rooms`，旧代码保存在 `/opt/woodland-rooms-before-art-20261109`，发布前数据库备份为 `/var/lib/woodland-rooms/backup-before-art-20261109.sqlite`。

## 秋季三维场景提取进展

继续检查 `defaultlocalgroup_scenes_all.bundle`，定位秋季场景序列化文件 `CAB-80d487fff8d40b6a93ddb2ffe34a7303` 及对应 sharedAssets。

`tools/extract_autumn_scene.py` 已可重复导出 39 个 OBJ 网格、42 个材质记录及其引用的 34 张 PNG 纹理、2388 个场景节点和编号 0–11 的全部 12 个空地锚点。输出位于 `research/art/autumn/`，`scene.json` 保存源包 SHA-256、节点父子关系、原始位置/旋转/缩放、网格和材质引用。该次导出错误数为 0，39 个 OBJ 均检查到顶点与面，空地编号完整且无重复。

已确认主体网格 `msh_board_fall`、河流 `msh_river_fall`、岸线 `msh_shore` 和高地 `G_env_FallMap_Plateau`。坐标为 Unity 原始局部坐标，OBJ 坐标约定以 UnityPy 导出器为准，尚未完成网页渲染下的轴向和投影校准。

这些三维研究输出尚未加入在线资源清单。下一步需转换场景层级和材质，验证透明纹理、着色、水面及雾效果，再把空地点击区域与服务器棋局对应。当前线上交互棋盘仍为 SVG，不能将本次成功解包等同于原版三维画面已还原。

## 三维网页接入

后续已完成秋季场景的网页转换和本地验收。`tools/build_autumn_web.py` 从原场景选取 102 个可见节点，复用 16 个网格和 14 张压缩纹理。纹理限制为最高 2048 像素，合计 636734 字节，二进制网格为 447164 字节。导出时将 Unity 层级变换与 OBJ 导出器的 X 轴反射统一，12 块空地使用原始场景坐标投影。

`frontend/board3d.js` 使用本地托管的 Three.js 0.180.0，支持拖动旋转、缩放及复位视角，按需加载场景并显示百分比。交互标记显示服务器提供的猫鹰数量、建筑、木材、废墟和空位，点击后连接原有行动表单。页面提供轻量棋盘切换，WebGL 上下文丢失时自动切换。静态模型在同一标签页内复用，重新操作不会重建场景或重复下载模型。

当前使用原版场景模型与纹理，以及简化的网页材质。河流为静态着色，Unity 自定义水面、雾和动态着色尚未复现。棋子与建筑继续采用原版图标与数量标记，尚未接入原版骨骼动画。

后端仅提供三维资源清单中的文件，模型和脚本通过 gzip 传输，带指纹的模型及纹理使用长期缓存。Three.js 许可证随前端分发。

74 项 Node 测试通过。双 Edge 和手机浏览器验收通过，包括标准开局、全部 12 个投影标记点击、棋盘切换、复位视角、制作、战斗及重启恢复。验收截图和报告仍位于 `audit/browser-acceptance/v4/`。

另用 `tools/three_concurrency.py` 验证 10 个独立浏览器会话、5 个房间。每客户端模拟下载 2Mbps 和 50ms 延迟，总配置为 20Mbps。本地冷加载耗时 6.59–7.28 秒，每人三维资源实际传输 1055696 字节。合法移动后的双方计数经 SSE 更新验证通过，再次进入时带指纹的 15 个模型与纹理资源传输字节均为 0。此为本地限速模拟，公网线路的实际表现另行核验。完整报告位于 `audit/three-concurrency/report.json`。

三维发布包 SHA-256 为 `8238596839442ea584bd141b707e6fb9f459b6337919cb7fc7612481bc790a4c`，包大小 4888457 字节。发布前代码备份位于 `/opt/woodland-rooms-before-3d-20261109`，数据库备份位于 `/var/lib/woodland-rooms/backup-before-3d-20261109.sqlite`。

该发布包已部署到线上。服务器隔离目录中 74 项测试通过后更新服务，服务状态为 active，公网健康检查返回 200，所有三维资源内容指纹与本地一致。公网 Edge 浏览器加载并渲染成功，该次单客户端场景加载为 0.90 秒，传输 1055696 字节，浏览器错误数为 0。公网预览仅在浏览器内构造空棋盘验证渲染，未创建线上测试账号、房间或存档。证据位于 `audit/three-public/report.json` 和 `autumn-public.png`。真实对局入口的双端与移动端验收使用本地临时数据库完成。

## 全局总览 UI 调整

根据后续要求，棋盘铺满对局页面宽度，行动、手牌、政令和日志移到下方。移除棋盘旁的侧栏和原版参考图展开区。林地采用透明分组，按服务器 `slots` 数量显示正方形建筑格，建筑和废墟填入对应格，城堡及木材在格外显示。

补充解包原版 `T_icon_ClearingIndFox/Mouse/Rabbit`、`S_icon_Marq_HeadCount`、`S_icon_Eyrie_WarriorCount` 和 `S_icon_Ruin`。单位只显示有兵力的阵营，数量叠加在图标中央，领地类型使用原版图标放在林地内容旁。三维视图和轻量视图复用 `frontend/clearing-ui.js` 的展示逻辑。

轻量视图使用原版棋盘纹理及真实河流网格的俯视投影，12 块林地由原始世界坐标映射。三维默认视角调整为更接近俯视的总览角度。

本地 74 项测试和双浏览器验收通过。新增检查覆盖棋盘宽度超过视口的 90%、操作栏位于棋盘下方、全部建筑格的数量及实际宽高相等、建筑与废墟占位、独立单位计数及外置领地图标。桌面及手机截图位于 `audit/browser-acceptance/v4/`，其中 `overview-flat.png` 为轻量视图，`original-art-start.png` 为三维视图。

发布包为 `deploy/overview-runtime.tar.gz`，4940705 字节，SHA-256 为 `aa0c734927951516ea43840785da0bcdbfce28ab26da0ee2c471d867924f44ec`。发布前代码和存档分别备份到 `/opt/woodland-rooms-before-overview-20261109` 和 `/var/lib/woodland-rooms/backup-before-overview-20261109.sqlite`。

该布局已发布，服务器隔离验收 74 项通过，服务 active。公网核对脚本、样式及资源清单的内容指纹一致，六张新增原版 UI 图均可访问。公网 Edge 进一步检查了全宽棋盘、图标解码、12 块林地、建筑格正方形尺寸，以及猫 12 / 鹰 4 的双阵营计数。该公网预览仅在浏览器内构造棋盘，证据位于 `audit/overview-public/`，未修改线上账号或存档。
