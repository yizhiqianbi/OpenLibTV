# 普通参考排序与未提交提示词事务复核

后续普通删除已于2026-10-13完成完整source链核对与普通分支接线，见 [删除验收](./canvas-reference-delete-functional-audit.md)。下文“本机删除保原文／missing”和“删除未改”记录上一轮冻结行为，不能作为当前标准；IMAGE only-order仍是排序规则。当前媒体删除会清理／重编号并同次消费最后草稿，特殊锁／全局cascade仍缺。

2026-10-13。按本轮授权静态读取工程和公开归档，并使用真实 NodeCanvas 复验。未运行归档脚本、原站服务、浏览器或完整 check；没有登录、账号资源和部署操作。本文件仅记录普通参考事务，不代表其他生成器或全部原站功能已验收。

## 1. 已复现的本机问题

IMAGE 与 VIDEO 的**修前本机通用排序协议**均可重现：目标已有两个真实图片参考，保存原文 A 为 `{{Image 1}}`；用户在 150ms debounce 内编辑成 B `{{Image 2}}`，随即把第二张参考拖到第一位。既有普通排序模型按稳定 source ID 重写正文，预期下一值又恰好是 A。图中顺序已变为 `second, first`，但草稿投影把正文覆回 B，DOM badge 因而指向 `first`，改变了本机当时要求保持的素材绑定。继续追完整 source 后确认 IMAGE 源协议本来保留 literal token，故不能把这个旧 IMAGE 预期当作原站要求；本轮已纠正，见第 3 节。

实际故障链为 `reorderReference` → `commitGraph` → 默认 `project(next)`。`pendingCanvasDraft` 以正文是否等于 draft baseline 判断可投影；下一值 A 等于旧 baseline A，故再次投影未消费的 B。仅阻止 next 投影仍不足：输入 controller 外部 value 原本就是 A，受控 effect 观察不到 value 变化，会继续保留 DOM B 和旧 timer。

本机普通删除不是这条重映射链。`removeGeneratorReference` 保留调用者最新正文，不删除 token；A `Image1`、B `Image1 Image2`、删除第二参考后本机目前保存 B，第二个 badge 标为 missing。真实 IMAGE/VIDEO 两项均确认只断目标边、保留素材节点、延迟保存不复活连线，且撤销重做只有一次图历史。`connectMention` 的 `promptOverride` 也只是原样写最新正文，没有此处的编号重写；重复连接不提交。此轮未发现它们具有同一 baseline 碰撞，不能因排序故障扩大删除规则，也不能把本机删除保原文直接外推为完整原站 store 的删除语义。

## 2. 修复范围与失败语义

本作者仅修改 `useCanvasGraphActions.reorderReference` 和新增独立测试。输入最新正文先通过 `patchCanvasMagicPrompt` 清理已删除的 Magic metadata，作为撤销基线；排序后正文再次走该正规化，保留实际仍引用的 ID、未知 token 原文及其他参数。提交 next 指定 `explicitPromptNodeIds: [targetId]`；previous 仍正常投影所有其他草稿，不抹除兄弟节点输入。

Root 在 Inline 的成功排序回调中同步重读已发布当前文档的目标正文，确认同文档后调用 prompt ref `acceptCommittedValue`。它取消 timer、消费 DOM 草稿，没有第二次 `onChange` 或图历史。无效／未变化 order、readonly、未 ready、切文档、卸载、投影失败及 CAS 期间竞争追加均返回失败，保留原图或竞争后的有效图、Magic metadata 和用户草稿，零历史。删除和连接代码未改。

## 3. 公开源码规则及已发现差距

以下是归档原文件零基字符串字符位置，不是行号，也不是 UTF-8 字节偏移。均只读取，没有执行 bundle。

| 源证据                                           | 位置及协议                                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `24mj3em3412ij.js` VIDEO `r1`                    | 190411：typed 或 mixed 排序，更新相关 order；用 `rewriteMentionTokensOnReorder` 根据稳定引用身份重写正文，再 `tl(patch)`                        |
| `27g5ro4e8nocv.js` IMAGE `eL`                    | 10927：仅 `eP({[type + 'ListOrder']: ids})`，没有调用重写 helper                                                                                |
| 同 IMAGE `useGeneratorCore`／`eP`                | 9057 附近：未传 `normalizeParams`；`eP` 调 `ex(patch)`，额外仅处理 slashPreset 的 panoramic 清理。本文件没有 `rewriteMentionTokensOnReorder`    |
| `3lfysz4968xc9.js` `useDeleteGeneratorReference` | 19801：直连先删 edge；组引用按展开成员决定删 edge 或追加 excluded ID，然后 recalc incoming。hook 自身不直接改正文；后续 store recalc 是另一路径 |
| 同 `useGeneratorCore.handlePromptChange`         | 23635 附近：清除未引用 Magic ID；CameraPreset 有独立规则，不把普通媒体排序与其混为一个协议                                                      |

旧 [inline source 审计](./canvas-inline-generator-source.md) 把 Image／Video 的排序重写合并描述，范围过宽。此轮继续核对完整 IMAGE 链，并按 Root 授权直接拆分：**source VIDEO 重写引用编号，source IMAGE 仅改当前 typed order、保留原文字面值**。

完整 IMAGE 链为 `eL(10927)` → `eP(9178)` → Core `handleParamsChange A(22528)` → store `updateNodeData(110198)`。Core 合并 `paramsRef.current` 与当前 order patch，没有 IMAGE `normalizeParams` 注入；store shallow 合并 data／替换 params。其 `t4(79043)` 仅 name／label 正规化，`t5(79207)` 处理 task owner，`t6(79514)` 删除显式 undefined，`ie(81070)` 为归档内空调试函数；这些都不调用 `ig` 重算或改正文。

排序后 renderer `eh(6948)` 从实际 params 经过 `42seoipo_5lv1.js` 的 `initImageGeneratorParams(33992)` 原样复制 prompt，并用 `applyMediaListOrder` 排序显示列表。Factory 的 `NodeGenerator`／`useIncomingNodeData` caller 见 `3u6hjewm8qox_.js` 142858 附近；`1q5w-zbtkz5ka.js` 的 `useIncomingNodeData(772889)` 签名包含上游媒体、目标 refImages／excluded／focus nodeId，**不包含目标 params 的 order 或 prompt**。只有本次 order 写入时 incoming 对象身份保持，不触发 Core incoming effect。即便其他合法上游变化触发该 effect，IMAGE `eT(8725)` 只处理不可用模型回退，`1jgo2qrsqidfu.js` 的 `ensureMediaListOrder(13360)` 只把已有列表 ID 投影为 order，不重写正文。IMAGE model key 未变，也不会触发 model-switch effect。

store `ig(84695)` 确实包含按旧／新稳定 ID 进行的 token remap／清理，不能仅靠 eL 没有 helper 名就宣称所有路径都不重写。但 IMAGE order 的 `updateNodeData` **不调用它**。`recalcIncomingForTarget(117447)` 和真实 edge 变化是显式入口；例如 `deleteEdges(116272)` 会逐目标调用 ig。因此本轮 only-order 结论限普通 IMAGE 排序，不等于原站所有 IMAGE 删除／重连动作都保留正文。此轮按授权未改变本机 delete／connect 规则。

最终纯模型在 `node.type === 'image'` 时只更新当前 typed order 和调用者最新 literal prompt，其他 typed／mixed order、空白及未知 token 保留；VIDEO 原有完整 typed／mixed remap 不变。实际 App 的 IMAGE 排序现在明确断言 B `{{Image 2}}` 保留、order `second, first`、badge 指向 `first`；VIDEO 仍断言 A `{{Image 1}}` 与 badge 指向 `second`，继续覆盖 baseline 碰撞。所有全图和历史强断言保留。此前四项“旧通用协议已修”的日志只作为历史事务证据，不替代最终 source 对齐记录。

## 4. 真实检查档案

测试只 mock 公共内容读取目录，并使用真实公开 models JSON、稳定本地工作区 actor、真实 lazy generator、实际输入 DOM、图操作、草稿投影、历史及 localStorage。未 mock 生产图模型或生成成功。仅在实际编辑器 mount 后冻结 timeout，以确保操作确实发生在最后 150ms 窗口；保留真实 promise 生命周期。

| 档案                                                                                               | 实际结果                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [初次修前日志](../artifacts/canvas-reference-draft-review-before-fix-tests.log)                    | 01:29:14／2.52s，4 项失败。其中排序两项是真实故障；删除两项是 fixture 未正规化初始 schema 导致 timer 物化 defaults，不能当作删除故障                                                              |
| [正规 fixture 修前日志](../artifacts/canvas-reference-draft-review-canonical-before-fix-tests.log) | 01:32:55／2.22s，2 通过／2 失败，仅两种目标的排序失败                                                                                                                                             |
| [冻结强断言修前日志](../artifacts/canvas-reference-draft-review-frozen-before-fix-tests.log)       | 01:34:10／2.24s，2 通过／2 失败；保全图、source／edge／order、badge 绑定、200ms／pagehide 与一次撤销重做                                                                                          |
| [GraphActions 修复联合日志](../artifacts/canvas-reference-reorder-graph-fix-tests.log)             | 01:40:43／1.06s，3 文件／25 项通过；新独立 hook review 13 项，既有 GraphActions 8 项和 draft 4 项                                                                                                 |
| [桥接后实际 App 历史日志](../artifacts/canvas-reference-draft-review-after-fix-tests.log)          | 01:45:58／2.26s，1 文件／4 项通过；当时仍为本机旧通用重映射协议，不能当作最终 IMAGE 源规则                                                                                                        |
| [最终 IMAGE 源协议对齐日志](../artifacts/canvas-reference-image-source-order-alignment-tests.log)  | 02:04:44／2.64s，5 文件／37 项通过；pure 8、hook review 13、实际 App 4、既有 GraphActions 8、draft 4。IMAGE literal／only typed order 与 VIDEO 重映射分别强验，DOM／全图／历史／迟到 timer 均保持 |

Node 为 bundled 24.19.0。新增实际 App 文件、GraphActions 与新增 hook review 的定向 Prettier／ESLint 零警告已通过。修前日志不覆盖。本作者没有运行完整 check；Root 另负责布局、浏览器验收和最终全检。真实生成及运营写服务仍未接入。
