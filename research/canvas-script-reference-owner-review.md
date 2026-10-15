# ScriptV2 参考动作所有权与连续输入复核

2026-10-12。本次只读检查生产 controller、Viewport/节点接线、专用生成器、纯图计划、draft 投影和按需入口；作者只新增两份回归测试及本文，生产修复由 Root 完成。没有执行原站 bundle、账号/上传/生成请求或部署。

## 已发现并修复的问题

1. 连续参考点击的图事务均成功，但下一帧只保留最后一次 selectionChanges：原实现每次接受事务都取消上一 RAF，先点已选源 a 再点 b 时，a 的取消选择丢失。源 `21_0xvlvkw1sz.js` @775582 每次成功独立排 RAF 取消源选择并选中 target。Root 现用同 mode 的变更队列、单 RAF 顺序应用，退出清队列。新增 `useCanvasReferencePick.continuous-review.test.jsx` 首项覆盖两次点击同帧、两条边、最终唯一 target。作者执行该测试时 Root 修复已落盘，因此 `canvas-reference-continuous-review-initial.log` 为修复后通过结果，不能称失败基线。
2. 参考模式空白 pane 的无拖动单击未选中 target。源同文件 @958500–959149 的 onPaneClick 只追加 target 的 selected=true，不清其他选中节点。新增同文件第二项先进入模式并保留 unrelated，再模拟同坐标 pointerdown/up，断言下一帧追加 target，且不写图/保存。修复前真实失败日志为 `artifacts/canvas-reference-pane-review-initial.log`（15:53:08，1 failed /1 passed）；Root 将该动作接入同一队列后通过。
3. native chooser 打开后尚未开始 reader 时，uploadOwner 没有随 target 的已观察失效状态退休。旧布局 effect 只处理 queue/pickerOwner；readonly、未 ready、target 删除、整脚本生成和变类型被实际提交再恢复时，迟到 onChange 可以复活旧 request。Root 增加 uploadOwner 校验并将 native cancel 接线到 cancelChooser。新增 `useScriptV2ReferenceImport.native-owner-review.test.jsx` 五项覆盖上述提交的状态转换；原 target 被恢复而非虚构一次原子同 UUID 替换。作者执行时修复已落盘，初始日志同样只是修复后通过结果。

## 其余复核范围与证据限度

当前图写入先投影最后输入草稿，再以原 raw nodes/edges/models 做同一 CAS；接受后 flush 当前发布图。Quota 失败保留已接受图，reader 及资产 importedIds 只重试失败项，不重新创建成功项。Canvas 级 reader 保留其最初 target，普通 inline 选择切换不重定向；文档 A→B→A、失效和卸载通过 owner/取消隔离。Map 部分资产导入按 result.index 映射，不能将成功项加入失败重试。复核未发现额外确定生产 bug，这不是证明所有异步序列均已覆盖。

Viewport 保留 explicit reference target OR 普通唯一选择，而不把 target 自动改为普通 selection；普通框选隐藏和模式 target 显示各自独立。源 mark/focus 模式仍未实现，不把已有 DOM focus/fit 视为这些模式。按需入口保两类 generator 独立 import、owner/ready 迟到隔离和 eager 旧 CSS 顺序；实际 build/module 网络/CSS 及 App 验证由 Root 另记录。

源 UUID 不复用。一次原子更新中的同 ID 替换与普通 immutable 参数更新没有可验证 incarnation 协议；不以 object identity 取消合法编辑。测试已观察删除后恢复的失效生命周期，不声称覆盖无任何中间失效事件的同 ID 重建。

## 检查

官方 bundled Node24.19.0，15:55:22 /1.08s，四文件 **47/47 通过**：原 reference-pick 13 项、原 import 27 项、新连续/pane 2 项及新 native owner 5 项。日志 `artifacts/canvas-reference-owner-review-final.log`。仅覆盖模型/controller 回归；不是浏览器、完整 check 或生产验收。真实原站上传、私人资产详情、生成、费用、认证与整体复刻仍未完成。
