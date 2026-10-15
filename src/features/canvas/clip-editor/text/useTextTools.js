import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { readClipTextHtml } from '../../../../services/clip-text-source.js';
import { createClipTextTools } from './controls.js';
import { textLoadPlan } from './document-model.js';
export function useTextTools(state, controller, src) {
  const latest = useRef(controller);
  latest.current = controller;
  const session = state?.draftSession,
    retry = state?.textRetry;
  const inline = state?.timeline.overlayHtmlInline,
    url = state?.timeline.overlayHtmlUrl;
  const plan = useMemo(
    () => textLoadPlan({ overlayHtmlInline: inline, overlayHtmlUrl: url }),
    [inline, url],
  );
  const cache = useRef({ session, values: new Map() });
  if (cache.current.session !== session) cache.current = { session, values: new Map() };
  useLayoutEffect(() => {
    if (session) latest.current.installTextTools(createClipTextTools);
  }, [session]);
  useEffect(() => {
    if (!session) return undefined;
    const controls = latest.current;
    const abort = new AbortController();
    let live = true;
    const { key, html, ready, url } = plan;
    if (ready || html) {
      controls.onTextLoaded(key, html);
      return undefined;
    }
    if (cache.current.values.has(key) && !retry) {
      controls.onTextLoaded(key, cache.current.values.get(key));
      return undefined;
    }
    controls.onTextLoadStatus(key);
    const timer = setTimeout(() => {
      abort.abort();
      if (live) controls.onTextLoadStatus(key, '文字HTML加载超时，请重试');
    }, 15000);
    readClipTextHtml(src(url), { signal: abort.signal })
      .then((value) => {
        if (live && !abort.signal.aborted) {
          cache.current.values.set(key, value);
          controls.onTextLoaded(key, value);
        }
      })
      .catch((error) => {
        if (live && error.name !== 'AbortError')
          controls.onTextLoadStatus(key, error.message || '文字HTML加载失败');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [session, retry, plan, src]);
}
