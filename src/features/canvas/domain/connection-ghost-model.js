import { canvasWorldPosition } from './groups.js';

export const TEMP_CONNECTION_NODE_ID = '__temp_connection_node__';
export const TEMP_CONNECTION_EDGE_ID = '__temp_connection_edge__';
const emptyNodeSize = 350;
// The source's 1px border cannot fit in a 1px border-box, so its used size is 2px.
// Both 6px handles center on that box: the input/output outer edges are -2/+4.
const temporaryUsedSize = 2;
const temporaryHandleSize = 6;
const validPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const sizeOf = (node, axis) => node.measured?.[axis] ?? node[axis] ?? emptyNodeSize;
const sourceNodeSize = (node) => ({
  width: sizeOf(node, 'width'),
  height: sizeOf(node, 'height'),
});
const worldOrigin = (nodes, id) => {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set();
  const origin = lookup.get(id);
  if (!origin) return null;
  let current = origin;
  while (current) {
    if (seen.has(current.id) || !validPoint(current.position)) return null;
    seen.add(current.id);
    current = lookup.get(current.parentId);
  }
  // Project coordinates only: source and injected renderer size protocols must
  // read the original measured/stored/content fields independently.
  return { ...origin, position: canvasWorldPosition(origin, lookup) };
};

/** Source XYFlow Bezier controls: horizontal handles and the default .25 curvature. */
export function canvasConnectionGhostPath(source, target) {
  if (!validPoint(source) || !validPoint(target)) return null;
  const distance = target.x - source.x;
  const offset = distance >= 0 ? distance / 2 : 6.25 * Math.sqrt(-distance);
  return `M${source.x},${source.y} C${source.x + offset},${source.y} ${target.x - offset},${target.y} ${target.x},${target.y}`;
}

/**
 * The source inserts the temporary 1×1 endpoint only after a blank drag release.
 * The local application projects that endpoint from the menu request instead of
 * adding transient nodes or edges to its persisted graph/history.
 */
export function canvasConnectionGhost({
  menu,
  nodes = [],
  documentKey,
  ready,
  readonly,
  getNodeSize = sourceNodeSize,
}) {
  if (
    !ready ||
    readonly ||
    !menu ||
    menu.documentKey !== documentKey ||
    !validPoint(menu.point) ||
    !['source', 'target'].includes(menu.handleType)
  )
    return null;
  const origin = worldOrigin(nodes, menu.nodeId);
  if (!origin || origin.hidden || !validPoint(origin.position)) return null;
  const reverse = menu.handleType === 'target';
  if (typeof getNodeSize !== 'function') return null;
  const { width, height } = getNodeSize(origin) || {};
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const node = {
    id: TEMP_CONNECTION_NODE_ID,
    type: 'temp',
    position: { x: menu.point.x, y: menu.point.y },
    width: 1,
    height: 1,
    data: {},
    draggable: false,
    selectable: false,
  };
  const originPoint = {
    x: origin.position.x + (reverse ? 0 : width),
    y: origin.position.y + height / 2,
  };
  const ghostPoint = {
    x:
      node.position.x +
      (temporaryUsedSize + (reverse ? temporaryHandleSize : -temporaryHandleSize)) / 2,
    y: node.position.y + temporaryUsedSize / 2,
  };
  const sourcePoint = reverse ? ghostPoint : originPoint;
  const targetPoint = reverse ? originPoint : ghostPoint;
  const reference = (origin.data?.type || origin.type) === 'reference';
  const edge = {
    id: TEMP_CONNECTION_EDGE_ID,
    source: reverse ? node.id : origin.id,
    target: reverse ? origin.id : node.id,
    sourceHandle: 'source',
    targetHandle: 'target',
    style: {
      stroke: 'var(--canvas-edge)',
      strokeWidth: 2,
      ...(reference ? { strokeDasharray: '6 4' } : {}),
    },
  };
  return {
    documentKey,
    nodeId: origin.id,
    handleType: menu.handleType,
    node,
    edge,
    sourcePoint,
    targetPoint,
    path: canvasConnectionGhostPath(sourcePoint, targetPoint),
  };
}

/**
 * Source handle-click placement uses NODE_WIDTH / NODE_HEIGHT_EMPTY (350),
 * independently of which menu candidate is later selected or its measured size.
 */
export function canvasSourceConnectedCreationPosition(
  nodes,
  originId,
  handleType,
  { getNodeSize = sourceNodeSize } = {},
) {
  if (!['source', 'target'].includes(handleType)) return null;
  const origin = worldOrigin(nodes, originId);
  if (!origin || !validPoint(origin.position)) return null;
  if (typeof getNodeSize !== 'function') return null;
  const { width, height } = getNodeSize(origin) || {};
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    x: origin.position.x + (handleType === 'target' ? -emptyNodeSize - 100 : width + 100),
    y: origin.position.y + (height - emptyNodeSize) / 2,
  };
}
