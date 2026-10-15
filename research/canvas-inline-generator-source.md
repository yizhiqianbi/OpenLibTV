# Canvas 节点内嵌生成器：公开源码证据

2026-10-11。本批只读分析公开客户端，不执行原脚本、不登录、不调用生成或写接口。代表作品为 `/detail/e0098a0a61f347a59aca05670f70318e` 的公开创作过程。这里记录实际 ordinary Image / Video / Audio renderer，不把 inspector、Agent composer 或 batch renderer 当作同一组件。

## 原始证据与入口

下表 offset 是归档原文件中的 **零基准 UTF-8 字节偏移**，不是临时 Prettier 文件的行数。合并 module ID 表示它们共享 factory 定义。所有归档文件均作为数据阅读，未在应用执行。

| 文件（均在 `research/source/`） | 模块 / 偏移                                                      | 已确认职责                                                                 |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js`              | `790748,189185` / 94741                                          | GeneratorFactory、NodeGenerator / useHasNodeGenerator                      |
| `3u6hjewm8qox_.js`              | `464025` / 644821                                                | useShouldShowGenerator                                                     |
| `1nx1kclu6uvka.js`              | lazy `930269 / 801547 / 787650`                                  | Image / Video / Audio default chunk registry                               |
| `27g5ro4e8nocv.js`              | `830170` / 112；toolbar `z` / 1185                               | Ordinary ImageGenerator                                                    |
| `24mj3em3412ij.js`              | `580897` / 112；toolbar `ty` / 60896                             | Ordinary VideoGenerator；多种已有视频扩展共享此 chunk                      |
| `06hc5sgxzfqgd.js`              | `220012` / 112；toolbar `P` / 4651                               | Ordinary AudioGenerator；text mode menu `k` / 630                          |
| `3lfysz4968xc9.js`              | `354939` / 20823                                                 | useGeneratorCore：编辑锁、初始化、incoming sync、model switch、prompt 更新 |
| `3lfysz4968xc9.js`              | `184907,814059` / 2905                                           | ReferenceDisplay、删除参考边及 group 排除逻辑                              |
| `1jgo2qrsqidfu.js`              | `976401` / 483                                                   | GeneratorWrapper、展开 / 收缩 / 尺寸持久化                                 |
| `23k0n_fspor7g.js`              | `485615` / 112                                                   | CanvasScaledOverlay：逆画布 zoom 缩放                                      |
| `1nd0f9k3q9sol.js`              | `112007` / 112                                                   | 共享富 prompt、IME / history / suggestions / clipboard / drop              |
| `1fuxk6hkx6iug.js`              | `838978` / 112；readDOMToValue / 29954；renderValueToDOM / 31259 | Prompt token codec 与原子 DOM badge                                        |
| `38o6e4qs2-rnf.js`              | `100247,665209` / 37790                                          | createReferenceMentionSpan、mention 是否支持                               |
| `3zez5ighjd7k4.js`              | `855847` / 1222                                                  | 模型选择菜单                                                               |
| `2euhhhz264m9k.js`              | `456603` / 5248；`455649` / 3958                                 | 视频 mode menu、AddReferenceButton                                         |
| `2iru1o_jok_2m.js`              | `876083` / 2465                                                  | 生成按钮、费用计算、提交服务状态                                           |
| `34q64t3bi91ws.js`              | `848024` / 86599                                                 | 参数摘要 / 参数 popover；高级参数与音色也在此共享 chunk                    |
| `0leiedr1esdbe.js`              | `469850` / 15237                                                 | 视频 media mode availability / best mode                                   |

原 public canvas HTML 指明 static host：`https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/chunks/`。本批只补八个 registry 明确引用的必要文件：`2euhhhz264m9k.js`、`06hc5sgxzfqgd.js`、`2clwnoqopqjfx.js`、`3lfysz4968xc9.js`、`1nd0f9k3q9sol.js`、`24mj3em3412ij.js`、`27g5ro4e8nocv.js`、`0g8cimawgg934.css`，均 HTTP 200，共约 425 KB。请求 / MIME / 解压后字节数 / SHA-256 见 [inline-generator-downloads.json](./source/inline-generator-downloads.json)。没有全量采集内容。

## 组件调用和外壳

`GeneratorFactory({nodeType,generatorType,nodeId,incomingData,layoutAnchorWidth})` 从实际 registry 加载 renderer。Image props 为 `{nodeId,incomingData,layoutAnchorWidth}`；Video / Audio 为 `{nodeId,incomingData}`。lazy Suspense fallback 是 `null`。加载异常的 boundary 显示“生成器加载失败”、具体异常（最多 200px 截断）及“点击重试”；重试重置 boundary key。

Factory 设置 `data-canvas-generator-root`、`data-collab-readonly`，并提供 collab ownerColor。只读事件 capture 阻断 button / input / select / textarea / role=button / editable=true，允许 `[data-readonly-allow="true"]`。它不是给只读画布开写权限。

普通展示 predicate（464025）是：该节点正作为 reference / mark / focus target，或者 `selected && exactlyOneSelected && !isBoxSelecting`。**hover 不是打开 generator 的 predicate**。BaseNode（710871，在 `3u6hjewm8qox_.js`）把 generator 放在 node media content 与 afterContent 的后方；dragging 时不挂载它。Image / Video 还在各自 renderer 排除正在裁剪、改图、续写、字幕区域等专用编辑状态。Audio 排除 generating、trim / speed 与 lyrics 操作。必须结合当前资源 action / asset-sourced 条件，不能让所有上传资源都显示生成器。

976401 默认 `size='large'`（先前口头记录 compact 已纠正）：large min/max **660px**，compact min **420px** / max **430px**。`CanvasScaledOverlay` class 为 `absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 translate-y-full`，默认 nodrag / nowheel / nopan，`origin-top`，150ms transform / opacity transition，缩放 **1 / canvas zoom**。因此卡片视觉大小独立于画布 zoom；不是把整张卡一起缩到 10%。实际 media node 的宽度仍来自该作品快照 / node dimensions。

只有 Image 传 `anchorWidth=layoutAnchorWidth`。global readonly 且 large 且 anchorWidth 非空时 round 后限制 **280–660px**（非有限数用660），同时设置 width / minWidth / maxWidth。Video / Audio 本批 ordinary renderer 没有传 anchorWidth，不能自行复制 Image 特例。

卡片背景 `bg-panel-background`，border hair / border-muted（light 使用 canvas-controls-border），rounded **16px**，`0 4px 10px rgba(0,0,0,.12)`。主列 gap **8px** / padding **8px**。鼠标、pointer、click stopPropagation；contextmenu preventDefault。展开按钮在 top8 / right8，**28px** 方按钮，icon14；global readonly 没有展开按钮。展开 body portal 遮罩 black50，默认 **800×600px**，max90vw / 90dvh；有效正数 expandedSize 保存至 node.data.generatorExpandedSize。八向 resize min660×360、max viewport90%，pointer capture，双倍 delta 从中心拉伸，pointerUp / Cancel 持久化尺寸。源码 wrapper 本身未声明独立 Escape / 焦点陷阱，不能把其可访问性说成已验证。

## Readonly 与匿名浏览器证据

2026-10-13展开持久化证据纠正：四actual caller读写`node.data.expandedGeneratorWidth / expandedGeneratorHeight`；上方历史`generatorExpandedSize`是本机普通Frame映射，不是原字段。collapsed固定下方、expanded portal与本机纵向适配边界见 [完整Wrapper审计](./canvas-generator-vertical-view-source-audit.md)。

三个 ordinary renderer 的 **footer 都受 `!isCanvasStore.isReadonly` 控制，直接不渲染**。协作只读则 footer 仍包 `CollabReadonlyShield`，参数、生成和 advanced 有各自 disabled reason。引用选择模式也禁用生成；真实生成权限与成本由 adapter 决定。

Root 实际匿名观察：公开作品 134 节点，原站标签36；title `pointer-events:none`，点击 title 不打开。双击真实 `div[data-nodeid=v-ePMlcWHdNd]` 后懒加载 video 与下方富 prompt。此节点 snapshot 宽622 / 高354，场景10% zoom。Prompt `contenteditable=false`、`data-readonly-allow=true`、`role=textbox`，aria-placeholder“描述你想要生成的画面内容，@引用素材”；真实文字和 Mixed badge 可见，模型 / 生成按钮未出现，与 footer source 条件一致。Root 拥有该标签，本代理未复用或关闭。此观察是只读 prompt / placement 证据；不是登录态 editable footer 像素验收。本代理没有新增原站截图或宣称其余状态已浏览器验证。

## Prompt token 与输入提交契约

112007 props 包含 `value='' / onChange / modelSchema / imageList / videoList / audioList / mixedList / subjectList / modeType / generatorType / disabled / nodeId / debounceMs=150 / onEnterSubmit / onFilesPaste` 等。这里的字符串 token 是生成器协议，**不是 Agent `{parts,serialized,...}` / `{{ type:id }}` 协议**。

- 媒体 token 正则：`{{(Image|Portrait|Video|Audio|Mixed|Element|CameraPreset)\\s+(\\d+)}}`。1-based index 对当前 ordered lists；Portrait 在源 ordinary codec 用 imageList；Element 用 subjectList。Mixed 在 usesMixedListProtocol 模式取 mixedList。Mixed label 用真实 mediaType 显示 图片 / 视频 / 音频 + index；也可为非 Mixed token 用其 nodeId 在 mixedList 的位置作 **显示** index override，储存 token 不变。
- `nodeId` / assetId / thumbnail 绑定 badge，不写入 token 文本。匹配 token 找不到参考仍创建 badge，nodeId/thumbnail 空，不编造可访问身份。未知未匹配 token 作为原文保留。
- 838978 还明确识别 `{{Panorama720}}`、`{{SlashPreset:scene}}`、`{{magic:id:index}}`、`{{SegmentRange:id}}`、`<#0.5#>` 和支持列表中的 `(laughs)` 等语音 filler。本批普通媒体输入适配不实现未知 special badge，保留其原文，不能静默删除。
- readDOMToValue 按 DOM 顺序读 TEXT / BR。badge 用 dataset mentionType / mentionIndex 还原 token；跳过 suggestion / panorama glue / prompt affordance；最后仅移除一个末尾换行。atomic badge contentEditable=false，height24 / rounded8 / px4 / gap4 / font14，缩略图16。不把 badge 的“图片1”当保存字符串。
- input：normalize DOM → serialize → set draft；非 IME 时 150ms debounce onChange。compositionStart 暂停处理；compositionEnd 序列化、suggest、debounce。blur 仅建立本地 prompt history 边界，**不是专门保存事件**。工具插入 / 原子删除 / reference drop 等常直接 flush。源 unmount 仅清 timer；本地适配需显式 flush / cancel，不能因节点切换把旧 prompt 写给新节点。
- 普通 Image / Video / Audio **没有传 onEnterSubmit**，所以 Enter 换行，ShiftEnter同为换行；beforeinput 把 paragraph / linebreak 转 BR，末尾多补 BR 以支持 caret。只有明确 prop 存在时非Shift / 非IME Enter 才 trim 非空调用提交。
- Ctrl/Cmd Z、ShiftZ、CtrlY 使用 prompt 自身 DOM history，阻止 graph undo；中文输入法未结束不能作为生成快捷键。readonly / disabled 不注册编辑 keydown / beforeinput，DOM 仍可选择复制。
- 默认 prompt 容器 minHeight80 / maxHeight100；padding8、font14 / line-height1.8、pre-wrap / break-word；expanded占满高度。readonly tabIndex=-1、select-text、nopan、data-readonly-allow=true、role=textbox、aria-multiline=true。placeholder 依次 affordance → caller → schema i18n → schema literal → 根据 modality / mention 支持的默认文案。
- 基础 `@` 与全角 `＠` 菜单（127428）只在 editable + mention支持时打开当前 refs 候选；初始 index=-1，ArrowDown选首项、ArrowUp可回-1、Enter仅插入已选项、数字1–9插入对应项、Escape关闭。Tab 的接受动作属于增强 ghost suggestion，不能混同基础菜单。
- 112007 同时有增强建议分支：`isPromptMentionSupported && isPromptMentionSuggestAvailable(generatorType) && usePromptMentionEnabled.enabled && !readonly/disabled`。image/video 的该分支会调用 `collectCanvasReferenceCandidates({nodes,edges,targetNodeId,isStale})`，connected 候选按当前 reference / edge 顺序排在 unconnected 前；可涉及自动连线、素材 tags 与真实服务。基础当前 refs 菜单不能冒充这个增强分支，也不能将它与 Agent parts 提及协议混用。本批未实现该增强层。
- reference thumbnail拖入 MIME `application/x-liblib-reference`，payload `{listType,index}` index **0-based**，落点用 caretPositionFromPoint / caretRangeFromPoint，将该参考创建 1-based token 并立即 onChange。内部 badge move 使用 `application/x-liblib-mention`，移动已有 span；plain text / html drop 提取文本，保留新行。文件 drop 本 handler 不假装上传。

## ReferenceDisplay：预览 / 排序 / 删除

184907 props：`params,onReorder,onDeleteItem,onMentionItem,mentionableMediaTypes,ignoredListTypes,ignoredWarningMessage,complianceStatusMap,trailing,refDropTargetNodeId`。外层 `nopan flex w-full min-w-0 flex-wrap items-start gap-2 pl-1`。image/video/audio/text card均 **48×48px**，圆角8、hair border；编号9px，帧模式显示“首帧”/“尾帧”。视频中间play圆16 / icon10，duration左下8px；音频 hover显示play20圆，Audio实例在离开 / 切URL / 卸载时停止；text tooltip最多200字符 / maxWidth280。

Delete按钮 top2 / right2 **15px**圆、icon7，hover显现；@按钮 bottom2 / right2 **12px**、font9，hover / focus-within显现，mousedown保留输入caret。没有 delete callback 的只读预览不渲染delete。双击可定位真实 node：`requestFitViewToNodeIds([id],{withReturnToast:true})`；1秒hover提示“双击可聚焦至节点”，全局最多出现5次。

拖动支持 copyMove，MIME payload同上；引用排序列表≥2 且 onReorder 存在时可移动，返回 `onReorder(listType,nodeIds)`。readonly无排序 callback。2026-10-13完整链纠正：VIDEO按稳定素材身份重写对应prompt index并更新typed／mixed order；IMAGE仅改当前typed ListOrder并保literal，Core／store／incoming order链不调用ig重算，见 [完整链与草稿事务](./canvas-reference-draft-transaction-audit.md)。删参考操作删除连线，不删底层素材节点；group引用则只有最后一项时删边，否则把该node加入 groupRefExcludedNodeIds、snapshot、recalc incoming。真实deleteEdges／recalc另会调用ig，不能按IMAGE排序推断删除也保literal。被当前mode忽略的参考dim／tooltip，原记录不会凭空丢失。

## 普通 Video mode 更新的完整顺序

此前只知道 getBestEnabled 的纯规则，没有核对调用顺序；以下已经读到实际 renderer 与 hook。raw `24mj3em3412ij.js` onIncomingSync / modelSwitchPatch 传入点分别 byte **180333 / 180351**。

354939 effect **声明顺序**：释放编辑锁 cleanup → subscribe submitting 释放锁 → 首次 params.model 初始化（ensureMediaListOrder、updateNodeDataSystem / bypassCollabFilter）→ incoming effect → model-schema effect。incoming effect 只在初始化完成且 **incomingData 对象身份改变** 时执行，先 onIncomingSync，再 normalizeParams，ensureMediaListOrder，再 system写。deps是 incomingData / nodeId / systemUpdate，**不是 mode / settings / 每次参数变化**。model effect 按 modelSchema.modelKey 改变执行 modelSwitchPatch + 原settings/advancedSettings，再normalize / filter undefined / 普通updateNodeData。显式模式选择 handleParamsChange 不会直接触发 incoming effect。

Video `tn` onIncomingSync 的优先级：

1. valid extraConfig、pictureEditLock 或 continuation selectionConstraint：原 params 不变。
2. segmentRemakeLock：force SEEDANCE_25_VIDEO_EDIT_MODE_TYPE，合并当前incominglists / mixed order；editing源URL改变时清displayprefix / range tokens，并重设 sourceVersion / duration / ranges。
3. 构造当前incoming image/video/audio refs（后续规则不用陈旧 stored refs）。有 directorStudio 且当前模型不支持：从support按顺序选首个 isDirectorStudioModel 且未disabled；使用新schema + 当前incoming getBestEnabledModeType。
4. 当前模型在 disabledModelMap：从support首个未disabled且（无director或支持director）切换；新schema + 当前incoming getBestEnabledModeType。
5. `schema.properties.motionImitation===true`、`digitalHuman===true`、或当前 `longVideo2video` 且 stillVisibleEnabled：保持模式。
6. 有媒体：getBestNonTextModeType(schema,incomingParams,currentMode)。无媒体：getBestEnabledModeType(schema,incomingParams)。后者没有第三参但会读 **params.modeType**，无媒体当前合法nontext也会保留；不能误判为无媒体必定 text2video。

`getBestNonTextModeType`（469850）：visible availability 有 enabled current就保留 → getBestEnabled → 如果best还是text2video，首个enablednontext → current → text2video。`getBestEnabled`有媒体priority：image+video 优先mixed2video / videoEdit2video；有video优先首个videoEdit2video或video2video；再mixed2video / 首个enablednontext / text2video。无媒体优先可见可用当前nontext，否则text模式排除条件决定首个enabled / 首个visible / text2video。motion/digital是schema flags，不存在本证据支持的独立固定mode string。

Video modelSwitchPatch `ti` 先 `getUnsupportedGeneratorAttachmentClearPatch`；continuation selectionConstraint只返回clearpatch；其余有媒体使用bestNonText(current)，无媒体bestEnabled。底部 ModelSelect onChange还以新model重新取setting defaults并清旧schema不支持的store keys，不能只替换 model名字。Mode菜单onSelect把settings / advancedSettings按新mode merge schema，再 handleParamsChange；root本地controller要将派生 projection 与真实显式编辑分开，不能每次编辑重新推断覆盖用户模式。

`usesMixedListProtocol(modeType,model)` 同469850：mixed2video / longVideo2video / videoExtend2video，另 videoEdit2video + Seedance2.5 也用Mixed。98844（同文件 byte28569）的模型判断为字符串 star-video2.5 / star-video2.5-draft，或 schema.modelKey 为其一，或 schema.modelVendor=star-video2.5。不能仅因 mixedList 非空就让 image/audio候选都生成Mixed。

## Footer / model / mode / settings / submission

ModelSelect855847 compact trigger height32 / px8 / py4 / gap4 / radius8，modelicon16、name13、chevron14，aliasName优先；Video minWidth88 / max240，Image max180。菜单宽360 / maxHeight400、padding4 / rounded16、panel95% / backdropblur32。row height52 / padding8，iconbox34圆角8；modelName14 medium、VIP / labels / benefit badges；description12在hover / selected时显现。support顺序，disabled稳定排序末尾；filterKeys精确限制目录，disabled reasons来自support / incoming / practice显式权限。打开RAF居中selected（practice active强制top），选后关闭。无模型显示“暂无可用模型”（以 locale 实际 key 为准），不猜权益。

- Image：model → divider → settings摘要（张 / count；真实零费用且计算完 forceSingleCount）→ slash / camera在schema允许时；右翻译 / advanced / 语音 / generate。Image mode从image refs自动text2image/image2image，没有 ordinary visible mode picker。
- Video：model → mode → divider → settings（份、showCountInSummary）→ schema允许时smartStoryboard；右运镜或prompt优化 / 翻译 / advanced / voice / generate。Mode456603宽160、padding8 / gap4、标题“视频生成模式”h32 font12，row h32 / font13 / icon16，selected背景 / disabledtooltip。菜单始终源computeAvailability与filterVisible后，再caller filter / override。无schema trigger disabled。数字人模式有单独缺参考提示renderer，不凭普通列表推测。
- Audio：model → 可选text2audio/lyrics2audio菜单 → settings（chipShowsAllSettings）→ spacer → voiceCard / 翻译 / advanced / 字符数 / voice / generate。仅schema含≥2 text modes且当前textmode才显示 mode picker；菜单宽196，标题“生成模式”，行h32。label分别“描述生音乐”“歌词生音乐”。speech模型启用pause / filler top toolbar（readonly隐藏），支持token `<#seconds#>` / `(filler)`。
- Advanced toggle size32，expanded在卡片下方 / ShrinkSection；schema未提供advanced fields时隐藏。Image midjourney style可以锁定advanced；不是通用禁用所有字段的猜测。
- Generate876083默认费用+icon按钮，整行height32 / gap8。按钮 **32×32 / radius12 / invert-bg**，arrowUp12；真正submitting session / taskinfo loading显示loader12。disabled opacity.5并真实reason tooltip；fullWidth variant是h48“生成”，ordinary默认不使用该variant。readonly renderer根本没有此footer。
- 提交依赖登录 / server task builder、schema validation、计价、用户权益、submission registry，不可让本地未配置服务冒充费用/成功。源真正失败 Notify.error(errorMsg / “生成失败”)，结束loading；任务状态 / pending / failed由taskInfo显示，不是每点一次自动造媒体。

## 生成后的媒体与 controls

媒体仍属于原 ImageNode / VideoNode / AudioNode，GeneratorFactory不把它们换成新通用卡。BaseNode依次 title / beforeContent toolbar / media focus surface / afterContent编辑条 / generator。VideoNode（3u6，实际 selectedpredicate附近byte1591651）resource状态真实视频在媒体盒；生成中有既存内容时再叠绝对task overlay，保留旧媒体，成功由taskInfo / URLs投影切换。原视频多输出可叠卡，右上计数与 primary / download按钮；真正fullscreen播放器有initialTime与 watermark规则。Image也保留已有多URL并叠生成状态；Audio resource波形多个输出纵向使用node height。图像hover操作 / 视频媒体控制条 / 资源替换按钮不应放进prompt footer冒充一套控件。

这里确认 renderer调用和空间关系；未全面逐项浏览原媒体 controls，也未发起真实任务。具体 task writer / polling / 비용服务、全部 image特殊工具、运镜 / motion / digital / continuation / segment 专用状态、全部手机编辑布局仍需各域后续独立核对。

## 本地输入适配边界

本批已新增 `node-prompt-model.js` / `node-prompt-dom.js` / `useNodePromptController.js` / `useNodePromptMentions.js` / `useNodePromptKeyboard.js` / `NodeGeneratorPrompt.jsx` / `node-generator-prompt.css`，分别承担纯token、DOM原子badge与caret、可取消草稿与history、候选菜单、原生编辑事件、视图和局部样式；不读取Agent parts。value / onChange 仍为字符串，references按有序列表输入，候选显式使用 mentionListType=`separate`或`mixed`；既有Mixed token始终按其原列表绑定，不因当前候选设置重写。未知special token保留原文，未实现特殊工具badge。

ref 提供 `getValue()` 同步读取、`flush()` 返回并按权限提交当前值、`cancelPending()`、focus和引用插入。sessionKey变化取消旧pending并重置本地history；外部确认当前draft不重建视频badge，真实引用URL变化和卸载会pause / remove src / load释放媒体。源unmount原本仅清timer；本地由Root的文档draft registry在pagehide / unmount同步投影pending快照，只有同文档、节点存在、原basePrompt匹配且writable的草稿可加入保存。这是防本地丢失 / 旧节点写入的适配，不宣称源cleanup完全一致。

本批最后有界修正 `node-generator.js` / `useNodeGenerator.js`：resolver默认 `syncIncoming=false`，仅归一化与校验当前mode；hook在初始化、真实incoming refs（nodeId / URL / mediaType / 次序）或model变化时开启同步。单纯prompt / settings / mode / name变化和probe metadata不触发自动mode同步。模型变更显式调用同步，合法现有视频模式先保留；模板extra配置、picture / segment锁和motion / digital flags保留已有模式，未知support / disabled权限列表与continuation selection store未仿造。只有自动同步确实改变mode时才自动提交，schema恢复提供显示默认值而不先覆盖旧存储参数；这是保护现存本地文档的适配，源完整system写入 / 编辑锁仍待协作服务接入。StrictMode effect replay不会重复提交初始化。

## 本批定向验证与仍有边界

2026-10-11：7个定向测试文件 **37项通过**；本批JS/JSX scoped ESLint零警告、Prettier通过。测试包括真实公开作品prompt的无损codec、重复/未知/缺失token、0-based拖入、readonly复制、IME / Enter换行、原子删除 / undo、150ms提交、caret与外部值、视频badge保留与释放、基础@选择；真实挂载Inline取消/删除/切文档，以及完整NodeCanvas在150ms前卸载 / pagehide保存、刷新恢复、同ID跨文档隔离与readonly无写。另以实际public models验证显式参数不额外推断、真实连接和URL投影变化、模型切换、锁与schema失败保护、StrictMode一次提交。

其中两项完整Canvas保存测试最初复现旧Autosave.pending遗漏inline草稿，Root接入统一registry后均通过。不是用仅mock callback的测试代替真实持久化。Root负责全站check与浏览器，本代理没有执行全量检查、登录、真实生成或新增可写原站交互。

尚不能称完整内嵌生成器已经逐像素核验：本批原站浏览器证据限公开readonly视频prompt；editable footer / 费用 / 原生成任务、增强提及与ghost/tag/自动连线、camera / slash / magic / speech特殊工具、完整展开resize、专用motion / digital / segment / continuation、全部媒体controls仍未全部实现或验收。Root新外壳的参考卡当前与源48px、右下hover/focus @有差距；源dragging隐藏renderer、readonly Image anchorWidth特例与完整参考重排/删除仍需保持审计，后续改动后再由Root确认。

Root本地390×844浏览器发现inline宽350时右界425.8被裁剪，随后新增独立 `useInlineGeneratorPlacement`，仅≤767px对center做viewport clamp，桌面继续按原node-center。这是本地窄屏可用性适配；本批没有原站手机editable inline的独立证据，不能称该clamp为已确认原移动规则。

2026-10-13更新：普通删除已继续追完整 store `ig`／`T`，并实现 recognized媒体token删除／重编号、旧mode mixed转换、全部组leaf与asset保留；最新输入／图／DOM／undo同次接受，见 [source审计](./canvas-reference-delete-source-audit.md) 与 [实际验收](./canvas-reference-delete-functional-audit.md)。IMAGE排序only-order结论只限排序，不能外推为删除保literal。此处旧“删除仍需核对”按最新普通范围更新；pictureEdit／segment／continuation与全局级联、lens/style/focus依然缺。没有把这些已知前端差距推迟为必须先登录或接服务。
