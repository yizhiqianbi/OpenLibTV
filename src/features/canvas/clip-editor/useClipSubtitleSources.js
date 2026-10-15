import { useEffect, useMemo, useRef } from 'react';
import { readClipSubtitleVtt } from '../../../services/clip-subtitle-source.js';
import { subtitleLoadPlan } from './domain/subtitle-document-model.js';
import { mergeSubtitleSources, parseSubtitleVtt } from './domain/subtitle-vtt.js';
const EMPTY_CLIPS = [];

export function useClipSubtitleSources(state, controller, src, enabled = true) {
  const latest = useRef(controller);
  latest.current = controller;
  const cacheOwner = useRef(null);
  const resultCache = useRef(new Map());
  if (cacheOwner.current !== state?.draftSession) {
    cacheOwner.current = state?.draftSession;
    resultCache.current = new Map();
  }
  const clips = state?.timeline.clips || EMPTY_CLIPS,
    subtitles = state?.timeline.subtitles,
    active = Boolean(state) && enabled,
    retry = state?.subtitleRetry,
    draftSession = state?.draftSession;
  const plan = useMemo(() => {
    try {
      return subtitleLoadPlan({ clips, subtitles });
    } catch (error) {
      return { key: 'invalid', error };
    }
  }, [subtitles, clips]);
  const planRef = useRef(plan);
  planRef.current = plan;
  useEffect(() => {
    if (!active) return undefined;
    const plan = planRef.current;
    const abort = new AbortController();
    let live = true;
    const results = resultCache.current;
    if (plan.error) {
      latest.current.onSubtitleLoadStatus('invalid', plan.error.message);
      return undefined;
    }
    if (plan.ready) {
      latest.current.onSubtitleLoaded(plan.key);
      return undefined;
    }
    if (results.has(plan.key) && !retry) {
      latest.current.onSubtitleLoaded(plan.key, results.get(plan.key));
      return undefined;
    }
    latest.current.onSubtitleLoadStatus(plan.key);
    const timer = setTimeout(() => {
      abort.abort();
      if (live) latest.current.onSubtitleLoadStatus(plan.key, '字幕文件加载超时，请重试');
    }, 15_000);
    const cache = new Map();
    const read = (url) => {
      if (!cache.has(url)) cache.set(url, readClipSubtitleVtt(src(url), { signal: abort.signal }));
      return cache.get(url);
    };
    const operation = async () => {
      if (plan.raw) {
        const parsed = parseSubtitleVtt(plan.raw, plan.track.sourceUrl);
        return {
          ...parsed,
          ...plan.track,
          cues: parsed.cues,
          defaultStyle: plan.track.defaultStyle || parsed.defaultStyle,
        };
      }
      if (plan.url) {
        const text = await read(plan.url),
          parsed = parseSubtitleVtt(text, plan.url);
        return {
          ...parsed,
          ...plan.track,
          cues: parsed.cues,
          rawVtt: text,
          defaultStyle: plan.track.defaultStyle || parsed.defaultStyle,
        };
      }
      const tracks = await Promise.all(
        plan.sources.map(async (clip) => ({
          clipId: clip.id,
          track: parseSubtitleVtt(await read(clip.subtitleUrl), clip.subtitleUrl),
        })),
      );
      const merged = mergeSubtitleSources(tracks, plan.sources);
      return {
        ...merged,
        visible: plan.track.visible,
        defaultStyle: plan.track.defaultStyle || merged.defaultStyle,
      };
    };
    operation()
      .then((track) => {
        if (live && !abort.signal.aborted) {
          results.set(plan.key, track);
          latest.current.onSubtitleLoaded(plan.key, track);
        }
      })
      .catch((error) => {
        if (live && error.name !== 'AbortError')
          latest.current.onSubtitleLoadStatus(plan.key, error.message || '字幕文件加载失败');
        abort.abort();
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [plan.key, retry, draftSession, src, active]);
}
