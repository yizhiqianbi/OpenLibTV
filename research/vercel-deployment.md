# Vercel 部署记录（更新至2026-10-14）

## 当前生产更新：当前工作区与影游 Functions（2026-10-14）

生产别名 [PenStudio](https://penstudio-libtv.vercel.app/) 已更新为 `dpl_3wkfrjAvEnsqBEYeDWkieUkEHm6V`，状态 READY；不可变地址 [q38yqyrt3](https://penstudio-libtv-q38yqyrt3-bins-projects-795df2ea.vercel.app/)。CLI 使用 `vercel deploy --prebuilt --prod --yes --scope bins-projects-795df2ea`，上传/发布耗时44秒，Functions为 `api/film/start`、`upload`、`complete`、`release`，均由Build Output保留。

本次发布前当前工作区用 bundled Node24.19.0 完整 `npm run check` 通过420文件/6261测试，格式、零警告lint、核心strict、生产构建均通过，日志 `artifacts/current-deploy-check.log`。新增视频节点初始测量边界同步进 selected-delete fixture，定向19/19随后全量通过。生成包日志 `artifacts/current-vercel-prepare.log`；静态样本报告 `artifacts/vercel-package-report.json`：2621文件、89,998,819字节，低于90,000,000目标与95,000,000上限，包含145个编译文件、1144个Functions/platform文件、1234个本地public资产和18个真实画布快照。原public/不裁剪。

为满足Hobby上传上限，三个已具来源记录的较大媒体（Blender webm、登录展示webm、一个公开mp4）沿用原始公开CDN URL；没有新增采集、删除本地素材或替换为占位图。源码 `LoginModal` 的历史回退也改为同一已核实公开URL。包报告记录全部 `publicSourcesPreservedWithoutLocalCopy` 与被拒绝的超预算候选，后续运营仍应由服务端/CDN提供媒体。

线上HTTP复验：`/`、`/animation-preview?newProject=true`、`/interactive-film`、匿名试玩深链、`/assets`、models与真实gzip画布均200；四个影游Function的GET方法门控返回405，未知 release 返回404。浏览器实际打开首页无dialog/遮罩；3D-BOX画布渲染并显示时间轴；互动影游编辑器显示画布工具、校验/试玩/导出/发布入口；匿名试玩显示视频播放器、暂停/继续、静音、音量、重新开始、全屏控件。生产函数的真实上传/complete与跨设备同步不在本次匿名只读复验中。验证明细为 `artifacts/current-production-http-verification.json`，部署结果和日志为 `artifacts/current-production-deploy.json`、`artifacts/current-production-deploy.log`；试玩截图为 `artifacts/current-production-play.jpg`。

部署后错误级日志查询见 `artifacts/current-production-logs.jsonl`：两条记录均为 Vercel Node runtime 的 `DEP0169 url.parse()` deprecation warning，分别伴随我们对 `/api/film/release` 的404/200只读请求；没有应用抛错或5xx。该平台运行时警告不作为本次源码失败，但后续应随 Vercel runtime 升级观察。

## 当前生产：LibTV 风格互动影游（2026-10-12）

生产别名 [PenStudio](https://penstudio-libtv.vercel.app/)，部署 `dpl_J93mBxkb8QH7cxPYYRAYtNDQuaSg` 已READY，不可变地址 [g08glkifn](https://penstudio-libtv-g08glkifn-bins-projects-795df2ea.vercel.app/)。本版影游创作沿用当前LibTV Canvas的深色画布、50px顶栏、媒体主体节点/外部标题、左竖工具与左下缩放；节点/素材/变量库和属性按需浮出，互动在画面上叠层。原Canvas规则、代表性样本与自动广告移除保留，不作为原站隐藏影游编辑器的source复刻证据。

发布来源为 `output/film-style-release-workspace` 冻结候选，Node24.19.0完整 `npm run check` 通过280文件/3058测试、格式、零警告lint/架构边界、核心strict及构建；02:39:43开始，测试88.86秒、构建9.70秒。依据 [检查日志](../output/film-style-frozen-check.log) 与 [源码SHA清单](../output/film-style-release-source-sha256.json)。生产发布后974个源码SHA全部不变，公开静态156文件扫描未泄漏三项实际服务端密钥值，见 [冻结核对](../output/film-style-production-frozen-source-verification.json) 与 [密钥扫描](../output/film-style-production-credential-scan.json)。此结果仅覆盖隔离候选，不代表主工作区后续编辑或远端CI通过。

生产样本包2530文件/89,999,971字节；Preview [l60lahl07](https://penstudio-libtv-l60lahl07-bins-projects-795df2ea.vercel.app/) 为 `dpl_FqhoeJgPnrbNAtTKFXtJ2drP5vx7`，READY，2530文件/89,999,953字节。两者从完整Build Output制作并保留Functions/config/routes，满足90,000,000目标与95,000,000硬上限，prebuilt发布；原public/不裁剪、不重新采集。当前固定播放器20,414字节，SHA-256 `4e436dc3752c09e4069a5ce94d55a1af558d6ba0317cc68f96832f3039175399`。

Preview真实发布release `2ed10a7c-3009-41a9-aeae-0cf2a1610de3`，revision284，PUT1次、首次complete成功、重复complete200。匿名三结局、新SRI与390px暂停4.7秒/全屏视频与热点/无横向溢出通过，见 [首次完成](../output/playwright/film-style/preview-publish-complete.log)、[匿名三结局](../output/playwright/film-style/preview-anon-endings.log) 与 [390px](../output/playwright/film-style/preview-anon-390.log)。新611,900字节三项ZIP内嵌同播放器、单份完整媒体与README，实际file://断网三结局通过，见 [离线验收](../output/playwright/film-style/offline-three-endings-final.log)。

生产 [编辑入口](https://penstudio-libtv.vercel.app/interactive-film) 的1440/390布局、同trigger开关、Inspector关闭、缩放菜单、嵌套Escape与回焦点通过；生产 [新匿名作品](https://penstudio-libtv.vercel.app/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3) 已走通三结局，白色圆形开始按钮/选项样式/SRI正确。390px暂停4.8秒等待1.1秒不变，native fullscreen包含视频/热点，scrollWidth=390。见 [编辑器QA](../output/playwright/film-style/editor-production-qa.log)、[匿名三结局](../output/playwright/film-style/production-endings.log) 与 [390pxQA](../output/playwright/film-style/production-390.log)。

生产HTTP两轮各66/67，各一个不同页面请求在收到HTTP前发生TLS EOF；随后顺序复验2/2成功，67个唯一门控均已成功，不记为单轮67/67。三旧release固定runtime的实际字节SHA保持旧版，四媒体HEAD均584,729字节且MIME/CORS正确。原报告 [首轮](../output/film-style-production-http-check.first-run.json)、[第二轮](../output/film-style-production-http-check.json) 与 [复验](../output/film-style-production-http-recheck.json) 均保留。旧release `f72577e9-255b-44d2-8527-78dab3845607` 在新生产匿名会话走通三结局，原SRI `sha256-nBmpXAAs68i8ZaPTR50lQxffIEoGudTWUMajArt40zM=` 不变、页面宽1440，见 [旧作品三结局](../output/playwright/film-style/old-release-endings.log)。旧不可变部署和旧release继续保留原编辑器/播放器样式，不自动替换为本版；本地创作与真实手机/Safari等边界见 [影游审计](./interactive-film-audit.md)。

## 历史生产：互动影游 v1（2026-10-12）

当时生产别名：[PenStudio](https://penstudio-libtv.vercel.app/)。部署 `dpl_FZ4mMy4XLnPaoahWCfBSTywXr5Tc` 已 READY，不可变地址 [g6ce96fk1](https://penstudio-libtv-g6ce96fk1-bins-projects-795df2ea.vercel.app/)；CLI prebuilt 发布13秒。入口为互动影游编辑器，可跨设备匿名观看的 [历史失踪信号示例](https://penstudio-libtv.vercel.app/interactive-film/play/f72577e9-255b-44d2-8527-78dab3845607) 已真实发布。以下检查与播放器SHA仅描述该次发布，不混入本轮风格版本。

使用隔离的 `output/film-release-workspace` 冻结源码：Node24.19.0，01:57:39开始的 `npm run check` exit0，275文件/2928测试、格式、零警告lint/边界、核心strict及生产构建通过；测试120.51秒、构建12.32秒。日志 [完整检查](../output/film-release-frozen-final-check.log) 与 [源码SHA清单](../output/film-release-source-sha256.json)。主工作区01:59普通组275/2929为另一个冻结快照，后续编辑不自动进入此部署；未推Git、未声称远端CI通过。

从完整 Vercel Build Output 创建代表性静态包，保留4个Functions、config与路由，函数依赖一并计入预算。最终2540文件/89,998,931字节，符合90,000,000目标和95,000,000硬上限；原public/不裁剪、不重新采集。记录 [构建](../output/film-production-build.log)、[部署JSON](../output/film-production-deploy.json) 与候选 `artifacts/vercel-package-report.json`。Preview产物2540文件/89,998,916字节，差异为目标配置；固定播放器均为15,066字节，SHA-256 `9c19a95c002cebc8bc65a3d3479d254317df204a06b9d4d650c6a302bb78d333`。

同一项目连接Public Blob `penstudio-films`（iad1）；production/preview/development服务端配置BLOB_READ_WRITE_TOKEN、FILM_PUBLISH_PASSWORD、FILM_PUBLISH_SECRET。无VITE前缀，公开静态JS/HTML/JSON/CSS实际密钥扫描通过；管理口令仅保存于本机权限600的忽略文件，存储token与HMAC密钥不进入公开记录。为匿名Preview验收关闭项目SSO部署保护，作品观看仍无需登录。

最终Preview [aa9yvc9r1](https://penstudio-libtv-aa9yvc9r1-bins-projects-795df2ea.vercel.app/)（`dpl_BcZdtftADwpEqWyXEJbkp3jkoi9E`）在生产发布前验过错误口令、首次真实上传/完成、重复complete200与匿名三结局/SRI。其release为 `3aa64138-492e-406d-9594-3cb0a552cb13`。历史gr5 Preview覆盖上传中断、取消及同release重试，首次完成503的公共Blob负缓存问题已由HEAD存在性门控修复；不将历史503记为首次成功。

生产再次真实上传584,729字节MP4，只传1次；首次完成及重复complete均200。生产release `f72577e9-255b-44d2-8527-78dab3845607` 为revision284，与试玩/ZIP使用相同剧情和固定运行器。Preview release经生产匿名路由也走通三个结局，390px暂停计时与native fullscreen内媒体/互动叠层通过、无横向溢出。更新前release `11040114-85a5-469d-b74b-569cbfd27ba8` 在新生产部署仍真实播放至成功获救，SRI不变。证据与边界见 [影游审计](./interactive-film-audit.md)。

生产HTTP复验63/63通过：30旧前端深链、4JSON内容入口、真实gzip画布快照、编译JS/CSS/WASM/SVG、示例视频/固定runtime、4许可证、影游深链与缺失assets/data/api/release真实404。新旧三个release均为revision284，runtime实际字节SHA与SRI匹配且CORS允许匿名跨域读取，三个MP4实际HEAD均584,729字节/video/mp4。报告 [film-production-http-check.json](../output/film-production-http-check.json)。最终生产release在独立匿名会话也走通全部三结局，见 [浏览器结果](../output/playwright/film-production-release-final-three-endings.log)。

影游作品的媒体、manifest及受信bundle写入Blob，项目编辑/素材库等创作状态仍为当前浏览器本地。原Canvas/Studio/Skill的生成、支付、认证与运营写服务未接；手机/Safari实机、持续网络断流与大文件multipart未验，不将桌面窄视口或测试夹具当作这些验收。以下保留历史静态部署及广告热修补记录，其“无环境变量/暂无函数”仅描述当时部署。

历史状态（2026-10-11）：广告移除后的生产部署 **READY**。公开地址：[PenStudio](https://penstudio-libtv.vercel.app/)。该批部署 ID：`dpl_G4BQ7iZGZ5HkYC3JvCEZyhC3EmsH`，不可变部署地址为 `https://penstudio-libtv-fg0bumiyl-bins-projects-795df2ea.vercel.app`。原发布版本为 `dpl_FzZ2MMKc2ye5gzLebK1Qai1zCe3o`。

## 自动广告移除

用户要求移除自动弹出的广告。源码删除 `useAppUI` 中1500ms自动促销effect、dismissPromotion回调与返回值、GlobalOverlays的广告分支及24条专属CSS规则；原始公开配置/素材作为调研样本保留。shell现有测试改为首次进入、60秒等待和重挂后不弹广告，且主动会员仍可打开，7项通过，日志 `artifacts/popup-shell-check.log`。本次文件定向Prettier与零警告ESLint通过。

当前工作区仍有并行Canvas编辑，全量check在格式阶段停止，记录 `artifacts/popup-removal-check.log`；独立源码副本格式处理后仍因当时的Canvas规则差异、未复制的GLB夹具和本次测试初始控件名失败而停在测试阶段，记录 `artifacts/popup-removal-release-check.log`。控件名已修正并通过shell回归；未修改并行Canvas源码或以该副本构建部署，不能声称当前全量check通过。

本次发布以之前完成全check的静态包为基线，通过Espree AST精确替换唯一广告effect、广告渲染分支与未使用的dismissal回调，并通过PostCSS删除专属规则。重新解析JS/CSS；逐文件SHA核对确认只有入口JS与CSS改变，其他1478个文件字节不变。此次产物1480文件、89,816,557字节，范围与许可证沿用原包；脚本与范围/SHA报告为 `artifacts/popup-removal-hotfix.mjs`、`artifacts/popup-removal-hotfix-report.json`。此为本次独立热修补；后续源码发布仍需完整check及vercel:prepare。

线上静态文件为max-age=0,must-revalidate，因此保留已有文件名与lazy引用关系，通过更新ETag重新验证缓存。CLI发布耗时12秒，生产alias已更新；结果与日志为 `artifacts/popup-removal-deploy-result.json`、`artifacts/popup-removal-deploy.log`。初始部署与验收的历史记录如下。

本次生产alias的7项HTTP复验通过，入口JS/CSS响应SHA与热修补报告一致，自动广告的代码字符串已不存在；首页、assets、skill、models数据和缺失数据404正确，记录 `artifacts/popup-removal-http-verification.json`。独立新部署域名桌面首访、390×844刷新及直接访问assets均无dialog/遮罩/inert；body可滚动，1280px与390px无横向溢出、桌面已加载图片无失败。待发布产物中主动会员打开与Escape回原触发器已实测。最终截图 `artifacts/popup-removal-online.jpg`；未把这些检查当作完整原站功能验收。

## 目标与范围

- 团队：`bins-projects-795df2ea`（Bin's projects），当前 Hobby。
- 项目：`penstudio-libtv`，ID `prj_bIBu04OWzmLqTQmgqxSl6ITpDHAf`；独立新项目，没有覆盖其他现有站点。
- 项目配置：Vite、Node 24.x、`npm ci`、`npm run build`、输出 `dist`。CLI 项目绑定已读回确认，无环境变量。
- 部署来源：当前本地工作区；没有通过 Git 推送或声称远端 CI 已通过。
- 发布内容：保留全部编译模块与页面入口，使用独立代表性内容包。原 `public/` 的 9,236 个文件、907.34 MiB 不被删改。
- 本机打包：`npm run vercel:prepare`；报告为 `artifacts/vercel-package-report.json`，产物为 `.vercel/output/`。目标 90,000,000 字节，上限 95,000,000 字节。

最终产物 89,819,110 字节、1,480 个文件，包含 111 个编译文件、24 个真实作品及各自快照、30 个 Skill（其中 17 个原已采集公开详情）、1 个教程、4 篇文章、1 个大师课、2 个活动与版本功能样本。26 个现有许可证/NOTICE/版本说明文件一并保留，不改写原许可文本。

大师课、CLI showcase、一个 Skill 案例和一张大型 banner 共 5 个资源使用其已采集的原始公开 URL，均已只读 HEAD 确认 200；其中 Skill 的 mp4 返回 application/octet-stream，不能仅以 HEAD 证明全部浏览器媒体兼容。未新增采集、没有占位替代、未删除本地原素材。其余原来未映射的外部媒体链接继续沿用原快照，仍依赖源 CDN 可用性。

## 平台与路由依据

Vercel 的 [上传限制](https://vercel.com/docs/limits)说明 Hobby 的 CLI 源文件上传总量上限为 100 MB，因此不能直接上传当前全部素材。部署按 [Build Output API](https://vercel.com/docs/build-output-api/configuration)制作静态产物并使用 `--prebuilt` 发布。

静态文件先按文件系统解析，再让前端页面路径回退至 `index.html`。`/assets` 是资产页；`/assets/*` 与 `/data/*` 是真实静态文件路径，缺失文件应返回 404，不能返回首页 HTML。gzip 画布读取保留现有 magic bytes 识别，不额外伪造编码响应。

## 工程验证

使用 bundled Node 24.19.0 执行 `npm run check`：格式、零警告 lint/导入边界、核心 strict TypeScript、232 个测试文件/2140 项测试与生产构建通过。日志 `artifacts/vercel-check.log`，生产构建 11.35 秒。核心 strict 不代表全部 JSX 类型覆盖，测试和构建也不代表全站原版交互验收。

部署使用上述 21:54:56 已通过检查的冻结 `dist`。后续全量检查 `artifacts/vercel-final-check.log` 在格式阶段发现并行进行中的 3 个编辑器源文件未格式化，未继续执行其后步骤；这不记为当前工作区全量检查通过，也没有把这些后续编辑混入冻结产物。新增打包脚本、部署配置与说明的定向 Prettier/零警告 ESLint 通过。后续发布新的源码版本仍须重新完成 `npm run check`。

## 线上验证

- 30 个代表性页面深链、4 个 JSON 内容入口、作品真实 gzip 画布、编译 JS/WASM/SVG 共 41 项访问验证通过；缺失 assets/data/API 返回真实 404，exact `/assets` 正常返回资产页。结果见 `artifacts/vercel-http-verification.json`。
- 许可证补齐后的最终生产版本再次验证 `/assets`、`/skill`、内容接口、缺失资源和 3 个许可证文件，9 项通过，见 `artifacts/vercel-final-http-verification.json`。
- 实际浏览器首页图片没有失败，搜索“大象”返回对应真实样本；详情视频取得 373.17 秒 metadata、无 media error；“查看创作过程”实际显示该作品的 134 个节点，Escape 关闭成功。
- `/assets` 实际新建测试文件夹后刷新保留。390×844 视口显示正常，document scrollWidth=390；截图 `artifacts/vercel-assets-mobile.jpg`。此记录仅验证当前浏览器本地持久化，不证明服务器写入或真机兼容。
- Vercel 部署状态读回 READY，发布耗时 11 秒（prebuilt 上传/发布，没有远端重新编译）。错误级请求日志查询返回无记录；静态站暂无函数，不能把无日志当作浏览器全部交互验收。

## 服务边界

当前使用无需登录的本地工作区。项目、资产、Skill、画布等写入仍保存于部署域名的浏览器存储，与 localhost 独立；未接入真实认证、团队权限、运营写服务、生成、支付或跨设备同步。部署代表性样本不代表完整原站内容或完整功能复刻。
