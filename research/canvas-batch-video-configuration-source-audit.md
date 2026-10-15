# 脚本 v1 图片组批量视频配置浮条源码审计

2026-10-12。本批只静态读取已归档公开客户端，调查 `GroupNodeToolbar → eM → tA → eZ → eq` 的实际配置与提交协议。没有运行 source bundle、读取账号、登录、请求费用/合规/生成服务、修改生产代码或运行测试。以下 offset 为指定 UTF-8 文件解码后的 **0-based 字符位置**，不是行号；不同归档 chunk 的位置不能混用。当前上线原站、登录态和真机画面未重新核对，结论限于归档代码。

## 首要范围纠正

这里的 **v1 `eM` 是组下方非 modal 浮条**，显示“全部 {count} 个分镜”。其 UI 没有镜头复选框、选中分镜清单、逐镜时长输入、逐镜 prompt 编辑或“保存配置”按钮。底层 helper 接受 `perShotDurations` / `selectedHiddenUuids` 不等于此 caller 提供这些功能：renderer 实际调用为 `onGenerate: config => tA(config)`，只传 config。

另一个 ScriptV2 `rg` 面板确实有选镜、全选、逐镜时长和展开只读 prompt，位于同文件约1120k–1136k；它不是本次 v1 浮条。不能把 v2 面板套入 v1，也不能将 v1 缺口继续笼统称为“逐镜时长/选图浮窗未接”。本次待接的准确范围是 v1 的模型、普通参数、batch 高级参数、全部镜头数、费用显示与建视频组入口；v2 配置是独立后续工作。

## 定位与调用链

| 归档文件 / module                                                                           | 精确锚点                                                                                                                                  | 本次证据                                                                        |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `3u6hjewm8qox_.js`，共用 factory 声明 `414356,361881,643721,225860,483611,390565,…` @717187 | `eb` @7194xx、`eT` @720074、`eM` @720233–724999                                                                                           | 组下浮条、近似比例、局部配置状态、模型/参数/费用/提交                           |
| 同文件，Group renderer / `414356`                                                           | `e6` @765971–7669xx；viewport effect @768450；`tR` @769320；`tP` @769552；`tA` @769590–770517；`t3` @790316；实际 `eM` JSX @795700–7959xx | 实际 ready rows、开启/关闭、提交 caller、选择门控和传入 props                   |
| 同文件，`239473`                                                                            | `resolveScriptV1StoryboardVideoAvailability` @8053xx–8059xx                                                                               | 图片组/version/source/link/ready 数量资格                                       |
| 同文件，`225860` / `483611` / `390565`                                                      | `eU` @726475、`eH` @727675、`eK` @728011附近、`eY` @728676、`eq` @730522–734665、`eX` @734665、`eZ` @735049–739238                        | 引用与模式、可选逐镜时长约束、人像检查、真实 child 建图与顺序                   |
| 同文件，`643721`                                                                            | `eD` @725053，export @725148                                                                                                              | 8秒等待 helper 的实际返回；没有函数名暗示的 rollback                            |
| 同文件，`700819`                                                                            | linkage key map @71866；`linkStoryboard` @72584                                                                                           | script `linkedVideoGroupId` 和 image group → video group 普通边                 |
| 同文件，`936797`                                                                            | `computePanelFocusViewport` @64373–647xx                                                                                                  | 开配置预留上/下空间的视口算法                                                   |
| `0leiedr1esdbe.js`，`216257`                                                                | aliases @2243xx、`getModel` @225450                                                                                                       | `storyboardVideo` 从 video schema 读取；support 仍是单独目录                    |
| `3zez5ighjd7k4.js`，`855847` @1222                                                          | 模型 selector export @5808起                                                                                                              | 真实 support 模型菜单、禁用/排序、元数据、选择后关闭                            |
| `34q64t3bi91ws.js`，`848024` @86595                                                         | settings keys @8708x、store key @87541、default component props @948xx–951xx、普通参数 @95200–1055xx                                      | 普通参数按当前 mode 取 config、typed enum / originalField / rules；内嵌高级视图 |
| 同文件，`172860`                                                                            | advanced predicate @69923、component @79229起、normalize @700xx–714xx、同步/重置 @80000–82000                                             | 只高级部分 `batch:true`、model switch reset、hidden/barOnly/enable 与原字段     |
| `1jgo2qrsqidfu.js`，`745705` @6473、`234954` @8033、`136036` @20971                         | `GeneratorPowerCostDisplay`、popover manager、strike-through rule                                                                         | 数量乘算力/原价、非 modal 菜单互斥和外部关闭                                    |
| `1k5w11_he1tz_.js`，`299750` @301                                                           | calculatePower wrapper `k` @55xx                                                                                                          | 参数正规化后 POST 费用服务；不代表可在本机调用                                  |
| `170exq-5f14zz.js`，`185990` @10946                                                         | `modelSchema` @12252、`calculatePower` @13225                                                                                             | `/api/tool_spec/list`、`/api/task/generation/power/calculator`                  |
| `2ob2qo_b0az9v.js`，`485615` @112、`388607` @24193                                          | wrapper 最前、owner @349xx–355xx、continuation exports @36626 / @37353                                                                    | 非缩放浮条、文档 generation 与 node incarnation 迟到保护                        |
| `3shzcyguvjig6.js`，`978783` @2183                                                          | `shouldRunAutoCompliance` @5632                                                                                                           | 高级 `autoCompliance` 对提交人像检查的实际作用                                  |
| `public/data/locale-zh.json`；`2ijgtfwpg93os.js`                                            | `storyboardVideoAllCount` @69189、group name @115348、失败文案 @164056–1643xx                                                             | 下列文案直接核对，未猜测翻译                                                    |

源码链为：General Toolbar 的“批量生成视频” → `tR` 重验 availability 后设 `ta=true` → `eb` 包 `eM` → `eM.L` 提交 `{…config, modelSchema}` → `tA(config)` → `eZ` 当前图/合规检查 → `eq` 生成空视频节点和 ref edges → store add / `linkStoryboard` / `eD` → 关闭浮条、100ms后选中新视频组并 fit。**这段 caller 没有调用 `runGroupPipeline`、费用批量确认或真实 generation create。** 后续视频组自身的 run/regenerate 是另一个入口，不与建组成功混为一谈。

## 入口资格、镜头集合与顺序

`resolveScriptV1StoryboardVideoAvailability` 只在 `isStoryboardImageGroup && sourceScriptVersion !== 'v2' && sourceScriptNodeId` 时 visible。它不是严格 `version === 'v1'`；缺 version / 非v2沿相同分支。存在 truthy `script.data.linkedImageGroupId` 且不等于当前组时 disabled，文案“当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组”；ready count ≤0 时 disabled，“请先生成至少 1 张分镜图后再批量生成视频”。缺 linkedImageGroupId 不自动判陈旧。

renderer 的 `isStoryboardImageGroup` 为 `(sourceScriptNodeId truthy && subtype !== 'video') || standalone image`，但 standalone 的专属工具栏没有绘出此 General 视频按钮；不能因为 availability helper 对混合 standalone 可见就擅自增加入口。正常 v1入口来自非 standalone、带脚本关联的图片派生 General 组。

`eX` 先扫描实际 **direct image children**：`data.scriptRowHiddenUuid` truthy，且 `data.url` 是数组并 `some(string && trim非空)`，才以 hiddenUuid 放入 Map；同键第一次 child 胜出。再按 `script.data.rows` **原行顺序**遍历，row.hiddenUuid truthy且有对应 child 才产出 `rows` 和 `children`；若可选 selected Set 存在则过滤该 Set。未按 `childNodeIds`、镜号文本或当前 Canvas 选择排序。

打开时 `e6` 从当前 store nodes 扫实际 children，用 `eX` 得 ready rows。数量为 `rows.length`；继承配置来自匹配到的第一个 child 的 `data.params.settings`，尺寸只取其 `data.contentWidth/contentHeight`（两个字段类型均 number 时组成对象），不是 node.width、measured 或 media natural metadata。提交时 `eZ` 重新读图，并先把 direct image children 按 `data.name` numeric localeCompare 排序，然后再 `eX` 按最新 script rows 匹配。因此重复 hiddenUuid 时打开和提交的 winner 可能不同，真实正常资料应保持唯一；本机坏资料的原子拒绝属于适配。

source readiness 用数组任意非空项，而 `eq` 构建时图源用 `data.url?.[0] || ''`，不主动查找后续非空项。这是精确边界；不要把 `some` 资格、第一项输出和字符串 URL 支持合成一个不同的规则。

## 浮条布局、开启/关闭与视口

`eb` 读取 `effectiveZoom=max(actualZoom,0.5)`，位置 `absolute left-1/2 origin-top -translate-x-1/2`，top=`calc(100% + 10/effectiveZoom px)`；交给 `NonScaledWrapper`，`maxScale=2`，`hideWhenDragging=false`。wrapper 的 panelScale=`min(1/effectiveZoom,2)`，带 `nodrag/nowheel/nopan`，150ms transform/opacity transition；这是画布中的组下浮条，非锁屏 Modal、非当前 General 工具栏的顶部定位。zoom<0.5时浮条会随画布继续缩小，不能把“始终1倍屏幕尺寸”当源码结论。

浮条 outer 为 `w-max flex`，pointerdown/mousedown/click都 stopPropagation；内层采用 `FLOATING_TOOLBAR_STYLE`：padding4、radius12、0.5px controls border、controls background、shadow-dropdown、blur16。横向内部 gap4px，外围px4；关闭32×32、x12；divider宽0且borderLeft0.5px/高20；“全部N个分镜”字号13、opacity70、px8；费用字号12；提交28×28、icon12。没有此 caller 的小屏 wrap/clamp/max-width 规则，窄屏 portal/clamp/横向滚动需作为本机适配另验，不能从源码断言390px不会溢出。

`tR` 只在 availability.enabled时打开，否则 warn reason。`ta=true` 时首次记录原 viewport，以实际 direct image child bounds 聚焦：每 child measured→stored→0尺寸，位置直接 group.position + child.position；无有效 bounds则用组 measured→stored→500×300。container取 `.react-flow` clientWidth/Height，缺时window。`computePanelFocusViewport` 定义 `usableH=containerH−100−120−32`，zoom=`min((containerW−160)/positiveNodeW, usableH/positiveNodeH,1.2)`，非法/≤0回1.2；x水平居中，y=`116+usableH/2−nodeCenterY*zoom`。开关setViewport均300ms。嵌套世界坐标修正不是这段source自带行为。

`tP` 关闭仅 `ta=false`；effect恢复原viewport300ms并清原viewport ref。失去 `t3=eN || (standalone && soleDirectImageSelected)` 也关浮条。正常 General唯一组选择来自 eN；source `eM`没有自己处理 Escape、保存草稿或选择切换。嵌入 popover provider处理菜单互斥/外部 pointer；父级这些行为与本机统一键盘/焦点协议需分别接线。

`eM` 不隐藏于 node dragging（wrapper明确false）。readonly禁写在 `eZ` 的提交检查，不是其 submit disabled条件：submit只依赖 busy。归档 JSX没有为已开的 eM额外加 `!readonly`，也未在close时向 eZ传 AbortSignal。建议本机仍按 document/ready/readonly变化取消旧owner并关闭，此为已授权安全协议适配，不能说是source原有即时取消。

## 模型、模式与局部 config

`support.storyboardVideo` 的 `modelKey` 列表为专用候选，不等于所有 `videoModels`。默认优先目录内的 `kling-v3-omni`，否则目录第一项，否则 `global.defaultModel.video`。`getModel('storyboardVideo',key)` 将 modality alias到 `schema.video`。eM的模型选择只写局部config，不调用global默认偏好 writer。

初始 config为 `{model:default, modeType:'singleImage2video', settings}`。settings只继承 truthy首图 `resolution`；ratio先经 `extractRatioFromSettings`：非空trim/非`auto`的 `ratio` → 按keys的其他 `ratio*` → `aspectRatio`，再fallback首图明确内容尺寸。近似候选按 `1:1,16:9,9:16,4:3,3:4,3:2,2:3` 顺序取绝对比差最小，严格差值<0.15；不是 standalone ts的六比例，也不是公共 approximateRatio的十比例。

有ratio时找当前schema.properties第一个以ratio开头的 **schema字段名**，初始化直接写 `settings[field]=ratio`；此处没有先用originalField或enum过滤，后续共用settings会正规化。初始没有prompt、count、advancedSettings、选图Set、durationMap。ratio空或auto不会原样继承。

模式由 schema `properties.modeType.items` 的 **键存在**顺序决定：有singleImage2video→它，否则有image2video→它，否则text2video；这个分支不检查该键limits.max是否>0。effect同步config.modeType，不能用普通视频incoming推断或v2 mixed2video模型筛选取代。

切模型回调只改config.model，保留其他局部字段供settings正规化。support非空变更时，当前config.model不在目录则回上述default；support为空时该effect不重置current model，globaldefault变动也不等于强制覆盖已有非空model。

另外首图尺寸derived ratio effect按新schema第一个ratio键补空值且不覆盖truthy当前值；原表达式为 `!property.enum || (enumIncludes(derivedRatio) && setConfig(...))`，enum缺失时短路没有执行setConfig。不能将它概括为“无enum也允许补ratio”。init和effect是两条不同路径。

配置仅 `useState` 保存；打开后首图settings变化不会重新运行initializer。关闭卸载后再次打开从最新首图/default初始化，没有script、group或global的配置保存patch。不要凭已存在script.data.videoGenConfig等其他运行字段把它自动接进本浮条。

## 普通参数与 batch 高级参数

eM传给共享参数组件的是 `{prompt:'',model:current,modeType:resolved,count:1,settings:config.settings??{},advancedSettings:config.advancedSettings??{}}`，`embedAdvancedSettings=true`、`embedAdvancedSettingsBatchOnly=true`。其回调仅处理两个section：settings按当前局部settings浅合并；advancedSettings整段替换。它忽略其他返回字段，因此不提供prompt编辑、mode菜单或多份数量写入。

普通参数keys来自schema.config.settings：数组直接使用，按mode对象先当前mode再text2video再空。**普通settings不因batchOnly过滤**。typed enum保持实际value；API storekey=`originalField ?? schemaField`。数字slider取合法现值并按当前min/max/override限幅，switch默认0，枚举保留合法值否则property.default或首enum。settingsRules消费本浮条没有media列表的 `{imageList:0,videoList:0,audioList:0}`，不自动把“将用一个分镜图”伪造为列表参数；规则禁用/fallback/overrides经共享组件执行。

参数trigger summary按ratio → quality → resolution → duration → enableSound顺序显示，并压去ratio/resolution都auto的重复项；duration为正整数才显示Ns。没有countUnit prop，因此source不显示数量chip/数量区。popover在button下方bottom-start、offset0、withinPortal，内容宽340、padding12、gap8、圆角16。未传directorStudio，故该branch没有max-width窄屏约束。普通body绘制slider/switch/singleButton，barOnly隐藏；其他组件不凭 enum存在自动变为普通body入口。

高级config可为group数组/字段数组/按mode对象，按当前mode取字段。过滤 `enable !== false`、`batch === true`；实际显示还排barOnly及hidden前缀。`expanded=true,popoverInset=true`，直接嵌在同一个参数popover，**不是另一个折叠“高级设置”区**。原字段和值/voice元数据按schema正规化；model switch可按resetOnModelSwitch清字段，切mode移除已知而不属于当前mode的advanced字段，保留无关metadata。重置按当前可显示字段恢复default，voice同时维护`_${storeKey}_meta`。

高级settings的 `autoCompliance` 确实可能影响 eZ人像检查，但费用请求没有advancedSettings，`eq`新视频节点params也没有复制advancedSettings。不能因此声称当前全部高级选择已经被真实生成任务使用；后续 VideoGenerator 的初始化/默认参数是另一条调用链。

## 费用请求与展示

300ms debounce effect依赖model、`JSON.stringify(config.settings)`、nodeId、projectId、rateLimitBenefitStatus、resolvedMode。benefit status只促使重算，不作为这个request字段。每次调用读最新getModel取 `modelVendor`；request如下（只描述契约，不调用原站）：

```js
{
  params: { prompt: '', model, modeType, count: 1, settings },
  metadata: { node_id: nodeId ?? '', project_id: projectId ?? '' },
  provider: schema?.modelVendor || '',
  model,
  taskType: 'video',
  requestId: crypto.randomUUID()
}
```

没有advancedSettings、实际image URL、selected shots、perShotDurations、总count或modelSchema。目录/schema未就绪也没有本effect的严格block gate。request wrapper通过bizScene/course等共用包装、媒体duration正规化后POST `/api/task/generation/power/calculator`；本浮条无真实视频列表，不应为费用查媒体补入假时长。

初始result=null，显示“-”。只有未取消且response.code===0才保存 `{power:data?.power??0, originalPrice:data?.originalPrice}`；catch置null。每次settings变化**不先清旧成功费用**，非0业务response也不清旧result；不会自动显示loading，组件显式 `isCalculating:false`。cleanup只清300ms timer并设cancelledflag，忽略迟到回包，**未中止已发HTTP**。advancedSettings和总镜头数不触发费用重请求。

`GeneratorPowerCostDisplay` 的scale是全部ready rows数，对单份power及strike-through originalPrice同时乘N；不是按每镜独立求和，不根据可选durationMap计算差异。原价等于费用或缺失不划线，非数字原样显示，初始“-”不能说免费。无费用服务的本机UI需明确未知/未连接，不能生成假0或模拟已扣积分。未来如注入本机运营estimate adapter，AbortSignal、失败/迟到、变更清旧费用策略属于明确适配。

## Submit、合规、建图与字段

按钮disabled只依赖 `A` busy。`L`防重入，置busy→`await onGenerate({...config,modelSchema:currentSchema})`→finally解busy；title busy“审核中...”，正常“生成视频”。没有费用ready、schema存在、余额或prompt验证的本按钮gate，也没有此处的扣费确认。父tA另持ref busy防重复，finally释放；它没有catch thrown error，只有处理 eZ 的 `{ok:false,reason}`。

`eZ`顺序：readonly→sourceScriptNodeId存在→script node存在→capture canvas owner +源image组/script continuation→最新linkedImageGroupId非陈旧→重新收集ready rows/children非空→每child continuation→可选人像合规→生成纯child描述→重读位置→store可用/owner current→addGroup、addChildren、addEdges、link→等待保存→再次owner验证。此链没有“先审核fee通过再真实执行”的步骤。

canvas owner为storeInstanceId/projectUuid/projectGeneration，session preempted拒绝；节点continuation是node存在及incarnation一致，未传uploadGeneration/async scope。这不是params/rows/URL深快照CAS。eZ对link的陈旧检查发生在合规前，普通params变化不使这一guard自动失败；本机新增图应继续用当前getDocument/raw身份CAS，强reader取消与签名校验为安全适配。

只有 `config.modelSchema.properties.portrait === true` 进入本eZ portrait gate。已存在portraitAssetId/exempt若未过期可复用；过期时，若autoCompliance规则未开则fail。`shouldRunAutoCompliance`要求schema.properties.autoCompliance.enable严格true；advancedSettings显式值1/true优先，否则property.default1/true。需要检查且开启自动检查时 `eY`真实createThirdAsset/poll；成功写assetId或exempt及checkedAtMs，during写`_starVideoCheckStatus='checking'`、finally移除。没有合法服务/证书不能伪造通过；本次没有调用。

`eq`按row/child配对顺序输出，每行主图`url[0]`先入image refs，再从脚本characters/scenes/props-linked节点收集该行 `videoMotionPrompt` 引用并按nodeId去重。prompt经 `buildPromptWithInlineRefs(...,{sourceField:'videoMotionPrompt'})`，附imageLabelList。portrait单图时截外部refs；模式按schema容量选image2video/singleImage2video/text2video，必要时截断refs并warn；没有主图但有资产时可选mixed2video，否则text2video。本v1入口通常已有ready图，但上述源码仍不能简写为“总是singleImage2video”。

每个视频child字段是：

```js
{
  type: 'video',
  data: {
    type: 'video', action: NodeAction.VIDEO_GENERATE,
    name: `分镜视频-#${row.shotNumber ?? compactIndex + 1}`,
    url: [], poster: firstImageUrl,
    params: {
      prompt: resolvedVideoMotionPrompt, model: config.model || '', modeType,
      settings: config.settings ?? {},
      image: modeType === 'text2video' ? '' : firstImageUrl,
      imageList, imageListOrder: refs.length ? refNodeIds : undefined,
      imageLabelList: refs.length ? labels : undefined, scene: 'group-generate'
    },
    _explicitContentDims: true, contentWidth: width, contentHeight: height
  },
  parentId: newVideoGroupId,
  position: { x: 40 + col * (width + 40), y: 70 + row * (height + 40) },
  width, height, measured: { width, height }
}
```

注意此构造没有 `scriptRowHiddenUuid`、advancedSettings、taskInfo、生成输出URL或成功状态。refEdges每条sourceHandle=`source` / targetHandle=`target`。width/height由config ratio经公共ratio helper，以短边350、长边最多1050计算；cols=`ceil(sqrt(max(inputPairCount,1)))`，跳过不合规child后用compact index放置。groupW=`80+cols*width+(cols−1)*40`，groupH=`110+ceil(actualOutputCount/cols)*height+(rows−1)*40`。

可选durationMap在此按row.hiddenUuid查finite number，schema.duration支持enum则取最近（相等差选较大值），超界限幅；slider则min为舍入锚点，min+round((value−min)/step)*step并限幅。没有约束则原值；只覆盖settings.duration。**v1 eM没有传此Map，正常全部镜头共用settings中的duration；不能顺手从script row.durationSeconds覆盖。** selected Set同理未传，正常全部ready rows。

group type=`group`，id由VIDEO_GROUP genId，position由最新script与图经`calcGroupAutoPosition(script,nodes,'video')`（缺script fallback0,0），zIndex−1001，source shell background/border。data包含type/name=`视频组 · {imageGroupLabel}`、groupColor:null、sourceScriptNodeId、**sourceImageGroupId**、storyboardTitle同name、storyboardGroupType:`video`、sourceScriptVersion:`v1`。不是当前copy remap中不同的sourceImageGroupNodeId字段，不擅自改名。source add child时skipOverlapResolution=true。

`linkStoryboard(script,newGroup,'video',{edgeSource:imageGroup})`会写 script.data.linkedVideoGroupId，普通边从image group指向新video group；没有原有edge才add，不删除旧video组/旧关联边。单次建图这段没有显式takeSnapshot或atomic事务；store action是否另有history不能仅凭函数名推出。本机可用pure计划+一次graph CAS/history整组提交，明确为维护适配。

## 保存、取消与错误的精确边界

`awaitGroupSaveOrRollback`的实际实现是 `return !!store && (await store.waitForSyncSaved?.(8000, ids[0]), false)`。虽传入newGroup与children IDs，函数只使用ids[0]；兑现的wait返回被丢弃，普通resolve后总false；这段没有删除节点/回滚。eZ虽然有`save-rejected`分支，正常兑现路径无法靠该helper进入。wait抛错会直接reject；不能声称source有“保存失败整组回滚”。本机Quota失败保留新图/原持久化有效快照、可撤销/导出/retry须按既有autosave/CAS协议另验。

eZ返回false reasons完整包含readonly、no-source、no-script、owner-changed、stale-image-group、no-children、compliance-failed、store-unavailable、save-rejected。tA的UI映射：stale→“当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组”；no-children→“没有可用于生成视频的分镜图”；compliance-failed→“人像合规检测未通过，请调整分镜图后重试”；其他→“批量生成视频组失败，请稍后重试”；save-rejected直接return。成功先关浮条，100ms后select仅新group并fitBounds400ms/padding0.15。没有自动真实生成；费用显示不是真实消费。

关闭浮条会卸载局部config并清estimate timer/迟到flag；**不会取消已在tA/eZ运行的建图或人像请求**，也不撤销已经添加的组。tA的100ms selection/fit也未在该fragment清timeout或再核文档owner。未来本机需捕获request身份、documentKey和node incarnation/签名，close/doc/readonly/loading/unmount abort，并防新开B的旧A回包、旧文档同ID、被删又复活的group及迟到fit；这些是当前项目要求的安全适配，不能伪装成归档源码原有行为。

## 可复用本地入口与必须补的适配

当前复用清单以实际本地文件读取为准，本批没有改它们：

| 本地入口                                                                                             | 可复用内容                                                                                | 不能直接套用的点                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/script-group-controls-model.js::canvasGroupVideoAvailability(nodes,groupId)`                 | source/link/非v2资格、actual direct child hiddenUuid与数组some URL；返回readyCount/reason | 仅入口资格，未提供ready rows、首图settings和尺寸；standalone入口分派仍需UI协议                                                                     |
| `storyboard/video-model.js::storyboardVideoModelKeys / storyboardVideoMode / storyboardClosestRatio` | 专用支持目录、模式键存在优先级、七ratio与0.15门槛                                         | keys会过滤schema不存在条目、support=[]给空keys；source原目录不过滤schema且default fallback有不同，须明确加载门控适配                               |
| 同文件 `initialStoryboardVideoConfig`                                                                | 模型首选、首图resolution、局部settings形状                                                | 当前只扫描ratio*字符串、不排auto也不读取aspectRatio；以originalField/enum先过滤，与source initializer不同。不是可宣称完全相同的drop-in             |
| 同文件 `storyboardVideoSettingsSchema`                                                               | 保留普通settings，只过滤高级batch字段                                                     | 强制count enum[1]配当前GeneratorSettings会显示额外数量区；source eM没countUnit，不显示count控件                                                    |
| 同文件 `resolveStoryboardImageShots` / duration helpers                                              | hiddenUuid匹配、source最新linkedId、可选Set与约束数据                                     | 该ready helper只认url[0]/可认字符串，source eX要求数组且some；若用于本浮条须对齐资格/首图差异，不能拿已有tests当source完整证据                     |
| `generator/schema.js`                                                                                | fieldGroups/fieldKeys/storeKey/typed enum、rules、纯正规化                                | 普通settings和高级batch filtering要分开；不要使用普通node媒体mode推断替换eM键存在模式                                                              |
| `GeneratorModelMenu.jsx`                                                                             | 360px模型popup、禁用排序、current scroll、选择后关闭、共享popover                         | 支持modelKeys筛选，不自带source support/VIP/practice/benefit契约；不可创造账号权益，元数据图标/缩略卡视觉仍需对齐                                  |
| `GeneratorSettings.jsx` / `GeneratorNumericSetting.jsx`                                              | 普通参数、advanced field UI、Mantine数值、schema rules、portal与共享focus                 | 当前没有batchOnly/embed/suppressCount；会额外显示数量、PromptMentionToggle且高级折叠，不等于eM内嵌展开。需要小型可选展示协议，不能复制整套字段逻辑 |
| `hooks/useAgentToolbarPopover.js`、`CanvasGroupNode` / `CanvasViewport`                              | 非modal Escape回触发器、外部关闭不抢焦点、视口/显示组owner、floating UI基础               | eM是组下非scaled wrapper；不复用顶部General的位置。390px clamp/滚动及键盘关闭是需记录的本机适配                                                    |
| `useCanvasGraphActions` / `useCanvasDrafts` / `useCanvasAutosave.flushGraph`                         | 最新raw CAS、末草稿projection、一次history、实际新图立即保存                              | 未有v1视频建图planner；不得直接走普通batch executor，不得宣称运营syncSaved或生成成功                                                               |
| `storyboard/prompt-compose-model.js` / `script-assets-model.js`                                      | 当前脚本rows/assets/refs纯字段协议                                                        | 生成用的 source buildPromptWithInlineRefs、模式容量截断、portrait缺service需要另逐项核对，不自动等同已有本地自动拼接                               |

最小后续接口可分为：纯配置初始化/当前schema投影、ready-shot投影、group视频建图计划；controller持open request/局部config、模型读取、可注入fee source、可选compliance source、graph CAS与viewport恢复；view只接模型/参数/总数/未知费用/busy/close/submit。fee/compliance/generation三种能力独立，默认没有真实service。是否允许本机创建空视频组须在UI明确“本机创建视频组，生成服务未连接”，不能显示上传/扣费/视频生成完成。本批只提供调研，不引入这些生产接口。

## 验收边界

这是静态源码审计，不是新实现或浏览器验收。未接/未验证的是本v1浮条的实际本机配置视图与controller、真实费用/portrait/生成/保存服务及账号权限；v2选镜/逐镜时长面板是另一入口。Toolbox调查未在本批展开。登录/小号/原站写入继续延期，全站目标仍未完成。
