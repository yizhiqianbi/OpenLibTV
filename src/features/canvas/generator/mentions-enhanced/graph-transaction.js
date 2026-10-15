import { validateCanvasMentionConnection } from './connection-validator.js';

/** Synchronous compare-and-swap boundary; never schedules an unverified edge for a later render. */
export function createGuardedMentionConnector({
  documentKey,
  getGraph,
  commitGraph,
  createEdgeId,
  localResourceActions = false,
  policy,
  policyRequired = false,
  onRejected,
}) {
  const reject = (reason) => {
    onRejected?.(reason);
    return false;
  };
  const usable = (graph) =>
    graph?.documentKey === documentKey &&
    graph.ready === true &&
    graph.readonly === false &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges);
  return (sourceId, targetId, { promptOverride } = {}) => {
    const graph = getGraph?.();
    if (!usable(graph)) return reject('documentUnavailable');
    const duplicate = graph.edges.some(
      (edge) => edge.source === sourceId && edge.target === targetId,
    );
    if (duplicate)
      return (
        graph.nodes.some((node) => node.id === sourceId) &&
        graph.nodes.some((node) => node.id === targetId)
      );
    const result = validateCanvasMentionConnection({
      ...graph,
      sourceId,
      targetId,
      localResourceActions,
      policy,
      policyRequired,
    });
    if (!result.allowed || !result.verified) return reject(result.reason);
    const id = createEdgeId?.();
    if (typeof id !== 'string' || !id || graph.edges.some((edge) => edge.id === id))
      return reject('invalidEdgeId');
    const edge = {
      id,
      source: sourceId,
      target: targetId,
      sourceHandle: 'source',
      targetHandle: 'target',
    };
    const nodes =
      typeof promptOverride === 'string'
        ? graph.nodes.map((node) =>
            node.id === targetId
              ? {
                  ...node,
                  data: { ...node.data, params: { ...node.data?.params, prompt: promptOverride } },
                }
              : node,
          )
        : graph.nodes;
    // An injected ID/policy callback may have changed the graph; CAS must also check this identity.
    const current = getGraph?.();
    if (
      !usable(current) ||
      current.nodes !== graph.nodes ||
      current.edges !== graph.edges ||
      current.models !== graph.models
    )
      return reject('staleGraph');
    if (
      commitGraph?.(
        { ...graph, nodes, edges: [...graph.edges, edge] },
        { expectedGraph: graph },
      ) !== true
    )
      return reject('commitRejected');
    const committed = getGraph?.();
    if (
      !usable(committed) ||
      !committed.edges.some(
        (item) => item.id === id && item.source === sourceId && item.target === targetId,
      )
    )
      return reject('commitNotSynchronous');
    return true;
  };
}
