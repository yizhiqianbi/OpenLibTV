# Canvas 边选择键盘合同补充

2026-10-14，只读原归档。新增本文与 [proof](../artifacts/canvas-edge-selection-keyboard-source-proof.json)，不修改原37／47冻结证据，不执行原脚本、网络或浏览器。本补充与本机独立模型／owner测试分别记录，不能据此宣称全Canvas键盘复刻完成。

actual main 的 hW 明确为 **Shift、Control、Meta**，keyboard helper接收此list，ReactFlow实际调用在 tY&&!aG 时启用，否则null。Enter／Space 调 addSelectedEdges，由 multiSelectionActive 决定追加还是替换；已选edge的键盘追加不切换为未选。普通pointer click仍只以Ctrl／Meta切换edge，Shift不能从keyboard list擅自移入pointer toggle。

share／workspace preview明确multiSelectionKeyCode:null，但仍elementsSelectable:true，edge可定位／选择。因此这些只读preview的键盘Enter／Space为替换，pointer Ctrl／Meta仍走业务g的toggle；写动作继续按deletable／readonly门控。

实际Y的focusable独立取 edge.focusable??store.edgesFocusable，tabIndex由它决定，不能绑定selectable或endpoint interactive。shared键盘dispatcher另检查known model、keyboard-a11y disabled、mark、selectable和focusable；没有单独interactive门控。Escape所传nodes参数省略会清节点选择，已有47proof已记录。

本proof 5个原文件／9条摘录，文件SHA、片段SHA及UTF16／Unicode code point／UTF8三套半开坐标全部实际重算核对，failures为空。

| proof ID                                  | research/source 文件 | UTF16范围          |
| ----------------------------------------- | -------------------- | ------------------ |
| `libtv-main-multiselection-key-list`      | `21_0xvlvkw1sz.js`   | `[710511, 710544)` |
| `libtv-main-multiselection-active-config` | `21_0xvlvkw1sz.js`   | `[964577, 964636)` |
| `libtv-main-keyboard-options`             | `21_0xvlvkw1sz.js`   | `[961612, 961758)` |
| `libtv-shared-layer-edge-renderer`        | `10v03g6udfcrl.js`   | `[32776, 34871)`   |
| `libtv-shared-layer-event-protocol`       | `10v03g6udfcrl.js`   | `[35182, 36327)`   |
| `libtv-shared-layer-svg-keyboard`         | `10v03g6udfcrl.js`   | `[40414, 41624)`   |
| `rf-selected-edges-and-unselect`          | `1kb-4b4zv9_2a.js`   | `[63308, 63797)`   |
| `libtv-share-reactflow-props`             | `16b_iv9sex3zl.js`   | `[30491, 31000)`   |
| `libtv-workspace-preview-reactflow-props` | `16k_l1hir0zic.js`   | `[15706, 16195)`   |

本机owner测试通过真实hook API表达controller意图，不使用模型mock、不把合成API事件当真实键盘或浏览器指针。选中状态不得写入graph/history；文档、readiness和readonly所有权变化，以及同一提交中删除再建相同ID，都需使旧选中失效。混合nodes／edges删除事务仍是本轮明确边界。
