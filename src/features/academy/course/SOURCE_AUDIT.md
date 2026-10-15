# Course 横屏章节与学习进度接线（2026-10-11）

本批复核已有公开源码，未登录、借用账号、读取私人视频、请求原站写接口或新增内容采集。正向测试使用明确的本地课程/播放/进度适配器夹具；不代表实际购买或解锁。

## 原始证据与页面契约

- `research/source/2-uu75o9gwn8b.js` renderer **768817** 是实际 `/academy/course/[courseId]` 页面。它将 CoursePlayer 的 `landscapeChrome` 接到 LandscapeTopBar（当前 lesson 标题、`academy:coursePlayback`）和 EpisodeDrawer（detail、currentSectionId、onSelect、onGoPractice、onClose），并非仅导出一个未使用的目录组件。
- `research/source/1i2hyd-9t3sv3.js` module **449199** 的章节抽屉渲染 units/groups/leaves；available=false 禁止选择，当前节展示 practiceNodes。选中当前章节不触发切换，新的章节选择先 final flush。`public/data/locale-zh.json` 确认字幕为“课程播放”、目录为“课程选集”。
- 同一 course renderer 内的进度 hook 使用 `reportLessonProgress({sectionId,positionSec,playbackRate,final})`，position 取整，默认 heartbeatIntervalSec=15，非 final 相同位置去重，final 按 sectionId/position 去重。hidden/pagehide 使用 `reportLessonProgressBeacon`，卸载与切换前 final flush；仅已登录且有章节时启用。
- 原 renderer 在确认 watchDone 后刷新 TOC。首次完成暂缓 followup **2 秒**，营销弹窗另参与 allow/hold/deny；`research/source/1qzom_a49htdf.js` module **973556** 已具备相应播放器门控及 5 秒下一节倒计时。
- 原 renderer 的 `eN/eh` 在跟练入口先暂停播放器，手机显示 PC 提示，桌面链接为 `/academy/practice/{courseId}?sectionId={encodedPracticeNodeUuid}`。总入口的 lastPracticeNodeUuid 和 usePracticeIntroGate 是另外的课程介绍流程，不由章节 drawer 推测出新的 Canvas 协议。
- 默认公开课程的 13 节 available=false、播放 403/60003 和跟练 401/10002 证据仍见 [学院路由审计](../../../../research/academy-course-functional-audit.md)。原页面无 available lesson 时是骨架，不展示一个假解锁目录。

## 本批实现与依赖

`CoursePage → course progress/resource hooks + player views/hooks → caller repository、公共 dialog/storage`。没有引入 app/router 或跨域私有实现。

- CoursePage 真正接入横屏 topbar 和章节 drawer；两处目录共用同一选择权限。下一节只从可用章节中选择；匿名无可用章节不查询 lesson，读取授权错误保持骨架与重试。
- `CourseCatalog` 的展开状态现在与原 module 768817 对齐：新的 course detail 先恢复 `defaultExpandedIds`，不会把上一门课程的手动展开状态带入；当前章节所属分组即使点击折叠也保持可见，避免当前节从目录中消失。该规则在 `CourseCatalog.test.jsx` 用课程切换与当前分组折叠回归覆盖。
- 新 `useCourseProgress` 只在 caller 有 user、当前 available lesson 和明确的 `repository.reportLessonProgress` 时写入。默认公开 repository 没有 writer，不能保存假进度或改变授权；运营 adapter 可额外提供同步 beacon 方法。正文/恢复时间及拖动后的实际位置传入进度 hook，未观察到播放位置时不写初始假 0。
- 单次会话隔离章节/课程和 writer。旧节迟到的 ack 不更新新节错误/完成状态；失败保留媒体与当前位置，明确显示同步错误，可重试。无 ack 不当完成。当前节新的 watchDone ack 仅触发一次完成刷新及 2 秒 hold。
- `useAcademyResource` 新增显式 keepPrevious，仅 Course TOC 刷新启用：重读/失败保留当前 detail 和相同 video，不因进度确认重载 lesson；读取错误让目录显示原“目录加载失败，点击重试”。更换 route key 立即隔离旧数据，迟到结果不能回写。
- 抽屉 Escape 返回“选集”；更换章节导致旧播放器卸载时，读取成功后交给新播放器焦点。抽屉去跟练的提示关闭后返回稳定的选集按钮，复用公共 stack/滚动锁，不另建弹窗生命周期。
- 跟练复制链接保留实际 practice node 的 sectionId 参数；PracticePage 读取 sectionId，并兼容旧本地 section 参数。只改参数接线，没有构造 teacherPreset/anchors/steps 或模拟授权 Canvas。

## 横屏批次定向验证（历史）

`npx vitest run src/features/academy/CourseRoutes.test.jsx src/features/academy/course src/features/academy/player`：**11 文件、56 项通过**。CoursePage/PracticePage/course/player 的 ESLint 零警告，owned 文件 Prettier 检查通过；全站检查和浏览器由 Root 统一执行。

新增回归使用真实 CoursePage、CoursePlayer、dialog 和 HTMLVideoElement DOM，mock 仅为浏览器媒体/fullscreen 原生方法及明确的本地 repository。覆盖：

- 打开横屏目录、当前状态、禁用章节、当前节不重复请求、Escape 回焦点；章节切换前保存 seek 后的位置，下一节恢复 42 秒并将焦点交到新播放器。
- 手机 UA 横屏仍走移动提示；复制 encoded sectionId 链接，关闭提示恢复选集按钮和 body 滚动。
- confirmed watchDone 后刷新目录保留同一 video，2 秒 hold 后再显示后续操作及 5 秒下一节；目录重读失败保留媒体，原错误按钮重试成功。
- 匿名全部不可用时无 video/lesson/进度写入；匿名可预览也不写进度，403 不伪造播放资源。
- 15 秒 heartbeat、整数位置、重复 final、pagehide beacon 及清理；旧章节 ack 隔离、缺 ack 不完成、写入错误原位置重试；同 key 保留数据和跨 key 迟到请求隔离。

## 横屏批次结束时的边界（历史）

- 当时尚缺 minute threshold、minute bar、popup/paywall/deny；这些前端接线现已在下方营销批次完成，运营服务边界继续保留。
- 当时尚缺总跟练 usePracticeIntroGate/lastPracticeNodeUuid/window.open；这些入口现已在下方批次完成。授权 Canvas 内容仍是独立边界。
- 运营进度、购买与解锁服务未连接；默认公开课程不调用 progress writer。适配器夹具验证的是前端契约和生命周期。
- Native fullscreen、真实手机旋转/Safari、编解码、媒体权限和像素结果需 Root 浏览器验证；JSDOM 事件测试不替代这些验收。浮窗与冻结帧已有上批实现和审计，本批不重新宣称其跨浏览器完备。

## 课程营销与跟练介绍批次

继续依据原 renderer **768817**，没有请求账号/付款/生成服务。只补取两个明确 lazy UI chunk；原文件、来源 URL、字节数与 SHA-256 见 `research/source/course-marketing-intro-chunks.json`：

- `research/source/2x6wykfjy4ry_.js`：module **14497** 的阈值/内容/优先级/allow-hold-deny 规则，**382504** 的一次与每日限频，**29752** 的 usePracticeIntroGate。商业模块 **599722** 的 getCourseMemberPower 返回 `code/data.member.displayName`。
- `research/source/1ly538haf60rg.js`：module **924897/906228** 的 PracticeIntroModal，820px 外框、448px 高图片列、360px 文案列、四条优势、积分与开始按钮。原背景 `https://libtv-res.liblib.art/upload-images/8244a30ac2e94d9289e7216922b50a09/f9268228fafb038da24cdcb4e89ed24840797670.webp` 单张已保存 `/assets/course-practice-intro.webp`（2,026,386 bytes）；未扩采媒体。
- `research/source/0nuy2yh24w61h.js`：module **574704/481088** 的 CourseMarketingModal。portal 为 fullscreenElement 或 body，黑色60%遮罩；桌面400px/手机338px，图片、title/content/cornerMark、继续看课和 btnText。原 renderer 不渲染配置中的 subTitle，本地也未另造该行。
- `public/data/remote-configs.json` 的 **292** 是已有真实 read 配置，默认 repository 通过 `loadContent('remote-configs')` 使用它。第一门原课程的 clip-specific 阈值为150/90/210/280.002秒；无默认 minute 时其他 clip 不推断阈值。creditsHalf 是 Practice 场景，未混进 Course renderer。

### Source gates 与实际接线

- `marketing-model.js` 只计算内容、课程白名单、阈值、半程候选优先级和 gate。分钟提醒取播放 position，不另造连续观看计时器；CoursePlayer 对异步阈值到达及暂停 seek 的当前位置也检查一次，匹配原 frame-loop 行为。
- `useCourseMarketing` 接真实读取配置和可注入 memberPower，只有 `code===0` 且没有 `member.displayName` 才当非会员；失败明确可重试，默认 repository 未连接此运营读取时抛 UNAVAILABLE，不把 unknown 当非会员。沿用原 `libtv_refresh_member_power` 事件清缓存并复核当前分钟条；原调试参数 `courseMarketingDebug=1` 只显式绕过权益/限频，匿名 popup 仍受登录/uuid 条件限制。
- CoursePage 实际传入 `positionThresholdSec/onPositionThresholdReached`。分钟条仅桌面显示，点击课程 paywall 时透传 `lesson_watch_n_minutes`。确认新的完成后重读 TOC，`clipDone/clipTotal` 达门槛先尝试 progressHalf，再尝试第一章 firstClipDone。完成状态按首次进入该节记录，后续 TOC 变化不把已完成节重新当新完成。
- `marketing-frequency.js` 将 source 的 per-touch/uid/course 一次与 per-uid/本地日期 dailyLimit（默认2）映射到统一 storage 的本地原子文档 `libtv-course-marketing` version1。半程命中时同时 suppress 首章，读损坏/不可用时 fail closed；写失败保留会话内限频及已打开的 popup 并显示错误。没有读取原站 IndexedDB/账号限频记录。
- Popup 开启即 deny，关闭后本节仍 deny；换节清除 takeover。CTA 关闭 popup、打开已有专属 CourseMemberModal，透传 `chapter_half_progress` 或 `first_video_complete`。套餐 checkout 接收这个 scene；未连服务继续报错，不改变会员/课程状态。营销、会员与介绍弹层复用同一学院 fullscreen portal 和公共 dialog stack，避免原生全屏中支付入口消失。
- `practice-entry.js` 与 `usePracticeIntroGate` 保留 per-user id 介绍记忆和 source 的 once-per-runtime 标志；关闭也记已见，下一次直接进入，读历史失败按原 source 跳过介绍，写失败仍保留已显示介绍并提示。迟到 claim 不打开已替换/卸载课程。
- CoursePage 总入口、播放器去跟练均暂停当前媒体，手机使用 PC 提示并复制 lastPracticeNodeUuid；桌面首次显示介绍。开始或已看过走 `window.open(url, '_blank', 'noopener')`，不离开课程 tab。目录/marker 的指定 node 入口直接使用同一新窗口函数，不套介绍；所有链接保留原 sectionId 参数。

### Adapter 与验证边界

`repository.marketingConfig(options)` 返回配置292；`repository.courseMemberPower(courseId, options?)` 返回明确的原 `code/data.member` 形状。`createAcademyRepository` 支持注入 `loadMarketing/memberPower`；进度 writer、购买及授权资源的默认行为未改。没有 mock server 强制解锁。

新增真实 CoursePage 集成回归使用合成课程/权限/进度，配置292及会员包来自公开快照；测试不将这些夹具标记为原私有课程内容。覆盖 threshold 与延迟 read、非会员验证/失败重试/事件失效、half/first优先级与 suppress、关闭后的 sticky deny、A→B→A 重新进入旧节不恢复旧 takeover 或分钟提醒、fullscreen portal与 paywall scene/错误、匿名/会员门控、介绍关闭回焦点/一次记忆/配额错误、last node、新窗口与旧 route ack 隔离。纯模型另覆盖真实150秒配置、默认阈值、限频跨 runtime/日期/uid、损坏存储及 late claim。

最新定向命令仍为 `npx vitest run src/features/academy/CourseRoutes.test.jsx src/features/academy/course src/features/academy/player`；最新结果 **15 文件 / 78 项通过**，CoursePage/course/player ESLint零警告、Prettier检查通过。全站与 Cua desktop/390px 浏览器由 Root 执行，未在本批声称实际跨浏览器/像素通过。

Root 浏览器夹具位于 ignored `artifacts/course-marketing-fixture.js`：`createCourseMarketingFixture({scenario:'first'|'half',member:false|true})` 返回可直接传给 CoursePage 的 props。采用现有64秒公开教程作真实媒体，**仅 QA adapter** 将6秒设为分钟提醒、12秒 ack 完成、heartbeat=1秒；这些数字不代替生产配置/15秒默认值。夹具限频和介绍只用内存，checkout始终未连接，所有权限和进度明确为合成状态。

剩余：真实权益/进度/订单/授权服务、私人跟练 Canvas、teacherPreset/anchors/生成/证书等协议未接；手机 native fullscreen/Safari、实际营销素材像素与方向行为需 Root 验收。已实现的源文案描述课程能力，不代表本地生成或购买服务已经可用。

## Practice 相邻章节导航（2026-10-15）

原 module 800489 的跟练侧栏在内容区底部提供上一节/下一节按钮，依据 `A.sections` 的相邻 sectionId 启用，边界按钮 disabled，并沿用 section change handler 重新读取配置。`PracticePage` 现在保持同一契约：按钮仅更新本地 selection，`useAcademyResource` 再调用注入的 `practiceSection` 读取；不写进度、创建工程或改变授权。导航位于 340px 侧栏底部，遵循现有固定 topbar / side rail 布局。

`CourseRoutes.test.jsx` 的本地夹具覆盖中间节向前、向后切换和边界 disabled，定向该文件 **7 tests passed**。这项实现不代表私人 Practice Canvas、步骤、模型或生成服务已接入。

## Root 本地浏览器验收

实际 CoursePage 使用显式 QA adapter（合成权限/内存进度、既有64秒公开教程）。播放产生 first 营销弹窗，CTA 打开专属四包会员；关闭后播放完成仍停章节1，sticky deny 生效。A→B→A 回到0秒，无旧分钟条。总跟练首次介绍的开始按钮实际新开 `/academy/practice/qa-course-adapter-fixture?sectionId=qa-practice-last`，原课程标签保留。截图 artifacts/course-marketing-adapter-proof.jpg 标明 QA 身份。全屏按钮在当前 in-app browser 没有进入 native fullscreen，不能算原生全屏验证；手机旋转/Safari/真实授权仍缺。统一检查107文件549项通过，日志 artifacts/toolbar-course-final-check.log；实际范围以 research/coverage.md 为准。
