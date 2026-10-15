# PenStudio 前端：协作约定

## Vercel 当前生产与互动影游（2026-10-14）

当前生产 [PenStudio](https://penstudio-libtv.vercel.app/) 为 `dpl_3wkfrjAvEnsqBEYeDWkieUkEHm6V`，READY；不可变地址为 `https://penstudio-libtv-q38yqyrt3-bins-projects-795df2ea.vercel.app`。独立 [影游编辑器](https://penstudio-libtv.vercel.app/interactive-film) 与 [LibTV 风格匿名示例](https://penstudio-libtv.vercel.app/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3) 已上线。此次发布来自当前工作区，Node24.19.0完整check通过420文件/6261测试、格式/lint/核心strict/构建，日志 `artifacts/current-deploy-check.log`；生成包日志为 `artifacts/current-vercel-prepare.log`，不能沿用更早冻结候选的检查数字。

产物2621文件/89,998,819字节，保留4个Functions/config/routes，按90 MB目标、95 MB硬上限prebuilt发布；原public/不裁剪、不采集。三个新增大媒体使用已记录的原始公开CDN URL，其他样本与许可证闭包保留。影游发布使用Public Blob及服务端管理口令/HMAC，编辑与观看无需登录；当前首页、`/animation-preview?newProject=true`、互动影游编辑器、匿名试玩和四个Function路由已在线复验。实际证据及真机、跨设备创作同步等剩余边界见 [部署记录](./research/vercel-deployment.md) 与 [影游审计](./research/interactive-film-audit.md)。原生成、支付、认证和运营写服务继续未接，原站整体复刻目标未完成。

## Vercel 历史代表性部署（2026-10-11）

该批公开样本前端部署至 https://penstudio-libtv.vercel.app/，项目 `bins-projects-795df2ea/penstudio-libtv`。免费套餐采用 `npm run vercel:prepare` 的独立 `.vercel/output`，保留全部编译页面与必要许可证、代表性真实内容及作品各自快照；不裁剪原 `public/`，不重新采集。打包目标90,000,000字节、上限95,000,000字节，超限停止。使用 prebuilt 发布，不把普通完整 `dist` 直接上传免费套餐。

初次发布为21:54:56已完成232文件/2140测试、格式/lint/核心strict/构建检查的冻结产物；随后并行编辑器源码的格式失败不能记为当前工作区检查通过，后续源码部署先重新跑完整check。线上30深链及41访问检查、最终9复验、真实作品134节点预览、资产刷新与390px布局已验；具体部署ID、远端素材依赖和范围见 [部署记录](./research/vercel-deployment.md)。静态本地工作区、真实服务未接入及整个复刻目标未完成的边界保留。

用户随后要求移除自动弹出的广告：全局1500ms促销触发、广告渲染、dismissal写入与专属样式已从源码删除。该批生产版本是上述已验证发布包的广告热修补，仅改入口JS与CSS，其他1478个产物文件不变，避免混入正在编辑的Canvas源码。shell的7项回归及本次文件定向格式/零警告lint通过；独立源码副本的全量检查未通过，不作为本次发布来源，也不能记为当前全量check通过。后续正常源码发布仍走完整check与vercel:prepare，不延续产物热修补流程。

## 目标与判断标准

复刻 https://www.liblib.tv/ 的所有前端页面、功能和交互。2026-10-10 用户明确修正：内容无需完整复刻，后续由服务器运营；采用代表性真实样本验收功能，不再全量采集作品、Skill、视频或画布。以原站实际界面、路由和交互为依据，不得用通用设计取代原站布局，不得将尚未核对的功能标记为完成。

## 证据与目录

- `research/source/` 保存公开页面和脚本调研证据，不直接作为生产应用运行。
- `research/routes-source.md` 记录从公开客户端发现的路由与登录门槛。
- `research/secondary-ui.md` 记录次级页面的浏览器观察。
- `research/assets.json` 记录原站素材来源与本地文件对应。
- `public/data/` 保存公开内容的结构化快照。
- `public/assets/` 保存复刻用素材。
- `src/` 为独立、可维护的前端实现。

## 实现约定

1. 页面和状态先调研后实现；原站隐藏或登录后界面须标明证据范围。
2. 尽量使用原始素材、原文案、原尺寸和色值，禁止以占位图代替已可获取的素材。
3. 前端路由支持直接访问、刷新、前进/后退；列表筛选、搜索、弹窗、菜单与滚动行为需要可操作。
4. 项目、画布、收藏等演示状态保存在浏览器本地；不得发送登录信息、消费请求或写入原站。
5. AI 生成与支付依赖服务端，前端必须准确呈现状态与能力边界，不假冒完成真实生成或支付。
6. 原站脚本只用于调研，不运行其遥测或生产写入逻辑。
7. 验证桌面及窄屏布局，处理 Escape、弹窗遮罩、键盘焦点和关闭恢复。
8. 批次完成后更新此文件与覆盖清单，记录实际验证结果与剩余差距。

## 路由清单与证据状态（2026-10-10）

公开浏览器及源码核对：`/`、`/show`、`/detail/:uuid`、`/profile?uuid`、`/skill`、`/3d-box`、`/project`、`/assets`、`/blender`、`/plugin`、`/academy`、`/activity`、`/activity/:id`、`/feature-updates`。

源码发现且页面入口已注册：学院 article/tutorial/masterclass/course/practice/product 详情、`/canvas`、`/canvas/share`、`/canvas/chat-share`、`/canvas/import/blender`、`/animation-preview`、`/skill/create`、`/skill/share`、`/mcp/authorize`、`/seedance-verify`、`/home_page`。

原站 `/en` 前缀重定向到中文路由，`/forbidden` 无状态返回首页。`/transaction`、`/calculation`、`/debug` 及旧 sitemap explore/community/events 路由为原站 404，不应擅自创造页面。开发者入口指向外部飞书文档。

## 当前实现与验证

- React + Vite 本地应用已可运行，首页、作品筛选/搜索、Skill、项目/资产本地状态、详情及用户主页、会员弹窗已实现；自动促销弹窗已按用户要求移除。当前默认本地工作区，历史登录视图不作为运行入口。
- 次级页面包括学院、活动、更新、CLI 插件、Blender 及详情；工具路由的页面入口已注册，具体功能缺口见 `research/coverage.md` 与分域审计。
- 公开数据已足够作为代表性功能样本。全量内容采集已按用户要求停止；额外采集文件待归档，不应使首屏和构建承担全部内容。原图、字体、SVG 图标、规则和教程可作为视觉验证样本。
- 作品创作过程保留原详情 URL，以全屏只读画布显示对应作品真实快照。不能用一个示例冒充所有作品快照。
- 当前版本按用户要求无需登录。App 使用 `services/workspace-access.ts` 的稳定本地工作区 actor，画布、Studio、项目、资产和 Skill 可直接操作；不读取或写入旧 `libtv-user` 会话，不提供登录、注册或退出入口。actor 不含账号 token、会员或团队权益；不得当作服务器认证。
- 最新工程检查结果见下方批次记录，随后修改须重新检查。逐页浏览器结果与实际差异存入覆盖清单及分域审计，不把构建成功等同于原站全部交互验收。
- 用户最新要求：登录注册暂时不用，也不使用小号或账号资源。真实认证接入与原站登录态校验延期，不能作为当前工作的推进条件；历史登录视图保留源码，但当前 App 不加载或展示。
- 未核实的编辑器/团队/付款状态必须明确记录，不得宣称“完美复刻”或将整个目标标记完成。

## 开源组件

优先使用原站可核实的开源基础库（如 Media Chrome），保留相应许可证。复杂组件以对应原站交互为验收标准，不以组件默认样式替代原站样式。

## 最新范围与服务接口

- 用户要求“所有功能这类得完美复刻”，内容不是完整性验收指标。禁止继续将无限采集当作前端进展。
- 保持各路由与状态、模型与参数选择、创作/保存/分享/权限/错误/空态/加载态/付款前状态完整。
- 内容访问、登录、项目、资产、生成与订单以服务接口隔离；开发样本与本地演示保留，未来可以连接运营服务器。
- 目前不要求用户登录、注册或提供小号，不使用真实账号资源。未来用户重新提出认证需求时，再安排服务接入与登录态核对。

## 工程结构优化（2026-10-10）

用户已授权直接优化工程结构。此前只读审查作为历史证据保存在 `research/architecture-review.md`，以下为重构后的约定：

- `App.jsx` 仅协调 route、shell 和全局弹窗；路由匹配/地址订阅/lazy 页面入口放在 `src/app/router/`，外壳和全局 UI 分别放在 `app/layout`、`app/overlays`、`useAppUI`。
- 页面按业务域放在 `src/features/`，各域包含页面、组件、hooks、模型、持久化和样式。旧 `pages/`、`data.js` 及部分组件路径仅为兼容出口，新模块直接引用所属域。
- 内容 JSON 统一使用 `useContent` / `loadContent`；请求、缓存、素材映射、浏览器存储和运营 API 契约集中在 `services/`。新页面需提供加载、错误、重试状态，禁止散落 JSON 请求或浏览器存储读写。
- Core TypeScript 使用 strict 校验；现有 JSX 暂保留，不能把核心类型检查描述成全部 UI 类型覆盖。项目/资产/编辑器等写入仍是本地演示，真实服务器接入须在业务 repository 完成映射后验证。
- 画布和 3D 编辑器拆分文档加载/保存、历史、键盘、视口生命周期和视图组件；公共弹窗通过 `useDialogBehavior` 管理焦点、Escape 和滚动锁。
- CSS 拆分保留原级联顺序，顺序清单统一在 `main.jsx` 导入。不要按照懒加载次序重新导入旧覆盖；新规则使用业务域前缀，跨域改动同时验证桌面和窄屏。
- Prettier、ESLint、核心类型、Vitest 和生产构建通过 `npm run check` 统一运行；检查不通过先修复，禁止为迁移随意关闭规则或宣称所有原站功能已验收。
- 当前样本约 924 MB；1,232 个未引用文件约 102 MB 已可恢复归档。`assets:audit` 默认预览，`assets:archive` 只移到研究目录并保存恢复记录，不删除文件。不继续全量抓取内容。
- 开发、扩展路由、接口契约、持久化升级、样式与归档流程见 `README.md`。文档必须区分已验证能力、演示能力和真实服务未接入部分。
- 登录注册、原站登录态、小号及真实账号资源继续延期。这次优化未改变原目标的证据范围，也不能将整个复刻目标标记完成。

后续边界收敛（2026-10-11）：`npm run lint` 内置 `scripts/architecture-rules.mjs` 的 `architecture/import-boundaries`。services 禁止引用 UI/hooks/features/app/pages 或旧 data.js；共享 components/hooks 禁止引用业务内部或旧聚合入口；feature 禁止反向引用 app/pages，以及跨域私有模型、组件和 hooks。已登记的小型公开入口和确切兼容 re-export 保留。静态/lazy/re-export/无插值模板路径均检查；新增跨域协作先提取协议或小型入口，不能直接扩大整个域白名单。

域内约束同时覆盖 `features/*/domain/` 及约定的 `model` / `*-model` / `schema` / `geometry`：禁止反向引用 React/UI库、hooks、JSX视图和CSS。controller 持有生命周期，模型接收数据/服务；Three纯数学和小型文档API可用。不能把模型放回大页面来绕过规则。Node版本遵守`.nvmrc`与package.engines；GitHub CI配置与本地同跑`npm run check`，官方actions固定commit；尚未远端运行时必须明确区分配置落盘和CI已通过。

共享 Skill UI 位于 `components/skills/`，纯规则位于 `services/skill-presentation.js`；Mine 卡片通过状态/动作插槽包装公共卡片，私有权限不进入共享目录。Skills 页的输入视图与状态分为 `SkillComposer` / `useSkillComposer`，同 pathname 的参数消费不能重建编辑器。紧凑选择器 Escape 恢复 Skill 触发器；外部 pointer/focus 关闭不能抢走新焦点。资产和 Studio 跨域写画布只引用 `features/canvas/document-api.js`，该入口不能导出 UI/hooks 或引入重型编辑器。

## 编辑器稳定性与共享协议

2026-10-15 转场操作后续：工具栏只开库，三种可见效果、独立切点选择、属性时长/删除、历史/CAS、宽度记忆及非 modal Escape 已接。中间片段应用前方切点；数值必须遵守先一位小数、再正数默认2秒、最后相邻限幅，0不可直接变0.2。属性预览用双冻结原生视频、40ms/1600ms循环和固定网格CSS遮罩，不能复用主预览GPU burn；纯规则/runtime/视图分离，原生读取共用native-media。来源、真实GUI、修正过程及剩余范围见 [转场操作审计](./research/canvas-transition-controls-functional-audit.md)。最终专项20文件/475项通过，完整检查以下方当前工程验证为准。

2026-10-15 转场维护：canonical `clip.transitionIn` 的四种画面预览已接入。纯窗口/时钟放在 `clip-editor/domain/transition-playback-model.js`，Canvas/WebGL renderer 独立维护，runtime 持有两路静音视频并沿现有事务准备/取消/清理；禁止通过重写普通片段/音频时钟实现转场。没有 GPU、帧不可读或原生速度不支持时显示真实错误；旧 transition 协议仍明确 unsupported。专项及实际 Chromium GUI/像素/390px 证据见 [转场预览审计](./research/canvas-transition-preview-functional-audit.md)，不能延用前批“所有转场预览都缺失”的判断，完整库/属性面板、字幕层级与导出仍未完成。

2026-10-15 前批源码验证（转场实际预览接入前）：剪辑器已补片段复制/粘贴，Feature Updates 已补分页续载，Studio 灯光菜单已拆分为 Sun/Point/Spot；懒加载测试的冷启动等待已收敛到 3 秒。当时 `npm run check` 通过 **433 个测试文件／6366 项测试**，格式、零警告 lint、核心 strict、Vitest 与生产构建全部通过，历史日志为 `artifacts/pre-transition-full-check.log`。此前批次中的 431/6353 仅保留为历史记录。

- 跨域创作引用协议放在 `services/agent-handoff.js`；Canvas 不导入 Skill 内部实现，旧 Skill 路径仅作为兼容导出。更改 parts/version/source 格式必须同时核对两侧和保存后恢复。
- Canvas 收到 session 交接后先持久化再消费；失败保留暂存。复制/导出携带 agentDraft；普通未发送提示词也保存。禁止用拼接提示词代替媒体/模型/Skill 引用。
- 自动保存仅写已加载的当前文档；退出/pagehide 刷写 pending。删除项目必须取消 pending，禁止由 cleanup 保存重新创建已删除项目。加载中不允许复制空文档或编辑随后被覆盖的数据。
- 所有叠层弹窗和嵌入画布共用 dialog-stack；只有顶层隔离背景、处理 Escape/Tab，不能另建独立 body overflow/inert 生命周期。媒体 controls 必须能用键盘到达。
- GLB 来源保存在文档，恢复通过 GLTFLoader，异步结果检查实体生命周期，卸载释放资源。不能用默认几何替代已导入模型。Draco / Meshopt 解码和导入动画 clips 已由下方批次更新；外部资源、KTX2 及完整编辑器工具仍缺。
- 最新细项与明确差距见 `research/editor-functional-audit.md`、`research/skill-functional-audit.md`、`research/secondary-functional-audit.md`。课程 course/practice/product 已找到独立 source renderer 并注册页面；匿名骨架、401/403与商品错误按证据实现，不能把本地 adapter 的正向测试当成私人课程授权。跟练 Canvas、进度/订单写服务与部分播放器形态仍缺，见 `research/academy-course-functional-audit.md`。

## 资产、评论、Blender 与焦点维护（2026-10-11）

- 资产库使用 `services/asset-library/model.ts` 的纯模型和 `hooks/useAssetLibrary.ts` 的持久化边界。规范 key 为 `libtv-asset-library`、version 1；资产、文件夹和标签在同一文档中原子提交，禁止恢复为多 key 独立写入。旧 `libtv-assets` 不删除、不覆盖；规范文档有效时优先使用规范文档，没有规范文档时必须保留并显示旧数据读取/格式错误，不能把错误当空库继续写入。
- 同标签页和跨标签页变化通过统一 storage 订阅同步。controller/upload hooks 协调 views，筛选、选择、层级、移动、删除和标签规则留在纯模型；外部更新后按当前库校验选择和目标 ID。写入/配额失败保留上次有效状态、当前表单和已读取文件；部分成功不关闭并丢弃失败队列，重试不得重复保存成功文件。文件名编辑按唯一上传 ID 绑定；取消/卸载中止 reader，忽略迟到回调。
- 学院评论分层为 model、source repository、异步 hook、views；页面按真实 source capabilities 和 props 展示功能。大师课固定 `maxCommentLength=200`、`defaultSort=latest`、sort/top false；虽然 source.dislike 方法存在，`showDislike` 默认 false 且页面未启用，因此不展示点踩。共享组件 500 字默认值、排序和置顶分支不代表大师课页面能力。没有 authorUuid 不猜测作者；没有公开评论正文不注入假内容，合成夹具只用于测试。写操作明确本地保存，不冒充服务器发布或审核。
- Blender hook 在 idle 后动态加载 runtime，保证卸载/失败后迟到 import、贴图和媒体不会重建场景。RAF、ResizeObserver、可见性/pointer/context 监听、视频/纹理、几何/材质、反射/模糊 render targets 必须按所有权释放；保持隐藏页面暂停、reduced-motion 和失败海报回退。保留 `features/blender/LICENSE.drei.txt` 的 MIT 许可，不以 ready 属性或无日志替代真实 GPU 图像验收。
- 公共 dialog hook 在 autoFocus 提交前记录 opener，嵌套自动聚焦、StrictMode effect replay、再次启用和关闭回焦点共用 dialog-stack。不得以删除输入框初始聚焦来掩盖生命周期问题；修改 stack 必须回归已有 preview 下打开编辑弹窗、逐层 Escape 和返回原控件。只有顶层可处理焦点循环/背景隔离，不增加独立滚动锁。
- 分域证据与边界见 [资产库审计](./research/assets-functional-audit.md)、[Blender 审计](./research/blender-functional-audit.md) 和 [次级页面审计](./research/secondary-functional-audit.md)。真实认证、评论/资产等写服务、生成、支付和审核仍未接入；使用本地夹具验证不代表原站账号或服务器状态已验收。

## 共享输入、Skill 管理与学院维护（2026-10-11）

- 跨域输入 UI 位于 `components/agent/`，有序 parts 编解码与草稿 readiness 位于 `services/agent-content.js`，模型/Skill 公共候选位于 `services/agent-catalogue.js` / `agent-model-catalogue.js`；Canvas 禁止引用 Skills 内部实现。旧路径仅兼容导出，不另维护重复目录。
- TipTap 固定 3.31.4 并保留 MIT。每个引用 occurrence 的 `referenceKey` 独立、稳定；复制重复节点须正规化，删除只删该 occurrence。媒体在光标处先插 pending，完成后更新原节点；批量插入使用一个事务。同步 controlled parts 和上传清理调度到微任务，避免 React 生命周期内 flushSync 或中间编辑状态误取消同批 reader。卸载、移除或输入失去 readiness 必须中止读取，迟到结果不回插；当前本地工作模式不要求登录后重试。
- Skill 同 pathname 的 query 消费保留编辑器身份和输入，其余参数与 hash 保留；不能依靠重挂载清理参数。RouteOutlet 和实际 TipTap 的回归同时检查同一分享参数再次进入。
- Mine 保留 `libtv-created-skills` 数组，软删除使用 `localDeletedAt`；本地发布仅保存 version 1 blocked 的 `localPublishRequest`，不能篡改 auditStatus/currentSnapshotId/templateUuid。团队非本人和 Pending 的按钮按已确认 owner 状态门控；源菜单未确认撤回，不创造此操作。创建树保留旧正文与 `skillDirectories` 本地元数据，导入/配额失败保留原草稿。
- 学院 course/practice/product 是独立 renderer；Product 为 chrome 外壳。repository 默认仅加载公开代表性内容，有权限正向分支通过 adapter 接口验证，不伪造已购/解锁。课程会员全屏规则要覆盖公共 Modal 的 max-width/border/padding，不能仅设置 width；保留 source 的四卡横排及窄屏 scroll-snap。
- Studio 转画布必须先写成功再导航；配额失败保留场景和当前弹窗，提示后允许重试。GLB、资产和其他持久化约定继续适用。
- 新证据见 [共享输入审计](./research/agent-inline-functional-audit.md)、[学院审计](./research/academy-course-functional-audit.md) 和 [创建树审计](./src/features/skills/create/SOURCE_AUDIT.md)。登录注册、原站账号资源继续暂缓。

## 本批模块化维护（2026-10-11）

- 创建编辑器实际使用 TipTap 和 CodeMirror 6，旧“Monaco”判断已由单个原 lazy chunk 证据纠正。编辑器、Markdown 配置、纯 diff 与 CodeMirror 扩展分离；手动创建页默认不启用 diff。未编辑正文不重写，编辑后的 Markdown serializer 可能规范化空白/转义，不能宣称逐字节等同原版。每文件/模式光标、全屏和本地保存共同验收；MIT 副本与版本表在 create/licenses。优化服务未接入时明确报错并保留内容。
- 资产选择器采用可注入只读 source、strict TS 分页模型/hook。`Collection.list` 透传 AbortSignal，20 条分页与 300ms 搜索；游标缺失/循环、取消、迟到结果和同页失败重试保留已载入记录与选择。它不是原站 page/total API 的直接包装，也不代表团队/主体资产和写服务已接入。
- 学院 player 的控制栏、设置/目录、浮窗、视口、冻结帧分开维护；媒体 DOM 不因浮动重建，观察器/frame callbacks/Canvas 和 fullscreen 等异步生命周期随事务取消。教程目录已接 VideoPage，本批时课程章节 drawer 尚未接 CoursePage；后续已接入，更新见下方 Canvas/课程维护记录。手机 UA 横屏及 Safari 仍未实测。
- Vite 显式预构建新编辑器依赖，避免开发时首次切换 lazy 代码模式触发依赖发现刷新；这不取消生产按需分包。富文本 white-space 使用 pre-wrap 满足 ProseMirror 编辑条件。结构改动后测试、浏览器和维护文档必须一起更新。

## Canvas 入口、消息与课程接线维护（2026-10-11）

- CanvasSkillSelector/useCanvasSkills 负责当前输入的 Skill 入口，复用公共选择器与详情，不导航另一个输入页。插入保持光标和独立 occurrence；完整列表/详情复用 dialog-stack，逐层 Escape 回原控件。共享本地 Skill 验证位于 services/local-skills.js，损坏数据、软删除和审核状态不能误当可用空库。
- useCanvasMentions 将实时节点、项目 ID 和视口交给 services 的纯候选规则；菜单开启时固定视口顺序，搜索使用当前节点，追加每次3项。节点重命名/删除刷新候选；pending/blob 不进入可用引用。本地完成媒体仅以明确 localMediaReady 标记允许 data URL，不表示服务器上传成功。共享 RichAgentInput 不直接读 Canvas 私有 store。
- 发送保存完整有序 parts；CanvasAgentMessage 和 ChatReplay 共用只读正文模型，不能改回纯文本加末尾分组。消息、草稿、节点和视口同次保存，复制/分享/导出携带对话。公开聊天 messages 与本地 snapshot.messages 读取层级不同；切项目前刷写原 key，损坏或无法读入的文档阻断覆盖。历史 refs-only 不猜已丢失的位置，历史公开生成消息不能冒充本地新生成。
- CoursePage 已接横屏 topbar/章节 drawer，权限与桌面目录共用 available 规则。新章节先保存实际位置，同节不重复切换；完成确认刷新 TOC 保留当前 video，2秒 hold 后交给已有下一节门控。进度仅在有效用户/章节且 caller repository 提供 writer 时启用，默认公开快照无 writer；旧章节迟到结果不能改变新章节。当时课程营销与总跟练入口尚未接线；本批更新见下方。真实手机 UA/Safari/native fullscreen 和授权跟练内容仍需另验。
- 本批边界见 [Canvas Agent 审计](./research/canvas-agent-fidelity-audit.md)、[节点提及审计](./research/canvas-agent-mentions-audit.md)、[只读消息审计](./src/features/canvas/messages/SOURCE_AUDIT.md) 和 [课程接线审计](./src/features/academy/course/SOURCE_AUDIT.md)。登录注册、原站账号、小号资源及真实生成/写服务继续延期，整个复刻目标仍未完成。

## 共享素材、节点展示、工具栏与课程状态（2026-10-11）

- 公共资产选择器迁至 `components/agent/AgentAssetPicker.jsx`，纯模型与分页 hook 在 `services/asset-picker/`、`hooks/useAssetPickerPages.ts`；旧 Skills 路径只兼容导出，不维护第二份实现。保持分页取消、搜索和选择语义，不扩大依赖白名单。Canvas 的素材入口只协调共享选择器、Agent 上传和当前光标插入；v2 转换与每种 20 项批次上限在 `services/agent-assets.ts`。预览不选入，超限不关闭，文本回退不解析 HTML。当时缺少的目录、文本及团队筛选协议已由下方批次更新，真实团队权限与主体管理仍缺。
- 模型入口和手动/自动生成模式是两个独立协议：模型插入合法 model part；mode 不改 ordered parts，按用户默认→session metadata→本地 override 解析。Canvas 本地 `agentConfig` 随文档保存、复制、分享和导出；发送 metadata 携带 dryRunIntent/scriptModel。不要把 Canvas 会话切换误写为用户默认，不把 VIP 图标当授权。真实偏好/权益同步、会话 PATCH 与生成服务未连接。
- `useAgentToolbarPopover` 统一菜单定位、计时器和外部 pointer/focus/scroll 关闭；非 modal 菜单不锁 body，Escape 回 trigger，外部关闭不抢新焦点。素材选择器开窗前回稳定加号，成功插入在弹窗关闭后聚焦输入；所有嵌套预览继续共用 dialog-stack。
- `components/agent/AgentNodeReference` 和 presentation context 是输入与历史消息共用 UI，`services/agent-node-presentation.ts` 为纯解析，Canvas hook 注入实时文档上下文。改名同步展示、不重写 parts；已确认删除节点保留原名、降低透明度并提示“节点已删除”，加载阶段不误判删除。点击当前节点只做 300ms fit，保持原选择；readonly 可定位，share replay 使用当前快照节点。没有完整跨项目 adapter 时不提供假定位动作。
- 课程营销分为纯规则/限频、可注入 repository、异步 hook 和 UI；未知会员权益不能当非会员。完成 popup 优先 half，再 first；popup 开始后本节保持 deny，切节及 A→B→A 必须清旧 takeover/分钟提醒。营销和会员复用 fullscreen portal/dialog-stack；总跟练首次介绍记忆与 lastPracticeNodeUuid 新窗口入口独立维护，不能伪造授权 Canvas、购买或进度服务。
- 源契约与剩余边界见 [素材入口审计](./research/canvas-asset-toolbar-audit.md)、[工具栏审计](./research/canvas-agent-toolbar-audit.md)、[节点审计](./src/components/agent/NODE_SOURCE_AUDIT.md) 和 [课程审计](./src/features/academy/course/SOURCE_AUDIT.md)。真实认证、账号资源继续按用户要求延期。

## 参数、消息动作、素材 source 与 GLB 动画维护（2026-10-11）

- 生成器纯规则在 `canvas/generator/schema.js`，UI 与 inspector / submit 分开。字段使用 schema 的 originalField 和 typed enum，模式 / count / 冲突 / override / 条件可见 / prompt 校验不得另写一套硬编码；inspector 与生成前共用 resolver。模型切换清除目标模型不支持的旧 modeType，默认模型回退一致。原配置的参数保存在既有 Canvas 文档；真实生成仍明确未连接。该批尚未接媒体模式、音色条、媒体规格与 locked settings，后续实现与范围见下方记录。
- 消息动作放在 `canvas/message-actions/`；用户复制实际正文 innerText，助手仅在明确完整轮的最后一条提供原 Markdown 复制。Panel 按本地完成 transcript 分组，不能用于未来流式消息完成判断；新本地消息保存稳定 ID / createdAt，旧无时间消息不造时间。readonly / replay 用户仍可复制，助手动作受权限门控。剪贴板服务保留 native→legacy 失败处理、取消和焦点 / 选区恢复；source-session 的 UI 与动作共用完整 guard，没有真正 switch adapter 不提供假跳转。
- 素材选择器专属只读契约在 `services/asset-picker/source.ts`；目录、标签 / 成员过滤、文本内容、scope / teamId 和固定 created_at_desc 由 adapter 提供，不能扩大通用资产写契约。默认 personal，team 只由明确 caller 传入，UI 不创造账号 / 团队切换。搜索全库，非空标签清目录路径；选择 / 预览模式按源隐藏主体库。Canvas / Skill 共用 pickerAssetReferences / pickerAssetText 与每种20项 incoming batch 规则，媒体优先，只有无媒体时插入纯文本；成功关闭后回输入焦点，拒绝保留选择与内容。
- Studio 动画纯 metadata / 恢复、实际 mixer / seek / export binding、GLTFLoader / 解码生命周期各自独立。原 GLB 保存并恢复 clips，选择片段再点恢复全部；导出包含全部动画和隐藏模型，按 UUID 绑定避免多模型同名轨道错配。Meshopt / Draco 只使用已安装 Three 的官方解码资产、按需加载，parse finally 释放 decoder workers。动画 metadata 不是烘焙 wrapper 手动关键帧；外部纹理 / KTX2、完整运镜和视频导出继续另验，许可位于 studio/licenses。
- 源契约与差距见 [生成器审计](./src/features/canvas/generator/SOURCE_AUDIT.md)、[消息动作审计](./research/canvas-message-actions-audit.md)、[素材 source 审计](./src/services/asset-picker/SOURCE_AUDIT.md) 和 [Studio 审计](./src/features/studio/SOURCE_AUDIT.md)。该批将高级数字 blur 误判为舍入，后续按直接源码证据纠正：普通数值先限幅再零基准舍入，高级数值仅限幅并保留小数；下方使用原 Slider 库替换 native range。

## 媒体生成器、异步读取与 GLB 子树维护（2026-10-11）

- `canvas/generator/node-generator.js` 是 inspector / submit 共用入口，`media-input-model.js` 管理真实参考、模式候选与规格、模板 schema / 模型门控及锁定参数。保留合法且可用的当前模式，其他情况按已核实规则推断；普通模式效果的全部源调用顺序仍未核实，不能仅凭纯模型测试宣称一致。清空 prompt 不得用旧 text 复活。缺少 schema 时保持原 params，禁用依赖配置的编辑与生成；models 由 `useContent` 独立提供加载、失败与重试，不能把模型失败当文档加载成功后空参数保存。
- 媒体尺寸 / 时长 / 大小必须来自匹配当前 URL 的资源 metadata、实际 video 元数据或明确 HEAD Content-Length，不能用画布节点盒子、显示时长或 MIME 猜格式。`services/media-metadata.ts` 与 generator hook 负责只读探测、取消、超时、部分成功和重试。未知必需项保持未验证；真实视频生成、上传和费用服务未接入。
- `services/browser-file-read.ts` 提供可取消 FileReader；`canvas/domain/uploads.js` 将实际 File.name / File.size / File.type 和读得的 URL 写入 resourceMeta。Canvas 提交上传结果前检查当前文档、取消状态，并对最新 nodes 追加，不能用读取前的 nodes / edges 覆盖期间的编辑。切项目和卸载中止在途读取，迟到结果不插入；文本按 UTF-8 读取，坐标 0 不能当缺省值。
- `GeneratorNumericSetting` 使用已核实原站库 Mantine Slider；当前固定 9.7.1，原站版本未知，保留 MIT。局部 Provider / Slider.css 不安装全局 reset、偏好存储或改根节点主题。拖动只预览，结束才提交；普通 blur 先限幅再零基准舍入且不二次限幅，高级 blur 保留真实小数、显示按 step 精度格式化。
- 音色视图 / 纯模型 / source / 分页 / 试听分别位于 `generator/voices/`。运营只读目录可注入 list / filters；ID 和 `_${storeKey}_meta` 同次保存且保留其他高级参数。切 source / 禁用 / 关闭 / 卸载隔离迟到读取并停止旧试听；收藏、克隆和删除缺 writer 时保持明确不可用。默认只用代表性公开音色，不收集账号资源。
- Studio `outliner/` 的纯树模型、真实 GLB scene-tree、视图与 viewport 命令分离。子节点路径稳定，以 nodeEdits 本地恢复改名 / 隐藏 / 静态 transform；动画绑定转换为 UUID，改名不能破坏 clip。导出保留改名、静态变换和全部原 clips；GLB 不编码 visible，隐藏只属本地文档状态。没有源证据的 wrapper 手动帧不能冒充已烘焙动画。
- 最新源码与边界见 [生成器审计](./src/features/canvas/generator/SOURCE_AUDIT.md)、[媒体规则审计](./src/features/canvas/generator/MEDIA_SOURCE_AUDIT.md)、[音色审计](./src/features/canvas/generator/voices/AUDIT.md) 和 [Studio 审计](./src/features/studio/SOURCE_AUDIT.md)。该历史批次尚缺 batch / 节点内嵌视觉、运镜 / 镜头；后续进展以下方记录为准。视频导出、手机 Studio 属性操作及真实写服务继续未完成。

## 画布草稿 / 分组 / 多选与相机维护边界（2026-10-11）

- 分组纯规则留在 `canvas/domain/groups.js`，持久化节点 position 相对 parent；选择、边线与小地图用世界坐标，不能重复移动已选祖先的孩子。普通多选布局与组内布局的间距、默认尺寸和排序不同。解组和 raw 删组释放剩余孩子时保留世界位置；运行 UI 删除 group／video_group 沿 parentId 删除整子树，不能混用该保留规则；复制选择孩子按原规则扩大至父组与兄弟，并重映射 parent / childNodeIds / 内部边。
- Pointer 生命周期由 `hooks/useCanvasPointer.js` 负责，记录 documentKey，切文档、切只读和失去 ready 取消旧手势。不要让迟到 pointermove 将旧坐标写入同 ID 的新文档。
- `generator/useNodeGenerator.js` 统一 Inspector / inline 的参数边界；初始化、真实 incoming 引用 identity 或 model 改变才能同步媒体推断。显式参数修改及提交不默默切换 mode；缺 schema 保留原参数。extraConfig、picture / segment 锁与已知模式保护按源维护，不能编造缺失的模型支持列表。
- Node prompt 与 Agent parts 不混用。媒体 token 按当前有序引用列表的 1-based index 绑定，未知 token 保留原文；基础当前参考菜单和原站增强画布候选建议分开记录。`NodeGeneratorPrompt` 的 DOM / controller / mentions / keyboard 分模块，flush 返回当前序列化值，getValue 只读，cancelPending 取消定时器。跨 session 取消旧 draft，IME 和 readonly 不误提交。
- `hooks/useCanvasDrafts.js` 注册当前节点草稿，并在 autosave flush 纯投影同 storageKey 的有效节点。立即卸载 / pagehide 必须包括最后 150ms；保留草稿只在 basePrompt 与待保存节点一致时合并，外部新编辑优先，删除节点不复活。retained草稿在合入新state / 删除节点 / 成功保存ack后消耗，不能在undo/restore后再次复活；Quota失败保留可重试草稿。复制 / 本机分享 / JSON与文本导出都走同一getSnapshot投影。不要仅在unmount setState后假定存储已更新。
- 普通多选工具栏、普通组执行计划和分镜组批量参数不是同一界面。`batch/model.js` / runner / useCanvasBatch 与 views 分开维护；运行器分层执行依赖，失败跳过后代但不跳过无关项，取消和文档身份阻止迟到写入。没有 executor / 费用 source 时明确 blocked，undefined 不能当成功。
- 多选保存复用资产 canonical library，一次原子提交多个独立 v2 资产与标签；无实际内容的生成器 / 组不存为假资源。名称、位置、Quota 重试与损坏 legacy 防覆盖有组件回归。本地根目录 fallback 是适配，不能称原站 folder cascader 完整一致。
- ZIP 服务 `services/download-archive.ts` 动态加载 fflate 0.8.3 / MIT；取消清理 fetch、reader 和 ZIP worker，不发布失败部分文件。水印服务缺失则阻断该下载，不能自去水印。容量上限和本机保存属于适配，不是源权益规则。
- Studio camera 的 model / presets / scene / restore / runtime 与 hook / views 分开维护。六个可见预设和六个 easing 卡片按源（实际四种数学映射），CatmullRomCurve3.getPointAt 与世界→父级姿态变换用于实际 camera。30fps、≤2000 sample / ≤600s 等导出边界见域审计。没有 path extras 的已有 camera clips 不因打开面板改写，只有实际编辑才替换对应相机轨道。
- 相机轨道、原导入 clips、nodeEdits 和稳定镜头 IDs 都需实际导出回读，不能只检查 metadata。监视器 thumbnails、手机 Inspector、部分 PIP / 快捷分支、通用 wrapper 帧、视频生成和真实多人服务仍未完成，不能因此宣称全站 perfect。

本批源码、适配与浏览器证据见 coverage / canvas-inline-generator-source / batch SOURCE_AUDIT / Studio SOURCE_AUDIT；登录注册及小号资源继续暂缓。

## 工程协调层维护（2026-10-11）

- NodeCanvas 入口由939行收敛为712行；节点创建 / patch / 连线 / 校验 / 上传在 `hooks/useCanvasNodeActions.js`，Agent恢复状态与动作在 `useCanvasAgentController.js`，草稿快照 / 复制 / 分享在 `useCanvasSnapshotActions.js`。不要继续把这些规则或IO放回页面；现有props、ordered parts、storage key与JSON兼容边界保留。
- 节点异步读取按documentKey / ready / readonly / active门控，切只读或失去ready也取消在途reader；读取期间编辑和连线用functional append保留。复制与本机分享成功写入后才导航或生成链接，旧文档迟到clipboard反馈不影响新项目；导出继续共用draft projection。
- Studio `viewport-frame.js`只借用runtime进行clip→wrapper→camera求值和当前画幅渲染，不建资源或注册RAF。`useViewportScene`仍独占创建、listeners / observers / controls / controllers及dispose；RAF与capture同用latest参数入口。StudioEditor713行的同步场景动作 / 异步导出后续可继续拆，但不可丢objects / frames / cameraPaths / timeline / duration关联。
- Storyboard 旧媒体调用兼容，新脚本节点按 rows / controller / view / graph-plans 分层，已接九列表格、手动提示词及本地建图。全画布 @ 已接实际 InlineGenerator；source / validator / guarded connection / latest-token 独立，未知规则不放行。自动 ghost / Tab 已接 image / video，当时完整主体资产编辑、mixed2video、费用和 executor 仍缺；后续v2配置与空视频建图已接，真实生成继续未接；不把本地建图称为生成成功。
- Canvas域扩展位置与异步所有权见 `src/features/canvas/README.md`。工作流 / Node版本和依赖规则更改应更新根README及结构审查；只读复核未发现本批提取回归，具体验证以下方最新记录为准。

## 分镜资产与阶段维护（2026-10-11）

- V2 currentStep 独立于 viewMode/识别确认，关闭重开保留、切文档重置；tableConfig 取首个实际 table view，不能硬编码 ID。workflow 的顶部空资产 idle、底部媒体 missing=0 下一步、下载 allReady 和输出 prompt usable 是不同条件，不能合并门控。完整生成 busy 排除 recompute-batch-shots 与终态；已打开的图组弹窗同步受门控。
- 资产纯规则位于 storyboard/script-assets-model，生命周期位于 useScriptAssets，图/普通连线和一次历史统一由 mutateScriptAsset 提交。新增取消保留空 pending；多资产可共享同图；清图/删除资产不删除原图片，仅移除最后无人引用的普通连线。改名同步与删除保留源字段差异，thumbnail 变化才进行源规定的 prompt state 对齐。
- 失败表格 draft 保留相关字段原始基线，外部 rows 更新后重试/继续编辑不能重新使用最新 owner 授权覆盖旧内容，必须保留输入并明确冲突。资产文本编辑继续检查资产 fingerprint、节点、文档和 signal。
- V2 export-csv 返回纯描述，由 CanvasScriptNode 的专属toolbar在flush后下载源 CSV（BOM、角色 triples、资产段、title/name/label 命名）；CanvasNode保留legacy JSON兼容。不要把此前误称 XLSX 作为实现目标。资产 drawer/picker/rename/delete/preview 在既有 EditorDialog 4000 基础层之上排序；菜单仍挂在所属 dialog 内，不建第二套焦点或滚动锁。
- Studio 窄屏恢复项目资产开关和静态属性，沿用原 outliner/runtime/controller，面板置于 composer 上方；媒体监视器及全移动布局仍有缺口。证据与明确剩余范围见 [资产阶段审计](./research/script-assets-workflow-functional-audit.md) 和 [Studio 审计](./src/features/studio/SOURCE_AUDIT.md)。当前版本继续无需登录或账号资源。

## 当前工程验证

2026-10-16 混合字幕来源维护：静态源`collectClipSubtitleSources`确认同一非音频片段可同时追加HTML与VTT来源；本机新增`subtitle-source-mode`分型和混合轨道渲染，HTML/VTT各自保留加载、取消、缓存、错误和预览层。定向3文件/16项通过，lint零警告；随后Node24.19.0完整`npm run check` session40760 terminal0：**460文件/6562测试**，测试218.48s、标准build18.06s，格式/零警告lint/架构/核心strict通过，1376源码/config指纹无漂移，Canvas897382/ClipEditorWorkspace230231字节，900000预算未提高。日志`artifacts/subtitle-mixed-full-check.log`、证明`artifacts/subtitle-mixed-verification.json`；本机未部署，无需账号。范围和源摘录见 [混合字幕审计](./research/canvas-subtitle-mixed-source-audit.md)。

2026-10-16 音视频分离维护：按公开源`clipDetachAv`与`extractEmbeddedAudioAsWavFromVideoClip`接入浏览器 AudioContext→PCM WAV→音频源节点→关联片段，并将原视频内嵌音轨写为`embedAudioMuted`；右键能力门控、无音轨/已分离/未准备错误、取消和历史/CAS保存已接。定向5文件/94项通过；Node24.19.0完整`npm run check` session77892 terminal0：**463文件/6570测试**，测试207.13s、标准build15.67s，格式/零警告lint/架构/核心strict通过，1382源码/config冻结无漂移，Canvas899867/ClipEditorWorkspace230417字节，900000预算未提高。日志`artifacts/audio-separation-final-check.log`、证明`artifacts/audio-separation-verification.json`；本机未部署，无需账号。人声分离、远程CORS/运营服务、真机Safari仍未完成，整体目标仍未完成。

2026-10-16 字幕侧栏与高亮最终验证：按源行为修正HTML字幕面板为同一右侧栏切换，默认“字幕”列表，双击条目进入“字幕样式”，样式页头返回列表；普通文字动画入口不再出现在字幕。真实390px下标题不换行、列表栏不越界，桌面列表/样式切换和焦点已验。此前逐词高亮、双alpha色盘、词时钟预览、一次历史/撤销重做、pagehide/迟到回调隔离继续通过。最终Node24.19.0完整check session87968 terminal0：**459文件/6559测试**，01:43:25开始、测试413.89s/标准build33.47s，格式/零警告lint/架构/核心strict通过。1374源码/config指纹未变，Canvas897382/ClipEditorWorkspace229409字节，900000预算未提高；日志 `artifacts/subtitle-sidebar-full-check.log`、证明 `artifacts/subtitle-sidebar-verification.json`。真实浏览器证据和源侧栏静态摘录见 [字幕高亮与侧栏审计](./research/canvas-subtitle-highlight-audit.md)。源侧栏修正前双栏属于历史差距；旧457/6544与41/646项不代表当前最新全量。本机未部署、无需账号，旧L1/L2/混合分类/完整轨道/字体目录/真实服务仍缺，整体约70%、目标未完成。

2026-10-16 当前字幕高亮批次进行中：已接源逐词高亮、两色alpha色盘和词时间/CSS预览，纠正字幕面板的普通文字动画入口，并将应用全部限制当前字幕轨。专项41文件/646项通过，实际浏览器发现的portal pointer-events继承和快速关闭丢RAF数值均已修；当前接线尚待完整check，不能沿用下方457/6544冻结作为当前工作区全量通过。source进一步确认列表/样式应共用右侧300px栏切换，现有双栏布局仍待修正，不称整个字幕工具完成；本机未部署，无需账号，整体目标继续进行中。

2026-10-16 HTML字幕实际App接线：来源加载/取消/重试、列表和共享样式面板、源时间轨道手势、split/duplicate及meta原子事务、规范存档、末次输入和实际预览已接。复制字幕被loaded过滤、播放中保存投影被误判外部冲突两项真实缺陷已修；WeakMap投影识别同时核会话/原基线/完整值指纹，过期投影和真正外部写入继续拒绝。最终Node24.19.0完整check session50294 terminal0：**457文件/6544测试**，00:13:34开始、测试299.68s/标准build21.87s，格式/零警告lint/架构/核心strict通过。1367源码/config指纹未变，Canvas897073/ClipWorkspace189589字节，900000预算未提高；日志 `artifacts/html-subtitle-app-full-check.log`。专项39文件/631项、追加旧投影拒绝后的52项及原生桌面/390/跨片段播放/未失焦刷新/最后删除/历史/焦点与明确剩余范围见 [HTML字幕App验收](./research/canvas-html-subtitle-app-audit.md)。首轮ENOSPC、两个修前失败、主动停止143和HMR错误保留，不与最终冷刷新成功混称。旧L1/L2/混合分类、逐字高亮alpha、完整字体/预设/轨道工具、自定义runtime和真实服务仍缺；strict非全部JSX、统计含独立影游、CI未远端执行、仅本机未部署、无需账号，整体约70%、目标未完成。下方进行中及453/6510为前批历史。

2026-10-15 当前接线进行中：HTML字幕App创建、列表/样式面板、预览及末次输入刷新恢复已有实际浏览器证据，时间轴拖动尚未通过原生验收。本批定向37文件/606项及零警告lint通过，日志 `artifacts/html-subtitle-app-tests3.log`、`artifacts/html-subtitle-app-lint3.log`；当前接线尚未完成完整check，不能沿用下方接线前453/6510冻结结果作为当前工作区全量通过。进度复核维持约70%（65%-75%），不计未完成接线、测试增量或独立影游扩展；仅本机、未部署、无需登录或账号资源。

2026-10-15 HTML字幕协议后续：v4 source/timeline reader、clip/meta/4轨、source实例投影/新增、clone/retag/meta/delete与split/duplicate原子多文档事务已新增；共享inert模型/patch/封闭预览文档保留普通文字边界。剪辑专项33文件/575项及独立Chromium协议12项通过；最终Node24.19.0完整check session18062 terminal0：**453文件/6510测试**，格式/零警告lint/架构/核心strict及标准构建通过，测试257.47s、build23.54s。1355源码/config指纹未变，Canvas895155/ClipWorkspace152982字节，900000预算未提高；日志 `artifacts/html-subtitle-contract-full-check.log`。首轮因标识trim补正主动停止143与最终成功分别保留。尚未接App的HTML字幕source/archive、UI、CAS/history与真实播放器，不能计为完整字幕功能；证据、REA partial和下一步接线见 [HTML字幕协议审计](./research/canvas-html-subtitle-contract-audit.md)。统计含独立影游、strict非全部JSX、CI未远端执行，整体约70%、本机未部署、无需账号；下方452/6493为前批。

2026-10-15 普通文字数值/颜色交互后续：整条绝对位置映射/min-relative step、只读读数点击编辑、invalid/Enter/Escape/Shift/keyup事务、native颜色hex/alpha展示与一次blur已接App。重型hook/view/纯规则仍lazy；main只持owner token/同一CAS历史/typed pending投影。拖动中间值不保存，typed/keyboard/color离开时保最后值；旧token不能结束新操作，精确投影后取消保其他graph改动。专项32文件/558项、角色库联合33文件/570项通过；最终Node24.19.0完整check session82598 terminal0：**452文件/6493测试**，格式/零警告lint/架构/核心strict与标准构建通过，测试301.07s、build38.94s。1351源码/config指纹未变，Canvas895155/ClipWorkspace148791字节，900000预算未提高；日志 `artifacts/clip-numeric-full-check.log`、proof `artifacts/clip-numeric-verification.json`。首轮角色库旧撤销基线失败、180ms明确复现与已保存/未保存两路径修正，及原生拖动/刷新/历史/390/焦点和后台仍visible的未验边界见 [控件验收](./research/canvas-text-controls-functional-audit.md)。普通文字不创造字幕高亮alpha picker；原OS色盘/手机键盘、HTML字幕/完整字体预设等仍缺。strict非全部JSX、CI未远端执行、本机未部署、无需登录/账号，整体约70%、目标未完成；下方450/6478为前批。

2026-10-15 普通文字背景/动画后续：背景颜色/alpha/圆角/模糊、source九种非空CSS动画、应用到同composition其他所有cue、折叠区段/滚动锚点与页头删除blur规则已接App。普通文字不展示字幕高亮；对齐/斜体只承接source预设/复制，不创造按钮。CSS像素属性按source平均输出比例换算并保留两位小数，行高显示百分比；UI草稿保原始字符串。专项30文件/543项通过；Node24.19.0完整check session65446 terminal0：**450文件/6478测试**、格式/零警告lint/架构/核心strict与标准构建通过，测试203.71s、build18.36s，日志 `artifacts/clip-text-advanced-full-check.log`。1345源码/config指纹未变，Canvas894054/ClipWorkspace138765字节，900000预算未提高。原生CSS seek/回弹/波浪、未失焦刷新、应用全部/一次undo、390/回焦和剩余原色盘/数值控件/字体/自定义runtime边界见 [高级属性验收](./research/canvas-text-advanced-functional-audit.md)。脚本只inert保留，不执行原runtime；DOM/动画对象不落文档，保持lazy。strict非全部JSX、CI未远端执行、无需登录/账号、本机未部署，整体仍约70%、目标未完成；下方449/6468为前批。

2026-10-15 普通文字实际接线：工具栏/右侧正文与布局文字属性/独立文字轨/同一CAS与十步历史/末次输入/pagehide/双iframe已接App，DOM协议留在lazy workspace。全图保存投影进行中拖动时保原时间轴；其他graph动作精确投影同一输入时只更新CAS基线，保原时间轴供一次撤销，不吞不同外部变更。原生连续播放揭示的prepare状态回传旧UI时间自取消已修，仍允许真正controlled输入seek。最终剪辑专项29文件/533项通过；Node24.19.0完整check session7031 terminal0：**449文件/6468测试**、格式/零警告lint/架构/核心strict/标准构建全部通过，测试1741.02s、build16.38s，日志 `artifacts/clip-text-ui-full-check.log`。1340份源码/config指纹未变，Canvas893988/ClipWorkspace126343字节，900000预算未提高。源、实际GUI/390/刷新/手势/焦点/原生播放与中止失败记录见 [普通文字验收](./research/canvas-text-editor-functional-audit.md)。背景/高亮/动画、HTML字幕时基/片段绑定、完整轨道重排/预设/字体及属性注入验证仍缺；默认预设按源为空，小型只读adapter不能称完整remote-config。不得执行原始script或降低CSP。strict非全部JSX、CI未远端执行，无需登录/账号、本机未部署，整体目标约70%、未完成；下方445/6450为历史底层快照。

2026-10-15 普通文字HTML底层：`clip-editor/domain/text-timing-model`、`text/html-document`/`html-patches` 与 `services/timed-text-id` 已实现v4 timeline文档的纯避碰/数值规则、inert读写与基础patch事务。专项21项、原生Chromium6项与静态布局通过；最终Node24.19.0完整check session50690 terminal0，**445文件/6450测试**、格式/零警告lint/架构/核心strict/标准构建通过，日志 `artifacts/clip-text-contract-full-check.log`。1309源码/config指纹未变；首轮ScriptV2失败、原断言/时限隔离12项及联合44项、同源码重跑过程见 [HTML协议审计](./research/canvas-text-html-contract-audit.md)。模块尚未进入App，不计为文字工具可用；下一步必须接普通文字入口、owner/CAS/history/末次输入/双iframe预览，再逐步覆盖HTML字幕和高级分支，不能用VTT或简单p标签替代。保持heavy DOM协议在lazy workspace，900000预算不提高；DOM/函数/operation token不落文档，异步SHA await后重新复核owner/基线。strict非全部JSX、CI未远端运行、本机未部署，整体目标仍约70%、未完成；下方443/6429为前批。

2026-10-15 基础VTT字幕最终验证：Node24.19.0完整 `npm run check` terminal0，**443文件/6429测试全部通过**，19:01:17开始、359.69s、标准build17.99s，格式/零警告lint/架构/核心strict通过；日志 `artifacts/clip-subtitles-full-check.log`，滚动入口 `artifacts/current-full-check.log`。专项25文件/496项通过；Chromium桌面/390的最后输入未失焦刷新、样式/应用全部、移动裁边/取消、撤销重做、隐藏和最后cue删除/恢复、4.1秒边界及转场叠层已验。1303份记录的源码/config指纹未变，最终Canvas891607字节/ClipWorkspace84391字节，900000阈值未提高。首轮两失败、空态崩溃与terminal143中止保留在 [字幕验收](./research/canvas-clip-subtitles-functional-audit.md)。模型/transport/异步hook/会话controls/视图分离；正文经共享draft投影，拖动经一次CAS/history，来源读取不得空覆盖、最后删除userCleared禁止旧URL复活。字体目录、HTML字幕/普通文本、波形与导出继续有缺口。strict非全部JSX、CI未远端执行、本机未部署；整体仍约70%（65%-75%），下方438/6408为前批冻结。

2026-10-15 转场库/属性最终验证：官方Node24.19.0完整 `npm run check` exit0，**438文件/6408测试全部通过**，18:07:13开始、测试399.93s、标准生产构建21.43s；格式、零警告lint/架构边界、核心strict均通过。日志 `artifacts/transition-panels-validated-check.log`，滚动入口 `artifacts/current-full-check.log`。剪辑专项20文件/475项通过；Chromium 1200/390布局、真实封面/双冻结视频、源数值默认/限幅、8px键盘与原生调宽、窄屏删除/撤销/Escape回焦点已验。检查期间记录的1291份源码/config指纹至结束未变，Canvas最终876014字节低于900000预算，ClipEditorWorkspace69110字节。前次脚本配置单项超时、原文件17项补跑及主动中止过程保留，不与最终成功混称。细节见 [本批审计](./research/canvas-transition-controls-functional-audit.md)。统计含独立影游，strict非全部JSX、CI未远端运行、本机未部署；整体复刻仍未完成。下段ENOSPC属于前批历史。

2026-10-15 前批转场主预览历史验证：剪辑域17文件/461项、联合21文件/506项及媒体元数据补跑4项通过；Chromium像素、实际GUI撤销/重做/刷新、GPU重建及390px布局已验。当时435文件尝试中434文件/6390项通过，media-metadata suite因ENOSPC未加载；标准构建也因素材复制ENOSPC失败，不能称该版本完整通过。失败日志保留在 `artifacts/transition-preview-final-check.log`、`artifacts/transition-preview-build.log`，补跑/代码编译在对应专属日志；当前已由上段438/6408完整成功更新，旧433/6366和431/6353仍仅是历史快照。

历史选中边／node＋edge混合删除批次、聚合关联确认、VIDEO／AUDIO→VIDEO_CLIP断线及历史桥接已接运行入口。官方Node24.19.0完整 `npm run check` session29008实际exit0：**407文件／5862测试全部通过**，08:57:15／233.25s；格式、零警告lint／架构、核心strict、Vite7.3.7／3593modules／build16.68s通过，[日志](./artifacts/canvas-selected-delete-validated-check.log)。1192源码冻结447ec0c4...、另22份Markdown输入与实际Canvas767526bytes、4真实lazy、旧31份CSS／main5／预算／依赖不变量见 [52项构建证明](./artifacts/canvas-selected-delete-final-build-proof.json) 和 [补充链证](./artifacts/canvas-selected-delete-final-build-supplement-proof.json)。首次407／5862仅旧Skill首例5000ms超时、build未跑的终态失败保留；隔离与邻近诊断还原后，同源码／断言／timeout／worker原样完整重跑成功，不猜超时根因。19份实际GUI文档（14混合桌面／390＋5公开VIDEO clip）全文独立比对、长按及lease修复、source／本机适配与明确剩余前端见 [本批验收](./research/canvas-selected-delete-functional-audit.md)。完整clip renderer／timeline编辑、真实云锁、手机／Safari／高DPR／大图仍未验收；strict非全部JSX、CI未远端执行，本机未部署、影游生产不变。下方398／5617及更早数字为历史冻结。

2026-10-14进度独立只读复核：按用户当前范围，本机前端约70%（65%-75%），不是正式逐条验收率。范围、分域权重与剩余前端缺口见 [进度估算](./research/coverage.md#当前复刻进度估算2026-10-14)。连线命中/选择/hover剪刀的实际App与原生证据见 [本批验收](./research/canvas-edge-interaction-functional-audit.md)，旧选择/松手专项及真实panning回归已修复，该历史连线批次完整398文件/5617项与构建通过；下方393文件/5459项及双击入口为历史冻结。未验功能不算完成，测试数量不作为完成率，本机改动不等于线上部署。

此前连线批次：透明hit20/visual2、3、4/cut48均world单位，native CTM/inverse/arclength定位、原实际挂载visibility、selection与focusable分离、hover1000ms/leave立即、普通press-release与hand/Space/current owner已接；剪刀保native键盘默认激活，双击不删除。2026-10-14官方Node24.19.0完整 `npm run check` session3704 terminalexit0：**398文件/5617测试**，06:59:20/227.51s，格式/零警告lint/架构/核心strict/build17.71s，Vite7.3.7/3584modules；日志 `artifacts/canvas-edge-interaction-final-check.log` SHA5d3d00e3...，1171冻结cd26ce18...逐文件一致，旧8+23源CSS、main5 scoped eager与真实lazy仍核对。5新文件158项、actual App18及原14/15整图断言，native14 GUI全字段21图/13UI/21文件、真实CSS390与10%/readonly范围见 [连线验收](./research/canvas-edge-interaction-functional-audit.md)。六次中间失败/TERM均保留，不将全tests pass但build失败合成完整check通过；两处cold预算修正只改旧test，生产与native捕获相同。selected-edge Delete/mixed批次、clip时间轴/异步lock、完整renderer、虚拟化/真机/Safari/高DPR/大图仍缺；下一批 [源审计](./research/canvas-selected-delete-source-audit.md) 与output草稿不算接入。strict非全部JSX、CI未远端执行、Node/jsdom通知保留。本机未部署，不改独立影游生产，无登录/小号，整体目标仍未完成。

脚本/分镜组单边断线已接源确认、精确解绑与editing优先，全部末次草稿、raw CAS、一次history及quota仅保存重试。2026-10-14官方Node24.19.0完整 `npm run check` session2868 terminal exit0：**393文件/5459测试**，04:36:07/208.38s，格式/零警告lint/架构/核心strict/build31.55s，Vite7.3.7/3579modules；日志 `artifacts/canvas-storyboard-unlink-final-check.log`。1161路径冻结SHA43a16c99...不变，旧8+23源CSS顺序、新scoped eager CSS与真实lazy见 [构建证明](./artifacts/canvas-storyboard-unlink-final-build-proof.json)。首次完整检查两项旧focus等待失败/build未跑；仅修冷入口总预算与实际lazy readiness，强断言保留，联合27项后完整重跑。source33片段、clip30片段验证及真实101节点GUI取消/精确一边三字段/once undo/redo/cold、390无X/16px/344px/32px与console0见 [本批验收](./research/canvas-storyboard-unlink-functional-audit.md)。当前单边双击不覆盖mixed batch、VIDEO_CLIP异步时间轴前端、源锁、透明hit/剪刀入口与完整renderer；strict非全JSX，CI未远端执行，DEP0129/jsdom通知保留。本机未部署，不改独立影游生产，无登录/小号，整个目标未完成；下方388/5370与1150为历史。

上一批节点／连线整图删除与确认已接 source UI 子树、直接父组收缩／解散、特殊锁重算及边专属角色 metadata；最新输入、一次 CAS／history 与成功后消费 timer 同步，抓手／Space 禁误删。2026-10-14 官方 Node24.19.0 完整 `npm run check` session34383 terminal exit0：**388 文件／5370 测试**，03:32:29／170.04s，格式／零警告 lint／架构／核心 strict／build16.77s，Vite7.3.7／3573 modules；日志 `artifacts/canvas-destructive-delete-final-check.log`，1150 冻结 SHA 与最终 Canvas721355bytes／旧 CSS／实际 lazy 见 [构建证据](./artifacts/canvas-destructive-delete-final-build-proof.json)。实际整图 App15／确认 App7及 native16份完整 GUI 文件验证删源／hand gate／undo／redo／cold、删组恢复、脚本取消／确认／最新输入、连线双击恢复；390确认无横溢且回原焦点，见 [整图删除验收](./research/canvas-destructive-delete-functional-audit.md)。第一次正式检查仅旧组例期望失败、build未跑，修正后完整重跑，不混称通过；strict非全部JSX、CI未远端执行、DEP0129／jsdom媒体通知保留。script／关联分镜组断线确认／unlinkStoryboardByEdge、VIDEO_CLIP异步mD、源服务锁与完整特殊renderer仍缺。本机未部署，无需登录／小号，整体目标未完成；下方379／5193与1135是上一轮历史。

此前普通节点参考删除已按完整 store 链清理失去来源的媒体 token 并重编号；最后输入、图、撤销与本机保存一致，修复清理值恰等旧 baseline 时的 timer 回写。组按全部 leaf 计数，保源节点／旧 order；Role 最终 after 共用 collector。2026-10-13 官方 Node24.19.0 完整 `npm run check` session31447 terminal exit0：**379 文件／5193 测试**，16:33:00／192.33s，格式／零警告 lint／架构／核心 strict 与 build13.86s 通过；日志 `artifacts/canvas-reference-delete-final-check.log`，1135 冻结 SHA 与 CSS／真实 lazy 不变量见 [构建证据](./artifacts/canvas-reference-delete-final-build-proof.json)。实际 App 11 项及 pure／owner 74 项、原生桌面删／undo／redo／冷刷新五份完整 GUI 文件相等关系与390最后项删除／一次undo见 [删除验收](./research/canvas-reference-delete-functional-audit.md)。该历史批次尚缺的 pictureEdit／submitted segment／editing continuation、全局 node-edge cascade 与 lens／style／panorama 纯状态已由上方最新整图批次补接；完整特殊 renderer／分镜断线／VIDEO_CLIP 继续另验，不能称只剩后台。统计含既有 Studio／影游，strict 非全部 JSX、CI 未远端执行、DEP0129／jsdom 媒体通知保留；本机未部署，无需登录／小号，整个目标未完成。下方375／5108与1129 SHA为上一轮冻结。

节点生成面板已统一实际尺寸与视口测量：下方不足时上放并避开标题，短屏整卡滚动，窄屏预留固定工具栏，接线倾斜不影响输入。普通VIDEO排序修复150ms草稿碰撞；IMAGE按完整源链保literal正文、只改typed顺序。2026-10-13官方Node24.19.0正式 `npm run check` session54671 exit0，**375文件／5108测试**，02:40:44／137.85s；格式／零警告lint／架构／核心strict与build12.87s通过，日志 `artifacts/canvas-generator-vertical-final-check.log`。1129源码/config/tests冻结SHA与真实lazy／旧CSS全字节不变量、900000阈值见 [构建证据](./artifacts/canvas-generator-vertical-final-build-proof.json)。原生1280／390／320×240、展开／Escape／缩放／拖动及一次undo、IMAGE／Script入口、GUI整文档对比已验，精确范围见 [节点面板与草稿验收](./research/canvas-generator-vertical-functional-audit.md)。group、显式content尺寸、加载错误及动画中间帧主要为受控DOM，不扩为全部原生。统计含既有Studio／影游，strict非全部JSX、CI未远端执行、DEP0129保留。本机未部署、无需登录／小号，真实服务和特殊前端缺口继续保留，整体目标未完成。下方角色370/4991及1122SHA为历史冻结。

VIDEO角色库已接真实入口、公共目录／详情与三媒体选择、可注入运营source和一次引用图事务；修复末次150ms草稿／Magic、Quota重复审核、portal capture／click背景失选及Space激活。2026-10-13官方Node24.19.0最终 `npm run check` exit0，**370文件／4991测试**，00:42:01／110.51s，格式／零警告lint／架构／核心strict与build11.11s通过，日志 `artifacts/canvas-role-library-final-check.log`；1122源码冻结入口和实际构建不变量见 [最终构建证据](./artifacts/canvas-role-library-final-build-proof.json)。独立真实collector／hook／App联合3文件65项与view36项通过；原生1280／390／320外侧点击保选区／inline／dialog，Space开窗、Escape回chip，GUI整份文档SHA相同。初轮370/4983与native两次mask／Space失败分别保留，不能与最终快照混称。准确范围见 [角色库验收](./research/canvas-role-library-functional-audit.md)，下方360/4803及1100 SHA对应历史节点／Studio批次。统计含同期Studio与独立影游，strict非全部JSX、CI未远端执行，Node弃用提示保留。角色默认目录／审核未连接；真人目录／组／签署／QR、历史图库、主体rb及部分重核前端仍缺。本机未部署、无需登录／小号，整体目标未完成。

Studio按用户截图授权参考Blender改善AgX/本地环境光/柔化阴影/平滑曲面；左键选择、中键/Alt左键旋转、Shift中键/右键平移；真实几何聚焦、方向轴/反向、选择框与NumLock-off误删修复。辅助资源不进文档/GLB，主视口与monitor同AgX；俯视距离计入半高度，320px标题/方向轴遮挡已修正。Node24.19.0最终完整check exit0，360文件/4803测试（21:55:36/146.33s）、build11.06s、格式/零警告lint/架构/核心strict通过，1096代码/config SHA前后一致；Studio专项26文件118项。日志 `output/studio-blender-final-check.log`，初轮CSS漂移保留独立日志。实际1440/390/320、真实GLB两clip/两机位/播放及新标签零error/warn范围见 [视口审计](./research/studio-blender-viewport-audit.md) 与验证历史。方向视图为透视，真正正交、完整建模/材质工具与原服务仍缺；本机未部署，不宣称全Blender或原站逐状态复刻。

节点手势已修正未moving时由pointerup首次拖动/复制/history，保留正常拖动末位与一次撤销/重做。2026-10-12官方Node24.19.0该历史批次 `npm run check` exit0：**360文件/4803测试全部通过**，tests21:42:56/122.72s，格式、零警告lint/架构边界、核心strict与构建11.06s通过，日志 `artifacts/canvas-release-start-current-check.log`。该批1100源/config/tests SHA一致；统计包含同期Studio及独立影游工作，首轮check期间Studio CSS漂移已另记，不能与旧冻结源码混称。Canvas690228bytes/gzip229310、Script220148/72475、Mark23974/9037；动态入口与22CSS级联不变量保持，900000阈值未改。新实际App4项、Canvas/default shared14项与原生1280×720 click/drag/一次undo-redo五份GUI导出强比对通过，未新增窄屏/持续Alt/Space/touch/Safari或大图手感声明。原站ordinary move-start、virtual down-start分开记录，本机4px/延后copy为明确适配。准确源码、受控与原生范围见 [节点验收](./research/canvas-pointer-release-functional-audit.md)、[构建证据](./artifacts/canvas-release-start-build-proof.json) 和 [验证历史](./research/verification-history.md)。canvasCapture是前图URL回调，t4未消费callback、可见入口未证实，不能凭dormant分支创造区域截图按钮。真实服务/完整renderer/真机与大图仍缺；本机未部署，strict非全部JSX、CI未远端执行，无需登录/小号，整体复刻目标未完成。

此前元素标记批次：元素标记前端已接入 IMAGE/VIDEO 的实际 schema 入口、受控点位/候选菜单、prompt token/magicList、模式互斥、末次草稿与原子保存；默认识别服务未连接，不能造标签或假成功。Script 卡片真正按需加载，22份旧 CSS 保原顺序；普通/Script/加载态生成器只在横向溢出时按实际 board 宽收进边界。2026-10-12官方Node24.19.0最终 `npm run check` exit0：**352文件/4745测试全部通过**，tests20:04:40/101.45s，格式、零警告lint/架构边界、核心strict及生产构建10.61s通过，日志 `artifacts/canvas-mark-final-check.log`。CanvasPage690228bytes/gzip229314，Script独立220148/gzip72470、Mark独立23974/gzip9030，均非Canvas static closure，900000阈值未提高。1280/390/320入口/退出、VIDEO receiver、展开frame逐层Escape、Mark→Focus、真实GUI导出、Script手写/两次undo、888px与Agent缩窄/390px横向定位及原生抓手平移已验，见 [本批验收](./research/canvas-mark-functional-audit.md)、[构建证据](./artifacts/canvas-mark-build-proof.json) 和 [验证历史](./research/verification-history.md)。成功识别仅在受控adapter回归；普通prompt Ctrl+Z仅恢复raw token、不重建已清理metadata。capture/未核renderer、真实识别/生成/上传/费用/权限/协作、原生持续Space/Alt/touch/Safari与大图仍缺。本机未部署，strict不覆盖全部JSX、CI未远端执行，统计含独立影游扩展；无需登录/小号，整体目标未完成。

此前聚焦批次：图片聚焦已接入真实 schema 入口、区域移动/八柄/七比例、自然尺寸裁剪卡片、原子确认/删除/模型降级、末次草稿与保存重试。2026-10-12官方Node24.19.0最终 `npm run check` exit0：**337文件/4500测试全部通过**，tests18:24:50/261.59s，格式、零警告lint/架构边界、核心strict及生产构建15.34s通过，日志 `artifacts/canvas-focus-final-check.log`。真实按需确认工具4671bytes/gzip2136；CanvasPage898775bytes/gzip296239低于既有900000阈值，不抬门槛。原生1280区域/比例/一次undo-redo/删除/模型降级/刷新/GUI导出、390与320布局/比例/Escape已验，见 [聚焦验收](./research/canvas-focus-functional-audit.md)、[构建证据](./artifacts/canvas-focus-build-proof.json) 和 [验证历史](./research/verification-history.md)。源码、本机适配、受控事件与原生输入分开记录；Mark/capture、真实生成/上传/费用/权限/协作、高频修饰拖动、真机touch/Safari及大图仍缺。本机未部署，strict不覆盖全部JSX、CI未远端执行，统计含独立影游扩展；无需登录/小号，整体目标未完成。

此前参考入口/分包批次完整check为324文件/4320测试、构建20.28s，日志 `artifacts/canvas-script-reference-final-check.log`。CanvasPage873.73kB/gzip288.54kB是旧冻结产物；实际1280/390参考取消/再选/刷新恢复及初始失败保在 [参考验收](./research/canvas-script-reference-functional-audit.md)，不得与本批快照混称。

此前空态参考建图批次：309文件/3994测试、完整check与构建9.85s通过，05:45:38/81.09s，日志 `artifacts/canvas-script-presets-final-check.log`；专项7文件118项通过。最新专用生成器由上方批次接入，原三preset图/参数/一次历史仍按 [空态验收](./research/canvas-script-presets-functional-audit.md) 保留；data检查页拒绝是历史证据，不代表本批新增浏览器检查。

此前ScriptV2紧凑卡片/状态与拖动入口批次：正式Node24.19.0完整 `npm run check` exit0，305文件/3900测试全部通过，05:28:30/79.43s，构建9.72s，日志 `artifacts/canvas-script-card-final-check.log`。联合11文件208项及迁移视频入口6项通过；初次旧入口六项失败保留在验证历史。46页原生输入仍0，手感未验收；该批后的empty preset由最新批次补建图，其它准确范围见 [卡片验收](./research/canvas-script-card-functional-audit.md)。

此前图片配置批次：ScriptV2 r3图片配置/sC空图组及重排行焦点已接；2026-10-12正式Node24.19.0完整 `npm run check` exit0：300文件/3735测试全部通过，05:02:02开始/77.32s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建9.42s通过，日志 `artifacts/canvas-v2-image-final-check.log`。联合12文件302项04:54:25/5.84s、行key跟进2文件26项05:00:50/2.38s通过；补key前300/3734完整成功快照保存独立before-row-key日志，不能混同。新45计数页原生点击仍0，桌面/窄屏未验收，无新截图。源码、适配与实际回归见 [图片交接验收](./research/canvas-v2-image-functional-audit.md)，失败/修复与快照边界见 [验证历史](./research/verification-history.md)。随后仅维护文档并定向格式检查，无新生产修改。仅本机更新未部署，统计包含独立影游扩展，strict不覆盖全部JSX、CI未远端执行；影游冻结生产记录保持独立。

此前已记录检查：2026-10-12分镜组设置、真实PNG与标题/首手势生命周期批次，`npm run check` exit0，**268个测试文件/2796项测试全部通过**；00:16:42开始、测试209.61s、生产构建14.94s，格式、零警告lint/边界与核心strict TypeScript通过。统计包括同工作区独立影游扩展，不代表原站功能验收数；strict不覆盖全部JSX、CI未远端执行。原生1280×720/390×844菜单、确认/取消、一次撤销、真正标题拖动/双击、2K刷新恢复与4K显示/Quota边界见 [设置验收](./research/canvas-storyboard-group-controls-functional-audit.md)，原宫格拖入/换位/补图见 [拖动验收](./research/canvas-storyboard-drag-functional-audit.md)。旧批次统计保留历史。本批为本机源码与构建更新，线上发布以独立部署记录为准。

分镜最终提示词按 `prompt-compose-model` / workspace hook / 双轨草稿视图 / rich DOM 分层；不得复用普通节点媒体token或把普通textModels当scriptText目录。自动拼接覆盖锁旧bundle指纹，确认后读取最新输入；手动编辑保留state/hash。撤销20秒核对全部after bundle，恢复旧非空track的bundle及state。统一draft projection逐track校验基线，pagehide/立即卸载也覆盖已settled的文档；保存时保留canonical graph基线，不以投影值作为后续live draft的基线。规则与剩余服务见 [提示词拼接审计](./research/script-prompt-compose-functional-audit.md)。

当前访问策略统一在 `services/workspace-access.ts`：稳定本地 actor 只用于本机文档和本地操作，不能当作账号凭证；App 不读取或写入旧 libtv-user、不加载登录弹窗。MCP账号授权保持未接入。未来接认证须替换根策略并接业务 repository / 服务器授权，不在各页面散落新的演示登录门槛。

新图动作由 `useCanvasGraphActions` 同步发布当前图后更新 React，提交前检查文档、ready、readonly、卸载及图身份；增强 @ 连接后必须读取最新 token。分镜 graph-plans 只构造本地图，不提交任务，保存 scriptRowHiddenUuid 绑定。GeneratorFrame 复用 dialog-stack；子菜单 Escape 先关闭，不能另建锁或 focus trap。Studio monitor capture / runtime 由 viewport owner 创建释放，复用主 RAF，不能开第二 renderer。实际功能和剩余差距见 [本批审计](./research/generator-script-monitor-functional-audit.md)。

2026-10-11 分镜最终提示词：最终 `npm run check` 通过，195 个测试文件、1071 项测试，包含格式、零警告 lint、核心 strict TypeScript 与生产构建。桌面/390px单镜头、批量拼接、取消/覆盖/撤销、资产标签、立即刷新保存证据见 [验证历史](./research/verification-history.md#分镜最终提示词2026-10-11)。此前资产阶段、CSV与真实GLB静态属性仍见对应历史批次。GitHub CI 已配置、尚未远端执行；strict 不覆盖全部 JSX。

TransformControls helper 先从 scene 摘除，再由 controls 自身释放；scene sweep 不能再次清理借用的 helper 资源。共享 material 保留 Three 自身的调用策略，不修改第三方库来掩盖所有权问题。

节点 AutoLink 的纯匹配、DOM ghost、检测 controller、tooltip 与偏好各自维护；只对当前已连参考的明确名字 / 序号提示，不能自动连接其他节点。ghost 不进入 draft / 复制 / 保存 / 导出，接受才写实际当前 token；普通名字保留、序号文字消耗。batch 是单次正文 / undo 事务，相邻序号的 Range 起点右偏，不能消耗前一项 ghost。受 IME / readonly / ready / session 门控，禁用时清组合状态与 pending；同 session 恢复后不能遗留 composing 锁。浏览器偏好在 services 使用原 raw 1/0、统一订阅和失败反馈，与账号及文档参数隔离。源证据见 [AutoLink 审计](./research/prompt-autolink-functional-audit.md)；swap / 节点 picker 的后续进展见 [引用动作审计](./research/prompt-reference-actions-functional-audit.md)，标签服务与特殊 token 仍有差距。

维护本文件的当前规则、`agent.md` 的入口和域内说明，批次检查原文追加到验证历史；功能差距更新 coverage 与对应审计，避免在多个根文档重复追加整段历史。

节点 swap 只替换点击的一个 badge，保留其他媒体 DOM 与旧参考连线，不额外添加空格或移动焦点；RAF 与 layout 使用同一实际菜单宽度，禁用 / IME 关闭菜单并剥离 overlay。节点资产只读首项 payload，按 URL 优先复用已连节点、已有节点，最后创建；资格 / 容量 / 批次计划纯模型与 UI / request hook 分离。批量图提交先规范 incoming mode、同步 currentDocument，再读取 token，prompt callback 必须读取最新图。旧 request 的 pick / close 不得写入或关闭新 request，取消 / 外部更新 / session / readonly / 卸载清理。共享 picker 拒绝通知携带当前选择，容量全部满才标红，已选项始终可取消；首项视频 poster 贯通预览。资产弹窗 portal 到 ownerDocument.body，不能留在节点 transform 内造成尺寸或工具栏遮挡；嵌套 dialog-stack 保留展开层与逐层 Escape。源码、首个非空 URL 的本机适配和验收见 [引用动作审计](./research/prompt-reference-actions-functional-audit.md)。登录继续不属于当前版本。

## PenStudio 与节点操作维护（2026-10-11）

用户将本地产品改名为 PenStudio，并再次确认本版本不考虑登录。产品标题、导航、Canvas/Agent/Studio 与相关外壳使用新品牌；研究原站、公开内容来源和 `libtv-*` 持久化 key 保留，不能通过改名丢失既有本地文档。品牌素材新增独立 SVG，不改原始证据。

节点选择与拖动分开：超过4px屏幕距离才记录一次拖动历史；这是用户要求改善手感后的本机调整，原站React Flow默认1px需保留证据。手型/Space/中键从节点非UI区域平移；输入、媒体、滚动容器拥有自身事件。pointerId、capture、cancel/lostcapture/blur与最终落点由 `useCanvasPointer` 统一维护；普通点击不得重建inline输入，连线目标不得先进入拖动。触摸/双指和拖连的后续实现见下方维护规则，真实手机仍需另验。

既有媒体版本菜单在单镜最终提示词入口；切active先在hook捕获owner后flush，再执行源tk全行refs/对白/state/hash规范化，不回滚正文或伪造生成历史。真实readonly与busy禁写分开；jump只fit并保留弹窗。失败编号只读script任务3/4，clipboard反馈随owner取消；单shot进度没有source时不猜。

本批最终 `npm run check`：**202个文件、1227项测试通过**，格式、零警告lint、核心strict TypeScript和生产构建通过；真实桌面节点拖动/撤销/连线/文本滚动及390px品牌/版本菜单/只读定位/刷新恢复已验。严格类型未覆盖全部JSX，CI未远端运行。细节和明确剩余范围见 [节点操作审计](./research/canvas-node-interaction-functional-audit.md)、[媒体历史审计](./research/script-media-history-functional-audit.md) 与 [验证历史](./research/verification-history.md#penstudio品牌节点操作与媒体历史2026-10-11)，不能将本批结果当作全站目标完成。

## 触摸与拖拽连接维护（2026-10-11）

`useCanvasTouch` 与 `useCanvasConnection` 各自拥有原生事件和文档 owner；与 pointer 互相取消，不能留下旧 capture/RAF 同时写视口。native 正常结束保留 synthetic click 抑制，public cancel 清旧 tap/suppression，确保 fresh mouse 不被吞掉。普通 renderer 在 useTouchMode 后覆盖 nodesDraggable/nodesConnectable，不能整体禁用触屏节点编辑；输入/媒体/滚动容器继续保留原生手势。

连接几何/资格/菜单和 views 分层。严格 >1px 启动连接，80 世界单位 handle 候选，直接 DOM 对向 hit 优先；body fallback 只在 release。合法 handle 预览吸附 border；invalid/unknown 跟随实际 pointer。40px 边缘自动 pan 每帧≤15屏幕px，先同步 viewRef 再发布 React，取消/删除起点/切文档立即释放。普通连接与菜单新建资格不同，新节点/边/参数只能走 graph CAS 一次历史，不允许绕过校验。

Menu.open 同步发布 request，source 短按保留 linking；只有普通目标 body outside 关闭可保留连接意图。Escape、手型、ready/readonly、文档切换、起点删除和卸载完整取消。迟到 choose/close 不得改变新 request；同 batch 重开、A→B→A 也需回归。窄屏左右容不下二级菜单时上下展开，不能覆盖 trigger 导致 hover 后 click 误创建。fit/zoom/touch 共用0.1–8与源 numeric padding；空白 guarded 双tap使用 .15/300ms。board overflow:clip 阻止焦点自动滚动造成坐标错位，子滚动容器保持自身 overflow。

`CanvasConnectionPreview` 只消费 gesture 预览，按合法/unknown 蓝线与 invalid 灰线展示；invalid 600ms 提示的 timer 必须按 document/gestureId/起点/handle/目标隔离，不能每次移动重置。取消/切目标/StrictMode/卸载清理，inverse zoom 保持提示屏幕尺寸，reduced-motion 为本机回退。最终 `npm run check`：**211个文件、1477项测试通过**，格式、零警告 lint、核心 strict TypeScript 和生产构建通过；桌面及390px验收证据存入下方链接，CI尚未远端运行。

具体源码、测试与真实桌面/390px结果见 [触摸连接审计](./research/canvas-touch-connection-functional-audit.md) 和 [验证历史](./research/verification-history.md#节点触摸与拖拽连接2026-10-11)。模拟 TouchEvent 不等于真机/Safari验收；该历史批次尚缺临时 ghost 与完整节点倾斜/光边，后续接线见下方。特殊权益/主体 metadata、大量节点性能和真实运营服务继续有差距。登录与账号资源继续暂缓，整体复刻目标未完成。

## 节点反馈与临时连接维护（2026-10-11）

节点反馈由纯 `connection-feedback-model`、`useCanvasNodeConnectionFeedback` 与装饰view分层。物理 `elementFromPoint` hover 与规范连接target不同；捕获起点不可伪装悬停目标。blocked优先于invalid，双向已有直接边与起点只遮罩，未验证body不能自行标invalid。固定world article负责坐标与测量，永久内surface包标题/正文/端口/动作/inline，glow与遮罩仅在body；不得为动画重建输入、写节点transform或改变图历史。RAF/恢复timer按文档、节点、gesture、frozen隔离，reduced-motion为本机适配。

临时ghost在 `connection-ghost-model` 纯投影，不进入graph、选择、保存、复制、分享、导出或undo。空白释放有tiny端点/edge，短按无ghost；菜单世界anchor与未来创建point分开，source短按按350/100规则定位。默认measured→stored保留源证据，本地注入 `canvasNodeSize` 与实际renderer一致；组内相对位置转换属于本机协议适配。菜单world→screen更新只place，不重聚焦、不重置子菜单；blur/hidden和原owner取消清理ghost，提交仍走CAS一次历史。外层菜单必须覆盖公共floating边框，实际8px clamp不能仅凭模拟rect宣称通过。

最终工程验证与真实1280×720/390×844结果见 [节点反馈审计](./research/canvas-node-feedback-functional-audit.md) 与 [验证历史](./research/verification-history.md#节点反馈与临时连接2026-10-11)。217文件/1579测试通过，包含格式、零警告lint、核心strict与生产构建；strict不覆盖全部JSX，CI未远端执行。光边/倾斜/遮罩的持续GPU图使用明确的合成PointerEvent通过实际handler驱动，另验原生释放→菜单→创建/撤销/平移，不把合成事件当真机或原生持续拖动。完整特殊节点、多选连线、真机/Safari、大量节点性能与运营服务仍缺；无需登录或小号，整个目标未完成。

## 多选交互与输出连接维护（2026-10-11）

虚拟多选model、外框/加号view、Pointer移动、锚定toolbar、多源纯资格/几何、独立controller、viewport预览与Graph提交分别维护。单个真实普通组及其后代不画虚拟框；普通组直接孩子展开与递归输出是不同协议。移动只处理选中根，保留多选与一次历史；普通多选隐藏单节点浮条/inline。4px起拖为本机适配；真实组完整入口、Alt复制/Meta边策略、框体autoPan/高级drop仍缺，不能据pure helper宣布完成。

多源不复用普通端口：≥10屏幕px起拖，短按<300ms/<10px；80屏幕px边缘720px/s、dt≤50ms；release1×1世界命中取最后一项。聚合容量按已有+新增来源去重，support首enabled与video asset锁按源维护；一次共享target/参数/全部新边/历史，失败不部分提交。ANY已有边的frosted仅是反馈，不能代替资格。六项菜单无reference/旧script/flyout；preview为N条viewport蓝线与中心24px被动圆，不生成普通tiny ghost或持久化数据。

right入口圆心外17px、viewport圆心在cursor，以placement区分。world anchor随视口只定位，复用dialog-stack child dismissal，不加独立body锁。Escape优先原opener，重建后caller恢复新加号；外部pointer/focus不抢焦点。Pointer/Touch/普通连线/多连接管前互相取消；request/epoch/document/selection/ready/readonly、blur/hidden/lostcapture/unmount隔离迟到RAF与提交。Touch一指选区保持Pointer，第二指取消后pinch；模拟触摸不代表真机。

Graph原图CAS通过后投影previous/next并复核原身份；不能用draft投影替换expected身份。普通record也投影草稿。autosave成功仅对当前可写文档按最新基线合入有效draft再ack，避免inline卸载后保存新词被旧React图下一次覆盖；旧key flush不改当前UI，Quota失败保留草稿。立即pagehide/卸载仍需实际写入证明。

源码、真实NodeCanvas联合回归、原生1280×720/390×844、工程检查和剩余差距见 [多选交互验收](./research/canvas-multi-selection-functional-audit.md)、[连接源码](./research/canvas-multi-connection-source-audit.md)、[选区源码](./research/canvas-selection-visual-source-audit.md) 与 [验证历史](./research/verification-history.md#多选节点交互与输出连接2026-10-11)。当前无需登录/小号，真实服务、完整特殊节点/普通组入口、真机/Safari与大量节点性能仍有差距，整个目标未完成。

本批冻结后最终 `npm run check`：**225文件/1764测试全部通过**，20:09:58开始、43.87s；生产构建11.22s、exit0。日志 `artifacts/canvas-multi-selection-final-check.log`。随后仅更新验证文档并独立检查格式；原生截图及source/适配/剩余边界见上述验收，不将检查成功等同所有原站功能完备。

## 普通组输出与选区复制维护（2026-10-11）

`multi-connection-entry-model` 区分 selection/group descriptor；真实组只投影壳右中加号、不套虚拟 padding、不新增虚拟框。递归非组/non-reference叶子允许一个来源；action无资格仅由resolver禁用生成，不能在入口提前过滤。descriptor/controller共用确切普通组 predicate，只按sourceScript和已核实breakdown标记排派生组，不擅自禁用characterAsset。

多源controller owner包括entry identity、精确focus selector和递归parent membership；raw graph变化、同源换组、孩子迁移及A→B→A拒绝旧事件。source取消链可能经Touch回调统一pointerCancel再调用multi.cancel，因此start必须先互斥取消，再分配新request sequence。不能去掉序号校验掩盖blank-release菜单的Escape回焦点失败；恢复仅对对应当前入口，外部focus关闭不抢新控件。

虚拟框Alt / Option在本机4px阈值后一次复制，原件不动；Ctrl / Meta在pointerdown固定，携内部与外部上游输入边、不携下游输出边。纯selection-copy计划只返回additions；Graph在按下raw nodes/edges identity验证后先project源草稿再clone，最终仍用原图CAS并记一次history，Pointer不得重复record。媒体order按已核实helper规范，坏ID/投影失败不部分插入。普通单节点/真实组Alt入口、本机4px相对原站即时复制、完整nested补全和取消后保留已提交副本的适配须明确记录。

真实NodeCanvas、原生桌面/390px、焦点失败重现与修复、草稿/撤销及源码边界见 [本批验收](./research/canvas-group-selection-functional-audit.md)、[组入口源码](./research/canvas-group-connection-source-audit.md)、[Alt源码](./research/canvas-selection-copy-source-audit.md) 和 [验证历史](./research/verification-history.md#普通组输出与选区复制2026-10-11)。该批更新上方历史的组输出与虚拟框Alt缺口，不代表普通node/group Alt、框体autoPan/高级drop、Group新点提示、真机/Safari、完整特殊renderer或运营服务已完成；无需登录/小号，整个目标继续未完成。

最终冻结后 `npm run check`：**228文件/1895项测试通过**，20:37:13开始、50.63s；生产构建12.94s、exit0。日志 `artifacts/canvas-group-selection-final-check.log`，随后仅补验证文档并独立检查格式。

## 普通节点与真实组拖动复制维护（2026-10-11）

节点 Alt / Option 起拖经 `resolveCanvasNodeDragCopyMode` 区分 single / selection，不把普通孩子扩成整组。source RF 在选中后、首次越阈值调用 onNodeDragStart；本机 4px 相对 source 默认 1px 继续是手感适配。普通节点从首次起拖事件读取 Alt / Ctrl / Meta 与最新 graph，避免首次选中 inline 推断 mode 使 pointerdown CAS 过时；虚拟框保持 down 固定意图 / raw 身份。原站多修饰键 key-state 的按键顺序选择分支未完整复刻，本机仍 Shift 多选、未选普通节点先单选和 Ctrl / Meta 复制输入，不能泛化源状态机已验。

single 默认 detach 外部生成引用，Ctrl / Meta 保留引用并只重定向输入边目标；从 group-like parent 脱离时按世界坐标、保留源孩子名称和 `canvasAltDetachedCopy`。真实组 selection 副本维持整棵本地嵌套树、重映射 parent/childNodeIds/内部引用；root 的分组生成专属尺寸只按精确 `_explicitContentDims` / scene 条件清理。纯 planner 不写当前图；Graph 明确 copyMode、源草稿先投影再 clone、最终 raw CAS 一次历史，失败不动原件或部分插入。

普通节点按下保留 node capture，首次确认复制后在 Graph 事务前转交稳定 board；虚拟框 copy 从 down 持 board。先更新 capture owner，再请求转交；仅当新 board 仍持有对应 capture 时忽略旧 surface 的 lostcapture，新 board 真正丢失仍取消。原 caller surface 独立用于兼容 click 门控，原生点击/双击必须保留 node target。Escape、hidden、blur、lostcapture/cancel、文档/ready/readonly 切换隔离迟到坐标；取消保留已提交副本与一次 undo，新一次 pointerdown 不得被旧 click guard 吞掉。Pointer 普通移动不能重复 record 复制历史，不为复制重建输入或添加独立全局 pointer 生命周期。

源证据、实际 NodeCanvas 联合回归、合成修饰键与原生后续操作的不同范围见 [普通节点复制验收](./research/canvas-node-alt-copy-functional-audit.md)、[复制源码](./research/canvas-node-alt-copy-source-audit.md)。最终 `npm run check` **228文件/1995测试通过**，21:07:06开始、52.70s，生产构建10.31s/exit0，日志 `artifacts/canvas-node-alt-final-check.log`。实际浏览器与源边界见 [验证历史](./research/verification-history.md#普通节点与真实组拖动复制2026-10-11)；无需登录或小号，完整特殊节点、框体高级 drop/autoPan、真机/Safari、大量节点性能和运营服务仍需另验，整体目标继续未完成。

## 节点拖动、边缘平移与普通组落点维护（2026-10-11）

- `domain/node-drag-pan-model.js` 分开普通 node/真实组/节点发起的多选/Alt 副本与虚拟 selection frame：前者40屏幕px、每帧最多15px、当前世界指针投影；后者80px、720px/s、dt≤50ms、累积实际世界pan补偿。虚拟首帧dt0必须续帧，中心停止后move再启。Pointer持有RAF、当前viewRef、手势epoch和capture，不能在view里新增第二个writer或history。
- `domain/group-drag-model.js` 只计划节点落点；外部节点完整包含才入普通组，已有parent任意正面积重叠保持、完全分离才detach，保留世界位置和childNodeIds、不resize/reorder/改持久化zIndex。虚拟框stop不套用普通node drop；live Alt副本及跨手势detached marker按源分别门控。特殊画像/分镜组容量、ratio与重排仍blocked，不能用普通入组fallback冒充完成。
- pointerup最终位置与纯finalizer必须在同一个functional节点updater提交。成功结束保留本轮epoch供该updater提交；取消、新手势、文档/ready/readonly变化拒绝旧写入。finalizer接捕获的selectedIds和releasePoint，不读上一帧Graph、不额外写边/record或调用服务。Escape等取消不执行drop；本轮已移动部分仍可一次undo。
- `domain/node-stacking-model.js` 只派生显示层级：base加selected1000，parentZ≥ownZ时才parentZ+1，否则ownZ；分数层级不能误改成Math.max(own,parent+1)。CanvasViewport memo并保持原Node/Group key，输入DOM不重建，临时selected/z不入文档或历史。浏览器已复现并修复选中下方节点标题被上方textarea遮挡。
- 资产抑制条件严格为`elementsFromPoint`命中`[data-workspace-asset-panel]`；当前完整非modal资产面板尚缺，不把Agent/所有弹窗当源抑制范围。本机4px、当前board rect、最终pointerup坐标与原RF时序的适配保留于审计。

冻结后`npm run check` exit0：**232文件/2140测试**，21:40:59开始/60.03s，生产构建11.20s；日志`artifacts/canvas-node-drag-final-check.log`。7文件297项相关回归及实际NodeCanvas8项包含parent、history、保存恢复、stationary非单位zoom与输入身份。初次完整检查有一项既有Agent上传等待超时，原断言独立/联合41项和最终全检查均通过；未改变timeout或声明确定根因，见验证历史。实际桌面/390px为原生鼠标pointer验收，不能当真手机/Safari或原生Alt持续拖动证明。旧批次框体autoPan与普通group drop缺口由本批更新；完整特殊renderer、Group提示、RF完整多键selection、大量节点性能和真实运营服务仍需另验。当前无需登录/小号，整体目标未完成。

## 分镜组与节点拖动协调维护（2026-10-11）

`node-drag-drop-model` 按source接primary grid preview优先、special node/frame stop与ordinary fallback，standalone actual成员变化后才reflow；node外层仅primary最终父组grow-only扩壳，virtual frame不扩。旧审计“drag stop不扩壳”只适用于inner，已纠正外层ce/ct调用。Pointer immutablecontext继承最后实际commit，输入array/序号缓存Strict重放；选择/提示只在对应nodes提交后按owner/CAS执行，相同nodes拒绝也一次通知。成员并发改变使旧preview原子失效，不覆盖新图。

合并分镜组限2–25根图片，一次历史、source Hungarian顺序、参数/明确尺寸与fit。空槽共享presentation与插入几何，type/action/name/order/尺寸按tJ，不主动写ratio；读文件绑定唯一request，nativechooser固定owner，newopen/close/组删除/禁用/文档/卸载取消。迟到结果不能写或关闭新槽；失败保留重试，成功回已存在组控件。组内图片title与strict standalone端口规则分开，static preview与script source例外保留；manual renderer的明确尺寸同步world/hit/fit，源flow字段不冒充RF实测。

世界坐标投影和尺寸协议必须分开：connection ghost的worldOrigin仅替换position，保留raw measured/stored/content给默认source或caller的renderer adapter。不能通过canvasWorldNodes先规范化尺寸，从而吞掉NaN/Infinity或把源缺省350高度改成本机230。首次全检查的三个回归已修复，原断言全部保留，新增协议隔离验证。

source、适配、联合回归与浏览器边界见 [分镜拖动验收](./research/canvas-storyboard-drag-functional-audit.md)。当前仍无需登录注册、小号；history仅公开代表样本，本机读取不是原站上传，完整特殊renderer、分镜设置、真机/Safari、大图性能和运营服务待验；整体复刻未完成。线上部署仍以独立发布记录为准。

## 分镜组设置、拼接与标题维护（2026-10-11）

独立图片分镜组的设置计划、实际PNG合成、视图和请求owner分别放在 `domain/storyboard-group-controls-model`、`domain/storyboard-stitch-model`/`stitch/runtime`、`StoryboardGroupToolbar` 与 `useCanvasGroupControls`。唯一直接图片孩子选择也可显示父组操作；多选/框选/拖动/标题编辑隐藏，结束编辑保留200ms延迟。普通组及脚本混合能力分别维护，不给无脚本组创造“整组执行”。比例不改视口，grid source fit为padding .2/minZoom .6/maxZoom1/300ms；默认普通fit不变。

确认和异步读取每次绑定文档、任务、source和成员签名，旧 cancel/confirm不得改变新请求；最新raw graph CAS成功后才更新UI、fit及通知。签名范围按source保存，不宣称全部参数/同ID incarnation完整隔离。新图与溢出需要 `useCanvasAutosave.flushGraph` 读取已同步发布的committed graph，在React渲染前立即保存；Quota失败保留pending/图与可重试提示，不假报成功。无关组成员排序不得因创建/解组全局重排。

拼接使用真实Image/Canvas→PNG File→FileReader→根媒体节点，保留URL处理/水印参数，空格为黑色且编号按源绘制。`generatorType=default`、explicit content尺寸和localMediaReady是本机协议；远端审核/CDN管线未接，不可称已上传。标题的实际双击目标通过共享Pointer可选 `clickCaptureSelector` 保持，Canvas仅针对标题span启用，输入/媒体门控和Alt board捕获不变。

共享Pointer/Touch的document/ready/readonly/touchMode owner重置与native监听安装在layout commit完成。已可交互DOM出现后，旧passive cleanup不能取消新owner的第一次拖动。保留原NodeCanvas强位置/parent/history/storage断言，并用不含异步wrapper额外0ms drain的立即观察压力回归验证；不能靠延迟fixture、提高timeout或清除原断言掩盖capture后被cleanup取消的问题。

本批源码、原生桌面/390px、真实2K保存刷新、4K显示及Quota失败边界见 [设置验收](./research/canvas-storyboard-group-controls-functional-audit.md)。完整检查与中间失败记录见验证历史；该历史批次的普通组通用操作、脚本混合工具栏缺口由下方新批次接线更新，仍有明确前端与服务缺口；真实手机/Safari、大图性能与运营服务继续另验，整个复刻目标未完成。

最终冻结后完整check：268文件/2796测试及生产构建全部通过，日志 `artifacts/canvas-storyboard-controls-final-check.log`。原失败日志、诊断与压力回归保留；随后只补维护文档并独立校验格式，不以工程通过替代真机或远端服务验收。

## 普通组、脚本混合工具栏与选择提交维护（2026-10-12）

普通组与非 standalone 的脚本派生组使用 `GeneralGroupToolbar`；strict standalone image 使用 `StoryboardGroupToolbar`。混合的 script-linked standalone 仍走专用行，比例锁定、隐藏转普通组，运行入口交独立脚本确认；不能将所有组统一送普通 batch。`CanvasGroupNode` 负责壳、外部标题/改名与类型分派，`GroupToolbarUI` 共享屏幕定位、菜单和 tooltip；多选、框选、拖动、标题编辑及200ms冷却隐藏操作条，窄屏 clamp/滚动属于本机适配，不等同 source 或真机已验。

`domain/general-group-controls-model` 计划颜色、普通三种布局和全图片组转 standalone；顺序取全部 actual direct children，完整 preferred 否则 numeric name，普通布局保留 measured→stored→200/120、36/66与36px间隔，写 `groupLayoutMode/nodeWidth/nodeHeight`，不沿用旧 `data.layout` 作为新协议。`useCanvasGroupControls` 按命令选择普通/分镜纯计划，保持最新 raw graph CAS、草稿历史及原有拼接/确认 owner，不能删除 standalone gate 将4px宫格/比例规则泛化到普通组。

`batch/useCanvasSelectionActions` 注入最新 `getDocument/commitGraph`，旧 callback 捕获 documentKey；只有严格 true 提交且 owner 仍有效才更新选择/面板。真实 group 布局委托 group controller，virtual selection 保留独立100px布局。普通复制先 `projectGraph` 合入最后150ms输入，再 clone 新ID；expected CAS 仍为 raw graph，previous/next 与副本都保留有效草稿，失败不部分插入。解组在同次提交清匹配脚本 link、孩子分镜布局字段及组相关边，保留 `scriptRowHiddenUuid` 和脚本 rows；嵌套重挂父保世界位置是本机既有协议。旧无 graph writer 的 caller 仅保留 `change` undefined 兼容，不能称强 CAS。

ZIP 进度与取消归属于 `{controller,documentKey,groupId}`。组下载先重读最新图成员，进度只显示启动组；旧文档取消不能中止新文档任务，传 groupId 的取消必须匹配当前任务组，virtual 无参数取消保留。原 AbortSignal/worker 清理与失败不发布部分文件不变。组右键菜单按实际 contextNode 隐藏无效“节点设置”，不创造 source 未有的组生成器面板。

`script-group-controls-model` / `useCanvasScriptGroupControls` / `CanvasScriptGroupConfirmation` 只提供已核对的 v1/v2 图片/视频运行确认与请求 owner；真实生成/费用未接时按钮禁用，不能把普通 executor 当分镜生成。v1配置浮窗已由下方新批次接入；toolbox editor/创建更新弹窗、character toolbar、完整 run/stop 与真实生成/费用/协作及运营服务仍缺；ordinary resize 由下方批次接入，v1准确契约以下方新源码审计为准。真实手机/Safari和大图性能继续另验。

Viewport仅对当前显示General工具栏的组计算视频/下载资格，并按nodes与选中组缓存；隐藏组不在每次平移/拖动做同类全图扫描。script确认hook空闲时不读文档；纯计划先比较引用，不能为判断小改动序列化整张图和媒体。此处是移除已确认的冗余工作，不代表大量节点性能基准已验收。

源码与接线边界见 [普通组源码](./research/canvas-ordinary-group-controls-source-audit.md)、[脚本组源码](./research/canvas-script-group-toolbar-source-audit.md)、[接线审查](./research/canvas-ordinary-group-integration-audit.md) 和 [组操作验收](./research/canvas-general-group-controls-functional-audit.md)。最终完整check通过275文件/2929测试与构建，原生桌面/窄屏及完整App入口已复验；中间失败、取消检查和原断言重验均存入验证历史，不把本机结果当全站功能完成或线上发布。当前继续无需登录、小号与原站写入，保留独立影游任务的范围和验收记录。

## 普通组尺寸与取消维护（2026-10-12）

`domain/group-resize-model` 分离begin、source XYResizer preview与tB/onEnd final计划；四边/四角、Math.floor flow差、min120×80、extent/child约束、左上反向孩子补偿、stop12px与直接普通parent pF20/56分别维护。非空组写data尺寸，empty不写；tB stored尺寸与RF后续candidate measured不可混淆。当前注入canvasNodeSize适配手工renderer，无RF ResizeObserver；不能把旧measured再次当实际壳。非零origin、自己expandParent与特殊直接parent重排尚未接，明确拒绝而不冒充普通规则。

`CanvasGroupResizer` 仅绘四边线和四角8px/radius2手柄并委托事件，zoom采用max(1/z,1)，不自持graph/history。`useCanvasGroupResize` 持单一document/raw graph/pointer/capture、瞬时preview与didResize；最终一次CAS经现有draft投影、history与flush，取消丢preview。普通Pointer/Touch/连接/新指针/失焦/hidden/ready/readonly/切文档/图改变/modal互斥，pagehide先finalize/flush。标题编辑Escape优先原focus，不靠blur意外提交改名；捕获到board的click/dblclick同owner过滤，下一新手势解除。resize时暂藏toolbar和旧bounds加号是本机互斥适配，不能称source直接写RF store/collab事件完全相同。

新的v1批量视频配置证据修正此前推测：eM仅模型/共享参数/全部可用镜头/费用与提交，不含v2另一面板的逐镜时长或选图。提交先建空视频组及引用边，没有直接run；source保存helper并未回滚，关闭也未取消建图。具体源字段与下一步实现差距见 [v1配置审计](./research/canvas-batch-video-configuration-source-audit.md)。当时配置浮窗未接入，后续已由下方v1批次接入；真实费用、审核、生成、协作及运营服务仍缺；无需登录或小号，整体复刻未完成。

## v1批量视频配置与请求交接（2026-10-12）

`storyboard/batch-video-config-model`、`batch-video-graph-model`、`domain/batch-video-viewport-model`分离纯配置/建图/视口；`useCanvasBatchVideo`持表单与异步owner，`CanvasBatchVideoConfiguration`复用模型/参数菜单，服务只读契约在`services/storyboard-video-source.ts`。专用19条support从既有config-182归档提取，独立useContent加载/失败/重试，prebuilt样本清单也登记该JSON；本批未运行部署或打包预备命令。v1仅全部镜头、模型/共享参数/费用与空组提交，不混入v2选镜/逐镜时长。

表单初始settings只取首ready图，实时content尺寸仅refill缺ratio；切模型保source键存在模式与batch高级规则，normal参数不按batch过滤。共享GeneratorSettings新增内嵌高级/suppressCount/hidePromptMention选项默认关闭，无全局样式重置。费用300ms/count1、仅settings与空prompt，不发送镜头URL/advanced，总价只在展示乘N；缺服务显示“-”，VIP与本地actor不代表授权或折扣。

Graph一次CAS/history合末次草稿后读取同步committed图flush。Quota失败保留已建图和配置，锁配置、只重试保存；已提交保存不得再受schema/readyCount门控。审核结果匹配当前childID/URL，existing证书60天/autoComplianceoff gate按源，无真实服务不得假成功。关闭/切文档/ready/只读/modal/选择/source/catalogerror/pagehide/卸载取消，迟到结果和并发raw graph拒绝写入；reload rejection由allSettled消费。

同组重复open保持同owner/原view；参数菜单先Escape回trigger，再浮条Escape回组按钮，不另建modal滚动锁。成功先恢复原view300ms，100ms后按padding.15/400ms定位新组；用户新selection/board pointer接管取消迟到fit。源8秒服务器等待、关闭不取消quirk与本机取消/保存策略明确区分。source catalogue缩略图/VIP仍沿旧Sparkles复用，原生桌面/窄屏输入、真机/Safari、大图、v2配置/完整toolbar、真实费用/审核/生成/协作与运营写服务未验收，不能说只差服务器。

准确源码、适配、九文件220项、实际NodeCanvas回归与浏览器通道阻断见 [配置验收](./research/canvas-batch-video-functional-audit.md)、[配置规则](./research/canvas-batch-video-config-model-audit.md) 与 [建图规则](./research/canvas-batch-video-graph-source-audit.md)。登录/注册/小号继续暂缓，整体复刻目标未完成，独立影游发布按其自身记录维护。

## ScriptV2选镜、时长与空视频组交接（2026-10-12）

`storyboard/v2-video-config-model`、`v2-video-graph-model`、`useScriptV2VideoConfiguration`和`ScriptV2VideoConfiguration`分离纯配置/引用建图、异步事务及视图。v2用已有config-182的全局video34项目录，独立加载/错误/重试；v1继续用专用19项。实际caller不传上游图片settings，不要求linkedImageGroup，不套旧通用视频弹窗。该批入口接在全屏脚本合成提示词阶段；随后浮动toolbar及图片r3/sC接线以下方新批次为准，旧统计不验收后续实现，不能标整个编辑器完美。

首次全部truthy UUID选中，更新行保已有选择与临时时长、不自动选新行；切模型不改duration Map或脚本。resource显示行临时编号1..N，但planner读raw行/原镜号，10/30导入镜号不可被显示编号写回。固定mixed候选/默认/force sound、typed原键/规则、逐镜duration1e-9/invalid、全部资产ready和每行refs门槛按source，ratio冲突不另套generic resolver。null初始化和pure配置失败须有可见loading/error/reload，不假空库。

最大参考数用于窗口模型筛选，单镜仍走eq能力解析；真实mixed最小值2时1图镜头按源转text并清refs、2图镜头保mixed，返回警告并保存后显示。不能把所有新孩子固定mixed，不能为隐藏差异封杀source合法整组。新video空url/poster/image，真实asset refs→video及script→group，无sourceImageGroupId、hiddenUUID、advancedSettings或任务成功；脚本仅patch linkedVideoGroupId，临时配置/时长/selected不落script。

v2 portrait或star-video2 vendor复用60天真实linked asset证明，缺失/过期仅由可注入checkV2Portrait验证，不复用v1镜头图片reader或造审核成功。request绑定raw nodes/edges/models、reader/catalog/document；取消/并发/readonly/pagehide/卸载不写迟到数据。CAS严格true、一次草稿/history后flush同步committed图，Quota锁配置仅保存重试。成功返回画布，100ms后400ms/.15定位；新选择/pointer接管取消旧fit，空闲不扫描图/装global监听。

Modal800px/85vh、镜头list320px、每镜时长/只读prompt、普通模型chips，不加fee/通用高级区或底部cancel。菜单/tooltip挂dialog内，复用dialog-stack、逐层Escape/焦点；非busy Escape、窄屏clamp与事务锁是本机明确适配，不伪装source Escape行为。raw autoGroupPosition是source quirk，不声称嵌套world位置已优化。具体源、工程记录、入口差距及浏览器阻断见 [v2验收](./research/canvas-v2-video-functional-audit.md)。原生桌面/窄屏未完成，无新版截图；真实审核/生成/费用/协作、完整toolbar、手机/Safari和大图仍缺。登录注册/小号继续延期，本地更新未部署，整个复刻目标保持未完成。

## ScriptV2节点快捷操作维护（2026-10-12）

`node-toolbar-model` / `useScriptNodeToolbar` / `ScriptNodeToolbar` 分离source显隐四动作、请求owner和view。普通单选节点时显示“重新生成”“批量生成分镜”“批量生视频”和下载；全脚本busy隐藏，outputReady与CSV allReady不可合并，视频使用mixed最少1参考资格。v2旧通用编辑/复制条移除，legacy与普通节点保留。屏幕portal未clamp时按源32px间距，边缘/窄屏和普通单选是适配，reference/mark/focus显式target分支未接。

快捷入口复用原table/prompt/video/history/autosave controller，不另建writer。请求同步ref锁，flush后重新核对raw document/node/type/workflow/权限/选择；取消与迟到结果不打开旧窗口。活动trigger在pending时保持可聚焦，其他动作禁用，不能通过禁用opener造成回焦点丢失。portal pointer/click/doubleClick不拖动或展开节点，Space只阻冒泡保默认，Escape继续共享叠层。idle无新全图读取/监听。

下载读取flush后的全部raw CSV；重新生成沿源compact确认、无X、遮罩不关闭/ESC关闭，服务未连禁用开始且不清rows。该批图片直接接旧配置adapter；r3独立选镜/refs筛选/chips及sCvertical由下方图片批次接入，旧统计不验收新实现；视频接已有v2配置，仅建空组及引用。原生44计数页click仍0，该批桌面/窄屏与Space未验收，无新截图；联合11文件270项和实际App11项回归见 [快捷操作验收](./research/canvas-script-node-toolbar-functional-audit.md)，完整工程统计以验证入口为准。真实服务、完整renderer/视觉、显式target、手机/Safari及大图仍缺，无需登录/小号，仅本机修改未发布。

## 独立互动影游维护（2026-10-12）

用户授权的互动影游是新业务扩展，不是原站隐藏编辑器复刻证据。入口为 `/interactive-film?projectId=…` 与匿名 `/interactive-film/play/:releaseId`，项目页操作走独立 film repository。8 类节点、稳定输出端口、变量及断链/即时循环校验在 `services/interactive-film/`；文档与历史只保存 mediaId，小型 JSON 同步经 storage 写入、媒体 Blob 经 IndexedDB 成功提交后才引用。末次输入/离开保存、Quota 失败保留、未知版本/损坏防覆盖不变。

用户明确要求沿用当前LibTV Canvas和视频观看风格：画布默认铺满，顶栏、左侧工具和左下缩放延续现有布局；素材/变量及属性按需浮出，窄屏复用dialog-stack。节点以真实媒体画面为主体，选择、热点和QTE叠在画面内，不恢复固定三栏流程卡片或另设游戏主题。节点缩略按trimIn定位；预览持有可取消URL lease，换文档/素材/重试/卸载释放并隔离迟到结果。新作品使用当前固定bundle，历史release不随站点换版更改其样式或运行器。

通用图形几何、pointer、wheel、touch 位于 `features/editor/`；Canvas 保持薄适配及原生成规则、组世界坐标、复制与手势取消，不扩大跨域私有入口。影游热点坐标以画面内容矩形归一化；继承背景属性预览只推导确定画面，不把推导结果写成节点自己的素材。动态点击出口不猜末帧。

试玩、ZIP 和线上 release 共用纯 runtime 与 media adapter。选择的背景视频播至片段结束后冻结，媒体互动时间以实际片段局部时间推进；暂停、缓冲、后台隐藏及自动播放受阻冻结计时，epoch 隔离迟到事件且每次互动只能结算一次。离线包内嵌 classic IIFE 并按 mediaId 保留完整文件，未知真实字节阻断交付。

影游发布使用本项目 Functions/Public Blob，服务端配置 BLOB_READ_WRITE_TOKEN、FILM_PUBLISH_PASSWORD、FILM_PUBLISH_SECRET，无 VITE 前缀；口令只在发布时使用，编辑和观看无需登录。start/upload/complete/GET release 固定协议，许可限定路径/MIME/大小，head 实际资源后最后提交 manifest，完成幂等，旧 release 固定媒体和受信 bundle SHA-256。当前重试凭证仅在页面内存保存；刷新会创建新 release。应用上限 500 MB/文件、2 GB/作品，不等同套餐赠送额度。

`vercel:prepare` 必须先生成完整 Build Output，再替换静态样本并保留 Functions/config/routes，函数体积计入 90 MB 目标/95 MB 上限。新增真实函数加载预检防止编译通过但线上 `.ts` 相对 import 失败。仅 prebuilt 发布，不裁剪原 public、不全量采集。实际完整检查、Preview/生产验收及剩余边界见 [影游审计](./research/interactive-film-audit.md)。原 Canvas/Studio/Skill 的生成、支付、认证及运营写服务继续未接，原站整体复刻目标仍未完成。

## ScriptV2图片配置与节点交接维护（2026-10-12）

`v2-image-config-model` / `v2-image-graph-model` 只持纯 index表单、typed目录/参数与sC图片图计划，`useScriptV2ImageConfiguration` 持 owner/CAS/同步保存，视图与共享 `V2GenerationSelector` 分开。全局 image20 独立useContent，不能用34schema或专用子集替代。原raw index Set不因open期间rows变化prune，确认按当前raw升序；r2写schema key，图片typed值严格比较，video字段/时长保持独立。Nebula mode-object原r3崩溃用保default/空chips/说明安全适配，不套视频展开或任意禁建。

提交前flush原prompt，再重读published graph；fresh rows要覆盖state.rows而不偷偷改model，不能以旧非空prompt通过新空prompt。空图片及refs/labels/边、vertical普通壳与源ratio几何，脚本仅patch linkedImageGroupId。默认placement保source rawbox/margin50/向下最小轴/30iter，显式位置为本机精确override；36/66/36 grow结果一次原子计划，不开额外history。成功保父编辑器/选择/视口，不复用视频100msfit；Quota保已提交图与锁定配置，只重试持久化。源先close再等待及无真正rollback与本机CAS/失败保留是不同策略，必须记录适配。

关闭、切文档/节点、ready/readonly/选择/父overlay/busy、pagehide/卸载与旧callback按owner门控，idle不读图/订阅监听，dialog/menu/tooltip共用stack。行DOM身份使用source hiddenUuid??index，重排行保持原镜头焦点，选择/详情仍为raw index Set。联合12文件302项及实际App七项已通过；补行key后2文件26项通过，最终完整check300文件/3735测试与构建通过，准确记录见上方验证入口。45页原生计数仍0，桌面/窄屏未验收；退出渐隐、disabled专属Tooltip、完整renderer/target/toolbox/run-stop、真实服务、真机/Safari及大图继续缺。详细范围见 [图片交接验收](./research/canvas-v2-image-functional-audit.md)。无需登录/小号，仅本机修改未部署，整体目标仍未完成。

## ScriptV2卡片、状态与节点入口维护（2026-10-12）

- `script-card-model` 维护五种source形态、compact阶段/连接线、manual patch和task文案；`ScriptCompactProgress` 静态展示，`ScriptCardSurface` 分派形态，`ScriptCardTaskStatus` 只显示已有任务及本机TaskID复制。full generating/failed优先rows，recompute不得当完整任务；缺逐镜总线不拿task百分比伪造compact进度，缺权益不造benefit状态。
- 卡片阶段不点击导航。打开按钮/卡面双击保同owner的currentStep；只读、未ready和整节点生成中的新请求阻断并消费，解除门槛不重放。外部请求用当前raw节点校验，不以table上一帧投影授权。父CanvasNode的设置/双击也按同门槛，readonly显式向下传递。
- V2卡面交共享pointer拖动，buttons/portal/局部操作隔离；拖动收尾仍用shouldSuppressClick，不误展开。Space对button只stopPropagation、不preventDefault；既有legacy表格隔离与full navigation保留。弹窗继续EditorDialog/dialog-stack，不建立第二套焦点或滚动锁。
- manual失败保同一draft/baseline/hiddenUuid和错误，重试经原table writer，不造新行或第二条history。TaskID复制用公共clipboard服务和doc/node/kind/taskId身份，卸载/换owner忽略迟到结果，反馈明确本机操作。
- 来源、实际NodeCanvas回归与范围见 [卡片验收](./research/canvas-script-card-functional-audit.md)。46独立计数页原生点击仍0，原生桌面/窄屏/Space/手感未验收；该历史批次未接的empty preset与hint由下方最新批次更新，yielded/实时task总线、显式target模式、真实服务及大图仍缺。无需登录/小号，本机源码未部署，不替代独立影游生产记录，整体目标未完成。

## ScriptV2空态预设与本机参考建图（2026-10-12）

- `script-preset-model` / `useScriptV2Presets` / `ScriptEmptyCard`分别维护纯目录资格/完整建图/源store避碰、动作owner与保存重试、三提示视图。仅两种preset创建输入图，manual仍走原table空行与全屏confirm-shots；不伪task/生成rows或主动fit/改选。原name仅缺名才由store补齐，不给已有同名编造后缀。
- `public/data/script-presets.json`保完整代表性544字原文、207字prompt和两原URL，经useContent加载且部署样本清单登记。目录失败/加载/损坏按动作独立禁用，手写不依赖目录；reload拒绝由allSettled消费，不把加载失败当空库。素材已有asset-map映射，不扩大采集。
- 根资源前置、原handles边追加、角色params整体替换，不合旧model。raw位置、measured→stored→350碰撞盒、margin50向下/30iter是源store规则；没有callback指定的width/height不写入。一次共享CAS/history投影末次草稿，同步发布后flush实际graph；Quota保原ID/图和错误，仅保存重试，目录后续失败不重跑建图。
- 创建锁在外部cancel callback前设置；旧render create/retry须核捕获documentKey/scriptId。manual入口按owner token、ready/readonly及fresh raw empty card门控，await后再确认身份才开编辑器。切文档/节点、删除引用或边、readonly/ready/overlay退休旧save owner，不通过retry复活已删除数据。
- 来源与实际验证见 [空态入口验收](./research/canvas-script-presets-functional-audit.md)、[预设source](./research/canvas-script-preset-source-audit.md)、[空态view](./research/canvas-script-empty-source-audit.md) 与 [只读复核](./research/canvas-script-preset-controller-review.md)。专项7文件118项通过，最终完整检查以上方验证入口和历史为准。浏览器拒绝临时data协议检查页，没有新增native/桌面窄屏/手感或截图通过声明；用户Vite5173保留。
- source pending另有专用SCRIPT_V2 GeneratorFactory，本机尚无3项scriptText目录、TEXT content参考同步、script-generate-v2参数及专用view/submit。不得套普通text generator冒充完成，界面“脚本生成暂未接入”是明确本机边界。真实生成/费用/审核/协作和运营写服务、task总线、显式target、工具箱/角色完整操作、真机/Safari与大图继续另验。登录注册/小号延期，本机改动未部署，不替代独立影游冻结生产，整体复刻目标未完成。

## ScriptV2专用生成器、草稿channel与保存恢复（2026-10-12）

- 上方历史批次的专用generator缺口已补输入/参数/view/本机提交前状态，不把历史描述当当前状态。`script-generator-inputs/model`保持纯source协议；独立scriptText三项metadata经useContent，不展示普通模式/数量/高级设置。已有params保留、默认model不偷偷改目录外值，原规则用upstream TEXT content满足prompt，真实任务未接时不造loading/taskId/rows。
- `useScriptV2Generator`核对capturedowner和fresh raw、last-render prompt baseline，typed reorder只改该order、不改普通媒体token；专用组删除计全部展开leaf，未完成/REFERENCE也计数。删除同CAS重建current source_images，保其他payload与nodeID级引用，不复活旧params。source prompt w清Magic并按条件压缩CameraPreset，显式写入和最后150ms快照共用同一pure规则。
- `useCanvasDrafts.register`第四参channel默认default；同node新generator用script-generator、compose仍default，cleanup只退休同channel同entry，投影/retained/ack不互相覆盖。初始化只display投影，避免mount/undo制造history，用户动作才持久source初始化。这是本机安全协议，不把source系统sync称用户提交。
- Frame16world/逆zoom、660宽/sourceexpanded字段不改raw node bounds；窄屏clamp保明确适配。共用dialog-stack，button Space与dblclick隔离。portal断开旧expand按钮时只在BODY回焦点到新控件；beforeTransition严格false阻断重挂，保失败草稿，不建立另一个滚动锁。
- `useCanvasAutosave`持稳定文档saveError/retrySave，Header原保存状态仅真实失败显示重试；选区隐藏或参考预览卸载inline不会丢唯一恢复入口。retry限定当前storageKey/loaded/readonly/actor，flush旧doc不更改新doc saved/error；只保存当前图，不能再创建图/history。具体一次CAS和Quota650ms实际回归见 [生成器验收](./research/canvas-script-generator-functional-audit.md) 及 [接线审计](./research/canvas-script-generator-integration-source-audit.md)。
- 正式联合12文件208项、完整314文件4155测试通过，准确快照以上方验证入口为准；CanvasPage923.04kB/gzip304.97kB超900kB提示待合理分包，不关闭规则或抬阈值。Root尚未接source新增参考三动作，真实生成/费用/翻译/语音/协作和运营写服务、全部显式target/参考细节/Tooltip、真机/Safari/大图与原生手感继续缺。本机未部署，无新增native/截图通过，登录注册/小号延期，整个复刻目标仍未完成。

## ScriptV2参考交互与按需入口维护（2026-10-12）

- 上方314/4155为历史专用生成器批次；新增参考三动作、reference target和分包已由本批接入，当前检查与原生范围以“当前工程验证”和 [参考验收](./research/canvas-script-reference-functional-audit.md) 为准，不将旧缺口文字当现状，也不将本批扩为mark/focus/capture全部实现。
- `domain/reference-pick-model` 只维护source候选/世界框/建边/第一direct edge断开；`useCanvasReferencePick` 持mode、pointer与文档身份。explicit target OR 普通sole selection不强制改选，连续accepted selectionChanges同RAF保次序；pane click只追加target、不写图。Escape/退出不清选区，返回400ms；mode暂停drag/connect/select/delete，平移缩放保留。
- 参考建图与本机FileReader位于storyboard import model/hook，原MIME/30MiB输入界线与本机校验分开记录。canvas-owned读取不因inline隐藏丢失，native picker尚未返回也须在失效owner时退休；切文档/readonly/失ready/删除target/full generating取消且忽略迟到结果。失败保队列，成功项目不重复；Quota只重试保存当前图。localMediaReady仅表示本机内容可用，不伪造服务器上传。
- 个人库复用共享picker/dialog-stack，serialized items找首合法IMAGE；旧本机URL adapter独立注明，不将团队权限或detail服务当已接。部分资产成功须记item ID防重试重复，nested预览回原控件，完成关闭后回原输入。最后150ms剧情先投影，再专用source_images同raw CAS/history提交，缺schema保旧参数。
- `CanvasGeneratorEntry` 只在显示入口挂载时加载两个实现，局部loading/error/retry与owner隔离；generic readonly仍可显示，Script caller按源隐藏。旧CSS保持eager顺序，模型不反向引用UI。正式模块图与最终dist字节分开：Vite后续import-analysis会添加mapDeps，不能把早期generateBundle大小称最终产物。无阈值抬高、manualChunks、全量内容采集或部署。

## 参考手势与普通多文件读取维护（2026-10-12）

- 参考rectangle保起始client，move/release都以当前view转换两端；release重算末位，cancel/lostcapture不提交。source任一轴>5激活/两轴>=5绘制，屏幕cv-reference-pick-box独立于普通world框，不改变explicit target OR普通sole-selection资格。
- release只读当前board的实际node shell尺寸，交纯collector，保measured→stored→200/120及祖先规则；不把测量写进文档/history。返回用centerCanvasView/current zoom/400ms，嵌套世界位置是本机适配，不以fitView突然改变比例。
- reference与ordinary owner互斥使用实时isPointerActive getter；已拥有手势的其他pointer事件返回consumed，不可拒绝后又落入另一个pan。childlostcapture不退休board捕获，blur/hidden只取消临时框。Mask必须传原事件共用尾click保护；新pointerdown在isolated/editable早退前清旧guard，detail0键盘激活保留。
- 普通upload首await前Array.from完整FileList，保File对象，再用可取消领域读取。input.value清空不能影响本批后续项；读取后追加最新nodes/保最新edges，一批一次history，失败继续与切文档取消照旧。不得用数组夹具代替live FileList回归。
- [手势验收](./research/canvas-reference-gesture-functional-audit.md) 保存source、本机适配、App/hook回归和原生证据。该手势历史批次仅完成focus/mark源码调研与focus纯模型39项；后续图片focus已接线，以下方最新聚焦维护记录为准，Mark识别仍缺。无需登录/小号，线上影游冻结产物与本机检查保持独立。

## 图片聚焦、指针所有权与按需确认工具（2026-10-12）

- `generator/focus/` 分离纯区域/图计划、`useCanvasFocusMode` owner controller、Surface/ModeBar/ConfirmBar、FocusAttachment及natural像素crop。schema resolver决定模型入口，target explicit与普通sole selection分开；standalone父组和source storyboard child各用源精确规则，不猜节点publishProtection代替全局project保护。普通本机upload不因localMediaReady误获生成器focus入口，保旧资源通用入口的下游契约差距。
- Confirm先投影最新draft，focusRegion/originImage/camera_focus/ratio与至多一条源边一次CAS/history/flush；保其他params。删除清三字段并只删首边，模型降级保末次prompt。Quota仅重试当前已接受图，不重复历史/连线；只有确认自动退出需要flush成功，手动退出/返回/Escape保已接受图，顶部文档可重试。configLocked门控enter/fresh/confirm，renderer禁用edit/delete，不泛称全部底层API禁写。
- document owner与每次mode object隔离A→B→A和旧API；第二pointer、普通拖动/连接/参考互斥。blur/hidden/pointercancel仅取消在途pointer并恢复前一pending，不退出整个模式；文档/能力失效及卸载退休mode。Escape先由现有菜单/dialog消费，再清pending、再退出，不新增焦点栈/滚动锁。源resize最后min产生的可达几何允许端点最多1.02+ε，保原数学顺序，不额外clamp破坏后续编辑。
- Confirm是non-modal bodyportal，按实际surface rect定位，transform transition期间跟随，统一RAF/observer/owner清理。<=600按实际bar宽度clamp8px；mobile ModeBar用max-content和局部max-width，title保持一行、副标题正常换行，actions不缩小。桌面原布局保持，390/320只证明本机布局，不称原站真机像素。
- `FocusConfirmEntry`在mode开启时真正dynamic import预加载，region形成后才显示；失败保pending并允许重试/取消，cache reject清除。opaque owner/退出/卸载拒迟到publication与旧retry，CSS保持原eager级联。不得静态重新导入ConfirmBar、提高900k阈值或使用manualChunks掩盖增量。
- camera_focus校验允许无额外prompt，originImage提供hasImage，普通参考排除focus源；生成仍明确服务未连接，不造红框上传/token/pre-sign/费用或任务。native和失败修复、actualApp/storage/history、337/4500最终检查及未完成范围见 [聚焦验收](./research/canvas-focus-functional-audit.md)。本机未部署、不覆盖影游冻结生产记录；无需登录、小号或账号资源。

## 元素标记、草稿清理与实际画布宽度维护（2026-10-12）

- Mark入口只静态持target/capability，controller/Surface/ModeBar和source验证由真实dynamic Bridge加载。IMAGE与VIDEO按各自schema门控；VIDEO仅接收，IMAGE首项可自身来源。默认source.available=false，读图前准确提示未连接，禁止按点击位置/文件名猜label/bbox。
- 请求id为sourceImageNodeId，raw自然尺寸PNG与归一point/lang为payload；AbortSignal独立，服务返回合法id/suggestions后才把prompt/magicList写receiver，不增edge。计数按20个合法occurrence；稳定ID为serviceId_pointIndex。文档/mode/request opaque owner、URL数组内容、StrictMode/取消/迟到finally共同回归。
- 图片候选只改第一个token，prompt菜单改全部同ID；两者不合并。识别pending不锁已确认旧点操作，迟到响应合并末次输入。Core在显式prompt patch和draft projection清未引用metadata，保其他params和referenced identity；删最后token后，同mode有效临时point仍可选/删。普通prompt CtrlZ只恢复raw文字，不能宣称完整metadata/badge undo；真实Mark图事务undo另验。
- 所有接受图一次CAS/history/flush，Quota保图只重试保存；退出不回滚已接受prompt。展开frame启动Mark不收窗，子菜单/Modal首Escape先关顶层。Surface不得加nopan拦现有Space/中键/抓手；原生抓手已验，原生持续Space/Alt仍另验。
- CanvasScriptNodeEntry只缓存模块代码，同owner不重挂内部草稿/selection，旧owner迟到不显示；真实卡片/toolbar mount前由test等待实际控件，不替换旧强断言。完整22份CSS-only按旧static DFS保序，Script chunk无CSS，移除5条新load-state规则后Canvas CSS与旧基线逐字相等。
- useInlineGeneratorPlacement返回{center,width}，普通/ScriptV2/加载错误态三个caller共用实际board宽；合法原center精确保留，仅横向溢出clamp，宽度与定位同源，Observer退休拒迟到。此为已观察888px/Agent缩窄的本机适配，不改节点/相机/图历史，不冒称竖向自动翻转。
- 最新范围、初次format/旧lazy等待失败、完整check、原生与受控区别见 [元素标记验收](./research/canvas-mark-functional-audit.md)；此前聚焦/参考记录为各自冻结快照，线上影游发布保持独立。

## 节点松手边界与抓取可达性维护（2026-10-12）

- 共享Pointer end只在node手势已moving时处理末次up坐标；无move/阈内move后大up不能首次创建拖动、Alt复制、history或保存。已开始拖动保最终落点，pan/box/link不借此删除合法release事务；Canvas/default shared与实际App回归共同维护。旧drag IDs fixture补真实move，不削弱原图/选择/parent断言。
- source普通XYDrag在move起拖，virtual iF在down调用start/copy、end flush既有delta；不可混写源时机。本机4px阈值、延后复制和started最后up投影是明确适配。原生click/drag/undo/redo每步GUI导出与受控up-only事件边界分开记录；前轮综合坐标变化没有逐手势证据，不倒推已确定根因。
- canvasCapture是前图URL→callback，归档t4没有消费onCanvasCapture，可见入口未证实；原站第三资产create/list writer不能伪装本机截图。保留source互斥/Escape/reset/序列化精度，不凭locale或dead callback创造区域截图按钮。后续区域裁剪/全景/视频帧/视口截图须按各自真实入口调研，见 [可达性审计](./research/canvas-capture-view-source-audit.md) 与 [服务审计](./research/canvas-capture-model-source-audit.md)。
- 该节点松手批次的完整检查及1100 SHA冻结入口以上方历史记录为准；包含同期Studio工作，首轮CSS漂移与最终重新检查分别保留。生产影游、登录/小号延期与真实服务边界保持；本机未部署，整个复刻目标未完成。

## VIDEO角色库与引用事务维护（2026-10-12）

- `services/canvas-role-library.ts`集中typed／可取消reader与独立writer capability，缺省unavailable；Public匿名目录一次读得code10001未授权，不重试账号、不造目录或认证。`roles/`分别持纯容量／时效／上传规格、纯图计划、owner controller、views与真实媒体reader。三URI与rb的subjectList协议分开，不创造canvasCapture入口。
- 图计划保普通引用，仅删除对应首边并保node；IMAGE／VIDEO／AUDIO管理判据及证书投影不同，InPlace不能一概排除。自然尺寸await后重读末次prompt／图与能力；asset URI只由真实record解析，不猜URL。一次CAS／history再flush实际接受图，Quota保ID／选择，仅save重试；Public同选择／source／owner重交canonical payload，不重复审核writer。
- `commitGraph`的`explicitPromptNodeIds`只控制next普通draft投影，previous历史仍含末次草稿；script channel与其他节点照旧。controller先用`patchCanvasMagicPrompt`清孤立metadata，CAS成功后prompt的`acceptCommittedValue`消费文本并取消旧timer，不发第二次onChange/history；拒绝则保草稿。引用删除后同baseline、150ms timer／pagehide与undo／redo共同回归。
- 角色弹窗／预览／删除confirm的React portal必须隔离click与pointer／dblclick；根保既有nopan标记，使祖先CanvasViewport捕获阶段的begin先识别隔离，不仅止于bubble。防背景node失选／inline卸载，共用dialog-stack／背景隔离，Escape回稳定入口。角色chip Space keydown只stopPropagation保默认，避免全局pan截获。桌面与390／320验证和失败证据存本批审计，正向目录／认证fixture不称native服务通过。旧CSS相对顺序与真实generic按需分包保持，不抬900k阈值。
- 实际范围、初轮检查后native漏click及重新冻结结果见 [角色库验收](./research/canvas-role-library-functional-audit.md)。真人VisualRecord／group／rename／sign／QR、历史图库selector、VIDEO／AUDIO重新审核writer、主体rb仍有前端缺口，不能称只剩服务器。真实生成／审核／运营写服务、真机／Safari／触控／高频修饰手势／大图继续另验；不覆盖影游冻结生产，整体目标仍未完成。

## 普通参考删除、图与输入协议维护（2026-10-13）

- `generator/reference-incoming-model.js` 与 `reference-reconciliation-model.js` 为纯规则，actions 只计划、GraphActions 持 owner／draft／CAS／history，Inline 消费成功后的实际 raw prompt。VIDEO reorder 与 ordinary delete 的 malformed／unknown token 和空白规则不同，不合并成常见正则替换；IMAGE排序保 literal 的范围不扩为删除。
- 旧映射优先合法 raw typed arrays，包括显式空数组；只有 absent／非法列表适配本机可见 refs。old mixed 依旧 typed/order 生成，混合转换按旧 mode/model，不借新 inferred mode。保留 source `asset://` 大小写、URL首项与metadata，不把target.refImages或UI focus排除套进store collector。
- 组按parentId和源顺序递归计全部leaf，含非媒体／空URL，depth8及character边界独立；不是按可见参考卡数删组边。直连只删首边，source node保留，detach清该组excluded；无matching edge/group的stored asset无另造参数writer。
- 删除读最后prompt先清Magic，previous包含最后草稿，explicit next不再投影该target旧draft；其他节点正常投影。一次raw CAS/history，失败保图／草稿。成功后的acceptCommittedValue只取消timer并消费接受值，不追加onChange/history。Quota保接受图，仅Header保存重试，不能再次删边。
- Role final after共用collector/token；Role初始UI／容量adapter仍有差异。pictureEdit最后video断边reset、submitted segment清lock/draft/SegmentRange、editing continuation cascade、全局删除与style/lens/focus是已知source前端缺口；源按钮只readonly门控，不能把锁说成分支不可达。
- 379／5193与1135冻结证据、原生／受控／旧失败的准确范围见 [删除验收](./research/canvas-reference-delete-functional-audit.md)。维护之后只改文档／proof并定向format、SHA复核；本机未部署，生产影游独立。登录／小号延期，整个复刻目标仍未完成。

## 整图删除与确认维护（2026-10-14）

- `domain/destructive-delete-model` 只持纯图计划，`generator/reference-recalculation-model` 持旧 mode/token/locks/style/lens/panorama；GraphActions 持 fresh owner／全部末次草稿／raw CAS／一次历史，成功发布后 consume 普通 prompt，不预先清输入。node／edge 的 iv／iu／ih／ig 调用差异按 source 保留。
- UI 删除 group／video_group 是 parentId 子树；直接父组缩小／剩一项解散与 p2 child／行绑定按源顺序，不能改成旧只删壳。raw 剩余孩子完整世界坐标与 bounded surviving-group consumer 重算是明确本机适配，后者仅 UI opt-in，不伪造 source 自动下游传播。
- `useCanvasDrafts.register` 第五参 accept 消费已提交 prompt 并取消旧 timer；draft kind 按 scriptPrompts 结构而非 channel 名判断，缓存成功读取类型；后续读取失败不跳过已确认普通 prompt 消费，也不丢真实 script rows。删除 owner 退休全部 channels，旧 cleanup 不影响新 owner。
- 删除确认纯规则／owner／view 分离，共用 dialog-stack。键盘与菜单条件分别保持，菜单传真实 nodeId；fresh model／settings／locks 变化使 request 失效，prompt／位置按源允许。取消无图副作用，失效 A→B→A 与旧 callback 不复用。手型／Space Delete／Backspace 早退，SVG 双击隔离原 pointer/选区与添加菜单。
- 388／5370、1150冻结、首次旧例失败与修复、99片段校验及实际桌面／390范围见 [整图删除验收](./research/canvas-destructive-delete-functional-audit.md)。script／关联分镜组断线确认与 unlinkStoryboardByEdge、VIDEO_CLIP async mD／源锁／history事务仍有前端缺口；真实服务、手机／Safari／大图继续另验。本机未部署、不改影游冻结生产、登录／小号延期，整体复刻目标保持进行中。

## 分镜断线与共享确认维护（2026-10-14）

- `domain/storyboard-unlink-model` 持raw类型/actual child/source binding资格、notice与preserveEdge纯计划；`node-data-update-model`只实现本次unlink的t4/t5/t6/resourceMeta，不宣称完整loading/prevTaskInfo已覆盖。legacy与group/group、image优先、target到source video按源；raw V2直接边仍普通。
- editing失源先于warning，不加节点类型门槛；UI与公共API都在最新投影后复核。全部末次channels先project，再unlink/raw delete/一次raw CAS/history，成功后consume；拒绝/投影失败/竞争零写零consume，quota只重试保存已接受图。
- node/edge共享 `useCanvasGraphConfirmation` opaque owner；文档/ready/readonly/unmount/A到B到A退休，旧confirm/cancel不改新request。binding或同ID edge实例变更拒绝，prompt/rows/position可读最新继续。复用dialog-stack，源文案/无X/backdrop不关/Escape/双击message全选；scoped eager overlay联合selector防旧lazy padding覆盖。窄屏导出图标有accessible name。
- 393/5459与1161、真实App14/owner28/API6、native16断言/11GUI及首轮focus等待修正见 [验收](./research/canvas-storyboard-unlink-functional-audit.md)。本机owner/原子CAS/失败保request是明确适配，不冒充source async锁/history；mixed batch、clip异步前端、原透明hit/剪刀及完整renderer继续未完。无需登录/小号，本机未发布，不把测试数当复刻率。

## 选中删除与剪辑断线维护（2026-10-14）

- `domain/selected-delete-model`持RF候选／初始warning／flags／分派纯规则，`batch/useCanvasSelectedDeletion`协调键盘、剪刀、异步阶段及一次关联warning。RF候选按nodes一次扫描；初始确认只看flow.type、接受后同时设置两个flags。ordinary先同步、clip／editing启动后继续selected node，不等待后置关联回答；取消仅保关联子集，不回滚此前普通阶段。
- `useCanvasGraphActions`统一最新全部draft、raw CAS、成功消费和可注入history writer。editing为raw `ui:false`，selected为UI `ui:true`，两者组删除规则不可合并。关联cohort先按旧图全部资格通过，再按源顺序helper并一次删边；old warning绑定／edge incarnation变更拒绝，prompt／position仍可读最新继续。
- `useCanvasDeletionHistory`是本机full-snapshot桥：microtask只结束coalescing；接受graph才发布before，晚确认另起segment，undo／redo先成功flush末次draft。仍为本机50条快照，不能冒充源100条patch／版本冲突／协作历史，也不能把所有mixed固定一次undo。键盘Delete／Backspace latch仅门控重复dispatch，keyup／blur／contextmenu释放，输入／inert／hand／Space继续禁新发起。
- `clip-disconnect/`纯timeline／track／disconnect与controller／hook分离。mD在ordinary之前预检，缺timeline可删边、busy保边；按target批准整事务，时间轴patch先于ig，不调用raw iu／ih。确认flags的源raw bypass独立于未确认clip拒绝，无授权／取消／退休不得fallback删边。
- `useCanvasClipDisconnectPort`明确 `local-workspace`，每operation signal隔离receipt、commit与release，旧无signal API另桶；signals／opaque owner不得写文档。取消／timeout的未授权release不能减另一操作lease，模式／文档／ready／readonly／Strict退休旧owner；不代表真实团队持有人、原站授权或云锁。
- 原生用公开作品“创作过程→复制项目”和真实GUI导出，不注入storage／graph／events。当前无整画布GUI导入，历史`.libtv`仅归档扩展名，下载实为JSON。断线时间轴数据验证不等于完整VideoClipNode／editor；聚焦实测仍为通用占位／inspector，是后续明确前端缺口。source与实际验收统一见 [本批审计](./research/canvas-selected-delete-functional-audit.md)，无需登录／小号、本机未部署，整体目标仍进行中。

## 剪辑编辑器接线维护（2026-10-14）

`clip-editor/` 已接入专属 VideoClipNode、四种合成模式、真实 URL metadata／首帧准备、预览高度同步、时间轴编辑与独立播放 runtime。播放进度通过 controller 的编辑器订阅更新，避免每帧触发整个 Canvas 重渲染；时间轴素材连线变化使用画布 CAS，时间轴编辑使用独立十步历史。A→B→A、StrictMode、迟到 metadata、非权威素材追加、quota、外部冲突和显式恢复副本均有真实 GraphActions/Drafts/Autosave 回归。

公开源 bundle 的片段级转场状态已接本地时间轴：主轨相邻片段的右片段保存 `transitionIn`，支持 `fade`／`crossfade`、`dissolve`、`fadeblack`、`fadewhite` 与相邻片段时长限幅；时间轴显示可聚焦转场标记并可选中右侧片段，写入现有历史/CAS。画面转场预览、全局字幕／HTML、真实导出仍必须保持 unsupported 状态，不能把本地 `transitionIn` 当成服务器导出能力。

初始接线快照曾为剪辑域13个测试文件399项、媒体runtime专项49项；该数字和 `artifacts/canvas-clip-editor-full-check-current.log` 仅保留为历史证据。实际浏览器已核对真实双视频片段、时间轴、准备完成与可见错误态；冷启动远端资源可能超过15秒metadata窗口，必须显示超时并允许重试，不可假装ready。当前修复后的确切范围和检查结果见下方“剪辑撤销与恢复副本维护”。

## 剪辑撤销与恢复副本维护（2026-10-14）

剪辑直接删除／拆分／裁切／轨道控制现在在图提交前捕获旧时间轴与选择，撤销／重做会按真实 controller 状态同步节点、来源边、本地保存和选择。当前会话缓存已验证的 source URL metadata，来源因撤销暂时离开再连回时不会误锁整个时间轴；新 URL 或未验证来源仍必须等待真实 metadata。播放准备进入异步 preparing 时保留已有编辑就绪意图，错误和未准备的初始状态仍保持阻断。

冲突恢复副本继续只存在页面内：打开最新 raw 时间轴后，显式恢复会保留副本素材集合并以 `sourceNodeIdsOverride` 作为待保存边集合；原图和 storage 在关闭前不变，关闭时通过画布 CAS 删除最新多余来源边、重建缺失边并序列化来源 ID。恢复副本在 metadata／首帧准备完成前禁止 Escape 关闭或切换节点，失败保留副本与当前错误。

本批剪辑撤销／恢复、片段字幕/转场/音量增益线与拖入素材专项通过；该历史批次 Node24.19.0 完整 `npm run check` 为 **431 文件／6353 测试**，格式、零警告 lint、核心 strict 和生产构建全部通过，最新检查以“当前工程验证”为准。拖入仅接收视频／音频，按目标世界坐标、incarnation 和一次 CAS 创建节点与边，权威时间轴在真实 metadata 就绪后加入待处理片段并保留恢复来源集合。音色筛选输入已覆盖语言／口音／性别搜索、清空和依赖重置；Studio 导入 mesh 已支持来源材质颜色覆盖、灯光类型/属性、撤销／重做和刷新恢复，顶层对象已支持源证据的复制/粘贴/重复快捷键、播放速率/缩放/进度键盘，完整材质参数仍缺。资产库文件夹封面支持从子树图片设置／清除与坏图回退；Agent 资产选择器按当前目录只显示直接子目录；混合删除确认校验候选 edge identity，避免旧请求误删新边。剪辑器收起预览在节点不可见时停止有界 portal 重试并提供回到节点；Studio 子节点删除使用稳定 path tombstone，恢复原 parent/index 并过滤导出轨道；Studio 键盘已接镜头 waypoint、工作区与相机视图导航；项目页补齐排序和移动到文件夹，挑战赛列表补齐分页、续载和错误重试；学院目录切换课程时恢复默认展开组并保持当前章节所在组展开，播放器桌面音量支持悬停/聚焦纵向滑块和完播遮罩关闭，跟练侧栏支持上一节/下一节；Canvas `shot-breakdown` 已接专属逐帧拉片卡片、真实画布点选替换和生成前媒体 ListOrder；学院文章页保留登录门槛并提供 source/itemKey 画布入口。该结果是本机当前源码验证，不改变已发布生产版本，也不代表真实云锁、协作、生成、费用、拉片任务、全局字幕／转场画面、WebAudio 跨浏览器、真机 Safari 或高 DPR 大图已完成。

字幕、转场、真实波形／帧缓存、服务端导出、WebAudio 多轨在真实浏览器的全部 autoplay／高倍速分支、云锁／协作／生成／费用、真机 touch、Safari、高 DPR、大量节点性能仍未验收。登录注册、小号、原站账号资源继续延期；本地演示不代表真实服务。
