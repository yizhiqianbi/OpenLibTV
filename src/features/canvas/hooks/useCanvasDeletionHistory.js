import { useLayoutEffect, useRef } from 'react';
import { cloneSnapshot } from '../../editor/model.js';
import { sameCanvasConfirmationValue } from '../batch/confirmation-value-model.js';

const snapshot = (value) => {
  if (!Array.isArray(value?.nodes) || !Array.isArray(value?.edges))
    throw new Error('Invalid deletion history snapshot');
  return cloneSnapshot({ nodes: value.nodes, edges: value.edges });
};

/**
 * Source M's pending before/coalescing is separate from graph acceptance.
 * Publish only changed, accepted graphs; later confirmation starts a segment.
 * Existing callers keep their immediate record API and finalize our pending
 * before first. This is a local full-snapshot adapter, not cloud version history.
 */
export function useCanvasDeletionHistory(props) {
  const latest = useRef(props),
    active = useRef(false),
    pending = useRef(null),
    coalescing = useRef(false);
  latest.current = props;
  const owner = useRef({
    documentKey: props.documentKey,
    ready: props.ready,
    readonly: props.readonly,
    version: 0,
  });
  if (
    owner.current.documentKey !== props.documentKey ||
    owner.current.ready !== props.ready ||
    owner.current.readonly !== props.readonly
  ) {
    owner.current = {
      documentKey: props.documentKey,
      ready: props.ready,
      readonly: props.readonly,
      version: owner.current.version + 1,
    };
    pending.current = null;
    coalescing.current = false;
  }
  const renderedOwner = owner.current;
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      owner.current.version += 1;
      pending.current = null;
      coalescing.current = false;
    };
  }, [props.documentKey, props.ready, props.readonly]);
  const current = () =>
    active.current &&
    renderedOwner === owner.current &&
    latest.current.ready === true &&
    latest.current.readonly === false;
  const report = () => {
    try {
      latest.current.notify?.('此次操作已应用，但撤销记录未保存');
    } catch {
      // An accepted graph must not become a retryable deletion on notifier failure.
    }
  };
  const finalize = (value) => {
    const entry = pending.current;
    if (!entry) return true;
    const after = snapshot(value);
    if (!entry.published && !sameCanvasConfirmationValue(entry.before, after))
      latest.current.recordSnapshot(entry.before);
    pending.current = null;
    coalescing.current = false;
    return true;
  };
  const capture = (value) => {
    if (!current()) return false;
    try {
      const before = snapshot(value ?? latest.current.captureSnapshot?.());
      if (coalescing.current && pending.current) return true;
      finalize(before);
      pending.current = { before, published: false };
      coalescing.current = true;
      const token = owner.current,
        version = token.version;
      queueMicrotask(() => {
        if (owner.current === token && token.version === version) coalescing.current = false;
      });
      return true;
    } catch {
      return false;
    }
  };
  const createWriter = () => {
    const token = owner.current,
      version = token.version;
    return (_previous, committed) => {
      if (!current() || owner.current !== token || token.version !== version) return false;
      try {
        const entry = pending.current;
        if (
          entry &&
          !entry.published &&
          !sameCanvasConfirmationValue(entry.before, snapshot(committed))
        ) {
          latest.current.recordSnapshot(entry.before);
          entry.published = true;
        }
        return true;
      } catch {
        report();
        return false;
      }
    };
  };
  const recordSnapshot = (value) => {
    if (!current()) return false;
    try {
      const before = snapshot(value);
      finalize(before);
      latest.current.recordSnapshot(before);
      pending.current = { before, published: true };
      return true;
    } catch {
      report();
      return false;
    }
  };
  const flush = () => {
    if (!current()) return false;
    try {
      const value = latest.current.captureSnapshot?.();
      return value ? finalize(value) : false;
    } catch {
      report();
      return false;
    }
  };
  const discard = () => {
    if (!active.current || renderedOwner !== owner.current) return false;
    pending.current = null;
    coalescing.current = false;
    return true;
  };
  const restore = (direction) => {
    if (!current() || !flush() || typeof latest.current[direction] !== 'function') return false;
    latest.current[direction]();
    return true;
  };
  return {
    capture,
    createWriter,
    recordSnapshot,
    flush,
    discard,
    undo: () => restore('undo'),
    redo: () => restore('redo'),
  };
}
