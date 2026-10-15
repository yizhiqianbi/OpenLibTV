# 分镜提示词拼接与草稿保存

2026-10-11。当前版本无需登录、注册或账号资源。内容使用代表性样本，真实 AI、费用、任务与运营写服务继续未连接。

后续媒体版本菜单、切active与脚本失败编号已接入同一单镜头入口，最新检查为202文件/1227测试；详见 [媒体历史审计](./script-media-history-functional-audit.md)。本文保留提示词批次的原始验证范围，不能将当时的菜单缺口当作当前状态。

## 源证据与模块

公开归档 `research/source/3u6hjewm8qox_.js` 的模块272776：`oi/op/om/oh` 为本地模板；`oK` 为单镜头最终提示词弹窗；`o6` 为批量弹窗；workspace 的 `composeLocally/commitPromptEdit/undo` 提供保存和覆盖规则。`1eqsg-pmc0mun.js` 的16353/321523提供指纹与bundle协议；`447ud3w8leoy-.js` 的892147/421201提供资产引用解析。精确字节与函数证据见 `artifacts/script-prompt-compose-source-audit.md`、`script-prompt-compose-ui-audit.md` 与 `script-prompt-input-source-audit.md`。只读研究这些归档，没有执行原站bundle或使用原站写接口。

| 模块                                              | 所有权                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `storyboard/prompt-compose-model.js`              | 字段规范化、图片/视频模板、双FNV指纹、refs、纯执行/撤销计划      |
| `storyboard/useScriptPromptCompose.js`            | 文档身份、当前图读取、串行保存、覆盖确认、模式与20秒撤销生命周期 |
| `storyboard/ScriptPromptComposeDialog.jsx`        | 单镜头/批量视图、两个500ms乐观草稿、关闭/重新合成前flush         |
| `storyboard/ScriptPromptInput.jsx` 与DOM helper   | contentEditable、原文标签、@菜单、粘贴/换行/删除、原生编辑历史   |
| `domain/draft-projection.js` 与 `useCanvasDrafts` | 普通节点与分镜草稿的统一快照投影、保存ack及外部更新保护          |
| `useCanvasDocument` / graph actions               | 实际持久化、文档门控、同步CAS与画布历史                          |

## 已接运行入口

ScriptV2表格的提示词按钮打开独立双轨弹窗；第三阶段“一键合成全部提示词”打开批量选择。单镜头默认为智能合成，自动拼接可直接本地完成；批量模式保存同时更新单镜头模式。批量默认选任一提示词为空的行，身份为row.id；源在rows实例变化时重新补选缺词行，此行为保留。

图片/视频使用不同字段顺序；对白、旁白、角色、场景、道具、运镜、声音和styleDescription按源拼接，保留源句号、段落、长度诊断与资产引用协议。空输入不会清除旧提示词。智能合成未接scriptText模型目录、费用和executor，显示模型配置未加载、费用--及未提交任务，不能将普通textModels冒充对应配置。

**覆盖确认锁的是旧提示词bundle指纹，不是input指纹。** 确认后按最新分镜字段/资产/风格拼接；任一目标track旧bundle改变则拒绝覆盖整行。源逐行重读并提交，本地hook也逐行核对当前图，并委托graph.patchScript的expectedNode CAS。

手动保存只更新正文和refs，保留原state/hash。冲突保留草稿；明确继续编辑按源重新建立基线。两轨500ms保存，blur/关闭/重新合成先flush；取消覆盖保留主弹窗。撤销有效20秒，只恢复合成前非空的被覆盖track；全部after bundle需仍匹配，否则拒绝整次撤销。恢复原bundle和原state并保留其他字段。

资产标签显示当前名称，序列化保留原mentionText；@候选、菜单先Escape、IME、普通文本粘贴/拖入、换行和原子删除与普通节点媒体token分开。菜单属于当前dialog，继续使用统一dialog-stack，不另建背景隔离或滚动锁。

草稿快照逐track核对原bundle，只将仍匹配的输入投影到当前row；不覆盖外部新词、不复活删除行、保存/合入后消耗retained稿。pagehide及立即卸载在常规600ms保存已经settled后仍投影草稿；保留canonical graph作为后续基线，避免上一次投影值阻止更新的live draft。持久化失败保留可重试稿。复制、本机分享与导出继续走同一快照。

## 验证范围

本批定向回归覆盖模板/指纹/refs、覆盖与取消、跨文档/只读/失败、双轨保存、20秒撤销、实际CanvasScriptNode入口、统一草稿的pagehide/立即卸载/失败重试/切项目及已保存投影后继续编辑。最终完整检查、浏览器尺寸与截图记录追加到 `research/verification-history.md`。

最终 `npm run check` 195文件/1071测试、格式、零警告lint、核心strict TS及生产构建通过；日志 `artifacts/script-prompt-compose-final-check.log`，测试10:55:19开始，构建17.09s。样式实际接线后完整重跑，期间一次Vitest临时写入ENOSPC，空间恢复后全部通过；未删用户文件或原素材、未缩小检查范围。source popup CSS私有层高于主工作区，修正遗漏import、共享button规则的优先级与遮罩padding后复验。

实际浏览器直达既有本地项目：单镜头取消保持原词；concat覆盖统计1镜2条、生成不同轨模板、20秒撤销恢复原稿；批量已有完整行默认不选、全选/描述展开、取消仍保留弹窗、应用后关闭、主工作区撤销恢复。手动@资产插入、Meta+Z/Shift+Meta+Z、整块Backspace删除与undo、子菜单Escape已验；关闭即时保存及未到500ms直接reload恢复最后视频输入已验。智能模式实际提示未接服务而不要求登录。最终冻结后的新标签恢复正文且warn/error日志为空。

桌面单镜头760px，390px弹窗x16/width358/页面scrollWidth390；菜单处于当前dialog，控件没有横向溢出。截图：`artifacts/script-prompt-compose-desktop-proof.jpg`、`script-prompt-compose-mobile-proof.jpg`、`script-prompt-compose-menu-mobile-proof.jpg`、`script-prompt-compose-batch-desktop-proof.jpg`。临时60/61/62标签已清理，viewport恢复，用户原4/7标签保留。

## 明确剩余范围

智能合成scriptText模型目录、费用/任务队列、完整任务详情和外部服务仍未接；既有媒体版本菜单与脚本失败任务ID已由后续批次补齐，见本文开头的媒体历史审计。原站登录态逐像素、真实手机软键盘/IME/Safari仍未全验。该批不代表完整分镜、画布或全站所有交互已完成；整体复刻目标继续进行。
