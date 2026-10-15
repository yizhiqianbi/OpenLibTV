# ScriptV2 工具栏显式 target 与选择协议审计

2026-10-12。本轮仅静态读取归档公开源码和本机实现，不执行原站脚本，不读取账号，不请求生成、审核、费用或写服务。只新增本文件，没有修改生产代码或测试，没有运行测试或全量 check。这里记录工具栏 target 分支的证据和后续最小接口建议，**不将引用拾取、标记或区域聚焦模式标记为已实现**。

偏移为归档文件解码后的 0-based 字符位置，不是字节或格式化行号。此前四按钮、工作流条件、确认窗和工具栏尺寸的完整证据见 [ScriptV2 工具栏审计](./canvas-script-node-toolbar-source-audit.md)；本文件专注其显隐入口与所有权。

## 1. 原站 predicate 的准确范围

[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) module `464025`，`e6` **679733–680267**，导出 `useShouldShowGenerator`：

```text
targetId = isReferencePickMode ? referencePickTargetNodeId
         : isMarkMode          ? markSourceNodeId
         : isFocusMode         ? focusSourceNodeId
         : null

eligible = (nodeId === targetId)
        || (selected && exactlyThisOneNodeSelected && !isBoxSelecting)
```

普通选择的初始 effect 在 `selected` 为 false 时清 false；否则读取 ReactFlow `getNodes().filter(node => node.selected === true)`，只有一个且 ID 为当前节点才成立。后续 `useOnSelectionChange` 同样要求回调 nodes 数量为 1、包含当前 ID。最终普通分支还要求 caller 的 `selected` prop 为真。不是表格镜头的 UUID/index Set，不是全部图节点的数量，也不是只检查 `selected.includes(id)`。

显式分支有下列不可省略的细节：

- `reference → mark → focus` 是按**模式 active** 的嵌套三元选择，不能改成三个 ID 的 nullish fallback。最高优先级模式开启而 target 为 null/失效 ID 时，不借用下一个模式的 ID。
- target 匹配通过 OR 绕过普通单选、`selected` prop 和 box-select 条件。原 hook 本身不验证 target 是否存在、节点类型、ready、readonly、任务、拖动、面板或账户；这些由 store/renderer/owner 承担。
- active 模式不会自动否定普通分支。因此 target A、普通唯一选中 B、未框选时，A 和 B 都可得到 eligible；不能擅自把模式改成“全局只显示 target A”。正常 setters 会互斥模式，但 predicate 仍保留精确优先级。
- target 匹配只决定显示入口，不把 target 节点改成 selected。节点壳的选中 outline 仍按 renderer `selected` prop，不能为了显示工具栏篡改图选择。
- hook 不含 drag guard。Source 的拖动隐藏来自 NonScaledWrapper 的本节点 `nodeLookup.dragging`，不能把“任意节点拖动”写成源 predicate。

## 2. ScriptV2 caller 的全部相邻门控

同文件 `sT` **1332047** 接收 `{id, selected}`，读取当前节点 data、incoming/outgoing、全局 readonly 和公开模型/support。**1340739** 调用 `ea = useShouldShowGenerator(selected, id)`。source `e_`/`eO` 是任务 generating/failed，**1345431 附近**的 `eF` 是 `scriptV2TaskMode === 'recompute-batch-shots'`，因此：

```text
fullGenerating = isTaskGenerating(taskInfo) && !recompute
fullFailed     = isTaskFailed(taskInfo) && !recompute
cardState      = fullGenerating || fullFailed
               ? fullGenerating ? 'generating' : 'failed'
               : rawRows.length > 0 ? 'resource'
               : hasIncoming || hasOutgoing ? 'pending'
               : 'empty_generate'

eK = ea && !readonly && !fullGenerating && (rawRows.length > 0 || fullFailed)
eX = !readonly && ea && cardState in ['empty_generate','pending','resource','failed']
```

`cardState` **1347911**、`eK` **1348063**、`eX` **1348611**。显式 target 也不能绕过 `eK` 的 readonly、整脚本生成、零行非失败限制。`eX` 是下方 `GeneratorFactory` 入口，不是四按钮工具栏；不能因为 target 能显示生成器，就给空白/入边等待脚本补四按钮。

返回 JSX **1384466** 先处理 empty 和 pending 两个壳；两者有 `eX` 的生成器，无 `si` 工具栏。其余分支 **1387014** 才以 `eK` 挂载 `g.default({nodeId:id, baseOffset:24})` 和 `si`。`si` action 门控继续来自实际 `e0` workflow：image 要 outputGenerationReady；video 额外 rawRows 非空和 `Z` 可用；download 要 allReady。target 不替代 workflow、不把 pending/失败资产造为 ready。失败零行可显示重新生成，其他动作仍受各条件限制。

Source 普通资源卡双击打开全屏、阶段跳转、表格行选择和资产高亮在相邻 renderer 中独立维护，不赋值 `referencePickTargetNodeId/markSourceNodeId/focusSourceNodeId`。不能从这些 UI 的当前 scriptId 自动推导三种模式。

## 3. 显式 target 是实际模式状态，不是 focus 的别名

### Store 互斥与清理

[0leiedr1esdbe.js](./source/0leiedr1esdbe.js)：初始字段 **92864 附近**；项目 store reset **90614–90880** 同时清三个 active/ID、focusInteractingNodeId 和引用候选/已连接集合。

| setter / 偏移                       | 开启行为                                                                     | 关闭或附属行为                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------- |
| `setMarkMode` / **124831**          | active/markSourceNodeId；清 focus、reference、capture 和字幕区域 session     | 关闭 target 置 null；Mark hook 另清 mark point store |
| `setFocusMode` / **125203**         | active/focusSourceNodeId；清 mark、reference、capture 和字幕区域 session     | 关闭 target 置 null、focusInteractingNodeId 清 null  |
| `setReferencePickMode` / **126202** | active/referencePickTargetNodeId；清 mark、focus、capture 和字幕区域 session | 清 pickable、connected、blockReasons、limitCount     |

这一段仅证明源状态协议；不是让本机添加未核实的 mode 按钮。目标 ID 指生成器/动作 owner，不是鼠标当前 hover 候选。

### 三个实际 hook 与 canvas 控制

[27g5ro4e8nocv.js](./source/27g5ro4e8nocv.js) module `132169` **23135 起**的 `useFocusMode`：enter 把传入 ID 写 source，exit 关闭。active 时禁 nodesDraggable、nodesConnectable、elementsSelectable、Delete 和普通 connect callbacks。module `719779` **23775 起**的 `useMarkMode` 除这些门控，还清普通 node/selection drag callbacks、允许画布 pan，并按 canvasLocked 控制 zoom；exit 清 mark point store。它们不是浏览器 `.focus()` 和短暂 fitView 动画。

[3zez5ighjd7k4.js](./source/3zez5ighjd7k4.js) module `450681` **17969–20300 附近**的 `useReferencePickMode`：

- `enterReferencePickMode(id)` 先开 mode/target，再异步重算候选；`exitReferencePickMode()` 增加 module sequence 后关闭 mode。
- `l(id)` **18061** 先查实际 target。SHOT_BREAKDOWN 单独允许未连的有真实非 blob URL 视频；其余调用 `collectCanvasReferenceCandidates({nodes, edges, targetNodeId:id, isStale, scriptV2ImageOnly:true})`，见 **18682**。此 evidence 明确存在 ScriptV2 参考拾取资格，不能以普通视频容量代替。
- 重算结果是 pickable、connected、reasons 和 limitCount；提交候选前重验当前 mode active 且当前 target ID 等于请求 ID。输入可有 pending 重算，使用单个队列和 sequence 隔离旧结果。
- active 时也禁普通 drag/select/connect/delete，节点壳会读取 `data-ref-pickable`，区分 self、可选、connected、blocked/video/limit。[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) **665172–665920**。

[21_0xvlvkw1sz.js](./source/21_0xvlvkw1sz.js) **752000–754420** 实际接入三种 hook 与 mode-specific ReactFlow props；canMoveSelection/canBatchConnect 同时被三个 mode 阻断。实际 ReactFlow JSX **964752–964853** 先赋一般 nodesDraggable/nodesConnectable/elementsSelectable，再按 `...nZ`（mark）、`...cP`（hand）、`...n2`（focus）、`...oh`（reference）、capture/practice props 的顺序覆盖，确认三模式的禁用 props 没有被一般 writable props 再覆盖。**283018 起**有独立 reference box-select，target为实际节点且非SHOT_BREAKDOWN才允许，候选来自 pickable 集合，不等于普通框选改变 selected。**160226** focus/ **180087** mark/ **286098** reference 有各自退出/返回源节点 UI 和 Escape；focus 有 pending region 优先取消分支，mark exit 清 point store。**958901–959350** pane click 以同一 target 优先级再排 RAF 将目标选中，说明 source 正常 pane deselect 和目标工具栏保留是另一层协议。

这些模式包含图交互接管、退出 UI、候选/点/区域状态和异步生命周期。只增加 `targetId` 让工具栏出现，会遗漏实际动作，也会让普通 pointer 继续拖动/框选/连线。源 selector 不等于该模式的完整产品实现。

## 4. 本机目前能准确对应什么

截至本轮只读检查，`src` 没有上述六个 mode active/target 字段或 mode controller。当前运行入口如下，不能因名称相似冒充原模式：

| 本机入口                                              | 已有准确身份                                                                                                                               | 与源 target 的关系                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Canvas 普通单选                                       | `NodeCanvas.selected` 是 canvas ID 数组；pointer 对当前已选节点保集合、未选节点取 singleton；Shift 切换；矩形选择单独由 selectionRect 表达 | 可以准确对应源普通单选分支。不是显式 target                                                                          |
| inline prompt 的增强引用菜单/asset picker             | `CanvasNodeInlineGenerator` 为生成器传明确 `targetNodeId=node.id`，提交图事务检查 documentKey/session                                      | 是合法的引用写入 owner，可供**未来实际画布拾取入口**建立 mode；当前只是菜单/选择器，未开启源 reference-pick 画布模式 |
| 连线                                                  | linking / connection.preview.nodeId 是起点 owner，hoveredNodeId/preview.target.targetId 是当前 candidate                                   | 不对应 referencePickTargetNodeId；反向拖 target handle 也不能把 hover candidate 当生成器 source                      |
| Agent 引用、生成参考卡双击、脚本资产“定位”            | `useCanvasNodePresentation.onLocate` 解析实际节点 ID，验证项目/ready，计算 world bounds 后 300ms setView                                   | 明确不修改 selected，不保存 focus mode；不是 focusSourceNodeId                                                       |
| 原生 DOM focus / Escape 回 toolbar 按钮               | stable HTMLElement opener，由 dialog-stack/controller 管理                                                                                 | 仅可达性焦点，不是图模式 target                                                                                      |
| Inspector `panel`                                     | 面板节点 ID                                                                                                                                | 编辑面板 owner，未进入点标记或区域聚焦，不映射三类 target                                                            |
| ScriptV2 全屏、当前 workflow step、表格 row selection | scriptId、stage/tab、hiddenUuid/index Set 各自可识别                                                                                       | 没有证据把它们改成 focus/reference/mark mode；不能借镜头选择数量改变 canvas toolbar eligibility                      |

普通单选主要证据：[useGraphPointer.js](../src/features/editor/useGraphPointer.js) **271–314**，[CanvasNode.jsx](../src/features/canvas/components/CanvasNode.jsx) **69–93**。`useCanvasNodePresentation` 文件注释和 **47–63** 明确仅视口导航；NodeCanvas **229–235、923** 把该 locate 传给 Agent/参考/脚本跳转，不持 mode ID。`useCanvasDocument` **23–36** 切文档清 selected/panel/dialog/context，但没有 mode 状态可清。

当前 [CanvasViewport.jsx](../src/features/canvas/components/CanvasViewport.jsx) **479–484** 传 ScriptV2 `selectionEligible`：无 selectionRect、无任何 draggingNode/resize、无 panel、selected.length 为 1 且 ID 相同。与源比较：

- 普通唯一 canvas 选择/框选分支已对应；没有 reference/mark/focus override。
- 任意节点拖动、resize、Inspector panel 隐藏属于已有本机互斥适配，超出原 `ea`；源 wrapper 只读本节点 dragging。不能将这些额外条件称为 source e6 的一部分。
- 不应为“补 target”改变现有 locate 的不选中语义，或把所有 prompt focus/面板/菜单开启自动视为 mode。当前缺口是没有实际 mode，非这些已有 UI 自身出错。

## 5. 模型和请求 controller 已有边界

[node-toolbar-model.js](../src/features/canvas/storyboard/node-toolbar-model.js) **56–115** 接收 caller `selectionEligible`，不扫描 nodes 或 node.selected。它已经能投影显式 target 匹配后的 true，但运行 caller 只供普通单选。既有模型测试“accepts caller selection/focus override”只证明该布尔注入，不证明 App 有 reference/mark/focus UI。

[useScriptNodeToolbar.js](../src/features/canvas/storyboard/useScriptNodeToolbar.js)：

- identity 为 `[documentKey,node.id]`，mount、文档/ready/readonly/selectionEligible 变化和 pagehide 清 operation/递增 epoch；请求前检查 action，异步 draft flush 后再检查 epoch、最新 props、实际 raw document ready/readonly、节点存在/type 和最新 workflow。
- 当前 raw `getDocument()` 对象为 NodeCanvas **208–215** 的 documentKey/nodes/edges/models/ready/readonly，没有 canvas selection 或 modes；controller 依最新 props 的 selectionEligible 校验入口。
- active opener 在本轮保存 pending 期间保 enabled、用同步 operation ref 防重复，完成 flush 后 focus stable opener，再交 image/video/confirmation 的共享 dialog 生命周期。这是已存在焦点适配。

若后续仅给 Viewport 增 target override，仍用这个布尔 owner，**同 node 的 mode A→B→A 或 target session 换代、eligible 始终为 true 时不会触发当前 dependency 的取消**。这是新增模式接线前须处理的合同缺口，不是宣称当前 App 可触发尚不存在的 mode bug。旧 target 不应在切项目、target 删除/变类型、切 readonly/失去 ready、mode exit 或另一个 owner 接管后打开配置窗或回焦点。

Image config 当前还接 `toolbar.selectionEligible`，`useScriptV2ImageConfiguration` **31–50、128–142** 校验它并重检 raw graph。后续 override 必须一致供 toolbar 和该 config，不能只让 view 显示按钮却让 request controller 按旧单选拒绝。其他 source workflow、fresh refs/参数、图 CAS、Quota retry 继续各 controller 原有合同，不因 target 入口放宽。

## 6. 后续所需的最小可复用接口（建议，未实现）

不需要把 modes 塞进四按钮纯 view 或 workflow model。先由实际 mode controller 提供同一份短暂 interaction snapshot，公开给 eligibility resolver 和 action owner：

```text
getInteractionSnapshot() -> {
  documentKey,
  documentEpoch,
  modeEpoch,
  selectedIds,
  isBoxSelecting,
  isReferencePickMode, referencePickTargetNodeId,
  isMarkMode, markSourceNodeId,
  isFocusMode, focusSourceNodeId
}

resolveNodeGeneratorEligibility({nodeId, selected, interaction})
 -> { eligible, via: 'selection'|'reference'|'mark'|'focus'|null,
      targetId, ownerKey }
```

具体建议：

1. resolver 保 source 三元优先级和 OR；显式 active+null/invalid ID 不降级下层，但普通单选仍独立可用。普通选择按 current 实际 canvas nodes/selection 算，不读镜头 selection 或 dialog focus。节点原始类型及存在性单独校验，不能仅凭缓存 world/render node 放行。
2. controller 开 mode 前同步验证 loaded 当前 document、准确 node ID、实际 caller 能力；安全适配可拒绝 hidden/临时/非法 target。源码 hook 没这些检查，应明确区分 raw 安全门控与源 predicate。未实现的 mode 不传 active true，不制造假 mark/focus 按钮。
3. `ownerKey` 不只是 target ID 或 eligible 布尔，应含 document epoch、matched entry/session epoch、via 和 target；取消/接管递增 epoch，同 ID 的 A→B→A 也拒绝迟到结果。ordinary selection entry 可以有自己的 epoch；active mode 与普通选择 OR 的规则不应因简单“模式存在”被全局 veto。
4. 每次 action 开始、draft flush 后、候选读取完成、commit/开窗前用 raw `getDocument()` + `getInteractionSnapshot()` 重验请求 owner。把 key 传给 `useScriptNodeToolbar` 与已开配置 controller，key 变化即时 invalidate/abort；不能只等 React boolean effect。
5. mode 进入先取消 ordinary pointer/touch、group resize、single/multi connection、selection autoPan 等互斥手势，再 mint owner；mode 退出只清它拥有的 point/region/pick集合，不擅自提交图或清当前用户输入。键盘 Escape 应逐层处理 popover/dialog/region/mode，继续复用 dialog-stack，不新建全局抢键或 body lock。
6. mode target 是短暂 UI 状态，不写节点 data/Canvas 持久化文档，不用 selected 来保存。切文档/卸载/readonly/失去 ready/目标移除应取消。view-only locate 和原生 focus 保持现有独立语义。

上述函数命名仅为最小接口建议，未创建生产导出。若只有 source eligibility 的纯算法先落盘，可以先供独立测试，不意味着本机任何三模式已可用；App 仍需真实入口、candidate/point/region、退出和互斥接线才可验收。

## 7. 位置与联动风险

Source wrapper `g.default` nodeId 是**当前 renderer 节点 ID**，不是 hovered reference candidate；baseOffset24+gap8，屏幕间距32，scale1/zoom，本节点拖动隐藏。显式 target 只改变 eligible，不改变 anchor，不能把工具栏贴到选择框/鼠标/当前参考资产上。

本机已可复用的 [ScriptNodeToolbar.jsx](../src/features/canvas/storyboard/ScriptNodeToolbar.jsx) 接口仍为 `{nodeId,anchor,portal,projection,...callbacks}`：Viewport **485–489** 以本节点递归 world position 和 `canvasNodeSize` 算 board-local 屏幕中心/顶点；toolbar 调共享 placement 传 anchor.y-4，得到32px gap，并有8px clamp/横滚。后续 target 分支用同一 renderer 和 anchor，不另造一份 bar。parent/group move、zoom、view animation、ResizeObserver 应继续更新当前节点位置。

保留 `data-script-node-toolbar`，不能改回 `data-node-id`；后者会被 connection.closest、resizer DOM 测量和真实节点计数误命中。pointer/mouse/click/dblclick 隔离、Space 只 stopPropagation 保 native 激活也继续沿已有 view，Escape 透传共享叠层。

源 OR 可让 target A 与普通单选 B 同时 eligible，窄屏 clamp 后两条 bar 可能重叠；需要实际场景验收，不能擅自改算法“只显示一个”来掩盖。同理 toolbar 是否存在、bar 的 DOM focus、图节点 selected border、mode overlay、reference candidate highlight 是五个不同状态，不能互相推断。未实现实际模式前无原生 A/B 双 bar 场景，本轮不新增假数据或模式来宣称验收。

## 8. 结论与本轮验证范围

已确证的差距为 App caller 没有显式 reference/mark/focus target 分支；纯 toolbar model 已允许 caller 布尔注入，但尚无实际模式。普通选择、引用菜单写入 owner、只读节点定位、dialog opener 焦点已有准确身份，各自保留现有语义。源任务/阶段/readonly/拖动与显式 target 的关系已核对，后续应由短暂 mode owner 和 raw interaction snapshot 接入，而非把 selected 或 DOM focus 扩展为假模式。

本轮只读源码/运行代码/已有测试意图，未运行源 bundle、测试、全量 check 或浏览器；只写本审计，其他已冻结文件不改。没有认证、账号、小号或真实生成服务的新增推进条件。
