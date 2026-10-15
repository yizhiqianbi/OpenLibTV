# 普通节点与真实组 Alt 拖动复制验收（2026-10-11）

本批针对用户“节点交互不够流畅自然”的反馈，继续节点选择、拖动、复制和中断的维护。当前无需登录，也不使用原站账号或写服务。原站源码协议见 [单节点复制源码审计](./canvas-node-alt-copy-source-audit.md)，此前虚拟框、组输出与菜单焦点见 [组与选区验收](./canvas-group-selection-functional-audit.md)。

## 实现边界

- 普通节点、组内单节点、真实组以及已选多选成员使用同一个 Pointer owner；纯 `resolveCanvasNodeDragCopyMode` 区分 single / selection，Graph `createDragCopy` 根据明确 copyMode 调用对应纯计划。
- 单独复制组内孩子不扩张成父组与兄弟，以世界坐标脱离 group-like parent；复制真实组维持完整本地嵌套树、父子相对坐标、childNodeIds 和引用重映射。空组不因按 Alt 自动产生副本。
- single 没有 Ctrl / Meta 时清外部生成引用；同时携键时保留上游引用和输入边，输出边不复制。selection 保留原有外部引用规则，内部边映射到副本。节点 guide/task 和组专属尺寸的清理由精确源条件控制。
- 本机超过 4 屏幕 px 才进入拖动，不为微小点击写历史；原站默认 1px。普通节点按首次越阈值的修饰键决定操作，虚拟框保持 pointerdown 意图。确定后再松开修饰键不会中途改变复制或连线协议。
- 原件保持位置；副本立即接续拖动，pointerup 使用实际末位。复制、边与位置在一次撤销中恢复，redo 恢复整次操作。复制选区扩展导致原虚拟框卸载时，稳定 board capture 保持 owner。普通按下先持 node capture，首次确认复制后在事务前转交；只在新 board 仍持 capture 时忽略旧 surface 的 lostcapture，真实 board 丢失仍取消。
- Escape、pointercancel、lost capture、blur、hidden、文档切换、只读或失去 ready 终止旧手势，停止迟到坐标写入；取消不会回滚已提交副本，保留一条历史。这是本机取消策略。兼容 click 不得重新选择原件；新一次 pointerdown 可正常操作。
- Graph 先投影尚未提交的 source prompt，再 clone，最终对原 graph 做同步 CAS，一次写节点/边并保存一次 history。失败不移动原件或部分写入；未知 copyMode 和不合法 single sourceIds 直接拒绝。

## 发现与修正

原站 React Flow 的 onNodeDragStart 在选择更新后执行；本机节点 pointerdown 的正常选择结果用于起拖，未选中的普通节点能够立即复制。原站 Shift/Control/Meta 的 key-state 按键顺序影响 selection，本机仍保留现有 Shift 显式多选、Alt+Ctrl/Meta 专用于复制输入的清楚操作策略；未声称完整复刻 RF 多修饰键状态机。

浏览器实际组件发现：首次选中含参考媒体的视频生成器时，`useNodeGenerator` 会根据 incoming 引用更新当前 mode，导致 pointerdown 记录的原 graph identity 过时，复制被 CAS 拒绝。已加入实际 NodeCanvas 集成回归，将普通节点事务身份获取移到真正起拖处；读取最新节点/参数，不覆盖初始化结果。虚拟框仍保留其 pointerdown 协议。

原生 click 目标由 capture 决定；审查指出普通按下直接持 board 可能改变节点双击。已恢复 node capture 并只在复制确认后转交，不通过修改原有普通点击断言掩盖协议变化。1280px原生文本标题双击已确认进入 `.cv-settings` 正文属性，空白创建菜单未出现。

## 验证

最终 `npm run check` **228文件 / 1995项测试全过**：格式、零警告 ESLint / 架构边界、核心 strict TypeScript 与生产构建，21:07:06开始、测试52.70s、构建10.31s，exit0。日志 `artifacts/canvas-node-alt-final-check.log`。strict不覆盖全部JSX，CI未远端运行。相关Pointer114、pure model55、Graph20、actualNodeCanvas.multi31、actualNodeCanvas.interaction7联合227项通过；触摸接管/卸载与普通操作的4文件81项另验，不能把重叠定向统计相加当总测试数。

最终 QA 在实际画布所在文档的测试按钮正常按下期间，通过明确合成 PointerEvent 驱动生产 handler，以有效 native pointer ID 核对 node→board capture 可转交：未选视频含媒体输入复制为8节点/4边，prompt / imageList / textList保留；独立图为9节点、组内图为9节点（world190/155且无parent）、整组为12节点（group150/105与完整4-node树），每次一次undo回8节点。它仍不是原生按住Alt持续拖动；键盘修饰、移动和松手是合成事件，未称为真机验证。

标准实际路由原生1280×720：副本标题继续拖动，105→461.271；一次undo105、redo461.271，刷新保留位置及两份提示词。原生文本标题双击进入真实 `.cv-settings` 正文属性，不误开空白add菜单。390×844：当前活跃标签页原生拖动副本1070/461.271→1015.22/862.957，一次undo / redo及刷新保留；实际document.scrollWidth=390。较早非活跃标签页的输入未命中，改为独立当前标签页复验，不将它当交互通过。

最终截图：`artifacts/penstudio-node-alt-desktop-proof.jpg`（1280×720）与 `artifacts/penstudio-node-alt-mobile-proof.jpg`（390×844）。详细原文见 [验证历史](./verification-history.md#普通节点与真实组拖动复制2026-10-11)。只写独立本机验收项目，不覆盖用户已有项目。

## 剩余范围

完整 RF 多修饰键 selection 状态机、原生按住 Alt 的持续拖动、框体 autoPan/高级 drop、完整特殊节点 renderer、真实触屏/Safari、大量节点性能和运营写服务仍需另验。整个全站复刻目标仍未完成。
