# Studio Blender 参考视口维护（2026-10-12）

本批按用户截图反馈改善3D-BOX渲染和导航，保留PenStudio布局、文档、相机与导出协议。Blender是本批用户授权的交互与视觉参考，不将新增行为宣称为LibTV原站逐状态复刻。

## 参考与实现

Blender官方 [视口导航](https://docs.blender.org/manual/en/5.0/editors/3dview/navigate/navigation.html) 描述中键旋转、Shift中键平移和选择/场景聚焦；[方向工具](https://docs.blender.org/manual/en/5.0/editors/3dview/navigate/introduction.html) 描述点击坐标轴切方向。[AgX色彩管理](https://developer.blender.org/docs/release_notes/4.0/color_management/) 提供显示参考。实现使用已安装Three r186的AgXToneMapping、RoomEnvironment、PMREMGenerator、OrbitControls、OutputPass；没有下载HDRI、添加依赖或执行原站写逻辑。

- `viewport-lighting.js` 独占本地128px环境贴图、主光/补光/轮廓光和阴影地面；AgX曝光1，只有主光投影，PCF/radius3。圆柱64分段，球体/角色曲面提高细分；导入材质保留原对象和属性。自有贴图、shadow map、几何/材质单次释放。
- `viewport-input.js` 配置左键选择、中键旋转、Shift中键/右键平移、滚轮缩放、Alt左键旋转。capture先于OrbitControls准备Alt映射，释放/取消/失焦/卸载恢复。导航手势不会穿透为选择；TransformControls释放后的手势标记防止dragging已清除时误选。
- `viewport-navigation.js` 按可见嵌套、骨骼和实例几何世界边界及有效FOV/zoom/aspect取景，排除ground/helper/path。240ms过渡借用现有RAF并尊重reduced-motion，用户导航/进入预演取消。去除35–100固定fog与1000距离限制，避免大尺度导入模型聚焦后消失。
- XYZ指示随真实视口方向转动，提供六向与重复点击同轴反向；方向视图仍是**透视投影**并准确显示“透视”。F/小键盘点聚焦，Home显示全部，Numpad1/3/7及Ctrl反向；NumLock关闭时NumpadDecimal的Delete事件不再误删。原Q/W/E/R映射保留。
- `viewport-selection.js` 的橙色包围边跟随当前子节点/骨骼/动画，不改原材质、不进GLB；隐藏/删除/分离及film/monitor时隐藏，资源复用。
- 监视器普通target会跳过tone mapping，因此使用HalfFloat场景target→官方OutputPass→byte/readback，与主视口共用AgX/曝光/显示编码，不重复CPU sRGB转换。仍是唯一renderer/RAF、每次最多两次scene capture；新转换是全屏输出pass。俯视距离计入半高度以容纳近端面，原median-radius筛选保留。
- `StudioViewNavigation` 显示方向、选择名称与简短操作提示。320px标题与右侧控件保留7px间隔、模式文案不换行、方向轴避开工具栏；桌面/390px仍保留既有布局。

## 验证与证据

第一轮Node24.19.0完整check通过360文件/4803测试、格式、零警告lint/架构、核心strict与生产构建13.33s，但测试期间追加窄屏CSS修正，因此单独保存在 `output/studio-blender-before-mobile-check.log`，不能冒称最终冻结快照。最终检查独立保存 `output/studio-blender-final-check.log`，收尾结果见根验证历史。

最终Node24.19.0 `npm run check` exit0：360文件/4803测试全过，21:55:36开始/146.33s，生产构建11.06s，格式、零警告lint/架构边界和核心strict通过。1096个代码/config文件在检查前后SHA一致，证明文件 `output/studio-blender-source-verification.json`。Node DEP0129提示保留，不称执行日志零警告；测试总数包含同期Canvas与独立影游扩展，不归为Studio专项。完成检查后仅维护文档，文档定向格式复验通过；strict不覆盖全部JSX，CI未远端执行，本机未部署。

新增回归覆盖真实OrbitControls映射/Alt取消/平移；嵌套/骨骼/实例聚焦及相机过渡；原材质保留/灯光释放；隐藏/删除/动画选择反馈；NumLock/文本输入/原生控件Space/IME/modal；AgX输出/曝光/target释放；1m/8m/40m圆柱与旋转缩放模型俯视角点；StrictMode/主RAF/capture/卸载和变换后不误选。

实际App使用本机 `blender-viewport-review` 圆柱和 `blender-import-review` 既有4556B合成GLB，不使用账号。1440×900曲面明暗、选择框、方向按钮、3D重置与真实俯视缩略图可见；390×844/320×740实际scrollWidth分别390/320。320标题left-right=157、right-left=164。截图：`output/playwright/studio-blender-desktop.jpg`、`studio-blender-mobile.jpg`、`studio-blender-320.jpg`。实际GLB导入保留Slide/Grow、QA_Arc/QA_Truck及原层级。

本批Studio专项26文件/118测试通过（21:57:20，11.67s）；实际GLB机位QA_Arc预演无网格/选择框穿透，播放至0.40s后暂停，两原clip/镜头仍显示。新独立标签warn/error为空，证据 `output/playwright/studio-blender-glb-camera.jpg`。窄屏前视图再次点击真实切换后视图；初次方向等待失败来自属性浮层覆盖，关闭浮层后通过，不以force点击掩盖。临时GLB标签关闭，尺寸override重置，圆柱预览标签保留。

初次开发HMR因新输入模块尚未落盘报import error，并在热更新期间出现Three多实例警告；保留失败事实，最终新标签日志单独检查。受控真实OrbitControls事件测试与原生UI动作分开，不将其称为所有原生鼠标/触摸已验。

## 边界

尚无真正正交、组件/网格编辑、完整材质编辑、workbench cavity/AO、路径追踪或全部Blender工具。通用wrapper帧烘焙、视频导出、真实生成/运营写服务、实体手机/Safari、超大模型长期性能继续按Studio原审计保留。没有全量采集、认证接入或部署，不覆盖影游冻结生产。strict只覆盖核心TS，整体原站复刻未完成。
