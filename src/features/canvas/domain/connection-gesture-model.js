import { canvasWorldNodes, isCanvasGroup } from './groups.js';

export const CONNECTION_DRAG_THRESHOLD = 1;
export const CONNECTION_RADIUS = 80;

export function canvasHandlePoint(node, handleType) {
  return {
    x: node.position.x + (handleType === 'target' ? 0 : node.width || 350),
    y: node.position.y + (node.height || 230) / 2,
  };
}

export function canvasConnectionPair(originId, handleType, otherId) {
  return handleType === 'target'
    ? { sourceId: otherId, targetId: originId }
    : { sourceId: originId, targetId: otherId };
}

/** Source renderer uses an 80-flow-unit handle radius, then node-body fallback. */
export function canvasConnectionTarget({
  nodes,
  originId,
  handleType,
  point,
  directNodeId,
  allowBody = true,
}) {
  const origin = nodes.find((node) => node.id === originId);
  const candidates = canvasWorldNodes(nodes).filter(
    (node) => node.id !== originId && node.id !== origin?.parentId && !isCanvasGroup(node),
  );
  let closest = candidates.find((node) => node.id === directNodeId) || null;
  if (closest)
    return { nodeId: closest.id, ...canvasConnectionPair(originId, handleType, closest.id) };
  let distance = CONNECTION_RADIUS * CONNECTION_RADIUS;
  for (const node of candidates) {
    const anchor = canvasHandlePoint(node, handleType === 'target' ? 'source' : 'target');
    const next = (anchor.x - point.x) ** 2 + (anchor.y - point.y) ** 2;
    if (next <= distance) {
      closest = node;
      distance = next;
    }
  }
  if (!closest && allowBody)
    closest = candidates.findLast(
      (node) =>
        point.x >= node.position.x &&
        point.x <= node.position.x + (node.width || 350) &&
        point.y >= node.position.y &&
        point.y <= node.position.y + (node.height || 230),
    );
  return closest
    ? { nodeId: closest.id, ...canvasConnectionPair(originId, handleType, closest.id) }
    : null;
}

/** Source XYFlow: 40px border zone, up to 15 screen pixels per animation frame. */
export function canvasConnectionPanVelocity(point, bounds) {
  const speed = (position, length) => {
    if (position < 40) return (15 * Math.max(1, Math.min(40, 40 - position))) / 40;
    if (position > length - 40)
      return (-15 * Math.max(1, Math.min(40, position - length + 40))) / 40;
    return 0;
  };
  return {
    x: speed(point.x - bounds.left, bounds.width),
    y: speed(point.y - bounds.top, bounds.height),
  };
}

export function canvasConnectedNodePosition(nodes, originId, handleType, size = {}) {
  const origin = canvasWorldNodes(nodes).find((node) => node.id === originId);
  if (!origin) return null;
  return {
    x:
      origin.position.x +
      (handleType === 'target' ? -(size.width || 350) - 100 : (origin.width || 350) + 100),
    y: origin.position.y + ((origin.height || 230) - (size.height || 230)) / 2,
  };
}
