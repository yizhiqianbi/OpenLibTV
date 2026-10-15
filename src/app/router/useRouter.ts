import { useCallback, useSyncExternalStore } from 'react';
import { normalizeLocation } from './routes';

const navigationEvent = 'libtv:navigate';
const snapshot = () => window.location.pathname + window.location.search + window.location.hash;
const subscribe = (listener: () => void) => {
  const onPopState = () => {
    listener();
    window.scrollTo(0, 0);
  };
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', listener);
  window.addEventListener(navigationEvent, listener);
  return () => {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('hashchange', listener);
    window.removeEventListener(navigationEvent, listener);
  };
};

export function useRouter() {
  const locationKey = useSyncExternalStore(subscribe, snapshot, () => '/');
  const navigate = useCallback((href: string, options: { replace?: boolean } = {}) => {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin && url.hostname !== 'www.liblib.tv') {
      window.open(url.href, '_blank', 'noopener,noreferrer');
      return;
    }
    const target = normalizeLocation(url);
    if (target !== snapshot()) {
      window.history[options.replace ? 'replaceState' : 'pushState']({}, '', target);
      window.dispatchEvent(new Event(navigationEvent));
    }
    window.scrollTo(0, 0);
  }, []);
  const pathname = locationKey.split(/[?#]/)[0];
  const search = new URL(locationKey, window.location.origin).search;
  return { locationKey, pathname, search, navigate };
}
