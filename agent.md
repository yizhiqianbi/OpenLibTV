# Agent 维护入口

所有参与开发的 agent 先遵守 [AGENTS.md](./AGENTS.md)。本文件仅作为入口，不重复维护第二套规则。

2026-10-16 混合字幕来源已完成专项与全量验证：同一片段的HTML/VTT来源独立分型、加载与渲染，混合模式同时保留两类轨道；定向3文件/16项通过，Node24.19.0完整`npm run check` session40760 terminal0：**460文件/6562测试**，测试218.48s、build18.06s，格式/零警告lint/架构/核心strict通过，1376源码/config指纹无漂移，Canvas897382/ClipEditorWorkspace230231字节。日志`artifacts/subtitle-mixed-full-check.log`、证明`artifacts/subtitle-mixed-verification.json`。源与边界见 [混合字幕审计](./research/canvas-subtitle-mixed-source-audit.md)。整体仍约70%，未部署、无需账号。

2026-10-16 音视频分离已完成专项与全量验证：公开源确认的浏览器提取音轨流程现在会生成真实PCM WAV，加入关联音频节点、对齐原视频片段、静音内嵌原声，并沿用历史/CAS与取消/失败边界。定向5文件/94项通过；Node24.19.0完整`npm run check` session77892 terminal0：**463文件/6570测试**，测试207.13s、build15.67s，格式/零警告lint/架构/核心strict通过，1382源码/config冻结无漂移，Canvas899867/ClipEditorWorkspace230417字节。日志`artifacts/audio-separation-final-check.log`、证明`artifacts/audio-separation-verification.json`。源与边界见 [剪辑器审计](./research/canvas-clip-editor-functional-audit.md)。人声分离、远程运营服务和真机Safari仍缺，整体约70%，未部署、无需账号。

2026-10-16 字幕最终接线：真实HTML字幕右侧栏已按源改为列表/样式同栏切换，双击列表进入样式，样式页头返回；逐词高亮/双alpha色盘/源词时钟/窄屏焦点通过。最终Node24.19.0完整check session87968 terminal0：**459文件/6559测试**，01:43:25、测试413.89s、build33.47s，格式/零警告lint/架构/核心strict通过，1374源码/config指纹未变，Canvas897382字节。日志 `artifacts/subtitle-sidebar-full-check.log`，范围见 [字幕高亮与侧栏审计](./research/canvas-subtitle-highlight-audit.md)。本机未部署、无需账号、整体约70%，目标仍未完成。

2026-10-16 HTML字幕已接实际App来源/面板/源时间轨道、片段拆分复制与规范存档/历史、末次输入和真实预览；复制加载丢失及播放后编辑误报冲突已修。专项39文件/631项与追加过期投影拒绝后的52项通过；Node24.19.0完整check session50294 terminal0：**457文件/6544测试**、格式/零警告lint/架构/核心strict及标准build21.87s通过，1367源码/config指纹未变，Canvas897073字节。日志 `artifacts/html-subtitle-app-full-check.log`；原生桌面/390/播放/刷新/删除/历史/焦点、修前失败与剩余高亮/旧版本/完整轨道等见 [实际App审计](./research/canvas-html-subtitle-app-audit.md)。strict非全部JSX、统计含独立影游、CI未远端执行、未部署、无需账号、整体约70%，目标仍未完成。下段进行中与453/6510均为此前历史。

2026-10-15 进度复核维持约70%（65%-75%）。HTML字幕App接线进行中，创建/面板/预览和末次输入刷新恢复已有浏览器证据，时间轴拖动尚未通过原生验收；定向37文件/606项及零警告lint通过，当前接线尚未完成完整check。下段453/6510只代表接线前冻结版本，不能称当前工作区全量通过。具体口径见 [进度估算](./research/coverage.md#当前复刻进度估算2026-10-15)，本批未部署、无需账号，整个目标仍未完成。

2026-10-15 HTML字幕底层已新增source时基、clip/meta、同源投影、clone/retag/delete与split/duplicate原子事务和独立封闭预览文档；尚未接App HTML字幕UI/source/archive、CAS历史和实际播放器，不计为完整可用功能。专项33文件/575项、独立Chromium12项及最终Node24.19.0完整check **453文件/6510测试**、格式/零警告lint/架构/核心strict与标准构建23.54s通过；1355源码/config指纹未变、Canvas895155字节，日志 `artifacts/html-subtitle-contract-full-check.log`。首轮主动停止/trim补正、原生范围与下一步见 [HTML字幕协议](./research/canvas-html-subtitle-contract-audit.md)。统计含独立影游、strict非全部JSX、CI未远端执行、本机未部署，无需账号、整体约70%；下方452/6493为前批。

2026-10-15 普通文字数值条/原生颜色行已接：绝对映射、min-relative snap、文本确认/取消/键盘与独立token、typed最后值/pagehide、一次历史/旧回调隔离和精确投影取消。专项32文件/558项、角色库联合33文件/570项通过；最终Node24.19.0完整check terminal0：**452文件/6493测试**、格式/零警告lint/架构/核心strict及标准构建38.94s通过，1351源码/config指纹未变，Canvas895155字节，日志 `artifacts/clip-numeric-full-check.log`。首轮失败/明确复现/角色库基线修正、原生拖动/刷新/undo/390/焦点和未验后台/OS色盘/真机边界见 [控件验收](./research/canvas-text-controls-functional-audit.md)。下方450/6478为前批；strict非全部JSX、CI未远端执行、本机未部署、无需账号、整体约70%，HTML字幕/完整字体预设等仍缺。

2026-10-15 普通文字高级属性：背景/alpha/圆角/模糊、九种非空CSS动画、应用到所有、区段折叠/滚动与页头删除blur已接。源像素比例/两位小数与百分比行高已纠正；专项30文件/543项通过，最终Node24.19.0完整check terminal0：**450文件/6478测试**、格式/零警告lint/架构/核心strict与标准build18.36s通过，1345源码/config指纹未变，Canvas894054字节，日志 `artifacts/clip-text-advanced-full-check.log`。实际CSS Animation时间与回弹、wave、刷新/undo/390/焦点和明确缺口见 [高级属性验收](./research/canvas-text-advanced-functional-audit.md)。原始色盘/数值控件、完整字体/预设/HTML字幕与自定义script仍缺；strict非全部JSX、CI未远端执行、本机未部署，无需登录/小号、整体约70%；下方449/6468为前批。

2026-10-15 普通文字已接实际剪辑器：正文/布局/文字样式、独立轨道/拖动裁边、末次输入与同一历史/CAS、双iframe预览。精确草稿投影的CAS基线和拖动期间保存已修；连续播放在转场准备时的旧时间回传自取消已修。专项29文件/533项通过；最终Node24.19.0完整check terminal0：**449文件/6468测试**、格式/零警告lint/架构/核心strict/标准构建通过，1340源码/config指纹未变，Canvas893988字节，日志 `artifacts/clip-text-ui-full-check.log`。原生桌面/390/刷新/最后项删除/逐层Escape/转场与文字层级及明确缺口见 [文字验收](./research/canvas-text-editor-functional-audit.md)。高级背景/动画/HTML字幕、完整字体/预设/轨道仍缺；strict非全部JSX、CI未远端执行、本机未部署，无需登录/小号，整体仍约70%；旧445/6450是前批冻结。

2026-10-15 普通文字HTML底层已新增inert协议读写、源时间/避碰规则、语言/逐字计时修改与稳定cue ID，专项21项/原生Chromium6项及静态布局通过。最终Node24.19.0完整check terminal0：**445文件/6450测试**、格式/零警告lint/架构/核心strict/标准构建通过，1309源码/config指纹未变，日志 `artifacts/clip-text-contract-full-check.log`。尚未接App入口与播放宿主，不能计为可用文字功能；首轮失败/原样复验、下一步接线与源双iframe/轨道协议见 [HTML审计](./research/canvas-text-html-contract-audit.md)。整体约70%、本机未部署；下方443/6429为前批冻结。

2026-10-15 最新基础VTT字幕：新增/搜索/选择、正文/全局样式/应用全部、显示隐藏/删除、拖动裁边、历史/CAS/末次输入保存和主画面叠层已接，专项25文件/496项及Chromium桌面/390通过。最终Node24.19.0完整check terminal0：**443文件/6429测试**、格式/零警告lint/架构/核心strict/标准build17.99s；1303源码/config指纹未变。日志 `artifacts/clip-subtitles-full-check.log`，修复前失败、空态崩溃与实际范围见 [字幕验收](./research/canvas-clip-subtitles-functional-audit.md)。HTML字幕/普通文本、完整字体目录与真实服务仍缺；整体约70%（65%-75%），本机未部署，下方438/6408保留为前批冻结。

2026-10-15 最新转场操作：库/属性/独立切点选择、时长与删除、宽度记忆、双冻结视频及源CSS遮罩预览已接。Node24.19.0完整 `npm run check` exit0：**438文件/6408测试**、格式、零警告lint/架构、核心strict与标准生产构建21.43s通过，日志 `artifacts/transition-panels-validated-check.log`；专项20文件/475项及真实桌面/390px范围见 [操作审计](./research/canvas-transition-controls-functional-audit.md)。下段历史ENOSPC与旧433/6366不能作为当前结论，准确状态见 [工程验证](./AGENTS.md#当前工程验证)。本机未部署，整体目标仍进行中。

2026-10-15 前批主预览：四种 `transitionIn` 画面预览已接入，剪辑专项17文件/461项与Chromium像素/GUI恢复/390px已验，见 [转场审计](./research/canvas-transition-preview-functional-audit.md)。当时完整检查及标准构建因ENOSPC失败，仅代码编译通过；该历史状态已由上段438/6408完整成功更新，旧433/6366也仅保留为前批快照。

当前本机前端进度工程估算约70%（65%-75%），按用户确定的范围排除内容数量、延期登录及真实服务执行，但包含前端错误/权限等状态；依据与缺口见 [进度估算](./research/coverage.md#当前复刻进度估算2026-10-15)。转场实际预览接入前的本机剪辑恢复、片段字幕/转场/音量增益线/复制粘贴、Canvas 逐帧拉片、Studio 镜头/复制/时间轴导航/灯光与材质颜色、生成前引用顺序、项目管理、挑战赛分页与学院播放器/跟练导航批次已通过433个测试文件／6366项完整检查与生产构建，准确范围见 [剪辑编辑器验收](./research/canvas-clip-editor-functional-audit.md)。历史冻结通过不能代表后续源码，测试数量不作为完成比例。

2026-10-15 维护：音色筛选的语言、口音、性别已增加可搜索输入、清空和依赖筛选重置；Studio 导入 mesh 已支持有来源证据的材质颜色覆盖，颜色写入 nodeEdits 并支持撤销／重做、自动保存和刷新恢复。两项仍属于本地前端演示，完整 Mantine 筛选视觉、完整材质参数、纹理、骨架和真实运营服务继续保留边界。 资产库文件夹可从当前子树的有效图片设置或清除本地封面，坏图有回退；选中节点／连线混合删除在确认期间校验候选边 identity，防止 stale request 删除新边。 剪辑器收起预览在节点暂不可见时停止有界 portal 重试并提供“回到节点”；Studio 导入 GLB 子节点支持稳定 path tombstone 删除、恢复层级和导出轨道过滤。

同日维护补充：`shot-breakdown` 已从通用占位改为有来源证据的“逐帧拉片”专属卡片，支持视频空态/预览、本地素材、画布点选和分镜/动态/音乐维度选择；开始操作仍明确提示服务未连接。剪辑时间轴的片段级 subtitleUrl、transitionIn、音量增益线和复制粘贴现在映射为原生字幕轨道、本地转场标记、-60～20dB 曲线编辑及单视频片段剪贴板闭环，Studio 已接入有来源证据的 Shift+Arrow 镜头 waypoint、Shift+A 添加菜单、1/2 工作区、C 相机视图、复制粘贴/重复、灯光类型与属性、材质颜色选择器及时间轴速率/缩放/键盘进度。生成前媒体输入会按当前 incoming 节点物化稳定 ListOrder，项目页补齐本地排序和移动到文件夹，挑战赛列表补齐分页/续载/错误重试；学院播放器已补桌面音量悬停/聚焦纵向滑块和完播遮罩点击关闭，学院跟练补上一节/下一节，资产选择器补齐远程混合目录的当前层级过滤；学院文章页保留登录门槛并新增 source/itemKey 画布入口。前批全量检查为433个测试文件／6366项，仍不代表云端拉片、真实导出、真实课程权益或运营服务已接入。

同日剪辑补充：转场工具已按公开源 bundle 的 `transitionIn` 片段契约接入本地编辑。工具栏可在主轨相邻片段间添加或更新 `fade`（`crossfade` 兼容别名）、`dissolve`、`fadeblack`、`fadewhite`，时间轴显示转场标记并可点选右侧片段，时长受邻片段和源 0.2–10 秒规则限幅。该状态进入现有十步历史/CAS，预览画面与真实导出继续标记未接入。

剪辑器本批修复了直接编辑后的撤销／重做历史快照：删除、拆分、裁切、轨道控制、素材边恢复、片段音量增益和片段复制粘贴都会在提交前保留旧时间轴，图、边、本地保存和选择状态同步。冲突恢复副本只在用户显式关闭时按当前 CAS 调整来源边；媒体未完成准备时关闭和切换会被拒绝并保留副本。剪辑拖入、字幕、转场、增益线、复制粘贴与恢复专项通过，前批完整检查为433个测试文件6366项，历史日志为 `artifacts/pre-transition-full-check.log`；远端冷启动超时、WebAudio跨浏览器、全局字幕/转场画面／真实导出、云协作和真实生成服务仍未接入。

选中边与混合删除已按源先ordinary、异步clip／editing、聚合关联warning、selected nodes分派；后置取消只保关联，晚确认历史分段，最新草稿／一次CAS／成功消费统一维护。local clip Port按operation signal隔离授权／提交／释放，修复重叠取消偷走另一操作lease；长按Delete／Backspace只派发一次。19份真实GUI完整文档（14桌面／390混合＋5公开VIDEO clip）与独立gold相等。首次Skill超时保留，同源码原超时／worker完整重跑通过。完整VideoClipNode／timeline编辑、真实云锁和真机／Safari／大图仍缺；无需登录／小号，本机未部署，整体目标未完成。

此前脚本/分镜组单边断线已接确认、精确解绑、editing优先及一次撤销；末次输入同次提交，取消不改图，quota只重试保存。393文件/5459项完整检查与1161冻结、首次focus等待失败修正、真实101节点GUI恢复及390确认见 [分镜断线验收](./research/canvas-storyboard-unlink-functional-audit.md)。本机未部署，无登录/小号；mixed edge batch、VIDEO_CLIP时间轴异步前端/源锁、完整renderer与真机/Safari/大图仍未完。整体目标未完成。

上一批整图删除与确认已接 UI 子树／父组收缩、特殊锁重算、边专属角色 metadata，最后输入／CAS／一次历史与成功后消费 timer 同步，手型／Space 禁误删。388文件／5370项完整检查、1150冻结、实际App22项与native16份GUI整文档删除／撤销／刷新、390确认／回焦点见 [整图删除验收](./research/canvas-destructive-delete-functional-audit.md)。首次正式旧组expectation失败已保留并完整重跑，script／分镜断线、VIDEO_CLIP mD／源锁与完整特殊renderer仍缺。本机未部署，无登录／小号，整体目标未完成。上一批普通参考379／5193与1135记录见 [历史删除验收](./research/canvas-reference-delete-functional-audit.md)；下方375／5108是历史面板批次。

上一批更新：节点面板共用实际surface测量，优先下方、溢出上放与限高滚动，避开title／固定工具栏；输入永久在article内、tilt shell外。VIDEO排序消费真实CAS正文，IMAGE只改typed顺序保literal，失败保末次草稿。375文件／5108项完整check、1129冻结SHA与原生桌面／窄屏范围见 [节点面板验收](./research/canvas-generator-vertical-functional-audit.md) 和 [AGENTS当前验证](./AGENTS.md#当前工程验证)。维护纯模型／生命周期／view边界，不把定位写成graph历史；group／加载错误／动画中间帧主要受控DOM，手机／Safari／大图另验。本机未部署、登录／小号延期，真实服务与特殊前端继续有缺口，整体目标未完成。

此前角色批次：VIDEO角色库、公共目录／详情和合规素材选择已按真实入口接线；引用图事务修复末次草稿复活、Magic漏清和Quota重复审核，弹窗click隔离避免背景node失选。完整检查、实际App与桌面／390／320范围见 [角色库验收](./research/canvas-role-library-functional-audit.md)；历史节点松手结果保留原审计。目录／审核默认未连接，真人授权／组／QR、历史图库及主体前端仍有缺口。

此前元素标记、模式互斥、prompt metadata清理、Script按需卡片与横向边缘适配的352文件/4745测试是独立历史快照，日志 `artifacts/canvas-mark-final-check.log`；默认识别服务未连接，原生和受控范围见 [元素标记验收](./research/canvas-mark-functional-audit.md)。

此前参考选择/本机队列/个人库/按需生成器批次完整check324文件4320测试，历史证据见 [参考验收](./research/canvas-script-reference-functional-audit.md)。后续修改须重新check，不将历史快照作为当前通过。

此前空态批次恢复剧本/角色/手写三个source提示，完整预设图/原文/原图/避碰/一次history/Quota仅保存重试有回归。专项7文件118项、当时完整check309文件3994测试通过；最新generator由上方更新，历史来源见 [空态入口验收](./research/canvas-script-presets-functional-audit.md)。无需登录/小号，历史data检查页拒绝不代表当前浏览器通过。

此前卡片批次已恢复ScriptV2横向静态三阶段、唯一打开入口、卡面拖动和状态分型，source readonly/busy与fresh raw请求门控不被旧投影绕过。按钮Space/portal隔离，多选/一次history/最后坐标、阶段保留、manual失败草稿重试及任务复制有实际回归，联合11文件208项通过；当时Node24.19.0完整check **305文件/3900测试**、格式/lint/核心strict和构建通过，日志/快照见验证历史。46计数页原生输入仍未响应，桌面/窄屏手感未验收，无新截图；该历史批次empty preset由上方最新批次补建图，显式模式/任务总线与真实服务继续有缺口。来源和实际边界见 [卡片验收](./research/canvas-script-card-functional-audit.md)，只改本机、未部署，整体目标未完成。

此前节点交互批次已替换 ScriptV2 旧图片 adapter：浮动四动作和全屏阶段共用 r3 选镜、refs 候选及 typed chips，sC 创建 vertical 空图组，成功保父编辑器/选择/视口。fresh rows 提交复核、末次 rich prompt、一次 CAS/undo、Quota仅保存重试和 owner 门控有实际 App 回归。联合12文件302项通过；最终Node24.19.0完整check300文件/3735测试、格式/lint/核心strict与构建通过，日志和准确快照见AGENTS验证入口；上一批295/3527保历史。源码、本机适配和验收范围见 [图片交接验收](./research/canvas-v2-image-functional-audit.md)。45计数页原生点击仍0，桌面/窄屏未验收，无新截图；真实服务、完整 renderer/显式 target/工具箱、退出动画及 disabled tooltip 分支仍有差距，仅本机修改未部署，整体目标未完成。

此前已接 ScriptV2 的选镜、逐镜临时时长和独立视频配置，见 [v2验收](./research/canvas-v2-video-functional-audit.md)。全局34模型与v1专用19模型分别维护；资源显示镜号不改原脚本，最小参考数逐镜判断。提交只创建空视频组，审核由可注入source提供，缺服务明确阻断。Quota只重试保存，关闭/并发变更隔离迟到审核；保存成功回画布的100ms定位不能夺走用户新选择或手势。该批联合11文件367项通过，当前快捷入口由上方记录更新，其余边界保留。

品牌约定：当前产品名称为 PenStudio；原站 LibTV 的调研证据、内容来源、版权、接口与 libtv-\* 持久化 key 保留原名。

2026-10-14 剪辑编辑器批次：专属 VideoClipNode、默认／讲解／批量广告／素材混剪四模式、真实 URL metadata／首帧准备、同一媒体 host 展开收起、来源画幅高度同步、时间轴播放／移动／裁切／拆分／轨道控制／撤销重做及素材连线差异已接入。controller 通过独立订阅发布播放进度，避免整画布逐帧重渲染；冲突支持保留页面副本、打开最新 raw、显式恢复，缺素材不自动重连。media runtime、剪辑撤销／恢复、片段字幕、转场、音量增益线与拖入素材专项通过；该历史批次检查为431文件／6353测试并通过生产构建，最新验证以文首入口为准。冷启动远端素材超过15秒时显示可重试的metadata超时，不伪造ready。真实WebAudio多轨/autoplay跨浏览器、全局字幕/转场画面/波形/帧缓存/真实导出、云锁协作、真机/Safari/高DPR/大图仍未完成；整体估算仍约70%。

当前范围：复刻前端页面、功能和交互，内容使用代表性样本并预留运营接口。当前版本默认本地工作区，无需登录；登录注册、小号与真实账号资源暂缓；真实生成、支付和其他运营写服务尚未接入。功能覆盖与差距以 [coverage.md](./research/coverage.md) 及分域审计为准。

开发和扩展方法见 [README.md](./README.md)，Canvas 所有权与模块入口见 [Canvas 维护说明](./src/features/canvas/README.md)。节点补全的模块边界和证据见 [AutoLink 审计](./research/prompt-autolink-functional-audit.md)，单个引用替换与节点资产入口见 [引用动作审计](./research/prompt-reference-actions-functional-audit.md)。分镜资产、三阶段与 CSV 的规则和差距见 [资产阶段审计](./research/script-assets-workflow-functional-audit.md)，Studio 窄屏属性证据见 [Studio 审计](./src/features/studio/SOURCE_AUDIT.md)。结构判断见 [架构审查](./research/architecture-review.md)，当前工程检查见 [AGENTS.md 的验证入口](./AGENTS.md#当前工程验证)，批次原文见 [验证历史](./research/verification-history.md)。

修改后维护所属域的说明、实际验证范围和剩余缺口；不要把组件测试、核心类型检查或本地夹具当作原站全部功能验收。

v1分镜图片组视频配置已接模型/共享参数/费用与空视频组交接，见 [配置验收](./research/canvas-batch-video-functional-audit.md)。配置不写global/group，费用/审核仅注入只读source，缺服务明确未知/阻断；Quota保留已建图仅重试保存，100ms定位不能夺走用户新选择/手势，取消与两层Escape继续共用已有协议。该批九文件220项联合及实际NodeCanvas回归通过，最新全check以AGENTS验证入口为准；当时原生浏览器输入连独立计数页也不响应，桌面/窄屏未验收，无新版截图。v2逐镜配置已由上方新批次接入，真实服务与目录图标/VIP视觉仍有差距，不声明perfect或自动发布。

普通组四角/四边尺寸调整由独立pure模型、pointer controller与view维护，取消、一次CAS/history、末次输入、pagehide和原焦点分别验收，见 [尺寸源码](./research/canvas-group-resize-source-audit.md) 与 [本批验收](./research/canvas-group-resize-functional-audit.md)。该尺寸批次完整check通过280文件/3058测试与生产构建，原生桌面已验；390px只验布局，当时原生窄屏输入未验收。非零origin、自身expandParent、特殊parent重排与真机/Safari仍缺。v1批量视频实际没有逐镜时长/选图，其配置及空视频建图契约见 [新审计](./research/canvas-batch-video-configuration-source-audit.md)，不沿旧推测混入v2功能。

普通组/脚本混合工具栏、颜色/布局/转换、选择动作 raw CAS、复制末次草稿和组下载 owner 的维护见 [组操作验收](./research/canvas-general-group-controls-functional-audit.md) 与 [接线审查](./research/canvas-ordinary-group-integration-audit.md)。普通、standalone与混合行按 source 分派，脚本运行确认不复用普通 batch；toolbox editor、character toolbar、完整 run/stop、真实服务及手机/Safari/大图仍缺，v1配置浮窗由上方新批次接入。该工具栏批次完整check通过275文件/2929测试与生产构建，桌面/窄屏原生操作及完整App入口已复验；仅当前显示组计算General资格、空闲确认不扫图，不宣称大图性能已验。本批不自动发布线上，也不覆盖独立影游任务的记录。

分镜最终提示词、本地自动拼接、覆盖/短时撤销与统一草稿保存见 [提示词拼接审计](./research/script-prompt-compose-functional-audit.md)。继续保持当前版本无需登录。

PenStudio品牌、节点选择/拖动/平移/滚动/取消的当前规则见 [节点操作审计](./research/canvas-node-interaction-functional-audit.md)；单镜媒体历史、源tk规范化与失败信息见 [媒体历史审计](./research/script-media-history-functional-audit.md)。真实服务未接部分继续按覆盖清单维护，当前版本无需登录。

触摸/双指缩放、正反向拖连、端口菜单、原子创建、source fit与手势接管的当前规则和验收见 [触摸连接审计](./research/canvas-touch-connection-functional-audit.md)。普通节点视觉反馈由后续批次接入；真实手机与完整特殊renderer继续按差距维护。

节点候选光边/倾斜、拒绝遮罩、纯投影临时连接与世界锚点菜单的当前维护见 [节点反馈审计](./research/canvas-node-feedback-functional-audit.md)。持续GPU验收使用合成PointerEvent驱动实际生产组件，原生释放/创建/撤销另验；真机与特殊renderer范围继续按差距维护。

虚拟多选外框/整体移动、锚定toolbar、独立多源拖线/六项菜单/共享target和草稿历史修复见 [多选交互验收](./research/canvas-multi-selection-functional-audit.md)。普通组输出入口、虚拟框 Alt / Meta 复制、raw CAS与精确 Escape 回焦点见 [组与选区验收](./research/canvas-group-selection-functional-audit.md)。普通节点/真实组 Alt 及组内单节点脱离、首次起拖修饰键、生成器初始化 CAS 与手势中断的后续维护见 [普通节点复制验收](./research/canvas-node-alt-copy-functional-audit.md)。普通/虚拟框两套拖动autoPan、普通组完整入组/重叠保父/完全脱组、同次末位提交和选中节点临时层级见 [节点拖动验收](./research/canvas-node-drag-functional-audit.md)。特殊组drop、真机与其余范围继续按差距维护，不能据helper/定向测试宣布全站完成。

分镜组创建、primary网格预览/换位/出组、图片派生组node/frame落点、实际membership reflow、外层grow-only扩壳、空槽补图与提交后通知见 [分镜拖动验收](./research/canvas-storyboard-drag-functional-audit.md)。最终245文件/2486测试和生产构建通过；1280×720与390×844原生拖动、菜单焦点、补图和刷新恢复已验。当前是本机工作区更新；既有公开部署版本须单独发布，不能混淆源码验证与线上产物。

独立分镜组比例/宫格、序号、确认清空/转换、真实2K/4K PNG、本机保存失败及标题拖动/双击的当前维护见 [设置验收](./research/canvas-storyboard-group-controls-functional-audit.md)。设置pure计划、异步owner、graph CAS与立即flush分别维护；浏览器本机结果不能称远端上传。检查统计与中间失败统一存入验证历史。

上述设置历史批次2026-10-12冻结后完整check通过268文件/2796项及生产构建；已修复ready出现后旧passive cleanup取消首拖的生命周期问题，保留立即观察压力回归和全部旧断言。此记录不覆盖随后普通组批次的修改；strict仍只覆盖核心，CI未远端执行，当前版本未因本批自动发布线上。
