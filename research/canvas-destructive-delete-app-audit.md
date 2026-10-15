# Canvas 破坏性删除：实际 App 事务验收（2026-10-13）

本批继续用户提出的“节点交互不流畅自然”与完整功能复刻目标。验收范围为本地匿名工作区的真实 Canvas UI 删除入口：选中节点后的 Delete、渲染连线的 pointer / double-click、普通参考卡片删除、实际节点输入器的未提交草稿、浏览器持久化、撤销与重做。不连接认证、原站账号、生成、支付或运营写服务，不发布部署。

## 原站合同与证据范围

- [破坏性删除源审计](./canvas-destructive-delete-source-audit.md) 区分 UI callback、raw store 删除、普通组与编辑中续写的级联。普通组 UI 删除扩展 `group` / `video_group` 的 `parentId` 后代；不能把之前本地 `removeCanvasNodes` 的保留孩子行为作为原站依据，也不能把 `video-story` 自动归入这个源集合。
- partial group 的删除规则：剩余 direct child ≤1 时删除父组，唯一孩子解除 `parentId` / `extent`，位置增加父组位置；剩余 ≥2 时使用 `measured` 优先的尺寸、视图 `z || 1` 与 `20 + 20 * (sqrt(z) - z) / z` padding 调整父组和孩子相对位置。源分支不同时改写 `style`、`dataNodeWidth`、`childNodeIds` 或 `selected`。
- [上一批普通引用删除源审计](./canvas-reference-delete-source-audit.md) 确认旧 raw typed lists / old mode 的 token 映射及 surviving-media 编号。删除连线后的输入重算使用 post-delete graph，不能仅隐藏引用卡片。
- `pictureEditLock` 最后视频消失时替换整个 params 为源规定字段；submitted segment loss 去 lock / draft 并删除有效 `SegmentRange`，不额外清理空白；editing phase 丢失源 node 或源 edge 会删除编辑中 target，随后重算继续存活的下游 target。
- 仍存活的 group 在删除 child 后，原站本批 store 证据没有即时重算全部 group consumers 的保证。本地 UI 使用 `reconcileGroupConsumers: true`，按用户授权修复残留旧引用：保留 group edge 并即时重算实际消费者；这是明确限定的本地交互改进，不作为原站已有行为或 exact store 语义的证明。
- 源历史采用其自己的微任务合并机制；本地使用已有文档所有权与 CAS 事务。这里验证一次动作对应一次可撤销的整图变化以及最新输入保护，不宣称两个实现逐行相同。

## 实际测试边界

`src/features/canvas/NodeCanvas.destructive-delete.integration.test.jsx` 直接 render `NodeCanvas`，使用 `LOCAL_WORKSPACE_USER`、真实公开 `public/data/models.json`、真实 lazy 生成器、输入 controller、draft registry、GraphActions、history 和 `localStorage`。唯一业务加载替身为既有 `useContent`，提供公开模型与空运营内容；没有替换图写入、成功返回、历史、撤销或持久化实现。

模型 fixture 先以真实 `resolveNodeGenerator` materialize 合法 schema defaults，避免把首次显示的模型默认值误认为删除动作。DOM geometry 与 RAF 按既有实际 App 回归约定稳定；这份 jsdom 文件不是 GPU、视频播放或真实布局验收。日志保留 jsdom 的 `HTMLMediaElement.load/pause` 提示，不将其当作真实媒体成功。

150ms 场景在实际 lazy 输入器完成挂载后才冻结 timeout；切换 owner 时只通过 React `act` 等待 cached module 的 promise，不推进输入 debounce。删除通过 click 选择真实 article 后向 window 发送 Delete，连线通过真实 SVG path double-click。`pagehide` 走实际保存入口，不写 storage 伪装生产操作。

15 项独立断言覆盖：

1. 上游 source Delete 清理每个被删 token、重排 Portrait 编号、更新 typed list、保留其他 source 与无关节点。
2. cleanup 返回旧 raw prompt 的 baseline 碰撞，200ms / pagehide / undo / redo 不能复活旧 draft。
3. 两个 downstream target 各自清理，未连接 sibling 的最新草稿与兄弟数据保留。
4. quota 失败保持接受后的本地图，随后实际“重试保存画布”保存一次，不重复删除或历史。
5. 普通 group UI Delete 扩展 nested `parentId` descendants，清理其直接连线目标。
6. partial group 剩余一个孩子自动解散并保留孩子世界位置与数据。
7. partial group 剩余两个孩子按 measured 尺寸与 zoom padding 计算 bounds，旧 style / data metadata 保留。
8. 最后视频消失后的 picture-edit params reset，target 的其他 data 不变。
9. submitted continuation 去 lock / draft / range，保留无效带空格 range 和原空白。
10. editing continuation 的源 node 删除级联到编辑 target，再清理下一 surviving target。
11. rendered edge 在双击前真实触发 pointerDown / pointerUp / click，检查 board capture 未清 selection / 输入；double-click 在输入仍挂载的 baseline 碰撞，保持 editor DOM 身份并接受清理后值。
12. editing continuation 的源 edge double-click 删除 target，保留 source。
13. 删除普通 group 的 child 后，保留 group edge、即时清理真实 group consumer；仍存活素材的世界位置与节点数据、无关 consumer、完整文档 metadata 不变，`savedAt` 按实际保存更新。
14. 普通参考卡片删除最后视频，同步 picture-edit params reset，保留全部 source nodes。
15. 普通参考卡片删除 editing continuation 的源引用，级联删除 target，保留全部 source nodes。

各项检查实际保存的整图；undo 返回删除前图与最后未提交输入，第二次 undo 禁用；redo 返回首次 accepted graph，第二次 redo 禁用。它们不把“后端未接”当作这些本地删除分支的阻断条件。

## 修复前证据

首版 2 项在 root 修改 production 接线前完成冻结：

```text
Node 24.19.0 / Vitest 4.1.11
npx vitest run src/features/canvas/NodeCanvas.destructive-delete.integration.test.jsx
2026-10-13 17:09:03 / 2.22s
1 file failed / 2 tests failed
artifacts/canvas-destructive-delete-app-before-fix-tests.log
```

第一项 source node / edge 正常删除，但 pending token 全部原样残留；第二项只删除父组，nested 与两个 descendants 残留。两个失败均抵达真实生产 UI 与保存断言。

扩展到 10 项的中间运行 `artifacts/canvas-destructive-delete-app-expanded-tests.log`（17:13:07 / 7.62s）有 9 个源语义失败和 1 个 fixture 问题：多 target helper 抓住了初始 lazy loading frame，`waitFor` 在 fake timeout 下超时。helper 已改为 cached-module microtask `act`；修正后单跑 `artifacts/canvas-destructive-delete-app-multiple-target-before-fix-tests.log`（17:14:04 / 2.68s）该项实际失败于 source token 未清。不能把中间的 fixture timeout 算作第十项生产缺陷。

新增连线入口两项的 `artifacts/canvas-destructive-delete-app-edge-before-fix-tests.log`（17:15:14 / 2.15s）均真实失败：active input 旧 token 保留；editing continuation 的 target 未级联删除。该运行 2 failed / 10 skipped，不是完整 12 项运行。

## 当前结果与剩余边界

本地生产接线落盘后的首轮 12 项实际 App 专项全通过：

```text
Node 24.19.0 / Vitest 4.1.11
npx vitest run src/features/canvas/NodeCanvas.destructive-delete.integration.test.jsx
2026-10-13 17:21:13 / 2.92s
1 file passed / 12 tests passed / exit 0
artifacts/canvas-destructive-delete-app-first-wiring-tests.log
```

随后生产普通引用入口复用 edge 的完整删除 effects，并为真实 edge pointer capture 加入隔离；测试追加 group consumers 的限定本地修复与普通卡片两个特殊分支。扩展首轮 `artifacts/canvas-destructive-delete-app-strengthened-first-tests.log`（17:25:55 / 3.04s）14 passed / 1 failed，唯一失败为 fixture 把 `savedAt` 也要求不变。实际保存正常更新时间，已改为文档其他字段完全不变且 `afterSavedAt >= beforeSavedAt`；没有修改生产或放松任何图、输入、源分支断言。

最终加强后的 15 项实际 App 专项全通过：

```text
Node 24.19.0 / Vitest 4.1.11
npx vitest run src/features/canvas/NodeCanvas.destructive-delete.integration.test.jsx
2026-10-13 17:26:35 / 2.86s
1 file passed / 15 tests passed / exit 0
artifacts/canvas-destructive-delete-app-final-tests.log
```

修复前的源语义断言原样保留，包括整图 undo / redo、active editor DOM 身份、baseline 碰撞及 quota 失败后的实际重试。该结果只证明本次命令读取的本地源码与以上 15 项 App 场景；源文件冻结、全量 check、native UI 与 artifact SHA 由 root 的最终维护记录统一给出，后续生产修改须重新核对。

这份文件不证明所有源 renderer effect、焦点参数降级、原站对仍存活组即时 consumer 更新的承诺、全部 style/lens/script 特殊节点或真机媒体交互已对齐，也不证明整个原站复刻目标完成。节点 Delete 与 edge Delete 的 group exclusion 清理差异以源审计为准，不能从本地新行为反推源实现。
