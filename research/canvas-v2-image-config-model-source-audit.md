# ScriptV2 r3 图片配置纯模型源码审计

2026-10-12。本批只静态读取已归档公开脚本和配置，不执行原 bundle，不请求原站生成、费用、合规或写服务，不读取账号资源。模型仅保存表单数据、投影可选项和形成确认参数；不创建任务，也不把本地创建生成器组当作已完成生图。

所有 offset 为解码后的 **0-based 字符偏移**，不是 UTF-8 字节或格式化行号。主要证据为 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js)，中文文案取 [locale-zh.json](../public/data/locale-zh.json)。视图与 owner 的独立证据见 [UI 源码审计](./canvas-v2-image-configuration-ui-source-audit.md)。本文件直接复读相关原函数，未以旧视频实现或旧审计替代原证据。

## 原调用链和目录

| 证据位置             | 实际协议                                                              |
| -------------------- | --------------------------------------------------------------------- |
| `r3` 1177842–1183730 | 图片配置 Modal；读取 support.image/getModel(image)/defaultModel.image |
| host 1391044         | rows 和 initialSelected 均为 raw `ez`，另传当前 script assets         |
| `tQ` 1381512         | indices 映射当前 `ez`，过滤不存在项；有效 rows 非空才关窗并调用 sC    |
| `r2` 1177629         | 图片初始化/换模型默认参数                                             |
| `rG` 1144748         | 模型名称优先级                                                        |
| `rI` 1141126         | 模型 chip 后逐项 enum chip，直接传 raw key/currentValue               |
| `aZ` 1111200         | 支持目录 disable 解析及当前禁用选项自动切到首个未禁用选项             |
| 图标 `a0` 1113889    | ratio/aspectRatio、quality、resolution 图标；不是数值控件             |

原配置 [config-182.json](./source/api/config-182.json) 的 `data.linkUrl` 是 JSON 字符串，解析后 **image 目录共20项**。本机 [image-model-support.json](../public/data/image-model-support.json) 保留这20项完整原记录；专项测试逐对象对照归档。不是 `scriptImage`、v1 storyboardVideo 或 v2 video 目录，也没有按 imageModels 全量枚举补菜单。

模型 schema 来自 [models.json](../public/data/models.json) 的 imageModels，默认模型为 default.image。没有使用本批之外的目录请求。support 的 loading/error/retry 由 caller 负责；纯模型将 null/undefined 视为空目录，与源 `support.image ?? []` 的计算相同，不能据此断言目录已加载。

## 引用计数边界

`r3` 1178380 建当前 asset-linked-node map，1178484 对所选 raw rows 调 `collectShotRefImages`，明确 `sourceField:'imageGenerationPrompt'`，取最大 refs 数而非总和。空 Set 是零行、最大值0；不是“未指定=全部”的视频协议。

直接核对 module225860：`buildAssetLinkedNodeMap` 对应 `e_` 725208，`collectShotRefImages` 对应 `eO` 726002，exports 739250附近。map 按 characters/scenes/props 遍历，getter 只读当前 node.data.url[0]；首 URL truthy 才返回，不能搜索后续 URL、借 thumbnail 或 trim 判空。收集最终按 linked nodeId 去重。

其依赖 module892147 的 `collectRowAssetReferences` 在 [447ud3w8leoy-.js](./source/447ud3w8leoy-.js) 20067：处理 structured character、finalImagePromptEntityRefs、scene/prop IDs、当前 imageGenerationPrompt/plotDescription 中的名称和 ID mentions，最后按 character→scene→prop 输出。不得混入 finalVideoPromptEntityRefs 或 videoMotionPrompt。该构图/引用描述由本批独立 image graph model 提供，配置模型只接 `Map<rawIndex,number>`；不读取图、React、存储或服务。

候选范围来自 `schema.properties.modeType.items.image2image`：

1. selected 最大 refs 为0时，所有 support.image 项都进入候选，即使 schema 缺失。
2. refs>0时必须为数组，前两项 typeof number，并满足 min<=refs<=max。
3. 不使用视频 mixed2video/imageMax，不截断图片引用，不加 text2image 容量规则。
4. source 只查 typeof number：Infinity 上限可通过，NaN 的比较自然失败；未借用视频 finite-range helper改变这条规则。
5. 候选维持 support 原顺序，计算候选时保留 disabled 项。

配置纯模型只对合法当前 raw rows 的 selected index 读 refCounts；越界选择不贡献 refs。不存在的 Map entry 为0。负数、非整数或非 Map 输入为明确本机非法数据拒绝，不会静默把坏引用数变为0。

## 独立索引状态、初选和后续变化

selectedIndices 和 expandedIndices 是独立的原始数字索引 Set，不使用 hiddenUuid。真实 host 初选全部 raw rows；source `initialSelected.map((_,index)=>index)` 只取数组长度对应前缀索引，忽略元素身份及其在 rows 中的位置。

fresh r3 初始 selected 是空 Set。因此 opened effect 先使用零引用候选的首模型；effect 随后全选，再由候选 reconcile effect 修正为全选 refs 下合法首项。纯 create 模拟这一稳定结果：先 refs=0 初始化，再 settle。若全选后的候选为空，保留原零引用首模型，**不改成 global fallback**。此两阶段已用不同默认模型的强断言验证。

opened effect 依赖只有 opened。打开期间 rows 更新不重新全选、不 prune 越界项、不随 UUID 重新匹配、不重置 expanded。纯 reconcile 更新 rows 引用并按当前选镜重算模型合法性，原 Set 引用不变。同一 context 的稳定结果保持 state 引用，避免 controller layout effect 自循环。

计数和全选语义：

```text
selectedCount = selectedIndices.size
totalCount = rows.length
allSelected = totalCount>0 && selectedCount===totalCount
someSelected = selectedCount>0 && selectedCount<totalCount
toggleAll:
  rows.length===0 → 保留 Set
  Set.size===rows.length → empty Set
  否则 → 当前全部 raw indices
```

这些有意保留 source 历史越界选择的 quirks。即使旧 index 不对应当前有效行，caption 仍按 Set.size；不能为修复计数悄悄换成有效 UUID 行数。

模型失效 effect 只在 config.model truthy、当前模型不在 candidates 且首候选存在时重置。无候选则保持配置，确认禁用。shared aZ 的 disabled 自动选择是另一个 effect：当前选项 disabled 时切首个未禁用候选；全部禁用则保留当前项。两条规则不能合并成“永远先排除禁用项再选默认”。纯 settle 按可达到的后续 effects 结果执行。

原 r3 始终挂载后重开时，opened effect 的首候选取此前 selection 的 refs，再全选 settle。本机 controller 每次打开新 form owner，create 模拟 fresh mount；非首次旧组件 selection 的瞬时 model 差异没有伪称已复刻。正常非空合法候选随后 settle；无候选等中间状态的重开细节属于这个 owner 适配边界。

## 默认参数、可见字段和类型

`r2` 默认值：

```text
configured = schema.config.settings ?? schema.config.setting ?? []
keys = Array.isArray(configured)
  ? configured
  : configured.text2image ?? configured.image2image ?? []
settings[key] = properties[key].default  // 仅排除 undefined
```

默认配置和换模型配置严格为 `{model,modeType:'text2image',settings}`。不继承旧 ratio，不增加 advancedSettings/modelSchema，不运行 generic generator resolver。0/false/null 默认值保留；enum 缺 default 不补首选项，默认值不在 enum 中也不自改。**原 schema key 就是 settings key**，originalField 不用于重命名。

可见字段 R 与 r2 不同，只遍历 `schema.config.settings ?? []` 数组，不取 config.setting 或 mode 分支。source 即使 property 缺失仍保留空 enum chip；type 只作字段 metadata，没有 numeric slider。也没有 enable/barOnly/conditions/override/lock/settingsRules/count/费用过滤。

enum 精确投影：

- string→原 string value/label。
- 非 null object→`value ?? key ?? String(entry)`，保留 object.value 的数字/布尔类型。
- 其他 primitive，包括 number/boolean/null→value 与 label 都 String(entry)。
- object label→`resolveSchemaLabel(entry,translate) || entry.label || entry.name || value`。
- enum entry 的 disable 不进入投影，不能当参数禁用规则。

直接读 module533832：[34q64t3bi91ws.js](./source/34q64t3bi91ws.js) 1420 的 resolveSchemaLabel 调 module978805；[0leiedr1esdbe.js](./source/0leiedr1esdbe.js) 15299 的 resolveI18nText 仅当 translator/key 存在、返回值 truthy 且不同于 key 才用翻译，其他情况返回原 displayName。不主动读取 displayName.zh/en。pure 可注入可选 translate，默认保持 displayName。

currentValue=`settings[key] ?? ''`，保留0/false；命令写回 raw field key，不规范化、舍入或按 originalField 改名。UI typed option 必须按严格相等提交；primitive true 对应 source 字符串 `'true'`，object.value=true 才是布尔 true。

### 原非数组 visible settings 的安全适配

公开20项中 nebula-2.1/nebula-2-flash 的 config.settings 为 mode object。r2 可取 text2image defaults，但 r3 R 对该对象直接 `.map`。源 getModel module516476 在 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) 225450 返回 raw schema，未平铺对象；这是静态可证的不兼容，未运行原站确认线上异常。

按 Root 明确授权，本机 **保留 r2 defaults，fields=[]，visibleSettingsSupported=false**；视图显示参数暂不支持编辑、可使用默认值或切模型的说明。确认仍按原模型/选择/prompt gates，不额外禁止。未套用 video mode-object 可见字段规则，未冒称源码本来支持它。专项使用这两项实际 schema 验证。

其他损坏的 defaults 列表或 enum 非数组由纯模型原子 invalid，caller 可报错而不会执行 source `.map`/迭代崩溃。这些是非法数据安全边界，不是新 schema 正向功能。

## 目录名称、禁用和确认

`rG` 1144748：非空 string modelName→非空 string schema.displayText→modelKey，均检查 length 不 trim。空格名称保留。不借用 entry.displayText/schema.modelName，也不根据原 metadata 猜 VIP 权益。

disable 直接核 [04q9x43g2p9-v.js](./source/04q9x43g2p9-v.js) module255534，15402附近：true、trim 非空 string、非空且非数组 object 禁用；string reason trim；object reason 当前 language→en，不额外 zh fallback，无可读 reason 仍禁用。空对象、数组、false、0、空白 string 不禁用。

所选当前 raw row `!row.imageGenerationPrompt` 即缺提示词，**不 trim**。空字符串/null/undefined/false/0 阻断；空格字符串保留并允许。plotDescription 只供显示，不代替确认所需 imageGenerationPrompt。未选行缺 prompt 不阻断。r3 不额外要求所有资产 ready，不套视频时长或视频 prompt 条件。

```text
disabled = selectedSet.size===0
  || 当前模型不在 candidates
  || 当前候选缺失/disabled
  || 所选当前 raw rows 有 falsy imageGenerationPrompt
```

tooltip 只有两条 source 文案：缺 prompt 时“请先合成提示词后再创建分镜图生成器组”；否则“创建分镜图生成器组后，可在画布中整组执行批量生图”。空选/目录禁用仍是第二条说明，不发明其他 source tooltip。按钮为“确认并创建生成器组 ({count})”，count=Set.size。

确认 payload 严格 `rows.map((_,index)=>index).filter(index=>selected.has(index))`，按当前 raw 升序，不按 Set 插入顺序、shotNumber 或 UUID。配置不含 schema/perShotDurations/合规数据。历史越界项可让 source button enabled 而 payload indices=[]；tQ 1381512 此时不关闭、不建图。本机 builder 保留空 array，caller/graph 应明确拒绝无选镜而不能创造假节点。

## 本批纯 API 与责任范围

文件 [v2-image-config-model.js](../src/features/canvas/storyboard/v2-image-config-model.js)，没有 React、I/O、service、graph、存储或反向 UI import。

```text
resolveScriptV2ImageCatalogue({models,support,requiredRefs,currentModel,language})
  → {valid,reason,keys,defaultModel,currentModel,options}
createScriptV2ImageConfigState({rows,initialSelected?,models,support,refCounts,language})
reconcileScriptV2ImageConfigState({state,rows?,models,support,refCounts,language})
changeScriptV2ImageConfigState({state,...context,command})
  → {valid,reason,state}
projectScriptV2ImageConfig({state,...context,translate?})
  → schema/config/catalogue/currentModel/options/fields/visibleSettingsSupported
     selectedCount/totalCount/allSelected/someSelected/requiredRefs
     rowDisplay/emptyPromptIndices/canConfirm/confirmTooltip/confirmLabel
buildScriptV2ImageConfirmPayload({state,...context})
  → {config,selectedIndices:Array<number>} | null
```

state 为 `{rows,config,selectedIndices:Set<number>,expandedIndices:Set<number>}`。context 的 refCounts 为当前完整 raw-index Map；language 默认 zh。fields 是预投影 `{key,type,values:[{value,label}],originalField,isAspect,currentValue}`。

commands：model(value)、setting(field,value)、toggleRow(index)、toggleExpanded(index)、toggleAll。纯 change 仅接实际可点击选项；非法 typed option/current row 边界不写坏 state。目录损坏、重复 modelKey、非法 rows/Set/refCounts 原子 invalid；重复/缺失 hiddenUuid 在此索引表单内不拒绝，图计划拥有自己的文档标识安全规则。

Root 持 loading/error/retry、文档/节点身份、readonly/ready、草稿 flush、CAS、graph/history、保存重试和焦点生命周期；graph owner持 sC 精确构图，UI owner持源布局和共享 selector。没有改旧 video/v1 helpers，也不使用独立 image form 的参数规则替代视频。

## 实际专项验证

官方 bundled **Node v24.19.0**：77项纯模型测试通过，`04:46:48` 开始、373ms；日志 [canvas-v2-image-config-model-tests.log](../artifacts/canvas-v2-image-config-model-tests.log)。涵盖初始两阶段、source range/disable、raw索引增删/换序/越界、typed enums/原 key/default、model reset/idempotence、falsy/空格 prompt、按 raw 升序确认及真实20项目录/两项 mode-object 安全适配。

ESLint 定向 exit0、无告警；两项生产/测试文件的 Prettier check exit0。审计位于默认忽略的 research 目录，另用显式 ignore-path /dev/null 格式化。未运行完整工程 check，未做原站登录、真实账号权益、费用、任务或生图正向验收。controller/视图/构图的联合与原生浏览器验证由主任务另行记录，不把纯模型通过数当作整条功能或全站已完成。
