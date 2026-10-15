# 普通参考删除：实际画布验收计划与证据

2026-10-13。本作者只拥有新 `NodeCanvas.reference-delete.integration.test.jsx`、本文和专项日志；不修改生产、旧测试或根维护文档，不运行全量 check、浏览器、归档脚本、服务写入或登录流程。Source 完整事务规则由 [独立 source reviewer](./canvas-reference-delete-transaction-review.md) 与 Root 核对后确认，测试不能根据当前实现反推 token 预期。

## 1. 当前实际入口与事务边界

`GeneratorReferences` 的删除按钮调用目标生成器 `onDelete(sourceId)`。现 Inline 将真实 prompt ref `getValue()` 交给 `graphActions.deleteReference`；不是取旧 React value，也不是把按钮编号当作 sourceId。当前 source 节点不被删除，只断目标参考边或维护 group excluded。删除成功需要与排序一样消费已接受的 DOM 输入，否则清理后的正文恰等旧 raw baseline 时，草稿投影或旧 debounce 可再次写回被删 token。

实际 App fixture 使用真实公开 models JSON、稳定本地 actor、真正的 lazy generic generator、真实 `readPromptDOM`／输入 controller、GraphActions、drafts、history、autosave 和 localStorage。只有公共内容目录 mock；不 mock 图模型、历史、保存或制造生成结果。初始 schema 参数正规化，避免将晚到 defaults 写入误判成删除 bug。初始 params 同时存合法 typed lists 和 order，明确用于 source 的旧映射；不把“不存列表”的本机历史数据适配混入最先验收的源正向案例。

所有 pending-input 测试在真实编辑器 mount 后只冻结 timeout／debounce，操作后推进 200ms 再 pagehide。捕获 actual 输入 identity、提示词 codec、graph／storage、节点顺序与 source 原对象内容；撤销恢复删边前的最后输入，重做恢复整张已提交图，并要求两个方向只有一次图历史。未验证的 native 布局／媒体播放不会由 jsdom 结果冒充。

## 2. Source 已确认与待补全范围

Root 与 source reviewer 已确认 store `ig`／`T` 会清理 recognized `Image/Portrait/Video/Audio/Mixed` token，按旧／新稳定 nodeId 重编号；重复 occurrence 全部处理。未知旧 index 或没有旧 nodeId 的 recognized token 也删除。`Text/Element/Magic` 不属于此正则，不能顺手删除。变化时只对 ASCII 连续 space 合并并 trim；正则可吞 token 前一个 newline／横向空白与 token 后的 space／tab，不能用常见字符串 split 重写代替。

首批 hardcoded expected 使用三张普通图片，不含 mixed 或未知旧列表，隔离规则差异：

| 删除位置                 | 最新 pending 正文                                    | 源确认的下一正文                                    |
| ------------------------ | ---------------------------------------------------- | --------------------------------------------------- |
| 首项 first               | `{{Image 1}} {{Image 2}} {{Image 2}} {{Portrait 3}}` | `{{Image 1}} {{Image 1}} {{Portrait 2}}`            |
| 中项 second              | 同上                                                 | `{{Image 1}} {{Portrait 2}}`                        |
| 尾项 third               | 同上                                                 | `{{Image 1}} {{Image 2}} {{Image 2}}`               |
| baseline 碰撞：删 second | raw `{{Image 1}}`；pending `{{Image 1}} {{Image 2}}` | `{{Image 1}}`；200ms／pagehide 不得复活第二个 token |

这些字符串对 IMAGE／VIDEO typed 删除分别测试；不能套上一轮 IMAGE 排序 literal 协议。旧 [reference-draft 审计](./canvas-reference-draft-transaction-audit.md) 中普通删除“不自动重写”的通过案例，只代表本机当时行为，不能作为本轮源标准。

source `ig` 的 old mapping 来自合法 raw typed arrays，只有 mixed 旧列表根据 mixed order 构建；显式空数组与缺少合法数组不同。新 inputs 的 virtual／REFERENCE 过滤、group 完整 leaf 展开、asset:// 保留、focus／refImages 差异仍以 reviewer 完整合同为准。此轮测试先不编造复杂 branch 的 expected，尤其不直接复用带本机可用 URL 过滤的 collector 作为源全部成员数量。

## 3. 首批制定的实际验收矩阵

以下是最初计划，不能整表自动标通过。Root 后续执行结果见第 5 节；pure／owner 与实际 App／native 各自保留证据边界。

| 范围                             | 真实操作与强断言                                                                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首／中／尾、重复 occurrence      | 真实 delete button；精准目标首 edge 消失，source 节点全部保留、其他图字段不变；token 清理／重编号、DOM 与 storage 一致                                                                                                       |
| mixed／typed 跨媒体              | 等 source normalize 合同后加入 image／video／audio；按旧 mode 协议固定期待，避免切新 mode 改解释；检查同 ID token 与 mixed 顺序                                                                                              |
| 同源重复 edge                    | 只断首条匹配 edge，剩余 edge 仍提供同源输入；不因第一次删除把仍连接的素材 token／stored list 误删                                                                                                                            |
| group exclude／last child        | 真实 group → target edge；删除普通子引用先 exclude；仅完整展开 leaf 计数为最后项时删 group edge，保留组与全部孩子位置。含尚无 URL／非媒体 leaf 的子例需源确认                                                                |
| token／metadata 边界             | recognized unknown index、重复 token、空白与 newline；未知类型原文保留；用户删最后 Magic token后 metadata 在 next 与历史准确清理，不伪造识别标签                                                                             |
| 保存配额失败                     | Graph 已接受但 storage 被 Quota 拒绝时保留新图、正确 DOM；600ms 自动失败后 Header 重试仅保存 current graph，不重复删第二条 edge、不增加历史                                                                                  |
| 同 ID 文档切换／owner retirement | 捕获旧 DOM，切真实 projectId／readonly 或卸载，再送旧 DOM 事件／推进旧 timer；新图无写，旧文档退出刷写按其真实文档协议，不把旧草稿写到新同 ID                                                                                |
| 其他 draft                       | 正常编辑另一个 generator 再切目标，核对该文字在本次 commit／undo／redo 中保留。当前 UI 只有一个 editable inline，不能伪造用户同时操作两个不可达输入；注册草稿并行投影由 Root hook 回归补强                                   |
| CAS 拒绝                         | 普通删除纯同步，实际 App 无公开竞争注入接口。不会为此 mock GraphActions 或读取私有 React fiber；Root 真正 CAS／投影失败测试检查原图／竞争图保留、零历史、输入不接受。实际 App 检查可达的权限／文档退休 UI 拒绝，二者证据区分 |

## 4. 修前实际档案

[canvas-reference-delete-app-before-fix-tests.log](../artifacts/canvas-reference-delete-app-before-fix-tests.log)：bundled Node 24.19.0，03:03:52 开始，2.89s，1 文件／8 项全部失败、exit 1。六项首／中／尾和两项 baseline 碰撞失败均来自源确认的正文／DOM 清理预期；精准 edge、source 节点、选择与 view、200ms 图稳定及一次撤销／重做全图断言已执行且通过。此结果证明本机仍原样保留已删 token，不能误记为测试 fixture 问题。

本次失败日志保留，不覆盖。修复后的同文件与新增 branch 结果待正式协议与 Root 实现后逐项记录。未运行正式 fullcheck，未声称该 batch 或整个复刻目标完成。

## 5. Root 后续实际执行（2026-10-13）

完整 source 合同已保存在 [源码审计](./canvas-reference-delete-source-audit.md)，独立 [事务审查](./canvas-reference-delete-transaction-review.md) 核对普通分支及已知特殊分支边界。最终 App 文件保留原 8 项强断言，新增 3 项，共 **11 项**，日志 [canvas-reference-delete-final-app-tests.log](../artifacts/canvas-reference-delete-final-app-tests.log)：16:26:25／3.23s，1 文件全部通过。修前 8 项全部失败的归档继续保留。

新增 3 项按源 hardcoded expected 验证：image／video／audio mixed order 删除首项后全部 typed 与 mixed occurrence 绑定正确；group 除一张图还含非媒体 reference leaf，删除图只 exclude 而不删 group edge；存储配额拒绝时图与输入已接受、存储保旧快照，700ms 失败后 Header 仅重试保存，不重复删边或添加历史。所有原节点、位置、view、选择、输入 identity、200ms／pagehide、整图 undo／redo 断言保留。

同源 duplicate edge、最后 group edge 与 excluded 清理、合法 raw 空数组与 absent fallback、stored asset no-op、depth／character 边界由实际 pure 模型测试覆盖；兄弟 draft、Magic、readonly／ready／owner retirement、unmount、projection throw 与真实 CAS 竞争由生产 GraphActions hook 测试覆盖。最终联合 [74 项](../artifacts/canvas-reference-delete-final-model-owner-tests.log) 为 token53／incoming12／owner9，16:23:42／898ms，三个文件全过。不能将这些全记为原生操作。

Root 正式完整 `npm run check` session31447 terminal exit0，379 文件／5193 测试，16:33:00／192.33s；格式／零警告 lint／架构／核心 strict、生产 build13.86s 通过，[日志](../artifacts/canvas-reference-delete-final-check.log) 与1135冻结构建证明分别保存。jsdom媒体pause/load未实现通知、DEP0129保留，strict不是全JSX、CI未远端执行。

原生本机上传两张既有代表性webp、拖入VIDEO、实际@插入、删第一项／一次undo／redo／冷刷新五份GUI导出已逐字及整文档比较；390最后项删除／一次undo恢复已验。准确范围、观察失误修正和SHA在 [功能验收](./canvas-reference-delete-functional-audit.md) 与 [native proof](../artifacts/canvas-reference-delete-native-final-proof.json)。未验证全部媒体播放／group／Quota／CAS原生分支、物理手机／触摸／Safari／大图。

pictureEdit最后video断开reset、submitted segment清lock/draft/SegmentRange、editing continuation cascade、全局destructive recalc与style/lens/focus仍是前端缺口，不能把锁误称源普通删除不可达。Role final after已共用collector，初始UI adapter仍另验。真实服务／登录／账号资源按既有边界延期；本机未部署、整个目标未完成。
