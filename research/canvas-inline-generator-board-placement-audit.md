# 内嵌生成器实际画布宽度适配

2026-10-12。本批只修改 `generator/useInlineGeneratorPlacement.js/.test.js`。Root 接三个 caller 的 `{center,width}` 与 width style：普通生成器、ScriptV2生成器和 CanvasGeneratorEntry 加载/错误态。原 source 图、CSS、垂直位置、模型、draft和历史协议不变，未修改已冻结 Script 卡片入口。

Root 原生验收发现888px画布中图片节点中心约705，660px生成器横向范围约375..1035，右侧生成按钮被裁；证据为 [修复前原生截图](../artifacts/canvas-mark-native-final-proof.png)。旧 helper 只在宽度≤767时夹紧，Agent侧栏也可能使桌面实际board比window更窄，因此按window断点区分不能保证可达。本批是实际观察驱动的本机适配，不把全部宽度夹紧或20px边距描述为原站新协议。

`inlineGeneratorCenter(center,view,viewportWidth)`仍保留原导出。以实际board宽度计算 `panelWidth=min(660,max(0,boardWidth-40))`；屏幕中心为 `view.x+center*view.z`。合法区间为 `[20+panelWidth/2, boardWidth-20-panelWidth/2]`，只有左右溢出才夹紧并反投影世界中心。区间内直接return原center，避免浮点往返改变原合法桌面位置。原view对象不修改，没有相机或节点坐标写入。

hook返回 `{center,width}`。未测、0或无效board宽时，width为undefined、center保持原值；保留原CSS回退而不猜window宽。测得正常宽度后，width与center共用同一board值。小于40px的退化board无法同时容纳两侧20px边距，明确返回非负width0及board中点，不造负数布局。

沿用已有 ResizeObserver/window.resize 生命周期：首次layout测量、尺寸变化更新，退休时disconnect和removeListener；补current guard拒绝已退休observer的迟到测量。board引用换成空实体时清除旧宽度。不引入RAF、额外全局监听、垂直翻转、DOM重挂载或图历史。

Node24专项8项全部通过，日志 [canvas-inline-placement-board-tests.log](../artifacts/canvas-inline-placement-board-tests.log)。验证正常desktop原center精确保留、888px实际overflow、左右跨pan/zoom的20px边距、未测和退化值、Agent缩小board后宽度调整、Observer退休、window.resize fallback与移除。ESLint零警告、Prettier通过。Root负责三个实际caller联合回归与修复后原生验收；本批作者未运行全量check或浏览器，修前截图不是修后证明。
