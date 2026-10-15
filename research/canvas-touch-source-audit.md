# Canvas 触摸、平移与双指缩放源码审计

2026-10-11。本批只读检查已归档公开客户端代码，未执行原站 bundle、未登录、未使用账号资源。结论是源代码协议，不是原站真机浏览器验收。PenStudio 的桌面节点优化见 [节点操作审计](./canvas-node-interaction-functional-audit.md)。

## 证据索引

原始文件大多只有一行，以下 offset 是 Python 字符串中从 0 开始的字符位置，便于避免把整条 minified 行输出。`artifacts/script-workflow-source.pretty.js` 是已有格式化研究材料，不进入生产应用。

| 证据                                         | 位置                                                | 内容                                                                 |
| -------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `research/source/3u6hjewm8qox_.js`           | module 487007，offset 1684147                       | `useTouchMode` 与 `useDoubleTapFitView`                              |
| `artifacts/script-workflow-source.pretty.js` | 80547–80593 行                                      | 上述模块的可读版本                                                   |
| `research/source/21_0xvlvkw1sz.js`           | offset 754481 附近                                  | 普通 Canvas 调用 `useTouchMode`，将返回 props 保存为 `ok`            |
| 同文件                                       | offset 725362 附近                                  | `ak=canvasLocked`；同段包含发布保护与图片裁剪状态                    |
| 同文件                                       | offset 963376–964908                                | 普通 Canvas 最终 ReactFlow props 顺序和缩放配置                      |
| 同文件                                       | offset 961103 附近                                  | 手型模式 `cP` 的覆盖规则                                             |
| `research/source/222qgzyc0yyf3.js`           | module 961258，offset 1887                          | `CANVAS_ZOOM={min:.1,max:8,default:1}`                               |
| `research/source/1kb-4b4zv9_2a.js`           | offset 114195–119750                                | XYPanZoom 创建、更新、过滤与 scale extent                            |
| 同文件                                       | offset 32909、34444 附近                            | node draggable/selectable/connectable 规则与可拖节点的 `nopan` class |
| 同文件                                       | offset 109468 附近                                  | 节点拖动在多指触摸出现后停止继续写入                                 |
| `research/source/04a7ozdczh49y.js`           | module 953752，offset 41665；触摸逻辑约 46680–48340 | D3 Zoom 的单指/双指计算、抬指重基线与触摸结束                        |
| `research/source/16b_iv9sex3zl.js`           | offset 30825 附近                                   | `/canvas/share` 显式只读交互配置                                     |

## 设备判断及最终覆盖

`useTouchMode` 的初值为 `false`，首次 effect 读取 `window.matchMedia('(pointer: coarse) and (hover: none)').matches`。这是主指针及 hover 能力的组合，不是屏幕宽度判断，也不是 `navigator.maxTouchPoints`。原 hook 没有订阅媒体查询的 `change`，所以拔插鼠标或设备能力改变不会通过这个 hook 实时更新。

触摸模式返回 `{panOnDrag:true,nodesDraggable:false,nodesConnectable:false}`。但是普通 Canvas 最终 props 的顺序必须整体读取：

```js
panOnDrag: cA,
panOnScroll: !ak,
zoomOnScroll: !ak,
zoomOnPinch: !ak,
zoomOnDoubleClick: false,
// ...普通节点与连接回调...
...ok,
nodesDraggable: !ak && !aF,
nodesConnectable: !ak && !aF,
elementsSelectable: !ak && !aF && !aE,
...nZ, // 标记模式
...cP, // 手型模式
...n2, // 聚焦模式
...oh, // 引用选择模式
...oC, // 截图模式
...cL, // 课程跟练模式
```

因此普通 unlocked、非发布保护 Canvas 的触屏节点依然可以拖动和连接；`ok` 的两个 false 被后续显式值覆盖。不能照抄 hook 的独立返回值而把触屏节点编辑整体禁掉。普通桌面 `cA=!ak&&[1]` 只允许中键按住平移；粗指针的主要效果是把 `panOnDrag` 改为 `true`，允许空白板面一指平移。特殊模式仍以后续覆盖为准。

手型模式单独返回 `panOnDrag:!ak&&[0,1]`、节点拖动/连接/选择全部 false、删除键 null。截图模式也显式关闭拖动、选择和连接。`canvasLocked` 控制普通 pinch/scroll 开关，但 `ok` 的 `panOnDrag:true` 位于普通 pan 配置之后；这是源配置的实际覆盖顺序，不能将推测的“锁定应当禁止一切”当作源码事实。

`/canvas/share` 使用独立 renderer，显式 `nodesDraggable:false`、`nodesConnectable:false`、`elementsSelectable:true`、`panOnDrag:true`、`panOnScroll:true`、`zoomOnPinch:true`、`zoomOnDoubleClick:false`、`selectNodesOnDrag:false`，删除/框选/多选键均 null。只读节点仍可选择和预览；只读不是全部 pointer-events 禁用。

## UI 区域和节点事件所有权

XYPanZoom 使用 `event.target.closest('.<class>')` 检查目标祖先：

- `nopan` 阻止非 wheel 的板面平移入口；wheel 且开启 panOnScroll、没有 zoom 激活键时也受到相应门控。
- `nowheel` 阻止 wheel 入口；Ctrl wheel 在此区域会 preventDefault 以避免浏览器页面缩放，但不进行画布缩放。
- `nodrag` 是节点 XYDrag 的过滤条件；自定义 `dragHandle` 存在时必须匹配指定句柄。
- 正在框选或连接会阻止非 wheel 的 pan/zoom 入口；中键按下在节点、边及选择层有明确放行分支。

ReactFlow 为可拖动节点的外层添加 `nopan`。因此触屏开启 pane pan 并不让普通节点的一指拖动变成移动画布。节点里的工具栏、提示词编辑、媒体控制等使用 `nodrag nopan nowheel` 或对应子集；例如公开 workflow 的图像编辑工具栏即三者齐全，图片交互区域使用 `nodrag nopan`，全景交互额外启用 `nowheel`/`touchAction:none`。应以实际控件区域门控，不使用“触屏上一律阻止 input”或“所有节点都拿走事件”的统一替代。

节点 XYDrag 在 touchmove 时如果 `touches.length>1`，将该次拖动标记停止；不再用多指中的首指位置继续移动节点。已有拖动状态在结束时清理。源 pane 的 D3 filter 仍然受目标 `nopan` 约束，因此能否从两指均落在可拖节点上启动 pinch 不能从 `zoomOnPinch:true` 直接推导为肯定；该细节需要原站真机行为验收。PenStudio 若允许从节点非 UI 区接管 pinch，应记录为手感适配，并保持节点与板面只有一个活动写入者。

## 缩放范围、锚点及抬指

Canvas 的缩放范围是 **0.1–8**，默认 **1**。不能使用 ReactFlow 库默认的 0.5–2；原 Canvas 显式传入自己的常量。XYPanZoom 调用 D3 的 `scaleExtent([minZoom,maxZoom])`，pane extent 来自当前 bounding rectangle，并通过 ResizeObserver 更新。

D3 在每指 touchstart 保存三项：pane-local 屏幕位置 `P`、以当时 viewport 求逆得到的世界位置 `Q`、触摸 identifier。只有前两指进入此手势记录，后续指不取代它们。第二指加入时沿用第一指已保存的世界锚点，并为第二指求逆；移动时按 identifier 更新屏幕位置。

双指计算等价于：

```js
zoom = clamp(distance(P0, P1) / distance(Q0, Q1), 0.1, 8);
screenMid = midpoint(P0, P1);
worldMid = midpoint(Q0, Q1);
x = screenMid.x - worldMid.x * zoom;
y = screenMid.y - worldMid.y * zoom;
```

所以双指间距变化与中点移动同时产生缩放和平移。固定旧 viewport 的中心只改 zoom、或者缩放时不根据当前双指中点补偿 x/y，都会偏离此源协议。单指沿用当前 zoom，令该指世界锚点始终对应其当前屏幕位置。

某一指 touchend 后，若第二指仍在，源码先将其提升为第一指；随后用**当前 viewport**重新计算剩余指的 world anchor。接下来一指移动延续 pan，不应跳回旧双指开始坐标。所有指结束则结束手势。touchcancel 共用 touchend 清理入口。D3 touchmove 执行 preventDefault 和 stopImmediatePropagation，touchstart/end 执行 stopImmediatePropagation；不要只靠 React `stopPropagation` 假定移动端浏览器已取消默认页面手势。

源公式在 world distance 为零时没有专门可读的防 NaN/Infinity 分支；本机实现必须避免零距离及非有限值写入 view。此项属于稳定性适配，应单独测试。

## 双击 fit

`useDoubleTapFitView` 仅在 `isTouchDevice=true` 时给**第一个** `.react-flow__pane` 加非 passive 的原生 touchend listener，并在 cleanup 移除。每次 touches 必须为 0；两个结束事件间隔 `0<dt<300ms` 则 preventDefault，调用 `fitView({padding:.15,duration:300})`，并将时间标记归零。

源 hook 没有记录 tap 位移、目标、pointer identifier 或 pinch 是否刚结束，所以仅凭源码不能声称它只响应空白的两次轻点；这也是本机可以明确修正的体验风险。D3 自带的双击 zoom 已由 Canvas `zoomOnDoubleClick:false` 移除，不应同时接两套双击缩放。带位移门槛、排除 pinch/输入控件、限定空白 pane 的双击 fit 属于用户要求优化后的适配，不应冒称源 hook 原本具有这些 guard。

## 对本机接线的可执行协议

1. 用独立 touch lifecycle 管理触摸点及 world anchors；不将每指移动都当成节点拖动，也不创建第二份节点 store/history。
2. 一指从空白 board 开始时 pan；普通可写节点的一指继续由现有节点 pointer controller 选择/拖动。手型或只读节点非 UI 区可以 pan。输入、媒体、工具栏及滚动容器优先保留自己的手势。
3. 合法第二指进入时停止原节点 pointer writer，再以当前 view 建立双指锚点；按上述中点/距离协议计算 viewport，范围共用 0.1–8。不能同时继续写节点 position。
4. 抬到一指时按当前 view 重置 anchor，取消/pointercancel/lostcapture/blur、切文档/ready/只读状态变化时终止旧 owner 手势，不让迟到事件写入新项目。
5. 若订阅 matchMedia change，明确这是本机设备切换优化。真正的 touch pointer 和主指针能力判断要分开：窄窗口本身不意味着触摸，带触屏的鼠标设备也不能仅因 coarse=false 完全失去 pinch 能力。
6. 用测试覆盖中点平移、缩放限幅、剩余一指续接、第三指、零距离、文档切换、输入门控、pinch 与 node drag 互斥，以及抑制手势结束后的合成 click。真机 Safari/Chrome 验收另记录，不能用合成事件或 390px 布局检查代替。

## 本机实现及验证范围

本批新增 `domain/touch-view-model.js` 与 `hooks/useCanvasTouch.js`，并给现有 `useCanvasPointer` 提供稳定 `cancel` 和 touch arbitration。纯模型导出统一 0.1–8 范围；native TouchEvents 管理单指 pane pan、双指中点/世界锚点 pinch、抬指重基线与独立手势 click 抑制。可写节点的一指继续由 pointer controller 写节点及一次历史；第二指接管前取消 node writer、释放其 pointer capture，并用当前 frame 给两指重设锚点，避免“已拖节点后突然开始缩放”跳变。只读/手型节点非 UI 表面允许一指 pan。

设备媒体查询订阅 `change`、节点非 UI 的双指接管、零距离防护、同一空白目标且小于4px位移才识别双击 fit 均是本机体验/稳定性适配；原站对应边界以上文源码为准。真实 touch pointer 可以处理，即使主设备 coarse=false；仅调整窄窗口大小不会启用粗指针模式。原生输入/媒体/工具栏/`nopan`/`nowheel` 与实际 scrollable 元素的触摸不 preventDefault；板面的全局 touch-action 由 root 接线统一处理。

定向测试包含 pure model、native touch hook 和 pointer hook；2026-10-11 16:09:00 **3个文件、66项测试通过**，同批六个实现/测试文件零警告 ESLint/architecture 边界通过。真实 pointer hook 联合验证：节点先拖10px并记录一次历史，第二指取消并释放 capture，迟到 pointermove 不再移动节点，随后两指得到1.6倍缩放且不新增节点历史。其中包含 fresh UI tap 不吞掉先前 gesture 的 click 抑制回归。

这些测试派发 TouchEvent 语义的 native DOM 事件，不是物理触摸屏/Safari/Chrome 手势验收。NodeCanvas/CanvasViewport 的接线、全站检查、实际移动设备行为由 root 后续验证记录证明；本审计不将原站或本机完整触摸目标标记完成。
