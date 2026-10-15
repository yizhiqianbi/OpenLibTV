# Canvas 边线几何、颜色与键盘补充证据

日期：2026-10-14。只读原归档，新增本文与 [source proof](../artifacts/canvas-edge-geometry-source-proof.json)。没有编辑生产源码／测试，没有运行源脚本、网络、浏览器、测试、check 或构建；不能把本次调研写成已实现或正式检查通过。

此前 [命中区域审计](./canvas-edge-hit-source-audit.md) 及其 37 条 source proof 已冻结，SHA 保持不变。本补充纠正主画布 shared renderer 的离开语义、补齐真实最小缩放、曲线数学、主题和删除键，既有文件不回写。

本 proof 记录 **8 个原文件、47 条原片段**。全文／片段 SHA 和 UTF-16、Unicode code point、UTF-8 三套半开坐标均重新计算并核对，failures 为空；没有本机生产源码快照。CSS selector 与变量分别摘录，themeScopes 同时保存完整所属规则边界与 SHA。

## 原曲线与端点合同

RF Position 原值为 left／top／right／bottom；getBezierPath 通用默认 source Bottom、target Top，curvature **0.25**。LibTV 的普通节点 decoder 实际指定 source Right、target Left，边使用 source／target handle ID；实际 renderer 调用 getBezierPath 只传四坐标和两侧，没有 curvature 覆写。不能把本机固定 180 world 弯距称为 source。

每一控制点按对应方向的端点距离 d 计算 offset：d≥0 时 d/2，d<0 时 25×curvature×sqrt(−d)。Left 减 x offset，Right 加 x offset，Top 减 y offset，Bottom 加 y offset；目标控制点把源目标输入反过来再算。实际 Right→Left 正向距离 dx 的两侧 offset 均 dx/2；逆向距离为 6.25×sqrt(−dx)。SVG d 是 M 与 C，label 位于 cubic t=0.5：0.125×source+0.375×control1+0.375×control2+0.125×target；返回的 label offsets 为其与 source 的绝对差。

RF getEdgePosition 验证 handleBounds 或已声明 handles 和节点宽度，严格连接模式分别查 source／target。指定 ID 找对应 handle，没有 ID 取第一项，缺任一项返回 null。handle anchor 使用 positionAbsolute+handle.x/y；Right 加 handle.width、y 加 height/2，Left 保持 x、y 加 height/2。实际 LibTV RF Handle width／height 均 0，Right/Left 在 node 右／左边、top50%，所以它们落在节点边界中点；80×80 子元素是独立连接磁吸目标，没有把端点向外推 80。此证据不确立所有节点统一尺寸，本机尺寸仍按已核的 canvasWorldNodes 合同取值。

最近点 helper 使用**路径弧长**：81 个 i/80×totalLength 粗采样，取最近粗点的前后一个区间，再做 11 个 j/10 细采样。距离用 squared Euclidean，更新比较为严格 <，相等保留先遇到的点。totalLength 必须 finite 且非负，采样点和鼠标 world 坐标须 finite；同 path 且鼠标距前次计算不足 10 world 可复用。不能用均匀 cubic t 替代弧长。Root 拟使用纯数学曲线加 native SVG arcLength adapter，不新增库；native 与 source path-properties 的逐数值一致性尚未证明，浏览器实际指针需要后验。

## 实际主 shared hover 与 paint

主 ReactFlow 未传 reconnect callbacks，因此使用 default.renderLayer。Y 在 hover 交互时才挂 q，传 interactionContainer；q 此时不绑定自身 standalone onMouseLeave。Y 的 mouseleave 和 window blur **立即清 hover pointer 并卸载 q**。q 的 120ms leave／150ms exit 是 standalone 分支，不能用于主 shared renderer；1000ms 后出现剪刀仍是 shared q 的真实规则。

shared paint 先判断 interactive 且 selected，使用 selected 色；其次 hovered 或 interactive 且 endpoint selected 使用 hover 色；否则 edge.style.stroke 优先、缺省 edge 色。hover 宽4，interactive selected 宽3，其余宽2；端点选中本身只变色／glow，不变成宽3或4。REFERENCE 的原枚举值为 **reference**，interactive 且源节点类型 REFERENCE 才用 dash6 4。透明命中宽20 world，visual pointer none；剪刀48×48 world，图标28，无逆缩放补偿。

| 所属 CSS selector | 普通 --canvas-edge | hover   | selected |
| ----------------- | ------------------ | ------- | -------- |
| :root             | #86909c            | #c0c8d0 | #e0e4e8  |
| .dark             | #86909c            | #c0c8d0 | #e0e4e8  |
| .canvas-light     | #c4c4c4            | #919191 | #525252  |

actual main 引用 module961258 的 CANVAS_ZOOM，原常量 min0.1／max8／default1。此前 hit 审计未核最小缩放的表述是当时范围，现在补充静态源码证明 10% 为可配置下限；仍未进行原站 native10% 指针测量。20 world hit／48 world 剪刀随 viewport scale，10% 处分别静态推导为2／4.8 screen px。

## 可见性、选择与删除键

主 caller 明确 **onlyRenderVisibleElements:true**。RF node renderer 使用 getNodesInside(...,partial=true)，把 viewport 反变换至 world；hidden 排除，尺寸 measured→width→initialWidth→0。overlap 用 ceil；除了 partial overlap>0，还保留未有 handleBounds、dragging 或 overlap≥area 的节点（零面积也有相应边界）。LibTV NodeShell mount/unmount 向 visible registry 登记；shared edge interactive 为 source 或 target 的 registry membership，而不是贝塞尔曲线经过 viewport 就可互动。模型还排除 edge.hidden、缺端点和无几何，两个端点均不登记时仍有普通视觉线，但不建交互层。

主 edgesHidden false 返回原 edges；true 先取实际 selected node IDs，没有选中节点返回空，有选中才保留 source 或 target 在其集合的边。这不能改成全部 display:none，也不能只处理选中 edge。

普通 edge click 清其它 edge 和所有 node 选择，Meta／Ctrl 切换该 edge 并保留节点。shared 键盘受 focusable、selectable、mark、disableKeyboardA11y 门控。Enter／Space 通过 RF addSelectedEdges：multiSelectionActive=true 追加选中，否则清其它 edge 与 node。Escape 调 unselectNodesAndEdges({edges:[edge]})；RF nodes 参数 omitted 会遍历全部 nodes，因此也清当前 selected nodes，再 blur。这是实读取值，不能误写为只取消一个 edge。

actual main hP=module468102，resolveCanvasReactFlowKeyboardProps 在非 lock／非 node fullscreen 返回 **[Backspace, Delete]**；locked 或 node fullscreen 返回 null。main deleteKeyCode 为 az?null:cD.deleteKeyCode，az 是 active simulated practice；最后 ...nZ,...cP,...n2,...oh,...oC,...cL 可以覆写，其中已核 hand cP 为 deleteKeyCode:null、elementsSelectable:false。此处仅查边线所需明确调用，不扩大所有 Canvas 键盘模式矩阵。

RF delete dispatcher 将 selected nodes、selected edges 交 deleteElements；input DOM（包括 modifier）被此监听排除，null key config 不挂监听。deleteElements 先 await getElementsToRemove／onBeforeDelete，deletable:false 被排除，删节点时联带 incident 可删 edges；准许后先发 edges remove，再 nodes remove。因此选中 edge 的 Delete 走现有 onBeforeDelete／edge remove pipeline，不是剪刀以外另造直接 setEdges。share／readonly 既有证据明确 deleteKeyCode:null 与 deletable:false，仍 selectable:true；只读选择和写门控应分开。

## 精确原片段

下面只列 UTF-16 半开范围；每条原文、另外两坐标和 SHA 见 proof，不输出整行 minified 文件。

| proof ID                                      | research/source 文件 | UTF-16 范围        |
| --------------------------------------------- | -------------------- | ------------------ |
| `rf-position-enum`                            | `1kb-4b4zv9_2a.js`   | `[92890, 92961)`   |
| `rf-bezier-center`                            | `1kb-4b4zv9_2a.js`   | `[99026, 99261)`   |
| `rf-bezier-control-offset`                    | `1kb-4b4zv9_2a.js`   | `[99261, 99314)`   |
| `rf-bezier-control-directions`                | `1kb-4b4zv9_2a.js`   | `[99314, 99508)`   |
| `rf-get-bezier-path-export`                   | `1kb-4b4zv9_2a.js`   | `[127294, 127700)` |
| `rf-handle-endpoint-helpers`                  | `1kb-4b4zv9_2a.js`   | `[99882, 100585)`  |
| `rf-get-edge-position-export`                 | `1kb-4b4zv9_2a.js`   | `[127823, 128445)` |
| `rf-rectangle-overlap-ceil`                   | `1kb-4b4zv9_2a.js`   | `[96294, 96414)`   |
| `rf-get-nodes-inside-export`                  | `1kb-4b4zv9_2a.js`   | `[129888, 130319)` |
| `rf-node-renderer-visible-node-selector`      | `1kb-4b4zv9_2a.js`   | `[36725, 37044)`   |
| `rf-keypress-subscriptions`                   | `1kb-4b4zv9_2a.js`   | `[6880, 8168)`     |
| `rf-selected-predicate`                       | `1kb-4b4zv9_2a.js`   | `[15779, 15799)`   |
| `rf-delete-key-selected-dispatcher`           | `1kb-4b4zv9_2a.js`   | `[31030, 31431)`   |
| `rf-delete-elements-controller`               | `1kb-4b4zv9_2a.js`   | `[13801, 14264)`   |
| `rf-elements-to-remove-gates`                 | `1kb-4b4zv9_2a.js`   | `[94661, 95261)`   |
| `rf-selected-edges-and-unselect`              | `1kb-4b4zv9_2a.js`   | `[63308, 63797)`   |
| `libtv-node-type-reference-enum`              | `170exq-5f14zz.js`   | `[112, 657)`       |
| `libtv-zoom-constants`                        | `222qgzyc0yyf3.js`   | `[1916, 1956)`     |
| `libtv-zero-size-handle-styles`               | `2yyck7brx0tqq.js`   | `[3173, 3767)`     |
| `libtv-ordinary-node-side-positions`          | `2yyck7brx0tqq.js`   | `[48078, 48140)`   |
| `libtv-ordinary-edge-handle-ids`              | `2yyck7brx0tqq.js`   | `[48811, 48951)`   |
| `libtv-node-mounted-visibility-effect`        | `2yyck7brx0tqq.js`   | `[12326, 12442)`   |
| `libtv-mounted-node-visibility-registry`      | `2yyck7brx0tqq.js`   | `[38792, 39684)`   |
| `libtv-react-flow-keyboard-defaults`          | `2yyck7brx0tqq.js`   | `[34910, 35150)`   |
| `libtv-main-keyboard-helper-import`           | `21_0xvlvkw1sz.js`   | `[708919, 708933)` |
| `libtv-main-keyboard-options`                 | `21_0xvlvkw1sz.js`   | `[961612, 961758)` |
| `libtv-main-practice-simulated-gate`          | `21_0xvlvkw1sz.js`   | `[725974, 726042)` |
| `libtv-main-hand-override-props`              | `21_0xvlvkw1sz.js`   | `[961119, 961256)` |
| `libtv-main-visible-selected-node-edges`      | `21_0xvlvkw1sz.js`   | `[723581, 723938)` |
| `libtv-edge-select-rule`                      | `10v03g6udfcrl.js`   | `[1582, 2027)`     |
| `libtv-hover-scissors-edge-complete`          | `10v03g6udfcrl.js`   | `[27020, 32199)`   |
| `rf-custom-render-layer-dispatch`             | `1kb-4b4zv9_2a.js`   | `[50734, 52078)`   |
| `libtv-theme-root-selector`                   | `1h-b10gcvw4vl.css`  | `[240628, 240634)` |
| `libtv-theme-root-edge-colors`                | `1h-b10gcvw4vl.css`  | `[244337, 244418)` |
| `libtv-theme-light-selector`                  | `1h-b10gcvw4vl.css`  | `[245713, 245727)` |
| `libtv-theme-light-edge-colors`               | `1h-b10gcvw4vl.css`  | `[245946, 246027)` |
| `libtv-theme-dark-selector`                   | `1h-b10gcvw4vl.css`  | `[249084, 249090)` |
| `libtv-theme-dark-edge-colors`                | `1h-b10gcvw4vl.css`  | `[252845, 252926)` |
| `libtv-shared-layer-edge-renderer`            | `10v03g6udfcrl.js`   | `[32776, 34871)`   |
| `libtv-shared-layer-event-protocol`           | `10v03g6udfcrl.js`   | `[35182, 36327)`   |
| `libtv-shared-layer-model-plan`               | `10v03g6udfcrl.js`   | `[36327, 39622)`   |
| `libtv-shared-layer-svg-keyboard`             | `10v03g6udfcrl.js`   | `[40414, 41624)`   |
| `libtv-reactflow-actual-props`                | `21_0xvlvkw1sz.js`   | `[963386, 964871)` |
| `libtv-share-reactflow-props`                 | `16b_iv9sex3zl.js`   | `[30491, 31000)`   |
| `libtv-share-edges-forced-nondeletable`       | `16b_iv9sex3zl.js`   | `[11316, 11387)`   |
| `libtv-share-default-edge-style-nondeletable` | `16b_iv9sex3zl.js`   | `[12679, 12750)`   |
| `libtv-edge-types-import-binding`             | `21_0xvlvkw1sz.js`   | `[108873, 108887)` |

## 后续核对边界

本轮 source 合同可用于前端本机复刻，不依赖真实生成、登录、账号或运营写服务。公开原归档只能证明所列 renderer／caller，不代表所有 route／native pointer 已验收。实现由 Root 管理；纯模型测试、DOM 测试和真实浏览器命中各有独立证据，不能互相代替。整个原站前端复刻目标仍未完成。
