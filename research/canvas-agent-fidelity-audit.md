# Canvas Agent 选择器与消息复刻（2026-10-11）

本批继续功能复刻，内容使用既有代表性样本；登录注册、原站账号资源和真实生成服务继续延期。公开客户端作为协议依据，正向浏览器操作使用忽略目录 `artifacts/functional-qa.html` 中的实际 NodeCanvas 和本地用户夹具。

## Skill 原地入口

`research/source/30n77u5aq5ebb.js` 模块 265570 的 `ChatSkillSelectHoverCard` 为当前聊天输入提供 click popover，450×400、顶部偏移8、300ms搜索、通用/收藏/我的、全部列表、独立详情和创建菜单；模块 995755 的 composer 公共方法 `openSkillSelector` 在当前输入打开此入口。选中以真实 namespace/key 插入 inline Skill，不导航 Skill 页面。

`CanvasSkillSelector` 使用共享 SkillPicker/SkillLibraryModal/SkillDetailModal；`useCanvasSkills` 管理当前输入的插入、弹层、数据加载及错误、收藏持久化。`services/local-skills.js` 是两域读取旧 `libtv-created-skills` 数组的边界；没有反向导入 Skills 私有模型。软删除、Pending/Rejected 不进入可用候选；损坏本地数据在“我的”显示错误且不覆盖存储。

原站 directCreate=false 的“通过 Agent 创建”调用当前 intake（entrySource=other），手动导入打开 `/skill/create` 新标签。当前实现同样在当前文档收集画布/对话/Skill 上下文，复用既有 intake；服务未接入时保存 blocked 请求。没有因工具栏入口创建另一个空项目或伪造新 Skill。

## 消息与持久化

消息正文按原有完整 parts 的占位位置渲染，具体 readonly renderer、hover 和旧数据兼容范围见 `src/features/canvas/messages/SOURCE_AUDIT.md`。发送保存完整 draft.parts，不能先用 agentPlainText 和 refs-only 分组丢掉位置。messages 与节点、视口、agentDraft 同次保存，载入当前文档恢复；旧无 messages 文档按空对话读取。复制、快照分享、JSON 导出携带本地对话。公开 chat-share 的顶层 messages 会进入文档状态及回放；本地副本则读取 snapshot.messages，不因 local precedence 丢掉回放。跳项目时先刷写旧 key 的 pending，再载入新的消息。损坏 JSON、读取失败或无效文档 shape 保留原值并阻断编辑/自动保存；写入错误不能被当成读入错误。

本地生成服务提示仍是服务能力说明，不假冒生成结果或远端对话成功。消息和草稿同时保存会增加本地媒体的容量占用；写入失败继续通过现有可见错误保留当前状态。

## 动态节点提及

画布将当前 nodes/projectId/view/board 交给独立 mention controller，避免共享编辑器引用 Canvas 私有状态。源规则、节点身份和分组详见 [节点提及审计](./canvas-agent-mentions-audit.md)。普通本地媒体仅在读取成功并提交节点后标记 `data.localMediaReady=true`；此标记用于演示 source 的 data URL 适配，不表示原站上传或生产服务成功。没有此标记的 data URL、临时 blob 和明确 pending 节点仍遵循源候选排除规则。

## 浏览器已验

桌面 1280×720，当前画布输入“镜头开场 结尾”，实际正文光标在“镜头”后；通过工具栏插入爆款拉片复刻，同一 Skill 在中间和末尾分别保留。完整列表下打开东方巨构美学短剧，第一次 Escape 仅关闭详情并回标题，第二次关闭列表并回 Skill 按钮；body overflow 恢复空值。全程当前画布 URL 不变，已有正文和引用没有丢失。

桌面新增实际文本节点，输入 @ 显示当前节点与模型分组，选中后发送。用户消息以节点、镜头、第一 Skill、开场结尾、第二 Skill 的原顺序展示；刷新恢复相同消息、正文、两个 Skill 和节点引用。390×844 下 Skill 弹层 x=12、宽366，列表内部 scrollTop=681、clientHeight=323、scrollHeight=1004；Escape 回 Skill 触发器。@ 菜单宽188、高288，位于 x=27，内部可滚动；页面 scrollWidth=390。再次插入相同节点保留两个 occurrence。截图归档为 artifacts/canvas-agent-fidelity-proof.jpg。另实际打开既有公开聊天样本“白发女生替换与黄昏背景”，查看结果后从只读节点面板复制为本地项目；刷新后 DOM 仍为8条消息、3个节点，副本名称保持。证据为 artifacts/chat-copy-fidelity-proof.jpg，不代表本地服务生成了历史样本中的结果。课程横屏的正向接线由可注入 adapter 的组件回归验证，本批未做手机 UA/Safari 真实浏览器验收。原站登录态逐像素、模型/素材工具栏全部形态、节点定位/拖拽、真实 Agent 与服务器写服务仍需要继续核对，不将此批称为整个目标完成。

历史统一检查（2026-10-11 Canvas Agent 与课程接线）：`npm run check` 全部通过，**93 个测试文件、483 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/canvas-agent-final-check.log`，证据 `artifacts/canvas-agent-fidelity-proof.jpg` / `chat-copy-fidelity-proof.jpg`。strict 不覆盖全部 JSX，课程正向 adapter 回归不等同于实际授权/手机浏览器验收，整个复刻目标继续未完成。

## 后续共享层更新

当前画布的模型插入、独立生成模式、本地 agentConfig 保存/发送 metadata、素材菜单与共享选择器、live 节点展示/删除态/300ms 定位已由后续批次接线。上述“仍需继续核对”是当时边界，不再代表这些当前画布分支尚未实现。更新依据及仍缺的完整资产/跨项目/真实服务分支见 [工具栏审计](./canvas-agent-toolbar-audit.md)、[素材审计](./canvas-asset-toolbar-audit.md)、[节点审计](../src/components/agent/NODE_SOURCE_AUDIT.md) 和 [最新覆盖清单](./coverage.md)。统一检查107文件549项通过，日志 artifacts/toolbar-course-final-check.log；整个目标仍未完成。
