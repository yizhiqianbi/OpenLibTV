# Canvas 生成器纵向定位：实际 source 与本机适配边界

2026-10-13。仅静态读取已有归档，未 import / eval / 运行原站 bundle，未浏览器操作、联网、登录、账号读取或服务写入。没有修改 `src/`、根维护文档或运行完整检查。这里只讨论普通 IMAGE / VIDEO / AUDIO、专用 SCRIPT_V2 的实际生成器外壳；其他菜单、Popover、Agent 输入和 batch toolbar 不作为其定位依据。

结论：这四类可达 renderer 共用 GeneratorWrapper。收起状态固定在节点下方，并由 CanvasScaledOverlay 逆 zoom；该实际调用链没有纵向 flip、viewport clamp 或整卡自动滚动规则。展开后才成为居中 body portal，并用 90dvh 限高和 Prompt 自身滚动区。让默认新 VIDEO 的输入和按钮不因贴近底边而消失，应明确记为用户要求“节点交互自然”下的本机可达性适配。

## 1. 偏移与可复核 proof

以下范围为原 UTF-8 文件解码后的 **0-based UTF-16 code-unit、半开区间**，对应 JavaScript `String.indexOf` / `slice`。不能混用旧 inline 审计的 UTF-8 字节偏移。独立 [source proof](../artifacts/canvas-generator-vertical-view-source-proof.json) 同时提供 Unicode code-point、UTF-8 字节起止、原文摘录和文件 SHA256；遇到 emoji 等非 BMP 字符时以明确字段区分。

| 文件                | UTF-16 范围 / 实际模块                        | 本次直接证据                                                                                                                                    |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js`  | 139107–140872；790748                         | IMAGE / VIDEO / AUDIO / SCRIPT_V2 的实际 lazy registry 与 Factory；不是仅看到一个未调用 export                                                  |
| `1nx1kclu6uvka.js`  | 1264–1544；282660                             | SCRIPT_V2 lazy loader 解析到 `1sutpu54cdy46.js` / 327466                                                                                        |
| `3u6hjewm8qox_.js`  | 664281–667521；710871                         | BaseNode `node-shell`，relative、overflow visible；media content 和 afterContent 后挂 GeneratorFactory，dragging 时不挂                         |
| `3u6hjewm8qox_.js`  | 140915–141860；Factory boundary               | Suspense fallback=null；加载失败是错误与重试，未创建浮动 loading 卡                                                                             |
| `27g5ro4e8nocv.js`  | 13940–14342；830170                           | IMAGE 直接调用 I.default（976401），传 anchorWidth 和 expandedSize                                                                              |
| `24mj3em3412ij.js`  | 207959–208664；580897                         | VIDEO 直接调用 en.default（976401），expandable=!prompt.disable；不传 anchorWidth                                                               |
| `06hc5sgxzfqgd.js`  | 11154–11594；220012                           | AUDIO 直接调用 G.default（976401），不传 anchorWidth                                                                                            |
| `1sutpu54cdy46.js`  | 6471–7231；327466                             | SCRIPT_V2 直接调用 A.default（976401），expandable=!global/collab readonly；Prompt generatorType=script                                         |
| `1jgo2qrsqidfu.js`  | **483–6472；976401 完整模块**                 | shared Wrapper 的 inline、expanded、尺寸及八向 resize；纵向策略的完整局部核对范围                                                               |
| 同文件              | **6294–6444**                                 | 收起：`absolute -bottom-4 left-1/2 z-20 -translate-x-1/2 translate-y-full`                                                                      |
| 同文件              | **5207–6297**                                 | 展开：createPortal→document.body、fixed center、max90dvh/max90vw、mask 点击收起                                                                 |
| `23k0n_fspor7g.js`  | **112–1469；485615 完整模块**                 | CanvasScaledOverlay 只有 inverse zoom / dragging visibility / fade，没有边缘翻转定位                                                            |
| `1nd0f9k3q9sol.js`  | 55790–56024；112007                           | Prompt 从 `useGeneratorExpand` 读取 expanded，继承同一个 Wrapper                                                                                |
| 同文件              | 59842–60545                                   | Prompt normal min80/max100；expanded fill-height；UnifiedScrollAreaAutosize，viewport overflowX hidden                                          |
| 同文件              | 9940–10681                                    | 仅在 Prompt 内保持 caret 可见的 RAF / scrollTop ±6px；不是移动画布或整卡                                                                        |
| `0g99fjdic7btp.js`  | 59300–60443；280888                           | archived UnifiedScrollArea / Autosize：Mantine y-scrollbar、3px、hover/focus；其他归档 variant 同模块协议，不声称本次浏览器实际加载哪份重复定义 |
| `21_0xvlvkw1sz.js`  | 964311–964451；实际 ReactFlow caller          | 明确 `autoPanOnNodeFocus:!1`；不能用 RF 默认焦点 auto-pan 解释 generator 可达性                                                                 |
| `1h-b10gcvw4vl.css` | 268112–268136 / 331698–331791 / 328336–328369 | actual `bottom:-16px` / translateY100% / transform-origin:top                                                                                   |
| 同文件              | 300382–300416 / 895650–896200                 | actual expanded max-height90dvh / scoped Prompt scrollbar styles                                                                                |
| `29wmog9msv52n.css` | 0–220                                         | **仅 `.assetboard-generator-host`** 将 floating UI 改成 static normal flow；不能套到 Canvas inline                                              |

以上 SHA256 为整个原归档文件，不是摘录或格式化副本：

| 原文件              | UTF-8 字节 | SHA256                                                             |
| ------------------- | ---------: | ------------------------------------------------------------------ |
| `3u6hjewm8qox_.js`  |    1690665 | `c51798d2551086ee096babac1825bd489e9f63c4a5908afc4f437c76a16d6af6` |
| `1nx1kclu6uvka.js`  |       5718 | `ba111584d3fa6ec099568a5ec21e8ac1463f4965d2441f099a678348db9e18b7` |
| `27g5ro4e8nocv.js`  |      26253 | `0c9c05464140479f110386ad428e650e677038532c937ec00f16f82f669d14e2` |
| `24mj3em3412ij.js`  |     216306 | `f7ae3259a6ae4c95f4705a3e59c4bdc268a95f4480459fdac7048cecebe82a14` |
| `06hc5sgxzfqgd.js`  |      15104 | `6c34f2eeab5db09cc4a1298deb63b325ebf748d0df363477f820af982aef9790` |
| `1sutpu54cdy46.js`  |       9891 | `7bf8dd2b7aca3ba601b2f43e0a629055288e7bf40a9ae7ed45bcf8a27e9b2d5d` |
| `1jgo2qrsqidfu.js`  |      22325 | `9564887476fa86a5e6fcc209ecb904a6d4ba9b9a949e7d7ba6c485198df596e9` |
| `23k0n_fspor7g.js`  |      40247 | `0ffb058c8ce1bc5a0823d2a6a40a8199fea4d39e784a2aa186954d56c669209a` |
| `1nd0f9k3q9sol.js`  |     107122 | `25e66c35983123d15773f9d9b48f99d2043ec6e41b03ef0d12ea9ae4a6556e95` |
| `0g99fjdic7btp.js`  |      82722 | `21e3996ca3a89cf35375944f07f07302194864cd3920b6c03e63ae4cbbc5f343` |
| `21_0xvlvkw1sz.js`  |     974824 | `42ae33ee90fb1045f8d8cf495d60dbd6ca2d0edd47d7e33686dfea3aef073dc1` |
| `1h-b10gcvw4vl.css` |     907824 | `b27e7d0637a45724ec1c9caa611201fd9646a2797431239e1673ba91f6ab1dd5` |
| `29wmog9msv52n.css` |      35157 | `4f5ebcbb65ecc0b6715e498086477ff10e9a68bdf6587190d19de6bdaa9434cf` |

## 2. 收起位置与 overflow 的准确作用

BaseNode 的根是 relative `node-shell`，显式 `overflow:"visible"` / `width:"fit-content"`；generator 作为 media content 和 afterContent 的后方 sibling。媒体自身的 overflow 或 crop 不是生成器的整体滚动容器。Wrapper 使用 default large min/max660，compact min420/max430。只有 global readonly + large + IMAGE 传入 anchorWidth 时改用 rounded280–660；不能把它解释成纵向 viewport 测量。

Wrapper 的 `-bottom-4` 与 CSS `bottom:-16px`、`translate-y-full` 把卡放在节点底部下方 **16 world px**。CanvasScaledOverlay 使用 RF transform[2] 的 `1 / zoom`，origin-top，nodrag/nowheel/nopan，transform/opacity transition150ms。large 卡视觉宽不跟画布 zoom 缩放；source 没有把 gap 改成16 screen px。ordinary 的本机 screen gap、窄屏宽度和横向 clamp 已是既有适配，ScriptV2 的本机 gap 保留16 world px；本次不改变这些实现。

卡片内部 `relative flex w-full flex-col gap-0 overflow-hidden rounded-2xl`、0 4px 10px rgba(0,0,0,.12)；expanded 时补 h-full。内层 normal 是 `flex min-h-0 w-full flex-col`，expanded 才补 `min-h-0 flex-1 overflow-hidden`。这里的 **overflow hidden 是圆角与展开内容裁切，不能当作超出 viewport 时整卡可滚动**。

完整 Wrapper 与 ScaledOverlay 的局部检查均没有 getBoundingClientRect / ResizeObserver / MutationObserver / scrollIntoView / scrollTop / placement / flip。Wrapper 唯一 innerHeight 读取在用户展开 resize 开始时，唯一 createPortal 是 expanded 分支。proof 保留完整模块与 scoped token counts；这些局部事实不等价于“原站所有上游选中、fit、创建或焦点流程都不存在自动定位”。实际 Canvas ReactFlow 另明确关闭 autoPanOnNodeFocus，也没有证据把节点拖动的自动 pan 当成打开 generator 的规则。

## 3. 展开、尺寸与滚动

用户点击 top8/right8 的 size28 expand button（BroadPicture14，展开后 Minimize14）切换 Wrapper local expanded。源按钮没有这份 caller 的中文 aria/title；本机“展开生成器 / 收起生成器”是可访问性文案，不能冒称原站可见原文。

expanded 才 createPortal→document.body。遮罩 fixed inset0 black50，点击 mask 调 toggleExpand 收起；面板 fixed left50%/top50%、translate(-50%,-50%)、max-width90vw / max-height90dvh，宽高来自 local state，default800×600。expanded card 和 MainColumn 使用 min-height0 / flex1，Prompt 从 Context 读 expanded，承担剩余高度与自己的 y 滚动。

八向 resize 从中心拉伸：x/y delta 都乘2，rounded宽高先用 min660×360，再受 floor(window.innerWidth/Height×.9) 限制；小 viewport 的 max 小于 min 时 source Math.min(max, Math.max(min,...)) 会服从 max。pointerUp 与 pointerCancel 调相同保存回调。此处 resize max 用 innerHeight，外层 CSS max-height 用 dvh，不能说已有 source visualViewport/软键盘 listener。

**四个 actual renderer 都读写 `node.data.expandedGeneratorWidth / expandedGeneratorHeight`**。此前 inline 历史审计将 ordinary 持久化字段写作 generatorExpandedSize，属于本机普通 Frame 映射，不能作为原字段证据；ScriptV2 已按真实字段接入。本次只纠正证据，没有迁移或更改文档。global readonly 隐藏 expand；VIDEO 的 prompt.disable 与 SCRIPT_V2 的 global/collab readonly caller 另禁 expandable。

Prompt normal min80/max100，expanded min0 / fill-height，由 UnifiedScrollAreaAutosize 提供 y scrollbar。共享 module280888 配置 scrollbarSize3 / scrollbars y / hover，focus展示分支用 type always；CSS 默认 transparent thumb，hover/focus dark白40%、light黑20%。Prompt caret RAF 只对其 viewport.scrollTop 做±6px余量补偿，没有把画布 pan、节点 position 或整卡 top 改写。源没有整卡 max-height90vh 的 collapsed 分支；expanded 已限高也不表示任意大量参考卡和底栏的极小屏布局都被本次静态证据保证。

## 4. Lazy 状态与本机已知触发

source Factory 的 Suspense fallback=null；renderer 加载前没有显式 floating skeleton。ErrorBoundary 的 fallback 是 flex-column 错误 / 异常截断 / retry，且在 renderer 尚未成功时不进入 shared Wrapper。现有 CanvasGeneratorEntry 的非空“加载中 / 加载失败”浮卡、位置、retry owner 是本机可用性适配；它必须与 ordinary / ScriptV2 的定位规则一起维护，不能只修加载完成后的组件。

Root 提供的本机原生问题：1280×720 的默认新 VIDEO 卡 top385 / bottom615，浮卡 top631 / height221，因此 bottom852，输入与提交超出画面。此数字是 **Root 的本机 native 反馈**，本代理没有浏览器复验、截图、或原站登录态测量。调研开始时读取的本机 shared placement 只根据 board width 做 center / width；ordinary、ScriptV2 与 lazy fallback 各自仍构造 top。这个结构解释了为什么三处需要统一纵向适配，但不是本轮最终源码或最终验证记录。

## 5. 可实施适配建议，全部与 source 区分

用户已明确要求自然节点交互；在不改 graph / history / params / 视口的前提下，给可见卡补纵向可达性属于该授权范围。建议仍以 source 下方 anchor 为首选，只有 overflow 才调整。实现可选择“下方→有足够空间的上方→viewport 内 clamp”或直接局部 clamp；二者都是本机规则，本次源码没有授予一个特定 flip 优先级、8px/20px边距或 min-height 值。

建议复用一个 placement 生命周期：接受 board 真实 rect、当前 viewport / zoom、节点世界 anchor，以及实际 card DOM 高度；返回有限的局部 top 与必要可用高度。ordinary / ScriptV2 / lazy 同用，normal 不重挂载输入。参考选择、Focus、Mark 的 target OR仍只确定哪个 owner 可见，位置继续绑定 target 自己的节点，不能搬到 source 素材节点。不是用另一 feature 的 private Popover API 替代 generator。

若 card 比可用 viewport 还高，纯 top clamp 不能解决输入和 footer 可达。可以提供受限高度和局部滚动，保持提交栏可到达；整卡/主体滚动具体结构需独立验收，不能凭 source overflow-hidden 假称已实现。展开后的 body portal继续使用已有 Frame / dialog-stack；不能新增第二套 body lock，也不能因为 normal overflow 自动展开或执行 graph pan/fit，使用户选择和画布位置意外变化。

需要测量 card 本身的动态高度：lazy→ready、references / action chips / 模型参数 / 错误或 Quota retry、字体与窄屏 footer wrapping都会变化。观察器、viewport listeners 和若实际 CSS transform transition 在运行时才启用的短期 RAF随当前 owner清理，迟到回调不写新文档。上述生命周期约束来自本机维护契约，不是源模块新增的功能。虚拟键盘 visualViewport 或极短窗口的处理如实现，也应另记本机适配与实际设备验收。

## 6. 后续验证范围

后续真实 App / Native 应分别覆盖 ordinary IMAGE / VIDEO / AUDIO、SCRIPT_V2、lazy loading/error/retry；中部位置保持 source 下方、底边可到输入/参数/提交、顶边与超高内容滚动、390/320和视口resize。缩放、平移及 CSS transition中不漂移；group parent坐标只转换一次；展开/收起继续回同 owner与逐层 Escape焦点。定位变化不新增 history、不改 selection / nodes / edges / view / prompt、草稿150ms与保存原协议不被 remount破坏。

本审计只完成静态 source 与本机适配分类，没有生产修改、测试通过或 native可达性结论。真实生成、费用、账号、权限和运营 source继续不由布局适配冒充；原站整体功能复刻目标仍未完成。
