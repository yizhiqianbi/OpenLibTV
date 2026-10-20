# 字幕样式改写与 L0/L1/L2 编辑限制（2026-10-18）

后续旧HTML字幕读取/物化升级、源诊断、未知时长和透明预览已接，当前492文件/6694项检查及实际范围见 [旧字幕审计](./canvas-subtitle-legacy-functional-audit.md)。下方“旧契约版本尚缺”为本样式批次历史范围；完整VTT迁移与任意runtime仍未完成。

本批继续复刻剪辑器字幕的样式兼容流程，代码在本机，未部署。L0/L1/L2 是样式可注入性分级，不是旧契约版本编号；本批没有声称支持旧版字幕、完整格式迁移或所有自定义 runtime。

## 静态依据

归档 `research/source/1q5w-zbtkz5ka.js` 的 SHA-256 为 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。本次 REA retained evidence 精确查询为0条，继续使用归档文件中的有界静态摘录，没有重跑或执行原站bundle。5段标记、UTF-16/字节位置和片段哈希记录于 `artifacts/subtitle-style-compatibility-source-evidence.json`。

- `rs/ru`：八项可注入属性为字体、字号、字重、行高、颜色、字间距、阴影和描边；`font` shorthand 阻断前四项。
- `ln/ld`：固定 CSS 值改写成对应 `--libtvSubtitle*` 变量的 fallback，保留 important、未知声明和原来的数值。CSS 字符串、注释与函数内分隔符不能当作声明边界；嵌套 media/supports 可改写，font-face 不改写，keyframes 等描述符中的相关属性保留并标记受限。两种 text-stroke 拼写保持配对。
- `aZ`：部分属性受限为L1，只禁用对应样式控件；八项全部受限为L2，禁止正文、时间、增删和布局编辑，但保留HTML所有权和只读还原。该纯规则还声明L2可转换、需要确认并可能损失动画；本批已将其接成显式确认入口，沿现有 history/CAS 写入一次本地HTML存档。转换只移除脚本及 CSS 动画入口，不猜测复杂 runtime 的等价效果。
- `l4`：批量样式变更跳过受限属性，不能因为其中一项不可注入便丢掉其余合法变更。

## 本机实现

新增 `text/subtitle-style-compatibility.js`，纯 CSS 扫描与 DOM 改写均在原lazy文字工具边界内，不新增依赖或搬入画布入口。HTML来源读取完成后先改写样式，再沿原片段所有权流程物化；原URL、raw sourceHtml、正文、布局、未知CSS及脚本文本继续保留。读取本身不会写入规范时间轴，只有实际编辑沿现有事务生成本地存档。

模型缓存为每份HTML计算可编辑性。来源回执支持readonly，仍持有HTML编辑权并可准备预览。实际编辑入口、直接patch、样式手势、正文草稿、新增/删除和预览布局均核对能力；只读条目仍可从列表选择、定位，时间轴不启动其拖动/裁边。轨道动作涉及只读来源时禁用，不能通过重排间接修改只读层。

L1面板只禁用受限属性，正文与其他属性保持可用。预设和“应用到所有”按源跳过受限字段；清理旧变量时保留受限属性的原值，不把只读层纳入批量修改。原生读取回执与样式能力不写进时间轴。修复此前聚合 `htmlSubtitleStatus=error` 使部分成功图层的整个面板禁用的问题，失败来源的提示和重试仍可见。

固定inline样式改写后，属性读取还会读取inline中的变量fallback，并让最近的实际变量覆盖默认值。未改普通文字的严格契约和原文保存约定。复杂CSS cascade、相对单位、外链样式和继承解析仍不是完整浏览器computed-style实现。

## 验证

专项 **54文件/694项**通过，日志 `artifacts/subtitle-style-compatibility-tests.log`（13.45s）。新增测试覆盖静态与inline默认值、幂等、字符串/注释/data URL/函数、嵌套规则、font-face、动画限制、font shorthand、描边及跨拼写、最高限制优先、L2所有权、真实工具动作拒写、L1预设跳过、部分来源失败和只读UI；本批另以 **2文件/20项**专项验证 L2 转换确认、动画清理和实际事务。

初轮联合6文件/98项有1项真实失败：“应用到所有”错误地整体拒绝了部分受限图层。核对源 `l4` 后改为跳过受限字段并保留受限变量，原有高亮/外观及历史强断言继续通过。新模型11项中1项初次断言要求原CSS完整连续字符串未变，但源要求补齐text-stroke别名；改为逐项核对原属性和禁止改写动画变量，没有取消内容保留断言。其后2文件/69项及最终联合全部通过。

真实Chromium使用三个**合成样本**，均由前批GUI创建的6秒短视频派生，在独立context中加载。原生键盘/点击→字幕面板→实际iframe computed style→本地存档的完整链路记录于 `output/playwright/subtitle-style-compatibility/native-second.txt`：

1. 固定CSS字号42px被正确读取，原生输入60后预览为60px，等待实际存储确认；一次撤销回42px，一次重做回60px。
2. `font` shorthand样本字体相关控件禁用，正文/字间距可编辑；原生输入字间距3后iframe为3px，原32px字体保留。
3. 八项受限样本正文、字号、字间距和布局不可写，列表仍可选择，原CSS动画预览仍存在。此处只观察到CSS动画，并未证明完整时间轴逐帧同步或任意脚本runtime。

三种样本都保留同一video DOM且readyState=4；390×844下document宽度与scrollWidth均390，pageerror为0，截图 `literal-390.png` / `partial-390.png` / `readonly-390.png` 已回读。此处没有统计console全部资源输出，不能称console零错误。第一次CLI脚本使用表达式而非函数格式导致语法错误，未操作页面，修改QA调用格式后成功，不混记产品错误。独立context、自建QA浏览器和5181服务器均关闭。

首轮全量 `artifacts/subtitle-style-compatibility-full-check.log` 真实exit1：490文件中476通过、13项suite发生ENOSPC、分组集成case超过默认5000ms；6571项通过、1项超时，剩余suite未加载，build未运行，不能称完整通过。检查时磁盘仅约170MB可用。只删除55个已完成批次的可再生Node编译缓存，共531,491,380字节，路径清单存 `artifacts/subtitle-style-cache-cleanup.json`；没有删素材、原始证据或用户文档。磁盘可用量同时波动，不能把系统释放的所有空间都归因于本次缓存清理。

原分组文件原断言/超时设置未改，单独复跑1文件/2项通过（3.06s，case总934ms），日志 `artifacts/subtitle-style-groups-isolated.log`。使用新临时目录重跑完整检查 session63947 **terminal exit0**，日志 `artifacts/subtitle-style-compatibility-final-full-check.log`：**490文件/6673测试**全部通过、352.20s，格式/零警告lint/架构/核心strict通过，标准build15.18s、Vite3704 modules。CanvasPage901.36kB/ClipEditorWorkspace271.47kB，900kB警告阈值不变，画布包提示仍保留。源/config冻结1427份于 `artifacts/subtitle-style-compatibility-code-snapshot.json`，最终逐文件SHA核对无漂移；证明为 `artifacts/subtitle-style-compatibility-verification.json`。文档后格式/MCP/diff检查单独记录，不把旧失败日志覆盖成成功。

## 剩余范围

旧契约版本宽容解析/升级、复杂computed-style与任意自定义脚本runtime仍需继续；L2转换已按源协议接成显式确认和单次本地历史，但不承诺复杂动画等价还原。真实生成、字幕上传、导出、云锁和运营写服务未接入；登录注册/小号继续按用户要求暂缓。协作、远程配置、多语言、触摸/Safari按用户确认不纳入本轮扣分。总体约70%（65%-75%）仍为工程估算，不按测试数量上调。
