# ScriptV2 紧凑卡片与 workflow 纯规则审计

2026-10-12。本批静态核对现有 workflow/script model、实际 CanvasScriptNode 与公开归档 `sg/sT`，不运行原 bundle、不登录、不请求真实生成/费用/账号资源。随后按主任务明确范围新增独立纯 card projection 与测试；未修改旧 workflow/script helpers、controller、视图或全局文档。

源码位置为解码后 **0-based 字符偏移**，不是 UTF-8 字节或 pretty 行号。主证据：[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js)，module272776。中文文案对照 [locale-zh.json](../public/data/locale-zh.json)。

## 1. 共享 workflow 与两种视图的边界

| 源位置                                    | 协议                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `oZ/oJ/oQ/o0/o1/o2/o3/o5` 1220972–1221800 | 阶段 ID 正规化、镜头/提示词计数及 readiness               |
| `aH` 1109620                              | 实际 asset media readiness                                |
| `r7` 1185152                              | 关联资产节点的 task loading/平均百分比                    |
| host `e0` 1355983                         | 全部 raw rows 与规范资产 → 三阶段 workflow                |
| `sg` 1323861–1326947                      | 紧凑卡片静态轨道，唯一 open button                        |
| `sc/su` 1318099 / 1319690                 | 全屏 ring/阶段导航，可切换三个阶段                        |
| `sp` 1321350附近 / summary 1322608        | 全屏结构及 readyCount/3 文案                              |
| `sT` 1332047                              | 实际 ScriptV2 renderer host，不是另一套 compact readiness |

compact `sg` 与全屏 `su` **接同一 e0 对象**。compact 不另算镜头/资产/提示词完成率，也不把 source task status 直接转成三个阶段 readiness。区别在呈现和操作：

- sg 阶段本身是 div，**不 clickable**；不接受 currentStep/onStepChange。它显示静态编号或 check、阶段名、连接线和可选生成中文字条。
- sg 仅 `onOpen` 存在时有“打开脚本节点 →”按钮，打开时不根据第一未完成阶段自动切页面。
- su 每阶段是 button，调用 onStepChange(stepId)，状态不 ready 也可导航；阶段选择不写节点 data。不能将 su 的交互外推给 sg。
- 第一未完成阶段 index 是 compact 的视觉状态，不是全屏 currentStep。全部 ready 时 index=2，但三个阶段仍全显示 ready/check。
- 全屏 currentStep 初值 confirm-shots；打开/关闭 useNodeFullScreen 没有重置该 state。caller `ti` 用 oZ 正规化。手动初始化 tO 则明确调用 confirm-shots。

## 2. workflow 的精确计数

raw rows 为 `E.rows ?? []`，不按表格筛选、选中、hiddenUuid 或当前视图减少。源 e1 可对 resource rows 做 shotNumber 重编号，但 e0 输入 E 的 raw rows，不能把重编号/默认空行当 workflow 原数据。

### 镜头

`plotDescription.trim().length>0` 即 ready；total=raw rows.length。ready==total且total>0时 status ready，ready>0但不全则 partial，否则 idle。提示为 `{count}个镜头已就绪` / `{count}个镜头待核对` / `暂无镜头`。segments 每行 ready/default，isBusy=false。

### 资产

source normalizeScriptV2AssetsForRender module302098 在 [447ud3w8leoy-.js](./source/447ud3w8leoy-.js) 11624：characters/scenes/props 按固定顺序，排除非 object、非 string 或 trim 空 id；不去重合法重复 id。缺/坏 buckets 变数组；非法 name/role/description/linkedNodeId/thumbnailUrl 被局部补值或清除，不写回原 data。

`aH` 1109620：非空 trim thumbnailUrl 直接 ready；否则 linkedNodeId.trim() 查 getter，返回非空 trim string 或 object.url 才 ready。当前 host `en` 1340250附近用真实 ReactFlow getNode 的 `data.url[0]`，不找第二张 URL，也不以生成器盒子、task success 或 placeholder 当 media。

total 为规范资产项数，ready 为实际 media 项数。r7 的 inProgress=true 时阶段保持 pending：已有 ready>0 → partial，即使有旧图且 ready==total；零 ready → idle；只有 total>0、所有资产 media ready且不在生成时 → ready。total=0始终 idle，不把“无需资产”自动算 ready。

segments 优先级：matching linkedNodeId 在生成集合→loading；已有实际 media→ready；如 caller 无 generatingLinkedNodeIds 但有 generatingCount，剩余 missing 项按顺序消耗 loading slot；其他 default。给了空 generatingLinkedNodeIds 数组时不使用 count fallback。

r7 1185152 读取每个关联节点 taskInfo.loading 的 **truthy 值**，不是整脚本 full task 的 strict loading 判断。任务 status 本身不构成资产 busy。重复 linkedNodeId 按资产次数计入生成数量与平均；只平均 typeof number 的 progressPercent，Math.floor 后返回。未知百分比没有假0；源未知/非有限值在最终 label helper 再不显示百分比。

资产提示为 `{ready}/{total} 已生成`，不全时追加 `、还差 {remaining} 个`；空项为 `暂无资产`。

### 提示词

- oJ：imageGenerationPrompt/videoMotionPrompt 任一不存在或 trim 空 → missing。
- o0 stage-ready：任一 prompt state truthy 时，必须 imagePromptState/videoPromptState 都是 synced；两个 state 都 falsy 时，取两条实际 prompt 均非空。
- 因此两个 synced state 即使文字空，source stage 仍 ready；不能为“合理”而修改这个 source 判定。
- o1 output-usable：两条文字实际非空，且任一 state 都不是 generating；stale 文字可用。
- o2 busy：任一 state generating。
- segments：o0 ready 优先；否则 o2 loading；其他 default。
- total=raw rows.length，ready=rows.filter(o0).length；status 用与镜头相同 o5。提示为 `{ready}/{total} 已合成` / `暂无提示词`。

readyCount 为三个 status==='ready' 的数量，allReady=readyCount===3。outputGenerationReady 则是镜头ready+资产ready+rows非空且every(o1)。**download allReady 与生图/视频 output-ready 不同**，stale prompt 可让 output-ready true 而 allReady false；两个空 prompt+synced 可反过来。

现有 [workflow-model.js](../src/features/canvas/storyboard/workflow-model.js) 在合法 source 数据上已经保留这些区别，11项现有专项测试有实际强断言。本批复用其完整 workflow，不重新造 readiness。其 typeof string 容错避免 source 对 malformed prompt/plot 直接 trim 崩溃，属于已有本机安全边界。旧 helper `scriptAssetUrl` 会寻找 url 列表首个非空项，不可代替这个 workflow getter。

## 3. 紧凑轨道视觉投影

`sg` 固定顺序 shots/assets/prompts：

```text
activeIndex = 第一 status !== ready 的 index；若没有则2
visualState =
  status===ready → ready
  index===activeIndex || status===partial || isBusy → active
  其他 → idle
```

ready 优先于 busy。未完成但不是首阶段时，partial/busy 仍可 active，不强制只有一个 active。编号固定1/2/3；ready 用 check，不显示本机额外 `{ready}/{total}` 文本或 clickable 阶段。

source `sm` 1323103：`center(index)=286/3*(index+.5)`。两条连接线：

```text
left = center(i)+12+(center(i+1)-center(i)-24-55)/2
width = 55
complete = precedingStage.status===ready
```

不根据下一阶段完成情况变 complete。sg 的标签是确认镜头/准备资产/合成提示词。此投影只描述纯几何/状态，theme 和 check/圈样式交给 view；没有 click、currentStep 或写操作。

## 4. sT surface、raw task 和标题

主 host 1345431 得 e_/eO/eF，1347911 得 eB：

```text
isTaskGenerating = loading===true && status非终态
isTaskFailed = loading===false && status为FAILED(3)/TIMEOUT(4)
isRecompute = scriptV2TaskMode==='recompute-batch-shots'
fullGenerationBusy = isTaskGenerating && !isRecompute
fullGenerationFailed = isTaskFailed && !isRecompute
kind =
  fullGenerationBusy → generating
  fullGenerationFailed → failed
  raw rows.length>0 → resource
  actual incoming/outgoing edge存在 → pending
  否则 → empty_generate
```

直接核 module959248：在 [222qgzyc0yyf3.js](./source/222qgzyc0yyf3.js) 16559 B、16685 M。terminal status 来源 module182004：[170exq-5f14zz.js](./source/170exq-5f14zz.js) 2783 l / 2940 d / 3000 u。只正规化 finite number、trim 非空可转换 finite numeric string；其他类型不借 Number(object) 当终态，终态为2/3/4。

特别边界：loading true但status2/3/4不算生成中，也不算 failed，因此有rows会显示 resource；loading缺失且status3不算 failed。loading=1/'true' 不算整脚本 busy。recompute 即使正在运行或失败也不切 full-generation/full-failure surface；有rows继续resource，无rows按pending/empty。

source `ew` 1344966：`title || name || label || '脚本'`，truthy 不 trim。位于 O 外部 title renderer，不是 sg 内部标题。source eC 紧随其后：原 E.title truthy时改名写 `{title:value,name:value}`；否则只 `{name:value}`。新 pure card 仅投影 title，没有将通用 name 写入扩展成未授权改名动作。

### 真实 open 门控

- resource sg caller 1388680：onOpen=readonly?undefined:tc。
- tc 1365735：非readonly时只 openFullScreen，不写阶段。
- resource/failed host surface doubleClick tl 1365537：若 target 位于 data-script-text-cell 则忽略；否则 stopPropagation，只有 !fullGenerationBusy&&!readonly 才打开。
- generating surface禁止打开；pending/empty surface不是这个 tl host。
- 因而 card `canOpen` 为非readonly且resource/failed；`showOpenButton` 只非readonly且resource。failed 的可打开性来自 surface doubleClick，并不存在额外 failed open button。
- full-screen阶段导航本身不依赖ready完成；ready/保存pending/owner等本机写安全与双击忽略控件由controller/view负责。

## 5. 生成 label 与 recompute footer

`sj` 1330747附近只给 finite number 百分比追加 ` {n}%`。host `tW` 1376655 先资产、后提示词，用中文逗号连接并加三个英文点：`资产生成中 25%，合成提示词中 50%...`。无busy项则undefined。

资产部分来自 eQ.inProgress/eQ.progressPercent，见 r7。提示词busy为 eZ.progress.inProgress 或 tB.kind==='running'；**提示词label百分比只来自 eJ(progressByShot)全部值的 Math.floor平均，夹0..100**，不是 taskInfo.progressPercent，也不是 ready rows/total。0仍显示0%。无逐镜live进度只能显示“合成提示词中...”，不能编进度。新 pure model 接 optional promptProgress.inProgress/progressByShot 以保持这条证据边界；现有本机自动/手动合成无真实服务进度时不伪造live数据。

源 tB 1375880附近是 recompute 专属状态。running不显示 footer（由label表达）；loading===false失败/超时且 reason.trim()含“取消”→cancelled；否则failed，taskId.trim()||'--'，保留reason。host 1388810附近仅 resource surface里 tB存在且kind不是running时显示 sE footer。源码中文为“最终提示词生成已取消”/“最终提示词生成失败”，failed footer显示TaskID。完整脚本 generation/failure 的 af/n$ UI 不由本批虚构文字替代。

## 6. 手动 tO 原 patch

`tO` 1372150附近：先 openFullScreen、setStep(confirm-shots)，再写：

```text
rows: [aj(1)]
assets: createEmptyAssets()
viewMode: 'table'
activeViewId: 'default'
```

没有清 params/title/taskInfo/prevTaskInfo/views，没有提交生成任务。aj 1088962 的空行包含 shotNumber1、duration5、空 plot/character/shotSize/emotion/scene/prop/lighting/audio/dialogue/三类prompt，两个独立标识，再经initializePromptStateForRow补 textHash/payloadHash/两类none state。

DEFAULT_SHOT_DURATION_SECONDS 在 [447ud3w8leoy-.js](./source/447ud3w8leoy-.js) 349 为5。现有 rows.createStoryboardRow 已保留相同业务字段及 prompt-state 初始化，故新helper复用它。随机/ID生成由caller注入 makeId，两次调用生成 row.id/hiddenUuid；pure不调用随机、存储、React或任务服务。source使用 temp-ID namespace，本机注入稳定local IDs属于标识适配。

## 7. 本批开始时的确定错位与范围

以下为审查时旧实现的具体状态，接线后需主任务更新验证，不将它们描述为已自动解决：

1. CanvasScriptNode.jsx旧紧凑summary 476–504：重复内部标题、镜头数量、三行 clickable stage buttons及固定服务note；source sg只有图标/静态横向track/可选真实busylabel/openbutton。将阶段button点击转setStep/expand是未有的源动作。
2. 同文件旧summary按controller.rows.length二分，未按source full task生成/失败、recompute、terminal/loading分类；已有rows的full generation仍画summary，source应generating surface。
3. 同文件旧472/480无条件doubleclick/open、readonly也可开；source tl/tc明确readonly门控，并应忽略文本控件子目标。旧readonly相关本机测试不代表源能力。
4. 旧summary title只title||“分镜脚本”，旧外部CanvasNode title只name；source外部ew应title||name||label||“脚本”。改名title/name联动尚需caller单独决定，不加到本批card projection。
5. [script-model.js](../src/features/canvas/storyboard/script-model.js) 61：任意truthy loading判generating；FAILED/TIMEOUT缺loadingfalse与recompute排除；empty名不同。因此不能直接复用为新v2card eB。它仍用于v2 video配置rows正规化，保留这一历史差距；本批不改旧helper避免其他入口受影响。
6. 旧workflow helper在正常数据的计数/usable/allReady已一致；`scriptFullGenerationBusy` 用Number(status)会将[2]/对象valueOf等 malformed状态误判终态，newcard遵typed源parser。旧helper未扩scope修改。
7. 旧ScriptStageProgress的full ring主题固定dark、无source sc/su所有data hooks；这属于独立view差距，不能把full阶段交互搬回compact弥补。
8. 旧卡片只有本机compose.notice/error，不呈source recompute失败/cancel footer与资产/逐镜真实busy label。本批pure返回原metadata，真实task数据来源与完整af/n$视图仍按主任务范围，不假造task进度或成功。

## 8. 已新增纯 API、专项与适配

owned [script-card-model.js](../src/features/canvas/storyboard/script-card-model.js) / [tests](../src/features/canvas/storyboard/script-card-model.test.js)：

```text
projectScriptCompactProgress(workflow)
  → {valid,activeIndex,stages:[{id,status,visualState,label,number}],
     connectors:[{id,complete,left,width:55}]}

projectScriptV2Card({node,nodes=[],edges=[],readonly=false,workflow?,
                     assetProgress?,promptProgress?})
  → {valid,reason,kind,title,workflow,compact,fullGenerationBusy,
     canOpen,showOpenButton,generatingLabel,notice}

createScriptV2ManualPatch({makeId})
  → {rows,assets,viewMode,activeViewId}

projectScriptTaskBadge(taskInfo)
  → {valid,label,queueing,status,progressPercent,fillPercent,
     normalizedStatus,failureLabel,benefitUnsupported}

projectScriptTaskFailure(taskInfo)
  → {valid,label,timeout,normalizedStatus,taskId,failedReason}
```

workflow与assetProgress caller已有时直接复用，不重复扫描readiness；无workflow时使用既有scriptWorkflowState＋真实url[0]/linked任务投影。promptProgress格式 `{inProgress,progressByShot:object}`，无live数据不借其他百分比。notice只源resource内recompute cancelled/failed metadata，不提供未证全task UI文案。非法node类型/rows/节点数组/workflow安全invalid，无伪ready。

caller持ready/doc/readonly写安全、取消其它手势、草稿flush、CAS/history、dialog-stack、doubleClick控件排除和open状态；pure没有新listener、React/I/O/import反向依赖。manual caller单独open+confirm step，不能以空脚本生成任务冒认手动编写。

官方bundled **Node24.19.0**：最终新增card/task模型113项＋既有workflow11项，合计2文件124项通过，`05:20:11`开始，480ms；日志 [canvas-script-card-model-tests.log](../artifacts/canvas-script-card-model-tests.log)。定向ESLint与生产/测试文件Prettier check均exit0；默认忽略的research审计另显式格式化。未运行full check、原站账号、真实任务或原生浏览器验收；主任务controller/actualApp/UI专项和最终完整check另记。

## 9. 整脚本任务 badge / failure 的独立协议

新增直接静态核对 [222qgzyc0yyf3.js](./source/222qgzyc0yyf3.js) module276204：模块开头30284、权益label helper32729、badge default label33990–34470、visual fill34471。failure源module959248在同文件：TaskID slot17390，failure标签18942，资格B/M同上。

badge default label使用 **原始 numeric status 严格相等**，不使用terminal helpers的typed正规化。因此status字符串`'0'/'1'`可被host判正在生成，但label仍“准备中...”。这不是pure model的fallback猜测：source33990明确`0===e`/`1===e`。两个状态label为“生成中”，其他状态为“准备中”，最后三个literal英文点。

百分比文字为`progressPercent && progressPercent > 0`时追加` {raw}%`，不要求number/finite、不夹0..100；例如正数字字符串照样显示，超过100照样保留。**fill视觉另算**：只有finite number才夹0..100，其余为0。新的`fillPercent`仅为这个纯视觉量，不把unknown task进度当真实0%文字。

status===0且delayInfo.remainSeconds>0时为排队，label为“排队中，预计等待{waitTime}”，不追加pct。秒数内部helper：非number、NaN或<=0返回“0秒”；number>120按`Math.ceil(seconds/60)`分钟；否则直接秒值，不round。因外层`>0`与内层typeof不同，positive string `'121'`会进入排队并显示“0秒”；120秒仍秒，120.1秒为3分钟。Infinity也是source类型规则允许的Infinity分钟；这些公开源边界都有专项断言，不能擅自称为服务器正常返回。

failure资格为`loading===false && normalizedStatus in [3,4]`。timeout label用公共typed parser的normalizedStatus===4：“生成超时”，其余“生成失败”。full failure中的TaskID/failedReason按源raw truthy值保留，没有recompute footer的trim或`'--'`补值；两者是不同UI协议，不能共用旧notice清理逻辑。新helper仅投影标签和已有字段，不创建、重试、取消或完成任务。

### 明确未接的依赖

源badge可从nodeId匹配task progress bus，但仅当原task numeric status0/1且taskId相同才覆盖status/progressPercent；本机pure只消费caller明确提供的taskInfo，没有自行创建bus、心跳、定时器、广播或假任务事件。源benefitTag还通过resolveActiveBenefit展示free/powerFixedOffPeak/powerFixed/其他权益文案。当前workspace actor没有这些权益，本批不推测权益或伪装会员文字：有truthy benefitTag时返回`benefitUnsupported:true`并采用普通生成文案，属于明确本机未接权益适配，不能宣称该分支源一致。没有benefitTag的badge与源default branch保持上述协议。

这些projection与原card API相互独立，不更改workflow计数、compact点击能力或手动patch。未知/非record task的valid=false；不会因此产生新task、loading状态或成功结果。实际UI、TaskID复制的异步owner/焦点/取消清理由主任务及view owner负责，本文件不报告它们已浏览器验收。
