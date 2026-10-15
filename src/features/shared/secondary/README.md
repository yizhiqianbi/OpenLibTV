# 次级页面业务域

本次只迁移工程结构与数据访问边界，保留迁移前的页面、交互、文案、CSS 选择器及覆盖顺序。`src/pages/SecondaryPages.jsx` 是兼容分发器；应用路由可以直接 lazy import 下表入口。各入口均提供 default export，接收原有的 `path`、`navigate`、`login`、`toast`、`user`、`asset` 属性。

| 路由                          | `src/features/` 下的入口            | 职责                                     |
| ----------------------------- | ----------------------------------- | ---------------------------------------- |
| `/academy`                    | `academy/AcademyPage.jsx`           | 公开课、图文教程、亮点功能列表与标签切换 |
| `/academy/article/:id`        | `academy/ArticlePage.jsx`           | 正文、章节导航、上一篇/下一篇及画布入口  |
| `/academy/tutorial/:id`       | `academy/VideoPage.jsx`             | 教程播放器及推荐列表                     |
| `/academy/masterclass/:id`    | `academy/VideoPage.jsx`             | 公开课播放器、介绍、评论及推荐列表       |
| `/academy/course/:courseId`   | `academy/CoursePage.jsx`            | 课程播放、目录、学习状态与专属会员       |
| `/academy/practice/:courseId` | `academy/PracticePage.jsx`          | 实操配置、门控与 Canvas adapter 入口     |
| `/academy/product/:skuCode`   | `academy/ProductPage.jsx`           | 商品详情/介绍独立状态，隐藏侧栏          |
| `/activity`                   | `activities/ActivitiesPage.jsx`     | 挑战赛列表                               |
| `/activity/:id`               | `activities/ActivityPage.jsx`       | 活动正文、展开/收起、获奖作品及本地报名  |
| `/plugin`                     | `plugin/PluginPage.jsx`             | Agent/接入方式、复制、滚动演示和媒体案例 |
| `/blender`                    | `blender/BlenderPage.jsx`           | 独立落地页、平台下载及导演台入口         |
| `/feature-updates`            | `system/FeatureUpdatesPage.jsx`     | 版本与功能更新记录                       |
| `/mcp/authorize`              | `system/McpAuthorizePage.jsx`       | 无效请求、登录门槛与授权决定演示         |
| `/seedance-verify`            | `system/SeedanceVerifyPage.jsx`     | Task ID 校验与核验状态演示               |
| `/calculation`                | `system/NotFoundPage.jsx`           | 原有 404 界面                            |
| `/skill/create`               | `skills/create/SkillCreatePage.jsx` | 表单、文件树、Markdown 编辑及本地草稿    |
| `/skill/share`                | `skills/share/SkillSharePage.jsx`   | 分享详情、案例媒体、文件切换及收藏       |

详情入口从 `path` 解析参数，也接受显式 `id` / `kind`。Skill 页面仍从 URL query 读取 `skillUuid` / `uuid`。业务逻辑留在各域，学院标题栏、活动报名弹窗、插件动画 hooks、Skill 编辑与媒体组件分别位于对应的 `components/` 或 `hooks/`。

共享部分位于本目录：

- `SecondaryContent.jsx` 统一读取 `useContent('secondary', null)`，提供加载、错误、重试和素材映射；分享详情另读 `useContent('skill-details', null)`。
- `Markdown.jsx` 保留原正文渲染行为；`CoursePlayer.jsx` 仅为 `academy/player/CoursePlayer.jsx` 的兼容出口；播放器状态、偏好、媒体生命周期及后续动作归属 academy 域。
- `SecondaryLayout.jsx` 保存返回栏、列表结尾和数据状态组件；`text.js`、`media.js`、`libtvAssets.js` 保存跨域小工具及原素材名称。
- JSON 内容统一通过内容服务读取；报名、草稿和收藏调用 `services/storage.ts`，保留既有存储 key 和 JSON 格式。写入失败保留当前页面并显示错误提示。案例中的 Markdown/TXT 文档仍按媒体文本读取，不属于 JSON 内容快照。

## 样式顺序

`styles.css` 是唯一顺序清单。原 `secondary.css` 被拆成各业务域 `styles/` 内的连续片段；共享布局、Markdown 和播放器片段留在本目录 `styles/`。文件数字表示迁移前的全局顺序，`base`、`responsive`、`overrides` 用来辨认用途。混合业务选择器保持在共享片段中，避免拆开同一条规则。

这些片段不能按目录重新排序。迁移时将原样式和清单展开后的样式解析为 CSS AST，比对 794 个有序样式节点（含关键帧）、媒体/容器条件和每条声明，结果一致。`src/pages/secondary.css` 仅导入本清单以兼容旧入口。应用可在原样式位置提前导入清单，避免 lazy route 的加载时序改变级联。

## 验证范围

迁移时 34 个未修改声明通过编译后 AST 比对；差异仅限内容/存储边界和兼容分发器。完整兼容入口的 JSX/CSS bundle 已通过编译。本目录 `secondary-flows.test.jsx` 覆盖内容加载/重试、学院标签及登录门槛/跳转、活动报名持久化、Skill 草稿保存、存储失败后的表单保留，以及分享收藏对旧 null 值的兼容。

授权、核验、内容优化、真实支付和生成服务仍保留迁移前的证据范围及演示行为；这次结构迁移没有扩充这些功能，也未使用真实账号或采集新内容。
