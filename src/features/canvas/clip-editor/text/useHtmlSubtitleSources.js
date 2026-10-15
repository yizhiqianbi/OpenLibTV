import { useEffect, useMemo, useRef } from 'react';
import { readClipTextHtml } from '../../../../services/clip-text-source.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';
import { materializeHtmlSubtitles } from './subtitle-materialization.js';
import { timedTextDigestSync } from '../../../../services/timed-text-digest.ts';

export function useHtmlSubtitleSources(state, controller, src) {
  const latest = useRef(controller);
  latest.current = controller;
  const cache = useRef({
    session: null,
    values: new Map(),
    openings: new Map(),
    snapshots: new WeakMap(),
  });
  if (cache.current.session !== state?.draftSession)
    cache.current = {
      session: state?.draftSession,
      values: new Map(),
      openings: new Map(),
      snapshots: new WeakMap(),
    };
  const active = Boolean(state),
    clips = state?.timeline.clips,
    subtitlesHtml = state?.timeline.subtitlesHtml,
    nodeUrl = state?.nodeSubtitleHtmlUrl,
    session = state?.draftSession,
    retry = state?.htmlSubtitleRetry,
    initialized = state?.initialized;
  const plan = useMemo(() => {
    if (!active) return { key: 'inactive', layers: [] };
    try {
      return htmlSubtitleLoadPlan({ clips, subtitlesHtml }, nodeUrl);
    } catch (error) {
      return { key: 'invalid', layers: [], error };
    }
  }, [active, clips, subtitlesHtml, nodeUrl]);
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    if (!session) return undefined;
    const abort = new AbortController(),
      controls = latest.current,
      current = planRef.current;
    let live = true;
    const finish = (layers) => {
      if (!live || abort.signal.aborted) return;
      const owner = controls.getState();
      if (owner?.draftSession !== session) return;
      if (layers.length && !owner.initialized) {
        controls.onHtmlSubtitleLoadStatus(current.key);
        return;
      }
      const prepared = layers.map((layer) => {
        const key = JSON.stringify([
          layer.key,
          layer.url,
          timedTextDigestSync(layer.html).slice(0, 16),
        ]);
        if (!cache.current.snapshots.has(owner.timeline.clips))
          cache.current.snapshots.set(owner.timeline.clips, structuredClone(owner.timeline.clips));
        if (!cache.current.openings.has(key))
          cache.current.openings.set(key, cache.current.snapshots.get(owner.timeline.clips));
        return {
          ...layer,
          sourceHtml: layer.html,
          html: materializeHtmlSubtitles(
            layer,
            cache.current.openings.get(key),
            owner.timeline.clips,
          ),
        };
      });
      controls.onHtmlSubtitleLoaded(current.key, prepared);
    };
    if (current.error) {
      controls.onHtmlSubtitleLoadStatus(current.key, current.error.message);
      return undefined;
    }
    if (current.layers.every((layer) => layer.html)) {
      try {
        finish(current.layers);
      } catch (error) {
        controls.onHtmlSubtitleLoadStatus(current.key, error.message);
      }
      return undefined;
    }
    controls.onHtmlSubtitleLoadStatus(current.key);
    const timer = setTimeout(() => {
      abort.abort();
      if (live) controls.onHtmlSubtitleLoadStatus(current.key, 'HTML字幕加载超时，请重试');
    }, 15000);
    const reads = new Map();
    const load = async (layer) => {
      if (layer.html) return layer;
      const url = src(layer.url);
      if (!reads.has(url))
        reads.set(
          url,
          cache.current.values.has(url) && !retry
            ? Promise.resolve(cache.current.values.get(url))
            : readClipTextHtml(url, { signal: abort.signal }),
        );
      const html = await reads.get(url);
      if (live && !abort.signal.aborted) cache.current.values.set(url, html);
      return { ...layer, html };
    };
    Promise.all(current.layers.map(load))
      .then(finish)
      .catch((error) => {
        if (live && error.name !== 'AbortError')
          controls.onHtmlSubtitleLoadStatus(current.key, error.message || 'HTML字幕读取失败');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [session, plan.key, retry, src, initialized]);
  return plan;
}
