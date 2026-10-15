# ScriptV2 批量视频配置与节点交接验收

2026-10-12，继续用户“节点交互不够流畅自然”的反馈。本批只修改本地前端；无需登录、注册、小号或原站账号，不请求原站审核、生成、消费或写接口，没有部署。创建的是空视频生成器组，整体复刻目标仍未完成。

## 源码范围与实际入口

证据来自已归档公开客户端：[配置纯规则](./canvas-v2-video-config-model-source-audit.md)、[配置视图](./canvas-v2-video-configuration-ui-source-audit.md)、[建图与审核](./canvas-v2-video-graph-source-audit.md)。不运行原 bundle。

v2 使用全局 `support.video`，不是 v1 的19项 `storyboardVideo`。`public/data/video-model-support.json` 的34项逐项等同已有 `research/source/api/config-182.json` / `data.linkUrl` 解码后的 video，文件15,887字节；未新增内容采集。独立 useContent 加载、失败与重试，预构建静态清单登记该 JSON；未运行 vercel:prepare 或发布命令。

实际 App 经 NodeCanvas→CanvasViewport→CanvasScriptNode 接线，使用现有全屏脚本“合成提示词”阶段的“生成分镜视频”按钮。v2 不再套用通用视频弹窗，不需要先存在 linkedImageGroup；v1 图片组浮条及旧脚本入口保持独立。原站脚本浮动 toolbar 的完整操作仍未实现，本批不能把这个入口位置或整个 ScriptV2 工作区标记为逐像素一致。

## 维护结构与配置交互

- `v2-video-config-model`：模型候选、固定 mixed2video、默认值/原参数键、规则效果、选镜、临时时长和确认资格。纯模型无 React、I/O 或存储。
- `v2-video-graph-model`：完整行引用 descriptor、逐镜模式、审核证书、空节点/引用边/脚本 link，返回 additions/patches，永远 submitted:false。
- `useScriptV2VideoConfiguration`：配置 request、最新图与内容 source、取消/审核、一次 CAS/history、同步保存、保存重试及迟到定位门控。空闲不扫描文档或安装全局 pagehide 监听。
- `ScriptV2VideoConfiguration`：800px居中窗口、最高85vh、320px镜头列表，勾选/全选、逐镜时长、只读提示词展开、模型/普通参数菜单。只持展开状态，不在视图读图或写服务。
- `services/storyboard-video-source.ts`：新增独立可注入 checkV2Portrait 只读接口；保留 v1费用/审核接口，不把两者 URL 或资产ID混用。

首开按全部脚本行勾选，不使用表格原选择；再次点击同 request 保留临时编辑。模型按34项目录的 mixed 能力过滤，首个候选为默认，不套 Kling 优先。sound property存在即强制 storedKey=on，高级只初始化 autoCompliance，不显示费用或通用高级面板。actual caller 明确 initialImageSettings=undefined，不从图组自造继承比例。

行增删/重排按 UUID 保留已有选择及临时时长，不自动选中新行；新行使用其实际 duration。切模型不重写脚本时长，非法值显示并禁确认。普通参数使用 source originalField/typed enum/数值门控，冲突 ratio 不擅自改回默认。没有合法模型、目录错误、无选镜、未准备全部资产、缺引用/超限、非法时长或空 prompt 均阻断确认。

资源态的配置显示行按数组次序临时编号1..N，建图仍读取 raw script.rows/原镜号。导入镜号10/30会显示1/2，最终节点名仍10/30且原脚本不变；不能把显示编号写入持久化行。任务生成/失败分支不套资源态编号。

同一 modal 的菜单/tooltip portal 挂在 dialog 内，保持 fixed 定位，避免 body sibling 被共享 dialog-stack 隔离。Tab/箭头与逐层 Escape 可操作；菜单 Escape先回 chip，再 modal Escape回脚本按钮，父编辑器保持。非busy Escape关闭、视口边界 clamp/翻转及锁配置是明确本机适配；source本身禁止 Escape/遮罩关闭。没有增加独立 body scroll lock 或全局 reset。

初始 state/projection 为 null时仍显示 loading/error/retry；不注入假的 schema。源 rc过滤坏项，本机对 malformed目录整体报错及重复key拒绝更严格，明确属于可重试的数据完整性适配。pure配置失败同样映射可见加载错误，不能提示“重试”却没有按钮。

## 建图、审核、保存和返回画布

确认先读取当前 raw nodes/edges/models，再按选中 Set 和原行次序创建空视频及组。使用实际角色→场景→道具资产引用；不拿未生成分镜图当主图，poster/image为空，新节点没有成功 URL、taskInfo、scriptRowHiddenUuid 或 advancedSettings。关联边为 script→videoGroup，asset→video；group sourceScriptVersion=v2，无 sourceImageGroupId。只 patch linkedVideoGroupId，不把临时配置/时长/本次选镜写回脚本。

UI候选按所选行的最大引用数判断，但 eq 对每镜分别解析 mixed minimum。真实 kling-v3-motion-control [2,2] 下“1图镜+2图镜”可在窗口确认；首镜按源变 text2video并清引用，第二镜 mixed2video。返回源聚合警告，保存成功通知附原中文“参考图未生效”说明，不能固定所有子节点 mixed，也不能先把合法整组拒绝来隐藏差异。

portrait===true 或 modelVendor以star-video2开头时核对真实 linked asset节点的证书/免审与60天有效期。有效旧证明可直接建空组；缺失/过期需要实际 reader，无 reader时明确报错并保配置。审核返回须匹配 linked node ID、当前URL与有效时间/真实证书或免审。请求包含原 URL 数组，但该数组不是并发指纹；整个 raw graph identity/CAS保护期间 originalUrl等不可变图更新，比源部分 continuation范围更严格。没有伪造审核成功。

关闭、失ready、只读、文档/节点/source/目录/并发图改变、pagehide与卸载阻止迟到写入。一次严格 true 的 CAS经现有 Graph action合末次有效草稿、记一次 undo；然后重读同步发布的 currentDocument调用 flushGraph。undefined writer不算成功。

Quota失败保留已创建图与窗口，锁配置、只重试保存，不重新创建、不再审核、不加历史。之后目录/schema或资格改变不能禁用已提交图的保存重试；图被移除会明确报错。成功关闭配置与本机父全屏编辑器，100ms后按源400ms/padding.15选择/fit新组；新选择、board pointer、切文档、pagehide或卸载取消迟到定位，监听与timer随 owner清理。

源autoGroupPosition直接使用raw position/measured→stored widths，嵌套world转换不在本批伪造为已完成。源服务器等待/部分失败与本机 atomic拒绝、CAS/本机保存重试/取消等策略不完全相同，保留各审计中的适配边界。

## 验证与剩余范围

当前定向 Root controller25项、实际NodeCanvas6项通过（03:47:57 /2.55s，`artifacts/canvas-v2-video-root-final-tests.log`）。实际接线包括无图组入口、嵌套菜单/Escape/焦点、选镜/临时时长、原镜号、一次undo/redo、保存后回画布、卸载恢复、Quota只存不重建、审核未接和独立目录错误。纯配置66项、UI17项与 v1/v2 graph129项由各owner分别验证，不能把有交叉的集合累加成独立覆盖。

初次实际接线03:39:42五项失败来自fixture的stage accessible name误留空格；实际name为“3合成提示词2/2”。修正定位后四项通过，剩余fixture误用旧refImages字段；按源imageList/imageListOrder修正并保留图/边/历史/存储强断言。两份原日志为 `canvas-v2-video-integration-initial.log` / `...-followup.log`；随后3文件26项、取消/焦点24项、镜号30项及最终31项均通过。没有删除强断言、提高timeout/maxWorkers或关闭规则。

独立交叉审查发现并修复：pure配置失败重试不可达、资源显示镜号、逐镜mixed最小门槛。React检查覆盖按需监听/缓存、共享dialog-stack、controlled状态与服务/纯模型边界；不用通用UI重绘 source。

完整联合11文件367项通过，03:48:50开始/5.90s，日志 `artifacts/canvas-v2-video-final-joint-tests.log`，包括v1 config67/graph73/UI19/controller28/实际App5与v2 config66/graph56/UI17/controller25/实际App6及旧脚本5。完整 `npm run check` exit0：291文件/3432测试全部通过，03:56:55开始/86.65s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建10.16s通过，日志 `artifacts/canvas-v2-video-final-check.log`。本机Node25.2.1符合engines，.nvmrc仍24；统计包含独立影游扩展，核心strict不覆盖全部JSX，CI未远端执行。随后仅维护文档并检查格式；此前286/3261属于v1历史冻结快照。JSDOM无真实布局/GPU，不以组件回归替代原生桌面/窄屏验收。

本轮新建43计数测试页，原生AX click返回后计数仍0，focus仍AXWebArea，复现上一批输入通道阻断。未据此改产品代码或绕到其他控制技术；43已关闭，用户Vite5173/pid98953保留。本批 **桌面/窄屏原生窗口、创建、时长、焦点仍未验收，无新版截图**。

原站浮动脚本/工具箱/角色工具栏、完整run/stop与特殊renderer、审核/费用/生成/协作/运营写服务、真实手机/Safari和大图性能仍缺。仅本地更新，没有运行部署或远端CI；独立影游发布以其自身冻结与验收记录为准。当前登录注册/账号资源继续延期，不能宣称只差服务器或全站perfect。
