# 图片聚焦与元素标记：完整源码协议（2026-10-12）

本轮仅静态读取归档公开客户端、locale、CSS 和已有本机文件，不执行原站脚本、遥测或生成 / 上传 / 账号请求。本文记录实际入口与完整 point / region 工作流，不把 model 具有字段、toolbar 可显示或 DOM `.focus()` 当成模式已实现。所有偏移均为文件解码后0-based字符，不是字节或格式化行号。

先前 [target 显隐审计](./canvas-script-toolbar-target-source-audit.md) 的 source 优先级仍适用；其中“本机没有任何模式”的历史判断已经由后续真实 reference-pick 接线更新。本文件聚焦仍未完整接线的 focus / mark，不能据旧历史文字撤销当前 reference 能力。

## 1. 准确入口与 node kind

### 图片生成器

[27g5ro4e8nocv.js](./source/27g5ro4e8nocv.js) module830170 **11730–12490 /14300–15490**：图片生成器的 action chips 调 `useMarkMode` / `useFocusMode`，下方专属附件视图 module711694，不是任意节点的通用上下文菜单。

- 标记 click：全局 `isMarkMode` 为true就exit，否则 `enterMarkMode(currentGeneratorNodeId)`。这个toggle按active布尔，不按当前source ID判断；不能把source原逻辑写成“点另一个generator自动切owner”。
- 聚焦 click：active就exit；否则先 `collapseRef.current?.()` 再 `enterFocusMode(currentGeneratorNodeId)`。已有聚焦卡片的编辑按钮始终collapse后enter，不走toggle。普通 reference入口也先collapse；mark入口没有这一collapse调用。
- 主 chips 仅在 caller `!isAssetBoardMode` 时展示；已有 hydrated slashPreset 时不显示 mark / focus / fineTune公共附件按钮。readonly / collab shield 和generator caller的显示门控另有来源，不能用schema能力替代权限。

[42seoipo_5lv1.js](./source/42seoipo_5lv1.js) module711694 **6622–11380**：`onlyFineTune`、`isAssetBoardMode`、`modelSchema.properties`、variant和topToolbarLocked决定具体入口。

```text
markSupported  = !onlyFineTune && !isAssetBoardMode && properties.magic === true
focusSupported = !onlyFineTune && !isAssetBoardMode && properties.focus === true
chips 只显示标记按钮与尚未保存region的聚焦按钮
cards 显示已保存focusRegion的48px预览 / 编辑 / 删除
topToolbarLocked 阻点击，不创造账号权益
```

源“聚焦”按钮200ms hover展示320×180静音循环教程视频；保存region后的48×48卡片显示实际区域crop，普通态“聚焦”、hover“编辑”，角部15px删除按钮。预览异步失败显示暗色回退，dependency变更 / unmount忽略迟到结果。它不是生成结果或另一个crop节点。

### 视频生成器与其他种类

[24mj3em3412ij.js](./source/24mj3em3412ij.js) 视频生成器 **190181–190420 /207521 /209045** 也有mark：`!isAssetBoardMode && modelSchema.properties.magic === true`，active / toggle / suggestion同步复用Mark hook，owner为当前VIDEO生成器。点选识别的源仍是IMAGE内容；“VIDEO可为mark owner”不代表点击video帧就运行同一识别协议。此专属video生成器未发现focus入口。

TEXT / AUDIO / ScriptV2的已核对Factory与输入view未发现这两action。`2nko6splgjkeq.js` / `2euhhhz264m9k.js` 包含hook的re-export并不能证明它们的每个renderer提供入口。ScriptV2只有已核实专属reference菜单；不为补target显隐给脚本创造mark / focus按钮。IMAGE的readonly resource、ENHANCE、picture-edit或未知template配置是否有完整入口，须按实际Factory / schema / caller判断，不能只看 `node.type==='image'`。

补核Factory **139200–140400 /141690–142900** 与图片renderer **860038 /860224**：普通 `image_resource` 默认无generator；只有 `showGenerator` truthy或真实asset-sourced例外。asset-sourced由 [3shzcyguvjig6.js](./source/3shzcyguvjig6.js) **3617** 定义：`(portraitAssetId || portraitCompliantExempt) && !portraitCertifiedInPlace`；不是uploaded、local actor或普通资源的URL。`showGenerator=false` 阻display，IMAGE_EDIT默认无generator、显式true才可显示。[170exq-5f14zz.js](./source/170exq-5f14zz.js) **1886 /4506 /6401** 核实GeneratorType canonical为 `picture_edit` / `subtitle_erase`，resource action使用原7项Set，不能泛化成字符串含resource。

IMAGE enhance使用独立lazy12443→`1nzd5_8x9_jg9.js` /module198015，与default generator不同；该chunk本次archive中缺失，不能推断它存在相同聚焦action。当前pure entry保defaultIMAGE已证据能力，enhance明确不启用；未核实独立renderer仍为范围缺口。既有本机 `picture-edit` / `subtitle-erase` hyphen别名同样禁入，属于明确兼容防御，不把它们写成原枚举。

## 2. mode身份、互斥、target与frame owner

[0leiedr1esdbe.js](./source/0leiedr1esdbe.js) **124831–127100**：

- `setFocusMode(active,id)` 写 `focusSourceNodeId`；名字里的source指**接收聚焦参数的生成器owner**，不是被框选图片。关闭同时清 `focusInteractingNodeId`。
- `setMarkMode(active,id)` 写 `markSourceNodeId`，同样为接收magic prompt的生成器，可能IMAGE或VIDEO。点选图片由临时mark point的 `nodeId` 单独标记。
- mark / focus开启互相关闭，并关闭reference / canvas-capture / subtitle区域session。reference / capture开启也关闭mark / focus；source setter中各集合清理范围不完全相同，不能臆造所有字段都被每个setter清空。项目reset **90614–90900** 清mode active、target、interacting及reference集合。
- `setFocusInteractingNode(id)` 记录正在画 / move / resize的图片；`cancelFocusPendingRegion()` 只递增 `focusCancelKey`，不写节点params。

[27g5ro4e8nocv.js](./source/27g5ro4e8nocv.js) hooks **23135–24650**：active focus禁普通drag / connect / select / delete；mark额外清普通node/selection drag callbacks、允许pane pan并按canvasLocked控制zoom，禁double-click zoom。canvas JSX的mode-specific props覆盖一般可写props，不能只隐藏handles而保普通拖动。

source Generator eligibility仍为 `reference active ? referenceTarget : mark active ? markSource : focus active ? focusSource : null` 的优先级，匹配target **OR** 独立普通唯一选择；active且失效ID不借用下一级target。target保持自己的world anchor / inverse zoom / frame尺寸，不把它绑定被框图片或鼠标。进入focus会collapse原expanded frame，完成后400ms移动视口到生成器且保当前zoom；不通过改节点position“返回”。[21_0xvlvkw1sz.js](./source/21_0xvlvkw1sz.js) **958901–959350** pane click只在另一个RAF选择该优先级owner，显隐predicate本身不强制selected。

实现安全适配应给两个controller共享document epoch / mode epoch，并在切文档、ready/readonly丢失、owner删除 / 变类型 / 失去schema能力、mode接管时取消pointer和临时region。source模式字段是短暂UI状态，**不写Canvas持久化文档**；保存内容只包含确认后的focusRegion / magic参数。A→B→A不能仅用eligible布尔或同target ID判定旧callback仍合法。

## 3. 图片surface与归一region几何

[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) 图片renderer **854900–855600 /909900–911940 /915450–916150**：source遍历图片结果，只有数组index0的前图 `i=0===r` 支持focus / mark。已展开的其他结果、video、audio不是此输入surface。focus owner本身有媒体时显示FocusModePlaceholder，不允许把目标自己的当前结果拿来框选；所有无内容图片显示focus说明，已完成可框选图片保持实际图。

focus覆盖层挂在前图内容框，要求 `i && (isFocusMode || existingRegion) && !publishProtection && !storyboardChild`。mark overlays同样排除publishProtection / storyboardChild。该条件没有在此处额外检查被引用源图片的node readonly；写权限owner仍由guarded updater判断。不能把表格shot-child全部当普通image表面放行。

**909900** 明确 `isFocusMode && imageNodeId===focusSourceNodeId ? FocusModePlaceholder : actualImages`，因此真实UI不允许source图片等于target生成器，即使target本来已有url也不画自身surface。底层确认r3没有额外self检查且store.addEdge并不负责自环拒绝，不能据底层函数缺guard给本机创造selfedge入口；pure plan相应拒self，保action与原URL。

显示图像 **874360 /913422**：有有效mediaDisplaySize时object-contain，其他普通前图object-cover；框选按实际显示content容器rect归一，source此分支未做natural-image cover/contain offset补偿。正确实现首先维持源内容尺寸 / 可框DOM，不把node 350×230与自然图片尺寸混用，也不凭metadata猜letterbox坐标。占位原文为“聚焦模式” / “请选择一张图像进行「局部框选」操作” / “按ESC键可退出当前模式”。

region controller `tR` **835931–843020** 使用实际显示内容容器 `getBoundingClientRect()`；**不是canvas世界坐标、node raw box、自然图片像素或viewport坐标**。point先按client坐标归一，并限幅到[0,1]：

```text
x = clamp((clientX - rect.left) / rect.width, 0, 1)
y = clamp((clientY - rect.top) / rect.height, 0, 1)
region = { relX:min(x1,x2), relY:min(y1,y2),
           width:abs(x2-x1), height:abs(y2-y1) }
```

- 起点在已有 / pending矩形内：启动move，保存start client和region；否则开始新draw，清旧pending / edited矩形。
- draw结束只接受 `width > .02 && height > .02`，等于.02不算有效；mousemove中的虚线live rect不持久化。
- move以client delta / 当前内容rect.width/height换算归一差，relX限0到1-width、relY限0到1-height，保尺寸；不要用viewport zoom再次除一次。
- 8方向resize。边handle按原start delta自由resize，最小.02，并限到图片边；角handle锁比。无已选ratio label时ratio为region归一width/height；有label时 `normalizedRatio = outputRatio / displayedContainerAspect`。
- 角缩放按对角固定点、鼠标最大拟合、.02最小、逐边限幅；原函数在边界处最后又 `max(.02, dimension)`，有极窄剩余空间时可导致该最小值压过边界结果。应忠实记录数学顺序，不把任意再次整体clamp写成源码一致。
- 手势开始调用 `setFocusInteractingNode(imageId)`。切另一个interacting图片后当前pending / selectedRatio清空并increment clearKey。cancelKey变更时，同interacting图片清pending / ratio / frame并将interacting设null。

Source frame是z55、crosshair；drawing虚线白1px、已完成实线白1px、radius4。active有效rect用9999px黑50%box shadow压暗外区；中心31px角标+17px十字、8px handles均反zoom；移动grab/grabbing。mode关闭清本地draw/move/resize状态；已保存region由source owner params读取，只有明确相符image nodeId才作为existingRegion。无focusSource时不为全部图永久画region。

## 4. ratio、确认、持久化与删除

ratio原列表 **835931** 为 `16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16`。确认条 **920940–922820** portal到body并固定在当前图片content框下8px、水平中心；ResizeObserver、viewport transform/style MutationObserver、resize/scroll刷新位置，卸载移除。

选择ratio只修改pending、保左上角，以 `ratio / displayedContainerAspect` 缩小width或height，不扩大、不居中、不移动source节点。label选中保给后续角resize和确认。取消只清pending / label / clearKey / interacting，mode仍开、原params未改。

确认 `r3` **883330–884090** 从**最新生成器target**读params/settings，sourceURL取被框图片 `data.url[0]`（该分支非originalUrl）；一次写：

```text
target.data.params = {
  ...latestParams,
  focusRegion: {nodeId: imageId, relX, relY, width, height, imageUrl: sourceUrl},
  originImage: sourceUrl,
  scene: 'camera_focus',
  settings: {...latestSettings, [ratioKey]: selectedLabel || closestLabel}
}
```

`ratioKey` 为settings插入顺序中第一个小写后startsWith('ratio')的key，否则 `'ratio'`。无选定label时真实区域aspect=`region.width/region.height * displayedContainerAspect`，按原7个ratio的绝对差取最小，严格 `<` 更新、相等保列表先项。source不在确认时重设model、modeType、count、其他高级设置或prompt。

然后若不存在任意 `source=imageId,target=generatorId` 的edge才补入边，source不要求先删除其他图片或重排所有引用；最后关闭focus mode，保zoom、400ms回target中心。入参仅已有source-region，没有另建crop资源节点。`media-input-model` / source collector会排除 `focusRegion.nodeId` 的普通imageList，避免该原图作为第二次普通参考；不能把确认后的scene误同步回text2image而丢origin。

删除入口 [27g5ro4e8nocv.js](./source/27g5ro4e8nocv.js) **12115–12410**：只删除找到的**首条**该source→target edge，然后params patch `{focusRegion:undefined,originImage:undefined,scene:undefined}`；保其他params。model切换到 `properties.focus!==true` 时 `w` **780–1160 /2561 /8898** 也清region / origin / scene、删除首条edge，并退出该owner的active focus。没有region但active该owner时仍退出；不是切任意model都擦聚焦。

本机正式实现需先对同document / target做registered draft投影再CAS，或flush当前prompt后重验raw graph；“最新params”不能指150ms旧state。保存失败保region / label及输入以供重试，不能仅因为图commit成功关闭并丢失未保存状态。document autosave retry / history / undo / copy / export / restore继续各自既有合同，不能在model里读DOM / storage。

## 5. 聚焦的真实任务边界

上面的region确认是纯前端，可本地完整保存；真实生成另有 [3shzcyguvjig6.js](./source/3shzcyguvjig6.js) **11440–12320** `prepareGeneratorTaskParams`：先读取token/uuid，`drawFocusRegionRedBox`用原图自然宽高画红框，转换File并pre-sign上传，上传URL成功后才改请求originImage、scene camera_focus；无认证/上传会抛错。本机不运行或调用这条原站链。

[0p_bztaupj2yb.js](./source/0p_bztaupj2yb.js) helpers **1808–3080**：48px card crop使用naturalWidth/Height乘归一矩形并round，边界截断，尺寸<=0报错，输出PNG；任务红框画在整张原图上，lineWidth为clamp(round(.01*min(naturalW,naturalH)),2,8)，不是UI白框或裁剪图。UI crop预览与真实上传red-box图是两种图。

请求builder从UI参数中剥离focusRegion，camera_focus图像请求以originImage替代普通imageList。[3lfysz4968xc9.js](./source/3lfysz4968xc9.js) **24460** evalContext把camera_focus视为hasPrompt，并用originImage判断hasImage，因此确认选框后允许无额外prompt；这只证明源能力门控，不能显示“已完成生成”。登录、上传、任务 / 费用 source未接时继续明确blocked。

## 6. 元素标记完整协议与服务边界

临时store [38o6e4qs2-rnf.js](./source/38o6e4qs2-rnf.js) module747569 **40413–41730**：`markPoints[]`, `loading`, `_nextIndex=1`, `promptCursorOffset`。add point写 `{nodeId,relX,relY,index,selectedSuggestionIndex:0}`并单调increment；服务完成再补 `apiResponseId/suggestions`。clearAll清points、nextIndex、loading、cursor，仅为短暂store，不是生成器参数。

图片click实际链 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) **886500–888930 /911700**：

1. 要mode active且不loading；取markSource owner并为source图片+target生成器分别capture continuation，缓存图片data.url数组identity。异步检查还要求当前markSource相同、source URL数组未改。
2. 当前target prompt的 `MAGIC_TOKEN_REGEX` occurrence数量>=20就warn，20来自 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) **27869** `MAGIC_SELECT_MAX_COUNT`。不是按point数组或unique API ID数量限制。
3. point按click currentTarget内容rect归一，source这里未clamp；查询该surface内img，没img直接return。新增pending point和loading，原图canvas转PNG base64（去data前缀）；失败可另load CORS匿名图片再试。
4. **真正调用** `markClickSuggest({id:imageNodeId,image_base64,point:[relX,relY],lang})`。API [1k5w11_he1tz_.js](./source/1k5w11_he1tz_.js) **13300–13640** 使用真实POST/cookie token header；不把它与较新的visionClickSuggest相互替换。
5. 返回必须含id和非空suggestions；稳定UI ID为 `${response.id}_${pointIndex}`。更新临时point，向target.params.magicList保存 `{[stableId]:{suggestions,imageUrl:source.data.url[0]}}`，并插 `{{magic:stableId:0}}`。
6. insertion使用saved promptCursorOffset，合法0..prompt.length时在该处插入：两侧仅在非空且不是空格 / 换行时补空格；否则追加末尾，已有prompt才补一个空格。用最新target params，cursor消费后设null。仍留mark mode供下一点；失败删除pending point并显示“未识别出任何内容，请重新尝试”，不插假token。
7. 迟到source / owner invalid时只删除本pending，不写新doc。source finally清loading；本机controller须确保旧operation不能解锁新operation，加入独立epoch/cancel协议。

point overlay **845899–850000**：服务返回前有“分析中…”spinner；返回后suggestion bbox `x,y,width,height`按百分比画白2px矩形，label chip在点击点上方8px并clamp容器、反zoom。多suggestions可展开菜单，`relY>.6`向上否则向下；当前项点位标记、点击切selectedIndex并把target prompt首次同API token改为新index。label/box直接来自服务，禁止本机猜对象类别或注入合成识别。

删除point **885600–886250**：临时store移该API ID；target.prompt删除首次 `{{magic:id:...}}`，向前后吞**空格**再拼一个空格、trim；移magicList对应entry，空表设undefined。这里不删除所有重复occurrence，也不删除source图节点或连接。prompt内magic建议变更回调可同步临时point selectedIndex。

mark CSS [0arvpunlk99j2.css](./source/0arvpunlk99j2.css) **2546–3700**：非IMAGE节点黑30% / blur4 / pointer-events:none，但非IMAGE `.mark-mode-toggle` z51仍可退出（重要VIDEO owner例外）；IMAGE保持可点击，handles / edges全部禁命中。不能给全图一个modal阻断目标生成器退出，也不能把非图像所有控件继续放行。

没有运营识别source时，本批不提供假成功按钮 / fake suggestions。完整组件可通过可注入合法source单测，但实际默认writer absent应明确不可用；fixture成功不等于真实识别能力。纯前端focus确认可独立推进，不要求用户登录、小号或账号资源。

## 7. Escape、取消、退出与reset区别

[21_0xvlvkw1sz.js](./source/21_0xvlvkw1sz.js) Focus bar **160226–161255**：标题“聚焦编辑模式”，副标题“请在图片上框选聚焦区域”，Target16，return“返回节点”，X退出。window Escape若 `focusInteractingNodeId!==null` 先increment cancelKey；否则退出。return保持当前zoom、target measured→stored→200 fallback中心、400ms后关闭模式。源不是先清已保存region。

Mark bar **180087–180940**：标题“元素选择模式”，副标题“点击图片选择局部元素”，MousePointerClick16；Escape stopPropagation后exit+clearAll。return同样保zoom400ms、再exit+clearAll。clearAll只清临时point UI，已经写入target prompt / magicList的引用保留；不能退出时把用户输入也清空。

Focus确认条“取消”只取消pending，frame clearKey重建/清local状态，保mode与原region；右X / second Escape / top return才exit。开始画但mouseup尚未完成也已有interacting ID，因此Escape先取消当前图手势。切source图片、mode接管或doc reset清临时pending。existingRegion仅在本target.focusRegion.nodeId匹配时读取；编辑新图后旧region不会被其他surface误展示。

Sourcewindow键盘监听本身没有dialog-stack topmost判断；本机必须沿共享叠层所有权处理，不能照抄成抢先关闭preview / expanded frame的独立全局监听。菜单 / crop preview / frame展开应先消费Escape，pending其次、mode再次；这里是明确本机可达性适配，保持已保存参数与输入。

取消生命周期还须分清：tR的clearKey effect只清pending / edited矩形，未单独清draw / move / resize布尔与各start ref；mode false effect才清全部状态。不能把source cancelKey说成已具备完整pointercancel；本机owner取消时应同时停止该手势并拒迟到move/up，避免Escape后mouseup复活pending。这属于明确稳定性适配，原state字段与保已保存参数的合同不变。

## 8. 可拆分的纯model与controller接口（建议）

建议domain / generator focus纯模块维护：point normalize、draw有效区、move / 八方向resize、ratio shrink / nearest、confirm graph plan / remove graph plan。输入client point与真实content rect由controller提供，纯模型不访问DOM / React / Canvas / image / localStorage。

```text
normalizeFocusPoint(clientPoint, contentRect) -> {x,y} | null
drawFocusRegion(startClient, endClient, contentRect) -> region | null
moveFocusRegion(region, startClient, currentClient, contentRect) -> region | null
resizeFocusRegion({region,handle,startClient,currentClient,contentRect,
                   ratioLabel,containerAspectRatio}) -> region | null
applyFocusAspect(region, label, containerAspectRatio) -> region | null
closestFocusAspect(region, containerAspectRatio) -> label | null
planCanvasFocusRegion({nodes,edges,targetNodeId,sourceNodeId,region,
                       ratioLabel,containerAspectRatio,makeEdgeId})
 -> {nodes,edges} | null
deleteCanvasFocusRegion({nodes,edges,targetNodeId}) -> {nodes,edges} | null
```

Root已确认可落盘这些纯API，下方记录实际新增范围。target graph应是同owner已投影draft的最新有效graph：confirm plan保latest params / prompt，只写上述focus字段与必要一条edge。controller持有 `(documentKey,documentEpoch,modeEpoch,targetId,sourceId,sourceUrlIdentity)`，source changed / removed、权限 / schema lost、pointercancel / capturelost / unmount取消；按原几何投影display矩形，保存 / Quota失败可重试而不假退出。

source基础资格（IMAGE model.properties.focus / magic、VIDEO magic、assetBoard / slash / onlyFineTune）与本机ready / readonly / schema loading / writer availability防御分别表达。image URL必须是真实当前资源或明确已读好的localMediaReady适配；未上传 / pending blob / source不匹配不得当server-ready。focus确认不依赖服务器可保存，生成 / red-box upload继续blocked；mark识别没有source不推演结果。

## 9. 本批纯model范围与验证

Root确认后新增 `src/features/canvas/generator/focus/focus-region-model.js/.test.js`：上列八个几何 / 图plan函数、按序冻结的 `FOCUS_ASPECTS`，以及 `focusGeneratorCapability({node,schema,isAssetBoardMode,onlyFineTune,slashPreset}) -> boolean`。`planCanvasFocusRegion` 另接 `containerAspectRatio` 以计算未选label时的实际closest ratio；`makeEdgeId` 由caller注入，已有任何source→target边则不调用。只有确定source / target / geometry和唯一ID才返回新graph，否则null、不改输入。

模型保持model / modeType / count / prompt / settings其他项 / advancedSettings / data.action /位置尺寸，source节点与非变更edge保持原对象。sourceURL仅正确数组首项，拒损坏graph、重复ID、string而非array的URL、无内容、损坏params/settings、非法ratio / rect，不猜自然尺寸。region确认允许resize后的恰好.02（draw结束仍严格>.02）；无region的delete返回null，存在region时清三字段并只删除首条对应edge。确认plan的source权限 / localMediaReady、targetschema能力、standalone parent / protection / readonly / loaded、mode epoch、草稿投影、history / CAS / autosave均由caller协调，不能把这组pure测试当实际写服务或modeUI完成。

Node24.19.0定向39项正式通过（16:41:24 /633ms），日志 [canvas-focus-region-model-tests.log](../artifacts/canvas-focus-region-model-tests.log)，定向ESLint零警告、源码与本文Prettier通过。此前32项初次通过（16:36:33 /646ms）；随后补核canonical underscore枚举、enhance缺证据，并增加原7个ratio各自按钮→corner resize的physical aspect回归后得到最终39项。结果覆盖client rect归一、零边 / 非有限保护、strict draw门槛、全部八方向与ratio锁 / nearest tie、原资源display例外、self拒绝、相符URL与fresh params、单edge复用 / 首条移除、损坏graph防覆盖。不冒充全量check或UI模式完成。

没有改Root现有Canvas / view / controller / config文件、运行原站bundle、读取登录或账号、请求服务或新增native验证。已有reference模式及Root的其他手势修复不受本次模型工作影响。完整原站功能 / 手机 / Safari、真实识别、上传、费用与生成的剩余范围保留。

## 10. 本批受控视图与定位生命周期

Root确认props后新增同一focus目录的 `CanvasFocusSurface.jsx` / `CanvasFocusModeBar.jsx` / `CanvasFocusConfirmBar.jsx`、唯一样式 `focus.css` 与三份view回归。没有改NodeCanvas、Viewport、InlineGenerator、Root controller或旧公共样式。

- Surface为forwardRef，ref指实际内容overlay，接 `{region,active,drawing,interacting,zoom,disabled,onStart,onResize}`，可选resizeHandle只表达cursor身份；不读取graph/store，不持pointer / region状态，不绑window move/up，不做保存。pointerdown stopPropagation / preventDefault，再回caller；八柄委托 `onResize(handle,event)`，不误入普通draw回调。rect全部受控、31/17px中心glyph和8px八柄反zoom、白1px虚线 / 实线、active外区黑50%均按源。
- 源黑9999px阴影靠前图parent的overflow-hidden裁在图内；本机独立Surface采用overflow-hidden/radius12维持等效内容裁切，避免feedback-body的overflow-visible把黑罩铺到board或target afterContent生成器。它不改变图尺寸、prompt anchor、selected或history。
- named `FocusModePlaceholder` 显示精确三行原文，不造点击入口、生成task或新资源。
- ModeBar精确标题“聚焦编辑模式” /副标题“请在图片上框选聚焦区域”，Target16在32px白20%容器，返回 / X按钮与原蓝bar尺寸。只有caller处理Escape / 返回400ms / exit；view不第二次监听或body锁。关闭aria明确为“退出聚焦模式”，属于本机可达性扩展。
- Confirm为non-modal body portal，props `{active,region,selectedRatio,surfaceElement,ownerKey,disabled,onRatioChange,onCancel,onConfirm,error,onRetrySave,retryDisabled}`；seven ratios /取消 /确认原顺序，固定在当前内容center / bottom+8，screen尺寸，不乘world zoom。不强行聚焦、不改controlled region、不处理Escape、不建立dialog或滚动锁。
- 单一layout effect观察实际surface ResizeObserver、closest `.cv-world` /原 `.react-flow__viewport` 的style / transform MutationObserver及window resize / capture scroll。rAF合并measurement，取消旧frame、disconnect两observer、移除所有监听；closure同时检查opaque ownerKey、surface identity、active与当前bar element。StrictMode replay、换surface和A→B→A旧回调不能更新新owner。不可测 / detached surface隐藏，不猜node位置。

Quota错误区和“重试保存”为明确本机适配：已commit的ratio /取消 /确认可通过disabled禁用，retryDisabled独立控制合法retry，Root在保存成功后才exit；错误 /重试不冒充原服务成功。caller继续重验当前ready、权限、document / mode owner与CAS，view本身不将callback返回值解释成任务完成。

desktop保原p4、gap2、font12、black75% /blur8 /radius8确认条；<=600px仅在该view内允许ratio按钮换行、max-width及bar文案折行，避免窄屏遮挡。reduced-motion停止bar过渡；这些是已明示适配，不称原站手机或Safari像素一致。

新增3文件23项view测试通过（17:19:24 /1.24s），随后加内容阴影裁切回归再次通过（17:22:34 /1.34s）；最后受控resize cursor完成后同一23项通过（17:23:27 /1.19s），最终log [canvas-focus-view-tests.log](../artifacts/canvas-focus-view-tests.log)。覆盖真实callback分离 /disabled、placeholder原文、受控region不自写、client overlay ref、全部柄委托、受控resize cursor、固定body定位、layout观察 /rAF合并 /cleanup /stale owner /StrictMode、不可测surface隐藏、Keyboard Space仍native激活但不pan、Escape交caller、Quota只retry而不重复commit、已有焦点不被夺走，以及本域CSS尺寸。单测rect为明确JS DOM fixture，不当实际浏览器照片或绘制几何验收；Root actualApp /全check /native另记录。

## 11. Root后续接线与最终范围

上方纯模型/view为各自历史快照；Root已接IMAGE focus真实schema入口、controller/actualApp/Attachment/CAS/history/保存恢复与camera_focus originImage/无额外prompt规则。source最后min的可达端点与后续ratio/move/resize闭包由pure13/controller第34项补证，region有限起点0..1、正尺寸、端点最大1.02+ε，不再额外reject源可达几何。

Confirm跟随transform transition并取消旧RAF；<=600按actualbar width clamp8px，ModeBar窄屏max-content/action不缩、320标题/副标题正常换行。FocusConfirmEntry是真dynamic import模式预加载，失败保pending/retry/cancel，CSS保持eager。原生1280/390/320范围、失败/修复/独立测试及337/4500最终全check见 [聚焦验收](./canvas-focus-functional-audit.md) 与 [所有权复核](./canvas-focus-owner-review.md)。上方各agent没有接Root/没有native的声明只描述当时scope，不代表最新整体代码。Mark/capture、远端教程播放、全局publish protection/private scope、真实红框上传与生成继续未完；本机未部署、不称原站全量或真机验收。

## 12. Root后续 Mark 接线与边界

上方§11的“Mark仍缺”仅表示聚焦冻结批次。最新Mark前端已由 `generator/mark/` 接 IMAGE/VIDEO能力、独立按需Bridge、真实source契约/自然尺寸reader、prompt/meta/候选菜单与Core pruning、模式互斥、一次CAS/history/flush与迟到owner取消；默认source未连接，成功识别只用明确adapter回归，不能冒充运营结果。三renderer compact/fallback浮层共用真实board宽的横向overflow适配，原CSS和source图不改。源、本机防御与原生/受控范围、完整352/4745检查见 [本批验收](./canvas-mark-functional-audit.md)；capture/未核renderer、服务、完整prompt badge undo和真机边界继续未完成。
