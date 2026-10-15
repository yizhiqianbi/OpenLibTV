# 节点连线悬停、倾斜与白光反馈（2026-10-11）

## 直接证据

只读分析已保存公开客户端 `research/source/3u6hjewm8qox_.js`，未执行其生产逻辑、遥测或写操作。本地脚本按字符串提取。下方为 UTF-8 解码后 JavaScript 字符偏移；不同工具若按字节编号会不同。

- `useConnection3DTilt`：`k(e)` 开始约 647,212；导出模块 `386951`，实际导出字符串约 650,919。
- Glow / Frosted：`N` / `S` 约 649,995—650,880。同模块输出默认 Glow、`NodeFrostedOverlay` 与 hook。
- `NodeShell`：`er` 约 664,314，`710871` 默认导出；完整倾斜根与内容叠层调用在约 665,850—667,500。
- `research/source/0leiedr1esdbe.js`：`selectIsConnected` 实现 `tz` 在约 77,889，`selectIsAnyConnected` 的 `tK` 在约 78,026。
- `research/source/0f2shqexgq0gc.css`：文件起始含旋转属性、warm-white 梯度、扩散、环境光、无效脉冲；约 9,300 有交互期间暂停 / 去 blur 的优化。

这些观察是公开源码证据，不等同登录原站实际拖动的 GPU / 触摸验收。

## 真实状态规则

`activeConnection` 是 `connectingSourceId !== null`，或 `connectingSourceIds.length > 0`。冻结画布强制所有连接 / hover 反馈关闭。单源或多源均不能把每一个节点模型的可连策略另算成一套视觉规则。

`mouseEnter` 只记 inside；没有连线时启用普通 `nodeHovered`。连线期间要真正 `mouseMove` 才启用连接悬停 `p`，普通 hover 清零。多选连线也可由 store 的 `multiSelectHoveredNodeId` 及 `multiSelectCursorPos` 控制。

设 `over = activeConnection && connectionHovered`，`origin = originIds.includes(nodeId)`，`connected` 是任一 origin 与 node 的双向**直接**边（包含 reference 边，无路径传递推断）：

| 状态 | 条件 | 内容反馈 | 倾斜 |
| --- | --- | --- | --- |
| target | over 且非 origin、非 connected、非 invalid | 三层 warm-white 光 | 是 |
| invalid | over 且非 origin、非 connected，且明确 `connectingInvalidTargetId === nodeId` | 白色脉冲及灰黑模糊遮罩 | 否 |
| blocked | over 且 origin 或 connected | 仅灰黑模糊遮罩 | 否 |
| none | 无连线、没悬停或 frozen | 无这些叠层 | 否 |

blocked 优先于 invalid。普通 body hover 即使某个完整 validator 未来会拒绝，也不会自行变成 invalid。`invalidTargetId` 是源连接验证的规范 target，不可为了 reverse 输入端拖动的视觉方便把规范 source 改成 target，也不可把所有不支持类型提前涂灰。吸附端口验证与悬停视觉是不同协议。

## 倾斜与源层级

根据当前鼠标 client 坐标及屏幕矩形：`rotateX = clamp(-8 * normalizedY, -8, 8)`；`rotateY = clamp(8 * normalizedX, -8, 8)`，中心为矩形中心，分母分别为半宽 / 半高。采用 `requestAnimationFrame` 合并移动，宽高无效时不更新。

视觉变换为 `perspective(800px) rotateX(...) rotateY(...)`，原点 `center center`。target 时 `transform 80ms ease-out`；退出返回零角度 `400ms ease-out`，400ms 后不再保留恢复 transform。位置、宽高、图数据及边不写入。

源 React Flow 外层世界坐标 wrapper 不倾斜，内部 `node-shell` 整体倾斜：title、content、两个外置 handles、afterContent、generator 都是该 shell 的后代。Glow 与 Frosted 则插在 content surface 中，Frosted 不盖外置 handles 或 title。

当前拆分组件只提供装饰及 `tiltStyle`，不创建替代大 wrapper。接线应由 `CanvasNode` 保持稳定 world article / 测量 ref，永久内 visual shell 包住所有视觉子项；不能为了倾斜而重建 textarea / player。本批 root 已把 inline generator 作为 afterContent 放入永久内 shell，并以 coordinateOrigin 保持原世界落点；body wrapper 将 glow / Frosted 限在正文，标题和外置端口不被遮罩。实际GPU与输入持久化结果见主审计。

## Glow / Frosted 参数

- ambient：inset -4px，radius 16px，z49，blur4px，opacity .6，1px `#ffffff1f`。
- diffuse：inset -2px，radius 14px，z49，blur6px，4px padding masked ring。源 warm-white conic gradient 0 / 15 / 25 / 35 / 43 / 50 / 57 / 65 / 75 / 85 / 100% 色阶。
- border：inset0，radius12px，z50，1px padding masked ring。源 0 / 20 / 30 / 38 / 44 / 50 / 56 / 62 / 70 / 80 / 100% warm-white 色阶。
- 两个 conic ring 以注册 angle 属性从0到360°，1.2s linear infinite；mask 使用两层线性梯度 content-box / border-box，WebKit xor、标准 exclude。
- invalid：inset0/radius12/z50，1.5px `#ffffff40`，1.5s cubic-bezier(.4,0,.6,1) 脉冲；0 / 100% 边`#ffffff26`无光，50% 边`#ffffff80`且`0 0 8px 2px #ffffff26`。
- frosted：inset0/radius12/z50，black .35，backdrop-filter 与 WebKit backdrop-filter blur6px，pointer-events **all**。其余装饰 pointer-events none。

本地类名与注册 angle 属性加 `cv-` 前缀避免污染其他域；保留数值与颜色。添加 reduced-motion 停止动画及 visual shell 旋转是本地无障碍适配，不能称为原 CSS 已有该分支。

## 适用节点证据范围

hook 本身不检查 nodeType/action；**调用 hook 的 renderer** 决定哪些节点有此反馈。公开 chunk 已核对 custom、ImageNode、ReferenceNode、TextNode、VideoNode、AudioNode，以及 script / ScriptV2Node、VideoClipNode、video_group / video-story、ScreenplayNode、ShotBreakdownNode、DirectorConsole3DNode、SpaceScene720Node、DirectorStudioNode 的相应调用。

该层不创建 type/action 白名单、不复制连接 resolver、不基于空数据 / 未知账号能力猜测可连。普通 group renderer 及额外外部素材 renderer 不能仅因 registry 注册便算其反馈已核对；多选源 store 已有源码，但本地多选连线流程应独立核对和接线。

## 本地分层与验证

- `domain/connection-feedback-model.js`：纯 flags、双向直接边与屏幕几何规则。
- `hooks/useCanvasNodeConnectionFeedback.js`：受控 physical `hoveredNodeId` / `cursor` 和无捕获 click-linking 的本地 mouse 事件两种入口；稳定 `elementRef`、合并 RAF、400ms 返回；document / node / gesture / frozen 的独立 owner。
- `components/CanvasNodeConnectionFeedback.jsx` 与局部 CSS：无 wrapper 装饰层，内容遮罩保持源 pointer hit 行为。

2026-10-11 17:25:51 定向检查：3 个文件、36 项测试通过（717ms）；ESLint 新生产与测试文件零警告。覆盖 source 状态优先级、双向 reference 边、非传递连接、±8 倾斜、真实显示矩形、非法几何、受控 null（pointer capture origin 不能伪装目标 hover）、local 首次 move、RAF 合并、边 / invalid 变化、A→B→A、gesture 替换、frozen、StrictMode 与400ms恢复清理、原参数 CSSOM 和 reduced-motion。

组件测试不是实际 held-pointer GPU 图像、真机触摸或 Safari 证明。实际 `CanvasNode` / connection controller / Viewport 接线、连续 native pointer 拖动、保存不含视觉状态、完整工程检查及桌面/窄屏浏览器结果由本批主审计另外记录。
