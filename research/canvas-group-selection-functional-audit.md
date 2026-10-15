# 普通组输出与虚拟选区复制验收（2026-10-11）

本批继续处理用户的“节点交互不流畅自然”反馈。当前版本仍是 PenStudio 本地工作区，无需登录、注册、小号或真实账号。内容使用代表性公开样本；不向原站发送生成、付款或写入请求，整个复刻目标仍未完成。

## 当前实际接线

普通真实组与虚拟多选复用独立多源连接 controller，但入口由 `domain/multi-connection-entry-model.js` 区分。真实组在壳右中点显示固定屏幕大小的加号，不多画虚拟外框、不套虚拟 padding。来源是递归非组/non-reference 叶子，可只有一个叶子；无 action 不在入口阶段过滤，真正生成资格由既有 resolver 处理。脚本派生与确证分镜壳使用同一纯 predicate 排除，characterAsset 不擅自当作禁用条件。

`useCanvasMultiConnection` 的文档 owner 同时绑定 entryKey、entryNodeId、来源顺序、递归 parent membership 和精确焦点 selector。组删除、换组、同源换入口、孩子迁移、A→B→A、ready/readonly 及卸载都会使旧事件失效。按钮 attribute 使用编码后的入口身份，Escape 回对应入口；外部 pointer/focus 关闭继续保留新焦点。

虚拟选区 Alt / Option 拖动在超过本机4px阈值后创建一次副本，原件不动，运动作用于副本。Alt 默认不复制边；在按下时同时有 Ctrl / Meta，则携内部边及外部上游输入边，不复制向外部下游的边。修饰键固定在 pointerdown，移动时释放不会改变计划。复制树 remap parent/child IDs、已知 data references，并按原 helper 规范媒体列表顺序。

复制纯计划只返回 additions；`useCanvasGraphActions.createDragCopy` 先验证按下时原始 nodes/edges identity 与当前文档，再投影最新未提交草稿，随后克隆。提交仍用未投影的原图 CAS，复核后追加一次并记录一次历史；Pointer 不额外 record。失败不部分插入、不移动原件。撤销回到包含最新草稿的原图，redo 恢复整个复制结果。

## 原生浏览器验收

使用独立项目 `canvas-group-interaction-proof`，通过正常 QA UI 调用生产保存 API 创建，不覆盖用户项目；画布操作使用原生点击、拖动和 Escape。DOM 读取只用于核对屏幕尺寸、位置、路径、选中状态和焦点，没有通过 evaluate 修改图或浏览器存储。

- 1280×720：普通组包含一个直接图片和嵌套组图片。fit 后102%；组壳右边655.25px，加号命中区80×80、glyph24×24，圆心距壳右边17px。只有真实组选中，无虚拟框。
- 原生拖组加号到视频 body，一次产生两条真实边，原组选择保留；一步 undo 恢复5节点/0边，撤销按钮禁用。
- 原生拖到空白735,590后，预览来源恰为两张图片；中心24px被动圆位于723,578。六项菜单 rect747,447,196,265，右边943、下边712；图仍5节点/0边。预览不进入保存或历史。
- 短按加号再选图片生成，新节点世界位置700,290，输入展示两项真实引用和公开候选模型，原目标输入不变；一次 undo 同时移除新节点和两条边。
- 390×844：fit 后35%，页面 scrollWidth390；真实组仍只有一个80px命中区和24px glyph。原生空白释放后六项菜单 rect186,452.5,196,265，右边382，来源仍为两张图片，没有横向页面溢出。

浏览器初验发现：拖到空白后 Escape 虽关闭菜单，但焦点停 BODY；短按菜单正常。真实页面回归重现 Touch 的取消回调经统一 pointerCancel 再取消 multi controller，使开始时提前分配的 request sequence 失效。已修复为先互斥取消再分配新 request，保持 owner 保护。1280px和390px原生复验焦点均回到 `group%3Agroup-proof`，菜单/预览清空、原组选择保留；真实 NodeCanvas 同链回归通过。最终复验与工程统计见 [验证历史](./verification-history.md#普通组输出与选区复制2026-10-11)。

截图保存到 `artifacts/penstudio-node-group-desktop-proof.jpg` 与 `artifacts/penstudio-node-group-mobile-proof.jpg`。这是浏览器窄屏、鼠标与键盘验收，不是原生手机/Safari触控验收；本批 Alt 的修饰键路径通过真实 NodeCanvas 集成与 Pointer/Graph 回归验证，未将其称为浏览器原生按住 Alt 拖动。

## 源与本机适配

确切原站源码见 [组入口审计](./canvas-group-connection-source-audit.md)、[Alt复制审计](./canvas-selection-copy-source-audit.md) 和 [既有多源协议](./canvas-multi-connection-source-audit.md)。4px起拖为手感调整；原 iF 在按下时即时复制。当前 renderer 的 stored 尺寸优先由 caller 明确注入，与 source measured-first 分开记录。嵌套复制完整子树、防环/坏ID和原子本地CAS是工程适配；取消后已提交完整副本按既有普通拖动保留，不创造未核实的回滚流程。

本批没有完成普通单节点/真实组 Alt 入口、框拖自动平移/高级分层drop、源 live-copy失败的恢复fallback、Group新点提示、完整特殊renderer或协作锁。大量节点性能、真机/Safari、真实生成与运营写服务仍需另验。构建通过、纯 helper 或本地夹具不能当作全站 perfect。

## 最终工程检查

冻结后 `npm run check` exit0：**228个文件、1895项测试全部通过**，包含格式、零警告ESLint/架构边界、核心strict TypeScript、Vitest与生产构建。测试20:37:13开始、50.63s；构建12.94s。日志 `artifacts/canvas-group-selection-final-check.log`。焦点修复后的真实页面/Graph/owner联合回归为3文件93项，20:33:51、3.10s；其余分域定向数字不重复相加。随后仅更新验证文档并独立检查格式；strict没有覆盖全部JSX，GitHub CI尚未远端执行。
