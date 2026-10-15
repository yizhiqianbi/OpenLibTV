/** RF elevates selection in the view; neither selection nor computed z belongs in the document. */
export function canvasNodeStackingOrder(nodes, selectedIds = []) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const selected = new Set(selectedIds);
  const order = new Map();
  const visiting = new Set();
  const base = (node) =>
    (Number.isFinite(node.zIndex) ? node.zIndex : 0) + (selected.has(node.id) ? 1000 : 0);
  const resolve = (node) => {
    if (order.has(node.id)) return order.get(node.id);
    // Malformed local ancestry must not prevent the rest of the canvas from rendering.
    if (visiting.has(node.id)) return base(node);
    visiting.add(node.id);
    const parent = lookup.get(node.parentId);
    const own = base(node);
    const parentZ = parent ? resolve(parent) : undefined;
    const value = parent && parentZ >= own ? parentZ + 1 : own;
    visiting.delete(node.id);
    order.set(node.id, value);
    return value;
  };
  for (const node of nodes) resolve(node);
  return order;
}
