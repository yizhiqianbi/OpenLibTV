// Public Canvas zoom extent, distinct from React Flow's library defaults.
export const CANVAS_ZOOM_MIN = 0.1;
export const CANVAS_ZOOM_MAX = 8;
export const CANVAS_TOUCH_THRESHOLD = 4;

const finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const finiteView = (view) => finitePoint(view) && Number.isFinite(view?.z) && view.z > 0;

export function canvasTouchPosition(touch, bounds) {
  const point = { x: touch.clientX - bounds.left, y: touch.clientY - bounds.top };
  return finitePoint(point) ? point : null;
}

export function createCanvasTouchPoint(id, position, view) {
  if (!finitePoint(position) || !finiteView(view)) return null;
  return {
    id,
    position: { ...position },
    anchor: { x: (position.x - view.x) / view.z, y: (position.y - view.y) / view.z },
  };
}

/** Rebase after a finger is lifted so the remaining finger cannot jump the view. */
export function rebaseCanvasTouchPoint(point, view) {
  return createCanvasTouchPoint(point.id, point.position, view);
}

export function canvasTouchMoved(start, current, threshold = CANVAS_TOUCH_THRESHOLD) {
  if (!finitePoint(start) || !finitePoint(current)) return true;
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

/** D3's screen midpoint/world midpoint protocol, including simultaneous pinch/pan. */
export function projectCanvasTouchView(view, points) {
  if (!finiteView(view) || !points.length) return null;
  const active = points.slice(0, 2);
  if (active.some((point) => !finitePoint(point.position) || !finitePoint(point.anchor)))
    return null;
  let z = view.z;
  if (active.length === 2) {
    const screenDistance = Math.hypot(
      active[1].position.x - active[0].position.x,
      active[1].position.y - active[0].position.y,
    );
    const worldDistance = Math.hypot(
      active[1].anchor.x - active[0].anchor.x,
      active[1].anchor.y - active[0].anchor.y,
    );
    // A coincident start has no measurable scale: retain zoom and still allow pan.
    if (worldDistance > Number.EPSILON) z = screenDistance / worldDistance;
  }
  z = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, z));
  const midpoint = (key) => ({
    x: active.reduce((sum, point) => sum + point[key].x, 0) / active.length,
    y: active.reduce((sum, point) => sum + point[key].y, 0) / active.length,
  });
  const position = midpoint('position');
  const anchor = midpoint('anchor');
  const result = { x: position.x - anchor.x * z, y: position.y - anchor.y * z, z };
  return finiteView(result) ? result : null;
}
