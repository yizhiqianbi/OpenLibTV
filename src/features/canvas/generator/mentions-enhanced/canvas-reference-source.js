import {
  collectCanvasReferenceCandidates,
  presentCanvasReferenceCandidates,
} from './candidate-model.js';
import {
  getCanvasReferenceCapacity,
  validateCanvasMentionConnection,
} from './connection-validator.js';

/** Read-only source factory. The menu's lifecycle controller owns abort/retry; commit always revalidates. */
export function createCanvasMentionSource({
  documentKey,
  targetNodeId,
  getGraph,
  getOptions,
  preview,
  ignoredKinds,
  localResourceActions = false,
  policy,
  policyRequired = false,
}) {
  const usable = (graph) =>
    graph?.documentKey === documentKey &&
    graph.ready === true &&
    graph.readonly === false &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    graph.nodes.some((node) => node.id === targetNodeId);
  return {
    async load({ signal } = {}) {
      const graph = getGraph?.();
      if (!usable(graph)) throw new Error('画布尚未准备好，请稍后重试');
      const options = getOptions?.(graph, targetNodeId) || [];
      const collected = await collectCanvasReferenceCandidates({
        nodes: graph.nodes,
        edges: graph.edges,
        targetNodeId,
        signal,
        isStale: () => !usable(getGraph?.()),
        dependencies: {
          canAcceptMore: (target, kind) => {
            const capacity = getCanvasReferenceCapacity({ ...graph, targetId: target.id, kind });
            return capacity.verified ? capacity.allowed : undefined;
          },
          validate: (source, target) =>
            validateCanvasMentionConnection({
              ...graph,
              sourceId: source.id,
              targetId: target.id,
              localResourceActions,
              policy,
              policyRequired,
            }),
        },
      });
      if (!collected) throw new Error('引用素材请求已取消');
      return presentCanvasReferenceCandidates({
        collected,
        options,
        edges: graph.edges,
        targetNodeId,
        preview,
        ignoredKinds,
      });
    },
  };
}
