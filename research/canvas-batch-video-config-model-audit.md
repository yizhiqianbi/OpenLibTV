# v1 分镜图片组 batch-video：纯配置协议

2026-10-12。本批新增 `src/features/canvas/storyboard/batch-video-config-model.js` / `.test.js`，不改旧 `storyboard/video-model.js`、v2 配置或其他生产模块。静态证据来自 [配置 source audit](./canvas-batch-video-configuration-source-audit.md) 所列 chunks；未执行原 bundle、登录、读取账号资源或请求原站费用/合规/生成服务。

## 来源与准确入口

`3u6hjewm8qox_.js`：eM@720233–724999，e6@765971–7669xx，eX@734665，eZ@735049及其提交扫描；普通 General 的带脚本、非video且非v2、非standalone图片组是当前 v1 caller。缺 version/legacy version 不被当v2；脚本 source/link与ready数量仍需当前图核对。v2的选镜与逐镜时长面板不是这段入口，不能移植到v1。

真实 support 目录来自 `research/source/api/config-182.json` 的 `data.linkUrl`（JSON字符串）解析后的 `storyboardVideo`，Root 独立提取 `public/data/storyboard-video-support.json={items:[...]}`。本批只读核对19条逐项完全相等，包含 `kling-v3-omni`；不是全量内容采集，不是从整个 videoModels 猜候选。schema仍读取现有 `public/data/models.json` 的 videoModels/default。纯函数只接受显式 `support` 数组；加载/失败/重试由 caller 区分 undefined/null 与已加载[]，不能以纯default fallback把加载错误当成功。

source eM 默认优先专用support目录中的 kling-v3-omni，否则目录第一条，否则global.defaultModel.video；本机 models.default.video映射global fallback。候选不过滤缺少schema的modelKey。model schema alias storyboardVideo→video；VIP图标/role/disabled等只是目录元数据，纯模型不推断本地actor获得会员、团队权限、费用优惠或真实生成授权。

## exported 合同

```js
resolveStoryboardBatchVideoShots({ nodes, groupId, phase: 'open' | 'submit' });
// {valid,enabled,reason,group?,script?,rows,children,shots,readyCount,
//  initialImageSettings?,firstChildDimensions?}
// shots: [{row,child,firstImageUrl}]
storyboardBatchVideoModelKeys(support); // array | null(invalid)
resolveStoryboardBatchVideoDefaultModel({models,support}); // string | null
resolveStoryboardBatchVideoMode(schema);
initialStoryboardBatchVideoConfig({models,support,initialImageSettings,firstChildDimensions});
refillStoryboardBatchVideoRatio({config,schema,firstChildDimensions});
storyboardBatchVideoSettingsSchema(schema,modeType);
reconcileStoryboardBatchVideoConfig({config,models,support,firstChildDimensions,
  normalize:false,previousModel?});
switchStoryboardBatchVideoModel({config,model,...reconcileContext});
buildStoryboardBatchVideoFeeRequest({config,schema,nodeId,projectId,requestId});
projectStoryboardBatchVideoFee({feeResult,totalCount}); // {cost,originalCost}
storyboardBatchVideoReasonLabel(reason); // Chinese source/local diagnostic | undefined
```

配置函数无React、store、DOM、I/O、全局偏好写入；没有默认requestId生成、原站请求或模拟响应。无效局部config/catalogue返回null，ready投影无效返回valid=false与空shots，不发布半个图。phase不支持任意selector/selectedHiddenUuids/durationMap，这些不是v1 caller的配置字段。

## ready镜头与顺序

open 使用当前实际 direct image children 的图顺序建立 hiddenUuid→child 对应，按脚本rows原顺序输出。submit 先将实际 direct image children 按 `data.name??''` numeric localeCompare 排序，再按rows原顺序匹配；没有 childNodeIds排序、group选择/Canvas选择过滤或子孙递归。第一匹配孩子由第一ready row决定，继承其 params.settings；内容尺寸只有 contentWidth/contentHeight 两字段的类型都为number才返回，不能用 measured/width/media natural值替代。

ready资格精确要求 url为数组且some项为trim非空string；hiddenUuid truthy。构图用的 firstImageUrl严格是url[0]||''，没有替换为第二有效URL或额外trim。例如['','valid']会ready但firstImageUrl为空；[' ','valid']的firstImageUrl是空白原文；字符串URL不进入ready。hidden、temporary没有额外过滤，不能据此忽略实际镜头。

truthy script.linkedImageGroupId与当前group不同为stale-image-group；没有linked字段不自动判陈旧。正常无ready是valid=true/enabled=false/no-children；caller需明确处理disabled，不把合法空态当生成成功。

reason label沿tA@769590–770517及locale中文快照：stale和no-children分别为“当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组”“没有可用于生成视频的分镜图”，未知码回source通用“批量生成视频组失败，请稍后重试”。坏rows/nodeID/name/重复hiddenUuid使用明确本机“分镜数据无效，请检查…”诊断，不将内部reason code直接显示。not-v1、缺source/script是本机入口资料错误；无reason不返回标签。open的source availability无ready文案“请先生成至少 1 张分镜图后再批量生成视频”仍由既有入口规则提供，不能把submit警告当入口原文。

源eX的同hiddenUuid“首child胜出”可能因open/submit扫描顺序而绑定不同图片；本机对重复ready image hiddenUuid及重复truthy row hiddenUuid原子invalid，避免静默错镜，这是维护适配。无效/重复nodeID、坏rows、不能numeric比较的submit name也invalid，保留原图不修改。相关未知大payload/媒体/脚本不深遍历、不序列化、不clone；纯投影保持row/child/settings引用。

## initializer、effect与局部switch

eM initializer只输出 `{model,modeType:'singleImage2video',settings}`，不初始化prompt/count/advancedSettings或保存到script/group/global。settings仅继承truthy resolution。ratio用既有公共extract的settings路径：非空trim且非auto ratio→其他ratio*按键顺序→aspectRatio；缺省再以首图content尺寸选七个近似比例（1:1、16:9、9:16、4:3、3:4、3:2、2:3，最小绝对差<0.15）。复用旧helper中已精确一致的七ratio数学，不改旧initializer的v2用途。

initializer寻找当前schema.properties第一ratio*字段，直接按**原schema键**写入，即使有originalField、enum不含该值也如此。后续普通settings正规化另处理storeKey；不能把initializer提前enum过滤或改写originalField。后续尺寸derived ratio refill为独立effect：仅有enum且包含derived ratio、当前raw字段非truthy才补入；**enum缺失的source短路不执行setConfig**，不能误做成无enum可补。

mode顺序是schema.properties.modeType.items中存在singleImage2video键→它，否则image2video键→它，否则text2video；不检查容量max>0、不根据将来图片/当前incoming切换模式。reconcile只按source support非空effect重置不在目录的model；support=[]不强制覆盖既有model。新schema再同步mode和enum-only ratio refill。切模型只改局部model，settings/advanced引用保留到显式正规化；关闭后重新打开由最新初始资料重建，初始首图更新不自动重置已编辑局部config。

共享node resolver对modeType.items默认要求max>0，和本caller的键存在规则不同。显式normalize临时在schema.config.textModes声明已解析的source mode，使零容量/空值键也按该mode处理defaults与settingsRules；不改原schema、不改共享schema.js、不添加媒体input。专项检查普通settings为数组且textModes已有text2video时，仍使用singleImage2video的数值override与高级keys，保留一次正规化后的引用幂等。

## 共享settings正规化与边界

`normalize`默认false，保source局部effects；caller明确true才复用现有 `generator/schema.js::resolveGeneratorParams`，inputCounts固定 `{imageList:0,videoList:0,audioList:0}`。不能因为未来每镜可能用一张图就伪造已连接media参数。普通settings.config和properties完整保留，**普通字段不按batch过滤**；高级仅当前mode、batch===true、enable!==false。不将mode缺失的advanced回退text2video；公开Flight局部alias沿既有fieldGroups解析，是现有本机snapshot适配。

不强造count属性或count enum[1]；count1属于共享params投影和费用请求，UI必须单独suppressCount/不提供prompt/mode编辑。normal结果按source callback浅合并到已有settings，保留initializer raw ratio键和其他局部字段。advanced当前源已知字段的stale-mode值清除；resetOnModelSwitch字段与voice元数据按源重置default，其他无关metadata保留。高级是否显示还由UI既有barOnly/hidden规则控制，纯高级keys不另造显示入口。

source advanced eb@700xx主要保留已有值、同步default、清理stale与model reset；本机显式normalize:true进一步沿共享resolver校正非法advanced enum/slider。这是坏旧配置的共用规则适配，不能宣称逐字节复现源异常advanced值。正常合法公开schema设置共用同一typed enum/originalField/rules，不复制第二套参数UI逻辑。

当前共用GeneratorSettings在render展示resolve结果，但没有将全部初始化defaults自动同步parent的effect；Root需显式normalize以使提交/费用settings与显示一致。这条caller必要操作已反馈。normalize完成后未变字段和值通过引用/ownkeys比较返回同config；只一段改变时另一段原引用保持，避免controller effect重复setConfig循环。不对整个graph/大payloadJSON.stringify。

## 单份费用请求与全部数量投影

源码eM effect在300ms后取最新schema vendor，builder只构造以下**单份**请求：

```js
{
  params:{prompt:'',model,modeType,count:1,settings},
  metadata:{node_id:nodeId??'',project_id:projectId??''},
  provider:schema?.modelVendor||'', model,taskType:'video',requestId
}
```

没有advancedSettings、真实图片URL、modelSchema、总镜头数、durationMap、selected镜头或权益状态；requestId由caller注入。本机没有调用原calculator，没有服务时feeResult=null，展示“-”，不能填假0或假折扣。

projection输入feeResult即 `{power,originalPrice}`，totalCount=全部ready rows数。numeric power乘N，存在且不等的originalPrice同时乘N；相等/缺失不划线，非numeric power按String展示不乘。保sourcetyped scaling（数字字符串originalPrice在scale1可原样，其他scale相乘），没有重新估计各镜或按时长求和。输出cost/originalCost便于UI按source primary→“/”→划线原价绘制。

response.code非0保旧费用、catch清null、source不先清loading、不因advanced或总数发新estimate，是controller状态规则，纯model不持计时器/HTTP或返回假result。若本机AbortSignal/变更清旧fee/owner身份更严格，须由controller审计记录为适配，不能把纯payload测试当真实费用验收。

## 本批验证

初轮52项于02:52:34通过；补归一引用no-op、Flight alias与真实19条目录后56项于02:55:28通过；补source/local中文reason投影后65项于02:59:48通过；补zero-capacity/空值mode键的共享normalize回归后，最终本模型**1文件67项通过，03:01:57 / 572ms**。覆盖open/submit、数组some与firstURL、真实content尺寸、重复身份原子invalid、source默认/非schema目录、ratio初始化/enum-only refill、键存在mode与mode-specific rules、batch高级与普通不筛、zero media rules、model switch/voice reset、metadata与引用、准确单份fee/typed N倍展示、真实公开Kling-v3-omni schema，以及source文案与内部码不泄露。

owned JS文件定向ESLint零警告、Prettier完成；没有运行全量check或变更旧production文件。Root/graph/UI接线、费用adapter取消和原生浏览器验收不在这些纯tests的证明范围；生成/费用/真实合规服务仍未连接，整个前端复刻目标未完成。
