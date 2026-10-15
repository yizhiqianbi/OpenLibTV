const group = (node) => node?.data?.type === 'group';
const script = (node) => node?.data?.type === 'script';
const byId = (nodes, id) => nodes.find((node) => node.id === id);

/** Source handleEdgesChange inspects raw data.type; SCRIPT_V2 is a separate type. */
export function canvasStoryboardEdgeRequiresConfirmation(nodes, edge) {
  if (!edge) return false;
  const source = byId(nodes, edge.source),
    target = byId(nodes, edge.target);
  if (!source || !target) return false;
  if (script(source) && group(target) && target.data.sourceScriptNodeId) return true;
  if (script(target) && group(source) && source.data.sourceScriptNodeId) return true;
  if (!group(source) || !group(target)) return false;
  const linked = source.data.sourceScriptNodeId ? source : target;
  if (!linked.data.sourceScriptNodeId || !byId(nodes, linked.data.sourceScriptNodeId)) return false;
  return nodes.some((node) => node.parentId === linked.id && node.data?.scriptRowHiddenUuid);
}

export const canvasStoryboardUnlinkNotice = Object.freeze({
  title: '断开连线',
  message: '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
  confirmText: '确定断开',
  cancelText: '取消',
  closeOnBackdrop: false,
  showCloseButton: false,
});

/** Binding-only identity permits prompt/row/position updates during confirmation. */
export function canvasStoryboardUnlinkIdentity(nodes, edge) {
  const endpointIds = [edge.source, edge.target];
  const ids = new Set(endpointIds);
  for (const id of endpointIds) {
    const value = byId(nodes, id)?.data?.sourceScriptNodeId;
    if (value) ids.add(value);
  }
  return {
    endpoints: [...ids].map((id) => {
      const node = byId(nodes, id);
      return {
        id,
        exists: Boolean(node),
        type: node?.data?.type,
        sourceScriptNodeId: node?.data?.sourceScriptNodeId,
        storyboardGroupType: node?.data?.storyboardGroupType,
        linkedImageGroupId: node?.data?.linkedImageGroupId,
        linkedVideoGroupId: node?.data?.linkedVideoGroupId,
      };
    }),
    children: nodes
      .filter((node) => endpointIds.includes(node.parentId))
      .map((node) => ({
        id: node.id,
        parentId: node.parentId,
        row: node.data?.scriptRowHiddenUuid,
      })),
  };
}

/** Source unlinkStoryboardByEdge(..., {preserveEdge:true}); no row/child teardown. */
export function planCanvasStoryboardUnlink({ nodes, edges, edgeId } = {}) {
  const edge = edges.find((item) => item.id === edgeId);
  if (!edge) return null;
  const source = byId(nodes, edge.source),
    target = byId(nodes, edge.target);
  if (!source || !target) return null;
  let next = nodes;
  const changedNodeIds = [];
  const patch = (id, value) => {
    const node = byId(next, id);
    if (!node) return;
    const updated = patchCanvasStoredNodeData(node, value);
    next = next.map((item) => (item.id === id ? updated : item));
    if (!changedNodeIds.includes(id)) changedNodeIds.push(id);
  };
  const unlink = (scriptId, groupId, explicitKind) => {
    const data = byId(next, scriptId)?.data;
    const kind =
      explicitKind ||
      (data?.linkedImageGroupId === groupId
        ? 'image'
        : data?.linkedVideoGroupId === groupId
          ? 'video'
          : null);
    const key = kind === 'image' ? 'linkedImageGroupId' : 'linkedVideoGroupId';
    if (kind && data?.[key] === groupId) patch(scriptId, { [key]: undefined });
    if (byId(next, groupId))
      patch(groupId, { sourceScriptNodeId: undefined, storyboardTitle: undefined });
  };
  if (script(source) && group(target) && target.data.sourceScriptNodeId)
    unlink(source.id, target.id);
  else if (script(target) && group(source) && source.data.sourceScriptNodeId)
    unlink(target.id, source.id);
  else
    for (const endpoint of [target, source])
      if (
        group(endpoint) &&
        endpoint.data.storyboardGroupType === 'video' &&
        endpoint.data.sourceScriptNodeId
      )
        unlink(endpoint.data.sourceScriptNodeId, endpoint.id, 'video');
  return { nodes: next, edges, changedNodeIds };
}

/**
 * Qualify the whole original cohort before running the source helpers in request
 * order. A preceding unlink may clear a later edge's binding; that later helper
 * still reads the latest patched nodes, without reclassifying the accepted cohort.
 * Edges are preserved here so the caller performs one raw batch deletion.
 */
export function planCanvasStoryboardUnlinks({ nodes, edges, edgeIds } = {}) {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    !Array.isArray(edgeIds) ||
    !edgeIds.length ||
    edgeIds.some((id) => typeof id !== 'string' || !id)
  )
    return null;
  const cohort = edgeIds.map((id) => edges.find((edge) => edge.id === id));
  if (cohort.some((edge) => !canvasStoryboardEdgeRequiresConfirmation(nodes, edge))) return null;
  let patchedNodes = nodes;
  const changedNodeIds = [];
  for (const edge of cohort) {
    const plan = planCanvasStoryboardUnlink({ nodes: patchedNodes, edges, edgeId: edge.id });
    if (!plan) return null;
    patchedNodes = plan.nodes;
    for (const id of plan.changedNodeIds) if (!changedNodeIds.includes(id)) changedNodeIds.push(id);
  }
  return { nodes: patchedNodes, edges, changedNodeIds };
}
import { patchCanvasStoredNodeData } from './node-data-update-model.js';
