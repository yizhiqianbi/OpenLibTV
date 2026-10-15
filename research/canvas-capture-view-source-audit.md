# Canvas capture：整图抓取协议与当前入口可达性

2026-10-12，只读静态调研。字符偏移按归档文件 UTF-8 解码后的 JavaScript 字符串计算，采用0基准，不是字节或行号。未运行原站脚本、未调用上传 / 创建 / 审核服务、未登录；未操作用户当前3D页面。只新增本审计，没有生产改动。

## 1. 核心结论与范围修正

此处 `isCanvasCaptureMode / canvasCaptureCallback` 是**点击图片结果，把整张图的 URL 交给回调**的短暂模式。已核 renderer 没有区域框选、图像裁剪、截图 canvas、确认条或保存 region 参数。原 locale 名称“画布抓取”和快捷键“退出截图模式”不能证明存在任意区域截图。

当前公开归档包含模式状态、CSS、首图点击分支和一个 VIDEO生成器的第三方素材回调，但该回调传到素材库后**未被实际 UI 消费**。不能为复刻补造可见 Capture 按钮、ModeBar、区域几何、确认 / 删除附件，或把这个死参数分支说成已验收的功能。

下面区分确定 source 合同、静态不可达证据以及服务边界；是否以后启用接口或取得新增源码证据，由 Root 另行决定。

## 2. 状态、互斥、ReactFlow 与退出

[store](./source/0leiedr1esdbe.js) **125791–126201** 的 setter 为 `setCanvasCaptureMode(active, callback)`：开启时写 active / callback，缺 callback 则null；关闭时 callback清null。开启会关闭mark / focus / reference，并清其owner、focusInteracting和reference候选 / 已连接集合、字幕擦除session。这个分支未同时清 reference blockReasons / limitCount，不能把所有setter都描述为完全相同reset。

同文件 **124831–125530 /126202–126610 /127300–127730**：mark、focus、reference和字幕区域session开启时关闭capture并清 callback。项目reset **90614–90899** 同样清capture状态。callback 是进程内函数，不是持久化节点字段、图片URL或用户权限；模式关闭不删除已成功创建的服务资产。

[Canvas页面](./source/21_0xvlvkw1sz.js) **753458–753952** 读取active、构造enter / exit，开启时仅覆盖 `nodesDraggable=false / elementsSelectable=false / nodesConnectable=false`，并给根ReactFlow追加 `capture-mode`。实际 props覆盖在 **964862**，一般可写props之后，不应反向恢复普通节点拖动。

该文件 **714550–714687** 注册 `canvas.exit-capture`，combo为esc，scope为 `canvas:capture`，visible=false；**947394** 仅在active时激活此scope，**948378** 调exit。locale-zh对应“退出截图模式”。没有已核“返回节点”或关闭按钮，exit不定位某个生成器owner。

publishProtection开启 **754000–754430** 显式关闭capture及其它编辑模式。[screenplay overlay cleanup](./source/19-1v5dt472t4.js) **117143–117781** 的 `exitCanvasOverlaysForScreenplayEditor` 也关闭当前capture；它是退出/接管调用，不是可见入口。

## 3. IMAGE renderer 与准确回调合同

[图片renderer](./source/3u6hjewm8qox_.js) **855029–855518** 读active / callback / setter。结果遍历在 **910338** 明确 `i = (resultIndex === 0)`，只有首图参与capture。

首图外层 style **911214** 在capture时用pointer cursor；正常mark / focus是crosshair。点击分支 **911667–911780**：

1. capture active且为index0时停止冒泡。
2. 从最新render的node data读取 `originalUrl?.[0] ?? url?.[0]`。
3. 只有URL和callback均truthy时调用callback(url)，同步throw被catch吞掉。
4. 随后无条件 `setCanvasCaptureMode(false)`，本次capture结束。

这是原图 URL 的 nullish 优先级：originalUrl[0]是空字符串时**不会**回退url[0]，callback也不会被调用；缺URL / callback仍关闭模式。使用的不是当前DOM img.src、responsive thumbnail、getFasterImage结果，也不是点位置、选区或base64。click不传nodeId、坐标、尺寸、zoom或region。

分支优先于focus / mark click；它不新建边、图片节点、generator params或附件，也没有source==owner拒绝。index>0不会进入capture回调，即使展开后仍显示图片结果。source没有另加capture专用publishProtection局部条件；全局保护接管由上节Canvas状态负责，不能据此推导登录 / readonly授权。

callback可能返回Promise；图片分支**没有await**，关闭mode发生在服务完成之前。同步catch不能捕获异步rejection，当前VIDEO callback自己有try/catch。未来本机adapter需按文档 / caller所有权隔离迟到服务结果，但不能宣称原分支已经拥有完整epoch / abort协议。

## 4. CSS、ModeBar与区域UI的证据

[capture CSS](./source/0arvpunlk99j2.css) **173–1158**：

- 非IMAGE的node-shell伪层与没有shell的节点fallback：absolute inset0、z50、radius.75rem、黑30%、backdrop blur4、pointer-events:none。
- 非IMAGE节点及所有后代：pointer-events:none!important；此分支没有Mark模式的 `.mark-mode-toggle` 例外。
- IMAGE：pointer-events:auto!important、cursor:pointer!important。
- edges / edge及其后代禁命中。此段没有独立capture handle选择器；nodesConnectable由ReactFlow props禁用。

已用本机 `@babel/parser / @babel/traverse` **只解析归档字符串**，核对Canvas函数的词法binding，而非按短变量名跨作用域猜测：

| binding | 声明字符偏移 | 实际reference | 结论 |
| --- | ---: | --- | --- |
| `ow` active | 753478 | 947394 | 只激活capture shortcut scope，无JSX ModeBar |
| `oS` exit | 753497 | 948378 | 仅Escape callback |
| `oC` props | 753526 | 964862 | 禁普通drag/select/connect |
| `oI` class | 753550 | 962029、962286 | 根class与useMemo依赖 |

因此，本批没有capture模式标题 / 副标题 / Return / X样式、区域矩形几何、确认按钮、区域删除卡片、generator附件或屏幕截图调用的已核实现。不能借已完成Focus / Mark视图充当source capture视图。

## 5. 唯一已找到的回调来源与不可达入口链

[VIDEO生成器](./source/24mj3em3412ij.js) **166901** 读取setter，**203184–203445** 的af回调开启模式，调用 `useThirdAssetStore.getState().createAsset(url,'image')`，truthy成功时refreshList，再显示“已添加到人像库”；throw时显示“人像上传失败”。falsy返回本段没有额外成功或通用失败toast。

**208297–208469** 将af作为RoleLibrary的onCanvasCapture prop；该角色库rr函数 **135744–138211** 在Seedance tab向t4透传。rr为body portal的素材库弹窗，宽 `min(92vw,1280px)`、高 `min(86vh,720px)`、header48，公共角色库 / Seedance合规素材库两tab。该弹窗的选择确认、上传与删除不是capture确认 / 删除。

静态绑定核验结果：

| 函数 | 范围 | capture参数 | referencePaths |
| --- | --- | --- | --- |
| rr RoleLibrary | 135744–138211 | `onCanvasCapture:l` | 仅138061，传给t4 |
| t4 Seedance素材库 | 102216–120448 | `onCanvasCapture:s` | **空数组，没有任何消费** |

t4实际card调用约 **115600–119600** 只传本地上传 / 历史作品选取等动作。源“画布抓取”locale common.canvasCapture存在，但没有找到其行为JS的文案消费。不能把prop存在等同于用户能够进入模式；当前archive的入口链止于unused参数。

指定 [38o6e4qs2-rnf.js](./source/38o6e4qs2-rnf.js) 中已核module747569 **40413–41730** 是Mark point临时store，不是capture region store；该归档未含canvasCapture / setCanvasCaptureMode控制器。未取得其他私有或不同版本入口证据时，不继续凭空扩展。

## 6. 服务与本地边界

[third-asset store / repository](./source/1b45xbeaszjvg.js) module386598：**12743** createAsset转调用createThirdAsset；**10637–10850** 对真实API POST `{assetUrl,assetType,version:1}`，不是本地存储或crop。code10025会warn资产保存上限；返回服务data或undefined。refreshList **12527–12735** 重新查询并启动pending审核轮询。相同定义也存在 [1k5w11_he1tz_.js](./source/1k5w11_he1tz_.js) **24799–25011** createThirdAsset、**26905** createAsset、**26957** refreshList。

[endpoint目录](./source/170exq-5f14zz.js) **26125 /26168 /26209** 分别为 `/api/third_asset/create`、`/api/third_asset/check`、`/api/third_asset/list`。这是账号资产 / 合规服务写与读取，不能用local workspace actor冒充认证或本地创建完成。当前用户无需登录、不得使用账号资源，因此不调用原站链。

素材库本身有agreement / upload auth / 审核状态；capture af没有另行把URL转File或pre-sign上传。其状态成功与否取决于真实createAsset，不得仅点击首图就显示“已添加到人像库”。本机未来source若不可用，必须保明确服务边界；本批又未确认可见入口，故不接入或生成假前端能力。

## 7. 与其它“截图 / 框选”的区别及本批决策

Focus是图片内容框归一region / camera_focus合同，见 [focus与mark审计](./canvas-media-focus-mark-source-audit.md)。PictureEdit裁剪与layer selections有独立renderer / helper，不能据 `createDefaultCropRect` 名称接到capture callback。视频current / first / last frame截取是另外的toolbar feature IDs（如 [1bzx2qa4_zu4z.js](./source/1bzx2qa4_zu4z.js) **52123起**、[1xbjskw4nhzem.js](./source/1xbjskw4nhzem.js) **48523起**），这些“canvas:captureCurrentFrameLabel”字符串不是 `canvas:capture` shortcut scope。

本批只读调查完成，没有编写生产视图、没有重新采集内容、没有打开或修改用户浏览器tab。保留此整图callback的source证据与死入口范围；不将其算作已实现的任意区域截图，也不将未发现入口的private能力推测为完整。整个原站复刻目标仍未完成。
