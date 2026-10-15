import { resolveNodeGenerator } from '../generator/node-generator.js';

// Public PipelineRunner 898823: a resource with an incoming group edge may run,
// but special node types are excluded before generation is dispatched.
const nodeTypes = new Set(['text', 'image', 'video', 'audio', 'script', 'script-v2']);
const generateActions = new Set([
  'text_generate',
  'image_generate',
  'video_generate',
  'audio_generate',
  'video_edit',
  'image_edit',
  'script_generate',
]);
const array = (value) => (Array.isArray(value) ? value : []);
const typeOf = (node) => node?.data?.type || node?.type;
const groupTypes = new Set(['group', 'video_group', 'video-story']);

export const CANVAS_BATCH_SERVICE_UNAVAILABLE = '批量生成服务尚未连接，节点参数和现有内容已保留';
export const CANVAS_BATCH_LAYOUTS = [
  { value: 'grid', label: '宫格排列' },
  { value: 'horizontal', label: '水平排列' },
  { value: 'vertical', label: '垂直排列' },
];

export function canvasSelectionIds(nodes, selectedIds) {
  const selected = new Set(array(selectedIds));
  return array(nodes)
    .filter((node) => selected.has(node.id))
    .map((node) => node.id);
}

/** Read both existing parent links and old ordering lists; never invent missing children. */
export function canvasGroupMembers(nodes, groupId, maxDepth = 8) {
  const all = array(nodes);
  const byId = new Map(all.map((node) => [node.id, node]));
  const group = byId.get(groupId);
  if (!group || !groupTypes.has(typeOf(group))) return [];
  const seen = new Set([groupId]);
  const members = [];
  const walk = (parent, depth) => {
    if (depth >= maxDepth) return;
    const direct = all.filter((node) => node.parentId === parent.id);
    const ordered = array(parent.data?.childNodeIds)
      .map((id) => byId.get(id))
      // A stale ordering entry may not steal a child belonging to another group.
      .filter((node) => node && (!node.parentId || node.parentId === parent.id));
    for (const child of [...ordered, ...direct]) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      members.push(child);
      if (groupTypes.has(typeOf(child))) walk(child, depth + 1);
    }
  };
  walk(group, 0);
  return members;
}

export function canvasNodeHasOutput(node) {
  const type = typeOf(node);
  if (['text', 'script', 'script-v2'].includes(type))
    return (
      array(node?.data?.content).some((value) => typeof value === 'string' && value.trim()) ||
      (typeof node?.data?.text === 'string' && !!node.data.text.trim())
    );
  return array(Array.isArray(node?.data?.url) ? node.data.url : [node?.data?.url]).some(
    (value) => typeof value === 'string' && !!value.trim(),
  );
}

function isGenerator(node, incoming) {
  if (!nodeTypes.has(typeOf(node))) return false;
  if (generateActions.has(node.data?.action) || incoming) return true;
  // Local createCanvasNode predates action metadata. Uploaded media already has
  // output; it must not be silently reinterpreted as a new generator.
  return (
    !node.data?.action &&
    !!node.data?.params?.model &&
    (typeOf(node) === 'text' || !canvasNodeHasOutput(node))
  );
}

function generatorType(node) {
  const type = typeOf(node);
  const action = node.data?.action;
  const mode = node.data?.generatorType;
  if (type === 'script' || type === 'script-v2') return 'scriptText';
  if (type === 'image' && (mode === 'enhance' || action === 'image_edit')) return 'enhanceImage';
  if (type === 'video' && mode === 'subtitle_erase') return 'subtitleErase';
  if (type === 'video' && (mode === 'enhance' || action === 'video_edit')) return 'enhanceVideo';
  if (type === 'audio' && mode === 'audio_edit') return 'audioEdit';
  return type;
}

/** Keep every node's model, prompt, count and references independent. */
export function resolveCanvasBatchGenerator(node, nodes, edges, models, metadata = {}) {
  const type = generatorType(node);
  const normalType = ['text', 'image', 'video', 'audio'].includes(type);
  const effective = { ...node, type: typeOf(node) };
  const resolved = normalType
    ? resolveNodeGenerator(effective, nodes, edges, models, { metadata })
    : {
        schema: null,
        model: node?.data?.params?.model || '',
        params: { ...node?.data?.params },
        error: '此生成类型的运营模型尚未配置',
      };
  return {
    ...resolved,
    type,
    error: resolved.error || (!resolved.schema ? '生成模型配置尚未加载' : ''),
  };
}

// Source W uses a stable Kahn order. A cyclic component (and its blocked
// descendants) is not added to the executable plan, rather than force-run.
function topologicalIds(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    outgoing.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  }
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const result = [];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    result.push(id);
    for (const target of outgoing.get(id)) {
      const next = indegree.get(target) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return result;
}

export function canvasBatchLayers(nodeIds, edges) {
  const pending = new Set(nodeIds);
  const incoming = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const edge of edges)
    if (pending.has(edge.source) && pending.has(edge.target))
      incoming.get(edge.target).add(edge.source);
  const layers = [];
  while (pending.size) {
    const layer = nodeIds.filter(
      (id) => pending.has(id) && [...incoming.get(id)].every((source) => !pending.has(source)),
    );
    if (!layer.length) break;
    layers.push(layer);
    layer.forEach((id) => pending.delete(id));
  }
  return layers;
}

export function buildCanvasBatchPlan({
  nodes = [],
  edges = [],
  selectedIds = [],
  groupId,
  models,
  metadata = {},
} = {}) {
  const selected = new Set(selectedIds);
  const candidates = groupId
    ? canvasGroupMembers(nodes, groupId)
    : nodes.filter((node) => selected.has(node.id));
  const ids = new Set(candidates.map((node) => node.id));
  const internalEdges = edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const incoming = new Set(internalEdges.map((edge) => edge.target));
  const ordered = topologicalIds(candidates, internalEdges);
  const byId = new Map(candidates.map((node) => [node.id, node]));
  const runnableIds = ordered.filter((id) => isGenerator(byId.get(id), incoming.has(id)));
  const runnable = new Set(runnableIds);
  const planEdges = internalEdges.filter(
    (edge) => runnable.has(edge.source) && runnable.has(edge.target),
  );
  return {
    groupId: groupId || null,
    candidateIds: [...ids],
    nodeIds: runnableIds,
    layers: canvasBatchLayers(runnableIds, planEdges),
    edges: planEdges,
    nodes: runnableIds.map((id) => {
      const node = byId.get(id);
      return {
        id,
        name: node.data?.name || node.data?.label || id,
        type: typeOf(node),
        existingResource: !!node.data?.action?.endsWith('_resource') && canvasNodeHasOutput(node),
        generator: resolveCanvasBatchGenerator(node, nodes, edges, models, metadata),
      };
    }),
    excluded: candidates
      .filter((node) => !runnable.has(node.id))
      .map((node) => ({
        id: node.id,
        reason: ordered.includes(node.id) ? 'not_generator' : 'cyclic_dependency',
      })),
  };
}

/** Unknown billing is distinct from a verified zero quote. */
export function canvasBatchConfirmation(plan, quote) {
  const count = plan.nodeIds.length;
  if (
    !quote ||
    quote.hasError ||
    typeof quote.totalPower !== 'number' ||
    !Number.isFinite(quote.totalPower) ||
    quote.totalPower < 0
  )
    return `即将对组内 ${count} 个生成节点批量生成，算力消耗计算异常，是否继续？`;
  if (quote.billingMode === 'mixed-free-times')
    return `即将对组内 ${count} 个生成节点批量生成，将优先抵扣免费条数，不足部分按各模型正常消耗积分，实际消耗以执行结果为准，是否继续？`;
  if (quote.totalPower === 0) return `即将对组内 ${count} 个生成节点批量生成，是否继续？`;
  return `即将对组内 ${count} 个生成节点批量生成，预计消耗 ${quote.totalPower} 积分，是否继续？`;
}
