# 节点生成面板避让与参考草稿验收

2026-10-13。本批继续用户“节点交互不够流畅自然”的优化，保留原站页面、节点和控件样式，内容仍用代表样本。本机改动未部署，不改独立影游生产，不要求登录或小号。整个复刻目标仍未完成。

## 原站证据与明确适配

普通 IMAGE／VIDEO／AUDIO 与 ScriptV2 实际 caller 共用 source Wrapper 976401：收起卡片固定在节点下方，逆画布 zoom；展开才 body portal、默认800×600与max90vw／90dvh。Wrapper 与 ScaledOverlay 完整模块没有纵向flip、整卡滚动或打开时自动pan。13份源文件SHA、23处精确摘录与偏移见 [源码审计](./canvas-generator-vertical-view-source-audit.md) 和 [proof](../artifacts/canvas-generator-vertical-view-source-proof.json)。这限对应局部调用链，不声称原站全部上游都不存在其他定位。源实际持久化字段为expandedGeneratorWidth／Height；普通本机generatorExpandedSize是映射，历史混写已纠正。

旧本机1280×720默认VIDEO body top385／bottom615，面板top631／height221.5，使底栏超出屏幕。Root此次真实操作还观察到above卡片遮住title，以及390px下原left20／width350卡片被left工具栏x9..55覆盖。纵向翻转、标题避让、固定工具栏列预留及短视口整卡滚动是用户授权的可达性优化，不能冒称原站新的pixel协议。

## 实现和维护边界

`generator/inline-placement-model.js`持纯横向兼容规则与纵向计划。优先原下方完整位置，再完整上方；两侧均不足选较大可用侧限高；两侧均小于80时docked在可见区域，明确允许覆盖节点。非法／不可测输入保旧位置，不猜节点自然资源尺寸。

`useGeneratorSurfacePlacement`统一实际卡片、board、匹配ID的article、title和左工具栏测量。实际宽度除以`canvasNodeSize`取得正在显示的liveScale，含显式content dimensions；node世界位置由caller提供，不重复累计group。自然高度用scrollHeight+边框／offsetHeight／明确loading最小80的最大值，限高后不能拿clientHeight当新自然高度。board与visualViewport取交集，顶留min20与下留min60（极短屏按height/4）；左工具栏实际正尺寸且与viewport相交时，left至少toolbar.right+20，右仍留20。无toolbar保持旧20边距，最大宽660。

普通媒体gap始终16screen px；Script gap为16world，动画中乘实际liveScale。只在world transform transition期间持owned RAF，end／cancel／hidden／卸载取消；平时用layout、RO、resize与外部scroll。owner显式携带doc／node／board／surface／enabled；旧observer、RAF与A→B→A均不可发布。所有定位仅写React几何状态，不写nodes／edges／view／selection／prompt或history。

Generic／ScriptV2／Entry加载错误态共用这一hook。`GeneratorLoadState`实际挂载持hook，render boundary异常也正常测量；不能按已加载模块result猜是否需要fallback。Frame展开停止inline生命周期，沿用唯一dialog-stack与原尺寸保存，收起重新测量。CanvasNode的afterContent永久放article内作为tilt shell的兄弟，输入不继承接线3D倾斜；不是手势期间重挂载输入或取消节点反馈。

## 参考排序与末次草稿

实际App确认VIDEO的150ms draft可与保存baseline碰撞：A=Image1，刚输入B=Image2，再把第二素材排到首位；排序后正确新正文A会被旧B投影回写，改变引用绑定。事务对latest prompt先清孤立Magic，历史基线保最后输入；next目标显式跳过旧普通draft投影，成功CAS后Inline重读真实当前正文并`acceptCommittedValue`，取消旧timer／消费DOM值，不另写onChange或history。拒绝／竞争／退休owner保草稿，零额外历史。

本轮同时追完IMAGE eL→Core→store→renderer／incoming链，纠正旧合并判断：**IMAGE only-order仅改当前typed顺序并保literal prompt，VIDEO按稳定素材身份重映射token**。store确有ig重算，但IMAGE排序updateNodeData不调用；deleteEdges／recalc是另一入口，不能泛化删除也保原文。此次未扩大delete／connect规则。完整链、修前真失败与夹具失败分开保存在 [事务审计](./canvas-reference-draft-transaction-audit.md)。正向测试不等于所有原站删除／协作语义已核完。

## 检查与实际浏览器

官方Node24.19.0正式`npm run check` session54671 terminal exit0：375文件／5108测试，02:40:44／137.85s；格式、零警告lint／架构边界、核心strict及build12.87s通过，3566模块。日志 [final-check](../artifacts/canvas-generator-vertical-final-check.log)。1129源码/config/tests冻结SHA与真实构建、lazy/CSS/900000阈值见 [final-build-proof](../artifacts/canvas-generator-vertical-final-build-proof.json)。统计较旧370／4991增加5文件117项，包含既有Studio及独立影游；strict非全部JSX、CI未远端执行，DEP0129提示保留。

专项纯计划62+旧横向8、真实hook17、真实Entry/Frame新增17、feedback实际App／view联合17均通过。最终owner整理后hook／Entry联合34项于02:39:58／1.36s通过，日志 [owner tests](../artifacts/canvas-generator-placement-final-owner-tests.log)；旧agent日志冻结SHA不冒充Root后续owner源码。IMAGE／VIDEO排序、完整图／badge／150ms／pagehide／一次undo-redo与失败owner联合5文件37项通过。具体夹具边界与旧失败见各专项审计，没有弱化旧草稿、全图和历史断言。

Root只通过后台本机UI创建节点、输入、拖动、缩放、开关、Escape及GUI导出，未向页面注入graph／storage／事件或正向服务。1280×720默认VIDEO保持view245,195,z1，面板above x485／y111／660×221.5，title349..384与面板底332.5分开；无手动pan才到达输入。390×844卡片x75..370、width295，每个button／select／editable中心真实elementFromPoint命中自身；320×240整卡125.5高、scrollTop0→168，滚动后模型／mode／参数／生成均可达，参数portal可打开且Escape回触发器。视口覆盖恢复默认。

尺寸变化、面板滚动、参数开关前后两份GUI整文档deepEqual，节点、边、view和所有其他字段一致，文件 [before](../artifacts/canvas-generator-vertical-native-before.libtv)／[after resize](../artifacts/canvas-generator-vertical-native-after-resize.libtv)。输入后展开／Escape回expand trigger、inert解除；80%缩放卡片仍宽660。真实拖动VIDEO到body400,170时面板回below416..637.5，undo回640,385及原草稿。IMAGE／VIDEO普通拖连与一次undo后重建只有一条边，selectedVIDEO与prompt保留，card直属article且没有tilt祖先；原生释放结果与受控持续feedback测试分开，不宣称持续GPU矩阵任意宿主已验。

ScriptV2真实入口1280与390卡片均above，390为x75..370／height173.5，全部控件中心可命中；翻译／生成禁用仍按现有能力，不造服务成功。上述native几何、截图及冷加载范围由 [浏览器proof](../artifacts/canvas-generator-vertical-native-final-proof.json)保存；group／显式natural content geometry、loading/error和动画中间帧主要是受控DOM回归，不冒充全部原生／手机验证。

## 剩余范围

未新验真实手机软键盘／pinch、Safari／高DPR、极小到无法容纳一行控件的视口、任意3D／滚动宿主、超大图和所有特殊renderer。普通参考删除完整source store契约继续核对；角色真人组／签署／QR、历史图库／主体等前端缺口仍在原审计。生成、费用、授权、上传和运营写服务继续未接。1129快照后只有维护文档／proof变化，后续生产修改须重新检查；当前成果不代表全站perfect或线上已更新。
