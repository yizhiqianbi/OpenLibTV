import { resolveCanvasClipDisconnect } from './disconnect-model.js';
import {
  CLIP_DISCONNECT_BUSY,
  CLIP_DISCONNECT_FAILED,
  CLIP_DISCONNECT_UNAVAILABLE,
  clipDisconnectFeedback,
} from './feedback-model.js';

export const unavailableCanvasClipDisconnectPort = Object.freeze({ mode: 'unavailable' });
const initialState = Object.freeze({ pending: false, operations: [], lastResult: null });

function ownerOf(document) {
  if (
    !document ||
    ['storeInstanceId', 'projectId', 'projectGeneration'].some((key) => document[key] === undefined)
  )
    return null;
  return {
    storeInstanceId: document.storeInstanceId,
    projectId: document.projectId,
    projectGeneration: document.projectGeneration,
  };
}
function sameOwner(document, owner) {
  return document && owner && Object.keys(owner).every((key) => document[key] === owner[key]);
}
function availablePort(port) {
  return (
    ['local-workspace', 'collaboration'].includes(port?.mode) &&
    ['getDocument', 'requestLocks', 'releaseLocks', 'commitTransaction'].every(
      (key) => typeof port[key] === 'function',
    )
  );
}

/**
 * An injectable front-end controller, not a cloud lock implementation.
 * commitTransaction is synchronous and owns authorization/CAS, latest drafts,
 * persistence and history; it alone invokes beforeApply after its preflight.
 * Epoch/capability-mode retirement, abort, timeout and protected releases are
 * local maintenance guards beyond the original callback's ownership checks.
 */
export function createCanvasClipDisconnectController({ getOptions }) {
  let active = true,
    epoch = 0,
    sequence = 0,
    lastStarted = 0,
    state = initialState;
  const operations = new Map(),
    listeners = new Set();
  const publish = (lastResult = state.lastResult) => {
    state = Object.freeze({
      pending: operations.size > 0,
      operations: [...operations.keys()],
      lastResult,
    });
    for (const listener of listeners) listener();
  };
  const read = () => {
    try {
      const options = getOptions();
      const port = options.port ?? unavailableCanvasClipDisconnectPort;
      const document = port.getDocument?.() ?? options.getDocument?.();
      const capable =
        active &&
        options.ready === true &&
        !options.readonly &&
        document &&
        document.ready !== false &&
        !document.readonly &&
        (document.documentKey === undefined || document.documentKey === options.documentKey);
      return { options, port, document, capable };
    } catch {
      return {
        options: {},
        port: unavailableCanvasClipDisconnectPort,
        document: null,
        capable: false,
      };
    }
  };
  const notify = (options, message) => {
    try {
      options.notify?.(message);
    } catch {
      /* Feedback cannot acquire graph ownership. */
    }
  };
  const release = async (request, operation) => {
    if (!request.settled || request.released) return;
    request.released = true;
    try {
      await operation.port.releaseLocks(request.nodeId, {
        owner: operation.owner,
        signal: operation.abort.signal,
      });
    } catch {
      operation.releaseFailures.push(request.nodeId);
    }
  };
  const acquire = (nodeId, operation) => {
    const request = { nodeId, settled: false, released: false };
    operation.requests.push(request);
    return new Promise((resolve) => {
      let resolved = false;
      const finish = (result) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        operation.abort.signal.removeEventListener('abort', onAbort);
        resolve({ nodeId, result });
      };
      const onAbort = () => finish({ ok: false, reason: 'aborted' });
      const timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), 3000);
      operation.abort.signal.addEventListener('abort', onAbort, { once: true });
      const settle = (result) => {
        request.settled = true;
        finish(
          result?.ok === true || result?.ok === false ? result : { ok: false, reason: 'aborted' },
        );
        if (operation.finished) void release(request, operation);
      };
      try {
        const pending = operation.port.requestLocks(nodeId, {
          timeoutMs: 3000,
          signal: operation.abort.signal,
          owner: operation.owner,
        });
        Promise.resolve(pending).then(settle, () => settle({ ok: false, reason: 'aborted' }));
      } catch {
        settle({ ok: false, reason: 'aborted' });
      }
      if (operation.abort.signal.aborted) onAbort();
    });
  };

  async function disconnect(edgeIds) {
    const start = read();
    const ids = [...edgeIds];
    const empty = { deletedEdgeIds: [], acceptedTargetIds: [], blockedEdgeIds: [], failures: [] };
    if (!start.capable) {
      if (
        active &&
        start.options.ready === true &&
        !start.options.readonly &&
        start.port.mode === 'unavailable' &&
        !start.document
      ) {
        notify(start.options, CLIP_DISCONNECT_UNAVAILABLE);
        return { ...empty, status: 'unavailable', unavailableEdgeIds: ids };
      }
      return { ...empty, status: 'retired' };
    }
    const initial = resolveCanvasClipDisconnect({
      ...start.document,
      edgeIds: ids,
      now: start.options.now?.() ?? Date.now(),
    });
    if (!availablePort(start.port)) {
      if (initial.transactions.length) notify(start.options, CLIP_DISCONNECT_UNAVAILABLE);
      if (initial.blockedEdgeIds.length) notify(start.options, CLIP_DISCONNECT_BUSY);
      const result = {
        ...empty,
        status: initial.transactions.length
          ? 'unavailable'
          : initial.blockedEdgeIds.length
            ? 'blocked'
            : 'noop',
        blockedEdgeIds: initial.blockedEdgeIds,
        unavailableEdgeIds: initial.transactions.flatMap((transaction) => transaction.edgeIds),
      };
      publish(result);
      return result;
    }
    const owner = ownerOf(start.document);
    if (!owner) return { ...empty, status: 'retired' };
    const byId = new Map(start.document.edges.map((edge) => [edge.id, edge]));
    const requestedNodeIds = [
      ...new Set(
        ids.flatMap((id) => {
          const edge = byId.get(id);
          return edge ? [edge.source, edge.target] : [];
        }),
      ),
    ];
    if (!requestedNodeIds.length) return { ...empty, status: 'noop' };
    const operation = {
      id: ++sequence,
      epoch,
      port: start.port,
      mode: start.port.mode,
      owner,
      abort: new AbortController(),
      requests: [],
      releaseFailures: [],
      finished: false,
      cancelled: false,
    };
    lastStarted = operation.id;
    operations.set(operation.id, operation);
    publish();
    let result = { ...empty, status: 'retired' };
    try {
      const responses = await Promise.all(requestedNodeIds.map((id) => acquire(id, operation)));
      const current = read();
      if (operation.cancelled || operation.abort.signal.aborted)
        return (result = { ...empty, status: 'cancelled' });
      if (
        operation.epoch !== epoch ||
        !current.capable ||
        current.port !== operation.port ||
        current.port.mode !== operation.mode ||
        !availablePort(current.port) ||
        !sameOwner(current.document, owner)
      )
        return result;
      const approved = new Set(
        responses
          .filter(({ result }) => result.ok || result.reason === 'no_api')
          .map(({ nodeId }) => nodeId),
      );
      const failures = responses
        .filter(({ result }) => !result.ok && result.reason !== 'no_api')
        .map(({ nodeId, result }) => ({ nodeId, reason: result.reason }));
      const fresh = resolveCanvasClipDisconnect({
        ...current.document,
        edgeIds: ids,
        now: current.options.now?.() ?? Date.now(),
      });
      const freshEdges = new Map(current.document.edges.map((edge) => [edge.id, edge]));
      const accepted = fresh.transactions.filter(
        (transaction) =>
          approved.has(transaction.targetNodeId) &&
          transaction.edgeIds.every((id) => {
            const edge = freshEdges.get(id);
            return edge && approved.has(edge.source) && approved.has(edge.target);
          }),
      );
      const deleteEdgeIds = accepted.flatMap((transaction) => transaction.edgeIds);
      let applied = false;
      if (deleteEdgeIds.length) {
        try {
          applied =
            current.port.commitTransaction({
              transactions: accepted,
              nodeDataPatches: accepted.flatMap((transaction) =>
                transaction.timelineDataPatch
                  ? [
                      {
                        nodeId: transaction.targetNodeId,
                        data: { clipTimelineData: transaction.timelineDataPatch },
                      },
                    ]
                  : [],
              ),
              deleteEdgeIds,
              expectedDocument: current.document,
              owner,
              signal: operation.abort.signal,
              beforeApply: current.options.beforeApply,
            }) === true;
          if (!applied)
            failures.push(
              ...accepted.map((transaction) => ({
                nodeId: transaction.targetNodeId,
                reason: 'denied',
              })),
            );
        } catch {
          failures.push(
            ...accepted.map((transaction) => ({
              nodeId: transaction.targetNodeId,
              reason: 'commit_failed',
            })),
          );
        }
      }
      result = {
        status: applied
          ? accepted.length < fresh.transactions.length ||
            fresh.blockedEdgeIds.length ||
            failures.length
            ? 'partial'
            : 'applied'
          : failures.length
            ? 'failed'
            : fresh.blockedEdgeIds.length
              ? 'blocked'
              : 'noop',
        deletedEdgeIds: applied ? deleteEdgeIds : [],
        acceptedTargetIds: applied ? accepted.map((transaction) => transaction.targetNodeId) : [],
        blockedEdgeIds: fresh.blockedEdgeIds,
        failures,
      };
      // A writer may synchronously retire this owner. Its result is real, but
      // feedback must not select nodes or notify in the replacement document.
      const after = read();
      if (
        operation.epoch === epoch &&
        after.capable &&
        after.port === operation.port &&
        after.port.mode === operation.mode &&
        availablePort(after.port) &&
        sameOwner(after.document, owner)
      ) {
        if (fresh.blockedEdgeIds.length) notify(after.options, CLIP_DISCONNECT_BUSY);
        const feedback = clipDisconnectFeedback(failures);
        for (const message of feedback.messages) notify(after.options, message);
        if (failures.some((failure) => failure.reason === 'commit_failed'))
          notify(after.options, CLIP_DISCONNECT_FAILED);
        if (feedback.selectedNodeIds.length) {
          try {
            after.options.selectNodes?.(feedback.selectedNodeIds);
          } catch {
            /* The accepted graph transaction remains authoritative. */
          }
        }
      }
      return result;
    } finally {
      operation.finished = true;
      await Promise.all(operation.requests.map((request) => release(request, operation)));
      operations.delete(operation.id);
      if (operation.epoch === epoch && active)
        publish(
          operation.id === lastStarted
            ? { ...result, releaseFailures: [...operation.releaseFailures] }
            : state.lastResult,
        );
    }
  }

  return {
    disconnect,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activate() {
      active = true;
      epoch += 1;
      publish(null);
    },
    retire() {
      active = false;
      epoch += 1;
      for (const operation of operations.values()) {
        operation.cancelled = true;
        operation.abort.abort();
      }
      operations.clear();
      publish(null);
    },
    cancel(id) {
      const operation = operations.get(id);
      if (!operation) return false;
      operation.cancelled = true;
      operation.abort.abort();
      return true;
    },
  };
}
