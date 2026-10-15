# ScriptV2 空态预设：纯建图与代表性样本审计

2026-10-12。本批直接静态读取公开归档，未执行原 bundle、登录、访问账号资源、调用原站写入或生成。新增独立纯模型、测试及一个很小的 JSON 样本；不修改 controller、React 视图、旧模型或全局文档。字符偏移均为解码文本的 **0-based 字符位置**。

## 1. 证据与入口

| 证据                                                        |                                              偏移 | 直接协议                                                              |
| ----------------------------------------------------------- | ------------------------------------------------: | --------------------------------------------------------------------- |
| [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js)，module272776 |                            imports1058854–1058899 | nT=713118几何，nM=182004枚举，nR=131525预设                           |
| 同上                                                        |                                         tL1370304 | 剧本预设：最新 getNode、单text resource、单edge                       |
| 同上                                                        |                                         t_1370813 | 角色预设：最新 getNode、两image resources、两edges、script data patch |
| 同上                                                        |                                         tO1372080 | 手写：open、confirm-shots、一空行/空资产/table/default                |
| 同上                                                        |                   eB1347911，eH1348001，eX1348611 | 空态/有连接pending与内嵌生成器显示范围                                |
| 同上                                                        |                 empty host1384466，actions1385298 | 三个functionKey与真实callbacks，readonly交给hint renderer             |
| [0g_ndv267tmwf.js](./source/0g_ndv267tmwf.js)，module131525 |                 module112，m1093–2376，export6505 | SCRIPT_PRESETS完整字面对象                                            |
| [1kb-4b4zv9_2a.js](./source/1kb-4b4zv9_2a.js)，module713118 |                                       NODE_GAP761 | NODE_WIDTH350 / NODE_HEIGHT_EMPTY350 / NODE_GAP100                    |
| [170exq-5f14zz.js](./source/170exq-5f14zz.js)，module182004 |                               type170，action1987 | text/image/script-v2与资源/生成action的实际string值                   |
| [0leiedr1esdbe.js](./source/0leiedr1esdbe.js)               | e059015/e159035/e259192/e459295，e559464，e859962 | store默认避碰，不是renderer手动尺寸                                   |
| 同上                                                        |                      addNode95779 / addNodes96650 | 名称规范化、root prepend、默认避碰、creation/sync边界                 |
| 同上                                                        |                           addEdge114445 / ig84695 | append edge并重算incoming；target.params存在时才走通用投影            |
| 同上                                                        |                    updateNodeData110198 / t479043 | shallow合并data，嵌套params整体替换                                   |

三个空态UI入口分别为“剧本生成分镜脚本” `scriptToStoryboard`、“角色生成分镜脚本” `characterToStoryboard`、“自己编写分镜脚本” `writeStoryboard`。第三项仍复用上一批独立 `createScriptV2ManualPatch`；本模型仅处理前两项，未另造手写动作。

empty表面来自无整脚本busy/failure、raw rows空、无incoming/outgoing连接。添加上游edge后，它自然转pending；不是新建一项script task。源tL/t_ callback本身只检查最新Q(scriptId)存在，readonly/形态/ready等可交互资格由host/controller持有，不把source callback无关的workflow allReady、选镜或费用门槛塞入模型。

## 2. tL：剧本预设

调用genId(TEXT)后addNode一个root：

```text
type: 'text'
data: {
  type: 'text', name: '文本',
  content: [SCRIPT_PRESETS.textToScript.textPrompt],
  action: 'text_resource'
}
position: {x: latestScript.position.x - 350 - 100,
           y: latestScript.position.y}
sourcePosition: 'right'
targetPosition: 'left'
```

随后genId(edge)添加明确source/target handle的edge：source=newTextId、sourceHandle=source、target=scriptId、targetHandle=target。没有显式edge type/data、selected、focus或fit。

**没有script data patch**。预设对象另有 `textToScript.scriptPrompt`，但tL不使用它；不能擅自写该值到script.params.prompt。文本是一项content数组，不能改为prompt或拆成多项，也不strip Markdown、trim空格、重排原换行。

## 3. t_：角色预设

源先生成两image IDs，再一次addNodes([character1,character2])，两项都为root。共同x=latestScript.position.x−450。初始y计算：

```text
centerY = latestScript.position.y + 350/2
hintHeight = Math.round(.75*350) = 263
firstInitialY = centerY - 20 - hintHeight = scriptY - 108
secondInitialY = centerY + 20 = scriptY + 195
```

hintHeight只参与初始位置，**不是持久化height**。两个node data为：

```text
type: 'image'
name: '角色 1' / '角色 2'
url: [characterImages[0]] / [characterImages[1]]
alt: '角色参考图 1' / '角色参考图 2'
action: 'image_resource'
```

两项sourcePosition right、targetPosition left。没有width、height、measured、style、params、model、parentId、selected或taskInfo。随后按角色1→角色2创建两条source/target edge，handle与tL相同。最后仅给script写：

```text
{params:{prompt:SCRIPT_PRESETS.characterToScript.prompt},
 action:'script_generate'}
```

source updateNodeData是data层shallow merge，故params整体替换，**不保留旧params.model/setting/mediaLists**。其他script data保持原值，没有清rows/assets/views/taskInfo，没有提交生成任务，也没有打开全屏。caller不能把这个patch当mode推断结果或真实生成成功。

源addEdge会对当前有params的target重算incoming，但t_随后把params覆盖为{prompt}。后续生成器incoming与schema effects是另一层owner协议，由主任务接线及独立integration审计维护；本模型不在params中假造媒体列表或默认模型。

## 4. 默认store避碰与插入次序

tL/t_没有给store传skipOverlapResolution，因此必须保留addNode/addNodes默认e5/e8规则。单看callback初始x/y不等于最终store position。

- 新resource碰撞尺寸默认350×350，尽管node没有持久化尺寸字段。
- existing node尺寸为measured.width/height→stored width/height→350的nullish优先级；measured0保留，null回退。此路径不使用data.contentWidth/Height、params.ratio或实际图片自然尺寸。
- existing位置直接取node.position，**不递归parent世界坐标**。hidden、child、temporary都没有被排出障碍集合。
- margin=NODE_GAP/2=50，严格矩形边界：恰好50px间隙不碰。
- 默认方向vertical，只向下移动，最多30轮。每轮对所有相交项求两个y边界绝对距离的较小值，然后取最大作为本轮下移；不是只检查第一个障碍、无限循环或直接找世界下边界。
- e8按传入newNodes顺序逐个放置，每个最终结果再加入后续障碍。因此第二角色图片会避开第一图片。即使画布只有目标script，无其他障碍：第一最终y=scriptY−108；第二初始y=scriptY+195会被推到 **scriptY+292**，两项350高加50gap。
- 原store root addNode用unshift；addNodes用unshift(...roots)，所以两角色最终前置顺序仍角色1→角色2。edges依创建顺序push。source没有清既有选择、新选或fit。

新纯模型直接保留e5/e8已证规则。已有child原position也参与raw避碰；不把raw定位quirk擅改成world。caller若未来明确做world适配，应单独记录，并保持source协议可验证。

source store还加createdAtMs、incarnation、同步enqueue与创建报告。本模型没有时钟/I/O/遥测，也不为节点补未由callback指定的timestamps或尺寸。主任务使用本地同步CAS/history/autosave替代这些服务依赖，不能声称原站协作同步已接入。

名称规范化不意味着同名去重：`t4`79043只在原name不是有效truthy string且label存在时补name，并删除label；`i_`89212只在`data.type && !data.name`时补`typeLabel+(已有同data.type节点数+1)`。它不查名字重复、不trim，也不给已有非空name加suffix。tL明确传“文本”，t_明确传“角色 1/2”，因此即使当前图已有同名节点或重复使用预设，store仍保留这些名字；新模型的固定源名无重复name语义差距。addNodes的同型计数规则仅适用于缺名节点，不能用来给这两个已有命名角色重编号。

## 5. 小型公开JSON样本及素材准备

owned [script-presets.json](../public/data/script-presets.json)为 **2516 UTF-8 bytes**，只摘录本轮实际入口所需的textToScript/characterToScript；保留textToScript原scriptPrompt字段，但不采集未调用的videoToScript或其他quick-experience内容。

抽取使用Acorn静态AST，只接受ObjectExpression/ArrayExpression/Literal/无插值TemplateLiteral并读取cooked字面值；**未eval、import或执行原bundle**。模板内原`\xd7/\xb7`依法解码为实际×/·；这不是改写原文字。JSON保持所有换行、行尾空格和Markdown标点。

| 字段                     | JS字符数 | UTF-8 bytes | SHA-256                                                            |
| ------------------------ | -------: | ----------: | ------------------------------------------------------------------ |
| textToScript.textPrompt  |      544 |        1431 | `4031d3e4a7e253a348554da119f43779c1abdd19ea2558b68468f877dfd8ac6a` |
| characterToScript.prompt |      207 |         601 | `d7b388887cb4a2b9cb178081cf85de2a6a9b1cb148e9d24d400ac31714debfaa` |

原文完整保存于JSON；测试校验全文digest与关键cooked字面值，没有用摘要代替source故事。两项公开图片素材准备清单，原URL直接来自characterImages[0/1]：

1. [角色1原图](https://liblibai-online.liblib.cloud/web/ea95cb51f3d94addbb92dc003cd33b49/b6989b27-e725-4958-a062-e8dfb3312db3.png)
2. [角色2原图](https://liblibai-online.liblib.cloud/web/ea95cb51f3d94addbb92dc003cd33b49/fe840bb1-649e-4664-a23d-30f5ecf8e36c.png)

本worker没有下载素材或修改assets manifest；Root持素材映射、代表性读取与useContent加载。模型不读取JSON或服务，presets由caller注入；loading/error/retry由controller持有。未证下载状态不能标图片素材验收完成。

## 6. 纯API与调用方协议

owned [script-preset-model.js](../src/features/canvas/storyboard/script-preset-model.js) / [tests](../src/features/canvas/storyboard/script-preset-model.test.js)：

```text
validateScriptV2Presets(presets)
  → {valid,reason,
     actions:{scriptToStoryboard:{enabled,reason},
              characterToStoryboard:{enabled,reason}}}

buildScriptV2PresetPlan({
  kind:'scriptToStoryboard'|'characterToStoryboard',
  script,nodes,edges,presets,makeId
})
  → {valid,reason,addedNodes,addedEdges,
     scriptPatch:null|{params:{prompt},action:'script_generate'},
     submitted:false}
```

`script.id`只作为selector，模型从最新nodes取目标script的raw position。Root持文档/ready/readonly/同ID重建所有权与current graph CAS，pure不承诺仅ID即可阻止跨文档迟到操作。makeId(prefix)按source调用次序：text→edge，或image→image→edge→edge。

caller一次提交：

```text
nodes = [...plan.addedNodes,
         ...current.nodes.map(仅目标script shallow data合入scriptPatch)]
edges = [...current.edges,...plan.addedEdges]
```

scriptPatch.params整体替换；不要嵌套合并旧model。无patch的文本入口保持script data，后续incoming投影由既有owner处理。原选择保持，禁止补fit/新选。一次成功CAS对应一次history；存储Quota只重试保存这个已建图结果，不能重跑makeId再复制预设。

### 本机安全适配

源码常量本身完整，无catalog错误分支。本机useContent可能缺失/损坏，因此validator单独给两项enabled，plan只要求当前入口自己的字段合法，不把另一入口缺失当本入口坏。缺/坏presets返回invalid-presets且不调用makeId；不将内部reason直接显示为用户文案。prompt只要求非空string并保原值，不trim；图片按索引0/1校验非空string，防稀疏数组产生undefined URL，额外索引不消费。

图/坐标/尺寸坏值、新ID无效或与既有节点/边及新ID碰撞时原子invalid，addedNodes/addedEdges空、scriptPatch null，无部分图。位置必须finite，collision尺寸必须finite且非负；source0尺寸保留。已有dangling但字段完整的edge不被擅自删除。此类防坏图/标识守卫是本机适配，不是原站权益或任务门槛。

纯模型无React、listener、异步服务、浏览器存储、随机或任务提交，不序列化整张图；仅遍历placement所需的raw节点盒子和ID。text/image的data数组是新建，未改传入nodes/edges/presets。无content采集扩范围。

## 7. 实际定向验证与未验证范围

官方bundled **Node24.19.0**：owned 1文件 **52项全部通过**，05:40:09开始、445ms；日志 [canvas-script-preset-model-tests.log](../artifacts/canvas-script-preset-model-tests.log)。定向ESLint与生产/测试Prettier检查exit0。覆盖全文digest、原节点/edge字段、ID次序、参数替换、raw nested定位、store measured优先/0/null、50px边界、hidden/child/temp障碍、多图顺序避碰、30轮上限、目录单项独立资格、坏配置零ID、ID失败原子结果、输入冻结及无全图序列化。

本worker未跑fullcheck、浏览器/native交互、真实素材加载、实际controller保存/撤销或任何任务服务。主任务后续联合/完整检查与验收独立记录，不能用这52项pure测试代表这些步骤通过。当前功能是本地预设建图，真实生成/账号/消费与原站同步继续未接入。
