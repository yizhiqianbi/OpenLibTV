# Canvas 多选输出连接源码审计

2026-10-11。只读分析已保存公开客户端，不执行原 bundle，不登录、不使用账号资源。本文件讨论选区/普通组右侧输出手柄、多选拖线与共享目标创建；批量生成运行器属于另一协议。字节位置按当前保存的 UTF-8 JavaScript 字符位置记录，便于用短片段复核，不是浏览器运行时断点。

## 原始证据入口

| 文件/模块 | 证据 |
| --- | --- |
| `research/source/21_0xvlvkw1sz.js`，约 181050–193800 | `nB` 多选加号、`nq` 自动平移、`nK` 多源连接预览、`nY` 六项候选、`nJ` 完整手势与菜单 |
| 同文件，约 897250–901000 | `handleTryConnectMultiSelectAtDrop`、`handleMultiSelectConnect` 的共享目标/边提交 |
| 同文件，约 965710 | 虚拟选区与单个真实普通组分别接 `nJ`；真实组排除分镜/脚本派生组 |
| `research/source/1xj2-x_wy8_8a.js`，模块 516779，约 19612–41400 | action 矩阵入口 `T/v`、直接媒体收集 `m`、`canMultiSelectCreateNode`、`validateMultiSelectConnection` |
| `research/source/16k_l1hir0zic.js`，模块 189224，约 27400；另见 `2nko6splgjkeq.js` 约 68400 | `getBatchConnectionSourceNodes`、真实组递归输出、single-real-group 与 virtual-selection |
| `research/source/2yyck7brx0tqq.js` / `1bflqug4ccoei.js`，模块 946321 | `NODE_HANDLE_EDGE_GAP=5`、`NODE_HANDLE_VISUAL_OUTWARD_EXTENT=25`、`NODE_HANDLE_VISUAL_SIZE=20` |
| `research/source/0leiedr1esdbe.js`，模块 417754，约 8554 | `collectIncomingNodeData`：直接节点资源计数；不自动展开普通组 |
| 同文件，模块 469850，约 22519 | `getBestEnabledModeType` 与 subject shared limit |
| 同文件，`addEdges` 约 114876 | 原始追加边，不执行普通单连 DFS cycle/反向重复检查 |
| `research/source/3u6hjewm8qox_.js`，模块 386951，约 647342 | 多选 hover 采用 `selectIsAnyConnected`；已有任一关联就显示 frosted，而实际 drop 可继续连接其余源 |

## 选区与真实组的两层源规则

`resolveVirtualSelection` 会先把所选普通组换为**直接孩子**，与所选非组节点去重；这是虚拟选框/移动协议。单个真实普通组加其后代的选择不产生虚拟选框，改用真实组输出。

之后 `getBatchConnectionSourceNodes(selection,nodes)` 仅按 `selection.targetNodeIds` 筛选当前 nodes，排除 `data.type=REFERENCE`，保留图谱顺序；它不再次展开组，也不要求 `data.action`。真实组的 `getGroupBatchConnectionSourceNodes` 则按 `parentId` 递归找到普通 `GROUP`，最后输出其非组/non-reference 后代，可只有一个节点。分镜组、脚本派生组的入口门控属于 caller，不是普通组递归函数擅自判断。

本地对应 `getCanvasMultiConnectionSources(nodes,seedIds)` 与 `getCanvasGroupConnectionSources(nodes,groupId)`。前者消费 virtual-selection 的 `sourceSeedIds`，不复用 `batch/model.js` 的执行树/旧 `childNodeIds` 展开；后者只按当前 parent 关系递归。`connectionNodeType` 支持本地历史 `node.type` 回退，属于数据兼容。

原 `nJ` 的手柄是否出现取决于匹配源集合 `D.length>0`，不是 action 资格过滤后的长度。资格只影响菜单 disabled 和目标/drop 验证。

## 手势、位置、预览与菜单

- 只有选区右侧下游输出手柄；不能照搬普通节点双向 input/output。按下仅接受主按钮，记录屏幕坐标与时间并捕获 pointer。移动距离 **≥10 屏幕 px** 才进入拖动；短按 `<300ms && distance<10` 切换菜单，长按静止不操作。
- 拖动设置多源 IDs，并通过 `elementFromPoint().closest('.node-shell')` 找 hover 目标。自动平移用独立 `edgePx=80` / `maxSpeedPxPerSec=720` / `maxDtSec=.05`，按屏幕边界线性加速，首帧 dt=0，平移后重算 hover；不能沿用普通单连 40px 区域/固定帧速度。
- `nK` 用每个真实源节点右边中心到原始 cursor 的屏幕 Bézier；世界位置取 ReactFlow `internals.positionAbsolute`，尺寸 measured→stored→默认 300×200。控制点偏移 `max(.5*abs(dx),40)` 屏幕 px，主线 2×zoom，蓝色流动段 4×zoom，body portal 固定 viewport SVG。没有普通单连的目标 snap。
- 交互 hitbox 是 80×80，圆形视觉是 24×24；图标 14px、stroke1.6。hitbox 左边锚定 selection-right，圆内部平移 `5+12−40=-23`，圆中心在选区右边 **+17屏幕px**。非交互圆的左边是锚点 +5；这里 25 是普通手柄 outward extent，不能误作 edge gap。hover 跟随限制 ±28px，80ms scale1.1，离开 400ms 回位。
- 松手把屏幕位置转换为 flow 点，先尝试连 existing target。drop 接口用 release-flow 的 1×1 rect，取 intersecting nodes 最后一个，排除来源 IDs 和 GROUP。若验证失败、全已连接或协作锁失败返回 false，打开创建菜单；成功清 release point。全部源/目标协作锁先检查，失败不部分添加。
- 空白 drop **不创建普通临时 temp 节点/edge**。它保留 flow release 点，在菜单打开期间画 24px 非交互圆和 N 条 viewport preview。短按菜单没有这些空白预览。
- 菜单独立 196px、radius16、padding8/gap4、32px 行、13px 正文、14px 图标、disabled opacity30。短按 `left=flowToScreen(selection-right).x+20`，空白拖放 `left=flowToScreen(release).x+12`，均 top 为 anchorY、translateY(-50%)。它们使用同一稳定 world anchor 跟随 transform；没有此组件内的显式 viewport-clamp。窄屏 clamp 属本地适配。
- 候选顺序为 `text / image / video / video-clip / audio / script-v2`；没有 reference、旧 script、shot-breakdown 或 ordinary 侧菜单子菜单。外部 mousedown、Escape、pointercancel/lostcapture 清当前操作。源码未证明浏览器 blur/hidden 自动关闭；本地 owner 生命周期取消需独立记录。

## 聚合资格与 existing target

两条入口均先排 reference，再取有声明 `data.action` 的源。若没有资格源或其中任一 action 不允许，整体失败。**不是逐个调用普通单连再保存成功子集**。

existing target 先形成 target 已有入边 source-ID set；若所有 qualified sources 已存在返回 false。再将已有 IDs 与 qualified IDs 去重求并集，按图谱顺序直接收集媒体。普通组不展开，角色组使用 defaultState 的主图；当前 URL 为空仍算一个输入。image/video 追加 target.refImages；text/audio 不追加。旧 params 的媒体 lists 不作为普通 graph count，但视频 asset-ID 锁检测仍读取原 params lists。

- image/video/audio 目标必须对应 generate action，资源目标不接受多选 drop。TEXT 接 `text_generate` 或无 action 的 text；script 接声明 script_generate 的 script/script-v2；clip 的 target type 必须 video-clip。
- 视频、图片、音频始终按 **support 顺序第一项 enabled** 选模型，即使当前模型本来兼容。切换 patch 复用原 `px` 的 normal settings 默认/删除旧 normal keys，并保留 prompt/count/高级参数。视频同时验证当前 mode 的 subjects/sharedWith 上限。
- 视频原 params 的任一 image/video/audio item 含 assetId 且有 current model 时只检查 current；multi 分支没有普通单连的 segmentRemakeLock、extraConfig 模型白名单或仅 subjectList 就禁止换模型。不能直接复用单连 `selectModel`。
- TEXT image/video 上限来自 target.params.model 或 default text schema；缺少相应范围时明确 fallback image1/video0。并集计数超限整次拒绝。
- script-v2 不接 video/video-clip。script/clip 的 source 分支对剩余 new qualified sources 调普通 generator eligibility `h`，而不是普通全局 single handler；普通 clip 的 blob upload、30-clip、DFS cycle、双向 duplicate 全局规则没有在本多选 handler 出现。
- 原 helper 仅用 qualified sources 计数，但真正 addEdges 使用全部 caller source IDs。这意味着混合选择中 actionless 源被资格忽略却能添加边，是原代码的分支差异；本地纯 plan 保留这点并在测试记录。UI helper 已排 reference，direct resolver 也排 reference。全 qualified 已连时，即使 actionless ID 未连，仍返回 `duplicate`。
- 多选 hover 的 frosted 只表达 origin/任意已关联；部分已连仍可 drop 一次连接其余。视觉 invalid 优先级排除已有连接，不应据 overlay 的 blocked 字段阻断 drop。

## 共享目标创建

`handleMultiSelectConnect` 一次 `takeSnapshot`，创建**一个** target，追加 N source→target edges，并只选中新目标、隐藏虚拟 toolbar。位置为 release-flow point；短按为 `bounds.x+width+100, bounds.y+height/2−60`。不会因 N 个来源生成 N 张目标卡。

`canMultiSelectCreateNode` 与 existing target 是独立规则：

- VIDEO：按 support 首 enabled，返回 `modelKey` + `getBestEnabledModeType`。无 enabled 模型但完全没有媒体时允许 text-only fallback；有媒体不允许。
- IMAGE：不允许视频/音频；没有图片直接允许；有图按 support 首 enabled + image2image，**即无 enabled 模型也允许 mode-only fallback**。不能把 existing image 无可用模型拒绝规则照搬。
- TEXT：用**全局 default text model**上限，而非刚创建 target 选择的 model；image1/video0 fallback 相同。
- AUDIO：无图/音频直接允许；否则聚合图/音频按 support 首 enabled，返回 image2audio/audio2audio；混合输入须整个模型可接。
- VIDEO_CLIP：必须至少一个真正 video 输入，初始 params 是 `{}`，非普通视频生成器。
- SCRIPT_V2：action matrix 与 video guard；源 nY 有该项，但 handler switch 没有显式 script-v2 case，会落入 TEXT 默认 data 分支。此为捕获脚本内部差异，不能把它推测成经过原站浏览器验证的健康行为。本地继续用已有正确 script-v2 factory，属于明确适配。

源 multi TEXT 默认 content 空，不插入普通 image→TEXT 连接菜单的默认提示词。本地创建目标保留 `params.prompt:''`。纯规则仅返回 choice/targetPatch 和所有 edgeSourceIds，graph controller 负责一次原子 owner/CAS/history/参考同步；模型不添加节点、不写 autosave、不调用生成服务。

## 本地实现、验证与剩余边界

补充普通节点 actions 显隐证据：`21_0xvlvkw1sz.js` 约 164700 的 `nA` 图片编辑工具入口遍历 ReactFlow selected nodes，`++count>1` 立即返回 null，仅一张图片且父节点未选中才能返回该 ID；isBoxSelecting 也阻断。`3u6hjewm8qox_.js` 约 679733、模块 464025 的 `useShouldShowGenerator` 仅 selection change 包含本 ID 且总数 1 时返回正常选中结果（reference/mark/focus target 是单独例外）。Audio toolbar 约 709153 要求该 hook 的 `M`；Video 约 1588979 的 `eU` 由相同 hook 或 markSource 得到，约 1610099 的 `aP` 加工具状态 guard，约 1667110 toolbar 要求 `aP`。因此普通多选时各节点预览/编辑/下载浮条隐藏有直接依据，不能只因本地 frame 覆盖而留下多套浮条。

本批新增 `domain/multi-connection-model.js` / `.test.js`。`connection-model.js` 只增加 action matrix、ordered support、schema capability 与 normal-default patch 四个小型纯导出；原单连 resolver 行为保留。group/virtual bounds、gesture/controller、菜单、HTML/SVG 预览由其他批次文件实现，不能把本文源码阅读或纯模型测试等同浏览器全部验收。

本地区别：缺少运营 media schema/support 项时返回 modelsUnavailable，不能将原 global store 尚未初始化时的宽松 true 当作可生成；已知 schema 全部不支持的 IMAGE creation fallback 则按源保留。未知特殊 source/target/generator 分支阻断并标记 unverified，不声称 director/分镜/模板私有连接已一致。稳定 owner 身份、文档 CAS、真正 undo/redo、blur/hidden 取消、窄屏 clamp、recursive world position 属本地工程适配。未接真实协作锁或服务器写入，当前用户无登录要求。

已验证 aggregate 容量、已有/新来源去重、actionless/reference 资格、support-first/asset 锁/subject 上限、mode 推断、TEXT default 容量、clip/six-item 资格、源 fallback、纯数据不变；同时回归既有 single 规则与 graph 一次历史提交。2026-10-11 18:10 的三文件检查为 **129 tests passed**（含随后补充的 actionless clip-target fallback）；对应纯域 ESLint 通过。真实多选浏览器手势、窄屏、原登录后的协作锁与生成均不由这些纯测试证明。

随后新增独立 `NodeCanvas.multi-connection.integration.test.jsx`，使用真实页面/gesture/Graph/history/storage，仅替换公开模型目录的无关网络读取。2026-10-11 18:24 **12 tests passed**，覆盖 frame 整体移动仍保留两选且只一次 undo/redo、普通节点浮条隐藏、existing 全部/部分/全已连接、六项菜单共建一个空 prompt 目标、release-flow 与短按 bounds 定位、disabled 不留孤儿、pagehide 不保存 viewport preview/temp、blur/hidden 迟到 RAF 和同 ID project/readonly owner 切换取消。此为 jsdom 事件集成，视觉/GPU/实际桌面和窄屏仍须浏览器验收；readonly 用本地 embedded 入口，不表示原站账号授权验收。

## 后续真实普通组入口已核对（2026-10-11）

本批虚拟多选已接，真实组仍缺caller。`CanvasGroupNode`仅布局/执行/解组；`NodeCanvas`的sources/bounds仅取virtual selection，单真实组被resolver返回null，因此递归pure helper未进入真实页面。

源码`21_0xvlvkw1sz.js`约822778的sr在single-real-group后排`sourceScriptNodeId`/shot-breakdown；约823095的sn以measured→stored且宽高非0和逐层parent世界坐标构造真实组bounds。约965710的第二套nJ条件`sr&&sn&&sa.length>0&&!i4.visible&&ob`；sa递归普通GROUP非组/non-reference leaves，可只有1项、未按action预筛。ob约753081排locked/readonly/focus/hand/mark/publish/reference-pick/practice等mode。

下一步应将普通组真实bounds和递归IDs作为共用connection descriptor，在virtual不存在时选用；不用virtual两次padding，也不要求2个来源。80px hit/24px glyph在board overlay保持screen尺寸，不放在缩放Group article。menuanchor目前依赖selectionProjection须解耦；owner signature/fallback focus带kind/groupId，子集合变化取消旧request。script派生/分镜组不能仅凭本地type=group自动启用。此段为只读发现与下一步约束，不是接线完成证明。
