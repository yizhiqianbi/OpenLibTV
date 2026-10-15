# 节点引用替换与资产入口（2026-10-11）

当前版本按用户要求无需登录；本批只使用公开客户端源码、代表性本机资产与实际本地 Canvas。没有执行原站 bundle、遥测、账号读取、生成、消费或写请求。内容全量采集继续停止。全站复刻目标仍未完成。

## 源证据与可核对规则

| 证据                                                    | 模块 / 分支                    | 独立实现的规则                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `research/source/1nd0f9k3q9sol.js`                      | 112007 `rv / rb / rx / rE`     | 点击缩略图 overlay 打开 swap；只替换当前 DOM badge，保留旧参考连线和同 token 其他 occurrence；不追加空格，不显式移动焦点；新候选先连线再解析最新 token |
| 同上                                                    | hover effect / RAF anchor      | 16px overlay、菜单打开冻结 hover；关闭剥离 overlay；跟随 badge 的 rect，脱离 editor 关闭；swap 隐藏 text 和资产入口                                    |
| `research/source/1fuxk6hkx6iug.js`                      | 838978                         | 支持 image / portrait / video / audio / mixed / subject 且有 nodeId 的非 ghost badge；白色 0.75、圆角 4 的原 SVG overlay；装饰不进入正文               |
| `research/source/32slc5-hxcrk7.js`                      | 354594 / 26589                 | 共享 picker、默认个人库、首项媒体预览；引用资产 / 取消 / 确定引用；单类型和多类型容量 caption；全部容量达到上限才标红，零 segments 显示上限 0          |
| `research/source/3lfysz4968xc9.js`                      | 482487                         | 仅 v2 items[0]，目录不可选；首个非空 URL；资格使用已选择各类计数；容量循环至 30 仍可接受则省略该无限段；URL 优先复用已连节点，再复用画布节点，最后新建 |
| `research/source/1nd0f9k3q9sol.js`                      | 135828 / 112007 `rN / rD / rL` | 新节点复制首项 data 和资产名；宽高按 estimateNodeFlowSize；创建在目标左侧；成功项批量插入，失败无多余新节点；普通 @ 保存实际 trigger 并按源码加间隔    |
| 下载 manifest 中的 713118 / 365256                      | 尺寸                           | 默认 350×350，NODE_GAP=100；显式 content 尺寸优先，然后匹配 URL 的 mediaDisplaySize、content 尺寸、ratio；短边 350、长边最多 1050                      |
| `research/source/0j0xve-mquiue.js` / `0leiedr1esdbe.js` | 417754                         | 原 incoming collector 使用 url[0] 且仍保留空 URL 节点，112007 按列表继续建立 token；本机健壮适配见下文                                                 |

新增公开下载的 URL、字节数和 SHA256 记录于 `research/source/prompt-asset-downloads.json`，来源限定为公开 route HTML 及其依赖；源码只用于读取证据。swap 更详细定位保存在 `artifacts/reference-swap-research/FINDINGS.md`。

## 工程边界

- `prompt-badge-swap-dom.js` 只负责资格、Range 和 overlay，`useNodePromptSwap.js` 持有 pointer 生命周期；`useNodePromptMentions.js` 持有菜单、RAF 与一次替换提交。仅被替换视频的媒体资源释放，其他 badge / video DOM 保留。基础菜单 RAF 和 layout 用同一实际宽度限幅，避免窄屏静止重复渲染。
- `mentions-enhanced/asset-reference-model.js` 是纯 candidate / qualification / capacity / batch planner；不读 DOM、存储或权限。原 first-item action 保留，video-clip 按源分类为 video，但普通 connection kind 不接受时拒绝，不把它改造成 video 节点。
- `useCanvasGraphActions.js` 统一同步 CAS、模型校验、pending prompt 与一次图历史；先发布当前图，再更新 React。新增 incoming 的 mode 同次规范，随后 token 从该图读取。`useNodeGenerator` 的可选 getDocument 边界让 prompt callback 使用最新 target / input，避免旧 render 的 params 覆盖刚规范的 mode。
- `useNodePromptAssetPicker.js` 拥有 actual @ request、AbortSignal、document / target / session / draft 身份；pick 和 close 绑定各自渲染时的 request。取消 A、重新打开 B 后，A 的迟到 callback 既不能写 B，也不能关闭 B。外部正文、readonly、disabled、mention 禁用、切 session 与卸载取消；同步导入失败保留选中内容以便重试。
- `NodePromptAssetPicker.jsx` 只注入源 caption、footer 和 caller policy；共享 `AgentAssetPicker` 继续拥有分页、搜索、筛选、选择、预览和 dialog-stack。已选项始终可取消；拒绝回传当前 selection，用当前模型区分超限和不支持；预览仅 first-item 媒体，视频 poster 显式贯通嵌套预览。
- 真实 compositionStart 同时关闭旧菜单；显式选择与 swap commit 再检查 composing，禁止 ref 尚未重渲染时误改组合输入。全部装饰和 picker 生命周期与 Agent parts / 账号策略分离。

## 明确的本机适配

本机 legacy URL 资产通过明确 adapter 构造单项媒体资源，标记 localMediaReady；不是原站账号资产。组内目标创建 root 引用节点时用目标世界坐标，避免相对 parent 偏移。本机 graph 批次先校验所有成功项并一次提交，不短暂发布失败节点。

v2 首项的 url 数组可能以空字符串开头：原 picker 用首个非空 URL，而原 incoming collector 使用第 0 项、仍保留该节点 token。本机此前会过滤空 URL 节点，造成“导入成功但没有 token”。现在本机 generator consumer 选择首个非空 URL，原 data.url 数组完整保存。这是健壮适配，不宣称与原空 URL 缩略图行为相同。未验证的媒体 metadata 仍不能据此当作合法生成输入。

取消恢复原 editor caret 是本机 dialog 生命周期适配。原站登录态像素、移动软键盘、Safari 和完整 preview 过渡尚未核验。

## 实际验证

定向组件覆盖单 occurrence / 重复 token、无额外空格、一次正文撤销、换视频只释放旧媒体、增强菜单无 text / asset、真实 compositionStart 关闭与禁止重开、mention 禁用清理、窄屏静止 RAF 不重复提交。纯资产模型覆盖 first-item、URL 优先复用、重复成功引用、尺寸、资格与容量、失败无残留。

实际 Inline + graphActions + 共享 picker 回归验证首次图片导入：text2video 同次变 mixed2video，正文 {{Mixed 1}}，一次 graph history，undo 前态仍 text2video / @；含空首 URL 的 v2 用相同流程且保存原数组。实际共享 picker 测试覆盖取消 / 光标、批量 / 单次正文历史、失败重试、请求取消 / 迟到隔离、容量颜色和仍可取消。

浏览器实际操作本机 `generator-oct11-proof`：重复 Mixed 1 只替换第一项为 Mixed 2，第二项保留；一次 prompt undo / redo。普通 @ 打开引用资产，取消保留 @ 并回焦点；选择两张已连资产插入当前 Mixed 编号，不创建重复节点。刷新后正文四项恢复。新建空 StarVideo 2.0 节点，选择参考图 1 后复用已有图节点、新增一条引用，模式立即全能参考且 badge 为 Mixed 1；画布一次 undo 恢复文生视频 / @，redo 恢复结果。

390×844：swap 菜单 x37 / width200 / right237，位于 badge 上方；无 text / asset 入口。截图复核发现 transform 容器令工具栏遮挡弹窗，已将 picker portal 到 ownerDocument.body；修复后弹窗 x16 / width358 / right374 / height764，页面 scrollWidth390，桌面和窄屏均有正确遮罩且无工具栏遮挡。取消 / editor undo 通过；66% 画布及展开编辑器中再次验证，Escape 只关闭资产层，保留展开层并回 editor。不是原站实际手机软键盘测试。

截图：`artifacts/prompt-reference-picker-desktop-proof.jpg`、`prompt-reference-imported-desktop-proof.jpg`、`prompt-reference-swap-mobile-proof.jpg`、`prompt-reference-picker-mobile-proof.jpg`。最终 `npm run check` 全部通过：185 个测试文件 / 973 项测试，生产构建 14.85s；日志 `artifacts/prompt-reference-actions-final-check.log`。检查后仅维护文档并重查格式，详细结果追加到 `research/verification-history.md`；strict 只覆盖核心 TypeScript，GitHub CI 尚未远端执行。

## 剩余边界

内容理解标签服务、特殊 token 的完整引用与主体资产编辑、真实团队 / 权益 / collaboration / 运营写服务、费用与 executor、原站授权像素和更多媒体预览分支仍未完成。节点 @ 资产入口已接入，不意味着分镜 ScriptV2 的阶段资产 picker / CRUD 已完成。当前登录、注册与账号资源继续延期。
