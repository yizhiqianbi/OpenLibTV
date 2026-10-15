# 图片聚焦：本机功能验收（2026-10-12）

用户要求节点操作更流畅自然。本批接入原站 IMAGE 聚焦编辑流程，并修复模式、指针、视口、草稿与保存之间的交接。仅修改本机前端，没有部署、登录、小号、原站写入或真实生成。线上仍为独立影游冻结产物，完整复刻目标未完成。

## 来源与实施范围

来源为已归档公开客户端，见 [媒体模式源码](./canvas-media-focus-mark-source-audit.md)、[入口接线源码](./canvas-focus-entry-integration-source-audit.md) 和 [所有权复核](./canvas-focus-owner-review.md)。原脚本只作静态证据，不运行遥测或生产写逻辑。default lib-image-2.5-s 不支持聚焦；当前真实目录支持 nebula-ultra、nebula-2-flash、nebula-2.1。入口复用实际 schema resolver，不另建模型白名单。

- 有资格的 IMAGE 生成器显示聚焦 chip；已保存区域显示实际自然尺寸裁剪的卡片，可编辑或删除。available=false 隐藏附件而不删除参数；configLocked 门控 controller 的 enter/fresh/confirm，renderer 禁用编辑/删除；canTarget 保持能力可见，不能泛称全部底层 API 禁写。原中文教程仅 hover 后使用原 remote-only URL，未重新下载；本批未验实际远端播放。
- 明确接收生成器 target，模式期间其输入锚点保留，不依赖普通 sole selection。普通上传资源不会误获聚焦入口，除非已有明确 showGenerator。原通用资源 GeneratorFactory 仍比源宽，完整资源工具栏与下游 image2image 契约未核实前不擅自移除旧入口。
- source 是其他有实际内容的 IMAGE；self、pending/blob、无内容与源 storyboard child 规则拒绝。已读取本机 data URL 仅凭 localMediaReady 允许，不代表服务器上传成功。standalone image parent 精确门控与 ordinary/script-linked group 不同；不能猜节点 publishProtection 字段充当全局发布保护。
- 顶条、源内容 overlay、八个缩放柄与比例确认条分离。由实测内容 rect 归一坐标，画布缩放不改变屏幕按钮尺寸；返回 target 使用当前 zoom 和 400ms 视口移动。视口 transform transition 内持续跟随，结束/取消及 owner 卸载清理 RAF/observer。
- 七种比例只缩小区域并保左上位置；draw 严格大于 .02，resize 沿原最后 min 顺序。源可达端点可稍越 1，后续编辑/确认接受有限起点0..1、正尺寸、端点最多1.02+ε，不追加非源 clamp。几何保持纯模型，旧39项未弱化。
- confirm 投影最新尚未150ms提交的草稿，原子写 focusRegion / originImage / camera_focus 和原 ratio key；保留 model、prompt、mode、count、其他 settings 与 advancedSettings。已有 source→target 边复用，否则只加一边；一次 CAS/history。删除清三字段并仅删首条对应边，模型降级按相同事务处理，不用陈旧 prompt 覆盖末次输入。
- 保存失败保已提交图、区域、错误和重试入口；retry 只刷当前图，不再次提交 history/edge。确认只在 flush 成功后自动退出并回 target；Quota 后仍允许手动返回/退出或两次 Escape，保留已接受图，由文档顶部重试继续保存。复制、导出、历史与刷新走现有文档协议；mode/pending/capture 本身不持久化。
- controller 绑定 document owner 与每次 mode object；同 ID 新文档、A→B→A、第二 pointer、旧 API、ready/readonly/schema/configLocked/URL 变化及卸载拒迟到更新。blur/hidden/pointercancel 仅取消在途 pointer 并恢复前一个 pending，不退休整个 mode 或已完成 pending。普通拖动/连接/参考选择与 focus 互斥。共享菜单/dialog 优先 Escape，之后第一次清 pending，第二次退出；不另建焦点栈或滚动锁。
- camera_focus 的 shared validation 按 source 使用 originImage 作 hasImage，并允许无额外 prompt。真实红框 File、token、pre-sign、费用与生成服务仍未接；提交明确提示“生成服务未连接，提示词已保留。”，不造任务或结果。

## 原生浏览器证据

使用现有 Codex in-app Tab2、本机独立 canvas-focus-native-20261012 项目和真实菜单、file chooser、pointer drag、按钮与 Escape。没有通过 storage 注入或合成 DOM 事件冒充 native 操作。上传的是已有公开样本 b8d35ea43ec7260a.png（1280×720）；导出由真实 GUI 触发并从下载文件读取，数据 URL 只存证据文件，不打印其内容。

1280×720：创建空图片生成器、default 不显示聚焦、切全能图片模型V2后显示；对源实际348×228内容从335/330拖至515/470，选1:1得到140×140区域并确认。原生导出确认两节点、唯一 source→target 边、nebula-ultra、空 prompt、camera_focus、2K/1:1及完整源 URL 一致。冷刷新恢复卡片，实际 crop preview ready；空描述生成准确服务阻断。

冻结后再次编辑已保存区域，以实际 pointer 移动40/30屏幕像素并选3:2，得到140×93.328125显示区域。一次确认→一次 Undo 恢复1:1→一次 Redo 恢复3:2，均只有一边。原生删除后卡片/边消失，Undo 恢复；切不支持模型后卡片/chip/边消失，Undo 恢复正确模型及区域。历史 HMR 后误用旧 AX 索引点到 Agent 的一次动作不算撤销证据；本段撤销全部来自重新取得当时 AX 的冻结操作。

390×844：fit 后51%，source实际178.2561×116.7885。移动区域后原确认条 left=-79.515625，前两个比例按钮完全不可见；这是原生实测失败，截图和 JSON 保留。修复后实际372.296875px宽确认条 left=8、right=380.296875，全部九按钮可达。原生点16:9、Escape第一次清pending、第二次退出，已保存3:2和唯一边保持。<=600px测真实 bar width 并 clamp 中心，ResizeObserver同时观察 surface/bar；>600px保源内容中心。该适配不称原站手机像素一致，viewport 已 reset。

最终 GUI 导出 region 为 relX=0.22701149425287356、relY=0.2807017543859649、width=0.40229885057471265、height=0.40935672514619886，settings 2K/3:2；originImage 和 region.imageUrl 均与 source.data.url[0] 完全相同。两节点/一边、node ID 与源图均保留。初次1:1与最终3:2导出分别保存，不用一个文件冒充两次快照。

证据：artifacts/canvas-focus-native-export.json、canvas-focus-native-final-export.json、canvas-focus-native-region-proof.png、canvas-focus-native-narrow-before-fix.json/.png、canvas-focus-native-narrow-proof.png。最终统一证据见 artifacts/canvas-focus-browser-proof.json，JS按需入口冻结后冷加载实际编辑/拖动/确认条挂载通过；最终mobile CSS在reload后3秒HMR，以下布局探测均在该CSS之后。390提示条实测left35/right355、width320、title/subtitle各18px一行，返回与X均在蓝bar内；320提示条left12/right308、width296、title18px一行/副标题36px两行，确认条left8/right312、width304、两行62px，全部按钮可达。原生320点击16:9后逐层Escape仍保3:2/唯一边，viewport已reset。冷加载起10:23:10.469Z至最终查询未新增warn/error；不称全部历史console为空。冷加载后AX/semantic close-Agent两次未生效，经实际bbox坐标native点击恢复；没有换控制技术或注入DOM状态。

## 修复与测试边界

独立 controller review 首轮28项中13失败，发现 fresh boolean false 后访问、旧 mode 指针 API 操作新 mode，以及模型降级覆盖末次 prompt 三个真实问题，已修并保留失败日志。两处浮点精确断言改12位 close，同时保持真实 pending→commit 字段与 graph/history 强断言。锁模板的初始 fixture 缺合法 scene/models，补齐完整模板后33+39项通过；fixture失败不冒充生产 bug。

源最小尺寸链初始 ratio→move→SE 后端点1.001569…，旧 validRegion 拒绝后续 move/ratio/confirm；13项闭包与第34项真实 pointer controller 回归验证新边界。源 transform transition 跟随新增4项修前全失败、修后通过。窄屏新增三项覆盖左/右8px clamp、600/601断点、bar width/owner/unmount变化。中间 fixture语法失败保留，不当窄屏真实故障的替代证据。

actual App/router/真实 lazy generator/controller/storage/history 共13项，覆盖末次草稿/全七比例、一次历史/恢复、取消、删除、模型降级、服务阻断、入口缺资格及精确 parent gate。controller34+minimum13+旧pure39三文件86项；附件14项；三视图和实际App最终联合46项；生成契约5项与已有resolver/schema/Frame/Inline联合47项。各集合重叠，不重复相加。JSDOM 的 rect、capture、FileReader 与 content fixture 是明确测试适配，不证明原生 pen/touch/修饰拖动。

17:43:55完整335/4465属于 minimum/transition修复前快照；17:56:55完整336/4483属于窄屏修复前快照，分别保留 canvas-focus-before-minimum-review-check.log / canvas-focus-before-narrow-check.log。窄屏 build 成功但 CanvasPage900.02kB略超既有900kB提示，日志canvas-focus-narrow-build.log；不能说零构建警告，后续真正按需分包另验。最后新增真实按需入口 FocusConfirmEntry，mode entry预加载、region后显示、opaque owner迟到隔离和加载失败保pending/retry/cancel；11项18:22:30/1.14s通过，包含default loader真实ConfirmBar。ModeBar局部mobile修复及actualApp/三view四文件46项18:23:40/4.29s通过。上述冻结后最终完整检查：Node24.19.0、337文件/4500测试全部通过，tests18:24:50/261.59s，格式、零警告lint/架构边界、核心strict及构建15.34s成功、exit0，日志artifacts/canvas-focus-final-check.log。真实独立Confirm工具4671bytes/gzip2136；CanvasPage898775bytes/gzip296239/SHA3c7514ea315702a7fda5de59438942397b164742f183e308da3fff6df2feb80b，CSS191954/gzip32868，低于既有900000阈值；证据artifacts/canvas-focus-build-proof.json。没有抬阈值/manualChunks、重新全采或发布。最终check后仅维护文档/证据及定向格式检查，不改生产源码。

## 未完成范围

Mark/capture完整模式、真实识别与生成/上传/费用/授权/协作写服务未接；全局发布保护没有真实 project adapter，专属 enhance renderer 的完整源代码范围仍缺。普通模式 effect 调用顺序、完整资源 toolbar/downstream规则、远端中文教程播放另验。原生 sustained Space/Alt、pen竞争、高频大图、真实 touch/手机UA/native fullscreen/Safari未验；受控 PointerEvent 不当真机。核心 strict 不覆盖全部 JSX，CI未远端执行，全量统计含独立影游扩展。本机检查不替代生产冻结部署，也不宣称完美复刻或整个目标完成。
