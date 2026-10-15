/** The source hover feedback is independent of connection policy/type/action. */
export function canvasNodeConnectionFeedback({
  nodeId,
  active = false,
  hovered = false,
  originIds = [],
  invalidTargetId = null,
  edges = [],
  frozen = false,
}) {
  const dragging = Boolean(active && !frozen);
  const origin = originIds.includes(nodeId);
  const connected = edges.some(
    (edge) =>
      (originIds.includes(edge.source) && edge.target === nodeId) ||
      (edge.source === nodeId && originIds.includes(edge.target)),
  );
  const over = Boolean(dragging && hovered);
  const invalid = over && !origin && !connected && invalidTargetId === nodeId;
  return {
    isDraggingConnection: dragging,
    isConnectionTarget: over && !origin && !connected && !invalid,
    isConnectionBlocked: over && (origin || connected),
    isConnectionInvalid: invalid,
  };
}

/** Client coordinates use the displayed, unrotated node rectangle, including zoom. */
export function canvasNodeConnectionTilt(point, bounds) {
  if (
    !point ||
    !bounds ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  const clamp = (value) => Math.max(-8, Math.min(8, value));
  return {
    x: clamp(-8 * ((point.y - (bounds.top + bounds.height / 2)) / (bounds.height / 2))),
    y: clamp(8 * ((point.x - (bounds.left + bounds.width / 2)) / (bounds.width / 2))),
  };
}
