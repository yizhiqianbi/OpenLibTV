# Generator 全画布 @ 候选模块

当前 InlineGenerator 已启用 `canvasMentions`。纯候选、连接输入 / 校验、graph transaction、异步 source / controller 与 view 独立维护；Root 的 useCanvasGraphActions 提供同步连接与最新 token。仅读取归档公开脚本，没有账号、原站写接口或执行原 bundle；浏览器与本地适配边界见文末。

## 原源码证据

偏移为归档文件零基准 UTF-8 byte，便于复查；本地没有修改归档原脚本。

| 文件                               | 模块 / 位置                                                               | 证据                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `research/source/38o6e4qs2-rnf.js` | 163688，byte 43413 起；collector 导出名 byte 45477                        | `collectCanvasReferenceCandidates`、`evaluateReferenceCandidate`、`getReferenceNodeKind`                                  |
| `research/source/1nd0f9k3q9sol.js` | 112007，collector 调用 byte 15167                                         | `nW` 仅刷新一次 source 快照；`nG` 展示转换与排序；`rh/rv` 打开时刷新                                                      |
| `research/source/38o6e4qs2-rnf.js` | 127428，`function E` byte 25204；搜索函数 byte 19236；种类序列 byte 21593 | 全画布 @ 菜单，与基础 `function R` 独立                                                                                   |
| `research/source/1nd0f9k3q9sol.js` | 196260 的实现与 112007 调用 `rE`，调用 byte 34353                         | `commitCanvasMentionSelection`：先 connect，再解析 token；文本只连线/消费 @                                               |
| `research/source/1nd0f9k3q9sol.js` | 112007 `rC`                                                               | 新边成功后从最新 store 收集 incoming，再按 `imageListOrder/videoListOrder/audioListOrder/mixedListOrder` 得到真实 mention |
| `research/source/170exq-5f14zz.js` | NodeType enum                                                             | `SCRIPT_V2="script-v2"`，不得以 `scriptV2` 猜值                                                                           |
| `research/source/2ijgtfwpg93os.js` | 中文 locale                                                               | 已引用、素材引用、资产、暂无可引用资产，请连入后操作；limit/modelUnsupported/refDropInvalid 文案                          |

## 两条不同能力

112007 的 `tA` 是自动名称/序号 ghost 提示：`isPromptMentionSupported(...) && isPromptMentionSuggestAvailable(generatorType) && userPreference.enabled && !readonly`。665209 的 available 仅 image/video；974903 用户偏好默认 true、原 key 为 `libtv:promptMentionEnabled`、原值是 `1/0`，并不是已发现的账号权益开关。

**全画布 @ 菜单并非 tA 的别名。** 原输入按 nodeId 调用 collector，把 `canvasReferences` 交给127428；该字段存在时用 E 全画布视图，否则用 R 当前参考视图。基础 R 有1–9快捷选择，E 没有；E 按箭头/Enter与搜索框交互。因此本批没有把基础菜单或新全画布菜单宣称为 automatic ghost。

本历史结构批次没有实现 tA ghost/Tab、Shift-Tab批量接受、名称变体/序号匹配、Escape词拒绝缓存、悬浮 ghost tooltip 或 AutoLink 用户偏好控件。原884894、768023、773557的实现已在归档112007依赖段，清楚可查；后续要独立实施，而不是在结构批次里扩展输入语义。Seedance2.5原989029的资产标签来自 contentUnderstandTags 与缓存；没有调用该服务、补造标签或默认启用未知权限。

## Collector 与排序

- 类型取 `data.type ?? node.type`。只收 image/video/audio/text，自身跳过。未知类型不猜映射。
- 仅带 `portraitVirtual/assetVirtual` 来源边、没有普通真实边的节点不进 raw candidates。所有有效来源仍进入 `connectedNodeIds`；已有 token options 可在展示层追加，保持原 virtual-reference 分支。
- 已真实连接节点直接保留，不再按当前上限校验。未连接媒体先 canAcceptMore，text 不检查媒体配额，再 validate。必须 `allowed && !switchToModel`；菜单不能偷偷换模型以允许连接。
- 同一媒体 kind 的 canAcceptMore 只算一次。存在 limit 时，limitCount 是已连接非text候选数加目标 `data.refImages.length`。
- 原 collector 没有独立 URL/data/blob 检查、URL去重或viewport排序。资格交给516779的 connection validator；本批不把 Agent 菜单的 URL 规则搬到这里。不同节点使用同一 URL 仍是不同候选。
- 每32条边/节点让出一次执行，检查过期。新实现额外支持 AbortSignal，卸载/文档变化取消；过期结果返回null，不变成空列表成功。
- 展示层标签按 name/title/label、非空string trim，否则类型标题。connected 按当前真实 token options 顺序，然后目标incoming边顺序；未连接保持nodes原顺序。
- 已连接媒体缺少 mentionOption、ignoredKinds、validator失败分别禁用；不创建占位 token。collector 缺失但已有的 options 按原追加为connected。
- 搜索只对 label `trim().toLocaleLowerCase()/includes`；不搜索URL、不猜tags。结果先已引用，后image/video/audio/text。显示保留原记录；键盘列表才按nodeId去重并剔除disabled。

## 连接与 token 契约

196260返回 `disabled/connectFailed/textConnected/mentionInserted/connectedWithoutMention`。未连接节点先调用connect；caller应先检查相同方向已有边，再调用自己的经过验证的programmatic连接。**新模块不创建 edge ID、handles、模型fallback或协作权限。**

text成功只消费触发@/＠，不插入媒体token、不注入source.text。新媒体边成功后，caller必须同步以最新nodes/edges和列表order生成 `getLatestReference(nodeId)`，只有真正可解析的 `{{Image N}}/{{Video N}}/{{Audio N}}/{{Mixed N}}/{{Element N}}` option才能插入。source普通插入在前方不是空格时加前空格，并保证尾空格；原已有内容与未知special tokens保留。失败保留@和菜单，由caller反馈“无法添加为参考”；连上但解析不到mention仅关闭菜单，不伪造编号。原服务生成、媒体理解、feedback或session接口没有参与。

## 可复用接口与依赖方向

```jsx
<NodeGeneratorPrompt
  value={value}
  onChange={onChange}
  references={currentOrderedReferences}
  sessionKey={`${documentKey}:${nodeId}`}
  canvasMentions={{
    targetNodeId: nodeId,
    source: {
      // 已经完成 presentation 的数组；不是 raw collector result。
      load: async ({ signal }) => presentedCandidates,
    },
    refreshKey, // 可选；source快照变化的显式刷新标记
    connect: (sourceId, targetId) => verifiedConnectionSucceeded,
    getLatestReference: (sourceId) => currentCodecOptionOrNull,
    onConnectFailed: (error) => notifyReferenceFailure(error),
    hiddenKinds: [], // 可选；swap 已接线并隐藏 text
    onOpenAssetPicker, // 可选动作槽；caller负责完整picker/trigger生命周期
  }}
/>
```

`canvasMentions` 不传时，基础菜单的原token/150ms草稿/IME/Enter/历史行为不变。readonly/disabled不加载候选、不建边、不插入。外部值、sessionKey变化仍由既有prompt controller管理；新view不触碰持久化或autosave registry。

`candidate-model.js` 导出：

```js
collectCanvasReferenceCandidates({
  nodes,
  edges,
  targetNodeId,
  dependencies: {
    canAcceptMore: (targetNode, mediaKind) => boolean,
    validate: (sourceNode, targetNode) => ({ allowed, switchToModel }),
  },
  signal,
  isStale,
  scriptV2ImageOnly,
});
presentCanvasReferenceCandidates({
  collected,
  options,
  edges,
  targetNodeId,
  ignoredKinds,
  preview: (node) => ({ previewUrl, previewMedia, width, height }),
});
canvasReferenceMenuModel(candidates, { search, kind, connectedLimit, hiddenKinds });
commitCanvasMentionSelection({
  reference,
  targetNodeId,
  connect,
  getLatestReference,
  insertMention,
  consumeTextTrigger,
  onConnectFailed,
  onConnectedWithoutMention,
});
```

无依赖校验器时不默认放行。不以源API字段猜支持模型、配额或服务器权限。`connect/getLatestReference`是同步契约，避免token列表尚未提交就继续插入旧序号。

依赖方向：`NodeGeneratorPrompt` → `useNodePromptMentions` / `CanvasReferenceMenu` → `useCanvasReferenceSource` / `useCanvasReferenceMenu` / `candidate-model`；view仅引用共享Icon与本目录。纯model不依赖React、DOM、CanvasStore、NodeCanvas或services。controller不读全局graph/store，不调用网络或存储；caller提供read-only source。没有扩大architecture白名单。

## View 与生命周期

原127428 E主/子面板各200px，间距4、圆角16、p6、搜索h32/p8，选项h36/r10/p8/gap8，缩略20px，类型图标20px/row图标12px，heading30px/font12；列表按viewport可用区域最多400px，连接初显12，“更多”展开全部。submenu hover移开180ms后关闭；原箭头初始-1，disabled不进keyboard序列，数字按键保持搜索输入，不沿用基础R数字捷径。

资源悬浮200ms、最大160px、offset约8；video只在preview打开时play，关闭/卸载pause、移除src、load释放。缩略失败退回原图标。原图标均使用既有 `/assets/icons/{mention-reference-*,image-s,video-add-s,audio-lines,text-ref}.svg`，没有另造图标素材。

entries超过50使用固定30/36/64px虚拟行，overscan8；active项滚入视口。组件没有为结构优化安装额外虚拟列表依赖；原站使用TanStack，当前用本域纯布局等效实现。宽屏按源码主/子双面板与左右翻转。窄屏双面板缩小使常见320/390px视口可放下，是本地适配，不声称原站手机该分支像素已验证。原图像preview加载pulse/crossfade及CDN160/120/40px变换未完整照搬；本地素材映射不造远端video thumbnail，poster未知时用原视频图标。

source请求失败保留明确error/重试是本地适配；原collector主要用过期null。取消在卸载/sessionKey/refreshKey变动时发生，迟到promise不更新状态。Escape返回提示词原caret，outside mousedown不抢新焦点。pointer/wheel事件止于menu，保留自身列表滚动。没有独立scroll-lock/inert/modal栈。reduced-motion关闭选项transition。

## 历史结构批次的定向验证与剩余范围

本批定向测试覆盖真实NodeGeneratorPrompt接线、collector虚拟/真实边、配额缓存、model-switch拒绝、相同URL不同节点、取消、ordered presentation、搜索/disabled/重复keyboard、connect后新token、text消费@、失败不丢内容、source失败重试/跨文档迟到结果、readonly、12/More、50+虚拟列表远端键盘项和video preview释放。另回归现有prompt/inline/persistence/snapshot用例。最终测试数与format/lint结果在冻结回报中给出，不运行全站check。

该历史结构批次的 caller 尚未启用，因此当时仅证明独立模块；随后实际接线以下文为准。待核实validator/root接线、原站登录态可编辑截图、原menu移动像素、自动ghost、swap/assetpicker完整trigger整合、light主题portal变量/图标颜色、原CDNpreview过渡与实际浏览器悬浮释放仍是后续边界；真实账号、连线服务/协作写入和生成服务继续延期。

冻结定向结果：7个测试文件、37项测试通过；新目录和两个小型接线文件 ESLint `--max-warnings 0`、Prettier检查通过。没有运行全站check或浏览器，本次数字不得替代根代理最终验收。

## 当前实际接线（2026-10-11）

InlineGenerator 已注入真实 source / guarded connection / latest-token。connection-inputs、connection-validator、graph-transaction、canvas-reference-source 保持纯图规则、可取消读取与实际提交分离；未知 validator / generator / policy 阻断，Root 门控 ready / readonly / 文档身份并同步发布新图。允许 data URL 仅是明确 localMediaReady adapter，不代表上传或服务器权限。

实际桌面搜索未连接“参考图2”，创建本地边并插入新 Mixed 2；展开参数子菜单先 Escape、再关闭父层通过。浏览器、事务历史和剩余 ghost / swap / picker / preview 范围见 [Root 功能审计](../../../../../research/generator-script-monitor-functional-audit.md)。前述7文件37测试仅为历史模块冻结数字，当前统一结果见根验证历史。

## 自动补全后续接入（2026-10-11）

image / video 的 ghost / Tab、Shift-Tab、名称变体与序号、Escape词拒绝缓存、悬浮 / 首次 tooltip 和 AutoLink 偏好已由独立模块接实际 InlineGenerator；与本目录全画布@菜单保持独立。只使用当前参考，不自动连线；标签服务没有伪造。当前验证与剩余特殊token / swap / picker范围见 [AutoLink审计](../../../../../research/prompt-autolink-functional-audit.md)。前文未实现描述仅保留历史证据。

## 节点引用动作后续接入（2026-10-11）

node picker 的资格 / 容量 / URL复用与批次计划在 asset-reference-model.js；request hook 管理实际 @ 身份和取消，shared picker 管理分页 / 选择 / 预览。swap 候选隐藏 text 和 asset，当前 badge replaceWith，不移除旧连线。前述 swap / picker 未接线仅为历史范围；当前证据见 [引用动作审计](../../../../../research/prompt-reference-actions-functional-audit.md)。
