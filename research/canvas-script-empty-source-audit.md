# ScriptV2 空态三动作与 Try hint：source 与本机视图

2026-10-12。本批只静态读取已归档公开 source，不执行 bundle、不使用登录 / 小号、原站写接口或真实生成。本文覆盖 ScriptV2 空态 / pending 的内容视图；节点壳、选择、拖动、preset 建图、异步 owner 与保存由各自 host / controller 所有。

## 证据位置

所有偏移为文件内0-based字符偏移，非行号。

| 归档文件                            |                                  偏移 | 已确认内容                                                                                                    |
| ----------------------------------- | ------------------------------------: | ------------------------------------------------------------------------------------------------------------- |
| `research/source/3u6hjewm8qox_.js`  |           684264–685351，module316925 | 公共 `tl({icon,nodeType,isReadonly,actions})` hint renderer；Try label、layout、按钮、readonly 与受限体验分支 |
| 同文件                              |                         1332047，`sT` | ScriptV2 host 读取节点 / edges / readonly；形态不是只按 rows 空判断                                           |
| 同文件                              |                               1348001 | `eH=empty_generate`、`e$=pending`，按 `eB` 形态选择分支                                                       |
| 同文件                              |                               1385164 | ScriptV2 empty 调用 `nH.default`，90px Text2Icon、三个动作、functionKey 与 callback                           |
| 同文件                              |                               1386629 | pending 独立中心 Text2Icon90，未调用 Try renderer                                                             |
| 同文件                              |           1370304 / 1370813 / 1372080 | 三动作 callbacks `tL` / `t_` / `tO`，preset / 手动语义边界                                                    |
| `research/source/222qgzyc0yyf3.js`  |           29824 / 30158，module244263 | Text2Icon→Icons.ListDetail；TextIcon→Icons.TextFile                                                           |
| `research/source/3cc4i9j9c1y82.js`  | 147879 / 147523 / 136441，module41671 | alignJustify→libtv:text-align-center；user→libtv:perspnal-n；TextFile→libtv:text-file                         |
| `research/source/2ijgtfwpg93os.js`  |       66133 / 176782 / 176832 / 70880 | “尝试：”与三个按钮的中文原文                                                                                  |
| `research/source/1h-b10gcvw4vl.css` |             5354 / 5493 / 5549 / 5633 | neutral50 / 500 / 700 / 950 的实际 token                                                                      |
| 同文件                              |              241050 / 247396 / 249496 | root / canvas-light / dark 的 fg-disabled 等主题映射                                                          |
| 同文件                              |              246187 / 253086 / 679352 | light / dark canvas-controls-hover 与实际 hover utility                                                       |

## 可见结构、尺寸与主题

empty 的外部节点壳为350×350，圆角、背景、border / selected outline、handles、只读全覆盖层仍由 `sT` 负责，不能在内容组件重复插入 node title 或造一套 shell。原 empty 壳背景 `var(--Surface-secondary-background, #262626)`；pending 壳背景 `var(--Surface-Panel-background, #171717)`。本机组件不设置这两种背景。

公共 hint 外层 `flex h-full flex-col items-center justify-center px-6`：全高、垂直居中，水平 padding24。中央 Text2Icon90 使用 `text-fg-disabled`；实际为现有 `/assets/icons/list-detail.svg`，不是 FileText / 文本T图标。非 readonly 时 icon wrapper `mb-4`（16px），readonly 时不加下边距。

hint 容器 w-full。“尝试：”是 `text-fg-muted mb-2 text-sm`，14px / 20px，margin-bottom8。动作容器 `flex flex-col items-start gap-1`，左对齐、gap4。每个按钮：type button、w-fit、flex居中、gap8、rounded-lg8、px12 / py8、text-left、text-sm14 / 20、text-fg-default、hover bg-canvas-controls-hover、transition-colors。未传其它 hint 文案；公共 renderer 的可选 `action.hint` tooltip-like suffix 分支没有在 ScriptV2 caller 使用，因此本批不添加提示后缀或箭头。

dark 实际 tokens：fg-default neutral50 `#f7f7f7`，fg-muted neutral500 `#919191`，fg-disabled neutral700 `#525252`，canvas-controls-hover `#ffffff1a`。canvas-light：fg-default neutral950 `#141414`，fg-muted neutral700 `#525252`，fg-disabled neutral500 `#919191`，hover `#0000000d`。本机先读继承的 source CSS variables，再用上述局部 fallback；支持既有 `.canvas-light` ancestor，不新增 DOM 主题读取或 preference 存储。

按钮顺序与图标如下；各 icon14×14，以 currentColor mask 复用已归档真实 SVG：

| 原文             | functionKey / callback     | 实际 icon 与本地文件                                |
| ---------------- | -------------------------- | --------------------------------------------------- |
| 剧本生成分镜脚本 | scriptToStoryboard / tL    | alignJustify，`/assets/icons/text-align-center.svg` |
| 角色生成分镜脚本 | characterToStoryboard / t_ | user，`/assets/icons/perspnal-n.svg`（原命名如此）  |
| 自己编写分镜脚本 | writeStoryboard / tO       | TextIcon→TextFile，`/assets/icons/text-file.svg`    |

原图标注册证明 alignJustify / user 是 LibTV 自有 icon，不把同名 Lucide defaults 视作等价。TextIcon 也不是 `/assets/icons/icon-text.svg`。

## Readonly、pending 与资格

`tl` 仅在 `!isReadonly && !restrictedForNodeType && actions?.length>0` 时渲染整个 Try / actions 区。readonly **同时隐藏“尝试：”与全部三个按钮**，不显示 disabled 按钮或“服务未连接”替代文案，只保留中央90px图标；source host 另加全壳 readonly mask，内容组件不重复造 mask。

受限体验逻辑 `restrictedExperiencePolicy.active && Set(TEXT,IMAGE,VIDEO,AUDIO).has(nodeType)` 的 Set 不含 SCRIPT_V2，因此不能把 ScriptV2 的三个入口无条件按 active 受限体验隐藏。真实入口的 readonly、ready、document / node owner 仍由 host/controller 判断。

pending 的 source 并不使用 `tl`：独立 `flex h-full items-center justify-center`，只有 Text2Icon90，无24px hint padding、icon mb16、等待文本、edge 计数、Try hint 或动作。即使当前可执行 callback 存在，pending 也不能显示三个入口。

形态优先级沿用独立 card projection：整节点 full task generating / failed（排除 recompute）优先，已有 rows 为 resource，空 rows 且任一 incoming 或 outgoing edge 为 pending，最后 empty_generate。组件不重新按空 rows / task 状态猜形态，也不渲染重型 task skeleton；完整 source 与 task 边界见 [compact 审计](./canvas-script-compact-source-audit.md)。

## 点击、键盘与动作语义

源 hint button 只有 onClick：若有 nodeId 先 reportCanvasNodeHintClick，再 `action.onClick?.()`。本机不运行原站遥测；只把原 functionKey 交给 caller。source 没有阶段 click、默认 open-fullscreen、card click 或自己 await / pending 状态。type button 自带 Tab / Enter / Space 激活；source 未写自定义 keydown 或 preventDefault。

手写 Canvas renderer 为明确事件适配：按钮 pointerdown / mousedown / click / dblclick 停止向节点选择、drag / 双击 owner 冒泡；Space keydown 只 stopPropagation，保留原生按钮激活。Tab 保留默认顺序，Enter 同样保留默认激活。icon、Try label、卡片空白不截断 host drag / 双击，也不执行任何 action。双击按钮不会由本组件额外打开全屏；原生双击包含的两次 click 是否允许修改由 Root 同步 owner 锁负责，view 不冒充 graph 防重入。

三动作的 source 是前端 preset / 手动动作，而非立即真实生成：tL 创建上游文本 preset 并连到脚本；t_ 创建两张原角色 preset 图片、普通连边与 script preset 参数；tO 打开全屏、切 confirm-shots、写一条默认 row / 空 assets / table default view。详情、引用顺序及尺寸由专属 preset model / controller 审计核对；本视图没有 graph、历史、save、fit 或真实生成服务 I/O。点击原“生成”按钮不得通知真实生成完成。

## 本机 API 与明确适配

新增公开组件：

```jsx
<ScriptEmptyCard
  kind="empty_generate" // 或 pending
  readonly={false}
  disabled={false}
  disabledActions={{
    scriptToStoryboard: false,
    characterToStoryboard: false,
    writeStoryboard: false,
  }}
  onAction={(functionKey) => controllerAction(functionKey)}
/>
```

`disabledActions` 为 plain record，只将对应字段 `===true` 视为 disabled。Root 目录加载 / 失败时只阻断依赖 preset 的前两项，手动写入口保持可用；整体 disabled 留给当前文档 / save owner，不能用 catalog loading 禁用所有入口。callback 缺失时三个按钮保留原文与布局但不可用，不伪造可执行函数。pending / readonly 优先隐藏整个动作区。未知 kind 返回 null，防误把 resource / task 分支显示为空态。

source hint 没有 disabled 属性；本机整体 / 逐项门控、disabled opacity.5 / cursor、focus-visible outline 是生命周期 / 无 reader 服务的适配，不能宣称 source 原规则。组件不 await onAction，不持有 task / graph owner、toast 或保存状态，Root 负责同步锁、latest graph、CAS、草稿、一次 history、Quota 已创建后重试保存。外层 `flex:1; width:100%; min-height:0` 适配手写剩余高度，源公共 renderer 只有 h-full；不把该适配混入 source 样式证据。

## 实际验证与剩余边界

正式 Node24，2026-10-12 **05:37:09**，`vitest run src/features/canvas/storyboard/ScriptEmptyCard.test.jsx --maxWorkers=1`：1 file / **15项全部通过**，583ms。定向 JSX / test ESLint `--max-warnings=0` exit0；所属 JSX / CSS / test 与本文 Prettier 检查通过。覆盖中文原文与 functionKey 顺序、各动作调用、caller promise / disabled 状态、目录分项阻断且 manual 可用、readonly / pending 完整隐藏 hint、图标 / 空白交 host、button pointer / mouse / click / dblclick 隔离、Tab / Space / Enter 默认激活、换 callback / 形态 / readonly、真实 SVG 路径与 theme selector、StrictMode 无自动动作及未知形态安全返回。

这些为 jsdom DOM / callback 与静态 CSS selector 证据，不是 CSS 像素、真实浏览器触屏 / 缩放 / focus 或完整 preset 保存流程验收。Root 负责后续 controller / Surface 接线、内容 reader 的加载 / 错误 / 重试、建图 / Quota 保存与完整检查；原生浏览器证据另记。登录、小号、真实生成 / 服务 / 会员权益继续未接，不把三个可见前端入口称为已完成真实生成。
