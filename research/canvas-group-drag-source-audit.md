# 普通节点拖入 / 拖出分组：源码与纯计划边界（2026-10-11）

本批只实现普通组的停止拖动协议。公开保存脚本用于只读研究，不运行原站 store、遥测或写入；无需登录、注册或账号资源。分镜图片网格、图层合成及真实团队锁继续由独立协议负责，不用普通入组替代它们。

## 源码依据

以下 offset 为 `research/source/21_0xvlvkw1sz.js` 原保存文本的字符位置，脚本压缩导致同一行很长，核对时使用有界片段。

| 位置 / helper                            | 已核实行为                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 约 913813 `L` / `onNodeDragStart`        | Alt live-copy 与普通拖动分开；单组孩子复制后有 root 标记。standalone 图片网格孩子另建插槽状态。                                                                                                                           |
| 约 915xxx–918xxx `D` / `onNodeDrag`      | 普通组没有通用 hover 自动入组 / 重排；图片 standalone 网格和图层合成有专属预览。网格用节点中心、最小面积命中及最近插槽，不能当作普通组规则。                                                                              |
| 约 9189xx–929xxx `handleNodeDragStop`    | 先处理网格预览及 Alt live / fallback owner，再处理特殊多选，最后普通 primary 的保持 / 脱离 / 入组。                                                                                                                       |
| 约 9222xx Alt live redirect 分支         | 任意 single / selection live copy 已有 `idMap` 时恢复原件位置并直接返回，不再做普通入组，也不消费 `canvasAltDetachedCopy`。                                                                                               |
| 约 9231xx `A / L / D` 选中集合           | 优先 RF stop 参数 `m`，若 `m.length>=2`；否则 store 中 selected、非 hidden、非 temporary 的 A 有至少两项且包含 primary 时用 A；否则使用单项 m 或 `[primary]`。不能把选中父组所有未选孩子擅自加入。                        |
| 约 9237xx–9262xx 特殊多选 drop           | 排除 group / script / script-v2 成员后至少两项时，只查 `m3` 图片派生组；graph order 的完整包含优先于中心命中，再优先于释放点。不批量把多个节点附入普通组。                                                                |
| 约 9262xx–9289xx 普通 stop               | primary `type` 为 group / script / script-v2 时只保存位置；video_group 不在此 source 排除中。普通孩子与父壳仍有任意正面积相交就保留；完全离开才清 parent / extent、换世界坐标并去除旧 child ID。root 完整落入目标才入组。 |
| 约 929xxx `handleSelectionDragStop`      | 普通选择停止只持久化最新 position。虚拟框另有 `Z`，不是通用普通组批量入组。                                                                                                                                               |
| 约 902xxx–905xxx 虚拟框 `Z / J`          | `mQ` 图片派生组的多选完整包含 / 中心、容量、ratio 与 selection 消费是独立分支；本批 selection surface 对普通 parenting no-op。                                                                                            |
| 约 697578 `mQ` / 698307 `m3`             | type 必须 group，且 `storyboardGroupType!=='video'`，同时 image type / truthy sourceScriptNodeId / standaloneStoryboardImageGrid 任一成立。与普通组输出入口排除规则不同。                                                 |
| 约 911xxx `M`                            | 附入图片派生组时可按 sibling ratio 改新 image params / explicit content dimensions / width / height；standalone 网格另有容量、grid preview、child dimension 和 group size 处理。                                          |
| 约 688531 `pF`、8869xx dimensions caller | ordinary inner stop 不调用 pF；后续确认外层 ce（约936xxx）在 node stop 后对 primary 最终 parent 调用 grow-only 扩壳，ct 处理最终 parents，virtual l5 不调用。dimensions caller 也调用；不自动缩壳或重排。详见本批分镜 drop 审计。                                     |

关联模块：

- `3u6hjewm8qox_.js` 模块 612574（约 3179xx）：`buildGroupCountUpdate` 只更新缺失 / 空名称或已生成的“分组 / 分镜组 N 个节点”名称，自定义名称不改。
- 同文件模块 761851（约 15267xx）：明确 `_explicitContentDims===true && params.scene==='group-generate'` 的视频分镜脱离清理，不是通用尺寸清空。
- `04q9x43g2p9-v.js` 模块 662493：recursive absolute position helper 及媒体节点 flow 尺寸；RF dragging roots 排除被选祖先的孩子。
- `1eqsg-pmc0mun.js` 模块 836105（约 934xx–97xxx）：standalone 网格数量、容量、插槽、可变孩子尺寸与最小面积中心命中。仅调研保留，本批普通模型不复制其 UI / 重排行为。

## 本批完整普通规则

`domain/group-drag-model.js` 导出：

```js
planCanvasGroupDragDrop({
  nodes,
  draggedNodeId,
  draggedIds = [draggedNodeId], // RF moving roots / 本机移动根
  selectedIds = [], // 停止时的实际选择，用于 source D fallback
  surface = 'node', // 'node' | 'selection'
  getNodeSize,
  releasePoint, // 已转换的世界坐标，特殊多选诊断的第三级命中
  liveAltCopy = false,
});
```

返回 `{valid, changed, nodes, kind, transitionIds, sourceGroupIds, targetGroupId?, reason?}`，kind 为 none / retain / detach / attach / alt-detached / blocked。无 edges、history、React、IO 或 storage；输入完全不变。调用者先投影最终节点位置，再把计划所得 nodes 作为同一次最终 position updater 的结果，不增加第二条 undo。

- target 普通节点类型只要求 `type==='group'`，排自己和原 parent；不依据 sourceScript / characterAsset / shot-breakdown 一概禁用。画像 `m3` 资格命中时转专属边界，不降级普通。video_group 可被拖入普通 group，但不是 target。
- source primary 排除只看 node.type 的 group / script / script-v2。不能套复制模型的 data.type / canCopy / action 资格。原 source target 没有 hidden 过滤，本批保持包括 hidden group 的 graph order，不能把可见性猜成新的 drop 规则。
- 外部 root 必须完整包含，四条边比较包含等号；中心或局部重叠不足以普通入组。多个目标取原 nodes 中第一个，不能改成最小面积、zIndex 或 DOM 悬停。
- 已有 parent 的孩子只在 `x+width<=0 || x>=parentWidth || y+height<=0 || y>=parentHeight` 时脱离；因此外边缘接触已算离开，任意正面积重叠保留。脱离后的同次 stop 可完整落入另一个普通组，保持世界位置。
- attach 保留 source 原 extent / zIndex，不新增“限制在父组内”配置；detach 才清 parentId / extent。普通 parent 的壳 position / dimensions / measured / zIndex 不改。最后一个孩子离开也保留空壳，不做删除组或解组。
- old childNodeIds 按 source metadata 顺序只去当前 ID；target 按现有顺序追加不存在的 ID。保留其他陈旧 metadata ID，不用 graph-order reconcile 改写源顺序。保留自定义 group 名称。
- 多选从 node surface 停止，特殊多选不命中时只对 primary 执行上面规则，不循环每个移动根。selection surface 对普通 parenting 无条件 no-op，可不提供 draggedNodeId。

## Alt 标记与重复调用

`canvasAltDetachedCopy` 不是当前 pointer 的替代品。single copy helper 从 group-like parent 脱离时设 true；source live-copy stop 直接返回，使该标记跨手势保留。下一次 ordinary stop 若完整落目标，先写 false 并保持世界位置，然后返回，这次仍不附入组；无目标且本次没有新 detach 时也写 false。source 特殊多选先消费 primary 的这个标记，不附入 peers。

模型保留该源门控。liveAltCopy 让 single / selection 都 no-op，不消费标记。对同一原始 input 重复调用结果相同，适用于 React StrictMode 的 updater replay；把前一次输出再作为同一个 stop 的第二次输入会把已消费的标记当作下一次 drop，因此 Pointer 必须只 finalise 当前 owner 一次。下一手势普通拖放可继续正常入组。

## 尺寸与本机适配

source 普通 stop 的 primary 默认 measured → stored → 0，parent / target 默认 stored → measured → 0；不把无尺寸节点推测为 350 或 230。源码未读 viewport 或屏幕 padding 来判断 ordinary drop。本机 Root 注入既有 `canvasNodeSize`，优先 stored width / height，再 measured 与本机 renderer 的 350×230 fallback；这是与现有画布展示 / groups 约定一致的适配，不是原站测量顺序一致的声明。0 尺寸与缺尺寸分别有纯模型回归。

源码普通 stop 直接相加根 parent.position，本机 nested 文档用已有 recursive world position 保留世界坐标，目标嵌套壳也转世界坐标；这是本机文档协议适配。对于重复 ID、缺 parent、非有限坐标 / 尺寸、损坏 child metadata、祖先环或会形成循环的 video_group parenting，返回原图失败，不猜 0 坐标，也不部分附入。

## 保留的专属功能缺口

standalone 图片网格已有子节点停止返回 `blocked/standaloneStoryboardGrid`；image/script 图片派生目标返回 `blocked/storyboardImageDrop` 或已知 image-only 拒绝；特殊多选返回 `blocked/storyboardMultiDrop`。如果 ordinary detach 已完成后特殊目标拒绝，计划保留该 detach，不能恢复旧 parent 或偷偷附入特殊组。

这些返回值只准确识别边界，不代表网格、ratio 同步、容量、重排、尺寸、图层合成、practice、协作锁或真实服务已实现。Root 当前普通接线不增加这些服务能力，本批不能宣称所有类型的组拖放完成。readonly / ready / document identity 与 cancel / lost capture 由 Pointer caller 管理，取消不执行 stop parenting。

## 验证记录

2026-10-11 21:30:29，定向新 group-drag、既有 groups 与 actual NodeCanvas interaction：**3 文件 / 85 测试通过**，2.10s，exit 0；新模型 **67 项**。两份新生产 / 测试文件 ESLint 零 warning 通过，Prettier 已格式化。覆盖完整包含和边界、正面积 overlap / complete detach、同次跨组迁移、world / nested position、hidden / graph-order / source type / video_group、child metadata 顺序与名称、空壳、尺寸 adapter、selected-parent fallback、Alt 标记、live no-op、特殊阻断、输入冻结 / Strict replay 与损坏数据原子性。

actual Root 最终接线、自动平移、普通 pointerup / cancel、原生桌面 / 窄屏及整套工程检查由根批次统一登记；纯计划和 JSDOM 不等于原站真实账号、原生特殊网格或手机 / Safari 已验收。
