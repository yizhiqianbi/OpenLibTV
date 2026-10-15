# Canvas 节点手势与滚动归属（2026-10-11）

本批按用户“节点交互不自然”的反馈优化当前本地 Canvas，并按用户要求将本地产品品牌改为 PenStudio。当前版本继续无需登录、注册或小号；真实生成、账号资源与服务器写服务未接入。本文区分原站证据、本机体验调整、自动化回归与 Root 的实际浏览器验收。

## 源证据与主动适配

- `research/source/1kb-4b4zv9_2a.js` 的原 React Flow store 明确默认 `nodeDragThreshold:1`、`connectionDragThreshold:1`。实际 Canvas renderer `research/source/21_0xvlvkw1sz.js` 未设置 `nodeDragThreshold` override；本批没有将研究脚本作为生产运行库。
- 该 Canvas renderer 使用独立 pan / node drag 配置；已有公开只读 renderer 允许 pan / scroll，禁止 node writes。`research/canvas-inline-generator-source.md` 已核对：只有真正 dragging 时不挂载节点内嵌生成器，输入外壳默认 nodrag / nowheel / nopan。
- **本机拖动阈值主动使用 4px 屏幕距离**，容忍轻点时鼠标抖动。这是本次改善手感的决定，区别于原库默认 1px，不能据此宣称与原阈值完全相同。开始拖动后仍按当前手势初始 zoom 将像素位移转换为节点父级相对位置。
- 原 `useTouchMode` 通过 `(pointer: coarse) and (hover: none)` 检测，返回 panOnDrag true、nodesDraggable / nodesConnectable false，见 `artifacts/script-workflow-source.pretty.js:80577` 附近。本批单指针生命周期不是完整触摸模式或双指 pinch 的复刻；该范围仍待专门接线与实测。

## 生产责任边界

| 模块                            | 本批行为                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useCanvasPointer.js`     | 单指针 / 文档所有权、节点选择与移动阈值、手型 / Space / 中键 pan、末位落点、capture 释放、取消和 blur、紧随手势的 click guard |
| `components/CanvasViewport.jsx` | capture-phase pan 仲裁；pointerup / cancel / lostcapture 接线；向普通节点及组透传 click guard                                 |
| `hooks/useCanvasWheel.js`       | 文本 / editable / 原 nowheel / 真实滚动容器归属检查；仅板面 wheel 消费并 preventDefault                                       |
| `hooks/useCanvasKeyboard.js`    | Space keyup / blur / unmount 复位；普通画布单键不抢 Ctrl / Meta / Alt 浏览器快捷键                                            |
| `canvas.css`                    | 手型节点 grab 和实际 pan grabbing 光标                                                                                        |
| `NodeCanvas` / 节点视图         | 接收 `shouldSuppressClick`，阻止 pan / 真正拖动后的后续 click 重选或打开编辑器；集成回归与实际浏览器结果见下文                |

普通 pointerdown 立即选择节点，**不记历史、不设置 dragging**，因此普通单击不会卸载再创建内嵌输入。达到阈值才记一次手势历史，后续 pointermove 增量提交当前节点位置，pointerup 接收真实 PointerEvent 的最终位置；没有把提交推迟到松手，也没有新增影响自动保存的定时器或 RAF 队列。旧 MouseEvent 夹具没有 pointerId，保留最后 pointermove 的兼容读取。

手型 / Space / 中键只接管节点非 UI 区域。textarea、contenteditable、按钮、媒体控件、浮动菜单、分镜编辑区和内嵌生成器仍拥有自身事件。readonly 节点普通左键仍可选择和预览，只有 readonly 空白背景默认 pan；明确 pan 手势仍可从节点非 UI 区域开始。右键和非 primary pointer 不启动节点拖动。

已有连接目标的 pointerdown 在 stopPropagation 后、Shift / selection / record / capture 之前返回，保留现有 click-connect；不借本批创造新的原站连线协议。pointercancel / lostpointercapture / window blur 清理当前手势，不把取消事件的无效末位坐标应用到图。切文档、readonly 或 ready 变化释放旧 capture，不移动同 ID 新文档节点。

wheel 检查输入 / 媒体与明确 nowheel 区域，同时沿祖先寻找实际 overflow auto / scroll 且内容超过 client 尺寸的容器。它们的滚动不平移或缩放画布；仅 Canvas 本身消费时阻止浏览器再滚动。现有 zoom 系数和快捷键没有冒充原站所有缩放设备策略。

## 定向验证

2026-10-11 15:32:34 运行：

```text
npx vitest run src/features/canvas/hooks/useCanvasPointer.test.jsx src/features/canvas/hooks/useCanvasWheel.test.jsx src/features/canvas/hooks/useCanvasKeyboard.test.jsx src/features/canvas/NodeCanvas.test.jsx
```

4 个测试文件、74 项测试全部通过，5.36s；包含已有 NodeCanvas 切文档 / readonly / 多选回归。新用例覆盖：单击与小于 4px 抖动、一次拖动历史、组父级相对位置与最后落点、显式 pan、readonly 选择、右键 / 第二指针、编辑控件保护、连接目标 click、cancel / lostcapture / blur、切所有权、最后框选矩形、wheel 原生归属与监听器清理、Space 和浏览器快捷键。

对 3 个 hooks、3 个 hook tests 和 CanvasViewport 执行零警告 ESLint，已通过。上述生产文件、测试、Canvas CSS 已由 Prettier 格式化。这组检查仅证明所列事件边界和已有回归通过；整批 `npm run check` 由 Root 另行执行，最终结果写入验证历史，不由本文提前宣称通过。

## 实际 NodeCanvas 集成回归

2026-10-11 15:36:59，`src/features/canvas/NodeCanvas.interaction.test.jsx` 的 7 项测试全部通过，定向 ESLint 与 Prettier 通过。它挂载实际 NodeCanvas、pointer hook、历史和内嵌输入；仅将 `useContent` 替换为现有真实模型样本目录。

- 普通 click 与 3px 抖动：保持原输入 DOM、正文和选择；undo / redo 均不产生条目。
- 多次 move 和最终 pointerup 新坐标：最终节点到 `(170,190)`，一次 undo 恢复原位置且 undo 再次不可用；redo 恢复新位置。
- hand / Space / middle 从未选节点开始 pan：只改变 world view，保留节点位置、原选择、输入 DOM 与历史。
- 已有 source handle 到目标 body click：不捕获目标、不拖动目标、不改原选择；只生成一个 edge，一次 undo 删除 edge，redo 和卸载后持久化也恢复同一条边。

这些用例保留实际 pointerId / isPrimary / 最终坐标，并明确区分源节点与目标节点；不是使用单个纯模型夹具推断整条界面交互。

## Root 实际浏览器验收

本段依据 Root 在本地真实 UI 的验收回报，使用 `http://localhost:5173/canvas?projectId=script-media-history-proof`，**实际 viewport 为 1280×720**。

| 操作                                          | 实际结果                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------- |
| 单击视频节点                                  | 内嵌输入持续存在；undo disabled，无空历史                                              |
| hand 从节点拖动 `(80,40)` 屏幕像素            | world 的 x / y 相应变化；节点仍为 `(1650,650)`，原选择保持                             |
| 普通节点拖动 `(40,25)`                        | 节点到 `(1690,675)`；一次 undo 回 `(1650,650)`，随后 undo disabled                     |
| source image output handle → video body click | 增加一条 edge；目标位置与选择保持；一次 undo 恢复 edge 0，随后 undo disabled           |
| 同一工作区历史菜单和失败 task ID              | 日期与视频绑定图源可展示；点击复制后真实 Meta+V 粘贴得到完整 `local-failed-task-proof` |

复制验收的 API clipboard 代理 `readText` 返回空，因此不将代理读取作为成功依据；成功依据是实际点击复制后、真实键盘粘贴到 QA textarea 得到完整 ID。该 taskInfo 与媒体历史来自明确的本地适配验收夹具，不能称为真实服务器任务、费用或源账号资源。

Root 后续在实际生效的390×844 tab完成新版验收：主页PenStudio字标加载宽96px、本地工作区和会员入口无重叠；实际Canvas恢复最后输入和active，单镜dialog x16/width358/right374、菜单right382，页面宽390。只读直接访问无需登录，版本菜单无写操作而定位保留两层dialog。Blender 390px两张新SVG加载，导航和联名正文可见；学院显示“欢迎来到 PenStudio 学院”，标题SVG x20/width350/right370，页面宽390，公开课程原联名内容保留。工具视口按实际innerWidth取证，未将未生效的320px请求标为通过。

实际文本节点原生滚动后textarea.scrollTop由0变406，world保持 `translate(-1.11111px, 122.083px) scale(0.405556)`；滚动正文不会平移画布。最终完整 `npm run check` **202文件/1227测试通过**，格式、零警告lint、核心strict TS及生产构建通过；日志 `artifacts/penstudio-node-interaction-final-check.log`。截图和批次记录见 [验证历史](./verification-history.md#penstudio品牌节点操作与媒体历史2026-10-11)。

## 品牌改名范围

当前本地产品名为 **PenStudio**。生产代码核对到页面 title、桌面侧栏 / 移动顶栏、促销标识、Canvas / Agent、Studio、学院外壳、Plugin 与 Blender 的产品入口文案已使用新品牌。对应原站 LibTV 调研参照和功能复刻目标继续保留。

本地品牌素材为 `public/assets/penstudio-logo.svg`、`penstudio-mark.svg`、`penstudio-blender-title.svg`、`penstudio-academy-title.svg`。Sidebar / Topbar / 学院播放头部等使用新 logo；Blender 合作标题和 Plugin 标识采用专属本地 SVG。`shell.css` 对 light theme 的相应白色 logo 保留 invert 规则。这里记录的是生产接线范围，不能把接线等同于所有路由品牌像素已逐一验收。

品牌改名不迁移 `libtv-*` 浏览器持久化 key，不改源码证据、内容来源、版权、原站 URL、接口 host 或公开下载文件；例如 Plugin 安装文案显示 PenStudio，而原公开 CLI Skill ZIP 仍指向原 Liblib 静态资源。它不是已经发布的独立 PenStudio CLI / Blender 插件，也不代表修改了远端包。

公开课程 / 作品 / 截图等内容样本中的原站名称保留来源；客服二维码明确显示“原站 LibTV 客服（公开样本）”和原站 alt，不能冒充 PenStudio 运营客服。新品牌不会创造会员、团队、已购或认证权益。

## 后续节点手感更新

触摸/双指、正反拖连、类型菜单、原子创建、source fit与预览的后续进展见 [触摸连接审计](./canvas-touch-connection-functional-audit.md)。下面的历史剩余范围保留当时状态，以后续审计为当前判断依据。

## 剩余范围

本批验证了所列桌面节点交互，没有完成全部 Canvas 工具与所有路由。完整 source touch mode、双指 pinch、真实手机 UA / Safari、原站连线拖拽与自动 pan、全部缩放设备策略和大量节点性能仍需按源单独研究及验收。4px 阈值属于本机主动体验调整；本批未引入 RAF 合并或延迟 commit，不以此宣称已测得高负载性能提升。真实生成、费用、服务器写入和账号资源继续未连接。

维护证据的原始批次说明保留在 `artifacts/canvas-node-interaction-audit.md`；后续新增实现或验收须更新本文、覆盖清单和验证历史，不能用这批绿色检查把全站复刻目标标记完成。
