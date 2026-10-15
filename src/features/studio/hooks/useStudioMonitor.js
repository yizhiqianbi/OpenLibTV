import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MONITOR_TOP } from '../monitor/model.js';

const EMPTY = {};

/** React owns card observations only; the viewport owns capture, targets and scheduling. */
export function useStudioMonitor({ enabled, sceneKey, topViewActive, cameras }) {
  const [snapshot, setSnapshot] = useState(null);
  const context = useRef({ enabled, sceneKey, topViewActive, mounted: true });
  const observations = useRef(new Map());
  const cache = useRef({ dirty: true, request: null });
  const scrollContainerRef = useRef(null);
  if (context.current.sceneKey !== sceneKey || context.current.topViewActive !== topViewActive)
    cache.current.dirty = true;
  context.current = { enabled, sceneKey, topViewActive, mounted: context.current.mounted };

  const attach = useCallback((key, element) => {
    const old = observations.current.get(key);
    old?.intersection?.disconnect();
    old?.resize?.disconnect();
    observations.current.delete(key);
    cache.current.dirty = true;
    if (!element) return;
    const record = {
      element,
      width: Math.ceil(element.clientWidth),
      visible: !globalThis.IntersectionObserver,
    };
    observations.current.set(key, record);
    const current = () => observations.current.get(key) === record;
    if (globalThis.ResizeObserver) {
      record.resize = new ResizeObserver((entries) => {
        if (!current()) return;
        for (const entry of entries) {
          const width = Math.ceil(entry.contentRect.width);
          if (width > 0 && width !== record.width) {
            record.width = width;
            cache.current.dirty = true;
          }
        }
      });
      record.resize.observe(element);
    }
    if (globalThis.IntersectionObserver) {
      record.intersection = new IntersectionObserver(
        (entries) => {
          if (!current()) return;
          for (const entry of entries) {
            if (record.visible !== entry.isIntersecting) {
              record.visible = entry.isIntersecting;
              cache.current.dirty = true;
            }
          }
        },
        { root: null, rootMargin: '64px' },
      );
      record.intersection.observe(element);
    }
  }, []);
  const observe = useCallback((key) => (element) => attach(key, element), [attach]);
  const request = useCallback(() => {
    const current = context.current;
    if (!current.enabled || !current.mounted || document.hidden) return null;
    const visible = [...observations.current].filter(([, item]) => item.visible);
    if (!visible.length) return null;
    if (cache.current.dirty) {
      cache.current.request = {
        sceneKey: current.sceneKey,
        topView: visible.some(([key]) => key === MONITOR_TOP) && !current.topViewActive,
        orbitView: visible.some(([key]) => key === MONITOR_TOP) && current.topViewActive,
        cameraIds: visible.map(([key]) => key).filter((key) => key !== MONITOR_TOP),
        thumbnailWidth: Math.max(...visible.map(([, item]) => item.width), 0),
      };
      cache.current.dirty = false;
    }
    return cache.current.request;
  }, []);
  const emit = useCallback((next) => {
    if (
      context.current.mounted &&
      context.current.enabled &&
      next.sceneKey === context.current.sceneKey
    )
      setSnapshot(next);
  }, []);
  useEffect(() => {
    context.current.mounted = true;
    const records = observations.current;
    const requestCache = cache.current;
    for (const [key, record] of [...records]) attach(key, record.element);
    return () => {
      context.current.mounted = false;
      for (const record of records.values()) {
        record.intersection?.disconnect();
        record.resize?.disconnect();
      }
      requestCache.dirty = true;
      requestCache.request = null;
    };
  }, [attach]);
  const current = snapshot?.sceneKey === sceneKey ? snapshot : null;
  const playbackCameraId = enabled ? current?.playbackCameraId || null : null;
  useEffect(() => {
    const container = scrollContainerRef.current;
    const element = observations.current.get(playbackCameraId)?.element;
    if (!container || !element) return;
    const bounds = container.getBoundingClientRect(),
      card = element.getBoundingClientRect();
    if (!bounds.height || !card.height) return;
    const offset =
      card.top < bounds.top ? card.top - bounds.top : Math.max(card.bottom - bounds.bottom, 0);
    if (offset) container.scrollBy({ top: offset, behavior: 'smooth' });
  }, [playbackCameraId]);
  const channel = useMemo(() => ({ request, emit }), [request, emit]);
  return {
    channel,
    cameras: current?.cameras || cameras.filter((camera) => camera.visible !== false),
    frames: enabled ? current?.frames || EMPTY : EMPTY,
    playbackCameraId,
    observe,
    scrollContainerRef,
  };
}
