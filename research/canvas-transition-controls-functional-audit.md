# 剪辑转场库与属性操作（2026-10-15）

本批接入转场库、独立切点选择、属性时长与删除、两侧调宽和属性循环预览。主时间轴的 Canvas/WebGL 合成继续由 [实际预览审计](./canvas-transition-preview-functional-audit.md) 维护；本批没有接入导出、云锁或真实生成服务。

## 静态源依据

源文件 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。以下位置为解码后的字符偏移，只做静态读取，不运行原 bootstrap、遥测或写请求。中文文案另核对 `research/source/2ijgtfwpg93os.js`。

- `us/ud`（425213/426195）：非音频片段优先取主轨，按开始时间（epsilon 1e-6）、zIndex、id 排序。第一个片段选后方切点，其余片段选前方切点；存在主轨候选时，选中其他轨返回not-main-video；没有主轨候选时，显式片段选择可使用us的全部视频回退。音频、失效ID和多个片段分别阻断。没有选择时，仅在当前时间命中实际主轨片段后解析，不能在没有主轨时随意使用叠加轨。最后片段末端包含在命中范围内，范围外不能借用最后片段。
- `uM`（433874）：库宽默认 372、属性默认 300，最小均为 220；指针捕获、RAF 合批、pointerup 末位与键盘每次 8px 调宽。原 widthRef 保留关闭/重开宽度，本机按当前编辑会话保留，不写入文档。
- `uE/uP`（约 436000）：默认 2 秒；库只显示淡入淡出、黑场过渡、白场过渡。`dissolve` 不在库中，已有数据仍可选中、预览、调整与删除。三张 960×960 动态 WebP 已从既有研究归档恢复到 public，来源/映射仍在 `research/assets.json`，没有重新采集。
- `u$/uF/uU`（约 437900–438287）：属性先保留一位小数，再经过正数默认值规则，最后限幅到相邻片段的 `max(.2,min(10,2*left.duration,2*right.duration))`。因此 0、负数、非有限值或舍入后为 0 的值回默认 2 秒；正数 0.1 才限到 0.2；0.86 为 0.9。不能把所有非正输入直接变为 0.2。
- `u1/u2/u5/u4`（444984–446473）：属性 tile 与主画面合成不同。两路原生视频停在切点前 0.2 秒及右片段起点，按源 sourceOffset/speed/裁剪范围换算并以实际媒体时长限幅；1600ms 循环、40ms 更新，tile 高 90px。fade 的两个 DOM 层分别为 `1-progress` / `progress`；黑/白为半段换图及对称覆盖；dissolve 使用固定 32×18 的 SVG reveal/burn 遮罩和 screen 渐变，不使用主预览的 GPU luminance-burn。
- `mg/my/mv/mx/mk`（579589–582111）：工具栏只切换库，不直接应用默认效果；应用效果保留已有时长，清片段选择/cropRange，选中切点并 seek 到 cutTime；删除只处理所选转场。属性 f2/f5/f4 与实际面板位于 681895–约 703000。

## 本机接线

`domain/timeline-edit-model.js` 修正中间片段的切点目标，并提供显式 rightClipId 的更新/删除和共享属性数值规则。`useCanvasClipEditor` 持会话级面板/切点选择；编辑通过既有 CAS/十步历史，选择、开关面板和调宽不制造内容历史。删除转场不删除片段；失效属性回调不得改写后来选择的切点。

`ClipTransitionWorkspace` 只承载库、属性和两侧视图；外层媒体宿主及主预览身份保持稳定。属性纯规则在 `domain/transition-inspector-model.js`，两路媒体、冻结帧准备、循环、隐藏页/reduced-motion、取消/失败/重试和释放在 `transition-inspector-runtime.js`。与主 runtime 共用 `native-media.js` 的可取消原生读取，不另建音频时钟。失败不制造画面，不影响主时间轴的实际错误状态。

面板是外层剪辑 dialog 内的 non-modal 子层，通过 `registerDialogChildDismissal` 处理逐层 Escape 和回工具栏焦点，不增加 body 锁。窄屏采用上下预览/两列可滚动面板，是明确的本机布局适配，不称原站手机布局已核对。服务、文档、只读和会话失效仍由已有 owner 协议门控。

## 实际验证

最终工程验证：Node24.19.0完整 `npm run check` exit0，**438个测试文件/6408项全部通过**，18:07:13开始、测试399.93s、标准生产构建21.43s。格式、零警告lint/架构边界、核心strict全部通过；日志 `artifacts/transition-panels-validated-check.log`，滚动入口 `artifacts/current-full-check.log`。检查期间记录的1291份源码/config SHA至结束一致；最终CanvasPage876014字节、ClipEditorWorkspace69110字节，900000预算未提高；三张原封面存在标准dist中。统计包含独立影游，strict不覆盖全部JSX，CI未远端执行，源码未部署。

含宽度关闭/重开回归的最终剪辑专项20文件/475项通过，日志 `artifacts/transition-panels-final-targeted.log`。此前源规则修正快照20文件/474项与零警告lint单独保留在 `artifacts/transition-panels-source-corrected-tests.log`、`artifacts/transition-panels-source-corrected-lint.log`。完整检查后仅维护文档并复查格式。

Chromium 真实 GUI 从项目页创建项目、上传合成蓝色视频、原生标题拖动/端口连接、打开剪辑、点击刻度拆分，再操作库和属性。未注入 graph/storage。最终源规则实测：

- 三封面真实解码 960×960，桌面显示宽 100px；tile 实际高 90px，两视频 readyState=4、muted，分别停在 2.8 / 3 秒；两层 opacity 随循环变化。
- 输入 0 后为 2 秒；输入 0.1 后为 0.2 秒。先前中间版本把 0 当作 0.2 的截图/日志不作为最终规则证据。
- 键盘 ArrowLeft 将库宽 372→364；最终原生 pointer 拖动 372→332，ARIA 同步为 332。pointerup 末位、取消和卸载按同一捕获/清理生命周期收尾。
- 390×844 页面 scrollWidth=390，面板 x8/199、宽183、右边382；内容可内部滚动，原生点击下方删除、撤销及 Escape 均可操作。主 dialog 保留，Escape 回工具栏；没有新增浏览器 error/warn。
- 源规则修正前、同一历史/CAS 接线的 GUI 已验证效果切换、0.86→0.9、按钮/键盘删除只移除 marker、撤销/重做、关闭/刷新/重开。最终源规则版本又复验窄屏删除/撤销/回焦点；持久化和历史另有 controller 回归。不能将立即读取 autosave 尚未到期的旧 storage 当作删除失败或即时落盘证明。

证据位于 `output/playwright/transition-panels/`：最终 `corrected-*` 优先，`fresh-*` 是属性数值/渲染修正前的过程记录。旧 5173 服务忽略 public 的新增文件，曾将恢复的封面返回 HTML；独立新服务 5181 已验证真实图片并完成最终操作，用户 5173 未被停止。首轮 CDP 文件拖入打开了文件标签，随后仅用合法 GUI 拆分视频完成验收；不把该次拖入记为通过。热更新期间的面板退出/一次旧会话冲突与定位超时也不作为成功证据，最终重新开窗后单独复验。验收浏览器及本批 5181 服务已关闭。

首轮全量（属性源规则修正前）：437 文件中 436 通过，6403 项通过，脚本视频配置一项 5000ms 超时；原文件/断言/时限独立复跑 17 项通过，日志 `artifacts/transition-panels-full-check.log`、`artifacts/transition-panels-script-recheck.log`。当时独立标准 build 通过，仅对应当时源码。后续发现属性预览/数值规则与宽度记忆差异，主动中止的检查日志保留，不能称为当前完整通过。

## 剩余范围

提前媒体预热、全局字幕/HTML 层级、波形/WebAudio 多轨、真实导出和协作、Safari/真机触控/GPU 压力仍未验收。已接入转场库/属性不能据此称整个剪辑器或原站功能全部完成；本批源码未部署，整体进度仍是约70%的工程估算。三张恢复封面共5,769,334字节；未来部署仍须重新按90MB目标/95MB上限生成代表性prebuilt，不能沿用旧部署体积报告，也不裁剪原public。

等待最终检查期间只读发现的字幕/文本轨道契约记录在 [下一批源审计](./canvas-clip-subtitle-controls-source-audit.md)，不计为新增字幕功能完成。
