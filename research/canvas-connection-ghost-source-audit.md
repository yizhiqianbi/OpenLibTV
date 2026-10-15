# Canvas 空白连接释放与临时端点审计（2026-10-11）

## 范围与证据

只读既有公开客户端文件，未执行原 bundle，未登录、使用原站账号或发送生产写入。以下 offset 指文件中的 UTF-8 JavaScript 字符偏移；这些文件多数为单行压缩源码，因此用模块 ID、分支名与 offset 定位。

- `research/source/1fn_ozkqd_aiz.js` module `265672`：连接后的新增节点 controller；入口 offset 9611。
- 同文件 module `734301`：`useCanvasAnchoredScreenPosition`；offset 28525。
- `research/source/3u6hjewm8qox_.js` module `272776` 的 `nodeTypes.temp`，offset 1682773。
- `research/source/0leiedr1esdbe.js` module `577236`，offset 218949 附近：临时 ID 与识别规则。
- `research/source/1kb-4b4zv9_2a.js` module `713118`：`NODE_WIDTH=350`、`NODE_HEIGHT_EMPTY=350`、`NODE_GAP=100`；XYFlow `getHandlePosition` offset 100187、`getEdgePosition` offset 127824。
- `research/source/255axd08169oj.css` offset 6393：React Flow handle 的 6×6/min5、左右变换；`research/source/1h-b10gcvw4vl.css` offset 13250：全局 border-box。
- `research/source/10v03g6udfcrl.js` module `605784`：默认 edge renderer 使用 XYFlow `getBezierPath`，未声明 curvature，因此为 `.25`。

## 拖到空白处释放

module 265672 的 `eV` 分支（offset 20608 附近）收集鼠标坐标或 `changedTouches[0]`，下一 RAF 检查仍存在的 `connectingRef.source`。已判 invalid 时清状态退出；已连接现有节点时清状态退出；限制体验或他人编辑锁拒绝时不建立临时端点。

通过检查后将 release 的 client 坐标转换成 flow 坐标 `e`，分别保存在未来节点位置 `ep` 和菜单屏幕初始位置 `el`。临时节点为固定 ID `__temp_connection_node__`、`type=temp`、`position=e`、空 data，且 `draggable=false`、`selectable=false`。`addNodeToStore` 明确 `skipOverlapResolution=true`，不会为了预览而把 release 点挪到其他位置。

临时 edge 固定 ID 为 `__temp_connection_edge__`。source 输出发起时是 origin→temp；target 输入发起时是 temp→origin。实际 edge 的 source/target handle 始终分别为 source/target。颜色为 `var(--canvas-edge)`、2px。origin 为 `REFERENCE` 时额外 `strokeDasharray=6 4`，两个方向都保留；这里不是拖动过程的蓝色发光连接预览。

## 临时节点尺寸与显示

`nodeTypes.temp` 的视图是一个空 div：nominal width/height/min-width/min-height 均为 1，背景 `var(--Surface-secondary-background,#262626)`，未选择时 1px `var(--canvas-node-border)`，relative、overflow hidden。div 内保留左右两个普通 React Flow Handle，背景为 `var(--canvas-handle)`。没有标题、图标、提示文案、Skeleton 卡片、350px 内容、拖动把手或显式动画。

因此不能把这里实现成大空白卡片或可拖动占位节点。1px 声明也不能直接当作实际 outer border-box 的 DOM 测量值：全局 border-box 与两侧各 1px 边框使使用尺寸至少 2px。6px Handle 的左右变换将 handle 中心放在这个 used box 的中心，XYFlow 对 Left/Right 取 handle 外侧，按这些已捕获 CSS 计算，temp input 外侧为 release.x−2，output 外侧为 release.x+4，y 为 release.y+1。此处是源码与 CSS 的几何推导；原站当前匿名入口不能实测编辑器 temp DOM，所以不记作原站浏览器验收。

本地纯 model 将 nominal node 尺寸、source/target 端点和 SVG path 分开返回，view 保留同一 tiny CSS。origin 一侧继续采用目前 Canvas 的节点边界协议，未冒充已经回归原站全部真实 DOM handle 包络。未来若更改普通 handle 的实际边界，需要一起核对 temp 边与所有普通边的测量规则。

## 短按 handle 与两个独立位置

同 controller 的 `HANDLE_CLICK_EVENT` 分支不创建 temp node/edge。它只计算未来新增节点的位置：

- 输出：`x=origin.position.x+measuredWidth+100`。
- 输入：`x=origin.position.x−350−100`。
- 两方向：`y=origin.position.y+(measuredHeight−350)/2`。
- measured 缺失回退 node.width/height，再回退 source 350。

之后 `em(m)` 保存上述未来节点 flow 位置，但 `eu({x:clientX,y:clientY})` 保存的是点击 handle 的实际屏幕位置。两者用途不同：菜单并不移动到未来节点的左上角，也不会因为最终选择不同类型而重算 source 空节点尺寸。

本地新增纯函数 `canvasSourceConnectedCreationPosition` 表达 source 的 350/100 定位规则，并扩展使用本地 `canvasWorldNodes` 支持组内相对位置。现有本地真实新节点仍为对应视图的 220/230 等高度，本批不改普通节点尺寸；组内世界坐标解析是本地存储协议适配，不能把原分支直接访问 `node.position` 当作已实测的原站组内行为。

尺寸读取允许显式注入纯 `getNodeSize(node)` 协议：ghost 的 options 字段与创建定位的第 4 参数 `{getNodeSize}` 共用该协议，默认继续保留 source 的 measured→stored→350。local caller 必须注入 `groups.canvasNodeSize`，因为当前 CanvasNode、普通边和 normalize 协议优先使用 `node.width/height`；已有代表性快照可能同时带不一致的 measured。不能让 ghost 按旧 measured 偏离实际 local 卡片，也不能为了适配 local 而把 source 默认读取顺序的证据改写。注入仅改变当前 origin 的尺寸，目标空节点 350 和间距 100 仍固定。新增回归同时覆盖两方向、group 世界坐标与损坏 adapter 不造默认尺寸。

## 菜单跟随画布而不是鼠标

wrapper `M` 将 `el` 传给 `useCanvasAnchoredScreenPosition(position,!pinToSidebar)`。module 734301 首次 mount 时对这个屏幕位置调用 `screenToFlowPosition` 并以 useState 保留 flow anchor，订阅 transform 和 resize，再使用 `flowToScreenPosition` 返回当前屏幕位置。它不持续跟随 pointermove，也不重新从未来节点 `ep` 定位菜单。

普通连接菜单以 anchor 为左上角，再按 viewport 边缘 8px clamp。原站并非只在创建时 clamp 一次；transform 改变后 wrapper layout effect 会再次做边界校正。`pinToSidebar` 分支才使用居中横向位置与 above/below 的 ±8 间距，并关闭 flow anchor 转换。

本地建议保持 menu request 对象身份，分开保留未来创建位置、菜单 world anchor与临时 endpoint。每次视口变化只将 menu world anchor投影为独立 screenPosition prop，让 view 重新布局，不重新挂载、聚焦菜单或重开 script 子菜单。

## 完成、关闭与持久化边界

选类型时 `eM` 先重新核对 readonly、源节点锁和限制体验；成功路径调用 `takeSnapshot()`，删除 temp edge/node，在 `ep` 位置创建真实节点，再按输入/输出方向新增真实边，选择新节点并清菜单、connection 与编辑锁。IMAGE origin→TEXT 的原默认 prompt 继续由既有菜单 controller 维护。此临时模块不另写资格/模型切换或真实节点提交逻辑。

`eG` 关闭路径删除 temp 两对象，清 menu/position/connection、恢复 above、释放编辑锁。独立 close event 和 Escape 复用该路径。当前源分支未确认强制 blur/hidden 关闭菜单；若本地按文档生命周期采用这些取消条件，应记录为本地适配。

原 source 使用特殊 temp ID，并在同步、重放读取与选择引用等分支过滤。例如 `0leiedr1esdbe.js` addNode offset 96478 不广播 temporary，module577236 统一识别；`1bflqug4ccoei.js` offset 71927 排除 temp node/edge 的记录；`21_0xvlvkw1sz.js` 的 `hw/hS` 排除 temporary，selection-single 也忽略它。不能把 temp 变成正常项目、资产、聊天引用或永久画布内容。

本地采用纯投影而不插入 graph，是对本地持久化架构的适配：真实 nodes/edges、选择、历史、autosave 和 getSnapshot 保持持久图，owner menu 关闭/类型提交后投影消失。controller 的失败保留请求语义不能被只读 view 改写。尚需 root 集成并验证实际 NodeCanvas 的释放→菜单→创建/取消→一次撤销/刷新，以及 A→B→A、readonly、tool、blur/hidden 和迟到回调的 owner 隔离。

## 本次实现与独立验证

- `domain/connection-ghost-model.js`：纯投影、源短按定位、源 Bezier，按文档/readiness/readonly/有效坐标核对 owner；图和 request 均不修改。
- `components/CanvasConnectionGhost.jsx`：HTML tiny 端点与 SVG 临时 edge 分开导出；无 data-node-id、tabIndex、交互控件、事件 writer、timer 或监听器。
- `components/canvas-connection-ghost.css`：tiny border-box、clipped 两 handle 和 pointer-events none；edge 规则覆盖既有宽泛可点击 path。
- 2026-10-11 17:26:51 本地 Vitest：2 文件、40 测试通过，包含 source/target/reference 方向、group 世界坐标、精确 0/负坐标、源 350 定位、短按无 temp、owner关闭/删除/readonly/未ready/非法坐标、CSS尺寸与无可交互入口。单独 ESLint 和 Prettier 同时通过。
- 2026-10-11 17:31:44 接入可注入尺寸协议后重新验证：2 文件、47 测试通过；新增 mismatch measured/stored、source 默认未改、本地 renderer 注入的两方向与 group 定位、无效 adapter 拒绝分支。修改后的两个 domain 文件 ESLint/Prettier 通过；组件与 CSS 未再变更。

上述为纯模型与只读 view 的独立验证，不等于已经核实整站交互或真实服务。实际浏览器集成结果由本批 root 验证记录补充。未加入账号、团队锁、生成、费用和写服务；没有真实 collaborator 状态时，不展示虚假的持锁/解锁。


## Root 集成更新（2026-10-11）

实际Viewport已注入canvasNodeSize，渲染SVG临时edge和world层tiny node；创建短按坐标亦用相同尺寸协议。Menu的anchorPoint与blank point/future creation分离。真实NodeCanvas联合10项、全工程217文件/1579项以及原生desktop/390px创建、取消、一次撤销、滚轮追随和GPU辅助证据见 [节点反馈主审计](./canvas-node-feedback-functional-audit.md)。ghost仍为纯投影，不修改source生产逻辑或引入原遥测。
