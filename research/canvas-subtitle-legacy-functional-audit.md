# 旧字幕读取、片段物化与保存恢复（2026-10-18）

本批接通旧HTML字幕的读取和工作文档升级，不是全部字幕迁移已完成。本机更新，未部署；没有使用登录、小号、账号资源或原站写接口。

## 来源与规则

使用归档 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。REA retained record精确查询仍为0条，继续有界静态核对，不运行原bundle。6段标记、UTF-16/字节位置和哈希保存于 `artifacts/subtitle-legacy-source-evidence.json`。

- `iR/iO`：字幕优先取第一个显式composition，再取`#root`，最后取body；契约缺省/不可解析为0，只有高于4才拒绝。未知时基默认source，字面timeline经trim/小写识别；轨道值四舍五入并限为非负数，缺省为0。普通文字另有严格`i1`校验，不能共享同一宽容开关。
- `ll/iP`：已有句子ID先全部保留，缺失ID按正文/起始/时长生成稳定SHA-256短ID，并用递增后缀避免碰撞。正文、逐字信息、clip/library归属、隐藏状态及直接子template元数据各自保留。
- `iO/oQ`：缺画幅、超过4条字幕轨、未来契约及超过2MiB仍拒绝。旧文档的重复ID、同轨重叠、逐字越界、总时长溢出是诊断，不能统一当作读取失败而丢掉整份字幕。
- `rQ.prepare`：冻结打开时片段窗口，先对未绑定字幕进行物化，成功后才把该工作根的契约标记为v4。已经绑定的旧文档不会仅因读取就强制改写内部版本；存档wrapper的contractVersion仍依照源`lL`为4。
- `ld`：预览覆盖样式始终声明dark color-scheme与隐藏规则，透明iframe画布不能依赖父页面的默认配色。

## 实际实现

共享DOM属性/序列化移至 `text/timed-text-dom.js`；`html-document.js`保留兼容导出和严格普通文字reader，字幕独立使用 `subtitle-source-document.js`。工作DOM将轨道属性正规化到源解析值，原HTML仍在来源缓存中保留；没有自动把全部旧文档写回浏览器存档。

`readClipTextHtml`默认继续要求显式composition。仅字幕加载器传`requireComposition:false`，将语义校验交给字幕reader；HTTP失败和取消信号继续透传，不绕过网络错误。空且没有片段元数据的文档在物化后仍明确拒绝，不能被标记为可复用的成功缓存，显式重试会重新读取。

物化保留完整源时间和打开/实时窗口并集，未绑定文档按源更新内部契约。已经绑定的v3仍可以编辑和恢复内部v3，外层按规范存档为v4；不伪造一个统一强制升级按钮。缺少总时长时可按实际片段区间新增/编辑；预览器增加显式`requireDuration`协议，字幕可以保留未知总时长0，普通文字仍必须有效正数。媒体播放继续使用原生媒体/片段时钟，没有编造字幕时长或生成结果。

源诊断在列表和样式面板展示，成功内容仍可读取/编辑。已有诊断不等于后续事务可以制造新的问题：新增重复锚点、同轨重叠或逐字越界会拒绝整个patch批次并保留原文；原有重叠文档的单纯正文编辑可以继续。原始重复ID保留并提示歧义，不在读取时任意重命名既有ID。

预览支持body根，仍要求有效画幅，避免把空白iframe当成准备完成；字幕的未知总时长与普通文字的严格时长要求分别维护。深色配色与隐藏规则沿原`libtv-subtitle-overrides`生成，不新增全局CSS或独立播放器/历史实现。自定义脚本继续保留原文并明确unsupported，不因旧契约而执行原脚本。

## 专项与原生页面

最终剪辑域加传输reader **56文件/715项**通过，13.95s后的配色补充最终日志 `artifacts/subtitle-legacy-final-joint-tests.log` 为14.08s。覆盖缺省及1/2/3/4契约、根优先级、稳定ID/冲突、轨道与时基、逐字/绑定/隐藏、诊断与硬拒绝、工作根升级、未知时长、原文不变、事务原子性、真实Graph/Draft/Autosave确认后的完整时间轴一次undo/redo和空内容失败重试。

初轮18文件/180项中2失败：一项旧断言把SOURCE大小写当作拒绝，按直接源证据改为正规化；另一项暴露宽容reader使新patch重叠也被接纳，新增“保留已有诊断但拒绝新增结构错误”的事务检查，原整批拒绝/字节保留断言继续通过。新集成测试两次只在历史空布尔数组被规范化为`[false]`处失败；夹具最终显式提供完整每轨默认值，仍比较撤销/重做的完整时间轴，没有放宽正文、URL、历史、clip关联或实际autosave断言。

Chromium使用前批GUI创建的6秒视频派生的三个**合成旧格式样本**，在独立context中模拟来源请求，未写入public或用户浏览器：

1. body根、无契约/ID/时基/总时长：准备为工作v4，ID为`c-9ba2d8`。
2. v2、缺句子ID、浮点轨道与逐字正文：正规化轨道并准备为工作v4，ID为`c-fe1710`。
3. 已绑定v3：保持`bound-old`，外层存档为4、内部HTML继续为3。

最终 `output/playwright/subtitle-legacy/native-final.txt` 记录三种样本均先读取而没有存档，然后原生输入并**等待真实自动保存确认后**提交；一次撤销回无本地HTML存档，一次重做的整个保存时间轴与编辑后完全相同。原HTML/VTT URL和bindingClipIds保留，同一video DOM且readyState=4；刷新后正文、ID和实际iframe内容恢复。390×844宽度与scrollWidth均390，pageerror为0；未统计所有console资源输出，不称console零错误。

首原生 `native-first.txt` 超时于禁用的字幕工具栏，实际原因是普通文字预览器仍拒绝未知总时长；修为字幕专属协议后 `native-second.txt` 功能链通过。随后截图回读发现缺少源dark color-scheme导致透明字幕iframe绘制白底，已补源覆盖规则并完整重跑。当前 `body-390.png` / `v2-390.png` / `bound-v3-390.png` 为最终截图，body及v3已回读确认蓝色视频和白色字幕叠加；同名早期白底截图已被最终截图更新，不将其称为独立保留的历史图片。测试仅覆盖暂停画面，不扩为持续播放所有时钟/动画分支的验收。

源/config已冻结1431份于 `artifacts/subtitle-legacy-code-snapshot.json`。完整检查 `artifacts/subtitle-legacy-full-check.log` session17461 **terminal exit0**：**492文件/6694测试**通过、215.43s，格式/零警告lint/架构/核心strict通过，Vite3706 modules、标准build18.02s。CanvasPage901.36kB/ClipEditorWorkspace276.62kB，900kB阈值未提高，现有分包提示保留。统一证明 `artifacts/subtitle-legacy-verification.json`；最终逐文件SHA核对无漂移，文档后检查单独记录。自建QA浏览器、独立context及5181服务器已关闭。

## 剩余范围

完整VTT→HTML迁移和失败回退、原remote-config、多语言专属属性及完整运营目录仍缺；L2转换真实UI入口仍待核实。复杂继承/相对单位/任意runtime、已有重复ID的编辑歧义、巨量字幕性能、IME/触摸/Safari和持续播放全分支尚未验收。真实生成、上传、导出、协作、云锁及运营写服务未接；登录/小号继续延期。整体约70%（65%-75%）为工程估算，不能按测试数量上调或把旧HTML兼容称为所有字幕功能完成。
