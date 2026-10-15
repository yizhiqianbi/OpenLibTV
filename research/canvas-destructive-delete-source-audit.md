# 全局删除、特殊锁与图后效：真实源码合同

2026-10-13。本任务开始时逐项核对上一批 `canvas-reference-delete-current-source-snapshot.json` 的 1135 个源码／配置／测试 SHA，全部匹配。此后并行实现可以改变工作区；本文不将旧 snapshot 宣称为新实现的冻结检查。上批 379 文件／5193 测试是上批验证，不是本批全量检查。

本审计仅静态读取已经归档的原站脚本，独占写本文与 [源码证明 JSON](../artifacts/canvas-destructive-delete-source-proof.json)。证明包含 **10 个原文件、95 段 excerpt**，分别计算 UTF-16 code units、Unicode code points、UTF-8 bytes 的半开范围、源文件 SHA 与每段 excerpt SHA。没有执行／import 原 bundle，没有浏览器、网络、账号、原站写入、构建或生产／测试／根文档修改。确认、特殊编辑锁、级联、分镜关联、timeline 等均是实际前端入口的分支，不能因真实服务延期就称为不可达。

## 1. 实际入口与两个不同的删除层

CanvasProvider 的实际值提供 `takeSnapshot`、`deleteEdgeById`、undo／redo。ReactFlow 真正接 `onNodesChange`、`onEdgesChange`、`onBeforeDelete` 与 `deleteKeyCode`；shortcut registry 的 Delete／Backspace 条目 `handlerOptional:true`，不能仅安装一个空快捷键 handler。锁定画布或节点全屏时键盘 resolver 返回 `deleteKeyCode:null`；hand／reference-pick／跟练等 props 还可覆盖。菜单与生成器参考 X 均能进入实际删除回调。

| 层 | 删除节点 | 删除边 | snapshot／返回值 |
| --- | --- | --- | --- |
| UI callback | 资格／确认、组后代展开、部分父组几何／分镜绑定、atomic locks，再 `deleteNodesBatch` | 编辑续写目标、脚本关联确认、ordinary passthrough、clip 异步事务分别处理 | caller 决定 snapshot；不能按 store 的 `ig` boolean 判断图是否变化 |
| raw store | `deleteNode`／`deleteNodes` 扩 editing continuation targets，移节点及相连 edges，释放剩余孩子、清两种 linked 指针，重算 surviving targets | `deleteEdge`／`deleteEdges` 先处理 editing continuation target 删除，再普通 character cleanup／`ih`／`ig` | 普通删除返回 void；`deleteNodesBatch` Promise 返回 succeeded／failed |

UI 删除 group／video_group 展开全部后代；raw store 单删 group 却释放未被删的孩子。两种行为不能混称一套源合同。PenStudio 当前 edge double-click 是本机触发入口；本审计证明其应调用的实际删除事务，不凭代码推断原站也使用同一手势。

证据：`ui-reactflow-delete-wiring`、`ui-delete-shortcut-registration`、`ui-reactflow-keyboard-resolver`、`ui-keyboard-props-definition`、`ui-provider-callback-values`、两个完整 `ui-handle-*-change`。

## 2. raw node 删除的精确顺序

`deleteNode(id, options)` 先用当前原图执行 `im(nodes, edges, [id])`；如找到 editing continuation target，直接转 `deleteNodes([id,...targets], options)`。否则 advance incarnation，再准备同步删除与 group-child／linked patches。实际本地 mutation 顺序是：

1. `deletingNodeIds` 标当前删除 ID；按 **旧 edges 数组顺序** 收集 source 为该 ID 的 targets，用 Set 去重。
2. 清存活节点 `data.linkedImageGroupId`／`linkedVideoGroupId` 中指向删除 ID 的字段值，删除节点和所有 source／target 为该 ID 的 edges，清 editingClip／panorama preview 等 transient 状态。
3. 对存活、直接 parent 被删的孩子执行 child cascade；再为旧 outgoing targets 调 `ig`，随后将该 target 任何 truthy `data.isStale` 改 false，保留 staleVersion。
4. 提交特殊 returned-true targets 的同步；microtask 清 `deletingNodeIds`。

`deleteNodes(ids, options)` 先 `iv`：原 IDs 加 `im(原 IDs)`，Set 去重，**只有一次扩张**。`im` 按 seed IDs／各自旧 outgoing edges，找到目标 `params.segmentRemakeLock === true`、`draft.phase === "editing"`、`draft.sourceNodeId === sourceId`；没有目标 type gate，也不是不断递归直到固定点。batch 的 affected targets 仅旧 edge 中 source 属于删除 Set、target 不属于删除 Set者；按旧 edge 顺序去重。之后与 single 一样 child／linked changes → `ig` → truthy stale false。

raw node 删除 **没有调用 `ih`**，不会自行清 surviving targets 的 `groupRefExcludedNodeIds`；childNodeIds、其它 membership、style、剩余节点 selected 也没有通用清理。不能借助另一套方便的 normalize 改写源字段，再称为原版行为。

module306449 的 child cascade 默认仅 `deletedParent.position + child.position`，然后 `parentId`／`extent` 设 undefined；`skipCascade:true` 时不加坐标，却仍解除 parent／extent。广播 helper 则在 skipCascade 时返回空数组。清 linked 指针只涵盖 `linkedImageGroupId`／`linkedVideoGroupId`，不清其它字段。对嵌套 ancestry 使用 `canvasWorldPosition` 保完整世界坐标，是本机已有维护约定与本轮授权的适配，应明确区别这一层原始单父坐标合同。

证据：`store-delete-node`、`store-delete-nodes`、`editing-node-cascade-helpers`、`children-and-linked-group-cascade`、`collab-ungroup-allowlist`。

## 3. raw edge 删除、excluded 与特殊锁

`iS` 从请求删除的旧 edge IDs 找 editing continuation target，条件与上节相同。single `deleteEdge` 命中时删除这些 **target 节点**并返回，保留 source。batch `deleteEdges` 先 `deleteNodes(iS targets)`，再从请求 IDs 中排除旧 edge.target 属于这个初始 target Set的 IDs；若还有请求，继续在最新图删边。不能将 editing continuation 简化成只删 edge、清 params 或立即解锁。

ordinary edge 分支先以 removed edge 移除源的 persisted character reference，再移 edges；`ih` 清 removed group edges 对应的 exclusions，然后对 removed edges 的 targets执行 `ig`。targets 仍按实际 old/current edge 数组顺序 Set 去重，而非请求 ID 列表排序。edge 路径没有 node 路径最后的 stale false。

这条 persisted reference cleanup是实际 `iu` → module25185：仅 source.data.characterAsset truthy、characterReferences为 truthy object且非array时检查。先spread成r，edge ID `in r`才删该key并返回新的data，保留显式空 `{}`；没key或不满足门控返回原data。这是edge-only，不是删source、清全部roles或认证写请求。raw nodeDelete没有调用iu，不能用同一方便的角色清理扫 retained sources。

`ih` 仅 group／video_group／video-story source，展开其当前完整 leaf 集合，从目标 excluded set 去掉这些 IDs；仍有其它 exclusions则保留，全部为空才删字段。不以可用媒体数量代替 leaf，不清无关组，也不把此规则套给 node 删除或 `patchGraph`。前一批 [普通参考删除审计](./canvas-reference-delete-source-audit.md) 的 raw old typed arrays、stored asset 保留、order 与 token 两阶段协议在这里继续适用。

`ig` boolean 是 **detached submitted segment 的特殊同步标记**，不是“是否修改图”或“是否删除成功”。panorama、SCRIPT style、普通 params、picture reset等会修改 data 却返回 false；普通删除函数也并不返回可供 UI 直接 `if (accepted)` 使用的成功 boolean。

证据：`store-delete-edge`、`store-delete-edges`、`persisted-character-reference-helpers`、`persisted-character-store-cleanup`、`group-excluded-cleanup`、`target-recalc-ig`、`store-recalc-target`、`store-target-data-signature`。

## 4. UI 组展开、部分删除与 geometry

module96063 的 `expandGroupDeleteTargets` 只依据 **flow node.type** 为 group／video_group，使用实际 parentId BFS 加入所有后代，保持原请求在前、各后代按原 nodes 顺序，最后 filter(Boolean)／Set 去重。video-story 不在该集合。原 helper没有 cycle 防护；本机阻止损坏图挂住 UI 是防御性适配，不是已确认的原行为。

`handleNodesChange` 对初步 expanded T，在旧 nodes M 上一次计算受影响直接父节点：按 T 顺序建立 parent Set，仅排除已在 T 的父 ID，没有 parent.type gate。每个父组剩余 child 是真实 direct parentId 且不在 T；这不是 childNodeIds 元数据列表。

- 余 child `<=1`：父 ID追加删除；唯一 child 记录 `absX = oldParent.x + oldChild.x`／y，后续清 parent／extent。追加父 ID后不再递归运行祖父清理。
- 余 child `>=2`：尺寸精确取 `measured?.width ?? width ?? 0`／height。取 child相对 minX/minY/maxRight/maxBottom；zoom为 viewport.zoom `|| 1`。padding原式 `20 + 20 * (sqrt(z)-z) / z`，相当于 `20/sqrt(z)`。父 position为旧 position + min − padding，width／height为跨度 + 2padding，同时写 measured。孩子 position减同一个 min−padding，维持该层原世界位置。**不加36标题 padding**，不写 data.nodeWidth／Height、style、name、selected或普通 childNodeIds。

后续 F 为释放 child、resize父、移动 child的 IDs去重；G为分镜绑定 patch的 groups。atomic groups先用 `buildAtomicDeleteGroups(T,M)`，再加入 `[...T,...F]` 与 `[...T,...Ggroups]`，extraLockNodeIds为 F＋Ggroups。`deleteNodesBatch` 删除后、flush前按 **free child → 全部 groupResizeUpdates → 全部 childPosUpdates → 分镜 dataPatch** 执行。updateNodes 对字段浅合并；同一 nested group既需 resize又是另一父组 child时，最后 child position仍要保留此前新的尺寸，不能逐 parent覆盖整份旧节点。

`pF` 是其它 drag／dimension路径的 grow-only扩壳，用 estimateNodeFlowSize、20 padding＋36标题 top padding，不是上述 delete shrink。现有普通组 layout的36／66等参数也不能替代此处算法。nested world free及 bounded surviving ancestor consumers本轮由 Root明确采用本地优化；其它源 geometry/order不得借机统一。

证据：`ui-group-delete-targets`、`ui-group-zoom-padding`、`ui-partial-parent-delete-geometry`、`ui-partial-parent-atomic-commit`、`store-update-nodes-shallow-order`、`ui-grow-only-parent-shell`。

## 5. 分镜 p2 绑定与 script edge unlink

`p2(T,M)` 遍历存活 flow group且 `data.storyboardGroupType === "image"`。rows来自 `sourceScriptNodeId` 指向 script的原 data.rows，无 source ID则为空；如 `storyboardSourceRowHiddenUuids` 是非空 array，就按 **原 rows顺序** 过滤 hiddenUuid membership，不按 metadata数组重排。

module556544 的 binding helper：group本身被删返回 null；实际孩子按 tM排序再过滤 IMAGE，有实际 image child被删才生成 patch。tM有非空 preferred childNodeIds时保留存在项，**部分 preferred也采用、重复也保留**，再追加没出现过的实际孩子按 numeric name排序；absent／empty preferred则全部 numeric name。它不是 General layout的“完整 preferred否则全部 fallback”规则。

对剩余 image child收 `childNodeIds`；其 hiddenUuid取自身 `data.scriptRowHiddenUuid || rows[原删前 image index]?.hiddenUuid`。删除不能把 fallback index提前重编号。返回仅 `{childNodeIds, storyboardSourceRowHiddenUuids}`，显式空数组保留，不清 sourceScriptNodeId、不改 name。

script/group edge的 UI callback在确认之后先 snapshot，再 `unlinkStoryboardByEdge({source,target},{preserveEdge:true})`，最后 `deleteEdges`。unlink按 image／video kind清 script中**确实匹配当前group**的 linked字段，清group的 sourceScriptNodeId／storyboardTitle；preserveEdge避免 helper先偷偷再删边。raw data update经 t4/t5 merge，再 t6删除 patch中 undefined顶层键。GROUP↔GROUP有源script及隐藏行绑定的边也可进入该确认；不能只断线而留下分镜关联。

证据：`ui-storyboard-binding-collector`、`storyboard-binding-child-order`、`storyboard-delete-binding-patch`、`script-group-unlink`、`script-group-unlink-by-edge`、`store-update-data-normalization`、`store-update-node-data`、`ui-handle-edges-change`。

## 6. ig 特殊目标、picture与segment的顺序

这层判断依据 raw **data.type**，与 UI组展开的 flow type不是同一协议：

| 条件，按此先后 | data结果与返回 |
| --- | --- |
| 无 target/data | false；无重算 |
| space-scene-720 或 director-console-3d | 非 portraitVirtual/assetVirtual输入 → group展开 → collector的第一张 image；只取该 image.url字符串trim非空值，否则 panoramaUrl undefined。保留其它 data／params，返回false；第一张空URL不会换第二张 |
| script | 仅 `il`，写 imageGenConfig，返回false；script-v2不在此特殊分支 |
| 无params | false；无 ordinary列表／prompt重写 |
| ordinary | 从当前图收 inputs并保留 stored asset refs，沿旧 typed/order/mode/model解释 token，随后检查以下两种锁 |
| segmentRemakeLock严格true、draft.phase submitted、filtered incoming中已无draft.sourceNodeId | 优先于 picture reset；移除 lock／draft，保留其余params，写新列表及 remapped prompt去 SegmentRange token；不二次trim；再 il→lens，返回true |
| 其它 pictureEditLock truthy且新videoList为空 | params只剩 prompt `""`、model旧值 `?? ""`、modeType `""`、count1、settings `{}`与新 text/image/audio及空videoList；不spread advanced／magic／orders／locks等旧extra；再 il→lens，返回false |
| 其它ordinary | oldparams spread＋新prompt/lists，再 il→lens，返回false |

`il` 仅 IMAGE／SCRIPT：connected MATERIAL_STYLE先、manual非 `_fromStyleNode` 后，按uuid第一次优先，明确比较指定 signature；fineTuneType推导为undefined不会删除oldparams spread带来的旧值。IMAGE成功 taskId、loading!==true且isStale!==true会置stale并加版本；**raw node deletion之后还会清stale，edge不清**。SCRIPT不走IMAGE stale。

lens仅VIDEO direct MATERIAL_LENS，重建对应 effects／lensModels；保留manual正数effects与 extraConfig.effectId，connected version只typeof number，source并未加positive／finite gate；models按uuid去重，equal gate只比较uuid序列及effects序列，不deep compare metadata。空effects／models移除相应键，保留prompt与其它params。细项已在 [普通删除审计](./canvas-reference-delete-source-audit.md) 记录，本证明保存独立完整body。

证据：`node-types`、`target-recalc-ig`、`material-style-il`、`lens-recalc`、`segment-range-regex`、`segment-range-strip`及 `ordinary-*`。

## 7. 确认资格、文案与取消

以下文案来自归档中文 locale，完整 key/value及偏移在证明的 `localeValues`／`locale-*`。真实 keyboard、普通菜单与script edge确认资格不同，不能强行折成一个“任何非空节点都确认”的规则。

| 入口 | eligibility与顺序 | 文案／取消 |
| --- | --- | --- |
| Keyboard onBeforeDelete | 优先 SCRIPT或SCRIPT_V2；否则旧分镜group policy；否则 VIDEO openingUsed；其余直接true | script：`确认删除`／`删除当前节点后，数据可能会丢失，也可通过 {undoShortcut} 撤销。确定要删除吗？`。确认 snapshot→confirmed flags true→resolve true→timeout0复位；取消resolve false，无snapshot |
| 普通node menu | 精确特殊判断只SCRIPT；group的sourceScriptVersion v2直接执行，旧分镜走policy；其它url/content array内有trim非空项才确认，空内容直接删 | 内容：`删除节点`／`该节点包含已生成的内容，删除后可通过 {undoShortcut} 撤销。确定删除？`；取消不进 mutation |
| 旧分镜image／video／两者 | group且sourceScriptNodeId为非空string，sourceScriptVersion不是v2；按是否video选择policy | `删除分镜图组`／`删除分镜视频组`／`删除分镜组`，message明确组内节点和关联将消失；确认后才 snapshot／展开删除 |
| openingUsed VIDEO keyboard | 没有script或旧group优先条件时 | `确认删除该节点？`，message明确创意片头关联内容与已发送画布内容的差异 |
| script/group边 | data.type script/group有sourceScript或关联group隐藏行条件 | `断开连线`／`断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？`，按钮`确定断开`／`取消`；取消保留该script边和关联 |

sourceScriptNodeId的非空检查是 string.length>0，未trim；空白string也满足原p$。内容条件原样为 `some(item => !!item?.trim())`，没有typeof string guard，也不是可选调用trim方法；有效源数据为string／nullish。本机对坏数据加string guard应另标防御性适配，不能改称原义。SCRIPT_V2普通菜单未命中SCRIPT特殊分支时仍会继续内容条件；source-linked v2 group直接执行会绕过生成url内容确认。

常用确认按钮为`确定删除`／`取消`，Mac undoShortcut为⌘Z，其它Ctrl+Z。混合 edge remove callback会先处理ordinary／editing／clip，再发script确认；取消script确认不能假称先前ordinary删除也被撤销。已 confirmed的source flags防重复确认与snapshot；本机modal需明确owner／文档退休保护与dialog-stack，但这不是原code已有CAS协议。

证据：`ui-on-before-delete`、`ui-normal-node-menu-delete`、`ui-storyboard-group-menu-delete`、`ui-old-storyboard-policy`、`ui-handle-edges-change`与locale。

## 8. 异步 batch与clip断连

`deleteNodesBatch` 先从原 requested IDs算iv扩张，再给每个源及其editing continuation加atomic group。Q按去重的 delete＋extraLock IDs **顺序** 请求锁，timeout默认3000ms、使用当前abort signal；ok或no_api视为成功。失败按传入atomic groups的遍历顺序传播到组内其它锁节点；原规则不是任意重叠组的无限闭包。可删除成功IDs先 `deleteNodes`，再 mutateBeforeFlush、清旧失败消息、await flush。HTTP失败报告 `succeeded:[]`／http_failed，**本地图已变更，没有自动rollback**；finally释放已请求的锁。source前半锁请求不在这段try/finally中，不能凭审计保证任意adapter throw均自动释放；本机adapter取消／错误处理应另测。

VIDEO／AUDIO→VIDEO_CLIP被mD分成timeline transactions；agentEditing为running且startedAtMs未知、或距离小于一小时则阻止。async callback对涉及source／target去重后并发请求锁，异常映为aborted；await后校验 storeInstanceId、projectId、projectGeneration，使用最新图重算mD，再仅提交目标及每条边两端均获锁的transactions。patchGraph写clipTimelineData与deleteEdgeIds，snapshot在**成功授权后的beforeApply**；finally释放全部请求锁。

`disconnectTimelineSource` 删除对应媒体kind的source ID及clips，重新layout、限幅currentTime。没有匹配source/clip返回null；仅source列表命中而无clip时只更新该列表。ordinary `ig`不等于这个timeline事务。真实网络锁、clip服务和多人状态需要adapter与后续验收，但前端分支和本地可注入失败状态仍在复刻范围内。

证据：`store-delete-nodes-batch`、`async-delete-lock-plan`、`ui-clip-disconnect-plan`、`ui-clip-async-delete`、`clip-plan-helper-bindings`、`clip-agent-editing-predicate`、`clip-timeline-disconnect`。

## 9. 历史与 surviving group consumers边界

原history `takeSnapshot M`保存pending before，**不立即push**。同microtask内重复snapshot可共享before；下一次snapshot、undo或cleanup调用j finalize差异。A事务则 before→mutation→finally finalize。j算nodes/edges差异patch及touched-node版本，空patch不进栈、最多100项、排除临时连接节点／边。undo/redo按replay或存在性、版本、锁、loading guard，冲突时可能清历史；patch回放修复不存在parent与dangling edges，restoring后100ms恢复同步。它不是无条件整份JSON覆盖。

只删child、普通group仍余>=2时，raw affected targets不会包含该存活group→target。UI部分父组geometry也没有显式recalc consumer；actual getIncomingEdgesFromState是raw edge index，`useIncomingNodeData` signature读source type／URL／metadata／content／name等，**不读group children、childNodeIds或bounds**。已核普通group renderer的child-membership selector只服务toolbar／其它UI，自动tH effect限standalone image grid。对已核保留普通group／name的路径，没有证明mounted consumer会即时刷新并清token；unmounted target当然没有Core／Prompt effect来补写store。不能将“可能重新render”当作完整引用重算证明。

本轮Root采用的本地一致性优化仅沿被删节点的**删除前 ancestry**找到仍存活group／video_group，然后找这些组实际outgoing targets，不扫描所有生成器；它应是明确opt-in、独立source与测试边界。raw／edge默认不使用此额外计划。pending草稿合入baseline、最新input消费、一次CAS／history与取消／配额失败也属于PenStudio controller的可维护实现，需要真实App强断言，不是此source证明已自带的能力。

证据：完整history及各 `ui-history-*`、`history-version-limits-and-temporary-filter`、`raw-index-incoming`、`incoming-source-signature`、`node-generator-incoming-hook`、`ordinary-group-membership-views`、`group-renderer-standalone-kind`、`standalone-only-membership-effect`、`core-incoming-and-prompt-effects`。

本文没有给本批生产或整站复刻标完成。实际实现、before/after失败档案、native行为和新冻结check应由Root及App作者分别记录；锁／确认／timeline未验分支不能被通用纯模型测试代替。
