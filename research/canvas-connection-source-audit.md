# Canvas 连线交互源码审计（2026-10-11）

本批只读原站公开脚本与当前工程；没有执行原站 bundle、登录、采集账号资源或提交原站写请求。以下源结论来自已保存的客户端代码，不能等同于真实账号下逐手势浏览器验收。生产对照是本批开始时的 `CanvasNode` / `CanvasViewport` / `useCanvasNodeActions`，后续实现与验证须由新批次补充。

## 证据定位

以下 offset 均为 Python 解码 UTF-8 后 `str` 的 **0-based 字符位置**，不是文件字节或行号。bundle 基本只有一行，定位时先按符号检索再核对附近上下文。

| 保存文件                     | 模块 / 符号                                    | 字符位置与用途                                                            |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `source/21_0xvlvkw1sz.js`    | Canvas renderer `N.ReactFlow`                  | 963300 附近；显式 props、叠加模式 props                                   |
| 同上                         | `useCanvasConnection` 匿名 hook，`h/f/g/v/b/x` | 766000–772350；开始、校验、普通提交、程序化提交、落节点、结束             |
| 同上                         | `pw` / `pS`                                    | 686601 / 686928；enhance 默认模型修复、characterAsset 边数据              |
| 同上                         | `a7=e.i(265672)` / `oq=e.i(210550)`            | 142948 / 251293；实际 NodeTypeMenu 与 handle 实现入口                     |
| `source/1kb-4b4zv9_2a.js`    | React Flow store 默认值                        | 58500–59400；阈值、点击连线、自动 pan 默认                                |
| 同上                         | React `Handle` wrapper `eM`                    | 24700–28100；start/end 资格、鼠标左键与 touch、click 分支                 |
| 同上                         | `XYHandle.onPointerDown`                       | 110150–112400；拖连、吸附、RAF 自动 pan、释放                             |
| 同上                         | `eY` / `eF`                                    | 104450 / 103943 附近；严格端口方向、DOM 命中优先与坐标                    |
| 同上                         | `Y` / `W`                                      | 95500–95700；边缘 pan 比例函数                                            |
| 同上                         | `eB`（`panBy`）                                | 103079；viewport 约束接口                                                 |
| `source/2yyck7brx0tqq.js`    | 210550 `SourceHandle` / `TargetHandle`         | 700–8500；本体、加号、外围命中、点击事件；`1bflqug4ccoei.js` 有同模块副本 |
| `source/1fn_ozkqd_aiz.js`    | 265672 `NodeTypeMenu`                          | 9611 开始；20100–22300 的空白释放与 handle click 分支                     |
| `source/1blddhgxss0mm.js`    | 859654 `X` / `ew` / `eC`                       | 22208 / 24881 / 24918；菜单候选资格，28458 的 reference 末项共用资格检查  |
| `source/1xj2-x_wy8_8a.js`    | 516779 `validateGeneratorConnection`           | 19612 模块开始，23919 的 `h`；容量与 `switchToModel`                      |
| `source/44x8_9o6r7x1-.js`    | `MAX_TIMELINE_VIDEO_CLIPS`                     | 120287；明确常量30                                                        |
| `source/api/config-182.json` | `data.linkUrl` support 目录                    | image20 / video34 / audio6；候选模型顺序                                  |

## 实际 renderer 与库默认

实际 Canvas 显式设置 `connectionRadius: 80`。它没有设置 `connectionMode`、`connectionDragThreshold`、`autoPanOnConnect` 或 `autoPanSpeed`，没有注册 `onClickConnectStart/End`；因此通常模式保留库的 Strict、1px、true、15 和 `connectOnClick=true`。**80 是流坐标半径**：XYHandle 先用当前 transform 将 pointer 转为 flow/world 坐标，再找 handle，不是固定屏幕 80px。缩放后屏幕吸附距离会随 zoom 改变。

renderer 注册产品 `onConnectStart/Connect/End/isValidConnection`。锁定 / 发布保护令 `nodesConnectable=false`；手型模式同样关节点连接、拖动与选择。练习模式还明确关闭 `connectOnClick`、三个回调和 validator。只读、mark、focus 的自定义 handle 在组件层禁用 pointer。库默认值不能覆盖这些实际模式条件。

库的拖连在屏幕位移平方 **大于**阈值平方后开始；默认是大于1px，pointerdown 自身不调用 `onConnectStart`。原站新近节点移动的1px库默认与本地用户要求的4px调整应分开记录，不能自动把节点4px规则当作源连线阈值。

## 端口形态与点击

产品普通端口是 target 左侧 / id `target`，source 右侧 / id `source`。React Flow Handle 的几何本体为0×0，定位在节点边缘50%；实际交互由向外伸出的80×80圆形区域承担。可见加号为20×20，静止时中心在边缘外15px，图形从外5px到25px。hover 指针追随最大30px、放大1.1，80ms ease-out；离开以400ms弹性曲线恢复，透明度200ms。

短按判定是 `<300ms` 且 `<10px`，发 `node-handle-click` 携带 nodeId、handleType、handleId 与释放屏幕坐标。产品 NodeTypeMenu 消费该事件：source 菜单创建向右的下游节点，target 菜单创建向左的上游节点，选择类型后同时加正确方向的边。它保留按动作 / 类型 / 当前支持规则过滤的菜单。**这不是仅设置一个 sticky linking state**；库 Handle 的点击连线默认依然存在，产品自定义菜单和库 click 分支必须区分。

Skeleton handle 是独立20px显示 / 命中分支（visible默认false），有自己的 pointer capture 与同样短按判定。不能把该小命中区误当普通 handle 的80px区域。

## 拖连方向与目标

source 和 target 两侧都可发起拖连。库 Strict 仅接受相反类型端口：source→target 或 target→source。库在 `XYHandle.isValid` 中已按发起类型构造有向 `{source, sourceHandle, target, targetHandle}`。产品 `g` 还有兼容规范化：若提交对象 `sourceHandle==='target'`，交换 source/target 并改端口为 source/target。产品 `onConnectStart h` 保存的是 **实际发起节点和端口类型**，供结束 body fallback 与空白建节点使用。

最近 handle 在80 flow units内吸附。完全相同发起handle被排除；等距时优先相反类型。实际 pointer 位于 handle DOM 时 `elementFromPoint` 优先于几何最近值；handle还必须有 connectable / connectableend，最终再跑产品 validator。

`onConnectEnd x` 增加节点整体落点：无合法 handle，但 endState 有 toNode 时，尝试该节点；没有 toNode时，按释放点转flow，以1×1矩形 `getIntersectingNodes`，排除发起节点、所有 `GROUP` 和发起节点自身 parent，取剩余交集的 `.pop()`。按发起source端口得到起点→落点，按发起target端口得到落点→起点。**只使用源节点body fallback规则，不把整个组框当普通目标。** 目标仍须经过同一 validator，成功只记一次 snapshot。

释放在真正空白且未连接、未标invalid时，NodeTypeMenu 在下一RAF创建临时node/edge并显示类型菜单；选类型后换为真实node/edge，取消清临时项。当前本地未实现这套完整分支，不能把空白释放“取消”称作1:1。

## 普通 validator 的顺序与范围

1. source / target ID 和节点存在；restricted-experience连接策略及团队锁校验。
2. **同向或反向已有边都拒绝**，不是只拒绝source→target重复。
3. `SCRIPT_V2` 与 `GROUP` 且 `storyboardGroupType` 为 image/video 的组合，两个方向都拒绝。
4. 指向 `VIDEO_CLIP` 时，视频/音频节点的 `blob:` URL拒绝并提示需上传；视频clip达到 MAX_TIMELINE_VIDEO_CLIPS（公开源码明确为30）时拒绝新的不同source video。audio不占此计数，已在timeline中的source不重复触发该拒绝。
5. 有向cycle检测排除所有 REFERENCE 作为source的边，加入新边后，从拟source DFS；遇栈中节点拒绝。程序化 `v` 还显式拒绝 source===target。普通 `f` 未看到独立 self guard，普通节点自环被cycle挡住，reference-source排除cycle后的特殊自环边界不能据此称全部已核实。
6. TEXT 目标对image（包含characterAsset group）和video先检查已有直接入边数量。目录模型 image2text/video2text最大值优先，缺模型默认1/0。
7. 调用516779 `validateGeneratorConnection`；返回 `{allowed,switchToModel?}`。允许并需切模型时，提交边与目标兼容参数修改在一个历史事务。`px` **把目标模型所有普通 settings 字段重置为目标默认值**，包括两个模型共同支持的字段；无 default 时取首个 enum value。旧模型独有的普通 storeKey 设置为 undefined，advanced、prompt和其他参数继续保留。字段使用 `originalField` 对应的 storeKey，按当前 mode（默认text2video）取得普通 settings；不能只改 model 字符串，也不能把共同字段保留为旧值。

516779 的额外规则不是只有普通媒体数量：directorStudio单双源/模式与locks、普通group/video_group/video_story展开子节点（characterAsset group按image）、REFERENCE目标仅REFERENCE源、REFERENCE源普遍许可、VIDEO/VIDEO_CLIP→SCRIPT_V2禁止、source/target action compatibility、enhance单入边同类、picture-edit video单入边、shot-breakdown单video、style/lens资格与容量、TEXT_RESOURCE拒绝入边等都有独立分支。

普通video/image/audio生成器会先收集现有入边（含组展开、排除refs、内部refImages），模拟新source，检查当前模型；不支持时在运营support候选中寻找可用模型并返回 switchToModel。video的模板extraConfig缩窄候选、合并schema；assetId / segmentRemakeLock固定模型，不自动切换。image/audio也有各自候选和能力算法。**现有增强 @ validator 的 current-model-only 是已标明保守子集，不能冒充普通原站自动模型切换。** 未实现类型的策略必须写明未知/blocked，不放行所有组合，也不能把整个已知普通流程降格为只current-model可连。

## 自动平移与结束

自动pan只在真正拖连开始后起动，持续RAF，pointer靠近Canvas domNode任一边40屏幕px触发。以x为例：`x<40` 时正向 `clamp(abs(x-40),1,40)/40*15`，`x>width-40` 时负向同式；正好边界为0，超过边界最大15，两个方向可同时发生。此处15是**屏幕 viewport增量 / RAF**，不除zoom；pointer用最近屏幕位置减初始Canvas DOM rect，flow端点每次用最新transform计算。Pan由`panBy`→`setViewportConstrained`，translateExtent未覆盖时为infinite，不存在源证据中的任意本地节点包围盒硬边界。

库结束取消RAF、清connection并移除mousemove/up、touchmove/end；有效释放调用onConnect后onConnectEnd。产品Escape清发起ref、connecting source和invalid；Canvas另在pointerup/cancel、mouseup、dragend/drop、blur、页面hidden统一清交互store。独立本地controller应增加文档/ready/readonly owner取消、pointerId/primary、lostcapture、visibility/blur，保证不会把旧会话落点写到新图；这是当前工程安全要求，不能宣称每项都由原库PointerEvent实现。

## 当前本地缺口与建议

本批开始时普通 `CanvasNode` 是source点击设置linking、target/body点击调用connect；两个端口pointerdown只stopPropagation。`useCanvasPointer.move` 更新预览，但没有端口拖连、几何吸附、目标合法状态、RAF边缘pan、target反向发起、空白类型菜单。`useCanvasNodeActions.connect` 仅self/同向重复拒绝，缺失节点验证、反向重复/cycle、类型/模型/容量检查；与增强@图事务不共用普通策略。

建议以独立connection纯模型与gesture hook维护：纯模型返回规范source/target、拒绝原因和可验证targetPatch；hook只拥有pointer/session/RAF，边与patch通过已有同步graph CAS一次commit/一次history。拖动节点和连线不能同时capture；body目标不改变selected/不进入drag。预览、合法/非法状态、取消不能创造历史。释放必须使用实际最终pointer坐标、最新图和view。输入发起要保留handleType，再按目标方向规范化；不可只记录一个“linking source”。

验收至少覆盖输出拖入输入、输入反向拖入输出、目标body fallback、缩放后80 flow units吸附、非法/重复/cycle无历史、边缘pan后继续准确落点、Escape/blur/cancel/lostcapture/切项目无迟到写入、一条边加model patch只一次undo，以及键盘原click操作和readonly禁写。NodeTypeMenu、模型全部策略、团队锁、timeline与真实服务各自列差距；源bundle不会替代这些实际验收。

## 新节点菜单的独立资格与本批纯模型

859654 `X` 的调用为 `X(e,$,t,n)`；其中 n 是已有 anchor，a/t 是候选节点，不能混淆。已有 REFERENCE 的 source 端口可创建任何已支持候选；已有 REFERENCE 的 target 端口仅允许新建 REFERENCE。普通 anchor 即使显示末尾 reference 项，也仍经过 `eC` 的同一 disabled 判定，并不获得创建 reference 的例外。target 上游菜单不显示 legacy SCRIPT / storyboard，仅保留 ScriptV2；video / video-clip → ScriptV2 仍禁用。source 菜单可保留已有 legacy script 候选。

265672 `eM` 在选中候选后一次 snapshot，再 addNode 与原始 addEdge；它没有调用普通连接的 generator 容量 validator。应由独立的新建资格判断允许候选，普通既有节点拖连仍使用完整 ordinary validator，不能借新建入口放行已有图上不兼容连线。新建生成器随后由节点初始化逻辑解析引用与模型；没有源码证据支持在菜单加边之前按空 params 的当前模型保守拒绝。

本批新增 `src/features/canvas/domain/connection-model.js`：`resolveCanvasConnection` 接收已规范方向的 sourceId / targetId，返回 `{valid,reason,sourceId,targetId,targetPatch?}`；`targetPatch` 当前形式为 `{params:完整目标参数}`，controller 应将 edge 与此 patch 一次提交。普通 graph topology、双向重复、REFERENCE cycle 排除、组展开、ScriptV2、clip、text容量、普通媒体模型与确定性候选切换已覆盖。候选优先当前模型，再用公开 config-182 的支持顺序；可通过 `models.support[type]` 注入运营新目录，不用 schema object 枚举代替原顺序。`px` 参数规则按源实现，现有本地文档额外把同一 patch 映射至 params.settings，以兼容本地存储形态。

`resolveCanvasConnectedCreation` 额外要求 createdNodeId 为新端点，返回同形的资格 plan；它不提前套普通媒体容量和模型切换规则。只有 controller 创建的新端点能使用此入口。模型不读 DOM / storage、不写文档、不拥有历史；方向规范化、实际落点、edge 数据和事务由 controller 负责。

2026-10-11 16:09 本批纯模型64项 Vitest 通过，Prettier与ESLint通过。测试覆盖反向重复/cycle、输入容量、组/特殊边界、image/audio/video自动切换、普通默认重置与originalField、template和locked模式、主体数量、菜单上下游/REFERENCE/ScriptV2资格和纯性。此结果不等同于浏览器手势或全部节点类型验收。style/lens/directorStudio、未知 generator/model 能力返回明确 blocked/未知理由；团队锁与restricted-experience服务尚未进入这个数据接口，仍由controller在可获得真实策略时先行检查。普通 source 的 enhance 默认模型修复 `pw`、characterAsset 边数据 `pS` 和完整 timeline 编辑仍由后续 controller/业务分支另行接线与验证。

## 连线预览与目标反馈核对（2026-10-11）

`1kb-4b4zv9_2a.js@112295` 明确将 connection.to 设置为合法 toHandle 的几何坐标；非法或未知仍用 pointer。`tu@52644` 转回 flow 坐标，`tf@53368` 将其传为自定义线的 toX/toY。普通端口几何0×0位于节点边缘中点，吸附不是可见加号向外15px的中心。body fallback仅在onConnectEnd，悬停body不能提前冒充合法handle吸附。

产品 `21_0xvlvkw1sz.js@161880` 的 nx 由 renderer 的 `connectionLineComponent:nx@963955` 使用：普通/合法/未知线为6px蓝色rgba(100,180,255,.4)底线与2px `var(--canvas-edge-hover)`，有呼吸glow和流动段；invalid线为6px rgba(180,180,180,.2)和2px rgba(160,160,160,.6)，没有glow/flow。`@162140` 的600ms计时在持续invalid后显示“无法连接”（文案见flight-rows.json）。bubble宽96、高60按1/zoom布局，内部32px高pill按1/zoom缩放；原站只显示通用文案，不显示本地拒绝理由长文。主题变量来自 `1h-b10gcvw4vl.css@244359/@245968` 的dark #c0c8d0 / light #919191。

`10v03g6udfcrl.js@639–1500` 的 EdgeFlowSegments 是2层宽12/7的glow与6层宽4尾段，pathLength=300，dash=36/64与渐进尾段，rgb(100,180,255)。`3-33_hgcnhgo3.css@100378` 使整个组3秒线性循环dashoffset 0→-300，子path继承offset；产品设pauseWhileInteracting=false，拖拽中流动不暂停。`0f2shqexgq0gc.css@2400` 的line glow为1.5秒呼吸。库Bezier `1kb-4b4zv9_2a.js@127294` 默认curvature=.25；`ev@99261` 控制距离为前向半距离、背向25×curvature×sqrt(负距离绝对值)。

本批新增 `components/CanvasConnectionPreview.jsx` 及局部CSS，接口为 `{preview,origin,zoom}`，named/default export。preview包含nodeId/handleType/raw point/endpoint/target/status/documentKey/gestureId/reasonLabel；仅读取controller提供的endpoint和status，不重新校验、吸附或写图。所有path保留cv-link-preview以区别真实边；局部规则覆盖旧preview虚线和全局灰线。invalid bubble保持源通用文案，本地reasonLabel只作title；计时按document、gesture、origin、handle和target隔离，移动不重置同一owner的600ms。取消、origin删除、状态或owner改变及StrictMode卸载清timer；reduced-motion关闭glow/flow动画，保留静态线与延迟提示，这是可访问性适配，不声称源站已有该分支。

17项预览组件测试通过，覆盖双线/流动段、输入反向与背向Bezier、snapped与raw终点、invalid延迟、缩放、owner更换、A→B→A、gesture复用、StrictMode清理，以及局部样式和reduced-motion selector。CSSOM验证不能代表真实GPU动画或媒体查询引擎；浏览器图像仍由整体验收补充。此前手势/资格模型113项亦已通过。

节点光边另有明确源证据，但本批预览组件不实现：`3u6hjewm8qox_.js@647212` 的 useConnection3DTilt / `@649995` 的NodeGlow / NodeShell `@666444/@666502`，包括eligible hover白色旋转glow、±8°倾斜（80ms入/400ms归）、invalid白边脉冲与blocked/invalid模糊遮罩。active hover不等同于已校验body容量；invalid由connectingInvalidTargetId标记。普通Handle210550圈/加号不读取valid，捕获样式未发现独立红绿端口反馈；不应自行添加此状态色。节点tilt/glow与特殊节点完整视觉仍为明确差距。


## 普通节点反馈更新（2026-10-11）

后续已按上述直接源证据接glow/tilt/blocked正文遮罩，空白release的tiny临时renderer亦已接；视觉候选仍不等于validator结果。当前接线及原生/合成GPU证据、特殊renderer剩余范围见 [节点反馈审计](./canvas-node-feedback-functional-audit.md)、[反馈源码](./canvas-node-connection-feedback-source-audit.md) 和 [ghost源码](./canvas-connection-ghost-source-audit.md)。
