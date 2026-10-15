# VIDEO 角色库、引用事务与弹窗交互验收

本批继续用户要求的节点交互优化，按真实 VIDEO 角色库入口补接公共目录与合规素材选择，同时修复引用变更、末次草稿及保存重试的冲突。内容采用运营 source；不继续全量采集、不登录、不使用原站账号、小号或写服务。仅本机源码更新，未部署；独立影游生产冻结版本不受本批发布影响。整个复刻目标保持未完成。

## 源码依据与权限范围

真实入口为归档 VIDEO 的角色 chip → rr → 公共 re／Seedance t4；不是 canvasCapture 的未消费 callback。入口、壳／分页／详情／三媒体选择／上传预检的字符偏移与 SHA 见 [视图审计](./canvas-role-library-view-source-audit.md)、[纯模型审计](./canvas-role-library-model-source-audit.md) 和 [接线复核](./canvas-role-library-integration-audit.md)。偏移是 JavaScript 字符位置，不能写成字节或源码行号。

角色入口按图片剩余容量、extraConfig、restricted／digitalHuman及当前文档能力门控；Seedance tab 由 portrait 或 star-video2 vendor 决定，autoCompliance 只影响后续审核路径。ao／ac／au 为各自剩余容量，不能统一成常量。Public 最后选入图片，Seedance 分别返回 image／video／audio URI；主体 rb 的 subjectList 是另一协议。

Root仅做一次匿名目录读操作：2026-10-12 13:58:15.665Z–13:58:16.951Z，POST list，page1／pageSize3／updated_at_desc，无 Cookie、token。HTTP200但 code10001“用户未授权”，见 [匿名读取证据](../artifacts/canvas-role-library-anonymous-read-proof.json)。没有正向角色样本，不重试账号权限，不把 UI 名称“公共”解释为匿名授权。其余 create／check／upload／delete／sign／QR 原站写接口均未调用。

## 模块与运营边界

`services/canvas-role-library.ts` 提供 strict typed、可取消的 listCharacters／getCharacterDetail／listAssets／certifyImages／uploadAsset／createAsset／removeAsset。reader和writer capability独立，默认全部 unavailable，错误不转假空库；合法空媒体 detail 保持合法。服务不引用 UI、Canvas store或账号 token。唯一偏好通过统一存储边界保存原 tab key，不保存资产授权或认证。

`generator/roles/` 分离纯容量／证书／预检模型、纯图计划、owner controller、请求 hook、视图及媒体 DOM reader。真实 generic generator 继续按需分包，角色 CSS 在现有 eager 入口登记，旧 CSS 相对级联保持。界面使用 shared dialog-stack；Root传入文档／目标／source opaque owner，不建立第二套滚动锁或背景隔离。

Public保留10／20／50分页、详情首次URL去重、容量／清选／确认、全屏原URL预览。Seedance保留真人／图片／视频／音频四tab、每种15／20／30页规格与选择、审核／拒绝／过期状态、可注入上传／删除／IMAGE重核。当前 flat listAssets 由 view 筛选／分页并轮询 pending，是运营 adapter 映射，不能称原 page/check HTTP协议完全相同。FileReader／DOM metadata只证明本机读得真实规格，不表示服务器上传或审核成功。

IMAGE30MiB、300..6000和严格比例(0.4,2.5)；VIDEO50MiB、2..30秒、300..6000、闭比例[0.4,2.5]且像素积至少409600；AUDIO15MiB、2..15秒。未知 metadata、读取失败和取消不会假成功。证书60天时效以实际 matching URL 的 checkedAt／非placeholder createdAt判断，不造当前审核时间。

## 图事务、草稿与保存重试

`useCanvasRoleLibrary` 捕获 doc／node／source owner，异步自然尺寸后重读最新图、schema／能力和提示词。实际 record 解析 asset URI，拒绝缺URL的记录；不猜CDN。只为新增图片探测自然尺寸；源 IMAGE／VIDEO／AUDIO 管理判据不同，VIDEO in-place不等同可删除库引用。

纯计划只删除对应首条 direct edge并保留源节点，普通引用保持；新增真实资源与普通边，按源布局／避碰／列表顺序推断模式并重映射引用 token。公共 raw URL 的 portraitCompliantExempt 是原 caller 前端分类字段，不是本机签发审核结果。两真实 collector 共用 `roleMediaReferenceMetadata`，保 IMAGE／VIDEO／AUDIO 不同证书优先级与 nullish／truthy语义，AUDIO不增exempt或审核时间。

一次 expected raw CAS／history提交图，再 flush 实际接受图；Quota失败保图、选择与ID，只保存重试。Public认证结果在同 selection／source／owner 下形成 canonical payload，失败重交同一对象，不再认证、自然尺寸读取或建图；选择变化／关闭／换owner退休缓存。partial成功项只在合法／未过期且同owner时复用，force传给真实writer。

本批确认并修复两个草稿冲突：删除角色后next prompt恰好等于旧raw baseline时，普通draft projection会复活刚删的token；最新150ms输入已删Magic时，直接写prompt会保留孤立magicList。现在 GraphActions 的 `explicitPromptNodeIds` 仅对next图跳过目标普通draft，前图仍投影最新草稿，script channel与其他节点不受影响；controller先用公共 `patchCanvasMagicPrompt` 正规化目标。CAS成功后prompt controller `acceptCommittedValue` 消费被接受文本并取消旧timer，不发第二次onChange/history；CAS失败不消费草稿。撤销可恢复最新前图，pagehide／迟到timer不能复活删掉的引用。

## 工程与实际App回归

Root source专项12项、实际draft／prompt／GraphActions联合5文件36项通过。纯模型新增68项，联合6文件118项；独立真实 collector30项、真实hook23项通过。App专项真实挂载 NodeCanvas／lazy generator／graph／history／autosave，初批10项通过；source响应是测试fixture，未mock上述画布实现，也不代表原站账号或服务通过。

App覆盖公共选择建图、自然尺寸、一次undo／redo／remount、取消引用只删边、Quota重交保ID／历史、切文档迟到probe、Escape／readonly／缺模型、150ms删除token冲突、Magic清理和合规后Quota不重复writer。首次9个fixture失败为等待lazy loading shell，第二次4个为正确背景inert后的查询／默认Seedance页签；修正真实控件等待与测试操作，未减原强断言。纯模型首个模式fixture失败及视图fireEvent缺focus失败保留各作者审计。

初轮正式官方Node24.19.0 `npm run check` exit0，370文件／4983测试，23:07:56／109.29s、build10.65s，格式／零警告lint／架构／核心strict通过。日志 [click隔离前检查](../artifacts/canvas-role-library-before-click-isolation-check.log)，对应1122源码快照。随后原生发现新的portal click缺陷，因此本轮最终验收必须以修复后新冻结与完整检查为准，不能据初轮成功称当前通过。

## 原生浏览器与后续检查

Root在后台新tab4通过实际界面创建VIDEO，默认StarVideo2.0，打开真实角色库。1280×720、390×844、320×740页签切换、默认unavailable状态、12次Tab循环与Escape回角色触发器已观察；390／320 shell分别358.796875／294.3984375px，无document或dialog横溢。没有注入source、图或原生事件，也未操作用户tab2的3D页面。正向目录／审核／自然尺寸建图只由上述受控App覆盖，不能称native服务通过。

初次mask native失败：桌面点击弹窗外[20,100]后背景VIDEO失选、inline卸载、dialog0。pointer／mousedown／dblclick隔离未覆盖React portal click及祖先pointer capture；证据 [初轮原生记录](../artifacts/canvas-role-library-native-initial-proof.json)保留。只加click stop后冷reload仍native失选，独立失败证据canvas-role-library-native-click-only-failure.json保留。实际祖先CanvasViewport的onPointerDownCapture先于根bubble调用begin，plain mask不匹配isolatedSurface，先清选择；3个portal根加入现有nopan标记，使共享Pointer在capture入口识别隔离，不修改共享手势规则。hit-test确认命中overlay且pointerEvents auto、无expanded父层，不归咎CSS或inert。

冒泡专项先3fail／30pass，补click后33pass；capture专项先3fail／33pass，补nopan后36pass（23:35:33／1.50s），旧断言与真实board press正对照保持，日志与4文件SHA在 [portal修复证据](../artifacts/canvas-role-library-portal-fix-proof.json)。ActualApp第11项使用userEvent完整pointer click，保dialog／selected／inline同DOM／chip及graph／storage／view，再Escape回原chip，避免click-only夹具漏祖先capture。

原生另发现Space被Canvas全局平移快捷键preventDefault，角色chip不能默认激活；失败证据canvas-role-library-native-space-before-fix.json。仅该入口的Space keydown stopPropagation、保默认，不扩大sharedKeyboard规则。新增实际App第12项同完整键盘生命周期验证，2026-10-13 00:40:45联合3文件65项通过（3.88s），真实日志 [collector／hook／App最终专项](../artifacts/canvas-role-library-review-app-keyboard-tests.log)。此前12项以前的console结果没有历史raw log，独立作者审计明确区分，未伪造输出。

修后Root原生1280／390／320点击mask均保selected／inline／dialog；Escape回角色chip并解除inert；Space正常打开。窄屏宽度同上述实际值且无横溢。两份GUI导出的整份文档deepEqual，文件SHA逐字相同；nodes／edges／view亦逐项相同，冷加载warn／error为空。准确结果见 [最终原生证据](../artifacts/canvas-role-library-native-final-proof.json)，截图为native-final-desktop／390／320／canvas。当前原生source仍default unavailable，没有正向账号／运营服务、真人、历史图库或主体服务验收。

最终展示截图另用真实抓手手动平移视口y−250，让现有输入／按钮完整可见；第三份GUI导出保nodes／edges和其余字段，只view.y195→−55，x245／zoom1不变。presentation字段与native-presented.libtv单独记录，不把展示平移混入角色浏览的整文档不变结论，也不当作自动竖向定位已经实现。

## 明确剩余

真人VisualRecord目录／group／rename／sign／QR／验证及完整授权前端契约尚缺；历史图库selector仍未接，createAsset方法存在不代表其流程完成。VIDEO／AUDIO重新审核writer未知；主体rb modal／shared limits及团队权限需另接。默认运营 reader／writer、真实生成／费用／服务保存仍未连接。原glyph／new-feature提示并未逐像素核对，普通inline竖向自动翻转仍未实现；手机UA／Safari／触控／高频修饰拖动／大图手感没有新增通过声明。无需用户登录或提供小号，这些边界不能据测试fixture或构建成功标成完成。

## 最终完整检查（2026-10-13）

新冻结1122源／config／tests后，官方Node24.19.0正式npm run check全部通过，370文件／4991项，00:42:01开始／110.51s，format／零警告lint／架构边界／核心strict与build11.11s，exec33738实际terminal exit0。日志artifacts/canvas-role-library-final-check.log；严格TS仍非全部JSX，CI未远端执行，DEP0129提示保留。最终SHA／实际dist／generic真实按需与旧22CSS相对级联证据见 [最终build proof](../artifacts/canvas-role-library-final-build-proof.json)，阈值900000未提高，新增角色CSS使用独立域前缀。

当前统计包括同期Studio及独立影游，较历史360／4803新增角色批次10测试文件／188项，不能把4991归为角色专项。初轮23:07:56／370／4983的冻结日志、snapshot与build保留before-click-isolation固定路径；之后6源路径含actual tests／generic入口／3portal view及view tests发生已验证修复，最终重新检查而非延续旧成功。随后仅维护文档，并另做定向format与代码SHA复核；本机未部署，角色／全站目标未完成。

最终独立build proof为passed／finalFrozenProof true，1122／1122代码SHA一致。实际Canvas691380B／gzip229698，Generic64233B／gzip22283；Generic、Script、Mark与ScriptGenerator均不在37模块Canvas静态闭包，保持实际dynamic import。角色CSS增14769B，移除新增段后旧192511B CSS逐字相等；旧22份CSS与entry的源码SHA／相对顺序保持，900000阈值未变，无manualChunks。Root文档后的独立源码／九文档SHA与格式证据见 [维护后复核](../artifacts/canvas-role-library-post-doc-proof.json)。
