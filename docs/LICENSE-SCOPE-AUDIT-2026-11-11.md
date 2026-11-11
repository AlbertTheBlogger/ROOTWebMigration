# 开源许可范围核查

<!-- Copyright (c) 2026 AlbertTheBlogger. Project-authored documentation: MIT; third-party artwork/text excluded. See LICENSE-SCOPE.md. -->

核查日期：2026-11-11（Asia/Shanghai）。基线提交：`98a939015b1b68b6c3e128d53fff44b143e6e3b5`，共1902个Git跟踪文件。本报告及配套清单是核查产物，不构成许可证、权属证明或原权利人的授权。

## 后续适用决定

维护者随后明确：美术与游戏文本资源全部不视为原创；前端表现、用户交互、玩法逻辑适配与重构、工程文档和AI玩家的项目自编部分视为原创。现已按[应用记录](MIT-LICENSE-APPLICATION-2026-11-11.md)对限定范围添加MIT，具体以[逐文件许可清单](MIT-LICENSED-FILES.json)及[范围说明](../LICENSE-SCOPE.md)为准。以下原核查结果和CSV哈希保留为实施前证据，不能用来判断添加许可后的文件哈希或当前授权状态。

## 结论

本项目可以划出“有权许可的自编程序表达”作为开源许可候选范围，但不能将整个仓库笼统标为自编代码。按现有来源证据，65个程序文件和10个配置/依赖清单文件可列为候选；2个研究脚本需额外核对上游参考来源；6个运行数据文件属于混合内容；330个前端美术文件和1470个研究输出应暂排除在项目自编代码许可之外。另有19个文档文件，需要区分项目自撰叙述与原作引用。

“候选”指文件用途、结构、导入和项目记录支持其为本工程实现，不能理解为已证明全部原创、可不受限制再许可。规则、名称、文案及提取数据也可能嵌在代码中，授权应限定为有权许可的原创表达。

## 方法与证据边界

- 枚举全部跟踪路径，生成分类、文件逻辑大小和工作区原始字节SHA256清单：`LICENSE-SCOPE-INVENTORY-2026-11-11.csv`。哈希未做Git换行规范化，可能与克隆后工作区不同。
- 检查项目入口、规则实现、前端模块、所有Python文件的AST导入、资源构建脚本、来源字段、原美术/教程研究记录及上游引用。
- 对源码和混合运行数据，扫描原中文本地化中长度至少16字符的完整值是否原样出现；这不是近似文本或代码相似性鉴定。
- 核对本机主要Python包的已安装版本元数据。未对全部传递依赖及其捆绑二进制做完整许可证审计。
- Git历史始于v1.1基线，无更早的逐步开发历史或完整生成记录。没有对全部外部代码库进行相似性比对，也没有逐段证明作者、AI辅助内容的权属或所有贡献者的许可权限。
- 未发现项目当前跟踪的第三方库源码目录或现存第三方版权头，不足以证明不存在未标注的复制。历史文档中Three.js曾分发的描述不能当作当前依赖事实。

## 文件范围

| 分类 | 数量 | 范围与处理意见 |
| --- | ---: | --- |
| PROJECT_CODE_CANDIDATE | 65 | 程序实现候选，仅许可有权许可的原创部分 |
| PROJECT_CONFIG_CANDIDATE | 10 | 配置、部署示例、依赖版本清单候选，不包含依赖本身的授权 |
| UPSTREAM_REFERENCE_REVIEW | 2 | 研究解析器有明确Cpp2IL格式参考，须确认引用/改写程度 |
| MIXED_DATA_REVIEW | 6 | 5个backend/data JSON及frontend/asset-manifest.json，暂不整体纳入 |
| THIRD_PARTY_ASSET_EXCLUDED | 330 | frontend/assets下的图像资源，暂排除 |
| EXTRACTED_OR_MIXED_RESEARCH_EXCLUDED | 1470 | research下除依赖清单外的研究输出，暂排除，不表示每项均具有版权 |
| PROJECT_DOC_MIXED_REVIEW | 19 | README、工程文档、进度安排；自撰说明可单独许可，引用另计 |

### 自编程序候选的具体范围

- `backend/server.mjs`：HTTP、账号、会话、房间、事务、SSE、文件服务及人机调度。
- `backend/engine.mjs`、`backend/rules/effects/queue.mjs`、`backend/rules/versions/*.mjs`：规则状态机、合法行动、效果队列、隐私投影与版本路由。实现规则并不等于拥有原作规则或文本的权利；内嵌文案另行核对。
- `backend/tutorials.mjs`：教程状态、场景初始化、目标检查与进度恢复程序；不自动包含教程目录文本或原教程内容。
- `backend/bots/test-policy.mjs`：项目人机策略。
- 前端7个文件：`app.js`、`map-controls.js`、`experience.js`、`clearing-ui.js`、`log-ui.js`、`styles.css`、`index.html`。许可可覆盖布局与交互代码，不延伸至其引用或展示的原图、角色说明、名称与商标。
- `tests/`的21个文件：项目测试与辅助代码；测试中的提取数据引用、规则表达及未来外部夹具仍需区分。
- `tools/`的26个文件（排除下述2项待核对脚本）：提取、转换、研究及浏览器验收程序。工具自编代码与其输入/生成内容的来源不同，不能因使用自编转换工具就将输出认定为自有素材。
- `scripts/backup.mjs`：项目数据库备份程序。
- 10个配置候选：`.dockerignore`、`.gitattributes`、`.gitignore`、`Dockerfile`、`compose.yaml`、`package.json`、`start.ps1`、`deploy/REMOTE.md`、`deploy/nginx.conf.example`、`research/requirements.lock.txt`。其中`deploy/REMOTE.md`是部署叙述文件，归入工程配置资料，不代表附带的历史数据或引用可随意许可。

### 需额外核对的上游参考

`tools/research_baseline.py:12`明确参考Cpp2IL metadata定义；`tools/research_native.py:146`明确参考Cpp2IL的Il2CppCodeGenModule布局。当前看到的是Python解析实现与格式参考，未取得足够证据判断是否复制了受保护的实质代码，也不能仅凭引用链接认定抄用。

Cpp2IL当前development分支的[LICENSE](https://github.com/SamboyCoding/Cpp2IL/blob/development/LICENSE)为MIT（Copyright 2020 Sam Byass）。如果确认包含其代码或实质改写，应保留适用的上游声明和许可证，不应统一署成项目原创；仍应尽可能锁定实际参考时的提交，不能以当前分支代替历史版本证明。

## 已确认的混合与第三方内容

1. `frontend/asset-manifest.json`不仅是URL清单。`characterDetails`中的3个角色说明，分别与原本地化的`root.vagabond.ranger.ability.text`、`root.vagabond.tinker.ability.text`、`root.vagabond.thief.ability.text`完全匹配。`tools/build_art_manifest.py:51`直接读取原本地化文本生成这些字段。这是实际来源证据，不宜将整份JSON当作原创数据许可。
2. `backend/data/base-card-catalog.json`、`full-card-catalog.json`含原牌表名称、数量和成本及来源哈希；`fall-map.json`含静态提取地图数据；`four-faction-catalog.json`由任务、民意轨道等研究输出生成。格式设计、事实性数值、选编与原作表达须分别评估，暂不整体赋予项目许可证。
3. `backend/data/tutorial-catalog.json`五章39个节点全部有`sourceKeys`，工程记录说明参考原教程后适配、改写。较长原本地化字符串的完整值扫描未在该文件命中，但这不排除改写或衍生表达；其程序结构和自撰教学内容可以进一步拆分核对。
4. `frontend/assets/original/`、`board/`、`suits/`共330个文件。美术提取记录、构建脚本和用户参考图来源支持其为原游戏或参考素材的转换产物。缩放、裁剪、改名、转WebP不证明取得再许可权。
5. `research/`中原图、OBJ、场景二进制、本地化、资源树、反汇编、元数据与混合分析输出，不应因文件是JSON/TXT/脚本生成物而自动认定原创。暂排除整个研究输出集合是保守的范围划分，不是对每一项是否受保护作法律裁定。

## 依赖与运行时

`package.json`没有第三方npm依赖。检查到的Node模块导入为内置模块或项目内部模块，前端HTML只加载项目脚本/样式；`frontend/vendor/`没有Git跟踪文件，当前未随仓库分发Three.js。Node运行时不属于自编代码。

Python工具直接使用的主要外部包如下，按本机安装包元数据记录；不是完整第三方声明清单，也不对其整个分发包的捆绑组件给出统一许可结论。

| 包 | 本机版本 | 元数据所示许可 |
| --- | --- | --- |
| UnityPy | 1.25.4 | MIT |
| Playwright | 1.64.1 | Apache-2.0 |
| Capstone | 5.0.6 | BSD类别；具体条款/组件需查随包许可 |
| NumPy | 2.5.4 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| Pillow | 13.0.0 | MIT-CMU |

`.venv`未入库。导入这些工具包不等于把它们的源码变成本项目原创；以后若分发工具环境、浏览器或二进制，需要单独核查全部依赖与其声明。

## 后续应用许可证的建议

1. 对上述候选范围核实可许可者及现有贡献来源，特别是上游参考与AI辅助生成的片段。静态扫描不能代替权属确认。
2. 若添加标准LICENSE，保持其正文完整，并在独立范围说明中明确：仅适用于项目有权许可的原创代码；列明混合内容和第三方资源排除项。不要写“整个仓库全部MIT”。
3. 对角色能力说明、教程文本、牌表、地图与素材分别记录来源、授权状态。项目许可证排除这些内容不等于解决其公开分发权限。
4. 若决定移除未经核实的原始资源，应另外评估既有公开Git历史；仅删除当前分支文件不会移除历史副本。本轮没有删除、重写历史或更改仓库可见性。

参考：[GitHub许可说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)、[Open Source Guides法律与第三方内容说明](https://opensource.guide/legal/)。[美国版权局对思想、系统与具体表达的区分](https://www.copyright.gov/help/faq/faq-protect.html)仅供概念参考，不作为对中国或其他司法辖区的法律结论。

本轮仅新增核查资料并更新交接，不修改产品程序，不添加LICENSE，不宣称原游戏或第三方代码的版权属于本项目。
