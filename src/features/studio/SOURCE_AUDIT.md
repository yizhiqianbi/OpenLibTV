# Studio 导入动画、解码与场景子树接线（2026-10-11）

2026-10-18 浮动机位预览维护：监视器卡片新增桌面 PIP 入口，`StudioFloatingPreview` 复用已有 monitor frame channel，支持机位标签、播放/暂停、关闭、标题栏拖动和边界限制；浮窗使用 `data-preview-pip` 隔离内部 pointer，位置只属于临时视口 chrome，不写入 Studio 文档。Studio 专项 **30 文件 / 145 项通过**；最新完整 `npm run check` **498 文件 / 6739 测试**、3713 modules、build18.60s，证据 `artifacts/studio-floating-preview-verification.json`、日志 `artifacts/studio-pip-full-check.log`。协作/云端写入、真实生成与视频导出仍未接入。

2026-10-19 WebM 视频导出维护：导出面板在存在动画时启用视频选项，`viewport-commands.exportVideo` 使用当前 renderer canvas 的 `captureStream` 与 `MediaRecorder`，协商 VP9/VP8/WebM，按时间轴逐帧调用 `renderViewportFrame` 后下载 Blob；面板显示进度并支持 AbortController 取消，浏览器能力缺失、无动画、取消或录制错误均保留明确错误。Studio 专项 **30 文件 / 147 项通过**；最新完整 `npm run check` **499 文件 / 6744 测试**、3714 modules、build13.96s，证据 `artifacts/studio-video-export-verification.json`、日志 `artifacts/studio-video-progress-full-check.log`。服务端成片、云端交付和移动端浏览器仍未接入。

2026-10-16 3D-BOX 入口维护：`StudioLandingPage` 通过 `useContent('shell-config')` 区分 loading、错误和已有配置缓存；配置读取失败时显示“3D-BOX 配置加载失败”和重试，重试只刷新外壳配置，不创建生成任务、项目或账号。定向 2 文件 / 12 项通过；Node24.19.0 完整 `npm run check` 为 **482 文件 / 6619 测试**，证据见 `artifacts/studio-landing-retry-verification.json`。这只覆盖入口配置边界，不提高完整 Studio 工具、真实生成或项目服务的完成声明。

2026-10-16 材质参数控件维护：公开 `object.material.set` 已确认 `baseColor`、`metallic`、`roughness` 和透明度的运行时 mutation 契约；本地 `StudioInspector` 现在将金属度、粗糙度、不透明度、透明材质和深度写入接到既有 `materialPatch`、snapshot history、500ms autosave、刷新恢复和 GLB 场景恢复。真实导入 mesh 与 primitive 均可操作，nodeEdits 只保存可序列化覆盖，不改写源 GLB data URL。定向 2 文件 / 16 项通过；Node24.19.0 完整 `npm run check` 为 **477 文件 / 6611 测试**，格式、零警告 lint、核心 strict 和生产构建通过，Vite 3698 modules、build 12.62s；证据见 `artifacts/studio-material-verification.json`。本批证明本地参数功能和保存边界，原站可见面板逐像素布局、纹理、骨架、动画轨道属性、真机 Safari 和服务端 mutation 仍未验收。

2026-10-18 导入子树副本维护：`StudioInspector` 的创建副本、复制/粘贴现在适用于导入 GLB 的真实 subtree 行；本地 `nodeCopies` 保存稳定 copy ID、sourcePath、名称/变换和局部 edits，runtime 克隆独立 geometry/material 并加入 entities/outliner，删除、撤销/重做、刷新恢复和 GLB 导出沿同一文档边界。源 dataUrl、source path、原始 subtree metadata 和原 GLB animation tracks 不被改写。Studio 域专项 **29 文件 / 143 项通过**，最终完整检查 **495 文件 / 6727 测试**，证据 `artifacts/studio-subtree-copy-verification.json`。导出器可能对非 ASCII 名称做规范化；协作锁、云端同步、纹理/多材质槽、骨架和原始导入轨道属性编辑仍未接入。

2026-10-15 前批根检查（转场实际预览接入前）：`npm run check` 通过 **433 个测试文件／6366 项测试**；三类灯光添加入口（Sun/Point/Spot）保持源契约独立，Studio 定向计数仍以各节记录为准。后续转场操作批次的当前根检查现已完整通过438文件/6408测试及标准构建，取代中间ENOSPC失败状态，见 [当前验证](../../../AGENTS.md#当前工程验证)；该根统计不代表Studio新增功能或全部状态已验收。

2026-10-12按用户授权参考Blender改善渲染与导航，独立证据见 [视口审计](../../../research/studio-blender-viewport-audit.md)。AgX/环境光、实际几何聚焦、橙色选择框与XYZ导航为本批适配；原导入材质/动画/相机/导出协议保留。监视器已修复同AgX输出及俯视近端裁切；不是新增原站账号证据或完整Blender工具，方向视图仍为透视。

## 公开源码依据

- `research/source/0wsgf7e09dh0-.js` 为公开 animation-preview renderer，SHA-256 `16c8f1d2881da8f02420a1a961cc9aea44f6e78e3198f8bdcddb5a1175bb1847`。本批仅读取，不执行原站 bundle。
- GLB parse 回调保留 `e.animations`，创建 `AnimationMixer`，对所有片段 `reset/play`，取最长片段时长，初始选择全部。轨道为 `clip-{index}`，显示 name、start=0、end=duration；点击选单片段，再点同片段恢复全部，重置 time=0 并播放。
- 源函数 `ea2` 的拖动/定位使用每个 action 的 `time=Math.min(time,duration)`、LoopOnce、clampWhenFinished，并 `mixer.update(0)`。普通时间轴的播放/暂停、速度/循环既有流程共用同一时间；不是独立视频播放器或静态预览。
- GLB export 的 `parseAsync` 明确传入 `animations`、`binary:true`、`onlyVisible:false`；未选中和隐藏模型的片段不能因当前预览模式而丢失。
- `research/source/06c9io3bmeth-.js` 的 `createPreviewGLTFLoader` 设置 Draco 路径 `/assets/animation-preview/draco/` 和 `MeshoptDecoder`；SHA-256 `933ad25b865d411e520d9643bba028029c7995282b7a4187857c84c3b4d91073`。未发现该 loader 配置 KTX2。
- 原站 locale 的 `nothingMoves` 为“暂无动画 — 添加机位运镜、角色动画，或加载带动画的 GLB。”证明带动画 GLB 是实际功能，不应按静态几何处理。

## 本批完成

- `glb.js` 保留原 `scene` 返回契约并挂载真实 `gltf.animations`；原始 GLB data URL 继续作为持久化来源，元数据 `clips` 只保存名称、索引、时长，不取代真实关键帧。
- `gltf-loader.js` 只在 Draco extension 存在时懒加载已安装 Three 的官方 decoder；JS/wasm 使用 Vite asset URL，不依赖原站目录或 CDN。Meshopt 使用同一 Three 发行包的官方 decoder。每次 parse 拥有独立 loader，finally 释放 Draco workers 和 blob URL。取消不等待解码结束；不受取消影响的迟到成功 scene 会释放几何、材质、纹理。
- `imported-animations.js` 拥有每个导入 scene 的 mixer/actions，与编辑器顶层 position/rotation/scale 包装分离。现有时间轴播放、暂停、速率、循环和拖动实际改变内部节点动画；切到单片段时其他片段恢复静态绑定值，再点同片段返回全部。
- Timeline 添加真实片段轨道与按钮；名称为空使用原 `Clip N`。原 Studio 全局 Space 快捷键避让按钮，片段按钮可由 Space/Enter 原生激活。
- 预览时间轴源码 `AV`（公开 bundle 偏移约 **92,789**）将播放速度限制为 `.25/.5/.75/1/1.25/1.5/2`，并提供 `1–4`、步长 `.1` 的时间轴缩放、进度 slider 的 Arrow/Home/End/Shift 步进和 Space 播放切换；本地 `STUDIO_PLAYBACK_RATES` 共享这组稳定值，StudioTimeline 也提供同范围缩放与键盘进度控制。它仍是本地播放/视图状态，不写入原站服务。
- GLB export 携带全部原片段，UUID 绑定避免两个导入文件有相同 node name 时轨道错误绑定第一个模型。按原 `onlyVisible:false` 导出隐藏几何；glTF 标准不编码运行时 `Object3D.visible`，不宣称隐藏状态能通过普通 GLB 保留。
- 本地 Studio 文档新增可选 `time/animationSelection`，旧文档默认 0/全部；有效游标和选择在刷新后恢复，保持暂停。它是本地演示恢复协议，不声称实现原站项目服务器字段。配额失败保留 pending、原 GLB 与旧已保存版本，允许后续重试。项目 ID gate、500ms 合并、pagehide/unmount flush、导入 route abort 和删除 pending 清理沿用原实现。
- 旧文档缺 clips 元数据时，真实 GLTFLoader 恢复后由 runtime 回填。复制对象仍保留原 GLB，而新 runtime 绑定独立 mixer。导出完成再次检查 viewport 生命周期，旧场景迟到结果不能作为新视口导出。

## 验证与夹具

前一批历史结果：`npx vitest run src/features/studio`：**9 文件 / 39 项通过**。域 ESLint 零警告、Prettier 检查通过。测试包含真实 Three GLTFLoader/AnimationMixer/GLTFExporter，不将 mock WebGL 视图等同于真实浏览器 GPU 验收。

- 合成 GLB：`fixtures/animated-glb.js`；两个橙/蓝三角形，Slide=2秒、Grow=4秒。验证前后拖动、端点 clamp、单片段/全部/停用、dispose、同名双模型导出后各自绑定。浏览器文件在 ignored `artifacts/studio-animated-fixture.glb`（1,656 bytes）。
- Meshopt：实际 `EXT_meshopt_compression` index buffer 解码，MIT 测试字节来自官方 `zeux/meshoptimizer/js/meshopt_decoder.test.js`。仅下载这一小型公开测试证据，原文件在 `research/source/meshopt_decoder.test.js`，SHA-256 `70488d804844802804fc8d4eb302779ea392f746f97df654cc2fabe0ca72c6ac`。
- Draco：官方 Cesium Box glTF-Draco（CC BY 4.0），`fixtures/draco-box.glb`；Node worker 桥接仅替代浏览器 Worker 外壳，实际 Three 官方 JS decoder 执行，确认24 vertices/36 indices及worker terminate。浏览器文件为 ignored `artifacts/studio-draco-box.glb`（1,388 bytes），默认 wasm 路径仍须 Root 浏览器验收。
- 真实 StudioEditor 集成回归验证片段选择/回全部、RAF 时间、暂停、鼠标拖动、原生 Space、卸载保存及刷新后暂停恢复；已有转画布 quota 回归保留。另验证保存游标/选择时失败不覆盖旧记录、decoder 失败/立即取消/迟到 scene 清理与 export 迟到隔离。

## 剩余边界

- `.glb` 上限仍100MB；独立外部 buffer/texture URI 明确拒绝并保留场景。原 parse base 是空字符串，未找到本地多文件选择/路径关联协议，不擅自创造依赖上传产品。`data:`/内嵌资源按既有 loader 支持。
- KTX2/Basis、所有未知 glTF extensions 的兼容矩阵及真实移动端 GPU/wasm/worker行为尚未完整验收。Draco 数据、Meshopt 数据经解码再导出的 GLB 为普通未压缩输出，不声称重新压缩。
- 当前手动顶层 transform keyframes 未转换为新的 GLTF AnimationClip；保留并导出的是原导入 clips。经下批源码复核，原 exporter 也未把通用 wrapper transform 帧数组转换成轨道，不能将自行添加的转换称为原功能。源 camera shots/paths、角色专用动画、director 服务、视频编码等完整分支仍另需核对和实现，不能把本批称为完整 animation-preview。
- 真实账号、项目服务、生成、跨设备分享均未接；现有本地账号占位/身份 props 不构成真实授权。

## 第三方来源

依赖版本为当前安装 Three **0.186.1**（未新增包）；其随附 Meshopt 与 Draco decoder 保留独立许可，见 `licenses/`。Draco Box 来自 [Khronos glTF-Sample-Models / Cesium](https://github.com/KhronosGroup/glTF-Sample-Models/tree/master/2.0/Box)，仅将外部 Box.bin 合并为 GLB 容器，几何未改，完整 CC BY 4.0 文本及作者归属已保存。原始两文件分别在 `research/source/studio-draco-box.gltf` / `.bin`，SHA-256 为 `3c46acecdfa90b012ec9052d8a1dfa61358e6d56a9e333504189cc78a2de4d1b` / `610dc6e08aba7c2720c8e4ec0578efd91cf2d88a5e638dab7811a22f0235bf2e`。

## 本批：原站导出边界与真实场景子树

同一公开 bundle（SHA 如上）有以下可复核依据，偏移为 UTF-8 JavaScript 字符位置，仅读取源码，没有登录或触发原站写操作：

- `nt.current=async`，偏移 **987582**：先等待编辑 flush，以 `e.animations` 为基础，补 cameraPaths bake 轨道及 character clips，再调用 GLTFExporter。仅找到 camera path bake/restore 两处 VectorKeyframeTrack / QuaternionKeyframeTrack 构造，没有通用 wrapper 帧数组→AnimationClip 的转换。
- `erH/erK`，偏移 **807080 / 807380**：`blockingStudioTimeline` extras 是 `{version:1,duration,shots}`；shots 保留 cameraId/start/end，不是任意实体的 transform 动画轨道。
- `ead`，偏移 **1015915**：对象树搜索匹配 label/kind 并保留祖先；搜索暂时忽略折叠。ArrowUp/Down、Home/End、Left/Right、Alt 整棵子树折叠/展开、H 隐藏都属于实际原组件行为。
- `eiH/eap`，偏移 **855647 / 1022317**：按前序 depth 计算 parent/child/descendant 数与隐藏祖先，tree/treeitem、aria-level/selected/expanded、roving tabIndex；被祖先隐藏的子节点按钮定位隐藏上级。
- `eiD`，偏移 **852899**：名称在 blur/Enter 提交、Escape 取消、IME 避让、1–128 字符；错误保留输入和焦点。`r_` 的 PropertyBinding.sanitizeNodeName 校验位于 **969270** 附近，禁止方括号、句点、冒号、斜杠，并以空白转下划线后的 binding name 检查全场景唯一。
- `rI/rA/rN`：编辑真实 Object3D 的 visible / position / rotation / scale 并记录 undo/redo。当前局部实现据此补齐静态子节点编辑，没有创造额外子节点动画协议。

### 完成的接线及数据边界

- `outliner/model.js` 只处理可序列化描述与操作；`outliner/StudioOutliner.jsx` 实际提供上述搜索、键盘、折叠、计数、隐藏与改名交互。`StudioInspector` 与 `StudioEditor` 接入真实子节点 selection、属性和 undo/redo。全局快捷键尊重树已消费的键与 IME；子节点不误触顶层复制、删除或 wrapper 加帧。
- `outliner/scene-tree.js` 从实际加载完成的 GLB Object3D 层级提取描述；`viewport-entities` 的 runtime Map 持有所有真实内部节点。点击网格命中实际子节点，focus 以 world position 定位，gizmo 提交按所属子节点处理。迟到/删除/卸载仍由原 entity controller 生命周期清理；不会把旧 parse 结果挂到新文档。
- 本地文档的 `subtree` 是源 GLB 节点前序描述，`nodeEdits` 按原 GLB 的 child-index path 保存 name/visible/static transform；Three UUID 与对象引用只在 runtime。路径只对同一源 GLB 有效，不是项目服务器字段或可跨资源合并的协议。旧文档无 `subtree` 时真实 loader 回填；undo 无 override 时恢复源 GLB 静态值。
- 导入 AnimationClip 在 mixer 建立时绑定原目标 UUID，改名后播放和 GLB 导出仍绑定原节点；保留原 clips，不重新生成关键帧。原始 GLB AnimationClip 轨道的 transform 分量继续禁用 Inspector/gizmo 编辑；本地 `frames` 创建的关键帧现在可在当前时间编辑并只更新命中的 keyframe，其余时间保持锁定。本地 nodeEdits 不篡改源 GLB data URL。
- 实际 GLTFExporter 回读可确认改名/静态 transform/全部导入 clips。`onlyVisible:false` 仍导出隐藏几何；运行时 visible 仅由本地文档恢复，标准 GLB 不编码这个属性。
- 子树批次当时保留了 <=760px 隐藏整个 Inspector 及其开关的边界；该历史限制已由文末窄屏属性批次解除。原站手机 Studio 的全部视觉仍未核实，不能把局部可用当作完整移动编辑器验收。

### 本批回归与浏览器夹具

当前 `npx vitest run src/features/studio`：**28 文件 / 136 项通过**；域 ESLint 零警告、Prettier 检查通过。新增实际 userEvent 树操作、名称错误/取消/IME、祖先隐藏；实际 Three 嵌套 GLB ownership、动画改名持续播放、静态编辑/撤回/JSON 恢复、GLB 导出回读与迟到加载隔离；完整 StudioEditor 配额失败保留旧存储和内存修改、重试、undo/redo、刷新恢复以及 `.75x/1.25x` 速率选项、实际步进和时间轴缩放回归。

`fixtures/animated-glb.js` 的 `createNestedAnimatedGlb()` 是 **1,784 bytes** 的合成公开测试夹具，实际 GLTFLoader 已确认嵌套节点与 Slide/Grow 两片段。ignored 浏览器文件绝对路径：`/Users/pencil/Documents/ChatGPT/LibTV/artifacts/studio-subtree-fixture.glb`。在现有本地 `artifacts/functional-qa.html?mode=studio&projectId=studio-subtree-qa`（adapter 演示身份，无真实账号）通过“导入 GLB”选择文件，展开文件根节点：

```text
studio-subtree-fixture.glb
└─ Assembly
   ├─ MovingTriangle     （Slide 控制 position）
   │  └─ Detail          （静态节点）
   └─ GrowingTriangle    （Grow 控制 scale）
```

建议真实浏览器动作：Arrow/Alt 折叠与搜索 Detail；选择 Assembly 用 H 隐藏，Detail 的眼睛定位隐藏上级，再 H 恢复；将 Detail 改名 `EditedDetail`、位置 X 改为 0.8 后刷新确认；MovingTriangle 改名后播放 Slide 确认仍运动；导出 GLB 再导入确认 EditedDetail 名称/静态位置与两个 clips。保存 visible 的恢复应检验本地刷新，不能以 GLB 再导入声称 visible 保留。

仍未实现 camera trajectory/easing/shot 专用关键帧、导入动画轨道属性编辑、纹理/完整材质槽和骨架变换产品分支；子节点副本已接本地 copy 协议，但不等于原站服务器实体或协作同步。材质基础参数的本地 Inspector 已接，但不等于原站可见面板逐像素一致。真实存储/生成/director/视频服务未接，本批无账号或写服务依赖。

2026-10-15，本地 Studio 已接入源 `entity.delete` 语义：选中的导入 GLB 子节点及其后代可从实时场景树删除，序列化为稳定 path 的 `nodeEdits[path].deleted` tombstone。撤销或清除 tombstone 会按原 parent/index 重新挂回同一 Three 对象；导出同时过滤已脱离节点的动画轨道。该协议是本地可逆演示字段，不伪造原站服务器 mutation log。

2026-10-18，子节点副本使用独立 `nodeCopies` 而不是写回源 `nodeEdits`：创建副本只保存 sourcePath 与可编辑 copy metadata，runtime 对源 Object3D 做独立 geometry/material clone，子树行得到 copy ID，删除副本只移除 copy，不影响源节点。该协议已由 `scene-tree.test.js`、Outliner model 和 `StudioEditor.test.jsx` 覆盖；不能扩展为服务器实体、协作复制或原始 GLB track 改写。

### Root 实际浏览器验收

2026-10-11，桌面1280×720，实际导入上述1784B GLB。第四层 Detail 改名 `EditedDetail`、位置X=.8，用H隐藏后刷新；名称、X=.8及“显示 EditedDetail”状态保留。恢复子节点后隐藏Assembly，子节点眼睛显示“选择隐藏的上级 Assembly”，点击选中Assembly。显示父级、将MovingTriangle改名 `AnimatedMover`，实际播放时间推进，暂停于.96s；截图可见蓝 / 橙实际几何及原Slide/Grow。

通过真实导出菜单下载 **2620B GLB**，解析确认 `EditedDetail.translation=[0.8,0,0.5]`，Slide translation channel目标为AnimatedMover，Grow scale channel目标为GrowingTriangle。两原clips均保留；文件 `artifacts/studio-browser-subtree-export.glb`，截图 `artifacts/studio-subtree-edit-proof.jpg`。这次核验是实际导出文件回读，没有额外声称已浏览器再导入。visible不编码，隐藏只验证本地刷新。

390×844页面宽390、无横向溢出，但两个属性侧栏仍为display:none，手机子节点编辑不可用，不能称移动Studio完成。新验收标签无console error /warn，未使用原站账号。统一 `npm run check` **135文件 /691测试**及格式、零警告lint、核心strict TypeScript、生产构建通过；strict不涵盖全JSX，也不等同于所有GPU或全部原站工具验收。

## Camera paths / easing / shots 接线（2026-10-11，本批）

### 源契约

本批继续依据同一公开 `research/source/0wsgf7e09dh0-.js`（SHA-256 `16c8f1d2881da8f02420a1a961cc9aea44f6e78e3198f8bdcddb5a1175bb1847`）。ignored `artifacts/studio-source-formatted.js` 只供定位，未运行原 bundle；以下函数可在原归档直接检索。

- `eoW / eoK / eo1 / eo2 / eo3`：`blockingStudioPathFor` 将 path group 关联到 camera name；`blockingStudioPath` 保存 enabled、curve、tension、closed、aim、targetName、duration、easing、bounce、roll、presetId、intensity、framing、speed。child 使用 `blockingStudioWaypoint` / `blockingStudioWaypointIndex`，另有 Aim / Focus / Anchor extras。路径通过真实世界坐标 `CatmullRomCurve3.getPointAt` 按弧长求值；orientation 为 lookAt + roll 或 fixed，世界姿态转换到 camera 的父级空间。live analytic path 保持原 loop/bounce/easing；已有原相机轨道时优先原轨道。
- `eaO / _I / eox / eow / eoS`：底层存在18个轨迹生成器，但本 renderer 的可见面板**只展示6个**：Arc、Push in、Truck、Crane、Flyover、Reveal。没有将未展示的12个生成器添加为产品选项。`PE` 的6个 easing 卡片实际仅映射 linear / in / out / inout；ease、ease-in-out、smooth 均为 inout，原 active 表现归到 ease-in-out，不能误称6个独立数学曲线。
- `rK / r1 / r2 / r5 / eiK`：状态时间为 span × index / (count−1)，不是弧长点对应时间的反解。原 static shot 建两个重合状态，disabled + fixed + linear；添加按 seek 位置插入并使用当时真实相机位置，删除至少保留2个。片段时长最小 .1s；FOV 10–150°；position 编辑选中 waypoint 或 path group，rotation 编辑真实 camera 且仅 fixed aim 可用。本批遵循此分工，未将 position 输入伪接到通用 wrapper 帧。
- `eo4 / eo8 / eo9 / rp`：仅相机 position / quaternion 被烘焙。30fps，时长上限600s，最多2000样本；speed=0保持起点，负 speed 反向，bounce 计双向 span，quaternion 保持相邻符号连续。替换时剥离该 camera 的旧 transform tracks，保留同 clip 的其他 tracks。已编辑的 disabled path 仍会产生相机专用 clip；没有据此烘焙普通模型的 wrapper frames。
- `eaX / eae`：原 camera clip 无 path extras 时，从 position interpolant 恢复路径；采样数按源 track 点数限定2–120，姿态轨道推导平均焦点，RDP 简化至最多12点。生成 disabled、linear、target 的可编辑 rig，**保留原 clip**，直到真实编辑才替换。重复读取使用稳定本地 entity IDs，不能重复生成不同 rig 或打开面板即覆写原动画。
- `erB / erH / erU / erK / eib / eiI / eiA`：timeline extras 为 `blockingStudioTimeline` 的 JSON string，version=1、duration 0–600、shots≤256且按时间不交叠、有效 stable camera IDs。相机 marker / clip spans 可推导 shot；同起点的 camera spans 均分到下一个 shot start。按 time 选最新起点区间；空隙保留最近已开始的 camera。序列导出使用 `hf_id`，回读再映射本地 IDs；不保存 Three runtime UUID 为项目键。
- 非 workspace 的原 Timeline 有 trim：最小片段 .1s，连续边界拖动会共同调整相邻 shot，间隙不制造交叠。**原 workspace 外层**只传 seek/selection，没有 trim callback。本地现有 editor 将同一已证实的非 workspace trim 能力接到镜头轨道；不宣称两种原 chrome 布局都一致。`eal` 的 camera 预演为居中、拟合后的80%画幅；`libtvProjectAspect` / `blockingStudioAspect` 为源画幅 extras。

### 模块与行为

- `camera/model.js` / `presets.js`：纯数据规则、6个可见预设、状态/shot/trim 校验；`scene.js` / `restore.js`：真实 Three 求值、父级转换、相机 clip 烘焙、source extras 读取/编码、原 camera clip 的可编辑路径恢复；`presentation.js`：现有 outliner 行转换；`runtime.js`：借用/新建 rig 节点、独立 mixer、camera/waypoint helpers、原 clip 优先级与释放。helpers 在 editable content 外，不能被 GLB 导出为模型几何。
- `useStudioCameras` 管理编辑选择、preset/state/settings 修改与 history；`CameraMotionPanel` 为片段/关键帧/过渡视图，实际修改源路径字段，提供 FOV、lookAt、fixed rotation、位置、状态新增/最少两点删除。`I` 与面板按钮共用真实新增；面板关闭后恢复机位入口焦点。选其他对象恢复其原 Inspector。
- `CameraShotTrack` 连接真实相机选择与主 viewport 的 film 模式；播放/暂停、时间轴 seek、速度、循环仍共用既有 playback。拖动一手势只记录一次历史；键盘 Arrow 每次 .1s，连续镜头边界联动。成片预演取 source shot camera，场景调度返回 orbit；相机预演隐藏 path/gizmo helpers，不允许点击未渲染的 helper。
- 真实 PerspectiveCamera 取代旧 camera 占位 geometry；camera helpers 独立显示于场景视图。画幅菜单影响真实 camera projection、source project/aspect extras 和拟合画幅，截图捕获同一 renderFrame，而非单独渲染旧 orbit camera。
- 文档新增可选 `cameraPaths / cameraTimeline / viewMode`；旧文档默认无 rig/timeline、orbit。它们是**本地前端恢复字段**，不是原项目写服务 API。rig 保留 source transforms/settings/stable IDs，同时有本地 bake/fixedRotation/sourceOwnerId 状态；history 包含这些状态与总时长。原 GLB data URL、导入 clips 和 nodeEdits 保留。配额失败继续保留 pending 与内存编辑，允许后续重试，项目 ID gate / unmount/pagehide flush 沿用已有回归。
- GLB 导出保留全部原动画，按 source camera-only 替换编辑过的相机轨道，携带 path/anchor/waypoint/aim/focus 与 timeline/project/aspect extras；回读后 ID 转换、原 Slide/Grow、节点静态修改和新相机 clips 均已用实际 Three 验证。不会将 generic objects/frames 变成 GLB animation。

### 定向验证与 browser fixture

本批定向结果：`npx vitest run src/features/studio` **14 文件 / 63 项通过**；`npx eslint src/features/studio --max-warnings=0` 零警告；`npx prettier --check src/features/studio` 通过。未运行全站检查或将 mocked GPU 等同浏览器验收。

新增 source 模型回归覆盖6 preset geometry、quadratic easing/loop/bounce、state insertion/minimum/rename target、并行 shots/gap/cut、trim、timeline envelope、80% frame。真实 Three 覆盖 camera seek/target orientation/父级、reverse speed/30fps/2000上限/sign continuity、borrowed rig restore/aliases/helper disposal、原 camera clip 优先及编辑后仅替换其 tracks、无 path extras 时恢复 editable states、实际 GLTFExporter/GLTFLoader 回读稳定 IDs/两个相机 clips/Slide/Grow/nodeEdits。StudioEditor userEvent 回归覆盖 preset/easing/duration/FOV/fixed rotation、seek/state position/I 增加/minimum 删除、undo/redo、其他对象切换/回焦点、shot 键盘与拖动边界、配额失败重试、paused refresh。

夹具源码 `fixtures/camera-glb.js` 为 source-shaped synthetic 数据，不是原站作品。ignored browser 文件绝对路径 **`/Users/pencil/Documents/ChatGPT/LibTV/artifacts/studio-camera-fixture.glb`（4,556 bytes）**。在 Root adapter `artifacts/functional-qa.html?mode=studio&projectId=studio-camera-qa` 导入，包含 QA_Arc / QA_Truck 两个真实机位、Path_QA_Arc / Path_QA_Truck（三个 WP + Aim/Focus）、原 Slide/Grow 和 source timeline 0–3 / 3–6。点“镜头 1 QA_Arc”打开动画设置并真实 camera view；选择“横移”，编辑片段时长/状态2位置/缓动，拖第1终点或 ArrowRight 验证第2起点联动；播放/暂停跨3s确认换机位；刷新保持文档，GLB 导出回读应有 camera clip 与 stable timeline/path extras。Root 负责实际 desktop GPU / 390px 验收。

### 明确边界

- 本批相机操作不连接 director、场景 mutation ledger、账号权限、项目写服务或视频导出服务；不伪造协作 sequence、服务成功或支付/生成完成。
- 既有监视器卡片仍为占位 thumbnail，未做原离屏批量 monitor frame renderer；本批完成的是主 viewport 的真实机位/成片预演，不以卡片图标声称监视器缩略图完成。
- 普通模型的导入 animation tracks 属性编辑、纹理/完整材质槽/骨架仍为既有未完成分支；本地 transform keyframe 的当前时间编辑已接入，不能扩展为原始 GLB track 改写。子节点删除和本地子树副本已按上方协议接入，但不代表协作实体复制。source Shift+Arrow 状态快捷键、C / workspace 数字快捷键以及其它未接的 chrome 分支保留后续核对；桌面 PIP 浮动预览和桌面 WebM 导出已接入，不以它们覆盖这些仍缺的 Studio 工具。
- camera 数据测试覆盖一个含两机位的真实 GLB 与同 scene 原 clips；同名且同 `hf_id` 的多个 camera GLB 合并/复制还需单独核对源 name/ID 去重契约，本批未声称完成此边界。
- scene/root marker extras 的 source 分支已支持；asset-level marker extras 没有通过当前 loader 公布，不能声称完整覆盖所有 WEBGI / asset marker 来源。
- <=760px 既有 CSS 仍隐藏 Inspector；本批不新增未经源核实的手机抽屉，390px 没有相机属性编辑的完整体验。标准 GLB 不编码 Object3D.visible，仍只由本地文档恢复隐藏状态。

## 视口结构收敛（2026-10-11）

本轮按用户的工程结构优化要求进行域内提取，没有新增产品功能、采集内容、改写原 source 规则或使用账号。两项主要维护风险：

1. `useViewportScene` 原先在一个 effect 内同时管理 WebGL/controls/RAF/观察器/拾取生命周期和 clip → wrapper → camera 求值、film scissor 渲染。修改相机渲染时容易连带改变资源创建/释放；截图若另写一套渲染，也容易使用旧机位或不同画幅。
2. `StudioEditor` 713 行仍同时协调 history/document、对象和相机动作、导入结果、片段选择、截图/GLB/转画布及 UI。对象、frames、cameraPaths、cameraTimeline 和 duration 是一组相互关联的文档状态，多个动作分别写这些字段，继续加功能容易遗漏 history 或导入后的关联更新。后续可将同步 scene actions 与异步 export actions 分别提为 Studio 私有 hooks，显式接收当前文档、history record 和 viewport；不应为缩短页面把 Studio-private 数据放进共享 services。

本轮只实施第一项中的低风险结构提取：

- `hooks/useViewportScene.js` 从 **273 行降为199行**。仍是 renderer、scene、OrbitControls/TransformControls、entity/camera controllers、RAF、ResizeObserver、pointer listeners 与资源销毁的唯一 owner。异步 entity 回调继续通过 `runtime.current === rt` 门控；cleanup 次序保持不变。
- 新增 `viewport-frame.js` **90行**，入口 `renderViewportFrame(runtime, data)`。函数只借用 live runtime 与最新文档快照，不创建 renderer/controller、注册监听器、调度 RAF 或释放资源。保持导入 clip → wrapper transforms（dragging 时跳过）→ camera path 的求值顺序、源画幅/aspect extras、film helper/scissor 与 finally 恢复规则。
- `rt.renderFrame` 仍由 owner hook 绑定，读取 `latest.current`；RAF 和 `viewport-commands.capture()` 复用它。`StudioViewport` props/ref 和 `createViewportCommands` 的公共方法保持不变；增加的 axes/helper 仅为 runtime 内部借用字段，不进入文档、GLB 或跨域协议。
- 依赖仍为 Studio 私有 frame → Studio model/camera model/scene-resources + Three。没有增加跨域 private import、共享白名单或第二套 persistence/export；转画布仍只通过已登记 `canvas/document-api.js`，既有 Canvas chrome CSS 依赖未在本轮改动。

新增 `viewport-frame.test.js` 的4项回归使用真实 Three Object3D/AnimationMixer 和模拟 renderer，检查求值顺序、clip/手动 frame 共存、film/aspect/scissor、dragging 与 render throw 后恢复。`hooks/useViewportScene.test.jsx` 实际运行 hook，并验证 React 根 StrictMode effect replay、capture 最新文档机位/画幅、RAF 不因 capture 多开、控制器/观察器/指针监听器/几何/renderer 在卸载释放且 runtime 清空。GPU 输出仍需浏览器验收，mock renderer 不代表真实 WebGL 画面完成。

定向检查：`npx vitest run src/features/studio` **16文件 /68项通过**；`npx eslint src/features/studio --max-warnings=0` 零警告；域 Prettier 检查通过。本轮没有运行全站 check、修改根文档或扩展 monitor 功能；其余 source 差距仍按上一节保留。

### 工程所有权收尾（2026-10-11）

只读复核发现既有 TransformControls helper 仍挂 scene，会在 controls 自身 dispose 之后再参与 scene sweep。`disposeViewportTransformControls` 先移除借用 helper，再调用 controls owner；不改变视口功能、求值次序或公共协议。真实 Three 回归验证唯一 geometry / 独占 material 单次、scene 自有资源正常释放；共享 material 保留 Three 原策略，仅消除我们的重复清理。根完整检查 166 文件 / 836 测试通过，实际 GPU 编辑 / 离开卸载 / 重新挂载无新增 error / warn；完整证据见 research/verification-history.md，未扩展 monitor 或其他功能。

## 当前实际监视器（2026-10-11）

原 bundle 的 Ab（字符80449）、ese 和 elF（字符1074302）确认单一俯视 / 3D卡、真实相机单击选择 / 双击进入 / 定位 / 退出和24fps。此前 monitor placeholder 的记录属于历史范围，当前已接真实 scene 缩略图。

monitor 规则 / 相机投影 / 离屏 capture / runtime 与 React 可见性 hook / view 独立。useViewportScene 在 runtime 建立后创建 controller，既有 RAF 求值后 tick；每帧最多两可见卡、500ms签名、活动相机24fps。没有第二 renderer 或独立 RAF。capture 独占单一 target / readback / canvas，finally 恢复 renderer 状态和 helper；DPR及 linear→display RGB 已修正。禁用 / 卸载释放自有资源、切 scene 隔离旧帧，不能释放借用 scene / camera。

真实 App 无需登录直接恢复4556B GLB 的两机位，三个430×242缩略图有真实 GPU 几何；单击 orbit、双击 camera、退出 top、返回旧3D以及播放 / 收起重开通过。最后新标签无 error / warn；不将早期 QA 播放日志或模拟 renderer 外推为全环境通过。当前手机 Inspector / PIP快捷键 / 角色动画 / 视频导出等边界保留。具体证据、色彩回归及截图见 [Root 功能审计](../../../research/generator-script-monitor-functional-audit.md)。

## 窄屏项目资产与属性入口（2026-10-11）

公开 renderer `research/source/0wsgf7e09dh0-.js` 的 rightOpened 条件 `!n&&!ed&&$` 位于 UTF-8 offset **1104509**，传入值位于 **1105970**。条件来自只读、当前模式和本地右侧开关，没有 viewport 宽度门槛。`research/source/studio-exact.css`（SHA-256 `183d2f2eb859c6d8236f1dfd2f8938fcde72cf080de049c8b64f2c78fca10e9d`）唯一 media 规则在 offset **17440**，max-width1000 只调整 header/saveState/debugPanel；右侧 panel 由 data-preview-right-open 控制。归档只读，没有执行原 bundle。

本地 `studio.css` 去掉 <=760 对 Inspector 和开关的隐藏，面板采用 min(240px,100vw−32px)，位于 composer 上方、编辑器 header 下方；`StudioInspector` 提供“项目资产”可访问名称。窄屏面板覆盖视口、保持原属性编辑/持久化/controller，属于本机响应式适配，不是声称原站手机逐像素已核实。

实际无登录运行路由 `/animation-preview?projectId=studio-camera-qa`，390×844：打开项目资产、选择真实导入 GLB 的 GrowingTriangle，将位置 X 从0改为0.35；收起/展开正常，刷新后重新选择显示0.35，片段控制的缩放仍禁用。属性面板 x150/width240/right390、top48/bottom674，页面 scrollWidth=390；修正面板被 composer 遮挡后可点击全部静态属性。证据 `artifacts/studio-properties-mobile-proof.jpg`。本批验证入口、静态属性和刷新恢复，不代替全部机位/PIP/GPU像素/移动监视器验收。整批检查记录见根验证历史。

## 导入网格子节点删除（2026-10-15，本批）

源编辑器提供对选中导入网格子节点的删除操作；本地实现采用可逆 tombstone，而不改写原始 GLB data URL。`nodeEdits[path].deleted` 会隐藏选中节点及其完整后代，保留稳定 path、父级和动画绑定；撤销、重做、刷新恢复与再次导出都使用同一源层级。导出时过滤已 detached 节点对应的 animation tracks，恢复后重新挂回原 parent/index，避免动画目标或兄弟节点错位。

`StudioEditor` 的“删除子节点”只对真实 subtree 行开放，确认后选中父级；`StudioOutliner` 不把墓碑节点显示为可操作行，父级删除仍是独立 root object 删除协议。子节点副本使用独立 copy 行和 runtime resources；定向 Studio 回归覆盖 model、scene-tree、StudioEditor 和 GLB 导出回读；纹理/多材质槽、骨架和轨道属性仍未接入。

## 导入网格的材质颜色编辑（2026-10-15，本批）

公开 renderer `research/source/0wsgf7e09dh0-.js` 的对象 mutation 分支 `object.material.set`（UTF-8 offset **943499**）以 `baseColor`、`metallic`、`roughness` 和透明度更新真实 `MeshStandardMaterial`；可见属性面板在 offset **1008470** 只展示已核实的 Color 输入，并通过同一 material mutation 记录写入。该证据不支持把未展示的 metallic/roughness 控件冒充为已完成。

本地 Studio 现在为真实导入 mesh 子节点和原有 primitive 显示颜色及基础材质参数控件：`scene-tree.js` 在来源快照中记录首个材质的 sRGB 十六进制颜色和 numeric material fields，`nodeEdits[path]` 作为稳定本地覆盖；`StudioInspector` 的颜色、金属度、粗糙度、不透明度、透明和深度写入沿用一次历史边界，撤销/重做和 500ms 自动保存共用现有文档协议。`viewport-entities.js` 先恢复来源材质再应用节点覆盖，确保切换项目、撤销和 GLB 重新载入不会把参数泄漏到其它节点；GLB data URL 不被改写。纹理、多材质槽、骨架和动画轨道属性仍保持明确未接入。

定向证据：真实 Three 嵌套 GLB 回归确认 GrowingTriangle 的材质颜色/参数覆盖与来源恢复；StudioEditor userEvent 回归确认材质控件、nodeEdits 持久化、单次 undo/redo 与刷新恢复；本批定向 **2 文件 / 16 项通过**，此前材质/Three 联合范围保留 **4 文件 / 25 项**，完整 Studio 域回归 **28 文件 / 136 项**，目标文件 ESLint 零警告、Prettier 通过。尚未以此结果替代根全量检查或真实 GPU / 移动端材质验收。

## 本批：灯光属性与类型（2026-10-15）

公开 renderer 的添加菜单（UTF-8 offset **1029779**）明确提供 Sun light、Point light、Spot light；`elC`（offset **1068360**）的 `light.properties.set` 将 color、intensity、castShadow、range，以及 Spot 的 outerConeAngle/innerConeAngle 应用到真实 Three Light。本地此前只有固定 PointLight 和颜色入口。

本地 `light` 实体保留稳定 `lightType`（`directional` / `point` / `spot`）、`intensity`、`range`、Spot `angle` / `penumbra` 和 `castShadow` 字段。Inspector 提供类型、强度、范围、锥角、半影和阴影开关；修改走现有本地 snapshot history 与自动保存协议，导入 GLB 的真实 light 节点也从 source metadata 读取并恢复这些属性。Three runtime 会更新同一 Light 对象，不重建 marker、不改写 GLB data URL；非法数值按运行时边界拒绝或限幅。

定向测试 `viewport-primitives.test.js`、`model.test.js`、`scene-tree.test.js` 和 `viewport-entities.test.js` 共 **4 文件 / 20 项通过**；目标文件 ESLint 零警告、Prettier 通过。该批只覆盖本地前端状态、Three 属性和刷新恢复，未声称云端灯光 mutation、完整 source add menu 视觉或移动端逐像素一致。完整材质 metallic/roughness、纹理、骨架和动画轨道属性仍未接入。

## Studio 键盘工作区与镜头状态导航（2026-10-15，本批）

公开 renderer 在 UTF-8 offset **947356** 的 `nW` 键盘分派明确提供 `Shift+ArrowRight/Left` 的 `next-state/previous-state`、`1/2/3` 的工作区切换、`C` 的相机视图、`I` 的新增状态以及 `Shift+A` 的添加菜单。本地此前已有 `I`、播放、工具键和轴向视图，但遗漏了这些跨编辑器状态的快捷入口。

本地 `useStudioKeyboard` 现接入已存在的 compose/animation 工作区、添加菜单、当前选中相机视图以及 `useStudioCameras.stepState`。状态导航沿 active rig 的稳定 waypoint 时间排序，越过首尾时夹在边界，不修改 GLB 或调用服务；没有 plan 工作区的本地 UI，因此 `3` 仍不伪造不存在的页面。相机快捷键只在当前选中真实 camera 时消费，避免在文本控件或普通场景按键上抢焦点。

定向 `useStudioKeyboard` 与 `resolveCameraWaypointStep` 回归 **2 文件 / 15 项通过**，覆盖 Digit1/2、Shift+A、C、输入/修饰键保护以及有/无相机 rig 的状态导航；域内其余行为继续由现有 Studio 回归覆盖。该批仅补本地前端快捷交互，不代表原站 plan 工作区、PIP 浮窗或协作服务已接入。

## Studio 对象复制、粘贴快捷键（2026-10-15，本批）

同一公开 renderer 的键盘分派（UTF-8 offset **948836**）明确将 `⌘/Ctrl+C`、`⌘/Ctrl+V`、`⌘/Ctrl+D` 和 `Shift+D` 分别映射到 copy、paste、duplicate；重复 keydown 只抑制 duplicate，输入框、富文本和已处理事件由当前控件保留。公开对象 mutation 的 `elw`（offset **1067279**）会为可复制实体克隆对象并独立几何/材质，`ry`（offset **961330**）给新实体稳定 ID、唯一名称和横向偏移后追加到编辑根。

本地 Studio 为已选顶层实体接入相同的本地快捷键：copy 只缓存 JSON 快照，paste 每次生成新稳定 ID、唯一“副本”对象并按粘贴次数向 X 轴偏移；duplicate 仍复用同一追加入口，且 `⌘/Ctrl+D` 与 `Shift+D` 均可用。导入 GLB 顶层的 `dataUrl`、clips、nodeEdits 一并保留，复制/粘贴不上传或改写源文件；嵌套 GLB 子节点没有源级独立实体创建 adapter，因此继续保持不可复制，不以普通 JSON clone 冒充子树 clone。copy/paste 成功后写入现有 Studio history，撤销恢复旧对象列表。

定向回归覆盖快捷键 modifier、重复 keydown、无可用本地对象时保留浏览器 copy/paste，以及 StudioEditor 顶层对象实际复制、粘贴偏移和 undo。该能力只改变本地演示状态，不表示原站 clipboard 的跨项目或服务器协作同步已接入。

## Studio 颜色选择器与材质恢复（2026-10-15，本批）

公开 renderer 的 `object.material.set` mutation（UTF-8 offset **943499**）先取 mesh 的首个材质并写入 `baseColor`、`metallic`、`roughness`、`opacity`、`transparent`；可见属性面板只注册 Color 控件（offset **1008470**）。`eaV`（offset **1042235**）与 `ei2` / `ei5`（offset **866060** / **867406**）显示 source 的非模态色盘、HEX/RGB 格式切换、屏幕取色入口、外部点击关闭、Escape 回焦点和提交边界。本批按这些已核实交互接入本地前端，没有把未显示的 metallic/roughness 滑块冒充源 UI。

`studio/material.js` 现在从真实 Three mesh 的首个材质捕获 sRGB `color`、`metallic`、`roughness`、`opacity`、`transparent`、`depthWrite`；`scene-tree.js` 先应用不可变来源快照，再应用 `nodeEdits[path]` 的稳定覆盖。非标准材质按 source mutation 升级为 `MeshStandardMaterial`，保留多材质数组的其它槽位；颜色和 alpha/透明/深度写入不会泄漏到其它实体。撤销、重做、刷新、导出 GLB 都复用同一运行时恢复路径，导出只改变已编辑节点而不改写原始 GLB data URL。原站同样只以首个材质生成 mutation，本地不宣称多材质槽的独立面板编辑已完成。

`StudioColorPicker` 使用 `react-colorful` **5.8.1**（MIT 副本见 `licenses/react-colorful-MIT.txt`），支持点击触发器、HEX 输入、RGB 输入、屏幕取色能力检测、外部点击／滚动关闭、Escape 关闭和触发器回焦点；旧的无弹窗 `<input type=color>` 仍保留为可访问表单值和自动化回退。每次连续拖动只在首次变更建立一条 Studio history 边界，关闭时提交；颜色输入仍受 `#RRGGBB` 校验。

定向验证：`npx vitest run src/features/studio/StudioEditor.test.jsx src/features/studio/outliner/scene-tree.test.js src/features/studio/viewport-primitives.test.js src/features/studio/viewport-entities.test.js` **4 文件 / 25 项通过**；覆盖 RGB 弹窗、Escape 回焦点、首材质 alpha/transparent/depthWrite/metallic/roughness 恢复、Three 运行时更新和历史回退。目标 Studio 文件 ESLint 零警告、Prettier 通过；全站 `npm run check` 需由根任务在本批合并后重新运行。

## Studio 灯光添加菜单（2026-10-15，本批）

公开 renderer 的 `eam` 添加菜单（UTF-8 offset **1028200**）将 Sun light、Point light、Spot light 作为三个独立 `menuitem`，分别调用 `onAddLight("sun"|"point"|"spot")`；这不是仅在属性面板中切换一个通用灯光的视觉别名。此前本地菜单只有一个“灯光”项，创建后才可在 Inspector 改类型。

本地 Studio 添加菜单现直接呈现“平行光 / 点光 / 聚光”三项。点击后一次本地 history 操作创建稳定对象 ID，并把 `lightType` 写入文档；Three runtime 首次创建即使用对应的 DirectionalLight、PointLight 或 SpotLight，随后仍可在属性面板修改强度、范围、锥角、半影和投射阴影。菜单保留 Escape/外部点击关闭和原有保存、撤销协议，不调用真实服务。

定向回归：`StudioEditor.test.jsx` **1 个新增场景测试（该文件 11 项通过）**，确认三个 menuitem 存在、聚光入口直接生成 `lightType: "spot"`；目标目录 ESLint 零警告、Prettier 通过。该批未将菜单的本地创建状态宣称为云端灯光 mutation 或完整移动端逐像素验收。
