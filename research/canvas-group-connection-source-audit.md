# Canvas 普通真实组输出入口源码审计

2026-10-11。本批针对虚拟多选已经具备输出、单个真实普通组却没有可操作输出入口的差距。只读核对本地保存的公开客户端，不执行原 bundle、不登录、不使用账号资源、不写入原站。

## 确切源码证据

| 证据文件及字符位置                                 | 已核对行为                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `research/source/21_0xvlvkw1sz.js` 约 822778，`sr` | 从当前选中节点调用 `getSelectionSingleRealGroup`，没有单个真实组时返回 null；truthy `data.sourceScriptNodeId` 或 `isShotBreakdownGroupData(data)` 排除真实组入口。                 |
| 同文件，紧接 `sa`                                  | `getGroupBatchConnectionSourceNodes(sr.id,tq)` 返回递归普通组下的非组/non-reference 叶子，映射 ID；并不要求至少两个来源，也不先用 action 资格过滤。                                |
| 同文件约 823095，`sn`                              | 真实组宽高依次 `measured?.width/height ?? width/height ?? 0`；任一为 0 不产生 bounds。位置从自身 relative position 出发，逐级叠加当前 parent position，得到真实组的 world bounds。 |
| 同文件约 965710，第二套 `nJ` caller                | 入口条件为 `sr && sn && sa.length>0 && !i4.visible && ob`；virtual selection 的入口是上一套 `nJ`。真实组不用 virtual selection 的标题/外边缘 padding。                             |
| 同文件约 753081，`ob`                              | `canBatchConnect` 排除 locked、readonly、publish protection、hand、mark、focus、reference pick、practice。该门控属于 caller 状态，不是组几何模型。                                 |
| `research/source/170exq-5f14zz.js` 约 6670         | `isShotBreakdownGroupData` 的精确条件是对象存在、`data.type === 'group'`、`breakdownSourceNodeId` 为非空字符串。不能根据组名称或其他猜测字段判断。                                 |

上述位置为当前 UTF-8 文本解码后的字符位置；文件不是生产应用依赖。递归来源、六项候选、聚合资格与 drop/create 提交协议的完整证据继续见 [多选连接审计](./canvas-multi-connection-source-audit.md)。普通组的布局/批量运行器与多源输出不是同一个协议。

## 本批纯入口协议

新增 `src/features/canvas/domain/multi-connection-entry-model.js`，仅描述入口与 screen-local 投影，不持有 UI、手势、文档生命周期或持久化。

`resolveCanvasMultiConnectionEntry({nodes,selectedIds,zoom,getNodeSize?})`：

- 有既有 `canvasVirtualSelection` 结果时优先返回它，保留原 `bounds`、`position`、`targetNodeIds`、`sourceSeedIds`、`dragNodeIds`、`groupsToRemoveIds` 与 visible；只附加 `kind:'selection'` 和 `entryKey:'selection:' + JSON.stringify(targetNodeIds)`。不改变虚拟选区展开、来源资格或两阶段 padding。
- 没有 virtual selection 时，沿用既有 `canvasSelectionSingleRealGroup`，排除两类确有源码依据的派生组，读取该组尺寸、当前 world position 与递归源集合。
- 真实组返回 `{kind:'group',entryKey:'group:'+group.id,groupId,bounds,sourceSeedIds}`。bounds 是实际组壳的 world rectangle，不把所有孩子的 rectangle 合并为新壳。sources 可仅有一个无 action 的叶子；真正 action/menu/target 资格仍由既有多源 resolver 负责。空组或只有 reference 的组不产生入口。
- sources 只依据当前 `parentId` 和图顺序，不相信过时 `childNodeIds`；纯函数不修改节点或选择。
- `entryKey` 区分同一源集合的不同真实组，却不包含不断变化的 bounds。组的孩子增删会更新 sourceSeedIds，caller 必须同时使用完整 source signature 取消旧手势/菜单，不能只检查 entryKey。

`canvasMultiConnectionEntryProjection({entry,view,zoom?})`：selection 完全复用既有 `canvasSelectionOverlayProjection`；group 仅返回 `{add:{x,y}}`，即 `view.x + (bounds.x+bounds.width)*zoom` 与 `view.y + (bounds.y+bounds.height/2)*zoom`。不产生第二个 frame、toolbar 或虚拟 padding。固定屏幕尺寸的 80px hit/24px glyph 和右侧 17px 圆心位移继续归 view 所有，不计入真实组文档。

## 源与本机适配边界

- 默认真实组尺寸按源码 measured-first 且没有默认大小；已知宽高 0 不退回 stored、不制造可操作默认壳。本地 caller 可显式注入既有 `canvasNodeSize`，其 stored-first 与当前 renderer 保持一致。此优先级差异必须记录，不能称原始 React Flow measurement 已验证。
- 源 `sn` 的 `!width/!height` 只检查 truthiness。本地额外拒绝非有限或非正尺寸，以及无效 zoom/view；这是避免损坏本地文档产生无限几何的工程适配。
- world ancestry 沿用本地 `canvasWorldPosition` 的 cycle guard；损坏 parent 环不会死循环。这是本地数据防御，不能推测原站异常数据处理一致。
- 真正可写模式由 NodeCanvas caller/既有 controller 门控。纯 descriptor 不宣称协作锁、账号授权、分镜专用输出、真实生成或服务器写入已接通。
- 对派生组的排除只适用于源码 sr 的单真实组路径。已有普通 virtual selection 包含这些节点时，不擅自扩大门控到整个选区。

## 定向验证

2026-10-11 20:17:17，`vitest` 定向运行新入口测试、既有 selection-overlay 与 multi-connection 纯规则：**3 个文件、97 项测试通过**，749ms，exit 0。新入口测试覆盖虚拟结果不变、单个 actionless source、recursive graph-order/去 reference、过时 child metadata、两类派生组门控、nested world bounds、measured/stored 注入、缺尺寸/0尺寸、entry identity、孩子集合变化、只读纯数据、损坏 ancestry 环及真实组直接 screen projection。日志为 `artifacts/canvas-group-entry-model-regression.log`。

两份新纯域文件 Prettier 与零警告 ESLint 通过；未扩大 architecture 白名单。此阶段是纯模型证据，不是实际页面入口、菜单、图历史或浏览器验收。页面接线、迟到请求取消、共享目标一次提交及桌面/窄屏证据由集成批次补充；没有这类证据不能把普通组功能整体标记完成。

后续本批 NodeCanvas/Viewport 已完成普通组输出接线、递归 membership owner和精确入口焦点；真实1280×720/390×844、共享取消链焦点失败重现/修复与完整检查见 [集成验收](./canvas-group-selection-functional-audit.md)。这不扩大上面的源码证据或未接的特殊renderer/服务范围。
