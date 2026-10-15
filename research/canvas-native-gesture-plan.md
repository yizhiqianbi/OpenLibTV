# 独立原生 Canvas 手势验收计划

2026-10-12。本文只通过静态源码、当前真实App tests和现有公开素材准备流程，**尚未执行浏览器验收**。Root独占Cua；本文作者不打开浏览器、不注入图、不读写localStorage、不改生产、既有tests或用户项目。只新增此计划及 `artifacts/canvas-gesture-samples.json`，没有新HTTP数据页/counter或framework。

## 1. 独立入口与可直接上传的原图

只使用 `http://localhost:5173/canvas?projectId=canvas-native-gesture-20261012`。该ID在当前准备中未被写入；没有templateUuid/sourceProjectUuid，实际persistence无同key文档时返回空图，创建与保存由真实UI发生。如果Root打开后发现该ID已有内容，先记录且不删除、不seed覆盖；使用本次既有验收项目接着做，或由Root决定独立后缀。

公开样本均已存在，直接用原生文件选择器上传：

| 样本              | 绝对文件路径                                                               | 实际大小/尺寸          |
| ----------------- | -------------------------------------------------------------------------- | ---------------------- |
| 首页导演执导原PNG | `/Users/pencil/Documents/ChatGPT/LibTV/public/assets/6393c4e4ac8886bc.png` | 245996 bytes，1280×720 |
| 首页创意片头原PNG | `/Users/pencil/Documents/ChatGPT/LibTV/public/assets/b8d35ea43ec7260a.png` | 279681 bytes，1280×720 |

两文件为research/assets.json与asset-map中的原URL映射，remote-configs/home有对应公开首页卡；home实际采用同stem WebP衍生图。用原PNG验证image/png真实文件读取，无需账号库、远程上传或进一步下载。路径、sourceURL与SHA在JSON中。不选最小的联系二维码，也不生成1px夹具冒充真实native素材。

## 2. 最短创建路线：UI产生所有节点

桌面建议1280×720或1440×900，先记实际board区域；步骤坐标以当前节点rect为准，不把测试fixture坐标套进native。确认项目加载完成再操作。右侧Agent妨碍工作区时可点aria“关闭 Agent”收起，属于现有UI。

1. 空白处双击 → “添加节点”菜单 → “文本”。在自动打开的节点设置中，名称输入 `原生手势文本`，提示词或节点textarea输入 `原生拖动与撤销验收`；点aria“关闭节点设置”。也可使用左栏title“文本节点”，但双击指定空白位置更便于安排节点。
2. 左栏title“上传素材” → 原生文件chooser一次选择上述两PNG。等待真实文件读取完成、画布出现两张原图。节点原默认名称是文件名；本地URL由FileReader产生dataURL，不能把“生成服务成功”当验收结果。
3. 如默认上传(50,50)/(420,50)重叠其他节点，从**节点标题或图片主体**拖到分离位置；文本不要从textarea起拖，图片不要从生成器浮层或连接加号起拖。
4. 空白处双击 → 菜单“脚本”，产生v2 Script350×350。不要点预设按钮生成替代图，保它为空卡。点击脚本卡/标题选中，等待真实dynamic import的专用生成器；成功时有“添加参考图”、专用模型和提示词，不以loading占位当ready。

四个节点（一个文本、两张上传image resource、一个v2 script）已经足够后续自然拖动、复制、连接及参考模式。没有普通group的独立“添加”菜单；普通group必须从真实多选工具条创建。

## 3. 单节点拖动、click/doubleClick与一次历史

记录文本/图片的屏幕rect和原位置观感。按下标题或图片主体，先移动小于4px再松：应保持位置、没有新拖动撤销项，普通click应可選中；文本标题真实双击仍可打开节点设置，关闭后焦点不应落入错误add菜单。

随后从同一可拖面起拖约60px×40px，最后up再前进一小段：最终节点位置应包含up末位，鼠标沿线平稳，无按下跳位，尾部click不额外打开Inspector或改变选区。立刻点title“撤销 ⌘Z”回拖前位置，再“重做 ⇧⌘Z”回最后位置；此处只验一个手势一项历史（前面的创建历史已存在，不能要求undo按钮整体disabled）。不要用多个mouseup或mockpointercapture伪造native。

验证后等待顶部“已保存”，刷新仍保文字、两张原图和实际最后位置。刷新会清当前session history，宜在本段undo/redo完成后再做，不能把刷新后历史丢失误报为drag事务失败。

## 4. Shift多选与虚拟frame

单击第一张图片可拖区域，按住Shift再单击第二张图片标题/主体，释放Shift。应两图同时选中，出现虚拟选区frame及多选工具条，工具条不是共享generic生成器。不要Shift点浮层按钮。

从虚拟frame空白填充或边缘拖约40px：两节点同步平移，相对距离保留，拖动后frame仍围住实际选区；尾click不缩成单选。撤销一次回两个原位置，重做一次恢复。可在两图与边线可见的情况下重复，检查选区入口不因source集合变化使用旧组身份。

Alt复制选择框：先按Alt，再从frame开始拖（虚拟frame修饰键在down固定）。复制两图、原件不动、up位置最终生效，原版只一项历史。Alt+Meta或Alt+Ctrl的copyEdges分支先有内部边才可验；无内部边时不能仅凭图数宣称边已复制。

## 5. 普通组：真实group壳、拖动与复制

重新Shift选两张原图 → “分组菜单”（文字“打组”） → aria“分组”的menuitem“打组”。应创建普通壳名“分组”、选择组，两个孩子保原world位置/图片内容；不要选择“合并分镜组”，它是另一种standalone协议。

从普通组外部标题起拖约40px×30px，应壳和两个孩子一起移动，组内相对位置不漂移。撤销/重做各一次只改变本手势。标题普通non-editing仍可拖；标题编辑input态才禁止拖。

Alt拖组同样先确认原组已选，在首次超过4pxmove携Alt：应复制新组及两个孩子，原组与原图完整，所有childparent关联新组。撤销一次删除整个副本；重做恢复完整副本。普通node/真实group Alt和Meta/Control在首次越阈值取值，之后松开不得把副本变回原件拖动。

如果需要保留后续root资源用于参考模式，可把组复制测试撤销后再按General工具条“解组”或恢复创建组前状态；不要调用内部ungroup函数。组创建/解组是各自用户动作，验收记录须区分其历史与drag历史。

## 6. Space pan与边缘auto-pan

点画布空白把编辑器焦点移出textbox/textarea。按住Space，从节点表面或空白拖动：应平移相机而不移动节点world位置、不建立node移动history；松Space后再次普通拖动恢复正常。也可选“抓手 H”复验同一关系，但不要从浮动generator内部起pan。

普通node起拖进入board边缘40screen px范围停住：相机应按源每RAF、最高15px/帧移动，节点在指针附近不持续漂离。移动回中心停止pan；up最终位置应稳定，undo/redo一次，刷新仍保节点和view。虚拟frame用另80screen/720px每秒协议，不用普通node速度作其验收阈值；无需人工精算FPS，只记录可见offset稳定、edge持续与中心停止。

拖动期间Escape/切window焦点应退休手势，不让迟到up写图；不直接清storage模拟doc变化。若sourceview正在HMR重载，暂停native测试直到Root确认production冻结，否则undo基线不可靠。

## 7. 连线、空白释放菜单与Alt带边副本

先保两张图或文本+图为独立root，创建一个空“视频”节点作为合法下游；点击图片选中后等待genericInline真实加载。将其右侧title“连接节点”的加号拖到下游左侧title“连接到此节点”或合法body，出现真实边线；up后边保留、一次undo撤该边、redo恢复。source依action兼容和schema判资格，非法方向不可强行连。

单source加号短按有节点类型菜单；拖到空白松手也应开菜单。多选或普通组右侧aria“拖拽连线或点击选择节点类型”入口，短按或空白释放应有六项 `文本生成 / 图片生成 / 视频生成 / 视频 / 音频 / 脚本生成`。此阶段先Escape关闭，焦点应回当前确切入口，尤其空白释放后的group入口需要重新mount回焦点，不可停BODY。再开一次选“视频生成”，应一个下游/两条真实边，来源原件不改；服务未接，不点真实生成。

要验证Alt+Meta/Control带边copy，选择刚连好的两个独立节点（边两端都选）→从virtualframe按Alt+Meta起拖。副本之间内部边正确重映射，原边保留；只按Alt的同样动作不复制边。单节点Alt+Meta分支复制incoming上游边，不会复制下游所有边，不能混淆两种合同。可只验其一并明确本轮覆盖范围。

## 8. 专用脚本参考模式：IMAGE-only、持续拾取、box、退出

选中空脚本，等待专用生成器ready → “添加参考图” → menu“添加参考图方式”中的“在当前画布中添加参考”。进入region“参考选择”，标题“从画布或资产管理选择参考”。进入模式应保持此前选区；target Script generator因explicittarget仍可见，不因source变选而失去widget。

- 合法image mask为可选，文本/非法source有阻断mask。选一张图后出现连接/connectedmask；再次点connected图片主体应 **no-op**，不是toggle。只点“取消选择”按钮才断该输入边，源图片不删。
- 快速连续点两张合法图，等待RAF：两条边保留，选区按sourceselectionchanges退休来源而保target；两次click是两项history。ordinarygroup点击只连接其合法image叶子，非image跳过且不改孩子位置。
- 从board空白拖box：x/y均<=5px是no-op；超过门槛，严格相交的合法images成一个batch，一次history，不移动原件。target不是候选。框选后保持targetgenerator。
- Escape仅退出mode、不清当前scriptselection、不造history；或点aria“退出参考选择”。“返回节点”会400ms fit相机再退出，此分支不适合当“view不变”验收。
- mode内拖imagemask/body不应启普通node移位，Enter/Space能触发可选mask且不arm画布pan；所有其他node内容不可编辑。专用prompt仍可正常输入，并在接边时同次保存最后草稿。

退出后撤销/重做最新连接或box事务一次，确认原图完整，当前引用和scene仍匹配；等待“已保存”刷新，图片边和输入文字恢复。刷新后再进入同mode检验connected状态；不能seed一个假边验证刷新。

需要额外验nativefilechooser时，用脚本“添加参考图”→“本地上传”选择第二PNG，等待一个resource+source/target handles边、仍选target，普通图原位置不动；全部只是本机读取保存，不冒充服务器上传/审核。

## 9. 记录与完成门槛

每段记录操作前/后截图、真实节点与边数量、可见选区、触发器焦点、最后位置/保存反馈；数据由真实UI产生。没有完成或failed步骤保原图，不把构建通过/测试夹具当native已验。最终桌面全部必要动作后，再390px只复验菜单可达、动态generator、referenceBar/退出和一组简短drag+refresh；窄屏不强要求同时把所有节点放进screen。

如发现任何坐标、capture、焦点或尾click问题，Root先停该具体路径，保实际证据并修生产，再从同一独立项目复验。禁止为了完成截图创建新data route、HTTPcounter、隐藏自动seed、触发器无真实动作或模拟生成成功。本计划不涉及登录/账号库/付款/原站写入。

证据：当前NodeCanvas.interaction、multi-connection、script-generator/reference实际integrationtests只用于指出可验证合同；本轮未重跑tests。代码：CanvasViewport的真实add/upload、CanvasSelectionToolbar group menu、CanvasConnectionHandle/menu、CanvasReferencePickBar/Mask、useCanvasKeyboard/referenceowner、domain/uploads/persistence；sourcefidelity阈值见既有pointer/source审计。Prepared不等于native验收完成。
