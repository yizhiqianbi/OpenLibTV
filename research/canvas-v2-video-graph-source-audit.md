# ScriptV2 批量视频配置与空视频建图源码审计

日期：2026-10-12。仅静态读取公开归档源码，不运行原站脚本，不请求原站、不使用账号资源。本文区分配置弹窗、审核服务与空生成器建图；不把创建视频组当真实生成完成。v1 图片组浮条另见 [v1 配置审计](./canvas-batch-video-configuration-source-audit.md) 与 [v1 建图审计](./canvas-batch-video-graph-source-audit.md)。

offset 是 UTF-8 解码后的零基字符偏移。

## 入口和完整调用链

| source / 函数                                       |                         精确 offset | 已核对职责                                                                      |
| --------------------------------------------------- | ----------------------------------: | ------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js`，`rg`                            |                     1119955–1137700 | `BatchScriptV2VideoModal`：选镜、逐镜时长、mixed 模型、参数、只读 prompt 和审核 |
| 同文件 `aH`                                         |                             1109620 | asset thumbnail / linked 首 URL readiness                                       |
| 同文件 `a4` / `a6` / `a8`                           | 1114263 / 1114672 / 1114785–111755x | 审核 URL fingerprint、node continuation、真实 create / poll 与结果写入          |
| 同文件 `rw`                                         |                     1137694–114067x | 脚本行 → virtual empty images → shared `eq` → 新 v2 视频组                      |
| 同文件 ScriptV2 renderer                            |                   1332310 / 1340291 | 规范化资产 `T`；`en` getter 首 URL + node portrait metadata                     |
| 同文件 `ez` / `e1`                                  |                   1346135 / 1357939 | 全脚本 rows；资源态显示时按数组次序编号                                         |
| 同文件 `t4` / `t6` / `t8`                           | 1381785 / 1381885 / 1382032–1382828 | modal props、打开、提交并成功关闭 / 100ms 后 select + fit                       |
| 同文件浮动工具栏 / modal JSX                        |                   1387243 / 1391299 | 脚本自身 `onBatchGenerateVideos`；`rg` 唯一当前 caller                          |
| 同文件 `eq`，模块 390565                            |                       730522–734665 | v1 / v2 共用空视频字段、参考图、prompt、duration、尺寸                          |
| 同文件 `td`，模块 394932                            |                              755115 | undefined selection 全部；Set selection 按 hiddenUuid 原行顺序                  |
| 同文件 `eB` / `buildBatchVideoSubmitConfig`，483611 |                     727298 / 739413 | mixed 可用容量与提交配置注入 schema                                             |
| `447ud3w8leoy-.js`，302098 / 892147 / 52013         |                 11214 / 12310–212xx | 规范化资产、角色桶 refs、prompt 图片锚定与对白清理                              |
| `3shzcyguvjig6.js`，514509 / 74509                  |                      约 61xx / 9228 | v2 portrait-or-seedance 审核资格、60 天证书时效                                 |
| `2ilrvr6vqg1xe.js`，201006                          |                             9116 起 | Seedance2 判定是 `schema.modelVendor.startsWith('star-video2')`                 |

入口属于 **ScriptV2 脚本节点的浮动工具栏**，不是关联图片组。链路为工具栏 `t6` → `rg` → 强制审核选中资产 refs 的 `a8` → `onConfirm(config,durations,selected)` → `t8` → `rw` → shared `eq` → add group / videos / refs → `linkStoryboard(script,group,'video')` → await save → close / select / fit。此链路 **没有**提交 generation task、runGroupPipeline 或 group executor。

`t4` 明确传 `initialImageSettings: undefined`；不能从 linked 图片组第一张分镜图继承 ratio。modal 接收全脚本 rows，非 active view 过滤行；资源态 `e1` 展示把 shotNumber 规范为 1..N，提交 `rw` 则重新读最新 store `script.data.rows`，以该原数组顺序建图。

## 工具栏和 modal gate

工具栏 `disableBatchVideo` 是 `eU || !e0.outputGenerationReady || ez.length===0 || !Z`。`eU` 为脚本整篇生成状态；outputGenerationReady 要 shots / assets ready 且所有行 prompt 可用（image / video prompt 均非空且不处 generating）。`Z` 判断运营 `support.video` 中至少一个模型的 mixed capability 对 1 张资产 refs 可用。它不要求存在 `linkedImageGroupId` 或 ready 的分镜图。

`rg` 是 800px 居中的 modal，zIndex 500；禁点外部关闭，禁 Escape 关闭，处理期间 close 按钮 disabled。模型不是所有视频 schema 或 `support.storyboardVideo`，而是 `support.video` 中依据 selected rows 的最大资产参考数过滤后的候选。选镜变化可改变模型候选，已有模型不再合法时重置到新默认模型。

UI 提交 disabled 条件包含：没有选镜、处理中、没有模型候选、当前模型非候选、运营模型 disable、选中时长不支持、选中镜头没有实际 refs、选中镜头 refs 超 max、任何资产未 ready，以及选中源 prompt trim 后为空。`eP` 函数内部前置 gate 与按钮基本相同，但没有再次判断最后的 empty prompt `eA`；这不代表正常 UI 可提交空 prompt。

原 modal 文案是“批量生视频”“确认并创建视频生成器组 ({count})”；tooltip 明确“创建视频生成器组后，可在画布中整组执行批量生视频”。当前本机入口应继续明确未提交任务，不复用普通 batch runner 冒充这个流程。

## 行、选择、时长与配置保存

首次打开时，所有 truthy hiddenUuid 行默认选中；expanded prompt 集合为空；duration Map 使用每行 `durationSeconds`。打开期间 rows 变化：保留仍存在的 selected UUID、duration 优先旧 Map 值否则新行 duration，新追加行不自动选中。全选 / 清空操作以所有 truthy hiddenUuid 行为范围。

只有 config、selected Set、expanded Set 和 duration Map 保存在 modal 的 React state。关闭重开重新初始化；没有保存 `script.data.videoGenConfig`、group.videoGenConfig 或把 duration Map 改写回脚本 rows。模型改变重置默认 settings / autoCompliance advanced 默认，保留允许的当前 ratio，否则尝试 optional initial ratio。实际 caller initial ratio 没有来源。

普通参数固定 mode `mixed2video`；按 schema `config.settings` 数组或该 mode / text 回退选择，过滤 barOnly、enableSound、duration。enableSound 有 schema 字段时设置其 store key 为 `'on'`，不是对外暴露声音开关。autoCompliance 的 schema 默认进入 advancedSettings，提交审核会强制该值为 1。逐镜 duration 单独呈现，不使用普通 settings duration 统一覆盖所有镜头。

duration constraint：取 properties.duration 的有限 number enum / object.value number，非空则 enum；否则合法 finite min/max 且 max≥min 用 slider，step 正 finite，否则 1。没有 constraint 时 finite duration 即支持。enum 必须精确包含；slider 要在范围且 `(duration-min)/step` 距最近整数 < 1e-9。只有单 enum 或 min==max 时该支持的行只读，但不支持的旧值允许改回合法值；未合法前禁提交，不静默舍入后宣称有效。

提交 `eP` 只把选中 UUID 的 finite duration 值写入新 Map；`filterRowsBySelection` 对 undefined selection 返回所有 rows 的浅副本，显式空 Set 返回空，没有“未选择就全部”。未知 UUID 被自然过滤。本机必须区分这两种输入，重复 / 损坏 UUID 可原子拒绝。

shared `eq` 实际建节点时仍会把 duration 约束化：enum 选最近值，距离相等选较大的值；slider 先范围限制，再 `min + round((value-min)/step)*step`，最后限幅。没有该行 finite Map 值或没有 hiddenUuid 就保留 config.settings。UI 正常输入已经合法，但纯 helper 该分支不得误用 generator 普通 blur 的零基准舍入规则。

## 资产 readiness、actual refs 与模型容量

modal 全局 readiness 来自规范化后的全脚本 assets：每个资产 `thumbnailUrl.trim()` 非空可 ready，否则 trim 后 linkedNodeId 查 getter，首 URL string / object.url trim 非空可 ready。只有 0 pending 才提交；这是 **全部资产** 的状态，不仅选中的镜头 refs。

真实 refs 来自 `buildAssetLinkedNodeMap` / `collectShotRefImages(row,{sourceField:'videoMotionPrompt'})`：按源角色 / 场景 / 道具顺序收集 row 结构化 IDs、finalVideo entityRefs、@ 名称 / ID，再映射 linked 节点与当前首 URL、按 nodeId 去重。**thumbnail readiness 不会把 thumbnail 自动填入 reference list**。只有 thumbnail 而没有 linked 可用图的资产能让总资产 ready，但选中行仍可能因 actual ref count 0 禁提交。

最大 requiredRefs 是 selected rows 的资产 refs 最大值；没有镜头主图占位参与资格。capability eB 只考虑合法 mixed mode 范围与 imageMax：0 / invalid max 不可用，正数 refs 小于 min 不可用；refs 超 max 时 helper 仍 `usable: true, willTruncate: true`，UI另判断逐镜超 max 禁提交。不能因为 helper usable 就让正常 v2 UI 提交并悄悄截断。

总最大值可用不等于所有行都达到 mixed 最小门槛。`eH` @727675 / `e$` @727864 与 `eq` @730522 会重新按每行 actual refs 数解析模式：某行 refs 小于 mixed min 时，该行变 `text2video`、清 imageList，imageListOrder / imageLabelList 为 undefined，没有该行资产边；视频节点仍创建。prompt 使用清除 refs 后的 shared inline helper，不保留不存在的 Image 锚点。真实目录 `kling-v3-motion-control` 的 mixed 范围是 `[2,2]`：同时选择 1 refs 与 2 refs 的行，modal 最大值 2 可提交，最终两行分别 text / mixed。原源对失效 refs 聚合 `canvas:storyboardVideoRefUnsupportedByModel`，values 为 `{shotCount,refCount}`；中文见 locale-zh 的同 key。本机 planner 返回同 warning descriptor，由 Root 在提交成功后展示；不将警告当真实生成结果。

展开 prompt 的预览为假 `__poster_placeholder__` 加实际资产 refs，所有 preview URL 为空，经 shared inline helper后把 Image token显示为“图片N”；这是只读展示的索引偏移，不是生产主图，也不能给建图写入这个假节点。实际 rw 的虚拟镜头 URL=[]，所以最终生产 references 从资产图 1 开始。

## 审核服务的所有权

`a8` 使用 `modelRequiresPortraitCompliance`，是 `schema.properties.portrait === true` **或** Seedance2 modelVendor prefix；比 shared eq 的 strict portrait gate 更宽。选中所有 row refs 展平，按 nodeId 去重待审核。合法已有 assetId / exempt 且未过期可直接复用。时效同74509：positive checkedAt优先，否则 sourceCreatedAt除placeholder；未来 / 未知 / elapsed≥60天过期。

`eP` 传 `advancedSettings:{...D.advancedSettings,autoCompliance:1}` 且 `forceAutoCompliance:true`。因此 v2 modal 的这次审核不允许以高级设置关闭自动审核绕过，也不能套用 v1 现有过期证书 + autoCompliance off 的直接阻断分支。

原 a8 调真实 createComplianceAsset(url,'image',{force:旧证书存在}) / pollComplianceUntilDone。每个 URL先 capture node continuation，并确认 URL在当前 node.data.url / originalUrl 中；fingerprint 包含 type、url、originalUrl、portraitAssetId、portraitCompliantExempt、checkedAt。create之后、poll之后和逐个写入前都校验同guard + fingerprint，否则 aborted。成功通过 updateNodeDataSystem 写实际 assetId / exempt / checkedAt；源 exempt 分支没有删除旧 assetId。部分服务失败返回 failedCount，不能伪造已批准。

当前工程默认没有真实审核 source。没有有效证书且模型要求审核时，本机应先返回待检查 refs / 中文阻断；只允许受信任 injected service 的 approved+checkedAt+nodeID+精确URL 结果重规划。Root持 AbortController、raw图 / 实体所有权、CAS、切文档 / readonly / 删除再恢复隔离。不能生成假证书、跳过 seedance 判定或用审核未接来要求用户登录 / 提供小号。

## rw 空视频图：没有分镜主图

rw读取最新脚本 rows，按 selected UUID筛选，造 `{id:'virtual-row-{index}-{hiddenUuid ?? id}',type:'image',position:{x:0,y:0},data:{type:'image',url:[],name:'分镜 N'}}` 的内部 virtual children；这些不 add到store，缺少真实分镜图不阻断建图。

`checkScriptV2VideoGenContract` 确认存在 linked assets 时必须由 caller 注入 modelSchema，否则 contract-violation，而不是悄悄清 refs。其 linked 节点不存在的扫描只作诊断，不直接 return fail；正常 modal已通过 readiness / refs检查，本机可以明确原子校验。

getNodeUrl 对当前 getNodes 首 URL nullish 回退 store旧快照首 URL；object 还携旧store节点的 portrait证书 / checkedAt / createdAt。正常本机单一最新graph无需制造两份冲突 source快照，审批结果补入最新 projected source 后生成refs即可，raw expected仍用于CAS。

shared eq 因 virtual主URL空，生产节点 poster=''、image=''；actual资产refs达到该行 mixed 最小数量时为 mixed2video，refs/order/labels为真实linked asset nodes；不足 min 的行按上节转 text2video 并清引用。prompt、场景、dims/grid与v1共用：短边350 / 长边≤1050；cols ceil√镜头数；左右40、顶部70、gap40；组宽80+列宽+间距，高110+行高+间距。每个新 video是空url、action video_generate、explicitcontent dims、`scene:'group-generate'`，没有scriptRowHiddenUuid、advancedSettings、taskInfo成功或输出。

组 type group、sourceScriptVersion v2、sourceScriptNodeId、storyboardGroupType video、storyboardTitle、groupColor null；名称 `视频组 · {script.title || script.name || script.label || '脚本'}`。**没有 sourceImageGroupId。** group shell背景 / border / zIndex−1001、autoGroupPosition与v1同source helper。

refs实际linked node → video；普通关联边 **script → 新视频组**，不是 imageGroup→videoGroup。linkStoryboard只patch script.linkedVideoGroupId，保留既有视频组 / 边 / 脚本行；不保存config、逐镜duration或本次selected镜头清单到脚本或group。

成功不是运行：t8关闭modal，100ms后仅选新组并fitBounds duration400 / padding.15。共享 awaitGroupSaveOrRollback函数实际resolved时returnfalse，并不提供可靠rollback；本机commit成功后flush失败须保created结果、重试只保存，不重复建组。

## 新接口建议与本批工程缺口

旧 `CanvasScriptNode::ScriptGroupDialog(kind='video')` 的所有videoModels下拉、GeneratorSettings、旧videoGenConfig初始化、controller空selection默认all与 `graph-plans::buildStoryboardVideoGraphPlan` 都不满足此v2源入口。不能把表格“生成分镜视频”generic弹窗标作已验收v2modal，也不能用linked镜头图资格替代资产refs。

建议独立纯协议：

```js
describeScriptV2VideoReferences({ nodes, scriptId, selectedHiddenUuids });
// rows always covers the entire script array.
// refsByRow: Map<hiddenUuid, {row,references,previewPrompt}>
// refCounts: Map<hiddenUuid, number>, prompts: Map<hiddenUuid, string>
// requiredRefs / maxRequiredRefs follows only the optional selected Set.
// assetReadiness:{total,readyCount,pendingCount,pendingAssetIds,ready}
// assetsReady aliases assetReadiness.ready.

planCanvasScriptV2VideoGraph({
  nodes,
  edges,
  scriptId,
  config,
  selectedHiddenUuids,
  perShotDurations,
  makeId,
  nowMs,
  portraitResults,
  groupPosition,
});
// additions / nodePatches / groupId / size / warnings / portraitRequired;
// no merged graph, no services, submitted:false
```

config/model候选/selection/duration校验由独立v2 config model公开规则维护；reference descriptor提供共用实际refs，不各写第二套收集顺序。Root负责modal owner、最新raw CAS、草稿投影、一次history、审核adapter、保存重试、选择/viewport与Readonly。

## 本批纯模型实现与适配

上述两入口正式位于 `src/features/canvas/storyboard/v2-video-graph-model.js`。planner 必须传 explicit selected Set；descriptor 可以不传选择以读取全部镜头，显式空 Set 的 requiredRefs 是 0，但各 Map / rows 始终完整。descriptor 没有提前过滤 UI rows，使选择切换仍可根据完整 refCounts 调整模型候选。

最小共享变更仅在 `batch-video-graph-model.js`：增加 `createStoryboardVideoReferenceContext`、`collectStoryboardVideoRowReferences`、`projectStoryboardVideoPrompt` 公开出口，以及 clone / autoPosition / referenceMode / max 的纯 helper出口；URL object metadata按源e_保留。v1 原 planner仍使用 URL-only getter，视频 params仍只写源允许的媒体字段，不带临时 checkedAt / createdAt。没有为v2制造假imageGroup或假readyURL来绕过v1资格检查。v2预览的源poster占位只作为 prompt索引输入，没有进入文档图。

v2 planner返回 `{ok,reason,blocked,message,addedNodes,addedEdges,nodePatches,groupId,sourceScriptNodeId,gridWidth,gridHeight,warnings,portraitRequired,submitted:false}`。nodePatches仍为 `{nodeId,data}` 部分data；包含实际资产审核更新与脚本linkedVideoGroupId。失败全部additions/patches为空，并有中文message。makeId显式注入，模型不读时钟 / 随机数 / store / React / IO。

`portraitRequired` 按真实selected linked节点去重，结构为：

```js
{
  nodeId,
  linkedNodeId, // same actual node ID
  assetIds, // raw script asset IDs linked to this node; not media certificates
  url, // exact current URL[0], including watermark/query parameters
  originalUrl, // original URL string array from current node data
  assetId, // optional existing real media certificate
  compliantExempt, // optional valid boolean
  complianceCheckedAtMs,
  sourceCreatedAtMs,
  sourceCreatedAtMsIsLocalPlaceholder,
}
```

Root的独立 `checkV2Portrait` adapter 返回 `{nodeId,url,status:'approved',checkedAtMs,assetId?、exempt?:true}`。默认没有adapter，缺证会阻断；已有有效证书 + 显式nowMs时直接建图，不要求 reader或再次审核。证明匹配当前 node ID / URL，审批时间未过期，且 certificate string / exempt boolean 合法才能补到 projected源。缺时钟、未知 / 重复 / URL改变的结果、未批准或不合法证明拒绝整图。相反的过期证书字段用undefined清理；严格类型证明 / 清理为本机adapter，避免损坏数字ID、字符串免审值当真实授权。旧有效证书按source created-time规则复用，不新造持久化的认证字段。

planner保留正常 modal 资格：全部资产ready、所选每镜实际refs非空、mixed可用且每镜不超max、prompt非空；非法输入不由低层eq截断后伪装正常UI提交。逐镜finite Map值按eq原min-based/nearest规则正规化，未知/缺省Map项保留config.settings；非finite / 非Map作为本机原子数据边界拒绝，而源eq会忽略非finite项。没有运营support / disable /余额 / prompt stage授权信息时，planner不假造这些状态，caller必须用config公开projector和ScriptV2实际入口门控。

## 实际定向验证

本批对新v2 JS与最小改动v1 JS / test运行 Prettier、ESLint `--max-warnings=0`，均 exit 0。首次两个模型文件 127 项通过；补精确逐行最低门槛后，`npx vitest run src/features/canvas/storyboard/v2-video-graph-model.test.js src/features/canvas/storyboard/batch-video-graph-model.test.js` 最终 **2 文件 / 129 项通过**。覆盖全row descriptor / 选镜maximum、readonlypreview索引、thumbnail与实际refs区别、script→group空图字段、无主分镜图依赖、script原顺序、显式空Set、逐镜enum/slider时长、mixed容量、真实 Kling `[2,2]` 模型异质行 text fallback / refEdges 清理 / 源聚合 warning、人像 / Seedance门控、60天证书 / 服务匹配 / 失败原子性，并保留v1 URL-only / 原字段回归。

仅owned纯模型与这些定向回归已验证；Root hook、modal、CAS/flush浏览器与完整工程检查由主任务另记。

本次未跑完整工程检查或浏览器验收。真实审核、费用 / 权益、生成、运营保存、手机 / Safari，以及完整ScriptV2流水线仍是独立边界。

## 实际接线的独立只读复核

复核 Root 的 `useScriptV2VideoConfiguration`、NodeCanvas → CanvasViewport → CanvasScriptNode 实际 props、graph commit / draft / autosave 边界、controller 17 项与实际 NodeCanvas 5 项回归，并读取 React best practices 技能。此复核没有运行这些联合测试或修改 Root 生产文件；其真实结果由主任务补记。

未见新的 P1 所有权或保存缺陷：审核操作捕获 raw nodes / edges / models，service / catalogue / 文档 / ready / readonly 变化失效；结果重新规划后通过 raw CAS，成功提交同步发布图并只记一次 history，commit 内投影当前有效草稿到新图与 undo 基线。flushGraph 使用实际提交的 nodes / edges，Quota 失败保留已经创建的组与锁定参数，重试只保存当前图；不能把失败当已上传。缺审核 adapter 明确阻断；services 的 optional checkV2Portrait 只声明注入契约，没有原站请求客户端。

关闭后 100ms 的选组 / fit 持有文档、脚本、实际新组对象及原 selection；切文档、失去 ready / readonly、用户 pointerdown / selection 变化、pagehide / unmount 取消旧 timer，是比 source t8 mounted-only 更严格的本机适配。dialog / 嵌套菜单复用共享 stack，菜单 portal 在当前 dialog DOM 内，没有新增 body inert / overflow 所有者；非 busy Escape 可关闭属于已记录的本机键盘适配，原 rg 禁 Escape。descriptor 在有 request 时按节点数组 memo；refs / selection Maps 属于 pure model，services 不反向依赖 feature。静态结构不能替代重型画布性能测试。

本轮确认并报告两处 P2 源差异：显示 rows 应使用 resource 态临时 1..N 镜号，建图仍读 raw rows；逐行 mixed min 不能硬编码全组 mixed。Root 接管前者；后者已由本 owned 模型修正并新增上述回归。未用这些定向结果宣称完整流水线、真实审核 / 生成或手机 / Safari 验收完成。
