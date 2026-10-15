# 普通组与脚本关联组接线审计

2026-10-12。此记录先检查本批修改前的生产调用，再列出接线建议。源码仅静态读取，不运行原站脚本、不登录、不使用账号资源、不写入原站。本次没有执行全量测试或原生浏览器验收；桌面及 390px 结论区分静态风险与已实测结果。

## 证据范围

字符偏移为保存脚本的零基准字符位置，不是行号。

| 源文件                                                                      | 证据                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `research/source/3u6hjewm8qox_.js`，约 756618–795000                        | `tm` 尺寸、`tf` 顺序、`tH` 网格、`t1` 普通布局、组 renderer、标题、颜色、解组、普通运行与分镜重生成分支。 |
| 同文件，约 813869–820500，module 970683                                     | `GroupNodeToolbar`：颜色、布局、执行、工作流、转分镜组、解组及整组下载。                                  |
| 同文件，约 679719–680303、762199、790936–795000                             | 单选/框选门控、standalone 单独选中图片孩子的入口、工具栏分型和标题编辑抑制。                              |
| 同文件，约 71900–73200、1526760–1527500                                     | `unlinkStoryboard` 与 `clearStoryboardGroupLayoutState`。                                                 |
| `research/source/21_0xvlvkw1sz.js`，约 118050–125433、836348–851700、967663 | 实际 node context menu 和 action builder；未发现组“节点设置”或组生成器设置面板入口。                      |
| 同文件，约 776649                                                           | `iw` 解组：快照、协作 Serial、清孩子分镜布局字段、脱离父组、删除组。                                      |
| `research/source/0leiedr1esdbe.js`，108250 附近                             | `ungroupNodeSerial` 协作锁/allow-list/flush 协议；本机没有此多人服务，不冒充已接入。                      |

## 修改前的具体缺口

| 当前调用                                                                                                                         | 确认的缺口及影响                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CanvasContextMenu` 对任何 `context.nodeId` 显示“节点设置”；`NodeCanvas` 仅在 `!isCanvasGroup(activeNode)` 时渲染 settings panel | 对组点击该项会关闭菜单但没有面板。原 source node menu 也没有这一组入口。应按真实 context node 类型隐藏该项，不能创造通用 group generator panel 来填空。                                                                                                                               |
| `CanvasGroupNode` 非 standalone 的 `<select>` 和“整组执行”                                                                       | 原站是 `GroupNodeToolbar`，颜色、下载、工作流、转分镜组、菜单互斥和执行状态均不等于旧原生 select。普通标题没有源的改名/角色名称回退；普通栏也没有接入现有 `controlsVisible`。                                                                                                         |
| `!storyboard && active` 渲染旧栏                                                                                                 | `active` 不保证唯一选择，也未使用框选/拖动/标题编辑抑制。可能多组同时显示，拖动期间仍显示。源 host 用 `eN` 单选门控；拖动隐藏由 `NonScaledWrapper` 的 `hideWhenDragging` 承担。                                                                                                       |
| standalone 且 `sourceScriptNodeId` truthy                                                                                        | 专用新栏被 `!sourceScriptNodeId` 排除，旧普通栏又因 `storyboard` 排除，导致没有组工具栏。源 renderer 的 standalone image 分支仍渲染 `ts`，以锁定比例/专用运行 props 表达脚本关联状态。                                                                                                |
| 非 standalone 脚本关联图片/视频组 → `onGroupRun` → `BatchRunDialog`                                                              | 现有普通流水线 dialog 没有 source 分镜重生成的目标选择、脚本配置投影、停止/费用提示策略。缺少 executor 时本机明确 blocked 是正确能力边界，但不能将此路径验收为脚本关联组生成。                                                                                                        |
| `layoutCanvasNodes(...,{groupId})`                                                                                               | `childNodeIds` 部分列表会遗漏实际孩子；空数组阻止实际成员回退；单孩子直接返回；存储 `data.layout` 而非 source `groupLayoutMode/nodeWidth/nodeHeight`；组尺寸优先 stored→measured，source 为 measured→stored→200/120；网格未使用 `storyboardManualGridCols`、未清 style width/height。 |
| `useCanvasSelectionActions` 旧 `change` 路径                                                                                     | 计划取 render props，而不是同步最新 graph。`change` 拒绝/失败后 duplicate、remove、group、ungroup 仍可改变 selection/panel；旧回调跨文档读取 latest props，缺少调用者文档 ownership。                                                                                                 |
| 普通 toolbar 定位                                                                                                                | 当前组内 absolute/inverse zoom 的旧栏没有窄屏 clamp 或横向滚动；390px 溢出是静态可见风险，本批未做真实手机验证。新 standalone toolbar 的 portal/clamp 可复用，但属于本机适配，source 原 `GroupNodeToolbar` fixed body menu 未显示完整窄屏 clamp。                                     |

`groups.js` 的普通创建/解组现已只 reconcile 受影响父组，不再重写无关 standalone 的 `childNodeIds`；此前全图重排风险不能继续报告为当前缺陷。

## Source 分型和布局

renderer 先选 character toolbar，再选 strict standalone image `ts`，其他组走 `GroupNodeToolbar`。`sourceScriptNodeId` 与 `storyboardGroupType` 决定脚本关联 image/video 行为；一个“分组”按钮不能消除这些类型差异。标题回退为 name → character roleName → label → 分镜图/分组。

普通 source 布局使用全部 actual direct children。`tf` 只有 preferred ID 列表完整覆盖成员时采用它，否则按名称 numeric 排序。横向/纵向从 `(36,66)` 开始，间隔 36，使用每个孩子 measured→stored→200/120；仅空组无布局。组 flow/measured 尺寸与 `data.nodeWidth/nodeHeight/groupLayoutMode` 同步，保留其他 style。普通 grid 使用最大孩子尺寸、36px 间隔和手动列数，写完整 `childNodeIds`，移除 group style width/height。standalone grid 的 4px 间距、显式内容尺寸、比例、容量与 slot 协议不能套到普通组。

普通转 standalone 源要求实际 direct children 非空且全部 IMAGE，默认 16:9、统一图尺寸和 grid 元数据；源 `t$` 清 script row/task 字段的行为只属于转换，不等同普通解组。

## Source 执行、解组与服务边界

普通 `tO` 运行流水线。关联图片 `tU` 先从脚本解析 source rows / imageGenConfig，构造缺图或失败图的 source run plan，投影被执行节点的参数后 `tF`；视频 `tG` 有独立 plan。v1/v2 虽然可能显示“重新生成”或“整组执行”，实际计划仍有类型差异。sourceVersion、已运行状态及剩余数量决定停止确认和费用提示。没有真实 generation/费用 adapter 时必须保持不可用或明确本机计划能力，不能拿普通 batch 返回值冒充生成成功。

源工具栏 `tL` 在解组前重置普通 pipeline 状态，并调用 `unlinkStoryboard`。后者仅在 source script 的 `linkedImageGroupId` 或 `linkedVideoGroupId` 等于被解组 ID 时清该字段；默认删除 script→group 边，并清待移除 group 的 source/title 字段。**该 helper 不清孩子 `scriptRowHiddenUuid`，也不修改脚本 rows。** `iw` 另对解组 direct children 调用 `clearStoryboardGroupLayoutState`：marker 为 true 时删除 `_explicitContentDims/contentWidth/contentHeight`；仅 `params.scene==='group-generate'` 时删除 scene，其余数据保留。

source `iw` 将孩子 parentId/extent 清空并以 group.position + child.position 脱离。现有本机 `ungroupCanvasNodes` 对嵌套组重新挂到仍存在的祖父组并保留世界位置；这是已有本机协议，当前源码片段不支持将它描述成完全相同。协作 edit locks、pipeline reset 与 flush 服务仍须单独 adapter；单次本机 graph CAS 不代表这些服务已实现。

## 可复用公开入口与建议

| 入口                                                                                       | 可复用范围                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCanvasGraphActions.commitGraph(next,{expectedGraph,historySnapshot})`                  | 同步最新 raw graph identity 比较、草稿投影、一条 undo snapshot 和 boolean 结果；比旧 `change` 更适合组多字段提交。                                                                 |
| `useCanvasGroupControls.command(groupId,command)` 的 owner/CAS、确认和异步任务框架         | 可增加普通组明确分支。现有 `planStoryboardGroupControl` 除 rename 外有 strict standalone gate；不能直接删 gate 让普通组进入 4px 布局/ratio/转换规则。                              |
| `StoryboardGroupToolbar`、`useAgentToolbarPopover`、共享 dialog-stack                      | portal、互斥 popover、Escape 回焦点、外部 pointer/focus 关闭、title owner 可复用。普通 toolbar 必须按 module970683 独立内容/资格渲染；standalone 列行/ratio 菜单不是普通布局菜单。 |
| `createCanvasGroup` / `ungroupCanvasNodes` / 世界坐标 helper                               | 普通相对 parent 几何和局部 affected-parent metadata；解组 source layout cleanup/脚本 unlink 应作为精确投影加入同一提交。                                                           |
| `storyboardGroupPendingPlan` / `resolveStoryboardImageShots` / `storyboard/graph-plans.js` | 部分缺产物、脚本 binding、真实图匹配和创建协议；当前 pending plan 不等同 source imageGenConfig 及全套重生成计划，不可直接宣称已完成。                                              |

建议把普通 layout/颜色/转换纯规则放在小型 domain planner，组 controller 根据 source subtype 选择 planner；selection hook 的 group layout 只委托 `onGeneralGroupCommand(groupId,{type:'layout',mode})`。virtual selection 的独立 100px 布局继续保留，不改变为组内 36px 布局。

selection action 可注入 `getDocument()` 与 `commitGraph()`：从实际最新图规划，传 raw expected graph，只在严格 `true` 成功且当前文档仍有效后发布 selection/panel。旧 caller 没有 writer 时保留既有 `change` 的 undefined 成功兼容，不把该 fallback 描述为强 CAS。迟到旧 A action 不能操作 B 的同 ID 节点；切只读/未 ready/卸载阻断所有写入。download 等异步任务继续保留各自 AbortSignal，不扩大至服务器写入。

## 本批后续与验收边界

Root 已授权分别补普通纯规则/controller、工具栏及本审计所属 context/selection 接线。此审计记录的是修改前缺口；实施后的实际测试结果应另写冻结补充。真实工作流服务器、收费生成、多人锁/flush、字符资产工具栏和完整 source context menu 不在本次只读结论中宣称完成。

### Context / selection 接线冻结补充

2026-10-12 01:32:39（本机）。本审计所属修改已落盘：`CanvasContextMenu` 接收 Root 提供的实际 `contextNode`，组隐藏无效 settings；selection hook 接收 `getDocument/commitGraph`，graph writer 必须返回严格 true，成功后才更新 selection/panel；旧 callback 保留创建时文档 key。group layout 委托 `onGeneralGroupCommand(groupId,{type:'layout',mode})`，virtual selection 继续自己的布局；解组按上述 source unlink/layout 字段清理，不删 row refs，保留既有嵌套重新挂父的本机协议。duplicate/remove/group/standalone 创建复用同一提交与 owner guard。旧未注入 graph writer 的 caller 保留 `change` undefined 成功兼容。

`downloadAll(ids,{groupId})` 额外记录启动组身份，`downloadState.groupId` 随进度保留；换选另一组不能把旧 ZIP 进度展示成新组任务。原下载取消/迟到结果 guard 保留，内容仍取启动时实际 graph。

定向 `CanvasContextMenu.test.jsx` 5 项、`useCanvasSelectionActions.test.jsx` 31 项，共 **36/36** 通过；四个 owned JSX/JS 文件 ESLint 零警告，Prettier 已格式化。回归包含最新并发节点/边、规划后 CAS 变化、false/undefined/throw 拒绝、旧文档同 ID、raw readiness、卸载、同一 React render 前两次同步提交、source unlink/字段保留和组下载身份。本批此部分没有执行全量检查，也没有宣称 Root controller/UI 的新普通组功能或原生窄屏已验收。

### 新接线只读复核与草稿复制补充

随后复核 Root 新接的 NodeCanvas / CanvasViewport、普通纯计划、脚本组确认及共享控制器。最新 raw graph → planner → `commitGraph` → 同步 currentDocument → `flushGraph` 的链路保持一条历史与已提交图持久化；脚本关联 group 不再送普通 BatchRunDialog，而走独立确认，实际生成按钮禁用且明确服务未接，不伪造执行成功。旧 document callbacks 使用捕获 key；group ZIP 从当前 raw group 重读 IDs，进度只显示启动组。

发现并获授权修复两项 selection 缺口：普通 duplicate 原先在 raw IDs 上克隆后才 project，导致新 copy ID 丢最后 150ms 草稿；现增加 `projectGraph(snapshot)`，先投影 originals 再复制，CAS 仍比较 raw graph。投影失败保持图/选择；复制和原节点携带最后输入，undo 的原图也保留该输入。下载取消新增独立 owner `{controller,documentKey,groupId}`，`cancelDownload(groupId?)` 隔离旧文档及不匹配组；无 string 参数保留 virtual selection 的当前任务取消。

2026-10-12 01:40:50，owned selection **39/39** 加 context **5/5**，共 **44/44**（单 worker）通过，含真实 `useCanvasDrafts` / `useCanvasGraphActions` / snapshot history 的复制草稿回归、投影失败/中途 graph 改变、旧文档取消新任务、同文档另一组取消及通用取消。先前五文件联合为 74/77，失败包含两个 NodeCanvas timeout/上传预览及 owned history 夹具断言；owned 夹具已按 snapshot 合同修正，两个 NodeCanvas 失败项随后单独定向 **2/2** 通过（01:40:58，23 skipped）。不能把后次通过作为先前失败原因的证明，没有修改 NodeCanvas 测试、timeout 或配置，也未执行全量检查。

尚需明确区分的前端缺口：当前 `onGroupBatchGenerateVideo` 仅提示服务未接，源 eM 的 model/settings/逐镜时长/选图面板仍缺，不能仅概括为“生成服务未接”；工作流创建/更新只提示边界，character toolbar、ordinary NodeResizer 和真实运行停止状态仍须分别验收。只读另发现无 style 的非 standalone linked image 被 renderer 错用深色壳（source module713841 只 standalone image 或 linked video 深色）；Root/UI owner 随后已按确切 predicate 修复，本审计未修改该视图，也不将其静态复查描述为原生验收。最后 owned hook/test ESLint 零警告、Prettier check 通过。
