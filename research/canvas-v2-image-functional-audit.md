# ScriptV2 分镜图配置与节点交接验收（2026-10-12）

继续用户“节点交互不流程自然”的本机优化。画布脚本浮动工具栏和全屏脚本合成提示词阶段均已接独立图片配置，替换 v2 旧 ScriptGroupDialog adapter。选镜、详情、模型与参数操作留在一个窗口；成功创建后保留父脚本编辑器、当前选择和视口。没有运行原站脚本、调用原站写入服务、读取账号或重新采集作品内容。本批未部署线上，独立影游发布及冻结记录保持独立。

## 直接源码与分层

依据归档 `research/source/3u6hjewm8qox_.js` 的 r3（1177842）、r2（1177629）、rI（1141126）、rG（1144748）、tQ（1381512）、sC（1327988），并核对 shared selectors、Modal defaults、store addNode placement 和普通组 mount layout。直接证据分别见 [配置纯规则](./canvas-v2-image-config-model-source-audit.md)、[图片建图](./canvas-v2-image-graph-source-audit.md) 与 [源 UI](./canvas-v2-image-configuration-ui-source-audit.md)。证据来自已有公开归档，不把源 bundle 当生产组件运行。

`v2-image-config-model` 负责 raw index 选择、参考数候选、默认值、typed enum 和确认 payload；`v2-image-graph-model` 负责图片引用、prompt、空节点、边及组几何，均无 React/I/O。`useScriptV2ImageConfiguration` 管理当前文档/脚本 owner、模型加载、表单、strict boolean raw CAS、同步保存和重试。`ScriptV2ImageConfiguration` 只持视图及 dialog-stack；`V2GenerationSelector` 抽取已有视频选择器的菜单、定位及 ratio 图标，视频字段规则留在原视频模型，不套用图片规则。

`public/data/image-model-support.json` 为既有 config-182 的全局 image20 项只读目录（约9 KB），由独立 useContent 加载。它区别于 models 的全部34 schemas 和 script 专用图片候选，不用任意子集猜模型支持。目录登记到代表性部署打包脚本，但本批未运行部署打包或发布。

## 选镜、参数和窗口

每次新开窗口选择全部 raw rows 的 index，详情折叠，配置按 source 两阶段默认模型初始化；重复 open 保留当前请求和修改。表格选择、UUID 和显示排序不代替此 Set。打开期间 rows 变化保留源 index 语义，不 prune 或自动追加新行；全选计数和确认显示 Set.size，payload 按当前 raw rows 升序过滤，保持原镜号。行 DOM key 沿 source hiddenUuid??index，重排时保留原镜头焦点，不让 index key 复用位置后悄悄把焦点交给另一镜头。缺 hiddenUuid 行仍可参与，真正构图安全规则由 planner 负责。

模型候选按所选镜头的最大参考数过滤 image2image typed bounds，而非引用总和。模型切换重置其默认 settings，保留选择/展开。r2 defaults 使用 schema key；r3 chips 仅取 config.settings 数组的全部字段，包括单选项和空 enum，不增加通用高级区、时长、费用或执行按钮。object enum 值保持原 number/boolean，primitive numeric enum 沿 source 转字符串，strict comparison 不把 `1` 和 `'1'` 合并。确认门控使用当前模型资格、disable metadata 和当前选中 raw row 的 falsy imageGenerationPrompt；不套视频 spoken/dialogue sanitizer。

窗口沿 source 800px/85vh、圆角12、header X、单个有边框的320px镜头列表、详情展开/收起、14px checkbox、全选 indeterminate、模型/参数 chips 和原两条确认 tooltip。模型菜单/tooltip 留在 dialog 隔离范围，共用 dialog-stack；嵌套 Escape 先关菜单再关窗口并回 opener。遮罩可关闭，点击窗口内部不关闭。portal pointer/click/doubleClick 截断，不误展开或启动 Canvas 拖动。字段 aria 使用 schema 展示名；局部 MantineProvider/Tooltip 不写根节点主题或存储偏好。

真实公开 Nebula 两项 schemas 的 config.settings 是 mode object，r2 可取 defaults，但源 r3 对其直接 .map 会抛错。本机保留默认值、隐藏不支持的 chips 并说明可用默认值或切换模型；不套用视频 mode flattening，也不任意禁用创建。这是明确修复源数据兼容问题，不宣称与源异常逐字一致。

## 建图、保存与自然交接

确认只创建空图片生成器和真实引用边。图片名为“镜头 {raw shotNumber}”，保留 scriptRowHiddenUuid；有参考使用 image2image、无参考沿 config.modeType/text2image。params 完整 clone config，引用携带 nodeId/url、顺序和标签；prompt 来自当前图片 track，不从视频 track 推测。仅给源脚本 patch linkedImageGroupId，不修改 rows、imageGenConfig、settings 或全局偏好。

普通组名为“分镜图 · {script label}”，sourceScriptVersion=v2、groupLayoutMode=vertical、zIndex=-1001。ratio 尺寸沿350到1050规则。创建初始40/60/40与普通组挂载后的36/66/36 grow-only 结果以一次原子图计划表达；没有额外 RAF/history。默认 placement 沿 source store raw box measured→stored→350、50px margin、向下最小轴穿透量、最多30迭代避重叠；显式位置 override 是本机精确定位合同。保留 raw nested position source quirk，不声称完整世界坐标优化或大图性能通过。

工具栏和全屏入口先 flush 原 prompt controller。提交边界重新读取已同步发布的 current raw graph，用 fresh rows 覆盖状态 rows 后重新投影资格/确认 payload，保留 selected/expanded index Set；不能用 React 尚未渲染的旧非空 prompt 放行，也不能偷偷替用户切模型。CAS 使用 canonical raw identity，保存读取同步发布后的图，history 一次提交，undo 只撤销建组而保留关闭前最后提示词输入。

源 tQ 先关闭 r3 再 await sC，且不关闭父编辑器、不选中新组、不 fit。源名字 awaitGroupSaveOrRollback 实际只等同步保存，不主动删除或恢复 link。本机为可审查的原子事务，在确认同步构图后提交一次 CAS；保存成功才关闭本窗口并通知“未提交任务”。若配额或 writer 异常，保留已提交图、当前配置和保存错误，锁住配置，只重试已有图持久化，不再次建组或增加历史。取消/切文档、ready/readonly、选择、父 overlay、busy、pagehide、卸载及旧回调有 owner 门控；没有生成/费用/服务端等待。这些存储/取消语义是本机 adapter，不能称原站协作事务等同。

## 实际工程验证

正式工具均使用官方 bundled Node24.19.0。纯配置77项、纯建图78项和视图18项由分工文件专项检查通过，后续以联合结果为准。控制层与旧入口三文件43项在04:51:23/2.84s通过；实际 NodeCanvas 七项在04:53:50/2.41s通过。实际App还验证父编辑器保留/回焦点、原镜号10/30、源 vertical 几何、真实 refs、空 URL、link-only、一次 undo/redo、视口/选择保留、立即关闭的 rich image prompt、Quota保存重试、目录失败/重试和 portal事件隔离。

联合12文件302项04:54:25/5.84s全部通过，日志 `artifacts/canvas-v2-image-final-joint-tests.log`；含旧视频共享选择器、v2视频 owner、真实视频入口、四动作工具栏和脚本回归，交叉集合不能重复相加。补 schema aria 展示名后完整check通过300文件/3734测试，04:58:54/79.45s，格式/零警告lint/边界/核心strict及构建10.06s通过，日志保存为 `artifacts/canvas-v2-image-before-row-key-check.log`，只代表补行key前快照。随后 source peer 复核 JSX runtime 第三参，指出 local index key 的重排焦点差异；已改 hiddenUuid??index 并补保DOM/focus且raw选择/详情按index的回归。视图19项+实际App七项共2文件26项05:00:50/2.38s通过，日志 `artifacts/canvas-v2-image-row-key-tests.log`。最终Node24.19.0完整 `npm run check` exit0：300文件/3735测试全部通过，05:02:02开始/77.32s；格式、零警告lint/架构边界、核心strict TypeScript和生产构建9.42s通过，日志 `artifacts/canvas-v2-image-final-check.log`。统计包含同工作区独立影游扩展，strict不覆盖全部JSX，CI未远端执行。随后仅维护文档并定向格式检查，无新生产修改，不以构建成功当全站功能验收。

初次控制/App三文件43项中2失败（`canvas-v2-image-controller-initial-tests.log`）：测试误把 source structured imageList 当 URL 字符串，另一个 harness 每次 getDocument 都创建新节点数组，被正确 raw CAS 拒绝。迁移结构化引用和稳定 published graph 后保原失败配置/忙态/防写/保存强断言。新增App七项初次3失败（`canvas-v2-image-integration-initial.log`）：旧预期 redo title、图片 aria label 和异步 parent close 时序不匹配；改用实际 UI 名称和 waitFor，保建图、历史、父 dialog、回焦点和末次输入断言，没有删测试或降低门控。只读 peer review 另指出 freshContext.rows 未替换 state.rows，已修并加入同步发布最新 prompt/清空 prompt 回归；不是 source proof 或原生浏览器结果。

## 原生验收与剩余边界

本批重新开独立 React 计数页45，原生 AX button click 后仍“原生点击计数0”、焦点 AXWebArea，已关闭临时页，保留用户 Vite5173服务。当前原生输入通道未实际到达页面，因此本批桌面/窄屏窗口操作、键盘默认激活、像素布局和手感尚未验收，无新版截图。组件 jsdom 及 mock390几何只能证明对应工程行为，不替代 native 或真实手机/Safari。

共享 Selector 的 disabled reason 当前为 native title，源为专属右侧 Tooltip；公开 image20 当前无 disable 项，仍记录为分支视觉差距。源码包含关闭后 fade-down200ms，本机仅提供进入动画；退出渐隐、完整 source 脚本卡片/任务 renderer、toolbox/角色工具栏和完整 run/stop、真实生成/审核/费用/协作/运营写服务、大图性能继续未完成。显式 reference/mark/focus target 已接入本地 mode owner 与 Canvas 交互，见 [显式 target 专项](../artifacts/canvas-explicit-target-verification.json)。触摸/Safari按当前用户范围不计入完成度；无需登录注册或小号，当前整体复刻目标仍未完成。
