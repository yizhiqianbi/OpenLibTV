# Script 卡片按需代码入口

2026-10-12。本批仅新增 `storyboard/CanvasScriptNodeEntry.jsx`、其局部 CSS 和专项测试。Root 负责替换 CanvasNode 的 import、实际 App 回归、构建和最终检查。未修改原 CanvasScriptNode、图模型、存储、生成器或共享 dialog-stack；未新增依赖、manualChunks 或提高 900 kB 提示阈值。

## 1. 问题与范围

Root 本批初步生产 build 的 CanvasPage 为 905.55 kB，超过既有 900 kB 阈值；MarkControllerBridge 已独立为 23.97 kB，但 CanvasNode 原本仍静态导入完整 CanvasScriptNode。后者导入 ScriptAssets、ScriptTable、提示词合成和配置视图，配置又带入参数、音色及 Mantine UI，整条脚本卡依赖进入主画布包。本轮解析图确认直接提示词组件实际为 ScriptPromptInput，不能把此路径粗称为 NodeGeneratorPrompt；两者保持独立协议。

新入口默认 loader 的唯一目标为 `import('./CanvasScriptNode.jsx')`。实际实现未复制或降级；没有生成假的三阶段进度、parsedRows、脚本资源或生成成功状态。source 原卡片、打开请求、表格/资产、模态框、草稿、图提交等协议保留在原模块，证据见 [脚本卡片审计](./canvas-script-compact-model-source-audit.md)、[卡片 UI 审计](./canvas-script-compact-source-audit.md) 和 [生成器接线审计](./canvas-script-generator-integration-source-audit.md)。本机 loading/error/retry 为局部代码加载可达性适配，不声称是原站任务状态。

## 2. 入口合同

默认导出 `CanvasScriptNodeEntry({ loader = defaultLoader, ...props })`。除测试可注入 loader 外，原 CanvasScriptNode 的全部 props 原样传给真实实现；readonly 不阻断加载和重试，也不要求 onChange/writer。主节点外壳、header、drag 和选择仍由 CanvasNode 持有，入口不变更节点几何、选择或持久化。

仅 mount 且 ready 时请求代码。以 documentKey、node.id、node.type 和 data.type 依赖生成不透明对象身份；A→B→A 的最终 A 是新 owner，不靠字符串相等重新放行旧请求。模块请求缓存只按 loader 保存代码，不缓存文档、节点或 callbacks；effect cleanup 拒绝旧 owner、失去 readiness 和卸载后的迟到结果。render 同时比较 owner、loader 和 attempt，旧结果即使仍在 React state 也不能显示。

同一 owner 的 node、models、callbacks、readonly、openRequest 等更新不重新请求或挂载真实组件，保留其内部草稿、当前阶段和 DOM selection。加载期间 openRequest 多次递增，真实组件挂载拿到最后一个值，仍由原 CanvasScriptNode 的 consumedOpenRequest 消费，不在入口提前吞掉；普通 rerender 不重复开窗。

失败请求从 WeakMap 删除，可局部重试，不刷新页面；错误恢复与权限无关。实现 render 错误由局部 ErrorBoundary 显示同一失败态，retry 先退休旧 boundary，再用当前 props 挂载已加载代码。原实现的审核/生成/费用与保存错误仍由原 controller 管理，入口不误当 chunk 错误。

加载状态背景保留 pointer bubbling，允许原宿主拖动。重试按钮具有 nodrag/nopan，隔离 pointer/mouse/click/double-click；Space 仅停止 bubbling、保留原生激活默认行为；Escape 不抢共享弹窗栈或画布 owner。入口不建立 dialog、不锁 body、不注入外部焦点恢复。

## 3. 样式与产物验证边界

首次入口只 eager 导入 `storyboard.css`，Root 的真实 build 随即发现 CanvasPage CSS 从191.95 kB下降至142.50 kB、Script lazy CSS新增50.01 kB。这证明保一份 stylesheet不足，先前的“保完整级联”结论被实际构建否定。本轮仅解冻入口 CSS 导入，原实现和所有 controller 保持不变。

使用 Node24 / Vite 官方 `build({build:{write:false}})`，临时 post plugin 只在内存把 CanvasNode import 从新入口还原为旧 `CanvasScriptNode.jsx`；不改磁盘源码、dist 或 config。Rollup `getModuleInfo(id).importedIds` 按 static DFS 实际依赖次序遍历，忽略 dynamic imports，得到2508个静态 module和22份 CSS。证据 [canvas-script-css-static-baseline.json](../artifacts/canvas-script-css-static-baseline.json) 保留每份 CSS 的完整首入 importChain，基线 CSS为191954字节。

入口现在直接按该次序导入完整 CSS-only 清单：

1. `storyboard/script-prompt-input.css`
2. `storyboard/script-media-history.css`
3. `storyboard/script-prompt-compose.css`
4. `storyboard/storyboard.css`
5. `storyboard/ScriptCompactProgress.css`
6. `storyboard/ScriptCardTaskStatus.css`
7. `storyboard/ScriptEmptyCard.css`
8. `storyboard/ScriptCardSurface.css`
9. `components/agent/rich-agent-input.css`
10. `storyboard/script-assets.css`
11. `@mantine/core/styles/Slider.css`
12. `generator/voices/voices.css`
13. `generator/generator-settings.css`
14. `storyboard/V2GenerationSelector.css`
15. `@mantine/core/styles/Input.css`
16. `@mantine/core/styles/NumberInput.css`
17. `@mantine/core/styles/Tooltip.css`
18. `storyboard/ScriptV2VideoConfiguration.css`
19. `storyboard/ScriptV2ImageConfiguration.css`
20. `canvas/components/storyboard-group-controls.css`
21. `storyboard/ScriptNodeToolbar.css`
22. `storyboard/ScriptRegenerateConfirmation.css`

项目路径默认相对 `src/features/canvas/`；第9项相对 `src/`，第20项相对 `src/features/`。包 CSS 也由解析图直接核实，不靠只搜局部 JSX 猜测；Mantine库 JS 不重新静态导入。最后才加载新增 `.cv-script-node-load-state` 样式。原实现重复导入同一旧 CSS 由打包器去重，没有新主题/reset或按 lazy 次序覆盖旧规则；新 Mark 域保持自己的前缀和既有独立路径。

修改后再次只读 `write:false` 解析真实 lazy 图：[canvas-script-css-lazy-proof.json](../artifacts/canvas-script-css-lazy-proof.json)。22份旧 CSS 的 closure次序与基线逐项一致；CanvasPage CSS为192511字节。用 PostCSS仅删除5条新增 `.cv-script-node-load-state` 规则后，输出字符串与191954字节旧静态基线**完全相等**，不仅比较少量 selector 或大小。Script独立 chunk为220148字节、无额外 lazy CSS，且不在CanvasPage静态递归闭包中；CanvasPage为687076字节、dynamicImports真实指向该Script chunk。Root之前的690.01 kB是另一次快照，不能混为此解析产物的精确数值。

loader 只从普通 React effect 调用，因此未挂载脚本卡或未 ready 时不请求实现；StrictMode replay 和同时存在多个脚本卡共享同一在途请求。

专项 injected loader 的次数证明 React 调用边界，真实默认动态模块测试证明实际目标可用；两者不代替原生网络请求。上面的只读 Rollup/CSS proof不覆盖 Root 的正式 dist/fullcheck或原生首次 mount请求验收。本文作者没有覆盖正式dist、运行全量check或浏览器，不将初步905.55 kB快照记为最终检查通过。

## 4. 定向验证

专项测试保留以下强断言：ready/read-only retry；StrictMode 与多卡只请求一次；同 owner DOM、草稿、焦点和 selection 原身份；全部 props 原引用透传；A→B→A、id/type/data.type owner 退休；readiness 丢失、卸载迟到和旧 retry 失败隔离；缺失默认 export 拒绝并真重试；render 错误用当前 props 恢复；宿主拖动与按钮 Space/Escape；真实默认 CanvasScriptNode readonly 卡片；延迟真实 import 下最后 openRequest 与最新原文、关闭后同请求不重开、新请求可开。

Node24.19.0 定向 Vitest 1文件/15项全部通过，19:26:34开始、1.57秒，日志 [canvas-script-node-entry-tests.log](../artifacts/canvas-script-node-entry-tests.log)。首次14/15的失败是测试未等待原 closeExpanded 的异步 flush，改为 await act 后保留关闭和请求消费断言，无生产修补或超时放宽。入口 JSX/测试 ESLint 零警告，三份生产/测试文件 Prettier 检查通过。Root 后续实际 App 和正式构建结果单独记录，不混用此专项快照。

完整 CSS-only 清单修正后，Node24定向15项再次全部通过，19:39:19开始、1.68秒，日志 [canvas-script-node-entry-css-tests.log](../artifacts/canvas-script-node-entry-css-tests.log)，ESLint零警告、Prettier通过。没有放宽测试、静态重引实现或修改任何图/历史断言。
