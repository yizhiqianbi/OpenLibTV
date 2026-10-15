# 学院播放器结构与高级形态审计（2026-10-11）

本批只维护 `src/features/academy/player/`，在 `VideoPage.jsx` 接入公开 tutorial/masterclass 的播放器容器；按 Root 指示仅调整 `comments/VideoComments.test.jsx` 的播放器 mock 引用。没有编辑 course/practice/product、评论实现、路由、共享服务或根文档，也没有使用账号、购买课程或写入原站。

## 源码证据

- `research/source/1qzom_a49htdf.js` 模块 973556：CoursePlayer、质量切换截图 Canvas、metadata 后恢复位置与此前播放状态、decoded-frame callback/RAF fallback、5 秒过渡上限、mobile/landscape/settings 状态以及 `landscapeChrome` 调用契约。
- `research/source/0-lgkz14q-k7v.js` 模块 237243/185684/945022：WatchScrollStage、IntersectionObserver 阈值 0、退出可见区域后的浮窗、关闭暂停与 dismiss、重新进入可见区域后重置；viewport 预留 112px/388px、内容宽度 412–1212px、元信息高度参与 16:9 尺寸计算。
- `research/source/0nauv2vewemo-.js` 模块 353652/678355/951091：真实 tutorial 页面连接 WatchScrollStage 和横屏教程目录；LandscapeTopBar 是返回、标题与更多设置。大师课对应源 `1jfbimeox3e_8.js` 同样连接 WatchScrollStage，但未提供 landscapeChrome，因此本批没有擅自为大师课增加教程目录。
- 懒加载引用明确指向 `static/chunks/1i2hyd-9t3sv3.js` → 模块 448848/449199。只最小 GET 此一个必要 chunk，成功保存 8,963 bytes。来源：`https://liblibai-web-static.liblib.cloud/liblibtv_online/static/_next/static/chunks/1i2hyd-9t3sv3.js`。没有继续抓取内容或软件。
- 此懒 chunk 确认 MobileMoreSheet 为 fixed 底部面板、黑色 60% 遮罩、16px 上圆角、min-height 320px/max-height 70vh；LandscapeSettings/Tutorial/EpisodeDrawer 为 absolute 右侧抽屉、黑色 40% 遮罩、320px 宽/max-width 46%、14px标题与滚动内容。
- `research/source/2o2ge9psgy6_c.js` 模块 254119：mobile UA 优先，平板次之，再用 768/1024 宽度判断；横屏手机 UA 不会变成桌面播放器。文案使用已有 `public/data/locale-zh.json`，例如“视频设置”“课程选集”“更多教程视频”。

## 实现与依赖方向

`VideoPage → WatchScrollStage/CoursePlayer/landscape views → player hooks/pure models → 统一 storage 与公共 dialog hook`。页面直接导入本域 CoursePlayer；旧 `shared/secondary/CoursePlayer.jsx` 保留兼容导出，不再被新页面反向引用。

- `CoursePlayer.jsx` 仅负责组合与旧 props/callback 契约，目前 323 行；时间轴、跟练标记弹层、音量和清晰度/倍速菜单移入无副作用的 `PlayerControls.jsx`（181 行）。原 markers/next/history/resume/prefs/登录门槛与错误重试分支保留。
- `watch-stage-model.js` 独立计算源尺寸；`useWatchScrollStage.js` 独立持有 ResizeObserver/IntersectionObserver、dismiss 与清理；`WatchScrollStage.jsx` 只渲染。浮窗是同一 DOM 层级切换定位，宽 360px、右/下 24px，不重挂 video。关闭调用注册的 pause，重新回到可见区域才解除 dismiss。新增键盘关闭后将焦点保留在播放器；观察器 cleanup 取消并忽略迟到回调。
- `frame-transition.js` 只处理 Canvas 截图与新帧轮询，`useVideoFrameTransition.js` 管理当前质量事务、海报、取消与 Canvas 内存。选择质量前保存 currentTime/paused，再捕获当前 decoded frame；metadata 恢复原位置后等待 readyState≥2 且位置差≤0.5秒，最长从选择时算 5秒。跨域或缺少2D context时继续原播放切换，不把截图失败当视频失败。新选择/路由变化/错误/卸载取消旧 callbacks/计时器，Canvas width/height 归零。requestVideoFrameCallback 优先，RAF fallback；媒体仍由 useAcademyMedia 持有和释放。
- `PlayerSettings.jsx` 的 settings rows 同时用于底部 sheet 与右侧 landscape drawer；选项原2/1.5/1/0.75和真实qualities，选择后保留设置面板与当前按钮焦点。复用 `useDialogBehavior` 的 stacked Escape/Tab、背景隔离、滚动锁和回焦点，没有新造 body lock。
- `LandscapeTopBar`、`LandscapeTutorialDrawer`、`LandscapeEpisodeDrawer` 各自独立。VideoPage 只接实际 tutorial 的 landscapeChrome/目录跳转；EpisodeDrawer 保留源 units/groups/leaves、available/status/practiceNodes 契约，不绕过 caller 的选择或授权。上批结束时 CoursePage 尚未接此目录组件；后续课程批次已完成实际接线、适配器进度和权限回归，见 [course 分域审计](../src/features/academy/course/SOURCE_AUDIT.md)。此处其余数字与 scope 保留上批历史。
- `usePlayerViewport` 负责 mobile/landscape 检测；`usePlayerFullscreen` 负责 native/Safari 事件与一次 metadata wait。路由/卸载取消待处理 Safari callback，晚完成的浏览器 fullscreen 请求不会再锁方向。
- 新样式仅位于 player 目录；移动样式同时依据源 UA 检测，避免横屏手机被全站桌面断点改回桌面观看外壳。reduced-motion 去除新增浮窗渐变。

## 定向验证和未验证边界

## 播放器控制补齐（2026-10-15）

原站播放器源码 `research/source/1qzom_a49htdf.js` 的桌面控制栏把音量按钮包在悬停区域内：悬停或聚焦后在按钮上方打开黑色半透明纵向滑块，显示 0–100 数值；移动紧凑控制栏不显示该区域。本地 `PlayerControls` 已按这个契约改为悬停/聚焦打开纵向音量浮层，采用 `writing-mode: vertical-lr` 的可键盘 range，离开控件或焦点离开后关闭；移动端继续隐藏音量入口。完播提示也按同一源码的 overlay `onClick` / 内容 `stopPropagation` 行为接通遮罩关闭，点击卡片内容不会误关。

`CoursePlayer.test.jsx` 增加音量浮层显示、百分比步进、调节值和完播遮罩内外点击回归；与播放器抽屉测试合计 **2 文件 / 12 项通过**。这验证了 DOM 状态和事件契约，不替代真实浏览器音量滑动手感或系统媒体输出验收。

定向 Vitest **8 文件 / 36 项通过**（player 6 文件 / 29 项，加 VideoComments 和 CourseRoutes 回归），owned ESLint **零警告**、Prettier 检查通过；没有跑全站 check。新增测试使用真实 DOM HTMLVideoElement/HTMLCanvasElement，加可控的原生方法/decoded-frame/2D context；它验证事件、drawImage 调用与生命周期，**不是实际 codec 解码或浏览器像素结果**。

新增测试覆盖：保持同一个 video 进入/关闭/再次浮出；ResizeObserver 随描述展开改变尺寸、窄屏取消观察器；暂停的质量切换位置与新帧条件、CORS截图失败、5秒 stalled fallback、连续选择取消过期 frame callback、路由换 video 与卸载释放 Canvas；RAF取消；UA/旋转；底部/横屏设置不抢焦点与 Escape 回焦点；教程目录选择；不可用章节保持禁用；未完成 fullscreen 请求不在卸载后锁方向、Safari metadata wait 不在替换后触发。已有 buffering/markers/preferences/next tests 继续运行。

待 Root 真实浏览器统一验收：桌面 tutorial 滚动浮窗的布局/暂停/回到 anchor；实际质量切换瞬间冻结画面和继续播放；390px设置 sheet 与键盘焦点；手机 UA 横屏 fullscreen 的 settings/教程目录。Safari、orientation permissions、真正的离线/坏媒体和跨域 Canvas 截图失败只有源码/单测覆盖，没有跨浏览器实测结论。无授权课程的正向目录及私人课程进度服务保持之前边界，本批不宣称已购课程或所有播放器像素一致。

Root 集成验收：公开教程实际播放、暂停于10.223587秒后480P→720P切换，暂停与位置保持、Canvas宽高清理为0；390×844设置底部面板，选择1.5x保留设置及该控件焦点，Escape返回“更多”、解除滚动锁且无横向溢出。长内容仅为本地验收夹具，使用相同公开实际视频与真实组件：1280×720浮窗宽360、right/bottom24，关闭暂停于5.408028秒；回anchor后再次滚出可浮动且位置保持。原教程短页本身未溢出，不把夹具长内容当原站正文。手机UA横屏、Safari和实际跨域截图失败仍未实测。统一检查结果见根coverage。
