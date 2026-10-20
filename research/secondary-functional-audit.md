# 次级页面功能审计（2026-10-10）

本轮只核对已保存的原站公开源码、页面记录和本地实现，没有重新采集内容、使用浏览器或登录真实账号。内容样本用于验收交互，不以数量作为完成标准。以下「已实现」指代码中具备相应前端行为；原站逐状态视觉对照与真实服务验证不包含在本次结论中。

## 学院 course / practice / product 的性质

**三者均是原站客户端明确声明的前端路由，不只是 API 名称。**

证据：`research/source/2tatq811u-irn.js` 的学院页面回调直接调用：

- `router.push('/academy/product/' + encodeURIComponent(skuCode))`；课程卡片有 skuCode 时走商品页，没有 skuCode 时可打开外部购买链接或购买指引弹窗。
- `router.push('/academy/course/' + courseId)`，以及 `window.open('/academy/course/' + courseId, '_blank', 'noopener')`；观看课程和兑换成功后继续学习都使用该路由。
- `window.open('/academy/practice/' + courseId, '_blank', 'noopener')`；我的课程「跟练室」、兑换成功后的实践入口使用该路由。此处参数实际由 courseId 传入，不能仅根据 API 中 practiceUuid 名称认定页面参数类型。

该 chunk 同时声明 `ACADEMY_WHITELIST_GATE_ENABLED = !isTest`。学院「我的课程」「课程广场」的 JSX 被 `academyWhitelisted` 计算结果 V 控制，匿名原站观察未显示这两栏，与源码门控一致。不可把正常隐藏的白名单栏目当成公开首页缺栏。

2026-10-11 后续调研已补齐三个真实 renderer 的 HTML/Flight/源码证据及一门公开课程的overview/TOC。三路由均注册独立页面；默认匿名课程骨架、未授权Practice错误、未知商品错误按原源实现。之前“仅API证据、当前404”的结论已失效，详见 [学院审计](./academy-course-functional-audit.md)。有效商品SKU、授权跟练Canvas与服务端进度/购买仍未完成。

## 逐域核对

| 页面 / 交互                                                                                                                        | 当前状态                                                                                                                                                                                                                                                            | 原站证据 / 本地入口                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/academy` 标题、大师课、图文/亮点功能标签、卡片入口                                                                               | 已实现代表性内容与匿名入口门槛；本轮修复无大师课配置时页面崩溃，按原站隐藏该区块                                                                                                                                                                                    | `2tatq811u-irn.js` 中 AcademyHero、F、O；`research/secondary-ui.md`；`features/academy/AcademyPage.jsx`                                            |
| 学院卡片打开方式                                                                                                                   | 已按 source 在登录门槛通过后新窗口打开 article/tutorial/masterclass，使用 `_blank` 与 `noopener,noreferrer`；匿名点击继续走登录门槛 | `2tatq811u-irn.js` e8/e3/e5 回调；AcademyPage.jsx、AcademyEntryWindow.test.jsx |
| 白名单课程、我的课程、兑换码、渠道兑换、购买指引、跟练介绍/版本/历史/材料包                                                        | 明确待办；不是公开匿名当前首页必须展示的栏；本轮未扩展未核实 UI                                                                                                                                                                                                     | `2tatq811u-irn.js` K/E、redeemCourseByChannelAuth、usePracticeIntroGate；`public/data/secondary.json` academyLocale 可证文案，不能单靠文案认定完成 |
| `/academy/article/:id` Markdown、h2 目录定位/当前章节、上/下一篇、画布入口、未知 ID                                                | 已实现基础交互与未知 ID；加载/网络错误由统一内容边界处理                                                                                                                                                                                                            | `1hk9v4nnqrplq.js`；`41asxho41ugdo.js`；ArticlePage.jsx                                                                                            |
| article 下架、细分请求错误、画布 CTA 来源参数/新窗口                                                                               | 已支持可注入 article source 的 loading、60016→notFound、60017→offline、通用错误重试；默认快照仍显示原未知 ID 文案。画布 CTA 保留 `source=academy_tutorial`、`itemKey=articleUuid`、原 query/hash 和新窗口属性；真实文章接口仍未接入 | `1hk9v4nnqrplq.js` getAcademyArticleDetail、h()/p()/g()；ArticlePage.jsx；`services/academy-article-entry.js` |

2026-10-16 作品详情错误边界维护：`DetailPage` 统一使用 `useContent` 读取详情、图库列表和初始样本；任一读取失败且尚未有可展示作品时显示“作品加载失败”和“重试”，只重新读取失败资源，未知 ID 仍显示原“作品不存在或已下架”状态。定向 2 文件 / 4 项通过，最新全量检查 **479 文件 / 6616 项**通过；证据见 `artifacts/detail-retry-verification.json`。真实详情服务、账号状态和写入接口仍未接入。

2026-10-16 用户主页错误边界维护：`ProfilePage` 统一使用 `useContent` 读取图库、公开样本、用户资料和外壳配置；加载失败且没有可展示资料时显示“用户主页加载失败”和“重试”，加载期间显示明确 loading，重试只刷新失败资源。定向 3 文件 / 5 项通过，最新全量检查 **480 文件 / 6617 项**通过；证据见 `artifacts/profile-retry-verification.json`。真实关注、账号资料和作品服务仍未接入。

2026-10-16 文章错误状态维护：`ArticlePage` 支持注入 `articleSource.load(articleUuid)`，将公开 source 的 60016 映射为下架/不存在、60017 映射为离线，并为离线/通用错误提供重试；无 source 时继续读取 `secondary.json` 快照。定向 2 文件 / 9 项通过，最新全量检查 470 文件 / 6588 项通过。本地没有伪造文章权限或远程接口成功。

2026-10-16 学院卡片入口维护：`AcademyPage` 的大师课、图文教程和亮点功能卡片在登录门槛通过后调用新窗口打开，匿名点击仍只调用 login。定向 2 文件 / 9 项通过，最新全量检查 471 文件 / 6590 项通过；本地不伪造真实认证或跨窗口服务状态。

2026-10-16 Markdown frontmatter 维护：共享 `Markdown` 按公开 source 解析 frontmatter 并渲染 Metadata 表格，字段只作为 React 文本输出，正文继续走现有链接/媒体安全规则。定向 3 文件 / 17 项通过，最新全量检查 472 文件 / 6592 项通过；完整嵌套语法和运营内容服务仍未接入。
| Markdown 阅读功能                                                                                                                  | 已有标题、表格、代码、链接、图片/视频、引用基础渲染；frontmatter 已解析为安全的 Metadata 表格并从正文剥离。完整嵌套语法/HTML 支持、真实 sanitizer 能力矩阵和逐像素对照仍待补 | `1p1-jebg1osnx.pretty.js` parseFrontmatter/default；`features/shared/secondary/Markdown.jsx`、`frontmatter.js` |
| `/academy/tutorial/:id` / `/academy/masterclass/:id` 播放、暂停、进度、音量、静音、倍速、清晰度、全屏、失败重试、更多教程/学习中心 | 已实现基本播放交互；仅默认本地 480p 样本有持久素材验证，高码率 qualities 仍可能引用原远程视频，未再次网络确认                                                                                                                                                       | `0nauv2vewemo-.js`、`0v8tmr25e1554.pretty.js`、`1qzom_a49htdf.pretty.js`、`0-lgkz14q-k7v.js`；VideoPage.jsx / CoursePlayer.jsx                     |
| 原站播放器高级交互 | 已实现按 source 的倍速/清晰度偏好、进度恢复、buffer/retry/offline、marker popup、下一节 hold/deny/倒计时、移动设置、桌面滚动浮窗、冻结上一帧过渡和 tutorial landscape 设置/教程抽屉；Safari、手机横屏原生 fullscreen、跨域截图失败和逐像素对照仍待实测。 | `academy/player/`；[播放器审计](./academy-player-advanced-audit.md) |
| 大师课分享/点赞/展开描述                                                                                                           | 已实现剪贴板、匿名点赞 gate、会话内演示点赞/描述展开；点赞未接真实服务                                                                                                                                                                                              | `1jfbimeox3e_8.js`、`0-lgkz14q-k7v.js`；VideoPage.jsx                                                                                              |
| 大师课评论                                                                                                                         | 已补本地持久化发布、回复/回复他人、展开/收起/分页、点赞、删除确认、举报、权限分支、加载/失败重试和手机抽屉。纠正此前审计：实际大师课限制 **200 字**、固定 latest，隐藏排序、置顶和点踩按钮；共享组件 500 字默认值不能作为该页面限制。真实写服务与公开评论正文未接入 | `1jfbimeox3e_8.js` g()/A()/U()/H()/T()、大师课 commentSource 与最终 JSX；VideoPage.jsx / `features/academy/comments/`                              |
| `/activity` 列表、状态/奖励徽标、详情 gate                                                                                         | 已实现公开样本；列表按原 page/total 规范保留 20 条分页、200px rootMargin 续载、加载骨架、空态、失败重试、Abort/换源隔离与 activityId 去重。当前默认仍由代表性快照 adapter 提供内容，不声称已接运营列表服务                                                                                                                                                                                           | `0tgdbp1fkq3sg.js` 模块918044/416501；`features/activities/ActivitiesPage.jsx`、`activity-list-model.js`、`useActivityList.js`                                                                                         |
| `/activity/:id` 规则展开/收起、状态/日期、去创作、获奖作品、未知 ID                                                                | 已实现本地样本交互；去创作当前打开通用 canvas，活动关联的实际投稿/绑定流程未验证，不应宣称提交作品完成                                                                                                                                                              | `pages/activity__62.html`、`3ips7m1r67ri1.js`、`2sds2o-u30qdx.js`；ActivityPage.jsx                                                                |
| 活动报名弹窗                                                                                                                       | 已实现手机/微信切换、必填联系/社媒/真实性验证、可选作品、提交失败保留表单、成功本地持久化。原站也只校验联系/社媒非空，未发现手机号或 URL 正则，不人为加严                                                                                                           | `3ips7m1r67ri1.js` ea()；RegistrationModal.jsx / ActivityPage.jsx                                                                                  |
| 活动报名服务/数据形状                                                                                                              | 默认仍是本地演示；已按 source 生成 tagId/name/contactInfo 的 phone:/wechat: 前缀、personalHomepageUrl、逗号归一化 workUrl 与 description，并补提交 loading、失败保留和可注入 source。真实报名、幂等、审核和登录态未接入 | `3ips7m1r67ri1.js` Registration source；RegistrationModal.jsx；[报名验收](./activity-registration-functional-audit.md) |
| `/feature-updates` 版本、媒体、优化项、CTA                                                                                         | 本轮已修 CTA：所有匿名目标按原站 openLogin 参数门控；本地演示会话新窗口打开，保留 query/hash；无 linkUrl 不显示按钮；空版本显示空态                                                                                                                                 | `18yvc0lpg8tqa.js` y()/j()/A；`1w-v_mfgx1i-m.js` resolveFeatureUpdateNavigation；FeatureUpdatesPage.jsx                                            |
| `/project` 搜索、排序、文件夹、回收站与项目菜单                                                                                   | 已实现本地项目/互动影游创建、搜索、回收站、重命名、复制、删除/恢复；本批补齐按最近更新/名称排序和项目移动到根目录或其他文件夹。真实项目服务、团队文件夹和跨设备同步仍未接入                                                                                   | `2ecd1eo6wusez.js` 的 `listFolderEntries`、`moveProjectEntryToFolder`、copy/rename/delete menu；ProjectPage.jsx                                                                                |
| 更新页分页                                                                                                                         | 已按原站 pageSize 20、600px IntersectionObserver sentinel、初始/续载状态、失败重试、Abort/换源隔离和版本 ID 去重实现；默认 2 个版本由本地 snapshot adapter 提供，未来可注入运营 source。真实运营接口与移动 Safari 仍未接入                                                                                                                                                             | `18yvc0lpg8tqa.js` usePageLoader / sentinelRef；`feature-updates-model.js`、`useFeatureUpdatesList.js`、FeatureUpdatesPage.jsx；[分页审计](./feature-updates-functional-audit.md) |
| `/plugin` 6 Agent、Plugin/MCP/CLI、安装说明复制、CLI 下载、指南                                                                    | 已实现；复制成功提示 2 秒、失败提示；接入服务动作在外部 Agent 侧，不在网页假造授权完成                                                                                                                                                                              | `0n8oo5osr4oue.js`、`02on94kzsh_2f.js`、`pages/plugin.html`；PluginPage.jsx                                                                        |
| Plugin 3 类 showcase、重放、音视频、提案分页/切换、滚动联动                                                                        | 已实现可操作的本地展示；源码还原了主要时序，完整滚动/Sticky/动画时间和手机视觉尚未逐状态原站对照。本轮未使用浏览器，不能列为精确验收                                                                                                                                | 同上，原 CSS `3_hal-_czy618.css`；PluginPage.jsx / usePluginScroll.js / usePluginPlayback.js                                                       |
| `/blender` OS 检测、下载、未知平台选择、安装指南、教程                                                                             | 已实现原公共链接和客户端平台分支；未下载或执行安装包                                                                                                                                                                                                                | `0wua3vabah716.js`、`0tmwl7c9km9aq.css`；BlenderPage.jsx                                                                                           |
| Blender WebGL/深度动画                                                                                                             | 历史 DOM fallback 缺口已在后续批次实现，桌面/窄屏真实 GPU 通过；精确对照与兼容分支仍需验收                                                                                                                                                                          | `0wua3vabah716.js`；`research/blender-functional-audit.md`                                                                                         |
| `/mcp/authorize` 无效请求、登录提示、scope 同意界面、提交/失败重试                                                                 | UI 已实现；transaction/callback/scope/client 参数处理已保留；允许/拒绝目前均清楚提示未连接授权服务，没有真实 callback/token 写入                                                                                                                                    | `09yv4drolhupn.js`、`pages/mcp__authorize.html`；McpAuthorizePage.jsx                                                                              |

2026-10-16 MCP 授权错误边界维护：授权提交失败后新增明确“重试”按钮，重新进入提交中状态；OAuth callback、token、账号和 MCP 服务写入仍未接入。定向 2 文件 / 4 项通过；最新 Node24.19.0 全量检查 478 文件 / 6615 项通过，证据见 `artifacts/mcp-retry-verification.json`。
| `/seedance-verify?taskId=…` 输入/空态、任务格式/日期、查询 loading/error                                                           | UI 已实现；真实任务查询/成功结果未连接，演示明确失败，不使用真实任务/账号                                                                                                                                                                                           | `1gwu2e0eu_767.js`、`pages/seedance-verify.html`；SeedanceVerifyPage.jsx                                                                           |

2026-10-16 Seedance 查询错误边界维护：失败状态新增明确“重试”按钮，重新进入查询 loading，仍保留官方查询服务未接入提示，不创建任务或账号写入。定向 2 文件 / 3 项通过；最新 Node24.19.0 全量检查 478 文件 / 6614 项通过，证据见 `artifacts/seedance-retry-verification.json`。
| `/calculation` / 默认 404 / `/forbidden` / `/en`                                                                                   | 原站 calculation 为已确认 404；404 由 root shell 提供，forbidden 缺参数回首页，en 规范化由 root router 提供。本轮未修改                                                                                                                                             | `research/routes-source.md`；`src/app/router/routes.ts`                                                                                            |

## 挑战赛列表分页维护（2026-10-15）

原站活动列表组件（`research/source/2sds2o-u30qdx.js` 模块 918044）以 `pageSize=20` 请求 `getCampaignList({page, pageSize})`，按 `total` 判定 `hasMore`，底部 sentinel 使用 `IntersectionObserver` 和 `rootMargin: 200px` 触发下一页；请求进行中或已失败时不会重复观察，失败显示重试，列表为空时显示空态。活动卡片状态图标来自同一 chunk 的 `ActivityEnum`：仅进行中显示勾选、已颁奖显示礼物，预报名与评审中不凭空补图标。

本地 `features/activities/useActivityList.js` 保留该读取协议，支持注入未来运营 source；默认使用 `activity-list-model.js` 将代表性 `secondary.json` 快照切成相同 page/total 形状。列表在 20 项后才进入 sentinel 续载，追加按 `activityId` 去重；切换 source 或卸载会 Abort 在途读取，旧响应不能覆盖新列表。初载骨架、空态、续载提示和可重试错误均为独立状态，当前 snapshot adapter 不模拟服务错误或账号写入。

`activity-list-model.test.js` 覆盖 page/total 计算、重复项去重和快照 adapter；`useActivityList.test.jsx` 覆盖续载、失败后同页重试、并发合并、换源/卸载取消和非法 payload；`ActivitiesPage.test.jsx` 覆盖 sentinel 触发、终态、注入 source 的加载/错误/空态以及可选卡片摘要。该批仅改善公开列表前端行为，未接活动报名、投稿、奖励或运营接口。

## Skill create / share

原始创建页面：`research/source/pages/skill__create.html`，主 chunk `0u4skljmyhqlo.js`，字段/文件树/结果类型/封面 `3dre517zt-vqp.js`，常量/树/Markdown/上传 `1p1-jebg1osnx.js`。公开分享页面：`pages/skill__share.html`，主 chunk `422y1ol8733va.js`，共享 header/body/model `2bym-dyxfkv4h.js`、`0ulj8smg6x0rg.js`。

| 功能                                                                                     | 状态 / 差距                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| create 匿名门槛、编辑 query `skillUuid`、保存后 `/skill?tab=mine`                        | 已实现；仅本地草稿编辑，未知私有 UUID 显示错误，不调用真实账号内容                                                                                                                                    |
| name/description/useScenario/inputType/outputContent 与限制、必填、错误文案              | 已实现现有字段；源码 UI 最终 JSX 不展示 caseItems / skillKeyName，两者是内部 form 数据，不能因为 API 有字段就擅自加到 create 页面                                                                     |
| Markdown 富文本/代码模式、展开编辑、文件/文件夹上传、同名覆盖确认、新建/重命名/删除/拖动 | 已实现基础交互；本轮修正合并后的 50 文件/1MB UTF-8 总量、新建 50 上限、导入隐式目录的新建位置、同名重命名误报、空白同名文件不误弹覆盖、内容变更清除 Markdown 错误                                     |
| 完整文件树/编辑器行为                                                                    | 目录折叠、向根目录拖放、TipTap/CodeMirror 编辑和条件 diff 已接入；官方 Markdown serializer 可能规范化空白，优化服务、复杂语法、移动触摸与逐像素对照仍待补。原站 diffEnabled/onlineContents 是共享能力，当前手动页不额外开启 |
| 内容优化、敏感字段过滤                                                                   | 优化按钮仅明确提示需要服务端；原站敏感字段横条、过滤结果、优化后对比/应用/覆盖弹窗没有完整模拟。不能把提示视为功能完成；本轮不接生成/审核服务                                                         |
| resultType、封面上传/替换                                                                | 已实现类型选择和图片/视频封面、10MB 检查、本地读取失败；结果类型 Select 已补 Enter/Space、上下/Home/End、Escape 与外部点击关闭，封面可注入上传源并覆盖 loading/失败保留。真实上传仍未接入 |
| create 保存                                                                              | 本地持久化成功后才导航，存储失败保留内容/提示；没有真实 skillCreate/update 版本并发/审核流程，明确演示                                                                                                |
| share query `uuid`、loading / 统一加载失败与重试 / 无效链接                              | 已实现；只读公开内容，未请求私有账号资源                                                                                                                                                              |
| share 「使用 Skill」                                                                     | 按专用 share 源码直接回 `/skill?useSkillKey&useSkillNs&useSkillName`，不在该按钮额外加匿名 gate；本轮补审核中/拒绝状态阻断。目的地参数消费由 Skill 主页面 agent 同步负责                              |
| share 收藏 / 分享                                                                        | 本轮统一使用公开 templateUuid，并兼容内部 skillUuid 的旧收藏；取消同时移除两种键。新分享按钮按原站限制 templateUuid + 审核通过，剪贴板失败提示；没有把本地私有草稿假称公开发布                        |
| share 文件阅读                                                                           | 本轮恢复层级文件菜单、目录折叠、外部点击/Escape 关闭、焦点恢复、方向键/Home/End、切换文件回 preview；显示正文和 code。原 Portal 菜单避免容器裁剪尚需浏览器对照                                        |
| share 案例                                                                               | 图片/视频/音频/文档分派、案例前后、图片放大、播放/进度/静音/全屏已存在；本轮补 legacy productionCaseUrls 与 powers 归一化，创作详情新窗口/来源 sourceSkillTemplateUuid（不修改含 spaceId 的项目分享） |
| share document 类型                                                                      | 原站自身也是 fetch().text() → Markdown，分类含 pdf/doc/ppt；未获得二进制案例的真实浏览器表现。当前保留原行为，不能未经证据宣称通用文档查看器完成，也不凭猜测改流程                                    |
| share 媒体精确交互                                                                       | 已补 360ms 案例切换过渡、文档案例失败/重试和音频/视频共享控制；真实媒体加载骨架、跨浏览器全屏/音频输出和逐像素布局仍待实测 |

2026-10-16 Skill 分享媒体错误边界维护：`SkillShareMedia` 的案例切换有 360ms 过渡和上下界限，文档案例失败显示重试并重新读取同一 URL，图片/视频/音频失败显示统一重试层。定向 1 文件 / 3 项新增通过，最新全量检查 473 文件 / 6595 项通过；真实跨浏览器媒体输出和逐像素布局仍未验收。

## 本轮验证和边界

- `src/features/shared/secondary/secondary-functional.test.jsx`：8 项测试覆盖无大师课空态、更新 CTA 的完整参数/登录门槛/新窗口、旧收藏迁移、分享使用/审核、文件菜单焦点/关闭/层级、上传合并数量/多字节总大小、隐式文件夹、案例来源条件。
- `secondary-flows.test.jsx`：原 6 项核心次级流程保持通过。
- 定向 Vitest 合计 **14 项**，所属域 ESLint **0 error / 0 warning**，只格式化本轮自有文件。Root 执行全量 `npm run check` 与统一浏览器验收；本报告不把尚未发生的全量结果写为通过。
- 没有原站新网络采集、账号操作、支付、生成、报名或授权写入。唯一并行研究产物是 root/source agent 请求的 `artifacts/studio-import-fixture.glb`（13,616 bytes），实际安装的 Three GLTFLoader.parse 回读通过，用于本地 3D 导入 QA。
- 课程白名单详情、播放器高级交互、真实评论写入/审核等服务状态仍是明确待办；历史 Blender WebGL 缺口已在后续批次更新至独立审计，不能将次级页家族或总体「完美复刻」标记完成。

## 大师课评论补齐与源码纠正（2026-10-11）

本批次依据已有 `research/source/1jfbimeox3e_8.js`，没有浏览器原站核对、新网络采集或真实账号操作。该文件同时包含共享评论组件和大师课页面，二者的默认参数不同。此前把共享组件默认行为记成大师课缺口不准确，现已纠正：

- 共享输入 g() 默认 `maxLength=500`；大师课桌面 H() 和移动 $() 的最终 JSX 均传入 `maxCommentLength=200`、`defaultSort=latest`。
- 大师课 commentSource 明确设为 `capabilities={sort:false,like:true,dislike:true,remove:true,top:false}`。H() 的 `showSortSwitch` 和 `showDislike` 默认 false，大师课没有传这两个 props，所以实际页面不展示「最热/最新」「置顶」或点踩按钮。仅有 source.dislike 方法不代表界面展示该操作。
- 共享组件仍保留可配置 500 字、排序、点赞/踩、作者置顶及取消置顶，使用明确的合成测试夹具验证能力/权限分支，不在大师课页面擅自启用隐藏功能。

本地实现按源码保留每页 8 条主评论、20 条回复的加载规则。新回复折叠后仍可见，回复他人显示目标；根评论删除同时移除子回复，删除某条回复保留其下的其他回复。点赞/踩互斥，自有评论显示删除、其他评论显示举报；置顶仅可由具备权限的作者操作且只允许一条根评论。大师课没有 authorUuid 的公开样本不会猜测作者身份。

发布、回复、反应、删除、举报和共享组件置顶操作通过本地 repository 写入浏览器存储，写入成功后才更新界面。写入失败保留输入/表单，独立重试不会假装成功；初次加载、列表继续加载和回复加载各有 loading/error/retry，列表重试保留失败页位置，迟到请求不能污染新页面。举报提供源码中的五种原因，「其他」说明最多 100 字、说明与手机号均可留空，填写手机号时按原正则验证。删除需要确认，举报成功文案只说明本地保存，不声称审核已提交。

手机沿用源码的评论摘要入口与 72dvh 抽屉，编辑器在底部。菜单、删除与举报叠层使用共享 dialog-stack，Escape 只关闭顶层，关闭后恢复焦点/滚动锁；输入保留 Shift+Enter 换行与 IME 组合输入保护。评论关闭状态通过共享组件错误分支呈现，不能因为演示源默认为开放便省去该分支。

生产运行不注入合成评论。已保存大师课 metadata 含 `commentCount=68`，但没有公开评论正文样本；页头保留该 metadata 计数，正文明确仅显示本地评论，不用测试内容冒充原站评论。`comments.fixture.js` 只由测试导入。实际 server comment API、审核、原站评论样本与逐状态视觉比对仍未验证。

验证结果：新增 **4 个测试文件 / 21 项测试**，覆盖真实大师课配置、匿名入口、刷新恢复、主评论与回复分页/失败重试、迟到请求和切换页面隔离、IME、写入失败保持输入、回复他人、点赞/踩互斥、删除权限/确认/失败重试、举报必填与可选字段/重复举报、作者置顶分支、评论关闭、移动端菜单与抽屉的 Escape 顺序。另运行原次级域 **14 项**，合计 **35 项通过**；本批次自有 JSX/JS ESLint 为 **0 error / 0 warning**，自有文件已格式化。Root 负责最终浏览器与全量检查，这里的结果仅为本批次定向验证。

## root 浏览器与共享焦点复验

root 使用本地大师课组件夹具发布“本地工程验收：评论保存与回复”，回复后刷新，主评论仍在且显示 1 条回复；展开可见 @验收夹具 的目标及“回复关系验收通过”。200 字计数、无排序/点踩/置顶按钮与源码页面配置一致。本轮未浏览器执行全部举报、删除、分页错误或移动抽屉状态，这些分支的通过证据仍是组件回归。

本次还修复公共 dialog-stack 的焦点生命周期：原生 autoFocus 可能先于 passive 注册抢占当前焦点，嵌套新弹窗也可能被旧层焦点守卫挡住。hook 在启用时保留打开前焦点，注册接收显式 previousFocus，并记录新 aria-modal 内的初始焦点；StrictMode 重放和重复启用均有真实 userEvent 回归。root 浏览器确认资产预览内重命名自动聚焦，Escape 只关闭编辑层并回“重命名”按钮；Skill 嵌套详情关闭回完整窗口标题，滚动锁保持。修复仍使用同一共享栈，没有额外 body/inert 所有者。

2026-10-11 手动Skill创建的目录折叠、嵌套/移动、重命名和导入取消/错误恢复已补齐，详见 [创建树审计](../src/features/skills/create/SOURCE_AUDIT.md)。完整Monaco/TipTap创建编辑器、diff及优化服务仍缺，不能将基础Markdown切换等同源编辑器完备。
