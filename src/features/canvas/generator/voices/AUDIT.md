# 音色条与选择器（2026-10-11）

## 原站证据

- `research/source/34q64t3bi91ws.js`：模块 `92105` 的 `VoiceLibraryModal` 为 800px 弹窗、450px 列表、library/my/favorite 三个分类。每类各自保存筛选、输入搜索、已提交搜索、page/pageSize。默认 pageSize=20，选项 10/20/50；页码跳转支持 Enter。搜索延迟 300ms，并等待输入法 compositionEnd。
- 同块 `330420`：720px `VoiceFilterModal`。语言、口音、性别及多个年龄；无语言时禁用口音，变更/移除语言同时清空口音。年龄多项各有 chip，但过滤器数量仅计作一项。取消不应用，重置后需点击筛选才能应用。
- 同块 `882994` 卡片：独立试听按钮、名称/描述、语言/口音/性别标签、选择/已选择、收藏、更多菜单复制 ID；My 才显示音色克隆标签和编辑/删除。点击选择立即调用 `onChange(voiceId, record)` 后关闭，无额外确认步骤。
- 同块 `712939` 单播放器：暂停上一条，设置 src，currentTime=0 后 play；重复点同条暂停，ended 清空状态，库弹窗关闭停止。条式 `el` 显示已选音色、复制 ID、口音优先的标签和切换按钮；metadata 与 ID 不符时只显示 ID，不借用错误 metadata 的试听 URL。
- 条式选择回调仅保存六字段：`voiceId/name/language/accent/gender/voiceUrl`。原 AdvancedSettings 以 `property.originalField` 保存 ID，并以 `_${originalField}_meta` 单独保存 metadata。`public/data/models.json` 中 speech-2.8-hd/turbo 的 voiceCard 均为 barOnly，默认 female-shaonv，含真实公开 MP3。
- `research/source/1jgo2qrsqidfu.js` 模块 `733710`：筛选值、chips 和多语言 option 映射；`research/source/0odbr73whm6q4.js` 模块 `122576` 证实 MiniMax 过滤配置是 `minimaxVoiceSearch`，即配置 207。配置 190 是另一音色模型的列表，不当作 MiniMax 音色库。
- `research/source/1k5w11_he1tz_.js` 模块 `299750` 和 `170exq-5f14zz.js`：只读 POST `/api/voice/list`、`/api/voice/favorite/list`，body 为 `{page,pageSize,language?,accent?,gender?,ageGroup?,query?,isSystem?:false}`，仅 My 加 isSystem:false；response 为 `{code,data:{list,total},msg}`。收藏、取消收藏、克隆、登记、编辑、删除为其他写服务，本模块不调用原站。

## 本批实现与接线

- `VoiceBar.jsx`：`{value,meta,onChange(metadata),source?,disabled?,className?}`。选择回调可返回 false 或 reject，失败保留原音色与弹窗。`VoicePickerDialog.jsx` 可独立使用：`{value,onChange(voiceId,metadata),onClose,source?,playback?}`。
- `model.ts` 提供 metadata/字段 patch、请求 body、筛选 chips、默认样本匹配与响应校验。`voiceSelectionPatch(property, metadata)` 的返回对象需由宿主合并到 advancedSettings；不修改其他参数。
- `source.ts` 暴露 `VoiceSource.list(request,{signal}) → Promise<{list,total}>`，optional `options/setFavorite/mode`。`originalVoiceSource(adapter, options)` 仅映射宿主注入的授权只读 list/favorites；无 token、登录请求、原站 endpoint 请求或模块初始化 I/O。
- `sampleVoiceSource` 仅 1 条已有公开默认音色，`sample.json` 保存该音色和公开配置 207 的选项。匿名只读 voice/list 实测返回 `10001 用户未授权`，未继续获取账号内容，也未下载原音频。列表显示“公开音色代表样本；收藏仅保存在本机”，total 是筛选后的本机样本数量。不能将其解释成原站音色总数。
- 本机收藏用统一 storage 边界 `libtv-voice-favorites`，保留 ID 数组。读取/解析错误阻断覆盖，写入失败保留有效已有数据并允许重试；不当作已同步服务器。注入 source 无 setFavorite 时明确禁用收藏，避免假成功。
- `useVoiceLibrary.ts` 隔离各分类搜索/筛选/分页与已有数据；请求 AbortSignal 和 generation 双重检查，错误保留本分类已有项与外部已选 ID，显式重试。卸载/source 更换取消读取和收藏，忽略不合作 adapter 的迟到返回。
- 选择器打开时更换 source 会关闭筛选/克隆提示/更多子层，清除页码跳转、旧反馈和 pending 选择状态并停止旧试听；主选择器保持打开并读取新 source，旧筛选草稿不提交给新 source。disabled 变为真会关闭选择器，恢复可编辑后须重新点击入口，不自动重开。
- `useVoicePlayer.ts` 按需创建音频，条和弹窗共享一次实例；切换/暂停/关闭/卸载会暂停，play Promise、媒体错误与 ended 均检查生命周期。不把试听失败显示成成功播放。
- 选择、筛选、克隆服务提示和复制 ID 菜单共用 dialog-stack；Escape 按顶层关闭并恢复打开入口。独立 `voices.css` 使用 `cv-voice-*` 前缀，保留原条的 55px/试听 40px、弹窗宽度与列表高度，并提供窄屏折行。

## 验证与边界

- 定向回归覆盖精确保存键/metadata、默认标签不匹配、请求映射、重复 ID/非法响应、语言口音/多个年龄、筛选输入搜索/清空/选中值保留、第 21 条跨页选择、保存失败重试、分类/IME 搜索隔离、读取/收藏失败、late 请求/卸载、试听竞态/失败/ended、叠层 Escape 与焦点恢复、本机收藏损坏和 quota 恢复。音色目录专项当前为 5 个测试文件、23 项测试通过。
- 宿主 NodeSettingsPanel/GeneratorSettings 接线、浏览器真实音频播放、实际匿名界面及窄屏视觉验收由根代理执行；本模块测试通过不代表已完成这些浏览器验收。
- My 读取可由运营只读 adapter 提供。音色克隆/登记/编辑/删除、真实账号收藏写服务与授权状态未接入。本批克隆入口准确显示服务未接入；不开放虚构上传、生成成功、登记成功或可删除远端记录的操作。
- 语言、口音、性别筛选现在各自提供可搜索输入：按 option 的 label/value 过滤、清空搜索、保留当前选中值并在语言依赖变化时重置旧查询；原生 select 仍保留作为提交与键盘兼容边界。原站 Mantine searchable select 的下拉视觉与外点关闭形态尚未声称逐像素一致。复制 ID 更多菜单使用共享叠层焦点行为，原非模态 Popover 的外点关闭细节尚待浏览器对齐。
- 多个独立 VoiceBar 同时存在时各有播放器；当前一条音色设置+其选择器内保证单音频。原全局 singleton 跨多画布/多条设置的竞争行为尚未验收，不宣称已等价。
