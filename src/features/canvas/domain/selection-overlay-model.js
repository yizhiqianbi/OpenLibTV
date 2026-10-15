import { canvasWorldPosition, isCanvasGroup } from './groups.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

const sourceSize = (node) => ({
  width: node.measured?.width ?? node.width ?? 200,
  height: node.measured?.height ?? node.height ?? 120,
});

/** Source 189224: one real group and its selected descendants keep the real shell. */
export function canvasSelectionSingleRealGroup(nodes = [], selectedIds = []) {
  if (!Array.isArray(nodes) || !Array.isArray(selectedIds)) return null;
  const lookup = new Map(nodes.filter(Boolean).map((node) => [node.id, node]));
  const selected = [...new Set(selectedIds)].map((id) => lookup.get(id)).filter(Boolean);
  const groups = selected.filter(isCanvasGroup);
  if (groups.length !== 1) return null;
  const group = groups[0];
  const isMember = (node) => {
    const seen = new Set();
    let current = node;
    while (current && !seen.has(current.id)) {
      if (current.id === group.id) return true;
      seen.add(current.id);
      current = lookup.get(current.parentId);
    }
    return false;
  };
  return selected.every(isMember) ? group : null;
}

/**
 * Source virtual selection expands only direct children of selected ordinary groups.
 * sourceSeedIds intentionally remain unfiltered: the batch protocol owns source eligibility.
 */
export function canvasVirtualSelection({
  nodes = [],
  selectedIds = [],
  zoom = 1,
  getNodeSize = sourceSize,
} = {}) {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(selectedIds) ||
    !finite(zoom) ||
    zoom <= 0 ||
    typeof getNodeSize !== 'function'
  )
    return null;
  const lookup = new Map(nodes.filter(Boolean).map((node) => [node.id, node]));
  const selected = [...new Set(selectedIds)].map((id) => lookup.get(id)).filter(Boolean);
  if (
    canvasSelectionSingleRealGroup(
      [...lookup.values()],
      selected.map((node) => node.id),
    )
  )
    return null;
  const selectedSet = new Set(selected.map((node) => node.id));
  const groupIds = selected.filter(isCanvasGroup).map((node) => node.id);
  const groupSet = new Set(groupIds);
  const targetLookup = new Map();
  for (const node of [
    ...selected.filter((node) => !isCanvasGroup(node)),
    ...nodes.filter((node) => node && groupSet.has(node.parentId)),
  ])
    targetLookup.set(node.id, node);
  const targets = [...targetLookup.values()];
  if (targets.length < 2) return null;
  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const node of targets) {
    const point = canvasWorldPosition(node, lookup);
    const size = getNodeSize(node);
    if (!size || !finite(size.width) || !finite(size.height) || size.width < 0 || size.height < 0)
      return null;
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x + size.width);
    bottom = Math.max(bottom, point.y + size.height);
  }
  const compensation = canvasSelectionZoomPadding(zoom);
  const bounds = {
    x: left - 45 - compensation,
    y: top - 56 - compensation,
    width: right - left + 90 + 2 * compensation,
    height: bottom - top + 76 + 2 * compensation,
  };
  const targetNodeIds = targets.map((node) => node.id);
  return {
    visible: true,
    bounds,
    position: { x: left + (right - left) / 2, y: bounds.y },
    targetNodeIds,
    sourceSeedIds: [...targetNodeIds],
    dragNodeIds: selected
      .filter((node) => !node.parentId || !selectedSet.has(node.parentId))
      .map((node) => node.id),
    groupsToRemoveIds: groupIds,
  };
}

/** Source 957166. The virtual bounds already contain the first compensation. */
export function canvasSelectionZoomPadding(zoom) {
  return finite(zoom) && zoom > 0 ? (20 * (Math.sqrt(zoom) - zoom)) / zoom : 0;
}

/** Screen-local projection only: no selection expansion, node lookup, or graph writes. */
export function canvasSelectionOverlayProjection({ bounds, view, zoom } = {}) {
  if (
    !bounds ||
    !['x', 'y', 'width', 'height'].every((key) => finite(bounds[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  const scale = zoom ?? view?.z ?? 1;
  const offsetX = view?.x ?? 0;
  const offsetY = view?.y ?? 0;
  if (!finite(scale) || scale <= 0 || !finite(offsetX) || !finite(offsetY)) return null;
  const x = offsetX + bounds.x * scale;
  const y = offsetY + bounds.y * scale;
  const compensation = canvasSelectionZoomPadding(scale) * scale;
  return {
    frame: {
      left: x - compensation,
      top: y - compensation,
      width: bounds.width * scale + 2 * compensation,
      height: bounds.height * scale + 2 * compensation,
      borderWidth: Math.max(0.75, scale),
    },
    toolbar: { x: x + (bounds.width * scale) / 2, y },
    add: { x: x + bounds.width * scale, y: y + (bounds.height * scale) / 2 },
  };
}

/** Source nB: magnetic movement is clamped in screen pixels, independent of zoom. */
export function canvasSelectionAddHover(client, bounds) {
  if (
    !client ||
    !bounds ||
    !['x', 'y'].every((key) => finite(client[key])) ||
    !['left', 'top', 'width', 'height'].every((key) => finite(bounds[key]))
  )
    return null;
  return {
    x: Math.max(-28, Math.min(28, client.x - (bounds.left + bounds.width / 2))),
    y: Math.max(-28, Math.min(28, client.y - (bounds.top + bounds.height / 2))),
  };
}
