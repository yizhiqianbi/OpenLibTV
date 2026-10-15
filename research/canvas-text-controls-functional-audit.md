# 普通文字数值条、输入事务与颜色行（2026-10-15）

本批替换普通文字属性里的基础number输入，接入原数值条的拖动/点击、只读读数与文本编辑、确认/取消、键盘步进，以及原生颜色行的hex/alpha展示和一次提交。不是字幕高亮的alpha picker或完整HTML字幕工具；整体复刻仍未完成、保守估算约70%，本机未部署，无需登录注册或账号资源。

## 直接源依据

仅读取归档 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。不执行原bundle、遥测、写服务或自定义runtime。

- `s1/s2/s5/s4`401000–407500：整条控件位置映射min..max，再按min为基准step舍入，并按step小数精度输出。不是相对拖动增量，也不是零基准舍入。只读input及suffix上无位移点击进入编辑并focus/select；其他位置按下立即映射，移动3px后进入drag，RAF合并，pointerup用最终坐标再提交。
- 输入type=text/role=spinbutton；空白/非有限数解析失败，越界标记aria-invalid并暂不预览。普通typed小数不按step舍入，blur时限幅，Enter触发blur；空/非法回当前有效值。Escape取消正在编辑/预览的数值；只读状态Arrow/Up/Down、Home/End按step改变，Shift乘10，keyup结束同次操作。编辑状态保留原生文本键盘操作，键盘事件不冒泡到Canvas。
- `un`420900–424300：普通文字color不是alphaEditable，保留原生input[type=color]，额外显示hex与只读alpha百分比；背景showOpacity=false，alpha由背景数值单独调。连续onChange在同一交互里，blur/同owner卸载才结束一次；native值写入时保留源aP整数alpha。Mantine ColorPicker/AlphaSlider仅用于字幕高亮的alphaEditable分支，本批不为了使用开源组件而给普通文字创造弹窗。
- `s3/s6`407000：样式输入统一style-input属性并有受owner限制的blur提交。数值清理/终止回调与宿主document/history关联；不能每次mousemove制造一条历史，也不能由旧控件回调结束新交互。

## 工程与所有权

纯parse/min-relative snap/pointer映射/blur settling在`domain/text-numeric-model`；`useTextNumeric`持本地draft、pointer/RAF和焦点生命周期，`TextNumericSetting`只渲染源条形/读数/单位，`TextColorSetting`持native swatch交互。全局blur/visibility/pagehide监听仅交互激活时安装，结束/取消/owner更换/卸载移除；不为所有空闲数字输入安装监听，不另建modal或body滚动锁。Escape复用dialog-stack，先取消数字、再关闭属性区/预设。

普通文字controller桥新增begin/preview/end/cancel样式动作；主controller仍拥有实际事务和CAS/历史。token只在内存存在，DOM、reader函数和token不会落Canvas文档。字段切换/只读/文档切换隔离旧token，旧pointer/blur无法结束新字段；共享preview方法按一次编辑的原时间轴计划field patches，继续使用已有HTML与像素换算。

拖动过程在保存投影里保原时间轴，释放才一次历史；typed/keyboard/native color可在pagehide/其他graph保存投影时保最后值。typed pending reader仅同步读取当前数值草稿并限幅，不在持久化过程中触发UI事件。最后原始越界输入未blur也能保存为合法范围；这属于本机异常退出/保存边界适配，不据此宣称原站未失焦跨图autosave完全相同。

输入因其他graph动作精确投影进raw时，仍保原timeline供一次撤销。Escape可用当前CAS还原该字段，保留其他节点的改名等动作；不同外部时间轴不宽松吞并。pagehide先结算可持久输入，再退休UI交互；迟到blur不能补出第二条历史。只读/owner更换后迟到回调不能重建已关闭或新文档。

## 验证与过程

最终剪辑专项32文件/558项通过，日志`artifacts/clip-numeric-targeted-final.log`。新增回归包括min8/step5的非零步进、普通小数/特殊snap、无变化不生历史、pointer中间值不进保存/一次undo、越界pending reader/pagehide/一次历史/迟到blur、被其他graph动作投影后取消且保其他改名、旧token不能操作新事务、数字只读→编辑/invalid/Enter/Escape/Shift/阈值/blur/owner、可见visibility通知无害/真正hidden取消、原生色相保alpha与一次blur/卸载提交。真实GraphActions/Drafts/Autosave专项49项曾独立通过，最终联合包含新增visibility回归。

初次联合失败只有旧UI测试仍期待数字写`onTextChange`，改为验证新的begin/pending reader/preview/end协议，保正文断言不变。中间日志`clip-numeric-initial-tests.log`保留。补显式hidden回归前主动停止一轮完整检查terminal143，日志`clip-numeric-before-visibility-test-check.log`；不是观察超时重启。

首轮最终完整check session45015 terminal1：452文件中451通过、6493测试中6492通过，旧角色库首例撤销基线不一致，build未运行；日志`artifacts/clip-numeric-role-failed-full-check.log`。原文件隔离12项通过；显式等待提示词180ms后，在不改原基线与断言时稳定复现同样六个默认字段差异，日志`clip-numeric-role-debounce-diagnostic.log`。提示词debounce会通过实际generator normalize保存params和generationError，目录加载先后让旧测试混淆了保存前后基线。首例现明确等待提示词正常保存，随后读取完整已提交graph，再验证角色引用的一次undo精确回该graph及redo/刷新；相邻假时钟测试继续验证150ms内未提交的末次输入，未削弱整图断言或延长时限。联合33文件/570项terminal0，日志`artifacts/clip-numeric-final-joint.log`。

1351源码/config重新冻结后，最终Node24.19.0完整check session82598 terminal0：**452文件/6493测试全部通过**，22:12:01开始、测试301.07s、标准build38.94s，格式/零警告lint/架构/核心strict通过。验证后所有记录的源码/config指纹未变，Canvas895155/ClipEditorWorkspace148791字节，900000预算未提高，重型控件保持lazy；日志`artifacts/clip-numeric-full-check.log`，proof`artifacts/clip-numeric-verification.json`。旧450/6478属于前批冻结；后续仅维护文档与证据并复查格式。strict非全部JSX、CI未远端执行，本机未部署。

实际Chromium App使用此前GUI生成的双视频/文字样本，证据在`output/playwright/clip-numeric/`：

- `typed-decimal.txt`与`after-typing.txt`：只读读数点击进入编辑，输入24.125保持，Enter后按源像素转换显示/预览24.13，readOnly恢复，无可见错误。
- `keyboard-undo-cancel.txt`：一次undo回17.63、redo24.13；输入70.5后Escape回24.13，右侧面板仍打开。`reload-clamped-number.txt`：未blur的999越界带aria-invalid，立即刷新后读取400。
- `pointer-keyboard.txt`：真实鼠标在整条25%→75%映射X=75，一次undo回20.125、redo75；再拖到50%时Escape仍75，Shift+ArrowLeft变74。首次在source smooth anchor滚动尚未稳定时用旧rect点击未改变X，保留`pointer-before-scroll-settled.txt`；等待实际row稳定重验，不修改生产映射规则。
- `native-color*.txt`：实际native color input经浏览器fill/Tab产生绿色，显示#00FF00/100%，iframe同色，一次undo白色/redo绿色。这不等同外部操作系统色盘每种原生UI已实测。
- `narrow-escape-focus.txt`：390下输入取消/ArrowUp、预设搜索、逐层Escape回原控件。`desktop.png`、`narrow.png`为实际布局；不是手机UA/系统键盘验收。
- `native-background-first.txt`首次切新标签没有取消拖动；进一步在`native-background-verified.txt`确认工具浏览器把原页保持visibility=visible/hasFocus=true，没有产生真实后台条件。原生后台取消因此未验收，只保留unit的真实handler/模拟blur/hidden回归，不把切tab命令当通过证据。
- 新控件后完整连续播放到结尾的结果见`native-play-through.txt`。

## 剩余范围

本批仍只接普通文字；VTT当前基础属性与HTML字幕的共享复杂数值/高亮alpha picker还需分别映射原协议。色盘是原生控件，OS对话框、Safari/真机触摸/虚拟键盘、后台页/页恢复和高DPR仍需独立验证。

完整字体/预设目录、CSS注入等级/锁定属性与复杂computed style、HTML字幕source时基/片段绑定、轨道新增/连续重排、预览几何工具、波形/帧缓存/真实导出、自定义script运行时与云生成/费用/协作继续有缺口。原始账号资源、登录注册继续延期，整站目标不据此标完成。
