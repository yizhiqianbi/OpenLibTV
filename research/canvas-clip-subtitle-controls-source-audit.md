# 剪辑文本/字幕入口：下一批静态范围（2026-10-15）

普通文字HTML的时间、读写与基础事务现有独立模块和专项/原生DOM证据，尚未接App与播放宿主；当前进展和下一步双iframe/轨道协议改见 [HTML审计](./canvas-text-html-contract-audit.md)。不把此底层工作计为可用文字功能。

本文件最初是等待转场最终检查期间的只读源核对。后续本机基础VTT字幕模型、面板、时间轴与预览已接入，专项25文件/496项、Chromium桌面/390和完整443文件/6429测试及构建通过，准确范围与失败过程见 [字幕验收](./canvas-clip-subtitles-functional-audit.md)。HTML字幕和普通文本仍缺；下文仍保留其静态证据和后续要求，不将VTT实现扩大为HTML完成。线上生产包没有因本机改动自动更新。

## 直接证据

`research/source/1q5w-zbtkz5ka.js` SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`，以下为解码字符偏移。文案来自 `2ijgtfwpg93os.js`。只读静态函数，不执行原生产代码。

- `sh`（383396）是文本/字幕共用入口计划：拒绝无效时间、重复/空 rowId 和无效 cue；没有同类行时创建 track 0；明确 targetRowId 只插该行；activeRowId 优先，否则唯一行直接解析；多行中恰好一个 cue 命中时选该 cue，多个命中或无命中时请求轨道选择。不能每次点按钮都无条件新建一条字幕。
- `ph`（约619000）是文本入口：从实际播放头读取时间；有效 HTML overlay 先在既有 composition 建 cue，没有有效 overlay 时走 composition 创建。还存在权限 P、overlay loading 和写入成功后的选中分支，尚须完整追踪后实现，不能把服务缺失直接当全部本地文本不可做。
- `iZ`（257267）默认文本片段3秒、至少0.1秒，使用现有 `iv` 向前避碰，并截到 totalDuration；实际没有可用区间时返回 null。`iv`、时间正规化 `ip`、ID `iY/iP` 及完整 HTML 协议尚未逐条核对，不可用简化插入替代。
- `fb`（约657000）是字幕入口：先关闭文本/转场等面板、展开预览，再处理轨道选择/选cue/新增；HTML字幕与基础VTT使用不同修改分支，不是一个普通 textarea 直接改原URL。
- 样式面板（约708550–713450）有字体、字号、字色、字间距、六种预设、描边、应用全部；右键（约733881）提供本片段显示/隐藏、删本片段 cues，删除字幕与删除视频是独立动作。HTML renderer 还有失败降级和下载预览HTML的调试入口，不可把调试文案直接提升为普通主操作。

独立模块 `research/source/1al6tu79axqkm.js` SHA-256 `47b3e034e2a56dd18c1a28e0d9b7b5fee6612c55d7660f6e14ed4d0718872265`，module472616位于7395：字幕字号12–72px、字重100–900、字间距0–100px、行高0.5–3。普通文本配置 n3 的字号8–400、字间距-20–100、行高0.5–5，与字幕 n6 不同，不能共享一套错误边界。该模块还含VTT时间解析/正规化和样式正规化，未在本批移植。

六种预设：默认白字；白字黑边；黑字白边；黄字 `#FFDC00` 黑边；白字粉边 `#FF827B`；粉字黑边。源点击预设会清 textShadow，有描边预设写 strokeWidthPx=2、strokeOpacity=100；默认预设写 strokeWidthPx=0，不应凭名称推导额外样式。

## 后续验收要求

基础VTT已进入实现，实际本机状态与浏览器证据改由 [字幕验收](./canvas-clip-subtitles-functional-audit.md) 维护；以下HTML/普通文字契约仍是下一批，不计为实现完成。

继续静态核对同一 `1q5w-zbtkz5ka.js`：`ph` 为 callback赋值（约619000），实际播放头→sh行选择→已存在有效composition时iZ/addCue；没有有效composition且仍在读旧overlay时提示loading，不能创建新空HTML覆盖它。新建通过 `iw` 产生timeline composition、revision加一，历史包含旧/新HTML。`iZ` 的3秒文字先经 `iv`（243292）按同clip/同track向前找空档，毫秒精度，截到totalDuration，余量小于0.1秒拒绝。基础VTT的允许重叠不能复制到该分支。

HTML属性常量在225195附近：composition为 `data-composition-id`，画幅 `data-width/data-height`，时基 `data-time-base`，片段 `data-start/data-duration`，锚点 `data-libtv-cue-id`，行 `data-track-index`，角色 `data-role`，正文 `data-libtv-text`，逐字 `data-word-start/data-word-duration`；隐藏与整行隐藏分为 `data-libtv-hidden/data-libtv-track-hidden`。`iO`（251400附近）读取最外层cue、plain/words正文、clip/library cue来源、逐字计时及issues；不能只解析p标签文本。`i1`（257267后）验证唯一composition、非空ID、字面timeline时基、规范非负整数track/group anchor、cue ID唯一，以及同轨重叠与未映射的indexed elements。source字幕HTML和普通花字还各有不同的读/写/降级协议，需要继续完整追踪，不把HTML加载进主document或用VTT保存替代。

先补齐轨道/cue/HTML与VTT的纯协议、选中和插入计划，再接已有编辑会话的owner/CAS/history/末次输入/保存失败边界。新增、改文案、删cue、拖动/裁边、轨道排序、片段字幕隐藏、apply-all及撤销/重做/刷新应共同验收；主预览与转场叠层必须有实际媒体证据。字体和素材先用现有映射，不扩大全量采集。

权限、云端HTML/VTT写接口、保存失败、损坏HTML和降级状态仍需追踪。保留用户无需登录的范围；本地文档写入须明确为本地适配，不能伪造服务器生成字幕、云锁、协作或上传成功。本文件只记录下一批已发现的要求，不提高复刻完成比例。
