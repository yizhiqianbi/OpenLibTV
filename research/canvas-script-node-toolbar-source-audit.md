# ScriptV2 节点浮动工具栏源码审计

2026-10-12。本批只读核对已归档源码，不执行原站 bundle，不读取账号资源，不请求原站生成、审核、费用或写服务。本文件确认 ScriptV2 的浮动工具栏、四个动作的调用链和重新生成确认窗，并把相邻节点界面与工具栏分开。它不代表这些真实服务或所有 ScriptV2 编辑器交互已经验收。

下文偏移均为归档文件解码后的 **UTF-8 字符串 0-based 字符偏移**，不是字节或格式化后的行号。除单独标明外，主文件为 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js)。中文文案另与 [locale-zh.json](../public/data/locale-zh.json) 核对。

## 1. 已确认的入口和完整按钮范围

ScriptV2 renderer `sT` 从 **1332047** 开始；toolbar renderer `si` 在 **1314283–1316950**；实际 host 在 **1387014–1387490**。`si` 固定按以下顺序显示，**没有下拉菜单**：

| 顺序 | 原文案 / 图标                               | 传入回调 | 实际 host 禁用条件 |
| ---- | ------------------------------------------- | -------- | ------------------ |
| 1    | 重新生成 / `Icons.Refresh`                  | `tU`     | `eU`               |
| 2    | 批量生成分镜 / `Icons.Imageset`             | `ey`     | `eU                |     | !e0.outputGenerationReady` |
| 3    | 批量生视频 / `Icons.Generate`               | `t6`     | `eU                |     | !e0.outputGenerationReady  |     | rawRows.length === 0 |     | !Z` |
| 4    | 仅下载图标 `Icons.download`，`title="下载"` | `eV`     | `eU                |     | !e0.allReady`              |

图标均 16px。第四项前有竖分隔线。编辑、展开、阶段、历史版本、逐镜播放、运行及停止 **不是 `si` 的按钮或菜单分支**；它们来自节点内容、全屏表格、资产界面、单镜弹窗或生成中卡片，见第 7 节。旧脚本节点有自己的 toolbar，不能把旧 renderer 的展开按钮补进 ScriptV2 `si`。

`si` 每项同时设置真实 `disabled` 属性和 `onClick = disabled ? undefined : callback`。组件公开 props 中的四个 disable 值都默认 false，实际产品能力以 host 上表为准。

## 2. 显隐、任务和阶段门控

### Host 显隐

**1345431–1345510、1348063**：

```text
recompute = taskInfo.scriptV2TaskMode === 'recompute-batch-shots'
eU = isTaskGenerating(taskInfo) && !recompute
eG = isTaskFailed(taskInfo) && !recompute
visible = ea && !readonly && !eU && (rawRows.length > 0 || eG)
```

- 全脚本生成中隐藏整个浮动工具栏；失败且零行可显示工具栏，以便重新生成，其他动作仍受阶段条件禁用。
- 提示词重算 `recompute-batch-shots` 不计入 `eU/eG`。不能把任意 `taskInfo.loading` 当作隐藏工具栏的充足条件；具体提示词状态还会限制图片、视频或下载。
- 空白脚本和入边等待卡片不是工具栏入口。
- Source task helper 为 module `959248`，在 [222qgzyc0yyf3.js](./source/222qgzyc0yyf3.js) **16559、16685**：generating 要求 `loading === true` 且 status 缺失/null/非 terminal；failed 要求 failure status 且 `loading === false`。并非单看布尔 loading。

### 选择条件 `ea`

实际调用 **1340739** 为 `useShouldShowGenerator(selected, nodeId)`；module `464025` helper `e6` 在 **679719–680303**：

- 普通分支：节点已选中，真实选中节点只有一个且 ID 为本节点，且没有正在框选。
- 引用选择、标记或聚焦模式按该顺序读取显式 target ID；`nodeId === targetId` 分支优先，可绕过普通选择和框选分支。
- helper 本身不含 dragging 条件；拖动时隐藏由 wrapper 完成。
- 源 helper 用 ReactFlow 选择订阅维护真实单选，不从表格镜头选择数推断节点选择。

### `e0` 工作流条件

定义 **1355983–1357939**，基础 predicates **1220972–1221760**、资产可用 helper `aH` **1109620**：

| 条件                    | 源规则                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| shots ready             | 非空 raw rows，**所有** `plotDescription.trim()` 非空；`o5(total, ready)` 只有 `total > 0 && total === ready` 才 ready       |
| assets ready            | 角色/场景/道具总数非零，全部有 trim 非空 thumbnail，或 linkedNodeId 对应 getter 返回 trim 非空 URL，且源资产进度没有仍在生成 |
| prompts ready (`o0`)    | 若任一 prompt state truthy，则 image/video 两项都必须 `synced`；没有状态时，两种 prompt 均 trim 非空                         |
| prompts usable (`o1`)   | image/video 两种 prompt 均 trim 非空，且两项 state 都不是 `generating`；`stale` 可以 usable                                  |
| `outputGenerationReady` | shots ready、assets ready、raw rows 非空且每一行 prompts usable                                                              |
| `allReady`              | shots/assets/prompts 三个阶段全部 ready                                                                                      |

因此图片/视频输出条件与下载条件不同：可用但 stale 的提示词可以允许输出入口，CSV 下载仍需三阶段 ready。没有角色、场景、道具时源 assets 状态是 idle，不因数组为空自动视为 ready。

`Z` **1333070** 使用 `rc` **1119508** 返回的 `support.video`，至少有一个候选的 `getModel('storyboardVideo', modelKey)` 通过 `resolveScriptV2BatchVideoCapability(schema, 1).usable`。不能用整个 `videoModels` 目录非空代替。源 tooltip 虽写“首帧生视频”，此 helper 使用的实际 ScriptV2 capability 是 mixed 分支；保留这个源文案与实现差异，不自行改写能力判断。

### 禁用原因 tooltip

`sx` **1326947**、`sv` **1327404** 按以下顺序收集原因：

1. shots 非 ready：`「确认镜头」— 至少 1 条镜头有画面内容`
2. assets 非 ready：`「准备资产」— 为角色 / 场景 / 道具准备形象图`
3. prompts 不 usable：`「合成提示词」— 每镜生成分镜与视频运动提示词`
4. 视频额外 raw rows 空：`至少保留 1 个镜头`
5. 视频额外没有兼容模型：`切换到支持「首帧生视频」的视频模型`

有原因时 header 为 `开始批量生成前，请先完成：`，换行后 `1. ...` 顺序编号。没有原因返回空串。源第一条文案说“至少 1 条”，但实际 shots ready predicate 要全部行有画面内容；这是已确认的源差异，不能拿文案放宽门控。

只有图片、视频按钮有这种 Tooltip：top，openDelay 0，withArrow，multiline，width 300，whiteSpace pre-line，withinPortal，zIndex 1300；只有按钮禁用且原因非空才启用 tooltip。禁用按钮外用 inline-flex span 承载 hover。重新生成没有这一 tooltip；下载只有 native title。

## 3. 精确尺寸、样式和定位

`si` 外壳 `flex w-max items-center`；内层 `flex items-center justify-center gap-1`。前三按钮 h32、水平 padding12、垂直 padding8、gap4、radius8、font13、文字 nowrap；下载 h32/w32/min-w32/shrink0。分隔线左右 margin4、h20、宽0、`border-left: .5px solid var(--canvas-controls-border)`。

普通状态 `text-canvas-controls-text`，hover `bg-canvas-controls-hover`；禁用 `cursor-not-allowed text-fg-disabled`。确切 light/dark 颜色由主题变量决定，不把 token 当固定色值。

module `174008` 的 `FLOATING_TOOLBAR_STYLE` 在 [1xbjskw4nhzem.js](./source/1xbjskw4nhzem.js) **29887** 定义、**40207** 导出：padding4，radius12，border `.5px solid var(--canvas-controls-border)`，background `var(--canvas-controls-bg)`，shadow `var(--canvas-shadow-dropdown)`，backdrop blur16。

module `703962` wrapper `eO` **678554–678917**：默认 baseOffset24、gap8、zIndex20。此 host 显式 baseOffset24，因此 `bottom: calc(100% + 32 / zoom px)`；left50%，translateX(-50%)，origin-bottom。module `485615` [2ob2qo_b0az9v.js](./source/2ob2qo_b0az9v.js) **112** 的 NonScaledWrapper 使用 scale `1/zoom`、默认 nodrag/nowheel/nopan，并根据 nodeLookup.dragging 隐藏。`si` caller 没有 maxScale/fade 参数，保持屏幕尺寸以及 32px 屏幕间距。

此源码没有 viewport 边缘 clamp、横向滚动或 390px 专属布局。手写 renderer 的 portal、边缘 clamp/窄屏滚动、共享焦点与 dialog-stack 是本机适配，须另外实际验收；不能仅凭上述 CSS 证据声称真实手机浏览器一致。

## 4. 重新生成调用链与确认窗

### `tU` 与 `tF`

**1375265**：raw rows 为零直接调用 `tF`；否则 `am.confirm`：

- title：`重新生成脚本`
- message：`重新生成会覆盖当前脚本内容及最终提示词，是否继续？`
- 左 cancel：`取消`
- 右 confirm：`开始生成`
- `confirmButtonVariant: 'secondary'`
- `onConfirm: () => { tF() }`，没有返回 tF 的 Promise。

`tF` **1372230–1375264** 首先读取最新节点的 taskInfo.loading，有 loading 则返回；建立 `startCanvasNodeAsyncContinuationGuard(nodeId, 'script-v2-regenerate')`。选择节点 params.model 或全局默认 text 模型/schema，写 generate-full loading/task mode/recomputed shot IDs。没有 originalStoryText 时从 incoming text 合并原故事，随后调用 `buildScriptV2RequestData`、task context 和 **`submitGenerationTask`**。

源代码不是直接清空本地 rows 或复制一个假脚本。真实 taskId 缺失、商业处理失败、异常、迟到 continuation 均有各自分支；迟到成功任务可 best-effort stopTaskBatch。没有生成服务时本机应保留原内容，并准确呈现服务未连接。具体不可用说明/禁用开始按钮是本机服务边界，不是原站认证或收费成功证据。

### 公共确认 renderer `am.confirm`

import module `944733` 在主文件 **1080423**。实际 renderer 在 [3vx5r5m_ep13u.js](./source/3vx5r5m_ep13u.js) module944733 **112–5980**。该调用没有 variant，因此进入普通 compact 分支，不是 400px 的 `variant:'dialog'` 分支。

| 属性               | 此调用的实际默认/样式                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Modal              | centered，size auto，xOffset16；withCloseButton false，**无右上 X**                                                               |
| 关闭               | closeOnClickOutside false；closeOnEscape `options.closeOnEscape ?? true`，本调用为 true；取消调用 onCancel（本调用没有 onCancel） |
| 宽度               | `min(344px, calc(100vw - 32px))`                                                                                                  |
| 面板               | radius12/p16；controls border/background；backdrop blur-lg；shadow `var(--canvas-shadow-menu)`                                    |
| Modal content/body | 外层 content transparent、无 shadow；body padding0                                                                                |
| 层级               | overlay `options.zIndex ?? var(--z-toast,700)`；inner custom z+1，默认 `calc(var(--z-toast,700) + 1)`                             |
| 标题/正文          | title14px bold/default text；正文13px muted，文本可选择，双击全选正文                                                             |
| 按钮               | margin-top16，gap12，右对齐；取消在左、确认在右；h32/px12/radius8/font13                                                          |
| 取消色             | controls-hover，hover controls-active                                                                                             |
| secondary 确认色   | dark：#F7F7F7 背景 / #171717 字，hover白，active F7F7F7/90；light：neutral900/白字，hover800，active700；**不是 danger 红色**     |

公共 renderer 使用 ref 防重复确认，loading 时两按钮禁用，await onConfirm，catch Notify.error，finally 关闭并清 busy；有 requireConfirmText 时才渲染输入框。tU 没有 requireConfirmText，且回调不 return tF，故公共确认窗不会等待实际生成任务完成。Escape 属性没有因 loading 动态设 false，不应推断源在 busy 时禁用了 Escape。

本机应复用同一个 dialog-stack 管理背景、Escape 和回焦点，不能复制一套原站全局 Confirm singleton 的独立 body/inert 生命周期。此审计未运行 source Modal，因此除上述显式 props 外，不声称已实测 Mantine focus/动画/overlay computed 颜色。

## 5. 批量生成分镜：`ey → r3 → tQ → sC`

`ey` **1344848** 仅打开图片配置窗 (`ef(true)`)，不修改 graph、不运行。实际 JSX **1391044** 传入 raw `ez` 全部 rows、`initialSelected=ez`、scriptV2Assets `T`、opened/close/confirm；`scriptV2NodeId` 传入但 r3 未使用。

### 独立图片配置 `r3`

**1177842–1183730**：

- title `分镜批量生图`，800px centered Modal，withinPortal，z500；暗色 #181818、圆角12、border white/10；未覆写 closeOnEscape/closeOnClickOutside，不能把视频 rg 的关闭约束搬来。
- 独立 `Set<raw row index>` 选择，初始所有行；展开详情另一个 Set。不是表格当前 selectedHiddenUuids 的延续。
- 模型来自 **support.image**，按所选行 `collectShotRefImages(...sourceField:'imageGenerationPrompt')` 的最大引用数过滤：有引用时 schema.properties.modeType.items.image2image 必须是覆盖数量的 `[min,max]`；无引用不加这个限制。
- 默认首个合法候选，否则全局 default.image；打开或模型切换重置 `{model, modeType:'text2image', settings:r2(schema)}`。候选变化时当前不合法会重新选择首候选。
- source model label `rG` **1144748**：非空 modelName → schema.displayText → modelKey；按 resolveSupportModelDisable 和语言决定 disable。
- `r2` **1177629** 读取 config.settings 或 config.setting；支持数组或 text2image/image2image 分支，取 schema default。`r3` 可见 settings 本身使用 config.settings 数组。
- `rI` **1141126** 显示模型和 enum 参数 chips，支持模型图标/ratio icon/typed enum value；它不是完整 GeneratorSettings，未提供 generic advancedSettings/count/prompt 编辑器。当前字段取值按 schema key，不擅自扩写 originalField 行为。
- 说明：`会优先使用已生成的角色、场景和道具参考图，让画面更贴合分镜内容`。
- 行区域 max-height320/scroll，checkbox `选择镜头 N`，标题 `镜头N`；文字 `imageGenerationPrompt || plotDescription || （空）`，收起 line-clamp1，展开 pre-wrap；`详情`/`收起` 按钮。
- footer 全选/部分选择、模型与 setting chips；确认 `确认并创建生成器组 (N)`。
- confirm disabled：选中数0、模型不在合法候选、支持目录禁用、任一选中 row.imageGenerationPrompt falsy。**这最后一项不 trim**；不能和 toolbar 两种 prompt 的 trim gate 混为一条。
- confirm tooltip：缺 prompt 时 `请先合成提示词后再创建分镜图生成器组`；正常 `创建分镜图生成器组后，可在画布中整组执行批量生图`。
- r3 没有费用、逐镜时长、立即运行按钮。

### 确认建图

`tQ` **1381512** 把索引映射到 raw `ez`，过滤缺失项，零行 return；先关闭 modal，再 await `sC`。

`sC` **1327988–1330640** 从最新 store 获取 script，组名 `分镜图 · {label}`。创建 v2 image storyboard group：sourceScriptNodeId、sourceScriptVersion v2、storyboardSourceRowHiddenUuids、自动 bounds/padding、**groupLayoutMode vertical**、源 shell style、zIndex−1001。ratio 尺寸用共享源 helper 350..1050；初始组宽 childWidth+80，高60+N*(childHeight+40)。

逐行空 image generator：parent新组，x40/y60+i*(h+40)，name `镜头 {raw shotNumber}`，url[]，action image_generate，明确 content dims/marker，scriptRowHiddenUuid，showGenerator；source image prompt inline refs、引用顺序和 labels、image2image/text2image params；真实资产引用边。最后 childNodeIds、mount后 bounds reflow、linkStoryboard(script,group,'image')，等待 save-or-rollback。

**此链只创建生成器组，不调用生成任务。** 不能用普通 batch runner 冒充分镜 source 生成；保存、选镜、引用与服务边界须独立确认。

### 现有图片弹窗的已确认差距

本次静态读取 [CanvasScriptNode.jsx](../src/features/canvas/storyboard/CanvasScriptNode.jsx) 的 `ScriptGroupDialog`（33 起）仍是本机通用 adapter：`生成分镜图` 标题、普通 HTML 模型 select、GeneratorSettings、node.imageGenConfig 初值和 advancedSettings、借用表格 controller.selected、`创建图组` 文案。缺少上述 r3 的独立全选/行详情、support.image 最大引用数模型筛选、参数 chips、准确 disabled/tooltip/confirm 文案和原布局。其 `graph-plans.js` 调用也不据此获得 sC 全字段/vertical建图已确认的资格。

本批仅把 toolbar 图片入口连到这一旧 adapter 时，应写“图片入口已接通，本机通用配置仍待 r3 复刻”；不能写“ScriptV2 批量生成分镜完整完成”。该缺口不因本轮视频配置已经 source 研究/接线而消失。

## 6. 批量生视频与 CSV 下载

### 视频

`t4` **1381785** modal props 为 nodeLabel、显示 e1 rows、`initialImageSettings:undefined`；不是 linkedImageGroup 首个孩子 ratio 继承。`t6` **1381885** 行空 warn `请先生成脚本`，否则打开视频窗。

`t8` **1382032–1382828** 有 busy ref 和行非空 guard，调用 `rw`（**1137694**）以真实 sourceScriptId、explicit selected UUID Set、逐镜 duration Map、config/modelSchema、getNodes 和 readonly 创建/保存组。失败保持窗，contract violation warn；成功关闭，100ms后独选新组并400ms fitBounds/padding .15。源这里只建空组，不立即生成。

实际视频配置、资产引用、逐镜 mixed fallback、审核服务和建图证据另见 [v2 视频源码审计](./canvas-v2-video-graph-source-audit.md)、[v2 配置模型源码审计](./canvas-v2-video-config-model-source-audit.md) 和 [v2 配置 UI 源码审计](./canvas-v2-video-configuration-ui-source-audit.md)。本机更强的 raw graph CAS、draft 投影、取消/切文档/删除隔离、Quota 保存重试、post-commit timer 取消是已记录的本机 ownership 适配；源服务成功不能由本机空生成器建图冒充。

### 下载 `eV`

**1346170–1347900**：callback 自身仅 raw rows 空 return；readonly/fullGeneration/allReady 来自 toolbar host，不重复在 callback 中检查。

- 导出全部 raw rows，不按活动 view、表格选择或显示镜号临时重排。
- 源 SCRIPT_FIELD_META 排除 emotion/propTags；plotDescription 后插入按全行最大角色数展开的 `角色N`/`角色描述N`/`角色图N` 三列；shotColumns 可改标题。
- videoReference 取 referenceFrameImage；非 string/number 普通字段为空。
- 空行之后 `类型,名称,图片,描述提示词`，再角色/场景/道具资产 name/thumbnailUrl/description。
- UTF-8 BOM、LF、CSV 逗号/引号/CR/LF escaping、`text/csv;charset=utf-8;`；filename label→formatDownloadFileName(...,'csv')；临时 object URL 点击后 revoke。

没有 CSV/XLSX/JSON 菜单或媒体 ZIP。现有 [export-csv.js](../src/features/canvas/storyboard/export-csv.js) 是可复用纯 descriptor；caller 必须另做当前文档/节点、权限及 toolbar gate，不能把 eV 的行检查当安全 owner guard。

## 7. 相邻 ScriptV2 界面：防止误归入 toolbar

| 功能            | 可确认来源 / 语义                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| compact 三阶段  | `sg` **1323861–1326920** 是状态 div/圈/连接线，非三个 click actions；底部 `打开脚本节点 →` 按钮打开全屏                                                                                      |
| 打开/编辑       | `ts/tc` **1365490/1365735** readonly return；card double-click `tl` 避免 `[data-script-text-cell=true]`，并阻止 readonly/full-generating 打开；没有 toolbar 展开按钮                         |
| 全屏阶段        | `su` **1319690** 中独立 step buttons；`ti` **1365454** 只规范并切换本地 confirm-shots/prepare-assets/compose-prompts，不凭切阶段写 task success                                              |
| 全屏关闭/快捷键 | useNodeFullScreen **1364670**；全屏自己 close ESC chrome；block lower scopes，mod+z/mod+shift+z 注册不可见 no-op，不能把它当跨全屏可用 undo/redo                                             |
| 单镜与版本      | `tx` **13660xx** 打开单镜 modal；`tR/tP` **1369130–1370010** 在已有 imageVersions/videoVersions 中精确切一项 isActive，未知 ID 不写；节点跳转 `tj/tE` 只定位，资产跳转先确认节点存在再关全屏 |
| 停止生成        | 生成卡片 `af` **1080455** 的取消确认，调用 `eq` **1348282** 检查 task owner，stopTaskBatch，回调只在最新 taskId 匹配时恢复 prevTaskInfo；不是 si 的第五项                                    |
| 提示词任务反馈  | `sE` **13309xx** / `tB` **13760xx** 显示重算 running/cancelled/failed 和详情，不替代全脚本 eU                                                                                                |
| 空节点创建入口  | **13845xx** 的剧本/角色生成脚本、自写脚本是 empty card；不属于 si，真实生成与手写分支不能互相冒充                                                                                            |

本节只是 toolbar 范围与已确认调用位置，不声称单镜播放、全部 asset tools、全屏版本与原站任务服务已完整复刻。进一步实现应分别维护 source evidence/controller/view 边界。

## 8. 接线建议与验收边界

- 保持 toolbar 与 CanvasScriptNode 同 owner；由真实节点 selection/readonly/dragging 决定 portal，不因表格选镜而重建 editor。纯 action 描述只计算 source gate，controller 另检查最新 doc/node、readiness、取消/异步 incarnation。
- 重新生成确认不得提前清 rows；未接生成 service 禁用实际开始并说明，确认文案/样式可按源保留。
- 图片入口可以暂接旧本机通用 adapter，但文档必须保留第 5 节 r3/sC 差距。视频 source 配置与本机空建图继续保留真实审核、费用、生成服务边界。
- 非 modal tooltip/menu 与 modal stack 分工；无 source 下拉菜单就不创造额外按钮。共享 dialog-stack 管理顶层 Escape、背景隔离与关闭回焦点。
- 本批研究仅静态代码与中文目录交叉核对；未运行 bundle、未原生操作原站工具栏或确认窗，未验真实手机/Safari、服务端生成/审核/支付，也未跑生产测试。本机本批实际检查与浏览器结果由主任务另记。

视图 owner 于本批报告新 `ScriptNodeToolbar` / CSS 的 9 项单元测试、定向 ESLint 和 Prettier 通过；这属于该 owner 的组件检查记录，本审计作者未代跑。board portal clamp8、窄屏 horizontal scroll 与 focus outline 为其明确的本机适配。它不证明 Root 的 action controller、图片 r3 或真实手机操作已完成；最终联合检查和原生浏览器证据仍由主任务记录。
