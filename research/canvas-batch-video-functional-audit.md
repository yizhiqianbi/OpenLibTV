# v1 分镜图片组批量视频配置与交接验收

2026-10-12。继续用户“节点交互不够流畅自然”的反馈，接入 General 图片组下方的 v1 配置浮条与空视频建图。当前默认本地工作区，无需登录、注册、小号或原站账号；没有请求原站费用、审核、生成、支付或写服务，没有部署。整个功能复刻目标仍未完成。

## 证据与入口

静态源码范围见 [配置调用链](./canvas-batch-video-configuration-source-audit.md)、[纯配置协议](./canvas-batch-video-config-model-audit.md) 与 [空视频建图](./canvas-batch-video-graph-source-audit.md)。使用已归档公开客户端，不执行原 bundle。专用19条模型元数据从 `research/source/api/config-182.json` 的 `data.linkUrl`（JSON字符串）解析后的 `storyboardVideo` 提取至 `public/data/storyboard-video-support.json`；已逐项核对，没有额外全量采集。

实际 caller 只在带脚本、非 v2、非 video、非 standalone 图片宫格的 General 操作条提供“批量生成视频”；standalone 判断使用 truthy 标记与 image subtype。当前图片组、脚本 link 与可用镜头始终从实际图重读。v1 是模型、普通参数、batch 高级参数、全部 ready 镜头数、费用和提交；不含 v2 的选镜、逐镜时长或逐镜 prompt 编辑。

## 维护结构与交互

- `storyboard/batch-video-config-model`：ready shots、默认模型与模式、初始资料、比例 refill、切模型、高级字段正规化与单份费用请求。纯规则无 React、I/O 或全图序列化。
- `storyboard/batch-video-graph-model`：源 rows 顺序、实际 URL[0]、提示词及资产引用、容量、尺寸、相邻位置、审核 gate、空视频节点/边/脚本 patch。结果永远 `submitted:false`。
- `domain/batch-video-viewport-model`：开启时100/120/32px空间、测量框与 fallback、1.2最大 zoom；嵌套世界坐标是本机适配。
- `hooks/useCanvasBatchVideo`：表单、目录独立加载/失败/重试、费用 debounce、审核请求 owner、取消、Graph CAS、同步保存和延迟定位。
- `components/CanvasBatchVideoConfiguration`：body portal 非 modal 浮条；共用 `GeneratorModelMenu` 与 `GeneratorSettings`。高级设置在同一参数弹出层内展开，仅高级字段按 batch 过滤；不注入 count、不显示 promptMention 开关。
- `services/storyboard-video-source.ts`：可注入费用与审核只读服务契约。默认没有这些服务，不安装原站客户端或生成 writer。

开启后首图 settings 只初始化一次，本地编辑不写回图、script 或用户默认；关闭再打开取最新首图资料。首图内容尺寸晚到时只 refill 缺失比例，保留已编辑配置。同组重复开启保持同一表单和第一次原视口，防 close/open 把聚焦视口误当原视口。模型菜单按专用目录顺序，未加载 schema 的候选不可选择；VIP 元数据不代表本地 actor 的授权。

首次聚焦关闭按钮；菜单的 document capture Escape 先回对应触发器，再一次 Escape 从浮条 bubble 关闭并回分组按钮。外部 pointer/focus 关闭菜单不抢新焦点。不锁 body、不建立独立 modal 栈。源 effectiveZoom=max(z,.5)、scale=min(1/effectiveZoom,2) 与组下10/effectiveZoom世界间距保留；390px clamp/横滚是本机适配。

费用请求300ms debounce，单份 count=1 / prompt='' / model / mode / settings，仅 display 乘全部 ready 数量；不发送 advanced、镜头主图或 totalCount。缺服务显示“-”，不捏造0、积分或会员优惠；加载/错误清旧费用及 AbortSignal 取消是本机适配，源保持旧值的异常分支未冒充相同。两个内容 reload 的 rejection 由 allSettled 消费，源 cache 的错误仍可显示和重试。

## 提交、保存与生命周期

提交先关闭其他手势，规划完整空视频组和实际引用边。只有强 boolean CAS 成功才计一次历史，同次合入有效150ms prompt 草稿；再读取已同步发布的 currentDocument 调用 `flushGraph`。没有自动执行生成，动作明确“创建视频组”，成功通知明确本机保存且未提交任务。

Quota 失败保留已建图、配置及错误，锁定模型/参数，提供“重试保存”；只重试保存，不再建组、不增加第二次历史。模型服务之后失败或 ready 原图被清空不能禁用已经提交组的保存重试；只读、失去 ready 或当前 owner 无效仍门控。用户关闭后现有 autosave pending 继续按既有规则保存，不假称回滚。

审核仅 strict portrait=true 模型进入。真实 certificate/免审与60天时效、已有过期证书且 autoCompliance 关闭的 gate 按源维护；没有服务/有效证书则阻断整图并保留可编辑表单。审核 reader 的结构化结果须匹配 child ID / 当前 URL[0]，随后重新规划。缺证拒绝整图与显式注入服务，是本机比源某些部分组分支更严格的适配，不能当原站审核已经完成。

每次建图与审核请求绑定文档、表单 owner、source/support/models 与原始 nodes/edges/models 引用；关闭、切文档、失 ready、只读、modal/选择接管、卸载、pagehide 和目录重试错误取消请求。忽略迟到结果，不覆盖期间新编辑。费用请求只检查 AbortSignal/owner/当前文档，允许 ready 数量变化仅重新 scale display。源 incarnation token 在 submit 时捕获；源同 ID 整对象 setNodes 不 bump，本机 raw graph CAS 对已开始异步请求更严格，不使用任意 timestamp 或对象变更假定新生命周期。

保存成功关闭并300ms恢复原视口；100ms后仅在当前文档、原选择和新组实际对象仍有效时选择新组，再按源 padding .15 / 400ms fit。其间用户更换选择或开始 board pointer 手势取消迟到 fit，避免覆盖新操作。该用户接管保护是本机适配。

## 工程回归与中间记录

九文件220项联合回归03:13:08 / 5.91s通过，日志 `artifacts/canvas-batch-video-final-joint-tests.log`：配置67、建图72、UI19、共享 GeneratorSettings12、视口5、controller28、实际 NodeCanvas5、既有组操作5与 resize7。这些集合互有交叉，不与其他检查相加。

实际 NodeCanvas 使用代表性 schema/support 与本机持久化，核对入口/两层 Escape/焦点、创建2个空视频及3条边、script link、原图保留、一次 undo/redo、卸载刷新恢复、Quota 保留和保存重试、独立目录加载错误及无效组入口。Controller 包含同组重复 open、实时比例、精确费用、旧结果取消、异步并发图、source/缓存错误接管、pagehide、保存后新选择/手势不被100ms fit夺走。JSDOM 无真实布局或 GPU，不能把这些测试称为原生操作通过。

首次实际接线测试03:07:28两项失败，分别是fixture误期望 schema 中文名（实际 source support alias 为 Kling O3），以及新组节点数断言漏计 video group；按准确代表样本契约改为源 alias/7节点，保留建图、边、原图、历史和注入安全等强断言。改 allSettled 后03:07:55一项旧同步 retry 断言在微任务前执行，改为等待真实调用。日志分别为 `canvas-batch-video-integration-initial.log` / `canvas-batch-video-integration-followup.log`，没有删除原断言、提高 timeout/maxWorkers或关闭 lint。根 lifecycle 修正后两文件33项03:10:27 / 2.51s通过，日志 `canvas-batch-video-controller-final.log`。

最后完整 `npm run check` **exit0**：286文件/3261测试全部通过，03:18:26开始、85.64s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建10.07s通过。日志 `artifacts/canvas-batch-video-final-check.log`。随后仅维护文档与独立格式检查，无新生产修改；核心 strict 不代表全部 JSX 类型覆盖，CI未远端执行，统计包含独立影游扩展，不能当原站功能数。本机Node25.2.1符合现有engines，.nvmrc继续24。

## 浏览器阻断与剩余差距

本批创建独立42 QA页 `artifacts/canvas-batch-video-qa.html` / `.jsx`。普通 React 计数按钮在1280×720正常显示，无 console error；AX原生 click、documented semantic locator click以及显示浏览器后同一按钮坐标 click 均返回后计数仍0、焦点仍 AXWebArea。当前 selected tab 确为42；先读取 troubleshooting 文档，不改浏览器内部或绕过到其它控制技术。独立计数复现把阻断范围限定到输入通道，未据此修改 Canvas 产品代码。

**本批桌面与窄屏原生配置、创建、回焦点均未完成验收，也没有新版截图。** 未将静态树、组件 tests、无日志或源样式数值当作真实交互通过。上一批 resize 的390px实操缺口继续保留。42临时页已关闭，visibility恢复false，5198截图服务退出130且无listener，用户 Vite5173/pid98953保留；没有清用户 origin、覆盖真实项目或修改原站账号。

模型目录图片/原触发器VIP视觉目前仍沿既有 Sparkles 复用，专用目录名字和描述已接，不能称原缩略图/VIP逐像素一致。原用户权益变更驱动的费用重新计算、服务器保存8秒等待/多人状态、真实费用/审核/生成/任务stop、完整 v2 配置、toolbox/character 工具栏、特殊 renderer、物理手机/Safari与大图性能仍需另验。该批只更新本机主工作区，线上版本和独立影游发布记录不受此结论替代。
