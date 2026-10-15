# Storyboard 结构、表格与专属视频规则

当前 CanvasScriptNode 已接实际节点创建 / 编辑 / 全屏、九列表格、结构化对白 / 运镜、两类手动提示词、本地图组计划、三阶段导航、资产本地 CRUD / 画布选图、V2 CSV、单/批本地自动拼接及既有媒体版本历史。旧故事板媒体入口保持兼容。资产服务工作流、智能合成、真实任务/历史创建与 mixed2video 仍未完成；以下结构批次记录保留历史，最新接线见文末、[资产阶段审计](../../../../research/script-assets-workflow-functional-audit.md)、[提示词拼接审计](../../../../research/script-prompt-compose-functional-audit.md) 与 [媒体历史审计](../../../../research/script-media-history-functional-audit.md)。

## 源码证据

| 来源                                                            | 确认的契约                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `170exq-5f14zz.js`，182004                                      | `SCRIPT_FIELD_META` 定义镜号、时长、画面描述、视频参考图、景别、表情、道具、光影氛围、音效、对白、分镜提示词、视频提示词。自定义列标签通过 `shotColumns[].field` 的 API 名匹配；views 默认 table / creative。任务状态 FAILED=3、TIMEOUT=4。                                                                                                                               |
| `447ud3w8leoy-.js`，900149 / 446007                             | 新镜头默认时长 5 秒；镜头 id 稳定，旧行可由 hiddenUuid 补 id，新增 id 不用镜号。                                                                                                                                                                                                                                                                                          |
| `3u6hjewm8qox_.js`，ScriptNode `aD` / ScriptV2 `sT`，表格 `so`  | 行编辑保留其他字段；选择以 hiddenUuid 为身份。插入、删除、上下移动、DnD 后重新编号。ScriptV2 行菜单还支持 colorLabel；源码没有此处的“复制一行”动作，不能凭普通表格习惯增造。                                                                                                                                                                                              |
| 同文件 `ax` / `av` / `ay`                                       | 列显隐、显示全部 / 隐藏全部（隐藏全部仍保留镜号），筛选 contains / equals / gt / lt。筛选以 AND 组合，文本忽略大小写；筛选存 active view 的 tableConfig，并保留其他 views。                                                                                                                                                                                               |
| 同文件 `eM`（原 UTF-8 offset 720594）                           | 专属 image storyboard Group→video 参数条：优先 kling-v3-omni，其次 storyboardVideo support 第一项，缺支持目录时沿源 fallback 默认 video。模式按 schema 选 singleImage2video→image2video→text2video。继承 resolution / ratio，count 固定1，费用请求300ms延迟，未知显示“-”。**普通 settings 保留，仅嵌入 advancedSettings 过滤 batch:true**；不能将本规则用于普通混合分组。 |
| `0leiedr1esdbe.js`，全局模型 store                              | getModel('storyboardVideo') 读取 video schema，但 support.storyboardVideo 为独立目录，不是所有 videoModels。                                                                                                                                                                                                                                                              |
| `3u6hjewm8qox_.js`，`eX` / `eZ`（UTF-8 offset 735026 / 735416） | 视频创建从 sourceScriptNodeId / linkedImageGroupId 校验绑定，真实 image child 必须有 URL，按 scriptRowHiddenUuid 对应脚本行；不能以 index 猜测配对。保存 / owner / portrait 校验失败不宣称创建成功。                                                                                                                                                                      |
| 同文件 390565 / 556544                                          | duration enum 或 min/max/step 验证；分镜 regenerate 只选择无结果或明确终态失败的镜头。image patch 使用行 imageGenerationPrompt / plotDescription，video patch 只设置 action，保留已有视频 params。                                                                                                                                                                        |
| 同文件 ScriptV2 `rT`                                            | 独立 mixed2video 弹窗，按 hiddenUuid 维护每镜时长和选择，约束非法、缺实际资产引用、模型锁或 portrait 状态会阻断确认；这与上述 eM 参数条和普通 Group executor 都不同。本轮未接线该弹窗。                                                                                                                                                                                   |

## 历史结构批次：模块边界与稳定接口

- `index.js` 为域入口；旧 `components/StoryboardPanel.jsx` 只 re-export。原 props `{nodes,setDialog,src}` 保持媒体镜头、顺序、原 classes 和预览节点身份，不自动把所有脚本切进新表格。
- `media.js` 只投影实际 image / video 第一份输出；`StoryboardMediaGrid` 为纯视图，`StoryboardPanel` 协调选择媒体视图或可选表格。
- 表格可通过 `StoryboardPanel({scriptNode,documentKey,readonly=true,ready=true,onChange})` 或直接 `StoryboardTable({node,documentKey,readonly=true,ready=true,onChange})` 接入。root 本轮不增加此入口；默认 caller 仍是既有媒体故事板。
- `onChange(dataPatch,{signal,documentKey,nodeId})` 可同步返回 void / false 或 Promise。false / throw 显示失败、保留补丁和输入，用户可重试。controller 不读写存储，caller 合并 node.data 并负责实际持久化 / 版本冲突检测；signal 与文档身份由异步 adapter 在提交、回写时继续核对。
- `rows.js` 保存字段、过滤、编号、selection reconciliation、view / tableConfig 和不可变行操作；未知行和 view metadata 保留。`useStoryboardTable` 管理本次选择、待提交补丁、错误 / 重试和 documentKey+nodeId 生命周期；切文档 / 卸载 / 不再可编辑中止等待，旧结果不能改新文档 UI。
- 表格 text cell 在 blur / 非 IME Enter 提交；Shift+Enter 保留内部换行。删除使用 shared EditorDialog 确认；字段 / 筛选也使用共享弹窗生命周期，Escape 回原触发器，没有独立 body 锁或 focus trap。
- `video-model.js` 为无网络、无 React、无写入的预研纯规则：独立支持目录、模式、继承比例、advanced batch 字段、时长约束、脚本→真实图片匹配、分镜 pending-run patch。没有 video bar / 建组 UI、费用请求、任务 executor 或隐式数据迁移。

依赖方向：兼容出口 → storyboard 协调 / views → controller / 纯模型；视频纯模型只依赖同 Canvas 域的公开 schema helpers。没有反向依赖 NodeCanvas、App、Skill 私有模块或散落 localStorage。

## 历史结构批次：实际边界

- 新表格采用已证实 legacy 字段的可操作基础视图，尚未逐像素浏览器对比。ScriptV2 的 entity refs / dialogueLines / cinematics 的专用 picker、prompt state reconciliation、色签、历史版本、全屏和阶段进度并未以通用 textarea 冒充完成；未知字段只保留。
- creative view 是基础镜头卡片，原复杂素材 / prompt 卡片及全部拖动样式未实现。新行包含已确认空字段 / ID / 5秒默认，不伪造源 prompt 生成状态或 AI 已生成内容。
- 失败补丁保留属于本地 UI adapter；写入仍由 caller 实现。并发修改的版本仲裁属于文档 repository，不能只检查 signal 而覆盖他人的最新 rows。
- 新表格没有生成 / 算力动作。视频费用、portrait 认证、提交 / 轮询 / 停止、独立支持目录及 ScriptV2 混合引用构建未接服务；纯模型验证不表示这些分支已运行。
- 没有替换现有 source 缺失的正文、创建假结果、猜测费用为零或把普通组执行称为分镜批量生成。

## 历史结构批次：定向验证

3 个测试文件、14 项测试通过：现有媒体调用 / 顺序 / 多 URL 首份 / 原 preview node；未知 metadata / ID / 重编号 / 插入默认；组合过滤 / 选择修复 / view metadata；实际文本失败保留与相同补丁重试；镜头上下移动和确认删除；字段弹窗 Escape 回焦点、过滤 IME；延迟提交的文档切换 / readonly / 卸载取消；真实 video schema 支持目录与 advanced batch 区别；duration 验证；绑定陈旧 / 缺图片时拒配；终态失败分镜计划。

本域 Vitest、零警告 ESLint 和 Prettier 通过。未运行本轮全站 check，未使用浏览器；root 后续接线 / 全站验证单独记录。

## 历史：实际节点入口（2026-10-11）

CanvasScriptNode 已挂 CanvasNode 的 script / storyboard / script-v2 创建与编辑入口。V2提供九列、结构化对白 / 运镜、独立 image / video 手动 prompt 状态、基础阶段计数和全屏；旧媒体网格与 legacy 字段继续兼容。rows / prompt-state / script-model / graph-plans / controller / views 独立，controller 不保存文档。Root patchScript / applyStoryboardPlan 承担文档门控、节点身份校验和原子历史 / 图写入。

新增939279的双FNV prompt state 与447ud3w8leoy-/225860的图片引用构造规则；建组保存 sourceScriptNodeId / linkedImageGroupId 和子节点 scriptRowHiddenUuid。视频只选真实图片产出，按 hiddenUuid 匹配，未知 portrait 阻断；本地目录配置不是原独立 storyboard 支持目录。只创建空生成节点，不提交任务或费用。

当时实际九列表格编辑画面 / 对白 / 运镜 / 两类 prompt、创建图片组、刷新恢复通过。资产 metadata 仅展示，picker / CRUD、版本 / 色签、阶段工作流、mixed2video 与服务尚缺；当时脚本下载为本地 JSON adapter。此前称“原 XLSX 导出”不准确，后续核对发现 V2 实际导出 CSV。历史浏览器步骤见 [Root 功能审计](../../../../research/generator-script-monitor-functional-audit.md)。

## 当前：资产、三阶段与 CSV（2026-10-11）

- `workflow-model.js` 独立投影镜头 / 资产 / 提示词进度；`ScriptStageProgress` 与本地 `currentStep` 管理阶段导航，关闭重开保留阶段，切文档重置。阶段不写 `viewMode` 或识别确认；V2 始终选择首个实际 table view 的配置，不能假定其 ID 或数组首项。
- `script-assets-model.js` 拥有新增、换图、清图、编辑、改名同步和删除策略；`useScriptAssets` 管理文档 / signal / 节点和资产 fingerprint；`ScriptAssetsView` 复用共享弹窗和菜单生命周期。图提交由 `useCanvasGraphActions.mutateScriptAsset` 一次写入节点、普通连线和历史；清图 / 删除资产保留真实图片节点，多资产共享图片时保留仍需的普通连线。
- 空资产的顶部阶段为 idle，底部按媒体 missing=0 允许下一步；既有图片正在重生成时，阶段进度与底栏的判断也独立。`styleDescription`、`compliance.state`、pending 新增后取消保留以及改名 / 删除的源差异均按归档核对。
- `export-csv.js` 返回纯下载描述：BOM、原列顺序 / 角色 triples / 自定义 API 标签、资产段和源命名优先级。V2 下载按三阶段 allReady 与完整生成 busy 门控；prompt recompute 不属于完整生成，终态不因残留 loading 被阻断。legacy 继续 JSON adapter。

最终提示词后续接线：`prompt-compose-model`/workspace hook/rich input各持规则、生命周期和DOM；单镜头与批量入口共用旧bundle覆盖确认和20秒撤销。手动编辑绕过表格reconciliation，保留state/hash；自动拼接读取最新styleDescription。统一draft projection包含每track的bundle基线与refs，pagehide/立即离开支持settled文档，保留canonical graph基线。源码修正：concat覆盖检查bundle fingerprint，不是input fingerprint；批量rows变化补选缺词行，不能误作generating补选。详情与剩余服务见提示词拼接审计。

- 失败表格草稿保存相关字段的原始基线，外部资产改名同步 rows 或其他 rows 修改后，重试 / 继续编辑拒绝覆盖并保留输入；无关配置更新可在当前 CAS 下重试。已打开的建图弹窗也受完整生成 busy 门控。

证据、实际浏览器结果与未完成范围见 [资产阶段审计](../../../../research/script-assets-workflow-functional-audit.md) 与 [提示词拼接审计](../../../../research/script-prompt-compose-functional-audit.md)。本地自动拼接、覆盖确认、短时撤销与资产标签已接线；智能合成、专属个人图片库、上传 / AI 批量组、incoming 自动识别、mixed2video 和真实服务仍需继续完成；本地建图不等于真实生成。

## 当前：既有媒体版本与任务失败信息（2026-10-11）

`script-media-history-model` / `useScriptMediaHistory` / `ScriptMediaHistoryMenu` 分别持纯投影、异步文档所有权与菜单视图。图片/视频原顺序、v/vV当前序号、图源短标记、设为当前不关菜单及历史行只fit已接实际单镜入口；不能将媒体版本当作prompt快照，切换不回滚正文。flags实变后严格走source tk的全部行重编号、refs维护、dialogueLines对白/旁白同步与939279独立state/hash；无lines清legacy spoken，任一显式state改变保留两轨incoming state，不能套通用表格helper。缺版本/唯一active不作规范化。

setActive在enqueue捕获epoch后由onBeforeSetActive保存草稿，再读取最新rows/assets及CAS；禁止dialog外先flush再捕获新owner。真实readonly隐藏writer，busy仅暂禁写而保留历史查看/定位；门控变化取消旧epoch。失败3/4只消费script.data.taskInfo，原locale为任务 #{taskId}/点击复制任务 ID；生成中不显示旧失败。单镜percent仅接caller明确number，未接source时无假进度。实际服务的历史创建、费用、任务/结果和复制history.nodeId重映射仍缺。源码、局部验证与Root浏览器范围见 [媒体历史审计](../../../../research/script-media-history-functional-audit.md)；该批完整check记录待Root归档。
