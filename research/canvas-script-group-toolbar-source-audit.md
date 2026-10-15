# 脚本关联图片/视频分镜组工具栏源码审计

2026-10-12。本批先只读 `research/source/3u6hjewm8qox_.js`、中文 locale 与已保存 CSS，再按授权接入本文末尾列出的视图。不上原站登录、不使用小号、不执行原站脚本/遥测/写服务，也不全量采集内容。位置为文件解码后的 **0 基字符位置**，不是行号。原生登录态、账号权益与真实生成结果不在证据范围。

## 分类与 renderer 门槛

`GroupNode` renderer 从 761179 附近开始。762199–762900 的实际变量为：

| 变量 | 实际规则 | 不应外推 |
| --- | --- | --- |
| `eA` / `e_` | `sourceScriptNodeId || undefined` / `!!eA` | 只说明数据声明了关联；不证明该脚本仍存在或该组仍是最新组 |
| `eL` | `storyboardGroupType || undefined` | type 由组 data 判定，不是凭 URL、名字或孩子类型猜测 |
| `eO` | `e_ && eL === 'video'` | 脚本关联视频组；源批量创建使用节点 `type:'group'`、data subtype video，不必是 `video_group` 节点 |
| `eG` | `!!standaloneStoryboardImageGrid && eL === 'image'` | 可以与脚本关联同时成立，不能把 standalone 自动等同于“无脚本” |
| `ez` | `(e_ && eL !== 'video') || eG` | 含关联非视频组与独立图片组；不等同于所有普通组 |

793540–794900 JSX 按顺序选择：支持角色工具栏且有 characterAsset → `CharacterGroupToolbar`；否则 `eG` → `ts`；否则 `General GroupNodeToolbar`。但是当前保存 bundle 的 `1_q92occ5t5k4.js` 12063 附近、module890544 的 `supportsCharacterGroupToolbar` **恒返回 false**，因此角色分支在这版 renderer 不可达，不能仅因 characterAsset 存在就排除 General。实际分类应为：

| 组 data | 实际 toolbar | 重要差异 |
| --- | --- | --- |
| 无脚本、standalone image | `ts` | 已有独立图片组实现；无 run 按钮 |
| 有脚本、standalone image | `ts` 混合分支 | 比例锁定，隐藏转普通组，显示重新生成/停止；不是 General v2 行 |
| 有脚本、非 standalone、非 video | General | 颜色、排列、执行/重新生成、可选批量生成视频、解组、下载 |
| 有脚本、video | General | 颜色、排列、执行/重新生成、解组、下载；不显示 v1 图片组的视频创建入口 |
| 无脚本、非 standalone | General 普通分支 | 工具箱、转分镜组属于此分支；本批不能把这些入口挪到 linked 组 |

`sourceScriptVersion === 'v2'` 是严格判断；“非 v2”源码分支也包括缺省/其他值，不能仅因 UI 没版本便编造一个 v1 字段。源 `eG` renderer 用 truthy flag，layout helper `tx`（7581xx）要求 flag **严格 true**；本地新建规范数据用 true，读畸形历史数据时不要假称所有 truthy 情况几何都一致。

工具栏共同上层条件为 `!ew && t3 && !ta && !td`（793560）：readonly 隐藏；批量视频浮条 `ta` 打开时隐藏；标题编辑及结束后 200ms `td` 隐藏。`t3 = eN || (eG && eI)`（790306）。`eN` 的实际 helper 679719–680303 是普通唯一组选择/未框选，或参考拾取、标记、focus 的特殊目标；`eI` 要求未框选、只选一个直接 image child。**只有 eG 支持此唯一 image child 的附加门槛**，General linked 图片组不能照搬独立组 child-selected 规则。

wrapper（678554–678917）center 上方，baseOffset20 + 默认 gap8 = 28 screenpx，逆 zoom 缩放、z1000，dragging 时隐藏。标题另用 719133 的 wrapper，不随 drag 隐藏，非编辑标题可以拖组；标题编辑规则和敏感词服务边界沿 [独立组审计](./canvas-storyboard-group-toolbar-source-audit.md)。`t2=eG||eO` 控制 `data-storyboard-group` marker 及禁用 NodeResizer；普通 linked image General 分支并不因 `e_` 自动被此 resizer 条件排除。Source/Target handle 是 `e_` 分支，visible 取组选中状态，target connectable 取 `e_`（7953xx），不能当普通组静态 handle。

## General toolbar：完整顺序与状态

组件声明为 8138xx–820950，label/variant helper 在 804272–8059xx。主要 props 是 groupColor、workflowUuid、isGroupRunning、isStoryboardGroup、isStoryboardImageGroup、sourceScriptVersion、anyChildHasContent、pipelineProgress、showBatchGenerateVideo/canGenerateVideo/videoGenerationDisabledReason、groupNodeId、canDownloadAll、allChildrenAreImageNodes、isStandaloneStoryboardImageGrid，以及动作 callbacks。

顺序如下。文案来自 `2ijgtfwpg93os.js` 的 67352–67757、1642xx–1654xx；下载运行文字在 199305。

| 顺序 | 控件 | 条件/状态 | 图标/尺寸 |
| --- | --- | --- | --- |
| 1 | 颜色圆点，无文本 | 常显；当前 groupColor，缺省 `#B8B8B8`；点击开颜色 picker | 触发器 40×40，内部圆点20×20、0.5px暗边 |
| 2 | 自动排列图标+下箭头，无文本 | 常显；点击开排列 picker | AutoArrange20、chevron12、按钮高36 |
| 3 | 分隔线 | 常显 | 1px宽、高24、左右2 |
| 4 | run/stop | 见下方版本规则 | 运行时 square16；非v2 linked Refresh20；v2/普通 Play20 |
| 5 | `批量生成视频` | `showBatchGenerateVideo`，不可用显示原因；只 enabled 时调用 | VideoAdd20、高36；disabled opacity40、aria-disabled |
| 6 | `更新工具箱` / `添加到团队工具箱` / `添加到工具箱` | **仅 `!isStoryboardGroup`**；linked 组全部不显示，不读取团队状态创造额外入口 | ToolBox20 |
| 7 | `转分镜组` | **仅 `!isStoryboardGroup && !isStandaloneStoryboardImageGrid`**；须 allChildrenAreImageNodes；linked 组不显示 | GroupStoryboard20；disabled opacity45；提示“组内须全部为图片节点” |
| 8 | `解组` | 常显、调用 onUngroup | Ungroup20 |
| 9 | 分隔线 | 常显 | 同上 |
| 10 | 下载图标 | 有 onDownloadAll callback；可用性由 canDownloadAll | Download20、36×36；aria-label“批量下载”；不可用提示“当前选区无可下载的资源” |
| 10 运行态 | `停止下载 ({current}/{total})` | ZIP status running、mode group、groupId 匹配本组时替换下载图标；点击 cancel | square16，红边/黑80%底；不使用其他组或虚拟框任务的状态 |

没有 linked 专属比例、宫格数量、拼接、序号、清空、模型选择、preserve toggle、保存资产或通用“设置”入口。颜色与排列存在于 General，不代表它们也存在于混合 `ts`。

Run helper 的精确行为：

- `isGroupRunning` 时文案“停止”，有 pipelineProgress 则“停止 ({progress})”；红色文字和红 hover 背景。progress 是 `min(finishedCount,plan.length)/plan.length`（7681xx），不是本地伪计时百分比。
- 未运行且 linked **非 v2**，文案“重新生成”，Refresh20，default variant。
- 未运行且 linked **v2**，文案“整组执行”，Play20，brand variant。品牌态不会因为孩子已有内容变回普通样式。
- 手指提示 `w`（8064xx）只在未运行、linked v2、`anyChildHasContent !== true`。32×32 pointer-events none，绝对位置 right -8、top12，light/dark fill/stroke/shadow不同，并使用 `animate-scriptv2-run-group-hand-cue`；不是可点按钮、不是会员权益标记。
- brand v2 的 300ms 顶部 tooltip 文案：“请点击下方的生成器，检查提示词和参考图连接无问题后，点击整组执行开始批量生成”（locale164216）。

Renderer 的 `e5`（7658xx）**只在 linked 且 version v2 时**检查直接孩子的 URL：数组存在非空字符串，或字符串 trim 后非空。其他版本 e5 为 false；不能直接拿通用“任意孩子有数据/所有孩子完成”替代。

颜色 picker `j`（8122xx）是 5列×2行，gap12、容器padding12；每个 hit target36×36、内部色块28×28圆形；当前颜色用2px同色outline/offset2，点击已选色回调 null。10色顺序：`#7A7A7A`、`#E74C3C`、`#F28A2E`、`#F4B740`、`#2ECC71`、`#08B6DD`、`#3B82F6`、`#8B5CF6`、`#F63B97`、`#E6E6E6`（811486）。源没有色盘输入、自定义HEX或“取消颜色”额外项目。

排列 picker `E`（8128xx）顺序为“宫格排列”(layoutGrid16)、“水平排列”(workflow16)、“垂直排列”(list16)，对应 grid/horizontal/vertical。菜单 minWidth120、padding4、gap4/圆角6项目、左右padding12/上下8、font14。source 回调 `t1`（7888xx–790306）先 snapshot，再 source sort/layout/reflow，不是纯 label；group size与布局模式一同更新。非 standalone `tH` 走 ordinary group grid；preserve 分镜变量几何只在 strict `tx` 分支，不能为 General linked 组添加未证实的 preserve 操作。

颜色/排列互斥，以 outside mousedown 关闭，`[data-popover-safe]` 保护。body fixed portal，颜色左对齐触发器、排列中心对齐，都在 trigger.top 上方8px；transform 分别 `translateY(-100%) translateY(-8px)` / `translate(-50%,-100%) translateY(-8px)`，z-sticky。重新定位由 source viewport/node x/y/dragging signature `Q` 驱动（8146xx–8159xx）。原 General picker 没有 `ts.tn` 的自动上下翻转，也未证实独立 resize listener；本机窄屏 clamp/翻转、键盘焦点/Escape 可作为明确适配复用共享 popover。

General 外壳 `C`（8112xx）为 GROUP_TOOLBAR_ROW_STYLE 派生：padding4、gap4、radius14；默认 style 的 border0.5、controls-bg、shadow、blur16 保留。普通文本动作高36、font13、radius10、paddingx8、gap6。这与 ts 的高32、padding8、gap8、radius12行不同，不能统一成一套默认视觉。

## 混合脚本 + standalone image：ts 的真实差异

745075–755096 的 `ts` 完整行仍是“当前比例 → 宫格 → divider → 拼接 → 序号 → 清空 → [转换] → [脚本运行] → divider → 解组”。

- `aspectLocked=e_`：比例按钮 opacity45/cursor-not-allowed，不开菜单，tooltip“比例由脚本节点统一配置”延迟200ms。仍显示从第一实际 image child params 得出的比例 label；不是把比例改成脚本字段的任意字符串。
- 宫格 preset/custom、2k/4k拼接偏好、序号与解组继续存在，规则见独立组审计；锁定比例不会同时禁用这些操作。
- 清空 hover 文案变为“删除组内所有子节点；脚本对应关系保留，可重新生成分镜”。确认标题“清空分镜”，正文：“将删除分镜组内所有子节点。与脚本的对应关系仍保留，可通过「重新生成」恢复分镜图。是否继续？”（locale68278）。删除孩子、保留源组和脚本对应关系，不能借清空擅自解绑。
- `!isScriptLinkedStoryboard && onConvertToNormalGroup` 才显示“转普通组”，所以混合分支隐藏转换。
- 脚本关联时增加 divider 及 run action：未运行**始终显示“重新生成”**(Refresh16)，包括 v2；运行显示“停止”(square14)，可附 `({pipelineProgress})`，红色 hover。这里不用 General 的 v2 “整组执行”/brand/手指引导规则。
- 没有颜色 picker、General 排列 picker、下载、批量生成视频、模型/高级设置或 preserve toggle。renderer 可能计算 v1 视频 availability，但 ts 没把该入口绘出，不能只因 callback 存在就添加。

运行仍调用相同 renderer `tz`，因此 mixed v2 的 toolbar 文案“重新生成”与其 power 确认框“整组执行”不同。UI 与执行规则需要各自按 actual caller 保留，不能因名称看起来矛盾而自行统一。

## run / stop 确认与服务边界

`tz`（772161–775100）运行中：普通 pipeline 直接 stop；`ez || eO` 的分镜执行先确认。标题“停止批量任务？”；若 remainingCount>0 显示“将停止 {count} 个进行中的任务。”，随后“停止将不退还已消耗算力。”；确认“停止”、取消“取消”。count 是 plan.length-finishedCount 限0，非前端推测的真实服务任务余额。

未运行时 actionMode 按 `ez → storyboard-image-regenerate`、否则 `eO → storyboard-video-regenerate`、否则 pipeline。版本 v2 的两个分镜 action 都使用 power 确认；普通 pipeline 也使用 power 确认。title“整组执行”，确认“开始执行”、取消“取消”，executionKind parallel。

非 v2 图片 action 用 `resolveStoryboardImageConfirmOptions(e5)`；helper 的 true 分支文案为“重新生成分镜图”/“将对未生成或失败的分镜图重新生成，是否继续？”。但是 **本 renderer 的 e5 非 v2 恒 false**，所以 actual v1 caller 是“生成分镜图”/“将对组内所有分镜图开始生成，是否继续？”、确认“开始生成”。不要把 helper 的另一个分支标为此 caller 已可达，也不要据确认文案推导 targets；实际 targets 由 run plan 决定。

非 v2 视频 action：title“重新生成视频”；pending 计数是直接 video children 中 URL 空或 isTaskFailed 的个数。pending>0 message为“将对 {n} 个未完成视频重新生成，是否继续？”；否则“所有视频重新生成，是否继续？”。确认“开始生成”、取消“取消”。

`tw`（758563–760850）真实 power 内容：加载“正在计算算力消耗…”；失败提示“即将对组内 {count} 个生成节点{action}，算力消耗计算异常，是否继续？”；附“仅生成节点会被执行，特殊节点需手动执行。”；成功按计费结果显示积分、0 cost 或 mixed-free-times 分支。mixed 文案明示优先抵扣免费条数、不足按模型消费、实际消耗以执行结果为准。`groupRunUnlimitedBenefitNotice` 只在本 JS 找到引用，已保存中文 locale 没有对应条目，**其具体中文文案未核实，不凭账号或词义创造**。

Power 与 account benefit 通过 calculateGenerationParamsPower/calculateGroupPower、resolveCurrentGroupRunBillingEstimate、rate limit benefit hooks 得出。缺少 adapter 时应明确未连接/不可执行，不能把 unknown 写成免费、VIP无限、0积分或成功。源码确认框不证明本机能够远端执行。

`tU` image（771313）要求 sourceScriptNodeId 和实际脚本节点，取 rows/config，再 buildStoryboardGroupRunPlan、guarded patch targets 并 `tF`；`tG` video（7719xx）读取当前节点 build video plan。`tF` 对 v2 使用 onlyNodeIds + parallel + autoFocus false + disableBenefitTags；非v2 onlyNodeIds。这不是任意 group pipeline 的别名，不应把当前普通 BatchRunDialog/普通 runner 套进去就称 linked generation 已复刻。真实模型、引用、compliance、费用与 executor 回包仍由服务协议约束。

## v1 图片组的“批量生成视频”浮条：模型与设置所在位置

Availability helper（8050xx，export resolveScriptV1StoryboardVideoAvailability）要求 `isStoryboardImageGroup && version !== 'v2' && sourceScriptNodeId`。存在 linkedImageGroupId 且不是本组则 visible但disabled，提示“当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组”；readyImageCount<=0 则 visible但disabled，提示“请先生成至少 1 张分镜图后再批量生成视频”。其他类型/version不显示。

这里的 readyImageCount 来自 `eX`（734665）：直接 image child 有 scriptRowHiddenUuid 且 url数组含 trim 非空字符串；按脚本 rows.hiddenUuid 逐行匹配，去重 child map，一行存在才进入输出。不是实际图片节点数量，不是 blob已选或普通图片有内容就可用。eX可接 selectedHiddenUuids，但本 `eM` UI 没展示选中分镜列表或每镜时长配置。

点击 `tR`（7692xx）复验 availability，再 `ta=true`。renderer effect（768450）记录原 viewport、以子图bounds做300ms聚焦；关闭后300ms返回原 viewport；selection gate t3失去时关浮条（7908xx）。浮条不是 Modal，而是组下面的 `eb` wrapper（7194xx）：zoom 下限0.5、maxScale2、组中心、top `calc(100% + 10/effectiveZoom)`，hideWhenDragging false。

`eM`（720233–7249xx）的实际从左到右控件：

1. 关闭 x，32×32；divider。
2. 模型选择器 `type:'storyboardVideo'`；divider。
3. 共用参数视图 `params` / `modelSchema` / `onParamsChange`，`embedAdvancedSettings:true`、`embedAdvancedSettingsBatchOnly:true`。
4. “全部 {count} 个分镜”，font13、opacity70；divider。
5. GeneratorPowerCostDisplay，scale为分镜数量，等待或错误 power 为“-”，带原价字段（不能当free）。
6. 28×28 submit按钮：arrow-up12；在途 loader12，“审核中...”title、disabled；正常title“生成视频”。

模型默认：support.storyboardVideo 的 modelKey 列表含 `kling-v3-omni` 则优先它，否则第一项，否则 global.defaultModel.video；名单变化会把不在名单内的当前模型回默认。这里读的是真实配置/偏好，不能宣称本地默认就是该用户原站偏好。

初始 config 含 model、singleImage2video、settings；可继承第一图 params.settings 的 resolution/ratio，ratio从settings提取或从第一图明确 contentWidth/contentHeight 接近比例（误差<0.15）推导。候选接近比率是 1:1、16:9、9:16、4:3、3:4、3:2、2:3，**不是 ts 六比例候选**。按当前模型 schema 找 ratio* 字段；补 ratio 还检查 enum。模式由 schema支持顺序 singleImage2video→image2video→text2video 决定。共用 settings 接收 prompt空、count1、当前settings/advancedSettings，回调只合并 settings与advancedSettings；不新增 prompt、多图数量或 preserve 控件。每个参数具体候选依赖合法 schema，不能补一套硬编码“所有模型通用设置”。

费用调用是300ms debounce calculatePower，metadata node/project、provider/model/taskType video、随机requestId，依赖 benefit status；取消用存活flag忽略迟到回包。submit忙状态finally释放，调用 onGenerate(config带modelSchema)，不在 UI 制造生成结果。

后续 `eZ`（735049–7394xx）检查 readonly、source存在、实际脚本、当前画布/源组/脚本/孩子 continuation owner、最新 linkedImageGroupId、ready rows；按模型能力判断人像合规与过期，必要时真实 compliance；创建真实 video group、children/reference edges、linkStoryboard，然后等syncSaved并检查owner。tA只在成功后关浮条、选中/fit新组；明确失败文案含无可用分镜图、人像合规未通过、重试失败。没有这些 source/service 不该提供假成功视频组。

## 当前差距与最小可验 UI 合同

截至本批只读时点，CanvasGroupNode 已有独立无脚本的 StoryboardGroupToolbar；混合组被显式排除。非 standalone 仍是旧普通 select+“整组执行”+“解组”，尚不等同于上面的 General source 行；linked v1/v2标签/颜色picker/下载/批量视频浮条、运行进度与脚本 service尚须分别接线。已有共享 generator/settings、ZIP和普通批量规则可复用其小型服务/视图边界，但不能将其验证当作 linked run 已通过。

下一阶段建议只改可验证视图，并等 Root 明确生产授权/API：

- 在纯 presentation 分类中明确 mode为 `ordinary`、`linked-image`、`linked-video`、`standalone-image`、`linked-standalone-image`，保持脚本existence/availability在controller实时校验。
- 新 GeneralGroupToolbar 持颜色/layout popover、source行样式、v2handcue、ZIP显示与焦点；接 board-local anchor/portal/documentKey/visible，并保留 readonly、ready、busy、dragging/boxselection owner门控。
- view状态最少需要 linked/type/version、groupColor、running、pipelineProgress、anyChildHasContent、batchVideoAvailability、downloadable、当前匹配组ZIP状态；这些数据由Root/model算，不在view读取账号或猜费用。
- 菜单 callbacks 建议 color(value|null)、layout(grid|horizontal|vertical)、run/stop-intent、batchVideo-open、download/cancelDownload、ungroup。Root可沿原onRun/onLayout/onUngroup或统一onGroupCommand适配；视图不自行运行普通batch代替linked生成。
- mixed ts复用已有独立toolbar小组件，但增加 aspectLocked/isScriptLinkedStoryboard/running/progress，将源clear文案、转换隐藏、固定“重新生成”/stop接出；不要套Generalv2品牌/标签。
- v1批量视频eM浮条作为单独controller/view，使用共用model/settings schema；缺真实source/executor时保持明确blocked。费用/合规/服务器task状态没有完成证据，不做本地假计费或假成功。

最小 UI 验证矩阵应包含 linked image/video非v2/v2四类与mixed image非v2/v2两类；逐一验证控件顺序、v1/v2label与mixed差异、handcue/URL门槛、colors选中取消、layout值、menu Escape/外部焦点、390px clamp、readonly/加载/同ID A→B→A关闭旧菜单、ZIP只匹配本组、batch-video stale/无ready/可用三状态。run callback只能记录合法意图或明确未连接，不以单元夹具宣布原站生成/权益验收。

## 授权视图接入与本机适配

`GeneralGroupToolbar.jsx` 已按 source 行接颜色、排列、普通/linked 运行标签、v2 hand cue、可注入的批量视频资格、工具箱、转换、解组和 ZIP 状态。颜色与排列 mode 引用 `general-group-controls-model.js` 的常量，视图只维护原文案和图标映射；11 个原 SVG 图标来自已保存 `public/assets/icons/`，hand cue 两个 path 仅作为 SVG 数据使用。动画来自 `0f2shqexgq0gc.css` 3518 附近：1.15s、0/100% 8px/8px、50% -4px/-4px、-40°。本机 reduced-motion 禁用动画为可访问性适配。

General ARIA toolbar 为“分组操作”，按钮“分组颜色”“分组布局”；菜单“分组颜色选择”“分组排列”；颜色选项“分组颜色 #HEX”，排列三种保留 source 文案。运行、视频、工具箱和下载均只交给 controller 回调；`groupServiceState` 未提供时不运行，忽略本地旧 task 字段，`batchVideoAvailability` 不由 view 猜测。Root 负责服务资格、确认和未连接边界，视图不把 linked 执行转成普通 Batch。

`StoryboardGroupToolbar.jsx` 的 mixed linked image 分支已接 locked ratio、source clear tooltip、隐藏转换、固定重新生成/停止与注入 progress；版本 v2 也不变成 General 品牌执行行。原独立无脚本工具栏和宫格 flyout 协议保留。两个 toolbar 共用 `GroupToolbarUI.jsx` 的定位、非 modal 菜单和 tooltip，小组件只持 UI 生命周期，共用 `useAgentToolbarPopover` 的顶层 Escape、外部关闭与焦点恢复。General 使用 source 上方优先，ts 保持下方优先；source 28screenpx gap、board portal、8px clamp、窄屏横滚为本机手工 renderer 的布局适配。

`CanvasGroupNode.jsx` 普通/linked/独立组标题共用外部屏幕尺寸、inline rename；非输入标题继续自然冒泡拖组，输入态阻止拖动。标题 maxWidth 独立按 source `tn`（767661）measured→stored→350 fallback。原 source 没有 manual renderer 默认宽度：本机壳 width/height 则统一 `canvasNodeSize`，与世界 hit/anchor 相同，避免仅 measured 的合法旧组标题/工具栏与壳错位；这不是宣称所有原 RF measured 几何都直接等同。source 默认壳仅 standalone image 或 linked video 为 storyboard dark；linked image 与普通组为 canvas group bg。`1h-b10gcvw4vl.css` 245202/246787/253710 的 dark bg/border `#ffffff1a`、light bg `#0000000d`/border `#00000014`、storyboard shell dark `#212121`/light `#fff` 已以 scoped CSS 变量接入，使清除颜色后保存的 var 仍有真实定义，不装全局 reset。

声明 truthy standalone flag 但非 true 的坏历史配置，source renderer 与 strict grid helper 本就不一致。本机不会降级显示 General 死按钮，也不捏造规范化后的 slot geometry；规范 true 状态继续沿已验 grid presentation。此坏配置恢复/正规化仍是明确边界。

2026-10-12 01:40:40 定向运行 `GeneralGroupToolbar.test.jsx`、`StoryboardGroupToolbar.test.jsx`、`CanvasGroupNode.storyboard.test.jsx`、`storyboard-grid-presentation-model.test.js`：4 文件 / 90 测试通过，25.19s。覆盖 General 原行/10色取消/三排列/菜单键盘与回焦点/外部焦点、linked v1/缺省/v2标签与 URL cue/真实注入进度、批量视频资格三状态、ZIP取消/缺回调/ready/busy、390→320 ResizeObserver clamp/上方 menu flip、mixed锁比率/clear文案/运行/版本差异、普通标题编辑与拖动、same-ID文档切换、measured-only合法旧组和畸形 standalone flag。owned JSX/tests ESLint、UI/CSS Prettier check 通过；没有放宽 timeout、删除旧行为断言或运行全量检查。生产冻结后由 Root 单独验收 NodeCanvas 图事务、撤销/恢复、持久化与原生桌面/窄屏，不能把上述 view tests 当作该真实流程已通过。

登录注册、账号资源与原站写入继续按用户要求延期，整个复刻目标未完成。
