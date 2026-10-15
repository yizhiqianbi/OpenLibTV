# 互动影游编辑器 v1 审计

这是用户明确批准的独立业务扩展，不作为 liblib.tv 原编辑器隐藏功能的复刻证据。编辑、试玩和观看无需登录；发布使用管理口令。当前版本按用户要求沿用 LibTV Canvas 风格和视频创作体验，增加互动叠层；本机试玩、新离线包、真实Preview/生产观看、生产访问复验与隔离候选完整检查已验。创作项目仍保存在浏览器本地，发布作品可跨设备匿名观看。

## 实现范围

- `/interactive-film?projectId=…` 为独立编辑器，`/interactive-film/play/:releaseId` 为匿名观看入口。项目页通过专属 repository 创建、打开、复制、重命名、软删除、恢复及永久删除影游项目。
- 8 类节点：开始、播放、选择、修改变量、条件判断、热点、QTE、结局。稳定输出端口一口一目标，允许多输入和剧情回访；文档事务历史、变量类型校验、断链定位、即时循环校验及运行时 100 步保护。唯一开始节点不可被普通删除或复制操作移除/复制。
- FilmDocument v1 使用 `libtv.film.<id>` canonical 文档同步保存，项目列表从文档读取元数据，不另维护索引；损坏或未知版本数据阻断覆盖。IndexedDB 存储实际媒体 Blob，文档与历史仅引用 mediaId。素材事务完成才进入文档。本地文件、规范资产库和现有画布的只读导入均接线；缺失本机 Blob 会保留 mediaId 并定位关联节点。
- 图形底座位于 `features/editor/`；Canvas 薄适配器保留原生成边、世界坐标/组选择、复制和取消策略。Pointer/Touch 保留原 options 身份及同步更新边界；自定义 profile 不接管原生控件。
- 画布沿用当前 LibTV Canvas 的深色底、50px 顶栏、媒体主体节点、外部标题和轻量类型标记；选择、热点与 QTE 在画面上显示叠层。节点主体280×184、标题上移36px，输入端口y=92、输出端口等分；连线、框选与fit使用同一几何，不迁移文档坐标。左侧竖栏沿用选择/抓手、创建、素材/变量/上传的工具形状和分隔，左下为缩放与适应画布；这是影游动作适配，不表示原 Canvas 全部工具已搬入。
- 节点/素材/变量库与属性面板按需打开，画布默认铺满。桌面库为非modal浮层，同一trigger可关闭，外部点击/焦点收起；窄屏抽屉复用dialog-stack。播放节点读取真实IndexedDB Blob，视频定位trimIn，选中后提供原生控件；缺失素材与解码失败显示明确状态。互动节点仅预览自带媒体或纯推导的确定继承背景，热点框按contain内容盒映射。缩略URL lease随换文档/换媒体/重试/卸载取消并释放，迟到结果dispose，退出暂停媒体并清除src。
- 节点属性支持片段起止点、图片时长、画面预览、归一化热点矩形、变量及输出选项。继承背景预览沿可达前驱穿过无媒体节点，仅在所有路线明确同一媒体/切点时展示；视频互动成功的动态出口帧、多背景歧义或继承循环不猜帧。继承画面上绘制热点只修改 region，不写 mediaId 或 trim。移动面板使用共享 dialog-stack；全屏播放器的焦点限制于可见播放器子树。
- `services/interactive-film/runtime.ts` 为纯状态机，player.ts 为统一媒体 adapter。试玩、固定 IIFE、ZIP 和线上 release 使用同一运行逻辑；进入节点的 epoch 隔离旧事件与重复结算。自带视频/音频的互动使用 `currentTime - trimIn` 媒体局部时间，图片或继承末帧使用有效活动时间。播放节点完成片段后走 next，图片按 displaySeconds 完成；无媒体节点保留上一画面。
- 选择默认无期限。自带视频的选项出现后视频继续播放，用户可提前选择；到 trimOut/实际结尾后冻结末帧并继续允许选择。有截止时按窗口走 timeout，片段结束后仍可继续活动倒计时。热点/QTE 必须有截止与 failure 出口，自带视频窗口须在片段内。暂停、后台隐藏、真实 seeking/waiting 和未成功播放冻结计时/输入；恢复后按实际媒体位置同步，不用墙上时间猜播放进度。
- ZIP 使用 fflate 0.8.3：index.html 内嵌 manifest 与固定 classic IIFE，media/ 保存按 ID 去重的完整源文件；片段切点由播放器执行，解压可断网双击。保留目录接口独立于原画布 ZIP，取消不返回部分包，512 MiB 包大小限制。
- 试玩、导出和发布分别固定操作开始时的文档 revision；进行中的媒体/网络任务不混入后续编辑。发布顺序 start → 浏览器直传 upload → complete → GET release。管理口令换短期 HMAC capability，限定 release 路径、MIME 与文件大小；complete 校验实际 Blob head 后最后提交 manifest 和完成标记，重复完成幂等。发布保留已有成功文件供当前页面重试，重新发布新版本保留旧 release 的媒体、manifest 与受信播放器 SHA-256。取消立即结束客户端等待，迟到 SDK 进度、结果和错误不能改写下一次发布。

## 当前 LibTV 风格版本与发布（2026-10-12）

生产 [PenStudio](https://penstudio-libtv.vercel.app/) 已 READY，部署 `dpl_J93mBxkb8QH7cxPYYRAYtNDQuaSg`，不可变地址 [g08glkifn](https://penstudio-libtv-g08glkifn-bins-projects-795df2ea.vercel.app/)，2530文件/89,999,971字节。Preview [l60lahl07](https://penstudio-libtv-l60lahl07-bins-projects-795df2ea.vercel.app/) 为 `dpl_FqhoeJgPnrbNAtTKFXtJ2drP5vx7`，READY，2530文件/89,999,953字节。两者符合90 MB目标/95 MB硬上限，保留Functions/config/routes。

Preview实际发布 [失踪信号](https://penstudio-libtv-l60lahl07-bins-projects-795df2ea.vercel.app/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3)，release `2ed10a7c-3009-41a9-aeae-0cf2a1610de3`，revision284；真实PUT仅1次，首次complete成功，重复complete200。匿名新会话走通成功获救、未知远方、错过时机，SRI与当前播放器SHA匹配；390×844热点暂停后4.7秒倒计时保持不变，native fullscreen包含媒体与热点，scrollWidth=390。证据见 [首次发布](../output/playwright/film-style/preview-publish-complete.log)、[匿名三结局](../output/playwright/film-style/preview-anon-endings.log) 与 [390px暂停/全屏](../output/playwright/film-style/preview-anon-390.log)。

生产 [同一新作品](https://penstudio-libtv.vercel.app/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3) 在独立匿名会话走通全部三结局，白色圆形开始按钮、选项样式与新SHA的SRI正确，1440px无横向溢出。生产编辑器1440/390实测库trigger重复开关、Inspector关闭、缩放菜单、嵌套Escape与回焦点通过；390px观看暂停倒计时4.8秒，等待1.1秒不变，全屏同时包含video与hotspot，scrollWidth=390。证据见 [生产编辑器](../output/playwright/film-style/editor-production-qa.log)、[生产匿名三结局](../output/playwright/film-style/production-endings.log) 与 [生产390px](../output/playwright/film-style/production-390.log)。旧release `f72577e9-255b-44d2-8527-78dab3845607` 也在本轮生产的匿名会话走通全部三结局，1440px无横向溢出，原SRI `sha256-nBmpXAAs68i8ZaPTR50lQxffIEoGudTWUMajArt40zM=` 不变，见 [旧作品跨部署三结局](../output/playwright/film-style/old-release-endings.log)。

生产HTTP门控两轮各66/67；各有一个不同页面请求在收到HTTP前遇到TLS EOF，原报告保留。顺序重验这两项2/2成功，因此67个唯一门控均已成功，不能描述为单轮67/67。覆盖旧页面/内容/快照/静态资源/许可证、影游深链、新旧release、实际媒体与真实404；三个旧release实际播放器字节SHA均保持旧版本，四份媒体HEAD均为584,729字节且MIME/CORS匹配。见 [首轮](../output/film-style-production-http-check.first-run.json)、[第二轮](../output/film-style-production-http-check.json) 与 [顺序复验](../output/film-style-production-http-recheck.json)。

当前固定classic IIFE为20,414字节，SHA-256 `4e436dc3752c09e4069a5ce94d55a1af558d6ba0317cc68f96832f3039175399`。新 [film-style-demo.zip](../output/playwright/film-style-demo.zip) 为611,900字节，仍为index.html、单份完整媒体、README.txt三项；内嵌该播放器，revision284剧情仍为17节点/19边/2变量/3结局。实际file://、`context.setOffline(true)`下走通全部三结局，见 [断网离线三结局](../output/playwright/film-style/offline-three-endings-final.log)。旧不可变部署保留当时编辑器样式，旧release固定原媒体/manifest/播放器，升级站点不会自动替换其旧播放器样式。

隔离 `output/film-style-release-workspace` 使用Node24.19.0完成 `npm run check`：02:39:43开始，280文件/3058测试通过，测试88.86秒、构建9.70秒；格式、零警告lint/架构边界、核心strict与构建通过。依据为 [冻结检查](../output/film-style-frozen-check.log) 与 [源码SHA清单](../output/film-style-release-source-sha256.json)，只覆盖该候选，不涵盖主工作区后续修改。部署后974个冻结源码SHA全部不变，156个公开静态文件未包含三项实际密钥值，见 [源码核对](../output/film-style-production-frozen-source-verification.json) 与 [密钥扫描](../output/film-style-production-credential-scan.json)。统计包含独立影游扩展，strict不覆盖全部JSX，未声称远端CI已执行。

## 历史 Preview 与生产发布验收

服务位于 `bins-projects-795df2ea/penstudio-libtv` 与公共 Blob 存储 `penstudio-films`（iad1）。服务端使用 BLOB_READ_WRITE_TOKEN、FILM_PUBLISH_PASSWORD、FILM_PUBLISH_SECRET，客户端不包含存储密钥或持久化管理口令。历史重试验收 Preview 为 [gr5bqh0h8](https://penstudio-libtv-gr5bqh0h8-bins-projects-795df2ea.vercel.app/)，部署 `dpl_2Z8cW2j3yRJm4i49cDbTR2HavqJW`，样本包 89,999,500 字节 /2533 文件。

真实编辑器发布同一 revision 284，release 为 `11040114-85a5-469d-b74b-569cbfd27ba8`。错误口令被拒；取消反馈记录 38ms，后续明确的按钮 isEnabled/真实点击验证可重试，不将 38ms 当作按钮恢复的精确耗时。两次 PUT 记录中一次被 QA 主动阻断，另一次实际上传成功；四次 start 使用同一 release，完成重试没有新增 PUT。重复 complete 与匿名 GET release 均返回 200，manifest revision 和播放器 SHA-256 保持一致。证据见 [取消](../output/playwright/release-cancel-result.log)、[上传](../output/playwright/release-upload-result.log) 和 [完成重试](../output/playwright/release-complete-retry-result.log)。

[Preview 已发布作品](https://penstudio-libtv-gr5bqh0h8-bins-projects-795df2ea.vercel.app/interactive-film/play/11040114-85a5-469d-b74b-569cbfd27ba8) 在匿名浏览器走通三个结局，播放器 script 带匹配 SHA-256 的 SRI。390×844 下热点暂停保持 4.0 秒倒计时，等待 1.1 秒不变；全屏包含媒体/热点，页面无横向溢出。发布弹窗 Escape 后无残留 dialog，焦点返回「发布作品」。证据见 [匿名观看](../output/playwright/cloud-player-result.log)、[390px 全屏](../output/playwright/cloud-player-390-result.log) 和 [Escape](../output/playwright/release-qa-escape.log)。

该历史 Preview 首次 complete 曾因已提交 marker 的缓存 404 返回 503，重试成功；修复为读取公共 Blob 前先以 HEAD 确认存在，未写文件不请求 CDN 以避免负缓存。生产 SDK 边界的两项回归模拟实际 SDK 调用，包含在候选完整检查中；真实云端首次完成随后分别验收。

最终 Preview [aa9yvc9r1](https://penstudio-libtv-aa9yvc9r1-bins-projects-795df2ea.vercel.app/) 为 `dpl_BcZdtftADwpEqWyXEJbkp3jkoi9E`，2540文件/89,998,916字节。错误口令被拒，release `3aa64138-492e-406d-9594-3cb0a552cb13` 首次发布成功，实际PUT 1次，重复complete 200，revision 284及播放器SHA正确。匿名新会话走通三个结局并校验SRI，证据见 [首次完成](../output/playwright/head-fixed-first-complete.log) 与 [三结局](../output/playwright/head-fixed-cloud-three-endings.log)。

生产部署为 `dpl_FZ4mMy4XLnPaoahWCfBSTywXr5Tc`，不可变地址 [g6ce96fk1](https://penstudio-libtv-g6ce96fk1-bins-projects-795df2ea.vercel.app/)，公开别名 [PenStudio](https://penstudio-libtv.vercel.app/)，2540文件/89,998,931字节，READY。使用已通过275/2928完整检查的冻结候选，随后只切换Vercel生产目标并生成Build Output/prebuilt；不混入主工作区后续编辑。生产错误口令被拒，release `f72577e9-255b-44d2-8527-78dab3845607` 首次发布成功，真实PUT 1次、重复complete 200、revision与SHA保持一致，证据见 [生产首次完成](../output/playwright/film-production-first-complete.log)。

生产匿名播放器走通三个结局；390×844暂停热点倒计时4.8秒，等待1.1秒不变，全屏同时包含媒体与热点，scrollWidth=390。历史release `11040114-85a5-469d-b74b-569cbfd27ba8` 在新版生产部署仍真实播放至成功获救，SRI未变。证据见 [生产三结局](../output/playwright/film-production-three-endings.log)、[生产390px](../output/playwright/film-production-390-result.log) 与 [跨部署旧作品](../output/playwright/film-production-old-release-result.log)。生产关闭发布弹窗后无残留dialog，焦点按实际DOM身份回到aria-label「发布作品」触发器，见 [焦点结果](../output/playwright/film-production-publish-focus-verified.log)。初始QA用textContent与aria-label比较导致一次断言失败，原日志保留；实际按钮textContent为「发布」，DOM身份检查通过。生产新release也在独立匿名会话走通全部三个结局，见 [最终生产示例](../output/playwright/film-production-release-final-three-endings.log)。生产HTTP 63/63通过，覆盖30旧前端深链、4内容入口、真实gzip快照、编译资源/许可证、缺失资源/API真404及三个release的manifest、实际媒体HEAD和runtime字节SHA，见 [HTTP报告](../output/film-production-http-check.json)。生产检查与发布日志存于 `output/film-production-build.log`、`output/film-production-deploy.json`；具体访问复验见 [部署记录](./vercel-deployment.md)。

应用发布限制为每文件 500,000,000 字节、作品媒体合计 2,000,000,000 字节、200 素材、200 变量、2000 节点、6000 边及 1,000,000 字节 JSON；这些是本应用限制，不是套餐赠送额度。发布接受 PNG/JPEG/WebP/GIF、MP4/WebM 和列明的音频 MIME；SVG 不发布。没有真实文件字节的素材阻断导出与发布，并定位关联节点。

`vercel:prepare` 与 `vercel:prepare:preview` 先生成完整 Vercel Build Output，随后只替换静态样本。Functions/config/routes 保留，其体积一并计入 90 MB 目标和 95 MB 硬上限；保留固定 runtime、示例影片及许可证。生产始终 prebuilt 发布，原 public/ 不裁剪、不重新抓取。

## 已验证

- 核心文档、媒体、repository 与实际 hook：同步末次输入、Quota 保留/重试、StrictMode 唯一新项目、外部更新冲突/删除/损坏防覆盖、订阅隔离、undo/redo 单调 revision。
- 共享底座 7 文件 220 项定向测试通过；自定义 profile、切项目、迟到 pointer/touch/RAF、原 Canvas 生成协议和几何适配均有实际 hook 回归。完整检查又捕获首次 ready 后拖动被旧 Touch passive cleanup 取消的竞态，最终 Pointer/Touch owner 在 layout commit 清理和安装；原 Canvas 断言与新增压力回归包含在最终全检查中。
- 实际FilmEditor与新增FilmGraphMedia两文件15项定向回归通过：edge Delete不冒泡误删节点、port Enter不打开属性、article Enter键盘接线、同素材换节点取消旧绘制、边缘区域合法及继承图片仅提交region；新增缩略Blob/trim、确定继承/歧义、contain热点、缺失重试、迟到URL清理、工具/缩放与Alt复制CAS。纯继承背景规则另有19项回归。
- 本轮真实1440×900编辑器实测背景rgb(26,26,26)、顶栏50px、画布宽1440；库trigger切换/重复关闭、Escape回焦点、Inspector关闭、缩放菜单在视口内通过。390×844下完整示例与创作抽屉逐层Escape并回原触发器，scrollWidth=390，见 [编辑器风格QA](../output/playwright/film-style/editor-qa.log)。本地最终试玩三结局、选项/QTE样式未被编辑器级联覆盖、390px暂停1秒仍4.7秒、全屏视频/热点、Tab留在播放器及关闭回试玩均通过，见 [试玩风格QA](../output/playwright/film-style/player-final-qa.log)。桌面Chrome窄视口不代表物理手机或Safari。
- 发布客户端回归已扩至 11 项，包含固定文档、重试保留已上传素材、旧 capability 失效、立即取消 SDK 等待、迟到结果隔离与原型同名素材 ID；服务端 capability/manifest/完成幂等及 Blob SDK 边界分别回归，均包含在隔离候选完整检查中。
- 编辑器浏览器已验名称末次字符立即刷新、撤销/重做和 ZIP 下载。相同 revision 284 的真实「试玩」已走通全部三个结局；桌面倒计时与关闭按钮相距 10px、无重叠。390px 下实际解码 810×456 视频与互动叠层均在 native fullscreen 内，Tab 留在播放器，退出全屏回关闭按钮，关闭试玩回「试玩」入口；异步准备期间保留 opener 并防重复进入，8 项组件回归通过。证据见 [试玩三结局与焦点](../output/playwright/film-preview-three-endings.json)，不据桌面 Chrome 窄视口推断手机 UA/Safari。
- 历史 [film-final-demo.zip](../output/playwright/film-final-demo.zip) 为606,552字节，含index.html、media/asset-1.mp4、README.txt三项。示例revision284、17节点、19边、2变量、5播放片段和3结局；唯一584,729字节MP4与本地代表性原素材字节一致，多个trim只引用这一份完整源文件。15,066字节内嵌IIFE与该次构建及历史Preview release相同，SHA-256为 `9c19a95c002cebc8bc65a3d3479d254317df204a06b9d4d650c6a302bb78d333`。该包在真实浏览器file://与 `context.setOffline(true)` 下已走通三个结局；没有外部脚本/模块/JSON请求。本轮新包与SHA另见上文，未覆盖旧文件。
- Chrome 154 真实运行器证据显示 choice 在选项出现后继续播放，到 3.50885 秒冻结，850ms 后不变；提前与末帧选择均结算。QTE 在 0.25x 播放时跟随媒体局部时间，暂停同时冻结媒体/倒计时，原生 seeking/waiting 期间禁用输入，Space 成功和媒体期限超时均通过。完整数值见 [运行器浏览器证据](../output/playwright/film-runtime-browser-evidence.json)；持续网络断流未复现，因为本机完整 Blob 已可用。
- 原 Canvas 在独立 1440×900 Chromium 会话中已验缩放下鼠标拖动、Shift 多选、复制及内部边映射、打组相对坐标、capture 中 SPA 切项目隔离，以及 CDP 原生 touch 平移/双指缩放/touchCancel 清理；稳定全刷后无新 console error/warning。只创建新本机 QA 文档，未写已有文档或原站。证据与范围见 [共享底座浏览器 QA](../output/playwright/film-canvas/QA-results.md)，原生触摸 emulation 不代表手机/Safari 实机。

历史生产对应候选在 `output/film-release-workspace` 使用 Node24.19.0 执行 `npm run check` exit0：2026-10-12 01:57:39 开始，275 文件 /2928 测试通过，测试阶段 120.51 秒、构建 12.32 秒；格式、零警告 lint/导入边界、核心 strict 与生产构建通过，日志 [film-release-frozen-final-check.log](../output/film-release-frozen-final-check.log)，对应 [冻结源码 SHA-256 清单](../output/film-release-source-sha256.json)。候选同步当时Canvas改动及既有 `artifacts/studio-import-fixture.glb`；未改变 NodeCanvas 原断言，Node24 定向 25 项与夹具/通用组定向 21 项另有 [Canvas 日志](../output/film-canvas-node24-recheck.log) 和 [夹具日志](../output/film-candidate-fixtures-recheck.log)。此结论仅适用于该历史候选，持续编辑的主工作区须自行重新检查。该次生产发布后重新核对958个冻结源码文件，SHA全部不变，见 [源码核对](../output/film-production-frozen-source-verification.json)；生产静态157个JS/HTML/JSON/CSS文件没有三项实际密钥值，见 [密钥扫描](../output/film-production-credential-scan.json)。

历史 01:26:20 冻结版本 268 文件 /2798 测试通过（98.75 秒、构建 12.60 秒），见 [film-complete-check.log](../output/film-complete-check.log)。替代、失败和中止的候选日志不记为通过。统计包含独立影游扩展，strict 不覆盖全部 JSX，CI 未远端执行；完整检查使用 Vitest 并发 2。

## 后续范围

本版没有多轨剪辑、转码、复杂小游戏、AI 生成或玩家进度存档；完整源媒体随包保存，仍受浏览器可解码格式和 512 MiB 内存打包限制。发布重试凭证只在同页面内存保持；刷新发布页面后会启动新版本，取消也不撤回已经完成的 Blob 上传。跨设备同步创作项目、完整媒体垃圾回收、服务器运营后台、持续网络断流、真实手机/Safari 解码/触摸/native fullscreen 仍需后续验证。ZIP 没有独立 LICENSE 项；运行器只含本项目 player/runtime，打包使用的 fflate 0.8.3 MIT 保存在 services/licenses，不把公开素材来源记录当作另获商用授权。新增影游服务不代表原 Canvas/Studio/Skill 的生成、支付、认证或运营写服务已接入，也不代表整个原站复刻目标完成。
