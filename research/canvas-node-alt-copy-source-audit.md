# 普通节点与真实组 Alt 拖动复制（2026-10-11）

本批继续节点交互优化，新增普通节点 / 真实组 Alt 入口使用的纯资格规则与单节点复制计划。原有虚拟框规则见 `canvas-selection-copy-source-audit.md`。此处只描述已核对 source 与本地模型；真实 Pointer / Graph 接线、原生浏览器、全量测试由根批次另登记，不能用下面纯模型结果代替交互验收。

## 起拖资格与选择时序

`research/source/21_0xvlvkw1sz.js` 约 913813 的 `onNodeDragStart L` 先取源 store 中 `selected && !hidden` 的节点，按原 nodes 顺序生成选中 IDs。当前被拖动节点必须属于该有效选区，且不是 temporary node。`expandNodeIdsWithGroupChildren` 只为已经选中的 `group` / `video_group` 增加直系孩子来计算多成员条件；孩子的 hidden 状态不再过滤这个展开计数。

Alt 激活且展开数量大于 1、选区存在可复制成员时走 selection live-copy；只有一个有效选中节点、就是当前拖动对象、可复制且不是 `group` / `video_group` / temporary 时才走 single-copy。源 Screenplay 不可复制：`16k_l1hir0zic.js` 模块 653964 同时检查 node.type 与 data.type。混合选区有普通节点时，即便被拖动的已选对象是 Screenplay，源 multi 分支仍可成立，而复制 helper 自己过滤 Screenplay；不能把 single 的不可复制 gate 误用到整个 multi 入口。一个空真实组不能作为单节点副本复制；一个有直系孩子的真实组走 selection 计划，保留并复制整个组树。

源同时受 practice、locked、readonly、mark、focus 和协作锁约束。本版本仍只使用本机 loaded / readonly / document CAS 等实际边界，不表示任何真实账号或团队锁服务已验证。

临时节点谓词直接证据：`research/source/0leiedr1esdbe.js` 模块 577236 约 219204，id 为 `__temp_connection_node__` 或 node.type / data.type 为 `temp`。

React Flow 的选择时序不能省略：`research/source/1kb-4b4zv9_2a.js` 约 107820 的起拖 `C(e)`，在回调原站 `onNodeDragStart` 前调用 onNodeMouseDown → `eg`（约 22700）→ `addSelectedNodes`（约 63126）。默认 `selectNodesOnDrag=true`（约 58987），普通未选节点起拖通常先成为有效选中的单节点，随后才判 single Alt。

仍有修饰键组合边界：原站给 `multiSelectionKeyCode=['Shift','Control','Meta']`（21 约 710515）。RF `useKeyPress`（1kb 约 6880）使用 pressed-key 集合与组合长度匹配；Ctrl / Meta 与 Alt 的按键顺序可改变 multiSelectionActive，不能仅凭某次事件 ctrlKey / metaKey 就断言原站必定追加选择。纯 resolver 接收 caller 实际生效的选区；本机 Pointer 的常规选择适配须单独记录，不把全部修饰顺序宣称为源行为等同。

## 普通节点与虚拟框的修饰时机不同

1kb 约 108800–109700：默认 `nodeDragThreshold=1`（约 58744），`drag` 距离严格大于阈值后第一次执行 `C(e)`；传给原站 onNodeDragStart 的是该次当前 sourceEvent。21 的 `L` 此时读取 Alt / Option 和 Meta / Ctrl。

虚拟框 `iF` 则在 pointerdown 即读取并固定这些修饰，详见前一审计。本机保留 4px 起拖手感阈值；普通节点应在首次超过本机阈值时确定修饰，虚拟框继续固定按下修饰。不能为了共用 hook 把两种时机混为一谈。真实 mouse/touch 修饰、键盘组合和 RF 时序的浏览器范围由根批次实际结果证明。

## Single helper 的精确规则

`21_0xvlvkw1sz.js` 约 783851 的 `duplicateNodeFromSourceAtPosition g`：

1. 只复制当前节点，不扩大父组和兄弟。复制同一位置、不固定偏移。JSON 克隆，清 measured、dragging，并清 taskInfo / guide / guideMeta / directorAgentSessionId / openingUsed；isStale 重置 false，媒体正文及未明确清理的 params 保留。
2. “副本”后缀在检查原 parentId 时决定：原本顶级对象才追加一次 name 后缀；Script / ScriptV2 的 title 同样处理。来自父组的孩子即使随后脱离，仍保持原孩子 name / title，不补副本后缀。
3. 只有实际存在的 group-like parent 才脱离：沿祖先链累计绝对世界坐标，清 parentId / extent，设置 `canvasAltDetachedCopy=true`。非组父级保留 parentId、extent 与相对位置。源缺失 parent 也会保留旧 ID；本机此损坏输入直接阻断，以免新增悬挂节点，这是本机图边界，不假称 source helper 具有同一保护。
4. 组内脱离时调用 `normalizeDetachedStoryboardLayoutData(data,true)`。`3u6hjewm8qox_.js` 模块 761851 约 1526760：只有 `_explicitContentDims===true` 且 `params.scene==='group-generate'` 同时命中，才清 `_explicitContentDims` / contentWidth / contentHeight / params.scene；其余 settings、prompt、params 保留。普通 dimensions / 其他 scene 不清。原本顶级的 single helper 不额外调用这个 cleanup。
5. 默认无 Meta / Ctrl，data refs 使用 `externalRefPolicy:'detach'`：外部 source/linked IDs 删除；带外部 nodeId 的媒体列表与对应 order 项过滤；focusRegion 外部指向删除；scenePayload.source_images 的未映射对象过滤，空 source_images 删除，空 payload 删除。URL-only 的普通媒体列表项保留，未知 prompt token 不改写。
6. Script assets 外部 linkedNodeId 和 thumbnailUrl 一起移除，包括只有 thumbnail、没有有效 linkedNodeId 的条目；其他描述字段保留。指向被复制节点自身的已知引用映射为新 ID，关联 thumbnail 可保留。
7. Meta / Ctrl 激活时 preserve 外部引用，并复制所有 target 为原节点的上游边。只重定向 target，不重映射 source：原节点自环变为原节点 → 新副本，不能改成新副本自环。原 edge 其他 payload / handles 保留；源去除旧 edge ID 后交 addEdges 分配，本机 planner 明确分配并检查新 edge ID。输出到外部下游、双方无关边不带入。

引用规则证据为 `3u6` 模块 254905 约 1531494；media order 规范为 `1jgo2qrsqidfu.js` 模块 704418 约 13359。single 的 preserve 仍按源过滤空 nodeId 值，并清空的 scene image payload；只要四种媒体列表包含可用 nodeId 序列，ListOrder 以实际列表顺序规范化。textList 不新建 order。

源 g 初始 insert selected=false，之后统一选择新 ID。本机纯计划输出同初始字段，实际选区由独立 controller 的 selected IDs 切换，不把 data 中的旧 selected flag 当交互资格。

## 本地 API 与原子边界

`domain/selection-copy-model.js` 新导出：

- `resolveCanvasNodeDragCopyMode({nodes,selectedIds,nodeId})` 返回 null 或 `{copyMode:'single'|'selection',sourceIds}`。只处理数据资格；Alt / readiness / readonly / capture 等由 Pointer owner 管理。caller 传起拖实际选区，而不是把未选节点永久禁止复制。
- `planCanvasSingleNodeDragCopy({nodes,edges,sourceId,copyEdges=false,makeId})` 返回与虚拟 selection 计划相同的 additions 契约：`{valid,copies,edgeCopies,idMap,newTopLevelIds,newAllIds,positions:Map}`。single 完整失败返回 `{valid:false,reason}`，不返回部分节点/边。

clone、坐标、ID 冲突和缺失 parent 阻断；hidden / temporary 在 public single planner 也阻断，以保证 caller 不能用错误 copyMode 绕过起拖资格。source g 本身没有这些后者 gate，它们来自 L，故此处是本机协议整合，不是对 helper 源码的错误描述。Graph caller 先校验 raw CAS，投影最新草稿，再选 single / selection 计划，一次提交完整 additions 与一个撤销快照；Pointer 后续只移动副本 roots，不再复制、不再重复记录历史。

原 selection 协议默认 preserve 外部引用、复制内部与外部上游边、组扩展和原位置保持不变。此批按新确认 source v 增补 copied root 的精确 storyboard dimension cleanup；已复制父级的孩子（root=false）不清。原 virtual 对 malformed 空字符串 refs / 空 scene payload 的兼容处理未在此批统一改写，该差异有明确记录，不将 single 的严格规范化泛化为全站所有旧文档都已等同源 helper。

## 实际验证与剩余范围

2026-10-11 20:50:40，`selection-copy-model.test.js` 共 55 tests 通过，509ms，日志 `artifacts/canvas-node-alt-copy-model.log`。Prettier / ESLint 同文件检查通过。覆盖有效选区/hidden/temp/Screenplay/空组、真实组选择、singleton child 不扩大父组、nested world detachment、原位置与数据不可变、name/title 后缀、尺寸精确 gate、外部 refs detach/preserve、空 params order/payload、自环上游 target-only、新 ID / clone 原子失败，以及原虚拟规则。Root / Pointer / Graph 与浏览器证据由根批次统一登记。

Source live-copy 失败另有 release-time fallback / 原件恢复分支；本机仍采用失败立即停止，不移动原件或留下半个复制树。普通组 drop、storyboard/layer 迁移、整个 Alt / Ctrl / Meta 选择键序列、真实 phone / Safari 与源协作状态尚需各自验收。生成、上传、账号写服务继续延期，整个复刻目标未完成。
