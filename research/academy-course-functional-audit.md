# 学院 course / practice / product 路由与播放器审计

本批使用匿名公开请求、本地已保存的原站客户端源码与 root 的真实浏览器观察。没有登录、注册、借用账号、领取课程、支付、生成、克隆原站项目或调用原站写入接口。内容只保留一门公开可确认课程的代表样本。

## 路由证据：此前“没有 UI 证据”结论已修正

三个独立页面均已找到真实客户端组件；路径不是由 API 字段推测出来的。`research/academy-route-investigation/http-evidence.json` 保留原始 URL、HTTP 状态与实际返回 HTML；三个 deliberately invalid identifier 请求都返回 HTTP 200 的对应 Next 页面，不能把它们描述为 HTTP 404。

| 原始公开路由 | Flight / renderer | 原始本地源码 | 本地入口 / layout |
| --- | --- | --- | --- |
| `/academy/course/[courseId]` | 768817 | `research/source/2-uu75o9gwn8b.js` | `src/features/academy/CoursePage.jsx` / standalone |
| `/academy/practice/[courseId]` | 800489 | `research/source/3xb7s8_d5kcst.js` | `src/features/academy/PracticePage.jsx` / standalone |
| `/academy/product/[skuCode]` | 698692 | `research/source/2c9vfr95007ph.js` | `src/features/academy/ProductPage.jsx` / chrome |

Product 的原站 Shell 明确 `hideSidebar=true`；保留顶部促销、导航和帮助入口。路由映射为独立 `chrome` 类型，Root 已接入 AppShell。其他未知学院子路径仍匹配真正的 NotFound，没有用前缀吞掉未知地址。

## 可访问范围及默认页面

代表课程 UUID 为 `01a04720890e7d7498763b99b845e1a2`。各响应及独立 HTTP 元数据保存在 `research/academy-route-investigation/`；前端只读样本为 `public/data/academy-courses.json`。

| 只读公开请求 | 实际结果 | 本地处理 |
| --- | --- | --- |
| GET `/api/course/v1/plaza` | HTTP 200, code 0, total 1 但 list [] | 不凭 total 构造商品 SKU 或课程卡 |
| GET `/api/course/v1/courses/{uuid}/overview` | HTTP 200/code 0：课程名、封面、简介、13节大纲 | 可用于可配置商品适配器的介绍内容 |
| GET `/api/course/v1/courses/{uuid}/toc` | HTTP 200/code 0：13节均 playable false / NOT_ENROLLED；videoUnlockRule ALL_OPEN | 以逐章节 playable 为准；不根据 ALL_OPEN 私自解锁 |
| GET `/api/course/v1/clips/01a04762c12a7152a21674360f4a2753/play` | HTTP 403/code 60003：not enrolled in this course | 保存真实访问错误，没有私人视频 URL |
| GET `/api/course/v1/practice-nodes/01a04762cd0b73c196f4056c05d1229c/studio` | HTTP 401/code 10002：unauthorized | 跟练配置加载失败，可重试，不创建模拟授权画布 |
| POST `/api/course/v1/courses/purchase-info` body `{skuCode:'unknown-course'}` | 只读商品详情查询，HTTP 200/code 60001：course product not found | 商品信息失败与内容失败分开显示，无购买按钮 |
| GET `/api/course/v1/member/packages` | HTTP 200/code 0：4个课程专属会员包 | 只展示套餐；不创建订单或假称购买成功 |

Course 原源码只从 available 章节选择入口，然后才查询播放信息。若根本没有 lesson，返回 WatchSkeleton，而不是显示已拿到的锁定目录。因此本地匿名课程默认保留名称、获得 2000 积分的跟练入口和专属会员按钮，主体视频、元信息及右目录保持骨架。

Root 已在原站 tab 17、1280×720 实测：首次仅学院/会员入口，稍后名称与跟练按钮出现，主体一直为上述骨架，warn/error 日志为空。这与源代码的无 playable clip 分支一致。没有把公开拿到的13节 TOC伪装成原站最终匿名目录。

Practice 源码只有 code 60011 才显示“完成上一小节学习后解锁本次跟练”；401归入配置加载失败。源码还明确团队账号不可操作、56px顶栏与340px侧栏。本地分别保留 loading、配置失败/重试、团队阻断、前置章节锁定/前往视频课分支。

Product 使用独立详情和简介资源状态。未知 SKU 会导致信息加载失败，而简介无 courseId 时进入通用内容失败；成功介绍页来自真实 renderer，含16:9介绍视频/封面、折叠简介、标签、章节大纲、358px权益栏及移动固定购买栏。未找到有效公开 SKU，因此不杜撰课程售价、不将课程会员 SKU 当成课程商品。成功商品布局仅用依赖注入的本地测试适配器验证。

## 课程专属会员弹窗

这是原商业模块 `0p8c68jeajrhn.js` 的 `oC/oy` 与 CSS module 873509，区别于通用 Membership。本批直接沿用其 card/header/price/benefits/promo/mobile carousel 规则，重命名为学院域 CSS 类。

4个公开包：普通月99（原/续109、2000积分）、专业月399（原/续599、11000积分）、普通年499（原/续1299、立减800）、专业年2399（原/续7099、立减5700）。并发/存储等来自已有 membershipLevels 的276/277/278/279包映射。估算图片/视频使用已公开 commercialConfig.costPerGeneration 的0.25/8，不另编费率。

顶部真实横幅来自已保存 `research/source/api/config-type-7.json` id226、`public/data/remote-configs.json` 的226.paywall；其合并逻辑在 `research/source/40l-nlgc_zl20.js` 的 buildCoursePromoteActivityFromLandingItem。素材已有 `/assets/97e1c9ee2c986b34.png`，标题“罗永浩学员专属 比普通会员购买更优惠”、副标题“学员专属价格，仅限购买一次”、原图1268×136、hideCountdown=true。另补两张原始卡片 header SVG（只下载源码明示的两张素材）为 `/assets/course-member-month.svg` 与 `/assets/course-member-year.svg`。

Root 实际桌面对照指出：1280×720原站全屏黑色滚动modal，顶端约1160宽横幅，标题在y180左右，4张310宽卡横排，约x2/324/646/968，右侧允许原站裁边。本地首次用了盒状容器和两列，本批已按实测修成全屏、原四列和真实顶横幅；删除了自创的≤1300两列。≤768保持原源码横向 scroll-snap carousel，初始定位第一张年包。Root随后实测公共Modal的max-width/border/padding仍使弹窗缩为1232px；现已增加课程专用覆盖并按source把主背景改为#000。最终本地1280×720实测横幅x60、四张310宽卡按原横排；390×844弹窗边界0..390、初始年包居中（list scrollLeft644），指示点可切换，Escape回打开按钮且恢复body滚动。此为布局与关键交互核对，不代表所有状态逐像素通过。

未登录套餐购买只交给现有登录入口；本地注入 user 也只得到 repository 的明确服务未连接错误，绝不改变 owned/权限状态。Modal复用公共焦点/stack/Escape/滚动锁机制。

## 播放器：本批已实现并测试的功能

源组件为 `research/source/1qzom_a49htdf.js` module973556，辅助布局/格式/骨架在 `0-lgkz14q-k7v.js`。实现移入 `src/features/academy/player/`，旧 shared/secondary/CoursePlayer 保留兼容导出；未改 VideoPage 评论域。

- 原倍速选项2/1.5/1/0.75；统一storage服务保存倍速与清晰度高度，校验损坏偏好并提示写入失败。
- 清晰度按height映射。切换保留 currentTime 与此前 paused/playing状态；不会因曾经播放过而在暂停后切换时意外播放。
- 恢复进度仅用于0 < resume < duration−1；长课程显示小时；进度/音量/静音/全屏/键盘支持；原生button/range/dialog内不抢Space或箭头。
- 300ms后才出现缓冲状态；playing清除；错误原逻辑先重试两次，再尝试最低清晰度一次，终态提供重试；offline独立状态，online恢复。媒体路由切换/重试释放旧视频src、事件相关计时器。
- 跟练标记沿用实际 crossing≤1.5sec、零秒标记在1sec触发、每章节只自动一次、seek不自动弹出、hover 1000ms、离开160ms、自动5sec关闭；有去跟练回调才展示标记。
- 播完 followup gate allow/hold/deny；有下一节5sec自动继续，hover/document.hidden暂停倒计时，最新回调，取消计时器；可以重播或去跟练。
- controls 3sec隐藏、focus/pointer唤回、移动更多设置、浏览器全屏及 Safari原生fullscreen调用fallback。reduced-motion关闭新增控制渐变；全屏/Safari的实际浏览器行为尚待Root检查。

课程目录的展开状态也已按原 course renderer（module 768817）收敛：收到新的课程 detail 时恢复该 detail 的 `defaultExpandedIds`，不沿用上一课程的手动展开；当前章节所属分组始终保持展开，即使用户点击其折叠按钮也不会把正在播放的章节从目录中隐藏。`src/features/academy/course/CourseCatalog.test.jsx` 以本地课程适配器覆盖了当前组折叠和课程切换两条回归；这只证明本地前端状态协议，不涉及课程授权或服务器目录写入。

## 检查结果与明确剩余边界

定向 Vitest：7文件44项通过（包含routes表）；自己所有学院和compat导出文件 ESLint零警告；Prettier已应用。测试覆盖原匿名骨架不查询lesson、403/401不假解锁、商品错误、课程member4包/入口、原目录三种层级、过期请求不串路由、暂停清晰度切换/继续播放、buffer计时与释放、markers一次触发、偏好/配额失败、hold/deny/hidden/hover与最新next callback。成功目录/已购商品/播放器可用视频状态均为明确本地 test fixture和mock media element，**不是实际购买或课程解锁证据**。

本批不声称所有正向私人学院功能完整。尚待后续领域工作：

1. 运营进度/会员/订单服务仍未连接。后续批次已接 heartbeat/final/beacon、确认完成后的2秒门控、TOC刷新/隔离，以及配置292的 minute条、first/half营销弹窗、paywall scene与sticky deny；总跟练 intro/lastPracticeNodeUuid/window.open 也已接。见 [course 分域审计](../src/features/academy/course/SOURCE_AUDIT.md)。默认仓库仍不写原站；正向夹具不代表账号授权或实际连续观看服务验收。
2. Practice正向严格跟练Canvas、teacherPreset/anchors/steps/锁定模型/模拟与自由画布切换、材料/历史/证书及实际生成协议。本地只给真实状态和 renderPracticeCanvas适配入口；缺Canvas适配时明确“跟练画布暂不可用”，没有空网格冒充功能完成。
3. 有效课程SKU/下单/支付/兑换及授权资源；未公开确认的数据与服务不捏造。
4. 此项为上批历史缺口：后续已按原懒 chunk 实现 WatchScrollStage、冻结帧和横屏设置/章节抽屉，并已把课程章节 drawer 接到 CoursePage。实现、浏览器边界分别见 [播放器高级形态审计](./academy-player-advanced-audit.md) 和 [course 分域审计](../src/features/academy/course/SOURCE_AUDIT.md)；不能据此声称逐像素或全平台相同。
5. Safari、orientation、真实离线/损坏媒体恢复和实际视频全屏仍待浏览器验收；相应生命周期有源码与单测，不能说跨浏览器通过。课程专属会员桌面/390px已做本地实际布局、年包定位及关闭回焦点检查。

历史批次全站 `npm run check`：78测试文件、377测试，格式、零警告ESLint、核心strict TypeScript和生产构建全部通过。Root当时本地浏览器另确认匿名Course骨架、Practice401错误/重试、未知Product错误与无侧栏chrome布局；有效已购课程和私人跟练未验。后续批次验证分别记录在播放器/course分域审计与根coverage。

## Practice 章节前后导航（2026-10-15）

原 Practice renderer 800489 的侧栏在跟练内容底部固定渲染“上一节”和“下一节”按钮；按钮按当前 section 在 `A.sections` 中的相邻项启用，边界项 disabled，点击复用同一 section 切换流程。它与可展开的跟练大纲不同，允许在当前画布之外快速切换相邻练习。

本地 `PracticePage` 已在 340px 侧栏底部补上该导航。当前 section 来自 `sectionId` 查询参数、`lastSectionId` 或第一项；前后按钮只改变本地 selection，再由既有 `practiceSection` repository 读取新配置，未创建授权、项目或进度写入。底部导航在加载、错误、团队账号阻断和无 section 状态下不显示，锁定节仍可使用相邻节导航；锁定文案与“前往视频课”分支保持原证据。

`src/features/academy/CourseRoutes.test.jsx` 新增本地 repository 夹具回归：从中间节进入下一节后下一节按钮变为 disabled，再返回上一节并确认 repository 使用新 section key；该测试只验证本地状态和读取协议，不代表私人课程授权或跟练 Canvas 已接入。定向结果：**7 个测试通过**（含原 401/60011 与团队账号分支）。
