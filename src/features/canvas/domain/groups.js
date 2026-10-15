import { createLocalId, cloneSnapshot } from '../../editor/model.js';

const number = (value, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
export const isCanvasGroup = (node) => node?.type === 'group';
export const canvasNodeSize = (node) => {
  const data = node?.data;
  // The manual renderer has no RF measurement pass. Match explicit media content
  // dimensions for display/hit geometry while preserving the source flow fields.
  if (
    ['image', 'video'].includes(node?.type) &&
    data?._explicitContentDims === true &&
    Number.isFinite(data.contentWidth) &&
    data.contentWidth > 0 &&
    Number.isFinite(data.contentHeight) &&
    data.contentHeight > 0
  )
    return { width: data.contentWidth, height: data.contentHeight };
  // The dedicated clip surface changes size without changing its stored flow
  // width. Its measured content is shared by links, selection, minimap and fit.
  if (node?.type === 'video-clip')
    return {
      width: number(node.measured?.width, number(node.width, 350)),
      height: number(node.measured?.height, number(node.height, 350)),
    };
  return {
    width: number(node?.width, number(node?.measured?.width, 350)),
    height: number(node?.height, number(node?.measured?.height, 230)),
  };
};

/** Documents store child positions relative to their parent, just as React Flow does. */
export function canvasWorldPosition(node, nodes) {
  const lookup = nodes instanceof Map ? nodes : new Map(nodes.map((item) => [item.id, item]));
  const seen = new Set();
  let current = node;
  let x = 0,
    y = 0;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    x += number(current.position?.x);
    y += number(current.position?.y);
    current = lookup.get(current.parentId);
  }
  return { x, y };
}

export function canvasWorldNodes(nodes) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  return nodes.map((node) => ({
    ...node,
    ...canvasNodeSize(node),
    position: canvasWorldPosition(node, lookup),
  }));
}

/** A selected ancestor moves its children by moving the parent once. */
export function canvasSelectionRoots(nodes, ids) {
  const selected = new Set(ids),
    lookup = new Map(nodes.map((node) => [node.id, node]));
  return nodes.filter((node) => {
    if (!selected.has(node.id)) return false;
    const seen = new Set([node.id]);
    let parent = lookup.get(node.parentId);
    while (parent && !seen.has(parent.id)) {
      if (selected.has(parent.id)) return false;
      seen.add(parent.id);
      parent = lookup.get(parent.parentId);
    }
    return true;
  });
}

export function canvasGroupDescendants(nodes, ids) {
  const result = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
  }
  return nodes.filter((node) => result.has(node.id));
}

function reconcileChildren(nodes, groupIds) {
  return nodes.map((node) =>
    isCanvasGroup(node) && groupIds.has(node.id)
      ? {
          ...node,
          data: {
            ...node.data,
            childNodeIds: nodes
              .filter((child) => child.parentId === node.id)
              .map((child) => child.id),
          },
        }
      : node,
  );
}

/** Source ordinary grouping: 20px bounds padding, 36px title padding, relative children. */
export function createCanvasGroup(nodes, ids, { makeId = createLocalId, zoom = 1 } = {}) {
  const children = canvasSelectionRoots(nodes, ids);
  if (children.length < 2) return { nodes, group: null };
  const world = children.map((node) => ({
    node,
    position: canvasWorldPosition(node, nodes),
    ...canvasNodeSize(node),
  }));
  const safeZoom = Math.max(0.02, number(zoom, 1));
  // Source applies its sqrt(zoom) bounds compensation twice after title padding.
  const padding = 20 + (40 * (Math.sqrt(safeZoom) - safeZoom)) / safeZoom;
  const titlePadding = 36;
  const x = Math.min(...world.map((item) => item.position.x)) - padding;
  const y = Math.min(...world.map((item) => item.position.y)) - padding - titlePadding;
  const width = Math.max(...world.map((item) => item.position.x + item.width)) - x + padding;
  const height = Math.max(...world.map((item) => item.position.y + item.height)) - y + padding;
  const group = {
    id: makeId(),
    type: 'group',
    zIndex: -1001,
    position: { x, y },
    width,
    height,
    data: { name: '分组', childNodeIds: children.map((node) => node.id) },
  };
  const childPositions = new Map(world.map((item) => [item.node.id, item.position]));
  const next = nodes.map((node) => {
    const position = childPositions.get(node.id);
    return position
      ? { ...node, parentId: group.id, position: { x: position.x - x, y: position.y - y } }
      : node;
  });
  const affectedGroups = new Set([
    group.id,
    ...children.map((node) => node.parentId).filter(Boolean),
  ]);
  return { nodes: reconcileChildren([...next, group], affectedGroups), group };
}

export function ungroupCanvasNodes(nodes, groupId) {
  const group = nodes.find((node) => node.id === groupId && isCanvasGroup(node));
  if (!group) return { nodes, selectedIds: [] };
  const children = nodes.filter((node) => node.parentId === groupId);
  const targetParent = nodes.find((node) => node.id === group.parentId);
  const parentPosition = targetParent ? canvasWorldPosition(targetParent, nodes) : { x: 0, y: 0 };
  const next = nodes
    .filter((node) => node.id !== groupId)
    .map((node) => {
      if (node.parentId !== groupId) return node;
      const position = canvasWorldPosition(node, nodes);
      const { parentId: _parent, extent: _extent, ...rest } = node;
      return {
        ...rest,
        ...(targetParent ? { parentId: targetParent.id } : {}),
        position: { x: position.x - parentPosition.x, y: position.y - parentPosition.y },
      };
    });
  return {
    nodes: reconcileChildren(next, new Set(targetParent ? [targetParent.id] : [])),
    selectedIds: children.map((node) => node.id),
  };
}

/** Ordinary layout only; storyboard columns have a separate source implementation. */
export function layoutCanvasNodes(nodes, ids, mode, { groupId, columns } = {}) {
  if (!['grid', 'horizontal', 'vertical'].includes(mode)) return nodes;
  const group = groupId && nodes.find((node) => node.id === groupId && isCanvasGroup(node));
  const ordered = group
    ? (
        group.data?.childNodeIds ||
        nodes.filter((node) => node.parentId === groupId).map((node) => node.id)
      )
        .map((id) => nodes.find((node) => node.id === id && node.parentId === groupId))
        .filter(Boolean)
    : nodes
        .filter((node) => ids.includes(node.id) && !node.parentId)
        .sort((a, b) =>
          String(a.data?.name || '').localeCompare(String(b.data?.name || ''), undefined, {
            numeric: true,
          }),
        );
  if (ordered.length < 2) return nodes;
  const positions = ordered.map((node) => canvasWorldPosition(node, nodes));
  const origin = group
    ? { x: 36, y: 66 }
    : { x: Math.min(...positions.map((p) => p.x)), y: Math.min(...positions.map((p) => p.y)) };
  const sizes = ordered.map((node) =>
      group
        ? canvasNodeSize(node)
        : {
            width: number(node.measured?.width, number(node.width, 200)),
            height: number(node.measured?.height, number(node.height, 120)),
          },
    ),
    maxWidth = Math.max(...sizes.map((size) => size.width)),
    maxHeight = Math.max(...sizes.map((size) => size.height));
  const gap = group ? 36 : 100;
  const cols = group
    ? Math.min(
        5,
        Math.max(1, columns > 0 ? Math.round(columns) : Math.ceil(Math.sqrt(ordered.length))),
      )
    : Math.ceil(Math.sqrt(ordered.length));
  let x = origin.x,
    y = origin.y;
  const patches = new Map();
  ordered.forEach((node, i) => {
    const position =
      mode === 'grid'
        ? {
            x: origin.x + (i % cols) * (maxWidth + gap),
            y: origin.y + Math.floor(i / cols) * (maxHeight + gap),
          }
        : { x, y };
    if (!group && node.parentId) {
      const parent = nodes.find((item) => item.id === node.parentId);
      const parentPosition = parent ? canvasWorldPosition(parent, nodes) : { x: 0, y: 0 };
      position.x -= parentPosition.x;
      position.y -= parentPosition.y;
    }
    patches.set(node.id, position);
    if (mode === 'horizontal') x += sizes[i].width + gap;
    if (mode === 'vertical') y += sizes[i].height + gap;
  });
  let next = nodes.map((node) =>
    patches.has(node.id) ? { ...node, position: patches.get(node.id) } : node,
  );
  if (group) {
    const children = next.filter((node) => patches.has(node.id));
    const width =
      Math.max(...children.map((node) => node.position.x + canvasNodeSize(node).width)) + 36;
    const height =
      Math.max(...children.map((node) => node.position.y + canvasNodeSize(node).height)) + 36;
    next = next.map((node) =>
      node.id === groupId
        ? {
            ...node,
            width,
            height,
            measured: { width, height },
            data: { ...node.data, layout: mode },
          }
        : node,
    );
  }
  return next;
}

/** Local document cloning remaps the entire selected subtree, preserving parent links. */
export function canvasCopyMembers(nodes, ids) {
  const expanded = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (expanded.has(node.id) && node.parentId) {
        const parent = nodes.find((item) => item.id === node.parentId && isCanvasGroup(item));
        if (!parent) continue;
        for (const item of nodes)
          if ((item.id === parent.id || item.parentId === parent.id) && !expanded.has(item.id)) {
            expanded.add(item.id);
            changed = true;
          }
      }
  }
  return canvasGroupDescendants(
    nodes,
    canvasSelectionRoots(nodes, [...expanded]).map((node) => node.id),
  );
}

export function cloneCanvasSelection(nodes, ids, makeId = createLocalId, offset = 36) {
  const members = canvasCopyMembers(nodes, ids);
  const roots = canvasSelectionRoots(
      members,
      members.map((node) => node.id),
    ),
    items = canvasGroupDescendants(
      nodes,
      roots.map((node) => node.id),
    );
  const mapping = new Map(items.map((node) => [node.id, makeId()])),
    rootIds = new Set(roots.map((node) => node.id));
  return items.map((node) => {
    const clone = cloneSnapshot(node),
      root = rootIds.has(node.id);
    const world = canvasWorldPosition(node, nodes);
    const parentId = mapping.get(node.parentId);
    return {
      ...clone,
      id: mapping.get(node.id),
      ...(parentId ? { parentId } : { parentId: undefined }),
      position: root ? { x: world.x + offset, y: world.y + offset } : clone.position,
      data: {
        ...clone.data,
        name: root ? `${clone.data?.name || '节点'} 副本` : clone.data?.name,
        ...(isCanvasGroup(node)
          ? {
              childNodeIds: (clone.data?.childNodeIds || [])
                .map((id) => mapping.get(id))
                .filter(Boolean),
            }
          : {}),
      },
    };
  });
}
