import {
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
  resolveStoryboardGridSlotCount,
  resolveStoryboardShotNumberFontPx,
} from './storyboard-grid-model.js';

const RESOLUTIONS = { '2k': 2048, '4k': 4096 };
const MAX_PIXELS = 0x2000000;
const resourceUrl = (data) => {
  const first = (value) =>
    Array.isArray(value)
      ? value.find((url) => typeof url === 'string' && url.length > 0)
      : undefined;
  return first(data?.originalUrl) ?? first(data?.url);
};

/** Source stitch order differs from the drag helper's y/x fallback. */
function orderedImages(nodes, group) {
  const children = nodes.filter((node) => node.parentId === group.id && node.type === 'image');
  const preferred = group.data?.childNodeIds;
  if (Array.isArray(preferred) && preferred.length > 0) {
    const byId = new Map(children.map((node) => [node.id, node]));
    const ordered = preferred.map((id) => byId.get(id)).filter(Boolean);
    // Source completeness is length-based; missing members are appended after duplicate IDs.
    if (ordered.length === children.length) {
      const included = new Set(ordered.map((node) => node.id));
      const remaining = children.filter((node) => !included.has(node.id));
      remaining.sort((a, b) =>
        String(a.data?.name ?? '').localeCompare(String(b.data?.name ?? ''), undefined, {
          numeric: true,
        }),
      );
      return [...ordered, ...remaining];
    }
  }
  return [...children].sort((a, b) =>
    String(a.data?.name ?? '').localeCompare(String(b.data?.name ?? ''), undefined, {
      numeric: true,
    }),
  );
}

function worldPosition(node, byId) {
  let current = node;
  const seen = new Set();
  let x = 0,
    y = 0;
  while (current) {
    if (
      seen.has(current.id) ||
      !Number.isFinite(current.position?.x) ||
      !Number.isFinite(current.position?.y)
    )
      return null;
    seen.add(current.id);
    x += current.position.x;
    y += current.position.y;
    const parentId = current.parentId;
    current = parentId ? byId.get(parentId) : undefined;
    if (parentId && !current) return null;
  }
  return { x, y };
}

/** Source right-flow placement: world coordinates, right gap120 and obstacle padding50. */
export function findStoryboardStitchNodePosition({ group, nodes, size }) {
  if (
    !group ||
    !Array.isArray(nodes) ||
    !Number.isFinite(size?.width) ||
    size.width <= 0 ||
    !Number.isFinite(size?.height) ||
    size.height <= 0
  )
    return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  if (
    byId.size !== nodes.length ||
    !byId.has(group.id) ||
    nodes.some((node) => typeof node.id !== 'string' || !node.id)
  )
    return null;
  const rectangles = [];
  for (const node of nodes) {
    const position = worldPosition(node, byId);
    const contentWidth = node.data?.contentWidth;
    const width =
      typeof contentWidth === 'number' && contentWidth > 0
        ? contentWidth
        : (node.measured?.width ?? node.width ?? 350);
    const height = node.measured?.height ?? node.height ?? 350;
    if (
      !position ||
      !Number.isFinite(width) ||
      width <= 0 ||
      !Number.isFinite(height) ||
      height <= 0
    )
      return null;
    rectangles.push({ ...position, width, height, id: node.id });
  }
  const origin = rectangles.find((node) => node.id === group.id);
  const startX = origin.x + origin.width + 120;
  const startY = origin.y;
  const padding = 50;
  const overlaps = (x, y, rectangle) =>
    x < rectangle.x + rectangle.width + padding &&
    x + size.width + padding > rectangle.x &&
    y < rectangle.y + rectangle.height + padding &&
    y + size.height + padding > rectangle.y;
  if (!rectangles.some((rectangle) => overlaps(startX, startY, rectangle)))
    return { x: startX, y: startY };
  const yAt = (x) => {
    const intervals = rectangles
      .filter(
        (rectangle) =>
          x < rectangle.x + rectangle.width + padding && x + size.width + padding > rectangle.x,
      )
      .map((rectangle) => ({
        top: rectangle.y - size.height - padding,
        bottom: rectangle.y + rectangle.height + padding,
      }))
      .sort((a, b) => a.top - b.top);
    if (!intervals.length) return startY;
    const merged = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (previous && interval.top <= previous.bottom)
        previous.bottom = Math.max(previous.bottom, interval.bottom);
      else merged.push({ ...interval });
    }
    let nearest = startY,
      distance = Infinity;
    const consider = (candidate) => {
      const nextDistance = Math.abs(candidate - startY);
      if (nextDistance < distance) {
        nearest = candidate;
        distance = nextDistance;
      }
    };
    consider(Math.min(startY, merged[0].top));
    for (let index = 0; index < merged.length - 1; index++) {
      const bottom = merged[index].bottom,
        top = merged[index + 1].top;
      if (top - bottom >= 1) consider(Math.max(bottom, Math.min(startY, top)));
    }
    consider(Math.max(startY, merged.at(-1).bottom));
    return nearest;
  };
  const xs = new Set([startX]);
  for (const rectangle of rectangles) {
    const right = rectangle.x + rectangle.width + padding,
      left = rectangle.x - size.width - padding;
    if (right >= startX) xs.add(right);
    if (left >= startX) xs.add(left);
  }
  let position = { x: startX, y: startY },
    distance = Infinity;
  for (const x of xs) {
    const y = yAt(x);
    const nextDistance = (x - startX) ** 2 + (y - startY) ** 2;
    if (nextDistance < distance) {
      position = { x, y };
      distance = nextDistance;
    }
  }
  return position;
}

/** Source center-cover crop; natural-image and logical-cell sizes stay separate. */
export function storyboardStitchCoverRect(naturalWidth, naturalHeight, width, height) {
  if (
    ![naturalWidth, naturalHeight, width, height].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  )
    return null;
  const ratio = width / height;
  return naturalWidth / naturalHeight > ratio
    ? {
        x: Math.max(0, (naturalWidth - naturalHeight * ratio) / 2),
        y: 0,
        width: naturalHeight * ratio,
        height: naturalHeight,
      }
    : {
        x: 0,
        y: Math.max(0, (naturalHeight - naturalWidth / ratio) / 2),
        width: naturalWidth,
        height: naturalWidth / ratio,
      };
}

/** Pure source geometry and source order. URL transformations/watermarks are preserved locally. */
export function planStoryboardStitch({ nodes, groupId, resolution = '2k' } = {}) {
  const invalid = (reason) => ({ valid: false, reason });
  if (!Array.isArray(nodes) || !RESOLUTIONS[resolution]) return invalid('invalidInput');
  const group = nodes.find((node) => node.id === groupId && node.type === 'group');
  if (!group) return invalid('missingGroup');
  const data = group.data;
  if (
    !data ||
    data.storyboardGroupType === 'video' ||
    !(
      data.storyboardGroupType === 'image' ||
      data.standaloneStoryboardImageGrid === true ||
      (typeof data.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0)
    )
  )
    return invalid('notStoryboardImageGroup');
  if (!data.sourceScriptNodeId && data.standaloneStoryboardImageGrid !== true)
    return invalid('notStoryboardGrid');
  const images = orderedImages(nodes, group);
  if (!images.length) return invalid('noImageNodes');
  const imageCount = images.filter((node) => resourceUrl(node.data)).length;
  if (!imageCount) return invalid('noStitchableImages');
  const { cols, rows, totalSlots } = resolveStoryboardGridSlotCount(
    Math.max(1, images.length),
    data.storyboardManualGridCols,
    data.storyboardManualGridRows,
  );
  const ratio =
    images.map((node) => extractStoryboardRatioFromNodeParams(node.data?.params)).find(Boolean) ??
    '16:9';
  const ratioSize = computeStoryboardNodeDimensionsFromRatio(ratio);
  const shortSide = Math.min(ratioSize.width, ratioSize.height);
  const longSide = Math.max(
    1,
    Math.round((540 * Math.max(ratioSize.width, ratioSize.height)) / Math.max(1, shortSide)),
  );
  const cellWidth = ratioSize.width >= ratioSize.height ? longSide : 540;
  const cellHeight = ratioSize.width >= ratioSize.height ? 540 : longSide;
  const logicalWidth = cols * cellWidth,
    logicalHeight = rows * cellHeight;
  const targetScale = RESOLUTIONS[resolution] / Math.max(logicalWidth, logicalHeight);
  const pixels = logicalWidth * targetScale * (logicalHeight * targetScale);
  const scale = targetScale * (pixels > MAX_PIXELS ? Math.sqrt(MAX_PIXELS / pixels) : 1);
  const width = Math.max(1, Math.floor(logicalWidth * scale)),
    height = Math.max(1, Math.floor(logicalHeight * scale));
  const displaySize =
    width >= height
      ? { width: Math.min(Math.round((width / height) * 350), 5600), height: 350 }
      : { width: 350, height: Math.min(Math.round((height / width) * 350), 5600) };
  const position = findStoryboardStitchNodePosition({ group, nodes, size: displaySize });
  if (!position) return invalid('invalidGeometry');
  const name = `分镜拼接-${resolution}`;
  return {
    valid: true,
    plan: {
      groupId,
      sourceIds: images.map((node) => node.id),
      items: Array.from({ length: totalSlots }, (_, index) => ({
        nodeId: images[index]?.id,
        url: resourceUrl(images[index]?.data),
        index,
        numberLabel: String(index + 1).padStart(2, '0'),
        x: (index % cols) * cellWidth,
        y: Math.floor(index / cols) * cellHeight,
        width: cellWidth,
        height: cellHeight,
      })),
      resolution,
      name,
      fileName: `${name}-${groupId.slice(0, 8)}.png`,
      cols,
      rows,
      totalSlots,
      imageCount,
      emptyCellCount: totalSlots - imageCount,
      ratio,
      cellWidth,
      cellHeight,
      width,
      height,
      scale,
      showShotNumbers: Boolean(data.showStoryboardShotNumbers),
      shotNumberFontPx: resolveStoryboardShotNumberFontPx(cols, rows),
      displaySize,
      position,
    },
  };
}
