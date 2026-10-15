# 工程扩展性与可维护性审查

日期：2026-10-10。方式：只读代码、依赖和目录审查；不是运行时验收。下文前半部分保留重构前历史状态，当前工程结果见文末 2026-10-11 记录与 README。

## 当前判断

工程已经可以按业务域扩展，路由、共享 UI、文档操作和复杂编辑器各有边界，并有可执行的依赖约束与回归检查。当前仍保留较大的编辑器协调组件、部分 JSX 和旧 CSS 级联；运营写服务与全量 UI 类型覆盖尚未接入。以下“已有基础 / 主要问题 / 整理顺序”为2026-10-10重构前记录，不能再当当前源码状态。

## 已有基础

- React + Vite 使用常见生态，依赖清单和锁文件齐全。
- 页面、组件、服务、静态数据及研究证据已有目录区分。
- Gallery、Modal、Icon、VideoPlayer 可复用，3D 编辑器按需加载。
- services/api.js 定义统一请求、错误及服务器地址入口，能够继续演进为业务服务层。
- AGENTS.md 与 coverage.md 保留研究范围和验证状态。

## 主要问题及影响

| 位置                                           | 证据                                                                                 | 维护影响                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| src/App.jsx                                    | 手写条件路由，同时包含布局、登录、会员及全局弹窗，约 23 KB                           | 新路由及全局交互容易互相影响                       |
| src/pages/PrimaryPages.jsx、SecondaryPages.jsx | 多个业务域聚合，分别约 29 KB、79 KB；大量超长行                                      | 单功能改动难以定位、评审与独立验证                 |
| src/pages/CanvasPage.jsx、StudioEditor.jsx     | 状态管理、持久化、键盘逻辑和渲染集中在组件中                                         | 编辑器功能继续增长时复杂度上升                     |
| src/data.js、SecondaryPages.jsx 等             | 接口层只接入共享内容 hook，其他直接 fetch 和 localStorage 写入仍存在；失败被静默降级 | 服务接入不完整，缓存、错误与数据形状不一致         |
| src/styles.css、src/pages/secondary.css        | 全局 CSS 和追加覆盖，约 51 KB、77 KB；原文件行数不足以反映体量                       | 页面样式改动容易产生跨页回归                       |
| package.json / 配置目录                        | 仅 dev/build/preview，没有类型、格式化、lint 与回归检查配置                          | 业务扩展和多人协作缺少约束与可靠验证               |
| public/                                        | 素材约 805 MB、数据约 224 MB                                                         | 构建、分发和内容更新成本高，不适合作为运营内容仓库 |

## 2026-10-10 重构前整理建议（历史）

1. 格式化源码，添加 lint 与开发者说明，使代码可读、可审查。
2. 用路由表和布局组件拆分 App，按 gallery / skills / projects / assets / academy / canvas / studio 等业务域划分。
3. 建立数据契约和业务 service/hook，统一内容、持久化、缓存及加载/错误状态，隔离本地样本与服务器实现。
4. 将编辑器状态、历史、节点操作和文件操作移入独立模块；收拢全局 CSS，使用页面作用域与统一样式变量。
5. 将额外研究素材归档，运营内容使用 API/CDN；针对路由、筛选、保存/恢复和编辑器核心操作增加回归检查。

用户已延期真实登录注册、原站登录态核对及小号/账号资源使用。上述结构整理不依赖账号，也不应将实际认证接入作为当前前置条件。

## 授权结构优化后的结果（2026-10-10）

上面的审查保留为重构前的历史状态。用户随后授权结构优化，已完成按业务域拆分、路由/外壳/弹窗分离、编辑器模型与 hooks 分离、统一内容/存储边界、核心 TypeScript 契约、格式/lint/回归工具及恢复式素材归档。App 现为 37 行协调入口，旧多页面文件变为兼容出口；CSS 按原级联顺序拆分，而非宣称已实现完全样式隔离。

最终统一检查通过（27 文件、118 测试，格式、零警告 lint、核心类型及生产构建）。开发与扩展指南见 `README.md`，真实浏览器核对和遗留功能边界见 `research/coverage.md`。运行内容仍约 924 MB、现有 JSX 尚未全面类型化、项目等写入仍为本地演示；实际运营服务器接入与整个原站功能验收没有被这次结构优化替代。

## 后续工程边界优化（2026-10-11）

App 当前 43 行，继续只协调路由、外壳与全局 UI。SkillPage 从 587 行拆为 285 行页面、249 行输入视图和 160 行状态 hook；编辑器引用、URL 消费和附件生命周期保持同一个 controller。公共选择器/详情/案例和卡片提取至 `components/skills/`，Mine 权限通过插槽包装；公共纯规则不反向依赖业务页面。

资产与 Studio 写画布通过 `features/canvas/document-api.js` 的小型入口。远端资产选择器分离 strict TS 的分页 hook/模型，可注入 source，Collection.list 传递 AbortSignal。创建文件编辑器拆为 TipTap/CodeMirror、diff 纯算法和视图；播放器拆出控制栏、抽屉、浮窗/视口/冻结帧生命周期，页面直接引用所属域播放器。

新增 ESLint 依赖方向规则和真实 Linter 回归，约束共享层、服务层和跨业务私有引用；同时封住旧 data.js 与静态模板 lazy import 绕过。兼容 re-export、公开页面入口、省略扩展名的文档入口及既有样式顺序保留。这些是当前可执行的维护约束，不代表全 UI 类型化、完全 CSS 隔离或已接运营写服务。

## 本批编辑器职责拆分（2026-10-11）

Canvas 的手势、草稿投影、多选动作、分组坐标、执行计划和节点提示词已各自落入 hook / pure model / view。生成参数共用 controller，模型 / incoming 同步与显式参数编辑分开；150ms draft 不依赖卸载后的 React render 才能保存。Studio 相机纯数学、原场景 extras、恢复、实际运行与导出各自独立，界面不负责 Three 轨道求值。

当前结构可以按业务域扩展，并有依赖边界与关键状态回归约束。编辑器页面仍有较多协调 state / props，JSX 未全面类型化，旧 CSS 级联未完全隔离，运营写服务和完整原站功能未接；这些是后续可维护性工作，不能用本批通过检查取代。

本批完整检查通过：156文件 / 796测试，格式、零警告lint、核心strict TypeScript与生产构建；日志artifacts/canvas-inline-batch-camera-final-check.log。本轮结构优化已完成，整个复刻目标与运营接入仍以coverage的未完成范围为准。

## 最新职责收敛（2026-10-11）

用户再次要求工程结构优化，本批将 NodeCanvas 的节点命令、Agent状态/动作、统一快照/复制分享提取到3个私有hook文件，入口由939行降至712行。Node actions绑定文档身份并取消上传；读取结果functional append保留期间的nodes/edges，切只读或失去ready也取消；snapshot actions屏蔽旧文档迟到剪贴板反馈，保留草稿投影和存储协议。

Studio提取借用型viewport-frame，useViewportScene由273行降至199行，保持hook独占所有资源与清理；真实RAF和截图走同一最新参数入口。Storyboard兼容媒体网格被拆成model/controller/views，可选脚本表格暂未接运行入口。Node prompt 增强候选以纯规则、可取消source、controller和view隔离，caller没有已核实validator时不启用；ghost/Tab仍是明确差距。

ESLint新增域内模型→UI/hooks/CSS禁止方向及真实Linter用例。开发运行版本写入.nvmrc / package.engines；GitHub检查工作流使用官方固定commit和只读权限、同跑npm run check，当前未配置远端故没有远端CI结果。Canvas域维护说明明确扩展位置和async所有权；根AGENTS/agent持续区分运行入口、测试adapter和未接服务。

本次优化保留既有视觉、路由、存储key与JSON格式，不新增认证、账号资源、真实生成、支付或部署。NodeCanvas仍有较多视图props；StudioEditor713行的场景动作/导出动作，以及全UI类型化和旧CSS隔离，列为后续具体维护工作。

历史统一检查（2026-10-11 工程职责收敛）：`npm run check` 全部通过，**165 个测试文件、835 项测试**；格式、零警告 ESLint（含跨域与域内依赖方向）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/structure-controller-final-check.log`。本地运行 Node25.2.1；GitHub CI配置为Node24且尚未远端执行。浏览器确认桌面节点创建 / 正文修改 / 撤销重做 / Agent发送 / 本机分享及刷新恢复；390×844发送 / 草稿恢复 / mode菜单Escape、页面scrollWidth390；实际GLB相机动画预演与最新帧PNG截图成功，三页error/warn为空。证据 `artifacts/structure-canvas-proof.jpg`、`structure-canvas-mobile-proof.jpg`、`structure-studio-capture-proof.png`。strict仍只覆盖核心TypeScript；新增可选脚本表格与全画布候选未接运行入口，真实运营 / 完整原站功能 / 逐像素完备仍未完成，认证与账号资源继续延期。

维护文档已收敛：根AGENTS保留当前规则，agent.md仅作单一规范入口，README保留开发与扩展方法。旧检查段落原文迁到research/verification-history.md，当前路由状态和学院播放器目录已与实际入口对齐；不以追加历史记录代替更新当前状态。

结构收尾新增真实 Three 所有权回归并修复 helper 重复 scene sweep，统一检查 166 文件 / 836 测试通过。独立依赖与 controller 复核未确认提取回归；实际 GPU 编辑、离开卸载和重新建立视口无新增 error / warn。最新日志、截图与确切范围见 [验证历史](./verification-history.md#工程结构优化收尾2026-10-11)。

## 新功能的职责边界与本地访问策略（2026-10-11）

工程提取后的模块已接实际运行入口：图提交由 useCanvasGraphActions 协调，纯引用 / validator / graph plan 不读取 React store；Storyboard 节点复用独立 table controller，生成器 Frame 管理展开几何与 portal 生命周期。Studio 监视器按 model / camera projection / capture / scheduler / React observations / view 划分，owner hook 复用主 RAF 并释放 target，不新增 renderer。原可选脚本 / 增强@ / monitor 缺口记录是历史状态，最新实际范围见 coverage。

按用户要求，当前 App 的访问策略收敛到 services/workspace-access.ts，稳定本地 actor 直接支持现有本地文档，不读写旧登录会话。账号授权与真实运营能力独立，MCP显示未接入；认证接入必须经过 repository 与服务器校验。核心TS、JSX范围、旧CSS级联与 StudioEditor 后续协调拆分边界保持。

## AutoLink 边界维护（2026-10-11）

节点建议按纯匹配 / DOM装饰 / 输入生命周期 / tooltip / 全局偏好分离。原NodePrompt controller仅增加编辑前清理入口，既有150ms草稿 / 文档projection保持；当前reference内容签名稳定，不因普通父层回写重置batch。strict TS偏好复用storage repository订阅与失败反馈，不把浏览器设置放进Canvas params或账号状态；没有新增依赖、扩大边界白名单。dialog-stack新增可选child Tab处理，共享原焦点与Escape owner。源范围和实际验证见 [AutoLink审计](./prompt-autolink-functional-audit.md)。
