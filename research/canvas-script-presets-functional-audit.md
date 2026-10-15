# ScriptV2 空态入口与本机建图验收

2026-10-12，继续用户“节点交互不自然”的优化。本批恢复空态三个 source 入口，补上剧本/角色参考建图、加载边界、整组撤销和保存失败重试。不登录、注册、使用账号资源或调用原站写入；没有提交生成任务。本机修改，不自动发布独立影游或现有生产部署。

## 源码与前端行为

公开归档的 sT/tL/t_/tO 和 module316925 分别确认节点状态、预设动作与提示视图。精确文件/字符位置、原文摘要和素材来源见 [预设纯模型审计](./canvas-script-preset-source-audit.md)、[空态视图审计](./canvas-script-empty-source-audit.md) 与 [后续生成器协议](./canvas-script-preset-integration-source-audit.md)。只静态读取归档，不执行原站脚本。

- 空态按 source 显示90px ListDetail、“尝试：”和三个准确入口；readonly隐藏提示及动作。按钮的 pointer/click/double-click隔离，Space仅停止冒泡，保留默认激活；空白及图标仍交共享节点拖动。
- 剧本入口创建一个 text resource，`content`保存完整544字符原文，创建 source→script 连线，保留脚本原params。角色入口创建两张原URL image resource和两条边，脚本params整体替换为207字符prompt/action，不合入旧model或生成成功状态。
- raw 初始坐标按x−450及 source y计算，store避碰使用 measured→stored→350尺寸、50px margin、向下调整和最多30轮。默认目标图中两个角色最终为scriptY−108/+292。只用350作为碰撞盒，不写未由callback指定的尺寸。新根节点前置，边追加；不强行改选择或fit。
- 手动入口复用已有空行/空资产/table/default和全屏confirm-shots流程；不依赖预设目录。它与同步参考图事务的保存路径不同，不把既有table错误重试称作preset save retry。

`public/data/script-presets.json`是2,516字节的代表性完整预设，`NodeCanvas`通过统一useContent加载。两个入口各自使用纯validator；缺失、损坏、失败或正在加载时按动作禁用，手动仍可用。加载/错误/重试提示和reload rejected promise消费属于本机适配。部署样本预备清单登记JSON，但本批不运行打包预备或部署命令。

## 写入、所有权与失败恢复

`script-preset-model`只做校验/避碰/完整plan，`useScriptV2Presets`协调动作身份、raw图事务和保存，`ScriptEmptyCard`只显示/分派functionKey。共享commitGraph以原始nodes/edges/models为expected，投影末次草稿和旧历史后再次CAS，严格true才同步发布currentDocument并记录一次历史。之后用实际发布图flush，避免保存effect仍持旧图。

Quota或本机保存失败保留新增图、原IDs与明确错误，按钮“重试保存参考节点”只flush最新当前图，不重复分配ID/建图/history。目录后来失败不阻断已提交图的保存重试。删除新引用/边、切文档/节点、ready/readonly/overlay变化退休旧save owner；不通过重试复活删除的数据。

控制层同步锁在取消外部手势前设置，阻断回调重入。旧render的create/retry核对捕获documentKey/scriptId；manual入口核对owner token和fresh raw card，await完成后再确认当前owner才开编辑器。只读复核发现并纠正的两处P2与后续静态复验见 [控制层复核](./canvas-script-preset-controller-review.md)。不将只读review当测试通过。

## 实际工程验证

正式bundled Node24.19.0：纯模型52项05:40:09/445ms、独立空态15项05:37:09/583ms、实际NodeCanvas7项05:43:08/815ms通过。Root初始controller18+既有host12共2文件30项05:40:26/1.11s，通过后加旧文档API守卫和一项回归，2文件31项05:41:22/1.07s通过；没有把初次通过快照代表随后改动。

最终专项联合7文件118项05:44:13/4.19s全部通过，日志 [canvas-script-presets-final-joint-tests.log](../artifacts/canvas-script-presets-final-joint-tests.log)：pure52、view15、controller19、host13、actual preset7、既有actual compact7与legacy/script5。集合有重叠，不累加成独立总数。真实NodeCanvas图、历史、草稿与存储controllers运行；jsdom rect、pointer capture、键盘默认click是测试适配，不代表原生浏览器。

最终正式Node24.19.0完整 `npm run check` exit0：**309文件/3994测试全部通过**，05:45:38/81.09s（tests53.05s）；格式、零警告lint/架构边界、核心strict TypeScript与生产构建9.85s通过，日志 [canvas-script-presets-final-check.log](../artifacts/canvas-script-presets-final-check.log)。随后仅维护文档并定向格式检查，没有新生产改动。strict不覆盖全部JSX、CI未远端执行；统计含独立影游扩展，不是原站功能数量或原生浏览器验收数。

## 明确剩余边界

source预设只创建输入图；pending还应由专用SCRIPT_V2 GeneratorFactory提供配置。当前Viewport inline仍仅image/video/audio，普通textModels/默认text不能直接冒充3项scriptText目录；TEXT content的专用参考收集、script-generate-v2参数、prompt/参考菜单、提交与错误流程仍需独立接线。界面“脚本生成暂未接入，可编辑和保存参考节点”是本机能力说明，不是source pending原文；不能把本批建图完成说成pending完整或只差服务器。

原生验收尝试打开临时data页面被浏览器安全策略拒绝：仅允许http/https，未创建可操作检查页，未绕开限制。上一卡片批次46页native click不响应的历史证据保留；本批没有新增native通过、桌面/窄屏像素、Space手感或截图声明。用户Vite5173保留。真机/Safari、大图性能、显式target模式、完整工具箱/角色操作、任务总线/权益、真实生成/费用/审核/协作与运营写服务继续缺失。整个复刻目标未完成，登录注册及小号继续暂缓。
