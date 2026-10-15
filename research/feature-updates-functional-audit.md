# 版本更新页分页审计（2026-10-15）

原站 `research/source/18yvc0lpg8tqa.js` 的版本更新页面通过 `usePageLoader` 请求
`page=1,size=20`，使用 `hasMore` 和 `IntersectionObserver`（`rootMargin: 0 0 600px 0`）
续载；首屏有 skeleton，续载显示底部 loading，失败可以重试，结束后显示没有更多内容。版本
内容的媒体、优化列表及 CTA 与分页无关，CTA 仍按匿名登录门控处理。

本地 `src/features/system/feature-updates-model.js` 把快照和将来的运营 source 统一为
`{ list, total, hasMore }` 页面协议，按版本 `id` 去重；`useFeatureUpdatesList` 负责初始页、
AbortController、切换 source 隔离、同页重试和迟到响应保护。`FeatureUpdatesPage` 通过
sentinel 使用相同的 600px root margin，保留原版本媒体、优化项和 query/hash CTA；没有
登录、生成或写入运营服务。默认 snapshot adapter 让已有 2 个版本直接显示并在末页结束，
注入真实 source 后可以继续加载后续页。

验证：`feature-updates-model.test.js` 覆盖 page/total、显式 `hasMore`、去重和 snapshot
分页；`useFeatureUpdatesList.test.jsx` 覆盖首屏/续载、错误后保留已加载行和切换 source
取消迟到响应；现有 `secondary-functional.test.jsx` CTA/空态回归继续通过。真实运营接口、
逐像素视觉及移动 Safari 尚未验证。
