# Canvas 连线命中区域与原站边交互审计

日期：2026-10-14。本轮只读调研，为后续节点交互优化准备证据；**没有实现本轮功能**，没有改生产源码或测试，也没有运行浏览器、网络、原脚本、测试、check 或构建。只新增本文与 [source proof](../artifacts/canvas-edge-hit-source-proof.json)。正式检查由 Root 继续管理，本文不宣称其结果。

proof 保存 **8 个原文件、37 条原片段**，另有检查时 **6 个本机文件、10 条本机片段**；实际计算全部文件／片段 SHA、UTF-16／Unicode code point／UTF-8 半开坐标并核对三套原文切片。本机记录是读取时快照，不是最终构建冻结。发现入口先使用 `rg -l interactionWidth|react-flow__edge-interaction`，只命中 `1kb-4b4zv9_2a.js` 与 `255axd08169oj.css`，随后继续核对实际 LibTV 自定义 edgeTypes，不以库默认值代替业务调用证据。

## 结论

当前本机 SVG 连线把 **2 world units 的视觉路径同时作为点击路径**；原站实际默认 renderer 有独立的 **20 world units 透明命中路径**，视觉路径保持 2／3／4 且不接收 pointer。静态证据证实本机少了这层命中区域，通常命中宽度相差十倍。

20 是 world 宽度，随整个 viewport 缩放；原站相关 renderer 没有给它加 inverse zoom 或 non-scaling stroke。因此 10% 时由源码几何推导为 2 screen px，不能称原站有固定 20 screen px 的命中区。若后续增加低缩放最小 screen 命中宽度，应明确为用户授权的本机交互调优，保留原站 20 world 基线与视觉线条。

原站的实际删除入口是 **悬停一秒后出现剪刀、点击剪刀断线**，普通点击先选择 edge。当前本机直接双击路径删除不是这个完整交互；增加透明路径只修复命中缺口，不代表已复刻选择、hover、剪刀、键盘或全部模式。

## 原片段定位

下表为 UTF-16 code units 半开范围；其它坐标、全文及 SHA 在 proof。

| 原文件                              | 范围                                                 | proof ID／用途                                                              |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- |
| `research/source/1kb-4b4zv9_2a.js`  | `[40395, 40971)`                                     | `rf-base-path-helper-default-width`：通用底层 eX 的默认 interactionWidth 20 |
| 同上                                | `[50734, 52078)`                                     | `rf-custom-render-layer-dispatch`：实际 custom renderLayer 分发             |
| 同上                                | `[52130, 52610)`、`[56712, 57529)`                   | viewport scale wrapper，以及 edge 确实位于其中                              |
| `research/source/255axd08169oj.css` | `[4490, 4955)`                                       | edge visibleStroke／inactive pointer gate                                   |
| `research/source/10v03g6udfcrl.js`  | `[27020, 32199)`                                     | 完整交互 q：20 命中、hover 计时、48 剪刀与删除 callback                     |
| 同上                                | `[32199, 32626)`                                     | U SelfVirtualizingEdge：不可见端点的无交互回退                              |
| 同上                                | `[32776, 34871)`                                     | Y 实际 shared layer renderer：独立 hit／visual path                         |
| 同上                                | `[35182, 36327)`、`[36327, 39622)`                   | edgeTypes default、事件与 model 计划                                        |
| 同上                                | `[40414, 41624)`                                     | shared SVG 的平移与键盘协议                                                 |
| `research/source/21_0xvlvkw1sz.js`  | `[108873, 108887)`、`[963386, 964871)`               | r1＝module 605784，实际 ReactFlow 调用使用 r1.edgeTypes                     |
| 同上                                | `[959129, 959207)`、`[960065, 960655)`               | defaultEdgeOptions 视觉样式与真实 deleteEdgeById provider                   |
| `research/source/0arvpunlk99j2.css` | `[2031, 2389)`、`[3489, 3730)`                       | 手型／mark 对 edge 及所有子元素关闭 pointer                                 |
| 同上                                | `[11189, 11315)`                                     | readonly-mode 这条 CSS 只禁 handle，不能据此推断所有 edge 都禁 pointer      |
| `research/source/16b_iv9sex3zl.js`  | `[11316, 11387)`、`[12679, 12750)`、`[30491, 31000)` | share／只读 preview 同 renderer，但 edge 强制 deletable false               |
| `research/source/16k_l1hir0zic.js`  | `[4960, 5030)`、`[15706, 16195)`                     | workspace preview 同样 selectable true、deletable false                     |

归档中的通用底层函数名是 `eX`；相关文件没有字面量 `BaseEdge` 导出名。可以把它理解为库的 base-path helper，但不将未出现的标识符写成直接源码证据。实际 LibTV 默认边由 module **605784** 的 U／q 和 default.renderLayer／Y 实现，不只是使用这个通用 helper。

## 1. 通用库默认值与实际业务命中层

库 eX 解构 `interactionWidth = 20`，先输出视觉 `react-flow__edge-path`，再在 width truthy 时输出同 d、fill none、strokeOpacity 0、strokeWidth 为该值的 `react-flow__edge-interaction`。显式 0 会省略库 hit path。内置 Bezier wrapper 透传 edge 的 interactionWidth，native wrapper 从合并后的 edge props 传递它。

但实际 LibTV 的 default renderer **显式写透明 strokeWidth 20**，不读取该 interactionWidth 设置。U 在任一端点可见时进入 q；两端都不在可见节点集合时仅输出视觉线，pointerEvents none。库检测没有 reconnect callbacks 时使用 default.renderLayer，实际 Canvas 没有传这些 callbacks，因此普通 default 边走 custom shared layer。非 default type 或带 function-valued domAttributes 的边回 native wrapper。

shared model 合并 defaultEdgeOptions 与 edge，自身 hidden、端点缺失或无几何的边不进入可绘制模型。`interactive = source.visible || target.visible`，不是“线段恰好经过 viewport 就可交互”。Y 在 interactive 时输出透明 20 宽 path；随后视觉 path 始终 pointerEvents none，普通宽 2，选中宽 3，hover 宽 4，REFERENCE 来源还有虚线。流光装饰也 pointerEvents none，不增大命中面。

原库 CSS 的 svg 父层 pointer-events none，edge group 为 visibleStroke，inactive edge 为 none。透明 stroke 的透明度不会被当作“没有 stroke 几何”。本机以后需要给 hit 和 visual 各自明确样式及门控，不能同时让视觉路径继续拦截。

## 2. 缩放与剪刀尺寸

原 GraphView 把 edge renderer 放在 ts viewport 内；ts 对整个子树应用 `translate(x,y) scale(z)`。自定义 shared SVG 只平移大坐标 origin，没有 inverse scale；q 的 nearest-path helper 将屏幕鼠标坐标反变换回 world，这只用于定位剪刀，不补偿命中宽度。

相关自定义 JS、库 JS、基础／模式／交互 CSS 中没有 vectorEffect、vector-effect 或 non-scaling-stroke。其它归档 SVG 有这些字段，不能跨资产迁移为 edge 规则。q 的 foreignObject 和内层 div 均 48×48，剪刀图标 28；其中没有 inverse zoom，scissors-enter／exit 只是显隐动画。

以下是这些源码属性和 ancestor scale 的**静态推导，不是真机或原站浏览器测量**；10% 仅代入 z＝0.1，也没有由本轮核实该原站路由的最小可选缩放：

| viewport z | 原 hit 20 的 screen 宽 | 普通视觉 2 的 screen 宽／当前本机 hit | 原剪刀容器 48 的 screen 尺寸 |
| ---------- | ---------------------- | ------------------------------------- | ---------------------------- |
| 1          | 20 px                  | 2 px                                  | 48 px                        |
| 0.5        | 10 px                  | 1 px                                  | 24 px                        |
| 0.1        | 2 px                   | 0.2 px                                | 4.8 px                       |

这支持“当前本机低缩放容易漏点”的原因判断，但不宣称原站 10% 也已经实际验过，或原站有固定 screen 像素的触控目标。

## 3. 点击、悬停、剪刀与删除 callback

单击原边按真实 edge ID 选择。普通单击清其它 edge 和 node 的选中；Meta／Ctrl 切换当前 edge。shared layer click 停止冒泡，mark 模式不执行 edge 选择。focusable 允许 Tab 到 edge group；Enter／Space 选择，Escape 取消并 blur，尊重 keyboard-a11y disabled、mark 与 selectable。本文不声称已经复刻全部 edge 键盘删除规则。

hover q 需非 mark 且 selectable；deletable 为 true 才开始 1000ms 剪刀计时。鼠标在路径附近移动时由 owned RAF 计算最近路径点，使用 81 点粗采样和 11 点细采样；不足 10 world 位移不重复计算。离开先等待 120ms，再对已经出现的剪刀播放 150ms 退出动画；重新进入清旧计时器。卸载清 timeout、RAF 与监听。window blur 清 shared hover 实例。

剪刀按钮位于最近点中心 ±24，点击 stopPropagation，非 mark 且 deletable 才调 `CanvasCallbacks.deleteEdgeById(id)`。实际 CanvasProvider 绑定为 cc，cc 是 edge handler 的 deleteEdgeById，最终产生 `{type:'remove',id}`。本轮没有重新执行该删除流程；分镜 unlink、clip 分支及历史证据继续以各自 source 审计为准。

主 Canvas 的 ReactFlow props 没有提供 onEdgeDoubleClick 删除 callback。wrapper 具备转发双击 callback 的通用分支，不表示这个实际 caller 已连接双击删除。不能用“库能接受 onDoubleClick”证明本机直接双击删除就是原站入口。

## 4. 模式、只读与 pointer 门控

手型由 stored canvasToolMode 与 held Space 计算 effective hand，实际挂 `hand-tool-mode`；源 CSS 对 edge layer、edge group 和所有子元素统一 `pointer-events:none!important`，让鼠标落到 pane 平移。mark、capture、publish protection 也包含 edge 及其后代。正在 canvas-interacting 时 edge group 被禁 pointer。edge 被隐藏时，实际列表保留选中 node 关联的边，否则为空；不是只把视觉透明后还留下全库 hit targets。

只读要区分 caller：share／workspace preview 用同 edgeTypes，仍 elementsSelectable true、允许选择；它们 defaultEdgeOptions.deletable false，share 还将实际 edge.deletable 强制 false，键盘 deleteKeyCode null。因此透明路径可继续用于选择，但不提供剪刀删除。主 Canvas `readonly-mode` 在已核 CSS 中只禁 handle，不能把这个 class 本身写成“全部边 pointer off”。q 本身按 selectable／deletable／mark 门控，没有直接读取 isReadonly；真实权限策略仍由 caller／store 承担。本机不得因此放开只读写入。

## 5. 本机缺口与后续建议

检查时本机 [CanvasViewport.jsx](../src/features/canvas/components/CanvasViewport.jsx) 的 `.cv-world` 也整体 scale。每条真实 edge 只输出一条 `.nopan` path；[canvas.css](../src/features/canvas/canvas.css) 对 `.cv-edges path` 设置 stroke-width 2、pointer-events stroke。readonly 的同类 selector 将所有 path 改成 2.5。这使本机点击宽度等于细视觉线，并且未来仅加 SVG `strokeWidth={20}` **仍会被现有 CSS stroke-width 2 覆盖**。新 hit class 要独立维护透明 stroke、宽度与 pointer，旧通用视觉／readonly selector 要只作用视觉线。

目前 dblclick stopPropagation／preventDefault 后，只有 readonly 与 reference／mark／focus 受 guard；hand 不在 interactionMode。手型 CSS 只改 cursor 与隐藏 handle，没有禁 edge 后代。Canvas pointer 和 touch profile 都把 `.nopan` 视为 isolated；实际 begin 在计算 hand／Space／middle-button pan 之前就 return。这在静态控制流上说明线附近可能阻断手型平移，而双击仍可能触发删除；本轮没有浏览器重现，不把这项推断称 native 已确认。

mark CSS 当前只对 `.cv-edges` 祖先设 pointer none，子 path 另有显式 pointer-events stroke。新增 hit 后不能靠祖先继承保证禁用，需给全部交互后代统一 gate。虽然当前 dblclick 的 interactionMode guard 会阻断 mark／focus／reference 写入，pointer 捕获与 pane 行为仍须分别验收。

后续可先把真实 edge 视图拆为独立组件，输出同 geometry 的透明 20 world hit path 和细视觉 path；保持 source curve 及 graph unchanged，hit 确认动作调用现有 owner／CAS／unlink pipeline。preview／ghost／dangling edge 不建真实 hit target。手型／Space／已挂起弹窗等模式禁用 hit，并保留背景平移；只读维持选择／定位能力边界，写动作继续明确 gate。

随后复刻真实 edge 选择、hover／剪刀、计时取消、最近点定位、键盘焦点与 source inactive 行为，而不是把双击作为唯一删除入口。本机决定增加低缩放 screen hit 下限时，单独记录原 20 world 基线和本机调整；不可把 `20 / zoom` 或 non-scaling stroke 宣称原站数值。维护性状态应由 view／controller 持有，不让 hover 或 hit 宽度改写内容、视口或产生历史。

验收至少应通过实际指针在 100%／50%／低缩放路径侧边命中，确认视觉宽度不变、命中区不画出来、不误触邻线／node；手型与 Space 从线附近平移、readonly／嵌套弹窗无写入；pointer capture／click 不清空输入，剪刀出现／退出／卸载无迟到动作；普通／分镜确认、取消、撤销重做、刷新恢复仍走同一事务。DOM 人工 fireEvent 命中任意 path 不足以证明几何 hit testing；后续需浏览器实际指针。当前批次保持未实现、未测试，复刻总目标继续进行。
