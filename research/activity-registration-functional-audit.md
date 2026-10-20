# 活动报名异步提交验收（2026-10-16）

本批依据公开报名 renderer `research/source/3ips7m1r67ri1.js` 的 `ea()` 与 `submitRegistration` 形状，补齐活动报名的提交边界。当前版本仍不读取登录态、不向原站写入；默认 adapter 只返回本地成功，运营端可通过 `registrationSource.submit` 注入真实请求。

源实现要求昵称、联系方式、社媒主页和真实性确认；联系方式按 `phone:` / `wechat:` 前缀提交，作品链接按换行、英文逗号和中文逗号切分后以英文逗号归一化，描述由社媒、作品和真实性确认组成。失败时保留输入并在弹窗内显示提交错误，成功后才执行页面的本地演示保存。

本地实现位于 `src/features/activities/activity-registration-model.js`、`components/RegistrationModal.jsx` 和 `ActivityPage.jsx`：纯模型负责 payload，弹窗负责提交中、禁用取消/提交、错误恢复和焦点不丢失，页面通过可选 `registrationSource` 接入未来服务。没有新增登录、注册或账号资源。

定向验证：活动 payload/归一化、提交中与失败保留、注入 source 成功回调，以及共享活动流程共 **3 个测试文件 / 12 项通过**；目标域 ESLint 零警告，Prettier 通过。

全量 `npm run check`（Node24.19.0）实际通过 **467 个测试文件 / 6582 项测试**，格式、零警告 lint、核心 strict TypeScript、生产构建全部通过；测试 140.35 秒，Vite 构建 12.09 秒。JSDOM 的媒体 API 未实现提示和 Node 弃用提示仍属于既有测试环境输出，不是本批报名错误。真实报名接口、登录态、服务端幂等/重试和运营审核继续保持未接入边界。
