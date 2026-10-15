import { CANVAS_ZOOM_MIN, CANVAS_ZOOM_MAX } from './graph-touch-model.js';
export function fitGraphView(
  items,
  bounds,
  { padding = 0.1, minZoom = CANVAS_ZOOM_MIN, maxZoom = CANVAS_ZOOM_MAX } = {},
) {
  items = items.filter((node) => !node.hidden);
  if (!items.length) return { x: bounds.width / 2 - 200, y: bounds.height / 2 - 140, z: 1 };
  const x = Math.min(...items.map((node) => node.position.x));
  const y = Math.min(...items.map((node) => node.position.y));
  const right = Math.max(...items.map((node) => node.position.x + (node.width || 350)));
  const bottom = Math.max(...items.map((node) => node.position.y + (node.height || 230)));
  // Source XYFlow numeric padding is a fraction of the viewport, floored per side.
  const padX = Math.floor((bounds.width - bounds.width / (1 + padding)) / 2);
  const padY = Math.floor((bounds.height - bounds.height / (1 + padding)) / 2);
  const z = Math.max(
    minZoom,
    Math.min(
      maxZoom,
      (bounds.width - 2 * padX) / (right - x),
      (bounds.height - 2 * padY) / (bottom - y),
    ),
  );
  const tx = bounds.width / 2 - (x + (right - x) / 2) * z;
  const ty = bounds.height / 2 - (y + (bottom - y) / 2) * z;
  return {
    x:
      tx -
      Math.min(Math.floor(x * z + tx) - padX, 0) +
      Math.min(Math.floor(bounds.width - (right * z + tx)) - padX, 0),
    y:
      ty -
      Math.min(Math.floor(y * z + ty) - padY, 0) +
      Math.min(Math.floor(bounds.height - (bottom * z + ty)) - padY, 0),
    z,
  };
}

export function screenToCanvas(point, bounds, view) {
  return {
    x: (point.clientX - bounds.left - view.x) / view.z,
    y: (point.clientY - bounds.top - view.y) / view.z,
  };
}

export function canvasToScreen(point, bounds, view) {
  return {
    x: bounds.left + view.x + point.x * view.z,
    y: bounds.top + view.y + point.y * view.z,
  };
}

export function zoomCanvasView(view, factor, point) {
  const z = Math.max(CANVAS_ZOOM_MIN, Math.min(CANVAS_ZOOM_MAX, view.z * factor));
  return {
    x: point.x - ((point.x - view.x) * z) / view.z,
    y: point.y - ((point.y - view.y) * z) / view.z,
    z,
  };
}

export function selectGraphNodes(nodes, rectangle) {
  return nodes
    .filter(
      (node) =>
        node.position.x + (node.width || 350) > rectangle.x &&
        node.position.x < rectangle.x + rectangle.width &&
        node.position.y + (node.height || 230) > rectangle.y &&
        node.position.y < rectangle.y + rectangle.height,
    )
    .map((node) => node.id);
}
