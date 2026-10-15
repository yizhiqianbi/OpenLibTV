# 脚本与分镜组断线验收（2026-10-14）

继续用户“节点交互不够流畅自然”的优化。本批接入真实单条边双击的脚本关联确认、解绑和一次可撤销图事务；不把整个节点交互或全站复刻标记完成。只改本机源码，无登录、小号、原站写入或发布，独立影游生产冻结不变。

## 源证据与准确范围

[源审计](./canvas-storyboard-unlink-source-audit.md) 与 [33 摘录 proof](../artifacts/canvas-storyboard-unlink-source-proof.json) 覆盖六个原文件。独立 [validation](../artifacts/canvas-storyboard-unlink-source-validation.json) 核对 unlink 与 clip 的15条文件记录、10个唯一原文件、63条原摘录：文件／摘录 SHA、UTF16／codepoint／UTF8 三套绝对坐标和原切片均通过，originalFailures 为空。clip 六个本机历史文件中两个后来修改；七条摘录自身完整，四条可重证整文件绝对坐标，三条明确只保留历史验证，不冒充当前源码证明。

源 editing continuation 失去来源先于脚本确认，按 segmentRemakeLock、phase、sourceNodeId 判断，不另加节点类型条件。legacy raw script↔group 在 group.sourceScriptNodeId 为 truthy 时确认；GROUP↔GROUP 优先选择有 sourceId 的 source group，否则 target，要求其关联源实际存在及 actual direct child 的 truthy scriptRowHiddenUuid，不限制该孩子必须 IMAGE，也不以 preferred child IDs 代替真实 parentId。已选 source 不合格不回退 target。raw script-v2→group 虽可由程序建图产生，源却没有此特别确认／解绑；本批保持普通断线，不扩大为 V2 新行为。

解绑先 legacy pair，其他场景 target→source 处理 video storyboard group。只清与当前 group 精确匹配的脚本 link，image 匹配优先；显式 video 不清 image。group 存在时清 sourceScriptNodeId／storyboardTitle，即使 stored sourceId 不匹配或脚本已缺失。保留 rows、params、所有孩子、布局／资源、hidden UUID、组类型与版本；纯解绑保边，由 UI caller 进行 raw edge deletion。

源 node-data patch 的顺序保留：patch taskInfo 仅在 own ownerUserId／loading 且 loading 严格 false 时写 nested ownerUserId:undefined；patch name/label 先规范化，再与原 data 合并并再次规范化，空 name 与非空 string label 会迁入 name；始终移除 label。只删除本次规范化 patch 中 undefined 的 top-level key，不删除无关旧 own-undefined，nested undefined 保留。resourceMeta undefined 不删原 node-level metadata。`node-data-update-model` 只供这次解绑使用，不宣称完整 loading／prevTaskInfo updateNodeData 已复刻。

## 分层、事务与本机适配

`domain/storyboard-unlink-model` 持纯资格、notice、binding identity 与 preserveEdge 计划；`domain/node-data-update-model` 持纯 patch 规则。共享 `hooks/useCanvasGraphConfirmation` 持 opaque owner／request 生命周期，node-delete 与 edge adapter 各自保原业务身份；`batch/useCanvasEdgeRemoval` 持单边流程。render 文档、ready、readonly、unmount、Strict replay 和 A→B→A 均退休旧请求；旧 confirm/cancel 不关闭新弹窗。binding 变更或同 ID edge 实例替换阻断旧确认，未发送 prompt／rows／position／无关变化可读取最新值继续。

GraphActions API 也检查 editing 优先级，投影全部最新普通／脚本草稿后再次复核；prepare→preserveEdge unlink→raw edge plan→同次 raw identity CAS／一次 history／成功后 consume。失败投影、竞争与拒绝均不写图、不提前消费 pending，不以 projected graph 作为 expected CAS。已接受图的本机 quota 保存失败保图与草稿，由顶部仅重试保存，不再执行解绑／重复 history。

源 confirm 文案、无 X、backdrop 不关、Escape 可取消及 message 双击全选已接入，复用 dialog-stack。仅此弹窗用 scoped source chrome：344px／viewport-32px、16px margin／padding、12px radius、14px title、13px message、32px buttons。eager overlay 使用联合 selector，避免后到 lazy Canvas 的24px旧规则覆盖；旧 Entry8／Script23 CSS 源顺序不改。窄屏 export 图标补 aria-label，隐藏文字后仍可访问。

本机同步 CAS、opaque owner、取消／失败保留可重试请求是用户授权本机适配。源 helper 多次 update，源 confirm catch/finally 仍关闭且有等待 spinner；本地动作同步，不假装远端 lock／collaboration／版本 history 或异步 source pending 已接入。

## 强回归与修前失败

- [App 修前](../artifacts/canvas-storyboard-unlink-app-before-fix-tests.log)：两个真实入口失败，无确认且 eager 删除原边、关联字段仍留。
- [editing priority 修前](../artifacts/canvas-storyboard-unlink-app-editing-priority-before-fix-tests.log)：一项失败／12 skip，真实 group editing 误走脚本 warning；共享精确谓词后 source priority 修正。
- [normalization 修前](../artifacts/canvas-storyboard-unlink-normalization-before-fix-tests.log)：23 项中两失败，合并后 label/name 与 unrelated own-undefined 规则不符；[App label 修前](../artifacts/canvas-storyboard-unlink-app-label-before-fix-tests.log) 一失败／13 skip保强断言。按源 t4/t5/t6 修复，不通过丢 rows 或弱化 graph／history 断言绕过。
- [最终 App14](../artifacts/canvas-storyboard-unlink-app-final-fourteen-tests.log)：forward／reverse、image 优先、group↔group 两 video 与保 image、V2 ordinary、editing priority／孩子世界坐标、最新 sibling prompt／rows／200ms／once undo、quota 只保存重试、无 X／backdrop／Escape、同 ID 文档切换及 label patch 均通过。保存 JSON 不证明 own-undefined，另由纯模型精确检查。
- [纯规则及修复联合](../artifacts/canvas-storyboard-unlink-normalization-after-fix-tests.log)：四文件86项通过，其中纯 unlink23、node-data17、实际 App14 与旧删除32。旧专项重叠不累计。
- [edge owner28](../artifacts/canvas-storyboard-edge-owner-tests.log)：真实 controller 的旧回调、owner 退休、binding/edge 实例变化、最新正文与 rows、普通／V2／editing、失败重试及执行中创建新请求。
- [Graph API6](../artifacts/canvas-storyboard-unlink-graph-owner-tests.log)：真实 useCanvasDrafts／useSnapshotHistory 验最新两个类别输入、一次 CAS／undo／redo、API editing preflight／project 后复核、throw／CAS 竞争零写与零 consume。未拿生产 planner 造 expected gold。
- [message selection6](../artifacts/canvas-storyboard-unlink-warning-selection-tests.log)：共享 view 六项包含 message 双击全选，零 confirm／cancel，原有叠层与传播隔离回归保留。

## 首次全检查的聚焦等待修正

[首次正式失败](../artifacts/canvas-storyboard-unlink-before-focus-readiness-check.log) 为 session16147 terminal exit1，393文件／5459项中两项旧 focus 失败、5457通过，04:27:08／343.18s，build 未运行；[失败源码冻结](../artifacts/canvas-storyboard-unlink-before-focus-readiness-source-snapshot.json) 与最终冻结只有该测试文件不同，生产没有借此改变。

第一用例是完整 it 的5000ms预算超时；原 `page()` 两个真实冷 App／lazy generator readiness 等待各可到5000ms，不能确定晚到 continuation 导致第二失败。第二失败日志明确有 `聚焦确认工具加载状态`／aria-busy=true；draw成功进入 pending 确认，但测试直接找完整 region，未等 FocusConfirmEntry 实际 lazy import。相关 focus 模块及 commit 核心与上一通过快照相同；[原文件独立诊断](../artifacts/canvas-storyboard-unlink-focus-readiness-diagnostic-tests.log) 13项04:33:42／6.90s通过，但这不把首次全检查改记通过。

只将首个冷入口 it 总预算设15s，内部两个5s readiness仍有限；第二例 await 真正确认 region(5s)，工具ready后才输入最后150ms正文，避免用lazy耗时替代真实草稿race。保留全部比例／参数／边／视口／undo／redo／refresh断言。首定向格式检查未过时测试未运行，格式化后 [focus13+unlink App14联合](../artifacts/canvas-storyboard-unlink-focus-readiness-after-fix-tests.log) 27项04:35:12／15.90s、session23036 exit0；随后重新冻结并重跑完整check，不用定向结果代替全检查。

## 原生 GUI 与完整文档比较

[原生 proof](../artifacts/canvas-storyboard-unlink-native-proof.json) 为后台 own tab5，实际 GUI 从既有公开代表作品《AI纪录短片〈生命的律动〉》复制101节点／32边，再通过搜索／hand pan／双击曲线操作。只读 DOM 测坐标和样式，不注入 graph、storage、events 或 service。GUI导出的 `.libtv` 完整比较包含 title、nodes、edges、view、draft、messages、config，而非只数边。

桌面第一 legacy script→group：取消完整等 focused-before；确认仅删边 `5316c560-23f5-42d6-a5f8-827dfa5a8412`、源脚本 linkedImageGroupId 与目标 group sourceScriptNodeId／storyboardTitle，保全部其他内容；一次 undo 完整等 before，redo／cold reload 完整等 after。原公开图已有 dangling edges，仍保留，不以本批净化内容改变 unrelated graph。

窄屏实际 CSS390×844，对第二 legacy 边取消完整不变；确认只删对应一边和三字段，101节点保留，31→30边；一次 undo 完整等窄屏 before。dialog343.993px、left23.003／right366.997、overlay16px、buttons31.997px，无 X。真实后台点击保 modal、Escape 关闭，双击 message 全选；原生 SVG 无可聚焦 opener，关闭回 AXWebArea，不冒称回 SVG path；可聚焦 opener 恢复另由实际 App 测试。临时 viewport 已 reset，最终 console warn/error 为0。

保留观察边界：首次 localhost GUI copy 确实 quota 失败，[截图](../artifacts/canvas-storyboard-unlink-native-copy-quota.png) 保留；没有清用户数据，成功 QA 使用同 server 的隔离127.0.0.1 origin。10%时首次 double-click 细线 miss 打开 add 菜单，随后真实 search／pan 放大162%命中；最初 DevTools Input deadline 不算性能验收。浏览器既有90% zoom 使390×844 override实际433×938，校准351×760后 read-only DOM证实际390×844。窄屏 export 初无 accessible name，补 label 后实际导出成功。原生 V2／GROUP↔GROUP／editing／150ms／quota retry 未扩宣，物理手机／touch／Safari／高DPR／大图 FPS仍另验。

[桌面确认](../artifacts/canvas-storyboard-unlink-native-confirm-desktop.png)、[390确认](../artifacts/canvas-storyboard-unlink-native-confirm-390.png)、[最终真实画布](../artifacts/canvas-storyboard-unlink-native-final.png) 及11份GUI导出／17文件SHA已保存；16项独立原生断言全部为 true。

## 整体工程检查

本批1161 source/config/test 路径已冻结于 [当前源码快照](../artifacts/canvas-storyboard-unlink-current-source-snapshot.json)，新增11文件、修改10个既有文件、无删除。正式官方Node24.19.0完整 `npm run check` session2868 terminal exit0：**393文件/5459测试全过**，04:36:07/208.38s，格式/零警告lint/架构/核心strict/build31.55s，Vite7.3.7/3579modules。[正式日志](../artifacts/canvas-storyboard-unlink-final-check.log) SHA79ef117e97232ac437621c30dac3d689eb4b7a6af8d11c39a1c644e2026bfbc0；冻结SHA43a16c99ed42a0f8c80cd57cd85f290bd5caa7846e2a81f0dff606aab907d7a4，终态后1161路径零漂移。不是全JSX strict或远端CI，DEP0129/jsdom媒体通知保留。

实际新dist的Canvas/四lazy/ESM闭包/旧8+23源CSS顺序与字节、新main eager scoped CSS及原900000预算见 [最终构建证明](../artifacts/canvas-storyboard-unlink-final-build-proof.json)。新增eager CSS，不能称全部编译CSS字节不变；package/lock/旧lazy CSS源不变。维护后仅文档/proof格式和链接检查，源码重验见 [postdoc proof](../artifacts/canvas-storyboard-unlink-post-doc-proof.json)。

## 剩余前端与服务边界

当前只接单边双击。源 mixed edge batch 先做 ordinary／editing 再等脚本 warning、取消不回滚先做部分，以及 confirmed node-delete 跳过第二 modal／snapshot 等尚未由此单边 adapter 覆盖。source async history／versions／lazy locks 不等于本机一次同步 CAS。

VIDEO／AUDIO→VIDEO_CLIP 的 mD／timeline disconnect 已有 [独立源审计](./canvas-clip-disconnect-source-audit.md)，但纯时间轴双正规化、主轨紧排／linked audio／转场／时长、按 target 整体授权、等待后重算及完整 asynchronous 前端 controller 仍未接，不能称只缺后台。完整特殊 renderer、真机／Safari／高DPR／大图，真实生成／费用／上传／审核／运营写／协作服务仍另验。登录／注册／小号不作为推进条件；本机未部署，全站复刻目标保持进行中。
