import { cloneSnapshot, createLocalId } from '../../editor/model.js';
import { canvasSelectionRoots, canvasWorldPosition } from './groups.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nodeType = (node) => node?.data?.type ?? node?.type;
const groupLike = (node) => node?.type === 'group' || node?.type === 'video_group';
const copyable = (node) => node?.type !== 'screenplay' && node?.data?.type !== 'screenplay';
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const temporary = (node) =>
  node?.id === '__temp_connection_node__' || node?.type === 'temp' || node?.data?.type === 'temp';

/** Source onNodeDragStart uses the visible selection after React Flow's down selection. */
export function resolveCanvasNodeDragCopyMode({ nodes, selectedIds, nodeId } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(selectedIds)) return null;
  const selected = new Set(selectedIds);
  const values = nodes.filter((node) => node && selected.has(node.id) && !node.hidden);
  const clicked = values.find((node) => node.id === nodeId);
  if (!clicked || temporary(clicked)) return null;
  const sourceIds = values.map((node) => node.id);
  const expanded = new Set(sourceIds);
  const groups = new Set(values.filter(groupLike).map((node) => node.id));
  for (const node of nodes) if (node && groups.has(node.parentId)) expanded.add(node.id);
  if (expanded.size > 1 && values.some(copyable)) return { copyMode: 'selection', sourceIds };
  return values.length === 1 && copyable(clicked) && !groupLike(clicked)
    ? { copyMode: 'single', sourceIds }
    : null;
}

/** Source group-copy expansion includes the selected child's parent and siblings. */
function copyMembers(nodes, sourceIds) {
  const allowed = nodes.filter(copyable);
  const lookup = new Map(allowed.map((node) => [node.id, node]));
  const members = new Set(sourceIds.filter((id) => lookup.has(id)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...members]) {
      const parent = lookup.get(lookup.get(id)?.parentId);
      if (!groupLike(parent) || members.has(parent.id)) continue;
      members.add(parent.id);
      for (const node of allowed) if (node.parentId === parent.id) members.add(node.id);
      changed = true;
    }
    // Local nested groups keep complete subtrees, rather than dangling childNodeIds.
    for (const node of allowed) {
      if (
        !members.has(node.id) &&
        members.has(node.parentId) &&
        groupLike(lookup.get(node.parentId))
      ) {
        members.add(node.id);
        changed = true;
      }
    }
  }
  return allowed.filter((node) => members.has(node.id));
}

function copySuffix(value) {
  return typeof value === 'string' && value.length > 0 && !value.endsWith('副本')
    ? `${value} 副本`
    : value;
}

/** Source 761851 resets only explicit group-generation dimensions on a detached root. */
function normalizeDetachedStoryboardLayout(data, root) {
  if (root && data._explicitContentDims === true && data.params?.scene === 'group-generate') {
    delete data._explicitContentDims;
    delete data.contentWidth;
    delete data.contentHeight;
    delete data.params.scene;
  }
}

/** Source 254905 defaults to preserving external references; single Alt can detach them. */
function remapData(data, idMap, externalRefPolicy = 'preserve', normalizeEmptyRefs = false) {
  const detach = externalRefPolicy === 'detach';
  const reference = (id) => idMap.get(id) ?? (detach ? undefined : id);
  for (const key of [
    'sourceScriptNodeId',
    'linkedImageGroupId',
    'linkedVideoGroupId',
    'sourceImageGroupNodeId',
  ])
    if (typeof data[key] === 'string') {
      if (idMap.has(data[key])) data[key] = idMap.get(data[key]);
      else if (detach) delete data[key];
    }
  const params = data.params;
  if (object(params)) {
    for (const key of ['imageList', 'videoList', 'audioList', 'textList', 'mixedList'])
      if (Array.isArray(params[key])) {
        if (!detach && !normalizeEmptyRefs) {
          params[key] = params[key].map((ref) =>
            object(ref) && idMap.has(ref.nodeId) ? { ...ref, nodeId: idMap.get(ref.nodeId) } : ref,
          );
          continue;
        }
        params[key] = params[key].flatMap((ref) => {
          if (!object(ref) || typeof ref.nodeId !== 'string') return [ref];
          const nodeId = reference(ref.nodeId);
          return nodeId ? [{ ...ref, nodeId }] : [];
        });
      }
    for (const key of ['imageListOrder', 'videoListOrder', 'audioListOrder', 'mixedListOrder'])
      if (Array.isArray(params[key])) {
        if (!detach && !normalizeEmptyRefs) {
          params[key] = params[key].map((id) => idMap.get(id) ?? id);
          continue;
        }
        params[key] = params[key].flatMap((id) => {
          if (typeof id !== 'string') return [id];
          const mapped = reference(id);
          return mapped ? [mapped] : [];
        });
      }
    // Source 704418: nonempty media node-ID lists are the canonical saved order.
    for (const key of ['imageList', 'videoList', 'audioList', 'mixedList']) {
      if (!Array.isArray(params[key])) continue;
      const order = params[key]
        .map((ref) => (ref && typeof ref.nodeId === 'string' ? ref.nodeId : null))
        .filter((id) => id !== null);
      if (order.length > 0) params[`${key}Order`] = order;
    }
    if (object(params.scenePayload) && Array.isArray(params.scenePayload.source_images)) {
      if (!detach && !normalizeEmptyRefs)
        params.scenePayload.source_images = params.scenePayload.source_images.map((ref) =>
          object(ref) && idMap.has(ref.node_id) ? { ...ref, node_id: idMap.get(ref.node_id) } : ref,
        );
      else {
        const images = params.scenePayload.source_images.flatMap((ref) => {
          if (!object(ref) || typeof ref.node_id !== 'string') return detach ? [] : [ref];
          const nodeId = reference(ref.node_id);
          return nodeId ? [{ ...ref, node_id: nodeId }] : [];
        });
        if (images.length > 0) params.scenePayload.source_images = images;
        else delete params.scenePayload.source_images;
        if (Object.keys(params.scenePayload).length === 0) delete params.scenePayload;
      }
    }
    if (object(params.focusRegion) && typeof params.focusRegion.nodeId === 'string') {
      if (idMap.has(params.focusRegion.nodeId))
        params.focusRegion.nodeId = idMap.get(params.focusRegion.nodeId);
      else if (detach) delete params.focusRegion;
    }
  }
  if (['script', 'script-v2'].includes(data.type) && object(data.assets))
    for (const key of ['characters', 'scenes', 'props'])
      if (Array.isArray(data.assets[key]))
        data.assets[key] = data.assets[key].map((asset) => {
          if (!object(asset)) return asset;
          if (idMap.has(asset.linkedNodeId))
            return { ...asset, linkedNodeId: idMap.get(asset.linkedNodeId) };
          if (!detach) return asset;
          const copy = { ...asset };
          delete copy.linkedNodeId;
          delete copy.thumbnailUrl;
          return copy;
        });
  if (data.type === 'group' && object(data.characterAsset)) data.characterReferences = {};
  return data;
}

/** Source single-copy detaches only a group-like parent, without copying its siblings. */
export function planCanvasSingleNodeDragCopy({
  nodes,
  edges,
  sourceId,
  copyEdges = false,
  makeId = createLocalId,
} = {}) {
  const invalid = (reason) => ({ valid: false, reason });
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return invalid('invalidGraph');
  const nodeIds = new Set(nodes.map((node) => node?.id));
  if (nodeIds.size !== nodes.length || [...nodeIds].some((id) => typeof id !== 'string' || !id))
    return invalid('invalidGraph');
  const node = nodes.find((value) => value.id === sourceId);
  if (!node || !copyable(node) || groupLike(node) || temporary(node) || node.hidden)
    return invalid('uncopyableNode');
  if (!finitePosition(node.position)) return invalid('invalidPosition');
  const parent = nodes.find((value) => value.id === node.parentId);
  if (node.parentId && !parent) return invalid('missingParent');
  const usedIds = new Set([...nodeIds, ...edges.map((edge) => edge?.id)]);
  const nextId = (prefix) => {
    const id = makeId(prefix);
    if (typeof id !== 'string' || !id || usedIds.has(id)) throw new Error('Duplicate copy ID');
    usedIds.add(id);
    return id;
  };
  try {
    const copy = cloneSnapshot(node);
    copy.id = nextId(nodeType(node) || 'node');
    copy.selected = false;
    copy.dragging = false;
    delete copy.measured;
    copy.data = object(copy.data) ? copy.data : {};
    for (const key of ['guide', 'guideMeta', 'taskInfo', 'directorAgentSessionId', 'openingUsed'])
      delete copy.data[key];
    copy.data.isStale = false;
    if (!node.parentId) {
      copy.data.name = copySuffix(copy.data.name);
      if (['script', 'script-v2'].includes(copy.data.type))
        copy.data.title = copySuffix(copy.data.title);
    }
    if (groupLike(parent)) {
      copy.position = canvasWorldPosition(node, nodes);
      delete copy.parentId;
      delete copy.extent;
      normalizeDetachedStoryboardLayout(copy.data, true);
      copy.data.canvasAltDetachedCopy = true;
    }
    const idMap = new Map([[node.id, copy.id]]);
    remapData(copy.data, idMap, copyEdges ? 'preserve' : 'detach', true);
    const edgeCopies = copyEdges
      ? edges.flatMap((edge) => {
          // Single-copy redirects the target only, even for an original self-loop.
          if (edge?.target !== node.id || !nodeIds.has(edge.source)) return [];
          return [{ ...cloneSnapshot(edge), id: nextId('edge'), target: copy.id }];
        })
      : [];
    return {
      valid: true,
      copies: [copy],
      edgeCopies,
      idMap,
      newTopLevelIds: [copy.id],
      newAllIds: [copy.id],
      positions: new Map([[copy.id, { ...copy.position }]]),
    };
  } catch {
    return invalid('copyFailed');
  }
}

/**
 * Pure same-position Alt-copy plan. The caller owns raw-document CAS, draft projection,
 * insertion and the single history entry; no graph/source arrays are mutated or appended.
 */
export function planCanvasSelectionDragCopy({
  nodes,
  edges,
  sourceIds,
  copyEdges = false,
  makeId = createLocalId,
} = {}) {
  const invalid = (reason) => ({ valid: false, reason });
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(sourceIds))
    return invalid('invalidGraph');
  const nodeIds = new Set(nodes.map((node) => node?.id));
  if (nodeIds.size !== nodes.length || [...nodeIds].some((id) => typeof id !== 'string' || !id))
    return invalid('invalidGraph');
  const members = copyMembers(nodes, sourceIds);
  if (!members.length) return invalid('emptySelection');
  if (members.some((node) => !finitePosition(node.position))) return invalid('invalidPosition');
  const memberIds = new Set(members.map((node) => node.id));
  const usedIds = new Set([...nodeIds, ...edges.map((edge) => edge?.id)]);
  const nextId = (prefix) => {
    const id = makeId(prefix);
    if (typeof id !== 'string' || !id || usedIds.has(id)) throw new Error('Duplicate copy ID');
    usedIds.add(id);
    return id;
  };
  try {
    const idMap = new Map(members.map((node) => [node.id, nextId(nodeType(node) || 'node')]));
    const copies = members.map((node) => {
      const copy = cloneSnapshot(node);
      const parentId = idMap.get(node.parentId);
      const root = !parentId;
      copy.id = idMap.get(node.id);
      copy.parentId = parentId;
      if (root) delete copy.extent;
      copy.position = root ? canvasWorldPosition(node, nodes) : { ...copy.position };
      copy.selected = true;
      copy.dragging = false;
      delete copy.measured;
      copy.data = object(copy.data) ? copy.data : {};
      delete copy.data.guide;
      delete copy.data.guideMeta;
      if (groupLike(node)) {
        copy.zIndex = -1001;
        if (Array.isArray(copy.data.childNodeIds))
          copy.data.childNodeIds = copy.data.childNodeIds
            .map((id) => idMap.get(id))
            .filter(Boolean);
      } else {
        delete copy.data.taskInfo;
        delete copy.data.directorAgentSessionId;
        delete copy.data.openingUsed;
        copy.data.isStale = false;
      }
      if (root) {
        copy.data.name = copySuffix(copy.data.name);
        if (['script', 'script-v2'].includes(nodeType(node)))
          copy.data.title = copySuffix(copy.data.title);
      }
      normalizeDetachedStoryboardLayout(copy.data, root);
      remapData(copy.data, idMap);
      return copy;
    });
    // Parent-first supports nested local documents without a transient orphan frame.
    const byId = new Map(copies.map((node) => [node.id, node]));
    const ordered = [],
      visiting = new Set(),
      visited = new Set();
    const visit = (node) => {
      if (visiting.has(node.id)) throw new Error('Cyclic copied group');
      if (visited.has(node.id)) return;
      visiting.add(node.id);
      const parent = byId.get(node.parentId);
      if (parent) visit(parent);
      visiting.delete(node.id);
      visited.add(node.id);
      ordered.push(node);
    };
    copies.forEach(visit);
    const edgeCopies = copyEdges
      ? edges.flatMap((edge) => {
          // Source 16015 also carries external upstream edges, never outgoing edges.
          if (!memberIds.has(edge.target) || !nodeIds.has(edge.source)) return [];
          const copy = cloneSnapshot(edge);
          return [
            {
              ...copy,
              id: nextId('edge'),
              source: idMap.get(edge.source) ?? edge.source,
              target: idMap.get(edge.target),
              sourceHandle: edge.sourceHandle ?? 'source',
              targetHandle: edge.targetHandle ?? 'target',
            },
          ];
        })
      : [];
    const rootIds = canvasSelectionRoots(
      ordered,
      ordered.map((node) => node.id),
    ).map((node) => node.id);
    return {
      valid: true,
      copies: ordered,
      edgeCopies,
      idMap,
      newTopLevelIds: rootIds,
      newAllIds: ordered.map((node) => node.id),
      positions: new Map(ordered.map((node) => [node.id, { ...node.position }])),
    };
  } catch {
    return invalid('copyFailed');
  }
}
