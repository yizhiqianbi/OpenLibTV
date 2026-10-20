import { useEffect, useMemo, useRef } from 'react';
import { readClipTextHtml } from '../../../../services/clip-text-source.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';
import { materializeHtmlSubtitles } from './subtitle-materialization.js';
import { timedTextDigestSync } from '../../../../services/timed-text-digest.ts';
import { readSubtitleHtml } from './html-document.js';
import { retrofitSubtitleStyles } from './subtitle-style-compatibility.js';

export function useHtmlSubtitleSources(state, controller, src) {
  const latest = useRef(controller);
  latest.current = controller;
  const cache = useRef({
    session: null,
    values: new Map(),
    validUrls: new Set(),
    openings: new Map(),
    snapshots: new WeakMap(),
  });
  if (cache.current.session !== state?.draftSession)
    cache.current = {
      session: state?.draftSession,
      values: new Map(),
      validUrls: new Set(),
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
  const pendingFinish = useRef(null);
  planRef.current = plan;
  useEffect(() => {
    if (!session) return undefined;
    const abort = new AbortController(),
      controls = latest.current,
      current = planRef.current;
    let live = true,
      finished = false;
    const token = {};
    const dispose = () => {
      live = false;
      if (pendingFinish.current?.token === token) pendingFinish.current = null;
      abort.abort();
    };
    const settled = new Map();
    const finish = (results, timedOut = false) => {
      if (!live || finished || (abort.signal.aborted && !timedOut)) return;
      const owner = controls.getState();
      if (owner?.draftSession !== session) return;
      const layers = results.flatMap((result) => (result.layer ? [result.layer] : []));
      if (layers.length && !owner.initialized) {
        pendingFinish.current = { token, session, finish: () => finish(results, timedOut) };
        controls.onHtmlSubtitleLoadStatus(current.key);
        return;
      }
      finished = true;
      if (pendingFinish.current?.token === token) pendingFinish.current = null;
      const prepared = [],
        failures = results.flatMap((result) => (result.failure ? [result.failure] : []));
      for (const layer of layers) {
        try {
          const model = readSubtitleHtml(layer.html);
          if (!model.ok) throw new Error(model.issues[0].detail);
          const key = JSON.stringify([
            layer.key,
            layer.url,
            timedTextDigestSync(layer.html).slice(0, 16),
          ]);
          if (!cache.current.snapshots.has(owner.timeline.clips))
            cache.current.snapshots.set(
              owner.timeline.clips,
              structuredClone(owner.timeline.clips),
            );
          if (!cache.current.openings.has(key))
            cache.current.openings.set(key, cache.current.snapshots.get(owner.timeline.clips));
          const compatible = retrofitSubtitleStyles(layer.html);
          const html = materializeHtmlSubtitles(
            { ...layer, html: compatible.html },
            cache.current.openings.get(key),
            owner.timeline.clips,
          );
          const materialized = readSubtitleHtml(html);
          if (materialized.issues?.some((issue) => issue.code === 'missing-cues'))
            throw new Error('字幕HTML中没有可读取的字幕，原数据已保留');
          if (layer.url) cache.current.validUrls.add(src(layer.url));
          prepared.push({
            ...layer,
            sourceHtml: layer.html,
            html,
          });
        } catch (error) {
          failures.push({ key: layer.key, nodeId: layer.nodeId, error: error.message });
        }
      }
      failures.sort(
        (left, right) =>
          current.layers.findIndex((layer) => layer.key === left.key) -
          current.layers.findIndex((layer) => layer.key === right.key),
      );
      controls.onHtmlSubtitleLoaded(current.key, prepared, failures);
    };
    if (current.error) {
      controls.onHtmlSubtitleLoadStatus(current.key, current.error.message);
      return dispose;
    }
    if (current.layers.every((layer) => layer.html)) {
      try {
        finish(current.layers.map((layer) => ({ layer })));
      } catch (error) {
        controls.onHtmlSubtitleLoadStatus(current.key, error.message);
      }
      return dispose;
    }
    controls.onHtmlSubtitleLoadStatus(current.key);
    const timer = setTimeout(() => {
      finish(
        current.layers.map(
          (layer) =>
            settled.get(layer.key) || {
              failure: {
                key: layer.key,
                nodeId: layer.nodeId,
                error: 'HTML字幕加载超时，请重试',
              },
            },
        ),
        true,
      );
      abort.abort();
    }, 15000);
    const reads = new Map();
    const load = async (layer) => {
      if (layer.html) return layer;
      const url = src(layer.url);
      if (!reads.has(url))
        reads.set(
          url,
          cache.current.values.has(url) && (!retry || cache.current.validUrls.has(url))
            ? Promise.resolve(cache.current.values.get(url))
            : readClipTextHtml(url, { signal: abort.signal, requireComposition: false }),
        );
      const html = await reads.get(url);
      if (live && !abort.signal.aborted) cache.current.values.set(url, html);
      return { ...layer, html };
    };
    Promise.all(
      current.layers.map(async (layer) => {
        let result;
        try {
          result = { layer: await load(layer) };
        } catch (error) {
          result = {
            failure: {
              key: layer.key,
              nodeId: layer.nodeId,
              error: error.message || 'HTML字幕读取失败',
            },
          };
        }
        if (live && !abort.signal.aborted) settled.set(layer.key, result);
        return result;
      }),
    )
      .then(finish)
      .catch((error) => {
        if (live && error.name !== 'AbortError')
          controls.onHtmlSubtitleLoadStatus(current.key, error.message || 'HTML字幕读取失败');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      dispose();
      clearTimeout(timer);
    };
  }, [session, plan.key, retry, src]);
  useEffect(() => {
    if (initialized && pendingFinish.current?.session === session) pendingFinish.current.finish();
  }, [initialized, session]);
  return plan;
}
