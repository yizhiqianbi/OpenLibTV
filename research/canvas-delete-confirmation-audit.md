# Canvas 删除确认：源规则、owner 与共享弹窗（2026-10-13）

这份审计覆盖新增确认纯规则、controller、共享弹窗及实际 Canvas 确认入口的专项验证。Root 的其他 App 流程、native UI 与全量检查另行记录；不能把这里的 hook/view 测试当作整站复刻或真实服务已完成。

## 源规则

[破坏性删除源审计](./canvas-destructive-delete-source-audit.md) 与 `artifacts/canvas-destructive-delete-source-proof.json` 给出 keyboard `onBeforeDelete`、menu delete、旧分镜组 `pW` 及 19 个 locale values。该冻结证据包含 10 个源文件与 95 段，审计 SHA256 `dbf3ab2f33ab91a8fc1a7cbe3c4d862b8ed205acac05653885de11ea94a2359d`，proof SHA256 `f6c21e37b397ddc775f27312ea6bc23788d46488c38d2c4975f4103b354c18bc`。没有执行源生产脚本或写入原站。

`batch/deletion-confirmation-model.js` 的 `canvasDeletionConfirmation({ nodes, nodeIds, trigger = 'keyboard', isMac = false })` 按实际 flow `node.type` 资格判定，返回 `{ title, message, confirmText, cancelText }` 或 `null`：

- Keyboard 优先 script / script-v2，再旧脚本关联 group，最后 truthy `video.data.openingUsed`；普通生成图 URL 不导致确认。
- Menu 只先识别 script；script-v2 继续走普通内容规则。旧关联 group 走 `pW`，关联 exact v2 group 直接执行并跳过内容提示；没有关联 source ID 的普通 v2 group 仍走普通内容规则。
- 关联 group 要求 flow type `group` 与 `sourceScriptNodeId` 为 length > 0 的 string，**不 trim**；旧组是 `sourceScriptVersion !== 'v2'`。video 判定 exact `storyboardGroupType === 'video'`，其余旧关联组按 image policy，混合 image / video 使用混合组文案。没有插入孩子数量或脚本名。
- Menu 的源内容条件只检查 `data.url` / `data.content` 数组中 `.trim()` 后有内容的项；string 字段、rows、任意 params 不替代这个条件。本机对损坏数组增加 string guard，安全忽略数值 / object 等无效项。源代码的 optional item `.trim()` 对 truthy 非 string 可能抛错，这个防护不能描述为原站支持这些值。
- title / message / `确定删除` / `取消` 使用证据中的原中文；undo shortcut Mac 为 `⌘Z`，其他为 `Ctrl+Z`。源普通确认 renderer 的独立像素规格尚未核实，当前复用本地 EditorDialog chrome，不宣称精确像素一致。

## 接口与生命周期

`batch/useCanvasDeleteConfirmation.js` 固定接收 `documentKey`、`ready`、`readonly`、`getDocument`、`deleteNodes`、`selectedIds`、`zoom`、`isMac`、`notify`，返回：

```js
{
  request, // frozen opaque object，仅暴露 view 文案
  remove(nodeIds = latestSelectedIds, { trigger = 'keyboard' } = {}),
  confirm(capturedRequest = requestFromThisRender),
  cancel(capturedRequest = requestFromThisRender),
}
```

不需确认时，直接通过 fresh `deleteNodes(ids, { zoom, reconcileGroupConsumers: true })` 执行，成功返回 true；需确认时返回 false 并建立 request。IDs 去重且保持请求顺序，过滤已经不存在的 ID，不扩大选择范围。controller 不创建额外 graph snapshot / history / 本地保存；Root GraphActions 在最终确认时重读最新草稿并负责写入。

request 的私有 metadata 通过 WeakMap 保存 document / owner epoch / IDs / 原始 source node identity。documentKey、ready、readonly 的变化与卸载退休旧 request，A→B→A 不复活它。确认前必须同时通过 fresh graph 的 documentKey / ready / readonly 及 nodes / edges 结构验证；显式旧 request、旧无参 confirm/cancel 回调不会写入或关闭新 request。

业务身份重验允许共享原 data 的 position / measurement copy，也允许正常 prompt / text 提交替换 data / params，但要求其他 source data 字段仍按 identity 保留；除 prompt 与其派生 magicList 外，model / settings / locks / 媒体列表等业务 params 必须结构相同，允许值相同但重建的 settings 对象。prompt 与其他业务参数同时变化仍拒绝，不能把它当作普通输入提交。缺失节点、type 更换、业务字段变化或不带新 draft 的同 ID clone 拒绝执行并提示重新选择。它是本地 owner 防护，不宣称原站同样使用 CAS 或 WeakMap。

GraphActions 返回 false 时保留同一个 request 供重试；抛出时提示失败并保留请求。成功只关闭仍为同一个 token 的 request，删除过程中同步出现的新 request 不被误关。取消不调用 deleteNodes，不写 history。

`components/CanvasDeleteConfirmation.jsx` 使用既有 `EditorDialog` / dialog-stack 与 `cv-batch-run-content` / `cv-batch-dialog-actions` 样式。view 始终把 capture 的 request 传给 confirm / cancel；关闭按钮、backdrop、Escape 走 cancel。外层隔离 pointer / click / double-click / context-menu 传播，不创建额外 body overflow、inert、焦点循环或 Escape 生命周期。

## 专项验证

真实 source qualification 先转换为独立 literal 规则断言，owner 使用 GraphActions 边界 spy 检查调用与退休，view 实际使用共享 EditorDialog 和 dialog-stack；三个层级分开，不用模拟成功代替整个 App 的 graph / history 验证。

```text
Node 24.19.0 / Vitest 4.1.11
npx vitest run src/features/canvas/batch/deletion-confirmation-model.test.js \
  src/features/canvas/batch/useCanvasDeleteConfirmation.test.jsx \
  src/features/canvas/components/CanvasDeleteConfirmation.test.jsx
2026-10-13 17:46:41 / 1.03s
3 files passed / 51 tests passed / exit 0
artifacts/canvas-delete-confirmation-identity-final-tests.log
```

pure 模型覆盖键盘 / 菜单优先级、三种旧组文案、空白 source ID、exact v2、script-v2 菜单回落、flow type、opening warning、数组 trim 与无效值。owner 覆盖零预写 / 取消、直删、请求 ID 顺序、最新 selected / zoom / prompt、源身份、false / throw 重试、旧默认 callback、新 request、A→B→A、ready / readonly 丢失、fresh graph 变化、卸载与删除中同步新请求。view 覆盖原文案与 token、关闭 / backdrop、事件隔离，以及已有 preview 下打开确认后的逐层 Escape 与恢复 opener；第二层关闭不解除第一层滚动锁。

之前 `artifacts/canvas-delete-confirmation-model-owner-tests.log`（17:38:34 / 897ms）2 files / 41 tests、`artifacts/canvas-delete-confirmation-scoped-tests.log`（17:39:59 / 893ms）3 files / 46 tests，以及 `artifacts/canvas-delete-confirmation-final-scoped-tests.log`（17:41:42 / 1.21s）3 files / 47 tests 是历史窄检查。随后增加请求 ID 顺序与 prompt / 业务 params 同时变化的身份保护，上面的 51 项对应当前定稿。

## 实际 App 与联合回归

`NodeCanvas.delete-confirmation.integration.test.jsx` render 真实 `NodeCanvas`，使用公开 `models`、`script-text-support`、`script-presets`、`image-model-support`、`video-model-support` 目录与本地匿名 actor。只替换 `useContent` 目录返回；真实 lazy card / generator、NodePromptInput、脚本 rows 编辑器、确认 controller、GraphActions、draft、history 和 localStorage 都保持生产实现，没有 mock 删除成功或业务写入。

7 项 App 场景：

- Keyboard script-v2 原确认文案、取消时完整图与历史不变，选择保留。
- 普通 script generator 最后 150ms 输入尚未提交时确认删除；200ms 后不复活，单次 undo / redo 恢复完整最后输入与每条原始 row / shotNumber。
- Menu 有 URL 的 IMAGE 原内容文案、取消零历史、确认只删除 context ID；无关图片完整保留。
- 同一个 IMAGE 类别从 keyboard 直接删除，未创造内容确认。
- 旧脚本关联 image group 使用原分镜图组文案，确认前零写，确认后父组及 `parentId` descendants 一次删除与 undo / redo。
- opening-used VIDEO 键盘原警告，取消图与历史不变。
- 从实际脚本节点入口打开编辑器，再打开镜头最终提示词，输入最后 video row 文本，逐层 Escape 后确认删除；700ms 不复活，第一步 undo 恢复已经保存的最新完整脚本，redo 再删除。关闭 row 编辑器本来就保存了一次合法 edit / history，该项不要求删除前的这条历史消失，也不伪造零历史。

App 单文件最终运行 `artifacts/canvas-delete-confirmation-final-app-tests.log`（17:52:47 / 3.53s）1 file / 7 tests 全通过；早期 6 项 `artifacts/canvas-delete-confirmation-first-app-tests.log`（17:50:30 / 2.42s）保留。

联合首轮 `artifacts/canvas-delete-confirmation-first-joint-tests.log`（17:53:12 / 4.32s）77 passed / 1 failed。唯一失败为测试等待 script generator 挂载后立即查 card action，但两者独立 lazy，卡片 action 尚未挂载。已在冻结 debounce 前等待真实“打开脚本节点 →”按钮，未修改生产或弱化图 / 输入断言；不将它记为生产删除缺陷。

当前联合回归包含本文件 3 层 51 项、新确认 App 7 项、此前 destructive App 15 项以及 root 的跨 channel draft 5 项：

```text
Node 24.19.0 / Vitest 4.1.11
2026-10-13 17:54:34 / 4.11s
6 files passed / 78 tests passed / exit 0
artifacts/canvas-delete-confirmation-final-joint-tests.log
```

这些 App 运行验证本地确认到图 / 草稿 / 存储 / undo 的完整路径，仍不是全量 check 或 native 布局、真实媒体播放验收。

登录注册、小号与真实服务继续延期。本 agent 没有跑全量 check、浏览器验收、原站写入或部署；相关 root 结果应以实际新日志与冻结 source 为依据。
