# 剪辑转场实际预览（2026-10-15）

本批将已保存的片段级 `transitionIn` 接入真实预览，覆盖 `fade`（兼容 `crossfade`）、`fadeblack`、`fadewhite` 和 `dissolve`。只处理浏览器前端合成，不声明服务端导出、云锁或生成已完成。

## 源码证据

原文件 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。下列位置为 UTF-8 解码后的字符偏移，原脚本仅作静态读取，未执行其 bootstrap、遥测或写请求。

- `uL/uF/uj/uU`（约 437200–439000）：类型仅 trim，`crossfade` 映射 `fade`；非正/非有限 duration 使用 2 秒默认。转场窗口围绕右片段开始，最大 duration 为 `max(.2,min(10,2*left.duration,2*right.duration))`。
- `u2`（445392）：先限制在已裁剪的片段时间内，片段结束及实际来源结束前保留 `.001s`，再应用 sourceOffset 和速度。
- `f8/ge`（683036–685000）：前半段左侧向切点前进、右侧停首帧；后半段左侧停末帧、右侧向前。`ge` 以 `[start,end)` 判断活动窗口，用相邻 `1/60s` 差分求两侧实际播放率。
- `gn`（约 685000–687500）：三种基础效果使用独立 backing canvas；`fade` 将第二画面以 progress 覆盖第一画面，渐黑/渐白在中点切源并用对称 alpha 叠纯色。画面 cover-fit。
- `uX`（约 442000）：`dissolve` 是按来源亮度 `0.5+0.5*luminance` 的 WebGL burn，使用红/黄色过渡；不能替换成随机噪点或普通 alpha。

REA 对原文件副本做过静态分析，父证据 `ev_cc31296ce676614fb7009f5e5cf2f923a4b7097017f83c93b5b7dbd0ef83f639`，摘要 `ev_98b7d12bda496b44e33921567c14301ebdb7db50d87d240eaa7a16fe8047e084`。文件可解析，但语义图因 worker heap 限制为 partial；以上规则来自原字节的定向函数读取，不能将该图当作完整调用链或原站运行证据。

## 实现与验证

本篇主预览历史版本：Node24.19.0，剪辑17文件/461项、联合21文件/506项、元数据补跑4项通过；Chromium像素、GUI恢复、GPU重建及390px已验。当时435文件中434/6390通过，media-metadata suite因ENOSPC未加载；标准build也因素材复制ENOSPC失败，仅代码编译通过不能代替该版本完整检查。失败记录为 `artifacts/transition-preview-final-check.log`、`artifacts/transition-preview-build.log`，补跑/代码编译在对应专属日志。后续库/属性批次现已通过438文件/6408项完整check与标准build，见 [最新操作审计](./canvas-transition-controls-functional-audit.md)；当前源码未部署，旧433/6366和431/6353仍仅是历史快照。

- `domain/transition-playback-model.js` 只计算居中窗口、两侧 source 时钟、停帧和 progress；普通视频/音频的时间没有被转场重写，实际 sourceDuration 取当前 URL 的准备结果。
- `transition-renderer.js` 用离屏 backing surface 完成整帧再提交；WebGL 初始化失败、丢失上下文或绘制失败会阻断本次预览并显示可重试错误。shader、program、textures、buffer 和 context 按所有权释放。
- 绘制/解码失败会整体释放两路转场媒体与 renderer，保留已验证来源 metadata；重试重新创建资源，不能复用已丢失的 GPU context。真实 Chromium 主动 `WEBGL_lose_context` 后首次读取返回 false 并清除旧 pair，再次重试创建新 context、ready=true、恢复像素，预期错误与异常错误分别记录在 `browser-gpu-retry-evidence.json`。
- 播放 runtime 独立持有两路静音转场视频，在进入/切换半段/退出窗口时走现有准备事务。切源、文档退出、取消及卸载会清理媒体和渲染器，迟到结果不能显示旧画面。
- Node 24.19.0 剪辑域专项：17 个测试文件、461 项通过；覆盖纯时钟、画面合成顺序、真实 runtime 准备、单侧播放、失败/取消/卸载，以及 GPU 部分初始化失败和重复释放。定向 ESLint、Prettier 通过。
- Chromium 实际 H.264 解码与 Canvas/WebGL 像素检查：红→蓝在 progress `.5` 的 fade 为 `[127,0,128,255]`，渐黑为 `[0,0,0,255]`，渐白为 `[255,255,255,255]`；burn 在 `.75` 揭示蓝色。runtime 从 2.8 秒连续播放跨过 3–5 秒转场，无错误，dispose 后无迟到 callback 或残留媒体。
- 实际 Canvas 使用 GUI 上传、连线、时间轴拖入文件及“添加转场”，未注入 storage 或 graph：蓝/红片段在 6 秒处像素 `[127,0,127,255]`；撤销后 marker/canvas 均为 0，重做和关闭/刷新/重新打开后恢复同一画面。390×844 下转场 canvas 为 x8、宽374、高210.375，保持 16:9，右边382，ready=true。

本地可复查证据在 `output/playwright/transition-preview/`：`browser-evidence.json`、`canvas-before-undo.json`、`canvas-after-undo.json`、`canvas-after-redo.json`、`canvas-after-refresh.json`、`canvas-390.json`。素材是本批生成的红/蓝合成测试视频，只用于验收。截图接口超时，未把缺少截图记为视觉截图验收通过。

检查过程保留：首轮 `transition-preview-full-check.log` 因系统临时缓存 ENOSPC 导致拼图 suite 未加载；专用 TMPDIR 下该文件14项通过。第二轮 `transition-preview-full-check-retry.log` 有删除确认/剪贴板5秒超时及两个 fork worker启动超时，不记为通过。删除确认用例现等待两个真实懒加载模块后再冻结输入计时器，单个多阶段用例时限为15秒，原图/存储/历史断言保留。随后使用 `VITEST_MAX_WORKERS=1` 与专用 TMPDIR 的联合回归21文件/506项通过，日志 `artifacts/transition-preview-targeted-final.log`；后续因补资源失败重试而主动中止的过程保留在 `transition-preview-pre-retry-fix-check.log`；最终运行和独立构建仍遇ENOSPC，当前结果见本节开头，不能用局部通过替代。

## 剩余边界

后续库/属性面板、独立选择/删除、调宽记忆、属性双冻结视频及CSS网格预览已由 [操作批次](./canvas-transition-controls-functional-audit.md) 接入；属性预览不能复用本篇主画面的GPU burn。本文17/461和ENOSPC仅是当时主预览版本的验证，最新工程结果见AGENTS当前验证。

当前只支持 canonical `clip.transitionIn`；旧 `clip.transition` 和独立 `timeline.transitions` 仍保留 unsupported 提示。提前预热、转场期间原生字幕/HTML 的层级、真实导出和 Safari/手机触控/GPU 压力仍需继续补齐。Chromium 像素和390px布局结果不等于真机跨浏览器验收。
