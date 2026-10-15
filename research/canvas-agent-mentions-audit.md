# Canvas Agent 节点提及审计

本批核查已有公开 source，不访问账号、生成或写原站。工作范围为共享 RichAgentInput、节点候选纯规则、有序 node parts 和 Canvas 候选 controller；Panel/NodeCanvas 接线与浏览器验收由根代理完成。

## 原站证据

| 本地证据 | 可确认行为 |
| --- | --- |
| `research/source/19-1v5dt472t4.js`，模块 457060 `useChatAtMenu` | @ 分为节点、模型、已有资源；节点初始 3 个、每次加载增加 3 个；打开菜单时按 viewport 命中节点优先，再按其余节点原顺序。打开后的默认排序为 snapshot，搜索读取全部当前节点。 |
| 同文件，模块 116132 和 `H` 搜索调用 | header/empty 不可选择，disabled model 跳过；可用 item 和 loadMore 支持上下循环与 Enter。查询节点/模型各最多 48 条，已有资源搜索最多 32 条；188px 菜单位于 caret 上方，最大高度 288px。鼠标悬停会更新当前高亮。 |
| 同文件，模块 650551 serializer | node wire part 使用实际 canvas ID，含 `id/nodeKey/name/projectId?/nodeType?`；只有 image preview 输出 `url: string` 与 `mediaType: 'image'`，video 节点不输出视频附件 URL。每次 inline occurrence 有独立标识。 |
| `research/source/1bjvolc90roac.js` / `3i02v6kxrkivs.js`，模块 281456 | node parts 独立于 image/video attachments；重载使用 `nodeKey ?? id` 绑定节点；未匹配 placeholder 保留普通文字。模型为 `type: 'model'`、真实 modelKey 身份与 modality。 |
| `research/source/04q9x43g2p9-v.js`，模块 682580 / 662493 | 节点 label 优先 name/title/label，再按节点类型文案；图片 preview 取 url 的首个非空字符串，否则 originalUrl。viewport bounds 使用 parent-relative 位置、measured/显式尺寸（默认 350×350），group/video_group 纳入直接 children 边界。 |
| `research/source/0leiedr1esdbe.js`，模块 577236 / 121119 | 默认候选排除临时连接、temp 与上传/审查中节点；url 数组含 blob/data 时视为 pending。 |
| `research/source/1kb-4b4zv9_2a.js` 与 `public/data/locale-zh.json` | 350px 尺寸 fallback 与节点/模型/加载更多/空态等中文文案。 |
| `research/source/1h-b10gcvw4vl.css` | 深色 Surface-Panel 为 neutral-900 `#171717`，hover/active 分别为 white 10%/15%；本地 grouped 菜单按此值设置。 |

源码搜索 `H` 原本只明确排除 temp，没有再次调用 upload-pending guard。本地按根代理要求，对搜索也排除 pending/blob，并覆盖 url/originalUrl 的 string 与 array；这些额外保护属于本地适配，不能描述为原搜索实现逐行一致。已读取完成的本地媒体以 `data.localMediaReady === true` 标记，仅放行 dataURL；blob、pending ID、uploading/reviewing 仍禁止。标记不进入 node parts，未伪造远程 URL。

## 分层与集成

- `services/agent-node-catalogue.js`：身份/label/preview、viewport 转换/边界/排序、节点/模型/资源分组与分页搜索。只引用共享 codec，没有反向导入 Canvas 或 React。
- `services/agent-mention-rows.js`：flat reference 与显式 rows 的兼容、选择与键盘循环规则；未知类型/无有效 reference 的 item 不可变成标签。
- `features/canvas/hooks/useCanvasMentions.js`：读取当前 Canvas props，打开时 snapshot 排序，初始 3 个、每次 +3。搜索与 label/delete 查询使用最新节点，换项目丢弃旧排序。
- `components/agent/useAgentSuggestions.js`：TipTap suggestion 生命周期、刷新/异步批次、键盘与当前 row；不派发 document 编辑来刷新菜单，不重建 editor。Async source 透传 AbortSignal，query/range/session/epoch 与卸载检查避免迟到结果覆盖当前候选。
- `components/agent/MentionSuggestionList.jsx`：分组、空态、loadMore、disabled reason/title、VIP、图标与 hover。旧 `/Skill` 和 flat `@model` 仍保留原输入接口及宽菜单。
- `AgentMentionIcon.jsx` / `mention-icons.json`：从已保存 `libtv.json` 提取 9 个真实 SVG；node 类型、loadMore 与 VIP 使用原图形，不加载整个图标包。
- `RichAgentInput.jsx`：编辑器与 inline node view。node image 仅静态缩略图，不假冒媒体附件预览按钮。共享 codec 保留 node 的完整 wire 字段与稳定独立 occurrence，兼容旧的缺少 nodeKey 的 node draft；矛盾 nodeKey/id 不会绑定未知 placeholder。

根代理接线接口：

```jsx
const mentions = useCanvasMentions({
  nodes, projectId, view, board,
  // 可选：viewport = {x,y,width,height}，为实际 canvas 坐标。
  // 若不传，使用 view={x,y,z|zoom} 与 board.current.getBoundingClientRect()。
  // models 默认 CHAT_MODEL_CATALOGUE；pendingNodeIds 为 Set。
});
<RichAgentInput
  mentionSource={mentions.source}
  onMentionOpen={mentions.onOpen}
  onMentionLoadMore={mentions.onLoadMore}
  mentionRefreshKey={mentions.refreshKey}
/>
```

共享 `mentionSource({ query, parts, signal })` 支持同步/异步 flat references 或 `{rowKind,id,label,reference?,disabled?,disabledReason?,icon?,vip?}` rows。header/empty 仅展示，loadMore 调用 callback 留在菜单。已存在资源依据当前 parts；每次插入创建新的 occurrence。控制器默认排序中新增节点在下一次打开重新纳入，当前搜索始终可以找到；这是原 `useChatAtMenu` 的 snapshot 行为。

## 验证与边界

本批定向 **4 个测试文件、29 项 tests** 通过，所属文件 ESLint 零警告（含 import boundaries），Prettier 检查通过；未单独运行全站 check。测试采用真实 TipTap 和纯规则/真实 hook，不以 mock editor 代替引用/selection/history；包括旧 @model、节点身份与 image-only preview、重复 occurrence、未知/冲突 placeholder、可见优先/父坐标/分页/48 上限、pending 与本地 ready 适配、菜单 rename/delete 刷新不丢草稿、async query 与同 query refresh 的迟到结果、卸载、Escape 后重开及 hover。

根代理 2026-10-11 报告实际桌面和 390px 浏览器均可 @ 画布文本节点、发送消息并刷新恢复，菜单无横向溢出。未以此宣称原站登录态全量节点/模型、所有像素或生成写服务已完成。

高亮规则复核：新 session 的首个可用 item 为默认选择；同 query/session 的刷新按 row ID 保留高亮，鼠标进入可用行会改变高亮，关闭后不保存上次 index。原模块 116132 以 query + sessionId 重置；原旧 Suggestion 在 range.from 移动时重走 onStart，而 TipTap 3 归类为 update，因此本地明确把换 @ range 当新 session 并重新排序，不沿用上个位置的高亮。根代理曾观察重开时 General image V2 高亮；已用真实 TipTap 回归确认 Escape 关闭后重开、移动到另一个同 query @ 均默认首项，但该单次浏览器观察的具体 hover/键盘事件尚无证据，不猜测其原因。

该批结束时尚未提供 live-preview/缺失节点提示或 fit-to-node；这些当前画布分支现已由 [共享节点审计](../src/components/agent/NODE_SOURCE_AUDIT.md) 更新。跨项目 locate 服务仍未接入；候选协议与 source wire 继续兼容。只读已发送消息渲染由另一代理实现，不能把 static image 缩略图等同原站 live node preview。原站账户、模型权限与写服务继续暂缓。

候选 video 节点目前使用原 video 类型图标，未接原站 CDN snapshot 缩略图；disabled reason 使用原生 title，未复制源 Tooltip 的右侧浮层。未把这两项视觉差距记为逐像素完成。
