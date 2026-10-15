# Canvas 独立分镜图片网格源码审计

2026-10-11。本批仅静态读取已归档公开脚本；未运行原站 bundle、未登录、未使用小号或账号资源、未发送原站写入。实现位于 `src/features/canvas/domain/storyboard-grid-model.js`，纯数据模型不引用 React、store、services 或视图。Pointer、文档身份、历史和 UI 接线由对应 owner 维护。本文件不把纯模型通过等同于原站浏览器或真实服务验收。

## 证据位置

以下 offset 是原文件 UTF-8 解码后 Python 字符串的零基字符位置，不是行号。

| 文件                               | offset / module                            | 证据                                                                                |
| ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `research/source/1eqsg-pmc0mun.js` | 93471–97790，836105                        | 网格列数、槽数、容量、子尺寸、uniform / variable 布局、最近槽、中心点目标、稳定顺序 |
| 同文件                             | 93471，59212                               | 脚本生成分镜另用 40px padding、40px gap、70px top；不能套入 standalone 的 4px 网格  |
| 同文件                             | 97790–100700，959759                       | 普通组 layout 和真实 parent children；与 standalone 网格布局不同                    |
| `research/source/04q9x43g2p9-v.js` | 27856，662493                              | `STORYBOARD_IMAGE_GROUP_LAYOUT_INSET=4`、`...GAP=4`                                 |
| 同文件                             | 30641，365256                              | `estimateNodeFlowSize` 优先 `pickExplicitContentDims(true,data)`                    |
| `research/source/21_0xvlvkw1sz.js` | 697578–700650，mQ / mZ / m3 / m4 / m5 / m8 | image-derived 门控、逐图容量、preview 初始化与保留维度、1600ms 满容量提示限频       |
| 同文件                             | 911000–913813，M / A / P                   | ratio、其他子节点预览位置、group live size、离开 preview                            |
| 同文件                             | 913813–918100，L / D                       | 父组内初始化、node flow center 命中、进入、离开、重排、Alt 排除                     |
| 同文件                             | 918840–921550，handleNodeDragStop          | 松手时重新检查容量，落 slot / parent / ratio / explicit dims / group metadata       |
| `research/source/1kb-4b4zv9_2a.js` | 约 100–1850，713118                        | ratio 读取、parseInt、350 短边与 1050 长边上限                                      |
| `research/source/3u6hjewm8qox_.js` | 71506，696507                              | `buildStoryboardGridChildExplicitDims` 仅返回 marker 与 contentWidth / Height       |
| 同文件                             | 318620，612574                             | 生成的组计数名称更新，保留自定义名称；源含翻译字符串识别，本地当前使用中文          |
| 同文件                             | 756700–758350，tf                          | 组 renderer 的实际 parent children 顺序，完整 preferred 顺序或名称 numeric 排序     |
| 同文件                             | 763349–765650，e0 / e3                     | 图片占位槽与 actual membership signature，不把旧 childNodeIds 当真实父级            |
| 同文件                             | 776058–778450，tH / effect                 | standalone membership reflow，48px 下限、明确维度、空组不触发 effect                |
| `research/source/0dcagfa-j870b.js` | 15816，912910                              | marker 必须为 true，两个 content 轴必须 number、finite、>0，才返回 explicit 尺寸    |
| `research/source/3u6hjewm8qox_.js` | 859049 / 1607945                           | image / video renderer 调用 explicit helper；video 尚有特定 scene 的数据排除分支    |

## 容量、尺寸和槽

自动列数为 `min(5,max(1,ceil(sqrt(max(1,count)))))`；正的手动列数先 round 再夹到 1–5。自然行数至少为 `ceil(count/cols)`，有限的手动行数 round、夹到 1–5 后只可扩大行数。因此 layout 本身的自然行数可以超过 5；“最多 25 张图片”由接收容量单独保证，不能简单把所有 rows 截到 5。

两个手动轴均为有限数字时，固定容量为两个 `clamp(round(value),1,5)` 的乘积。此处 0、负数仍夹到 1，与列数解析时非正 manualCols 退回自动不同。未提供两个有限手动轴时，当前图数小于当前槽数可接收；槽已占满且下一张不会增加槽数才满。图数达到 25 始终满。Canvas mZ 对每张 incoming 顺序检查并递增计数，auto 网格可以扩容，固定网格超额时整批拒绝。已有组内图片重排不受 incoming 容量阻断。

接收容量只统计图片；m4 preview 的 layout / order 却包括目标组的所有直接子节点。不能用所有子节点数量替代图片容量，也不能凭“仅图片界面”丢弃现存非图片子节点。

`getStoryboardImageGridChildSize` 每轴独立读取正数 `data.contentWidth/Height`，其次 `measured`，其次 stored width / height，再以 200 / 120 作 nullish fallback。该 getter 不依赖 `_explicitContentDims` marker，0 的 measured 也不会被 nullish fallback 替换。空集合 cell 为 200×120；非空集合取各轴最大值，可以小于 200×120。

uniform 布局每边 inset 4、gap 4；slot 左上位置为 `4+col*(cellW+4)` / `4+row*(cellH+4)`，group 尺寸为 `8+cols*cellW+(cols-1)*4` / 相应 height。传入的是保留槽总数，而非只占用的图片数，所以最后一行和手动预留的空行列参与组尺寸。

preserve 模式按 order 对每列取最大 width、每行取最大 height。非空列 / 行可低于默认尺寸；没有正尺寸的列 / 行采用至少 200 / 120 或全体尺寸最大值。每个 slot size 是其所在列宽与行高。拖动重排后必须重算这些列 / 行，不能只调换 slot ID。

## 命中、预览和松手

目标 helper 只接受 `type==='group'`、`standaloneStoryboardImageGrid===true`、`storyboardGroupType==='image'`。源使用 node flow box 中心，不使用鼠标落点：measured→stored→200 / 120（0 退默认），position 加直接 parent position，再加半个尺寸。目标 group 使用 stored width / height 优先 measured，inclusive 边界，命中多个目标选最小面积；同面积保留 graph 顺序第一项。helper 不过滤 hidden，也不递归转换 parent 世界坐标。这个局部坐标行为按源码保留，不宣称嵌套组世界命中已完全解决。

m4 builder 自身只要求 standalone flag，目标 subtype 由调用方门控。这与 strict hit helper 不同。已有父组内 image 起拖时，源父组门控为 group + standalone；初始 slot 优先 childNodeIds 中当前节点的 index。其他孩子采用完整有效 preferred 顺序；不完整时以 y 差严格大于 8px 比较 y，否则比较 x。源低层 preferred helper 只检查过滤后的数量，重复 ID 可能复制相同 child；本地 preview 的原子校验拒绝这一损坏顺序。

A 预览只移动 order 中除 dragged 外的节点，并更新 group width / height / measured；不修改 group childNodeIds、nodeWidth / Height 或 parent。P 离开预览先去掉 dragged，非空时以 `max(remainingCell,oldCell)` 保留 uniform 最大尺寸，再读取当前 group 手工行列重新排槽。preserve 路径保留 preview 捕获的 childDimensions / manualCols。空剩余时 P 提前返回，只改 isInside=false / draggedSlot=-1，保留旧 order（仍含 dragged）、槽和组尺寸；松手时再过滤 departed ID。不能自行删除空组或把它缩成零尺寸。

最近槽使用 slot 中心的平方距离，strict `<` 保留首个距离相同的槽，最终插入 index 夹到剩余 order 长度。进入另一个成功目标时，源直接替换 active preview，不先 P 原目标；新的目标拒绝 m4 时则必须 P 旧的 inside preview，避免松手把 dragged 吸回旧组。离开后重新进入会重新创建 preview。

松手成功写 dragged slot，incoming 改 parent、清 extent。group 落完整 childNodeIds、nodeWidth / Height、groupLayoutMode='grid'、生成计数名称和 flow / measured 尺寸，自定义名称保留。松手前重新用最新 manual 行列和实际其他图片数检查容量；若已满或 preview 节点变成非图片，源执行离开 preview、detach，并保留剩余 group。普通非图片命中不建立图片 grid preview；普通 containment 和 image-only 提示由上层 drop 协议处理。

本模型提供 `prepareStoryboardGridDrag({nodes,draggedId})`、`updateStoryboardGridDrag({nodes,draggedId,context,getNodeSize?})` 与 `finishStoryboardGridDrag({nodes,draggedId,context})`。前两者返回纯 nodes projection 与不可变 context `{draggedId,preview}`；finish 返回与普通 drop planner 兼容的 nodes / kind / transitionIds / sourceGroupIds。controller 必须在最终位置投影后再 update，然后 finish；不能在 React updater 内修改外部 ref、重复生成 context，或以最初 context 覆盖外部参数更新后的实际已提交 preview。

本批 session 对应 ordinary node 的 L / D / active preview / stop。source L 的网格初始化没有 selected / dragged 数量小于 2 的限制：排除 Alt 多选复制 x、Alt 单复制 I、group / video_group / temp / 不可复制 C 和特殊模式之后，只要 primary image 已在 standalone 父组即可建立 k。唯一 selected 的 w 与未选 primary 的 S 只用于单 Alt / layer composition 门控，不能移用为网格资格。active k 松手分支位于 node multi 分支之前，所以从既有网格 child 发起普通多选也可能先消费 primary preview。没有 active k 的 node multi 与虚拟 frame Z / m3 无 slot attach 是另一套协议，即使目标是 standalone 也不能擅自改成 single preview；由特殊 drop owner 记录与实现。

## Ratio、explicit content 与来源字段

M 仅处理 image；目标为非 video 的 image-derived group（image subtype、sourceScriptNodeId 或 standalone flag）且 preserveChildDimensions 不为 true 时才统一 ratio。优先 childNodeIds 首个真实其他 image，随后 graph 顺序第一张其他 image。ratio 依次为 settings.ratio、settings 自有属性顺序中的 ratio*、settings.aspectRatio、params.aspectRatio；trim 后空值与精确 'auto' 跳过，均缺失时 16:9。

ratio 尺寸采用 source parseInt，两项正数才有效，短边 350，长边 round 后上限 1050；16:9 为 622×350。保留当前 params / settings 其他字段，只更新 ratio，清 contentWidth / Height。sourceScriptNodeId 用于目标资格，不复制到新 child，不编造脚本关联或边。

standalone stop 在 ratio 之后写 `_explicitContentDims:true` 与 preview cell contentWidth / Height；该 helper 不直接覆写 flow width / measured。两套字段含义不同：文档仍可以保存 622×350 的 ratio flow 字段与 200×120 的 explicit display 字段。原 image / video renderer 有 explicit 尺寸优先路径。手写 renderer 可以用 marker + finite 正数 content 双轴适配显示 / 世界边界 / 连线 / 小地图，不能为迎合当前 DOM 把源 flow 字段直接改掉。video 的特定 scene 排除条件不在本批完整复刻范围。

## Membership effect 与本机原子边界

源 standalone renderer 的 e3 signature 从实际 direct parent children 读取；旧 childNodeIds 只作为实际成员的优先顺序。非空成员 signature 变化才调用 tH：完整 preferred order，否则名称 numeric 排序；uniform cell 最小 48；preserve 使用 variable 布局并同步每张 child flow / measured 与 explicit content。tH 写实际 childNodeIds、nodeWidth / Height、grid layout、group 尺寸，并移除 group.style 的 width / height。空组 signature 为空，不触发 reflow。该层与 L/D 预览的 y/x 顺序、无 48px 下限以及空 P 行为分别记录，不能混为一套。

`reconcileStoryboardGridMembership({nodes,groupIds})` 单独实现该纯 reflow，返回 `{valid,changed,nodes,reconciledGroupIds}`。caller 只在实际非空 membership / order signature 改变时调用；helper 本身不建立 React effect、监听或另一条历史。多个 requested 组作为一次原子规划，任一损坏尺寸或重复 preferred order 返回原 nodes，不留下前一组的部分写入。它按传入的最新 nodes 实际成员布局，所以新加入的成员不会因旧 metadata 缺项而丢失。

session stop 不自行把所有父组的旧 childNodeIds 清掉；旧 standalone 组的 membership reflow 由上述独立协议承担，普通 / 脚本派生父组不能仅凭此证据扩展。空 actual children 不触发 source effect，helper 也保留原几何 / metadata；视图应按真实 parent 身份取 child，避免旧 metadata 引用造成重复显示。根层接线与自动 reflow 的实际验证另见批次记录。

本机额外边界包括：图 ID / 位置合法且唯一；preview 不得重复或遗漏实际目标 child；外部新增、删除、reparent 目标成员或改变 dragged parent 时，update / finish 返回 `valid:false, reason:'stalePreview'`，原样保留最新 nodes，禁止部分覆盖 childNodeIds。参数变更而成员不变可继续用最新 graph 和已提交 context。source 内部写入可依赖 store 协调，本机异步上传和 React 队列不能据此丢弃新成员。这些校验是本地原子适配，不冒称源 malformed / 并发行为完全一致。

低层几何 helpers 以正常有限尺寸和整数节点 / 槽数量为调用契约；源 getter 对 content 正数不额外验证 finite，本地 preview 拒绝非有限或负尺寸。batch capacity 额外拒绝非法 incoming 数量。可选 getNodeSize 仅为手写 renderer 的中心尺寸适配，默认保留源 measured→stored 规则，不修改文档 flow 字段。

Alt live copy、practice、locked、readonly、mark / focus 和 group / video_group 的 preview 排除由 Pointer / stage caller 按 source 门控，不塞进纯几何。取消、切文档、失去 ready 和迟到回调由 owner 撤销预览 / 旧手势；同次历史、raw graph CAS 与 keyboard 权限继续沿用既有协议。本机 4px 起拖阈值是此前明确的手感适配，source RF 默认为严格大于 1px；本模型不另加阈值。

## 定向验证

2026-10-11 22:24:32 Asia/Shanghai，单文件 Vitest **56 / 56** 通过；这两个 JS 文件的 ESLint 与 Prettier 通过。覆盖 reserved slots、自动扩容 / 固定容量整批拒绝、content / measured 优先级、variable 行列重排、inclusive 最小面积命中、ratio 保留参数、同组 / incoming / leave / reenter / 空组、跨目标满容量脱离、最终容量变更、真实 flow / explicit display 分离、外部成员增删 / reparent 原子拒绝，以及 actual membership 重排 / 48px 下限 / preserve flow 同步 / 多组原子失败。未重跑全量 check，未据这些测试宣称实际浏览器、触控手机、服务写入或所有分镜操作已验收。
