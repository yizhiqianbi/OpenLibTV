# 选中连线与节点混合删除：原站调用链审计

日期：2026-10-14。本轮只静态读取既有 `research/source/` 归档，新增本文和 [独立 proof](../artifacts/canvas-selected-delete-source-proof.json)。没有运行、import、eval 原站脚本，没有网络、浏览器、账号、测试、check、构建或生产／测试／根文档修改。当前 base 批次的正式检查由 Root 管理，本文不宣布该检查通过，也不把下一批 selected／mixed 删除功能标记完成。

本 proof 保存 **15 个原文件、93 条原片段**，重新计算源文件 SHA、片段 SHA，以及 UTF-16 code units／Unicode code points／UTF-8 bytes 三套半开坐标。此前 37＋47＋9 共 **93 条冻结证据**也重新核对，三份旧 proof 的文件 SHA 未改变。使用 reverse-engineer-anything 技能的证据分层原则；本会话没有 REA 工具，未安装或修改注册。本结果是普通静态文本证据，不是 REA Evidence 或原站运行观察。

## 结论

键盘 Delete／Backspace 先经过 ReactFlow 批次预检，再调用 LibTV 的真实主画布回调。剪刀直接调用 Provider 的 `deleteEdgeById`，没有经过这一批次预检。不能把已完成的剪刀单边入口当作 selected 删除已接线。

普通、editing continuation、clip、脚本关联和选中节点是有明确调用先后的阶段。后出现的脚本关联确认只控制该关联边子集；取消它不撤销已经提交的普通边，也不会取消已启动的 editing／clip 请求或随后启动的节点删除。原站没有在这个回调中 await 整批完成或做总体 rollback。

一次 node warning 接受会同时设置两个短期 confirmed flags；除了跳过二次脚本确认，它还绕过 clip 分流。原 history 的微任务只解除 snapshot 合并标志，并不立即生成一条历史记录。不得把这两项差异简化成“所有混合删除共用一个弹窗、一个同步原子事务、一个 undo”。

## 1. 从真实按键入口到实际回调

主 ReactFlow 明确注册 `onNodesChange:lo`、`onEdgesChange:cl`、`onBeforeDelete:li` 和 `deleteKeyCode`。该 caller 没有注册 `onNodesDelete`／`onEdgesDelete`／`onDelete`；RF 内部这些可选回调的存在不代表 LibTV 使用它们。

实际链路为：

1. RF selected-key dispatcher 从当前 RF store 取 `selected` nodes／edges，调用 `deleteElements`，并立即清 `nodesSelectionActive`。它没有等待后续删除成功才清这个框选 UI 状态。
2. `getElementsToRemove` 根据实际 nodes／edges 构造候选，并 await 主画布 `li`。
3. 若准许，RF **先** `triggerEdgeChanges(remove...)`，对应 LibTV `cl`；**再** `triggerNodeChanges(remove...)`，对应 `lo`。
4. 两个 trigger 不是 await LibTV 异步操作。RF 返回的 `deletedNodes`／`deletedEdges` 是被准许的 RF 候选，不能当作 `deleteNodesBatch` 锁／flush 成功报告。

RF 候选顺序必须保留：节点按原 nodes 数组遍历；`deletable === false` 跳过。显式请求或父节点已进入累计列表时加入孩子，这是依赖遍历顺序的单次扫描，并非通用 BFS。边先取所有可删 incident edges，保留原 edges 顺序，再按原 edges 顺序追加显式选中但未进入 incident 列表的边。`deletable === false` 边排除，不能反过来仅按所选 edge ID 的输入顺序删。

`onBeforeDelete` 返回 `false` 时 RF 返回空 nodes／edges，不发两种 remove callback；返回 `true` 时使用上述候选。RF 支持 caller 返回替换数组，但本次实际 `li` 只返回 boolean，不能创造一套 LibTV 未用的重写结果协议。

证据：`rf-delete-key-selected-dispatcher`、`rf-selected-predicate`、`rf-delete-elements-controller`、两个 `rf-trigger-*-changes-callback`、`rf-elements-to-remove-gates`、`libtv-reactflow-actual-props`、`ui-provider-callback-values`、`main-provider-binds-callbacks`。

## 2. 键盘 node warning 与两个 confirmed flags

`li` 只解构 `{nodes}`，不读选中边。因此纯 selected-edge 请求的 nodes 为空时直接准许，不 snapshot、不置 flags；脚本关联边的确认随后由 `cl` 负责。

node warning 按以下优先级决定，且都是 **flow node.type**：

| 优先级 | 条件                                                                                            | 真实文案                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1      | 任一 SCRIPT 或 SCRIPT_V2                                                                        | `确认删除`；`删除当前节点后，数据可能会丢失，也可通过 {undoShortcut} 撤销。确定要删除吗？`                 |
| 2      | 任一旧关联 GROUP，`sourceScriptNodeId` 为 length>0 的 string，且 `sourceScriptVersion !== 'v2'` | 按 image／video／混合选择 `删除分镜图组`／`删除分镜视频组`／`删除分镜组`，message 说明组内节点及关联将消失 |
| 3      | 没有前两项且 VIDEO 的 `openingUsed` truthy                                                      | `确认删除该节点？`；说明创意片头生成内容删除、已发送画布内容不受影响                                       |
| 无     | 其它节点                                                                                        | 直接 `true`                                                                                                |

脚本优先于所有组；组优先于 opening。只有 v2 linked group、不含其它 warning 条件时直接准许。`sourceScriptNodeId` 没有 trim，空白 string 仍满足源谓词。普通已生成媒体的“该节点包含已生成内容”确认属于 node menu，**不在这个键盘 `li` 里**，不能擅自扩大。

按钮为 `确定删除`／`取消`，Mac undo 文案为 ⌘Z，其它 Ctrl+Z。接受时顺序是 `takeSnapshot()` → `oK.current=true` → `oW.current=true` → resolve true → `setTimeout(...,0)` 恢复两个 false。取消 resolve false，没有这个 snapshot 或 flags。并非只有 SCRIPT warning 才置 `oK`；旧组或 opening 接受同样置两个 flags。

`oW` 是 confirmed-delete：普通边不再 snapshot，`lo` 不再显示旧组 warning，且 `cl` 不再运行 `mD` 分流。`oK` 是 script-delete-confirmed：关联边不再显示 warning，也不再单独 snapshot。RF 继续链条发生于 Promise microtasks，源 timeout0 用于之后复位；本机若采用 request owner/token 携带状态而不是共享 ref，需要记录这一维护适配，不能称源已有文档 CAS。

证据：`ui-on-before-delete`、`ui-old-storyboard-policy`、`main-confirmation-ref-initial`、`main-unconfirmed-clip-separation`、`main-aggregated-storyboard-confirm` 及相应 locale 片段。

## 3. `cl` 的真实阶段与确认聚合

`cl` 先在 restoring 时直接 `applyEdgeChanges` 并返回。正常情况下先 apply 非 remove changes，再从**当时最新 Canvas store 图**读取边和节点分类。按请求 remove change 顺序推进，editing targets 用 Set 去重，其它 ID 列表不自行规范化。

| 阶段            | 原站行为                                                                                                                                | 等待与取消                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 分类一          | target params 的 `segmentRemakeLock === true`、draft phase 为 editing、draft sourceNodeId 精确等于 edge.source，加入 editing target Set | **没有 target type gate**；优先于脚本关联 warning                                                                            |
| 分类二          | raw `data.type` 的 SCRIPT↔GROUP，group 的 sourceScript ID truthy；或 sourceScriptId 指向存在节点且有 hidden-row child 的 GROUP↔GROUP    | 进入同一个 storyboard edge ID 数组；SCRIPT_V2 不等于 raw SCRIPT                                                              |
| 分类三          | 其余边以及找不到原 edge 的请求 ID                                                                                                       | 进入 ordinary 列表；缺 edge 不凭空做 helper unlink                                                                           |
| clip 分流       | 仅 `!oW.current` 时，对 ordinary 列表调用 `mD`，分成 passthrough、transactions、blocked                                                 | busy 发通知并保留；`oW=true` 时跳过，合法 clip 边也会留在 raw ordinary 分支                                                  |
| ordinary 提交   | 若非已 confirmed 则 snapshot，然后 `handlePortraitEdgesRemoved` → raw `deleteEdges` → 如 helper 有结果则 raw `deleteNodes`              | 同步执行，发生在后面的关联确认之前                                                                                           |
| clip 启动       | 对 transactions 启动异步锁／fresh plan／patchGraph                                                                                      | 不 await 后再继续；详见第 7 节                                                                                               |
| editing 启动    | 必要时 snapshot，对 target IDs 调 `deleteNodesBatch`，每个 target 一个 atomic group                                                     | 不 await；完成后仅在 projectId 相同的情况下反馈失败                                                                          |
| storyboard 阶段 | 对整份关联 edge ID 数组只调用**一次** `confirm`，或在 `oK=true` 时直接执行                                                              | 接受时 snapshot（除 bypass）→ 逐 edge `unlinkStoryboardByEdge(...preserveEdge:true)` → raw `deleteEdges`；取消不执行这一子集 |

GROUP↔GROUP 资格严格保留源检查：先选择 source 端有 sourceScript ID 的组，否则选择 target 端；该 ID 对应的节点必须实际存在，**不检查该节点的 type**；被选择组的 direct children 中至少一项 `scriptRowHiddenUuid` truthy。这里没有 `sourceScriptVersion` gate，v2 派生 GROUP↔GROUP 也可能满足条件；它不同于 `li` 的旧组 node warning。它不是任意 group 连线。helper 如何按 image／video kind 清两端字段、GROUP↔GROUP 的 video 固定分支见 [已冻结 unlink 审计](./canvas-storyboard-unlink-source-audit.md)，本 proof 同时保存 helper 完整 body。

ordinary 阶段虽然调用 portrait helper，但实际绑定的 module581906 在这份归档中就是 `handlePortraitEdgesRemoved => []`、nodesRemoved no-op。不能将这个空实现推测成额外删除 portrait 节点的行为。raw `deleteEdges` 仍有其本身可证的 `iS`／`iu`／`ih`／`ig` 协议；两者不是同一件事。

关联确认文案为 `断开连线`／`断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？`，按钮 `确定断开`／`取消`。一个 mixed 批次不按每条关联边弹多个确认。共享 confirm 默认无 X、禁止遮罩点击关闭、Escape 走 onCancel；pending 时按钮禁用、显示 spinner，同步 reentry ref 防重复，catch 通知后 finally 关闭。但这里 `cl` 的 onConfirm 只同步执行关联子集，并没有 return clip／editing Promise；不能说该 spinner 会等待整批异步完成。

证据：`main-edge-removal-controller-and-bindings`、六段 `main-edge-*`／`main-unconfirmed-clip-separation`／`main-ordinary-edge-phase`／`main-clip-and-editing-launch`／`main-aggregated-storyboard-confirm`、`archived-portrait-removal-noop`、`shared-confirm-renderer-complete`。

## 4. mixed node＋edge 的 callback 顺序

RF 先把 incident edges 和显式选中边一起交给 `cl`。`cl` 展示关联 warning 后就返回，RF 随即调用 `lo`，不会等用户回答这份 warning。`lo` 自己也不 await 完成：它做组展开／部分父组几何／分镜 rows patch／atomic group 计划，再启动 `deleteNodesBatch`。

`lo` 的旧组二次 warning 只在 `!oW` 时存在；先 apply 非 remove changes，再确认后 snapshot、短暂置 confirmed、递归同 remove changes。正常键盘旧组已由 `li` 接受时，这一 warning 被跳过。`lo` 的画布锁入口会过滤 remove／select／position；协作 loading-owner／锁过滤和 atomic 请求仍独立于 RF `deletable` gate。

几个可证场景：

| 输入                                              | 源结果                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 纯普通 selected edges                             | 不经 node warning；ordinary 同步 snapshot／raw 删除                                                                      |
| 多条脚本关联 edges                                | 一个聚合关联 warning；取消保留这些边及绑定                                                                               |
| 普通 edge＋关联 edge                              | 普通部分先删，再一个 warning；取消只保留关联部分                                                                         |
| editing target edge＋关联 edge                    | editing 节点删除先启动，关联 warning 后出现；取消不取消在途 editing                                                      |
| 普通 IMAGE node＋独立关联 edge                    | `li` 无内容 warning；edge 阶段 warning 未回答时节点删除已启动；取消不会把普通节点恢复                                    |
| SCRIPT／旧组／opening node warning＋选中关联 edge | 初始 warning 接受后两个 flags 生效，关联直接 unlink／delete，避免第二 warning；初始取消则 RF 两种 callback 都不发        |
| 有 node warning 的节点＋合法 clip edge            | 接受后的 `oW` 让 clip 分流被跳过，此 source 用 raw ordinary edge 路径；不能宣称每条 clip 都执行同一 timeline transaction |

这里只证明调用顺序。editing 与 node batch 的实际锁响应／flush 完成顺序、clip Promise 与关联确认回答的先后都是异步结果，不能从静态调用顺序编造确定完成顺序。源普通阶段完成后取消不 rollback 是可证事实；相反“整批取消完全不改图”只适用于最前面的 `li` node warning 拒绝。

证据：`rf-delete-elements-controller`、`main-node-change-controller-and-bindings`、`main-clip-and-editing-launch`、`store-delete-nodes-batch`、`async-delete-lock-plan`。

## 5. Delete／Backspace 资格与未知的 readonly 外层

RF 按键订阅用 composedPath 的实际 target，INPUT／SELECT／TEXTAREA、own contenteditable 或 `.nokey` 祖先都属于 input DOM；delete listener 设置 `actInsideInputWithModifier:false`，所以加 modifier 也不删除正在输入的内容。blur／contextmenu／keyup 清按键 Set，null key config 不注册该 listener。菜单和剪刀是另外的入口，不能用这个按键 gate 代替全部动作授权。

| 已核真实入口                                  | 删除键                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| main canvasLocked 或 nodeFullscreenDepth>0    | resolver 返回 null                                                                                  |
| stored hand 或 Space held 得到 effective hand | 后置 cP 覆盖为 null                                                                                 |
| mark／focus／reference pick                   | 各实际 mode hook props 明确 null，后置 spread 生效                                                  |
| simulated practice                            | main 基础 delete prop 与 cL 均明确 null                                                             |
| share 与 workspace preview                    | 实际 ReactFlow props 明确 null；默认边 deletable false，share 还强制已有边 false；selection 仍 true |
| 单个 element `deletable:false`                | RF 候选过滤，不等于 elementsSelectable=false                                                        |

**尚未证明** main `isReadonly` 直接关闭删除键。实际 main 读取 `aj` 并用于 class／其它 capability，但上述 resolver 与 mode overrides 没有读取 `aj`。是否外层把 readonly 同步成 canvasLocked，这次链条没有确证。share／workspace preview 的明确 null 不能反推所有 main readonly 状态。

同样不能从 `elementsSelectable:false` 推断 capture、publish-protection 或普通非 simulated practice 的已选 edge Delete 一律关闭。capture 内联 props 只写 drag／select／connect false，非 simulated practice 未无条件写 null；其它全局保护若存在需独立核对。后续本机 readonly guard应保持已有禁止写入约定，这是合理的本地边界，不能冒称本次归档已证明全部源门控。

证据：`rf-keypress-subscriptions`、`rf-input-dom-predicate`、`main-delete-props`、三个 `*-mode-delete-key-override`、`main-effective-hand-state`、`main-hand-override`、`main-keyboard-resolver-call`、`main-late-mode-props-order`、两个 preview props 与 `main-readonly-state`／`main-capture-props`。

## 6. source history 不等于按事件次数计 undo

`takeSnapshot` 的 M 保存 cloned before nodes／edges 到 `k`。当 `T.current && k.current` 时再次调用不覆盖这个 before，所以同一微任务窗口内的普通 edge 与 node callback snapshot可以合并。M 的 `queueMicrotask` **只执行 `T.current=false`**，没有调用 j，没有清 k，也没有立刻生成 undo entry。

j 在下一次非合并 snapshot、Undo、卸载 cleanup 或显式同步 history transaction 触发时，才拿当前图与 pending before 做 diff。两个 patch 都为空则不新增历史。显式 A transaction 则 before→同步 mutation→finally j，registry按 store／project 绑定。普通 `deleteNodesBatch` body没有调用这个 registry transaction，不能凭它返回 Promise 就称整个 selected 批次有一个 await 完成的历史 transaction。

因此普通部分之后过一段时间接受关联 warning，会先 finalize 已有 pending before，再记录关联阶段 before；同一微任务内 bypass 的关联和节点阶段可以共享 pending before。迟到 editing／clip 完成以及期间另一次 snapshot 会影响分段；这份 static code不足以保证任意异步组合固定只需一次 Undo。

diff 同时记录 node 与 edge 补丁、touched-node existence／version；过滤 temporary nodes／edges；上限100。Undo先 j，再检查节点存在／版本、他人删除锁和 loading task 修改，失败可清历史；Redo也有 guard。metadata unlink与 edge移除须一起恢复；只把线插回而不恢复 script/group字段，不符合这些 patch 的内容。该版本门控、100ms恢复后同步及多人协作，与本机完整 JSON snapshot／CAS历史是不同实现。

证据：`ui-history-snapshot`、`ui-history-finalize`、`ui-history-sync-transaction`、`ui-canvas-history`、`history-registry`、`ui-history-undo`、`ui-history-redo`、`history-version-limits-and-temporary-filter`。

## 7. VIDEO_CLIP 与实际服务边界

`mD` 是 VIDEO／AUDIO→VIDEO_CLIP 的独立纯时间轴断线计划，不能混入 storyboard unlink。目标 running agent 在一小时内阻断；其余按 target聚合，逐 edge计算 timeline。clip controller并发请求两端 locks，捕获 storeInstanceId／projectId／projectGeneration；等待后要求 owner仍一致，按最新图重算；每个 target 的所有相关边和两端都获准才接受，一次 patchGraph带timeline补丁与删边，snapshot作为 beforeApply，finally释放请求。busy／denied／timeout／aborted／partial 结果是可实现的前端状态。

raw node batch则按 ID 顺序请求 locks，传播传入 atomic group失败，删成功部分、执行 mutateBeforeFlush、await flush；HTTP失败时本地图可能已变化，并不自动 rollback。callback顺序与实际完成／保存结果必须分别报告。

纯 timeline 双 normalize、主轨紧排、linked audio、转场、时长与播放头、异步 owner／fresh graph、目标单位接受的完整合同见 [clip 断线审计](./canvas-clip-disconnect-source-audit.md)。这份前端不能全归为“等后台”。真实协作锁持有人、团队权限、云同步结果、AI 剪辑和媒体合成／上传才是实际服务边界。本次未运行原服务或账号，不验证服务结果。

## 8. 下一批前端实现清单与接口建议

本节是实现建议，**没有编写生产模型或控制器**。保留模型／controller／view分层，不把 generic RF 理想行为替代上述实际 caller。

- 纯候选 helper接收 nodes／edges 与选中 IDs，输出 RF 顺序的候选 node／edge数组，并保留 per-element deletable gate、incident-first顺序。
- node-warning helper只决定 source资格／文案／优先级；controller等待初始确认，取消整个 RF候选，接受后携带本次 confirmed状态。不要把 node menu内容确认移入这个 helper。
- edge-phase planner接收当前图、候选 edge IDs与两种 confirmed状态，输出 ordinary IDs、editing target IDs、storyboard IDs、clip计划及明确阶段顺序。缺 edge按源进入ordinary，type-agnostic editing优先，raw SCRIPT与V2保持区别。
- controller先 ordinary commit，再启动clip与editing，然后对storyboard edge ID 数组显示一个确认；mixed的 node callback在edge callback之后启动，不等待storyboard结果。需要明确部分取消、异步成功／失败与保留选择。
- 接受storyboard子集时，用最新草稿／图恢复完整绑定协议并一次提交该phase；其余已执行phase不能因该warning取消被整体rollback。已有CAS、active／retired draft、history及owner保护可以复用，但必须标记为本机维护性协议，原回调本身没有这些guards。
- 键盘按实际模式和输入资格门控；只读仍可选择，写入按本机readonly约定拒绝。删除之后退休当前edge选择，不让同ID重现恢复旧选择；这是本机生命周期要求，不能仅以源selected dispatcher存在代替验收。
- history必须覆盖原完整before／after图及两端metadata，并明确异步分段适配。不能把API返回的“RF允许删除”当作真正保存成功。
- clip前端独立接线与完整验证；如果下一批先做selected／mixed基础，必须继续保留其未完成状态，不能暗中把用户节点交互目标缩窄为这一批base。

强验场景应按上述协议给 hardcoded expected：ordinary＋多个关联edge一次confirm／cancel保ordinary、initial node warning cancel零图、accepted flags避免二次confirm、editing边与关联边共享target、selected node＋independent关联edge的先后、incident-first ordering／deletable false、旧组与v2优先级、模式／input门控、最新draft／owner A→B→A、失败重试／partial success、undo／redo及持久化。只有pure happy path或当前393／398等历史check数字不能证明这些未来功能已验收。

## 证据定位与未完成项

所有片段完整原文及三坐标见独立 proof。下方索引由实际片段 metadata生成；UTF-16坐标均为半开范围。未执行原脚本、未观察原native keyboard；异步完成顺序、主readonly外层、协作服务实际响应、source只有一个global confirm时同时打开其它确认的交互，以及真机／Safari／高DPR／大图均未证明。整个前端复刻目标保持进行中。

| proof ID                                                        | research/source 文件 | UTF-16 半开范围    |
| --------------------------------------------------------------- | -------------------- | ------------------ |
| `rf-delete-key-selected-dispatcher`                             | `1kb-4b4zv9_2a.js`   | `[31030, 31431)`   |
| `rf-keypress-subscriptions`                                     | `1kb-4b4zv9_2a.js`   | `[6880, 8168)`     |
| `rf-selected-predicate`                                         | `1kb-4b4zv9_2a.js`   | `[15779, 15799)`   |
| `rf-delete-elements-controller`                                 | `1kb-4b4zv9_2a.js`   | `[13801, 14264)`   |
| `rf-elements-to-remove-gates`                                   | `1kb-4b4zv9_2a.js`   | `[94661, 95261)`   |
| `libtv-reactflow-actual-props`                                  | `21_0xvlvkw1sz.js`   | `[963386, 964871)` |
| `libtv-share-reactflow-props`                                   | `16b_iv9sex3zl.js`   | `[30491, 31000)`   |
| `libtv-share-edges-forced-nondeletable`                         | `16b_iv9sex3zl.js`   | `[11316, 11387)`   |
| `libtv-share-default-edge-style-nondeletable`                   | `16b_iv9sex3zl.js`   | `[12679, 12750)`   |
| `libtv-shared-layer-model-plan`                                 | `10v03g6udfcrl.js`   | `[36327, 39622)`   |
| `libtv-hover-scissors-edge-complete`                            | `10v03g6udfcrl.js`   | `[27020, 32199)`   |
| `libtv-workspace-preview-reactflow-props`                       | `16k_l1hir0zic.js`   | `[15706, 16195)`   |
| `ui-on-before-delete`                                           | `21_0xvlvkw1sz.js`   | `[888356, 889130)` |
| `ui-old-storyboard-policy`                                      | `21_0xvlvkw1sz.js`   | `[689699, 690586)` |
| `ui-keyboard-props-definition`                                  | `2yyck7brx0tqq.js`   | `[34910, 35151)`   |
| `ui-history-snapshot`                                           | `21_0xvlvkw1sz.js`   | `[759863, 760027)` |
| `ui-history-finalize`                                           | `21_0xvlvkw1sz.js`   | `[757318, 759844)` |
| `ui-history-sync-transaction`                                   | `21_0xvlvkw1sz.js`   | `[760027, 760143)` |
| `ui-canvas-history`                                             | `21_0xvlvkw1sz.js`   | `[756155, 763691)` |
| `ui-history-undo`                                               | `21_0xvlvkw1sz.js`   | `[761944, 762464)` |
| `ui-history-redo`                                               | `21_0xvlvkw1sz.js`   | `[762464, 762978)` |
| `history-version-limits-and-temporary-filter`                   | `21_0xvlvkw1sz.js`   | `[706131, 707880)` |
| `store-delete-nodes-batch`                                      | `0leiedr1esdbe.js`   | `[107764, 108250)` |
| `async-delete-lock-plan`                                        | `0leiedr1esdbe.js`   | `[42051, 43437)`   |
| `store-delete-edges`                                            | `0leiedr1esdbe.js`   | `[116272, 117447)` |
| `editing-node-cascade-helpers`                                  | `0leiedr1esdbe.js`   | `[88520, 89212)`   |
| `ui-clip-disconnect-plan`                                       | `21_0xvlvkw1sz.js`   | `[696043, 696953)` |
| `clip-agent-editing-predicate`                                  | `0-8_zejn_ex9w.js`   | `[17357, 17457)`   |
| `ui-clip-async-delete`                                          | `21_0xvlvkw1sz.js`   | `[941565, 942993)` |
| `script-group-unlink`                                           | `3u6hjewm8qox_.js`   | `[71856, 72517)`   |
| `script-group-unlink-by-edge`                                   | `3u6hjewm8qox_.js`   | `[72934, 73555)`   |
| `store-patch-graph`                                             | `0leiedr1esdbe.js`   | `[99342, 102155)`  |
| `request-edit-lock`                                             | `0leiedr1esdbe.js`   | `[242737, 244782)` |
| `release-edit-lock`                                             | `0leiedr1esdbe.js`   | `[244782, 245820)` |
| `main-edge-removal-controller-and-bindings`                     | `21_0xvlvkw1sz.js`   | `[940996, 945168)` |
| `main-node-change-controller-and-bindings`                      | `21_0xvlvkw1sz.js`   | `[878010, 888355)` |
| `main-edge-restore-and-split`                                   | `21_0xvlvkw1sz.js`   | `[942993, 943149)` |
| `main-edge-classification`                                      | `21_0xvlvkw1sz.js`   | `[943149, 943987)` |
| `main-unconfirmed-clip-separation`                              | `21_0xvlvkw1sz.js`   | `[943987, 944206)` |
| `main-ordinary-edge-phase`                                      | `21_0xvlvkw1sz.js`   | `[944206, 944349)` |
| `main-clip-and-editing-launch`                                  | `21_0xvlvkw1sz.js`   | `[944349, 944590)` |
| `main-aggregated-storyboard-confirm`                            | `21_0xvlvkw1sz.js`   | `[944590, 944926)` |
| `main-mode-hook-bindings`                                       | `21_0xvlvkw1sz.js`   | `[752107, 752282)` |
| `main-reference-mode-hook-binding`                              | `21_0xvlvkw1sz.js`   | `[752900, 753064)` |
| `main-late-mode-props-order`                                    | `21_0xvlvkw1sz.js`   | `[964746, 964871)` |
| `main-hand-override`                                            | `21_0xvlvkw1sz.js`   | `[961119, 961257)` |
| `main-practice-override`                                        | `21_0xvlvkw1sz.js`   | `[961257, 961612)` |
| `main-keyboard-resolver-call`                                   | `21_0xvlvkw1sz.js`   | `[961612, 961759)` |
| `main-delete-props`                                             | `21_0xvlvkw1sz.js`   | `[964379, 964435)` |
| `main-effective-hand-state`                                     | `21_0xvlvkw1sz.js`   | `[751511, 751681)` |
| `main-capture-props`                                            | `21_0xvlvkw1sz.js`   | `[753457, 753958)` |
| `main-confirmation-ref-initial`                                 | `21_0xvlvkw1sz.js`   | `[763768, 763807)` |
| `main-focus-module-import`                                      | `21_0xvlvkw1sz.js`   | `[696957, 696971)` |
| `main-mark-module-import`                                       | `21_0xvlvkw1sz.js`   | `[697248, 697262)` |
| `main-reference-module-import`                                  | `21_0xvlvkw1sz.js`   | `[705890, 705904)` |
| `main-keyboard-module-import`                                   | `21_0xvlvkw1sz.js`   | `[708919, 708933)` |
| `main-portrait-module-import`                                   | `21_0xvlvkw1sz.js`   | `[690953, 690967)` |
| `main-history-registry-module-import`                           | `21_0xvlvkw1sz.js`   | `[706116, 706130)` |
| `main-edge-renderer-module-import`                              | `21_0xvlvkw1sz.js`   | `[108873, 108887)` |
| `main-readonly-state`                                           | `21_0xvlvkw1sz.js`   | `[725524, 725564)` |
| `focus-mode-delete-key-override`                                | `27g5ro4e8nocv.js`   | `[23135, 23781)`   |
| `mark-mode-delete-key-override`                                 | `27g5ro4e8nocv.js`   | `[23775, 24675)`   |
| `reference-mode-delete-key-override`                            | `3zez5ighjd7k4.js`   | `[18993, 20313)`   |
| `space-overrides-tool-to-hand`                                  | `1fn_ozkqd_aiz.js`   | `[27914, 27948)`   |
| `workspace-preview-default-edge-nondeletable`                   | `16k_l1hir0zic.js`   | `[4960, 5030)`     |
| `rf-input-dom-predicate`                                        | `1kb-4b4zv9_2a.js`   | `[133301, 133480)` |
| `rf-input-dom-node-names`                                       | `1kb-4b4zv9_2a.js`   | `[98554, 98586)`   |
| `archived-portrait-removal-noop`                                | `3u6hjewm8qox_.js`   | `[64254, 64367)`   |
| `history-registry`                                              | `2_j26j0yfra03.js`   | `[8202, 8466)`     |
| `locale-deleteNodeConfirmTitle`                                 | `flight-rows.json`   | `[138235, 138268)` |
| `locale-deleteNodeConfirmMessage`                               | `flight-rows.json`   | `[138285, 138362)` |
| `locale-deleteNodeConfirmText`                                  | `flight-rows.json`   | `[138790, 138822)` |
| `locale-openingDeleteNodeTitle`                                 | `flight-rows.json`   | `[345299, 345336)` |
| `locale-openingDeleteNodeMessage`                               | `flight-rows.json`   | `[345353, 345428)` |
| `locale-storyboardGroupDeletePolicyDeleteStoryboard2`           | `flight-rows.json`   | `[278960, 279016)` |
| `locale-storyboardGroupDeletePolicyRegenerateDeleteVideoScript` | `flight-rows.json`   | `[279033, 279143)` |
| `locale-storyboardGroupDeletePolicyDeleteStoryboard`            | `flight-rows.json`   | `[279160, 279216)` |
| `locale-storyboardGroupDeletePolicyDeleteScriptStoryboard`      | `flight-rows.json`   | `[279233, 279325)` |
| `locale-storyboardGroupDeletePolicyDeleteVideoStoryboard`       | `flight-rows.json`   | `[279342, 279404)` |
| `locale-storyboardGroupDeletePolicyDeleteVideoStoryboard2`      | `flight-rows.json`   | `[279421, 279514)` |
| `locale-disconnectEdgeTitle`                                    | `flight-rows.json`   | `[216849, 216879)` |
| `locale-disconnectEdgeMessage`                                  | `flight-rows.json`   | `[216896, 216960)` |
| `locale-disconnectConfirmText`                                  | `flight-rows.json`   | `[216977, 217009)` |
| `locale-useCanvasContextMenuDelete`                             | `flight-rows.json`   | `[314967, 315004)` |
| `locale-groupRunConfirmPlanCancel`                              | `flight-rows.json`   | `[287259, 287293)` |
| `locale-cancel`                                                 | `flight-rows.json`   | `[46312, 46327)`   |
| `shared-confirm-renderer-complete`                              | `3vx5r5m_ep13u.js`   | `[112, 5999)`      |
| `ui-provider-callback-values`                                   | `21_0xvlvkw1sz.js`   | `[960065, 960652)` |
| `main-provider-binds-callbacks`                                 | `21_0xvlvkw1sz.js`   | `[962402, 962449)` |
| `main-tool-mode-module-import`                                  | `21_0xvlvkw1sz.js`   | `[136727, 136740)` |
| `effective-tool-and-space-export-binding`                       | `1fn_ozkqd_aiz.js`   | `[27948, 28523)`   |
| `rf-trigger-node-changes-callback`                              | `1kb-4b4zv9_2a.js`   | `[62766, 62945)`   |
| `rf-trigger-edge-changes-callback`                              | `1kb-4b4zv9_2a.js`   | `[62946, 63125)`   |
