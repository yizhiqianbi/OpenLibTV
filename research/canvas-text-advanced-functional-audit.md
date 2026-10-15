# 普通文字背景、动画与属性区（2026-10-15）

后续普通文字已接原数值条的拖动/键盘/确认取消、native颜色hex/alpha与事务；见 [控件验收](./canvas-text-controls-functional-audit.md)。下文450/6478与“数值仍基础输入”为前批冻结，不覆盖后续源码；HTML字幕/高亮alpha picker及OS/真机等边界继续保留。

本批在已接App的普通文字工具上，补背景颜色/不透明度/圆角/模糊、9种非空动画、应用到所有、折叠属性区与滚动定位。高级HTML字幕、自定义脚本运行时、原预设/字体目录及整套原始数值/色盘控件仍不是本批完成范围；整体目标保持未完成，不提高约70%的估算。本机更新未部署，不需要登录、注册或账号资源。

## 直接源证据

仅读归档 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e` 与 `public/data/locale-zh.json`，未执行原站bundle/脚本/遥测或写服务。

- `s9`407000后、`s7`419000附近：普通文字由布局/文字/背景/动画区段组成，全部在同一滚动流中、每区独立折叠、按钮scrollIntoView，初始布局。高亮仅`variant=subtitle`启用；普通文字不创造高亮入口。行高显示为百分比，字重100..900使用Thin到Black，当前自定义值可额外显示。文字输入52px、46px预设入口、页头删除和独立57px底部“应用到所有”。
- `s9`411000：textarea失焦到页头删除时跳过正文提交。当前实现也避免先写正文再删除而生成两条历史；删除成功清待删草稿，失败保留。键盘等其他操作继续按原既有草稿规则。
- `pk/pI`约623000：直接背景修改写正文元素的backgroundColor/borderRadius/backdropFilter，清普通文字不适用的逐字高亮；字号等走style variables。对齐与斜体属于预设/复制的直接style协议，不是本页独立按钮。
- `av/ax/ak`295600–296300：输出/原composition宽高比例取平均，像素属性按该比例换算并四舍五入至两位小数。`n8`数值限幅本身仍保小数，不能混为input step舍入；layout百分比不套像素转换。上批测试的45.125字号及-3.125字间距任意精度写入据此修正为45.13、-3.12，并保留原失败日志。
- `aC/aE/aM/aP/aN`296000–298200：三/四/六/八位hex、RGB/RGBA及百分比alpha，不透明度展示整数百分比；零alpha保留原色相，写入RGBA可保实际小数alpha。CSS不认识的颜色不臆造转换。
- `i2/i5/i4`260000后、`nl/nc/nd/nf/ng/nh`260000–267800：无动画、淡入、弹起、虚化浮现、放大进入、左右滑入、擦除显现、脉冲、波浪。默认时长分别300/550/300/600/500/500/600/450/600ms，延迟0、次数1、幅度8；内部还保留fade-in/fade-out读写。duration100–10000、delay0–10000、iterations1–100整数与amplitude0–80两位小数；不把这些隐藏参数额外加成原界面没有的输入。
- 原动画把`data-anim`/`data-libtv-motion-target`、duration/delay/iterations/amplitude/start CSSvars写入`.hf-anim`或正文目标，只安装一个`libtv-timed-text-motion-style`。timing移动和新增clone更新自身cue start；宿主按timeline time暂停并seek真实CSS Animation。普通CSS模板支持真实预览，自定义hf脚本分支仍保metadata与能力提示，不执行脚本伪造完成。原runtime script标识为`libtv-hyperframes-runtime`。
- `pw`630000–632200：应用到所有遍历同composition的其他所有cue，不限制当前轨；复制字体/样式变量、layout、直接文字/背景/padding和动画/预设标识，保每段正文、时长、轨道和自身动画起点。源拷贝前移除目标旧Subtitle变量，不抹其他未知属性。

## 工程与状态

`domain/text-motion-model`与`text-color-model`维护纯规范；`text/motion-document`只持inert DOM元数据/CSS，不导入React；`html-patches`批次校验后接受。样式像素转换位于纯时间/数值模型，读写继续经`document-model`、`controls`与既有owner/CAS/十步历史。`TextPropertySections`负责折叠与滚动；共享SideRail增加可选actions/footer，VTT/转场保持原调用。

数值原始字符串仍先留UI草稿；输出比例转换、背景与动画进入同一个投影，pagehide/其他图操作和关闭使用同一保存规则。应用全部由一个批次提交并产生一次历史；DOM、CSS Animation实例、operation token和文件读取状态都不进入文档。新增/删除/移动文字继续遵守原轨道与历史边界。主Canvas仅新增小动作名，重型协议继续lazy，不抬900000预算或修改manualChunks。

## 验证与过程

最终剪辑专项30文件/543项通过，日志`artifacts/clip-text-advanced-targeted-final.log`。测试覆盖alpha/零透明色、输出空间像素转换/两位小数、pending背景投影与限幅、source动画默认/时长/唯一style/move/clone起点/none清理、自定义脚本保留与不执行、应用所有保正文/时间/轨道/独立起点、实际GraphActions/Drafts/Autosave的pagehide/一次undo/redo、区段折叠/百分比行高/按需预设/普通分支无高亮及页头删除不额外提交正文。

最初格式检查发现document-model缺闭括号，修复后复跑；随后3旧测试按直接源换算更新预期、UI缺clips夹具触发输出尺寸读取已改为无可用尺寸时返回null。原失败日志`clip-text-advanced-initial.log`、`clip-text-advanced-initial-rerun.log`与最终强断言共同保留，不把中间失败写成通过。

最终Node24.19.0完整 `npm run check` session65446 terminal0：**450文件/6478测试全部通过**，21:27:23开始、测试203.71s，标准build18.36s；格式、零警告lint/架构与核心strict通过。日志`artifacts/clip-text-advanced-full-check.log`，滚动入口`artifacts/current-full-check.log`；1345源码/config指纹至结束未变。Canvas894054字节低于900000预算，ClipWorkspace138765字节；未改manualChunks/阈值。测试按原config的2workers执行。strict非全部JSX、CI未远端执行、本机未部署，整个目标仍未完成。旧449/6468为前批冻结。

实际Chromium App使用此前GUI产生的双视频/双文字样本，没有注入HTML节点、图数据或假ready；证据位于`output/playwright/clip-text-advanced/`：

- `at-start.txt`：片段0.5秒起点，实际CSS Animation paused/currentTime500/delay500/duration550；opacity0、translateY28px。`at-middle.txt`：0.75秒opacity1、Y=-1.4769，证明弹起曲线的实际回弹。
- 同一真实iframe背景RGBA(0,0,0,.725)、radius8.13px、blur4.13px；`desktop-motion.png`为原生静态seek图。
- `wave-midpoint.txt`：390px缩放1.16875，0.8秒时wave duration600/delay500、currentTime800且paused，实际Y=-8px。不是靠timer或ready属性猜动画完成。
- `apply-all.txt`与`apply-all-undo.txt`：其他cue保原正文、4.0666…开始与.257…时长，动画起点写4.067s；单次撤销只恢复被复制的其他cue，选中cue样式不变。
- `reload-last-number.txt`：背景模糊未blur输入6.375后立刻刷新恢复6.38及原动画。`narrow-sections-focus.txt`验证390区段折叠/滚动、wave选择、预设搜索与逐层Escape回焦点。
- `header-delete-undo.txt`：未blur正文直接点页头删除，一次撤销回原正文，没有额外草稿编辑历史。首次390刷新后沿旧桌面视口直接开节点超时，原生“适应画布”后重走成功，失败保留`header-delete-before-fit.txt`。不是靠强制click或注入恢复。
- `narrow-final.png`为最终窄屏；这是本机布局适配，不能推断原站手机UA或Safari触摸已验收。新增属性后连续播放/片段隐藏/转场到结尾的结果见`native-play-through.txt`。

## 剩余范围

默认预设仍按原空目录回退，现有小型adapter不等同完整remote-config/字体服务；完整预设中的shadow/padding/颜色交互和语言目录需继续接线。颜色仍用原生picker，数值仍用当前基础输入，原拖动数值/快捷键/Escape取消和alpha色盘细节尚未完整复刻。自定义脚本/GSAP/hf运行时未执行，原hf分支的其他动画不假装已完成。

HTML字幕source时基/片段绑定、轨道新增/连续重排、预览内几何操作、CSS注入等级/锁定属性/复杂CSS与live computed-style、动态字体资源、波形/帧缓存/真实导出和云端生成/费用/锁协作仍缺。真实账号资源、登录注册继续暂缓；高DPR/大图/真机与Safari继续独立验收。
