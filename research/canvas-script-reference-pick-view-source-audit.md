# ScriptV2 参考选择视图核对（2026-10-12）

## 证据范围

仅静态读取已归档公开客户端，不执行原站脚本、遥测或账号写入。此记录覆盖参考模式提示条与节点内容遮罩；候选、连线、框选、退出、文档身份与保存由上层 controller / domain 维护。它不证明原生浏览器手感、真实资产账号权限或服务器上传已验收。

- `research/source/21_0xvlvkw1sz.js`，`nf` 约字符 157806：通用模式提示条。蓝色分支使用 `#1F6DFF`、绝对 `left:50%` / `top:12+noticeHeight`、水平中心定位、gap16 / padding12 / radius16；Crosshair16 在 32×32 的白20%背景内。标题 font14 / semibold / line14；返回按钮高32 / px12 / font13；关闭按钮 32×32、Close12。提示条不是 modal，不拥有 body 滚动锁。
- 同一 chunk `iM` 约字符 286098：参考模式 caller 传 `referencePickModeTitle`、`markModeReturnToNode`、`exit`；返回对目标节点中心使用当前 zoom、400ms，再退出。该 viewport / exit 行为留给 controller，不在 view 重建第二份。
- `research/source/pages/canvas-rows.json` 的 locale：`referencePickModeTitle = 从画布或资产管理选择参考`、`markModeReturnToNode = 返回节点`、`exit = 退出`、`referencePickSelectNode = 选择 {name}`、`deselectAll = 取消选择`。
- `research/source/3u6hjewm8qox_.js`，`ea` / node shell 约字符 664xxx–667xxx：已连接遮罩为 absolute inset0 / z40 / black45% / radius12 / pointer-events:none，中心取消按钮为 black70% / pill / px12 / py6 / font12 / medium，hover black85%；按钮缩放 `zoom>0 ? 1/zoom : 1`，150ms opacity / background 过渡。该遮罩位于内容 surface 内，generator 在 surface 外。
- `research/source/0arvpunlk99j2.css`，约字符 11349：不可用节点罩 z50 / pointer-events:auto / not-allowed / black50%；`limit` 原因保持透明。可选节点 hover brightness1.05、内容 surface 蓝色2px环；连接节点 hover 使断开按钮 opacity1。
- `research/source/3u6hjewm8qox_.js`，约字符 793126：组仅有可选时的透明 `ref-pick-group-surface` / absolute inset0 / z10；原 CSS radius20，hover 蓝色2px。非可选组不新增黑罩覆盖孩子。

## 实现与调用约定

`components/CanvasReferencePickBar.jsx` 只协调按钮回调及阻止按钮事件进入画布手势。API 为 `{active=true,onReturnToTarget,onExit,disabled=false,top=12}`。不自行绑定 Escape、选择目标、改变 zoom 或锁滚动；caller 传 `top` 可表达 notice inset。

`components/CanvasReferencePickMask.jsx` API 为 `{state,blockReason,onPick,onDisconnect,label,group=false,disabled=false,zoom=1}`。`label` 是候选节点名；可选按钮采用源“选择 {name}”，连接按钮保持“取消选择”。`self` / 未计算状态无罩；普通 blocked、pickable、connected 各自使用原层级；group 只有 pickable 返回 z10 的透明层。调用方将其置于节点 feedback-body 内，afterContent / generator 留在该 surface 外。每个动作阻止 pointer / click / double-click 进入普通节点拖动、选择或编辑，Space / Enter 保持原生 button 激活且不触发画布快捷键。

`CanvasReferencePickBar.css` 为视图唯一样式，两处 import 由构建去重，全部规则采用本域前缀。保留源间距、颜色、层级、环和反 zoom；仅 `.cv-reference-pick-active` 内的边线使用源 opacity15% / pointer-events:none。键盘断开按钮 focus-visible 时显现；按钮与关闭动作可用键盘到达。无账号、写服务或 I/O 依赖。

## 明确适配与边界

- 关闭 aria 从源“退出”扩为“退出参考选择”，可见图标与 title 保持“退出”；当前中文产品没有新增语言切换协议。
- <=600px 提示条采用 max-width / 文案折行，避免源横排在窄屏溢出；这属于本地窄屏适配，不称为原站手机已验。
- 源依赖 node-shell 属性 / CSS pseudo-element 的 hit 层，本地改为真实 button / div 的内容遮罩，便于键盘到达并隔离普通拖动；候选语义由原 domain 决定，不由 UI 猜测。
- 对 NaN / Infinity / 非正 zoom 使用 scale1；source 数学分支只核实正数 / 非正数，额外非有限值保护属本地防御。
- reduced-motion 禁用该视图 transition，不新增原动画。
- 实际模式关闭、返回400ms、源 group 点击递归、框选、取消 / 部分成功、Quota 重试与迟到文档结果由 Root 接线验收；该两视图单测不能代替这些能力。

## 定向验证

Node24.19.0：两文件18项测试通过（15:55:27，626ms）。检查源文案、真实键盘按钮激活 / 事件隔离、disabled / inactive、self / 未计算 / group 语义、不同黑罩与透明 limit、z10/40/50、反 zoom 及非法 zoom、screen-space bar 样式和非 modal / 无滚动锁，以及边线仅在参考模式内变暗 / 禁止命中并在退出后恢复。首次有1项 computed-style 断言失败（JS DOM 将 inset0 序列化为 `0px`），仅修正测试预期，未改生产规则。该失败与正式结果已向 Root 交代，未当原生截图或 GPU 证据。

新增 JSX 与测试定向 ESLint 零警告；新增五个文件定向 Prettier。整体工作区 check、Root 完整模式接线与原生浏览器验证由 Root 后续记录。
