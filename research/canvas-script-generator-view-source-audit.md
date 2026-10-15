# 专用 ScriptV2 generator 视图：source、接口与验收边界

2026-10-12。本批静态读取已归档模块327466与共享组件；未运行源 bundle、遥测、登录、账号、消费或原站写服务。只新增专用 content view / scoped CSS / jsdom tests；Root wrapper负责 Frame、显示资格、位置、草稿、graph、输入菜单后续动作与保存。本文件不把纯模型或视图测试称作原生浏览器 / 真实生成验收。

## 调用链与精确证据

以下为UTF-8解码字符串的0-based字符偏移。

| 文件 / 模块                        |                            偏移 | 可确认协议                                                                                                                            |
| ---------------------------------- | ------------------------------: | ------------------------------------------------------------------------------------------------------------------------------------- |
| `1sutpu54cdy46.js` /327466         |                          5460起 | 专用 ScriptV2 generator；currentModel=params.model或defaultModel.text，getModel('scriptText')，专用任务参数、references、Prompt、底栏 |
| 同文件                             |     `function M` / 参考加号部分 | Menu top-start / withinPortal、三入口、原图上传 input与个人资产库 modal                                                               |
| 同文件 /520916                     |                        约7800起 | scriptText模型、spacer、翻译、voice enabled条件、生成icon / 美术风格Tooltip；无 ordinary settings / mode / count                      |
| `1eqsg-pmc0mun.js` /427044         |               77680，function $ | buildScriptV2TaskParams返回scene与真实text / media inputs；不是普通text生成器参数                                                     |
| `1jgo2qrsqidfu.js` /976401         |                             483 | GeneratorWrapper / MainColumn、默认large660、expanded / 8向resize与位置                                                               |
| `3lfysz4968xc9.js` /184907         |                     17172–198xx | ReferenceDisplay总入口，包含textList与typed media lists                                                                               |
| 同文件                             |   13434 / 17451 / 17659 / 18064 | Text card R、解构textList、F长度gate、首位textList.map渲染                                                                            |
| `1nd0f9k3q9sol.js` /112007         |    8725 / 57655 / 57991 / 60003 | Prompt mention、placeholder、内容壳 / 最小高80 / 展开占剩余高度 / scrollbar                                                           |
| `38o6e4qs2-rnf.js` /665209         |                       38265附近 | script明确支持普通媒体mention；suggestion只image/video                                                                                |
| `3zez5ighjd7k4.js` /636820 /855847 |               112 / 1222 / 1779 | ActionButton / ModelSelect / 模型row与原icon16                                                                                        |
| `0kvzxk3i105ei.js` /757251         |                             501 | 翻译按钮及异步翻译；token保留、真实服务边界                                                                                           |
| `2iru1o_jok_2m.js` /876083         |            2465 / 21810 / 22114 | 生成 / 费用 / 提交服务；默认32按钮和12px up-arrow                                                                                     |
| `3cc4i9j9c1y82.js` /41671          |                 137249 / 149404 | Translate→libtv:translate；arrowUp→libtv:up-arrow                                                                                     |
| `2ijgtfwpg93os.js`                 | 70321 / 70041 / 154493 / 187232 | 参考图label、画布入口、脚本placeholder、美术风格提醒原中文                                                                            |

完整专用参数 / graph与show predicate另见 [generator集成source审计](./canvas-script-preset-integration-source-audit.md)。普通 inline 的既有视觉 / 开放范围见 [inline source审计](./canvas-inline-generator-source.md)，不能据其type=text renderer替代此专用组件。

## 原结构与几何

327466选择 global canvas readonly与collab readonly合成 f，按 source A.default expandable=!f。expanded尺寸直接来自 `node.data.expandedGeneratorWidth / expandedGeneratorHeight`，回调写同字段，不使用旧本机ordinary `generatorExpandedSize`。

默认Frame为large，宽660；逆zoom保证视觉卡尺寸独立于画布缩放。source ordinary wrapper class `absolute -bottom-4 left-1/2 -translate-x-1/2 translate-y-full`，**16 world px净距**；本机既有Frame / placement使用16 screen px以及窄屏center clamp，是明确适配，不能混称源几何。source expanded默认800×600，max90vw / 90dvh、resize min660×360；本批view只接 expanded descriptor，不独占resize / popup。

MainColumn原class gap-2 p-2：flexcol、gap8、padding8、min-height0；expanded补flex1。内容依次是：非只读参考图+菜单、统一reference strip、PromptInput、非global-readonly底栏。底栏没有border分隔、普通 / 高级设置、mode按钮、count chip或数量选择器；源params中保留历史count / mode不能作为加UI的依据。

全局 readonly时源不显示加图和底栏；refs不传delete / mention，Prompt仍可只读复制。collab readonly的底栏在source仍存在并由shield阻断，与global readonly不是相同显示规则。本地没有真实collab服务，不伪造shield / ownerColor；Root普通readonly资格不挂载整个generator，view仍提供安全readonly门控。

## 参考图菜单与真实服务后续

ActionButton文案“参考图”，icon `libtv:plus-s`12；文字12 / leading-normal，gap2、px8 / py4、全圆角。dark white5背景 / hover white10、fg-muted；light black5 / hover black10、neutral700。原Menu top-start、portal；真实三项顺序：

1. “在当前画布中添加参考”→enterReferencePickMode(scriptId)。不是通用text节点或立即添加一张默认图。
2. “本地上传”→hidden input，accept `image/png,image/jpeg,image/webp,image/gif`、multiple；超过30MiB跳过。source先创建上游IMAGE，再交给真实upload pipeline，不能把本机FileReader叫服务器上传完成。
3. “个人资产库”→source720×520 modal、多选、确认。逐项读取真实资产详情 / 第一张图片并创建上游引用；真实私人库 / 上传继续是服务边界。

新view只分派 `onAddReference('canvas'|'upload'|'assets')`，不创建file input、picker、URL、FileReader、asset写入或图节点。Root可接本机合法picker / reader与共享资产协议，但应另记其能力与源私人库差异。未提供handler时trigger disabled；`disabledReferenceActions` exacttrue分别禁用菜单项，不展示可点的空函数。Root提供入口的latest owner、容量和异步取消验证不属于本view测试。

本机加菜单复用共享nonmodal popover / dialog-child dismissal：start对齐、viewport8px clamp、宽196 / maxHeight180、自动上 / 下翻转；菜单默认样式属于现有frontend适配，没有从327466 caller推断出这些固定值。Escape恢复trigger、外部focus关闭不抢焦点，展开后菜单挂在所属dialog，避免另建body锁。sourcecall可证top-start/portal与3项，不能把这组本机fixed值当源Mantine默认值。

## Text 与 typed media reference 的源证据

源文本卡片有完整真实调用链，不能为避免处理上游剧本而省略：`1eqsg` @77680的 builder返回 `textList:t.textList`；327466把该 k整体交ReferenceDisplay，没有过滤textList。184907 @17451解构textList、@17659计算F；empty return条件也含!F。@18064先渲染 `textList.map`→R(item,badge:String(index+1),onDeleteItem(nodeId))，随后才mixed / image / video / audio。

R @13434是静态48×48 text card、圆角8、border-hair：中央TextRef14×15，dark白 / light neutral600；正文经normalizeTextContentField→过滤trim为空项→原文join换行→slice200后Tooltip最大280 / top / withArrow / z720。序号9px、top4 / left4、h14 / min14、black65背景 / rounded8。删除button15×15、top2 / right2、原x7；原hover显示，文本没有draggable或@ mention入口。

本机text卡复用原`text-ref.svg` / `close.svg`，只提供当前nodeId的delete callback。tooltip用native title显示相同200字文本，是明确适配，尚不是源Tooltip的尺寸 / 箭头 / hover生命周期。focus-within显示删除与focus outline是本机键盘适配。文本不插入普通媒体token，删除不由view移除上游节点。

媒体正常专用输入按image / video / audio typed顺序，每种序号从1起。源typedlist draggable，通过nodeId permutation回调type与order；ScriptV2 V仅写 `${type}ListOrder`，明确忽略mixed重排。媒体卡可delete、@mention、preview及double-click fit；文本仅delete。

本机复用GeneratorReferences，分别按type渲染以修正共享concat的全局序号，使Image1 / Video1 / Audio1与各token一致；仍处同一flex-wrap strip。回调只派typed `image|video|audio`及ID顺序，view不写token / graph。混合协议的历史异常params、全部合规badge、图片优化URL、延迟hover预览、音频播放 / 时长和原媒体previewPopover仍不由这次共享复用完整覆盖；现shared媒体预览以实际preview callback分派。不得将本次正常typed展示称为这些特殊分支已完整复刻。

## 专用 Prompt、model与底栏

PromptInput的generatorType为script，图 / 视频 / 音频名单来自专用k，不使用ordinary type=text的mode / settings resolver。当前三个真实schema的prompt.placeholder均为空，原caller中文为**“描述剧情片段、故事，为你生成分镜脚本”**（locale154493）；此前调研粗述“输入故事梗概…”不是当前原文，本文以直接locale为准。

源665209明确script支持媒体@，ghost / 自动suggestions则仅image / video。新view复用NodeGeneratorPrompt，mentionEnabled=true、typed separate列表、suggestionAvailable=false；150ms、IME、copy、history、drop、caret与ref getValue / flush等沿用已有输入协议。Root负责同文档草稿投影、basePrompt、立即卸载 / pagehide、模型切换前flush与StrictMode，不由view偷偷建立第二个草稿registry。Prompt展开占剩余高度，普通状态最小80 / 最大100。

ModelSelect类型scriptText，目录只有原support三项：GVLM 3.1 / CVLM 5.5 / GVLM 3.1 Flash；source metadata的modelName、description、icon来自 `public/data/script-text-support.json`，不能用普通text schema label或十四项全目录替代。view机械把modelList array→keyed metadata送GeneratorModelMenu；保disabled / disabledReason，已选模型不重复派动作。Root给共享ModelMenu增加可选icon renderer / menuClassName，本view按原URL经asset映射、trigger / row图标均16，并以显式isCanvasLight标记portal skin；不新读取DOM主题或认证 / 权益。

底栏宽100、gap4，左模型→flex1 spacer→右工具gap8。翻译按钮32 / radius8、Translate16，源调用真实translateText并保护特殊token；本机没有translator时disabled及title“翻译服务尚未接入”。语音在源enabled才显示divider14×1与按钮；本机voiceAvailable默认false隐藏，不请求麦克风或造session / 转录成功。显式inject onTranslate / onVoiceStart只分派给owner，真实服务后续另验。

源generate默认32×32 / radius12 / invert背景、up-arrow12，真实submitting用loader并接费用 / task builder。本机可合法生成时按钮仍可点，由Root用真实intent表达服务未接入；view不假造0积分、收费通过、taskId或成功媒体。无必需input、目录不ready、readonly / 非ready / busy时按纯projection及caller门控阻断；error由Root显示。

source生成可用时有宽280、arrow、top / openDelay0的美术风格Tooltip，文案“提交前请确认「美术风格」已填写——全局美术风格首次合成后即锁定，后续不可再改。”；本机当前使用相同title文案，Tooltip视觉 / lifecycle继续是适配边界，不能称其280px已原生验收。

## 公开view API与职责

`ScriptV2GeneratorView` 接Root的 projection `{valid,params,schema,model,modelList,modelKeys,references,canGenerate,error}`，references为 `{textList,imageList,videoList,audioList,mixedList}`；不能把params原source entries改成UI-only字段。外部props包括 readonly / ready / expanded / isCanvasLight、catalogStatus / error / pendingSave / busy、promptRef / sessionKey / portalTarget / asset / onHistoryBoundary，和模型 / Prompt / submit / references / 添加 / 重试callbacks。

pendingSave只展示“重试保存脚本参数”，不因此禁用整个Prompt；Root可以保存最新编辑而不再次建图。catalog loading / failure保留原params，展示loading或可重试错误并阻断写入。callback返回false不被view当作成功；view不维护saved / submitted结果。Frame、节点eligibility、取消 / owner、rawCAS、历史、source expanded字段、真实file读取 / AssetPicker和本机持久化均由Root外层独占。

Frame / view与portal菜单阻断pointer / mouse / click / dblclick向画布冒泡；Space只stopPropagation，保输入与button native默认激活，Tab / Escape由共享popover / dialog stack处理。static JSX / 简单derived状态直接渲染，only transient menu start位置为layout effect；无额外全局listeners、storage、服务依赖或新package。

## 所属专项结果与未验范围

正式Node24，2026-10-12 **06:09:04**：`vitest run .../ScriptV2GeneratorView.test.jsx --maxWorkers=1` 1file / **20项全部通过**，941ms；所属JSX / test ESLint `--max-warnings=0` exit0，三视图文件与本文格式通过。该次包含最终CSS source token与显式light portal补正；Root后续联合 / 全量检查另记。此前06:05:01的20项通过保留为过程证据，不代替最终快照。

测试驱动实际pure ScriptV2 projection、真实models与三项support：原placeholder与无普通settings、text来源/200字/delete、3 add分派及逐项disabled、真实metadata模型 / icon / disabled、150ms输入、媒体@、typed重排保token / 1-1-1序号、readonly、目录loading/error/retry、pendingSave仍可编辑、合法intent与无服务假成功、explicit translation / voice、展开dialog内嵌菜单两层Escape / opener、portal double-click / Space / theme、StrictMode与invalid projection。Video token清理在jsdom mock pause/load并断言实际卸载调用，不伪造播放或浏览器media成功。

这20项是jsdom DOM / callback /取消协议证据。主画布显示资格 / selector、draft+CAS / Quota、真实文件读取 / 本机资产 /菜单、共享Frame原生拖动与缩放、source16world vs本机16screen间距、390px/触屏/Safari、CSS像素及实际媒体未在本owner浏览器验证。真实脚本生成、计价、翻译、语音、上传、私人资产、collab和完整task服务继续未接；全站复刻目标保持未完成。
