# 普通 GroupNodeToolbar 源码契约

2026-10-12。本批只静态读取已归档公开脚本，不运行原 bundle，不登录或写原站。offset 是 UTF-8 解码后 Python 字符串的零基字符位置，不是字节或行号。普通组、脚本派生组与 standalone 图片组必须按实际 renderer 分支区分。

## 源文件与入口

| 文件 / offset                                                             | 证据                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js` 803819–820964，模块970683                              | 完整 GroupNodeToolbar、颜色与 layout 菜单、run/stop、工作流、转分镜、解组及下载。                                                         |
| 同文件761191、762504–763000、765105                                       | GroupNode renderer、组型和真实 direct children 全图像资格。                                                                               |
| 同文件679733–680267，模块464025                                           | useShouldShowGenerator：reference/mark/focus 当前节点，或当前节点单选且非 box-select。                                                    |
| 同文件790306、793297–794950                                               | toolbar 与 resize 的 caller 门控，以及实际传入的回调。                                                                                    |
| 同文件678552–678895，模块703962；`2ob2qo_b0az9v.js` 112–1470，模块485615  | toolbar 上方28屏幕像素、逆 zoom 缩放、当前节点 dragging 时隐藏。                                                                          |
| `1_q92occ5t5k4.js` 12063，模块890544                                      | supportsCharacterGroupToolbar 的归档实现恒 false。不能仅凭 characterAsset 元数据推断独立 character toolbar 当前已启用。                   |
| `3u6hjewm8qox_.js` 768085、770712、775101、775227、776058、778316、789118 | rename、color、workflow、resize-end、grid reflow、转分镜、三种普通 layout。                                                               |
| 同文件756618、757036、757581                                              | tm 尺寸、tf 真实成员排序、tg 普通 grid。                                                                                                  |
| `04q9x43g2p9-v.js` 27771–28020，模块662493                                | padding36、gap36、top66；resize 最小内边距12。                                                                                            |
| `1eqsg-pmc0mun.js` 94093–94345、97807–100207，模块836105/959759           | 列数规则、canonical `groupLayoutMode`；通用 calculateGroupLayout 的 estimated 默认与 renderer tm 不同。                                   |
| `1bflqug4ccoei.js` 67262–67809，模块713841                                | defaultGroupNodeBackground：普通 `var(--canvas-group-bg)`，standalone 图片与 script-video 使用特殊壳背景，显式颜色追加1A。                |
| `2w-kufkudj-q1.js` 42185–42612，模块574341                                | guardedNodeWrite 的协作阶段门控，pending 默认允许，denied 拒绝并提示。                                                                    |
| `0leiedr1esdbe.js` 109509–113540                                          | 数据 patch 删除 undefined、canonical name/label；颜色后续 updateNode 是整体 style 替换。这里的 ie 是文档保存调用，不能当作 takeSnapshot。 |

`eN` 不是简单的 `selected`。source selection effect / useOnSelectionChange 要求唯一选择当前组，且非框选；reference-pick / mark / focus 的 source id 可另行触发。renderer `t3=eN || (standalone && 唯一选中的direct image child)`。只有非 readonly、t3、视频面板未打开、标题编辑结束后200ms冷却已结束才绘 toolbar。character toolbar 优先于 standalone，再到 General；但当前 character helper 恒 false。

standalone 图片组采用独立 `ts` 工具栏，不采用这里的颜色/layout 控件。script-linked image/video 则采用 General：颜色/layout仍存在，run 模式与视频入口另外门控。无 sourceScript 的 image subtype 本身不使组成为脚本组。shot-breakdown 没有在此 General 分支排除，不能仅凭名字擅加资格限制。

## 完整菜单与纯字段

工具栏实际顺序为颜色、布局、分隔、执行/停止、可选批量视频、可选工作流、可选转分镜、解组、分隔、下载。没有数值宽高输入、比例、手工行列、preserve dimensions、模型或高级参数菜单。尺寸属于独立 NodeResizer。

颜色 palette（811579）为 `#7A7A7A`、`#E74C3C`、`#F28A2E`、`#F4B740`、`#2ECC71`、`#08B6DD`、`#3B82F6`、`#8B5CF6`、`#F63B97`、`#E6E6E6`。每格36px、内圆28px，5列、gap12px、面板padding12；当前颜色2px同色描边并offset2。再点当前精确颜色传 null，其他格传 hex；不是永久不能清除的选择器。toolbar 空色 swatch 为 `#B8B8B8`。

`t_`（770712）写 `{groupColor:value}`，并整体替换 group.style 为 `{background,border}`、写 zIndex=-1001。非空颜色背景 `${color}1A`、边线 `1px solid ${color}33`；空色调用 defaultGroupNodeBackground(data,null)，border 为 `1px solid var(--canvas-group-border)`。原 style 的 width/height 和其他属性不保留。data 的 name/params/layout 等其余字段保留。源码这层未显式调用 takeSnapshot 或 fit；不能由此宣称整个文档没有历史。

layout picker（812662）只有 grid/horizontal/vertical，未绘当前 layout 选中标识。菜单宽度 max-content、至少120px，padding4、行px12/py8、gap4。t1（789118）首先 takeSnapshot；空组返回不改图。真实 direct children 包含 hidden、temporary、reference 和 child-group，不按可生成类型过滤。只改 direct child 的局部 position，保留 parent/extent、各子尺寸、params、资源与边线；嵌套孩子不再次展开。

排序 tf（757036）：将 preferred childNodeIds 过滤到真实成员。过滤后数量等于真实成员数量才采用 preferred 顺序；否则全部按 `(data.name ?? '').localeCompare(...,{numeric:true})`，不是将不完整 preferred 追加缺失项。完整 preferred 中存在重复的坏数据会落入原 length 判断并追加 missing，导致重复项；本机纯计划应明确拒绝这种损坏图，不声称已等同源合法文档。

tm（756618）逐轴取 `measured?.width ?? width ?? 200`、`measured?.height ?? height ?? 120`。contentWidth/Height、ratio 和 data.nodeWidth 不参与这里的尺寸。0或NaN不是 nullish；本机不得静默换成默认尺寸，可对非法几何返回 invalid。不能将通用 calculateGroupLayout 默认 estimated 直接冒充此 renderer。

grid：uniform cell 取全部孩子逐轴最大尺寸，cols 默认 `min(5,max(1,ceil(sqrt(max(1,count)))))`；已有 storyboardManualGridCols>0 时 round 后夹1–5，manualRows 不参与普通 grid。origin=(36,66)、gap36。壳宽 `72+cols*cellW+(cols-1)*36`，高 `102+rows*cellH+(rows-1)*36`。tH 写真实有序 childNodeIds、data.nodeWidth/Height、groupLayoutMode='grid'、flow width/height 与 measured；style 删除 width/height，保留其他属性。普通分支不正规化孩子尺寸，也不写 content dims。

horizontal：从(36,66)按各自宽度加36排一行；壳宽72+各宽之和+间隙，高102+最大高。vertical：从(36,66)按各自高度加36排一列；壳宽72+最大宽，高102+各高之和+间隙。写 data.nodeWidth/Height/groupLayoutMode 与 flow/measured；保留整个 style（包括旧 width/height），也保留原 childNodeIds，即使实际排序用了 numeric fallback。group.position 不改。两者及普通 grid 均没有 requestFitViewToNodeIds。

标题 tS（768085）仅 guarded name patch。显示优先 name→character.roleName→label→组型默认。共享 NodeLabel（658000–662537）双击开启，focus/select input；Enter/blur trim 后仅提交非空变化，Escape还原；随后异步敏感词服务可能再改名，不能由纯计划伪造服务完成。输入阻止鼠标冒泡，非编辑标题没有阻止普通拖动。纯 rename 可复用既有 storyboard controls 的通用 group 分支，不复制第二套生命周期。

## 尺寸手柄与设置动作

NodeResizer（793297）仅非 readonly、非 standalone 图片且非 script-video；isVisible=eN，minWidth120/minHeight80，8px手柄、radius2。script-image 仍有手柄。tB（775227）的结束候选 `{x,y,width,height}` 使用组当前 parent-relative 坐标；不做比例锁定、自动网格或 fit。

空组仅写候选 position/width/height，不写 data.nodeWidth/Height/measured。非空组取全部真实direct children 的 tm bounds；left=max(0,12-minX)、top=max(0,12-minY)，组 position=(candidate.x-left,candidate.y-top)，width=max(candidate.width+left,maxRight+12)、height对应。data.nodeWidth/Height同步；若有 left/top，全部孩子 position 加补偿，保持因补偿产生的世界位置不变。没有 measured patch。RF尺寸事件另经 canvas handleNodesChange（21脚本878000–886805）应用；结束孩子尺寸事件可能调用其父组 pF/特殊reflow，不等同 tB。drag预览、历史和取消须由 caller 持有。

工作流按钮只在非 script-linked 时显示。已有 workflowUuid 显示更新，tV（775101）打开 modal `{initialTab:'update',initialWorkflowId,createScope:workflowScope??'personal'}`。没有已有workflow、真实 userTeamId且projectTeamId为finite正数时打开 team scope，其余 personal。此按钮本身不改 graph，也不是纯 data.workflowUuid 写入。当前无需账号的版本不能伪造团队/工作流服务。

run/stop：普通组启动 power confirm，确认后 `runGroupPipeline(groupId,{executionMode:'parallel',autoFocus:false,disableBenefitTags:getGroupParallelDisableBenefitTags(),concurrencyRetry:{}})`；运行中普通组直接 stop。script linked version 控制按钮文案/brand/手势提示，实际 tz 根据 image/video branch 与版本决定 regen plan/确认；它不是普通 layout 设置。详见脚本组独立审计。source-v1 批量视频还要求真实script、ready图片及linkedImageGroupId门控，不应在普通组新增 model dropdown。

解组 tL（770583–770712）先 reset 已有pipeline state，script-linked再unlinkStoryboard，最后调用 ungroupNode。它的 graph/world/edges 协议已在分组域审计，不应本批再写一套。下载 t4（790346）递归 group IDs、去重、按 isNodeDownloadable 判断；存在 childNodeIds（包括空数组）优先于 actual fallback。实际 click同样传 metadata IDs，只有空数组不下载。媒体需合法 action+非空URL，script需rows，text需content；hidden未额外过滤。下载进行中仅当前group显示红色停止/进度并cancel ZIP，其他组不误显示该状态。原水印/写服务边界仍适用。

## 普通组转分镜

General 按钮（818842）仅非script、非standalone，enabled要求真实 direct children 非空且全部 image（765105），不依陈旧 childNodeIds。t$（778316）没有2节点下限或25节点上限；不能套多选“创建分镜组”的2–25资格来缩减此源入口。

takeSnapshot后初始孩子按 numeric name排序，每张 params/settings 保留其他值并设 ratio='16:9'，清 contentWidth/Height；只有 truthy scriptRowHiddenUuid 才同时清该字段和 taskInfo。旧 `_explicitContentDims` 不在此步清除。flow/measured按ratio helper短边350、长边cap1050（16:9实际622×350）。组 subtype='image'、standalone=true、manualCols/Rows=ceil(sqrt(count))，buildGroupCountUpdate仅替换空名或源自动count名，保留自定义名。中文源自动名为 `分镜组 N 个节点`，来自 locale-zh 的 source strings。style 先合并原有效对象、改背景和border，随后tH会去width/height。

最终 tH仍依据 **已有 group childNodeIds完整preferred，否则numeric name**，不是初始 numeric sort强行覆盖preferred。uniform网格inset/gap4，至少48px cell，并写所有孩子contentWidth/Height和_explicitContentDims=true；若旧 storyboardPreserveChildDimensions=true，t$没有删除该flag，最终tH走variable grid，保留该分支的明确尺寸。其他组metadata、selected、parent、position、边线、refs均保留。之后 RAF发布 requestFitViewToNodeIds([groupId])。

fit消费：`0leiedr1esdbe.js` 102251只写pending IDs；`21_0xvlvkw1sz.js` 950781–951091实际fit padding .2、duration300、smooth、minZoom .6/maxZoom1，最多30 RAF等RF node lookup，然后清pending。只有转换有此fit；普通布局、颜色、标题和resize-end不新增fit。

## 菜单显示与调用层

主toolbar padding4、gap4、radius14；色trigger40px，普通按钮36px高、文字13px。wrapper baseOffset20+默认gap8，通过inverse zoom使屏幕尺寸与28px间隔恒定；dragging仅隐藏当前节点toolbar，不将所有选择组一并隐藏。

颜色/layout互斥，document mousedown outside关闭；`[data-popover-safe]`豁免。菜单portaled body、fixed、nodrag/nopan/nowheel，鼠标按下阻止冒泡。颜色左对齐trigger，上方8px；layout以trigger中心，上方8px。RF transform/node local position/dragging的订阅变化重测getBoundingClientRect。原实现没有 viewport clamp、Escape或键盘menu语义；本机可按现有共享popover补键盘和焦点，但须将此记作适配，而不是隐藏原位置协议。

## 已授权纯接口范围

新增 `src/features/canvas/domain/general-group-controls-model.js` / `.test.js`：

```js
planCanvasGeneralGroupControl({ nodes, edges, groupId, command, getNodeSize? });
// { valid, changed, nodes, edges, fitGroupId?, reason? }
// command: color(value: null | sixDigitHex), layout(mode), convertToStoryboard,
// rename(value) 委托已有通用group rename。
```

color/layout允许General实际的type=group、非standalone图片入口，包括source-linked的General分支。当前character helper恒false，不因characterAsset字段任意禁用。convert额外要求非script、非standalone、真实全部image且至少1张。纯层不实现team/workflow/generation/download/confirm/敏感词/协作服务，也不改历史或selection。resize-end源规则已确认，暂未纳入本次授权命令。

默认尺寸精确tm。若caller显式注入getNodeSize，是本机renderer几何适配，需记录调用范围；不能静默覆盖源measured-first。坏图、损坏完整preferred重复、非法尺寸或无资格入口返回valid=false并保持原nodes/edges。纯计划将源多步patch合并成原子图，caller在一次CAS提交后执行fit；这属于本机事务适配，不执行原站store副作用。

纯层 color 可消费六位hex（包括已有合法legacy颜色），实际UI仍使用10项source palette。extra guards拒绝0/负/非有限尺寸、坏参数对象、无效style与损坏ID，未对源不限制的普通转换新增25上限。copy/selection及全部edges均保留。重复同input无突变，已完成的layout/color再次投影保持changed=false；转换已变成standalone，重复命令按入口资格拒绝。

定向检查2026-10-12 01:31:44：新pure model **41项通过**（982ms），ESLint零警告；两份JS及owned审计Prettier通过。覆盖精确measured→stored→default、三布局/单孩子/空组、完整及不完整preferred、legacy columns、hidden/temporary/reference/nested孩子、script/character实际General门控、全style颜色替换与null清除、rename复用、单图和26图转换、ratio/explicit params保留、truthy row/task清除、转换最终preferred与preserve flag、自动/自定义名、坏图原子拒绝与重复layout无变化。没有运行原bundle或完整工程check，源码功能存在不代表原站服务已验收。

后续同批01:36:25纯模型末轮 **42项通过**，新增无关节点toJSON抛错的有效回归：changed判定先比较引用，颜色/布局/no-op不为小修改序列化无关整图媒体。此前41项为历史，不累加统计。最终整批275文件/2929项与完整构建通过，以及实际桌面/窄屏、完整App入口与明确差距见 [组操作验收](./canvas-general-group-controls-functional-audit.md)；没有运行原站bundle、账号或写服务，不代表大量节点性能基准已经通过。
