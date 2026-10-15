# 连线选择、命中与悬停断线验收（2026-10-14）

继续用户“节点交互不够流畅自然”的优化。本批把普通画布的连线入口改为源可核实的透明命中区、选择与悬停剪刀；断线仍复用既有普通重算、editing 与分镜关联确认，不再以双击连线直接删除。仅本机源码；无需登录、小号、原站写入或发布。独立影游生产与用户正在使用的项目未修改，整体复刻目标仍未完成。

## 源证据与本机边界

[命中与共享 layer 审计](./canvas-edge-hit-source-audit.md)、[曲线与可见性审计](./canvas-edge-geometry-source-audit.md) 和 [选择及键盘审计](./canvas-edge-selection-keyboard-source-audit.md) 分别保留37、47、9条原摘录。对应三个 proof 合计21条文件记录、12个唯一原文件、93条摘录；原文件与摘录 SHA、UTF16／codepoint／UTF8 三套坐标及实际切片均独立核对通过。旧 local 文件记录只作历史，当前两处漂移不冒充源验证失败。归档脚本只静态读取，未执行其遥测、认证或写服务。

源 custom shared layer 的透明 hit 为20世界单位，视觉线普通2、选择3、hover4；`data.type === 'reference'` 时交互视觉虚线为6／4，不能将普通边或旧本机类型误判为 reference。贝塞尔使用原 .25 曲率规则、四方向端点公式；实际 sourceRight／targetLeft 接世界位置与真实卡片尺寸，支持 null／undefined 或原 source／target handle ID，拒绝不存在端点、无效尺寸和不支持的 handle。宽度随画布缩放；10%时 hit 为2屏幕像素、48单位剪刀为约4.8像素，本批没有将源世界宽度改成固定屏幕宽度。

实际已挂载节点集合决定连线展示，hidden／聊天生成 replay 条件与 node renderer 共用；不是曲线包围盒猜测。`showEdges=false` 时只保留关联已选节点的边。当前本机没有原 React Flow 的节点虚拟化，不能据此宣称大图性能或全部 source visibility 等价。

普通 pointer click 独选边并清节点，Ctrl／Meta toggle 可保留节点；Shift pointer 不叠加边。Enter／Space 是 add／replace而非 toggle，editable 键盘 Shift／Ctrl／Meta 叠加；readonly 键盘按源 multiSelectionKeyCode:null 替换，readonly pointer 的 Ctrl／Meta 仍可叠加。focusable 与 selectable／interactive 独立，不可操作的 focusable 边仍可 Tab；Escape 只清当前边与节点，并 blur，其他已选边保留。pane Escape 清全部。选择只是本机临时 UI，不写 graph、view 或 history。

hover1000ms后显示剪刀，按原 path arclength 的81次粗查／11次细查求最近点，平局保首项；世界坐标移动不足10时跳过，进入剪刀冻结位置。共享 layer leave／blur 立即卸载，未另加120ms或150ms grace。200ms视觉宽度／颜色过渡仅在 hovered 时生效，离开立即恢复。剪刀48世界单位、28图标、-115度旋转和入场 .7→1沿用源样式；本机补可访问名称与focus-visible。实际矩阵优先使用 native path.getScreenCTM().inverse()，保证视口300ms动画中间帧及祖先变换正确；已提供的 API 返回 null、throw 或非有限值时清旧位置，不用猜测的最新 view 顶替。仅 API 不存在的受控环境允许 board／view fallback。

selected flow 使用两层 glow 与6单位蓝线、pathLength300及3秒 dashoffset；Mark隐藏，活动手势隐藏并暂停，idle hand仍保留选择色和 flow。hand、held Space、引用／聚焦／Mark 禁 pointer；readonly允许选线而不显示写入剪刀。当前 selected-edge Delete／Backspace、混合 node／edge 批次和 VIDEO_CLIP 时间轴异步流程尚未接入，不能把这些键盘分支算完成。

## 职责、当前 owner 与修复

- `domain/edge-interaction-model` 持纯 geometry／visibility／presentation／selection 与 native path lookup规则。
- `useCanvasEdgeSelection` 持临时选择与 document／ready／readonly owner；接受新的 edges 时同步退休删除 ID，同 ID 再插入不能复活已删选择。
- `useCanvasEdgeHover` 持 timer／RAF／native path cache及当前 edge incarnation；切文档、能力关闭、实例替换、卸载和 Strict replay 退休旧回调，无 graph／history writer。
- `CanvasEdgeLayer` 区分 transparent hit、visual、flow 和 HTML剪刀，隔离 SVG keys／pointer；剪刀 Space／Enter 仅阻止传播、保留原生按钮激活。剪刀调用既有 `useCanvasEdgeRemoval`，以当前 edge／权限／hover再次门控。
- shared `useGraphPointer` 的 pointerActive 与即时 ref 共用同一手势 owner。panning class由同一 owner 派生，不能让 React 更新 className 删除 imperative cv-panning；down／up／cancel／blur／hidden／lostcapture／切文档统一清理。普通节点松手后边立即恢复可用，idle hand不误删选择。

新 scoped CSS 是 main 的第5份 eager批次样式；旧 Entry8／Script23源级联、旧 lazy Canvas和Generic CSS字节、四个实际 dynamic入口及900000预算不通过新交互而改写。当前构建最终证明另记，未用旧 dist替代。

## 回归与完整检查历史

新5文件158项：纯模型33、选择owner16、hover60、layer31、实际lazy App18。App使用 DOM path／native API fixture，不以生产 planner造 expected gold；覆盖pointer／keyboard、readonly、真实按下与松手、当前owner、末次150ms草稿、一次undo、quota和确认。旧分镜App14／整图App15的双击删除入口改用实际hover剪刀，图、输入、历史与失败保留断言没有删减；旧四处path计数改数真实edge group，排除新增hit／visual／flow。原参考手势8项文件未改。

有意义的失败与修复均保留：旧普通按下／松开专项41／42暴露门控不能恢复；native Space语义用例暴露按钮被全局Space preventDefault消费；首次全量19／5617失败含12处旧SVG路径计数和7处真实panning class回归。修复生产门控／派生class后，原参考用例与新的down／up双class强断言通过，6文件90项联合通过。旧角色弹窗30项中1项DOM消失早于焦点／滚动锁cleanup；改为同一waitFor等待弹窗、精确opener focus和body overflow，再检查原输入值、首批三媒体payload及重试身份，未放宽超时或取消原断言。

正式检查过程不能混称通过：92420主动终止为exit143；13984为398文件5617项中19失败；19788为1失败。87582在同一1171文件冻结源码上398文件5617测试全部通过，但build3584 modules／28.65s后exit1，原log未捕获stderr原因，不能猜测根因。原失败及快照保为 `canvas-edge-interaction-before-unexplained-build-retry-*`。同源码单独build2183重新捕获stdout／stderr，exit0／26.10s，不替代完整check。

40247正式重跑为exit1，398文件5617项中只有StudioMonitor同步用例超过默认5000ms预算（6635ms），5616项通过，06:36:31／500.13s，build未跑；log／aa9126快照保为 `canvas-edge-interaction-before-studio-monitor-budget-*`。该case无lazy／GPU／pointer依赖，孤立运行同一完整操作链71ms通过。只给这一case15000ms墙钟预算并说明与浏览器UI时延不同，原role／accessible name／CSS可见性查询和全部交互断言未改，不采用hidden:true，不调整全局worker或timeout。修后定向72ms通过。

99731正式重跑为exit1，397／398文件、5616／5617项通过，06:50:20／376.88s，build未跑；只有ScriptNodeEntry首次defaultLoader的surface查询默认1000ms不足，错误DOM仍为aria-busy true／“正在加载脚本节点…”，不是error。原完整15项孤立通过，真实cold case624ms。仅给首次真实模块ready查询10000ms、该case15000ms预算；不预import、不换stub、不用假时钟，compact／只读无打开按钮／无status全部后续即时强断言保留，其他14case未改。ScriptEntry15与Monitor1联合16项通过；failed log与7fd32c8d快照保为 `canvas-edge-interaction-before-script-cold-readiness-*`。

最终官方Node24.19.0 `npm run check` **3704真实terminal exit0**：**398文件／5617测试**全部通过，06:59:20／227.51s；格式、零警告lint／架构边界、核心strict及生产构建通过，Vite7.3.7／3584 modules／17.71s。完整 [日志](../artifacts/canvas-edge-interaction-final-check.log) 为15451字节，SHA `5d3d00e3c80d580934ad397aebee10f86f97a2c48b23fe221657f413b7825b4d`。1171路径 [最终源码manifest](../artifacts/canvas-edge-interaction-current-source-snapshot.json) SHA `cd26ce18e869346eb80553b6bd4d3d9f149a26e46a545d762fbf7770dfcd6aca`，逐文件复核一致；相对1161基线为10新增／14修改／0删除。native捕获时的 [历史manifest](../artifacts/canvas-edge-interaction-before-studio-monitor-budget-source-snapshot.json) SHA为aa9126，与此最终freeze仅Monitor／ScriptEntry两个旧测试修改，生产源码完全相同。冻结native proof里的当时current-manifest路径应按aa9126查这份保留副本，不当作今天cd26ce18；不改冻结native proof或拿旧dist代替。

独立 [最终构建proof](../artifacts/canvas-edge-interaction-final-build-proof.json) 45项断言全部通过：实际Canvas741368字节／gzip246320，静态closure37、direct static34、9条dynamic记录，四实现为literal direct dynamic且零静态泄漏。旧CanvasCSS207280与Generic3383全字节SHA保持；原31份源CSS的8／23顺序、main5 eager与package／lock／Vite／900000预算未改。EntryCSS156600包含全部22个scoped selectors与两个keyframes；两个复用的旧公共selector原已在未改CanvasCSS中，20个新selector无泄漏，不错误要求旧公共selector从旧CSS消失。真实运行、source和Vite/tooling／lock版本分别核对，不靠文件名推断分包。proof83856字节，SHA `896106801133f5432e2ff93b909b6ccb914204ea198b3f02932eb8ebed49ac17`，无另一次build来源。

## 原生浏览器与完整 GUI 文件

[独立 native proof](../artifacts/canvas-edge-interaction-native-proof.json) 的14份实际GUI下载做21项完整文档断言与13项已记录UI检查；21证据文件包含14份libtv JSON、6份实际JPEG和1份metadata，逐文件SHA核对。只通过实际toolbar、file chooser、端口拖动、鼠标和键盘操作自建项目，没有注入 graph／storage／events，也没改用户原项目。两张已存代表图实际FileReader导入，创建视频目标及两条普通引用边；prompt为空，因此此处不冒充末次非空token原生清理证明。

桌面实际CSS1422×800：约8px离开可见曲线的点击仍选择线；native Space激活剪刀仅删第一边、保3节点／第二边／view和其他所有字段，只给target typed lists补余下source。一次undo恢复完整before。Ctrl／Meta叠加、局部Escape、Shift Enter叠加、Enter替换、普通节点释放选择及Shift节点混选有实际操作；hand仅平移view +60／+35，最后源码再验+20／+10，graph全字段不变。50%和10%各有成功原生命中／悬停，10%剪刀约4.799px，未宣称固定20px命中或手感完成。

窄屏实际CSS390×844、scrollWidth390，fit约29.54%；原生点击断线，一次undo等于窄屏before、一次redo等于after、冷刷新仍等于after。实际窄屏JPEG位图433×938，与CSS尺寸分开，不推测DPR。viewport已恢复用户原值。只读本机share标签在默认1422×800实测keyboard／pointer选线，hover超过1000ms仍无剪刀；没有把它算作390px只读或服务器分享。两页本批native warn／error均为空，与jsdom未实现媒体／Node弃用通知分开。

保留真实未成功尝试：image→image不支持组合；首次edge midpoint被节点遮挡、首hand drag被浮层挡住；observe后选择无遮挡的实际路径位置。covered hand前后完整文件相同，而非记成功平移。导出第一次只打开类型弹窗后误等download超时，恢复后实际选择“画布文件”下载；HMR关闭share后一次复制locator未匹配，重新打开真实入口后成功。不把这些工具等待当作性能验收。

![最终本机桌面连线状态](../artifacts/canvas-edge-interaction-native-final.jpg)

## 尚未完成

源selected-edge Delete、混合删除分段／聚合确认、VIDEO_CLIP async mD与真实锁／授权、全部特殊renderer、React Flow等价虚拟化及大图FPS继续另验。legacy warning、editing及末次非空输入主要由实际App回归覆盖，不扩大为本批普通3节点原生样本的能力。真实手机触摸、持续Space组合拖动、Safari、高DPR和跨设备仍未实测；本机分享不等于服务器服务。Core strict非全部JSX，远端CI未执行。当前全站进度继续采用 [约70%工程估算](./coverage.md#当前复刻进度估算2026-10-14)，不用新增测试数或独立影游上调。

下一批的 [selected／mixed源审计](./canvas-selected-delete-source-audit.md) 与 [15文件／93摘录proof](../artifacts/canvas-selected-delete-source-proof.json) 已冻结并再独立核对SHA与三坐标。它区分RF初始node确认、edge callback先于node、普通先提交和单次关联warning、取消不rollback早期phase、confirmed flags绕过clip与第二确认，以及history微任务不立即finalize。这些是下一步实现依据，未据此标记selected／mixed已接入；原生行为与异步完成顺序仍须各自验收。

维护后的 [post-doc proof](../artifacts/canvas-edge-interaction-post-doc-proof.json) 只复核9份维护文档的本地文件链接、1171冻结SHA、45项构建断言的实际资产及21份native证据SHA；没有重复测试或构建。链接检查不代表远端URL／全部heading fragment已验，output下一批纯草稿不计入本批源码或运行功能。
