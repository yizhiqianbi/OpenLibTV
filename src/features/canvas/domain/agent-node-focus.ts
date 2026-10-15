export type CanvasFocusNode = {
  id: string;
  parentId?: string;
  position?: { x?: number; y?: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  internals?: { positionAbsolute?: { x?: number; y?: number } };
};
const finite = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Source pendingFocusNodeIds: padding .2, minZoom .6, maxZoom 1, duration 300. */
export function canvasAgentNodeFocusView(
  nodeId: string,
  nodes: readonly CanvasFocusNode[],
  bounds: { width: number; height: number },
): { x: number; y: number; z: number } | null {
  if (!(bounds.width > 0) || !(bounds.height > 0)) return null;
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const target = lookup.get(nodeId);
  if (!target) return null;
  let x = 0,
    y = 0;
  if (target.internals?.positionAbsolute) {
    x = finite(target.internals.positionAbsolute.x, 0);
    y = finite(target.internals.positionAbsolute.y, 0);
  } else {
    const seen = new Set<string>();
    let node: CanvasFocusNode | undefined = target;
    while (node && !seen.has(node.id)) {
      seen.add(node.id);
      x += finite(node.position?.x, 0);
      y += finite(node.position?.y, 0);
      node = node.parentId ? lookup.get(node.parentId) : undefined;
    }
  }
  const width = Math.max(1, finite(target.measured?.width, finite(target.width, 350)));
  const height = Math.max(1, finite(target.measured?.height, finite(target.height, 230)));
  // Source XYFlow 395060 numeric padding converts each viewport side to floored pixels.
  const paddingX = Math.floor((bounds.width - bounds.width / 1.2) * 0.5);
  const paddingY = Math.floor((bounds.height - bounds.height / 1.2) * 0.5);
  const z = Math.max(
    0.6,
    Math.min(1, (bounds.width - paddingX * 2) / width, (bounds.height - paddingY * 2) / height),
  );
  const viewX = bounds.width / 2 - (x + width / 2) * z;
  const viewY = bounds.height / 2 - (y + height / 2) * z;
  const left = Math.min(Math.floor(viewX + x * z) - paddingX, 0);
  const right = Math.min(Math.floor(bounds.width - (viewX + (x + width) * z)) - paddingX, 0);
  const top = Math.min(Math.floor(viewY + y * z) - paddingY, 0);
  const bottom = Math.min(Math.floor(bounds.height - (viewY + (y + height) * z)) - paddingY, 0);
  return { x: viewX - left + right, y: viewY - top + bottom, z };
}
