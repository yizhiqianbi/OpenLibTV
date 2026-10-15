# ScriptV2 画布紧凑卡片源码审计

后续Root已接卡面状态、拖动、全屏入口和任务视图，实际联合208项及完整305文件/3900项检查通过；本文的“调研时本机差距”保历史。当前实现、明确适配与native未验范围见 [卡片验收](./canvas-script-card-functional-audit.md)。

日期：2026-10-12。只读取已归档的公开 JavaScript 与中文 locale，不运行 bundle，不登录，不调用原站生成、取消、保存或消费服务。字符偏移为 UTF-8 解码文本的零基准位置。本文覆盖画布卡片及紧凑三阶段视图；全屏编辑器、浮动工具栏、图片 / 视频配置分别由既有分域审计维护。

## 证据索引

| 文件 / 模块                  |                                                          字符偏移 | 直接证据                                                                                     |
| ---------------------------- | ----------------------------------------------------------------: | -------------------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js` / 272776  |           `sm` 1323200 附近，`sh` 1323280 附近，`sf` 1323570 附近 | 固定 286px 轨道中心、66px 默认四线图标、16px 勾形 SVG。                                      |
| 同上                         |                                              `sg` 1323861–1326920 | 三个静态 pill、两条连接线、当前态计算、生成中文案、唯一底部打开按钮。                        |
| 同上                         |                                     `sS/sI/sj/sE` 1330580–1332047 | 只读遮层、重算任务辨别、百分比格式和重算失败 / 取消 notice。                                 |
| 同上                         |    `sT` 1332047 起；任务分型 1345428–1345560；卡片分型 1347911 起 | 整节点任务排除 `recompute-batch-shots`，分型的优先级与 generator / toolbar 门控。            |
| 同上                         |                                         `e0` 1355983–1358400 附近 | shots / assets / prompts 的工作流投影；`readyCount` 与可生成门槛。                           |
| 同上                         |                            `ts/tl/tc` 1365494 / 1365537 / 1365735 | 按钮打开、surface 双击、只读及完整任务生成中的限制；不修改 currentStep。                     |
| 同上                         |                                   `tB/tH/tW` 1375925–1377100 附近 | 重算任务 notice、逐镜百分比平均和资产 / 提示词生成文案拼接。                                 |
| 同上                         |                                              host 1384500–1389340 | empty / pending / resource / full task 对应 JSX、350×350 内容壳、紧凑卡片实际 props。        |
| 同上 / 316925                |                                                     684260–685390 | empty hint renderer 的图标、尝试文案、三个动作及只读隐藏。                                   |
| 同上 / 272776                |                                              `af` 1080453–1081490 | full generation 的 7×3 skeleton 和任务 badge；取消前确认。                                   |
| `1kb-4b4zv9_2a.js` / 713118  |                                                            0–2100 | `NODE_WIDTH=350`、`NODE_HEIGHT_EMPTY=350`、`NODE_GAP=100`。                                  |
| `222qgzyc0yyf3.js` / 959248  |                          16559 / 16685，default renderer 至 21082 | task generating / failed 谓词及通用任务失败视图。                                            |
| 同文件 / 244263              |                                                             29824 | Text2Icon 是 Icons.ListDetail 的 size 包装；对应已存 `public/assets/icons/list-detail.svg`。 |
| 同文件 / 276204              |               30284 起（multi-ID），default UI 33200 附近至 36325 | 公共 progress badge 的状态文案、排队、权益、task owner cancel 和视觉样式。                   |
| `170exq-5f14zz.js` / 182004  |                 状态正规化 2770 附近、failure 2940、terminal 6862 | terminal 为 SUCCESS 或 FAILED / TIMEOUT，数字字符串经正规化。                                |
| `1h-b10gcvw4vl.css`          | neutral token 5465–5620、blur token 6832、backdrop utility 589267 | neutral400=#c4c4c4、neutral500=#919191、neutral900=#171717；backdrop-blur-2xl=40px。         |
| `public/data/locale-zh.json` |                                                `canvas` namespace | 本文逐项中文文案，不从变量名猜译。                                                           |

## 卡片形态的优先级

`sT` 先从原始 `data.rows` 取 `ez`，然后计算以下顺序。后一个条件不能盖过前一个：

1. 整节点任务正在生成：`isTaskGenerating(taskInfo)` 且 task mode 不是 `recompute-batch-shots`，形态 `generating`。
2. 整节点任务失败：`isTaskFailed(taskInfo)` 且 task mode 不是 `recompute-batch-shots`，形态 `failed`。
3. 原始 rows 非空：形态 `resource`，展示 `sg` 紧凑三阶段。
4. 有 incoming **或 outgoing** edge：形态 `pending`，只显示中央大文本图标。不能将这一步缩写成仅“有入边等待”。
5. 以上均不满足：形态 `empty_generate`，显示尝试入口。

`isTaskGenerating` 需要 `loading===true`，status 缺失 / null 或尚非 terminal。`isTaskFailed` 需要 FAILED / TIMEOUT 且 `loading===false`。terminal 数字字符串由公共状态 helper 正规化，不把字符串状态误认为永远进行中。只有 task status、没有匹配 loading 状态，不能直接套任务界面。

重算任务无论 running / failed / cancelled，都不使用整节点 generating / failed 分支。它是否展示紧凑卡片仍由 rows 非空决定；空 rows 的重算任务仍回到 pending / empty 分支，不凭 task mode 造一个 resource 卡片。

### Empty / pending 的确切范围

两个分支都用 350×350 的圆角内容壳，`node-shell relative flex flex-col overflow-hidden rounded-xl`，border 为 `1px solid var(--canvas-node-border)`，selected 时 `2px solid var(--canvas-node-border-selected)` outline、offset -1。handles、连接 target / frosted overlays、node tilt 仍由既有 wrapper / node interaction 所有者处理。

Empty 背景是 `var(--Surface-secondary-background, #262626)`。中央 `Text2Icon` size 90、`text-fg-disabled`；公共 hint renderer 横向 padding 24，非只读时图标下 margin 16，出现“尝试：”及竖排三个按钮，每项 text-sm、px12 / py8、gap8、radius8：

- alignJustify 14：“剧本生成分镜脚本”。创建一个上游 text resource，内容来自 `SCRIPT_PRESETS.textToScript.textPrompt`，坐标为 script 原 position 的 x−350−100、同 y，再连接到 script。
- user 14：“角色生成分镜脚本”。创建两张真实 preset image resource、连接两条边，并写 script preset prompt / SCRIPT_GENERATE action。图片 x 同上，y 使用 script 原 position、350 / 2 和相邻 40px 间隔。不是直接开始真实生成。
- TextIcon 14：“自己编写分镜脚本”。打开全屏、切到 confirm-shots，然后写一条默认 row、空 assets、table/default view。

只读时 hint renderer 不提供这些动作，仅保留中央图标，并加 `sS` 绝对全覆盖层（inset 0、inherit radius、z45、pointerEvents all、cursor grab）。本地缺少前两个 graph preset 入口时必须记为缺口，不以“手动编写”替代三个入口全部。

公共 Text2Icon module244263 实际使用 ListDetail；本地已存 `public/assets/icons/list-detail.svg` 可复用，不能用 TextFile / FileText 冒充这个空态大图标。

Pending 背景是 `var(--Surface-Panel-background, #171717)`，仅中央 Text2Icon 90；没有等待解释文案、计数、阶段按钮或“立即开始”。只读也加同一覆盖层。

## Resource 壳与紧凑视图

Resource / full task 共用节点 wrapper：content width / height 均 350；light 背景 `var(--Surface-secondary-background, #ffffff)`，dark 为 `var(--Fill-Panel-background, #212121)`。壳内 min-h-0 flex1，圆角12、overflow hidden；surface 是 cursor-grab / active:cursor-grabbing。节点标题由外部 title renderer 所有，不在 `sg` 重复添加 icon + 标题 + “N个镜头” summary header。

实际调用 `sg({stages:e0,onOpen:readonly?undefined:tc,isCanvasLight:themeIsLight,generatingLabel:tW})`，**未传 icon override**，因此默认图标必须是 `sh` 的四条横线，不是 FileText 图标。`sg` 不读取 store、task 或选中状态；host 决定它的存在和 callbacks。

### Layout、图标与文案

- 外层 h-full、flex-col、items-center、justify-between，左右 padding32、顶部68、底部32。light 主文字 neutral900，dark white。
- 上部 w-full、flex-col、items-center、gap16。
- 图标区 66×66。默认图标同为 66×66，四条 rounded-full 横线，线高4、前三条宽36、末条宽24、间隔6；dark white/28，light neutral400。`icon` 非 nullish 时才使用 caller override。
- 轨道 h62、w-full、max-width286，relative；内部三列 grid h-full。
- pill 是静态 div，pt8，每个圆点24×24，数字1 / 2 / 3 font14、semibold、leading-none；label mt4、font13 normal、line-height18。精确文字依次为“确认镜头”“准备资产”“合成提示词”。
- compact 中**不展示** `ready/total`、工作流 hint、readyCount、进度条或三行大按钮。全屏 stepper / 表格的 richer 展示不等于此卡片内容。
- 底部唯一按钮“打开脚本节点 →”，type button，h40、w-full、max-width286、radius8、font14 semibold。dark bg-white/10、hover /15、text-white；light bg-black/5、hover /10、text-neutral900。没有 onOpen 时整个按钮省略，不造一个 disabled 按钮。

### 当前阶段与连接线

顺序固定 `[shots,assets,prompts]`。当前索引是首个 `status!=='ready'`；全部 ready 时为最后一项索引2。每项视觉状态依次判定：

1. 实际 status 为 ready，视觉 ready。
2. 否则当前索引、实际 partial、或者 isBusy 任一成立，视觉 active。
3. 否则 idle。

ready 圆点：dark white 实底 / `#212121` 勾，light neutral900 实底 / white 勾。勾为 16×16 SVG、path `M3.5 8.1 6.7 11.3 12.6 4.7`、stroke2、round linecap / join。未 ready 的 active / idle 圆点样式相同：border2，dark white 边 / bg-white30 / white 数字；light neutral900 边 / bg-neutral90030 / neutral900 数字。两者只在 label 明暗上有差别；idle dark white65 / light neutral500，active dark white / light neutral900。

连接线按**左边阶段自身 ready**判断完成，而非右侧阶段是否 active。两条线 top19、height2、width55、rounded-full。固定中心函数 `sm(i)=286/3*(i+0.5)`；left 为 `sm(i)+12+(sm(i+1)-sm(i)-24-55)/2`，约67.8333 / 163.1667px。源码没有按实际 DOM 宽度重新计算此常量。

完成线 dark white90 / light neutral90070；未完成线 dark white18 / light black15。source testids 为 `scriptv2-stage-progress-compact`、`-icon`、`-track`，各 item 为 `scriptv2-stage-pill-${id}`、`-circle-${id}`，各 connector 为 `scriptv2-stage-connector-${id}`。pill 的 `data-status` 是原始工作流 status；connector `data-complete` 是字符串 true / false，不以视觉 active 替换实际状态。

## 工作流数据与生成文案

已有 `workflow-model.js` 可作为数据入口；compact 只能按现有 workflow 渲染，不重新写资产 / prompt readiness。

- shots ready：原 rows 的 plotDescription.trim 非空数量。total 为 rows 数量；0项 idle，全部 ready 为 ready，部分 ready 为 partial，全部未 ready 为 idle。
- assets：正规化 characters / scenes / props。thumbnail.trim 非空或真实 linked node 首 URL / URL descriptor 非空即 ready；没有资产为 idle。资产任务进行中时不能仅凭所有媒体已有就把整个 assets 阶段标 ready。segments 与 linked tasks 的 loading 身份分开维护。
- prompts ready：有任一显式 promptState 时必须两个 state 均 synced；无显式 state 时要求图片 / 视频两份 prompt.trim 都非空。isBusy 为任一 promptState generating。
- `allReady` 是三个 stage.status 都 ready；`outputGenerationReady` 则为 shots ready、assets ready、全部 prompt 可用于生成（文本存在且不 generating），不能互换。compact 圈只认 status，不认 outputGenerationReady。

### `generatingLabel` 的真实来源

`r7` 1185152 从 linked asset nodes 的 `taskInfo.loading` 取当前资产任务；可用 numeric progressPercent 的算术平均后向下取整，没有进度值则不显示百分比。仅 task status、asset 缩略图是否存在不能猜 busy。资产 progress 不另做0–100限幅；`sj` 只有 finite number 才显示 `label N%`。

提示词进行中为 `eZ.progress.inProgress || tB.kind==='running'`。卡片提示词百分比来自 `progressByShot` 数值的平均、floor、0–100限幅；**不是** completed/total 的批次数百分比 `tV`。没有逐镜记录时只显示文案，不把 taskInfo 百分比冒充这个平均值。

按资产、提示词顺序组合，中文逗号 `，`，末尾字面三个点 `...`：例如“资产生成中 40%...”“合成提示词中...”或“资产生成中 40%，合成提示词中 25%...”。不要变成“40%完成”、单个 Unicode ellipsis、独立两个 badge 或普通任务 renderer。

label 区 h32、max-width286、items-center、radius8、px16 / py8、font14 medium、leading-none、backdrop-blur-2xl；内部 truncate / whitespace-nowrap。dark bg-black65 / white；light bg-white85 / neutral900，加 `0 2px 6px rgba(0,0,0,0.08)` shadow。只有 truthy generatingLabel 才存在。

## 打开与双击

`tc` 与 `ts` 都只在非只读时调用 openFullScreen，未主动改 currentStep、选中项或 fit。currentStep 初始 confirm-shots；之后在同一 mounted owner 内保留，close / 再开不会因为紧凑按钮自行重置。

surface 双击 `tl` 的顺序：若 target.closest(`[data-script-text-cell="true"]`) 则不处理，也不在此 stopPropagation；其余先 stopPropagation，再在非整节点生成中、非只读时打开。失败卡也走该 handler，允许非只读打开；整节点 generating 的双击不能开全屏。

`sg` 内没有 whole-card click / double-click handler，也没有阶段 onClick。普通卡 surface 单击由 RF 节点选择处理；drag 由 host 所有。本地按钮可使用 pointer / click / double-click stopPropagation 隔离外层 drag / 双击，Space 只阻止向画布冒泡、保留原生按钮默认激活；这是手写 renderer 的事件所有权适配，不改变 source stage 点击语义。

## 重算 notice 与整节点任务边界

`tB` 仅处理 `scriptV2TaskMode==='recompute-batch-shots'`：running 返回 running，可选 finite round / clamp percentage；failedReason.trim 含中文“取消”时 kind cancelled，否则 failed，taskId.trim 缺失显示 `--`。resource host **只给非 running tB 渲染 sE**；running 已由 generatingLabel 表达，不能重复追加底部 running strip。

非 running notice h32、w-full、shrink0、gap6、border-top、px12、font12、leading-none；circleAlert 图标14。普通 dark border-white10 / bg-white4 / text-white55，light border-black10 / neutral50 / neutral500；failed 再叠 dark red300 / light red600。文字分别“最终提示词生成已取消”“最终提示词生成失败”；仅 failed 加 `TaskID: ${taskId}`，最多55%宽、mono、tabular nums、opacity80。title failed 为文案 / TaskID / reason 的非空项用 `·` 拼接；cancelled 仅文案。非只读为打开全屏的 button，readonly 为 div；点击不强制切 compose-prompts。

整节点 generating 的 `af` 是独立重型 renderer：7行×3列 skeleton，行列 gap8、格高24、radius4、dark white10 / light neutral300、p12，底部 mt12 放公共任务进度 badge。点击取消先确认“取消生成”，内容含“正在生成中（N%），即将完成！”及换行“停止将不退还已消耗算力。”，confirm“确定”、cancel“取消”；实际取消走 task owner 检查、stopTaskBatch，并在最新图仍是同 taskId 才恢复 prevTaskInfo。这里的真实取消 / 费用不由 compact 视图实现。

整节点 failed 调用公共 module959248 default，只给 taskInfo / nodeId；没有在 host 提供 onRetry。该通用 renderer 还涉及任务明细 / task owner / retry / generation badge /真实服务，应单独复核和实现。本文可证明**路由到任务视图的资格和调用 props**，不据此宣称完整任务错误 / 取消 UI、真实退款或后台生成已验收。

### 公共 task badge / failed renderer 的已核实可见分支

module276204 由 multi-ID `276204,939665,e=>` 注册，不是单独文件名。default badge 默认 h32、gap10、px16 / py8、radius8，文字 font14 medium / nowrap；dark backdrop blur16、bg rgba(0,0,0,.45)、border .5 rgba(196,196,196,.6)，light blur16、bgwhite85、borderblack12、shadow0 2px 6px black8。`size=compact` 或 `variant=fill` 是公共 renderer 的其它 caller 能力，`af` 没传这两个参数，不使用它们替代这里的默认外形。

label 资格按实际 numeric status 判定：status0 有正 remainSeconds 时优先“排队中，预计等待N秒”，超过120秒使用 ceil(N/60) 分钟；status0 无等待与 status1 为“生成中 N%...”，其它状态为“准备中 N%...”。此文案函数只对 truthy 且 >0 百分比 append，并不等于 compact `sj` 的 finite number 规则。已有 benefitTag 会经 `resolveActiveBenefit` 切换到“畅享0积分生成中...”“畅享低峰期 1 积分生成中...”“畅享固定积分生成中...”或“畅享权益生成中...”；本地默认 actor 没有这些权益，不造一个 benefitTag 来复刻显示。匹配 taskId 的临时 progress bus 在 numeric status0/1 时可以覆盖其显示状态和百分比，但真实协作总线继续是服务边界。

badge 的取消按钮仅在 onCancel 存在且 node task owner 成立（没有 nodeId 的通用 caller 例外）时出现，text-sm、nodrag、透明背景、无 border / padding。点击先 stopPropagation，再调用 caller；`af` caller 负责前述确认，不能令静态 view 发 stopTaskBatch。

failed default 内容为居中 flex-col、gap12：36×36 warning triangle SVG（stroke2、圆角线，dark red400 / light red500），然后 font14 medium“生成失败”或 TIMEOUT 的“生成超时”；存在 failedReason 时展示最大90%宽的居中 font12、tight leading、dark white50 / light neutral500。存在 taskId 则展示 font10 的 `TaskID: ...`（最大90%、truncate、title完整值）和12px copy按钮，复制仍用公共 clipboard 服务及成功 / 失败通知。只读不剥夺这个复制动作。

模块还包含 yielded-task lazy renderer、reference-image“查看详情”、重新生成和成功片段入口，但 host `sT` 的失败调用没有 onRetry / onViewDetail / onViewSuccessClips，不把这些参数分支全展示在 ScriptV2 卡中。真实 yielded 状态、task detail、retry/owner、排队与进度总线的端到端能力应后续分域验证。本轮 compact / source shape 复刻不能声称这些服务已接通。

## 本机接入契约与已确认差距

已新增独立 `ScriptCompactProgress({workflow,onOpen,isCanvasLight=false,icon,generatingLabel})`；只渲染 sg/sh/sf，不持有 store、历史、文档、全屏或 task 生命周期。`script-card-model.js` 的 `projectScriptCompactProgress(workflow)` 提供当前态与静态 stage / connector descriptor，避免 view 再复制工作流规则。host 继续决定形态、350×350 壳、handles、拖动 / surface 双击、task renderer、生成中 label 和重算 notice。

CSS 按归档实际 tokens 使用两主题颜色与40px backdrop blur；按钮增加 focus-visible outline 是本机键盘可见性适配。外层补 `flex:1; min-height:0; width:100%` 配合手写 host 的剩余高度与 notice 所有权，源 `sg` 是 h-full；不会把适配错误描述成源有 min-height规则。按钮 stop pointer / mouse / click / dblclick，Space 只停止向画布冒泡、保留 native activation；静态卡面与 pill 的拖动 / 双击仍传播给 host。

专项验证：固定 Node24，2026-10-12 05:14:06，`vitest run .../ScriptCompactProgress.test.jsx --maxWorkers=1` 1 file / 13 tests 通过（615ms）；定向 JSX / test ESLint `--max-warnings=0` exit0，专项 Prettier 通过。覆盖实际 workflow、静态三阶段 / 唯一按钮、首个未完成 / partial / busy / all-ready、连接线左阶段资格与固定位置、原勾 SVG / 默认与自定义 icon、无 callback 省略按钮、caller 进度文案、两主题局部类、host drag / dblclick 与按钮隔离、Space / Enter 默认激活、StrictMode 不重复 callback 和 invalid 输入不发布部分卡片。这些是 jsdom DOM 与回调证据，不包含 CSS 像素、实际触屏 / 浏览器或服务测试。

调研时本机 `CanvasScriptNode.jsx` 的 summary header、镜头数量、三行可点阶段卡、各 ready/total、额外“AI合成服务尚未连接”段，与源紧凑卡片布局及点击行为均不一致。只按 rows 是否为空还遗漏任意方向 edge 的 pending 分支、full task 优先以及 recompute 非整节点任务规则。readonly 或 full generating 无条件双击打开也与 source gate 不同。后续 Root host 接线完成后，以其实际验收记录更新这些历史差距，不将调研时差距当作最终交付现状。

无登录 / 小号 / 原站写请求仍是本轮边界。新增静态视图专项只可证明 jsdom DOM / 回调 / 状态投影；真实拖动、缩放、窄屏画布、task service 和原生浏览器证据由主任务另行记录，不能以 unit tests 或源码解析代替。

## 后续 task 状态视图与本机复制（2026-10-12）

新增 `ScriptCardTaskStatus({kind,taskInfo,documentKey,nodeId,isCanvasLight=false})` 只渲染前述默认 badge 与失败正文；host 决定 generating / failed 形态并保留7×3 skeleton。视图复用 `script-card-model.js` 的 `projectScriptTaskBadge(taskInfo)`，按它的源资格呈现排队、准备、百分比与超时文案，不复制另一套 numeric / typed status 规则。没有在视图提供取消、重试、任务详情、成功片段或权益动作。

失败正文保留36px原 warning path、原红色色值、14px / 20px label、12px reason、10px截断 TaskID 和12px copy icon。归档图标注册 `3cc4i9j9c1y82.js` @146781 的 lowercase `Icons.copy` 与 uppercase `Copy` 均映射 `libtv:copy`，当前使用已有 `/assets/icons/copy.svg` mask 保留 currentColor。归档样式 `1h-b10gcvw4vl.css` @5856 / @5874 的 text-sm 为 .875rem、line-height calc(1.25/.875)，本机固定对应14px / 20px。损坏的非字符串 taskId / failedReason 不传给 React 文本或剪贴板，是本机安全输入边界；正常 raw string 不 trim。

复制复用同域 `useMessageCopy` 及 `services/clipboard-text.js`：原生与 legacy clipboard 共用 AbortSignal；documentKey / nodeId / kind / raw taskId 身份改变或卸载中止旧请求，迟到成功 / 失败不发布到新卡。只读卡仍可复制 TaskID，不触发文档修改、历史或保存。成功只在实际剪贴板完成后显示局部“TaskID 已复制”，失败显示“任务编号复制失败，请重试”；原公共 renderer 的全局 Notify 被明确适配为局部反馈，不能称为真实任务或生成成功。

`useMessageCopy` 原本允许后一次 copy 中止并替代前次请求，并非同步去重锁。本组件新增按 owner 重置的 ref 锁，避免同一 render 连续激活重复写入；旧 request 的 finally 只有仍持有自己的锁才清理。pending 只设置 aria-busy，按钮保持可用与可聚焦，不因 disabled 丢失键盘焦点。同步锁、focus-visible outline、局部反馈均是本机生命周期 / 可访问性适配，不假称原 renderer 存在这些规则。pointer / mouse / click / dblclick 隔离外层节点事件，Space 仅停止冒泡而保留默认按钮激活。

badge 当前没有真实 progress bus 与 benefit source；未知 benefitTag 使用普通生成文案，这是明确的能力边界，不能伪造会员 / 免费 / 固定算力权益。取消确认与费用、真实 task owner、yielded renderer、详情与重试继续未接入。本组件显示实际文档 taskInfo，不创建成功状态或发原站请求。

紧凑卡及 task 状态主题同时支持显式 isCanvasLight 与既有 `.canvas-light` board ancestor；两者使用相同局部 tokens，没有新增主题存储或 DOM 主题读取。compact CSS 追加 `.canvas-light .cv-script-compact` 与其 generating badge selector，是手写 board 的主题适配；当前只有 jsdom selector / DOM 证据，未作真实主题像素验收。

最终所属专项：正式 Node24，2026-10-12 05:24:49，两个 view test 文件 **33项通过**（TaskStatus19、Compact14），966ms；定向四个 JSX / test 的 ESLint `--max-warnings=0` exit0。所属 JSX / CSS / tests 的 Prettier 检查通过。TaskStatus 覆盖源 status 排队 / 百分比 / timeout、原 warning / reason / raw TaskID、无服务动作、只读复制、真实成功 / 失败 / 重试、同 render 双调用锁与 pending 焦点、owner 改变与 A→B→A / unmount / StrictMode、旧 finally 不解除新锁、Space与 pointer / dblclick隔离。该记录只包括 jsdom DOM、回调及真实剪贴板协议的 mock writer，不含浏览器原生剪贴板权限、CSS像素或真实 task 服务验收；完整检查及主画布浏览器结果由主任务单独记录。
