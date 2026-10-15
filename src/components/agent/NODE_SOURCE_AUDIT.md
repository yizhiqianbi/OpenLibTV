# Canvas inline 节点展示与定位

## 原站证据

- `research/source/19-1v5dt472t4.js`，401533（`ChatInlineTagExtension`）：读取当前项目 live 节点，按 `data.name ?? data.title ?? data.label ?? savedLabel` 显示名称；节点不存在时显示原标签、`节点已删除` 与 50% opacity，禁止定位和媒体 hover。加载中不应擅自当成已删除。原普通 inline 点击直接 `requestFitViewToNodeIds([id])`，不改节点 selection；readonly 不阻止这一视口操作。
- 同 chunk，702521：优先 ReactFlow 实例 `getNode`，否则 Canvas store `getNode`，随 store 更新。153423：节点缩略图读取 live 媒体再回退 tag extra/sourceValue；图片与视频 hover 180ms 打开、120ms 关闭，video muted/playsInline/loop/autoPlay、无 controls，portal z-index 400。
- `research/source/04q9x43g2p9-v.js`，682580：媒体类型由 `data.type` 决定；image 使用首个非空 `data.url` 或 `originalUrl`，video 只用 `data.url`。extra 保留 canvasNodeId/projectId/nodeType/previewUrl/previewMedia。节点不是上传附件，不把 `reference.source` 当作节点 locator 或媒体地址。
- `research/source/3p-thkwdoh37u.js`，103145：HTTP 非 WebM、无既有 `x-oss-process` 的视频用 OSS snapshot；宽度 tiers 200/400/800/1600，lead 请求 100 → 200，hover 请求 800 → 800。
- `research/source/21_0xvlvkw1sz.js` 的 pendingFocusNodeIds 消费：padding .2、duration 300、minZoom .6、maxZoom 1。`research/source/1kb-4b4zv9_2a.js`，395060 的 `getViewportForBounds` 将 numeric padding 转为 viewport 两边 floored pixels，并处理 zoom clamp 后的边距。新纯拟合函数按该公式，使用 measured size 和相对父节点/absolute internals。
- 401533 的跨项目标签为 `非本画布节点`，提示 `点击打开对应画布`，无本项目媒体 hover。586865 的通用跨项目 locator 会保留 Agent session、forceAgent=1 后 `location.assign`；它清空 focusNodeId/selectNode，没有证明目标项目会继续定位原节点。通用同项目 locator 的 select+fit 不等于 inline 的只 fit。

## 模块与接线

依赖方向为 Canvas hook → 自域纯 focus model / 公共 services presentation；公共 Context/Reference → 公共 services。共享视图不导入 Canvas 私有 store、组件或 hooks。

```jsx
const nodePresentation = useCanvasNodePresentation({
  nodes,
  projectId,
  documentReady,
  isShareReplay: Boolean(route.chatShare),
  board,
  setView: (view, { duration }) => {
    // caller 仅对本次定位应用 duration 300；普通拖拽/缩放仍立即响应。
    setView(view);
  },
});
<AgentNodePresentationProvider value={nodePresentation}>
  {/* 输入、消息和只读 Replay 共用同一份 live 文档能力。 */}
</AgentNodePresentationProvider>;
```

- `AgentNodeReference({ reference, variant = 'message', occurrenceKey })` 为只读 inline 视图。`variant="input"` 去自身外框，供原 NodeViewWrapper 内使用；引用移除与编辑 occurrence 仍由 RichAgentInput 管理。父组件为每个 occurrence 提供原稳定 key，展示层不重写 parts、name、referenceKey 或 projectId。
- Provider value：`{nodes,projectId,ready,isShareReplay,onLocate?,onOpenProject?}`。`onLocate(reference)` 返回 boolean，执行前读取当前节点并校验当前项目/documentReady；只写 view，二参 `{duration:300}` 给 caller。切项目、删除、加载中、卸载的旧 callback 返回 false。
- 可选 `onOpenProject({nodeId,projectId})` adapter 返回同步或异步 `false` 表示失败，hook 通过可选 onError 通知；切项/卸载后失败不通知新项目。当前 Root 不提供此 adapter，因此跨项目标签无导航按钮，明确保留为未接入能力，没有创造项目权限或假装定位成功。
- 原 share replay 忽略 reference 中旧 projectId，以已加载只读文档内的 live 节点解析；仍仅允许视口变化。没有 Provider 时为 `snapshot`，保留旧快照名称和缩略图，无定位；Provider ready=false 为 `loading`，不误报删除；ready=true 已知 nodes 中缺少目标才为 `missing`。`data-preview-source` 明确 live/snapshot。
- 原 canvasPickPending 保持淡化、不会误报删除；已有 live 节点且 status ready 时仍按原 Z 条件允许定位。uploading/error 禁止定位，读取失败状态不更改保存数据。

## 验证与边界

定向 4 个文件、15 项测试覆盖 live 改名/媒体更换、重复 occurrence、删除/加载/快照区别、readonly 键盘定位、share replay、跨项目同 ID 隔离、迟到回调/卸载、180ms hover 清理、legacy extra、source poster tiers、父节点与 source padding/zoom。核心新增 TS 文件 strict 校验、分域零警告 ESLint 与 Prettier 通过；Root 负责主体接线后的浏览器和全量检查。

本地相对/data URL 视频没有可用 OSS snapshot 时，lead 使用 native metadata 首帧回退；这不表示原站上传/审核已成功。原站 third-asset resolver 的临时资源映射没有复刻为新的权限协议，现有 asset mapping 继续负责已知素材。跨项目跳转/目标节点定位、asset-board 特有 requestLocateNodeIds、团队权限及真实账号状态未验，未新增服务请求或原站写入。图标使用项目已有 Lucide glyph，未声称此批逐像素等同原 SVG。

Root 已接 NodeCanvas provider、输入 NodeView 与消息节点展示；视口定位仅本次使用300ms transition，普通拖拽/缩放仍立即响应并遵守 reduced-motion。本地浏览器将文本节点改名为“工具栏验收节点”后，历史消息与输入同步更新；点击历史引用得到 translate(70px,85px) scale(1)，选中节点计数0。组件回归同时覆盖删除态不重写保存 parts。桌面截图 artifacts/canvas-toolbar-live-proof.jpg；全站107文件549项通过，日志 artifacts/toolbar-course-final-check.log，边界以 research/coverage.md 为准。
