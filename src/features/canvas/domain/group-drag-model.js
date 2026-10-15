import { canvasWorldPosition } from './groups.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const excludedSource = (node) => ['group', 'script', 'script-v2'].includes(node.type);
const temporary = (node) =>
  node.id === '__temp_connection_node__' || node.type === 'temp' || node.data?.type === 'temp';
const imageStoryboardGroup = (node) =>
  node.type === 'group' &&
  node.data?.storyboardGroupType !== 'video' &&
  (node.data?.storyboardGroupType === 'image' ||
    !!node.data?.sourceScriptNodeId ||
    node.data?.standaloneStoryboardImageGrid === true);
const contains = (outer, inner) =>
  inner.x >= outer.x &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y >= outer.y &&
  inner.y + inner.height <= outer.y + outer.height;
const containsPoint = (bounds, point) =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

/** Source 612574 changes generated count labels, while preserving custom names. */
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

/** Source 761851: only a detached explicit group-generated video loses these dimensions. */
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
 * Pure ordinary onNodeDragStop plan. Positions already contain the final drag projection.
 * The caller owns readiness, document CAS, pointer cancellation and the existing history.
 * Special storyboard grid/ratio/drop handlers are identified without an ordinary fallback.
 */
export function planCanvasGroupDragDrop({
  nodes,
  draggedNodeId,
  draggedIds = [draggedNodeId],
  selectedIds = [],
  surface = 'node',
  getNodeSize,
  releasePoint,
  liveAltCopy = false,
} = {}) {
  const invalid = (reason) => ({ valid: false, changed: false, nodes, kind: 'none', reason });
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(draggedIds) ||
    !Array.isArray(selectedIds) ||
    !['node', 'selection'].includes(surface)
  )
    return invalid('invalidGraph');
  const lookup = new Map(nodes.map((node) => [node?.id, node]));
  if (
    lookup.size !== nodes.length ||
    [...lookup.keys()].some((id) => typeof id !== 'string' || !id)
  )
    return invalid('invalidGraph');
  const result = (kind, next = nodes, extra = {}) => ({
    valid: true,
    changed: next !== nodes,
    nodes: next,
    kind,
    transitionIds: [],
    sourceGroupIds: [],
    ...extra,
  });
  if (liveAltCopy) return result('none', nodes, { reason: 'liveAltCopy' });
  // Source selection stop only persists positions. Its virtual frame has another grid handler.
  if (surface === 'selection') return result('none', nodes, { reason: 'selectionSurface' });
  const primary = lookup.get(draggedNodeId);
  if (!primary || !finitePosition(primary.position)) return invalid('invalidSource');
  if (excludedSource(primary)) return result('none', nodes, { reason: 'ineligibleSource' });
  const parent = primary.parentId && lookup.get(primary.parentId);
  if (primary.parentId && !parent) return invalid('missingParent');
  if (parent?.type === 'group' && parent.data?.standaloneStoryboardImageGrid === true)
    return result('blocked', nodes, {
      sourceGroupIds: [parent.id],
      reason: 'standaloneStoryboardGrid',
    });

  try {
    const worldPosition = (node) => {
      const seen = new Set();
      let current = node;
      while (current) {
        if (seen.has(current.id) || !finitePosition(current.position))
          throw new Error('Invalid drop ancestry');
        seen.add(current.id);
        if (current.parentId && !lookup.has(current.parentId))
          throw new Error('Missing drop ancestor');
        current = lookup.get(current.parentId);
      }
      return canvasWorldPosition(node, lookup);
    };
    const size = (node, group = false) => {
      const measured = getNodeSize?.(node);
      const width = measured
        ? measured.width
        : group
          ? (node.width ?? node.measured?.width ?? 0)
          : (node.measured?.width ?? node.width ?? 0);
      const height = measured
        ? measured.height
        : group
          ? (node.height ?? node.measured?.height ?? 0)
          : (node.measured?.height ?? node.height ?? 0);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
        throw new Error('Invalid drop dimensions');
      return { width, height };
    };
    const bounds = (node, group = false) => ({
      ...worldPosition(node),
      ...size(node, group),
    });
    const selected = new Set(selectedIds),
      visibleSelection = nodes.filter(
        (node) => selected.has(node.id) && !node.hidden && !temporary(node),
      );
    // Source D uses RF roots first; a single root can still have several selected children.
    const effectiveIds =
      draggedIds.length >= 2
        ? draggedIds
        : visibleSelection.length >= 2 && visibleSelection.some((node) => node.id === primary.id)
          ? visibleSelection.map((node) => node.id)
          : draggedIds.length === 1
            ? draggedIds
            : [primary.id];
    const movingIds = new Set(effectiveIds),
      members = effectiveIds
        .map((id) => lookup.get(id))
        .filter((node) => node && !excludedSource(node));
    if (effectiveIds.length >= 2 && members.length >= 2) {
      const targets = nodes.filter(
        (node) =>
          imageStoryboardGroup(node) &&
          node.id !== primary.id &&
          !movingIds.has(node.id) &&
          node.id !== primary.parentId,
      );
      const eligible = (node, target) => node.parentId !== target.id;
      const fullyInside = targets.find((target) =>
        members.some(
          (node) => eligible(node, target) && contains(bounds(target, true), bounds(node)),
        ),
      );
      const centered = targets.find((target) =>
        members.some((node) => {
          if (!eligible(node, target)) return false;
          const value = bounds(node);
          return containsPoint(bounds(target, true), {
            x: value.x + value.width / 2,
            y: value.y + value.height / 2,
          });
        }),
      );
      const pointed =
        finitePosition(releasePoint) &&
        targets.find((target) => containsPoint(bounds(target, true), releasePoint));
      const special = fullyInside || centered || pointed;
      if (special) {
        if (object(primary.data) && primary.data.canvasAltDetachedCopy === true)
          return result(
            'alt-detached',
            nodes.map((node) =>
              node.id === primary.id
                ? {
                    ...primary,
                    position: worldPosition(primary),
                    data: { ...primary.data, canvasAltDetachedCopy: false },
                  }
                : node,
            ),
            { targetGroupId: special.id, reason: 'storyboardMultiAltDetached' },
          );
        return result('blocked', nodes, {
          targetGroupId: special.id,
          reason: 'storyboardMultiDrop',
        });
      }
    }

    const sourceSize = size(primary);
    let next = nodes,
      current = primary,
      detached = false;
    const sourceGroupIds = [],
      transitionIds = [];
    const replace = (id, replacement) => {
      next = next.map((node) => (node.id === id ? replacement : node));
    };
    if (parent) {
      const parentSize = size(parent, true),
        { x, y } = primary.position;
      // Any positive overlap retains the parent. Touching an outside edge is already detached.
      if (!(
        x + sourceSize.width <= 0 ||
        x >= parentSize.width ||
        y + sourceSize.height <= 0 ||
        y >= parentSize.height
      ))
        return result('retain', nodes, { sourceGroupIds: [parent.id] });
      const { parentId: _parent, extent: _extent, ...rest } = primary;
      current = {
        ...rest,
        position: worldPosition(primary),
        data: detachVideoData(primary, parent),
      };
      replace(primary.id, current);
      const childNodeIds = (parent.data?.childNodeIds ?? []).filter((id) => id !== primary.id);
      replace(parent.id, {
        ...parent,
        data: {
          ...parent.data,
          childNodeIds,
          ...countName(parent.data, childNodeIds.length, imageStoryboardGroup(parent)),
        },
      });
      detached = true;
      sourceGroupIds.push(parent.id);
      transitionIds.push(primary.id);
    }

    const world = worldPosition(current);
    const target = nodes.find(
      (node) =>
        node.type === 'group' &&
        node.id !== primary.id &&
        node.id !== primary.parentId &&
        contains(bounds(node, true), { ...world, ...sourceSize }),
    );
    const common = { sourceGroupIds, transitionIds };
    if (target) {
      if (object(current.data) && current.data.canvasAltDetachedCopy === true) {
        replace(current.id, {
          ...current,
          data: { ...current.data, canvasAltDetachedCopy: false },
        });
        return result('alt-detached', next, { ...common, targetGroupId: target.id });
      }
      if (imageStoryboardGroup(target))
        return result('blocked', next, {
          ...common,
          targetGroupId: target.id,
          reason: current.type === 'image' ? 'storyboardImageDrop' : 'storyboardImageOnly',
        });
      // Local nested documents must not create a parent cycle through a video_group child.
      const seen = new Set([primary.id]);
      let ancestor = target;
      while (ancestor) {
        if (seen.has(ancestor.id)) return invalid('cyclicParent');
        seen.add(ancestor.id);
        ancestor = lookup.get(ancestor.parentId);
      }
      const targetPosition = worldPosition(target);
      replace(current.id, {
        ...current,
        parentId: target.id,
        position: { x: world.x - targetPosition.x, y: world.y - targetPosition.y },
      });
      const childNodeIds = [...(target.data?.childNodeIds ?? [])];
      if (!childNodeIds.includes(current.id)) {
        childNodeIds.push(current.id);
        replace(target.id, {
          ...target,
          data: {
            ...target.data,
            childNodeIds,
            ...countName(target.data, childNodeIds.length, false),
          },
        });
      }
      if (!transitionIds.includes(current.id)) transitionIds.push(current.id);
      return result('attach', next, { ...common, targetGroupId: target.id });
    }
    if (!detached && object(current.data) && current.data.canvasAltDetachedCopy === true) {
      replace(current.id, { ...current, data: { ...current.data, canvasAltDetachedCopy: false } });
      return result('alt-detached', next, common);
    }
    return result(detached ? 'detach' : 'none', next, common);
  } catch {
    return invalid('invalidDropData');
  }
}
