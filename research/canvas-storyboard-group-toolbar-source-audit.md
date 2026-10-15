# 独立图片分镜组工具栏、标题与设置源码审计

2026-10-11。本批只读核对公开客户端证据后实现本地前端；未登录、未使用小号、未调用原站写入或遥测。下列位置是保存文件解码后的 **0 基字符位置**，不是行号。主要证据为 `research/source/3u6hjewm8qox_.js`；同名组件在别的压缩包中出现不代表字符位置可以共用。

## 范围与真实门控

`GroupNode` renderer 的状态入口约为 761179；`eG`（762780 附近）是 `Boolean(standaloneStoryboardImageGrid) && storyboardGroupType === image`。`e_` 是 `Boolean(sourceScriptNodeId)`，`ez` 包含非视频的脚本关联组及 `eG`。这些规则不能用普通组、角色资产组或脚本树的工具栏替代。

793540–794900 的 JSX 明确分支：角色组工具栏优先，随后 `eG → ts`，否则才是通用 `GroupNodeToolbar`。`ts` 位于 745075–755096。`eG` 与脚本关联可以同时成立；这种混合状态在 `ts` 内显示锁定比例、隐藏转换入口，并显示脚本重新生成/停止。**当前实现仅接独立且无 `sourceScriptNodeId` 的图片组**；脚本关联及混合分支延期，不能称本批覆盖所有脚本工具栏。

工具栏上层条件为 `!ew && t3 && !ta && !td`：`ew` 是组的 readonly；`ta` 是批量视频弹窗状态；`td` 是改名期间及结束后 200ms 的冷却状态（767831 附近）。`t3 = eN || (eG && eI)`（790306）：

- `eN = useShouldShowGenerator(selected,groupId)`，helper 为 679719–680303。通常是未框选且唯一选中的组；此外保留参考拾取/标记/焦点目标的特殊入口，不等于任意多选。
- `eI`（762199）要求不在框选、选中数组长度为 1，唯一节点是此组的直接 `image` 孩子。因此只选一张组内图片也能显示父分镜组工具栏。
- `eN` 本身不检查拖动。拖动隐藏由 wrapper 的 `hideWhenDragging` 实现，而不是将其推断为 `useShouldShowGenerator` 的数据条件。

本地 `CanvasViewport`/controller 提供 `controlsVisible`，处理普通唯一选择/唯一 image child、框选和本机 pointer owner。尚未把参考拾取的特殊工具栏目标外推为已完成。readonly 隐藏写工具栏，ready 与 busy 禁用按钮；这两个本机生命周期门控用于隔离加载和异步转换。

## 实际工具栏与菜单

`ts` 行内顺序及原文案：

| 顺序 | 入口                    | 源协议                                                                                                                    |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | 当前比例，例如 `16:9`   | 比例轮廓图标 16px、右侧下箭头 12px；脚本关联时锁定，提示“比例由脚本节点统一配置”                                          |
| 2    | `宫格 {cols}×{rows}`    | Grid3x3 16px、下箭头 12px；提示“修改分镜中宫格的数量”                                                                     |
| 3    | 分隔线                  | 1px 宽、至少 32px 高、左右 2px                                                                                            |
| 4    | `拼接(2k)` / `拼接(4k)` | 独立拼接 SVG 16px；点击立刻使用当前记忆分辨率；hover 打开分辨率菜单                                                       |
| 5    | `序号`                  | 独立序号 SVG 16px；当前开启态使用 hover 背景；提示“显示分镜序号”或“隐藏分镜序号”                                          |
| 6    | `清空`                  | Trash 16px；独立组提示“删除组内所有子节点”                                                                                |
| 7    | `转普通组`              | 独立转换 SVG 16px；仅无脚本关联且 callback 存在；提示“转为普通分组：子图按实际显示尺寸恢复并按宫格重排，取消分镜专属选项” |
| 8    | 脚本重新生成/停止       | 仅 `isScriptLinkedStoryboard`；独立组不显示，不能用本地“整组执行”替代                                                     |
| 9    | 分隔线、`解组`          | group 16px，调用既有解组入口                                                                                              |

比率/宫格候选与布局证据为 742955–745075，实际行与菜单 JSX 为 748218–755096。此专用行**没有**模型选择、preserve 开关、颜色选择、下载、保存资产或通用“设置”按钮。通用 `GroupNodeToolbar` 8038xx/815xxx 中的颜色等菜单不能挪到此行。

比例候选 `e8`（742955）：`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`，没有自动/原图选项。当前 label 来自实际直接 image child 的第一个节点 params 的 ratio，缺失回退 `16:9`（766935 附近）。选中后 `onAspectChange(value)` 并关闭菜单。轮廓图标 16px 槽位内最大边是 13.44px，不使用文件图片作为图标。

宫格 preset `e9`（743411）是 `2×2`、`3×3`、`4×4`、`5×5`。选中态比较**原始手动配置** `storyboardManualGridCols === n && storyboardManualGridRows === n`，不能把自动计算的相同显示值标成用户已选 preset。选择回调为 `(cols,rows)`。source mouseDown 仅接受主键，并 preventDefault/stopPropagation。

`自定义` 在宫格菜单底部，hover 立即显示右侧 flyout，离开有 120ms 延时；关闭宫格时也关闭 flyout。`CustomGridPicker nD`（189475–190925）为 5×5 个 32px 单元、4px 间隙，hover 高亮左上到当前位置的矩形，边色 blue-400/60、底色 blue-500/40。左 caption 是“自定义宫格”，右 caption 是 `{cols} x {rows}`；中文证据 `2ijgtfwpg93os.js` 276185 的 `common:imgEditorCustomGrid`。picker 原回调 `(rows,cols)` 在 `ts.eu` 7468xx–7472xx 转为上层 `(cols,rows)`，不能颠倒保存。原 flyout 是宫格面板的 `left-full top-0`，横向间隙 6px；本地保持此方向，右侧空间足够时保持源行为，只有左侧足够时向左翻转；两侧都不足则在整个主面板下方或上方展开，保持 6px 间距和 8px viewport 边界，避免 clamp 后覆盖主菜单或自定义触发器。这是本机窄屏适配。

拼接选项 `te`（743430）是 `2k`、`4k`；菜单实际显示小写 key。偏好 key `tt`（743488）是 `libtv.storyboard.stitch.resolution`，默认 `2k`，只承认这两个值。选择菜单项会**记忆并执行**此次拼接，不只是修改偏好；主按钮则直接执行当前值。hover 立即开，mouseleave 120ms 关。source 拼接提示气泡为“按分镜比例与当前宫格（含间距）拼接，默认 2K 分辨率”。

7462xx–7482xx 维护比例/宫格/拼接三个菜单互斥、自定义菜单 timer 与 cleanup。source 监听 outside mousedown，`[data-popover-safe]` 为外部保护标记。本地复用 `useAgentToolbarPopover`，增加键盘 Arrow/Home/End、逐层 Escape 回 trigger、外部 focus 关闭不抢焦点；没有另建 body scroll lock 或 dialog stack。hover 回焦点不自动重开菜单，避免选择分辨率或自定义 Escape 后菜单再出现。

## 尺寸、定位与色值

工具栏 wrapper `eO`（678554–678917，模块 703962）在组中心、组上方；caller `baseOffset:20` 加 wrapper 默认 gap 8，实际间隔是 **28 screen px**。外层按 zoom 逆缩放，zIndex 1000。`NonScaledWrapper` 模块 485615 位于 `2ob2qo_b0az9v.js` 开头约 0–1550，工具栏传 `hideWhenDragging:true`，读取 nodeLookup 的 dragging，title 不传此隐藏条件。不能用世界坐标 28px 随 zoom 放大。

菜单 source 定位 helper `tn`（743518）以 `8 + 40*n + 2*max(0,n-1)` 估计高度；先选下方可容纳位置，再选上方，再比较剩余空间。viewport margin 8、与 trigger 间距 8。比例/拼接左对齐 trigger；宫格以 trigger 中心对齐。body fixed portal；宫格宽 150，比例/拼接最小宽 120。source resize 及视口 x/y/zoom/node position/dragging signature 变化时重新定位。本地菜单保留此 below-first/对齐规则，共享 hook 负责 owner、Escape 与外部事件；实际面板测量和 ResizeObserver 用于定位。

行 style（806186，export 811305）为 padding 8、gap 8、radius 12、0.5px controls-border、controls-bg、shadow `0px 4px 10px 0px rgba(0,0,0,.08)`、blur 16。行按钮高 32、左右 padding 8、gap 4、font 13、radius 8。比例/拼接菜单派生该 style，padding 4、gap 2；宫格面板 padding 6、gap 2，项目左右 padding 12、上下 padding 10、font 14。

公开 CSS `1h-b10gcvw4vl.css` 244418/244447/244480/244578 给出暗色控件值：bg `#262626`、border `#363636`、text `#fff`、hover `#ffffff1a`。本地采用 `var(原变量,原暗色值)`，避免未导入全站主题变量导致边框或背景无效。工具栏使用 board-local screen anchor 和 board portal，不在 render 读 board rect；8px board clamp/横向滚动让 320/390px 不裁切是本机适配，source 未提供这种 toolbar clamp。

source Tooltip 行入口是顶部位置、200ms openDelay（7487xx–7511xx）。本地 passive tooltip 采用相同延时和文案、离开/卸载清 timer、pointer-events none，不把气泡加入可交互菜单栈。气泡色/细排版使用本地样式，尚无原 Mantine 主题全局覆盖的逐像素浏览器比对，不将其宣称全主题完全一致。

## 标题、改名与颜色

组标题独立 wrapper 位于 719133 附近，最终 JSX 794900–795550。组宽度取 measured.width→stored.width（767600 附近）；标题在 left 0、bottom `calc(100% + 8/max(zoom,1)px)`，逆 zoom 缩放、origin bottom-left，宽度限制为组宽×zoom。普通标题 font 13、secondary 色；没有普通组图标。工具栏拖动隐藏时标题仍保留。

共享 title label 模块 463672（658240–662560）支持 doubleClick→编辑，readonly/collaborative readonly 不编辑；初始 draft 是当前名称，自动 focus/select。Enter 提交，Escape 取消，blur trim 后只保存非空且有变化的名称；输入事件阻止画布拖动/快捷键传播；**非编辑标题保留 pointerdown 冒泡，允许从标题自然拖动整个组**。source title wrapper 的 noDrag/noPan 只在编辑态启用（719133 附近），非编辑 label span 没有阻止 pointerdown。renderer 的 `tS`（768085）最终 guardedNodeWrite `{name:value}`。source 还有敏感词过滤异步服务；**本机不运行该服务，也不伪称名称已通过服务器审核**。本地以 documentKey+groupId+原名称+ready/readonly/busy 检查 owner，A→B→A、组变化或外部名称更新后丢弃旧 draft；IME Enter 不提交。Enter/Escape 回组焦点、外部 blur 保留新焦点是本地可访问性适配。编辑期间及结束后 200ms 隐藏工具栏。

`groupColor && !editing`（767831）启用彩色标题 chip：高 24、padding 0 6、radius 6、font 12、line 18、white。`getGroupTitleChipBg`（820877）用已知旧色映射到 `--nt-*-1000`，未知颜色 fallback `color-mix(in srgb,color 30%,#000)`。本地保留原映射并用公开 `129_y89ca9lu0.css` 的 `.dark` 数值做 var fallback（例如 red-1000 `#4e1714`，7168），防止缺变量时颜色丢失。只读取已有 groupColor，**没有为独立组新增 source 未展示的颜色按钮**。通用组的颜色 setter `t_`（770712）与普通 toolbar palette（811486）只作为其他组分支证据。

图片上的序号是另一个独立 display 协议，source 907283 可见 shadow `0px 2px 4px var(--ShadowShadow-M), 0px 4px 10px var(--ShadowShadow-L)`。本地 `storyboard-shot-number-model`/CanvasNode 由 Root 接线，本文件 CSS 只添加 left/bottom 8、z6、font500、tabularnums、white、pointer-events none；M/L 的暗色 fallback 分别来自 `1h-b10gcvw4vl.css` 245012/245035（`#0003`/`#00000047`）。

## 数据动作与实现拆分

renderer callbacks 的完整数据规则由 `research/canvas-storyboard-group-controls-source-audit.md` 和纯 `storyboard-group-controls-model.js` 维护，UI 不复制第二套图更新：

| callback | 证据位置      | UI 合同                                                                              |
| -------- | ------------- | ------------------------------------------------------------------------------------ |
| tW 比例  | 779915–780430 | 新 ratio 作用于直接 image children，并调用 source reflow；不只更改菜单 label         |
| tK 宫格  | 780437–781560 | 保存原手动 cols/rows；超出固定格数的孩子按 source 脱离/摆放，不能悄悄删除            |
| tY 拼接  | 781564–782104 | 单次进入、readonly/真实失败处理、成功使用实际拼接输出；不是生成服务成功的替代        |
| tq 序号  | 782104–782220 | 切 `showStoryboardShotNumbers`                                                       |
| tX 清空  | 782205–782859 | 确认标题“清空分镜”，正文“将删除组内所有子节点。是否继续？”，确认“清空”/取消“取消”    |
| tZ 转换  | 782871–786800 | 确认标题“转为普通组”；恢复实际显示尺寸、清分镜配置并普通重排；异步探测必须检查 owner |
| tL 解组  | 770556 附近   | 复用既有解组；不制造独立复制/删除动作                                                |

源 `tz` 772161 可能把 `ez` 归入图片重新生成，但 `tU` 771313 在没有 sourceScriptNodeId 时立即 return，且 `ts` 的 run JSX 只在脚本关联时出现。不能因 renderer 提供 callback 就在独立组显示“整组执行”。

当前拆分及接线：

- `CanvasGroupNode` 保留 shell/placeholder/标题，普通组维持原 toolbar；独立无脚本组根据 controlsVisible 渲染 `StoryboardGroupToolbar`。
- `StoryboardGroupToolbar` 只持 popover、hover、局部偏好和定位。`onCommand(groupId,command)` 为纯 UI 意图，stitch 偏好经 `services/storage.ts` 的 getter/setter 写入，不在 view 直接访问 localStorage。
- Root controller 持确认框、服务/图状态、history、文档 owner。command 为 aspect(value)、grid(cols,rows)、toggleShotNumbers、clear、convertToNormal、rename(value)、stitch(resolution)；解组保持原 `onUngroup(groupId)`。
- View props 为 `controlsAnchor`（board-local screen center/top）、`controlsPortal`、`controlsVisible`、`controlsDocumentKey`、`onGroupCommand`、`groupControlBusy`。`manualCols/manualRows` 由 CanvasGroupNode 读取组 data，只用于 preset 选中态；显示 label 使用实际 layout cols/rows。

## 定向验证与尚未完成

2026-10-11 23:59:28：`StoryboardGroupToolbar.test.jsx`、`CanvasGroupNode.storyboard.test.jsx`、`storyboard-grid-presentation-model.test.js` **3 文件 59 tests passed**；以上 owned JSX/tests 定向 ESLint、Prettier 通过。覆盖真实共享 popover 的比例/宫格/自定义选择、原 manual 选中态、120ms hover与200ms tooltip、菜单互斥/逐层 Escape/外部焦点、分辨率偏好、disabled/busy、390→320 board resize、自定义菜单左右空间不足时上下展开且与主面板不相交（使用原生发现的 390px DOM rect）、宽屏左右 source 行为、普通组不变、非编辑标题起拖/输入态拦截、标题 focus/select/trim/IME/一次提交/取消/200ms cooldown、A→B→A owner隔离、外部改名与 readonly/ready 切换。

生产 UI 在该次定向验证后冻结；全工程及原生桌面/窄屏验收由 Root 统一执行，不能用本页单元测试代替原生实际菜单、scroll、下载输出验收。脚本混合工具栏、原站敏感词服务、真实生成/账号权益与全主题 tooltip 视觉比对未完成。无登录/小号/原站写入要求继续生效；整个前端复刻目标未完成。

Root原生复验：实际标题拖动和真正双击由Canvas专属Pointer title capture保持，两种手势不互相吞；原生390px发现custom覆盖trigger后修复上下fallback，冻结重载后逐层Escape分别回custom/grid。2K保存刷新、4K显示/配额失败、desktop/mobile截图与来源限制见[整合验收](./canvas-storyboard-group-controls-functional-audit.md)，不将本机PNG说成远端上传。
