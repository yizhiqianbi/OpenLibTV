import { createLocalId } from '../../editor/model.js';
import { canvasWorldPosition } from './groups.js';
import {
  buildStoryboardGridChildExplicitDims,
  computeStoryboardGridLayout,
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
  resolveStoryboardGridSlotCount,
} from './storyboard-grid-model.js';

export const STORYBOARD_GRID_CREATION_DISABLED_REASON =
  '分镜组仅支持图片节点，且组内节点数量不可超过25个';
export const STORYBOARD_GRID_SHELL_BACKGROUND = 'var(--storyboard-group-shell-bg, #212121)';

const positive = (value) => Number.isFinite(value) && value > 0;
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);
const columns = (count) => (count <= 4 ? 2 : count <= 9 ? 3 : count <= 16 ? 4 : 5);

/** Source lM/lR: root non-script targets, in graph order, before the image/count gate. */
export function resolveStoryboardGridCreation({ nodes, selectedIds } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(selectedIds))
    return { allowed: false, reason: STORYBOARD_GRID_CREATION_DISABLED_REASON, sourceIds: [] };
  const selected = new Set(selectedIds);
  const candidates = nodes.filter(
    (node) =>
      selected.has(node.id) && !node.parentId && !['script', 'script-v2'].includes(node.type),
  );
  const allowed =
    candidates.length >= 2 &&
    candidates.length <= 25 &&
    candidates.every((node) => node.type === 'image');
  return {
    allowed,
    reason: allowed ? null : STORYBOARD_GRID_CREATION_DISABLED_REASON,
    sourceIds: candidates.map((node) => node.id),
    columns: columns(candidates.length),
  };
}

// The source can additionally consult its media display/cache adapter. A caller may
// supply getNodeSize or bounds when that metadata is available outside the document.
function estimatedSize(node) {
  const data = node.data;
  if (positive(data?.contentWidth) && positive(data?.contentHeight))
    return { width: data.contentWidth, height: data.contentHeight };
  const ratio = extractStoryboardRatioFromNodeParams(data?.params);
  if (ratio) return computeStoryboardNodeDimensionsFromRatio(ratio);
  if (positive(node.measured?.width) && positive(node.measured?.height)) return node.measured;
  if (positive(node.width) && positive(node.height))
    return { width: node.width, height: node.height };
  return { width: 350, height: 350 };
}

function creationBounds(children, nodes, zoom, getNodeSize) {
  const items = children.map((node) => ({
    position: canvasWorldPosition(node, nodes),
    size: getNodeSize(node),
  }));
  if (
    items.some(
      (item) =>
        !finitePosition(item.position) ||
        !positive(item.size?.width) ||
        !positive(item.size?.height),
    )
  )
    return null;
  const safeZoom = positive(zoom) ? zoom : 1;
  const extra = (40 * (Math.sqrt(safeZoom) - safeZoom)) / safeZoom;
  const x = Math.min(...items.map((item) => item.position.x)) - 20 - extra;
  const y = Math.min(...items.map((item) => item.position.y)) - 20 - 36 - extra;
  return {
    x,
    y,
    width: Math.max(...items.map((item) => item.position.x + item.size.width)) - x + 20 + extra,
    height: Math.max(...items.map((item) => item.position.y + item.size.height)) - y + 20 + extra,
  };
}

/** Source D uses a minimum total squared-distance assignment, with stable first ties. */
function minimumAssignment(costs) {
  const count = costs.length;
  const rowPotential = Array(count + 1).fill(0);
  const colPotential = Array(count + 1).fill(0);
  const rowAtColumn = Array(count + 1).fill(0);
  const previous = Array(count + 1).fill(0);
  for (let row = 1; row <= count; row++) {
    rowAtColumn[0] = row;
    let column = 0;
    const minimum = Array(count + 1).fill(Infinity);
    const visited = Array(count + 1).fill(false);
    do {
      visited[column] = true;
      const currentRow = rowAtColumn[column];
      let delta = Infinity;
      let nextColumn = 0;
      for (let index = 1; index <= count; index++) {
        if (visited[index]) continue;
        const reduced =
          costs[currentRow - 1][index - 1] - rowPotential[currentRow] - colPotential[index];
        if (reduced < minimum[index]) {
          minimum[index] = reduced;
          previous[index] = column;
        }
        if (minimum[index] < delta) {
          delta = minimum[index];
          nextColumn = index;
        }
      }
      for (let index = 0; index <= count; index++)
        if (visited[index]) {
          rowPotential[rowAtColumn[index]] += delta;
          colPotential[index] -= delta;
        } else minimum[index] -= delta;
      column = nextColumn;
    } while (rowAtColumn[column] !== 0);
    do {
      const nextColumn = previous[column];
      rowAtColumn[column] = rowAtColumn[nextColumn];
      column = nextColumn;
    } while (column !== 0);
  }
  const result = Array(count).fill(-1);
  for (let index = 1; index <= count; index++)
    if (rowAtColumn[index] > 0) result[rowAtColumn[index] - 1] = index - 1;
  return result;
}

function layoutOrder(children, nodes, bounds, manualCols) {
  const cellW = Math.max(
    48,
    ...children.map((node) => (node.measured?.width ?? node.width ?? 200) || 200),
  );
  const cellH = Math.max(
    48,
    ...children.map((node) => (node.measured?.height ?? node.height ?? 120) || 120),
  );
  if (!positive(cellW) || !positive(cellH)) return null;
  const { totalSlots } = resolveStoryboardGridSlotCount(children.length, manualCols);
  const slots = computeStoryboardGridLayout(cellW, cellH, totalSlots, manualCols).slotPositions;
  const costs = children.map((node) => {
    const world = canvasWorldPosition(node, nodes);
    return slots.slice(0, children.length).map((slot) => {
      const dx = world.x - bounds.x - slot.x;
      const dy = world.y - bounds.y - slot.y;
      return dx * dx + dy * dy;
    });
  });
  if (costs.some((row) => row.some((cost) => !Number.isFinite(cost)))) return null;
  const assignment = minimumAssignment(costs);
  const ordered = Array(children.length);
  children.forEach((node, index) => {
    ordered[assignment[index]] = node;
  });
  return ordered;
}

/**
 * Source lP + standalone membership layout, projected into one local history write.
 * Edges, references, prompt/model parameters and unrelated document fields are retained.
 */
export function createStoryboardGridGroup({
  nodes,
  selectedIds,
  zoom = 1,
  bounds,
  getNodeSize = estimatedSize,
  makeId = () => createLocalId('group'),
} = {}) {
  const eligibility = resolveStoryboardGridCreation({ nodes, selectedIds });
  const rejected = (reason = eligibility.reason) => ({
    valid: false,
    changed: false,
    nodes,
    group: null,
    reason,
  });
  if (!eligibility.allowed) return rejected();
  const members = new Set(eligibility.sourceIds);
  const children = nodes.filter((node) => members.has(node.id));
  if (children.some((node) => !finitePosition(node.position))) return rejected('invalidPosition');
  const initialBounds = bounds ?? creationBounds(children, nodes, zoom, getNodeSize);
  if (
    !finitePosition(initialBounds) ||
    !positive(initialBounds.width) ||
    !positive(initialBounds.height)
  )
    return rejected('invalidBounds');
  const ordered = layoutOrder(children, nodes, initialBounds, eligibility.columns);
  if (!ordered) return rejected('invalidLayout');
  const id = makeId();
  if (typeof id !== 'string' || !id || nodes.some((node) => node.id === id))
    return rejected('invalidGroupId');
  const dimensions = computeStoryboardNodeDimensionsFromRatio('16:9');
  const { totalSlots } = resolveStoryboardGridSlotCount(ordered.length, eligibility.columns);
  const layout = computeStoryboardGridLayout(
    dimensions.width,
    dimensions.height,
    totalSlots,
    eligibility.columns,
  );
  const group = {
    id,
    type: 'group',
    position: { x: initialBounds.x, y: initialBounds.y },
    zIndex: -1001,
    selected: true,
    width: layout.width,
    height: layout.height,
    measured: { width: layout.width, height: layout.height },
    style: {
      background: STORYBOARD_GRID_SHELL_BACKGROUND,
      border: '1px solid var(--canvas-group-border)',
    },
    data: {
      type: 'group',
      name: `分镜组 ${ordered.length} 个节点`,
      childNodeIds: ordered.map((node) => node.id),
      storyboardGroupType: 'image',
      standaloneStoryboardImageGrid: true,
      storyboardManualGridCols: eligibility.columns,
      groupLayoutMode: 'grid',
      nodeWidth: layout.width,
      nodeHeight: layout.height,
    },
  };
  const slots = new Map(ordered.map((node, index) => [node.id, layout.slotPositions[index]]));
  const next = nodes.map((node) => {
    const position = slots.get(node.id);
    if (!position) return node.selected ? { ...node, selected: false } : node;
    const params = node.data?.params ?? {};
    return {
      ...node,
      parentId: id,
      position,
      selected: false,
      ...dimensions,
      measured: { ...dimensions },
      data: {
        ...node.data,
        params: { ...params, settings: { ...params.settings, ratio: '16:9' } },
        ...buildStoryboardGridChildExplicitDims(dimensions.width, dimensions.height),
      },
    };
  });
  return {
    valid: true,
    changed: true,
    nodes: [...next, group],
    group,
    selectedIds: [id],
    reason: null,
  };
}
