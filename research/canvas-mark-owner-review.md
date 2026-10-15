# 元素标记 controller 与 lazy entry 所有权复核

2026-10-12。先核对 [原始媒体模式协议](./canvas-media-focus-mark-source-audit.md) 第6–7节和 [纯模型/source合同](./canvas-mark-model-source-audit.md)，再独立验证 Root 的 `mark-target.js`、`useCanvasMarkMode.js`、`useCanvasMarkEntry.js` 与真实 `CanvasMarkControllerBridge.jsx`。本 agent 只新增两份 review 测试和本文；生产修复由 Root 完成，没有改既有 focus/Inline/prompt/views、已冻结 Mark 纯模型/source，也没有启动完整工程检查或部署。

## 维护合同与验收范围

- owner 是接收 prompt/magicList 的 default IMAGE 或 VIDEO generator；识别 surface 是有实际前图内容的 IMAGE。IMAGE owner 可识别自己的图，不套 focus self ban。factory/parent、schema capability 与 write lock 分开；canTarget 在锁模板仍显示能力，enter/fresh 不许写。真实 global protection 由 caller 提供，不猜节点字段。
- source continuation 比较整份 URL 数组的 JSON 值：新数组同值继续，后位 URL 改变也取消。source 删除、变类型、无内容、blob/pending data、storyboard child 和 adapter 换代不接受旧 response。非 target 节点与 edges 不由 Mark plan 改写。
- 每个 document owner 和 mode object 独立；same ID 的 document/mode A→B→A 不接旧 point、sync、cursor、retry、return、cancel 或迟到 finally。取消旧 operation 不得解锁正在识别的新 operation。这里只使用真实文档/mode换代，不构造没有服务证据的原子同 UUID 复用协议。
- 新 point 串行。先投影末次 draft，按20个正则 occurrence 校验，默认 source 缺失时不读图、不创建 pending；真实响应后再投影当前图、重验 max，然后对原 raw graph CAS 一次。cursor=0保留、成功消费为 null，失败 point index 不回收。不会以 point 数或 unique API ID替代 max。
- 成功 graph 接受后 source→target edge 完全不变，保末次 prompt、model/count/mode/settings/advanced/其它 data。flush false/throw 保 accepted token/metadata/point 和错误，后续 retry 只刷最新 graph；不重新读图、识别、建 plan 或增加 history。投影/CAS失败不 flush、不造成功 point。
- prompt badge 的选择同步只改临时 selected index，没有图/historical写入；surface选择按首次同 ID token，index由真实 point或合法 saved metadata校验，删除按首次 token/ASCIIspace+trim、清一项 metadata。有图变化时分别一次 projected CAS；Core已prune最后token/meta时只更新该真实临时 point，不造 graph/history。prompt badge 菜单的全部同 ID替换由独立 codec 负责，不把两条 source 规则混为一条。
- Escape/返回清临时 UI、保已接受参数和图；返回保持当前 zoom、400ms。blur/hidden 只取消在途 point，保模式与之前成功 points；pagehide 退休模式并 abort operation，保 accepted graph。unmount/owner失效同样拒绝迟到读图/识别。
- lazy entry 仅点击有资格的入口时加载；退出/文档换代/失去 ready、readonly 或 target capability 后不消费旧 import。失败显示真实 chunk 失败并允许重新请求，成功模块可缓存复用；StrictMode replay 必须最终正确 active/target/bar，并保真实失败提示，不能可选链吞掉 entry。

## 强回归与失败证据

新增 `src/features/canvas/generator/mark/useCanvasMarkMode.review.test.jsx`，首轮冻结46项运行真实 controller、resolver、纯 graph/token 函数、typed识别 wrapper、最新 graph getter、project/CAS/history/flush。DOM surface 与 sibling img 实际挂到 document；多数 reader 注入明确 raw PNG fixture，另有一项直接运行真实 natural-image reader，按1280×720检查 drawImage、PNG前缀剥离、精确 payload 与资源释放。JSDOM canvas API 和 natural尺寸为显式测试适配，不证明图像真实解码或原生 GPU。

新增 `useCanvasMarkEntry.test.jsx`，12项渲染真实 hook 和动态 import 的真实 Bridge/ModeBar，不 mock controller。loader 的失败/延迟是明确可控网络夹具。StrictMode 用 ErrorBoundary 记录真实生命周期异常；强断言要求 active=true、准确 target、实际 ModeBar、loader仅一次且无失败通知，不以组件加载或空异常日志代替。

首轮两文件49项为47 passed/2 failed，19:00:13 /1.76s，日志 `artifacts/canvas-mark-owner-review-initial-tests.log`：

1. 确定生产问题：StrictMode cleanup 清 `apiRef.current`，replay entry effect 在 Bridge 原37行直接 `.enter` 抛 TypeError，实际显示 `bridge runtime failure: Cannot read properties of null (reading 'enter')`，模式未打开。Root将 API lifecycle layout effect 移到 publish/entry effects之前，每render更新 currentController ref，setup在无额外render的 replay也重新发布API；保留真正 enter失败提示，未用可选链吞请求。
2. pagehide那项初始夹具错按 blur 写成保 mode；Root并行已实现明确 pagehide retire合同，因此修正为单独的退休测试，仍要求真实 signal.aborted、late false、accepted raw graph不变、一次 history、没有第二次识别。不是将其冒称生产 bug，也没有删取消强断言。

扩展57项为56 passed/1 failed，19:02:31 /746ms，日志 `artifacts/canvas-mark-owner-review-expanded-tests.log`；随后增加 same-document新 in-flight取消回归，58项为56 passed/2 failed，19:03:37 /715ms，日志 `artifacts/canvas-mark-owner-review-cancel-epoch-tests.log`。两项证明同一生产漏洞：公开 `cancel:retire` 没有 captured owner/mode门控，旧 document或旧 mode API能退休新 same-ID mode并 abort新的 point。Root改外部 cancel 同时检查 capturedOwner与当前 renderedMode；内部 cleanup/pagehide仍直接 retire。

修复后联合130项初次有1个夹具失败，19:04:41 /860ms，保存在 `artifacts/canvas-mark-owner-review-after-cancel-fixture-tests.log`。测试自己以 `{...original,documentKey:'A'}` 发布了新 raw wrapper，却要求原 wrapper identity；现先捕获实际 currentRaw，再强断言 old.cancel前后严格同一个对象，继续保 active/target/history与新operation成功断言。没有改生产或用 deep equality弱化图不变验证。

## 首次冻结结果与实际边界

Node24.19.0，19:05:01 /1.23s，controller46、entry12和已冻结 pure/source72，五文件 **130/130通过**。日志 `artifacts/canvas-mark-owner-review-final-joint-tests.log`；两份新测试定向 Prettier及ESLint零警告通过。本文独立格式检查另记录。

这些回归证明所列本机 controller、合法adapter、真实Bridge/StrictMode和 graph协议，不代表真实运营识别。default服务仍明确未连接；成功 labels/bbox均是测试 fixture，没有生产 fake suggestions。NodeCanvas/Viewport/真实generator入口、dialog-stack/pointer/键盘实际接线、原生图片/CORS/服务及持久化整链由 Root 的 actual App与浏览器另验，本批 controller结果不提前替代。旧聚焦337/4500完整检查属于上一快照，Mark本批须待全部源码冻结后重新完整check；目标继续未完成，未部署。

### Core prune 后临时 point仍可操作

Root随后发现此前“没有saved metadata就禁操作”的初步建议收窄了原站功能：用户Backspace删除最后token，generic Core `w`会删除magicList，但已经识别的临时point仍在。源 `3u6` 删除/选择链不要求 metadata存在，必须仍能切建议或删 UI，不能因图计划没有变化而拒绝临时动作。Root已授权解冻本 agent的两纯计划及对应测试；严格损坏 entry/数组/建议/index防御保留，正常缺entry单独处理。

追加controller第47项从真实合法识别起步，发布明确Core结果（最后 token已删/metadata undefined），要求该同mode point可切index再删UI，raw graph严格同一对象、commit/flush次数和一条history全部不变。首次三文件105项104 passed/1 failed，19:09:56 /836ms，日志 `artifacts/canvas-mark-pruned-point-before-controller-tests.log`：当时Root mutate对null graph plan直接返回false，故source可达临时操作失败。该fixture不冒充实际输入原子/150ms完整接线，Rootactual App另验Core；先前130是此次修改前快照，最终联合结果待修复后补记。

Root随后传真实 currentPoint.suggestions给纯 select，在确知没有persisted change时仍更新/移除临时点，不写graph/history/flush；如果projected graph含尚未150ms提交的真实draft，则一次CAS/flush该draft，保最后正文。又直接核原 tU/oc/ou没有global loading门控，只有新图片op因 loading拒绝；Root移除旧confirmed操作的全局busy guard，未放宽新点串行。

补三项强回归：已有confirmed point选择/删除与第二识别pending交错，旧操作各自一次CAS/flush，loading持续true，迟到response保最新选择/不复活被删magic，最终三次历史且边原引用；以及projected最后token删除没有额外图plan时，仍保存末次draft并删临时点，准确raw CAS、只多一次history/flush。旧mode迟到finally不能解锁新op仍同跑。三文件108/108，19:15:03 /873ms，日志 `artifacts/canvas-mark-confirmed-pending-interleave-tests.log`。

最新冻结为 Node24.19.0，19:16:06 /1.06s，controller50、真实entry12与pure/source74，五文件 **136/136通过**，日志 `artifacts/canvas-mark-owner-review-source-complete-tests.log`。重开修改的纯模型/测试与新review/entry定向Prettier、ESLint零警告，本文和model source审计独立格式通过。其它已冻结capability/token/source文件未改，没有完整check/部署/真实运营请求。

### Generic prompt core 的只读核对

`3lfysz4968xc9.js` @22703的通用 `w` 在新prompt上仅收正则ID集合，magicList非空且有unused key才保留引用项；全引用保持原对象，原空表不规范化，耗尽patch undefined后交普通A去undefined。A本身只merge/normalize/filter undefined，不在一般非prompt patch上主动清metadata。IMAGE `27g5ro4e8nocv.js` @9057、VIDEO `24mj3em3412ij.js` @180231都绑定该 `handlePromptChange`，不是ScriptV2私有语义。

本机 `storyboard/script-generator-model.js` 的 `patchScriptV2GeneratorPrompt` 已实现同一源core prune和另一个camera compact协议；新增generic magic维护由Root独占自己的模型/测试与useNodeGenerator/Inline draft接线。本 agent只报告准确source与“基于最新projected raw params处理末次正文”的应用边界，不改Root实现，也不把ScriptV2相机三分支顺手泛化到本批magic任务。
