# 普通组 NodeResizer：源协议与纯计划

2026-10-12。本批仅静态阅读已归档公开脚本与 CSS，不执行 bundle，不登录、不写原站。offset 为 UTF-8 解码后 Python 字符串的零基字符位置。下面区分 GroupNode caller、XYResizer 预览、GroupNode.tB 结束，以及本机手工 renderer 的生命周期适配；不将 standalone 图片组、脚本视频组或特殊父组协议混为普通组。

## 证据索引

| 文件 / offset                                        | 已核对内容                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js` 761191、761859、762504–763000     | GroupNode、eN 可见性、sourceScript/standalone/image/video 门控。                                         |
| 同文件679719–680267，模块464025                      | useShouldShowGenerator：唯一选中当前节点且非 box-select，或 reference/mark/focus target override。       |
| 同文件790306、793297–793720                          | t2=eG\|\|eO；非 readonly 且非 t2 的 NodeResizer；isVisible=eN，min120×80，8px/radius2 手柄、选择边线。   |
| 同文件775227–776058                                  | tB：结束候选、真实 direct children、12px 扩壳和孩子坐标补偿。                                            |
| 同文件756618；`04q9x43g2p9-v.js` 27771–28020         | tB.tm measured??stored??200×120；GROUP_MIN_PADDING=12。                                                  |
| `1kb-4b4zv9_2a.js` 82400–84474，模块575539           | NodeResizeControl → XYResizer，onChange 的 position/dimensions/child events，onEnd resizing:false 事件。 |
| 同文件82577、82970、83842、84474                     | handle autoScale=max(1/zoom,1)、onChange/onEnd、NodeResizer 4line+4handle。                              |
| 同文件96508、96584、98256                            | snapPosition、屏幕→flow、getPointerPosition（pane bounds/transform/snap）。                              |
| 同文件105587–105995、120265–124614，模块395060       | 方向识别、clip helpers、完整 XYResizer begin/drag/end 算法。                                             |
| 同文件120818、122364、122494、122660、123716、124524 | begin、floor、parent extent、child extent、direct child 补偿、发生过有效 resize 才 end。                 |
| 同文件124614、124700                                 | 四角 top-left/top-right/bottom-left/bottom-right；四边 top/right/bottom/left。                           |
| 同文件8872；`0leiedr1esdbe.js` 94114–95900           | applyNodeChanges 的 measured 替换、stored dimensions、resizing 与 source store 去重。                    |
| `21_0xvlvkw1sz.js` 710545、964333–964347             | snapGrid 为 SNAP_GRID_SIZE=12；snapToGrid 由 caller 状态 aT 决定，没有 nodeOrigin override。             |
| `1kb-4b4zv9_2a.js` 57880、100810                     | nodeOrigin 默认[0,0]。                                                                                   |
| `21_0xvlvkw1sz.js` 886699–887250                     | resize-end dimensions 事件之后，仅当前节点的 parent 走 shot/long-video 特殊重排或 pF。                   |
| `255axd08169oj.css` 13466–15300                      | 原 resize-control 四边/四角定位、1px边线、cursor；caller 覆盖角柄8px/radius2。                           |
| `1h-b10gcvw4vl.css` 244215、245822、252723           | selected border：dark #a8a8a8 / light #919191。                                                          |

## 入口与手柄

实际资格是非 readonly、非 `Boolean(standaloneStoryboardImageGrid)&&storyboardGroupType==='image'`、非 `Boolean(sourceScriptNodeId)&&storyboardGroupType==='video'`。普通组和 script-linked image 有手柄；仅 video subtype 但未 linked 不被此 gate 排除。character helper 当前恒 false，因此不能凭 characterAsset 任意禁用。历史 truthy standalone flag 同样进入排除分支，不能仅比较 true。

isVisible=eN 不是简单 selected。唯一选中当前 group 且不是框选是通常入口；reference/mark/focus target 可另行显示。当前本机可见性与 controller 仍应按真实已接 source 入口验收，不把静态 helper 的全部模式当已完成。选择与 readonly/ready/手势互斥由 caller 持有，不在纯节点模型里伪造状态。

NodeResizer 绘四条边线、四个角柄。keepAspectRatio、maxWidth/maxHeight、resizeDirection、shouldResize 均没有 caller override。不存在 Shift 比例锁定、Ctrl/Alt 复制、自动 grid/fit 的 resize 分支。角柄 autoScale=max(1/zoom,1)：zoom<1 保持8屏幕像素，zoom>1 随组世界缩放。边线为1世界像素，不做角柄的 autoscale。原库 control 是 div，未发现键盘改变 graph 的 source 协议；本机中文 aria/button 壳属于可访问性适配，不声称原站已提供完整键盘 resize。

## XYResizer 开始与预览

begin 从 React Flow internal lookup 捕获 measured.width/height（缺失为0）、position（parent-relative）、初始 flow 指针，以及所有真实 direct children 的位置。每次 pointer 先扣 pane rect 再按 transform 转 flow；启用 snap 时对绝对 flow 点按12网格 round。不能把未 snap 的 delta 再按12 round 代替两次绝对 snap。

方向涉及的 delta 采用 `Math.floor(currentSnapped-initialSnapped)`，不是 Math.round/trunc。-0.01 会产生-1；+0.99 为0。左右只用 x，上下只用 y，角柄用两轴。candidate 依据初始 group 矩形计算，不累加上次预览的 delta。左/上移动 group 局部 position，并反向改变对应尺寸；右/下保留该轴 position。普通合法初始壳尺寸下按 min120×80/maxNumber.MAX_VALUE 限制，保留对侧锚点。

当前 group 自己的有限 extent 会限制向外扩张。extent='parent' 且 parent 存在时取 parent measured 尺寸作为[0,0]→[width,height]边界。source 默认 origin=[0,0]，实际当前公开 grouping 创建字段无 origin/expandParent；本机纯模型支持这一默认原点，并对非零 origin、group 自身 parent+expandParent 明确 invalid。后者的 source NodeResizeControl 还调用 handleExpandParent（库102174）扩大 parent、补偿兄弟和处理 origin，不能以普通 extent clamp 冒充，尚未实现。

全部 direct children 都会在左/上预览时进行反向 position 补偿，包含 hidden、temporary、reference 与 child-group；grandchildren 依随 parent 世界位置，不能再次展开补偿。只有 child.extent==='parent' 或 child.expandParent 的孩子才参与预览縮小的 union bounds。该约束仅保护孩子边界，**没有12px内边距**；未 constrained 的远处孩子不能阻止预览縮小。constraint 采用 begin 时的 internal measured 孩子尺寸及 group.position+child.position，nested group 仍使用其自身壳尺寸。

默认原点下，左/上 candidate 与初始 group.position 的差为(dx,dy)，每个 direct child 新局部位置为原位置-(dx,dy)，世界位置恒定。右/下不移动孩子。RF dimensions change 写 flow width/height、替换 measured、resizing=true；纯预览保持所有 data、params、style、parent/extent、childNodeIds、selected 与边线不变。不序列化或深拷贝无关长脚本、媒体 data URL；未变节点保留引用。

source library 的起始矩形必须来自已测量节点；对缺/零组尺寸、损坏图/坏几何本机返回 invalid，不将其恢复为默认任意尺寸。源 min 参数不能证明未测量或初始尺寸已经小于 minimum 的坏文档拥有可靠 resize；本机不会宣称这些坏图正向等同原站。

## tB 结束与事件顺序

XYResizer 的 S 记录此手势是否发生过有效 geometry change。floor 后0、或被 constraint 完全挡住而始终未改变几何时不调用 onResizeEnd；因此不能无条件利用 pointerup 修复已有坏边距。已经发生过有效 preview、之后返回起点仍会执行 tB，caller 需保留 didResize。

tB 读取当前全部真实 direct children，没有按 childNodeIds、可生成类型或可见性筛选。每个孩子逐轴使用 tm=measured??stored??200×120，没有 explicit content/ratio/media metadata 分支。使用预览补偿后的位置计算 minX/minY/maxRight/maxBottom：

```text
left = max(0, 12 - minX)
top  = max(0, 12 - minY)
final.x = candidate.x - left
final.y = candidate.y - top
final.width  = max(candidate.width + left, maxRight + 12)
final.height = max(candidate.height + top,  maxBottom + 12)
child.position += (left, top)
```

这是源精确公式。right/bottom 是补偿前 child bounds，不擅自在第二项再加 left/top；左补偿与右 overflow 同时存在时不能改成通用 union 重包围算法。本机回归专门覆盖这一组合，保持源结果，而不泛称任何坏文档都被完整修复。

非空组 ef 先写 data.nodeWidth/Height，随后 eg 写 group.position/width/height；有 left/top 时还写全部 direct child.position，并 bypassCollabFilter。data patch 会 canonicalize legacy label/name；保留 groupLayoutMode、陈旧 childNodeIds、颜色、params 与其他 metadata。空组仅写候选 position/width/height，不写尺寸 data，也不 canonicalize legacy title。无 style 清理、child resize、layout、selection、history 或 fit 调用。

**顺序差异必须保留：** XYResizer end 先调用 GroupNode.tB，随后 NodeResizeControl.onEnd 发送 `{resizing:false,dimensions:{candidate.width,candidate.height}}`。tB 没有 measured patch；后一个 RF event 保留 candidate measured，即使 stored width/height 已因12padding扩壳变大。原 RF 下一次 ResizeObserver 才测得实际 DOM 壳。本机 finalize 保留这次 source event 的 measured 候选，stored/data 使用 tB 最终尺寸；手工 renderer 没有 RF observer，因此 caller 注入 stored 优先的真实 canvasNodeSize 开始下一次 resize，不能再次拿旧 measured 假设实际壳已更新。

经21 handleNodesChange，这个 resizing:false dimensions event 若节点有 parent，还会对 parent 调 shot-breakdown regrid / long-video relayout / else pF。该层不是 tB 本体，但本次 finalize 已将 direct 普通 parent 的 pF 合成同一个 nodes 计划，复用已有 `planCanvasParentBounds`，不再递归 grandparents、不增加历史。pF 源在21@688531，padding20/top56，采用 estimateNodeFlowSize（含source cache接口）；自身 tB 仍是12，不能混用。parent 的 `standaloneStoryboardImageGrid===true` 使 pF no-op，不要求 image subtype，历史 truthy string 不进入此门槛。

special direct parent 精确谓词来自 `170exq-5f14zz.js`：@6669 要求 data.type==='group' 且 breakdownSourceNodeId 非空 string；@6132 要求 data.type==='group' 且 longVideoSegmentGroup===true（key定义@4480）。当前没有对应 regridShotBreakdownGroup / relayoutLongVideoSegmentGroup 纯 planner，因此 begin 对这两类确切 direct parent 返回 `Unsupported special parent resize-end layout`。没有type、空source、错误type或 truthy非boolean segment 不擅自扩排除范围；间接特殊祖先也不排除，因为 source 只调 direct parent。不能用普通 pF 冒充缺失重排。frame拖动不参与此协议。

## 新纯 API 与 caller 合同

owned 文件：`src/features/canvas/domain/group-resize-model.js` / `.test.js`。

```js
CANVAS_GROUP_RESIZE_DIRECTIONS;
CANVAS_GROUP_RESIZE_MIN_SIZE; // {width:120,height:80}
beginCanvasGroupResize({ nodes, groupId, direction, getNodeSize? });
// {valid:true, session} | {valid:false,changed:false,nodes,reason}
projectCanvasGroupResize({ session, delta: {x,y} });
// {valid,changed,nodes,candidate?:{x,y,width,height},reason?}
finalizeCanvasGroupResize({ session, delta: {x,y}, didResize?:false });
// {valid,changed,nodes,candidate?,bounds?:{x,y,width,height},reason?}
```

session 为冻结捕获数据及原节点引用；不 freeze/mutate caller 的 graph。delta 是起始到当前的 flow/snap 差；保持 baseline 坐标，即便视口变动也不累计旧 delta。每次 project 可安全重复，源 nodes 不变。若 earlier project.changed=true，owner 将 didResize=true 保持至结束，处理回到起点的 source S。未改变时 nodes 原引用；invalid 不提供半个图。

getNodeSize 可选，当前组和孩子 signature `(node,{phase:'preview'|'finalize',role:'group'|'child'})→{width,height}`。finalize 的 direct parent 复用 pF 时沿已有 helper 再传 `{role:'bounds',surface:'node'}`；没有 injection 时沿该 helper 的 source estimate 路径。默认 preview measured??stored??0（stored 为无 RF internal lookup 的明确本机适配）；final child measured??stored??200×120 精确 tm。当前 Root 注入 canvasNodeSize，使用真实手工 renderer 的 stored/显式 media 盒子；这是既有布局/命中几何的本机适配，与 RF measured 和 tm 路径区别已明确，不隐瞒差异。

纯模型只消费 nodes；edges 由 caller 保持同一图引用，不创建/重映射边。document identity、ready/readonly、capture、唯一选中/手势冲突、取消/Escape、RAF、并发 graph CAS、草稿投影、一次历史、pagehide 最终化/flush 由 Root controller 持有。当前 Root 采用 transient preview，canonical 图仅最终一次 CAS/undo，取消丢 preview；原站直接发 RF changes，该本机提交边界是生命周期适配，不能称其 store/collab/save 事件序列完全相同。

## 定向验证

2026-10-12 02:17:45，`npx vitest run src/features/canvas/domain/group-resize-model.test.js`：1文件59项通过，655ms。两 owned JS 文件 ESLint 零警告、Prettier 通过。包括八向正负 motion、floor、最小锚点、两类 child constraints、parent/有限 extent、nested world 坐标、hidden/temporary child、准确12padding/右溢出组合、empty metadata、measured event 顺序、资格、caller size injection、didResize/无效阻挡 no-op、坏图原子拒绝与无关 payload 引用。

追加 direct parent 组合后，2026-10-12 02:22:27，两文件（新 resize 69项、已有 parent-bounds 41项）110项通过，746ms；零警告 ESLint 通过。最终冻结复验02:23:56同两文件110项通过，532ms，日志 `artifacts/canvas-group-resize-model-tests.log`；两JS与审计Prettier通过。新增普通 parent 扩壳/兄弟补偿、20/56区别、strict standalone no-op、exact special parent拒绝与不递归特殊祖先，保留前59项强坐标断言。

本记录不代替 Root hook/实际 DOM/浏览器/全量检查；这些由各 owner 另记录。尚未实现非零 nodeOrigin、自身 expandParent 的父/兄弟图协议与特殊父组重排。当前无需登录/原站账号资源，整个 frontend 功能复刻仍未完成。
