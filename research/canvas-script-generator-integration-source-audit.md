# ScriptV2 专用生成器：画布接线、草稿与引用事务审计

2026-10-12。本文件只读核对公开归档源码与本地生产接口，不执行 source bundle，不调用原站生成、上传、费用或账号服务。源码位置为 UTF-8 解码后的 **0-based 字符偏移**。Root 持有 controller/Viewport/NodeCanvas 和共享生命周期修改，其他 owner 持有专用 pure projection 与 view；本文不修改生产，也不运行全量检查。

## 1. 显示资格必须使用 eX，不能借四动作 toolbar 的 eK

主证据 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) `sT`：

| 位置                        | 真实条件/调用                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1340739                     | `ea=useShouldShowGenerator(selected,id)`，完整 reference→mark→focus 显式目标与普通单选分支见 [target 审计](./canvas-script-toolbar-target-source-audit.md)            |
| 1347911                     | full-generation 非 recompute task busy→generating；对应 task failed→failed；raw rows 非空→resource；否则有 incoming **或 outgoing** edge→pending；最后 empty_generate |
| 1348603                     | `eX=!readonly && ea && (empty_generate                                                                                                                                |     | pending                                                             |     | resource |     | failed)` |
| 1385870 / 1386832 / 1389098 | 空卡、pending、resource/failed 均按 eX 渲染 `GeneratorFactory(SCRIPT_V2,id,incomingData)`                                                                             |
| 13480xx                     | 四动作 `eK=ea&&!readonly&&!fullBusy&&(rows.length>0                                                                                                                   |     | failed)`，所以 empty/pending 虽无四动作 toolbar，仍有专用 generator |

整脚本 full generating 隐藏生成器；分镜 recompute 的独立 task 不应误判为整脚本 generating。只读画布不显示此可写生成器，原 collab readonly shield 是另一状态，不能用当前本地 actor 编造协作锁。

本机 Viewport 现普通 inlineNode 只允许 image/video/audio。新脚本分支应明确 `type==='script-v2'` + pure card.kind + 当前真实选择资格，不改 type 为 text，不恢复空卡/ pending 的旧 Inspector。当前没有完整 reference/mark/focus 模式，因此本批仅映射真实唯一选择的资格；不捏造目标模式。

本机既有 `!selectionRect && !draggingNode && !panel` 是交互互斥适配。源 eX 本身没有把所有拖动/Inspector状态直接列为条件；源 Frame 默认也未传 hideWhenDragging。若本批沿用互斥隐藏，需记录为本机协议，不能称这几项就是 eX 全部源码门槛。

## 2. 专用 Factory、参数与引用来源

Factory registry 将 SCRIPT_V2 映射到 [1sutpu54cdy46.js](./source/1sutpu54cdy46.js) module327466；这是专用生成器，不是普通 Text generator。上批完整 chain、`scriptText` 三项目录与 source task 参数见 [预设接线审计](./canvas-script-preset-integration-source-audit.md) 第3–4节。

专用模块约5460起：currentModel=node.params.model或default.text，`getModel('scriptText',currentModel)` 取 text schema；`buildScriptV2TaskParams` 加 scene=`script-generate-v2`、textList和 typed media lists、ordered `scenePayload.source_images`，保旧其他payload键。没有 generic media mode/count/settings默认推断。已有合法 params只补缺 model，完全无 params才 `{prompt:'',model,count:1}`。

`useGeneratorCore` [3lfysz4968xc9.js](./source/3lfysz4968xc9.js) module354939/20937：

- 首次有 model 时 `ensureMediaListOrder` 后 system update，incoming对象 identity变化再次补 order并 system update；这两处不是用户编辑动作。
- 用户 `handleParamsChange` 只将 patch与当前 params浅合并，过滤 undefined 后 updateNodeData；脚本 caller未提供 normalizeParams、onIncomingSync、modelSwitchPatch。
- modelSchema.modelKey发生变化时，保 settings/advancedSettings，再改model并写节点；不能自动清成生图模式或追加参数面板。
- prompt handler另清已不用的 magic/camera token metadata；普通 Image/Video/Audio 引用编号不会在本脚本 typed reorder 中自动改写。

`ensureMediaListOrder` 在 [1jgo2qrsqidfu.js](./source/1jgo2qrsqidfu.js) 13359：只在 typed/mixed list数组拥有非空 string nodeIds时，把对应Order设成当前列表nodeId顺序；零列表时保旧Order。source系统同步与本地纯display/submit投影是不同实现。建议本机初始化只投影显示，不在每次 mount/render调用 patchScript建立用户 history；用户第一次确实编辑时再原子保存完整source params。这样切选区、catalog变ready、undo不会因为 generator mount偷偷制造额外撤销项。

输入 collector不能直接复用当前 `connection-inputs.js`：本地该模块TEXT仅给nodeId、缺content，virtual edges/次序/focus/character协议也不同。专用模型 owner已按source417754独立核对。Root明确本机TEXT编辑的 `data.text` 为当前合法正文，清空不得回退复活旧content；这是本地renderer adapter，不改变原参考节点原文快照。

## 3. Frame 坐标与节点几何

源 Frame [1jgo2qrsqidfu.js](./source/1jgo2qrsqidfu.js) module976401/483：

- 默认large固定660px，compact另420–430；脚本不传compact/anchorWidth。
- 普通外层 `absolute -bottom-4 left-1/2 ... -translate-x-1/2 translate-y-full`，margin为16 **world px**。
- NodeFloatingUI [2ob2qo_b0az9v.js](./source/2ob2qo_b0az9v.js) module485615/112按1/currentZoom反缩放，宽度和内容保持screen尺寸；nodrag/nowheel/nopan默认true。
- expansion默认800×600、max90vw/90dvh，居中portal；source持expandedGeneratorWidth/Height，不改变节点raw position/size。8向resize的min660×360；source自身模态管理不应在本机重复创建。

本机可复用 `GeneratorFrame` 与 `useInlineGeneratorPlacement`，直接挂现有 CanvasNode.afterContent。传当前world position和同一coordinateOrigin，中心由 canvasNodeSize(n)统一。仅给overlay absolute位置/反缩放，不改script width、height、measured或position；这样选中、显示/隐藏、展开、拖动取消均不会导致节点跳位。

既有generic inline 坐标 `top=position.y+nodeHeight+16/zoom-origin.y` 是16 **screen px**，不可混称源16world gap完全一致。专用ScriptV2 wrapper本轮已采用 `top=position.y+nodeHeight+16-origin.y`，按源保16 **world px**；350高节点在zoom0.8时仍top366，内容反缩放1.25。660px +窄屏clamp仍有本机可达性适配，不能将clamp外推为源行为。script原卡350×350不为放生成器扩节点。

Frame源码阻 pointer/mouse/click/contextmenu。当前本机GeneratorFrame未阻doubleClick及按钮Space：挂到article后的双击会沿React链误开资源脚本；按钮Space可能被全局CanvasKeyboard preventDefault并开启pan。新专用wrapper应只阻doubleClick与`target.closest('button') && Space`冒泡，保留原生Space激活默认行为；不拦 Prompt 自己的输入快捷键或全局安装capture Escape。Frame展开复用dialog-stack，菜单使用其portalTarget；菜单第一次Escape关菜单并回触发器，第二次Escape收起Frame，外部pointer关闭不抢新焦点。

## 4. 引用展示、重排和删除的精确事务

源 [3lfysz4968xc9.js](./source/3lfysz4968xc9.js) module184907（约168xx）：textList首先显示，48px卡片/1-based badge/可删除；文本不拖、不mention。文本tooltip取normalizeTextContentField、排trim空段、join换行、截200字，top/arrow/multiline/maw280/z720（text卡约13400）。typed image/video/audio随后显示，可拖/mention/删除。只显示media会丢文本预设的关键输入。

### typed reorder只修改一项Order

脚本模块327466的 `V`：`type!=='mixed' && handleParamsChange({[type+'ListOrder']:order})`。shared draggable list `D` 约14575把拖动nodeId移到目标index，调用 `onReorder(type,orderedNodeIds)`；无跨type拖动。mixed拖动被脚本caller忽略。

**不应直接复用本地 graphActions.reorderReference**：其generic helper同时更新全部typed/mixedOrder并 `rewriteReferenceTokens(prompt,...)`，超出本脚本source协议。新controller先重验当前typed参考集合与order完整一一对应，然后只写当前Order；保持当前DOM草稿prompt字符串，不改变`{{Image 1}}`等编号。当前URL/引用变动后沿pure projection重建scenePayload。

### 删除只断开当前输入，不删除源节点、不主动重写prompt

源module814059约19801：

1. `edges.find(sourceId===requested && targetId===script)`，有direct edge只删找到的 **一条** edge；不删源节点，不改其他target边。
2. 无direct才按incoming edge顺序找 group/video_group/video_story 类型。用 `expandGroupSourceNodes([group],allNodes,excluded)`匹配requestedID。
3. 展开结果长度<=1删group→script edge；否则 snapshot→patch `groupRefExcludedNodeIds`→recalcIncoming。阈值看全部展开nodes，不是仅有URL/typed输入数量。
4. 无匹配no-op。该handler不改prompt、不做空白trim、不改rows/assets/task。

现generic deleteReference采用一次CAS、删除edge或exclude，并清stored媒体列表/Order避免其local merge复活，是有用的本机安全adapter，但其group剩余计数基于typed inputs，未必等于源全展开集合（例如REFERENCE/non-inputchildren），且当前collector不带content。专用方案应由source pure projection/expandedgroup决定计划，不能把不匹配的sourceId或来源变化当可删除。删virtual边应遵collector本身的真实输入规则；不能通过“UI旧卡片还在”删除不属于当前请求的输入。

这些动作必须一次commitGraph，保存整张实际committed图，一次undo/redo；不要先flushPrompt再patch、再删edge形成多项history。读 getValue同步捕获草稿，提交成功才cancelPending；失败保DOM草稿可重试。用户请求可同时改变prompt与Order/exclusion/edges，全部属于同一CAS。

## 5. 草稿、CAS、历史与保存所有权

本机入口：`NodeCanvas`持currentDocument、canvasDrafts、autosave；Viewport只传getDocument/commitGraph/patchScript/registerDraft/flushGraph；纯模型不读React/服务。

`useCanvasGraphActions.patchScript`要求docKey、ready、readonly、signal、expectedNode；浅data merge后调用commitGraph。**每次patch都会recordSnapshot**，故不能借它做系统init effect。params必须基于fresh当前script与pure projection浅合并，而不能拿旧render params覆盖期间改动。跨multipart引用动作直接commitGraph({nodes,edges},{expectedGraph})，raw nodes/edges/models identity必须仍相同。

commitGraph先用draft projector合入合法当前草稿与previous history，再复核rawCAS，同步currentDocument，recordSnapshot，再React setNodes/setEdges。读取getDocument实际committed图后flushGraph；不要保存pre-projection plan。quota失败保图及草稿，retry仅保存，不重复patch、history或ID；被删除的script、同ID重建、A→B→A、readonly/not-ready/unmount全部退休旧request，不能用迟到事件修改新owner。

### 本批明确的草稿channel协议

旧register只按doc+node存一条。CanvasScriptNode的 `useScriptPromptCompose` **所有态**注册scriptPrompts聚合，而新inline要保存params.prompt；两者同时存在会覆盖。Root已采用optional第4参channel，现key=`JSON.stringify([documentKey,nodeId,channel])`：compose沿旧default，新inline为`'script-generator'`。逐条project分别处理row drafts与generator prompt，保同script两类草稿共存。这是本机持久化协议，不是原站API。

inline register读：

```text
registerDraft(docKey,nodeId,read,'script-generator')
read → {basePrompt:lastRenderedNode.params.prompt ?? '',
        value:promptRef.getValue(),
        writable:capturedOwnerStillCurrent && ready && !readonly && nodeExists}
```

**basePrompt不能每次改成fresh raw prompt**：否则外部更改后旧DOM草稿会被当成新baseline，反过来覆盖external内容。freshgraph仅用于owner/存在/权限门控；NodePrompt的sessionKey+controlled value更新负责明确外部替换。旧baseline仍匹配才project；撤销/外部更新后不匹配的retained草稿不能复活。

pagehide/unmount前的150ms不能丢。read必须同步getValue；卸载先retain读值，再cancel timer，不向新同ID文档flush。NodePrompt已有getValue/flush/cancelPending，flush会调用onChange所以引用/model合并动作无需前置flush。文档key/节点生命周期epoch要固定到callback owner，单纯render最新refs不等于同一节点incarnation。

## 6. 与Root/模型/view的最小接口

专用pure model owner约定：

```text
resolveScriptV2Generator({node,nodes,edges,models,support,incomingData?,params?,language?})
 → {valid,reason,model,modelList,modelKeys,schema,params,
    incoming,inputMedia,references,inputIdentity,canGenerate,error,reasons}
```

Root wrapper持Frame、坐标、Prompt ref与draft registration、请求owner；view仅maincolumn，不自行图写入、保存或执行服务。建议动作：

```text
onParamsChange(patch, currentPrompt)
onPromptChange(value)
onReferenceReorder(type, nodeIds, currentPrompt)
onReferenceDelete(sourceId, currentPrompt)
onSubmit(currentPrompt)
```

任何动作入口重验currentcard/eX安全子集与当前catalog/schema资格。缺schema保原参数、显示加载/失败/重试；support加载失败不能将text全部十四schemas当script目录。model/menu需三项原name/description/icon，未知权益不授权。source普通底栏无mode/count/普通或高级参数UI，不借GenericGeneratorSettings凑界面。

Add-reference source是IMAGE-only三项：在当前画布中添加参考/本地上传/个人资产库；source异步upload/私有asset detail带canvas/node continuation guard。当前本机没有完整referencePickmode，若新增对话框是adapter需明确描述，不伪造source模式；真实账号素材和上传服务不接时保持显式能力边界。localupload成功应原子新增resource+edge、不改变当前script选择；取消/切文档/删除目标abortreader，迟到结果不插入。

## 7. 提交服务与后续实际App验收范围

`useCanGenerate(type='text')`看本地prompt或incoming text.content；文本预设脚本prompt空也能满足默认require prompt。两图但空prompt默认不满足。按钮可用性与服务是否已接是独立层：服务未接时点击应保当前prompt和references、明确blocked，不写task.loading/taskId，不生成假的rows/assets，不拿普通text生成结果假冒script。

source request scene=script-generate-v2、taskMode generate-full、orderedsource_images需在同一freshgraph+最终draft上构造；caption/action依源，不添加虚构费用0/会员授权。翻译、语音、真实上传及referencePick模式的完整服务流程不是本轮pure投影测试能证明。

待Root通知接线冻结后新增真实NodeCanvas测试：empty/pending/resource/failed均可达、整fullbusy/readonly隐藏；文本preset内容进入生成资格；两图typed顺序只改相应Order且保token/prompt；directedge删除与groupexclude一次history、保源节点；最后150ms prompt随pagehide/卸载保存与rowdraft channel共存；model切换保当前草稿/settings；source_images当前URL/order；doc切换/A→B→A不回写；目录失败重试；缺真实服务点击保输入且不伪task；拖动前后节点/view与Frame坐标稳定。只mock公开内容或注入明确服务adapter，不mock图/history/storage。

## 8. 本批实际App回归与发现的修复

接线落盘后按Root授权新增 `NodeCanvas.script-generator.integration.test.jsx`，只注入真实公开models、script-text-support、script-presets及其他目录，不mock graph/history/autosave。10个case覆盖empty/pending/resource/failed可见及fullbusy/readonly隐藏；mount不改变节点与视口；只三项script目录；最终草稿和model同次提交、一项history；upstreamTEXT在scriptprompt空时满足规则；ordered source_images与未接task边界；最后150ms pagehide/remount；选择其他节点retaindraft；typedOrder-only保tokens；删除direct真实edge保源节点；Quota仅重试保存；新文档同ID拒旧timer；Frame的Space/双击隔离及逐层Escape焦点。

初跑只有Frame收起后焦点落BODY是确定产品缺陷（另一项readonly fixture误用ignoredprop已改真实embedded route）。菜单第一次Escape正确，第二次关闭portal导致dialog-stack保存的旧expandtrigger已卸载。Root修共享GeneratorFrame：仅本次关闭且焦点最终回BODY时，转移到新remounted expandtrigger；不另建stack/scrolllock、不抢其他已取得焦点的控件。Root的Frame4+本actual10+controller15共29/29通过，日志 `artifacts/canvas-script-generator-frame-followup-tests.log`。本文作者读取该日志确认actual新文件10/10，但没有重复跑大联合。

旧 `NodeCanvas.script-presets.integration.test.jsx` 仅补真实script-text-support和新的service-onlypending文案，保所有原图/原文/URL/坐标/一次undo-redo/refresh/Quota/no-dialog/nohint/selection/view断言；本子agent单文件7/7通过，日志 `artifacts/canvas-script-presets-generator-compatibility-tests.log`。两个owned测试的Node24 ESLint与Prettier通过。

本子agent未修改生产或全局文档、未跑fullcheck/浏览器/原站服务。Root后续专用group-reference delete计划仍待pureowner完成，以上directedge回归不能替代group排除的最终验收。source Add-reference全模式、翻译/语音/真实生成服务继续保明确缺口。

## 9. 本轮冻结后只读生命周期复核

本次只读检查Root更新的 `useScriptV2Generator`、`ScriptV2NodeGenerator`、共享draftchannel与Frame，以及已替换generic的 `planScriptV2ReferenceRemoval`；未编辑生产/测试，未运行任何测试或fullcheck。Root报告5files45通过由Root记录，不作本子agent重跑证明。

已确认当前实现：

- 所有mutation用fresh raw graph重建projection，withPrompt按最后render baseline与当前raw prompt比较；不是把fresh prompt重新当旧DOM草稿baseline。caller取getValue并在commit accepted后cancelPending，Quota false属于持久化失败而不是回滚graph，避免旧debounce再次提交同一动作。
- model禁项raw门控已改为modelList.find；typedOrder adapter去List后只写相应key，mixed仍no-op；用户prompt/token字节保持。
- submit由最终prompt+fresh引用构造sourceparams，保scene/source_images但返回submitted:false；没有task.loading/taskId/rows输出写入。sourceexpanded width/height独立，未引入generic字段。
- generator与rowprompt使用不同draftchannel，retain baseline不覆盖external更改；Frame关闭仅在焦点退到BODY时回新expandtrigger，已有有效外部焦点不抢。
- 专用reference removal现按全部expand leaves处理group<=1断边/否则exclude，保源节点；direct优先与source一致。前文generic helper不匹配问题已由pure专用计划解决，最终实际group回归由Root/pureowner负责。

### 确定P2：已提交但保存失败的重试状态会在临时隐藏后丢失

`useScriptV2Generator` 的pending ref/state位于inline组件，cleanup将pending置null。Viewport选其他节点时卸载该inline；选回后新hook从pendingSave=false、error=''开始。另一路径无需卸载：Quota失败后打开媒体参考预览，generator.suspended=true，current(owner)返回null，pending layoutEffect清pendingSave/error；关闭预览也不恢复。

图已CAS提交仍在内存，localStorage尚为旧图。autosave节点变化的600ms计时尝试失败后，selection或modal状态变化不属于其effect依赖，不会创建新保存计时器；重新mount生成器又刻意不写图，因此用户回到同一脚本找不到“重试保存脚本参数”。header只有保存状态显示、无直接保存重试，不能把后续编辑/移动/离开页面才偶然触发flush当这条重试入口已经保持。

建议将已提交pending-save状态挂在持续的CanvasScriptNode或当前document的稳定owner中，inline仅读写它；临时selection隐藏/modal suspended只禁编辑，不能忘掉已提交状态。doc切换/节点删除/readonly退休保持现有规则，retry仍只flush最新实际图而不再commit/history。或在document autosave边界提供可直接操作的失败重试并让inline remount回读当前状态。此发现由代码与调用分支静态证明，已发Root；本轮不增加或运行测试，也未擅改相关文件。

### P2后续修复及真实600ms回归

Root随后在稳定document autosave层新增saveError/retrySave，并在原Header保存状态位置仅真实失败时显示“重试保存画布”。inline临时卸载/suspended即使清本地提示，也不丢文档pending图或全局重试入口；Root还隔离旧doc flush对新doc saved/error的更新，并独立验了unit13项。本文作者未修改这些生产文件。

按Root追加授权，只在owned App文件新增selection和preview两项强回归。每项先记录同步action失败次数，再真实等待650ms，要求失败次数实际增加，以证明600ms自动保存也确实失败；不是把多个立即flush计数冒称timer证明。随后卸载inline或开/关参考预览，释放Quota并点Header重试：保存原IDs/原edges/当前params/source_images，view不变；一次undo后history为空，再redo精确恢复提交图，保存没有制造第二项history。

新文件12/12单独通过（06:11:25，新增两项894ms/862ms），日志 `artifacts/canvas-script-generator-stable-save-integration-tests.log`；Node24定向ESLint与Prettier通过。此次P2已由稳定文档层重试解决。没有运行fullcheck或扩大生产修改范围。

随后Root将专用Frame gap从先前generic16screen适配纠正为源16world，ownedactual首case仅把zoom0.8的top370迁移为366，保反缩放1.25、rawposition350×350、view和history原强断言。窄屏clamp继续明确是本机适配。变更后的单文件定向结果见 `artifacts/canvas-script-generator-source-gap-integration-tests.log`；不重复运行全量检查。
