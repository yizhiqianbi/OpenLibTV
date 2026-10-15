# ScriptV2 资产、三阶段与 CSV 功能审计

2026-10-11。依据现有公开客户端归档与当前独立实现核对。没有执行原站 bundle、遥测或写接口，没有登录、使用账号资源或继续全量采集内容。源码契约、本机实现和真实服务验收分别记录；本文件不代表整个分镜或全站复刻完成。

后续批次已接单/批自动拼接、双轨500ms草稿、资产富文本、旧bundle覆盖确认与20秒撤销；本文件下面的“尚未实现”保留当时批次范围，当前规则及验证以 [提示词拼接审计](./script-prompt-compose-functional-audit.md) 为准。

## 源码证据

| 公开归档                                                   | 模块 / handler                             | 确认的边界                                                                        |
| ---------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `source/3u6hjewm8qox_.js`                                  | 272776，ScriptV2 `sT`，`su/oZ/e0/o0/o1/o5` | 三阶段导航、ready/busy/segments、下载与输出生成门槛；旧 ScriptNode `aD` 不能混用  |
| 同上                                                       | `iv/ig/ii/ip/iu/o7`                        | 准备资产、三类卡片、编辑 drawer、改名预览、删除策略                               |
| 同上                                                       | `aH/r7/im/r0/rH`                           | 实际媒体与 linked task 进度、识别确认、单资产来源选择、批量 AI                    |
| 同上                                                       | `eV/si`，`oi/op/om/oh`，`oS/oW/tR/tP`      | CSV 与 toolbar gate、本地合成模板、媒体历史消费与 active 切换                     |
| `source/2mce1ay9u3g9g.js`                                  | 304380 / 186150 / 488692                   | 资产 CRUD / 节点关联与回退、用户/系统写边界、资产组布局                           |
| 同上                                                       | 101083 / 138477                            | 单击导入的个人库图片 picker、目录/分类/图片过滤                                   |
| `source/1eqsg-pmc0mun.js`                                  | 373983；240429 / 16353 / 321523            | incoming 资产同步、行引用查询/清理；智能批次恢复、fingerprint、当前 prompt bundle |
| `source/447ud3w8leoy-.js`                                  | 302098 / 939279                            | 有效资产 bucket 规范化、独立 image/video prompt state/hash                        |
| `source/170exq-5f14zz.js`                                  | 182004                                     | role→bucket、SCRIPT_FIELD_META / API 字段标签                                     |
| `source/0utjet5hna_yu.js`                                  | 55061 / 664115                             | 个人库首个可用 image、下载文件名                                                  |
| `source/2ijgtfwpg93os.js`、`../public/data/locale-zh.json` | 中文 locale                                | 阶段、资产、错误和 CSV 文案                                                       |

更细的原函数定位与完整异步流程来自本批 `artifacts/script-assets-source-audit.md`、`artifacts/script-workflow-source-audit.md`；此处保留长期维护需要的契约。归档脚本仅是研究证据，不作为生产应用运行。

## 三阶段、进度与动作门槛

步骤为 `confirm-shots / prepare-assets / compose-prompts`，文案“确认镜头 / 准备资产 / 合成提示词”。三个按钮均可直接导航，不是前一阶段通过才解锁的审批。初始/未知 step 回确认镜头，step 保存在 React 内存而非 node data；源 `ta` 记住上次非资产 step。确认页“→ 下一步：准备资产”和资产页“→ 下一步：合成提示词”只切 step，不触发确认写入、识别或 AI 请求。确认/合成共用表格，合成强调提示词列。

| 阶段    | ready                                                                | busy 与 segments                                                                |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| shots   | 每行 `plotDescription.trim()` 非空                                   | 不 busy；每行 ready/default                                                     |
| assets  | 有效资产 `thumbnailUrl.trim()`，或真实 linked node 的非空 URL        | linked taskInfo.loading 才 busy；对应 linked node 的 loading segment 优先于旧图 |
| prompts | 任一 promptState 存在时两者须 synced；两者均不存在才回退两种文本非空 | 任一状态 generating 才 busy；segment ready 优先，其次 loading/default           |

total=0→idle；否则全部 ready 且无 forcePending→ready，有部分 ready→partial，其余 idle。资产生成中即使都有旧图仍 partial。`r7` 按资产 occurrence 统计真实 linked task 的 loading；同 node 可重复计数，progressPercent 仅对已知 number 值取平均并 Math.floor，未知不补0。IDs 字段缺失才使用 generatingCount fallback，显式空 IDs 不 fallback。圆环最多24段，计数保留实际总数。

下载 `allReady` 要求三个阶段均 ready。输出生成则是 shots/assets ready 且至少一行、每行两种 prompt 文本非空、状态不 generating：**stale 有文本可生成**，但不满足下载 ready；显式双 synced 空文本可让 prompt stage ready，却不能输出生成。完整脚本 task generating 阻断输出/下载，`recompute-batch-shots` 不当作完整脚本生成。

资产 footer 独立按实际 missing 媒体判定，**空三组也显示完成/下一步，顶部资产阶段仍 idle**；不使用 workflow busy gate 替代 footer。缺图项全在生成时不能再批量生成。源成功说明“资产已生成，如再次生成将会覆盖之前的图片/场景/道具等资产”。识别 banner `im` 的确认按钮写 `confirmedAssetRecognition:true`；`iv` 也可由 caller 显式传 confirmedRecognition，源 `sT` 的 prepare-assets caller 使用 styleDescription truthiness，不能把下一步当作写识别确认。

## 准备资产的完整本地交互

角色/场景/道具为 `characters/scenes/props`；全局风格单独读 `data.styleDescription`。源卡宽277px、aspect-video 图片、名称12px/描述10px单行截断；新增卡156×156。confidence 的单卡提示条件 `0 < confidence <= .5`；识别 banner 只统计 status ready 且 number confidence，低置信度统计可含0。合规读 `compliance.state` 的 pass/pending/reject，metadata 不表示本机审核结果。

新增立即追加 `{id,role,name:'',description:'',status:'pending',createdAt,updatedAt}`，再打开“新增角色/场景/道具”选图；取消仍保留空项。源码此 UI 未见数量上限、最少保留、名称唯一性或 maxLength，也没有复制资产动作。

选图弹窗800px、body480px，tab 为“AI生成 / 从当前画布选择 / 本地上传 / 个人资产库”。当前画布扫描 image，排除 assetVideoAssetId/assetAudioAssetId，5列方形网格，只禁用当前已绑定项并显示“当前”。候选取首 URL 或 originalUrl，替换却只读 `data.url[0]`/string URL；不能混用节点 prompt picker 的 first-payload 或 first-nonempty 适配。

替换写 link/thumbnail/status ready/timestamp，补普通 edge。多个资产可以复用同一图片；旧 link 最后一次解绑才删普通 edge，排除 portraitVirtual/assetVirtual，**不删媒体节点**。清图清 link/thumbnail，保留 status。源 helper 由 UI 保证图片类型；本机 plan 再校验当前 node 类型，防止候选打开后被外部改动。

点击/键盘进入560px右侧编辑 drawer，role固定。名称 dirty 才显示保存按钮，`draft.trim() || oldName`；命中文本先弹“同步替换分镜文本？”，最多8条预览，确认“同步替换并保存”，取消回旧名。实际 rename 大小写敏感 replaceAll，覆盖画面/对白/两种prompt/旁白/光影/音效及 dialogueLines.text；character 名称/描述、三种 prompt entityRefs.text 也同步。dialogueLines.entityRefs.text 不改。propTags 实际需该行 propAssetIds 绑定且整段同名；预览不检查 ID，且不列 prompt/entityRefs，这是源分支差异。描述失焦保存，dirty 提示“失焦自动保存”。

删除无引用且无 rows 可直接进行；有 rows 即使引用数0也询问。默认 keep_text 只删资产/必要普通 edge。character/scene 可 clear_chars，prop UI 禁用。专属清理删角色/场景 ID 或角色规范化同名项，旧名规范化长度≤1时连专属 ID 清理也跳过；统一 entityRefs 清理仍执行。删除保留正文、prompt 字符串和 dialogueLines.characterRef，不当作删除文字。

源 rename/delete 直接 user patch，不走表格 `tk` 的 prompt reconciliation；同 ID thumbnail 变化才由 `sT` effect 对当前 rows 重算，而且只有 image/video state 变化才写 rows。本机把该 effect 合入单次图计划，不将全部资产编辑强制标 stale。

所有 modal 共用 EditorDialog/dialog-stack并 portal到body。非模态菜单复用 useAgentToolbarPopover；active dialog内 portal到 owner dialog，以满足当前背景隔离/焦点规则，其他情况body。外部 pointer/focus/scroll关闭不抢新焦点，Escape先关menu回trigger，子modal前回稳定trigger。linked-only 卡预览统一使用真实可用图源，是显式本机健壮适配，不重写 payload。窄屏100vw drawer/3列候选是本机可操作适配，不能宣称原站手机形态已核实。

## 原服务与尚未落地的本地流程

| 分支             | 确切源码契约                                                                                                                                                                                               | 当前边界                                                                                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 专属个人库       | 101083 single-click；search300ms；目录/搜索/分类分别调用 API，page1/size100；选中卡“导入中...”并禁用single候选。55061遍历首个有效 image，可跳过前项                                                        | 未接专属目录/分类/详情导入；不是共享20条多选picker已完成                                                                             |
| 上传             | 首文件、image/*、≤30MiB，input接受PNG/JPEG/WebP/GIF；blob placeholder→替换→真实上传，owner/intent/current link保护与失败补偿                                                                               | 未接远端上传；不将本地reader称为源上传成功                                                                                           |
| 单/批资产AI      | text2image/count1；宽比例≥1.5、优先lib-image-2、2:1/medium/2K；费用300ms、未知“-”；3s轮询/120s边界。批量先创建左侧竖向组，独立placeholder与Promise.allSettled                                              | 费用、权益、提交/轮询/stop与完整task overlay未接，UI明确不可用，不造假结果                                                           |
| 自动拼接         | 独立concat与smart，默认smart；concat按字段模板、refs/fingerprint本地合成，不消耗积分；覆盖非空prompt需确认，撤销20秒并检查afterFingerprint                                                                 | **本地concat也尚未实现**；当前“合成提示词”仅手动编辑，不能把禁用总合成按钮称为本地模式已完整                                         |
| prompt编辑工作区 | 500ms乐观debounce、bundle fingerprint；关闭/重合成先flush双轨，仅全部saved继续；dirty不被外部覆盖                                                                                                          | 当前已有基础prompt编辑/草稿，不等同源双轨flush、覆盖确认、20秒撤销与批量模式选择                                                     |
| 媒体历史         | imageVersions/videoVersions length>1才出菜单；点击node定位，非active可“设为当前”，按versionId唯一active；不改prompt、不删节点                                                                              | 未接媒体版本菜单/active操作；未找到版本创建/读取handler，不制造空节点版本。20秒撤销和智能批次恢复也不是媒体历史                      |
| mixed2video      | ScriptV2专属逐镜选择/时长、真实引用、模型锁/portrait门控；区别于普通Group及image-storyboard参数条                                                                                                          | 尚未接专属弹窗/executor；现有本地image/video建组不能作为替代验收                                                                     |
| incoming同步     | 373983 flattenIncoming按image node ID去重；reconcileAssets保留已有role，新增默认characters/pending，lost→ready，补name/thumbnail；断开pending/lost移除，其他项仅清media。stillConnectedNodeIds保留相关link | **尚未接自动incoming图变化→资产bucket reconciliation**；当前replace/clear是显式动作，外部连线/节点URL/name变化不代表源自动同步已完成 |

智能脚本/资产识别/smart合成依赖真实任务与节点continuation guard；智能恢复 `scriptV2PromptBatchRuns` 保留全部running、最近20终态及running依赖的旧记录，partial_failed不能当全成功。账号历史读取、真实协作、费用/生成/支付仍未接。保存到个人资产只有caller提供实际callback时展示，当前不宣称已完成该写服务。

## CSV 是此版本的实际导出

ScriptV2 `eV` 输出 `text/csv;charset=utf-8;`、UTF-8 BOM、LF；不是XLSX。handler只检查原始rows非空，toolbar另外要求allReady且不完整脚本生成中。legacy JSON及Canvas文档JSON导入是独立适配，局部源码未找到ScriptV2 CSV/脚本导入入口，不为对称性创造导入。

列按 SCRIPT_FIELD_META去 emotion/propTags：镜号、时长、画面描述、视频参考图、景别、光影氛围、音效、对白、分镜提示词、视频提示词；画面描述后插入全表最大characters.length组“角色N/角色描述N/角色图N”，短行补空。shotColumns.field按API snake_case匹配label，显式空label保留。视频参考图只取referenceFrameImage，普通字段只接受string/number，不新增对象、dialogueLines、cinematics、运镜或refs列。

cell含逗号/双引号/CR/LF时加双引号，内部双引号加倍。镜头后空行，资产表头“类型,名称,图片,描述提示词”，按角色/场景/道具顺序，仅name truthy项，图片只取原thumbnailUrl，不读linked fallback；无资产仍有表头。基名title→name→label→“脚本”，非法文件名字符/ASCII控制字符替换`_`，空为file，直接追加`.csv`。源不重写正文或公式样式文本。

## 当前模块与验证边界

- `workflow-model.js` 只投影counts/readiness/busy/segments/default selection，`ScriptStageProgress.jsx`显示并导航；`CanvasScriptNode.jsx`协调当前step、表格、资产和fullscreen，不在纯模型读store或写文档。
- `ScriptAssetsView.jsx`负责卡片/选择/编辑/确认/预览，`useScriptAssets.js`读最新document并隔离取消，`script-assets-model.js`保留数据/行引用/普通edge规则，`script-assets.css`为私有样式。
- `useCanvasGraphActions.mutateScriptAsset`核对documentKey、signal、ready/readonly、expectedNode与当前graph；name/description额外asset fingerprint，成功单次CAS/history，失败保留输入/选择，不冒充原协作写入。
- `export-csv.js`返回download descriptor，不创建Blob/触发下载；当前CanvasNode下载按V2 gate接CSV，legacy协议保留。`graph-plans.js`只创建本地空生成图并保留hiddenUuid绑定，不提交任务。

资产域2个定向测试文件15项通过：纯图规则、空资产footer、实际新增取消/选图、rename/blur/delete、外部文本冲突、失败保留、切文档取消迟到结果、菜单pointer/focus/Arrow/Escape。资产新增文件ESLint零警告和Prettier通过。workflow/CSV独立原记录有16项纯规则测试；本段不是整批check结果，也不是浏览器或原站账号服务验收。

## Root 实际浏览器记录（2026-10-11）

实际 App 无需登录，使用本地 `/canvas?projectId=generator-oct11-proof` 的代表性镜头与两张既有图片，不使用原站账号、资源库或任务写入。桌面1280×720，窄屏390×844。

- 新增场景立即保存空pending，关闭选图后空卡仍保留。编辑名称“海岸设定”、描述“晨光下的海岸，远处有山，电影构图。”，选择真实参考图1并保存名称；顶部从2/3到3/3，底部出现下一步。刷新后名称、描述、图源和1/1资产进度恢复。
- 编辑drawer内菜单Escape只关菜单并回“更多操作”触发器，保留两层dialog；图片预览Escape返回drawer，再关闭drawer返回脚本。删除确认默认keep_text，两种场景策略显示正常，本机浏览器取消删除；实际删除图规则和引用清理已由定向测试验证，不把取消称为删除验收。
- 清除场景图后资产进度0/1、V2下载禁用，参考图1和2原节点保留。关闭脚本进行一次undo→1/1、redo→0/1、undo→1/1；重开仍在资产阶段，刷新恢复图源。统一图规则另验证多资产共享图和最后普通连线删除，浏览器本批没有逐项验证这些分支。
- 下一步进入compose，保留手动prompt并强调该列；智能合成明确未接。关闭脚本下载实际“脚本节点 1.csv”，422bytes，BOM efbbbf，5行，含镜头、资产段、保存名称/描述与真实图URL；副本 `artifacts/script-v2-downloaded-proof.csv`。
- 桌面fullscreen x0/width1280，右侧drawer x720/width560；390px fullscreen和drawer均x0/width390，页面scrollWidth390。选图窗口x24/width342/right366，当前图片禁用，参考图2可选；本批取消替换保留原图。预览、picker、drawer实际层级均可见。

截图发现独立模块的160–190层低于现有EditorDialog4000，造成drawer/picker/preview虽在DOM可交互但视觉被fullscreen遮住；Root将私有层次修正为4010–4040，复核桌面和390px实际截图。候选按钮也受全局inline-flex影响挤压名称，限定私有selector为block后两张图与名称正常。生产冻结后刷新继续上述流程，未出现新的error/warn；开发中增加controller ref时曾触发10:20:31 HMR hook顺序异常，整页刷新后消失，不能用热更新中间状态作为运行通过证据。

证据：`artifacts/script-assets-desktop-proof.jpg`、`script-asset-drawer-desktop-proof.jpg`、`script-asset-drawer-mobile-proof.jpg`、`script-asset-picker-mobile-proof.jpg`。局部CSS适配不代表原站所有手机像素已核实。

Studio `/animation-preview?projectId=studio-camera-qa` 的390px项目资产 / 真实GLB静态属性编辑、关闭展开与刷新恢复也通过，位置X=0.35；独立验证的源码和范围见 [Studio审计](../src/features/studio/SOURCE_AUDIT.md)，证据 `artifacts/studio-properties-mobile-proof.jpg`。所有临时tab已关闭、viewport override已重置，保留用户原有两个tab。

## Root 工程检查记录（2026-10-11）

最终 `npm run check` **189文件 /1010测试通过**：Prettier、零警告ESLint（含导入边界）、核心strict TypeScript、Vitest和Vite生产构建均通过。日志 `artifacts/script-assets-workflow-final-check.log`，测试开始10:26:38，生产构建15.08s。补回归包括V2首个table view实际ID、title优先CSV文件名、完整生成与recompute/终态门控、已打开建图弹窗busy、一次图历史、资产并发fingerprint和失败表格draft的外部rows冲突。

首次检查静态阶段与1010测试通过，public素材复制遇ENOSPC；磁盘可用空间恢复后，对最终CSS重新运行整套检查通过，未删源码、原素材或用户文件，也未改变构建内容以绕过问题。随后仅补维护文档并独立检查格式。strict未覆盖全部JSX，远端CI尚未运行；本地样本、CSV和GLB验收不代表原站账号服务或全部复刻完成。
