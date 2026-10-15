# Canvas 逐帧拉片节点功能审计

2026-10-15。本批依据 `research/source/3u6hjewm8qox_.js` 中 `ShotBreakdownNode` 的实际 JSX 与中文文案，将原先落到通用生成器占位的 `shot-breakdown` 节点接入 PenStudio。本地实现不调用原站、不读取登录态，也不假冒拉片任务成功。

## 已接入

- 节点显示专属“逐帧拉片”卡片、`SD 2.5` 标识、视频素材区和“上传视频后开始”空态；上传会创建真实本地 VIDEO 源节点并按 CAS 替换入边，不把 process-local blob 直接写入 shot 文档。
- 维度纯规则固定为 source 的 `storyboard`、`cameraMoves`、`musicRef`，`data.dimensions` 使用 nullish 默认，显式空数组保持空；真实任务 prompt 映射为“拉片一下这个视频。拆解维度：…”。
- 真实 reference-pick 分派已接入：未连接、`data.type === video`、首 URL 为非空字符串且不是 `blob:` 的视频才可选；点击后删除目标全部既有入边、添加一条 source→shot-breakdown 边并在成功 CAS/flush 后退出。ShotBreakdown 不进入 ScriptV2 的 box/group 选择或断开协议。
- source projection 复用 incoming collector，只读取第一项视频及其真实 `width`／`height`／`durationSec`；第一项 URL 为空时不提升后续视频。

## 验证与边界

`shot-breakdown-model.test.js` 与 `useCanvasReferencePick.test.jsx` 共 24 项专项测试通过；视图卡片另有 2 项测试，Canvas 上传/替换事务另由 NodeActions 回归覆盖。ESLint 零警告、Prettier 通过。视图上传／媒体预览仍由 Canvas host 接线，原站上传会创建独立 VIDEO 节点、探测自然尺寸、接边并异步上传；当前本地用 data URL 的已读文件作为明确 localMediaReady 夹具，任务提交会构造 `agent_name="libtv_video_pack_agent"` 的 video request，但未接真实上传、任务轮询、取消、失败重试、会员门控和拉片结果回写。不能把本地 adapter 当作云端成功。

## Source 位置

- `3u6hjewm8qox_.js`：`sD`／`sz`／`sB`／`sH`（维度和任务按钮）、`sW`（素材预览和菜单）、`sK`（renderer、上传、任务）；归档 SHA `c51798d2551086ee096babac1825bd489e9f63c4a5908afc4f437c76a16d6af6`。
- `3zez5ighjd7k4.js` module `450681`：ShotBreakdown 候选集合，排除自身、已连接、blob 视频。
- `21_0xvlvkw1sz.js`：ShotBreakdown pick commit 删除目标全部入边后添加新边。
