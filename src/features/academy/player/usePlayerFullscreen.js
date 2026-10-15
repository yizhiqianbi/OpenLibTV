import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export function usePlayerFullscreen(box, video, mobile, playbackKey) {
  const [fullscreen, setFullscreen] = useState(false);
  const safariWaiting = useRef(null);
  const request = useRef(0);
  const invalidateRequest = useCallback(() => {
    request.current++;
  }, []);
  const latestMobile = useRef(mobile);
  useLayoutEffect(() => {
    latestMobile.current = mobile;
  }, [mobile]);
  useEffect(() => {
    const element = video.current;
    const change = () => setFullscreen(document.fullscreenElement === box.current);
    const safariBegin = () => setFullscreen(true);
    const safariEnd = () => setFullscreen(false);
    document.addEventListener('fullscreenchange', change);
    element?.addEventListener('webkitbeginfullscreen', safariBegin);
    element?.addEventListener('webkitendfullscreen', safariEnd);
    change();
    return () => {
      invalidateRequest();
      document.removeEventListener('fullscreenchange', change);
      element?.removeEventListener('webkitbeginfullscreen', safariBegin);
      element?.removeEventListener('webkitendfullscreen', safariEnd);
      safariWaiting.current?.();
      safariWaiting.current = null;
    };
  }, [box, video, playbackKey, invalidateRequest]);
  const toggleFullscreen = useCallback(async () => {
    const token = ++request.current;
    safariWaiting.current?.();
    safariWaiting.current = null;
    if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => {});
      return;
    }
    const root = box.current;
    if (root?.requestFullscreen) {
      try {
        await root.requestFullscreen();
        // Permission requests may finish after the player has been removed.
        if (
          request.current === token &&
          root.isConnected &&
          document.fullscreenElement === root &&
          latestMobile.current
        )
          await screen.orientation?.lock?.('landscape').catch(() => {});
      } catch {
        /* Fullscreen can be blocked by browser permissions. */
      }
      return;
    }
    const element = video.current;
    if (!element?.webkitEnterFullscreen) return;
    if (element.webkitDisplayingFullscreen) {
      element.webkitExitFullscreen?.();
      return;
    }
    const enter = () => {
      if (request.current !== token || video.current !== element || !element.isConnected) return;
      element.webkitEnterFullscreen?.();
    };
    if (element.readyState >= 1) enter();
    else {
      const loaded = () => {
        safariWaiting.current = null;
        enter();
      };
      element.addEventListener('loadedmetadata', loaded, { once: true });
      safariWaiting.current = () => element.removeEventListener('loadedmetadata', loaded);
    }
  }, [box, video]);
  return { fullscreen, toggleFullscreen };
}
