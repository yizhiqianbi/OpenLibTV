import { canvasNodeSize, canvasWorldNodes, isCanvasGroup } from './groups.js';

/** Source nq: 80 screen pixels, 720px/s, with elapsed time clamped by the controller. */
export function canvasMultiConnectionPanVelocity(point, bounds) {
  if (!point || !bounds) return { x: 0, y: 0 };
  const axis = (position, start, end) =>
    position < start + 80
      ? 720 * Math.min(1, Math.max(0, (start + 80 - position) / 80))
      : position > end - 80
        ? -720 * Math.min(1, Math.max(0, (position - (end - 80)) / 80))
        : 0;
  return {
    x: axis(point.x, bounds.left, bounds.right),
    y: axis(point.y, bounds.top, bounds.bottom),
  };
}

/** Multi-select release uses the last intersecting body; there is no handle magnet. */
export function canvasMultiConnectionDropTarget(nodes, sourceIds, point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  const excluded = new Set(sourceIds);
  return (
    canvasWorldNodes(nodes)
      .filter((node) => {
        if (excluded.has(node.id) || isCanvasGroup(node) || node.hidden) return false;
        const size = canvasNodeSize(node);
        return (
          point.x + 1 > node.position.x &&
          point.x < node.position.x + size.width &&
          point.y + 1 > node.position.y &&
          point.y < node.position.y + size.height
        );
      })
      .at(-1)?.id || null
  );
}

/** Source nK uses a minimum 40px screen-space control, independently for each source. */
export function canvasMultiConnectionPreviewPath(start, end) {
  if (![start?.x, start?.y, end?.x, end?.y].every(Number.isFinite)) return null;
  const control = Math.max(Math.abs(end.x - start.x) * 0.5, 40);
  return `M${start.x},${start.y} C${start.x + control},${start.y} ${end.x - control},${end.y} ${end.x},${end.y}`;
}
