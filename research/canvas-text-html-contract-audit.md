# 普通文字 HTML 协议与修改事务（2026-10-15）

后续普通文字入口、正文/布局/文字属性、时间轴/历史/保存与双iframe已接App，实际范围与最终验证另见 [普通文字接线验收](./canvas-text-editor-functional-audit.md)。下文“尚未进入App”与445/6450仅记录本批底层冻结，不能当随后接线源码的检查结果；高级HTML字幕与工具差距继续保留。

后续HTML字幕底层的source时基、clip/meta、clone/retag/delete及split/duplicate事务已由 [HTML字幕协议审计](./canvas-html-subtitle-contract-audit.md) 更新；该分支尚未接App UI/保存历史/实际播放器，不能沿用普通文字或独立协议的验收当成完整字幕工具。

本批是普通文字/HTML后续接线的底层工作，不是已可用的文字工具。新模块尚未进入App模块图，工具栏“添加文字”仍未启用；HTML字幕的source时基、片段绑定、完整renderer与高级工具仍缺。基础VTT的既有UI由 [VTT验收](./canvas-clip-subtitles-functional-audit.md) 维护。本批不提高整体约70%的完成估算，也没有发布线上。

## 直接源依据

仅读取已归档公开客户端 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。以下为解码字符偏移，不运行原bundle、Hyperframes runtime、GSAP、遥测或写服务。

- `tH/t$/tU...` 225000–约228000：`data-libtv-contract="libtv-subtitle/4"`、composition/画幅/时基、cue/track、clip/library、逐字/语言/隐藏等属性。普通文字是timeline composition，不是VTT cue或一个p标签。
- `ip/iy/iv` 242920/243030/243292：入口时间向下取30fps；避碰限定同clip与同track，生成空区间，forward不向后插，nearest按距离取第一个候选；有邻居时结果保留毫秒。
- `iZ` 257267：默认3秒、至少0.1秒，先向前避碰再截到总时长，剩余不足0.1秒拒绝。`iJ` 是HTML字幕另一个分支，sourceOffset/maxEnd/min0.2与namespace不同，本批没有用iZ替代它。
- `iP/iY` 约250000/256536：namespace/text.trim/四舍五入的开始与时长毫秒用竖线拼接，SHA-256前6位生成`c-xxxxxx`；重号从`-2`递增。当前service使用原生WebCrypto异步实现这个同样的ID规则，未来controller必须在await后复核owner与基线，不能把异步函数当作原同步API直接使用。
- `iw` 244788：无runtime script的规范HTML、layout root与正文分离、宿主驱动初始opacity0。Source Han Sans CN/Noto Sans SC，字号`max(12,round(height*56/1080))`、字重600、行高1.4、白字/阴影、50/88/86布局。根与每个cue的data-start/duration/track/z/role明确保存。
- `iO/i1` 251400/257267后：最外层timed cue、plain/words、clip/library来源、语言段、逐字计时与issues。唯一composition/非空ID、字面timeline时基、规范非负整数行/组锚点、cue ID唯一、最多8个不同轨道、同轨重叠与未映射indexed element校验。
- `n3/n8` 284576：普通文字字号8–400、字间距-20–100、行高0.5–5，与VTT不同；除显式snapToStep字段外，数值限幅保留真实小数，不能按input step擅自取整。
- `an/aa/al/ao` 约286000–289000：CJK按单字、其他文字按词及连接符切分，间隙附着前词；普通words按trim后的code point长度分配时长，karaoke等权。文本编辑保留data-lang occurrence和已有word外壳；timing修改按旧/新长度线性换算每个word。
- `ap/ag` 约289500–295444：text/timing/addCue/removeCue、cue/track隐藏、layout、styleVar与zOrder修改。影响结构的原调用会先复制文档、apply、验证轨道、再接受；`lc` 316751为DOM doctype+outerHTML序列化。本批写入也先在新inert document完成整组操作，失败返回原HTML。
- locale `public/data/locale-zh.json` 的 `canvas.clipTextDefaultText` 为“输入文本”，与VTT的“默认文本”不同。核对后已纠正纯计划默认值，并重新开始完整检查；较早中止快照不作当前通过证据。

## 已实现的模块

`domain/text-timing-model.js` 为不依赖DOM/React的时间/避碰/数值规则。`services/timed-text-id.js` 只持异步ID摘要，不是认证服务或随机ID替代。

`text/html-document.js` 负责inert解析、最外层cue、元数据与校验、原始doctype序列化，以及规范普通文字HTML创建。解析返回document/root/cue element以便后续owned缓存与DOM修改；不能把这些DOM对象存入Canvas文档、history或storage。当前限定可写的v4 timeline composition。版本/画幅/时长及逐字无效拒写是明确本机保全措施，不把source的所有宽容读取分支称为已复刻。source字幕HTML的source time base需要独立adapter。

`text/html-patches.js` 实现基础text/timing/addCue/removeCue/cueHidden/trackVisible/zOrder/styleVar/layout事务。styleVar按源区分global/cue/cueLang，后者只改匹配data-lang的occurrence；未知scope拒绝，不扩大成整句修改。无变化返回原字符串，避免重写；修改后保留未知属性、CSS、script正文等结构，但只做inert读写，不执行原script。原始脚本保留不等于预览可执行或动画已支持。DOM序列化会规范引号/实体/空白，不承诺编辑后逐字节相同。

文本编辑按源保留语言段、再分配words；timing按旧/新长度调整words。新增复制同轨或首个source cue的正文外壳/样式，清隐藏和旧片段绑定；这是普通文字addCue路径，不能声称HTML字幕clone/retag已实现。删除仅清空无cue的显式track容器，保留未标记的装饰wrapper。layout使用自己的变量/边界，不能将VTT的12–72与不允许负字间距套进来。

尚缺的patch包括动画、cloneCuesToClip/retag/setClipMeta/removeClipCues、完整祖先容器重排/样式几何补偿、背景/预设等原工具协议。缺少目标track容器的嵌套跨轨移动当前拒绝并保留原文档，不能用扁平append冒充原完整轨道操作。

## 验证

最终专项2文件/21项通过，`artifacts/clip-text-contract-validated-targeted.log`：30fps/forward/nearest/clip与row隔离/尾部裁切、独立数值边界、源ID摘要、唯一composition/轨道/重叠/未知结构拒写、字面输入、无操作保原字节、未知CSS/script/属性保留、整批失败零替换、clone/delete、全局/片段/单语言样式、words线性换算和编辑后计时、语言occurrence与装饰wrapper保全。先前定向日志为default文案/语言scope最终补正前的快照；零警告lint首轮为 `artifacts/clip-text-contract-lint.log`，当前仍须以下方最终完整检查为准。

Chromium在隔离的本机QA页点击“验证原生HTML往返”：WebCrypto得到`c-88826a`、DOMParser包含script但未执行、`<b>literal</b>`保持字面、20.125%布局保留、原script正文保留、后置非法duration让整批修改被拒绝，6项均true。证据 `output/playwright/clip-text-contract/dom-qa.html`、`native-dom-snapshot.txt`与`native-dom-readback.txt`。QA运行的是本批独立模块，不是原bundle或App文字编辑器；一条favicon404另记，不称整份控制台零错误。

同一QA的scriptless静态iframe还实际验证了生成HTML的布局：1920×1080内字体56px/行高78.4px、left386.398px（20.125%）、宽672px（35%），缩放到480×270后两行白字可见。iframe与文档同时设置源`color-scheme:dark`才保持底下蓝色可见；只设置文档dark时，首张`native-layout.png`出现UA黑底。修正QA宿主后图像为`native-layout-transparent.png`，nativeLayout.passed=true，记录 `native-layout-readback.txt`。这只是基础模板的静态布局，不是播放/动画/双缓冲/App验收。

最终Node24.19.0完整 `npm run check` session50690实际terminal0：**445文件/6450测试全部通过**，19:40:03开始、388.87s，标准build16.70s；格式、零警告lint/架构、核心strict通过。日志 `artifacts/clip-text-contract-full-check.log`，滚动入口 `artifacts/current-full-check.log`；1309份记录的源码/config指纹至结束未变。最终Canvas891607字节、ClipWorkspace84391字节均与前批相同；新模块尚未进入App模块图，包大小或测试数不代表文字功能已接线。上批443/6429是历史VTT快照。统计含独立影游，strict不覆盖全部JSX、CI未远端执行，本机未部署。

两次在源规则补正前主动中止的检查分别为 `artifacts/clip-text-contract-before-source-default-check.log`、`artifacts/clip-text-contract-before-language-scope-check.log`，terminal143；没有将这些中间状态算作最终通过。

第一轮最终冻结源码的全量terminal1：445文件中444通过，6450项中6438通过；旧 `NodeCanvas.script-generator.integration` 12项均未找到lazy generator view，build未运行，日志 `artifacts/clip-text-contract-script-cold-failed-check.log`。原文件/断言/时限独立重跑12项通过（`clip-text-script-isolated.log`），与ScriptV2参考及新HTML协议联合4文件44项也通过（`clip-text-script-joint.log`）。没有充分证据确认失败根因，未改断言/超时/生产代码；同一1309指纹源码重新完整运行后通过445/6450及标准构建。不能把隔离通过本身当作全量成功，也不凭一次重跑编造根因。

## 接下来必须接入的实际流程

先将这些模块接到剪辑器的普通文字入口、所有权、已有CAS/十步历史、末次输入/pagehide与冲突副本，随后做实际App和浏览器验证。新HTML工具及DOM协议需留在lazy workspace，当前Canvas891607字节的900000预算不抬高。可注入纯投影器/动作桥让controller持生命周期，不能把DOM解析器放回大页面或在services反向引用feature。

读取优先原inline/已知revision，URL读取须Abort/超时/失败重试；失败/加载期间不能生成空composition覆盖旧HTML。当前只做inert解析与修改，下一步播放宿主必须按原composition/输出坐标、timeline/source时基、cue/word/track隐藏和动画规则实现；不得把原script直接塞进主document，也不得用VTT或拼接纯文本作为HTML工具的完成形态。多轨选择/排序、预览几何操作与完整文本/动画/背景配置继续保持完整目标，不因本批底层完成而删除。

基础模板目前未接源运行时注入/closed CSP/字体资产注入。源 `rb`（227316）为default/connect/frame/object/worker/form等封闭策略，仅允许已核对资源/CDN和运行时；在实际iframe接线时必须一起完成，不能把本批inert保留的script当成已批准可执行内容，也不能降低CSP来躲开缺失的runtime。源iframe自身同样显式dark颜色方案，不能只设置子文档。

等待检查时进一步只读核对到 `oA`（343408）是双iframe a/b宿主：rebuild在隐藏的一侧load、准备与seek成功后才交换，generation/revision gate拒绝迟到；初载/重建都是5秒等待，通常最多3次，no-runtime最多2次，退避400*n ms。`lq`（325620）还检查fonts.ready、player/hf seek、正duration、timeline duration、图片解码和视频readyState；`lX`（326899）在非timelineDriven路径按time±0.001调整timed元素的opacity/visibility，再暂停并设置CSS motion/karaoke动画currentTime。不能用固定timer或DOM ready属性替代这些实际条件。

源track布局 `og/oy/ok/oI`（336788–342481）将ordinary字幕与overlay组合，overlay行保持同一composition连续，groupAnchor保留位置，ordinary避开保留轨，最终重排必须连续0..n-1。stack z是base减trackIndex，源iframe外层base10；不能固定所有HTML叠层为最高z。预览临时新行 `ow`（342680）的上限为ordinary4/overlay8，sourceTrackIndex与界面全局index不同；这些分支尚未移植，接线不得省略并把所有文字都混为单行。

预设入口约632217：只有文字/字幕/样式面板打开才读 `TEXT_PRESET_CATALOG_CONFIG_ID` 与独立字体目录；remote config和font catalog各自完成/失败后再校验，requiredLocales为mainland并fallback mainland；非法配置走源内置catalog `ul`。约634000按当前语言生成名称、分类、样式预览及存在时的字体assetUrl。普通文字预设不是VTT六个fallback按钮；后续须用只读可注入目录、分类/搜索和字体能力，不以六种白字描边代替整个预设库，也不继续全量抓内容。
