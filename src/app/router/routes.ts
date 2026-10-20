export type LayoutKind = 'shell' | 'standalone' | 'chrome';

export interface RouteDefinition {
  id: string;
  pattern: RegExp;
  layout: LayoutKind;
  title: string;
}

// Route matching is independent of React and of the page implementation.
// The corresponding lazy imports live in RouteOutlet.jsx.
export const routes: readonly RouteDefinition[] = [
  { id: 'home', pattern: /^\/(?:home_page)?$/, layout: 'shell', title: '首页' },
  { id: 'gallery', pattern: /^\/show$/, layout: 'shell', title: 'TV Show' },
  { id: 'skills', pattern: /^\/skill$/, layout: 'shell', title: 'PenStudio Agent' },
  { id: 'xumeng', pattern: /^\/xumeng(?:\/agent)?$/, layout: 'shell', title: '叙梦 Agent' },
  { id: 'skill-create', pattern: /^\/skill\/create$/, layout: 'shell', title: '创建 Skill' },
  { id: 'skill-share', pattern: /^\/skill\/share$/, layout: 'shell', title: 'Skill' },
  { id: 'studio', pattern: /^\/3d-box$/, layout: 'shell', title: 'PenStudio 3D-BOX' },
  { id: 'studio-editor', pattern: /^\/animation-preview$/, layout: 'standalone', title: '3D-BOX' },
  { id: 'projects', pattern: /^\/project$/, layout: 'shell', title: '项目' },
  {
    id: 'interactive-film',
    pattern: /^\/interactive-film$/,
    layout: 'standalone',
    title: '互动影游编辑器',
  },
  {
    id: 'film-release',
    pattern: /^\/interactive-film\/play\/[^/]+$/,
    layout: 'standalone',
    title: '互动影游',
  },
  { id: 'assets', pattern: /^\/assets$/, layout: 'shell', title: '资产' },
  { id: 'profile', pattern: /^\/profile$/, layout: 'shell', title: '用户主页' },
  { id: 'detail', pattern: /^\/detail\/[^/]+$/, layout: 'standalone', title: '作品' },
  {
    id: 'canvas',
    pattern: /^\/canvas(?:\/(?:share|chat-share|import\/blender))?$/,
    layout: 'standalone',
    title: '画布',
  },
  { id: 'academy', pattern: /^\/academy$/, layout: 'shell', title: '学院' },
  {
    id: 'academy-course',
    pattern: /^\/academy\/course\/[^/]+$/,
    layout: 'standalone',
    title: '课程播放',
  },
  {
    id: 'academy-practice',
    pattern: /^\/academy\/practice\/[^/]+$/,
    layout: 'standalone',
    title: 'AI 跟练室',
  },
  {
    id: 'academy-product',
    pattern: /^\/academy\/product\/[^/]+$/,
    layout: 'chrome',
    title: '课程',
  },
  {
    id: 'academy-article',
    pattern: /^\/academy\/article\/[^/]+$/,
    layout: 'standalone',
    title: '图文教程',
  },
  {
    id: 'academy-video',
    pattern: /^\/academy\/(?:tutorial|masterclass)\/[^/]+$/,
    layout: 'standalone',
    title: '视频教程',
  },
  { id: 'activities', pattern: /^\/activity$/, layout: 'shell', title: '创作者挑战赛' },
  { id: 'activity-detail', pattern: /^\/activity\/[^/]+$/, layout: 'shell', title: '挑战赛' },
  { id: 'updates', pattern: /^\/feature-updates$/, layout: 'shell', title: '版本更新记录' },
  { id: 'plugin', pattern: /^\/plugin$/, layout: 'shell', title: '插件与扩展' },
  { id: 'blender', pattern: /^\/blender$/, layout: 'standalone', title: 'Blender 插件' },
  { id: 'mcp-authorize', pattern: /^\/mcp\/authorize$/, layout: 'standalone', title: '授权' },
  {
    id: 'seedance-verify',
    pattern: /^\/seedance-verify$/,
    layout: 'standalone',
    title: 'Seedance 任务核验',
  },
];

export const notFoundRoute: RouteDefinition = {
  id: 'not-found',
  pattern: /.*/,
  layout: 'shell',
  title: '404',
};

export function resolveRoute(pathname: string): RouteDefinition {
  return routes.find((route) => route.pattern.test(pathname)) ?? notFoundRoute;
}

export function normalizeLocation(location: Pick<URL, 'pathname' | 'search' | 'hash'>): string {
  let pathname = location.pathname;
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    pathname = pathname.slice(3) || '/';
  }
  if (pathname === '/forbidden' && !location.search) pathname = '/';
  return pathname + location.search + location.hash;
}
