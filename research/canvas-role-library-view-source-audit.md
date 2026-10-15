# VIDEO 角色库视图与真实入口源码审计

## 1. 范围、偏移与冻结证据

本批只静态读取归档脚本、CSS、中文 locale，并用 Babel / PostCSS 解析文本；不执行原站 bundle，不访问账号目录，不登录、不写原站，不操作浏览器，不采集角色内容。没有原站登录态或移动端实测，不能把以下代码分支称为服务或原生交互已验收。CanvasCapture 的回调未消费结论沿用 [Capture 审计](./canvas-capture-view-source-audit.md)，不创造截图入口。

下文偏移均为 **零基准 JavaScript 字符串 / Babel UTF-16 code unit**，范围为 `[start,end)`，不是 UTF-8 字节偏移。[24mj3em3412ij.js](./source/24mj3em3412ij.js) 为 216,306 UTF-8 字节 / 216,303 code units，SHA-256 `f7ae3259a6ae4c95f4705a3e59c4bdc268a95f4480459fdac7048cecebe82a14`。其它证据的完整 SHA、字节数、函数参数和绑定引用存入 [静态解析证明](../artifacts/canvas-role-library-static-source-proof.json)；这是解析证明，不是运行日志。

主要独立视图为 rr `135744–138211`、公共角色 re `121606–135702`、合规库 t4 `102216–120448`、合规素材卡 t1 `87677–93430`、真人文件夹 t5 `94956–99915`、扫码录入 t_ `69900–79068`、真人授权 tU `79107–83693`。主体选择 rb `156419…` 是另一套 subjectList 协议，不属于此角色库，不能用共享 AssetPicker 或主体选择器替代。

## 2. 真实 VIDEO 入口与模型门控

VIDEO generator `183652…` 的本地 `tz/tV` 初始关闭；`208297…` 真实渲染 rr，`210254–210383` 的 shield-check ActionButton 文案“角色库”、`active:tz`，点击 `tV(previous => !previous)`。它没有调用 expanded generator 的 collapseRef；不要点击即折叠展开框。

| 源表达式 / 偏移 | 意义 |
| --- | --- |
| `aF=ao>0&&!eX`，`207635–207647` | 图片可选总额度大于零且不是有效 extraConfig，才显示角色库 chip。不是单独 portrait=true 的入口资格。 |
| `!g&&!e5&&aB`，`208747…` | 整个 action-chip 区还受 restrictedExperience、digitalHuman 门控。`e5=isDigitalHumanModel(e0)` 在 `176367–176424`，`eX=isValidExtraConfig(eY)` 在 `175918–175950`。 |
| `aB=!eX||aD||t$||az||aO||aF||!!te.attachment||!!te.link||aG`，`207856–207914` | action 区的聚合资格；不能只查 properties.portrait。 |
| `aK=modelRequiresPortraitCompliance({modelKey:eA,modelSchema:e0})`，`207648–207718` | 控制 Seedance tab 可见，同时是公共库 requireCompliance。helper 实际只读取 modelSchema。 |
| model change effect `187479–187745` | 模型改变后，若新模型 `properties.portrait !== true` 则关闭 `tz`。这里与 Seedance helper 的 vendor 分支不同，须按实际 caller 记录。 |

modelRequiresPortraitCompliance 来自 [3shzcyguvjig6.js](./source/3shzcyguvjig6.js) `6204…`：`schema.properties.portrait===true || isSeedance2Model(schema)`。同文件 module201006 `9017…` 的后者只查字符串 `modelVendor.startsWith('star-video2')`，因此也匹配 `star-video2.5`；不凭 model 名称或本地 actor 猜授权。

`properties.autoCompliance` **不控制 chip 或 tab**。同文件 `5632…` 的 shouldRunAutoCompliance 要求 `autoCompliance.enable===true`，然后优先 advancedSettings.autoCompliance 的 `1/true`，缺省才用 schema 的 `default===1/true`。VIDEO `204390–206101` 的生成前合规路径才使用它；公共角色“应用”由 requireCompliance 直接驱动，不能擅自用高级自动核验开关跳过该应用流程。

`ao` 图片额度在 `195510–196817`：先扣 imageList 中无 assetId 的图片数；无 modeType.items 时为 `max(0,10-ordinaryImageCount)`。否则当前 singleImage2video / frames2video / image2video 用配置上限，mixed / extend / long-video 先减视频数并应用 imageMax / imageMaxWithVideo，videoEdit 用 imageMaxWithVideo；当前额度为零时按其它可用图片 / 混合模式求最大，排除配置禁用的 videoExtend，最后扣普通图片。`ac` 视频 `197399–198502` 同样扣无 assetId 视频并按模式求限额，求得零时使用 9；`au` 音频 `198503–198807` 混合模式用 audioMax，否则为 `max(0,1-ordinaryAudioCount)`。这些是总额度，不能混成 incoming batch 20 条规则。

此 chip 本身没有 `disabled:eg/Q`，也没有单独 `!isAssetBoardMode` 表达式；同 renderer 的其它删除 / 输入回调有 readonly guard。实现时应用现有文档、协作只读和异步 owner 门控属于本地完整性约束，不能宣称已从该 chip 源码确认所有祖先权限规则。一次性“新功能：支持真人” tooltip 由 `libtv:portrait-tooltip-dismissed`、practice active / pathname 控制；其展示不代表真人授权。

## 3. rr 弹窗壳与标签生命周期

rr 的 props 为 `{open,onClose,onConfirm,onCanvasCapture,seedanceTabVisible,imageSelectableCount,videoSelectableCount,audioSelectableCount,existingImageIds,existingVideoIds,existingAudioIds,existingImageUris,existingVideoUris,existingAudioUris}`。

`open=false` 返回 null。打开时：不需合规强制 public；需合规则读取 `libtv:role-library:active-tab-v1`，仅接受 public / seedance，缺失或无效默认 seedance。两个 tab 文案“公共角色库”和“Seedance、Seedance 2.5 合规素材库”；public 永远 visible，seedance 只由该 prop 控制。切 tab 在可见 Seedance 条件下写此 key，子组件通过条件 renderer 切换，会卸载并重建各分支的分页、详情和临时选择。

body portal 遮罩 fixed/inset0，黑色 20%，z=`--z-toast`，practice elevated 时用其 dialog z。壳宽 `min(92vw,1280px)`、高 `min(86vh,720px)`、flex column、radius12、hairline border、canvas shadow。header 高48、左右padding16，tab gap36、font14；active medium，inactive muted；X 容器24、glyph10。源遮罩只 stop mouse/pointer/doubleClick，**没有 backdrop onClose，也没有 rr 的 Escape listener / focus trap / body lock**。X 为明确关闭入口。嵌入当前项目时统一 dialog-stack 的焦点、Escape 和叠层恢复属于本地适配，不能复制多个独立 overflow 锁。

rr 在 public 分支传 requireCompliance 和 existing URI 三列表；seedance 分支传 existing ID 三集合及各类型额度，`embedded:true`，不重复 inner header。onCanvasCapture 只被透传，t4 的解构绑定 s 的引用数组为空。

## 4. 公共角色目录、详情、字段与匿名边界

[0-8_zejn_ex9w.js](./source/0-8_zejn_ex9w.js) module668135 `34064–35200` 为只读目录 wrapper；endpoint map 在 [170exq-5f14zz.js](./source/170exq-5f14zz.js) `19264–19558`。

| 操作 | 实际请求与响应 |
| --- | --- |
| listCharacters | POST `/api/character-library/list`，re `122216–122486` 传 `{page,pageSize,orderBy:'updated_at_desc'}`。page=1 起，pageSize默认10，可选10/20/50。读 getApiData(response).list / total；API非ok返回 `[]/0`，list须array、total须number。 |
| getCharacterDetail | GET `/api/character-library/detail`，query `{characterUuid}`，读 getApiData(response).detail。点击角色先用列表项设详情，再异步补 detail。 |
| 过滤 | re 无 search、category、tag、keyword、team 或成员 UI，也不传这些参数。不能加未经 source 证实的分类栏。 |
| 最近使用 | 同 module 另导出 recent/list、recent/add、recent/delete，re 不调用；不是该视图的可见功能。 |

列表卡消费 `{characterUuid,name,coverUrl,subtitle?,summaryText?,materialCount?,mediaCount?,mediaItemCount?,imageCount?,assetCount?}`。素材数量按该顺序 nullish 取值，正且有限数取 floor，否则**仅标签显示4**；不是给详情补造4张图片。副标题是 subtitle 或 summaryText 或空串。

详情消费 `mediaBlocks:[{blockName,items:[{url,thumbUrl?,label?,assetId?,complianceCheckedAtMs?,createdAtMs?}]}]`。`122848–123235` 按所有 blocks 顺序去掉无 url 项、按 url 全局去重；展示名 `label || blockName || character.name || ''`。**此 renderer 对全部条目都用 img / IMAGE 合规**，没有读取 mediaType 决定视频或音频。保留后两种 existing URI 是为了确认时不破坏已连接的媒体，不代表公共详情含三类播放器。

目录 grid 为 auto-fill minmax(200px,1fr)、gap12；卡padding4/radius12，cover ratio200/267、object-cover/object-top，素材数font12左下，namefont14/20、subtitle12/18。详情 square图 radius8、thumbUrl||url、width420压缩、顶/底渐变，左上20px方checkbox、selected mark12；下方名font14/20。preview按钮高32、右下、font13，hover 或 focus-within 可见。

list effect 用递增 G 对分页结果隔离；详情请求本段没有对应 generation/AbortSignal guard。分页底部60px高：Mantine Pagination、page size、页数>1才显示数字 jump，输入删除非数字，Enter检查 `[1,totalPages]` 后翻页、清空并 blur。详情 breadcrumb“公共角色库 / 角色名”，返回清 detail / selection / preview；打开另一个角色也重置 selection / preview。目录 loading+无记录显示 spinner，无记录显示“暂无数据”；详情 loading+无图片 spinner，无图片“暂无素材”。此分支没有独立错误 banner / retry，transport rejection也没有本地 catch。**本地 unavailable/error/retry 保状态是明确适配，不把错误当空库。**

Root 于2026-10-12实际只做一次匿名只读 list 请求（无 cookie/token、page1/pageSize3），HTTP200、业务 code10001“用户未授权”，没有有效角色响应；见 [匿名请求证明](../artifacts/canvas-role-library-anonymous-read-proof.json)。未调用账号、未身份重试、未请求 detail。现有 public/data 与 research JSON/HTML/MD/TXT 检索 characterUuid / mediaBlocks / character-library 没有可用归档代表样本。`public` 是标签名，**不能据此称接口匿名公开**。默认运营 source 应明确不可用，合成角色只能在测试里出现；后续只需获得少量合法代表内容，不进行全量采集。

## 5. 公共选择、应用与 preview

`re` 可新增容量 `h = typeof imageSelectableCount==='number' ? max(0,imageSelectableCount-existingImageUris.length) : 4`。临时 Set 以原始 url 为 key，不按压缩thumbnail。未选且容量满时 `aria-disabled`、tabIndex=-1、opacity45；已选项仍可取消。Enter / Space 执行选择，Space preventDefault。源点击 handler仍进入统一Q，Q内部拒绝超限。没有“选中全部”动作；浮条 checkbox 仅显示 check / minus，不能擅自增加全选。

只有 detail 且选中至少一项时显示底部浮条：绝对bottom20/left50%，translateX(-50%)，高50，radius12，border / shadow，水平gap16/padding16；清空X32、竖线28、“已选择 {count} 项”、右侧margin48的“应用”button高32/padding16。F申请中显示spinner14和“正在审核中”，禁用该应用按钮。`124072–125458` 的应用成功协议是 `onConfirm(unique([...existingImageUris,...acceptedUris]), existingVideoUris??[], existingAudioUris??[])` 后 onClose；不用返回 Character 或 subject record。

requireCompliance=false 直接确认所选 URL，不调用 createAsset。true 时：有效且未过期 assetId 转 `asset://{assetId}` 并 ensureAssets；其余 URL 使用真实 createComplianceAsset(url,'image',{force:!!oldAssetId}) 和 pollComplianceUntilDone。通过并有 assetId→asset URI，通过 exempt→原URL；部分失败 warning但确认成功项，全失败 error且不关窗。不能把本地图片读取、勾选或 elapsed timer当核验通过。创建 / 核验服务未连接时保留选择并显示真实 blocked/error。

preview是 re 独立全屏图片层 `133967…`，黑80%，max content88vh/80vw；原图getFasterImage宽1400、max72vh / min(80vw,720px)、object-contain。显示素材名及 `current/total`；X44位于 right7.5vw/top10vh，prev/next44位于左右6vw，仅多图出现，左右循环，不是边界禁用。Escape捕获并stopImmediatePropagation只关preview；ArrowLeft/Right同层切图。背景点击关preview、内容点击stop。没有该 preview 的区域裁剪、图像编辑、删除或上传。

## 6. Seedance 合规库状态、分页、选择与卡片

t4默认 `D='image'`，四tab **真人人像（NEW）/图片/视频/音频始终展示**；不是根据每种容量为零隐藏。页面记忆为 `{portrait:1,image:1,video:1,audio:1}`；pageSize默认15，可选15/20/30。右上“已选 {current}/{max}”，portrait/image共用 image容量和Set，另两种各自Set。既有 image IDs（含exempt URL）、video IDs、audio IDs 初始化选择；不是只加新的incomingbatch。`tc` `111669–111921` 在额度<=0早退，selected可被卡片视为可选但该callback依然拒绝；不要将异常边界描述成完整已验证行为。

同意状态由 useThirdAssetStore.agreed+checkAgreement；另查 VisualAgreement。两项检查结束后 `M=true`，未完成 return null；Seedance agreement不成立时显示 `SeedanceAgreementModal opened=true onClose=整个角色库关闭`。库自身需签署 star-video 协议，不把 browser-local演员视为已签。公共分支 requireCompliance 不另外调用这个库的 agreement表单。

image/video/audio listThirdAssets({page,pageSize,assetType})；portrait listVisualRecords({page,pageSize})；进入文件夹 listThirdAssets({page,pageSize,groupId:visualGroupId})，只有image上传，详情页独立page/total。list请求递增 generation，并检查当前tab，迟到结果不替换新tab；列表与 store 更新合并状态、assetURL、assetID、error_json和checkedAt。切tab清detail、list/total并停止详情轮询，各tab页码保留。

grid auto-fill minmax(208px,1fr)、gap8；scroll viewport padding12px16px、overflowX:hidden，content最小100%。第一页总有upload / 真人录入卡；后续空详情页“暂无素材”；非详情空第一页仍保留入口卡，没有另造“暂无素材”覆盖上传入口。loading且无现有记录显示spinner，列表reader/source catch清列表与total，源码没有独立error/retry。footer60px高，Pagination+90px pageSize+numericjump，“确定”32px右侧；jump Enter校验数字、清空，未见主动blur；确定只因 eY重新核验非null disabled，不因选择为空 disabled。

t1 card：square/radius12/hairline，image压缩300，视频snapshot300，audio36图标；图片加载失败显示类型图标。视频hover时currentTime=0、muted/loop/playsInline play，leave pause+隐藏video；metadata duration作为badge，图片盒子不能猜时长。状态0或正在recheck有黑45%“正在审核中”；状态2黑45%“未通过审核”，FaceMismatch用“请检查上传的图片是否为同一角色”，其它“内容可能涉及版权问题”；有效但过期黑35%“核验已过期，请重新核验”+下划线“重新核验”。状态1且未过期、有assetId或URL、容量允许才可选择；selected项即便满仍可取消（除上述额度0callback）。选择圆20，selected品牌色+check12。底部hover渐变toolbar始终有Delete按钮24；preview只status1，非audio宽图icon、audio播放icon。不能给审核中/拒绝素材伪造可应用状态。

`111969–112383` 的确定先ensure本次选择缓存中未过期assets，再把每个Set映射：已知过期丢弃；有 assetId转assetURI、有assetURL用URL；无缓存的既有http保持URL，其他既有ID转assetURI。确认三列表后onClose。每页取消/选择都修改本次Set，跨页缓存eR保留勾选记录。confirm不是逐项立即写图。

过期重核 `110000–110859`：同URL/同类型已有非过期passed记录则删旧；否则真实 forcecreate+poll，通过再删旧。清本次selectedID/cache、刷新列表；状态通过但删旧失败显示“删除失败，请重试”。expiry helper [3shzcyguvjig6.js](./source/3shzcyguvjig6.js) module74509 `9228…`：有效positive checkedAt优先，否则有效createdAt（明确localplaceholder则不采）；缺失、未来或间隔>=5,184,000,000ms（60天）过期。不得把新的本地当前时间补成通过的证书。

## 7. 上传、历史选择、删除、真人文件夹和授权

upload卡 t6 `99931–102200`：普通image/video/audio直接“本地上传”“历史资产选择”，image额外“真人资产录入”；portrait tab只“录入新的真人”+Plus16。上传中spinner20和“上传中...”/批次progress，禁重复触发。只有第一页显示此卡，文件夹detail使用image上传卡。

隐藏input multiple，accept：图片 jpeg/png/webp/bmp/tiff/gif/heic/heif，视频 mp4/quicktime，音频 wav/mpeg。`107730–108446` 读取File后清input值；要求原cookie token和uuid，否则“请先登录”。按文件依次预检→uploadViaPreSign（image/portrait verify=true）→resolveURL→createThirdAsset(文件夹groupId)或store.createAsset→checkAssets/poll。progress是处理序号，不是上传字节百分比；全失败“审核失败，请更换素材后重试”，部分成功仍刷新列表。默认当前项目无这些服务，不调用原站cookie、不创造登录入口，不假装本地文件已保存到人像库。

`84674–87677` 的本地预检：image<=30MiB、宽高[300,6000]、比例严格(.4,2.5)，decode error明确失败；video<=50MiB、duration[2,30]、宽高[300,6000]、比例[.4,2.5]，**总像素>=409600**（`0-8_zejn_ex9w.js` module124189 `22558…`），不是“短边必须480”；audio<=15MiB、duration[2,15]。历史选择读取raw metadata缺省0，缺失时只读探测；探测error返回null而继续服务检查，无历史文件bytes限额推断。UI提示“请上传<30M的图片”“请上传2-30秒的视频”“请上传2-15秒的音频”与精确等号规则需分开。

历史按钮打开GalleryModal `maxSelect=currentTypeCapacity,allowedMediaType=detail?'image':D,zIndex800`，确认按mediaType取raw original media URL，使用相应预检、createAsset并刷新。不能将普通公共图库 / 本地资产选择成功当原站历史授权已验。`eG`的120px fixed来源menu有渲染代码但**实际不可达**：唯一非null setter `108473` 位于 `108447…` 被丢弃的useCallback，其返回没有赋值/传prop；可达setters都仅eB(null)。静态proof保存引用位置。不要新建该下拉，也不加deadCanvasCapture菜单。

Delete `109496–109999` 使用 `confirm({title:'确实删除？',message:'删除{type}后将无法恢复',confirmText:'删除',variant:'complianceDelete'})`，await服务delete成功才“删除成功”并刷新当前页。真人文件夹删除另用“删除图片后将无法恢复”+deleteVisualRecord(id)，成功回portrait第一页。并非在此删除Canvas resource节点；那是确认差集的edge协议。

真人文件夹 t5 展示folderSVG、title||“真人人像”、封面inside top20%/side5%/bottom5%。click/Enter/Space查看文件；title文字点击进入input，focus/select，blur或Entertrim后服务rename，失败回原名，Escape放弃。more menu宽128/radius12/topfull，三项40px高：“重命名 / 查看文件 / 删除文件”；outside mousedown和Escape关闭menu。第一页首记录的新文件指南240px在卡右侧，显示就写 `libtv:visual-guide-dismissed=1`，文案“已为您创建新的人像资产，请打开文件继续上传对应人像的不同妆造图吧～”，有“知道了”。不能用本地合成记录触发真人创建成功指南。

“录入新的真人”检查 doubao-visual agreement。tU授权modal宽740、radius12、z800/801，关闭 / 不同意可退出，禁止backdrop/Escape；checkbox后真实signVisualAgreement成功才进入扫码。协议标题“人脸信息使用告知与授权”，链接火山引擎规则和LibTV隐私政策，具体locale正文已归档，不在本审计推导法律效力。扫码t_ modal宽480；createVisualValidate返回真实h5Link/bytedToken，用QRCodeSVG178于192方框，3s轮询，120s失效；状态loading/scanning/expired/error/success/failed。过期/获取失败可重新生成，success后须真正recordID和服务rename才保存；name最长20、空名warn。关闭/卸载清timeout/interval，successfocus/select name。没有有效服务响应不展示假二维码、假人脸通过或假的assetID。源tA在扫码opened时拦截window捕获Escape；本地叠层不得加第二套bodylock。

Seedance承诺书独立于Visual协议：[2euhhhz264m9k.js](./source/2euhhhz264m9k.js) `12400…` / module433839导出 `SeedanceAgreementModal`，title“Seedance模型使用承诺书”，checkbox“我已阅读并同意上述《Seedance模型使用承诺书》”、不同意、签署中、同意并使用，width740、禁backdrop/Escape；store signAgreement真正成功才设置agreed。两种签署不可用同一个browser-local boolean冒充服务器授权。

## 8. 服务边界与主 VIDEO 确认消费者

[1b45xbeaszjvg.js](./source/1b45xbeaszjvg.js) module802182 `9678–12480`：POST visual-validate `{}`、visual/result `{bytedToken}`、visual/list `{page,pageSize}`、visual/update `{id,title}`、visual/delete `{id}`；third_asset/create `{assetUrl,assetType,groupId?,force?,version:1}`、check `{uuids}`、list参数、delete `{uuid}`；agreement/check `{agreementType:'star-video'|'doubao-visual'}`、sign额外`version:'v1.0'`。endpoint map `170exq… 25845–26349`。create code10025为限额warning；delete code10051为已不存在error。这些是服务器写操作，当前不调用。

第三方store `12480–14330` 更新 passed/pending/rejected，3s最多60次；详情轮询 `106487…` 每3s最多40次，切tab/返回/卸载停止。公共确认的 compliance helper `3shz… 2450–3600` create+最多60次poll；server failed变status2，pending超时仍status0，不能timer完成即passed。Seedance MediaPreviewOverlay实际是共享 [0s1ohuyvd44qt.js](./source/0s1ohuyvd44qt.js) `4698–8xxx`：IMAGE支持缩放/拖拽，video/audio对应媒体renderer，backdrop/X/Escape关闭；库caller只传mediaType/src/onClose，不提供前后条，所以不加prev/next。该共享source自身有bodyoverflow锁；本项目使用现有共享preview/dialog-stack实现并保持叠层所有权，不照抄并行body锁。

主VIDEO `ag` `199155–203184` 对三URI列表做差集：已有该类asset / exempt连接而不再选择→仅断对应首edge；新assetURI→resolve真实URL，新增资源节点并连接target；不删除旧源节点、不重写subjectList。普通原始媒体继续保留。通过模拟新的incomingList求可用mode，当前mode仍可用则保留，否则按getBestEnabledModeType切换，不因打开 / 取消库先修改mode。

IMAGE helper rV `161338–162476` 在异步natural-size测量前 captureUploadNodeContinuationGuard，await后重新检查owner；用真实尺寸computeNodeDimensionsFromNatural或源NODE_WIDTH fallback、findClosestLeftFlowPosition，IMAGE_RESOURCE+contentWidth/Height+width/height/measured，assetId→portraitAssetId，否则portraitCompliantExempt=true，有真实证书时间才写portraitComplianceCheckedAtMs。这个source字段也用于非合规模型确认URL，**不意味着该URL在当前会话做过真实核验**。本地运营source必须区分真实证书与既有source metadata，不能造当前日期。VIDEO资源左移targetWidth+NODE_GAP、y+200；AUDIO y+400，分别assetVideoAssetId / assetAudioAssetId。确认部分async源call没有整体await，原站这里不证明本地一次undo / quota原子性；本地controller须另承担文档owner、保存失败重试与单事务历史。

## 9. CSS 原值、建议协议及未知范围

源码使用Tailwind utilities与theme变量，不是第二套独立role库CSS。归档 [1h-b10gcvw4vl.css](./source/1h-b10gcvw4vl.css)，SHA `b27e7d0637a45724ec1c9caa611201fd9646a2797431239e1673ba91f6ab1dd5`，907,824 bytes / 907,812 code units：`410575` `.bg-bg-surface` 实际background var(--bg-surface)，`410693` secondary，`571458` dropdown shadow var(--canvas-shadow-dropdown)。`:root/.dark` controls bg#262626、border#363636、text#fff、muted#919191、hover#ffffff1a、active#ffffff26，shadow `0px4px10px#00000040,0px2px4px#0000004d`；canvas-light bg#fff、border#0000000f、text#262626、hover#0000000d、active#00000014、shadowalpha1f/0f。Surface light #fff / secondary#f7f7f7，dark #171717 / secondary#363636；具体token选择器和offset在proof中，不把“全黑”当统一色值。

可按纯视图 / owner controller / typed source分离：RoleLibraryDialog负责壳与public/seedance显示；PublicCharacterLibrary消费受控list/page/detail/loading/error/selection/submitting/preview与事件；ComplianceAssetLibrary消费受控agreement/tab/list/pages/pageSize/detail/selections/uploading/recheck/error与capability事件。两者最后只返回**三类URI选择协议**，不要让视图直接读原store/cookie、写Canvas节点、请求原站、补证书。typed adapter保留read-only list/detail；真实create/check/delete/sign/QR需要单独明确capability，无writer时不可进入成功分支。

本地default source unavailable + retry保页码/详情/选择是适配；390/320 header长tab、footer分页/选择浮条可能溢出，source未给role专项mobile断点，需局部wrap/scroll可达并单独验收。local dialog-stack、owner隔离、Quota只重试保存、真实一次undo及readonly守卫也须独立验，不能称源码现成具备。静态证据不覆盖原站账号服务、团队授权、真人扫码、生物识别/合规结果、真实上传、移动端布局或整个复刻完成。本批仅冻结调研与source proof，无src、测试、root维护文档或部署变更。

## 10. 后续角色库视图接线与专项验证

调研冻结之后，Root授权在新 `src/features/canvas/generator/roles/` 实现 RoleLibraryDialog / PublicCharacterLibrary / ComplianceAssetLibrary / RoleLibraryChrome、请求所有权hook、可取消媒体metadata reader和局部CSS；纯模型、typed服务source、图与文档owner接线分别由其它owner维护。视图不引用原站store/cookie、不读取账号、不请求原站。Root传入opaque ownerKey和onNotice；source / owner变化重建子分支，旧list/detail/certify/upload/delete请求AbortSignal取消，迟到结果不关闭或写回新分支。确认回调true才关闭，false或throw保留选择和错误，保存与history仍由Root负责。

公共目录保留source请求参数、详情按URL去重、容量、键盘选择、三URI确认、cached证书免writer、过期 / 未核验请求的force、部分成功全局notice、原URLpreview及逐层Escape。Seedance保留四tab、各类型选择、source15/20/30分页规格、状态0/1/2、证书过期、删除确认 / retry、可用operator上传 / IMAGE重核。当前flat listAssets接口由UI做本地filter与分页，并每3s最多60次读取pending状态；这是adapter相对原站list/check分页协议的映射，不称原HTTP协议完全相同。成功删除时清理本次对应临时选择属于本地完整性适配，避免已删除记录被确认回图。

metadata reader只读取实际Image/video/audio尺寸 / duration，取消或失败 / 10s timeout释放ObjectURL、handlers、media DOM；size预检和尺寸 / 比例 / duration / pixel数学调用纯模型，不用节点盒子猜。其正向夹具只用于测试，不代表运营服务已上传或已通过核验。IMAGE重核只接受真实adapter给出的passed、匹配URL和accepted URI的非过期替代record，再按需删除旧record；失败不删原素材。VIDEO / AUDIO重核没有对应typed writer时保持明确未接。

真人VisualRecord目录 / group / rename / 授权 / QR、历史图库reader尚未进入当前typed source：保留真实tab和卡按钮，显示“真人资产授权与录入服务未连接” / “历史资产选择服务未连接”，不造文件夹、二维码或授权成功。原standaloneSeedance承诺书也不被本地boolean代替。Capture和来源下拉仍不添加。公共目录default明确unavailable/error/retry；没有真实角色样本，测试角色 / 资产 / 服务响应只在测试文件。

**专项实际结果**：Node24.19.0，2026-10-12 **22:46:31**，2文件 / **28测试通过**，1.57s，日志 [角色库视图专项](../artifacts/canvas-role-library-views-final-tests.log)。覆盖真实Dialog和两个子视图的分页、去重、容量、键盘、false提交保选 / true关闭、有效证书、缺writer、部分成功、StrictMode逐层Escape / opener恢复、迟到detail / source / certify / owner隔离、三类型跨页、审核 / 过期 / 服务未接状态、删除重试与嵌套Escape、File metadata / 超限短路 / 取消、force及成功 / 失败IMAGE重核；reader另验真实DOMmedia cleanup / timeout。第一轮2失败为测试fireEvent.click未模拟触发器focus，改为先focus再click后原focus恢复断言通过，未修改公共dialog-stack。

本次新文件定向Prettier与ESLint零警告通过。Role entry CSS沿用sourceActionButton的padding4/8、gap2、font12/line18、9999radius和dark/light inactive / hover / active值。dialog / header / grid / footer / 浮条桌面尺寸按前述source；<=600px添加局部scroll / wrap / 可达布局。没有本代理的native/browser、真实后台或整工程全check结果；这些由Root在冻结后独立验证，不能把28项jsdom测试写成原站授权、原生布局或整目标已完成。

随后只读review发现确定保存重试缺陷：认证成功后Root可能已经CAS写图、仅持久化因Quota失败；若UI再从原详情重新认证并与更新后的existing URI合并，会重复写服务 / 新建记录。现视图在真实成功结果形成canonical payload后，缓存当前选择 / source / owner的确认结果；false或throw后重交原payload，选择改变清确认缓存，source / owner / 关闭按分支生命周期退休。真正成功且匹配URL / accepted URI的partial资产在同owner可复用，未知或过期记录不能当成功缓存。这是本地保存事务适配，不宣称原站具备本地Quota重试协议。

补强回归实际 **2026-10-12 22:58:10，2文件 / 30测试通过，1.33s**，日志 [canonical重试专项](../artifacts/canvas-role-library-views-canonical-cache-tests.log)：模拟已commit导致context变化再Quota失败，第二次confirm必须同payload object且writer仅一次；改变partial选择后确认payload重建、成功项不重复写。原28断言保持。新文件定向格式与零警告lint再次通过，之后冻结交Root整工程 / 真实App / native验证。
