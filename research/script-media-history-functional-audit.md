# ScriptV2 媒体版本历史与失败信息

2026-10-11。当前版本无需登录、注册、小号或真实账号资源。本批补齐既有图片/视频版本的查看、定位、设为当前，以及脚本失败编号/原因展示；消费本地文档中真实存在的字段，不创建生成结果或任务。本批最终完整工程检查已通过，下面区分源码、定向回归与实际浏览器验收。

## 源证据与实现入口

归档 bundle 只静态阅读，没有执行原站脚本、遥测、任务、费用或写请求。详细定位分别见 [菜单源码审计](../artifacts/script-media-history-source-audit.md) 与 [模型及接线审计](../artifacts/script-media-history-integration-audit.md)。

| 来源                                                        | 已确认内容                                                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `research/source/3u6hjewm8qox_.js`，模块 272776             | `oS/oW` 两种历史菜单，`oK/sM` 单镜头入口、失败信息、可选单镜进度；`tR/tP` 切 active 后经 `tk` 提交；`tj` 只 fit 实际节点 |
| `research/source/447ud3w8leoy-.js`，892147 / 52013 / 939279 | 文本 refs、对白识别出的 @ 剥离、双轨 state/hash；939279 的任一显式 state 改变分支保留两轨                                |
| `research/source/170exq-5f14zz.js`，182004                  | 任务状态 `PENDING=0/RUNNING=1/SUCCESS=2/FAILED=3/TIMEOUT=4` 与失败判断                                                   |
| `research/source/1eqsg-pmc0mun.js`                          | rows 的版本字段持久化与 AI 内容回填保留；这里没有确认成功任务创建历史版本的服务                                          |
| `research/source/pages/canvas-rows.json`                    | 原中文 locale：任务按钮、复制 title、无百分比/有百分比合成状态与合成动作标签                                             |
| `research/source/0p_bztaupj2yb.js` 与 `1h-b10gcvw4vl.css`   | Mantine Menu/Popover 的原尺寸、侧箭头、间距、阴影，以及原站 blue/purple/neutral 色值                                     |

`artifacts/script-workflow-source.pretty.js` 的 57415/58305 为菜单、58404 起为单镜弹窗、63912 为 `sb`、65727–65770 为 `tk`、65871/65890 为 active handlers；这些格式化文件仅辅助阅读。

| 生产入口                                                                                    | 所有权                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `storyboard/script-media-history-model.js`                                                  | active 纯投影、完整行提交流水线、任务失败状态解析                               |
| `storyboard/useScriptMediaHistory.js`                                                       | 最新文档读取、命令串行、草稿前置保存、owner/epoch/signal、图提交与定位回调      |
| `storyboard/ScriptMediaHistoryMenu.jsx` / `script-media-history.css`                        | 原顺序版本视图、当前标记、时间与图源、菜单定位/键盘/关闭焦点                    |
| `storyboard/CanvasScriptNode.jsx` → `StoryboardTable.jsx` → `ScriptPromptComposeDialog.jsx` | 实际单镜头入口、真实 readonly 与暂时写禁用的分离、失败信息与可选进度            |
| `hooks/useCanvasGraphActions.js` / 文档保存                                                 | `{rows}` patch 的文档/节点 CAS、一次画布历史、同步 currentDocument 与本地持久化 |

## 菜单、定位与版本数据

单镜头最终提示词弹窗仅在对应 `imageVersions` 或 `videoVersions` 数组长度大于 1 时显示 pill。图片为 `v1/n`，视频为 `vV1/n`；没有 active 为 `v?/n` / `vV?/n`。当前序号由数组第一个 truthy `isActive` 的 versionId 查第一个匹配索引，保留源重复 ID 边界，不排序或去重。

菜单头分别是「图片版本（n）」「视频版本（n）」；原顺序逐项显示版本号、当前 ✓ 与本地时区 `M/D HH:mm`。createdAt 缺失、0 或非法 Date 留空，不补造时间。视频 `sourceImageVersionId` 非空时显示 `←` 加前 6 字符，title 保留完整「图源 ID」。既有其他版本 metadata 原样保存。

点击版本行只定位当前图中确实存在的 `nodeId`，保留选择、历史菜单、单镜头弹窗与全屏脚本；实际调用 fit 入口，不打开媒体预览或关闭全屏。底注是「点击行 = 跳转到画布节点」，视频另有「；←标记表示绑定的图源版本」。源码相邻的关闭全屏后跳转属于其他入口，不混用。

「设为当前」与行跳转是独立动作：仅非 active 项、非 readonly 且有 writer 时显示，点击只传 versionId，不冒泡为跳转。成功保持菜单打开。它不回滚 image/video prompt 文本、不修改 URL/poster、不设置 legacy currentImageNodeId/currentVideoNodeId，也不创建媒体节点或边。切 active 仍需执行下一节的行规范化旁效应，不能称严格只有 flags。

源码 `Menu` 为 `bottom-start/withArrow/keepMounted:false/closeOnItemClick:false`。本地视图采用相邻原生按钮避免内嵌 button，挂在所属 dialog，共用 dialog-stack child dismissal；Escape 先关菜单并回 trigger，再次 Escape 才交给 owner。Arrows/Home/End/Enter/Space 与 Tab 可操作，外部 pointer/focus 关闭不抢新焦点。RAF、ResizeObserver 与 resize/scroll listeners 随关闭/卸载释放，不新增 body overflow/inert 生命周期。

## active 与实际 `tk` 流水线

`setActiveScriptMediaVersion(rows,rowId,kind,versionId,assets)` 用稳定 row.id，避免行重排后误写其他镜头。缺行、缺数组、空数组、缺版本或已唯一 active 返回原 rows，完全不执行规范化、不新增历史。实际变化按 versionId 相等设置布尔 flags；多 active 关闭其他 ID，相同 ID 的重复项全部 active，保持源算法。

随后 `reconcileScriptMediaHistoryRows` 按源 `tk` 执行：

1. 全部行按当前顺序重置 1-based `shotNumber`；正确镜号不换 row identity。
2. 共用 `prompt-compose-model` 的文本 refs helper。plot 使用旧行 refs，image/video 优先 incoming refs 再 fallback 旧行；相同正文保留非空 refs identity，空数组规范为 undefined。正文改变才保留仍作为 substring 的旧 refs、追加显式 @ 并去重；裸名字不新增引用。
3. 按 `sb` 从 dialogueLines 汇总 dialogue/voiceover。没有 lines 或空 lines 清 legacy spoken 字段；非空文本按换行连接，不 trim，只有 kind=voiceover 分入旁白。原 lines 及其中 refs 不改。
4. 汇总前仅剥离 line refs.text 或当前角色/场景/道具名识别出的 @/＠。trim 名字、最长优先、ASCII 前后边界；这里尾边界比普通 prompt lexer 更严格，中文名紧接 ASCII 也不剥离。未知 @ 与媒体 token 保留。
5. 复用 `storyboardRowHashes`；任一 incoming track 显式非空 state 改变时保留**两轨 incoming state**、只更新 hash。否则以旧 textHash/payloadHash 判断变化，synced/stale 变 stale，none/generating/已有未知状态保持，缺 state 按该轨 prompt 推断。不能复用现通用表格 helper 的单轨显式分支来取代此规则。

新行初始化按源迁移旧 promptState，仅在两轨缺失时将 none/synced/stale 应用于两轨；旧 generating/user_edited 等按正文推断，已有轨 state 时移除 legacy promptState 并正规化未知值。历史激活不增行，源 `tk` 空表生成默认镜头分支不可达；本历史 helper 对空 rows 保持原数组。canonical 无关行保持 identity，需要规范化的行及切换 flags 行才替换。

## 异步接线、只读与 busy

CanvasScriptNode 注入 `onBeforeSetActive:promptCompose.flushAll` 和 `onBeforeJump:promptCompose.flushAll`；Dialog 直接调用 history.setActive，不在外层先等待保存再捕获新 owner。每条命令 enqueue 时先固定 documentKey/nodeId/epoch 和 signal，等待前、等待后均重读 getDocument。A→B 或 A→B→A 即使 node/row/version IDs 完全相同，旧操作也不得写新文档。

最新同 ID 节点的 `data.type || type` 必须属于 script/script-v2/storyboard；getter 已存在而文档/节点缺失时不回退旧 props。写入还检查 ready、readonly、disabled 与 expectedNode，提交 `{rows}` 和 `{documentKey,nodeId,expectedNode,signal}`；caller graph actions 做当前图 CAS 和一次历史。失败、Quota/throw 或明确 false 保留原版本与草稿，并可重试。最新 assets 与保存后的最新正文参与流水线，不使用 flush 前的旧 rows。

真实 readonly 从表格传至 Dialog/Menu，隐藏「设为当前」，仍允许打开历史与定位。busy/pending/表格错误是暂时禁写，按钮保留但禁用，不冒充 readonly、也不拦当前 owner 新跳转。源菜单本身只传 readonly，本地追加 busy 写禁用属于本地保存协调适配；真实服务在途切换规则仍需未来接线核对。

disabled/readonly 改变仍结束旧 epoch、取消旧等待，再给当前 owner 建立新串行链。命令串行，旧 hanging Promise 不阻塞新文档。jump 先确认目标实际存在，保存后再校验文档与目标，然后只 fit。无 dirty 的 PromptTrack flush 直接返回 saved，因此 readonly/busy 正常定位不会被保存门控拦住；有真实未保存 dirty 且 flush 失败时保留输入并拒绝跳转，不绕过失败。

## 失败信息与原 locale 进度

失败来自 **script node.data.taskInfo**，不读所选图片/视频节点的 taskInfo。有限 number 状态或非空 string 经 Number 后为 3/4 才成立；字符串 failed、空白、布尔、对象、NaN/Infinity 不成立。任一行 prompt state=generating 时不展示旧失败编号/原因；本地 compose pending 时也隐藏旧信息。

| locale                               | 原文 / 当前展示                     |
| ------------------------------------ | ----------------------------------- |
| `promptEditModalTaskNo`              | `任务 #{taskId}`                    |
| `promptEditModalCopy`                | `点击复制任务 ID`                   |
| `promptEditModalText6b02ab`          | `合成中...`                         |
| `promptEditModalRecomputingProgress` | `合成中 {percent}%...`              |
| `promptEditModalPrompt2` / `Prompt4` | `立即合成提示词` / `重新合成提示词` |

taskId 有值才显示并复制完整编号；failedReason 有值才红色截断显示，title 保留原原因。不造 ID 或错误，不打开任务详情。源码只调用 clipboard；本地复用共享 clipboard native→legacy 回退、signal 与失败反馈，切 taskId/owner/卸载取消旧反馈。

源 `sM` 只从 `progressByShot[row.id]` 传 optional `recomputeProgressPercent`；当前 Dialog 只有 generating 且 caller 提供 number 时才显示百分比。实际生产入口尚未接远端单镜进度 source，保持「合成中...」，不借全脚本百分比、不增加计时器或伪造进度。任务状态、编号、进度测试夹具不代表真实任务。

## 当前验证与浏览器范围

模型/controller 定向 2 文件 **80 项测试**于 15:26:45 通过，四个交付文件的格式与 lint 已分别检查；菜单定向 1 文件 **14 项测试**于 14:47:26 通过。这是各模块的定向结果，不合计为整站测试数，也不代表完整 `npm run check` 已通过。

回归覆盖 active/no-op、重复 ID、全 `tk` 旁效应、state/hash identity、legacy spoken 清理、两种 @ 与边界、失败状态解析、最新 rows/assets、连续命令/失败重试、A→B→A、同 ID 类型替换、readonly/busy 读写分离、保存前后 gate、取消/卸载/StrictMode。菜单回归覆盖原文/顺序/日期/图源、键盘、owner portal/逐层 Escape、外部焦点、保存失败和定位 geometry。

Root 已报告实际浏览器使用独立本地项目 `script-media-history-proof`、通过生产 CanvasScriptNode→表格→单镜弹窗入口：图片菜单 `v1/2→v2/2`，设为当前后菜单仍打开；Escape 回版本 trigger；点击历史节点改变实际画布 transform，单镜与全屏脚本两个 dialog 均保留。样本使用已有图片资源和显式本地构造的版本/task 字段，**版本与失败任务是验收夹具，不代表原站或运营服务生成结果**。

Root 后续实测1280×720与390×844：视频图源保持原版本ID，切active菜单不关闭；最后输入尚未等到500ms即切图片active，再新页面恢复正文与active。真实点击复制后Meta+V到QA textarea得到完整本地任务ID；剪贴板代理readText为空，不作为成功依据。390px dialog x16/width358/right374，视频menu x105.99/width276.01/right382，页面宽390；只读直接访问可展开/查看/定位，无设为当前，jump后两个dialog和菜单仍保留。桌面截图 `artifacts/script-media-history-desktop-proof.jpg`，窄屏 `script-media-history-mobile-proof.jpg`。

最终 `npm run check` **202个文件/1227项测试通过**，含格式、零警告lint、核心strict TypeScript和生产构建；日志 `artifacts/penstudio-node-interaction-final-check.log`。strict不覆盖全部JSX，CI未远端运行。真实生成中进度仍仅fixture测试，不冒充实测远端任务。更多原文见 [验证历史](./verification-history.md#penstudio品牌节点操作与媒体历史2026-10-11)。

## 未完成范围与运营接入

已公开读取的两个核心 bundle 命中只证明菜单消费、active 写入、持久化白名单与 AI 回填保留；未确认 version append、versionId/createdAt 分配、成功结果绑定的创建器，不据此推断全原站没有该服务。

本地图组仍是 submitted:false 的空生成节点。真实生成提交、费用、轮询/停止、结果持久化与历史创建、任务详情、运营服务器写入继续未接；不能制造成功媒体、任务编号、sourceImageVersionId、会员权益或服务器历史。当前图生视频匹配仍按真实 linkedImageGroupId 与 child hiddenUuid，不把 active flag 偷换为生成图源。复制节点的 history.nodeId 尚无专用重映射，删除实际媒体后保留历史但拒绝无目标定位；完整生命周期与服务接线仍需独立核对。

窄屏 clamp/flip/滚动与当前菜单键盘属于本地适配，未宣称逐分支等同 Mantine Floating UI。手机软键盘/IME/Safari、原站登录态像素与真实 task source 尚未全部验证。前一提示词拼接批次将媒体历史列为缺口，本审计更新其既有历史消费与 UI 部分；智能合成/完整任务和全站功能继续未完成。
