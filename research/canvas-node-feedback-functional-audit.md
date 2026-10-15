# 节点反馈与临时连接（2026-10-11）

本批继续回应用户“节点交互不流畅自然”。保留原站暗色画布、节点、端口及菜单层次，以源连接光边/倾斜、微型临时端点和锚点追随补足动作反馈；不重设计页面。当前版本继续无需登录/注册/小号，不提交原站写入、生成或消费。

## 直接证据与适配

- [节点反馈源码审计](./canvas-node-connection-feedback-source-audit.md)：`3u6hjewm8qox_.js` 的 useConnection3DTilt、NodeGlow、NodeShell 和直接边规则。候选旋转光边1.2s、perspective800/±8°、入80ms/归400ms、invalid脉冲1.5s及black.35/blur6遮罩。
- [临时连接源码审计](./canvas-connection-ghost-source-audit.md)：`1fn_ozkqd_aiz.js` 的 blank release 临时节点/边、短按无temp、350/100未来创建定位；tiny nominal1×1及border-box后的使用尺寸/handle几何由CSS和库公式推导，尚无原站真实DOM截图佐证。
- source wrapper734301捕获flow anchor，菜单随transform/resize重投影，8px clamp；世界anchor、临时endpoint和未来节点位置是三个协议。
- 本地采用纯投影ghost，而非把temp插入图再在同步/重放过滤；组内世界坐标、尺寸adapter、blur/hidden门控、reduced-motion及窄屏flyout上下布局属于明确本机适配。

## 当前分层与行为

`connection-feedback-model`仅决定blocked/invalid/target及屏幕倾斜；`useCanvasNodeConnectionFeedback`持physical hover、RAF和400ms恢复；装饰view只画光边/遮罩。pointer capture中由connection controller `elementFromPoint`提供真实悬停节点，不能将被捕获起点当目标。

视觉候选与资格分开：起点和双向已有直接边blocked优先；明确规范target invalid才显示脉冲/遮罩，不能把未知body容量提前标非法。reverse input发起仍使用规范target ID，不为视觉改写有向图。

固定article负责world坐标、尺寸和测量；永久surface包title/body/外置handles/actions/inline。glow/Frosted位于body，标题和外置端口不被遮罩。内嵌生成器通过coordinateOrigin保持原世界位置，仍沿原controller、draft projection、dialog-stack及expanded portal。反馈切换不重建输入/media DOM，也不写node transform或history。

`connection-ghost-model`只从有效当前menu投影tiny node和edge；无data-node-id、可交互入口、存储writer或新增timer。blank release有temp，短按只有菜单；source边向temp input，reverse从temp output回origin，reference保留dash。默认尺寸读取顺序保留source measured→stored，本地注入canvasNodeSize，与normalize后的renderer和永久边一致。

菜单在open时捕获世界anchor，screenPosition更新只place，不重新聚焦、重开submenu或替换request。未来创建点独立，短按按源350/100布局；创建/边/默认文本仍由现有graph CAS一次历史提交。失败保留请求；blur/hidden、切文档、ready/readonly、tool、起点删除和卸载取消旧owner。真实窄屏发现公共cv-floating叠加外border，采用复合选择器清除此边框，panel独占1px border，实现实际8px边距。

## 检查与浏览器范围

新增真实NodeCanvas联合10项验证blank release双向、短按无ghost、pagehide保存不含temp、blur/hidden/旧RAF、0坐标一次创建/undo、组内世界定位、外部focus保留草稿、永久输入DOM及未到150ms输入。反馈独立36项、ghost47项、connection40项、menu hook28项、menu view34项与坐标逆变换通过；独立冻结复核13文件/201项无保存或操作阻塞回归。

最终完整检查217文件/1579项、零警告lint、核心strict与生产构建通过（17:46:59，46.11s；build11.52s，exit0）。完整工程检查及日志原文见 [验证历史](./verification-history.md#节点反馈与临时连接2026-10-11)。核心strict不覆盖全部JSX，CI未远端执行；组件/CSSOM验证不等于原站全部像素、权限或服务验收。

独立本地项目 `canvas-connection-proof`，使用三个代表性节点，未覆盖用户项目：

- 原生1280×720 drag从[540,193]到[600,420]后：3真实节点/0边、1ghost/1ghost edge，undo disabled；菜单显示源类型及默认文案。原生滚轮让view Y从-107.742到-395.742，菜单Y从416到132，文本focus保留；前者曾含旧公共外border，最终清边框后另截图。
- 点击文本同时得到4节点/1边、temp归零；一次undo回3/0且undo disabled。Escape取消后回连接端口，board.scrollTop=0。实际视频inline为660px，输入“沿海岸缓慢推进，保留输入”，开关source菜单后输入保留，并通过独立刷新恢复。
- 原生390×844适应画布43%，blank release有temp；最终menu x162/y540/width220/right382/bottom836，submenu x162/y663/width220/right382/bottom749，页面scrollWidth390。两次Escape逐层关闭、temp归零、3/0图不变并回连接端口。
- 持续反馈的GPU图由忽略目录中的明确QA控制按钮派发合成PointerEvent，通过真实生产handler/Viewport/CanvasNode渲染。候选视频shell实际rotateX2.4°/rotateY4°，matrix3d存在、glow animation1.2s；拒绝video→image显示gray preview、invalid pulse、body blur6及600ms“无法连接”，标题/端口不遮盖。截图是真实渲染，但不能称为原生持续按住拖动或真机验证。QA未通过evaluate写React、storage或伪造反馈DOM。

截图：`artifacts/penstudio-node-feedback-desktop-proof.jpg`、`penstudio-node-feedback-mobile-proof.jpg`为原生释放；`penstudio-node-feedback-glow-proof.jpg`、`penstudio-node-feedback-invalid-proof.jpg`为上述合成事件持续GPU图。各文件尺寸、检查时间、最终日志与tab清理见验证历史。

## 继续保留的差距

原站tiny实际DOM、普通/特殊renderer全部状态、多选发起连接、完整团队锁/主体/权益边metadata、所有工具快捷键和大量节点性能尚未全面核对。真手机UA/Safari/native pinch、原生持续pointer的GPU动画仍需独立验收。真实生成、上传、费用和运营服务继续未接，整个复刻目标未完成。

后续2026-10-11已接虚拟多选外框/锚定toolbar、独立多源预览/六项创建和一次共享target，详见 [多选交互验收](./canvas-multi-selection-functional-audit.md)。上文“多选发起仍缺”为历史批次范围；真实普通组完整入口及特殊renderer仍按新审计保留差距。
