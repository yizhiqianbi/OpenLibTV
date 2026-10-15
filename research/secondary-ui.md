# Secondary UI research and implementation

Observed 2026-10-10 (Asia/Shanghai). The initial background IAB tab used a 1280 × 720 viewport. Root separately observed shared chrome at 1440 × 900. All original-site actions were read-only navigation, tab selection, and opening/closing login dialogs; no sign-in, forms, downloads, or original account mutations were performed by this agent.

## Shared chrome in observations

60 px fixed/sticky promotion strip above a 240 px sidebar, 64 px main header. Sidebar and card content use dark surfaces, thin borders, white type, cyan action accents. At 1280 px, secondary content gutters are 40 px. The heading/title frame on each page begins below y=124. Academy header shows only the login button, whereas activity and version log show credit supermarket, membership promotion and login. Original `research/source/pages/*.html` and four shared CSS chunks establish responsive boundaries.

## /academy

Title uses an actual SVG path artwork (`public/assets/academy-title.svg` extracted from original SSR). At 1280 × 720, title artwork centered near y=164, width 777 px, intrinsic height 79 px. It reads “LibTV 学院” and “系统掌握 AI 创作 从新手进阶创作高手”. Behind it is a dark, low-contrast grid artwork fading into the page. Learning content max width 1120 px.

AI 大师公开课 heading appears at x=280, y=329; masterclass media x=280, y=367, 480 × 228 px. Card is a rounded 16 px combined media and copy panel, with a 32 px circular lecturer avatar. Copy lines are actual API text; see secondary.json. Learning square starts at y≈675; title 20 px / 28 px semibold, 80 px section spacing.

图文教程 selected by default. Selecting 亮点功能 replaces eleven article cards with nine video tutorial cards and scrolls the page to the learning section (original scroll bar Value 377 after this action at 1280×720). Grid has four equal columns, 20 px gaps; cards have 246:138 image ratios, rounded 16 px covers, title and two-line muted summary. Exact list:11 article items,9 tutorial items from public API.

Clicking “深度动作捕捉” tutorial or “「基础功能」画布与节点” article while unauthenticated opens a login dialog and leaves URL at /academy. No external tab is opened. Escape did not dismiss this original login dialog in the observed state; its top-right close icon did. The login modal had a large left promotional video pane, right QR pane, phone login, team email login, QQ login (the QQ button was visible even when AX omitted it). Root owns this shared modal in the recreation.

## /activity

At 1280 ×720, heading controls at x≈292,y=140; thumbnail grid begins x=280,y=172. Header has a 返回 action and separator before 挑战赛. Grid:3 columns,16 px horizontal gaps; thumbnails 16:9,12 px radius, thin border; 32 px row gaps. First thumbnail width≈309 px,height174 px. Below each thumbnail is the title in 13 px /22 px medium type, horizontal8 px padding, maximum2lines.

Each thumbnail has a top-left status pill (black translucent backdrop, gift icon for 已颁奖; cyan-green circled check for 进行中; text only for 评审中), and an amber reward description with gift icon anchored12px from left/bottom. Text truncates to one line. Cover scales to1.02 on hover per original DOM class. There are12 actual entries ending “没有更多了”. Status mapping evidenced by cards and source:2进行中,3评审中,4已颁奖.

Clicking LibTV x 王者荣耀｜王者无界剧场计划 when unauthenticated opens the same login dialog; URL remains /activity and no external tab appears.

## /feature-updates

First navigation returns skeletons, then full content. Outer content max1160 px. At1280×720 heading appears x=320,y≈139,20px/28px medium. First version metadata at x=320,y=210; version pill v1.5, date2026年9月20日. Column width198px,gap40px. Feature right column at x=560,max600px; first main title at y216, video at y271,598×335.5px,aspect235:132.1875,16px radius,thin border. Copy is below the media with24px gap. Feature name16px/24px medium,description14px/22px muted and literal line breaks,white去体验 button36px high with diagonal arrow.

Two versions:1.5 (2026-09-20,5features) and1.0 (2026-09-11,11features),plus5exact optimization bullets in1.5. First five1.5media are looping WEBM video,three1.0media are PNG screenshots,remaining videos. All names/descriptions/actions preserved in public versions/secondary JSON.

Opening first去体验 (剧本原创与改编) shows login without changing route. Blender and3D-BOX targets are actual source link URLs. An automatic return-special promotion modal appeared after a delay while on the update page. It was a623px wide image modal with close button at top-right, asset `banner/libtv-return-special-20261009-compressed.webp`, centered around x328,y146 at1280×720. Root implements shared promotion state.

## /blender

Observed first fold is a separate fixed fullscreen landing, with no promotion strip/sidebar/main toolbar. Exact original stylesheet `0tmwl7c9km9aq.css` and component `0wua3vabah716.js`. Background radial/linear gradient from#090a0d into#28303a and#4b5159. Header50px,top/side padding7px16px; logo59.3×12px,leftx16; navigation top-right11px text includes 安装指南 and 体验LibTV3D导演台 with diagonal arrow.

Hero copy initially centered at y198.405px:419×91px title bitmap cropped in source into brand/headline layers; support line16px/22px,28px separation; white CTA232×48px,12px radius,28px margin. First screenshot at1280×720 showed title near y92,subtitley212,CTAy259.

Preview frame at bottom94.53vh,centered,translated up100.3%; width clamp340px,86.44vh,100vw-40px; aspect728.13/418.41,padding1.4%1.37%; frame around x329,y322,width622,height357 at720pxheight. Uses original robot white-model demo `/director/libtv-blender.webm` with original `hero-preview-poster.webp`. Original source uses WebGL scene/animated connector and video textures on supported browsers,DOM video fallback on Safari. Recreation currently uses DOM video/poster; WebGL depth/parallax remains a fidelity gap.

Actual install guide: https://resonate.feishu.cn/wiki/GwRpwYzGSiESYtkLPBEcvQ4knHd
Director tutorial: /canvas/share?spaceId=4262763&projectId=91172e0005a5499283324d6ba11ef072&isTutorial=true
Version0.1.26 archive naming from source: `https://libtv-res.liblib.art/director-blender/libtv-blender-macos-zh-0.1.26.zip`,windows-x64 equivalent. Platform auto-detection and unsupported-platform fallback established by source; no archives were installed or run.

## /plugin

Browser was no longer available to this subagent after interruption; this section is reconstructed from saved original SSR DOM and original component/CSS, not a verified screenshot.

Source page `pages/plugin.html`,main component `0n8oo5osr4oue.js`,assets `02on94kzsh_2f.js`,layout `3_hal-_czy618.css`. Hero icon stack uses six actual Agent icon images around central LibTV icon; width344px,height96px,top48px,gap64px,side icon widths36/52/68px with blur1.5/.75/0. Hover expandswidth350px/gap70px,unblurs stack,and expands center96→98px. Intro headline “LibTV Plugin，让你的 Agent 开始创作”,exact guide link and supporting text.

Installation panel:28pxouterradius,4pxsidepadding,8pxtoppadding; agent selector icons in52×40pxpillbuttons, six optionsOpenAI/Claude/Claude Code/OpenClaw/Hermes/CodeBuddy. DefaultOpenAI. Integration/CLI segmentedcontrol right-side,86×40px pills. SelectingOpenAI choosesPlugin;otherAgent choosesMCP. CLI override choosesCLIfor allAgents. Prompt step title uses genericAgent exceptOpenClaw/Hermes/CodeBuddy. Exact prompt strings from original locale JSON preserved,copyclipboard gives check mark for2seconds. Inner instructions panel24pxradius,16pxpadding;2columns separated bythinverticalrule. Prompt text region120px tall with scrolling,36pxcopycontrol top-right.

Showcase uses three tabs全模型调用生成/多资产管理提案/可控多场景生成; conversation/resultlayout3:2,6pxgap,24pxradii. Source has scroll-linked sticky stages with animated step reveal; recreation currently supports tab switching, replay, copied prompts, original videos, narration and original presentation pages. Exact31pageassets (NO HOT WATER15pages,Star-Slayer16pages). Scroll-linked sequence/reveal timing still needs visual comparison and refinement.

## /calculation

Original /calculation returnedHTTP404 in source route fetch. Sidebar account menu links mention this route, but no original page was verified. Recreation displays the Next-style404state for the confirmed public route. It must not invent an account credits view without further evidence.

## Current implementation and verification

`src/pages/SecondaryPages.jsx` and `src/pages/secondary.css` implement the secondary route family and use `public/data/secondary.json` created from exact public snapshots. Localized source media from asset agent are preferred; root supplies the sharedassetresolver. JSX transform passed with bundled esbuild. Root app integration and desktop/mobile browser visual comparisons remain pending. Dynamic article/tutorial/masterclass/activity content and endpoint data are present; exact detail templates are being investigated.
