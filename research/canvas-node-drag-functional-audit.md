# 节点拖动、边缘平移与普通组落点验收

2026-10-11，继续处理用户反馈的节点交互不够流畅自然。当前无需登录、注册或小号；只操作独立本机验收项目，不执行原站脚本或生产写入。源规则分别见 [平移源码](./canvas-node-drag-pan-source-audit.md) 与 [分组源码](./canvas-group-drag-source-audit.md)。

## 本批实现

`domain/node-drag-pan-model.js` 保留两套协议：普通节点、真实组、从节点开始的多选及 Alt 副本采用 40px 边缘、每帧最多 15 屏幕像素；虚拟选区采用 80px、720px/秒、dt≤50ms，首帧 dt0 仍续帧，中心停止后下一次 move 再启动。普通使用当前 world cursor，虚拟框累积每次实际 pan 的世界坐标补偿；固定指针不会因视口移动丢失节点。

`useCanvasPointer` 在真正越过本机 4px 阈值后持有 RAF，先更新 viewRef 再发布视图、投影移动根。节点删除、第二指接管、取消/丢失 capture、Escape、blur、hidden、ready/readonly 与文档切换清理 RAF。普通中心和资产抑制期间持续采样属于本机适配；原站资产条件严格为 `elementsFromPoint` 命中 `[data-workspace-asset-panel]`，不泛指 Agent 或所有叠层。当前尚无完整非 modal workspace asset panel，接线只保留准确 marker 契约。

`domain/group-drag-model.js` 计划普通 node stop：外部节点完整包容才入组；已有父节点保持任意正面积重叠，完全分离才出组。位置转换保留世界坐标，维护原/目标 childNodeIds 和默认计数名称；不改普通组尺寸、不重排、不假造 zIndex、保留空组。普通多选从节点开始仍按 source primary fallback；虚拟 frame 不把全部选项批量塞入普通组。group/script/script-v2 本体排除；video_group 不被擅自作为普通目标。源 hidden group 顺序、Alt detached marker 的跨手势消费及专属视频尺寸清理均保留。

最终 pointerup 先投影其真实末位，然后在同一个节点 functional updater 中调用纯 finalizer。不能先调用 Graph 再从尚未 render 的 currentDocument 读取上一帧。已完成 epoch 允许该 updater 提交，新的手势、取消、A→B→A 与可写边界拒绝迟到 updater。回调仅返回节点，不另写边、记录历史或触发服务；移动/复制仍一次撤销。stop 捕获 selectedIds 与 releasePoint，避免拿后续事件做特殊组诊断。

实际浏览器发现：上方文本节点正文覆盖下方节点标题，点击下方正文选中后，其标题仍命中上方textarea，拖动不发生。按RF默认`elevateNodesOnSelect`补`node-stacking-model`：persisted base加selected1000；父级层级≥自身才parent+1。分数父级9.5/自身10仍10，不能用无条件Math.max(own,parent+1)。缺parent/循环保护为本机适配。Viewport memo派生并交给Node/Group原inline style，不改变keys、输入DOM、document或history。直接源码位置及标题span的pointer-auto例外见平移源码审计附录；不是禁用未选节点标题点击。React最佳实践及独立只读复核未发现重挂载/副作用阻断。

## 源差异与明确边界

本机沿用 4px、pointerdown 完整位移、首次越阈后启动 RAF、更新后的 board rect 和 pointerup 最终坐标。原 RF 默认 >1px，实际起拖 origin/启动时序和 source stop 使用已投影末位不同；这些是手感和生命周期适配，不能声称逐事件等同原版。

普通 group drop 默认保持原 source measured/stored 规则，NodeCanvas 注入 `canvasNodeSize` 与现有 renderer 的持久化尺寸一致。嵌套文档世界坐标/防循环及非法图原子 no-op 是本机适配。画像/分镜组的专属插槽、容量、ratio 与重排只准确识别并阻止 ordinary fallback，尚未完整执行；没有把它们伪装成普通组。原站特殊权益、RF 多修饰键选择完整状态机、Group 新点提示、真机/Safari、多节点性能与运营写服务继续未完成。

## 验证入口

纯平移30项、分组67项、临时层级10项和Pointer144项覆盖真实几何不变量、首帧/停止/重启、变zoom、取消、延迟updater、copy root与finalizer的无副作用协议。实际`NodeCanvas.node-drag.integration.test.jsx`8项保留真实页面、图、历史和存储：final pointerup入组、任意overlap保父/完全分离、外部partial不入组、virtual多选不入普通组、Escape无drop、非单位zoom stationary pan、virtual dt0续帧，以及selected层级/输入DOM/无历史和持久化污染；一次undo/redo与刷新恢复同时核对。相关7文件297项为去重联合统计，不能与全工程2140项相加。

冻结后最终`npm run check` exit0：232测试文件/2140项，格式、零警告lint/架构边界、核心strict TypeScript与生产构建均通过。测试21:40:59开始/60.03s，构建11.20s，日志`artifacts/canvas-node-drag-final-check.log`；strict不覆盖全部JSX、CI未远端执行。初次检查2128/2129通过，一项既有Agent上传预览等待超时；原断言未改，单项/整文件/联合41项与最终全检查通过，未据日志确定根因或宣称修复上传逻辑。

独立本机项目`canvas-node-drag-interaction-proof`的原生鼠标操作已验1280×720/390×844：完整入group、正面积重叠保parent/完全脱组、选中标题命中恢复、边缘pan、一次undo/redo及刷新后父子/视图恢复。窄屏实测scrollWidth390，不是请求尺寸代替DOM证据。截图`artifacts/penstudio-node-drag-desktop-proof.jpg`（1280×720/44813B）与`penstudio-node-drag-mobile-proof.jpg`（390×844/34719B）经正常本地QA UI写入loopback服务；没有用evaluate写DOM/state/storage或覆盖用户项目。固定指针连续RAF、虚拟框首帧等由真实controller联合回归覆盖，原生拖动结束图不冒充持续按住或触摸/手机UA/Safari证明。临时tabs已关闭、viewport已复原、截图服务已停止。

最终全工程检查、原生桌面/390px操作、截图及剩余范围在 [验证历史](./verification-history.md#节点拖动边缘平移与普通组落点2026-10-11) 记录。测试成功不代表原站所有特殊组、原生触摸或全部前端功能已验收，整个复刻目标继续未完成。
