# Canvas 分镜组设置、布局、尺寸与标题源码审计

2026-10-11。本批静态读取保存的公开源码，不运行原 bundle、遥测或生产写入，不登录、不使用小号或账号资源。先核实 renderer 与实际入口，再新增独立纯模型；没有把源码中所有组分支外推到本机已经存在的组。纯协议落盘不代表真实生成、费用、协作写入、手机或整个复刻目标验收完成。

## 证据位置与组型

下列 offset 是归档 UTF-8 文本解码后 Python 字符串的零基字符位置，不是行号。

| 文件 / offset                                                                                                  | 确认的证据                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `3u6hjewm8qox_.js` 761187–796541，模块 414356 `tC`                                                             | GroupNode renderer，真实 children 订阅、组型、工具栏与标题，依赖以下 callbacks。                                                                                               |
| 同文件 762586–7629xx `eA/e_/eG/ez`                                                                             | `e_=Boolean(sourceScriptNodeId)`；`eG=Boolean(standaloneStoryboardImageGrid)&&storyboardGroupType==='image'`；`ez=(e_&&storyboardGroupType!=='video')                          |     | eG`。非 standalone 的 image subtype 本身并不让 renderer 变为脚本组。 |
| 同文件 7649xx `e2`、7650xx `e3`、7669xx `e8`                                                                   | 普通组转换资格为真实非空 direct children 全部 image；standalone membership signature 是实际成员 / 有效 preferred order；当前比例是第一实际 image 的 params ratio，缺失用16:9。 |
| 同文件 7903xx `t2/t3/t5`、7937xx toolbar                                                                       | `t2=eG                                                                                                                                                                         |     | scriptVideo`；`t3=eN                                                 |     | (eG&&唯一选中的direct image child)`。readonly 不绘工具栏；生成视频面板打开或标题编辑结束后200ms内隐藏。character toolbar优先，随后 standalone `ts`，其他组 `GroupNodeToolbar`。 |
| 同文件 6798xx–680267，模块 464025 `useShouldShowGenerator`                                                     | 单一选中当前组且非box-select，或 reference/mark/focus 的明确 source，是 eN 的来源；不能只按 group.selected 泛化所有多选下的工具栏。                                            |
| 同文件 742955 `e8` / 743411 `e9`、745075–754xxx `ts`                                                           | standalone 实际比例只有21:9、16:9、4:3、1:1、3:4、9:16；宫格presets2/3/4/5方格，自定义1–5行列。没有 preserve/model/color 控件。run/stop只在 sourceScript-linked 时显示。       |
| 同文件 803819–820964，模块 970683                                                                              | 普通/脚本组工具栏：颜色、grid/horizontal/vertical、整组执行/停止、source-gated批量视频、工作流、转分镜、解组、批量下载；不包含独立组比例/手工宫格菜单。                        |
| 同文件 768085 `tS`、719133 `ev`、7950xx title                                                                  | 标题变化走 guarded `{name:value}` updateNodeData；标签优先 name→character roleName→label→按组型默认。外壳上方标题经 NonScaledWrapper 保持屏幕尺寸。                            |
| 同文件 775227 `tB`                                                                                             | group手动resize结束，不同于布局或拖动grow-only pF。                                                                                                                            |
| 同文件 776058–778316 `tH`                                                                                      | 显式重排入口。对普通/脚本组用 tg；对 standalone 使用 uniform/variable 网格，包含空组；与非空membership effect不同。                                                            |
| 同文件 778316–779915 `t$`                                                                                      | 普通组转独立分镜组，16:9、清脚本行相关字段、方格行列、背景及RAFfit。不是本批 convertToNormal 的反向泛化。                                                                      |
| 同文件 779915–780437 `tW`                                                                                      | 比例变化：snapshot→全部实际image→清preserve标记→params/settings ratio + 清content双轴→flow/measured→tH。                                                                       |
| 同文件 780437–781564 `tK`                                                                                      | 手工行列：snapshot→固定容量溢出处理→tH→右侧竖排→immediate flush→RAFfit。                                                                                                       |
| 同文件 781564 `tY`、782104 `tq`、782205 `tX`                                                                   | 拼接服务、序号布尔开关、确认后清空实际孩子。                                                                                                                                   |
| 同文件 782871–7868xx `tZ`                                                                                      | 转普通组：确认后捕获 owner / 字段与有序孩子指纹、异步读实际尺寸、二次核对、groupNodesSerial原子变更。                                                                          |
| 同文件 789118 `t1`                                                                                             | 普通/脚本工具栏 layout 回调。grid转tH；horizontal/vertical用36padding/gap和66top，写groupLayoutMode。                                                                          |
| 同文件 770583 `tL`、771xxx `tU/tG/tz`                                                                          | 解组先reset已有pipeline，再按sourceScript unlink；重新生成与普通pipeline、费用确认和停止分支不同。                                                                             |
| `04q9x43g2p9-v.js` 27856，模块662493                                                                           | 普通renderer布局：padding36、gap36、top66、resize最小padding12；standalone inset/gap均4。不能套创建或拖动pF的20/56。                                                           |
| `1eqsg-pmc0mun.js` 93471–97790，836105；97790–100207，959759                                                   | 手工capacity与uniform/variable primitives；共享calculateGroupLayout默认estimated协议与renderer tm measured协议有差异。                                                         |
| `1kb-4b4zv9_2a.js` 约1200–1800，713118                                                                         | natural尺寸短边350、长边cap5600；ratio尺寸短边350、长边cap1050；round与ratio提取。                                                                                             |
| `0leiedr1esdbe.js` 42111 `Q`、88520 `im/iv`、105464 `deleteNodes`、107764 `deleteNodesBatch`、137625模块306449 | 批次删除先扩一次segment-remake dependents，实际delete再扩一次；删除真实节点及入出边，释放未删孩子，清linkedImage/VideoGroup指向；mutateBeforeFlush在删除后执行。               |

普通 group、script-derived image group、standalone image group 的入口必须分开：

| 组型                                                       | 实际设置入口                                                                          | 不能外推的功能                                                                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 普通group                                                  | 普通toolbar的颜色、三种布局、pipeline、工作流、全图像时转分镜、解组/下载；标题/resize | 没有 standalone 比例、手工宫格、拼接、序号/清空/转普通组。                                                                                             |
| script-derived image group（sourceScript truthy、非video） | 普通toolbar样式，script regen与版本门控的批量视频；标题/resize/普通layout             | 没有 standalone `ts`，不能因 data.storyboardGroupType==='image' 就加宫格控件。                                                                         |
| strict standalone image group                              | ts的比例、手工宫格、拼接、序号、清空、转普通组、解组；标题、空槽                      | 不显示普通color/model/pipeline；也不绘NodeResizer。pure standalone没有run/stop；source-linked standalone比例锁定、隐藏转普通组，仍可调宫格/序号/清空。 |

UI、菜单定位/悬停、键盘与焦点的独立审查由 toolbar owner 与 integration reviewer记录；本文件以调用数据协议为主。当前本机入口是代表性独立图片组；script / character / video分支不据源码存在就称已经接入。

## 明确数据变更

`tH` 取全部实际 direct children 的 tf顺序：如果 childNodeIds过滤后的preferred覆盖全部成员则采用该顺序；否则按name.localeCompare numeric排序。它不只取image，不依旧metadata生成额外孩子。standalone uniform取child content双轴优先、measured→stored→200/120，逐轴最大值且cell至少48；preserve=true取variable列宽/行高，并将各child flow/measured与明确content尺寸同步。组写真实childNodeIds、nodeWidth/Height、groupLayoutMode='grid'、width/height/measured；style.width/height移除，其他style保留。

显式 tH(empty) 与 membership effect(empty) **不同**。effect以空signature不调用；grid/clear直接调用时，uniform从当前壳与新槽数反算cell，至少48，通常保留壳几何；preserve=true用空variable布局的200/120回退。不会删除组。空壳也写childNodeIds=[]及nodeWidth/Height/grid metadata。

`tW` 只改真实image的ratio params，保留prompt/model/settings其他键与资源。node contentWidth/Height先清除，flow/measured按所选ratio写，再tH把最终明确content尺寸写回来；不是最终永久删explicit marker。组preserve字段删除而非写false。没有image时只发生source snapshot，不改图或preserve字段；源码无fit。

`tK(cols,rows?)` 一个轴时删除manualRows、按自然行数布局，不裁图。两轴时仅strict standalone的实际image超出fixed capacity才溢出：按tf保留前N图；后续图清parent/extent，源先用group.position+child.position脱离，再写manual和保留ID、tH。读取更新后组右边，溢出图按照原顺序在x=group.x+group.width+100、y=group.y开始竖排；每项y加该图measured.height→stored.height→120，再+100。这里忽略content height；不能把网格cell尺寸当作溢出间距。边线与params、scriptRow字段、名称、资源不改。overflow才immediate flush，所有有效grid command会RAFfit组。

`tq` 仅 `{showStoryboardShotNumbers: !current}`，没有layout、历史snapshot或子节点批量patch。新pureplan不把开关实现为给每张图改名或添加数字文本。

`tX` 在确认后的当前图取全部direct children；无孩子直接返回。deleteNodesBatch原子列表中的孩子删除后清group.childNodeIds，再tH(empty)。保留组与其名称，不以计数名自动改成0；所有删除节点入出边移除。source通用删除还包含segmentRemakeLock=true且editing draft.sourceNodeId与已删source匹配的下游，iv在batch plan和delete各做一次snapshotpass，不能按edge顺序临时无限扩展。删除legacy child-group时未删的后代清parent/extent并释放位置；surviving linkedImageGroupId/linkedVideoGroupId指向已删ID时清掉。服务锁/flush、portrait removal、任务与引用UI同步由caller继续持有。

`tZ` 的有序指纹逐项为 `{id,parentId,type,displayUrl,contentWidth,contentHeight,fallbackRatio}`。displayUrl取data.url数组中第一个非空string，未用originalUrl；group指纹仅sourceScriptNodeId、storyboardGroupType、standaloneflag、manual两轴、preserve。position/measured/selection/name/prompt不在原指纹里。

转换每张实际孩子的尺寸优先有效persisted content pair，其次异步Image读取后**natural→flow**的计算结果，再ratio fallback（缺ratio16:9）。所有类型孩子都会正规化flow/measured与36/66普通grid位置；只有image更新explicit字段：旧preserve=true则明确尺寸保留，否则删除flag/content双轴。组删除standalone/manual/showNumbers/subtype/preserve字段，style去width/height，保留其他style、name/childIds、nodeWidth/Height/groupLayoutMode等源未清字段。非空组按tg新ordinary grid写壳flow/measured，空组保持几何。源没有fit。

source-linked转换在原tZ还通过unlinkStoryboard改脚本linked组、group sourceScript/storyboardTitle和相应edges；但ts明确隐藏这个入口。纯模型针对已确认入口返回scriptLinked拒绝，不提供服务动作或把任意脚本组转换冒充独立组。转普通确认、owner/文档、Image cancellation、groupNodesSerial与历史由Rootcontroller负责。

## Resize、普通layout、标题、model与batch边界

`tB` 对真实children用tm measured→stored→200/120求局部min/max。minX或minY<12时补偿左/上；组position按resize候选减补偿，width=max(candidateWidth+left,maxRight+12)、height对应。非空组data.nodeWidth/Height同步、子节点位置补偿；空组只写候选position/width/height，不写metadata。它没有tH网格逻辑，也不是grow-only pF。不应借此为standalone新增拖拽尺寸手柄。

普通/脚本`horizontal`与`vertical` t1以tm的measured-first布局，不改child params/content；group写flow/measured、nodeWidth/Height/groupLayoutMode，保留整个style。grid的tH则去style尺寸。这些和本机旧data.layout字段不同；本批仅独立组controls纯模型，没有顺带重写普通toolbar或通用layout。

标题 tS只发guarded namepatch。UI labelInput的Enter/Escape/blur/焦点/拖动隔离另由owner核对；pure rename保留caller传入字符串，不擅自trim或设字符上限。标题默认不代表graph name已被持久化。

这层group toolbar没有直接model dropdown。model选择出现在source-v1脚本图片组“批量生成视频”的eM面板（约720xxx–725xxx），可见性要求脚本关联、非v2、ready图片>0且linkedImageGroupId匹配。面板默认优先support.storyboardVideo中kling-v3-omni、否则首个支持项、再全局默认；按schema确定singleImage2video/image2video/text2video，settings保留resolution和兼容ratio，模型/参数与300ms费用查询相互独立。其onGenerate交eZ，经过portrait合规、owner、保存后创建新video group/children/refs/link，不能实现成更改原图片组model字段。

整组regen的tU/tG读取实际children并建run plan；图片prompt来自source rows，保留已有params，已有URL且任务没有失败的孩子不重跑。普通pipeline、v2平行计划、v1 simple regenerate确认、费用/停止确认有独立协议。standalone无脚本在ts不绘此按钮，即使tz内部ez可为true；不能从内部branch给纯独立组新增运行按钮。本批纯model不处理run/stitch/color/preserve command，调用者须使用各自已确认的controller/service，而不是回传假成功。

## 纯接口与本机边界

新增 `src/features/canvas/domain/storyboard-group-controls-model.js`：

```js
planStoryboardGroupControl({ nodes, edges, groupId, command, dimensions });
// {valid,changed,nodes,edges,reason?}
// grid另有 fitGroupId / detachedIds / immediateFlush
// clear另有 removedIds

captureStoryboardGroupControlSignature(nodes, groupId); // exact tZ object，坏图/顺序为null
computeStoryboardNaturalDimensions(width, height); // {width,height}, 350 / 5600
```

command为aspect(value)、grid(cols,rows?)、toggleShotNumbers、clear、convertToNormal、rename(value)。除共享group rename外，其余必须是type=group、standalone=true、subtype=image；source-linked aspect/convert拒绝。aspect只接受ts的6项，grid只接受UI的1–5整数，rows缺省支持原单轴callback。没有普通/派生组fallback，valid=false保留原nodes/edges。

`dimensions` 是 `Map<nodeId,{width,height}|null>` 或同shape plainrecord；值是caller已读取并经natural helper计算的flow尺寸，不能直接传原natural px。有效当前contentpair优先于mapping，null/缺失用ratiofallback；用到的损坏mapping拒绝。pure层没有Image、URLfetch、缓存、storage、notify、confirm、React或history。

完整多选/Strict updater可安全重放同input。Root在新的raw graph CAS内一次commit、按removedIds更新实际选择，grid的fit/immediateFlush在commit确认后执行。source单文件顺序操作在本机合并为原子nodes/edges projection；不允许中间dataPatch成功、后续几何失败时发布部分图。

本地额外guard包括唯一IDs/finite positions、child preferred order不重复、非有限/负布局、非法params及dimensions。嵌套local文档的溢出与删除后代使用recursive world position；原tK/306449使用直接parent.position，通常root组。这是明确本机坐标适配，不把它宣称为原nested语义完全一致。自然尺寸helper另守finite并方形回退；原bundle只判非正值。服务权限/协作锁、task取消、portrait/生成/费用和原生手机布局不由pureplan证明。

## 验证

最终定向检查2026-10-11 23:21:09，纯controls **64项通过**，ESLint零警告、三份owned文件Prettier检查通过。涵盖6比例、preserve清除和explicit最终reflow、legacy成员、manual容量/源顺序/溢出flow间隔、单轴自然行数>5、empty显式tH、script锁、开关/标题、清空入出边和两次snapshotcascade/后代释放、转普通persisted/loaded/ratio优先级与style/metadata、natural5600及exact async signature、source entrygate和原子坏图。首轮静态检查发现一条布局guard误放在return后，已移动到实际empty-layout路径并重验。没有重跑完整工程check。

Rootcontroller、toolbar、实际页面/历史/焦点/异步取消及原生桌面/390px验证另见整合审计，不以pure tests代替原站服务或全部组renderer验收。

后续fit核对：`3u6hjewm8qox_.js` @780880/@781513 的tK pending-focus，经`0leiedr1esdbe.js` @102251 发布，实际消费在`21_0xvlvkw1sz.js` @950781：padding .2、duration300、interpolate smooth、minZoom .6/maxZoom1；最多30次RAF等待RF lookup后清pending。Root fit helper只新增显式上下界选项，普通默认.1–8保持；本机目前同步已提交图fit，不宣称原RF lookup生命周期相同。真正2K保存/4K显示、确认/undo、标题capture与窄屏适配见[整合验收](./canvas-storyboard-group-controls-functional-audit.md)。
