# HTML / VTT 混合字幕来源（2026-10-16）

2026-10-18当前修正：下文“两条可编辑轨道并存”属于前批实现，现已按原站HTML编辑权收敛。HTML加载中/可用时列表和编辑轨道由HTML持有，VTT原数据保留；全部远程HTML被拒绝后回退VTT，重试恢复HTML前保存VTT末次输入。部分成功、稳定素材映射和投影保存后的历史也已接线，专项与实际App证据见 [编辑权审计](./canvas-subtitle-ownership-functional-audit.md)。不能再把完整“源侧选择器”假定为任意HTML/VTT切换器。

上一批HTML字幕接线把存在HTML来源误当成“只显示HTML”，因此同一视频片段同时提供`subtitleHtmlUrl`和`subtitleUrl`时会隐藏VTT。静态源函数`collectClipSubtitleSources`实际对每个非音频clip分别追加`kind: "html"`和`kind: "vtt"`，两类来源可以共存；摘录、位置和SHA保存在`artifacts/subtitle-mixed-source-evidence.json`。这是源代码静态证据，不执行原bundle或原站写逻辑。

本批新增`domain/subtitle-source-mode.js`纯分型：`html`、`vtt`、`mixed`和`empty`。HTML与VTT各自保留来源加载、取消、超时、缓存、错误状态；混合时预览继续输出HTML叠层与VTT文字层，时间轴同时显示两类轨道。HTML-only仍隐藏空VTT行，VTT-only仍使用既有基础VTT面板。没有把两份正文合并成一条，也没有用HTML覆盖VTT存档。

定向分型/异步来源/基础模型3文件16项通过，日志`artifacts/subtitle-mixed-targeted.log`，零警告lint为`artifacts/subtitle-mixed-lint.log`。随后Node24.19.0完整`npm run check` session40760 terminal0：**460文件/6562测试**，测试218.48s、标准build18.06s，格式/零警告lint/架构/核心strict通过；1376源码/config冻结逐文件一致，Canvas897382字节、ClipEditorWorkspace230231字节，900000预算未提高。完整日志`artifacts/subtitle-mixed-full-check.log`、证明`artifacts/subtitle-mixed-verification.json`。当前未新增独立GUI双来源样本：公开代表性视频只含一类实际字幕来源，避免伪造服务数据。后续接入运营服务时，adapter仍需提供来源身份和对应权限；本地混合分型不代表服务器写入、云锁或字幕生成已连接。

剩余边界：混合来源的列表/属性操作仍分属HTML和VTT面板，完整源侧选择器、VTT/HTML跨类型排序、同一时间窗的遮挡优先级、远程失败提示文案和真实双来源媒体样本需继续按原站观察。当前仍未部署，登录/小号不需要，整体复刻目标未完成。

2026-10-18后续收敛：`collectSubtitleSources` 已按源精确保留每片段HTML→VTT顺序、trim后的节点/URL/标签、复制片段各自身份、首个有效非音频来源的节点HTML回退及HTML关闭规则，HTML加载计划共用此入口。旧测试中无来源节点的合成片段已改为合法来源，未用clip ID猜node ID。源中存在 `htmlOwnsEditing` 约束，收集可共存不能推导为任意混合编辑；相关编辑权/降级仍是未完成项。本批还修复实际HTML侧栏切换时重建预览，专项和原生证据见 [侧栏生命周期审计](./canvas-subtitle-sidebar-lifecycle-audit.md)。
