# 删除键的 hand 门控：独立源码补证

2026-10-13。本文与 [证明 JSON](../artifacts/canvas-delete-keyboard-hand-source-proof.json) 独立保存新增证据，不修改已冻结的全局删除 source 审计。只静态读取原站归档，未 import／执行 bundle、开浏览器、访问网络或账号、写服务、运行测试或构建，也未修改生产／测试／根维护文档。

实际合同是：**stored hand 和按住 Space 形成的 temporary hand 都禁用 ReactFlow Delete／Backspace。** 仅检查基础 locked／fullscreen resolver不足以证明完整删除键门控。

| 源码与 UTF-16 半开范围 | 实际证据 |
| --- | --- |
| `1fn_ozkqd_aiz.js` `[27914,27948)` | module37282 的 effective-tool helper为 `held ? "hand" : stored`；临时 Space状态不改变 stored mode，但影响实际 tool |
| `21_0xvlvkw1sz.js` `[751511,751680)` | `nP`来自 UI canvasToolMode，`nF`来自 useSpacePanHeld，`nG`比较 resolved effective tool是否 hand |
| 同文件 `[961119,961256)` | hand的 `cP` props明确 `deleteKeyCode:null`，并禁用节点拖动／连接／选择，允许画布平移 |
| 同文件 `[964746,964870)` | 最终 ReactFlow props在默认字段后应用 `...nZ,...cP,...n2,...oh,...oC,...cL`，因此hand规则覆盖默认删除键 |

证明对两个原文件保存 SHA-256，对四个原文片段保存 excerpt SHA-256；UTF-16 code units、Unicode code points、UTF-8 bytes分别计算，不能将UTF-16索引当作字节位置。

本机 keyboard hook应消费 effective hand条件，并保留文档ready／readonly、输入控件、dialog及其它工具门控。Root本轮的修前／修后测试是独立实现证据，本文件不预先宣称其通过。这里没有新增 Space keydown／keyup目标检测、其它工具完整覆盖或原站真机验收的结论；这些不得由四个静态片段推断完成。
