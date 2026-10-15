import React, { lazy, Suspense } from 'react';
import RouteErrorBoundary from '../RouteErrorBoundary.jsx';

const HomePage = lazy(() => import('../../features/home/HomePage.jsx'));
const GalleryPage = lazy(() => import('../../features/gallery/GalleryPage.jsx'));
const SkillPage = lazy(() => import('../../features/skills/SkillPage.jsx'));
const StudioPage = lazy(() => import('../../features/studio/StudioLandingPage.jsx'));
const ProjectPage = lazy(() => import('../../features/projects/ProjectPage.jsx'));
const AssetsPage = lazy(() => import('../../features/assets/AssetsPage.jsx'));
const DetailPage = lazy(() => import('../../features/gallery/DetailPage.jsx'));
const ProfilePage = lazy(() => import('../../features/profiles/ProfilePage.jsx'));
const CanvasPage = lazy(() => import('../../features/canvas/CanvasPage.jsx'));
const InteractiveFilmPage = lazy(
  () => import('../../features/interactive-film/InteractiveFilmPage.jsx'),
);
const FilmReleasePage = lazy(() => import('../../features/interactive-film/FilmReleasePage.jsx'));
const NotFoundPage = lazy(() => import('../../features/system/NotFoundPage.jsx'));
const AcademyPage = lazy(() => import('../../features/academy/AcademyPage.jsx'));
const ArticlePage = lazy(() => import('../../features/academy/ArticlePage.jsx'));
const VideoPage = lazy(() => import('../../features/academy/VideoPage.jsx'));
const CoursePage = lazy(() => import('../../features/academy/CoursePage.jsx'));
const PracticePage = lazy(() => import('../../features/academy/PracticePage.jsx'));
const ProductPage = lazy(() => import('../../features/academy/ProductPage.jsx'));
const ActivitiesPage = lazy(() => import('../../features/activities/ActivitiesPage.jsx'));
const ActivityPage = lazy(() => import('../../features/activities/ActivityPage.jsx'));
const PluginPage = lazy(() => import('../../features/plugin/PluginPage.jsx'));
const BlenderPage = lazy(() => import('../../features/blender/BlenderPage.jsx'));
const UpdatesPage = lazy(() => import('../../features/system/FeatureUpdatesPage.jsx'));
const McpAuthorizePage = lazy(() => import('../../features/system/McpAuthorizePage.jsx'));
const SeedanceVerifyPage = lazy(() => import('../../features/system/SeedanceVerifyPage.jsx'));
const SkillCreatePage = lazy(() => import('../../features/skills/create/SkillCreatePage.jsx'));
const SkillSharePage = lazy(() => import('../../features/skills/share/SkillSharePage.jsx'));

const pages = {
  home: HomePage,
  gallery: GalleryPage,
  skills: SkillPage,
  studio: StudioPage,
  projects: ProjectPage,
  assets: AssetsPage,
  detail: DetailPage,
  profile: ProfilePage,
  canvas: CanvasPage,
  'interactive-film': InteractiveFilmPage,
  'film-release': FilmReleasePage,
  'studio-editor': CanvasPage,
  academy: AcademyPage,
  'academy-article': ArticlePage,
  'academy-video': VideoPage,
  'academy-course': CoursePage,
  'academy-practice': PracticePage,
  'academy-product': ProductPage,
  activities: ActivitiesPage,
  'activity-detail': ActivityPage,
  plugin: PluginPage,
  blender: BlenderPage,
  updates: UpdatesPage,
  'mcp-authorize': McpAuthorizePage,
  'seedance-verify': SeedanceVerifyPage,
  'skill-create': SkillCreatePage,
  'skill-share': SkillSharePage,
  'not-found': NotFoundPage,
};

export default function RouteOutlet({ route, locationKey, ...props }) {
  const Page = pages[route.id];
  return (
    <RouteErrorBoundary locationKey={locationKey}>
      <Suspense
        fallback={
          <div className="empty-state" aria-label="加载中">
            <span className="spinner" />
          </div>
        }
      >
        <Page
          key={route.id === 'skills' ? locationKey.split(/[?#]/)[0] : locationKey.split('#')[0]}
          {...props}
        />
      </Suspense>
    </RouteErrorBoundary>
  );
}
