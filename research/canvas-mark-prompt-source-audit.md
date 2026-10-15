# Mark magic 提示词 badge 与输入协议

2026-10-12。本轮静态读取公开归档脚本，不执行原站JS，不使用账号、真实识别服务、上传/生成写服务或部署。测试用合法suggestions夹具验证本机输入，不能视为真实识别已接入。本文只负责提示词codec/DOM/menu/caret；Root持Mark mode、合法source调用、图CAS/历史/保存及point overlay，其他代理持点位UI/纯图计划。

## 1. 直接来源与字段

模块838978实际定义于 `research/source/1fuxk6hkx6iug.js`，不是主bundle字符838978。

| 解码后0-based字符偏移 | 证据                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5172 / 6773           | lowercase `{{magic:([^:}]+):(\d+)}}`；ID不能有冒号/右括号，index按parseInt读取。大小写、负数、损坏括号不会按这个协议识别。                                                             |
| 32679–33836           | metadata取 `magicList[id]`，其 `{suggestions,imageUrl}`，当前label是 `suggestions[index].label`，备选数量>1画›。bbox用于图片point overlay，不是prompt label。                          |
| 32964–33836           | 原DOM span contenteditable=false；data-magic-id/index/label。h24/px6/gap4/fullround/border1/font12；imageUrl时14px圆形thumb，无URL时✦10px/opacity.8，多项›12px/opacity.5/marginLeft2。 |
| 7202 函数A            | chip background/text/border分别来自 canvas-controls-active/text/border。                                                                                                               |
| 25402 / 30773 / 37399 | DOM读取与caret计数按完整 `{{magic:id:index}}` 字符长度，不按可见label/箭头字数；atomic delete将整个magic span作为单元。                                                                |
| 38958–39180           | `updateMagicSpanLabel` 更新所有同ID DOM span的index/label。                                                                                                                            |

`1nd0f9k3q9sol.js` @7500 的真正prompt props有 magicList、onMagicSuggestionChange、promptCursorOffsetRef。

- @39575–40100：点击magic span，只有suggestions.length>1才开menu；菜单选择时更新**所有同ID DOM span**→readEditorValue→立即onChange→onMagicSuggestionChange(id,index)→关闭。不能只套图片point的first替换算法。
- @65380–66560：source menu固定定位于badge底下4px、左对齐；min120/max220、padding4/radius16、blur32、hair border、listmax200/gap2；按钮px8/py6/font14，选中8px圆点。原建议菜单没有删除X或删除item。
- @42270–43100：document.selectionchange listener仅在editor.contains(activeElement)时读取完整value offset，非null才写MarkPointStore与promptCursorOffsetRef。cursor0合法；外部image/blur不把null覆盖此前合法offset。

point overlay来自 `3u6hjewm8qox_.js` @885600–886250：选择与删除只操作首次token；delete吞两侧**ASCII空格**再拼一个空格并trim、删magicList对应entry，空表undefined。它与原生Backspace只删atomic span保邻近空格是两条不同协议。

## 2. 未知或损坏metadata的明确防御差异

source838978在label缺失时会使用 `canvas:magicChipFallbackLabel`，即生成可见fallback名字。本机按本批约定不猜识别标签：只有自己实际拥有的metadata entry、suggestions是数组、当前index为安全非负整数且有真实非空string label，才渲染magic badge。未知ID、缺metadata/label、越界/损坏token仍逐字保raw。这是本机无假标签防御，不伪称与source fallback文字一致。

过滤坏建议保真实raw index，不重新编号。没有imageUrl时使用source装饰✦，它不代表识别结果。元数据只读，bbox/标签/图片均不本机推测，不改变退出mode后的原prompt或metadata。

## 3. 小型codec与既有media parser兼容

新增 `generator/mark/mark-prompt-model.js/.test.js`：

```text
resolveMarkPromptToken(token,magicList) -> real descriptor | null
markPromptTokens(value,magicList) -> real descriptors + from/to raw offsets
selectMarkPromptSuggestion(value,magicList,id,index) -> all-ID next prompt | null
mapMarkPromptSelectionOffset(value,id,index,offset) -> adjusted raw offset | null
```

token scanning与all-ID替换只import pure agent提取的轻量 `mark-token-model.js`，不静态引用服务/图计划/React。该小模块同时保留point所需insert/first替换/first删除，避免两套协议重复维护。

`parseNodePrompt(value,references,{magicList}={})` 新增显式可选metadata输入，原两参media调用不改变；kind:'magic'只来自真实descriptor。serialize与data-prompt-token统一无损读取。`replaceNodePromptRange`的可选metadata只将已渲染known magic作为原子范围；未知文本仍是文本。ordinary Image/Portrait/Video/Audio/Mixed/Element parser、列表/索引/MIME/Suggestion算法未改。

DOM仍由现有renderer维护，不在contentEditable中createRoot或嵌套Reactportal。已知magic有独立CSS/data-magic字段，没有冒充ordinary mentionType。source all-ID菜单先原地改各span的完整token/index/label再读value、一次即时onChange；普通媒体DOM和editor身份保留。仅在被更新ID另有原先不可显示的raw occurrence时，必要redraw使其真实新index可显示。

## 4. NodeGeneratorPrompt 接线接口

新可选props：

```text
magicList=params.magicList
onMagicSuggestionChange(id,index) // Root只同步当前临时point，不再重复Graph CAS
onSelectionOffset(offset)         // 当前合法完整value offset，包括0
```

imperative ref新增 `getSelectionOffset()`，读取editor当前selection.start，否则最后合法savedSelection.start，否则null。既有getValue/flush/cancelPending/insertReference等接口和草稿registration不改。

cursor通知复用**既有唯一**document.selectionchange listener，latest callback与mounted/blocked/IME/editor-active guards隔离旧session和外部焦点；不新增第二套global listener。root enter先capture初值，成功point后consume为null，后续用户移动/输入合法caret重新写入。controlled redraw若确实产生当前activeEditor合法selectionchange也会像原source通知，不以“安全”名义永久收窄成mouseup/keyup。

magicSignature参与metadata重绘检查；composition期间不覆盖正在输入的DOM，compositionEnd再重绘真实标签与提交。doc/session/readonly/metadata/anchor退休时关闭旧menu，保editor身份与当前typed输入。原native atomic Backspace与local history保持；不在prompt新增point-delete按钮或吞邻近空格。

**Core边界**：原生Backspace只下沉新的prompt，source GeneratorCore随后会prune不再引用的magic metadata。当前generic resolver/params updater此前没有该扫描；Root/Core需补这一源规则或明确范围，不可用point delete plan冒充keyboard路径已完整。此代理没有扩大到Root params/graph服务协议。

## 5. 建议菜单与可达性

`MarkPromptBadge.jsx` 是当前atomic DOM badge的独立React菜单视图，不在editor里另建React root。复用useAgentToolbarPopover的外部关闭/Escape/dialog-child登记；菜单bodyportal，无新dialog/body lock。source主要mousedown选择保输入focus；keyboard click同一选择路径，选择后回当前更新badge，Escape回原badge，外部focus不抢回。badge新增role/button/tabindex与keyboard Enter/Space/ArrowDown属于可达性适配。

source left/below4px、min120/max220与menu视觉保留，RAF跟当前真实rect并在anchor移除/unmount退休；只有空间不足时本机8px clamp/上下翻，属明确窄屏适配。没有新框架、source I/O、假label或删除menu。

## 6. 验证范围

定向验证覆盖真实metadata/零index/未知raw/越界与坏label、all-ID选择与other-ID保留、caret length变化；真实contentEditable的media/重复token无损、单次即时onChange与point同步次序、稳定editor/媒体DOM、IME下metadata变更、clipboard原协议、Backspace/local undo、readonly与旧session/anchor、cursor0/后续移动/外部blur/卸载；menu选项/选中态/source位置/鼠标与键盘/逐层Escape/外部focus/窄屏clamp/RAF释放。

检查日志与最终计数在freeze时发Root，不把pure/mock输入验证当App图/history/保存/实际识别/原生浏览器验收。default Mark source不存在仍需明确blocked，登录注册、小号和原站写入均不要求。

本批Node24定向 **8文件/95测试** 在19:07:33通过（2.92s），包括三新增文件和原media prompt、Suggestion、引用替换/素材选择；日志 `artifacts/canvas-mark-prompt-final-tests.log`。本批owned JS/JSX ESLint零警告、JS/JSX/CSS格式检查通过。没有全量check、浏览器、部署或真实识别请求；Root负责最终App接线与原生验收。
