# L2 字幕转为可编辑审计（2026-10-18）

本批把归档源协议中的 `offerConvertToEditable`、`convertRequiresConfirm` 和 `convertLosesAnimation` 接入现有 HTML 字幕编辑器。L2 代表八项样式属性均无法安全注入；它继续以只读方式预览，用户明确确认后才允许转换。

转换过程读取当前 HTML，移除 `<script>` 和 `@keyframes`/`animation*` 入口，再重新应用安全的变量 fallback。正文、cue 时间、布局、来源 key、片段绑定和其他未知 CSS 保留；复杂 CSS cascade、脚本 runtime 和逐帧动画不做等价推断。转换通过现有 `acceptEdit`、CAS、自动保存和 history 事务提交一次本地存档，取消或失败不覆盖原文。

实现位于 `subtitle-style-compatibility.js`、`html-subtitle-tools.js`、`HtmlSubtitleWorkspace.jsx`、`ClipTextWorkspace.jsx` 和 `tool-api.js`。纯转换模型、真实工具事务和确认弹窗均有测试；曾发现 lazy text action 未注册导致真实按钮无法提交，已补入 `TEXT_TOOL_ACTIONS` 并复验。

专项 **2 个测试文件 / 20 项**通过，日志 `artifacts/subtitle-l2-conversion-targeted.log`。独立 Chromium 使用合成 L2 HTML 与此前 GUI 创建的六秒视频，证据 `output/playwright/subtitle-l2-conversion/native-final.txt`：确认/取消均可操作，转换后正文输入恢复可编辑，存档不含 `@keyframes`/`animation`，一次撤销回到无本地 HTML 存档，重做恢复转换结果，同一 video DOM 保持，390×844 的 `scrollWidth` 等于窗口宽度，pageerror 为0。截图为 `output/playwright/subtitle-l2-conversion/converted-390.png`。

Node24.19.0 完整 `npm run check` 通过 **494 个测试文件 / 6717 项测试**，测试148.66秒，Vite3709 modules，生产构建10.51秒；格式、零警告 lint、核心 strict 和构建均通过。日志 `artifacts/subtitle-l2-full-check.log`，代码快照 `artifacts/subtitle-l2-code-snapshot.json`，统一证明 `artifacts/subtitle-l2-verification.json`。本机未部署；真实生成、导出和服务端写入仍未接入。协作、远程配置、多语言、触摸/Safari按用户确认不纳入本轮完成度扣分；按当前范围整体约75%（72%-80%）。
