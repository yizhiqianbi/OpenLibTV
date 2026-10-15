# 分镜图片派生组拖入：停止与虚拟框悬停源码审计（2026-10-11）

本批以公开保存的客户端源码为依据，只实现独立纯计划。不运行原站脚本、遥测、账号或生产写入；无需登录、注册、小号及真实账号资源。新模型负责图片派生组的 single / multi / virtual-frame drop，其中 **multi / frame 包含 standalone 目标**；single standalone 网格的开始 / 移动 / 插槽 / 回滚由独立网格协议负责。另将 node-stop 外层的普通组扩壳拆为独立纯计划。不能把图层合成、协作锁、跟练或后台生成当作本批已完成。

## 证据定位

以下为保存文本字符 offset，不是压缩脚本行号：

| 文件 / 位置                                                          | 直接核实的契约                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `21_0xvlvkw1sz.js` 约 697578 `mQ`、698307 `m3`                       | 两个 helper 的图片派生组资格相同：`type==='group'`、`storyboardGroupType!=='video'`，且 image 类型 / truthy sourceScriptNodeId / standalone=true 任一成立。                                                                                                                         |
| 同文件 约 890xxx 虚拟框 `L`                                          | 图片按 sibling ratio 更新 params / flow dimensions；没有 node `M` 的 preserveChildDimensions 检查。每个调用读取传入的同一旧 nodes 快照。                                                                                                                                            |
| 同文件 约 902xxx–904xxx 虚拟框 `Z`                                   | frame drop 至少两个实际存在的 dragNodeIds；target graph order 的完整包含优先，再中心命中；任何 non-image 都警告；容量不足也警告。成功附入所有图片、清 extent、追加 child IDs、清 hover、取消这些实际成员的选择并隐藏 frame。                                                        |
| 同文件 约 904xxx–905xxx 虚拟框 `J`                                   | 仅 hover count；Alt copy 清 hover；至少两个真实成员且全部 image；完整包含 → 中心；只数 incoming，容量不足或无 incoming 则清 hover，不警告。候选包含所有 mQ，包括 standalone。                                                                                                       |
| 同文件 约 905xxx–906xxx 虚拟框 `ee`                                  | live Alt 的 W 标志仅跳过 fallback copy；之后仍调用 `Z`。所以 live frame copies 可最终附入派生组，即使 `J` 的 Alt hover 被抑制。Z 未消费时，ee 清 hover 并保持 frame 的已移动 bounds。                                                                                               |
| 同文件 约 911xxx node `M`                                            | 只有 IMAGE；目标 preserveChildDimensions=true 时不更新 ratio / size。优先 childNodeIds 中有效的其他 image sibling，再取图中第一个其他 image sibling；ratio fallback 16:9。                                                                                                          |
| 同文件 约 918xxx–922xxx nodeStop                                     | standalone grid preview / release 先消费；node live Alt idMap 直接返回，不做下方派生组 drop，也不消费跨手势 Alt marker。                                                                                                                                                            |
| 同文件 约 923xxx–926xxx node multi                                   | RF moving roots 优先；否则可用 selected fallback。过滤 group / script / script-v2 后至少两个成员才做 multi。target 完整包含 → 中心 → world releasePoint；先消费 primary Alt marker，再检查 image-only 和容量。成功逐个 reparent 后用最新图调用 M；拒绝调用 m9 逐个世界坐标 detach。 |
| 同文件 约 926xxx–929xxx single fallback                              | 排除 group / script / script-v2；仍与原 parent 有正面积 overlap 则保留。完全离开先 detach / 清旧 child ID，再在所有 group 中取第一个完整包含目标。Alt marker 在目标类型 / 容量前消费。只对 primary 执行，不把多选整体附入普通组。                                                   |
| 同文件 约 928050 single `V` rejection                                | standalone 仍满足 m3；没有 active grid session 时，完整包含目标后的 non-image 必须 warn / world detach / clear parentId+extent。image-only 优先于容量；满容量 image 也拒绝。不能在这些 guard 前按 standalone 直接返回。                                                             |
| 同文件 约 700549 `m9`                                                | 清 parentId / extent 并用 recursive absolute position；不清旧 parent childNodeIds，不改 target，不改 params。                                                                                                                                                                       |
| 同文件 约 688531 `pF`                                                | 对非 standalone 的 group / video_group 按全部实际 direct children grow-only 扩壳；左右下 padding=20，顶部 padding=20+36。左 / 上扩展同时反向移动组、补偿全部 child 相对位置，保持世界位置。                                                                                         |
| 同文件 约 936xxx 外层 `ce` / `ct`、935xxx 虚拟框 `l5`                | nodeStop ce 在 inner handler 后对 primary 最终 parent 调 pF；RF selectionStop ct 对实际 moving members 的最终 parents 去重后调用。virtual-frame l5 没有 pF。资产面板 stop 消费时外层直接返回。                                                                                      |
| `04q9x43g2p9-v.js` 模块 662493，约 26480                             | multi bounds 默认 measured → numeric stored → 350×350；absolute position 递归 ancestor。                                                                                                                                                                                            |
| 同文件 模块 365256；`0dcagfa-j870b.js` 约 15538 模块 106496 / 912910 | pF 的 estimateNodeFlowSize：explicit content → URL 匹配 mediaDisplaySize → legacy content → first array URL 的 cached image size → ratio → measured pair → stored pair → 350×350。各尺寸分支需正有限数值 pair。                                                                     |
| `1kb-4b4zv9_2a.js` 模块 713118，文件开头                             | ratio extraction 与 flow size：settings.ratio → settings 的 ratio* own-key 顺序 → settings.aspectRatio → params.aspectRatio；空 / auto 跳过。尺寸 parseInt，短边 350，长边最大 1050。                                                                                               |
| `1eqsg-pmc0mun.js` 模块 836105，约 93471                             | 容量逐项检查，hard count>=25；完整手工 cols/rows 的 finite rounded clamp(1..5) 乘积固定容量；其他情况比较当前和下一 count 的 slots 是否增长。                                                                                                                                       |
| `3u6hjewm8qox_.js` 模块 612574，约 3179xx                            | 只更新缺失 / 空 / 已生成的“分组 / 分镜组 N 个节点”名称，自定义名称保留。                                                                                                                                                                                                            |
| `0leiedr1esdbe.js` 约 109509 `updateNode`、112495 `updateNodes`      | parentId patch 后 stable roots-first 排序；single / node multi 逐项排序，frame 的批量 patch 最后一次排序。updateNode 不自动 reconcile 旧 child IDs 或组尺寸。                                                                                                                       |
| 同文件 约 79043 `t4`、79514 `t6` / `updateNodeData`                  | 数据 patch 删除 undefined 顶层字段；legacy label 转 name 并删 label。ratio 清 contentWidth / contentHeight，不清 `_explicitContentDims`。                                                                                                                                           |

## 纯接口与调用者责任

`src/features/canvas/domain/storyboard-group-drop-model.js`：

```js
planCanvasStoryboardGroupDrop({
  nodes, // 已投影到最终拖动位置
  draggedNodeId, // node surface 的实际 primary
  draggedIds, // RF moving roots / virtual dragNodeIds，不自动展开 parent children
  selectedIds = [], // 停止时实际选择，供 node fallback 以及 frame completion
  surface = 'node', // 'node' | 'selection'
  releasePoint, // 世界坐标；只有 node multi 的第三级命中使用
  liveAltCopy = false,
  getNodeSize,
});
```

返回 `{handled, valid, changed, nodes, kind, transitionIds, targetGroupId?, completion, reason?}`。kind 为 none / attach / rejected / alt-detached。

- handled=true 表示该特殊 drop 已消费，拒绝也不得继续普通 fallback。
- valid=false 返回原 graph，不发布部分 plan。handled=false 的合法无命中、普通目标和 single standalone 边界由对应协议消费。
- completion 是纯 metadata。warning 为已核实中文文案，warningKey 为 source key；不能在 React functional updater 内调用 notify、setSelected、菜单清理或存储。
- caller 在最终 nodes commit 被确认后派发 completion，**即使 frame 拒绝返回同一个 nodes 引用**，也不能省略 warning / hover 清理。取消 / lost capture / document identity 失效不消费 stop completion。
- stop 调用顺序为 live grid session finalizer → 本模型 → ordinary 模型；先投影最终 pointer / auto-pan position，再执行 drop，不增加独立 history。没有 new edges。live grid session 已消费时不进入下方 special / ordinary / pF。
- single standalone source 的 image 仍交给 grid session；legacy non-image 没有 image slot preview，须执行原 parent-overlap / 完全离开规则。命中 standalone target 时，先执行 source marker / image-only / capacity guard。**只有合法且尚可接收的 image** 作为 handled=false defer 返回原 graph；无 active session 的非 image 或 full image 为 handled=true rejected，完成旧 parent 脱离并在 world position 清 parentId / extent，不能再走普通 fallback。node multi / frame 没有 active grid session 时，首个 standalone 目标直接执行 M / L 的无插槽 drop，不能跳过它搜索后面的非 standalone target；其后实际 membership 的网格 reflow 属于独立 renderer 协议。
- node handled completion 的 `parentBoundsGroupIds` 仅为 primary 最终 parent（无 parent 则 `[]`）；即使 multi 过滤掉 group primary，也不改成所有成功附入图片的父组。frame completion 没有此字段。

虚拟框 hover：

```js
resolveCanvasStoryboardFrameDropHover({
  nodes,
  draggedIds,
  liveAltCopy = false,
  getNodeSize,
});
// {valid, targetGroupId: string | null, count: incomingCount | 0}
```

严格按 J，包含 standalone target。caller 比较前一 hover group / count，只在变化时清旧组字段并写新 `storyboardMultiDragHoverCount`，退出、停止、取消和无命中都清理 owner hover。Alt suppress 仅适用于 hover；final frame Z 仍允许 live copy drop。模型不写 hover 字段、viewport、DOM、store 或服务。

`src/features/canvas/domain/parent-bounds-model.js`：

```js
planCanvasParentBounds({
  nodes,
  groupIds, // node outer ce：仅 primary 最终 parent；virtual frame 不调用
  getNodeSize, // optional 本机 child renderer bounds，不用于 group 壳尺寸
  lookupImageDim, // optional 只读缓存 lookup；模型不读取或创建缓存
});
// {valid, changed, nodes, changedGroupIds}
```

没有实际 children、非 group / video_group、standalone 和不存在的目标为合法 no-op。按 groupIds 顺序处理并去重，保留 graph 顺序。内部 default size 保留 365256 的原优先级；getNodeSize 注入先于 default，只用于 child 尺寸，调用 context 为 `{role:'bounds',surface:'node'}`。组壳仍 stored → measured → 0。所有变更原子返回；不触及 childNodeIds、params、selection、extent、zIndex、layoutMode、edges 或 history。

## 表面差异，不能合并为通用“多选拖入”

| 项目                     | node single                                                          | node multi                                             | virtual frame                                        |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| target search            | 所有 group 第一个完整包含者，再看 m3                                 | m3，完整 → 中心 → pointer                              | mQ，完整 → 中心，无 pointer                          |
| source members           | primary；group/script/script-v2 排除                                 | D 去上述类型后至少两个，primary 优先顺序               | 实际 dragNodeIds 至少两个，不过滤类型                |
| 原 parent 正面积 overlap | 保留，先于目标                                                       | 特殊 multi 先于 ordinary overlap                       | 不做 ordinary overlap                                |
| non-image 拒绝           | 清 parent / extent、留世界位置；已完成旧 parent metadata detach 保留 | 对过滤后的每项调用 m9；旧 metadata 保留                | 只 clear hover / warn；原 parent 与选择 / frame 保留 |
| 容量拒绝                 | 与 non-image single 同样 detach                                      | 与 m9 拒绝相同                                         | 与 frame non-image 相同                              |
| ratio                    | M，preserve=true 跳过；读旧图                                        | M，preserve=true 跳过；每项读 latest 图                | L，无 preserve gate；每项读原 snapshot               |
| extent 成功              | 保留；之前 complete detach 已清则保持清空                            | 保留原 extent                                          | 清 extent                                            |
| selection 成功           | 不清                                                                 | 不清                                                   | 仅实际 drag 成员 select=false，保留无关 selected     |
| live Alt copy            | no-op                                                                | no-op                                                  | 仍可成功；不消费 marker                              |
| 跨手势 marker            | 先消费而不 attach                                                    | 只消费包含在过滤 members 中的 primary，不 attach peers | 不检查 / 消费 marker                                 |
| 外层 pF                  | primary 最终 parent                                                  | primary 最终 parent（不扩大为全部 members）            | 无                                                   |

node D 优先 RF 参数长度>=2，否则 store selected / 非 hidden / 非 temporary 的集合至少两个且包含 primary时用它；否则使用单项 RF 或 primary。被选 parent 的未选 children 不隐式加入。group primary 在 multi 去除后，另外两个 image 仍可消费特殊 drop；不能在 multi 之前执行 single 的 primary type exclusion。

node multi 无命中后会继续 source single primary fallback。因而在 multi 搜索中被排除的选中 target，在后面的单项完整包含搜索中仍可能接纳 primary；测试保留这一行为，不人为扩大排除名单。

## 容量、比例、数据和组尺寸

容量 / ratio 原规则复用 `domain/storyboard-grid-model.js` 的 pure helpers，不另维护副本。single capacity 计算目标当前 image children（排除 primary）；multi / frame 计算目标当前 image children 中不在移动 image 集合的数量，加实际 incoming。source 会扣除已在目标内且也被选中的图片，但只把外来图片逐项增加；本模型保留这个计数行为，不擅自改成最终 child 数量的额外限额。

ratio helper 只读有效 parent membership；陈旧 child metadata ID 保留但不参与 ratio sibling。优先 metadata 中首个有效其他 image，其次 graph 中首个其他 image。params 与 settings 其他字段保留；新增 canonical settings.ratio，删除 contentWidth / contentHeight，写 width / height / measured。`_explicitContentDims` 保留，不能把源码未清的 flag 当作通用 cleanup。parent / target 的 zIndex 不改。

inner M / Z drop 不重排 sibling position、不改 group width / height / measured / nodeWidth / nodeHeight，也不写 layoutMode。single / multi / frame 对 childNodeIds 的新 ID 仅追加，保留陈旧 ID 和 metadata 顺序。single 已脱离的旧组只删除当前 primary ID；multi 的 source m9 和成功 reparent 都不清旧组 metadata。不能在 drop plan 中偷偷 reconcile。

**纠正此前 ordinary 审计的证据范围**：inner handleNodeDragStop 没有直接调用 pF，不能因此推断完整 node-stop 不扩壳。外层 ce / ct 直接调用 pF；虚拟 frame 仍没有此步骤。pF 只增大，不缩壳：分别计算 `left=max(0,20-minX)`、`top=max(0,56-minY)`、`right=max(0,maxRight+20-currentWidth)`、`bottom=max(0,maxBottom+20-currentHeight)`。源 groupNodesSerial 对全部实际 direct children（包括 hidden / temporary / 非 image）统一补偿，group measured 替换为新 pair；不依据 childNodeIds，不直接处理 grandchildren。drop 到相对 y=40 的节点因此可能被补偿到 y=56，group y 同时减少16，节点世界 y 保持不变。

源 image renderer 的 dimensions / media 更新与 `recalculateParentAutoBoundsGroupForChild` 仍属于后续独立生命周期；`updateNode` 本身没有这项隐含功能。standalone membership / renderer reflow 与非 standalone pF 是两层协议，Root 只对实际改变 membership 的 standalone 组安排前者，不为普通 / script-derived 组添加网格布局。本批纯计划不能代表完整媒体测量或特殊网格缩壳已完成。

frame successful completion 的 `clearSelectionIds` 仅为存在于当前 graph 的拖动成员；`selectedIds` 从 caller stop selection 中去掉该集合，保留无关项。它不是全局 `[]`。frame rejection 没有 selectedIds / clearFrame，只有 warning 与 clearHover。

standalone 单节点拒绝同样不改目标 child IDs / dimensions / params；完全离开旧 parent 时只清当前 ID 的 metadata，并保留其他 stale ID。合法 image defer 返回原 graph，不发布为计算 guard 暂时规划的旧 parent detach。目标 child metadata 损坏时 valid=false 原子返回，组合层必须阻断 fallback，不能猜测可接收并继续操作。

## 几何与本机适配

source single 默认 measured → stored → 0；multi / frame / hover flow size 默认 measured → numeric stored → 350×350；target 默认 stored → measured → 0。0 是有效尺寸，不被默认值替换。Root 可注入本机 renderer size，source 默认测试仍独立保留；把该适配描述成 renderer 真实边界，不能宣称 source measurement priority 全部一致。

pF 使用另一尺寸协议，不能直接等同于上述 containment：explicit flag 为 true 且 content pair 有效时先取；否则匹配当前 first-array-URL 的 mediaDisplaySize 优先于 legacy content pair。无有效 display / content 时调用 caller 只读 image cache；ratio 又优先于 measured / stored，并且一个非空非法 ratio 仍进入 ratio helper 的350方形回退。scalar URL 和 resourceMeta 不参与源 pF 尺寸。default pair 只接受正有限数字，0 pair 走后续分支；本机 getNodeSize 允许有限非负的实际 renderer 尺寸。源 groupNodesSerial 的异步协作事务在本机适配为一次已有 pointer 历史内的纯投影，不额外创建 undo。

source target containment 直接使用 group.position，通常为 root；本机 nested 文档沿用既有 recursive world position，目标也转世界坐标。此为显式 local document 适配。重复 IDs、损坏 child metadata、缺 parent、祖先环、非有限 / 负尺寸、无效可变 params 以及会新建 parent cycle 的输入返回原 graph。helper 若拒绝，前面已规划的 attach / ratio 不发布。preserve=true 的 node M 不读取 / 改写 params。

源协作团队的 assertNotLockedByOthers、practice active 的回退位置、layer composition 的单独目标，以及 fallback copy 的异步服务动作不在此纯 plan 内。当前本地工作模式无这些真实服务，caller 的 readonly / ready / document identity / pointer owner 防迟到协议继续适用。

## 验证记录

2026-10-11 22:27:49，两 owned 模型 **135 项通过**（special drop 94，parent bounds 41），exit 0，1.64s；包括 source single / multi / frame / Alt / metadata / ratio snapshot 差异、容量整体拒绝与 existing-minus-selected 计数、hidden / graph-order target、extent、inner 组壳不改、primary fallback、standalone multi / frame 接纳、primary-final-parent completion、nested adapter、同 input Strict replay、原图原子失败，以及 J hover 的 Alt / capacity / incoming / clear 行为。pF 验证四向 grow-only、title padding、世界坐标补偿、实际 direct membership、source 尺寸优先级、cache / renderer 注入和多组原子失败。四生产 / 测试文件 ESLint zero warnings 通过；四代码文件与本审计 Prettier check 均通过，模型现已冻结。只读核对 Root 的纯协调层与 committed completion 接线，无新增阻断问题；没有运行全工程 check。

后续 @928050 gap 修复，2026-10-11 22:33:33，special **102** / parent **41**，共 **143 项通过**，exit 0，808ms。新增 standalone target root text 拒绝、ordinary 旧 parent 完全脱离的 world / metadata、手工满容量与 hard25、image-only 优先于 full、marker 优先、admissible defer 无中间 detach 泄漏和损坏 target metadata 原子失败。本次没有修改 Pointer / NodeCanvas / ordinary drag / grid session 模块。

最终 source-side legacy guard 修复，2026-10-11 22:35:05，special **104** / parent **41**，共 **145 项通过**，exit 0，577ms。standaloneSource defer 仅限 image；新增 legacy non-image 完全离开旧 standalone → 新 standalone rejection 的世界坐标 / extent / 旧 metadata 清理，以及仍有 positive overlap 时原图保留。四代码文件 ESLint zero warnings、本审计与四代码文件 Prettier check 通过，最终冻结。

实际 Root 接线、frame commit completion、ordinary / standalone 协调、原生桌面和窄屏由根批次记录。纯规则通过不等于原站账号、手机 / Safari、多人服务或整个复刻目标已完成。
