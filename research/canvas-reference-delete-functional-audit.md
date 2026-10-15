# 普通节点参考删除与输入恢复验收

2026-10-13。用户要求改善节点交互。本批继续在已有定位、拖动和排序优化上修复普通参考删除：删除后清理相应媒体 token、按稳定来源重编号，输入、图和撤销一致。本机更新，无登录、小号、原站写入或部署；不把本批普通分支视为整个节点系统或全站复刻完成。

## 1. 修复与源码范围

此前本机删除仅断参考边并保留 literal prompt，已删素材因此留下 missing badge。完整归档链确认这不是 ordinary source 的最终结果：`useDeleteGeneratorReference` 先删首条直连边，或按组完整 leaf 数量排除子项／删组边；store `ig` 再按旧、新稳定 nodeId 清理与重编号。旧 IMAGE 排序 only-order 规则继续有效，不能扩为 IMAGE 删除也保留 token。

独立 [源码审计](./canvas-reference-delete-source-audit.md) 与 [source proof](../artifacts/canvas-reference-delete-source-proof.json) 保存 13 个原文件、79 处摘录，区分 UTF-16、Unicode code point 和 UTF-8 的半开区间，并核对原文件与摘录 SHA。归档只读，不执行原脚本或请求其写接口。事务复核见 [独立 review](./canvas-reference-delete-transaction-review.md)；真实 App 的强断言与修前失败见 [App 验收记录](./canvas-reference-delete-app-review.md)。

本批普通协议：

- `reference-reconciliation-model.js` 分开 ordinary incoming reconciliation 和 VIDEO reorder；前者删除 recognized unknown／已失去来源的 `Image/Portrait/Video/Audio/Mixed` token，后者保持其源独立的非法 token 规则。重复 occurrence 全部处理，稳定 nodeId 不借当前 DOM 编号猜测。未知 `Text/Element/Magic/Camera` 等原文不由媒体正则清理。
- mixed 转换按**操作前**的 mode/model 门控，不借删除后推断的新模式。旧 typed arrays 合法时优先使用，包括显式空数组；仅 absent／非法列表使用本机可见列表兼容旧文档。old mixed 根据旧 typed 与 order 构建，不把保存的任意 mixedList 当原映射。保留源空白清理顺序、Map 最后值和请求顺序语义。
- `reference-incoming-model.js` 按源 edge 顺序、virtual/reference 排除、parentId 递归和 depth 8 展开收集。组的 leaf 数量包含非媒体及没有 URL 的孩子，不用 UI 可用素材数代替。保留规范 `asset://` stored refs、首个 URL 和源 metadata；不把 target.refImages 或 UI focus 排除规则机械套入 store collector。
- 删除只移除首条直连 edge；不删除素材 node。组最后 leaf 才移除组 edge，并清理该组的排除项；其余 leaf 只增加对应 excluded ID。没有匹配 edge／组时，包括独立 stored asset URI，返回 no-op，不创造另一套参数删除 writer。
- `useCanvasGraphActions.deleteReference` 先取得最后输入并清理孤立 Magic metadata，previous 历史包含最后草稿，next 通过 `explicitPromptNodeIds` 保留已算出的正文，其他节点草稿照常投影。一次 raw graph CAS、一次 history；拒绝或投影失败保留原草稿／竞争图。
- Inline 只有成功后重读同一当前文档的实际 raw prompt，并调用 `acceptCommittedValue`。消费输入草稿、取消旧 debounce，不新增 onChange／历史；修复清理结果恰等旧 baseline 时被旧 timer 再次写回的碰撞。
- Role 删除的最终 after 同样使用共享 collector 和 reconciliation。Role 初始 UI／容量 adapter 仍有本机差异，未称所有角色链已经 source 等价。

## 2. 回归与失败记录

新实际 App 文件只有内容读取目录 mock，使用真实公开 models、稳定 actor、真正 lazy generator、输入 DOM／codec、GraphActions、drafts、history、autosave 和 localStorage。操作发生在实际编辑器 mount 后的冻结 debounce 窗口；200ms 和 pagehide、输入 identity、节点／边／view／选择、整图 undo／redo 均保强断言，不把 jsdom 当原生布局或媒体播放。

| 档案                                                                                                 | 实际结果与意义                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [修前 App](../artifacts/canvas-reference-delete-app-before-fix-tests.log)                            | 03:03:52／2.89s，1 文件 8 项全部失败；六个首／中／尾和两个 baseline 碰撞均因 source 正文清理预期失败，图／历史强断言保留                                                           |
| [初接线](../artifacts/canvas-reference-delete-first-integration-tests.log)                           | 16:12:46／3.65s，4 文件 25 通过／3 失败；三处旧 missing-token 断言按完整 source 纠正，不误报 fixture 故障                                                                          |
| [source 对齐联合](../artifacts/canvas-reference-delete-source-aligned-integration-tests.log)         | 16:15:18／8.24s，实际 6 文件 62 项；命令所列不存在的旧 Role hook 路径没有运行，不能记 7 文件                                                                                       |
| [Role 最终共享 collector](../artifacts/canvas-reference-delete-role-shared-reconciliation-tests.log) | 16:19:53／3.57s，3 文件 57 项；真实 graph22／hook23／App12，不与其他重叠集合累计                                                                                                   |
| [最终纯模型与 owner](../artifacts/canvas-reference-delete-final-model-owner-tests.log)               | 16:23:42／898ms，3 文件 74 项：token53、incoming12、delete owner9；含空白／重复／混合／旧模式、组完整 leaf、stored asset、CAS／投影失败、兄弟草稿和 Magic                          |
| [最终真实 App](../artifacts/canvas-reference-delete-final-app-tests.log)                             | 16:26:25／3.23s，1 文件 11 项；IMAGE／VIDEO 首中尾、重复 occurrence、baseline 碰撞、三媒体 mixed、非媒体组 leaf、Quota 保图与仅保存重试                                            |
| [正式完整 check](../artifacts/canvas-reference-delete-final-check.log)                               | 官方 Node24.19.0，session31447 terminal exit0；379 文件／5193 项全过，16:33:00／192.33s，格式、零警告 lint／架构边界、核心 strict 和生产 build13.86s 通过；Vite7.3.7、3568 modules |

全部统计含既有 Studio／影游测试；strict 只覆盖核心 TypeScript，CI 未远端执行。DEP0129 与 jsdom `HTMLMediaElement.pause/load` 的 Not implemented 通知保留，不等于真实媒体播放验证。本批新增 4 个测试文件、85 项；相较上一轮 1129 源冻结，1135 冻结为 6 个新 source/test 文件、7 个既有修改，无删除。

[最终构建证据](../artifacts/canvas-reference-delete-final-build-proof.json) 核对这 1135 个 source/config/test SHA、真实 ESM static closure／四个 dynamic 实现和旧 CSS 字节／级联、既有 900000 阈值。package/lock、CSS、分包配置未改。此前 vertical 日志实际已是 Vite7.3.7，package 中 `^7.1.0` 只是范围，不能声称本批升级 Vite。最终 check 后只改维护文档和证据，见 [post-doc proof](../artifacts/canvas-reference-delete-post-doc-proof.json)。

## 3. 原生界面与保存恢复

后台 own tab2，真实页面 `/canvas?projectId=canvas-reference-delete-native-20261013`。两张既有公开样本 webp 通过本机上传 chooser 进入实际 FileReader，原生拖端口连接到 VIDEO，实际 @ 按钮插入 Mixed1／Mixed2。没有 DOM／storage／事件／图／service 注入，没有账号内容。完整 [native proof](../artifacts/canvas-reference-delete-native-final-proof.json) 与 [导出对比](../artifacts/canvas-reference-delete-native-document-proof.json) 保存指标、SHA 和观察修正。

1280×720 点击删除第一参考后：两条 edge 变一条，三个节点均保留，第二素材成为 Mixed1，无 missing badge。before／after／undo／redo／cold 五份 `.libtv` 均通过真实 GUI 下载：undo 整份字节及文档等于 before；redo 与 cold 整份等于 after。after 只改目标 params 的 prompt／textList／imageList／videoList／audioList 和第一参考 edge，其余 document 字段、source node 内容、position／view 完全相同。一点击 undo／redo 的 native 恢复与受控 App 的严格一次历史分开记录；此前上传／移动历史存在，不能要求 native 此时 undo 按钮禁用。

390×844 最后一项删除变 0 edge／0 ref／空 prompt，三个 node 保留；一次 undo 恢复 1 edge／1 ref／Mixed1 绑定原第二来源，before 与 recovered DOM 投影完全相等。面板 x75、width295、right370，height313.5／y80，保留固定工具栏。viewport 已 reset；冷刷新后默认 Agent 侧栏关闭再选择 VIDEO，正确输入与唯一连线恢复，warn／error 查询为 0。最终 [桌面截图](../artifacts/canvas-reference-delete-native-final.png) 和 [窄屏截图](../artifacts/canvas-reference-delete-native-narrow-final.png) 已保存，预览 tab 标记为 deliverable。

首次源端口与邻居 input 重叠导致菜单而未连线，先移动 owned source 后两条拖连成功；没有借这个 fixture 问题更改 pointer。首次窄屏只读 reader 错用 `.cv-edge-path`、旧 panel class 和 badge `data-node-id`，后按 `.cv-edges path`／aria label／`data-mention-node-id` 重做删除与 undo，初读不作为生产失败。冷加载时臆测“展开 Agent”的等待失败，fresh AX 确认侧栏已开，再从真实关闭按钮继续。证据不抹除这些观察失误。

## 4. 本批结束时尚未完成（2026-10-13历史状态）

本批379 / 5193通过的是**普通参考删除**，以下是2026-10-13结束时的已知前端差距；2026-10-14已补齐的范围以下节为准，不能继续笼统称这些分支全部缺失，也不能把锁当作删除不可达：

- `pictureEditLock` 且最后 video 被断开时的整套 params reset；submitted `segmentRemakeLock` 丢失 source 的 lock／draft 清理和 SegmentRange 剥离；editing continuation 丢 source 的目标级联删除。
- 全局删除 node／edge 的完整 recalc 与 cascade、SCRIPT／全景节点专属收集、style／lens effect 清理、IMAGE source focus 降级边处理，以及 Core 完整 typed-order materialization 的源生命周期。
- Role 初始容量／incoming adapter、真人授权／组／签署／QR、历史图库、主体／团队等旧审计缺口。
- 原生 VIDEO／AUDIO 播放、所有 group／Quota／CAS branch、物理手机／触摸／Safari／高 DPR／大图与持续高频手势；本批 desktop 窄屏不代表真机。
- 真实生成、费用、审核／上传／协作与运营写服务继续未连接；登录注册、原站账号及小号继续按用户要求延期。

本机未部署，不修改独立影游生产冻结记录；整个复刻目标仍进行。

## 5. 整图删除后续进展（2026-10-14）

后续已补普通参考卡与全局 node / edge 的共享 post-delete 重算及 cascade。`pictureEditLock` 最后视频丢失的整套 params reset、submitted segment 丢源后的 lock / draft / SegmentRange 清理、editing continuation 的目标级联删除已在纯规则与实际入口接线；style / lens effect、SCRIPT style 与 panorama 特殊目标的纯状态也已覆盖。因此上节前三类不能再统称当前全部未实现；特殊 renderer、原模式 effect 与原生媒体能力仍不由纯测试直接证明。

实际 keyboard、连线 pointer / double-click、普通参考卡与确认弹窗走一次 owner / CAS / history，保护普通提示词、ScriptV2 普通 prompt 与 row draft 的不同 channel。script / 旧关联 group / opening-used VIDEO 的 keyboard 资格和菜单 generated-content 资格分别按源处理，取消零写、失败可重试，清理后的 active / detached input 不再被旧 timer 或旧 baseline 复活。旧379 / 5193仅为本文件前四节的历史普通分支，不是当前全局删除范围。

普通 `group` / `video_group` 的 UI Delete 展开 `parentId` 全子树；raw 父组删除释放孩子与显式解组保留世界位置是不同协议，不能混用。partial group 剩余 ≤1 子项解散父组、≥2 按 measured 尺寸与 source zoom padding 重算。本机为了用户授权的交互一致性，只沿被删节点的旧 ancestry 与存活组真实 outgoing targets，即时重算 bounded group consumers；这是明确 opt-in 的本机改进，源证据未证明同样即时更新。

Root 最终完整 `npm run check` 已对1150 source/config/test SHA冻结运行：官方 Node24.19.0，session34383 terminal exit0，**388 测试文件 / 5370 项**通过，03:32:29 / 170.04s，3573 modules、build16.77s。日志见 [本轮正式完整check](../artifacts/canvas-destructive-delete-final-check.log)，后续 source、实际 App、native 保存恢复和产物证据统一见 [整图删除验收](./canvas-destructive-delete-functional-audit.md)；确认资格、owner / view 与真实脚本输入恢复见 [删除确认审计](./canvas-delete-confirmation-audit.md)。这是当前冻结源码检查，不把历史普通批次日志或构建成功扩大为所有原站交互完成。

source script / group 断线后的确认及 `unlinkStoryboardByEdge`、VIDEO / AUDIO → VIDEO_CLIP 的 `mD` timeline 事务与原锁生命周期仍缺，不能只断边或用 ordinary `ig` 冒充这些专属协议。IMAGE source focus 降级、Core 完整 typed-order materialization、Role 初始 adapter、特殊 renderer、原生播放 / 大图高频 / 物理手机触摸 / Safari 的剩余范围继续保留。真实生成、费用、上传 / 审核、协作与运营写服务未接；登录注册、原站账号及小号继续延期。未部署，整个复刻目标仍未完成。
