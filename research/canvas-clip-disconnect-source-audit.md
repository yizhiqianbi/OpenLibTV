# Canvas 智能剪辑断线：源规则与本机接口审计

日期：2026-10-14。本文为只读调研，未改生产源码、测试、已有审计或已有 proof；没有执行、import、eval 原站脚本，没有网络、账号、测试或构建。仅新增本文与 [片段证明](../artifacts/canvas-clip-disconnect-source-proof.json)。证明重新读取 **9 个原文件、30 条原片段**，计算文件／片段 SHA 和 UTF-16、Unicode code point、UTF-8 半开坐标；另外保存检查时 **6 个本机文件、7 条本机片段**。本机记录是读取时快照，不是新的源码冻结或最终构建验收。

## 结论与当前范围

画布中 VIDEO／AUDIO→VIDEO_CLIP 的断线拥有独立 `mD` 计划、时间轴清理、异步授权和历史入口。只删除 edge，或者复用普通生成器引用重算，不能完成此交互。纯时间轴规则、前端异步分支、取消／拒绝／迟到结果及本地保存可以本机实现；远端成员锁、团队权限、云同步、AI 剪辑和合成服务才依赖真实服务。

本轮实施优先级由 Root 决定为 script／group unlink。本文给后续可并行的 clip 纯模型提供完整来源，不将调研等同于已实现。当前 `src/` 没有独立 clip timeline model、控制器、writer、renderer 或编辑锁 adapter；已有智能剪辑入口和合法性检查不代表时间轴已实现。

## 原文件定位

下表坐标是原文件 UTF-16 code units 的半开范围；另外两套坐标、原文与 SHA 全在 proof 中。原脚本只作为静态文本读取。

| 文件                               | 范围                                       | proof ID 与用途                                                                         |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `research/source/21_0xvlvkw1sz.js` | `[695998, 696043)`、`[696043, 696953)`     | `clip-node-kind-helper`、`ui-clip-disconnect-plan`：节点类型与完整 mD                   |
| 同上                               | `[940996, 945166)`                         | `ui-handle-edges-change`：实际画布边删除入口与各分支先后                                |
| 同上                               | `[941565, 942993)`                         | `ui-clip-async-delete`：并发锁、最新图重算、部分目标提交与释放                          |
| 同上                               | `[690968, 691402)`                         | `clip-failure-feedback`：失败通知及保留选择                                             |
| `research/source/0-8_zejn_ex9w.js` | `[17357, 17457)`                           | `clip-agent-editing-predicate`：运行中一小时判定                                        |
| `research/source/3u6hjewm8qox_.js` | `[1477899, 1479336)`、`[1479336, 1479546)` | `timeline-connected-layout`、`timeline-source-list-recovery`：完整布局及 source ID 恢复 |
| 同上                               | `[1479551, 1480338)`                       | `clip-timeline-disconnect`：完整 disconnectTimelineSource                               |
| `research/source/1al6tu79axqkm.js` | `[32847, 35074)`                           | `clip-track-rules-module`：完整 module 28845 的轨道纯规则                               |
| `research/source/44x8_9o6r7x1-.js` | `[117211, 118173)`                         | `clip-timeline-config`：module 123721 的时间轴常量                                      |
| `research/source/0leiedr1esdbe.js` | `[99342, 102155)`                          | `store-patch-graph`：预检、beforeApply、图补丁与同步入队                                |
| 同上                               | `[242737, 244782)`、`[244782, 245820)`     | `request-edit-lock`、`release-edit-lock`：完整请求／释放生命周期                        |
| `research/source/1q5w-zbtkz5ka.js` | `[216899, 217103)`                         | `clip-authoritative-timeline-predicate`：权威时间轴规则                                 |
| `research/source/3u6hjewm8qox_.js` | `[1494243, 1495481)`                       | `clip-renderer-incoming-sync-effect`：已挂载 renderer 的旧时间轴同步                    |
| `research/source/1q5w-zbtkz5ka.js` | `[783167, 783285)`、`[792701, 792886)`     | editor store 绑定与 onClipDeleted／onClipRestored，区别于画布 mD                        |

`mA` 实际绑定 module 537854，`mP` 绑定 module 688111。`lJ` 实际绑定 module 28845，`lQ` 绑定 module 123721。Canvas UI 的 `A` 绑定 module 588839。`NodeType.VIDEO_CLIP` 的实际字符串是 `video-clip`，不是另造枚举。

## 1. 画布入口与 mD 计划

实际 `deleteEdgeById` 调用 `handleEdgesChange([{type:'remove', id}])`。恢复时直接交给 applyEdgeChanges；普通删除先分出编辑中的 segment continuation、需确认的 script／group 关联边及其余边，再在未设置 confirmed-delete 标志时对其余边调用 mD。普通 passthrough 边、clip 异步事务、编辑 target 删除及 script 确认是分别推进的分支；取消 script 确认不会撤销已经提交的其它分支。

mD 的节点类型读取为 `node?.type ?? node?.data?.type`，flow type 优先。请求的边不存在、source 不是 VIDEO／AUDIO，或 target 不是 VIDEO_CLIP 时进入 `passthroughEdgeIds`。VIDEO／AUDIO 对应 `video`／`audio` kind；不读取 URL、ready 状态或媒体时长来判断这一分支。

目标 `agentEditing` 满足以下源规则时，该边进入 `blockedEdgeIds`，不会成为 timeline transaction：state 精确等于 `running`，并且 startedAtMs 不是 number，或 `now - startedAtMs < 3,600,000`。恰好一小时已不阻断；未来数值时间仍阻断。源规则使用 typeof，未添加 finite 判定：数值 NaN 不阻断，正 Infinity 阻断。对损坏数据另加防御时须标明本机适配，不能改称原义。

其余 clip 边按 **target ID 首次出现顺序** 聚合 transaction。同一目标中的 edgeIds 按请求顺序累计；原 mD 不对请求 ID 去重。每条边顺次调用 disconnectTimelineSource，后条边读取前条边的 nextTimelineData。timeline 缺失或 helper 返回 null，仍保留该 transaction 的 edgeIds。仅 nextTimelineData 与原引用不同才带 `timelineDataPatch`。

## 2. disconnectTimelineSource 与轨道布局

source ID 为 falsy 时返回 null。按 kind 检查对应 source ID 数组以及匹配 sourceNodeId 的 clips；video 的 clip 判定是 **type 不是 audio**，并不要求 type 精确为 video。同 ID 的另一种媒体不应一并删除。

没有 source ID／clip 命中时返回 null；只在 source ID 列表命中、没有匹配 clip 时，返回仅过滤相应 ID 列表的新 timeline，保留 clips、currentTime、总时长和其它字段，不做重排。

真正有匹配 clip 时，l1 从原 source ID 数组保留顺序和已有重复项，按原 clips 顺序补进未登记但 truthy 的 sourceNodeId，再从待删 kind 的数组过滤该 source。l0 以这两份 source 列表清理并重排：

1. 只保留 truthy sourceNodeId 且位于相应 kind 集合的 clips；无 sourceNodeId 的 clip 不会在这次重排中保留。
2. 第一次 normalizeClipTrackZIndexes 压缩轨道。轨道取有限、非负数并 floor；其它值回退。视频轨道数量取当前视频最大轨道和有效旧 hint 的较大值，normalize 还保留由该数量得到的主轨索引，即使这条主轨暂时没有 clip。
3. 原 clip 遍历顺序决定 video track 分组插入顺序，各轨内部只按 startTime 排序。主轨是 normalize 后 `videoTrackCount - 1`，从 0 开始按 duration 连续紧排；其它视频轨保留 startTime。不能把所有视频都串成单轨，或给相同时间额外按 ID 排序。
4. 仍存在的 linkedVideoClipId 让 audio startTime 跟随对应视频；链接视频已删除时，只移除 linkedVideoClipId，保留该音频及原 startTime。audio source 未保留时才移除这条 audio。
5. 第二次 normalize 再压缩视频／音频索引。旧 audioTrack 优先用于解读旧音频轨；没有有效 audioTrack 时按 global zIndex 减旧 videoTrackCount 解读。输出所有 clips 去掉旧 audioTrack，音频 zIndex 位于视频轨之后。
6. 仅第二次 normalize 后主轨的第一个 clip 去掉 transitionIn。其它轨或后续 clip 的转场不清空。
7. totalDuration 取所有留下 clips 的有限 `Number(startTime) + Number(duration)` 最大正值；没有正值时回 **60 秒**。传入的旧 totalDuration 不作为下限。另一个 `MIN_TIMELINE_EXTENT_FROM_CLIPS = 0.05` 常量不参与这个 helper 的回退，不能误混用。

disconnect 最后 spread 原 timeline，只覆盖 source ID 数组、clips、videoTrackCount、totalDuration、currentTime；currentTime 为 `max(0, min(oldCurrentTime, newTotalDuration))`。其它 timeline 字段，包括裁剪、mute／hidden 数组等原样保留，这个 helper 没有替它们做 remap。源输入为数字时间；undefined／NaN currentTime 会按原表达式得到 NaN，不应假称源有默认 0。

这些规则可作为独立纯模型完整复刻，不需要登录、后台媒体任务或原站资源。只写一个 clips.filter 会遗漏紧排、双重 normalize、音画链接、转场、source-list 修复和播放头限幅。

## 3. 异步锁、fresh graph 与部分目标提交

异步 callback 先记录 storeInstanceId、projectId、projectGeneration，并从当时的边图收集各待删边两端 ID，去重后 **并发** requestEditLock，timeoutMs 为 3000。Promise 拒绝映为 `{ok:false, reason:'aborted'}`；ok 或 no_api 都进入成功锁 ID 集合。此 callback 没有传 AbortSignal，不能把 lock helper 支持 signal 等同于这个调用已在卸载时取消。

await 完成后，重新读取 canvas store，三个 owner 字段必须全部相同，否则不提交；已经进入 try 的 early return 仍执行 finally 释放。owner 有效时对 **最新 nodes、edges 与当前时间** 重算 mD，并重新检查 agentEditing。不能使用等待前的 timeline、节点或 token 覆盖期间的编辑。

一个 target transaction 只有 target ID 获准，且其中 **每一条边仍存在、两端 ID 都获准**，才整体接受。该 target 有一条待删边不满足就保留整目标事务，其它 target 可成功。等待期间同 ID 边变更端点时，新端点未获锁会阻止提交；等待期间边消失或类型变成 passthrough，不会在这个异步 callback 中补走普通删除。

接受的所有 transaction 一次 patchGraph，nodeDataPatches 仅带实际改变的 clipTimelineData，deleteEdgeIds 带其边 ID；snapshot 作为 beforeApply。patchGraph 返回 false 时给每个被接受 target 记 denied。finally 对 **所有已完成请求**调用 releaseEditLock，包含 denied、no_api；不是只释放成功锁。

`p0` 对 denied／timeout 反馈“部分节点正在被其他成员编辑，已保留选中”并选择这些节点；对 http_failed 反馈“删除已同步到本地，但同步到云端失败，请检查网络”。aborted 没有独立 toast 分支。busy 文案为“智能剪辑进行中，暂时无法断开素材连线”。这些都是可注入 adapter 的前端状态，不必等真实成员账号才能验证。

源边界需保留：request Promise.all 在 try 之前；理论上同步 throw 或 releaseEditLock throw 不是该片段保证全部清理的情形。patchGraph throw 会进入 finally，但其后 p0 不执行。这段 callback 没有等待 flush／服务器写结果，也没有自动 rollback。不要把它记成网络写已确认成功。

module 588839 的 request 对有效 ID 先增加引用计数，共享 pending promise；没有 bridge 返回 no_api，已有本人锁返回 ok，他人持有返回 denied，否则订阅 bridge、设置 timeout，并支持可选 signal。settle 清除 timeout／订阅／abort listener；release 减到最后一份引用才请求 unlock，pending 时标记 releaseRequested。该协作 bridge 不应在本机通过旧账号 token 或伪造团队成员创建。

## 4. patchGraph 与其它时间轴入口不能混用

原 patchGraph 合并 nodeDataPatches，确定需要锁的 target，预检锁、edge 有效性及 collab filter。拒绝时返回 false，beforeApply 不调用。只有授权预检通过后才 beforeApply→数据补丁→删／加边→对变化 target 调 ig→记录 store 图→同步入队→true。

clip callback 未设置 patchAfterRecalculate，因此 timeline 补丁先应用，再普通 ig。它没有调用 raw deleteEdges 的 `iu` persisted character-reference 清理或 `ih` group-exclusion 清理。用当前 planCanvasEdgeDeletion 先删边后另写 timeline 会引入不同副作用，也会分裂历史。未来 clip patch 应单独编排 graph 数据和 edge 变化，复用已核对 ig，但保持这一来源边界。

原 clip renderer 的 mounted incoming-sync effect 是另一条规则：`clipsAuthoritative === true` 或 **agentEditing 非 null** 都认为权威时间轴，跳过旧 incoming 自动重排。这个 gate 不同于 mD 的一小时 running 阻断。非权威数据按所有 incoming VIDEO／AUDIO ID 重排；当前 editor 打开且 ready URL source 尚未进入 clips 时延后重排。字段比较覆盖 ID／kind／startTime／zIndex／totalDuration／trackCount 后才写；该 effect 不更新 currentTime。

composer 内部 onClipDeleted 通过 store.deleteEdge 删除匹配 source→clip 边，onClipRestored 通过 store.addEdge 恢复；它不是画布 deleteEdgeById→mD 路径。onTimelineDataChange 写 clipTimelineData 并调用另一个 compose 同步动作。本轮没有完成 editor 内部删除、恢复、资产生命周期、音量、渲染器或导出服务的全链审计，不能由这些小片段宣称整个时间轴已核对。

## 5. 当前本机接口与建议接线

本机检查时可核对的接口：

| 文件／入口                                                                                                          | 已有能力                                                                                                      | clip 差距                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [catalog.js](../src/features/canvas/catalog.js) `TYPES`                                                             | 智能剪辑入口与描述                                                                                            | 不是时间轴功能实现                                                        |
| [model.js](../src/features/canvas/model.js) `createCanvasNode`                                                      | 泛用 node＋params 创建、已有文档保存可以保留未知 data 字段                                                    | 未初始化 clipTimelineData 或 clip editor 状态                             |
| [CanvasNode.jsx](../src/features/canvas/components/CanvasNode.jsx)                                                  | video-clip 有 URL 时复用普通 `<video>`，否则泛用生成器空态                                                    | 没有实际时间轴、打开 editor、轨道或 source ingestion                      |
| [connection-model.js](../src/features/canvas/domain/connection-model.js)                                            | VIDEO／AUDIO blob gate、30 个非 audio clips 上限、已使用 source 可重连；action fallback `video_clip_resource` | 只校验，不建 clip、探测媒体或处理断线                                     |
| [destructive-delete-model.js](../src/features/canvas/domain/destructive-delete-model.js) `planCanvasEdgeDeletion`   | raw iS／iv／iu／ih／ig 删除计划                                                                               | 不识别 mD、agentEditing 或 timeline patch                                 |
| [useCanvasGraphActions.js](../src/features/canvas/hooks/useCanvasGraphActions.js) `deleteEdges`／公开 `commitGraph` | 最新草稿投影、ready／readonly／document guard、同步 CAS、一次历史；其它画布 writer 协议可复用                 | deleteEdges 当前直接 raw plan，没有 async adapter 和 clip target 单位授权 |

建议先新增独立纯 track／layout／disconnect／mD 模型；输入输出保持 source 字段名和有序 transaction，普通 passthrough 交还原 pipeline，busy clip 边保持不变。不要把模型放回 NodeCanvas 或 UI 组件，也不要以创建一个普通 video 节点代替 VIDEO_CLIP。

随后独立 controller 注入 requestEditLock／releaseEditLock／now／getCurrentGraph，完成等待前 owner 捕获、等待后 fresh plan、按目标接受、一次提交和失败反馈。本机 adapter 明确只为本地工作区，可返回本地授权或 no_api，并通过可注入的 denied／timeout／aborted 结果验证前端；不模拟远端持有人或团队权益。接受前再次投影最新普通／script 草稿，带 expectedGraph 交给现有 CAS，取消／拒绝／owner 退休不得清掉输入或新增历史。

本机可增加有明确证据边界的加强：卸载／切文档 operation epoch 与 AbortController，捕获同步 adapter throw，并逐项保护 release 防止一项异常阻断其它清理。须标明这些是维护性适配，不能反向宣称原 callback 已有。等待期间新生成、改名、换 source、A→B→A、当前只读、quota／projection failure 都应实际验证；只测一个 pure happy path不足以证明 UI 交互完成。

后续强回归应覆盖：同目标多边与跨目标部分锁成功；锁等待时 agentEditing 启动／超时、edge 删除／改端点／类型变化；没有 timeline 也可断合法 clip 边；只有列表命中不动播放头；主轨紧排而 overlay 保位；同 source 的音视频分 kind 删除；linked audio 跟随／失链；主轨首转场与空轨 60 秒；其它字段、草稿和 viewport 保存；取消／失败零历史与成功一次历史、undo／redo／刷新恢复。当前任务只调研，不编写或运行这些测试。

真实服务边界为多人锁持有人与团队权限、云同步结果、AI 子 agent 剪辑、媒体合成／转码／导出／上传。实际 timeline 前端编辑、媒体 metadata 读取、source ingestion、空态／忙态／错误态、原 UI 比例和可操作控制仍是可继续实现的前端任务，不能全部归为“等后台”。登录注册与账号资源继续延期；本审计不要求用户登录或小号。
