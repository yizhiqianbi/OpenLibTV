# 节点点击、拖动末位与松手边界验收

2026-10-12。本批继续改善用户提出的节点交互手感，只修改共享 Pointer 结束门控、修正一个旧拖动 fixture 并新增独立回归；不部署、不访问原站账号、不改图文档协议。

## 实际问题与修复

此前节点按下后没有发生任何 pointermove，松手坐标稍有偏差，也会由 `end` 首次启动拖动、历史记录和 Alt 复制。修复前独立回归用 Down(400,300)、无 Move、Up(410,310)，zoom0.5，复现节点从(50,50)跳到(70,70)。该问题会使一次普通点击变成拖动。

`features/editor/useGraphPointer.js` 现在只在 node 手势已经 `moving` 时接受 pointerup 的末位投影；普通平移、框选、连线协议保留。已经越过本机4屏幕像素阈值的拖动仍使用最终落点，分组相对坐标、原选择、一次历史和结束 click 抑制保持。Canvas 和影游共用该 hook；默认策略的回归不能等同于真实影游 UI/持久化验收，也不能泛称所有 pointerup 都不能写图。

原站普通 XYDrag 在 move 越阈后起拖，end 的 `!c` 分支直接返回。虚拟多选框 iF 在 pointerdown 调 start/copy，end 仅 flush 已有位移，不读取 pointerup 坐标。两者都不能由 release 坐标单独产生新位移，但 start 时机不同。本机既有4px阈值、延后复制和已开始拖动的最后 up 投影是明确适配，不能称原站虚拟框同样 move-start。完整偏移、源码 SHA 和区别见 [直接源码复核](./canvas-pointer-release-source-review.md)。

## 工程回归与保留的失败

- 修复前独立2项中1项失败，21:10:49/713ms，`canvas-pointer-release-start-review-tests.log`；已起拖末位正向项通过，不能将首轮记为成功。
- Root 初次3文件156项中1失败/155通过，21:22:28/1.31s，`canvas-pointer-release-start-root-tests.log`。旧 caller drag IDs fixture 仅 down→up，原目标是 ID 过滤、parent 相对位置和 operation selection。只补实际 move，原位置、选择和 history 强断言不变；不恢复错误 producer。
- 正式联合8文件210项全过，21:26:20/10.23s，`canvas-release-node-joint-initial-tests.log`。独立 Canvas/default shared 策略14项全过，21:26:41/507ms，`canvas-pointer-release-final-review-tests.log`。
- 新实际 NodeCanvas 4项全过，21:33:27/2.13s，`canvas-release-start-actual-integration-tests.log`。无 Move、阈内 Move→大 Up、Alt 三分支均验证完整 graph、原始存储字节、目标 key 零 setItem、撤销/重做禁用，并验证之后正常 detail1 点击；真正拖动验证最后落点与各一次 undo/redo。它们是受控实际 App 回归，没有合成事件冒充原生输入。

首轮完整 `npm run check` exit0，360文件/4803测试，21:36:08/127.50s，构建11.30s，`canvas-release-start-final-check.log`。初始1100源/配置/测试 snapshot 中 Studio CSS 在检查期间变更，1099匹配，不能将首轮称1100冻结检查。已保留该结果并按当前源码重新冻结。

最终官方 Node24.19.0 `npm run check` exit0：**360文件/4803测试全部通过**，21:42:56/122.72s，format、零警告 lint/架构边界、核心 strict 与生产构建11.06s通过，`canvas-release-start-current-check.log`。源码包含同期 Studio 工作及独立影游扩展，不能将全检统计归因于本批18项新回归；strict不覆盖全部 JSX、CI未远端执行、DEP0129依赖提示保留。当前1100 SHA、真实动态入口、CSS级联与实际最终字节见 [构建证据](../artifacts/canvas-release-start-build-proof.json)。

## 原生浏览器证据

独立后台 tab3，实际1280×720、Agent打开时 board890×670；未导航或操作用户的 tab2 3D 编辑器。采用页面已有公开 PNG 与本机两节点、一条边。每一步通过真实 GUI 的“导出→画布文件”下载，不注入 graph/store 或临时测试页面。

1. 当前基线导出后，原生单击标题(235,229)选中；nodes/edges 严格不变，撤销与重做仍禁用。
2. 原生拖动标题(235,229)→(295,269)，节点世界坐标变化(73.40633669450163,48.93755779633443)，与屏幕(60,40)/zoom0.8173681279002469相符。仅该节点 position 改变，其余节点、所有 data/尺寸/资源和 edges 不变，view 不变。
3. 一次 GUI 撤销恢复完整基线 graph，撤销禁用、重做可用；一次重做严格恢复完整拖动后 graph，重做禁用。五份真实导出逐项比对均通过；该 tab 的 warn/error 为空。

本次原生基线是实际打开时的当前图，不冒称与上一批综合 Mark 操作前后的坐标一致。前轮没有逐手势导出，无法把旧综合坐标差异确定归因于本次缺陷。当前 native 验证正常 click/已开始 drag/undo/redo；没有合成原生 up-only 异常坐标，其精确边界由上述 hook/实际 App 回归覆盖。本批没有新增390/320、持续 Alt/Space、touch/pen/Safari 或大图手感通过。

五份导出、尺寸、动作和强比较见 [浏览器证据](../artifacts/canvas-release-start-browser-proof.json)；最终画面为 [原生截图](../artifacts/canvas-release-start-native-proof.png)。

## 画布抓取的证据修正

此次两路独立源码调研确认 `canvasCapture` 是点前图、将 `originalUrl?.[0] ?? url?.[0]` 交 callback 的短暂模式；没有任意区域截图、region/crop/确认条或新节点生成证据。VIDEO 主体库 callback 指向原站第三资产 create/list 服务；但组件 t4 对 `onCanvasCapture` 的 binding 没有引用，可见入口未证实。不能凭 locale“退出截图模式”或一个未消费 callback 创造按钮，也不把 dormant 分支记为已完成截图功能。

函数 callback 和模式互斥/reset、Escape/CSS 已核；通用源码 JSON 导出可能携带 active boolean，导入实际仅读 nodes/edges/view，不能泛称任何源导出从不含 mode。原服务资产、真实入口和所有权细节见 [视图/可达性审计](./canvas-capture-view-source-audit.md) 与 [模型/服务审计](./canvas-capture-model-source-audit.md)。区域裁剪、全景、视频帧、视口截图属于各自协议，应按真实入口分别调研。

本机改动未发布，独立影游冻结生产保持原记录。无需登录/小号；真实识别、生成、上传、费用、权限、协作与运营写服务继续未接，完整特殊 renderer、真机/Safari 和大图仍有差距，整个复刻目标未完成。
