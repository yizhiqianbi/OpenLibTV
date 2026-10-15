# VIDEO 角色／主体库工程接线审计

2026-10-12。静态读取公开归档源码和当前工程，随后按Root授权新增独立媒体证书／controller review与真实NodeCanvas集成测试，并只读记录构建证据。本文作者未修改本批生产、旧测试、总入口或根维护文档，未运行完整check／浏览器／归档bundle，未登录、使用账号资源、调用原站写接口或部署。角色库与主体库不能借通用AssetPicker替代原界面，也不能把前端目录选择当真实上传、审核或生成完成。

## 1. 结论与真实入口

当前普通VIDEO生成器已有模型／模式、参数、三类媒体引用和rich prompt，却没有source RoleLibrary `rr` 或主体选择 `rb` 的实际入口。已有Portrait／Element token语法、params存储和部分connection规则不代表这些功能已接。建议分两条业务实现：**角色库确认同步真实image/video/audio上游节点与边；主体选择只维护独立subjectList及对应提示词badge**。

下列位置为归档 [24mj3em3412ij.js](./source/24mj3em3412ij.js) 的零基字符串字符附近，不是行号；其他owner已在精核模块AST范围，本文不执行源码。

| 源入口 | 位置／直接条件 | 工程意义 |
| --- | --- | --- |
| VIDEO default renderer | 约166000–167550 | `g=restrictedExperiencePolicy.active`；Q为canvas readonly，另有协作readonly；不能把g解释成onlyFineTune或账号是否存在 |
| 角色库button | 约207558、209000 | `aF=ao>0&&!eX`，eX为isValidExtraConfig；外层action chips还排restrictedExperience和digitalHuman。并非“portrait===true才显示角色库” |
| rr caller | 208297–208469附近 | 三类剩余capacity、existing ID／URI及confirm callback注入；生成器当前schema／mode决定容量 |
| Seedance tab | rr135744–138211；aK约207600 | `modelRequiresPortraitCompliance({modelKey,modelSchema})`，严格portrait字段或Seedance vendor判定；不是autoCompliance开关，也不是所有VIDEO模型 |
| rr shell | 135744–138211 | body portal；公共角色库／Seedance合规素材库两tab；1280px／720px上限、92vw／86vh、header48。保存合法active-tab偏好，Seedance不可见时强制public |
| 主体rb | 156419–159000 | `getSubjectConfig(schema,mode)`非null才有主体；依sharedWith／maxCount／视频主体限制，容量>0才显示添加button |

source rr本身没有根据本地actor伪造“我的合规资产”。当前应用不要求登录；未来reader不可用时应显示服务未连接／加载失败／重试，不能弹出登录作为推进条件，也不能把缺reader当空的私人素材库。

## 2. RoleLibrary确认的图协议

公共分支 `re` 约121804–135695读取公开角色列表和detail，把detail `mediaBlocks[].items[]`按URL去重。确认回调为 **三个URI数组**，公共分支合并既有image URI与新选URI，并保留既有video／audio URI；它不输出subjectrecords。需合规时经过真实createComplianceAsset／poll，合法assetId转`asset://id`，真实exempt仍用原URL；部分失败保留成功并warning，全失败留modal与错误。此处不得用普通AssetRecord.id充当assetId。

VIDEO `ag` 199155–203184为目标VIDEO计算差集：

- asset图片按`portraitAssetId`识别；原URL图片按无assetId且`portraitCompliantExempt`识别。从完整选择中取消时仅断目标的那条edge，保留源node；新选才追加节点／边。
- video按`assetVideoAssetId`，audio按`assetAudioAssetId`处理；不把任何UUID或公共角色UUID当媒体审核assetId。
- 保留普通、非role-managed的既有image/video/audio引用；用模拟新列表计算mode availability，当前mode仍enabled则保持，否则选source best-enabled mode。不能固定切image2video或总覆盖用户model。
- IMAGE helper `rV` 161344–162660先探测实际natural尺寸，失败用NODE_WIDTH方形；检查upload continuation owner后用`findClosestLeftFlowPosition`放到目标左侧，写image_resource、contentWidth/Height、width/height/measured，再连edge。VIDEO／AUDIO新增源node分别使用目标左侧、y+200／+400及各自resource action，原addNode/store另负责正常placement。
- IMAGE有真实assetId时写`portraitAssetId`，source无assetId分支写`portraitCompliantExempt:true`，可带真实checkedAt；VIDEO写`assetVideoAssetId/assetVideoComplianceCheckedAtMs`，AUDIO写`assetAudioAssetId`。这与subjectList完全不同。

最后一项是源码事实，**不等于本机可把任意URL设为免审**。最小公开adapter必须保来源并明确提供可信asset证书／exempt语义；纯本地FileReader URL、随意填写的URI或不带证明的外部目录不得升级成已审核资产。若当前运营只提供原URL而没有可信免审声明，建普通resource并在需要审核时阻断、保留可编辑内容，是须明确记录的本机防御差异，不冒充source已经返回豁免。

## 3. 主体协议与模式约束

module469850位于 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js)，getSubjectConfig是`schema.properties.subjects.items[modeType] ?? null`。rb直接读取：

- `maxCount`；有video输入时可使用`maxCountWithVideo`。
- `sharedWith`指定真实参数列表；可选剩余量是maximum减主体数再减共享列表数，最低0。
- `properties.subjects.disableVideoSubject===true`和mode级`videoSubject.maxCount/disabledWithVideo`控制视频主体。
- 选择去重按uuid，source存`{uuid,name,coverUrl,klingId:specialSupportIdMap.kling}`；不是imageList、portraitList或普通graph nodeId。remove按uuid过滤。
- rb effect会移除被当前video restriction禁止的视频主体、截到共享最大量及视频主体数量上限；当前mode没有subjectConfig时主strip隐藏。不能仅凭这一effect外推所有model切换都清空subjectList，完整model-change/prune链需沿纯model审计核对。

代表性本地models JSON已有实际规则：kling-video-o1的mixed2video主体与imageList共享7、有video时4，且禁视频主体；kling-v3-omni具有逐mode上限与视频主体最多3／with-video限制。star-video2及部分Seedance系有portrait／autoCompliance；这些是目录参数，不是权益或审核通过证据。不得用全局固定“最多3个角色”替代schema。

## 4. 现工程可复用点与明确缺口

| 当前模块 | 已有能力 | 本批所需补齐／不能直接借用 |
| --- | --- | --- |
| CanvasNodeInlineGenerator／useNodeGenerator | 当前schema、incoming、锁定／extraConfig、models失败重试、NodeGeneratorPrompt ref、草稿注册、Frame | 无角色／主体chip/controller；不能仅以portrait字段打开库；源码restrictedExperience／digitalHuman／capacity和本机ready/readonly需各自明示 |
| media-input-model collector | live graph媒体、普通group展开、characterRef、stored list、focus exclusion；排portraitVirtual／assetVirtual | 初审缺少节点portraitAssetId→ref.assetId、portraitCompliantExempt→compliantExempt及assetVideo／Audio字段映射；Root随后以role-media-reference-model共享投影补齐两个collector。直接写params.portraitList仍不能替代RoleLibrary图同步 |
| generatorReferenceLists | image/video/audio／mixed顺序；保留portraitList／elementList | 漏subjectList；总返回空elementList会遮蔽NodePrompt的subjectList fallback。需明确新subjectList与旧elementList兼容／alias规则，不能丢旧文档 |
| GeneratorReferences | 三媒体48px strip、预览、排序、删除、@插入 | 不显示主体或独立portraitList；subject不应混进mixed媒体order。source主体视频cover及hover／name、remove另有专用view |
| node-prompt-model／DOM | 识别Image／Portrait／Video／Audio／Mixed／Element，1-based token及copy/IME/selection已维护；Element可按uuid | 只是codec已有语法；当前列表传入缺metadata时Element仍missing。不要重写editor或token语法；Portrait fallback只在portraitList不存在时生效，空数组不会fallback |
| reference-actions-model | 三类／mixed reorder、映射token，真实edge／group child exclusion删除 | 不支持subjectList／elementList reorder/delete；Portrait在旧重排映射中落imageList，扩展前需确认sourcelegacy alias，不能乱改已有prompt indices |
| connection-model | 已有subjects.items/maxCountWithVideo/sharedWith容量和有subject时current-model lock | 普通generator resolve／mode／validation没有完整subject投影和rb清理链；不能只验证连线就称所有输入成立 |
| useCanvasGraphActions.commitGraph | 文档／ready／readonly、raw nodes/edges/models CAS；projection包含pending drafts；一次snapshot，同步发布图 | 已有generic asset import不能替代角色差集和证书协议。建议新增小型pure role plan＋controller，复用该公共CAS入口，不直接调用多个update/addNode造成半提交 |
| 持久化／autosave | 全图nodes/data/params／edges随文档保存；pagehide刷写、文档级保存失败Header重试 | 目录、modal选择和在途服务不存为已完成实体；accepted graph后Quota仅重试保存，不再建相同节点／history |
| assets／AssetPicker source | 原URL映射、通用资产分页／文本／团队adapter | 没有RoleLibrary公共角色detail、third-asset审核或主体repo；不能沿用其UI、folder语义或把assetType伪装为主体授权 |
| services/storyboard-video-source.ts | 明确optional checkPortrait/checkV2Portrait和URL-bound结果 | 现接口是脚本批次，不是普通VIDEO角色库；可共用证书基础型，新增服务入口而不改变原batch义务或假装已接reader |

`useNodeGenerator.changeParams`会保留未知params字段，但它是普通update路径；`changeWithDraft`先flush再改参数，不能用于保证新角色图交易一次history。角色确认应getValue读取最后DOM prompt，让CAS的projectGraph投影当前draft到next及undo baseline；接受后取消该pending一次，失败保DOM内容，不先flush成独立写入。

### 4a. 417754 精确input映射与certifiedInPlace区别

直接读取 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) 的module417754，`collectIncomingNodeData`函数w在8554，target collector export在11068。不能把“真实证书传给生成器”与“这个node由角色库导入／管理”合并为同一predicate：

| 媒体 | URL／元数据 | 证书投影条件／字段 |
| --- | --- | --- |
| IMAGE | hidden/watermark保护取data.url，否则originalUrl非空优先；只取第0项。resourceMeta.items[0]的kind=image时复制非null width/height | portraitAssetId truthy→assetId；否则portraitCompliantExempt truthy→compliantExempt=true。有其一才写complianceCheckedAtMs=portraitComplianceCheckedAtMs、sourceCreatedAtMs=node.createdAtMs、sourceCreatedAtMsIsLocalPlaceholder=node.createdAtMsIsLocalPlaceholder |
| VIDEO | 只data.url[0]；首resourceMeta item kind=video时复制非null durationSec/width/height | 先`assetVideoAssetId ?? portraitAssetId`，结果truthy→assetId；否则assetVideoCompliantExempt→compliantExempt。存在其一才附assetVideoComplianceCheckedAtMs及node的两个created字段；**不以portraitComplianceCheckedAtMs回退VIDEO时间** |
| AUDIO | 只data.url[0]；首resourceMeta item kind=audio时复制非null durationSec | `assetAudioAssetId ?? portraitAssetId` truthy→assetId；没有exempt或checkedAt/created时间投影 |

VIDEO还保非空trim后的subtitleUrl/subtitleHtmlUrl、首个合法transition对象。source不以画布盒子宽高代替media metadata。SOURCE的空URL引用仍被收集用于容量；本机usable URL/metadata额外防御不应直接套到connection容量计算，导致空资源突然不计数。

417754 **没有检查portraitCertifiedInPlace或assetVideoCertifiedInPlace**。这些flag也不直接写入其ref，而是由原node保留。证据 [3shzcyguvjig6.js](./source/3shzcyguvjig6.js) 3695／3802的asset-sourced resource谓词分别为 `(portraitAssetId||portraitCompliantExempt)&&!portraitCertifiedInPlace`、对应VIDEO字段；4182／4661的buildImage/VideoCertifyPatch对原普通node成功认证时加InPlace=true。因而普通node虽不是库导入资源，**仍须向生成器传真实assetId／exempt／时间**；给collector加统一`!InPlace`会丢有效证书。反过来，不能只见ref.assetId就把普通节点当库managed node或获得私有目录权限。

24mj的角色库差集也不统一：`rz`约160880的图片managed仅IMAGE+portraitAssetId+directincoming，未排IMAGE InPlace；原URLexempt图片集合亦无InPlace排除。`rF`约1624xx的VIDEO需isAssetSourcedVideoNode且assetVideoAssetId，排VIDEO InPlace；`rK`的AUDIO仅assetAudioAssetId，不以legacy portraitAssetId判断managed。existingVideoIds `am`约1989xx另排assetVideoCertifiedInPlace；IMAGE的an/ai未排。应分别实现source的input projector与RoleLibrary managed集，不借Focus/Factory入口谓词改写collector。

target collector按target edges原顺序取sources，只在**普通roots路径**排除truthy edge.data.portraitVirtual／assetVirtual，再展开group（深度8、groupRefExcluded和visited）。后续独立`collectCharacterReferenceItems`（R在6700）仍遍历**所有target edges**，含virtual edge的合法characterRef，追加mainReferenceImageUrl/roleName/characterRef；再追加target.refImages，最后删除focusRegion.nodeId对应image。不能把第一步virtual过滤误扩展为整个target的所有路径，也不能因普通edge被排除而删掉stored asset目录状态。这段直接证据属于417754生成器target collector；当前collectCanvasConnectionInputs的516779容量路径须另行独立核验，不能仅据417754扩大其virtual过滤。本批只共享证书字段投影，保connection原有空URL容量和virtual行为；RoleLibrary自身managed差集由其专属模型排virtual。

source使用truthy/nullish判断；本机若将assetId限为合法string、exempt限为严格true，应作为安全输入正规化明确记录，不捏造已通过证书、当前审核时间或免审值。真实服务需再次校验当前URL和权限，前端marker不替代服务器认证。

## 5. 建议业务分层与最小公开服务合同

建议公开服务协议放`services/role-library/`，UI/controller/pure rules分别在canvas generator的roles子域，subject规则单独维护。services不引用features或React，pure model不读store／网络／storage／CSS；页面只注入能力和协调Frame／dialog-stack。

最小**公共角色目录**仅需两个只读方法，保持source page/total形状而非硬套AssetPicker cursor：

```ts
interface PublicRoleCatalogueSource {
  listCharacters(
    input: { page: number; pageSize: number; orderBy: 'updated_at_desc' },
    options: { signal: AbortSignal },
  ): Promise<{ list: RoleSummary[]; total: number }>;
  getCharacterDetail(
    input: { characterUuid: string },
    options: { signal: AbortSignal },
  ): Promise<RoleDetail>; // raw mediaBlocks/items and original URLs
}
```

source public module668135在 [0-8_zejn_ex9w.js](./source/0-8_zejn_ex9w.js) 34064–35280，listCharacters为POST读操作，detail为GET读操作，re只用这两者。建议运营adapter可用代表性原公开样本实现分页/详情，保原URL与role/detail ID；不需要也不伪造个人角色、账号资料、会员或完整目录。

这些归档方法与“公共”UI标签不等于本轮已验证原API匿名权限；本轮没有发送请求。运营adapter应明确可读范围／错误，不伪造原站已认证会话。

其他能力独立optional，不从上面两个reader推导：

- `ComplianceLibraryReader`提供合法third-asset列表、URI解析和实际status／createdAt／checkedAt；缺reader显示明确不可用，不编造私人空库。
- `ComplianceService`提供create／poll（image/video/audio、当前URL、force、AbortSignal），只真实通过结果有assetId或明确exempt及time。结果需匹配当前URL和caller owner；不能用本地actor、public role UUID、mock status或时间戳当认证。
- `SubjectCatalogueReader`输出真实uuid/name/coverUrl/specialSupportIdMap及必要媒体字段；个人repo无adapter时不可用，不把公共角色图库直接转成“我的主体”。如未来运营提供公开主体source，应明确该source范围，不假私有账号资源。
- Upload／delete／rename／createSubject／capture入库是各自writer capability，缺writer保明确服务未连接。普通FileReader只表示本地读取成功；不触发“已上传到人像库”或签发合规ID。t4虽接收到onCanvasCapture，既有捕获审计已确认binding未被实际引用，不能为了可点擅加source不存在的捕获入口。

前端selection结果建议为typed records而不是仅裸URI：包含kind、origin、role/asset/subject identity、original URI、resolved URL及可信proof。view只处理选择/preview，controller把它转换为source三URI或subject数据。`asset://`必须通过reader解析，通用asset-map只能映射已知原URL，不能解释未知asset scheme。

能力边界区分public可读、private可读、upload、compliance、subject-write，缺省均不能假真；autoCompliance仅决定实际submit/preflight路径，不能授予上传或免审。服务未连接不会制造task.running、费用0、上传成功或已通过audit。

## 6. 原子接线与异步owner

1. 根据当前真实schema／mode和incoming投影role/subject资格；missing model/schema显示已有加载/error/retry，validExtraConfig/allowed model/locks保原规则。Source的role容量并非subject上限，mixed images/video/audio共享和源fallback由纯函数完整实现。
2. 打开独立source RoleLibrary或SubjectLibrary，保稳定opener和owner `{documentKey,targetId,type,epoch}`。文档替换、A→B→A、取消、卸载、readonly／失去ready退休请求；mode/model/refs变化重算容量并在确认fresh校验，不能只捕获open时数组。
3. 读目录／detail／probe／audit均可取消，旧结果不插入。image natural probe后取最新图；private pending/rejected/expired记录按真实source状态显示，不用占位图或凭URL补合法标签。
4. controller读最后prompt而非先flush，获取fresh raw graph＋models和目标存在/权限；pure plan统一差集、IDs、source布局、certificate metadata和mode。Subject plan另做uuid去重/共享容量/video限制，不建媒体节点。
5. 一次commitGraph expected raw CAS，包含真实nodes/edges/params与prompt投影，一次history。raw发生变化时不覆盖期间编辑；可重新规划，不只重试旧数组。Source的异步逐node写入在本机合并成一次事务属于明确原子适配。
6. commit拒绝保选择与draft；commit接受再flushGraph。Quota失败保已创建图并提供文档级重试，仅save当前同IDs，不重跑目录/审核/图计划或重复history。关闭回稳定chip；嵌套preview通过共用dialog-stack逐层Escape，不另建body overflow/inert。

## 7. 所需actual App回归

后续实现应使用真实NodeCanvas／真实lazy generator、图／历史／保存，不mock它们；service用合法固定响应和拒绝／取消fixture，不代表生产服务通过：

- sourcechip按image剩余容量、restricted policy、digitalHuman、validExtraConfig及ready/readonly；public／Seedance tab门控不能等同autoCompliance。
- 原PublicRoleLibrary列表→detail→真实媒体选择→确认，既有URI合并、三媒体字段及正常布局；不误写subjectList。
- 无reader／error／retry、缺writer／audit、pending/rejected／partial failure明确呈现，未接服务不签证书、不假成功。
- confirm一次图／edge差集；普通refs不丢，取消只断相关edge且保源node；现model仍可用保持，否则准确mode fallback；一次undo/redo及刷新全图强比。
- 临近150ms最后prompt＋role/subject变更同次CAS，token／magic／IME／cursor／selection不退化；失败保草稿，未复制裸体HTML重建editor。
- source subjectConfig的mode上限、sharedWith、有video最大量／禁视频主体；uuid去重，cover真实，Element badge正常并兼容旧elementList文档。
- 修改model／schema／refs期间modal状态和fresh确认；当前mode不支持主体时按完整source规范显隐/修剪，不沿Focus策略擅自全部清空。
- 真实metadata对应当前URL；自然尺寸迟到／approve迟到，删除目标或doc A→B→A后不落旧图；asset URI失败不生成错误资源节点。
- Quota accepted后换selection/卸载modal仍可Header save-only retry，同IDs／一份history；不重复上传/审核/添加node。
- desktop／390布局、嵌套detail/preview Escape和opener恢复、buttons Space默认、portal pointer/double-click隔离，不能误拖动或打开节点卡。

本轮完成工程审计、合同建议及两个真实collector的独立证书映射回归，未实现或验收完整角色／主体库。完整主体modal、third-asset写操作、合规服务、真实账号目录、生成／费用与原生手机/Safari仍不在已验证范围；当前用户无需登录或提供小号，不能作为推进前提。

## 8. 证书投影独立复核与冻结

Root新增的`roleMediaReferenceMetadata`由两个真实collector调用。本作者新增`src/features/canvas/generator/role-media-reference-model.review.test.js`，直接调用共享投影与真实collector，未mock它们。30项回归覆盖typed证书优先、VIDEO／AUDIO的nullish与falsy区别、IMAGE／VIDEO的0/null/false时间值、undefined不造当前时间、AUDIO不投影exempt或时间、InPlace有效证书不丢、现图来源字段不被data里的同名值替代、普通／localMediaReady不变资产、connection保空URL容量而generator维持usable gate及输入图不变。

2026-10-12 22:24:07，Node24.19.0单文件30/30通过（197ms）；该新测试文件ESLint零警告，测试／本文Prettier检查通过。未发现当前共享证书投影与上述417754规则的确定新缺陷。source把undefined时间字段赋为undefined，本机共享投影省略这些key；保存JSON语义相同，测试不把省略理解为证书无效。此结果仅覆盖媒体输入证书协议，不宣称RoleLibrary／SubjectLibrary UI、审核服务或整个复刻目标完成。

本文与新增review测试在该结果后冻结；生产、旧测试、全量check及浏览器未由本文作者修改或运行。

## 9. Controller与真实画布复核记录

以下为本作者直接观察到的专项终端stdout。前三次成功当时没有重定向日志，未在/tmp或artifacts保存完整CLI文件；不能为它们事后伪造原始日志。后续联合复验将保存独立真实日志，与这些历史观察分开记录。

| 文件／范围 | 直接观察结果 | 时间／耗时 | 历史CLI文件 |
| --- | --- | --- | --- |
| generator/role-media-reference-model.review.test.js | 30/30 | 22:24:07／197ms | 当时未保存 |
| generator/roles/useCanvasRoleLibrary.review.test.jsx | 23/23 | 22:36:39／522ms | 当时未保存 |
| NodeCanvas.role-library.integration.test.jsx，初次10项 | 1pass／9fail | 23:03:04／2.03s | 当时未保存 |
| 同文件，补真实lazy挂载等待后 | 6pass／4fail | 23:03:35／3.92s | 当时未保存 |
| 同文件，修fixture后 | 10/10 | 23:04:35／2.90s | 当时未保存 |

Controller使用真实pure graph plan与严格nodes／edges／models引用CAS夹具，覆盖11种owner／写资格失效、doc A→B→A同ID、取消和迟到尺寸、fresh graph期间append／最后prompt及隐藏参数、重复confirm只一次CAS／history、save必须明确true、Quota后same selection只flush实际当前图、新IMAGE才probe、已有资源不重probe、VIDEO／AUDIO不probe、缺asset URI resolver拒绝及真实CAS冲突。额外验证公开图片填满剩余capacity后source入口隐藏，已accepted但Quota失败的picker仍可save-only重试；pending probe期间普通incoming增加导致capacity减少时拒绝超限而保留新图。

真实App使用公共models JSON、LOCAL_WORKSPACE_USER、真实lazy生成器／RoleLibrary views／图／历史／autosave，只有服务目录与核验响应使用明确synthetic test adapter。首次9个失败是fixture只等到lazy加载外壳就同步查询控件；第二次4个失败是modal正确隔离背景后仍用accessible query读取原editor／Header，以及需合规模型默认Seedance tab但fixture未切公共tab。修复改为等待真实textbox、使用开窗前editor DOM引用检查隐藏草稿、读取真实Header DOM及显式切公共tab，原图／保存／历史强断言全部保留。这些失败不记为生产问题，未放宽timeout或删除断言。

最终10项验证公共目录list→detail→选图→实际resource node与source edge、自然525×350、source exempt marker无假assetId／审核时间／task、最后prompt、一次undo／redo和真实重挂恢复；删除仅断edge而保资源；普通／需合规Quota同payload只保存、不重复certify／probe／建图／history；同ID新文档拒绝旧await；取消与opener焦点；readonly／缺模型无写。另两条强回归验证Root独立source审查修复的全局draft碰撞与core清理：raw Image1、150ms内draft Image1+Image2，取消role2后editor／graph／storage只Image1；用户删除合法Magic token后orphan metadata删除。两条都检查undo保最后编辑文字／引用、redo再次移除及200ms／pagehide不复活。

Root正式初轮为370文件／4983测试，23:07:56开始，109.29s测试、10.65s构建。其日志／快照已固定保存在`artifacts/canvas-role-library-before-click-isolation-check.log`与`artifacts/canvas-role-library-before-click-isolation-source-snapshot.json`，产物证据为`artifacts/canvas-role-library-before-click-isolation-build-proof.json`；1122/1122源码SHA仅对应该历史阶段，不能覆盖随后修复。Root原生验收发现overlay点击使VIDEO失选并卸载inline：仅bubble onClick隔离仍不能拦截Viewport的pointerdown capture，三处portal根须加已有nopan隔离marker。本文作者新增第11项使用userEvent.click真实pointerdown→click链验证dialog、VIDEO选择、inline／chip身份、graph／storage／view保持，并验证Escape回chip。随后Root原生又发现chip上的Space被全局canvas键盘preventDefault拦截；Root仅在角色入口隔离Space冒泡、保默认按钮激活，本文新增第12项真实user.keyboard('[Space]')回归。

## 10. 有原始日志的最终复验与冻结

2026-10-12 23:37:42，三个新增suite联合3文件／64测试通过（3.69s），真实CLI stdout保存为`artifacts/canvas-role-library-review-app-tests.log`，对应collector30＋hook23＋App11。2026-10-13 00:40:45，再加Space后同三文件／65测试通过（3.88s），真实CLI stdout保存为`artifacts/canvas-role-library-review-app-keyboard-tests.log`，对应collector30＋hook23＋App12。两个日志均来自实际Node24 Vitest终态exit0，不是从旧console重建的日志。App最终新增capture／Space断言沿真实CanvasPointer和CanvasKeyboard路径，保原十项图／存储／历史强断言；ESLint零警告、Prettier检查通过。本作者src在此后冻结，无新的源码修改。

Root新正式`artifacts/canvas-role-library-final-check.log`终态exit0：2026-10-13 00:42:01开始，370文件／4991测试，110.51s测试、11.11s构建。本作者只读核对`artifacts/canvas-role-library-current-source-snapshot.json`的1122/1122 SHA无漂移，读取dist产物和compiled ESM静态／动态closure并写入`artifacts/canvas-role-library-final-build-proof.json`，其finalFrozenProof／passed均为true。角色CSS在eager Canvas CSS插入14769字节，移除这唯一插入后旧192511字节CSS逐字相等；旧Script的22个CSS及entry顺序、源码SHA保持，Generic／Script／ScriptGenerator／Mark实现仍由真实dynamic import加载且不在Canvas的37模块static closure。Canvas691380字节、gzip229698；Generic64233字节、gzip22283；900k阈值未改，无manualChunks或体积警告。修复前before-click产物及日志／快照均保留，不借新check覆盖旧时间范围。

原生1280／390／320的遮罩选择保持、Space打开和Escape回chip，以及GUI完整文档SHA一致，均由Root操作并报告；本文作者未操作浏览器，也不把synthetic目录／核验adapter的正向测试描述为真实账号、审核或生成服务通过。根维护文档与整个复刻目标状态由Root维护，登录／账号资源继续延期，完整主体库及真实运营写服务不在上述验收结论内。
