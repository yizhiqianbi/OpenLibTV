# ScriptV2 画布参考选择源码契约

2026-10-12。本批采用静态归档脚本证据，不执行原站客户端或写请求。内容只使用代表性公开样本；登录、账号、小号和真实生成继续延期。

## 原入口与候选

`1sutpu54cdy46.js` module327466 的 M.h 直接调用 `enterReferencePickMode(scriptId)`。`3zez5ighjd7k4.js` module450681 的 hook 使用 `collectCanvasReferenceCandidates({scriptV2ImageOnly:true})`，进入前后以序列保护异步候选。`0leiedr1esdbe.js` 的 mode store 切入参考时关闭 mark/focus/capture，进入与退出均不改变普通 selection。

SCRIPT_V2 此入口只允许 IMAGE，已连接来源从 pickable 剔除。virtual-only IMAGE 不作候选，但直接来源仍列 connected，允许删除其第一条 direct edge。候选 collector 不以 URL 是否存在或 hidden 字段过滤，也不提前做程序化连线的 cycle / reverse-duplicate 检查；后一层在实际提交前校验。原 action matrix 要求 source / target 的有效 action；IMAGE 缺 action 仅在已具有 scriptRowHiddenUuid 时回退 image_generate，不猜所有手写数据均合法。

`1xj2-x_wy8_8a.js` 的容量函数对 SCRIPT_GENERATE / 无 action 的 ScriptV2 image 返回 true，没有此入口的模型图片上限。source collector 的 action 校验仍独立执行，不能将容量结果当最终授权。纯模型不复用普通 generator 的 model limits / generic prompt mention 校验。

## 点击、断开、分组与框选

`21_0xvlvkw1sz.js` accepted node click 各自以 RAF 取消被点 source 的 selected，并选择 reference target；不会清除无关选择，也不会退出 mode。GROUP 点击递归 GROUP 后代并按源节点顺序批量添加可用 IMAGE；仅取消被点 GROUP 的选择。框选只追加 target selection，不清已有其他选择。点击 already-connected 的节点正文为 noop；BaseNode connected mask 另有“取消选择”，只删除第一条 source→target direct edge，包含 virtual edge，且不改变 selection。

pane 单击 source `cI` 在 reference active 时以 RAF 追加 target selected，与“返回节点”不同，不移动视图。框选从 pane 左键且非 Space 开始，任意轴移动严格大于 5px 才出现框；用世界 bounds 严格相交，parent 最多 32 层，measured→stored→200/120。取消 / owner 切换不发布旧结果。返回节点使用 400ms 视口移动并退出；Escape 只退出参考模式，不恢复旧选择。

`3u6hjewm8qox_.js` shouldShowGenerator 为 explicit reference target OR 普通 sole-selected 且非 box，因此 target A 与普通选择 B 可同时具备显示资格。target 模式不强行选中 A 来实现显示。readonly / ready / full-generating 与卡片形态另行门控；本批只接 reference target，mark / focus / capture 的完整功能继续缺失。

## 视图、事务与本机适配

Bar / Mask 精确文案、z10/40/50、反 zoom、“取消选择”、连线 15% 与窄屏折行见 [视图审计](./canvas-script-reference-pick-view-source-audit.md)。临时规则限定参考模式，不更改图或持久层级。drag / connect / select / delete 暂停，平移缩放保持；普通输入和媒体 controls 在非 target 参考表面暂时 inert，模式退出恢复。

`domain/reference-pick-model` 提供 describe / box / connect / disconnect 纯计划；`useCanvasReferencePick` 持有 mode、pointer capture、RAF 与文档身份。图修改投影末次草稿后同步 raw CAS、一次历史和实际 flush，专用 script params 使用 `script-reference-graph` 重算 source_images，未知 schema 保留旧参数。连续 accepted 动作在同一 RAF 前按顺序积累 selectionChanges，不丢先前 deselect；pane 单击无图提交或保存。失去 ready / writable、target 删除、full generation、切文档与卸载退休旧 owner，不能依靠同 ID 将旧结果接入新文档。

native picker、FileReader 与本机资产适配见 [导入源码](./canvas-script-reference-import-source-audit.md)，生命周期复核与中间失败见 [owner 复核](./canvas-script-reference-owner-review.md)。原站 UUID 不复用；未观测到中间删除的原子同 UUID 替换不具备可信 incarnation 协议，本批不靠对象引用阻断正常 immutable 剧情编辑，也不宣称已覆盖该服务状态。

## 验证范围

纯模型、controller、视图与实际 NodeCanvas 回归统计以最新 [覆盖清单](./coverage.md) 为准。source 协议与本机正向测试不能证明服务器权限、上传成功、生成、账号或协作。原生桌面、窄屏、触控和全部 source 模式须分别记录实际证据；完整检查不代替全部交互验收。本批未部署，不替代独立影游冻结生产，整个复刻目标未完成。
