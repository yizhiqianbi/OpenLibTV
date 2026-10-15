# 脚本／分镜组断连：源码合同与接线边界

2026-10-14。只读研究已归档原站脚本，没有执行／import 原 bundle、浏览器、账号、网络写入、生产／测试修改或构建。本批独占新增本文和 [源码证明 JSON](../artifacts/canvas-storyboard-unlink-source-proof.json)。证明重算 **6 个原文件、33 段摘录**的 UTF-16、Unicode code point、UTF-8 半开范围以及源文件／摘录 SHA256；此前整图证明的 10 文件／95 摘录保持不变。

核心结论：实际 UI 先将脚本关联边和普通边分流。脚本关联边确认后才 snapshot → `unlinkStoryboardByEdge(..., { preserveEdge: true })` → `deleteEdges(selectedIds)`。资格依据 **raw `data.type`**，不能直接使用通用 flow type 或 `isScriptNodeData`。`SCRIPT_V2` 没有被直接分支识别；但原站 V2 创建会程序添加 `script-v2 → group` 边，不能将这个缺口解释为“V2 边不存在”。GROUP↔GROUP 的资格和 helper 的视频组 fallback 又是两套不同规则。

## 1. 实际入口与分流

`21_0xvlvkw1sz.js` 的 `handleEdgesChange` 是实际 ReactFlow callback；单边 `deleteEdgeById` 也只是交给它一个 remove change。Provider、参考选择断连等调用此 API。处理顺序可由 `ui-edges-change-complete` 重算：

1. `isRestoringRef.current` 时只 apply 原 changes，直接返回；不再确认、unlink 或 snapshot。
2. 非 remove changes 先 apply；remove ID 按输入顺序收集。
3. 用当时的旧 nodes／edges 逐 ID 分流。不存在的 ID进入普通集合；target `params.segmentRemakeLock === true`、draft.phase为 editing且 draft.sourceNodeId严格等于 edge.source 时，优先加入待删 target Set并 continue。**没有任何 source／target type gate**；即使目标为有脚本绑定的 raw GROUP，也先走这条 editing continuation 规则，不弹脚本断连警告。
4. 其它边满足第 2 节资格进入脚本集合 `s`，否则进入普通集合 `h`。
5. 普通／editing 阶段在脚本确认之前执行。此处存在另外的 clip 路由，但它属于 `mD`／timeline 协议，本文不将其锁、layout 或 currentTime 变更套进 storyboard unlink。
6. `s` 非空时才处理脚本确认。已获节点删除确认的 `isScriptDeleteConfirmedRef` 为 true 时直接执行，不产生第二份 snapshot 或第二个提示。

所以 mixed remove changes 取消脚本确认，只保留脚本关联边及其绑定；**不会回滚已经完成的普通边或 editing target 删除**。不能在 UI 文案或测试中把整个 mixed callback 称为“取消零写”。script-only 未确认路径则在确认前不调用 snapshot、helper 或 raw deleteEdges。

证据：`ui-edges-change-complete`、`ui-editing-segment-priority-before-unlink`、`ui-storyboard-edge-qualification`、`ui-storyboard-confirm-and-bypass`、`ui-on-before-delete`。

## 2. 精确资格，不扩展 V2／version

下表中 `S` 为 edge.source 的 node.data，`T` 为 edge.target 的 node.data。判定使用原 JavaScript truthiness，没有 trim，也没有 `sourceScriptNodeId` 字符串类型检查。

| 情况                                                                       | 原 UI 资格                       |
| -------------------------------------------------------------------------- | -------------------------------- |
| `S.type === 'script'`、`T.type === 'group'`、`T.sourceScriptNodeId` truthy | 需要脚本断连确认                 |
| 上述两端反向                                                               | 同样需要确认                     |
| 双方 raw type 均为 group，至少一端有 truthy source ID                      | 继续下面的 chosen group 检查     |
| raw script-v2 ↔ group                                                      | 不满足上述直接分支；进入其它分流 |
| 仅 flow node.type 为 script/group，而 raw data.type 不匹配                 | 不由此确认                       |
| group.sourceScriptVersion 为 v2、旧值或缺失                                | 此资格没有 version 门控          |

GROUP↔GROUP 的 chosen group 规则有明确优先级：source 组有 truthy source ID就选 source 组及其 ID，否则才选 target 组。该 ID必须在旧 nodes 中存在；**不要求引用节点的 type 是 script**。还必须在 chosen group 的真实 direct `parentId` 孩子中，存在一个 truthy `data.scriptRowHiddenUuid`；不要求该 child 为 IMAGE，也不使用 preferred childNodeIds 或组 hidden UUID 元数据代替实际孩子。

如果 source 组有 ID但缺实际 hidden child，即使 target 组的条件完整，也不会改查 target。direct SCRIPT↔GROUP 则根本不要求 stored source ID与 edge 的 script ID匹配，也不要求那个 stored ID存在于 nodes。这些容易被“更方便”的通用关联判断改变。

### V2 的实际可达范围

- enum 明确 `SCRIPT='script'`、`SCRIPT_V2='script-v2'`；原新手创建的外层 type 和 raw data.type 都为 SCRIPT_V2。
- 手动连接 validator 拒绝 SCRIPT_V2↔storyboard image/video GROUP。这是手动入口规则。
- V2 image/video 创建的组 raw type 为 group，保存 `sourceScriptNodeId` 和 `sourceScriptVersion:'v2'`，随后调用 `linkStoryboard`。该 helper 默认 edgeSource 为 script ID，找不到 canonical edge 就 `addEdge(scriptId → groupId)`，没有使用前述手动 validator 来证明这些边不存在。
- 因此 direct V2→group 边真实可存在，而此 UI predicate 不识别它，也不调用下面的 unlink helper。这是可达原站行为／缺口，不能默默加入 legacy script 分支。与 V2 script 关联的 GROUP↔GROUP 则可以满足 chosen ID 存在和实际 hidden child 条件。

证据：`node-enum-script-v2-distinct`、`v2-script-actual-creation`、`v2-script-manual-connection-rejection`、`script-group-link-creates-edge`、三个 `v2-*-group-*`。

## 3. Helper 的顺序与两端数据

UI 的 binding callback 固定传 `{ preserveEdge: true }`。`unlinkStoryboardByEdge` 本身默认 preserveEdge 也为 true；其分支顺序为：

1. 无 canvas store或 source／target node 缺失，直接返回。
2. raw SCRIPT→GROUP 且 group.sourceScriptNodeId truthy，调用 `unlinkStoryboard(scriptId, groupId, { preserveEdge })` 后立即 return。
3. 反方向同理，仍把 script ID传为第一参数。
4. 其它情况按 **target → source** 顺序遍历；只有 raw GROUP、`storyboardGroupType === 'video'` 且 source ID truthy 的那一端，调用 `unlinkStoryboard(storedScriptId, groupId, { kind:'video', preserveEdge })`。

这个 fallback 不检查 other endpoint kind、hidden child、version 或 stored script node 是否存在。不能用 helper 的较宽 fallback 反向扩大 UI 的确认资格。例如对 direct V2→video group 单独调用 helper可以命中 fallback，但真实 UI 不因此自动调用它。

`unlinkStoryboard` 的数据合同：

| 步骤                                | 精确变化                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 推断 kind                           | 没有 truthy显式 kind 时，先看脚本当前 `linkedImageGroupId === groupId`，再看 linkedVideoGroupId；两者都匹配时 image 优先                |
| 更新 script                         | 只有对应 linked 字段当前确实等于 groupId，才传该单字段 undefined；显式 video 不会顺便清 image                                           |
| 更新 group                          | 只要该 ID节点存在，就无条件传 `sourceScriptNodeId:undefined` 和 `storyboardTitle:undefined`；不验证旧 source ID是否匹配所传 script      |
| UI preserveEdge true                | helper不删边；所有 helper完成后 caller再 `deleteEdges(s)`                                                                               |
| 公共 helper省略／false preserveEdge | 只删 `scriptId → groupId` 方向所有 parallel edges；不删反向边，也不直接删实际 group→group edge。它不等同于 UI 的 preserveEdge true 路径 |

因此 metadata指向另一个 script 的 group仍会被清 source/title，但那个 stored script的 linked字段没有被此 direct helper主动清掉。video-group fallback 的显式 kind不能改成根据 image/video metadata自动任选。

函数没有清 `sourceScriptVersion`、`storyboardGroupType`、`childNodeIds`、`storyboardSourceRowHiddenUuids`、child `scriptRowHiddenUuid`、script rows／params、生成图像或视频。这里没有子行映射／删除算法，也没有将 group解散或删节点。

证据：`script-group-unlink`、`script-group-unlink-by-edge`、`ui-unlink-preserve-edge-binding`。

## 4. updateNodeData、锁与错误

helper走真实 `updateNodeData`，而非仅构建 `{ ...oldData, ...patch }`，准确次序为：先把 resourceMeta从 patch解出；余下 patch计算 `u = t4(t5(patch))`；再 `data = t4({ ...oldData, ...u })`；最后 t6 **删除 u中值为 undefined的 own top-level keys**。不是先移掉 undefined再规范化，也不是把键永久保留为 undefined。

t4复制输入；name是string才作为候选 i，label是string才作为候选 r；`!i && r`时写 name=r，总移除 label。不trim，空name会fallback，空label不会；没有 name/label时不创造默认名，也不是一般性地删除所有非string name。第一次 t4会使 patch中的合法 label产生 name；第二次 t4还会规范化已有 data.label。特别是 old data有label而 `u.name === undefined`时，第二次 t4可能先fallback出name，但最后 t6仍删name，顺序不能颠倒。

t5只看 **patch.taskInfo**：falsey缺值、`ownerUserId in taskInfo`、或没有 `loading in taskInfo`时保持原样。strict loading false时复制 taskInfo并加 own `ownerUserId:undefined`；strict true或其它值保持。t6不递归，因此该nested undefined raw字段并不被t6移除；也不将t5再套在old merged taskInfo上。省略patch键保留旧值；其它版本、孩子、rows字段由spread保留。显式非undefined resourceMeta另写在node.resourceMeta，undefined不清它。本 unlink只产生绑定字段patch，不触发loading taskInfo／prevTaskInfo的生成状态分支。

源码虽调用 `assertEditLock`，它不是等待原子锁结果的准入。bypass、非协作团队、无 bridge返回 noop；已 held／pending返回 held；其它情况启动异步 lazy acquire并立即返回。`updateNodeData` 忽略返回值，继续 mutation和 schedule同步。脚本 unlink UI没有 `requestEditLock` await、超时结果分支、`flushAndWait`、release finally或 clip transaction。不能仅凭方法名编造“被他人占锁时原操作已被阻止”的 UI规则。

共享 confirm把 onConfirm的 throw／rejection显示为 `msg` → `Error.message` → `操作失败`，finally仍关闭。不 rollback helper已经做的前半更新；一次多边调用中后面失败也可能留下前面变更。无账号的本机 CAS／owner／错误恢复可以改善这一点，但必须明确是本机安全适配，不能倒写成源站同样有原子事务。

证据：`store-update-data-normalization`、`store-update-node-data`、`store-assert-edit-lock-nonblocking`、`shared-confirm-renderer-complete`、`locale-operation-failed`。

## 5. 确认文案、pending与关闭

实际 callback传入：

| 字段        | 原文                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| title       | 断开连线                                                                 |
| message     | 断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？ |
| confirmText | 确定断开                                                                 |
| cancelText  | 取消                                                                     |

它没有 variant、危险确认输入、onCancel或远端异步 writer。共享 `confirm` module944733 的真实规则：

- 单个全局 ref提供 open；没有注册 renderer时直接不打开，不能伪装成已获确认。
- 默认 centered／auto，xOffset16；**无 X、backdrop点击不关闭、Escape允许关闭**。脚本断连没有覆盖这些默认值。
- 正常取消／Escape先 close，再调用可选 onCancel；本调用没有 onCancel，所以不执行 graph动作或 snapshot。pending时取消按钮disabled，但 Modal Escape的默认允许仍未被改成 `!pending`。
- 确认由 ref防重入，设 pending，await onConfirm；pending时两按钮disabled，确认按钮带 spinner。此 script callback本身是同步函数，await完成不等同于等待服务器 flush或协作锁。
- 成功或抛错都 finally close，reset pending/ref；错误另通知。没有 per-request epoch、documentKey或 edge身份重验；不能将 singleton回调当成完整 owner保护。

默认 chrome的源码也已可证：宽 `min(344px, viewport-32px)`、rounded-xl／16px padding、title 14px bold、message 13px muted、消息可选取且双击选整段，按钮32px高、13px字、8px圆角。dark默认确认按钮为 `#F7F7F7`／`#171717`，light默认为 neutral900／white；不是默认 danger。原 Modal／theme CSS变量和 native焦点仍须另做视觉与浏览器验收；本次只有静态证据。

## 6. 历史与已确认 flags

script-only普通调用确认后 snapshot一次，再按脚本 ID集合原顺序执行所有 helper，最后 raw deleteEdges一次。source `takeSnapshot`仅保 pending before；下一次 snapshot、undo或cleanup才 finalize patch，空patch不入栈、上限100，排除temporary nodes／edges。不能把 snapshot函数调用次数直接当成原站立即push的历史条目数。

节点删除确认已经 snapshot后，会把 script/general确认refs置true，并在 timeout0复位。期间 script边走 `r(true)`，跳过第二次snapshot和第二个dialog。普通 mixed边段也受 general confirmed ref影响；这与 script-edge自己的 pending不是同一个状态。

原 undo／redo还核 touched-node版本、节点存在性、协作删除锁和 loading任务差异。纯 metadata unlink可形成 node与edge共同patch；未来复刻不能只把边插回去，却丢已清的 script/group绑定。当前本机 JSON snapshot历史与该版本门控不是同一实现；采用本机已有历史须保完整节点／边恢复，但不要宣称其所有协作guard已验收。

证据：`ui-on-before-delete`、`ui-confirmed-delete-flags-initial`、`ui-canvas-history`、三个 `ui-history-*`及 `history-version-limits-and-temporary-filter`。

## 7. 纯规则接口建议与强例

建议保两个独立纯层，controller负责owner、confirm、当前图/CAS与保存，不让 domain导入React或全局store：

```js
classifyCanvasStoryboardEdgeRemoval({ nodes, edges, edgeIds });
// storyboardEdgeIds / ordinaryEdgeIds / editingTargetIds；保顺序，资格rawdata。

planCanvasStoryboardUnlink({ nodes, edges, edgeIds, preserveEdge: true });
// 不提前删edge；给顺序nodeDataPatches／最终nodes／affected IDs。
// 后接既有 raw edge deletion plan，单次本机 CAS提交 metadata+edge+refs。
```

source qualification与helper必须分开；不要用 helper命中结果代替“需要确认”。已接受全草稿后的图用于计划，旧 reference编号仍由现有删除协议解释；helper只维护上述绑定字段，最终 edge删除交现有 iu／ih／ig协议。多个helper必须依序读取此前patch后的节点，尤其target→source视频fallback；统一undefined正规化后可一次提交。source单边API也可先实现，但不能因此声称 mixed batch已经覆盖。

本机controller可加 opaque request、doc owner／epoch、edge ID与source/target身份、binding fingerprint和最新draft读取。允许无关prompt输入／position变动，同时拒绝实际绑定或选中edge已经替换，是用户节点操作优化下的安全适配；不要因为原确认没有这些guard就复制跨文档误操作。fingerprint不应把完整 params对象身份当绑定，也不能忽略会改变资格的chosen group source ID／直接hidden child。

值得先写 literal expected的场景：

- 正／反 legacy SCRIPT↔GROUP；metadata source ID与实际script不符时原helper的准确局部清理。
- 有脚本绑定的任意raw type target同时满足editing continuation三条件时优先删除target，不弹脚本断连确认。
- image/video linked字段都匹配的 image优先、显式video只清video、不匹配保script但清group。
- GROUP↔GROUP source优先失败而target完整时不confirm；any referenced node type可存在；hidden child按实际parentId且不以IMAGE gate收窄。
- 两个视频group按target→source依次清理；version／rows／child UUID／生成资源严格保留。
- V2程序创建direct边不扩大legacy确认，以及确实符合GROUP↔GROUP的V2关联组。
- explicit undefined变属性删除、旧label正规化、preserveEdge true保selected edges直到最终raw删除；false仅canonical forward平行边。
- script-only取消零图／历史；mixed取消只保脚本段；已节点确认不再二次snapshot/dialog。
- 活跃／退休／row草稿、baseline碰撞、保存／undo／redo同时恢复edge及两端metadata；owner A→B→A、旧token、edge替换、binding变动、失败重试。

本次没有实现生产功能或运行这些测试。源码确认已有完整前端协议，不能以登录延期、真实服务未接或“需要后端”代替它；VIDEO_CLIP timeline、等待原子锁、团队协作、原history版本guard、native确认布局／媒体仍分别保留。整个复刻目标未完成。
