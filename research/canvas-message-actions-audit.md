# Canvas 消息时间、复制与来源会话（2026-10-11）

本批读取已归档公开客户端源码，仅补取一个源码明确引用的公开 `chat-source-session.svg`（1178 字节，已验证 SVG，不是 HTML）；没有登录、真实账号、支付、消息/反馈写服务、会话写请求或全量采集。真实浏览器验收与外层元数据接线由根代理负责。

## 原始证据

- `research/source/3n2hcta4q0hnu.js`，module **207792**：用户消息 `ChatMessageUser` / `parseChatUserMessageContent`。外层 relative group；操作栏 absolute right 0、top 100%、padding-top 4px、gap 4px、z-index 10，初始 opacity 0 / pointer-events none，message hover 后显现。时间 12px / 18px、dark white 40%；复制按钮 24×24px、radius 6px、dark white 60%、hover white 6%，CopyN 原图标 16px，top/arrow Tooltip。
- 时间优先读取 `createdAt ?? created_at ?? timestamp`；支持数字、数字字符串与可解析日期字符串，低于 1e12 视为秒，非法/非正值无时间。今天只显示时分，同年其他日加月日，跨年加年份；24 小时制，en-US/ko-KR/ja-JP/zh-CN locale 按语言选择。
- 用户复制读取 **只读 rich-content 容器 `innerText.trim()`**；source-session 提示在该容器外，时间/操作栏也不参与。它不是 parts JSON、URL 附件集合或 placeholder 原文。本文实现使用真实浏览器 innerText，只有 jsdom/SSR 无该属性时用静态 token 转换回退；live 节点名称以真实 DOM 为准。
- 同 module 隐藏 `message_feedback` 用户控制记录。source-session 从第一个 `context.metadata.source_agent_session` 读取。来源会话名 trim，空名使用“未命名对话 {createdAt 的年月日时分}”，查不到会话使用“来源会话”。文案“从 {session} 继续，”，原 mask 是 `/assets/chat-source-session.svg`。
- **来源会话不是普通 URL 导航**：source 检查会话存在、session list notLoading 且非 creating、非 share replay、active agent 存在、same project、currentSessionId 不同，然后 `await activeAgent.switchSession(sessionId)`；异常显示“操作失败”。原按钮在 loading/不存在/pending/replay 禁用；同会话/跨项目是在点击时 no-op。此处保留这种 UI/runtime 区别，同时只有完整注入 adapter 才允许按钮启用，避免不存在服务时假继续。Root 本批不提供该 adapter。
- `research/source/2ob2qo_b0az9v.js`，module **593972**：`writeTextToClipboard` 等待 native clipboard 完成；拒绝后尝试真正 textarea + execCommand fallback。fallback 保存 active element、输入选区和 DOM ranges，完成或失败都清理 textarea 并恢复仍有效焦点/选区。后续写入、外部 copy/cut 可 supersede 旧请求，不能在迟到失败后重新覆盖剪贴板。
- `research/source/0eszq3bkbglub.pretty.js`，`ChatMessageFeedback` 约 3758–3924 行：助手复制属于**轮末常显操作行**，不是用户式 hover 时间。它复制整个目标轮中各个 `assistant.content` string.trim().filter(Boolean).join('\n\n') 的原 Markdown。share replay / readonly / 无 active agent 隐藏。外层 ChatMessages 把该操作行放在每轮末尾，跳过 feedback / resume 等内部用户控制消息来识别轮边界。
- 同文件约 4585–4604 行：实际 Canvas assistant 使用自定义 Z/Q Markdown renderer，跳过 Copilot 默认 AssistantMessage 的 hover controls。不能因为 bundle 包含默认 regenerate/copy/feedback 控件而在当前 Canvas 逐条创建它们。本文不添加助手时间、regenerate、点赞/点踩或反馈写服务。
- 原 CopyN 映射位于 `research/source/3cc4i9j9c1y82.js`，`libtv:copy-n` body 来自已保存 `libtv.json`。仅抽取必要 icon；source session mask 原 SVG 同目录证据已保存。

## 实现与模块边界

- `features/canvas/message-actions/message-action-model.js`：纯格式/时间、用户显示文本回退、整轮助手原 Markdown、反馈控制筛除、source session ID/name/guards。只调用现有消息 token model，不改原 domain 文件，不重建或规范化 parts / referenceKey。
- `CanvasMessageActions.jsx` / `MessageCopyButton.jsx` / `MessageActionIcon.jsx` / `message-actions.css`：角色明确的动作 UI；用户 hover / focus-within 操作，键盘可 Tab 到 copy。触屏无 hover 时操作可见，不依赖一次消失的 hover 才能操作。助手默认无动作，必须注入完整已分组 turn。
- `useMessageCopy.js`：剪贴板状态、latest callback、message identity / unmount 的取消与迟到结果保护；失败不会显示成功。Root 的 onNotify 显示源式 toast，动作同时保留 aria-live；无 notifier 时本地可见失败提示。
- `SourceSessionNotice.jsx`：只读提示、loading/pending/replay 禁用、同画布/不同当前会话 runtime 校验、真实注入 adapter 失败反馈和上下文切换保护。没有 adapter 不导航、不写服务、不改当前消息。
- `services/clipboard-text.js`：独立 DOM 边界，真实 native→legacy 写入、焦点/选区恢复、cancel/supersede，不引用任何 UI/features。
- `components/CanvasAgentMessage.jsx`：接线上述 UI；`CanvasAgentMessageContent` 仍是正文专用兼容出口，不自动给 ChatReplay frame 增加动作。组件原媒体/native controls/节点 presentation 保留；已有纯渲染 domain 未修改。

```jsx
<CanvasAgentMessage
  message={message}
  onPreview={setPreview}
  onNotify={toast}
  readOnly={readOnly}
  isShareReplay={isShareReplay}
  assistantActions={isTurnEnd ? {
    messages: assistantRecordsFromThisTurn,
    targetMessageId: message.id,
    canCopy: true,
  } : undefined}
/>
```

助手 `messages` **必须是外层明确分好的整轮**；组件不会根据单条 message 猜整个轮或假 active-agent 权限。原 source copy 使用 `content` 字符串；当前保存的本地 capability 说明只有 `text` 时做明确兼容，存在非字符串 `content` 不猜衍生内容。用户 readonly/share 仍可复制，符合 207792 不禁止该只读动作的分支；助手 readonly/share 不出现整轮动作。

来源会话可选完整 props 为 `sourceSession:{sessionId,name,createdAt,projectId}`, `projectId`, `currentSessionId`, `sessionsReady`, `onContinueSourceSession(sessionId)`；回调必须真正完成 switch，返回 false / 抛错表示失败。原 `sessionCreating` 包含在调用方的 `sessionsReady=false` 内。Root 本批不提供此能力，仅显示实际 source-context 文字及不可用按钮。

用户本地发送记录由 Root 补稳定 `id` 和 `createdAt`；旧无时间数据不会制造当前时间。复制状态不写入消息、parts 或存储。原 SVG/format 证据不等于浏览器逐像素验收。

## 定向检查

4 个测试文件 **24 项通过**：其中原消息/媒体展示 6 项继续通过，新纯规则 6 项、动作集成 8 项、真实 clipboard boundary 4 项。覆盖秒/毫秒/nullish优先/非法时间、today/same-year/跨年、本轮原 Markdown 与非字符串忽略、真实 innerText 和重复 occurrence 无损、source-session 外部/内部内容区分、反馈控制记录隐藏、用户/助手 readonly/replay 差异、键盘复制/失败通知、消息替换/卸载后迟到 promise、legacy textarea 真复制/拒绝、输入 selection/DOM ranges 恢复、copy supersede/abort、tooltip scroll/unmount、来源会话重复触发和旧上下文失败不回流。

Scoped Prettier 与 ESLint（包括工程依赖边界）通过，零 warning。没有跑全站检查，Root 负责统一检查和真实浏览器。

## 保留边界

真实 sourceSession switch、feedback/likes、assistant 服务执行/续跑、原站账号写服务未接入。浏览器 clipboard permission/native fallback 差异、触屏长按及日期跨午夜刷新、时间与动作逐像素对照未由本批实际浏览器验证。已保存的 parts/occurrence 只读；显示名称或复制字符串不覆盖协议。原旧正文审计中“悬浮时间/复制未实现”是此前历史状态，本批证据见本文，未改旧域模型/根文档。
