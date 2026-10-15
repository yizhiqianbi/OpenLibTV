import { planCanvasParentBounds } from './parent-bounds-model.js';

/** Source NodeResizer exposes four edge controls and four corner handles. */
export const CANVAS_GROUP_RESIZE_DIRECTIONS = Object.freeze([
  'top',
  'right',
  'bottom',
  'left',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

export const CANVAS_GROUP_RESIZE_MIN_SIZE = Object.freeze({ width: 120, height: 80 });

const point = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const invalid = (nodes, reason) => ({ valid: false, changed: false, nodes, reason });
const samePoint = (a, b) => a.x === b.x && a.y === b.y;
const sameSize = (a, b) => a?.width === b.width && a?.height === b.height;

function sourceSize(node, phase, role) {
  // XYResizer reads internal measured dimensions. Stored dimensions are the
  // explicit adapter for this independent renderer, which has no RF lookup.
  const fallback =
    phase === 'finalize' && role === 'child'
      ? { width: 200, height: 120 }
      : { width: 0, height: 0 };
  return {
    width: node.measured?.width ?? node.width ?? fallback.width,
    height: node.measured?.height ?? node.height ?? fallback.height,
  };
}

function readSize(node, getNodeSize, phase, role) {
  const size = getNodeSize ? getNodeSize(node, { phase, role }) : sourceSize(node, phase, role);
  if (
    !Number.isFinite(size?.width) ||
    !Number.isFinite(size?.height) ||
    size.width < 0 ||
    size.height < 0
  )
    throw new Error('Invalid dimensions');
  if (role === 'group' && (size.width === 0 || size.height === 0))
    throw new Error('Invalid group dimensions');
  return Object.freeze({ width: size.width, height: size.height });
}

function extentValid(extent) {
  return (
    Array.isArray(extent) &&
    extent.length === 2 &&
    extent.every(
      (axis) =>
        Array.isArray(axis) &&
        axis.length === 2 &&
        axis.every((value) => typeof value === 'number' && !Number.isNaN(value)),
    ) &&
    extent[0][0] <= extent[1][0] &&
    extent[0][1] <= extent[1][1]
  );
}

/** Exact source NodeData predicates used by resize-end's direct-parent coordinator. */
function specialResizeParent(node) {
  const data = node?.data;
  return (
    data?.type === 'group' &&
    ((typeof data.breakdownSourceNodeId === 'string' && data.breakdownSourceNodeId.length > 0) ||
      data.longVideoSegmentGroup === true)
  );
}

function defaultOrigin(node) {
  return (
    node.origin == null ||
    (Array.isArray(node.origin) &&
      node.origin.length === 2 &&
      node.origin[0] === 0 &&
      node.origin[1] === 0)
  );
}

/**
 * Capture a resize without mutating the graph. Lifecycle, selection and raw graph
 * ownership belong to the caller. Only ordinary/script-image GroupNode callers
 * expose this source control; standalone images and linked videos do not.
 */
export function beginCanvasGroupResize({ nodes, groupId, direction, getNodeSize } = {}) {
  try {
    if (!Array.isArray(nodes) || !CANVAS_GROUP_RESIZE_DIRECTIONS.includes(direction))
      throw new Error('Invalid resize input');
    const lookup = new Map();
    for (const node of nodes) {
      if (!node || typeof node.id !== 'string' || !node.id || lookup.has(node.id))
        throw new Error('Invalid node identity');
      lookup.set(node.id, node);
    }
    const group = lookup.get(groupId);
    if (
      !group ||
      group.type !== 'group' ||
      (group.data?.standaloneStoryboardImageGrid && group.data?.storyboardGroupType === 'image') ||
      (group.data?.sourceScriptNodeId && group.data?.storyboardGroupType === 'video')
    )
      throw new Error('Group has no resize controls');
    if (!point(group.position) || (group.data != null && !object(group.data)))
      throw new Error('Invalid group');
    if (!defaultOrigin(group)) throw new Error('Unsupported node origin');
    // Original public grouping does not set expandParent. RF's additional
    // ancestor expansion needs its own graph protocol and is not emulated here.
    if (group.expandParent && group.parentId) throw new Error('Unsupported parent expansion');
    if (group.parentId && specialResizeParent(lookup.get(group.parentId)))
      throw new Error('Unsupported special parent resize-end layout');
    const seen = new Set([group.id]);
    let current = group;
    while (current.parentId) {
      current = lookup.get(current.parentId);
      if (!current || seen.has(current.id) || !point(current.position))
        throw new Error('Invalid parent hierarchy');
      seen.add(current.id);
    }
    const size = readSize(group, getNodeSize, 'preview', 'group');
    let extent = null;
    if (group.extent === 'parent' && group.parentId) {
      const parentSize = readSize(lookup.get(group.parentId), getNodeSize, 'preview', 'group');
      extent = [
        [0, 0],
        [parentSize.width, parentSize.height],
      ];
    } else if (group.extent != null && group.extent !== 'parent') {
      if (!extentValid(group.extent)) throw new Error('Invalid resize extent');
      extent = group.extent.map((axis) => [...axis]);
    }
    if (extent) extent = Object.freeze(extent.map(Object.freeze));
    const children = [];
    let childExtent = null;
    for (const node of nodes) {
      if (node.parentId !== group.id) continue;
      if (!point(node.position) || !defaultOrigin(node))
        throw new Error('Invalid child position/origin');
      const previewSize = readSize(node, getNodeSize, 'preview', 'child');
      const finalSize = readSize(node, getNodeSize, 'finalize', 'child');
      children.push(
        Object.freeze({ id: node.id, position: Object.freeze({ ...node.position }), finalSize }),
      );
      if (node.extent === 'parent' || node.expandParent) {
        const left = group.position.x + node.position.x;
        const top = group.position.y + node.position.y;
        const right = left + previewSize.width;
        const bottom = top + previewSize.height;
        childExtent = childExtent
          ? [
              [Math.min(left, childExtent[0][0]), Math.min(top, childExtent[0][1])],
              [Math.max(right, childExtent[1][0]), Math.max(bottom, childExtent[1][1])],
            ]
          : [
              [left, top],
              [right, bottom],
            ];
      }
    }
    if (childExtent) childExtent = Object.freeze(childExtent.map(Object.freeze));
    return {
      valid: true,
      session: Object.freeze({
        nodes,
        groupId,
        parentId: group.parentId,
        getNodeSize,
        direction,
        position: Object.freeze({ ...group.position }),
        size,
        extent,
        childExtent,
        children: Object.freeze(children),
      }),
    };
  } catch (error) {
    return invalid(nodes, error.message);
  }
}

/** Default-origin branch of archived XYResizer's getDimensionsAfterResize. */
function candidateFor(session, delta) {
  if (!point(delta)) throw new Error('Invalid pointer delta');
  const horizontal = session.direction.includes('left') || session.direction.includes('right');
  const vertical = session.direction.includes('top') || session.direction.includes('bottom');
  const left = session.direction.includes('left');
  const top = session.direction.includes('top');
  let dx = Math.floor(horizontal ? delta.x : 0);
  let dy = Math.floor(vertical ? delta.y : 0);
  const { width, height } = session.size;
  const { x, y } = session.position;
  const desiredWidth = width + (left ? -dx : dx);
  const desiredHeight = height + (top ? -dy : dy);
  let clipX = Math.max(
    0,
    CANVAS_GROUP_RESIZE_MIN_SIZE.width - desiredWidth,
    desiredWidth - Number.MAX_VALUE,
  );
  let clipY = Math.max(
    0,
    CANVAS_GROUP_RESIZE_MIN_SIZE.height - desiredHeight,
    desiredHeight - Number.MAX_VALUE,
  );
  const extent = session.extent;
  if (extent) {
    if (left && dx < 0) clipX = Math.max(clipX, extent[0][0] - (x + dx));
    else if (!left && dx > 0) clipX = Math.max(clipX, x + desiredWidth - extent[1][0]);
    if (top && dy < 0) clipY = Math.max(clipY, extent[0][1] - (y + dy));
    else if (!top && dy > 0) clipY = Math.max(clipY, y + desiredHeight - extent[1][1]);
  }
  const childExtent = session.childExtent;
  if (childExtent) {
    if (left && dx > 0) clipX = Math.max(clipX, x + dx - childExtent[0][0]);
    else if (!left && dx < 0) clipX = Math.max(clipX, childExtent[1][0] - (x + desiredWidth));
    if (top && dy > 0) clipY = Math.max(clipY, y + dy - childExtent[0][1]);
    else if (!top && dy < 0) clipY = Math.max(clipY, childExtent[1][1] - (y + desiredHeight));
  }
  dx += dx < 0 ? clipX : -clipX;
  dy += dy < 0 ? clipY : -clipY;
  const candidate = {
    x: left ? x + dx : x,
    y: top ? y + dy : y,
    width: width + (left ? -dx : dx),
    height: height + (top ? -dy : dy),
  };
  if (
    !point(candidate) ||
    !Number.isFinite(candidate.width) ||
    !Number.isFinite(candidate.height) ||
    candidate.width <= 0 ||
    candidate.height <= 0
  )
    throw new Error('Invalid projected bounds');
  return candidate;
}

function geometryChanged(session, candidate) {
  return !samePoint(session.position, candidate) || !sameSize(session.size, candidate);
}

function project(session, candidate) {
  if (!geometryChanged(session, candidate)) return session.nodes;
  const dx = candidate.x - session.position.x;
  const dy = candidate.y - session.position.y;
  const childIds = new Set(session.children.map((node) => node.id));
  return session.nodes.map((node) => {
    if (node.id === session.groupId)
      return {
        ...node,
        position: { x: candidate.x, y: candidate.y },
        width: candidate.width,
        height: candidate.height,
        measured: { width: candidate.width, height: candidate.height },
        resizing: true,
      };
    if ((dx || dy) && childIds.has(node.id))
      return { ...node, position: { x: node.position.x - dx, y: node.position.y - dy } };
    return node;
  });
}

/** Delta is current snapped flow pointer minus its initial snapped flow pointer. */
export function projectCanvasGroupResize({ session, delta } = {}) {
  if (!session?.nodes || !Array.isArray(session.children))
    return invalid(session?.nodes, 'Invalid resize session');
  try {
    const candidate = candidateFor(session, delta);
    const nodes = project(session, candidate);
    return { valid: true, changed: nodes !== session.nodes, nodes, candidate };
  } catch (error) {
    return invalid(session.nodes, error.message);
  }
}

function finalData(data, size) {
  const next = { ...data, nodeWidth: size.width, nodeHeight: size.height };
  if (!next.name && typeof next.label === 'string') next.name = next.label;
  delete next.label;
  return next;
}

/**
 * Source tB runs only after an effective resize. didResize records an earlier
 * effective preview when the pointer subsequently returns to its initial point.
 * This applies tB plus RF's subsequent resizing:false dimensions event; the
 * latter keeps candidate measured dimensions while stored bounds may expand.
 */
export function finalizeCanvasGroupResize({ session, delta, didResize = false } = {}) {
  const preview = projectCanvasGroupResize({ session, delta });
  if (!preview.valid || (!preview.changed && !didResize)) return preview;
  try {
    const candidate = preview.candidate;
    let left = 0,
      top = 0,
      width = candidate.width,
      height = candidate.height;
    if (session.children.length) {
      let minX = Infinity,
        minY = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      const dx = candidate.x - session.position.x;
      const dy = candidate.y - session.position.y;
      for (const child of session.children) {
        const x = child.position.x - dx,
          y = child.position.y - dy;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        right = Math.max(right, x + child.finalSize.width);
        bottom = Math.max(bottom, y + child.finalSize.height);
      }
      left = Math.max(0, 12 - minX);
      top = Math.max(0, 12 - minY);
      width = Math.max(candidate.width + left, right + 12);
      height = Math.max(candidate.height + top, bottom + 12);
    }
    if (!Number.isFinite(width) || !Number.isFinite(height))
      throw new Error('Invalid final bounds');
    const childIds = new Set(session.children.map((node) => node.id));
    const nodes = preview.nodes.map((node) => {
      if (node.id === session.groupId)
        return {
          ...node,
          position: { x: candidate.x - left, y: candidate.y - top },
          width,
          height,
          measured: { width: candidate.width, height: candidate.height },
          resizing: false,
          ...(session.children.length ? { data: finalData(node.data, { width, height }) } : {}),
        };
      if ((left || top) && childIds.has(node.id))
        return { ...node, position: { x: node.position.x + left, y: node.position.y + top } };
      return node;
    });
    // Source handleNodesChange calls pF for this resized node's direct parent
    // after the resizing:false event. Special parents were rejected at begin;
    // this does not recursively resize ancestors or add another transaction.
    const parentPlan = session.parentId
      ? planCanvasParentBounds({
          nodes,
          groupIds: [session.parentId],
          getNodeSize: session.getNodeSize,
        })
      : { valid: true, nodes };
    if (!parentPlan.valid) throw new Error('Invalid parent resize-end bounds');
    const finalGroup = parentPlan.nodes.find((node) => node.id === session.groupId);
    return {
      valid: true,
      changed: true,
      nodes: parentPlan.nodes,
      candidate,
      bounds: { ...finalGroup.position, width: finalGroup.width, height: finalGroup.height },
    };
  } catch (error) {
    return invalid(session.nodes, error.message);
  }
}
