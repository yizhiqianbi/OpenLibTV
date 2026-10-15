# Canvas 普通多选外框、工具栏与批量端口源码核对

2026-10-11。本次只读取已归档的公开客户端片段，未登录、使用账号资源或执行原站脚本。本文的源码判断不能替代原站登录态和真实浏览器像素验收；生产接线、整站检查及实际浏览器结果由根代理另记录。

## 直接源证据

| 文件与字符位置 | 已确认契约 |
| --- | --- |
| `source/16k_l1hir0zic.js@27300–29600`，189224 | 普通虚拟多选的成员、单真实 Group 隐藏、bounds、拖动与操作 ID 集合。副本见 `2nko6splgjkeq.js@69000–70800`。 |
| `source/04q9x43g2p9-v.js@25700–27700`，957166 | `GROUP_PADDING=20`、`SELECTION_TITLE_TOP_PADDING=36`，补偿函数 `20*(sqrt(zoom)-zoom)/zoom`；`compensateBounds` 四边加一次此值。 |
| `source/2yyck7brx0tqq.js@599`，946321 | 普通节点可见端口外延 25，边距 5。多选 bounds 水平方向含 `20+25=45`。 |
| `source/21_0xvlvkw1sz.js@293354–299933`，iF | 选区预览在未缩放 overlay 层，以当前 flow transform 映射；再次加一遍屏幕补偿；fill 与五条屏幕拖动 strip，滚轮/空格/中键转为 viewport 手势；纯视图本身不定义 batch 连接规则。 |
| 同文件 `@181000–183570`，nB | 多选 Add 的 24×24 glyph 与 80×80 hit；静止中心在右边界外 17px，鼠标相对 hit 中心各轴限制 ±28px；80ms ease-out 随动，400ms 弹性返回。 |
| 同文件 `@183620–194099`，nq / nK / nJ | 独立批量拖连，10px threshold、80px 边缘自动平移、720px/s、dt 上限 .05s；每个实际 source 独立连到游标，多选 menu 是独立六类协议。 |
| 同文件 `@194099–205200`，n6 | 工具栏锚定选区 `flowPosition`，transform `translate(-50%,-100%) translateY(-14px)`；按钮顺序、Group hover 菜单、新点提示、下载状态与布局 portal。 |
| `source/3u6hjewm8qox_.js@806186`，832426 | Toolbar row padding8、gap8、radius12、.5px border、原控件颜色、shadow `0 4 10 rgba(0,0,0,.08)`、blur16。 |
| `source/1h-b10gcvw4vl.css@244215–245170` / `@245822–246755` | dark selection `#ffffff0f`、selected border `#a8a8a8`、controls bg `#262626` / border `#363636` / text white；light selection `#0000000f`、selected border `#919191`、controls bg white / border `#0000000f` / text `#262626`。 |

位置是 UTF-8 解码后的字符位置，避免将整个 minified 行当证据。只提取业务和样式片段，不运行 telemetry、生产 API 或原站 store。

## 普通虚拟多选的 ID 与 bounds

`resolveVirtualSelection` 从 selected IDs 去重找现有节点。当 selected 中恰好一个普通 `type=group`，且其余所选节点全部是它的后代，返回 null；真实 Group 本身负责视觉和工具入口。两个被选中的普通 Group 不满足这一“单真实 Group”规则。

普通虚拟 targets 为“所选非 Group 节点”加“所选普通 Group 的直接 children”，按 ID 去重。它不递归展开 grandchildren；`VIDEO_GROUP` 不自动被当作普通 Group。`groupsToRemoveIds` 保留所选普通 Group；`dragNodeIds` 为所选节点中 parentId 没在 selected 集合里的节点。目标 ID 与拖动 ID 不同，不能把展开的孩子和父组一起重复移动。

对于成员实际世界坐标与尺寸 union `(minX,minY,maxX,maxY)`，未补偿 bounds 为：x=`minX-45`、y=`minY-56`、width=`maxX-minX+90`、height=`maxY-minY+76`。其中 36 为 title 区，水平 25 为可见端口外延。随后按 zoom 加第一遍四边补偿。toolbar position 为实际成员 union 顶部水平中心 x，y 为补偿后的 bounds.y；它既不是 canvas 顶部固定工具条，也不是直接围住节点 body 的 rectangle。

虚拟多选 source 入口从 targets 中过滤 `data.type=REFERENCE`，不另展开；真实 Group 的 source 查询为另一函数，会递归找到后代普通 Group 的非 Group / 非 REFERENCE leaves。资格模型再按 action 等规则决定可连接或可创建类型。视觉 model 的 `sourceSeedIds` 因此保留 targets 原种子，不先过滤或递归，以免形成第二套连接协议。

## 外框和工具栏

iF 把已补偿的 bounds 左上变换到 canvas overlay screen 坐标，再加 `compensation*zoom`：left/top 各减这个值，width/height 各加两倍。第一遍 virtual bounds 补偿与第二遍 overlay padding 不能混为一次。borderWidth 为 `max(.75,zoom)` 屏幕 px、圆角固定 8px、虚线、低透明度白色 fill；不是当前本地旧的青色矩形。

外框 wrapper pointer-events none，fill pointer-events auto；fill 与五个 hit strip 都可抓住移动。上下 strip 高12，左 strip 宽12；右上下各高 `calc(50%-32px)`，留出右中心批量加号。静止 cursor grab，拖动 grabbing，Alt copy 则 copy。Wrapper z30，与真实节点 world renderer 分层；右端口 z9999。

工具栏锚定上述 flowPosition 并按当前 transform 转 canvas overlay screen，保持固定屏幕按钮尺寸，在 bounds 顶部外14px；常规 row 不缩放。动作顺序是 layout、save、duplicate、group、download、Chat、Skill。Group hover 立即打开、离开120ms后关闭；Layout 在触发器上方8px，是 position fixed portal。原 row gap8；本地批量 toolbar 此前 gap4、固定 canvas 顶16中心、横向窄屏滚动，是应明确区分的已有适配/差距。

后续本批已改 `batch/CanvasSelectionToolbar.jsx`：新增可选 `anchorPoint={x,y}`，接收上述 board-local screen 坐标，source transform为 `translate(-50%,-100%) translateY(-14px)`；无有效 anchor时继续保留caller旧style。`batch.css` row已改gap8、dark背景#262626、border#363636、textwhite与shadow `0 4 10 #00000014`。source固定 screen尺寸保持，左右不因zoom缩小。

窄屏可达性明确作为本地适配：测量toolbar与最近 `.cv-board`（无board时parent），宽度最多board−16、center钳在8px水平留白范围；top考虑实际toolbar高度与14px offset，以最终top不低于8px、bottom尽量不越过board−8。完整动作仍以水平滚动到达，不删动作，也不将本地窄屏clamp称为源n6的已核实逻辑。ResizeObserver观测toolbar/board并与window resize协调，卸载取消RAF/observer/listener。Anchor更新只重新定位，不重挂toolbar或menu，开放popover用共享 `agentToolbarPosition` 更新当前位置，不抢现有keyboard焦点。

源 n6 带一次性 Group 新点提示：`libtv.canvas.multiSelect.groupMenuNewDotDismissed`，选择普通打组或合并分镜组后记忆。此处仅记录证据，未因视觉层新增 storage 读写。

## 多选 Add 视觉与独立协议

Source nB 的右侧 hit button 左上在 bounds 右边中点，width80、height80，translateY(-50%)；内部24px glyph 在80px flex中心后 translateX(`5+12-40=-23`)，故 glyph center 位于右边界外17px。它不是普通节点20px加号外15px；不应共用普通 handle 的静止坐标常数。hover 相对80px hit中心，而不是相对静止 glyph center。

Static glyph 不交互、不进焦点顺序。`nB` 的默认 `placement="center"`（同文件约181421），右侧入口由 `nJ` 显式传 `placement="right"`；只有右侧静态形态才是 left=rightEdge、translate(5px,-50%)，24px glyph center同样外17px。`nJ` 约192683 的 viewport cursor indicator 不传 placement，故取默认 center，以 `translate(-50%,-50%)` 将圆心放在真实游标/松手位置，不加右端口的17px偏移。颜色沿 controls 变量；light glyph 透明背景、无 shadow，dark 使用 shadow-md。source 14px plus stroke1.6 round。

批量 pointer owner nJ 在位移≥10px才起拖；短按小于300ms且小于10px切 menu。真正拖连时隐藏原右侧 button，以24px passive indicator跟游标，并为每个实际 source画独立预览线；release尝试现有目标后按结果显示批量菜单。它与普通节点 Strict80-world-units / 1px 阈值拖连、tiny ghost node 和上游创建 menu都不是一个协议。新增本地视觉文件不承包这些 controller / menu / validator 功能。

## 本批专属实现接口

- `domain/selection-overlay-model.js`：`canvasVirtualSelection({nodes,selectedIds,zoom,getNodeSize?})`、`canvasSelectionSingleRealGroup(nodes,selectedIds)`、`canvasSelectionOverlayProjection({bounds,view,zoom?})`、`canvasSelectionZoomPadding` 与 `canvasSelectionAddHover`。没有 React、DOM、history、storage 或业务写操作。默认 source measured→width/height→200/120；caller 必须注入本地 `canvasNodeSize`，以匹配当前 world renderer width/height优先级。bounds input 已含第一次 compensation，projection只做第二次。
- Virtual resolver 的世界坐标复用 `groups.canvasWorldPosition`，支持 nested parent 与 cycle 防护。源189224的当前 bounds 代码仅做一层 parent 加法；递归解析是本地持久化协议适配，不能称原站此函数也支持所有嵌套层。
- `components/CanvasSelectionOverlay.jsx`：ready/readonly gating、外框和5条 strip；接收 onPointerDown/onClick/onLostPointerCapture/onContextMenu/onWheelCapture，转交 caller。单独 Add callbacks 为 onAddPointerDown/onAddClick/onAddLostPointerCapture；sourceNodes、addVisible、addInteractive、addDragging控制视图。不会主动 capture pointer、写 selection、创建菜单或订阅 window pointer。
- Named `CanvasSelectionAddIndicator` 用于真实 Group 的独立入口及多源 viewport passive glyph。point 为对应 overlay/viewport screen 坐标；`placement` 区分右端口默认形态与显式 `center`。它只拥有 hover transform timer，卸载/隐藏/变静态清理；其他手势、菜单、失焦与文档所有权仍由 controller负责。
- `components/canvas-selection-overlay.css` 保留源 screen尺寸、gray虚线/白fill、right hit gap和固定glyph；reduced-motion关闭过渡是可访问性适配，不声称原站已明确这条规则。
- 根代理随后委托的 `hooks/useCanvasPointer.js` 只增加 `dragSelection(event,ids?)`：board capture 的普通 `begin` 先忽略真实 selection overlay，让独立入口保留既有多选；该入口复用普通拖动的 owner/capture、4px本地起拖、一次历史、parent-relative roots与最终pointerup位置。`Space+left`、手型与中键仍使用原 pan路径，不伪造 cv-node ID；不新增 window pointer owner。4px与源码 iF 的立即移动有意区分，Alt copy、框体拖动自动平移/高级drop仍未在此入口实现。

纯 model 不筛掉 REFERENCE、未知 action 或 source资格；批量 source 查询由 `connection_ghost` 独立模型唯一维护。只读模式和未 ready 无交互外框；调用者仍须在每次事件中核对最新文档/ready/readonly，不能只依赖 UI 隐藏。

## 验证与范围

专属两个测试文件覆盖 source bounds / 两次 zoom补偿、真实单组隐藏 / 多组直接展开、world嵌套 / cycle、renderer尺寸注入、去重 / 纯性 / 无效几何、screen空间固定尺寸、外框与Add独立事件转交、稳定DOM身份、hover范围 / source timing / timer清理、static glyph 与lostcapture转交。根代理集成验证另记。

2026-10-11 18:03:37 定向运行 visual model / visual component / Pointer 共 **3文件78项**通过，耗时1.45s；上述三个生产文件与三个测试文件的零警告 ESLint通过，专属源/组件/CSS格式已核对。此前视觉两个文件34项独立通过。Pointer新增用例明确检查capture先后、共享拖动/相对孩子/最后坐标、caller drag IDs、Space/hand/middle、coarse mouse和单touch、控制隔离、ready/readonly/linking门控、空目标、切文档、pointer身份和lostcapture；不把这些DOM夹具当作真机手势。

2026-10-11 18:10:47 Toolbar **1文件9项**通过，1.34s；零警告ESLint与本批格式通过。新增测试覆盖源anchor/固定screen尺寸、旧style兼容、narrow超宽与上下边界、open menu保持同一DOM及keyboard焦点、board/row重测与RAF清理、暂不可测的parent。CSS自定义变量fallback因jsdom不解析，按实际CSS声明检验；该结果不替代浏览器颜色与像素验收。

本视觉文件初次验收时，原生 `useCanvasTouch` 仍需要由根代理协调：它的触点mode原来只识别 `.cv-node`，若 selection overlay按pane起pan，将在touchstart取消新的Pointer拖动。随后根代理已把 `.cv-selection-overlay` 纳入独立可移动 surface 分类，仍让第二触点取消 Pointer 并进入 pinch；不通过伪造节点元素或另建 Touch owner 绕过。该 hook 未由此子代理修改，触摸完整验收以根代理记录为准。

2026-10-11 20:03:56，多源 view 定向检查 **2文件52项**通过，1.14s，日志 `artifacts/canvas-multi-view-final-tests.log`。`CanvasConnectionMenu.test.jsx` 共43项，包括保留原单连语义的回归与9项 multi 专属用例：精确六项标签/图标透传与顺序、无 badge/Script flyout、196px/32px/14px 样式契约、居中与8px viewport clamp、anchor/resize 不重挂且保留焦点、Escape 只关子菜单、原 opener 消失后的 caller fallback、外部 pointer/focus 不延续单连且不抢新焦点、disabled 仍可见但键盘跳过。`min()/calc()` 的 viewport 声明因 jsdom CSSOM 丢弃，直接核对 CSS 源声明；不据此宣称真实像素测量。

新增 `CanvasMultiConnectionPreview.test.jsx` 共9项，使用实际 view/纯世界坐标投影而非 mock renderer：当前文档优先于过期 source snapshot、嵌套父子 world 坐标、图谱顺序/去重/删除来源、每个来源到同一原始 cursor 的 Bézier、zoom 同时缩放2px基线及4px蓝流段、3秒组动画与 path 继承、不产生 ordinary ghost/节点/invalid tooltip、body/dialog portal 与 light theme、固定 viewport 无交互 surface、24px passive circle 真正中心定位、无效/缺失几何与 StrictMode 卸载清理。SVG 与 CSSOM 不能证明实际 GPU 动画、原生手势或真机触摸；根代理的浏览器结果与全量检查另记。

当前文件没有证明真实原站多选全部浏览器动作和像素；批量连线六类菜单、source模型资格、timeline提交与账号服务、真实手机触摸以及Group新点提示/完整popover布局仍按对应实现与审计验收，不据本文宣称完整复刻。
