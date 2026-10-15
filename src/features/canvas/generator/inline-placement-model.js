export function inlineGeneratorWidth(viewportWidth) {
  return Number.isFinite(viewportWidth) && viewportWidth > 0
    ? Math.min(660, Math.max(0, viewportWidth - 40))
    : undefined;
}

export function inlineGeneratorCenter(center, view, viewportWidth) {
  const width = inlineGeneratorWidth(viewportWidth);
  if (
    width === undefined ||
    !Number.isFinite(center) ||
    !Number.isFinite(view?.x) ||
    !Number.isFinite(view?.z) ||
    view.z <= 0
  )
    return center;
  const screen = view.x + center * view.z;
  const min = width / 2 + 20;
  const max = viewportWidth - width / 2 - 20;
  // Avoid a projection round trip for an already valid source node center.
  if (screen >= min && screen <= max) return center;
  const clamped = min <= max ? Math.max(min, Math.min(screen, max)) : viewportWidth / 2;
  return (clamped - view.x) / view.z;
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * User-authorized screen-space adaptation; the source only places cards below nodes.
 * The caller measures natural card height and supplies its own screen-space gap.
 * A docked result explicitly permits overlap when neither side is usable.
 * `scrollable` enables whole-card overflow; it does not imply visible scrollbars.
 */
export function resolveInlineGeneratorVerticalPlacement(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
  const {
    nodeTop,
    nodeBottom,
    panelHeight,
    viewportTop = 20,
    viewportBottom,
    gap = 16,
    minimumHeight = 80,
  } = options;
  if (
    ![nodeTop, nodeBottom, panelHeight, viewportTop, viewportBottom, gap, minimumHeight].every(
      finite,
    ) ||
    nodeBottom < nodeTop ||
    panelHeight <= 0 ||
    viewportBottom <= viewportTop ||
    gap < 0 ||
    minimumHeight <= 0
  )
    return null;

  const belowStart = Math.max(nodeBottom + gap, viewportTop);
  const aboveEnd = Math.min(nodeTop - gap, viewportBottom);
  const viewportHeight = viewportBottom - viewportTop;
  const belowHeight = Math.max(0, viewportBottom - belowStart);
  const aboveHeight = Math.max(0, aboveEnd - viewportTop);
  if (![belowStart, aboveEnd, viewportHeight, belowHeight, aboveHeight].every(finite)) return null;

  if (panelHeight <= belowHeight) return { top: belowStart, side: 'below', scrollable: false };
  if (panelHeight <= aboveHeight)
    return { top: aboveEnd - panelHeight, side: 'above', scrollable: false };

  if (belowHeight >= aboveHeight && belowHeight >= minimumHeight)
    return { top: belowStart, side: 'below', maxHeight: belowHeight, scrollable: true };
  if (aboveHeight >= minimumHeight)
    return { top: viewportTop, side: 'above', maxHeight: aboveHeight, scrollable: true };
  return { top: viewportTop, side: 'docked', maxHeight: viewportHeight, scrollable: true };
}
