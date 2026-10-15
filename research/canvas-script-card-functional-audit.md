# ScriptV2 节点卡片与操作入口验收

2026-10-12，继续用户“节点交互不自然”的要求。本批依据已归档源码恢复 ScriptV2 卡片、拖动和编辑入口；不重新设计原站，不使用登录、小号或真实账号资源，不提交原站生成、取消、付款或协作写请求。全站复刻目标仍未完成。

## 实际改变

画布卡片由 `ScriptCompactProgress` 显示横向三阶段、固定连接线和完成勾；三个阶段都是状态提示。唯一底部按钮“打开脚本节点 →”及卡面双击进入全屏，保留当前阶段。移除旧卡内重复标题、镜头计数、可点的三行阶段和静态服务段；全屏阶段导航继续可用，不以紧凑卡片的静态语义替代全屏操作。

`script-card-model` 区分 empty_generate、任意方向连线的 pending、resource、整节点 generating 与 failed。完整任务优先于 rows，recompute-batch-shots 排除完整任务。只读、未 ready 和完整生成中的新打开请求被阻断；阻断请求消费后不会因门槛解除自动重开。表格投影在 layout effect 发布，外部打开请求用当前 raw node 校验，避免上一帧的可编辑状态绕过刚到达的任务状态。

V2 卡面 pointer 交给已有共享拖动控制层；按钮、局部操作和 portal 隔离。`shouldSuppressClick` 保留拖动收尾 click/doubleClick 门控；源码文本单元格以及 portal 实际 DOM 不走卡面双击入口。legacy 表格保留原 pointer 隔离和原展开按钮。CanvasNode 的外层设置/双击也走对应门槛，readonly 从父壳传入，不由子组件默认值绕开。

确认镜头、资产与提示词规则复用原 workflow，不另算 ready。资产进度来自 linked task；提示词重算没有逐镜进度总线时只显示“合成提示词中...”，不拿 taskInfo 百分比冒充 source 平均。重算失败/取消 footer 的源文案、TaskID、原因 title、readonly div 与非只读打开按钮分别维护；点击不强制切换编辑阶段。

整节点生成有源 7×3 skeleton 和默认任务 badge；排队/生成/准备文案和状态正规化留在纯模型。失败使用源警告 SVG、超时/失败文案、原因、任务编号与公共剪贴板服务。任务复制按文档、节点、形态及 TaskID 隔离迟到结果，复制成功/失败为本机反馈。真实队列、任务 bus、权益、取消与费用仍未接，不展示假取消或重试成功。来源见 [紧凑视图审计](./canvas-script-compact-source-audit.md) 与 [纯模型审计](./canvas-script-compact-model-source-audit.md)。

手动创建复用原空首行和资产 patch，仅保存成功后进入确认镜头。保存失败保留相同 draft/baseline、原内容和错误，可从编辑器继续输入并重试，不能再创建另一条 hiddenUuid 来掩盖失败。没有 mirror 登录态或伪认证。

## 验证与明确限制

正式Node24.19.0联合11文件208项全部通过，05:26:12开始/9.84s，日志 `artifacts/canvas-script-card-final-joint-tests.log`。包括纯模型113、既有workflow11、compact14、TaskStatus19、新host12及实际NodeCanvas7项，也包含旧脚本、媒体历史、图片、浮动toolbar和CanvasNode入口回归；交叉集合不重复相加。新host保存失败草稿重试、owner请求门控、readonly/failed/pending/recompute和Space均有强断言；实际App覆盖卡面drag、Shift保多选、一次undo/redo、pagehide末位、拖后双击抑制、portal和阶段保留。组件、模型与实际 NodeCanvas 回归运行原 pointer/history/草稿/storage；jsdom 的 capture、rect、计时和 keyboard 不能证明原生手感或键盘默认 click。

首次完整检查305文件/3900项中，旧视频App六项仍点击已经退出的compact阶段按钮，其他304文件3894项通过；format/lint/核心strict通过，失败后未执行构建，不记完整check成功。日志 `artifacts/canvas-script-card-initial-check.log`，05:26:52/80.20s。迁移为source唯一打开按钮加全屏阶段导航，保原建图、审核阻断、Quota仅保存重试、目录重试、焦点和undo断言；独立6项在05:27:42/2.82s通过，日志 `artifacts/canvas-script-card-video-entry-followup-tests.log`。

最终正式Node24.19.0完整 `npm run check` exit0，305文件/3900测试全部通过，05:28:30开始/79.43s，格式、零警告lint/架构边界、核心strict TypeScript及生产构建9.72s通过，日志 `artifacts/canvas-script-card-final-check.log`。随后仅维护文档并定向格式检查，没有新生产改动。统计含独立影游扩展，strict不覆盖全部JSX、远端CI未执行；不以完整工程检查代替全站或原生手感验收。入口见 [AGENTS 当前验证](../AGENTS.md#当前工程验证)。

初次迁移的五文件32项有1失败：原 readonly 测试通过已删除的入口打开全屏，迁移为先打开编辑器再切权限后，表格会退休旧 prompt modal。测试显式核对退休，并从仍打开的编辑器建立新 readonly review，保留版本定位和禁止写入断言；未恢复被 source 禁止的新 readonly 卡面入口。跟进7项通过，日志 `artifacts/canvas-script-card-readonly-followup-tests.log`。

新 host 初次9项有1失败，确实揭示任务到达同 commit 时请求读旧表格投影；已按当前 raw owner 门控并保存初始日志 `artifacts/canvas-script-card-host-tests.log`。增加按钮 Space 隔离后11项通过；后续新增保存失败草稿重试回归，以最终联合与完整检查为准。独立只读复核发现 manual/重算 footer Space 冒泡到画布会被 preventDefault 并启动平移，已仅对按钮停止 Space 冒泡，保留默认激活；对应强断言未删。复核其余 owner/draft/portal 路径未发现确定 P1/P2，复核本身没有替代测试。

原生计数页46的 AX 点击后仍计数0、焦点 AXWebArea；已关闭临时页，用户 Vite pid98953/5173 保留，没有改用其他技术伪造操作。当前桌面/窄屏像素、拖动手感、原生 Space 和真机/Safari未验收，无新版截图。卡片部分 CSS flex/min-height、焦点 outline、本机错误反馈和保存重试是手写 renderer 适配，不是源 RF 生命周期证明。

空/pending使用已获取的 ListDetail 原图标。empty 的两种样本 preset 动作、完整尝试提示、yielded task、任务详情/实时总线、完整工具箱与角色操作仍有缺口；本批没有用死按钮假冒这些功能。显式 reference/mark/focus 选择模式的优先级已单独核对，当前仍仅普通单选 owner，见 [target 审计](./canvas-script-toolbar-target-source-audit.md)。大图性能、完整取消/退款、审核、生成与运营写服务继续未完成。本批只修改本机源码，不部署，不替代独立影游冻结生产记录。
