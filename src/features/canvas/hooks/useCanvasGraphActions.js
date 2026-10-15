import { useEffect, useRef } from 'react';
import { createLocalId } from '../../editor/model.js';
import { createGuardedMentionConnector } from '../generator/mentions-enhanced/graph-transaction.js';
import {
  removeGeneratorReference,
  resolveGeneratorReferenceRemoval,
  reorderGeneratorReferences,
  usesMixedGeneratorReferences,
} from '../generator/reference-actions-model.js';
import { resolveNodeGenerator } from '../generator/node-generator.js';
import { patchCanvasMagicPrompt } from '../generator/magic-metadata-model.js';
import { generatorReferenceLists } from '../generator/reference-lists.js';
import { planScriptAssetMutation } from '../storyboard/script-assets-model.js';
import {
  planPromptAssetReferences,
  evaluatePromptAssetSelection,
  promptAssetPickerCapacity,
} from '../generator/mentions-enhanced/asset-reference-model.js';
import {
  resolveCanvasConnection,
  resolveCanvasConnectedCreation,
} from '../domain/connection-model.js';
import {
  resolveCanvasMultiConnection,
  resolveCanvasMultiConnectedCreation,
} from '../domain/multi-connection-model.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';
import {
  planCanvasSelectionDragCopy,
  planCanvasSingleNodeDragCopy,
} from '../domain/selection-copy-model.js';
import {
  planCanvasNodeDeletion,
  planCanvasEdgeDeletion,
  canvasEditingSegmentTargetForEdge,
} from '../domain/destructive-delete-model.js';
import {
  canvasStoryboardEdgeRequiresConfirmation,
  planCanvasStoryboardUnlinks,
} from '../domain/storyboard-unlink-model.js';

/** All multi-part graph edits share one synchronous CAS and one undo snapshot. */
export function useCanvasGraphActions({
  documentKey,
  currentDocument,
  setNodes,
  setEdges,
  recordSnapshot,
  notify,
  projectGraph,
  consumeDrafts,
}) {
  const latest = useRef(null),
    active = useRef(false);
  const nodeLifetimes = useRef({ documentKey, nodes: null, tracked: new Map() });
  latest.current = { setNodes, setEdges, recordSnapshot, notify, projectGraph, consumeDrafts };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const observeNodeLifetimes = (graph) => {
    let lifetime = nodeLifetimes.current;
    if (lifetime.documentKey !== graph?.documentKey) {
      lifetime = { documentKey: graph?.documentKey, nodes: null, tracked: new Map() };
      nodeLifetimes.current = lifetime;
    }
    if (lifetime.nodes !== graph?.nodes) {
      lifetime.nodes = graph?.nodes;
      for (const [id, record] of lifetime.tracked) {
        const node = graph?.nodes?.find((item) => item.id === id);
        if (!node || node.type !== record.type) lifetime.tracked.delete(id);
      }
    }
    return lifetime;
  };
  const getGraph = () => {
    const graph = currentDocument.current;
    observeNodeLifetimes(graph);
    return graph;
  };
  const getNodeIncarnation = (id) => {
    const graph = getGraph();
    const node = graph?.nodes?.find((item) => item.id === id);
    if (!node || graph.documentKey !== documentKey) return null;
    const lifetime = nodeLifetimes.current;
    let record = lifetime.tracked.get(id);
    if (!record) {
      record = { type: node.type, token: {} };
      lifetime.tracked.set(id, record);
    }
    return record.token;
  };
  const synchronizeReferenceTarget = (graph, targetId) => {
    const target = graph.nodes.find((node) => node.id === targetId);
    if (!target) return graph;
    const base = resolveNodeGenerator(target, graph.nodes, graph.edges, graph.models);
    const resolved = resolveNodeGenerator(target, graph.nodes, graph.edges, graph.models, {
      syncIncoming: true,
    });
    if (base.params.modeType === resolved.params.modeType) return graph;
    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === targetId ? { ...node, data: { ...node.data, params: resolved.params } } : node,
      ),
    };
  };
  const writable = (graph) =>
    active.current &&
    graph?.documentKey === documentKey &&
    graph.ready === true &&
    graph.readonly === false;
  const matchesGraph = (value, expected) =>
    writable(value) &&
    value.nodes === expected?.nodes &&
    value.edges === expected?.edges &&
    value.models === expected?.models;
  /**
   * historyWriter(projectedBefore, acceptedGraph) replaces only this commit's
   * default snapshot after CAS. A writer error cannot make the accepted graph
   * retryable; draft consumption and publication still complete.
   */
  const commitGraph = (
    next,
    {
      expectedGraph,
      historySnapshot,
      explicitPromptNodeIds = [],
      removedNodeIds = [],
      consumePromptDrafts = false,
      historyWriter,
    } = {},
  ) => {
    const current = getGraph();
    if (historyWriter !== undefined && typeof historyWriter !== 'function') return false;
    const matches = (value) => matchesGraph(value, expectedGraph);
    if (!matches(current) || !writable(next)) return false;
    let committed = next,
      previous = historySnapshot || { nodes: current.nodes, edges: current.edges };
    try {
      const project = latest.current.projectGraph;
      if (project) {
        const projectedNext = project(next, { explicitPromptNodeIds }),
          projectedPrevious = project(previous);
        if (
          !Array.isArray(projectedNext?.nodes) ||
          !Array.isArray(projectedNext?.edges) ||
          !Array.isArray(projectedPrevious?.nodes) ||
          !Array.isArray(projectedPrevious?.edges)
        )
          throw new Error('Invalid graph projection');
        committed = { ...next, nodes: projectedNext.nodes, edges: projectedNext.edges };
        previous = { nodes: projectedPrevious.nodes, edges: projectedPrevious.edges };
      }
    } catch {
      latest.current.notify?.('当前画布草稿无法保存，请重试');
      return false;
    }
    if (!matches(getGraph())) return false;
    currentDocument.current = committed;
    observeNodeLifetimes(committed);
    if (historyWriter) {
      try {
        historyWriter(previous, committed);
      } catch {
        // The graph is already accepted. A writer may have recorded before
        // throwing, so neither default history nor a graph retry is safe.
        try {
          latest.current.notify?.('画布变更已接受，但历史记录失败');
        } catch {
          // A notification failure cannot turn an accepted edit into a retry.
        }
      }
    } else latest.current.recordSnapshot(previous);
    if (consumePromptDrafts)
      latest.current.consumeDrafts?.(committed, { explicitPromptNodeIds, removedNodeIds });
    latest.current.setNodes(committed.nodes);
    latest.current.setEdges(committed.edges);
    return true;
  };
  const prepareDeletion = (graph, targetId, prompt) => {
    let source = graph;
    try {
      if (latest.current.projectGraph) {
        const projected = latest.current.projectGraph(graph);
        if (!Array.isArray(projected?.nodes) || !Array.isArray(projected?.edges))
          throw new Error('Invalid graph projection');
        source = { ...graph, nodes: projected.nodes, edges: projected.edges };
      }
      if (typeof prompt === 'string')
        source = {
          ...source,
          nodes: source.nodes.map((node) =>
            node.id === targetId
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    params: patchCanvasMagicPrompt(node.data?.params || {}, prompt),
                  },
                }
              : node,
          ),
        };
    } catch {
      latest.current.notify?.('当前画布草稿无法删除，请重试');
      return null;
    }
    return source;
  };
  const deletionFallback = (source) => (target) => {
    if (
      ['imageList', 'videoList', 'audioList'].every((key) =>
        Array.isArray(target.data?.params?.[key]),
      )
    )
      return undefined;
    const state = resolveNodeGenerator(target, source.nodes, source.edges, source.models);
    return generatorReferenceLists(target, state.inputMedia);
  };
  /** Read all latest drafts for an initial warning without committing or consuming them. */
  const captureDeletionSnapshot = () => {
    const graph = getGraph();
    if (!writable(graph)) return null;
    const source = prepareDeletion(graph);
    return source && matchesGraph(getGraph(), graph)
      ? { nodes: source.nodes, edges: source.edges }
      : null;
  };
  const commitDeletion = (graph, source, plan, { historyWriter } = {}) => {
    if (!plan) return false;
    const explicitPromptNodeIds = plan.explicitPromptNodeIds || [];
    const explicit = new Set(explicitPromptNodeIds);
    const nodes = plan.nodes.map((node) =>
      explicit.has(node.id) && typeof node.data?.params?.prompt === 'string'
        ? {
            ...node,
            data: {
              ...node.data,
              params: patchCanvasMagicPrompt(node.data.params, node.data.params.prompt),
            },
          }
        : node,
    );
    return commitGraph(
      { ...graph, nodes, edges: plan.edges },
      {
        expectedGraph: graph,
        historySnapshot: { nodes: source.nodes, edges: source.edges },
        explicitPromptNodeIds,
        removedNodeIds: plan.removedNodeIds || [],
        consumePromptDrafts: true,
        historyWriter,
      },
    );
  };
  /** ui=false uses raw editing deletion; the existing UI subtree/parent default remains true. */
  const deleteNodes = (nodeIds, options = {}) => {
    const graph = getGraph();
    if (!writable(graph) || !Array.isArray(nodeIds) || !nodeIds.length) return false;
    const source = prepareDeletion(graph);
    if (!source) return false;
    try {
      const plan = planCanvasNodeDeletion({
        ...source,
        nodeIds,
        ui: options.ui,
        zoom: options.zoom,
        reconcileGroupConsumers: options.reconcileGroupConsumers === true,
        getFallbackReferences: deletionFallback(source),
      });
      return commitDeletion(graph, source, plan, options);
    } catch {
      latest.current.notify?.('当前节点无法删除，请重试');
      return false;
    }
  };
  /** One ordinary phase uses one raw batch plan, graph CAS and history writer. */
  const deleteEdges = (edgeIds, options = {}) => {
    const graph = getGraph();
    if (
      !writable(graph) ||
      !Array.isArray(edgeIds) ||
      !edgeIds.some((id) => graph.edges.some((edge) => edge.id === id))
    )
      return false;
    const source = prepareDeletion(graph);
    if (!source) return false;
    try {
      const plan = planCanvasEdgeDeletion({
        ...source,
        edgeIds,
        getFallbackReferences: deletionFallback(source),
      });
      return commitDeletion(graph, source, plan, options);
    } catch {
      latest.current.notify?.('当前连线无法删除，请重试');
      return false;
    }
  };
  /** Qualify the entire latest cohort, unlink in source order, then raw-delete once. */
  const unlinkStoryboardEdges = (edgeIds, options = {}) => {
    const graph = getGraph();
    if (
      !writable(graph) ||
      !Array.isArray(edgeIds) ||
      !edgeIds.length ||
      edgeIds.some((id) => {
        const edge = graph.edges.find((item) => item.id === id);
        return (
          canvasEditingSegmentTargetForEdge(graph.nodes, edge) ||
          !canvasStoryboardEdgeRequiresConfirmation(graph.nodes, edge)
        );
      })
    )
      return false;
    const source = prepareDeletion(graph);
    if (!source) return false;
    try {
      if (
        edgeIds.some((id) =>
          canvasEditingSegmentTargetForEdge(
            source.nodes,
            source.edges.find((item) => item.id === id),
          ),
        )
      )
        return false;
      const unlinked = planCanvasStoryboardUnlinks({ ...source, edgeIds });
      if (!unlinked) return false;
      const plan = planCanvasEdgeDeletion({
        ...unlinked,
        edgeIds,
        getFallbackReferences: deletionFallback(source),
      });
      return commitDeletion(graph, source, plan, options);
    } catch {
      latest.current.notify?.('当前分镜关联无法断开，请重试');
      return false;
    }
  };
  const unlinkStoryboardEdge = (edgeId) => unlinkStoryboardEdges([edgeId]);
  const createDragCopy = ({
    sourceIds,
    copyMode = 'selection',
    copyEdges,
    expectedNodes,
    expectedEdges,
    documentKey: ownerKey,
  } = {}) => {
    const graph = getGraph();
    if (
      ownerKey !== documentKey ||
      !writable(graph) ||
      graph.nodes !== expectedNodes ||
      graph.edges !== expectedEdges ||
      !['single', 'selection'].includes(copyMode) ||
      (copyMode === 'single' &&
        (!Array.isArray(sourceIds) || sourceIds.length !== 1 || typeof sourceIds[0] !== 'string'))
    )
      return false;
    // A copied ID has no registered input controller. Project the source before cloning,
    // while retaining the original graph identity for the eventual compare-and-swap.
    let sourceGraph = graph;
    try {
      const projected = latest.current.projectGraph?.(graph);
      if (projected) {
        if (!Array.isArray(projected.nodes) || !Array.isArray(projected.edges))
          throw new Error('Invalid graph projection');
        sourceGraph = { ...graph, nodes: projected.nodes, edges: projected.edges };
      } else if (latest.current.projectGraph) throw new Error('Invalid graph projection');
    } catch {
      latest.current.notify?.('当前画布草稿无法复制，请重试');
      return false;
    }
    const plan =
      copyMode === 'single'
        ? planCanvasSingleNodeDragCopy({ ...sourceGraph, sourceId: sourceIds[0], copyEdges })
        : planCanvasSelectionDragCopy({ ...sourceGraph, sourceIds, copyEdges });
    if (!plan.valid) {
      latest.current.notify?.('无法复制当前选区，请重试');
      return false;
    }
    const committed = commitGraph(
      {
        ...graph,
        nodes: [...sourceGraph.nodes, ...plan.copies],
        edges: [...sourceGraph.edges, ...plan.edgeCopies],
      },
      { expectedGraph: graph },
    );
    return committed
      ? {
          newTopLevelIds: plan.newTopLevelIds,
          newAllIds: plan.newAllIds,
          positions: plan.positions,
        }
      : false;
  };
  const connector = createGuardedMentionConnector({
    documentKey,
    getGraph,
    commitGraph: (next, options) =>
      commitGraph(synchronizeReferenceTarget(next, next.edges.at(-1)?.target), {
        ...options,
        historySnapshot: { nodes: next.nodes, edges: options.expectedGraph.edges },
      }),
    createEdgeId: createLocalId,
    localResourceActions: true,
  });
  const connectNodes = ({ sourceId, targetId, newNode } = {}) => {
    const graph = getGraph();
    if (!writable(graph)) return false;
    if (newNode && graph.nodes.some((node) => node.id === newNode.id)) return false;
    const nodes = newNode ? [...graph.nodes, newNode] : graph.nodes;
    const plan = newNode
      ? resolveCanvasConnectedCreation({
          ...graph,
          nodes,
          sourceId,
          targetId,
          createdNodeId: newNode.id,
        })
      : resolveCanvasConnection({ ...graph, nodes, sourceId, targetId });
    if (!plan.valid) {
      latest.current.notify?.(plan.message || canvasConnectionReasonLabel(plan.reason));
      return false;
    }
    const patched = plan.targetPatch
      ? nodes.map((node) =>
          node.id === targetId ? { ...node, data: { ...node.data, ...plan.targetPatch } } : node,
        )
      : nodes;
    const next = synchronizeReferenceTarget(
      {
        ...graph,
        nodes: patched,
        edges: [...graph.edges, { id: createLocalId(), source: sourceId, target: targetId }],
      },
      targetId,
    );
    return commitGraph(next, { expectedGraph: graph });
  };
  const planConnection = ({ sourceId, targetId } = {}) => {
    const graph = getGraph();
    return writable(graph)
      ? resolveCanvasConnection({ ...graph, sourceId, targetId })
      : { valid: false, reason: 'missingNode' };
  };
  const connectMultiNodes = ({ sourceIds, targetId, newNode } = {}) => {
    const graph = getGraph();
    if (!writable(graph)) return false;
    if (newNode && graph.nodes.some((node) => node.id === newNode.id)) return false;
    const nodes = newNode ? [...graph.nodes, newNode] : graph.nodes;
    const plan = newNode
      ? resolveCanvasMultiConnectedCreation({
          ...graph,
          nodes,
          sourceIds,
          targetId,
          createdNodeId: newNode.id,
        })
      : resolveCanvasMultiConnection({ ...graph, nodes, sourceIds, targetId });
    if (!plan.valid) {
      if (plan.reason === 'duplicate' && !plan.edgeSourceIds?.length) return false;
      latest.current.notify?.(plan.message || canvasConnectionReasonLabel(plan.reason));
      return false;
    }
    if (!plan.edgeSourceIds?.length) return false;
    const patched = plan.targetPatch
      ? nodes.map((node) =>
          node.id === targetId ? { ...node, data: { ...node.data, ...plan.targetPatch } } : node,
        )
      : nodes;
    const next = synchronizeReferenceTarget(
      {
        ...graph,
        nodes: patched,
        edges: [
          ...graph.edges,
          ...plan.edgeSourceIds.map((source) => ({
            id: createLocalId(),
            source,
            target: targetId,
          })),
        ],
      },
      targetId,
    );
    return commitGraph(next, { expectedGraph: graph });
  };
  const planMultiConnection = ({ sourceIds, targetId } = {}) => {
    const graph = getGraph();
    return writable(graph)
      ? resolveCanvasMultiConnection({ ...graph, sourceIds, targetId })
      : { valid: false, reason: 'missingNode' };
  };
  const snapshotWithPrompt = (graph, targetId, prompt) => ({
    edges: graph.edges,
    nodes:
      typeof prompt === 'string'
        ? graph.nodes.map((node) =>
            node.id === targetId
              ? { ...node, data: { ...node.data, params: { ...node.data?.params, prompt } } }
              : node,
          )
        : graph.nodes,
  });
  const reorderReference = (targetId, listType, order, prompt) => {
    const graph = getGraph();
    if (!writable(graph)) return false;
    const node = graph.nodes.find((item) => item.id === targetId);
    if (!node) return false;
    const inputNode =
      typeof prompt === 'string'
        ? {
            ...node,
            data: {
              ...node.data,
              params: patchCanvasMagicPrompt(node.data?.params || {}, prompt),
            },
          }
        : node;
    const state = resolveNodeGenerator(inputNode, graph.nodes, graph.edges, graph.models);
    const changed = reorderGeneratorReferences({
      node: inputNode,
      references: generatorReferenceLists(inputNode, state.inputMedia),
      listType,
      order,
      prompt,
      mixed: usesMixedGeneratorReferences(state.params.modeType, state.model, state.schema),
    });
    if (!changed) return false;
    const nextNode = {
      ...changed,
      data: {
        ...changed.data,
        params: patchCanvasMagicPrompt(changed.data.params, changed.data.params.prompt),
      },
    };
    return commitGraph(
      { ...graph, nodes: graph.nodes.map((item) => (item.id === targetId ? nextNode : item)) },
      {
        expectedGraph: graph,
        historySnapshot: {
          edges: graph.edges,
          nodes: graph.nodes.map((item) => (item.id === targetId ? inputNode : item)),
        },
        explicitPromptNodeIds: [targetId],
      },
    );
  };
  const deleteReference = (targetId, sourceId, prompt) => {
    const graph = getGraph();
    if (!writable(graph)) return false;
    try {
      if (!resolveGeneratorReferenceRemoval({ ...graph, targetId, sourceId })) return false;
      const source = prepareDeletion(graph, targetId, prompt);
      if (!source) return false;
      const target = source.nodes.find((node) => node.id === targetId);
      const plan = removeGeneratorReference({
        ...source,
        targetId,
        sourceId,
        fallbackReferences: deletionFallback(source)(target),
      });
      return commitDeletion(graph, source, plan);
    } catch {
      latest.current.notify?.('当前引用无法删除，请重试');
      return false;
    }
  };
  const evaluateAssetSelection = (targetId, item, selected) => {
    const graph = getGraph();
    if (!writable(graph)) return null;
    return evaluatePromptAssetSelection({
      ...graph,
      targetId,
      item,
      selected,
      localResourceActions: true,
    });
  };
  const getAssetCapacity = (targetId, selected) => {
    const graph = getGraph();
    return writable(graph) ? promptAssetPickerCapacity({ ...graph, targetId, selected }) : [];
  };
  const importAssetReferences = (targetId, items, context = {}) => {
    const graph = getGraph();
    const target = graph?.nodes.find((node) => node.id === targetId);
    if (
      !writable(graph) ||
      context.signal?.aborted ||
      !target ||
      (context.sessionKey && context.sessionKey !== `${documentKey}:${targetId}`) ||
      (context.expectedPrompts &&
        !context.expectedPrompts.includes(target.data?.params?.prompt || ''))
    )
      return null;
    const plan = planPromptAssetReferences({
      ...graph,
      targetId,
      items,
      makeNodeId: createLocalId,
      makeEdgeId: createLocalId,
      localResourceActions: true,
    });
    if (!plan || context.signal?.aborted) return null;
    if (plan.changed) {
      const nextNodes =
        typeof context.promptOverride === 'string'
          ? plan.nodes.map((node) =>
              node.id === targetId
                ? {
                    ...node,
                    data: {
                      ...node.data,
                      params: { ...node.data?.params, prompt: context.promptOverride },
                    },
                  }
                : node,
            )
          : plan.nodes;
      if (
        !commitGraph(
          synchronizeReferenceTarget({ ...graph, nodes: nextNodes, edges: plan.edges }, targetId),
          {
            expectedGraph: graph,
            historySnapshot: snapshotWithPrompt(graph, targetId, context.promptOverride),
          },
        )
      )
        return null;
    }
    if (plan.failed > 0)
      latest.current.notify?.(
        plan.success > 0
          ? `成功添加 ${plan.success} 项，${plan.failed} 项无法添加为参考`
          : '无法添加为参考',
      );
    return plan;
  };
  const patchScript = (patch, context) => {
    const graph = getGraph();
    const script = graph?.nodes.find((node) => node.id === context?.nodeId);
    if (
      !writable(graph) ||
      context?.documentKey !== documentKey ||
      context.signal?.aborted ||
      !script ||
      (context.expectedNode && context.expectedNode !== script)
    )
      return false;
    return commitGraph(
      {
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === context.nodeId ? { ...node, data: { ...node.data, ...patch } } : node,
        ),
      },
      { expectedGraph: graph },
    );
  };
  const mutateScriptAsset = (scriptId, command, context = {}) => {
    const graph = getGraph();
    const script = graph?.nodes.find((node) => node.id === scriptId);
    if (
      !writable(graph) ||
      context.documentKey !== documentKey ||
      context.signal?.aborted ||
      !script ||
      (context.expectedNode && context.expectedNode !== script)
    )
      return null;
    const plan = planScriptAssetMutation({
      nodes: graph.nodes,
      edges: graph.edges,
      scriptId,
      command: {
        ...command,
        ...(context.expectedAssetFingerprint
          ? { expectedAssetFingerprint: context.expectedAssetFingerprint }
          : {}),
      },
      makeId: createLocalId,
      now: Date.now(),
    });
    if (!plan?.ok || context.signal?.aborted) return plan?.ok === false ? plan : null;
    if (
      plan.changed &&
      !commitGraph({ ...graph, nodes: plan.nodes, edges: plan.edges }, { expectedGraph: graph })
    )
      return null;
    return plan;
  };
  const applyStoryboardPlan = (plan, context) => {
    const graph = getGraph();
    if (
      !writable(graph) ||
      context?.documentKey !== documentKey ||
      context.signal?.aborted ||
      !plan?.ok ||
      plan.sourceScriptNodeId !== context.nodeId
    )
      return false;
    const source = graph.nodes.find((node) => node.id === context.nodeId);
    if (!source || (context.expectedNode && context.expectedNode !== source)) return false;
    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const node of plan.addedNodes) {
      if (!node.id || ids.has(node.id)) return false;
      ids.add(node.id);
    }
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    for (const edge of plan.addedEdges) {
      if (!edge.id || edgeIds.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target))
        return false;
      edgeIds.add(edge.id);
    }
    if (plan.nodePatches.some((patch) => patch.nodeId !== source.id)) return false;
    const patches = new Map(plan.nodePatches.map((patch) => [patch.nodeId, patch.data]));
    return commitGraph(
      {
        ...graph,
        nodes: [
          ...graph.nodes.map((node) =>
            patches.has(node.id)
              ? { ...node, data: { ...node.data, ...patches.get(node.id) } }
              : node,
          ),
          ...plan.addedNodes,
        ],
        edges: [...graph.edges, ...plan.addedEdges],
      },
      { expectedGraph: graph },
    );
  };
  return {
    connectNodes,
    planConnection,
    connectMultiNodes,
    planMultiConnection,
    connectMention: connector,
    reorderReference,
    deleteReference,
    deleteNodes,
    deleteEdges,
    unlinkStoryboardEdge,
    unlinkStoryboardEdges,
    captureDeletionSnapshot,
    evaluateAssetSelection,
    getAssetCapacity,
    importAssetReferences,
    notifyReferenceFailure: (reason) =>
      latest.current.notify?.(reason === 'limit' ? '超出资产引用上限' : '无法添加为参考'),
    patchScript,
    mutateScriptAsset,
    applyStoryboardPlan,
    commitGraph,
    getNodeIncarnation,
    createDragCopy,
  };
}
