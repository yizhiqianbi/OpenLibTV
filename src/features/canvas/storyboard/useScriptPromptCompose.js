import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  applyScriptPromptEdit,
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
  planScriptPromptCompose,
  reconcileScriptPromptRefsForTextEdit,
  withScriptPromptState,
} from './prompt-compose-model.js';

const tracksFor = (tracks = ['image', 'video']) =>
  [...new Set(tracks)].filter((track) => track === 'image' || track === 'video');
const modeFor = (mode) => (mode === 'concat' ? 'concat' : 'smart');
const conflictText = '内容已在其他位置更新，请重新打开后编辑';
const saveFailedText = '保存失败，请重试';

/** ScriptV2 prompt workspace: latest-document reads and caller-owned graph CAS writes. */
export function useScriptPromptCompose({
  node,
  documentKey,
  ready = true,
  readonly = false,
  disabled = false,
  fullGenerationBusy = false,
  getDocument,
  onChange,
  registerDraft,
}) {
  const identity = JSON.stringify([documentKey, node.id]);
  const owner = useRef(null);
  const active = useRef(true);
  const operations = useRef(new Set());
  const serial = useRef(Promise.resolve());
  const composeRunning = useRef(false);
  const flushers = useRef(new Map());
  const promptDrafts = useRef(new Map());
  const confirmation = useRef(null);
  const undoRef = useRef(null);
  const undoTimer = useRef(null);
  const [state, setState] = useState({ identity, pending: false, error: '', notice: '' });
  owner.current = {
    identity,
    node,
    documentKey,
    ready,
    readonly,
    disabled,
    fullGenerationBusy,
    getDocument,
    onChange,
  };
  const sameOwner = useCallback(
    (captured) => active.current && owner.current.identity === captured.identity,
    [],
  );
  const allowed = useCallback(
    (current = owner.current) =>
      active.current &&
      current.ready &&
      !current.readonly &&
      !current.disabled &&
      !current.fullGenerationBusy &&
      typeof current.onChange === 'function',
    [],
  );
  const update = useCallback(
    (captured, patch) => {
      if (sameOwner(captured))
        setState((value) => ({ ...value, identity: captured.identity, ...patch }));
    },
    [sameOwner],
  );
  const latestNode = useCallback(
    (captured = owner.current) => {
      if (!sameOwner(captured)) return null;
      const current = owner.current;
      if (!current.getDocument) return current.node;
      const document = current.getDocument();
      if (
        !document ||
        document.ready === false ||
        (document.documentKey !== undefined && document.documentKey !== captured.documentKey)
      )
        return null;
      return document.nodes?.find((value) => value.id === captured.node.id) ?? null;
    },
    [sameOwner],
  );
  const clearUndo = useCallback(() => {
    clearTimeout(undoTimer.current);
    undoRef.current = null;
    undoTimer.current = null;
  }, []);
  const reset = useCallback(() => {
    operations.current.forEach((operation) => operation.abort());
    confirmation.current?.resolve(false);
    confirmation.current = null;
    clearUndo();
  }, [clearUndo]);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      reset();
    };
  }, [reset]);
  useLayoutEffect(() => {
    if (state.identity !== identity) {
      reset();
      flushers.current.clear();
      setState({ identity, pending: false, error: '', notice: '' });
    } else if (!ready || readonly || disabled || fullGenerationBusy) {
      reset();
      setState((value) => ({ ...value, pending: false, confirmRequest: null, canUndo: false }));
    }
  }, [identity, ready, readonly, disabled, fullGenerationBusy, state.identity, reset]);
  const registerPromptDraft = useCallback((key, read, draftIdentity = owner.current.identity) => {
    const entry = { read, identity: draftIdentity };
    promptDrafts.current.set(key, entry);
    return () => {
      if (promptDrafts.current.get(key) === entry) promptDrafts.current.delete(key);
    };
  }, []);
  const snapshot = useCallback((captured = owner.current) => {
    const current = owner.current.identity === captured.identity ? owner.current : captured;
    return {
      writable:
        current.ready && !current.readonly && !current.disabled && !current.fullGenerationBusy,
      scriptPrompts: [...promptDrafts.current.values()]
        .filter((entry) => entry.identity === captured.identity)
        .map((entry) => entry.read())
        .filter((draft) => draft?.dirty),
    };
  }, []);
  useLayoutEffect(() => {
    const captured = owner.current;
    return registerDraft?.(documentKey, node.id, () => snapshot(captured));
  }, [registerDraft, documentKey, node.id, identity, snapshot]);
  const enqueue = useCallback((task) => {
    const result = serial.current.then(task, task);
    serial.current = result.catch(() => {});
    return result;
  }, []);
  const write = useCallback(
    async (captured, expectedNode, patch) => {
      if (!sameOwner(captured) || !allowed() || latestNode(captured) !== expectedNode) return false;
      if (owner.current.getDocument?.()?.readonly) return false;
      const abort = new AbortController();
      operations.current.add(abort);
      try {
        const result = await owner.current.onChange(patch, {
          nodeId: captured.node.id,
          expectedNode,
          documentKey: captured.documentKey,
          signal: abort.signal,
        });
        return result !== false && !abort.signal.aborted && sameOwner(captured);
      } finally {
        operations.current.delete(abort);
      }
    },
    [allowed, latestNode, sameOwner],
  );
  const registerDraftFlusher = useCallback((key, flush) => {
    flushers.current.set(key, flush);
    return () => {
      if (flushers.current.get(key) === flush) flushers.current.delete(key);
    };
  }, []);
  const flushAll = useCallback(async () => {
    const results = await Promise.all([...flushers.current.values()].map((flush) => flush()));
    return results.every((result) => result?.status === 'saved');
  }, []);
  const commitPrompt = useCallback(
    (request) => {
      const captured = owner.current;
      return enqueue(async () => {
        if (
          (request.identity && request.identity !== captured.identity) ||
          !sameOwner(captured) ||
          !allowed()
        )
          return { status: 'missing' };
        const current = latestNode(captured);
        const rows = current?.data?.rows ?? [];
        const row = rows.find((value) => value.id === request.rowId);
        if (!row) return { status: 'missing' };
        const before = getScriptPromptBundle(row, request.track);
        if (fingerprintScriptPromptBundle(before) !== request.expectedFingerprint)
          return { status: 'conflict' };
        const bundle = {
          text: request.text,
          entityRefs: reconcileScriptPromptRefsForTextEdit({
            oldText: before.text,
            newText: request.text,
            oldRefs: before.entityRefs,
            assets: current.data.assets,
          }),
        };
        const nextRow = applyScriptPromptEdit(row, request.track, bundle);
        try {
          if (
            !(await write(captured, current, {
              rows: rows.map((value) => (value === row ? nextRow : value)),
            }))
          )
            return { status: 'error' };
          clearUndo();
          update(captured, { canUndo: false, error: '' });
          return { status: 'saved', contentFingerprint: fingerprintScriptPromptBundle(bundle) };
        } catch {
          return { status: 'error' };
        }
      });
    },
    [enqueue, sameOwner, allowed, latestNode, write, clearUndo, update],
  );
  const persistMode = useCallback(
    (kind, value) => {
      const captured = owner.current;
      return enqueue(async () => {
        if (!sameOwner(captured) || !allowed()) return false;
        const current = latestNode(captured);
        if (!current) return false;
        const mode = modeFor(value);
        const patch =
          kind === 'batch'
            ? { batchPromptComposeMode: mode, singlePromptComposeMode: mode }
            : { singlePromptComposeMode: mode };
        try {
          if (!(await write(captured, current, patch))) throw new Error(saveFailedText);
          update(captured, { error: '' });
          return true;
        } catch {
          update(captured, { error: saveFailedText });
          return false;
        }
      });
    },
    [enqueue, sameOwner, allowed, latestNode, write, update],
  );
  const askOverwrite = useCallback(
    (captured, request) =>
      new Promise((resolve) => {
        if (!request.trackCount) return resolve(true);
        confirmation.current = { resolve, identity: captured.identity };
        update(captured, { confirmRequest: request });
      }),
    [update],
  );
  const settleOverwrite = useCallback((answer) => {
    const request = confirmation.current;
    confirmation.current = null;
    if (request && owner.current.identity === request.identity) {
      setState((value) => ({ ...value, confirmRequest: null }));
      request.resolve(answer);
    }
  }, []);
  const rememberUndo = useCallback(
    (captured, entries) => {
      clearUndo();
      update(captured, { canUndo: false, undoRowIds: [] });
      if (!entries.length || !sameOwner(captured)) return;
      undoRef.current = { identity: captured.identity, entries, expiresAt: Date.now() + 20000 };
      update(captured, {
        canUndo: true,
        undoRowIds: [...new Set(entries.map((entry) => entry.rowId))],
      });
      undoTimer.current = setTimeout(() => {
        clearUndo();
        update(captured, { canUndo: false });
      }, 20000);
    },
    [clearUndo, sameOwner, update],
  );
  const composeLocally = useCallback(
    async ({ rowIds, tracks }) => {
      const captured = owner.current;
      if (!allowed() || composeRunning.current) return { status: 'blocked' };
      const targetTracks = tracksFor(tracks);
      const selected = new Set(rowIds);
      const rows = latestNode(captured)?.data?.rows ?? [];
      const before = rows
        .filter((row) => selected.has(row.id))
        .map((row) => ({
          rowId: row.id,
          fingerprints: Object.fromEntries(
            targetTracks.map((track) => [
              track,
              fingerprintScriptPromptBundle(getScriptPromptBundle(row, track)),
            ]),
          ),
        }));
      let shotCount = 0,
        trackCount = 0;
      for (const row of rows.filter((value) => selected.has(value.id))) {
        const count = targetTracks.filter((track) =>
          getScriptPromptBundle(row, track).text.trim(),
        ).length;
        trackCount += count;
        if (count) shotCount += 1;
      }
      composeRunning.current = true;
      update(captured, { pending: true, error: '', notice: '' });
      try {
        if (!(await askOverwrite(captured, { shotCount, trackCount })))
          return { status: 'cancelled' };
        let successful = 0,
          skipped = 0,
          failed = 0;
        const undoEntries = [];
        for (const entry of before) {
          if (!sameOwner(captured) || !allowed()) return { status: 'cancelled' };
          await enqueue(async () => {
            const current = latestNode(captured);
            const currentRows = current?.data?.rows ?? [];
            const plan = planScriptPromptCompose({
              rows: currentRows,
              assets: current?.data?.assets,
              visualStyle: current?.data?.styleDescription,
              request: {
                rowIds: [entry.rowId],
                tracks: targetTracks,
                bundleFingerprints: { [entry.rowId]: entry.fingerprints },
              },
            });
            if (!plan.successful) {
              skipped += plan.skipped;
              failed += plan.failed;
              return;
            }
            try {
              if (!(await write(captured, current, { rows: plan.rows })))
                throw new Error(saveFailedText);
              successful += 1;
              undoEntries.push(...plan.undoEntries);
            } catch {
              failed += 1;
            }
          });
        }
        if (!sameOwner(captured)) return { status: 'cancelled' };
        const result = {
          status: successful ? 'applied' : failed ? 'failed' : 'empty',
          successful,
          skipped,
          failed,
        };
        if (successful > 0) rememberUndo(captured, undoEntries);
        update(captured, {
          notice: `自动拼接完成：成功 ${successful} 镜，跳过 ${skipped} 镜，失败 ${failed} 镜`,
          error: result.status === 'failed' ? '自动拼接失败，请重试' : '',
        });
        return result;
      } finally {
        composeRunning.current = false;
        update(captured, { pending: false, confirmRequest: null });
      }
    },
    [allowed, latestNode, update, askOverwrite, sameOwner, enqueue, write, rememberUndo],
  );
  const undo = useCallback(() => {
    const captured = owner.current;
    return enqueue(async () => {
      const cached = undoRef.current;
      if (
        !allowed() ||
        !cached ||
        cached.identity !== captured.identity ||
        cached.expiresAt <= Date.now()
      )
        return { status: 'missing' };
      const current = latestNode(captured);
      let rows = current?.data?.rows ?? [];
      if (
        cached.entries.some((entry) => {
          const row = rows.find((value) => value.id === entry.rowId);
          return (
            !row ||
            fingerprintScriptPromptBundle(getScriptPromptBundle(row, entry.track)) !==
              entry.afterFingerprint
          );
        })
      ) {
        clearUndo();
        update(captured, { canUndo: false, error: conflictText });
        return { status: 'conflict' };
      }
      for (const entry of cached.entries)
        rows = rows.map((row) =>
          row.id === entry.rowId
            ? withScriptPromptState(
                applyScriptPromptEdit(row, entry.track, entry.beforeBundle),
                entry.track,
                entry.beforeState,
              )
            : row,
        );
      try {
        if (!(await write(captured, current, { rows }))) throw new Error(saveFailedText);
        clearUndo();
        update(captured, { canUndo: false, error: '', notice: '已撤销替换' });
        return { status: 'applied' };
      } catch {
        update(captured, { error: saveFailedText });
        return { status: 'failed' };
      }
    });
  }, [enqueue, allowed, latestNode, clearUndo, update, write]);
  const composeSmart = useCallback(async () => {
    if (!allowed()) return { status: 'blocked' };
    update(owner.current, { error: '智能合成服务尚未连接，未提交生成任务', notice: '' });
    return { status: 'blocked' };
  }, [allowed, update]);
  const visible = state.identity === identity ? state : {};
  return {
    ...visible,
    identity,
    latestNode,
    registerDraftFlusher,
    registerPromptDraft,
    snapshot,
    flushAll,
    commitPrompt,
    composeLocally,
    composeSmart,
    undo,
    singleMode: modeFor(node.data?.singlePromptComposeMode),
    batchMode: modeFor(node.data?.batchPromptComposeMode),
    setSingleMode: (value) => persistMode('single', value),
    setBatchMode: (value) => persistMode('batch', value),
    confirmOverwrite: () => settleOverwrite(true),
    cancelOverwrite: () => settleOverwrite(false),
    disabled: !allowed(),
    pending: Boolean(visible.pending),
    canUndo: Boolean(visible.canUndo),
  };
}
