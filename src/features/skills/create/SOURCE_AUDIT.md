# Skill 手动创建编辑器：源码核对与分层验证

2026-10-11。文件树批次使用已保存的公开源码；本次编辑器批次另外只读补取一个已从源码定位的 CodeMirror chunk，来源与 SHA-256 保存在下方证据文件。不登录、不使用账号资源、不调用原站写接口。实现限定 `src/features/skills/create/`，另仅适配既有次级回归中两条编辑器输入步骤；根工程与公共服务由主代理维护。

## 文件树批次证据与实际页面配置（历史，能力保留）

| 行为                                                                                                      | 已保存源码证据                                                                                                                     | 本地实现状态                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件路径构建隐式目录，并加入显式空目录及祖先                                                              | `research/source/1p1-jebg1osnx.pretty.js:250`，`SkillFolderTree` 的 paths / extraDirs 构树                                         | `file-tree-model.js` 统一构建目录；保留既有文件内容和自定义 metadata                                                                               |
| 主文件置顶；目录点击选择并折叠；aria-expanded 和开/闭文件夹                                               | `1p1-jebg1osnx.pretty.js:269`、`:324`                                                                                              | 默认展开，点击或按钮 Enter 切换，隐藏整个子树；新建条目时展开目标父目录                                                                            |
| 拖动文件或整个目录；目录行目标为自身，文件行目标为父目录；根容器目标为空字符串                            | `1p1-jebg1osnx.pretty.js:310`、`:358`                                                                                              | 根目录有可落点区域及高亮；目录移动携带文件及空目录；同父目录移动不改变文档                                                                         |
| 主文件不允许移动、改名、删除；不能移动到自身或后代；同名文件/隐式目录/空目录冲突                          | `1p1-jebg1osnx.pretty.js:310`、`:324`；`research/source/3dre517zt-vqp.pretty.js:109`、`:121`                                       | UI 锁定主文件；纯模型校验后统一提交。失败有 inline alert 和 toast，原文档不变；外部文件 drop 给出清楚提示，不将其误判为树内部移动                  |
| 重命名/移动仅迁移受影响的当前选中路径                                                                     | `3dre517zt-vqp.pretty.js:121`–`:143`，`eS` / `ev`                                                                                  | 保留当前文本及 metadata；选中子文件随目录移动，其他文件选择不变                                                                                    |
| 删除确认，只有被删除的选择回到主文件                                                                      | `3dre517zt-vqp.pretty.js:144`–`:160`，`ej`                                                                                         | 文件/目录确认文案沿用快照；取消不改变文档；确认移除整个子树                                                                                        |
| 右键与按住 500ms 打开菜单，移动任一坐标超过 8px 取消；菜单只有重命名/删除                                 | `1p1-jebg1osnx.pretty.js:286`、`:324`、`:360`                                                                                      | 按住、拖动开始取消计时、右键关闭遮罩已接入；长按后的 click 不额外选择/折叠                                                                         |
| Enter、Escape、失焦提交；选中名称但单独保留原扩展名；防重复提交                                           | `1p1-jebg1osnx.pretty.js:299`–`:323`，`K` / `V` / `q`                                                                              | 原扩展名大小写保留；Enter/失焦/确认按钮不会重复创建；Escape 放弃编辑；名称输入遵守 IME；关闭菜单后再聚焦名称，避免公共菜单恢复 opener 抢走输入焦点 |
| double-click rename 和行内直接删除是可选能力，创建页未启用                                                | `1p1-jebg1osnx.pretty.js:250` 的 `renameOnDoubleClick=false` / `showRowDelete=false`；`3dre517zt-vqp.pretty.js:195` 未传对应 props | 本页不因共享树存在这些能力而增加双击重命名或无需菜单的删除按钮                                                                                     |
| 导入 Markdown 文件/文件夹，忽略隐藏路径；合并后最多 50 个文件、UTF-8 总大小 1 MiB；覆盖非空同名内容需确认 | `3dre517zt-vqp.pretty.js:162`–`:178`、`:198`–`:212`；`1p1-jebg1osnx.pretty.js:377`                                                 | 校验合并后数量与真实 UTF-8 大小；取消覆盖保留原内容。异步完成时合并最新编辑，新的读取覆盖旧请求生命周期；失败/卸载不修改数据；读取中禁用上传及保存 |
| 读取已有 skillFiles，否则回落单文件 markdownContent；每文件 20000 字校验                                  | `research/source/0u4skljmyhqlo.pretty.js:30`；`1p1-jebg1osnx.pretty.js:377`                                                        | 兼容旧单文件草稿；保存校验主文件/空文件/长度/总大小；损坏 JSON 或文件记录显示读取错误，不覆盖存储                                                  |

## 本地持久化与可访问性边界

- 仍只通过 `services/storage.ts` 读写 `libtv-created-skills`；保存完成文案明确为本地演示。写入/配额失败保留原存储、当前表单和树编辑，恢复空间后可以重试；历史 `null` 空库仍可读取。
- 本地草稿新增 `skillDirectories` 保存显式空目录，刷新后恢复。它是本地恢复 metadata，**不是**原站 API 字段：原 `3dre517zt-vqp.pretty.js:79` 的 `getSkillFiles` 只导出文件，`:83` 的 `setSkillFiles` 清空 extraDirs；`0u4skljmyhqlo.pretty.js:68` 的服务器提交不包含空目录。
- 原文件数组 `{path,content,contentType,primary}`、`markdownContent` 及其他已有字段保留，未更改共享发布/handoff/services/router 协议。仅根 `SKILL.md` 被标为主文件。
- 结果类型选择器已按公开 `SkillResultTypeSelect` 的 Select 行为补齐：触发器暴露 `aria-expanded`/`listbox` 语义，Enter/Space、上下/Home/End 可选择，Escape 关闭，外部 pointerdown 关闭；选择图片/视频时保留封面入口，选择文本/音频时清除封面。未来真实封面上传仍可由服务层接入。
- 封面读取现在支持可注入 `coverSource.upload({ file, dataUrl })`：上传中会阻止保存，异步成功才替换封面 URL，失败保留旧封面并提示重试；没有 source 时继续使用本地 data URL，不能当作服务器上传成功。
- Shift+F10 / ContextMenu、方向键 / Home / End、Escape、菜单按钮和回焦点是本批按任务补充的键盘操作。原菜单源码使用普通按钮，没有对应完整方向键实现，不能称作从原站发现的键盘设计。与公共 dialog-stack 共用生命周期，未另建 body 锁或全局 Escape listener。
- 历史文件树批次保留了当时的代码 textarea / 基础富文本组件；本次已替换为真实编辑器，见下文。新增 CSS 使用 `secondary-skill-*` 前缀，直接由本域组件导入；没有修改全局 CSS 清单。

## 文件树批次回归验证（历史结果）

历史批次新增 3 个测试文件、19 项测试；与既有次级页面回归合跑共 **5 个文件、33 项测试**通过：

```sh
npx vitest run src/features/skills/create \
  src/features/shared/secondary/secondary-functional.test.jsx \
  src/features/shared/secondary/secondary-flows.test.jsx
npx eslint src/features/skills/create --max-warnings=0
npx prettier --check src/features/skills/create
```

覆盖整目录/根/文件父目录移动、内容/metadata/选择保持、冲突/自身循环/主文件锁定、折叠与新建、菜单键盘及嵌套 Escape、原扩展名/失焦单次提交、删除取消/确认、长按阈值、拒绝/覆盖取消/迟到/请求取代、读取中编辑与保存禁用、空目录刷新恢复、quota 失败后重试、损坏数据阻止覆盖和旧草稿兼容。夹具为本地合成内容，不表示原站账号草稿或服务器写行为已验收。

## 明确未完事项

- 本批未用浏览器对照原站逐像素与窄屏验收；Root 统一验收本地路由。
- 历史批次尚未实现完整编辑器。随后源码核对确认代码模式实际是 **CodeMirror 6**，此前称 Monaco 不准确；本次已补 TipTap / CodeMirror / 条件 diff。优化生成、案例上传/审核及真实服务器写入仍未接入，不能宣称成功。
- 原上传入口使用 hover（`3dre517zt-vqp.pretty.js:31` 的 `N`）；本地既有 click 入口保留并补键盘菜单。原字段是否需要统一恢复 hover 及对应布局需后续视觉/交互批次核对，不能将本批树行为测试等同整个创建页完美复刻。

## 真实编辑器源码证据与实际能力配置（当前批次）

| 行为                                               | 原站公开源码证据                                                                                                                                                                                                                                                    | 本地实现                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认预览是可编辑富文本，而非渲染结果加 textarea    | `3dre517zt-vqp.pretty.js` 的 `SkillMarkdownField` 使用 module `527359`；`3arr4xr86thfg.js` 的该 module 配置 `useEditor`、StarterKit heading levels `[1,2,3]`、列表、横线、bold/italic/code/codeBlock/blockquote、`html:false`、Markdown 复制/粘贴和 Placeholder     | `SkillRichEditor.jsx` 使用真实 TipTap 3.31.4；`markdown-extensions.js` 使用官方 Markdown 扩展与本域 Clipboard 插件。原站没有独立格式工具栏，本页保留快捷键/输入规则，不添加新工具栏。私有 Marked lexer 将原始 HTML 保留为文字，避免修改其他编辑器的全局解析设置                     |
| 代码模式为 CodeMirror 6                            | `3dre517zt-vqp.pretty.js` 的 module `777780` 动态加载 `3o0q0dlznaq9n.js`；该 chunk module `794992` / `3o0q0dlznaq9n.pretty.js:25165`–`:25398` 使用 EditorState/EditorView、行号、history/default+history keymap、Markdown GFM、lineWrapping、语法颜色与 placeholder | `SkillCodeEditor.jsx` 原生 CodeMirror 6，lazy 页面内加载，真实可编辑文档、行号、语法高亮、换行、撤销/重做与销毁，不依赖 Monaco 或 textarea 冒充                                                                                                                                     |
| 文件、模式、全屏切换先保存当前正文；每文件保持内容 | `3dre517zt-vqp.pretty.js` 的 `e_` / `getSkillFiles` / `R.current`、模式和全屏控制                                                                                                                                                                                   | 两个编辑器每次真实 transaction 同步向父文件数组报告，保存/切换不用等待源码的 300ms UI debounce。未编辑的原 Markdown 字节不因模式展示而被重写；位置缓存按文件与模式隔离，移动路径一并迁移。全屏仍共用原树/菜单和公共 Modal 生命周期                                                  |
| diff 是能力开关，手动创建页面默认不启用            | `3dre517zt-vqp.pretty.js` props `onlineContents`、`diffEnabled=false`；模式按钮条件 `M2`；`0u4skljmyhqlo.pretty.js` 的 `SkillCreateForm` 默认为 false，手动页没有传线上基线或启用开关                                                                               | `SkillFileEditor` 仅 `diffEnabled` 时显示比较入口；当前 `/skill/create` 保持预览/代码两项。组件回归单独提供合成 baseline 验证能力分支，不将夹具称为原站数据                                                                                                                         |
| 当前文件的 diff 仍可编辑，删掉的基线文件只读       | `3dre517zt-vqp.pretty.js` 的 deleted paths / `eL`；`1p1-jebg1osnx.pretty.js:3`–`:75` 的 added/removed/modified 行、统计和只读 renderer；`3o0q0dlznaq9n.pretty.js:25035`–`:25065`、`:25300`–`:25366` 的 StateField / removed widget / 250ms 更新                     | `editor-diff.js` 纯比较与统计，线性内存 LCS；`code-diff.js` 当前行和 gutter 高亮、不可编辑删除块，编辑后 250ms 重算并卸载取消定时器；`SkillMarkdownDiff.jsx` 只读被删文件。树显示新增/删除行数与删除线，禁用已删条目的拖动/菜单；退出 diff 回到主文件，基线文件不会进入当前草稿数组 |
| 内容优化真实依赖服务结果                           | `0u4skljmyhqlo.pretty.js` 的 `optimizeSkill` 请求、结果预览及确认应用分支                                                                                                                                                                                           | 本项目没有连接优化写服务。按钮明确显示「内容优化服务尚未连接，当前文件内容已保留」，不制造进度、返回内容或成功状态；空内容仍按原文案阻止请求                                                                                                                                        |

源 chunk 保存路径：`research/source/3o0q0dlznaq9n.js`；阅读副本 `research/source/3o0q0dlznaq9n.pretty.js`；来源记录 `research/source/3o0q0dlznaq9n.provenance.json`。原始 SHA-256：`b8b827e592b7b405d2894cf90a4dff2fa05c985c2fc7b6e136e144999f3f62a0`。这些脚本仅为证据，不由生产 App import 或执行。

## 模块与依赖边界

- `SkillFileEditor.jsx` 继续协调文件树、当前文件、模式、导入确认与全屏；编辑行为分别由 `components/SkillRichEditor.jsx`、`SkillCodeEditor.jsx`、`SkillMarkdownDiff.jsx` 承担。
- `markdown-extensions.js` 只配置本域的 Markdown 解析、复制与粘贴；`editor-diff.js` 为无 React / DOM / 服务依赖的纯比较模型；`code-diff.js` 仅把比较结果映射为 CodeMirror 扩展。
- 本域只依赖已安装官方编辑器包、公用 Modal/图标和原有 storage/content 边界。没有跨入 Canvas、学院、Skill 列表私有模块，没有修改 root app/router/services 或共享输入框实现。
- 官方 TipTap 3 Markdown 接口 `contentType: 'markdown'` / `getMarkdown()` 依据 [官方入门文档](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage)。版本由根 exact 依赖维护。直接使用包的 MIT 许可副本及版本表在 [`licenses/NOTICE.md`](licenses/NOTICE.md)。

## 当前验证与剩余边界

本域 **5 个测试文件、34 项测试**；与既有两组次级回归合跑为 **7 个文件、48 项测试**。在上述历史树测试之外，本次新增 15 项真实编辑器与纯模型测试，覆盖：

- TipTap 标题/粗斜体/列表、键盘格式快捷键、HTML 文字处理、Markdown 粘贴/复制、外部内容替换不回写和光标恢复。
- CodeMirror 真实文档 transaction、撤销/重做、外部替换不回写、diff 删除块只读、改动后重算及卸载后的定时器清理。
- 文件切换/模式切换/全屏编辑的正文与每文件光标保持，未编辑内容原字节保持；diff 能力关闭/开启和删除文件不入库；未接入优化服务保留内容。
- 比较结果完整还原旧/新文档、重复行、替换/删除/追加/空文档、近文件长度上限的小编辑比较。

域 lint 零错误/零警告，域格式检查通过。这里只记录定向检查，根代理统一执行全量 check 与真实浏览器验收。

剩余边界：本次采用官方 TipTap 3 Markdown serializer 替代原构建中的 legacy Markdown serializer，编辑后对等语义的空白、列表和转义形式可能规范化，不能称为所有 Markdown 字节格式逐项一致。未编辑旧正文仍原样保留。服务端优化的结果弹窗/取消/确认，真实上传/审核/写入仍待运营服务接入；本域未声称已经完成。鼠标 IME、复杂剪贴板和移动端触摸选区仍由真实浏览器继续验收。本次没有登录态或逐像素对照原站。Hirschberg 与源码矩阵 LCS 在多种同长最优匹配时可选择不同重复行归属，但正文、统计及编辑数据保持完整。

Root 浏览器集成：实际键盘输入Markdown标题/正文，代码模式显示完整内容，全屏末尾追加后返回预览保持标题和正文；填表保存为本地草稿，刷新后通过Mine详情确认相同正文和字段。点击优化提示未连接并保留正文。修正富文本white-space为pre-wrap，消除ProseMirror编辑条件警告；Vite显式预构建新增编辑器依赖，避免首次lazy模式切换时开发服务器依赖发现刷新。复杂IME/剪贴板/移动触摸和原站像素仍未验。截图在 `artifacts/structure-editor-proof.jpg`，全量检查见根coverage。

## 结果类型选择器维护（2026-10-16）

公开 `SkillResultTypeSelect` 使用不可取消的 Select，并由 `SkillCreateForm` 消费结果类型变化；本地原先只有 click 展开的普通菜单。本批为同一入口补上 listbox 语义、Enter/Space 打开或提交、ArrowUp/ArrowDown/Home/End 选择、Escape 关闭和外部 pointerdown 关闭。选择文本/音频时仍按已有表单规则清除封面，图片/视频继续显示封面入口；没有创建真实上传请求或登录态。

定向 `SkillCreateResultType.test.jsx`、`SkillCreatePage.test.jsx`、`SkillFileEditor.test.jsx` 共 **3 文件 / 18 项通过**，Skill create ESLint 零警告、Prettier 通过。随后 Node24.19.0 全量 `npm run check` 通过 **468 文件 / 6584 项测试**，格式、零警告 lint、核心 strict TypeScript 与生产构建通过；真实运营封面上传、优化服务、移动触摸和逐像素原站对照仍未完成。

封面上传专项随后补齐 `coverSource.upload` 的异步成功/失败边界：定向 `SkillCreateCoverUpload.test.jsx`、`SkillCreateResultType.test.jsx`、`SkillCreatePage.test.jsx` 共 **3 文件 / 10 项通过**；Node24.19.0 最新完整检查为 **469 文件 / 6586 项测试**，格式、零警告 lint、核心 strict TypeScript 和生产构建通过。默认无 source 时仍只写本地 data URL，不能当作服务器上传。
