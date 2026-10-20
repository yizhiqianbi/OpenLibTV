# HTML 字幕源时间、片段关联与修改事务（2026-10-15）

2026-10-18 后续已接固定CSS/inline改写、L1对应属性禁用、L2只读与批量样式受限字段跳过；这些是可注入性分级，不等于旧契约版本已兼容。当前范围和490文件/6673项全量检查见 [样式兼容审计](./canvas-subtitle-style-compatibility-audit.md)，下方“完整L1/L2判定尚缺”属于历史批次。

2026-10-16 后续已完成v4字幕实际App来源/列表/样式/轨道手势、片段拆分复制、同一历史/CAS与预览接线，并通过457文件/6544项完整检查。实际范围与仍缺的旧版本/高亮/完整轨道等见 [App验收](./canvas-html-subtitle-app-audit.md)。下文“尚未接App”是本协议批次的历史边界，不能作为最新状态。

本批新增HTML字幕底层协议和独立浏览器预览文档，不是已完成App字幕入口。当前App仍使用已验收的VTT字幕与普通文字编辑器；HTML字幕的来源加载、列表/属性面板、轨道手势、会话所有权/CAS、自动保存与实际播放器图层尚待接入。整体约70%的估算不因底层测试增加而上调；本机未部署，无需登录或账号资源。

## 源证据

仅读取 `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。复用REA保留的 `ev_cc31296ce676614fb7009f5e5cf2f923a4b7097017f83c93b5b7dbd0ef83f639`；模块页 `ev_5df98aa76429a12720577552e299181ac80c0370e9be5c00ad940d74a0e59cb6` 指向同字节副本。REA语义图因此前heap限制为partial，不重复运行或称完整追踪。以下行为另由函数正文逐项核对，不执行原bundle、runtime、遥测或生产写服务。

- 字符225000–228300：v4 contract、source/timeline、clip/library、materialized/subtitlesHidden与安全策略字段。
- `ie/it/ir/io/is/iu/id/ic/ih/im`，240564–242920：文档ID是`subtitle:JSON.stringify([nodeId,url.trim()])`，与历史nodeId key并存。仅当所有关联片段已有不同非空HTML URL才将旧URL文档判stale。source窗口使用sourceOffset与speed/playbackRate；cue按片段交集投影timeline，源交集小于0.01秒或显示小于0.2秒不产生实例；绑定`~`不显示。
- `iw/iO/iz/iK/iJ`，244788–257267：字幕默认source时基/caption role，clip/library同时保存；metadata为root直接template，materialized三位小数。重叠按clipId和track分组，字幕上限4轨，overlay上限8轨。新增默认2秒、入口向下取30fps、同clip同轨向前避碰、maxEnd剩余不足0.2秒拒绝。
- `rB/rY`，232676/236254：editor-scale-wrapper与cue作为一个复制/删除单元，不能丢掉外部scale。
- `ap`，289500–295444：clone用目标clipId的SHA-256前6位生成`oldCueId~hash`；冲突从`-2`递增，同目标/library已存在则幂等。retag只改clip，保留library和source时间；setClipMeta、removeClipCues/removeMeta独立维护。
- `h0`，约612500–614500：split必须是一个旧片段变两个同源且源窗口连续的新片段。跨切点句子完整复制到右片段，原句绑定左片段，不裁短source duration；显示交集由新窗口负责。duplicate也要求同源且窗口相等，metadata传递后移除旧split记录。
- `lL/uA/dq`，322392/643593/481604：持久字段为`clipTimelineData.subtitlesHtml`，保存canonical archive及恢复标识。本批未实现archive writer，不能把临时`{nodeId,html}`集合直接当该文档/服务器契约。

## 实现与所有权

`text/html-document`共用inert解析器，普通文字仍仅接受timeline；字幕reader支持已知v4 source/timeline、直接clip metadata、同clip同轨重叠和4轨限制，保留未知CSS/属性/script文本。cue/clip/library/role/sourceAssetKey按源读取trim。完整L1/L2/L3判定、旧版宽容分支尚缺；未知版本/时基拒写并保留原文档，不称完整兼容。

`domain/html-subtitle-model`持纯source窗口/实例投影、文档身份/stale、新增计划与split/duplicate lineage，不依赖React、DOM或UI。只有确实拥有源片段且全部cue已明确绑定的文档才处理lineage；其他同源文档不被补造metadata，mixed/unbound文档不猜关联。

`text/subtitle-html`在异步WebCrypto准备ID后做原子DOM修改。共享patch支持clip clone/retag/meta/delete与已有text/timing/style/layout基础操作，保留scale wrapper、library、words/语言及未知结构。整批或多个文档任一失败均返回原集合，不暴露部分修改。库不拥有App会话；后续caller须在await后重新检查document/owner/CAS，不能将库测试当生命周期已接入。

`subtitle-preview-document`使用共享封闭scriptless清理及真实CSS seek，按当前clip、cue/track隐藏、`~`和metadata过滤。预览移除原script，保存内容继续inert保留。尚未挂到App字幕图层/双缓冲调度，不代表支持原脚本动画、任意资源或服务端导出。

## 验证与过程

最终剪辑专项33文件/575项通过，日志 `artifacts/html-subtitle-contract-validated-targeted.log`。新增17项覆盖source/meta/语言/clip隔离、4轨与时长、源窗口/速度/两级最小时长、30fps/同clip避碰、独立Node crypto计算ID、clone碰撞/幂等/wrapper/script inert、retag/隐藏/范围/meta删除、最后cue删除、整批失败保原bytes、跨句split、duplicate/其他文档隔离、多文档失败回滚、source words线性换算及封闭预览。

首轮专项1项夹具错误：新字幕落在另一个clip已有句子的源区间，却期待不避碰。按直接源规则改为独立clip验证无邻居时精确30fps分数，同时保留原clip无空位拒绝断言；日志 `html-subtitle-contract-initial-targeted.log`。没有改算法迎合预期。

首轮完整检查在标识trim补正前主动终止terminal143，日志 `artifacts/html-subtitle-contract-before-identifier-trim-check.log`，不是通过或观察超时。修正读取/clone/delete/preview的clip标识空白后，1355源码/config重新冻结。最终Node24.19.0完整check session18062 terminal0：**453文件/6510测试全部通过**，22:43:14开始、测试257.47s、标准build23.54s；格式/零警告lint/架构/核心strict通过。所有记录源码/config指纹至结束未变，Canvas895155/ClipWorkspace152982字节，900000预算未提高；日志 `artifacts/html-subtitle-contract-full-check.log`、proof `artifacts/html-subtitle-contract-verification.json`。验证后仅维护文档/证据并复查格式。统计含独立影游、strict非全部JSX、CI未远端执行、本机未部署；旧452/6493为普通文字数值批次。

独立Chromium QA为 `artifacts/html-subtitle-contract-qa.html`，明确标注“非App接线验收”。原生DOMParser/WebCrypto/iframe验证12项：hash、完整source时间、library、metadata继承与旧记录移除、2倍速交集、左右clip过滤、56px真实字体、script移除、exclusive end、片段隐藏/恢复。最终带空白clip/role源属性的复验日志为 `output/playwright/html-subtitle-native-validated-flow.txt`、DOM结果 `html-subtitle-native-validated-result.txt`、截图 `html-subtitle-native-validated.png`；旧未加空白夹具的同名前缀证据保留。初次控制台只有favicon404，不称整份日志零错误。没有验证App UI、390px、手机/Safari、实际媒体同步或后台页。QA浏览器及自建5181服务已关闭，用户开发服务保持。

## 下一步接线

先接可取消的inline/revision/URL source和canonical `subtitlesHtml` archive，保存成功后才消费草稿，保留userCleared防源复活，切session隔离迟到读取。把HTML layer/clip/cue身份接列表、属性、独立行、手势与现有十步历史/CAS；split/duplicate的timeline与HTML同次提交。再将source时钟、片段几何/可见性、z和ordinary/overlay轨道顺序接真实双缓冲播放器，做App桌面/窄屏、刷新/undo/冲突副本/播放验收。高亮alpha、完整字体预设、完整轨道顺序/几何工具、原script runtime与云生成/导出/协作仍在完整目标内。
