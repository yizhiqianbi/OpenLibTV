# Canvas 智能剪辑编辑器维护与验收（2026-10-15）

本批把公开源码已核实的 VIDEO_CLIP 专属入口接到本地 PenStudio Canvas。内容仍使用代表性样本；不读取登录态，不向原站写入，也不把本地状态当作云端生成或导出成功。

2026-10-16 波形显示维护：公开 `1q5w-zbtkz5ka.js` 的 `waveformService.getPeaks`、`extractPeaks`、`drawAudioWaveform` 证据确认音轨使用真实 min/max 峰值，而不是音量线或占位柱。时间轴现在对音频素材通过浏览器 `AudioContext` 读取可访问 URL，按多声道帧聚合为峰值对并绘制 SVG 波形；直接提供的已验证峰值也可用于运营 source。波形只属于视图缓存，不进入时间轴文档、CAS、撤销历史或恢复副本。读取失败、取消、无 `AudioContext`、全无效采样或 CORS 不可达时保留原音频片段和增益编辑，不绘制伪造样本。定向 3 文件 / 43 项通过；Node24.19.0 完整 `npm run check` 为 **475 文件 / 6605 测试**，格式、零警告 lint、核心 strict 和生产构建通过，Vite 3695 modules、build 12.39s。证据见 [波形验证](../artifacts/clip-waveform-verification.json) 与 [波形专项日志](../artifacts/clip-waveform-full-check.log)。本批未宣称远程 CORS、视频内嵌音轨全量波形、真机 Safari 或服务端导出已完成。

2026-10-16 视频片段内嵌波形维护：公开 `drawVideoClipBottomWaveform` 与 `embedAudioMuted` 门控证据确认视频片段也有底部波形条。时间轴只为选中的、明确标记为视频的片段按需复用 AudioContext 波形读取；未选中的视频不主动下载，已静音内嵌音轨、CORS/解码失败和不支持浏览器保留 poster/片段编辑。波形仍只属于视图缓存，不进入时间轴文档、CAS、撤销历史或恢复副本。定向 2 文件 / 40 项通过；Node24.19.0 最终完整 `npm run check` 为 **477 文件 / 6612 测试**，格式、零警告 lint、核心 strict 和生产构建通过，Vite 3698 modules、build 11.32s。证据见 [视频波形验证](../artifacts/clip-video-waveform-verification.json) 与 [视频波形专项日志](../artifacts/clip-video-waveform-full-check.log)。本批未宣称远程跨域视频、所有 codec、真机 Safari 或服务端媒体缓存已完成。

2026-10-16 视频帧缩略图维护：公开 `1q5w-zbtkz5ka.js` 的 `thumbnailStore`、`videoFrameCache`、`drawVideoThumbnails` 和片段源时间换算证据确认视频轨应显示真实帧序列。时间轴现在按 `sourceOffset`、片段时长和速度从可读取视频 URL 抽取最多 6 帧，使用视图缓存渲染 filmstrip；抽帧取消、CORS/编解码失败、不支持的浏览器和无效 URL 自动回退已有 poster，不写入时间轴文档、历史、CAS 或恢复副本。定向 3 文件 / 40 项通过；Node24.19.0 完整 `npm run check` 为 **477 文件 / 6611 测试**，格式、零警告 lint、核心 strict 和生产构建通过，Vite 3698 modules、build 13.26s。证据见 [缩略图验证](../artifacts/clip-thumbnail-verification.json) 与 [缩略图专项日志](../artifacts/clip-thumbnail-full-check.log)。本批未宣称远程跨域视频、所有浏览器 codec、真机 Safari 或服务端媒体缓存已完成。

最新基础VTT字幕：新增/搜索/选择、正文/全局样式/应用全部、显示隐藏/删除、时间轴移动裁边、历史与末次输入保存及主画面叠层已接。专项25文件/496项、Chromium桌面/390与Node24完整443文件/6429测试、格式/lint/核心strict/标准构建通过，见 [字幕验收](./canvas-clip-subtitles-functional-audit.md)。下文全局VTT未接属于历史范围；HTML字幕/普通文本、完整字体目录、视频内嵌音轨全量波形与真实导出仍缺，本机未部署。

2026-10-16 源片段字幕操作维护：VTT 与 HTML 字幕均保留片段来源，右键片段菜单可隐藏/显示或删除当前片段字幕；VTT 使用 cue hidden/来源删除，HTML 使用独立 `cueHidden` / `removeClipCues` patch，复用历史/CAS/刷新恢复，不影响其他片段。定向 2 文件 / 38 项通过；Node24.19.0 最新完整 `npm run check` 483 文件 / 6623 项通过，证据见 [片段字幕操作验证](../artifacts/clip-subtitle-clip-actions-verification.json)。字幕生成、云端写入、真实导出和跨浏览器媒体边界仍缺。

2026-10-16 文字/字幕轨道重排维护：普通文字与 HTML 字幕时间轴新增键盘可达的上移/下移按钮；`reorderTracks` 在一次 patch 中重映射 cue、嵌套轨道、z-index、隐藏状态和 overlay group anchor，非法顺序整体拒绝并保留原文档。定向 2 文件 / 29 项通过；Node24.19.0 最新完整 `npm run check` 483 文件 / 6626 项通过，证据见 [轨道重排验证](../artifacts/clip-track-reorder-verification.json)。完整轨道新增、拖拽连续重排、字体/预设远程目录、字幕生成、云端写入、真实导出和跨浏览器媒体边界仍缺。

2026-10-16 文字/字幕新增轨道维护：普通文字与 HTML 字幕在选择轨道状态下可创建下一个连续轨道，分别受 8 条与 4 条上限约束；跳号、超限和无效请求整体拒绝并保留原文档。定向 4 文件 / 53 项通过；Node24.19.0 最新完整 `npm run check` 483 文件 / 6629 项通过，证据见 [新增轨道验证](../artifacts/clip-track-create-verification.json)。完整拖拽连续重排、字体/预设远程目录、字幕生成、云端写入、真实导出和跨浏览器媒体边界仍缺。

2026-10-16 文字/字幕连续拖动重排维护：轨道把手支持原生拖动到目标轨道，普通文字与 HTML 字幕共用 `moveTrackOrder`，drop 进入 `reorderTracks`，并与片段移动/裁切 pointer 手势隔离。定向 5 文件 / 55 项通过；Node24.19.0 最新完整 `npm run check` 484 文件 / 6631 项通过，证据见 [拖动重排验证](../artifacts/clip-track-drag-verification.json)。触摸拖拽、跨浏览器原生拖放、字体/预设远程目录、字幕生成、云端写入、真实导出和其他媒体边界仍缺。

最新转场库/属性、独立切点、数值、删除/历史、调宽记忆及DOM循环预览已接。Node24.19.0完整438文件/6408测试、格式/零警告lint/架构/核心strict/标准生产构建全部通过，专项20文件/475项通过；见 [当前工程验证](../AGENTS.md#当前工程验证) 与 [操作审计](./canvas-transition-controls-functional-audit.md)。下方ENOSPC/未接转场文字属于旧批次范围，不能作为当前结论；本机未部署，剪辑剩余范围继续保留。

2026-10-15 后续：片段级 `transitionIn` 的四种实际画面预览已接入并完成 Chromium 像素、GUI 撤销/重做/刷新和 390px 布局验证。下方“转场预览未接入”保留为前批历史边界；当前支持范围、原站静态证据、专项结果与剩余差距见 [转场预览审计](./canvas-transition-preview-functional-audit.md)。

2026-10-16，依据公开 bundle 的 `clipDetachAv`、`clipDetachAudioHint`、`clipNoEmbeddedAudio` 和 `extractEmbeddedAudioAsWavFromVideoClip` 证据，右键“音视频分离”已接入本地闭环：真实视频 URL 经浏览器 AudioContext 解码为 PCM WAV，作为音频源节点加入当前剪辑节点，音频片段与原视频片段对齐并关联，原视频内嵌音轨写入 `embedAudioMuted`，整次操作进入时间轴历史/CAS。无音轨、已分离、未准备或无法读取的素材保留明确失败状态；人声分离仍需服务端任务。定向5文件/94项及Node24.19.0完整 **463文件/6570测试**通过，Canvas主分包899867字节低于900000预算，证据见 [音轨分离验证](../artifacts/audio-separation-verification.json) 与 [源摘录](../artifacts/audio-separation-source-evidence.json)。本批没有新增独立GUI媒体分离样本，未宣称远程CORS、移动端Safari或运营服务已验。

## 已接入

- 专属 `CanvasVideoClipNode`：真实首个视频来源预览、空态、准备态、输出预览和节点尺寸同步；视频／音频素材共享节点几何，测量写入 `measured`，不制造历史。
- 专属 `VideoClipComposer`：默认模式、讲解视频、批量广告、素材混剪四种入口，独立参数 schema、参考素材连接、图片／视频 poster 预览、模式图标和本地 Agent 请求边界。服务未连接时保留提示词和结构化 parts，不假造 pending、任务或成片。
- `ClipTimelinePreview`：按真实 URL 读取 native metadata，逐素材首帧／实际 offset 准备，视频多层 transform、mask、fit、静音和独立音轨；媒体失败、超时、取消和重试可见，展开与收起移动同一媒体 host。时间轴视频片段同时支持可访问素材的真实帧 filmstrip，读取失败回退 poster。
- `VideoClipTimeline` 与纯 timeline model：播放位置、选中、移动、裁切、拆分、轨道控制、缩放、吸附、主轨保护、撤销／重做、素材边连线差异同步。片段级 `subtitleUrl` 会按真实映射 URL 挂载原生 `<track kind="subtitles">`，随片段替换和卸载清理；音频轨已显示可访问素材的真实解码波形并保留无波形回退；全局 VTT、HTML 字幕、转场完整导出、帧缓存和服务端导出仍保持明确边界。
- 片段音量增益线已按公开 bundle `1q5w-zbtkz5ka.js` 的 `hitTestAudioVolumeLineBand`、`onAudioVolumeLineDrag` 与 `applyClipAudioGain` 接入：视频片段底部 14px、音频片段对应增益线均可拖动，使用原 `-60–20 dB` 非线性曲线，键盘上下以 0.05 slider position 微调；编辑通过现有 begin/preview/end 事务进入单次历史、CAS 保存和恢复副本，播放器复用相同 clip gain。波形使用独立视图缓存并按当前 fader gain 显示，不把本地增益当作云端混音结果。
- 转场编辑现在按公开源 bundle `research/source/1q5w-zbtkz5ka.js` 的 `uE/uL/uF/uU/uj` 规则提供本地片段级状态：主轨相邻片段的右片段保存 `transitionIn`，支持 `fade`（含 `crossfade` 别名）、`dissolve`、`fadeblack`、`fadewhite`，时长按相邻片段和 0.2–10 秒边界限幅；时间轴以可聚焦标记显示转场并可点选右侧片段。该动作进入现有十步历史和 CAS 保存边界，仍不会把未实现的预览／导出标记为已完成。
- 片段复制／粘贴已按公开文案 bundle `research/source/2ijgtfwpg93os.js` 的 `clipContextCopy`、`clipContextPaste`、`clipCopyVideoOnly` 合入本地闭环：右键菜单与 `Cmd/Ctrl+C`、`Cmd/Ctrl+V` 均可用；仅允许单个视频片段，复用已连接且已准备的 Canvas source node，粘贴生成新的 timeline clip id，并按当前播放头走现有插入、轨道布局、十步历史、CAS 保存、撤销／重做和冲突恢复。复制不启动上传或服务任务，媒体未完成 URL-matched metadata 时保留剪贴板并明确提示。人声分离、真实字幕生成仍需要服务能力；音视频分离已按上方本地 WAV 提取协议接入。
- 收起预览的媒体 host 现在按原合同进行有界 portal 放置：节点在视口虚拟化或暂时不可见时最多重试 300 个 animation frame，随后在时间轴上显示“回到节点”入口；回焦通过当前文档／节点 owner 与真实 Canvas 几何执行，不写入时间轴或制造节点数据。
- 保存与所有权：时间轴独立十步本地历史，素材连线变化走画布 CAS；切项目、A→B→A、StrictMode、迟到 metadata、quota、外部冲突和非权威时间轴追加均有实际 controller 回归。冲突可保留页面内副本、打开最新 raw 时间轴，再显式恢复副本；缺失素材时拒绝自动重连并保留副本。
- 播放器状态通过编辑器订阅更新，播放进度不会逐帧重新渲染整张 Canvas；外层壳仍响应展开、收起和高度变化。

## 当前证据

2026-10-16 音视频分离批次：浏览器 WAV 编码、AudioContext 解码/关闭、取消与失败状态专项通过；时间轴菜单能力门控、音频节点对齐、原视频静音和已有音频片段关联回归通过。最终检查日志 `artifacts/audio-separation-final-check.log`，Node24.19.0 **463文件/6570测试**、测试207.13s、标准build15.67s；1382源码/config冻结无漂移，Canvas899867/ClipEditorWorkspace230417字节。生产未部署。

2026-10-16 人声分离入口：公开文案明确提供“仅保留人声”“仅保留背景音”“仅保留音效”三个选项，并在超过3分钟、无内嵌音轨、已做过分离或服务不可用时阻断。本地右键菜单接入同一选项顺序、键盘可达的子菜单和纯规则；默认服务适配器未连接时提示“人声分离服务尚未连接”，不创建音频节点、不伪造任务成功。定向3文件/90项通过；最终Node24.19.0 **464文件/6573测试**，测试135.76s、标准build11.52s，Canvas899943字节低于900000预算。证据见 [人声分离验证](../artifacts/vocal-separation-verification.json) 与 [源文案](../artifacts/vocal-separation-source-evidence.json)。

2026-10-16 剪辑工程导出：公开 source 文案提供“导出到本地”及空时间轴、素材加载、blob URL、缺远程 URL 的阻断状态。本地导出按钮生成 version 1 `.libtv.json` 工程文件，序列化当前时间轴、轨道开关/音量、片段裁切/转场/增益和素材 source URL；下载前拒绝空工程、缺 URL 和 blob URL，避免生成不可恢复文件。远程 PR/剪映、成片编码、云端保存与真实运营写服务仍保持边界。专项3文件/92项、最终Node24.19.0 **465文件/6577测试**、Canvas899975字节通过，证据见 [导出验证](../artifacts/clip-export-verification.json) 与 [源文案](../artifacts/clip-export-source-evidence.json)。

2026-10-15 复核：片段复制/粘贴已接入右键及 Cmd/Ctrl+C/V，并通过单片段媒体准备、CAS、历史与恢复回归；该历史批次根目录 `npm run check` 为 **433 个测试文件／6366 项测试**，前文 431/6353 为历史快照。

- 剪辑域定向测试覆盖直接删除／拆分／裁切／轨道控制的撤销重做、素材边恢复、播放意图、冲突恢复及拖入媒体；媒体准备新增画幅高度回调和上传专项均通过。
- 字幕专项覆盖原生字幕轨道的 URL 映射、替换、移除及 unsupported 能力边界，`playback-model` 与实际 `ClipTimelinePlaybackRuntime` 共 48 项通过。
- 音量增益专项覆盖原始曲线的默认、静音、正增益及异常值、时间轴增益线键盘微调和控制器保存后的撤销／重做；剪辑域定向集合本批为 151 项通过。
- 历史源码全量检查曾通过：Node24.19.0 `npm run check` 为 431 个测试文件、6353 项测试，格式、零警告 lint、核心类型检查和生产构建全部成功；原current日志为滚动路径，不能作为当前通过证明。此前 `artifacts/canvas-clip-editor-final-check.log` 仅作历史快照。
- 实际浏览器可打开“智能剪辑”，看到真实远端视频双片段、时间轴和准备完成状态。冷启动远端素材可能超过 15 秒 metadata 窗口，页面显示“媒体元数据准备超时”并提供“重试读取素材”，不伪造 ready。

## 未完成边界

真实 WebAudio 多轨播放、不同浏览器的 autoplay／高倍速限制、原生手机触控、Safari、高 DPR、大量节点性能仍需另验。远程 CORS 波形、视频内嵌音轨的完整波形读取、全局字幕 VTT、HTML 字幕／叠层、转场完整导出、帧缓存、真实导出、云锁、协作、服务端上传、生成、费用和账号服务未接入；原站逐像素登录态和全部运营状态不在本地无需登录范围内。恢复副本的素材集合、媒体准备和显式关闭保存已接入本地；拖入视频／音频会在当前会话内按目标节点原子创建、校验连接并在真实 metadata 就绪后写入时间轴，但仍不代表云端锁或协作恢复。
