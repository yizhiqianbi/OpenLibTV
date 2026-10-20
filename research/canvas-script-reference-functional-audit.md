# ScriptV2 参考添加与节点交互验收

本文为此前参考入口/按需加载批次的冻结记录；随后框选、返回zoom、pointer和普通FileList修正及最新检查见 [手势验收](./canvas-reference-gesture-functional-audit.md)，下方324/4320与873.73kB不代表新批次。

2026-10-12。对应用户“节点交互不自然”的持续优化。本批补齐 ScriptV2 新增参考的画布选择、本地读取和个人资产库，并拆出真实按需生成器。仅本机更新，不改变 `dpl_J93mBxkb8QH7cxPYYRAYtNDQuaSg` 冻结生产。

## 实际行为与维护边界

画布参考模式只拾取 source IMAGE，普通 click 不拖动/改选/连线，connected 正文不 toggle；独立“取消选择”删除第一条 direct edge。GROUP 批次与 >5px pane 框选遵循专属规则，pan/zoom 保留。进入不改变原 selection，target generator 按 explicit-target OR 普通 sole-selected 显示；连续 accepted selectionChanges 合并且保次序，pane 单击只追加 target。退出不清选择，返回节点 400ms 后退出。mark / focus / capture 仍不是本批完整实现。

原站上传 input 接受 PNG/JPEG/WebP/GIF、多选，严格 >30MiB 跳过。本机另校验实际 File MIME / size，读取失败保留队列可重试；成功 Data URL 才创建 source 根图片/原 handles 边，并标 localMediaReady/resourceMeta，不冒充原站 blob 上传任务。本机保错误队列 / quota 重试属于适配，无源每种20项或模型容量上限。当前 inline 隐藏不取消已开始的 canvas-owned 读取，切项目、readonly、未ready、target 删除或 full generation 则取消，迟到结果不能接入新文档。打开 native picker 而尚未读取的旧 owner 也在失效时退休。

个人资产库复用共享本机 picker / dialog-stack，按 source serialized items 扫描首合法 IMAGE，而非 generic items[0]。旧本机图片无 assetData 时使用明确 local adapter。媒体类型不符合时禁选，预览不选入；部分成功记住成功 item IDs，重试不重复；失败保选择。完成关窗回输入，嵌套预览按层 Escape 回原控件。原站 detail 服务、团队权限及真实资产写入未接。

所有 graph 修改在最新 raw 图上投影最后150ms draft，再一次 CAS/history 同步发布，随后 flush 实际已发布图。source_images 使用专用脚本任务规则重算；未知 schema 保留原参数。Quota 保当前图和 ID，稳定 Header 只重试保存、不再次创建或记历史。输入草稿 channel / 外部 prompt baseline / 保存 ack 保持上批规则。

生成器入口按实际节点显示资格 dynamic import；loading/error 在局部显示并可重试，不整页刷新。generic readonly 仍可加载展示，ScriptV2 readonly 由 source caller 隐藏。旧 CSS 保 eager 相对顺序，不依靠异步加载级联；pure task / graph 模型不动态搬入 UI，未调高 900kB 阈值。

源码与独立适配见 [pick](./canvas-script-reference-pick-source-audit.md)、[import](./canvas-script-reference-import-source-audit.md)、[view](./canvas-script-reference-pick-view-source-audit.md)、[owner](./canvas-script-reference-owner-review.md)、[实际接线](./canvas-script-reference-integration-source-audit.md) 和 [bundle](./canvas-generator-bundle-audit.md)。

## 原生浏览器证据

该继续轮最初 localhost 连接拒绝，lsof 确认无5173监听后才以 Node24 启动 `npm run dev`（pid31806，日志 `artifacts/canvas-reference-dev-server.log`）。读取失败页时 browser policy 拒绝 data 错误页；未绕过该页或安全设置。正常 HTTP 服务恢复后创建实际应用标签，原生 AX click 已观察到明确状态变化，不沿用早期“native click0”作为当前结论。

独立验收画布 `reference-ui-check-20261012` 通过实际菜单创建 ScriptV2，执行角色 preset，进入参考模式，取消角色1后参考卡只保角色2，再原生选择角色1恢复两张卡并保持 mode / 剧情。Escape 退出且原连接 handles 恢复；适应画布在 mode 内正常改变97% zoom。刷新后两张实际图片、207字剧情和当前顺序恢复，重新选中 ScriptV2 按需出现同内容。当前 tab warn/error 查询返回空；不将此有限日志查询宣称所有页面无错误。

1280×720 截图 [桌面](../artifacts/canvas-script-reference-desktop-proof.png)。390×844 实际 mode 菜单 / 顶条 / mask / generator，读取 DOM 得 `documentWidth=390`、顶条 left17/right373/width356，选区仍只脚本、两张卡；原生退出恢复。截图 [窄屏](../artifacts/canvas-script-reference-narrow-proof.png)。临时 viewport 已 reset。此轮未在原生浏览器验证框选连续高频手势、native file chooser完整上传、touch / Safari / 手机 / 所有懒加载故障；这些与 controller / DOM 测试分开记。

## 工程验证

首次真实 lazy 兼容测试同步读 view 导致12失败，改为等待实际 mount 后原19项全部通过，保全部图/history/Quota/focus断言。首次新 actual App Quota 断言混淆 groups-first DOM 与 source 节点保存顺序，日志 `canvas-script-reference-app-initial-tests.log` 留存；修 fixture 同时核对新 ID、完整 ID set、准确 prepend 原顺序、edge 和一次 undo/redo。首轮完整检查324文件/4318项中仅此1失败、4317通过，没有完成build，不能称完整check成功。2026-10-12 Node24.19.0最终 `npm run check` exit0：**324文件/4320测试全部通过**，tests16:07:31/115.51s，格式、零警告lint/架构边界、核心strict与生产构建20.28s通过，日志 `artifacts/canvas-script-reference-final-check.log`。CanvasPage最终873.73kB/gzip288.54kB，低于既有900kB阈值，未抬阈值或加manualChunks。actualApp与旧compat联合30项16:03:31/5.95s通过。后续增强actual和准确范围见 [覆盖清单](./coverage.md) 与 [验证历史](./verification-history.md)。

strict 仍只覆盖核心 TypeScript，CI未远端执行，测试总数含独立影游扩展。新source正向夹具不代表账号 / 上传 / 生成 / 费用 / 权限 / 协作服务。原站整体复刻、完整工具箱和部分 renderer、大图性能继续未完成；reference/mark/focus 的本地 explicit target 已接入，当前回归见 [显式 target 专项](../artifacts/canvas-explicit-target-verification.json)。触摸/Safari按当前用户范围不计入完成度；无需登录注册或小号。
