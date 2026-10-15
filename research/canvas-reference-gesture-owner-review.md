# Canvas 参考手势与普通指针所有权复核

2026-10-12。作者只读审查实际 reference / ordinary pointer / keyboard / touch / wheel / Viewport / Mask 接线，并新增两个 review 回归文件及本文。生产修复由 Root 完成。不执行原站 bundle，不读取账号，不请求上传/生成/消费，不部署。上批324文件/4320测试是此前冻结快照，不能据其证明本批修改通过。

## 原站直接证据与已纠正差异

- `research/source/21_0xvlvkw1sz.js` @283500–285100 的独立参考框选保存起始 client 坐标；release 时将起点与 release client 同时转为当前画布坐标。它不依赖最后一次 mousemove 的终点，也不把起点固定为进入时的世界坐标。本机原实现会在快速释放后漏掉最后一段参考，或在框选期间 wheel 改变视口后使用旧起点。Root 现在按实际 release 计算最终 rectangle，并用当前 view 转换两端；取消事件不提交。
- 同文件 @284300–285100 的源候选盒子读取 ReactFlow.getNodes() 的 measured→stored→200/120，祖先最多32层、strict overlap。原本机直接读 raw 持久化节点：上游图片按源未保存 width/height，实际 shell 350×230，却只按200×120回退；框可见右下半部会漏图。Root 在当前 owner 的实际 board 中只读 shell 尺寸并转为画布单位，交 collector 的 getNodeSize；未修改纯源 fallback，不将 measured 写入文档。具体资源无尺寸字段来自 [导入源码](./canvas-script-reference-import-source-audit.md)。
- 同文件 @286098 返回节点用当前 getZoom 与400ms的 setCenter。原本机用 fitCanvasView，把0.3缩放跳到2.08。Root 改为独立 centerCanvasView，保当前 zoom、计算当前世界中心并退出模式；不写图或改变选择。世界位置适配与 source raw group-position 不能混称字面相同。
- 参考框选视觉 @285100–286000 是屏幕坐标；任意轴超过5px激活，但显示矩形要求两轴均至少5px，蓝色虚线、8%蓝底、z200。Root 的 Viewport 现用独立 cv-reference-pick-box，不再借普通 selection rectangle 的 world 样式。source 独立参考框选没有调用 setBoxSelecting，只有普通 Flow selection 的回调调用；不能将 referencePick.boxRect 错误套入“普通 sole-selected B OR explicit target A”的显示 predicate。原站直接模式合同见 [参考选择源码](./canvas-script-reference-pick-source-audit.md)。

## 确定的本机所有权问题与修复

以下是本机 PointerEvent 架构的稳定性适配，原站 mouse-event 片段并未证明这些 pen/blur 分支，不宣称为原站原生验证：

1. blur / document hidden 未退休在途参考框，返回后迟到 release 仍可提交。Root 增加窗口/可见性监听，只取消 transient box、释放它的 capture；保模式与已经接受的图。
2. 第二个 pen/mouse primary pointer 可以覆盖同 hook 的 gesture，或 hook 拒绝后从 Viewport 落入 ordinary readonly pan，形成双 capture。反向 ordinary mouse pan 尚未释放、松开Space后 pen press，也可开始独立 reference box。Root 为已有 reference owner 的后续事件使用 consumed 合同，并将普通 pointer 的实时 isPointerActive getter 交给 reference controller；第一个 owner 保留控制，额外 pointer 不开启或终结它。
3. 子节点 lostcapture 冒泡被误当 board 自身失 capture，提前取消参考框。Root 区分 capture element，消费无关事件、保实际 capture；board 自身 cancel / lostcapture 仍取消而不提交。
4. Mask 直接回调 pick/disconnect 绕过 article 的 ordinary pointer 尾 click 与 reference box guard。Space/middle pan 已完成后，若排队 pointer-generated click 到达 mask，仍可增加或删除 edge。Root 将原事件交 caller，共用两类 suppression。正常浏览器 capture 可能把 click 重新定位到 board；此测试只证明回退/排队 click 到达控制后的防线，不能声称所有浏览器必定复现同一 hit target。
5. 新 guard 也必须识别真正新输入：相同 mouse pointer ID 的新 pointerdown/up 应立即可点 mask，不能用500ms窗口吞掉下一次意图。Root 的 ordinary begin 在 isolated / editable 早退之前退休旧尾 click；focused button 的原生Space、detail0激活保持。没有以禁用键盘按钮或删除自动焦点掩盖问题。

以上变更继续复用当前文档 CAS、draft 与 history；不创造任务、假上传、假权限或 source mark/focus 模式。普通 pan、参考选取、生成器输入和 button 键盘激活是不同 owner，不能仅凭 selected / DOM focus 推断另一个模式。

## 失败日志与回归范围

新增 `useCanvasReferencePick.gesture-review.test.jsx` 七项：最终 release、wheel 后两端坐标、保持zoom的返回、blur、hidden、第二primary pointer及childlostcapture。修复前 `artifacts/canvas-reference-gesture-owner-source-baseline.log`（16:22:09 /658ms）为7/7失败。更早日志的左侧图夹具宽100跨过x0，使wheel项误通过；调整成完全负x的宽40后形成准确七项失败，没有改生产来迁就测试。

新增 `NodeCanvas.reference-gesture-review.test.jsx` 八项，直接运行真实 App/controller/动态generator：Space与middle pan之后的可选mask尾click、取消mask尾click、同mouseID新指针意图、userEvent原生Space、无保存尺寸的实际shell框选，以及双pointer两个方向。首三项真实失败见 `artifacts/canvas-reference-pan-mask-review-initial.log`（16:24:04 /2.23s）；measured失败见 `artifacts/canvas-reference-pan-mask-measured-review.log`（16:28:25 /2.23s）；两个方向的capture问题分别见 `artifacts/canvas-reference-second-pointer-app-review.log`、`artifacts/canvas-reference-pan-first-app-review.log`。

source Screen 矩形接入后，旧 App test 的 cv-selection-rect selector 和新增测试一处同样旧 selector 产生夹具失败；正确改为 cv-reference-pick-box，保框选/取消/图/history强断言。第二pointer API 从“拒绝创建返回false”改为“消费返回true”，只调整这类 Boolean 合同，原矩形、单 capture、graph及合法主指针释放断言保留。

### 本批验证状态

官方 bundled Node24.19.0，16:37:25 /4.56s：七文件 **195/195 通过**，日志 `artifacts/canvas-reference-gesture-owner-final-verified.log`。包括新增hook7项、实际App8项，旧reference hook13项、连续/pane2项、实际新增参考App11项及普通pointer两文件154项。旧App的三个box selector仅按Root明确授权更换，全部图、阈值、取消、history与恢复强断言保留。新增文件和旧selector文件定向格式/ESLint通过，本文单独检查格式。

完整检查以 Root 后续冻结结果为准。作者只证明这些 controller/App/ordinary pointer 回归，不将其写成全工程或原生浏览器通过。RAF、bbox和PointerEvent capture均为可控 jsdom夹具；实际鼠标/pen/触摸、浏览器原生重定位、CSS命中及连续手感须另外验。Root 已开展原生检查，其实际记录由对应浏览器/覆盖文档持有，本文不替代。

### 后续原生普通上传发现与 FileList 回归

Root 原生检查发现普通画布多文件选择器虽 `isMultiple=true`、实际设置了两张真实PNG，节点仍只进入第一张且界面显示已保存。原 handler 调用 `upload(e.target.files)` 后立即清 `input.value`，原 controller 在 live FileList 上跨首次 await 继续迭代；input 清空后剩余项丢失。该原生失败及修复后的重验由 Root 持有，不与上文jsdom框选夹具混称。

Root 将 `useCanvasNodeActions.upload` 改为第一次异步读取前 `Array.from(files || [])` 保存全部 File，再遍历固定选择。节点仍等本批读取完成后一次 record、追加到最新 nodes，保读取期间的最新 edges；未改变真实服务器上传边界。

作者新增 `useCanvasNodeActions.file-list.test.jsx` 三项，使用清空后 iterator/length/item 立即变化的 live FileList host夹具，保原始 File对象身份与顺序。未mock readCanvasUploadNode；实际领域读取与浏览器读取服务运行，仅FileReader完成时间受控。覆盖清 input 后仍读第二File、两次读取间新剧情/节点/连线不丢、整批仅一历史；首File失败仍接第二File且无假失败节点；同File对象以新FileList重选，两批分别一次历史且生成不同ID。普通静态数组会隐藏原问题，因此不作为此回归的输入。

Node24.19.0，16:46:09 /767ms，新三项与旧document/readonly/loading取消及保最新图五项联合，两文件 **8/8通过**，日志 `artifacts/canvas-ordinary-upload-file-list-tests.log`。执行时Root生产修复已落盘，本日志为修复后结果，不能写成失败基线或原生chooser验证。定向格式与ESLint通过；此后完整check仍由Root记录。

整体复刻目标继续未完成。本批无部署；真实原站上传、生成、账号、支付、协作与运营写服务继续未接。
