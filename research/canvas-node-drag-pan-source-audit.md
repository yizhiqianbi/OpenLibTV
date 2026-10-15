# Canvas 节点拖动与选择框自动平移源码审计

2026-10-11。仅静态读取已归档公开脚本；未运行原站 bundle、未登录、未使用账号或发送原站写入。此批拥有纯模型与测试，不修改 Pointer、Graph、Root 或维护总表；控制器接线和浏览器验收由对应 owner 记录。

## 证据位置

以下 offset 为原文件 UTF-8 解码后 Python 字符串的零基字符位置；文件为 minified，不能把这些位置当作行号。

| 文件                               | offset / 标识                     | 证据                                                                                         |
| ---------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `research/source/1kb-4b4zv9_2a.js` | 95265–95600，`F` / `Y` / `W`      | clamp、普通 XYDrag 两轴自动平移速度                                                          |
| 同文件                             | 58744–59260                       | `nodeDragThreshold:1`、`selectNodesOnDrag:true`、`autoPanOnNodeDrag:true`、`autoPanSpeed:15` |
| 同文件                             | 91683                             | `infiniteExtent=[[-Infinity,-Infinity],[Infinity,Infinity]]`                                 |
| 同文件                             | 98256，`ec` / `em`                | client / first-touch 坐标、board origin、当前 viewport 的 world cursor                       |
| 同文件                             | 103128，`panBy`                   | viewport delta 经 `setViewportConstrained`，返回是否实际变化                                 |
| 同文件                             | 106190–110080，`XYDrag`           | 普通节点 / 真实组 / 从节点发起多选的 start、RAF、位置更新和结束                              |
| 同文件                             | 114265–115450，`XYPanZoom`        | translate extent 与 D3 constrain                                                             |
| `research/source/04a7ozdczh49y.js` | 43620–44000，D3 `w`               | 有限 translate extent 的世界边界 / 视口居中约束                                              |
| `research/source/21_0xvlvkw1sz.js` | 183600–185000，`nV` / `n$` / `nq` | 虚拟选择框独立的时间驱动 pan 生命周期                                                        |
| 同文件                             | 293350–299500，`iF`               | 虚拟 frame 的 pan world compensation、移动投影与结束 flush                                   |
| 同文件                             | 694044，`ml`                      | assets panel 的准确命中范围                                                                  |
| 同文件                             | 753148–753780，`ox`               | 虚拟选择框移动资格与特殊模式                                                                 |
| 同文件                             | 913813–918100，`L` / `O`          | 普通节点和普通选择 Alt 复制后仍沿用 XYDrag                                                   |
| 同文件                             | 934045–936000                     | 普通 `overPanel` prop 与虚拟 `shouldSuppressAutoPan`                                         |
| 同文件                             | 961100–965300                     | ReactFlow 最终 props 覆盖顺序与虚拟 frame render gate                                        |
| `research/source/3u6hjewm8qox_.js` | module 487007，1684147            | `useTouchMode`                                                                               |
| `research/source/16k_l1hir0zic.js` | module 461501，约 3500–4170       | `useCanvasNodeDropToAssetsStore` / `overPanel` / reset                                       |

## 两套 pan 协议

不能把连接预览的 tuning 或虚拟 frame 的 tuning 统一套在普通节点上。入口决定协议，与是否按 Alt、是否复制边无关。

| 项目       | 普通节点、真实组、从节点发起的多选   | 虚拟选择框 `iF`                                               |
| ---------- | ------------------------------------ | ------------------------------------------------------------- |
| 实际控制器 | RF `XYDrag` / `W`                    | `nq` / `n$`                                                   |
| 边缘范围   | 40 screen px                         | 80 screen px                                                  |
| 速度       | 最大 15 screen px / RAF frame        | 最大 720 screen px / 秒                                       |
| 加速       | 穿入距离 clamp 到 `[1,40]` 后除以 40 | 穿入距离 clamp 到 `[0,80]` 后除以 80                          |
| 单步上限   | 每轴 15 px                           | dt 最大 50ms，因此每轴最多 36 px                              |
| 时间       | 不读取 elapsed / dt                  | 首帧 dt 为 0，以后 clamp 到 `[0,50ms]`                        |
| 在中间     | RAF 持续采样，直到 end / disable     | 本帧 velocity 为 0 就停止调度，下一 pointermove update 再唤醒 |

每轴独立计算；角落不做向量归一化。两者均先检查左 / 上边缘，再检查右 / 下边缘，因此极窄画布两区重叠时左 / 上分支优先。board 外仍按最大速度继续。边缘判断为严格 `<edge` 和 `>size-edge`；正常宽画布恰在内侧边界不平移。普通节点距边界仅 0.1px 时也有 0.375px/frame 最小速度；virtual 没有这一最低速度。

普通 source Canvas 没有覆盖 `autoPanSpeed`、`nodeDragThreshold` 或 `translateExtent`；因此这里采用其 RF 默认值，而非任意体验参数。source 从 start 捕获 board bounding rect，XYDrag pan 和 cursor 投影持续使用该 rect。virtual 的 `nq` 在每个 tick 重新获取 Canvas rect。

## 起拖、资格与结束

RF ordinary 在按下时只准备 drag map / cursor。默认 threshold 为严格大于 1px 才调用 `C` 建立实际拖动；`M` 的启动检查位于本次 threshold 检查之前，因此通常在跨 threshold 后的下一次 drag event 启动。threshold 为 0 时可在 start 建立实际拖动。首次 `M()` 立即计算并应用一步，然后安排 RAF，没有 virtual 的第一帧 dt=0。

`C` 还使用越 threshold 这一 event 的当前 world cursor 建立 `dragItem.distance`；这次普通源移动通常不会把 threshold 前的全部位移补到节点上。本机已有 4px 阈值继续保留，Pointer 在真正 `moving` 后启动 pan，并沿已有 pointerdown origin 完整投影位移。第一步是否立即启动由 controller 决定；这些时序是用户要求节点手感优化的本机适配，不能冒称 source 原本就是 4px、pointerdown origin 或在第一条越阈事件启动。

普通 source RF 的 `autoPanOnNodeDrag` 为 `!overPanel`。可拖节点的外层使用 `nopan`，内部 `nodrag` / `dragHandle` 决定是否进入节点拖动；纯模型不会绕过这些 UI 门控。真实组、从节点发起多选、成功 Alt live redirect 继续使用同一 XYDrag pan；没有额外 Alt 专属速度。复制失败回退及分组 drop 规则见其他审计，不由此模型扩展。

virtual frame 只在 `tY && visible && bounds && ox` 渲染。`ox` 同时排除 locked、readonly、publish protection、hand、mark、focus、reference pick 和 practice；source capture mode 还通过 ReactFlow props 禁用普通 node drag。ordinary props 的最终 `nodesDraggable` 是 `!ak&&!aF` 再受特殊模式覆盖，`autoPanOnNodeDrag` 本身没有 `!aj`。Alt / drop 回调另有 readonly guard，不能仅凭这两项 prop 宣称 source 一切普通 readonly pointer 行为都已验证。share renderer 明确禁用节点拖动，详见 [触摸审计](./canvas-touch-source-audit.md)。本机 Pointer 对 readonly / ready / 文档身份 / 当前节点存在的门控是当前应用的安全生命周期协议。

`useTouchMode` 的 `nodesDraggable:false` 在普通 Canvas 中被后续显式 writable props 覆盖，因此一指可写节点仍可用 XYDrag 与该 pan。XYDrag 遇到 `touchmove.touches.length>1` 将本次拖动标为停止，不再投影该 event；源代码不能证明它与 pane pinch 的所有真机接管情况。本机第二指取消 node writer、清理 RAF / capture，再交给独立 touch controller，继续沿用已验证生命周期，不以合成测试替代手机验收。

ordinary end 使用最新 nodeLookup / dragItems 的已投影位置，不重新计算 end event 的 cursor；virtual pointerup flush `I.current`，对应最后一次 move / pan 投影，也不重新读取 up 坐标。两者正常结束均终止 RAF。source XYDrag 的多指 / 节点消失 early return 与普通 end 清理不完全相同；本机应统一 end、cancel、失焦、隐藏、失去 capture、切文档、readiness 和 readonly cleanup，隔离迟到 tick。Pointer 若在 pointerup 投影其最后 client 坐标，属于明确本机最终落点适配。

## 资产面板抑制范围

`ml` 用 `document.elementsFromPoint(clientX,clientY)`，只有 hit 元素的 ancestor 命中 **`[data-workspace-asset-panel]`** 才将 `overPanel` 置 true；再读取 **`[data-materials-folder-id]`**，没有合法 folderId 仍为 overPanel。ordinary ReactFlow prop 与 virtual callback 都读取这个 store。这个条件不是任意 sidebar、Agent、settings、storyboard 或 modal；不能把不存在的 source panel 类推成全部叠层抑制。pointer capture 时也应按坐标命中而非依赖 pointerenter。

virtual suppress true 会 stop，下一次 move 才根据最新值重新 start；ordinary autoPan flag 关闭也会 stop 原循环。若本机保留 ordinary RAF 静默采样、在 panel 消失但 cursor 未动时恢复，属于明确生命周期 / 手感适配，不改上述纯速度规则。

## 坐标与约束

ordinary source 比较起拖 world cursor 与当前 world cursor：

```js
origin = (effectiveStartClient - capturedBoardOrigin - startViewportTranslation) / startZoom;
current = (client - capturedBoardOrigin - currentViewportTranslation) / currentZoom;
delta = current - origin;
```

pan tick 中 RF 先将内部 world cursor 减去 `requestedScreenPan/currentZoom`，再调用 panBy；成功变化才投影节点。这样固定鼠标仍能继续拖动画面里的节点。在默认无限 translate extent 与不变 zoom 下，等价于上述当前 viewport 公式；按当前 viewport 投影也能正确处理拖动期间的 zoom。给选择 roots 的原 parent-relative position 加 delta，不重复移动被已选祖先包含的孩子。

virtual source 使用不同公式，不能用 ordinary 的 world anchor 取代：

```js
panCompensation -= appliedScreenPan / zoomOfThatTick;
delta = (client - downClient) / currentZoom + panCompensation;
```

累积量是 world units；每次按该 tick zoom 转换旧 pan，不能在最终时刻把全部 screen pan 再除以新 zoom。virtual 原实现本身在 zoom 改变时与 ordinary formula 不同，本模型忠实保留这个差异。

ordinary `panBy` 经 XYPanZoom / D3 `constrain`，有限世界 extent 下会限边，视口大于 extent 时会居中；源 RF 内部 cursor 却先扣 requested delta，而非最终实际 constrained delta。当前 Canvas 未传有限 translate extent，默认为无限；virtual 的直接 `setViewport` 也不走这里的 constrained API。本批纯模型只实现当前 Canvas 的无限 translation，不擅自添加边界限制、minimap clamp 或 zoom 修改。未来若接有限 translate extent，需要独立核对 requested / actual delta、D3 居中与复制后位置，不应把本函数当通用 RF constrained pan 实现。source 的节点 extent / snap 在 XYDrag 另一层计算，本模型不宣称替代那些规则。

## 纯模型接口与本批验证

新实现 `src/features/canvas/domain/node-drag-pan-model.js` 无 React、DOM、timer、Graph 或 source-runtime 依赖：

- `canvasNodeDragPanStep({protocol:'node'|'selection',clientPoint:{x,y},boardRect:{left,top,width,height},view:{x,y,z},elapsedMs})` 返回 `{active,deltaScreen,nextView}`，无效数据返回 null。`active` 仅表示 cursor 位于会产生 pan 的边缘，不依赖 dt，因此 virtual 首帧 dt0 仍可安排下一帧。
- `canvasNodeDragPositionDelta({protocol,originClient,clientPoint,originView,view,originBoardRect,boardRect=originBoardRect,panCompensation={x:0,y:0}})` 返回 world delta 或 null。ordinary 默认使用 captured rect；caller 显式传 fresh rect 可处理本机布局变化，属于本机适配。virtual 只需要当前 zoom 与 cumulative pan，不读取 ordinary origin view / rect。
- `canvasNodeDragPanCompensation(compensation,deltaScreen,zoom)` 返回新的累计 world compensation 或 null，不修改输入。

纯函数只防止非有限数、未知协议、零 / 负 zoom、空 board 和除法溢出写入。Alt / readonly / touch / selection eligibility、RAF、suppress、记录一次历史、graph positions 和 drop 都由 controller 持有。模型不提供第二份 graph store。

2026-10-11 21:30:24 定向 Vitest：**1 文件、30 项通过**；同两实现 / 测试文件 ESLint 零警告通过，三个拥有文件 Prettier 检查通过。测试包含真实 screen↔world 保持 cursor 的多帧几何不变量、普通 frame speed 不受 elapsed / zoom 影响、virtual 首帧和 50ms 上限、角落、board 外、边界最低速度、两区重叠、变 zoom 的两种不同投影及非法数据；没有以复写实现的 mock source helper 代替几何验证。接线总测另记录。此记录不代表整个 Canvas / 原站交互、物理触摸或浏览器手感已验收。

## 附录：重叠标题命中与临时层级

本批结束后只读核对普通 drop 后的标题命中，不扩展 drop 算法。`3u6hjewm8qox_.js` 的浮动标题 `Z` 在 658000–662450：外置 `top:-28px`、height24、局部 z10，并由 ZoomFixedPanel 补偿缩放。组内未选节点给标题外层 `pointer-events-none`；但 661817 的可编辑 label span 显式 `pointer-events-auto`，因此只有空白 / icon 等继承 none 的区域可能穿透，不能把整个未选 child 标题描述为不可交互。

`1kb-4b4zv9_2a.js` 在 58939 默认 `elevateNodesOnSelect:true`，普通 Canvas 未覆盖。102091 的 `eL` 在 basic mode 取有效 `node.zIndex` 或 0，再给 selected 加1000；101892 的孩子继承规则准确为 `parentZ >= ownZ ? parentZ + 1 : ownZ`。34782 的 RF wrapper 使用 `style.zIndex = internals.z`。这属于临时显示层级，不要求普通 drop 修改文档 zIndex。该条件对整数与 `max(ownZ,parentZ+1)` 等价，但对 parent9.5 / child10 并不等价，后者会错误抬到10.5。

因此未选标题区域被重叠 body 命中可有正常 source 原因；选中后仍被较低普通 peer 遮住，则属于本机 selection stacking 缺口。Root 新增 `node-stacking-model` 的纯 Map，经 `CanvasViewport` 的 `[nodes,selected]` memo 注入 `CanvasNode` / `CanvasGroupNode` inline zIndex，保持稳定 key / DOM、原 nodes、history 与持久化边界。此处只读复核这三个组件的接线：Map 不随单纯 viewport pan 重算，selected 更新只改显示属性，不重挂载输入。缺 parent / cycle 的有限 fallback 属于本机损坏图防护，不是 source 父节点顺序规则；实际 Root 测试与原生命中证据由对应验收记录给出。

Root 按准确条件式补足 fractional / tie 后，2026-10-11 21:40:49 独立只读运行 stacking model 与实际 NodeCanvas node-drag integration：**2 文件、18 项通过**。其中验证选中 child 高于重叠 peer、textarea DOM 保留、不新增 history / 持久化 zIndex / selected，以及取消选择恢复层级；DOM 测试不是浏览器 `elementFromPoint` 原生命中验收。
