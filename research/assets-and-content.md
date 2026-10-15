# 原站资源与内容快照

采集日期为 2026-10-10（北京时间）。来源是原站公开 HTML、Next Flight 数据、加载的公开脚本、公开只读 API，以及原站 sitemap。没有使用账号令牌或进行原站点赞、购买、发布、生成等写入。

## 应用数据入口

| 文件 | 内容及结构 |
| --- | --- |
| `public/data/home.json` | 首页原始快捷入口、功能卡和链接配置，图片/小型悬停视频已本地化。 |
| `public/data/gallery.json` | 首页最初 20 项，`items` 数组保持原站顺序。 |
| `public/data/gallery-all.json` | `items` 是 395 项默认流顺序；`allItems` 是默认、分类、活动奖项和 sitemap 的 1,136 项并集。 |
| `public/data/gallery-categories.json` | 10 个真实分类，分类对象包含 `items` 数组，含活动分类。 |
| `public/data/gallery-details.json` | 作品 ID 映射到 `{detail, recommendList}`，保留真实计数、标签、日期和推荐。 |
| `public/data/canvas-snapshots/` | 最初 20 个作品中具有快照的 19 个真实公开创作画布，以作品 ID 命名。 |
| `public/data/canvas-example.json` | 首个作品的画布示例：134 个节点、184 条连线。 |
| `public/data/sitemap-content.json` | sitemap 新增作品和返回数据不存在的四个旧路由。 |
| `public/data/skills.json` | 200 个默认社区 Skill 以及真实标签。 |
| `public/data/skills-recommended.json` | `list` 是推荐标签 4008 的 40 个作品；前 20 项与公开 Skill 首页一致。 |
| `public/data/skill-details.json` | 前 20 个推荐 Skill 的真实说明、场景、输入、输出、案例视频等详情。 |
| `public/data/activities.json` | `items` 为 12 场活动，含完整 Markdown 描述和 170 个真实获奖作品。 |
| `public/data/academy.json` | 9 个视频教程、11 篇文章、1 个大师课，匿名课程广场的课程列表为空。 |
| `public/data/academy-details.json` | 教程播放器信息、文章全文和大师课信息；所有 9 个教程的默认播放器视频已本地化。 |
| `public/data/features.json` / `versions.json` | 16 条功能上新和 2 次版本更新，包含原始文案和媒体。 |
| `public/data/profiles.json` | 前 8 名作者的公开资料、统计和作品；键为作者 UUID。 |
| `public/data/shell-config.json` | 原始促销文字/计时截止/动画/操作、极光列车弹窗（精确原始图片与关闭位置、30 秒自动收起）、3 张侧栏轮播、积分促销卡、登录视频、3D 轮播与提示词、联系方式二维码。 |
| `public/data/remote-configs.json` | 公开配置的解析结果，按原始配置 ID 索引。 |
| `public/data/member.json` | 匿名接口返回的 21 个 TRAIN 套餐、3 个积分包、7 个模型卡；保留原始字段，同时提供元/积分/时长等展示字段，以及 9 条实际会员 FAQ、团队 FAQ 与升级规则。 |
| `public/data/models.json` / `locale-zh.json` | 原始完整模型配置和中文界面文字。 |
| `public/data/asset-map.json` | 原始远程资源 URL → 本地资源路径。 |
| `public/data/ui-assets.json` | 原站脚本中的界面图片和已下载演示视频的映射。 |

## 资源

`research/assets.json` 是逐资源清单，含来源、下载地址、本地地址、状态及字节数。文件名采用 URL 的 SHA-1 前 16 位，资源下载后保持稳定。源码常量中的图片可通过 `asset-map.json` 或 `ui-assets.json` 定位。

原站完整图标库为 `public/assets/libtv.json`，882 个独立 SVG 另存于 `public/assets/icons/`。独立 SVG 默认白色，适用于深色背景；多主题界面应优先用图标 JSON 中的 `body` 内联渲染，使 `currentColor` 生效。

精确侧栏标志为 `public/assets/libtv-logo.svg`。原站 Blender 页面资源另保留原始路径 `public/assets/blender/hero-title.png`、`hero-preview-poster.webp`、`libtv-logo.svg`。

Inter、Pretendard、火山清和等原站字体保存于 `public/assets/`。登录轮播配置 283 使用本地视频 `public/assets/8e19a70a725ce27d.webm`。Blender 演示为 `public/assets/97549fdcbab9f7b9.webm`。

## 可核对的限制

- sitemap 的四个历史作品返回原站错误 10051、`数据不存在`，具体 ID 保存在 `sitemap-content.json` 的 `failures` 中，应展示原站缺失内容状态。
- 登录后的账号资产、用户专属优惠、购买和生成结果没有通过匿名 API 伪造；需要账号观察时继续补充。
- 完整影片和体积较大的视频保留原始公开远程播放地址；小型功能演示、登录视频、所有教程和插件产品演示已本地化。大师课默认 480p 为 38.45 MB，现已保存到本地；更高分辨率选项保留原始公开播放地址。
- 默认社区流是采集时点的前 10 页，公共内容会变化；快照不代表后端所有历史数据。

## 维护

原始响应位于 `research/api/` 和 `research/source/api/`。`extract-assets.py` 提取首页，`collect-content.py` 抓取公共列表与学院/活动正文，`collect-profile-details.py` 获取作者与详情，`collect-sitemap-details.py` 补充 sitemap 中的历史作品，`sync-content-assets.py` 和 `finalize-content-assets.py` 建立本地资源映射。

刷新时先采集数据，再完成资源下载和本地化；不要在资源清单写入过程中并行运行另一份会覆写清单的脚本。最终数量和覆盖状态以 `research/content-inventory.json` 为准。
