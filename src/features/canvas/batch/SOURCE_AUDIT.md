# Canvas 普通多选、分组执行和保存资产

本目录使用已归档的公开客户端源码，未登录、使用账号资源、提交原站写请求或执行真实生成。普通多选与 Agent「批量分镜」是不同入口；本批没有把分镜专用参数条改造成混合节点参数编辑器。实际集成、桌面/窄屏浏览器验收和全站检查由根代理记录。

## 原站证据

| 来源                                                                              | 已确认行为                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/source/21_0xvlvkw1sz.js`，普通多选 `n6`，父调用 `U/F/G`                 | 工具顺序为整理布局、保存资产、创建副本、分组菜单、下载、添加到 Chat、创建为 Skill。无普通多选 Generate 按钮或混合模型参数条。分组菜单 hover 立即开、离开延迟 120ms。缺少对应能力/回调时不能提供假操作。                                                                                                                                                                |
| `research/source/3u6hjewm8qox_.js`，970683（含布局选择器）；普通 Group 的 `tz/tw` | 布局只有 `grid/horizontal/vertical`。Group 确认「整组执行 / 开始执行 / 取消」，提示只执行生成节点，特殊节点手动执行；计费加载、计算失败、真实零积分和优先免费条数分别处理。普通 Group 调用 `{executionMode:'parallel',autoFocus:false,disableBenefitTags,concurrencyRetry:{}}`。                                                                                       |
| 同文件 `eM` / `embedAdvancedSettingsBatchOnly:true` 与 172860                     | 共享批量参数条属于 `storyboardVideo` 的图转视频流程：普通 settings 保留，仅嵌入 advancedSettings 过滤 schema 的 `batch:true` 参数（后续直接源码已纠正此前概括）。本目录没有将其开放给普通混合 Group。                                                                                                                                                                  |
| `research/source/2w-kufkudj-q1.js`，898823 PipelineRunner                         | 稳定 Kahn 排序，环及其依赖不强行执行；各依赖层并行，上游失败跳过下游，独立分支继续。生成动作白名单：`text_generate/image_generate/video_generate/audio_generate/video_edit/image_edit/script_generate`；支持节点 `text/image/video/audio/script/script-v2`，资源节点有组内入边也能进入计划，已有资源输出为 no-op。运行时重读输入与引用。                               |
| `research/source/0qme_d9a8um1y.js`，864307、653044                                | 一节点对应一个 v2 material；清理 `taskInfo/isStale`、blob URL/poster；增强输出转 resource 并去掉增强参数。多项各自重命名最多 50 字，共用保存位置和标签；默认类别标签推导共享 `assetType`，无标签为 OTHER。原 batchCreate 传 items / folderId，items 含 data / coverUrl / projectUuid / tags；位置必选，原 Cascader `includeRootFolder:false`。自建标签输入最多 10 字。 |
| `research/source/3u5mn2ag-xzg2.js`，856685；21 的下载调用                         | 下载递归展开组，媒体按每个实际 URL，文本 Markdown，script/storyboard 按源字段导出 CSV。水印保护标记须透传，不能据此声称可匿名解锁下载。                                                                                                                                                                                                                                |
| `research/source/19-1v5dt472t4.js` 与 872864 的 selected-node Skill caller        | Chat 插入节点身份；只有 image 节点带只读图片预览元数据。Skill 请求文本包含选中 node tokens +「根据这些画布节点总结 Skill」，不是全画布 intake 标志。                                                                                                                                                                                                                   |

### 已提供给根代理的 Group / 布局规则

- `713118` 定义于 `1kb-4b4zv9_2a.js`，`NODE_GAP=100`。21 的普通多选布局仅处理根节点，按 name 的 numeric localeCompare 排序，minX/minY 为锚点；尺寸 `measured ?? width/height ?? 200/120`。grid 列数 ceil(sqrt(count))、cell maxWidth/maxHeight，horizontal/vertical 逐节点自身尺寸累加，间距 100。它与 Group 常量 36 不同。
- `662493`（`04q9x43g2p9-v.js`）普通 Group `GAP=36/PADDING=36/TOP_PADDING=66`；创建 bounds 的基础 padding20 / title36，随后两次补偿 `r=20*(sqrt(zoom)-zoom)/zoom`，不是简单除以 zoom。Group grid 默认 ceil(sqrt(max(1,count))) 并限制 1–5 列；自定义列数 round 后限制 1–5。
- `0leiedr1esdbe.js` 的 deleteNodes / 306449 `applyDeleteCascadeToChildren`：普通删组只删除组壳，保留子节点，子节点转世界坐标并清 parentId/extent；专门「清空组」另删子节点。
- 662493 `expandNodeIdsForGroupCopy` 会对选中 child 补 parent、siblings 和祖先，随后展开组；21 的复制映射 parentId、childNodeIds 和内部 edges，只有根副本加位移。16015 `appendCopySuffix(data,isRoot)` 仅根节点 name / script title 加后缀，组内 child 名保留。Group 坐标、克隆、删除与布局由 Canvas domain/groups 实现，本目录不重复维护。

## 模块与接线

- `model.js`：读取当前节点/edges/model schema，保留逐节点模型、参数、提示词和引用，构造有序计划；`canvasGroupMembers` 同时兼容真实 parentId 和旧 childNodeIds，去重、循环防护、最大深度 8。显式 ordering 不得抢走其他父组的子节点。
- `runner.js`：无网络、无画布写入的依赖层执行协调器。`executeNode(id,{signal,generator,plan})` 必须由运营 adapter 返回明确终态 `{status:'success'|'failed'|'skipped'|'blocked',error?}`；undefined/false/未知状态不能视为成功。取消会结束本地等待，即使 adapter 忽略 signal，迟到结果也不恢复旧状态。
- `useCanvasBatch.js`：文档/group/readonly/ready 所有权、估算取消与重试、执行取消；可注入 `getDocument()` 在每节点启动前重取实际输入。`BatchRunDialog.jsx` 只接受实际 groupId，未接 executeNode 时明确未提交，没有假 AI 完成。停止是叠层确认，保留原参数和内容。
- `CanvasSelectionToolbar.jsx`：回调驱动的普通多选 UI；回调缺失即不显示动作。使用共享 toolbar popover 生命周期和原 hover 延迟。公开接口为 selectedIds/nodes/ready/readonly 与各动作 callbacks；具体签名见组件导出。组菜单关闭恢复焦点不触发 hover 菜单再次开启。
- `selection-actions.js`：Chat node references、选中节点 Skill 请求、v2 material、canonical library records、下载条目与 CSV 的纯转换。没有存储和真实任务请求；保存分组选项不会偷偷把全部 children 展开为资产，下载按源规则展开组。媒体多 URL 和独立文本保留完整 v2 payload，Picker 能重新使用。
- `CanvasSaveSelectionDialog.jsx`：props `{nodes,selectedIds,documentKey,projectId,onClose,onSaved?(savedAssets),ready=true,readonly=false}`。使用 `useAssetLibrary`，一次 functional setValue 原子保存 assets 与新增 tags，保留原 folders/资产。多项分别名称50字、共用位置和标签；projectUuid 保存在 local record。失败保留表单，读/解析/版本错误阻断，WRITE_FAILED 不禁止有效旧数据重试。提交前再次核对真实规范/旧 key 读取，避免跨 tab 事件尚未送达时覆盖刚损坏的数据。提交后消费回调异常不会重新保存或重复资产。
- `save-selection.css` / `batch.css` 独立引入、前缀隔离；弹窗沿用 EditorDialog / shared dialog-stack，无独立 focus trap 或 body 锁。原生音视频 controls 可键盘访问，IME Enter 不提交。

依赖方向为 UI → hook/纯 batch 模型 → generator 公共纯规则 / services / shared storage、dialog hooks；没有反向引用页面、App 或 Skill 私有组件。根代理负责的 `useCanvasSelectionActions`、NodeCanvas 接线和 ZIP service 不归本次子代理改动所有权。

## 明确适配与未验边界

- 默认保存到本机 canonical `libtv-asset-library` v1，不是原站创建成功。没有规范 key 时只读兼容 `libtv-assets`；损坏旧库不能作为空库继续写。新标签随资产一起本地提交，未模拟原站 tag API 的提前写入。
- 本地位置选择器使用现有文件夹路径，并提供明确「本地资产库根目录」用于没有文件夹的库；原 renderer 排除 root。此项是本地 adapter 的可操作入口，尚未复制原 FolderCascader 的目录新建/团队权限 UI，不能称为位置选择器逐像素等同原版。
- 保存预览为当前实际媒体/文本，脚本显示实际镜头数量；原嵌入 Canvas node preview、主题颜色、宽高和全部细节未逐像素浏览器比较。表单使用已确认字段和层级，没有添加无证据的团队写入或类别编辑接口。
- 原 runner 有账号算力、免费权益、实际任务轮询、既有任务等待、节点 incarnation/输入指纹检查、并发额度重试等服务逻辑；本地 coordinator 不替代这些服务。adapter 必须在提交及回写时继续核对 document/node/input 所有权并正确取消实际任务，不能只返回 success。特殊 script/enhance/subtitle 类型的运营 schema 尚未配置时显示明确错误，保留节点内容。
- 本地 pre-action 节点通过 `params.model` 兼容识别生成器；组内递归结合 parentId/childNodeIds 是旧快照适配。原 runGroup 的基础成员查询为直接 parentId children；递归适配和 maxDepth8 不是所有原生成服务已确认规则。
- source 下载明确水印权限与服务限制；本目录只产出实际数据与保护标记。ZIP、取消、字节获取及命名去重由实际下载服务处理。source CSV 分支是 script/storyboard，未把 script-v2 伪装成相同导出格式。
- 真实运营 executor、价格/权益估算、原站账号权限和真实任务取消尚未接入。本批使用真实 model schema 和合成图/存储夹具验证前端语义，不证明原站所有账号或服务分支。

## 定向验证

本批子代理六个测试文件、30 项测试：混合 schema 逐节点保留与真实引用、组成员/环/特殊类型/本地旧节点、并行层及独立失败分支、运行时节点删除/参数更新、取消/迟到/文档切换、缺服务和无效终态、费用加载/失败重试/真实零报价、共享叠层停止、原工具顺序/hover/键盘回焦点、完整 action payload/真实 Markdown/CSV、多项原子保存/50字/共享类别和标签、quota 保留重试、坏 legacy 与迟到损坏规范数据阻断、跨文档重置/位置移除、IME/取消/空内容，以及已提交后回调异常不重复写。

定向 Vitest、零警告 ESLint 和本批文件 Prettier 已验证；未使用浏览器或执行本轮全站检查。根代理后续的集成测试及浏览器记录不计入上述 30 项。
