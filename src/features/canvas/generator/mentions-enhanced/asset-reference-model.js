import { canvasWorldPosition } from '../../domain/groups.js';
import { evaluateReferenceCandidate, getReferenceNodeKind } from './candidate-model.js';
import {
  getCanvasReferenceCapacity,
  validateCanvasMentionConnection,
} from './connection-validator.js';

const mediaKinds = ['image', 'video', 'audio'];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const usable = (value) => typeof value === 'string' && value.trim();
const kindOf = (type) =>
  type === 'video-clip'
    ? 'video'
    : ['text', 'script', 'script-v2'].includes(type)
      ? 'text'
      : mediaKinds.includes(type)
        ? type
        : 'unknown';

function firstUrl(data) {
  const url = Array.isArray(data?.url) ? data.url.find(usable) : data?.url;
  return usable(url) ? url.trim() : undefined;
}

function firstAssetItem(json) {
  try {
    const value = JSON.parse(json);
    const item = Array.isArray(value?.items) ? value.items[0] : undefined;
    return record(item) && record(item.data) ? item : undefined;
  } catch {
    return undefined;
  }
}

/** Original 482487 uses only items[0]. Legacy local URL records have an explicit adapter. */
export function resolvePromptAssetCandidate(row) {
  if (!record(row) || row.isFolder || row.kind === 'folder') return null;
  const localRow = typeof row.mediaType === 'string';
  const uuid =
    (usable(row.uuid) && row.uuid.trim()) ||
    (row.id != null && (localRow || !/^\d+$/.test(String(row.id))) ? String(row.id) : '');
  if (!uuid) return null;
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const hasAssetData = typeof row.assetData === 'string' || typeof row.data === 'string';
  let item = hasAssetData
    ? firstAssetItem(typeof row.assetData === 'string' ? row.assetData : row.data)
    : record(row.item) && record(row.item.data)
      ? row.item
      : undefined;
  if (!hasAssetData && !item && localRow && mediaKinds.includes(row.mediaType) && usable(row.url))
    item = {
      data: { type: row.mediaType, url: [row.url.trim()], name, localMediaReady: true },
    };
  const kind = kindOf(item?.data?.type);
  const url = firstUrl(item?.data);
  const poster = item?.data?.poster;
  return {
    uuid,
    name,
    kind,
    ...(item ? { item } : {}),
    ...(url ? { url } : {}),
    ...(typeof poster === 'string' && poster ? { poster } : {}),
  };
}

function selectedCounts(selected = []) {
  const counts = { image: 0, video: 0, audio: 0 };
  const items = selected instanceof Map ? selected.values() : selected;
  for (const item of items) {
    const candidate = resolvePromptAssetCandidate(item);
    if (mediaKinds.includes(candidate?.kind)) counts[candidate.kind] += 1;
  }
  return counts;
}

function syntheticId(nodes, prefix) {
  const ids = new Set(nodes.map((node) => node.id));
  let id = prefix;
  for (let index = 1; ids.has(id); index += 1) id = `${prefix}-${index}`;
  return id;
}

/** Picker qualification counts every selected asset, even when its URL is already connected. */
export function evaluatePromptAssetSelection({
  nodes = [],
  edges = [],
  models,
  targetId,
  item,
  selected = [],
  localResourceActions = true,
}) {
  const candidate = resolvePromptAssetCandidate(item);
  const target = nodes.find((node) => node.id === targetId);
  const reject = (reason) => ({ ok: false, allowed: false, reason });
  if (!target || !candidate?.item || !mediaKinds.includes(candidate.kind) || !candidate.url)
    return reject('unsupported');
  const type = candidate.item.data.type;
  const source = {
    id: syntheticId(nodes, '__prompt_asset_candidate__'),
    type,
    position: { x: 0, y: 0 },
    data: { ...candidate.item.data, type },
  };
  if (!getReferenceNodeKind(source)) return reject('unsupported');
  const pendingCounts = selectedCounts(selected);
  const result = evaluateReferenceCandidate(source, target, {
    canAcceptMore: (_target, kind) =>
      getCanvasReferenceCapacity({ nodes, edges, models, targetId, kind, pendingCounts }).allowed,
    // Original 482487 passes selected counts only to canAcceptMore, not validate.
    validate: () =>
      validateCanvasMentionConnection({
        nodes: [...nodes, source],
        edges,
        models,
        sourceId: source.id,
        targetId,
        localResourceActions,
      }),
  });
  return result.available
    ? { ok: true, allowed: true, reason: null }
    : reject(
        result.reason === 'limit' ? 'limit' : candidate.kind === 'video' ? 'video' : 'unsupported',
      );
}

/** Source 482487: omit zero capacity and limits that still accept 30 additional items. */
export function promptAssetPickerCapacity({
  nodes = [],
  edges = [],
  models,
  targetId,
  selected = [],
}) {
  if (!nodes.some((node) => node.id === targetId)) return [];
  const counts = selectedCounts(selected);
  const segments = [];
  for (const kind of mediaKinds) {
    let extra = 0;
    while (extra < 30) {
      const pendingCounts = { ...counts, [kind]: counts[kind] + extra };
      if (
        !getCanvasReferenceCapacity({ nodes, edges, models, targetId, kind, pendingCounts }).allowed
      )
        break;
      extra += 1;
    }
    const max = counts[kind] + extra;
    if (extra < 30 && max !== 0) segments.push({ kind, selected: counts[kind], max });
  }
  return segments;
}

function assetNodeSize(data) {
  const content =
    positive(data.contentWidth) && positive(data.contentHeight)
      ? { width: data.contentWidth, height: data.contentHeight }
      : null;
  if (data._explicitContentDims === true && content) return content;
  const url = Array.isArray(data.url) ? data.url[0] : undefined;
  const display = data.mediaDisplaySize;
  if (url && display?.sourceUrl === url && positive(display.width) && positive(display.height))
    return { width: display.width, height: display.height };
  if (content) return content;
  const params = record(data.params) ? data.params : {};
  const settings = record(params.settings) ? params.settings : {};
  const ratioValue = (value) => usable(value) && value.trim() !== 'auto';
  const ratio = ratioValue(settings.ratio)
    ? settings.ratio
    : Object.keys(settings)
        .filter((key) => key !== 'ratio' && key.startsWith('ratio'))
        .map((key) => settings[key])
        .find(ratioValue) ||
      (ratioValue(settings.aspectRatio) ? settings.aspectRatio : undefined) ||
      (ratioValue(params.aspectRatio) ? params.aspectRatio : undefined);
  if (ratio) {
    const parts = ratio.split(':');
    const a = Number.parseInt(parts[0], 10);
    const b = Number.parseInt(parts[1], 10);
    if (parts.length === 2 && positive(a) && positive(b))
      return a <= b
        ? { width: 350, height: Math.min(Math.round((b / a) * 350), 1050) }
        : { width: Math.min(Math.round((a / b) * 350), 1050), height: 350 };
  }
  return { width: 350, height: 350 };
}

function resolveReferenceTarget(nodes, edges, candidate, targetId) {
  const matches = nodes.filter(
    (node) =>
      node.id !== targetId &&
      mediaKinds.includes(kindOf(node.data?.type ?? node.type)) &&
      firstUrl(node.data) === candidate.url,
  );
  const connected = matches.find((node) =>
    edges.some((edge) => edge.source === node.id && edge.target === targetId),
  );
  return connected ? { node: connected, connected: true } : { node: matches[0], connected: false };
}

/** One pure batch; callers commit this graph once, then resolve tokens from the committed graph. */
export function planPromptAssetReferences({
  nodes = [],
  edges = [],
  models,
  targetId,
  items = [],
  makeNodeId,
  makeEdgeId,
  localResourceActions = true,
}) {
  let nextNodes = nodes;
  let nextEdges = edges;
  const nodeIds = [];
  const results = [];
  const target = nodes.find((node) => node.id === targetId);
  for (const row of items) {
    const candidate = resolvePromptAssetCandidate(row);
    if (!target || !candidate?.item || !mediaKinds.includes(candidate.kind) || !candidate.url) {
      results.push({ allowed: false, reason: target ? 'unsupported' : 'missingTarget' });
      continue;
    }
    const resolved = resolveReferenceTarget(nextNodes, nextEdges, candidate, targetId);
    if (resolved.connected) {
      nodeIds.push(resolved.node.id);
      results.push({ allowed: true, nodeId: resolved.node.id, reason: null });
      continue;
    }
    try {
      let source = resolved.node;
      if (!source) {
        const type = candidate.item.data.type;
        const id = makeNodeId?.(type);
        if (!usable(id) || nextNodes.some((node) => node.id === id)) {
          results.push({ allowed: false, reason: 'invalidNodeId' });
          continue;
        }
        const data = {
          ...candidate.item.data,
          type,
          ...(candidate.name ? { name: candidate.name } : {}),
        };
        const size = assetNodeSize(data);
        const position = canvasWorldPosition(target, nextNodes);
        const targetWidth = target.measured?.width ?? target.width ?? 350;
        // Source creates a root node. Resolve a grouped target to world coordinates for local documents.
        source = {
          id,
          type,
          data,
          position: { x: position.x - targetWidth - 100, y: position.y },
          ...size,
          measured: { ...size },
        };
      }
      const candidateNodes = resolved.node ? nextNodes : [...nextNodes, source];
      const validation = validateCanvasMentionConnection({
        nodes: candidateNodes,
        edges: nextEdges,
        models,
        sourceId: source.id,
        targetId,
        localResourceActions,
      });
      if (!validation.allowed) {
        results.push({ allowed: false, reason: validation.reason });
        continue;
      }
      const id = makeEdgeId?.('edge');
      if (!usable(id) || nextEdges.some((edge) => edge.id === id)) {
        results.push({ allowed: false, reason: 'invalidEdgeId' });
        continue;
      }
      nextNodes = candidateNodes;
      nextEdges = [
        ...nextEdges,
        { id, source: source.id, target: targetId, sourceHandle: 'source', targetHandle: 'target' },
      ];
      nodeIds.push(source.id);
      results.push({ allowed: true, nodeId: source.id, reason: null });
    } catch {
      results.push({ allowed: false, reason: 'invalidAsset' });
    }
  }
  return {
    nodes: nextNodes,
    edges: nextEdges,
    nodeIds,
    results,
    success: nodeIds.length,
    failed: items.length - nodeIds.length,
    changed: nextNodes !== nodes || nextEdges !== edges,
  };
}
