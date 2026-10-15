# 节点参考手势与多文件添加验收

2026-10-12。本批响应节点操作不自然的反馈，修正实际框选、定位、指针竞争、拖动后的点击和普通多文件添加。修改只在本机工作区；既有 Vite 5173 保留，无部署、账号操作或原站写入。原始内容仍仅用代表性公开样本。

## 用户可见结果与原因

- 参考框选使用松手时的最后坐标，起点和终点均按当前视口转换。快速释放及框选期间缩放不会继续使用旧终点或旧世界起点。命中依据当前节点实际显示尺寸，未保存 width/height 的350×230图片不会只按200×120判断右下部。
- 参考框为独立屏幕叠层：蓝色1px虚线、8%蓝底、z200，任一轴超过5px启动，但两轴至少5px才绘制。普通框选与参考框选分别保持自己的显示条件和选择协议。
- “返回节点”平移到目标中心，保持当前缩放，400ms结束并退出模式。真实浏览器曾复现97%突然变174%；修正后97%保持97%，提示词与参考保留。
- 已有参考或普通指针手势持有控制时，第二个mouse/pen指针不能另开操作；无关子元素 lostcapture 不退休 board 的捕获。失焦或页面隐藏只取消未提交框选，已经接受的参考和模式保留。
- 参考遮罩按钮共用普通拖动和参考框选的尾click保护，避免平移后误加、误删参考；新的 pointerdown 立即退休旧尾click，同mouseID的下一次真实点击和detail0键盘按钮激活不被吞掉。
- 普通上传在首个await前复制完整 FileList。真实选择器选两张只加入第一张的错误已修；本批读取完成后一次历史追加到最新图，撤销与重做仍为整批，读取期间的编辑与连线不被覆盖。

## 来源与实现边界

原始静态源码 `research/source/21_0xvlvkw1sz.js` @283500–286300 支持release当前view、measured→stored→200/120、源矩形样式与当前zoom返回。没有执行源bundle或其遥测。直接证据及失败回归见 [所有权复核](./canvas-reference-gesture-owner-review.md)、[参考选择来源](./canvas-script-reference-pick-source-audit.md)。

本机使用PointerEvent、嵌套世界坐标和独立raw文档；双pointer consumed、blur/hidden、DOM读取尺寸、mask click防线和centerCanvasView是这些架构的适配，不能说原站片段已证明pen/blur所有分支。尺寸仅在release只读，不进入存储、历史或raw CAS。仍复用既有draft投影、一次图提交、保存失败重试与文档owner。

普通多文件读取只代表本机FileReader，不是服务器上传。调用侧清input.value后live FileList被清空是实际原生发现，固定数组测试无法覆盖；新增测试保真实File对象和领域读取，仅FileReader完成时机受控。

## 原生浏览器实际验证

本批使用已有IAB Tab2和本机真实App，没有注入图、存储或事件替代以下原生操作：

1. `reference-ui-check-20261012`：原生参考取消后以拖动 `[220,65]→[620,705]` 选择两张图，参考数量恢复2、提示词保留。这证明一次普通多图框选；快速release、wheel期间两端转换及pen竞争另由受控App/hook回归验证。
2. 同项目：原生“返回节点”修复前97%→174%，修复后重复97%→97%；最终DOM为 `scale(0.968254)`，平移从 `(494.762,0.015873)` 到 `(276.905,30)`，模式退出，正文不变。截图 `artifacts/canvas-native-reference-return-proof.png`。
3. `canvas-native-gesture-20261012`：可见“上传素材”触发原生chooser，isMultiple=true，选择既有公开PNG `6393c4e4ac8886bc.png` 与 `b8d35ea43ec7260a.png`。修复前新增1张；修复后新增2张，保原1张共3张。一次撤销回原1张，一次重做恢复同3个ID。
4. 将新两图打组，原生标题拖动 `[72,142]→[132,182]`。157%视口中组与两孩子各移动约60/40屏幕px，组外旧图坐标不变；一次撤销/重做和刷新均恢复对应位置与ID。详见 `artifacts/canvas-native-group-gesture-proof.json`，截图 `artifacts/canvas-native-group-gesture-proof.png`。本项验证既有分组拖动没有被本批指针修正破坏，不声称新增了组规则。
5. 390×844实际参考菜单与模式入口、Escape退出通过；documentWidth390，顶条left17/right373/width356，没有横向溢出，截图 `artifacts/canvas-reference-gesture-narrow-proof.png`。随后恢复默认viewport。

汇总 `artifacts/canvas-gesture-refinement-browser-proof.json` 保存输入方式、原生失败/修正范围、缩放及DOM结果。开发期间16:24:43修改hook结构的HMR曾记录hook-order/queue错误；保留日志，不当作最终冷加载错误，也不宣称整个历史console为空。最终刷新运行的时间范围单独记录在同一证据中。

未做原生持续Space/Alt修饰拖动、真实pen/触控、Safari或大图压力验收；不能把jsdom PointerEvent/捕获夹具说成真机结果。

## 工程检查

官方Node24.19.0最终 `npm run check` exit0，328文件/4377测试全部通过，tests16:53:44/104.32s，生产构建11.11s；格式、零警告ESLint/架构边界、核心strict通过。日志 `artifacts/canvas-gesture-refinement-final-check.log`。测试进程保留依赖的DEP0129提示，不把零lint警告扩为所有过程零提示。strict不覆盖全部JSX，CI未远端执行，统计包含独立影游扩展。

CanvasPage最终875309字节/gzip288970，既有900000阈值未变，证据 `artifacts/canvas-gesture-refinement-build-proof.json`。上一批873731/288543是历史产物，不能记为本批最终字节。没有通过manualChunks或抬门槛隐藏体积提示。

专项七文件195项16:37:25/4.56s，含实际App八项、hook七项及普通pointer旧回归；日志 `artifacts/canvas-reference-gesture-owner-final-verified.log`。FileList新旧两文件8项16:46:09/767ms；日志 `artifacts/canvas-ordinary-upload-file-list-tests.log`。原失败和selector/consumed合同迁移保存在所有权复核，没有删弱graph/history强断言。

## 已准备与剩余工作

同步调研了图片focus/mark实际入口、内容坐标、区域八向resize/比例与提交协议，见 [focus/mark来源](./canvas-media-focus-mark-source-audit.md)。`generator/focus/focus-region-model.js` 39项纯规则测试通过；仅准备模型，未接focus UI/controller或mark识别服务，不能记为已完成交互。普通资源生成器入口资格仍需后续按源完整接线。

真实生成、上传、费用、权限、识别与运营写服务仍未接；登录注册、小号及账号资源按用户要求延期。既有独立影游生产部署不被本批本机检查替代。全站复刻目标继续未完成。
