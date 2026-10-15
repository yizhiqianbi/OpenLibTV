# ScriptV2 图片建图源码审计

日期：2026-10-12。只读取公开归档脚本，不执行原站脚本，不登录，不请求原站生成、审核、保存或消费服务。图片配置弹窗由独立 UI / config 审计记录；本文只覆盖 `r3 → tQ → sC` 的空图片节点建图及其直接 helper。

offset 是 UTF-8 解码后的零基字符位置。

## 实际调用链

| 文件               |                      offset / 函数 | 实际协议                                                                                                                                                             |
| ------------------ | ---------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js` |              r3 confirm 约 1183300 | `e.map((row,index)=>index).filter(index=>selectedSet.has(index))`，传当前 raw rows 的升序 index；不是 Set 插入顺序，也不是表格 UUID 选择。                           |
| 同上               |                       `tQ` 1381512 | `indices.map(index=>ez[index]).filter(Boolean)`，非空时关闭图片配置窗，然后 await sC；不主动关闭父全屏，不主动选组、fit 或设 100ms timer。                           |
| 同上               |               `sC` 1327988–1330640 | 从当前 store 读取脚本、assets 和实际 linked 节点首 URL，创建 image 派生组和空 image 生成器，补 refs 边 / childNodeIds，安排 mount reflow，linkStoryboard，等待保存。 |
| `0leiedr1esdbe.js` | `addNode` 95779 / `addNodes` 96650 | 写图、名称补全、createdAt、重叠调整、历史 / sync；没有隐式 selection / fit。`i_` 89212 仅补无名节点。                                                                |
| `3u6hjewm8qox_.js` |                 643721 `eD` 725047 | await `waitForSyncSaved?.(8000,groupId)` 后 return false。函数名 awaitGroupSaveOrRollback 不代表已实现删除 / rollback。                                              |

此前按 Set 迭代推断图片建图顺序并不完整；直接 r3 confirm JSX 证明 UI 先按当前 raw rows 升序过滤，再由 tQ 保留传入顺序。本模型和回归按完整 caller 链实现，不保留被纠正的顺序假设。

## 图片引用和 prompt

`sC` 固定调用 `collectShotRefImages(row,linked,{assets,sourceField:'imageGenerationPrompt'})`。这不是 v2 视频的 videoMotionPrompt 收集，也不加入分镜主图 / poster 占位。

- `3u6hjewm8qox_.js` 225860 `e_` 725208：遍历 characters / scenes / props。没有 id / linkedNodeId 或当前节点 `data.url[0]` 时跳过。当前 sC getter 只给 string URL，所以 ref 只有 `{nodeId,url}`，不把脚本资产 id、名称、缩略图或 portrait 证书伪装成图引用。
- 同文件 `eO` 726002：assets 存在时走 `collectRowAssetReferences`，按真实 linked nodeId 去重；不能把一节点关联的多个资产重复列为多个 image input。
- `447ud3w8leoy-.js` 892147 `collectRowAssetReferences` export 20066：structured character → `finalImagePromptEntityRefs` → sceneAssetIds → propAssetIds → 当前图片 prompt / plot fallback 的名称与 ID mention；最终 role buckets 为 character / scene / prop。不读取 finalVideoPromptEntityRefs。
- `447ud3w8leoy-.js` `buildPromptWithInlineRefs` 16777：缺 sourceField 时默认 imageGenerationPrompt，falsy 时退 plotDescription。实体替换另合入 plotDescriptionEntityRefs 和 dialogueLines.entityRefs，英文 / 数字实体至少 3 个字符、其他至少 2 个字符。长 text 优先，保留已经带 Image token 的位置。
- 同 helper 先做实体和 @ / ＠ 名称、ID 替换，再把合法 `@name({{Image N}})` 转为顶部“资产图锚定：”行。引用标签为“图片 1”“图片 2”，索引从 1 开始；已存在 token 不二次套 token，一个引用只生成一条 anchor。角色文案为“角色 / 场景 / 道具 / 资产”。
- **spoken dialogue sanitizer 只在 videoMotionPrompt / imageToVideoMotionPrompt sourceField 运行。** 图片 prompt 中对白引用仍可以形成资产 anchor，不能直接调用当前 video prompt helper 后误删这些锚定。

生产模型复用 batch-video-graph-model 已公开的 linked context、角色 / 名称 / ID reference collector、值克隆和 source autoPosition 数学；collector 的 video 命名字段仅通过内部 image 投影适配。实际 image prompt 独立保留源码的图片分支，复用公共 entity match helper，不修改 video helper 或读取视频字段。纯 descriptor 所有 Map 使用 **raw index**，没有 UUID 过滤。

`assetReadiness` 复用已存在的 workflow 只读媒体状态，缩略图能让资产卡显示 ready，但不能变成 sC 的实际 linked ref。`refCounts` / `references` 始终由当前真实首 URL 决定；首 URL 空而第二 URL 非空也不会自动取第二张。本地 blob / data URL 和水印 query 不被擅自剥离。

## 节点和关联字段

组名用 script.data.title → name → label → “脚本”的 truthy fallback，形成“分镜图 · {label}”。组 type `group`，zIndex −1001，style 原值：

```js
{background:'var(--canvas-group-bg)',border:'1px solid var(--canvas-group-border)'}
```

这是 linked image 的普通壳，不能套 standalone image / linked video 的深色 storyboard shell。style 常量在 `2mce1ay9u3g9g.js` 488692 `m` 13627。

组 data：type group、name、storyboardGroupType image、storyboardTitle、childNodeIds、sourceScriptNodeId、sourceScriptVersion v2、autoResizeToChildren true、autoResizePadding 40、**groupLayoutMode vertical**。`959759` 的 key 常量为 `groupLayoutMode`，不是旧 graph-plans 中的 layoutMode。source 没有 standalone flag、groupColor 或 sourceImageGroupId。

`989450 resolveStoryboardGroupSourceRowHiddenUuids` 在 `3u6hjewm8qox_.js` 756760，内部 `tc` 755241：selected UUID 过滤 falsy、去重；没有 UUID 时不写 subset，selected UUID 覆盖全部唯一 UUID 时也不写，否则落 storyboardSourceRowHiddenUuids。缺 UUID 行仍参与本图片建图，不能沿用 v2 视频按 hiddenUuid 过滤的协议。

每个 child：

- type image、parentId 新组、flow width / height / measured 匹配 ratio 尺寸。
- data.type image、原文名“镜头 {raw row.shotNumber}”；不把 raw 镜号重排为 1..N。
- url `[]`、action image_generate、contentWidth / contentHeight、`_explicitContentDims:true`、scriptRowHiddenUuid、showGenerator true。
- params 先完整 spread config，再覆盖 prompt。有实际 refs 时 modeType 强制 image2image，无 refs 时保 config.modeType 或退 text2image。imageList / imageListOrder / imageLabelList 有 refs 时分别为实际 refs / 实际 nodeIds / 当前标签，无 refs 时明确 undefined，清掉 config 内的旧媒体字段。
- 不创造输出 URL、poster、taskInfo 成功、`scene:'group-generate'` 或 portrait 字段；modelSchema 独立 caller 资格输入，不塞入 params。

真实 ref node → 新 image 的普通 source / target handles 边逐镜建立。`700819 linkStoryboard` 在 `3u6hjewm8qox_.js` 72584，默认边源是脚本：script → 新 image group，patch 仅 script.linkedImageGroupId。保留旧组、旧边、原脚本 rows、linkedVideoGroupId 和 imageGenConfig；sC 不保存本次 config 到 script.imageGenConfig。

## 比例、初始位置与 mount reflow

`713118` 在 `1kb-4b4zv9_2a.js`：computeNodeDimensionsFromRatio 1219 / extractRatioFromNodeParams 1596。比例从 settings 原 helper 优先取，之后 aspectRatio；短边 350，长边最多 1050，按 parseInt 两项解析并 round，auto / 无效值为 350×350。与 natural image helper 的 5600 cap 不同。生产复用已核对的 storyboard-grid-model 对应纯 helper：16:9 是 622×350。

`240669 calcGroupAutoPosition` 在 `2mce1ay9u3g9g.js` 25716：读取 stored position，script measured.width 优先 → stored width → 600，首组放脚本右侧 +200；右半区同脚本的 group / video_group 取最右 measured / stored edge +200，y 保脚本 stored y。不是通用 worldposition / findRightSidePosition，不能改成 +100 或把每个派生组向下堆叠。

sC 初始 group width=`w+80`、height=`60+N*(h+40)`；初始 child x40、y=`60+i*(h+40)`。随后 `710487 scheduleAutoBoundsGroupReflowAfterMount` 在 `1eqsg-pmc0mun.js` 101761 调两层 RAF，以 `sizeMode:'visual'` 执行 `T`（100337）。

- T 只处理 group + strict autoResize true，排 standalone strict true / video subtype；读取 preferred childNodeIds 的完整实际孩子顺序。
- `959759 calculateGroupLayout` 的 `f` 函数在 `1eqsg-pmc0mun.js` 98183，内含 vertical 分支。常量来自 `04q9x43g2p9-v.js` 27770：padding 36、top 66、gap 36。visual 使用有限正 measured 尺寸；当前新 image 初始 measured 正好是 ratio 尺寸。
- 孩子重排为 x36、y=`66+i*(h+36)`，layout width=`w+72`、height=`66+N*(h+36)`。组 size grow-only：max(initial size、layout size、2×autoResizePadding)，同步 flow / measured / data.nodeWidth / nodeHeight，不缩原初始壳。
- 例如 1 个 350×350 child：初始壳 430×450，最终 430×452；2 个 child：初始 430×840，最终仍 430×840，孩子 y66 / y452。

**本机原子适配：** 手工 renderer 没有原站 RF mount 测量流程。本 planner 把上述新节点正常 measured visual reflow 与初始建图合成一次 CAS / history，不另开 RAF 写半提交图；返回 initialBounds 和最终 bounds 供审计 / caller 读取。图片路径不借 v2 视频的 100ms select / fit。

source store addNode 还默认调用 e5 重叠调整，已在本批新 image 模型内复现，不改变共享 store 或视频模型。`0leiedr1esdbe.js` e1 约 59060 / e2 / e4 / e5 59464：

- 每个已有节点直接使用 stored position，box width / height 为 measured nullish → stored nullish → 350。这里不使用 world position 或 data.contentWidth / contentHeight。
- margin 是 `NODE_GAP / 2 = 50`（NODE_GAP 100，见 `1kb-4b4zv9_2a.js` 761）。四条重叠判定严格 `<` / `>`，刚好接触 50px margin 不移动。
- 默认 preferAxis vertical，仅向下动 y；每个相交 box 取 y 方向上下两种穿透距离的绝对值最小值，然后所有 box 取最大值作为本轮 y 增量。不改为一次取最大底边，也不选择向上或向左右移动。
- 最多 30 次；很高的 blocker 在靠近上缘时可能反复小步下移，30 次仍未完全清空也照原规则停止，不无限循环。
- 使用 sC addNode 时的 **初始** group width / height，之后 grow-only mount reflow 不再二次碰撞移动。`initialBounds` 的坐标是已经过默认避重叠的实际初始壳坐标。
- 显式 groupPosition 是既有本机精确 placement override，不再挪；未指定时先 calcGroupAutoPosition，再上述碰撞调整。默认 placement 读取到 NaN / Infinity / 字符串 / 负尺寸拒绝整图，是损坏输入的本机安全边界；0尺寸仍保源数值，结果坐标还须 finite。

## 纯接口、原子边界和未连接服务

```js
describeScriptV2ImageReferences({ nodes, scriptId });
// valid/reason, script, complete raw rows;
// refsByRow: Map<rawIndex,{row,references,prompt,imageLabelList,previewPrompt}>
// refCounts: Map<rawIndex,count>, prompts: Map<rawIndex,previewPrompt>
// requiredRefs/maxRequiredRefs, assetReadiness, assetsReady.

planCanvasScriptV2ImageGraph({
  nodes, edges, scriptId, selectedIndices: Set<rawIndex>,
  config, modelSchema, makeId, groupPosition,
});
// ok/reason/message, kind:'image', groupId/sourceScriptNodeId;
// addedNodes/addedEdges/nodePatches, gridWidth/gridHeight, initialBounds/bounds;
// warnings:[], submitted:false.
```

低层 sC 没有 schema / capacity / global assetsReady / nonempty prompt / portrait 资格门控。正常 r3 入口的当前模型候选、支持目录、selected refs max、prompt truthy 和 selected 非空由配置纯模型及 Root fresh submit 检查；本 planner 不误加视频 mixed 最小 refs、truncate、审核或费用规则。modelSchema 为可选独立 object 参数，不入 config / params，也不赋予真实生成能力。

本机明确校验 nodes / edges IDs、当前 script-v2、完整 raw rows 的实际使用字段、URL 首项类型、finite positions、explicit selected Set / 有效整数 raw index、config shape / 可克隆值和生成的新 ID 冲突。拒绝全部返回空 additions / patches 与中文错误，不发布部分图，不读时钟、随机数、store、React 或服务。这些损坏输入防护比 tQ 的 filter(Boolean) 更严格，是原子写安全适配。

Root controller 持有当前文档 / script / request / catalog owner、草稿 flush、最新 raw 图 CAS、一次 history、关闭与焦点、保存和 Quota 重试。创建空节点不代表提交生成，model 始终 submitted false。配额失败需要保已经提交的图、重试只保存，不能凭原函数名声称会 rollback 或删除新组。登录、账号资源、审核、费用、生成、服务器写入继续未接入。

## 定向验证

使用捆绑 Node **24.19.0**（当前 shell 默认 Node25，不把它当本批 Node24 结果）。首次 owned `v2-image-graph-model.test.js` 63 项通过；补完整 store placement 后，最终 **78 项通过**，2026-10-12 04:49:27，648ms。owned JS / test ESLint `--max-warnings=0` exit0，Prettier已格式化；生产与测试在该轮通过后冻结。

覆盖完整 raw-index descriptor、缺 UUID、图片 / 视频字段隔离、角色顺序与真实节点去重、首 URL / 缩略图边界、对白图片 anchor / video-only sanitizer 区分、实体 / 既有 token、source字段、独立 config 深克隆、原 raw graph / 旧link 保留、无 refs清理、raw镜号与升序选择、subset、ratio / autoPosition、即时 grow-only mount reflow、空生成器 / 引用边 / script link、schema不外推、非法选择 / config / URL / IDs / duplicate IDs / late failure 原子拒绝。placement 回归另覆盖 vertical / margin touch / 同时冲突 / measured 与 stored 优先 / 350 default / contentdims不偷换flowbox / 显式override / 初始size / 恰好30次最小穿透步进 / 坏尺寸原子拒绝。

没有运行全量工程检查或浏览器验收；实际 controller / dialog / graph commit / history / reload / 窄屏由 Root 接线验收。这个结果不表示完整 ScriptV2 流水线或全站复刻已经完成。
