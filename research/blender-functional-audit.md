# Blender 展示页功能核对（2026-10-11）

范围：公开 `/blender` 展示页。保留安装指南、导演台教程、操作系统识别和插件下载链接；不下载或安装插件，不使用账号，不向原站写入。本轮补齐此前只有 DOM 视频框的展示缺口。

视觉依据是原站的暗色地面、圆角视频屏幕和标题连接线。内容仍为品牌图、说明、下载入口与视频预览，没有新增营销区块。交互依据是阻尼视差、鼠标边缘高光、下载区域悬停或键盘焦点触发的地面扫光，以及标题连接线动画。frontend-skill 的通用建议只用于检查层级、可访问性与 motion，不替代原站构图。

## 证据

- [公开页面](https://www.liblib.tv/blender)：原文案、导航和安装指南入口。
- `research/source/0wua3vabah716.js`：页面 module 515597、场景参数 module 586662、视频兼容性 module 288069。动态入口 module 861829 指向 `2opuuy4ktego1.js`、`2wjaoa0_d7pn7.js`、`3i03pr2trdphv.js`，最终渲染 module 945946。
- `research/source/3i03pr2trdphv.js`：公开展示场景 module 193262。只读取和转写相关参数、几何、shader 与生命周期，不运行原站打包脚本或其遥测。原站组件使用 React Three Fiber/Drei；本地使用已安装 Three 构建同一固定场景，避免引入整个原站运行时。
- `research/source/0tmwl7c9km9aq.css`：标题的分段裁剪、连接线 SVG mask、动画、导航与 fallback 尺寸。映射成 `.blender-*`，没有增加全局样式选择器。
- 原视频、海报、标题与 logo 已有本地样本。新增两张原地面贴图，均为代表性展示素材：`public/assets/blender/SurfaceImperfections003_1K_var1.jpg` 和 `SurfaceImperfections003_1K_Normal.jpg`，分别来自同名 `/assets/blender/` 公开路径（1024×1024 JPEG）。未采集软件包或额外内容。

## 实现对应

| 原站行为                                                                        | 本地实现及证据范围                                                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 背景 `#090a0d`，fog 14–40；ambient 0.4；directional 0.45，位置 `[4,8,6]`        | `scene-runtime.js` 创建同值场景和灯光。                                                                                                                                        |
| fov 42，camera `[0,3.8,11.3]`，lookAtY 3.95；parallax 1.3/1.3，damp 0.075       | `scene-math.js` 逐帧复现 position lerp/lookAt，reduced motion 恢复固定基础机位。                                                                                               |
| 视频比例 1440/810；外壳比例 728.13/708.196 和 418.41/397.963                    | 按透视投影求屏宽，最多迭代三次；标题宽和中心位置随投影更新。外壳 radius .122、depth .08；视频 radius .045、边缘 depth .025。                                                   |
| 地面 MeshReflectorMaterial，mixStrength 1.5、mixBlur 6、mirror .5，blur 400/320 | `reflection.js` 移植固定默认场景的平面反射和 `[0,1,2,2,3]` 五轮 Kawase 模糊；half-float render targets，桌面 512、≤768px 时 256。无需默认未使用的 depthScale/distortion 分支。 |
| 地面 roughness 1、metalness .4、颜色 `#92a2bb`；贴图 repeat 2、normalScale 2    | 使用原粗糙度和 normal 图片，RepeatWrapping、NoColorSpace、anisotropy 8。                                                                                                       |
| 原网格：cell 1、line 1、颜色 `#565a5f`、fadeDistance 28、fadeStrength 1.4       | 原 Grid shader 与 camera 平面投影更新；源 vertex 无限网格扩展行为保留。                                                                                                        |
| 下载区域 pointer/focus 触发扫光                                                 | pointer hover 与区域内键盘 focus 合并；duration 1.4、easeIn/curve 2、far −17/near 12，以及原 width/glow/noise/depth 参数全部保留。离开时 strength 阻尼淡出。                   |
| 视频 NoColorSpace、anisotropy 16、不生成 mipmaps、LinearFilter                  | `preview-video.js` 仅 loadeddata 后启用纹理；muted/defaultMuted/playsInline/preload；autoplay 拒绝不冒充成功。                                                                 |
| Safari/AppleWebKit 无 Chromium 时回避 WebGL 视频纹理                            | 保留原 UA 条件。该路径仍创建地面与屏幕，视频以原 DOM fallback 叠放。                                                                                                           |
| 标题拆成固定品牌与随屏幕缩放的 headline；连接线扫光 2.5s                        | 使用原标题图的裁剪比例、原 SVG mask、14% sweep width 和 72% 结束停留动画。                                                                                                     |
| 下载/安装/导演台入口                                                            | 版本 0.1.26，macOS/Windows 原 URL；iPhone/iPad 不误识别为桌面 macOS；未知 OS 保留两个手动链接。导演台按原站开新标签，保留原教程 query。没有测试点击实际下载。                  |

反射和 Grid 的开源基础来自原打包组件中的 Drei 实现，已保留 [Drei MIT 许可](https://raw.githubusercontent.com/pmndrs/drei/master/LICENSE) 于 `src/features/blender/LICENSE.drei.txt`。Three 的现有依赖许可保留。

## 生命周期和回退

- idle 后加载独立 scene runtime；卸载前完成的动态 import 不会再创建视口。
- 视频 media listeners、DOM video、VideoTexture、地面贴图、几何/材质和所有反射/模糊 render targets 有明确所有权，卸载释放；晚到贴图不会重新附着场景。
- RAF、ResizeObserver、resize/visibility/pointer/context listeners 在卸载移除。切换到隐藏页面停止 RAF 和视频，恢复可见后继续。
- context lost 显示原海报/CSS 背景并暂停视频；context restored 重新 resize/render。视频、贴图或绘制失败走原海报 fallback，停止并释放失败运行时。
- 首次 ready 必须在原贴图、可用视频（或 Safari DOM 模式）与一帧 render 后成立。DOM `data-scene-ready` 仅用于检查状态，不能单独作为 WebGL 图像正确的证据。`data-scene-stage` / `data-scene-error` 保留模块加载、初始化、资源、绘制和 context 恢复阶段；失败资源 URL 和原错误 message 可供验收检查，不显示在产品界面。
- reduced-motion 保留原固定机位、视频第零帧和扫光静止位置 .55，关闭标题连接线动画；DOM 视频也暂停，补齐原 Safari fallback 未暂停的问题。
- ≤768px 时降低 DPR 上限 1.5（桌面 1.75）和反射分辨率。正常宽度保留原 340px 最小屏宽；不足 380px 的手机改为 viewport−40px，避免原 clamp 的最小宽度超出 viewport。窄屏说明字体保留此前 13px/20px 的可读性规则。

## 已完成检查

- `npx vitest run src/features/blender`：6 文件、25 测试通过。覆盖实际 Three 投影/rounded shape、source damping/easing、Safari/iPad 判定、媒体暂停与迟到事件、反射渲染状态 finally 恢复、实际 Three 场景资源 ownership、失败/卸载竞争、hook context 丢失/恢复、隐藏页面和 lazy 初始化取消；新增失败诊断保留与两个平台图标对应真实本地 SVG 的回归检查。
- `npx eslint src/features/blender --max-warnings 0`：通过。
- `npx prettier --check src/features/blender`：通过。
- 首批 `npm run build`：通过，Blender 独立 scene runtime 约 23 KB（gzip 7.7 KB），Three 与 Studio 共用分包。没有新增依赖。root 在平台图标和失败诊断修复后完成全站 `npm run check`：60 个测试文件、291 项测试通过，格式、零警告 ESLint、核心 strict TypeScript 和生产构建全部通过。

## root 首轮浏览器发现与修复

1280×720 首轮验收发现页面可见，但未留下 canvas，`data-scene-ready=false`，没有 console error；macOS 下载按钮有破图。不能据此宣称 WebGL 通过。

- 无 canvas 的具体链路：Vite 开发服务器启动后才新增地面 JPEG，`vite.config.js` 已排除 `public/assets` 的 watch。当前 Vite `servePublicMiddleware` 使用启动时 `publicFiles` 集合，新文件未加入，因此实际图片请求返回 `text/html` 首页；TextureLoader 报错后本地释放失败场景与 canvas。两张磁盘素材经 `file` 检查均是 1024×1024 真正 JPEG，大小 545,361 / 1,223,912 字节；旧素材请求 MIME 正常。需要重启开发服务器刷新 public 文件索引，生产构建会按完整 public 目录复制素材。不修改全局 Vite 配置。
- 图标路径：此前相对 `/assets/blender/platform-apple.svg` 不在精确 asset-map key 中，而且没有对应命名文件。改为原绝对 URL key，分别映射已存在 `/assets/9f385e26609621fd.svg` 和 `/assets/9a5759de83682a59.svg`；原站图标使用 img，不是 CSS mask。
- 失败证据此前被 fallback 吞掉，现用 host data 属性保留阶段与错误详情，仍显示原海报回退。单元测试检查初始化、媒体/贴图与绘制失败仍释放一次，不继续 RAF，错误证据在 canvas 移除后仍可检查。

这些修复已完成静态和回归检查。root 重启开发服务器后完成下述真实浏览器复验。

## root 真实浏览器复验

- 桌面 1280×720：`data-scene-stage=ready`、`data-scene-ready=true`、`data-video-mode=webgl`；实际 Three r186 canvas 为 2240×1260，CSS 显示尺寸 1280×720。实际画面可见演示视频纹理、圆角屏幕外壳、反射地板网格和标题连线，平台图标有效。warn/error 日志为空。该结论包含实际画面核对，不仅依据 DOM ready 标记或日志。
- 键盘：Tab 第 5 次到达下载链接，没有执行下载或安装。
- 窄屏 390×844：场景 ready，canvas、容器和 scrollWidth 均为 390，无横向溢出；视频、地板和移动文案可见。

上述是 root 对本地匿名页面的实测结果，不代表全部原站交互或逐像素对照已通过。

## 浏览器验收边界

当前子代理 Cua `getState()` 未列出浏览器控制面。创建隐藏 IAB 标签返回 `Browser is not available: iab`；按 root 提供的精确 ID `2` 再尝试一次仍不可用，未创建标签，未操作用户现有 tab 4/7。真实 GPU、桌面和窄屏结果采用上文 root 的实际浏览器观察，不能称为子代理自行验收。

Safari DOM 视频兼容路径、reduced-motion 和 context loss/restore 目前仅有源码核对和单元测试，未实际浏览器验证。CTA hover/focus 扫光、鼠标视差与边缘光、离开再进入及原站逐像素对照也不在上述通过范围内。按权限约定没有点击软件下载安装，没有进行真实认证。
