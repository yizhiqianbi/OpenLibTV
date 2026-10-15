import { canvasWorldPosition, canvasNodeSize } from './domain/groups.js';
import { fitGraphView, selectGraphNodes } from '../editor/graph-geometry.js';
export { screenToCanvas, canvasToScreen, zoomCanvasView } from '../editor/graph-geometry.js';
const worldItems = (items, allNodes = items) => {
  const lookup = new Map(allNodes.map((node) => [node.id, node]));
  return items.map((node) => ({
    ...node,
    ...canvasNodeSize(node),
    position: canvasWorldPosition(node, lookup),
  }));
};
export function fitCanvasView(items, bounds, allNodes = items, options) {
  return fitGraphView(worldItems(items, allNodes), bounds, options);
}
/** Source mode return uses setCenter at the existing zoom, rather than fitView. */
export function centerCanvasView(node, bounds, allNodes, view) {
  if (!node || !bounds || !Number.isFinite(view?.z) || view.z <= 0) return null;
  const [world] = worldItems([node], allNodes);
  return {
    ...view,
    x: bounds.width / 2 - (world.position.x + world.width / 2) * view.z,
    y: bounds.height / 2 - (world.position.y + world.height / 2) * view.z,
  };
}
export function readOnlyCanvasView(items, height = 700) {
  items = worldItems(items);
  const x = items.length ? Math.min(...items.map((node) => node.position.x)) : 0;
  const y = items.length ? Math.min(...items.map((node) => node.position.y)) : 0;
  return { x: 16 - x * 0.1, y: height * 0.72 - y * 0.1, z: 0.1 };
}

export function selectIntersectingNodes(nodes, rectangle) {
  return selectGraphNodes(worldItems(nodes), rectangle);
}
