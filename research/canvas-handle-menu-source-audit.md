# Canvas 端口创建菜单源码审计

本批日期：2026-10-11。仅使用已经保存的公开客户端、公开 locale 与 SVG 证据，不登录、不使用账号资源，也不调用原站写接口。本文件覆盖端口点击后的节点类型菜单；普通连线拖动、资格与原子建图由对应 domain/controller 审计维护。

## 一手证据

| 文件                                | 位置 / 标识                                                                              | 证据                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `research/source/2yyck7brx0tqq.js`  | `HANDLE_CLICK_EVENT`、`SourceHandle` / `TargetHandle`，字符偏移约 724、2357、4891        | 手柄点击时间 / 位移、显示、磁吸、SVG 与 skeleton 分支                     |
| `research/source/1fn_ozkqd_aiz.js`  | `node-handle-click` handler，约 21735；创建回调约 16300                                  | 端口资格初筛、上下游位置、新节点与连线一次创建                            |
| `research/source/1fn_ozkqd_aiz.js`  | module 265672 的 wrapper `M`                                                             | 固定屏幕定位、实测尺寸与 viewport 8px clamp                               |
| `research/source/1blddhgxss0mm.js`  | module **859654**，约 15782；`X` 22208、`ew` 24881、`eC` 24918、reference renderer 28458 | `NodeTypeMenu` 类型、顺序、source / target 差异、样式、统一 disabled 条件 |
| `research/source/1h-b10gcvw4vl.css` | `:root` / `.dark` / `.canvas-light` tokens，约 244277、245884                            | 手柄颜色、菜单背景 / 边框 / 文字 / hover / shadow                         |
| `public/data/locale-zh.json`        | Canvas namespace                                                                         | 标题、类型名、图片转文本默认提示词                                        |
| `public/assets/icons/`              | 原 SVG                                                                                   | text / image / video / audio / script 菜单图标，未修改原素材              |

字符偏移为当前保存文本的 JS 字符位置，不是浏览器行号。原脚本只读，不在生产加载，也不复制其遥测与写入逻辑。

## 端口事件与位置

- 普通 `SourceHandle` / `TargetHandle` 在 pointerdown 记录时间和 client 坐标，pointerup 同时满足 **耗时 <300ms**、**欧氏位移 <10px** 才派发 `node-handle-click`。等于阈值不成立。skeleton 分支带 pointer capture / cancel，并在结束时再次检查模式门控。
- handler 在 mark / focus / reference pick / readonly / practice 状态以及锁定节点时拒绝入口；source 的受限能力检查和 target 检查分开。生产门控与文档身份由 root 的纯模型/controller 维护，菜单不改权限。
- source 新节点位置：`anchor.position.x + measuredAnchorWidth + 100`。target：`anchor.position.x - NODE_WIDTH - 100`。两者 y 为 `anchor.position.y + (anchorHeight - NODE_HEIGHT_EMPTY) / 2`。分组世界坐标与父坐标适配由现有图模型执行，菜单不自行计算图坐标。
- source edge 为 anchor source → new target；target edge 为 new source → anchor target。源码先 snapshot，再创建节点和边并选择新节点，清理临时项、菜单和锁。不能把菜单选择拆成多个历史或宣称产生真实媒体。
- 图片 anchor 的下游文本节点默认提示词来自 `canvas:connectionHandlerPromptImageGenerate`：**“根据图片生成提示词”**，count=1。这个默认值应和节点创建同次提交。

## 普通手柄视觉（交给 CanvasNode 实现）

| 项目        | 原值 / 公式                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SVG         | 20×20，circle 中心 (10,10)、r=9.35；填充 `--canvas-handle-bg`、stroke `--canvas-handle-icon` / 1.2                                                    |
| 加号        | `M10 6.5v7M6.5 10h7`，stroke 同 token / 1.5，round linecap                                                                                            |
| 深色        | bg `#1e1e1ee6`；icon `#ffffffb3`                                                                                                                      |
| 浅色        | bg transparent；icon `#000000b3`                                                                                                                      |
| 显示条件    | `!mark && !focus && !readonly && isConnectable!==false && (visible                                                                                    |     | hover)` |
| 透明度      | `Number(!!showVisual)`，仅 0 / 1；不是悬停渐增的手写 alpha                                                                                            |
| 命中区域    | 80×80 圆形；视觉大小20；源码 outward extent25、edge gap5                                                                                              |
| 磁吸        | 相对 hit area 中心 dx / dy，r=hypot；factor = r>30 ? 30/r : 1；translate(dx×factor,dy×factor) scale(1.1)                                              |
| 鼠标移动    | transform 80ms ease-out                                                                                                                               |
| 离开 / 显隐 | 回 right(-25,0)、left(25,0)、top(0,25)、bottom(0,-25)，scale(1)；transform 400ms cubic-bezier(.34,1.56,.64,1)，opacity200ms ease；450ms 清 transition |

本组件没有修改手柄本体，以上是提供 root 的确切证据。

## 菜单形态与范围

- 面板 `min-width:220px`、`width:max-content`、padding6px、border1px、radius16px。wrapper 的 width196 只是未测量 fallback，不能当真实菜单宽度。
- 行 height36px、radius10px、左右8px；icon20px、右边距8px。label 14px、normal、line-height22px；标题12px / 18px / medium / opacity .3，padding top8 / bottom4 / horizontal8。description 是类型元数据，当前 renderer **没有展示描述副标题**。
- source 标题为 **“引用该节点生成”**，target 为 **“添加上下文”**。菜单出现在释放指针的 client 坐标，不额外增加 trigger offset；实测菜单尺寸后对四边保留8px。
- 原完整顺序：文本、图片、视频、智能剪辑、导演台、Director Studio（region helper 当前隐藏）、逐帧拉片、音频、脚本 V2、旧脚本、参考节点。源码提供大量类型不等于本机已有这些能力。
- 本机只接 caller 提供且已经支持的 text / image / video / video-clip / audio / script-v2 / script / reference。顺序按上述源序，未知类型不凭空渲染。
- **source 脚本是一级“脚本”与二级 V2 / 旧版菜单**；target 直接 V2，旧版由 caller 隐藏。子菜单源在右侧、8px gap、与脚本行顶部对齐；子项只显示文字与 badge，不加一级图标。NEW 的 dark 背景 `#3cb5cc40` / 字 `#5ddcff`，light `#3cb5cc1a` / `#05a3c5`；Beta 使用 hover 背景与 .6 opacity。智能剪辑为 Beta。
- 非根菜单显示末尾参考节点，它仍调用同一个 `eC` / `ew` / `X` guard。**不能把显示误当许可**：`X(sourceAction,handle,newCandidate,anchor)` 的 `n` 是 anchor；REFERENCE anchor source → candidate 是特殊放行，REFERENCE anchor target 仅允许 REFERENCE。任意 anchor source → new REFERENCE 仍走 `canCreateNodeType(sourceAction,REFERENCE)`，没有绕过 disabled。此前口头把参数误读，已在 root / domain 接线前纠正。
- source disabled 为 opacity .3、not-allowed。资格和 reason 由 domain 注入；view 不从本机旧加号菜单推测连接规则，不替 caller 放行。
- 原端口菜单没有 root 才有的节点搜索、上传、历史选择与素材库入口，因此这里不加入这些功能。

## 生产接口与生命周期

新文件：

- `src/features/canvas/components/CanvasConnectionMenu.jsx`
- `src/features/canvas/components/canvas-connection-menu.css`
- `src/features/canvas/components/CanvasConnectionMenu.test.jsx`

named / default export 为 `CanvasConnectionMenu({menu,entries,onChoose,onClose})`。`menu` 保存稳定请求对象，至少含 nodeId / handleType / clientX / clientY / opener，文档或请求改变时 caller 换对象；entries 为 type / label / description / icon / disabled / reason。回调 `onChoose(type,menu)`、`onClose(menu)` 携带原 owner，便于 caller 拒绝旧请求。只有外部 pointerdown 命中普通 `.cv-node` body、且不在输入 / 按钮 / 媒体 / contenteditable / floating 等 UI 中时，关闭带第二参 `{preserveConnection:true}`，供 root 保留旧两击连接的 pending source 给紧接着的 body click；Escape、focus 与 UI pointerdown 不附此上下文，不能保留连接。view 不创建节点、不写存储，也不在选择回调返回前假定提交成功。

- Escape 关闭整个端口菜单、回到仍连接 DOM 的 opener。外部 pointer / focus 关闭保留新焦点；非 modal 不改 body overflow，不自行 inert。
- 上下 / Home / End / Tab 跳过 disabled，Enter / Space 只提交一次。右键方向键或点击可进入脚本 flyout，左方向键回一级；二级和一级范围独立。
- portal 到 opener 所属 dialog，否则 body；通过 `registerDialogChildDismissal` 共用既有 dialog-stack，子菜单先于所属 dialog 接 Escape / Tab。不开第二套 modal stack。
- 每个 owner 卸载或变化时清理 document listeners、resize / scroll listeners、ResizeObserver 和 pending RAF。关闭时先标记该 owner 已结束，回焦触发的 focusin 不重复关闭。
- 对实际尺寸、resize 和 scroll 重新 clamp；超小视口允许面板本身滚动。desktop 右侧有空间时保留源展开、左侧够时翻侧；左右都放不下时改到脚本行下方8px，下方不足则上方减实际高度与8px，避免覆盖触发按钮。上下空间也不足时限制子菜单可滚动高度。均保留8px边距与对应横向 / 纵向 gap 的透明 bridge。
- Text / image / video / audio / script 用保存的原 SVG mask，继承当前色；剪辑 / reference 接 caller icon。独立前缀规则覆盖既有 Canvas button reset，保留原 source tokens 的 dark / light 形态。

## 明确适配与待验

- 原源码二级菜单只做右侧 absolute 展开，没有此处窄屏二级布局。真实390×844验收发现旧本机 overlap clamp 把二级首项盖在“脚本”trigger上，hover后紧接着的点击误创建ScriptV2；本批改为左右都不足时上下展开，实测尺寸判定并避开trigger。此为本机可操作性适配。源旧版脚本与 V2 层次保留，无法实施的类型不伪造。
- 原 `NodeTypeMenu.onWheel` 调 `forwardWheelToCanvas`。本机菜单隔离 wheel，滚动菜单不会同时移动画布；这是延续本机 UI 拥有滚动的适配，不宣称该细节逐字等同源。
- 菜单键盘和焦点管理使用已有 shared stack，是本机可访问性维护；源码自身仅有 document mousedown / Escape 关闭，不作为原站完整键盘行为已验的证据。
- `clientX/Y` 是当前固定屏幕请求。原 wrapper 使用 canvas anchored screen position；画布平移中的锚点追随由 caller 后续核对，不能把这里的 resize / scroll clamp 当作世界坐标投影。
- 本批组件测试不等于原站账号、真实生成、权限或所有路由完成。root 集成后的 desktop / 390px 浏览器验收、原子建图 / undo / redo / 刷新持久化结果在对应覆盖清单维护。

## 本组件验证

2026-10-11 本次窄屏修复后定向 Vitest **1 文件 / 33 项测试通过**，零警告 ESLint 与 Prettier 检查通过。覆盖：source / target 和原顺序、disabled、脚本 flyout、键盘、逐层 Escape、外部焦点、旧两击连接的 body / UI / focus 区分、owner 切换、8px clamp、二级窄屏上下 / 桌面左右 / 可滚动高度 / hover再click不误选、空态、StrictMode 与卸载 listeners / observers / RAF 清理。390×844回归使用源实际面板220×296、行206×36、二级220×86尺寸，分别检查上 / 下布局与trigger无交叠；真实浏览器再次验收由 root 接线后补记。


## 世界锚点接线更新（2026-10-11）

后续caller已按module734301在open时捕获world anchor，`CanvasConnectionMenu`新增screenPosition/getScreenPosition，transform或resize更新只place、不重建request、焦点或submenu。clientX/Y保留原释放屏幕证据，future createPoint独立；blur/hidden取消为本机稳定性适配。真实滚轮平移时菜单随world移动且文本焦点保留。实际390px发现公共cv-floating叠加1px外border，采用cv-connection-menu.cv-floating覆盖，root和panel均220宽、right382、bottom836，落实8px边距。详见 [节点反馈审计](./canvas-node-feedback-functional-audit.md)。
