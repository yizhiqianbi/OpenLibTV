# 路由与状态覆盖记录

## LibTV 通用后端与 Agent（2026-10-19）

新增 `/api/backend/[...path]` HTTPS 白名单代理、`api.agent` 客户端和 Canvas Agent 真实流式发送边界。内容、项目、资产、Skill、Canvas、生成任务、会话与 Agent 共用 `VITE_API_BASE_URL`；Agent 请求保留 ordered parts、引用、节点快照、模式 metadata、document revision 和 requestId，消费 `message.delta`、`message.completed`、`task`、`documentPatch`、`error`、`done` 事件。未配置运营后端时本地 fallback 保持原行为；配置后上游负责认证、所有权、CAS、持久化和模型任务，网络失败或冲突不会生成假 assistant。

代理回归覆盖路径白名单、同源变更、HTTPS 根地址、体积/超时、过滤 Cookie、ETag/If-Match 和 SSE/NDJSON 转发。当前只验证本地代理与客户端协议，`LIBTV_BACKEND_URL` 未配置，项目/资产/Skill/Canvas 云端持久化、真实生成任务和账号权限仍需要接入运营后端后验收。

## 叙梦 Agent API 可选适配（2026-10-18）

保留 `/xumeng` 页面与 `/api/xumeng/[...path]` 作为可选适配，角色卡、世界书、状态、记忆、会话、导入导出和流式对话走独立 API。角色卡导入兼容 `chara_card_v2` 及 `first_mes`、`system_prompt`、`character_book` 等 SillyTavern 蛇形字段；请求会校验文本长度、世界书条数/关键词、状态值、记忆数量、来源和协议白名单。代理不暴露密钥，未配置上游返回 503。

验证：叙梦代理、角色卡和流式协议定向回归 7 项，路由回归一并通过；格式、零警告 lint、核心 strict、生产构建通过；先前完整套件在本批接线版本通过 497 个测试文件/6735 项测试，最后增量协议回归通过。真实模型、认证、会话持久化、CAS、状态补丁和记忆写入仍由 `XUMENG_BACKEND_URL` 上游负责，当前工作区未配置真实服务，不能把本地代理测试视为生产能力。

## 当前验收范围冻结（2026-10-18）

用户已确认本轮不验收协作、远程配置、多语言以及触摸/Safari；这些项目不会继续降低桌面 Chromium、本地单用户前端工作流的完成度。登录注册、小号资源、真实生成、支付、云端写入和运营服务仍属于明确的服务边界，不能用本地演示替代。当前整体工程估算按已验证核心能力调整为 **约75%（72%–80%）**。当前工作区最新 `npm run check` 通过 **501 个测试文件、6751 项测试**，日志 `artifacts/current-continuation-full-check.log`；3D-BOX、Canvas 桌面浏览器回归见 `artifacts/current-continuation-verification.json`。下面带有更低比例的条目是历史批次记录，不覆盖本范围冻结。

## Canvas 显式 target 模式接线（2026-10-18）

参考拾取、区域聚焦、元素标记以及 ScriptV2 toolbar 的显式 target 已接入当前 Canvas：`CanvasViewport` 按普通单选与 reference → mark → focus target OR 规则计算资格，mode owner 负责候选/区域/点位、取消、遮罩、pointer 隔离和 graph CAS；ScriptV2 toolbar 与图片配置共享 eligibility。专项 **25 个测试文件 / 440 项通过**，证据见 `artifacts/canvas-explicit-target-verification.json`。这关闭的是本地桌面节点交互缺口，不包含真实生成、审核、上传、账号权限或服务端写入。

## Studio 浮动机位预览（2026-10-18）

监视器卡片现在可以打开桌面浮动机位预览：使用现有 Three monitor frame，显示机位标签，支持播放/暂停、关闭、标题栏拖动和边界限制；浮窗内部通过 `data-preview-pip` 隔离 pointer，不改变 Studio 文档和自动保存。Studio 域专项 **30 个测试文件 / 145 项通过**；最新完整检查 **498 文件 / 6739 测试**，3713 modules、build18.60s，日志 `artifacts/studio-pip-full-check.log`，证明 `artifacts/studio-floating-preview-verification.json`。真实生成/视频导出、云端写入仍属于服务边界。

## Studio WebM 视频导出（2026-10-19）

导出面板现在在存在动画时启用视频选项，调用当前 Three canvas 的 `captureStream` 与 `MediaRecorder`，按时间轴逐帧采样并下载 WebM；面板显示百分比进度并支持取消，能力不支持、无动画或录制失败时保留明确错误，不伪造云端成片。专项 **30 个测试文件 / 147 项通过**；最新完整检查 **499 文件 / 6744 测试**，3714 modules、build13.96s，日志 `artifacts/studio-video-progress-full-check.log`，证明 `artifacts/studio-video-export-verification.json`。服务端渲染和云端交付仍是服务边界。

## Studio 导入子树副本（2026-10-18）

导入 GLB 的子树现在可以在 Inspector 创建副本，并通过复制/粘贴复用；副本以稳定 copy ID 保存在本地项目，Outliner 可继续选中、改名、改位置/旋转/缩放、删除和撤销，Three runtime 为副本克隆独立 geometry/material，GLB 导出也包含副本。源 GLB data URL、source path 和原始 subtree metadata 保持不变。Studio 域专项 **29 文件/143 项**通过；最新完整检查 **495 文件/6727 测试**，测试193.43s/build13.61s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过，日志 `artifacts/studio-subtree-copy-full-check.log`，证明 `artifacts/studio-subtree-copy-verification.json`。本地副本不等于协作锁、云端项目写入、远程同步或原始导入动画轨道编辑。

## 选中边、混合删除与剪辑断线已收敛（2026-10-18）

当前实现已把选中边 Delete/Backspace、node+edge 混合删除、分镜关联确认和 VIDEO/AUDIO→VIDEO_CLIP 断线接入同一生命周期协调器：初始确认、分阶段提交、局部取消、末次草稿、历史分段、owner 退休及本地 lease 均有明确边界。`NodeCanvas.selected-delete.integration.test.jsx` 真实 App 回归覆盖 19 项，另有 19 份桌面/390px GUI 文档覆盖混合删除、断线、撤销/重做与冷刷新；Node24.19.0 完整 `npm run check` 通过 **407 文件/5862 测试**，日志 `artifacts/canvas-selected-delete-validated-check.log`，审计见 [canvas-selected-delete-functional-audit.md](./canvas-selected-delete-functional-audit.md)。这证明本地前端事务，不代表云锁、协作、媒体合成或服务端写入。完整 clip renderer、特殊 renderer、真实生成/导出服务仍是剩余范围。

## 画布资产库媒体类型（2026-10-18）

资产库按当前标签解析兼容媒体字段：图片/角色读取封面或图片 URL，视频读取视频输出，音频读取音频 URL；视频记录在音频标签下被过滤。点击音频资产会创建 `audio` 节点并保存其 URL，无匹配媒体时保留上传空态。定向 `CanvasDialogs.test.jsx` **1 文件/5 项**通过；最新完整检查 **495 文件/6724 测试**，测试201.71s/build14.71s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过，日志 `artifacts/canvas-asset-library-media-kind-check-final.log`，证明 `artifacts/canvas-asset-library-media-kind-verification.json`。该批仍不接真实上传、生成、账号或服务端写入，CanvasPage 既有分包提示未改变。

## 画布资产库状态与重试（2026-10-18）

画布资产库弹窗现在区分加载中、读取失败可重试和成功但为空三种状态，并正确读取公开图库 `{items: [...]}` 包装；重复打开/重试使用请求序号，旧目录结果不能覆盖新请求。定向 NodeCanvas 与 CanvasDialogs 共 **2 文件/30 项**通过；最新完整检查 **495 文件/6722 测试**，测试182.22s/build13.65s，格式/零警告 lint/核心 strict/生产构建通过，日志 `artifacts/canvas-asset-library-envelope-final-full-check.log`，证明 `artifacts/canvas-asset-library-verification.json`。该批不改变资产目录只读适配器、上传、生成或服务端写入边界，CanvasPage 903.55kB 分包提示仍保留。

## 分镜历史图片选择器数据兼容（2026-10-18）

分镜宫格历史图片选择器现在兼容顶层 `items` 与 `{data:{items}}` 包装；真实宫格插入、空位位置、关闭回焦点和撤销保持原协议。定向 **1 文件/5 项**通过；最新完整检查 **495 文件/6722 测试**，测试169.78s/build13.12s，格式/零警告 lint/核心 strict/生产构建通过，日志 `artifacts/storyboard-history-envelope-recheck-full-check.log`，证明 `artifacts/storyboard-history-envelope-verification.json`。历史目录仍是只读内容适配器，不代表真实上传、生成或服务端写入完成。


## 画布节点搜索空态（2026-10-18）

搜索节点弹窗现在区分两种空态：没有节点时显示“暂无节点”，有节点但搜索无匹配时显示“暂无匹配节点”。定向 **2项**通过；最新完整检查 **495文件/6719测试**，测试194.04s/build12.65s，格式/零警告 lint/核心 strict/生产构建通过，日志 `artifacts/canvas-dialog-search-full-check.log`，证明 `artifacts/canvas-dialog-search-verification.json`。该维护只影响搜索视图，不改变图数据、连线或历史。

## L2 字幕转为可编辑（2026-10-18）

L2 HTML 字幕已补齐显式转换入口：先弹窗确认，再保留正文、时间与布局，移除脚本/动画入口并沿既有本地 CAS、自动保存和撤销/重做事务写入一次 HTML 存档；取消或保存失败继续保持只读原文。专项 **2文件/20项**，Chromium 合成 L2 HTML 源验证确认/取消、实际可编辑、动画清理、同一 video、一次 undo/redo 和390px无横溢。完整检查 **494文件/6717测试**，测试148.66s/build10.51s，3709 modules，日志 `artifacts/subtitle-l2-full-check.log`，证据 `artifacts/subtitle-l2-verification.json`。按用户最新范围，协作、远程配置、多语言及触摸/Safari不再作为扣分项；当前整体约75%（72%-80%）。复杂CSS/runtime、字幕生成/导出和真实服务仍不在本地实现中。

## VTT→HTML迁移与等待期间历史（2026-10-18）

VTT编辑现按来源片段、重复实例、时间逆映射、样式和四轨限制做全有或全无迁移；来源未就绪时保存VTT及pending history，失败回退VTT，成功后HTML接管且VTT保留fallback。专项 **58文件/735项**，实际Chromium合成VTT源完成HTML archive、入口接管、同video、undo/redo和390px。最终完整检查 **494文件/6714测试**、测试162.70s/build15.33s、3709modules，格式/零警告lint/架构/core strict通过，1436份源码/config无漂移；日志`artifacts/subtitle-migration-full-check.log`与 [迁移审计](./canvas-subtitle-vtt-migration-audit.md)。Canvas902.55kB警告仍保留；完整降级、remote-config、L2、多语言、复杂runtime、触摸/Safari和真实服务仍未完成。本机未部署，整体约70%不变。

## 旧HTML字幕兼容、升级与预览（2026-10-18）

字幕现独立按源读取旧/缺省契约、根回退、缺失ID、轨道/时基和非致命诊断；普通文字仍严格。片段物化后才升级未绑定工作文档，已有绑定v3保留内部版本，实际编辑前不存档；未知总时长与透明iframe问题已补。专项 **56文件/715项**，三个Chromium合成旧格式样本完成实际保存确认、一次撤销/重做、刷新恢复、URL/片段关联、同一video和390px验证。完整检查session17461 exit0：**492文件/6694测试**、215.43s/build18.02s，格式/lint/架构/核心strict通过，1431份源码/config无漂移，Canvas901.36kB提示保留。日志`artifacts/subtitle-legacy-full-check.log`与 [审计](./canvas-subtitle-legacy-functional-audit.md)。下方“旧版本尚缺”属于此前批次；完整VTT→HTML迁移、remote-config、多语言/任意runtime、重复ID歧义和触摸/Safari仍未完成。本机未部署，整体约70%（65%-75%）不变。

## 字幕样式兼容与只读限制（2026-10-18）

固定CSS/inline样式已接变量fallback改写，保留原始默认值、important、未知声明和动画；L1只禁用受限属性，L2禁止写入但可选择/定位，预设及应用全部按源跳过受限字段。部分来源失败仍可编辑有效层。专项 **54文件/694项**，Chromium三种合成样本验证真实iframe样式、实际保存、一次undo/redo、同一播放器及390px布局。最终完整检查 **490文件/6673测试**、测试352.20s/build15.18s，格式/零警告lint/架构/核心strict通过，1427份源码/config无漂移；日志`artifacts/subtitle-style-compatibility-final-full-check.log`及 [审计](./canvas-subtitle-style-compatibility-audit.md)。首轮磁盘ENOSPC和分组5000ms超时保留，清理可再生缓存后原测试未修改而重跑通过。Canvas901.36kB提示未隐藏，本机未部署。L0/L1/L2是可注入性分级，旧契约版本/完整迁移仍缺；L2转换实际入口待核实，复杂CSS/runtime、remote-config、多语言和触摸/Safari仍需继续。整体约70%（65%-75%）不变。

## 最新评估与混合字幕编辑权（2026-10-18）

按用户当前范围（前端全部功能和交互，内容数量、暂缓的登录注册及真实后台执行不计分），整体仍估算 **约70%，合理区间65%-75%**。公开浏览页面约85%-90%，项目/资产/Skill常规本地管理约75%-85%，Canvas/Agent复杂创作约65%-75%，3D/Studio完整工具流程约45%-60%。这是基于证据与产品复杂度的工程判断，没有原站全部状态的完整分母；独立影游扩展和测试数量不为原站复刻加分。最近批次主要关闭字幕来源、失败恢复、历史与预览生命周期缺陷，提高已有流程可靠性，尚不足以把整体上调到80%。

混合字幕现按编辑权选择HTML或VTT，不再同时开放两套编辑轨道；部分成功保留有效HTML层，全部远程HTML拒绝后回退VTT，重试先提交末次输入。修复自动保存确认后丢失正文撤销基线、媒体初始化重读与素材映射回调不稳定。专项 **53文件/680项**通过；隔离Chromium合成双来源样本验证503→显式重试恢复、6.5秒请求稳定、同一播放器、实际保存及一次undo/redo、390px无横向溢出。最终全量日志 **489文件/6659测试**、测试232.56s/build21.27s，格式/零警告lint/架构/核心strict通过，1425份source/config无漂移；原进程句柄已回收，不另称捕获exit code。日志`artifacts/subtitle-ownership-final-full-check.log`与 [当前审计](./canvas-subtitle-ownership-functional-audit.md)。CanvasPage901.36kB提示保留；旧字幕版本/完整迁移、原remote-config、多语言、Studio完整材质/骨架/轨道、团队与高级权限前端、触控/Safari和大文档验收仍有缺口。本机新增修复未部署；下方历史剩余项以对应后续更新为准。

## 字幕来源与侧栏连续性（2026-10-18）

已按公开静态源统一每片段HTML→VTT来源顺序、trim后的节点/URL/标签、重复片段身份、节点HTML回退和纯协议HTML开关；HTML加载计划共用收集入口并保留规范存档/显式清空。修复字幕列表/样式切换时重建预览，隐藏样式关闭预设状态，页头切换恢复焦点，列表默认宽度按源修正为300px。专项 **52文件/671项**通过；真实Chromium1280/390验证播放器、iframe及Document身份和暂停位置0.4秒不变、焦点恢复、无横向溢出，控制台无错误/警告。Node24.19.0完整`npm run check` session65313 terminal0：**488文件/6650测试**，测试152.98s/build12.09s，格式/零警告lint/架构/核心strict通过，Vite3702 modules。日志 `artifacts/subtitle-sidebar-lifecycle-full-check.log`、证明 `artifacts/subtitle-sidebar-lifecycle-verification.json`，范围见 [侧栏审计](./canvas-subtitle-sidebar-lifecycle-audit.md)。CanvasPage900.44kB分包提示保留，未抬阈值；混合编辑权/降级/迁移、原remote-config、旧字幕版本、多语言、触摸/Safari与真实服务仍缺，本机未部署。总体估算仍约70%（65%-75%），不按测试增长上调。

## Code Agent MCP 工具桥（2026-10-16）

当前 checkout 新增本地只读 MCP stdio server：`scripts/penstudio-mcp-server.mjs`。通过 `.codex-plugin/plugin.json` 与 `.mcp.json` 可作为 Code Agent 插件注册，工具覆盖能力边界、路由列表/解析、`public/data` 快照列表/读取/搜索；`get_content` 支持 JSON Pointer 与结果限幅。`npm run test:mcp` 的 3 项 node:test 已验证初始化、工具发现、stdio 调用、路由别名、路径穿越拒绝和代表性快照搜索。该桥不读取浏览器本地项目，不接账号授权、生成、支付或任何生产写入，不能替代真实 MCP 后端。

## 当前 Vercel 生产更新（2026-10-16）

10 月 16 日当前工作区已通过 Node24.19.0 `npm run check`：483 个测试文件、6623 项测试全部通过；随后发布 `dpl_B4TDynikaEvefBAdbtz44ZM9fqc6`，产物2563文件/94,192,140字节，低于95 MB硬上限。Functions、config/routes保留，代表性内容收敛为gallery1、canvas snapshot1、skills13、tutorial1、articles4、masterclass1、activities2、features2、chatShare1。报告 `artifacts/vercel-package-report.json`，部署结果 `artifacts/oct16-production-deploy.json`。

线上复验通过首页、`/animation-preview?newProject=true`、`/interactive-film`、匿名试玩、`/canvas`、`/skill`、`/assets`、models及gzip画布；四个影游 Function 的 GET 方法门控符合预期，缺失 release 返回函数404。互动影游编辑器与匿名试玩实际浏览器加载成功，试玩视频节点为1。证据 `artifacts/oct16-production-http-verification.json`、`artifacts/oct16-production-play.jpg`。真实上传/complete、跨设备同步、原站生成/支付仍未接入。

## 当前 Vercel 生产更新（2026-10-14）

当前本机HTML字幕混合来源、高亮与同栏侧栏接线已通过Node24.19.0完整460文件/6562项检查及标准生产构建，准确范围见下方验证；生产仍是此前已验证的代表性包，未因本批本地剪辑改动自动重新发布到 [PenStudio](https://penstudio-libtv.vercel.app/)。现行部署 `dpl_3wkfrjAvEnsqBEYeDWkieUkEHm6V` READY，产物2621文件/89,998,819字节；报告 `artifacts/vercel-package-report.json`，部署日志 `artifacts/current-production-deploy.log`。

线上已复验首页、`/interactive-film` 编辑器、匿名试玩 `/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3`，以及首页/编辑器/试玩深链 200；`/api/film/start` 的 GET 返回预期405，未知影游 release 返回404。浏览器匿名试玩显示视频播放器与暂停/继续/静音/全屏控件；首页无自动促销弹窗。此轮验证不代表真实上传、发布密钥、跨设备同步或原站生成/支付已接入。

## 当前复刻进度估算（2026-10-18复核）

2026-10-17 预览几何操作维护已验：依据公开客户端的 transform move/width/scale handles 与 `xPct`/`yPct`/`maxWidthPct`/`scalePct` layout patch，普通文字与 HTML 字幕的选中 cue 现在可在实际预览画面内拖动位置、调整宽度和缩放；每次手势固定按按下时布局计算，连续移动不累加误差，结束进入现有单次历史/CAS，Escape/取消回滚。VTT 位置编辑仍按源证据保持 unsupported。专项 4 文件/12 项通过；Node24.19.0 完整 `npm run check` 实际通过 **487 文件/6643 测试**，测试168.04s、标准build13.55s，格式/零警告lint/架构/核心strict通过，Vite3702 modules；证据见 [预览几何验证](../artifacts/clip-preview-geometry-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；触摸/跨浏览器拖动、完整远程预设/字体运营目录、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-17 Studio 本地关键帧编辑维护已验：已有本地位置/旋转/缩放关键帧在当前时间可编辑，Inspector 展示插值后的当前值，提交只 patch 命中的 keyframe，离开关键帧时间仍锁定基础属性；操作沿用现有 snapshot history、autosave 和刷新恢复。导入 GLB 原始 AnimationClip 轨道仍明确 unsupported。专项 2 文件/19 项通过；Node24.19.0 最终重跑完整 `npm run check` 实际通过 **487 文件/6645 测试**，测试138.75s、标准build11.62s，格式/零警告lint/架构/核心strict通过，Vite3702 modules；证据见 [Studio 关键帧验证](../artifacts/studio-keyframe-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；云端动画 mutation、GLB轨道编辑和服务端导出仍未接入，整体区间仍约70%。

2026-10-16 文字/字幕轨道重排维护已验：普通文字与 HTML 字幕的已有轨道提供键盘可达上移/下移，`reorderTracks` 单次 patch 同步 cue、嵌套轨道、z-index、隐藏状态和 overlay group anchor，非法顺序整体拒绝。定向 2 文件/29 项通过；Node24.19.0 完整 `npm run check` 通过 **483 文件/6626 测试**，Vite 3698 modules、标准 build 13.92s；证据见 [轨道重排验证](../artifacts/clip-track-reorder-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整轨道新增/拖拽连续重排、字体/预设远程目录、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 文字/字幕新增轨道维护已验：普通文字与 HTML 字幕在选择轨道状态下可创建下一个连续轨道，分别遵守 8 条与 4 条上限；跳号、超限、无效请求保留原文档，成功写入既有历史/CAS/刷新恢复。定向 4 文件/53 项通过；Node24.19.0 完整 `npm run check` 通过 **483 文件/6629 测试**，Vite 3698 modules、标准 build 13.75s；证据见 [新增轨道验证](../artifacts/clip-track-create-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整拖拽连续重排、字体/预设远程目录、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 文字/字幕连续拖动重排维护已验：轨道把手支持原生拖动到目标行，普通文字与 HTML 字幕共用 `moveTrackOrder`，drop 进入 `reorderTracks`，并与片段移动/裁切手势隔离。定向 5 文件/55 项通过；Node24.19.0 完整 `npm run check` 通过 **484 文件/6631 测试**，Vite 3698 modules、标准 build 15.36s；证据见 [拖动重排验证](../artifacts/clip-track-drag-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；触摸/跨浏览器拖放、字体/预设远程目录、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 文字字体目录维护已验：普通文字与 HTML 字幕样式面板新增可注入只读 `fontSource.load({signal})`，支持取消、错误重试、字段校验和远程字体选项，保留 fallback，未伪造运营目录。定向 2 文件/13 项通过；Node24.19.0 完整 `npm run check` 通过 **485 文件/6636 测试**，Vite 3698 modules、标准 build 12.72s；证据见 [字体目录验证](../artifacts/clip-font-directory-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；真实字体资源加载、完整预设 remote-config、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 文字字体资源维护已验：字体目录 HTTPS 资源由可取消 `FontFace` loader 加入浏览器字体集合，单个失败显示部分失败并保留 fallback，source 变更/卸载会清理 face。定向 2 文件/14 项通过；Node24.19.0 完整 `npm run check` 通过 **485 文件/6637 测试**，Vite 3698 modules、标准 build 10.37s；证据见 [字体资源验证](../artifacts/clip-font-resource-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整预设 remote-config、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 文字预设字段维护已验：预设/应用全部协议支持 paddingTop/Right/Bottom/Left 四边字段，按输出比例完成像素换算、写入和回读，沿用单次历史/CAS。定向 3 文件/32 项通过；Node24.19.0 完整 `npm run check` 通过 **485 文件/6637 测试**，Vite 3698 modules、标准 build 10.50s；证据见 [预设字段验证](../artifacts/clip-text-preset-fields-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整 remote-config 的 shadow/padding/语言目录、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-17 VTT 字幕字体目录维护已验：基础 VTT 字幕面板与普通文字/HTML 字幕共用只读 `fontSource`，支持目录取消、错误重试、fallback 和可取消 HTTPS `FontFace` 加载，工作区已贯通三种面板。定向 3 文件/20 项通过；Node24.19.0 完整 `npm run check` 通过 **485 文件/6638 测试**，Vite 3698 modules、标准 build 12.14s；证据见 [VTT 字体目录验证](../artifacts/clip-vtt-font-directory-verification.json)。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整字体运营目录、预设 remote-config、字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 剪辑器音频波形维护已验：按公开 `waveformService.getPeaks` / `extractPeaks` / `drawAudioWaveform` 证据，音频片段现在对可访问 URL 使用浏览器 AudioContext 提取真实多声道 min/max 峰值并绘制 SVG 波形；已有峰值 source 可直接渲染。波形只在视图缓存中存在，不进入时间轴文档、历史、CAS 或恢复副本；读取失败、取消、无 AudioContext、全无效采样和 CORS 不可达时保留片段和增益线，不绘制假样本。定向 3 文件/43 项通过；Node24.19.0 完整 `npm run check` 通过 **475 文件/6605 测试**，Vite 3695 modules、标准 build 12.39s；证据见 [剪辑器波形审计](./canvas-clip-editor-functional-audit.md) 与 `artifacts/clip-waveform-verification.json`。视频内嵌音轨全量波形、远程跨域、Safari/真机和服务端导出仍未接入，整体区间仍约70%。

2026-10-16 视频片段内嵌波形维护已验：按公开 `drawVideoClipBottomWaveform` 与 `embedAudioMuted` 门控，选中的视频片段现在按需显示底部内嵌音频波形；未选中视频不主动读取，失败或静音回退现有 poster/编辑能力。定向 2 文件/40 项通过；Node24.19.0 最终完整 `npm run check` 通过 **477 文件/6612 测试**，Vite 3698 modules、标准 build 11.32s；证据见 [剪辑器审计](./canvas-clip-editor-functional-audit.md) 与 `artifacts/clip-video-waveform-verification.json`。远程跨域视频、所有 codec、Safari/真机和服务端媒体缓存仍未接入，整体区间仍约70%。

2026-10-16 剪辑器视频帧缩略图维护已验：按公开 `thumbnailStore` / `videoFrameCache` / `drawVideoThumbnails` 证据，视频片段现在按源偏移、片段时长和速度抽取最多 6 帧并渲染真实 filmstrip；读取失败、取消、CORS、编解码不支持和无效地址回退 poster，帧只存在视图缓存。定向 3 文件/40 项通过；Node24.19.0 完整 `npm run check` 通过 **477 文件/6611 测试**，Vite 3698 modules、标准 build 13.26s；证据见 [剪辑器审计](./canvas-clip-editor-functional-audit.md) 与 `artifacts/clip-thumbnail-verification.json`。远程跨域视频、所有浏览器 codec、Safari/真机和服务端媒体缓存仍未接入，整体区间仍约70%。

2026-10-16 Studio 材质参数维护已验：原站公开 `object.material.set` 契约包含 baseColor、metallic、roughness 和透明度；本地 Inspector 现在提供金属度、粗糙度、不透明度、透明材质和深度写入控件，沿用现有 materialPatch、history、autosave、刷新恢复和 GLB source 覆盖。定向 2 文件/16 项通过；Node24.19.0 完整 `npm run check` 通过 **477 文件/6611 测试**，Vite 3698 modules、标准 build 12.62s；证据见 [Studio 审计](../src/features/studio/SOURCE_AUDIT.md) 与 `artifacts/studio-material-verification.json`。纹理、多材质槽、骨架、动画轨道属性、原站可见面板逐像素和服务端 mutation 仍缺，整体区间仍约70%。

2026-10-16 学院商品页重试维护已验：商品信息失败和简介失败均显示可操作的“重试”，只重新读取当前资源，不创建支付、登录、购买或已购状态。定向 2 文件/10 项通过；Node24.19.0 完整 `npm run check` 通过 **477 文件/6613 测试**，Vite 3698 modules、标准 build 12.20s；证据见 [学院审计](./academy-course-functional-audit.md) 与 `artifacts/academy-product-retry-verification.json`。真实商品接口、订单、认证和课程权益仍未接入，整体区间仍约70%。

2026-10-16 Seedance 验证页重试维护已验：查询失败状态新增明确“重试”按钮，重新进入 loading，仍保持官方查询服务未接入和只读边界。定向 2 文件/3 项通过；Node24.19.0 完整 `npm run check` 通过 **478 文件/6614 测试**，Vite 3698 modules、标准 build 11.44s；证据见 `artifacts/seedance-retry-verification.json`。真实任务查询、账号和生成服务仍未接入，整体区间仍约70%。

2026-10-16 MCP 授权页重试维护已验：授权提交失败状态新增明确“重试”按钮，重新进入提交中状态，保持 OAuth callback、token、账号和 MCP 服务未接入边界。定向 2 文件/4 项通过；Node24.19.0 完整 `npm run check` 通过 **478 文件/6615 测试**，Vite 3698 modules、标准 build 11.53s；证据见 `artifacts/mcp-retry-verification.json`。真实授权服务仍未接入，整体区间仍约70%。

2026-10-16 作品详情错误边界维护已验：详情页现在区分统一内容资源的加载、找不到和读取失败；详情、图库列表或初始样本失败时显示“作品加载失败”和“重试”，重试只重新读取失败资源并保留返回 TV Show。定向 2 文件/4 项通过；Node24.19.0 完整 `npm run check` 通过 **479 文件/6616 测试**，Vite 3698 modules、标准 build 11.46s；证据见 `artifacts/detail-retry-verification.json`。真实作品接口、账号写入和运营服务仍未接入，整体区间仍约70%。

2026-10-16 用户主页错误边界维护已验：公开用户主页现在区分 loading、读取失败和可重试状态；图库、公开作品、用户资料或外壳配置失败且没有可展示资料时显示“用户主页加载失败”和“重试”，只刷新失败资源。定向 3 文件/5 项通过；Node24.19.0 完整 `npm run check` 通过 **480 文件/6617 测试**，Vite 3698 modules、标准 build 11.52s；证据见 `artifacts/profile-retry-verification.json`。真实关注、账号资料和作品服务仍未接入，整体区间仍约70%。

2026-10-16 首页内容错误边界维护已验：首页现在区分 loading、读取失败和可重试状态；首页配置未成功读取时不再静默显示空壳，重试只重新读取首页内容，已有缓存内容继续显示。定向 3 文件/3 项通过；Node24.19.0 完整 `npm run check` 通过 **481 文件/6618 测试**，Vite 3698 modules、标准 build 11.69s；证据见 `artifacts/home-retry-verification.json`。真实首页运营内容、生成和账号服务仍未接入，整体区间仍约70%。

2026-10-16 3D-BOX 入口错误边界维护已验：`/3d-box` 现在区分 loading、读取失败和可重试状态；3D-BOX 配置失败时不再静默显示空壳，重试只重新读取外壳配置。定向 2 文件/12 项通过；Node24.19.0 完整 `npm run check` 通过 **482 文件/6619 测试**，Vite 3698 modules、标准 build 15.24s；证据见 `artifacts/studio-landing-retry-verification.json`。真实生成、项目写入和账号服务仍未接入，整体区间仍约70%。

2026-10-16 会员弹窗错误边界维护已验：会员/积分弹窗现在区分 loading、读取失败和可重试状态；会员配置失败时保留弹窗外壳并提供“重试”，已有缓存套餐继续显示。定向 2 文件/8 项通过；Node24.19.0 完整 `npm run check` 通过 **483 文件/6620 测试**，Vite 3698 modules、标准 build 14.75s；证据见 `artifacts/membership-retry-verification.json`。真实认证、支付、订单和会员写服务仍未接入，整体区间仍约70%。

2026-10-16 源片段字幕操作维护已验：依据公开片段右键分支，VTT 与 HTML 字幕均保留片段来源；片段菜单可隐藏/显示或删除当前片段字幕，VTT 走字幕编辑协议，HTML 走独立 patch，操作复用字幕 CAS、历史和刷新恢复，其他片段保持不变。定向 2 文件/38 项通过；Node24.19.0 完整 `npm run check` 通过 **483 文件/6623 测试**，Vite 3698 modules、标准 build 15.03s；证据见 `artifacts/clip-subtitle-clip-actions-verification.json`。CanvasPage 900.41 kB 的分包提示仍保留且未抬高阈值；字幕生成、云端写入和真实导出仍未接入，整体区间仍约70%。

2026-10-16 最新字幕高亮与侧栏批次已关闭前一轮布局差距：逐词高亮、Mantine双alpha色盘、source word start/duration、真实CSS预览、颜色/开关历史与同栏列表/样式切换均已接。真实桌面/390px操作验收后，Node24.19.0完整check session87968 terminal0：**459文件/6559测试**，01:43:25开始、测试413.89s/标准build33.47s；格式/零警告lint/架构/核心strict通过，1374源码/config指纹未变、Canvas897382字节，900000预算不改。日志 `artifacts/subtitle-sidebar-full-check.log`、proof `artifacts/subtitle-sidebar-verification.json`；源正文摘录与窄屏/焦点/alpha/存档证据见 [字幕高亮与侧栏审计](./canvas-subtitle-highlight-audit.md)。旧457/6544、41/646项均为前批历史；本机未部署、无需账号，旧字幕版本分类/混合优先级/完整轨道/字体预设/真机Safari/真实服务仍缺，整体仍约70%。

2026-10-16 混合字幕来源批次已验：静态源确认同一非音频片段可同时提供HTML与VTT；`subtitle-source-mode`保留两类来源的独立加载、取消、缓存、错误和预览层，混合时间轴同时显示HTML叠层与VTT文字轨道。定向3文件/16项通过；Node24.19.0完整check session40760 terminal0：**460文件/6562测试**，测试218.48s/标准build18.06s，格式/零警告lint/架构/核心strict通过，1376源码/config指纹无漂移、Canvas897382/ClipEditorWorkspace230231字节，900000预算不改。日志 `artifacts/subtitle-mixed-full-check.log`、proof `artifacts/subtitle-mixed-verification.json`；尚未有独立GUI双来源媒体样本，完整源侧选择器/排序优先级、真机Safari与运营服务仍缺，本机未部署、无需账号，整体仍约70%。

2026-10-16 音视频分离批次已验：右键菜单按源能力显示，浏览器 AudioContext 将可读取的视频内嵌音轨编码为真实PCM WAV，上传为本地音频源节点，时间轴将其与原片段对齐并写入 `embedAudioMuted`；取消、无音轨、已分离、准备失败和历史/CAS边界均保留。定向5文件/94项通过；Node24.19.0完整check session77892 terminal0：**463文件/6570测试**，测试207.13s/标准build15.67s，格式/零警告lint/架构/核心strict通过，1382源码/config冻结无漂移、Canvas899867/ClipEditorWorkspace230417字节，900000预算不改。日志 `artifacts/audio-separation-final-check.log`、proof `artifacts/audio-separation-verification.json`；人声分离、远程CORS/运营服务、独立GUI媒体分离样本和真机Safari仍缺，本机未部署、无需账号，整体仍约70%。

2026-10-16 人声分离入口批次已验：按源文案接入三种保留模式的右键子菜单、纯模型选择和三分钟/无音轨/重复处理门控；当前没有真实运营服务时提示未连接，不写入假任务或假媒体结果。定向3文件/90项通过；Node24.19.0完整check session75730 terminal0：**464文件/6573测试**，测试135.76s/标准build11.52s，格式/零警告lint/架构/核心strict通过，1385源码/config冻结无漂移、Canvas899943/ClipEditorWorkspace230942字节，900000预算不改。日志 `artifacts/vocal-separation-final-check.log`、proof `artifacts/vocal-separation-verification.json`；源证据 `artifacts/vocal-separation-source-evidence.json`。真实人声分离服务/结果回写、独立GUI媒体样本和真机Safari仍缺，本机未部署、无需账号，整体仍约70%。

2026-10-16 剪辑工程导出批次已验：导出按钮可生成本地 `.libtv.json`，保留时间轴、轨道控制、片段参数和素材 URL；空时间轴、缺失 URL、blob 素材按源错误文案阻断。定向3文件/92项通过；Node24.19.0完整check session95319 terminal0：**465文件/6577测试**，测试143.94s/标准build12.15s，格式/零警告lint/架构/核心strict通过，1387源码/config冻结无漂移、Canvas899975/ClipEditorWorkspace232051字节，900000预算不改。日志 `artifacts/clip-export-final-check.log`、proof `artifacts/clip-export-verification.json`；源证据 `artifacts/clip-export-source-evidence.json`。远程 PR/成片/运营导出服务、独立GUI下载截图和真机Safari仍缺，本机未部署、无需账号，整体仍约70%。

2026-10-16 最新HTML字幕实际App批次已验：来源读取/重试/取消、列表/样式、源时间轨道移动裁边、split/duplicate与meta原子保存、末次输入、历史和实际预览已接。复制后loaded丢失和播放保存误报冲突两项真实问题已修；专项39文件/631项及追加过期投影拒绝后的52项通过。最终Node24.19.0完整check session50294 terminal0：**457文件/6544测试**，00:13:34开始、测试299.68s/标准build21.87s，格式/零警告lint/架构/核心strict通过；1367源码/config指纹未变、Canvas897073字节，900000预算不改，日志 `artifacts/html-subtitle-app-full-check.log`。原生桌面/390、连续播放/源时钟、刷新/最后删除/历史/焦点和保留的失败记录见 [App字幕验收](./canvas-html-subtitle-app-audit.md)。旧版本分类/高亮alpha/完整字体预设与轨道/自定义runtime仍缺，整体保守估算仍约70%，本机未部署、无需账号；strict非全部JSX、统计含独立影游、CI未远端执行。下段“接线进行中”与453/6510为此前历史。

本次进度复核仍报约70%（65%-75%），分域权重与范围见下表。HTML字幕来源、混合来源分型、列表/样式、预览、末次输入、逐词高亮、透明度色盘和同栏侧栏已按上方最新批次验收；旧的“接线进行中”段落保留为历史过程，不作为当前状态。上述比例只评本机原站前端功能，不含内容数量、延期认证、真实后台执行或独立影游扩展；本批未部署。

HTML字幕底层新增v4 source/timeline、clip/meta/4轨、source窗口/新增、clone/retag/delete、split/duplicate与多文档原子事务，独立scriptless预览文档按clip/隐藏/源时间工作。专项33文件/575项、Chromium协议12项通过；最终Node24.19.0完整check session18062 terminal0：**453文件/6510测试**、格式/零警告lint/架构/核心strict与标准build23.54s通过，1355源码/config指纹未变、Canvas895155字节。日志 `artifacts/html-subtitle-contract-full-check.log`；首轮主动停止143、最终带空白属性原生复验和明确范围见 [HTML字幕协议](./canvas-html-subtitle-contract-audit.md)。尚未接App的HTML字幕source/archive、列表/属性/轨道、CAS/history与实际播放器，不计为完整字幕工具；底层测试不提高整体约70%估算。统计含独立影游、strict非全部JSX、CI未远端执行、本机未部署；下方452/6493为前批。

普通文字数值/颜色本批已接原整条绝对映射与min-relative步进、编辑确认/取消/Shift/keyup及native swatch的hex/alpha和一次blur。typed pending保存、pointer中间值保原时间轴、独立token和精确投影取消进入同一CAS/历史；专项32文件/558项、角色库联合33文件/570项通过。最终Node24.19.0完整check session82598 terminal0：**452文件/6493测试**、格式/零警告lint/架构/核心strict及标准build38.94s通过；1351源码/config指纹未变，Canvas895155字节，日志 `artifacts/clip-numeric-full-check.log`。首轮旧角色库基线失败/明确复现/修正，原生拖动/刷新/undo/390/焦点与未验后台/OS色盘/真机、仍缺HTML字幕等见 [控件验收](./canvas-text-controls-functional-audit.md)。下方450/6478为前批冻结；strict非全部JSX、CI未远端执行，整体仍约70%，本机未部署。

普通文字高级属性本批补齐背景颜色/alpha/圆角/模糊、九种非空CSS动画、应用到所有、折叠区段/滚动锚点与页头删除blur，源像素换算/两位小数与百分比行高已修正。专项30文件/543项通过；最终Node24.19.0完整check session65446 terminal0：**450文件/6478测试**、格式/零警告lint/架构/核心strict与标准build18.36s通过；1345源码/config指纹未变，Canvas894054字节，日志 `artifacts/clip-text-advanced-full-check.log`，下方449/6468为前批。实际CSS seek/回弹/wave、刷新/一次undo/390/焦点与剩余控件/字体/HTML字幕等范围见 [高级属性验收](./canvas-text-advanced-functional-audit.md)。普通文字没有字幕专属高亮，不将自定义script的metadata保留当真实动画支持；strict非全部JSX、CI未远端执行、整体估算仍约70%、本机未部署。

普通文字工具现已接App：正文、布局/文字样式、独立HTML轨道/拖动裁边、单次历史/CAS、最后输入/pagehide和scriptless双iframe预览。精确草稿投影误判冲突、拖动中间值保存和原生转场准备的旧时间回传自取消已修；专项29文件/533项通过。最终Node24.19.0完整check session7031 terminal0：**449文件/6468测试**、格式/零警告lint/架构/核心strict与标准build16.38s通过；1340源码/config指纹未变，Canvas893988字节，日志 `artifacts/clip-text-ui-full-check.log`。桌面/390、未失焦刷新、删除/撤销/焦点与真实播放见 [普通文字验收](./canvas-text-editor-functional-audit.md)。下段“尚未接App”为前批基础协议范围；高级背景/高亮/动画、HTML字幕、完整字体/预设/轨道仍缺，不把部分接线当文字工具全部完成，整体估算维持约70%。strict非全部JSX、CI未远端执行、本机未部署。

普通文字HTML后续批次已实现独立协议层：v4 timeline元数据/严格保全校验、30fps入口和同轨避碰、原生SHA稳定ID、字面正文/语言段/逐字计时、局部/全局/单语言样式及整批失败保原文档。专项21项、Chromium6项及静态布局通过；最终Node24.19.0完整check terminal0：**445文件/6450测试**、格式/零警告lint/架构/核心strict与标准构建通过，1309源码/config指纹未变。首轮旧ScriptV2失败与原样复验保留，日志 `artifacts/clip-text-contract-full-check.log`。尚未接App入口、owner/history和双iframe播放，不计为可用前端功能，不提高约70%的估算；下一步仍须完成真正接线，见 [HTML审计](./canvas-text-html-contract-audit.md)。下段443/6429为前批VTT冻结；本机未部署。

本次基础VTT字幕已接入新增/搜索/选择、正文/全局样式/应用全部、显示隐藏/删除、拖动裁边、单次历史/CAS、最后输入/pagehide和主画面转场叠层。专项25文件/496项通过；Chromium桌面/390、未失焦刷新、拖动/裁边/取消/撤销/重做、空态删除与4.1秒切换已验。最终Node24.19.0完整check terminal0：**443文件/6429测试**，359.69s、标准build17.99s，格式/零警告lint/架构/核心strict通过；1303源码/config指纹未变。日志 `artifacts/clip-subtitles-full-check.log`，范围与中途失败见 [字幕审计](./canvas-clip-subtitles-functional-audit.md)。首轮两失败及浏览器空态崩溃均已修复并保留过程；旧438/6408是前批快照。HTML字幕/普通文本、完整字体目录等仍缺，整体仍约70%（65%-75%），不按测试增量自动上调；本机未部署。

最新转场库/属性批次：已补开库、三可见效果、切点选择/时长/删除/历史、两侧宽度记忆、原生双视频与源CSS遮罩预览。最终剪辑专项20文件/475项通过；Chromium桌面/390px、原始封面、数值源quirk、键盘/指针调宽及逐层Escape已验。Node24.19.0完整 `npm run check` exit0：**438文件/6408测试**，测试399.93s、标准build21.43s，格式/零警告lint/架构/核心strict通过，日志 `artifacts/transition-panels-validated-check.log`。来源和实际边界见 [转场操作审计](./canvas-transition-controls-functional-audit.md)。统计含独立影游，strict非全部JSX、CI未远端执行、本机未部署；下段ENOSPC是前批历史，整个复刻估算仍约70%。

2026-10-15 前批主预览历史：剪辑17文件/461项、联合21文件/506项及元数据补跑4项通过；Chromium像素、GUI恢复、GPU重建及390px已验。当时435文件中434/6390通过，剩余suite因ENOSPC未加载，标准build也因素材复制ENOSPC失败；失败日志为 `artifacts/transition-preview-final-check.log`、`artifacts/transition-preview-build.log`，代码编译不能替代该版本完整通过。当前已由上段438/6408完整成功更新，433/6366与431/6353仍是更早历史快照。

前批主预览：四种 canonical `transitionIn` 画面预览已接入，17文件/461项专项与 Chromium 像素、实际 GUI 撤销/重做/刷新、390px布局通过；当时缺的库/属性由上方新批次接入，字幕层级、提前预热与真实导出仍缺，见 [转场审计](./canvas-transition-preview-functional-audit.md)。整体估算维持约70%，本批根全量结果单独记录。

前批（转场实际预览接入前）源码复核通过 **433 个测试文件／6366 项测试**，并完成格式、零警告 lint、核心 strict 与生产构建；历史日志为 `artifacts/pre-transition-full-check.log`。该批新增剪辑片段复制/粘贴、Feature Updates 分页续载、Studio 三类灯光添加入口及懒加载冷启动测试稳定性。下文旧的 431/6353 为前一批历史快照，不作为当前检查结果。

响应用户“目前到了什么比例”：按当前本机前端功能/交互范围，工程估算整体约70%，合理区间65%-75%。不是正式逐条验收率；当前没有完整原站状态分母，未知/未验能力不当完成。内容数量、暂缓登录注册/原账号资源、真实后台服务执行不计分；独立互动影游是扩展功能，不给原站复刻加分。原站的前端错误/空态/权限/付款前状态仍属于范围，不能因没有服务一概删除。

| 范围                          | 估算    | 权重假设 | 依据与限制                                                                                                                                                               |
| ----------------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 展示页面、导航及公开浏览      | 85%-90% | 20%      | 主要公开页面/路由/筛选搜索/详情/播放器/次级入口已实现，逐像素及全部媒体/异常状态尚未逐项验完                                                                             |
| 项目、资产与Skill常规本地管理 | 75%-85% | 25%      | 保存恢复/回收/目录标签/选择器/创建编辑/分享交接有实测；团队主体、高级分支及IME/触控细节仍缺                                                                              |
| Canvas与Agent复杂创作         | 65%-75% | 35%      | 选择拖动连接/组/末次草稿/引用/生成配置/分镜/undo及mixed删除已验；剪辑基础编辑、恢复、转场、文字/字幕、轨道新增/重排、预览几何和混合编辑权/失败回退已接，旧字幕版本/完整迁移、远程预设及其余特殊renderer仍缺 |
| 3D/Studio完整工具流程         | 45%-60% | 20%      | 真实GLB/动画恢复导出/运镜镜头/监视器/属性已可用；材质骨架/完整时间轴工具/视频输出前状态等仍需补                                                                          |

取区间中值按上述显式权重约72.5%，对未知状态保留余量后对外报约70%。权重是产品复杂度判断，不是从页面数自动得出的数据。此前本机源码检查为431文件／6353测试并完整构建通过；测试数不是原站功能完成数量，后续源码修改不能沿用冻结结果。更新比例须以新已验证功能关闭缺口，不能仅凭增加测试／页面入口／素材数上调。新增混合事务、片段字幕/转场/音量增益线、剪辑恢复、逐帧拉片、Studio 镜头/复制/时间轴导航/灯光属性/材质颜色、生成前引用顺序、文章画布入口、项目排序与移动、挑战赛分页、资产目录过滤和学院播放器/跟练导航状态已关闭部分缺口，完整clip呈现／时间轴高级状态与其余复杂编辑器仍需补齐，整体保守估算维持约70%。本机修改未自动发布线上。

独立复核维持约70%的估算。连线命中区、选择与悬停剪刀的398／5617及1171冻结保留为 [历史验收](./canvas-edge-interaction-functional-audit.md)；选中／mixed删除和clip素材断线已由下方最新407／5862与1192冻结更新。逐帧拉片专属卡片与维度选择见 [逐帧拉片审计](./canvas-shot-breakdown-functional-audit.md)。剩余前端包括clip完整时间轴编辑／其余特殊节点呈现、Studio材质／骨架／轨道工具、学院正向跟练、主体／团队资产，以及媒体错误与触控／跨浏览器细节；这些仍需实际实现和验收。

## Canvas 智能剪辑编辑器接线（2026-10-14）

本批已把专属 VideoClipNode、四种合成模式、真实媒体准备、片段级原生字幕轨道、片段级转场状态、片段音量增益线、预览尺寸同步、时间轴播放／移动／裁切／拆分／轨道控制、撤销重做、素材边差异、冲突副本恢复接入本地 Canvas。剪辑域撤销／恢复、媒体 runtime、字幕、转场、增益线和拖入素材专项均通过；该历史批次Node24.19.0完整 `npm run check` 为431文件／6353测试并通过生产构建，最新检查以文首当前验证为准。实际浏览器已打开真实远端双片段和时间轴，媒体可读取时播放按钮启用；冷启动远端资源可能超过 15 秒 metadata 窗口，显示可恢复的超时与重试入口，不伪造成功。时间轴直接编辑的历史快照在提交前捕获，撤销／重做会同步图、边和本地保存；显式恢复副本在媒体准备完成前不能关闭，恢复源集合在关闭时才按 CAS 同步。拖入视频／音频使用目标世界坐标、目标 incarnation 和一次 CAS，权威时间轴在真实 metadata 就绪后加入新片段并保留恢复来源集合。音色筛选的语言／口音／性别选项已支持搜索与清空；Studio 导入网格可编辑有来源证据的材质颜色、灯光类型与属性并持久化到 nodeEdits。资产库文件夹封面可从子树有效图片设置／清除并在坏图时回退；Agent 资产选择器已按当前目录过滤远程混合子目录；选中混合删除确认期间校验候选 edge identity。剪辑器收起预览在节点虚拟化时有界重试并提供回到节点；Studio 导入 GLB 子节点以 nodeEdits tombstone 删除，可撤销恢复并过滤已删除动画轨道；学院目录切换课程时恢复默认展开组并保持当前章节所在组展开、跟练侧栏支持相邻章节导航；Canvas 逐帧拉片节点已接专属卡片、真实画布点选替换和原站维度 key；生成前媒体输入会物化稳定 ListOrder，学院文章页入口保留登录门槛并传递 source/itemKey。

## 2026-10-15 剪辑、项目、挑战赛与 Studio 维护

- 剪辑时间轴按公开源 `-60～20dB` fader 曲线接入视频/音频片段底部增益线；支持鼠标拖动、键盘微调、取消回滚、单次历史/CAS 和播放器同曲线增益。可访问音频源已补真实解码波形；WebAudio 多轨、视频内嵌音轨全量波形和服务端导出仍未接入。
- 项目页补齐本地“最近更新/名称”排序、项目/文件夹移动到根目录或合法目标文件夹，并阻止文件夹移动到自身或后代；互动影游项目继续使用独立 repository。
- 挑战赛列表按 source 的 20 条 page/total 协议接入 sentinel 续载、初载骨架、空态、失败重试、Abort/换源隔离和 ID 去重；默认仍是代表性快照 adapter。
- Studio 材质颜色使用可回焦的 HEX/RGB 色盘、取色能力检测和 source 材质恢复；真实 GLB data URL、history/autosave 和其他材质槽保持边界。Studio 定向回归为28文件/136项，该历史批次根全量为 **431 个测试文件 / 6353 项测试**。

## 2026-10-15 生成、文章入口与 Studio 灯光

- 生成器提交前按当前 incoming image/video/audio/mixed 列表物化字符串 nodeId 的 `*ListOrder`，保留重复和已有顺序；URL-only 不制造节点 ID，服务未连接时仍只保存本地参数。纯规则、Canvas 接线和恢复边界见 [生成器审计](../src/features/canvas/generator/SOURCE_AUDIT.md)。
- 学院文章页的“前往画布”入口保留未登录门槛；已登录适配器下会在原分享 URL 上追加 `source=academy_tutorial` 与 `itemKey=articleUuid`，保留 query/hash 并用新窗口打开。它只接前端导航协议，不宣称文章权限、服务端练习或登录已接入。
- Studio 灯光实体支持 source 已确认的 Sun/Point/Spot 类型、强度、范围、Spot 锥角/半影和阴影开关；Inspector、历史/CAS、自动保存、真实 GLB light metadata 恢复和 Three runtime 已联动。完整材质、云端项目写入和所有移动端视图仍缺。
- 该历史批次根目录 `npm run check` 为 **431 个测试文件 / 6353 项测试**，格式、零警告 lint、核心 strict、Vitest 和生产构建均通过；最新检查以文首当前验证为准。本机源码未自动发布生产。

这批仍不计为整体完成比例的充分证据：完整 WebAudio 多轨／autoplay 跨浏览器、远程 CORS 与视频内嵌音轨全量波形、真机 touch／Safari／高 DPR／大图性能、全局 VTT/HTML 字幕／转场完整输出／帧缓存／服务端导出、云锁／协作／生成／费用服务仍需验收。详情见 [剪辑编辑器审计](./canvas-clip-editor-functional-audit.md)。

## 2026-10-15 三域交互补全

- 剪辑时间轴依据公开源 bundle 的 `transitionIn` 契约接入本地转场状态：主轨相邻片段可添加或更新 `fade`（兼容 `crossfade`）、`dissolve`、`fadeblack`、`fadewhite`，时长按相邻片段和 0.2–10 秒边界限幅，并以可聚焦 marker 显示与选中右侧片段。该状态通过既有历史/CAS 保存；画面转场 preview、真实导出和服务端能力继续保持未接入。

- Canvas `shot-breakdown` 从通用生成器占位切换为专属“逐帧拉片”卡片：视频空态/预览、本地视频、画布选视频、分镜/动态/音乐维度和服务未连接边界均可操作；真实拉片任务、轮询、取消、结果写回与云端权限仍未接，详见 [逐帧拉片审计](./canvas-shot-breakdown-functional-audit.md)。
- Studio 键盘工作区按源快捷分派接入 Shift+Arrow waypoint 导航、Shift+A 添加菜单、1/2 工作区切换、C 相机视图切换、顶层对象 Ctrl/Cmd+C/V/D、Shift+D，以及播放速率/时间轴缩放/进度键盘控制；没有镜头计划时保持不伪造状态，嵌套子节点复制、完整建模/材质/视频输出仍缺，详见 [Studio 审计](../src/features/studio/SOURCE_AUDIT.md)。
- Agent 资产选择器按远程混合 feed 的 `parentId` 只显示当前目录直接子目录，搜索/标签时隐藏目录；真实团队成员和服务器 CRUD 仍由 adapter/运营服务提供，详见 [picker 审计](../src/services/asset-picker/SOURCE_AUDIT.md)。
- 学院播放器补齐桌面音量悬停/聚焦纵向滑块、百分比键盘调节及完播遮罩点击关闭；跟练侧栏补齐相邻“上一节/下一节”导航，移动端继续隐藏桌面音量浮层，系统媒体输出、Safari 和原生触控仍需浏览器验收，详见 [播放器审计](./academy-player-advanced-audit.md) 与 [学院审计](./academy-course-functional-audit.md)。

## 选中边、混合删除与剪辑素材断线（2026-10-14）

键盘与剪刀共用selected coordinator：RF候选、初始确认双flags、ordinary先提交、异步clip／raw editing、一次聚合关联warning与selected UI node阶段按source分开。后置取消保关联、晚确认历史分段、成功CAS后消费末次草稿；Delete／Backspace长按latch与read错误后的undo／redo guard已修。clip按目标原子批准、timeline patch先ig，本机Port以operation signal隔离授权／提交／release，修复重叠取消误释放。

官方Node24.19.0完整check session29008 exit0：407文件／5862项全过，08:57:15／233.25s、build16.68s；1192源及另22份检查时Markdown输入冻结，实际lazy／旧31 CSS／main5／900000预算／依赖见 [构建证明](../artifacts/canvas-selected-delete-final-build-proof.json)。首次旧Skill首例超时保留，同源码／断言／timeout／worker原样完整重跑成功。19份真实GUI完整文档（14桌面／390 mixed＋5公开VIDEO clip）与先冻独立gold零差异，包含部分取消、分阶段history、一次clip undo／redo与cold；精确source／本机／原生边界见 [本批验收](./canvas-selected-delete-functional-audit.md)。

断线数据通过不等于完整clip renderer／editor。实际聚焦仍是通用占位／inspector，波形／timeline编辑／内部片段删恢复／媒体准备／导出前状态与其它特殊renderer仍缺。原生AUDIO／node＋edge warning、真实云锁／写服务、真机touch／Safari／高DPR／大图另验；默认无需登录／小号、不继续采集、本机未部署，整体复刻目标仍进行中。下方“selected/mixed尚未接”属于旧连线冻结时的范围。

## 连线命中、选择与悬停剪刀（2026-10-14）

普通边采用20世界单位透明hit、源贝塞尔/可见性、pointer与keyboard分离的选择协议、flow与1000ms悬停48单位剪刀；双击不再删除。shared pointerActive与派生panning修复实际松手和抓手class回归，readonly可选无剪刀；单边清理/分镜确认仍复用既有图事务。选中Delete/mixed与clip不据此称完成。

398文件/5617项完整check、1171冻结cd26ce18、源93摘录、5新文件158项、14真实GUI全字段导出21图/13UI断言及390/10%/readonly边界见 [本批验收](./canvas-edge-interaction-functional-audit.md)。六次中间终止/失败与两处旧cold预算修正均保留；最终真实terminal0单独核查。下一批 [selected/mixed源审计](./canvas-selected-delete-source-audit.md) 已明确候选/flags/聚合确认/部分取消与history分段，纯草稿在output准备，尚未接运行。本机未部署，无登录/小号，整体复刻仍约70%的工程估算；下方双击是历史入口，现由本段更新。

## 脚本与分镜组单边断线（2026-10-14）

legacy script与group、group与group的关联warning/精确unlink和editing优先已接UI及公共API；raw V2直接边保源普通分支。末次全部草稿、一次raw CAS/history、成功consume与quota仅保存重试；确认无X、backdrop不关、Escape、message全选及344px/16px/32px样式可操作。

393文件/5459项完整check、1161冻结、真实App14/owner28/API6、101节点GUI11份全字段比较及390确认见 [本批验收](./canvas-storyboard-unlink-functional-audit.md)。第一次正式检查两旧focus等待失败/build未跑，保strong asserts修正后完整重跑。当前单边双击不覆盖source mixed batch、clip时间轴异步前端/锁、实际透明hit/剪刀入口、完整renderer及手机/Safari/大图。本机未部署，无登录/小号，整体目标未完成；下方388/5370及其“script断线未接”是历史范围，由本段更新。

## 整图删除、连线与确认（2026-10-14）

source UI group/video_group子树删除、直接父组收缩／解散／p2绑定、pictureEdit／submitted／editing cascade、script样式／lens／panorama纯状态、边专属characterReferences已接公共GraphActions；普通参考入口复用边清理。末次全部draft／一次CAS／history与成功consume同步，修复read错误后旧token复活；keyboard/menu确认分别按源，手型／Space禁误删。完整特殊renderer未据此称完成，bounded surviving-group consumer与nested world free是明确本机适配。

388文件／5370项完整check、1150冻结／真实lazy／旧CSS，首次旧组expectation失败→强undo/redo修正重跑，与实际App22项、native16份GUI整文档手型／删源／撤销／重做／刷新、整组恢复／脚本取消确认／双击连线及390确认／回焦点见 [整图删除验收](./canvas-destructive-delete-functional-audit.md)。source分镜断线确认／unlinkStoryboardByEdge、VIDEO_CLIP async mD／原锁／history合并、特殊renderer与真实服务仍有前端缺口；真机touch／Safari／高DPR／大图另验，无登录／小号、本机未部署、整体目标未完成。下方379／5193为历史普通删除批次，其特殊锁／全局cascade等缺口以上方新范围更新。

## 普通节点参考删除与恢复（2026-10-13）

完整13文件／79摘录 source 规则已接普通删除：stable ID 清理／重编号，旧mode决定mixed转换、全部group leaf计数、stored asset保留、首边删除／源node保留。GraphActions末次输入／Magic清理、explicit next与一次CAS／history，Inline接受后取消旧timer；Role final after共用collector，初始UI adapter未称完整等价。IMAGE排序仍only typed／literal，不能沿旧“删除missing token”结论。

正式379文件／5193项完整check、1135冻结、CSS／lazy不变量、修前8项全败→实际App11项、pure／owner74项，及原生1280删除／undo／redo／cold GUI整文档、390最后项删除／一次恢复见 [本批验收](./canvas-reference-delete-functional-audit.md)。特殊pictureEdit／submitted segment／editing continuation、全局node-edge cascade、lens／style／focus与typed-order生命周期仍缺；source只按readonly门控，锁不代表这些删除分支不可达。真机／Safari／高DPR／大图与真实服务继续另验，本机未部署、无需登录／小号，整体目标未完成。下方375／5108与1129为历史面板快照，其“delete另验”由本批普通范围更新。

## 节点面板可达性与参考草稿（2026-10-13）

实际surface测量统一Generic／ScriptV2／加载错误态：原下方完整时保原位，不足则上放并避开title；整卡限高滚动，固定左工具栏预留列，输入不继承接线倾斜。VIDEO排序修复150ms正文与baseline碰撞；完整IMAGE链确认only typed order与literal正文，delete/recalc另验。原站collapsed固定下方，上下翻转及避让是用户授权的本机适配。旧CSS全字节／级联与四实现lazy保持。

375文件／5108项完整check、1129冻结SHA与真实1280／390／320×240、expand／Escape／zoom／drag／undo、GUI整文档相等见 [本批验收](./canvas-generator-vertical-functional-audit.md) 和 [构建证据](../artifacts/canvas-generator-vertical-final-build-proof.json)。group／显式尺寸／加载错误／动画中间帧主要受控DOM；真机／Safari／大图、普通删除完整source链、角色特殊前端与真实服务仍缺。本机未部署、无需登录／小号，整体目标未完成。下方角色370/4991及Mark“未做竖向翻转”是各自历史快照，当前以上方范围为准。

## VIDEO角色库与节点引用事务（2026-10-12）

真实VIDEO角色入口、Public分页／详情／选择／预览与Seedance四tab／审核状态／可注入上传删除已接线，缺省source明确unavailable。原子图事务保普通refs、删首边保源node、自然尺寸与三类证书字段按源分别维护；末次草稿token复活、Magic漏清、Public Quota重复writer与portal click背景失选已修复。完整工程、实际App与native桌面／390／320、旧失败和最终SHA证据见 [角色库验收](./canvas-role-library-functional-audit.md)。

正向目录／认证仅用合法测试adapter，原站一次匿名目录code10001未授权不提供样本。真人VisualRecord／group／rename／sign／QR、历史图库selector、VIDEO／AUDIO重核writer及主体rb仍有前端缺口；不能称仅剩后台或整个角色库完成。真实运营服务／生成／费用、真机／Safari／触控／大图继续未验；不登录／不使用小号，本机未部署，不改独立影游生产。下方360/4803与旧SHA均为历史冻结批次。

2026-10-13官方Node24.19.0最终完整check exit0：370文件／4991项，00:42:01／110.51s、build11.11s，格式／零警告lint／架构／核心strict通过，1122源冻结核对及实际dist见 [构建证据](../artifacts/canvas-role-library-final-build-proof.json)。真实collector／hook／App联合3文件65项、portal view36项通过；native1280／390／320 mask保选区和inline，Space激活／Escape回chip，两份GUI整文档SHA相同。初轮370/4983和bubble-only仍native失选、Space失败证据保留；strict非全部JSX、CI未远端执行、Node弃用提示不抹除。

## Blender参考的Studio视口（2026-10-12）

本批用户授权的渲染/导航改善保留PenStudio布局：AgX、本地环境光、主光/补光/轮廓光、平滑曲面及阴影；左键选择，中键/Alt左键旋转，Shift中键/右键平移；可旋转XYZ方向指示、六向/反向、按实际GLB几何聚焦与橙色选择框。主视口/monitor使用相同AgX，修复俯视近端面裁切、NumLock-off聚焦误删及320px标题/轴向遮挡。实际1440/390/320圆柱可见，窄屏无横溢；4556B GLB真实导入保留Slide/Grow、两个机位及层级，新标签无warn/error。受控OrbitControls鼠标回归与原生输入范围分开记录。完整日志、截图、准确源范围与边界见 [视口审计](./studio-blender-viewport-audit.md)。真正正交、完整建模/材质、AO/路径追踪、视频导出及原业务服务仍缺；本机未部署，不以此称全站/Blender完整复刻。

## 节点点击与拖动末位（2026-10-12）

共享Pointer修复node未moving时由up首次拖动/复制/history的P2；已起拖末位、原选择、parent相对位置、一次历史及pan/box/link保持。source普通move-start与虚拟框down-start不同，本机4px/延后copy是明确适配。实际App4项完整存储/零写入/后续detail1点击、默认共享/Canvas14项，以及联合8文件210项通过；初次旧drag IDs fixture失败只补实际move，原强断言保留。

该节点松手批次Node24.19.0完整check exit0，**360文件/4803测试**，21:42:56/122.72s、build11.06s，格式/零警告lint/架构/核心strict通过；`artifacts/canvas-release-start-current-check.log`。1100源/config/tests SHA一致，包含同期Studio及独立影游工作，初轮Studio CSS漂移与全检历史保留。Canvas690228/gzip229310、Script220148/72475、Mark23974/9037；真实lazy与22CSS级联不变量保持，900000阈值未改，见 [构建证据](../artifacts/canvas-release-start-build-proof.json)。

独立后台tab3原生1280×720 click/drag/一次undo-redo，每步真实GUI导出：click graph不变，仅被拖节点position变化，undo完整恢复、redo完整重放、view和其余data/edges不变。warn/error为空；没有把up-only受控事件冒充原生操作，也不确定前轮综合坐标差异根因。精确scope与证据见 [节点验收](./canvas-pointer-release-functional-audit.md)。本批无新增窄屏/touch/持续修饰键/Safari/大图验收；仅本机未部署，strict非全部JSX、CI未远端执行，无需登录/小号，整体目标未完成。

canvasCapture两路source确认是前图URL回调，VIDEO第三资产服务callback在t4未被消费，归档未证实可见入口；不能把dormant分支做成区域截图按钮或说截图已完成。见 [视图/可达性](./canvas-capture-view-source-audit.md) 与 [模型/服务](./canvas-capture-model-source-audit.md)。真实服务、完整renderer及其余截图/裁剪协议继续按各自实际入口调研。

## 历史元素标记、节点模式与边缘可达性（2026-10-12）

Mark已接 IMAGE/VIDEO 实际schema能力、图片点位/候选、token/magicList、光标插入、FIRST点选/ALL prompt菜单、20 occurrence门控、末次草稿、一次图事务与Quota保存重试。参考/聚焦/Mark互斥，receiver保选择，展开frame逐层Escape、Space受控平移与原生抓手可用；默认识别source未连接，先提示并保图，不编码/请求/造标签。Core pruning与同mode tempPoint操作已实际App回归，普通prompt CtrlZ仅raw token，完整badge undo仍未实现。

Script整卡/Mark真实按需chunk，旧22份CSS-only static DFS顺序和旧基线逐字保持；实际board宽向普通/ScriptV2/加载错误态三个caller提供定位/宽度，仅横向溢出clamp，合法原center不动。888px右侧裁切已观察后修正，Agent板宽568时生成器left20/right548/width528、生成按钮507..539；390px横向20..370，原生抓手平移后完整按钮在698.82..730.82高度，保两节点/一边/0点。未做竖向自动翻转，不能把横向适配称为全部视口自动可达。

正式Node24.19.0完整check exit0：**352文件/4745测试**，20:04:40/101.45s，format/零警告lint/架构/核心strict/构建10.61s通过；日志 `artifacts/canvas-mark-final-check.log`。13文件127项联合回归20:03:24/13.53s通过；旧同步lazy fixture失败保留，强断言未削弱。Canvas690228/gzip229314、Script220148/gzip72470、Mark23974/gzip9030，Script/Mark不在Canvas static closure，阈值900000未抬高，CSS192511/移除5条新规则后等于旧191954基线。source1087 SHA冻结核对见 [构建证据](../artifacts/canvas-mark-build-proof.json)。

1280/390/320 Mark入口、VIDEO、frame逐层Escape、Mark→Focus、首次Mark GUI导出与原Focus图相同、真实Script手写/两次undo与默认服务提示已验；后续综合操作坐标改变未逐手势定位，后补独立Mark抓手的前后GUI导出则严格保nodes/edges，仅view.y−50。正向suggestions只用受控adapter，不称原生真实识别。详见 [本批验收](./canvas-mark-functional-audit.md)、[原生proof](../artifacts/canvas-mark-browser-proof.json)、[横向审计](./canvas-inline-generator-board-placement-audit.md) 与 [验证历史](./verification-history.md)。capture/未核renderer、真实识别/生成/上传/费用/协作、原生持续Space/Alt/touch/Safari/大图仍缺；仅本机未部署，strict非全JSX、CI未远端执行、统计含独立影游扩展，无需登录/小号，整个目标未完成。

## 历史图片聚焦与窄屏交互（2026-10-12）

支持schema的IMAGE聚焦chip/裁剪卡、explicit target、真实源区域/八柄/七比例、确认/删除/模型降级和草稿/边/history/本机保存已接。锁/readonly/owner/取消/Quota协议与源数学闭包有actualApp和独立回归；camera_focus无额外描述可达真实服务阻断，不假任务。确认工具按mode预加载dynamic import，失败保pending并可重试，CSS保持eager。

最终Node24.19.0完整check exit0，337文件4500测试，tests18:24:50/261.59s，格式/零警告lint/边界/核心strict及构建15.34s通过；日志artifacts/canvas-focus-final-check.log。CanvasPage898775/gzip296239，确认工具4671/gzip2136，未提高900000阈值；构建SHA及source快照见artifacts/canvas-focus-build-proof.json。先前335/4465、336/4483均独立before-*快照，窄屏900.02kB提示已通过真正分包修复。

原生1280创建/入口/区域/比例/crop/一次undo-redo/删除/模型降级/冷刷新/GUI导出已验；390确认条8px边界、ModeBar完整可读，320标题一行/副标题两行和全部比例/按钮/Escape已验。最初ModeBar196px及确认条left负79.5px失败保留；最终view代码前后和原生证据见 [聚焦验收](./canvas-focus-functional-audit.md)。Mark/capture/全局发布保护adapter、完整资源factory/downstream、远端教程播放、真实生成/费用/上传/权限/协作、原生高频修饰拖动/pen/touch/Safari/大图仍缺；本机未部署，不覆盖影游冻结生产，strict不覆盖全部JSX/CI未远端执行，整个目标未完成。

## 节点参考手势与多文件添加（历史批次）（2026-10-12）

reference最后release/当前view、无保存尺寸的实际shell命中、source屏幕矩形、返回保zoom、双pointer互斥与mask尾click/新press/键盘协议已修；普通upload固定live FileList后读取全部项，保最新图和整批history。专项七文件195项及FileList新旧8项通过。正式Node24.19.0完整check exit0，328文件4377测试全过，tests16:53:44/104.32s，格式/零警告lint/边界/核心strict与生产构建11.11s通过，日志 `artifacts/canvas-gesture-refinement-final-check.log`。CanvasPage875.31kB/gzip288.97kB低于既有900kB阈值；上一批873.73/288.54是历史字节。

实际原生框选两图、返回97%保zoom、两PNG一次读取/整批undo-redo、分组标题拖动/组外图不动/刷新恢复、390入口与Escape已验，详见 [手势验收](./canvas-reference-gesture-functional-audit.md) 与浏览器proof。pen竞争/快速release/current-view使用受控App回归，不称真机；历史HMR hook-order日志保留，最终冷加载日志按时间单独记录。本机未部署、认证/小号延期；该批focus/mark仅调研和39项focus纯规则，后续IMAGE focus已由上方更新，Mark仍缺，真实写服务、高频修饰拖动、touch/Safari和大图继续另验。整个目标未完成。

## 历史ScriptV2参考交互与按需入口（2026-10-12）

画布选择、connected取消、group/box/source target、upload本机队列与image-only个人库已接；连续selectionChanges/pane target/chooser失效owner修复，graph/draft一次CAS和Quota仅保存重试保留。真实App与旧compat联合30项通过。最终完整检查通过324文件/4320项，格式/零警告lint/边界/核心strict与构建20.28s通过；tests16:07:31/115.51s，日志 `artifacts/canvas-script-reference-final-check.log`。CanvasPage873.73kB/gzip288.54kB已低于既有900kB，不抬阈值。首轮324/4318仅1条验收夹具排序断言失败仍保留，不据初始检查宣称完整成功。准确范围见 [本批验收](./canvas-script-reference-functional-audit.md)。

实际原生1280与390px参考模式/取消/再选/Escape/刷新恢复通过，窄屏documentWidth390/顶条17–373，截图已存；未把工程测试当native拖动/上传/触控或网络失败验收。本机未部署、登录/小号延期、真实生成/上传/费用/权限/完整source模式与大图继续缺，整个目标未完成。

## 当前ScriptV2专用生成器与保存恢复（2026-10-12）

empty/pending/resource/failed已接独立ScriptV2 inline，full generating/readonly隐藏。独立三项目录、原metadata图标、source TEXT/typed媒体/规则和scene/source_images、prompt Magic/CameraPreset清理；typed重排只改该order，组删除计全部leaf。Frame16world/逆zoom与sourceexpanded字段不改节点盒子，不擅加普通参数/高级面板。最后150ms、同节点双draft channel、一次rawCAS/history、external baseline拒绝覆盖、document-levelQuota重试和两层Escape焦点有实际回归，详见 [生成器验收](./canvas-script-generator-functional-audit.md)、[pure/source](./canvas-script-generator-model-source-audit.md)、[view](./canvas-script-generator-view-source-audit.md) 与 [接线/问题](./canvas-script-generator-integration-source-audit.md)。

正式Node24联合12文件208项06:17:22/6.57s通过；完整check exit0，314文件/4155测试全部通过，06:17:39/85.20s（tests57.84s），格式/零警告lint/架构边界/核心strict与构建9.93s通过，日志 `artifacts/canvas-script-generator-final-check.log`。CanvasPage923.04kB/gzip304.97kB超900kB分包提示是实际剩余，不称零构建警告、不抬门槛。随后仅文档/格式检查，无新生产代码；strict不覆盖全部JSX、CI未远端执行，统计含独立影游扩展。本批未新增native桌面/窄屏/手感/Space或截图通过，上一批data拒绝只作历史证据。Root新增参考三动作仍未接，真实生成/翻译/语音/费用/协作/写服务、显式target、参考细节、真机/Safari及大图另验；无需登录/小号，本机未部署，全站目标未完成。

## 历史ScriptV2空态入口与参考建图（2026-10-12）

三个source提示已接：剧本创建完整原文text/一条边，角色创建原URL两图/两边并整体替换script.params，手写独立创建空行与打开编辑器。默认store避碰、根节点前置、selection/view保留、一次CAS/history/同步flush与Quota只保存重试有实际App回归。统一useContent加载小型完整预设，各动作独立资格，旧文档/readonly/ready/删除与重入隔离；manual旧render及fresh raw门控修正，详见 [空态入口验收](./canvas-script-presets-functional-audit.md)、[纯模型source](./canvas-script-preset-source-audit.md)、[空态UI](./canvas-script-empty-source-audit.md) 与 [只读复核](./canvas-script-preset-controller-review.md)。

正式Node24专项7文件118项05:44:13/4.19s通过，日志 `artifacts/canvas-script-presets-final-joint-tests.log`。最终完整 `npm run check` exit0：309文件/3994测试全部通过，05:45:38/81.09s（tests53.05s），格式/零警告lint/架构边界/核心strict及构建9.85s通过，日志 `artifacts/canvas-script-presets-final-check.log`。随后仅文档/格式检查，无新生产修改，strict不覆盖全部JSX，统计含独立影游扩展。临时data检查页因浏览器安全策略仅允许HTTP/HTTPS被拒，未创建可验收页，未绕过限制；桌面/窄屏手感、Space与新版像素没有新增原生通过。专用SCRIPT_V2内嵌生成器/3项scriptText目录/TEXT content与script-generate-v2参数尚未接，明确见 [后续协议](./canvas-script-preset-integration-source-audit.md)，不能说只差服务器。登录/小号继续暂缓，本机未部署，CI未远端执行，整体目标未完成。

## 历史ScriptV2卡片状态与操作入口（2026-10-12）

横向compact三阶段为静态提示，唯一打开按钮及卡面双击保留当前步骤；卡面恢复共享pointer拖动，按钮/portal/Space隔离、收尾click与dblclick抑制、多选和一次history保留。五种形态、完整task与recompute分开，readonly/busy/ready及fresh raw请求门控；阻断请求不重放。源任务badge/失败和TaskID本机复制已接，manual失败保原draft/hiddenUuid可重试。来源与具体适配见 [卡片验收](./canvas-script-card-functional-audit.md)、[视图源码](./canvas-script-compact-source-audit.md)、[纯模型源码](./canvas-script-compact-model-source-audit.md)；显式target三模式仅只读调研，见 [target源码](./canvas-script-toolbar-target-source-audit.md)。

正式Node24.19.0联合11文件208项05:26:12/9.84s通过；首次full check旧视频入口六项失败，其他3894项通过，不记完整成功。迁移实际入口后独立6项05:27:42/2.82s通过，保原强断言。最终完整 `npm run check` exit0：305文件/3900测试全部通过，05:28:30/79.43s，格式、零警告lint/架构边界、核心strict和构建9.72s通过，日志 `artifacts/canvas-script-card-final-check.log`。随后仅文档/格式检查，strict不覆盖全部JSX、CI未远端执行、统计含独立影游扩展。46独立计数页native click仍0，已关闭，用户5173保留，桌面/窄屏/Space实际手感未验收、无新截图。empty presets/完整hint、yielded/live任务总线、显式模式、真实服务与大图仍缺；本机改动未部署，不替代独立影游生产记录，整体目标未完成。

## 历史ScriptV2图片配置与节点交接（2026-10-12）

浮动工具栏和全屏脚本阶段已共用r3独立图片选镜/详情、image20最大refs候选、schema key defaults和typed chips。sC创建原镜号空图片、真实refs/边、vertical普通组和link-only，成功保父脚本/选择/视口；默认避重叠、最后rich输入、fresh rows复核、一次undo/redo、Quota仅保存重试与owner取消有实际App回归。共享视频selector抽取保原video语义，mode-object源崩溃修复是明确本机适配。联合12文件302项04:54:25/5.84s通过，日志 `artifacts/canvas-v2-image-final-joint-tests.log`；最终Node24.19.0完整check exit0，300文件/3735测试全部通过，05:02:02/77.32s，格式/零警告lint/架构边界/核心strict与构建9.42s通过，日志 `artifacts/canvas-v2-image-final-check.log`。补行key前300/3734成功快照独立保存，新增重排焦点2文件26项05:00:50/2.38s通过；统计含独立影游扩展、strict不覆盖全部JSX、CI未远端执行。随后仅维护文档并检查格式，上一批295/3527为历史快照。源码和准确边界见 [图片交接验收](./canvas-v2-image-functional-audit.md) 与三个source审计。45独立计数页原生click仍0，已关闭，桌面/窄屏及新版视觉未验收，无新截图。退出动画、disabled Tooltip、完整renderer/target/toolbox/run-stop、真实服务、真机/Safari和大图继续未完，仅本机修改未部署，整个复刻目标未完成。

## 上一批ScriptV2节点快捷操作（2026-10-12）

脚本选中浮条接source四动作：重新生成、批量分镜图、批量视频和CSV下载，替换v2通用编辑/复制条。视频配置可从画布直接进入，无需先展开脚本；prompt flush、raw节点/工作流重核、同步重复请求锁、owner取消、一次建组undo及回焦点沿现有controller。实际App发现并修复pending禁用opener造成回焦点到body；portal双击不误展开，Space保默认不被画布抓手快捷键吞掉。模型失败可重试，CSV保全部raw行与原镜号，关闭后立即建组保最后rich prompt，undo保提示词修改。

Node24.19.0联合11文件270项04:26:12/4.83s通过，日志 `artifacts/canvas-script-node-toolbar-final-joint-tests.log`；新实际NodeCanvas11项。最终完整 `npm run check` exit0，295文件/3527测试全部通过，04:31:20开始/75.58s，格式/零警告lint/架构边界/核心strict与生产构建9.74s通过，日志 `artifacts/canvas-script-node-toolbar-final-check.log`。首次旧CSV测试迁移保断言、跟进13项与统计边界见 [验证入口](../AGENTS.md#当前工程验证) 和 [历史](./verification-history.md)，源码与明确适配见 [快捷操作验收](./canvas-script-node-toolbar-functional-audit.md) 及 [源码审计](./canvas-script-node-toolbar-source-audit.md)。44独立页原生点击计数仍0，已关闭；本批原生桌面/窄屏、Space及新版视觉未验收，无新截图。图片仍旧adapter，r3/sC、显式target、完整确认窗/卡片renderer、toolbox/character/run-stop、真实服务和手机/Safari/大图继续未完；仅本机更新未部署，整体复刻未完成。

## 当前ScriptV2批量视频配置（2026-10-12）

全屏脚本合成提示词阶段已接独立v2窗口，不需要上游图片组：逐镜选择/全选、临时时长、只读提示词展开、模型/参数与各项禁用原因。源rg/t4/rw/eq调用链、全局video34项目录、原镜号与单镜参考数规则分别核对；v1专用19项与组下浮条保持独立。纯配置/引用建图、controller和view分层，真实审核source可注入，缺失时保留表单并明确阻断；成功仅创建空视频节点和原引用，未执行生成。一次CAS/history/同步保存、Quota仅保存重试、关闭/切文档/pagehide/图变更取消审核、成功返回画布及用户接管取消100ms定位都有实际NodeCanvas回归。

联合11文件367项03:48:50/5.90s通过，日志 `artifacts/canvas-v2-video-final-joint-tests.log`；包含v1回归但不与交叉集合累计。当前Root controller25项与实际App6项通过。完整 `npm run check` exit0：291文件/3432测试全部通过，03:56:55开始/86.65s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建10.16s通过，日志 `artifacts/canvas-v2-video-final-check.log`。源码、适配与边界见 [v2验收](./canvas-v2-video-functional-audit.md)、[配置纯规则](./canvas-v2-video-config-model-source-audit.md) 和 [建图源码](./canvas-v2-video-graph-source-audit.md)。独立43计数页AX点击仍计数0，已关闭；本批桌面/窄屏原生操作未验收，无新版截图。源浮动脚本/工具箱/角色工具栏、完整run/stop、审核/生成/协作与写服务、真实手机/Safari和大图性能仍缺；仅本机更新，未发布或远端跑CI，整体复刻未完成。

## 当前v1分镜图片组视频配置（2026-10-12）

General脚本v1图片组已接非modal配置浮条：专用19模型、共享普通/batch高级参数、全部ready镜头与费用未知态；提交创建空视频组和真实引用边，没有直接run。纯config/graph/viewport、controller、views与可注入费用/审核source分层，独立目录加载/失败/重试不当空库。首图初始化/实时ratio refill、重复open保owner、两层Escape/回焦点、一次CAS/history/flush、Quota仅保存重试、并发图/切文档/pagehide/迟到结果与100ms定位用户接管均有回归。九文件220项03:13:08/5.91s通过；完整 `npm run check` exit0，286文件/3261测试03:18:26/85.64s、生产构建10.07s通过，格式/零警告lint/边界/核心strict通过，日志 `artifacts/canvas-batch-video-final-check.log`。准确范围见 [配置验收](./canvas-batch-video-functional-audit.md) 和 [source调用链](./canvas-batch-video-configuration-source-audit.md)。

独立React计数42页的AX/semantic/显示后坐标点击均不响应，计数始终0且无error，已依文档排障；该批原生桌面/窄屏配置操作未验收，无新版截图。不得把component tests当浏览器通过。v2选镜/逐镜配置已由上方新批次接入。费用/审核/生成/协作、目录缩略图/VIP视觉、源权益费用重算、服务器保存等待、完整toolbox/character工具栏、真机/Safari及大图仍缺；该批本机更新不自动发布，CI未远端执行，整体复刻未完成。

## 当前普通组尺寸调整（2026-10-12）

普通组和脚本图片General入口新增source四角手柄/四边线、120×80最小尺寸、flow差floor、extent与孩子约束、左上反向补偿、stop12padding及direct ordinary parent pF。瞬时preview与最终一次CAS/history/flush分开，取消/旧文档/并发图/modal不写旧预览，pagehide包括pending帧。原生连续点手柄误开add已实际复现并修复；标题Escape保持原input焦点、modal Escape与旧连接加号互斥有实际NodeCanvas回归。最后完整check exit0：280文件/3058测试通过，02:37:29开始/90.56s、生产构建10.33s，格式/零警告lint/边界/核心strict通过，日志 `artifacts/canvas-group-resize-final-check.log`；专项六文件125项通过。原生1280×720拖动、孩子位置、一次undo/redo及刷新保留已验；390×844仅布局/角柄尺寸/页面宽度已验，本批原生窄屏输入未验收，见 [尺寸验收](./canvas-group-resize-functional-audit.md)。初次全check的影游旧断言失败和精确契约修正保留在验证历史，统计包含独立影游扩展。非零origin、自身expandParent、特殊parent重排、真机/Safari与大图仍缺；本机更新未发布线上，CI未远端执行。

v1 batchVideo新源码证据纠正旧推测：当时缺口是全部ready镜头的模型/共享参数/费用配置浮窗及提交空视频组，现已由上方v1批次接入；逐镜时长/选图在另一个v2面板，不属于v1 eM。具体调用链/字段/保存与取消quirk见 [配置审计](./canvas-batch-video-configuration-source-audit.md)。真实费用/审核/run与运营服务仍未接，整体功能复刻目标保持未完成。

## 当前普通与脚本混合组操作（2026-10-12）

本机源码已冻结普通 GroupNodeToolbar 的颜色、三种布局、普通组转分镜、外部标题改名、解组与组 ZIP 接线；strict standalone 与脚本混合行按 source 分派，不把普通设置或 batch 运行套到全部组。单选/框选/拖动/标题编辑隐藏及窄屏 portal/clamp/滚动由独立视图负责，脚本 v1/v2 图片/视频运行确认保持独立入口，真实服务未接时明确禁用，不假造生成成功。

普通组布局使用 actual direct children、source order/尺寸与 `groupLayoutMode/nodeWidth/nodeHeight`。选择写入读取最新图，strict boolean CAS 成功后才改选择/面板；普通复制先合入最后150ms草稿再 clone，历史、原件与副本共同保留输入。解组只清精确匹配的脚本 link 和孩子分镜布局字段，保留 row refs。下载进度/取消绑定文档与启动组，旧文档或不匹配组的取消不能中止新任务；组右键隐藏没有 source 依据且无法打开的“节点设置”。

普通组主工作区的01:59:27冻结快照完整 `npm run check` exit0：275文件/2929测试全部通过，测试104.90s、生产构建10.44s；格式、零警告lint/边界与核心strict通过。此快照与01:57:39影游发布候选的275/2928为不同冻结版本。原生1280×720/390×844颜色、排列、标题拖动/双击、菜单焦点和刷新恢复已验；最后在完整App复验普通组切换及脚本v1确认/视频入口。资格计算限制并缓存到当前显示组，空闲script确认不扫图；没有据此宣称大图基准通过。日志与边界见 [组操作验收](./canvas-general-group-controls-functional-audit.md)、[普通源码](./canvas-ordinary-group-controls-source-audit.md)、[脚本源码](./canvas-script-group-toolbar-source-audit.md) 与 [接线审查](./canvas-ordinary-group-integration-audit.md)。v1配置浮窗已由上方新批次接入；当前仍缺 toolbox editor/创建更新弹窗、character toolbar、完整 run/stop、真实生成/费用/协作及运营服务；ordinary resize 由上方批次接入，v1准确契约由新源码审计纠正。手机/Safari与大图性能未因此验收。新批次是本机更新，不自动改变线上版本，独立影游扩展仍按其自身记录维护，整个复刻目标未完成。

## 当前独立分镜组设置与标题交互（2026-10-11）

独立图片组的比例、宫格、2K/4K真实PNG、序号、确认清空/转普通组和解组按公开source接线，唯一图片孩子选择显示父组操作，多选/框选/拖动/标题编辑隐藏。图计划与异步owner/签名/CAS分层，新图/溢出提交后立即flush已发布的图。原生标题拖动及双击改名已修正capture目标；普通组不套分镜设置。

实际桌面2K PNG为2048×1152/1,750,678B，根节点/改名/序号刷新恢复；4K实际4096×2304，本机配额不足时保留当前图、提示失败、不覆盖此前有效2K快照，可一次撤销。390px操作条宽374、left8/right382、页面scrollWidth390；原生二级菜单发现的问题与修复、工程检查和证据见 [设置验收](./canvas-storyboard-group-controls-functional-audit.md) 及[验证历史](./verification-history.md)。本批是本机更新，未自动发布现有线上地址；该历史批次尚缺的普通组通用操作/脚本混合工具栏由上方新批次更新，原站敏感词/审核上传、明确剩余组前端/服务、真机/Safari、大图及运营写服务继续另验，全站目标未完成。

完整检查期间捕获并修复ready后首次拖动被旧Touch passive cleanup取消的生产竞态，Pointer/Touch owner统一在layout commit清理和安装。保留原坐标/parent/history/storage断言并加立即观察压力回归。2026-10-12发布候选在隔离目录 `output/film-release-workspace` 使用Node24.19.0执行 `npm run check` exit0：275文件/2928项、格式/零警告lint与边界/核心strict/生产构建通过，01:57:39开始、测试120.51s、构建12.32s，日志 [film-release-frozen-final-check.log](../output/film-release-frozen-final-check.log)；该结果只对应 [冻结源码哈希](../output/film-release-source-sha256.json)，不代表后续持续编辑的主工作区。历史01:26版本268/2798通过保留在 [film-complete-check.log](../output/film-complete-check.log)。统计包含独立影游扩展，不等同于原站功能数量，strict不覆盖全部JSX、CI未远端执行。

## 当前节点与分镜宫格交互（2026-10-11）

本机源码已接实际“合并分镜组”、网格入组/换位/出组、图片派生组node/frame落点、容量/类型提示、source外层grow-only扩壳、actual membership reflow及空槽单图补入。组内图片title/handle按独立source门槛隐藏，拖出恢复；Pointer Strict重放、实际commit后UI与异步slot owner取消维持一次历史。最终全检查245文件2486项及生产构建通过，原生1280×720/390×844拖入、换位、拖出、补图、Escape回焦点和刷新恢复已验，见 [分镜拖动审计](./canvas-storyboard-drag-functional-audit.md) 及验证历史。此处本机源码更新不自动改变以下已发布部署；该历史批次的独立工具栏由上方设置批次、普通/混合组由最新批次更新，私人history/远端上传、明确剩余组前端、真机/Safari、大图性能与运营服务继续另验，全站目标未完成。

## 当前 Vercel 样本部署（2026-10-11）

用户要求的自动促销广告已从全局触发、渲染和样式移除，并更新同一生产地址。本次使用此前已验证的静态产物进行单独热修补，入口JS与CSS以外1478文件不变；shell7项回归、定向格式/零警告lint通过。源码副本的全量检查仍有进行中的Canvas差异与缺失GLB测试夹具导致的失败，未把该源码副本发布或宣称当前全量check通过。部署及浏览器证据见 [部署记录](./vercel-deployment.md)。

[PenStudio 前端](https://penstudio-libtv.vercel.app/) 已发布为独立静态样本包，保留全部编译路由入口。当前套餐容量约束通过代表性内容闭包解决，原本地样本不删改；发布的是已通过232文件/2140测试完整检查的冻结构建，与随后进行中的源码状态分别记录。

已验证30个深链、41项HTTP/内容/资源检查及最终9项复验；实际浏览器搜索、作品视频、匹配作品的134节点只读画布与Escape、资产文件夹保存后刷新、390px资产布局通过。公开内容数量、5个原始远端资源、许可证、部署ID与工程检查边界见 [部署记录](./vercel-deployment.md)。本批是部署验收，不能将全部路由入口可访问等同原站所有状态和交互完备；服务端生成、支付、写服务与真实认证仍未接入。

最新状态见 [当前普通组尺寸调整](#当前普通组尺寸调整2026-10-12)、[当前普通与脚本混合组操作](#当前普通与脚本混合组操作2026-10-12)、[当前节点拖动、边缘平移与普通组落点](#当前节点拖动边缘平移与普通组落点2026-10-11)、[当前普通节点与真实组拖动复制](#当前普通节点与真实组拖动复制2026-10-11)、[当前普通组输出与选区复制](#当前普通组输出与选区复制2026-10-11)、[当前多选交互与输出连接](#当前多选交互与输出连接2026-10-11)、[当前节点反馈与临时连接](#当前节点反馈与临时连接2026-10-11)、[当前节点触摸与连接](#当前节点触摸与连接2026-10-11)、[当前 PenStudio 与节点操作](#当前-penstudio与节点操作2026-10-11)、[当前分镜提示词](#当前分镜提示词2026-10-11)、[当前分镜资产、阶段与窄屏属性](#当前分镜资产阶段与窄屏属性2026-10-11)、[当前节点引用动作](#当前节点引用动作2026-10-11)、[当前 AutoLink](#当前节点-autolink2026-10-11) 和 [当前生成器、脚本、监视器与访问模式](#当前生成器脚本监视器与无需登录版本2026-10-11)。下文各历史批次保留当时范围，不能将历史未接线描述当作当前状态。

## 当前节点拖动、边缘平移与普通组落点（2026-10-11）

普通节点/真实组/节点发起多选/Alt副本的40px边缘每帧pan，虚拟框的80px/720px每秒pan已分别接入；固定指针随视口继续移动，取消、切文档与旧RAF/queued updater隔离。普通节点外部完整包含才入group，已有parent任意正面积重叠保持、完全分离才detach；最终位置与纯落点计划同次updater提交，边和组尺寸保持、一次undo/redo。虚拟框不套普通node入组。实际浏览器发现并修复选中下方节点标题被上方正文挡住，选中+1000和源父级提升只属view，不改文档/输入DOM或增加历史。

原生1280×720与390×844已验入组、出组、重叠保父、边缘pan、一次undo/redo和刷新保存；纯规则、Pointer和实际NodeCanvas7文件297项通过，最终全`npm run check` **232文件/2140测试通过**，21:40:59开始/60.03s、构建11.20s/exit0，日志`artifacts/canvas-node-drag-final-check.log`。初次一项既有上传等待超时保留记录，未改timeout；原断言联合41项与最终全检查通过，不认定确定根因。

范围、源差异及图见 [本批验收](./canvas-node-drag-functional-audit.md)、[平移/层级源码](./canvas-node-drag-pan-source-audit.md)、[分组源码](./canvas-group-drag-source-audit.md) 和 [验证历史](./verification-history.md#节点拖动边缘平移与普通组落点2026-10-11)。本批更新旧记录的框体autoPan与普通group drop；画像/分镜组专属容量/ratio/重排仍blocked，完整资产非modal抑制面板、RF多键selection、Group新点提示、原生Alt持续拖动、真手机/Safari、大量节点性能和运营服务仍缺。strict不覆盖全部JSX、CI未远端执行，当前无需登录/小号，整个目标未完成。

## 当前普通节点与真实组拖动复制（2026-10-11）

普通单节点、组内单节点、真实组与已选多选成员已接 Alt / Option 拖动复制。single 采用独立外部引用 detach / Ctrl-Meta preserve 规则，从真实组脱离为世界坐标；真实组保留嵌套树和父子相对坐标。普通节点首次起拖读取当前图和修饰键，虚拟框固定按下协议；4px本机起拖阈值相对source默认1px为手感适配。稳定 board capture、最终松手位置、一次 undo/redo、Escape/hidden 中断和兼容click隔离共同维护。

实际浏览器发现并加入联合回归：首次选中视频生成器会推断incoming mode，旧 pointerdown raw CAS因此拒绝复制。普通起拖从最新有效图计划并保持事务内原图CAS，不覆盖新参数、草稿或引用。工程与浏览器最终结果见 [本批验收](./canvas-node-alt-copy-functional-audit.md)，源契约见 [复制源码](./canvas-node-alt-copy-source-audit.md)。最终 `npm run check` **228文件/1995测试通过**，21:07:06开始、52.70s、构建10.31s/exit0，日志 `artifacts/canvas-node-alt-final-check.log`；原生桌面/390px与合成修饰键的实际范围见 [验证历史](./verification-history.md#普通节点与真实组拖动复制2026-10-11)。完整RF多修饰键 selection、原生Alt持续拖动、框体autoPan/高级drop、特殊renderer、真机/Safari、大量节点性能与运营服务仍需另验。无需登录或小号，整个目标继续未完成。

## 当前普通组输出与选区复制（2026-10-11）

普通真实组的右中加号、递归叶子输出、一个共享目标及一次撤销已接。虚拟框与真实组由纯入口协议区分，不增加第二个框或重复 padding；派生组门控与 controller 的 raw graph owner 共用确切 predicate，characterAsset 不擅自禁用。组成员/入口/文档变化隔离旧菜单和提交，Escape 精确回对应加号；浏览器发现的共享取消链使焦点请求序号过期问题已修正并复验。

虚拟选区 Alt / Option 拖动一次复制并只移动副本；Ctrl / Meta 同时按下时带内部及上游输入边。纯计划与 Graph CAS、草稿投影、历史分层，复制包括最后未提交输入，失败不移动原件或部分插入。实际 NodeCanvas 回归与原生1280×720/390×844组输出验收见 [本批验收](./canvas-group-selection-functional-audit.md)，最终工程检查见 [验证历史](./verification-history.md#普通组输出与选区复制2026-10-11)。该历史批次Alt仅接虚拟框；普通节点/真实组入口的后续实现见上方最新记录。原生浏览器按住修饰键拖动、框体 autoPan/高级drop、Group新点提示、真机/Safari、大量节点性能和运营服务仍缺。无需登录/小号，整个目标仍未完成。

最终 `npm run check` **228文件/1895测试通过**，格式、零警告lint/边界、核心strict与生产构建通过；strict不覆盖全部JSX，CI未远端运行。实际日志 `artifacts/canvas-group-selection-final-check.log`。

## 当前多选交互与输出连接（2026-10-11）

虚拟选区灰色外框/可拖动fill与边条、固定screen尺寸锚定toolbar、多源加号/10px-300ms独立协议、80屏幕px autoPan、六项创建菜单、N条蓝色viewport预览和一次共享target已接。普通多选隐藏单节点浮条，整体移动保留多选且一次undo；aggregate容量/支持模型与视觉反馈分开。预览不入graph/保存；禁用或旧request不留下部分边/孤立节点。

最后150ms输入后立即多选卸载，history、Graph事务和autosave成功ack共用纯draft投影，保留当前基线且不覆盖新项目。真实NodeCanvas集成及原生1280×720/390×844已验；源码、工程检查、截图及适配见 [多选交互验收](./canvas-multi-selection-functional-audit.md) 和 [验证历史](./verification-history.md#多选节点交互与输出连接2026-10-11)。

本批最终 `npm run check` **225文件/1764测试通过**，格式、零警告lint/边界、核心strict与生产构建均通过，日志 `artifacts/canvas-multi-selection-final-check.log`；strict不覆盖全部JSX、CI尚未远端运行。

该历史批次尚未接的普通组输出入口与虚拟框 Alt / Meta 复制由上方新批次接入；普通节点/真实组 Alt 入口、框体autoPan/高级drop、Group新点提示、完整特殊renderer、真机/Safari、大量节点性能及运营写服务继续按差距维护。当前继续无需登录/账号资源，整个复刻目标未完成。

## 当前节点反馈与临时连接（2026-10-11）

普通节点的候选旋转光边、轻微倾斜、blocked/invalid 正文遮罩已按源接入。pointer capture 中使用物理 DOM hit，不能把捕获起点误当悬停目标；视觉候选与连接资格分开。永久内层包住标题、正文、端口、动作和内嵌生成器，反馈切换保持输入 DOM 与未提交草稿。

空白释放后显示微型临时节点/边，纯视图投影不进入图、保存或撤销；短按菜单无 ghost，未来创建位置按源350/100规则独立计算。菜单保留世界锚点，画布平移/缩放只重新定位、不抢焦点或重开子菜单。失焦/隐藏及文档/ready/readonly变化统一取消。真实桌面一次创建/撤销和390px菜单边界已验；持续反馈使用明确标注的合成PointerEvent驱动实际生产handler做GPU渲染，不能冒充原生持续按住或真机验收。

完整检查为217文件/1579测试通过，详见 [节点反馈审计](./canvas-node-feedback-functional-audit.md) 与 [验证历史](./verification-history.md#节点反馈与临时连接2026-10-11)。完整特殊renderer、多人/权益metadata、真机/Safari/native pinch、大量节点性能和运营服务仍未完成；当前版本继续无需登录。

## 当前节点触摸与连接（2026-10-11）

继续回应用户的节点手感反馈：一指板面平移/节点拖动、双指锚点缩放/抬指延续、鼠标/pen/touch互相接管已接。输入/媒体/滚动容器保留原生手势；fresh mouse双击不会被旧touch或连接click suppression吞掉。fit/zoom/touch共用源0.1–8与numeric padding，板面overflow:clip消除聚焦隐式scroll导致的坐标错位。

正反向端口拖连、80世界单位候选与DOM对向优先、40px边缘自动pan、合法预览吸附、蓝色流动/发光与非法延迟提示、短按类型菜单、空白创建关联节点及一次undo/redo已接。普通连接资格与新建资格分别维护，统一graph CAS和一次历史；menu同步request/owner，普通body关闭保留两击连接，其余取消完整清理。窄屏二级菜单上下避开trigger，防止hover后click误创建。源码、真实NodeCanvas回归、实际1280×720/390×844验收和适配见 [触摸连接审计](./canvas-touch-connection-functional-audit.md)；最终工程统计、日志和截图见 [验证历史](./verification-history.md#节点触摸与拖拽连接2026-10-11)。

本地actor继续无需登录，不改变libtv-*存储。临时ghost与普通节点光边/tilt由上方后续批次接入；真实手机/Safari/pinch、大量节点性能、完整特殊renderer、特殊团队/权益/主体边metadata和运营写服务仍缺；不能将模拟TouchEvent或本机夹具视作全站验收。

## 当前 PenStudio与节点操作（2026-10-11）

本地产品改为 PenStudio，标题、导航、Canvas/Studio/Agent、插件、Blender和学院外壳已更新；继续无需登录/注册/小号。原站内容与证据、素材来源、接口和旧持久化key保留。节点普通点击保持inline输入，超过4px才拖动并记一次历史；手型/Space/中键从节点平移、连线目标点击、末位位置、cancel/lostcapture/blur和文本滚动归属已修。4px是本机体验调整，区别于源默认1px。实际范围见 [交互审计](./canvas-node-interaction-functional-audit.md)。

单镜图片/视频已有版本消费、当前切换、只fit定位与脚本失败编号/原因已接。切换走源tk行规范化，真实readonly禁写但仍可定位；owner先捕获再flush，防止同ID新文档迟到写入。既有版本不等于成功任务创建服务；智能合成、费用、任务轮询/停止、历史创建、完整任务详情及运营写服务仍缺，见 [媒体历史审计](./script-media-history-functional-audit.md)。

最终 `npm run check` **202文件/1227测试通过**，格式、零警告lint、核心strict TS与生产构建通过；日志 `artifacts/penstudio-node-interaction-final-check.log`。实际1280×720节点拖动/单次undo/连线和原生文本滚动、390×844版本菜单/只读定位/保存恢复与品牌布局通过；完整touch mode、真手机/Safari与大量节点性能未验。截图和原文见 [验证历史](./verification-history.md#penstudio品牌节点操作与媒体历史2026-10-11)。

## 当前分镜提示词（2026-10-11）

单镜头/批量最终提示词已接本地自动拼接、模式保存、旧bundle覆盖确认、双轨500ms乐观保存、资产标签/@菜单和20秒撤销。立即关闭、pagehide及常规保存已settled后继续输入共用统一草稿投影；逐track基线拒绝外部新词覆盖，不复活删除行。手动编辑保留状态与hash，自动拼接按最新styleDescription与字段执行。源码与剩余范围见 [提示词拼接审计](./script-prompt-compose-functional-audit.md)。智能合成scriptText目录、费用/任务服务与完整任务详情继续未接；媒体版本菜单和失败编号/原因由上方最新批次接入，当前版本无需登录。

最终 `npm run check` **195文件/1071测试通过**，格式、零警告lint、核心strict TS与生产构建通过；日志 `artifacts/script-prompt-compose-final-check.log`。真实桌面/390px验证资产标签、原生undo/redo/整块删除、子菜单Escape、单/批取消覆盖/应用/20秒撤销以及未到500ms立即刷新恢复。中途空间不足后完整重跑成功，没有删改用户数据或缩减构建内容。截图和检查原文见 [验证历史](./verification-history.md#分镜最终提示词2026-10-11)，整体复刻目标继续进行。

研究始于 2026-10-10，更新至 2026-10-11。公开原站 https://www.liblib.tv/；用户已延期登录注册与小号/账号资源使用，登录态核对不作为当前推进条件。用户最新要求：内容不必全量，验收重点是所有页面功能与交互。全量采集已停止，使用代表性样本并预留服务器运营接口。

## 当前生成器、脚本、监视器与无需登录版本（2026-10-11）

生成器展开 / 八方向缩放、引用排序 / 删除、实际全画布@、ScriptV2九列表格 / 结构化对白运镜 / 两类手动prompt / 本地图片组已接运行入口。Studio监视器改为真实scene机位缩略图，复用主视口RAF与独占离屏资源。桌面 / 390px画布和实际GPU验证范围见 [本批审计](./generator-script-monitor-functional-audit.md)。

当前版本按用户要求无需登录：根App默认本地工作区，项目 / Canvas / Studio / 资产 / Skill直接使用；登录入口与弹窗不展示，不读写旧账号会话。账号 / 授权 / 权益 / 服务仍未接，不把本地actor当服务器身份。MCP授权明确不可用。截图 `artifacts/local-workspace-desktop-proof.jpg` 显示本地工作区入口；真实画布新增文本并立即刷新恢复。

ghost / Tab、分镜阶段与本地资产 CRUD / CSV、移动StudioInspector入口已由后续批次更新；v2 mixed2video配置及空视频建图已由上方新批次接入；完整主体资产、合成 / 版本、视频导出和实际生成 / 费用服务继续记录为未完成。统一检查统计见 [验证历史](./verification-history.md)，整体复刻目标继续进行。

该上一批统一检查 `npm run check` 通过：178 文件 / 880 测试，格式、零警告 lint、核心 strict TS 和生产构建通过。日志 `artifacts/generator-script-monitor-final-check.log`；strict 不覆盖全 JSX，CI 尚未远端执行，本地夹具 / GPU 验收不代表全站完备。

## 当前节点 AutoLink（2026-10-11）

image / video 已接名称 / 文件名变体 / 序号灰色补全、Tab / Shift-Tab / 点击接受、粘贴区间批量、Escape上下文拒绝缓存、独立全局浏览器偏好和hover / 首次提示。纯规则 / DOM / controller / view / strict TS storage boundary 独立；ghost不进入草稿保存，接受才提交实际token。实际无登录App、桌面及390px已验，详见 [功能审计](./prompt-autolink-functional-audit.md)。swap / 节点 picker 已由下方批次接入；内容标签服务与特殊token仍缺。

本批最终 `npm run check`：181文件 / 911测试，零警告lint、核心strict TS、格式和生产构建通过；日志 `artifacts/prompt-autolink-final-check.log`。统一当前结果见验证历史，整个复刻目标未完成。

## 当前节点引用动作（2026-10-11）

单个 badge swap 与普通 @ 的引用资产入口已接真实 InlineGenerator。替换仅改当前 occurrence、保留旧连线；资产首项 qualification / capacity / URL复用 / 新建批次纯模型与 request / shared picker 分层。批量图提交同次规范 incoming mode，最新文档生成 token，旧请求 pick / close 不能影响重新打开的请求。IME / mention 禁用关闭菜单；视频首项 poster 与媒体所有权有回归。源码、本机适配和未完成边界见 [引用动作审计](./prompt-reference-actions-functional-audit.md)。

本地无需登录 App 实测重复标签替换 / undo / redo、资产取消回焦点、两张已连资产批量插入 / 刷新、空 StarVideo 首次图片导入及一次画布 undo / redo。截图复核修复 transform 祖先造成的工具栏遮挡：picker portal 到页面根层；390px 弹窗 x16 / width358 / right374，页面宽390，66% 画布和展开层 Escape 通过。当前最终 `npm run check`：185文件 /973测试，格式、零警告lint、核心 strict TS和生产构建通过；日志 `artifacts/prompt-reference-actions-final-check.log`。真实标签服务、特殊token、主体 / 团队与运营写入等仍缺；登录继续不属于当前版本。

## 当前分镜资产、阶段与窄屏属性（2026-10-11）

ScriptV2 实际运行入口已接三阶段独立导航、本地角色/场景/道具CRUD、画布选图、改名/删除引用策略、图片预览和源CSV下载。图/普通连线统一一次history，失败表格草稿按原字段基线拒绝覆盖外部更新。源码确认空资产顶部idle但footer可下一步、stage allReady与输出stale可用独立；不再把V2导出误称XLSX。v2 mixed2video配置与空视频建图已由上方新批次接入；具体契约与剩余完整合成 / 历史 / 专属图片库 / 上传 / AI / 自动incoming见 [资产阶段审计](./script-assets-workflow-functional-audit.md)。

无登录App桌面和390px实测新增取消保留、名称/描述/图源保存刷新、清图与一次undo/redo、逐层Escape、选图/预览/删除确认、实际CSV回读。截图修复modal低于fullscreen与候选名称挤压；drawer桌面560px、窄屏390px，picker x24/width342。Studio 390px恢复项目资产开关，真实GLB位置X=0.35编辑后刷新保留，panel x150/width240，页面宽390，详见 [Studio审计](../src/features/studio/SOURCE_AUDIT.md)。全部手机Studio工具与原站登录后像素仍未验收。

当前最终 `npm run check` **189文件 /1010测试通过**，格式、零警告lint、核心strict TS、生产构建通过；日志 `artifacts/script-assets-workflow-final-check.log`。第一次public复制遇磁盘空间错误，最终重新执行成功，没有缩减构建内容。截图与详细检查见 [验证历史](./verification-history.md#分镜资产工作流与窄屏属性2026-10-11)。当前版本继续无需登录或小号资源，整个复刻目标继续进行。

| 页面/状态                    | 证据                                    | 实现                                                               | 验证/待办                                                            |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 首页/侧栏/导航/促销/新人红包 | 浏览器、HTML、源码、配置                | 原图、原文案、排序、响应式                                         | 桌面逐像素对照进行中                                                 |
| 作品列表/类别/搜索           | 浏览器、公开 API                        | 395 默认作品、分类数据、懒加载、预览                               | 核对搜索与滚动状态                                                   |
| 作品详情/作者主页            | 浏览器、597 详情/8 位作者数据           | 视频、计数、推荐、描述、分享；加载/找不到/失败重试                 | 播放器同款 Media Chrome、完整服务状态和逐像素对照仍待核对             |
| 查看创作过程                 | 浏览器、对应公开快照                    | 详情内全屏只读覆盖层                                               | 核对布局、缩放与关闭                                                 |
| Skill                        | 浏览器、公开列表/详情、客户端、通用配置 | 搜索分类、收藏、inline多引用、选择器、Mine管理、创建intake与文件树 | 有序多引用与本地Mine菜单已实现；真实审核/发布及全部像素仍缺          |
| 3D-BOX                       | 浏览器、动态源码                        | 预设文本及参数、本地工作区入口                                     | 本地编辑器可直接使用；服务执行和原登录态核对延期                     |
| 项目/资产                    | 浏览器/源码                             | 本地项目/回收站；资产目录、上传、分页、标签、批量/预览/下载/建画布 | 本地刷新和窄屏已验；真实 CRUD、团队/主体库、封面仍缺                 |
| 学院/教程/文章/课程          | 浏览器、原内容/视频、评论源码           | 列表、文章/教程/大师课详情；播放器浮窗/冻结帧/横屏抽屉、文章错误状态、frontmatter、评论/回复/分页/菜单 | 授权 Canvas、订单/进度服务、Safari/原生横屏和完整像素仍缺 |
| 活动/活动详情                | 浏览器、12 个活动原规则/170 作品        | 列表、奖项、内容、报名演示；报名 payload、提交中/失败保留与可注入 source | 真实报名接口、登录态、幂等/审核服务未接；见 [报名验收](./activity-registration-functional-audit.md) |
| 更新/CLI/Blender             | 浏览器、源码、原演示视频                | 独立界面及下载/复制入口；Blender WebGL 视频屏、反射/网格/视差      | Blender 桌面及 390px 实际 GPU 已验；Safari/减弱动画/上下文丢失仅单测 |
| 登录/会员/积分/客服          | 浏览器、公开价格/配置                   | 原站素材、套餐、FAQ；会员弹窗加载/失败/重试已接                       | 登录入口、支付/账号/订单服务未连接                                  |
| Canvas/导演台                | 公开快照、动态源码                      | 只读及本地编辑演示；剪辑器时间轴、字幕、转场、增益和可访问音频波形 | 登录态截图核对、完整高级时间轴、帧缓存、真机/跨浏览器和服务端能力仍缺 |
| MCP/Seedance/Skill 编辑分享  | 源码                                    | 补齐中                                                             | 待浏览器验证                                                         |
| 404/locale/forbidden         | HTTP/源码                               | 按原站处理                                                         | 直接进入/后退刷新待验                                                |

本记录的“实现”不代表像素及全部交互验收完成。真实 AI、付费订单及原站账户写入不属于独立前端服务能力。

## 工程结构迁移验证（2026-10-10）

- 页面按业务域拆分，路由直接懒加载所属入口；旧路径保留兼容出口。App、外壳、全局弹窗和编辑器文档/视口/键盘/持久化均已分离。
- 最终 `npm run check` 通过：27 个测试文件、118 项测试；Prettier、零警告 ESLint、核心 strict TypeScript、Vite 生产构建通过。完整日志为本地忽略文件 `artifacts/check.log`。
- 主样式拆为 15 个按原顺序加载的片段，506 个顶层 CSS AST 节点的规则/声明相同；次级样式 794 个有序节点等价。此比对确认级联迁移，不能代替逐像素检查。
- 浏览器实测：学院标签切换、版本更新页、TV Show 搜索“大象”、作品详情视频播放、同作品创作快照的只读加载与关闭；Skill 标题 Enter 打开详情，Escape 关闭并回焦点；390px 侧栏打开/导航关闭、body 滚动锁/恢复，页面 scrollWidth 与 viewport 均为 390。
- 新图库显式提供内容加载/失败/重试，组件回归验证失败恢复；Skill 草稿分类/正文、无效旧变量引用的修复有回归检查。本地项目新建、重命名、回收/恢复及文件夹创建使用假数据测试，未登录原站。
- 1,232 个当前无引用的素材/快照约 102 MB 可恢复归档；归档后审计 0 个新的未引用候选。运行样本仍约 924 MB，正式内容分页与 CDN 迁移待运营服务接入。

结构迁移记录为前一批次结果；后续已修复 GLB 实际重载和弹窗组合生命周期，见下文。全部原站视觉/交互与真实生成、支付、认证、协作仍需独立验收。

## 功能边界补全与工程稳定性

- Skill 卡片整体点击、私有/公共过滤隔离、收藏旧 ID、模型 allowlist 和分组、附件 readiness、结构化转交，以及次级页创建/分享文件树、上传总量、审核阻断、更新 CTA 与学院空配置均已补回归。原站与本地卡片标题中心可能被悬浮按钮覆盖，本轮对照确认存在同类区域，未用未经依据的 CSS 改写原行为。
- Canvas/Studio 离开前保存、已加载项目隔离、普通未发提示词、本地缩放恢复及统一 dialog-stack 已补齐。GLB 刷新恢复实际几何和材质，导出再导入通过本地浏览器验证。
- Skill → Canvas 的提示词、模型、Skill、图片在刷新后保留；服务未接入时保留创作参考，容量错误不清空输入。验收使用本地组件夹具，没有修改生产认证门槛或使用原站账号。
- 本轮浏览器详细步骤及 GLB 支持边界见 [编辑器审计](./editor-functional-audit.md)；[Skill 审计](./skill-functional-audit.md)、[次级页面审计](./secondary-functional-audit.md) 分别列出公开源码依据、已修项及剩余 P1/P2。

此处原有待办已由后续批次更新：紧凑/完整选择器、资产本地分页、评论前端与 Blender WebGL 已实现，证据和边界见下文。该时点缺少的 Canvas 原地 Skill 选择器、发送消息原位置和课程横屏接线现已更新，见文末。模型工具栏、生成模式、共享素材入口和当前画布 live 节点展示/定位已由文末批次更新。当前仍缺完整主体库/团队资产及跨项目定位；学院授权跟练 Canvas 与进度/订单写服务；原站所有编辑器工具和登录态视觉。远端cursor、浮窗和教程横屏组件已由本批更新，实际验收范围见文末。共享inline/slash、多引用、Mine更多菜单与三个课程详情路由已由后续批次实现，详细依据见下文。真实运营写服务、认证、生成、支付、协作继续暂缓，不能因构建或回归通过标完成。

前一编辑器批次（2026-10-11）`npm run check` 全部通过：37 个测试文件、189 项测试；格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。浏览器确认 Skill → Canvas 结构化引用刷新恢复、Canvas Agent 独立上传后发送/刷新恢复、原生音频 Tab 经过播放/进度/音量后回到弹窗、弹窗叠层关闭和 GLB 保存/刷新/导出再导入。验收采用本地演示夹具，不代表全部原站登录态功能已验收。

## 资产、选择器、评论与 Blender 后续批次（2026-10-11）

- 资产库拆成严格类型纯模型、共享存储 hook、页面/上传 hooks、卡片/目录/弹窗与下载/画布转交。`libtv-asset-library` version 1 将资产、目录、标签同次写入，兼容旧 `libtv-assets` 且保留原记录；损坏与配额错误不清空数据或输入。新增服务契约没有自动接通真实资产写入。
- 原站客户端规则已有独立实现与测试：三级目录、20/50 字名称、20 MiB 上传、300ms 全库检索、20 项本地分页、300 资产批量上限；图片/视频/音频预览、移动/标签/拖放、真实资源与 ZIP 下载、先持久化再创建 Canvas。复杂主体库、团队和封面等差距见 [资产审计](./assets-functional-audit.md)。
- Skill 选择器采用原配置的 15 项通用顺序，具备紧凑/完整窗口、分类/收藏/我的、搜索/加载更多、插入与嵌套详情。Canvas 创建入口保留上下文、一次性 query 消费、单选收集和 blocked 请求恢复；未接生成服务时不伪造 Skill。浏览器发现的 hover 后点击创建菜单关闭问题已修复并补鼠标/键盘回归。[Skill 审计](./skill-functional-audit.md) 的历史富文本/菜单缺口已由本批更新，真实发布服务仍缺。
- 大师课评论独立分层为纯模型、本地 repository、异步 hook 和视图；按实际页面使用 200 字、最新、隐藏排序/点踩/置顶。主评论/回复分页、权限菜单、错误恢复与移动抽屉均有组件回归；正式页面不注入测试评论，公开 metadata 计数与未收录正文的说明保持明确。[次级审计](./secondary-functional-audit.md) 记录服务和视觉差距。
- Blender 的独立 lazy scene runtime 实现视频纹理、原贴图反射地面/网格、视差与扫光；视频、RAF、监听器和 GPU 资源卸载有明确生命周期，保留 Drei MIT。真实画面验证含桌面 1280×720 与 390×844；Safari、reduced-motion 和 context loss/restore 尚未实际浏览器验收。[Blender 审计](./blender-functional-audit.md)。
- 本地浏览器实测：资产文件夹、PNG 上传改名/标签保存后刷新恢复，全局标签找回，预览内重命名自动聚焦与 Escape 回焦点；真实图片建 Canvas 的 80% 视口及创建 Skill 的 blocked 请求刷新恢复。390px 资产页无横向溢出，预览宽 358px，左右各 16px。完整 Skill 窗口内详情首次 Escape 返回窗口和触发标题，第二次关闭窗口并回 Skill 按钮；紧凑插入引用成功。大师课本地评论及带 @ 目标的回复刷新恢复。

验收只操作本地夹具及匿名 Blender 页，没有原站账号写入、下载安装、认证或支付。上面的测试不代表全部原站页面、逐像素或登录态功能完成。

最终检查：创建菜单鼠标修复后，`npm run check` 再次全部通过，60 个测试文件、291 项测试，格式、零警告 lint、核心 strict TypeScript、生产构建通过。完整日志在忽略目录 `artifacts/check.log`；桌面 Blender 画面在 `artifacts/blender-webgl-proof.jpg`。核心 strict 不覆盖全部 JSX，真实服务与上述路由差距保持未完成。

## 共享输入、Skill 管理与学院独立路由（2026-10-11）

- App只协调路由/外壳/全局UI；公共Agent模型与目录纯规则从Skills内部迁入services，Canvas解除Skills内部依赖。静态复核没有发现模块循环；资产/Studio写Canvas文档的边界未来可进一步收敛为稳定公开入口。
- TipTap共享输入支持文本中多个Skill/模型/媒体、/建议、@模型、Enter/Shift+Enter/IME、预览及单项删除。版本1草稿、session暂存与有序parts兼容；批量上传保留光标位置、可中止/失败重试，退出演示会话不再继续Skill上传。详情见 [输入审计](./agent-inline-functional-audit.md)。
- Mine源码权限、编辑/对话编辑、可恢复删除、完整发布验证及blocked请求已实现，不伪造审核或撤回。创建树折叠/嵌套/移动/重命名及导入取消/错误由独立模型和hooks负责；见 [创建树审计](../src/features/skills/create/SOURCE_AUDIT.md)。
- 学院course/practice/product独立路由、可注入repository、真实匿名访问状态与原专属会员四包；播放器状态/markers/next/prefs按源实现并测试。未公开确认的有效SKU、授权课程和Canvas协议没有伪造，见 [学院审计](./academy-course-functional-audit.md)。
- 浏览器1280×720：Skill文字中插入两个Skill和两个模型，删除后撤销恢复，发送至Canvas仍保留顺序；Canvas光标在“镜头”中间插入MD与WAV，读取完成位置不变，预览音频、发送及刷新恢复六个引用。390×844：输入与引用换行、预览入口可见，页面宽390无横向溢出；新标签无console error。
- 匿名课程页与原站一样保持无可播放章节的骨架；专属会员修正公共modal约束后，1280横幅x60、四卡原横排，390全屏年包居中/可切换，Esc关闭回入口且解除滚动锁。Practice实际错误与重试、Product未知SKU错误和无侧栏布局经本地浏览器核对；未登录、没有购买或解锁。
- Studio转画布存储配额失败保留场景和弹窗，不导航，恢复存储可重试；组件回归验证，不代表所有WebGL工具已验。

历史批次最终 `npm run check` 全部通过：**78 个测试文件、377 项测试**；格式、零警告 ESLint、核心 strict TypeScript 和生产构建通过。浏览器证据为 `artifacts/agent-inline-proof.jpg`；工程检查与本地夹具不能证明全部原站功能、像素或服务器行为完成。

## 模块化与可执行依赖边界（2026-10-11）

- 共享 Skill 界面与纯规则从 Skills 私有目录迁出，旧路径仅 re-export。SkillPage 587→285 行，输入视图249行/controller160行；Canvas 公共文档入口隔离资产/Studio 对内部模型与持久化的引用。ESLint 边界检查覆盖静态、lazy、re-export 和无插值模板路径，并验证旧 data.js 绕过与扩展名省略；不代替循环检测、完整类型化或 CSS 隔离。
- 资产远端选择器 source 分页已实现，20条/300ms、AbortSignal、游标校验、迟到隔离与同页重试，跨页/筛选选择保留；101条合成资产组件测试通过。真实运营服务器、团队/主体库和写接口未验，见 [选择器审计](../src/features/skills/assets/SOURCE_AUDIT.md)。
- 创建页真实 TipTap / lazy CodeMirror6 与条件 diff 已实现，代码模式此前称 Monaco 已纠正；浏览器在本地夹具中输入标题与正文，切换代码、全屏追加、返回预览、保存，再刷新查看详情，正文完整。未接内容优化时提示并保留内容；默认手动页不启用diff。serializer编辑后规范化、真实优化结果流程及复杂IME/剪贴板仍缺，见 [创建审计](../src/features/skills/create/SOURCE_AUDIT.md)。
- 播放器拆分控制栏/设置/目录、浮窗/视口/媒体/冻结帧 hooks与模型；公开教程真实播放，暂停于10.223587秒切换480P→720P后位置与暂停状态保持，Canvas宽高退为0。390px底部设置1.5x选择保留面板和焦点，Escape回“更多”、解除锁且无溢出。独立长内容夹具使用公开实际视频，浮窗宽360、右/下24；关闭暂停在5.408028秒，返回anchor后再次浮出且仍保留位置。横屏手机UA、Safari/权限/跨域Canvas失败未浏览器实测；本批时 Course 章节 drawer 仅组件实现、尚未接 CoursePage；后续接线见文末及 [播放器审计](./academy-player-advanced-audit.md)。
- 桌面共享Skill选择器保留正文/Skill/模型，完整列表下的详情Escape只退一层，第二次回Skill触发器；390px输入与选择器无横向溢出。紧凑搜索Escape回触发器且外部focus关闭不抢焦点有真实组件回归。Vite新编辑器预构建避免开发首次代码切换刷新；生产仍lazy分包。

历史统一检查（模块化与依赖边界）：**86文件 / 426测试**全部通过，格式、零警告ESLint（含架构规则）、核心strict TypeScript及生产构建通过。日志 `artifacts/structure-final-check.log`，截图 `artifacts/structure-mobile-proof.jpg` / `structure-editor-proof.jpg`。未使用原站账户、认证、购买或服务器写服务；该批的 Canvas 原地 Skill/消息位置缺口已由后续更新；原目标仍缺其他工具细节、正式协作和运营服务，不能标记整体复刻完成。

## Canvas Agent 与课程实际接线（2026-10-11）

- Canvas 工具栏与欢迎入口现在原地打开共享 Skill 选择器；当前上下文内创建复用 intake，手动创建开新标签。共享本地 Skill 验证隔离业务边界，损坏/回收/审核中记录不进入可用候选，不覆盖原数据。
- 当前画布 @ source 支持节点/模型/已有资源分组、视口优先、3项展开及全量搜索；节点身份、重命名/删除刷新、pending排除和异步竞态由独立纯规则与 controller 维护。源证据与节点定位/预览剩余差距见 [提及审计](./canvas-agent-mentions-audit.md)。
- 已发送消息按完整 parts 原位置渲染并保存，重复 Skill/节点 occurrence 保留。只读 ChatReplay 支持 serialized content 与媒体预览；公开 messages、本地 snapshot.messages、复制/快照分享/导出统一保留。坏文档阻断覆盖，写入错误不阻断可读快照，切项目先刷写旧消息；剪贴板拒绝保留链接并显示失败。见 [Canvas Agent 审计](./canvas-agent-fidelity-audit.md) 与 [消息审计](../src/features/canvas/messages/SOURCE_AUDIT.md)。
- 浏览器桌面实际插入同一个 Skill 到正文中间和末尾、完整列表/详情逐层 Escape，URL不变；添加文本节点并 @ 选中、发送后保持原位引用，刷新恢复消息与草稿。390×844 下 Skill弹层宽366、内部滚动，@菜单宽188可滚动，页面宽390。实际公开聊天样本复制后刷新仍有8条消息/3节点。证据：artifacts/canvas-agent-fidelity-proof.jpg、chat-copy-fidelity-proof.jpg。
- CoursePage 已接横屏 topbar/章节 drawer、共享 available 权限和切节保存；adapter 进度确认后刷新 TOC 保留播放器、2秒 hold与错误重试。正向组件回归涵盖手机 UA/目录/跟练复制链接和回焦点；本批未在真实手机 UA/native fullscreen/Safari 浏览器验收。默认匿名骨架不变，没有私人视频、购买/解锁或原站写入。见 [课程接线审计](../src/features/academy/course/SOURCE_AUDIT.md)。

该批结束时模型/资产工具栏、live 节点定位和课程营销尚未完成；这些前端接线已由下方批次更新。工具/生成消息、完整资产分支、跨项目定位、授权跟练、团队协作及运营写服务仍未完成。已保存历史公开生成消息不代表本地新生成；登录注册和账号资源继续延期。

历史统一检查（2026-10-11 Canvas Agent 与课程接线）：`npm run check` 全部通过，**93 个测试文件、483 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/canvas-agent-final-check.log`，证据 `artifacts/canvas-agent-fidelity-proof.jpg` / `chat-copy-fidelity-proof.jpg`。strict 不覆盖全部 JSX，课程正向 adapter 回归不等同于实际授权/手机浏览器验收，整个复刻目标继续未完成。

## 共享素材、工具栏、live 节点与课程营销（2026-10-11）

- 资产选择器提升为共享 UI/model/hook，Skills 旧路径只兼容导出；分页取消与选择保持原语义，新增只读预览。Canvas 加号按公开源码提供“本地上传”/“素材库添加”，v2 资产转多媒体或纯文本、每种20项整批上限在纯服务层处理。无可用数据及超限保留弹窗/选择，文本插入不执行 HTML。见 [素材入口审计](./canvas-asset-toolbar-audit.md)。当时目录 / 文本与团队筛选协议缺口由下方更新；真实团队权限和主体管理仍缺。
- 模型菜单显示真实17项图片/视频候选、插入当前光标；手动/自动模式独立于 parts，按 source dryRun 优先级保存本地 agentConfig、发送 metadata。非 modal 菜单复用定位/关闭 hook，未扩大架构白名单。见 [工具栏审计](./canvas-agent-toolbar-audit.md)。真实权益、偏好和 session 服务未接。
- 输入与历史消息共用 live 节点 presentation provider；当前节点改名/媒体变化同步，已确认删除保留保存名称并显示 tooltip，不重写 parts。inline 点击只 fit 当前节点，300ms，保持原选择；share replay 用当前快照，没有跨项目 adapter 不提供假动作。见 [节点审计](../src/components/agent/NODE_SOURCE_AUDIT.md)。跨项目定位、其他特殊 tag 和工具/生成消息仍缺。
- 本地 Canvas 浏览器：模式改为自动后 reload 保留；选资产前预览并 Escape，未自动选择，确认后插入媒体且画布仍仅原节点。节点重命名后历史消息/输入同时更新；点击消息引用得到 translate(70px,85px) scale(1)，选中节点计数0。390×844 的模型菜单 x8/宽370/右378/高384，素材弹窗 x16/宽358/右374/高764，页面宽390无横向溢出；Escape 回加号。桌面截图 `artifacts/canvas-toolbar-live-proof.jpg`。
- 课程 minute bar、完成 first/half popup、限频、paywall scene、sticky deny 和总跟练介绍/新窗口入口已接到实际 CoursePage。默认 unknown 权益不被当成非会员，真实购买/进度/私人 Canvas 没有伪造。见 [课程审计](../src/features/academy/course/SOURCE_AUDIT.md)。完成门控、限频失败、A→B→A 清理、fullscreen portal 在组件回归覆盖。
- 课程浏览器使用显式 QA adapter 的合成权限/内存进度及现有64秒公开教程，阈值6/12秒仅为夹具。真实播放出现 first popup，点击“立即抢订”打开四包会员；关闭后播完仍停章节1。A→B→A 返回0秒无旧分钟条。总跟练介绍“开始”实际新开 `/academy/practice/qa-course-adapter-fixture?sectionId=qa-practice-last`，课程标签保留。截图 `artifacts/course-marketing-adapter-proof.jpg` 带 QA 标识。全屏按钮在当前 in-app browser 没有进入 native fullscreen，因此不算 native fullscreen 验收；真实手机旋转/Safari 仍缺。

历史统一检查（2026-10-11 共享层与工具栏状态）：`npm run check` 全部通过，**107 个测试文件、549 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/toolbar-course-final-check.log`。核心 strict 不覆盖全部 JSX。原站账号/认证按用户要求延期，真实服务、团队协作、其余编辑器工具和全站逐状态像素仍未完成；没有将整个复刻目标标记完成。

## 参数、素材 source、消息动作与 GLB 动画（2026-10-11）

- 生成器 schema / UI / 接线分层，使用真实模型数量 / typed enum / originalField / 条件显示 / 冲突 / override / 高级分组；切模型不保留不支持的旧模式，默认模型与参考计数共用。StarVideo 2.0 浏览器改12s / count4 / 联网搜索关闭并输入提示词，生成明确不可用，刷新后完整恢复。该批尚缺媒体模式、音色条 / 库、媒体格式 / 时长规格、locked settings、batch 和节点内嵌样式；后续实现与仍缺范围见下方。高级数值规则误判及 native slider 差距已在 [审计](../src/features/canvas/generator/SOURCE_AUDIT.md) 中纠正。
- 新消息稳定id / createdAt，同次保存；用户 hover / keyboard 复制实际 DOM 正文，助手在本地完整轮最后一条复制整轮 raw Markdown。浏览器实际复制“工程结构验收消息”及服务状态文本均成功，时间显示03:44，未把时间 / 操作栏放入剪贴板；原空剪贴板恢复为空。source-session UI / 动作共用 guard，真实 switch / feedback 未提供。见 [动作审计](./canvas-message-actions-audit.md)。
- 共享素材 source 补目录 / breadcrumb、全局搜索、固定 created_at_desc、标签 / 注入团队成员筛选、独立文本及v2、详情重试与scope竞态隔离；Canvas / Skill 共用转换和每类20项 incoming batch。浏览器只读QA source进入“QA 分镜目录”预览两行文本，Escape只退预览；应用“分镜”标签清目录路径并全库找回文本，选择后插入原有“保留创作灵感”末尾并回输入焦点。390×844弹窗x16 / 宽358 / 高764 / 右374，页面宽390；未登录原站或提供团队权限。兼容type tabs并非943317中的原控件，真实主体管理与团队服务仍缺，见 [source审计](../src/services/asset-picker/SOURCE_AUDIT.md)。
- Studio导入1656B实际GLB：Slide2s / Grow4s，play时间实际推进，选Slide总时长2s，再点恢复all /4s。默认wasm路径成功解码1388B官方Draco box，浏览器没有error /warn；两模型刷新恢复为paused /3.22s，截图可见变换后的几何。实际导出3756B GLB解析有Slide / Grow两段、每段1channel、3meshes，文件 `artifacts/studio-browser-animated-export.glb`。Meshopt真实解码组件回归通过，未额外在浏览器导入；外部依赖 / KTX2 /完整运镜 /视频导出及手动关键帧烘焙仍缺，见 [Studio审计](../src/features/studio/SOURCE_AUDIT.md)。

历史统一检查全部通过：**119文件 /606测试**、格式、零警告lint（含工程边界）、核心strict TypeScript与生产构建。日志 `artifacts/generator-assets-studio-final-check.log`；截图 `artifacts/studio-animations-decoder-proof.jpg`、`asset-picker-folder-text-proof.jpg`、`asset-picker-mobile-proof.jpg`、`generator-settings-restored-proof.jpg`。浏览器使用本地用户 / 只读source / 合成GLB及公开官方decoder fixture，不表示运营服务器、真实生成、授权团队或原站账户已验收；工程优化批次已完成，整个复刻目标继续未完成。

## 生成器媒体、音色与真实 GLB 子树（2026-10-11）

- 媒体纯规则 / 共用 node-generator / 模型 useContent / 只读元数据探测分别维护，Panel 与 submit 使用同一结果。新增回归覆盖实际公开 schema 的模式 min/max / 组合、视频格式 / 尺寸 / 时长 / 大小未知门控、long-video、模板参数锁与范围外模型；schema 未加载或失败时保留原参数并禁用依赖配置的编辑 / 生成。普通 VideoGenerator 原 effect 的完整触发顺序尚未归档，不能把当前保留合法显式模式策略称为全部一致。源证据见 [媒体审计](../src/features/canvas/generator/MEDIA_SOURCE_AUDIT.md)。
- 可取消 FileReader 服务与 Canvas upload node 构造分层，保存实际 File.name 后缀 / size / type / sourceUrl；video 元数据来自实际播放器，不用画布尺寸或 MIME 猜格式。读取期间新增 / 编辑节点后，结果追加最新 nodes 并保留 edges；切项目 / 卸载 / 迟到回调不重插。实际 jsdom 文件读取、公开 kling-v3-omni schema 与 NodeCanvas 竞态回归通过，不等于真实服务器上传已完成。
- 使用源代码可核实的 Mantine Slider，固定本地9.7.1、原版版本未知，局部 Provider 和 Slider.css 无全局 reset。高级字段实际输入 .11 / Enter 后 slider aria-valuenow=.11、显示 .1；实际鼠标拖动结束提交5.1，再输入 .11 恢复；刷新后 .11仍保留。普通 blur 先 clamp 再零基准舍入，高级仅 clamp 保存真实小数，已纠正此前文档判断。完整 Pixel / Slider 版本及所有状态仍需更多对照。
- 实际音色条接只读 source，ID / metadata 同次合并、其他 advancedSettings 保留。桌面 QA 用23条合成目录（明确显示 QA adapter 标识）、现有公开少女音色 MP3；从第二页试听21（按钮变“暂停”），选择21关闭弹窗回“切换音色”，刷新后显示21且音量仍 .11。语言中文 / 普通话 / 青年筛选后显示三个 active chips。390×844 dialog x14、宽362、右376、高699.5，页面宽390无横向溢出；Escape回触发器。默认公开目录仅代表性单音色；原站账号目录、真实克隆 / 收藏 / 删除写服务未接。见 [音色审计](../src/features/canvas/generator/voices/AUDIT.md)，截图 `artifacts/generator-voice-precision-proof.jpg` / `generator-voice-mobile-proof.jpg`。
- Studio outliner pure model / actual GLB scene-tree / view 与 viewport命令分开。浏览器实际导入1784B嵌套GLB，四层 Detail 改名EditedDetail、X=.8、H隐藏，刷新后名称 / X / 显示按钮保留；显示Detail后隐藏Assembly，Detail眼睛指向隐藏父级，点击选中Assembly。恢复父级、MovingTriangle改名AnimatedMover后播放时间推进，暂停于.96s。实际导出2620B文件解析确认 EditedDetail translation=[.8,0,.5]、Slide translation target为AnimatedMover、Grow scale target为GrowingTriangle，两原clips均保留；文件 `artifacts/studio-browser-subtree-export.glb`、截图 `artifacts/studio-subtree-edit-proof.jpg`。原GLB visible不编码，隐藏状态只验证本地刷新。390×844页面宽390，但属性侧栏及开关仍隐藏，手机子树编辑未完成。没有console error /warn；未把这一结果扩展为所有GPU或所有编辑器工具验收。
- Studio 源 exporter 未找到通用 wrapper transform帧→clip 转换，已纠正“原站应有此烘焙”的推断。当前仍缺 cameraPaths/easing/shots、角色专属动画、子节点删除 / 复制 / 材质、导入轨道属性编辑与视频导出；生成器仍缺 batch、原节点内嵌视觉、完整tooltip/menu及特定合规工具。真实生成 / 服务 / 多人协作和全站逐状态像素仍未完成，登录注册 / 小号资源继续按用户要求延期。

历史统一检查（媒体与子树批次）：**135文件 /691测试**全部通过，格式、零警告 ESLint（含工程边界）、核心 strict TypeScript与生产构建；日志 `artifacts/generator-media-voices-subtree-final-check.log`。加入 Mantine 时测试 matchMedia 默认值曾影响播放器横屏回归，已保持尺寸驱动的 orientation查询并修复，全部回归重新通过。strict只覆盖核心TypeScript，浏览器使用本地 QA、合成 GLB与代表性公开音频；整个复刻目标仍未完成。

## 本批画布交互与相机分层（2026-10-11）

- 分组位置 / 复制 / 删除 / 解组 / 两类布局由纯模型管理，节点持久化保持父级相对位置；world用于edge / box选择 / minimap。手势hook按documentKey取消，真实挂载回归确认同ID跨项目拖动及切只读迟到move不写节点。多选控制器统一保存 / 副本 / Chat / Skill请求 / 下载取消；普通batch有依赖计划和可取消runner，实际executor / 费用未接。
- 提示词codec / DOM / controller / mentions / keyboard与Agent parts独立。当前参考token / 150ms / IME / 只读 / atomic删除undo / dragdrop有语义回归；完整NodeCanvas pagehide / immediate unmount通过统一draft projection保存未到debounce的输入，复制 / 本机分享 / JSON和文本导出共用该边界；retained合入state / 成功ack后消耗，避免undo/外部restore再被旧草稿覆盖。初始 / incoming / model同步与显式参数编辑分开，缺schema不丢参数；原enhanced全画布mentions仍缺，不能把基础列表当完整suggestion。
- 真实浏览器Mixed 2素材插入保留token，generate明确服务未连接。660px desktop面板与48px引用卡已接线，截图 `artifacts/canvas-inline-generator-proof.jpg`。390×844先发现右界425.8裁切，窄屏本地clamp后x20 / width350 / right370，pageWidth390；截图 `artifacts/canvas-inline-mobile-proof.jpg`。原站移动编辑器未知，适配不宣称pixel一致。
- 普通多选工具条保存2张实际素材为各自资产，空视频生成节点被显式忽略，位置 / 标签可填写，本机保存完成关闭弹窗；分组、水平布局、整组执行计划 / 开始blocked、解组和添加到Chat实际通过。Chat保留已有未发送文字并追加3个节点引用。ZIP实物可打开且testzip无错误，两份原素材字节独立保存；源后缀按真实URL保留。水印 / 远端权益服务未接不会冒充成功。证据 `artifacts/canvas-selection-download-proof.zip`。
- Studio真实导入4556B含2cams / 两paths / 原Slide和Grow，源6preset / 6easing接实际CatmullRomCurve3弧长路径 / 姿态和30fps轨道。浏览器Arc改Truck预设、duration4、state2.X1.2、easing=in、FOV46，镜头trim为0–3.1 / 3.1–6并刷新恢复。实际19816B导出含2camera / Slide+Grow+Path_Arc+Path_Truck，通道1 /1 /2 /2，stable镜头表在根Group node extras（AuxScene包Group，非scenes extras）；实际GLTFLoader回读确认ID映射、路径参数、X与4clips均正确。文件 `artifacts/studio-camera-export-proof.glb` / `studio-camera-export-readback.json`，截图 `artifacts/studio-camera-motion-proof.jpg`。没有path extras的原camera tracks会恢复为disabled可编辑rig，打开不改写原clip，编辑后才烘焙。

本批历史记录仍缺分镜专属batch参数、增强候选mentions、部分特殊生成器工具 / tooltip全状态、手机Inspector、PIP快捷键、generic wrapper烘焙、视频导出及所有真实运营写服务；桌面浮动机位预览已由 2026-10-18 专项接入。整个复刻目标继续进行，登录注册和小号资源继续暂缓。

历史统一检查（画布与相机批次，2026-10-11）：`npm run check` 全部通过，**156 个测试文件、796 项测试**；格式、零警告 ESLint（含工程依赖边界）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/canvas-inline-batch-camera-final-check.log`。本批最终窄屏页脚也已换行，选择模型 / mode / settings / generate 均在390px内，最终CSS进入生产构建。真实浏览器刷新后无新增error / warn；开发期间修改hook顺序触发过HMR重挂载，这不作为运行态通过证据。严格类型仅覆盖核心TypeScript；本地QA和实际GLB / ZIP回读不代表原站账号、真实运营或全站逐状态像素验收。

## 工程结构优化验收（2026-10-11）

本轮以工程职责收敛为主：Canvas节点动作 / Agent状态与动作 / snapshot独立；Studio逐帧逻辑不拥有资源；Storyboard旧媒体入口兼容；新脚本表格和增强候选为可注入模块，**未接当前运行入口**。所有原站功能仍以真实source和逐状态证据为准，不因模块/测试增加而改变完成范围。

实际桌面QA新增文本节点并编辑为“结构重构后的文本”，撤销移除、重做恢复正文；Agent发送“结构优化验收：保存输入与有序引用”，分享生成本机snapshot链接，刷新恢复节点 / 输入 / 完整消息。390×844独立QA发送“窄屏结构验收”，刷新输入和对话恢复；mode菜单Escape关闭回trigger，DOM内宽与scrollWidth均390。临时viewport与3个QA tabs已清理，用户原tabs保持。

Studio用4556B合成相机GLB导入、成片预演播放至4.22s后暂停；真实GPU出现蓝/橙几何，原Slide / Grow及QA_Arc / QA_Truck镜头仍可用。“截取当前视窗”实际下载235704B、2560×1060PNG，对应最新成片frame。无新增monitor功能，placeholder、移动Inspector等差距仍保留。

旧batch审计对storyboardVideo参数过滤的概括已纠正：普通settings保留，只有embedded advancedSettings过滤batch:true。独立video纯模型的source依据 / 验证范围见storyboard/SOURCE_AUDIT，不能外推普通组设置。

历史统一检查（2026-10-11 工程职责收敛）：`npm run check` 全部通过，**165 个测试文件、835 项测试**；格式、零警告 ESLint（含跨域与域内依赖方向）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/structure-controller-final-check.log`。本地运行 Node25.2.1；GitHub CI配置为Node24且尚未远端执行。浏览器确认桌面节点创建 / 正文修改 / 撤销重做 / Agent发送 / 本机分享及刷新恢复；390×844发送 / 草稿恢复 / mode菜单Escape、页面scrollWidth390；实际GLB相机动画预演与最新帧PNG截图成功，三页error/warn为空。证据 `artifacts/structure-canvas-proof.jpg`、`structure-canvas-mobile-proof.jpg`、`structure-studio-capture-proof.png`。strict仍只覆盖核心TypeScript；新增可选脚本表格与全画布候选未接运行入口，真实运营 / 完整原站功能 / 逐像素完备仍未完成，认证与账号资源继续延期。

## 工程结构优化收尾（2026-10-11）

补充真实 Three TransformControls 资源所有权回归，修复 helper 被 controls 释放后再由 scene sweep 重复处理的既有问题。最终 `npm run check` 166 文件 / 836 测试通过；本地 QA 立方体 X=1.2 实际 GPU 显示、离开后的 React 卸载和再次建立视口无 error / warn。截图 `artifacts/structure-maintenance-studio-proof.jpg`；详细日志与边界见 [验证历史](./verification-history.md#工程结构优化收尾2026-10-11)。本轮未补新功能，原有分镜 / 增强 mentions / monitor / 手机 Inspector 等缺口不变。维护文档历史记录集中归档，agent.md 统一入口；认证和账号资源继续暂缓。

## 独立互动影游扩展

用户授权的新业务域 `/interactive-film` 与 `/interactive-film/play/:releaseId` 已接入，项目页具有独立影游repository。当前按用户纠正沿用LibTV Canvas的深色画布、50px顶栏、媒体主体节点/外部标题、左竖工具与左下缩放，互动作为画面叠层；库与属性按需浮出，画布默认铺满。280×184节点几何与连线/框选/fit一致，不迁移旧坐标。真实Blob缩略画面定位trimIn，取消/迟到/URL释放与缺失重试有回归；互动继承仅在可达前驱同媒体/同切点时预览，不写mediaId或trim。8类节点、变量、同步文档/IndexedDB媒体、纯状态机、离线IIFE与发布分层，共享pointer/wheel/touch保留原Canvas策略。视频choice可提前选择并在片段末帧冻结，QTE窗口跟随媒体局部时间。

隔离 `output/film-style-release-workspace` 的Node24.19.0完整check通过280文件/3058测试，02:39:43开始、测试88.86秒、构建9.70秒，格式/零警告lint/边界/核心strict通过，见 [冻结检查](../output/film-style-frozen-check.log)。部署后974源码SHA不变，156静态文件无三项实际密钥泄漏。图形媒体7项与实际FilmEditor8项定向共15项通过；发布客户端11项、继承背景19项等包含在完整检查内。真实1440/390编辑器库trigger开关、Inspector关闭、缩放菜单、嵌套Escape/回焦点/无横溢通过，见 [生产编辑器QA](../output/playwright/film-style/editor-production-qa.log)。真实Chrome的choice/QTE时序、原Canvas拖动/多选/复制分组/切项目隔离及原生触摸平移/缩放/cancel仍见 [影游审计](./interactive-film-audit.md)；不推断物理手机/Safari。

新Preview `dpl_FqhoeJgPnrbNAtTKFXtJ2drP5vx7` /l60lahl07已READY，2530文件/89,999,953字节；真实PUT1次、首次complete成功、重复200，发布revision284的release `2ed10a7c-3009-41a9-aeae-0cf2a1610de3`。匿名三结局与390px暂停4.7秒/全屏/无溢出通过。当前20,414字节runtime SHA为 `4e436dc3752c09e4069a5ce94d55a1af558d6ba0317cc68f96832f3039175399`；611,900字节ZIP保留17节点/19边/2变量/3结局、仅一份完整MP4，实际file://断网三结局通过，见 [离线QA](../output/playwright/film-style/offline-three-endings-final.log)。

新生产 `dpl_J93mBxkb8QH7cxPYYRAYtNDQuaSg` /g08glkifn为READY，2530文件/89,999,971字节，[编辑入口](https://penstudio-libtv.vercel.app/interactive-film)与 [新匿名示例](https://penstudio-libtv.vercel.app/interactive-film/play/2ed10a7c-3009-41a9-aeae-0cf2a1610de3) 已验；新作品三结局/白色圆形开始按钮/选项样式/SRI及390px暂停4.8秒等待1.1秒不变、全屏视频与热点、scrollWidth390通过，见 [三结局](../output/playwright/film-style/production-endings.log) 和 [390px](../output/playwright/film-style/production-390.log)。HTTP两轮各66/67，各有一个不同请求在HTTP前TLS EOF；顺序复验2/2成功，67个唯一门控均已成功，不记单轮67/67。三旧release实际SHA保持旧版本，四媒体584,729字节/MIME/CORS正确，见 [首轮](../output/film-style-production-http-check.first-run.json)、[第二轮](../output/film-style-production-http-check.json) 与 [复验](../output/film-style-production-http-recheck.json)。旧release `f72577e9-255b-44d2-8527-78dab3845607` 在新生产匿名会话三结局通过，原SRI不变，1440px无横溢，见 [跨部署旧作品](../output/playwright/film-style/old-release-endings.log)。

历史影游275/2928和268/2798检查保留；旧生产 `dpl_FZ4mMy4XLnPaoahWCfBSTywXr5Tc` 的2540文件/89,998,931字节、63/63HTTP与旧离线包15,066字节runtime均为当时记录。旧不可变部署及release保留原编辑器/播放器样式，不自动升级。冻结检查不涵盖主工作区后续修改，本机/mock测试不冒充云端结果；此扩展不是原站隐藏编辑器source复刻证据，原Canvas/Studio生成、支付、认证与运营写服务边界不变。物理手机/Safari、持续断流、跨设备创作同步与媒体垃圾回收仍缺，具体版本/证据见 [影游审计](./interactive-film-audit.md) 与 [部署记录](./vercel-deployment.md)。
