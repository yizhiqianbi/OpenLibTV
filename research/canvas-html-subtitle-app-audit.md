# HTML 字幕实际编辑器接线（2026-10-16）

本批把上一批的HTML字幕协议接到真实PenStudio剪辑器：来源读取、字幕列表/样式面板、独立轨道、源时间预览、文档存档及同一历史/CAS。当前只在本机验证，未部署；无需登录注册、小号或原站账号。整个复刻目标仍未完成，整体工程估算维持约70%，不按测试数量或底层模块数量加分。

后续维护已补齐已存在字幕轨道的上移/下移和把手拖动操作，并在轨道选择状态下允许创建下一个连续字幕轨道：普通文字与 HTML 字幕共用 `reorderTracks` 原子 patch，新增沿用 `addCue`，重映射 cue、嵌套轨道、z-index、隐藏状态和 group anchor，顺序非法时整体拒绝。触摸/跨浏览器拖放、远程字体/预设目录和真实运营服务仍保持未接入边界。

2026-10-18后续：字幕列表/样式/预设切换保持实际预览子树、媒体与iframe身份；关闭隐藏预设状态并恢复页头切换焦点，列表初始宽度按源修正为300px。来源收集与HTML加载计划共用片段顺序、节点回退与HTML开关规则。专项和原生桌面/390px证据见 [侧栏生命周期审计](./canvas-subtitle-sidebar-lifecycle-audit.md)。逐词高亮/alpha色盘已由 [高亮审计](./canvas-subtitle-highlight-audit.md) 接入，不再作为当前缺口。

同日编辑权批次进一步补HTML持有列表/轨道、全部远程来源拒绝后回退VTT、部分成功保留、重试前保存末次输入及投影保存后的历史，见 [编辑权审计](./canvas-subtitle-ownership-functional-audit.md)。这不代表旧版本和完整迁移/降级已完成。

## 来源与实现

沿用 [协议审计](./canvas-html-subtitle-contract-audit.md) 的公开静态证据：`research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。REA归档语义图仍是partial，不称完整追踪，不执行原bundle、遥测、写服务或自定义脚本。源`lD/lL`对应hash/UTF-8字节/存档字段，`oU`对应片段窗口内的移动裁边，`r1.prepare`对应字幕库按片段物化、完整cue及meta恢复。

- `html-subtitle-sources`只计划来源；`useHtmlSubtitleSources`承担并发去重、取消、15秒超时/重试、真实媒体初始化和opening窗口。改变文档或卸载后忽略迟到结果，失败不变成可写空库。
- `html-subtitle-tools`拥有选择、正文草稿、样式操作、源时间移动/裁边和跨文档批量提交；主controller保留同一CAS、历史、末次输入投影和恢复副本。普通文字与HTML字幕共用属性视图和数值控件，维护各自的文档、选中身份与操作token。
- 新字幕绑定当前实际视频片段；剪辑拆分/复制与字幕clone/retag/meta在同次事务提交，完整source cue不按切点截断。预览按片段窗口投影，字幕实例分别显示在时间轴；删除最后一条保存显式空文档及`userCleared`。
- `subtitle-archive`保存v4字段、HTML本体、SHA-256前16位和真实UTF-8字节数，无writer时沿用2MiB本地恢复上限。同步SHA仅用于源协议身份/存档，不作为认证；11项测试以Node crypto为独立预期。
- `HtmlSubtitlePreviewRuntime`按当前/附近片段和字幕轨创建缓冲，提前0.5秒准备，不为整个未来时间轴创建iframe。真实iframe/font/image准备完成后才ready，source时钟及CSS Animation由宿主seek；图层按轨道和普通文字group anchor组合。
- DOM、媒体、缓存、回调和token均不写入Canvas文档。重型DOM协议与视图留在lazy workspace，既有Canvas预算不提高，未引入第二套全局滚动锁或焦点栈。

## 实际发现与修复

复制后，规范存档里原本已含两条字幕和两个clip meta，但物化器仍只按创建时`clip:`键过滤，误删了loaded副本。新增纯回归修前1失败/6通过（`artifacts/html-subtitle-copy-binding-before-fix.log`）；现在同时保留同源且显式绑定的片段，只清理实际不存在的owner，不给无关片段复制字幕。实际GUI冷刷新及复制/撤销/重做重验通过。

连续播放揭示另一个实际问题：NodeCanvas保存后会把投影草稿发布回图，播放头可在React提交前继续前进；旧controller只认当前输入投影，误把自己刚保存的前一帧当作外部冲突。新增回归镜像真实NodeCanvas的acknowledgement路径，修前52项中1失败（`artifacts/html-subtitle-projection-receipt-before-fix.log`）。controller现在以WeakMap识别实际读出的投影对象，同时核对会话、原基线和完整值指纹；真正外部修改及已经过期的旧投影仍会冲突，不按“仅播放位置不同”宽松吞并。恢复最新/副本时清理旧HTML输入和loaded层，正文已在备份事务中保留。最终该文件52项通过（`artifacts/html-subtitle-projection-receipt-final-tests.log`）。

## 浏览器证据

真实Chromium App在独立loopback端口5181操作，使用GUI上传的6秒320×180蓝色视频，真实创建连接和智能剪辑节点；未注入graph/storage、media ready或合成pointer事件。证据在`output/playwright/html-subtitle-app/`：

- `reload-verified.txt`：正文末次输入未失焦刷新后仍在，字号25.13恢复；先关闭Agent并适应画布，再打开剪辑器，避免遮挡测试入口。
- `drag-history-verified.txt`、`split-history-verified.txt`：真实鼠标移动一秒、一次撤销/重做、再次拖动Escape取消；播放头1.5秒拆分跨越字幕后出现两实例，撤销/重做同步恢复。首次拖动检查误把缩放控件百分比当作px/s，保留`drag-split-copy-history.txt`，后按实际cue宽度重验，未因此改生产拖动规则。
- `copy-reload-after-fix.txt`、`copy-history-after-fix.txt`：两片段/两字幕冷恢复，键盘再复制得到三字幕，一次撤销回二、重做回三。修前的实际失败日志保留。
- `playback-boundary-final.txt`、`playback-proof.txt`：跨越6秒切点连续播放，7.2799秒时视频约1.287秒、字幕source时钟1.2799秒，绿色文字可见、其他clip字幕隐藏，wave Animation为paused/currentTime1279.9ms、源start delay1000ms。只是该代表性Chromium样本，不扩为Safari/真实多轨混音或自定义runtime验证。
- `last-delete-final.txt`、`empty-archive-proof.txt`、`empty-history-narrow.txt`：最后删除后列表/轨道为空，面板保持，`userCleared=true`；浏览器独立Web Crypto校验hash及字节数，撤销/重做和恢复两条字幕通过。
- `narrow-proof.txt`：390×844下document.scrollWidth=390；左右面板x8/199、各宽183，高264。`narrow-escape-presets.txt`验数字编辑Escape、预设搜索关闭、第二层Escape回字幕工具栏；`narrow-reload-final.txt`保留窄屏未失焦正文刷新恢复。截图`desktop.png`、`playback-caption.png`、`narrow.png`及`narrow-final.png`均为实际页面。

过程中的错误操作/错误locator不算产品通过：数值只读状态未先点入编辑、将“应用到所有”误写其他名称的等待失败分别保留；播放后首次删除检查因“添加字幕”入口在无命中时实际新增一条，原定数量不成立，随后按实际列表逐条选择删除验证。原生发现的自动保存冲突与复制丢失另有修前失败及修复后证据，不混称测试夹具问题。

添加controller hook时开发HMR曾产生hook顺序错误，完整console保存在`console-complete.log`，不宣称整段console无错误。随后真实冷刷新并完成播放/删除/窄屏/刷新，原始console第292行起无warning/error，单独保存`console-post-fix-cold.log`。QA状态已保存`browser-state.json`；仅关闭自建浏览器和5181进程，用户5173开发服务保留。此环境观察不代替生产或其他浏览器验收。

## 工程检查

本批联合剪辑、草稿、自动保存与同步摘要专项39文件/631项通过，随后追加过期投影拒绝断言，同文件52项再次通过。首轮完整check为修正自动保存误报而主动停止terminal143，保存于`artifacts/html-subtitle-app-before-projection-receipt-check.log`，不是超时重启或成功。

早期未使用专属TMPDIR的专项因ENOSPC导致24个suite未加载、193项已通过，不能记为整体通过；日志`artifacts/html-subtitle-app-initial-tests.log`。只清理本批可重新生成的dist和专属测试临时目录后恢复空间，没有删除source/public或研究素材；记录`artifacts/html-subtitle-app-space-recovery.json`。之后固定Node24.19.0、两个Vitest workers与专属TMPDIR。初始hook依赖lint和测试Buffer import亦已修正，保留初始日志，不以旧结果代替最终检查。

最终1367份源码/config重新冻结后，Node24.19.0完整check session50294 terminal0：**457文件/6544测试全部通过**，2026-10-16 00:13:34开始、测试299.68s、标准build21.87s；格式、零警告lint/架构、核心strict通过。所有记录源码/config指纹至结束未变，Canvas897073/ClipWorkspace189589字节，900000预算未提高。日志`artifacts/html-subtitle-app-full-check.log`，proof `artifacts/html-subtitle-app-verification.json`；上一批453/6510只属于协议冻结。统计含独立影游扩展，strict非全部JSX，JSDOM媒体未实现/Node弃用输出保留，CI未远端执行、本机未部署。随后仅维护文档/证据并复查格式。

## 明确剩余范围

本批新增的是v4字幕在实际App的可操作链路，不是全部字幕功能完毕。预览几何操作已在后续批次接入：选中的 HTML 字幕可在画面内移动、调宽和缩放，并沿用现有 layout patch、历史/CAS 与取消回滚；VTT 位置编辑仍按源证据保持不支持。旧L1/L2/旧版本分类与升级、VTT/HTML混合来源的完整优先级/编辑权/降级、多语言专属属性、完整字体/预设运营目录、触摸/跨浏览器拖放和复杂样式注入仍需继续按源映射。当前新增只支持选择状态下的下一个连续轨道，上移/下移和把手拖动只覆盖已存在轨道顺序，不代表完整轨道工具。小型只读预设adapter的正向测试不代表原remote-config或正式目录已连接。

封闭预览不执行原站或用户自定义script，也不把内嵌视频/音频的完整时钟与任意外部资源视为已支持；这些仍有播放器能力差距。真机触摸/手机键盘、Safari、高DPR、后台恢复和大字幕文档性能未实测。原站上传、字幕生成、导出、云锁/协作、费用与运营写服务仍未连接。当前本机更改不会自动发布线上。
