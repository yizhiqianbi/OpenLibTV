# 字幕来源与侧栏预览生命周期（2026-10-18）

本批继续本地前端复刻，收敛字幕来源计划，并修复字幕列表、样式、预设切换时重建播放器的问题。没有增加原站账号、登录、生成或运营写入，未发布线上。整体约70%的工程估算保持，不能把本次671项专项测试当作功能完成率。

## 依据与实现

静态依据为已归档公开客户端 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。`collectClipSubtitleSources`、`gL` 和 `gV` 的有界摘录与哈希保存在 `artifacts/subtitle-sidebar-lifecycle-source-evidence.json`。前批REA引用在当前MCP会话中已不存在，此次没有重新宣称完整语义图；直接核对原文件和既有摘录，只证明静态行为，不执行原bundle或遥测。

- 来源收集按非音频片段顺序先HTML、后VTT；缺少有效 `sourceNodeId` 的片段不进入来源，不能用片段ID猜来源节点。URL、节点ID、标签去掉首尾空白，保留复制片段各自的 `clipId`，不提前将重复引用合并。
- 节点级HTML回退只绑定第一个有效非音频来源，在该节点已有片段HTML时不重复追加；HTML禁用时排除片段HTML和节点HTML。HTML加载计划共用此规则，仍保留规范存档和显式空文档的优先级、缓存与取消生命周期。
- 原站 `gV` 中预览与右侧栏为不同子树，列表/样式变化不替换播放器。本机之前在 `children` 与 `ClipTextWorkspace` 两种子树之间切换，导致 `ClipTimelinePreview` 卸载和重新准备；现在固定包装层，只控制侧栏显示，切换不重建媒体DOM、iframe或字幕Document。
- 隐藏样式栏会关闭其预设库，避免返回列表后保留一个不可见的预设状态。手动点击页头切换后将焦点交给新页头按钮；被动关闭不主动抢焦点。没有创建新的dialog栈或滚动锁。
- 列表侧栏初始宽度按源 `w-[300px]` 修正为300px，继续使用既有窄屏规则与调宽控件。

混合来源的“收集”和“编辑权”不同。原站还有HTML持有编辑权、拒绝/降级与VTT迁移规则；本批没有凭收集顺序创造任意格式切换器，也没有宣称混合编辑优先级已完整实现。

`htmlEnabled` 仅为纯来源协议的输入；实际HTML加载仍沿用当前启用路径，未接原站remote-config预览/导出开关，不将该参数的测试当作线上开关验收。

## 专项与实际页面

新增侧栏回归直接挂载真实HTML侧栏与文字属性组件，检查切换列表/样式/预设、关闭/重开后视频和iframe身份、播放位置、挂载/清理次数与焦点。来源回归覆盖音频排除、无来源拒绝、标签清理、节点回退、HTML开关和重复片段。最终剪辑域 **52文件/671项**通过，日志 `artifacts/subtitle-sidebar-lifecycle-final-joint.log`。首次新增测试仅将“默认样式”按钮误写为“预设样式”，查找失败与随后异步act提示保留在 `subtitle-sidebar-lifecycle-targeted.log`；修正locator后通过，未修改产品文案或放宽身份断言。

真实Chromium恢复前批通过GUI创建的专属QA状态 `output/playwright/subtitle-highlight-browser-state.json`，从 `/canvas` 打开实际剪辑器，用原生点击操作侧栏。此次没有新建上传样本，没有注入图、媒体ready或合成pointer；读数用DOM引用测量，不修改文档状态。

`output/playwright/subtitle-sidebar-lifecycle/native-final-300.txt` 记录1280×844与390×844两轮列表→样式→预设→列表：视频、字幕iframe及iframe Document始终是原实例，视频 `readyState=4`、暂停位置0.4秒均保留；页头焦点恢复通过。桌面侧栏left972/right1272/width300，窄屏left8/right191/width183，document.scrollWidth分别为1280与390。截图 `list-1280.png`、`list-390.png` 已回读检查。旧 `native-final.txt` / `style-identity.txt` 是300px修正前的中间证据，以 `native-final-300.txt` 为最终结果。

控制台 `console-final.txt` 为0 errors/0 warnings；自建QA浏览器和5181服务器已关闭。开发过程中存在正常HMR失效/重载提示，最终页面操作在最后源码更新完成后执行；这不是冷启动、Safari或持续播放全分支验收。

## 全量与剩余范围

Node24.19.0完整 `npm run check` session65313 terminal0：**488文件/6650测试**全部通过，测试152.98s、生产构建12.09s，格式、零警告ESLint/架构边界和核心strict类型通过，Vite3702 modules。日志 `artifacts/subtitle-sidebar-lifecycle-full-check.log`，证明 `artifacts/subtitle-sidebar-lifecycle-verification.json`；1423份source/config指纹在检查中途记录并于结束后复核，无源码漂移。指纹不包含文档，且不冒充开跑前快照。CanvasPage仍为900.44kB分包提示，未抬阈值；JSDOM媒体/scrollTo未实现与Node DEP0129输出保留。strict不是全部JSX的类型覆盖，CI未远端执行。

上一轮两次并发检查超时分别记录于 `artifacts/subtitle-source-order-full-check.log` / `subtitle-source-order-full-check-rerun.log`，后来单worker检查仅有部分输出且句柄/进程已不存在，`subtitle-source-order-single-test-rerun.log` 不能记为通过；此次未以观察超时重启仍存活的任务。当前终态来自新的完整check，不沿用前批487/6645，也不将早先CLI不支持 `--minWorkers` 的启动失败记为测试。

旧字幕L1/L2与版本升级、完整混合编辑权/降级/迁移、多语言属性、运营预设目录、触摸/Safari和大文档性能仍未完成；真实生成、导出、协作、云锁和运营写服务仍未接入。此次GUI只验证代表性字幕样本在暂停位置的资源连续性，不等于所有转场/多轨/播放速度下均已验收。

同日后续已补HTML编辑权、全部拒绝后回退VTT、部分成功保留和重试前末次输入/历史；混合模式切换也保留同一预览子树。准确范围和当前检查见 [编辑权审计](./canvas-subtitle-ownership-functional-audit.md)，完整迁移/降级和旧版本仍缺。
