import { useEffect, useMemo, useRef } from 'react';
import { readClipSubtitleVtt } from '../../../services/clip-subtitle-source.js';
import { subtitleLoadPlan } from './domain/subtitle-document-model.js';
import { mergeSubtitleSources, parseSubtitleVtt } from './domain/subtitle-vtt.js';
import { subtitleMigrationSourcePlan } from './domain/subtitle-migration-model.js';
const EMPTY_CLIPS = [];

export function useClipSubtitleSources(
  state,
  controller,
  src,
  enabled = true,
  migrationEnabled = false,
) {
  const latest = useRef(controller);
  latest.current = controller;
  const cacheOwner = useRef(null);
  const resultCache = useRef(new Map());
  const migrationCache = useRef(new Map());
  if (cacheOwner.current !== state?.draftSession) {
    cacheOwner.current = state?.draftSession;
    resultCache.current = new Map();
    migrationCache.current = new Map();
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
  const migrationPlan = useMemo(() => subtitleMigrationSourcePlan(clips), [clips]);
  const migrationRef = useRef(migrationPlan);
  migrationRef.current = migrationPlan;
  useEffect(() => {
    if (!active) return undefined;
    const plan = planRef.current;
    const abort = new AbortController();
    let live = true;
    const results = resultCache.current,
      migration = migrationRef.current;
    if (plan.error) {
      latest.current.onSubtitleLoadStatus('invalid', plan.error.message);
      return undefined;
    }
    let baseFinished = false,
      migrationFinished = !migrationEnabled;
    const timer = setTimeout(() => {
      abort.abort();
      if (!live) return;
      if (!baseFinished) latest.current.onSubtitleLoadStatus(plan.key, '字幕文件加载超时，请重试');
      if (!migrationFinished) latest.current.onSubtitleMigrationSources?.(migration.key, 'failed');
    }, 15_000);
    const cache = new Map();
    const read = (url) => {
      if (!cache.has(url)) cache.set(url, readClipSubtitleVtt(src(url), { signal: abort.signal }));
      return cache.get(url);
    };
    const operation = async () => {
      if (plan.ready) return undefined;
      if (results.has(plan.key) && !retry) return results.get(plan.key);
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
    if (!plan.ready && !(results.has(plan.key) && !retry))
      latest.current.onSubtitleLoadStatus(plan.key);
    const baseOperation = operation()
      .then((track) => {
        if (live && !abort.signal.aborted) {
          if (track) results.set(plan.key, track);
          latest.current.onSubtitleLoaded(plan.key, track);
        }
      })
      .catch((error) => {
        if (live && error.name !== 'AbortError')
          latest.current.onSubtitleLoadStatus(plan.key, error.message || '字幕文件加载失败');
      })
      .finally(() => {
        baseFinished = true;
      });
    const migrationOperation = async () => {
      if (!migrationEnabled) return;
      latest.current.onSubtitleMigrationSources?.(migration.key, 'loading');
      let sources;
      if (migrationCache.current.has(migration.key) && !retry)
        sources = migrationCache.current.get(migration.key);
      else if (!migration.sources.length)
        sources = migration.nodeIds.map((nodeId) => ({
          nodeId,
          track: { visible: true, cues: [] },
        }));
      else {
        const loaded = await Promise.all(
          migration.sources.map(async (source) => ({
            ...source,
            track: parseSubtitleVtt(await read(source.url), source.url),
          })),
        );
        sources = loaded;
      }
      if (live && !abort.signal.aborted) {
        migrationCache.current.set(migration.key, sources);
        latest.current.onSubtitleMigrationSources?.(migration.key, 'ready', sources);
      }
    };
    const hydration = migrationOperation()
      .catch(() => {
        if (live && !abort.signal.aborted)
          latest.current.onSubtitleMigrationSources?.(migration.key, 'failed');
      })
      .finally(() => {
        migrationFinished = true;
      });
    Promise.all([baseOperation, hydration]).finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [plan.key, migrationPlan.key, retry, draftSession, src, active, migrationEnabled]);
}
