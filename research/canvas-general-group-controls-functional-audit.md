# 普通组与脚本关联组操作验收

2026-10-12。继续用户“节点交互不够流畅自然”的反馈，本批补普通组的实际浮动操作、颜色、排列、标题与转换，核对脚本关联/混合组入口，并修复复制末次输入和下载取消的任务归属。只使用已有公开源码和代表性素材；无需登录、小号或原站写入。本批为本机更新，没有发布 Canvas 更新到线上。

## 原站依据与实际接线

源细项分别在 [普通组源码](./canvas-ordinary-group-controls-source-audit.md)、[脚本组源码](./canvas-script-group-toolbar-source-audit.md) 与 [事务接线审查](./canvas-ordinary-group-integration-audit.md)。原始 bundle 仅静态读取；此处的 UI、模型与 controller 是独立实现，不运行原站遥测或写逻辑。

General 与 standalone 不是同一工具栏：普通/脚本 General 仅唯一选中实际组显示；standalone 图片组可由唯一直接图片孩子显示父组操作。框选、拖动、只读和标题编辑隐藏，编辑结束保留200ms。当前归档 character helper 恒 false，不因 characterAsset 随意换栏或禁用普通能力。损坏的 truthy standalone 声明不回退为可写 General。

普通组使用源十色菜单和宫格/水平/垂直排列；颜色整体替换 style，并写 groupColor / zIndex，不改孩子参数或边。纯布局按 measured→stored→200/120、完整 preferred 顺序否则 numeric name，采用源36/66 padding与36 gap；只改直接孩子局部位置。DOM、命中和锚点仍共用本机 canvasNodeSize 的 stored→measured，这是 renderer 几何适配，不能宣称与源所有 RF 尺寸状态完全一致。

普通图片组转分镜使用实际全部图片的资格，不套“创建分镜组”的2–25限制。保留完整 preferred 顺序和其他 params，按源设16:9、清对应脚本行/任务信息、恢复明确内容尺寸；自定义标题不改写。只有转换发布源 fit，颜色/排列/标题不额外跳视口。

`general-group-controls-model` 接既有 `useCanvasGroupControls`，颜色/布局/转换和通用改名共享 raw graph CAS、草稿投影、一次历史，经自动保存持久化；明确新图与溢出提交才立即flush，不把全部组命令描述为立即flush。失败不部分修改图或先改选择。selection actions 的 group layout 委托该 controller，虚拟多选保留自己的布局。真正普通组的右键菜单隐藏无法打开的“节点设置”，普通孩子仍有设置。

复制先对源图投影最后未提交草稿，再生成新 IDs；CAS expected 保持原 raw graph。旧文档回调、并发改图、坏投影拒绝提交。解组清 source script 中确切匹配的 linked group ID/边，保留孩子 scriptRowHiddenUuid 与世界位置；专属内容尺寸只按明确 marker / scene 清理。

组下载使用现有递归资格、ZIP取消和水印边界。进度/取消归属 documentKey 与 groupId；旧组或旧文档回调不能中止新任务，虚拟多选仍可不带 groupId 取消自己的任务。新增菜单采用共用非modal popover，Escape回触发器，外部 pointer/focus 不抢新焦点；body portal与窄屏 clamp 属于本机适配。

脚本 General 与混合 standalone 分别维护。混合组比例由脚本锁定，隐藏转普通组，执行按钮为“重新生成”；v1 image caller 确认为“生成分镜图”，v2 为“整组执行”，不能根据现有图片擅自启用未调用的 helper 再生成分支。视频待完成统计区分实际直接视频、空URL与 status3/4且loading=false。视频入口按实际 script rows、图片URL/行UUID匹配与最新 linkedImageGroupId 门控，不用图片数量假装可生成镜头数。

`script-group-controls-model` / `useCanvasScriptGroupControls` / `CanvasScriptGroupConfirmation` 只接 source 确认入口和文档/request/group-data owner；真实执行与费用尚未连接，开始按钮禁用，参数和内容保留。清空关联组明确保留脚本对应关系。这里没有实现 source prepare-target、真正 pipeline、积分估算或远端任务完成。

最后性能收敛：`CanvasViewport` 仅对当前可见General工具栏的组计算真实成员、视频与下载资格，按nodes和组ID缓存；隐藏组不随每次平移/拖动做同类全图扫描。脚本确认hook没有request时不读当前文档或扫描nodes。纯计划先按引用判断，未变化节点/媒体不做整图JSON序列化；无关节点的toJSON抛错夹具不影响布局或no-op。此处移除已确认的冗余工作，未测大图fps或基准，不宣称所有重型画布性能问题已解决。

## 实际浏览器

独立 QA 项目 `canvas-general-controls-interaction-proof` 使用正常生产 `writeCanvasSnapshot`，只写本机专用 key。初段外壳直接挂真实 NodeCanvas、公共样式和本地 actor，以隔离另一任务正在修改 App 的 HMR；这一段本身不是完整App验收。最后性能修复冻结后另在完整App `/canvas?projectId=canvas-general-controls-interaction-proof` 实际复验普通与脚本v1组，结果另列下方。两张图片为已保存公开真实素材，脚本 rows/group linkage 是明确合成协议夹具，不能当作原站账号状态。

1280×720 原生鼠标选择普通组后显示源顺序工具栏。选择 `#E74C3C` 后实际 background 为 rgba(231,76,60,.1)、border 为 rgba(231,76,60,.2)，操作结束焦点回颜色 trigger。垂直排列实际持久化 group272×378、preferred b→a、孩子局部(36,66)/(36,222)，两个URL与 prompt/settings保留；刷新恢复。真正双击标题进入“分组名称”，Enter改为“镜头组 · 自然交互”，一次undo还原、redo恢复；原生标题[257,247]→[327,257]使组屏幕左上(204,263)→(274,273)，孩子跟随。刷新标题、位置、颜色和排列保留。

颜色菜单 Escape 后实际 activeElement aria-label=分组颜色、menu数量0。普通转分镜后实际2×2、16:9/空槽与源 fit，undo恢复普通标题/工具栏/内容。60%时直接AX组整体右键受覆盖，读取截图后在可见壳空白[220,388]原生右键，实际菜单只有创建副本/删除，不把第一次未命中记作通过。

390×844：普通 toolbar left8/right382/width374，document.scrollWidth=390。颜色 menu x12.5..264.5/y73..182；layout menu x24..144/y56..184，未覆盖 trigger，设置蓝色成功并回颜色。Escape回布局trigger；外部关闭Agent使菜单关闭且不强拉焦点回原trigger。窄屏截图先正常关闭默认Agent面板以显示画布，不声称 Agent 打开时所有画布内容可见。

合成混合v2实际显示 disabled16:9、宫格/拼接/编号/清空/重新生成/解组且没有转普通组；重新生成打开“整组执行”，显示费用与生成服务未连接，开始执行 disabled。Escape关闭实际 dialog数量0、焦点回重新生成。清空确认显示“与脚本的对应关系仍保留”，Escape回清空，内容不变。没有执行删除或假造生成；v1确认文案/视频资格由纯模型与实际NodeCanvas回归核对，本次未另开原站登录态验收。

最终性能修复后的完整App：普通组原生选中显示General工具栏且下载可用，菜单切垂直排列成功；选择真实图片孩子后General工具栏消失、孩子inline输入保持，重新选组恢复工具栏与下载资格。脚本v1两条rows/真实URL匹配的组显示颜色、布局、重新生成、批量生成视频、解组、批量下载；点击组工具栏的重新生成实际打开“生成分镜图”，正文“将对组内所有分镜图开始生成，是否继续？”，服务未连接且开始生成禁用。Escape回该组“重新生成”按钮。批量生成视频显示明确未连接提示、原内容保留；这只验证入口/反馈，不证明缺失的source视频配置浮窗完成。

原始 CUA JPEG 通过本地 QA textarea/按钮传 loopback 专用截图服务，落盘后 `view_image` 实际回读：

- [桌面原始截图](../artifacts/penstudio-general-controls-desktop-proof.jpg)
- [窄屏原始截图](../artifacts/penstudio-general-controls-mobile-proof.jpg)

未通过 evaluate 写 DOM、React 或 storage。中途验收30标签失去当前会话归属，读文档/列表后新建33/34继续实际持久化恢复；未据此改用户标签。最终完整App36/37及QA35也已关闭，关闭旧Canvas后才重置独立QA样本，避免旧pending覆盖。结束恢复viewport、关闭本批临时标签，loopback5198进程exit130停止，原开发Vite5173保留。原生鼠标与390px viewport不等于真手机、触摸或Safari。截图在最后非视觉性能收敛前保存，收敛后完整App上述入口另已复验。

## 工程检查与失败记录

最终冻结后完整 `npm run check` **exit0**：2026-10-12 01:59:27开始，**275测试文件/2929项全部通过**，测试104.90s，生产构建10.44s。Prettier、零警告ESLint/架构边界与核心strict TypeScript通过，日志 [canvas-general-controls-final-check.log](../artifacts/canvas-general-controls-final-check.log)。统计包括独立影游扩展，不等同原站功能数量；strict不覆盖全部JSX、CI未远端执行。本机Canvas未自动发布线上。随后仅补维护/研究文档并独立检查格式，没有生产代码再改。

各集合有交叉，不能相加作为全工程数量。先前 scoped格式与零警告lint通过；pure model末轮42项、owned UI4文件90项、selection/context44项、script model/hook与旧controller3文件29项通过。初期实际NodeCanvas context检查误把孩子设置算入组菜单，已限定真正context；随后仅出现5s等待超时，原强位置/历史/存储断言、timeout与worker配置保留。

首次冻结完整 `npm run check`：format、lint/架构、核心strict通过；275文件中274通过，2928项中2927通过，仅既有 `NodeGeneratorPersistence.test.jsx:120` 保存模型参数/立即卸载/恢复用例5000ms超时，01:43:30开始/525.40s，未进入build。原日志保留 `artifacts/canvas-general-controls-full-check-first-failure.log`。原断言与新实际组回归复验3文件10项在01:53:52/10.07s全部通过，日志 `canvas-general-controls-post-check-targeted-tests.log`。该命令另一个拼错的文件过滤没有匹配，未将其计入通过；其他实际storyboard回归已在首次完整检查通过。没有根据并行资源观察推定确定根因，也没有假称修复生成器保存。

第二轮完整检查为处理已确认的隐藏组重复资格扫描而主动取消（exit130），保留 `canvas-general-controls-check-before-performance-freeze.log`，不能列完整通过。性能修复后原生成器持久化、普通组真实接线、组视图、既有分镜接线与脚本确认hook联合 **5文件20项** 01:58:28/8.90s通过，日志 `canvas-general-controls-performance-final-regression.log`；新增空闲确认不读文档回归包含在最终2929项。独立复核没有发现该1video/0group旧夹具的确定生产保存错误，完整负载差异不是已证明根因。最终仍跑原完整命令，未放宽timeout、maxWorkers、断言、规则或检查范围。

## 剩余界限

- 原站 Toolbox 创建/更新 editor/modal、v1 batchVideo模型/参数/逐镜时长/选图配置浮窗未接；当前入口明确提示服务未连接。这是前端状态本身的缺口，不能概括为“只差服务器”。
- ordinary NodeResizer120×80手柄及其完整pointer/历史/成员补偿未实现，虽已找到源规则；character toolbar与完整特殊renderer仍缺。
- 真正 source run/stop、prepare-target、任务进度、协作锁/权限、费用/权益、生成与运营写服务未接。当前 optional running/progress UI协议不代表真实任务。
- 本机事务/键盘/clamp/nested解组是已记录适配；大图性能、真实手机/UA/触摸/Safari与原生持续修饰键需另验。本批整体全站复刻目标仍未完成。
