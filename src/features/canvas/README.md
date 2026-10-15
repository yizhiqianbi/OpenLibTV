# Canvas 模块维护

普通文字HTML底层在 `clip-editor/text/`，纯时间/避碰在 `clip-editor/domain/text-timing-model`，异步稳定ID在 `services/timed-text-id`。DOM对象只属于owned解析/预览生命周期，不序列化进Canvas。当前协议与patch已验证但尚未接App；下一步必须接入口、末次草稿/CAS/history和双iframe宿主，维持lazy边界与900000预算。源规则、明确适配和待接线范围见 [HTML协议审计](../../../research/canvas-text-html-contract-audit.md)，不将该底层工作当作文字功能完成。

剪辑 `clip-editor/` 已有专属VideoClipNode、基础时间轴、播放runtime、历史/恢复、转场库/属性与实际预览；下文“仍通用占位”是旧断线批次范围，不代表当前实现。基础VTT字幕模型、transport/hook、会话controls、面板/轨道和DOM预览分别维护，末次正文经共享draft投影、拖动经一次CAS/history，字幕删除与素材删除独立。HTML字幕/普通文字、完整字体目录、波形/导出和真实服务仍缺；本批专项及实际浏览器、全量状态见 [字幕验收](../../../research/canvas-clip-subtitles-functional-audit.md)，不能沿用旧冻结结果描述后续工作区。

选中键盘与剪刀运行入口共用 `batch/useCanvasSelectedDeletion`，纯候选／flags／阶段在 `domain/selected-delete-model`。ordinary同步后启动clip／raw editing，offer一次关联warning同时继续UI nodes；后置取消仅保关联边。`GraphActions`统一fresh graph／全部draft／CAS／成功consume，cohort资格先全验再helper，一次接受；raw与UI组删除保持独立。`useCanvasDeletionHistory`只在接受图后发布before，microtask结束coalescing、晚确认另起segment，undo／redo须先flush有效草稿。source patch／冲突历史与本机50条快照分开；不能固定所有mixed一次undo。

`clip-disconnect/`负责纯track／timeline／ordered mD与异步controller，`useCanvasClipDisconnectPort`负责明确本机lease／最新draft／CAS／history。request／commit／finally release使用同一operation signal，兼容无signal bucket独立，不得由未授权取消release偷走另操作授权。目标全部边两端获准才批准该目标，time patch先于ig；unavailable／busy／拒绝无raw fallback。全部signals／opaque owners不落文档，真实云锁未接。完整407／5862、1192冻结及19份GUI文档／390范围见 [混合删除验收](../../../research/canvas-selected-delete-functional-audit.md)。当前VideoClipNode仍通用占位／inspector，完整renderer和timeline编辑另补，不将数据断线通过当全部剪辑工具完成。

当前连线入口由纯 `domain/edge-interaction-model`、owner hooks `useCanvasEdgeSelection`／`useCanvasEdgeHover` 和 `components/CanvasEdgeLayer` 分开维护。实际renderer挂载集合决定visibility；hit20、visual2/3/4、cut48都为world单位，不能改固定screen宽度或用bbox代替source registry。普通click／CtrlMeta pointer与ShiftCtrlMeta keyboard协议不同，readonly keyboard不叠加；focusable独立。hover以当前native CTM映射point，API有但失效时清位置；owner退休timer/RAF/cache，不写graph/history。shared pointerActive与派生panning class共用同一gesture，松手即恢复edge；idle hand保选线paint/flow而禁pointer。剪刀已由上方 `useCanvasSelectedDeletion` 接管，旧 `useCanvasEdgeRemoval` 保留兼容，双击不删除，Space/Enter只阻传播保native button默认激活。原生14份整图导出、390/10%/readonly、源93摘录与正式收尾边界见 [连线验收](../../../research/canvas-edge-interaction-functional-audit.md)。该连线批次当时未接selected-edge Delete/mixed与VIDEO_CLIP异步，现由上方新批次接入；完整renderer仍缺，下面单边双击是历史入口。

整图删除由 `domain/destructive-delete-model`／`generator/reference-recalculation-model` 计划，GraphActions 统一 fresh graph／全部draft／CAS／一次history，成功后 `useCanvasDrafts.consume` 退休删节点 channels 并通过 accept bridge 消费普通prompt。成功读取缓存 draft kind，后续错误不漏消费普通输入、不丢脚本rows。UI 删group/video_group删除parentId子树，raw释放／解组是不同协议；直接父组收缩／p2绑定保持源顺序，bounded surviving-group consumer为明确本机opt-in。确认规则／owner／view在batch与components分层，菜单用真实nodeId；手型／Space门控键盘，SVG隔离pointer／双击。388／5370完整检查、1150冻结与实际App／GUI16份整文档／390范围见 [整图删除验收](../../../research/canvas-destructive-delete-functional-audit.md)。分镜断线unlinkStoryboardByEdge／VIDEO_CLIP mD／原锁和完整特殊renderer仍缺，不把本机CAS当真实锁。

普通参考删除由 `reference-incoming-model` 收集源 post-graph、`reference-reconciliation-model` 处理稳定 ID token、`reference-actions-model` 构造纯计划；GraphActions 负责 fresh owner／末次草稿／raw CAS／一次历史，Inline 成功后消费实际接受正文。旧 typed 合法空数组与 absent 兼容分开；组计全部 leaf，Role final after 共用 collector。不可用 UI 引用不能缩小 source 组计数，不能把 target.refImages／focus UI 规则套进 store。VIDEO reorder 与普通删除的非法 token／空白语义独立，IMAGE排序继续 only-order。此前特殊锁／全局cascade／lens／style／panorama纯状态缺口由上方补接；379／5193历史普通范围见 [删除验收](../../../research/canvas-reference-delete-functional-audit.md)。

`generator/useGeneratorSurfacePlacement`统一Generic／ScriptV2／实际mounted加载错误态，pure `inline-placement-model`只计划位置。实际canvasNodeSize／title／toolbar／visualViewport和自然scrollHeight由hook读取，owned RO／transition RAF退休清理；普通gap16screen、Script16world。上下避让与限高是授权本机适配，只改几何state，不改graph／camera／history。afterContent永久在article内、tilt shell外；Frame展开继续唯一dialog-stack。VIDEO排序CAS接受值由输入ref消费，IMAGE只改typed顺序保literal；普通删除已由上方共享链接入，完整特殊renderer／分镜断线／VIDEO_CLIP仍另验。源码、原生与冻结检查见 [本批验收](../../../research/canvas-generator-vertical-functional-audit.md)。旧useInlineGeneratorPlacement仅兼容出口，历史横向说明不作为当前三个caller入口。

VIDEO角色库入口由 `generator/roles/useCanvasRoleLibrary`绑定doc／node／source owner，纯图计划与视图分离；运营能力在 `services/canvas-role-library.ts`，默认unavailable。公共目录不等于匿名原站权限，asset URI只解析真实record，读取／认证／natural probe迟到不写旧owner。一次CAS／history／flush，Quota重交canonical选择仅保存；不能重复认证或建节点。`roleMediaReferenceMetadata`由普通generator与增强连接collector共用，三媒体证书字段不能统一。详见 [角色库验收](../../../research/canvas-role-library-functional-audit.md)。

引用事务显式prompt采用 `commitGraph(...,{explicitPromptNodeIds})`仅跳过next目标普通draft，previous历史仍投影末次输入；script channel不受此选项抹除。`patchCanvasMagicPrompt`先清孤立metadata，CAS接受后通过prompt ref的`acceptCommittedValue`取消旧timer／消费值，不另发onChange／history。默认其他graph消费者保持原投影；失败不能预先消费草稿。所有角色／preview／delete portal隔离click，避免背景node失选卸载；shared dialog-stack继续唯一维护焦点／背景／Escape。

共享 `features/editor/useGraphPointer.js` 仅在node手势已moving时处理末次up坐标，pointerup不能首次启动node拖动/复制/history；平移/框选/连线协议保持，普通与virtual frame均走该门控。源普通move-start与virtual down-start分开记录，本机4px阈值/延后复制是明确适配；正常结束末位、原选择和一次历史不得回退。实际App4项、Canvas/default shared14项与原生GUI图比较见 [松手边界验收](../../../research/canvas-pointer-release-functional-audit.md)。归档canvasCapture为前图URL→callback且t4未消费可见入口，不等于区域截图；未来按已证实入口和对应服务契约接线，见 [抓取源码](../../../research/canvas-capture-view-source-audit.md)。

元素标记由 `generator/mark/` 的轻量entry、opaque mode/request controller、pure token/graph、Surface/ModeBar与prompt badge各自维护；识别契约在 `services/canvas-mark-source.js`，默认未连接且无假标签。Core prompt/meta清理进入generic patch和draft projection；pending识别合并末次草稿，旧confirmed point可选/删；point FIRST与prompt ALL规则保留，图事务一次CAS/history/flush，Quota只保存重试。普通prompt CtrlZ恢复raw token但不重造metadata。Script卡片真实lazy且22份CSS保原级联；`useInlineGeneratorPlacement`向普通/ScriptV2/加载态三个caller返回{center,width}，按实际board宽只改溢出浮层，不改source图/view。接口、回归与原生范围见 [本批验收](../../../research/canvas-mark-functional-audit.md)。

图片聚焦由 `generator/focus/focus-region-model` / `useCanvasFocusMode` / Surface / ModeBar / ConfirmBar / Attachment分别持有纯数学、文档与mode owner、受控视图与crop。`FocusConfirmEntry`在mode开启时dynamic import预加载，失败保pending/重试/取消，不读graph或建第二焦点栈；opaque owner失效拒迟到加载。region、originImage、scene、ratio和一条源边投影末次草稿后一次CAS/history/flush，Quota仅刷已接受图；手动退出保图，自动退出等待保存成功。实际source门控、min闭包、视口跟随、390/320布局与原生范围见 [聚焦验收](../../../research/canvas-focus-functional-audit.md)。该聚焦历史批次的Mark前端缺口已由上方接入；capture、未核renderer/真实服务与全局publish protection adapter仍缺。

参考框选保client起点、release重算当前view两端；只读实际shell尺寸交纯collector，屏幕矩形不借普通框选。返回节点由geometry.centerCanvasView保zoom；reference/ordinary pointer通过实时getter互斥、尾click guard识别新press与键盘。普通upload首await前固定完整FileList，防清input后漏第二项。source/本机适配及原生范围见 [手势验收](../../../research/canvas-reference-gesture-functional-audit.md)。该手势历史批次仅有focus预备模型，后续接线见上方聚焦说明。

参考交互由 `useCanvasReferencePick` / `useScriptV2ReferenceImport` 持有模式与异步owner，纯建图和source任务投影独立；Bar/Mask/本机picker复用既有焦点栈。`CanvasGeneratorEntry` 按实际显示资格加载两个实现，旧CSS保持eager级联，见 [本批契约](../../../research/canvas-script-reference-functional-audit.md)。

`NodeCanvas.jsx` 协调路由、文档、当前选择与视图。业务修改应落入对应模块；不要在页面继续增加文件读取、消息构造或存储分支。

| 模块                                                                                           | 所有权 / 入口                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `hooks/useCanvasDocument.js`                                                                   | 加载、交接与自动保存；文档身份由 storageKey + loadedStorageKey 决定                          |
| `hooks/useCanvasNodeActions.js`                                                                | `addNode / change / update / connect / upload / generateNode`；当前文档的写入门控和上传取消  |
| `hooks/useCanvasGraphActions.js`                                                               | 增强引用连线、资产批量导入、引用排序 / 删除、脚本 patch 和分镜图计划；同步当前图提交与历史   |
| `hooks/useCanvasAgentController.js`                                                            | Agent 状态、恢复 setters、发送与引用动作；有序 parts 与 mode 独立维护                        |
| `hooks/useCanvasSnapshotActions.js`                                                            | 复制、本机分享和 `getSnapshot`；投影未提交节点提示词，持久化成功后才导航或产生链接           |
| `hooks/useCanvasDrafts.js`                                                                     | 实时 / retained 节点草稿注册、投影与保存 ack，不拥有文档存储                                 |
| `hooks/useCanvasGroupControls.js`                                                              | 普通/standalone纯计划的命令分派、确认/拼接异步owner、最新图CAS与已提交图flush                |
| `hooks/useCanvasScriptGroupControls.js`                                                        | 脚本关联v1/v2图片/视频运行确认和请求owner；真实执行/费用未接，不写假任务                     |
| `hooks/useCanvasBatchVideo.js`、`storyboard/batch-video-*-model.js`                            | v1模型/共享参数/费用与审核owner；空视频建图一次CAS/history/flush，Quota仅重试保存            |
| `batch/useCanvasSelectionActions.js`                                                           | 选择写入CAS、复制源草稿、组布局委托与文档/组ZIP owner；旧change仅兼容fallback                |
| `domain/general-group-controls-model.js`、`domain/script-group-controls-model.js`              | 普通颜色/布局/转分镜纯计划；脚本运行文案和批量视频可用性只读规则                             |
| `components/GeneralGroupToolbar.jsx`、`StoryboardGroupToolbar.jsx`、`GroupToolbarUI.jsx`       | 普通/standalone/脚本混合行的菜单视图、共用定位与tooltip；不持文档写入或真实执行服务          |
| `hooks/useCanvasPointer.js`                                                                    | 当前文档一次手势及取消，不负责分组规则                                                       |
| `domain/`、`model.js`、`geometry.js`                                                           | 节点、分组、坐标和纯协议规则；文件读取委托可取消 service                                     |
| `generator/focus/`                                                                             | 聚焦纯几何/图计划、mode/pointer owner、受控视图、按需工具与natural crop；模式不持久化        |
| `generator/roles/`                                                                             | VIDEO角色库纯容量／图计划、owner、view、取消／metadata；typed source在services，主体rb另维护 |
| `generator/`                                                                                   | schema、媒体校验、参数 controller 和输入 / 设置 views                                        |
| `batch/`                                                                                       | 普通多选动作、依赖执行计划、保存 / ZIP；不复用分镜专属参数                                   |
| `storyboard/`                                                                                  | 分镜表格规则、编辑 controller 和 views；旧 StoryboardPanel 是兼容入口                        |
| `storyboard/script-preset-model.js`、`useScriptV2Presets.js`、`ScriptEmptyCard.jsx`            | 空态三个提示；前两项纯预设建图、一次CAS/history/flush与Quota只保存重试，手写另走table        |
| `storyboard/script-generator-inputs.js`、`script-generator-model.js`                           | 专用TEXT/媒体输入、task参数、规则、prompt清理、typed重排与组引用删除纯协议                   |
| `storyboard/useScriptV2Generator.js`、`ScriptV2NodeGenerator.jsx`、`ScriptV2GeneratorView.jsx` | raw参数事务、独立草稿channel/Frame和view；三项目录不借普通text全部菜单                       |
| `components/`                                                                                  | Canvas 私有视图，跨域基础输入从共享 components 引入                                          |
| `document-api.js`                                                                              | 其他业务域可使用的文档构造 / 持久化入口，不能导出 UI 或 hook                                 |

异步操作在启动时绑定 documentKey，结束时再核对当前 key、ready、readonly 和卸载状态。文件读取完成用 functional setNodes 合并最新节点，保留读取期间的正文和连线。取消只丢弃此次尚未提交的结果；不要把旧 nodes / edges 写回新文档。上传的 AbortController 由 node actions 负责，在切项目、失去 ready、切只读及卸载时取消。

Agent 文档恢复 setters 由 `useCanvasAgentState` 提供，加载 hook 恢复 prompt、draft、messages、agentConfig。`useCanvasAgentActions` 接受这些 state 和输入 ref；已连接输入走光标处插入，未挂载输入走协议 append。发送保留 ordered parts 与真实 mode metadata，默认生成服务返回明确不可用状态。

复制 / 分享 / JSON / 文本导出共用 `getSnapshot`。它读取最新文档，不自行门控 ready 或绑定调用者原文档；当前同步入口已有保护，新增异步消费者须捕获 expectedDocumentKey，并在提交前复核身份与 ready。传给 autosave 的 agentConfig 是文档 override，导出的完整快照保留 resolved config；不要把 session 切换写成用户默认偏好。share 的剪贴板失败保留已写快照和链接，旧文档的迟到反馈不能影响当前项目。

全画布 `@` 已由 InlineGenerator 注入 `canvasMentions`：只读 source、已核对的 connection validator / capacity、同步 boolean 提交和最新 token lookup。普通 `useCanvasNodeActions.connect(id)` 依赖 linking 状态，并复用 graph actions 返回 boolean，仍不能代替不依赖 linking 的增强引用契约。未知生成器、模型或权限策略不得默认放行；image / video 的名称与序号 ghost / Tab 已接入；单个 badge swap 与普通 @ 的引用资产入口已接入；二者分别维护 DOM occurrence 与 actual trigger request，规则与适配见 [引用动作审计](../../../research/prompt-reference-actions-functional-audit.md)。

`useCanvasGraphActions` 提交前核对 documentKey、ready、readonly、卸载状态及当前 nodes / edges / models 身份；成功后先同步发布 currentDocument，再更新历史和 React state。引用排序 / 删除把尚未到150ms的提示词一并提交，撤销快照保留动作前草稿。分镜计划验证 source identity、全部新 ID 与边端点，原子应用节点、连线和脚本 patch；该事务不提交生成任务。

脚本节点实际使用 `storyboard/CanvasScriptNode.jsx`，ScriptV2 的九列表格、对白 / 运镜 / 两类手动提示词、全屏、三阶段、本地资产 CRUD / 当前画布选图、V2 CSV、本地建图和保存恢复已接入。阶段导航独立于 view metadata，表格配置取实际首个 table view；空资产顶部 idle 与底部下一步是不同判断。`script-assets-model` / `workflow-model` / `export-csv` 为纯规则，`useScriptAssets` 和表格 controller 管理生命周期，graph actions 统一提交一次历史。失败草稿绑定原相关字段基线，不能在外部 rows 更新后重试覆盖。旧 StoryboardPanel 继续承担媒体网格兼容调用。v2 mixed2video配置与空视频建图已由下方新批次接入；专属个人图片库、上传 / AI、智能合成与真实历史创建、费用和 executor 仍未接入，详见 [资产阶段审计](../../../research/script-assets-workflow-functional-audit.md)。

生成器展开由 `GeneratorFrame` 管理，几何规则独立；切换 portal 前刷写提示词，展开尺寸保存在节点 data。模型 / 设置 / @ 菜单挂载在当前 dialog 内；共享 dialog-stack 的 child dismissal 先处理子菜单 Escape，不新增 body 锁或焦点栈。

AutoLink 的纯规则在 `generator/prompt-suggestion-model.js`，DOM装饰在 `prompt-suggestion-dom.js`，定时器 / IME / 拒绝 / batch 在 `useNodePromptSuggestions.js`。只对当前参考进行提示；ghost 不进入正文，接受复用 badge 协议并立即提交。`services/prompt-mention-preference.ts` 维护全局浏览器偏好原 raw 1/0，不能保存到 params 或加入登录条件。controller 的 beforeMutation 清理旧 ghost，内容签名稳定 pool 避免受控回写清掉 batch。详细证据见 [AutoLink 审计](../../../research/prompt-autolink-functional-audit.md)。

维护时运行相关流程回归，再在批次冻结后执行 `npm run check`。涉及文档和输入必须核对立即离开 / 切项目 / readonly / Quota；涉及历史必须核对撤销与恢复；WebGL、布局与媒体仍需真实浏览器。详细证据与待完成功能见根 `AGENTS.md`、`research/coverage.md` 和域内审计。

ScriptV2最终提示词已接单镜头/批量本地拼接、旧bundle覆盖确认与20秒撤销。手动两轨500ms保存保留原状态；`ScriptPromptInput`独占资产标签DOM，不能复用普通生成器token。`domain/draft-projection`统一普通节点与分镜草稿，canonical graph基线校验后投影，不直接保存或触发历史。autosave在pending为空时也检查有效draft，保留未投影的基线以允许live draft继续推进。规则、源码证据与服务缺口见 [提示词拼接审计](../../../research/script-prompt-compose-functional-audit.md)。

既有媒体版本由 `storyboard/script-media-history-model.js` / `useScriptMediaHistory.js` / `ScriptMediaHistoryMenu.jsx` 持规则、owner/epoch/signal和视图；实际接线经CanvasScriptNode→StoryboardTable→单镜Dialog。active实变后走source tk全行规范化，正文不回滚；jump只fit实际node并保留两层dialog。激活前flush必须在hook捕获owner后进行，不能外层先await再调用命令；真实readonly与busy写禁用分别传入，读取/跳转仍可操作。失败信息只读script任务3/4，单shot进度仅用caller明确number，不为未接的task source造ID/百分比/成功历史。已知源码、本地适配及剩余服务见 [媒体历史审计](../../../research/script-media-history-functional-audit.md)。

节点手势由 `hooks/useCanvasPointer.js` 统一持有，Viewport仅接事件，Node/Group通过 `shouldSuppressClick` 隔离刚结束的pan/drag click。4px本机阈值超出后才记历史并暂停inline；pointerup提交真实末位，取消/失焦/文档变化释放capture。wheel只消费板面，输入/媒体/滚动容器保留原生滚动；Space和浏览器组合快捷键由keyboard hook协调。源差异、实际NodeCanvas回归与剩余触摸范围见 [节点操作审计](../../../research/canvas-node-interaction-functional-audit.md)。

触摸/双指由 `useCanvasTouch` 管锚点与原生生命周期，连接由 `useCanvasConnection` 管 pointer/DOM hit/preview/RAF。三种 writer 接管前互相取消；public cancel 清旧 tap/click suppression，native end 保留该轮后续 click guard。domain 只计算几何和资格，Graph 的 `planConnection` 只读当前图、`connectNodes` 同步 CAS 一次历史；新建资格与普通模型容量不同。`useCanvasConnectionMenu` 同步 request，view 只布局/键盘/焦点，迟到对象不能提交新 request。fit/zoom/touch共用0.1–8；board不允许焦点隐式滚动。详情、源适配与明确剩余范围见 [触摸连接审计](../../../research/canvas-touch-connection-functional-audit.md)。

节点连接视觉独立于图：`connection-feedback-model` / `useCanvasNodeConnectionFeedback` / `CanvasNodeConnectionFeedback` 管flags、physical hover、RAF tilt和body装饰；`connection-ghost-model` / `CanvasConnectionGhost` 只投影blank-release请求。固定article保持world geometry，永久surface和body保持输入DOM/草稿；inline的coordinateOrigin只从world换成本地位置，展开继续portal。视觉状态不写图或历史。

菜单世界anchor在open时捕获，future createPoint另存；`canvasToScreen`只更新screenPosition，view不重建owner。blur/hidden清request、linking和ghost，CAS提交仍一次history。源尺寸默认measured优先，本机caller注入canvasNodeSize，与已normalize节点尺寸一致。具体源分支、350/100定位、tiny边界、实际8px样式覆盖与浏览器范围见 [节点反馈审计](../../../research/canvas-node-feedback-functional-audit.md)。

虚拟多选由 `selection-overlay-model` / `CanvasSelectionOverlay` / Pointer `dragSelection` 分持几何、screen view与手势。toolbar接board-local `anchorPoint`，固定screen尺寸、顶部14px；窄屏测量/clamp/横向滚动为本机适配。`multi-connection-entry-model` 为虚拟选区/真实普通组提供不同 descriptor 和投影；真实组只画壳右中加号，不另画虚拟框、不加虚拟 padding。组递归输出与虚拟直接孩子展开分开，派生组门控由 model/hook 共用确切 predicate。多选隐藏单节点浮条/inline；Touch一指视选区为Pointer surface，第二指接pinch。

`multi-connection-model` / `multi-connection-gesture-model` / `useCanvasMultiConnection` / `CanvasMultiConnectionPreview` 独立于单连：10px/300ms、80屏幕px边缘720px/s、release1×1body、聚合support/capacity、六项菜单和一个共享target。N条蓝线/中心24px圆仅是viewport投影，不复用tiny ghost或逐source部分提交。`CanvasSelectionAddIndicator` right默认和显式center区分源位置。writer互相取消；异步/menu命令复核document/epoch/request/selection。

Graph可注入 `projectGraph`，原图CAS后投影previous/next、再复核原身份；普通record也包括最后150ms草稿。autosave成功合入当前有效draft后ack，避免卸载inline残留旧graph再次覆盖正文。失败、外部基线改变、旧key flush各自门控。模块、实际页面/浏览器见 [多选交互验收](../../../research/canvas-multi-selection-functional-audit.md)。

普通 node/group 与虚拟框 Alt / Option 复制由 `selection-copy-model` 的明确 single / selection 协议计划 additions；Graph `createDragCopy` 先投影源草稿再 clone、原图 CAS 追加一次历史，拒绝未知 mode 或不合法 single sourceIds。普通节点在首次越 4px 阈值时读取最新图和修饰键，避免选中后的生成器 mode 初始化使旧 CAS 失效；虚拟框仍固定 pointerdown 意图/图身份。确定操作后 Ctrl / Meta 携内部与上游输入边，Pointer 只移动新根、不再 record；单独复制组内孩子脱离父组，复制真实组维持整树。稳定 board capture、Escape/hidden 中断与兼容 click 门控见 [普通节点复制验收](../../../research/canvas-node-alt-copy-functional-audit.md)。

多源 controller 的 entry identity、递归 membership 与精确 focus selector 隔离旧命令；共享 Touch 取消可能回调 multi.cancel，所以 start 必须先互斥取消再创建 request，防止空白释放菜单的回焦点序号过期。证据、原生验收和剩余范围见 [组与选区验收](../../../research/canvas-group-selection-functional-audit.md)。

`node-drag-pan-model` 分开 node 的40px/最多15px每帧与虚拟frame的80px/720px每秒协议。Pointer独占RAF/epoch、同步viewRef后投影根位置；虚拟frame累积实际世界pan补偿，dt0边缘仍续帧，中心停后move再启。取消/新手势/文档和可写边界拒绝迟到写入，successful end仅保留该轮epoch供最终functional updater完成，不延续RAF。资产抑制严格识别`[data-workspace-asset-panel]`，不泛化到Agent。

`group-drag-model` 接最终nodes、primary/roots/selectedIds、releasePoint、surface、copy标记和renderer尺寸，返回纯nodes计划。ordinary完整包含入group、正面积重叠保parent、完全分离detach；virtual frame与live copy不套ordinary drop，特殊组交专属协调层。pointerup最终坐标和finalizer在同一个节点updater完成，不预读上一帧Graph、不新增history/edges/服务。ordinary inner不resize/reorder，source detached marker跨手势消费；outer node-stop的grow-only扩壳由下方协调层接线。规则与本机4px/board rect/stop时序适配见 [节点拖动验收](../../../research/canvas-node-drag-functional-audit.md) 及 [最新分镜协调验收](../../../research/canvas-storyboard-drag-functional-audit.md)。

`node-stacking-model` 为Viewport派生临时z：selected加1000，parentZ≥own才parent+1。用memo和稳定node key交给Node/Group inline style，不写document、history或重建输入；小数层级不能改成无条件parent+1。桌面/390px已确认选中标题不再被旁边textarea挡住；真实手机、完整特殊组drop与大图性能继续另验。

`node-drag-drop-model` 组合 grid start/move/stop、special stop、ordinary stop与实际membership reflow；node outer仅primary最终parent交 `parent-bounds-model` grow-only扩壳，virtual frame不调用。Pointer stagecontext按实际commit继承，Strict重放缓存，完成选择/提示在commit后且owner/CAS有效时处理。`storyboard-grid-create-model` 与 selection actions 接实际2–25根图片菜单；网格纯模型/空槽presentation共用尺寸/order，slot插入不改ratio。`useStoryboardSlots` / `StoryboardSlotPicker` 用唯一request、AbortSignal与共用popover/dialog-stack，nativechooser锁定原owner，删除组/切文档/禁用/新槽取消旧读取；成功回组焦点。`image-group-chrome-model` 分开派生组title与strictstandalone端口门槛，不隐藏脚本组全部连接点。明确media尺寸通过canvasNodeSize用于手动renderer与world geometry，保存源flow字段。源契约、实际NodeCanvas/浏览器及剩余服务见 [分镜拖动验收](../../../research/canvas-storyboard-drag-functional-audit.md)。

独立分镜组设置由 `storyboard-group-controls-model` 计划，`useCanvasGroupControls` 持确认、异步natural尺寸/PNG、owner/source/signature与最新图CAS。`StoryboardGroupToolbar` 只持菜单/定位/局部分辨率偏好，`StoryboardGroupConfirmation` 复用dialog-stack。比例不fit，宫格按源.2/.6/1 fit；ordinary默认fit范围不变。拼接模型与 `stitch/runtime` 分离，真实PNG节点注明本机能力，保留URL水印参数。

普通颜色、三种布局、全图片组转 standalone 由 `general-group-controls-model` 独立计划；source measured→stored→200/120、actual direct children、完整preferred否则numeric name、36/66与36px间隔以及 `groupLayoutMode/nodeWidth/nodeHeight` 不复用 standalone 的4px/ratio协议。`useCanvasGroupControls` 根据命令选 planner，`CanvasGroupNode` 仅负责壳/外部标题/改名与 toolbar 分派。普通及非standalone脚本派生走 `GeneralGroupToolbar`，strict standalone走专用行，script-linked混合行锁比例、隐藏转普通组并交独立运行确认。多选/框选/拖动/编辑及200ms冷却隐藏，窄屏portal/clamp/滚动为本机适配；不要据静态样式宣布真机通过。

`useCanvasSelectionActions` 的 graph writer 入口为 `getDocument()` + `commitGraph(next,{expectedGraph:raw})`；严格 true 且当前owner有效才发布selection/panel，旧callback绑定创建时文档key。group layout仅委托 `onGeneralGroupCommand(groupId,{type:'layout',mode})`，virtual selection保留100px布局。复制先用 `projectGraph` 投影source originals/edges，再生成新ID，不能把projected身份替换CAS expected；Graphprevious/next和副本保留最后150ms草稿，投影/CAS失败不部分提交。解组同次移除组边、匹配source link和direct孩子专用布局字段，保留scriptRowHiddenUuid/rows；嵌套重挂父是既有本机协议。无writer的旧change undefined成功仅为兼容路径。

下载入口为 `downloadAll(ids,{groupId})`，`downloadState.groupId` 只标记启动组；Viewport重读最新group成员后传入。取消持controller/documentKey/groupId owner，`cancelDownload(groupId?)` 拒绝旧文档或不匹配组；virtual无参数仍可取消自己的当前任务。真实AbortSignal/ZIP清理协议不变。context menu接实际contextNode隐藏组的无效settings，不将普通生成器面板套到group。

`script-group-controls-model` / `useCanvasScriptGroupControls` / `CanvasScriptGroupConfirmation` 只提供source分型、v1/v2确认与owner门控，空闲时不读取图。Viewport仅对当前显示的General组缓存视频/下载资格；pure计划先比较引用，不序列化无关媒体。真实执行按钮保持不可用；v1配置浮窗已由下方新批次接入；缺口包括toolbox editor/创建更新弹窗、character toolbar、完整run/stop、真实生成/费用/协作及运营服务，手机/Safari和大图性能继续另验。v1准确契约见 [新配置审计](../../../research/canvas-batch-video-configuration-source-audit.md)，普通resize由下方独立模块接入。源码、接线、该工具栏批次完整275文件/2929测试与构建结果及原生桌面/窄屏证据见 [普通源码](../../../research/canvas-ordinary-group-controls-source-audit.md)、[脚本源码](../../../research/canvas-script-group-toolbar-source-audit.md)、[接线审查](../../../research/canvas-ordinary-group-integration-audit.md) 与 [组操作验收](../../../research/canvas-general-group-controls-functional-audit.md)，不以工程检查证明所有组功能完成。

`useCanvasAutosave.flushGraph` 接已提交当前document的nodes/edges，立即持久化图与草稿；不得等旧Reacteffect覆盖刚生成/溢出的图。失败保留pending和当前graph，可撤销/导出/重试。共享 `useGraphPointer` 可选 `clickCaptureSelector` 仅调整实际click目标捕获；Canvas仅匹配标题span以同时支持拖动与原生双击，Alt复制仍转board。更多source/原生浏览器与容量边界见 [设置验收](../../../research/canvas-storyboard-group-controls-functional-audit.md)。

共享Pointer和Touch的旧owner清理、native listener及初始媒体模式采用layout生命周期，确保新ready DOM的首次事件不被迟到passive cleanup取消。输入仍按ready/readonly和文档身份门控，blur/hidden/原生取消仍清手势，不改变本机4px阈值。立即观察压力回归同时检查capture、位置、parent、一次history和生产保存；原强断言保持。

普通组resize规则在 `domain/group-resize-model`，view在 `CanvasGroupResizer`，controller在 `useCanvasGroupResize`。source preview依据down/current flow差floor与八向extent，左上反向补偿真实direct孩子；final接tB12padding及direct ordinary parent pF20/56。同group源measured candidate与最终stored不混淆，当前注入手工renderer canvasNodeSize。controller只将preview交Viewport，canonical graph最终一次raw CAS，Graph负责末次draft/history，flush读同步committed graph。didResize记录途中有效变化，回到原点不能误当未动。Escape回原focus，捕获后的board click/dblclick要过滤，modal接管先取消，不另建dialog stack；缩放中暂藏toolbar和旧bounds加号。完整范围见 [尺寸验收](../../../research/canvas-group-resize-functional-audit.md) 与 [源码](../../../research/canvas-group-resize-source-audit.md)。非零origin、自身expandParent和特殊直接parent重排仍未接；此处本机preview提交边界不是原站collab事件序列。

v1 图片组配置由 `useCanvasBatchVideo` 协调纯 config/graph/viewport 与 `CanvasBatchVideoConfiguration`，专用19模型目录独立 useContent 加载/失败/重试，不能以全video schema猜支持。共享 GeneratorSettings 的内嵌高级/suppressCount/promptMention选项默认关闭；只有该caller按source开启。表单不写组或全局偏好；实际提交只建空视频及引用，不执行生成。费用/审核通过可选 `storyboardVideoSource`（契约在services）注入，默认未知/阻断，不能伪造授权。Quota保留图与表单，仅重试保存；关闭/切文档/pagehide/源错误隔离迟到结果。100ms新组fit受用户新选择和pointer接管保护，nested Escape与原view/opener分别维护。准确source、本机适配、实际NodeCanvas回归与原生输入阻断见 [配置验收](../../../research/canvas-batch-video-functional-audit.md)。该历史批次未接的v2逐镜配置已由下方新批次接入；真实写服务与原生桌面/窄屏仍未完成验收。

ScriptV2视频配置由 `v2-video-config-model` / `v2-video-graph-model`、`useScriptV2VideoConfiguration`和`ScriptV2VideoConfiguration`分别维护纯配置/建图、异步事务与视图。全局34模型目录独立useContent，实际caller不传上游图片settings；入口包括全屏合成提示词阶段和下方新浮动toolbar，不需要linkedImageGroup。显示行临时重新编号，建图仍用原rows/shotNumber；选镜、durationMap和config只在窗口临时保留。混合模式的最小参考数逐镜判断，portrait与star-video2强制规则/60天真实证明及原URL续传通过services契约协调。提交一次raw CAS/history，成功同步保存后关闭父编辑器并回画布；Quota保留已建图，只重试保存。100ms定位、审核及pagehide/源变化均有owner和用户接管门控，嵌套菜单portal留在dialog-stack隔离范围内。源码与具体适配见 [v2验收](../../../research/canvas-v2-video-functional-audit.md)；真实服务与原生桌面/窄屏继续另验。

ScriptV2快捷入口分为 `node-toolbar-model`、`useScriptNodeToolbar` 和 `ScriptNodeToolbar`，只协调source四动作，不能再维护第二套table/prompt/video或graph writer。Viewport只交selection/屏幕锚点/board portal；v2不再显示通用复制/编辑条。图片/视频outputReady和CSV allReady分别门控，video资格是mixed最小1参考候选；当前普通单选接线不涵盖显式reference/mark/focus target。请求先flush原prompt controller再重读published raw graph；跨doc/权限/选择/状态变化取消，idle不读图或挂监听。pending保活动opener，由同步锁拒绝重复点击；portal拦pointer、click、doubleClick和Space冒泡，保Space默认与Escape。重新生成共用dialog-stack、不清rows/提交假任务；该批图片使用旧adapter，当前r3/sC由下方独立模块接入，旧统计不验收新实现。source32px在未clamp位置成立，边缘/窄屏为适配。具体测试、原生阻断与剩余范围见 [快捷操作验收](../../../research/canvas-script-node-toolbar-functional-audit.md)。

ScriptV2图片配置以 `v2-image-config-model` / `v2-image-graph-model`、`useScriptV2ImageConfiguration`、`ScriptV2ImageConfiguration` 分持纯表单/建图、owner事务和视图。image20目录独立useContent；raw index Set、最大refs能力、schema原key和typed enum独立于视频。fresh action边界以最新rows覆盖state.rows保索引，不凭旧prompt放行、不暗改model。普通vertical空组、refs边与link-only一次CAS/history/flush；Quota仅重试保存，成功保父编辑器/选择/视口，不能沿video fit。source raw placement避重叠及grow-only mount布局按一次计划表达；本机保存/取消、安全mode-object、窄屏布局均明确是适配。实际App、源码与原生输入阻断见 [图片交接验收](../../../research/canvas-v2-image-functional-audit.md)，真实服务、完整renderer、原生桌面/窄屏、真机/Safari和大图仍未验收。

ScriptV2卡片分型、compact阶段与任务文案在纯 `script-card-model`；`ScriptCompactProgress` 是静态提示，`ScriptCardSurface` 分派五种形态，`ScriptCardTaskStatus` 只显示源任务与本机编号复制。不得把 recompute 当全脚本任务，或拿普通 task 百分比代替逐镜平均。CanvasScriptNode保同owner当前编辑阶段，外部请求用fresh raw node校验并消费被阻断请求；旧请求不能在权限恢复后自动重开。卡面允许共享pointer拖动，interactive/portal隔离，Space不prevent默认；legacy表格行为保留。保存失败manual草稿仍用原baseline/hiddenUuid重试，不新增第二套writer或history。源码、实际NodeCanvas回归与服务/native边界见 [卡片验收](../../../research/canvas-script-card-functional-audit.md)。

## 单边分镜解绑维护（2026-10-14）

前文388 / 5370及“分镜断线仍缺”为整图删除批次的历史状态，后续已接单条连线双击。纯 `domain/storyboard-unlink-model` 持源资格、原文案、binding identity 和 preserveEdge 计划；`domain/node-data-update-model` 只给解绑提供 patch 规范化。node / edge 的 `batch/useCanvasDeleteConfirmation` / `useCanvasEdgeRemoval` 分别描述业务操作，共用 `hooks/useCanvasGraphConfirmation` 的 opaque owner，view 继续复用 `CanvasDeleteConfirmation` 与唯一 dialog-stack。切文档 / A→B→A、失去 ready / 可写、卸载或更新请求退休旧回调；同 ID edge 实例替换和 binding 变化拒绝旧请求，最新 prompt / raw rows / 位置则允许重读。取消零图 / 历史写；同步 false / throw 保 dialog 重试是本机适配，不是源 finally 关闭与异步等待协议。

edge adapter 必须先检查严格 editing continuation lock / phase / sourceNodeId，再判断 legacy raw script↔group 和 group↔group 特别确认，不能增加 editing target 类型 gate 或把直接 script-v2 边升级为 warning。group↔group 优先 source 侧 sourceId，关联源须实际存在，检查 direct child truthy hidden UUID；source 不合格不回退 target。direct unlink 优先匹配 image link；其他边按 target→source 仅清 video group 的关联。script 字段只在当前值精确匹配时清，group 清 sourceScriptNodeId / storyboardTitle，rows / params / childNodeIds / 所有孩子 / 布局 / 资源 / hidden UUID / 版本保留。

公共 `unlinkStoryboardEdge(edgeId)` 先核 owner / editing / 资格，投影全部最新普通与脚本 channels 后再核，preserveEdge unlink 与 raw edge 删除计划在原 raw graph 身份上一次 CAS / history，成功后才 consume。不要把 projected graph 当 expectedGraph，或在失败 / CAS 竞争时提前消费输入。Quota 保存失败保已接受图，仅重试保存。name-label 在 patch 与 merged data 各正规化，只删本次 patch 的 top-level undefined，旧 own-undefined 与旧 taskInfo 保留；当前 helper 仅 unlink，不能当完整 updateNodeData / loading / prevTaskInfo 已完成。

Root 最终官方 Node24.19.0 完整 `npm run check` 的 session2868 terminal exit0：**393 文件 / 5459 项**通过，04:36:07 / 208.38s，Vite7.3.7、3579 modules、build31.55s；格式、零警告 lint、architecture 与核心 strict 检查通过。1161 source/config/test 路径冻结不变，本批新增11文件、修改10个既有文件。旧388 / 5370仍是前一批整图删除检查。第一次 formal session16147 exit1，两个旧 focus 测试失败且未运行 build；独立13项通过后，以15秒总预算及等待实际 region ready 修正测试时序，保留最新150ms / graph / history 强断言，联合27项通过后重新运行正式完整检查，不能把失败那次或专项检查当全量通过。

正式结果见 [完整日志](../../../artifacts/canvas-storyboard-unlink-final-check.log)、[源码快照](../../../artifacts/canvas-storyboard-unlink-current-source-snapshot.json) 与 [产物复核](../../../artifacts/canvas-storyboard-unlink-final-build-proof.json)。实际 App14、edge owner28和 Graph API6各自验证入口、owner与最新草稿 / CAS / 一次 undo，范围与修前失败见 [分镜断线验收](../../../research/canvas-storyboard-unlink-functional-audit.md)。原生 GUI 使用101节点 / 32边代表作品，两条 legacy 边的取消 / 确认、一次 undo / redo / cold reload完整文档比较、真实 CSS390窄屏和无 X / 遮罩 / Escape已有16项断言、11份GUI导出；这不将 V2 / group↔group / editing / 150ms 的受控回归冒充同样原生验证。

单边 adapter 不覆盖 source mixed edge batch 的 ordinary / editing 先执行、随后脚本 warning与取消不回滚，也不覆盖 confirmed node-delete 跳过第二 modal等。VIDEO / AUDIO→VIDEO_CLIP mD 的纯 timeline 双正规化、主轨紧排 / linked audio / 转场 / 时长、整体授权与等待后重算及异步 controller仍未接；原 locks / collaboration / versions不等于同步 CAS。特殊 renderer、真机 / Safari / 高 DPR / 大图与真实生成、费用、上传、审核及运营写服务仍待验，本机未部署，全站复刻目标继续进行。
