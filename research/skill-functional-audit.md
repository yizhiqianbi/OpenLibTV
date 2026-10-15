# Skill 功能审计

更新：2026-10-11。范围为公开 Skill 首页、卡片、详情、模型菜单、附件、选择器和 Canvas 创建入口。依据现有原站客户端、公开模型配置和通用 Skill 配置静态核对；不登录、不注册、不调用原站账户写接口，不做全量内容/素材采集，也不启动浏览器。新选择器使用独立样式，保持原有卡片类名与悬浮布局；浏览器验收由主任务执行。

此记录区分功能实现与代表性内容。列表、详情的内容数量不作为功能完成条件；未实现的原站交互仍列出，不能将本轮测试通过解释为全部 Skill 功能已复刻。下文 root 浏览器记录为实现后的本地实测，与子代理的源码审查区分。

## root 后续真实浏览器验收

本地夹具保留真实 Skill 页面和公开内容，只提供本地演示用户，不操作原站账号。紧凑选择器显示通用 15 项，点击“添加 皮克斯动画广告”插入引用并回 composer；完整窗口可打开“东方巨构美学短剧”嵌套详情。首次 Escape 只关闭详情，焦点回到完整窗口的标题按钮且 body 保持滚动锁；第二次 Escape 关闭完整窗口并回 Skill 触发按钮。

鼠标悬停后点击创建按钮曾因 hover 打开再 click toggle 关闭，现改为点击确保打开并停止冒泡/关闭定时器。真实鼠标点击已复验菜单保持展开，两项创建入口可见；新增两种入口的 userEvent.hover→click 与键盘 Enter/Escape/外点回归。没有在本轮浏览器执行新标签创建的最终点击。

真实资产建 Canvas 后加入 intake 参数，选择当前画布提交，blocked 请求与原图片、80% 视口刷新恢复；一次性参数已清理。该结果验证现有创建上下文和持久化，不证明真实服务创建或多次 inline 引用已经完成。

## 原站依据

| 证据                                                                                                                                          | 可确认的行为                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/source/0-px891fumwca.js`：`e_` SkillCard、`eD` SkillList、`eG` Skill 选择器、`ChatModelSelectHoverCard`、`ChatAssetSelectHoverCard` | 外层卡片打开详情；使用/收藏独立停止冒泡；公共分类与私有列表分开；输入栏模型分图片/视频；附件有本地上传与资产库两个入口；输入栏 Skill 按钮打开选择器，而非单纯滚动。                                  |
| `research/source/19-1v5dt472t4.js`：`ChatRichInput`、`editorToAgentContentParts`、`getChatModelPickerByModality`                              | 富文本引用转为结构化 parts；模型使用 stable modelKey，Skill 使用 namespace/key；Enter 发送，Shift+Enter 换行，IME 不误提交；上传输入的 MIME/后缀；可用模型按 allowlist 过滤和去重。                  |
| `research/source/2bym-dyxfkv4h.js`：`SkillDetailBody`、`SkillDetailHeader`                                                                    | 审核状态控制使用/分享；简介与 Skill 文档分别呈现；快照恢复 markdown/files；案例按图片/视频/音频/文档分派，带案例创作链接和积分；文档案例 fetch 文本后 Markdown 呈现。                                |
| `research/source/2fafl1fsuiq43.js`：Skill 首页                                                                                                | 消费 useSkillKey/useSkillNs/useSkillName 后清理 URL；首页从 17 个标题中选择；原站移动端输入区显示条件。                                                                                              |
| `research/source/1d_aa57m7ud4g.js`：`SkillAuditStatus`、`isSkillUsable`                                                                       | Offline=-1、Pending=0、Approved=1、Rejected=2；Pending/Rejected 阻断使用。结果类型为 1 文本、2 图片、3 视频、4 音频。                                                                                |
| `research/source/04q9x43g2p9-v.js`：`resolveSupportModelDisable`                                                                              | 布尔、字符串、非空语言对象的禁用状态及本语言/en 原因回退。                                                                                                                                           |
| `research/source/api/config-182.json`、`config-311.json`                                                                                      | supportModels 与聊天 allowlist 的公开快照；当前静态菜单采用 17 个实际可选模型，图片 9 个、视频 8 个。模型配置可能更新，后续应由运营服务器提供。                                                      |
| `research/source/0-px891fumwca.js`：`eG/eU/er`                                                                                                | 紧凑选择器 450×400，通用/收藏/我的；搜索 300ms 防抖且检索公共目录；详情与插入独立；全部弹窗有公共分类/搜索、收藏/我的和 20 项逐步加载；创建菜单区分通过对话创建与导入已有 Skill，并在新标签打开。    |
| 2026-10-11 只读 `GET https://api2.liblib.art/api/www/landing-activities/getById?id=262`                                                       | 15 个通用 Skill templateUuid 的实际顺序。只读取一次配置，不展开内容采集；12 项可复用现有代表性目录，另外 3 项保留最小名称、key、简介与封面地址。运营目录可用 `commonSkillTemplateUuids` 覆盖此快照。 |
| `research/source/0k8_vz_bdp_zz.js`：`eH/eV`；`0eszq3bkbglub.js`：`AskUserStickyCard`；`1-wli4lpm9qut.js`：Canvas URL 消费                     | 创建入口按当前上下文提供从零/当前对话/当前画布/更新/自测；只有从零可选时直接提交；多选时单选卡片默认第一项、忽略/提交、方向键切换；`skillCreatorIntake=1` 仅消费一次，replace 只清除这个参数。       |

原站压缩脚本常为单行，因此引用文件与符号；不把压缩后的行号作为稳定依据。公开配置只用于读取，未修改原站数据。

## 本轮已修正，并可重复验证

| 功能                      | 本地实现                                                                                                                                                                                                | 验收步骤/回归覆盖                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 卡片命中与独立操作        | `components/SkillCard.jsx` 整张卡片打开详情；封面与标题保留键盘按钮；使用、收藏停止冒泡。                                                                                                               | 点击描述/作者区域应打开详情；点击使用应插入引用但不打开详情；收藏应独立操作。封面及标题可用键盘激活。原站和本地狭窄标题均可能被悬浮按钮覆盖；本轮不改其 CSS。                                                    |
| 私有列表与草稿内容        | `domain/skill-filter.js`：我的/收藏不继承公共分类或搜索；兼容 legacy skillUuid 收藏；新增收藏使用 templateUuid；草稿 markdownContent 与 snapshot 回退可呈现。                                           | 先选公共“视频”分类和搜索，再切“我的”，图片草稿仍可见；详情显示 markdownContent；旧收藏可见，取消后删除两种 ID 别名。                                                                                             |
| 公共搜索                  | “推荐”无搜索时保留原推荐顺序，有搜索时搜索合并目录；输入提交后才查询，清除恢复推荐。                                                                                                                    | 输入目录独有名称未提交时保留推荐；Enter/搜索按钮提交后找到；清除后恢复推荐并回焦点。                                                                                                                             |
| 请求状态                  | `SkillPage.jsx` 使用 useContent；列表/详情显示实际 loading/error/retry，不把失败当空列表；本地我的草稿独立可用。                                                                                        | 模拟目录或详情失败，显示错误并可重试；加载中显示状态；目录失败时我的本地草稿仍可显示。                                                                                                                           |
| 模型引用                  | `components/ModelMenu.jsx` + `domain/model-picker.js`：图片/视频分组同时可滚动；allowlist、去重、禁用原因、会员标记；提交 modelKey/modality，支持移除。                                                 | 打开菜单应见两个分组；点视频页签滚到视频分组；禁用模型不可选且有本语言理由；不显示 allowlist 外模型；选中后转交包含真实 modelKey。                                                                               |
| 使用与分享参数            | 使用无需在插入阶段强制登录；实际提交仍调用登录入口；Pending/Rejected 被阻断；可读取 useSkillKey/useSkillNs/useSkillName。                                                                               | 匿名点击使用应出现 Skill 引用；发送时走登录；直接进入参数 URL 显示对应引用；未审核 Skill 显示阻断提示并保留详情。                                                                                                |
| 附件状态                  | 本地文件读取为 data URL；接运营服务器时通过 api.upload；支持图片、视频、音频及指定文档后缀；上传中/失败不提交，可重试或移除。粘贴/拖入文件共用入口。资产库仅列未删除的图片/视频/音频，不转交 blob URL。 | 添加单独附件、等待 ready 后即可提交；上传失败应显示重试且发送禁用；移除后可继续；资产库多选后转交包含 mediaAssetUuid；库中每种媒体不超过 20 项。原站未确认通用 composer 文件大小限制，不复用发布案例的大小限制。 |
| 结构化转交                | `services/agent-handoff.js` session 暂存模型/Skill/媒体/文档引用；引用不再拼成伪生成结果；Enter/Shift+Enter/IME 行为；配额失败保留输入。                                                                | 单独模型、Skill 或附件可发送；Canvas 收到完整 parts；session 写入失败不导航且保留输入；刷新不丢引用。Canvas 的消费/持久化顺序与生命周期验收由主任务负责。                                                        |
| 详情案例与公开文档        | `SkillDetailModal.jsx`、`SkillCaseMedia.jsx`、`domain/skill-media.js`：多类型媒体、前后切换、图片放大、案例链接/积分、文档加载失败重试、文件选择、预览/源码；简介和正文均呈现。                         | 切图片/视频/音频/文档案例；测试文档失败后重试；多文件切换与源码显示；隐藏 showMarkdown=false 内容；未发布草稿不显示无效分享按钮。                                                                                |
| 输入栏紧凑 Skill 选择器   | `SkillPicker.jsx` + `domain/skill-picker.js`：原地打开、通用/收藏/我的切换；私有页签保留登录入口；通用真实顺序、全公共目录防抖搜索；我的仅可用草稿；整行插入与独立详情；hover 预览。                    | 输入栏打开后保留原提示词、模型与附件；Tab 后回车/空格插入；搜索与清除；收藏/我的无搜索不继承公共分类；详情关闭后回到工具栏。                                                                                     |
| 全部 Skill 弹窗           | `SkillLibraryModal.jsx`：公共/收藏/我的、分类滚动、提交搜索、20 项递增显示与可操作加载更多；复用卡片详情/收藏/使用；详情作为最上层弹窗，Escape 只关闭该层。                                             | 打开全部、切分类/搜索/私有列表、加载第 21 项；开详情后 Esc 回到全部，第二次 Esc 关闭全部；输入和引用仍保留，body 滚动锁定正确恢复。                                                                              |
| 手动/对话创建入口         | `SkillCreateMenu.jsx`：主列表和选择器复用两项菜单；手动打开 `/skill/create`；对话打开独立新 Canvas，保留 `guideSource=skill&skillCreatorIntake=1`；弹窗阻止时提示且不清空 composer。                    | 通过菜单分别创建；原站源逻辑使用新标签，当前页不导航；本地用独立 projectId 防止新画布复用同一个 `new` 存储键。匿名入口仍调用既有登录 UI，不调用真实账号服务。                                                    |
| Canvas 对话创建收集与恢复 | `SkillCreatorIntake.jsx` + `useSkillCreatorIntake.js` + `domain/skill-creator.js`：文档 ready 后只消费精确参数；单选自动选择从零，多选卡片可选/忽略/提交；请求随 agentDraft 保存与刷新恢复。            | 有画布时选择“基于当前画布创建”；提交包含 project 上下文及 summarizeFromCanvas；收集期间禁用 composer/上传/发送；确认后保留提示词、模型、Skill、素材；刷新恢复请求；取消不删原数据。                              |
| 资产库状态统一            | `SkillAssetPicker.jsx` 使用共享 `useAssetLibrary().value.assets`，首次兼容旧 `libtv-assets` 数组，不再写旧 key；remote 分支保留。                                                                       | 新原子资产库变更时选择器同 tab 立即刷新；删除资产不出现；切类别保留已选；选入的素材保留 mediaAssetUuid；旧 key 内容保持不变。                                                                                    |

## 剩余差距与执行验收清单

按原站证据列出真实差距，当前冻结不再扩大实现范围。P1 表示独立功能流程缺失；P2 表示局部交互、表现或可接服务器状态仍需补齐。真实账号功能按用户要求暂缓，不要求新账号资源。

| 优先级  | 差距/当前状态                                                                                                                                             | 依据与下一轮验收                                                                                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1/服务 | Mine更多、手动/对话编辑、软删除恢复、发布验证、Pending及团队owner门控已实现；真实发布/审核服务未接入。源菜单未确认撤回，不再列为缺少的操作。 | `features/skills/mine/` 本地请求保存blocked，保留原审核/公开ID；服务接入后另验权限、审核失败与跨设备状态。 |
| P2 | 共享TipTap inline多引用、slash/@、光标插入/撤销、pending更新、预览与有序交接已实现。完整原站输入视觉仍需逐状态对照；Canvas发送消息仍将引用置于文字下方。 | `components/agent/` / `services/agent-content.js`；本地浏览器两个Skill/两个模型及MD/WAV保存刷新，见 [输入审计](./agent-inline-functional-audit.md)。 |
| P1/暂缓 | 收藏与生成模式当前保存在本地；尚未接运营账户偏好、收藏分页和权限反馈。                                                                                    | 原收藏请求及 `useChatAgentModePreferenceStore` 为用户级服务器状态。接入用户自有 backend 后：失败回滚、重试、跨页面一致；目前不承诺真实登录/账号资源已复刻。                                                      |
| P2      | 资产库选择器请求 limit=100 后不消费 hasMore/nextCursor。                                                                                                  | `components/SkillAssetPicker.jsx` 已有 loading/error/retry，但未分页。运营接口给 101 条资产、nextCursor，滚动/加载更多后第 101 条应可选择，已有选择不丢。内容快照数量与该功能差距无关。                          |
| 已实现 | useSkillKey/useSkillNs/useSkillName同路由消费后清理，保留编辑器身份、输入和其他query/hash；相同分享参数再次进入可再插入。 | `RouteOutlet.test.jsx`真实lazy SkillPage/TipTap回归，不使用组件stub掩盖重挂载。浏览器前进/后退完整链路仍需独立核验。 |
| P2      | 首屏标题固定；原站有 17 种标题。移动端输入区是否与原站显示条件一致尚待浏览器核验。                                                                        | `2fafl1fsuiq43.js` 与 locale skillHeroTitle1..17。不同首次进入可出现来源中的标题；宽窄视口对比输入区、菜单和私有 tab。                                                                                           |
| P2      | 案例已可播放/切换，原站自定义音频控件、媒体纵横比自适应、轮播动画和文档/源码的细部呈现未完成像素级核验。文件菜单 Escape/外点关闭需与公共 Modal 行为合验。 | `SkillDetailBody`。宽屏/窄屏切换横竖案例、开图片放大、调音量/进度、Esc 关闭最上层；文件菜单关闭不应误关整个详情。现用原生音频 controls，不能称为外观完全同款。                                                   |

二进制 PDF/DOC/PPT 案例的真实可用性未确认：原客户端同样 fetch().text() 再 Markdown 渲染。本轮不凭扩展名推断原站已有 PDF 阅读器，也不新增二进制转换服务。

Canvas 的 Skill 创建服务尚未接入，当前明确显示“创建服务尚未连接”，保留创建方式、上下文、提示词和参考素材，并提供重试/忽略/手动创建。重试只保留本地尝试次数，不生成虚构 Skill 或成功消息；真实 Agent 服务和账户拥有的 Skill 查询仍需运营 backend。原站请求结构经过 appendAgentContextToPayload；此处的 `{parts, context}` 是本地待接入契约，不称为已验证的真实后台 wire 协议。

模型时长、比例、分辨率、seed 等生成参数不属于此聊天模型菜单：原菜单选择行为是插入 model 引用，完整参数由 Canvas 节点 schema 提供（现有 `public/data/models.json`）。不能把生成节点的全部模型、upscaler 等直接塞进聊天 allowlist，也不能因菜单无参数表单就判断其缺功能。

## Skill → Canvas 暂存契约

共享协议位于 `src/services/agent-handoff.js`，`src/features/skills/domain/handoff.js` 保留兼容导出。Canvas 直接依赖服务模块，避免跨业务域引用 Skill 内部实现。

sessionStorage key：`libtv.canvas-handoff.<id>`，30 分钟有效。写入使用统一 storage 服务，失败抛错；页面捕获后保留 composer 并提示。

```js
{
  version: 1,
  parts: [
    { type: 'text', text: '创作意图 {{ model:model-key }} {{ skill:namespace/skill-key }}' },
    { type: 'model', id: 'model-key', name: '模型名', modality: 'video' },
    { type: 'skill', id: 'namespace/skill-key', name: 'Skill 名', draft: true /* 仅本地草稿 */ },
    {
      type: 'image', // 另支持 video / audio / document
      id: 'attachment-id',
      name: '参考图.png',
      source: { type: 'url', value: '...', mimeType: 'image/png' }, // 或 data
      metadata: { mediaAssetUuid: 'asset-id' } // 资产库可选字段
    }
  ],
  plainText: '含引用占位符的首个 text 内容',
  serialized: '有引用时为 parts JSON；仅纯文本时为文本',
  createdAt: 0, // Date.now()
  dryRunIntent: true // 可选，true 为手动生成
}
```

导出：`createSkillHandoff(options, now?)`、`writeSkillHandoff(payload, id?) -> id`、`readSkillHandoff(id, now?) -> payload|null`、`consumeSkillHandoff(id) -> payload|null`、`legacySkillHandoff(search)`、`skillHandoffText(payload)`、`canSubmitSkill(options)`；文件类型与 accept 常量供 composer 共用。Skill 默认 namespace 为 libtv-user-generated；已有 namespace/key 不重复前缀；旧 prompt/skillUuid URL 保留读取兼容。

跳转：`/canvas?forceAgent=1&draftPromptId=<id>`，旧 prompt/skillUuid 同时保留兼容。Canvas 需要先成功持久化项目再 consume；存储失败不得消费 handoff。该顺序已由主任务实现，其集成结果不冒充本模块独立回归结果。

## 本轮校验结果

2026-10-10 本地运行通过，未启动浏览器：

```sh
npx eslint src/features/skills/SkillPage.jsx src/features/skills/SkillPage.test.jsx src/features/skills/components src/features/skills/domain --max-warnings=0
npm test -- src/features/skills/SkillPage.test.jsx src/features/skills/domain src/features/skills/components/ModelMenu.test.jsx src/features/skills/components/SkillCaseMedia.test.jsx
```

ESLint：0 警告。Vitest：5 个文件、28 项通过。所有本轮 owned 文件已 Prettier 格式化；未修改 App、全局 CSS、根配置、create/share 页面或服务层。剩余差距需按上述步骤完成浏览器/运营 backend 验收后才能关闭。

共享协议迁移及全站浏览器验收后，2026-10-11 root 最终检查通过：37 文件、189 项回归；完整证据和支持边界见 `editor-functional-audit.md`。上述 5 文件/28 项是本域迁移前独立检查记录。

2026-10-11 选择器与 Canvas 创建入口的新一轮独立检查（不含主任务后续浏览器验收）：

```sh
npx eslint src/features/skills/SkillPage.jsx src/features/skills/SkillPage.test.jsx src/features/skills/components src/features/skills/domain src/features/canvas/NodeCanvas.jsx src/features/canvas/components/CanvasAgentPanel.jsx src/features/canvas/components/SkillCreatorIntake.jsx src/features/canvas/components/SkillCreatorIntake.test.jsx src/features/canvas/hooks/useSkillCreatorIntake.js src/features/canvas/domain/skill-creator.js src/features/canvas/domain/skill-creator.test.js src/features/canvas/SkillCreatorFlow.test.jsx --max-warnings=0
npm test -- src/features/skills/SkillPage.test.jsx src/features/skills/domain src/features/skills/components/ModelMenu.test.jsx src/features/skills/components/SkillCaseMedia.test.jsx src/features/skills/components/SkillAssetPicker.test.jsx src/features/canvas/NodeCanvas.test.jsx src/features/canvas/hooks/useCanvasAgentAttachments.test.jsx src/features/canvas/domain/skill-creator.test.js src/features/canvas/components/SkillCreatorIntake.test.jsx src/features/canvas/SkillCreatorFlow.test.jsx
```

ESLint：0 警告；Vitest：11 文件、58 项通过。所有本轮 owned 文件经 Prettier；未修改 create/share、全局 CSS、服务层、App 或根配置。选择器及创建收集已经实现，不再保留为缺失流程；本条是历史批次；更多菜单和inline多引用现已补齐，运营写服务及其余差距按更新后的表保留。

全站并行检查随后暴露两项回归不稳定：创建选择的 effect 重置可能覆盖已选项，以及分页测试在页面/弹窗重复渲染 22 项后反复扫描可访问名称，超过默认 5 秒。修正后按 document/intent identity 同步派生默认选择，新增请求重新归一化时保留用户选择的回归；分页独立验证弹窗，另保留小规模页面集成验证关闭与 composer 保留。请求保存验证采用页面离开时的同步 flush，避免 600ms 后台保存与 waitFor 壁钟竞争。未提高超时或调整根 worker 配置；独立同组检查为 11 文件、60 项通过，ESLint 0 警告。最终全站并行重跑由主任务执行。

2026-10-11：模型及目录共用规则已迁入 services，原domain路径仅兼容导出；Canvas不再引用Skills内部实现。共享输入、上传取消、复制引用身份和同路由消费的本批证据见 [输入审计](./agent-inline-functional-audit.md)，创建树见 [SOURCE_AUDIT](../src/features/skills/create/SOURCE_AUDIT.md)。
