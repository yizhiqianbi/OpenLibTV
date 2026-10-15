# 普通组缩放：实现与实际验收

2026-10-12。本记录汇总本批纯模型、pointer owner、真实 NodeCanvas 接线与本机浏览器证据。源码协议详见 [source audit](./canvas-group-resize-source-audit.md)，所有原脚本仅静态调研；没有登录、原站账号资源或原站写入。**最终全量 check 已退出0，详下方确切日志；窄屏仅布局通过，原生 resize 仍未验收。**

## 已实现合同

| 层             | 文件与职责                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 纯模型         | `src/features/canvas/domain/group-resize-model.js`：冻结 begin session，八向 project，tB finalize；返回 valid/changed/nodes/candidate/bounds，不持 React、DOM、存储、服务或历史。 |
| 父壳协议       | finalize 复用 `domain/parent-bounds-model.js`，只执行被 resize 组的直接普通 parent pF；20/56 padding，兄弟位置补偿；不递归祖父、不新增历史。                                      |
| controller     | `hooks/useCanvasGroupResize.js`：board capture、flow delta、RAF transient preview、didResize、取消和单次 raw graph CAS；提交后 flushGraph。                                       |
| NodeCanvas     | 注入真实 canvasNodeSize/getDocument/commitGraph/autosave.flushGraph；取消其他 pointer/touch/connection 手势；与弹窗、当前选择和文档 readiness 协调。                              |
| Viewport       | 接收 groupResize.nodes 作为渲染图；唯一当前选中 group、非框选、ready/非 readonly 才绘 resize surface；缩放中隐藏普通工具栏。                                                      |
| GroupNode / UI | `components/CanvasGroupNode.jsx`、`CanvasGroupResizer.jsx` / CSS：普通与 script-image 入口；四条1world边线与四个8px/radius2角柄；角柄 scale=max(1/zoom,1)。                       |

纯入口排除 truthy standalone 图片组与 linked video，允许普通组、script-image；不凭 characterAsset、单独 video subtype 或无依据字段额外排除。八方向为 top/right/bottom/left/top-left/top-right/bottom-left/bottom-right，共享纯 export，UI 没有第二套尺寸算法。

尺寸 preview 根据初始 flow 指针计算 delta 并 floor，120×80 minimum、四边/四角分别保留对侧锚点。左/上改变 group 的 parent-relative position，并反向补偿全部 direct children；nested grandchildren 不重复补偿，世界位置保持。带 extent='parent' 或 expandParent 的 direct children 提供 preview 缩小边界；结束 tB 才追加12padding，并按精确 source width/height 公式处理 overflow。source actual children 包含 hidden/temporary/reference/child-group，不由陈旧 childNodeIds 决定。

空组 stop 仅改变几何，不创建 data.nodeWidth/Height；非空组保留已有 metadata 并写尺寸 data。style、layout、membership、params、资源、selection 和 edges 不借 resize 修改。source tB 后 RF resizing:false dimensions event 的 measured 仍为 candidate，stored/data 可因12padding更大；这是有意保留的源事件次序。本机显示与下一次 begin 用 stored 优先 canvasNodeSize，避免无 RF ResizeObserver 的 measured 陈旧值改变实际壳。

controller 的 canonical 图在 preview 期间保持原 nodes/edges。每次 move 读取最新视口 flow 点，记录有效 project.changed 作为 didResize，RAF 只发布当前 owner 的 preview。pointerup 包含最后 release 坐标，finalize 后只进行一次 commitGraph CAS/undo，随后通过 autosave.flushGraph 保存已提交的实际图与草稿投影。原件没有中间尺寸保存；取消丢弃 preview，不产生历史。

owner 在 layout commit 阶段按 documentKey、ready、readonly、tool、suspended 重置；currentFor 还要求当前唯一选中 group、nodes/edges/models 原引用匹配。切文档、同ID新图、节点删除/替换、并发编辑、失 ready/readonly、其他 pointer、lostcapture、blur、弹窗接管和卸载不能让旧 move/up 覆盖当前图。Escape 清 RAF/listeners/capture，恢复仍属于当前文档的 opener/group 焦点；Space、删除、undo/复制相关快捷操作取消旧 resize。有效 pagehide 最终化并 flush；隐藏页面取消。modal takeover 后 Escape 交给顶层 dialog-stack，不再由旧 resize listener 抢走。

board capture 的 release 后 click/doubleclick 在400ms窗口内按 board/当前group/resize control 过滤。普通 fresh gesture 重新获得有效入口；不将 resize 引入新增节点菜单或强制提交正在编辑的组名。

## source 与本机适配

| 项目         | 源协议与当前差距                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| preview 提交 | 源直接写 RF changes；本机 transient preview，最终一次 CAS/undo，是本地事务与取消适配，不声称 collab/save 序列相同。                                                                                                     |
| 尺寸来源     | 源 XYResizer internal measured、tB.tm measured??stored??200×120；本机注入实际 canvasNodeSize，使 DOM/命中/显式媒体尺寸一致。原始字段及 measured 事件差别保留。                                                          |
| 可见入口     | 源 eN 可由 reference/mark/focus target override；本机当前实际接线是唯一选中当前组且非框选。未把静态 source override 全部标为本批完成。                                                                                  |
| snap         | 源 aT 决定 snapToGrid，绝对 flow 点按12网格 snap 后作差；当前 caller 使用已接最新视口 flow point，没有额外创造 snap 行为。                                                                                              |
| 键盘 / ARIA  | source control 为 div，没有确证键盘 resize graph 协议。本机中文 aria 的 button/tabIndex=-1、Escape/焦点恢复是可访问性适配，没有假造方向键尺寸写入。                                                                     |
| 特殊图       | 非零 nodeOrigin、group 自身 parent+expandParent 的父/兄弟扩张协议尚缺，begin 明确 invalid。shot-breakdown/long-video 特殊 direct parent 需独立 regrid/relayout，exact predicate begin 返回 unsupported，不能套普通 pF。 |
| 服务         | resize 不需要真实生成、费用、认证或团队服务；其他 group 的生成/工作流服务仍按各域能力门控。                                                                                                                             |

本批 v1 batch-video 调研已纠正：逐镜时长及选图不属于已核对的 v1 caller，未在本批冒充已实现。该研究纠正不改变普通组 NodeResizer 的已验收范围。

## 专项测试证据

- 纯模型69项加已有 parent-bounds41项：2文件110项通过，02:23:56 / 532ms，日志 [canvas-group-resize-model-tests.log](../artifacts/canvas-group-resize-model-tests.log)。此前59项只是加父壳协议前的历史结果，不能当最终数量。
- 批次联合专项：**6文件125项通过，02:24:42 / 4.21s**，实际日志 [canvas-group-resize-final-joint-tests.log](../artifacts/canvas-group-resize-final-joint-tests.log)。这是当次冻结组合日志，不能自行推导为之后所有新增断言或全项目结果。
- release click/focus 专项：2文件20项，02:23:19 / 3.31s，日志 [canvas-group-resize-click-focus-tests.log](../artifacts/canvas-group-resize-click-focus-tests.log)。

纯模型覆盖八向正负/floor、minimum/extent、世界位置/父壳/兄弟、准确 tB/事件次序、empty metadata、didResize/完全阻挡 no-op、caller 尺寸与 invalid 原子拒绝。controller/真实 NodeCanvas 测试保持 canonical preview隔离、release坐标、once CAS/undo、pagehide、pending prompt、取消焦点与迟到回调强断言；UI检查角柄/边线缩放、方向 delegation 与被排除组入口。测试夹具不代表真实服务已接入，也不代替下面的原生浏览器验收。

## 原生桌面实际结果

Root 使用实际 NodeCanvas 浏览器，桌面宽1280；以下数据是其本批实际操作记录，非纯模型推导。

1. bottom-right 从屏幕(600,415)拖至(664,455)：group 最终 parent-relative=(180,210)，stored width=588、height=272，孩子世界位置不动。
2. board capture 后，在(664,455)双击曾实际误开新增菜单。已修复 release 后 board click/doubleclick guard；同动作再验没有菜单。不能仅凭 control 自身 stopPropagation 当问题已经解决。
3. top-left 从(195,239)拖至(275,299)：source child constraint 加 tB12padding 后 group=(204,264)，stored width=564、height=218，measured=(552,206)。两个孩子局部位置分别(12,12)、(248,12)；A屏幕位置(222.8,290.8)不变，与 source measured/candidate 次序一致。
4. 一次 undo/redo、刷新后 storage 恢复均实际通过，原 prompt 保留。没有为缩放生成重复历史。

桌面 proof [penstudio-group-resize-desktop-proof.jpg](../artifacts/penstudio-group-resize-desktop-proof.jpg) 已由 Root 实际 view_image 回读，1280×720，四角手柄、蓝色组壳与两张原图可见。操作坐标/历史/存储仍以其实际读取记录为证据，不单靠截图推断功能。

## 窄屏边界与最终全量检查

窄屏390×844的 DOM 布局已验：document width/scrollWidth 均390，无横向页面溢出；角柄8屏幕像素；toolbar left=8、right=382、width=374。**窄屏原生 resize 未验。** 多个普通按钮及 DOM click 未产生可核实的状态变化，重建40→41页后也同样；这一现象不能证明功能通过，尚未确定是产品还是工具问题。不以 dispatch 测试填补原生验收。本批没有 mobile proof；成功操作、实际尺寸、世界位置与窄屏截图需以后补录。

首次 `npm run check` 的 format/lint/core typecheck 完成；Vitest 279文件3051项中278文件/3050项通过，仅 `services/interactive-film/export.test.ts:188` 的旧 aggregate textContent 断言失败，实际 ending 新增标题“结局”导致总文字变化。日志 [canvas-group-resize-initial-check.log](../artifacts/canvas-group-resize-initial-check.log)，02:28:03 / 91.46s。该次未通过，不能把 resize 无失败当全量完成，也未进入 build。

Root 对 film 断言精准改为 h2/p/script===null，保留全部 Canvas 断言；专项2文件16项通过，02:36:09 / 1.14s，日志 [canvas-group-resize-film-export-followup.log](../artifacts/canvas-group-resize-film-export-followup.log)。不是提高 timeout或放宽 resize 坐标验证。

最终 `npm run check` 已由 Root 收到退出0：format、ESLint零警告、核心strict typecheck、**280文件3058项测试全部通过**，02:37:29开始 / 90.56s；生产构建10.33s完成。日志 [canvas-group-resize-final-check.log](../artifacts/canvas-group-resize-final-check.log)。这些数字是最终整个工作区检查，包含并行 film 域新增文件/测试，不能称为本批节点专项数量。源码检查通过不代替窄屏原生 resize 验收，也不代表真实服务或全站功能已完成。

Root 已关闭本批临时38/39/40/41页，恢复 viewport 和 visibility=false；5198 proof server Ctrl+C退出130，lsof确认无 listener。用户原有 Vite5173保留。窄屏原生交互缺口继续维护，整个前端功能复刻目标未因此标记完成。
