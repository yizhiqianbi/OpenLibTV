import React, { useEffect } from 'react';
import { asset } from './data.js';
import AppShell from './app/layout/AppShell.jsx';
import GlobalOverlays from './app/overlays/GlobalOverlays.jsx';
import RouteOutlet from './app/router/RouteOutlet.jsx';
import { normalizeLocation, resolveRoute } from './app/router/routes.ts';
import { useRouter } from './app/router/useRouter.ts';
import { useAppUI } from './app/useAppUI.js';

export default function App() {
  const { navigate, locationKey, pathname, search } = useRouter();
  const ui = useAppUI(navigate);
  const route = resolveRoute(pathname);
  useEffect(() => {
    const normalized = normalizeLocation(window.location);
    if (normalized !== locationKey) navigate(normalized, { replace: true });
  }, [locationKey, navigate]);
  useEffect(() => {
    document.title = route.title + ' - PenStudio - 专业视频创作工具';
  }, [route.title]);
  const props = {
    path: pathname,
    search,
    navigate: ui.navigate,
    login: ui.login,
    user: ui.user,
    toast: ui.toast,
    asset,
  };
  return (
    <>
      <AppShell
        standalone={route.layout === 'standalone'}
        chrome={route.layout === 'chrome'}
        path={pathname}
        ui={ui}
      >
        <RouteOutlet route={route} locationKey={locationKey} {...props} />
      </AppShell>
      <GlobalOverlays ui={ui} />
    </>
  );
}
