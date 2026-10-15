# 生成器纵向 placement：独立坐标与生命周期复核

2026-10-13。本轮只读当前本地生产代码及已有测试，仅新增本文；不修改 src、CSS、阈值或既有测试，不运行全检，不操作浏览器。原站 placement 调研由另一个代理完成。下面明确区分可从当前接线证明的缺陷、实施建议与需要浏览器验证的风险；建议不冒充原站要求。

## 1. 已确认的问题

### P1：节点下方的生成器可完全或部分被画布裁掉

`useInlineGeneratorPlacement.js` 只测 board.width、只夹紧横向中心。Generic、ScriptV2 与 loading/error entry 都把 top 固定放在节点下方；`canvas.css` 的 `.cv-board` 为 overflow:clip，不能靠隐式 focus scroll 露出被裁掉的部分。inline frame 本身没有纵向 max-height 或整卡滚动兜底；现有 prompt 自己的滚动并不能使整张卡的 footer 或 expand button 越过 board 裁切边界。

可直接由当前公式证明：z=1、view.y=0、board.height=600，node top=280 / height=230，卡片 height=200。当前 top=526 / bottom=726，底部126px被裁；同样的卡片上放 top=64 可以完整显示。节点仍在画布中有可见内容，并不是只有已经移出屏幕的节点会出现问题。loading/error 最低高度80，重试按钮也没有独立的上方兜底。

这项结论来自真实几何及 CSS 裁切，不把 jsdom 的无布局 DOM 当作真机验收。

### P2：Generic loaded host 的尺寸与实际节点、fallback 不一致

`CanvasViewport.jsx` 遍历的是原始 nodes，node prop 仍传原始 n；仅 position 从 worldById 取世界位置。`CanvasNode.jsx` 真正渲染使用 `canvasNodeSize(n)`，该函数对 `_explicitContentDims===true` 的 image/video 优先取 data.contentWidth/contentHeight。loading/error `CanvasGeneratorEntry` 和 ScriptV2 host 也用此函数；Generic full host 却直接用 `node.width||350` / `node.height||230`。

合法示例：world position={x:500,y:100}、width=350、height=230，data 为 `_explicitContentDims:true,contentWidth:700,contentHeight:525`。实际 node 为700×525；足够宽 board 下实际中心850，而 Generic 使用675；实际下沿625，应该在641开始的 Generic 却在346开始，覆盖节点下半部。相同节点 lazy fallback→loaded 后也会换锚点。

已通过本地纯 `canvasNodeSize` / `canvasWorldPosition` 求值核实这个协议差异；未执行原站脚本。不能只新增 Y clamp 而继续用错误 node.height。

### 动画期间的确定数学差异，真机影响尚待验

`NodeCanvas.focusNodeView` 立即写最终 view，同时给 `.cv-world` 设置 transform CSS transition。子生成器立即使用最终 zoom 的 `scale(1/zoom)`；transition 中父级的实际 rendered zoom 尚未达到最终 zoom。因此补偿只在动画终点相消。

例如目标 z=0.5，transition 中父级实际 z=0.75，子 counter scale 已经是2，660px卡片会呈现990px；当前横向夹紧却按最终660px计算。纵向 gap 和 panel height 同样有中间差异。现有 placement 不接收 viewAnimation，也没有持续采样实际 transform。本文确认公式风险，尚无本轮真机截图证明具体持续时间或肉眼表现，不将其标为已完成浏览器复现。

## 2. 必须统一的坐标合同

| 输入/输出        | 当前语义                                                                                 | 后续实现应保持                                                           |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| node.position    | 文档中 parent-relative position                                                          | 不能直接当屏幕位置；不能因布局改写文档坐标                               |
| host position    | CanvasViewport 根据 canvasWorldNodes 累计后的 world position（拖拽时还可能使用预览位置） | parent 只累计一次；不要再把 parent.position 加一遍                       |
| coordinateOrigin | 当前 host 内部定位的 node world origin                                                   | 只在最终转换成 node-local style 时减一次                                 |
| node size        | canvasNodeSize，含明确 content dimensions                                                | Generic、ScriptV2、fallback 使用同一真实锚点                             |
| view.x/y         | board-local screen translation                                                           | 不是 window/client 坐标                                                  |
| view.z           | world→screen scale                                                                       | 静止时与 counter scale 相消；动画中需要明确 rendered/target 区别         |
| board rect       | 实际 `.cv-board` DOM rect                                                                | 用其 width/height，不用整个 window 高度代替 Agent panel/嵌入画布后的空间 |
| Generic gap      | `16 / zoom` world units，即16 screen px                                                  | 不误改为16 world单位                                                     |
| ScriptV2 gap     | 16 world units，即16×zoom screen px                                                      | 是现有 source 适配范围内的差异；是否统一必须等 source 调研，不自行改阈值 |
| expanded frame   | document.body portal，window中心与独立 resize size                                       | 不继续套 inline board placement                                          |

静止 view 下，board-local screen anchor：

```text
anchor.left   = view.x + position.worldX * view.z
anchor.top    = view.y + position.worldY * view.z
anchor.width  = canvasNodeSize(node).width  * view.z
anchor.height = canvasNodeSize(node).height * view.z
```

也可由真实 node.getBoundingClientRect 减 board.left/top 得到实际 screen anchor；这能包含 CSS transition 的当前视觉位置。DOM rect 使用 CSS screen px，不乘 DPR、不把 inverse-zoom 已抵消的 panel 再除一次 zoom。

仍在 node/world DOM 中时，从 pure screen 输出转 local style：

```text
style.left = (screenCenterX - renderedView.x) / renderedView.z - coordinateOrigin.worldX
style.top  = (screenTop     - renderedView.y) / renderedView.z - coordinateOrigin.worldY
counterScale = 1 / renderedView.z
```

board.left/top只参与 client→board转换，不再加入上述board-local公式。screenToCanvas/canvasToScreen 已有此区别，不能混用clientY和board-local y。

另一条可行适配是将 inline frame 放在稳定 board-local portal 中，直接使用 screen px，省去 world counter scale；但这会改变 DOM/事件/菜单/焦点宿主，不能作为无风险的小调整。若采用，三入口同时接线、保持稳定 portal target，不能在上下翻转时反复 remount prompt 或创建第二套 dialog-stack。

## 3. 纯屏幕算法建议（非原站结论）

建议新增小型纯模型，controller 注入所有测量与策略：

```js
resolveInlineGeneratorScreenPlacement({
  board: { width, height },
  anchor: { left, top, width, height },
  panel: { width, naturalHeight },
  gap,
  margin: { x, top, bottom },
  preferredSide,
  previousSide,
  minimumUsableHeight,
});
// => { centerX, top, width, maxHeight, side, constrained, fallback, reason }
```

gap/margins/preference均由 host/source 策略传入。保现有 max-width660、横向20px padding和已合法中心精度；本文不追加新魔法阈值。

1. 验证有限非负 board/panel size 和有限 anchor。未知测量保持待测的原入口，不能返回 NaN、负 maxHeight 或一个看似成功的 width=0 card。
2. 计算 belowStart=anchor.bottom+gap，aboveEnd=anchor.top-gap；空间分别与 board 的上下可用边界相交。候选框先检查整个卡片能否放入；仅处理 Y clamp 会把卡片推到 owner node 上，所以不是充分解法。
3. 如果 preferred below 能完整容纳，保现有下方行为；否则 above 完整容纳时上翻。两侧都完整容纳时，用明确 preference/previousSide 保稳定，避免误差边缘或动态换行造成无谓往返。是否引入 hysteresis 和多大阈值需 source/Root决定，本文不发明数字。
4. 两侧都不足但至少一侧有可用高度时，返回可用空间较大的一侧、对应 maxHeight 与 constrained=true。host 确保整卡内容或内容区真实可滚动，footer/submit/expand/重试都可触达；不能只压缩 prompt 或将整体 overflow:hidden。
5. 如果两侧连最低可用控件高度都没有，不可能同时满足“不覆盖节点”和“整卡完整可达”。pure 明确返回 fallback/reason；由 host提供可达的 expanded/detached入口或已核对的其他策略。不要谎称普通clamp已满足两条件，也不要偷偷 pan/zoom相机或保存 expandedSize。低 board 高度时整个 window 仍可能足够展开；整个 window 也很矮时，展开卡自身同样要实测控件可达。

保节点不覆盖的验证是候选 panel rect 与 owner rect 不相交（gap允许时还满足间隔），不能只断言 top>=0。普通图中其他节点与生成器相交是另外的布局策略，当前“防覆盖节点”优先明确指 owner；避免全部其他节点是否为源要求待source证据，本文不增加全图避碰。

### 测量反馈必须避免自己震荡

panel.naturalHeight 不能只用刚刚受 maxHeight 限制后的 clientHeight。否则本轮限制高度→下一轮认为卡片变小已经能放→解除限制→又溢出，会反复重排。controller 应测自然内容高度（独立内容测量或 scrollHeight +边框等一致box约定），把 desired height 与 applied visible height 分开；纯模型只读数据。宽度变化引发换行后应重新测自然高度。

## 4. DOM、Observer、动画与 RAF 的所有权

现有 hook 给 board 安装 ResizeObserver/window.resize，清理有 current=false/observer.disconnect；已有测试覆盖 retired callback 不再测量。它只依赖 board ref object；同一ref.current替换真实 DOM时不会自动重新绑定。当前CanvasViewport的board DOM通常稳定，故这是新实现需要处理的边界，本文不宣称已发生替换故障。

loading/error Entry始终保留本hook，即使Implementation加载完成；Implementation自身又安装同一board observer。因此 loaded generic/script通常有两个board width测量者。可在共享frame/专用controller处收敛责任，但不要因为小型重复 observer擅自扩大重构。

建议新的controller遵守：

- 以 document/node/kind、实际 board/panel/anchor DOM 与 inline/expanded 状态拥有测量。A→B→A的旧callback不能更新新owner；不要只按相同字符串nodeID判断旧DOM仍有效。
- board与实际panel内容变化都触发测量：引用换行、模式参数、错误/加载/重试文案、窄屏footer换行、字体与媒体加载，都能改变卡高。首次layout measurement尽量在paint前完成，不能用一个固定预估高替代实际长期尺寸。
- RO回调只安排一次待处理RAF，合并独立变化；发布相同placement时保持state不变，避免RO→style→RO闭环。style写入与下一次DOM读取的顺序明确，避免一轮多次强制布局。
- CSS transform动画改变DOM rect不会触发普通ResizeObserver。若保留当前world嵌套，需要在transition期间有带owner的RAF采样真实transform/anchor，结束后最后测量一次、取消循环。另一选择是统一动画使用每帧真实view状态；它涉及共享viewport，不能只在局部读最终view便声称已处理动画。
- 平移/缩放、Agent panel开合、board resize、宿主scroll/视觉viewport变化都能改变可见区域。哪些事件需订阅由实际宿主确定；board move但width不变不能靠window.resize保证位置正确。
- 隐藏/展开/卸载/doc切换后 disconnect RO、remove listener、cancel pending RAF，并退休late callback；expanded不得把800×600的dialog测量记作inline naturalHeight，收起后重新读取当前inline布局。
- 位置调整是view层操作，不调用update、recordSnapshot、flushGraph或写node.position/expandedSize。readonly也可以进行只读可达布局；测量本身不是写权限。

`.cv-floating/.cv-inline-generator` 已在 useCanvasWheel/useCanvasTouch 的隔离 selector 中，整卡内部滚动可以保 native scroll，不应导致board pan/zoom。Frame/fallback仍须保pointer/mouse/doubleclick隔离及Space默认按钮行为。

## 5. 展开生命周期需要保留的合同

Generic Frame 的 key=documentKey:nodeID；Script host被CanvasGeneratorEntry owner boundary重建。现有 expanded转换会先执行onBeforeTransition，失败保原输入；Generic flush真实prompt，Script提交并拒绝无效保存。expanded使用既有dialog-stack、返回trigger、嵌套菜单portal，不增加独立inert/body-scroll所有者。

`GeneratorFrame`目前pointercancel与pointerup共用finish，都会调用onExpandedSizeChange；source是否要求取消保存由source代理核定，本文只记录现状。新layout observer/RAF退出不得误调用这个finish路径。readonly/lost-ready已将resize ref置空并收起，已有测试覆盖迟到pointerup不再写。Generic update使用current document写门控，Script changeExpandedSize经其owner/CAS；新measurement不能替代或绕过这些持久化门控。

上下翻转、约束height、boardresize不应触发expanded转换，不应remount输入、取消150ms draft、清选择或把调整加入undo。loading/error→loaded可重新测量，但仍须复用原module cache/owner迟到隔离、真实retry，而不是每个位置变化重新import。

## 6. 建议验收案例

现有useInlineGeneratorPlacement测试8项主要是x/width、resize和清理；GeneratorFrame tests主要是portal/焦点/尺寸写门控；Entry tests已有late import/readiness/retry与kind-specific gap。当前这些覆盖不能证明纵向可达。建议增加以下有意义的验收，最终真机结果由Root记录：

| 场景                                         | 必须断言                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| 默认下方仍完整fit                            | 保原side/center/gap，不改view或node数据，不产生history                      |
| 靠近底部、上方完整fit                        | 上翻且整个panel在board可视范围；与owner rect不相交                          |
| 两侧都不足                                   | maxHeight正数且实际内部能滚到footer/submit/expand/重试；wheel不改变view     |
| 连最小controls高度都不够                     | 明确可达fallback，不能只断言clamped top或负height被置0                      |
| image/video明确content尺寸或仅measured       | Generic/Script/Entry依据同一node rect；lazy成功/错误切换不跳到错误锚点      |
| parent/祖父分组、负position、0坐标           | 累计parent一次；z=0.25/0.7/1/2与pan后Screen rect符合相同合同                |
| 引用多行、长错误、窄屏footer、动态font/media | 重新测naturalHeight，无观察循环、无错误height缓存                           |
| Agent开合/boardheight变小/window变矮         | 独立使用当前board矩形，不以window-height替代；位置有限且所有动作可达        |
| CSS动画中与动画结束                          | 真实DOM card不临时放大/越界或明确记录待修；只看最终style不够                |
| RO/RAF排队后A→B→A、DOM替换、展开、卸载       | 旧callback不读/写新owner；RAFs/listeners/Observers释放；无参数/视口写入     |
| 展开→收起/嵌套菜单逐级Escape                 | 最新draft/模型/参数保留；dialog-stack与回焦点不退化，位置改变不卸载正常输入 |
| loading/error临近底边                        | 状态与真实retry按钮都可见可键盘触达，import只执行所需次数                   |

静态模型可验证几何与所有权状态；真实浏览器需验证getBoundingClientRect、CSS transform插值、内容scroll与focus后的可达性。仍须区分定向回归、全量check和已部署版本；本轮没有执行后两者。
