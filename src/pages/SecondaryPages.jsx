import React from 'react';
import AcademyPage from '../features/academy/AcademyPage.jsx';
import ArticlePage from '../features/academy/ArticlePage.jsx';
import VideoPage from '../features/academy/VideoPage.jsx';
import ActivitiesPage from '../features/activities/ActivitiesPage.jsx';
import ActivityPage from '../features/activities/ActivityPage.jsx';
import PluginPage from '../features/plugin/PluginPage.jsx';
import BlenderPage from '../features/blender/BlenderPage.jsx';
import FeatureUpdatesPage from '../features/system/FeatureUpdatesPage.jsx';
import McpAuthorizePage from '../features/system/McpAuthorizePage.jsx';
import SeedanceVerifyPage from '../features/system/SeedanceVerifyPage.jsx';
import NotFoundPage from '../features/system/NotFoundPage.jsx';
import SkillCreatePage from '../features/skills/create/SkillCreatePage.jsx';
import SkillSharePage from '../features/skills/share/SkillSharePage.jsx';
import { asset as defaultAsset } from '../data.js';

// Compatibility entry. The application router can lazy-load each route page directly.
export function SecondaryPage({ path, asset = defaultAsset, ...props }) {
  const common = { ...props, path, asset };
  if (path === '/blender') return <BlenderPage {...common} />;
  if (path === '/mcp/authorize') return <McpAuthorizePage {...common} />;
  if (path === '/seedance-verify') return <SeedanceVerifyPage {...common} />;
  if (path === '/calculation') return <NotFoundPage {...common} />;
  if (path === '/skill/create') return <SkillCreatePage {...common} />;
  if (path === '/skill/share') return <SkillSharePage {...common} />;
  if (path.startsWith('/academy/article/')) return <ArticlePage {...common} />;
  if (path.startsWith('/academy/tutorial/') || path.startsWith('/academy/masterclass/'))
    return <VideoPage {...common} />;
  if (path.startsWith('/activity/')) return <ActivityPage {...common} />;
  if (path === '/academy') return <AcademyPage {...common} />;
  if (path === '/activity') return <ActivitiesPage {...common} />;
  if (path === '/feature-updates') return <FeatureUpdatesPage {...common} />;
  if (path === '/plugin') return <PluginPage {...common} />;
  return null;
}

export default SecondaryPage;
