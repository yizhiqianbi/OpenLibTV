# Script v2 批量生视频配置界面：源码审计

范围：公开客户端 `research/source/3u6hjewm8qox_.js` 的 `rg`，不执行原脚本，不读取账号或写原站。字符位置是 UTF-8 解码后字符串的零基准位置。本审计只描述 v2 弹窗；v1 `eM/eb` 组下浮条不是这一界面。

## 入口与结构

- `rg` 定义 @1119955，原 props 为 `nodeLabel, rows, initialImageSettings, opened, isCanvasLight, onClose, onConfirm, scriptAssets, getNodeUrl`。`nodeLabel` 不用于实际标题。
- Script v2 renderer 调用 @1391298；打开回调 @1381747 使用完整当前 `e1` rows，不消费表格当时选择。提交 @1382032 调 `rw` 创建视频组，成功关闭后 100ms 选择组并 400ms/padding .15 fit；并不是这里执行视频生成。
- Modal JSX @1130250：居中、800px、portal、zIndex 500，遮罩和 Escape 都不关闭，header close 在忙时 disabled。内容 @1114140 为 flex-column/max-height 85vh/overflow hidden/radius 12，body padding 16。暗色背景 #181818/边框白 10%，亮色白底/边框黑 10%，标题 font-weight 500。
- 实际标题“批量生视频”。无费用栏、无底部取消按钮；正常退出只有 header close。不得套用 v1 浮条或添加虚构费用估计。

## 选镜、时长、只读展开

- 初次打开 @1122790 以所有 truthy `hiddenUuid` 全选；每镜 map 初始化为 `row.durationSeconds`，展开清空。关闭后再次打开重新初始化。打开期间 rows 改变时仅保留仍存在的选择/时长，新镜不自动加入选择；无 UUID 的行不显示。
- footer 选择控件 @1116910：14px checkbox，选中计数“已选 {selected}/{total}”；部分选择设置 DOM `indeterminate`。零选额外“请先选择镜头”。全选切换为全部有效 UUID 或空集合。
- 列表 @1131680：max-height 320px、overflow auto、下间距 12px。每镜外框 radius 6/border 1/padding 12×8/下间距 4；主行 gap 8。左 checkbox 14px/top margin 2；中间点击只切展开，标题“镜头 {shotNumber}”12px/500，chevron 12px；折叠摘要 11px、单行截断、最多取 60 字后加 `...`。
- 右侧时长 @1132820：enum 用 32px 高/radius8/padding8/font13 chip；slider 用原 Mantine NumberInput xs、宽80px、上下调节器、suffix `s`、allowDecimal false；无约束只显示 11px 秒数。只有单一允许时长且当前值合法时锁定该控件；非法脚本时长仍可修正。模型切换不自动把每镜时长 snap 到合法值。
- 校验 @1126370：按当前临时 map 检查，但提示里的“脚本表格为 {duration}s”仍取原行时长。无效标记 16×16，amber100/700，ring amber300；tooltip 宽240/z2000。enum 原 JSX 显示非法当前选项时会丢弃其 disabled 字段，这是明确源边界；本机保留禁用，避免再次选择非法值。
- 展开 @1134180 是只读 textarea、rows4、margin-top8、border1/radius4/padding8×4/font11、resize none。提示词 @1128260 由资产引用和占位 poster 构建，`{{Image N}}` 中文呈现为“图片N”；fallback `videoMotionPrompt || plotDescription || ''`。不编辑或写回脚本。
- 固定提示“音频已默认开启，品质跟随视频品质。每镜时长为本次生成临时值，不写回脚本表格。”；单一时长追加“当前模型仅支持 {duration}s。”。

## 模型、参数与菜单

- support.video → 可用 mixed2video 模型 @1120950；首个可用项作为默认，不套 v1 的 Kling 优先。固定模式 mixed2video，规则 input counts 为 image1/video0/audio0。
- 初始化 @1121900 使用普通字段默认值、property 存在就强制 enableSound 对应 storedKey=`on`，继承上游 ratio；高级仅 autoCompliance 默认，不显示高级区域。
- 普通字段 @1122210、@1135230：按 config.settings mixed2video→text2video 回退，只排无 property、barOnly、enableSound、duration。没有 batch/enable/visibleWhen 通用筛选，也不显示 prompt/count/高级折叠。
- numeric 为 NumberInput xs/宽100：只有 component=slider 或同时存在 min/max 且没有 enum 才走数字控件；enum 加 min/max 仍是菜单，单一边界不是数字控件。实际 value 的非 number 回退是 Number(property.min??0)，不是 property.default，再按规则 override 后 min/max 限幅；step<1 才允许小数。enum 使用 typed 原值，但 chip value 是字符串；选中后写回原 primitive/object.value，不把数字存成字符串；原始 boolean enum 不显示，对象的 boolean value 可以显示。ratio/quality/resolution 图标由字段和 originalField 解析。
- ratio 可选集合减掉 rules 禁用值后 <=1 时锁定；提示“该模型固定为 {ratio}”，否则未手动改 ratio 时“默认继承上游图组 {ratio}，可手动修改”。不自动回退冲突 ratio；其他字段使用 source fallback。
- 共享 `aZ` @1111180：Menu bottom-start/offset4/portal/z2000；dropdown min-width120/max-height min(300px,100vh-32px)、radius8/border1/padding4，暗色 #1f1f1f/白10% 边、亮色白/黑10% 边。chip height32/gap4/padding8/radius8/font13；chevron12/opacity60；选中 check12/opacity70。禁用模型按 support disable/lang 判定并提示原因，当前禁用模型会自动选择首个未禁用项。
- source模型图标是真实 icon metadata，视图不得把 VIP/图标当授权或伪造权益。

## 提交、状态与文案

- 默认信息条 @1131090：“会优先使用已生成的角色、场景和道具参考图，让视频更贴合分镜内容”。radius8/padding12×8/font12；暗色白4%底/白65%字，亮色 neutral100/600。
- 空目录条：“当前暂无可用的视频模型，批量生视频暂不可用”。超参考上限条：“镜头 {shots} 的资产参考图过多，超出当前模型上限（最多 {max} 张）。请减少这些镜头的参考资产，或切换支持更多参考图的视频模型”。amber 提示相同尺寸。
- footer @1109960 / @1134650：margin-top16、两端 flex/gap12，左侧 flex-wrap；选择计数 gap16、模型/参数 gap8。确认“确认并创建视频生成器组 ({count})”，height32/padding12/radius8/font13/400；暗色 #F7F7F7 底/#171717 字；busy spinner12/border2/opacity60，label 为“真人校验并创建中”或“创建中”。
- tooltip 优先级 @1129970：所选时长非法→缺参考图→超参考数→任意角色/场景/道具资产未就绪→所选空提示词→“创建视频生成器组后，可在画布中整组执行批量生视频”。未选择、无可用目录、当前模型不可用/被禁、上述问题、busy 均禁确认。
- 缺引用文案：“镜头 {nums} 缺少已生成的角色、场景或道具参考图，脚本批量生视频仅支持全能参考模式，请先生成资产图后再创建视频生成器组”。资产 gate 检查全部 assets 的三个 role，并非仅所选镜引用。
- `eP` @1128600 截取当前 selected Set/有限时长 map，再真人审核后 `onConfirm(config,map,set)`；内部 guard 漏空提示词，而按钮包含该 gate，不能以此遗漏让本机放行。AbortController 在卸载 cleanup 中止；源 opened=false 本身不 abort，但 busy header 无法关闭。
- 真人审核、费用、生成均依赖实际服务；新本机 controller 须保请求 owner、原子建图/保存失败重试，不把空视频生成器节点称为生成完成。本 UI 没有费用展示，不构造费用0。

## 本机组件契约与明确适配

新 `ScriptV2VideoConfiguration` 只持展开状态。controller 提供 `rows,state,projection`；state 包含 config/selectedHiddenUuids/perShotDurations，projection 由纯模型提供字段、菜单、时长、ratio 提示、资格/引用诊断。`onChange(command)` 更新临时 config；`onConfirm()` 由 controller 固定 payload、owner 与服务/保存事务。`getPrompt(row)` 只读解析当前真实资产引用，不在 view 读图或写服务。

`opened,onClose,busy,pendingSave,error,catalogStatus,onRetryCatalog,isCanvasLight,requiresPortraitAudit` 管理展示。保存失败状态锁全部配置、只保留“重试保存视频组”且不重新建图/不依赖后来失效的 schema/镜头资格。目录失败可见提示与重试按钮，不把失败当空目录。

共享 dialog-stack 管理焦点/背景隔离/滚动锁；复用共享非 modal popover 管理嵌套菜单和逐层 Escape。菜单与 tooltip portal 挂在当前 dialog DOM 内，保持 fixed 视口定位，避免 body sibling 被现有 stack 隔离而无法获得菜单焦点；不扩大或另写焦点锁。本机明确适配为非 busy 的 Escape 关闭弹窗并回入口（源 Escape 禁止关闭），可键盘操作折叠标题、checkbox/参数具有 ARIA 标签，窄屏 max-width 与 footer 换行、菜单8px边界。忙时禁编辑/关闭属事务互斥适配，原源仅明确锁 close/confirm。无全局样式 reset 或新库。

初始化 null state/projection 以不可编辑空展示保留目录 loading/error/重试；不发初始化命令、不伪造 schema。目录资格使用 projection.catalogue.keys，而非包含 fallback 当前模型的 options 数量。

2026-10-12 03:41:46 定向验证：组件 17 项通过，ESLint/Prettier 通过；覆盖 null 初始化、fallback 空目录、选镜/indeterminate、只读引用提示词、临时时长/非法单值修正、真实 NumberInput、typed enum/原 numeric gate、逐层 Escape/焦点、busy/失败保存重试、390px 菜单矩形与底边翻转，以及真实纯模型→view 的 originalField/typed enum/force sound/UUID选择接线。桌面/窄屏原生和全量检查由 root 单独执行；不能以此记录宣称全站交互完成。

此审计是静态 source 证据，不代表真实视频/审核/原站账号功能验收；原登录/小号/写服务继续延期。
