import { useCallback, useEffect, useRef, useState } from 'react';
import {
  assertFilmDocumentShape,
  createFilmDocument,
} from '../../../services/interactive-film/document.ts';
import {
  loadFilmDocument,
  saveFilmDocument,
  subscribeFilmDocuments,
} from '../../../services/interactive-film/repository.ts';
import { createSnapshotHistory } from '../../editor/model.js';

const fingerprint = (document) => JSON.stringify(document);

export function useFilmDocument(projectId) {
  // Render reads only. StrictMode may replay an initializer before committing its effects.
  const [initial] = useState(() => {
    try {
      const id = projectId || crypto.randomUUID();
      const stored = loadFilmDocument(id);
      if (projectId && !stored) throw new Error('影游项目不存在，原数据不会被覆盖');
      if (stored?.deletedAt !== undefined) throw new Error('项目已移入回收站，请先恢复');
      return { document: stored || createFilmDocument(id), error: null, isNew: !stored };
    } catch (error) {
      return { document: null, error, isNew: false };
    }
  });
  const [document, setDocument] = useState(initial.document);
  const [error, setError] = useState(initial.error);
  const [saved, setSaved] = useState(!initial.error && !initial.isNew);
  const current = useRef(initial.document);
  const timeline = useRef(createSnapshotHistory(50));
  const mounted = useRef(false);
  const dirty = useRef(initial.isNew);
  const writing = useRef(false);
  const blocked = useRef(initial.error);
  const persisted = useRef(
    initial.isNew ? null : initial.document && fingerprint(initial.document),
  );
  const creationAttempted = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  const persistCurrent = useCallback(() => {
    const draft = current.current;
    if (!mounted.current || !draft || blocked.current) return false;
    try {
      // Retry must never recreate a document that another view permanently removed.
      const source = loadFilmDocument(draft.id);
      if (persisted.current !== null && (!source || source.deletedAt !== undefined)) {
        blocked.current = new Error('项目已删除，已停止保存，当前草稿已保留');
        throw blocked.current;
      }
      if (source && persisted.current !== null && fingerprint(source) !== persisted.current) {
        blocked.current = new Error('另一页面已更新项目，请先导出当前草稿后重新打开');
        throw blocked.current;
      }
      writing.current = true;
      const stored = saveFilmDocument(draft);
      persisted.current = fingerprint(stored);
      current.current = stored;
      dirty.current = false;
      setDocument(stored);
      setSaved(true);
      setError(null);
      return true;
    } catch (reason) {
      setError(reason);
      setSaved(false);
      return false;
    } finally {
      writing.current = false;
    }
  }, []);

  const commit = useCallback(
    (change, { history = true } = {}) => {
      const previous = current.current;
      if (!previous || !mounted.current || blocked.current) return false;
      try {
        const candidate = typeof change === 'function' ? change(previous) : change;
        if (candidate === previous) return true;
        assertFilmDocumentShape(candidate);
        if (candidate.id !== previous.id) throw new Error('项目身份已改变');
        const next = { ...candidate, revision: previous.revision + 1, savedAt: Date.now() };
        if (history) timeline.current.record(previous);
        current.current = next;
        dirty.current = true;
        setDocument(next);
        setSaved(false);
        setHistoryVersion((value) => value + 1);
        return persistCurrent();
      } catch (reason) {
        setError(reason);
        return false;
      }
    },
    [persistCurrent],
  );

  const restore = useCallback(
    (kind) => {
      if (!mounted.current || !current.current || blocked.current) return;
      const snapshot = timeline.current[kind](current.current);
      if (snapshot) commit(snapshot, { history: false });
    },
    [commit],
  );

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeFilmDocuments(() => {
      const previous = current.current;
      if (!previous || writing.current) return;
      try {
        const next = loadFilmDocument(previous.id);
        // A quota-failed new document has never existed in storage; unrelated writes
        // must not reinterpret its missing key as an external deletion.
        if (!next && persisted.current === null) return;
        if (!next || next.deletedAt !== undefined) {
          blocked.current = new Error('项目已删除，已停止保存，当前草稿已保留');
          throw blocked.current;
        }
        const nextFingerprint = fingerprint(next);
        // Another project's notification, including a successful same-tab save, changes nothing.
        if (nextFingerprint === persisted.current) return;
        if (dirty.current) {
          blocked.current = new Error('另一页面已更新项目，请先导出当前草稿后重新打开');
          throw blocked.current;
        }
        current.current = next;
        persisted.current = nextFingerprint;
        blocked.current = null;
        setDocument(next);
        timeline.current.clear();
        setHistoryVersion((value) => value + 1);
        setSaved(true);
        setError(null);
      } catch (reason) {
        blocked.current = reason;
        setError(reason);
        setSaved(false);
      }
    });
    if (initial.isNew && !creationAttempted.current) {
      creationAttempted.current = true;
      persistCurrent();
    }
    const leave = (event) => {
      if (current.current && dirty.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      mounted.current = false;
      unsubscribe();
      window.removeEventListener('beforeunload', leave);
    };
  }, [initial.isNew, persistCurrent]);

  return {
    document,
    current,
    error,
    saved,
    commit,
    retrySave: persistCurrent,
    undo: () => restore('undo'),
    redo: () => restore('redo'),
    record: () => {
      if (!mounted.current || !current.current || blocked.current) return;
      timeline.current.record(current.current);
      setHistoryVersion((value) => value + 1);
    },
    canUndo: historyVersion >= 0 && timeline.current.past.length > 0,
    canRedo: timeline.current.future.length > 0,
  };
}
