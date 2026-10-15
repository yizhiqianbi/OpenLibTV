# 生成器、分镜与监视器实际接线（2026-10-11）

本批只读取归档公开源码并使用代表性媒体 / 合成 GLB。没有登录原站、使用账号资源、执行原 bundle 或调用写接口。工程优化后的边界继续保留；这份记录说明已接运行入口的功能及剩余差距，不代表全站完备或逐像素验收。

## 生成器与图事务

`GeneratorFrame` 管理内嵌 / portal 展开和八方向 pointer resize，`expanded-geometry` 为纯规则。原尺寸默认800×600、最小660×360、视口90%上限；中心缩放按两倍位移计算，窄屏上限优先。切换前提交150ms草稿，尺寸随节点保存；模型 / 设置 / @ 菜单置于当前 dialog 内。共享 dialog-stack child dismissal 先关闭子菜单，下一次 Escape 才关闭父 dialog，不建立另一套滚动锁或焦点栈。

引用卡的删除 / 拖动排序 / @ 插入由独立 view 和 `reference-actions-model` 处理。按 source 190411 / 677418 同次保存 typed / mixed order，按稳定节点身份重写 prompt token；mixed 未解析 token 按源码清理，普通 token 保留。删除根据 source 814059 移除直接边或排除分组成员，同时清理 params 的旧 fallback；不删除原素材节点，不擅自重编号正文中的删除 token。

全画布 @ 使用实际节点、模型目录和最新图。`connection-inputs` / `connection-validator` 对照归档516779 / 469850 的动作兼容、环 / 反向 / 重复、模型与容量规则；未知 generator / policy 不放行。本地已完成素材通过明确 adapter 标记允许 data URL，不等同于服务器上传。`useCanvasGraphActions` 按 documentKey / ready / readonly / active 和当前图身份门控，提交后先发布同步 currentDocument，再更新 React；连接后的 token lookup 因此不会使用旧序号。历史记录保留动作前的 pending prompt。

实际1280×720：两张参考图拖动后 prompt 变为 `从{{Mixed 2}}平滑过渡到{{Mixed 1}}`；删除引用保留两张原素材节点；搜索未连接“参考图2”后创建真实本地边并插入新 `{{Mixed 2}}`。展开 / 子设置 Escape / resize / 折叠再展开保留草稿与840×634尺寸。390×844展开宽351、页面scrollWidth390，footer控件可见。截图 `artifacts/generator-expanded-desktop-proof.jpg` / `generator-expanded-mobile-proof.jpg`。

仍缺 automatic ghost / Tab、swap / assetpicker完整 trigger 整合、参考音频悬浮播放 / 时长及完整 tooltip / CDN 过渡、light portal逐状态对照。新菜单不能当作这些能力已完成。

## 脚本节点与本地建图

归档272776区分 legacy ScriptNode 与 ScriptV2；182004定义 script_generate、rows / views / assets；939279定义 image / video 各自的 FNV prompt state。`CanvasScriptNode` 已接真实创建 / 编辑 / 双击 / 全屏，V2 九列包括结构化 dialogueLines 和 cinematics.cameraMovement；legacy 字段与未知 metadata 保留。手动 image / video prompt 独立 reconcile，表格 controller 按节点与文档取消迟到补丁。

`graph-plans` 按447ud3w8leoy-/225860的角色引用顺序、明确 asset ID / URL / anchor 规则构造图。图片组和脚本以 sourceScriptNodeId / linkedImageGroupId 关联，子节点使用稳定 scriptRowHiddenUuid；视频只匹配有真实图片产出的镜头，不能按行位置配对，未知 portrait 状态阻断。Root 原子验证新增 ID / 边端点及预期源节点身份后应用整份计划。配置复用本地模型目录；原独立 storyboard 支持目录、费用和 executor 尚未接入。确认按钮明确“创建图组”，不生成假结果。

实际浏览器创建 ScriptV2，编辑画面“晨光下，镜头沿海岸缓慢推进。”、运镜“缓慢推进”、对白“出发吧，去看今天的日出。”，分别填写图片和视频 prompt；创建“分镜图 · 脚本节点 1”及空图片生成子节点。刷新恢复结构化行、运镜、组和 prompt。截图 `artifacts/storyboard-script-desktop-proof.jpg`。

仍缺主体资产 picker / CRUD、完整准备 / 合成工作流、版本历史、色签、复杂 creative 卡片、V2 mixed2video、原 XLSX 导出。当前脚本下载是本地 JSON adapter；资产页仅展示已有 metadata，阶段只提供基础计数 / 手动入口。AI 合成、真实任务和 portrait 服务未接。

## 真实 Studio 监视器

归档 `0wsgf7e09dh0-.js` 的 Ab（字符80449）定义一个俯视 / 返回3D卡、真实相机卡、单击选择、双击进入、定位和退出；ese 与 elF（字符1074302）包含可见性 / 尺寸观察和24fps。仅读取原脚本。

`monitor/model` / `cameras` / `capture` / `runtime` 与 React hook / view 分离。owner hook 在 runtime 建立后创建 monitor controller，并由既有主RAF在求值 / 主渲染后 tick。每帧最多处理两个可见卡片、500ms场景签名、活动机位24fps；没有第二个 renderer 或独立RAF。capture拥有单一RenderTarget / readback / Canvas，finally恢复 target / viewport / scissor / clear / XR / helpers；DPR正确换算，readback翻转后转display RGB，避免缩略图偏暗。隐藏 / 卸载释放独占资源，场景身份隔离旧帧。

实际导入4556B GLB，QA_Arc / QA_Truck两台真实相机，原Slide / Grow运动；三个真实JPEG缩略图自然尺寸430×242。单击选择仍在orbit，双击进入，退出回俯视，返回3D恢复旧视角，两个workspace均核对。播放后帧内容变化，暂停和收起 / 重开仍有真实几何；当前真实 App 标签无error / warn。早期QA播放标签保留过Maximum update depth日志，不据其宣称零日志；最后验收使用独立新标签。截图 `artifacts/studio-monitor-desktop-proof.jpg`。

仍缺移动 Inspector、部分PIP快捷键、角色专属动画、导入轨道编辑、子节点复制 / 删除 / 材质和视频编码。监视器通过不代表所有GPU环境或完整Studio验收。

## 当前版本无需登录

用户明确当前版本不考虑登录。App由 `services/workspace-access.ts` 注入稳定本地actor，不加载登录弹窗，也不读写旧libtv-user会话；原登录源码仅作历史实现保留。项目 / Canvas / Studio / 资产 / Skill 的现有本地功能直接可用，状态继续使用原本地存储协议。actor无token、uuid、团队或会员权益，MCP账号授权显示未接入，不展示账号同意操作。

真实App直接进入已保存Canvas和Studio项目，恢复分镜 / 图组 / 参考及两机位GLB；无需登录创建文本并立即刷新恢复。真实生成 / 支付 / 权益 / 账号接口没有因此获得能力。未来认证接入应替换根访问策略并接repository，在服务器校验授权；不能把本地actor当作账号凭证。

统一检查日志与确切统计见 [验证历史](./verification-history.md)，维护规则见 [AGENTS.md](../AGENTS.md)。
