# 剪辑器普通文字入口与预览（2026-10-15）

后续已接普通文字背景/动画、应用到所有与source属性区段；像素换算/两位小数及行高百分比也已按直接源纠正。见 [高级属性验收](./canvas-text-advanced-functional-audit.md)。下文449/6468和“仅两个tabs/背景动画仍缺”为前批冻结范围，不覆盖后续源码；自定义script/完整字体预设/HTML字幕等边界继续保留。

本批将前批的普通文字 HTML 协议接入实际 App：工具栏、右侧属性面板、独立文字轨、同一历史/CAS/保存边界和双 iframe 预览。基础正文、布局与文字样式已可操作；这不是完整 HTML 字幕或全部高级文字工具的验收，也没有发布线上。整体估算继续约70%。

## 直接源依据

沿用已归档公开客户端 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`；仅读源码，不运行原站 bundle、脚本、遥测或写请求。

- `ph` 约619000和`sh` 383396：文字工具按实际播放位置进入，命中既有 cue 时选择，多个轨道不明确时要求选轨；新增走 `iZ` 的30fps向下取整、3秒/最少0.1秒与同轨 forward 空区间。
- 约411000的普通文字属性面板为右侧“文本样式”，正文两行、删除/关闭、“默认样式”入口及属性 tabs；左侧预设库约397912，按需打开、搜索/分类与两列卡片。当前实现正文/布局/文字两个 tabs，尚缺背景/高亮/动画。
- `ul` 425042 的缺省预设目录为空；约632217/634000是远端配置、字体目录、mainland语言与预览资源的另一套完整协议。当前可注入只读 `{categories,presets:[{id,name,categoryId,fields}]}` 小接口，只承接已实现的样式字段，不能称原 remote-config adapter 已完成。默认按真实空目录回退，没有制造六个VTT预设冒充它。原 `data-libtv-text-preset-id` 的应用/手动样式清除见约385622、611286及617601。
- `oA` 343408/`lq`325620/`lX`326899：隐藏帧准备成功后交换、revision隔离、5秒/3次/400*n退避、字体/图片/视频可读及按实际宿主时间 seek；timed元素使用±0.001边界并检查 cue/track hidden。源有自定义运行时与脚本动画，当前仅实现 scriptless v4 timeline 宿主，未冒充原脚本已运行。
- `rb`227316与`rm`227075：封闭CSP和iframe自身dark颜色方案。当前预览克隆移除 script、事件属性、嵌套可执行入口及外部stylesheet，只允许明确资源来源。原始文档保留，预览不执行其中脚本；此类动画有明确能力提示。
- `og/oy/ok/oI`336788–342481：文字轨组与普通字幕的顺序、groupAnchor和stack层级。当前读取实际文字行，按anchor与已有单行VTT上下排列；完整连续重排、4/8临时新行和跨容器拖轨仍缺。

## 工程与数据边界

`text/document-model`持文档投影、手势计划与样式读写，`text/controls`持当前编辑会话动作，`text/useTextTools`管理读取/取消/超时/重试，`text/ClipTextWorkspace`管理面板。`text/preview-runtime`独立拥有双iframe、资源准备和seek，`services/clip-text-source`仅只读传输。DOM与HTML协议留在lazy workspace；主controller只持小动作契约、所有权、历史和保存，不增加services→feature或domain→UI反向依赖。

正文和数值字符串先保存在同一UI草稿；预览/全图保存投影同一个HTML，blur或下一动作才按原十步历史/CAS提交。数值保留合法小数，不能按input step取整。删除只删文字cue；最后一条删除仍保留有效composition，不删除视频。拖动/裁边使用一次事务，Escape取消；任意自动保存读取进行中手势时，保存原时间轴，防止中间值漏入存储。

其他画布操作会把精确的末次草稿投影进raw graph；controller现在允许仅对这份精确相同的投影更新CAS基线，保留编辑前时间轴以便一次撤销。不同外部时间轴继续触发冲突/副本恢复，不能用宽松比较吞掉并发变化。异步SHA新增后重新验证owner/同一timeline；切文档后的迟到结果不写入。

inline优先，URL读取不直接改raw，15秒超时、失败保留原文档；retry/切源/切文档/卸载中止请求，异步回调用捕获的会话动作。HTML加载或预览准备未完成时阻止开始播放。原始自定义脚本/stylesheet只保留，不以静态回退声称动画完成。

文字内容/计时/受控inline样式修改，在结构和资源不变时更新当前iframe，不重建视频或文字frame。新增/删除元素、CSS或资源变化走隐藏buffer准备，成功seek最新时间后交换，取消或迟到buffer不能覆盖新内容。VTT与转场继续使用各自renderer。

原生连续播放还发现既有的转场边界自取消：prepare已进入新时间，状态回调重渲染的旧UI时间被update误当新seek，重复退回切点前。现在比较新旧controlled输入时间，状态回传不取消操作，真实改变输入仍seek；单元回归与实际0→转场→3.1秒文字退出已复验。

## 当前验证

最终Node24.19.0完整 `npm run check` session7031 terminal0：**449文件/6468测试全部通过**，20:37:21开始、测试1741.02s（setup统计1463.71s）、标准build16.38s；格式、零警告lint/架构与核心strict通过。日志 `artifacts/clip-text-ui-full-check.log`、滚动入口 `artifacts/current-full-check.log`，1340源码/config指纹未变。Canvas893988字节低于900000预算，ClipWorkspace126343字节；未抬阈值、未改manualChunks。strict非全部JSX、CI未远端执行、本机未部署。前批445文件/6450测试只验HTML基础协议。此前两次完整检查为主动停止：`artifacts/clip-text-ui-before-narrow-check.log`（补单独右侧面板的窄屏宽度），`artifacts/clip-text-ui-before-clock-check.log`（修复原生连续播放揭示的边界自取消），均terminal143，不作通过。

最终剪辑专项29文件/533项通过，日志 `artifacts/clip-text-ui-targeted-validated.log`。首轮新手势测试暴露自动保存投影中间值，修复后保留原断言复验；精确草稿投影回归单独通过36项。播放回归首次测试mock把真实新seek也强制回0，修正为回传当前controlled输入后保留两分支强断言。日志 `clip-text-ui-new-targeted.log`、`clip-text-ui-projection-regression.log`、`clip-text-ui-clock-regression.log`和最终联合日志均保留，不将中间失败算通过。运行中的完整检查没有因为观察超时重启，最后实际terminal0才记录成功。

新测试覆盖真实GraphActions/Drafts/Autosave里的正文/小数、pagehide/Quota保留、精确投影重定基线且撤销回原文、手势中间值不保存、取消、owner切换和迟到SHA。UI覆盖最后cue空态、原始数值草稿、按需目录/错误重试/分类搜索；source hook覆盖Abort/超时/重试/迟到结果。preview runtime覆盖封闭克隆、真实cue可见性、双buffer迟到结果、inline更新不重载、失败重试与卸载。播放回归保留controlled时间的新seek分支。

Chromium实际App使用此前经GUI创建的视频/剪辑项目，没有注入节点或假ready：

- 正文连续输入与字号17.625保持焦点；未blur立即刷新恢复两者，`refresh-last-input.txt`。较早原生操作曾触发精确投影误判冲突，已修复并回归；不隐去这一过程。
- 100px/秒下，鼠标移50px使普通文字0–3变为0.5–3.5；撤销回0–3，重做后右裁40px为0.5–3.1。Escape取消再移40px仍0.5/2.6；隐藏轨道在实际iframe变hidden。证据`drag-after/drag-undo/trim-after/cancel-hide.txt`。
- 原生选中cue后Delete，最后项空态安全，两个视频仍在，两次撤销恢复文字；`last-delete-undo.txt`。首次仅focus一个已关闭属性面板的cue便按Delete未执行，保留`last-delete-before-select.txt`，随后按真实click选择流程重验。
- 默认空预设库、搜索及逐层Escape焦点；390px布局/X20.125与逐层回焦；`escape-focus.txt`、`narrow-layout-focus.txt`、`narrow-full-inspector.png`。390布局是本机适配，不能推断源手机页面或真机触控已核实。
- 原生实际连续播放先显示0.5–3.1文字，再跨过转场并在结束边界隐藏；`native-clock-fixed.txt`与`native-playing-fixed.png`。修前超时与现场读取保留`native-clock*.txt`、`clock-timeout-readback.txt`。
- 3秒切点的实际转场/文字/VTT层级与sandbox读取为`transition-stack-readback.txt`；桌面图`desktop.png`、`transition-text.png`。此前编辑期间增加hook导致开发HMR旧实例报hook序改变，cold reload后复验，不能把这段开发日志称零错误。

上述文件位于 `output/playwright/clip-text-ui/`。不把注入式runtime单测当作真实字体/媒体/原始动画全部验收。

## 剩余范围

source时基HTML字幕、片段绑定/克隆/重映射、背景/对齐/斜体/高亮/动画完整协议、原始运行时、完整远端预设与字体目录、CSS注入等级/锁定属性/输出比例换算、预览内几何操纵、连续轨道重排/新增、WebAudio/波形/帧缓存和真实导出继续有缺口。只读source与可注入组件测试不代表这些功能已接App。真实生成、费用、锁/协作与运营写服务仍未接；登录注册、小号和账号资源继续暂缓。真机/Safari/跨浏览器、高DPR与大图性能仍另验。
