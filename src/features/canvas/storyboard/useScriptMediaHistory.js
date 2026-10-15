import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { setActiveScriptMediaVersion } from './script-media-history-model.js';

const saveFailedText = '版本修改未保存，请重试';
const missingVersionText = '该版本已不存在，请重新打开历史';
const missingNodeText = '画布节点已不存在';
const scriptTypes = new Set(['script', 'script-v2', 'storyboard']);

/** History navigation and writes use the current document; graph commits belong to the caller. */
export function useScriptMediaHistory({
  node,
  documentKey,
  ready = true,
  readonly = false,
  disabled = false,
  getDocument,
  onChange,
  onJumpToNode,
  onBeforeJump,
  onBeforeSetActive,
}) {
  const identity = JSON.stringify([documentKey, node.id]);
  const owner = useRef(null);
  const lifecycle = useRef({ active: true, epoch: 0 });
  const operations = useRef(new Set());
  const serial = useRef(Promise.resolve());
  const [state, setState] = useState({ identity, pending: false, error: '' });
  owner.current = {
    identity,
    node,
    documentKey,
    ready,
    readonly,
    disabled,
    getDocument,
    onChange,
    onJumpToNode,
    onBeforeJump,
    onBeforeSetActive,
  };
  useLayoutEffect(() => {
    const ownedLifecycle = lifecycle.current;
    const ownedOperations = operations.current;
    ownedLifecycle.active = true;
    setState({ identity, pending: false, error: '' });
    return () => {
      ownedLifecycle.active = false;
      ownedLifecycle.epoch += 1;
      ownedOperations.forEach((operation) => operation.abort());
      ownedOperations.clear();
      serial.current = Promise.resolve();
    };
  }, [identity, ready, readonly, disabled]);

  const sameOwner = useCallback(
    (captured, abort) =>
      lifecycle.current.active &&
      lifecycle.current.epoch === captured.epoch &&
      owner.current.identity === captured.identity &&
      !abort?.signal.aborted,
    [],
  );
  const latest = useCallback(
    (captured, abort, writable = false) => {
      const current = owner.current;
      if (
        !sameOwner(captured, abort) ||
        !current.ready ||
        (writable && (current.disabled || current.readonly))
      )
        return null;
      const document = current.getDocument ? current.getDocument() : { nodes: [current.node] };
      if (
        !document ||
        document.ready === false ||
        (document.documentKey !== undefined && document.documentKey !== captured.documentKey) ||
        (writable && document.readonly)
      )
        return null;
      const script = document.nodes?.find((value) => value.id === captured.node.id);
      return script && scriptTypes.has(script.data?.type || script.type)
        ? { document, script, current }
        : null;
    },
    [sameOwner],
  );
  const enqueue = useCallback(
    (task) => {
      const captured = { ...owner.current, epoch: lifecycle.current.epoch };
      if (!latest(captured)) return Promise.resolve(false);
      const abort = new AbortController();
      operations.current.add(abort);
      setState({ identity: captured.identity, pending: true, error: '' });
      const run = async () => {
        try {
          if (!latest(captured, abort)) return false;
          setState((value) => ({ ...value, error: '' }));
          return await task(captured, abort);
        } catch (error) {
          if (sameOwner(captured, abort))
            setState((value) => ({
              ...value,
              identity: captured.identity,
              error: error.message || saveFailedText,
            }));
          return false;
        } finally {
          operations.current.delete(abort);
          if (sameOwner(captured, abort))
            setState((value) => ({ ...value, pending: operations.current.size > 0 }));
        }
      };
      const result = serial.current.then(run, run);
      serial.current = result.catch(() => {});
      return result;
    },
    [latest, sameOwner],
  );
  const setActive = useCallback(
    (rowId, kind, versionId) =>
      enqueue(async (captured, abort) => {
        let snapshot = latest(captured, abort, true);
        if (!snapshot || typeof snapshot.current.onChange !== 'function') return false;
        if ((await snapshot.current.onBeforeSetActive?.()) === false) return false;
        snapshot = latest(captured, abort, true);
        if (!snapshot || typeof snapshot.current.onChange !== 'function') return false;
        const rows = snapshot.script.data?.rows;
        const field =
          kind === 'image' ? 'imageVersions' : kind === 'video' ? 'videoVersions' : null;
        const row = Array.isArray(rows) ? rows.find((value) => value.id === rowId) : null;
        if (
          !field ||
          !Array.isArray(row?.[field]) ||
          !row[field].some((version) => version?.versionId === versionId)
        )
          throw new Error(missingVersionText);
        const next = setActiveScriptMediaVersion(
          rows,
          rowId,
          kind,
          versionId,
          snapshot.script.data?.assets,
        );
        if (next === rows) return true;
        // Read once more before handing the patch to the graph owner's CAS boundary.
        if (latest(captured, abort, true)?.script !== snapshot.script) return false;
        const result = await owner.current.onChange(
          { rows: next },
          {
            documentKey: captured.documentKey,
            nodeId: captured.node.id,
            expectedNode: snapshot.script,
            signal: abort.signal,
          },
        );
        if (!latest(captured, abort, true)) return false;
        if (result === false || result === null) throw new Error(saveFailedText);
        return true;
      }),
    [enqueue, latest],
  );
  const jump = useCallback(
    (nodeId) =>
      enqueue(async (captured, abort) => {
        let snapshot = latest(captured, abort);
        if (!snapshot || typeof snapshot.current.onJumpToNode !== 'function') return false;
        if (!nodeId || !snapshot.document.nodes?.some((value) => value.id === nodeId))
          throw new Error(missingNodeText);
        if ((await snapshot.current.onBeforeJump?.()) === false) return false;
        snapshot = latest(captured, abort);
        if (!snapshot) return false;
        if (!snapshot.document.nodes?.some((value) => value.id === nodeId))
          throw new Error(missingNodeText);
        const result = await snapshot.current.onJumpToNode(nodeId);
        return result !== false && Boolean(latest(captured, abort));
      }),
    [enqueue, latest],
  );
  return {
    setActive,
    jump,
    pending: state.identity === identity && state.pending,
    error: state.identity === identity ? state.error : '',
    identity,
  };
}
