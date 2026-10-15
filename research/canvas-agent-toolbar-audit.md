# Canvas Agent 模型入口与生成模式

本批只读取已归档公开源码和配置，没有登录、账号请求、原站写入、积分消费或额外全量采集。真实浏览器接线验收由根代理负责；以下测试不是登录态浏览器验收。

## 原始证据与语义

- `research/source/30n77u5aq5ebb.pretty.js`，module 436146（约 341–646 行）：`ChatModelSelectHoverCard`。这是模型**插入入口**，每次回调 `{modelKey,label,modality,description,icon}`。公共 PromptComposer 调用 `insertModelInlineTag`，不是单模型选中器。
- `research/source/0k8_vz_bdp_zz.js`，Canvas 输入调用：模型入口 `trigger="click"` 并调用当前 RichInput 的 `insertModelInlineTag`；生成模式独立 `trigger="click"`、`entrySource="canvas_chat_input"`，省略 scope 即 `session`。原按钮都是 32px，图标 16px。
- `research/source/30n77u5aq5ebb.pretty.js`，module 754760（约 670–840 行）：`ChatModeSelectHoverCard`。手动 `dryRun=true`，文案“{agent} 每次生成前询问”；自动 `dryRun=false`，文案“{agent} 可直接消耗积分”。Canvas 是当前会话配置；主页/Skill PromptComposer 使用 `userDefault`，两种范围不能混同。
- `research/source/3i02v6kxrkivs.js` / `1bjvolc90roac.js`，modules 907364 / 307525：用户偏好默认 `dryRun=true`；兼容旧 `dryrun`。有效配置按用户默认 → 会话 `libtvMeta.extra.dryRunIntent` → 当前会话本地 override 解析；未建会话为默认 → draft。发送 metadata 为 `{dryRunIntent,scriptModel?}`，不是新增/替换某个 prompt model part。
- 同 module 的原 `userDefault` store 对写入使用 optimistic 值、saving 门控和失败回滚；本批没有调用其生产接口。mode 控件是受控 UI，保存、错误和回滚由注入的调用方负责，Canvas 接线仅本地 session 配置。
- modules 255534、975505、112671、398470（分别见 `04q9x43g2p9-v.js`、`0utjet5hna_yu.js`、`1rv59p7e0j_cs.js`、`1_out2157t_i3.js`）：禁用来自 support model 的 `disable` boolean / 非空 string / 非空语言对象，语言回退 en。VIP 图标不能推断禁用或授权。权益来自实际 benefit records，第一条匹配优先；Seedance 720P 两个 targetKey 有独立 fallback；freeTimes 是嵌套 `{totalTimes,usedTimes}`。
- `research/source/0-px891fumwca.js`，module 629706：click 弹层外部 scroll / wheel / focusin 关闭，内部滚动保留。资产入口 offset 6px、hover closeDelay 400ms；模型与模式 offset 8px、openDelay 80ms、closeDelay 200ms。
- `research/source/api/config-182.json` 与 `config-311.json`：support catalogue / Agent allowlist。既有 `CHAT_MODEL_CATALOGUE` 保存实际过滤后的 9 图片 + 8 视频候选；本批不扩展、不虚构模型。
- `research/source/libtv.json` 与 `3cc4i9j9c1y82.js`：工具栏手动/自动/模型、加号、对勾、会员和图片图标。只保存必要原 SVG 子集。

## 页面与交互实现

- 模型面板 370px、最高 384px、padding 16px、上方 8px、z-index 1100；真实 CSS `radius-2xl=16px`、`Surface-Panel-background=#171717`、0.5px 白色 12% 边框、`panel-transparent-shadow=0 4px 10px #0000001a`。
- 标题“选择模型”，图片/视频 tabs；两组始终存在。tab 点击滚动到对应 section，不过滤另一组、不根据滚动猜选中分类。当前 tab 按原组件状态保留。
- 分组 sticky 标题、57px 模型行、36px 背景图标容器、18px 图标、名称/两行描述、VIP 装饰、真实权益 pill 与提示、右侧 16px 加号容器。禁用模型不可插入；显示实际语言禁用原因。
- 选择模型关闭菜单，回调原 pick；调用方转换为独立合法 model reference 并在 RichInput 光标处插入。没有 `selectedModel`、没有从第一个 inline 模型推导“自动”标签。
- 模式面板 240px、padding 6px、两行 16px 原图标、标签/解释、当前值对勾。它只回调 boolean，不改 ordered parts。
- 非 modal 菜单不锁 body、不制造焦点陷阱。Escape 恢复 trigger；外部 pointer/focus/scroll 关闭保留新焦点。键盘箭头可打开并进入首个可用按钮。portal、计时器、ResizeObserver、RAF、事件订阅随关闭/卸载清理；回调更新不重新抢焦点。
- 窄视口宽度/位置由共享定位规则限制到视口内；不是源站账号态逐像素验证。tooltip 会根据剩余空间翻转并显示原始原因/权益文字。

## 文件与依赖方向

- `src/features/canvas/agent-toolbar/CanvasModelPicker.jsx`、`CanvasAgentModePicker.jsx`、`ToolbarIcon.jsx`、`ToolbarTooltip.jsx`、`toolbar.css`、`toolbar-icons.json`：本域 UI。
- `src/hooks/useAgentToolbarPopover.js`：共享浮层生命周期，只有 React/DOM 依赖，资产入口也可复用；不引用 Canvas 内部 store。
- `src/services/agent-toolbar-models.js`：模型目录/禁用/权益和 pick 转 reference 纯规则。
- `src/services/agent-mode-config.js`：旧 key 正规化、dryRun 优先级、metadata 纯规则。可保留调用方已验证 scriptModel；**它不加载或冒充原站 script-model 权限目录**，验证该字段仍是未来配置 adapter 的职责。
- 两个 feature 控件只依赖共享 hook/services 和本域 UI。没有扩大工程白名单，没有修改 CanvasAgentPanel、NodeCanvas、root 文档、原账号 store 或生成服务。

## 接线 API

```jsx
<CanvasModelPicker
  onSelect={(pick) => inputRef.current?.insertReference(chatModelPickReference(pick))}
  models={CHAT_MODEL_CATALOGUE}
  asset={asset}
  disabled={readOnly}
/>
<CanvasAgentModePicker
  dryRun={agentConfig.dryRun}
  agentName="TV Director"
  onSelect={(dryRun) => updateAgentConfig({ ...agentConfig, dryRun })}
  disabled={readOnly}
/>
```

`CanvasModelPicker` 可注入 `allowlist`、真实 `benefits`、`onRefreshBenefits` 和 `language`。没有真实 account records 时不显示假权益；注入的异步刷新 callback 应自行处理请求错误。`CanvasAgentModePicker` 可接 `scope="userDefault"` / `saving`，受控 caller 须负责持久化及失败回滚，不可只把 UI 点选当生产保存成功。

`resolveAgentModeConfig({preference=true,sessionExtra,override,draft,sessionId})`：有 `sessionId` 使用 metadata+override，否则使用 draft。`preference` 可为 boolean 或配置对象；legacy dryrun 支持。`buildAgentModeMetadata(config)` 输出发送的 `{dryRunIntent,scriptModel?}`，不改 prompt parts。

`useAgentToolbarPopover({width=370,maxHeight=384,offset=8,openDelay=80,closeDelay=200,closeOnOutsideScroll=true,trigger='click',disabled=false,onOpen,onClose})` 返回 `{open,triggerRef,popoverRef,popoverStyle,triggerProps,popoverProps,close,openPopover,toggle}`。`close({restoreFocus=false})`；Escape 内部使用 true；outside 关闭使用 false。

## 定向验证与边界

2026-10-11，本批 4 个测试文件 **17 项通过**，包含完整真实 catalogue、allowlist 与去重、禁用语言回退/VIP 非授权、权益 first-match/720P/freeTimes、metadata 优先级、多 model codec、真实 TipTap 光标插入/逐项删除/撤销且模式不改变 parts、tab 仅滚动、pending preference guard、Escape 最新 callback/回焦点、外部与内部滚动区别、window scroll target、hover 计时器取消、键盘打开与窄视口位置。Scoped ESLint（含依赖边界）零 warning；Prettier 已格式化。统一全站检查由根代理继续完成。

未声称已完成原站登录态、真实用户 preference GET/PATCH、benefits 同步/权益授权、自动消耗积分、scriptModel 目录权限或所有 menu 的像素验收。当前 Canvas session 配置由根代理本地保存并携带 metadata；生成服务未接入时仍按既有明确不可用状态呈现。模型插入和生成模式属于两个独立协议。

## Root 接线与浏览器验收

CanvasAgentPanel 已接两套控件，模型 pick 转合法 reference 后插入当前光标；mode 为独立受控 boolean。NodeCanvas 按纯协议解析默认/metadata/override，将 agentConfig 随文档保存、复制、分享、导出，发送 metadata 携带 dryRunIntent，不改变 parts；Canvas 会话模式不反写用户默认。实际回归包含多个模型的光标插入和模式不改变 parts、切文档隔离、刷新恢复和保存 metadata。

本地浏览器看到17项候选；切自动生成后 reload 保持。390px 模型面板 x8/宽370/高384/右378，页面无横向溢出。图像证据 artifacts/canvas-toolbar-live-proof.jpg；全站107文件549项检查通过，完整范围见 coverage。真实 session PATCH、用户 preference/benefits 与生成仍未接入。
