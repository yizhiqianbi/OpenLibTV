# Canvas 元素标记受控视图：源码核对与实现范围

2026-10-12。本记录只覆盖新增 `generator/mark/` 的 Surface、ModeBar、Attachment 与局部 CSS；Root 维护 controller、节点、Viewport、输入接线和最终工程检查。原站脚本只静态读取，没有运行遥测、账号逻辑或生产写服务。原站认证与账号资源继续延期。

## 1. 服务返回与临时点位

[图片 renderer](./source/3u6hjewm8qox_.js) 字符偏移 **845899–849700** 的 tF / tU / tG 读取服务 suggestion 的 `label` 和 `bbox: {x,y,width,height}`。box 四值是内容框归一坐标，分别乘100作为 CSS 百分比。selectedSuggestionIndex 指定当前项；超出数组时展示第一项。多个候选才有下拉菜单，label 与每个候选均来自 response，不依据节点名称、图片文件名或点击位置猜对象。

该文件 **886500–888930** 真正调用 `markClickSuggest({id,image_base64,point:[relX,relY],lang})`；响应包含 `id` 与非空 `suggestions` 时，生成 `${response.id}_${pointIndex}` 稳定 ID，向 owner 保存 magicList 与 prompt token。服务、token 和插入/删除纯规则不属于这三个视图，见 [完整协议](./canvas-media-focus-mark-source-audit.md)。本机缺识别服务时，不提供任何假成功结果。

[临时 store](./source/38o6e4qs2-rnf.js) **40413–41730** 的点位字段为 `nodeId / relX / relY / index / selectedSuggestionIndex`，服务完成后补 `apiResponseId / suggestions`。index 从1单调增加。overlay 按当前图片 nodeId 过滤后传入；没有 apiResponseId 的 pending point 显示 spinner，locale-zh 的 analyzingStatus 精确为“分析中...”，没有猜测标签、框或菜单。loading 阻止新增点，源码没有因此阻止已有候选的选择/删除。

## 2. 受控接口与 DOM 所有权

- `CanvasMarkSurface` 为 forwardRef，props 为 `active / points / loading / zoom / disabled / ownerKey / onPoint(event) / onSelect(apiResponseId,index) / onDelete(apiResponseId)`。ref 指向绝对覆盖的真实内容框；其内部没有复制图片。Root 从相邻 media wrapper 获取 img，或注入只读 image reader。
- `CanvasMarkModeBar` props 为 `active / onReturnToTarget / onExit / disabled / top=12`。不建立全局 Escape listener，不拥有视口动画、模式切换或 graph 写入。
- `MarkAttachment` props 为 `available / active / disabled / onToggle`。没有 available 时完全隐藏；callback 接收触发按钮。按钮不持模式状态，也不 collapse expanded generator。

Surface 只展示当前 props 的点位；菜单打开状态属于 view，选中 index、删除与 pending 状态均不在 view 自行修改。Root 每轮模式提供不透明 ownerKey，并对回调的文档与 operation 身份做最终校验。视图观察器、计时器、RAF 和 child dismissal 随 owner、关闭和卸载清理；旧回调不重新测量新 owner。

React child layout effect 可能先于父 overlay 的 callback ref attach；label 初次定位从当前 label 的实际 `.cv-mark-surface` 祖先取得内容框，随后仍校验现存 ref 与 DOM 身份。这是本机生命周期适配，未把 DOM 数值写入 graph。

## 3. 框、点标签、反缩放与菜单

source **844760–845590** 的 tO 使用内容框 clientWidth / clientHeight 与外层 label offsetWidth / offsetHeight。普通标签先按点击点居中、放在上方8个局部 CSS 像素，再把 left / top 限到内容框范围；这里的8px是上方 gap，**不是容器8px内边距**。pending 状态改为点中心、gap0。内部 chrome 反 zoom，正常标签 origin 为 center bottom，pending 为 center。

保留 source 的外层局部尺寸算法与内层 inverse-scale 分层；不能将其说成自然图片像素或另除一遍 viewport zoom。source helper 本身只有 layout effect，本机另加 surface / label ResizeObserver 与 resize 单帧调度，使已有 label 在内容尺寸变化后重定位，卸载取消。

source box 为白80% 2px、radius2；正常 label z110，菜单展开时 z200；pending z100。label 是 #2a2a2a 的14px pill，Sparkles14、ChevronDown14。删除按钮24px，X12，默认隐藏，hover / menu-open 展示。本机补 focus-within 展示，确保键盘可到达。bbox 不参与命中，不改变原图或引用边。

候选菜单在 `relY > .6` 时向上，否则向下；边界等于.6向下。source 菜单最小120px、pY4、radius8、白10%边、#2a2a2a，当前项白字与8px白60%圆点。本机保该分支，不以自动上下翻转替代；窄屏另限 viewport 宽度与可用高度、支持纵向滚动，并将菜单水平平移到屏内8px。这是明确可达性适配。

## 4. 菜单键盘、焦点与叠层

source tU 使用局部 open、hover、150ms blur close。当前 view 保非modal菜单；外部 pointer 关闭时不抢焦点，外部 focus 用150ms close，选择后关闭并回当前 label。ArrowUp / ArrowDown 打开并进入实际候选，Home / End 与上下键移动；Escape 先关闭菜单、返回 label。

菜单注册 [已有 dialog-stack child dismissal](../src/services/dialog-stack.ts)，没有第二套 body overflow / inert / trap。真实父 Modal 内首个 Escape 只关闭该 child，保父弹窗与已有 scroll lock；第二次交给父层。standalone menu 通过 document capture 消费自己的 Escape，避免先退出 mark mode；上层 modal / composing / 已消费事件不被抢走。退出模式和保留已写 prompt / magicList 仍由 Root controller 负责。

## 5. 模式条、附件与非 IMAGE 范围

[模式条](./source/21_0xvlvkw1sz.js) **180087–180940** 使用共享蓝色 nf（**157806–160180**）：MousePointerClick16、标题“元素选择模式”、副标题“点击图片选择局部元素”、返回“返回节点”、X12。原尺寸为 p12、gap16、radius16、icon container32、返回 h32 / px12 / font13。Escape / return 调用模式退出与 clearAll，但已经写入 params 的 token / magicList 保留；view 不清用户输入。

[ActionButton](./source/3zez5ighjd7k4.js) **0–1230** 是 px8 / py4、gap2、radius-full、12px icon / 文案；mark glyph使用已归档 `/assets/icons/mark.svg`。普通 dark white-alpha5、hover10；inactive light 为 black-alpha5 / hover10 与 neutral700。active / disabled 走既有 canvas tokens。

[附件 caller](./source/42seoipo_5lv1.js) **6622–11380**：schema.properties.magic 为 true，并且非 onlyFineTune / 非 assetBoard，才提供 IMAGE mark；VIDEO 的已核对专属 caller 同样可为 owner。mark 不 collapse expanded frame。该资格由 caller/controller提供，不在 Attachment 重新判断类型。IMAGE owner自己的内容没有 focus self-placeholder 例外，Surface 不自造 self gate。

[source CSS](./source/0arvpunlk99j2.css) **2546–3700** 对非 IMAGE 加黑30% / blur4 / z50，禁其命中，`.mark-mode-toggle` z51 单独恢复；IMAGE 可点，handles / edges 禁命中。本机 CSS scope 为 `.cv-mark-mode-active`，shade 挂 feedback body，media content 禁命中，toggle 恢复；Root 按已核对 owner generator / afterContent 分区维护键盘 inert 与输入可操作范围。不能把此局部 CSS 声称为 source 全部后代选择器的逐字复制。

移动模式条采用本机 focus 批次已验证的可达性适配：<=600时 max-content 与屏内最大宽度，heading/copy可收缩、actions不收缩，标题保持单行、副标题可换行。桌面原 nf anchor、尺寸、蓝色与动作顺序保留。390/320规则通过受控视图/CSS检查，原生布局由 Root 独立验证。

## 6. 验证范围

定向测试使用受控**合成服务响应**与 jsdom 实际 DOM、几何夹具；没有运营识别请求，没有假任务或 generation 成功。覆盖 source bbox / index fallback / pending、真实 Surface ref、loading / disabled动作、严格菜单方向、内容框 resize clamp、A→B旧回调、StrictMode/卸载、真实共享 Modal 两层 Escape、standalone键盘及外部焦点、390/320 menu可达性、bar与附件source文案/CSS。

Node24 最终定向3文件 / 21测试通过，2026-10-12 18:51:16，耗时1.57秒，日志 `artifacts/canvas-mark-views-final-light-tests.log`；新6个 JSX 的零警告 ESLint 与7文件 Prettier check随后通过。此前 `canvas-mark-views-final-tests.log` 是补 light chip 前的20测试快照，不作为最新结果。最终全工程检查及原生浏览器验证由 Root 记录；构建通过不代表识别服务已接通，原站整体复刻目标仍未完成。

## 7. 真实画布接线与删除后的边界

独立 `generator/mark/NodeCanvas.mark-mode.integration.test.jsx` 使用真实 App/router 或合法接口注入的真实 NodeCanvas，未 mock Mark、输入、lazy generator、document/history/persistence 实现。只注入公开只读模型目录、jsdom几何 / 下载原语，以及明确合成的 reader / recognition adapter。默认 App 点图准确显示服务未连接，不写 token、metadata、边或画布存储；合法 adapter 用于验证协议，不代表运营识别已接通。

原14项覆盖 IMAGE / VIDEO真实入口、IMAGE owner自己结果可作为source、expanded frame不被mark collapse、Modal先Escape后mode、source payload与最后草稿、单次graph undo / redo / refresh、所有同ID prompt badge菜单与surface首次替换同步、点删除、20个occurrence门控、Quota仅重试保存，以及文档替换时迟到reader / response不能写新文档或解锁新operation。Space图片平移曾因 overlay 根 `.nopan` 被阻；按 Root 授权仅去该类、保 `.nodrag` 和按钮隔离，实际pointer测试验证view移动、节点不移动、尾click不启动识别。原视图21项与接线14项组合35项通过，19:04:33 /5.36秒，见 `artifacts/canvas-mark-actual-views-after-pan-tests.log`。

随后新增3项真实输入 / snapshot回归，保原14断言：

- 实际 keydown Backspace + 原生 beforeinput 删除末个 atomic magic badge，普通相邻空格保留，Core prompt确实删除、magicList清为undefined。当前本地输入 Ctrl+Z **只恢复原始 token 文本**；metadata已经prune，Core不能从token猜回识别结果，因此不恢复带label的badge。不能称完整badge undo；该边界由 Root 功能审计同时保留。
- 同一active mode的已确认临时点仍保服务返回候选。最后token与metadata被清后，菜单选择 / 删除只改变临时点，不复活metadata、不新建graph历史；随后一次Canvas undo对应先前真实识别事务。
- 150ms输入回调尚未执行时立即操作真实导出弹窗，原下载Blob中的snapshot已投影新draft并prune旧magic metadata，而画布存储当时仍为原prompt / metadata。再执行真实接口注入的mark graph事务，一次undo回投影后的draft基线，没有因导出多造历史。

当前定向集成文件17项通过，2026-10-12 19:51:59 /7.69秒，日志 `artifacts/canvas-mark-actual-backspace-draft-initial-tests.log`。这批仅新增测试及审计，无生产改动；最终全工程检查仍由 Root统一记录。
