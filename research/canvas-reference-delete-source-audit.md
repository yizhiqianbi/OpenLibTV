# 普通生成器参考删除：真实源码事务审计

2026-10-13。本批只静态读取 `research/source/` 已归档的原站脚本，补充本文与 [逐层源码证明](../artifacts/canvas-reference-delete-source-proof.json)。没有 import、eval 或运行原 bundle，没有浏览器、网络、登录、原站写入、生产代码及测试修改。本文不是原站账号状态或真机验收；也不以本机现有实现反推原站规则。

所有范围均为半开区间。证明 JSON 分别记录 UTF-16 code units、Unicode code points、UTF-8 bytes，保存源文件 SHA-256 与每段 excerpt 的 SHA-256；不能把一种坐标直接称为另一种。已有 11 文件／41 段证据重新逐段比对原文件后扩充，最终数量以证明的 `verification` 为准。

## 真实调用链与 asset:// 卡片

IMAGE `27g5ro4e8nocv.js` 的 `ew`、VIDEO `24mj3em3412ij.js` 的 `r8`、AUDIO `06hc5sgxzfqgd.js` 的 `el`，均先调用 module 814059 的 `useDeleteGeneratorReference(targetId)` 返回函数，再在当前目标处于 reference-pick 模式时重算可选状态。真实 `ReferenceDisplay` 是 module 184907，三页按只读条件传入对应回调，未另设 asset 协议删除函数。

`ReferenceDisplay` 的 typed 列表组件 `D` 对每项生成 `onDeleteItem ? () => onDeleteItem(item.nodeId) : undefined`。mixed 卡片 `M` 将同一个 `onDelete` 转交 image／video／audio 卡片。公共删除按钮 `I` 先 `stopPropagation()` 再调用该回调。`assetId` 影响认证标记、素材展示和 audio 的 `isAsset`，不形成另一条 params 删除分支。text 卡片也直接传自己的 nodeId；不能从“存在删除按钮”推导一种未发现的资产写协议。

shared hook 的确切顺序是：

1. 目标 ID 不存在则返回；从当前 edges 找首条 `source === sourceId && target === targetId` 的 edge，存在即调用真实 `deleteEdgeById(edge.id)` 并返回。
2. 没有 direct edge 时，从当前 canvas store 取 nodes；按当前 edges 顺序检查所有指向目标的 group／video-group／video-story 源。
3. 使用当前目标 excluded set 展开该组；若源 ID 不在 leaf 列表中，继续下一个组。命中后完整 leaf 数量 `<= 1` 则删这条 group edge；否则先 snapshot，再写 `groupRefExcludedNodeIds: [...oldExcluded, sourceId]`，然后 `recalcIncomingForTarget(targetId)`。
4. direct edge 与 group leaf 均未命中时返回，不写 params、列表、order、prompt 或图历史。外层 reference-pick 重算可更新其 UI 集合，不等于删资产。

因此，若一个 `asset://…` stored 条目被送进上述普通卡片入口，却没有相应 direct edge 或可命中的 group leaf，原 hook 是 no-op。不能自行发明“从 params 删除 asset 条目”的行为，再记为原站复刻。角色库自身的增删／认证事务是另一个入口，本审计不把它混入普通参考删除。

三页到 module 184907／814059 的 import alias、各 image／video／audio 卡片完整函数亦已保存；额外 pick 回调沿 Canvas callbacks ref 追到 module450681，只更新 pickable、connected、blockReasons、limitCount 四种 UI 集合。

证据 ID：`image-delete-caller`、`video-delete-caller`、`audio-delete-caller`、各 `*-reference-display-wiring`／`*-reference-hook-binding*`、`reference-display-delete-dispatch`、`reference-display-mixed-renderer`、`reference-display-delete-button`、各 `reference-display-*-card`、`shared-delete-hook`、各 `reference-pick-*`。

## Group 删除按完整 leaf 计数

module 417754 `expandGroupSourceNodes` 仅在传入 roots 包含可展开的 group／video-group／video-story 且没有 `characterAsset` 时执行 DFS，否则原样返回 roots。子树依据整个 nodes 数组的实际 `parentId` 建邻接表，保持 roots 及 children 的原顺序，使用 visited 去重，不依据媒体可播放性、URL 是否为空、node.hidden、selected 或公开卡片是否可见来筛选。

excluded 只在递归深度 `> 0` 时阻止该 ID 被展开／加入；直接 root 不按此条件排除。嵌套 group 最多展开到 depth 8，到达该深度的普通 group 不继续加入输出。带 `characterAsset` 的 group 不递归，作为 leaf 输出。循环或重复经过的 ID 由 visited 阻止。`getGroupRefExcludedNodeIds` 只从非空 array 读取 string entries 并构造 Set，string `""` 也未另行过滤；没有合法 string entries 时返回 undefined。

hook 的“最后一个子引用”判断数的是这个完整 leaf 列表。因此一张有 URL 的图片加一个 TEXT、空 URL 的 VIDEO、REFERENCE 或其它非媒体 leaf，删除图片时都不满足 `length <= 1`，应排除图片并保留 group edge。界面可用素材 collector 的条目数量不是这个判断的证据。

store `deleteEdges` 在移除 edge 后执行 `ih(nodes, removedEdges)`：只处理源为上述三类 group 的 removed edge，从未带 excluded 的完整 group 展开结果建立 ID Set，再从该目标 excluded set 去掉属于这个源子树的 IDs。若仍有其它 excluded IDs则保留，清空则移除字段。随后才对受影响 targets 调用 `ig`。这意味着删整条 group edge 时不能遗留该组 excluded，也不能把其它组的 excluded 一并清空。`patchGraph` 的已核分支没有同一 `ih` 调用，不能无条件将普通 `deleteEdges` 行为套给所有图写 API。

证据 ID：`delete-hook-group-bindings`、`group-expand`、`excluded-reader`、`group-exclusion-cleanup`、`delete-edges`、`patch-graph-recalc`。

## 真实 edge 删除与重算

普通 hook 的 `deleteEdgeById` 来自 Canvas callbacks。当前 archive 中 `21_0xvlvkw1sz.js` 的实际 callback 将单 edge 转成 `{type: "remove", id}`，普通 passthrough 分支先 snapshot，再 `store.deleteEdges(ids)`。它不是直接执行 React Flow 的 `applyEdgeChanges`；store 的 raw `applyEdgeChanges` 仅替换 edges，本身没有完整参考重算。

`deleteEdges` 先处理正在编辑的 segment-remake 级联，普通分支再移除 edges、清理 group excluded，并对所有 removed edge 的 targets 执行 `ig`。`recalcIncomingForTarget` 直接在当前 nodes／edges 上调用同一个 `ig`；有效状态变化的服务同步走独立 enqueue。`deleteNode`／`deleteNodes` 也会在移除源节点及相关 edges 后重算 targets，但参考删除 hook 不应借此把普通 source 节点删除。

`ig` 接收的是当前 store 图与目标原始 `data.params`，没有读取 prompt editor DOM、尚未提交的 debounce 草稿或一个新推断 mode。PenStudio 将最后输入并入本地一次图事务、保证一次 undo／redo、消费接受后的草稿，是为解决本机 pending-input 覆盖的实现约束；不能把这个本地 controller 机制写成原 bundle 已存在的特性。

证据 ID：`actual-edge-callback`、`raw-edge-changes`、`delete-edges`、`recalc-target`、`delete-node`、`delete-nodes`、`ig-complete`。

## ig 的新列表与原始旧列表不同

store 的真实 alias 映射是 collector 417754、order 677418、media 799545、mixed predicate 469850。`ig` 普通 params 分支先从指向当前目标的 edges 中排除 `edge.data.portraitVirtual`／`assetVirtual`，再排除 source `data.type === REFERENCE`。剩余 sources 完整展开 group 并交给 `collectIncomingNodeData`；另向 imageList 追加 `collectCharacterReferenceItems(filteredEdges)`。

collector 保留每个媒体 leaf，即使读取的第一个 URL 是空字符串：IMAGE 在 protection 为 hidden／watermark 时取当前 `data.url`，否则有 originalUrl 时优先 originalUrl；VIDEO／AUDIO 取 `data.url` 首项。TEXT 按原 content 的 string／string array 规则生成 textList。每个媒体只读取 `resourceMeta.items[0]` 匹配其 kind 的尺寸／时长，再附对应资产与认证元数据。VIDEO 对字幕 URL trim，并挑首个 type 非空、duration 为有限正数的 transition。AUDIO 没有凭 VIDEO 的 compliant-exempt 规则自动造对应字段。characterRef 使用 edge 的 `characterRef.mainReferenceImageUrl`、source ID、roleName 与原 characterRef；不是按 UI 虚拟节点再造来源。

在 graph collector 之后，分别 `normalizeMediaList(old.imageList/videoList/audioList)`，只保留 truthy nodeId 且 `isAssetProtocol(nodeId)` 的 stored 条目，追加到新 graph typed lists 尾部。然后用原 typed order 得到新 `P/E/O`。旧 token 的 typed mapping 却直接读取原始 `old.imageList ?? []`、`old.videoList ?? []`、`old.audioList ?? []`，没有先 normalize，也没有先应用 typed order。不能把新 collector、UI projection 或重排后的列表冒充这个旧映射。

真实 `collectIncomingNodeDataForTarget` 是更宽的 UI 路径：它另追加 `${targetId}:ref-${index}` synthetic refImages，并过滤 focusRegion.nodeId；characterRef 收集范围也不等同于 `ig` 的 filteredEdges。store 参考清理不能以这条 UI collector 为完整替代。原始 params 缺失、非法格式或旧 typed list 未持久化的本机历史文档，也不能假称已有原站合法旧映射；如增加兼容，应另列为本地适配。

证据 ID：`store-helper-bindings`、`ig-complete`、`incoming-collector`、`collector-text-protection-character-helpers`、`target-collector`、`asset-protocol`、`typed-order`。

## asset 协议与 normalizeMediaList 的精确语义

module 799545 的 `isAssetProtocol(value)` 就是 `value.startsWith("asset://")`，没有 trim、大小写折叠或非空后缀验证：`asset://` 为 true，`ASSET://id`、` asset://id` 为 false。`parseAssetId("asset://")` 返回空字符串，不能由 parse 的 falsy 结果倒推协议识别为 false。原 predicate 预期 string，不是任意未知类型的安全 parser。

`normalizeMediaList` 只处理非空 array；外层 string 或其它输入返回 `[]`。array 中：

- string item 变成 `{url: item, nodeId: "legacy-<index>"}`。
- 对象且 `url` 是 array，只取首项；首项 falsy 则丢弃，truthy 则复制对象、将 url 改为首项、并使用 `nodeId ?? "legacy-<index>"`。
- 对象且 `url` 是 string，直接返回原对象，不给缺少 nodeId 的对象补 legacy ID。
- 其它 item 丢弃；最后仅过滤 `url === ""`，未 trim 空白 URL、未检查 URL scheme。

旧 typed token 映射并不经此函数；原 string item 没有 nodeId，recognized token 指到它时会被清除。仅对保留 stored asset 的那一阶段使用此 normalizer。没有 nodeId 的 string-url 对象也不会成为 stored asset；而带合法 asset nodeId、string 空白 URL 的对象在该阶段保留。错误类型超出已确认的有效数据合同，不能以防御性 parser 测试声称与原站完全一致。

## Typed、Mixed 与空白处理的两阶段协议

module 677418 `applyMediaListOrder`：没有 order 或列表长度 `<= 1` 时直接返回原列表；否则以 nodeId 建 Map，依次取 order 中存在的 ID 并删除，再追加 Map 剩余 values。未知 order ID 忽略；相同 nodeId 最后 value 覆盖前者但保留第一次插入位置。非空 order 的此路径会去重；没有 order 时不会先做同样去重。

`buildMixedList` 先按 IMAGE→VIDEO→AUDIO 拼接，并为 clone 附 mediaType，然后按相同 Map/order 规则处理原 mixedListOrder。`ig` 的旧 mixed 列表是从原 raw typed arrays 按原 mixedListOrder 构造；新 mixed 列表是从新 `P/E/O` 按同一旧 mixedListOrder 构造，未改用一个新推断 order。不同媒体同 ID 的 Map 冲突也遵循该机制，不是按 URL 比较。

`ig` 第一阶段 recognized 正则为 `(\n[ \t]*)?\{\{(Image|Video|Audio|Mixed|Portrait)\s+(\d+)\}\}[ \t]*`。每个 occurrence 从其旧类型列表的 1-based index 取旧 nodeId，再到新相应列表查同 ID：没有旧 nodeId 或新列表已无该 ID则删除整个 match；ID 留存且 index 相同则原 match 逐字保留；index 改变则保留捕获的前导 LF／横向空白，输出标准 `{{Type <newIndex>}} `。Portrait 与 Image 共用 imageList。Text、Element、Magic、CameraPreset、SegmentRange 等不属于这个 recognized 正则，不能顺手清理。

第一阶段 mixed 开关来自 **原始旧 params.modeType 与旧 params.model**。module 469850 的条件为 mixed2video、longVideo2video、videoExtend2video；或 videoEdit2video 且 module 98844 判断 Seedance25 model。字符串 exact 为 star-video2.5／star-video2.5-draft；对象 modelKey 可为任一，或 modelVendor 为 star-video2.5。删除后媒体 resolver 可能改 mode，但不能提前用 next mode 来解释这一步 token。

若第一阶段没有替换且旧协议也非 mixed，立即返回原 prompt。旧 mixed 协议则把第一阶段结果交给 `normalizeMediaMentionsToMixed`。第二阶段先检查是否含 Image／Portrait／Video／Audio typed 前缀；没有前缀直接原样返回。存在前缀时按**新 typed lists** 查 ID，再到**新 mixed list** 查 index，生成 Mixed token／删除缺失项；helper 最后执行 `[ \t]{2,}` 合并、连续 `\n{3,}` 降为两个 LF，再 trim。这个 guard 可由 `{{Image x}}` 等未满足数字 replace 的前缀触发，不能用“有合法 token 才规范空白”代替。

返回 `ig` 时，若第一阶段确有变更或第二阶段结果确实不同，再执行 ASCII `/ {2,}/` 合并和 trim；否则保留原 prompt。两个阶段的空白规则不同，非 mixed 的 token 清除不能凭经验把所有 tab、换行或 NBSP 都变成一个空格。正则可吞 token 前一个 LF 及横向空白、token 后 space／tab；在未变化 token 中保留这些字符。

证据 ID：`typed-order`、`mixed-order`、`ig-token-remap`、`mixed-cleanup`、`typed-to-mixed`、`mixed-protocol-full-bindings`、`mixed-protocol-export`、`seedance-model-predicate`。

## Core、Prompt 与删除后的呈现

IMAGE／VIDEO／AUDIO 的 init/projection 会从更新后的 raw params 继承 prompt，再按各页面规则投影 incoming lists、mode 与 schema。IMAGE 和 AUDIO 没有注入 `normalizeParams`；VIDEO 注入 `normalizeDirectorStudioVideoParams`，不能将三页视作完全相同。

`useGeneratorCore` 初始化、incoming identity 变化及 model 切换是独立 effects。incoming 同步先对当前投影执行页面的 `onIncomingSync`／可选 normalize，再执行 `ensureMediaListOrder`，由 `updateNodeDataSystem` 写回。这个 ensure 只为非空、合法 nodeId 列表维护 order，不 remap prompt，也不会因列表空了自动清除旧 order。IMAGE incoming callback主要选择兼容模型与 focus patch；其中 fallback-model 分支调用 `w` 时，可能继续删除 `focusRegion.nodeId → target` 的首条 edge，并关闭 focus UI、清除 focusRegion／originImage／scene。它不是一个纯 params patch，不能把普通无 focus 用例当作这个后效已验证。AUDIO主要改 fallback model／scene；VIDEO可能改 mode／model，且 extraConfig、pictureEditLock、selectionConstraint 与 segment-remake 有其门控。它们不能代替先发生的 store token 清理。

VIDEO 的 module551533 normalizer也已核定义：只有存在 DirectorStudio来源、且不处于 picture／segment锁时才限制为 text2video／mixed2video，按 enabled availability选择模式，必要时修正 settings／advancedSettings；保留 prompt。正常 ordinary删除的 token映射仍先按旧 params 的协议完成，不能将这个后续 mode规范化提前。

`useIncomingNodeData` 的 signature 是 source 数据、target refImages、focus ID、group excluded 等，没有 target prompt 或 target order。生成器仅更新 order 不代表 incoming effect 一定重跑；普通删边／exclude则可改变来源 signature。其内容比较还可能复用旧 incoming identity，不应把重新渲染次数当作协议结果。

Prompt controlled-value effect 清 pending timer，再按外部值与 live lists重新呈现 DOM。live-badge effect 用稳定 nodeId 更新 index/type/display；缺失 source 的 badge 会被移除，并按 DOM 邻居 BR／text-node 的明确规则清理，必要时立即 `onChange`。mixed normalization还受当时 UI 的 mixed 协议与非空 mixed list条件约束。因此源码证明能确认 store 事务与这些实际后效，不等于声称原站 DOM/timer 的所有组合已真机通过。PenStudio 必须用真实 App／controller 测试验证 pending 草稿、200ms debounce、pagehide、undo／redo、存储失败和文档切换；不能只测纯 remap 函数就标完成。

证据 ID：各 `*-projection`／`*-init`／`*-core`／`*-incoming-sync`、`image-fallback-focus-cleanup`、`single-edge-delete`、`video-incoming-effect`、`video-director-normalizer`／`*-binding`、`core-complete`、`ensure-order`、`incoming-signature`、`system-node-update`、`prompt-external-value`、`prompt-live-badges`、`prompt-mixed-normalize`。

## 锁、特殊目标与证据边界

ordinary `ig` 对无 target/data 返回 false；SPACE_SCENE_720／DIRECTOR_CONSOLE_3D只从非 virtual incoming 的第一个 image 推 panoramaUrl；SCRIPT只走 style `il`；没有 params 则不进入 ordinary remap。不能把普通 IMAGE／VIDEO contract泛化为这些目标。

pictureEditLock 且新 VIDEO list为空时，原逻辑重置 prompt为 `""`，保留 model或空字符串，modeType `""`、count 1、settings `{}` 与新 text/image/audio lists；不会保留普通 params spread。segmentRemakeLock为 true、draft.phase为 submitted且其 source edge已不存在时，删除 lock与draft，并从 remapped prompt移除真正 SegmentRange tokens，再重算 style／lens effects，返回 true。editing phase 的实际 callback／store可能级联删除目标 continuation node；script／group来源关联可能弹确认；clip disconnect 另有异步 requestEditLock、owner generation校验及 timeline transaction。它们应单独实现／验收，不能用普通 synchronous reference测试代替。

`ig` 后续调用 IMAGE／SCRIPT material-style `il` 及 module464913 的 `recalcLensEdgeEffects`。已归档 `il` 可核：保留当前其余 params/prompt，更新来自 material-style节点的 fine-tune数据、必要 stale标记。module464913完整定义也在 `0leiedr1esdbe.js`：仅对 VIDEO params从实际 direct MATERIAL_LENS来源生成 lensModels与effects；旧 lensModels的 versionId决定哪些旧 effects归属镜头，保留其它正数effects及 extraConfig.effectId，再追加当前连接镜头的 versionIds。保留 prompt与其它 params；没有镜头时移除对应字段。不能用“只找到第一处调用”当作定义缺失，也不能由这个 narrow效果维护函数声称完整运镜／镜头工具已验收。archive中 module581906 `handlePortraitEdgesRemoved` 返回 `[]`、`handlePortraitNodesRemoved` 是 no-op；不能发明它们会删除普通人像节点的副作用。

本审计未验证服务器锁服务、认证权益、真实资产删除／认证、原站私人内容、视频播放或真机布局；也未修改或运行生产实现／测试。当前具体差距与本机验证以 Root 后续实现记录及 [实际画布验收档案](./canvas-reference-delete-app-review.md) 为准。普通排序的 IMAGE literal 协议不得套入本次删除：本次 `ig` 的 recognized token清理与重编号已有独立真实调用链证明。

证据 ID：`ig-lock-branches`、`segment-remake-editing-cascade`、`segment-remake-range-regex`、`segment-remake-range-strip`、`actual-edge-callback`、`material-style-recalc`、`lens-edge-recalc`、`portrait-remove-helper-noops`。
