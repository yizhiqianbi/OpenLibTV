# 分镜组操作与标题交互验收（2026-10-11）

本批承接用户“节点交互不流畅自然”的优化要求，补齐已公开核对的独立图片分镜组操作。当前默认本地工作区，不登录、不使用小号，不运行原站写入或遥测。本批源码更新与已有线上部署分开；整个前端复刻目标仍未完成。

## 原站证据与生产边界

- [设置纯规则](./canvas-storyboard-group-controls-source-audit.md)记录比例、宫格、清空、转换、标题与成员协议；[工具栏](./canvas-storyboard-group-toolbar-source-audit.md)记录严格 standalone 入口、唯一孩子选择、布局与菜单；[拼接](./canvas-storyboard-stitch-source-audit.md)记录实际 PNG 合成与后续远端管线。接线前冲突保留在[只读审查](./canvas-storyboard-group-controls-integration-review.md)，不是当前实现状态。
- `domain/storyboard-group-controls-model.js` 只计划图；`useCanvasGroupControls` 管文档/请求/AbortSignal/确认/尺寸读取，最终通过 `useCanvasGraphActions.commitGraph` 对最新 raw graph 做 CAS。操作前后草稿和完整图只记一次历史，提交成功才改选择、通知和 fit。无关组的 preferred `childNodeIds` 不因解组/建组被重排。
- 严格独立图片组使用比例、宫格、拼接、序号、清空、转普通组、解组的源顺序；不创造无脚本的整组生成按钮。唯一直接图片孩子被选中也可展示父组操作；多选、框选、拖动、标题编辑和编辑结束200ms不展示。普通组保留既有工具条，脚本关联混合工具条未由本批完整实现。
- 宫格 fit 按源码 pending-focus 消费链核实 `padding=.2,minZoom=.6,maxZoom=1,duration=300`；普通 fit 默认范围保持 `.1–8`。比例只改实际图和尺寸，不无端移动当前视口。窄屏工具条采用8px边界/横向滚动，是本机适配，不能称源手机布局已逐像素验收。
- 标题采用内联编辑、Enter/失焦提交、Escape取消和 IME 门控。原生双击曾因外层 article 的 pointer capture 被重定向而失效；共享 `useGraphPointer` 增加可选 `clickCaptureSelector`，Canvas 仅为实际标题 span 启用，输入不进入拖动，Alt 副本继续转 board 捕获。普通共享编辑器默认行为不变。
- 完整检查捕获的偶发普通拖动失败并非单纯等待超时。诊断证明ready控件已可用、节点capture已成功，旧 `useGraphTouch` passive owner cleanup仍可能调用当前cancelPointer，释放刚开始的新手势。共享Pointer/Touch的owner重置、native监听与初始媒体模式改为layout commit完成，避免在新的可交互DOM发布后清理旧owner；不通过延迟fixture掩盖。
- 清空与转换复用公共 `EditorDialog`/dialog-stack。旧确认对象不得取消或提交新请求。自然尺寸服务可取消、超时并忽略迟到回调；已有有效 content 尺寸优先。成员/URL/尺寸签名与任务 owner 按 source 范围核对，不宣称覆盖所有外部同 ID incarnation 或全部参数改变。

## 真正生成的本机 PNG

`domain/storyboard-stitch-model.js` 管实际顺序、空格、序号、中心 cover、分辨率与落点；`stitch/runtime.js` 用浏览器 Image/Canvas 产生 PNG File。默认经实际 FileReader 生成本机媒体节点，保存 `generatorType=default`、明确 content 尺寸与 `localMediaReady`。不去除 URL 水印/处理参数，不使用一个示例冒充所有分镜。读失败按已核实规则保留黑格，整个任务取消不发布部分结果。

新图或宫格溢出提交后，`useCanvasAutosave.flushGraph` 读取已经同步发布的当前文档，立即写刚提交的 nodes/edges，避免 React 尚未渲染时写回旧图。错误保留 pending 与图状态，可撤销/导出/重试；没有远端 source 时仅提示“已在本机创建拼接图”，不会称 CDN 上传、审核或生成服务成功。

## 已完成的工程与浏览器证据

定向纯模型64项、工具栏/组视图59项、拼接模型/运行器32项；真实 NodeCanvas 联合6项包含选中孩子、比例/序号、宫格、确认取消/回焦点、清空/转换撤销与保存。Canvas/editor及图片服务联合142文件2103项通过；最终标题捕获/触摸/上传原断言联合3文件164项通过。计数集合交叉，不相加作为全工程统计。完整检查结果与失败原文在[验证历史](./verification-history.md)。

1280×720实际 `/canvas` 及直接挂载生产 `NodeCanvas` 的本地验收页面已验证：比例16:9→1:1保留视口；清空确认/取消、逐层Escape回控件、一次撤销恢复；转换普通组后撤销；点击和拖动标题不误改名，真正鼠标双击进入输入、Enter提交并恢复组焦点。标题拖动从世界坐标(140,160)到(180,213)，子节点相对坐标保留。

独立验收项目 `canvas-storyboard-controls-interaction-proof` 通过生产持久化 API 初始化三个公开真实 WebP，不经 evaluate 写 DOM/React/storage。合成器、文件读取、历史和保存均使用生产实现。为隔离同工作区正在开发的 App/HMR，后段使用 `artifacts/canvas-storyboard-controls-board.html/.jsx` 的生产组件外壳，不把它称为另一个完整 App 验收。

真实2K结果：PNG **1,750,678字节，2048×1152**；根节点位于(712,213)、显示622×350，content 尺寸与本机ready均保存。刷新后实际 img `complete=true,naturalWidth=2048,naturalHeight=1152`，改名、三张原图、序号与空格恢复。真实4K结果在图上加载为 **4096×2304**；当前 origin 的本机存储配额不足，界面提示本机存储空间不足/保存失败，4K保留当前图而未覆盖此前有效2K快照，一次撤销恢复。未将显示成功称为4K持久化成功，也未伪造服务上传。

桌面截图 `artifacts/penstudio-storyboard-controls-desktop-proof.jpg` 展示三图分镜、01–03与空格、右侧真实2K拼接含空格04和本机通知。390×844窄屏工具条实测left8/right382/width374/scrollWidth661，页面scrollWidth390；二级菜单初次覆盖主菜单，修复为左右均不足时上下展开，原生复验主菜单y254.44–487.51、二级y493.51–730.06，互不重叠。工具条横向滚动到右侧后仍可操作清空/转换/解组；清空确认Escape回清空，原图不变。

冻结后重新加载，二级Escape先回“自定义”，再按Escape回“宫格2×2”，编号点击保存后规范snapshot仍含三张图及开关。最终窄屏截图 `artifacts/penstudio-storyboard-controls-mobile-proof.jpg` 为390×844/24,468B；截图时主菜单已随工具条横向滚动到x8，因此有足够右侧空间，二级使用原左右规则。两张原始JPEG均已回读目视检查；临时26/27标签、viewport override和loopback截图server已清理，用户页面未重载。HMR期间已打开菜单曾未正常完成第二层Escape，该轮不计通过，冻结后整页重载再验通过。

2026-10-12生命周期修复后另在实际生产组件重新挂载：70%视口原生标题拖动50×35屏幕px，组world(140,160)→(211.429,210)，真正双击仍进入名称输入，Escape取消后一次撤销回(140,160)，子图保持。临时28标签和viewport override再次清理。

最终生产代码和压力回归冻结后，2026-10-12 `npm run check` **exit0，268文件/2796测试全部通过**，00:16:42开始、测试209.61s、生产构建14.94s；格式、零警告lint/架构边界和核心strict TypeScript通过。日志`artifacts/canvas-storyboard-controls-final-check.log`；定向首拖/Pointer/projection/Touch/editor联合5文件206项通过。统计含同工作区独立影游扩展，不能作为原站功能数或全部UI类型覆盖；CI未远端执行。最后只更新验证文档并检查格式，没有追加生产改动。

## 仍需另验

真实手机触摸、手机UA/Safari/原生文件选择、巨型宫格/大量节点性能、普通组通用设置、脚本混合工具栏、完整特殊 renderer、远端 CORS/上传审核、原站敏感词服务、生成/费用/权益/多人锁与运营写服务仍不由本批证明。浏览器本机容量限制继续存在；接运营服务须实现独立写 adapter 并验证，不把 localMediaReady 当服务器凭证。登录注册及账号资源继续按用户要求暂缓。
