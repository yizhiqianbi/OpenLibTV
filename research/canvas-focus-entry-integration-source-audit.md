# IMAGE focus 入口与当前生成器接线审计

2026-10-12。本轮只静态读取归档公开客户端、当前本机实现及真实 `public/data/models.json`，不运行原站 JS、不操作浏览器、不读写本地工作区、不修改生产或测试。本文补充 [完整 focus / mark 源协议](./canvas-media-focus-mark-source-audit.md)，只讨论 IMAGE focus 的入口、schema、确认后卡片、删除和模型降级。建议不等于已实现或原生验收通过。

所有 source 偏移为解码后 0-based 字符。原任务、上传、认证、费用与识别服务仍未接入。

## 1. Factory 和普通图片资源的真实门槛

`research/source/3u6hjewm8qox_.js`：

| 偏移 | 直接证据 |
| --- | --- |
| 139200–140400 | `GeneratorFactory` registry 根据 nodeType / generatorType 动态选 renderer。IMAGE DEFAULT 和 ENHANCE 是不同 lazy renderer；不可把 generic UI 同时解释为两种实现。 |
| 141821–143050 | `useHasNodeGenerator`：IMAGE 先判 `!isResourceAction(action) || isAssetSourcedImageNode(data) || !!showGenerator`，再判 `showGenerator ?? action !== IMAGE_EDIT`；还排 `picture_edit` / `subtitle_erase` 和 standalone grid parent。 |
| 860038 / 860224 / 873669 | 图片 renderer 的 `n0/n2/re` 同时判显式 target / 常规选中、resource/action、showGenerator、standalone、发布保护、图片展开与 practice suppression，并非只有 `type==='image'`。 |
| 888849–889320 | empty image 的图生图 upload 路径 `oy('imageToImage')` **新增**右侧 IMAGE 节点，action `image_generate`、generatorType DEFAULT、url[]，加原图→新节点边，再选新节点；没有把原图 action 改成生成器或简单将原图 showGenerator 置 true。 |
| 8893xx–890740 | 原图先接收真实 upload 本地预览与 `image_resource`，上传 continuation 成功/失败按当前 owner 检查；随后上述 `oy` 创建下游。实际服务器上传不在本机范围。 |

asset-sourced 例外是 `3shzcyguvjig6.js` @3617 的 `(portraitAssetId || portraitCompliantExempt) && !portraitCertifiedInPlace`，不是所有上传图、有 URL、local actor 或已登录图。

已直接找到 `image_resource + showGenerator:true` 的资产作者路径：`2mce1ay9u3g9g.js` @20607 创建资产组成员，@21768 创建上游资产图片；它们保留 resource action，并显式允许生成器。`3u6hjewm8qox_.js` @260944/261508 则是 slash preset 转成 IMAGE_GENERATE、设置 slashPreset 的专属流程。**本轮没有发现一个普通图片资源通用的“修改当前原件 showGenerator:true”动作**，不能把上述资产/预设调用外推给任意上传图。

## 2. 当前本机入口与明确范围差异

- `components/CanvasViewport.jsx` 的 `inlineNode` 当前只要求没有框选、没有节点拖动、没有 inspector、唯一选中，并按 image/video/audio type 取节点。它不检查 action、showGenerator、asset-sourced、generatorType 或 standalone parent。这是既有宽入口，不是 source Factory 的完整复刻。
- `CanvasNodeInlineGenerator.jsx` 复用 `useNodeGenerator`、prompt / references / model / settings / Frame；当前没有 focus chip、region card 或 focus controller 接口。
- `CanvasGeneratorEntry.jsx` 是真实 mount-on-demand lazy 边界；generic readonly 仍可加载展示，只读权限交由实现，不应因为本批 focus writable gate 把既有只读生成器全部删掉。
- `domain/uploads.js` 的本机文件上传节点目前有 `localMediaReady:true`、真实 dataURL / metadata，但没有 `data.action`。`mentions-enhanced/connection-inputs.js` 的显式 local adapter 已能将这种完成媒体解释成 `image_resource`。focus pure capability 的 unknown-action fallback 本身不能证明这类上传图有 source 生成器入口。
- 通过“图片”添加的普通空节点由 `model.js/createCanvasNode` 明确写 `image_generate`，可用于本批已证 focus 入口；不需要以用户已有上传图强行打开生成器来完成验收。

Root 已确认本批维持既有宽 generic 显示入口；新增 focus 入口对 `no action + localMediaReady` 的本机完成上传资源显式默认不可用，不把它默认为生成器。后续收敛资源 generator 必须一起补完整原图动作、创建下游、菜单、设置入口、特殊 generatorType 与 legacy 文档规则，不能只删除现有入口。本文不授权或执行该额外范围。

## 3. schema 的唯一来源与实际可达模型

`generator/node-generator.js/resolveNodeGenerator` 的真实链：

```text
modelList = models[node.type + 'Models'] || {}
model = node.data.params.model || models.default[node.type] || ''
schema = mergeGeneratorMediaSchema(modelList[model], node.data.extraConfig).schema
```

focus controller 应对最新当前图 target 使用这条 resolver，并将其 schema 交给 `focusGeneratorCapability`，避免重复直接读取 `models.imageModels[key]` 而漏掉 extraConfig 合并/锁定。纯 capability 保留 DEFAULT IMAGE、严格 `properties.focus===true`、assetBoard / onlyFineTune / hydrated slash 的独立门槛；不能用 displayName、modelVendor、URL 或 `magic===true` 猜 focus。

真实 `public/data/models.json`：默认 image 为 `lib-image-2.5-s`，它不支持 focus；支持严格 focus true 的三项为 `nebula-ultra`（全能图片模型V2）、`nebula-2-flash`（全能图片模型V2-Flash）、`nebula-2.1`（全能图片模型V2.1）。最小已证 UI 路线是添加普通空 IMAGE_GENERATE → 选择这三项之一 → 使用 focus chip。目录没加载或 schema 缺失时保持 params / region，显示现有模型加载/失败/重试，不为提供入口自动切模型或丢已存 focus。

模型未带 schema、目录错误、模板不允许、readonly、文档没 ready 和应用任务 busy 属于本机安全 gate；不得捏造会员、授权或可消费费用。

## 4. target、唯一选择和图片 surface 是三个资格

source `useShouldShowGenerator` 采用 reference → mark → focus 的显式 target 优先级，匹配 nodeId **OR** 常规唯一选择。active target 失效不向下一层回退。现有 Viewport 只有 ScriptV2 的 `scriptEligible` 接 reference target OR；generic inline 没有显式 focus target。最小补线应将 target 资格扩展给 generic，而保持 node 自己的 world anchor / zoom / Frame，不把 widget 移到被框图片。

模式 target 资格不能代替 source Factory gate；纯 capability 也不能代替 ready/readonly/owner 当前图重验。普通 sole-selected 图片可继续具有它原本的显示资格，不应擅自把 source OR 改成模式期间只允许 target。

source图片 surface @915729 为 `firstResult && (isFocusMode || existingRegion) && !publishProtectionActive && !storyboardChild`。其中：

- `firstResult` 是结果数组 index0，非所有叠卡结果。
- target 自己 @9099xx 显示 FocusModePlaceholder，不可自框，自环计划不能因为 store.addEdge 没 self guard 就放行。
- `storyboardChild` 是 @853705 的 direct parent 计算：parent.type 必须 GROUP，parent.data.storyboardGroupType 不能为 video，并且满足 `storyboardGroupType==='image' || standaloneStoryboardImageGrid===true || (typeof sourceScriptNodeId==='string' && length>0)`。包括所有非 video 脚本关联图片组；不是只排 standalone，也不是所有有 parent 的节点。@t9 的 standalone-only gate 用于另一个 generator 判定，不应与 t7 混用。
- `publishProtectionActive` 不是某个 node.data.publishProtection。@855540 为 `usePublishDraftStore(selectIsProtectionSettingActive(projectId))`，`410tyief9ezvg.js` / `1bflqug4ccoei.js` @19130 明确是 `!!projectId && store.activeProtectionProjectId===projectId`。node.data.protectionType 是独立媒体遮罩和 originalUrl 规则；当前没有真实发布保护 UI 时不能凭同名推测 gate。

surface 输入采用真实显示 content DOM rect 的 client 坐标，不能用 node graph box / viewport world / 图片自然像素再归一，也不能按 zoom 二次除。当前只显示 url 第一项可接最小 surface；完整叠卡、自然尺寸布局与保护内容边界仍要分别说明。

## 5. chip、保存 region card 与删除

`27g5ro4e8nocv.js` @11890–12510 和 @14310–15090：

- 没有 region 时 IMAGE 附件 chips 显示“聚焦”。点击 active 就 exit，否则先 collapse expanded Frame 再 enter(target)。
- 有 region 时 chips 不再显示同一个聚焦入口；cards trailing 在 references strip 后显示已保存区域。编辑始终 collapse 后 enter，不使用 global-active toggle。
- `42seoipo_5lv1.js` @4570–6200 的 card 为48×48，真实 `imageUrl + relX/relY/width/height` 异步 crop，普通态“聚焦”、hover“编辑”、15px角部删除。crop失败是暗色回退，不用原全图冒充区域；dependency/owner变化或卸载必须隔离迟到结果。图片裁剪只读，不创建新 crop 节点、不上传、不能说真实生成已成功。
- callback 不放进普通 `GeneratorReferences.onDelete`：focus delete 与普通引用删除语义不同。source @12134 只删**首条** region.nodeId→target edge，然后仅 clear `focusRegion/originImage/scene`，其余 params / prompt / settings / 其他边不变。

建议在 Inline 增加小型 focus attachment props `{capable,active,region,onEnter,onEdit,onDelete}`；它只展示 source chip/card，不持全图、不写 document。root controller 持 enter / delete 与异步 owner；使用 stable targetId/opener 和 Frame collapse 小回调。readonly 不提供写操作，已存 region 如保留只读展示应明确与原 CollabReadonly shield 对齐，不能依靠点击无效却仍宣称可编辑。

## 6. 确认和降级必须是一笔图事务

`focus-region-model.js` 的 `planCanvasFocusRegion` 有意不持 schema/权限，caller 必须先对 fresh target 重新判能力。原确认 @883330–884090 使用最新 params / settings，保存 source.data.url[0] 的 focusRegion/imageUrl/originImage/scene camera_focus，写 ratioKey，若任意该 source→target edge 已存在则不补重复边。没有改 action、model、modeType、count、prompt、其他高级参数或位置尺寸。

本机 `useCanvasGraphActions.commitGraph` 已有同步 raw graph identity CAS、一次 history、registered draft 投影和 currentDocument 同步发布。建议：

1. 在 controller 当前 document/mode epoch 下读最新 raw graph，取 target/source，再做 latest schema / writable / surface gate。
2. 用现有 `canvasDrafts.project` 或读当前 prompt `getValue()` 构造 draft-projected graph，planner 对该图运算；expectedGraph 仍是捕获的 raw nodes/edges/models identity，不用 projected identity 做 CAS。
3. confirm / delete / unsupported-model switch 的最终 params 与边计划一起提交 `commitGraph`，同次记录历史。取消 prompt debounce 只在 accepted 后进行；失败不清输入、pending region或 ratio。
4. 持久化失败保已 accepted 图与明确保存错误，调用现有 document-level“重试保存画布”只保存，不重复加边/历史。模式自动退休不应使保存恢复入口消失。

不要先 `changeParams(data-only)` 再另 effect 删 edge；也不要调用普通 mention/connect helper，因为它附带普通引用资格和 incoming mode sync，可能与原 focus scene/ratio 合同不同。当前 Inline `changeWithDraft` 先 flush、`useNodeGenerator.changeParams` 最后只 `update(data)`，它们不能单独承担 params+edge 原子降级。

source unsupported-model 清理的精确条件在 `27g5ro4e8nocv.js` @680–1120 / @2561：只有新 schema 不支持 focus，且有 region 或 active focus owner 就清三字段、首 edge并退出该 owner；region 没有也要退出 active。支持 focus 的模型切换保留 region。@8898 的 incoming 自动 fallback 切模型也调用该清理，不能只修 menu click 却漏其他真正 model 切换。未知 schema/loading 不能当用户已经选择不支持模型来破坏旧数据。

Root已选择本批 atomic patchNode 路径负责用户模型切换清理；view应走该统一 callback。自动 fallback / schema变更的完整 source效果若本机未实现，记录范围，不用一个事后清理 effect 创建额外图事务。

## 7. incoming、camera_focus validation 和生命周期

当前 `media-input-model.js` 已在 collector末尾排 `target.params.focusRegion.nodeId` 的普通 imageList，避免同原图作为第二次普通参考。它保边、其他 inputs和 stored refs；`resolveGeneratorParams` spread 保留 focusRegion / originImage / scene。这不等于 camera_focus 已完整接入：IMAGE `inferGeneratorMediaMode` 仍只按普通 imageList 数量推 text2image/image2image，shared validation 原本只按 prompt / 普通 refs 判断 require。

source `3lfysz4968xc9.js` @24460 evalContext 对 camera_focus 使用 `originImage` 作 hasImage，并使 hasPrompt 成立，因此确认选框后不要求额外描述。Root已计划按该 source eval 补共享 resolver/validation；真实 task builder仍不能执行 source登录+红框File+pre-sign上传链，按钮要明确服务未连接。不能假任务，也不能让错误“请先输入提示词”把正确 focus UI 保存误判为失败。

取消协议必须统一 document epoch + mode epoch：切文档/owner删除或类型、action、generatorType、schema能力变化/readonly或ready丢失/其他mode接管清临时手势，拒迟到pointer/up/crop/focus restoration。确认后的 region仍是持久化 params，退出不是删除。schema暂不可用保已存字段；恢复后重新判入口。

Escape由共享叠层优先消费；菜单/expanded Frame/crop预览先于pending，再退出mode。source cancelKey只清部分local state，本机必须同时清capture/RAF/start refs来避免迟到up复活pending；这是明确稳定性适配。返回target用其 world中心、当前zoom和400ms camera transition，不能移动source节点来“返回”。

## 8. 本轮结果与后续验收合同

只新增本文，无生产/测试/browser/存储变更，没有运行full check。本轮结论已发Root：资源入口不能直接收窄；schema复用同resolver；focus target OR 与普通sole-selected分别保；storyboard/publish gate使用实际computed规则；confirm/delete/downgrade同CAS/history；模型目录真实三项可测，default无focus。

后续actual UI应覆盖：空IMAGE_GENERATE三模型入口；普通上传资源不误获focus；target失去sole selection时widget仍在自己anchor；无prompt确认真实source区域只一边/一history；已存card异步crop与编辑/取消/删除；支持→支持保region、支持→不支持原子清首边；Quota重试不重复；A→B→A/同ID新doc/URL变更/readonly/capture retirement；真实refresh保持params与原图。pure geometry或mockcrop成功不代表原生内容rect/窄屏/focus恢复已经验收。

## 9. 本批独立附件 view（2026-10-12）

Root授权后新增 `generator/focus/FocusAttachment.jsx/.test.jsx`、`attachment.css` 和独立只读 `preview-helper.js`，未改 Inline、Frame、root controller 或其他代理的 `focus.css`。默认 export props 为 `{available,active,region,asset,disabled,onEnter,onEdit,onDelete}`；callbacks额外提供稳定opener HTMLElement，Root也可忽略该参数。

- source附件的 X capability gate 同时控制chip/card，因此 available=false即使region存在也不渲染，不删除保存数据。有region只编辑/删除，没有region调用onEnter；active toggle由controller处理。缺callback或disabled使用真实disabled button，不提供假动作。
- crop与source `0p_bztaupj2yb.js` @1808 的数学顺序一致：naturalWidth/Height乘归一坐标后round、左上max0、右下截断、PNG输出；不使用节点graph尺寸或生成服务。abort/换映射/换region/unmount退休旧Image，成功后也清Image URL和listeners。crop state按当前URL/几何key检验，不能让旧crop闪入新区域。canvas/CORS失败保持暗色卡；没有以完整原图冒充裁剪。
- source中文教程 URL 在 `42seoipo_5lv1.js` @410，已存research/assets.json为remote-only 25,900,231 bytes，asset-map没有中文映射。本批不下载、没有用已下载的英文clip冒充中文。hover200ms才挂原URL muted/loop/playsInline视频，leave150ms卸载并pause/remove src/load；失败展示“聚焦教程暂不可用”。本轮未发出媒体请求，URL实际播放/CORS仍待原生验收。
- chip样式直接对照 `3zez5ighjd7k4.js` module636820 @0–1200：icon12、label12/18、gap2、px8/py4、fullround。card48、icon14、label11、角删除15/内X7、offset-2、border/overlay/hover沿附件源。active/muted/disabled色值fallback按源CSS1h dark/light tokens，不新设全局主题。
- 教程使用现有shared `useAgentToolbarPopover` 的hover计时、定位、外部关闭、Escape与dialog-child注册，不创建第二套body lock。sourceHoverCard的默认content320×180加8px padding/0.5pxborder共337×197；本机8px viewport clamp是明确窄屏适配。ArrowDown可打开教程，Space/Enter保原生按钮激活并阻画布pan；button focus本身不抢先打开hover教程，Escape回chip不会立刻重开。card增加native button和focus-within显现编辑/删除属于可达性适配，source原edit surface是div。

定向组件14项验证覆盖：source资格、真实callback/禁用、natural尺寸round与边界crop、读取/taint/context失败回退、迟到oldload/换source/映射与卸载、200/150ms真实URL媒体生命周期、shared Escape回chip、keyboard Space默认激活及pointer/dblclick隔离。没有graph/history/browser/fullcheck验证；集成事务与实际content rect由Root后续验收。
