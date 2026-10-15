# ScriptV2 专用生成器、草稿与保存恢复验收

2026-10-12，继续用户“节点交互不自然”的优化。上批已接空态参考建图，本批补专用生成器的提示词、三项模型、文本/媒体引用、参数/任务投影及本机保存。未登录、注册、使用账号资源或调用原站生成/费用/写服务。本机源码更新，不自动改变独立影游冻结部署或现有生产。

## 源码与实际接线

source SCRIPT_V2 Factory独立映射module327466，使用scriptText目录、text schema和scene=`script-generate-v2`；它不展示模式、数量或普通/高级参数。精确文件/字符位置、输入规则与视图证据见 [纯模型审计](./canvas-script-generator-model-source-audit.md)、[视图审计](./canvas-script-generator-view-source-audit.md) 与 [实际接线审计](./canvas-script-generator-integration-source-audit.md)。归档仅静态读取，不执行原bundle。

`CanvasViewport`按source五种卡面及单选资格接独立`ScriptV2NodeGenerator`：empty/pending/resource/failed显示，全脚本生成中与readonly隐藏。框选、拖动及Inspector互斥是当前本机适配，完整reference/mark/focus显式目标仍未接；不拿浮动四动作toolbar的eK冒充eX。

- 独立只读`script-text-support`保存原3项metadata：GVLM 3.1、CVLM 5.5、GVLM 3.1 Flash。菜单使用原图标/名称/描述和disabled规则，不把14项text schema当目录。`useContent`加载/错误/重试保持原参数，目录失败不写空值；readonly不新造账号权益。
- source TEXT 48px静态卡、媒体strip、专用placeholder和底栏接到公共NodeGeneratorPrompt/ModelMenu/References。普通媒体每种编号从1起；文本只预览/删除，不插入媒体token。提示词支持typed当前引用，不安装另一个编辑器或样式reset。
- 660px Frame位于节点底部16个**画布单位**，内容逆zoom；source expandedGeneratorWidth/Height保存尺寸，保持raw节点盒子/位置和原视角。窄屏clamp是本机适配，不能据此称原生窄屏像素通过。
- typed reorder只改对应ListOrder，不重写Image/Video/Audio编号或其他typed/mixedOrder。删除优先直连边，否则计组内全部展开leaf；REFERENCE/无URL/未完成节点也计数，不能因只有一个可用输入误删整组边。删除后在同次CAS重建current source_images/列表，保其他payload键，不复活旧存储引用。

`script-generator-inputs`独立核对source collector，包含edge次序、条件去重、group/excluded/virtual/focus/character/原图与真实metadata。TEXT的content数组参与hasPrompt，空脚本prompt仍可由上游正文满足source规则。原本机textarea写data.text时覆盖旧content，显式清空不回退；这项renderer适配与source-only数组读取分开。

`script-generator-model`维护init、task参数、source_images/ref_id、ensureorder、规则、typed重排/删除与prompt清理。已存在params保留，仅补缺model；不按生图模式猜默认参数。Magic只保被引用项；CameraPreset按原数组顺序压缩并按source条件重映射，其余普通媒体token和空白不改。任务参数仍是未提交的本机投影，未设置loading/taskId或伪分镜结果。

## 草稿、一次事务与失败恢复

`useScriptV2Generator`核对捕获owner、fresh raw图、ready/readonly/整脚本busy与最后render的prompt基线。显式prompt/model/reorder/delete在一个共享CAS/history提交，先投影最后草稿、同步发布后flush实际图；旧DOM输入不能覆盖外部新prompt。初始params和incoming只投影，不在mount/undo时偷偷追加历史；用户确实编辑时才保存source初始化参数，这是本机生命周期适配。

`useCanvasDrafts.register`增加可选channel，旧compose默认、新生成器使用script-generator。同节点逐镜和整段剧情分别投影，cleanup不删另一reader。最后150ms、pagehide、选区隐藏与快照/重试同样经过source prompt清理；保baseline冲突与ack消耗，原文档未变不会重复复活草稿。

Quota后图仍已提交、输入被接受，取消旧debounce，不再建第二条历史。本机editor重试只保存当前图；稳定文档层另保`saveError/retrySave`，顶部原保存状态处仅真实失败时显示“重试保存画布”。选另一节点或打开参考预览，不再把已提交待保存状态永久丢掉；重试限定当前storageKey/loaded/readonly/actor，旧文档flush不更新新文档保存标记。

Frame原portal卸载旧expand按钮会丢焦点，已修成dialog-stack先恢复有效opener，只有焦点落BODY时回新expand控件，不另建滚动锁。两层Escape先关模型菜单、再收Frame；button Space保默认激活、双击不误开脚本。转换前写入被拒时保原mounted输入，不将失败草稿随portal重挂丢弃。

## 实际验证

正式bundled Node24.19.0，pure2文件105项06:13:32/533ms（model73/input32）通过；view20项06:09:04/941ms通过。Root初始15项中2失败分别为typed适配和source_images字段误用id，按source改typed名称及ref_id后15项通过；再补禁项raw callback与prompt清理回归，controller17项通过。

实际NodeCanvas新套件最终12项06:14:48/4.50s通过，保图/存储/几何/undo/模型与焦点断言。首次readonly夹具与真实Frame焦点问题分开记录；Frame修复后原10项通过，再加两项真实650ms等待自动保存继续失败的selection/preview→Header恢复回归。旧preset7项注入真实support及迁移service-only文案，保全部原文/URL/坐标/history/storage/Quota强断言。source16world改动后zoom.8的top为366，旧370断言迁移，保inverse1.25/raw350/原view/零mount-history。

最后draft+autosave+controller3文件39项06:15:52/809ms通过；Frame/实际App/既有inline持久化4文件24项06:16:49/4.83s通过。最终联合12文件208项06:17:22/6.57s通过，日志 [canvas-script-generator-final-joint-tests.log](../artifacts/canvas-script-generator-final-joint-tests.log)。各集合重叠，不累加成总数；真实图/history/draft/storage controllers运行，只注入只读内容与jsdom几何、capture、键盘默认click。

最终正式Node24.19.0完整 `npm run check` exit0：**314文件/4155测试全部通过**，06:17:39/85.20s（tests57.84s）；格式、零警告lint/架构边界、核心strict和生产构建9.93s通过，日志 [canvas-script-generator-final-check.log](../artifacts/canvas-script-generator-final-check.log)。构建CanvasPage923.04kB/gzip304.97kB，出现超过900kB的分包提示，不是零构建警告；后续按需分包，未抬阈值。随后仅维护文档并定向格式检查，没有新生产修改。strict不覆盖全部JSX、CI未远端执行，统计含独立影游扩展，不能当原站已验收功能数。

## 明确剩余边界

view已保source“在当前画布中添加参考/本地上传/个人资产库”的可注入菜单协议；**当前Root尚未接这三种新增引用动作，触发器不可用**，不能说已能上传或选新参考。当前可用引用来自原画布/上批预设与既有文档。完整reference/mark/focus模式、专用30MiB上传及source私人素材接线继续后续核对，不用通用弹窗假冒原站模式。

真实生成、费用、翻译、语音及协作/运营写服务未接。生成合法时只保存剧情/当前引用并明确未提交；没有假任务、生成结果或权益。源disabled model自动改选的系统effect、完整参考hover/compliance/audio形态、source 280px Tooltip、媒体预览细节与退出动画等差距保留在分域审计。

本批未新增原生浏览器/桌面窄屏像素、输入手感、Space、真机/Safari或大图基准通过，没有新截图。上批data临时检查页的浏览器协议拒绝是历史证据，本批不绕开限制或伪造native输入；用户Vite5173保留。核心strict不覆盖全部JSX、CI未远端执行，整体复刻目标未完成；登录注册及小号继续延期。
