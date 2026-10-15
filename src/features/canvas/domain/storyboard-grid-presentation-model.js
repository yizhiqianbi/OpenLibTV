import {
  computeStoryboardGridLayout,
  computeStoryboardVariableGridLayout,
  getStoryboardImageGridChildSize,
  resolveStoryboardGridSlotCount,
} from './storyboard-grid-model.js';

/** Source group renderer tf: use complete child metadata, otherwise numeric name order. */
function orderedChildren(node, nodes) {
  const children = nodes.filter((child) => child?.parentId === node.id);
  const preferred = node.data?.childNodeIds;
  if (Array.isArray(preferred) && preferred.length) {
    const byId = new Map(children.map((child) => [child.id, child]));
    const ids = preferred.filter((id) => byId.has(id));
    if (ids.length === children.length && new Set(ids).size === children.length)
      return ids.map((id) => byId.get(id));
  }
  return [...children].sort((a, b) =>
    String(a.data?.name ?? '').localeCompare(String(b.data?.name ?? ''), undefined, {
      numeric: true,
    }),
  );
}

/** Source e0 is a view projection; it does not reflow or persist the actual graph. */
export function resolveStoryboardGridPresentation({ node, nodes = [], hoverCount, zoom = 1 } = {}) {
  if (
    node?.type !== 'group' ||
    node.data?.standaloneStoryboardImageGrid !== true ||
    node.data?.storyboardGroupType !== 'image' ||
    !Array.isArray(nodes)
  )
    return null;
  const children = orderedChildren(node, nodes).filter((child) => child.type === 'image');
  const requested = hoverCount ?? node.data.storyboardMultiDragHoverCount ?? 0;
  const count = Number.isFinite(requested) ? Math.max(0, Math.floor(requested)) : 0;
  const { cols, rows, totalSlots } = resolveStoryboardGridSlotCount(
    children.length + count,
    node.data.storyboardManualGridCols,
    node.data.storyboardManualGridRows,
  );
  const width = node.width ?? node.measured?.width ?? 0;
  const height = node.height ?? node.measured?.height ?? 0;
  const sizes = children.map(getStoryboardImageGridChildSize);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    sizes.some((size) => !Number.isFinite(size.w) || !Number.isFinite(size.h))
  )
    return null;
  const cellW = Math.max(
    48,
    sizes.length ? Math.max(...sizes.map((size) => size.w)) : (width - 8 - (cols - 1) * 4) / cols,
  );
  const cellH = Math.max(
    48,
    sizes.length ? Math.max(...sizes.map((size) => size.h)) : (height - 8 - (rows - 1) * 4) / rows,
  );
  const layout =
    node.data.storyboardPreserveChildDimensions === true
      ? computeStoryboardVariableGridLayout(
          [
            ...sizes.map((size) => ({ width: size.w, height: size.h })),
            ...Array.from({ length: count }, () => ({ width: cellW, height: cellH })),
          ],
          totalSlots,
          node.data.storyboardManualGridCols,
        )
      : computeStoryboardGridLayout(cellW, cellH, totalSlots, node.data.storyboardManualGridCols);
  const slots = Array.from({ length: Math.max(0, totalSlots - children.length) }, (_, offset) => {
    const index = children.length + offset;
    const highlighted = offset < count;
    return {
      index,
      position: layout.slotPositions[index],
      size: layout.slotSizes[index],
      highlighted,
      background: highlighted ? '#5DDCFF1F' : '#FFFFFF0D',
      color: highlighted ? '#5DDCFF' : '#737373',
    };
  });
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    children,
    cols,
    rows,
    totalSlots,
    cellW,
    cellH,
    hoverCount: count,
    slots,
    titleStyle: {
      position: 'absolute',
      left: 0,
      bottom: `calc(100% + ${8 / Math.max(safeZoom, 1)}px)`,
      transform: `scale(${1 / safeZoom})`,
      transformOrigin: 'bottom left',
      maxWidth: width * safeZoom,
      padding: 0,
      fontSize: 13,
      color: 'var(--fg-muted, #aaa)',
    },
  };
}
