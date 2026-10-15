import { canvasWorldPosition } from './groups.js';

const dimension = (node, key, fallback) => node.measured?.[key] ?? node[key] ?? fallback;
/** Archived computePanelFocusViewport: reserve 100/120/32px; nested world coordinates are local. */
export function canvasBatchVideoFocusView({ nodes, groupId, container }) {
  const group = nodes.find((node) => node.id === groupId);
  if (!group || !container || !Number.isFinite(container.width + container.height)) return null;
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const children = nodes.filter((node) => node.parentId === groupId && node.type === 'image');
  const boxes = children.flatMap((node) => {
    const position = canvasWorldPosition(node, lookup),
      width = dimension(node, 'width', 0),
      height = dimension(node, 'height', 0);
    return Number.isFinite(position.x + position.y + width + height) && width > 0 && height > 0
      ? [{ ...position, width, height }]
      : [];
  });
  const fallback = {
    ...canvasWorldPosition(group, lookup),
    width: dimension(group, 'width', 500),
    height: dimension(group, 'height', 300),
  };
  const x = boxes.length ? Math.min(...boxes.map((box) => box.x)) : fallback.x,
    y = boxes.length ? Math.min(...boxes.map((box) => box.y)) : fallback.y,
    width = boxes.length ? Math.max(...boxes.map((box) => box.x + box.width)) - x : fallback.width,
    height = boxes.length
      ? Math.max(...boxes.map((box) => box.y + box.height)) - y
      : fallback.height;
  if (!Number.isFinite(x + y + width + height) || width <= 0 || height <= 0) return null;
  const usableHeight = container.height - 100 - 120 - 32;
  const zoom = Math.min((container.width - 160) / width, usableHeight / height, 1.2);
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1.2;
  return {
    x: container.width / 2 - (x + width / 2) * z,
    y: 116 + usableHeight / 2 - (y + height / 2) * z,
    z,
  };
}
