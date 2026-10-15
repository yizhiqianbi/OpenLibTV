# VIDEO 角色库与主体库：源码模型协议

本批仅静态读取已归档的公开客户端脚本，不执行原站脚本，不访问账号或调用原站写接口。角色库 `rr` 与主体入口 `rb` 是两套协议；不能因为都呈现人物素材便合并为一个 `subjectList` 或虚拟角色节点实现。默认目录和写服务是否可用由服务适配器明确提供，不能制造角色、审核成功、协议签署或上传成功。

偏移使用 **UTF-8 解码后 Unicode 字符序号**，0 基、半开区间 `[start,end)`；不是字节偏移，也不是浏览器 UTF-16 下标。源码 SHA、字节长度、字符长度、片段 SHA、完整片段及词项扫描存于 [静态证据](../artifacts/canvas-role-library-model-source-proof.json)。函数片段由源码静态提取，未作为生产代码执行。以下所有行为结论均限定为本次归档版本；函数存在与真实入口调用分别说明。

## 1. 真实入口和门控

`24mj3em3412ij.js` VIDEO default renderer（`580897`）给 `rr` 传入三类容量、既有 ID Set 和既有 URI 数组，确认回调是 `ag`。

| 证据                              | 位置                                     | 真实行为                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aF` / chips / `rr`               | `[206800,210580)`                        | 角色 chip 条件是 `ao>0 && !eX`，外层还要求 `!restrictedExperience && !digitalHuman`。`eX` 是有效 extraConfig；**不是**仅 `properties.portrait===true` 才显示角色库。                             |
| `aK`                              | `[207635,207718)`                        | `modelRequiresPortraitCompliance({modelKey,modelSchema})` 控制 Seedance tab。                                                                                                                    |
| `modelRequiresPortraitCompliance` | `2ilrvr6vqg1xe.js [6080,6420)`，`514509` | 实现为 `schema.properties.portrait===true                                                                                                                                                        |     | isSeedance2Model(schema)`；modelKey 不是这个实现的判定输入。 |
| `rr`                              | `[135744,138211)`                        | 公共人物库 tab 始终存在；Seedance 合规库只在 `aK` 时存在。无 Seedance 时强制 public；有时读取 `libtv:role-library:active-tab-v1`，只接受 public/seedance，缺省 seedance。切 tab 仅此时保存偏好。 |
| 模型变化 effect                   | `[187479,187775)`                        | 换模型清 `fineTuneModels`，新模型 `portrait!==true` 时关闭角色库；此处没有删除角色资源节点、边或主体列表。关闭条件与入口/合规 tab 条件并不等价。                                                 |

只读、文档加载、配置锁定、保护与异步 owner/CAS 属于本地编辑器接线需要增加的写门控，不能被描述为上述 `aF` 的原始表达式。仅函数源码不能证明原站账号权益、服务端实际目录或授权成功。

## 2. 公共人物库：目录、详情、预览与选入

`re` 位于 `24mj [121606,135702)`，真实 reader 为 `668135`，见 `0-8_zejn_ex9w.js [34064,35280)`。

- 列表 POST `/api/character-library/list`，实际 caller 参数 `{page,pageSize,orderBy:'updated_at_desc'}`。初始 page=1 / pageSize=10，页面 size 候选 10/20/50；不传搜索词、teamId 或用户角色库参数。返回应用对象 `{list,total}`。`isApiOk` 失败被源 service 转为空列表/0；本地应保留不可用/错误，而非把未授权解释成可运营的空库。
- 列表条目以 `characterUuid` 查询详情：GET `/api/character-library/detail`，query `{characterUuid}`，成功取 `data.detail`。点击先展示浅复制列表条目，清材料选择/预览，然后补充详情。源列表有 request counter；详情这一段没有同样的迟到结果门控。本地 owner/request epoch 是必要适配。
- 详情遍历 `mediaBlocks[].items[]`，仅保留 truthy URL，按 URL **第一次 occurrence 去重并保原顺序**。材料对象为 `{url,thumbUrl,blockName,name,assetId,complianceCheckedAtMs,createdAtMs}`，`name=item.label || block.blockName || detail.name || ''`。不按人物 UUID 去重材料，不凭 URL 推导 assetId。
- 可追加数量为：有 numeric imageSelectableCount 时 `max(0,imageSelectableCount-existingImageUris.length)`，否则4。现有 URI 的数组长度直接计数，不先去重。选择 Set 按点击顺序保存；已选项可取消，未选项在容量满时禁用。选择 URL 与已存 URI 最后才去重，因此这里的限额不会因为选择相同 URL 自动释放。
- 材料预览与选择分离；下标循环前后切换，Escape 先关闭预览（capture keydown/stopImmediatePropagation）。详情返回清选择和预览。列表分页跳转限制 1..max；窄屏/模态视觉由 views 审计，不由纯模型测试代替。
- 非合规公共确认：`Array.from(new Set([...existingImageUris,...selectedUrls]))`；原视频/音频 URI 数组原样交给 `onConfirm`，随后关闭。**不插入提示词 token。**

卡片使用的最小数据字段可以直接服务适配，不应伪造服务端 schema：列表 `{characterUuid,name,coverUrl,mediaBlocks?,materialCount?/mediaCount?/mediaItemCount?/imageCount?/assetCount?}`；详情 `{characterUuid,name,mediaBlocks:[{blockName,items:[{url,thumbUrl,label,assetId,complianceCheckedAtMs,createdAtMs}]}]}`。计数展示按首个 non-null 候选取值，finite positive floor，否则4；它不是确认容量。

### 2.1 公共素材要求合规时

`re.es [124053,125987)` 的真实分支：已有材料 `assetId` 且证书未过期，则选入 `asset://ID` 并把该材料加入第三方缓存（`uuid=assetId`，`assetType='image'`，`status=1`，保原 URL/检查时间）；否则按 URL 调用 `createComplianceAsset(url,'image',{force:!!oldAssetId})`。创建按 Promise.all，可部分失败。创建结果的 Map 以 uuid 为 key，同 uuid 后一次 URL 覆盖前一次；poll 后 status=1 且 assetId 输出 asset URI，status=1 且 exempt 输出原 URL，其余失败。无成功项时保对话框并报错；部分成功警告后选入成功项，与既有图片合并去重，保视频/音频。

证书时效委托实际 `getSeedanceComplianceCheckedAt` / `isSeedanceComplianceExpired`，不凭 `status=1` 或有 assetId 当作永不过期。本地纯函数接收已经验证的 certificate/result；reader 无 writer 时可以预览/选择，但要求审核的新材料确认必须明确阻断并保留选择。禁止注入假审核结果。

非合规公共原 URL 经 `ag/rV` 被源前端写 `portraitCompliantExempt:true`，这是**该 caller 的前端分类字段**，不代表服务端已经审核、用户已经签署或可以真实生成。运营接入必须重新校验这个语义，不能向真实写服务谎报审核完成。

## 3. Seedance 合规库：三类 Set、人物分组与写动作

`t4` 为 `24mj [102216,120448)`，外层 `rr` 以 embedded=true 调用。容量由 VIDEO caller 提供，不是每 tab 固定20。tab 初始 image，候选 portrait/image/video/audio（`[84009,84700)`）；page map 各自保存，pageSize 初始15，可选15/20/30。portrait 与 image **共用同一个 image selection Set**，video/audio 各自独立。既有 ID 在 mount 初始化，不能在分页时重新清空。

- 初始化检查 star-video 与 doubao-visual 两份 agreement；star-video 未签署时呈现 agreement modal。实际 sign 是写接口，并非打开目录即可假定同意。
- image/video/audio：`listThirdAssets({page,pageSize,assetType})`；portrait：`listVisualRecords({page,pageSize})`。人物分组进入后 `listThirdAssets({page,pageSize,groupId:visualGroupId})`，返回的是该组图片。tab 请求有 counter + 当前 tab 校验；组请求有独立 counter。
- ThirdAsset 真实消费字段：`uuid,assetUrl,assetId,assetType,status,createdAtMs,updatedAtMs,complianceCheckedAtMs,error_json,groupId?`。visual group 消费 `id,visualGroupId,title` 和其列表显示字段；没有匿名公开数据确认完整 response schema。
- status0 审核中、status1可用、status2拒绝；图片/视频还校验证书过期，卡片必须先满足可选 gate。选择 key 为 `assetId || assetUrl`，没有 key 不选。容量<=0不能新增；Set 满不新增；选中可取消。新选行缓存到 Map，跨页保留。
- 确认将未过期 cached rows 合入 store，再每类 Set 输出：有 row 且过期→移除；有 assetId→asset URI；有 assetUrl→raw URL；无缓存但 key 以 http 开头→key；否则→asset URI。图片与 portrait 共用输出 images。确认回调与公共 tab 相同。
- cached row 更新保留原值并接服务器的 status/assetId/assetUrl/check time/error；不能用仅 URI ID 推导真实 resource URL。`resolveAssetUrl(assetURI)` 只查第三方缓存，找不到返回 `''`；普通 URL 直接返回原输入。

### 3.1 存在且被真实界面使用的写动作

本批不调用以下写操作，但不能将其从完整前端协议中抹掉：

- 上传 file：先 `Array.from(input.files)` 并清 input value；原 caller 检查 cookie token/uuid，缺失提示登录。按 portrait/image/video/audio 校验，pre-sign upload，resolveUploadUrl 后 create asset；portrait group upload 带 groupId。historyGallery 上传也是实际入口，不能只实现文件 input。
- 第三方新建/审核：create 的 payload `{assetUrl,assetType,groupId?,version:1}`；check `{uuids}`。审核失败/找不到行/过期/重新审核分别呈现状态。批量串行动作保存 progress `{current,total}`；全部失败提示并保结果页面。
- group 主体真人二维码创建/轮询（visual-validate/result），重命名 `{id,title}`、删除 `{id}`；asset 删除 `{uuid}` 有明确确认、失败提示与刷新。
- 已审核项 recheck：有效同 URL/type 新缓存可替代旧项并删旧记录；否则 force=true 重新创建，poll 成功后才删旧。删除旧选 key/cache，刷新正确 tab/group。不能先假删再把 reader 响应当 writer 成功。
- 普通 store poll 每3秒、最多60轮；group 内 pending poll 每3秒、最多40轮；失败置 status2 后停止。取消/关闭必须退订计时器，禁止当前 tab 被旧 poll/旧 finally 回写。

`1b45 [9590,14457)` 和 `1k5w11_he1tz_` 的 `386598/802182` 是同一协议副本。端点在 `170exq [25814,26365)`：POST `/api/third_asset/{create,check,list,delete}`，POST `/api/third_asset/visual/{list,update,delete}`、`/api/third_asset/visual-validate`、`/api/third_asset/visual/result`；agreements POST `/api/agreement/check` 与 `/api/agreement/sign`，agreementType 分别 star-video/doubao-visual，签署 version=v1.0。source 的 list catch 转空、check 非0 throw、create code10025额度告警、delete code10051不存在提示均应保其区别。本地默认 source unavailable；不是默认空成功。

### 3.2 抓取是 dormant prop，不增加入口

`rr` Seedance 分支传 `onCanvasCapture` 给 t4；t4 `[102216,120448)` 的该参数 binding 在字符102264声明，AST `referencePaths=[]`。新增菜单实际只有文件上传与 historyGallery。VIDEO `af` 虽构造了 canvas URL-pick→createAsset callback，但本 caller 没有消费；本批不添加抓取按钮、裁剪框或假新图。精确独立链见 [capture 审计](./canvas-capture-model-source-audit.md)，此次 proof 也保留静态 binding 结果。

### 3.3 文件预检与历史 URL 预检并不相同

`24mj [84651,87583)` 的 file tW/t$/tY：图片大小<=30MiB、尺寸各300..6000且宽高比严格在(0.4,2.5)；视频<=50MiB、2..30秒、尺寸各300..6000、宽高比闭区间[0.4,2.5]且 width×height>=409600；音频<=15MiB、2..15秒。超尺寸在读取前短路，不额外以 MIME/extension 新增错误 gate（accept 由 input 定义）。错误中文来自 `2ijgtfwpg93os.js`，与校验函数键一致。

history URL 的 tZ/tJ/tQ 会优先用已有有效 metadata，否则 DOM读取；部分未知项和读取失败源实现可返回null。file/URL两者不能不加说明地共用一个“成功”策略。当前本地 `validateRoleUploadMetadata` 面向文件预检，要求读到 finite/positive metadata；NaN/缺失不允许假成功，返回对应“无法读取…信息”。这是明确本地防御；`124189` 源底层 video-duration helper对NaN确实可返回valid，不能把本地strict gate误写为原源已有。reader取消、objectURL释放与真实writer调用由controller/view hook负责，纯函数仅数据校验；`roleUploadSizeError(type,size)`供读取前同一阈值短路。

## 4. VIDEO 确认到资源节点与连线

实际 `ag [199155,203183)` 只替换本角色库管理的 incoming references。普通 incoming 媒体保留。

| 选中种类        | 被管理的 incoming node 条件                                     | 新节点 data                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 图片 asset      | IMAGE + portraitAssetId                                         | `{type:'image',name:assetImageLabel+statusSuffix,url:[resolvedURL],action:'image_resource',contentWidth,contentHeight,portraitAssetId,...checkedAt?portraitComplianceCheckedAtMs}` |
| 图片 raw/exempt | IMAGE + !portraitAssetId + portraitCompliantExempt + 首 URL非空 | 同图片，`portraitCompliantExempt:true` 替代 portraitAssetId；name 无审核 suffix                                                                                                    |
| 视频            | VIDEO + `isAssetSourcedVideoNode(data)` + assetVideoAssetId     | `{type:'video',name:assetVideoLabel+statusSuffix,url:[resolvedURL],action:'video_resource',assetVideoAssetId,...checkedAt?assetVideoComplianceCheckedAtMs}`                        |
| 音频            | AUDIO + assetAudioAssetId                                       | `{type:'audio',name:assetAudioLabel+statusSuffix,url:[resolvedURL],action:'audio_resource',assetAudioAssetId}`                                                                     |

`isAssetSourcedVideoNode` 排除 `assetVideoCertifiedInPlace:true`。既有 video IDs 初值也排除此类；不能把原普通视频原地认证误当角色库拥有的资源而删除。图片 `rz` 本身未检查 portraitCertifiedInPlace；必须保这项源码差异，不机械套 VIDEO helper。

差异删除对每个不再选中的受管理节点 `find(source===id && target===owner)`，只删**第一条匹配边**，不删除媒体节点，不删除节点其他目标边。重复 ID 选入按 Set 去重；已存在资产 ID 不新增节点。video/audio 选入只取 asset URI 的 ID，raw URI 没有新增 video/audio 分支。不能为了“通用”凭 raw URL 创建这两类节点。

`rV [161338,162476)` 对图片先 await readonly Image natural dimensions，失败 fallback NODE_WIDTH×NODE_WIDTH；检查捕获的 upload node continuation，再读取最新目标/最新 nodes，用 `findClosestLeftFlowPosition`（`0le [60802,62280)`）在目标世界左侧寻找空位。图片节点显式 width/height/measured，addNode skipOverlapResolution=true，再 addEdge。视频/音频同步新建，x=`target.position.x-(target.measured?.width??target.width??NODE_WIDTH)-NODE_GAP`，y 分别目标原始 y+200/+400；源码这两类没声明尺寸，随后 `addNode [95779,96495)` 会做普通垂直避碰（margin=NODE_GAP/2、最多30轮）。因此不能把裸 y+200/+400 当作所有碰撞场景的最终坐标。图片 helper 处理 parent 世界位置，视频/音频这里直接用 raw position，这是源路径差异。自然图短边350、长边按比率取整并上限5600，节点gap100，见 `1kb-4b4zv9_2a.js [650,1360)`。

所有新增边都为 `addEdge({source:newID,target:ownerID})`，**没有** portraitVirtual/assetVirtual。source 的图片 forEach 不 await rV，多个节点/边/params 是多个 store 操作，不提供本地单次 CAS 的保证。

`ag` 最后构造 simulated media lists，只用于确认模式：保普通 image（无assetId、无compliantExempt）、普通 video/audio（无assetId），append选中 assets/exempt；临时 nodeId 为 simulated-asset-ID/simulated-exempt-URL。保可见且 enabled 的当前模式，否则 best enabled；无媒体也 best enabled。只 `tl({modeType})`，**不保存 simulated IDs 或把其当真实节点**。

### 4.1 底层 incoming 同步会改变提示词

“ag 不直接写 prompt”不能解释为整个确认永不改 prompt。`0le store ig [84695,88031)` 在实际连线变化后：

1. 收集实际 incoming 普通边（排 portraitVirtual/assetVirtual 和 REFERENCE nodes），展开 group，加入 characterRef；合并历史 params 中 nodeId 为 asset protocol 的 legacy media refs。
2. 应用 image/video/audio 各自 order；根据 stable nodeId 重映射 `{{Image|Video|Audio|Mixed|Portrait N}}`。已不在新列表的旧引用 token 删除，存在但序号变化则更新；mixed protocol 下转 Mixed。删改发生时源正则还清相邻换行/空白并规范空格/trim。
3. 最终 params spread 原 params，只更新 prompt/textList/imageList/videoList/audioList；其他 settings/advancedSettings/magicList/subjectList 等保留。pictureEditLock、segmentRemake 分支另有专用降级，不能在本角色库任意复用。

本地必须先 project 最新未提交草稿，再对最终图作引用映射/模式推断、一次 expected raw CAS 和 history；不能基于打开弹窗时旧 prompt 覆盖末次输入，也不能把 source split store 操作照搬成多次本地历史。存储失败已接受图的重试只 flush，不再重复建节点/边或重复 history。这是本地持久化适配要求，不是原站已经证明的原子服务保证。

## 5. 虚拟边、Portrait 别名与恢复边界

归档中没有 `portraitList` 参数字段；扫描包括310个 UTF-8文本 JS 与30个 gzip JS。`Portrait` token 是历史 **imageList 别名**：`0le [14650,15229)` 及 store ig 都将 Portrait 映射到 imageList；不是建立第二份图片列表。Subject 则独立 subjectList/Element。

`0le collectIncomingNodeDataForTarget [11072,11660)` 排除 virtual edges，并给真实图片映射 portraitAssetId→assetId、portraitCompliantExempt→compliantExempt、check time/created time；视频映射 assetVideoAssetId（兼容 portraitAssetId）与时间/字幕/transition；音频映射 assetAudioAssetId（兼容 portraitAssetId）。保资源真实 metadata，不能用节点显示尺寸冒充自然尺寸。

`1bflqug4ccoei.js ei [70945,71553)` 在后端文档恢复时，source节点的 `_portraitSourceVideoNodeId` / `_assetVideoSourceVideoNodeId` / `_assetAudioSourceVideoNodeId` 恰好等于目标 ID 才恢复 legacy 虚拟边旗标。它不是本轮 rr/ag 的建图协议。普通目标还可持有 nodeId 为 asset:// 的 persisted media references。不要为了复制原 UI 创建新的虚拟节点、虚拟反向边或从缺失 URL 猜素材。

本地共享 collector 当时尚未将 portrait/asset metadata 映射到 incoming，且 legacy empty portraitList/elementList 会遮蔽 imageList/subjectList 回退；应由共享接线维护者纠正。这些是本地现状，不是源 schema。复制/导出应保 resource data 与 owner params，重映射真实 nodeId/edges；不把服务缓存或账号协议写进本地认证，不假设 copy 可保跨账号资产授权。

## 6. 三媒体容量、组合与模式可用性

VIDEO `ao/ac/au [195510,198807)` 均是 caller 的剩余角色容量：ordinary refs 占用容量；既有 asset 不先扣（它们在 picker selection Set 中占槽）。公共 tab 再扣既有图片 URI 数量；Seedance 直接用容量上限限制 image/portrait 共享 Set。

- 图片：ordinary=`imageList.filter(!assetId).length`（含 compliantExempt）。无 mode items→max(0,10-ordinary)。singleImage/frames/image2video 用对应range.max；mixed/videoExtend/longVideo 用 range.max-videoCount，再限 mixed2videoConfig.imageMax 和有video时 imageMaxWithVideo；videoEdit 仅有video时配置 imageMaxWithVideo，否则0。当前算0时跨 single/frames/image/mixed/未exclude的视频续写求最大，最后扣 ordinary。
- 视频：ordinary=`videoList.filter(!assetId).length`。无 items→max(0,10-ordinary)。video2video直接 max，videoEdit限 videoEdit2videoConfig.videoMax，mixed/videoExtend/longVideo扣全部imageCount并限 mixed.videoMax，audio2video用range.max。当前0时跨可用相关模式求最大；仍为0则**9**，最后扣 ordinary。不能把9误判为“所有模型支持9视频”。
- 音频：ordinary=`audioList.filter(!assetId).length`。usesMixedListProtocol（mixed/续写/long 或 Seedance2.5 videoEdit）且 mixed.audioMax 是number，则 max(0,audioMax-ordinary)，否则 max(0,1-ordinary)。

`0le 469850 [16690,23525)` 的 media combination 与 `computeModeTypeAvailability` 是独立判定：mixed range 同时统计 image+video，只有 caller options.includeAudioInMixedList=true 且 audioMax>0 才将audio计入 mixed range；videoMax/imageMax/imageMaxWithVideo/audioMax 仍分开限制。videoEdit必须有视频、按video range计数，但可容纳配置允许的图片/音频。单一 typed 模式可以提示忽略其他已连接类型；忽略不是自动删除边。excludeModeTypes 隐藏模式，supportLongVideo=false 排 long；empty graph的 text fallback 与非空媒体 best mode不同。

归档无 `combinedMedia`/`availableMedia`（包括大小写变体）字面字段；这里应复刻上述组合函数和 availableMode 返回对象 `{key,label,visible,enabled,disabledReason,warningReason}`，不发明同名 schema 参数。mode caller 与限额 fallback 并非服务端校验通过证明。

## 7. 主体 rb/rh：subjectList 与 shared limits

`rb [156419,158594)` / `rh [152275,156419)` 并非 rr 内 tab。

schema：`getSubjectConfig(schema,modeType)=schema.properties.subjects?.items?.[modeType]??null`，`0le N [23525,23617)`。配置字段为 `{maxCount,maxCountWithVideo?,sharedWith?,videoSubject?:{maxCount?,disabledWithVideo?,disabledMessage?,disabledMessageI18nKey?}}`，外层 subjects.disableVideoSubject。

- 有 videoList 且 maxCountWithVideo 非null时用它，否则maxCount；sharedWith 是 params list key，剩余=`max(0,max-subjects.length-params[sharedWith].length)`；没有config就不显示主体入口和已选主体条。
- props.subjects.disableVideoSubject 设 onlyImage；evaluateVideoSubjectRestriction 在其truthy或mode.videoSubject.disabledWithVideo&&hasVideo时禁视频主体。视频主体数量按 `isVideoUrl(coverUrl)`，不是videos数组。
- effect 先移除被限制的视频主体并warning；有config时按当前容量/shared list数裁剪前N；videoSubject.maxCount超限保非视频，再前N视频（这个分支会将非视频移到前面）。失去config时 rb 不执行“清全部subjectList”的分支，不能自行抹数据。
- `rh` 在有效协作projectTeamId与已有userTeamId时显示team/personal两tab，open时默认team；否则personal。主体 reader `useSubjectList` 每页20，scroll距底50px加载，字段 enabled/type/name/onlyImage/pageSize/teamId/userIds；teamId只取合法numeric项目ID。实际 rb caller 不提供搜索/type/userIds。
- 选中去重uuid，写条目 `{uuid,name,coverUrl:coverUrl||images[0]?.url,klingId:specialSupportIdMap?.kling}`。追踪统计会用 videos[0] 回退，但实际存入coverUrl不使用此fallback。只 `tl({subjectList})`，不新建 media nodes/edges、不插 Element token。卡片移除按uuid从 paramsRef 最新列表filter。
- nested查看是 readOnly SubjectEditModal；创建是独立可写 modal，成功 reset list并关闭创建，**不自动选入**。关闭外层时清 nested/create；Escape 在nested/create打开时不关闭外层。
- `canAcceptConnection` (`0le [23940,24290)`) 模拟加入媒体并检查主体 shared limit；若当前模型不合法且已有subjectList，拒绝，不擅自切另一个模型；没有主体才找兼容其他模型。这是连线 gate，与 role picker容量不同。

`useSubjectList`/service `1567g [4819,6039)` / `[6040,9560)` POST `/api/canvas/media-asset/entity-library/list` 返回包内 `data.entityList,total`，转换SubjectMeta（entityUuid的uuid getter）。fields包括 entityUuid/name/description/coverUrl/images/videos/audios/type/ownerId/createdAtMs/updatedAtMs/specialSupportIdMap。source hook有并行busy guard但没有signal/epoch；本地scope切换必须增加取消与迟到隔离，不能照搬busy导致旧scope回填。

create/update/delete POST entity-library 对应端点，progress GET `{taskId}`；generateSubjectDescription及smartcompletion真实提交生成并poll90×2秒。函数存在，不证明匿名授权；本轮无账号与生成/写服务，按能力禁用，保持错误和重试入口。`1k5` userCharacterRepository `/api/user/character/*` 是另外的用户角色数据库，不能用它替代本 rr public catalogue 或 rb entity subjects。

## 8. 建议可注入契约与纯计划范围

reader 必須有明确 unavailable/unauthorized/error，而非默认成功空库；全部方法透传 AbortSignal。返回 normalized domain values，服务端code/rawResponse保诊断，禁止UI自行读取cookie/token。

```js
roleSource.listPublic({ page, pageSize, orderBy }, { signal }) // { list,total }
roleSource.getPublicDetail(characterUuid, { signal }) // detail | null
roleSource.listCompliance({ page,pageSize,assetType?,groupId? }, { signal })
roleSource.listVisualGroups({ page,pageSize }, { signal })
roleSource.checkAssets(uuids, { signal }) // result list
roleSource.resolveAssetUri(uri) // asset record/url or unavailable; 不猜URL
subjectSource.list({ page,pageSize,type?,name?,onlyImage,teamId?,userIds? }, { signal })
```

独立 optional writer：agreement.check/sign；upload；create/check/recheck/delete asset；visual.validate/poll/update/delete；subject.create/update/delete/progress；subject生成。缺writer时明示操作不可用，reader正向fixtures只证明适配器契约，不证明原站授权。

纯模块拟接口：

- roleLibraryCapacities({schema,params})，roleLibraryAvailability({schema,params,isValidExtraConfig,...hostGates})；保持 caller 源三类容量，而非统一常数。
- flattenPublicRoleMaterials(detail)，publicRoleRemainingCapacity(cap,existing)，toggleRoleSelection(set,key,limit)，publicRoleConfirmUris（验证过的certificate/results注入）；纯函数不请求网络，不设协议同意。
- planCanvasRoleLibrarySelection({nodes,edges,targetNodeId,selection:{images,videos,audios,assets?},schema,resolveAssetUri,makeNodeId,makeEdgeId,imageDimensionsByUri,labels,createdAtMs?})：基于最新graph/draft，移除首边、保媒体节点、解析真实URL、产生resource nodes/edges，最终真实incoming remap token及mode。有效变化返回 `{nodes,edges}`，有效不变返回 `{nodes,edges,unchanged:true}`（保原引用），损坏输入返回null。ID/自然尺寸读取结果及可选时间由controller注入；resolver返回 `{url,assetId,complianceCheckedAtMs?,createdAtMs?,status?}` 或null，裸URL字符串/未解析assetURI/不一致ID不作为真实记录。异步reader、文档owner、capability再次校验、取消、CAS、一次history及flush重试属于controller。

本地可以将源多次store更新变成一个事务，但不得虚构生成、审核、服务保存或原站收费状态。是否开放subject writer、团队权限、公开目录授权、真实审核时效与服务器验证仍是服务接入边界。

## 9. 本批验证与冻结状态

本轮静态 evidence 提取已核核心真实调用链；未操作浏览器、未原站写入、未使用账号，未跑全量检查。Root另有匿名一次只读验证 [anonymous proof](../artifacts/canvas-role-library-anonymous-read-proof.json)：HTTP200/code10001未授权；这个结果不提供正向目录样本，默认 source unavailable仍需保持。

已落盘纯 `role-library-model.js` 和 `role-library-graph-model.js`，仅管角色选择/三媒体容量、明确证书计划、文件阈值、真实图差异及prompt映射；不请求服务、不设置协议同意、不生成成功。纯计划沿 source 的“首次edge删除/保node/既有ID复用/raw VIDEO-AUDIO不新增/模拟mode”语义，同时本地一CAS必须由host做。unknown asset URI可按源跳过新节点，但模拟mode仍由selected ID计数；Root controller须在计划前拒绝没有明确可解析记录的资产。source先前的图片异步交错改为读完数据后一个图计划，输入/连线顺序以source417754的edge顺序为准，根节点仍按source unshift顺序保存。

首次定向52项有一项fixture将有媒体当前模式设为text2video，实际源规则正确转换为Mixed；已把该case设image2video以只隔离edge顺序验证，保完整prompt强断言。新增文件的完整统计与最后定向结果见proof.localValidation，owned eslint零告警/Prettier通过；定向联合不是整工程check。rb主体UI/shared limits、协议签署、真人二维码/groups、私有账户授权、真实生成与运营writer仍不由这两纯模块完成，不能用helpers或注入fixture宣称全原站角色/主体服务已接入。整个目标未完成，未部署。
