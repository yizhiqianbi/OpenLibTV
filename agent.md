# Agent 维护入口

## 当前验收范围冻结（2026-10-18）

本轮按桌面 Chromium、本地单用户前端状态和已确认的服务边界评估。协作、远程配置、多语言以及触摸/Safari 不纳入完成度扣分；登录注册、小号资源、真实生成、支付、云端写入和运营服务仍单独记录为未接服务边界。当前整体工程估算约 **75%（72%–80%）**。当前工作区最新 `npm run check` 通过 **501 个测试文件、6751 项测试**，日志 `artifacts/current-continuation-full-check.log`；3D-BOX、Canvas 的桌面浏览器回归见 `artifacts/current-continuation-verification.json`。历史条目中的 70% 仅表示当时范围，不覆盖本次冻结。

2026-10-19 当前桌面浏览器回归已完成：`/3d-box` 可进入空白编辑器，导出面板在没有动画时禁用视频下载并显示原因；`/canvas` 的添加节点菜单可创建文本节点，属性面板和节点卡片保持可见，控制台没有 error/warn。该回归只记录本地单用户桌面行为，不把真实生成或后端写入当作成功。

2026-10-18 Canvas 显式 target 模式已完成本地接线复核：参考拾取、区域聚焦、元素标记和 ScriptV2 toolbar 的 target eligibility 均由当前 Canvas mode owner 提供，CanvasNode/CanvasGroupNode 遮罩与 pointer 隔离保持独立。专项 **25 个测试文件 / 440 项通过**，证据 `artifacts/canvas-explicit-target-verification.json`。真实生成、审核、上传和账号权限仍是服务边界。

2026-10-18 Studio 浮动机位预览已完成：监视器卡片可以打开实际 Three monitor frame 的桌面 PIP，支持标题栏拖动、播放/暂停、关闭和内部 pointer 隔离，位置只存在于当前视口。Studio 专项 **30 个测试文件 / 145 项通过**；最新完整 `npm run check` 通过 **498 文件 / 6739 测试**，构建3713 modules、18.60s，日志 `artifacts/studio-pip-full-check.log`，证明 `artifacts/studio-floating-preview-verification.json`。

2026-10-19 Studio WebM 视频导出已完成桌面分支：导出面板根据动画状态门控，viewport command 使用 canvas.captureStream + MediaRecorder 协商 VP9/VP8/WebM，按时间轴逐帧采样并下载 Blob；面板显示进度并可取消，能力缺失/无动画/失败保留明确错误。Studio 专项 **30 个测试文件 / 147 项通过**；最新完整 `npm run check` 通过 **499 文件 / 6744 测试**，3714 modules、13.96s，日志 `artifacts/studio-video-progress-full-check.log`，证明 `artifacts/studio-video-export-verification.json`。

2026-10-18 Studio 导入子树副本已完成：GLB 子节点可在 Inspector 创建副本、复制/粘贴和删除，副本使用稳定 copy ID，独立几何/材质资源，支持名称/变换编辑、撤销/重做、刷新恢复和 GLB 导出，源路径与原始 subtree metadata 保持不变。Studio 域专项 **29 文件/143 项**通过；最终 `npm run check` 通过 **495 文件/6727 测试**，测试193.43s、build13.61s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过。日志 `artifacts/studio-subtree-copy-full-check.log`、证明 `artifacts/studio-subtree-copy-verification.json`。本地副本不代表协作锁、云端写入或远程同步。

2026-10-18 选中边与混合删除覆盖记录已校准：选中边 Delete/Backspace、node+edge 混合删除、分镜关联确认和 VIDEO/AUDIO→VIDEO_CLIP 断线均已接统一 coordinator，实际 App 回归19项，桌面/390px GUI文档19份；完整 `npm run check` 通过 **407 文件/5862 测试**，日志 `artifacts/canvas-selected-delete-validated-check.log`，详见 `research/canvas-selected-delete-functional-audit.md`。README 与 coverage 中的旧“仍未接入”描述已改为当前状态；完整 clip renderer、特殊 3D 工具、协作/云锁和真实服务仍未接入。

2026-10-18 画布资产库媒体类型维护已完成：图片/角色、视频和音频标签现在只显示对应媒体 URL；音频资产会创建 `audio` 节点并保存音频 URL，视频记录不会误出现在音频页，无匹配媒体时显示空态。定向 `CanvasDialogs.test.jsx` **1 文件/5 项**通过；最终 `npm run check` 通过 **495 文件/6724 测试**，测试201.71s、build14.71s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过。日志 `artifacts/canvas-asset-library-media-kind-check-final.log`、证明 `artifacts/canvas-asset-library-media-kind-verification.json`。资产库仍为只读本地内容适配器，真实上传、生成、账号和服务端写入未接入。

2026-10-18 画布资产库状态维护已完成：资产目录弹窗显示加载中、失败可重试和成功但为空，并正确读取公开图库 `{items: [...]}` 包装；重复打开/重试由请求序号防止旧结果覆盖新结果。NodeCanvas 与 CanvasDialogs 定向 **2 文件/30 项**通过；最终 `npm run check` 通过 **495 文件/6722 测试**，测试182.22s、build13.65s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过。日志 `artifacts/canvas-asset-library-envelope-final-full-check.log`、证明 `artifacts/canvas-asset-library-verification.json`。目录仍是只读内容适配器，真实上传、生成、账号和服务端写入未接入。

2026-10-18 分镜历史图片选择器维护已完成：兼容顶层 `items` 与 `{data:{items}}` 图库包装，现有空位插入、关闭回焦点和撤销流程保持不变。`NodeCanvas.storyboard-drop.integration.test.jsx` 定向 **5 项**通过；最终 `npm run check` 通过 **495 文件/6722 测试**，测试169.78s、build13.12s、Vite3709 modules，格式/零警告 lint/核心 strict/生产构建通过。日志 `artifacts/storyboard-history-envelope-recheck-full-check.log`、证明 `artifacts/storyboard-history-envelope-verification.json`。历史目录仍是只读内容适配器，真实上传、生成和服务端写入未接入。

所有参与开发的 agent 先遵守 [AGENTS.md](./AGENTS.md)。本文件仅作为入口，不重复维护第二套规则。

2026-10-18 L2 字幕转换已完成：只读样式源提供确认弹窗，转换保留正文/时间/布局、移除脚本与动画入口，并通过现有本地 CAS、自动保存和撤销/重做写入单次历史。专项 **2文件/20项**，Chromium 合成样本验证确认/取消、实际可编辑、动画清理、同一 video、撤销/重做和390px无横溢；证据 `output/playwright/subtitle-l2-conversion/native-final.txt`。完整 `npm run check` 通过 **494文件/6717测试**，测试148.66s、build10.51s，格式/零警告lint/核心strict及生产构建通过；日志 `artifacts/subtitle-l2-full-check.log`、证明 `artifacts/subtitle-l2-verification.json`、快照 `artifacts/subtitle-l2-code-snapshot.json`。用户已确认协作、远程配置、多语言、触摸/Safari不计入本轮扣分；登录注册、小号、真实生成/支付/云端运营写入仍未接入，按当前范围整体约75%（72%-80%）。

2026-10-18 画布搜索空态已补齐：空画布继续显示“暂无节点”，已有节点但搜索无结果显示“暂无匹配节点”，避免弹窗出现空白区域。定向 **2项**通过；完整 `npm run check` 通过 **495文件/6719测试**，测试194.04s、build12.65s，格式/零警告lint/核心strict及生产构建通过。日志 `artifacts/canvas-dialog-search-full-check.log`、证明 `artifacts/canvas-dialog-search-verification.json`。

2026-10-18 VTT→HTML迁移已验：来源一致性/重复实例/时间反解/样式/轨道和原子失败接入，等待期间保留VTT正文与history，成功后同一事务写HTML并保留VTT fallback。专项 **58文件/735项**，Chromium合成VTT样本实际保存、HTML接管、同一video、undo/redo、390px通过。完整检查session25180 terminal0：**494文件/6714测试**、162.70s/build15.33s，格式/lint/架构/core strict通过，1436份源码/config无漂移。日志`artifacts/subtitle-migration-full-check.log`、证明`artifacts/subtitle-migration-verification.json`、[审计](./research/canvas-subtitle-vtt-migration-audit.md)。Canvas902.55kB提示保留，完整降级/remote-config/L2/多语言/复杂runtime/触摸Safari和真实服务仍缺，本机未部署，整体约70%。

2026-10-18 旧字幕读取/物化升级及预览已验：根回退、旧契约/稳定ID/轨道和时基、源诊断保留、读取不存档、未知时长和透明iframe已接。普通文字保持严格；未绑定工作文档升v4，已绑定v3不强改内部版本。专项 **56文件/715项**，三种Chromium合成样本的实际autosave后一次undo/redo/刷新恢复/390px通过。完整`npm run check` session17461 terminal0：**492文件/6694测试**、215.43s/build18.02s，格式/lint/架构/核心strict通过，1431份源码/config无漂移。日志`artifacts/subtitle-legacy-full-check.log`、证明`artifacts/subtitle-legacy-verification.json`及 [审计](./research/canvas-subtitle-legacy-functional-audit.md)。Canvas901.36kB提示未隐藏，VTT迁移/remote-config/多语言/复杂runtime/触摸Safari仍缺；本机未部署，整体约70%。

2026-10-18 字幕样式兼容已验：固定CSS/inline改写、L1对应属性禁用/L2只读门控、批量跳过受限字段及部分成功图层可编辑已接。专项 **54文件/694项**、Chromium三种合成样本的真实预览/保存/一次undo-redo/390px通过。最终完整`npm run check` session63947 terminal0：**490文件/6673测试**、352.20s/build15.18s，格式/lint/架构/核心strict通过，1427份源码/config无漂移。首轮ENOSPC和5000ms超时保留，清理可再生缓存后未改分组断言/预算而全量重跑通过。日志`artifacts/subtitle-style-compatibility-final-full-check.log`、证明`artifacts/subtitle-style-compatibility-verification.json`、[审计](./research/canvas-subtitle-style-compatibility-audit.md)。Canvas901.36kB提示保留，旧版本/迁移、remote-config/多语言/复杂CSS与runtime、触摸/Safari仍缺；L2转换入口待核实，本机未部署，整体约70%。

2026-10-18 混合字幕编辑权、失败回退与末次输入历史已验：HTML优先编辑、全部远程失败后VTT可用，部分成功保留有效层，重试提交最后输入，自动保存确认后仍可一次撤销/重做。专项 **53文件/680项**，最终完整检查日志 **489文件/6659测试**、测试232.56s/build21.27s，格式/lint/架构/核心strict通过，1425份source/config无漂移。原进程句柄已回收，成功依据为完整日志，不另标terminal0。隔离Chromium合成双来源样本验证失败恢复、请求稳定、同一播放器、实际保存与390px；无未捕获pageerror，预期503资源错误保留。日志`artifacts/subtitle-ownership-final-full-check.log`、证明`artifacts/subtitle-ownership-verification.json`、[审计](./research/canvas-subtitle-ownership-functional-audit.md)。CanvasPage901.36kB提示未隐藏，本机未部署；旧版本/迁移、remote-config、多语言、触摸/Safari及真实服务仍缺，整体约70%（65%-75%）。

2026-10-18 字幕来源与侧栏生命周期已完成专项、浏览器及全量验证：统一源HTML→VTT顺序、合法来源/标签/节点回退规则，HTML加载保留规范存档与显式清空；列表/样式/预设切换不重建预览，默认300px，页头切换恢复焦点。最终剪辑 **52文件/671项**通过，真实Chromium1280/390验证视频、iframe、Document身份和0.4秒暂停位置、焦点及无横向溢出，控制台0错误/0警告。Node24.19.0完整`npm run check` session65313 terminal0：**488文件/6650测试**，测试152.98s/build12.09s，格式/零警告lint/架构/核心strict通过，Vite3702 modules；日志`artifacts/subtitle-sidebar-lifecycle-full-check.log`、证明`artifacts/subtitle-sidebar-lifecycle-verification.json`、[审计](./research/canvas-subtitle-sidebar-lifecycle-audit.md)。旧并发超时/单worker中断不计通过；CanvasPage900.44kB提示未隐藏。本机未部署，原remote-config、混合编辑权/降级、旧版本、多语言、触摸/Safari和真实服务仍缺，整体约70%。

2026-10-17 Studio 本地关键帧编辑已完成专项与全量验证：已有本地位置/旋转/缩放关键帧在当前时间可直接编辑，只更新命中的关键帧并沿用撤销/重做、自动保存与刷新恢复；离开关键帧时间保持 Inspector 锁定。导入 GLB 原始 AnimationClip 轨道仍明确不支持关键帧改写。定向2文件/19项通过；Node24.19.0完整`npm run check`最终重跑实际通过 **487文件/6645测试**，测试138.75s、build11.62s，格式/零警告lint/架构/核心strict通过，Vite3702 modules。最终日志`artifacts/studio-keyframe-final-full-check.log`、证明`artifacts/studio-keyframe-verification.json`；CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值。云端动画 mutation、GLB轨道编辑和服务端导出仍缺，整体约70%。

2026-10-17 预览几何操作已完成专项与全量验证：普通文字与 HTML 字幕在选中 cue 后支持画面内移动、调宽和缩放，使用原站已核实的 layout 字段与现有历史/CAS 事务；连续拖动固定手势起始布局，Escape/取消恢复原状态，VTT 位置编辑仍保持 unsupported。定向4文件/12项通过；Node24.19.0完整`npm run check`实际通过 **487文件/6643测试**，测试168.04s、build13.55s，格式/零警告lint/架构/核心strict通过，Vite3702 modules。日志`artifacts/clip-preview-geometry-full-check.log`、证明`artifacts/clip-preview-geometry-verification.json`；CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值。触摸/跨浏览器拖动、完整运营目录、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 作品详情错误重试已完成专项与全量验证：详情、图库列表或初始样本读取失败且没有可展示作品时显示“作品加载失败”和“重试”，重试只刷新失败资源，未知 ID 保留原下架状态。定向2文件/4项通过；Node24.19.0完整`npm run check` session32987 terminal0：**479文件/6616测试**，测试136.94s、build11.46s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/detail-retry-full-check.log`、证明`artifacts/detail-retry-verification.json`。真实作品服务、账号状态和写入接口仍缺，整体约70%。

2026-10-16 用户主页错误重试已完成专项与全量验证：图库、公开样本、用户资料或外壳配置读取失败且没有可展示资料时显示“用户主页加载失败”和“重试”，加载期间显示 loading，重试只刷新失败资源。定向3文件/5项通过；Node24.19.0完整`npm run check` session94848 terminal0：**480文件/6617测试**，测试140.63s、build11.52s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/profile-retry-full-check.log`、证明`artifacts/profile-retry-verification.json`。真实关注、账号资料和作品服务仍缺，整体约70%。

2026-10-16 首页内容错误重试已完成专项与全量验证：首页配置读取失败时显示“首页内容加载失败”和“重试”，加载期间显示 loading，已有缓存内容继续可见。定向3文件/3项通过；Node24.19.0完整`npm run check` session35563 terminal0：**481文件/6618测试**，测试158.53s、build11.69s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/home-retry-full-check.log`、证明`artifacts/home-retry-verification.json`。真实首页运营内容、生成和账号服务仍缺，整体约70%。

2026-10-16 3D-BOX 入口错误重试已完成专项与全量验证：3D-BOX 配置读取失败时显示“3D-BOX 配置加载失败”和“重试”，加载期间显示 loading，重试只刷新外壳配置。定向2文件/12项通过；Node24.19.0完整`npm run check` session92973 terminal0：**482文件/6619测试**，测试151.08s、build15.24s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/studio-landing-retry-full-check.log`、证明`artifacts/studio-landing-retry-verification.json`。真实生成、项目写入和账号服务仍缺，整体约70%。

2026-10-16 会员弹窗错误重试已完成专项与全量验证：会员/积分配置读取失败时保留弹窗外壳并显示“会员信息加载失败”和“重试”，加载期间显示 loading，缓存套餐继续可见。定向2文件/8项通过；Node24.19.0完整`npm run check` session97211 terminal0：**483文件/6620测试**，测试169.97s、build14.75s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/membership-retry-full-check.log`、证明`artifacts/membership-retry-verification.json`。真实认证、支付、订单和会员写服务仍缺，整体约70%。

2026-10-16 源片段字幕操作已完成专项与全量验证：VTT 与 HTML 字幕均保留片段来源，片段右键菜单可隐藏/显示或删除当前片段字幕，分别复用 VTT 编辑协议与 HTML `cueHidden` / `removeClipCues` patch。定向2文件/38项通过；Node24.19.0完整`npm run check` session58274 terminal0：**483文件/6623测试**，测试174.47s、build15.03s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-subtitle-clip-actions-full-check.log`、证明`artifacts/clip-subtitle-clip-actions-verification.json`。CanvasPage 900.41 kB 分包提示仍保留且未抬高阈值；字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字/字幕轨道重排已完成专项与全量验证：普通文字与 HTML 字幕轨道均提供键盘可达的上移/下移按钮，统一通过 `reorderTracks` 事务重映射 cue、嵌套轨道、z-index、隐藏状态和 group anchor；非法顺序整体拒绝并保留原 HTML。定向2文件/29项通过；Node24.19.0完整`npm run check`实际通过 **483文件/6626测试**，测试131.70s、build13.92s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-track-reorder-full-check-final.log`、证明`artifacts/clip-track-reorder-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整轨道新增/拖拽连续重排、字体/预设远程目录、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字/字幕新增轨道已完成专项与全量验证：普通文字和 HTML 字幕在源选择轨道状态下可创建下一个连续轨道，分别遵守 8 条与 4 条上限；跳号、超限、无效请求保留原文档，成功操作进入既有历史/CAS/刷新恢复。定向4文件/53项通过；Node24.19.0完整`npm run check`实际通过 **483文件/6629测试**，测试153.93s、build13.75s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-track-create-full-check.log`、证明`artifacts/clip-track-create-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；远程字体/预设目录、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字/字幕连续拖动重排已完成专项与全量验证：轨道把手支持原生拖动到目标轨道，普通文字与 HTML 字幕共用 `moveTrackOrder`，drop 仍走 `reorderTracks`、历史/CAS 和混合来源过滤，入口不抢片段移动/裁切手势。定向5文件/55项通过；Node24.19.0完整`npm run check`实际通过 **484文件/6631测试**，测试214.96s、build15.36s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-track-drag-full-check.log`、证明`artifacts/clip-track-drag-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；触摸拖拽、跨浏览器原生拖放、远程字体/预设目录、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字字体目录已完成专项与全量验证：普通文字与 HTML 字幕样式面板支持只读 `fontSource.load({signal})`，处理取消、错误重试、数据校验和远程字体选项，未提供 source 时继续使用 fallback。定向2文件/13项通过；Node24.19.0完整`npm run check`实际通过 **485文件/6636测试**，测试136.50s、build12.72s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-font-directory-full-check.log`、证明`artifacts/clip-font-directory-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；真实字体资源加载、完整预设 remote-config、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字字体资源已完成专项与全量验证：字体目录 HTTPS 资源现在由可取消 `FontFace` loader 加入浏览器字体集合，部分失败保留 fallback，source 变更/卸载清理 face。定向2文件/14项通过；Node24.19.0完整`npm run check`实际通过 **485文件/6637测试**，测试135.00s、build10.37s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-font-resource-full-check.log`、证明`artifacts/clip-font-resource-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整预设 remote-config、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 文字预设字段已完成专项与全量验证：预设与应用全部支持 paddingTop/Right/Bottom/Left 四边字段，按输出比例完成像素换算、写入和回读，沿用单次历史/CAS。定向3文件/32项通过；Node24.19.0完整`npm run check`实际通过 **485文件/6637测试**，测试156.69s、build10.50s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-text-preset-fields-full-check.log`、证明`artifacts/clip-text-preset-fields-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整 remote-config 的 shadow/padding/语言目录、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-17 VTT 字幕字体目录已完成专项与全量验证：基础 VTT 字幕面板与普通文字/HTML 字幕共用只读 `fontSource`，支持目录取消、错误重试、fallback 和可取消 HTTPS `FontFace` 加载，工作区已贯通三种面板。定向3文件/20项通过；Node24.19.0完整`npm run check`实际通过 **485文件/6638测试**，测试158.83s、build12.14s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-vtt-font-directory-full-check.log`、证明`artifacts/clip-vtt-font-directory-verification.json`。CanvasPage 900.44 kB 分包提示仍保留且未抬高阈值；完整字体运营目录、预设 remote-config、字幕生成、云端写入和真实导出仍缺，整体约70%。

2026-10-16 混合字幕来源已完成专项与全量验证：同一片段的HTML/VTT来源独立分型、加载与渲染，混合模式同时保留两类轨道；定向3文件/16项通过，Node24.19.0完整`npm run check` session40760 terminal0：**460文件/6562测试**，测试218.48s、build18.06s，格式/零警告lint/架构/核心strict通过，1376源码/config指纹无漂移，Canvas897382/ClipEditorWorkspace230231字节。日志`artifacts/subtitle-mixed-full-check.log`、证明`artifacts/subtitle-mixed-verification.json`。源与边界见 [混合字幕审计](./research/canvas-subtitle-mixed-source-audit.md)。整体仍约70%，未部署、无需账号。

2026-10-16 音视频分离已完成专项与全量验证：公开源确认的浏览器提取音轨流程现在会生成真实PCM WAV，加入关联音频节点、对齐原视频片段、静音内嵌原声，并沿用历史/CAS与取消/失败边界。定向5文件/94项通过；Node24.19.0完整`npm run check` session77892 terminal0：**463文件/6570测试**，测试207.13s、build15.67s，格式/零警告lint/架构/核心strict通过，1382源码/config冻结无漂移，Canvas899867/ClipEditorWorkspace230417字节。日志`artifacts/audio-separation-final-check.log`、证明`artifacts/audio-separation-verification.json`。源与边界见 [剪辑器审计](./research/canvas-clip-editor-functional-audit.md)。人声分离、远程运营服务和真机Safari仍缺，整体约70%，未部署、无需账号。

2026-10-16 人声分离入口已完成专项与全量验证：右键菜单提供“仅保留人声 / 仅保留背景音 / 仅保留音效”，纯规则校验三分钟、无音轨和重复处理，服务未连接时明确失败。定向3文件/90项通过；Node24.19.0完整`npm run check` session75730 terminal0：**464文件/6573测试**，测试135.76s、build11.52s，格式/零警告lint/架构/核心strict通过，1385源码/config冻结无漂移，Canvas899943/ClipEditorWorkspace230942字节。日志`artifacts/vocal-separation-final-check.log`、证明`artifacts/vocal-separation-verification.json`。源与边界见 [剪辑器审计](./research/canvas-clip-editor-functional-audit.md)。真实人声分离服务、结果回写和真机Safari仍缺，整体约70%，未部署、无需账号。

2026-10-16 剪辑工程导出已完成专项与全量验证：导出按钮现在生成本地 `.libtv.json`，包括时间轴、素材 URL 和所有剪辑参数；空态、缺 URL、blob URL 均按源文案阻断，服务端成片/PR 导出仍未伪造。定向3文件/92项通过；Node24.19.0完整`npm run check` session95319 terminal0：**465文件/6577测试**，测试143.94s、build12.15s，格式/零警告lint/架构/核心strict通过，1387源码/config冻结无漂移，Canvas899975/ClipEditorWorkspace232051字节。日志`artifacts/clip-export-final-check.log`、证明`artifacts/clip-export-verification.json`。源与边界见 [剪辑器审计](./research/canvas-clip-editor-functional-audit.md)。本机未部署、无需账号、整体约70%。

2026-10-16 剪辑器音频波形已完成专项与全量验证：可访问音频 URL 经 AudioContext 提取真实多声道 min/max 峰值并绘制 SVG 波形，已验证 source 峰值可直接渲染；视图缓存不进入时间轴文档、历史、CAS 或恢复副本，读取失败、全无效采样和 CORS 不可达保留原片段编辑。定向3文件/43项通过；Node24.19.0完整`npm run check` session20323 terminal0：**475文件/6605测试**，测试168.35s、build12.39s，格式/零警告lint/架构/核心strict通过，Vite3695 modules。日志`artifacts/clip-waveform-full-check.log`、证明`artifacts/clip-waveform-verification.json`。视频内嵌音轨全量波形、远程跨域、真机Safari和服务端导出仍缺，整体约70%。

2026-10-16 剪辑器视频帧缩略图已完成专项与全量验证：按源时间偏移、片段时长和速度抽取最多6帧并显示真实 filmstrip；抽帧失败或取消回退 poster，视图缓存不进入文档、历史、CAS或恢复副本。定向3文件/40项通过；Node24.19.0完整`npm run check` session37415 terminal0：**477文件/6611测试**，测试227.47s、build13.26s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-thumbnail-full-check.log`、证明`artifacts/clip-thumbnail-verification.json`。远程跨域视频、所有codec、真机Safari和服务端媒体缓存仍缺，整体约70%。

2026-10-16 Studio 材质参数已完成专项与全量验证：本地 Inspector 暴露金属度、粗糙度、不透明度、透明材质和深度写入，使用原有材质 mutation、history、autosave 和 source GLB 覆盖协议。定向2文件/16项通过；Node24.19.0完整`npm run check` session28044 terminal0：**477文件/6611测试**，测试214.51s、build12.62s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/studio-material-full-check.log`、证明`artifacts/studio-material-verification.json`。纹理、多材质槽、骨架、动画轨道属性、原站可见面板逐像素、真机和服务端 mutation 仍缺，整体约70%。

2026-10-16 视频片段内嵌波形已完成专项与全量验证：选中的视频片段按需显示真实底部音频波形，未选中视频不主动下载，静音/失败回退 poster；视图缓存不进入文档、历史、CAS或恢复副本。定向2文件/40项通过；Node24.19.0完整`npm run check` session86293 terminal0：**477文件/6612测试**，测试147.27s、build11.32s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/clip-video-waveform-full-check.log`、证明`artifacts/clip-video-waveform-verification.json`。远程跨域视频、所有codec、真机Safari和服务端媒体缓存仍缺，整体约70%。

2026-10-16 学院商品页重试已完成专项与全量验证：商品信息和简介错误均提供当前资源重试，失败后不会伪造支付、登录、购买或已购状态。定向2文件/10项通过；Node24.19.0完整`npm run check` session4005 terminal0：**477文件/6613测试**，测试138.30s、build12.20s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/academy-product-retry-full-check.log`、证明`artifacts/academy-product-retry-verification.json`。真实商品接口、订单、认证和课程权益仍缺，整体约70%。

2026-10-16 Seedance 验证页重试已完成专项与全量验证：查询失败后提供“重试”按钮并重新进入 loading，保持只读和服务未连接边界。定向2文件/3项通过；Node24.19.0完整`npm run check` session76164 terminal0：**478文件/6614测试**，测试135.69s、build11.44s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/seedance-retry-full-check.log`、证明`artifacts/seedance-retry-verification.json`。真实任务查询、账号和生成服务仍缺，整体约70%。

2026-10-16 MCP 授权页重试已完成专项与全量验证：授权失败后提供“重试”按钮并重新进入提交中状态，保持 OAuth callback、token 和服务未连接边界。定向2文件/4项通过；Node24.19.0完整`npm run check` session8462 terminal0：**478文件/6615测试**，测试148.32s、build11.53s，格式/零警告lint/架构/核心strict通过，Vite3698 modules。日志`artifacts/mcp-retry-full-check.log`、证明`artifacts/mcp-retry-verification.json`。真实授权服务、账号和 token 写入仍缺，整体约70%。

2026-10-16 字幕最终接线：真实HTML字幕右侧栏已按源改为列表/样式同栏切换，双击列表进入样式，样式页头返回；逐词高亮/双alpha色盘/源词时钟/窄屏焦点通过。最终Node24.19.0完整check session87968 terminal0：**459文件/6559测试**，01:43:25、测试413.89s、build33.47s，格式/零警告lint/架构/核心strict通过，1374源码/config指纹未变，Canvas897382字节。日志 `artifacts/subtitle-sidebar-full-check.log`，范围见 [字幕高亮与侧栏审计](./research/canvas-subtitle-highlight-audit.md)。本机未部署、无需账号、整体约70%，目标仍未完成。

2026-10-16 HTML字幕已接实际App来源/面板/源时间轨道、片段拆分复制与规范存档/历史、末次输入和真实预览；复制加载丢失及播放后编辑误报冲突已修。专项39文件/631项与追加过期投影拒绝后的52项通过；Node24.19.0完整check session50294 terminal0：**457文件/6544测试**、格式/零警告lint/架构/核心strict及标准build21.87s通过，1367源码/config指纹未变，Canvas897073字节。日志 `artifacts/html-subtitle-app-full-check.log`；原生桌面/390/播放/刷新/删除/历史/焦点、修前失败与剩余高亮/旧版本/完整轨道等见 [实际App审计](./research/canvas-html-subtitle-app-audit.md)。strict非全部JSX、统计含独立影游、CI未远端执行、未部署、无需账号、整体约70%，目标仍未完成。下段进行中与453/6510均为此前历史。

2026-10-15 进度复核维持约70%（65%-75%）。HTML字幕App接线进行中，创建/面板/预览和末次输入刷新恢复已有浏览器证据，时间轴拖动尚未通过原生验收；定向37文件/606项及零警告lint通过，当前接线尚未完成完整check。下段453/6510只代表接线前冻结版本，不能称当前工作区全量通过。具体口径见 [进度估算](./research/coverage.md#当前复刻进度估算2026-10-15)，本批未部署、无需账号，整个目标仍未完成。

2026-10-15 HTML字幕底层已新增source时基、clip/meta、同源投影、clone/retag/delete与split/duplicate原子事务和独立封闭预览文档；尚未接App HTML字幕UI/source/archive、CAS历史和实际播放器，不计为完整可用功能。专项33文件/575项、独立Chromium12项及最终Node24.19.0完整check **453文件/6510测试**、格式/零警告lint/架构/核心strict与标准构建23.54s通过；1355源码/config指纹未变、Canvas895155字节，日志 `artifacts/html-subtitle-contract-full-check.log`。首轮主动停止/trim补正、原生范围与下一步见 [HTML字幕协议](./research/canvas-html-subtitle-contract-audit.md)。统计含独立影游、strict非全部JSX、CI未远端执行、本机未部署，无需账号、整体约70%；下方452/6493为前批。

2026-10-15 普通文字数值条/原生颜色行已接：绝对映射、min-relative snap、文本确认/取消/键盘与独立token、typed最后值/pagehide、一次历史/旧回调隔离和精确投影取消。专项32文件/558项、角色库联合33文件/570项通过；最终Node24.19.0完整check terminal0：**452文件/6493测试**、格式/零警告lint/架构/核心strict及标准构建38.94s通过，1351源码/config指纹未变，Canvas895155字节，日志 `artifacts/clip-numeric-full-check.log`。首轮失败/明确复现/角色库基线修正、原生拖动/刷新/undo/390/焦点和未验后台/OS色盘/真机边界见 [控件验收](./research/canvas-text-controls-functional-audit.md)。下方450/6478为前批；strict非全部JSX、CI未远端执行、本机未部署、无需账号、整体约70%，HTML字幕/完整字体预设等仍缺。

2026-10-15 普通文字高级属性：背景/alpha/圆角/模糊、九种非空CSS动画、应用到所有、区段折叠/滚动与页头删除blur已接。源像素比例/两位小数与百分比行高已纠正；专项30文件/543项通过，最终Node24.19.0完整check terminal0：**450文件/6478测试**、格式/零警告lint/架构/核心strict与标准build18.36s通过，1345源码/config指纹未变，Canvas894054字节，日志 `artifacts/clip-text-advanced-full-check.log`。实际CSS Animation时间与回弹、wave、刷新/undo/390/焦点和明确缺口见 [高级属性验收](./research/canvas-text-advanced-functional-audit.md)。原始色盘/数值控件、完整字体/预设/HTML字幕与自定义script仍缺；strict非全部JSX、CI未远端执行、本机未部署，无需登录/小号、整体约70%；下方449/6468为前批。

2026-10-15 普通文字已接实际剪辑器：正文/布局/文字样式、独立轨道/拖动裁边、末次输入与同一历史/CAS、双iframe预览。精确草稿投影的CAS基线和拖动期间保存已修；连续播放在转场准备时的旧时间回传自取消已修。专项29文件/533项通过；最终Node24.19.0完整check terminal0：**449文件/6468测试**、格式/零警告lint/架构/核心strict/标准构建通过，1340源码/config指纹未变，Canvas893988字节，日志 `artifacts/clip-text-ui-full-check.log`。原生桌面/390/刷新/最后项删除/逐层Escape/转场与文字层级及明确缺口见 [文字验收](./research/canvas-text-editor-functional-audit.md)。高级背景/动画/HTML字幕、完整字体/预设/轨道仍缺；strict非全部JSX、CI未远端执行、本机未部署，无需登录/小号，整体仍约70%；旧445/6450是前批冻结。

2026-10-15 普通文字HTML底层已新增inert协议读写、源时间/避碰规则、语言/逐字计时修改与稳定cue ID，专项21项/原生Chromium6项及静态布局通过。最终Node24.19.0完整check terminal0：**445文件/6450测试**、格式/零警告lint/架构/核心strict/标准构建通过，1309源码/config指纹未变，日志 `artifacts/clip-text-contract-full-check.log`。尚未接App入口与播放宿主，不能计为可用文字功能；首轮失败/原样复验、下一步接线与源双iframe/轨道协议见 [HTML审计](./research/canvas-text-html-contract-audit.md)。整体约70%、本机未部署；下方443/6429为前批冻结。

2026-10-15 最新基础VTT字幕：新增/搜索/选择、正文/全局样式/应用全部、显示隐藏/删除、拖动裁边、历史/CAS/末次输入保存和主画面叠层已接，专项25文件/496项及Chromium桌面/390通过。最终Node24.19.0完整check terminal0：**443文件/6429测试**、格式/零警告lint/架构/核心strict/标准build17.99s；1303源码/config指纹未变。日志 `artifacts/clip-subtitles-full-check.log`，修复前失败、空态崩溃与实际范围见 [字幕验收](./research/canvas-clip-subtitles-functional-audit.md)。HTML字幕/普通文本、完整字体目录与真实服务仍缺；整体约70%（65%-75%），本机未部署，下方438/6408保留为前批冻结。

2026-10-15 最新转场操作：库/属性/独立切点选择、时长与删除、宽度记忆、双冻结视频及源CSS遮罩预览已接。Node24.19.0完整 `npm run check` exit0：**438文件/6408测试**、格式、零警告lint/架构、核心strict与标准生产构建21.43s通过，日志 `artifacts/transition-panels-validated-check.log`；专项20文件/475项及真实桌面/390px范围见 [操作审计](./research/canvas-transition-controls-functional-audit.md)。下段历史ENOSPC与旧433/6366不能作为当前结论，准确状态见 [工程验证](./AGENTS.md#当前工程验证)。本机未部署，整体目标仍进行中。

2026-10-15 前批主预览：四种 `transitionIn` 画面预览已接入，剪辑专项17文件/461项与Chromium像素/GUI恢复/390px已验，见 [转场审计](./research/canvas-transition-preview-functional-audit.md)。当时完整检查及标准构建因ENOSPC失败，仅代码编译通过；该历史状态已由上段438/6408完整成功更新，旧433/6366也仅保留为前批快照。

当前本机前端进度工程估算约70%（65%-75%），按用户确定的范围排除内容数量、延期登录及真实服务执行，但包含前端错误/权限等状态；依据与缺口见 [进度估算](./research/coverage.md#当前复刻进度估算2026-10-15)。转场实际预览接入前的本机剪辑恢复、片段字幕/转场/音量增益线/复制粘贴、Canvas 逐帧拉片、Studio 镜头/复制/时间轴导航/灯光与材质颜色、生成前引用顺序、项目管理、挑战赛分页与学院播放器/跟练导航批次已通过433个测试文件／6366项完整检查与生产构建，准确范围见 [剪辑编辑器验收](./research/canvas-clip-editor-functional-audit.md)。历史冻结通过不能代表后续源码，测试数量不作为完成比例。

2026-10-15 维护：音色筛选的语言、口音、性别已增加可搜索输入、清空和依赖筛选重置；Studio 导入 mesh 已支持有来源证据的材质颜色覆盖，颜色写入 nodeEdits 并支持撤销／重做、自动保存和刷新恢复。两项仍属于本地前端演示，完整 Mantine 筛选视觉、完整材质参数、纹理、骨架和真实运营服务继续保留边界。 资产库文件夹可从当前子树的有效图片设置或清除本地封面，坏图有回退；选中节点／连线混合删除在确认期间校验候选边 identity，防止 stale request 删除新边。 剪辑器收起预览在节点暂不可见时停止有界 portal 重试并提供“回到节点”；Studio 导入 GLB 子节点支持稳定 path tombstone 删除、恢复层级和导出轨道过滤。

同日维护补充：`shot-breakdown` 已从通用占位改为有来源证据的“逐帧拉片”专属卡片，支持视频空态/预览、本地素材、画布点选和分镜/动态/音乐维度选择；开始操作仍明确提示服务未连接。剪辑时间轴的片段级 subtitleUrl、transitionIn、音量增益线和复制粘贴现在映射为原生字幕轨道、本地转场标记、-60～20dB 曲线编辑及单视频片段剪贴板闭环，Studio 已接入有来源证据的 Shift+Arrow 镜头 waypoint、Shift+A 添加菜单、1/2 工作区、C 相机视图、复制粘贴/重复、灯光类型与属性、材质颜色选择器及时间轴速率/缩放/键盘进度。生成前媒体输入会按当前 incoming 节点物化稳定 ListOrder，项目页补齐本地排序和移动到文件夹，挑战赛列表补齐分页/续载/错误重试；学院播放器已补桌面音量悬停/聚焦纵向滑块和完播遮罩点击关闭，学院跟练补上一节/下一节，资产选择器补齐远程混合目录的当前层级过滤；学院文章页保留登录门槛并新增 source/itemKey 画布入口。前批全量检查为433个测试文件／6366项，仍不代表云端拉片、真实导出、真实课程权益或运营服务已接入。

同日剪辑补充：转场工具已按公开源 bundle 的 `transitionIn` 片段契约接入本地编辑。工具栏可在主轨相邻片段间添加或更新 `fade`（`crossfade` 兼容别名）、`dissolve`、`fadeblack`、`fadewhite`，时间轴显示转场标记并可点选右侧片段，时长受邻片段和源 0.2–10 秒规则限幅。该状态进入现有十步历史/CAS，预览画面与真实导出继续标记未接入。

剪辑器本批修复了直接编辑后的撤销／重做历史快照：删除、拆分、裁切、轨道控制、素材边恢复、片段音量增益和片段复制粘贴都会在提交前保留旧时间轴，图、边、本地保存和选择状态同步。冲突恢复副本只在用户显式关闭时按当前 CAS 调整来源边；媒体未完成准备时关闭和切换会被拒绝并保留副本。剪辑拖入、字幕、转场、增益线、复制粘贴与恢复专项通过，前批完整检查为433个测试文件6366项，历史日志为 `artifacts/pre-transition-full-check.log`；远端冷启动超时、WebAudio跨浏览器、全局字幕/转场画面／真实导出、云协作和真实生成服务仍未接入。

选中边与混合删除已按源先ordinary、异步clip／editing、聚合关联warning、selected nodes分派；后置取消只保关联，晚确认历史分段，最新草稿／一次CAS／成功消费统一维护。local clip Port按operation signal隔离授权／提交／释放，修复重叠取消偷走另一操作lease；长按Delete／Backspace只派发一次。19份真实GUI完整文档（14桌面／390混合＋5公开VIDEO clip）与独立gold相等。首次Skill超时保留，同源码原超时／worker完整重跑通过。完整VideoClipNode／timeline编辑、真实云锁和真机／Safari／大图仍缺；无需登录／小号，本机未部署，整体目标未完成。

此前脚本/分镜组单边断线已接确认、精确解绑、editing优先及一次撤销；末次输入同次提交，取消不改图，quota只重试保存。393文件/5459项完整检查与1161冻结、首次focus等待失败修正、真实101节点GUI恢复及390确认见 [分镜断线验收](./research/canvas-storyboard-unlink-functional-audit.md)。本机未部署，无登录/小号；mixed edge batch、VIDEO_CLIP时间轴异步前端/源锁、完整renderer与真机/Safari/大图仍未完。整体目标未完成。

上一批整图删除与确认已接 UI 子树／父组收缩、特殊锁重算、边专属角色 metadata，最后输入／CAS／一次历史与成功后消费 timer 同步，手型／Space 禁误删。388文件／5370项完整检查、1150冻结、实际App22项与native16份GUI整文档删除／撤销／刷新、390确认／回焦点见 [整图删除验收](./research/canvas-destructive-delete-functional-audit.md)。首次正式旧组expectation失败已保留并完整重跑，script／分镜断线、VIDEO_CLIP mD／源锁与完整特殊renderer仍缺。本机未部署，无登录／小号，整体目标未完成。上一批普通参考379／5193与1135记录见 [历史删除验收](./research/canvas-reference-delete-functional-audit.md)；下方375／5108是历史面板批次。

上一批更新：节点面板共用实际surface测量，优先下方、溢出上放与限高滚动，避开title／固定工具栏；输入永久在article内、tilt shell外。VIDEO排序消费真实CAS正文，IMAGE只改typed顺序保literal，失败保末次草稿。375文件／5108项完整check、1129冻结SHA与原生桌面／窄屏范围见 [节点面板验收](./research/canvas-generator-vertical-functional-audit.md) 和 [AGENTS当前验证](./AGENTS.md#当前工程验证)。维护纯模型／生命周期／view边界，不把定位写成graph历史；group／加载错误／动画中间帧主要受控DOM，手机／Safari／大图另验。本机未部署、登录／小号延期，真实服务与特殊前端继续有缺口，整体目标未完成。

此前角色批次：VIDEO角色库、公共目录／详情和合规素材选择已按真实入口接线；引用图事务修复末次草稿复活、Magic漏清和Quota重复审核，弹窗click隔离避免背景node失选。完整检查、实际App与桌面／390／320范围见 [角色库验收](./research/canvas-role-library-functional-audit.md)；历史节点松手结果保留原审计。目录／审核默认未连接，真人授权／组／QR、历史图库及主体前端仍有缺口。

此前元素标记、模式互斥、prompt metadata清理、Script按需卡片与横向边缘适配的352文件/4745测试是独立历史快照，日志 `artifacts/canvas-mark-final-check.log`；默认识别服务未连接，原生和受控范围见 [元素标记验收](./research/canvas-mark-functional-audit.md)。

此前参考选择/本机队列/个人库/按需生成器批次完整check324文件4320测试，历史证据见 [参考验收](./research/canvas-script-reference-functional-audit.md)。后续修改须重新check，不将历史快照作为当前通过。

此前空态批次恢复剧本/角色/手写三个source提示，完整预设图/原文/原图/避碰/一次history/Quota仅保存重试有回归。专项7文件118项、当时完整check309文件3994测试通过；最新generator由上方更新，历史来源见 [空态入口验收](./research/canvas-script-presets-functional-audit.md)。无需登录/小号，历史data检查页拒绝不代表当前浏览器通过。

此前卡片批次已恢复ScriptV2横向静态三阶段、唯一打开入口、卡面拖动和状态分型，source readonly/busy与fresh raw请求门控不被旧投影绕过。按钮Space/portal隔离，多选/一次history/最后坐标、阶段保留、manual失败草稿重试及任务复制有实际回归，联合11文件208项通过；当时Node24.19.0完整check **305文件/3900测试**、格式/lint/核心strict和构建通过，日志/快照见验证历史。46计数页原生输入仍未响应，桌面/窄屏手感未验收，无新截图；该历史批次empty preset由上方最新批次补建图，显式模式/任务总线与真实服务继续有缺口。来源和实际边界见 [卡片验收](./research/canvas-script-card-functional-audit.md)，只改本机、未部署，整体目标未完成。

此前节点交互批次已替换 ScriptV2 旧图片 adapter：浮动四动作和全屏阶段共用 r3 选镜、refs 候选及 typed chips，sC 创建 vertical 空图组，成功保父编辑器/选择/视口。fresh rows 提交复核、末次 rich prompt、一次 CAS/undo、Quota仅保存重试和 owner 门控有实际 App 回归。联合12文件302项通过；最终Node24.19.0完整check300文件/3735测试、格式/lint/核心strict与构建通过，日志和准确快照见AGENTS验证入口；上一批295/3527保历史。源码、本机适配和验收范围见 [图片交接验收](./research/canvas-v2-image-functional-audit.md)。45计数页原生点击仍0，桌面/窄屏未验收，无新截图；真实服务、完整 renderer/显式 target/工具箱、退出动画及 disabled tooltip 分支仍有差距，仅本机修改未部署，整体目标未完成。

此前已接 ScriptV2 的选镜、逐镜临时时长和独立视频配置，见 [v2验收](./research/canvas-v2-video-functional-audit.md)。全局34模型与v1专用19模型分别维护；资源显示镜号不改原脚本，最小参考数逐镜判断。提交只创建空视频组，审核由可注入source提供，缺服务明确阻断。Quota只重试保存，关闭/并发变更隔离迟到审核；保存成功回画布的100ms定位不能夺走用户新选择或手势。该批联合11文件367项通过，当前快捷入口由上方记录更新，其余边界保留。

品牌约定：当前产品名称为 PenStudio；原站 LibTV 的调研证据、内容来源、版权、接口与 libtv-\* 持久化 key 保留原名。

2026-10-14 剪辑编辑器批次：专属 VideoClipNode、默认／讲解／批量广告／素材混剪四模式、真实 URL metadata／首帧准备、同一媒体 host 展开收起、来源画幅高度同步、时间轴播放／移动／裁切／拆分／轨道控制／撤销重做及素材连线差异已接入。controller 通过独立订阅发布播放进度，避免整画布逐帧重渲染；冲突支持保留页面副本、打开最新 raw、显式恢复，缺素材不自动重连。media runtime、剪辑撤销／恢复、片段字幕、转场、音量增益线与拖入素材专项通过；该历史批次检查为431文件／6353测试并通过生产构建，最新验证以文首入口为准。冷启动远端素材超过15秒时显示可重试的metadata超时，不伪造ready。真实WebAudio多轨/autoplay跨浏览器、全局字幕/转场画面/波形/帧缓存/真实导出、云锁协作、真机/Safari/高DPR/大图仍未完成；整体估算仍约70%。

当前范围：复刻前端页面、功能和交互，内容使用代表性样本并预留运营接口。当前版本默认本地工作区，无需登录；登录注册、小号与真实账号资源暂缓；真实生成、支付和其他运营写服务尚未接入。功能覆盖与差距以 [coverage.md](./research/coverage.md) 及分域审计为准。

2026-10-16 活动报名维护：按公开报名 source 接入纯 payload 模型、手机号/微信前缀、作品链接归一化、提交中状态、失败保留与可注入 `registrationSource`。默认仍是本地演示，提交成功后才保存；真实报名接口、登录态与审核服务继续延期。定向 3 文件 / 12 项通过，最新全量检查 467 文件 / 6582 项通过，详见 [活动报名验收](./research/activity-registration-functional-audit.md)。

2026-10-16 Skill 创建结果类型维护：结果类型菜单已按公开 Select 行为补齐键盘选择、Escape、外部点击关闭和 listbox 语义；图片/视频封面与文本/音频清除规则保持，真实上传/优化服务不变。定向 3 文件 / 18 项通过；最新全量检查 468 文件 / 6584 项通过，见 [创建编辑器审计](./src/features/skills/create/SOURCE_AUDIT.md)。

2026-10-16 Skill 封面上传维护：增加可注入 `coverSource.upload`，覆盖上传中禁保存、异步 URL 替换、失败保留和重试提示；无 source 时仍是本地 data URL 演示。定向 3 文件 / 10 项通过，最新全量检查 469 文件 / 6586 项通过；真实上传、登录态与运营服务继续延期。

2026-10-16 学院文章状态维护：文章 source 现在区分 loading、notFound（60016）、offline（60017）和通用错误重试；默认快照和画布来源参数保持。定向 2 文件 / 9 项通过，最新全量检查 470 文件 / 6588 项通过，真实文章服务与权限继续延期。

2026-10-16 学院卡片入口维护：大师课、图文教程和亮点功能卡片按 source 使用新窗口打开，保留匿名登录门槛和 `noopener,noreferrer`；定向 2 文件 / 9 项通过，最新全量检查 471 文件 / 6590 项通过，真实登录和权限服务继续延期。

2026-10-16 Markdown frontmatter 维护：共享 Markdown 现在把公开 frontmatter 解析为安全 Metadata 表格并剥离正文，支持标量/折叠/多行字段和 BOM；定向 3 文件 / 17 项通过，最新全量检查 472 文件 / 6592 项通过。复杂 Markdown、sanitizer 完整矩阵和运营内容服务继续延期。

2026-10-16 审计校准：学院播放器的浮窗、冻结帧和 tutorial 横屏抽屉已有实现与本地证据，剩余是 Safari/原生横屏/跨域截图/像素实测；活动报名与 Skill 封面上传的异步失败边界已接入，真实服务仍延期。对应 coverage 与 secondary audit 已同步。

2026-10-16 Skill 分享媒体维护：补案例切换 360ms 过渡、文档案例加载失败/重试，最新全量检查 473 文件 / 6594 项通过；真实媒体服务和跨浏览器输出继续延期。

2026-10-16 Skill 分享媒体错误边界：图片/视频/音频统一失败层和重试重新挂载已接，最新全量检查 473 文件 / 6595 项通过；真实跨浏览器媒体输出继续延期。

开发和扩展方法见 [README.md](./README.md)，Canvas 所有权与模块入口见 [Canvas 维护说明](./src/features/canvas/README.md)。节点补全的模块边界和证据见 [AutoLink 审计](./research/prompt-autolink-functional-audit.md)，单个引用替换与节点资产入口见 [引用动作审计](./research/prompt-reference-actions-functional-audit.md)。分镜资产、三阶段与 CSV 的规则和差距见 [资产阶段审计](./research/script-assets-workflow-functional-audit.md)，Studio 窄屏属性证据见 [Studio 审计](./src/features/studio/SOURCE_AUDIT.md)。结构判断见 [架构审查](./research/architecture-review.md)，当前工程检查见 [AGENTS.md 的验证入口](./AGENTS.md#当前工程验证)，批次原文见 [验证历史](./research/verification-history.md)。

修改后维护所属域的说明、实际验证范围和剩余缺口；不要把组件测试、核心类型检查或本地夹具当作原站全部功能验收。

v1分镜图片组视频配置已接模型/共享参数/费用与空视频组交接，见 [配置验收](./research/canvas-batch-video-functional-audit.md)。配置不写global/group，费用/审核仅注入只读source，缺服务明确未知/阻断；Quota保留已建图仅重试保存，100ms定位不能夺走用户新选择/手势，取消与两层Escape继续共用已有协议。该批九文件220项联合及实际NodeCanvas回归通过，最新全check以AGENTS验证入口为准；当时原生浏览器输入连独立计数页也不响应，桌面/窄屏未验收，无新版截图。v2逐镜配置已由上方新批次接入，真实服务与目录图标/VIP视觉仍有差距，不声明perfect或自动发布。

普通组四角/四边尺寸调整由独立pure模型、pointer controller与view维护，取消、一次CAS/history、末次输入、pagehide和原焦点分别验收，见 [尺寸源码](./research/canvas-group-resize-source-audit.md) 与 [本批验收](./research/canvas-group-resize-functional-audit.md)。该尺寸批次完整check通过280文件/3058测试与生产构建，原生桌面已验；390px只验布局，当时原生窄屏输入未验收。非零origin、自身expandParent、特殊parent重排与真机/Safari仍缺。v1批量视频实际没有逐镜时长/选图，其配置及空视频建图契约见 [新审计](./research/canvas-batch-video-configuration-source-audit.md)，不沿旧推测混入v2功能。

普通组/脚本混合工具栏、颜色/布局/转换、选择动作 raw CAS、复制末次草稿和组下载 owner 的维护见 [组操作验收](./research/canvas-general-group-controls-functional-audit.md) 与 [接线审查](./research/canvas-ordinary-group-integration-audit.md)。普通、standalone与混合行按 source 分派，脚本运行确认不复用普通 batch；toolbox editor、character toolbar、完整 run/stop、真实服务及手机/Safari/大图仍缺，v1配置浮窗由上方新批次接入。该工具栏批次完整check通过275文件/2929测试与生产构建，桌面/窄屏原生操作及完整App入口已复验；仅当前显示组计算General资格、空闲确认不扫图，不宣称大图性能已验。本批不自动发布线上，也不覆盖独立影游任务的记录。

分镜最终提示词、本地自动拼接、覆盖/短时撤销与统一草稿保存见 [提示词拼接审计](./research/script-prompt-compose-functional-audit.md)。继续保持当前版本无需登录。

PenStudio品牌、节点选择/拖动/平移/滚动/取消的当前规则见 [节点操作审计](./research/canvas-node-interaction-functional-audit.md)；单镜媒体历史、源tk规范化与失败信息见 [媒体历史审计](./research/script-media-history-functional-audit.md)。真实服务未接部分继续按覆盖清单维护，当前版本无需登录。

触摸/双指缩放、正反向拖连、端口菜单、原子创建、source fit与手势接管的当前规则和验收见 [触摸连接审计](./research/canvas-touch-connection-functional-audit.md)。普通节点视觉反馈由后续批次接入；真实手机与完整特殊renderer继续按差距维护。

节点候选光边/倾斜、拒绝遮罩、纯投影临时连接与世界锚点菜单的当前维护见 [节点反馈审计](./research/canvas-node-feedback-functional-audit.md)。持续GPU验收使用合成PointerEvent驱动实际生产组件，原生释放/创建/撤销另验；真机与特殊renderer范围继续按差距维护。

虚拟多选外框/整体移动、锚定toolbar、独立多源拖线/六项菜单/共享target和草稿历史修复见 [多选交互验收](./research/canvas-multi-selection-functional-audit.md)。普通组输出入口、虚拟框 Alt / Meta 复制、raw CAS与精确 Escape 回焦点见 [组与选区验收](./research/canvas-group-selection-functional-audit.md)。普通节点/真实组 Alt 及组内单节点脱离、首次起拖修饰键、生成器初始化 CAS 与手势中断的后续维护见 [普通节点复制验收](./research/canvas-node-alt-copy-functional-audit.md)。普通/虚拟框两套拖动autoPan、普通组完整入组/重叠保父/完全脱组、同次末位提交和选中节点临时层级见 [节点拖动验收](./research/canvas-node-drag-functional-audit.md)。特殊组drop、真机与其余范围继续按差距维护，不能据helper/定向测试宣布全站完成。

分镜组创建、primary网格预览/换位/出组、图片派生组node/frame落点、实际membership reflow、外层grow-only扩壳、空槽补图与提交后通知见 [分镜拖动验收](./research/canvas-storyboard-drag-functional-audit.md)。最终245文件/2486测试和生产构建通过；1280×720与390×844原生拖动、菜单焦点、补图和刷新恢复已验。当前是本机工作区更新；既有公开部署版本须单独发布，不能混淆源码验证与线上产物。

独立分镜组比例/宫格、序号、确认清空/转换、真实2K/4K PNG、本机保存失败及标题拖动/双击的当前维护见 [设置验收](./research/canvas-storyboard-group-controls-functional-audit.md)。设置pure计划、异步owner、graph CAS与立即flush分别维护；浏览器本机结果不能称远端上传。检查统计与中间失败统一存入验证历史。

上述设置历史批次2026-10-12冻结后完整check通过268文件/2796项及生产构建；已修复ready出现后旧passive cleanup取消首拖的生命周期问题，保留立即观察压力回归和全部旧断言。此记录不覆盖随后普通组批次的修改；strict仍只覆盖核心，CI未远端执行，当前版本未因本批自动发布线上。
