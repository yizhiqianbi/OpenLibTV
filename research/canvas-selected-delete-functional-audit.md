# Canvas 选中边、混合删除与智能剪辑断线：本批功能审计

日期：2026-10-14。范围为本机选中边 Delete／Backspace、node＋edge 混合删除、聚合分镜关联确认、VIDEO／AUDIO→VIDEO_CLIP 断线及历史桥接。本文区分源合同、纯规则、可注入 Port、实际 App 回归和原生浏览器；单元测试或源码调研不等于原站全部状态验收。本轮无需登录、小号或原站账号，不运行原 bundle，不调用原站写服务。

本批源码已冻结 [1192 路径及另22份检查时 Markdown 输入](../artifacts/canvas-selected-delete-current-source-snapshot.json)，SHA `447ec0c46ceae67a3623011517eba5681afea0baab6e2ef98ad76506d5ade5aa`。同源码原配置第二次完整check实际exit0，407文件／5862项全过、build16.68s；首次唯一旧Skill超时失败保留。19份真实GUI文档（14 mixed＋5公开VIDEO clip）全文独立gold比对零差异，390px键盘／确认、两阶段mixed history与一次clip undo／redo／cold已验证。上一批398／5617及1171路径是 [连线命中批次](./canvas-edge-interaction-functional-audit.md) 的历史结果。

## 原站证据与边界

主要依据为 [selected／mixed 源审计](./canvas-selected-delete-source-audit.md) 及 [15 文件／93 摘录 proof](../artifacts/canvas-selected-delete-source-proof.json)，另由 [clip 源审计](./canvas-clip-disconnect-source-audit.md) 与 [9 原文件／30 摘录 proof](../artifacts/canvas-clip-disconnect-source-proof.json) 支持轨道和授权分支。93 和 30 是源码片段数量，不是已完成的功能数量；原 immutable proof 和已有日志没有因本批而覆盖。

真实调用链为 RF selected dispatcher／getElementsToRemove → `li` 初始节点确认 → edge changes `cl` → node changes `lo`。不得把普通剪刀单边行为、raw deleteEdges、VIDEO_CLIP 的 `mD`，或 module 605784 的 Mark 变量混作同一个协议。

## 候选、确认与各阶段顺序

`domain/selected-delete-model.js` 保存候选及阶段纯规则，`batch/useCanvasSelectedDeletion.js` 协调生命周期；NodeCanvas 将选中键盘与剪刀接到该协调器。原节点菜单继续使用 `useCanvasDeleteConfirmation` 的独立 `trigger:'menu'` 规则，不用当前混合选择替代菜单 nodeId。

- RF 节点候选按原 nodes 数组**只扫描一次**。仅 `deletable === false` 排除；请求选中节点或其已进入候选的 parent 可加入。前置 child 不在扫描末尾回补，不改成 BFS／固定点递归。普通 group／video_group 的 UI 子树扩展属于后续 `lo` 删除阶段，不能反向扩大候选规则或声称所有后代都受候选过滤保护。
- 边候选先按图顺序取上述节点的 incident 边，再按图顺序追加已选边；`deletable === false` 排除。既有选择的 hidden／selectable 状态不新增删除 gate；direct removeEdges 保留源 requested 顺序及 missing ID ordinary 分支。
- 初始节点确认只看 **flow node.type**，不以 raw data.type 兜底。优先 SCRIPT／SCRIPT_V2，再旧关联分镜组，再 openingUsed VIDEO。纯 edge 选择没有初始节点 warning 或初始 capture。
- 接受任何初始 node warning 都先 capture 完整 before，再令 `isConfirmedDelete` 与 `isScriptDeleteConfirmed` 两个 flags 成立。取消则所有 mixed 删除 callback 均不启动。flags 分别控制普通／节点 snapshot 和聚合关联 warning，不能合并成一个含糊的 skip-confirm 标记。
- edge 分类优先 editing segment-loss：strict lock=true、draft phase=editing、sourceNodeId 匹配，**没有目标类型 gate**；targets 用 Set 首次顺序去重，每目标独立 atomicGroups。随后识别 raw SCRIPT↔GROUP／GROUP↔GROUP 关联，再进入 ordinary／clip 预检。

未 confirmed 的 VIDEO／AUDIO→VIDEO_CLIP 必须在 ordinary commit **之前**完成同步 `mD` 预检，busy 边保留；passthrough 交回 ordinary。随后实际启动顺序为：ordinary 同步提交 → clip 异步启动 → editing raw node 删除（`ui:false`）→ 单次聚合关联 warning／已 confirmed 直接解绑 → selected UI node 删除（`ui:true`）。clip、editing 或关联回答都不阻塞后续 node callback。当前本机 node writer 使用微任务后提交真实 GraphActions，明确区分“已启动”和“图已接受”。

接受初始 warning 后，源 `isConfirmedDelete` 会绕过 `mD`；mixed clip 边因此走源 raw ordinary bypass。这是已核对的特殊分支，不是默认失败 fallback。未 confirmed 的 clip 拒绝、退休、busy、不可用或授权失败均不能补走 raw ordinary 删除。

SCRIPT_V2 的 raw data.type 不等于 legacy SCRIPT，直接 V2→group 边保留普通分类；GROUP↔GROUP 的源 owner 选择及资格没有统一 v2 version 排除。关联 cohort 在全部旧绑定仍可证明时一次接受，按原顺序运行 helper 后一次删边，避免第一条解绑清字段后让同组第二条被误判为不合法。

## 部分取消、末次输入与选择

普通阶段先提交后，关联 warning 取消**只保留关联子集**，不 rollback 已接受 ordinary，也不阻止已启动的独立 node／clip 工作。晚接受关联使用当时最新草稿、图和绑定；绑定漂移／edge incarnation 更换则请求失效，不能覆盖新绑定。同步 CAS false 或投影失败保留请求与草稿，明确重试；拒绝不消费输入或创造历史。

`useCanvasEdgeSelection.getSelectedIds()` 从 owner 有效的 pending selection 取当前存在 ID，独立于 visual hidden 过滤。接受的 setEdges 立即 `retireMissing`，同 ID 删除后再插入不复活旧选择。coordinator 的 onAccepted 仅过滤已不存在节点，不整体清剩余边选择；因此取消的关联边及直接不可删项不会被普通成功阶段误清。菜单原独立确认后的选择处理与混合入口仍分别维护。

GraphActions 统一读取 active／retired 的普通与 script 草稿，投影 before／next，一次 raw CAS，成功后消费对应输入并发布；本批复用这些既有保护。新增真实 hook harness 覆盖末次输入、读错误、cohort 次序、零历史拒绝与重试，没有用生产删除 planner 生成 expected 图。

## 历史与 owner 的本机适配

`useCanvasDeletionHistory` 以 clone-before 保存完整 nodes／edges；同回合 capture 复用 pending before，微任务仅结束 coalescing，不自动 finalize／丢弃 before。接受的 graph writer 才发布实际历史；晚确认开始新 segment，已验证 ordinary→晚 association 的两段 undo／redo。NodeCanvas 将常规 record 接到桥，undo／redo 先经受保护的 flush，clear 则 discard pending；投影失败不继续 raw undo／redo，恢复能力后可重试。

这是**本机 full-snapshot adapter**。原站 `M`／`j` 的 pending、版本冲突、patch history、temporary filter、源 100 条限制及协作行为不是现有本机 50 条快照历史的等价实现。不能声称整个 mixed 固定一次 undo，也不能用最终图相同掩盖异步阶段的历史顺序。全部多人冲突与大图内存／FPS 尚未据此验收。

documentKey、ready、readonly 的不透明 owner 在 A→B→A、能力变化、卸载和 Strict replay 后退休旧 callback／job。NodeCanvas 的 async node writer 在微任务提交前调用 owner-only `canCommit`；hand／Space／reference／focus／Mark／活动手势仅门控新发起，不因之后的模式或自身 modal inert 阻断已启动工作的源顺序。确认按钮仍检查 owner／write eligibility，自身 dialog 的 inert 不使按钮失效；顶层 modal 键盘与焦点沿用 dialog-stack。

复核曾发现旧 Promise 在 adapter 同步切 owner 后重新登记到新 owner，以及同 turn 第二请求依赖渲染态而替换未答 warning。Root 已补 launch 前 owner 检查及 ref-backed `getPendingRequest()`；26 项 controller 回归包含这两条修后场景。它们加入时修复已落盘，不能虚称有修前红测。

键盘使用 composedPath 的真实 target，避开 INPUT／SELECT／TEXTAREA、own contenteditable、`.nokey`、菜单、输入区和 dialog；readonly 禁写，hand／held Space 不触发删除。长按 Delete／Backspace 曾在重复 keydown 时多次 dispatch，已由两条真实失败证明并补 press latch、keyup／blur／contextmenu 释放。对应初始节点确认与关联确认仍不能作为原生按键时序已全部验收的替代。

## Clip 纯规则、Port 与实际服务

clip 专属纯模型实现 ordered mD、每 target 聚合、running 一小时 busy 判定，source type 仅按源 `node.type ?? node.data.type` 解读。时间轴断线恢复 source 列表并两次 normalize，保留空 main track、仅主轨紧排、overlay 保时间、linked audio 跟随／失链保留、仅新主轨首 clip 清转场、有限正结束时间 extent／否则60秒，以及 source currentTime 原式限幅。源非有限值／缺省 currentTime 不假造零值，未知 timeline 字段原样保留。

controller 并发请求起始边两端去重 ID，等待后核 storeInstanceId／projectId／projectGeneration、fresh graph／类型／busy，并以 target 整事务批准：其中每条边仍存在且两端、target 均获准才接受；一个目标拒绝不禁止另目标成功。请求、提交和 finally 释放使用同一 operation signal；本机 Port 按 signal 单独记录 receipt，不传 signal 的兼容 API 属另一 bucket。denied／timeout／no_api／未获准的取消请求不会减掉另一操作的 lease；迟到授权只释放，不复活旧写入。不可用端口不通过 raw 删除假成功。

`useCanvasClipDisconnectPort` 是 **explicit local-workspace lease**，不是旧账号 token、团队权限或云认证。时间轴 patch 在普通 incoming 重算前应用，保留 source clip patchGraph 不调用 raw iu／ih 的边界；真实草稿、CAS、历史与持久化由本机 writer 管理。Port 测试只能证明注入端口流程；实际 App 的存储／undo／redo必须独立验收。

本机增加 AbortController、3000ms deadline、异常及逐项 release 保护，以及 capability-mode owner。mode 修前 local→collaboration 旧 no_api 授权仍可提交，观测 unavailable→local 的 ABA 未退休。修后 operation 保存起始 mode、fresh／feedback 严格核同 mode，hook 观察 mode 变化退休 epoch；normal／Strict 下旧授权只释放，新操作仍可接受。**这是维护性加强，原 callback 没有同样的 mode epoch。** 未 render／read 的原地 mode ABA 不能靠最终值推断，caller 应观察变化或替换 port owner。

随后真实 Port＋controller 重叠回归发现：同 owner 的操作2在获得授权前取消，旧 owner-only finally 会减掉操作1的 lease，导致操作1错误 denied。保留 [修前1失败／33跳过](../artifacts/canvas-clip-lease-overlap-before-test.log)；修后以 signal receipt 隔离授权／提交／释放，[两文件76项通过](../artifacts/canvas-clip-lease-receipt-final-scoped-tests.log)，包含Port40与hook36。证明与4份源码见 [最终清单](../artifacts/canvas-clip-lease-receipt-final-source-manifest.json)。signals／owner不写进文档，本机 lease仍不代表真实云锁。

## 已有定向验证及保留失败

下表仅记录本批定向结果，不作为完整工程、native 或发布证明。运行使用官方 Node 24.19.0；不同冻结／日志不是同一次完整检查。

| 范围                    | 目前证据与准确口径                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| selected 纯规则         | 28 项 literal gold 实际通过；source 15文件／93摘录另独立冻结，不计成功功能数量。                                                                                                                                                                                                                                                                                                                                                                                     |
| 公共 API 与组合         | Root 报告新增 API 43 项及 joint 160 项通过，覆盖 cohort、raw editing、普通 batch、history writer 与草稿。这个定向范围不意味着所有外层 App 状态已通过。                                                                                                                                                                                                                                                                                                               |
| selected controller     | [首轮21项](../artifacts/canvas-selected-deletion-controller-first-tests.log) 与 [修后26项](../artifacts/canvas-selected-deletion-controller-owner-after-tests.log)；后者07:56:06／847ms。实际 GraphActions／draft／history harness、部分取消、最新 prompt、两段 undo／redo、CAS／投影失败重试与 owner／inert／异步阶段有固定预期。                                                                                                                                   |
| clip 纯模型／controller | [旧60项](../artifacts/canvas-clip-disconnect-final-scoped-tests.log) 后新增 mode owner 回归：[修前36项中3失败、33通过](../artifacts/canvas-clip-disconnect-mode-owner-before-tests.log)，07:46:35／812ms；[修后两文件63项](../artifacts/canvas-clip-disconnect-mode-owner-after-tests.log)，07:47:25／863ms。原 scoped snapshot 保留；新 [mode-owner snapshot](../artifacts/canvas-clip-disconnect-mode-owner-current-source-snapshot.json) 只记录3改动与7不变文件。 |
| 本机 clip Port          | 新33项与 clip 63项 [联合三文件96项](../artifacts/canvas-clip-disconnect-port-final-joint-tests.log)，08:02:22／5.75s。注入 Port／hook 结果不冒充 actual App、cloud locks 或原生时间轴。                                                                                                                                                                                                                                                                              |
| 旧 App 兼容等待         | [初轮54项中15失败、39通过](../artifacts/canvas-selected-delete-app-compat-first-tests.log)，07:54:00／7.63s；按 source async 补等待而保原 gold 后，[同组54项通过](../artifacts/canvas-selected-delete-app-compat-second-tests.log)，07:56:37／8.31s。媒体 jsdom 未实现提示保留，不写成原生媒体通过。                                                                                                                                                                 |
| 长按键盘                | [修前22项中2失败、20通过](../artifacts/canvas-selected-delete-keyboard-repeat-before-tests.log)，08:05:09／2.30s，Delete／Backspace各实际4次调用而预期1次；修后latch／keyup与两项历史guard／retry已在91项联合及最终407／5862复验。                                                                                                                                                                                                                                   |
| 新实际 App              | `NodeCanvas.selected-delete.integration.test.jsx` 新19项，真实App→lazy Canvas→coordinator／GraphActions／draft／history／local Port，独立13份完整literal图；最终407／5862无失败／跳过。不是在原站运行测试。                                                                                                                                                                                                                                                          |

此前 [keyboard／history／兼容联合日志](../artifacts/canvas-selected-delete-keyboard-history-compat-final-tests.log) 为六文件91项中 **2失败／89通过**，08:07:00／40.89s，涉及旧 lazy 提示词 surface readiness。保完整图／草稿／撤销断言，局部等待真实 textbox／两个具名case预算后，[同组91项通过](../artifacts/canvas-selected-delete-keyboard-history-compat-after-ready-tests.log)，08:13:20／34.87s；[旧核心／组兼容27项](../artifacts/canvas-selected-delete-core-group-compat-tests.log) 08:20:31／6.38s通过。未更改全局timeout／worker；不同定向版本不累计替代最终完整检查。新实际App回归使用独立13份literal完整图，receipt修复后的最终源码统一由本批完整日志复验。

首次官方Node24.19.0完整检查 [日志](../artifacts/canvas-selected-delete-final-check.log)／[独立失败证明](../artifacts/canvas-selected-delete-first-formal-failure-proof.json)：session58836实际exit1，08:47:06／325.32s；格式、零警告lint／架构、核心strict通过，407文件／5862项中仅旧 SkillCreatorFlow 首例5000ms超时（406文件／5861项通过），build未运行。文件名final不是成功证据。目标原样隔离2项642ms通过；邻近7文件90项通过、临时阶段诊断已还原原SHA，见 [诊断证明](../artifacts/canvas-selected-delete-skill-diagnostic-proof.json)。未证明超时根因，不称lazy／并行一定致因；未改生产、断言、timeout或worker。

第二次按 [同输入复验记录](../artifacts/canvas-selected-delete-second-formal-attempt-inputs.json) 重跑全部5阶段，session29008直接terminalexit0：[正式日志](../artifacts/canvas-selected-delete-validated-check.log)，407文件／5862项全过，08:57:15／233.25s；格式、零警告lint／架构、核心strict通过，Vite7.3.7／3593modules／build16.68s。未把首轮失败与isolated通过合成完整通过，也未改变原5000ms预算。strict仅核心TS，CI未远端运行，DEP0129／jsdom媒体未实现提示保留。

独立 [52项构建证明](../artifacts/canvas-selected-delete-final-build-proof.json)／[11项补充链证](../artifacts/canvas-selected-delete-final-build-supplement-proof.json) 读取此次实际dist：Canvas767526bytes／gzip254878，37递归static closure、34直static／9dynamic记录，4renderer直literal lazy且独立UI marker无static泄漏。旧compiled CanvasCSS207280、Generic3383、Entry156600全部SHA／字节不变；旧31份源CSS／8+23顺序／main5、package／lock／Vite／900000预算不变。1192源码与22份当时Markdown在check／audit前后一致；后续维护文档单独格式／链接复验，不扩张为UI全状态完成。

## 实际混合删除浏览器验证

Root 在独立后台tab5通过公开 `/detail/003446ee7d7e4ccb9fd1c8098a5af8b6` 的“查看创作过程→复制项目”进入 `local-hj8y4dh6`，未修改用户 `local-rcf4u91b`。当前没有整画布 GUI 导入；历史 `.libtv` 是导出归档扩展名，实际“导出→画布文件”下载JSON。本轮没有导入fixture或注入storage／graph／events；只读DOM用于选中状态和尺寸。

实际Enter选普通边、Control＋Enter追加关联边、完整Delete：普通阶段先去边，取消只保关联边；一次undo／redo分别完整恢复G0／G1。重新执行后迟到确认G2，两次undo为G1／G0，两次redo为G1／G2，cold reload恢复G2。390×844时Enter／Shift＋Enter选两个legacy关联，Backspace一次聚合warning；Escape取消保G2，确认后G3，一次undo／redo为G2／G3。101节点始终保留，边32→31→30→28。

[独立冻结G0–G3](../artifacts/canvas-selected-delete-native-independent-expanded-gold.json) 由GUI before及明确source IDs／字段手工构造，未调用production planner，也未用actual after充当gold。[14份实际导出证明](../artifacts/canvas-selected-delete-native-independent-expanded-proof.json) 全文档逐字段一致（包含view／title／draft／messages／agentConfig），零差异；[Root操作记录](../artifacts/canvas-selected-delete-native-operator-record.json) 另存输入方法、两JPEG实际codec、source SHA和warn／error0。390实际页面scrollWidth390、dialog约344px／padding16px／buttons32px、无X；现有90%浏览器zoom使初始390 override实际433，已校准351×760取得实际390×844并reset。

原生范围为键盘选线及完整按键、混合边部分取消和历史；长按auto-repeat、node＋edge初始warning、busy／denied／timeout、末次150msrace与真机touch／pen／Safari／高DPR／大图性能仍仅自动回归或待验。以上14份证据不覆盖Clip，Clip独立结果如下。

## 公开VIDEO剪辑断线浏览器验证

另在后台tab6通过公开 `/detail/6507cebdab6e43ebb94f18fc42dc68fd?preview=1` 的“复制项目”创建 `local-kla8xzk3`。GUI before与此前先冻公开G0完整34nodes／43edges相同；实际DOM四条“高清→视频合成”的data-edge-id核对后，Enter选`edge-Fc7GH8zb`，Control＋Enter加`edge-MarWEKX1`，完整Delete无确认。两素材源仍保留，边43→41，target `Aeu5SYs9kT` timeline剩主轨起点0／15.069750566893424，总时长与currentTime30.139501133786847；其他metadata／原URL／view／所有文档字段保留。

[先冻Clip完整G0／G1](../artifacts/canvas-selected-delete-clip-native-independent-gold.json) 手工沿source合同构造，未用生产planner或actualafter作预期。五份实际before／after／once undo／redo／cold全文相等，[最终独立证明](../artifacts/canvas-selected-delete-native-independent-final-proof.json) 将14 mixed＋5 VIDEO clip共19份分域列出，12个原始excerpt三坐标／SHA又核对。两页warn／error均0。本轮无AUDIO原生输入，无真实团队lock／上传／合成／生成服务。

Root另独立重读19份actual与两份literal gold并执行完整deepStrictEqual，390尺寸／console／JPEG实际codec、本轮正式check／源码不变和额外聚焦单列见 [Root最终核验](../artifacts/canvas-selected-delete-native-root-final-proof.json)。维护文档格式／链接／源码复核见 [post-doc proof](../artifacts/canvas-selected-delete-post-doc-proof.json)；其检查不代替新的生产源码修改后的完整check。

## 2026-10-15 stale candidate guard

初始节点 warning 现在同时保存候选节点业务身份和当时的 ordinary／clip／editing edge 对象身份。用户在确认弹窗期间替换同一条 edge 的 ID 或 incarnation 时，确认请求直接结束并提示画布已变化，不调用普通删除、clip transaction、editing batch 或关联写入；原有确认阶段顺序、history 分段和 owner 退休协议保持不变。`useCanvasSelectedDeletion.test.jsx` 与相邻回归共 **4 个文件／103 项**通过，未把纯规则测试扩大为原站浏览器验收。

随后实际“搜索节点→视频合成”聚焦，额外第六份Clip导出与G1除view之外所有字段完全相同，只有正常fit视口变化；它单列、不混入19份保持完整view的证明。实际 [聚焦截图](../artifacts/canvas-selected-delete-clip-native-focused.jpg) 已查看：仍是通用“智能剪辑生成器”占位和普通inspector／模型配置未可用。**这是真实前端呈现缺口**，不能因timeline断线数据通过而称完整VideoClipNode／播放器／时间轴编辑已实现；下一阶段须按原dN renderer与实际editor入口继续补齐。

下一阶段轻量静态研究已有 [6原文件／41摘录proof](../artifacts/canvas-clip-renderer-next-proof.json) 与 [笔记](../artifacts/canvas-clip-renderer-next-notes.md)，三套坐标／SHA全核。已定位dN专属四态、包装244434／editor613429与删片／恢复边及两条生成链；普通Canvas顶层挂载尚需核实。原Premiere callback存在，但可见导出菜单未render该项，不能据代码创造入口。此研究没有运行新renderer、不计成功功能。

## 剩余前端与服务边界

本机新增没有自动部署，不覆盖独立互动影游的既有生产版本，独立影游扩展也不计原站复刻进展。完整check／构建与实际浏览器证据只证明本轮明确范围，不代表所有原站前端状态已验收。

本轮完成范围仍限于删除协调、断线纯数据与前端事务。VIDEO_CLIP 完整 renderer、媒体 metadata／source ingestion、波形、timeline 编辑与内部 clip 删除／恢复、导出前状态、全部特殊 renderer、真实角色初始 adapter和协作冲突历史仍有前端缺口。原生持续修饰键、触摸／pen、Safari、高DPR、跨设备与大图性能需另验，不能全部归为“等后台”。

真实团队持有人／多人锁、cloud sync、项目写服务、AI 剪辑／生成、媒体合成／上传／转码／输出与支付服务仍未接验；本地 lease 和合法测试 adapter 不证明其授权。登录注册及原账号资源继续按用户要求暂缓；代表性内容足够，不继续全量采集。整个原站前端复刻目标仍未完成。
