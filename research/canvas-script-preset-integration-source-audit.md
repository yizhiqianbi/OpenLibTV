# ScriptV2 空卡预设、专用生成器与原子接线审计

2026-10-12。只读核对归档源码和当前本地调用链；本文件不改生产代码，不执行原 bundle，不登录，不请求原站生成、费用或账号资源。源码位置均为 UTF-8 解码后的 **0-based 字符偏移**。按钮视图由本批另一 owner 维护，本文负责预设后续路径及本机图事务建议。

## 1. sT 的入口和状态并非普通 Text generator

主证据 [3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) 的 `sT` 从 1332047 开始。

| 位置              | 实际协议                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1340739 `ea`      | `useShouldShowGenerator(selected,id)`；普通单选或 reference/mark/focus 显式目标，完整优先关系见既有 target 审计                                                        |
| 1347911 `eB`      | 非 recompute 的整脚本 task busy → generating；整脚本失败 → failed；raw rows 非空 → resource；否则有真实 incoming **或 outgoing** edge → pending；再否则 empty_generate |
| 1348603 `eX`      | `!readonly && ea && (empty_generate                                                                                                                                    |     | pending |     | resource |     | failed)`；整脚本 generating 不显示专用 generator |
| 13851xx / 1385870 | empty 三动作分别接 `tL/t_/tO`，其下按 eX 渲染 `GeneratorFactory(SCRIPT_V2,id,incomingData)`                                                                            |
| 1386xx / 1386832  | pending 中间仅 90px Text2Icon，仍按 eX 渲染同一 generator                                                                                                              |
| 1389098           | resource/failed 同样可显示 generator；它与卡片上方四动作 toolbar 是两套入口                                                                                            |

预设创建完只改变输入图，因此没有 rows 时变为 **pending**，不是生成完成，也不是 task loading。源没有在 `tL/t_` 中打开全屏、切阶段、fit、显式选择引用或创建分组；不要把 legacy SCRIPT 的 `wrapNodesInPresetGroup` 分支搬到 v2。store 的 addNode/addNodes 不写 selected，这也不能用新增引用自动抢选区来模拟。

`ea` 是独立资格协议，不等于 `selected.includes(id)`。当前本机尚无 reference/mark/focus 完整模式；只有真实唯一选择的资格可以准确映射，不能编造模式状态。详见 [target 审计](./canvas-script-toolbar-target-source-audit.md)。

## 2. 两个预设的精确 graph patch

### 文本 → 分镜：tL 1370304–1370813

读 `getNode(scriptId)`；不存在直接返回。新增 root TEXT 资源：

```text
data = {
  type: TEXT,
  name: translate(common:nodeText),
  content: [SCRIPT_PRESETS.textToScript.textPrompt],
  action: TEXT_RESOURCE
}
position = {x: rawScript.position.x - NODE_WIDTH - NODE_GAP,
            y: rawScript.position.y}
sourcePosition = Right
targetPosition = Left
edge = {id, source: textId, sourceHandle:'source',
        target: scriptId, targetHandle:'target'}
```

没有脚本 prompt/action/rows/assets patch。上游是 **content 数组**，不是 textarea 文本或生成器 params.prompt。正常常量 NODE_WIDTH=350、NODE_GAP=100，起始 x 为脚本 raw x−450。raw position 是源行为；组内节点的世界位置与 root 资源 placement 不能悄悄混称一致。

### 角色 → 分镜：t_ 1370813–1372080

两张 root IMAGE 资源依次进入 `addNodes`。data 分别为 `type:IMAGE`、翻译名称角色/角色2、对应 `characterImages[0/1]` URL 数组、对应参考图 alt、`action:IMAGE_RESOURCE`；没有 image 生成器 params、显式 flow width/height 或 parentId。

```text
x = rawScript.x - 350 - 100
midY = rawScript.y + NODE_HEIGHT_EMPTY/2 = rawScript.y + 175
r = round(.75*350) = 263
first desired y = midY - 20 - r = rawScript.y - 108
second desired y = midY + 20 = rawScript.y + 195
```

每张一条 source/target handle edge，然后对脚本做 **浅 data patch**：

```text
{params:{prompt:SCRIPT_PRESETS.characterToScript.prompt},
 action:SCRIPT_GENERATE}
```

这里 params 是整块替换，不能误写为保留旧 model/count/lists/settings 的深 merge。它不清 title、rows、assets、taskInfo、views，也不启动任务。预设 URL/正文由新 pure preset model owner 原字摘录，本文不维护第二份素材常量。

### store 避重叠和输入同步影响最终图

证据 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js)：`e5/e8` 59464/59962、addNode 95779、addNodes 96650。

- root 新节点默认执行避重叠，尺寸取 measured → stored → NODE_WIDTH/NODE_HEIGHT_EMPTY；没有显式尺寸时用 350×350。
- margin=NODE_GAP/2=50，默认只向 y 正方向移动，最多 30 次；touch/overlap 判定和碰撞位移由 e2/e4 决定。
- addNodes 按入参数顺序处理，前一新节点的最终盒子成为后一项障碍；既有 hidden/parent children 也参与该 helper 的 raw-position 检查。
- 上述 tL/t_ 坐标只是 desired position，不能将两张图片始终 y−108/y+195 当最终位置证据。

addEdge 114445 触发 `ig` 84695。SCRIPT（legacy）有专门分支；SCRIPT_V2 进入 generic incoming recalc，且只有 target.data.params 存在时才同步。generic 会写当前 textList、image/video/audio 列表和 mention 相关投影。`t_` 的最后 updateNodeData 110198 对 data 浅合并，故刚同步到 params 的内容又被 `{prompt}` 替换；**后续専用 generator 的 incoming effect 再建立可见参数**。本机要区分“预设 graph 的源 patch”与“generator mount 的派生参数”，避免旧 schema/推断效果偷偷形成第二段 history。

## 3. GeneratorFactory 的真实专用分流

[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) 139300–141625：SCRIPT_V2 默认映射 lazy module282660，注册表 [1nx1kclu6uvka.js](./source/1nx1kclu6uvka.js) 1264 将其加载为 [1sutpu54cdy46.js](./source/1sutpu54cdy46.js) module327466。TEXT 则是另一个 lazy465890，不能复用 TEXT view 冒称 ScriptV2 专用生成器。

专用 module327466（约 5460 起）读取：

```text
currentModel = node.params.model || global.defaultModel.text
modelSchema = getModel('scriptText', currentModel)
params = buildScriptV2TaskParams({nodeData,incomingData,currentModel,
                                 modelSchema,taskMode:'generate-full'})
useGeneratorCore({params,modelSchema,currentModel,incomingData})
useCanGenerate({type:'text',params,modelSchema,incomingData})
```

全局 getModel 的类型映射在 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) 224xxx/225321：scriptText→text schema。**schema 共用不代表目录共用**：底栏 ModelSelect(type='scriptText') 使用 support.scriptText；config-182 原 linkUrl 中该目录只有 aurora-3-prime / cvlm-5.5 / aurora-3-lite 三项，公开 textModels 有十四项。目录名称是 GVLM 3.1 / CVLM 5.5 / GVLM 3.1 Flash，不能以 schema.modelName 的普通文本名称替代全部 source 元数据。应通过 useContent 提供专用只读快照并保加载/失败/重试，不读取账号权益。

### 专用 UI 与可用性

module327466 的 GeneratorMainColumn 为 gap2/padding2：

1. 非 readonly “参考图”加号菜单：从画布添加 / 本地上传 / 我的素材；只导入 IMAGE，file accept png/jpeg/webp/gif、multiple，单文件超过30MiB跳过。源有真实上传 pipeline 和私人素材服务，当前只可复用本地合法上传与公开只读素材，不冒充账号库。
2. 当前引用列表，支持 typed list 重排、删除、插入 mention；mixed 重排被忽略。图引用按真实 incoming 刷新。
3. PromptInput `generatorType='script'`，值为 params.prompt，固定专用 placeholder“描述剧情片段、故事，为你生成分镜脚本”（实际 locale key `scriptV2GeneratorScriptStoryboardGenerate`，已与公开 locale-zh 核对）。
4. bottom row：scriptText 模型、翻译、可用时 voice、生成 icon button。**没有普通/高级 GeneratorSettings 或 mode/count UI**；源 params 中可有 count，不代表要展示数量选择器。

专用加图入口不是空卡“角色 → 分镜”预设，不能将 preset 和 add-reference 合并成一个按钮。全屏原脚本、三阶段编辑、r3 图片组、rg 视频组也不是本模块。

GeneratorFactory 139959 还包 ErrorBoundary/Suspense、readonly/collab readonly capture shield。源 eX 已排画布 readonly，源 collab shield 是另一状态；当前本机没有真实 collab 权限，不新造锁状态。

## 4. ScriptV2 参数、输入和提交并非 media-mode 推断

[1eqsg-pmc0mun.js](./source/1eqsg-pmc0mun.js) module450439 61281 `initScriptGeneratorParams`：已有 params 直接保留；没有 model 时仅补 currentModel；没有 params 才 `{prompt:'',model:currentModel,count:1}`。函数不读取 schema defaults，不推断 text2text/image2text 或生图模式。

同文件 77680 `buildScriptV2TaskParams`：

```text
{...initParams,
 scene:'script-generate-v2',
 textList:incomingData.textList,
 imageList:applyMediaListOrder(incoming.imageList,params.imageListOrder),
 videoList:applyMediaListOrder(incoming.videoList,params.videoListOrder),
 audioList:applyMediaListOrder(incoming.audioList,params.audioListOrder),
 scenePayload: oldPayload-with-current-source_images}
```

source_images 由 ordered imageList 中同时有 nodeId/url 的引用生成 `src_img_1..N`，含 node_id/url、truthy label 时 display_name；无图片时移除旧 source_images，但保留其他 payload key，没有剩余 key 才 undefined。图片和引用位置对应不能靠 URL 去重打乱。

incoming 证据：[1q5w-zbtkz5ka.js](./source/1q5w-zbtkz5ka.js) 772889 hook；[0leiedr1esdbe.js](./source/0leiedr1esdbe.js) 8554 collector / 11068 target collector。TEXT 的 content 正规化到 `{nodeId,content:[]}`；REFERENCE 类型不参与；图片取 protection/originalUrl 规则的首图，携带真实 resourceMeta、portrait metadata；普通 group 展开、virtual edges 排除、groupRefExcluded/focusRegion/refImages 均有已独立 source 协议。不要把 textList 拼进 prompt 或只复用当前的纯 media collector。

useGeneratorCore 在 [3lfysz4968xc9.js](./source/3lfysz4968xc9.js) 20936：初始化、incoming identity 更新补 media list order；无本模块自定义 normalize/onIncomingSync/modelSwitchPatch，所以不额外做普通 media mode 推断。model 切换保 settings/advancedSettings 但只换 model；写入由 controller 管理真实 owner。

useCanGenerate 同文件 28139，用 type='text' 及 schema.rules；rules undefined 才默认 require prompt，显式空 rules 直接允许。23972 buildEvalContext 的 hasPrompt 是清理标记后的本地 prompt 非空 **或任何 incoming text 的 content 数组非空**，不是只看脚本 prompt。文本预设即使脚本 prompt=''，仍满足公开模型的 require prompt；两图预设由预设 prompt 满足，只有两图而没有 prompt 默认仍不能生成。

真实生成按钮 module876083 在 [2iru1o_jok_2m.js](./source/2iru1o_jok_2m.js) 2465 后，识别 scene='script-generate-v2'（13947），构建 ScriptV2 task context，使用 submission session/continuation owner，调用真实 task 服务并写 loading/taskId。费用、限流、权益、审查和任务服务都不属于预设建图。**当前本机应明确“脚本生成服务未连接”并保图/参数，不设置 loading 或伪造分镜结果。**

## 5. 当前本地明确缺口

核对时实际生产文件：

| 本地入口                                                   | 当前行为与缺口                                                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CanvasViewport.jsx:203 inlineNode                          | 只允许 image/video/audio；排框选、拖动、panel，唯一 selected；SCRIPT_V2 不会出现专用 generator                                                               |
| CanvasNode.jsx edit/header                                 | v2 header 按 card.canOpen 开全屏请求；pending/empty 不开 Inspector。这是卡片源码 gate，不能靠恢复旧无条件 setPanel 开错路径                                  |
| generator/node-generator.js:resolveNodeGenerator           | 查 `${type}Models` / default[type]；script-v2Models 不存在，因此默认 schema null；不能把 node.type 改成 text 来骗过 generic resolver                         |
| generator/media-input-model.js:collectGeneratorMediaInputs | 返回 image/video/audio，排除 TEXT，丢上游 content；无法满足 source textList / incoming text hasPrompt                                                        |
| components/NodeSettingsPanel.jsx                           | 依赖 generic state.schema，脚本默认为空，正常与高级设置 UI 也不是本脚本专用 source 结构                                                                      |
| hooks/useCanvasNodeActions.js:generateNode                 | 同 generic resolver；script schema null 就“模型配置尚不可用”。即便简单改为 text schema，也没有 script-generate-v2/scenePayload/task context，应独立 dispatch |
| public/data/models.json                                    | 有 text schemas/default.text，缺 support.scriptText 独立三项目录；不能将十四项全放成已核实 script 菜单                                                       |

新空卡两预设按钮落盘后只补前段 graph path；若本批不实现专用 generator，就必须保留这条显式缺口，不把“预设已可点”写成脚本生成完整。

## 6. 推荐本机最小原子提交协议

现有 [useCanvasGraphActions.js](../src/features/canvas/hooks/useCanvasGraphActions.js) 的边界足够复用，controller 不应逐次 addNode/addEdge/patchScript：

- `commitGraph(next,{expectedGraph})`：当前 documentKey/ready/readonly 与 raw nodes/edges/models identity CAS；先 projectGraph 处理有效草稿，再复核 CAS；同步 currentDocument、recordSnapshot、setNodes/setEdges，一次 history。
- `patchScript(patch,{documentKey,nodeId,expectedNode,signal})`：只改原 script data，单次 CAS；无法单独原子包含 preset refs。
- `applyStoryboardPlan(plan,context)`：已经校验 sourceScriptNodeId、原 script identity、added IDs/edge endpoints、只允许 source script patches；随后同一次 commitGraph。预设可以用小 adapter 将 pure plan 转成其形状，不要求新建一套图 store。

建议 pure plan 保持：

```text
{ok,sourceScriptNodeId:scriptId,
 addedNodes,addedEdges,
 nodePatches: scriptPatch ? [{nodeId:scriptId,data:scriptPatch}] : []}
```

若 pure preset owner 采用 `scriptPatch` 单字段，Root adapter 只做上面形状转换。text 为空 patches；character params 按 source 整块替换。plan 不调用 React、random、服务、存储、history；makeId 显式注入，保留 source placement helper。

controller 请求应携 documentKey/scriptId/owner epoch、expected script incarnation（至少 raw expectedNode）、preset kind、stable opener。成功路径：

1. 同步 operation ref 拒绝重复触发，隔离 pointer 与 Space；根据当前 raw 文档重验 ready/readonly、ScriptV2 类型、empty_generate 资格，不能仅信旧按钮闭包。
2. 如需要异步 flush 前置草稿，完成后复核当前请求身份与 raw script；同 ID 删后重建、A→B→A、切 readonly、失 ready、pagehide/unmount 都取消迟到结果。preset 不是可在 resource 卡重复运行的新动作。
3. 用最新 raw nodes/edges 建 plan；一次 applyStoryboardPlan 或 commitGraph，source params replacement 和 refs 同次进入历史。不再随后裸调用 patchScript 或 setNodes 形成第二次提交。
4. 提交成功后读取同步 getDocument() 的 **committed** 图，调用 `flushGraph(committed)`，不要把构造的原 plan 或 React 上一 render 的 nodes 当已提交图（projectGraph 可能合入合法草稿）。
5. flush false 表示图已在内存提交、持久化未成功：保留新图、可见错误和 pendingSave；下一动作只重试 flushGraph，不再造 IDs、refs、history。源 store 是分步 history+同步队列，单 CAS/history 是本机明确安全适配，不谎称源一次提交。
6. retry owner 还在原文档且目标节点 incarnation 合法才能进行。图仍可继续编辑时保存最新 committed document，绝不覆写期间新编辑；undo/删除 preset refs 后也不能拿旧 plan重新插入。取消/自动卸载不偷写新文档。

flushGraph 在 [useCanvasDocument.js](../src/features/canvas/hooks/useCanvasDocument.js):199 已检查 storageKey/loaded/readonly/actor、数组和 graph.ready，并立即保存图；失败保 pending。`useCanvasDrafts` 及 draft-projection 只合 baseline 仍匹配的输入：character preset 改了 prompt 后，旧 prompt draft 不应复活覆盖它；有新 script generator 时需明确其 registerDraft 与 params sync owner。

### 后续专用 generator 的小型接口建议

先在 storyboard 域新增 pure projection + 独立 controller/view，复用现有 GeneratorFrame/Prompt/ModelMenu/References 的公开域内基础，不修改 generic resolver 以“假装 text”：

```text
resolveScriptV2Generator({node,nodes,edges,models,scriptTextSupport})
 → {valid,params,incoming,schema,model,options,canGenerate,reasons}

view props:
 {nodeId,documentKey,position/view/board,projection,ready,readonly,
  onParamsChange,onReferenceReorder,onReferenceRemove,onSubmit,
  onAddReference,registerDraft,getDocument}
```

projection 实现 source init/scene/source_images/rules，不执行请求或写图。专用 `onSubmit` 消费最终 prompt draft和当前引用，并在服务未接时明确 blocked；不创建成功 task。source reference pick/私人素材/语音/翻译仍按独立未接服务边界记录。eX 可由 Viewport 将现有安全选中资格 + card kind 显式传入，不共享四动作 toolbar 的 eK（空卡/pending 的 eK=false而 eX=true）。

## 7. 后续真实 App 回归建议与本轮验证范围

生产接线完成后用真实 NodeCanvas/Graph/history/localstorage、仅只读内容 mock 验证：文本和两图片 refs的实际 data/handles/最终 placement；source script params replacement；一次 undo/redo；pending 而不伪 task；刷新恢复；Quota retry 不新增第二套 IDs/history；同 ID跨文档/readonly/删除迟到阻断；pointer/Space 不起拖，按钮关闭/重试不抢别处焦点。专用 generator 另验文本 preset 的 incoming content可用性、scriptText 三项目录、source_images次序、model变更和prompt草稿flush。不能用 pure tests或generic Text生成器截图代替该入口。

随后按 Root 授权新增 `src/features/canvas/NodeCanvas.script-presets.integration.test.jsx`，使用真实 NodeCanvas、图提交、历史和本地存储，只注入公开 models/support/script-presets 内容。Node24 单文件 7/7 通过（05:43:08，815ms；总 2.05s）：文本原文与 handles；两张原 URL、最终 y−108/y+292 与 params 整块替换；已有 measured 障碍的50px避碰；一次撤销重做和刷新恢复；Quota失败后原 IDs 仅重试保存；catalog loading/error 保手动入口；按钮 pointer/Space 隔离且不创建 task。日志见 `artifacts/canvas-script-presets-integration-tests.log`。纯预设摘录与源 placement 另见 [pure 预设审计](./canvas-script-preset-source-audit.md)。

未修改生产或全局文档，未跑 npm check、浏览器或真实服务。源码和本地边界均静态读取；审计与新增测试格式、定向 ESLint 通过。用户继续不需要登录、注册、小号或账号资源。
