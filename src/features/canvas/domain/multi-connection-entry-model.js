import { canvasWorldPosition } from './groups.js';
import { getCanvasGroupConnectionSources } from './multi-connection-model.js';
import {
  canvasSelectionOverlayProjection,
  canvasSelectionSingleRealGroup,
  canvasVirtualSelection,
} from './selection-overlay-model.js';

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const sourceGroupSize = (node) => ({
  width: node.measured?.width ?? node.width ?? 0,
  height: node.measured?.height ?? node.height ?? 0,
});

/** Source 170exq @6670: this is a derived storyboard shell, not an ordinary group. */
function isShotBreakdownGroup(data) {
  return (
    !!data &&
    data.type === 'group' &&
    typeof data.breakdownSourceNodeId === 'string' &&
    data.breakdownSourceNodeId.length > 0
  );
}

/** Source sr: only these derived group markers suppress the real output entry. */
export function isCanvasOrdinaryMultiConnectionGroup(node) {
  return (
    node?.type === 'group' && !node.data?.sourceScriptNodeId && !isShotBreakdownGroup(node.data)
  );
}

/**
 * Source sr/sa/sn and the two nJ callers: virtual selection has priority; a single
 * ordinary real group instead exposes its recursive leaves from the real shell.
 * This descriptor owns no gesture, writable-mode, graph, or document lifetime.
 */
export function resolveCanvasMultiConnectionEntry({
  nodes = [],
  selectedIds = [],
  zoom = 1,
  getNodeSize,
} = {}) {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(selectedIds) ||
    !finite(zoom) ||
    zoom <= 0 ||
    (getNodeSize !== undefined && typeof getNodeSize !== 'function')
  )
    return null;

  const currentNodes = nodes.filter(Boolean);
  const selection = canvasVirtualSelection({
    nodes: currentNodes,
    selectedIds,
    zoom,
    getNodeSize,
  });
  if (selection)
    return {
      ...selection,
      kind: 'selection',
      entryKey: `selection:${JSON.stringify(selection.targetNodeIds)}`,
    };

  const group = canvasSelectionSingleRealGroup(currentNodes, selectedIds);
  if (!isCanvasOrdinaryMultiConnectionGroup(group)) return null;

  const size = (getNodeSize ?? sourceGroupSize)(group);
  if (!size || !finite(size.width) || !finite(size.height) || size.width <= 0 || size.height <= 0)
    return null;
  const sources = getCanvasGroupConnectionSources(currentNodes, group.id);
  if (!sources.length) return null;

  const point = canvasWorldPosition(group, currentNodes);
  return {
    kind: 'group',
    entryKey: `group:${group.id}`,
    groupId: group.id,
    bounds: { ...point, width: size.width, height: size.height },
    sourceSeedIds: sources.map((node) => node.id),
  };
}

/** Group bounds project directly; they do not receive virtual-selection padding. */
export function canvasMultiConnectionEntryProjection({ entry, view, zoom } = {}) {
  if (entry?.kind === 'selection')
    return canvasSelectionOverlayProjection({ bounds: entry.bounds, view, zoom });
  if (entry?.kind !== 'group') return null;

  const bounds = entry.bounds;
  const scale = zoom ?? view?.z ?? 1;
  const x = view?.x ?? 0;
  const y = view?.y ?? 0;
  if (
    !bounds ||
    !['x', 'y', 'width', 'height'].every((key) => finite(bounds[key])) ||
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    !finite(scale) ||
    scale <= 0 ||
    !finite(x) ||
    !finite(y)
  )
    return null;

  return {
    add: {
      x: x + (bounds.x + bounds.width) * scale,
      y: y + (bounds.y + bounds.height / 2) * scale,
    },
  };
}
