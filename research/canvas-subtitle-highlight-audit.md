# 字幕逐词高亮与透明度色盘（2026-10-16）

本批继续原站前端复刻，接入v4 HTML字幕的逐词高亮、文字/背景两个alpha色盘、真实词时间CSS预览、同一保存/撤销链路，以及源确认的列表/样式同栏切换。本机修改，未部署，无需登录注册或账号资源。完整字幕工具仍有缺口；整体目标仍进行中，约70%不是逐条验收率。

## 原始证据

仅静态读取公开归档`research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。复用REA父证据`ev_cc31296ce676614fb7009f5e5cf2f923a4b7097017f83c93b5b7dbd0ef83f639`，本次摘要view `ev_98b7d12bda496b44e33921567c14301ebdb7db50d87d240eaa7a16fe8047e084`仍报告heap限制下的partial图，不称完整语义追踪。11份函数正文、code-point/UTF-8位置与SHA保存在`artifacts/subtitle-highlight-source-evidence.json`，不运行原bundle、遥测或写服务。

- `lM/lP/lE`318726起：已有每词start/duration完整有效且覆盖正文时保留时间；否则按各顶层data-lang和剩余文本分别分词，并在每组内等权分配整个cue时间。保留嵌套文字结构、标点/空格；CJK单字、其他词及连接符沿用源分词。开启空白正文不造词。关闭只移除karaoke标记/CSS时钟，保留word时间、文字与颜色。
- 源两个keyframes分别为`libtv-subtitle-karaoke-highlight-text`和`libtv-subtitle-karaoke-highlight-background`：前者1ms、steps(1,end)、forwards；后者词duration（至少1ms）、linear、none。两者delay均为绝对source word start。默认高亮文字#FFFFFF、背景#000000。
- `s9/un`408000及420900起：字幕显示“高亮”区段，选项为“逐词高亮/开启/关闭”，文字和背景使用Mantine ColorPicker(format hex)及单独AlphaSlider；alpha按整数百分比写rgba。普通文字依旧原生色块，不增加alpha弹窗。动画区段只属于普通文字的enabled分支，上一批字幕的四项动画选择入口已删除，已有动画metadata/预览保留。
- `gM`714600起：仅修改wordHighlightEnabled时不清预设ID；改色或其他外观编辑则清。`fp`652463起：应用到所有只作用当前字幕trackIndex，跨来源层复制外观/高亮/预设和既有动画，不误改其他字幕轨。像素padding/圆角/模糊按来源与目标composition输出比例转换。
- 原站色盘库版本未知；本机使用已固定Mantine9.7.1及既有MIT许可。局部Provider/两份专属CSS只作用`.cv-clip-alpha-theme`，不加全局reset、根主题或偏好存储。不能据此声称Mantine库版本逐字相同。

## 实现与事务

分词纯函数提取为`domain/text-word-model`，普通words正文修改继续共用原算法。`highlight-document`维护inert DOM分词、标记、样式和两条源CSS时间线；`subtitle-style-document`分别映射字幕专属属性和普通样式。HTML controller仍负责owner、末次输入、CAS和一次历史，不把DOM、回调、临时token或色盘状态写入文档。

`AlphaColorSetting`使用真实Mantine组件，portal挂在当前剪辑dialog内，复用dialog-stack的子层Escape，不建立第二个modal/body锁。Escape关闭色盘并回色块，外部点击保留新焦点；切字幕/文档、禁用及旧回调按owner和generation隔离。pagehide/blur关闭并结束当前已读取的颜色，迟到完成不追加历史。键盘按库默认5%调整并结束该次操作。

实际浏览器发现portal虽显示却继承剪辑外壳`pointer-events:none`，原生点击被底下控件截获；已对色盘显式设置pointer-events:auto。另发现快速点alpha后立刻Escape可能早于Mantine useMove的最后RAF，丢掉末值。现在pointer结束/普通关闭先等待该RAF结算，再提交并退休generation；pagehide/blur仍同步结束现有输入。关闭/owner清理会取消自有RAF。不是通过延时假造媒体ready，也未改node_modules。

## 检查与真实浏览器

早期DOM6项中1失败源于夹具把无效word-start交给严格文档reader，尚未进入高亮修复；改为有效文档中的不完整word-duration验证重建，保留原正文/语言/时间断言。严格reader拒绝损坏词时间的边界仍在，不把这项当所有坏HTML自动修复。最初两view文件3失败分别为未等待Mantine真实RAF及JSDOM不把color input暴露成textbox；只补实际RAF等待与label查询，未改生产或弱化原alpha/owner断言，日志保留`subtitle-highlight-first-tests.log`、`subtitle-highlight-view-tests.log`。之后两view文件10项通过。

新增快速点击/立即Escape的实际库回归后，Alpha文件5项通过；controller新增3项验证高亮/预设、当前轨批量/一次undo及pagehide末次alpha/迟到完成。最终剪辑/草稿/自动保存/摘要联合**41文件/646项**通过，日志`artifacts/subtitle-highlight-final-joint-tests.log`；早期41/645是RAF修正前的历史快照，不混称最终状态。

独立Chromium `/canvas`由GUI真实上传六秒320×180蓝色视频、连接智能剪辑并创建字幕，没有注入graph/storage、pointer或ready。证据位于`output/playwright/subtitle-highlight-*`：

- `native-setup.txt`、`open-picker.txt`及`palette-geometry.txt`：真实字幕内容、开启、色盘、默认颜色及桌面实际位置。pointer命中修前等待失败与`stacking-diagnostic.txt`保留；stacking不是确定根因，最终确定的是pointer-events继承。
- `color-alpha-after-fix.txt`中首次快速点后关闭曾丢alpha，后由具体读数/历史检查发现；保留失败证据，不把命令terminal0等同所有结果正确。`fast-click-history-final.txt`实际中心点击→50%、一次undo回36%、redo50%通过。另一次期望37%的失败实际已得到36%，包含点击坐标/亚像素偏差，按实际读数记录，不能说该次完全未响应。
- `alpha-clock-final-proof.txt`：timeline0.4秒，第一词“你”的实际CSS color为rgba(204,39,39,0.5)，背景黑；后两词仍白、背景透明。两个Animation均paused/currentTime400，第一词duration1/667ms，后词delay667/1333ms；不是仅检查data属性或假seek标记。
- `narrow-refresh.txt`：390×844下alpha键盘50→45%，Escape回色块，未失焦正文改为“你好世界!”刷新后保留且高亮仍开启。`toggle-narrow-outside.txt`关闭后真实可见iframe不含karaoke标记、一次undo恢复四词；色盘外点击保留正文焦点。`picker-narrow-final.png`等待真实opacity1后截图，避免过渡中图片误当最终外观。
- `final-archive-proof.txt`使用浏览器独立Web Crypto确认规范存档hash/UTF-8字节数，检查四词时间/正文/颜色/开关及无可见错误。原生只验桌面Chromium尺寸适配，不能扩为手机UA/触摸、Safari或系统色盘。

实际会话console无warning/error，保存在`output/playwright/subtitle-highlight-console.log`；自己的QA浏览器及5181服务器已关闭，原5173保留。GUI产生的状态另存`subtitle-highlight-browser-state.json`供后续恢复，不改原站或用户项目。截图是实际页面，已回读检查。

最终1374源码/config已冻结，官方Node24.19.0完整`npm run check` session87968 terminal0：**459文件/6559测试全部通过**，01:43:25开始、测试413.89s、标准build33.47s；格式/零警告lint/架构/核心strict通过。Canvas897382/ClipEditorWorkspace229409字节，900000预算未提高；日志`artifacts/subtitle-sidebar-full-check.log`、proof`artifacts/subtitle-sidebar-verification.json`。上一批457/6544只代表前批冻结。

## 重要布局纠正与下一步

进一步读到`[lK,lG]=useState("subtitle")`、`gL`和`gV`：字幕“列表/样式”在同一个右侧300px栏切换，新建/双击进入样式，样式页头返回列表；左侧是预设库等独立面板。当前已按此修正为默认右侧列表、双击进入右侧样式、样式头返回列表；390px标题不换行、栏位不越界。`artifacts/subtitle-sidebar-next-source.json`保存了侧栏静态摘录，`output/playwright/subtitle-sidebar-list-snapshot.txt`、`subtitle-sidebar-style-snapshot.txt`和`subtitle-sidebar-toggle-narrow.txt`保存实际证据。剩余仍是旧版本/混合分类、多语言属性、完整轨道/字体目录、预览几何、自定义runtime和真实服务。

后续已接轨道新增/连续重排、字体目录及字体资源adapter和预览几何操作，当前批次与完整检查见 [覆盖记录](./coverage.md)；2026-10-18进一步修复列表/样式切换重建预览、300px初始宽度和页头焦点，见 [侧栏生命周期审计](./canvas-subtitle-sidebar-lifecycle-audit.md)。上段“下一步”是原批次时点，不作为当前缺口清单。

当前仍缺旧L1/L2/旧版本升级、完整混合来源编辑权/降级/迁移、多语言专属属性面板、完整字体/预设运营目录、复杂computed style与任意自定义runtime/内嵌媒体。大字幕文档、极快跨控件手势及后台页恢复仍需进一步实测；实际上传/字幕生成/导出/协作/云锁/费用和运营写服务未接，登录/小号继续延期。
