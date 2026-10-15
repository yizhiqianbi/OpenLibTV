# LibTV public source inventory

Captured 2026-10-10 from https://www.liblib.tv/ using read-only HTTP. Raw HTML, original client chunks, CSS, icon/font metadata and public read responses are in `research/source/`. Public collection endpoints that use POST were queried only for list/detail reads; no login, generation, publishing, payment, analytics or data mutation endpoint was called. Sensitive-looking auth configuration fields found in a public bundle were redacted and are never used.

## Verified route families

| Route | Purpose and states | Evidence / access |
|---|---|---|
| `/` | Homepage: header promotion, expanding/collapsing sidebar, project creation composer, featured models, shortcuts, updates, masonry works, card previews and details | `source/index.html`, ~85 JS/CSS chunks; public |
| `/home_page` | Restricted experience homepage with only home/project/new canvas entries | `source/pages/home_page.html`, `0_0_6lpx16eyu.js`; public restricted shell |
| `/skill` | LibTV Agent skill catalogue; Skill/收藏/我的 tabs, category tabs, search, skill detail modal, use/edit/publish actions | `source/pages/skill.html`; public catalogue, favorites/mine/create actions login gated |
| `/skill?tab=mine` | User skill catalogue state | `0u4skljmyhqlo.js`; login needed for data |
| `/skill/create?skillUuid=…` | Skill creation or editing | `source/pages/skill__create.html`; login gated |
| `/skill/share?uuid=…` | Public skill sharing and detail surface | `source/pages/skill__share.html`, `2bym-dyxfkv4h.js`; public detail, use action login gated |
| `/3d-box` | 3D studio landing: carousel, scenario prompts, attachments, aspect ratio, reasoning model, generate, my studios, create blank studio | `source/pages/3d-box.html`, `068p_nmmjlsmm.js`; public landing, create/list need login |
| `/animation-preview` | Full screen 3D scene editor / animation monitor with orbit view, editing and director chat | `source/pages/animation-preview.html`; accepts project/space/share params; empty route shows project loading |
| `/project` | All projects, folders, search/sort, create folder, start creating, recycling, project menu open/rename/copy/move/delete | `source/pages/project.html`, `2ecd1eo6wusez.js`; shell public, content/action login gated |
| `/assets` | Asset library including images, videos, audio, characters/subjects, filters, tag/tree, asset detail/actions | `source/pages/assets.html`; user asset data login gated |
| `/blender` | Full screen Blender plugin landing and installation/download/tutorial entry | `source/pages/blender.html`, `0wua3vabah716.js`; public |
| `/plugin` | LibTV Plugin / CLI installation pages with OpenAI, Claude, Claude Code, OpenClaw, Hermes, CodeBuddy tabs; code copying; feature examples | `source/pages/plugin.html`, `02on94kzsh_2f.js`; public |
| `/academy` | AI masterclasses, learning plaza, text/image tutorials, highlights; course entries | `source/pages/academy.html`, `2tatq811u-irn.js`; public catalogue |
| `/academy/article/[articleUuid]` | Written tutorial article | link builder `2tatq811u-irn.js`; public API article list/detail |
| `/academy/tutorial/[tutorialUuid]` | Tutorial video player | link builder; read play API |
| `/academy/masterclass/[masterclassUuid]` | Masterclass video, reactions and comments | link builder; read play/comments APIs, writes not called |
| `/academy/course/[courseUuid]` | Course playback/TOC learning workspace | link builder; read TOC/clip API; entitlement may apply |
| `/academy/practice/[practiceUuid]` | Guided practical studio and completion state | link builder; authenticated practice/creation |
| `/academy/product/[skuCode]` | Course purchase introduction | link builder; checkout/purchase not called |
| `/show` | TV Show masonry work gallery, categories, card previews, search, detail/view process/copy canvas | `source/pages/show.html`, `1u99tf7a5a901.js`; public gallery |
| `/detail/[templateUuid]` | Full work detail: player, description, author, like, creation process, canvas copy, recommendations | `source/pages/detail__e0098a0a61f347a59aca05670f70318e.html`; public work detail |
| `/activity` | Challenge list (12 captured), status badges, cover and description | `source/pages/activity.html`, `0tgdbp1fkq3sg.js`; public |
| `/activity/[activityId]` | Challenge article, entry rules, registration, submissions/awards | route builder; public detail, registration/publishing gated |
| `/feature-updates` | Version history, date and version, feature media and use links, optimization list | `source/pages/feature-updates.html`; 2 versions / 16 features public |
| `/profile?uuid=…` | Public creator profile, follower/following stats, creations viewed/copied, background, authored works | `source/pages/profile.html`; creator profile public, self edit/follow gated |
| `/canvas?projectId=…&spaceId=…` | Full screen node canvas, project edit, media generation, scripts, workflows and agent | `source/pages/canvas.html`, `3kli4ad0zvwfg.js`; logged-out normal route redirects `/` |
| `/canvas?newProject=true&…` | Create canvas / copies from `sourceProjectUuid`, `sourceSpaceId` | source handlers; logged-out normal route redirects `/` |
| `/canvas/share?spaceId=…&projectId=…` | Public shared canvas read/view/copy | `source/pages/canvas__share.html`; CanvasAuthGuard exemption |
| `/canvas/chat-share?shareId=…` | Public shared agent session / creative case | `source/pages/canvas__chat-share.html`; CanvasAuthGuard exemption |
| `/canvas/import/blender` | Blender handoff into canvas | `source/pages/canvas__import__blender.html`; logged-out forces unclosable login |
| `/mcp/authorize` | Account authorization consent for Plugin/CLI connection | `source/pages/mcp__authorize.html`; incomplete URL shows 授权请求无效 |
| `/seedance-verify?taskId=…` | Seedance account/identity verification flow | `source/pages/seedance-verify.html`; auth/verification |
| `/forbidden?...` | Account restriction screen; missing restriction state redirects `/` | `source/pages/forbidden.html` fetch final `/` |
| `/developer` | Internal tools | redirects to Feishu login; no auth attempted |

The sidebar comes directly from `eI` in `2u6afxuhgddk7.js`: Agent section `/skill`, `/3d-box`; main section `/`, `/project`, `/assets`, expandable plugin submenu `/blender` and `/plugin`; community section `/academy`, `/show`, `/activity`; footer `/feature-updates`. The logo and profile menu include `/profile` and open membership/promotion overlays.

## Stale and external references

`/transaction`, `/calculation` and `/debug` appear in shared account/library code but actual direct HTTP requests returned 404. Their implementation should be treated as a compatibility choice, not a verified live LibTV page. `/connector_platform_oauth_redirect` is an OAuth callback string and returned 404 without parameters. Shared Liblib.art library navigation strings such as `/sd`, `/comfy`, `/ai-tool/*`, `/message`, `/search`, `/settings`, `/team-detail`, `/viphome`, `/uploadmodel`, `/pretrain` are not evidence of LibTV routes.

`/sitemap.xml` lists 604 URLs: homepage, `/explore`, `/community`, `/canvas`, 3 `/events/*`, and 597 `/detail/*`. The listed `/explore`, `/community` and `/events/*` returned 404 in the captured deployment; the detail route is live. Complete sitemap URL metadata is saved in `source/sitemap-urls.json`. `/en`, `/en/show`, `/en/skill`, `/en/academy` redirect to the unprefixed Chinese path in this deployment.

## Exact original CSS and component file map

Shared CSS: `1_fuveskb0t5i.css`, `3-33_hgcnhgo3.css`, `1h-b10gcvw4vl.css` (Tailwind, Mantine/shared styles), `129_y89ca9lu0.css` (all semantic color tokens). Exact dark body is `#161616`, float panel `#242424`, canvas `#1a1a1a`, foreground white, secondary white 60%, brand `#13d5ff`. Full extraction: `source/design-token-values.json`.

| Surface | Extra CSS | Main client components |
|---|---|---|
| Home/Skill | `06-cig9jeuden.css` | `0-px891fumwca.js`: SearchBar, ScrollableTabs, SkillList, composer; `2bym-dyxfkv4h.js`: SkillDetailBody; `3eow8r60k2kpc.js`: SkillDetailModal/publish |
| 3D-BOX | `06-cig9jeuden.css`, `3dnlipzpud27j.css` | `068p_nmmjlsmm.js` page, `3129aepde_uek.js` generation controls/composer, `2ucaxfr--gmbo.js` previews |
| TV Show | shared CSS | `1u99tf7a5a901.js` gallery/detail/process, `1b8bk4i5wmnfu.js` masonry |
| Project/Profile | `0f2shqexgq0gc.css` | project `2ecd1eo6wusez.js`, profile `02mv3nxiphg50.js` |
| Plugin | `3_hal-_czy618.css` | `02on94kzsh_2f.js` |
| Academy | shared CSS | `2tatq811u-irn.js`, `3rje847_pab-i.js` |
| Canvas | many editor-specific CSS (see route-fetches.json) | `3kli4ad0zvwfg.js` auth guard, `1g-ky4k21rf6g.js` workspace, `21_0xvlvkw1sz.js` collaboration, `19-1v5dt472t4.js` agent/chat |
| Login | `1_fuveskb0t5i.css` shared login classes | `3x8dozenk3emb.js` CnLoginModal/LoginHeroCarousel |

The original Inter font and `libtv.json` SVG icon dictionary are preserved. `route-fetches.json` and `route-fetches-hidden.json` map each route to every captured chunk URL. Raw scripts are research evidence, not application dependencies.

## Public API read catalogue

Primary TV host `https://api.liblib.tv`; cross-service library config/member host `https://api2.liblib.art`; passport host `https://passport.liblib.art`; media/static `https://libtv-res.liblib.art`, `https://liblibai-online.liblib.cloud`, `https://liblibai-web-static.liblib.cloud`.

| Read request | Inputs / response |
|---|---|
| POST `/api/community/project/template/feed/stream` | `{page,pageSize,tagId?,keyword?}`; work cards, cover/final output, author, template/project IDs |
| GET `/api/community/project/template/detail` | `projectTemplateUuid` (not `templateUuid`), optional `withRecommendList,isAudit`; work + snapshot data |
| POST `/api/community/skill/template/feed/stream` | `{page,pageSize,tagId?,keyword?}`; skill cards, examples and markdown metadata |
| GET `/api/community/skill/tag/list` | all skill categories |
| GET `/api/community/skill/template/detail` | `templateUuid`, optional `version`; skill detail |
| POST `/api/community/activity/list` | `{page,pageSize}`; 12 challenges and full article fields |
| POST `/api/community/activity/detail` | `{activityId}`; full article and activity settings |
| POST `/api/community/tag/list` | category/tag tree |
| POST `/api/community/activity/reward_project_template/list` | award works |
| POST `/api/feature-news/list` | `{page,pageSize}`; recent feature cards |
| POST `/api/feature-news/version/list` | `{page,pageSize}`; 2 version groups and 16 feature entries |
| GET `/api/course/v1/plaza` | public course list (captured empty list despite total 1) |
| GET `/api/course/v1/tutorials` | 9 tutorials; page/pageSize supported |
| GET `/api/course/v1/academy/articles` | 11 written tutorials |
| GET `/api/course/v1/masterclass/home-cards` | masterclass cards |
| GET `/api/course/v1/tutorials/[uuid]/play` | video playback detail |
| GET `/api/course/v1/academy/articles/[uuid]` | article body |
| GET `/api/course/v1/masterclass/[uuid]/play` | masterclass playback |
| GET `/api/course/v1/courses/[uuid]/toc` | course learning tree |
| GET `/api/canvas/project/template/detail` | `projectTemplateUuid`; canvas snapshot |
| GET `/api/canvas/project/share/detail` | shared project snapshot |
| GET `/api/studio/share/detail` | public studio snapshot |
| GET `api2 /api/www/landing-activities/getById?id=[id]` | remote config: data.linkUrl is a JSON string |
| GET `api2 /api/www/member/packages` | `packageType=TRAIN&sourceFrom=libtv` (membership catalog); `PRIORITY`, `V2_TRAIN` variants |
| GET `api2 /api/www/member/powers` | `packageType=TRAIN&sourceFrom=libtv` |
| GET `api2 /api/www/member/modelCards` | public model credits card catalogue |

Remote config snapshots in `source/api/config-[id].json`: `283` login slideshow; `318` 3D studio carousel/prompts; `325` header promotion (`enable:false` currently); `281` sidebar million-credit pack promotion; `206` support/sales QR; `240` CLI version 1.1.3 and official downloads; `302` homepage feature cards; `301` homepage model cards; `289`/`316` advertising landing page configurations. Config member host does not require authentication for these reads.

## Access and implementation boundary

`CanvasAuthGuard` exact client policy: `/canvas/share` and `/canvas/chat-share` are public; logged-out normal canvas replaces location with `/`; explicit agent flag or `/canvas/import/blender` opens login with close hidden. A copied public canvas still requires login to create/edit. Most public catalogue details remain available while signed out. All production mutations and authenticated user content are outside this read snapshot. Local frontend data should preserve labels and interactions but must accurately disclose unavailable generation/payment when invoked.
