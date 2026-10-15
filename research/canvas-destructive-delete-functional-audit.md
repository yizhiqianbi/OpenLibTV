# 节点、连线与确认删除验收

后续脚本/分镜组单边断线已由 [新验收](./canvas-storyboard-unlink-functional-audit.md) 接入，最新393/5459与1161冻结独立于下述388/5370历史。mixed batch、VIDEO_CLIP异步时间轴前端与原锁仍缺，下文当时缺口不可直接作为最新状态。

2026-10-14。继续用户要求的节点交互优化：普通键盘删除、节点菜单删除、连线双击与生成器参考删除共用整图规则，输入、引用、历史和保存同时接受。本批只更新本机，不登录、不使用小号或原站账号资源，不发布生产。此前 [普通参考删除](./canvas-reference-delete-functional-audit.md) 的 379／5193 是独立历史快照；本批不代表所有节点交互或全站复刻完成。

## 来源与可证明范围

[整图 source 审计](./canvas-destructive-delete-source-audit.md) 与 [source proof](../artifacts/canvas-destructive-delete-source-proof.json) 保存 10 个原文件、95 条片段；[抓手键盘来源](./canvas-delete-keyboard-hand-source.md) 与 [对应 proof](../artifacts/canvas-delete-keyboard-hand-source-proof.json) 保存两文件、四条片段。独立 [静态验证](../artifacts/canvas-destructive-delete-source-validation.json) 实际重算两份 proof 的 12 条文件记录（11 个唯一文件）、99 条片段的 UTF-16／Unicode code point／UTF-8 坐标、原文及 SHA，额外 19 条 locale 值全部一致，零失败。原站脚本仅只读调研，未执行其写逻辑。

来源明确区分 UI 和 raw store：UI 删除 `group`／`video_group` 沿 parentId 删除整子树；普通解组和 raw 删除释放剩余孩子是另一条行为。UI 仅对直接父组处理缩小／剩一项解散，按照源 zoom padding 和先全部尺寸、后全部子位置的调用顺序，不递归套另一种布局；p2 图片分镜组维护真实 childNodeIds 与行绑定。最初两个嵌套字段顺序回归失败已修复，不把覆写嵌套尺寸当源行为。

`generator/reference-recalculation-model.js` 持有旧 mode／model 下的 collector、稳定 token 重编号及特殊分支：submitted segment 丢来源先移除 SegmentRange／锁和 draft；pictureEdit 丢最后视频按源整体重置参数；editing continuation 按原直接边做一次扩展删除；panorama 用首展开图片；script 样式、material-style、material-lens 分别按其字段与比较规则更新。边删除维护 characterAsset 的 persisted characterReferences；节点删除和 editing 级联不伪造该边专属清理。旧 typed 合法空数组与缺字段兼容不混同。以上为纯状态与实际 App 接线，不等于全部特殊 renderer 已原生验收。

## 工程与输入事务

`domain/destructive-delete-model.js` 只计划图，`useCanvasGraphActions` 读取 writable owner、投影全部最新草稿、检查 raw graph CAS，成功后一次历史及图发布，再消费明确改写的普通 prompt。失败不预先取消输入、不制造历史；存储配额失败由既有保存重试保留已接受图。`reference-actions-model` 先解析实际首边／组排除，再复用同一边删除及重算入口；不另写一套 locks/token 清理。

`useCanvasDrafts` 第五参 accept bridge 用于取消旧 timer／接受已提交正文；script-generator 普通 prompt 与 default script rows 按实际 draft 结构区分，不能用 channel 名猜类型。成功投影缓存 draft kind：之后读取短暂失败仍消费已确认的普通 prompt，保留真实 script rows，防止下次恢复读取把旧 token 写回。这一 P2 有两项修前失败和修后真实 hook／App 回归。删除节点退休其全部草稿渠道，失败和旧 cleanup 不可删新 owner。

确认规则／owner／view 分别位于 `batch/deletion-confirmation-model.js`、`useCanvasDeleteConfirmation.js` 和 `CanvasDeleteConfirmation.jsx`，共用 EditorDialog／dialog-stack。键盘优先脚本、旧关联组、片头视频；普通 URL 媒体键盘删除不弹窗。菜单按 source 单独判断内容，不以当前多选替代菜单 nodeId。打开后只允许源确认允许的 prompt／位置变化，model／settings／locks 变化使请求失效；取消无图修改，失效文档 A→B→A 不复用旧请求。exact 文案已核对，原确认 chrome 像素尚未独立核实。手型／Space 按实际 tool 门控 Delete／Backspace；portal 与 SVG path 隔离 pointer/click，双击不会先清选区或误开添加菜单。

两处明确的本机适配：raw 释放嵌套子节点采用完整世界坐标以维持现有文档不变量；删除组内孩子时，额外只重算仍存在祖先组的真实非 virtual 外部消费者，采用有界 opt-in `reconcileGroupConsumers`，不扫描全部目标。原 source 不自动执行后一行为，不能把授权的交互一致性优化描述成原版代码。

## 自动验证与冻结

实际 App 证据见 [整图 App 审计](./canvas-destructive-delete-app-audit.md)、[确认审计](./canvas-delete-confirmation-audit.md) 与 [独立事务复核](./canvas-destructive-delete-transaction-review.md)。整图 App 15 项包括最新输入、选区／DOM、组与嵌套组、锁分支、连线、bounded consumer、保存失败；确认 App 七项包括脚本输入／rows、取消／确认、菜单真实 owner、旧关联组与片头视频。专项集合重叠，不累计成新增总数。

| 证据                                                                                        | 实际结果                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [整图修前 App](../artifacts/canvas-destructive-delete-app-before-fix-tests.log)             | 最初两项实际失败：删源残留 token、删组只删壳；强图／输入断言保留                                                                                                   |
| [嵌套顺序修前](../artifacts/canvas-destructive-delete-nested-before-fix-tests.log)          | 29 项中两失败，揭示源字段 patch 顺序                                                                                                                               |
| [character 修前](../artifacts/canvas-destructive-delete-character-before-fix-tests.log)     | 32 项中两失败，揭示边专属 persisted metadata 未清                                                                                                                  |
| [纯图修后](../artifacts/canvas-destructive-delete-character-after-fix-tests.log)            | 4 文件／145 项通过：纯图32、重算48、既有 token53／incoming12                                                                                                       |
| [draft consume 修前](../artifacts/canvas-destructive-delete-consume-before-fix-tests.log)   | 两失败／12 skip，第四次读取错误后旧普通输入第五次复活                                                                                                              |
| [draft consume 修后](../artifacts/canvas-destructive-delete-consume-after-fix-tests.log)    | 8 文件／140 项通过，保留 script rows 及错误恢复强断言                                                                                                              |
| [手型修前](../artifacts/canvas-destructive-delete-hand-before-fix-tests.log)                | 四失败／九 skip，普通手型／Space 键盘门控缺失                                                                                                                      |
| [手型修后](../artifacts/canvas-destructive-delete-hand-after-fix-tests.log)                 | 3 文件／35 项通过：keyboard13、整图 App15、确认 App7                                                                                                               |
| [确认联合](../artifacts/canvas-delete-confirmation-final-joint-tests.log)                   | 6 文件／78 项通过；模块51、确认 App7、整图 App15、当时 draft5；后续 draft第六项纳入最终 check                                                                      |
| [第一次正式检查](../artifacts/canvas-destructive-delete-before-group-expectation-check.log) | 388 文件／5370 项中仅旧组例失败，5369 通过；测试阶段终态 exit1，build 未运行，不称全量通过                                                                         |
| [旧组例 source 对齐](../artifacts/canvas-destructive-delete-group-source-aligned-tests.log) | 03:31:52／4.60s，3 文件／24 项通过；旧例改为真实 UI 删除子树，完整原图、undo、redo、unmount 持久化强验                                                             |
| [最终正式检查](../artifacts/canvas-destructive-delete-final-check.log)                      | Node24.19.0，session34383 terminal exit0；388 文件／5370 项全过，03:32:29／170.04s，格式／零警告 lint／架构边界／核心 strict／build16.77s，Vite7.3.7／3573 modules |

[当前源码快照](../artifacts/canvas-destructive-delete-current-source-snapshot.json) 冻结 1150 路径，相对旧 1135 有 14 个新源／测试文件，另将既有 `.github/workflows/check.yml` 纳入覆盖；不是 15 个新实现文件。旧 source/config 中 14 项变更含最终旧组测试，无删除；CSS／package／lock／分包配置不变。[最终构建证明](../artifacts/canvas-destructive-delete-final-build-proof.json) 读取本次终态成功后的实际 dist，核对 ESM closure、真正 lazy 实现、旧 CSS 字节／8+23 导入级联、依赖与既有 900000 阈值。strict 仅核心 TypeScript，CI 未远端执行，DEP0129／jsdom 媒体通知保留。最终维护后源码不变见 [post-doc proof](../artifacts/canvas-destructive-delete-post-doc-proof.json)。

## 真实浏览器

独立后台 own tab4，`/canvas?projectId=canvas-destructive-delete-native-20261014`，默认1280×720。两张已存在公开 webp 通过真实 chooser／FileReader 上传，拖真实端口连到 VIDEO，按钮实际插入 `{{Mixed 1}}{{Mixed 2}}`。图通过 GUI “导出→画布文件”保存，不注入 storage／图／事件；read-only DOM 只测控件与连线几何。

[native proof](../artifacts/canvas-destructive-delete-native-proof.json) 重读 16 份完整 GUI 文件逐字段强比较：抓手 Delete 完全不变；选择工具删除第一 IMAGE，仅其节点／边与目标精确 source params 变化，正文成为 `{{Mixed 1}}`，model／settings／advancedSettings／旧 mode 保留；一次 undo 完全等 before，redo／cold refresh 完全等 after。实际打组后 Delete 删除 group 和两孩子／内边，undo 完全恢复；脚本实际输入“删除确认验收：保留最新创作输入”，Escape 取消完全不变，确认只删脚本，undo 完全还原完整图与输入。实际双击剩余普通连线，只去一边／清目标引用，全部节点和其他字段不变，undo 完全等 before。

390×844 使用同一 GUI 项目 fit 后选脚本：确认框 x24／right366／width342／height185.59375，页面 clientWidth／scrollWidth 都390，取消后实际 activeElement 为原脚本 shell。临时 viewport 已 reset；[桌面确认截图](../artifacts/canvas-destructive-delete-native-confirm-desktop.png)、[390确认截图](../artifacts/canvas-destructive-delete-native-confirm-390.png)、[最终预览](../artifacts/canvas-destructive-delete-native-final.png) 已保存并检查。最终 [console](../artifacts/canvas-destructive-delete-native-console.json) warn／error 为0。导出会 flush 输入，原生结果不声称150ms race；该 race 有实际 App／hook证据。Space 持续按住的门控只有自动回归，未声称原生持键或物理手机。

## 尚未完成

source script／关联分镜组“断开连线”确认与 `unlinkStoryboardByEdge` 尚未接到 SVG 边操作；VIDEO／AUDIO→VIDEO_CLIP 异步 mD 时间轴清理和锁／writer／fresh project 分支仍缺。当前 CAS 与一次明确历史是本机协议，不等同原站服务锁、pending／microtask history 合并或远端权限。全部特殊 renderer、角色初始 adapter、完整 focus／lens／style 操作 UI、task 总线、真实生成／费用／运营上传／审核／协作／支付和服务器权限尚未完整；真机 touch／Safari／高DPR／大图及全部原站路由状态继续另验。登录注册与账号资源继续按用户要求延期；本机没有部署，不覆盖独立影游冻结生产，整个复刻目标保持进行中。
