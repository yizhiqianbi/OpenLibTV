import { useCallback, useRef } from 'react';
import { createSnapshotHistory } from './model.js';

export function useSnapshotHistory(snapshot, { limit = 50, restore, onRecord } = {}) {
  const timeline = useRef();
  if (!timeline.current) timeline.current = createSnapshotHistory(limit);
  const latest = useRef();
  latest.current = { snapshot, restore, onRecord };
  const history = useRef(timeline.current.past);
  const future = useRef(timeline.current.future);
  const record = useCallback(() => {
    timeline.current.record(latest.current.snapshot);
    latest.current.onRecord?.();
  }, []);
  const recordSnapshot = useCallback((value) => {
    timeline.current.record(value);
    latest.current.onRecord?.();
  }, []);
  const undo = useCallback(() => {
    const previous = timeline.current.undo(latest.current.snapshot);
    if (previous) latest.current.restore?.(previous);
  }, []);
  const redo = useCallback(() => {
    const next = timeline.current.redo(latest.current.snapshot);
    if (next) latest.current.restore?.(next);
  }, []);
  const clearHistory = useCallback(() => timeline.current.clear(), []);
  return { history, future, record, recordSnapshot, undo, redo, clearHistory };
}
