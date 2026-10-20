# ScriptV2节点快捷操作验收（2026-10-12）

历史批次记录：下文旧图片 adapter 及r3/sC缺口已由后续 [图片交接批次](./canvas-v2-image-functional-audit.md) 更新；此处295/3527统计仍仅代表04:31:20旧快照，不验收新源码。

本批回应节点操作不自然的问题，将脚本的常用操作移到画布上的选中节点工具栏，减少进入全屏编辑器的步骤。按公开归档源码核对后实现，不运行原站脚本、不使用登录或账号资源。对应证据为 [源码审计](./canvas-script-node-toolbar-source-audit.md)；视频配置和引用建图继续使用 [上一批v2契约](./canvas-v2-video-functional-audit.md)。这是本机工作区更新，未发布线上。

## 已接入的操作

`storyboard/node-toolbar-model` 维护显隐、四个动作和禁用原因；`ScriptNodeToolbar` 只绘制及委托事件；`useScriptNodeToolbar` 协调请求身份。`CanvasScriptNode` 仍持有既有表格、最终提示词、媒体历史及视频配置 controller，没有新建第二套脚本编辑或 graph writer。

工具栏按 source si/sT 保留“重新生成”“批量生成分镜”“批量生视频”和图标式“下载”，移除该节点旧的通用编辑/复制操作条，避免重复入口。普通节点和旧脚本的操作条保留。图片和视频使用 outputGenerationReady，下载使用 allReady；不能把 stale 可用提示词、三个阶段完成和 CSV 下载门槛合成同一条件。全脚本生成中隐藏，提示词重算不是全脚本 busy。失败且零 raw rows 的显隐也按源状态核对。

普通单选、没有框选/拖动/生成器面板时显示；屏幕坐标 portal 保持随画布缩放的固定控件尺寸，未触发边缘限制时对应源32px上方间距。board portal、8px clamp、窄屏横向滚动及 tooltip 边缘翻转属于本机适配。reference/mark/focus 显式 target 的优先分支已在当前 Canvas 接入，旧的未接线判断只代表本批历史。

视频按钮直接打开既有v2独立配置窗口，无需先展开脚本。选择镜头、模型后只创建空视频生成器及真实引用边；一次 graph CAS/history 和同步保存沿用上一批事务。显示镜号临时编号不改变 raw shotNumber，窗口时长和选择不写回脚本。审核服务缺失时阻断要求审核的模型，不假造通过。

图片按钮直接接既有 ScriptGroupDialog 本机配置 adapter，工具栏入口采用全部 raw 镜头，取消不改变脚本。该旧弹窗不是原站 r3 renderer：独立索引选镜、镜头详情、参考数量筛选、参数 chips、准确文案和 sC vertical 建图协议仍未完成，不能据入口回归宣称图片完整复刻。

下载先刷写最终提示词，再读取当前已发布节点，导出全部 raw rows 的源 CSV/BOM。原镜号10/30、资产引用和图历史保持原语义，不从显示编号重建 CSV。

重新生成窗口采用源标题、覆盖提醒、344px宽度、取消/开始顺序、无X、Escape关闭和遮罩不关闭规则，复用公共 dialog-stack/焦点边界。真实生成服务未连接，开始按钮禁用并说明原因，原 rows 不被清空。零行失败脚本直接提示服务边界，不伪造生成任务。额外说明、部分阴影/按钮背景/间距属于本机实现，尚不能称源 Confirm renderer 逐像素一致。

## 请求、焦点及手势

工具栏 action 同步 ref 锁阻止连续点击；异步刷写后重新核对 documentKey、节点存在/类型、ready/readonly、选择、当前 raw graph 与 workflow。文档切换、pagehide、卸载或门槛变化取消旧操作；刷写失败保留输入并提示重试。空闲不读取整图，不新增全局监听。原 controller 继续负责表格、提示词、history、autosave 和保存错误。

实际 App 回归发现 pending 时禁用触发按钮会让 dialog 捕获 body 为 opener；现保留活动触发按钮，以请求锁拒绝重复操作，弹窗关闭可回原按钮。其他动作仍受 pending 门控。portal pointer/click 不启动拖动或平移；双击被工具栏截断，不再冒泡展开脚本。Space 仅停止冒泡，保留原生按钮默认激活，Escape 仍交现有叠层管理。JSDOM 没有原生键盘默认点击，测试验证 defaultPrevented=false 后检查其 click 接线，不把这项称真实浏览器 Space 验收。

## 验证记录

Node24.19.0联合11文件270项通过，04:26:12开始/4.83s，日志 `artifacts/canvas-script-node-toolbar-final-joint-tests.log`。其中新纯模型54项、工具栏视图9项、请求hook21项和实际 NodeCanvas11项；包含旧脚本、提示词、媒体历史和v2配置回归，交叉集合不累计为额外测试数。实际 App 强断言覆盖直接入口、两层Escape/回焦点、选镜空组和引用、一次undo/redo、原镜号、CSV、stale门槛、目录失败/重试、pointer隔离、双击、Space默认和真实 rich prompt 末次输入。关闭提示词/编辑器后立即建组，undo只撤销建组且保留修改过的提示词。

最终Node24.19.0完整 `npm run check` exit0：295文件/3527测试全部通过，04:31:20开始/75.58s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建9.74s通过，日志 `artifacts/canvas-script-node-toolbar-final-check.log`。统计包含同工作区独立影游扩展。随后只维护文档并检查格式；strict仍仅覆盖核心，CI未远端执行，不把工程成功当全站功能验收。记录同步 [验证历史](./verification-history.md) 与 [AGENTS验证入口](../AGENTS.md#当前工程验证)。

首次完整check在04:28:20开始，295文件/3527项中1条旧 CanvasNode CSV 回归失败，其余294文件3526项通过，测试78.03s。旧测试还从已移除的通用条取下载按钮；迁到新toolbar并保留完整CSV/资产段、stale下载门槛及busy阻断断言，busy按source隐藏、终态和recompute保入口，未恢复两套产品toolbar或删掉测试。跟进2文件13项04:30:00/2.26s通过，日志 `artifacts/canvas-script-node-toolbar-legacy-followup.log`。初次App回归另发现真实opener丢焦点并修复；100ms新组定位时序断言修正为实际等待。rich prompt测试首次选默认需审核模型被服务门槛阻断，改在UI选择无需该审核的Vidu Q4 Preview；未改生产审核规则或伪造证明。

本批新建独立44计数页，原生AX点击后仍“原生点击计数0”、焦点AXWebArea。已关闭临时页，保留用户5173服务；没有以隐藏DOM事件、storage写入或其他浏览器控制技术冒充实操。因此本批原生桌面/窄屏工具栏、原生Space及新窗口视觉未验收，无新版截图。历史截图不作为本批证明。

## 剩余范围

r3图片配置及sC建图、显式target选择、源脚本卡片完整renderer、工具箱/角色工具栏、完整run/stop、费用/审核/生成/协作/运营写服务、真机/Safari、完整确认窗视觉和大图性能仍需继续核对。当前无需登录、注册或小号，整个复刻目标未完成。独立影游发布记录和冻结产物不受本批本机修改替代。
