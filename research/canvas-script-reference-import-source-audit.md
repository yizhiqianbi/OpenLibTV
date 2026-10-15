# ScriptV2 参考图导入：源码与纯计划审计

本批只静态读取归档脚本；未执行原 bundle、登录、请求私人资产详情、上传文件或提交任务。字符位置为解码后的 JavaScript 字符串零基准 offset。纯计划只接收已读取的本地图片或已解析的资产详情，由画布 owner 负责读取、取消、原子提交、历史及保存。

## 1. 实际入口与生命周期

`research/source/1sutpu54cdy46.js` module327466：上游图片添加包装 `N` @456；资产序列 `w` @760；资产 modal `S` @1542；参考图菜单/本地上传 `M` @3539。

`N(targetId,url,name)` 调 `createUpstreamImageNode`，成功后检查目标的 edges：没有同 source/target 且非 `portraitVirtual`、非 `assetVirtual` 的 edge 才 `addEdge({source,sourceHandle:'source',target,targetHandle:'target'})`。本次资源总是新建，不按 URL 复用已有节点；store 为 edge 补 ID。导入不设置选择、fit 或 script prompt，不提交生成。

本地 `M` 每批捕获 `captureUploadCanvasOwner()` 和 `captureUploadNodeContinuationGuard(targetId,owner)`；处理每项前检查 continuation。`file.size > 0x1e00000` @3964 才跳过，恰好 30MiB 可进。原 handler 没有 MIME 校验、20 项上限或模型容量过滤；input @4958 的 `accept` 是 `image/png,image/jpeg,image/webp,image/gif`，且 `multiple:true`。

源顺序是 `URL.createObjectURL(file)` → `N` 创建 blob 图片/edge → `startCanvasNodeMediaUploadJob` @4079。job 传 `newNodeId,file,blobUrl,nodeType:IMAGE,initialMeta:null,markUploaded:true,expectedCanvasOwner,isCallerContinuationCurrent`，不 await，因此图创建顺序是 files 原顺序，真实上传可并行完成。N 失败会 revoke 本次 blob 并继续；input onChange 随后清空 input.value。源明确具有真实 upload job，不能把本地 data URL 读完称为原站上传完成。

资产 `w` 同样先捕获 owner/continuation；依选择 Map 插入顺序逐项 await `getMediaAssetDetail({assetUuid})`，await 后和 mutation 前再次检查 owner。UUID 缺失、API 不成功、缺 `mediaAssetMeta`、无有效 IMAGE 或添加失败计 failed；异常也计 failed；失 owner 中断，不导入后续项。失败通知原文为“导入资产失败，请重试”。没有本批配额/批次数上限，真实私人详情服务未接入。

modal 的 selectedMap keyed UUID；取消再选会移到队尾。confirm 在空选择/busy 时 disabled，非空执行 w；added>0 提示“添加成功”，之后清选择并关闭，即使全部/部分失败也关闭。本机保留失败队列、Quota 只重试已接受图的保存是明确适配，不能写成原站也保留失败队列。

## 2. 新资源的准确字段和位置

`research/source/2mce1ay9u3g9g.js` module304380（起点 @12753），`createUpstreamImageNode` export @21427：取当前 target 的 **raw position**，新 root `x=target.position.x-350-80`、`y=target.position.y`；并调用 store.addNode：

```js
{
  id,
  type: 'image',
  data: {
    type: 'image', name, url: url ? [url] : [], alt: name,
    action: 'image_resource', showGenerator: true
  },
  position
}
```

没有 node 的 sourcePosition/targetPosition、width/height/measured、params/model、portrait proof、timestamp、selection 或 script patch。target 在父组里时仍使用 raw parent-relative position，新增图片仍为 root；不擅自 world 转换。相比空态 preset 的 x−450，此入口是 x−430。

store 依赖 `research/source/0leiedr1esdbe.js`：t4 @79043 规范 name/label；i_ @89212 仅缺 truthy name 时用 typeLabel+(已有同 data.type 数量+1)，IMAGE 中文为“图片”。非空同名/空白 name 不加 suffix；默认名不覆盖 alt。addNode @95779 的 root `unshift`，addEdge @114445 `push`。每项单独 addNode，因此多个成功项的最终 nodes 前置顺序为 **成功项逆序**，edges 仍是成功项处理顺序。这与 preset 的一次 `addNodes(...roots)` 保持角色 1→2 不同。

默认避碰 store e0–e5 @59015–59464：350×350 新资源、50px margin，所有 raw 节点盒子都是障碍（含 hidden/temporary/child），已有尺寸 measured→stored→350 nullish 优先，0 尺寸保留。strict overlap 时仅向下移动，取当前重叠所需最大 shift，最多 30 轮。每个成功的新节点立即成为后续项的障碍。纯计划复用已经确证的 preset 私有 place，通过本批 Root 授权的唯一小型 export `resolveScriptV2ResourcePlacement({position,nodes})`，原 preset caller 不变。

## 3. 资产数据解析边界

`research/source/0utjet5hna_yu.js` module55061：JSON parser @215，`extractFirstImageAssetItem` export @781。`JSON.parse(data).items??[]`，没有版本号检查；扫描 **全部 items** 找第一条 `item.data.type==='image'` 且有可用 URL 的数据。

URL 可以是 string 或 array；array 取第一条 trim 后非空 string，返回原 string，不 trim 存储值。优先 data.url，后备 data.originalUrl。name 是 trim 后非空的 data.name string 原值，否则 mediaAssetMeta.name。无图时 null。不是“v2 第一项”，也不把 coverUrl、VIDEO 或 AUDIO 当图片。extractor 返回原 data，但 N 只消费 url/name，丢弃原 params、尺寸、proof 等；复制整份资产 data 不是源协议。

纯 decoder 输入仍为 serialized JSON string（有/无 version2 均可）；支持 `{items:[...]}` wrapper，不接裸 in-memory object/array。坏 JSON、非数组 items、坏 item 返回 invalid，避免源 malformed 数据抛异常。picker 可用本地 canonical asset 的 mediaType/url 适配成此小型 JSON，由 controller 明确持有，不在纯模型读取资产库。

## 4. 纯 API 与提交合同

新增 `src/features/canvas/storyboard/script-reference-import-model.js`：

```text
SCRIPT_V2_REFERENCE_IMAGE_ACCEPT
SCRIPT_V2_REFERENCE_FILE_MAX_BYTES
validateScriptV2ReferenceFile(file)
  → {valid,reason,skipped}
resolveScriptV2ImageAsset({data,name})
  → {valid,reason,image:null|{url,name}}
planScriptV2ReferenceImport({nodes,edges,targetId,items,makeId})
  → {valid,reason,addedNodes,addedEdges,nodeIds,results,
     added,failed,skipped,submitted:false,uploaded:false}
scriptV2ReferenceImportReasonLabel(reason)
```

items 是 `{kind:'local',file:{name,type,size},url}` 或 `{kind:'asset',data:serializedJSON,name}`。本地 files 由 caller 读完后注入 URL，不在 pure 里创建 blob/FileReader 或 upload job。每条 result 为 `{index,status:'added'|'failed'|'skipped',reason,nodeId?,edgeId?}`，index 对应输入 items。成功项依次调用 makeId('image')/makeId('edge')；addedNodes 已是最终 prepend 顺序，nodeIds/addedEdges 为输入处理顺序。caller 合并：

```text
next.nodes = [...plan.addedNodes,...current.nodes]
next.edges = [...current.edges,...plan.addedEdges]
```

Root 在同一次 CAS 中重新投影 script incoming 参数；显式 localMediaReady/resourceMeta 只用于本地成功项，不叫服务器上传完成。文档/ready/readonly/target incarnation 属于 controller continuation owner；模型单凭 ID 不保证跨文档或同 ID 重建隔离。原图无 mutation，纯计划无 React/I/O、保存、历史、随机数或任务服务。

非法基础图/geometry/target/factory 是整批 invalid，零 ID；单条读/解析/类型失败不丢其他合法项。ID 无效/碰撞只使该项 failed，不产生孤儿 node/edge，后续项继续。边界守卫为本机适配：有限非负尺寸、唯一有效 IDs，MIME 白名单（源仅 input accept）、已读取 URL 非空及坏资产结构。超过 30MiB 返回 skipped；没有假费用/配额/权益，也没有任意 20 张上限。对应用户中文 reason 中只有“导入资产失败，请重试”为本处源失败文案，其他是本机明确错误提示。

## 5. 实际校验与未验范围

官方 bundled **Node24.19.0**，2026-10-12 **06:39:05 /647ms**：本批新 model **55 项**加原 preset **52 项**，两文件 **107/107 全部通过**。日志 `artifacts/canvas-script-reference-import-model-tests.log`；定向 ESLint exit0。测试覆盖 30MiB 精确边界、输入 MIME/坏元数据、全 items 扫描、原 URL/名字、没有字段虚构、raw grouped target、50px/0/measured-first/hidden child 避碰、21 项无假批次上限、逆前置/顺边顺序、部分失败/ID 原子性、旧图冻结/不调用 toJSON、导入后专用 generator incoming/source_images。

随后新增独立 `useScriptV2ReferenceImport.test.jsx`，Root 持有并修改生产 hook。本机 controller 专项 **27/27 通过**，06:43:37开始、471ms；日志 `artifacts/canvas-script-reference-import-controller-tests.log`，定向 ESLint/Prettier exit0。覆盖读取期间新鲜图/剧情编辑保留、draft 投影加 raw CAS、部分读取失败只重试失败文件、Quota 已接受图不重复、同目标并入在途队列、失 ready/readonly/删除/任务/type 取消、删除 commit 后同 ID 重建、A→B→A、dismiss/unmount/迟到 callback、当前 inline 目标改变不重定向既有 reader、无 auth 依赖、资产 local adapter/全 items 扫描/partial importedIDs 过滤、成功回调微任务在新文档不回旧 opener。超限文件本地 hook 保留为可见失败项而非源静默 skip，这属于本机错误反馈适配。

源 UUID 不复用。对一次原子 update 中“同 ID 重建”与普通 immutable params 更新，没有可靠 incarnation 协议可区分；controller 不以 object identity 误取消用户编辑。上述删除→提交→重建的已证生命周期测试，不代表无此事件的任意同 ID 替换已能识别。

实际 App/native 上传、资产 modal 焦点、实际撤销/刷新恢复或全工程检查由 Root 另验；不能用这些 pure/hook 测试写成浏览器通过。没有原站私人资产服务、真实上传、认证、任务、费用或账号验收。
