import { canvasConnectionActionsAllowed } from './connection-model.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const idValid = (value) => typeof value === 'string' && value.length > 0;
const typeOf = (node) => node?.data?.type ?? node?.type;
const virtual = (edge) => !!edge.data?.portraitVirtual || !!edge.data?.assetVirtual;

function graphValid(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
  const ids = new Set();
  for (const item of [...nodes, ...edges]) {
    if (!record(item) || !idValid(item.id) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return (
    nodes.every((node) => record(node.data)) &&
    edges.every((edge) => idValid(edge.source) && idValid(edge.target))
  );
}

// The pick collector calls generator validation, not the programmatic connector's
// duplicate/cycle checks. Keep those checks out of candidate highlighting.
function candidateReason(source, target) {
  if (
    target.data.type !== 'script-v2' ||
    (target.data.action && target.data.action !== 'script_generate')
  )
    return 'limit';
  const sourceAction =
    source.data.action || (source.data.scriptRowHiddenUuid ? 'image_generate' : null);
  if (
    !sourceAction ||
    !target.data.action ||
    !canvasConnectionActionsAllowed(sourceAction, target.data.action)
  )
    return 'modelUnsupported';
  if (['enhance', 'picture-edit', 'pictureEdit'].includes(target.data.generatorType))
    return 'modelUnsupported';
  return '';
}

/** Module450681/163688, narrowed to the caller's ScriptV2 IMAGE-only mode. */
export function describeScriptV2ReferencePick({ nodes, edges, targetNodeId } = {}) {
  const invalid = (reason) => ({
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
  if (!graphValid(nodes, edges)) return invalid('invalid-graph');
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!target || typeOf(target) !== 'script-v2') return invalid('invalid-target');
  const lookup = new Map(nodes.map((node) => [node.id, node])),
    connectedIds = new Set(),
    ordinary = new Set(),
    onlyVirtual = new Set();
  for (const edge of edges) {
    if (edge.target !== targetNodeId || typeOf(lookup.get(edge.source)) !== 'image') continue;
    connectedIds.add(edge.source);
    (virtual(edge) ? onlyVirtual : ordinary).add(edge.source);
  }
  const pickableIds = new Set(),
    blockReasons = new Map(),
    candidates = [];
  let limited = false;
  for (const node of nodes) {
    if (
      node.id === targetNodeId ||
      typeOf(node) !== 'image' ||
      (onlyVirtual.has(node.id) && !ordinary.has(node.id))
    )
      continue;
    if (ordinary.has(node.id)) {
      candidates.push({ node, kind: 'image', connected: true });
      continue;
    }
    const reason = candidateReason(node, target);
    if (!reason) {
      pickableIds.add(node.id);
      candidates.push({ node, kind: 'image', connected: false });
    } else {
      candidates.push({ node, kind: 'image', connected: false, blockReason: reason });
      if (reason === 'limit') {
        limited = true;
        blockReasons.set(node.id, 'limit');
      }
    }
  }
  const states = new Map(
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
  );
  const groupPickableIds = new Set();
  for (const node of nodes) {
    if (!pickableIds.has(node.id)) continue;
    let parent = node.parentId;
    const visited = new Set();
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const group = lookup.get(parent);
      if (group?.type !== 'group') break;
      groupPickableIds.add(parent);
      parent = group.parentId;
    }
  }
  return {
    valid: true,
    reason: '',
    target,
    pickableIds,
    groupPickableIds,
    connectedIds,
    blockReasons,
    states,
    candidates,
    limitCount: limited
      ? candidates.filter((item) => item.connected).length +
        (Array.isArray(target.data.refImages) ? target.data.refImages.length : 0)
      : null,
  };
}

/** Source custom box: strict overlap, measured→stored→200/120, at most32 ancestors. */
export function collectReferencePickBoxIds({ nodes, pickableIds, rect, getNodeSize } = {}) {
  if (
    !Array.isArray(nodes) ||
    !(pickableIds instanceof Set) ||
    !pickableIds.size ||
    ![rect?.x, rect?.y, rect?.width, rect?.height].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return [];
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  return nodes
    .filter((node) => {
      if (!pickableIds.has(node.id)) return false;
      let x = node.position?.x,
        y = node.position?.y,
        parent = node.parentId,
        depth = 0;
      while (parent && depth < 32) {
        const ancestor = lookup.get(parent);
        if (!ancestor) break;
        x += ancestor.position?.x;
        y += ancestor.position?.y;
        parent = ancestor.parentId;
        depth += 1;
      }
      const size = getNodeSize?.(node),
        width = size?.width ?? node.measured?.width ?? node.width ?? 200,
        height = size?.height ?? node.measured?.height ?? node.height ?? 120;
      return (
        x < rect.x + rect.width &&
        x + width > rect.x &&
        y < rect.y + rect.height &&
        y + height > rect.y
      );
    })
    .map((node) => node.id);
}

function groupSources(groupId, nodes) {
  if (!nodes.some((node) => node.id === groupId && node.type === 'group')) return null;
  const groups = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (
        node.type === 'group' &&
        node.parentId &&
        groups.has(node.parentId) &&
        !groups.has(node.id)
      ) {
        groups.add(node.id);
        changed = true;
      }
  }
  return nodes.filter(
    (node) =>
      node.parentId &&
      groups.has(node.parentId) &&
      node.type !== 'group' &&
      node.data.type !== 'reference',
  );
}

function createsCycle(nodes, edges, sourceId, targetId) {
  const lookup = new Map(nodes.map((node) => [node.id, node])),
    outgoing = new Map();
  for (const edge of [...edges, { source: sourceId, target: targetId }]) {
    if (typeOf(lookup.get(edge.source)) === 'reference') continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  }
  const active = new Set(),
    visited = new Set(),
    stack = [{ id: sourceId, index: 0 }];
  while (stack.length) {
    const entry = stack.at(-1);
    if (!visited.has(entry.id)) {
      visited.add(entry.id);
      active.add(entry.id);
    }
    const next = (outgoing.get(entry.id) || [])[entry.index++];
    if (next === undefined) {
      active.delete(entry.id);
      stack.pop();
      continue;
    }
    if (active.has(next)) return true;
    if (!visited.has(next)) stack.push({ id: next, index: 0 });
  }
  return false;
}

const unchanged = (nodes, edges, reason = '') => ({
  valid: true,
  changed: false,
  reason,
  nodes,
  edges,
  addedEdgeIds: [],
  removedEdgeIds: [],
  connectedCount: 0,
  selectionChanges: [],
  warnings: [],
});
const invalid = (nodes, edges, reason) => ({ ...unchanged(nodes, edges, reason), valid: false });

function characterEdgeData(character, nowMs) {
  if (!character) return undefined;
  if (!Array.isArray(character.states) || !Number.isFinite(nowMs) || nowMs <= 0)
    throw Error('character-metadata');
  const state =
    character.states.find((item) => item.id === character.defaultStateId) ?? character.states[0];
  if (!state) throw Error('character-state');
  return JSON.parse(
    JSON.stringify({
      characterRef: {
        roleId: character.roleId,
        ...(character.characterUuid ? { characterUuid: character.characterUuid } : {}),
        roleName: character.roleName,
        versionId: character.versionId,
        version: character.version,
        stateId: state.id,
        stateName: state.name,
        mainReferenceImageUrl: state.mainReferenceImageUrl,
        voice: state.voice,
        capturedAtMs: nowMs,
      },
    }),
  );
}

/** Source node/box/group actions; atomic one-history graph assembly is a local adapter. */
export function planScriptV2ReferencePick({
  nodes,
  edges,
  targetNodeId,
  sourceIds = [],
  groupId,
  surface = groupId ? 'group' : 'node',
  makeId,
  nowMs,
} = {}) {
  const description = describeScriptV2ReferencePick({ nodes, edges, targetNodeId });
  if (!description.valid) return invalid(nodes, edges, description.reason);
  if (
    !['node', 'box', 'group'].includes(surface) ||
    !Array.isArray(sourceIds) ||
    sourceIds.some((id) => !idValid(id)) ||
    (surface === 'node' && sourceIds.length !== 1)
  )
    return invalid(nodes, edges, 'invalid-source-request');
  const sourceSet = new Set(sourceIds),
    sources =
      surface === 'group'
        ? groupSources(groupId, nodes)
        : nodes.filter((node) => sourceSet.has(node.id));
  if (!sources) return invalid(nodes, edges, 'invalid-group');
  const eligible = sources.filter((node) => description.pickableIds.has(node.id)),
    alreadyConnected =
      surface === 'group'
        ? sources.filter((node) => description.connectedIds.has(node.id)).length
        : 0,
    limitSkipped =
      surface === 'group'
        ? sources.filter((node) => description.blockReasons.get(node.id) === 'limit').length
        : 0;
  let unsupportedSkipped =
    surface === 'group' ? sources.length - eligible.length - alreadyConnected - limitSkipped : 0;
  const usedIds = new Set([...nodes, ...edges].map((item) => item.id)),
    nextEdges = [...edges],
    addedEdgeIds = [];
  let rejectedReason = '';
  try {
    for (const source of eligible) {
      if (
        nextEdges.some(
          (edge) =>
            (edge.source === source.id && edge.target === targetNodeId) ||
            (edge.source === targetNodeId && edge.target === source.id),
        )
      ) {
        rejectedReason = 'duplicate';
        unsupportedSkipped += 1;
        continue;
      }
      if (createsCycle(nodes, nextEdges, source.id, targetNodeId)) {
        rejectedReason = 'cycle';
        unsupportedSkipped += 1;
        continue;
      }
      const data = characterEdgeData(source.data.characterAsset, nowMs),
        id = makeId?.('edge');
      if (!idValid(id) || usedIds.has(id)) return invalid(nodes, edges, 'invalid-edge-id');
      usedIds.add(id);
      addedEdgeIds.push(id);
      nextEdges.push({
        id,
        source: source.id,
        sourceHandle: 'source',
        target: targetNodeId,
        targetHandle: 'target',
        ...(data ? { data } : {}),
      });
    }
  } catch {
    return invalid(nodes, edges, 'edge-planning-failed');
  }
  const warnings = [];
  if (surface === 'group' && (unsupportedSkipped > 0 || limitSkipped > 0)) {
    if (addedEdgeIds.length + alreadyConnected <= 0)
      warnings.push(
        unsupportedSkipped > 0
          ? 'referencePickGroupAllUnsupported'
          : 'referencePickGroupLimitSkipped',
      );
    else {
      if (unsupportedSkipped > 0) warnings.push('referencePickGroupPartialUnsupported');
      if (limitSkipped > 0) warnings.push('referencePickGroupLimitSkipped');
    }
  }
  const result = unchanged(
    nodes,
    edges,
    rejectedReason || (!eligible.length ? 'no-eligible-sources' : ''),
  );
  if (!addedEdgeIds.length)
    return { ...result, warnings, alreadyConnected, limitSkipped, unsupportedSkipped };
  return {
    ...result,
    changed: true,
    reason: '',
    edges: nextEdges,
    addedEdgeIds,
    connectedCount: addedEdgeIds.length,
    selectionChanges: [
      ...(surface === 'node'
        ? [{ id: sourceIds[0], type: 'select', selected: false }]
        : surface === 'group'
          ? [{ id: groupId, type: 'select', selected: false }]
          : []),
      { id: targetNodeId, type: 'select', selected: true },
    ],
    warnings,
    alreadyConnected,
    limitSkipped,
    unsupportedSkipped,
  };
}

/** Source cd removes the first direct edge, including a virtual one; no selection change. */
export function planScriptV2ReferenceDisconnect({ nodes, edges, targetNodeId, sourceId } = {}) {
  const description = describeScriptV2ReferencePick({ nodes, edges, targetNodeId });
  if (!description.valid) return invalid(nodes, edges, description.reason);
  if (!description.connectedIds.has(sourceId)) return unchanged(nodes, edges, 'not-connected');
  const edge = edges.find((item) => item.source === sourceId && item.target === targetNodeId);
  if (!edge) return unchanged(nodes, edges, 'not-connected');
  return {
    ...unchanged(nodes, edges),
    changed: true,
    edges: edges.filter((item) => item !== edge),
    removedEdgeIds: [edge.id],
  };
}
