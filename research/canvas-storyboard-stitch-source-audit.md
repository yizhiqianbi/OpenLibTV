# 分镜图片拼接源码与本机合成审计（2026-10-11）

本批核对保存的公开客户端源码，独立实现浏览器 Canvas 合成；没有执行原站 bundle、登录、使用账号资源或调用原站上传/审核/项目写接口。offset 为保存文件的字符位置。本记录区分源端完整流程、已实现纯模型/runtime 与 Root controller 的接线验证；本机 PNG 合成不代表服务器上传、审核或权益成功。

## 源入口与选择规则

主入口为 [`3u6hjewm8qox_.js`](./source/3u6hjewm8qox_.js) module197935 的 `runStoryboardStitch` S，@65360–71466；工具栏 `ts` @745075、分辨率 `te/tt` @743401–743900、调用 `tY` @781564。工具栏仅有 2K/4K，最长边分别2048/4096；`libtv.storyboard.stitch.resolution` 记忆合法值，默认2k。主按钮拼接当前值，菜单选项会设置并**立即发起拼接**。tY 先拒绝 readonly、用 ref 防止本组重复请求、takeSnapshot、提示进行中；源成功文案包含“并上传”，不能用于仅本机合成。

S 要求 Canvas store 已就绪、非 readonly、实际 `type=GROUP` 的目标存在；`isStoryboardImagePackGroupData` 来自 [`1bflqug4ccoei.js`](./source/1bflqug4ccoei.js) module713841 @67569：video subtype 拒绝；image subtype、standalone true 或非空字符串 sourceScriptNodeId 可通过。S 另要求 truthy sourceScriptNodeId 或 standalone true；不是任意普通图片组都能拼接。

输入是**全部实际 direct IMAGE children**，没有 selected、hidden 或 URL 可用性过滤。preferred `childNodeIds` 先过滤实际 image ID，仅在过滤后长度等于实际 image 数量时保留其顺序，否则全部按 `data.name.localeCompare(...,{numeric:true})` 排。长度判断没有去重；完整长度但含重复时，source 会保留重复项并按 numeric name 追加尚未出现的实际成员。本机模型保留该可证行为，图中仍只有原实际节点，重复仅体现在合成输入。此顺序不同于拖动 helper 的 y/x fallback、图片序号 overlay 的8px行容差，不能互换。

URL helper k 优先 `data.originalUrl` **数组**中首个非空字符串，再选 `data.url` 数组；没有 URL 的孩子仍占格。至少一个输入 URL 才允许拼接；全空组与无图片组有不同拒绝原因。`imageCount` 是有 URL 的输入项数，**不是成功加载数**；`emptyCellCount=totalSlots-imageCount`，图片加载失败不会增加这个返回计数。源不弹出选图器，也没有只拼 selected 的分支。

## 合成尺寸、空格与文字

S 使用 [`1eqsg-pmc0mun.js`](./source/1eqsg-pmc0mun.js) module836105 的 `resolveStoryboardGridSlotCount`（manual axes/自动列行/容量规则见既有 grid 审计），输入为至少1的 ordered length，遍历**全部 totalSlots**。ratio 为按序第一个能从 params 提取的比值，包括没有 URL 的孩子，默认16:9；不采用 preserveChildDimensions 的各自尺寸。ratio 提取及初始350短边/1050长边上限来自 [`1kb-4b4zv9_2a.js`](./source/1kb-4b4zv9_2a.js) module713118 @0–1800。

源先从已舍入的 ratio dimensions 换算：短边540，长边 `round(540*long/short)`；logical width/height 为 cols/rows×cell dimensions。scale 将最长边映射到2048/4096，再按 `0x2000000` 像素面积上限修正，PNG 尺寸 floor 且至少1。可选2K/4K正尺寸本身不超过4096²，因此保留面积公式并不等于该路径实际触发了面积降级。源 tooltip 写“含间距”，但实际绘制 x=`col*cellWidth`、y=`row*cellHeight`，**没有4px间距或外边距**；本机合成按实际 S，而不是 tooltip 推测。

Canvas 2D 背景与缺图格均为 `#171717`，smoothing enabled/high；ctx.scale 使用上述 scale。图片按自然尺寸做居中 cover crop，用9参数 drawImage，不拉伸，不按原节点 flow box 截取。逐格顺序加载；不可加载的单图绘成深色后继续，其余可读图片仍能组成 PNG。源自然尺寸≤0时 draw helper 不画，底色仍保留。导出 `toBlob('image/png')`，拒绝 null/零字节；File 名 `${分镜拼接-resolution}-${groupId.slice(0,8)}.png`，节点名 resolution 为源传入的**小写**2k/4k。

`showStoryboardShotNumbers` truthy 时，每一格含空格都绘编号 `String(index+1).padStart(2,'0')`。grid helper font=`16*max(1,max(cols,rows)/2)`（整数列/行正规化）；logical 格左下，inset=`max(4,min(14,round(.035*shortCell)))`，font=`600 {font}px ui-sans-serif, system-ui, sans-serif`，baseline bottom。S 使用黑色描边（lineWidth max1.5/.14font）及三次白色 fill，前两次带不同 shadow；runtime 保留这些实际参数。ctx.scale 同时缩放编号。

## URL 与水印边界

S 的加载分支对 HTTP(S) URL **删除 `x-oss-process` 和 `image_process` 查询参数**，先加载改写 URL，失败后尝试原 URL；这些参数可能包含水印或其他图片处理。loader N 的 `convertToChinaCdn` import 来自 [`3p-thkwdoh37u.js`](./source/3p-thkwdoh37u.js) module740151 @9060，在保存证据中是 identity。HTTP(S) Image 设置 crossOrigin anonymous。

**本机明确保留原 URL 的全部参数与可显示水印**，不实施源的参数删除或去水印重试。这是 Root 授权与 AGENTS 水印边界要求的适配，不宣称与源 URL 分支一致。可注入 `resolveUrl` 只做运营/本地素材映射，runtime 不主动过滤参数、不下载额外“无水印”版本。跨源资源缺少 CORS 可能成为深色格或导致 Canvas 导出 SecurityError；错误必须保留，不能声称已上传。没有发现 S 自行 rasterize 一个新水印；它处理的是实际图片输入与上述 URL 分支。

## 原站上传、新节点与取消

PNG 后 S 生成新 IMAGE ID；自然展示尺寸由 module713118 `computeNodeDimensionsFromNatural` 计算（短边350、长边最多5600）。位置来自 [`0leiedr1esdbe.js`](./source/0leiedr1esdbe.js) module44980 @61930 `findClosestRightFlowPosition`：累计父级 world position，源宽取正数 contentWidth→measured.width→stored.width→350，高取 measured.height→stored.height→350；组右侧120，所有原 snapshot 节点为 obstacle，padding50。初点被挡时比较右向合法 x 候选和最近 y，按平方距离选择，严格小于保留先来的垂直移动 tie。源上传 target 没有 parentId/connectTo，因此结果是新顶层图片，无新增连接。

源 `runMediaUploadPipeline` 参数为 create target、指定 ID/position，extras 含 `type:image/label/name/generatorType:DEFAULT/_explicitContentDims:true/contentWidth/contentHeight`；`audit:'skip',overlay:'default'`。pipeline 来自 [`2ob2qo_b0az9v.js`](./source/2ob2qo_b0az9v.js) module388607 @24207–38300，包装函数 @38299。它需要真实 token/uuid，缺认证会在创建占位节点前失败；读取前 source toolbar 的 history snapshot 不代表已创建成功图。

pipeline 创建 blob 图片占位，注册该 upload job 的 incarnation/generation，展示 uploading/reviewing/success/error；并行实际 probe 与 `uploadViaPreSign`。后者位于 [`1k5w11_he1tz_.js`](./source/1k5w11_he1tz_.js) module301710 @37240–39030：SHA-1、用户路径、pre-sign/object storage 上传、image verify/fileReview。**audit skip 不跳过图片 fileReview**，仅不走单独的视频/音频审核分支。成功用实际返回 URL/resourceMeta 更新节点，create-image 默认还尝试项目封面服务；失败/owner 变化只清理仍属该 job 的占位，不能删同 ID 的新 incarnation。上述都是尚未接入的真实服务能力，不由本机合成伪造。

S 在开始及加载/导出/上传后检查 upload canvas owner 和 group/所有输入节点 continuation guard；guard 检查 store/project/generation/incarnation，不是 URL/params/membership 的完整内容 CAS。S 没有 cancel 按钮，没有将 AbortSignal 传给图片 loader 或 upload pipeline；guard 使迟到结果不继续写，正在 await 的图片/网络本身不因此立刻终止。pipeline 支持 signal，但此 caller 没有提供。S 只在开始明确读取 isReadonly，后续另有 store 写门控范围未凭这段推断；本机 controller 对 readonly/document/成员变化采取更强取消是适配。

源最终成功后验证 upload result continuation，requestImmediateFlush、取消其他 selected、选择新图、报告 practice artifact，返回 ok/newNodeId/imageCount/emptyCellCount。无上传成功不能使用源成功文案。服务取消/owner changed 可静默 cancelled，auth missing、上传/审核失败与零字节导出都有各自错误路径。

## 图片节点的序号 overlay

独立图片 renderer 的 t8 位于 `3u6hjewm8qox_.js` @852839。需 parent data 排除 video，且 image subtype、standalone true 或非空字符串 sourceScriptNodeId，并启用 showStoryboardShotNumbers；这一 selector **没有** parent.type GROUP 检查，也没有 selected/readonly/URL gate。优先 raw preferred indexOf(imageId)+1，即使列表不完整；否则实际 direct images 按 `abs(yDifference)>8 ? y : x` 排后取 index。字体仍使用 actual image count/manual axes 的 grid font，不能用 stitch 的 numeric name fallback替代。

JSX @907127 为 `z-6 pointer-events-none absolute bottom-2 left-2 font-medium tabular-nums text-white`，aria-hidden，文字两位编号；fontSize 来自 t8，textShadow 为 `0px 2px 4px var(--ShadowShadow-M), 0px 4px 10px var(--ShadowShadow-L)`。显示位置是图片节点左下8px，不是节点标题行。CanvasNode 接线由 Root 持有，本模块不操作 React renderer。

## 独立实现 API 与本机差异

- [`storyboard-stitch-model.js`](../src/features/canvas/domain/storyboard-stitch-model.js)：`planStoryboardStitch({nodes,groupId,resolution})` → `{valid,plan}` 或 `{valid:false,reason}`；plan 含 sourceIds、所有 logical items、resolution/pixel尺寸/scale/ratio/cell、计数、编号、name/fileName、displaySize、初始世界 position。模型无 React、DOM、上传或 store。`findStoryboardStitchNodePosition({group,nodes,size})` 可用于提交时按最新图重新避让；缺失父级、环、重复/空 ID、非有限/非正 geometry 原子返回 null，这是本机安全边界。`storyboardStitchCoverRect` 返回自然图 source crop。
- [`stitch/runtime.js`](../src/features/canvas/stitch/runtime.js)：`composeStoryboardStitch(plan,{signal,resolveUrl,imageTimeoutMs})` → `{file,width,height}`。真实 Image→Canvas→PNG File；URL不改写；逐图不可读按源深色格继续。默认10秒图片超时是本机适配，源 S loader 没有超时。取消覆盖异步 resolver、Image、toBlob，卸下 image handlers、清 src/timers/Abort listener，忽略已排队/迟到 callback，并在成功/错误/取消后将 canvas backing store 清为0。没有新 object URL 分配。toBlob null/零字节/SecurityError 不变为成功。
- Root controller 持有文档/组/成员/任务 identity、取消、实际 FileReader、本机 data URL、新 root graph transaction/一次 history 与焦点通知；runtime 不读 graph 或通知。默认通知应为“已在本机创建拼接图”。未来 create/upload adapter 可接运营服务器；本批没有上传到原站、审核、项目封面、认证、收费或 practice 服务成功证据。

## 实际验证与未验范围

2026-10-11 23:20:25 定向 Vitest：**2文件32项通过**（model18、runtime14）。4个 owned JS 文件零警告 ESLint，Prettier 格式通过。纯模型冻结夹具检查 source 输入不变、实际 image membership/preferred/numeric/重复追加顺序、URL优先与参数保留、空格/ratio/2K4K/编号/面积/名称/父级 world/最近位置/cover crop。runtime 仅替换浏览器 Image/Canvas primitive，保留真实模型和异步实现，检查 drawImage crop、空格底色/编号、PNG File、超时、三个异步阶段取消、迟到回调、零字节/安全错误及 backing store 清理；浮点 crop 按误差容限验证。

这不是原生 Canvas 像素截图、CORS/CDN/浏览器兼容、真实手机、运营上传或 Root 全流程验收。Root 的 controller/UI/native QA 与全工程检查另行记录；不能把32项模型/runtime测试当作源服务完成或全站 perfect。
