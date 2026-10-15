const GRID_INSET = 4;
const GRID_GAP = 4;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);

/** Source 836105: content dimensions precede measured and stored flow dimensions. */
export function getStoryboardImageGridChildSize(node) {
  const data = node.data;
  const width = typeof data?.contentWidth === 'number' && data.contentWidth > 0;
  const height = typeof data?.contentHeight === 'number' && data.contentHeight > 0;
  return {
    w: width ? data.contentWidth : (node.measured?.width ?? node.width ?? 200),
    h: height ? data.contentHeight : (node.measured?.height ?? node.height ?? 120),
  };
}

export function resolveStoryboardGridColumnCount(count, manualCols) {
  return manualCols != null && manualCols > 0
    ? Math.min(Math.max(1, Math.round(manualCols)), 5)
    : Math.min(5, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, count)))));
}

export function resolveStoryboardGridSlotCount(count, manualCols, manualRows) {
  const cols = resolveStoryboardGridColumnCount(Math.max(1, count), manualCols);
  const naturalRows = Math.max(1, Math.ceil(Math.max(1, count) / Math.max(1, cols)));
  const rows =
    manualRows != null && Number.isFinite(manualRows)
      ? Math.max(naturalRows, Math.min(5, Math.max(1, Math.round(manualRows))))
      : naturalRows;
  return { cols, rows, totalSlots: cols * rows };
}

export function resolveStoryboardTotalSlots(count, manualCols, manualRows) {
  return resolveStoryboardGridSlotCount(Math.max(1, count), manualCols, manualRows).totalSlots;
}

export function getStoryboardFixedManualGridCapacity(manualCols, manualRows) {
  return manualCols != null &&
    manualRows != null &&
    Number.isFinite(manualCols) &&
    Number.isFinite(manualRows)
    ? Math.min(5, Math.max(1, Math.round(manualCols))) *
        Math.min(5, Math.max(1, Math.round(manualRows)))
    : null;
}

export function isStoryboardImageGridFullForIncoming(count, manualCols, manualRows) {
  const existing = Math.max(0, count);
  if (existing >= 25) return true;
  const fixedCapacity = getStoryboardFixedManualGridCapacity(manualCols, manualRows);
  if (fixedCapacity != null) return existing >= fixedCapacity;
  const slots = resolveStoryboardTotalSlots(Math.max(1, existing || 1), manualCols, manualRows);
  return (
    existing >= slots && resolveStoryboardTotalSlots(existing + 1, manualCols, manualRows) === slots
  );
}

/** Source Canvas mZ checks each incoming image against the capacity at that insertion. */
export function canStoryboardImageGridAcceptIncoming(count, incoming, manualCols, manualRows) {
  // Local adapter boundary: malformed requests cannot bypass the capacity check.
  if (!Number.isFinite(count) || !Number.isInteger(incoming) || incoming < 0) return false;
  let existing = Math.max(0, count);
  for (let index = 0; index < incoming; index++) {
    if (isStoryboardImageGridFullForIncoming(existing, manualCols, manualRows)) return false;
    existing++;
  }
  return true;
}

export function computeStoryboardGridCellSize(nodes) {
  if (!nodes.length) return { cellW: 200, cellH: 120 };
  const sizes = nodes.map(getStoryboardImageGridChildSize);
  return {
    cellW: Math.max(...sizes.map((size) => size.w)),
    cellH: Math.max(...sizes.map((size) => size.h)),
  };
}

export function computeStoryboardGridLayout(cellW, cellH, totalSlots, manualCols) {
  const count = Math.max(1, totalSlots);
  const cols = resolveStoryboardGridColumnCount(count, manualCols);
  const rows = Math.max(1, Math.ceil(count / cols));
  return {
    cols,
    rows,
    slotPositions: Array.from({ length: count }, (_, index) => ({
      x: GRID_INSET + (index % cols) * (cellW + GRID_GAP),
      y: GRID_INSET + Math.floor(index / cols) * (cellH + GRID_GAP),
    })),
    slotSizes: Array.from({ length: count }, () => ({ width: cellW, height: cellH })),
    width: GRID_INSET * 2 + cols * cellW + (cols - 1) * GRID_GAP,
    height: GRID_INSET * 2 + rows * cellH + (rows - 1) * GRID_GAP,
  };
}

export function computeStoryboardVariableGridLayout(sizes, totalSlots, manualCols) {
  const count = Math.max(1, totalSlots);
  const cols = resolveStoryboardGridColumnCount(count, manualCols);
  const rows = Math.max(1, Math.ceil(count / cols));
  const fallbackW = Math.max(200, ...sizes.map((size) => size.width));
  const fallbackH = Math.max(120, ...sizes.map((size) => size.height));
  const widths = Array.from({ length: cols }, () => 0);
  const heights = Array.from({ length: rows }, () => 0);
  sizes.forEach((size, index) => {
    const row = Math.floor(index / cols);
    if (row >= rows) return;
    const col = index % cols;
    widths[col] = Math.max(widths[col], size.width);
    heights[row] = Math.max(heights[row], size.height);
  });
  widths.forEach((width, index) => {
    if (width <= 0) widths[index] = fallbackW;
  });
  heights.forEach((height, index) => {
    if (height <= 0) heights[index] = fallbackH;
  });
  const xs = [];
  const ys = [];
  let x = GRID_INSET;
  let y = GRID_INSET;
  for (const width of widths) {
    xs.push(x);
    x += width + GRID_GAP;
  }
  for (const height of heights) {
    ys.push(y);
    y += height + GRID_GAP;
  }
  return {
    cols,
    rows,
    slotPositions: Array.from({ length: count }, (_, index) => ({
      x: xs[index % cols],
      y: ys[Math.floor(index / cols)],
    })),
    slotSizes: Array.from({ length: count }, (_, index) => ({
      width: widths[index % cols],
      height: heights[Math.floor(index / cols)],
    })),
    width: GRID_INSET * 2 + widths.reduce((sum, width) => sum + width, 0) + (cols - 1) * GRID_GAP,
    height:
      GRID_INSET * 2 + heights.reduce((sum, height) => sum + height, 0) + (rows - 1) * GRID_GAP,
  };
}

export function findNearestSlotIndex(x, y, positions, sizes) {
  let best = 0;
  let distance = Infinity;
  positions.forEach((position, index) => {
    const size = sizes[index];
    if (!size) return;
    const dx = x - position.x - size.width / 2;
    const dy = y - position.y - size.height / 2;
    const squared = dx * dx + dy * dy;
    if (squared < distance) {
      distance = squared;
      best = index;
    }
  });
  return best;
}

/** Source hit helper uses stored group dimensions and direct position, inclusive edges. */
export function findStandaloneStoryboardGridGroupAt(x, y, nodes, excludedId) {
  let target;
  let area = Infinity;
  for (const node of nodes) {
    if (
      node.type !== 'group' ||
      node.id === excludedId ||
      node.data?.standaloneStoryboardImageGrid !== true ||
      node.data?.storyboardGroupType !== 'image'
    )
      continue;
    const width = node.width ?? node.measured?.width ?? 0;
    const height = node.height ?? node.measured?.height ?? 0;
    if (
      x >= node.position.x &&
      x <= node.position.x + width &&
      y >= node.position.y &&
      y <= node.position.y + height &&
      width * height < area
    ) {
      area = width * height;
      target = node;
    }
  }
  return target;
}

export function getStableChildOrder(nodes, preferredIds) {
  if (preferredIds?.length) {
    const ids = new Set(nodes.map((node) => node.id));
    const filtered = preferredIds.filter((id) => ids.has(id));
    if (filtered.length === nodes.length) {
      const lookup = new Map(nodes.map((node) => [node.id, node]));
      return filtered.map((id) => lookup.get(id)).filter(Boolean);
    }
  }
  return [...nodes].sort((a, b) =>
    Math.abs(a.position.y - b.position.y) > 8
      ? a.position.y - b.position.y
      : a.position.x - b.position.x,
  );
}

export function resolveStoryboardShotNumberFontPx(cols, rows, base = 16) {
  return (
    base * Math.max(1, Math.max(Math.max(1, Math.round(cols)), Math.max(1, Math.round(rows))) / 2)
  );
}

const ratioValue = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed !== 'auto' ? trimmed : undefined;
};

/** Source 713118: ratio* field order is the settings object's own property order. */
export function extractStoryboardRatioFromNodeParams(params) {
  if (!object(params)) return undefined;
  const settings = params.settings;
  if (settings) {
    const ratio = ratioValue(settings.ratio);
    if (ratio) return ratio;
    for (const key of Object.keys(settings)) {
      if (!key.startsWith('ratio') || key === 'ratio') continue;
      const candidate = ratioValue(settings[key]);
      if (candidate) return candidate;
    }
    const aspectRatio = ratioValue(settings.aspectRatio);
    if (aspectRatio) return aspectRatio;
  }
  return ratioValue(params.aspectRatio);
}

export function computeStoryboardNodeDimensionsFromRatio(ratio) {
  if (!ratio || ratio === 'auto' || typeof ratio !== 'string') return { width: 350, height: 350 };
  const parts = ratio.split(':');
  const width = parseInt(parts[0], 10);
  const height = parseInt(parts[1], 10);
  if (
    parts.length !== 2 ||
    Number.isNaN(width) ||
    Number.isNaN(height) ||
    width <= 0 ||
    height <= 0
  )
    return { width: 350, height: 350 };
  return width <= height
    ? { width: 350, height: Math.min(Math.round((height / width) * 350), 1050) }
    : { width: Math.min(Math.round((width / height) * 350), 1050), height: 350 };
}

const imageStoryboardGroup = (group) =>
  group?.type === 'group' &&
  group.data?.storyboardGroupType !== 'video' &&
  (group.data?.storyboardGroupType === 'image' ||
    !!group.data?.sourceScriptNodeId ||
    group.data?.standaloneStoryboardImageGrid === true);

/** Partial data patch: the caller merges it and deletes undefined keys, as updateNodeData does. */
export function buildStoryboardImageRatioPatch({ node, group, nodes } = {}) {
  if (
    node?.type !== 'image' ||
    !imageStoryboardGroup(group) ||
    group.data?.storyboardPreserveChildDimensions === true ||
    !Array.isArray(nodes)
  )
    return null;
  const sibling = (id) =>
    nodes.find(
      (candidate) =>
        candidate.id === id &&
        candidate.id !== node.id &&
        candidate.parentId === group.id &&
        candidate.type === 'image',
    );
  const preferred = Array.isArray(group.data?.childNodeIds)
    ? group.data.childNodeIds.map(sibling).find(Boolean)
    : undefined;
  const first =
    preferred ??
    nodes.find(
      (candidate) =>
        candidate.parentId === group.id && candidate.id !== node.id && candidate.type === 'image',
    );
  const ratio = extractStoryboardRatioFromNodeParams(first?.data?.params) ?? '16:9';
  const dimensions = computeStoryboardNodeDimensionsFromRatio(ratio);
  const params = node.data?.params ?? {};
  return {
    data: {
      params: { ...params, settings: { ...params.settings, ratio } },
      contentWidth: undefined,
      contentHeight: undefined,
    },
    ...dimensions,
    measured: { ...dimensions },
  };
}

export function buildStoryboardGridChildExplicitDims(width, height) {
  return { _explicitContentDims: true, contentWidth: width, contentHeight: height };
}

function validGraph(nodes) {
  if (!Array.isArray(nodes)) return false;
  const ids = new Set();
  return nodes.every((node) => {
    if (
      !node ||
      typeof node.id !== 'string' ||
      !node.id ||
      ids.has(node.id) ||
      !finitePosition(node.position)
    )
      return false;
    ids.add(node.id);
    return true;
  });
}

function preservePreviewDimensions(preview) {
  if (!preview.preserveChildDimensions) return preview;
  const layout = computeStoryboardVariableGridLayout(
    preview.order.map(
      (id) => preview.childDimensions[id] ?? { width: preview.cellW, height: preview.cellH },
    ),
    preview.totalSlots,
    preview.manualCols,
  );
  return {
    ...preview,
    slotPositions: layout.slotPositions,
    slotSizes: layout.slotSizes,
    currentGroupWidth: layout.width,
    currentGroupHeight: layout.height,
  };
}

/** Source m4. Source callers, rather than this builder, gate target type/subtype. */
export function createStoryboardGridDragPreview({ nodes, groupId, draggedId, slotIndex } = {}) {
  if (!validGraph(nodes)) return null;
  const group = nodes.find((node) => node.id === groupId);
  const dragged = nodes.find((node) => node.id === draggedId);
  const data = group?.data;
  if (
    !group ||
    !dragged ||
    dragged.id === group.id ||
    data?.standaloneStoryboardImageGrid !== true ||
    (data.childNodeIds !== undefined && !Array.isArray(data.childNodeIds))
  )
    return null;
  const children = nodes.filter((node) => node.parentId === groupId && node.id !== draggedId);
  const ordered = getStableChildOrder(children, data.childNodeIds);
  // Local atomic boundary: corrupt preferred IDs cannot duplicate or omit a real child.
  if (new Set(ordered.map((node) => node.id)).size !== children.length) return null;
  if (
    dragged.parentId !== groupId &&
    dragged.type === 'image' &&
    isStoryboardImageGridFullForIncoming(
      ordered.filter((node) => node.type === 'image').length,
      data.storyboardManualGridCols,
      data.storyboardManualGridRows,
    )
  )
    return null;
  const all = [...children, dragged];
  const sizes = all.map(getStoryboardImageGridChildSize);
  if (
    sizes.some(
      (size) => !Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w < 0 || size.h < 0,
    )
  )
    return null;
  const { cellW, cellH } = computeStoryboardGridCellSize(all);
  const totalSlots = resolveStoryboardTotalSlots(
    all.length,
    data.storyboardManualGridCols,
    data.storyboardManualGridRows,
  );
  const requested = slotIndex ?? 0;
  if (!Number.isInteger(requested)) return null;
  const draggedSlot = Math.min(Math.max(0, requested), ordered.length);
  const order = ordered.map((node) => node.id);
  order.splice(draggedSlot, 0, dragged.id);
  const layout = computeStoryboardGridLayout(
    cellW,
    cellH,
    totalSlots,
    data.storyboardManualGridCols,
  );
  return preservePreviewDimensions({
    groupId,
    draggedId,
    originalParentId: dragged.parentId,
    isInside: true,
    cellW,
    cellH,
    totalSlots,
    slotPositions: layout.slotPositions,
    slotSizes: layout.slotSizes,
    order,
    draggedSlot,
    currentGroupWidth: layout.width,
    currentGroupHeight: layout.height,
    preserveChildDimensions: data.storyboardPreserveChildDimensions === true,
    childDimensions: Object.fromEntries(
      all.map((node, index) => [node.id, { width: sizes[index].w, height: sizes[index].h }]),
    ),
    manualCols: data.storyboardManualGridCols,
  });
}

export function reorderStoryboardGridDragPreview(preview, center) {
  if (!preview?.isInside || !finitePosition(center)) return preview;
  const nearest = findNearestSlotIndex(
    center.x,
    center.y,
    preview.slotPositions,
    preview.slotSizes,
  );
  if (nearest === preview.draggedSlot) return preview;
  const order = preview.order.filter((id) => id !== preview.draggedId);
  const draggedSlot = Math.min(Math.max(0, nearest), order.length);
  order.splice(draggedSlot, 0, preview.draggedId);
  return preservePreviewDimensions({ ...preview, order, draggedSlot });
}

/** Source P: leaving never shrinks the uniform cell; its empty-order branch retains geometry. */
export function leaveStoryboardGridDragPreview(preview, nodes) {
  const order = preview.order.filter((id) => id !== preview.draggedId);
  if (!order.length) return { ...preview, isInside: false, draggedSlot: -1 };
  const remaining = order.map((id) => nodes.find((node) => node.id === id)).filter(Boolean);
  const size = computeStoryboardGridCellSize(remaining);
  const cellW = Math.max(size.cellW, preview.cellW);
  const cellH = Math.max(size.cellH, preview.cellH);
  const data = nodes.find((node) => node.id === preview.groupId)?.data;
  const totalSlots = resolveStoryboardTotalSlots(
    order.length,
    data?.storyboardManualGridCols,
    data?.storyboardManualGridRows,
  );
  const layout = computeStoryboardGridLayout(
    cellW,
    cellH,
    totalSlots,
    data?.storyboardManualGridCols,
  );
  return preservePreviewDimensions({
    ...preview,
    isInside: false,
    draggedSlot: -1,
    cellW,
    cellH,
    totalSlots,
    slotPositions: layout.slotPositions,
    slotSizes: layout.slotSizes,
    order,
    currentGroupWidth: layout.width,
    currentGroupHeight: layout.height,
  });
}

function validPreview(preview, nodes, draggedId) {
  if (!preview) return true;
  const ids = new Set(nodes.map((node) => node.id));
  const dragged = nodes.find((node) => node.id === draggedId);
  const actualChildren = nodes.filter(
    (node) => node.parentId === preview.groupId && node.id !== draggedId,
  );
  const trackedChildren = Array.isArray(preview.order)
    ? new Set(preview.order.filter((id) => id !== draggedId))
    : new Set();
  return (
    preview.draggedId === draggedId &&
    dragged?.parentId === preview.originalParentId &&
    ids.has(preview.groupId) &&
    Array.isArray(preview.order) &&
    new Set(preview.order).size === preview.order.length &&
    preview.order.every((id) => ids.has(id)) &&
    actualChildren.length === trackedChildren.size &&
    actualChildren.every((node) => trackedChildren.has(node.id)) &&
    Number.isFinite(preview.currentGroupWidth) &&
    Number.isFinite(preview.currentGroupHeight)
  );
}

function projectPreview(nodes, preview) {
  let changed = false;
  const slots = new Map(preview.order.map((id, index) => [id, preview.slotPositions[index]]));
  const next = nodes.map((node) => {
    if (node.id === preview.groupId) {
      const width = preview.currentGroupWidth;
      const height = preview.currentGroupHeight;
      if (
        node.width === width &&
        node.height === height &&
        node.measured?.width === width &&
        node.measured?.height === height
      )
        return node;
      changed = true;
      return { ...node, width, height, measured: { width, height } };
    }
    const position = node.id !== preview.draggedId && slots.get(node.id);
    if (!position || (node.position.x === position.x && node.position.y === position.y))
      return node;
    changed = true;
    return { ...node, position: { ...position } };
  });
  return changed ? next : nodes;
}

const phaseResult = (nodes, context, extra = {}) => ({
  valid: true,
  nodes,
  context,
  targetGroupId: context?.preview?.isInside ? context.preview.groupId : null,
  ...extra,
});
const invalidPhase = (nodes, context, reason) => ({
  valid: false,
  nodes,
  context,
  targetGroupId: null,
  reason,
});

/**
 * Pure source drag-start projection. The caller owns modifier/mode/readiness gates,
 * cancellation, current document identity, and the single gesture history baseline.
 */
export function prepareStoryboardGridDrag({ nodes, draggedId } = {}) {
  if (!validGraph(nodes)) return invalidPhase(nodes, null, 'invalidGraph');
  const dragged = nodes.find((node) => node.id === draggedId);
  if (!dragged) return invalidPhase(nodes, null, 'invalidSource');
  const parent = dragged.parentId && nodes.find((node) => node.id === dragged.parentId);
  if (dragged.parentId && !parent) return invalidPhase(nodes, null, 'missingParent');
  const context = { draggedId, preview: null };
  if (
    dragged.type !== 'image' ||
    parent?.type !== 'group' ||
    parent.data?.standaloneStoryboardImageGrid !== true
  )
    return phaseResult(nodes, context);
  const ids = parent.data?.childNodeIds;
  const slotIndex =
    Array.isArray(ids) && ids.includes(draggedId) ? ids.indexOf(draggedId) : undefined;
  const preview = createStoryboardGridDragPreview({
    nodes,
    groupId: parent.id,
    draggedId,
    slotIndex,
  });
  if (!preview) return invalidPhase(nodes, context, 'invalidPreview');
  return phaseResult(projectPreview(nodes, preview), { draggedId, preview });
}

/** Source D uses flow box center plus the direct parent's position, without a pointer hit. */
export function updateStoryboardGridDrag({ nodes, draggedId, context, getNodeSize } = {}) {
  if (!validGraph(nodes)) return invalidPhase(nodes, context, 'invalidGraph');
  const dragged = nodes.find((node) => node.id === draggedId);
  if (!dragged || (context && context.draggedId !== draggedId))
    return invalidPhase(nodes, context, 'invalidSource');
  const parent = dragged.parentId && nodes.find((node) => node.id === dragged.parentId);
  if (dragged.parentId && !parent) return invalidPhase(nodes, context, 'missingParent');
  const previous = context?.preview ?? null;
  if (!validPreview(previous, nodes, draggedId))
    return invalidPhase(nodes, context, 'stalePreview');
  // Local renderer adapter: injected display dimensions stand in for RF's measured flow box.
  const displaySize = getNodeSize?.(dragged);
  const width = displaySize
    ? displaySize.width
    : (dragged.measured?.width ?? dragged.width ?? 200) || 200;
  const height = displaySize
    ? displaySize.height
    : (dragged.measured?.height ?? dragged.height ?? 120) || 120;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
    return invalidPhase(nodes, context, 'invalidDimensions');
  const center = {
    x: dragged.position.x + (parent?.position.x ?? 0) + width / 2,
    y: dragged.position.y + (parent?.position.y ?? 0) + height / 2,
  };
  const target = findStandaloneStoryboardGridGroupAt(center.x, center.y, nodes, draggedId);
  if (!target || dragged.type !== 'image') {
    if (!previous?.isInside)
      return phaseResult(nodes, context ?? { draggedId, preview: null }, {
        reason: target ? 'imageOnly' : undefined,
      });
    const preview = leaveStoryboardGridDragPreview(previous, nodes);
    return phaseResult(
      projectPreview(nodes, preview),
      { draggedId, preview },
      { reason: target ? 'imageOnly' : undefined },
    );
  }
  let preview = previous;
  if (!preview || preview.groupId !== target.id || !preview.isInside) {
    preview = createStoryboardGridDragPreview({ nodes, groupId: target.id, draggedId });
    if (!preview) {
      // Source D leaves an old inside preview when a new target rejects entry.
      if (previous?.isInside) {
        const outside = leaveStoryboardGridDragPreview(previous, nodes);
        return phaseResult(
          projectPreview(nodes, outside),
          { draggedId, preview: outside },
          { reason: 'fullOrInvalidPreview' },
        );
      }
      return phaseResult(nodes, context ?? { draggedId, preview: null }, {
        reason: 'fullOrInvalidPreview',
      });
    }
  }
  preview = reorderStoryboardGridDragPreview(preview, {
    x: center.x - target.position.x,
    y: center.y - target.position.y,
  });
  const nextContext = context?.preview === preview ? context : { draggedId, preview };
  return phaseResult(projectPreview(nodes, preview), nextContext);
}

function mergeData(data, patch) {
  const next = { ...data, ...patch };
  for (const [key, value] of Object.entries(patch)) if (value === undefined) delete next[key];
  return next;
}

function groupCountUpdate(name, count, storyboard) {
  if (
    typeof name === 'string' &&
    name.length > 0 &&
    !/^分组\s*\d+\s*个节点$/.test(name) &&
    !/^分镜组\s*\d+\s*个节点$/.test(name)
  )
    return {};
  return { name: `${storyboard ? '分镜组' : '分组'} ${count} 个节点` };
}

function groupGridData(group, preview, order) {
  return {
    ...group.data,
    childNodeIds: [...order],
    nodeWidth: preview.currentGroupWidth,
    nodeHeight: preview.currentGroupHeight,
    groupLayoutMode: 'grid',
    ...groupCountUpdate(group.data?.name, order.length, imageStoryboardGroup(group)),
  };
}

/**
 * Source grid stop is handled before ordinary containment drop. Returns a complete immutable
 * node projection; it never writes stores, snapshots, or selection and never edits edges.
 */
export function finishStoryboardGridDrag({ nodes, draggedId, context } = {}) {
  const invalid = (reason) => ({
    valid: false,
    changed: false,
    nodes,
    kind: 'none',
    transitionIds: [],
    sourceGroupIds: [],
    reason,
  });
  const result = (next = nodes, extra = {}) => ({
    valid: true,
    changed: next !== nodes,
    nodes: next,
    kind: 'none',
    transitionIds: [],
    sourceGroupIds: [],
    ...extra,
  });
  if (!validGraph(nodes)) return invalid('invalidGraph');
  const dragged = nodes.find((node) => node.id === draggedId);
  if (!dragged || (context && context.draggedId !== draggedId)) return invalid('invalidSource');
  const preview = context?.preview;
  if (!preview) return result();
  if (!validPreview(preview, nodes, draggedId)) return invalid('stalePreview');
  const group = nodes.find((node) => node.id === preview.groupId);
  if (group.data?.standaloneStoryboardImageGrid !== true) return invalid('invalidTarget');
  if (!preview.isInside && preview.originalParentId !== preview.groupId) return result();
  const incoming = dragged.parentId !== group.id;
  const count = nodes.filter(
    (node) => node.parentId === group.id && node.type === 'image' && node.id !== dragged.id,
  ).length;
  const full =
    preview.isInside &&
    incoming &&
    isStoryboardImageGridFullForIncoming(
      count,
      group.data?.storyboardManualGridCols,
      group.data?.storyboardManualGridRows,
    );
  const imageOnly = preview.isInside && dragged.type !== 'image';
  const detach = !preview.isInside || full || imageOnly;
  const finalPreview = full || imageOnly ? leaveStoryboardGridDragPreview(preview, nodes) : preview;
  const order = detach ? finalPreview.order.filter((id) => id !== draggedId) : finalPreview.order;
  let projected = projectPreview(nodes, finalPreview);
  const ratio = !detach ? buildStoryboardImageRatioPatch({ node: dragged, group, nodes }) : null;
  projected = projected.map((node) => {
    if (node.id === group.id) return { ...node, data: groupGridData(node, finalPreview, order) };
    if (node.id !== draggedId) return node;
    if (detach) {
      const position =
        dragged.parentId === group.id
          ? { x: group.position.x + dragged.position.x, y: group.position.y + dragged.position.y }
          : { ...dragged.position };
      const { parentId: _parent, extent: _extent, ...rest } = node;
      return { ...rest, position };
    }
    const slot = finalPreview.slotPositions[finalPreview.draggedSlot];
    const next = { ...node, position: slot ? { ...slot } : node.position };
    if (incoming) {
      next.parentId = group.id;
      delete next.extent;
    }
    if (ratio) {
      next.width = ratio.width;
      next.height = ratio.height;
      next.measured = { ...ratio.measured };
      next.data = mergeData(next.data, ratio.data);
    }
    if (group.data?.storyboardPreserveChildDimensions !== true)
      next.data = mergeData(
        next.data,
        buildStoryboardGridChildExplicitDims(finalPreview.cellW, finalPreview.cellH),
      );
    return next;
  });
  return result(projected, {
    kind: 'standaloneStoryboardGrid',
    transitionIds: detach || incoming ? [draggedId] : [],
    sourceGroupIds: dragged.parentId && (detach || incoming) ? [dragged.parentId] : [],
    targetGroupId: detach ? null : group.id,
    reason: full ? 'full' : imageOnly ? 'imageOnly' : detach ? 'detached' : undefined,
  });
}

/**
 * Source standalone group renderer tH/e3 membership reflow. Call only for groups whose
 * actual nonempty membership/order signature changed; the caller owns that lifecycle.
 * Planning every requested group is atomic: one malformed group returns the input graph.
 */
export function reconcileStoryboardGridMembership({ nodes, groupIds = [] } = {}) {
  const invalid = (reason) => ({
    valid: false,
    changed: false,
    nodes,
    reconciledGroupIds: [],
    reason,
  });
  if (
    !validGraph(nodes) ||
    !Array.isArray(groupIds) ||
    groupIds.some((id) => typeof id !== 'string' || !id)
  )
    return invalid('invalidGraph');
  let projected = nodes;
  const reconciledGroupIds = [];
  for (const groupId of new Set(groupIds)) {
    const group = projected.find((node) => node.id === groupId);
    if (
      group?.type !== 'group' ||
      group.data?.standaloneStoryboardImageGrid !== true ||
      group.data?.storyboardGroupType !== 'image'
    )
      continue;
    const children = projected.filter((node) => node.parentId === groupId);
    // Source e3 is empty for an empty group and the effect does not invoke tH.
    if (!children.length) continue;
    const preferred = group.data.childNodeIds;
    if (preferred != null && !Array.isArray(preferred)) return invalid('invalidOrder');
    const actualIds = new Set(children.map((node) => node.id));
    const filtered = preferred?.filter((id) => actualIds.has(id)) ?? [];
    if (filtered.length === children.length && new Set(filtered).size !== children.length)
      return invalid('invalidOrder');
    const ordered =
      filtered.length === children.length
        ? filtered.map((id) => children.find((node) => node.id === id))
        : [...children].sort((a, b) =>
            (a.data?.name ?? '').localeCompare(b.data?.name ?? '', undefined, { numeric: true }),
          );
    const sizes = ordered.map(getStoryboardImageGridChildSize);
    if (
      sizes.some(
        (size) => !Number.isFinite(size.w) || !Number.isFinite(size.h) || size.w < 0 || size.h < 0,
      )
    )
      return invalid('invalidDimensions');
    const totalSlots = resolveStoryboardTotalSlots(
      ordered.length,
      group.data.storyboardManualGridCols,
      group.data.storyboardManualGridRows,
    );
    const preserve = group.data.storyboardPreserveChildDimensions === true;
    const cellW = Math.max(48, ...sizes.map((size) => size.w));
    const cellH = Math.max(48, ...sizes.map((size) => size.h));
    const layout = preserve
      ? computeStoryboardVariableGridLayout(
          sizes.map((size) => ({ width: size.w, height: size.h })),
          totalSlots,
          group.data.storyboardManualGridCols,
        )
      : computeStoryboardGridLayout(cellW, cellH, totalSlots, group.data.storyboardManualGridCols);
    const slots = new Map(
      ordered.map((node, index) => [
        node.id,
        { position: layout.slotPositions[index], size: sizes[index] },
      ]),
    );
    const { width: _styleWidth, height: _styleHeight, ...style } = group.style ?? {};
    projected = projected.map((node) => {
      if (node.id === groupId)
        return {
          ...node,
          width: layout.width,
          height: layout.height,
          measured: { width: layout.width, height: layout.height },
          style,
          data: {
            ...node.data,
            childNodeIds: ordered.map((child) => child.id),
            nodeWidth: layout.width,
            nodeHeight: layout.height,
            groupLayoutMode: 'grid',
          },
        };
      const slot = slots.get(node.id);
      if (!slot) return node;
      const width = preserve ? slot.size.w : cellW;
      const height = preserve ? slot.size.h : cellH;
      return {
        ...node,
        position: { ...slot.position },
        ...(preserve ? { width, height, measured: { width, height } } : {}),
        data: mergeData(node.data, buildStoryboardGridChildExplicitDims(width, height)),
      };
    });
    reconciledGroupIds.push(groupId);
  }
  return { valid: true, changed: projected !== nodes, nodes: projected, reconciledGroupIds };
}
