# Canvas 已发送消息的 inline 内容（2026-10-11）

本批新增消息展示组件、pure model、独立样式与回归，随后修复只读 ChatReplay 正文接线和 persistence 读取边界；没有修改 CanvasAgentPanel、NodeCanvas、共享 codec、认证或生成服务，也没有使用原站账号、浏览器或新增内容采集。主画布接线、真实保存/刷新和桌面/窄屏浏览器验收由根代理负责。

## 已有源码证据

- `research/source/3n2hcta4q0hnu.js`，模块 **207792**：`parseChatUserMessageContent` 接受 parts 数组、序列化 JSON 数组及纯字符串；`ChatMessageUser` 把 parts 交给 `ChatRichContentView`，不是把引用放到消息末尾分组。原站另外处理 source session、反馈控制消息以及悬浮时间/复制工具栏。
- `research/source/19-1v5dt472t4.js`，模块 **559348**：`ChatRichContentView` 使用只读 TipTap surface 与 inline tag；不启用标题、列表、引用块等输入 Markdown 功能。模块 **401533** 的 `ChatInlineTagExtension` 保留 model/Skill/media/node 的文字中位置，并对 ready 图片/视频使用 **180 ms 打开、120 ms 关闭**的 portal hover；上方偏移 8 px、层级 400、最大媒体 280 px/50 vh，视频静音、循环、自动播放且没有 controls。
- `research/source/3i02v6kxrkivs.js` / `1bjvolc90roac.js`，模块 **281456**：`contentPartsToTipTapJSON` 解析第一个 text part 中的 `{{ type:id }}`，保留内文换行；非 canonical 数组按实体顺序读取，context/hidden/vfs 不作为可见文字。未知占位符保留文字。原站部分旧引用分支按第一个匹配 ID 处理；本地协议已经要求每个 occurrence 的独立 `referenceKey`，展示模型不能去重或重建该身份。
- 节点 catalogue 经同批源代理核对：`{ type:'node', id, nodeKey:id, name, projectId?, nodeType, url?:string, mediaType?:'image' }`。仅图片节点输出实际图片 URL；它不是 `source` 附件。原 renderer 的 live node store、跨画布定位和删除态需要具体权限与节点上下文，不能从一个 URL 推断。

## 新模块与接线

`domain/canvas-agent-message.ts` 是 strict TS 纯展示模型，依赖公开 `services/agent-content.js` 的 `isAgentReference`。它不写存储、不请求、不执行 window，也不经编辑器重建 parts。`components/CanvasAgentMessage.jsx` 只依赖此模型、素材映射和既有 UI 基础库；独立 CSS 使用 `cv-agent-message-*` / `cv-message-reference-*`，基础 chip 规则增加消息域前缀以覆盖 Canvas 通用 button reset。

```jsx
import { CanvasAgentMessage, CanvasAgentMessageContent } from './components/CanvasAgentMessage.jsx';

// CanvasAgentPanel 继续持有 preview 和现有 AgentReferencePreview。
<CanvasAgentMessage message={message} onPreview={setPreview} />;

// ChatReplay 可继续持有自己的 frame/只读权限，仅复用正文。
<CanvasAgentMessageContent message={message} onPreview={setReadOnlyPreview} />;
```

两者都接受 `message: {role?, parts?, text?, content?}`。`parts` 中存在 text part 时以完整 parts 为准；否则接受原 serialized `content`；历史本地 `{text,parts:references}` 的引用保留在原纯文本之后，不猜测已丢失的位置。调用方应保存完整 `draft.parts`，不能只保存 `agentPlainText` 和引用列表。

按原 207792 规则，每个 text part 的展示副本执行 `trim()`；保存的原文、parts 和 occurrence metadata 不改写。段内换行、空白与占位位置保留。

`onPreview(reference)` 仅对具有真实媒体 source 的 ready image/video/audio/document 触发，并保留 occurrence key 与其他 metadata；原 raw base64 转成可供现有弹窗使用的 data URL，完整 data URL 不重复包装。没有 handler、读取中、错误、无 source 时不显示假预览按钮。图片/视频 hover 是只读展示；普通预览点击仍由现有 `AgentReferencePreview` / `EditorDialog` 管理 Escape、焦点和滚动锁，不另建 modal 生命周期。

原批次节点仅保留 inline 名称和静态缩略图。后续现在复用 `AgentNodeReference` 与共享 presentation provider，读取当前画布名称、删除态和媒体预览，点击现有节点执行 300ms fit，不改变选择或保存的 parts。没有 provider 时保留静态快照；跨项目打开/定位仍未接入。见 [共享节点审计](../../../components/agent/NODE_SOURCE_AUDIT.md)。不将节点转换成附件。模型/Skill 展示原名称与草稿标记，没有删除操作。助手纯文字可使用 GFM Markdown 展示既有消息；组件从不创建助手回复、生成结果或状态。

## 定向验证

- pure model **6 项**：文字原位置、重复 occurrence / 稳定独立显示 key、冻结输入不修改、内部换行与未知占位、serialized/legacy/interleaved 兼容、raw base64 与 ready 校验、节点 snapshot/source 区分。
- 组件 **6 项**：文字与重复标签 DOM 顺序、JSON round-trip；精确 occurrence 的音频预览与原生 controls/Escape 回到该按钮；未 ready/无效 source 无动作；只读节点图；图片 hover 180/120 与卸载清理；视频静音 hover/scroll 关闭和预览 callback；实际 blocked 助手消息的 Markdown 展示。
- persistence **8 项**和 ChatReplay **2 项**通过定向回归：legacy/template 加载、坏分享、损坏/不可读存储与形状错误不覆盖、公开/本地聊天消息和复制保存、失败写入/删除后的旧快照重开；只读 serialized 内容、原文/回放控制、媒体预览和跨文档关闭。
- 定向 Vitest、零警告 ESLint、所新增模型/测试 strict TS 与 Prettier 已通过。测试中的 JSON round-trip 验证独立展示兼容，不代替 Canvas repository 实际刷新验收。

只读 ChatReplay 保留外层 frame 和回放控制，正文使用共享消息 Content；Serialized 内容不再依赖 `message.text`。预览使用既有只读媒体弹窗，切换 message document 会关闭旧预览。persistence 的公共 chat 消息优先使用快照外 `document.messages`，本地快照使用 `snapshot.messages`，不扁平化 parts/content；加载失败保留原值并阻断空项目覆盖。仅此前 `WRITE_FAILED` / `REMOVE_FAILED` 不使已可读的旧快照失效，读取/解析/版本错误仍阻断加载。

## 明确边界

- 原站只读内容使用 TipTap；这里采用静态 inline 展示，避免只读消息重建 occurrence 和编辑器。鼠标选择/复制跨标签、触屏/IME、hover 精确几何与逐状态像素未做浏览器验收。
- 本批没有实现 source session 继续会话、消息时间/复制工具栏、反馈/工具消息、跨项目节点定位、原工作区 `file`、scriptPreset/directorElementClip 等额外 tag，或助手专用生成卡片/工具渲染器。未知占位仍保留为原文，不包装成可操作引用。
- 已归档公开 ChatReplay 样本只有 `{role,text}`，没有完整 parts 的样本无法还原引用位置；正文复用不得制造缺失 metadata 或改变只读权限。
- 真实 Agent/认证/运营持久化仍未接入，独立消息展示与测试通过不代表原站生成成功、全站所有交互或整个复刻目标完成。
