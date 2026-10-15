# 画布抓取：实际 source 模式与 consumer 协议

2026-10-12。本批只读公开归档脚本/CSS/locale，新增本文；未执行原 bundle、读取 cookie/token、登录、小号、原站请求、部署或操作现有浏览器 Tab2。偏移均为 UTF-8 解码字符串的 0-based 字符。先核实真实模式，再讨论实现接口，不能以“区域截图”的先入判断创造裁剪流程。

## 结论与真实范围

原站 `isCanvasCaptureMode` 是**在画布点选 IMAGE 前图，把已有原图 URL 交给一个临时 callback**。已发现 callback consumer 为 VIDEO 生成器的第三方素材/合规库创建动作；没有矩形截图、自然像素裁剪、新图片节点、source→target edge 或生成参数写入，也没有 focus-return。

更重要的入口边界：VIDEO caller 确实构造并透传 capture callback，但唯一接收的公开素材库组件 **没有使用该 callback**。因此本次 archive 证明了底层 URL pick 与素材写链，不证明当前公开 UI 可点击进入 capture。不能凭 locale、dead prop或store方法虚造一个“画布抓取”按钮，更不能把另一个 Crop 编辑工具当成 capture。Root后续应分别决定潜在底层模式的保留范围与真正可见入口的证据核对，不把未核实入口标完成。

## 1. 状态所有者与互斥

实际状态在 [0leiedr1esdbe.js](./source/0leiedr1esdbe.js) Canvas store，不在 `38o6e4qs2-rnf.js` 的 Mark临时 store。初始字段 @93064 为 `isCanvasCaptureMode:false`、`canvasCaptureCallback:null`；没有 `captureSourceNodeId`、capture target ID、pending rect、crop ratio、selected region、loading reader或capture model参数。

`setCanvasCaptureMode` @125791–126202：

- active 写布尔；callback 为 active时传入值/null，关闭时null。
- 开启时关闭 Mark并清markSource，关闭Focus并清focusSource/interacting，关闭reference并清target/pickable/connected集合，存在subtitleEraseRegionSession时清该session。
- 关闭只改capture自身，不重新打开其它模式。这里没有顺手清reference的blockReasons/limitCount等额外字段；不能猜所有setter清同一套字段。

同文件 `setMarkMode` @124831、`setFocusMode` @125203、`setReferencePickMode` @126202及 `startSubtitleEraseRegionSession` @127095都能关闭capture并清callback；各自其它清理范围不同。完整UI reset函数 `iA` @90174–90899明确关闭capture、清callback，`reset` @122249调用它，`setAssetBoardMode` @125733也调用。capture setter没有直接调用Mark临时store.clearAll；不把切布尔等同于全部外部store清理。`setProjectId` @123008本身只重置其列出的项目/字幕/锁等字段，**没有直接清capture**；完整document/mode epoch防迟到不是这个setter已有的保证。

[21_0xvlvkw1sz.js](./source/21_0xvlvkw1sz.js) @753478–753960内联hook：enter只 `setCanvasCaptureMode(true,callback)`，exit只 false。没有schema/model资格、markPoints、识别服务或DOM reader。全局发布保护effect @753980–754548依次关闭Mark/临时points、Focus、reference、capture、subtitle及其它编辑overlay；不能猜节点 `publishProtection` 字段就是这个全局状态。

[19-1v5dt472t4.js](./source/19-1v5dt472t4.js) module666823，@117100–117760：`exitCanvasOverlaysForScreenplayEditor` 在打开脚本编辑器时关闭capture及其它当前active overlays。它只是清理consumer，不是capture入口。

## 2. IMAGE renderer 与 URL选择

[3u6hjewm8qox_.js](./source/3u6hjewm8qox_.js) @855031–855493从Canvas store读active/callback/setter。前图实际renderer @910300–911820：每个visible image slot中 `i=(resultIndex===0)`；hidden slot不渲染。只有active capture且前图收到该outer container的click时消费：

```text
pickedUrl = node.data.originalUrl?.[0] ?? node.data.url?.[0]
if (pickedUrl && callback) invoke callback(pickedUrl) inside synchronous try/catch
setCanvasCaptureMode(false)
return
```

这是 @911667–911783 的完整行为，capture分支优先于Focus/Mark click。不是click坐标、不是正在显示的responsive img.src、不是所有结果index，更不是canvas截图。`originalUrl[0]` 是 nullish优先：空字符串也阻止url fallback；这时没有callback调用，但仍退出模式。没callback也退出。source没有await回调Promise；同步throw被吞后仍退出，异步receiver自己负责错误。

该click没有focus self排除、magic/focus schema、default generator资格、source readonly、storyboard child或blob/data URL筛选，也不查询img或等待load。不能复用focus/mark的surface资格而限制这个源码分支。实际event还受特殊IMAGE内部控件是否stopPropagation及外层渲染影响；本文不把一般outer handler推成所有全景/内部工具都可native点击选入。发布保护由上节全局effect退休模式。

Node kind限制来自真实IMAGE renderer和capture CSS。没有VIDEO/AUDIO帧读取或任意DOM capture renderer注册表；本次归档也没有名为 `captureRenderer` 的实现。内容层的前图是否visible是具体slot判断，不以“任意选中节点”代替。

## 3. pointer、画布 props、CSS 与 Escape

21_0x @753716–753828 的 mode ReactFlow props只明确覆盖三项：nodesDraggable=false、elementsSelectable=false、nodesConnectable=false，并加class `capture-mode`。最终props spread @964862放在常规Mark/Focus/reference等props之后。此处没有独立改pan/zoom、delete key或double-click行为，不能把预想的一切手势限制写成源码合同。

[0arvpunlk99j2.css](./source/0arvpunlk99j2.css) @173–1158：非IMAGE node shell/fallback外层黑30%遮罩、blur4、z50、radius12；非IMAGE及所有后代pointer-events:none。IMAGE node pointer-events:auto、pointer cursor；edges及其后代禁止命中。不是所有节点一个modal，也没有额外body锁。capture的CSS不含Mark的非IMAGE `.mark-mode-toggle`退出例外。

21_0x @714550：`canvas.exit-capture` 是隐藏的Esc shortcut，scope `canvas:capture`；@947356按active注册该scope，@948338处理器调用exit。这里没有Focus/Mark蓝色ModeBar、return target按钮、400ms移动或两级pending Escape。当前shared dialog/menu优先消费Escape、防旧pointer tail click、失焦/hidden/pagehide/卸载与document epoch的本机适配仍需独立controller，不能说原capture source已经具备。

## 4. 真实 receiver 与 dormant入口

[24mj3em3412ij.js](./source/24mj3em3412ij.js) default VIDEO generator @166872取得store setter。@203184–203455 `af` 构造callback：

1. 从第三方asset store取createAsset和refreshList。
2. `setCanvasCaptureMode(true, async pickedUrl => ...)`。
3. receiver创建 `createAsset(pickedUrl,'image')`；有truthy结果才await refreshList并通知“已添加到人像库”。异常通知“人像上传失败”。准确locale分别为 `2ijgtfwpg93os.js` @242866 /293054。

这不是往当前VIDEO prompt插图片引用，也不是新Canvas节点。createAsset失败可能由底层包装返回undefined；此时source receiver既不刷新也不成功通知，不能把这种失败解释成已经加入素材库。

@208313给角色库 `rr` 传 `onCanvasCapture:af`；`rr` @135744–138211在 seedance分支 @138061透传给 `t4`。公开库分支没有该prop。真实 `t4` @102216–120448虽然解构 `onCanvasCapture:s`，但该binding引用次数为0，所有其它叫s的局部量属于内部不同scope。静态使用本机 `@babel/parser` / `@babel/traverse`分析AST确认：t4参数s的 `referencePaths=[]`；rr参数l唯一引用就是给t4传prop。没有运行source逻辑。

t4实际新增菜单在 @119500附近只有localUpload和historyGallery；没有canvasCapture项。因此archive当前可达按钮不能据af存在推断。locale [2ijgtfwpg93os.js](./source/2ijgtfwpg93os.js) @247593的 `common.canvasCapture` 仅为“画布抓取”，也不能证明入口被渲染或回调被调用。

### 服务边界

[1k5w11_he1tz_.js](./source/1k5w11_he1tz_.js) module386598 /802182：createThirdAsset `f` @24799发送原站POST，body为 `{assetUrl,assetType,version:1}`；code10025 warning限制，普通失败包装可返回undefined。thirdAsset store `createAsset` @26905就是 `f({assetUrl:url,assetType:type})`；`refreshList` @26957重新list并启动pending asset审核轮询。这里是账号/合规素材写服务，不是read-only图片reader。

本机不得调用该API，不给当前本地actor造账号/资产认证。若后续需要演示完整receiver，必须由明确可注入的运营/本地asset adapter实现create+refresh，说明错误/限额/审核边界；默认未接不能fake成功。现阶段没有任何裁剪PNG、FileReader、CORS canvas或pre-sign截图上传的capture协议证据；其它上传菜单不应混入该URL pick链。

## 5. 模型字段、history、copy/export与恢复

capture自身只改短暂mode/callback，receiver只写第三方素材库；没有 `captureRegion`、捕获图片自然尺寸、scene、originImage、model/mode/count/settings修改。没有新Canvas node/edge或Canvas图history action，不应为一次pick虚造一个图history。图片 `originalUrl/url` 是原有媒体字段，被读而不被改。

0leied store的sync getter @91194明确只向队列提供nodes/edges；capture setter没有图提交。图更新位置对nodes/edges/viewport调用 `ie`，但本次归档的 `ie` @81070是空函数，本文不据它推断实际source history机制；capture receiver自身确实没有调用图修改。不能因此说所有source导出都只带图：`getState` @121660是 `t2(currentStore)`，低层 `export` @122954直接返回它。`t2` @78755通常JSON-clone整个store，所以active布尔等可JSON字段可能被带出，callback函数通常被JSON省略。正常callback可序列化恢复没有来源证据，也不应该为本机创造。

但 `setState` @121681只接nodes、edges、viewport，`import` @122980走它，忽略mode/callback；新store默认false/null，完整reset同样退休capture。向一个仍active的既有store直接import，不会凭该setState主动退休mode；本机需另外在document边界取消。本批没有实际source GUI copy/export浏览器验收；只证明这些准确底层路径。当前本机snapshot API已有独立document字段，不应添加live callback/receiver/session到文档；copy/export/restore按原有图与媒体恢复，mode需重新进入。源低层export可带布尔不等同于mode可恢复。

## 6. 建议接口与实施先后

仅为后续接口建议，本批未新增生产模块或测试。source可实现的底层范围是可靠的图片URL pick、互斥/取消和receiver协调；不存在“capture裁剪模型”可照搬。

- 小纯入口 `resolveCanvasCaptureImage({node,imageIndex:0})`：actual IMAGE前图，返回准确 `originalUrl[0]??url[0]` 与node ID描述。空original string不能自动改用url；后图不eligible。可在本机明确拒损坏数组/非string数据，但不把额外blob/self/storyboard/schema过滤冒充源规则。
- `describeCanvasCaptureInteraction(active)`：只描述已证实的三项Canvas flags、image-only CSS状态；mode-specific keyboard/tail click由controller持有。
- opaque session `{documentOwner,modeOwner,receiver}`：callback只消费URL，且一次消费后退休。此session为明确本机生命周期适配，不是原store已有target field。源收到合法前图click后即使无URL/callback也退出；不能把纯URL返回null误实现成继续选。
- 若运营adapter以后提供 `createImageAsset(url,{signal})/refreshImageAssets({signal})`，由独立source接口协调，默认明确unavailable。实际原站create body的assetType固定image/version1是receiver契约，read-only `resolveUrl`与这个writer分开；不应新建截图File或Canvas图计划。

必须先解决可见consumer/入口的真实证据，再授权具体纯模块、controller与实际UI。独立的图片Crop工具、全景当前视角/四视角/十二视角抓帧和Canvas viewport导出是其它工作流，本文没有把它们视作这个全局capture模式完成。源码范围清楚不等于整个功能/原生/运营写服务已验收；完整目标继续未完成，本批未部署。
