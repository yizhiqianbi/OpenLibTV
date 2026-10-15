import {
  collectReconciledGeneratorInputs,
  expandGeneratorReferenceSources,
  generatorExcludedReferences,
} from './reference-incoming-model.js';
import { rewriteGeneratorReferenceTokens } from './reference-reconciliation-model.js';
import { recalculateCanvasIncomingTarget } from './reference-recalculation-model.js';
import { planCanvasEdgeDeletion } from '../domain/destructive-delete-model.js';

const listKeys = ['imageList', 'videoList', 'audioList'];
const id = (reference) => reference.nodeId || reference.url;
const array = (value) => (Array.isArray(value) ? value : []);

export { usesMixedGeneratorReferences } from './reference-reconciliation-model.js';

export { rewriteGeneratorReferenceTokens as rewriteReferenceTokens } from './reference-reconciliation-model.js';

/** Image eL keeps typed order/literal prompt; video r1 remaps typed/mixed bindings. */
export function reorderGeneratorReferences({ node, references, listType, order, prompt, mixed }) {
  const key = listType.endsWith('List') ? listType : listType + 'List';
  const previous = array(references[key]);
  if (
    ![...listKeys, 'mixedList'].includes(key) ||
    !Array.isArray(order) ||
    order.length !== previous.length ||
    new Set(order).size !== order.length ||
    previous.some((item) => !order.includes(id(item)))
  )
    return null;
  if (previous.every((item, index) => id(item) === order[index])) return null;
  if (node.type === 'image') {
    const params = { ...node.data?.params, [key + 'Order']: [...order] };
    if (typeof prompt === 'string') params.prompt = prompt;
    return { ...node, data: { ...node.data, params } };
  }
  const after = {
    ...references,
    [key]: order.map((value) => previous.find((item) => id(item) === value)),
  };
  if (key === 'mixedList') {
    for (const typed of listKeys)
      after[typed] = after.mixedList.filter((item) => item.mediaType === typed.slice(0, -4));
  } else after.mixedList = [...after.imageList, ...after.videoList, ...after.audioList];
  const params = { ...node.data?.params };
  for (const list of [...listKeys, 'mixedList']) params[list + 'Order'] = after[list].map(id);
  params.prompt = rewriteGeneratorReferenceTokens(
    typeof prompt === 'string' ? prompt : params.prompt,
    references,
    after,
    mixed,
  );
  return { ...node, data: { ...node.data, params } };
}

/** Source callback finds the first direct edge, otherwise an actual expanded group leaf. */
export function resolveGeneratorReferenceRemoval({ nodes, edges, targetId, sourceId }) {
  const target = nodes.find((node) => node.id === targetId);
  if (!target) return null;
  const direct = edges.find((edge) => edge.target === targetId && edge.source === sourceId);
  if (direct) return { edgeId: direct.id };
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const excluded = generatorExcludedReferences(target.data);
  for (const edge of edges) {
    if (edge.target !== targetId) continue;
    const source = byId.get(edge.source);
    const kind = source?.data?.type || source?.type;
    if (!['group', 'video_group', 'video-story', 'video_story'].includes(kind)) continue;
    const leaves = expandGeneratorReferenceSources([source], nodes, excluded);
    if (!leaves.some((node) => node.id === sourceId)) continue;
    return leaves.length <= 1
      ? { edgeId: edge.id }
      : { excludedIds: [...(excluded || []), sourceId] };
  }
  return null;
}

/** 814059 uses actual edge deletion effects; excluding a group child only recalculates its target. */
export function removeGeneratorReference({
  nodes,
  edges,
  targetId,
  sourceId,
  prompt,
  fallbackReferences,
}) {
  const removal = resolveGeneratorReferenceRemoval({ nodes, edges, targetId, sourceId });
  if (!removal) return null;
  let target = nodes.find((node) => node.id === targetId);
  const beforeNodes = nodes;
  if (typeof prompt === 'string') {
    target = { ...target, data: { ...target.data, params: { ...target.data?.params, prompt } } };
    nodes = nodes.map((node) => (node.id === targetId ? target : node));
  }
  const fallback = (node) =>
    node.id === targetId && fallbackReferences
      ? fallbackReferences
      : collectReconciledGeneratorInputs({ nodes: beforeNodes, edges, target: node });
  if (removal.edgeId)
    return planCanvasEdgeDeletion({
      nodes,
      edges,
      edgeIds: [removal.edgeId],
      getFallbackReferences: fallback,
    });
  const nextTarget = {
    ...target,
    data: { ...target.data, groupRefExcludedNodeIds: removal.excludedIds },
  };
  const nextNodes = nodes.map((node) => (node.id === targetId ? nextTarget : node));
  const reconciled = recalculateCanvasIncomingTarget({
    nodes: nextNodes,
    edges,
    target: nextTarget,
    fallbackReferences: fallback(target),
  });
  return {
    nodes: nextNodes.map((node) => (node.id === targetId ? reconciled : node)),
    edges,
    removedNodeIds: [],
    affectedTargetIds: [targetId],
    explicitPromptNodeIds: typeof reconciled.data?.params?.prompt === 'string' ? [targetId] : [],
  };
}
