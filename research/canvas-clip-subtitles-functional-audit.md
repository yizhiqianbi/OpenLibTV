# 剪辑基础 VTT 字幕编辑与预览（2026-10-15）

本批接入基础 VTT 分支：新增、搜索、选择、正文、全局样式、应用全部、显示/隐藏、删除、时间轴拖动/裁边，以及既有本机历史、保存和主画面叠加。HTML 字幕与普通文本使用另一套协议，仍未实现；不把本批当作整个字幕/文字工具完成。没有原站写请求、登录、云锁、生成字幕或真实导出。

## 静态源依据

仅静态读取已归档的公开脚本，不执行 bootstrap、遥测或写接口：

- `research/source/1q5w-zbtkz5ka.js`，SHA-256 `2ff45dfd6547c674ce09c132a12b99c35d19d4b04a8d637a98653d796219d99e`。`sd/sc/sh` 位于解码字符偏移383184/383258/383396，共用行/cue入口计划；基本 VTT `fg` 约656151，默认文本2秒，至少0.2秒，不套用普通 HTML 文本的避碰规则。`fv/fx/fk` 负责拖动/裁边，pointerdown快照、实时预览、释放一次历史；`ff` 约655882删除cue，最后一条用userCleared保留有意清空。`fr` 约649550是global-only样式，应用全部约655531清classStyles/per-cue style并复制布局。`dv` 约457337持输出坐标和缩放；`dq` 约481400持保存契约；面板约703350–706350，基础VTT行高28px约751311。
- `research/source/1al6tu79axqkm.js`，SHA-256 `47b3e034e2a56dd18c1a28e0d9b7b5fee6612c55d7660f6e14ed4d0718872265`。module472616/642041从7395附近开始：字号12–72、字重100–900取100、字间距0–100、行高0.5–3、描边0–20及透明度0–100；五个基础字体与六个预设。`SUBTITLE_GLOBAL_CUE_STYLE_ONLY=true`，VTT预览和序列化的有效样式来自defaultStyle，不把classStyles或cue.style当作生效的局部样式。VTT时间、已知标签、class parts、source offsets/speed合并、默认line88%/position50%/size86%和百分比三位小数均来自该模块。

## 分层与持久化

`domain/subtitle-model.js` 管理纯规则，`subtitle-vtt.js` 管理解析/序列化/来源合并，`subtitle-document-model.js` 管理加载计划、当前有效轨道和末次文字投影，`subtitle-layout-model.js` 管理输出画幅和转场插值。模型不反向依赖React或UI。

`services/clip-subtitle-source.js` 是可取消的只读transport；`useClipSubtitleSources` 按会话和来源计划隔离读取、去重同URL、15秒超时、重试、旧结果取消，并按每个split clip的offset/speed映射字幕。读取结果先留在UI派生轨道，编辑接受后才写规范时间轴；读取失败不以空轨覆盖原文档。删除全部后userCleared阻止旧URL复活；显式隐藏/全局样式在来源合并后仍保留。

`clip-subtitle-controls.js` 只协调会话动作；已有 `useCanvasClipEditor` 继续持owner、CAS、十步历史、冲突与恢复副本。正文输入留在UI草稿，失焦或后续编辑前一次提交；共享草稿投影负责pagehide/刷新时最后输入，保存失败保留输入并可重试。拖动使用既有begin/preview/end/cancel事务，不逐帧制造历史。选择字幕与视频/转场选择独立，删除字幕不删除素材。

`ClipSubtitleWorkspace` 持两个non-modal面板；调宽复用提取后的 `ClipEditorSideRail`，转场面板沿用同一组件。Escape与回焦点仍复用dialog-stack，拖动中的Escape先取消手势，再由下一次Escape关闭面板。媒体宿主不因面板开关重建。`subtitle-preview-renderer` 是主runtime拥有的DOM层，按实际输出尺寸/媒体画幅缩放，z110高于转场canvas的z100，正文使用textContent，不执行HTML。字体目录/远程字体加载尚未接入，五个基础字体名称目前依赖可用字体与fallback，不能称字形完全一致。

本机明确适配：规范化保留未知字段，重复cue ID拒绝读取并保留原文档；源class parts与未标记文本的边界换行会重复为VTT空块，本机合并该边界的重复换行，避免序列化回读丢失后续正文。原文rawVtt在首次有效编辑前保留；编辑后生成规范VTT，不承诺逐字节相等。全局样式按源只输出一个::cue规则，保留class正文协议，不额外启用源已关闭的class CSS。

## 实际验证与失败记录

最终专项 **25文件/496项全部通过**，日志 `artifacts/clip-subtitles-validated-targeted.log`。包含真实GraphActions/Drafts/Autosave的最后输入、pagehide、配额失败重试、单次历史、删除/恢复、拖动取消、旧会话拒写；来源读取取消/去重/失败重试、VTT roundtrip/global-only CSS、字面HTML、布局/边界与面板/键盘/空态分别回归。首轮24文件/490项中两项失败已保留在 `artifacts/clip-subtitles-targeted.log`，不能以更早转场438/6408代替本批全量。

Chromium GUI使用前批从项目页创建、上传合成blue.mp4、真实连线/拆分得到的项目。恢复其合法浏览器状态后继续操作；未注入graph、storage字段或合成pointer事件。证据位于 `output/playwright/clip-subtitles/`：

- 输入两行“字幕验收：最后输入 / 第二行保留”，保持输入框焦点直接刷新；重新打开后正文及rawVtt保留。`desktop-draft.png`与浏览器readback记录实际文字。
- 12px/黄字黑边持久化，预览有效颜色rgb(255,220,0)，496px显示宽度下字号18.6px/描边3.1px；`desktop-styled.png`实际可见。
- 原生鼠标左拖50px将3–5秒改为2.5–4.5；撤销回3–5、重做恢复，再拖右端40px成为2.5–4.1。拖动中Escape取消，left回256px并保留面板，两个视频片段不变。
- 隐藏后主叠层数量为0，撤销恢复；Delete最后cue保持两个视频片段、空列表与禁用样式。首轮该操作暴露空草稿/空选择比较触发空指针，已修复并新增组件回归；`desktop-delete-empty-fixed.png`是修复后证据。旧浏览器console错误是修复前记录，不称整段日志零错误。
- 在末条后插入第二cue并修改正文，应用全部后两个cue共享规范布局；seek到4.1秒只显示第二条，原cue按半开区间停止。
- 390×844页面scrollWidth=390，左右面板x8/199、宽183，样式内部可滚动，底部应用全部可操作；Escape后主dialog保留，焦点回`clip-toolbar-subtitle`。`mobile-390.png`、`mobile-escape-snapshot.txt`与`final-readback.txt`记录实际结果。手机触控和Safari不由该桌面窄视口证明。
- 桌面seek3秒时，两个视频readyState4且在3秒，转场320×180 canvas显示、z100，字幕z110；`desktop-transition-caption-settled.png`可见黄字在实际蓝色视频之上。第一张立即截图仍在媒体准备阶段呈黑，后续ready与真实图像单独复验，不把它当作成功。窄屏尝试沿用桌面306px刻度坐标超出可点击区域而超时，也未记为成功。

首轮打开保留旧GUI样本时出现时间轴冲突提示，使用已有“保留副本并打开最新时间轴”后继续；没有充分证据将其根因归于字幕。随后刷新重开及上述全部操作无新冲突/alert。后续仍应对更多实际文档与外部写入作压力验证，不把该一次现象隐去或声称已确定修复。

最终Node24.19.0完整 `npm run check` terminal0：**443文件/6429测试全部通过**，19:01:17开始、359.69s，标准生产构建17.99s；格式、零警告lint/架构、核心strict通过。日志 `artifacts/clip-subtitles-full-check.log`，滚动入口 `artifacts/current-full-check.log`。1303份已记录源码/config指纹结束后未变；最终CanvasPage891607字节低于900000预算，ClipEditorWorkspace84391字节，未提高阈值或使用manualChunks。统计含独立影游，strict不覆盖全部JSX；jsdom媒体未实现通知与DEP0129仍保留，CI未远端执行，本机未部署。

较早的完整检查在浏览器发现空态崩溃后主动中止，terminal143，日志 `artifacts/clip-subtitles-before-empty-inspector-check.log`；不是本批通过证据。最终检查后仅维护文档与proof，并单独复查格式。

## 继续推进的范围

HTML字幕、普通文字、完整字体目录/字体资产、源片段字幕菜单/多行排序等高级入口、云端HTML/VTT写入、生成字幕、提前媒体预热、波形/帧缓存与真实导出仍缺。WebAudio全部分支、真机触控/Safari、GPU压力与大图另验。基础VTT不是HTML分支的简化替代，剩余要求继续保留在全站目标中；本批未部署，也不改变当前约70%的保守工程估算。
