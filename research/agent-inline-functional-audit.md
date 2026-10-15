# 共享 Agent 输入与工程边界审计（2026-10-11）

用户重点为完整功能与交互，内容使用代表性样本；本批没有登录、注册或使用原站账号资源。原站公开源码用于确定协议，浏览器正向操作仅在忽略目录的本地组件夹具进行，夹具不进入生产路由，也不改变认证门槛。

## 来源与模块职责

- `research/source/19-1v5dt472t4.js` 的 ChatRichInput：TipTap StarterKit、inline atom 引用、Skill `/` 建议、模型 `@`、200ms/24项、Enter/Shift+Enter/IME。`1bjvolc90roac.js` / `3i02v6kxrkivs.js` 补充占位文本与引用序列协议。
- `components/agent/RichAgentInput.jsx` 只负责编辑事务、光标、引用视图与建议；`AgentReferencePreview.jsx` 共用媒体/文档预览及 dialog-stack。TipTap 3.31.4 固定依赖，MIT 保存于同目录。
- `services/agent-content.js` 负责 text 占位串与有序引用 parts 的往返、旧草稿兼容、readiness；`agent-handoff.js` 保留原 session 暂存契约；Canvas 的 agent-draft 调用共享 codec。
- `services/agent-catalogue.js` / `agent-model-catalogue.js` 提供公共模型和 Skill 候选纯规则。Skills 原路径为兼容出口；Canvas 不导入 Skills 内部实现。只读静态复核没有发现模块循环。
- 上传过程仍留在 Skills / Canvas 各自 hook，UI 通过 imperative editor 接口在光标处保留占位。共享请求允许 signal 取消，不把 FileReader 或服务请求放进编辑器扩展。

## 已实现的协议与生命周期

同一输入可包含多个 Skill、模型、媒体和文本段。每个 occurrence 有独立 `referenceKey`；连续插入同一对象、复制节点均正规化身份，单项删除不会删掉其他 occurrence。旧无 key 的草稿使用稳定兼容身份，未知占位保持原文，不将未知文字当作可用引用。

媒体先在当前光标插入 pending 引用；批量文件在一个事务插入，避免中间 onChange 将本批另一个 reader 当作已删除。成功只更新原节点、位置和身份，失败保留并可重试；未 ready 禁止发送。删除、切换、卸载取消 reader/请求，迟到结果不回插。Skill 退出本地会话后中止读取并要求登录后重试。恢复残留 pending 时明确读取已中断，不永久显示加载。

Controlled parts 同步及上传清理在微任务中执行，避免 React effect 内触发 TipTap NodeView 的 flushSync。建议层按真实 caret 定位，键盘/鼠标选择及外点关闭；Enter 在建议仍活跃时不误发送，Shift+Enter 换行，IME 确认不提交。媒体只有真实 preview handler 时才显示预览入口，不显示无效按钮。

Skill 同 pathname 的 query 变更保留编辑器实例；分享参数插入一次后清理，其他 query/hash 和输入不丢。相同参数清理后再次进入可再次插入。其他详情/项目 query 仍按地址重挂载，hash 不重挂载。

## 实际验证

组件回归使用真实 TipTap，包括两个 Skill/两个模型、文中插入、删除/撤销、pending 更新、controlled 恢复、slash 键盘选择、Shift/IME、复制重复身份、删除/卸载/退出会话中止、失败重试和同路由分享消费。Canvas 组件回归覆盖 session → 文档 → 保存刷新及读取/只读门控；未用 textarea stub 掩盖生产行为。

桌面 1280×720 本地夹具：在“镜头开场 结尾”中插入东方巨构美学短剧、梦核美学、Lib Image 2.5 Pro、Seedance 2.5。删除一个 Skill 后撤销，四引用恢复；发送到 Canvas 后仍按文本位置保留。将光标放在“镜”与“头”之间，上传 MD 和 WAV，两引用读取完成仍位于该处。音频预览可打开/关闭；发送保留六引用并显示服务未连接，刷新后草稿六引用与文字顺序一致。

390×844 新标签：六引用自动换行、预览入口可见；页面 scrollWidth 与 viewport 均390，没有横向溢出；此新标签 console error 为空。旧调试标签中的历史 flushSync/HMR 错误不作为修正后新加载的结果。截图归档为 `artifacts/agent-inline-proof.jpg`。

Studio 转画布配额回归模拟目标 Canvas key 写入失败：不导航，不丢 objects/frames 或原 Studio 文档，保留导出弹窗并提示；恢复存储后重试成功。此项为组件测试，不扩大为全部 WebGL 工具验收。

本批最终全量检查结果记录在 [coverage.md](./coverage.md)。strict TypeScript 仅覆盖核心服务，不代表所有 JSX 已类型化。

## 仍未完成

- 上一批的 Canvas 原地 Skill 入口、动态节点 `@` 候选和发送消息原位置缺口已由后续批次接入，详见 [Canvas Agent 审计](./canvas-agent-fidelity-audit.md)。模型/资产完整工具栏、live 节点定位、工具消息和真实 Agent 仍需继续核对。
- 鼠标拖动 inline 引用、全部剪贴板跨页面形态、移动键盘/IME、原站逐状态像素和前进/后退全链路未全面浏览器验收。
- 真实 Agent、资产上传、收藏、Skill 创建/审核/发布、多人权限和跨设备存储仍需运营 adapter。存在接口与 blocked 本地请求不代表后台 wire 协议或写服务已经接通。
- Mine 发布与文件树的独立范围见 Skill 审计与 `src/features/skills/create/SOURCE_AUDIT.md`；学院与私人跟练的限制见学院审计。没有据此宣称所有功能或整个复刻目标完成。
