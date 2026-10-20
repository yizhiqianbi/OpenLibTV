# VTT 字幕迁移到 HTML、失败回退与历史一致性（2026-10-18）

本批接入剪辑器中 VTT → HTML 的迁移闭环，目标是让已有 VTT 编辑继续可用，同时按原站来源契约生成可编辑 HTML。内容、账号和服务端生成不在本批范围；实现仅写当前本地工作区，未部署。

## 原站规则

静态依据为归档 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。本次没有执行原bundle，REA retained evidence精确查询为0条。相关函数的有界摘录、位置和哈希记录于 `artifacts/subtitle-migration-source-evidence.json`。

- `o7` 根据待处理来源 key、当前片段来源 key 和 `canMigrate` 选择 `discard`、`migrate` 或 `fallback`。等待异步来源时先保留 fallback track 和历史基线，来源完成后重新核对 key。
- `pi` 迁移前检查来源轨道、片段、重复实例和输出尺寸；任一 cue 丢失、重复实例内容不同、时间不能反解或渲染转换有损，整个迁移失败并保留 VTT。
- `sl` 为迁移 cue 生成稳定 ID；重复片段必须拥有相同正文、样式和时间映射。来源 VTT 的全局样式、逐词 class 和 cue settings 会传入 HTML，而不是只拼接纯文本。
- `aV` 按源时间排序、最多四条 HTML 轨道和预留轨道计算；不把超限或空 cue 静默压缩成“看似成功”。隐藏 cue、track visibility、字幕布局和字体 fallback 也属于转换结果。

## 实现

新增纯规则 `domain/subtitle-migration-model.js`：

- 以片段来源、URL、sourceOffset、速度和窗口构造稳定 source key，不包含播放头、音量等瞬时状态。
- 对重复片段建立 `sourceNodeId + sourceCueIndex` 分组；正文、textParts、settings、style、hidden 不一致会返回 `repeated-instance-conflict`。所有实例删除后才删除源 cue；单个实例删除不会丢掉共享源字幕。
- 反向计算 source 时间时允许 0.0015 秒误差，越界、跨多个候选片段或新增 cue 无法唯一归属时返回失败。新 cue 只绑定唯一包含它的非音频片段。
- 来源加载失败、取消、换文档或重试均不污染规范时间轴。`useClipSubtitleSources` 与现有 VTT reader 共用 Abort/缓存边界；失败不会被标记为可复用成功。

新增 `text/subtitle-migration-document.js`：

- 从 canonical VTT 轨道生成 HTML source-time composition，保留 clip metadata、source URL、cue text、textParts、class style、settings、全局样式、隐藏状态和可恢复 archive。
- 按原输出比例换算字号、字间距、描边和布局；系统字体保留为稳定 fallback，非系统字体保留原名字。样式 patch 只写当前字段，不覆盖其他变量。
- 转换是全有或全无；空 cue、缺源轨道、超过四轨、损坏输出和 archive 不可恢复均返回明确失败。失败时 VTT 内容和历史仍在。

新增 `text/subtitle-migration-controls.js`：

- VTT 编辑提交时先尝试迁移；来源尚未就绪时先保存当前 VTT 编辑和 pending history，不关闭编辑器或丢掉未失焦正文。
- 来源到达后仅当 source key、history、字幕 fingerprint 仍匹配才继续迁移；不匹配就清除 pending，不覆盖更新后的编辑。
- 迁移成功在同一个现有 CAS/history 事务中写入 `subtitlesHtml`，保留 VTT fallback；一次撤销回迁移前时间轴，一次重做回迁移后时间轴。迁移待处理期间的后续正文输入会合并进同一个历史入口。
- 失败时显示“字幕格式暂时无法转换，当前字幕已保留，可继续编辑”，不伪造 HTML 结果。

## 验证

纯模型与文档专项 **15项**通过，最终剪辑域与 reader 联合专项 **55文件/713项**通过，日志 `artifacts/subtitle-migration-final-joint-tests.log`。覆盖重复片段一致/冲突、时间反解、单边删除、稳定 source key、样式/语言/隐藏/轨道/输出比例、空 cue、reserved track、未知字体、来源等待/失败和真实 controller history。

实际 Chromium 使用前批 GUI 创建的短视频和隔离 VTT source 夹具，最终 `output/playwright/subtitle-migration/native-final-2.txt`：

1. VTT 工具栏可操作，编辑“迁移后的VTT正文”后实际 localStorage 出现 `subtitlesHtml`，HTML 正文和 VTT fallback 都保留。
2. HTML 编辑入口接管，VTT 选择按钮消失；同一 video DOM 保留，未捕获 pageerror 为0。
3. 一次撤销恢复原始 VTT 且移除 HTML archive，一次重做恢复迁移后的 HTML；390×844 下 `width=scrollWidth=390`。

该浏览器夹具使用本地 synthetic state 和受控 `/__qa/migration.vtt`，不是原站账号或真实运营数据；未统计所有 console/resource 输出，不能称 console 零错误。独立 context、QA 浏览器和5181服务器已关闭。

最终源码/config冻结1436份于 `artifacts/subtitle-migration-code-snapshot.json`，完整检查 `artifacts/subtitle-migration-full-check.log` session25180 **terminal exit0**：**494文件/6714测试**通过、162.70s，格式/零警告lint/架构/core strict通过，Vite3709 modules、标准build15.33s。CanvasPage902.55kB、ClipEditorWorkspace290.90kB，900kB阈值未提高，现有分包提示保留。统一证明 `artifacts/subtitle-migration-verification.json`，逐文件SHA核对无漂移；文档/MCP/diff检查单独记录。原字幕样式、旧HTML reader、L0/L1/L2和迁移各自证据分开保存，不能把迁移专项测试数量当作原站整体完成率。

## 剩余范围

真实字幕生成、服务器上传、导出、远程 remote-config、多语言专属属性、L2 转换 UI、任意 runtime、完整 VTT/HTML 降级策略、触摸/Safari、大文档和持续播放所有分支仍需继续。登录注册和小号资源按用户要求暂缓。整体工程估算仍约70%（65%-75%）。
