const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const validId = (value) => typeof value === 'string' && value.length > 0;

export const FOCUS_ASPECTS = Object.freeze([
  Object.freeze({ label: '16:9', ratio: 16 / 9 }),
  Object.freeze({ label: '3:2', ratio: 3 / 2 }),
  Object.freeze({ label: '4:3', ratio: 4 / 3 }),
  Object.freeze({ label: '1:1', ratio: 1 }),
  Object.freeze({ label: '3:4', ratio: 3 / 4 }),
  Object.freeze({ label: '2:3', ratio: 2 / 3 }),
  Object.freeze({ label: '9:16', ratio: 9 / 16 }),
]);

const RESOURCE_ACTIONS = new Set([
  'image_resource',
  'video_resource',
  'video_clip_resource',
  'audio_resource',
  'text_resource',
  'script_resource',
  'video_story_resource',
]);
const HANDLES = new Set(['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']);
const CORNERS = new Set(['nw', 'ne', 'sw', 'se']);

function hasDefaultImageGenerator(node) {
  if (node?.type !== 'image' || !record(node.data)) return false;
  const data = node.data;
  if (
    ['picture_edit', 'subtitle_erase', 'picture-edit', 'subtitle-erase', 'enhance'].includes(
      data.generatorType,
    )
  )
    return false;
  const assetSourced =
    (!!data.portraitAssetId || !!data.portraitCompliantExempt) && !data.portraitCertifiedInPlace;
  return !!(
    (!RESOURCE_ACTIONS.has(data.action) || assetSourced || data.showGenerator) &&
    (data.showGenerator ?? data.action !== 'image_edit')
  );
}

/** Source IMAGE attachment entry. Parent/grid/protection/readiness remain caller guards. */
export function focusGeneratorCapability({
  node,
  schema,
  isAssetBoardMode = false,
  onlyFineTune = false,
  slashPreset,
} = {}) {
  return !!(
    hasDefaultImageGenerator(node) &&
    schema?.properties?.focus === true &&
    !isAssetBoardMode &&
    !onlyFineTune &&
    !slashPreset
  );
}

function validContentRect(rect) {
  return (
    [rect?.left, rect?.top, rect?.width, rect?.height].every(finite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function validPoint(point) {
  return finite(point?.x) && finite(point?.y);
}

function validRegion(region) {
  return (
    [region?.relX, region?.relY, region?.width, region?.height].every(finite) &&
    region.relX >= 0 &&
    region.relY >= 0 &&
    region.relX <= 1 + 1e-12 &&
    region.relY <= 1 + 1e-12 &&
    region.width > 0 &&
    region.height > 0 &&
    // Source corner resize reapplies its .02 minimum after boundary fitting.
    // That reachable state, and later ratio/edge edits, must remain editable.
    region.relX + region.width <= 1.02 + 1e-12 &&
    region.relY + region.height <= 1.02 + 1e-12
  );
}

/** Coordinates are client pixels over the actual rendered content, never canvas world units. */
export function normalizeFocusPoint(clientPoint, contentRect) {
  if (!validPoint(clientPoint) || !validContentRect(contentRect)) return null;
  return {
    x: clamp((clientPoint.x - contentRect.left) / contentRect.width, 0, 1),
    y: clamp((clientPoint.y - contentRect.top) / contentRect.height, 0, 1),
  };
}

/** Source mouseup threshold is strict > .02 on each axis. */
export function drawFocusRegion(startClient, endClient, contentRect) {
  const start = normalizeFocusPoint(startClient, contentRect);
  const end = normalizeFocusPoint(endClient, contentRect);
  if (!start || !end) return null;
  const region = {
    relX: Math.min(start.x, end.x),
    relY: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
  return region.width > 0.02 && region.height > 0.02 ? region : null;
}

export function moveFocusRegion(region, startClient, currentClient, contentRect) {
  if (
    !validRegion(region) ||
    !validPoint(startClient) ||
    !validPoint(currentClient) ||
    !validContentRect(contentRect)
  )
    return null;
  return {
    ...region,
    relX: clamp(
      region.relX + (currentClient.x - startClient.x) / contentRect.width,
      0,
      1 - region.width,
    ),
    relY: clamp(
      region.relY + (currentClient.y - startClient.y) / contentRect.height,
      0,
      1 - region.height,
    ),
  };
}

function cornerResize(region, handle, point, ratio) {
  const right = region.relX + region.width;
  const bottom = region.relY + region.height;
  const anchorX = handle === 'se' || handle === 'ne' ? region.relX : right;
  const anchorY = handle === 'se' || handle === 'sw' ? region.relY : bottom;
  let width = Math.max(
    0.02,
    handle === 'se' || handle === 'ne' ? point.x - anchorX : anchorX - point.x,
  );
  let height = Math.max(
    0.02,
    handle === 'se' || handle === 'sw' ? point.y - anchorY : anchorY - point.y,
  );
  if (width / height > ratio) width = height * ratio;
  else height = width / ratio;
  width = Math.max(0.02, width);
  height = Math.max(0.02, height);
  let x = handle === 'se' || handle === 'ne' ? region.relX : anchorX - width;
  let y = handle === 'se' || handle === 'sw' ? region.relY : anchorY - height;
  if (x < 0) {
    width += x;
    x = 0;
    height = width / ratio;
  }
  if (y < 0) {
    height += y;
    y = 0;
    width = height * ratio;
  }
  let maxWidth = 1 - x;
  let maxHeight = 1 - y;
  if (width > maxWidth) height = (width = maxWidth) / ratio;
  if (height > maxHeight) width = (height = maxHeight) * ratio;
  maxWidth = 1 - x;
  maxHeight = 1 - y;
  if (width > maxWidth) height = (width = maxWidth) / ratio;
  if (height > maxHeight) width = (height = maxHeight) * ratio;
  // Preserve the source's final minimum order; do not invent another ratio/clamp pass.
  return { relX: x, relY: y, width: Math.max(0.02, width), height: Math.max(0.02, height) };
}

export function resizeFocusRegion({
  region,
  handle,
  startClient,
  currentClient,
  contentRect,
  ratioLabel,
  containerAspectRatio = 1,
} = {}) {
  if (
    !validRegion(region) ||
    !HANDLES.has(handle) ||
    !validPoint(startClient) ||
    !validPoint(currentClient) ||
    !validContentRect(contentRect) ||
    !finite(containerAspectRatio) ||
    containerAspectRatio <= 0
  )
    return null;
  if (CORNERS.has(handle)) {
    const aspect = FOCUS_ASPECTS.find((entry) => entry.label === ratioLabel);
    if (ratioLabel && !aspect) return null;
    const ratio = aspect
      ? aspect.ratio / containerAspectRatio
      : region.height > 1e-9
        ? region.width / region.height
        : 1;
    return cornerResize(region, handle, normalizeFocusPoint(currentClient, contentRect), ratio);
  }
  const deltaX = (currentClient.x - startClient.x) / contentRect.width;
  const deltaY = (currentClient.y - startClient.y) / contentRect.height;
  let { relX, relY, width, height } = region;
  if (handle === 'n') {
    const top = clamp(region.relY + deltaY, 0, region.relY + region.height - 0.02);
    height = region.relY + region.height - top;
    relY = top;
  }
  if (handle === 's') height = Math.max(0.02, Math.min(1 - region.relY, region.height + deltaY));
  if (handle === 'w') {
    const left = clamp(region.relX + deltaX, 0, region.relX + region.width - 0.02);
    width = region.relX + region.width - left;
    relX = left;
  }
  if (handle === 'e') width = Math.max(0.02, Math.min(1 - region.relX, region.width + deltaX));
  return { relX, relY, width, height };
}

/** Source ratio buttons shrink from the top-left; they never enlarge or recenter. */
export function applyFocusAspect(region, label, containerAspectRatio) {
  const aspect = FOCUS_ASPECTS.find((entry) => entry.label === label);
  if (!validRegion(region) || !aspect || !finite(containerAspectRatio) || containerAspectRatio <= 0)
    return null;
  const ratio = aspect.ratio / containerAspectRatio;
  return region.width / region.height > ratio
    ? { relX: region.relX, relY: region.relY, width: region.height * ratio, height: region.height }
    : { relX: region.relX, relY: region.relY, width: region.width, height: region.width / ratio };
}

export function closestFocusAspect(region, containerAspectRatio) {
  if (!validRegion(region) || !finite(containerAspectRatio) || containerAspectRatio <= 0)
    return null;
  const ratio = (region.width / region.height) * containerAspectRatio;
  let best = FOCUS_ASPECTS[0];
  let distance = Math.abs(ratio - best.ratio);
  for (const entry of FOCUS_ASPECTS.slice(1)) {
    const nextDistance = Math.abs(ratio - entry.ratio);
    if (nextDistance < distance) {
      best = entry;
      distance = nextDistance;
    }
  }
  return best.label;
}

function validGraph(nodes, edges) {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return false;
  const ids = new Set();
  for (const item of [...nodes, ...edges]) {
    if (!record(item) || !validId(item.id) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return (
    nodes.every((node) => record(node.data)) &&
    edges.every((edge) => validId(edge.source) && validId(edge.target))
  );
}

/** Caller supplies a fresh owner/draft-projected graph; this plan does no history, save or I/O. */
export function planCanvasFocusRegion({
  nodes,
  edges,
  targetNodeId,
  sourceNodeId,
  region,
  ratioLabel,
  containerAspectRatio,
  makeEdgeId,
} = {}) {
  if (!validGraph(nodes, edges) || !validRegion(region) || targetNodeId === sourceNodeId)
    return null;
  const target = nodes.find((node) => node.id === targetNodeId);
  const source = nodes.find((node) => node.id === sourceNodeId);
  const url = source?.data?.url?.[0];
  if (
    !hasDefaultImageGenerator(target) ||
    source?.type !== 'image' ||
    !Array.isArray(source?.data?.url) ||
    typeof url !== 'string' ||
    !url ||
    (target.data.params !== undefined && !record(target.data.params))
  )
    return null;
  const label = ratioLabel
    ? FOCUS_ASPECTS.find((entry) => entry.label === ratioLabel)?.label
    : closestFocusAspect(region, containerAspectRatio);
  if (!label) return null;
  const params = target.data.params ?? {};
  if (params.settings !== undefined && !record(params.settings)) return null;
  const settings = params.settings ?? {};
  const ratioKey =
    Object.keys(settings).find((key) => key.toLowerCase().startsWith('ratio')) ?? 'ratio';
  let nextEdges = edges;
  if (!edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
    if (typeof makeEdgeId !== 'function') return null;
    const id = makeEdgeId();
    if (!validId(id) || [...nodes, ...edges].some((item) => item.id === id)) return null;
    nextEdges = [...edges, { id, source: sourceNodeId, target: targetNodeId }];
  }
  return {
    nodes: nodes.map((node) =>
      node.id === targetNodeId
        ? {
            ...node,
            data: {
              ...node.data,
              params: {
                ...params,
                focusRegion: {
                  nodeId: sourceNodeId,
                  relX: region.relX,
                  relY: region.relY,
                  width: region.width,
                  height: region.height,
                  imageUrl: url,
                },
                originImage: url,
                scene: 'camera_focus',
                settings: { ...settings, [ratioKey]: label },
              },
            },
          }
        : node,
    ),
    edges: nextEdges,
  };
}

/** Source clears three focus fields and only the first matching edge. */
export function deleteCanvasFocusRegion({ nodes, edges, targetNodeId } = {}) {
  if (!validGraph(nodes, edges)) return null;
  const target = nodes.find((node) => node.id === targetNodeId);
  if (target?.type !== 'image' || !record(target.data.params)) return null;
  const params = target.data.params;
  if (!params.focusRegion) return null;
  const sourceId = params.focusRegion?.nodeId;
  const index = sourceId
    ? edges.findIndex((edge) => edge.source === sourceId && edge.target === targetNodeId)
    : -1;
  return {
    nodes: nodes.map((node) =>
      node.id === targetNodeId
        ? {
            ...node,
            data: {
              ...node.data,
              params: {
                ...params,
                focusRegion: undefined,
                originImage: undefined,
                scene: undefined,
              },
            },
          }
        : node,
    ),
    edges: index < 0 ? edges : edges.filter((_edge, edgeIndex) => edgeIndex !== index),
  };
}
