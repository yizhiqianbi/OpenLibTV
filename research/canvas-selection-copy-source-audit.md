# 虚拟选区 Alt 拖动复制：源码与实现边界（2026-10-11）

本记录属于节点交互优化批次，只核对并实现虚拟多选框的 Alt / Option 拖动复制。复制对象为当前本地画布文档，不调用原站运行代码，不写入原站，也不使用账号资源。

## 直接源码证据

- `research/source/21_0xvlvkw1sz.js`，`iF` 约 293350–299500：虚拟选区 `allowAltCopy` 开启后，左键 pointerdown 从 native event 读取并固定 Alt / Option；仅同时存在 Meta / Ctrl 才设置 `copyInternalEdges=true`。移动过程中释放或补按修饰键不改变本次复制请求。pointerdown 调用 `onDragStart`，其返回 `nextDragNodeIds` / `nextOriginalPositions` 后，运动作用于副本；释放、取消、卸载均终止 owner，不把错误终点继续写入。
- 同文件约 901170–902160，选区 handler `Q`：当前组成员展开后有多个节点、包含可复制节点且可写时，调用 live Alt-copy helper；成功后将虚拟选区 target/drag/group IDs 用 `idMap` 重映射到副本，原件保持起始位置。源 runtime 还带 practice、locked、mark、focus 和团队锁保护。本机版本的实际边界是 loaded / readonly / document identity，不能将其称为真实团队权限。
- 同文件约 785000–787870，`duplicateSelectionForLiveAltDragStart`：先筛除不可复制 Screenplay，扩大组成员；克隆同一起点，不采用普通复制的固定位移。parent / childNodeIds 重新映射；顶级对象添加一次“副本”后缀，子节点不改名；清理 measured / dragging、guide，以及非组 taskInfo / directorAgentSessionId / openingUsed / isStale；已知 data 内引用重新映射，未知外部引用保留。source 添加根与孩子、切换选中状态、恢复原件位置，返回 ID 映射和起始位置。
- `research/source/04q9x43g2p9-v.js`，模块 662493 约 26480：`isAltOrOptionActive` 支持 altKey 或 `getModifierState('Alt')`；`isMetaOrCtrlActive` 支持 metaKey、ctrlKey、Meta / Control modifier state。`expandNodeIdsForGroupCopy` 将选中的组内子节点扩大至组父级与兄弟；组类型为 `group` 与 `video_group`。绝对位置 helper 沿 parent 链累加并防循环。
- `research/source/16k_l1hir0zic.js`，模块 653964：不可复制判定只排除 node.type / data.type 为 Screenplay；父组 childNodeIds 中同时去除筛掉对象。
- `research/source/3u6hjewm8qox_.js`，模块 16015 约 1530208：`buildEdgesForDuplicateSelection` 的名字不等于仅内部边。开关开启时，复制双方都在选区的内部边，以及外部上游 → 被复制目标的输入边；不复制被复制源 → 外部下游的输出边，也不复制外部双方的边。handles / 其他 edge payload 保留，ID 重新生成。
- 同文件模块 254905 约 1531494：重新映射 sourceScriptNodeId / linkedImageGroupId / linkedVideoGroupId / sourceImageGroupNodeId；params 的 image/video/audio/text/mixedList 节点 IDs 及相应 order、scenePayload.source_images、focusRegion；Script assets 的 linkedNodeId。默认 externalRefPolicy 是 preserve，不能擅自把未复制的外部引用删掉。group characterAsset 相关 characterReferences 清空。
- `research/source/1jgo2qrsqidfu.js`，模块 704418 约 13359：`ensureMediaListOrder` 在 remap 后处理 image / video / audio / mixed 四种列表；有非空字符串 nodeId 序列时，将对应 ListOrder 设为该列表的实际 nodeId 顺序（包括重复），纠正缺失、残缺、陈旧或倒置顺序。列表缺失、为空或仅有 URL 时保留原 order。textList 不补 order。

## 本地分层与接线协议

`domain/selection-copy-model.js` 导出纯 `planCanvasSelectionDragCopy({nodes,edges,sourceIds,copyEdges=false,makeId})`。成功返回 additions：`copies`、`edgeCopies`、`idMap`、`newTopLevelIds`、`newAllIds`、`positions: Map`，不拼原 graph，不修改原 objects。ID 冲突、损坏坐标、循环、克隆或 ID 工厂失败返回整个计划失败，不给 caller 任何部分 additions。外部边缺源节点不生成假边。

`hooks/useCanvasPointer.js` 的 `dragSelection` 记录 pointerdown 的原始 nodes / edges identity、documentKey、修饰状态与选区 IDs。保留现有本机 4px 手感阈值；首次越阈值仅调用一次注入的 `createDragCopy({sourceIds,copyEdges,expectedNodes,expectedEdges,documentKey})`。成功后以其副本 roots / 起始 positions 继续移动、切换整个复制树选择，不另 record。后续 pointermove 和最终 pointerup 只移动这些副本，原件不移动。Alt 默认无边，Alt + Meta / Ctrl 开启上述内部与上游边。

Root / Graph caller 负责 loaded / readonly / raw identity 的同步 CAS；先投影当前节点草稿再计算 copies，CAS 基线仍为按下的 raw graph；然后一次提交完整 nodes / edges 与一个撤销快照。Pointer 不持有独立 history / storage。该适配失败或抛错时立即终止 owner，保留原选择及原位置；不会降级为拖动原件。修饰 cursor 由 Pointer 返回 `altCopy`，不新增全局键盘监听。

pointercancel / lost capture / blur 取消错误终点，已完整创建的副本保留在最后有效位置，并可一次撤销；源 live-copy 也不会在 cancel 删除已经添加的副本。切文档、readonly、ready、设备能力变化及卸载释放 capture；迟到 move / up、其他 pointer 不写新文档中同 ID 节点。复制失败不能残留不完整节点/边；成功后的取消不等于删除已提交的完整复制树。

## 已验证与明确适配

- 定向 Vitest 覆盖同位置不可变 additions、parent / child remap、组内选中扩展、上游 / 内部 / 下游边分流、媒体与 Script 引用、缺失/部分/陈旧 media order、Task 状态、ID / clone / cycle 原子失败、4px 阈值、修饰键固定、复制一次且只一个 history、document / readiness / readonly / pointer / unmount / cancel 隔离。2026-10-11 20:25:53 两文件 85 tests 通过，耗时 815ms，日志 `artifacts/canvas-selection-alt-copy-directed.log`；四文件 Prettier / ESLint 同时通过。不把 hook fixture 当原站实测；Root / Graph 接线及浏览器/全量检查由根批次统一登记。
- 本机保留 4px 起拖阈值，源 iF 即时开始。Graph 单次本地 CAS 取代 source store 的分次 append 与后续恢复原件 RAF；失败立即中止，源另有 live-copy 失败后的原件预览 / release-copy 回退。此差异明确保留，不能伪装已经验证源 fallback。
- 本地嵌套组递归补全整个复制树并按父级拓扑排序，避免悬挂 child IDs；源已确认 helper 在最后一轮仅展开当前 group 直系孩子，复杂嵌套运行范围未浏览器验收。媒体保存顺序按已确认 704418 helper 规范化；不捏造未保存列表。

## 尚未覆盖的 Alt 入口

源约 913813 `onNodeDragStart` 另有分支：已选多个（或一个真实组展开成多个孩子）时节点拖动也可转为多选 live-copy；单独可复制普通节点走 `duplicateNodeFromSourceAtPosition`，从组内复制时脱离父组，Meta / Ctrl 携其全部上游；普通空组 / VideoGroup 本体不是该 single-copy 分支。当前 Pointer 只在虚拟框 `dragSelection` 开启复制，普通 `drag()` 沿原移动行为，不能宣称所有单节点 / 真实组 Alt 功能完成。

源即时 frame drag、框拖自动平移与 storyboard / layer drop、原件恢复 fallback、真实 phone / Safari 键盘与触控，仍须分别接线和验收。所有真实生成、账号写服务继续延期。

后续本批 Graph raw CAS、source草稿先投影后复制、一次历史与实际NodeCanvas Alt/Meta/Ctrl回归已接；组输出原生浏览器与冻结后工程统计见 [集成验收](./canvas-group-selection-functional-audit.md)。原生浏览器按住Alt拖动未验收，不能用合成PointerEvent或纯计划测试替代。
