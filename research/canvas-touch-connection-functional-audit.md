# Canvas 节点手势与连接维护

2026-10-11。根据用户“节点交互不流畅自然”的反馈继续优化。当前版本使用本地工作区，不要求登录、注册或小号；没有运行原站 bundle、遥测或写接口。

## 源证据和模块

源协议分别见 [触摸审计](./canvas-touch-source-audit.md)、[连线资格审计](./canvas-connection-source-audit.md) 与 [端口菜单审计](./canvas-handle-menu-source-audit.md)。不能从独立 useTouchMode 的两个 false 推断最终 renderer 禁止触屏节点操作；普通 Canvas 的后续 props 覆盖它们。

| 模块 | 职责 |
| --- | --- |
| `domain/touch-view-model.js` | 屏幕/世界锚点、距离/中点缩放、抬指重基线、0.1–8 限幅 |
| `hooks/useCanvasTouch.js` | 原生 touch 生命周期、粗指针订阅、输入/媒体/滚动容器归属、双击 fit |
| `domain/connection-gesture-model.js` | border handle 坐标、80 世界单位候选、node body 回退、40px/15px 自动平移 |
| `domain/connection-model.js` | 普通连接资格、循环/重复/容量/模型切换与独立的新建节点资格 |
| `hooks/useCanvasConnection.js` | pointer owner、capture、预览、RAF、DOM 对向端口命中、取消 |
| `hooks/useCanvasConnectionMenu.js` | 当前 menu request、候选、图提交/选择和旧请求隔离 |
| `components/CanvasConnectionHandle.jsx` | 原站 80×80 hit circle、20px 磁吸加号、hover/rest 定时器 |
| `components/CanvasConnectionPreview.jsx` 与局部 CSS | 只读 endpoint/status、蓝灰双线、flow/glow 与延迟提示 |
| `components/CanvasConnectionMenu.jsx` | 类型菜单、脚本二级菜单、键盘/焦点、外部关闭及窄屏位置 |
| `hooks/useCanvasGraphActions.js` | 同步 currentDocument CAS、节点/边/参数一次历史提交 |

NodeCanvas 只协调上述模块。未扩张架构白名单，没有新增依赖或改变持久化 key。

## 行为和稳定性

普通点击和小幅抖动仍保持内嵌输入，节点超过 4px 才开始拖动并记一次历史。这是前一批明确的手感适配；连接拖拽保持源严格 >1px 阈值。Space/手型/中键从节点非 UI 区域平移；输入、媒体和实际可滚动区域拥有原生操作。

空白一指平移、双指中点缩放、抬起一指后延续平移已接入；节点一指拖动保留，合法第二指停止旧节点 writer。touch、node pointer 与 connection 互相接管时取消旧 capture/RAF，不允许多个手势继续写节点或视口。公开 cancel 清旧 tap/click suppression，原生正常结束保留刚产生的后续 click 抑制；新鼠标双击不被上一轮触摸或连接吞掉。

连接可从输出或输入端口开始，输入端口反向拖动统一规范为 source→target。直接 DOM 对向端口命中优先于 80 世界单位的几何邻近；移动阶段只找对向 handle，node body 回退仅发生在释放时。合法 handle 预览吸附节点 border，invalid/unknown 跟随实际指针。释放位置使用实际 pointerup 和最新 view。自动平移同步写 viewRef 后发布 React view，避免预览落后一帧。删除起点、取消/丢失 capture、blur/隐藏、Escape、ready/readonly 或 A→B→A 均取消旧 owner；卸载移除原 listeners/RAF。

预览的默认、合法和 unknown 状态保留源蓝色底线、主题细线、flow/glow；invalid 使用灰双线且不流动、不发光，持续 600ms 后显示源“无法连接”。提示通过 inverse zoom 保持屏幕尺寸，详细原因仅放 title。计时器按 document/gestureId/node/handle/target 隔离，普通移动不重置，取消、切目标、StrictMode 与卸载清理；reduced-motion 静态回退属于本机适配。完整节点白光边、±8°倾斜和 blocked 模糊遮罩仍缺。

短按端口打开原类型菜单；source 同步保留 linking，随后点击普通目标 body 只连接，不先选择/拖动目标。outside pointerdown 只有普通 body 关闭可保留这个连接意图；Escape、控件、其他区域、切手型/文档和删除起点完整取消。Menu.open 同步发布新的 request，旧对象不能在同一个 batched 回调中提交或关闭新菜单。

拖到空白处可选择新类型，节点与边一次原子创建并记录一次历史。新建连接使用源 eM 独立资格，不套普通模型容量自动切换；普通连接继续检查重复、反向重复、循环、动作和已核实模型能力。图片 anchor 两个方向新建文本均显示“根据图片生成提示词”，并同次保存 prompt/count；显式清空其他文本不作全局回退。

fit/zoom/touch 共用 0.1–8；fit 默认源 padding .1，触摸双击使用 .15/300ms，按每侧 floored padding 和屏幕修正计算，隐藏节点不参与。巨幅 fit 不再写 .02 后被首次触摸突然放大。双 tap 限定空白、位移 <4px、同一目标、排除 pinch/UI；实时 matchMedia 订阅与节点两指接管属于本机稳定性适配。

真实浏览器还发现聚焦/自动 scrollIntoView 使 `.cv-board.scrollTop` 变为 90，而 world view 未变，导致所有坐标错位。board 改为 `overflow:clip`，世界画布只按 transform 移动；实际回归 scrollTop=0。子滚动容器和分镜独立 overflow:auto 保留。旧浏览器的 clip 支持范围未实测。

## 定向测试与真实浏览器

新增真实 NodeCanvas 联合回归 15 项，覆盖节点/连接/触摸的双向接管、旧 RAF/release、A→B→A、卸载保存/listener 清理、原生输入滚动、精确 fit、fresh mouse doubleclick。只 mock 只读内容目录，使用真实本地 actor、图/文档/历史/menu hooks。

连接纯资格 64 项、手势几何和原生事件 49 项通过；菜单 view 的键盘/外部关闭/定位回归和 menu hook 的 25 项真实 Graph/CAS 回归通过。普通两击连接的集成测试改用合法 image_resource→video_generate，保留源 pointerdown/up/click 序列、目标未捕获/未移动/未重选、一次 undo/redo 和卸载保存；不保留旧 video→image 的错误放行。

Preview 17 项测试通过，覆盖路径、样式、合法/非法切换、600ms 延迟、owner/取消和 reduced-motion。CSSOM 与组件测试不等同真实 GPU 动画或真机媒体查询验收。最终 `npm run check` 为 211 个文件、1477 项测试全部通过，核心 strict、零警告 lint 与生产构建通过；strict 不覆盖所有 JSX。

实际浏览器使用独立本地项目 `canvas-connection-proof`，不覆盖用户项目。在 1280×720 验证短按 source→目标 body、正向/反向拖拽、重复拒绝、空白创建文本、一次 undo/redo 撤回并恢复节点+边、源默认文案、fit。390×844 的页面宽度和菜单边界另验。最终全工程检查、截图及具体位置以 [验证历史](./verification-history.md#节点触摸与拖拽连接2026-10-11) 为准。

开发中增加 hook 后旧 Fast Refresh 树产生 hook-order 错误；独立验收 tab 刷新后再验最终源码。没有刷新用户未保存的 tab。不能把旧热更新日志删掉后声称整段开发过程没有错误。

## 明确剩余范围

原站空白 release 的临时 ghost node/edge 由本机受控菜单及 pending 连线替代，取消不写永久图；还不是完整临时节点 renderer。完整节点白光边/倾斜/blocked 遮罩、特殊团队/权益/主体/character 边 metadata、未核实生成器分支、完整全部工具快捷键、大量节点性能、真实手机 UA/Safari/native pinch 尚未验收。模拟原生 TouchEvent 不代表真机验证。真实生成、上传、费用和运营写服务继续未连接；整个复刻目标未完成。


## 后续节点反馈接线（2026-10-11）

上述“仍缺”记录保留本批当时范围。后续已接普通节点glow/tilt/blocked遮罩、tiny ghost node/edge、world anchored菜单与blur/hidden清理，详见 [节点反馈审计](./canvas-node-feedback-functional-audit.md)。持续反馈的实际GPU图使用合成PointerEvent驱动真实handler，不等于原生持续按住；原生释放/创建/undo及390px另验。特殊renderer、多人/权益、真机与服务边界仍未完成。
