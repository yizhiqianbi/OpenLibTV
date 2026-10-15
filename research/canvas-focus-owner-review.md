# 图片聚焦 controller 所有权复核

2026-10-12。先静态研究 [完整focus/mark源码审计](./canvas-media-focus-mark-source-audit.md)、`generator/focus/focus-region-model.js` 及其39项纯测试，再复核Root交付的 `useCanvasFocusMode` controller。作者只新增所属review回归与本文，生产修复由Root完成，不改既有测试；全工程检查由 Root 独占。本机controller通过不等于实际App、原生交互或真实生成已完成。

## 确认的源合同

`3u6hjewm8qox_.js` @835931–843020：region 使用实际图片内容框的 client rect归一，不是Canvas世界位置或自然图片像素；pending与已保存region分开。第一次Escape取消interacting/pending，第二次退出mode；取消不能清原参数。@883330–884090：确认读取最新target params/settings，只写focusRegion/originImage/scene与准确ratio key，存在任何source→target edge时复用，不补重复边；普通参考列表应排除focus源图片。@909900–911940：只能选前图，target自身、publishProtection及storyboardChild不是可框surface。源入口要求实际default IMAGE generator和schema.properties.focus严格true，不给TEXT/VIDEO/ScriptV2创造focus入口。

`21_0xvlvkw1sz.js` @160226–161255：return保zoom、400ms移动后退出；pending取消仍在mode内。源全局Escape监听没有dialog-stack守卫；本机应让菜单/预览/expanded frame先消费，再到pending、mode，这是明确可达性适配。源cancelKey未完整清draw/move/resize bool/start refs；本机须取消真实pointer并阻迟到release复活，这是稳定性适配，不宣称源码已具备完整取消。

## 本批高风险验收合同

- 同一document mode A→B→A与document A→B→A分别退休旧operation；旧region确认、异步callback与回焦点不接新owner。readonly/ready/schema能力丢失、owner删除/变类型、被框source移除或媒体内容变化同样失效；正常immutable参数编辑不能按对象引用误退休。
- 进入编辑已保存region，不立即改params/edges；pending取消、第一Escape、退出和模式接管都保已保存graph。source切换只清旧pending与ratio，不将旧框移到另一图。真实pointer cancel/blur/lostcapture/双pointer不能复活旧pending。
- confirm对当前owner投影末次registered draft，再用原raw graph CAS，一次history保latest prompt/model/count/advanced/settings其他键、sourceURL与位置尺寸。draft projection抛错或CAS拒绝，不flush、不变图，保region/ratio供重试。
- flush失败时已接受graph只有一次边和history；再次confirm或retry仅保存合法当前文档，不重新执行graph plan。迟到旧retry不能保存新document。没有成功持久化不得假关闭并丢可重试输入；Quota状态与document header retry保持一致。
- 保存、删除分别验证source首条对应edge/字段规则；原所有params保持，cancel不得冒充delete。原ratio选择顺序、首个ratio键及sourceURL数组首项由纯模型维护，controller不重写另一套几何或参数。
- reference/普通pointer与focus模式必须有明确互斥owner；按钮正常键盘激活和input焦点不触发图手势。已有source region可以本地保存，真实生成所需red-box图片上传、任务和费用仍明确未接。

源UUID不复用及无可靠原子同UUID替换incarnation的边界沿已有约定，不重复构造此假服务协议。完整App的dialog-stack/Escape和各模式接管、真实media预览及上传/task仍须分别验收，不借纯模型或controller正向夹具宣称通过。

## 实际controller复核、失败与修复

新增 `src/features/canvas/generator/focus/useCanvasFocusMode.review.test.jsx`，运行真实hook、纯geometry/图plan和现有resolver；只注入focus/ordinary两种小型合法schema、DOM内容框和明确本机commit/flush接口，未mockcontroller或假造认证。内容框真正挂到document，pointer capture、FileReader/生成服务与自然图像像素不在该controller测试中验收。

初次28项为15 passed/13 failed（17:27:01 /719ms），日志 `artifacts/canvas-focus-owner-review-initial-tests.log`。其中三个确定生产问题由Root修复：

1. `fresh` 短路结果可为false，而 `context?.graph.nodes` 只防null/undefined，stale callback仍读取undefined.nodes抛错。9项失效及换代分支复现；现先显式拒null/不匹配mode，再解析合法context。旧确认、比例和return不再越过退休owner。
2. model downgrade清region前已project最后草稿，却用caller的整份旧params覆盖，丢最后prompt。现caller未显式修改prompt时保projected prompt；明确新的prompt、包括空字符串优先。清focus字段/首条edge、model变更同一次CAS；失败保已保存region、mode与graph。
3. 旧mode的move/end只读取全局current pointer，可在A→B→A后操纵新same-pointer手势。现两者同时检查rendered mode/owner；旧事件不能移动或结束新的gesture。

另外两项失败只是浮点几何 `.49999999999999994` 与严格 `.5` 的夹具期望不匹配，改12位close断言后仍要求confirm精确保留经过验证的pendingRegion、所有其他params/source/history/zoom；不修改源码数学或舍入到测试值。修复后原28项全过（17:29:48 /443ms），日志 `artifacts/canvas-focus-owner-review-numeric-fixed-tests.log`。

随后增加三个直接覆盖修正的强回归：明确空prompt覆盖旧draft、失效patch owner返回严格false阻host普通update回退、downgrade CAS拒绝不清已保存region。最终31项覆盖confirm末次draft/raw CAS、任意已有edge复用、project/CAS失败保pending/ratio、Quota重复确认仅flush/一history、undo后不复活accepted region；已保存region取消/两层Escape、mode和doc A→B→A、7类owner失效、source URL/删除/正在读取失效、immutable正常更新；pointercancel/blur/hidden、第二pointer/childlostcapture、删除首条edge及原params、model downgrade，以及旧move/end。

## 本批执行结果与范围

官方 bundled Node24.19.0，17:32:04 /696ms，controller review31项与既有pure39项联合，两文件 **70/70通过**。日志 `artifacts/canvas-focus-owner-review-final-joint-tests.log`；新测试定向格式/ESLint零警告，本文单独格式检查通过。没有启动fullcheck、运行原站bundle、账号/识别/上传/生成/支付或部署；正式完整检查由Root另记录。

### 后续 template 写门控

Root随后为enter/fresh增加resolver.configLocked写门控；source capability / canTarget仍独立显示可支持入口，由实际generator UI按configLocked禁用。controller不让旧entry/confirm绕过locked template，锁状态变化只退休pending/mode，保此前已保存region与edge。

本文件新增两项覆盖locked enter拒绝但canTarget仍true且无互斥副作用，以及pending期间template变locked、旧confirm拒绝、已保存graph/history/flush不变。模板夹具必须包含合法scene、models和schema.config=false；初次只提供schema.config，现有mergeGeneratorMediaSchema按已有完整契约忽略该无效extraConfig，导致2项夹具失败（17:38:12 /824ms，`artifacts/canvas-focus-owner-review-locked-final-tests.log`），不是生产lock门控失效。补齐已核实模板结构，未改生产或降低断言。

最终Node24.19.0，17:39:14 /884ms，controller review33项与pure39项两文件 **72/72通过**，日志 `artifacts/canvas-focus-owner-review-template-lock-verified.log`。新测试定向Prettier/ESLint与本文独立格式通过；此前70项为历史快照，最新72项仍不能替代实际App或完整检查。

### 源最小尺寸与后续编辑闭包

Root第一轮正式完整check的335文件/4465测试通过属于修复前快照，日志已保存为 `artifacts/canvas-focus-before-minimum-review-check.log`；发现下述确定差距后不把这份结果宣称为最终源码通过。

只读真实调用既有pure函数证实：显示aspect1.526、初始region `{relX:.96,relY:.3,width:.04,height:.05}` →选9:16后width `.0184305373525557` →移动最右后relX `.9815694626474443` →SE缩放贴边的最终width `.02`、height `.050000000000000086`，端点X为 `1.0015694626474443`。当时move、ratio和confirm计划均返回null。

归档 `3u6hjewm8qox_.js` @838990–840030 的tR角缩放在逐边限制之后再 `Math.max(.02,dimension)`，确实可越过边界；@883330附近的r3直接保存该region，没有再次限制端点。后续ratio可把越界轴缩到小于.02，N/W edge又保原far-edge并扩到大于1的尺寸；仅接受“越界轴恰好.02”仍会拒绝源可达后续操作。

Root保原数学顺序，不追加clamp，改region有效性为有限值、起点0..1、正尺寸、端点最大 `1.02 + ε`。该界限容纳源最后最小尺寸及后续操作；大于1.02、非法起点、非有限值与非正尺寸继续拒绝。既有39项强回归未改。

新增独占 `focus-source-minimum-closure.test.js` 13项：真实ratio→move→SE overflow后的继续移动、切ratio与confirm；N/W保far-edge产生大于1尺寸仍能确认；已有edge/源节点/原params/model/count/prompt/settings/advanced/位置保持，10种损坏region仍拒绝。另在controller review追加第34项，以真实draw→ratio→move→resize pointer API导出越界state再确认，不mock state或直接注入region。

Node24.19.0，17:54:31 /717ms，新closure13项、controller34项与旧pure39项联合，三文件 **86/86通过**，日志 `artifacts/canvas-focus-minimum-closure-verified-tests.log`；新文件定向格式/ESLint和本文独立格式通过。Root将按最新修改重新完整check，旧335/4465不是本次最终验证。上述原函数求值与source静态对照不执行原bundle，不证明真实生成/上传或原生图像像素。

这些结果证明所列本机controller/模型合同，不证明实际DOM renderer入口、原生pointer/Tab/叠层事件顺序、crop预览、服务器writer或整个focus UI。source camera_focus允许无额外prompt、以originImage作为图像输入的submit gate亦需要实际接线核对，不能只以confirm图保存成功替代。整个复刻目标继续未完成。
