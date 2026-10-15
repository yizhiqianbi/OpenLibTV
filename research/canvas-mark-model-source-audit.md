# 元素标记：纯模型与识别 source 合同

2026-10-12。本批先读取归档公开客户端，再新增纯规则和可注入只读识别接口。没有执行原站 bundle、登录、小号、cookie/token、原站请求、生成或部署。成功响应全部来自明确测试 adapter，不是默认运行数据；完整 Mark UI/controller/native 接线由 Root 另行验收。

## 原始证据

偏移为 UTF-8 解码字符串的 0-based 字符，沿用 [完整媒体模式审计](./canvas-media-focus-mark-source-audit.md) 第6–7节。再次独立读取实际文件，没有只根据历史文字推断。

- `source/3u6hjewm8qox_.js` @885600–886250：删除临时 API ID，读取最新 owner params；查 `{{magic:${id}:` 的首次位置，再查首次 `}}`。向两侧只吞 ASCII 空格，拼一个空格，最后 `.trim()`；因此内部换行/tab 不吞，但首尾换行/tab 会被最终 trim。只删除首次 token，删除对应 magicList entry，空表设 undefined，不删除图片或任何边。
- 同文件 @886000–886500：surface suggestion 选择只替换首次同 ID prefix→`}}` 为新 index，保其他 prompt 和 params；不将 selected index 存到 magicList。这不是 prompt badge 菜单的全部同 ID 更新规则。
- 同文件 @886500–888930：当前 prompt 的 `MAGIC_TOKEN_REGEX` occurrence 达20时拒绝，不能按 unique ID、metadata 数量或临时 point 数计数。click point 由实际 `currentTarget.getBoundingClientRect()` 的 client 坐标归一，源码不 clamp、不根据自然图片/letterbox补偿；须有实际 img 后才创建 pending point、设置 loading 和编码图片。
- 该链异步守卫缓存的是 `JSON.stringify(source.data.url)`，不是 URL 数组对象身份。新数组同值不失效，额外结果 URL 改变也失效；另检查 source/owner continuation 与当前 mark owner。确认必须投影最新输入并检查本机 document/mode owner；纯模型不负责这些异步生命周期。
- 该链没有 focus 的 `sourceId===targetId` 排除条件。有实际 IMAGE 内容的 owner 可标自身；VIDEO 可接收 token，但被点击识别 surface 仍是 IMAGE。IMAGE self-owner 时 graph 只更新该 owner，绝不创建自环边。不能复用 focus self ban。
- 成功只需源 response truthy id 与非空 suggestions；稳定 UI ID 为 `${response.id}_${pointIndex}`。元数据为 `magicList[stableId]={suggestions,imageUrl:source.data.url[0]}`，token 为 `{{magic:stableId:0}}`。response ID 没有 string-only 原始证据，有限非零 number 会正常字符串化。
- 插入消费 `promptCursorOffset`。源合法区间0..最新 prompt.length，0必须保留；cursor 处两侧分别仅在非空且不以空格/换行接壤时补一个空格。无有效 cursor 就追加，已有 prompt 无论其末字符是什么都补一个空格。不能 trim/重排整个 prompt。成功后 cursor 清 null；mode 保留供下一点。无识别结果删除本 pending，原中文为“未识别出任何内容，请重新尝试”。
- `source/38o6e4qs2-rnf.js` @40413–41730：临时 index 从1递增，pending point 为 `{nodeId,relX,relY,index,selectedSuggestionIndex:0}`，之后补 apiResponseId/suggestions。clearAll 才重置 points/index/loading/cursor。退出、Escape、返回只清这套临时 UI，不清已保存 prompt/magicList。
- `source/1fuxk6hkx6iug.js` @5165：精确 token 正则 `/\{\{magic:([^:}]+):(\d+)\}\}/g`，大小写敏感，ID 可以含空格但不含冒号和右花括号。计数包括重复 ID 与没有元数据的合法 token；损坏 index、不完整/大写 token 不算。
- `source/3u6hjewm8qox_.js` @845899–850000 和前方 tF：suggestion 实际字段为 `label` 与 `bbox:{x,y,width,height}`。bbox 各轴乘100%显示在内容容器；服务 metadata 与标签原样使用，不猜分类。
- `source/1k5w11_he1tz_.js` @13300–13640：markClickSuggest 的 Z→X 为真实 JSON POST，源会读 cookie token；本机绝不运行该调用。原 payload 精确为 `{id:imageNodeId,image_base64:rawPNGBase64,point:[relX,relY],lang}`，没有本机 document、owner、cursor、认证或图参数。

## 独立小型资格与 token 入口

`src/features/canvas/generator/mark/mark-capability.js` 不导入 graph/model/service/UI，便于真实 lazy controller 之外的入口使用。`mark-model.js` 保持该 capability re-export，调用者仍须判断 parent、protection、readonly、ready、local upload 和 resolver.configLocked，不把能力布尔当写权限。

IMAGE 资格遵照已核实 default Factory、7个 resource action Set、明确 showGenerator、asset-sourced `portraitAssetId/portraitCompliantExempt` 且未 `portraitCertifiedInPlace`、IMAGE_EDIT 显示门控。onlyFineTune、asset board、hydrated slashPreset 与严格 properties.magic===true 按 IMAGE attachment 检查。独立 enhance/picture_edit/subtitle_erase 及本机旧 hyphen 别名不宣称共享该入口。

VIDEO 的已核实 default renderer 也提供 magic；其资源资格按 `3u6` @141690–142900 / `3shzcyguvjig6` @3617后的 `assetVideoAssetId/assetVideoCompliantExempt` 且未 `assetVideoCertifiedInPlace`。VIDEO resource 的 showGenerator 单独不放行，不能套用 IMAGE 规则。其 action 的已证据门控为 `!isAssetBoardMode && properties.magic===true`，没有把 IMAGE attachment 的 onlyFineTune/slashPreset 条件扩成 VIDEO 原规则。其它 node kind 无新入口。

`mark-token-model.js` 无服务/图/UI依赖，统一提供 max、occurrence、insert、first replacement/delete，以及 `replaceAllMarkTokens`。后者供独立 prompt badge 菜单使用，只替换精确小写正则中全部同 ID 合法 occurrence，保其它 ID 与损坏 token；surface 菜单仍使用 first prefix 规则。这里不增加 prompt 菜单删除 UI。cursor 本机合法值要求整数；损坏/越界 cursor 使用原追加分支，实际 DOM 文本 offset 为整数。

## 识别 source 与纯 graph API

`src/services/canvas-mark-source.js` 提供：

```js
const source = createCanvasMarkSource({
  markClickSuggest(payload, { signal }) {
    // Caller-provided operational recognition reader.
  },
});
await source.markClickSuggest({ id, image_base64, point: [relX, relY], lang }, { signal });
```

返回有 `available`；默认 `canvasMarkSource.available===false`，调用抛 `CanvasMarkSourceError`，code 为 `UNAVAILABLE`、中文“元素识别服务未连接”。没有 fetch、原站端点、cookie、localStorage、图像编码、上传、生成 writer 或内置 suggestions。

signal 独立于 payload，透传 adapter；已经取消不调用 adapter。在途取消立即以 `CANCELLED` / name `AbortError` 拒绝，即使 adapter 忽略信号也忽略其迟到 resolve/reject，并移除监听；这不替代 controller 的 document/mode/operation epoch。只转发原四个 payload 字段，不能意外夹带 caller 的 token/文档元数据。图像实际自然尺寸 PNG/CORS/cancel 读取由 Root 独立 image reader 实现。

请求拒绝空 ID、带 data 前缀/空 base64、非二元有限点或空语言（`INVALID_REQUEST`）；不 clamp 有限点、不猜语言枚举。响应合法 shape 为非空 id、非空 suggestions，每项 string label、有限 bbox、非负 width/height。保真实额外 metadata，复制 suggestions/bbox；label 空串和零尺寸不凭空替成别的元素。损坏响应抛 `INVALID_RESPONSE`，不造 fallback。这些严格 shape/有限数学、拒 ID token 分隔符、safe integer point/index 和损坏 params 检查均是明确本机防御；源只做 truthy id/length，未证明原服务器所有字段都有此验证。response ID 支持有限非零 numeric。

`mark-model.js` 提供：

- `normalizeMarkPoint(clientPoint,contentRect)`：返回 `{relX,relY}`，有限数与正 rect 防御，无 clamp。
- `makeMarkStableId(responseId,pointIndex)`：生成准确 `${id}_${index}`，临时单调分配由 controller 负责。
- `planCanvasMarkResult({nodes,edges,targetNodeId,sourceNodeId,pointIndex,response,cursorOffset})`：只返回 `{nodes,edges}`，向最新 target.params 写 prompt/magicList；保 model/mode/count/settings/advanced/focus/scene、其它 data、位置和非 target 节点引用，edges 严格原引用。使用首 URL，允许 IMAGE self-owner。迟到 graph 的 max 再校验仍不能插入第21 occurrence。
- `selectCanvasMarkSuggestion({nodes,edges,targetNodeId,stableId,selectedIndex,knownSuggestions})`：按真实 point 提供的 knownSuggestions 或合法 saved metadata 校验 index，首次 surface token 改写；已同 index/无 token 不产生 plan，不改或重建 magicList。Core 已 prune metadata 时，真实临时 point 仍可供建议；controller负责没有图变化时只更新临时 selected index。
- `deleteCanvasMarkPoint({nodes,edges,targetNodeId,stableId})`：首 token 精确空格规则，移一项，空表 undefined；metadata 已被 Core清理时仍可清首次 token。无 token/无 entry 返回 null 图计划，由 controller删除真实临时 UI；如果仅 token已被输入删掉但 metadata仍在，仍可删除该残存项，不改任何边。

返回 null 表示拒绝/无变化；模型不读 DOM/storage，也不执行历史、CAS、flush、owner/source URL 守卫。damaged params/magicList不覆盖；存在的毁损 entry、坏 knownSuggestions及非法 index继续拒绝，正常缺 metadata不能代替坏 entry判断。新结果保留其它旧 entry 的内容与引用，不假装修复不相关损坏数据。最终 caller 须投影末次 draft，对原 raw graph CAS 一次，然后协调保存失败和重试；accepted graph 后不得以再次识别/重建 plan 增加重复历史。

## 本批实际验证与边界

Node24.19.0 定向 Vitest：3文件 **72/72**，18:47:25 /266ms，日志 `artifacts/canvas-mark-model-source-initial-tests.log`。测试使用真实纯函数与 wrapper、冻结 graph 及明确合法 adapter，包括默认零 fetch、取消无迟到污染、精确 payload、有限防御、真实 metadata、重复 occurrence20、cursor0/空格/换行、first/all区别、delete trim、IMAGE/VIDEO/资源资格、self source、不变边、最后 params、无 token 删除、damaged metadata和非法 index。

首次冻结为 Node24.19.0，18:50:47 /264ms，仍为3文件 **72/72**，日志 `artifacts/canvas-mark-model-source-frozen-tests.log`。7个新增源码/测试文件与本文定向 Prettier 通过，源码/测试 ESLint零警告。本 agent 不启动 fullcheck、不改既有 focus/Inline/prompt/views。controller、真实 UI/crop/image reader、键盘互斥、原生识别、实际服务和完整工程检查由 Root 分别记录；72项不是原生或运营识别验收。当前默认没有识别 source，完整目标未完成，本批未部署。

### 后续恢复 Core prune 后的真实 point操作

上述18:50冻结的 select/delete原先要求 saved entry存在，是 Root初步安全建议而非源码要求。Root核通 input atom删除后的 generic Core `w` prune 后，明确重新授权这两个纯计划恢复源可达行为；不能因为更严格的门控就把原功能禁掉。再次读取 `3u6` @885600–886500：point删除先移临时项，`magicList??{}`并无 entry存在检查；建议选择先改临时 selected index，再按首次 prefix改正文，也没有查 saved entry。

本次只解冻这两函数和对应原新增测试；正常缺 entry时按以上knownSuggestions/no-plan合同运行，所有损坏 entry、坏 params、非有限bbox、坏数组、非法 index原强断言继续保留。旧缺空表 `{}`必须失败的测试改为实际源可达链，新增正常缺 entry、其它metadata保留和 no-token/no-entry零图计划；识别 source、token与capability文件未修改。

controller另加真实识别→Core清最后token/meta→仍切建议/删临时point的回归，并强断言没有新 raw graph、commit、flush或history。第一次三文件105项104 passed/1 failed（19:09:56 /836ms），日志 `artifacts/canvas-mark-pruned-point-before-controller-tests.log`，失败为Root当时mutate见null计划就拒更新temp。此源可达合同与最新controller修复/冻结结果在 [owner复核](./canvas-mark-owner-review.md) 后续段记录；先前72/130通过只是修改前快照。

最新联合冻结为 Node24.19.0，19:16:06 /1.06s，pure/source现74项、controller50与真实entry12，五文件 **136/136通过**，日志 `artifacts/canvas-mark-owner-review-source-complete-tests.log`。本次解冻的模型/测试及新review定向format/lint零警告，本文独立格式通过；其它capability/token/source文件未改。Root另外负责generic Core prune、actual App/原生及正式完整check，本批未部署。
