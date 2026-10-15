# 工程验证历史

本文件保留从根维护文档迁出的验证原文和来源。历史批次代表当时的检查范围；当前规则见 [AGENTS.md](../AGENTS.md)，功能覆盖与剩余差距见 [coverage.md](./coverage.md)。后续批次在此追加证据，根文档维护当前规则和最新结果入口。

## HTML/VTT混合字幕来源（2026-10-16）

Node24.19.0完整check session40760 terminal0：**460文件/6562测试**，02:01:55开始、测试218.48s、标准build18.06s，格式/零警告lint/架构/核心strict通过。1376源码/config冻结逐文件一致；实际Canvas897382字节、ClipEditorWorkspace230231字节，900000预算未提高。日志 `artifacts/subtitle-mixed-full-check.log`、proof `artifacts/subtitle-mixed-verification.json`，滚动入口 `artifacts/current-full-check.log`。

静态源 `collectClipSubtitleSources` 证明同一非音频片段可以同时追加HTML和VTT来源；新增纯分型保留 `html`、`vtt`、`mixed`、`empty`，混合时独立加载两类来源并在时间轴呈现HTML叠层与VTT文字轨道。定向3文件/16项通过，零警告lint见 `artifacts/subtitle-mixed-targeted.log` 与 `artifacts/subtitle-mixed-lint.log`；源摘录及SHA见 `artifacts/subtitle-mixed-source-evidence.json`。本批没有独立GUI双来源媒体样本，未宣称跨类型排序、遮挡优先级、完整源侧选择器、真机/Safari或运营服务已完成；仅本机修改，未部署，无需登录/小号，整体复刻目标仍未完成，进度约70%。

## 音视频分离与本地音轨接入（2026-10-16）

Node24.19.0完整check session77892 terminal0：**463文件/6570测试**，03:55:51开始、测试207.13s、标准build15.67s，格式/零警告lint/架构/核心strict通过。1382源码/config冻结逐文件一致；Canvas899867字节、ClipEditorWorkspace230417字节，900000预算未提高。日志 `artifacts/audio-separation-final-check.log`、proof `artifacts/audio-separation-verification.json`。

公开 bundle `research/source/1q5w-zbtkz5ka.js` 的 `clipDetachAv`、`clipDetachAudioHint`、`clipNoEmbeddedAudio` 和 `extractEmbeddedAudioAsWavFromVideoClip` 摘录见 `artifacts/audio-separation-source-evidence.json`。本机现在在右键菜单按 clip/source/media 能力门控“音视频分离”；对本地可读取的视频，AudioContext 解码后编码真实 PCM WAV，经现有上传管道创建音频 source node，音频片段与视频片段对齐并写入 `linkedVideoClipId`，视频内嵌音轨写入 `embedAudioMuted`，操作进入现有历史/CAS。定向5文件/94项、零警告 lint 与纯模型覆盖通过；远程 CORS、无音轨/媒体解码失败、后台服务、人声分离、移动端/Safari和独立GUI媒体分离样本仍未宣称完成。本机未部署，无需登录/小号，整体复刻目标仍未完成，进度约70%。

## HTML字幕源时间、片段关联与原子修改（2026-10-15）

Node24.19.0完整check session18062 terminal0：**453文件/6510测试**，22:43:14开始、测试257.47s、标准build23.54s，格式/零警告lint/架构/核心strict通过。1355源码/config指纹未变，Canvas895155/ClipWorkspace152982字节，900000预算未提高；日志 `artifacts/html-subtitle-contract-full-check.log`、proof `artifacts/html-subtitle-contract-verification.json`。剪辑专项33文件/575项及独立Chromium协议12项通过，见 [HTML字幕协议审计](./canvas-html-subtitle-contract-audit.md)。

新增v4 source/timeline、clip/meta/4轨、source投影/新增、clone/retag/delete、split/duplicate多文档原子事务与封闭预览文档；尚未接App的HTML字幕source/archive、UI/轨道、CAS/history和实际播放器，不能记为可用完整字幕功能。首轮专项1条错误避碰夹具、标识trim补正前主动终止143、最终带空白属性原生复验均分别保留。首次QA favicon404不算零控制台错误；未增加App/390/手机/Safari或媒体同步验收声明。统计含独立影游、strict非全部JSX、CI未远端执行、本机未部署，无需账号、整体约70%、完整目标继续进行。

## 普通文字数值条、颜色行与输入事务（2026-10-15）

Node24.19.0完整check session82598 terminal0：**452文件/6493测试**，22:12:01开始、测试301.07s、标准build38.94s，格式/零警告lint/架构/核心strict通过。1351源码/config指纹未变，Canvas895155/ClipWorkspace148791字节，900000预算未提高；日志 `artifacts/clip-numeric-full-check.log`、proof `artifacts/clip-numeric-verification.json`。专项32文件/558项及角色库联合33文件/570项通过；原生整条拖动/数值编辑/取消/Shift、未失焦越界刷新、颜色/一次undo、390/逐层Escape和连续播放见 [控件验收](./canvas-text-controls-functional-audit.md)。

首轮452文件中451通过、6493项中6492通过，旧角色库首例混用了提示词debounce保存前后的撤销基线，build未运行。原文件隔离12项通过；明确等待180ms后保持旧基线/断言复现同样差异，再将首例分为明确已保存提示词的完整graph基线；邻例假时钟保留150ms未保存路径，整图undo/redo/刷新断言和时限未削弱。失败/诊断/联合/最终完整日志分别保留。中间主动补hidden回归的terminal143及实际smooth-scroll旧rect/浏览器保持visible的未验后台条件也保留，不混称成功。

原生OS色盘、真机键盘/触控/Safari/后台页、HTML字幕/完整字体预设与高级轨道仍缺；strict非全部JSX、CI未远端执行、本机未部署、无需登录/账号，整体约70%、目标未完成。

## 普通文字背景、CSS动画与属性区段（2026-10-15）

Node24.19.0完整check session65446 terminal0：**450文件/6478测试**，21:27:23开始、测试203.71s、标准build18.36s，格式/零警告lint/架构/核心strict通过。1345源码/config指纹未变，Canvas894054/ClipWorkspace138765字节，900000预算未提高；日志 `artifacts/clip-text-advanced-full-check.log`、proof `artifacts/clip-text-advanced-verification.json`。专项30文件/543项、实际CSS Animation起点/回弹/wave/连续播放、背景与未失焦数值刷新、应用所有/一次undo、页头删除不先提交正文、390/区段折叠/逐层Escape见 [高级属性验收](./canvas-text-advanced-functional-audit.md)。

源明确普通文字没有字幕高亮，对齐/斜体只在预设/复制承接；属性区段是滚动锚点与折叠，不再隐藏切换。像素按平均输出比例并保留两位小数、行高百分比已纠正；旧任意精度断言按直接源改正，保留中间语法/测试失败。原色盘/数值控件、完整字体/预设、HTML字幕/原script runtime等仍缺；strict非全部JSX、CI未远端执行、本机未部署、无需登录/账号，整体约70%、目标未完成。

## 普通文字实际接线与播放边界（2026-10-15）

以下为前批冻结，当前高级属性结果见上一节。

Node24.19.0完整check session7031 terminal0：**449文件/6468测试**，20:37:21开始、测试1741.02s、标准build16.38s，格式/零警告lint/架构/核心strict通过。1340份源码/config指纹未变，Canvas893988/ClipWorkspace126343字节，900000阈值未提高；日志 `artifacts/clip-text-ui-full-check.log`、proof `artifacts/clip-text-ui-verification.json`。剪辑专项29文件/533项通过；浏览器桌面/390、未失焦正文/小数刷新、拖动/裁边/取消、隐藏、最后项删除/撤销、逐层Escape和原生连续播放/转场层级见 [文字验收](./canvas-text-editor-functional-audit.md)。

修复手势中间值投影进保存、精确草稿投影误判外部冲突，以及prepare状态回传旧UI时间取消转场准备。只对精确相同草稿更新CAS基线，保编辑前时间轴供一次历史；真实不同输入仍seek。两次因窄屏/原生播放新发现而主动中止的完整检查143、专项失败/修复、HMR旧实例报错与cold reload、两次原生时钟失败及最终通过记录均保留于审计。原始script不执行，字体/预设/背景/高亮/动画、HTML字幕时基/片段绑定、完整轨道与属性注入验证继续有缺口；strict非全部JSX、CI未远端执行、本机未部署，整体约70%、目标未完成。

## 普通文字HTML协议底层（2026-10-15）

以下为前批底层快照，后续接线结果见上一节。

Node24.19.0完整check session50690 terminal0：**445文件/6450测试**、19:40:03/388.87s，标准build16.70s，格式/零警告lint/架构/核心strict通过。1309记录源码/config指纹未变，日志 `artifacts/clip-text-contract-full-check.log`；专项2文件21项、原生Chromium6项和静态布局通过。Canvas891607/ClipWorkspace84391字节保持前批数值，新模块未进入App，不能计为可用文字工具。当前源时基、语言/逐字/保原文档事务、下一步接线和明确缺口见 [HTML审计](./canvas-text-html-contract-audit.md)。

两次源文案/语言scope补正前中止terminal143保留；最终冻结首轮445文件中旧ScriptV2的12项找不到lazy view、terminal1/build未跑。未改源码/断言/时限，独立12项与联合44项通过后同源码完整重跑成功；没有证据确认首次失败根因，不编造归因。验证后只维护文档/proof并复查格式，strict非全部JSX、CI未远端执行、本机未部署，整个目标仍进行中。

## 基础VTT字幕、最后输入与主画面叠层（2026-10-15）

Node24.19.0完整 `npm run check` session48516实际terminal0：**443文件/6429测试**，19:01:17开始、359.69s，标准build17.99s；格式/零警告lint/架构/核心strict通过。日志 `artifacts/clip-subtitles-full-check.log`，专项25文件/496项为 `artifacts/clip-subtitles-validated-targeted.log`；1303份记录的源码/config指纹未变，Canvas891607字节低于900000阈值，ClipEditorWorkspace84391字节。检查后只维护文档/proof并复查格式，本机未部署、CI未远端执行、strict非全部JSX。

首轮VTT换行/百分比两失败、GUI删除最后cue的空态崩溃及主动中止terminal143均保留；修复后完整重新执行，不能用前批438/6408代替。Chromium桌面/390、实际最后输入未失焦刷新、原生移动裁边/取消/历史、隐藏/空态删除、4.1秒切换和转场字幕图像见 [字幕验收](./canvas-clip-subtitles-functional-audit.md)。HTML字幕/普通文本、字体目录、波形/导出及真实服务仍缺；整体目标继续进行中，保守估算仍约70%。

## 转场库、属性与源规则修正（2026-10-15）

Node24.19.0最终完整 `npm run check` session54468实际exit0：438文件/6408测试，18:07:13开始/399.93s、标准build21.43s，格式/零警告lint/架构/核心strict全过，日志 `artifacts/transition-panels-validated-check.log`。最终剪辑20文件/475项专项通过；检查期间1291源/config指纹至结束一致，Canvas876014字节低于900000阈值，ClipEditorWorkspace69110字节，恢复的三张封面完整保留于dist。统计含独立影游，strict非全部JSX、CI未远端执行、本机未部署。

首轮437文件/6404项中一条原脚本配置5000ms超时，原断言/时限独立17项复跑通过；旧标准build通过只对应当时源码。随后按直接源字节纠正0时长默认、DOM层属性预览/网格遮罩、90px高度/封面尺寸/8px调宽与关闭记忆，多次主动中止检查均保留日志，不混称通过。当前438/6408是在最后代码/测试冻结后重新完整执行的结果。桌面/390原生GUI、首次CDP拖入失败、旧服务素材缓存、HMR中间状态、源码适配与剩余边界见 [操作审计](./canvas-transition-controls-functional-audit.md)，整个复刻目标仍进行中。

## 来源：AGENTS.md（2026-10-11 归档）

历史批次（2026-10-10 结构迁移）：`npm run check` 全部通过（27 个测试文件、118 项测试，格式、零警告 lint、核心 TypeScript 与生产构建通过）。浏览器验证了匿名外壳导航、学院标签、更新页、图库搜索、作品视频及对应只读快照加载/关闭、Skill 标题键盘打开详情与 Escape 关闭；390px 侧栏导航、焦点、滚动锁和无横向溢出通过。未进行真实认证、WebGL 全流程或原站所有交互验收。证据与遗留边界更新至覆盖清单。

历史批次（2026-10-11 编辑器与共享协议）：`npm run check` 全部通过，37 个测试文件、189 项测试；格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。浏览器确认 Skill → Canvas 结构化引用刷新恢复、Canvas Agent 独立上传后发送/刷新恢复、原生音频 Tab 经过播放/进度/音量后回到弹窗、弹窗叠层关闭和 GLB 保存/刷新/导出再导入。验收采用本地演示夹具，不代表全部原站登录态功能已验收。

历史批次（2026-10-11 资产库、评论、Blender 与共享焦点）：`npm run check` 全部通过，**60 个测试文件、291 项测试**；格式、零警告 ESLint、核心 strict TypeScript 和生产构建通过。strict 仅覆盖核心 TypeScript，不是全 JSX 类型覆盖。浏览器确认资产上传/标签/预览/建画布刷新恢复、390px 预览无溢出、Skill 选择器插入/叠层 Escape 与创建菜单、评论回复恢复及 Blender 桌面/窄屏实际 GPU；细节与未验分支见 `research/coverage.md`。不得将本条描述成全部原站功能或逐像素复刻通过。

历史批次（2026-10-11 共享输入、Skill 管理、学院与工程边界）：`npm run check` 全部通过，**78 个测试文件、377 项测试**；格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。浏览器验收多引用光标插入/删除撤销/刷新恢复、390px Agent、课程会员全屏/切换/回焦点与匿名学院错误路由。详见 coverage 和分域审计；strict 仅覆盖核心 TypeScript，未代表全 JSX 类型化、所有原站功能或逐像素完备。

历史检查（模块化与依赖边界）：`npm run check` 全部通过，**86 个测试文件、426 项测试**，格式、零警告 ESLint（包含依赖边界）、核心 strict TypeScript 和生产构建通过。浏览器验证共享 Skill 选择器/叠层焦点/390px、真实 TipTap→CodeMirror→全屏→本地保存刷新、真实视频暂停质量切换/Canvas 清理和移动设置；长内容夹具验证浮窗 360px/右下24px、关闭暂停及返回后再次浮出。日志 `artifacts/structure-final-check.log`，证据与剩余差距见 coverage；整个复刻目标继续保持未完成。

历史统一检查（2026-10-11 Canvas Agent 与课程接线）：`npm run check` 全部通过，**93 个测试文件、483 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/canvas-agent-final-check.log`，证据 `artifacts/canvas-agent-fidelity-proof.jpg` / `chat-copy-fidelity-proof.jpg`。strict 不覆盖全部 JSX，课程正向 adapter 回归不等同于实际授权/手机浏览器验收，整个复刻目标继续未完成。

历史统一检查（2026-10-11 共享层与工具栏状态）：`npm run check` 全部通过，**107 个测试文件、549 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/toolbar-course-final-check.log`。浏览器验证桌面/390px 工具栏、素材预览叠层与回焦点、mode 刷新恢复、节点改名同步及定位不选中；课程合成 adapter 验证营销→会员、完成后 deny、A→B→A 清理和新窗口跟练入口。截图 `artifacts/canvas-toolbar-live-proof.jpg` / `course-marketing-adapter-proof.jpg`。strict 不覆盖全部 JSX；本地 adapter 不代表真实授权，native fullscreen/Safari/手机旋转和全站逐像素仍未验收，整个复刻目标继续未完成。

历史统一检查：`npm run check` 全部通过，**119 个测试文件、606 项测试**，格式、零警告 ESLint（含依赖边界）、核心 strict TypeScript 和生产构建通过。日志 `artifacts/generator-assets-studio-final-check.log`。浏览器确认参数刷新、用户 / 助手真实复制、目录 / 文本预览 / 标签筛选 / 插入回焦点及390px无横向溢出；实际 WebGL 动画播放 / 单片段选择 / 恢复与 Draco 默认 wasm 解码，导出 GLB 有 Slide / Grow 两段和三个 meshes。截图 `artifacts/studio-animations-decoder-proof.jpg` / `asset-picker-folder-text-proof.jpg` / `asset-picker-mobile-proof.jpg`。这些是本地夹具和已安装解码依赖的验证，不代表真实账号 / 团队服务；strict 不覆盖全部 JSX，整体复刻目标仍未完成。

历史统一检查（媒体与子树批次）：`npm run check` 全部通过，**135 个测试文件、691 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/generator-media-voices-subtree-final-check.log`。浏览器确认高级值 .11 刷新后保留（显示 .1）、实际滑块拖动结束提交、音色第二页选择 / 试听 / 回焦点 / 刷新；390px 音色弹窗 x14 / 宽362 / 右376，页面宽390。实际 GLB 四层子树改名 / X=.8 / H隐藏恢复、隐藏父节点定位、改名后的动画播放与导出通过；2620B 导出文件包含 EditedDetail 的 X=.8、AnimatedMover 的 Slide translation 和 Grow scale 两段。截图 `artifacts/generator-voice-precision-proof.jpg` / `generator-voice-mobile-proof.jpg` / `studio-subtree-edit-proof.jpg`。390px Studio 页面无横向溢出，但属性侧栏仍隐藏，不能称移动编辑器完整。strict 不覆盖全部 JSX，本地 QA 目录及合成 GLB 不表示真实运营或原站账号已验收。

历史统一检查（画布与相机批次，2026-10-11）：`npm run check` 全部通过，**156 个测试文件、796 项测试**；格式、零警告 ESLint（含工程依赖边界）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/canvas-inline-batch-camera-final-check.log`。本批最终窄屏页脚也已换行，选择模型 / mode / settings / generate 均在390px内，最终CSS进入生产构建。真实浏览器刷新后无新增error / warn；开发期间修改hook顺序触发过HMR重挂载，这不作为运行态通过证据。严格类型仅覆盖核心TypeScript；本地QA和实际GLB / ZIP回读不代表原站账号、真实运营或全站逐状态像素验收。

## 来源：README.md（2026-10-11 归档）

历史批次（2026-10-10 结构迁移）：`npm run check` 通过，27 个测试文件、118 项测试，lint 零警告，核心类型与生产构建通过。浏览器核对了公开导航、学院标签、搜索、作品视频与对应只读快照、Skill 详情键盘激活及 390px 移动侧栏的焦点/滚动恢复。主 CSS 的 506 个顶层节点、次级 CSS 的 794 个有序节点在拆分时保持规则和声明等价。

历史批次（2026-10-11 编辑器与共享协议）：`npm run check` 全部通过，37 个测试文件、189 项测试；格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。浏览器确认 Skill → Canvas 结构化引用刷新恢复、Canvas Agent 独立上传后发送/刷新恢复、原生音频 Tab 经过播放/进度/音量后回到弹窗、弹窗叠层关闭和 GLB 保存/刷新/导出再导入。验收采用本地演示夹具，不代表全部原站登录态功能已验收。

历史批次（2026-10-11 资产库、评论、Blender 与共享焦点）：`npm run check` 全部通过，**60 个测试文件、291 项测试**，格式、零警告 ESLint、核心 strict TypeScript 和生产构建通过。strict 覆盖核心 TypeScript，不代表全部 JSX 已类型化。测试采用本地夹具，真实写服务未接入；浏览器验证资产/画布/评论恢复、选择器与叠层焦点、390px 资产预览及 Blender 实际 GPU，步骤和未验分支见 [覆盖清单](../research/coverage.md)。工程检查不代表所有原站功能或逐像素复刻已通过。

历史批次（2026-10-11 共享输入、Skill 管理、学院与工程边界）：`npm run check` 全部通过，**78 个测试文件、377 项测试**，格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。浏览器完成多引用光标插入/删除撤销/刷新恢复、390px Agent 与课程会员、学院匿名骨架及错误路由检查。原站全部正向私人功能、真实写服务和逐像素验收仍未完成。

历史批次（2026-10-11 模块化与依赖边界）：`npm run check` 全部通过，**86 个测试文件、426 项测试**；格式、零警告 lint（含工程边界）、核心 strict TypeScript、生产构建通过，日志为 `artifacts/structure-final-check.log`。浏览器验证共享选择器/叠层与390px布局、真实富文本/代码/全屏编辑及本地草稿刷新恢复、视频质量切换和移动设置；长内容夹具验证浮窗关闭暂停/返回后再次浮出。截图为 `artifacts/structure-mobile-proof.jpg` / `structure-editor-proof.jpg`。构建仍按需拆分 CodeMirror，开发预构建避免首次切换模式时刷新页面。具体边界见 coverage 与各域审计。

历史统一检查（2026-10-11 Canvas Agent 与课程接线）：`npm run check` 全部通过，**93 个测试文件、483 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/canvas-agent-final-check.log`，证据 `artifacts/canvas-agent-fidelity-proof.jpg` / `chat-copy-fidelity-proof.jpg`。strict 不覆盖全部 JSX，课程正向 adapter 回归不等同于实际授权/手机浏览器验收，整个复刻目标继续未完成。

历史统一检查（2026-10-11 共享层与工具栏状态）：`npm run check` 全部通过，**107 个测试文件、549 项测试**；格式、零警告 ESLint（含工程边界）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/toolbar-course-final-check.log`。桌面/390px 和课程本地 adapter 的实际验收范围见 coverage；真实服务、全部 JSX 类型化、native fullscreen/Safari/手机旋转与全站逐像素仍未完成。

历史统一检查（2026-10-11）：`npm run check` 全部通过，**119 个测试文件、606 项测试**，格式、零警告 ESLint（含依赖边界）、核心 strict TypeScript 和生产构建通过；日志 `artifacts/generator-assets-studio-final-check.log`。本地浏览器验证参数恢复、实际消息复制、目录 / 标签 / 文本资产 / 回焦点 /390px，以及真实动画和 Draco wasm 解码、保留 clips 的 GLB 导出。完整范围和未完成部分见 coverage；登录注册与账号资源继续延期。

历史统一检查（2026-10-11 媒体与子树批次）：`npm run check` 全部通过，**135 个测试文件、691 项测试**，格式、零警告 ESLint（含依赖边界）、核心 strict TypeScript 与生产构建通过；日志 `artifacts/generator-media-voices-subtree-final-check.log`。浏览器验证高级小数 / 音色保存恢复、实际试听 / 分页 / 回焦点 / 390px，以及四层真实 GLB 子节点改名 / 隐藏 / 静态变换和含原动画的实际导出。详细证据见 coverage。strict 仅覆盖核心 TypeScript；真实运营服务、完整原站编辑器与移动 Studio 属性操作仍未完成，登录注册和账号资源继续暂缓。

历史统一检查（画布与相机批次，2026-10-11）：`npm run check` 全部通过，**156 个测试文件、796 项测试**；格式、零警告 ESLint（含工程依赖边界）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/canvas-inline-batch-camera-final-check.log`。本批最终窄屏页脚也已换行，选择模型 / mode / settings / generate 均在390px内，最终CSS进入生产构建。真实浏览器刷新后无新增error / warn；开发期间修改hook顺序触发过HMR重挂载，这不作为运行态通过证据。严格类型仅覆盖核心TypeScript；本地QA和实际GLB / ZIP回读不代表原站账号、真实运营或全站逐状态像素验收。

## 工程职责收敛验证（2026-10-11）

最新统一检查（2026-10-11 工程职责收敛）：`npm run check` 全部通过，**165 个测试文件、835 项测试**；格式、零警告 ESLint（含跨域与域内依赖方向）、核心 strict TypeScript 与生产构建通过，日志 `artifacts/structure-controller-final-check.log`。本地运行 Node25.2.1；GitHub CI配置为Node24且尚未远端执行。浏览器确认桌面节点创建 / 正文修改 / 撤销重做 / Agent发送 / 本机分享及刷新恢复；390×844发送 / 草稿恢复 / mode菜单Escape、页面scrollWidth390；实际GLB相机动画预演与最新帧PNG截图成功，三页error/warn为空。证据 `artifacts/structure-canvas-proof.jpg`、`structure-canvas-mobile-proof.jpg`、`structure-studio-capture-proof.png`。strict仍只覆盖核心TypeScript；新增可选脚本表格与全画布候选未接运行入口，真实运营 / 完整原站功能 / 逐像素完备仍未完成，认证与账号资源继续延期。

## 工程结构优化收尾（2026-10-11）

`npm run check` 全部通过，**166 个测试文件、836 项测试**；格式、零警告 ESLint、核心 strict TypeScript 与生产构建通过。日志 `artifacts/structure-maintenance-final-check.log`。随后只更新维护文档与验证记录，再执行格式检查；生产代码和测试未再变化。GitHub CI 已配置、尚未远端执行。

独立只读复核未发现本轮 Canvas controller / snapshot 或 Studio frame 提取引入的可确认回归。369 个生产模块的静态及字面量 lazy 导入图未发现循环或新增跨域私有依赖。Canvas 维护说明补充 getSnapshot 读取最新文档的语义和异步消费者门控，以及普通 connect 不等于增强 @ 提交接口。

修复既有 TransformControls helper 重复 scene sweep：先摘除 helper，再由 controls owner 释放，scene 仅清理自身树。新增真实已安装 Three 的资源回归：67 个唯一 helper geometry 只释放一次，独占 material 只释放一次；共享 material 保持 Three 自身按节点引用调用的原策略，我们不再增加额外 scene sweep。scene 自有 geometry / material / texture / bitmap 与 controls listeners 仍正常释放；未修改 Three 库。

最终代码在独立本地 QA 页中实际创建立方体、编辑 X=1.2，GPU 显示对应对象；从项目菜单离开后 React 卸载 Studio，再次打开可重新建立视口，error / warn 为空。QA 导航将非 Canvas 目的页映射为 Skill，这仅用于组件卸载验证，不是正式路由验收。截图 `artifacts/structure-maintenance-studio-proof.jpg`，1280×720、52448B；临时验收 tab 已关闭，用户原 tabs 保留。没有使用真实账号资源。

根文档不再重复追加历史检查段落：AGENTS 保留当前规则与最新入口，agent.md 指向单一规范，README 保留开发和扩展方法，历史原文在本文件。当前路由状态与 academy/player 实际入口对齐。全 JSX 类型覆盖、CSS 完整隔离、真实运营写服务和整个原站功能仍未完成；登录注册与小号继续暂缓。

## 生成器、分镜、监视器与本地工作模式（2026-10-11）

最终 `npm run check` 全部通过，**178 个测试文件、880 项测试**；Prettier、零警告 ESLint（含跨域和纯模型依赖边界）、核心 strict TypeScript 与生产构建通过。日志 `artifacts/generator-script-monitor-final-check.log`，生产构建19.77s。此后仅更新维护文档和检查记录，并重新验证文档格式。GitHub CI 尚未远端执行，strict 仅覆盖核心 TS。

生成器展开 / resize、引用重排 / 删除、增强@ 的真实图接线和历史提交已验。ScriptV2创建、九列表格、对白 / 运镜 / 独立手动 prompt、本地图片组、刷新恢复已验。Studio真实4556B GLB两相机、三张430×242帧、选择 / 双击进入 / 退出 / 返回3D、播放和监视器收起重开已验。相关图事务、portrait未知拒绝、独占target释放、DPR与linear→display RGB有回归；实际界面截图和剩余边界见 [功能审计](./generator-script-monitor-functional-audit.md)。

实际 Canvas1280×720展开 resize 到840×634，子设置菜单 Escape先关闭自身，草稿保留；390×844展开宽351，页面scrollWidth390。截图 `artifacts/generator-expanded-desktop-proof.jpg`、`generator-expanded-mobile-proof.jpg`、`storyboard-script-desktop-proof.jpg`、`studio-monitor-desktop-proof.jpg`。

用户明确当前版本不考虑登录后，App改为稳定本地工作区，不读取 / 写入旧账号会话或展示登录弹窗。真实App直接打开已存Canvas与Studio，恢复分镜 / 图组 / GLB，新增文本“无需登录，本地工作区保存与恢复。”并立即刷新恢复。新标签在Studio播放 / 收起重开和Canvas编辑后error / warn为空；较早QA标签曾留有Maximum update depth日志，未据此宣称其零日志。截图 `artifacts/local-workspace-desktop-proof.jpg`，1280×720 / 71308B；展示本地工作区菜单，无登录 / 退出入口。临时tabs已关闭，用户原4 / 7标签和默认viewport保持。

最终检查修复了旧quota回归的时序：存储失败必须在编辑前安装，避免真实交互超过500ms自动保存后才模拟失败；保持原旧文档 / 内存编辑 / 重试 / 刷新断言。长相机多步骤用例保留10s显式预算，Vitest最多4workers控制资源竞争。最后相关3文件15测试和全套880测试通过，未降低断言或关闭工程规则。

本地actor不含账号 / 会员 / 团队权益，MCP授权显示未接入。完整ghost / Tab、主体资产和分镜阶段 / 版本 / mixed2video、手机StudioInspector、视频导出、真实生成 / 费用与运营写服务仍缺；整个复刻目标保持未完成，认证与账号资源按用户要求延期。

## 节点 AutoLink 补全（2026-10-11）

最终 `npm run check` 全部通过，**181 个测试文件、911 项测试**；Prettier、零警告 ESLint（含工程依赖边界）、核心 strict TypeScript 和生产构建通过。日志 `artifacts/prompt-autolink-final-check.log`，Vite构建23.79s。冻结后仅更新维护文档，并重新检查文档格式。GitHub CI 尚未远端执行，strict不覆盖全部JSX。

新增三文件31项：纯名称 / 变体 / 唯一性 / 序号 / 边界 / 粘贴区间 / 换行 / 拒绝匹配15项，真实DOM prompt13项，strict TS偏好3项。回归验证灰色建议不进入序列化 / 复制，150ms正文提交与200ms检测独立，接受 / 撤销 / 重做，batch单次提交、controlled回写保留剩余ghost，IME / blur / readonly / readiness / 引用移除 / 外部更新 / 切session取消，独占video释放，AutoLink关闭仍可显式@，嵌套dialog首字段Shift-Tab和逐层Escape。独立只读复核发现的 IME 与 disabled / readonly 交叉已修复并新增两项恢复回归；相邻序号消费使用右偏 Range 起点并增加一项批量撤销回归。相关原prompt / InlineGenerator / dialog回归包含在全套中。

实际无需登录App验证现有Canvas：普通序号Tab接受写入正确Mixed1；真实粘贴两项，连续Tab保留剩余建议，展开层Shift-Tab接受全部。UI关闭AutoLink后刷新仍关闭、文字恢复，手动键入@可打开全画布候选，验证后恢复默认启用。390×844展开宽351、页面scrollWidth390，Escape先拒绝原词而保留展开层，再关闭父层。追加“图片1图片2”实际剪贴板粘贴：两个ghost，Shift-Tab后两个Mixed token，同一展开编辑器一次撤销回原文且无实际badge。实际App验收标签error / warn为空。

截图 `artifacts/prompt-autolink-desktop-proof.jpg`（1280×720 / 43062B）、`artifacts/prompt-autolink-mobile-proof.jpg`（390×844 / 21880B）与接受后 `artifacts/prompt-autolink-accepted-proof.jpg`（1280×720 / 37112B）通过真实CUA捕获并落盘。临时47 / 48 / 49 / 50标签已关闭、viewport恢复；用户原4 / 7标签保留。原站公开源码归档只读研究，没有使用真实账号或原写API。

工程按匹配 / DOM / controller / tooltip / strict TS偏好分层，无新依赖或跨域白名单扩张。源模块和本地适配见 [AutoLink审计](./prompt-autolink-functional-audit.md)。标签理解服务、完整swap / picker / 特殊token、原登录态像素 / 真实手机软键盘 / Safari仍未全验；生成、费用、协作和运营写服务继续未接入。登录不属于当前版本，整体复刻目标未完成。

## 节点引用替换与资产入口（2026-10-11）

最终 `npm run check` 全部通过，**185 个测试文件、973 项测试**；Prettier、零警告 ESLint（含工程边界）、核心 strict TypeScript 和生产构建通过。日志 `artifacts/prompt-reference-actions-final-check.log`，Vite 构建14.85s。此前972项检查后，截图发现 picker 被 transform 祖先影响，修复根层 portal并增加实际 Inline + 展开层回归后重新完整执行；本条973项才是最终冻结版本。随后只维护文档并重新检查格式。GitHub CI 尚未远端执行，strict不覆盖全部JSX。

新增4个测试文件和既有回归扩展，共增加62项：swap DOM9 /实际输入13，纯资产模型12，真实共享picker与request17，graph batch3，实际Inline3，共享picker caller policy /首项预览5。覆盖当前 occurrence、其他video DOM与释放、source spacing、latest-token、原连线保留、真实compositionStart /mention禁用、静止窄屏RAF、readonly /session /外部正文 /卸载、取消重开后的旧pick和close、first-item /URL优先复用 /尺寸 /容量 /不留失败节点、首次mixed模式同步、空首URL保留原数组、同次history及body portal /嵌套Escape。

真实本机无需登录App验证重复token单步换项与undo /redo，资产取消恢复editor /保留@，两张已连资产批量插入 /刷新恢复；新建空StarVideo2.0首次选图复用已有node、连入后立即全能参考 /Mixed1，画布一次undo恢复text2video /@ /原edges，redo恢复。390×844 swap菜单width200 /right237，根层资产弹窗x16 /width358 /right374 /height764，页面scrollWidth390；66%缩放和展开编辑器再验，Escape只关闭picker而保留展开层，焦点回editor。验收tab warn /error为空。截图 `artifacts/prompt-reference-picker-desktop-proof.jpg` / `prompt-reference-imported-desktop-proof.jpg` / `prompt-reference-swap-mobile-proof.jpg` / `prompt-reference-picker-mobile-proof.jpg`。

模块职责、公开源码manifest与明确的首个非空URL /本机legacy /组内坐标适配见 [引用动作审计](./prompt-reference-actions-functional-audit.md)。没有新依赖或工程白名单扩张；没有执行原站bundle /遥测 /账号请求 /生成 /消费 /写接口。节点picker已接，不代表分镜阶段资产CRUD、完整主体编辑、特殊token、标签服务、实际团队权益或运营服务已完成。登录、注册及账号资源按用户要求继续延期；整体复刻目标仍未完成。

## 分镜资产工作流与窄屏属性（2026-10-11）

最终 `npm run check` 全部通过，**189个测试文件、1010项测试**，格式、零警告ESLint（含架构导入边界）、核心strict TypeScript、Vite生产构建通过。日志 `artifacts/script-assets-workflow-final-check.log`；最终测试10:26:38开始、构建15.08s。首次public素材复制遇ENOSPC，空间恢复后对最终CSS整套重跑成功；没有删源码/素材/用户文件或缩减build范围。后续仅补维护文档并独立检查格式。strict不覆盖全部JSX，CI未远端运行。

实际无登录App `/canvas?projectId=generator-oct11-proof`，1280×720和390×844：新增场景取消选图保留pending，名称/描述/真实参考图绑定刷新恢复；清图保留原图片节点，单次undo/redo恢复进度；menu/preview/editor逐层Escape，stage下一步/重开，删除确认default keep_text（浏览器取消，真正删除策略为定向测试），CSV下载422bytes/BOM efbbbf/5行包含镜头和资产段。窄屏drawer全宽390，picker x24/width342；修复私有160–190层低于EditorDialog4000导致视觉遮挡，最终4010–4040；候选名称改私有block布局。开发期间controller ref增加触发过HMR hook顺序错误，冻结后刷新继续验收无新error/warn。

`/animation-preview?projectId=studio-camera-qa`，390×844：项目资产开关可用，实际导入GLB子节点GrowingTriangle位置X由0改0.35，关闭展开、刷新后保留；panel x150/width240/right390/top48/bottom674，页面宽390。源公开renderer没有viewport禁用门控，CSS只有max1000 header适配；本地覆盖式窄屏布局属于适配，不能宣称全部移动Studio/GPU像素完成。

证据 `artifacts/script-assets-desktop-proof.jpg`、`script-asset-drawer-desktop-proof.jpg`、`script-asset-drawer-mobile-proof.jpg`、`script-asset-picker-mobile-proof.jpg`、`studio-properties-mobile-proof.jpg`、`script-v2-downloaded-proof.csv`。源码和剩余范围见 [资产阶段审计](./script-assets-workflow-functional-audit.md)、[Studio审计](../src/features/studio/SOURCE_AUDIT.md)。本地样本不代表原站账号、真实生成/上传/图片库/费用；本地自动拼接、完整版本和mixed2video等仍未完成。保留用户原有2个tab、关闭所有临时tab并重置viewport。

## 分镜最终提示词（2026-10-11）

最终 `npm run check` **195个文件/1071项测试通过**：Prettier、零警告ESLint及架构边界、核心strict TypeScript、Vitest与生产构建。日志 `artifacts/script-prompt-compose-final-check.log`，测试10:55:19开始，构建17.09s。样式漏import、按钮优先级和窄屏遮罩padding经实际截图修复后重跑；一次Vitest临时写入ENOSPC，空间恢复后重新完整检查通过。未删改源码、素材或用户文件，没有缩减检查/构建范围。随后仅更新文档并独立核对格式。strict不覆盖全部JSX，CI未远端运行。

新增6个测试文件及61项回归，含源模板/双FNV/refs、单/批生命周期、覆盖/20秒undo、实际节点入口和统一草稿。独立只读复核发现并修复settled文档pagehide不投影、已投影保存后新draft基线失配、styleDescription遗漏与全空/全失败不应清旧undo。source覆盖检查旧bundle指纹，确认后使用最新字段；手动改词保留状态/hash。批量rows变化按源补选缺词行。

实际本地无需登录项目 `/canvas?projectId=generator-oct11-proof`，1280×720与390×844：单镜取消保留、concat真实不同轨模板、覆盖1镜2条、20秒undo复原；批量完整行默认不选、全选/描述展开、取消保留弹窗、应用关闭后主工作区undo复原。@资产chip原文绑定、Meta+Z/Shift+Meta+Z、Backspace整块删除及恢复、子菜单Escape先关闭、关闭即时flush、未到500ms直接reload恢复最新视频输入均通过。智能合成明确服务未接、无任务提交及登录要求。冻结后的新标签恢复正文，warn/error为空；开发期间历史HMR日志未冒充最终运行错误。

桌面单镜dialog width760；390px x16/width358/页面宽390，资产菜单在当前dialog，全部可见控件无横向溢出。截图 `artifacts/script-prompt-compose-desktop-proof.jpg`（1280×720/31579B）、`script-prompt-compose-mobile-proof.jpg`（390×844/22338B）、`script-prompt-compose-menu-mobile-proof.jpg`（390×844/23722B）、`script-prompt-compose-batch-desktop-proof.jpg`（1280×720/23511B）。临时60/61/62标签已关闭、viewport恢复、用户4/7标签保留。

职责和源证据见 [提示词拼接审计](./script-prompt-compose-functional-audit.md)。智能scriptText目录、费用/任务、媒体版本菜单、完整任务详情和运营写服务仍未接入；原站登录态像素、真手机软键盘/IME/Safari尚未全验。当前版本仍无需登录/注册/小号资源，整体复刻目标继续进行。

## PenStudio品牌节点操作与媒体历史（2026-10-11）

最终 `npm run check` **202个文件/1227项测试通过**：Prettier、零警告ESLint及架构依赖边界、核心strict TypeScript、Vitest和Vite生产构建。日志 `artifacts/penstudio-node-interaction-final-check.log`，测试15:39:33开始、54.24s，构建26.45s。生产代码冻结后只更新维护文档并独立检查格式。strict不覆盖全部JSX，GitHub CI尚未远端执行。

按用户反馈将选择与拖动分开；轻点和3px抖动不重建内嵌输入、不产生历史，超过4px才启动拖动且只记一次历史。4px为改善手感的本机适配，原站React Flow默认1px且实际renderer无override。pointerId/primary、最终pointerup落点、capture/cancel/lostcapture/blur、文档所有权、手型/Space/中键与浏览器快捷键有回归；输入/媒体/滚动容器不被画布抢事件。实际NodeCanvas集成7项验证输入DOM、拖动单次undo/redo、pan保留选择与source handle→target click的一次图历史，不能把单指针回归等同完整触摸模式。

媒体菜单按源数组顺序、日期、当前项、视频图源和原蓝紫色展示；设为当前保持菜单，先捕获owner再flush最新草稿，执行源tk完整镜号/refs/对白/state/hash流水线，CAS提交一次历史。A→B→A、同ID类型替换、readonly/busy分离、迟到复制反馈与取消/Quota重试有回归。失败信息只读script taskInfo状态3/4；真实生成进度source未连接，不造版本、媒体结果或完成任务。独立本地验收项目明确使用合成版本及失败ID，未操作用户原项目或原站账号。

真实1280×720 Canvas：普通点击undo disabled；hand从节点平移80/40像素保留节点位置与原选择；节点移动40/25像素到1690/675，单次undo回1650/650且随后undo disabled；source图片handle→视频body只增加一条edge，单次undo回0；文本节点原生scrollTop从0变406，world transform保持不变。图片/视频版本切换、定位后两个dialog及菜单保留，最后输入未等500ms就切active仍在新页恢复。点击失败编号后实际Meta+V得到完整本地ID；clipboard代理readText为空，因此未将代理读取作为成功证据。

真实390×844：主页PenStudio字标宽96px，无顶栏重叠；版本dialog x16/width358/right374，视频菜单right382，页面宽390。直接只读分享无需登录，菜单无写动作而定位保留叠层。Blender两张新SVG加载、导航及标题可见；学院标题SVG x20/width350/right370，显示PenStudio学院、无页面横向溢出。曾请求320px但该tab实际仍390px，未记为320px通过。

产品标题、导航、Canvas/Agent/Studio和学院/Plugin/Blender外壳使用PenStudio；保留原公开内容、下载文件、源码证据、来源URL及libtv-*持久化key。原客服二维码明确标原站公开样本。新增public SVG后重启开发服务恢复静态映射；开发期间修改hook数量触发的历史HMR日志不代表冻结后的运行态。最后用户当前Canvas与学院tab读取error/warn均为空，未重载或改动用户Canvas。

临时viewport已reset，验收tabs6/7/8/9及旧失败tab3已关闭；用户tabs1/2/5保留。旧tab4为data URL错误页，绑定关闭受浏览器URL策略阻止，未绕过策略或操作页面，故保留该错误tab。

实际CUA截图：`artifacts/script-media-history-desktop-proof.jpg`（1280×720/39621B）、`script-media-history-mobile-proof.jpg`（390×844/27255B），最终当前用户Canvas新品牌截图 `artifacts/penstudio-canvas-desktop-proof.jpg`（1281×1104/59212B）。本批测试、本地状态与截图不证明原站全功能或逐像素完备；完整touch mode/双指缩放、真手机/Safari、全部缩放策略、原站拖拽连线自动pan、大量节点性能、真实生成/费用与运营写服务仍需后续完成。登录注册、小号和真实账号资源继续延期。详细范围见 [节点操作审计](./canvas-node-interaction-functional-audit.md)、[媒体历史审计](./script-media-history-functional-audit.md) 和 [覆盖清单](./coverage.md)。

## 节点触摸与拖拽连接（2026-10-11）

针对“节点交互不流畅自然”完成下一批手势及连接维护。最终生产代码冻结后 `npm run check` **211个文件、1477项测试全部通过**：Prettier、零警告 ESLint/工程依赖边界、核心 strict TypeScript、Vitest 和生产构建。日志 `artifacts/canvas-touch-connection-final-check.log`，测试17:07:57开始、53.99s，构建13.67s，进程exit0；strict不覆盖全部JSX，CI尚未远端执行。随后只更新维护文档并独立核对格式。

初次完整检查发现历史fit测试仍断言旧max1；按源numeric padding和世界中心修正断言后定向18项通过。并行编辑期间第二轮完整检查出现4项既有集成超时和一项旧preview CSS import断言；4文件28项独立重查通过，preview测试改读实际CSS并保留CSSOM语义断言，17项通过。未抬高测试timeout、未减少maxWorkers或移除校验，冻结后重新运行上述完整检查通过。定向记录包括 `artifacts/canvas-touch-connection-fit-tests.log`、`canvas-touch-connection-regression-recheck.log` 和 `canvas-touch-connection-preview-tests.log`。

新增真实NodeCanvas联合回归15项，使用真实actor、图/历史/持久化/菜单hooks，覆盖节点↔touch、连接↔touch双向接管、旧RAF/release、A→B→A、卸载保存和原生输入滚动。普通连接资格64项、menu hook25项、menu view33项、Preview17项通过；preview CSSOM/计时器测试不等于真实GPU动画，原生TouchEvent回归不等于真机双指验收。

独立本地项目 `/canvas?projectId=canvas-connection-proof`，未覆盖用户项目。真实1280×720：短按output后点合法video body只连线，正向/反向拖拽可用，重复连接明确拒绝；拖到空白选择文本，源“根据图片生成提示词”保存于正文和prompt，一次undo/redo同时撤回/恢复节点+边。刷新恢复4节点/2边和默认文本。最后生产冻结后再次原生drag从[341,209]到[400,550]并选择文本，5节点/3边；一次undo回4节点/2边，undo disabled。Escape菜单关闭回“连接节点”按钮，board.scrollTop始终0；当前DOM宽1280、scrollWidth1280。

实际焦点曾让overflow:hidden的board隐式scrollTop=90、坐标脱离world view，改overflow:clip后归零；节点/分镜自身滚动保持。连接移动仅对向handle候选，释放才有body fallback；合法预览吸附border，invalid灰线持续600ms提示，unknown跟随实际指针。40px边缘autoPan、source曲率/flow及生命周期由源审计和定向测试核对；此次CUA drag会在截图前完成，未捕获持续按住期间的真实flow/GPU截图，不能扩大视觉验收范围。

390×844验证source菜单和脚本二级菜单：页面scrollWidth390，最终二级菜单x120/y653/right340/bottom739。左右均放不下时上下展开属于本机适配，避免覆盖trigger误创建；桌面仍按源左右布局。源fit默认padding .1、空白双tap .15/300ms、min .1/max8已统一模型与联合回归；真实手机UA/Safari/native pinch和大量节点性能仍待验。

CUA截图 `artifacts/penstudio-node-connection-desktop-proof.jpg`（1280×720/51625B）、`penstudio-node-connection-mobile-proof.jpg`（390×844/23409B）。最终own QA tab在冻结后重新加载，读取17:00之后error/warn为空；历史16:25–16:41的hook数量变化Fast Refresh错误保留，不冒充最终运行错误，也未刷新用户未保存tab。临时tabs10/11/12已关闭、viewport reset，用户tabs1/2/5保留；旧错误tabs3/4为浏览器data URL错误页，绑定受URL策略阻止、未绕过关闭，仍保留。

具体职责和源证据见 [触摸连接审计](./canvas-touch-connection-functional-audit.md)、[触摸源码](./canvas-touch-source-audit.md)、[连接源码](./canvas-connection-source-audit.md)、[端口菜单](./canvas-handle-menu-source-audit.md)。临时ghost node/edge、完整节点光边/倾斜/blocked遮罩、特殊主体/团队/权益metadata、真机和所有运营写服务仍有缺口；当前版本继续无需登录注册或小号，整体复刻目标继续进行。

## 节点反馈与临时连接（2026-10-11）

继续回应节点手感反馈，普通节点按直接源接white rotating glow、±8° tilt、blocked/invalid正文遮罩；空白release纯投影tiny node/edge，短按无temp；world anchored菜单保持request/focus。新增6个测试文件、102项回归。最终 `npm run check` **217个文件/1579项测试全部通过**，Prettier、零警告ESLint/工程边界、核心strict、Vitest和生产构建；日志 `artifacts/canvas-node-feedback-final-check.log`，测试17:46:59开始、46.11s，构建11.52s，进程exit0。strict不覆盖全部JSX，CI未远端执行。

初次冻结检查17:36:31/50.39s/构建11.67s已通过217/1579；真实390px随后发现公共cv-floating的1px外border覆盖菜单，改为复合选择器后桌面和390px重验，并再次完整检查得到上述最终结果。新view测试曾使用本项目未安装的jest-dom matcher，改为DOM isConnected后语义回归通过；未扩timeout、禁规则、减少检查或运行原站生产脚本。最后生产与根维护文档已冻结；随后仅补研究验证记录。

并行独立冻结复核未发现保存/输入/历史阻塞：7文件101项17:36:34/7.81s、6文件100项17:38:11/2.09s，日志 `artifacts/canvas-connection-owner-freeze-review.log` / `canvas-connection-owner-shell-review.log`。原article保持world几何与测量，永久surface包title/body/handles/actions/inline，body只承担光边和遮罩；inline coordinateOrigin不改变文档/草稿/portal。getNodeSize注入canvasNodeSize，与normalized本地图和renderer同尺寸协议。

独立项目 `canvas-connection-proof` 使用三个代表性节点，没有覆盖用户项目或要求登录。真实1280×720原生drag[540,193]→[600,420]：3节点/0永久边、1ghost/1ghost edge、undo disabled；滚轮后view Y由-107.742变-395.742，菜单Y由416变132，文本focus保留。菜单创建文本→4/1，temp归零；一次undo→3/0且undo disabled。Source短按无ghost，Escape回连接端口，board.scrollTop0。实际video inline宽660px；填写“沿海岸缓慢推进，保留输入”，开关source菜单后仍保留，刷新后的video正文恢复此值，3/0且ghost0。

真实390×844 fit43%，blank release有temp：修复后menu x162/y540/width220/right382/bottom836；script flyout x162/y663/width220/right382/bottom749，page scrollWidth390。两次Escape逐层关闭，temp归零、3/0不变并回连接端口，boardScroll0。尺寸读实际DOM，不以mock rect代替浏览器布局。

持续glow/tilt/invalid GPU图使用忽略目录中的明确QA按钮派发**合成PointerEvent**，经真实production handler/Viewport/CanvasNode渲染；没有用evaluate写state/storage或伪造DOM。实际candidate rotateX2.4°/rotateY4°和matrix3d、glow1.2s；video→image invalid呈灰线、脉冲及body blur6，600ms“无法连接”，title/ports不被遮罩。此渲染证明不等于原生持续按住拖动、真机/Safari/native pinch验收。浏览器CUA按住drag API在截图前结束，故原生release行为另验，不能混称。

截图：`artifacts/penstudio-node-feedback-desktop-proof.jpg`（1280×720/47677B，原生release最终CSS）、`penstudio-node-feedback-mobile-proof.jpg`（390×844/33376B，原生release/flyout）；`penstudio-node-feedback-glow-proof.jpg`（1280×720/44213B）和`penstudio-node-feedback-invalid-proof.jpg`（1280×720/40098B）为上述合成事件GPU辅助图。最终QA tab13及GPU tab14 error/warn均为空；QA iframe button locator一次等待过期、非可聚焦board press一次超时均为CUA操作错误，读取新state后继续，不算production日志。独立QA13/14/15/16/17/18全部关闭、viewport reset；用户tabs1/2/5和此前受URL策略限制的错误tabs3/4保留，未刷新用户未保存Canvas。

职责及直接源证据见 [节点反馈审计](./canvas-node-feedback-functional-audit.md)、[反馈源码](./canvas-node-connection-feedback-source-audit.md)、[ghost源码](./canvas-connection-ghost-source-audit.md)。原tiny真实DOM、完整特殊renderer/多选发起、团队/主体/权益metadata、全部快捷键、大量节点性能和所有运营写服务仍有差距。当前版本继续无需登录注册/小号资源，整个复刻目标未完成。

## 多选节点交互与输出连接（2026-10-11）

继续用户节点手感优化。虚拟多选外框/整体移动、源screen加号、锚定toolbar、独立多源gesture/聚合资格/viewport预览、六项菜单与一次共享target已接真实NodeCanvas。Graph原身份CAS后同步投影previous/next，普通history record与autosave成功ack保持最后150ms输入，防止inline因多选卸载后正文被旧图再次覆盖。

最终生产冻结后 `npm run check` **225文件/1764项测试全部通过**，包括Prettier、零警告ESLint/工程边界、核心strict TypeScript、Vitest和完整生产构建；日志 `artifacts/canvas-multi-selection-final-check.log`，测试20:09:58开始/43.87s，构建11.22s，进程exit0。随后仅更新维护与验证文档并独立核对格式；strict不覆盖全部JSX、CI未远端执行，不把全量check当原站全功能验收。

定向真实NodeCanvas多选12项；pending inline输入真实联合11项；pure/single/Graph三文件129项；owner联合10文件192项；视觉/Pointer三文件78项；toolbar9项；Touch28项；Menu/Preview两文件52项。多个集合交叉，不能相加扩大统计。日志包括 `canvas-multi-connection-owner-regression.log`、`canvas-connection-feedback-integration.log`、`canvas-selection-touch-owner.log` 和 `canvas-multi-view-final-tests.log`。未改变timeout/maxWorkers/关闭规则或减少检查。

独立本地项目`canvas-multi-connection-proof`，无需登录、不覆盖用户项目。原生CUA1280×720两图Shift多选；拖选区保持选择，移动53.115/17.705世界单位、一次undo恢复；短按六项/Escape回加号。拖两图至已有视频增加两条真实永久边，一次undo归零。最终blank[650,480]有两条蓝线、24px圆x638/y468，准确居中游标；图片生成菜单只创建一个目标，3→4节点/两条永久SVG path、目标inline两份参考、model lib-image-2.5-s；一次undo回3/0。原视频“沿海岸缓慢推进，保留输入”仍保留。拖动release后截图不等于原生持续按住期间GPU/真机证明。

390×844 fit40%，toolbar固定屏幕大小、clamp/横向滚动；六项菜单x181.195/y305.211/width196/right377.195，page scrollWidth390。Escape回原加号，临时视口reset。最终native截图`artifacts/penstudio-node-multi-desktop-proof.jpg`（1280×720/68749B）和`penstudio-node-multi-mobile-proof.jpg`（390×844/38174B）已实际回读；原始截图字节由本地QA输入/按钮写入，仅验收截图桥接，不用evaluate改DOM/state/storage。临时截图写服务exit130已停止、5199无listener。可绑定验收tabs关闭；首次dev离线的data错误tab受URL策略限制未绕过，使用工具临时tab生命周期清理。开发服务离线经实际lsof确认后重启，不因观察timeout重启存活任务。

源nB默认viewport passive center与right形态明确区分，避免游标圆被错误右移17px；普通节点单连/tiny ghost原协议保留。source script-v2 switch落入TEXT为异常分支，本地保留正确factory并明确适配。source和本机4px/recursive世界坐标/renderer size/8px窄屏clamp/blur-hidden/owner-CAS区分，见 [多选交互验收](./canvas-multi-selection-functional-audit.md)、[连接源码](./canvas-multi-connection-source-audit.md)、[选区源码](./canvas-selection-visual-source-audit.md)。

真实普通组递归pure helper已有，完整输出入口尚未接；Group提示、Alt复制/Meta边策略、框体autoPan/高级drop、完整特殊renderer/快捷键、大量节点性能、真机/Safari/native pinch、协作/权益与真实生成/费用/写服务仍缺。当前继续无需登录、小号及原站账号资源，整个复刻目标未完成。

## 普通组输出与选区复制（2026-10-11）

本批继续用户节点交互反馈：普通组右中screen加号、递归叶子输出、虚拟框Alt/Option复制、Ctrl/Meta带内部及上游输入边、raw graph CAS与source草稿投影接入。普通组不另画虚拟框；一个actionless叶子仍能显示入口，生成按真实resolver禁用。sourceScript/breakdown精确predicate共用、不擅自排characterAsset；entry、递归membership及精确selector隔离旧请求。

首次完整检查通过228文件/1892项，但浏览器blank-release Escape发现焦点停BODY；未据此将批次标记完成。真实NodeCanvas新回归同样失败。已定位Touch.clear通过统一pointerCancel再multi.cancel使提前mint的requestSequence过期，修正为先互斥取消再创建request；保留旧request、epoch与owner防护。修后真实页面/Graph/controller联合3文件93项通过（20:33:51、3.10s），同-hook取消链隔离与回焦点回归包含在最终统计中。

最终冻结后 `npm run check` exit0，日志 `artifacts/canvas-group-selection-final-check.log`：格式、零警告lint/architecture、核心strict TypeScript、Vitest、生产构建全部通过。**228测试文件/1895项**，20:37:13开始、50.63s；生产构建12.94s。随后只补文档并独立检查格式，不将strict描述为全部JSX覆盖，CI未远端执行。

独立生产API保存QA项目`canvas-group-interaction-proof`，原生点击/拖动/Escape，不用evaluate改DOM/state/storage。1280×720 fit102%后真实组右边655.25，80px hit/24px glyph圆心外17px；递归两图片拖到video一次2边，undo回5节点/0边。blank735,590：两条纯预览、24px中心圆723,578；六项菜单747,447,196,265，底712。短按再选图片新节点世界700,290、两个引用、公开模型，undo一次移除节点和两边。

390×844 fit35%，page scrollWidth390；真实组无虚拟框，80/24px入口保持固定尺寸；blank244,585后菜单186,452.5,196,265、右382，两来源无丢失。修后1280/390原生blank菜单Escape均回`group%3Agroup-proof`，保留原组选择、清菜单/preview。viewport尝试未生效时读到1280/390后重新取得明确尺寸再验，没有以请求尺寸替代实际布局证据。

最终截图回读：`artifacts/penstudio-node-group-desktop-proof.jpg`1280×720/64382B，`penstudio-node-group-mobile-proof.jpg`390×844/41465B。原始截图字节经正常本地QA输入/按钮写入，仅传到localhost截图服务；临时写服务exit130停止、5199无listener；临时viewport reset，4个本批创建tabs已关闭。

本批Alt仅接虚拟框，真实NodeCanvas固定修饰键/移动原件不变/一次undo-redo与草稿经过联合回归；没有把它当作原生浏览器按住Alt或真机触控。普通node/真实组Alt、框体autoPan/高级drop、Group新点提示、完整特殊renderer、源恢复fallback、真机/Safari、大量节点性能、协作/权益及运营服务仍缺。实际源码、本机适配与边界见 [本批验收](./canvas-group-selection-functional-audit.md)、[组源码](./canvas-group-connection-source-audit.md) 和 [复制源码](./canvas-selection-copy-source-audit.md)。无需登录/小号，整个复刻目标未完成。

## 普通节点与真实组拖动复制（2026-10-11）

用户继续要求节点操作流畅自然。本批延续上一批虚拟选区Alt，补普通single / 组内孩子 / 整组 / 已选multi成员。纯资格、single / selection additions、Graph copyMode/CAS、Pointer阈值/手势/捕获分层；未修改登录边界、真实生成或原站写入。

原站普通 onNodeDragStart 先完成selection，再读首次越threshold的当前graph/sourceEvent，virtual frame仍down固定。本机保持≥4px相对源>1px手感适配。复制source先投影最后尚未提交prompt再clone；single default detach与Ctrl/Meta preserve / 上游target-only规则、group-child world detach、不加后缀、精确root专属尺寸清理按源维护。缺parent/temp/hidden公开single planner拒绝、完整local nested补全和取消不rollback副本均是记录的工程适配。

浏览器重现并修复：未选video含已连imageList/textList首次选中时inline推断incoming mode替换nodes数组，down rawCAS旧引用使copy静默失败；actualNodeCanvas新增同例先失败3nodes/expected4，ordinary改firstthreshold最新graph后通过，事务内严格rawCAS仍保留。代码审查指出ordinary全程board capture影响原生click目标；最终恢复down node、copy确认后在Graph前转board，旧surface lost仅在board仍持capture时忽略，真实board lost/转交失败仍取消。保留旧ordinary/touch原node capture断言，未通过删断言处理回归。

冻结后最后 `npm run check` exit0：**228测试文件 / 1995项测试通过**，21:07:06开始、52.70s；格式、零警告ESLint及架构边界、核心strict TypeScript与生产构建10.31s通过。日志 `artifacts/canvas-node-alt-final-check.log`。Pointer114项含capture交接、失效、Escape/hidden/owner；model55、Graph20、实际multi31、实际interaction7联合227项通过，相关touch/ordinary4文件81项另验。strict不覆盖所有JSX，CI未远端执行。初期ENOSPC只清理旧生成dist后恢复，源码/素材/用户项目保留。

最终复制QA使用画布同一document内正常测试按钮的原生按下ID，移动/up/Alt/Meta由明确合成PointerEvent驱动真实handler：video8nodes/4edges、prompt和两类refs保留；single9nodes、groupchild9nodes/world190/155无parent、wholegroup12nodes/4copied members及relative tree；每次一次undo回8。实际capture转交可发生，但不能称原生Alt拖动、真实键盘组合或真机/Safari。

原生标准路由1280×720：副本标题drag到y461.271，一次undo105/redo461.271，refresh保留，两份prompt文本相同；文本标题doubleclick真实.cv-settings1/cv-menu-caption0。390×844当前活跃标签页原生copy drag到1015.22/862.957，一次undo1070/461.271→redo→reload保留，page scrollWidth=390。早先非活跃tab输入未命中，重新当前tab复验，不列为通过。原生持续Alt拖动及真机仍未实测。

截图 `artifacts/penstudio-node-alt-desktop-proof.jpg` 1280×720 与 `artifacts/penstudio-node-alt-mobile-proof.jpg` 390×844；截图经本地QA UI写入loopback专用server，结束后关闭server及所有临时tab、复原viewport。无用户项目改写，无服务器生成、上传、付款。源/范围见 [本批验收](./canvas-node-alt-copy-functional-audit.md)、[源码](./canvas-node-alt-copy-source-audit.md)。完整RF多修饰selection状态机、框体autoPan/高级drop、特殊renderer、大量节点性能、真机/Safari与运营服务仍需另验，当前无需登录/小号，整个全站目标继续未完成。

## 节点拖动、边缘平移与普通组落点（2026-10-11）

继续用户节点交互不够流畅自然的反馈。普通node/真实组/从节点开始的多选/Alt副本采用source RF40px边缘、每帧最多15屏幕px、当前世界cursor投影；虚拟selection frame采用80px、720px/s、dt≤50ms和累计实际world pan补偿。首dt0边缘仍续帧，中心停后move再启。Pointer统一持有epoch/RAF/capture，互斥writer、文档/ready/readonly、hidden/blur/Escape和第二指接管清理；本机4px、当前board rect、普通中心/抑制持续采样及最终pointerup坐标是记录的适配。

普通group落点pure planner按source完整包含入组、任意正面积重叠保parent、完全分离detach，保留world坐标/childNodeIds，不resize/reorder或改持久化z。virtual frame stop与live Alt copy不套ordinary fallback；cross-gesture detached marker、node primary selection fallback、hidden顺序及专属video尺寸清理已核对。画像/分镜/standalone grid的专属插槽/容量/ratio/重排只准确识别blocked，尚未完整执行。最终pointerup先投影末位、同一个functional updater再执行finalizer；successful epoch保留供该提交，cancel/newgesture/旧doc拒绝迟到写入。history只有一次、edges不另写。

原生桌面重现选中child正文后，其标题仍命中上方outside textarea，拖动不动。RF默认selected提升1000、父级≥自身时parent+1接入pure stacking model和Viewport memo：不写document/selected/z、不record、不重建keys或输入。source分数父级9.5/自身10仍10，纠正初稿Math.max为精确条件；同层9.5才10.5。标题子span恢复pointer-auto的源例外已记，不误称所有未选标题禁用。React最佳实践与独立全链只读复核未发现确定阻断。

冻结后最后`npm run check` **232文件/2140项测试全部通过**，Prettier、零警告ESLint/架构边界、核心strict TypeScript及生产构建均通过，进程exit0。日志`artifacts/canvas-node-drag-final-check.log`：21:40:59开始、60.03s，构建11.20s。相关去重联合7文件297项（Pointer144、group67、pan30、stack10、实际drag8、多选31、interaction7）21:40:25/4.03s通过，日志`canvas-node-drag-related-final-check.log`。独立stack/实际drag两文件18项21:40:49通过。strict不覆盖全部JSX，GitHub CI未远端执行；随后仅维护研究和根说明并独立检查格式。

初次全检查日志`artifacts/canvas-node-drag-initial-check.log`保留：231文件2129测试中2128通过、1失败，21:35:59/100.36s，未进入build。既有`NodeCanvas.test.jsx:694`的Agent上传预览findByRole超时；未修改生产上传逻辑/断言/timeout/maxWorkers。原断言单项1项21:38:11/435ms、整文件25项21:39:06/3.57s、NodeCanvas+Attachments+RichAgentInput联合41项21:40:01/5.55s通过，日志`canvas-agent-upload-joint-regression.log`。两份独立审查未找到确定生命周期错误，完整负载更高不足以确定根因；最终同完整命令通过，不能将此记为“修复上传”。早期Pointer预期y175与真实变zoom几何125不符，仅纠正夹具预期，144项通过，日志`canvas-node-autopan-pointer-regression.log`。

独立QA项目`canvas-node-drag-interaction-proof`通过正常生产持久化API创建，只写此本机key。原生1280×720拖outside标题[120,131]→[500,231]，world80,100→460,200，入group420,100后的relative40,100；一次undo回80,100、redo回460,200。edge拖other[115,450]→[1273,450]，viewX0→-12.375、worldX1250.375，标题/指针同向，once undo80、redo1250.375再undo。修正层级后child标题命中child/z1000，[480,380]→[180,380]得world160,350无parent，group仅outside；undo恢复childworld460,350及parent、redo脱组，再undo。刷新恢复outside/child两组成员、原text与view-12.375,0,1。

原生390×844实际DOM宽390/scrollWidth390、zoom.36。outside标题[62,145]→[200,181]得world463.333,200、group relative43.333,100，once undo80/redo463.333。selected child z1000标题命中child；[196,235]→[110,235]得world221.111,350/relative-198.889,250，仍有1.111world宽的正面积重叠，parent和group两个child保留。第一次立即读取存储未过300ms autosave显示上一位置，未列为结果；之后独立重拖、正常QA按钮读取实际持久化确认，不能把旧snapshot当落点。完全拖[196,235]→[105,235]得world207.222,350、无parent，group仅outside；一次undo460,350/redo207.222，再undo。edge other[65,260]→[384,350]得world1001.5278,670、viewX12→-.75；一次undo80,420、redo1001.5278,670，再undo。刷新恢复child/parent、outside归组与view-.75,70,.36，输入内容保留，重新选child仍z1000且无新history。

截图已实际回读：`artifacts/penstudio-node-drag-desktop-proof.jpg`1280×720/44813B与`penstudio-node-drag-mobile-proof.jpg`390×844/34719B。正常本地QA textarea/按钮将原始CUA JPEG写到loopback专用服务，没有用evaluate写DOM/React/storage。此次持续stationary autoPan、virtual dt0与变zoom由真实Pointer/NodeCanvas联合测试验证；原生drag结束截图不能证明持续按住GPU或真手机/UA/Safari/原生Alt组合。mobile final error/warn为空；临时撤销locator因未含⌘Z未命中，读完整AX后使用准确名称复验，属于验收操作错误。临时QA21/desktop22/23/mobile24全部关闭、viewport reset，截图服务exit130停止/5199无listener；用户未保存tab未刷新。

维护、源码差异与剩余范围见 [本批验收](./canvas-node-drag-functional-audit.md)、[平移与层级源码](./canvas-node-drag-pan-source-audit.md)、[分组源码](./canvas-group-drag-source-audit.md)。旧记录框体autoPan/普通group drop已由本批更新；完整特殊renderer/高级drop、Group新点提示、RF完整多修饰键selection、非modal原资产抑制面板、真手机/Safari、原生Alt持续拖动、大量节点性能、协作/权益和真实运营服务仍缺。继续无需登录注册、小号或原站账号资源，整体全站目标未完成。

## 分镜组与节点拖动协调（2026-10-11）

继续用户节点交互优化。本批接实际2–25根图片“合并分镜组”、primary网格预览/最近槽换位/拖出、special node/frame落点、actual membership reflow、node outer grow-only扩壳与空槽单图补入。inner handler无扩壳与outer ce/ct扩壳分开；frame不套node协议。source原始flow字段与本机explicit media显示尺寸分开，组内标题/两端口按独立source门槛隐藏，拖出恢复。

Pointer不可变stagecontext继承实际commit，并缓存Strict重放；完成选择/提示在对应nodes提交后按document/owner/CAS处理，一手势一次历史。slot读取与nativechooser入口绑定唯一request；新槽/关闭/文档/禁用/组删除/卸载取消，迟到结果不关闭或写入新槽，失败保留重试。模型、presentation、controller与views分别维护，未引入登录或原站写入。

最终生产冻结后完整 `npm run check` exit0，日志 `artifacts/canvas-storyboard-drag-final-check.log`：**245测试文件/2486项全部通过**，22:51:26开始、测试75.36s、构建24.12s。Prettier、零警告lint/architecture、核心strict TypeScript与生产构建通过；随后仅更新维护/研究文档并检查格式。strict不覆盖全部JSX，GitHub CI未远端执行，当前本机源码与构建未自动发布线上。

定向联合16文件552项在22:39:26/4.37s通过，日志`canvas-storyboard-joint-final-check.log`；后来slot模型/hook两文件43项、ghost/renderer-size/connectionMenu三文件80项通过，集合交叉，不叠加计数。实际NodeCanvas五项drag/drop/slots与三项create涵盖真实store/history/storage及刷新，catalogue请求用公开样本fixture。

初始integration25项中的一个ratio/relativeY预期错误，经source核对修正明确16:9 sibling及outer top56补偿，保留世界位置断言；第二次联合创建reload把组内已隐藏handle当ready，改为真实上传input可写信号。首次fullcheck245文件2484测试中2481通过、3个ghost尺寸断言失败，22:44:51/141.34s，日志`canvas-storyboard-drag-initial-check.log`。根因worldOrigin误用canvasWorldNodes覆盖raw尺寸，吞NaN/Infinity并使默认350高度变230；现只投影position，原37项全部保留，新增2项协议隔离。未修改timeout/maxWorkers，也未把失败日志删除。

独立QA项目`canvas-storyboard-drag-interaction-proof`只经正常生产持久化API写本机专用key。1280×720原生outside[220,290]→第四格[808,378]，一次undo恢复标题/两端口/加号，redo归组；再换第一格[604,254]、拖出[260,450]，兄弟按源推移。空格菜单Escape回原加号；history选择公开“抵达之前 From Begin To Begin”成功回已存在group。实际snapshot：group480,140/412×252，children1/2/3/新图；outside root140,340，新图relative208,128、action image_resource、分镜#4、params{}，没有自动写16:9。

390×844 fit约45%：outside[80,432]→[326,474]归组，一次undo/redo；换位[326,474]→[234,416]推移兄弟；拖出[234,416]→[110,190]恢复独立控件。菜单在窄屏内，menu Escape和history取消均回第四格；再补同公开图成功回组，刷新四图/独立outside/view保留。实际outside world208.134831,-358.786517无parent，view-27.949495,278.535354,.44949495，group/slot字段同桌面。开发期生产修复HMR曾中断一个手势并重置history，该轮不列通过；最后生产冻结后重做完整拖出/undo/redo/补图/刷新。QA截图名select首次Down/Return仍桌面，读取state后改用实际展开→窄屏选项，已确认写入正确文件。

原始截图经正常本地QA textarea/按钮传到loopback专用server并回读：`artifacts/penstudio-storyboard-drag-desktop-proof.jpg`1280×720/59555B与`penstudio-storyboard-drag-mobile-proof.jpg`390×844/34236B。没有通过evaluate写DOM/React/storage；临时tab25已关闭、viewport reset，截图服务exit130停止、5199无listener；用户标签页未刷新，开发Vite保留。

真实文件选择器/原生持续Alt、手机UA/触摸/Safari、完整分镜设置/特殊renderer、私人history分页、远端pre-sign上传、大量节点性能、锁/协作/权益与运营生成写服务仍需另验；单图本机读取、公开history样本是明确适配。完整规则、证据与差距见 [本批验收](./canvas-storyboard-drag-functional-audit.md)、[网格源码](./canvas-storyboard-grid-source-audit.md)、[组落点源码](./canvas-storyboard-group-drop-source-audit.md) 和 [创建源码](./canvas-storyboard-grid-create-source-audit.md)。当前无需登录注册/小号，整体复刻目标继续未完成。

## 分镜组设置、真实PNG与标题交互（2026-10-11）

定向检查分别保留：controls纯模型64项、UI/组视图3文件55项、stitch模型/runtime32项、图片metadata/shot-number18项、controls hook15项；实际NodeCanvas联合6项在23:25:15/14.36s通过，日志`canvas-storyboard-controls-integration-final.log`。Canvas/editor/图片服务联合142文件2103项23:31:31/49.29s通过，日志`canvas-storyboard-controls-scope-tests.log`；相关lint零警告、核心类型、生产构建11.15s通过，但这一构建早于最终标题capture修复。各集合交叉，不相加报告全工程数量。

第一次完整检查在正在并行编辑的影游FilmGraph语法未完成时停于Prettier，原文保留`canvas-storyboard-controls-initial-check.log`。第二次format/lint/typecheck通过，测试265文件中263通过、2失败，2751项中2748通过、3失败，并有一个practice-entry worker启动超时；23:35:22开始/322.73s，原文保留`canvas-storyboard-controls-concurrent-check.log`。当时同工作区观察到多份全量/Canvas检查同时运行；新影游共享touch断言随后修复，两个既有上传测试出现5s等待超时。未将资源并行认定为全部失败的确定根因，也未提高timeout/maxWorkers或删断言。原断言、标题Pointer与共享film控制联合3文件164项在23:43:39/6.78s通过，日志`canvas-storyboard-controls-pointer-final-regression.log`。

实际1280×720先在完整App `/canvas`验比例、清空/确认取消/逐层Escape、转换/撤销与2K/4K显示；后段通过直接挂生产NodeCanvas的本地QA外壳隔离并行App HMR。原生标题拖动40×53屏幕px保持相对孩子位置，真正mouse双击进入输入后Enter改名。初次native双击失败由article pointer capture重定向兼容click导致，修复Canvas专属clickCaptureSelector；不以synthetic dblclick通过替代最终native重验。

实际2K PNG 1,750,678B、2048×1152，flow显示622×350、根位置712/213，explicit/default/localMediaReady与原group、序号均存入生产canonical key。刷新真实img complete且natural2048×1152。随后重复2K与真正4K4096×2304在当前origin触发本机配额失败：明确提示、当前图保留、旧有效2K快照未被覆盖、一次undo恢复；不能称4K保存或远端上传成功。只重置本批独立QA项目以准备窄屏，不修改其他项目或清origin数据。

390×844工具条left8/right382/width374/client373/scroll661、document.scrollWidth390，键盘ArrowDown可打开拼接/自定义宫格，二级Escape回自定义trigger。首次二级菜单为x8..213/y254.5..491，覆盖主菜单x88.71..238.71/y254.5..487.5，已作为真实问题修复，最终窄屏复验与全检查结果在本节随后补录。桌面已保存原始JPEG `penstudio-storyboard-controls-desktop-proof.jpg`1280×720/78678B。

23:59:28菜单定位修复后3文件59项通过，新增真实390px rect/上下空间/左右源规则回归，owned lint/format通过。实际二级菜单y493.51–730.06、主菜单y254.44–487.51，左右不足改上下，不再遮住trigger。HMR保留旧菜单state时第二层Escape未关闭，不列通过；冻结后reload原生ArrowDown打开、第一次Escape回自定义、第二次Escape回宫格。右侧按钮可随着工具条scrollLeft280.5到达，实际清空确认Escape回清空、snapshot仍三张图/序号true；本次未把一次未触发的自动键盘Space调用作为编号成功证据，最终是原生点击开关。

两张原始JPEG回读目视通过：桌面1280×720/78678B、窄屏390×844/24468B，窄屏截图的工具条滚动使主菜单x8，有足够右侧空间，child按源右展开；上下fallback另有上述真实rect。临时26/27 tabs关闭、viewport reset，loopback截图服务exit130停止且5199无listener，用户tabs与开发Vite保留。

2026-10-12 00:00:46完整check：format、零警告lint/边界、核心typecheck通过；268文件/2786项中267文件/2785项通过，仅`NodeCanvas.node-drag.integration.test.jsx`的overlap项失败，outside仍(80,100)而预期(380,200)，111.43s。保留原断言，继续核对fixture就绪和手势/保存，不把这一轮称完整通过。日志在最终重验前归档为`canvas-storyboard-controls-drag-check.log`。

随后原拖动文件定向8项中1项失败但落在另一final pointerup attach用例；没有放宽原断言。诊断局部移除Testing Library asyncWrapper的额外0ms drain后5项稳定复现：header enabled、loading已消失，pointerdown成功capture，却在同一act flush被旧Touch owner passive cleanup→cancelPointer→Pointer.clearGesture释放，DOM和storage保持初始位置。证据`canvas-node-drag-readiness-fast-observer.log`；这是实际生命周期边界，不能仅把fixture多等一拍称产品修复。

生产useGraphTouch的媒体初始化与document/native owner、useGraphPointer的document/ready/readonly/touchMode owner reset改layout commit。相同压力诊断00:11:24八项通过；原fixture等待策略与所有强位置/parent/history/storage断言保留，只新增局部配置压力回归，临时instrument test随后清理。生命周期变更后原生desktop另验标题50×35屏幕px拖动，70%下world(140,160)→(211.429,210)，真正dblclick可编辑、Escape取消、一次undo回(140,160)；临时28标签关闭、viewport reset。

原首拖、Pointer、projection、Touch与shared editor 5文件206项在00:12:35/10.38s通过，新增压力测试局部asyncWrapper/ACT配置在finally恢复。没有修改旧pageCanvas等待、强坐标断言或timeout；原压力诊断失败和生产修复后的八项通过分别保存在`canvas-node-drag-readiness-fast-observer.log`与`canvas-node-drag-readiness-production-fixed.log`，临时测试已移除。

最终完整`npm run check` **exit0**：2026-10-12 00:16:42开始，**268文件/2796项全部通过**，测试209.61s；Prettier、零警告ESLint/架构边界、核心strict TypeScript通过，生产构建14.94s，日志`artifacts/canvas-storyboard-controls-final-check.log`。统计包含同工作区独立影游新增回归，不把它等同原站功能数量。保留中间失败原文；最后只补维护文档并单独检查格式，没有新生产改动。strict不覆盖全部JSX、CI未远端执行，本批没有发布现有线上地址，整体复刻继续未完成。

## 普通组、脚本关联入口与菜单手感（2026-10-12）

继续用户节点操作不够流畅自然的反馈。本批按实际source分开General、strict standalone与script-linked混合行，接源十色、普通三布局、全图片组转分镜、外部标题拖动/双击、组解散和ZIP。脚本v1/v2图片/视频确认独立，费用/生成服务缺失时禁用实际执行；不把所有组送普通batch。普通组context隐藏无效settings，孩子仍保留自己的设置。

选择动作读最新raw图并严格CAS后更新UI；复制先投影最后150ms提示词，再生成新IDs，副本、原件与历史均保留有效输入。解组精确清script link/边，保留row refs与孩子世界位置。下载进度/取消绑定documentKey/groupId，旧请求不能中止新任务。颜色/布局/转换/通用改名经自动保存持久化，不把这类计划全部称立即flush；已有新图与明确overflow提交才走立即flush。

最后减少已确认的冗余工作：Viewport只对当前显示General工具栏的组计算成员/视频/下载资格并按nodes/组ID缓存，隐藏组不随每次pan/drag重算；script确认hook空闲不读图；pure plan先比较引用，不为小修改JSON序列化无关媒体。42项pure回归含无关toJSON抛错用例，没有测大图fps或基准。UI4文件90项、selection/context44项、script model/hook与旧controller3文件29项分别通过，各集合有交叉不相加报告。

初次真实NodeCanvas context测试把普通孩子“节点设置”计入组菜单，纠正为actual context作用域。随后定向超时保留原位置、parent、history和storage强断言，没有放宽timeout/maxWorkers。第一次冻结完整check：01:43:30开始/525.40s，275文件中274通过、2928项中2927通过；仅既有`NodeGeneratorPersistence.test.jsx:120`立即卸载/参数恢复用例5000ms超时，format/lint/core TS通过，未进入build。原文`artifacts/canvas-general-controls-full-check-first-failure.log`。原断言与新组回归3文件10项01:53:52/10.07s通过；该定向命令另有一个拼错的storyboard文件过滤未匹配，未计入通过，日志`canvas-general-controls-post-check-targeted-tests.log`。独立审查该旧夹具1video/0group未发现确定保存错误，并行负载不能当已证明根因，不能声称“修复生成器保存”。

第二轮完整check为处理冗余group资格扫描主动取消exit130，保留`canvas-general-controls-check-before-performance-freeze.log`，不记完整通过。最终生产性能修复后原生成器持久化、General实际接线、组视图、旧storyboard实际接线和script hook联合5文件20项01:58:28/8.90s通过，日志`canvas-general-controls-performance-final-regression.log`；新增idle不读取文档的断言包含在全工程统计。

最终冻结后同一完整 `npm run check` **exit0**：01:59:27开始、**275测试文件/2929项全部通过**、测试104.90s、生产构建10.44s，日志`artifacts/canvas-general-controls-final-check.log`。Prettier、零警告ESLint/架构边界、核心strict TypeScript通过；统计包括独立影游新增回归，不等同原站功能数量。strict不覆盖全部JSX、CI未远端执行。随后仅补维护与研究文档并独立检查格式，未再改生产代码。

原生1280×720普通组选择红色#E74C3C得到真实rgba .1背景/.2边框；垂直排列保存group272×378、preferred b→a、孩子(36,66)/(36,222)，URL/prompt/settings保留并刷新恢复。真正doubleclick改“镜头组 · 自然交互”、Enter、一undo/redo；标题[257,247]→[327,257]拖动后screen壳(204,263)→(274,273)，孩子跟随、保存/刷新保留。颜色Escape回trigger/menu0；转standalone实际2×2/16:9/source fit，undo恢复。直接AX右键受节点覆盖未命中，读图后[220,388]可见壳空白打开实际copy/delete，未把第一次操作计通过。

390×844普通toolbar left8/right382/width374、document.scrollWidth390；色menu x12.5..264.5/y73..182、layout x24..144/y56..184，source蓝色设置/焦点恢复成功。Escape回layout、外部关闭Agent后菜单关闭且不抢回原trigger。截图先正常关闭默认Agent，不声称打开时画布全可见。合成script-linked v2显示锁16:9、无转换、重新生成→整组执行确认/费用与生成未接/开始disabled；Escape回原trigger，清空明确保留script linkage并取消，内容不删。

最后非视觉性能修改后完整App `/canvas?projectId=canvas-general-controls-interaction-proof` 原生复验：普通组垂直布局、选择孩子→General消失且inline保持、选回组恢复下载资格；v1实际两条rows/URL/UUID匹配显示视频入口，组重新生成打开“生成分镜图”/开始disabled，Escape回重新生成。点批量视频给明确未接提示且内容保留，仅验证入口/反馈，没有验收缺失的source配置浮窗。两图是真实公开素材，script linkage/rows是合成协议夹具，不代表原站账号状态。

实际回读截图`artifacts/penstudio-general-controls-desktop-proof.jpg`1280×720和`penstudio-general-controls-mobile-proof.jpg`390×844；截图先于最后非视觉性能收敛，最终完整App入口随后另复验。原始CUA JPEG经正常本地QA textarea/button写loopback5198，没有evaluate写DOM/React/storage。早期30tab失去归属后读文档/列表重新建33/34恢复；本批临时35/36/37等也已关闭，恢复viewport。5198专用截图服务exit130停止，用户Vite5173保留；关闭旧Canvas后仅重置独立QA样本，不覆盖用户项目或清origin。

完整规则/证据见 [组操作验收](./canvas-general-group-controls-functional-audit.md)、[普通源码](./canvas-ordinary-group-controls-source-audit.md)、[脚本源码](./canvas-script-group-toolbar-source-audit.md) 和 [接线审查](./canvas-ordinary-group-integration-audit.md)。Toolbox创建/更新editor/modal、v1 batchVideo模型/参数/逐镜时长/选图前端、ordinary resize/character与完整run/stop仍缺，不能说“只差服务器”。真实手机/UA/触摸/Safari/持续原生修饰键、大图基准、协作/权益/费用/生成/运营写服务继续另验。本批仅更新本机Canvas、没有自动发布现有线上版本；保留独立影游发布记录，当前无需登录/小号，整个全站复刻目标未完成。

## 普通组尺寸调整与捕获取消（2026-10-12）

继续用户节点交互不够流畅自然的反馈。本批补source普通组四边线/四角手柄，拆pure begin/project/finalize、controller与view。XYResizer floor、min120×80、父/子extent、左上反向补偿、tB12padding及direct普通parent pF20/56按独立源码证据维护。stored最终壳与onEnd measured候选保留源顺序；Root注入手工renderer canvasNodeSize，未声称RF ResizeObserver/collab事件完全一致。非零origin、自身expandParent与特殊直接parent重排明确拒绝，尚未接入。

瞬时preview仅交Viewport，canonical最终一次raw CAS/history/flush，合入最后150ms有效prompt；途中didResize、最后pointerup与pagehide capture先flush、旧document/selection/graph、modal、Escape/blur/hidden、第二指和capturelost分别回归。resize暂藏旧bounds加号及工具栏属于本机互斥。独立代码审查提出board重定向兼容click、标题input焦点、问号modal接管和旧加号四项，均补生产修正及真实NodeCanvas强断言。

专项六文件125项02:24:42/4.21s通过，日志 `artifacts/canvas-group-resize-final-joint-tests.log`：实际resize7、hook15、原拖动8、原普通组5、pure69、resizer20。模型与原parent-bounds两文件110项02:23:56/532ms通过，日志 `canvas-group-resize-model-tests.log`；这些集合有交叉，不相加报告。原位置、parent、history、storage和末次草稿断言保留，未提高timeout/maxWorkers或关闭规则。

第一次全check02:28:03/91.46s：279文件中278通过，3051项中3050通过；格式/lint/核心strict通过，build未进入。唯一失败为独立影游export旧断言，将`.pf-ending`容器textContent期望正文；当前player.ts已经分别渲染h2标题/p正文，夹具title为“结局”，实际“结局</script>不是代码”符合当前player与其测试契约。仅将export测试按标题和正文分别强断言，另保留script不存在、choice注入无img和无网络断言；未修改播放器行为。专项export/player两文件16项02:36:09/1.14s通过，日志 `canvas-group-resize-film-export-followup.log`；初次原文存 `canvas-group-resize-initial-check.log`。

最后同完整命令 `npm run check` **exit0**：02:37:29开始，**280文件/3058测试全部通过**，90.56s；格式、零警告ESLint/架构边界、核心strict TypeScript及生产构建10.33s通过，日志 `artifacts/canvas-group-resize-final-check.log`。数量包含同工作区并行独立影游新增文件与测试，不等同本批节点功能数量；strict不覆盖全部JSX，CI未远端执行。随后仅维护文档并独立检查格式，无新生产改动；本机Node25.2.1在现有engines范围内，.nvmrc仍24。

原生完整App1280×720，独立QA文档 `canvas-group-resize-interaction-proof`：group180,210/508×222，zoom.8。右下[600,415]→[664,455]后588×272，两孩子世界/屏幕位置保持。原捕获后双击[664,455]重现.cv-add-menu意外打开；修正guard实际board target后同动作无菜单。左上[195,239]→[275,299]在孩子extent与stop12padding作用后，group204,264/564×218，measured552×206，孩子12,12与248,12；A屏幕222.8,290.8保持。一次undo回180,210/588×272、redo回最终壳，等过autosave后正常QA读取与刷新均保留最终尺寸/两个prompt。redo后立即读旧存储未列成功证据。

390×844布局实际innerWidth/document.scrollWidth均390，zoom.65四角屏幕8×8、工具栏left8/right382/width374已验。首次设置viewport后创建新tab使宽度恢复1280，识别后重新在当前tab设置390，不把旧1280读数当窄屏通过。左上角在此样本位置被左工具条覆盖，原拖点未命中；右下及普通选择/关闭/缩放按钮后续native与DOM点击均未产生可核实状态变化，重建40→41仍同样，本批**原生窄屏resize未验收**，不认定确定产品或工具根因，也无mobileproof。实际DOM回归不冒充原生窄屏/真机/触摸/UA/Safari。

桌面原始JPEG `artifacts/penstudio-group-resize-desktop-proof.jpg`1280×720/65160B已view_image回读，四角、两张真实图与普通组操作可见。截图经正常QA textarea/按钮只写loopback专用服务；38/39/40/41临时页全部关闭，viewport reset、visibility恢复false，5198服务exit130且无listener，用户5173 Vite保留。未改用户项目或原站账号，未发布线上。

新v1 batchVideo源码审计纠正上一节推测：eM只有模型/共享参数/全部ready镜头/费用及提交空视频组，逐镜时长/选图属于另一个v2面板；源save helper实际不rollback，关闭不取消建图。本批仅调研、未接配置浮窗。功能与本机适配见 [尺寸验收](./canvas-group-resize-functional-audit.md)、[尺寸源码](./canvas-group-resize-source-audit.md) 与 [v1配置审计](./canvas-batch-video-configuration-source-audit.md)。Toolbox、character工具栏、特殊group、完整run/stop、真机/大图/协作/权益/费用/生成/运营服务继续未完成，无需登录/小号，整个复刻目标保持未完成。

## v1分镜图片组批量视频配置与请求交接（2026-10-12）

继续用户的节点流畅性反馈，接入source eM组下非modal配置及空视频建图。纯config/graph/viewport、controller/view与services只读契约分离；19模型support由已有config-182的JSON字符串linkUrl解析提取，与source逐项一致，没有继续全量采集。v1只有模型/共享普通参数/batch高级参数/全部ready镜头/费用与提交，v2选镜、逐镜时长和prompt不混用。

本批9文件220项联合回归03:13:08 / 5.91s通过，日志 `artifacts/canvas-batch-video-final-joint-tests.log`：config67/graph72/UI19/settings12/viewport5/controller28/actual NodeCanvas5/旧group-controls5/旧resize7；不与交叉集合相加。source zero-capacity键模式、typed settings、主URL[0]、真实引用与prompt、60天/自动审核gate、空节点字段/尺寸/边均有纯模型强断言。

首轮实际接线03:07:28测试2失败：新增fixture误期望schema中文名，而实际support alias显示Kling O3；其次新增节点数漏计video group。按真实代表契约更正alias与7节点，保留创建节点/边、原图、历史、刷新和无任务等断言，日志 `canvas-batch-video-integration-initial.log`。allSettled修复后03:07:55旧同步retry断言在微任务前执行，改等待实际reload，日志 `canvas-batch-video-integration-followup.log`。没有取消测试、放宽timeout/maxWorkers或关闭lint规则。

独立审查发现并修复：Quota后原图清空/schema丢失仍应允许只保存重试；重复同组open不重建表单或污染原视口；两个reload再次失败需消费rejection；目录错误保留data也要取消旧审核；首图content尺寸晚到只refill缺ratio；成功100ms fit不得夺走新selection/pointer手势。原生source fit准确padding .15/400ms。Root controller与actual NodeCanvas两文件33项03:10:27 / 2.51s通过，日志 `canvas-batch-video-controller-final.log`；初期controller/viewport两文件27项03:04:59 / 555ms通过，日志 `canvas-batch-video-controller-tests.log`。

最后 `npm run check` **exit0**：**286文件/3261项全部通过**，03:18:26开始/85.64s；格式、零警告ESLint/架构边界、核心strict TypeScript与生产构建10.07s通过，日志 `artifacts/canvas-batch-video-final-check.log`。随后仅维护文档并单独格式检查，无新生产代码；Node25.2.1符合engines，.nvmrc仍24。统计包含独立影游扩展，不等同原站功能数量；核心strict不覆盖全部JSX，CI未远端执行。专用公共JSON登记prebuilt清单但未运行vercel:prepare或部署，不冒充打包/上线验证。

浏览器本批仅创建42独立QA页，1280×720显示正常且console无error。普通React计数按钮通过AX click、semantic locator click、visibility=true后的坐标click均无变化，计数仍0/焦点AXWebArea；selected tab确为42，已先读取troubleshooting。未用另一个控制技术、evaluate或QA隐藏动作绕过输入。故本批桌面/窄屏配置操作、创建与回焦点均**未完成原生验收**，无新版截图；不能把实际NodeCanvas的JSDOM回归当native通过。上一批resize的390px实操缺口继续保留。

42页已关闭、visibility恢复false，5198独立截图服务Ctrl+C退出130/lsof无listener；用户Vite5173/pid98953保留。没有覆盖用户项目、清origin、读取原站账号、调用费用/审核/生成服务或发布线上。服务缺失显示费用“-”/真实审核阻断，动作明确创建空视频而非生成；目录缩略图/VIP视觉、会员优惠重算、服务器8秒保存/协作、v2/完整toolbar、物理手机/Safari与大图仍缺。

当前规则与具体适配见 [配置验收](./canvas-batch-video-functional-audit.md)、[配置纯规则](./canvas-batch-video-config-model-audit.md)、[建图source](./canvas-batch-video-graph-source-audit.md)。无需登录/注册/小号，独立影游版本和发布记录保留，整体复刻目标未完成。

## ScriptV2选镜、逐镜时长与空视频组交接（2026-10-12）

沿用户节点交互反馈继续接入独立v2配置；当前实际入口是全屏脚本合成提示词阶段，不要求图片组，不套v1浮条。全局video34项从已有config-182提取，逐项相等核对；v1仍用19项，未继续采集内容。纯配置/引用建图、controller与view分离，选镜/时长/settings只在窗口暂存，原rows/shotNumber与临时显示编号分开。真实审核source可注入，默认缺失时准确阻断；提交只建空视频与引用，未执行生成。

联合11文件367项 **03:48:50 / 5.90s** 通过，日志 `artifacts/canvas-v2-video-final-joint-tests.log`：v1 config67/graph73/UI19/controller28/实际App5；v2 config66/graph56/UI17/controller25/实际App6；旧脚本5。不与其它交叉集合叠加。Root最后两文件31项 **03:47:57 / 2.55s** 通过，日志 `artifacts/canvas-v2-video-root-final-tests.log`；覆盖实际入口、无图片组、嵌套菜单/Escape/回焦点、原镜号、选镜/临时时长、一次undo/redo/卸载恢复、审核缺失与Quota仅保存重试。

初轮实际接线03:39:42的5失败是fixture误写stage accessible name空格；修正实际“3合成提示词2/2”后剩1失败为旧refImages断言。按源imageList/imageListOrder修正，保留图/边/历史/存储强断言；初始/后续日志保留。独立交叉审查另外修复pure配置错误重试入口、显示镜号误改脚本、mixed最小参考数逐镜回退三项；未删除测试、提高timeout/maxWorkers或关闭规则。

完整 `npm run check` exit0：291文件/3432测试全部通过，03:56:55开始/86.65s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建10.16s通过，日志 `artifacts/canvas-v2-video-final-check.log`。本机Node25.2.1符合engines，.nvmrc仍24；此前286/3261属于v1历史快照。统计包含独立影游扩展，核心strict不覆盖全部JSX，CI未远端执行。随后仅维护文档并独立检查格式，无新生产代码。公共video目录已登记prebuilt清单，但未运行vercel:prepare或部署；仅本机更新，不覆盖独立影游冻结和生产记录。

新43独立React计数页AX click后仍计数0/focus AXWebArea，复现42页输入通道阻断，未据此改产品或绕其他控制技术。43已关闭，用户5173 Vite保留；本批原生桌面/窄屏窗口、创建、时长与回焦点 **未验收，无新版截图**，JSDOM组件回归不当native通过。完整源脚本/工具箱/角色浮动toolbar、run/stop、审核/生成/协作/写服务、手机/Safari和大图性能仍缺。源码、适配与服务契约见 [v2验收](./canvas-v2-video-functional-audit.md) 和三个source审计；无需登录、注册或小号，整个复刻目标保持未完成。

## ScriptV2节点快捷操作（2026-10-12）

沿用户“节点交互不自然”的要求，调研source si/sT四动作、ea显隐、sx/sv禁用原因、eO缩放间距和tU/compact confirm；图片r3/sC也识别为独立renderer/建图，当前只接旧本机adapter，不扩大为完整一致。新pure模型54项、view9项、hook21项、实际App11项；production复用原table/prompt/video/history/graph/autosave及dialog-stack，无登录或真实账号/消费写入。

本批正式验证统一使用官方bundled Node24.19.0，遵循.nvmrc。联合11文件270项04:26:12/4.83s通过，日志 `artifacts/canvas-script-node-toolbar-final-joint-tests.log`，含既有提示词、媒体历史、脚本和v2规则。直接配置/两层Escape/回原按钮、raw镜号10/30、一次undo/redo、CSV/BOM/全部rows、stale与失败重试、pointer不拖动、doubleClick不展开、Space default未拦及rich prompt末次输入关闭后建组均有强断言。JSDOM键盘不会原生触发click，测试明确验证默认行为未prevent并另验click，不当原生键盘证明。

初次实际App7项04:17:00/2.20s中2失败（`artifacts/canvas-script-node-toolbar-integration-initial.log`）：产品pending禁用trigger使dialog捕获body为opener已修复，保active按钮加同步锁；另一项将source100ms fit误当即时隐藏，改实际waitFor保原建图/选择断言。21hook+7App在04:19:05/2.38s的28项通过（controller-followup），双击/Space新增后04:24:02/2.50s30项通过（input-followup）。重复请求加强为同一render旧callback在同一act连续调用，验证同步锁。rich prompt新增首次默认model需审核，缺服务正确阻断；测试在真实UI选择Vidu Q4 Preview再提交，未削审核门控。独立只读复核指出两处portal事件回归并修复，未发现P1写入/取消问题；复核本身未跑测试。

首次完整check04:28:20/78.03s，295文件/3527项中旧CanvasNode下载测试1失败，其余294文件3526项通过；该测试未传新source toolbar入口。迁移到CanvasScriptNode专属portal，保CSV/BOM/资产段、stale门槛和busy阻断，按source fullbusy隐藏而终态/recompute保入口，不删除回归、不恢复产品重复bar。跟进2文件13项04:30:00/2.26s通过，`artifacts/canvas-script-node-toolbar-legacy-followup.log`；初次check存为 `artifacts/canvas-script-node-toolbar-initial-check.log`，不称当前check通过。

最终官方bundled Node24.19.0完整 `npm run check` exit0：295文件/3527测试全部通过，04:31:20开始/75.58s；格式、零警告lint/架构边界、核心strict TypeScript及生产构建9.74s通过，日志 `artifacts/canvas-script-node-toolbar-final-check.log`。Node子进程_channel弃用提示没有转作产品错误或ESLint警告，代码检查零警告。统计含独立影游扩展、strict不覆盖全JSX，CI未远端执行。随后仅维护文档并定向格式检查，无新生产改动。该结果为当前本机快照，不替代291/3432的历史v2配置或独立280/3058影游冻结发布证据。

44独立React计数页AX click后仍计数0/焦点AXWebArea，已关闭；本批native桌面/窄屏、Space及新版视觉未验收，无新版截图，未绕其他浏览器技术。用户Vite pid98953/5173保留。本机四动作接线不代表r3/sC、显式reference/mark/focus target、源Confirm/卡片renderer、toolbox/character/完整run-stop、真机/Safari/大图或真实审核/生成/协作/运营服务已完。具体范围见 [快捷操作验收](./canvas-script-node-toolbar-functional-audit.md) 和 [源码](./canvas-script-node-toolbar-source-audit.md)。未发布或打包部署、不替代独立影游冻结与生产记录，整个复刻目标继续未完成。

## ScriptV2图片配置与节点交接（2026-10-12）

从四动作继续优化节点常用操作：r3独立image表单替旧adapter，sourceimage20而非全部schema/专用子集，raw index/typed原key、最新prompt复核、sC vertical普通壳/refs/原镜号、default placement避重叠、link-only一次CAS/history。成功保父编辑器/原选择/视口；Quota锁表单仅保存重试，关闭/文档/ready/readonly/选择/overlay/pagehide/卸载隔离旧callback。源码先关闭/服务器等待与本机事务明确区分，不执行真实生图。

固定Node24.19.0，配置77、graph78和view18专项通过；控制层+迁移入口三文件43项04:51:23/2.84s、实际App七项04:53:50/2.41s通过。联合12文件302项04:54:25/5.84s通过，日志 `artifacts/canvas-v2-image-final-joint-tests.log`，包括共享video/旧四动作/提示词回归，不累计交叉集合。该联合后补schema aria展示名并执行下方首轮完整check；当时待执行状态不代表最新工程结果。

初次controller三文件43项2失败：imageList错当URLstring、harness每getDocument新建nodesarray被正确CAS拒绝，稳定published图与结构化refs修正保强断言。实际App七项初次3失败：redo实际title、图片prompt实际aria和异步parentclose时序不匹配，迁移真实UI/waitFor保建图/焦点/历史断言。初始日志 `canvas-v2-image-controller-initial-tests.log` / `canvas-v2-image-integration-initial.log` 保留。peer只读发现 freshContext.rows 未进state.rows已修，同步publish新prompt/清空prompt有专门回归；不可用reconcile暗改提交model。

45独立计数页native AX click仍0/focus AXWebArea，已关闭。未绕DOM或storage输入冒充原生，用户5173 Vite保留；本批desktop/窄屏窗口、视觉、手感未验收，无新版截图。Nebula object-settings保default安全提示、菜单portal和本机保存/取消均是adapter，disabled专属Tooltip/退出渐隐、完整renderer/target/toolbox/run-stop、真实服务、真机/Safari及大图继续缺。详情见 [图片交接验收](./canvas-v2-image-functional-audit.md)，无需登录/账号资源，未部署或远端CI，不替代独立影游冻结发布，整体目标保持未完成。

补schema aria展示名后的首轮完整Node24.19.0 check exit0：300文件/3734测试全部通过，04:58:54/79.45s，格式/零警告lint/架构边界/核心strict与构建10.06s通过。结果保存为 `artifacts/canvas-v2-image-before-row-key-check.log`。之后peer从r3 JSX runtime第三参确认source key hiddenUuid??index；本机index key会使重排后焦点落到另一镜头，已按源改稳定row DOM身份而不改raw索引选择规则。补视图重排焦点回归后2文件26项05:00:50/2.38s通过，日志 `artifacts/canvas-v2-image-row-key-tests.log`；最新完整检查另行执行，不用3734旧快照代表key修改后的源码。

最终正式Node24.19.0完整 `npm run check` exit0：300文件/3735测试全部通过，05:02:02开始/77.32s，格式、零警告lint/架构边界、核心strict TypeScript与生产构建9.42s通过，日志 `artifacts/canvas-v2-image-final-check.log`。包含row UUID key重排焦点新回归及同工作区独立影游扩展；strict不覆盖全部JSX，CI未远端执行。随后仅维护AGENTS、agent、README、coverage和分域证据并定向检查格式，没有新生产代码或自动部署。本批原生desktop/窄屏手感仍未完成验收，整个复刻目标未完成；300/3734为key修改前的独立成功快照，不能替代最终统计。

## ScriptV2卡片状态与操作入口（2026-10-12）

继续用户“节点交互不自然”：源码sg/sh/sf恢复横向静态三阶段、唯一打开按钮及同owner当前步骤；sT五种形态、recompute/full task和fresh raw请求门控独立于table投影。卡面归共享pointer，interactive/portal/Space隔离，source failed/task文案与TaskID本机复制接线；manual失败保原baseline/hiddenUuid，可从编辑器重试。源/本机适配/服务边界见 [卡片验收](./canvas-script-card-functional-audit.md)、[视图源码](./canvas-script-compact-source-audit.md)、[纯模型](./canvas-script-compact-model-source-audit.md) 和 [显式target](./canvas-script-toolbar-target-source-audit.md)。

固定官方bundled Node24.19.0。pure/card/task113+既有workflow11的2文件124项05:20:11/480ms通过；compact14+TaskStatus19共2文件33项05:24:49/966ms通过；新actual NodeCanvas7项05:17:26/2.39s和新host12项05:24:47/922ms通过。正式联合11文件208项05:26:12/9.84s全过，日志 `artifacts/canvas-script-card-final-joint-tests.log`，原pointer/history/草稿/storage实际运行，DOMrect/capture/未运行autoPanRAF和键盘默认click仍是jsdom范围。复制保活动按钮/aria-busy，本机同步锁拒重复，doc/node/kind/taskId清旧锁，旧finally不清新请求；不修改共享复制hook。

初次五文件32项05:17:43/6.01s中1失败，readonly迁移后旧prompt被table权限effect退休；测试确认退休并从已有fullscreen打开新的readonly review，保禁止写/版本定位断言，跟进7项05:19:08/1.07s通过。新host初次9项05:20:25/1.01s中1失败，证实外部任务与请求同commit可读旧投影；改用fresh raw owner门控。Space补两项后11项05:21:30/996ms通过，再补保存失败manual12项最终通过。初始和跟进日志均保留。独立只读复核发现manual/notice按钮Space被画布preventDefault+arm pan，已修只stop冒泡；其余owner/draft/portal未发现确定P1/P2，复核本身未跑测试。

首次完整check05:26:52/80.20s，305文件3900项中旧视频App六项失败，其他304文件3894项通过；格式/零警告lint/边界/核心strict通过，未执行构建，不记完整成功。日志 `artifacts/canvas-script-card-initial-check.log`。旧测试点已移除compact阶段按钮，迁移为唯一打开按钮和全屏阶段导航，保建图、审核阻断、Quota仅保存、目录重试、焦点及undo原强断言；独立六项05:27:42/2.82s通过，日志 `artifacts/canvas-script-card-video-entry-followup-tests.log`。

最终正式Node24.19.0完整 `npm run check` exit0：**305文件/3900测试全部通过**，05:28:30开始/79.43s，格式、零警告lint/架构边界、核心strict TypeScript及生产构建9.72s通过，日志 `artifacts/canvas-script-card-final-check.log`。Node子进程_channel弃用提示不当产品错误或lint警告。随后仅维护AGENTS、agent、README、coverage与审计并定向格式检查，没有新生产改动。统计含独立影游扩展，strict不覆盖全部JSX、CI未远端执行，300/3735保上批图片配置历史，不替代当前快照。

新46计数页原生AX click后仍0、焦点AXWebArea，已关闭；用户Vite pid98953/5173保留，未换控制技术伪造操作。本批原生桌面/窄屏像素、手感、Space及真机/Safari未验收，无新版截图。empty两种preset/完整hint、yielded/task bus、显式三模式/工具箱/角色操作、真实生成/费用/审核/协作/运营服务与大图仍缺。无需登录注册/小号，本机源码未部署，不替代影游独立冻结生产记录，整体复刻目标未完成。

## ScriptV2空态提示、预设建图与保存重试（2026-10-12）

继续节点交互优化：source三个准确入口/ListDetail/原SVG、readonly隐藏、pending形态；tL文本原文与t_两角色原图/浅data且params整体replace，store raw/50px/向下30iter避碰和新root前置。统一小型useContent目录，各动作独立资格/加载错误/reload，手写不依赖目录。新pure/controller/view分离，lock早于外部cancel callback，一次rawCAS/history合草稿并同步flush，Quota保原图/ID只保存重试，不伪生成。source与边界见 [空态入口验收](./canvas-script-presets-functional-audit.md)、[纯模型source](./canvas-script-preset-source-audit.md)、[view source](./canvas-script-empty-source-audit.md) 与 [后续专用generator](./canvas-script-preset-integration-source-audit.md)。

正式bundled Node24.19.0：pure52项05:40:09/445ms、view15项05:37:09/583ms和真实NodeCanvas7项05:43:08/815ms通过。Root初始controller18+host12共2文件30项05:40:26/1.11s通过；peer只读发现旧render动作可能对新同ID文档写入，补preset doc/script捕获守卫与manual owner/fresh raw/await后复核。controller新增1项后2文件31项05:41:22/1.07s通过，随后host加旧manual回调一项。完整视图保真实source renderer，仅取动作API作为测试观察缝，未mock实际table写入。初始/跟进日志保留，不用初次通过代表最终改动；peer静态复验未发现新确定阻断，不增加测试计数。

最终专项7文件118项05:44:13/4.19s全过，日志 `artifacts/canvas-script-presets-final-joint-tests.log`：pure52/view15/controller19/host13/actualpreset7/actualcompact7/legacy-script5，集合不额外累计。实际图/历史/草稿/存储未mock，只有只读内容注入与jsdom几何/capture/defaultclick适配。App初次7项中5项仅旧pending文案断言失配，迁移到最终“脚本生成暂未接入，可编辑和保存参考节点”，保原图/坐标/Quota强断言，7项最终全过；不把初次失败记成功。

最终正式Node24.19.0完整 `npm run check` exit0：**309文件/3994测试全部通过**，05:45:38开始/81.09s（tests53.05s）；格式、零警告lint/架构边界、核心strict与生产构建9.85s通过，日志 `artifacts/canvas-script-presets-final-check.log`。随后仅维护AGENTS/agent/README/coverage与审计，定向格式检查，没有新生产源码改动。strict不覆盖全部JSX、CI未远端执行，统计含独立影游扩展；之前305/3900为另一个成功快照。

尝试创建临时data输入检查页，被浏览器安全策略拒绝（仅允许HTTP/HTTPS），没有可验收检查页/新native计数，不换控制技术绕过限制。上一批46页不响应是历史证据，本批没有新增桌面/窄屏像素、手感、Space或截图通过。用户Vite pid98953/5173确认保留；无需登录注册/小号，没有调用原站写服务。专用SCRIPT_V2 GeneratorFactory/3项scriptText目录/TEXT content同步/script-generate-v2参数及专用UI/submit尚未接线，不能用generic text冒充或说只差服务器；显式target/工具箱/角色操作、真实生成/费用/审核/协作、task总线、运营写服务、真机/Safari与大图继续缺失。本机未部署，不替代影游独立冻结生产记录，整体复刻目标未完成。

## ScriptV2专用生成器、双草稿与保存恢复（2026-10-12）

补专用ScriptV2 input/model/view/controller，三项scriptText原metadata、完整TEXT/typed媒体/source rules/task scene/source_images/ref_id、prompt Magic/CameraPreset清理和typedorder-only、完整组leaf删除。Frame16world/inversezoom与sourceexpanded字段，不改raw节点bounds；onceCAS/history/末次draft/flush、稳定document save recovery接线。源码与明确适配见 [生成器验收](./canvas-script-generator-functional-audit.md)、[pure审计](./canvas-script-generator-model-source-audit.md)、[view](./canvas-script-generator-view-source-audit.md) 与 [实际接线](./canvas-script-generator-integration-source-audit.md)。

Root初始controller15项05:57:51/753ms中2失败：shared typedList名称需机械适配、source_images实际ref_id而非id；修正后15项05:58:28/597ms过。加disabled raw gate与source prompt cleanup共17项；special prompt清理同时进最后150ms快照，不以raw prompt patch重写canonical。pure最终2files105项06:13:32/533ms（model73/input32）和view20项06:09:04/941ms通过，公开JSON静态equality确认，目录最终1172bytes。

actual suite初始readonly夹具无效和Frame真实BODY焦点缺陷分开修，menu→Frame两层Escape保强断言。Frame最小opener fallback及strictfalse beforeTransition回归5项；共用dialog-stack不另滚动锁。源16world纠正旧16screen wrapper，zoom.8 top370→366，保inverse1.25/raw350/view/history。actual12项06:14:48/4.50s最终通过，新增两项先记录同步Quota失败，再真等650ms确认自动失败继续发生，然后selection隐藏/preview暂停→Header retry当前图/原IDs/一次undo-redo；不把早期<600ms测试当自动保存证据。旧preset7项只补真实support/改service-only文案，所有图/URL/坐标/存储/Quota断言保留。

peer只读发现draft同node register覆盖和inline卸载/suspended丢retry两项实际风险；分别用可选channel和document-levelsaveError/retry修复。最后draft/autosave/controller3文件39项06:15:52/809ms通过；transition/actual/既有inline4文件24项06:16:49/4.83s通过。最终联合12文件208项06:17:22/6.57s通过，日志 `artifacts/canvas-script-generator-final-joint-tests.log`，集合重叠不累计。图/history/draft/storage实际运行，只有只读内容注入与jsdom几何/capture/defaultclick适配。

最终正式bundled Node24.19.0完整 `npm run check` exit0：**314文件/4155测试全部通过**，06:17:39/85.20s（tests57.84s）；格式、零警告lint/架构边界、核心strict及生产构建9.93s通过，日志 `artifacts/canvas-script-generator-final-check.log`。构建CanvasPage923.04kB/gzip304.97kB超过900kB出现实际分包提示，未提高门槛或称零构建警告；后续须合理按需分包。随后仅文档/格式检查，无新生产修改。strict不覆盖全部JSX、CI未远端执行、统计含独立影游扩展，309/3994是前批独立成功快照。

本批无新增原生桌面/窄屏像素/手感/Space、真机/Safari、大图或截图通过，Vite5173保留；上批data协议拒绝只作历史。本机未部署，无登录注册/小号/原站写服务。Root新增参考三动作未接，真实生成/费用/翻译/语音/协作/运营写服务、完整explicit target/hover/compliance/audio/Tooltip等继续缺失，不能说只差服务器。既有专用菜单是view协议，不宣称Root能上传或选新参考，整体复刻目标未完成。

## ScriptV2参考交互、异步owner与真实按需入口（2026-10-12）

2026-10-12 Node24.19.0最终 `npm run check` exit0：**324文件/4320测试全部通过**，tests16:07:31/115.51s，格式、零警告lint/架构边界、核心strict与生产构建20.28s通过，日志 `artifacts/canvas-script-reference-final-check.log`。CanvasPage最终873.73kB/gzip288.54kB，低于既有900kB阈值，未抬阈值或加manualChunks。actualApp与旧compat联合30项16:03:31/5.95s通过。首次完整324/4318只有newApp Quota fixture DOM groups前置/raw order误判1失败、4317通过，build未运行；修fixture增强actual共享picker/读取切选/焦点等后fullcheck通过，保所有中间日志。真实lazy旧同步view fixture12失败已改await actualmount，全部图/history/storage强断言保留。

原生实际独立画布通过菜单创建ScriptV2和角色preset，进入参考mode、取消角色1、再选恢复、Escape、mode内fit97%、刷新后角色2→角色1与完整剧情恢复。1280/390截图和DOM数据在 `artifacts/canvas-script-reference-browser-proof.json` / `canvas-script-reference-desktop-proof.png` / `canvas-script-reference-narrow-proof.png`，窄屏scrollWidth390、bar17–373、原selected仅script。最初5173监听缺失→Node24启动后HTTP恢复；policy拒绝data错误页未绕过。原生native高频框选/file chooser完整上传、touch/Safari和加载故障未验，与DOM/controller tests分开。

source、适配、ownership及真实接线详见 [参考验收](./canvas-script-reference-functional-audit.md)。finalcheck后只补文档与格式；无部署/账号写入，strict不覆盖全部JSX，CI未远端执行、统计含影游扩展。当前本机server pid31806继续可用，线上仍独立冻结film产物；整体复刻未完成。

## 节点参考手势与多文件添加（2026-10-12）

生产修正reference release当前view/末位、实际shell尺寸、source屏幕box、center返回保zoom/400ms；PointerEvent owner互斥、childlostcapture/blur/hidden取消、mask尾click与freshpress/detail0键盘协议。普通upload首await前固定live FileList，保最新graph、失败继续、每批一次history。source与适配、失败及强断言范围见 [手势验收](./canvas-reference-gesture-functional-audit.md) 和 [所有权复核](./canvas-reference-gesture-owner-review.md)。

新增hook七项修前16:22:09/658ms七项全失败，日志canvas-reference-gesture-owner-source-baseline；实际App mask初次三失败、measured与双pointer两个方向的失败日志均保留。source Screen class迁移只替换旧selector、consumed合同只改Boolean，图/history/捕获强断言保留。最终Node24专项七文件195项16:37:25/4.56s全过，日志 `artifacts/canvas-reference-gesture-owner-final-verified.log`；普通FileList新增3项/旧5项两文件8项16:46:09/767ms通过，日志 `artifacts/canvas-ordinary-upload-file-list-tests.log`。scope重叠不重复累计。

正式bundled Node24.19.0完整 `npm run check` exit0：**328文件/4377测试全部通过**，tests16:53:44/104.32s，格式、零警告ESLint/架构边界、核心strict和生产构建11.11s通过，日志 `artifacts/canvas-gesture-refinement-final-check.log`。测试依赖保DEP0129提示，strict不覆盖全部JSX、CI未远端执行、统计含独立影游扩展。最终CanvasPage875309bytes/gzip288970/SHA3416669de467a3deb799a1f95e3e8794d8e99291ef354dd7d8414a80fe20d9f1，900000门槛未变；实际产物见 `artifacts/canvas-gesture-refinement-build-proof.json`，上一批873731/288543为另一个产物。完整check后仅维护文档/证据并定向格式检查，无新生产修改。

原生Tab2真实多图box一次、返回节点修前97%→174%/修后97%→97%、普通chooser两PNG修前新增1/修后新增2并整批undo/redo通过。新两图成组原生标题drag60/40屏幕px，两孩子同移、旧组外图不动；一次undo/redo与刷新恢复同ID/位置。390×844参考菜单/mode/Escape、documentWidth390/顶条17–373通过，viewport已reset。图和JSON存于canvas-gesture-refinement-browser-proof、canvas-native-group-gesture-proof、canvas-native-reference-return-proof和canvas-reference-gesture-narrow-proof；没有注入storage或用合成事件替代这些原生操作。开发16:24:43 HMR hook-order/queue两条历史error保留，最终08:57:39Z冷加载后重新打开generator，08:59:27Z查询后无新增warn/error；不称整个历史console空。原生持续Space/Alt、真实pen/touch/Safari及大图未验。

另已完成focus/mark静态调研与focus纯模型39项16:41:24/633ms，日志 `artifacts/canvas-focus-region-model-tests.log`；仅预备模型，UI/controller/mark识别未接，不称功能完成。所有agent冻结后Root启动上述fullcheck，只读复验未发现需解冻修改的回归。本机未部署、Vite5173保留；无需登录/小号或原站写入，影游独立冻结生产不被当前检查替代，全站复刻目标未完成。

## IMAGE聚焦交互、所有权与真实按需确认工具（2026-10-12）

源码门控/camera_focus验证、纯region/图计划、controller、actual App和原生证据见 [聚焦验收](./canvas-focus-functional-audit.md)。入口三模型由实际schema；原子确认/删除/降级保存末次草稿、source原图与唯一边，一次history；Quota仅保存重试，手动退出保已接受图。first Escape清pending、second退出；文档/mode owner、source identity和普通pointer/reference/连接互斥，blur/hidden只cancel手势。资源fullFactory、Mark/capture与真实服务差距保持。

独立owner首轮13fail/15pass发现false fresh访问、旧mode pointer和降级覆盖prompt三真实问题并修；浮点/锁模板不合法fixture与生产错误分别记录。minimum closure13项+controller34+旧pure39联合86项17:54:31/717ms；原39未弱化。transform transition4项修前失败后通过；三view/actualApp最终46项18:23:40/4.29s，真实lazyEntry11项18:22:30/1.14s，集合不累加。335/4465完整17:43:55/153.13s保存before-minimum；336/4483完整17:56:55/125.68s保存before-narrow，两者都是后续修正前独立成功快照。narrow build900.02kB实际提示保留，不称零warn。

最终Node24.19.0完整npm run check exit0：**337文件/4500测试全过**，tests18:24:50/261.59s，格式、零警告lint/架构边界、核心strict及生产构建15.34s通过，日志artifacts/canvas-focus-final-check.log。DEP0129依赖提示保留；strict不覆盖全部JSX、CI未远端执行、统计含独立影游扩展。真正FocusConfirmEntry在mode时dynamic import预加载，失败保region并允许retry/cancel；Confirm独立4671bytes/gzip2136。CanvasPage898775/gzip296239/SHA3c7514ea315702a7fda5de59438942397b164742f183e308da3fff6df2feb80b，CSS191954/gzip32868，900000阈值未提高/manualChunks未扩大；构建与冻结source SHA见artifacts/canvas-focus-build-proof.json。最终全检后只维护文档/证据并定向格式，不再修改生产。

原生Tab2本机公开PNG chooser、模型切换、348×228源区域draw/1:1、空prompt服务阻断、刷新/crop ready/GUI导出通过；移动40/30px后3:2确认、一次undo/redo、delete/undo和降级/undo完整验证。两次实际GUI导出保1:1/最终3:2、两节点/唯一边及原图URL一致；source不借graph尺寸。390 confirmation原left=-79.515625修至8px，ModeBar原196px文本挤压修至320宽/title副标题单行；320实际296宽/title单行/副标题两行、confirmation304宽/全按钮可达，原生16:9/Escape仍保3:2/唯一边。按需JS冻结后冷加载/编辑/drag/真实bar挂载通过；CSS在reload后3秒HMR，所列布局均最终CSS之后。AX/semantic两次无效，经measured native坐标恢复，未用其他控制技术或storage/DOM注入。10:23:10.469Z冷加载后最终查询无新增warn/error，不称全部历史日志空。viewport已reset，浏览器JSON/desktop/narrow screenshots在artifacts/canvas-focus-browser-proof.json与canvas-focus-native-*-proof.png。

无需登录/小号/原站写入；本机未部署，生产仍独立冻结影游产物。远端教程播放、全局publish adapter、完整资源下游、原生持续Space/Alt/高频pen/touch/手机UA/Safari/大图、真实费用/生成/上传/协作等未验，整体复刻目标未完成。

## 元素标记、模式接线与生成器边缘（2026-10-12）

IMAGE/VIDEO Mark frontend、自然尺寸reader/只读source契约、FIRST点位/ALL prompt菜单、generic Core metadata prune、末次draft投影、旧mode/StrictMode/异步cancel和一次图事务接线完成；默认识别source未连接，无假label/bbox/成功任务。已有confirmed点在新识别pending或metadata被清后仍可合法选/删。真正Mark工具与Script整卡dynamic import、22份CSS保旧DFS级联；普通/ScriptV2/加载错误态按实际board宽横向overflow适配，合法center保持原值。源码与本机差异、纯协议、回归和原生范围见 [本批验收](./canvas-mark-functional-audit.md)、[owner review](./canvas-mark-owner-review.md)、[prompt](./canvas-mark-prompt-source-audit.md)、[view](./canvas-mark-view-source-audit.md)、[Script lazy](./canvas-script-node-lazy-audit.md) 与 [board宽度](./canvas-inline-generator-board-placement-audit.md)。

保留失败：lazy旧fixture首轮9文件92项27失败；初改8文件79项1失败（pending restore不能等empty）；只加实际卡片/toolbar控件await、原断言保留，正确9文件92项19:43:26/13.16s全过。首次formal check只因useCanvasMarkMode格式终止，initial-format日志保留；格式修正后全量352文件4738项19:54:49/147.50s为12失败/4726通过，toolbar11+CanvasNode下载1皆旧同步查询。两处await后2文件13项19:57:48/3.95s全过。初Script CSS只eager一份丢旧级联，经真实static DFS补22份；最初905.55kB超900阈值、初Script分包CSS挪序都不是最终通过结果。HMR numeric/object定位接口阶段混用曾出现NaN left error，最终三caller联合冻结修复，历史日志保留。

专项：pure/source/controller/entry最终5文件136项19:16:06/1.06s；prompt8文件95项19:07:33/2.92s；views21加原actual14为35项19:04:33/5.36s；new actual atomic deletion/draft3后17项19:51:59/7.69s；Script lazy15项CSS修后19:39:19/1.68s；board宽8项20:02:15/651ms；最终13文件127项20:03:24/13.53s联合全过。日志各在artifacts，本批专项集合有重叠不累加。普通prompt CtrlZ只raw token，不造pruned metadata/badge；真实graphundo按独立事务验证。

最终官方Node24.19.0完整 `npm run check` exit0：**352文件/4745测试全过**，20:04:40/101.45s，格式/零警告lint/架构/核心strict/构建10.61s通过，日志 `artifacts/canvas-mark-final-check.log`。源码/配置/测试1087 SHA检查后无变，实际产物Canvas690228/gzip229314、Script220148/gzip72470、Mark23974/gzip9030，Script/Mark不在Canvas static closure；CSS192511/gzip32961仅删5条新规则后等于旧191954基线，22CSS源SHA一致，阈值900000未提高。完整证据 `artifacts/canvas-mark-build-proof.json`。DEP0129依赖提示保留，strict不覆盖全部JSX、CI未远端执行、统计含独立影游扩展。

原生tab2实际PNG、IMAGE默认未连接0点/0框、VIDEO receiver、Mark→Focus、frame逐层Escape、1280/390/320条与输入Escape、Script手写/两次undo、GUI导出已验。第一次Mark GUI export与原Focus graph严格相同；后续综合流程node data/edge仍相同，但position改变且未逐手势定位，不能把综合nodes整体称不变。后补独立Mark hand-pan前后真实GUI导出严格nodes/edges相等，仅view.y−50。888px panel修至207.998..867.998；Agent board568/panel20.001..548.001；390横向20.004..370.004，抓手向上后生成按钮完整在698.819..730.819，横向适配不包含竖向自动翻转。最终12:11:52.958Z冷加载后无新增error/warn，旧HMR错误不抹除；截图/详细measurement/导出比较见 `artifacts/canvas-mark-browser-proof.json`。首次在导出类型选择前waitdownload使CUA30s超时，恢复同tab选画布文件后真实下载，首次不当成功。

全检后只维护AGENTS/agent/README/Canvas/coverage/审计与原生证据，定向格式和sourceSHA复核单独记录。本机未部署、线上影游冻结记录独立；真实识别/生成/上传/费用/协作、capture/未核renderer、完整prompt badge undo、原生持续Space/Alt/touch/Safari/大图与综合坐标逐手势定位继续另验。无需登录/小号，整个目标未完成。

## 节点松手边界、实际拖动与抓取可达性（2026-10-12）

共享Pointer end对node增加已moving门控；普通/virtual未起拖的up不首次改变位置、复制、保存或记录history，真正drag仍最终up投影。source RF普通move-start与iF virtual down-start/copy的区别保留，本机4px/延后复制是适配。初复现2项1失败21:10:49/713ms、Root初3文件156项1失败21:22:28/1.31s保留；旧caller drag IDs fixture只补move并保全部强断言。正式联合8文件210项21:26:20/10.23s、独立paired14项21:26:41/507ms、新actual4项21:33:27/2.13s全过，专项重叠不累计。

首轮完整check exit0，360文件4803项21:36:08/127.50s、build11.30s，canvas-release-start-final-check.log。1100初始snapshot仅1099匹配，Studio CSS21:36:27改动在format后、build前，不能称完整冻结检查；不覆盖原日志。随后按当前1100源码重新冻结，最终官方Node24.19.0完整check exit0，**360文件/4803测试全过**，21:42:56/122.72s、build11.06s，format/零警告lint/架构/核心strict通过，canvas-release-start-current-check.log。1100SHA一致、DEP0129提示保留、strict非全部JSX、CI未远端执行。较前轮1087新增13：2Canvas新测试及11Studio文件；18既有Studio变更与独立影游扩展包含在统计，不将4803归为本批节点专项。

实际最终Canvas690228/gzip229310、Script220148/72475、Mark23974/9037；Script/Mark真实dynamic且不在Canvas static closure，Script无lazyCSS，22CSS源hash一致，5条新加载规则剥离后全文等191954旧baseline，Canvas CSS192511/32961的SHA与前轮相同，900000阈值未改。完整source/chunk proof在artifacts/canvas-release-start-build-proof.json。

后台新tab3原生1280×720、board890×670与Agent打开，每步GUI下载before/click/drag/undo/redo。click nodes/edges严格相同，拖动(60,40)screen/zoom对应(73.40633669450163,48.93755779633443)world，仅被拖node position改变，其他data/节点/edges及view相同；undo完整恢复、redo完整重放，单次历史按钮状态吻合，warn/error为空。浏览器proof与最终截图分别canvas-release-start-browser-proof.json和canvas-release-start-native-proof.png。没有操作用户tab2的3D编辑器，不把受控up-only合成事件当native；本批无新增窄屏/持续修饰键/touch/Safari/大图通过，也不确定前轮综合坐标差异根因。

两路capture source审计确认前图URL回调且t4未消费onCanvasCapture，没有区域截图或可见入口证据；更正Pointer source review §6历史“截图模式”推断，不新增dead UI。源码/失败/回归/native与明确边界见research/canvas-pointer-release-functional-audit.md。最终检查后只维护文档/原生证据，文档定向format与源码SHA复核另记。本机未发布，独立影游生产不变；无需登录/小号，真实服务和整体复刻目标仍未完成。

## Blender参考的Studio视口（2026-10-12）

用户授权改善3D渲染/操作，保留PenStudio布局。AgX/本地128px环境/阴影/64段圆柱；中键/Alt左键旋转、Shift中键/右键平移；240ms真实几何聚焦、XYZ六向/反向与橙色选择框。监视器HalfFloat+OutputPass同AgX、俯视计入半高度；修复NumLock-off聚焦误删、变换释放穿透选择和320px遮挡。

第一轮完整check360/4803、21:34:22/127.09s、build13.33s，通过但测试期间窄屏CSS变化，保留output/studio-blender-before-mobile-check.log。最终官方Node24.19.0完整npm run check exit0，**360文件/4803测试**，21:55:36/146.33s、build11.06s，格式/零警告lint/架构/核心strict通过，output/studio-blender-final-check.log。1096代码/config SHA前后一致，output/studio-blender-source-verification.json；统计含同期Canvas与独立影游。Node DEP0129提示保留，strict非全部JSX、CI未远端执行；检查后仅文档更新并定向format复验。Studio专项26文件118项、21:57:20/11.67s通过。

实际App圆柱1440×900/390×844/320×740：明暗/选中边/俯视图/方向按钮/3D重置可见；390/320 scrollWidth相等，320标题与右控件间7px。4556B合成GLB真实导入保留层级、Slide/Grow及QA_Arc/QA_Truck，机位预演无网格/选择边穿透，播放至0.40s暂停，新标签error/warn为空。截图output/playwright/studio-blender-{desktop,mobile,320,glb-camera}.jpg。属性层覆盖时一次方向等待失败，关闭层后前/后视图真实切换；初次HMR模块未落盘import失败及热更新Three多实例警告保留。受控OrbitControls事件与全部原生修饰鼠标/触摸区分。临时GLB标签关闭、viewport override重置，圆柱预览保留。

准确范围见research/studio-blender-viewport-audit.md。方向视图为透视；真正正交、完整建模/材质、AO/路径追踪、wrapper帧烘焙、视频导出、原业务服务、实体手机/Safari和超大模型长期性能仍缺。本机未部署、不覆盖影游生产，无需登录/小号，整体复刻未完成。

## VIDEO角色库、引用事务与portal捕获（2026-10-12–13）

真实rr入口／Public分页详情／三媒体URI、Seedance状态与可注入运营边界已接；default unavailable，匿名一次list code10001未授权，无正向样本／账号／原站写。纯容量／graph／source／controller／views分离，capture callback仍dormant不造截图入口。末次draft baseline碰撞、Magic孤立metadata、合规成功后Quota重复writer已修，next explicitPromptNodeIds／接受文本取消timer／canonical payload共同维护一次CAS／history与save-only retry。

初轮Node24.19.0全check370／4983，23:07:56／109.29s、build10.65s及1122SHA属before-click-isolation固定证据。Native先发现mask失选／inline卸载，click-only修复仍失败；真实logical CanvasViewport capture先清选择，3portal根加既有nopan与bubble隔离，不改sharedPointer。bubble专项先3fail／30pass→33pass；capture先3fail／33pass→36pass，23:35:33／1.50s，各项保原断言并有实际board press正对照。原生Space被全局pan截获，角色chip单独stopPropagation且保默认，实际App补完整keyboard；没有扩大sharedKeyboard规则。

最终collector30／真实hook23／真实App12联合3文件65项全过，2026-10-13 00:40:45／3.88s，canvas-role-library-review-app-keyboard-tests.log。旧collector／hook／App10仅历史console结果无raw log，作者审计明确区分；初期fixture9+4失败因lazy等待、正确inert背景与默认Seedance tab操作，未削弱强断言。Root真实draft／输入／GraphActions＋source5文件36项、纯模型新增68项亦保专项范围。

重新冻结1122源后正式npm run check exec33738 exit0，370文件／4991测试，00:42:01／110.51s、build11.11s，format／零警告lint／架构／核心strict通过，canvas-role-library-final-check.log。较历史360／4803新增10文件／188项，全部统计含同期Studio及独立影游，非全部JSX严格类型／CI未远端跑，DEP0129提示保留。最终source、chunk、CSS次序与900000阈值见canvas-role-library-final-build-proof.json；不改原public采集／生产影游冻结发布。

后台独立tab4，1280／390／320 mask点击保selected／inline／dialog，Space打开、Escape回chip／解除inert，12次Tab循环不出modal。GUI before／after整份文档deepEqual及SHA逐字相同，nodes／edges／view同，冷warn/error0。只用default unavailable source，无图／service／事件注入，也未操作用户tab2。两次mask失败和Space失败分别保存，最终native proof与截图在artifacts/canvas-role-library-native-final-*；正向目录／认证／建图仅受控App，不称原站账号／手机／Safari／大图通过。

真人VisualRecord／group／rename／sign／QR、历史图库selector、VIDEO／AUDIO重核writer、主体rb／团队、原glyph／new-feature及普通inline竖向自动翻转仍缺；真实运营服务／生成／费用未接。本机未部署、不要求登录／小号，整个目标未完成。细项与source证据见 [角色库验收](./canvas-role-library-functional-audit.md)。

## 节点面板与普通参考草稿（2026-10-13）

Wrapper／ScaledOverlay完整source 13文件／23摘录确认collapsed固定下方，expanded才portal；上下避让、title／固定toolbar列预留和短屏整卡滚动是用户授权本机适配。纯计划62+旧宽度8、真实hook17、Entry/Frame新增17、feedback实际App／view17通过。Root定向lint首轮opaque memo依赖两warning，改owner显式字段／effect只捕获owner，不关规则；最终hook／Entry34项02:39:58／1.36s通过。Agent早期坐标／单位／explicit boolean夹具错误及gap修前快照保独立log，不冒充生产故障。

ordinary reorder修前4项2pass2fail冻结日志保留，原正文A与末次B碰撞有真实App证据；一次显式prompt CAS与成功接受bridge修复。完整IMAGE source追到updateNodeData／incoming稳定签名／ig不调用，纠正only typed+literal；VIDEO保持稳定媒体重映射。最终5文件37项02:04:44／2.64s，全图／badge／150ms／pagehide／一次undo-redo及失败owner保持强断言；delete／connect未凭该碰撞另改，store删除完整链另验。

冻结1129源码后官方Node24.19.0 npm run check session54671 terminal exit0，375文件／5108测试，02:40:44／137.85s、build12.87s、3566modules，格式／零警告lint／架构／核心strict通过；日志canvas-generator-vertical-final-check.log，DEP0129保留。Canvas697165／gzip231658，四实现排除staticClosure37且direct dynamic；CanvasCSS207280与GenericCSS3383全字节SHA等旧角色冻结，Entry8／Script23源SHA与顺序一致，900000阈值／无manualChunks，见canvas-generator-vertical-final-build-proof.json。旧370/4991／1122保历史，非远端CI／全JSXstrict。

后台own UI新项目，无graph／storage／event／正向service注入。默认VIDEO view245,195,z1时above111..332.5、title349..384，无手动pan；390先观察left20/width350被toolbar x9..55覆盖，实测修至left75/width295/right370，全控件中心hit自身。320×240整卡125.5高scroll0→168，模型／参数／生成可达，参数portal／Escape可用。resize／scroll／参数开关前后GUI整文档deepEqual；展开／Escape回按钮与inert解除、80%卡片660宽；真实drag到400,170回below416..637.5，一次undo回640,385及prompt。IMAGE／VIDEO dragconnect→undo→再connect一条edge，selected／prompt／card平稳保留；首只读计数误用.cv-edge得到0，真实.cv-edges path后复核1与undo0，不记成连线失败。Script1280／390above与全部控件hit通过。group／显式尺寸／加载错误／动画中间帧主要受控DOM，不扩为原生。

最后冷加载、截图、GUI文件与精确原生范围见canvas-generator-vertical-native-final-proof.json；维护后仅文档／proof变化并定向格式，post-doc另记。普通删除source全链、角色特殊前端、真实服务／真机Safari／触控／高DPR与大图仍缺；本机未部署、影游冻结生产保持，整个复刻目标未完成。见 [验收](./canvas-generator-vertical-functional-audit.md) 和 [事务审计](./canvas-reference-draft-transaction-audit.md)。

## 普通节点参考删除与输入恢复（2026-10-13）

13个公开归档文件／79处独立UTF16/codepoint/UTF8范围与SHA确认普通delete→ig→T完整链；新增pure reconciliation／incoming collector，组计全部leaf、首边删除保node、asset保留、旧typed／mode映射独立。VIDEO reorder非法token语义与ordinary delete分别保源，IMAGE排序only-order不变。GraphActions末次prompt/Magic→explicit next/raw CAS/一次history，Inline成功消费真实接受值取消timer；Role final after共用collector，初始UI adapter未称等价。

保留真实失败：修前App8项03:03:52/2.89s全败，正文清理和baseline预期失败但全图／source／选择／view／历史强断言保留。初接线4文件25pass/3fail16:12:46/3.65s，三旧missing-token断言依据完整source纠正，不能记fixture故障。source对齐6文件62项16:15:18/8.24s全过；命令所列不存在旧Role hook未运行，不记7文件。Role final shared collector3文件57项16:19:53/3.57s全过；实际graph22/hook23/App12。最终pure53/incoming12/owner9三文件74项16:23:42/898ms，最终实际App11项16:26:25/3.23s全过；专项重叠不累计。首中尾/重复occurrence、三类mixed、非媒体组leaf、quota保图仅重试保存及whole undo/redo/200ms/pagehide保持强断言，scoped format/零警告lint通过。

冻结1135 source/config/tests后正式官方Node24.19.0 npm run check session31447 terminal exit0：**379文件／5193测试**，16:33:00/192.33s，格式／零警告lint／架构／核心strict、生产build13.86s通过，Vite7.3.7、3568modules，canvas-reference-delete-final-check.log。与上一1129冻结差6新文件/7修改/0删除，check后无production修改。actual ESM staticClosure37排除四lazy实现且各为Canvas direct dynamic，Canvas702280/gzip233404，Generic64155/gzip22070，既有900000/no manualChunks；CanvasCSS207280及GenericCSS3383全byteSHA不变，Entry8/Script23顺序+源SHA同旧freeze。build proof af9bf91c...及源码/log/runtime依赖证据在canvas-reference-delete-final-build-proof.json。之前vertical actual log已经Vite7.3.7，package ^7.1.0只是range，不宣称runtime升级。DEP0129及jsdom pause/load各8通知保留，非native播放验证；strict非全部JSX/CI未远端执行/统计含既有Studio影游。

后台新owned tab2 /canvas?projectId=canvas-reference-delete-native-20261013，Dev启动后实际chooser上传两公开webp、拖端口连接VIDEO、真实@插入Mixed1/Mixed2。删首项保全部三node/position/view，仅第一edge和目标prompt/typed/text列表变化。五份GUI before/after/undo/redo/cold：undo完整字节+文档等before；redo及cold完整等after，各SHA匹配。native一click恢复与此前upload/move历史区分，不以undo按钮非disabled否认一次删除历史。390最后项删除0edge/0ref/空prompt，三个node保留；一次undo后DOM投影完整等before，1edge/1ref/Mixed1绑定原second；panel x75/width295/right370/y80/height313.5。viewport reset、deliverable标记、最后warn/error0，截图和准确边界见canvas-reference-delete-native-final-proof.json及native-document-proof。

原生观察失误保留：first output与second input overlap，先移owned source再连成功，未因此更改pointer；首窄屏reader错用.cv-edge-path/旧panel class/badge data-node-id，按真实.cv-edges path/aria/data-mention-node-id重做last-delete/undo，不将错误0读数称生产失败。cold默认Agent侧栏打开，假设展开按钮的wait失败，fresh AX后实际关闭再选VIDEO成功。没有graph/storage/event/service注入，没有账号/原站写；实际App的mixed三类型/group/quota/CAS不称native全部通过。

独立review确认ordinary无新增阻断性事务缺陷；已知pictureEdit最后video reset、submitted segment锁/draft/SegmentRange、editing continuation cascade、全局node-edge删除、style/lens/focus和Role初始adapter仍是前端缺口。source普通按钮只readonly门控，不能以lock把分支称不可达。真实媒体播放、物理手机/touch/Safari/highDPR/大图和后台生成/费用/审核/上传/协作继续另验。本机未部署、影游生产独立，不登录/不使用小号，整体目标未完成。source/review/App/native/fullcheck/post-doc入口见research/canvas-reference-delete-functional-audit.md。

## 整图删除与确认（2026-10-14）

继续用户的节点交互优化，UI整子树／父组收缩／p2绑定、特殊锁重算与edge角色metadata、所有末次draft／post-CAS consume、键盘／菜单确认及手型门控接线；source／本机适配及未完分支见 [完整验收](./canvas-destructive-delete-functional-audit.md)。99源片段三坐标／SHA及19locale独立复核零失败，source只读。

首次正式session85339 exit1：388文件／5370项，仅旧CanvasGroups.integration组例失败，5369通过；22:59:10／203.82s，build未跑，日志 [首次失败](../artifacts/canvas-destructive-delete-before-group-expectation-check.log)。原测试错误期待UI删壳保孩子，与原source不符；改为完整before6节点／2边、删copy子树仅原3节点／ab、undo exactbefore／redo exactafter／unmountexact，保解组另例，不只改计数。专项3文件24项03:31:52／4.60s通过，[日志](../artifacts/canvas-destructive-delete-group-source-aligned-tests.log)。

官方Node24.19.0第二次完整session34383 terminal exit0：**388文件／5370测试全过**，03:32:29／170.04s，格式／零警告lint／架构边界／核心strict，Vite7.3.7／3573modules／build16.77s；[正式日志](../artifacts/canvas-destructive-delete-final-check.log)。1150路径冻结（14新src/test＋既有CI新增覆盖，14旧文件变更），最终Canvas721355bytes、四dynamic实现不入static closure、旧CSS207280／3383及8／23顺序不变、900000阈值不变，[证明](../artifacts/canvas-destructive-delete-final-build-proof.json)。

后台own tab4原生1280×720：两原webp真chooser／FileReader／端口拖连／引用按钮；16份GUI导出全字段核对抓手不删、删第一源清Mixedtoken／一次undo／redo／cold完全一致，整组全删／undo、脚本Escape不改／确认只删脚本／undo最新输入、双击只删一边并清引用／undo。390×844确认框x24／right366／width342、页面width与scrollWidth390，取消回原脚本焦点；viewport已reset，consolewarn/error0，[native proof](../artifacts/canvas-destructive-delete-native-proof.json)。150ms／Space-held／特殊lockedrenderer不扩为native声明，真机／Safari／高DPR／大图未验。维护后onlydocs/proof并定向format，源码再次SHA核对见 [postdoc](../artifacts/canvas-destructive-delete-post-doc-proof.json)。本机未部署、不覆盖影游冻结生产；分镜断线／VIDEO_CLIP mD／原locks等前端与真实运营服务仍缺，登录／小号延期，整体目标未完成。

## 脚本与分镜组单边断线（2026-10-14）

源6文件/33摘录与clip30原摘录三坐标/SHA全过，历史local2文件漂移单列。精确raw资格、editing优先、image优先/target到source video、t4/t5/t6/resourceMeta保源；本机opaque owner、原子CAS、失败保request明确为适配。真实App修前2失败、editing错路1失败、纯normalizer2失败/实际label1失败均保日志；按源修复，不弱化完整图/草稿/history断言。最终App14/edge owner28/真实draft-history API6/unlink23/node-data17/view6通过，重叠专项不累计。

首次正式16147 terminal exit1：393文件/5459项中两旧focus失败、5457pass，04:27:08/343.18s，build未跑。第一整it默认5000ms预算超时，第二确认工具aria-busy加载而同步findregion。原文件isolated13pass04:33:42/6.90s；仅修首冷入口15s总预算、第二await实际region后才开始last150ms输入，保七比例/params/edge/view/undo/redo/refresh全部强assert。首定向格式失败时test未运行，格式后focus13+unlink App14联合27pass04:35:12/15.90s、23036 exit0；生产未因等待修正改变。

新正式官方Node24.19.0 session2868 terminal exit0：**393文件/5459测试全过**，04:36:07/208.38s，格式/零警告lint/架构/核心strict及Vite7.3.7/3579modules/build31.55s通过。1161路径冻结43a16c99...不变，相对1150为11new/10modified/0delete；实际Canvas726329bytes/gzip241120、37静态闭包/四lazy、旧8+23源CSS/新scoped eager与900000预算见 [build proof](../artifacts/canvas-storyboard-unlink-final-build-proof.json)。strict非全JSX，CI未远端执行，DEP0129/jsdom媒体通知保留，旧388/5370不作当前通过。

后台own tab5 GUI复制既有代表作101node32edge。桌面取消完全不变、确认一边/三link字段、once undo/redo/cold全document精确相等；第二边actualCSS390x844取消/确认/once undo也强比较，344pxdialog/16pxoverlay/32pxbuttons/无X，backdrop不关/Escape/message全选。11GUI导出/17SHA文件/16断言与console0见 [native proof](../artifacts/canvas-storyboard-unlink-native-proof.json)。首localhost复制quota失败保截图且不清用户数据，成功在127隔离origin；10%thin路径首次miss/Input deadline不算性能pass；90%browser zoom经override351x760校准actual390x844并reset。窄屏导出补accessible name后实际export成功。

单边双击不覆盖source mixed batch、透明hit/剪刀入口、clip时间轴纯规则与异步target授权/fresh重算、完整renderer/真实锁和真机/Safari/高DPR/大图。维护后仅docs/proof格式/链接和SHA核对见 [完整验收](./canvas-storyboard-unlink-functional-audit.md)。本机未部署，影游冻结生产不变，无登录/小号，整体目标未完成。

## 连线命中、选择与悬停断线（2026-10-14）

源37+47+9共93摘录/21记录/12唯一原文件与三套坐标/SHA、三个theme规则SHA均通过；source shared layer的20 world hit、2/3/4 visual、48 cut、.25 cubic、实际挂载visibility、focusable独立、pointer CtrlMeta和keyboard ShiftCtrlMeta、hover1000ms/leave立即/当前native CTM/arclength已接。本机ephemeral owner、focus-visible与安全只读边界明确；双击不删除，剪刀复用普通重算/legacy warning/editing图事务。actual pointerActive与同owner派生panning修复普通松手/真实class回归。新5文件158项，原App14/15保持整图/最后150ms/一次history/quota断言，四计数helper数真实edge group，原reference8未改。native Space保按钮默认激活，readonly选线无写。

六次中间非0分别保留：92420主动TERM143；13984实际19fail（12旧计数、7真实panclass）；19788角色focus/overflow cleanup等待1fail；87582 tests398/5617全pass但build3584/28.65s failed/原因未捕获不猜，2183同源码isolatedbuild0/26.10s不混为完整通过；40247仅Monitor纯同步5000ms timeout（6635ms），isolated全assert71ms，限定该case15000预算/queries不改；99731仅ScriptEntry首真实lazy findBy1000ms timeout、DOM仍loading，isolated15pass/cold624ms，仅实际ready await10000/case15000，保compact/readonly无button/无status强assert。其余cases、global workers/timeout与生产未因后两预算变动，joint16pass/1.91s；失败和各freeze SHA保在artifact中。

最终官方Node24.19.0 `npm run check` session3704 terminalexit0：**398文件/5617项**，06:59:20/227.51s，格式/零警告lint/架构/核心strict、Vite7.3.7/3584modules/build17.71s通过，final log15451B SHA5d3d00e3...；1171freeze cd26ce18...全部匹配，对1161为10new/14modified/0removed。独立45assert [build proof](../artifacts/canvas-edge-interaction-final-build-proof.json) 核实际Canvas741368/gzip246320、closure37/direct static34/dynamic9/四literal lazy零漏、旧CSS207280与3383字节/31源CSS8+23顺序、main5与新entryCSS156600/22selectors/2keyframes。2旧公共selector允许原CanvasCSS继续有，20新不漏；900000/package/lock/Vite不改。版本与实际运行/锁分别核；strict非所有JSX、CI未远端执行，DEP0129/jsdom通知保留，不冒充产品console错误。

自有tab6真实toolbar/file chooser两图、video、port drag形成3node2edge，无graph/storage/event注入、不改用户tab5项目。14次完整GUI导出21图断言/13已记录UI/21文件SHA [native proof](../artifacts/canvas-edge-interaction-native-proof.json)：Space cut与窄屏click cut只删第一edge+target typed lists补第二source，全部source/其它fields保留；onceundo完整before；selection/covered no-op完整不变；hand+60/35及最终+20/10仅view。真实CSS390x844/scroll390，undo/redo/cold精确相等；窄屏JPEG433x938不猜DPR，readonly另tab默认1422选线无cut，50/10%命中world宽度不冒充固定screen20；本批两页native logs0。6截图实为JPEG原字节改canonical.jpg。native aa9126历史manifest保在before-studio-monitor-budget-source-snapshot，最终cd26仅两个旧test改，生产全同，不动冻结native proof。

源selected/mixed下一批15文件93摘录 [审计](./canvas-selected-delete-source-audit.md) 又核全部SHA/三坐标，RF initial nodewarn与flags、cl先lo后、ordinary先commit/关联聚合cancel不rollback、M微任务不finalize已明确；output纯draft不算运行实现。完整scope、工具失败attempt、空prompt不等150ms、ordinary样本不等legacy/clip以及剩余前端见 [连线验收](./canvas-edge-interaction-functional-audit.md)。selected-edge Delete/mixed、VIDEO_CLIP/真实锁/特殊renderer/RF虚拟化、真机/Safari/高DPR/大图继续另验。本机未部署，影游生产冻结不变，无登录/小号，整体复刻目标仍未完成，约70%只作工程估算。

## 选中边、混合删除与VIDEO_CLIP断线（2026-10-14）

source RF候选／flow初始warning双flags／cl先lo后、editing优先、ordered mD与target事务、ordinary同步／clip异步／一次关联offer／selected node启动分别由纯模型与coordinator接线；最后全部draft／raw CAS／成功消费统一在GraphActions。本机history桥microtask仅结束coalescing、接受图发布before、晚确认分段，undo／redo须成功flush；普通和raw UI组删除不混用。长按Delete／Backspace修前22项2fail20pass（实际4次dispatch），修后press latch／keyup／blur／contextmenu；旧54项兼容初15fail因异步阶段等待，保whole gold补等待后54pass。旧91项两lazy readiness失败与局部具名等待调整、后91pass／旧组27pass均保日志，不累计为最终范围。

clip纯27／hook36、本机Port先33后40独立测试；mode owner修前3fail／33pass→63jointpass，actual overlap Port＋controller修前1fail／33skip→按operation signal分开receipt、commit和release后两文件76pass。取消／timeout未获lease的finally不减另一操作授权，legacy无signal独立bucket；signal／opaque owner不写文档。本机lease、50条full-snapshot历史与原云锁／patch版本冲突／100条历史的差异明确保留。actualApp新增19项／13份独立literal完整图与controller26项在最终完整检查复验。

首正式session58836 exit1：[日志](../artifacts/canvas-selected-delete-final-check.log)，08:47:06／325.32s，407文件／5862测试仅旧SkillCreatorFlow首例5000ms超时，406文件／5861pass，format／lint／架构／核心strict通过、build未运行。原样isolated2pass642ms、邻近7文件90pass、stdout临时诊断first editor138ms／restore259ms／全部assert325ms；临时标记还原原SHA `68de671df6aaad332b57be7f3c9abf0fbd421efcd147d6869673364ce7738de6`，生产／断言／timeout／worker无持久变化。失败阶段与根因未定位，不把lazy／资源并发当确定原因，[诊断证明](../artifacts/canvas-selected-delete-skill-diagnostic-proof.json)／[独立失败freeze](../artifacts/canvas-selected-delete-first-formal-failure-proof.json)保留。

同1192 runtime源码及22检查时Markdown输入再次核SHA零差异后，官方Node24.19.0第二次完整check session29008实际terminalexit0：**407文件／5862项全过**，08:57:15／233.25s、Vite7.3.7／3593modules／build16.68s，format／零警告lint／架构／核心strict通过，[正式日志](../artifacts/canvas-selected-delete-validated-check.log)。447ec0c4...freeze相对1171为21新增／13修改／0删，245项新增测试不是245项原站功能。独立52断言 [实际dist proof](../artifacts/canvas-selected-delete-final-build-proof.json) 和11项 [补充链证](../artifacts/canvas-selected-delete-final-build-supplement-proof.json)：Canvas767526bytes／gzip254878／37static closure／34static+9dynamic，4literal lazy与UI marker零静态泄漏；旧CanvasCSS207280／Generic3383／Entry156600字节SHA全同，31源CSS8+23顺序／main5／依赖／900000预算不变，所有原始证据元数据SHA不变。strict仅核心、CI未远端执行，DEP0129／jsdom媒体提示保留。

恢复本机5173 Vite（先lsof无监听，session46102实际ready，原端口strictPort），Root背景tab5通过公开作品“查看创作过程→复制项目”建`local-hj8y4dh6`，不修改用户`local-rcf4u91b`。实际Enter／Control＋Enter mixed两边→Delete／部分取消、一次undo／redo，重新操作晚确认→两阶段undo／redo／cold；390实际CSS390×844的两legacy关联Enter／Shift＋Enter→Backspace一warning、Escape取消、确认／onceundo／redo。14份GUI JSON全文匹配先冻G0–G3、101节点保持／32→31→30→28边；真实dialog344／padding16／button32／无X、page scroll390。既有90%browser zoom校准override351×760后reset，两JPEG已实际查看，console0。

Root背景tab6另公开`6507cebdab6e43ebb94f18fc42dc68fd`复制为`local-kla8xzk3`；DOM身份核四同名高清入边，Enter／Control＋Enter选Fc7／Mar两边，Delete无warning。五GUI全文匹配先冻G0／G1，34节点保留／43→41边，剩主轨起点0／15.069750566893424、total／current30.139501133786847，once undo／redo／cold完整匹配；两页console0。19完整GUI与12原文excerpt三坐标SHA见 [独立最终native proof](../artifacts/canvas-selected-delete-native-independent-final-proof.json)。额外聚焦第六clip导出只改正常fit view，其余全部字段等G1，不混入19完整view证明。当前无整画布GUI导入，`.libtv`只是历史导出归档后缀，不注入storage／graph／events。VIDEO不扩为AUDIO、busy／denied／cloud锁或物理touch／Safari／大图；长按与150msrace只为自动回归范围。

真实聚焦截图确认video-clip仍通用“智能剪辑生成器”占位／普通Inspector，完整原dN renderer、时间轴编辑／内部片段删除恢复／媒体准备／导出前状态继续有前端差距。轻量静态下一阶段研究仅存artifacts，不计运行实现。维护AGENTS／agent／README／CanvasREADME、coverage及审计后，定向格式／本地链接／1192源码再核，实际范围见 [本批验收](./canvas-selected-delete-functional-audit.md)。本机未发布，独立影游冻结生产不变，登录／小号按用户要求暂缓，整体目标继续进行中，约70%仍是工程估算。

## HTML字幕实际App接线（2026-10-16）

上一批453文件/6510项仅覆盖HTML字幕底层协议；本批新增实际来源读取、列表/样式面板、source时钟轨道手势、拆分/复制meta事务、规范存档、历史/CAS、末次输入与真实预览。原生复制发现loaded物化只认创建片段、误过滤已保存副本；修前纯回归7项中1失败后修复。原生播放后编辑又发现NodeCanvas成功保存的旧播放投影被误判冲突；镜像实际acknowledgement的52项中1失败后，以实际对象/原基线/会话/完整值指纹识别解决，追加过期投影仍拒绝的强断言。恢复最新和副本清旧HTML草稿/loaded层，备份保最终正文。

联合剪辑/草稿/自动保存/同步SHA39文件631项通过，追加旧投影拒绝后的controller52项再次通过。初始ENOSPC专项、两个修前失败、HMR hook顺序错误和locator失误分别保留；首轮完整check为处理真实误报主动停止terminal143，`html-subtitle-app-before-projection-receipt-check.log`不是通过或观察超时。

最终1367源码/config冻结后，官方Node24.19.0完整`npm run check` session50294实际terminal0：**457文件/6544测试全部通过**，00:13:34开始、测试299.68s、标准build21.87s，格式/零警告lint/架构/核心strict通过。全记录源码/config指纹未变，Canvas897073/ClipWorkspace189589字节，900000预算未提高，workspace仍为真实dynamic入口。日志 `artifacts/html-subtitle-app-full-check.log`，独立hash/产物/范围证明 `artifacts/html-subtitle-app-verification.json`，滚动日志更新为该真实成功结果。strict非全部JSX、统计含独立影游，JSDOM媒体/Node弃用输出保留，CI未远端执行。

真实Chromium App通过GUI上传320×180六秒视频并创建clip节点，desktop及390×844无横溢。真实鼠标移动/取消、拆分/复制/撤销/重做/冷刷新、文字/小数字号未失焦恢复、最后删除显式userCleared、独立Web Crypto hash/bytes、数字/预设/面板逐层Escape及回焦通过。两片段连续播放过6秒切点后，7.2799秒处字幕时钟1.2799、真实视频约1.287，绿色文字/wave及clip可见性已读；冷刷新后console无warning/error，与保留的中途HMR错误分开。仅关闭自建browser/5181，原5173仍在，无graph/storage/ready/pointer注入，无登录或账号资源。

细项、原始证据、剩余旧字幕分类/高亮alpha/完整轨道/字体目录、自定义runtime和真机/Safari/大文档边界见 [App验收](./canvas-html-subtitle-app-audit.md)。仅本机更新，未部署，不改变已发布生产或独立影游冻结；整体约70%仍为工程估算，整个目标未完成。

## 字幕高亮与列表/样式侧栏（2026-10-16）

本批沿用源静态摘录，新增逐词高亮文档、双alpha色盘、source词时钟与普通/字幕属性分支。原站`[lK,lG]=useState("subtitle")`和`gL`表明列表与样式共用右侧300px栏，样式头有返回字幕列表；本机此前把两栏同时展示，已改为默认列表、双击进入样式、样式头返回。源摘录与SHA在`artifacts/subtitle-highlight-source-evidence.json`及`artifacts/subtitle-sidebar-next-source.json`，REA图仍partial、不运行原bundle。

纯文档/控制器/视图专项41文件646项通过后，实际Chromium GUI使用真实320×180六秒视频，桌面列表→双击样式→返回列表，390px列表标题/栏位与外部焦点通过；源词时间、实时iframe CSS颜色/背景/animation currentTime、快速alpha RAF结算、一次undo/redo、pagehide、刷新、hash/bytes和无error console均有`output/playwright/subtitle-highlight-*`证据。portal曾被外壳pointer-events截获，已补auto；快速关闭曾丢最后RAF，已补结算帧；两个修前失败保留，不混称产品无问题。

最终Node24.19.0官方完整`npm run check` session87968实际terminal0：**459文件/6559测试全部通过**，01:43:25开始、测试413.89s、标准build33.47s；格式/零警告lint/架构/核心strict通过。1374源码/config冻结无漂移，Canvas897382/ClipEditorWorkspace229409字节，900000预算未提高。日志`artifacts/subtitle-sidebar-full-check.log`，证明`artifacts/subtitle-sidebar-verification.json`；当前full滚动入口待维护脚本复制为该成功日志后再引用。strict非全部JSX、CI未远端执行，Node/jsdom媒体提示保留。

仍缺旧L1/L2/版本迁移、VTT/HTML混合优先级、多语言完整属性、完整字体/预设远程目录、轨道连续重排、预览几何/自定义runtime、触摸/真机/Safari、大文档性能和真实运营服务。仅本机，未部署，登录/小号继续延期，整体约70%，复刻目标未完成。
