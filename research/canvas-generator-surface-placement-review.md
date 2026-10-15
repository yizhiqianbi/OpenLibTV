# 生成器实际 surface placement 独立复核

2026-10-13，02:36 定向源码快照。仅新增 `components/CanvasGeneratorEntry.placement.test.jsx`、本文与专项日志；不修改生产、原测试、Root 文档，不运行全检、浏览器或部署。上下翻转、整卡限高滚动与 docked 兜底是用户授权的本地交互适配；本文不把它们说成原站新增要求。原站规则调研由另一代理负责，既有坐标证据见 [纵向 review](./canvas-generator-vertical-placement-review.md) 与 [横向 board 审计](./canvas-inline-generator-board-placement-audit.md)。

## 真实接线与已验证范围

`useGeneratorSurfacePlacement.js:47` 在实际 section ref 到位后创建测量生命周期。它读取 `.cv-board` 与匹配当前 node ID 的外层 article rect；有实际 node rect 时不用最终 view 坐标替代。live scale 为实际 article.width / canvasNodeSize(node).width，Generic、ScriptV2 与 Entry fallback 因而共用显式媒体 content dimensions。只有真实 node rect 不可用时才回退到 world position 与 view。

panel 的自然高度由 `scrollHeight + borderHeight`、`offsetHeight` 与可选 minimumPanelHeight 的最大值取得；不用受 maxHeight 限制的 clientHeight 当自然高度。纯模型输出 maxHeight 时同时设 minHeight:0 与 overflowY:auto，让整卡包含底部操作均可滚动。满宽/限高前后的 surface ResizeObserver 可再次测量，geometry 值相等时保留前一次 React state。测试连续三次通知保持同一249px cap，并在实际自然内容降到100px后清除 cap；没有发生把 cap 当新自然高度的振荡。

board 与 visualViewport 做 client-space 交集；没有 visualViewport 时使用 innerWidth/innerHeight。可见区域上边距为 min(20,height/4)，下边距为 min(60,height/4)。纯模型仍由 caller 显式提供边界，本文没有修改这些 Root 策略。Root随后让实际正尺寸 `.cv-node-title` 的上沿参与nodeTop，只改变above空间；实际可见toolbar右沿还参与leftInset（原始20px基线仍保留）。本批fixture验证title，对toolbar避让没有新增断言，由Root接线测试与原生负责。最终 left/top 从实际 offsetParent 的 rect origin 减去，再除以 live scale；本批用独立于 node rect 的 offsetParent fixture 验证这种局部坐标转换，不再次累计 parent/world offset。

`GeneratorFrame.jsx:31` 只有 inline 状态启用 surface placement；展开使用现有 body portal 与 dialog-stack，关闭后新 section 重新测量。Generic 在 `CanvasNodeInlineGenerator.jsx:255` 传入统一 placement；ScriptV2 在 `ScriptV2NodeGenerator.jsx:89` 另传 kind:'script'，保留独立 gap。原提示词、模型、expanded size 与历史 callback 不进入 placement writer。

`CanvasGeneratorEntry.jsx:46` 的 GeneratorLoadState 自己持有实际 hook。pending、import error 与 render boundary fallback 共用这一挂载组件，而不是 Entry 根据 result 猜测是否需要测量。这避免“模块已加载但组件渲染失败”的 fallback 被错误禁用。该修复由 Root 在本专项测试创建前完成，本文没有制造旧失败基线。

新增17项用真实 Entry、真实 render boundary、真实 GeneratorFrame 与真实 placement hook；只补 jsdom 缺少的浏览器几何原语、ResizeObserver 与 RAF，不 mock placement 算法。full implementation 是只读轻量 Frame fixture，不把它称为真实 Generic/Script 所有控件验收。重点结果：

- pending 自然高度80时上放239，full高度221时上放98；替换后旧 observer disconnect，旧 callback 不再读取 DOM。
- import error 的120px卡片上放199，重试 placeholder 回到239；真实 retry 新请求完成后 full上放98。render error 卡片仍有活跃 observer，节点移动后可翻到下方346；重试缓存模块不重复 loader。
- 实际title上沿299参与above边界：pending80上放203、末沿283与title保持16px间距；full221在仅213px空间时限高213、末沿仍283。节点移到可完整下放时保留below346并清cap，不为了title改变下方锚点。
- 当前节点铺满可见 board 时显式 docked，整卡 overflow:auto；未知 board 保留原几何，恢复测量后翻转。无 ResizeObserver 时 window.resize 仍工作，卸载后移除监听。
- `_explicitContentDims:true,contentWidth:700,contentHeight:525` 的实际350×262.5显示盒正确给出liveScale=.5；旧raw350×230不覆盖它。
- visualViewport resize 重新计算实际宽度与位置，卸载后其resize/scroll不再读取旧 DOM。
- 同DOM的 doc A→B→A 更换 owner 会disconnect旧 observer、cancel旧frame；旧 observer 与手工模拟已退休frame均不读取DOM、不发布旧几何。卸载同时阻断迟到 import mount。
- StrictMode replay 后最终 fallback observer 活跃，loader只调用一次；失去 ready 时 placeholder仍正常定位，迟到 full不挂载，恢复 ready 后使用同一缓存模块与最新props。
- full展开时退休 inline observer/RAF；展开卡不带inline top/side，collapse后 replacement按当前实际节点rect重新定位。

## 本批确定修复：动画中的 Generic gap

初读 Root hook 使用 gapWorld=16/最终zoom，再乘实际liveScale。CSS transition期间target=.5/rendered=.75时，Generic gap变为24 screen px，即使新counter scale已保持卡片实际尺寸稳定。这是确认的普通16px屏幕间距合同偏差；Script16world应随liveScale变化。

Root已改为 `kind==='script' ? 16*liveScale : 16`（当前hook:119）。专项强断言：实际node scale=.75、最终zoom=.5时，Generic pending在523.5且below完整可达，动画终点变为466；Script对应519.5→458。没有以末态结果代替中间帧验证。修复在第一次专项运行前已落，因此只读公式与通过后的强断言是证据，不声称存在本批失败测试日志或原生复现。

## 几何与原生验证边界

这些测试验证均匀 world 缩放、位移与 observer/RAF 所有权，没有布局引擎，也没有原生CSS transition时序、字体加载、设备键盘、pinch zoom、Safari或高DPR视觉验收。visualViewport fixture使用真实 EventTarget但几何是显式输入，不等同于真实手机键盘验证。未绘制可见区域的 board，或自然高度尚不可读时，hook保留旧 source-compatible fallback，不能宣称此时已完成纵向防裁。

修前有一个具体可达的3D祖先边界已交给Root：CanvasNode 的 afterContent 原来位于 `.cv-node-feedback-surface` 内，该祖先在接线hover时承受 perspective rotate（`useCanvasNodeConnectionFeedback.js` 的80/400ms transition）。`useCanvasConnection.start` 不改变 selected，所以先选B使其generator挂载，再从未选A端口拖到B，可让B成为connectionTarget而其generator仍挂载。placement的liveScale来自外层无tilt article，offsetParent原来读取已tilt祖先的axis-aligned boundingRect；标量inverse-scale并不是该3D矩阵的逆，RAF也只监听 `.cv-world` transform。

Root本轮已把afterContent永久放到article内、作为feedbacksurface的兄弟（`CanvasNode.jsx`末段）；因此generator不再继承该tilt，而非另写任意3D矩阵反解。本文只读确认了结构修复，没有改CanvasNode；实际Canvas的同input/draft/parent隔离验证由另一代理补，真实原生连接由Root负责。修前风险没有本批原生失败截图，当前结构也不据此声称任意3D宿主全部受支持。

当前真实 caller 保持稳定board实例；hook owner记录board ref对象而非其.current DOM值。若未来保持同一ref却把board实体替换、或把panel移入任意有border/scroll/rotate的offsetParent，需要补该宿主的生命周期与局部坐标证明。现有 grouped测试证明origin只减一次，不证明任意新的transform/scroll宿主都被支持。

## 失败夹具与冻结验证

扩展16项时有一次15pass/1fail：显式尺寸fixture误把 `_explicitContentDims` 写成对象，真实模型要求 boolean true加contentWidth/contentHeight；收到-96而预期-192。修正夹具为生产合法字段后强断言原样保留，没有修改生产或弱化expected。这次不作为生产失败。

Node24.19.0联合5文件/103测试于02:36:41全部通过：本批17、原Entry11、Frame5、新pure placement62、旧horizontal hook8；耗时2.01s。前一102项是Root标题/结构完善前的历史快照，不把它标成最新验证。旧strong测试全部未改。专项格式与零警告lint结果在 [日志](../artifacts/canvas-generator-entry-placement-tests.log)。Root负责全量检查与原生浏览器；本文不把专项通过描述成整个工作区已全检、当前已部署或全站goal完成。

快照SHA256（后续Root生产修改应单独复验）：

| 文件                                    | SHA256                                                           |
| --------------------------------------- | ---------------------------------------------------------------- |
| useGeneratorSurfacePlacement.js         | b7467b141918f28bd1a5ec54a6072aa93732c5e854fcf9eb6dd77d160fe44832 |
| CanvasGeneratorEntry.jsx                | ed4273191077c9206e463a4af3de55e15e765256995bd93bc09da002d6f2cff0 |
| GeneratorFrame.jsx                      | 9035817f7206a10289d8cc1d848bc7acfc74c24f4794b0a1709ef6df453454a3 |
| CanvasNodeInlineGenerator.jsx           | 05d3977cc73a2e3d72a4715f393ba9357f3df7504db27ac2210defa9a3a5b983 |
| ScriptV2NodeGenerator.jsx               | 1069387df2c33343635543055b52f0fec332cdd52509947ff3fcc164d4f422c9 |
| CanvasNode.jsx                          | 7b92603f190dac22e1807a55fedbf79837a8cb4b443f7aafa182f9e4a5d312b6 |
| CanvasGeneratorEntry.placement.test.jsx | 601637faa68f4817c5b8a8f14759a51e3f878fcbb0a3faf019573840ac96bac6 |
