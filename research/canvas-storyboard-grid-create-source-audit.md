# Standalone 图片分镜组创建与拖动入口核对

2026-10-11。本批以保存的公开客户端为证据；没有登录、使用账号资源或向原站写入。内容只作为代表性功能样本。

## 创建协议与证据

| 证据                                                                                       | 已核实规则                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/source/21_0xvlvkw1sz.js`，字符位置 908545–910450，`lM/lR/lA/lP`                  | 目标集合按实时图顺序保留选中的根节点，排除 script/script-v2。有效目标必须全部 image，数量 2–25；2–4 个用 2 列、5–9 用 3 列、10–16 用 4 列、17–25 用 5 列。没有固定行数或 preserveChildDimensions 标记。                                                                                     |
| 同文件 891500–895300，`D/O`                                                                | 创建先记录历史。`storyboard-preserve-layout` 将旧节点绝对位置减去组边界起点，与规则网格前 N 个槽位建立平方距离矩阵，通过 Hungarian 最小总距离分配，按槽位顺序写 childNodeIds。成本网格使用 measured→stored→200/120 的旧尺寸，最小 48；它不是名称排序、简单 y/x 排序或逐个最近槽的贪心分配。 |
| 同文件 `D`；`research/source/04q9x43g2p9-v.js`，模块 662493/365256                         | 原创建组起点来自现有选择边界或节点估算边界。后者包含 20px 周边、36px 标题补偿及两次 sqrt(zoom) 补偿。子节点最初保持世界位置，转为相对新父组的位置；仅新组保持选中。                                                                                                                         |
| `research/source/1kb-4b4zv9_2a.js`，模块 713118，文件开头                                  | `computeNodeDimensionsFromRatio('16:9')` 使用 350 短边、1050 长边上限、整数四舍五入，结果 622×350。原调用保留其他 params/settings，写 ratio='16:9'、清旧 contentWidth/Height，并更新 width/height/measured。                                                                                |
| `research/source/3u6hjewm8qox_.js`，776058–778390，`tH` 与 membership effect               | standalone 标记生效后，真实成员/childNodeIds 签名变化触发网格正规化：childNodeIds、nodeWidth/Height、groupLayoutMode='grid'、相对槽位位置与 flow/measured 尺寸一起更新，子节点最终获得 `_explicitContentDims` 和实际 contentWidth/Height。不能根据每次拖动位置变化重新执行该正规化。        |
| `research/source/1bflqug4ccoei.js`，模块 713841；`research/source/2ijgtfwpg93os.js` locale | 新壳背景 `var(--storyboard-group-shell-bg, #212121)`，边框 `1px solid var(--canvas-group-border)`；名字 `分镜组 {count} 个节点`。禁用原因原文：`分镜组仅支持图片节点，且组内节点数量不可超过25个`。                                                                                         |

## 本地实现

- `src/features/canvas/domain/storyboard-grid-create-model.js` 为纯创建计划：`resolveStoryboardGridCreation` 负责资格，`createStoryboardGridGroup` 负责排序、相对位置、622×350 正规化、明确尺寸、组 metadata 和选择结果。共享数学只引用 `storyboard-grid-model.js`；普通 group 协议不改。
- `useCanvasSelectionActions` 暴露 `groupStoryboard` 与 toolbar 的 `onGroupStoryboard/canStoryboardGroup/storyboardGroupDisabledReason`。使用当前图和当前文档权限；完整计划通过一次 `change(nextNodes)` 提交，成功后选择新组、关闭 inspector，并将 `(groupId,nextNodes)` 传给可选 `onStoryboardGroupCreated`，供调用方使用准确新图 fit。
- 原站是创建后经 RAF 更新比例、再由组视图 effect 布局。本机一次提交完整最终状态，保留一次历史，避免半成品组在两次渲染或保存间出现；这是明确的生命周期适配，不能宣称逐回调时序相同。
- 默认初始边界读取文档明确 content 尺寸、比例、measured/stored 尺寸；原站还能读取当前 URL 的媒体显示/图片缓存 adapter。本模型接受 `bounds` 或 `getNodeSize` 注入完整估算。当前调用方未接原站全局缓存，不把未知图片原始尺寸当作已核实数据。
- 原节点 URL、resourceMeta、prompt、model、引用和非 ratio 参数保持。edges 不进入创建计划，hook 沿用当前 change 的边边界，不建立伪连接。

## 拖动与组视图接线调查

这里只记录已交给对应 controller/UI 批次的源契约，不以本文件存在视为这些交互均已验收。

- 主 Canvas `L` 913813 起、`D` 916000 起和 stop 918500 起：非 Alt 的 standalone 子 image 可建立 slot preview。每次预览仅将其他子节点让位并调整组 flow/measured 大小；parent、childNodeIds、nodeWidth/Height 和明确内容尺寸留到 stop。中心命中可进入/跨 standalone 组；离开预览移除拖动项，非空剩余 cell 不缩小。成功跨组直接替换预览，没有主动复原旧 target；成员 metadata 的后续正规化另有生命周期。
- stop 先消费有效 standalone preview，再走 Alt / 特殊非 standalone / 普通 group 分支。stop 重新核对当前成员、图片类型和容量，不能依靠入口缓存放行。
- virtual frame `J/Z/ee` 902000–906366：多图预览只维护 `storyboardMultiDragHoverCount`，不使用逐槽重排 preview。命中优先完整包含，再中心；node 的多节点 stop 另有 releasePoint fallback。virtual live Alt 在 move 时清 hover，但 stop 仍能将副本附入特殊图片组；普通 node live Alt stop 直接返回。两条协议不能共用一个 copied→no-op 判断。
- `3u6` 763349–764750 与 791050–793300：只有 standalone=true 且 subtype=image 的组绘制空槽。按实际 image 子节点数 + 非负整数 hoverCount 求槽数，空槽索引从实际 count 到 totalSlots-1；前 hoverCount 个空槽高亮青色。preserve=true 使用每个实际尺寸及 hover fallback 的可变网格；普通格子使用最大 child size，空组按现有壳尺寸反算，最小 48。单图 draggedSlot 没有独立 UI 高亮。
- 空槽原控件只有 `+`，没有明确 aria-label/title；wrapper absolute inset0/z10/pointer-events-none，button absolute/pointer-events-auto/nodrag/nopan，32px 字，背景 `#FFFFFF0D`，hover/聚合预览 `#5DDCFF1F`，高亮文字 `#5DDCFF`。readonly 不绘制。mousedown 阻止冒泡；click 选择组并打开该 slot 的加项菜单。原文案为“从本地上传图片”和“从历史记录中选择”，历史项在 practice 隐藏；后者是 image/maxSelect1 的 GalleryModal，不能假冒已经上传/已创建内容。
- 标题来自 `3u6` 719133 的 `ev`：absolute left0/origin-bottom-left，`bottom:calc(100% + 8/Math.max(zoom,1)px)`，通过模块 485615 的 NonScaledWrapper 保持屏幕尺寸；在壳外上方，网格无内部标题 padding。普通 standalone 标题 13px/muted；颜色 chip 另为 24px 高、12px/18px 行高。
- 单图 layer composition 命中是独立分支：仅 sole image owner、非 Alt/practice/locked/readonly，standalone target 优先；最终通过 `moveImageNodeIntoLayerComposition` 异步提交并有失败提示。当前普通/standalone 创建模型没有实现或冒充图层合成服务。

## 定向验证

2026-10-11 22:11：创建模型 27 项、selection actions 11 项，共 38 项通过。覆盖 2–25 门槛与列数、真实根节点过滤、混合类型拒绝、非贪心最优分配与独立穷举 oracle、源尺寸/组 metadata、参数与资源保留、输入不可变、zoom 原点、损坏计划拒绝、一次历史与 undo/redo、当前图资格更新、权限/readiness、写失败和文档切换后的选择/fit 隔离。ESLint 定向及最终 Prettier 检查通过，审计文件也完成格式化。

22:17：`NodeCanvas.storyboard-grid-create.integration.test.jsx` 三项真实页面集成通过，仅 mock 公开 catalogue，保留生产菜单、图、历史与存储。验证创建菜单实际可达、mixed/26 图禁用及无写入、二图最优顺序与源 flags/尺寸/壳、一次 undo 恢复且无额外历史、redo 与刷新恢复。该文件 ESLint 通过。

本文件不代表原站账号态、生成/费用/多人写服务或整个 Canvas 已完成；原生浏览器、窄屏及完整工程验收由整合批次另记。
