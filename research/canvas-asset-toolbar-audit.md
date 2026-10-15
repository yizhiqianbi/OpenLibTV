# Canvas 素材入口与共享选择器（2026-10-11）

本批使用已归档的公开客户端证据，没有登录原站、请求账号资产、执行服务器写入或继续全量采集内容。选择器、协议转换和 Canvas 调用方分别维护；没有复制第二套 Skills 资产实现，也没有扩大工程依赖白名单。

## 原始证据

- `research/source/0odbr73whm6q4.js`，modules **341341 / 331459 / 629706**：素材数据转换、附件入口及外部 scroll/wheel/focus 关闭。加号点击显示“本地上传”和“素材库添加”；素材入口 offset 6px、hover closeDelay 400ms。当前 Canvas caller 使用 click。
- `research/source/0utjet5hna_yu.js`，module **55061**：素材数据为 JSON `{version:2,items:[{data:...}]}`；URL 列表来自各节点的 `data.url`。节点类型、名称及文本内容由转换规则读取，不能将全部资产直接当图片。
- module **341341** 的一次插入限制是每种媒体最多 20 项，按本次选入集合检查，独立于输入中已有引用；超限整批拒绝。图片/视频/音频默认名称分别为“图片素材”“视频素材”“音频素材”，默认 MIME 分别为 image/jpeg、video/mp4、audio/mpeg。
- `research/source/0k8_vz_bdp_zz.js`：实际 Canvas 输入调用模型插入、独立生成模式及素材入口。素材插入当前富文本光标，不创建画布节点；本地上传仍使用独立的 Agent 上传 reader。

## 模块与接线

- `components/agent/AgentAssetPicker.jsx` / `agent-asset-picker.css`：跨域共享选择器及只读预览，直接依赖 services，不依赖 Skills 私有模块。旧 `features/skills/components/SkillAssetPicker.jsx` 只兼容导出。
- `services/asset-picker/model.ts` / `hooks/useAssetPickerPages.ts`：strict TS 纯记录正规化及异步分页。旧 Skills 路径只兼容导出；20 条分页、300ms 搜索、AbortSignal、游标校验、迟到结果隔离及跨筛选选择保留。
- `services/agent-assets.ts`：v2 媒体/文本转换与批次上限，无 UI、请求或存储。多节点、多 URL 保留输入顺序；blob URL 不作为完成素材；来自资产的 metadata 保存 mediaAssetUuid。
- `features/canvas/components/CanvasAssetSelector.jsx`：用户/只读门控、菜单、共享选择器与 RichAgentInput 的协调。`onPickAssets` 取得选中的正规化记录；旧 `onPick` 引用回调继续兼容。
- `RichAgentInput.insertPlainText` 使用文本节点及 hardBreak，文本回退不经 HTML parser。只有本批没有媒体引用时插入合并文本；无可用内容显示明确提示。当前选择器仍以可用媒体记录为入口，独立纯文本资产界面未实现。

菜单用公共 `useAgentToolbarPopover`，弹窗与嵌套预览用公共 dialog-stack。打开选择器前关闭菜单并将焦点还给稳定的加号；取消选择器回到加号，预览 Escape 回到对应预览按钮，成功插入在弹窗退出后恢复输入焦点。禁止在背景仍 inert 时抢先聚焦编辑器。超限保留选择和弹窗；切换项目或只读状态不能把旧批次插入新文档。

## 验证

真实 TipTap / 共享选择器回归覆盖菜单、逐层 Escape、取消与成功插入后的焦点、预览不自动选中、批量引用光标位置、v2 21 张图片整批拒绝且选择保留、文字回退不执行 HTML；纯协议回归覆盖数据形状、顺序、每种上限、文本和坏 JSON。

本地浏览器使用明确 QA adapter：桌面菜单两项与共享选择器可操作；预览 Escape 回到选择器且未改变选择，选择“场景参考”后输入新增媒体引用而画布仍只有原节点。390×844 下选择器 x16、宽358、右边界374，页面宽390无横向溢出；关闭回到加号。模型弹层 x8、宽370、最高384、右边界378。桌面证明 `artifacts/canvas-toolbar-live-proof.jpg`，统一检查与实际范围见 `coverage.md`。

## 仍需完成

选择器尚未实现原站全部文件夹、团队、主体库和独立文本资产分支；`assetData` 是运营 AssetRecord 的可选适配字段，并不意味着原 page/total API 已直接接通。真实权益、私有素材授权、上传/资产写服务和所有菜单状态像素仍需后续验收。前端共享层重构及本地回归不代表整体复刻完成。
