import { collectVideoClipIncomingData } from '../clip-editor/domain/incoming-model.js';

export const SHOT_BREAKDOWN_DEFAULT_DIMENSIONS = ['storyboard', 'cameraMoves', 'musicRef'];

/** Source sK uses a nullish default: an explicit empty selection stays empty. */
export function getShotBreakdownDimensions(data) {
  return data?.dimensions ?? SHOT_BREAKDOWN_DEFAULT_DIMENSIONS;
}

/** Source sK reads the collector's first video, never a later ready fallback. */
export function collectShotBreakdownSource({ node, nodes, edges } = {}) {
  const first = collectVideoClipIncomingData({ node, nodes, edges }).videoList[0];
  if (!first?.url) return null;
  return {
    nodeId: first.nodeId,
    url: first.url,
    label: first.label,
    width: first.width,
    height: first.height,
    durationSec: first.durationSec,
  };
}

export function isShotBreakdownNode(node) {
  return node?.data?.type === 'shot-breakdown';
}

const invalidDescription = (reason) => ({
  valid: false,
  reason,
  target: null,
  pickableIds: new Set(),
  groupPickableIds: new Set(),
  connectedIds: new Set(),
  blockReasons: new Map(),
  states: new Map(),
  candidates: [],
  limitCount: null,
});

/** Module 450681's separate ShotBreakdown candidate branch. */
export function describeShotBreakdownReferencePick({ nodes, edges, targetNodeId } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return invalidDescription('invalid-graph');
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!isShotBreakdownNode(target)) return invalidDescription('invalid-target');
  const connectedIds = new Set(
    edges.filter((edge) => edge.target === targetNodeId).map((edge) => edge.source),
  );
  const pickableIds = new Set();
  const candidates = [];
  for (const node of nodes) {
    if (node.id === targetNodeId || connectedIds.has(node.id) || node.data?.type !== 'video')
      continue;
    const url = Array.isArray(node.data.url) ? node.data.url[0] : undefined;
    if (typeof url !== 'string' || !url || url.startsWith('blob:')) continue;
    pickableIds.add(node.id);
    candidates.push({ node, kind: 'video', connected: false });
  }
  return {
    valid: true,
    reason: '',
    target,
    pickableIds,
    groupPickableIds: new Set(),
    connectedIds,
    blockReasons: new Map(),
    states: new Map(
      nodes.map((node) => [
        node.id,
        node.id === targetNodeId
          ? 'self'
          : pickableIds.has(node.id)
            ? 'pickable'
            : connectedIds.has(node.id)
              ? 'connected'
              : 'blocked',
      ]),
    ),
    candidates,
    limitCount: null,
  };
}

/** Source node click replaces all incoming edges and exits selection mode. */
export function planShotBreakdownReferencePick({
  nodes,
  edges,
  targetNodeId,
  sourceId,
  surface = 'node',
  makeId,
} = {}) {
  const description = describeShotBreakdownReferencePick({ nodes, edges, targetNodeId });
  const unchanged = (reason) => ({
    valid: description.valid,
    changed: false,
    reason,
    nodes,
    edges,
    addedEdgeIds: [],
    removedEdgeIds: [],
    selectionChanges: [],
    warnings: [],
  });
  if (!description.valid) return unchanged(description.reason);
  if (surface !== 'node') return unchanged('single-node-only');
  if (!description.pickableIds.has(sourceId)) return unchanged('source-not-pickable');
  const id = makeId?.('edge');
  if (typeof id !== 'string' || !id || [...nodes, ...edges].some((item) => item.id === id))
    return { ...unchanged('invalid-edge-id'), valid: false };
  const removedEdgeIds = edges
    .filter((edge) => edge.target === targetNodeId)
    .map((edge) => edge.id);
  return {
    ...unchanged(''),
    changed: true,
    edges: [
      ...edges.filter((edge) => edge.target !== targetNodeId),
      {
        id,
        source: sourceId,
        sourceHandle: 'source',
        target: targetNodeId,
        targetHandle: 'target',
      },
    ],
    addedEdgeIds: [id],
    removedEdgeIds,
    exitAfterCommit: true,
  };
}
