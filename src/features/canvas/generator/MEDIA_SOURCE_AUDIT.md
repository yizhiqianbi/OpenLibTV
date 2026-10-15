# 生成器媒体模式与输入纯规则

2026-10-11。本批仅新增 `media-input-model.js`、对应测试和本文。未修改 Canvas、Inspector、现有 schema 或全局文档；根代理负责 UI 与生成前接线。没有账户、上传、生成或生产写入请求。

## 公开源码证据

- `research/source/0leiedr1esdbe.js` **469850**：`MODE_TYPE_CONFIGS`、`computeModeTypeAvailability`、`filterVisibleModeTypes`、`getBestEnabledModeType`、`getIgnoredMediaListTypes`。十种视频模式的固定顺序、范围、排除配置、组合兼容性、mixed / edit 各类上限、long-video 支持开关、忽略素材提示及自动优先级均从该模块核对。普通菜单隐藏 audio2video；mixed 放在 text2video 后。frames 最大数量小于 2 时名称为“首帧”。
- 同一 chunk **98844**：Seedance 2.5 模型为 `star-video2.5` / `star-video2.5-draft`，或 modelVendor 为 `star-video2.5`；其 videoEdit 使用混合列表协议并可接受配置允许的音频。
- 同一 chunk **417754**：连接节点媒体收集、group / video_group / video-story 最多八层展开、分组排除节点、虚拟边排除、characterRef、refImages 与 focusRegion 排除。图片优先 originalUrl，hidden / watermark 使用当前 url；每节点当前首项媒体。resourceMeta 提供媒体尺寸与 durationSec。图框尺寸不能当作素材尺寸。
- `research/source/02z8me9-jovnu.js` **493983**：图片有参考图时 image2image，否则 text2image；有图片才按 image2image min/max 检查，无图片时模型媒体兼容性为 true。
- 同一 chunk **396567**：音频优先 image2audio，其次 audio2audio，否则 text2audio；图片和音频同时连接不兼容。无图/音频时仅保留目标 schema 支持的 text2audio / lyrics2audio；textModes 无配置时回退 text2audio。
- 同一 chunk **194387**：extraConfig 的有效条件为非空 scene、schema 对象、非空 models 数组；caller 位于 **node.data.extraConfig**，models 为记录，caller 读取每项 modelKey。模板 `schema.config === false` 单独标记配置锁定，不能擦掉基础 schema.config；properties 合并排除 portrait / autoCompliance；保留原拼写 `defaultProperity` 的 default 覆盖。
- `research/source/2iru1o_jok_2m.js` **378565**：mediaConstraints 优先当前 mode.video，否则 global video。URL 后缀、duration、height、width、longSide、shortSide、size；范围端点包含在允许区间内，block 与 warn 分开并去重。原异步层使用 video metadata 和 HEAD Content-Length，并在探测失败时跳过未知字段。
- `research/source/2_j26j0yfra03.js` 规则模块：require all / any、forModeTypes 和 whenHas。whenHas 不满足时跳过该规则，不能把音频分支提示应用到空输入。显式 rule.message 优先。
- `research/source/3shzcyguvjig6.js` 请求转换：derivesDurationFromVideo 取 videoList 与 mixedList 中视频的最大 durationSec 后 Math.floor；没有有效值时不覆盖 duration。
- `research/source/34q64t3bi91ws.js` **92105 / 440398** 设置 UI：hiddenKeys、lockRatioOnly、forceSingleCount 是组件 props，当前归档未确认普通生成器 caller 将它们映射到哪一 node 字段。segmentRemakeLock 明确自动隐藏 fieldKey 以 ratio 开头的设置；lockRatioOnly 仅锁 ratio 字段。不能制造 node.data 同名开关。long-video count=1 已由现有 schema 与公开配置确认。
- `research/source/2ijgtfwpg93os.js`：本批视频模式名称、禁用与忽略素材提示的中文原文。

## 接线 API

`collectGeneratorMediaInputs({ target, nodes, edges, metadataByNodeId? })` 返回 imageList / videoList / audioList。每项保留 nodeId、url、label 和原引用字段；已验证 metadata 为 width / height / durationSec / byteSize / extension / mimeType。默认从匹配 kind 且 sourceUrl 匹配的 resourceMeta.items 读取；显式 metadataByNodeId 可由根代理的取消探测层注入。不能读取 node.width、node.height 或 data.duration 来补缺失值。旧参数中的有效列表与连接媒体去重合并；blob / uploading / pending / error / 空 URL 排除。明确 localMediaReady=true 的完成 data URL 是现有本地演示适配，不表示服务器上传成功。metadata.extension 是可信探测层提供的本地适配；普通格式检查使用实际 URL pathname，不从 MIME 猜扩展名。

`generatorMediaModes(schema, inputs, { type='video', includeAudioInMixedList=false })` 返回 `{ all, visible, compatible }`。all 保留隐藏模式，visible 是实际视频菜单的过滤/排序。每项含 key / label / icon / enabled / disabledReason / warningReason；long-video 有 Beta。默认 mixed 数量只包含图片和视频；源码导演调用明确 includeAudioInMixedList=true 且 audioMax>0 时，音频才进入总数。

`inferGeneratorMediaMode(schema, inputs, { type, currentModeType, includeAudioInMixedList })` 是**自动候选策略**，不能在每次渲染/参数修改时无条件覆写用户的显式视频模式。source getBestEnabledModeType 在已有媒体分支不检查 currentModeType。根组合层应先保留当前合法选择，失效才采用自动候选：公开 optimizedPrompt caller 先验证当前模式，成功即保留，失败再尝试自动/其他 enabled 候选；导演 normalize 同样先保留合法模式，pictureEditLock / segmentRemakeLock 直接退出。节点转换为 VIDEO 的 caller 明确用自动策略处理新组合。普通 VideoGenerator effect 的完整触发顺序尚未归档，不能据这些 caller 声称已核实。

`validateGeneratorMediaInputs(schema, modeType, inputs, { type, prompt, includeAudioInMixedList })` 返回 `{ valid, sourceAccepted, complete, blockMessages, warnMessages, unresolved }`。菜单模式及 require 规则检查与真实 per-mode / global 视频约束共用。unresolved 为 `{ nodeId, url, field, action }`；缺格式、尺寸、时长、文件大小不填虚构值。sourceAccepted 仅说明已知字段无 block；**valid 必须同时没有 block 和未知约束**。这是比原探测失败静默跳过更明确的本地服务边界；UI 可显示“参考素材元数据尚未验证”，不能描述为素材已合法。warn 可与 valid=true 同时出现。

`ignoredGeneratorMediaTypes(schema, modeType, inputs)` 返回会被忽略的 image / video / audio 类型；不删原 parts、参数或引用。菜单 warning 按源仅列出图片/视频，完整 ignored 列表也可供提交前说明。

`mergeGeneratorMediaSchema(schema, extraConfig)` 返回 `{ schema, configLocked, modelKeys }`；不修改入参。只有真实 node.data.extraConfig 才传入，不新增模板样本或锁定控件。

`generatorSettingLocks(schema, params, { inputs=params, hiddenKeys=[], lockRatioOnly=false, forceSingleCount=false, configLocked=false })` 返回 hiddenKeys、lockedKeys、lockedStoreKeys、settingsPatch、unresolved、forceSingleCount、count、modeLocked。fieldKey 与 originalField 分开，ratio_auto 的存储键为 ratio。settingsPatch 只派生已知视频时长；存在未验证视频时长仍返回 unresolved。根代理不能因部分已知时长就认为整体最大时长已确认。

## 已检查与保留边界

定向真实公开 models.json 测试 **1 文件 / 15 项**：节点元数据与图框区分、去重/排除/上传态、本地完成媒体、菜单排序与 mixed-audio 开关、组合上限、自动模式优先级、排除模式与零 min、long-video 开关、ignored 警告、图片/音频推断、whenHas、真实视频边界/格式/warn、未知元数据、全局尺寸/大小、模板合并和锁定、派生视频时长。格式检查与零警告 ESLint 在冻结前运行。它们不是浏览器验收或真实生成验收。

本模块不探测 DOM/HEAD、不写 params、不切服务账户、不计算权益/费用、不发生成请求。模式和参数 UI、异步 metadata 探测、保存/恢复与集成回归由根代理接线后验收。subjectList 的共享主体限额及 video-subject 禁用属于 469850 的独立主体规则，尚未合入这个三类媒体模型；Seedance compliance 图片格式/300–6000边界/比例/30MB、音视频专用门槛在275704及124189，当前普通提交 caller/合规 gate 未完成确认，不能对所有模型无条件套用。运营服务未连接时仍必须保留明确不可生成状态。

## 节点引用动作后续接入（2026-10-11）

原 417754 使用 url[0] 且保留空 URL 节点；482487 picker 选择首个非空 URL。为避免本机过滤空 URL 后导入成功却无 token，当前 generator consumer 选择首个非空 URL，v2 原 payload 数组完整保存。未验证 metadata 仍为 unresolved。这是明确本机健壮适配，当前证据见 [引用动作审计](../../../../research/prompt-reference-actions-functional-audit.md)。

## VIDEO角色库后续接入（2026-10-12）

2026-10-13后续：Generic／ScriptV2／实际加载错误态共用surface测量，title／固定toolbar避让、上下翻转／限高滚动是用户授权本机适配，source collapsed仍固定下方。输入不继承3D反馈；普通IMAGE排序only typed与literal，VIDEO重映射后消费CAS正文，原delete store链另验。375／5108完整check、1129SHA与准确原生／受控范围见 [节点面板验收](../../../../research/canvas-generator-vertical-functional-audit.md)。旧CSS输出全字节／导入顺序和四个lazy实现不变量保持；本机未部署、真实服务／特殊renderer／手机Safari／大图继续有缺口。

真实rr角色入口／公共目录与Seedance媒体选择已分离至`roles/`，typed运营source默认unavailable，不请求账号资源。容量与主体rb独立，三媒体证书字段由两真实collector共用`roleMediaReferenceMetadata`；IMAGE／VIDEO时间及InPlace语义、AUDIO只assetId按417754源码维护。引用图一次CAS／history／flush，最新prompt清Magic、显式next draft跳过与输入接受避免token复活，Quota不重跑审核／建图。portal click隔离防背景失选，CSS旧级联与generic按需入口保持。证据与真实App／native范围见 [角色库验收](../../../../research/canvas-role-library-functional-audit.md)。真人目录／分组／签署／QR、历史图库、VIDEO／AUDIO重核writer及主体rb仍未全部接线；默认服务未连，正向fixture不表示原站授权、生成或目标完成。

2026-10-13后续普通删除（以下379／5193及缺口为该历史批次状态）：完整store collector／稳定ID reconciliation已接，typed/mixed token清理与最后草稿一次CAS/history，Inline接受取消旧timer；group计全部leaf，Role final after共用规则。379／5193完整check与1135冻结、实际App／native范围见 [删除验收](../../../../research/canvas-reference-delete-functional-audit.md)。IMAGE排序only-order仍有效；上述“delete另验”是上一轮历史。特殊锁、全局cascade、lens/style/focus和Role初始adapter当时仍有前端缺口；后续删除进展以下节为准。本机未部署。

## 媒体输入删除后续状态（2026-10-14）

`reference-recalculation-model.js` 现在承接完整 post-delete 源状态：old raw typed arrays / old mode 的 token 清理与重编号、`pictureEditLock` 最后视频整套 params reset、submitted segment 的 lock / draft / Range 清理、editing continuation 的目标 cascade 均已补。style / lens effect 与 SCRIPT style、panorama 第一张原始 incoming image 的专属状态也已加入纯重算。全局 node / edge 与普通卡片删除已接 GraphActions，当前文档的输入、raw graph、一次历史和保存一致；这不把全部特殊 renderer、模式 effect 或媒体播放当作已验收。

收集媒体可展开 group / video_group / video-story 的 leaf，和普通组 UI Delete 的资格不是同一协议：普通 UI 只按 `group` / `video_group` 扩展 `parentId` 子树，raw 父组删除释放孩子，显式解组维护世界位置。存活 group consumer 的即时清理是 bounded `reconcileGroupConsumers` 本机 opt-in，沿旧 ancestry 和真实 outgoing targets 更新，不扫描全部生成器；源 store 本批证据没有这一即时更新保证。

旧379 / 5193、1135冻结仅对应2026-10-13普通参考删除。本轮 Root 最终官方 Node24.19.0 完整check为 **388 文件 / 5370 项**，session34383 terminal exit0，03:32:29 / 170.04s，3573 modules、build16.77s，对应1150 source/config/test SHA冻结。正式日志 `artifacts/canvas-destructive-delete-final-check.log`；按纯规则 / 实际 App / native 分开记录的范围见 [整图删除验收](../../../../research/canvas-destructive-delete-functional-audit.md)。strict 仍只是核心 TypeScript，不是全部 UI 类型覆盖。

仍需接 source script / group edge 确认后的 `unlinkStoryboardByEdge`，以及 VIDEO / AUDIO → VIDEO_CLIP 的 `mD` timeline disconnect、原锁资格 / 失败 / 释放生命周期；这些不是 ordinary incoming `ig` 的别名，也不能仅因服务尚未连接而忽略其前端分支。IMAGE focus 降级、Core typed-order 生命周期、Role 初始 adapter、特殊 renderer、手机触摸 / Safari / 原生媒体 / 高频大图继续另验。生成、上传、审核、费用、协作及运营写服务仍未接；登录、账号与小号继续延期，本机未部署，整个目标仍进行。

## 分镜关联断线后续接线（2026-10-14）

上一节把 `unlinkStoryboardByEdge` 列为未接，指整图删除批次当时的状态。当前单条边双击已接特别确认、源关联清理与同次 edge 删除：raw legacy script↔group 的资格不同于普通 incoming 媒体重算；group↔group 按有 sourceId 的 source 组优先，否则 target，检查实际关联源与 direct child 的 hidden UUID。直接 raw script-v2 边仍普通断线。editing continuation 的严格 lock / phase / sourceId 条件先于分镜确认，任何 target 类型均可进入原 raw 删除目标计划，不将其误当普通 unlink。

解绑 direct pair 优先，其他边按 target→source 仅处理 video storyboard group；精确匹配才清 script 的 linkedImageGroupId / linkedVideoGroupId，image 推断优先，video 固定分支不清 image。group 存在时清 sourceScriptNodeId / storyboardTitle，保留 rows、params、孩子、布局 / 资源、hidden UUID 与版本。preserveEdge 的纯解绑和实际 edge plan 合为 GraphActions 一次最新全部 draft / raw CAS / history，失败不写图或 consume，接受后才退休输入。已接受图的配额失败只重试保存。普通组 UI Delete 子树与 raw 删除释放孩子的既有区别仍保留，bounded group consumer 即时重算仍是明确本机 opt-in。

node / edge adapter 共用 `useCanvasGraphConfirmation` owner，业务 identity 各自保留；过期文档、旧回调、同 ID edge 实例替换或关联改变不能提交，最新 prompt / rows / 位置可重读。确认继续使用唯一 dialog-stack 和源文案，无 X / 遮罩不关闭；取消零写和失败重试为本机实现边界。解绑专用 `node-data-update-model` 遵循 patch / merged data 的 name-label 与 undefined 规范化，保留无关旧 own-undefined 和旧 taskInfo；它未替代所有 updateNodeData / loading / prevTaskInfo 行为。

Root 最终官方 Node24.19.0 完整 `npm run check` 的 session2868 terminal exit0：**393 文件 / 5459 项**通过，04:36:07 / 208.38s，Vite7.3.7、3579 modules、build31.55s；格式、零警告 lint、architecture 与核心 strict 检查通过。1161 source/config/test 路径冻结不变，本批新增11文件、修改10个既有文件。旧388 / 5370仍是前一批整图删除检查。第一次 formal session16147 exit1，两个旧 focus 测试失败且未运行 build；独立13项通过后，以15秒总预算及等待实际 region ready 修正测试时序，保留最新150ms / graph / history 强断言，联合27项通过后重新运行正式完整检查，不能把失败那次或专项检查当全量通过。

正式结果见 [完整日志](../../../../artifacts/canvas-storyboard-unlink-final-check.log)、[源码快照](../../../../artifacts/canvas-storyboard-unlink-current-source-snapshot.json) 与 [产物复核](../../../../artifacts/canvas-storyboard-unlink-final-build-proof.json)。实际 App14、edge owner28和 Graph API6各自验证入口、owner与最新草稿 / CAS / 一次 undo，范围与修前失败见 [分镜断线验收](../../../../research/canvas-storyboard-unlink-functional-audit.md)。原生 GUI 使用101节点 / 32边代表作品，两条 legacy 边的取消 / 确认、一次 undo / redo / cold reload完整文档比较、真实 CSS390窄屏和无 X / 遮罩 / Escape已有16项断言、11份GUI导出；这不将 V2 / group↔group / editing / 150ms 的受控回归冒充同样原生验证。

此次仅接单边，source mixed edge batch 的部分先执行 / 取消不回滚及 confirmed node-delete 特例仍未覆盖。VIDEO / AUDIO→VIDEO_CLIP mD 的完整 timeline 双正规化、linked audio / 转场 / 时长、按 target 授权、等待后重算与异步前端 controller 仍待接线；真实 locks / 协作并非本机 CAS。IMAGE focus 降级、Core typed-order 生命周期、Role 初始 adapter、特殊 renderer、手机 / Safari / 原生媒体 / 高频大图与生成、上传、审核、费用和运营服务继续另验。本机未部署，整个目标未完成。

## 连线交互入口更新（2026-10-14）

上一节单边双击是历史运行入口。当前 `CanvasEdgeLayer` 以20世界单位透明hit、源独选／叠加规则和1000ms hover剪刀调用既有 `useCanvasEdgeRemoval`；双击只隔离pane，不再删除。普通／editing／legacy关联确认与最后草稿、raw CAS和一次history协议保持，readonly可选线而无剪刀。新入口的native Space不preventDefault，hand／held Space／活动pointer由当前owner禁写并在release恢复；命中、选择、最近点与生命周期分别留在pure／hooks／view。真实App旧删除／解绑断言改接剪刀而保完整图／输入／undo／quota断言。

源93摘录、5个新测试文件158项、14份真实GUI全字段比较与390px／10%／readonly边界见 [连线验收](../../../../research/canvas-edge-interaction-functional-audit.md)。这些普通边原生操作不代表全部legacy、editing或非空150ms输入均原生实测。selected-edge Delete、混合node／edge聚合／分段确认、VIDEO_CLIP异步mD、真实锁与完整特殊renderer仍缺，不能把单条剪刀扩称批量前端完成。
