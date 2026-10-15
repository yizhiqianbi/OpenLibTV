# Canvas 多选交互与输出连接验收

2026-10-11。回应用户“节点交互不流畅自然”的下一批优化。范围是实际本地Canvas虚拟多选外框、锚定工具栏、下游批量连接和共享目标创建；无需登录、不使用原站账号或写服务。该批不代表整个复刻目标完成。

## 直接依据与模块

具体源模块和字符位置见 [多选连接源码](./canvas-multi-connection-source-audit.md) 和 [选区视觉源码](./canvas-selection-visual-source-audit.md)，原客户端只读分析，不运行遥测或生产写入。

| 模块 | 职责 |
| --- | --- |
| `domain/selection-overlay-model.js` | 虚拟成员、真实单组排除、世界bounds、两次zoom补偿、screen投影 |
| `components/CanvasSelectionOverlay.jsx` | 灰色虚线外框、填充/五条拖动区域、24px圆与80px命中区域 |
| `hooks/useCanvasPointer.js` / `useCanvasTouch.js` | 多选整体移动、相对父组根节点、一次历史；一指Pointer/第二指pinch所有权 |
| `batch/CanvasSelectionToolbar.jsx` | 固定screen尺寸、选区上方14px、窄屏可达、开放菜单持续定位 |
| `domain/multi-connection-model.js` | 独立聚合资格/容量、support首enabled、一个共享target计划 |
| `domain/multi-connection-gesture-model.js` | 80px屏幕边缘平移、1×1世界release命中、独立screen Bézier |
| `hooks/useCanvasMultiConnection.js` | 10px/300ms、board capture/RAF、request/epoch/document身份、菜单/取消 |
| `components/CanvasMultiConnectionPreview.jsx` | N条viewport蓝线、游标中心圆；不产生临时图节点 |
| `components/CanvasConnectionMenu.jsx` | 多选六项196px/32px形态、键盘、焦点与8px边界 |
| `hooks/useCanvasGraphActions.js` | 全部来源/一个目标原子提交，原图CAS，草稿与历史投影 |
| `NodeCanvas.jsx` / `CanvasViewport.jsx` | 实际页面接线、writer互相接管、视觉反馈与资格分离 |

## 已接行为

虚拟成员将所选普通组换为直接孩子，与所选非组节点去重。单个真实普通组加其后代不另画虚拟框。fill和边界strip能整体拖动，保留原多选；根节点移动不重复移动已选父组孩子。普通多选隐藏各节点独立浮条和inline，保留共享工具栏。

右侧入口与普通端口是两个协议：≥10屏幕px起拖，短按<300ms且<10px切菜单；80px边缘720px/s、dt≤50ms。释放按1×1世界点取最后实际相交的非来源/非普通组节点，不沿用普通单连80世界单位吸附。physical hover只用于装饰；聚合规则决定提交，部分已连的frosted不阻断剩余来源补全。

空白或不可连接处打开文本生成/图片生成/视频生成/视频/音频/脚本生成六项菜单。一次只创建一个真实共享目标和全部应追加边，一次undo撤回目标/参数/边。短按按bounds定位、空白按release flow定位；text不注入普通单源图片转文本默认词。disabled仍可见、键盘跳过，失败无孤立目标或部分边。

预览来自当前真实节点世界坐标：每源一条蓝色viewport曲线，24px圆心位于真实游标，区别于right入口外17px。预览不进入graph、selection、保存、复制/分享/导出或undo。world anchor随视口只更新定位、不重聚焦。Escape回原opener；拖动隐藏重建后caller寻找新的稳定加号。外部pointer/focus不抢新焦点，复用dialog-stack child dismissal，无新增body锁。

Pointer/Touch/单连/多连接管前互相取消。document/ready/readonly/选中ID变化、blur/hidden、lost capture与unmount清旧request/preview/RAF；迟到release/choose不能写新文档，包括A→B→A。

## 草稿与撤销修复

输入后立即多选会卸载原inline。Graph保持原始nodes/edges身份做CAS，通过后才纯投影动作前历史及下一图，再复核原身份；投影错误阻断整次提交。普通Pointer/node动作的record也包含最后150ms草稿。

成功autosave仅在当前可写文档按最新graph基线合入有效草稿后ack，避免删retained后留下旧React正文被下一次保存覆盖。旧key flush不改当前UI，外部新词优先，Quota失败保留可重试草稿。立即pagehide/unmount依赖真实快照写入，不以卸载setState当作持久化证明。

## 验证证据

真实NodeCanvas多选集成12项覆盖整体移动/一次undo与redo、existing全部/部分/全重复、六项共享目标、disabled无孤儿、preview不保存、文档/readonly/blur/hidden取消。实际输入联合回归11项覆盖最后150ms输入→多选卸载→600ms保存→再次视口保存→共享目标→undo→卸载保留提示词。纯域/单连/Graph三文件129项、所有权联合10文件192项、视觉/Pointer78项、toolbar9项、Touch28项及menu/preview52项均有定向日志。这些集合交叉，不能相加当独立全套统计。

原生CUA1280×720：两图Shift多选、整体拖动保持两选且一次undo恢复位置；加号六项短按/Escape回焦点；拖到已有video增加两条真实边，一次undo回0。最终空白[650,480]释放两条预览，24px圆实测x638/y468，圆心精确[650,480]；选择图片后3→4节点、两条永久SVG路径，目标inline显示参考1/2、model lib-image-2.5-s；一次undo回3节点/0边。视频“沿海岸缓慢推进，保留输入”仍保留。

原生390×844：fit40%，toolbar保持可达且横向滚动；菜单x181.195/y305.211/width196/right377.195，page scrollWidth390；Escape回“拖拽连线或点击选择节点类型”。使用独立项目`canvas-multi-connection-proof`，不覆盖用户项目或提交生成。原生持续按住帧未捕获，release后曲线截图不等于持续拖动/真机GPU证明。

截图：`artifacts/penstudio-node-multi-desktop-proof.jpg`（1280×720/68749B）及`penstudio-node-multi-mobile-proof.jpg`（390×844/38174B）。原始截图字节经本地QA界面保存，没有evaluate写DOM/state/storage；临时写图服务已停止，viewport已reset，可绑定的独立验收tabs已关闭。首次dev离线产生的data错误tab受URL策略限制未绕过绑定，依赖临时tab生命周期清理。全量工程结果见 [验证历史](./verification-history.md#多选节点交互与输出连接2026-10-11)。

最终生产冻结后 `npm run check`通过 **225文件/1764项测试**：格式、零警告ESLint/工程边界、核心strict TypeScript与生产构建，进程exit0。测试20:09:58开始、43.87s，构建11.22s，完整日志 `artifacts/canvas-multi-selection-final-check.log`。随后仅补维护/验证文档并单独核对格式；strict不覆盖全部JSX，GitHub CI未远端运行。

## 适配与剩余差距

- 4px选区起拖、递归world position、renderer尺寸注入、8px窄屏clamp、reduced-motion、blur/hidden取消和本地CAS属于明确适配。
- source script-v2创建switch有落入TEXT分支；本地保留已注册正确factory，不能宣称该异常已做原站浏览器验证。
- 本批接虚拟多选。真实普通组递归输出pure helper已具备，但真实组完整多源入口、Group新点提示、Alt复制/Meta边策略、框体autoPan/高级group drop和完整特殊renderer仍未完成。
- 真机/Safari/native pinch、完整快捷键、大量节点性能、协作锁/团队主体权益、真实生成/费用/运营写服务仍待验/待接。当前继续无需登录/小号，整体目标未完成。
