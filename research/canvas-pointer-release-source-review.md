# 节点松手起拖、原生综合坐标与源码边界

2026-10-12。本批作者只新增 `hooks/useCanvasPointer.release-start-review.test.jsx` 和本文；生产修复由 Root 持有。未改任何旧测试、图协议或 UI，也未操作用户 tab2、执行归档 bundle、读写原站或运行全量 check。

## 1. 原生证据能证明什么

[canvas-mark-browser-proof.json](../artifacts/canvas-mark-browser-proof.json) 及实际 GUI 导出给出以下独立范围：

- Focus最终导出与第一次Mark导出 nodes/edges 完全一致，view不同。
- 后续综合 VIDEO/Script创建、Undo、fit和多个节点选择后，两旧image的position不同；data及edges仍一致。
- 随后的隔离Mark hand-pan前后 nodes/edges严格一致，仅view.y从214.3163429696889变成164.3163429696889，差值-50。

综合前后两个位置为：

| 节点 | Focus/第一次Mark | 综合后/隔离hand-pan前后 |
| --- | --- | --- |
| `local-7fhuhd3q` | `(50,50)` | `(-91.92684559339892,23.80480819873594)` |
| `local-xiai64a8` | `(395,140)` | `(546.6118218925563,-51.48799596207871)` |

不是两个节点共享的一次平移增量。缺少每个点击/拖动的导出和pointer事件序列，不能把综合差异归因于Mark，也不能直接断定CUA或fit动画是根因。隔离hand-pan的严格图一致不能外推为整个综合流程保持position。

## 2. 本机真正能写position的路径

`useCanvasNodeActions.addNode`仅构造新节点并append，`createCanvasNode`不移动已有节点。`useSnapshotHistory`的undo/redo只restore已记录nodes/edges快照；不会重新布局、fit或计算旧节点坐标。`NodeCanvas.fit`和`focusNodeView`只更新view；400ms CSS transition位于Viewport的`.cv-world`，没有节点写入。因此这些动作单独不能解释两个旧image的新position；Undo也可能正常恢复此前已发生的手势快照，不能把“Undo后位置不同”单独视为历史系统错误。

普通拖动实现现位于共享 `features/editor/useGraphPointer.js`，Canvas的 `useCanvasPointer`仅注入profile和纯策略。其 `projectMove`在移动量达到本机4屏幕像素时record一次、建立moving、投影节点位置并安排autoPan RAF；click及未越阈move不启动pan。ordinary采用当前world cursor与down origin的差；虚拟框采用screen delta/current zoom加累计pan补偿。已开始的手势最后up坐标仍有本机最终落点适配，不倒退为旧末位。

具体缺陷是修复前 `end`不区分node是否moving，直接将有合法PointerEvent坐标的pointerup交给 `projectMove(...,true)`。因此Down(400,300)、无任何Move、Up(410,310)，zoom0.5时可把(50,50)变成(70,70)，并在松手时首次record。不是仅在结束时提交已发生的drag，而是在end启动了新drag。

独立新回归修复前2项中1项失败：[canvas-pointer-release-start-review-tests.log](../artifacts/canvas-pointer-release-start-review-tests.log)，21:10:49、713ms；真正已起拖后的最后up位置与一次history正向项通过。该证据确认具体producer缺陷，但仍未确认它就是上述原生综合差异的发生过程。

## 3. 直接归档源码：ordinary与virtual不能混写

下列偏移为解码后Unicode字符的零基位置，不是byte/line。完整anchor、短snippet与源SHA保存在 [canvas-pointer-release-source-proof.json](../artifacts/canvas-pointer-release-source-proof.json)；仅读取，未运行原代码。

| 来源 | 字符偏移 | 直接规则 |
| --- | --- | --- |
| `1kb-4b4zv9_2a.js` XYDrag `drag` | 109258 | drag事件越源默认threshold才调用C，C建立普通drag items/start |
| 同文件 `end` | 109735 | `if(!c||f) return`；未起拖直接结束，不从up建立C或投影新位置 |
| `21_0xvlvkw1sz.js` iF `X` | 295538 | virtual pointerdown即建立active状态，读取Alt/Meta并准备坐标 |
| 同文件 I初始化 | 296551 | `I.current={x:0,y:0}` |
| 同文件调用start | 296702 | `n?.({altCopy:o,copyInternalEdges:i})`发生在pointerdown |
| 同文件 `h` | 297126 | move/pan更新I并即时或RAF投影；并非RF的C协议 |
| 同文件 `b` | 298306 | pointerup只调用N(true)，不读取up的clientX/Y |

iF的N在仍有待交付RAF时flush已有I，然后以已有I和最后A调用onDragEnd。没有move时I仍为零，所以up坐标不能单独造成位移。**其start/copy请求却在pointerdown发生**，不能用ordinary的move-start结论冒称virtual也是move-start。本机既有4px阈值和延后复制是已登记的手感适配，本批只防止up单独产生新移动/复制，不改变该适配。

早先笼统以“node mode”覆盖所有手势的表述需要区分内部mode与source入口：本机普通node和virtualframe的内部mode均为node，但source普通由RF C(move)起拖，virtual由X(down)调用start。两者source end均不从up坐标计算新位移，所以共享guard可以防release-only位移；理由不是“两者都在move start”。

## 4. 修复与旧fixture保留

Root在共享end加入 `(gesture.mode !== 'node' || gesture.moving)` 后才处理末次up坐标。pan和框选的末位行为不变，已moving的普通节点及虚拟框最后up位置、一次history与兼容click抑制仍保留。

旧 `uses caller drag IDs without replacing the visible operation selection` 的fixture是selectionDown后直接up，以up触发首次位移；其真正测试目标是caller drag IDs、parent相对位置和operation selection。建议只在down后补 `page.move({clientX:20,clientY:30})`，随后原same-up和全部nodes/selection/record断言保留；不恢复release-only producer，也不删除强断言。该旧文件由Root修改，本批作者未编辑。

## 5. 独立最终回归与验收边界

新review测试对Canvas策略和公共useGraphPointer默认策略各验证7项，共14项：已起拖普通末次up；无move release不启动；subthreshold move后大up不启动；Alt down/up不复制或record；virtual无起拖在Alt开/关时不位移/复制；已起拖virtual末次up、原selection、一次history及兼容click保留。FilmGraph直接使用该公共hook，paired默认策略覆盖共享分支，不把它称为真实FilmGraph UI或原生影片验收；既有FilmGraphMedia测试mock该hook，不能用于证明这项末位修复。

Node24 14/14通过，21:26:41开始、507ms，日志 [canvas-pointer-release-final-review-tests.log](../artifacts/canvas-pointer-release-final-review-tests.log)，ESLint零警告、Prettier通过。Root的旧Pointer/projection和实际App联合检查另外记录；本批未改旧timeouts或运行完整check。

下一步原生定位应保持生产冻结：每次add/undo/fit/节点选择分别GUI导出；fit后等 `.cv-world` 的transition结束，再重新取得实际rect/AX目标执行下一手势。CSS正在插值时数据view已为目标值，旧AX坐标或沿正在移动的节点更新mouseup坐标可带来手势误判风险；这是需event/逐步证据验证的风险，不是本次已证明的CUA错误。不得用fixture直接改用户画布替代原生复验。

## 6. 未接capture模式不是原生pointer capture

source21的ak在725362为 `canvasLocked`；753500附近独立 `isCanvasCaptureMode/enterCaptureMode/exitCaptureMode` 在active时提供 `{nodesDraggable:false,elementsSelectable:false,nodesConnectable:false}` 和capture-mode class，并在最终ReactFlow props后由oC覆盖。后续两路独立审计确认它是前图URL→callback的“画布抓取”，不是区域截图；24mj的t4未消费onCanvasCapture，当前归档不能证明可见入口。当前本机已有原生setPointerCapture和Mark/Focus/Reference owner，不将其称为Canvas capture实现，也不凭dormant callback创造按钮。若未来有可达入口证据，才接相应模式、writer与所有权，见 [视图审计](./canvas-capture-view-source-audit.md) 和 [服务审计](./canvas-capture-model-source-audit.md)。本批没有扩大实现此模式。
