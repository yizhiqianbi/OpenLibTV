# Canvas 生成器按需模块与加载边界审计

2026-10-12。范围为生产CanvasPage超过900kB提示的真实模块归属、source GeneratorFactory协议和两个生成器的小型按需入口。没有增加Vite阈值、manualChunks或新依赖，不运行归档bundle/遥测/服务。Root负责Viewport接线和正式build/fullcheck；本文作者持有新入口、专项tests与此审计。

## 1. 生产基线与静态依赖

现有生产 `dist/assets/CanvasPage-Zvg9see3.js` 为 **923036 bytes**，Root正式build显示923.04kB/gzip304.97kB，超过vite.config.js的900kB阈值。923036是UTF-8产物字节，不能把JS string.length=896696当同一数值。未修改该产物。

作者用Node24调用Vite `build({build:{write:false}})`，临时只读插件读取Rollup generateBundle模块图，不改dist/config；确认CanvasPage主chunk共459modules，只有既有资产选择器、browser downloader、StudioEditor等dynamic imports，生成器仍static。各模块renderedLength为Rollup未minify渲染长度，不能简单相加冒充最终体积减少量：

| 基线模块                      | renderedLength | 所属       |
| ----------------------------- | -------------: | ---------- |
| CanvasNodeInlineGenerator.jsx |          12235 | CanvasPage |
| ScriptV2NodeGenerator.jsx     |           4218 | CanvasPage |
| ScriptV2GeneratorView.jsx     |          12125 | CanvasPage |
| useScriptV2Generator.js       |           8780 | CanvasPage |
| NodeGeneratorPrompt.jsx       |          10035 | CanvasPage |
| GeneratorFrame.jsx            |           5452 | CanvasPage |
| GeneratorReferences.jsx       |           4475 | CanvasPage |
| GeneratorModelMenu.jsx        |           3032 | CanvasPage |
| GeneratorSettings.jsx         |          15458 | CanvasPage |

较大base模块还有react-number-format57209、floating-ui50842、CanvasViewport33879、NodeCanvas33629、storyboard-grid纯模型31150、ScriptAssetsView30686、v2-video配置28817等。两generator拆分不会消除所有Canvas成本；GeneratorSettings仍被Inspector/v1配置静态使用，pure模型被draft projection/Graph actions/static widgets共享，不能盲目动态搬走或制造model→UI依赖。

## 2. 原站有独立GeneratorFactory按需协议

[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) 139250–141720：Factory按nodeType/generatorType表选React.lazy implementation，ScriptV2为lazy282660，TEXT为lazy465890，并非generictext伪script。Factory选择发生在真实renderer显示入口；ScriptV2 eX范围仍见 [接线审计](./canvas-script-generator-integration-source-audit.md)。

Factory包局部ErrorBoundary及Suspense(fallback=null)，错误文案generatorLoadFailed、error.message截断和clickRetry；重试resetboundary并增加局部key。readonly/collab shield包控制capture，不代表只读不能加载模块：generic原本仍可读展示。不能让新的loadinggate永久屏蔽readonlygeneric；ScriptV2 caller自身按source隐藏readonly入口。

本机已有RouteErrorBoundary仅整页reload，既有React.lazy/Suspense没有局部可重试加载状态，也不能直接清React.lazy缓存拒绝；因此不适合复用为节点内局部加载。新小入口保局部错误/重试，并以可读loading状态代替source nullfallback，属于明确可达性适配，不改变图。

## 3. 小入口实现与边界

新增 `src/features/canvas/components/CanvasGeneratorEntry.jsx/.css/.test.jsx`。Root只须把旧两个static import换成named exports的alias：

```text
LazyCanvasNodeInlineGenerator as CanvasNodeInlineGenerator
LazyScriptV2NodeGenerator as ScriptV2NodeGenerator
```

所有implementation props原样传入。entry只有实际mount且ready时调用真正的 `import('../generator/CanvasNodeInlineGenerator.jsx')` 或 `import('../storyboard/ScriptV2NodeGenerator.jsx')`；不预取所有generator、不在导入entry时执行loader、不先mount controller。成功/在途module promise按stableloader共享，失败移出cache，button重新调用loader；implementation render error由局部class boundary隔离，retry更换该boundary key，保持画布仍可操作。没有window.reload、独立dialog-stack/body lock或服务写入。

request publication绑定documentKey+nodeId+kind+attempt与effect生命周期。切doc/节点、A→B→A、ready变false、unmount的旧callback不得挂旧implementation；正在下载的JS本身无法Abort，但模块成功可以供新的合法owner共享，渲染只消费最新props。ready恢复可使用已加载模块，不必重复fetch；generic readonly=true仍加载并交impl管理权限。

fallback是独立absolute overlay、cv-floating/nodrag/nopan/nowheel，style镜像现有坐标：ScriptV2 gap16world，generic16screen、内容1/zoom反缩放、现窄屏placementadapter。它不修改raw节点尺寸/位置/view，阻pointer/click/doubleClick/contextmenu，按钮Space只阻冒泡而保native default，Escape不抢共享菜单/画布owner。没有强制聚焦新loaded输入，避免异步完成抢用户焦点。

加载成功后实现自己的prompt/channel/CAS/Quota/Frame生命周期保持原样；纯模型和草稿入口继续static。仅换filename或增加manualChunks不能证明按需，这次必须确认staticclosure中没有implementation以及选择时真实请求发生。

## 4. CSS与模块边界

entry只eager导入现有样式，按先前NodeGeneratorPrompt依赖顺序：prompt-badge-swap → node-prompt-asset-picker → canvas-reference-menu → node-generator-prompt → inline-generator → ScriptV2GeneratorView。GeneratorSettings/Mantine Slider/voices仍有既有static UI来源，不另动态重排其级联。新增CSS仅 `.cv-generator-load-state` scope；没有theme/reset/main.css变更。

基线CanvasPage CSS中node-generator-prompt-container在111636、cv-inline-generator在114960、cv-script-generator-view在120491（minifiedstring offset）。这些是基线观测，不是只看import声明就能宣称新build完全一致。Root接线后须比较旧selectors相对顺序和实际browser样式；若移出的JS还携带原有CSS而迟到追加覆盖，需要保其static样式入口，不能用懒加载时序决定页面级联。

所有新JS在canvas业务域内，不引用app router或跨域私有UI。模型无React/CSS反向依赖；没有动态调用sourcebundle、读取账号信息或建立写服务。

## 5. 专项测试与正式验收计划

新entry11/11 Node24通过（06:32:54，360ms/总969ms），日志 `artifacts/canvas-generator-entry-tests.log`；定向ESLint0、Prettier通过。覆盖：ready等待；genericreadonly透传；doc新owner只渲染当前props；A→B→A；ready丢失和恢复；rejectcache移除与真实loader重试；rendererror隔离；卸载后迟到success；两protocol坐标；pointer/dblclick/Space/Escape隔离。注入可控制的deferred loader只验证边界，不把mockloader的请求次数当原生网络验收。

Root接线后的正式build应记录：CanvasPage UTF-8/gzip大小；implementation与共享Prompt模块独立chunk归属；CanvasPage静态imports递归closure排除implementation；dynamicImports指向独立目标；原CSS相对顺序；不提高900阈值。真实browser在空画布/no selection时不加载generator JS，第一次选合法media或ScriptV2才加载相应chunk，选其他node后不迟到呈现旧doc；加载失败显示局部可重试状态。

原生模块fetch/evaluation缓存、永久404或语法错误的恢复能力仍须真实browser验证，不能从模拟loaderreject后第二次成功推断所有浏览器加载失败都能恢复。失败不会假显示ready，也不静默整页刷新。App现有selected-widget测试需要合法await动态mount；不mockimplementation或删除图/history/storage强断言以绕过按需加载。

本文作者未改NodeCanvas/Viewport、vite阈值、旧App tests或全局文档，未运行fullcheck；正式build、浏览器和接线后的App结果由Root另记录，不能把这11项或write:false基线当全部bundle目标已完成。

## 6. Root 接线后的模块图与最终产物复核

2026-10-12 16:09，Root 已把 CanvasViewport 两个生成器入口接入上述按需 wrapper。本次使用 Node24.19.0 / Vite 官方 `build({build:{write:false}})`，仅由临时 post 插件读取 Rollup `generateBundle`；没有改生产源码、config、dist 或900kB阈值。证明存入 [canvas-generator-bundle-final-proof.json](../artifacts/canvas-generator-bundle-final-proof.json)，记录入口 SHA、模块归属、static imports 的递归闭包、两个真实 dynamic targets 及 CSS 相对次序。捕获前后源 SHA 一致，之后正式 dist 复核时仍与该快照一致。

CanvasPage 的静态递归闭包共37个 chunk / 896个 module，不包含 `CanvasNodeInlineGenerator.jsx` 或 `ScriptV2NodeGenerator.jsx`。CanvasPage 的真实 `dynamicImports` 分别指向 `CanvasNodeInlineGenerator-jP8iUqJF.js` 与 `ScriptV2NodeGenerator-D2nYLDeS.js`；前者拥有普通生成器实现，后者拥有 ScriptV2 实现、view 和 controller。公共 `NodeGeneratorPrompt` / `GeneratorFrame` 位于 `GeneratorReferences-Dp_aXcMJ.js`，由两实现引用；小型 `CanvasGeneratorEntry` 留在 CanvasPage。文件名和 render 长度不能单独证明这些边界，此处依据实际 `modules` membership 与递归图。

### 阶段大小与正式产物必须区分

临时 post 插件的 `generateBundle` 仍在 Vite 后续 preload/import 分析之前。它捕获 CanvasPage 的 minified code 为871545字节 / gzip287792；这些是真实阶段代码的 UTF-8字节，**不是最终 emit 字节**。正式完整检查后，直接 `fs.readFileSync` 读取 `dist` 的 Buffer / `gzipSync(Buffer)` 取得下表，以此为当前产物大小依据：

| 最终文件                              | UTF-8 bytes | gzip bytes | 模块归属                                    |
| ------------------------------------- | ----------: | ---------: | ------------------------------------------- |
| CanvasPage-BEM5seKq.js                |      873731 |     288543 | 小入口与既有画布模块，442个 module          |
| CanvasNodeInlineGenerator-jP8iUqJF.js |        8508 |       3814 | 普通生成器实现，2个 module                  |
| ScriptV2NodeGenerator-D2nYLDeS.js     |       14454 |       5756 | ScriptV2实现 / view / controller，4个module |
| GeneratorReferences-Dp_aXcMJ.js       |       59970 |      21153 | 两生成器公共Prompt / Frame等，23个module    |

正式 CanvasPage 为873.73kB / gzip288.54kB，低于原900kB构建提示阈值；相对原923036字节快照减少49305字节。该差额包含本批参考流程及其他并行接线的变化，不称为每个移出 module 的独立压缩收益，不把共享 chunk 的体积重复求和，也不把模块 `renderedLength` 当最终字节。生成器仍需要已有 CanvasPage 中的纯规则及公共 UI，动态 chunk 对该主 chunk 的回引不使主 chunk 的静态闭包重新包含两个实现。

阶段差异已在 proof 的 `metricStage` / `actualDist` 分开记录。`node_modules/vite/dist/node/chunks/config.js` 的 `buildImportAnalysisPlugin` 在后续 `generateBundle` 中生成 `__vite__mapDeps`（23852）并覆盖 `chunk.code`（23862）；正式 CanvasPage 和 GeneratorReferences 都带该前缀，普通 / ScriptV2 实现 chunk 字节与较早捕获一致。不能据 user 插件 `enforce:post` 假定所有 Vite 内部 emit 工作已结束。将来重做大小证明，优先读取 `await build()` 的最终 output 或正式 dist；本次没有为取数字重复写 build 或改产物。

### CSS 级联与正式检查

最终 `CanvasPage-CTzKRXEh.css` 为186525字节，三个 selector 在**同一** eager CSS 中：prompt-container114787 → inline118111 → ScriptView123642。原基线111636 → 114960 → 120491；相对差分别仍是3324 / 5531，顺序保持。绝对字符 offset 前移 / 后移本身不是破坏级联的证据；该证明是字符位置，不能描述成 byte offset，也不等于所有样式 / 手机像素一致。

Root 正式 [canvas-script-reference-final-check.log](../artifacts/canvas-script-reference-final-check.log) 已检查：324文件 / 4320测试，16:07:31开始 /115.51s，生产 build20.28s；日志同名 CanvasPage 显示873.73kB / gzip288.54kB，与直接读最终 dist 的结果一致。该整体结果替代本节早先的“Root 尚待接线 / build”状态；历史11项单测与第一次基线继续作为范围较小的历史证据。Node `_channel` deprecation 与应用 / 构建包体提示分开，不称整个进程没有任何警告。

Root 的1280 /390实际 UI 选择、取消和 Escape 验收与静态模块图分别维护；本次作者没有捕获浏览器首次选择的生产 chunk 网络请求，不能把 dev 模块 UI 可操作、mock loader 请求次数或产物 `dynamicImports` 推断为“空画布不 fetch / 首选才 fetch”已经实测。永久404 / 语法错误恢复、原生缓存和首次选择网络边界继续保留，整体原站复刻目标未完成。

首次只读插件按 `facadeModuleId` 查 CanvasPage 未找到，构建在证明插件处失败；仅改证明定位为 Rollup name + 实际 CanvasPage module membership，再捕获成功。该失败未改 dist / config，未当成生产编译错误或成功证明。本文此次只追加记录及生成 JSON，生产代码和上一节专属视图继续冻结。
