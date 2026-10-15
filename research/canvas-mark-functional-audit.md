# Canvas 元素标记与节点模式接线（2026-10-12）

本批处理节点交互中的 Mark（“标记”/“元素选择模式”），保留已实现的参考选择、聚焦和普通手势；并把 Script 整张卡片真正按需加载。范围为本机前端与可注入的运营接口，没有登录、账号资源、原站写入、真实识别/生成请求或部署。整个复刻目标继续未完成。

## 源码依据与能力范围

准确 renderer、模式门控、point 请求、token/meta 和 Escape 协议见 [完整媒体模式源码](./canvas-media-focus-mark-source-audit.md)、[纯模型与 source](./canvas-mark-model-source-audit.md)、[点位视图](./canvas-mark-view-source-audit.md) 与 [提示词](./canvas-mark-prompt-source-audit.md)。源证据在本地公开脚本归档内，未执行原站生产 JS。

IMAGE/VIDEO 必须由当前实际 schema 的 `properties.magic` 提供能力。IMAGE 另外受 onlyFineTune/slashPreset、原 standalone parent 和已确认 helper/protection 条件门控；VIDEO 接收图片的标记，不变成可点击图片来源。不能把 ENHANCE、picture_edit 或字幕 renderer 未核对分支统称实现。本机 data URL 仅在明确 localMediaReady 时可作为素材；真实上传、权限与全局 publish protection adapter 仍未接。

| 行为          | 实现与真实边界                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 模式进入/切换 | 参考、聚焦、标记取消对方模式与未完成手势；当前 receiver 保持选择，Mark 不自动收起已展开生成器                                                |
| 点选来源      | 只允许实际 IMAGE 首项 URL；自身 IMAGE 可点，VIDEO 只能作 receiver；坐标来自真实 surface client rect，越界不钳造                              |
| 请求          | `{id:sourceImageNodeId,image_base64:rawPNG,point:[relX,relY],lang}`；AbortSignal 是第二参数；默认 source.available=false，无网络/读图/假标签 |
| 结果          | 真实非空 suggestions/label/bbox；stable ID 为服务 ID 加本次 point index；只改 receiver params.prompt/magicList，不新增连线                   |
| 提示词        | 合法 token/metadata 显示原文 label 和缩略图；未知/损坏/越界 token 保留 raw，明确区别于源“元素…”回退                                          |
| 选项切换      | 图片点位改变第一个该 ID token；提示词菜单替换全部同 ID 合法 occurrence，通知临时点；不能合并成同一替换规则                                   |
| 删除          | 图片点位删第一个 token 与该 metadata；普通提示词编辑按 source Core 清理不再引用的 magicList，最后一项为 undefined                            |
| 20 项上限     | 按合法 token occurrence 计数，识别前后各核对；重复 ID 也计数                                                                                 |
| 退出          | Escape/返回/显式退出只清临时 UI 和递增计数，保已接受的 prompt/meta；展开 Modal 的首个 Escape 先收起 frame                                    |
| 历史/保存     | 图计划投影末次输入后一次 CAS/history/flush；Quota 保图和已确认点，仅重试当前保存，不重复识别/建图                                            |

## 控制器、草稿和异步生命周期

`useCanvasMarkEntry` 为轻量静态入口，真实 `CanvasMarkControllerBridge`、controller、Surface/ModeBar 和 source 验证在独立 dynamic chunk。文档、mode、request 分别使用不透明 owner；旧 A→B→A、旧 cancel/exit、卸载、URL 内容变化、readonly/readiness、pagehide 不得重新解锁或覆盖新操作。完整 URL 数组按内容比较，不因无害 array 重建取消，也不遗漏其他输出 URL 替换。

识别只串行新的点选，已确认旧点在识别期间仍可切换/删除；返回结果合并最新图与末次提示词。blur/hidden 取消在途点但保已有 mode/点，pagehide 退休模式。读取采用当前显示图的自然尺寸 PNG，必要时匿名 CORS 重试，取消清理临时 Image/监听/Canvas。默认服务未连接在读图前退出，不能把展示一张公开 PNG 称为成功进行了 PNG 编码或识别。

Core pruning 同时进入 `useNodeGenerator` 的显式 prompt patch 与普通 draft projection，未满150ms的保存/导出也清理 metadata；非 prompt 参数更新不拿旧输入 GC 当前 metadata。剪切/原子删除后 UI 的临时点仍属于当前 mode，允许有效已确认点的选项/删除；没有实际 token/meta 改动不新建 history，真实 pending draft 则仍需提交/刷写。

当前普通 prompt 的本地 Ctrl+Z 只恢复 raw 文本/caret；Core 已清理的 metadata 不能凭空恢复，因此不把它称为完整 badge 撤销。真实 Mark 图事务的全图 undo/redo 另行回归。改进这条输入历史协议需要核对源码并与既有 node draft/history 边界一起处理。

菜单共用原 dialog-stack child dismissal，无第二套 scroll lock/focus trap。标记模式禁普通拖拽、resize、连接与非 IMAGE media 命中；保 receiver afterContent 输入可达，Space/中键/抓手仍通过已有 pointer owner 平移图片。Surface 最初误加 nopan，在实际 App 平移回归失败后删除，尾点击不误识别。标签按屏幕反缩放，框按百分比，菜单按 source relY>.6 决定上下；窄屏 clamp 与 ResizeObserver/RAF 是明确本机适配。

## Script 卡片按需加载与旧 CSS

详见 [Script 入口审计](./canvas-script-node-lazy-audit.md)。`CanvasNode` 现在引用 `CanvasScriptNodeEntry`，真实 old card/controller 保持原实现与 props。模块只缓存代码，文档/node owner、openRequest、readonly、失败重试和 StrictMode 分别回归。同 owner 不重建内部草稿和选区，旧 owner 迟到加载不显示。

首次仅提前导入 storyboard.css 导致旧 CSS 被挪到 lazy chunk，是已发现并修正的构建错误。通过实际 Rollup 静态 DFS 获得22份旧 CSS（包含 Mantine 组件样式），入口按旧顺序全部 eager，JS 继续 lazy。只读 build.write=false 的 proof 证明：移除仅5条新加载态规则后，CanvasPage CSS 与旧191954字节基线完全相同，Script chunk 无 CSS、也不在 CanvasPage static closure。最终生产构建与 SHA 另保存当前检查证据。

## 工程验证与失败记录

- reader6项通过，日志 `canvas-mark-image-reader-tests.log`。
- owner/source/capability/model/entry 最终5文件136项：19:16:06/1.06s，`canvas-mark-owner-review-source-complete-tests.log`，含严格 mode cancel、真实 Bridge StrictMode、已 pruning 临时点、pending 期间旧点操作，格式/lint通过。
- 提示词8文件95项：19:07:33/2.92s，`canvas-mark-prompt-final-tests.log`；原菜单、caret、IME、引用 DOM 和历史协议保留。
- 原视图3文件21项：18:51:16/1.57s，`canvas-mark-views-final-light-tests.log`；原实际 Mark14项加视图21项在 Space 修正后35项通过，`canvas-mark-actual-views-after-pan-tests.log`。
- metadata/draft/generator/focus/Mark/reader 在 Script lazy 前6文件52项：19:20:22/5.42s，`canvas-mark-root-joint-before-lazy-script-tests.log`。初次错误 focus 路径只实际跑3文件19项，不能记为包含 focus。
- Script lazy Entry15项与 CSS 修正后再验：19:39:19/1.68s，`canvas-script-node-entry-css-tests.log`。
- 旧 Script actual joint 初次9文件92项27失败；原因是测试在真实 lazy code mount 前同步查询旧卡片/toolbar。只改4个 fixture 的真实 DOM 等待，原图、选择、历史、配额、焦点断言保留。第一次等待修复仍错把 pending restore 当 empty，8文件79项1失败；第二次按实际三种卡片等待，正确包含 Focus13的9文件92项在19:43:26/13.16s全部通过，`canvas-mark-lazy-script-final-joint-tests.log`。
- 新增3项真实 App atomic deletion/tempPoint/未150ms GUI export回归，Mark集成现在17/17，19:51:59/7.69s，`canvas-mark-actual-backspace-draft-initial-tests.log`；keydown/beforeinput是受控jsdom事件，不称真正原生识别操作。
- 首次完整check被 `useCanvasMarkMode.js` 格式阻断，`canvas-mark-initial-format-check.log`；只格式修正。接着352文件4738项的全量Vitest有2文件12失败（toolbar11、CanvasNode1），19:54:49/147.50s，`canvas-mark-before-toolbar-waits-full-check.log`，全量未通过也未进入build；仍是旧fixture同步读取lazy卡片。只加真实toolbar/下载控件await，原断言未改，2文件13项19:57:48/3.95s通过，`canvas-mark-toolbar-waits-tests.log`。
- 生成器横向修正后13文件127项联合实际回归20:03:24/13.53s全部通过，`canvas-mark-placement-final-joint-tests.log`；helper 8项替代此前1项，正式全量统计见下面冻结记录。专项集合有重叠，不累加成独立验收数量。

其他已修失败与夹具边界见 [owner review](./canvas-mark-owner-review.md)：StrictMode layout cleanup 丢 API、旧 mode cancel 误取消新识别，以及 metadata 已清理后临时点操作过严，都由保留的真实失败测试驱动修正。错误 pagehide/DOM geometry/raw identity 夹具也单独记录，不能混称全部生产 bug。

## 生成器实际宽度与边缘

原生888px窗口发现compact panel右侧被截，旧helper仅<=767夹紧。按 [横向适配审计](./canvas-inline-generator-board-placement-audit.md) 修改纯定位/hook，普通、ScriptV2和加载/错误态三个caller接 `{center,width}`；真实board宽同时决定660上限与20px边距，只有overflow改变center，合法原center精确保留。未测width undefined保CSS回退，Observer/window.resize与退休guard共用，不改节点位置、view或CSS。

888px修后panel207.998..867.998/width660；Agent打开后board568、panel20.001..548.001/width528，生成按钮507.001..539.001。390pxpanel20.004..370.004/width350、生成按钮329.004..361.004，文档宽390。垂直保持源“节点下方”规则，首次缩窄时footer仍可能落在viewport下方，没有自动翻转/竖向夹紧；原生抓手向上平移后panel422.225..739.819、按钮698.819..730.819完全可达，模式保留且0点。不得将此横向优化称为任意视口的全部自动可达。

接口分阶段HMR时旧numeric hook与新object caller短暂混合，11:59:33.187Z出现NaN left error；已有历史日志保留。最终三个caller/新hook一起冻结，联合和完整check通过，12:11:52.958Z最终冷加载后无新增error/warn。这不是全部开发历史日志为空。

## 原生浏览器范围

原生输入使用现有 in-app browser tab2 与实际公开 PNG，两节点/一连线的本机测试画布；没有 DOM/localStorage 注入，没有将夹具识别响应塞进原生页面。

已观察：IMAGE 标记进入/退出、点击公开 PNG 后默认未连接提示且0点/0框、原聚焦卡片和2K/3:2保留、返回保51% zoom、Mark→Focus互斥；展开生成器启动Mark不收窗，首个Escape收frame但保Mark，第二个退出。VIDEO默认StarVideo 2.0 入口可进Mark，来源仍只有IMAGE；测试新增VIDEO随后用UI撤销。

390px 模式条 left41/right349/width308、文档宽390；320px left12/right308/width296、高82、文档宽320；输入聚焦时原生Escape也退出并保已有聚焦/连线。截图 `canvas-mark-native-desktop-proof.png` / `canvas-mark-native-narrow-proof.png`。

实际 Script card 首次懒加载后显示原三个空态按钮，手动编写进入真实全屏阶段/镜头表格；两次UI undo恢复原两节点/一连线。截图 `canvas-mark-script-lazy-editor-proof.png`。这不是服务器生成成功，也不代表所有Script状态原生验收。

实际GUI导出 `canvas-mark-native-export.json` 与先前聚焦最终导出的 nodes/edges完全相同（2节点/1边），没有新增magic token/metadata，只有视口变化。首次错误在导出类型弹窗出现前等待download导致CUA30秒超时；恢复同tab后先选“画布文件”才实际成功，不将首次尝试记为成功。

后续综合VIDEO/Script创建/撤销、fit与多次native节点选择后，最终导出仍保原节点data和唯一edge，但两节点position和先前Focus基线不同；没有逐手势导出定位发生点，不能宣称整段综合操作的nodes完全不变。随后单独的Mark抓手原生操作以前后实际GUI导出校验，nodes/edges严格相等，仅view.y从214.3163429696889变164.3163429696889，zoom0.8173681279002469和view.x不变；`canvas-mark-native-final-export.json` / `canvas-mark-native-hand-pan-final-export.json`。这条独立证明与先前综合流程分开，不据此反推其它原生操作。

受控 App 验证包括识别正向fixture、20上限、保存失败、旧文档/迟到结果、菜单和Space持续平移；原生没有识别服务，未验真实suggestions/PNG编码跨域成功，也没有真实持续Space修饰拖动/touch/Safari输入。原生抓手已实际追加验证。当前viewport override已复位，最终UI已退出Mark、保receiver/聚焦/模型参数，浏览器proof见 `canvas-mark-browser-proof.json`；截图 `canvas-node-interaction-final-proof.png` 取自已验证的最终冷加载Mark界面，旧 `canvas-mark-native-final-proof.png` 为横向修正前证据，不能当修后证明。

## 最终冻结记录

官方Node24.19.0完整 `npm run check` exit0，**352文件/4745测试全过**，20:04:40/101.45s；format、零警告lint/架构规则、核心strict与生产构建10.61s通过，`artifacts/canvas-mark-final-check.log`。依赖DEP0129提示保留，strict不覆盖全部JSX，CI未远端执行，测试统计含独立影游扩展。

CanvasPage690228bytes/gzip229314/SHA d0e5dc9f5a0dd1633bb7cfa3eeefe5524a6e32c86f7ea54a07952a0fdf4c5d26；Script220148/gzip72470、Mark23974/gzip9030，正式产物Acorn静态import closure不包含Script或Mark，dynamic imports真正指向它们。Canvas CSS192511/gzip32961；PostCSS仅移除5条新load-state规则后与旧191954字节基线逐字相同，22份源CSS SHA仍匹配DFS证据。既有900000阈值未抬高，未扩大manualChunks。

正式检查前1087个源码/配置/测试SHA已冻结，检查后完全相同；实际生产产物、closure/CSS证据见 `artifacts/canvas-mark-build-proof.json` 与source snapshot。最终检查后仅维护文档/原生证据，定向格式与SHA复核单独记录，不因文档再宣称跑了一套新的全量测试。原生最终冷加载12:11:52.958Z后mode/默认阻断/宽度/完整按钮均可达且无新增warn/error，控件和素材均来自现有本地实现，没有注入假的识别结果。

本机未部署，生产仍是独立影游冻结版本；真实服务、未核renderer/capture、完整prompt badge undo、竖向自动可达与真机边界继续未完成，整个复刻目标保持ACTIVE。

维护后定向14份文档Prettier check通过，日志 `artifacts/canvas-mark-documentation-check.log`；1087份源码/配置/测试SHA复核0变化，结果存入build proof的postDocumentationSourceCheck。这不是第二次新的全量check。

浏览器收尾时原tab2已转到3D编辑器 `/animation-preview?newProject=true`；不把该界面作为Canvas验收，不再操作/导航该标签。最终展示截图恢复自已验证的 `canvas-mark-native-final-cold-mode-proof.png`，未注入或重建UI，当前用户页面保留。
