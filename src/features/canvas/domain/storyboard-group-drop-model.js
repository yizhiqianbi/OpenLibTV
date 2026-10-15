import { canvasWorldPosition } from './groups.js';
import {
  buildStoryboardImageRatioPatch,
  canStoryboardImageGridAcceptIncoming,
  isStoryboardImageGridFullForIncoming,
} from './storyboard-grid-model.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const excludedSource = (node) => ['group', 'script', 'script-v2'].includes(node.type);
const temporary = (node) =>
  node.id === '__temp_connection_node__' || node.type === 'temp' || node.data?.type === 'temp';
const storyboardGroup = (node) =>
  node.type === 'group' &&
  node.data?.storyboardGroupType !== 'video' &&
  (node.data?.storyboardGroupType === 'image' ||
    !!node.data?.sourceScriptNodeId ||
    node.data?.standaloneStoryboardImageGrid === true);
const contains = (outer, inner) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;
const containsPoint = (bounds, point) =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

function dropGeometry(lookup, getNodeSize, surface) {
  const worldPosition = (node, graph = lookup) => {
    const seen = new Set();
    let current = node;
    while (current) {
      if (seen.has(current.id) || !finitePosition(current.position))
        throw new Error('Invalid drop ancestry');
      seen.add(current.id);
      if (current.parentId && !graph.has(current.parentId))
        throw new Error('Missing drop ancestor');
      current = graph.get(current.parentId);
    }
    return canvasWorldPosition(node, graph);
  };
  const size = (node, role) => {
    const adapted = getNodeSize?.(node, { role, surface });
    const width = adapted
      ? adapted.width
      : role === 'group'
        ? (node.width ?? node.measured?.width ?? 0)
        : role === 'single'
          ? (node.measured?.width ?? node.width ?? 0)
          : (node.measured?.width ??
            (typeof node.width === 'number' ? node.width : undefined) ??
            350);
    const height = adapted
      ? adapted.height
      : role === 'group'
        ? (node.height ?? node.measured?.height ?? 0)
        : role === 'single'
          ? (node.measured?.height ?? node.height ?? 0)
          : (node.measured?.height ??
            (typeof node.height === 'number' ? node.height : undefined) ??
            350);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
      throw new Error('Invalid drop dimensions');
    return { width, height };
  };
  const bounds = (node, role = 'multi') => ({
    ...worldPosition(node),
    ...size(node, role),
  });
  return { worldPosition, size, bounds };
}

function multiTarget(targets, members, bounds, releasePoint) {
  const eligible = (node, group) => node.parentId !== group.id;
  return (
    targets.find((group) =>
      members.some(
        (node) => eligible(node, group) && contains(bounds(group, 'group'), bounds(node)),
      ),
    ) ||
    targets.find((group) =>
      members.some((node) => {
        if (!eligible(node, group)) return false;
        const value = bounds(node);
        return containsPoint(bounds(group, 'group'), {
          x: value.x + value.width / 2,
          y: value.y + value.height / 2,
        });
      }),
    ) ||
    (finitePosition(releasePoint) &&
      targets.find((group) => containsPoint(bounds(group, 'group'), releasePoint)))
  );
}

/** Source virtual-frame J: preview capacity count; Alt suppresses hover, not final Z drop. */
export function resolveCanvasStoryboardFrameDropHover({
  nodes,
  draggedIds = [],
  liveAltCopy = false,
  getNodeSize,
} = {}) {
  const empty = { valid: true, targetGroupId: null, count: 0 };
  const invalid = { valid: false, targetGroupId: null, count: 0 };
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(draggedIds) ||
    draggedIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(draggedIds).size !== draggedIds.length
  )
    return invalid;
  const lookup = new Map(nodes.map((node) => [node?.id, node]));
  if (
    lookup.size !== nodes.length ||
    [...lookup.keys()].some((id) => typeof id !== 'string' || !id)
  )
    return invalid;
  if (liveAltCopy || draggedIds.length < 2) return empty;
  const members = draggedIds.map((id) => lookup.get(id)).filter(Boolean);
  if (members.length < 2 || members.some((node) => node.type !== 'image')) return empty;
  try {
    const { bounds } = dropGeometry(lookup, getNodeSize, 'selection');
    // J's image-only gate makes a moved group impossible; source needs no target exclusion.
    const target = multiTarget(nodes.filter(storyboardGroup), members, bounds);
    if (!target) return empty;
    const included = new Set(members.map((node) => node.id));
    const incoming = members.filter((node) => node.parentId !== target.id).length;
    const existing = nodes.filter(
      (node) => node.parentId === target.id && node.type === 'image' && !included.has(node.id),
    ).length;
    if (
      incoming <= 0 ||
      !canStoryboardImageGridAcceptIncoming(
        existing,
        incoming,
        target.data?.storyboardManualGridCols,
        target.data?.storyboardManualGridRows,
      )
    )
      return empty;
    return { valid: true, targetGroupId: target.id, count: incoming };
  } catch {
    return invalid;
  }
}

function countName(data, count, storyboard) {
  const name = data?.name;
  if (
    typeof name === 'string' &&
    name.length > 0 &&
    !/^分组\s*\d+\s*个节点$/.test(name) &&
    !/^分镜组\s*\d+\s*个节点$/.test(name)
  )
    return {};
  return { name: `${storyboard ? '分镜组' : '分组'} ${count} 个节点` };
}

/** Source store updateNodeData t4/t6 normalizes legacy label and deletes undefined patch keys. */
function dataPatch(data, patch) {
  const merged = { ...data, ...patch };
  const name = typeof merged.name === 'string' ? merged.name : undefined;
  const label = typeof merged.label === 'string' ? merged.label : undefined;
  if (!name && label) merged.name = label;
  delete merged.label;
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete merged[key];
  return merged;
}

function detachVideoData(node, parent) {
  const data = node.data;
  if (
    node.type !== 'video' ||
    parent.type !== 'group' ||
    parent.data?.storyboardGroupType !== 'video' ||
    data?._explicitContentDims !== true ||
    data.params?.scene !== 'group-generate'
  )
    return data;
  const {
    _explicitContentDims: _explicit,
    contentWidth: _width,
    contentHeight: _height,
    ...next
  } = data;
  const { scene: _scene, ...params } = data.params;
  return { ...next, params };
}

/**
 * Source node-stop M/m3 and virtual-frame Z/L. Single standalone drops are owned
 * by the grid session; multi and frame drops use the same source image-group gate.
 * Positions are already projected to the final pointer position. Completion metadata
 * must be dispatched by the caller after committing nodes, outside a state updater.
 */
export function planCanvasStoryboardGroupDrop({
  nodes,
  draggedNodeId,
  draggedIds = draggedNodeId ? [draggedNodeId] : [],
  selectedIds = [],
  surface = 'node',
  releasePoint,
  liveAltCopy = false,
  getNodeSize,
} = {}) {
  const invalid = (reason) => ({
    handled: false,
    valid: false,
    changed: false,
    nodes,
    kind: 'none',
    transitionIds: [],
    completion: {},
    reason,
  });
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(draggedIds) ||
    !Array.isArray(selectedIds) ||
    !['node', 'selection'].includes(surface) ||
    draggedIds.some((id) => typeof id !== 'string' || !id) ||
    new Set(draggedIds).size !== draggedIds.length
  )
    return invalid('invalidGraph');
  const lookup = new Map(nodes.map((node) => [node?.id, node]));
  if (
    lookup.size !== nodes.length ||
    [...lookup.keys()].some((id) => typeof id !== 'string' || !id)
  )
    return invalid('invalidGraph');
  const result = (handled, kind = 'none', next = nodes, extra = {}) => {
    const completion = { ...extra.completion };
    if (handled && surface === 'node') {
      const parentId = next.find((node) => node.id === draggedNodeId)?.parentId;
      // Outer source ce expands only the primary's final parent, including multi stops.
      completion.parentBoundsGroupIds = parentId ? [parentId] : [];
    }
    return {
      handled,
      valid: true,
      changed: next !== nodes,
      nodes: next,
      kind,
      transitionIds: [],
      ...extra,
      completion,
    };
  };
  // Source node idMap stop returns; virtual ee still invokes Z for the copied frame.
  if (surface === 'node' && liveAltCopy)
    return result(false, 'none', nodes, { reason: 'liveAltCopy' });
  const primary = lookup.get(draggedNodeId);
  if (surface === 'node' && !primary) return invalid('invalidSource');
  try {
    const { worldPosition, size, bounds } = dropGeometry(lookup, getNodeSize, surface);
    const childIds = (group) => {
      const ids = group.data?.childNodeIds ?? [];
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
        throw new Error('Invalid group children');
      return ids;
    };
    let next = nodes;
    const current = new Map(lookup);
    const transitionIds = [];
    const write = (id, changes, removed = [], sortParents = true) => {
      if (changes.parentId) {
        // Local document guard: image parents are malformed; never create a parent cycle.
        let parent = current.get(changes.parentId);
        const seen = new Set([id]);
        while (parent) {
          if (seen.has(parent.id)) throw new Error('Cyclic drop parent');
          seen.add(parent.id);
          parent = current.get(parent.parentId);
        }
      }
      const updated = { ...current.get(id), ...changes };
      for (const key of removed) delete updated[key];
      current.set(id, updated);
      next = next.map((node) => (node.id === id ? updated : node));
      // Source updateNode/updateNodes stable-sort roots first on every parentId patch.
      if (sortParents && (removed.includes('parentId') || Object.hasOwn(changes, 'parentId')))
        next.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
    };
    const detach = (node, { cleanParent = false } = {}) => {
      const parent = node.parentId && current.get(node.parentId);
      const position = worldPosition(node, current);
      write(
        node.id,
        { position, ...(cleanParent && parent ? { data: detachVideoData(node, parent) } : {}) },
        ['parentId', 'extent'],
      );
      transitionIds.push(node.id);
      if (cleanParent && parent) {
        const ids = childIds(parent).filter((id) => id !== node.id);
        write(parent.id, {
          data: dataPatch(parent.data, {
            childNodeIds: ids,
            ...countName(parent.data, ids.length, storyboardGroup(parent)),
          }),
        });
      }
    };
    const ratio = (node, group, graph, frame = false) => {
      if (!frame && group.data?.storyboardPreserveChildDimensions === true) return;
      const data = node.data;
      if (
        (data?.params != null && !object(data.params)) ||
        (data?.params?.settings != null && !object(data.params.settings))
      )
        throw new Error('Invalid image parameters');
      const target = frame
        ? { ...group, data: { ...group.data, storyboardPreserveChildDimensions: false } }
        : group;
      const patch = buildStoryboardImageRatioPatch({ node, group: target, nodes: graph });
      if (!patch) return;
      write(node.id, { ...patch, data: dataPatch(current.get(node.id).data, patch.data) });
    };
    const updateTarget = (group, members, always) => {
      const ids = [...childIds(group)];
      for (const member of members) if (!ids.includes(member.id)) ids.push(member.id);
      if (always || ids.length !== childIds(group).length)
        write(group.id, {
          data: dataPatch(current.get(group.id).data, {
            childNodeIds: ids,
            ...countName(group.data, ids.length, true),
          }),
        });
    };
    const warning = (key) => ({
      warningKey: key,
      warning:
        key === 'storyboardGroupImageOnly' ? '分镜组支持图像内容' : '分镜宫格已满，无法继续添加',
      ...(surface === 'selection' ? { clearHover: true } : {}),
    });
    const multiDrop = (members, movingIds) => {
      const targets = nodes.filter(
        (group) =>
          storyboardGroup(group) &&
          !movingIds.has(group.id) &&
          (surface === 'selection' || (group.id !== primary.id && group.id !== primary.parentId)),
      );
      const target = multiTarget(
        targets,
        members,
        bounds,
        surface === 'node' ? releasePoint : undefined,
      );
      if (!target) return null;
      childIds(target);
      const extra = { targetGroupId: target.id };
      const marker = surface === 'node' && members.find((node) => node.id === primary.id);
      if (marker?.data?.canvasAltDetachedCopy === true) {
        write(marker.id, {
          position: worldPosition(marker),
          data: dataPatch(marker.data, { canvasAltDetachedCopy: false }),
        });
        return result(true, 'alt-detached', next, extra);
      }
      const images = members.filter((node) => node.type === 'image');
      const incoming = images.filter((node) => node.parentId !== target.id);
      const included = new Set(images.map((node) => node.id));
      const existing = nodes.filter(
        (node) => node.parentId === target.id && node.type === 'image' && !included.has(node.id),
      ).length;
      const rejection = members.some((node) => node.type !== 'image')
        ? 'storyboardGroupImageOnly'
        : !canStoryboardImageGridAcceptIncoming(
              existing,
              incoming.length,
              target.data?.storyboardManualGridCols,
              target.data?.storyboardManualGridRows,
            )
          ? 'storyboardGridFull'
          : null;
      if (rejection) {
        // Source frame failure only clears hover. Node m9 detaches every filtered member.
        if (surface === 'node') for (const member of members) detach(current.get(member.id));
        return result(true, 'rejected', next, {
          ...extra,
          transitionIds,
          completion: warning(rejection),
        });
      }
      for (const member of images) {
        const node = current.get(member.id);
        const position = worldPosition(node, current),
          origin = worldPosition(target);
        write(
          node.id,
          { parentId: target.id, position: { x: position.x - origin.x, y: position.y - origin.y } },
          surface === 'selection' ? ['extent'] : [],
          surface !== 'selection',
        );
        transitionIds.push(node.id);
        // Frame L reads the original snapshot; node M sees previously attached siblings.
        ratio(
          current.get(node.id),
          target,
          surface === 'selection' ? nodes : next,
          surface === 'selection',
        );
      }
      if (surface === 'selection') next.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
      updateTarget(target, images, true);
      const completion = {};
      if (surface === 'selection') {
        for (const member of members) write(member.id, { selected: false });
        const cleared = new Set(members.map((node) => node.id));
        completion.clearSelectionIds = [...cleared];
        completion.selectedIds = selectedIds.filter((id) => !cleared.has(id));
        completion.clearHover = true;
        completion.clearFrame = true;
      }
      return result(true, 'attach', next, { ...extra, transitionIds, completion });
    };

    if (surface === 'selection') {
      const members = draggedIds.map((id) => lookup.get(id)).filter(Boolean);
      if (members.length < 2)
        return result(false, 'none', nodes, { reason: 'insufficientFrameMembers' });
      return multiDrop(members, new Set(draggedIds)) || result(false);
    }
    const selected = new Set(selectedIds),
      visible = nodes.filter((node) => selected.has(node.id) && !node.hidden && !temporary(node));
    const effectiveIds =
      draggedIds.length >= 2
        ? draggedIds
        : visible.length >= 2 && visible.some((node) => node.id === primary.id)
          ? visible.map((node) => node.id)
          : draggedIds.length === 1
            ? draggedIds
            : [primary.id];
    if (effectiveIds.length >= 2) {
      const members = effectiveIds
        .map((id) => lookup.get(id))
        .filter((node) => node && !excludedSource(node));
      if (members.length >= 2) {
        const first = members.find((node) => node.id === primary.id) || members[0];
        const plan = multiDrop(
          [first, ...members.filter((node) => node.id !== first.id)],
          new Set(effectiveIds),
        );
        if (plan) return plan;
      }
    }
    if (excludedSource(primary))
      return result(false, 'none', nodes, { reason: 'ineligibleSource' });
    const parent = primary.parentId && lookup.get(primary.parentId);
    if (primary.parentId && !parent) return invalid('missingParent');
    if (primary.type === 'image' && parent?.data?.standaloneStoryboardImageGrid === true)
      return result(false, 'none', nodes, { reason: 'standaloneSource' });
    if (parent) {
      const { width, height } = size(primary, 'single'),
        outer = size(parent, 'group'),
        position = primary.position;
      worldPosition(primary);
      if (!(
        position.x + width <= 0 ||
        position.x >= outer.width ||
        position.y + height <= 0 ||
        position.y >= outer.height
      ))
        return result(false, 'none', nodes, { reason: 'parentOverlap' });
    }
    // Single stop first picks ANY group. An earlier ordinary group must win.
    const value = bounds(primary, 'single');
    const target = nodes.find(
      (group) =>
        group.type === 'group' &&
        group.id !== primary.id &&
        group.id !== primary.parentId &&
        contains(bounds(group, 'group'), value),
    );
    if (!target || !storyboardGroup(target)) return result(false);
    childIds(target);
    if (parent) detach(primary, { cleanParent: true });
    const node = current.get(primary.id),
      position = worldPosition(node, current),
      extra = { targetGroupId: target.id, transitionIds };
    if (node.data?.canvasAltDetachedCopy === true) {
      write(node.id, { position, data: dataPatch(node.data, { canvasAltDetachedCopy: false }) });
      return result(true, 'alt-detached', next, extra);
    }
    const count = nodes.filter(
      (node) => node.parentId === target.id && node.type === 'image' && node.id !== primary.id,
    ).length;
    const rejection =
      node.type !== 'image'
        ? 'storyboardGroupImageOnly'
        : isStoryboardImageGridFullForIncoming(
              count,
              target.data?.storyboardManualGridCols,
              target.data?.storyboardManualGridRows,
            )
          ? 'storyboardGridFull'
          : null;
    if (rejection) {
      if (!transitionIds.includes(node.id)) detach(node);
      return result(true, 'rejected', next, { ...extra, completion: warning(rejection) });
    }
    // With no active grid session, source V still rejects non-images/full standalone
    // targets. Only an admissible image is deferred to the positive slot protocol.
    if (target.data?.standaloneStoryboardImageGrid === true)
      return result(false, 'none', nodes, { targetGroupId: target.id, reason: 'standaloneTarget' });
    const origin = worldPosition(target);
    write(node.id, {
      parentId: target.id,
      position: { x: position.x - origin.x, y: position.y - origin.y },
    });
    if (!transitionIds.includes(node.id)) transitionIds.push(node.id);
    ratio(current.get(node.id), target, nodes);
    updateTarget(target, [node], false);
    return result(true, 'attach', next, extra);
  } catch {
    return invalid('invalidDropGeometry');
  }
}
