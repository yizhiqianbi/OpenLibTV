import { useLayoutEffect, useRef } from 'react';
import { patchCanvasStoredNodeData } from '../domain/node-data-update-model.js';
import { recalculateCanvasIncomingTarget } from '../generator/reference-recalculation-model.js';

const sameOwner = (value, owner) =>
  value?.storeInstanceId === owner.storeInstanceId &&
  value?.projectId === owner.projectId &&
  value?.projectGeneration === owner.projectGeneration;
const graphMatches = (value, expected) =>
  value?.nodes === expected?.nodes &&
  value?.edges === expected?.edges &&
  value?.models === expected?.models;

/**
 * Actual same-tab reference-counted leases for the anonymous local workspace.
 * Operation signals identify receipts, so a failed request's source-compatible
 * release cannot decrement another operation. The null receipt is the legacy
 * request/release/commit API without an operation signal.
 * This immutable port is neither server authentication nor a cloud lock bridge.
 * Ordinary render updates use live callbacks; capability/document epochs retire
 * the owner, so old release callbacks cannot decrement new-owner leases.
 */
export function useCanvasClipDisconnectPort(props) {
  const latest = useRef(props),
    instance = useRef(Object.freeze({ kind: 'local-clip-store' })),
    generation = useRef(0),
    ownerRef = useRef(null);
  latest.current = props;
  const previous = ownerRef.current;
  if (
    !previous ||
    previous.documentKey !== props.documentKey ||
    previous.ready !== props.ready ||
    previous.readonly !== props.readonly
  ) {
    if (previous) {
      previous.active = false;
      previous.leases.clear();
      previous.receipts.clear();
    }
    const token = {
      documentKey: props.documentKey,
      ready: props.ready,
      readonly: props.readonly,
      generation: ++generation.current,
      active: false,
      leases: new Map(),
      receipts: new Map(),
      port: null,
    };
    const owner = () => ({
      storeInstanceId: instance.current,
      projectId: token.documentKey,
      projectGeneration: token.generation,
    });
    const rawDocument = () => {
      if (
        !token.active ||
        ownerRef.current !== token ||
        latest.current.documentKey !== token.documentKey ||
        latest.current.ready !== true ||
        latest.current.readonly !== false
      )
        return null;
      try {
        const document = latest.current.getDocument?.();
        return document?.documentKey === token.documentKey &&
          document.ready === true &&
          document.readonly === false &&
          Array.isArray(document.nodes) &&
          Array.isArray(document.edges)
          ? document
          : null;
      } catch {
        return null;
      }
    };
    const owns = (value) => sameOwner(value, owner()) && !!rawDocument();
    token.port = Object.freeze({
      mode: 'local-workspace',
      getDocument() {
        const document = rawDocument();
        return document ? { ...document, ...owner() } : null;
      },
      requestLocks(nodeId, { owner: requestedOwner, signal, timeoutMs = 3000 } = {}) {
        const started = Date.now();
        const captured = owner();
        // No fake remote holder or queue: local permission settles next turn.
        return Promise.resolve().then(() => {
          if (signal?.aborted || !sameOwner(captured, owner()) || !owns(requestedOwner))
            return { ok: false, reason: 'aborted', nodeId };
          if (
            typeof timeoutMs !== 'number' ||
            !Number.isFinite(timeoutMs) ||
            Date.now() - started >= timeoutMs
          )
            return { ok: false, reason: 'timeout', nodeId };
          const document = rawDocument();
          if (
            typeof nodeId !== 'string' ||
            !nodeId.trim() ||
            !document?.nodes.some((node) => node.id === nodeId)
          )
            return { ok: false, reason: 'aborted', nodeId };
          token.leases.set(nodeId, (token.leases.get(nodeId) ?? 0) + 1);
          const key = signal ?? null;
          const receipt = token.receipts.get(key) ?? new Map();
          receipt.set(nodeId, (receipt.get(nodeId) ?? 0) + 1);
          token.receipts.set(key, receipt);
          return { ok: true, nodeId };
        });
      },
      releaseLocks(nodeId, { owner: releasedOwner, signal } = {}) {
        if (!token.active || ownerRef.current !== token || !sameOwner(releasedOwner, owner()))
          return false;
        const key = signal ?? null;
        const receipt = token.receipts.get(key);
        const count = receipt?.get(nodeId) ?? 0;
        if (!count) return false;
        if (count === 1) receipt.delete(nodeId);
        else receipt.set(nodeId, count - 1);
        if (!receipt.size) token.receipts.delete(key);
        const total = token.leases.get(nodeId);
        if (total === 1) token.leases.delete(nodeId);
        else token.leases.set(nodeId, total - 1);
        return true;
      },
      commitTransaction({
        transactions = [],
        nodeDataPatches = [],
        deleteEdgeIds = [],
        expectedDocument,
        owner: requestedOwner,
        signal,
        beforeApply,
      } = {}) {
        const graph = rawDocument();
        const api = latest.current.graphActions;
        if (
          !graph ||
          signal?.aborted ||
          !owns(requestedOwner) ||
          !sameOwner(expectedDocument, owner()) ||
          !graphMatches(graph, expectedDocument) ||
          !Array.isArray(transactions) ||
          !Array.isArray(nodeDataPatches) ||
          !Array.isArray(deleteEdgeIds) ||
          !transactions.every((transaction) => transaction && Array.isArray(transaction.edgeIds)) ||
          typeof api?.captureDeletionSnapshot !== 'function' ||
          typeof api?.commitGraph !== 'function' ||
          typeof latest.current.history?.createWriter !== 'function'
        )
          return false;
        const byEdgeId = new Map(graph.edges.map((edge) => [edge.id, edge]));
        const byNodeId = new Map(graph.nodes.map((node) => [node.id, node]));
        const plannedIds = transactions.flatMap((transaction) => transaction.edgeIds);
        const targetIds = new Set(transactions.map((transaction) => transaction.targetNodeId));
        const leased = (id) => (token.receipts.get(signal ?? null)?.get(id) ?? 0) > 0;
        if (
          !deleteEdgeIds.length ||
          targetIds.size !== transactions.length ||
          plannedIds.length !== deleteEdgeIds.length ||
          plannedIds.some((id, index) => id !== deleteEdgeIds[index]) ||
          !transactions.every(
            (transaction) =>
              transaction.edgeIds.length > 0 &&
              byNodeId.has(transaction.targetNodeId) &&
              leased(transaction.targetNodeId) &&
              transaction.edgeIds.every((id) => {
                const edge = byEdgeId.get(id);
                return (
                  edge &&
                  edge.target === transaction.targetNodeId &&
                  leased(edge.source) &&
                  leased(edge.target)
                );
              }),
          ) ||
          !nodeDataPatches.every(
            (patch) =>
              targetIds.has(patch.nodeId) &&
              patch.data &&
              Object.keys(patch.data).length === 1 &&
              Object.hasOwn(patch.data, 'clipTimelineData'),
          )
        )
          return false;

        // Read-only latest draft projection precedes ig. Otherwise an explicit
        // remapped prompt would cause commitGraph to skip the pending input.
        const source = api.captureDeletionSnapshot();
        const fresh = rawDocument();
        if (!source || !owns(requestedOwner) || !graphMatches(fresh, graph)) return false;
        const patches = new Map();
        for (const patch of nodeDataPatches)
          patches.set(patch.nodeId, { ...(patches.get(patch.nodeId) ?? {}), ...patch.data });
        let nodes = source.nodes.map((node) =>
          patches.has(node.id) ? patchCanvasStoredNodeData(node, patches.get(node.id)) : node,
        );
        const removing = new Set(deleteEdgeIds);
        const edges = source.edges.filter((edge) => !removing.has(edge.id));
        const changedTargets = [...new Set(deleteEdgeIds.map((id) => byEdgeId.get(id).target))];
        const explicitPromptNodeIds = [];
        for (const id of changedTargets) {
          const target = nodes.find((node) => node.id === id);
          const next = recalculateCanvasIncomingTarget({ nodes, edges, target });
          if (target?.data?.params?.prompt !== next?.data?.params?.prompt)
            explicitPromptNodeIds.push(id);
          nodes = nodes.map((node) => (node.id === id ? next : node));
        }
        if (!owns(requestedOwner) || !graphMatches(rawDocument(), graph)) return false;
        return (
          api.commitGraph(
            { ...graph, nodes, edges },
            {
              expectedGraph: graph,
              explicitPromptNodeIds,
              consumePromptDrafts: true,
              historyWriter(projectedBefore, committedGraph) {
                // Local capture happens only after GraphActions accepts CAS, unlike
                // source patchGraph's beforeApply-before-mutation callback timing.
                if (!owns(requestedOwner)) throw new Error('Clip history owner retired');
                const history = latest.current.history;
                if (typeof beforeApply === 'function') {
                  if (beforeApply(projectedBefore) === false)
                    throw new Error('Clip history capture rejected');
                } else if (history.capture?.(projectedBefore) === false)
                  throw new Error('Clip history capture rejected');
                if (!owns(requestedOwner)) throw new Error('Clip history owner retired');
                history.createWriter()(projectedBefore, committedGraph);
              },
            },
          ) === true
        );
      },
    });
    ownerRef.current = token;
  }
  const token = ownerRef.current;
  useLayoutEffect(() => {
    const counter = generation;
    token.generation = ++counter.current;
    token.active = true;
    return () => {
      token.active = false;
      token.generation = ++counter.current;
      token.leases.clear();
      token.receipts.clear();
    };
  }, [token]);
  return token.port;
}
