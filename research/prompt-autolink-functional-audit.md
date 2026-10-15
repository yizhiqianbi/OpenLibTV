# 节点提示词 AutoLink 功能审计（2026-10-11）

本批补齐图片 / 视频内嵌生成器的自动灰色引用建议。当前版本仍为本地工作区，无需登录、不使用账号资源；内容使用现有代表性样本。自动建议与全画布 `@` 菜单是两个独立入口。

## 原站证据

已归档的公开脚本只作为只读调研资料，没有运行原站 bundle 或请求写服务。

| 证据                                                    | 核对内容                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/source/1nd0f9k3q9sol.js` 的 112007            | image/video 可用性、mention support、偏好及 readonly 门控；候选仅来自当前参考列表，排除 text / asset；输入、粘贴、IME、blur 和浮层挂起             |
| 同文件 884894                                           | 文件名 / 分隔符变体、全角规范化、泛名与停用词排除、名字唯一性、完整名字优先、ASCII 边界、最长非重叠匹配；中英文序号与中文数字                      |
| 同文件 768023                                           | 普通输入 200ms 检测；粘贴区间 0ms 批量检测；Tab 当前 / Shift-Tab 全部 / 点击接受；Escape 以节点 ID 和前六字上下文缓存拒绝，最多200项               |
| 同文件 974903 / 773557                                  | `libtv:promptMentionEnabled` 原始字符串1/0、默认启用；caret / batch 提示各显示一次，key 为 `libtv:promptMentionTabTipSeen:` 加模式                 |
| `research/source/1fuxk6hkx6iug.js` 的 838978            | 灰色 badge 为 `contenteditable=false` / `aria-hidden=true`，不进入序列化；名称建议保留文字追加 token，序号建议消耗匹配文字；前后空格及接受后的光标 |
| `research/source/27g5ro4e8nocv.js` / `24mj3em3412ij.js` | 图片 / 视频设置提供 PromptMentionToggle，使用原文“智能引用 AutoLink”                                                                               |
| `research/source/2ijgtfwpg93os.js`                      | 单项和批量提示、偏好标签及帮助文案                                                                                                                 |
| `research/source/1h-b10gcvw4vl.css`                     | ghost opacity 0.5；普通边框#363636，active边框#ffffff26                                                                                            |

原版768023提取普通文字 run，BR和现有引用中断 run；本地匹配同样不跨换行或已存在 token。泛指“素材1”只在当前序号唯一时提示；“地图1”“效果图1”等不误判为图片序号。Mixed 引用按 displayIndex 匹配实际媒体类型。

## 工程边界与实际接线

- `prompt-suggestion-model.js` 负责纯候选 / 唯一性 / 匹配 / 序号 / 拒绝 key，不依赖 React、DOM、存储、账号、图或网络。
- `prompt-suggestion-dom.js` 管理 ghost 插入、消耗序号、接受 badge 和仅自身媒体释放。复用 `node-prompt-dom.js` 的 badge renderer；序列化、复制和光标计算跳过 ghost。
- `useNodePromptSuggestions.js` 负责检测定时器、当前 session、IME / readonly / disabled / 文档切换取消、batch 接受及拒绝缓存。引用 pool 按内容签名稳定，普通 controlled prompt 回写不能清掉尚未接受的 batch。
- `NodeGeneratorPrompt.jsx` 接入真实 input / paste / pointer / keyboard，默认 suggestionAvailable=false；实际 InlineGenerator 只对 image / video 启用，仍受 mention support 门控。没有自动连接尚未连入的节点。
- `useNodePromptController` 的 beforeMutation 清理编辑前 ghost；150ms 草稿提交、getValue / flush、历史和既有 autosave projection 仍使用原 token 协议。批量接受只产生一次正文提交和撤销项，ghost 本身不保存。
- IME 过程中切 disabled / readonly 时，controller 先取消组合状态与待提交；compositionEnd 始终清除组合标记，再判断可编辑性。同 session 恢复后普通输入和补全可继续，禁用期间不提交正文。
- `PromptSuggestionTip` 使用当前 dialog portal，监听 resize / capture scroll 并清理；顶部不足时翻到下方，左右限制在视口内。没有新增滚动锁或焦点栈。
- `dialog-stack` 的 child dismissal 提供可选 Tab handler：输入框位于 dialog 首尾时，建议仍先接受 Tab / Shift-Tab；Escape 先拒绝建议，再交给父 dialog。
- 偏好边界为 strict TS `services/prompt-mention-preference.ts`，复用统一 storage repository 的同页 / 跨页订阅和失败反馈。存储值保持原1/0，不写入 Canvas params，不依赖本地 actor 或旧账号会话。保存失败保留上次有效开关，并显示可重试状态。

没有新增依赖、扩大跨域白名单或调用原站遥测。React 复核检查了稳定 effect 依赖、定时器 / listener 清理、DOM资源所有权、输入焦点和偏好广播；保留源视觉，不引入通用组件样式。

## 验证

新增三文件31项回归：纯匹配15项、真实 DOM prompt13项、strict TS偏好3项。定向检查同时覆盖原 prompt、真实 InlineGenerator 和共享 dialog-stack；最终统一统计见验证历史（单项合计以 Vitest 输出为准）。只读独立复核发现并修复 IME 与禁用状态交叉，以及相邻序号消费边界；后者使用右偏的 Range 起点，保留前一项 ghost。

实际 App 浏览器在 `/canvas?projectId=generator-oct11-proof` 验证：

1. 无登录进入已有本地画布，选中视频生成器。输入“使用参考图 1”，出现灰色建议；Tab 序号替换后实际 badge token 为 `{{Mixed 1}}`。
2. 实际剪贴板粘贴“图片1与第二张图片”，产生两项建议；连续 Tab 分别接受，第一项接受后第二项仍存在。展开层 Shift-Tab 一次接受两项，得到 `{{Mixed 1}} 与 {{Mixed 2}} `。
3. 设置中关闭 AutoLink，输入不显示自动建议；刷新后开关仍关闭、草稿“图片1”恢复。手动键入 `@` 仍打开全画布素材列表；验证后通过 UI 恢复默认启用。
4. 桌面展开与390×844窄屏：窄屏 dialog 宽351px、document scrollWidth390px，无横向溢出。第一次 Escape 拒绝建议并保留原文字和展开层，第二次关闭展开层。
5. 追加实际 App 验证紧邻文字“图片1图片2”：两项 ghost，Shift-Tab 得到 `{{Mixed 1}} {{Mixed 2}} `；同一展开编辑器一次撤销恢复原文字，两项实际 badge 均消失。
6. 实际 App 验收标签 error / warn 为空。临时标签已关闭，默认视口恢复；没有改变用户原4 / 7标签。

截图：`artifacts/prompt-autolink-desktop-proof.jpg`（1280×720，43062B）、`artifacts/prompt-autolink-mobile-proof.jpg`（390×844，21880B）及接受后 `artifacts/prompt-autolink-accepted-proof.jpg`（1280×720，37112B）。截图通过实际 CUA 浏览器捕获，并使用本地归档控件保存。

## 仍未完成

Seedance2.5 的989029内容标签依赖 `contentUnderstandTags` 服务；本批没有请求该服务或用名称推测标签。自动建议基于当前明确名字与序号，未知主体 / 资产能力不放行。

完整 badge swap、资产 picker trigger、原站可编辑登录态像素对照、手机真实软键盘 / Safari、特殊 panorama / slash / audio pause / filler 分支仍未全部验收。真实生成、费用、账号、协作与其他运营写服务继续未接入；本批不是全站 perfect 完成结论。
