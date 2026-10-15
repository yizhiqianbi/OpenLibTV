# VIDEO_CLIP 节点与编辑器源码审计

2026-10-14。原站调查仅审阅已有公开归档，不登录、不采集新内容、不执行原 bundle，不写原站；随后按授权新增本机输入与播放纯模型。本文为专属节点实现的证据合同；源码调研、纯模型测试与实际 UI 验收分别记录，不能互相替代。

## 可复核证据

普通静态摘录在 [canvas-clip-node-source-proof.json](../artifacts/canvas-clip-node-source-proof.json)：10 个原归档文件、47 段摘录。每段包含原文件 SHA256、UTF16 code-unit、Unicode code-point、UTF8 byte 三组半开区间及摘录 SHA256，47 段均逐项核对。14 段沿用 [先前 41 段证据](../artifacts/canvas-clip-renderer-next-proof.json) 的原文与坐标，附引用；旧证据未覆盖。生成脚本只读取文本，不导入或执行原脚本。

对 4 份字节一致的本地副本进行了有界 REA 静态分析，副本总计 3,723,706 bytes。输入 SHA 与源对应表见 [REA 输入清单](../artifacts/canvas-clip-node-source-rea-input-manifest.json)，保留摘要与 module page 的完整 Evidence 见 [REA Evidence](../artifacts/canvas-clip-node-source-rea-evidence.json)。

| 类型                  | 标识及范围                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| retained parent       | `ev_9b0d86a42e76eff19a91b0c2b2f4db94f2d0d4a51aa33f18aaea474aacba896f`                                                                                               |
| retained summary      | `ev_4e9b428c4a203555e70b1d68530d317b385a9f7c94adee58dad3726507786fd7`                                                                                               |
| retained modules page | `ev_45f5cfae06c39adf00d4ed50940f84c7c7e9ef5459b6ccab18311bb516d2ae55`，7 个条目，分页已耗尽                                                                         |
| 解析结果              | 4 files、1,016,168 AST nodes、0 parse failures、56 findings                                                                                                         |
| 明确限制              | application partial；semantic partial/truncated；100,000 semantic-node ceiling；大 editor 文件语义 heap limit，Canvas 剩余结果预算受限；Turbopack bundled modules 0 |

REA 证明这里只进行静态解析并保留其限制。它未恢复完整 Turbopack 模块图，不能据其缺失条目推断组件不存在或入口不可达。下面的具体数字 module ID、函数与 JSX 合同来自可重读的普通文本摘录，不冒充 REA retained 调用链结论。

## 节点注册与数据来源

原 `3u6hjewm8qox_.js` 的 module 272776 注册 `video-clip: wrapSelfVirtualizing(dN)`，`dN.displayName="VideoClipNode"`。dN 是该 module 的内部 renderer，不是另造的独立导出。

`useIncomingNodeData` 是 `1q5w-zbtkz5ka.js` 的 module 184656，实际调用 `0leiedr1esdbe.js` module 417754 的 `collectIncomingNodeDataForTarget(nodes, edges, id)`。它的 cache key 与比较只控制刷新，不另排序。原 collector 有以下重要边界：

- 按 edges 原顺序读取 target 相同且没有 `portraitVirtual` / `assetVirtual` 的源。缺失源忽略。只使用 `node.data.type` 判断普通源类型，不借顶层 `node.type` 补全；video-clip 的输出不是普通 video 输入。
- 组类型为 `group`、`video_group`、`video-story`，且 `characterAsset` 不存在。按 nodes 原顺序建立 parentId 子列表，深度优先展开，最多 8 层；被排除的后代计入 visited，直接输入的顶层源不按排除列表剔除。只有输入存在可展开组时才去重，普通重复边保留重复输入。
- URL 第一项 `?? ''` 原样保留，不过滤空项，不将第二个 URL 提升为首项，不过滤 blob/data。dN 的 `videoList[0]?.url` 因此可能为空，即使后续还有可用视频。
- 媒体 label 为 `data.name || data.label || undefined`，不 trim。text content 的字符串转换为单项数组，数组只保留字符串，保留空字符串；text 条目不添加媒体 label。
- metadata 仅取源节点顶层 `resourceMeta.items[0]`，kind 匹配时透传相应 width / height / durationSec；不使用图节点盒子作为视频 metadata。
- 图片存在 hidden/watermark protection 时使用 `url`；否则非空 originalUrl 优先。视频/音频各自资产字段、豁免标记及视频字幕、首个合法 transition 保留原规则。
- 字符引用图片另从所有 incoming edges 追加，随后追加目标 refImages。目标 focusRegion.nodeId 最后过滤 imageList。普通 video/audio 列表不受该图片过滤影响。

244434 的 editor wrapper **再**过滤 truthy URL，按同一 filtered 顺序形成 URL / sourceNodeId / trim 后 displayName 数组。这个过滤属于 editor projection，不能提前用于 dN 原 incoming 列表。source poster 按首视频条目的 nodeId 查询该源 `data.poster`，不使用第二项 ready 视频的 poster。

## dN 状态、尺寸与交互

精确变量：输出 `N=!!(data.url??[])[0]`，首输入 `E=!!videoList[0]?.url`，当前编辑 `$=editingClipNodeId===id`，内嵌节点预览 `W=$&&!editingClipPreviewExpanded`，Agent active `K`，pending `Y`，busy `q=Y||K`。Busy 且正在编辑时关闭匹配 editor 并解锁。

| JSX 条件             | 可见内容与门控                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| W                    | 仅 `clip-preview-drop-${id}` portal 容器；nodrag/nopan，pointer-events auto                        |
| !W && N              | dw 完成视频输出预览；编辑按钮 readonly 为全局/节点 readonly 或 q，当前编辑使 hover previewDisabled |
| !W && !N && !K && E  | dC 首输入预览；编辑 readonly 为全局/节点 readonly 或 Y                                             |
| !W && !N && !K && !E | dk 空态/预设；readonly 只使用全局/节点 readonly，pending 不等于 active，不擅自禁用全部预设         |
| !W && K              | dy Agent 运行层，可与已有 dw 输出共存，hasContent=N                                                |

不能把这些条件压成互斥的“输出/运行”优先级而丢掉运行 overlay。生成器显示为 `baseShouldShow && !$ && !q`；base 来自 module 464025 的单选或 reference/mark/focus targeting 规则。

module 713118 常量 NODE_WIDTH=350、NODE_HEIGHT_EMPTY=350。实际 content 尺寸：

| 条件          | width × height                           | radius |
| ------------- | ---------------------------------------- | ------ |
| W             | 350 × `(data.embedContentHeight ?? 260)` | 12     |
| !W && E && !K | 566 × 350                                | 16     |
| 其他          | 350 × 350                                | 12     |

pending 不改变上述尺寸。content 为 relative，背景 `var(--Surface-secondary-background,#262626)`，1px canvas-node-border。W 外壳有 2px primary border 与 14px radius。label 为 `name || label || 默认文案`，title PlayIcon 14px。shared NodeShell 是 module **710871**，尺寸交给 contentStyle；标题独立浮在 top:-28px，不能把标题高度加进 350。source dN 还在有输出、非 W、非 taskGenerating 时呈现右上下载入口，不能用泛型任务布尔值替代。

648686 的 `useNodeReadonly` 是全局 isReadonly OR node collaboration readonly。959248 的 taskGenerating 仅 strict `loading===true` 且 status 非终态（或 null/undefined）；182004 将有限数字或非空可转有限数字的字符串规范化，终态为 2/3/4。pending 713588 为独立 boolean map，mark 重置 60s timer；688111 active 为 running 且无 number startedAtMs 或距离小于 1h，refresh delay 为剩余时长+50ms，不能擅自替换为通用任务超时。

## 四态的真实呈现

dC 输入预览：padding8、上方图像预览 252px、圆角16、object-cover、opacity0.8；poster 优先于 snapshot，failed URL Set 阻止重复失败，两个地址变化时重置；均不可用时显示 muted/playsInline/preload=metadata 的原 video。下面是 82px **装饰性** miniature timeline，aria-hidden、0/2/.../22 刻度与两条轨道，不能把它当成已完成的交互 timeline。白色编辑按钮 height32。

dk 空态：padding32、gap16、居中、40px 图标，源 emptyHint 文案；没有 modeKey 时呈现预设选项，已选择则隐藏。idle warm 的 callback timeout2000 或 fallback300ms，卸载取消。570671 图标 override 使用 IconifyIcon；fallback 为 scissors、talkingVideo UserRound、productUrlAd CopyLink、explainerVideo AudioLines、batchAd LayersF、smartMixCut Grid3x3，默认14×14。没有原证据时不能用通用 emoji 代替。

dw 输出预览：hover 300ms 后、没有连接拖动且 previewEnabled 时才 acquire pooled video；selected 单独不会启动实际 video。video 使用 object-contain、playsInline、preload metadata、自定义 controls，loadedmetadata 后 opacity 从0到1（300ms）。时间/播放/暂停/结束监听随当前媒体释放；结束回 currentTime0。readonly 仅禁止编辑，播放/seek/volume 可操作。默认 muted 为 volume 未定义或0，默认音量0.5；严格 hasAudio=false 隐藏音量。source 不为这个输出分支增加 dC 的 image error fallback。

983802 的 pool 按 nodeId 复用 native video；release pause→idle，逐批 trim，淘汰时 remove src/load。初始化 muted/playsInline/preload/object-contain。内存池 MIN4、设备低内存 MAX15 否则30、ratio0.5、一次evict3、cooldown30s。重建本机生命周期时还须防止跨文档相同 ID、迟到 event 与卸载后 timer 影响新节点；这些是本机维护适配，不宣称原源码已验证所有情况。

174008 的 VideoPlayerBar 是实际自定义栏：bottom absolute，80px 透明→黑0.5渐变，row gap8/padding-x12/padding-bottom10/padding-top32；play28×28/icon16、time12px/tabular。进度 rail3px、thumb10px、hit height14。音量 popup 黑0.75/padding6×5，vertical hit16×80、rail2、thumb8、按钮28/icon14。duration<=0 显示 `--:--`；0<time<1 显示1秒。截图菜单只在有 onScreenshot 时显示，dw 没有提供该 callback，不能凭公共栏分支给 clip 增添截图按钮。

source progress/volume 使用鼠标与 window move/up，listeners cleanup 有记录；键盘 role/slider semantics 不完整。本机若增加键盘可达与取消属于维护适配，应单独验证，不能以 native controls 默认样式代替实际原栏。

103145 的图片/helper 在 `0p_bztaupj2yb.js`。snapshot 仅接受规范化后 http、没有 x-oss-process、非 webm；默认 width tier 200/400/800/1600，拼 OSS video/snapshot。getFasterImage 保留 WebP/非匹配TVRES/非http/超限文件/已有处理 URL，其余按明确宽度及 DPR 拼 resize。data/blob/本地 URL 不应凭空加远端 OSS 参数。需要实际浏览器验证原媒体、海报失败与 video metadata，静态规则不是播放器完成证明。

## 打开、收起、关闭与视口

原 Canvas store 默认 editingClipNodeId=null、editingClipPreviewExpanded=true、focusNonce0、locked=false。设置新 ID 或 null 重置 expanded=true；设置同 ID 保持已收起状态。244434 always embedInNode=true、defaultPreviewCollapsed=false；正常 Canvas embedContained=false，assetboard 则 true 并传 override node ID/close。613429 初始 tc=!defaultPreviewCollapsed，并同步 expanded 到 Canvas store；普通 embedded 的 canvasLocked=tc。

expanded 真实布局由 613429 最终 return 明确给出：normal Canvas 的 preview 通过 body portal fixed left0/right0/top0/bottom=hy，dark背景#141414，header 视频合成/设置/关闭；timeline 另 body portal fixed bottom0，height=hy，z700，外层padding8，border rounded12，backdrop32。这不是可自由拖动 X/Y 的小浮窗。timeline 顶部4px separator 可以拖动高度；hy 初始 max(轨道所需最小值,round(35%viewportHeight))，最大60%viewport/containedHeight，轨道数决定 min。Canvas定位中的220仅是预留区域。

收起后 actual preview gV 移入 `clip-preview-drop-${id}`，timeline 仍 fixed bottom；没有可见 target portal 时显示回到节点按钮。节点 portal 查询最多300 RAF重试并清理。contained assetboard 使用绝对定位、父 hv 观察尺寸。preview fullscreen 另由预览 canvas 所在容器 requestFullscreen，不等于 expanded 状态。

613429 的 onContentHeightRequired：非 audio clips 有真实 truthy width/height 时取最大 aspect ratio，写 `min(round(350/maxAspect),1050)`；变化才 callback。244434 guarded writer 写入 data.embedContentHeight。它是视频画幅高度，不能用 hy/220/画布盒子代替。

Close `es.current` 先 flush 当前字幕/overlay/timeline 编辑；dirty 时须有 pending 保存且 await 成功才调用 onClose。wrapper onClose 解锁并清编辑 ID（或 override）。Escape 先关闭内部菜单/模式/fullscreen，再走 editor close，原独立热键所有权需随本机 dialog-stack 合同验证。613429 **无 readonly prop**，244434也不传；不能猜测“readonly可打开但整个编辑器按钮全部 disabled”。已确认的是 dN 打开门控与 guarded writes，已经打开后 readonly 切换的全 UI 尚未完整核对。

Canvas `uh` 保存首次 editor 打开前 viewport，整个关闭时300ms linear恢复；切其他 clip 不重置最初保存值。仅收起预览时选中 clip、触发定位：measured 优先 raw dimensions，availableHeight=max(100,containerHeight-220)。expanded 期间不按该定位分支执行。

## RF 测量与序列化边界

717139 `useNodeDimensionSync` 对 NodeShell 外层 ResizeObserver：首条只记 baseline；变化>1px才排队，交互中延迟，结束后 flush；每 RAF 最多24节点，清 RF wrapper 的固定尺寸/inner min尺寸再 updateNodeInternals。它不直接提交业务 data/history。

原 ReactFlow helper 的 dimensions change 无条件写 node.measured；只有 setAttributes=true/width/height 才更新对应 rawwidth/height。Canvas store 将 applyNodeChanges 结果写 nodes，过滤小于0.5px重复测量。本机 `persistence.js` 保存原 nodes，未剥离 measured，因此同步 measured 会进入本机保存/导出；保持 raw350 与 measured566是可表达状态。原专用 export 最终 serializer 尚未单独追完，不以这点推断所有原导出形态。

## 可达性与当前实现缺口

nodeTypes 注册、dN 编辑动作、244434 wrapper、613429 editor 与 Canvas视口钩子都直接证实。AssetBoard73775 的 wrapper import/mount 同样直接证实。现有原归档的普通 Canvas顶层 **244434实际 JSX mount 尚未定位**；不同档案版本与异步chunks限制不能用猜测补上。已知 wrapper 合同足够指导本机接线，仍要真实验证正常Canvas打开/关闭/导航。

Premiere export 回调存在，但该档案完整菜单只有“本地”和“画布”条目，第三 child 为 literal null；不能为了“功能完整”创造一个当前原 UI不可见入口。真实 compose生成、保存服务、字幕上传、服务端导出及账号协作仍未接入。

已实际查看 [本机聚焦截图](../artifacts/canvas-selected-delete-clip-native-focused.jpg)，SHA256 `6672fab2ff32608aeab1db167d8c8049c229187c983dd408c7a60c70587a51d4`：视频合成仍为大号通用“智能剪辑生成器／添加提示词，开始创作”与通用“模型配置加载中／当前模型配置不可用”Inspector。Root已报告混合断线 native gold导出一致；本文作者未独立执行该浏览器导出。图事务正确不表示专属 clip节点、editor、timeline、媒体及生成功能完整。本次静态研究与正在新增的纯模型尚未计入已完成 UI。

该截图是本轮专属UI接线前的观察；后续新UI必须另留浏览器证据，不能把旧截图视作完成后的现状。

下一实际验收应覆盖专属空态/首输入/输出/Agent层、普通Canvas展开与收起/关闭回视口、readonly输出播放、真实尺寸与边线命中，以及 timeline内部删片/恢复/保存后再开。生成与服务器导出保留明确未接边界。

## 本地纯模型与后续媒体证据

本次另外新增 `clip-editor/domain/incoming-model.js` 与对应 test，公开 `collectVideoClipIncomingData({node,nodes,edges})` 和 `resolveVideoClipIncomingPoster({incomingData,nodes})`。保持 417754 四列表 shape、空 URL、普通重复边及组展开去重、8层边界、原顺序、字幕/transition、typed顶层metadata与图片引用过滤。target过滤读取图内的同ID节点；node只标识目标，等同原184656传ID。directorStudio只有原规则产生时附加，不伪造缺少源的结果。模块不读UI、浏览器store或业务hook。

官方 Node24.19.0 定向 **25/25**（09:59:06、674ms）及零警告 ESLint通过；测试含真实公开 `HHcwG6xmqD` 的 clip输入手写 gold，保 graph未改。生产测试不依赖 `.gitignore` 排除的 artifacts或research/source；归档三坐标/SHA验证留在研究脚本/证据。该模型尚未代表专属UI接入和整批验收。日志见 `artifacts/canvas-clip-node-source-incoming-test-public.log` 与对应 lint/format。

新增两份只读补充： [预设尺寸证据](../artifacts/canvas-clip-node-source-preset-proof.json) 为4文件/4段，包含原natural-size公式（上限5600）、NODE_HEIGHT_AUDIO=148、estimateNodeFlowSize优先级与中文“预设 - {name}”；[媒体播放证据](../artifacts/canvas-clip-node-source-playback-proof.json) 为同editor原文件/20段，三坐标及SHA均通过。

媒体证据明确：原 gV 是 canvas，eq将所有当前可见video clip按时间取真实decoded frame，形成 layers，再由 nM逐层 apply transform / circle mask / drawImage。expanded/output/多层等条件使用真实输出尺寸并先清黑；不能用第一项video DOM冒充多轨画面。HTML video显示muted，视频原音频按clip独立Audio，其他音频按audioTrack独立Audio，并使用WebAudio Gain支持正decibel放大。纯clip速度上限8192与HTML playbackRate上限16分别处理。

coordinated seek/play先等待timeline准备、frame实际呈现，再按playing intent等待audio与外部blocker，具有epoch/abort和10秒准备超时。metadata读取成功不能直接当作整条播放已ready。该补充还包含媒体源清理、迟到play promise门控与preview invalidation原文；MediaRegistry、完整decode/frame cache及全部浏览器实现仍未审计，partial play-loop摘录已明确标注。

按后续授权新增 `playback-model.js` / test，复用既有纯track与speed方法。`describeClipTimelinePlayback(timeline,time,options)` 返回可见video layers的原z降序/time/id顺序及每audioTrack原clips.find首项，保video可含终点/audio严格不含终点、真实sourceOffset clock、8192/16两种速度边界、uniform2×3变换/像素位移、circle mask、实际媒体尺寸fit、独立轨道静音、clip decibel/globalvolume。`clipGainForPlayback` 原增益最大5，不截到1；`normalizeClipTransform` 严格有限number、scale范围0.05–10。

`unsupportedFlags` 明确描述**当前本机基础媒体preview**不能呈现的实际字段：VTT、字幕HTML、overlay HTML、transition preview；同时报告native speed>16、未知真实media尺寸等。它不判断原站缺少这些功能、不删除保存字段、不代表浏览器准备已ready，也不把链接音频错误继承为父video的mute。浏览器hook须处理frame/audio准备、gain所有权与失败。纯模型26/26（10:13:42、709ms）、scoped零警告lint通过，日志为 `artifacts/canvas-clip-node-source-playback-model-test.log` / `...-lint.log`。

变换740349、visible order28845与fader constants123721的额外三坐标原文在 [播放domain证据](../artifacts/canvas-clip-node-source-playback-domain-proof.json)，2份原文件/3段，关联前20段proof原SHA。原station/UI/schema全部覆盖仍未完成；纯模型不能提高专属editor实际验收比例。
