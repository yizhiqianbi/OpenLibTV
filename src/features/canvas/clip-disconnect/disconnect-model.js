import { disconnectClipTimelineSource } from './timeline-model.js';

/** Source typeof semantics deliberately preserve NaN/Infinity behavior. */
export function isClipAgentEditingActive(editing, now) {
  return (
    editing?.state === 'running' &&
    (typeof editing.startedAtMs !== 'number' || now - editing.startedAtMs < 3_600_000)
  );
}

/** mD: ordered requested IDs, including duplicates, and target-unit patches. */
export function resolveCanvasClipDisconnect({
  nodes = [],
  edges = [],
  edgeIds = [],
  now = Date.now(),
} = {}) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(edges.map((edge) => [edge.id, edge]));
  const grouped = new Map(),
    passthroughEdgeIds = [],
    blockedEdgeIds = [];
  for (const id of edgeIds) {
    const edge = edgeMap.get(id);
    const source = nodeMap.get(edge?.source),
      target = nodeMap.get(edge?.target);
    const sourceType = source?.type ?? source?.data?.type;
    const targetType = target?.type ?? target?.data?.type;
    const kind = sourceType === 'video' ? 'video' : sourceType === 'audio' ? 'audio' : null;
    if (!edge || targetType !== 'video-clip' || kind === null || !target) {
      passthroughEdgeIds.push(id);
      continue;
    }
    if (isClipAgentEditingActive(target.data?.agentEditing, now)) {
      blockedEdgeIds.push(id);
      continue;
    }
    const transaction = grouped.get(edge.target) ?? {
      edgeIds: [],
      original: target.data?.clipTimelineData,
      next: target.data?.clipTimelineData,
    };
    transaction.edgeIds.push(id);
    if (transaction.next)
      transaction.next =
        disconnectClipTimelineSource(transaction.next, edge.source, kind) ?? transaction.next;
    grouped.set(edge.target, transaction);
  }
  return {
    passthroughEdgeIds,
    blockedEdgeIds,
    transactions: [...grouped].map(([targetNodeId, transaction]) => ({
      targetNodeId,
      edgeIds: transaction.edgeIds,
      ...(transaction.next !== transaction.original ? { timelineDataPatch: transaction.next } : {}),
    })),
  };
}
