# Script v2 批量视频配置：纯模型与源码协议

范围：静态阅读公开客户端，不运行 bundle，不调用原站生成、审核、保存或账号接口。字符位置均为 UTF-8 解码后的零基准位置。本文件属于 `v2-video-config-model.js/.test.js`；旧 `video-model.js`、v1 `batch-video-config-model.js` 保持独立。

## 入口和数据边界

`3u6hjewm8qox_.js` 的 `rg` 定义 @1119955，参数为 rows、可选 initialImageSettings、scriptAssets、getNodeUrl、opened、onClose、onConfirm 等。实际 ScriptV2 host 的 t4 @1381785 明确传 `initialImageSettings:void0`，不是从已生成图组读取设置。t6 打开使用全部脚本 rows，不使用表格现有选镜。rg 调用 @1391298；t8 @1382032 在建组成功后关闭，100ms 选择新组，400ms/padding .15 定位。

v2 使用 `global.support.video`，不是 v1 的 `support.storyboardVideo`。`research/source/api/config-182.json` 的 `data.linkUrl` 是 JSON 字符串，其 video 有 34 项，storyboardVideo 有 19 项。Root 提取的 `public/data/video-model-support.json.items` 是这 34 项的原目录；models 仍使用公开 `models.json.videoModels`。目录加载/失败/重试属于 controller，纯模型不把 undefined 的加载状态伪装为成功加载。纯 catalogue 的空目录回退行为只描述源码函数，caller 在实际初始化前须等待加载完成。

资产及引用由独立 `describeScriptV2VideoReferences` 提供。其全行 `refCounts` / `refsByRow` Map 保留全部 truthy UUID 行，当前 selected Set 仅决定 maxRequiredRefs。纯配置不读取图、React、存储或服务。原 `aH` @1109620 检查全部角色、场景、道具资产：thumbnail 非空可满足资产就绪，真实逐镜参考仍由 linked node 的当前 URL 构建；thumbnail 就绪不能冒充可用参考。引用数与资产总就绪是两个 gate。

## 模型目录与 mixed2video

- `ez/eV/eB` @726846–727876；rg 目录 @1120950。mixed2video items 必须是至少两项的有限数字数组，最大值 >0 且 >=最小值。mixed2videoConfig.imageMax 为有限数字时限制最大参考数，再下限归零。
- requiredRefs 非有限值按零，负值限为零。正值小于最小值不可用；零可用于初始化。大于最大值仍 `usable:true`、`willTruncate:true`，rg 另以每镜超过上限禁提交；不能提前删除这个模型来掩盖超限提示。
- support 顺序中过滤 `usable` 的模型，首项为默认；无项则 global default.video。没有 v1 Kling 优先、没有 image2video/singleImage2video 回退。固定 modeType=mixed2video。
- `rc` @1119508 只按 modelKey 为字符串过滤坏项；`ru` 保留 metadata 的 modelName→displayText→schema.displayText→schema.modelName→key、icon、disable。
- `2d7o7lhh0s06l.js` module255534 @13462/14011 的 disable：true、非空 trim 字符串或有自有字段的对象禁用；原因取当前语言字符串→en。false/null/空串/空对象/数组不禁用。rg 目录不提前排禁用项。
- 共享 chip `aZ` @1111180 自身有 effect：当前 model 被 support.disable 禁用时，选择第一未禁用选项；全禁用时保留当前值，禁确认。纯 create/reconcile 收敛该实际 view effect，不另建自动首个模型策略。

## 初始化、切换与比例提示

`ra/rr/rs/rl/rd` @1118335–1119508：

1. config.settings 为数组时直接使用；否则 mixed2video 键 nullish 回退 text2video，再空数组。
2. 每个普通字段仅复制 property.default !== undefined，存 originalField ?? key；不补 enum 首项、不 clamp、不做通用 mode 推断。
3. property 中存在 enableSound 键就强制对应 storedKey=`on`，不检查 enable。它和 duration 不在普通参数栏展示。
4. advancedSettings 仅初始化 autoCompliance（存在、enable!==false、default!==undefined）；不展示通用高级区。
5. 可选上游比例通过 `1kb-4b4zv9_2a.js` module713118 的 extractRatioFromSettings @1725：ratio→其余 ratio* 的对象顺序→aspectRatio，trim/跳过 auto。`rs` 只对 ratio* 且 default 是数字比例字符串、enum 包含继承值的属性写 storedKey。实际 host 不传上游配置，不能声称当前入口继承图组。

rg 首次 opened effect @1121746 初始化一次。模型切换 J @1123471 重新初始化目标 settings/advanced；仅旧 `settings.ratio` 是 string 且目标当前普通字段允许该比例时保留 canonical ratio。其它参数、私有高级值不带到新模型；逐镜 duration Map 不变。

普通 setting callback ec @1125513 按 storedKey 写值并再强制 sound=on；只有 storedKey===ratio 才置比例编辑标志。该标志仅 suppress 继承 tooltip，不是通用 dirty/未保存确认。模型切换和 row 更新不清它，重新打开清零。

`ri` @1118648 从当前普通字段 key.startsWith(ratio)、数字比例字符串 enum 取允许集合，减去 rules 的 recognized ratio 禁用值。recognized ratio 为 originalField===ratio、key===ratio 或 /^ratio_\d+_\d+$/。集合 <=1 时锁 ratio；当前 canonical ratio 有值时提示“该模型固定为 …”；否则已编辑不提示，未编辑且传上游值时提示继承。ratio 被 rules 禁用也不自动 fallback。

## 参数规则与纯投影

原 SettingsRules 为 `34q64t3bi91ws.js` module440398 @105616，evaluate @106076、sanitize @107374。本模型使用独立私有、源码等价规则适配；不能直接复用当前通用 generator sanitizer，因为两者有可证差异：

- 规则必须有 conflict>=2、when 对象或 inputWhen 对象。仅 forModeTypes/override 的规则被 source 丢弃。
- conflict 展开后丢弃原 when/inputWhen/override，仅保留由其它 conflict 项构建的 when、目标 disable，以及 fallback/forMode/message。
- 当前 context 为 mixed2video、imageList1/videoList0/audioList0。typed equality 和 Set 保留原值，不把数字转成字符串。
- disable union；override 后者 merge；每字段首个 message。fallback 在已禁当前值的字段上取第一个 matches 的 expanded rule；该 finder 不重复 forModeTypes 检查，是源码可证 quirks。
- rg @1124699–1125513 若无显式 fallback，会从当前普通字段 enum 找首个未禁用 typed 值；写回排 ratio 类属性。该 source effect 可触发后续 rule effect，本模型逐次收敛并保持无改动引用。
- 同状态循环或超过有限收敛上限的损坏规则原子拒绝，是本机防坏 schema 适配，不宣称 source 对循环也有保护。

普通参数栏 W @1122432 / JSX @1135230 仅排 property 不存在、barOnly、enableSound、duration，不按 enable/batch/visibleWhen 过滤。fields 投影保留 property/storedKey/value/override/typed disabledValues；view 只负责展示。source 实际可渲染字段须有非空 enum、component=slider 或同时存在 min/max。numeric 是 slider，或同时 min/max 且没有 enum；enum+min/max 仍是 chip。数字显示按 override/property min/max/step，缺 numeric 值取 Number(property.min??0) 后 clamp；onChange 有限值 clamp，不舍入。typed enum 和文案由 view 保留。

## 临时选镜与逐镜时长

rg row effect @1122956：初次打开全选 truthy hiddenUuid，每镜值为 row.durationSeconds。期间 rows 更新：选择仅保留仍存在的 UUID，新行不自动选择；保留已有临时 duration，缺值 nullish 回退新 row.durationSeconds。关闭再打开重新初始化。展开由 view 持有，初始化清空，源更新 rows 不强制清展开。

`eK` @727995、exports @739735/740026：duration enum 只收有限 numeric primitive 或 object.value numeric，保留顺序/重复，不收数字字符串。无有效 numeric enum 再取有限 min/max（max>=min），正有限 step 否则1。无约束仍拒绝非有限值。slider 支持基于 min 的步长，绝对误差严格 <1e-9，不能用旧 helper 的1e-6。

模型切换不 snap 临时时长。enum 仅一个或 slider min=max 表示固定；某镜当前非法仍能改至合法固定值。validation 提示使用当前临时值判断，但文案“脚本表格为 …s”仍取原 row.durationSeconds @1126313。临时 Map 不写回原 script。

## 提交资格和真实 payload

- selected 逐镜时长错误、缺真实资产引用、超过当前 max、完整资产列表未就绪、selected 空提示词均禁按钮。tooltip @1129940 优先顺序依次为这五项，最后“创建视频生成器组后，可在画布中整组执行批量生视频”。无选择/目录/当前模型/禁用也禁按钮，但 source 不为这四项另改该 tooltip。
- eP @1128655 guard 漏掉空提示词，但 JSX @1137259 包含；本机 `canConfirm` 按实际正常按钮行为禁空提示词。该差别明确记录，不外推 internal handler 漏项为合法 UI 功能。
- eP 按 selected Set 迭代顺序构建仅有限 numeric 的临时 Map。先调用 a8，以 `{...config.advancedSettings,autoCompliance:1}`、forceAutoCompliance:true 做实际资产校验，然后 `onConfirm(buildBatchVideoSubmitConfig(config,schema,N),durationMap,selectedSet)`；三参数不能改成 v1 的 row 配置或收费请求。
- buildBatchVideoSubmitConfig @739412 保留 config 并添 modelSchema；capability 可用则 mode=mixed2video，否则保留当前 mode。纯 build helper 不做服务调用，返回这三个参数的容器。
- rg 无费用请求/费用展示，无偏好保存。Modal 禁遮罩/Escape 关闭、header busy 禁用；本机 dialog-stack/非 busy Escape、busy互斥和 raw graph CAS 属 controller/view 明确适配。

## 本机 API 与验收

`createScriptV2VideoConfigState({rows,models,support,requiredRefs?,referenceDescription?,initialImageSettings?,language?})`、`reconcileScriptV2VideoConfigState({state,rows?,...context})`、`changeScriptV2VideoConfigState({state,command,...context})` 返回 `{valid,state,reason}`。state 为 `{rows,config,selectedHiddenUuids:Set,perShotDurations:Map,ratioEdited}`。unchanged reconcile 保持引用，适用于 controller layout 生命周期。commands 为 model/value、setting/field/value、toggleRow/hiddenUuid、toggleAll、duration/hiddenUuid/value。

`projectScriptV2VideoConfig({state,...context})` 返回 schema/catalogue/options/fields/rules/capability；比例锁及提示；durationConstraint/Description/Fixed/FixedValue/ValidationByRow；选中计数；全行 rowWarnings；selected missingReferenceRows/overLimitRows/emptyPromptRows/durationErrorRows 及提示、assetsReady/canConfirm/confirmTooltip。referenceDescription.refCounts 若提供则按当前 selected 重新计算 N，不使用旧 table selection 或旧 requiredRefs。

共享 exports 为 resolveScriptV2VideoCapability、extractScriptV2VideoDurationConstraint、isScriptV2VideoDurationSupported、describeScriptV2VideoDurationConstraint、resolveScriptV2VideoCatalogue、SCRIPT_V2_VIDEO_MODE。`buildScriptV2VideoConfirmPayload({state,schema,requiredRefs})` 返回 `{config,perShotDurations,selectedHiddenUuids}`；snapshot Set/Map 是本机 async owner 隔离适配，原调用传当前 Set。

重复 truthy row UUID、非字符串 truthy UUID、重复目录 modelKey 原子拒绝，防止本机菜单/Map 静默绑定另一镜或模型；源码使用 Map/Set first/last 行为未做这些 integrity guard。缺 UUID 仍按源跳过，不造 ID。source 回调 `Number('')=0` 保留纯函数边界，但 view 不将空 NumberInput 提交；不能误把两者当矛盾。

专项验证 2026-10-12 03:42:57：owned 模型 1 文件 / 66 项全部通过，448ms；日志 `artifacts/canvas-v2-video-config-model-tests.log`；定向 ESLint 0 错误/警告，Prettier 通过。覆盖 typed duration/strict tolerance、min/max 参考边界、video34 实际样本、source规则 quirks、row动态选择/时长保留、模型切换及 disabled chip effect、无改动引用、完整提交三个参数、错误 tooltip 顺序与本机防坏资料。后续联合与全量结果由 Root 补充，本文不宣称已经完成。

静态审计和本机夹具不代表原站账号、真人审核、真实生成或浏览器桌面/手机交互验收；没有虚构费用、权益、审核成功或生成结果。
