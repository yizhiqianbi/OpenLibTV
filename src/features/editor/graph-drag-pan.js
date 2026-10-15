// Ordinary XYDrag and the virtual selection frame use different source protocols.
export const CANVAS_NODE_DRAG_PAN_EDGE = 40;
export const CANVAS_NODE_DRAG_PAN_STEP = 15;
export const CANVAS_SELECTION_DRAG_PAN_EDGE = 80;
export const CANVAS_SELECTION_DRAG_PAN_SPEED = 720;
export const CANVAS_SELECTION_DRAG_PAN_MAX_ELAPSED_MS = 50;

const finitePoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const finiteView = (view) => finitePoint(view) && Number.isFinite(view?.z) && view.z > 0;
const finiteOrigin = (rect) => Number.isFinite(rect?.left) && Number.isFinite(rect?.top);
const finiteRect = (rect) =>
  finiteOrigin(rect) &&
  Number.isFinite(rect?.width) &&
  Number.isFinite(rect?.height) &&
  rect.width > 0 &&
  rect.height > 0;
const validProtocol = (protocol) => protocol === 'node' || protocol === 'selection';
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

function axisRatio(value, size, protocol) {
  const node = protocol === 'node';
  const edge = node ? CANVAS_NODE_DRAG_PAN_EDGE : CANVAS_SELECTION_DRAG_PAN_EDGE;
  // Preserve the source's left/top precedence when the two edge zones overlap.
  if (value < edge) return clamp(edge - value, node ? 1 : 0, edge) / edge;
  if (value > size - edge) return -clamp(value - (size - edge), node ? 1 : 0, edge) / edge;
  return 0;
}

/**
 * One screen-space pan step for the current Canvas's unbounded translate extent.
 * `node` is frame based; `selection` consumes milliseconds supplied by the RAF owner.
 * The owner supplies 0 on the selection protocol's first tick and applies lifecycle gates.
 * `active` describes edge velocity before elapsed time, so that first tick can continue.
 */
export function canvasNodeDragPanStep({ protocol, clientPoint, boardRect, view, elapsedMs = 0 }) {
  if (!validProtocol(protocol) || !finitePoint(clientPoint) || !finiteRect(boardRect)) return null;
  if (!finiteView(view) || (protocol === 'selection' && !Number.isFinite(elapsedMs))) return null;
  const elapsed = clamp(elapsedMs, 0, CANVAS_SELECTION_DRAG_PAN_MAX_ELAPSED_MS);
  const ratio = {
    x: axisRatio(clientPoint.x - boardRect.left, boardRect.width, protocol),
    y: axisRatio(clientPoint.y - boardRect.top, boardRect.height, protocol),
  };
  const magnitude =
    protocol === 'node'
      ? CANVAS_NODE_DRAG_PAN_STEP
      : (CANVAS_SELECTION_DRAG_PAN_SPEED * elapsed) / 1000;
  const deltaScreen = {
    x: ratio.x * magnitude,
    y: ratio.y * magnitude,
  };
  const nextView = { ...view, x: view.x + deltaScreen.x, y: view.y + deltaScreen.y };
  return finiteView(nextView)
    ? { active: ratio.x !== 0 || ratio.y !== 0, deltaScreen, nextView }
    : null;
}

/** Accumulate virtual-frame movement in world units using the zoom of this pan tick. */
export function canvasNodeDragPanCompensation(compensation, deltaScreen, zoom) {
  if (
    !finitePoint(compensation) ||
    !finitePoint(deltaScreen) ||
    !Number.isFinite(zoom) ||
    zoom <= 0
  )
    return null;
  const result = {
    x: compensation.x - deltaScreen.x / zoom,
    y: compensation.y - deltaScreen.y / zoom,
  };
  return finitePoint(result) ? result : null;
}

/**
 * Movement added to the original parent-relative positions of selection roots.
 * Ordinary XYDrag compares two world cursors. Its source holds the initial board rect;
 * callers may explicitly supply a fresh board rect for the local layout-change adaptation.
 * The virtual frame instead combines its current-zoom pointer delta with cumulative pan.
 */
export function canvasNodeDragPositionDelta({
  protocol,
  originClient,
  clientPoint,
  originView,
  view,
  originBoardRect,
  boardRect = originBoardRect,
  panCompensation = { x: 0, y: 0 },
}) {
  if (!validProtocol(protocol) || !finitePoint(originClient) || !finitePoint(clientPoint))
    return null;
  if (!finiteView(view)) return null;
  let delta;
  if (protocol === 'selection') {
    if (!finitePoint(panCompensation)) return null;
    delta = {
      x: (clientPoint.x - originClient.x) / view.z + panCompensation.x,
      y: (clientPoint.y - originClient.y) / view.z + panCompensation.y,
    };
  } else {
    if (!finiteView(originView) || !finiteOrigin(originBoardRect) || !finiteOrigin(boardRect))
      return null;
    delta = {
      x:
        (clientPoint.x - boardRect.left - view.x) / view.z -
        (originClient.x - originBoardRect.left - originView.x) / originView.z,
      y:
        (clientPoint.y - boardRect.top - view.y) / view.z -
        (originClient.y - originBoardRect.top - originView.y) / originView.z,
    };
  }
  return finitePoint(delta) ? delta : null;
}
