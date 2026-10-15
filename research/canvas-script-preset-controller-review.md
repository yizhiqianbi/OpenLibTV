# ScriptV2 预设控制层与节点接线：独立只读复核

2026-10-12。本轮读取 `useScriptV2Presets.js`、`CanvasScriptNode.jsx`、`ScriptCardSurface.jsx`、`ScriptEmptyCard.jsx`、pure preset / card model、Viewport 参数与共享 graph / autosave / table 边界。不改生产或测试，不执行原站脚本，不跑测试或全量 check。Root 负责 controller / actual node 回归与最终验证，本文不把静态核对称作浏览器验收。

## 已确认的原子写入与保存路径

`create(kind)` 仅接受两个源 preset functionKey；执行前按当前 content.error / loading 与该动作的 `validateScriptV2Presets(...).actions[kind].enabled` 校验。文本、角色分别检查自己的字段，源正文 / URL 不做通用占位回退。Root 用 `disabledActions` 阻断目录不可用的两项，手动 `writeStoryboard` 独立仍可用；readonly 在新视图中隐藏完整 Try 与 actions。内容加载 / 失败 / reload 属于 controller / host，不进入纯 view。

接受动作后立即写 `ownerRef`，再调用任何外部 callback；同一 render 连续 preset create 不能进入第二次规划。取消已有手势后重读 raw graph，要求 documentKey 匹配、ready严格true、readonly严格false、nodes / edges 数组与实际 script-v2 节点存在。随后重新投影 card；只有 raw 空态才能建 preset，不能把 source pending / resource 改回 preset 空态。

pure planner 返回 addedNodes / addedEdges / 可选浅 scriptPatch。controller 先完整规划，再以 raw graph 为 expectedGraph 调用共享 commitGraph，只有 **返回true** 才标 committed；false、undefined 或 throw 都不通知创建成功。共享 commitGraph 比较最新 raw nodes / edges / models identity，投影 next 与 previous 的当前草稿，二次 CAS后同步更新 currentDocument、一次历史与 React state。没有以 projected identity 当 raw expected，也没有分别提交部分引用和边。

已提交后从 currentDocument 读实际 graph，`flushGraph(graph)` 写节点 / 边与当前文档其它数据，避免 React 保存 effect 仍持前一 render 的 raw 图。失败保留已创建图、owner、pendingSave与错误；retrySave 只重试 flush，没有再次分配 ID / 规划 / history。成功后才清 pending owner并通知“参考节点已保存到本机；脚本生成服务未连接，未提交任务”。节点或边缺失、文档 / 脚本切换、只读 / readiness / suspended变化会在后续 layout 校验撤销保存 owner；引用不被保存重试复活。

manual 入口复用 `useStoryboardTable.apply`。该 hook 在 await 前记录 operation controller，同步阻断重复 apply，写入传 documentKey / nodeId / expectedNode / AbortSignal；共享 patchScript 对最新 owner 与 node identity 校验。异步结果跨 identity 后不会打开另一文档编辑器。这条既有 table 边界与 preset reference 的同步 commit+flush 路径不同，不能宣称 manual 也已经由 preset retrySave 保存。

## 已发送主任务的具体问题

### P2：旧 render 动作使用 latest owner

审查时 `useScriptV2Presets.create` 从 latest.current 取 documentKey / scriptId，再生成 owner；未比较调用函数所属 render 的 props.documentKey / scriptId。保存 docA 的 create API，切到同 scriptId 的 docB，再调用旧 create，会用 B 的当前 graph / enabled / callback 完成 B 建图。原 current(owner) 验证的是刚从 B生成的 owner，因此不能拦住这个情形。retrySave 同样可能通过旧 A API 对 B 当前 pending owner保存。

`CanvasScriptNode.onEmptyAction` 的 manual 分支也有相同边界：旧 A closure 的 readonly / ready / disabled guard通过后，稳定的 table.apply读取新 B 的 current.current。即使 table 的异步 completion有完整 cancellation，它无法判断该调用来自旧 A DOM action；旧请求可以在 B写默认row并打开编辑器。

建议公开动作先核对 render捕获的 documentKey / scriptId 与 latest / getDocument，或统一为明确 owner token；节点 manual 入口也核对当次 render owner后再调用稳定 table API。新增 old A create / retry / manual callback→B同ID回归。该问题已在消息中明确发送给 Root；本文不自行改控制层。

### P2：pending 文案混淆连线、可用参考与前端缺口

审查时 pending 子文案为“参考连线已就绪；脚本生成服务未连接，未提交任务”。source `eB` 的 pending 资格是空 rows 且任意 incoming **或 outgoing** edge，并不保证存在可用上游参考。例如只从脚本向下游连边，也会是 pending；损坏 / 空参考 URL 同样不是“参考已就绪”。

source empty / pending 另按 `eX` 渲染专用 SCRIPT_V2 GeneratorFactory；当前本机 CanvasViewport.inlineNode只筛 image / video / audio，并无此 script generator前端配置。只写“生成服务未连接”不能说明这层尚未接入的 UI / 参数缺口。

建议按确切事实写“当前节点存在连线；专用脚本生成器与生成服务尚未接入，未提交任务”。这是公开本机能力边界，而非 source pending 原文；源 pending 中心仍只有90px ListDetail。主任务若保留服务说明，应在 functional audit明确额外说明的性质，不能称为空态 / pending整体 perfect。该问题已发 Root。

## 视图、生命周期与余下证据范围

`ScriptCardSurface` 已把 readonly、全局disabled、逐项disabled与原 functionKey callback透传给独立 EmptyCard；taskInfo / doc / node只给 TaskStatus，无重复 task 服务。非交互图标 / 空白交 host drag / 双击，button pointer / mouse / click / dblclick隔离，Space stop而不prevent原生激活。视图不 await graph mutation、不维护另一套存储、主题或 dialog stack。

React best practices复核范围：三个动作 descriptor hoisted；简单状态由 props / pure model直接派生，不用 effect维护镜像；catalog投影依赖 data identity；owner / saving transient状态用ref，并由controller生命周期清理。不存在为本批新增全局监听、重复异步目录 writer、UI→service反向引用或重型静态bundle依赖。只有3项按钮，不为简单映射额外memo。

source preset动作只建立输入图，不提交任务、主动 fit / 改选或生成 rows；manual动作才打开全屏与 confirm-shots。当前 source专用 scriptText目录、参考图菜单 / 媒体列表 / prompt / 翻译 / voice / submit UI、输入同步与真实任务服务继续未接入，详见 [专用生成器审计](./canvas-script-preset-integration-source-audit.md)。source explicit reference / mark / focus target模式同样不能由普通选中状态假造。

本轮只读审查没有新增测试或浏览器通过声明。EmptyCard独立15项jsdom与其格式 / lint证据见 [空态 source / view审计](./canvas-script-empty-source-audit.md)；controller、Quota与实际CanvasNode计数以 Root随后日志为准。原生桌面 / 窄屏拖动、键盘与浏览器剪贴板、task权益 / collaboration / cancel / retry /真实生成等完整目标仍不能据本审查标完成。

## 主任务修复后的只读复验

本文写入期间 Root 已修正上述两点；再次静态读取实际文件确认：

- preset create / retrySave核对 render捕获的 documentKey / scriptId 与最新props，旧A API不能对当前B执行创建或保存。
- manual入口使用按 documentKey / nodeId生成的 `emptyEntryOwner` object identity，与最新 `emptyEntryAccess` 比较；动作前核 ready / readonly / blocked与最新 raw graph / fresh empty card，await apply后再核同owner才打开编辑器。
- pending改为“脚本生成暂未接入，可编辑和保存参考节点”，不再声称连线或参考已就绪。专用 script generator前端和输入同步缺口仍由上述source / functional范围明确保留；这段本机说明不是 source pending原文。

本轮最终读取没有发现新增的确定生产阻断问题。上述为**静态修复复验**，不增加 controller、actualnode、全量测试或原生浏览器通过计数；实际检查由 Root随后补记。初次P2描述保留为审查历史，不将已修复问题重新列为当前失败。
