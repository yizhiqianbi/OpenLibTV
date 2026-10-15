import {
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
} from './storyboard-grid-model.js';

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const positiveSize = (value) => positive(value?.width) && positive(value?.height);
const positionValid = (position) => Number.isFinite(position?.x) && Number.isFinite(position?.y);

/** Source 365256 estimateNodeFlowSize; the caller owns the optional image cache. */
function estimateSize(node, lookupImageDim) {
  const data = node.data;
  const url = Array.isArray(data?.url) ? data.url[0] : undefined;
  const content = { width: data?.contentWidth, height: data?.contentHeight };
  if (data?._explicitContentDims === true && positiveSize(content)) return content;
  const media = data?.mediaDisplaySize;
  if (url && media?.sourceUrl === url && positiveSize(media))
    return { width: media.width, height: media.height };
  if (positiveSize(content)) return content;
  if (url && lookupImageDim) {
    const cached = lookupImageDim(url);
    if (positiveSize(cached)) return { width: cached.width, height: cached.height };
  }
  const ratio = extractStoryboardRatioFromNodeParams(data?.params);
  if (ratio) return computeStoryboardNodeDimensionsFromRatio(ratio);
  if (positiveSize(node.measured))
    return { width: node.measured.width, height: node.measured.height };
  if (positiveSize(node)) return { width: node.width, height: node.height };
  return { width: 350, height: 350 };
}

/**
 * Source pF: grow non-standalone group/video_group bounds after node stop. The node
 * wrapper passes only its primary's final parent; the virtual frame never calls pF.
 * Compensating child positions preserves every child's world position. No history,
 * membership, selection, service or React lifecycle is changed by this pure plan.
 */
export function planCanvasParentBounds({ nodes, groupIds = [], getNodeSize, lookupImageDim } = {}) {
  const invalid = { valid: false, changed: false, nodes, changedGroupIds: [] };
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(groupIds) ||
    groupIds.some((id) => typeof id !== 'string' || !id)
  )
    return invalid;
  const current = new Map(nodes.map((node) => [node?.id, node]));
  if (
    current.size !== nodes.length ||
    [...current.keys()].some((id) => typeof id !== 'string' || !id)
  )
    return invalid;
  let next = nodes;
  const changedGroupIds = [];
  try {
    for (const id of new Set(groupIds)) {
      const group = current.get(id);
      if (
        !group ||
        !['group', 'video_group'].includes(group.type) ||
        group.data?.standaloneStoryboardImageGrid === true
      )
        continue;
      const children = next.filter((node) => node.parentId === id);
      if (!children.length) continue;
      const width = group.width ?? group.measured?.width ?? 0;
      const height = group.height ?? group.measured?.height ?? 0;
      if (
        !positionValid(group.position) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width < 0 ||
        height < 0
      )
        throw new Error('Invalid group bounds');
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const node of children) {
        if (!positionValid(node.position)) throw new Error('Invalid child position');
        const size =
          getNodeSize?.(node, { role: 'bounds', surface: 'node' }) ??
          estimateSize(node, lookupImageDim);
        if (
          !Number.isFinite(size.width) ||
          !Number.isFinite(size.height) ||
          size.width < 0 ||
          size.height < 0
        )
          throw new Error('Invalid child bounds');
        minX = Math.min(minX, node.position.x);
        minY = Math.min(minY, node.position.y);
        maxX = Math.max(maxX, node.position.x + size.width);
        maxY = Math.max(maxY, node.position.y + size.height);
      }
      const left = Math.max(0, 20 - minX);
      const top = Math.max(0, 56 - minY);
      const right = Math.max(0, maxX + 20 - width);
      const bottom = Math.max(0, maxY + 20 - height);
      if (left === 0 && top === 0 && right === 0 && bottom === 0) continue;
      const expanded = { width: width + left + right, height: height + top + bottom };
      const position = { x: group.position.x - left, y: group.position.y - top };
      if (!positiveSize(expanded) || !positionValid(position))
        throw new Error('Invalid expanded bounds');
      if (left > 0 || top > 0)
        for (const node of children) {
          const childPosition = { x: node.position.x + left, y: node.position.y + top };
          if (!positionValid(childPosition)) throw new Error('Invalid compensated position');
          current.set(node.id, { ...node, position: childPosition });
        }
      current.set(id, { ...group, position, ...expanded, measured: { ...expanded } });
      next = next.map((node) => current.get(node.id));
      changedGroupIds.push(id);
    }
    return { valid: true, changed: next !== nodes, nodes: next, changedGroupIds };
  } catch {
    return invalid;
  }
}
