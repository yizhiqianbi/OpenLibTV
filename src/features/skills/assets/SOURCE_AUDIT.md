# Skill 资产选择器：数据边界与分页

本批只处理资产选择器的读路径与工程分层，没有采集内容、连接原站账号或调用写服务。

## 源码证据

- `research/source/0-px891fumwca.js` 的 `ChatAssetSelectHoverCard` 调用模块 `943317`，传 `isOnlyShowMaterial: true`、`agentEntryEnabled: true`。媒体转换只接受 image/video/audio，排除临时 `blob:` URL；原站生产入口有登录门槛，本批保留既有调用方边界，不接认证。
- `research/source/1s04obhd6gcqj.js` 模块 `943317` 的 `as` 组件：搜索 300 ms debounce；列表 `pageSize: 20`；`eL` 请求序号防迟到覆盖；滚动 `IntersectionObserver` 使用当前 viewport、`rootMargin: '160px'`、`threshold: 0.01`。源码原接口使用 page/total 分页，本项目运营接口采用其已有 opaque cursor 契约，两者未被混为同一个后端。
- 同模块弹窗桌面尺寸为 `min(90vw,1600px)` / `100vh-160px`，窄屏为 `100vw-32px` / `100vh-80px`，圆角 24px；新增样式仅作用于 `.sk-asset-picker`。

## 模块与依赖方向

- `components/SkillAssetPicker.jsx`：视图、共享 Modal 生命周期、筛选与选择快照；接收既有 `onClose` / `onPick` 和可选 `assetSource`。
- `assets/useAssetPickerPages.ts`：只读异步分页，负责取消、300 ms 搜索、请求世代、去重请求、原页重试。依赖公共 `services/contracts.ts` 和本域模型，不依赖 SkillPage、Canvas 或页面 DOM。
- `assets/model.ts`：纯媒体规范化/筛选/选择协调、记录按 ID 合并、Page 校验与游标前进；仅复用公共 `agent-handoff` 的媒体类型判断。`assetReference` 生成既有 ready 引用 shape，保留 `metadata.mediaAssetUuid`。
- `assets/asset-picker.css`：命名空间样式；没有修改共享 CSS 或本地库 hook。核心新模块使用 strict TypeScript，视图 JSX 仍是渐进迁移范围。

## 运营 adapter 接口

```ts
assetSource?: Pick<Collection<AssetRecord>, 'list'> | null
list(filters?: ListFilters, options?: { signal?: AbortSignal | null }): Promise<Page<AssetRecord>>
```

默认只有配置运营服务器时使用 `api.assets`，否则读取现有 `useAssetLibrary().value.assets`。显式 `assetSource={null}` 使用本地库；测试或运营 repository 可注入稳定的只读 source 对象。分页消费且仅消费已定义的 `items`、`total`、`hasMore`、`nextCursor`；请求使用 `limit:20`、`deleted:false`，可带 `query`、`type`、`cursor`。不猜测 uuid/page/folders/mediaAssetMetaList 等原站私有字段，不将原站响应直接当运营响应。公共 Collection.list 的 signal 扩展由 root 维护。

## 失败与状态行为

- 每次筛选重置该筛选的分页记录和游标，立即 abort 在途请求；输入搜索等待 300 ms。即使 adapter 忽略 abort，旧请求和卸载后的结果也不能写回。
- 目录读取与面包屑按当前 `folderId` 维护层级；共享选择器对 source 返回的混合目录记录再做 `parentId` 直接子级过滤，避免缓存的祖先、同级或后代目录跨层显示。关键词或标签筛选时目录卡继续隐藏，保持原站搜索优先级。
- 追加失败保留已加载记录和选择，重试请求同一失败 cursor，不重复添加条目。搜索或类别切换保留选中记录快照，已观察到的更新刷新引用 URL；已观察到的删除或不可用媒体移出选择。本地选择继续响应原子库订阅，不写旧 key。
- 同时触发滚动和按钮只发一个追加请求。断开的旧 observer 即使已有排队回调，也不能向新类别发送旧筛选请求。
- 缺失/重复/循环 cursor、非终页空记录或仅重复 ID 的页是 adapter 协议错误，停止自动追加并显示重试；不根据 total 或最后 ID 猜游标。协议错误页中有效记录仍保留；重试可在服务修复后继续。`hasMore:false` 为真实终止，即使末页为空或 total 尚有变化也不继续请求。
- 初次加载、追加加载、空态、错误与重试分开显示；网络失败期间仍能添加先前选中的有效记录。未实现任何虚假的生成/服务器写成功。

## 验证与边界

定向 Vitest：共享选择器、远程 Skill picker 与模型共 3 个文件 25 项通过，其中包含混合目录 feed 只显示当前层的回归。101 条合成资产按 20 条分页，覆盖第二页和第 101 条选择；同时检查失败原页重试不丢选择、去重、类别/搜索取消、迟到结果/卸载隔离、旧 observer、循环游标停止及 legacy/canonical 本地订阅。域 ESLint 零警告；新增 TS 模块 strict 校验通过；域 Prettier 通过。未运行全站检查或浏览器，后续由 root 集成验收。

真实运营服务器和原站登录态未验。团队/主体库、文件夹导航与封面、多资产 v2 生成信息、原站每种媒体数量上限等不属于本批分页修复，仍由既有上层能力或后续源核查处理。本次没有把这些分支标记为完成。
