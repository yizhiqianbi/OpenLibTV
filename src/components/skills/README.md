# 共享 Skill 选择界面

这里保存紧凑选择器、完整列表、详情、案例媒体、创建菜单和公共卡片。它们通过 props 接收目录、收藏、权限、状态与回调，不导入 `features/skills/`、Canvas 或运营写服务。

- `SkillPicker` 管理搜索与弹出位置，选择/详情/创建由调用方处理。
- `SkillLibraryModal` 与 `SkillDetailModal` 复用公共 Modal 的叠层焦点、Escape 和滚动锁。
- `PublicSkillCard` 通过 `status` / `actions` 插槽扩展；Mine 的权限菜单留在 Skills 域包装组件，避免共享卡片依赖私有业务。
- 目录、过滤、收藏 ID、公开内容和案例链接的纯规则位于 `services/skill-presentation.js`；创作引用使用 `services/agent-handoff.js`。

原 Skills 组件路径只转出这里的实现，保留现有调用和测试兼容。新调用直接引用共享路径。`selector.css` 包含新选择器的命名空间规则；公共卡片和详情仍使用应用主样式的既有级联，尚未转为独立 CSS Modules。不要通过懒加载顺序重排主样式。

编辑器状态和 URL 消费属于 `features/skills/hooks/useSkillComposer.js`；输入视图属于 `SkillComposer.jsx`。结构迁移不能重建正在编辑的输入、丢弃引用，或将服务失败视为成功。
