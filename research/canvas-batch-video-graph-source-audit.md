# v1 分镜批量视频：空视频建图源码审计

日期：2026-10-12。范围仅为 v1 关联图片组的批量视频配置提交后建图；不含 ScriptV2 生成流水线，不运行原站 bundle，不调用原站审核、费用、上传或生成服务。

生产入口为 `src/features/canvas/storyboard/batch-video-graph-model.js`。配置入口、模型枚举和费用契约另见 [配置审计](./canvas-batch-video-configuration-source-audit.md)。所有下述 offset 是归档文件解码为 UTF-8 字符串后的零基字符偏移，不是网络字节位置。

## 证据链

| 文件 / 模块                                                 |                 offset | 本批核对内容                                                                   |
| ----------------------------------------------------------- | ---------------------: | ------------------------------------------------------------------------------ |
| `research/source/3u6hjewm8qox_.js`，模块 225860             |              717187 起 | 分镜关联分组、v1 批量视频配置及建图 factory                                    |
| 同文件 `e_` / `eO`                                          |        7252xx / 7259xx | 脚本资产到节点 URL 的绑定；角色、场景、道具参考图及节点 ID 去重                |
| 同文件 `eU` / `eG` / `ez` / `eV` / `eB` / `eH` / `e$`       |          726475–727924 | 首帧图模式选择、mixed 容量、截断与回退                                         |
| 同文件 `eW` / `eY`                                          | 727924 / 728676–730522 | `properties.portrait === true`；真实审核、轮询、证书更新和取消                 |
| 同文件 `eq`                                                 |          730522–734665 | 空视频节点字段、提示词投影、尺寸、组内位置、参考边、警告                       |
| 同文件 `eX` / `eZ`                                          | 734665 / 735049–739238 | ready 图与脚本行匹配、提交前数值名称排序、所有权、旧关联检查、建组、关联、保存 |
| 同文件模块 700819 `linkStoryboard`                          |  72584，字段映射 71866 | 更新脚本 `linkedVideoGroupId`；图片组 → 视频组连线                             |
| 同文件 `eD` / `tA`                                          | 725053 / 769590–770517 | 等待保存的实际返回值；配置成功关闭及 100ms 后选择 / fit                        |
| `research/source/447ud3w8leoy-.js`，302098 / 892147 / 52013 |    11214 / 12310–212xx | 资产规范化、引用收集、内联 Image token、资产图锚定、对白引用清理               |
| `research/source/2mce1ay9u3g9g.js`，240669                  |               25525 起 | `calcGroupAutoPosition`：关联组右侧 200px 位置                                 |
| `research/source/3shzcyguvjig6.js`，74509                   |                9228 起 | 人像证书有效时间与 60 天过期边界                                               |
| 同文件 978783 `shouldRunAutoCompliance`                     |                5632 起 | schema enable、默认值及 advancedSettings 显式审核开关                          |
| `research/source/1bflqug4ccoei.js`，713841                  |  62312，背景常量 67497 | 分镜组背景常量                                                                 |

## 当前纯模型协议

```js
planCanvasBatchVideoGraph({
  nodes,
  edges,
  imageGroupId,
  config, // model, modeType, settings, modelSchema
  makeId, // (kind: 'video_group' | 'video' | 'edge') => unique string
  groupPosition, // optional explicit adapter position
  portraitResults, // optional trusted injected service results
  nowMs, // explicit clock, required when checking a nonempty portrait primary URL
});
```

成功返回 `ok: true`、`addedNodes`、`addedEdges`、`nodePatches`、`groupId`、`sourceScriptNodeId`、`gridWidth`、`gridHeight`、`warnings`。`nodePatches` 是 `{nodeId, data}` 的部分 data patch；调用层合并既有 data，`undefined` 字段按更新协议删除。模型不返回拼接后的原图，不改变输入，不访问 store、React、时钟、随机数、网络或存储。

失败返回中文 `message`、内部 `reason`，所有 additions / patches 都为空；已分配过的 ID 也不构成部分图。审核阻断额外给 `portraitRequired: [{childId, url}]`，只有当前主 URL 非空且缺有效证书的分镜。所有返回均为 `submitted: false`，不能作为真实生成、服务提交或计费成功。

readonly、ready、documentKey、删除后同 ID 恢复、取消、异步等待、草稿投影、raw graph CAS、history、flush 与 selection / viewport 归 controller 所有。审核前后必须保持强图所有权，审核结果不得落入同 ID 的新文档或已删除后恢复的实体。最后 150ms prompt 草稿由 Root 提交前投影，不能在模型里从 UI 读取。

## 镜头资格与顺序

复用 `batch-video-config-model.js::resolveStoryboardBatchVideoShots({phase:'submit'})`，以实际 `parentId` 为准扫描当前图片组的直接 image 孩子。先按 `data.name.localeCompare(...,{numeric:true})` 排序，再按脚本 rows 原顺序匹配 `scriptRowHiddenUuid` / `hiddenUuid`。仅 ready 图参与，但 ready 的源条件是 `data.url` 中 **任意**字符串 trim 后非空；构建主 URL 始终是 **`data.url?.[0] || ''`**，不选取后面有效项。第一项为空而第二项有效的镜头仍进入计划，其主图为空，按 text / mixed 路径处理。

源 `eX` 对重复图 UUID 使用首个赢家；本地原子拒绝重复真值 row UUID / ready child UUID，避免静默绑定错误图片。v2、video 组、独立 image grid 及被 `script.linkedImageGroupId` 替换的旧组均不进入此 v1 路径。模型不创造遗漏镜头的内容。

## 参考图与提示词

`e_` 以脚本 `assets.characters/scenes/props` 的 `linkedNodeId` 查节点当前首 URL。这里原站 `eZ` 注入 `getNodeUrl` 返回 `node.data.url?.[0]`；不以资产 thumbnail 替代，不从节点盒子推断媒体。普通字符串保留全部 URL 查询参数，水印与处理参数不删。

`eO` 使用 892147 的引用收集顺序：结构化角色 → finalVideoPromptEntityRefs → scene IDs → prop IDs → 提示词 `@` 名称 → `@` ID，然后按角色 / 场景 / 道具桶展平。实际图顺序为当前镜头主图在前、资产参考在后；按 linked 节点 ID 去重，多个资产指向同一节点只有一张参考图。缺少 linked 节点或 URL 的资产不补假图。脚本 asset ID 不是媒体审核 assetId；原站字符串 URL 分支不自动从节点 `portraitAssetId` 为外部资产增加审核 metadata。源 `e_` 的 URL object 分支支持实际 media `assetId` / `compliantExempt`，本地保留该字段形态。

内联提示词依据 892147 / 52013 重新实现完整 glue，并复用已有已审计的 `prompt-compose-model.js` 小型纯 helper。未使用旧 `graph-plans.js::storyboardRowReferences/promptFor/buildStoryboardVideoGraphPlan`：旧函数的资产 ID、引用替换和节点字段不等同本路径。

- 原提示词是 `row.videoMotionPrompt || row.plotDescription || ''`。
- 汇总 video、plot、dialogueLines 的 entityRefs；ASCII 名称至少 3 个码点，其他至少 2 个，按 source UTF-16 位置和最长匹配处理。对应图片仍在当前参考列表才生成 `@canonicalName({{Image N}})`；没有可用图则是 canonical 裸名称。
- 第二遍扫描 `@` / 全角 `＠` 的资产 ID 与最长名称；保留 ASCII 邻接边界，不重复已有 Image 标记。不因为提示词里出现普通资产词就新增参考图。
- 只对白 / 旁白 / 台词 / dialogue / voiceover / 说等导语后的引号内容移除资产 mention / Image 标记，普通引号描述仍参与参考锚定。
- 最终提取合法且当前参考匹配的名称 token，在正文使用裸名，在前面生成 `资产图锚定：` 与按图片索引排序的 `角色/场景/道具 {name} 的参考图是 {{Image N}}`。每张图只用第一个合法锚定；labels 是 `图片 1` 等。
- 容量截断后才计算 prompt / order / labels，不保留指向被截断图片的 token。

## 模式与容量：保留源实际分支

`eU` 在有主图时优先选择能容纳总参考数的 `image2video`；只有一张且 single 最大数至少 1 时选 single。它只比较最大值，不额外依据最小值重新推断。

没有主 URL、没有资产参考时直接 text。没有主 URL、存在参考时，mixed 范围必须合法，正数参考不足 min 时不可用；最大数量为 schema mixed max 与 `mixed2videoConfig.imageMax` 的较小值，最多保留该数并返回 direct-capacity 警告。不可用则移除全部参考、使用 text、返回 unsupported 警告。

有主 URL 但 direct 模式容量不满足时回退 `config.modeType || 'singleImage2video'`。single 只保留一张；text 清全部参考。**若配置回退到 image2video，源此分支没有再截断超容量列表。** 当前模型保留并测试这一 quirk，不伪造已通过真实服务规格校验；后续 executor / validation adapter 必须处理提交资格。

source `eM` 实际 renderer 未传 per-shot durations / selectedHiddenUuids；本 planner不接受这些扩展，不把 row.durationSeconds 覆盖 settings.duration。配置的 `advancedSettings` 不进入 `eq` 的空视频 params，尽管原 eZ 的审核门控会读取它；本机审核服务是否连接由 controller / injected source 明确处理。

## 人像审核：服务边界与明确本机收敛

源 `eW` 仅严格 `modelSchema.properties.portrait === true`。74509 证书时效：有效正数 `portraitComplianceCheckedAtMs` 优先；否则节点 `createdAtMs`，但 `createdAtMsIsLocalPlaceholder` 时不能回退。未知时间、未来时间或 elapsed ≥ 5,184,000,000ms（60 天）都过期。

原 `eY` 对首 URL falsy 的孩子不调用审核。当前模型同样不让 ready 的后续 URL 替代首 URL，也不要求没有旧证书的纯空主图镜头有审核证书。**但 `eZ` 在进入 `eY` / `eq` 前检查所有 ready 孩子的已有证书：已有证书过期且自动审核关闭，立即 `compliance-failed`，此时首 URL 为空也不能跳过。** 模型保留这个 gate，且 `portraitRequired` 为空，防调用层擅自绕过已关闭的自动审核。自动审核的源条件是 `properties.autoCompliance.enable === true`，advancedSettings 显式 autoCompliance 只有 1 / true 打开；未显式设置时 default 只有 1 / true 打开。自动审核打开后，空主 URL 的过期证书按 `eY` 不请求 / `eq` 无主图处理。

存在当前主 URL 时，必须有未过期真实 `portraitAssetId` 或严格 boolean `portraitCompliantExempt`；无合法状态时在任何新 ID 分配前阻断整图，而非原 `eq` 在某些未启用自动审核情况下跳过缺证镜头后创建部分组。只有上述已有过期证书 gate 明确拒绝；缺证时本机允许调用显式注入的审核 source 后再规划，不伪造源未开启自动审核情况下的部分组成功。

注入服务返回最小证明：

```js
{
  childId,
  url, // exact current primary URL
  status: 'approved',
  checkedAtMs,
  assetId, // actual issued certificate, OR:
  exempt: true,
}
```

结果必须绑定当前镜头 ID + 当前精确 URL；重复、未知镜头、URL 已改、未 approved、未来 / 过期时间或缺证全部拒绝。服务来源由调用层保证，纯模型不声称验证远端证书真实性。审核成功产生孩子的真实证书 patch；对相反的过期证书字段设 undefined，避免免审与旧 assetId 同时被复用。这个清理以及 strict 类型证明、整图阻断为明确本机 adapter；源 exempt 回调本身只写 exempt / time，并未删除旧 assetId。旧证书的复用仍按源字段时间规则，没有追加源不存在的 URL 持久化字段。

portrait 且主 URL 非空时，源 `eq` 将资产附加参考截断到主图；主图只有实际 asset certificate 才带 `assetId`，免审主图不补 source 未写的 `compliantExempt` 字段。

默认审核 source 未连接时必须显示“审核服务尚未连接 / 证书已失效，未创建视频组”；禁止默认 approved、伪造 token、合规状态、费用权益或任务成功。本模型没有任何审核请求。

## 空节点、分组与关联

源尺寸来自 713118：ratio 按 settings.ratio → 其他 ratio* 非 auto → settings.aspectRatio → params.aspectRatio；短边 350、长边最多 1050，四舍五入。例如 16:9 为 622×350。每个 video 的 flow width / height、measured 与 data 的 `_explicitContentDims: true`、contentWidth / contentHeight 一致。

列数 `ceil(sqrt(max(shotCount,1)))`；孩子位置 `x=40+column*(width+40)`、`y=70+row*(height+40)`。组宽 `80+cols*width+(cols-1)*40`，高 `110+rows*height+(rows-1)*40`。

video.data 只有 type video、action video_generate、名称 `分镜视频-#{shotNumber ?? outputIndex+1}`、空 url、源主图 poster、上述 explicit dims 和 params。params 是 prompt / model / modeType / settings / image / imageList / imageListOrder / imageLabelList / scene `group-generate`。没有 `scriptRowHiddenUuid`、advancedSettings、output、任务成功、计费结果；不把空生成器当完成视频。

组 type 是 `group`，ID 用 video_group kind 生成；data 为 `视频组 · {label}`、groupColor null、sourceScriptNodeId、sourceImageGroupId、storyboardTitle、storyboardGroupType video、sourceScriptVersion v1。group label 使用现有名称 → characterAsset.roleName → label → `分镜组` 的 host 显示值。zIndex -1001、背景 `var(--canvas-storyboard-group-shell-bg, #212121)`、源 border。没有在组上添加 source 未写的 childNodeIds / videoGenConfig。

每个参考节点 → 新 video 用 source / target handles，图片组 → 新视频组同样连线；脚本只 patch `linkedVideoGroupId`。保留旧视频组、旧连线及旧配置，不把重新创建当自动删除。新的边 ID 由调用层 makeId 注入，替代源 addEdges 生成 ID。

默认自动组位置是 240669：脚本 measured.width → width → 600；与该脚本关联的 group / video_group 且 x 至少在脚本中线右侧，取其最右 `x + measured.width/width/0` 后加 200，否则脚本 x + width + 200；y 为脚本 y。源用 flow positions，不自行换算嵌套父级世界坐标。特殊本机嵌套渲染需要时可传明确 groupPosition，不改变默认源规则。

## 保存、取消与实现边界

原 eZ 使用上传 continuation guard 检查 canvas owner / 节点 incarnation；源不是审核输入完整 signature CAS。当前 Root 持 raw 图强 CAS 与投影草稿的一次 history 提交，是本机防止并发覆盖的 adapter，纯 planner不替 controller 宣称验证完成。

原 `eD` 在 await `waitForSyncSaved?.(8000, ids[0])` 后返回 false，不能由函数名推断真实 rollback。Root 若 commit 已成功但 flush 失败，应保留创建结果并只重试保存，禁止再建一组。原成功分支关闭浮窗、100ms 后单选新组并 fit；位置 / 延迟 / 关闭焦点由 Root / UI controller验收。

当前新增图数据校验、显式时钟 / ID、重复 UUID 原子拒绝、整图审核阻断、undefined 清证书、中文错误和同步 CAS 输出协议是已记录本机适配。源 normal valid 输入的顺序、字段、模式、尺寸与提示词投影不扩大成通用 batch 运行器。

## 定向验证

本批执行 `npx prettier --write` 两个 owned JS 文件、同文件 `npx eslint ... --max-warnings=0`，均 exit 0；`npx vitest run src/features/canvas/storyboard/batch-video-graph-model.test.js` 最终实际 1 文件 / 72 项通过。测试覆盖真实字段与空生成边界、script 顺序、URL[0]、ratio 尺寸、自动位置、资产去重与提示词、mixed / direct 容量、源超容量 quirk、人像证书 60 天边界 / 空主图 / 自动审核开关及过期 gate / 注入结果 / 失败原子性。

本记录不代表 Root controller / UI 浏览器验收、审核服务、费用 / 权益、真实生成 / 保存、真实手机 / Safari 或全站交互完成。后续全量检查与浏览器结果由主任务另记。
