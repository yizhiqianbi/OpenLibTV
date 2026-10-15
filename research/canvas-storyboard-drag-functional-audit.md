# 分镜组与节点拖动联合验收

2026-10-11，继续用户“节点交互不够流畅自然”的反馈。本批只使用本机独立验收项目和已保存公开源码，不登录、不使用账号资源、不向原站写入。内容为代表性样本。

## 接线与源规则

- `node-drag-drop-model` 协调 grid start/move/stop → 图片派生组 stop → ordinary stop。源 node L/D 没有多选数量门槛，已有 primary grid preview 优先于 multi stop；虚拟 frame 是独立 J/Z 协议。node live Alt 不入组，frame Alt stop 仍可处理副本，不把两者合并。
- 独立图片宫格使用中心点最小面积命中、最近插槽与源 4px inset/gap；移动预览修改兄弟位置与组尺寸，松手提交 parent、相对位置、order、ratio 与明确维度。出组保留世界坐标；容量固定手动列×行或25上限，提示按源1600ms限频。
- 图片派生组多选按完整包含→中心→node释放点的顺序选择目标，图像资格和逐项容量检查先于附入。frame 成功只清实际成员选择，拒绝保留选区；node 拒绝按源脱离成员。standalone 的 multi/frame stop 使用无插槽附入后，再执行 actual membership reflow。
- standalone reflow 只针对成员变化且非空的 strict image group，取真实 parent 关系，完整 preferred 顺序或 numeric 名称排序。空组保留壳；不每一帧按成员重排，以免覆盖手势。
- 新找到外层 node-stop ce 的 pF 调用：primary 最终父组按真实孩子 grow-only 扩壳，左/上扩展补偿子坐标保持世界位置；virtual frame 不调用。先前 ordinary 审计只核对 inner handler，已纠正“drag stop不扩壳”的过宽表述。
- “合并分镜组”接到实际多选菜单，限2–25根级图片，使用源 Hungarian 槽位分配、2–5列、16:9参数与明确尺寸；一次图/历史提交后 fit 创建的组。
- standalone 空槽展示与插入共用纯 presentation：actual image children、完整 preferred 或 numeric 名称顺序、最小48px、uniform/variable尺寸和 hover 色值。加号菜单支持单图本地读取与公开样本图片选择。source tJ按点中的索引 splice child IDs、资源 action、`分镜 #{num}`、槽位尺寸，再 reflow；不在此路径写16:9 ratio。

详细证据见 [网格](./canvas-storyboard-grid-source-audit.md)、[派生组与外层边界](./canvas-storyboard-group-drop-source-audit.md)、[创建与空槽 UI](./canvas-storyboard-grid-create-source-audit.md)。

## 提交与异步所有权

Pointer 维护不可变 stage context，并按输入数组/投影序号缓存 StrictMode 重放。同文档外部合法更新后的基线必须是最后实际提交的 context，不使用未提交计算，也不退回初始 preview。当前成员增删或换父后，旧 grid preview 原子失效，保留新图，不能写回过期 child IDs。

selection/warning 在 React 真正提交对应 nodes 后处理，不能放进 updater。相同数组的拒绝也能发一次完成信号；取消、新手势、旧文档、只读或未 ready 的迟到投影/通知不消费。选择使用 stop owner 的 CAS，避免抢走新的用户选择。全过程沿用起拖时的一次历史，预览、reflow与扩壳不另 record。

空槽异步读取绑定唯一 request 对象、document 与目标组。open新槽、close、文档/ready/readonly变化、组删除或变资格、卸载立即 abort；迟到结果不插入、不通知旧失败、不关闭新菜单。native chooser 固定入口 owner，读取结束用最新图计划，保留期间合法编辑与边。失败保留可重试入口；成功回已存在的组控件，不回已被占用后卸载的加号。

## 渲染尺寸与标题

本地手动 renderer 没有 React Flow 测量流程。`canvasNodeSize` 对 image/video 的有效 `_explicitContentDims` 显示尺寸同步 Node、world projection、连线、小地图、fit/框选与拖动命中，保留源 flow 字段；这是明确的本机适配，不能把所有媒体参数当真实尺寸。

默认 source ghost 的尺寸规则仍是 measured → stored → 350。worldOrigin仅投影世界坐标，保留raw dimensions，再交给默认source或明确注入的renderer adapter；NaN/Infinity不能被本机尺寸回退吞掉。首次全检查暴露的三个回归均由这层投影混用导致，已修复并保留原断言，新增两个协议隔离回归。

组内图片标题与连接点是不同源门槛：`3u6hjewm8qox_.js` t7约853705/props906633、BaseShell665974隐藏非video图片派生组的图片标题；`2ob2qo_b0az9v.js` 722330约23836的严格 standalone image且无非空 sourceScriptNodeId 隐藏两端。character static preview 保留 target 例外；脚本派生组不套 standalone 两端规则。拖出组后恢复独立标题与连接点，避免宫格标题重叠。

## 检查与浏览器范围

最终生产冻结后 `npm run check` exit0：245个测试文件、2486项测试全部通过，含格式、零警告ESLint/工程边界、核心strict TypeScript和生产构建；日志 `artifacts/canvas-storyboard-drag-final-check.log`，22:51:26开始、测试75.36s、构建24.12s。strict不覆盖全部JSX，CI未远端执行，本批未发布线上。此前定向联合16文件552项通过，后续slot追加覆盖与ghost回归包含在最终统计，重叠集合不相加。

实际 NodeCanvas 使用真实图、菜单、历史和存储，只替换无关公开目录请求。覆盖创建、source排序、ratio/明确尺寸、node/frame附入、拒绝选择保留、单图换位/脱离、一次撤销/重做、刷新恢复、空槽菜单与history插入、组内/外标题和端口、Pointer实际commit/Strict/外部数组与异步取消。slot模型/真实hook共43项涵盖nativechooser旧owner、新槽、关闭、组删除/恢复、并发编辑、读取失败和配额写失败，原生文件选择器未单独实测。

独立本机项目 `canvas-storyboard-drag-interaction-proof` 通过生产持久化接口创建。1280×720原生鼠标从outside中心[220,290]拖到第四格[808,378]，一撤销恢复独立标题、两端口和加号，重做归组；[808,378]→[604,254]换到第一格并推移兄弟，再[604,254]→[260,450]拖出。加号菜单Escape回第四格，公开history选择“抵达之前 From Begin To Begin”后回已存在组控件。实际保存group480/140、412×252，成员1/2/3/新图；outside无parent、world140/340，新图relative208/128、`image_resource`、`分镜 #4`、params为空，不在插槽路径注入ratio。

390×844原生先fit至约45%，outside[80,432]→第四格[326,474]，一次undo/redo、换第一格[234,416]及拖出[110,190]均通过；menu右侧收进屏幕，Escape回加号，history弹窗取消同样回加号。再选择同一公开样本补第四格，成功回组；刷新保留独立outside、四图顺序和当前view，标题/端口按组内外恢复。实际snapshot的outside世界位置208.134831/-358.786517、无parent，view{-27.949495,278.535354,.44949495}；组与新图字段同桌面。开发期修复HMR中断过一轮拖出，该轮不列通过，生产冻结后已重新完成拖出、undo/redo、补图与刷新。

截图已写入并回读：`artifacts/penstudio-storyboard-drag-desktop-proof.jpg`1280×720/59555B、`penstudio-storyboard-drag-mobile-proof.jpg`390×844/34236B。正常QA输入/按钮只将原始CUA JPEG写到localhost专用服务，未用evaluate改DOM、React或storage。临时tab25已关闭、viewport reset、截图服务exit130且5199无listener；Vite和用户标签页保留。完整批次记录见 [验证历史](./verification-history.md#分镜组与节点拖动协调2026-10-11)。

初次 integration 错把 sibling ratio/外层 top 补偿当16:9默认且不扩壳；直接source核对后修正夹具为明确16:9 sibling，验证组与子节点世界位置不动。第二次联合检查的创建 reload 用 handle 作 ready 信号，但新source组内handle本就隐藏，改为实际页面上传 input 的可写状态。初始日志保留，不删除失败或修改 timeout。

首次全工程检查245文件2484测试中2481通过、3个既有ghost尺寸断言失败，日志 `artifacts/canvas-storyboard-drag-initial-check.log`。修复后的ghost、renderer-size、connectionMenu三文件80项通过，再运行同一完整命令通过；未删除断言、放宽timeout或改workers。

## 剩余范围

本地单图读取替代原站鉴权/pre-sign上传，history选择使用公开代表性封面，不冒充私人生成历史；远端上传、私人分页历史、实践页隐藏history分支、真实协作/锁/权益与完整特殊节点继续待接。group现有通用工具栏仍不代表源全部分镜设置。原生鼠标拖动与390px viewport不等于手机UA、真触摸、Safari/原生Alt持续拖动或大图性能验收。真实生成与运营写服务未接入，当前无需登录注册、小号，全站复刻目标未完成。
