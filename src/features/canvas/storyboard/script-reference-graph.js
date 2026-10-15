import { resolveScriptV2Generator } from './script-generator-model.js';

/** Recompute the dedicated task references after an accepted graph edit. */
export function synchronizeScriptV2References(graph, targetId, support) {
  const target = graph.nodes.find((node) => node.id === targetId);
  if (!target) return graph;
  const projection = resolveScriptV2Generator({
    node: target,
    nodes: graph.nodes,
    edges: graph.edges,
    models: graph.models,
    support,
  });
  // A missing catalogue must never erase the saved model or its parameters.
  if (!projection.valid || !projection.initializationParams) return graph;
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node === target
        ? { ...node, data: { ...node.data, params: projection.initializationParams } }
        : node,
    ),
  };
}
