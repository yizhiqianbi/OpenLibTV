# 普通参考删除：独立事务与源码复核

2026-10-13。本作者静态读取公开归档和当前生产源码，独占新增 `reference-reconciliation-model.test.js` 的 53 项来源预期测试及本文。Root 后续已格式化该测试并完成全检；最终复核阶段未再改生产或测试，未运行浏览器、服务、原站 bundle、登录、部署或全量检查。本文的判断限普通生成器参考卡片删除及本批共享引用协议，不代表全部画布删除、特殊锁定节点或完整原站复刻。

## 1. 当前审查结论

在已核的普通 IMAGE／VIDEO／AUDIO 参考删除合同中，没有发现新的阻断性事务缺陷。当前实现依次使用最后输入、一次图计划、显式目标正文投影、一次 CAS／历史、成功后消费输入草稿，修复了“清理后的正文恰等旧 baseline，未消费草稿又把已删 token 写回”的真实问题。普通删除现在按 store `ig` 清理和重编号；IMAGE 仅排序保 literal prompt 的上一轮合同不能套到删除。

新 store collector 已与 renderer collector 分开：新输入由实际边顺序、完整 group leaf、非 virtual／非 REFERENCE 来源、characterRef 和 normalized stored asset 构建。旧 token mapping 优先原始合法 typed arrays，显式 `[]` 不被新图列表覆盖。Role 的最终重算已共用此 collector 与两阶段 prompt 协议；开关使用旧 params.modeType／model，随后选择新 mode 是另一个步骤。

这项结论不覆盖第 5 节的明确前端缺口。特别是 picture／segment 锁不会自然使参考删除不可达，不能将这些分支藏在“真实服务器未接入”之后，也不能把 5193 项检查通过写成完美复刻。

## 2. 独立来源依据

直接读取 `research/source/0leiedr1esdbe.js` 的 module 417754、677418、799545、469850／98844、store `ih`／`ig`／`deleteEdge`／`deleteEdges`／`recalcIncomingForTarget`，以及 `3lfysz4968xc9.js` module 184907／814059 和 VIDEO caller `24mj3em3412ij.js`。这些文件只当文本，没有 import 或 eval。完整逐层合同及其它 IMAGE／AUDIO／callback／Prompt 证据见 [source 审计](./canvas-reference-delete-source-audit.md) 和 [源码证明](../artifacts/canvas-reference-delete-source-proof.json)。证明当前记录 13 文件／79 段、三种坐标与 excerpt SHA；不能把字符索引当 UTF-8 字节偏移。

独立核对的关键规则如下。

| 来源合同                                                                                                                                               | 当前实现及判断                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useDeleteGeneratorReference` 先取第一条 direct edge；没有 direct 才依 edge 顺序找 group leaf；edge-free asset 条目无独立删除分支                      | `removeGeneratorReference` 对应此顺序，只删除首条命中 edge，不删除媒体节点；未命中返回 null，不以 prompt 清理制造成功                             |
| group 展开依据 parentId，全 leaf 计数；URL 空、非媒体、REFERENCE、hidden 不影响“最后一项”判断；depth 8、visited、excluded 和 characterAsset 有独立规则 | `expandGeneratorReferenceSources` 不使用可展示媒体数量作为判断。删除一张图而仍有 ignored leaf 时只追加 excluded，保持 group edge                  |
| `ih` 在 group edge 被移除时清理该组完整 leaf 对应的 exclusions，保其它组 exclusions，清空时移除字段                                                    | `clearDetachedGeneratorGroupExclusions` 在实际删 edge 后应用；未 detach 的 exclude 分支不把其刚加的 ID 清掉                                       |
| store `ig` 新输入排 virtual／REFERENCE edge source，加入 filtered characterRef；不追加 target refImages，不排 focus ID                                 | `collectReconciledGeneratorInputs` 有独立实现；不直接复用更宽的 UI incoming 数据                                                                  |
| 新 typed lists 仅追加 normalizeMediaList 后的 stored asset:// 条目；旧 typed mapping 原样读旧 arrays                                                   | 当前仅 retained asset 走 normalizeStoredGeneratorMedia；旧数组保 raw 顺序与 ID，未先正规化或重排，URL 不替代 nodeId                               |
| `applyMediaListOrder`／`buildMixedList` 非空 order 用 Map，duplicate ID 最后 value、首次 insertion position；空 order／单项保原列表                    | 公共 order helper 与 Mixed builder 对应源机制；旧／新 Mixed mapping 使用同一原 mixedListOrder                                                     |
| `ig/T` 先按旧 typed／Mixed occurrence 找稳定 ID，在新相应列表重编号／删除，再按旧 mode/model 决定 Typed→Mixed                                          | `reconcileGeneratorIncomingPrompt` 保留这两个阶段；不使用新推断 mode，不用直接 typed→Mixed 一跳替代                                               |
| source store gate 的 Seedance predicate 同时接受 exact model strings、modelKey／modelVendor 对象                                                       | 当前 usesMixedGeneratorReferences 已补对象判断；store delete／Role 调用只传旧 params.modeType 和 params.model，未用新 schema vendor 扩大这个 gate |

两阶段空白处理已逐项核对：没有替换、旧协议非 Mixed 时原字节保留；第一阶段替换只触发 ASCII space 合并和 trim，匹配可吞一个前导 LF／横向空白及末尾 space／tab。Typed→Mixed helper 在存在 typed 前缀时另合并连续 space／tab，并将三个以上 LF 降为两个；即使 typed 前缀的 index malformed，也可能触发这项空白规范化。已有 Mixed-only prompt 没有 typed 前缀时不额外清空白。recognized unknown index 与无旧 nodeId 的 token 删除；Text／Element／Magic／CameraPreset／SegmentRange 不在此正则。VIDEO reorder 对无效 typed／Mixed token 的政策不同，仍保留独立函数，不能将 deletion cleanup 回填所有排序入口。

## 3. 一次本地事务与输入消费

实际链为 `GeneratorReferences.onDelete` → `CanvasNodeInlineGenerator` 读取 prompt ref `getValue()` → `useCanvasGraphActions.deleteReference` → 纯 plan → `commitGraph` → 同步重读 raw 当前文档 → prompt `acceptCommittedValue`。

GraphActions 先确认当前文档 active／ready／非 readonly，并捕获原 nodes／edges／models 身份。最后输入与 Magic metadata 的正规化只落在新对象，不提前修改当前图；该 inputNode 同时作为 history baseline。纯计划基于它计算删边／exclude、typed lists 与正文。新目标正文再正规化一次，提交时给 `explicitPromptNodeIds: [targetId]`；因此 next 投影不会以旧 baseline 再叠加目标 pending 输入，previous 与兄弟节点仍正常投影。

`commitGraph` 在投影前后各检查捕获的图身份与 owner。投影异常、竞争图、文档变化、未 ready、readonly、卸载、未知 source 或 edge-free asset 均不会发布计划、记录历史或消费输入。测试里的竞争注入只用于真正 CAS 边界，不被描述成实际 App 的可达手势。

成功后 Inline 从 raw 已接受文档取目标正文，核对 documentKey 才调用 `acceptCommittedValue`。这一步取消 150ms timer，更新 draft／emitted／external value 与 DOM，避免“外部 prop 仍等 A，controlled effect 看不见变化”的第二个覆盖入口。它没有第二次 onChange 或图历史。无成功返回不走此桥；没有直接把按钮 index 当 source identity。

例如 raw A=`{{Image 1}}`，pending B=`{{Image 1}} {{Image 2}}`，删除第二引用后下一值又为 A。当前 next 精确为 A，previous 精确为最后 B，兄弟草稿在两张图都保留；200ms、pagehide 和保存重试不会把第二 token 或 edge 复活。存储配额失败与图 CAS 拒绝是两种结果：前者已接受图保留在内存及输入，重试只保存，不重复删第二条 edge、不再加历史；后者原图或竞争图及未消费输入保留。

## 4. 实际验证与冻结证据

本作者新增 [pure 测试](../src/features/canvas/generator/reference-reconciliation-model.test.js) 的预期字符串均人工按源合同给定，未复制 production regex 构造 oracle。53 项涵盖首／中／尾及重复 occurrence、两阶段 typed／Mixed、旧 mode 字符串 gates、Map last duplicate、unknown／malformed／zero／leading-zero index、相邻 LF／tab 与无变化原字节、VIDEO reorder 的不同无效 token 政策、typed／Mixed order helpers 和不改输入列表。对象 model gate 由当前源码与真实 source predicate 静态核对，不能把字符串 gate 测试称为所有对象 UI 的验收。

初次定向 [日志](../artifacts/canvas-reference-reconciliation-pure-before-review-tests.log)：bundled Node 24.19.0，16:17:03，184ms，1 文件／53 项通过。该测试随后由 Root 格式化；最终不再修改。

另外读取并检查强断言：

- `useCanvasGraphActions.reference-delete.test.jsx` 使用真实 drafts 与 GraphActions，覆盖 baseline 碰撞、兄弟草稿、Magic metadata、一次 next／previous 投影和历史、权限／owner／unmount 拒绝、投影异常与竞争 CAS。
- `NodeCanvas.reference-delete.integration.test.jsx` 真实 lazy generic generator／输入 DOM／图／history／autosave／localStorage，涵盖 IMAGE／VIDEO 首中尾与 baseline 碰撞、跨三媒体 Mixed 删除、ignored group leaf、配额失败重试、200ms／pagehide 和一次全图 undo／redo。其 getBoundingClientRect／RAF 是 jsdom 布局夹具，不代替真机布局。
- `reference-incoming-model.test.js` 覆盖 edge order、空 URL、filtered characterRef、asset case／规范化、metadata、parentId 与完整 leaf、excluded traversal order、depth／character group、detach exclusion cleanup、重复 direct edge、edge-free no-op，以及合法空旧数组与明确本机 fallback 的区别。

只读查看 Root 正式 [check 日志](../artifacts/canvas-reference-delete-final-check.log)：16:33:00 开始，379 文件／5193 项通过，测试 192.33s、build 13.86s，格式／零警告 lint／核心 strict／生产构建完成。本作者没有另跑或重启 fullcheck。实际重算 [冻结清单](../artifacts/canvas-reference-delete-current-source-snapshot.json) 的 1135 文件 SHA，全部匹配；Node 为 v24.19.0，快照 UTC `2026-10-13T08:32:47.683Z`。

只读核对 Root [native 导出证明](../artifacts/canvas-reference-delete-native-document-proof.json) 的 before／after／undo／redo 四文件 SHA 均匹配。该证明记录 source nodes 原样保留、只有目标和首条参考 edge 变化、整文档 undo 等于 before／redo 等于 after；它支持被记录的 native 例子，不证明所有锁定／group／浏览器设备组合。本作者未操作浏览器。

## 5. 尚未覆盖的前端差距

以下是确切 source 分支与当前实现边界，不因服务器未接入而取消，也不作为本批普通删除已实现的声明。

1. **pictureEditLock 最后 VIDEO 断开。** source `ig` 会重置 prompt 为 `""`、modeType 为 `""`、count 为 1、settings 为 `{}`，保 model 与新 text/image/audio lists；当前普通纯计划仍 spread 原 params，没有专用重置。源 VIDEO 删除仅按 canvas／collaboration readonly 关闭，未以 picture／segment 锁隐藏此动作。
2. **segment-remake。** submitted draft 丢失 source 时，source 清 lock／draft 并移除真正 SegmentRange token；editing phase 可级联删除 continuation target。当前计划没有这些专用效果，也未验证异步 clip disconnect 的 lock／owner／timeline 事务。不能将普通 synchronous CAS 测试外推到它们。
3. **材质 style／lens 与特殊目标。** source `ig` 另走 style `il`／recalcLensEdgeEffects；SPACE_SCENE_720、DIRECTOR_CONSOLE_3D、SCRIPT 不是普通 params remap。这些后效不在本次共享纯 remapper 内。IMAGE fallback-model incoming 的 focus edge／focus UI 清理也需独立接线验收。
4. **全局删除入口。** source deleteNode／deleteNodes／deleteEdge(s) 对受影响 targets 执行 incoming 重算。当前 batch selection remove 走 `removeCanvasNodes`／commit，与参考卡片入口不同；本批没有将所有 destructive 图入口统一接入新协议。因此不能声称键盘删除源节点、通用删 edge 或级联删除都已获得同样的 token／excluded 清理。
5. **Role 初始适配与零差异确认。** Role final after 已使用新 store collector；但 initial helper 仍通过本机共享连接 collector、Set sources、renderer refImages 与本机资产 ID 适配，服务于容量／simulated mode 及缺失旧数组 fallback。它不是 source store raw old mapping 的替代。合法保存 arrays 已优先原样使用；缺少或损坏旧数组的 fallback 明确是本机历史兼容。初始来源在重复边／focus／refImages／特殊 asset 格式中的完整 renderer 对齐、以及没有实际增删边的角色库确认是否应触发同样重算，仍需按完整 caller 后效独立核验，不能由本批 final collector 修复推导为整个 Role 完成。
6. **实际设备与服务状态。** readonly callback／same-ID owner retirement 在 hook 层有隔离；实际 App 的全部跨文档迟到 DOM、音频播放器、Safari／手机 UA、真实协作锁、生成／认证／运营写服务仍需另验。没有用成功夹具冒充原站账号或服务器状态。

后续优先让特殊锁与各真实 destructive 入口按同一 source 合同接入，并逐个验证可达 UI、一次历史、草稿／保存失败与 owner 生命周期。当前整个复刻目标仍未完成。
