import { useCallback, useEffect, useRef, useState } from 'react';
import { persistStudioDocument, readStudioDocument } from '../persistence.js';
import { restoreStudioPlayback } from '../animation-model.js';
const EMPTY_PATHS = [];

export function useStudioDocument(id, validEntry, user, actions) {
  const latest = useRef(actions);
  const [loadedId, setLoadedId] = useState(null);
  latest.current = actions;
  useEffect(() => {
    if (!validEntry || !user) {
      latest.current.setLoaded(false);
      setLoadedId(null);
      return;
    }
    const data = readStudioDocument(id);
    const state = latest.current;
    state.setTitle(data?.title || '未命名 3D-BOX');
    state.setObjects(data?.objects || []);
    state.setFrames(data?.frames || []);
    state.setCameraPaths?.(Array.isArray(data?.cameraPaths) ? data.cameraPaths : []);
    state.setCameraTimeline?.(data?.cameraTimeline || null);
    state.setViewMode?.(data?.viewMode || 'orbit');
    state.setDuration(data?.duration || 10);
    state.setRatio(data?.ratio || '16:9');
    state.setSelected?.(null);
    const playback = restoreStudioPlayback(data);
    state.setTime?.(playback.time);
    state.setAnimationSelection?.(playback.animationSelection);
    state.setPlaying?.(false);
    state.clearHistory?.();
    setLoadedId(id);
    latest.current.setLoaded(true);
  }, [id, validEntry, user]);
  return loadedId;
}

export function useStudioAutosave(document, { loaded, user, setSaved, notify }) {
  const latest = useRef({ setSaved, notify });
  const pending = useRef(null);
  latest.current = { setSaved, notify };
  const {
    id,
    objects,
    frames,
    title,
    duration,
    ratio,
    time = 0,
    animationSelection = null,
    cameraPaths = EMPTY_PATHS,
    cameraTimeline = null,
    viewMode = 'orbit',
  } = document;
  const canSave = !!(loaded && user && id);
  const flush = useCallback(() => {
    const document = pending.current;
    if (!document) return;
    try {
      persistStudioDocument(document);
      if (pending.current === document) pending.current = null;
      latest.current.setSaved(true);
    } catch {
      latest.current.notify('保存失败，请检查浏览器存储空间，或导出 GLB 备份。');
    }
  }, []);
  const discardPending = useCallback(() => {
    pending.current = null;
  }, []);
  useEffect(() => {
    if (!canSave) return;
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      // A project owns its last validated pending document until it is saved,
      // including navigation or refresh before the debounce timer expires.
      flush();
    };
  }, [canSave, id, flush]);
  useEffect(() => {
    if (!canSave) return;
    pending.current = {
      id,
      title,
      objects,
      frames,
      cameraPaths,
      cameraTimeline,
      duration,
      ratio,
      time,
      animationSelection,
      viewMode,
    };
    latest.current.setSaved(false);
    const timer = setTimeout(flush, 500);
    return () => clearTimeout(timer);
  }, [
    objects,
    frames,
    cameraPaths,
    cameraTimeline,
    title,
    duration,
    ratio,
    time,
    animationSelection,
    viewMode,
    canSave,
    id,
    flush,
  ]);
  return discardPending;
}
