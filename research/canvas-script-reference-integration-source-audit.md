# ScriptV2 新增参考：实际 App 接线审计

2026-10-12。本批依据归档公开脚本静态核对，再验证本机 NodeCanvas、专用生成器、参考模式、实际 FileReader 边界和共享本机资产选择器。没有执行原站 bundle、登录、读取私人资产详情、真实上传/生成、消费或发布。Root 持有生产接线与全工程检查；本文作者仅维护实际 App 回归与本审计。

## 原站合同与本机接线

- `1sutpu54cdy46.js` module327466 的 M @3539 为三入口菜单：画布参考、本地上传、个人资产库；input @4958 接受 PNG/JPEG/WebP/GIF、多选，超过30MiB才跳过。源先创建 blob 图片，再发真实异步上传 job。本机 Canvas 级 `useScriptV2ReferenceImport` 读取 data URL、明确 localMediaReady/resourceMeta，整批原子提交；这属于本机读写适配，不能叫原站上传完成。
- 同文件 N @456、w @760、S @1542：添加图片资源、标准 source/target handle edge；资产按选中 Map 顺序逐项请求详情。`2mce1ay9u3g9g.js` @21427 的上游图片取 target raw x−430/y，store 避碰向下移动；每项 unshift，因此最终新节点逆序前置、edges 按处理顺序追加。本机纯导入计划和 CAS 保这些可核实字段、位置与顺序；原资产详情 API 未接，运行 picker 使用 canonical 本机资产库与显式 serialized-data adapter。准确字段、解析第一张有效图片和剩余服务边界见 [导入源码审计](./canvas-script-reference-import-source-audit.md)。
- `3zez5ighjd7k4.js` module450681 @17969，候选调用 @18682 明确 `scriptV2ImageOnly:true`，保存 pickable/connected/reasons/limitCount；mode 接管普通移动、选择、连线、删除。`21_0xvlvkw1sz.js` @772700–776288 分开普通节点、组和框选：成功节点点击取消该 source 的选择并选中 target；connected body 本身不切换，取消按钮另删除 edge。组按可用叶子添加并报告跳过，不能用一条 GROUP edge 替代本流程。
- 同文件 @283018 起是专属参考框选，超过5px才激活，候选图节点用世界位置与 strict overlap；它不是普通 selection rectangle。@286098 的返回按钮保持当前 zoom、400ms 移向 target 并退出。@958500–959149 的 pane click 在下一帧追加 target 的 selection，不清其他选择。Root 通过 Canvas 级 controller、专属 mask/bar、模式键盘和 pointer 边界接入；连续点击/pane/native owner 修复证据另见 [所有权复核](./canvas-script-reference-owner-review.md)。
- `3u6hjewm8qox_.js` @665172 的 renderer 状态分 self/pickable/connected/blocked；专用生成器 eX 及 explicit target OR 普通单选合同见 [工具栏 target 源码审计](./canvas-script-toolbar-target-source-audit.md)。本机模式 target 保生成器，普通唯一选择分支仍独立保留；未实现 mark/focus 模式，不把 DOM focus 或 fit 当这些模式。

Root 当前图事务投影最后输入草稿，以原 raw graph 比较交换，接受后由文档 autosave flush；Quota 失败保留已接受 graph，顶部只重试存储。导入 controller 属于 Canvas，不随 inline 选择卸载；切文档/失 ready/readonly/目标失效取消，A→B→A 不接旧结果。源 UUID 不复用；本批不虚构无中间失效事件的一次原子同 UUID 替换的 incarnation。

## 实际 App 回归覆盖

`src/features/canvas/NodeCanvas.script-reference.integration.test.jsx` 直接 render 真实 NodeCanvas 与其业务组件。公开内容 hook 只注入已保存的模型/support/preset代表样本；两个生成器及共享 asset picker 的动态 import、controller、draft、图、history、storage、dialog-stack 都使用真实实现，没有 mock implementation 或绕开 Suspense。

本文件11项覆盖：

1. 图片可选、文本 blocked；加入图片仍保 target/widget/原节点位置及 view，写入 source_images，一次撤销恢复。
2. 已连接 body 无写入/无 history；明确取消按钮删除唯一入边，一次撤销恢复。
3. 混合组只接图片叶子、保 parent-relative 坐标；一组点击是一事务，undo/redo 不重复。
4. 5px阈值内无事务；实际 board pointer 框选两图、一次事务，不移动图或普通 selection。
5. 参考模式不拖图；Escape 取消框选与迟到 pointerup，保 target 和 widget。
6. 真实 jsdom FileReader 读取两张合法 PNG；新 root 图片逆序前置、edges顺序、local metadata；一次 undo/redo 与卸载/重新加载恢复。
7. Storage Quota 阻写后，DOM 保已接受图；顶部重试写入同一 new ID，一次 undo/redo，无重复 history。
8. doc 切换重用节点 IDs，旧参考框选的迟到 release 不写新文档。
9. 受控 FileReader 的真实读取服务/controller 取消边界：切文档 abort，捕获的旧 onload 不能插入新文档。
10. reader 在途时输入最后草稿并切到另一普通节点；不会 abort或重定向原 target，完成后同一次图保存保最后输入。重新选脚本恢复原输入，一次撤销只去除导入图而保草稿。
11. 真实共享本机 asset picker 的 IMAGE-only gate；预览不选择/写图，nested Escape 回预览触发器；成功导入后关闭叠层、回同一 prompt DOM，inline 没有重建，图/history/view/undo/redo 均验证。

RAF 在该 App 文件中固定而不执行，避免图动画污染回归；逐帧 selection 队列由所有权复核的可控 RAF 测试另验。矩形尺寸与 pointer capture 为 jsdom夹具；触控、真实布局/命中、原生 Tab、浏览器文件选择器和视觉顺滑度不能据此宣称通过。第9、10项的 FileReader 是受控异步夹具，只证明 caller 生命周期；第6项才是 jsdom 实际文件读取。

## 初次失败与修正

原9项初次结果8 passed/1 failed，日志 `artifacts/canvas-script-reference-app-initial-tests.log`（15:54:40 /3.23s）。失败仅在 Quota 断言错误地把 DOM 顺序当 raw nodes 顺序：Viewport 为绘制将 group 放前，而 source资源写入仍是 unshift 新 image。没有生产顺序问题。

修正为从 DOM 识别唯一新增 image ID，要求唯一 IDs/DOM ID集合与持久化一致；持久化必须 `[newImageId,...originalRawIds]`，edge必须明确 newImageId。保留一次 undo/redo、旧 graph恢复及 redo结束断言，没有降低顺序、配额或 history 验证。另新增在途切选与共享picker两项。

## 检查与未验范围

官方 bundled Node24.19.0，16:02:33 /3.62s：新 App **11/11 通过**，日志 `artifacts/canvas-script-reference-app-owner-initial-tests.log`。随后与旧专用生成器12项及 preset7项联合，16:03:31 /5.95s，三文件 **30/30 通过**，日志 `artifacts/canvas-script-reference-app-final-joint-tests.log`。这些是本机真实组件集成回归，不能作为原生浏览器、全部 source、完整 check 或生产发布证明；Root 另记录全工程/build/原生范围。

当前仍是 local workspace，真实上传、私人资产详情、账号权限、生成/费用/订单及运营写服务未接。源资产 modal 全失败/部分失败关闭与本机保留失败队列不同，为明确防丢失适配。原始“整体复刻”目标继续未完成，工程尚未因本批重新部署。
