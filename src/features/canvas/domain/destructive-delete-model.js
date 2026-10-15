import { canvasWorldPosition } from './groups.js';
import { clearDetachedGeneratorGroupExclusions } from '../generator/reference-incoming-model.js';
import { recalculateCanvasIncomingTarget } from '../generator/reference-recalculation-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const unique = (ids) => [...new Set(array(ids).filter((id) => typeof id === 'string' && id))];
const groupLike = (node) => ['group', 'video_group'].includes(node?.type);
const mapNodes = (nodes) => new Map(nodes.map((node) => [node.id, node]));

/** Source UI and raw iS prioritize editing-source loss before storyboard confirmation. */
export function canvasEditingSegmentTargetForEdge(nodes, edge) {
  if (!edge) return null;
  const target = nodes.find((node) => node.id === edge.target);
  const params = target?.data?.params,
    draft = params?.segmentRemakeDraft;
  return params?.segmentRemakeLock === true &&
    draft?.phase === 'editing' &&
    draft.sourceNodeId === edge.source
    ? target.id
    : null;
}

/** Store iu/module25185 belongs to actual edge deletion, not raw node cascade. */
function removePersistedCharacterEdge(source, edgeId) {
  const data = source?.data;
  const saved = data?.characterReferences;
  if (!data?.characterAsset || !saved || typeof saved !== 'object' || Array.isArray(saved))
    return source;
  const references = { ...saved };
  if (!(edgeId in references)) return source;
  delete references[edgeId];
  return { ...source, data: { ...data, characterReferences: references } };
}

/** Source 96063 expands selected ordinary groups breadth first, using actual parentId. */
function expandUiGroups(nodes, ids) {
  const byId = mapNodes(nodes);
  const expanded = [...ids];
  for (const id of ids) {
    if (!groupLike(byId.get(id))) continue;
    const visited = new Set([id]);
    const pending = nodes.filter((node) => node.parentId === id);
    for (let index = 0; index < pending.length; index++) {
      const node = pending[index];
      // A corrupt cyclic local document must not hang the UI; valid source trees
      // retain the same breadth-first ordering as the original helper.
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      expanded.push(node.id);
      pending.push(...nodes.filter((child) => child.parentId === node.id));
    }
  }
  return unique(expanded);
}

/** Actual UI computes immediate parents once; it does not recursively dissolve ancestors. */
function prepareUiParents(nodes, ids, zoom) {
  const selected = new Set(ids);
  const byId = mapNodes(nodes);
  const parents = new Set(
    ids.map((id) => byId.get(id)?.parentId).filter((id) => id && !selected.has(id)),
  );
  const patches = new Map();
  const resizeUpdates = [];
  const childPositionUpdates = [];
  const additional = [];
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const padding = 20 + (20 * (Math.sqrt(safeZoom) - safeZoom)) / safeZoom;
  for (const id of parents) {
    const parent = byId.get(id);
    if (!parent) continue;
    const children = nodes.filter((node) => node.parentId === id && !selected.has(node.id));
    if (children.length <= 1) {
      additional.push(id);
      if (children.length) {
        const child = children[0];
        // Source adds only parent.position + child.position. The local nested
        // adapter preserves the full world position required by AGENTS.md.
        const { parentId: _parent, extent: _extent, ...retained } = child;
        patches.set(child.id, { ...retained, position: canvasWorldPosition(child, byId) });
      }
      continue;
    }
    const minX = Math.min(...children.map((node) => node.position.x));
    const minY = Math.min(...children.map((node) => node.position.y));
    const maxX = Math.max(
      ...children.map((node) => node.position.x + (node.measured?.width ?? node.width ?? 0)),
    );
    const maxY = Math.max(
      ...children.map((node) => node.position.y + (node.measured?.height ?? node.height ?? 0)),
    );
    const offsetX = minX - padding;
    const offsetY = minY - padding;
    const width = maxX - minX + 2 * padding;
    const height = maxY - minY + 2 * padding;
    resizeUpdates.push({
      id,
      updates: {
        position: { x: parent.position.x + offsetX, y: parent.position.y + offsetY },
        width,
        height,
        measured: { width, height },
      },
    });
    if (offsetX !== 0 || offsetY !== 0)
      for (const child of children)
        childPositionUpdates.push({
          id: child.id,
          updates: {
            position: { x: child.position.x - offsetX, y: child.position.y - offsetY },
          },
        });
  }
  // Source batches all resize field patches before all child-position patches.
  // A nested group can receive both; replacing the whole old object loses its
  // new measured dimensions or changes the final position with parent order.
  for (const { id, updates } of [...resizeUpdates, ...childPositionUpdates])
    patches.set(id, { ...(patches.get(id) || byId.get(id)), ...updates });
  return {
    nodes: nodes.map((node) => patches.get(node.id) || node),
    ids: unique([...ids, ...additional]),
  };
}

function storyboardBindingPatches(nodes, ids) {
  const removed = new Set(ids);
  const byId = mapNodes(nodes);
  return nodes.map((group) => {
    if (
      removed.has(group.id) ||
      group.type !== 'group' ||
      group.data?.storyboardGroupType !== 'image'
    )
      return group;
    const actual = nodes.filter((node) => node.parentId === group.id);
    const numeric = (items) =>
      [...items].sort((a, b) =>
        (a.data?.name ?? '').localeCompare(b.data?.name ?? '', undefined, { numeric: true }),
      );
    const preferred = array(group.data.childNodeIds);
    const childrenById = mapNodes(actual);
    const ordered = preferred.length
      ? preferred.map((id) => childrenById.get(id)).filter(Boolean)
      : numeric(actual);
    const already = new Set(ordered.map((node) => node.id));
    if (preferred.length) ordered.push(...numeric(actual.filter((node) => !already.has(node.id))));
    const images = ordered.filter((node) => node.type === 'image');
    if (!images.some((node) => removed.has(node.id))) return group;
    let rows = group.data.sourceScriptNodeId
      ? array(byId.get(group.data.sourceScriptNodeId)?.data?.rows)
      : [];
    const hidden = array(group.data.storyboardSourceRowHiddenUuids);
    if (hidden.length) {
      const rowIds = new Set(hidden);
      rows = rows.filter((row) => row.hiddenUuid && rowIds.has(row.hiddenUuid));
    }
    const childNodeIds = [];
    const storyboardSourceRowHiddenUuids = [];
    images.forEach((node, index) => {
      if (removed.has(node.id)) return;
      childNodeIds.push(node.id);
      const hiddenUuid = node.data?.scriptRowHiddenUuid || rows[index]?.hiddenUuid;
      if (hiddenUuid) storyboardSourceRowHiddenUuids.push(hiddenUuid);
    });
    return { ...group, data: { ...group.data, childNodeIds, storyboardSourceRowHiddenUuids } };
  });
}

/** Store iv/im is a single pass from original seeds, without a target-type gate. */
function rawNodeIds(nodes, edges, ids) {
  const seeds = new Set(ids);
  const byId = mapNodes(nodes);
  const additional = [];
  for (const id of ids)
    for (const edge of edges) {
      if (edge.source !== id || seeds.has(edge.target)) continue;
      const params = byId.get(edge.target)?.data?.params;
      const draft = params?.segmentRemakeDraft;
      if (
        params?.segmentRemakeLock === true &&
        draft?.phase === 'editing' &&
        draft.sourceNodeId === id
      )
        additional.push(edge.target);
    }
  return unique([...ids, ...additional]);
}

function fallbackReader(nodes, getFallbackReferences) {
  const before = mapNodes(nodes);
  const cache = new Map();
  return (id) => {
    if (!cache.has(id)) cache.set(id, getFallbackReferences?.(before.get(id)));
    return cache.get(id);
  };
}

function recalculateTargets(nodes, edges, ids, readFallback, clearStale) {
  const current = mapNodes(nodes);
  for (const id of ids) {
    const target = current.get(id);
    if (!target) continue;
    let next = recalculateCanvasIncomingTarget({
      nodes: [...current.values()],
      edges,
      target,
      fallbackReferences: readFallback(id),
    });
    if (clearStale && next?.data?.isStale)
      next = { ...next, data: { ...next.data, isStale: false } };
    current.set(id, next);
  }
  return nodes.map((node) => current.get(node.id));
}

function rawNodeDeletion(nodes, edges, ids, readFallback, additionalTargets = []) {
  const removedIds = rawNodeIds(nodes, edges, ids);
  const removed = new Set(removedIds);
  const retained = nodes.filter((node) => !removed.has(node.id));
  const survivors = new Set(retained.map((node) => node.id));
  const targets = unique([
    ...edges
      .filter((edge) => removed.has(edge.source) && !removed.has(edge.target))
      .map((edge) => edge.target),
    ...additionalTargets,
  ]).filter((id) => survivors.has(id));
  const byId = mapNodes(nodes);
  const postNodes = retained.map((node) => {
    let next = node;
    if (removed.has(node.parentId)) {
      const { parentId: _parent, extent: _extent, ...rest } = node;
      next = { ...rest, position: canvasWorldPosition(node, byId) };
    }
    if (next.data) {
      const patch = {};
      for (const key of ['linkedImageGroupId', 'linkedVideoGroupId'])
        if (next.data[key] && removed.has(next.data[key])) patch[key] = undefined;
      if (Object.keys(patch).length) next = { ...next, data: { ...next.data, ...patch } };
    }
    return next;
  });
  const postEdges = edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
  return {
    nodes: recalculateTargets(postNodes, postEdges, targets, readFallback, true),
    edges: postEdges,
    removedNodeIds: removedIds,
    affectedTargetIds: targets,
  };
}

function finish(plan, beforeNodes, beforeEdges) {
  if (
    plan.nodes.length === beforeNodes.length &&
    plan.edges.length === beforeEdges.length &&
    plan.nodes.every((node, index) => node === beforeNodes[index]) &&
    plan.edges.every((edge, index) => edge === beforeEdges[index])
  )
    return null;
  const byId = mapNodes(plan.nodes);
  return {
    ...plan,
    explicitPromptNodeIds: plan.affectedTargetIds.filter(
      (id) => typeof byId.get(id)?.data?.params?.prompt === 'string',
    ),
  };
}

/** Source UI deletion plus a bounded, opt-in local fix for surviving group consumers. */
export function planCanvasNodeDeletion({
  nodes,
  edges,
  nodeIds,
  zoom = 1,
  getFallbackReferences,
  ui = true,
  reconcileGroupConsumers = false,
} = {}) {
  const requested = unique(nodeIds);
  if (!requested.length) return null;
  const readFallback = fallbackReader(nodes, getFallbackReferences);
  let prepared = { nodes, ids: requested };
  if (ui) {
    prepared = prepareUiParents(nodes, expandUiGroups(nodes, requested), zoom);
    prepared.nodes = storyboardBindingPatches(prepared.nodes, prepared.ids);
  }
  const additionalTargets = [];
  if (ui && reconcileGroupConsumers) {
    const byId = mapNodes(nodes);
    const removed = new Set(rawNodeIds(prepared.nodes, edges, prepared.ids));
    const ancestors = new Set();
    for (const id of removed) {
      const visited = new Set([id]);
      let parent = byId.get(byId.get(id)?.parentId);
      while (parent && !visited.has(parent.id)) {
        visited.add(parent.id);
        if (!removed.has(parent.id) && groupLike(parent)) ancestors.add(parent.id);
        parent = byId.get(parent.parentId);
      }
    }
    // Only these pre-tree ancestors' real outgoing consumers are visited. This
    // repairs a source omission under the user's node-interaction authorization.
    for (const edge of edges)
      if (
        ancestors.has(edge.source) &&
        !removed.has(edge.target) &&
        !edge.data?.portraitVirtual &&
        !edge.data?.assetVirtual
      )
        additionalTargets.push(edge.target);
  }
  return finish(
    rawNodeDeletion(prepared.nodes, edges, prepared.ids, readFallback, additionalTargets),
    nodes,
    edges,
  );
}

/** Store iS → raw deleteNodes(iv once) → remaining deleteEdges(ih then ig). */
export function planCanvasEdgeDeletion({ nodes, edges, edgeIds, getFallbackReferences } = {}) {
  const requested = unique(edgeIds);
  if (!requested.length) return null;
  const byEdge = new Map(edges.map((edge) => [edge.id, edge]));
  const editingTargets = unique(
    requested.flatMap((id) => {
      const edge = byEdge.get(id);
      const targetId = canvasEditingSegmentTargetForEdge(nodes, edge);
      return targetId ? [targetId] : [];
    }),
  );
  const readFallback = fallbackReader(nodes, getFallbackReferences);
  const nodePlan = editingTargets.length
    ? rawNodeDeletion(nodes, edges, editingTargets, readFallback)
    : { nodes, edges, removedNodeIds: [], affectedTargetIds: [] };
  const cascaded = new Set(editingTargets);
  const remainingIds = new Set(requested.filter((id) => !cascaded.has(byEdge.get(id)?.target)));
  const removedEdges = nodePlan.edges.filter((edge) => remainingIds.has(edge.id));
  let postNodes = nodePlan.nodes;
  const targets = unique(removedEdges.map((edge) => edge.target)).filter((id) =>
    postNodes.some((node) => node.id === id),
  );
  for (const edge of removedEdges) {
    const current = mapNodes(postNodes);
    const source = current.get(edge.source);
    const nextSource = removePersistedCharacterEdge(source, edge.id);
    if (source && nextSource !== source) {
      current.set(source.id, nextSource);
      postNodes = postNodes.map((node) => (node.id === source.id ? nextSource : node));
    }
    const target = current.get(edge.target);
    if (!target) continue;
    const changed = clearDetachedGeneratorGroupExclusions(
      target,
      current.get(edge.source),
      postNodes,
    );
    if (changed !== target)
      postNodes = postNodes.map((node) => (node.id === target.id ? changed : node));
  }
  const postEdges = nodePlan.edges.filter((edge) => !remainingIds.has(edge.id));
  postNodes = recalculateTargets(postNodes, postEdges, targets, readFallback, false);
  return finish(
    {
      nodes: postNodes,
      edges: postEdges,
      removedNodeIds: nodePlan.removedNodeIds,
      affectedTargetIds: unique([...nodePlan.affectedTargetIds, ...targets]),
    },
    nodes,
    edges,
  );
}
