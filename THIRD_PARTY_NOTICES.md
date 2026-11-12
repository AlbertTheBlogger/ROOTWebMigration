# Third-party content / 第三方内容

<!-- Project-authored documentation: MIT. Third-party artwork and text are excluded. See LICENSE and LICENSE-SCOPE.md. -->

The root MIT License applies only as described in [LICENSE-SCOPE.md](LICENSE-SCOPE.md). This file records known origins and exclusions; it does not grant licenses for third-party content or claim that redistribution is authorized.

根目录MIT许可证仅适用于范围说明列明的项目原创部分。本声明记录来源与排除项，不构成第三方授权，也不宣称相关内容已获准公开分发。

| Content / 内容 | Origin and treatment / 来源与处理 |
| --- | --- |
| `frontend/assets/**` | Artwork and audio extracted from the original commercial game or derived from user-supplied visual references. Excluded from project MIT licensing; rights remain with their respective holders. 原游戏/参考图片美术及原包音效，全部排除。 |
| `frontend/audio-manifest.json`, `frontend/assets/audio/**` | Original-game AudioClips and their mapping; excluded from MIT. PCM conversion does not change ownership. 原包音效及映射，转换格式不改变权利归属。 |
| `frontend/asset-manifest.json` | Project mapping mixed with original-game content, including three directly extracted Vagabond ability descriptions. Entire file excluded from this grant. 映射与原作文本混合，整文件排除。 |
| `backend/data/**` | Extracted or adapted card, map, faction and tutorial data/text. Entire directory excluded. 原牌表、地图、阵营与教程数据/文本，整目录排除。 |
| `research/**` | Extracted images, meshes, localization, assembly, metadata, mixed research outputs and dependency records. Outside this MIT allowlist. 研究目录整体不纳入此次许可。 |
| Original-game text embedded elsewhere | Excluded even inside an otherwise listed source or document file. 其他文件中嵌入、引用或改写的原作文本资源也不纳入许可。 |
| `tools/research_baseline.py`, `tools/research_native.py` | Reference Cpp2IL format definitions; excluded pending provenance review. Cpp2IL's current upstream [LICENSE](https://github.com/SamboyCoding/Cpp2IL/blob/development/LICENSE) is MIT, Copyright 2020 Sam Byass. A reference is not proof of code copying; preserve applicable upstream notices if copied/adapted code is confirmed. |

Python development tools use UnityPy, Playwright, Capstone, NumPy, Pillow and their dependencies under their own licenses. Their implementations are not project-authored code. The virtual environment is excluded from Git; the previous audit is not a complete audit of all bundled binaries or transitive dependencies. There is no currently tracked Three.js distribution in `frontend/vendor/`.

使用上述开发工具不改变输入或输出素材的权利归属。未来若分发依赖环境或二进制包，须核对并随附各组件适用的许可和版权声明。
