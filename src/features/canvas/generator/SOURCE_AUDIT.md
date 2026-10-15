# 生成器参数：配置、UI 与提交边界

2026-10-11。本批按用户的工程优化要求，把节点参数的纯规则、交互和 Canvas 接线分开。没有接入生成服务，也不需要原站账号。

## 公开证据

- `public/data/models.json`：已保存的公开模型 schema，包含 typed enum、originalField、settings / advancedSettings 模式字典和分组、count、prompt、visibleWhen、settingsRules 与 rules。
- `research/source/0leiedr1esdbe.js` 的 459812：配置字段与存储键转换、字段列表、合法值与默认值、私有键保留。
- `research/source/34q64t3bi91ws.js` 的 92105 / 440398：按钮、slider / number、switch、冲突规则及 override。普通弹层宽 340px、padding 12、radius 16；比例超过五项使用五列。普通数字框 blur **先限幅，再按零基准舍入**：`Math.round(Math.min(Math.max(value, min), max) / step) * step`，舍入后不再限幅。slider 在交互结束提交。
- 同一设置 chunk 的 AdvancedSettings：高级数字框 blur 仅限幅，保留输入的小数，不按 step 舍入；显示字符串按 step 的小数位格式化。因此 step=0.1 时输入 0.11 保存 0.11、显示 0.1，与普通数字框的提交规则不同。按模式配置、可折叠分组、第一组的一键重置；voiceCard 的 ID 与 `_${storeKey}_meta` 分开保存，barOnly 不放入高级面板。
- 媒体模式、参考输入、约束、模板合并与锁定的模块证据和 API 见 [媒体纯规则审计](./MEDIA_SOURCE_AUDIT.md)；音色条、列表、筛选、试听与只读 source 契约见 [音色审计](./voices/AUDIT.md)。

证据用于独立实现，原站脚本没有作为运行代码或写入接口执行。

## 生成前媒体顺序物化（2026-10-15）

公开模块 `research/source/1jgo2qrsqidfu.js` 的 `ensureMediaListOrder`（模块
`184299`）在提交前逐项读取 `imageList`、`videoList`、`audioList` 和 `mixedList`：只有记录含有字符串
`nodeId` 时才生成对应 `*ListOrder`，顺序与当前列表一致；已有正确 order 保持对象不变，URL-only
记录不获得虚构 ID，重复 ID 也按原记录次数保留。此前本地普通生成器只更新 `params` 并显示“服务未连接”，
会把当前 incoming 列表的稳定顺序留在内存，重试或未来接入服务时无法保证 request order。

本机新增 `ensureGeneratorMediaListOrder` 纯规则，并在 `useCanvasNodeActions.generateNode` 的本地提交边界
合并当前已收集的媒体输入后调用。它只写当前生成请求的 `*ListOrder`，不发生成请求、不计算费用或权益；
服务未连接时仍保存参数和原有提示词，便于后续真实 adapter 接入。URL-only／空列表保持未物化，
不会把资源 URL 当作节点身份。

专项覆盖 `reference-reconciliation-model.test.js` 与 `useCanvasNodeActions.test.jsx` 共 **2 个文件、66 项通过**：
包括四类列表、重复 ID、URL-only、幂等、当前 edge 顺序和本地服务未接入时的参数保存。该范围是生成前本地
顺序契约，不等同真实生成服务、模型权限或远端任务成功。

## 模块职责

- `schema.js`：字段 / typed enum / originalField、count、默认值、冲突禁用 / fallback / override、条件可见、prompt 与必需输入校验。公开 Flight 快照有三个 long-video 字段引用，只允许解析同一配置的 sibling alias；循环或未知路径不执行。切模型将不支持的旧 modeType 归一化，保留目标模型支持的模式。
- `GeneratorSettings.jsx` / `generator-settings.css`：普通和高级参数视图、typed enum 选择、数值 switch、条件选项、分组重置与 barOnly 音色条；不自行探测媒体或写文档。复用非 modal popover 的定位与 Escape / 外部关闭，不单独创建滚动锁。
- `GeneratorNumericSetting.jsx`：将数字编辑草稿与已提交参数分开；普通和高级 blur 分别遵循上述规则，slider 仅完成拖动或键盘操作时提交。已接入原源码使用的 `@mantine/core` Slider；本地安装版本为 **9.7.1**，原站版本未知。只导入 `Slider.css`，每控件使用局部深色 Provider，关闭全局 / static classes，不写全局主题或浏览器主题偏好；不能因此声称原站 Slider 版本及所有视觉细节相同。
- `media-input-model.js`：连接媒体收集、模式候选 / 自动推断、输入 min/max 与媒体约束、模板 extraConfig 合并、锁定 / 派生参数纯规则。它不读 DOM、不探测 URL、不修改节点。未知格式、尺寸、时长或大小保留 unresolved；图框尺寸不能当作媒体尺寸。细节及未覆盖的主体 / 合规规则见媒体审计。
- `node-generator.js`：Inspector 与生成前共用 `resolveNodeGenerator`，组合当前模型、真实输入、模式、参数、verified metadata、约束与 locks。纯 resolver 默认只归一化与校验已有模式；useNodeGenerator 在初始化、真实 incoming 引用 identity 或模型变化时显式同步推断。显式参数编辑与 submit 不默切模式；有效 extraConfig / pictureEditLock / segmentRemakeLock 和已知 motion / digital 模式按源保护。已知视频时长的派生 patch 在 schema 参数归一化后合并，未验证输入仍阻断。有效 `node.data.extraConfig.models` 同时过滤可选模型，并在提交时阻断历史参数中的范围外模型，不能只靠 select 隐藏选项。
- `useGeneratorMediaMetadata.js` / `services/media-metadata.ts`：只对未验证视频字段读取原生媒体 metadata，必要时以只读 HEAD 读取大小；原 URL 对应缓存，实际读取可经过本地素材映射。重试保留已知字段，换参考 / 卸载取消读取并忽略迟到结果。格式来自真实 URL 后缀或明确记录的文件后缀，不从 MIME 猜扩展名；失败仍显示未验证与重试，不假定合法。
- `NodeSettingsPanel.jsx`：协调当前节点、上述 resolver、模型 source、音色 source 与 update。数量、分辨率、时长、比例、音频开关按 schema；视频模式按 visible / enabled 候选选择，音频 textModes 按配置显示。只读状态禁止修改；`configLocked` 禁用整组参数、数量、高级设置 / 重置及音色条，不凭此额外禁止原允许的模型与提示词入口。
- `model.js`：已加载模型的新生成器使用 schema 默认值；未知模型 / 非生成器不凭空增加模式字段。
- `NodeCanvas.jsx`：生成前使用同一 resolver / validator，默认模型回退与 Inspector 一致，合法输入仍明确报告服务未连接。模型通过统一 `useContent('models')` 加载，提供 loading / error / reload；schema 不可用时保留原 params，参数更改与生成不把空 settings 写回，防止慢请求或失败擦除已存配置。参数与现有 Canvas 文档同次持久化、复制和导出。
- `domain/uploads.js` / `services/browser-file-read.ts`：`readLocalFile` 隔离 FileReader 的成功、失败、取消与监听清理；换项目 / 卸载中止上传，迟到结果不提交。上传完成合并最新 nodes，保留读取期间的参数编辑、节点变化与 edges。媒体 `resourceMeta` 保存真实 File.size、从 File.name 读取的后缀、File.type 与对应 sourceUrl；完成 data URL 以明确 localMediaReady 标记参与本地参考，不伪造服务器 URL、媒体时长或尺寸。格式规则不将 File.type 当后缀依据，也不将文件名后缀当作文件内容检测。

voiceCard 默认对象保存为 voice ID 与 metadata，保留原已有 ID。已接入 `VoiceBar` 与可注入只读 VoiceSource，选择只合并对应 advancedSettings 的 ID / metadata，保留其他参数。默认仅提供一条公开代表音色与本机收藏；分页正向验证使用本地 adapter 夹具，不能描述为匿名访问到原站完整音色库。原站账号音色、克隆和远端收藏写服务仍未接入。

## 检查与浏览器

历史参数批次的定向三文件 / 13 项检查已由本轮扩展回归覆盖：实际公开 schema 的默认值、typed enum / API 键、条件与冲突规则、模式选择 / 自动推断、已验证和未知媒体约束、模板锁定 / 范围外模型、音色 ID / metadata、普通 / 高级数字提交，以及真实 NodeCanvas 保存 / 新挂载恢复、模型加载失败保留参数和异步上传取消 / 合并。根代理本轮执行完整 `npm run check` **135 个测试文件 / 691 项测试全部通过**，包含格式、零警告 lint、核心 strict TypeScript 和生产构建；这不是所有 JSX 类型或全部原站功能验收。

浏览器本地夹具创建 StarVideo 2.0 节点，把时长改为 12s、数量 4、联网搜索关闭，输入提示词后生成显示服务未连接；刷新后参数和错误仍保存。截图 `artifacts/generator-settings-restored-proof.jpg`。这不表示已经发起或完成真实生成。

根代理本轮浏览器夹具验证音色第二页选择第 21 条、试听、关闭回焦点及刷新恢复；高级参数实际输入 0.11 后保存 0.11 / 显示 0.1，真实拖动完成后提交。390px 音色弹窗为 x=14、width=362、right=376，无横向溢出。这些是本地页面与 adapter 的实际验收，不代表原站账号目录或所有浏览器已验证。

## 保留差距

节点内嵌与普通 batch 本批已接线，证据见研究和 batch审计；增强 mentions、分镜专属批量参数、完整菜单 / tooltip / Slider 像素、主体共享限额及特定模型合规工具仍有差距；媒体与音色审计分别记录具体边界。普通 VideoGenerator effect 的源码顺序与 caller 保护已归档到 research/canvas-inline-generator-source.md；本地按真实引用签名追踪 incoming，不冒充原 source 对象身份或未知支持列表完全一致。旧通用 `aspectRatio` 不猜测迁移为任意模型字段。

Mantine 已替代旧 native range，旧步长基准差距不再按 native 控件描述；原站安装版本未知，仍需更多真实交互与视觉对照。默认代表音色、注入 source 的正向夹具、未知媒体的明确阻断，都不能冒充原站完整授权状态。所有运营生成、费用、权益、真实音色写服务继续未接，整个复刻目标仍未完成。

## 本批浏览器与生命周期

Root在本地代表夹具验证Mixed引用插入、参数条和生成服务未连接时保留提示词。节点单选下660px生成器逆zoom保持屏幕尺寸，48px参考卡与只读footer按源码；390px定位适配从右界425.8修为x20 / width350 / right370，pageWidth390。截图canvas-inline-generator-proof.jpg / canvas-inline-mobile-proof.jpg存于artifacts。真实完整Canvas的149ms前卸载/pagehide保存、切相同nodeId文档保留旧draft而不污染新文档、readonly无写已回归。基础@当前参考已实现，增强全画布suggestion/连线/素材tag仍未完成。

## 节点 AutoLink 后续接入（2026-10-11）

自动建议只对image / video启用，使用当前参考名字和序号；纯匹配、DOM ghost、生命周期 hook、提示视图和strict TS偏好边界独立。保留原1/0存储、200ms / 0ms检测、Tab / Shift-Tab、点击、Escape、IME与受控批量历史。当前无需登录；不调用标签或生成服务。源码 / 本地适配 / 桌面390px证据与未完成范围见 [功能审计](../../../../research/prompt-autolink-functional-audit.md)。

## 节点引用动作后续接入（2026-10-11）

单个 badge swap 与普通 @ 资产入口已接实际 InlineGenerator；graph 批次同次规范 incoming mode，prompt callback 读取最新文档，避免首次图片导入时先插 Image token 再变 Mixed 模式。真实 IME 开始关闭菜单，窄屏 RAF 用实际宽度稳定定位。源码与验收范围见 [引用动作审计](../../../../research/prompt-reference-actions-functional-audit.md)。

## VIDEO角色库后续接入（2026-10-12）

2026-10-13后续：Generic／ScriptV2／实际加载错误态共用surface测量，title／固定toolbar避让、上下翻转／限高滚动是用户授权本机适配，source collapsed仍固定下方。输入不继承3D反馈；普通IMAGE排序only typed与literal，VIDEO重映射后消费CAS正文，原delete store链另验。375／5108完整check、1129SHA与准确原生／受控范围见 [节点面板验收](../../../../research/canvas-generator-vertical-functional-audit.md)。旧CSS输出全字节／导入顺序和四个lazy实现不变量保持；本机未部署、真实服务／特殊renderer／手机Safari／大图继续有缺口。

真实rr角色入口／公共目录与Seedance媒体选择已分离至`roles/`，typed运营source默认unavailable，不请求账号资源。容量与主体rb独立，三媒体证书字段由两真实collector共用`roleMediaReferenceMetadata`；IMAGE／VIDEO时间及InPlace语义、AUDIO只assetId按417754源码维护。引用图一次CAS／history／flush，最新prompt清Magic、显式next draft跳过与输入接受避免token复活，Quota不重跑审核／建图。portal click隔离防背景失选，CSS旧级联与generic按需入口保持。证据与真实App／native范围见 [角色库验收](../../../../research/canvas-role-library-functional-audit.md)。真人目录／分组／签署／QR、历史图库、VIDEO／AUDIO重核writer及主体rb仍未全部接线；默认服务未连，正向fixture不表示原站授权、生成或目标完成。

2026-10-13后续普通删除（以下379／5193及缺口为该历史批次状态）：完整store collector／稳定ID reconciliation已接，typed/mixed token清理与最后草稿一次CAS/history，Inline接受取消旧timer；group计全部leaf，Role final after共用规则。379／5193完整check与1135冻结、实际App／native范围见 [删除验收](../../../../research/canvas-reference-delete-functional-audit.md)。IMAGE排序only-order仍有效；上述“delete另验”是上一轮历史。特殊锁、全局cascade、lens/style/focus和Role初始adapter当时仍有前端缺口；后续删除进展以下节为准。本机未部署。

## 整图删除后续接线（2026-10-14）

普通参考卡、全局 node / edge 删除现在复用 `reference-recalculation-model.js` 与 `domain/destructive-delete-model.js` 的源状态规则，GraphActions 在当前文档完成一次 CAS / history：`pictureEditLock` 最后视频消失时整套 params reset、submitted segment 失去源时去 lock / draft / SegmentRange、editing continuation 丢源后的 target cascade 已补；style / lens effect 清理、SCRIPT style 状态以及 `space-scene-720` / `director-console-3d` panorama 状态也已在纯重算中覆盖。它们不再是上一批所称的全部缺失；纯状态与实际 UI 范围仍须分开，不能据此宣称特殊 renderer 已完整复刻。

实际 keyboard Delete、连线 pointer / double-click 和普通参考卡入口已接整图事务。script / 旧关联 group / opening-used VIDEO 的 keyboard 确认，与菜单 script / generated-content 的独立资格和原文案分别处理；controller 重读当前 owner / 文档与最后草稿，取消零写，失败保留确认重试。普通生成器、ScriptV2 普通输入与 row drafts 的不同 channel 由统一 draft 边界投影及消费，避免 pending timer 或 baseline 碰撞复活旧引用。

UI 删除普通 `group` / `video_group` 扩展 `parentId` 子树；raw 删除父组时释放孩子、显式解组与孩子世界位置维护是不同动作，不能把保留孩子当作普通组 UI Delete 的源行为。partial group 剩余一个孩子解散，两个以上按 source measured / zoom bounds 重算。对仍存活组的实际 consumer 即时清引用，只沿删除前 ancestry 与真实 outgoing targets 的 bounded opt-in 进行；这是用户授权的本机一致性优化，不伪称原 store 已保证同样即时重算。

Root 最终完整 `npm run check` 官方 Node24.19.0、session34383 terminal exit0，**388 文件 / 5370 项**通过，03:32:29 / 170.04s，3573 modules、build16.77s；对应1150 source/config/test SHA冻结。日志为 `artifacts/canvas-destructive-delete-final-check.log`，实际分支、源码证据、App / native 与剩余差距见 [整图删除验收](../../../../research/canvas-destructive-delete-functional-audit.md) 和 [确认审计](../../../../research/canvas-delete-confirmation-audit.md)。379 / 5193仅是上一批普通参考删除的历史验证，不能作为当前完整检查或所有删除分支验收。

source script / group 断线确认后的 `unlinkStoryboardByEdge`、VIDEO / AUDIO → VIDEO_CLIP 的 `mD` timeline 事务及原协作锁、IMAGE source focus 降级、Core 完整 typed-order materialization、Role 初始 adapter、特殊 renderer 和持续高频 / 大图 / 物理手机 / Safari 仍有前端或验收缺口。真实生成、上传、审核、费用、协作及运营写服务未接；登录注册和账号资源继续延期。本机未部署，整个复刻目标仍未完成。

## 分镜断线与共享确认后续接入（2026-10-14）

上节整图删除批次所列 `unlinkStoryboardByEdge` 未接是当时状态；当前已接实际单条连线双击的确认与解绑。节点删除和单边断线分别由 `useCanvasDeleteConfirmation` / `useCanvasEdgeRemoval` 维护业务资格，共用 `hooks/useCanvasGraphConfirmation` 的 opaque request / document owner。同 ID 的文档往返、ready / readonly 变化、卸载和后发请求使旧回调退休；旧 confirm / cancel 不写旧文档或关闭新请求。edge 实例或关联身份改变须重新发起，期间普通 prompt、raw rows、位置和无关数据变化则重读最新图。取消零写；本机同步执行失败保留请求重试，不能冒充源 catch / finally 的关闭与异步 spinner 行为。

editing continuation 优先于任何分镜 warning：target 的 `segmentRemakeLock === true`、draft.phase 为 editing、draft.sourceNodeId 等于 edge.source 时走 raw 删除目标，不能增加 target 类型门槛。只有 raw `data.type === 'script'` 与关联 group 的直接边，以及满足源侧优先 / 实际关联源存在 / direct child hidden UUID 的 group↔group 才进入特别确认；直接 `script-v2` 边保留普通断线。原文案“断开连线” / “确定断开”与无 X、遮罩不关闭、Escape 取消复用现有 view / dialog-stack。

解绑先处理 legacy script↔group；否则按 target→source 处理 video storyboard group。只清当前精确匹配的 script link，direct 推断 image 匹配优先，显式 video 不清 image；存在的 group 清 sourceScriptNodeId / storyboardTitle。保留原 rows、params、childNodeIds、所有孩子与布局 / 资源 / hidden UUID / 组类型和版本。纯解绑 preserveEdge，实际 edge 删除交整图删除计划。GraphActions 公共 `unlinkStoryboardEdge` 在投影前及全部最新普通 / 脚本 draft 投影后都复核 editing 和资格，使用原 raw graph 身份 CAS、一次 history，成功后才 consume；投影失败或竞争不提前消费 pending。Quota 失败保已接受图，只重试保存。

`domain/node-data-update-model` 仅给这次解绑提供源 patch 规范化：patch 与合并 data 各做 name / label 转换，空 name 可承接非空 string label 且始终去 label；只删本次 patch 的 top-level undefined，保留无关旧 own-undefined。taskInfo 只按本次 patch 处理，不补旧 data 的 owner 字段。这不表示完整 loading / prevTaskInfo / 通用 updateNodeData 生命周期已复刻。

Root 最终官方 Node24.19.0 完整 `npm run check` 的 session2868 terminal exit0：**393 文件 / 5459 项**通过，04:36:07 / 208.38s，Vite7.3.7、3579 modules、build31.55s；格式、零警告 lint、architecture 与核心 strict 检查通过。1161 source/config/test 路径冻结不变，本批新增11文件、修改10个既有文件。旧388 / 5370仍是前一批整图删除检查。第一次 formal session16147 exit1，两个旧 focus 测试失败且未运行 build；独立13项通过后，以15秒总预算及等待实际 region ready 修正测试时序，保留最新150ms / graph / history 强断言，联合27项通过后重新运行正式完整检查，不能把失败那次或专项检查当全量通过。

正式结果见 [完整日志](../../../../artifacts/canvas-storyboard-unlink-final-check.log)、[源码快照](../../../../artifacts/canvas-storyboard-unlink-current-source-snapshot.json) 与 [产物复核](../../../../artifacts/canvas-storyboard-unlink-final-build-proof.json)。实际 App14、edge owner28和 Graph API6各自验证入口、owner与最新草稿 / CAS / 一次 undo，范围与修前失败见 [分镜断线验收](../../../../research/canvas-storyboard-unlink-functional-audit.md)。原生 GUI 使用101节点 / 32边代表作品，两条 legacy 边的取消 / 确认、一次 undo / redo / cold reload完整文档比较、真实 CSS390窄屏和无 X / 遮罩 / Escape已有16项断言、11份GUI导出；这不将 V2 / group↔group / editing / 150ms 的受控回归冒充同样原生验证。

当前仅覆盖单边入口；source mixed edge batch 的 ordinary / editing 先执行与随后 warning、confirmed node-delete 跳过第二确认等仍未接。VIDEO / AUDIO→VIDEO_CLIP 的 mD 时间轴双正规化、主轨 / linked audio / 转场 / 时长、按 target 授权与等待后重算，以及异步锁 / 协作服务仍有前端缺口，不能称只缺后台。特殊 renderer、物理手机 / Safari / 高 DPR / 高频大图与真实生成、费用、上传、审核及运营写服务继续另验；本机未部署，整个复刻目标仍进行。

## 连线交互入口更新（2026-10-14）

上一节单边双击是历史运行入口。当前 `CanvasEdgeLayer` 以20世界单位透明hit、源独选／叠加规则和1000ms hover剪刀调用既有 `useCanvasEdgeRemoval`；双击只隔离pane，不再删除。普通／editing／legacy关联确认与最后草稿、raw CAS和一次history协议保持，readonly可选线而无剪刀。新入口的native Space不preventDefault，hand／held Space／活动pointer由当前owner禁写并在release恢复；命中、选择、最近点与生命周期分别留在pure／hooks／view。真实App旧删除／解绑断言改接剪刀而保完整图／输入／undo／quota断言。

源93摘录、5个新测试文件158项、14份真实GUI全字段比较与390px／10%／readonly边界见 [连线验收](../../../../research/canvas-edge-interaction-functional-audit.md)。这些普通边原生操作不代表全部legacy、editing或非空150ms输入均原生实测。selected-edge Delete、混合node／edge聚合／分段确认、VIDEO_CLIP异步mD、真实锁与完整特殊renderer仍缺，不能把单条剪刀扩称批量前端完成。
