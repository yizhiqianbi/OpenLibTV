# 共享 Agent 资产选择器：目录、文本与 scope

本批只读取既有公开客户端和本地记录，没有浏览器抢占、采集、原站账号或服务器写入。实际浏览器验收由根代理负责；以下定向回归不是原站账号权限证明。

## 原站证据

- `research/source/1s04obhd6gcqj.js` 模块 `943317`，`as` 的 `j/e0/tg/tb` 维护当前目录及面包屑。根标题按传入的 `scope` 为个人/团队资产库；目录卡进入子目录并清空搜索，面包屑截断目录路径。`tH` 固定为 `created_at_desc`，没有独立的排序菜单。
- 同模块 `tI` 按非空搜索 → 非空 tags → 当前 folder 读取，搜索只保留非文件夹；tags 的 effect 清空目录路径。团队读请求仅在 team scope 和 teamId 存在时带团队/成员参数，不能凭空给本地用户团队权限。搜索 debounce 300ms，pageSize 20，滚动 rootMargin 160px / threshold 0.01。
- 模块 `195076` 的 `eR` 打开时复制已应用的 tagNames/memberUserIds，取消丢弃临时选择、重置临时状态、应用后才改列表。成员筛选只在 teamId 存在的 team 分支显示；本项目成员列表必须由运营 adapter 显式提供。
- `943317` 的默认弹窗 renderer：selection + preview 时主体库入口被隐藏；scope 是调用方参数，并非弹窗内个人/团队切换器。因此本选择器不创造主体选择/主体写入或团队管理入口。主体库完整管理属于另一 renderer。
- `t5/t7` 识别图片/视频/音频及独立 TEXT 和 SCRIPT 展示；selection + preview 时点卡片预览，选择角标独立选择，文件夹只导航。视频使用 400px cover snapshot，封面失败回图标。二进制/script 不应被猜为可发送的普通文本。
- `research/source/0-px891fumwca.js` 模块 `341341` 的媒体转换仅从 v2 IMAGE/VIDEO/AUDIO 节点 URL 数组读取，排除 blob 并保留 mediaAssetUuid；模块 `331459` 仅把 TEXT content(string/string[])按内部换行合并、每段 trim，再段间空行合并。父级在存在媒体时优先媒体，零媒体才尝试纯文本。

## 分层与接口

- `components/agent/AgentAssetPicker.jsx` 仅协调视图、路径、筛选快照和选择；`AssetPickerFilters` 使用公共 dialog-stack 的嵌套生命周期，`AssetPickerCover` 管理实际封面/失败回退；独立样式不改原全局 CSS 顺序。
- `hooks/useAssetPickerPages.ts` 持有请求世代、AbortController、页/详情加载、失败 cursor 重试及取消；筛选上下文作为第四个可选参数，前三个参数保持兼容。文件夹可由混合页返回，或由另一个同契约 feed 分页，两者各自取消和重试。
- `services/asset-picker/model.ts` 负责记录规范化、文本/v2 转换、文件夹路径、排序、查询优先级、筛选、选择协调和 opaque cursor 校验。`source.ts` 定义运营只读契约并包装已有 Collection，不在 import/构造时访问 window/fetch，不调用原站生产 API。
- 旧 Skills picker/model/hook 路径仍为兼容 re-export。共享层不导入 Canvas/Skills 私有模块；消费端统一使用公共 `pickerAssetReferences` / `pickerAssetText`。

```ts
AssetPickerSource = {
  list(filters?, { signal }?): Promise<Page<PickerRecord>>;
  get?(id, { signal }?): Promise<PickerRecord>;
  listFolders?(filters?, { signal }?): Promise<Page<PickerRecord>>;
  tags?: readonly { name: string; assetType?: number | null }[];
  members?: readonly { id: string; name: string }[];
}
```

请求保留 `limit:20/deleted:false/type/cursor`，可带 `query/folderId/tagNames/memberUserIds/scope/teamId/orderBy:'created_at_desc'`。它是运营接口，不把原站 page/total 或 uuid/data 私有字段混为现有服务响应。`list` 可返回 `kind:'folder'`；独立 `listFolders` 也返回 Page。运营原有 `api.assets/api.folders` 包装仅调用已定义的只读 Collection。

默认无服务器时读取 `useAssetLibrary().value.assets/folders/tags`，不改 canonical/legacy 或写回旧 key。team 缺少 teamId/source 时明确不可用，绝不显示个人本地库。scope/team 改变重建请求所有权及选择；adapter 改变关闭预览/筛选并清除上一 source 的选择和 pending 提交状态。

`PickerAsset` 输出保留 `id/name/url/mimeType/mediaType/assetData/content/folderId/tags/assetType/ownerId/createdAt/thumbnailUrl`。独立文本没有伪造媒体 URL，显式 content-only 记录规范化为 `{version:2,items:[{data:{type:'text',name,content:[text]}}]}`；原 v2 字符串原样保留，多媒体不扁平化。缺正文的 text 元数据仅通过注入 get 读取；不 fetch 二进制 URL 当正文。自定义 get 收到 signal；旧 Collection.get 没有 signal 参数，网络请求仍可能完成，但 hook 的请求世代保证迟到结果不写回。

`onPickAssets(items)` 为完整交接入口；旧 `onPick(references)` 保持媒体兼容，可另传 `onPickText(text)`。没有文本消费入口时文本可预览但明确禁选，不默默丢弃选中项。交接失败保留选择/正文并显示错误；调用方返回 false 时不擅自关闭或声称成功。调用方继续负责真实登录门槛、incoming 每类20项及当前编辑器 readiness。

## 目录层级维护（2026-10-15）

共享选择器会把当前目录 ID 同时传给资产和目录 source；即使运营 adapter 为缓存、混合 feed 或批量读取而返回了祖先、同级和后代目录，视图仍只渲染 `parentId === currentFolderId` 的直接子目录。搜索或标签筛选时仍隐藏目录卡，避免把目录误当作全局匹配结果。该约束与原模块 943317 的当前目录导航及面包屑行为一致，不猜测远端分页总数，也不改变 source 的读取范围。

## 已验证与剩余边界

定向 Vitest **3文件/25项通过**（共享选择器 15 项、远程 Skill picker 8 项、模型 2 项）；域 ESLint 零警告、核心 strict TS 与域格式通过。覆盖嵌套目录/同tab重命名、根目录与全局搜索、远程混合目录只显示当前层、tag/member draft cancel/reset/apply、逐层 Escape/回焦点、文本预览和真实 v2 回传、交接失败保留、缺详情重试、类型及 scope 的迟到隔离、team 不泄露 local、独立 folder feed 失败保留资产选择。既有101条分页、旧observer、重复/循环cursor、错误后重试和卸载回归继续通过。

浏览器只读夹具位于 ignored `artifacts/asset-picker-fixture.js`，导出 `assetPickerFixtureSource` / `createAssetPickerFixture()` 和明确 QA 用户对象，可注入 `SkillPage.assetSource`。根目录含一个文件夹和公开原图，子目录包含两行合成分镜文本与场景/分镜标签；不创建真实账号、权限、上传或运营数据。

保留的媒体类别 tabs 是旧兼容 UI，并非943317的 tag/member 筛选控件；本批补独立文本分支，没有声称原站存在相同 type tabs。SCRIPT/二进制/未知资产不被伪装为 TEXT 或媒体；完整管理 renderer、主体 CRUD/拷贝、团队权限和成员远端搜索、生成信息、原站账号态及逐像素布局仍需对应域/实际运营 adapter 验收。失败时保留已载入记录和选中项是本项目明确的数据保护要求，原 source 的列表 catch 清空逻辑没有照搬成输入丢失。
