# 混合字幕编辑权、失败回退与末次输入历史（2026-10-18）

本批继续原站前端复刻，修正先前将HTML/VTT来源共存当作两套编辑轨道同时开放的判断。代码与验证均在本机，未部署；没有使用账号、小号、原站写入或真实生成服务。整体估算仍约70%，本次不把测试数量作为完成率。

## 原始规则

静态依据为 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。有界正文、位置和片段哈希位于 `artifacts/subtitle-ownership-source-evidence.json`。当前REA会话没有保留该文件的完整语义图，只核对原文件中的静态表达式，不把它称为原站运行时观察。

- `ig`：已创作HTML、已激活HTML、正在加载HTML或某个已知来源尚未全部被拒绝时，HTML持有编辑权。预览开关禁用但仍有HTML来源时也不自动开放VTT编辑。原站 `oQ` 按每个来源保留ready/readonly/rejected，而非一项失败便丢掉全部成功来源。
- `mK=ig?mz:lx.cues` 和 `g7=hd&&!ig`：列表与时间轴按编辑权选择HTML或VTT。键盘删除同时拒绝HTML持有编辑权时的VTT分支。收集函数允许两个URL共存，不能据此开放两条可编辑轨道。
- `pz`：在没有VTT正文/来源，且HTML预览和导出开关均允许时，优先新建HTML字幕；`se` 则单独计算播放/导出是否ready、loading或disabled。编辑权、可编辑成功图层和播放就绪是不同判断。

本机新增纯 `subtitle-ownership-model`，由真实加载回执决定编辑权。UI、基础VTT动作及VTT拖动预览共用判断；失败回退和HTML恢复时保留两份数据、原URL与同一播放器子树，不增加一个源未确认的任意格式切换器。真实remote-config开关和完整迁移/降级流程仍未连接。

规则解析保留在原有lazy文字工具provider，eager controller只持有同会话判断端口；provider未安装时保守预留已知HTML，不预先开放VTT写入。第一轮直接静态引用把HTML模型搬进Canvas包，构建为911.14kB；恢复按需边界后定向构建回到901.36kB，未提高900kB阈值。此前900.44kB已经有预算提示，此次仍不能宣称画布包预算清零。

## 实际实现与修复

HTML读取按来源收集成功与失败结果，成功项继续物化和预览，失败项保留错误与重试。相同URL仍去重，已验证成功的URL在重试时复用缓存，只有失败读取重新请求；来源/会话变化取消并忽略迟到结果。来源状态、读取回执和错误只存在会话，不写入规范时间轴。

媒体初始化只唤醒已读HTML的片段物化，不重启网络读取；同步inline分支与异步分支共用清理所有权。实际App还暴露出 `NodeCanvas` 每次渲染创建新的素材映射函数，导致加载器将自动保存等父级更新当作来源变化。现已使用依赖实际asset函数的稳定回调，最终GUI确认6.5秒窗口内请求计数不变。

本地规范HTML即使损坏也保留创作所有权和错误，不静默变成可写空库。部分成功时，只允许操作实际读入且有效的图层，未知来源保留；全部远程HTML拒绝后回退至VTT。重试前先提交VTT末次输入，恢复HTML后关闭VTT编辑入口。

VTT草稿新增输入开始前的时间轴基线。即使整图自动保存已经投影/确认了当前正文，提交仍使用这份基线建立一次撤销历史；撤销/重做会同步实际图和保存。基线仅属于会话草稿，不进入时间轴或对外工程文件。源URL、原HTML及VTT正文不会因切换编辑权被删除。

## 专项与真实App

剪辑域最终 **53文件/680项**通过，边界调整后日志 `artifacts/subtitle-ownership-final-lazy-joint-tests.log`。纯规则覆盖已知来源、部分拒绝、全部拒绝、已创作内容、开关和过期回执；异步读取覆盖去重、有效内容保留、失败重试、等待媒体、超时、取消与坏存档。真实GraphActions/Drafts/Autosave控制器覆盖VTT旧回调/手势拒绝、HTML编辑保留VTT、部分成功、重试前末次输入，以及整图投影保存后一次撤销/重做。初轮单个独立HTML工具测试失败后，将已验证本地文档的同步回执正规化复用至动作和UI，没有放宽坏文档校验；历史日志 `subtitle-ownership-first-tests.log` 保留。

实际Chromium使用一个独立浏览器context，从前批GUI创建的短视频样本派生**合成混合来源夹具**。HTML/VTT URL与受控503→200服务响应仅用于QA；没有把它冒充原站真实双来源样本，也没有写入public或用户浏览器。验证过程为原生点击/输入，媒体元数据与iframe来自实际App，不注入ready或合成pointer。

最终 `output/playwright/subtitle-ownership/native-after-lazy.txt` 在边界调整后完整重跑，以下读数与此前 `native-e2e-final.txt` 相同：

1. HTML持续503后，VTT列表/正文/轨道可操作；输入“恢复前最后的VTT输入”，保持6.5秒后正文仍在，HTML请求数保持1。
2. 受控服务恢复后，点击“重试读取字幕”，请求数变为2；HTML列表/轨道生效，VTT编辑轨道消失。原视频DOM仍相同且readyState为4。
3. **等待真实存储完成**后核对VTT末次正文；一次撤销保存为“VTT原始正文”，一次重做保存为新正文。HTML/VTT URL均保留，规范时间轴不包含加载回执。
4. 390×844下HTML样式栏可打开，document.scrollWidth=390；截图 `vtt-fallback-final.png` / `html-recovered-final-390.png` 已回读。该样式截图未选中HTML条目，因此属性禁用符合当前选择状态，不作为已编辑HTML属性的GUI证据。

最终记录 `errors=[]` 指未捕获pageerror，503资源错误是夹具的预期网络行为，不能称整段console无error。独立context、自建QA浏览器及5181服务器随后关闭。

过程边界：早期“第一次请求失败、第二次自动成功”夹具混入StrictMode/请求顺序，不足以单独判定媒体初始化是所有重试的原因，最终改用持续失败直至显式恢复的闭包。初次从活动画布恢复storage state也受到旧页面生命周期影响，最终由新context构造时直接加载隔离夹具。部分早期GUI断言将尚未失焦的草稿、或点击后的即时storage读数当作保存完成，分别记录于 `native-history-final.txt` / `native-confirmed.txt`；读出控制器已提交正文与实际存储延迟后，最终使用waitForFunction等待预期保存值。上述失败不混称产品全部通过。

## 全量与剩余范围

第一轮完整检查 `artifacts/subtitle-ownership-full-check.log` 已通过489文件/6659测试、175.08s和build28.35s，但包含上述eager引用。恢复lazy边界后的最终 `artifacts/subtitle-ownership-final-full-check.log` 已完整走过格式、零警告lint/架构、核心strict、**489文件/6659测试**和生产构建，测试232.56s、build21.27s、Vite3703 modules；CanvasPage901.36kB、ClipEditorWorkspace263.67kB。续接时session55238句柄已回收，成功依据为完整日志，不另称捕获terminal exit code。不能用第一轮或前批488/6650冒充最终工作区结果；最终检查前冻结1425份source/config于 `subtitle-ownership-final-code-snapshot.json`，检查完成后逐文件SHA-256核对无漂移，文档不在指纹范围。统一证明为 `artifacts/subtitle-ownership-verification.json`。

仍缺旧L1/L2/旧版本升级、完整VTT→HTML迁移/降级、原remote-config、多语言专属属性及运营目录；触摸/Safari、大文档、持续播放全分支和真实生成/导出/协作/云锁继续另验。部分成功的异步/控制器分支有专项证明，GUI只验证一个失败来源恢复的合成样本；没有完整原站账号态验收。
