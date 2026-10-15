import { useEffect, useState } from 'react';

// Matches original module 254119: mobile UA survives rotation; tablets use width.
export function isPlayerMobile(width, userAgent = navigator.userAgent) {
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/.test(ua)) return true;
  if (/ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone))/.test(ua)) return false;
  return width < 768;
}

export function usePlayerViewport() {
  const [mobile, setMobile] = useState(() => isPlayerMobile(window.innerWidth));
  const [landscape, setLandscape] = useState(() => window.innerWidth > window.innerHeight);
  useEffect(() => {
    const orientation = window.matchMedia?.('(orientation: landscape)');
    let timer;
    const update = () => {
      setMobile(isPlayerMobile(window.innerWidth));
      setLandscape(orientation?.matches ?? window.innerWidth > window.innerHeight);
    };
    const resized = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 100);
    };
    update();
    window.addEventListener('resize', resized);
    window.addEventListener('orientationchange', update);
    orientation?.addEventListener('change', update);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', resized);
      window.removeEventListener('orientationchange', update);
      orientation?.removeEventListener('change', update);
    };
  }, []);
  return { mobile, landscape };
}
