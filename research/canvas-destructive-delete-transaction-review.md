# Canvas 全局删除：独立事务与接线复核

2026-10-13。本文只读审查 Root 接线和实际测试，独占维护这份审查文档；本轮未再改生产／测试，未运行测试、全量 check、浏览器、原站 bundle、服务、登录或部署。先前本人拥有的 pure graph／target modules 已交付，不能把对自己纯模型的绿色结果当成 React 接线正确的独立证明。

## 1. 审查结论与已反馈问题

全局节点／边删除已经接入同一个 GraphActions 计划与 CAS，不再只过滤节点或连线；preflight 读取最后草稿，删除计划之后对显式 affected prompt 消费已接受输入。新 GraphActions hook 从 12 项扩至 14 项，15 项 destructive App 与 7 项 confirmation App 提供了具体事务证据。独立阅读发现的两种脚本通道误判、引用入口异常边界、确认身份漏洞、post-CAS 临时 reader 恢复旧 token 和最终 hand／Space-held 键盘删除门控问题均已修，并只读复核对应定稿源码／针对性日志。本次已确认根因关闭；不把全部异常路径、特殊删除入口或整个复刻目标标为完成。

| 发现 | 当前复核状态 |
| --- | --- |
| default 不等于普通 prompt：`useScriptPromptCompose` 的 `scriptPrompts` reader 实际使用默认 channel；旧 consume 会移除活跃的 row 草稿登记 | Root 已改为读取 draft 内容形态、按 `Array.isArray(scriptPrompts)` 保留 row 登记，静态根因关闭 |
| script-generator 不等于 row：`ScriptV2NodeGenerator` 普通 params.prompt 使用该 channel；旧 consume 跳过它，可让 baseline 碰撞后保存／timer 复活旧正文 | Root 已允许所有 plain prompt channel 消费，并补 ScriptV2 的第五参数 acceptCommittedValue 桥，静态根因关闭 |
| deleteReference 的 resolver／fallback／plan 异常没有 global 方法同样的 false／notify 边界 | Root 已把 descriptor、fallback、plan 与提交包在 try/catch，无 match 在 preflight 前返回，静态根因关闭 |
| 新 consume 的 reader 异常直接 continue，已知 plain 输入在 post-CAS 临时读失败时可能跳过 accept 并再次投影旧 baseline 草稿 | Root 已先用完整 node／edge GraphActions 两例实测复现，再缓存成功读取的 draft kind；plain fault 继续接受或退休，row fault 保留恢复。修后 8 文件／140 项通过，源码根因与新增强例已只读复核 |
| 新 confirmation 的 source identity helper 曾忽略整个 params；prompt 和 model／settings／锁同时变化可被接受 | 作者已收紧业务 params 结构比较；4 项新增强例覆盖 model／settings／锁伴随 prompt 的拒绝和正常等值 settings／magic 重建。已只读核对定稿代码与 51 项专项，静态根因关闭 |
| 完整源 props 的 effective hand（stored hand 或 Space held）禁用 Delete／Backspace；本机 keyboard 曾未读取 tool，仍调用 remove | Root 先用 4 项 hook 强例实测全部失败，再传 tool 并增加删除入口 gate；修后 keyboard＋实际 App 联合 3 文件／35 项通过。已只读核对门控与 NodeCanvas 透传，根因关闭 |

该 plain reader 缺陷首先从 `useCanvasDrafts.consume` 的 read catch／continue 与 GraphActions 调用顺序静态推导：prepare、commit next、commit previous 三次 reader 成功，第四次 consume reader 临时 throw；accept 未执行而登记保留。旧 saved A 为 `{{Image 1}}`，待提交 B 为 `{{Image 1}} {{Image 2}}`，删除第二条来源后新图恰清理回 A。第五次保存 project reader 恢复旧 B／base A，再把 B 投影回去。这不需要私人接口、坏媒体数组或循环图。

Root 随后在生产 hooks 的 node／edge 入口各加一个独立故障例：第 4 次 reader 抛错，检查已接受图、exact accept、完整 save-retry graph、单次历史与最后输入。修前日志实际显示两例 accept 都为 0 次，retry prompt 从 A 恢复 B。并没有只运行 registry consumer 或模拟图成功来证明根因。

修复后 project 与 consume **仅在成功读取时**缓存 `lastDraftKind`，按 `Array.isArray(scriptPrompts)` 区分 row／plain；缓存属于实际 entry，不按 channel 名猜测。消费读失败时，已知 row 或尚无类型且无 accept 的旧 reader 保留；已知 plain 或明确 accept bridge 继续调用接受值，失败／抛错则退休。removedNodeIds 仍在读取前删全部 channel。已接受图不因临时输入读取错误报失败，同时正常 row 草稿保留恢复，活跃 plain 登记接受后支持未来用户编辑。未知 legacy reader 的恢复是保守兼容，不是完整未知第三种草稿类型支持声明。

| 第 4 次读取故障专项 | 实际结果 |
| --- | --- |
| [修前完整 hooks](../artifacts/canvas-destructive-delete-consume-before-fix-tests.log) | 19:28:55，2 targeted cases 失败、12 skip；node／edge 均 accept 0 次且 retry token 复活 |
| [修后联合检查](../artifacts/canvas-destructive-delete-consume-after-fix-tests.log) | 19:30:42，8 文件／140 项通过，包含上述两例与 cached row read-failure 恢复新例 |

这两份是 Root 的实际执行日志，本文只读验证，未重新运行。P2 已按真实 before／after 关闭，不再以旧 row-only 恢复测试替代 plain 保证。

## 2. preflight、计划、历史与 CAS

`prepareDeletion` 先在当前 raw graph 上投影本文件的所有可写草稿，校验返回 nodes／edges 为数组；普通参考卡片另外显式并入 prompt ref `getValue()`，按 Magic helper 维护 metadata。它生成源快照，不提前改变 currentDocument。对全局删除而言，安静 sibling 的最后输入也进入源快照，保留到 next／history，而不是将选择 source 时退休的 downstream 草稿抛弃。

純计划用这份已投影 source，普通参考 direct edge 委托完整 edge plan，group exclude 则只重算目标。`deletionFallback(source)` 仅在至少一个 typed array 缺失时，用原图 resolver 提供本机兼容列表；合法 raw 数组和显式 `[]` 由 target recalc 优先使用。fallback 不是从删除后的图猜旧编号。

`commitDeletion` 对 plan 的显式 prompt 再正规化 Magic metadata，next 用 plan 的 nodes／edges，historySnapshot 用 preflight source。`commitGraph` 投影 next 时指定 explicitPromptNodeIds，避免目标清理结果撞旧 baseline 后重复叠加；previous 仍正常投影。CAS 同时核 active、documentKey、ready、readonly 和原 nodes／edges／models 身份，且投影前后各检查一次。竞争 graph 保留，不用旧数组覆写它。

成功才同步发布 currentDocument、一次历史、消费指定草稿、setNodes／setEdges。Global deleteNodes／deleteEdges／deleteReference 都是本地 boolean 结果；不能使用原 source `ig` 的特殊 boolean 充当删除成功判断。current raw graph、history snapshot 与持久化结果是三项不同证据。配额失败发生在图接受之后，重试仅保存当前图，不重新执行删除计划。

## 3. 草稿与成功后的输入生命周期

当前 `useCanvasDrafts.register` 按 documentKey／nodeId／channel 保存一项 reader，cleanup 只退休同一 entry，不覆盖新注册；退休时捕获 snapshot，正常投影仅在 saved baseline 仍匹配时进行。removedNodeIds 成功后移除该节点所有 channel，随后旧 cleanup 不能重建其登记。其它 document 的同 ID 输入保持独立。

Generic Inline 默认 channel 与 ScriptV2 的 script-generator channel 现在都有 `acceptCommittedValue` 回调。它取消 timer、更新 draft／emitted／external value 和 DOM，避免外部 value 仍等旧 A 而 controlled effect 检测不到更改。成功后保持登记，支持同一活跃输入的下一次用户编辑。退休普通 prompt 登记被删除，其最后正文已经进入历史；default-channel 的 row draft 按 scriptPrompts 形态保留，而不是按 channel 名猜测。

普通参考 X 的 Inline 成功桥仍会读取已接受 raw 文档并核 documentKey，再提交输入接受值；失败不做此步骤。Global graph 消费已能直接通知活跃 Inline，因此这个旧桥可重复调用同一接受值；没有第二次 onChange 或图历史。输入引用列表更新后的 layout effect 会用最新 references 重新绘制徽标，不把首次同步 redraw 的旧 references 当最终画面。

entry.accept 异常／false 由 registry 隔离并退休登记，避免 captured snapshot 在保存时重投影；实际 `acceptCommittedValue` 在 redraw 前取消 timer。此处不能泛化成“任何自定义 accept callback 抛错都已取消它自己的 timer”。临时 reader 失败的 plain／row 现在由成功读取的内容形态缓存区分，详见第 1 节的实际故障与修后日志。

App 的 `useAppUI` 直接使用稳定 `LOCAL_WORKSPACE_USER`，GraphActions／确认／draft 的文档权限来自 fresh `documentKey`／ready／readonly。actor 仅有本地 id、name、demo、localWorkspace，不含账号 token、会员或团队权限；真实 App fixtures 使用这套同样的本地 actor。NodeCanvas 保留的 no-user 历史 guard 在当前 App 正常入口不触发，不构成本批登录前置条件。该事实不是原站匿名服务器授权证据。

## 4. NodeCanvas、选择、连线与确认接线

NodeCanvas 向 GraphActions 注入本 storageKey 的 `project` 与 `consume`。选择删除在成功 boolean 为 true 后才清 selected／panel；失败与等待确认时保留原 UI。生产回调存在时不走旧 removeCanvasNodes fallback。UI 调用明确给本机 `reconcileGroupConsumers: true`，raw edge 删除不运行 partial-parent UI 几何。

渲染 SVG edge 现在带 nopan，并在 pointerdown bubble 与 double-click 中隔离事件；关键是 capture 阶段共用 pointer profile 已识别 nopan，不能只以 bubble stopPropagation 断言 capture 没启动。reference-pick box 和普通 paneClick 的 isolated 判定也识别 nopan。Double-click 仅在非 readonly、非 interactionMode 下交给 GraphActions，不再在生产直接 setEdges(filter)。实际 App 强例先执行 pointerdown/up/click，再 double-click，并检查 selection 和 editor 身份。

confirmation 的定稿 hook／view 与 NodeCanvas 已只读复核。keyboard／menu 来源由 `useCanvasSelectionActions.remove(ids, { trigger })` 透传，实际 context menu 明确传 `menu`，没有将菜单内容提示误套成键盘资格。opaque frozen request 的 IDs／source nodes／document owner/version 存在 WeakMap；未确认不调用 GraphActions，最终确认才读取最新 graph／zoom，并由 GraphActions 重新收集当前草稿。A→B→A、ready／readonly 丢失和卸载退休旧请求；显式旧 token 与旧无参 callback 均不能确认或关闭新请求。GraphActions 返回 false 或抛出时保留同一 request 重试；成功只关闭仍是该 token 的请求，不误关执行中重新出现的 request。

确认 source identity 允许共享旧 data 的 position／measurement copy和正常 prompt／text 提交。除 prompt 与派生 magicList 外，业务 params 必须结构等值；model／settings／锁同时伴随输入变化也拒绝。其它 source data 字段仍按 identity 比较，缺失／换 type／换业务实体／无新输入的同 ID clone 拒绝并提示重新选择。这是本机 owner 防护，源站没有被证明使用同样 WeakMap／CAS。

Root 的 request effect 会取消 pointer、touch、connection、multi-connection、group resize及相关菜单，generator／batch video／group resize 收到 suspended；确认 view 复用 EditorDialog／dialog-stack，捕获该次 request，外层隔离 pointer／click／double-click／context-menu。Hook 资格门控和 dialog-stack 的顶层键盘隔离是不同层，不能只因 mounted modal 存在就推断所有 native 输入路径已验收。

最终键盘复核额外确认 effective hand 的真实源门控。归档 `21_0xvlvkw1sz.js` UTF-16 半开范围 `[751511,751680)` 明确 `nG = 'hand' === resolveEffectiveCanvasToolMode(canvasToolMode, useSpacePanHeld())`；`[961119,961256)` 的 hand props 返回 `deleteKeyCode:null`，实际 ReactFlow `[964746,964870)` 在默认 delete keys 后 spread `cP`。`1fn_ozkqd_aiz.js` `[27914,27948)` 直接为 `function y(e,t){return t?'hand':e}`。这覆盖 stored hand 与按住 Space 的临时 hand，不能只看 base locked／fullscreen resolver。本文已亲自静态读取这四段，与 source agent 独立确认一致。

修前 NodeCanvas 的 keyboard props 未传 tool，Delete／Backspace 在 reference／focus／mark 分支以外直接 remove，没有 stored hand／space.current gate。Root 已让 NodeCanvas 透传当前 tool，keyboard 从 latest.current 读取，删除入口在 `tool === 'hand' || space.current` 时直接返回。Space keyup、window blur 和卸载仍清 ref；恢复 select 或释放 Space 后正常删除。expanded generator 自身有 role=dialog，keyboard 继续先排除 dialog／input／contenteditable，没有以取消输入门控来修手型规则。

| effective hand 门控专项 | 实际结果 |
| --- | --- |
| [修前 keyboard](../artifacts/canvas-destructive-delete-hand-before-fix-tests.log) | 20:27:50，4 targeted cases 全失败、9 skip；stored hand／Space held × Delete／Backspace 均误调用 remove |
| [修后联合检查](../artifacts/canvas-destructive-delete-hand-after-fix-tests.log) | 20:28:38，3 文件／35 项通过：keyboard 13＋destructive App 15＋confirmation App 7 |

四项门控强例还分别检查恢复 select／keyup 后 exactly one remove，未通过永远禁用删除获得绿色。手型资格以真实 keyboard hook 验证；联合 App 的 22 项同时复核普通删除、最后输入、确认、保存与撤销，不称为新增四项实际 App 手型操作或 native 键盘证据。该表是 Root 完整执行日志，本文没有重复运行测试。

## 5. Source 与本机适配的准确范围

[完整 source 审计](./canvas-destructive-delete-source-audit.md) 区分 UI 与 raw store。普通 group／video_group UI 按 parentId BFS 扩后代，部分父节点只计算一层；没有36标题 padding。字段合并顺序为全部 resize 后全部 child position，不能逐 parent 覆盖旧 node。p2 分镜绑定使用 partial preferred／重复 entries／append missing 的特定顺序和旧 image index 的 row fallback。

Raw node editing cascade 只从原 seeds 扩一次，没有目标 VIDEO type gate；edge 先 iS targets → raw iv 一次 → 余 edge 普通分支。Node 删除不做 ih，affected targets ig 后清 truthy stale；edge 删除做 persisted characterRef cleanup／ih／ig，却不追加 node 的 stale false。特殊 picture、submitted segment、panorama、SCRIPT style、IMAGE style/stale 和 VIDEO lens 是可达的前端规则，已经由独立 target recalc helper支持，不能写成全靠后端或登录。

有两项明确本机改进：解除嵌套 parent 时保完整世界坐标，区别 source 只加单父相对坐标；UI 删除存活组的 child 后，只遍历其 pre-tree 存活 group／video_group 祖先的真实 outgoing consumers，修 source 此处没有即时 group-consumer 重算的遗漏。cycle guard 也是损坏本机文档的防御适配。不能将这些行为倒写成原站既有实现，也不能扩大为扫描／重算所有 targets。

## 6. 已读验证与当前边界

本轮只读检查新 GraphActions 测试原 12 项及后增 2 项：active／retired input、最新 history 和 sibling、edge baseline 碰撞、下一次用户编辑、权限／文档／unmount 拒绝、preflight／next projection 异常及竞争 CAS、空请求／旧请求零历史，以及 node／edge 第 4 次 reader 异常。它们使用真正 drafts／GraphActions，但 accept 是可控 fixture；真实 ScriptV2／row controller 组合的额外证据来自下方 actual App。

Root 后续新增 `useCanvasDrafts.destructive-delete.test.jsx` 的内容已读：active／retired script-generator 与 default rows 共存、其它 document、删除全 channel／旧 cleanup、accept throw、unknown row read recovery，以及成功 project 缓存 row kind 后 post-CAS 读取失败仍保留恢复。前五项历史检查与最后新增项属于不同代码时点；plain fault 由第 1 节完整 GraphActions 两例补齐，真实 ScriptV2 DOM／timer 由 actual App 补齐。

另外读取 [实际 App 审计](./canvas-destructive-delete-app-audit.md) 与 Root 的 [11 文件／133 项联合日志](../artifacts/canvas-destructive-delete-root-source-aligned-tests.log)，以及此前独立纯模型的 [4 文件／145 项日志](../artifacts/canvas-destructive-delete-character-after-fix-tests.log)。命令属于不同源码时点；联合日志不是全检，也没有给后续 confirmation／reader 修改提供冻结证明。纯模型的 nested／character 修前失败档案仍保留，未靠削弱 graph／undo／source 字段断言获得绿色。

已读取 [confirmation 审计](./canvas-delete-confirmation-audit.md)、51 项 unit／hook／view、7 项真实 App 的代码和以下作者运行日志；本 agent 没有重复运行它们：

| 检查 | 日志时间与范围 |
| --- | --- |
| [确认资格／owner／共享 view](../artifacts/canvas-delete-confirmation-identity-final-tests.log) | 17:46:41，3 文件／51 项，通过 |
| [实际 confirmation App](../artifacts/canvas-delete-confirmation-final-app-tests.log) | 17:52:47，1 文件／7 项，通过 |
| [最终 confirmation 联合回归](../artifacts/canvas-delete-confirmation-final-joint-tests.log) | 17:54:34，6 文件／78 项，通过；51＋7＋原 destructive App 15＋跨 channel drafts 5 |

7 项真实 App 保留 actual card／generator／NodePromptInput／script rows／GraphActions／history／localStorage，仅公开模型目录通过 fixture 提供。覆盖 keyboard script-v2 取消完整图不变、最后 150ms 普通 script input 删除／200ms 不复活／undo／redo、menu generated IMAGE 仅删 context ID、keyboard 同类 IMAGE 直接删、旧脚本绑定组的 descendants、opening-used VIDEO 取消，以及实际脚本编辑器→row 最终提示词→逐层 Escape→删除／700ms／undo。最后 row 场景在关闭 row 编辑器时已经合法提交一笔编辑历史，不可称为删除前“零历史”或 raw pending row 与删除同时发生。联合第一次单例 lazy card 未挂载的失败已记录，最终等待真实 action 挂载，并未更改生产或削弱业务断言。

本次只读计算确认三模块 SHA，与作者冻结消息逐项一致：

| 文件 | SHA256 |
| --- | --- |
| `batch/deletion-confirmation-model.js` | `56f03bfc8fb91794000d2ac71094036c076711fa45284527fafb22e71fcf4ce9` |
| `batch/useCanvasDeleteConfirmation.js` | `d49b8f5ee71ddb9d2d43cb93e2c1b791aa0efd5e251baa670850b60159fad1f9` |
| `components/CanvasDeleteConfirmation.jsx` | `79124588e90e7e81ee0bfd354b0ae4104d975880c4538e96cd2daad571a621ed` |

本批没有新的全工作区 source snapshot／正式 fullcheck／native 最终结果可供本文证明。普通节点／边及节点确认的已验证本地事务，不能覆盖以下 source 可达协议：script/group edge 的“断开连线”确认与 `unlinkStoryboardByEdge`；VIDEO／AUDIO→VIDEO_CLIP 的 timeline source／clip 移除、currentTime 限幅和异步锁／owner 重验；`deleteNodesBatch` 的 atomic lock 成功／部分失败／取消／flush 后错误及协作 transient 状态。当前 NodeCanvas edge double-click 直接走普通 raw `planCanvasEdgeDeletion`，没有上述独立 UI 分支；它们不是只有服务端才能呈现的交互，必须在覆盖清单另列待实现／待验证，不能笼统归入“后台未接”。原站 history 的 pending patch／temporary nodes／版本门控与本机 JSON snapshot 历史也不是同一实现。

全部真实后台服务、原站认证与账号资源继续延期；当前是本地匿名工作区，不把它们当本批推进条件。consume、confirmation、channel、引用异常和 hand／Space-held 已确认根因均已修并补针对性回归；整个修后工作区的完整检查与冻结仍由 Root 另行完成。原站确认 chrome 精确像素、native 手势／焦点和跨设备仍未由本文验证。整个复刻目标仍未完成。
