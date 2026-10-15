# ScriptV2 分镜图片配置弹窗：UI 与生命周期源码审计

2026-10-12。本批只静态读取已有公开归档，不执行原站 bundle，不读取账号资源，不请求原站生成、上传、审核、费用或写服务。本文件给 `r3` 图片配置界面及其 owner 提供可实现的契约；纯配置和纯建图由相应模型审计负责。本文件不把本机生成器组创建等同于真实生图成功。

偏移为文件解码后的 **UTF-8 字符串 0-based 字符偏移**，不是字节或 pretty 行号。主文件为 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js)，中文对照 [locale-zh.json](../public/data/locale-zh.json)。

## 1. 调用链与公开视图契约

| 源位置 | 已确认作用 |
| --- | --- |
| `si` 1314283 / host 1387014 | “批量生成分镜”按钮；源 gate 为非 readonly、选择可显示、非全脚本生成中，且 `outputGenerationReady` |
| `ey` 1344848 | 仅 `ef(true)` 打开图片弹窗，不改 graph、不运行、不导航 |
| `r3` 1177842–1183730 | 图片配置 Modal，独立 raw-index 选择及参数状态 |
| host JSX 1391044 | 传 raw `ez` 全部 rows、`initialSelected=ez`、assets `T`、theme、opened/close/confirm |
| `tQ` 1381512 | 当前 raw rows 按确认 indices 映射，过滤不存在的项；非零项时先关闭图片窗，再 await `sC` |
| `sC` 1327988–1330640 | 创建并关联 v2 vertical 空图片生成器组、资产引用及边，然后等候保存；没有立即生成任务 |

`r3` 正式解构 props：

```text
rows: raw rows array
initialSelected: row array（实际 host 传全部 raw rows）
opened: boolean
isCanvasLight: boolean
onClose(): void
onConfirm(indices: number[], config): void
scriptV2Assets: assets（可缺失）
```

host 还传 `scriptV2NodeId`，但 `r3` 未读取这个 prop。`onConfirm` 不是 UUID Set / duration Map，也不是整个表格 controller 的选择状态。此图片窗与 v2 视频 `rg` 的配置接口不同，不能把视频行为整体套用。

父全屏编辑器和图片窗是两个独立 opened 状态。`onClose` 与 `tQ` 均未调用全屏 `tn`，所以图片窗取消/确认本身不关闭父编辑器。source `tQ/sC` 无显式新组选中、fitBounds、100ms timer；仅有 child mount 后的组 bounds reflow。视频 `t8` 的成功关闭父界面/延迟选中定位不能凭相邻位置加入图片链。

## 2. 打开、重新打开、行变动与选择

### 初始状态和重开

`r3` 初始 config `{}`，selected 和 expanded 各为一个空 Set。opened effect **只有 `[opened]` 一个依赖**：

```text
if opened:
  config = {
    model: firstCapacityCandidate ?? global.defaultModel.image,
    modeType: 'text2image',
    settings: r2(getModel('image', model))
  }
  selected = Set(initialSelected.map((_, index) => index))
  expanded = empty Set
```

实际 `initialSelected=rows`，每次 false→true 重开全选并收起所有详情。`initialSelected` 的元素身份、UUID 和在 rows 中的位置均不用于匹配，只取这个数组的索引；不能改成 UUID 恢复表格选择后声称等同源。

第一次开窗存在空 selection→全选的 effect 顺序：初始最大 refs 为0、可选目录宽，选择全行后可能导致 model 失效，再由独立 reconcile effect 换合法首项。后续重开也按 effect 当时的 candidates 先选，再根据新选择 settle；不能假称源码在一个同步事务中一次计算所有镜头 refs。

### 镜头 checkbox 和详情

- selected / expanded 均是 **raw index Set**。
- checkbox 选中与切换以当前遍历 index 为准，clone Set 再 toggle；不改 rows、prompt、图或 table selection。
- 详情按钮独立 toggle expanded index，显示 `详情` / `收起`；不改变选择。
- React 行 key 为 `row.hiddenUuid ?? index`，但上述状态仍按 index，不能因为 key 是 UUID 就推断选择跟随 UUID。
- 打开期间 rows 或 initialSelected 增删/换序不会触发 opened effect；**不 clamp、不 prune、不重映射、不重新全选**。新 index 对应当前行，旧越界 index 可继续在 Set 内。
- 计数 `D=selected.size`，`L=rows.length`；`allSelected=L>0 && D===L`，`someSelected=D>0 && D<L`。这些按 Set 大小计算，并非有效 selected rows 数。
- 全选切换：rows 空时保留原 Set；否则 current Set.size===rows.length 时清空，其他情况替换成当前全部 indices。
- confirm payload 是 `rows.map((_,index)=>index).filter(index=>selected.has(index))`，因此越界 index 不进入 payload，且有效行总按当前 raw rows 顺序；显示 D 仍可能包括旧越界项。

这是源状态模型的明确边界。异步 owner 若为避免同 ID 新文档或失效 rows 的提交而拒绝旧请求，应标本机安全适配；不能默默写成“源码每次 rows 更新自动清理选择”。

### 关闭与 owner

`r3` 的 close 只调用 `onClose`，不保存 config、flush draft 或确认未保存变化。host 在 **1344635** 附近另有 effect `[ea]`：`ea` 为 false 时关闭图片窗；它不是 r3 自身 readonly/loading effect。图片入口的 selection/readonly/task gate 详见 [脚本工具栏源码审计](./canvas-script-node-toolbar-source-audit.md)。

源图片 modal 没有本地 submitting/busy 状态。确认只调用 `onConfirm(indices,config)`，不 await；host 随即关闭再等建图。切文档、删除再恢复、readonly/ready、strong CAS、Quota 表单保留与保存重试都应由本机 controller 明确持有，不能从这一源 callback 推导它们已实现。

## 3. 模型目录、refs 容量、默认值与 reconcile

`r3` 使用 global `support.image`、`getModel('image',key)` 和 `defaultModel.image`。不是 `support.scriptImage`，也不是枚举全部 `imageModels`。

引用数 `k`：从 assets 建 asset-linked-node map，getter 读取当前 store 对应节点 **url[0]**，truthy 时返回 `{nodeId,url}`。对当前选中 raw rows 调 `collectShotRefImages(row,map,{assets,sourceField:'imageGenerationPrompt'})`，取最大数量，空选择为0。该 useMemo 依赖 rows/assets/getter/selected，不直接订阅独立 nodes 数组。

容量候选 N 维持 support 原顺序：

- k<=0：不加 image2image 能力约束。
- k>0：schema.properties.modeType.items.image2image 必须为数组 `[min,max]`，两值 typeof number，且 `min<=k<=max`。
- 此 N 计算 **不排除 disabled metadata**；首项 S=N[0]，没有则 default.image。
- 当前 key I=`config.model || S`；合法 `j=N.includes(I)`。options 保留 support.modelKey→value、`rG` label、icon 和 disable。
- 模型 label `rG` **1144748**：非空 modelName → 非空 schema.displayText → modelKey，不显示 description/estimatedTime/vip/platform 等 metadata。
- confirm 的 M：当前 option 缺失或 `resolveSupportModelDisable(option.disable,lang).disabled`。

打开或选择模型时重建 config，而不是 merge 旧模型参数。模型切换只重置 `{model,modeType:'text2image',settings:r2(schema)}`，不改 selected/expanded。

当前 config.model 非空、弹窗开启且能力失效时，reconcile effect 尝试 N[0] 并重建 defaults；**N 为空时不换模型**，保留旧 config 且 confirm 禁用。disabled metadata 的自动切换另来自 `aZ`，见第 5 节；不能混成同一容量规则。

`r2` **1177629** 默认值读取：

```text
configured = config.settings ?? config.setting ?? []
keys = Array.isArray(configured)
  ? configured
  : configured.text2image ?? configured.image2image ?? []
settings[key] = properties[key].default（仅 default !== undefined）
```

没有 originalField 改名，没有 canonical 参数 resolver、数值 clamp、advancedSettings、mode infer 或旧 node.imageGenConfig 继承。modeType text2image 是配置值；`sC` 对有引用的每行另写 image2image。

## 4. 可见参数字段与 typed enum

`r3` 可见字段 R 直接遍历 `schema.config.settings ?? []` 的每个 key（与 r2 的 config.setting / mode-object 支持不同）：

- property 取 properties[key]；type 默认 string，但视图一律使用 enum Selector，不根据 type 切 NumberInput。
- enum 缺失→options[]，该 key 仍显示 chip；只有一个 enum 也显示，不借用其他 modal 的 `values.length>1` 过滤。
- string enum→`{value:原字符串,label:原字符串}`。
- 非 null object enum→value=`enum.value ?? enum.key ?? String(enum)`；这个 value **可保持 number/boolean**。label=`resolveSchemaLabel(enum,t) || enum.label || enum.name || value`。
- 其他 primitive（包括 number、boolean、null）→value 和 label 均 `String(enum)`。
- currentValue=`config.settings[key] ?? ''`，保留0/false；更改直接写 `settings[key]=typedValue`，不改成 originalField，不运行泛用 parameter resolver。
- 不读取高级字段、条件可见、数值约束、普通 count、override、lock、费用或提示词编辑。

`resolveSchemaLabel` module533832 在 [34q64t3bi91ws.js](./source/34q64t3bi91ws.js) **1420**：调用 `resolveI18nText(displayName,displayNameI18nKey,t)`。后者 module978805 在 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) **15299**：有 translator/key 且翻译非空、不同于 key 时取翻译，否则取原 displayName。并非主动从 displayName 对象读取 zh/en。r3 自己随后才 fallback label/name/value。

### 归档数据与可见 settings 的确定不兼容

当前公开 [models.json](../public/data/models.json) 的 nebula-2.1 和 nebula-2-flash 的 config.settings 是 `{text2image:[quality,ratio],image2image:[quality,ratio]}`。r2 能取 defaults，但 r3 R 直接 `.map()` 该对象。

源 global getModel 在 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) **225450** 只读取 schema namespace/key；普通 policy 返回 raw schema，未把该 mode-object 转为数组。因此当前存档 bundle 与这两项 schema 存在静态可确认的 `.map` 不兼容；未运行 source 去断言线上实际报错。

本机必须安全处理非数组 visible settings。安全呈空字段但保留 r2 defaults，或经主任务授权选具体 mode 分支，均须记录为适配；不能假称 r3 本身已有这项正常化，也不能用视频 ConfigField 自动加 NumberInput/conditions 修补后称 exact source。

## 5. 可复用的共享 Selector 与图标

`rI` **1141126** 排列 `flex flex-wrap items-center gap4/pl4/pt4`。先模型 chip，再每个 R 参数 chip；模型 icon 为 ModelSelectIcon size14，参数 icon来自 a0。图片 r3 通过 rI；v2 视频 rg 直接使用相同 aZ/a0，没有经过 rI。可抽取共同 selector/menu/ratio icon，**可见字段和状态规则仍分开**。

### `aZ` 1111200–1113466

- Menu 默认 bottom-start，offset4，withinPortal，z2000，shadow md。
- Trigger h32/px8/radius8/gap4/font13；文字 nowrap；chevronDown12/opacity60。disabled 真属性、cursor not allowed/opacity50；light neutral800、hoverblack4%；dark F7F7F7、hoverwhite6%。
- 显示 label 和 check 都严格 `option.value === currentValue`，不是 String 后比较；无匹配时显示当前值。
- Dropdown max-h `min(300px,100vh-32px)`，min-width120、overflow-y auto、radius8/border/p4；lightwhite/black10border；dark1f1f1f/white10border。
- Item radius4/font13，选中 font-medium，右侧 check12/opacity70；disabled 由 support disable map 或 typed disabledValues Set 决定。click 未禁用才原样调用 `onChange(option.value)`。
- option 具有 support reason 时 wrap Tooltip：right/arrow/multiline/z2100/fit-content/maxWidth240。
- 另有 effect：当前 value truthy 且在 support disabled map 中，找首个非 support-disabled 且不在 disabledValues 的 option，值不同才 change；没有可用项保留当前。**不因为 value 在 disabledValues 中就自动切换**。

resolveSupportModelDisable module255534 在 [04q9x43g2p9-v.js](./source/04q9x43g2p9-v.js) **15360**：true、trim 非空 string、非数组非空 object 都 disabled；string 直接作为 trim reason，object reason 先 `disable[lang]` 再 `disable.en`，无 reason 仍 disabled。它不把 vip、requiresWhitelistPermission 或 model schema 的 disabled 字段当这项 metadata。

### `a0/aQ` 与 icon 精确规则

**1113467–1114140**：

- isAspect，或 originalField==='aspectRatio'，或 key.startsWith('ratio') → ratio icon。
- 否则 key==='quality' 或 originalField==='quality' → Icons.Hd14；**不是 quality 前缀匹配**。
- 否则 key.startsWith('resolution') → Icons.Fullscreen14；只有 originalField resolution 不足以选择该 icon。
- ratio外框14×14，内部矩形 radius2/border1.5；1:1→11×11，4:3→12×9，3:4→9×12，3:2→12×8，2:3→8×12，16:9→14×8，9:16→8×14，2:1→14×7，1:2→7×14，21:9→14×6，9:21→6×14，auto→11×11，其他→12×9。
- r3 isAspect 计算为 originalField aspectRatio、key aspectRatio 或 ratio 前缀；普通 key='ratio' 因前缀命中。

若本机视频 Selector 原来使用 String equality、额外 quality/resolution key匹配或本机 menu edge clamp，共享后需保持原视频契约并对图片注明差异，不能用抽取组件扩大图片 source 能力。

## 6. Modal、行区、footer 与原文案

### Modal 与默认关闭

r3 props：800px、centered、withinPortal、z500。content `!flex !max-h-[85vh] !flex-col !overflow-hidden` / radius12；light white + black10border；dark181818 + white10border。header 背景跟 content；title font-medium，lightneutral800/darkwhite。body `flex min-h0 flex1 flex-col p16`。

未 override close/overlay/close button。归档 Mantine module734911 在 [187dzasr37zyd.js](./source/187dzasr37zyd.js) **6363** 的默认值明确：closeOnClickOutside、closeOnEscape、withOverlay、withCloseButton、trapFocus、returnFocus、lockScroll 全 true，keepMounted false，transition200ms fade-down。故源有右侧 X、遮罩和 Escape 关闭及 returnFocus；close button module827691 调 context.onClose，无保存。

这些明确 defaults 不代表未读取的最终 CSS/overlay computed opacity已验收。本机应复用统一 dialog-stack 处理嵌套全屏、菜单 Escape 和回焦点，不复制库独立 body/inert 生命周期。窄屏重排/边缘 clamp 为本机适配，未据此声称真实手机/Safari 行为一致。

### 说明与行

- title：`分镜批量生图`。
- 说明：`会优先使用已生成的角色、场景和道具参考图，让画面更贴合分镜内容`；margin-bottom12、px12/py8、radius8/font12。lightneutral100背景/600字；darkwhite4%背景/white65%字。
- 行区 tiny-scrollbar/max-h320/min-h0/overflow-y/radius8/border；lightneutral200，dark363636。
- 每行 flex/gap16、px12/py12、bottom-border（末行无）；展开 items-start，收起 items-center。
- checkbox+标题区 shrink0/gap8；checkbox14×14/nodrag，light accentneutral900/darkaccentwhite；aria `选择镜头 {raw shotNumber}`。
- 标题 `镜头{raw shotNumber}`，font12。不能先临时 renumber 再当作 raw镜号保存。
- 详情正文 `imageGenerationPrompt || plotDescription || （空）`；font12，lightneutral500/dark919191；收起 line-clamp1/title全文，展开 pre-wrap/break-words/无title。
- detail按钮 font12/nodrag/shrink0；aria `镜头 {raw shotNumber} 详情`、aria-expanded；文字 `详情`/`收起`。

### Footer

`a$` **1109845**：margin-top16、flex/shrink0/items-center/justify-between/gap12；左 min-w0/flex1/flex-wrap/gap12，右 shrink0/gap12。

`a7` **1117153** 原生全选 checkbox14×14，effect 设置 indeterminate=someSelected；左区 gap16，labelgap6。文案 `已选 D/L`、font11；D0额外 `请先选择镜头`（font11，lightneutral500/darkwhite50%）。r3 不给 a7 disabled，因此选镜/全选不因为提交 busy 自动禁用。

确认按钮 `确认并创建生成器组 (D)`；h32/px12/radius8/font13/普通字重/gap6；disabled opacity50/cursor not allowed；lightneutral900背景白字/hover800，darkF7F7F7背景171717字/hoverwhite。无生成中 spinner 和费用区。

确认 disabled **只由 r3 本身**：`D===0 || !currentModelInCandidates || currentSupportModelDisabled || anySelectedRow.imageGenerationPromptFalsy`。最后检查为 truthiness，**不 trim**；toolbar入口事前两种 prompts trim/non-generating 的 gate独立。

`aK` **1110302** tooltip 始终包确认按钮，不仅 disabled 时才显示：top-end/arrow/openDelay0/closeDelay0/portal/z2000/multiline/width280，padding8×12/line-height18。缺 prompt 为 `请先合成提示词后再创建分镜图生成器组`；否则 `创建分镜图生成器组后，可在画布中整组执行批量生图`。模型空、模型禁用或0选择并无额外 r3 tooltip reason，仍按这个二分文案；模型 item 自己可有 disable reason。

## 7. 保存 helper 与建图边界

`sC` 创建组/children/refs，补 childNodeIds，scheduleAutoBoundsGroupReflowAfterMount，linkStoryboard，然后调用 `awaitGroupSaveOrRollback`。具体 graph 字段由独立 pure graph 审计记录，不把图片配置 UI 推导成一般分组/standalone grid。

尽管 helper 名含 Rollback，module643721 的 `eD` **725047–725218** 实际只有：

```text
store exists && (await store.waitForSyncSaved?.(8000, groupId), false)
```

没有删除新组、恢复旧 linkedImageGroupId、检查 wait 返回 boolean 或其他 rollback 分支；throw 会从 sC/tQ 向上传播。sC 的条件表达式 `await helper ? null : groupId` 正常返回新 ID，但不能据 helper 名称宣称保存失败会撤销已建图。Root 采用一次 raw CAS / history / draft / flush 和失败保存重试是本机 owner 适配，要记录实际行为。

## 8. 运营 support 与公共 schema 的实际范围

[config-182.json](./source/api/config-182.json) 为 `{code:0,data:{linkUrl:JSON字符串,...}}`。解码 `data.linkUrl.image` 得 **20 项**；不是7项 scriptImage，也不是19项 storyboardVideo。其 metadata 包含 modelKey、modelName、icon、platform、description、estimatedTime 和部分 labels/studio/vip/requiresWhitelistPermission。本图片 caller 只读取 modelKey/modelName/icon/disable，不把目录标签当授权或前端禁用证明。

顺序如下；容量列来自已有 [models.json](../public/data/models.json) 对应 image2image schema，不来自 metadata 本身：

| 序号 | modelKey | 原 modelName | image2image 范围 |
| --- | --- | --- | --- |
| 1 | lib-image-2.5-s | Lib Image 2.5 Pro | 0..14 |
| 2 | lib-image-2.5-f | Lib Image 2.5 Fast | 0..14 |
| 3 | lib-image-2 | Lib Image | 0..14 |
| 4 | nebula-ultra | General image Pro | 0..7 |
| 5 | nebula-2.1 | General image V2.1 | 0..7 |
| 6 | nebula-2-flash | General image V2 | 0..7 |
| 7 | doubao-seedream-5-0-pro | Seedream 5.0 Pro | 0..10 |
| 8 | flux-3-image | Genesis F.3 | 0..10 |
| 9 | qwen-image-3 | Qwen image 3.0 | 1..3 |
| 10 | mj-v8.2 | Style Image V8.2 | 0..6 |
| 11 | mj-v8.1 | Style Image V8.1 | 0..6 |
| 12 | mj-v7 | Style Image V7 | 0..6 |
| 13 | mj-niji7 | Style Image Niji 7 | 0..4 |
| 14 | jimeng-4.6 | Seedream 4.6 | 0..6 |
| 15 | seedream-5 | Seedream 5.0 Lite | 0..6 |
| 16 | seedream-4.5 | Seedream 4.5 | 0..14 |
| 17 | z-image | Z-image Turbo | 0..1 |
| 18 | qwen | Qwen Image | 0..2 |
| 19 | qwen-edit | Qwen Edit | 1..2 |
| 20 | seedream-4 | Seedream 4.0 | 0..6 |

所有20项在公开34项 imageModels 中都有 schema；额外14项并不属于该 support.image 入口，不能因可查 schema 就出现在 r3。default.image 为 lib-image-2.5-s；其默认 settings 为 quality medium / resolution2K / background auto / ratio16:9。support原顺序和全部已存真实 metadata可以独立提取到小型运营 JSON，无需网络采集；加载、失败、重试由 controller持有，不能把加载失败当已加载空目录并仍创建。

## 9. 本批证据边界

本审计已向 Root、纯配置与纯建图 owner 同步：index 选择不 prune、打开/重开两阶段 settle、typed enum/raw setting key、shared selector 与视频的可复用范围、父全屏保持、无图片 fit timer、保存 helper 不实际 rollback，以及两项 mode-object visible settings 的源不兼容。

本文件仅新增研究文档，未改生产、其他维护文档或测试，未执行 source。实现与本机验收结果由各 owner 和主任务另记；真实生图、费用/权益、资产上传/审核、原站任务、真实手机与 Safari 不在本次静态证据中。
