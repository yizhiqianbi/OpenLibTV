# ScriptV2 专用生成器纯模型源码审计

2026-10-12。直接静态核对公开归档及config-182，不执行原bundle、不登录、不读取账号或请求生成/费用/上传。owned新增模型、输入模块、各自测试及1172bytes独立目录JSON；未修改旧generic helper、Root/controller/视图或全局文档。位置均为解码后的0-based字符偏移。

## 1. 实际caller及依赖

| 归档文件                                        | 模块/偏移                              | 确证协议                                                                                                   |
| ----------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [1sutpu54cdy46.js](./source/1sutpu54cdy46.js)   | 327466，专用renderer5347               | currentModel=storedmodel或global.defaultModel.text；getModel(scriptText)；$ builder；core；type=text rules |
| 同上                                            | 5209167606                             | 独立scriptText ModelSelect、翻译/可用voice/生成；没有mode/count/settings控件                               |
| [1eqsg-pmc0mun.js](./source/1eqsg-pmc0mun.js)   | 45043961251，init export61280          | 原params保留，仅缺model时补；完全无params才prompt空/count1                                                 |
| 同上                                            | 427044，`$`77680                       | script-generate-v2、TEXT与ordered typed media、source_images                                               |
| [3lfysz4968xc9.js](./source/3lfysz4968xc9.js)   | 35493920819 / core20936                | 首次初始化、incoming identity刷新、model变更与普通patch                                                    |
| 同上                                            | 52963923972 / 82199224897              | eval context与默认rules；上游TEXT满足prompt                                                                |
| 同上                                            | 50335725018 / 6163726581 / 91674928139 | sanitize / evaluate / useCanGenerate，显式空rules不是默认rules                                             |
| 同上                                            | 81405919800                            | 直接edge优先删除；group按全部展开leaf数判断delete/exclude                                                  |
| [0leiedr1esdbe.js](./source/0leiedr1esdbe.js)   | S6233 / A8022 / w8554 / target11067    | TEXT正规化、group展开、完整incoming collector、virtual/focus/refImages                                     |
| 同上                                            | 67741812141                            | applyMediaListOrder：nodeId Map、最后duplicate winner                                                      |
| [1jgo2qrsqidfu.js](./source/1jgo2qrsqidfu.js)   | 70441813359                            | ensureMediaListOrder，用当前非空实际nodeId刷新order                                                        |
| [3zez5ighjd7k4.js](./source/3zez5ighjd7k4.js)   | 8558471222，disable7129，effect8432    | support.scriptText菜单、disabled移末排序、已选disabled首个可用回退                                         |
| [config-182.json](./source/api/config-182.json) | data.linkUrl解析后scriptText           | 真实三个模型元数据，不是十四项普通text目录                                                                 |

本模块虽然查text schema、调用type=text的requirements，仍是SCRIPT_V2的独立renderer/builder。不能将节点type改成text后套generic resolver。actual source给`useGeneratorCore`没有onIncomingSync/modelSwitchPatch/normalizeParams；不能顺便做media模式推断、设置重置或schema默认参数补齐。

## 2. 原params与task projection

`initScriptGeneratorParams(params,schema,currentModel)`不使用schema：已有params/model即原对象；已有params但model falsy且currentModel truthy，仅浅补model；无params才`{prompt:'',model:currentModel,count:1}`。已有count0/旧mode/settings/advancedSettings/private字段保留，不因没有可见设置UI而清除。

`$`基于上述initial params，明确覆盖：

```text
scene:'script-generate-v2'
textList: incoming.textList
imageList: applyMediaListOrder(incoming.imageList, initial.imageListOrder)
videoList: applyMediaListOrder(incoming.videoList, initial.videoListOrder)
audioList: applyMediaListOrder(incoming.audioList, initial.audioListOrder)
scenePayload: oldPayload保留其它key，并更新/移除source_images
```

order为空或列表长度<=1直接保原list，包括duplicate direct refs；非空order且多项时用nodeId Map，重复nodeId由最后ref覆盖，按order消费一次，再追加remaining Map insertion order。这不是URL去重，也不是generic stored-list order fallback。

source_images遍历最终ordered imageList；仅同时有truthy nodeId/url的项形成`{ref_id:'src_img_{index+1}',node_id,url,display_name?}`。label truthy才display_name，不trim。空URL项仍占列表index，因此跳过它之后ref_id会跳号；不能filter后从1重编号。没有图片时只移除旧source_images，其他payload keys保留，没有其它key才undefined。不把TEXT拼入prompt，不把媒体当输入故事文字，也不合入incoming studio fields。

本模型返回params为$ projection，initializationParams再经ensureMediaListOrder。source核心初始化/incoming effect确实system-write整params；本机Root选择只派生，不在mount增加历史，合法用户动作才同次commit派生结果。这是明确生命周期适配，不宣称source mount写入完全相同，也不能给预设再制造第二次history。

## 3. source collector与本机TEXT覆盖

旧`collectCanvasConnectionInputs`只提供text nodeId统计，按nodes顺序，且缺virtual/focus/character edge参考，另有characterAsset主图合成分支；旧`collectGeneratorMediaInputs`直接排除TEXT、筛空/pending媒体及合入stored refs。两者均不能在此处冒充417754。

新增独立 [script-generator-inputs.js](../src/features/canvas/storyboard/script-generator-inputs.js)：

- incoming roots按target edges顺序；排portraitVirtual/assetVirtual普通root。missing source node忽略。
- source group种类仅data.type为group/video_group/video-story且!characterAsset。若root没有可展开group，A直接返回原roots，duplicate direct edges保留；有group才启动全局seen去重。
- group展开按实际parentId与graph顺序，不按childNodeIds；depth>=8的group停止；cycle用seen结束。groupRefExcluded只排depth>0成员；被排成员也进入seen，后来的direct edge可能因访问次序不再加入。不得静默改成“direct永远优先”。
- REFERENCE不产生input。characterAsset group不自行生成image；显式edge.characterRef才附加image ref。
- TEXT source S：非空string→[原string]、空string→[]、array过滤非string但保留空string、其它→[]。不trim/拼接。
- 图片严格首项，hidden/watermark用url；其他图片有非空originalUrl则取originalUrl[0]。不寻找第二非空URL，不筛pending/blob/data，不追加params旧media。实际resourceMeta仅items[0]且kind匹配；0和其它非null metadata保留，不以node盒子作资源尺寸。
- source image portrait proof、video/audio asset IDs、video proof/subtitle/首个合法transition等字段保留。video字幕trim，transition要求type非空trim、duration finite>0。相同URL的不同node保留。
- source target collector另把**全部target edges**的characterRef追加，即使该edge是virtual；再追加target.refImages固定`${targetId}:ref-index`；最后focusRegion按nodeId排image。不要把virtual root排除扩大为character metadata丢弃。
- directorStudio取最低lexicographic nodeId，保source studioDimensions/cameraControl/cameraPresets元数据；它不是本脚本task params的消费字段，不能因为它有控制参数而展示脚本设置或假运镜。

本机CanvasNode实际编辑TEXT写data.text且旧content留在data。默认collector使用**typeof data.text==='string'的显式值**覆盖sourcecontent，包括空字符串→[]，避免清空后旧预设复活。没有data.text则仍sourcecontent；`localTextOverrides:false`可直接验证源路径。不拿TEXT的params.prompt当另一份故事。这是明确本机字段适配，不是原站content字段变更。

## 4. source rules与canGenerate

专用caller调用`useCanGenerate({type:'text',params,modelSchema,incomingData})`，没有modeType参数。故即使历史params.modeType存在，eval.currentModeType仍undefined，forModeTypes不据此筛rule；单一forModeTypes只影响失败文案prefix。不能推断image2text后改变requirements。

schema.rules undefined才默认require prompt；显式[]直接allow；null/非array或sanitize后无有效require项也为空rules而allow，不被替换为默认。有效require token仅prompt/image/video/audio/media，mode只有any否则all，whenHas仅有效token且全部存在时才检查该rule。messageI18nKey有效翻译优先，否则原string message，否则按locale生成“请输入提示词”等精确中文连接词。

hasPrompt为清理Panorama720/SlashPreset标记后的本地prompt非空，**或incoming任一TEXT.content数组长度>0**。因此source数组['']、[' ']也可满足prompt；字符串空值正规化[]则不行。image/video/audio/media按incoming列表长度，不验证URL生成完成状态。两图无prompt不能满足默认text require，文本预设可在脚本prompt=''时满足。专用caller不启用video camera模式，因此CameraPreset/Image等其它mention token本身仍可作为非空prompt；projection不改已保存prompt文字。

本机schema缺失显式valid=false/canGenerate=false，保原参数并给中文配置错误；这比sourceuseCanGenerate仅默认rules更保守，属于未加载schema的写安全适配，不能报假ready。canGenerate是客户端requirements，不代表真实生成服务或模型/账号权益已授权。真实生成、费用、会员、voice/翻译服务不在pure模型执行。

## 5. typed reorder与sourceexact graph删除

source V只对非mixed写`${type}ListOrder`。new `reorderScriptV2References`仅image/video/audio，校验nodeId多重集合permutation；mixed、无效或无变化返回null。只改变该typed order，不改其它order、prompt/token、URL或unknown params。duplicate source ID按次数校验，不以Set粗删。

source814059直接查首条sourceId→targetId edge，不先检typed媒体/URL；找到则删除该edge。否则按target edge顺序检查group，展开**全部source leaves**：包含REFERENCE/custom/暂无URL的成员。<=1叶子删group edge，>1仅追加groupRefExcludedNodeIds。新增`planScriptV2ReferenceRemoval`复用同一expander，避免generic helper按typed有效input数误删仍有其它成员的group edge。不是删除源node，也不以URL删同图其它参考。

本机旧snapshot可能残留stored lists/order，new plan按sourceId清旧typed/text/mixed列表及orders，避免caller持旧params复活参考；freshresolve始终来自graph，不合并这些stored refs。explicit prompt仅作为已flush草稿原样passthrough，不重写token。Root可在计划后的最新图上再次resolve，将initializationParams与Graph改动同次CAS提交；不创建第二history。source后效incoming同步与本机这个原子persist安排应区分记录。

节点/边/目录重复identity、坏数组、非record params、非array order等返回invalid或null，没有假task或部分图。source constant目录从不损坏，这些守卫属于本机安全适配。

## 6. 独立三项目录与API

owned [script-text-support.json](../public/data/script-text-support.json)是静态JSON读取config-182.data.linkUrl.scriptText后的逐项原数据，`{items:[...]}`，1172 UTF-8 bytes：

| modelKey       | 目录原modelName | estimatedTime |
| -------------- | --------------- | ------------- |
| aurora-3-prime | GVLM 3.1        | 20s           |
| cvlm-5.5       | CVLM 5.5        | 10s           |
| aurora-3-lite  | GVLM 3.1 Flash  | 15s           |

保原platform/prefix/labels/icon/description，不用schema普通文本别名覆盖目录。目录加载、失败与重试由Root/useContent持有；pure无JSON/import bundle/I/O。三项实际均无disable。未来disable按source255534 true/非空string/非空record解析，指定language→en原因fallback，并稳定移末排序。current model保持stored||global.default.text，不把缺目录的已存model偷偷改成第一项。

sourceModelSelect有已选disabled时首个non-disabled effect回退；pure只投影metadata，controller未因mount自动写图。三项样本均不触发该分支，不能把它写成已有disabled模型浏览器验收。练习锁、benefit/VIP/费用bus没有用本地actor伪造。

主要owned API [script-generator-model.js](../src/features/canvas/storyboard/script-generator-model.js)：

```text
resolveScriptV2Generator({node,nodes=[],edges=[],models,support,
  incomingData?,params?,language='zh',translate?})
 → {valid,reason,model,modelList,modelKeys,schema,params,
    initializationParams,incoming,inputMedia,references,inputIdentity,
    canGenerate,reasons,error}

initScriptV2GeneratorParams({params,currentModel}) → params|null
buildScriptV2TaskParams({nodeData,incomingData,currentModel}) → params|null
ensureScriptV2MediaListOrder(params) → stable params|null
patchScriptV2GeneratorParams({params,patch}) → complete params|null
patchScriptV2GeneratorPrompt({params,prompt}) → complete params|null
reorderScriptV2References({params,references,listType,order}) → params|null
planScriptV2ReferenceRemoval({nodes,edges,targetId,sourceId,prompt?})
 → {nodes,edges}|null
```

references/inputMedia同一record：textList及typed ordered image/video/audio、mixedList串接三种ordered媒体。view text label与mediaType仅在references添加，不污染source task params。modelList是原metadata array+disabled/disabledReason，modelKeys同顺序；schema只取textModels。scene source_images保持原snake_case字段。inputIdentity是四组窄ref结构，保URL/正文值，不把整图/长dataURL串成JSON。pure没有React/listener/随机/存储/任务提交。

### 已补齐的source prompt-change core w

追加直接核对core `w` [3lfysz4968xc9.js](./source/3lfysz4968xc9.js) **22703**，新增独立pure prompt-change出口；不修改generic helper。regex来自 [1fuxk6hkx6iug.js](./source/1fuxk6hkx6iug.js) module838978：MENTION定义4976/export20657，MAGIC定义5165/export20574。

```text
MAGIC_TOKEN_REGEX = /\{\{magic:([^:}]+):(\d+)\}\}/g
MENTION_TOKEN_REGEX =
 /\{\{(Image|Portrait|Video|Audio|Mixed|Element|CameraPreset)\s+(\d+)\}\}/g
```

magicList非空时仅保正文中exact lowercase magic token引用的key；没有剩余key则patch undefined，再经A去undefined。不会删正文中的unknown token、不按token尾数字重排magic metadata，也不把Magic大写视为magic。全部旧key仍引用时保原对象，不改已空容器。

cameraPresets非空时从MENTION tokens只收CameraPreset的1-based整数，在**原数组顺序**保被引用项，旧index→压缩后index的Map用于文字重映射。只有preset数量确实减少时才patch数组；若Map.size>0，所有CameraPreset tokens执行replace：映射到有效index则标准化token，未映射项变空string；Image/Video等其它token保持原值，空白不另规范化。若Map.size===0，数组字段删除但正文不rewrite，unknown camera token原样；若全部原项仍引用，即使有额外unknown/leading-zero/换行token，也完全不rewrite。不能将这三种状态合并为“unknown永远删除”或“unknown永远保留”。

新`patchScriptV2GeneratorPrompt({params,prompt})`最终调用A shallow merge/filter undefined，保model/count/mode/settings/advanced等其它字段，不依赖schema或任务服务。Root先A合其他patch，再w处理最终已flush prompt，避免最后raw patch.prompt覆盖canonical tokens；owner/重复操作/draft失败由Root持有。该helper的强专项校验如下，不代表实际view、private Magic服务或CameraPreset目录已接入。

## 7. 实际验证

官方bundled **Node24.19.0**：owned两文件 **105项全部通过**，06:13:32开始、533ms；日志 [canvas-script-generator-model-tests.log](../artifacts/canvas-script-generator-model-tests.log)。定向ESLint0/Prettier0。input测试32项、model测试73项；覆盖defaultrequire缺whenHas、空rules、TEXT数组/本机清空、exact metadata/URL0、conditional group去重/depth/cycle、virtual-character/refImages/focus、ordered跳号source_images、原params/计数保持、typed-only reorder、fullleaf group删除、同URL不同ID、atomic invalid、magic prune及camera映射三分支、无全图serialize。

未跑fullcheck、原站账号/请求、浏览器/native、真实生成/费用/voice/翻译、actualNodeCanvas草稿/保存/撤销。Root及view/controller专项和最终检查另记，不能把pure专项替代实际界面或全部source依赖验收。
