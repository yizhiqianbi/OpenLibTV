# VIDEO_CLIP 素材断线

本目录复刻画布 VIDEO／AUDIO → `video-clip` 的 mD 预检、时间轴断线与前端异步锁流程。来源为 [clip 源审计](../../../../research/canvas-clip-disconnect-source-audit.md)、[30 段原文 proof](../../../../artifacts/canvas-clip-disconnect-source-proof.json) 和 [selected／mixed 调用链](../../../../research/canvas-selected-delete-source-audit.md)。只静态读取原文，不执行原脚本、访问账号或调用原站服务。

`track-model.js`、`timeline-model.js`、`disconnect-model.js` 为纯规则；controller 持异步操作，hook 持 React owner 生命周期，反馈交给现有通知和节点选择视图。本目录不复制 Canvas 主页面，也没有时间轴 renderer。完整编辑器的媒体接入、波形、编辑控件、AI 剪辑和导出尚不属于这次断线实现，不能将这些前端差距统称“等后台”。

## 预检与事务

公开入口 `index.js` 导出 `resolveCanvasClipDisconnect` 和 `useCanvasClipDisconnect`。纯模型可直接引用 `disconnect-model.js`，不经包含 React hook 的聚合入口。

```js
resolveCanvasClipDisconnect({ nodes, edges, edgeIds, now });
// {
//   passthroughEdgeIds,
//   blockedEdgeIds,
//   transactions: [{ targetNodeId, edgeIds, timelineDataPatch? }],
// }
```

type 使用 `node.type ?? node.data.type`；仅 video／audio → video-clip 聚合。保留请求顺序、重复 ID 和目标首次出现顺序。running 状态的 typeof／一小时边界按原表达式保留，包括 NaN、Infinity；busy 连线不进入事务。缺少时间轴或没有匹配引用仍可形成删边事务，不创造 timeline patch。

真正删除 clip 时恢复有序 source 列表、两次正规化轨道、保留空主轨、主轨从零紧排、overlay 保时间、关联音频跟随，已删视频的音频失链但保留。仅主轨第一个 clip 移除 transitionIn；总时长使用保留 clips 的最大有限正结束时间，空结果回 60 秒；播放头限幅。仅 source 列表命中时不重排或限幅。原始静音、hidden、裁剪和其它字段不重映射，输入不变。缺失 currentTime 按原表达式可得到 NaN，纯模型不假称源默认零。

Root 在 ordinary edge 提交前预检，然后在 ordinary 之后启动 clip 事务。异步 clip 不阻塞后续 editing、关联确认或节点阶段；这些阶段的 source／本机历史边界由 selected coordinator 维护，不能把整个 mixed 操作称作固定一次 undo。

## 可注入端口

```js
useCanvasClipDisconnect({
  documentKey,
  ready,
  readonly,
  port,
  beforeApply,
  notify,
  selectNodes,
  now,
});
// { pending, operations, lastResult, disconnect(edgeIds), cancel(operationId) }
```

`port` 在当前 owner 内保持对象身份稳定。`getDocument()` 返回 nodes／edges、三个 owner 字段 `storeInstanceId`／`projectId`／`projectGeneration`，以及可选 documentKey／ready／readonly。hook 同时要求显式 ready=true、非只读；切文档、A→B→A、能力变化、替换 port、Strict replay 和卸载退休操作。每次调用返回 Promise，旧 operation ID 不能取消新操作。

- `mode` 为 `unavailable`、`local-workspace` 或 `collaboration`。没有端口默认明确 unavailable，不通过 raw 删除假成功。可独立传 `getDocument` 只读函数供 unavailable 分支识别 clip／busy。
- `requestLocks(nodeId, { timeoutMs: 3000, signal, owner })` 并发请求初始边两端的唯一 ID；结果为 `{ ok: true }` 或 `{ ok: false, reason }`。只有明确 local-workspace／collaboration 端口的 no_api 可接受。local-workspace 仅代表本机 lease，不能表示账号、成员权益或云锁成功。
- `releaseLocks(nodeId, { owner, signal })` 使用请求时同一 operation signal 释放，每个完成的请求只释放一次，包括 denied／timeout／no_api。本机端口按 signal 分开记录 receipt，未获得授权的取消或超时请求不能减掉同 owner 另一操作的 lease；不传 signal 的旧 API 使用独立 bucket。旧 owner 释放不得影响新 owner。迟到且忽略 abort 的请求完成后仍释放；释放异常不会阻断其它请求清理。
- `commitTransaction(patch)` 必须同步返回 boolean，不能返回异步任务充当已提交。false 保留所有本次被接受目标的整事务；不同目标可因锁结果部分成功，但单个目标不能只删部分请求边。

等待后重读三个 owner、fresh nodes／edges、类型和当前时间。只有 target 和 fresh 事务每条仍存在边的两端都获准，才将该目标加入一次 apply；变成 passthrough 的边不补走 ordinary 删除。patch 为：

```js
{
  transactions, // 每个目标一次
  nodeDataPatches: [{ nodeId, data: { clipTimelineData } }], // 仅实际变化
  deleteEdgeIds,
  expectedDocument, // 最新只读文档，供 CAS 预检
  owner: { storeInstanceId, projectId, projectGeneration },
  signal, // 与本次 requestLocks／releaseLocks 相同，不保存进文档
  beforeApply,
}
```

授权、最新草稿投影、同步 CAS、原子持久化和图历史归 Root GraphActions／port writer。controller 不调用 beforeApply、不自建 snapshot；只有 writer 的预检接受后可调用它，再完成一个接受阶段的图提交。时间轴 patch 应先于普通 ig；不得改用 raw deleteEdges 的 iu／ih 副作用。commit false／throw、取消或 owner 退休不能消费草稿、写图或增加历史。

## 前端状态与来源边界

busy 文案为“智能剪辑进行中，暂时无法断开素材连线”；denied／timeout 保留相关节点选择并提示“部分节点正在被其他成员编辑，已保留选中”。http_failed 使用原同步失败反馈；aborted 不独立 toast。result 的 deletedEdgeIds／acceptedTargetIds 仅包含实际同步接受的目标；剩余目标和连线保留。pending 不是禁止用户继续编辑的全局锁。

本机增加了明确 ready、fresh port mode、operation epoch／AbortController、按 operation signal 隔离授权／提交／释放、强制 3000ms deadline、同步 adapter throw 防护及逐项 release 异常隔离。这些是维护性加强，原 callback 没有同样的卸载取消和异常保证。原锁语义与真实团队持有人、云同步、生成／合成／上传服务仍未验收。本地端口只验证前端流程，不伪造团队成员或原账号。

专项使用 literal 时间轴 gold 与可注入、真正修改当前图的本地测试端口，没有用生产 planner 计算 expected。controller 的端口测试不冒充实际 App 存储／undo／redo；Root 对 latest drafts／history／持久化的接线须另做真实 App 回归。首次自查保留两项失败日志 `artifacts/canvas-clip-disconnect-capability-before-tests.log`：未显式 ready 与等待中 mode 变 unavailable 曾错误接受，之后加强门控，原强断言保留。仅本目录定向测试／格式／lint，不代替完整工程 check、native 时间轴验收或发布。
