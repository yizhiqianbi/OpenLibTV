import { canvasWorldPosition } from '../../domain/groups.js';
import { collectCanvasConnectionInputs } from '../mentions-enhanced/connection-inputs.js';
import { generatorMediaModes, inferGeneratorMediaMode } from '../media-input-model.js';
import { usesMixedGeneratorReferences } from '../reference-actions-model.js';
import { roleMediaReferenceMetadata } from '../role-media-reference-model.js';
import { roleAssetId } from './role-library-model.js';
import { reconcileGeneratorIncomingPrompt } from '../reference-reconciliation-model.js';
import { collectReconciledGeneratorInputs } from '../reference-incoming-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const usable = (value) => typeof value === 'string' && value.trim().length > 0;
const kinds = ['image', 'video', 'audio'];
const width = (node) =>
  positive(node.measured?.width) ? node.measured.width : positive(node.width) ? node.width : 350;
const height = (node) =>
  positive(node.measured?.height)
    ? node.measured.height
    : positive(node.height)
      ? node.height
      : 350;
const firstUrl = (value) =>
  Array.isArray(value) ? (value[0] ?? '') : typeof value === 'string' ? value : '';
const keyed = (entries, key) => (entries instanceof Map ? entries.get(key) : entries?.[key]);
const ordered = (items, order) => {
  if (!Array.isArray(order) || order.length === 0 || items.length <= 1) return items;
  const remaining = new Map(items.map((item) => [item.nodeId, item])),
    result = [];
  for (const id of order)
    if (remaining.has(id)) {
      result.push(remaining.get(id));
      remaining.delete(id);
    }
  return [...result, ...remaining.values()];
};
const mixedList = (lists, order) =>
  ordered(
    kinds.flatMap((kind) => lists[kind + 'List'].map((item) => ({ ...item, mediaType: kind }))),
    order,
  );

/** Match source natural-image sizing; display dimensions are read results, never guessed metadata. */
export function roleImageNodeDimensions(dimensions) {
  if (!positive(dimensions?.width) || !positive(dimensions?.height))
    return { width: 350, height: 350 };
  return dimensions.width >= dimensions.height
    ? {
        width: Math.min(Math.round((dimensions.width / dimensions.height) * 350), 5600),
        height: 350,
      }
    : {
        width: 350,
        height: Math.min(Math.round((dimensions.height / dimensions.width) * 350), 5600),
      };
}

/** Source 417754 flags; graph collection owns counts, these are resource attributes, not box sizes. */
function incoming(nodes, edges, target) {
  const filtered = edges.filter((edge) => !edge.data?.portraitVirtual && !edge.data?.assetVirtual);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const sources = new Set(
    filtered.filter((edge) => edge.target === target.id).map((edge) => edge.source),
  );
  const sourceNodes = [...sources].map((id) => byId.get(id)).filter(Boolean);
  // 417754 gathers direct sources in edge order; root nodes are stored in reverse create order.
  const inputs = collectCanvasConnectionInputs({
    nodes: [...sourceNodes, ...nodes.filter((node) => !sources.has(node.id))],
    edges: filtered,
    targetId: target.id,
  });
  inputs.imageList = inputs.imageList.filter(
    (item) => !byId.get(item.nodeId)?.data?.characterAsset,
  );
  for (const edge of filtered) {
    const ref = edge.data?.characterRef;
    if (edge.target === target.id && ref?.mainReferenceImageUrl)
      inputs.imageList.push({
        nodeId: edge.source,
        url: ref.mainReferenceImageUrl,
        label: ref.roleName,
        characterRef: ref,
      });
  }
  inputs.textList = inputs.textList.map((item) => {
    const content = byId.get(item.nodeId)?.data?.content;
    return {
      ...item,
      content:
        typeof content === 'string'
          ? content.length
            ? [content]
            : []
          : array(content).filter((value) => typeof value === 'string'),
    };
  });
  for (const kind of kinds) {
    const key = kind + 'List';
    const refs = array(inputs[key]).map((item) => {
      const node = byId.get(item.nodeId),
        data = node?.data;
      if (!data) return item;
      return {
        ...item,
        ...(usable(data.name || data.label) ? { label: data.name || data.label } : {}),
        ...roleMediaReferenceMetadata(node, kind),
      };
    });
    // Legacy persisted asset:// nodeIds are independent of ordinary graph edges.
    refs.push(...array(target.data?.params?.[key]).filter((item) => roleAssetId(item?.nodeId)));
    inputs[key] = ordered(refs, target.data?.params?.[key + 'Order']);
  }
  inputs.mixedList = mixedList(inputs, target.data?.params?.mixedListOrder);
  return inputs;
}

export { reconcileGeneratorIncomingPrompt as remapRoleLibraryPrompt } from '../reference-reconciliation-model.js';

function closestLeft(target, nodes, size) {
  const origin = canvasWorldPosition(target, nodes),
    baseX = origin.x - 100 - size.width,
    margin = 50;
  const obstacles = nodes.map((node) => ({
    ...canvasWorldPosition(node, nodes),
    width: positive(node.data?.contentWidth) ? node.data.contentWidth : width(node),
    height: height(node),
  }));
  const columns = new Set([baseX]);
  for (const item of obstacles) {
    const right = item.x + item.width + margin,
      left = item.x - size.width - margin;
    if (right <= baseX) columns.add(right);
    if (left <= baseX) columns.add(left);
  }
  let best = { x: baseX, y: origin.y },
    distance = Infinity;
  for (const x of columns) {
    const bands = obstacles
      .filter((item) => x < item.x + item.width + margin && x + size.width + margin > item.x)
      .map((item) => ({
        top: item.y - size.height - margin,
        bottom: item.y + item.height + margin,
      }))
      .sort((a, b) => a.top - b.top);
    const merged = [];
    for (const band of bands) {
      const last = merged.at(-1);
      if (last && band.top <= last.bottom) last.bottom = Math.max(last.bottom, band.bottom);
      else merged.push({ ...band });
    }
    let y = origin.y,
      offset = Infinity;
    const consider = (candidate) => {
      const delta = Math.abs(candidate - origin.y);
      if (delta < offset) {
        offset = delta;
        y = candidate;
      }
    };
    if (merged.length) {
      consider(Math.min(origin.y, merged[0].top));
      for (let index = 0; index < merged.length - 1; index++)
        if (merged[index + 1].top - merged[index].bottom >= 1)
          consider(Math.max(merged[index].bottom, Math.min(origin.y, merged[index + 1].top)));
      consider(Math.max(origin.y, merged.at(-1).bottom));
    }
    const score = (x - baseX) ** 2 + (y - origin.y) ** 2;
    if (score < distance) {
      distance = score;
      best = { x, y };
    }
  }
  return best;
}

// addNode has ordinary overlap resolution for VIDEO/AUDIO; IMAGE rV opts out after closestLeft.
function ordinaryPlacement(position, nodes) {
  let y = position.y;
  const margin = 50;
  for (let attempt = 0; attempt < 30; attempt++) {
    let shift = 0;
    for (const node of nodes) {
      const p = node.position;
      if (
        position.x < p.x + width(node) + margin &&
        position.x + 350 + margin > p.x &&
        y < p.y + height(node) + margin &&
        y + 350 + margin > p.y
      )
        shift = Math.max(
          shift,
          Math.min(Math.abs(p.y + height(node) + margin - y), Math.abs(y + 350 + margin - p.y)),
        );
    }
    if (shift === 0) break;
    y += shift;
  }
  return { x: position.x, y };
}

/**
 * VIDEO ag: source diff semantics with a single local graph plan. Caller projects the
 * latest draft first, injects readonly measurements/resolution, then owns CAS/history/save.
 * No service call, prompt insertion, virtual node, certificate or generated result is made.
 */
export function planCanvasRoleLibrarySelection({
  nodes,
  edges,
  targetNodeId,
  selection,
  schema,
  resolveAssetUri,
  makeNodeId,
  makeEdgeId,
  imageDimensionsByUri,
  labels = {},
  createdAtMs,
} = {}) {
  if (
    !Array.isArray(nodes) ||
    !Array.isArray(edges) ||
    !record(selection) ||
    !record(schema) ||
    !kinds.every((kind) => Array.isArray(selection[kind + 's']))
  )
    return null;
  const used = new Set();
  for (const item of [...nodes, ...edges]) {
    if (!record(item) || !usable(item.id) || used.has(item.id)) return null;
    used.add(item.id);
  }
  const target = nodes.find((node) => node.id === targetNodeId);
  if (
    !target ||
    (target.data?.type ?? target.type) !== 'video' ||
    !record(target.data) ||
    !finite(target.position?.x) ||
    !finite(target.position?.y)
  )
    return null;
  if (
    nodes.some((node) => !finite(node.position?.x) || !finite(node.position?.y)) ||
    edges.some((edge) => !usable(edge.source) || !usable(edge.target))
  )
    return null;
  if (kinds.some((kind) => selection[kind + 's'].some((value) => !usable(value)))) return null;
  const chosen = {
    image: new Set(selection.images.filter((value) => roleAssetId(value)).map(roleAssetId)),
    video: new Set(selection.videos.map(roleAssetId).filter(Boolean)),
    audio: new Set(selection.audios.map(roleAssetId).filter(Boolean)),
  };
  const rawImages = new Set(selection.images.filter((value) => !value.startsWith('asset://')));
  const connected = new Set(
    edges.filter((edge) => edge.target === targetNodeId).map((edge) => edge.source),
  );
  const managed = (kind) =>
    nodes.filter((node) => {
      const data = node.data || {};
      return (
        connected.has(node.id) &&
        (data.type ?? node.type) === kind &&
        (kind === 'image'
          ? !!data.portraitAssetId || (!!data.portraitCompliantExempt && !!firstUrl(data.url))
          : kind === 'video'
            ? !!data.assetVideoAssetId && !data.assetVideoCertifiedInPlace
            : !!data.assetAudioAssetId)
      );
    });
  const field = {
    image: 'portraitAssetId',
    video: 'assetVideoAssetId',
    audio: 'assetAudioAssetId',
  };
  let nextNodes = nodes,
    nextEdges = edges;
  const initial = incoming(nodes, edges, target);
  const existing = Object.fromEntries(kinds.map((kind) => [kind, managed(kind)]));
  for (const kind of kinds)
    for (const node of existing[kind]) {
      const id = node.data[field[kind]],
        kept = id ? chosen[kind].has(id) : rawImages.has(firstUrl(node.data.url));
      if (!kept) {
        const first = nextEdges.find(
          (edge) => edge.source === node.id && edge.target === targetNodeId,
        );
        if (first) nextEdges = nextEdges.filter((edge) => edge !== first);
      }
    }
  const nextId = (factory, kind) => {
    if (typeof factory !== 'function') return null;
    const value = factory(kind);
    if (!usable(value) || used.has(value)) return null;
    used.add(value);
    return value;
  };
  const resolvedAssets = new Map();
  const asset = (id) => {
    if (resolvedAssets.has(id)) return resolvedAssets.get(id);
    const result = typeof resolveAssetUri === 'function' ? resolveAssetUri(`asset://${id}`) : null;
    const resolved =
      record(result) &&
      usable(result.url) &&
      !result.url.startsWith('asset://') &&
      (!result.assetId || result.assetId === id)
        ? result
        : null;
    resolvedAssets.set(id, resolved);
    return resolved;
  };
  const add = (kind, url, id, resolved) => {
    const nodeId = nextId(makeNodeId, kind),
      edgeId = nextId(makeEdgeId, kind);
    if (!nodeId || !edgeId) return false;
    const checkedAt = resolved?.complianceCheckedAtMs ?? resolved?.createdAtMs;
    const name = labels[kind] ?? { image: '素材图片', video: '素材视频', audio: '素材音频' }[kind];
    const suffix = id
      ? resolved?.status === 0
        ? (labels.reviewingSuffix ?? '')
        : resolved?.status === 2
          ? (labels.rejectedSuffix ?? '')
          : ''
      : '';
    const data = {
      type: kind,
      name: name + suffix,
      url: [url],
      action: kind + '_resource',
      ...(id ? { [field[kind]]: id } : { portraitCompliantExempt: true }),
      ...(checkedAt && kind !== 'audio'
        ? {
            [kind === 'image'
              ? 'portraitComplianceCheckedAtMs'
              : 'assetVideoComplianceCheckedAtMs']: checkedAt,
          }
        : {}),
    };
    let node;
    if (kind === 'image') {
      const dimensions = roleImageNodeDimensions(
        keyed(imageDimensionsByUri, id ? `asset://${id}` : url),
      );
      Object.assign(data, { contentWidth: dimensions.width, contentHeight: dimensions.height });
      node = {
        id: nodeId,
        type: kind,
        data,
        position: closestLeft(target, nextNodes, dimensions),
        ...dimensions,
        measured: { ...dimensions },
      };
    } else
      node = {
        id: nodeId,
        type: kind,
        data,
        position: ordinaryPlacement(
          {
            x: target.position.x - width(target) - 100,
            y: target.position.y + (kind === 'video' ? 200 : 400),
          },
          nextNodes,
        ),
      };
    if (finite(createdAtMs)) node.createdAtMs = createdAtMs;
    nextNodes = [node, ...nextNodes];
    nextEdges = [
      ...nextEdges,
      {
        id: edgeId,
        source: nodeId,
        target: targetNodeId,
        sourceHandle: 'source',
        targetHandle: 'target',
      },
    ];
    return true;
  };
  for (const kind of kinds) {
    const ids = new Set(existing[kind].map((node) => node.data[field[kind]]).filter(Boolean));
    for (const id of chosen[kind]) {
      if (ids.has(id)) continue;
      const resolved = asset(id);
      if (resolved && !add(kind, resolved.url, id, resolved)) return null;
    }
    if (kind === 'image') {
      const urls = new Set(
        existing.image
          .filter((node) => !node.data.portraitAssetId)
          .map((node) => firstUrl(node.data.url)),
      );
      for (const url of rawImages)
        if (
          !urls.has(url) &&
          !add(
            'image',
            url,
            undefined,
            array(selection.assets).find((item) => item.assetUrl === url || item.url === url),
          )
        )
          return null;
    }
  }
  const params = target.data.params ?? {};
  const after = collectReconciledGeneratorInputs({
    nodes: nextNodes,
    edges: nextEdges,
    target,
  });
  const simulated = {
    ...params,
    imageList: [
      ...initial.imageList.filter((item) => !item.assetId && !item.compliantExempt),
      ...[...chosen.image].map((id) => ({
        nodeId: `simulated-asset-${id}`,
        url: asset(id)?.url ?? '',
        assetId: id,
      })),
      ...[...rawImages].map((url) => ({
        nodeId: `simulated-exempt-${url}`,
        url,
        compliantExempt: true,
      })),
    ],
    videoList: [
      ...initial.videoList.filter((item) => !item.assetId),
      ...[...chosen.video].map((id) => ({
        nodeId: `simulated-asset-${id}`,
        url: asset(id)?.url ?? '',
        assetId: id,
      })),
    ],
    audioList: [
      ...initial.audioList.filter((item) => !item.assetId),
      ...[...chosen.audio].map((id) => ({
        nodeId: `simulated-asset-${id}`,
        url: asset(id)?.url ?? '',
        assetId: id,
      })),
    ],
  };
  const current = params.modeType;
  const modeType = generatorMediaModes(schema, simulated).visible.some(
    (mode) => mode.key === current && mode.enabled,
  )
    ? current
    : inferGeneratorMediaMode(schema, simulated, { currentModeType: current });
  const before = Object.fromEntries(
    kinds.map((kind) => [
      kind + 'List',
      Array.isArray(params[kind + 'List']) ? params[kind + 'List'] : initial[kind + 'List'],
    ]),
  );
  before.mixedList = mixedList(before, params.mixedListOrder);
  const nextParams = {
    ...params,
    prompt: reconcileGeneratorIncomingPrompt(
      params.prompt ?? target.data.text ?? '',
      before,
      after,
      usesMixedGeneratorReferences(params.modeType, params.model),
    ),
    modeType,
    imageList: after.imageList,
    videoList: after.videoList,
    audioList: after.audioList,
  };
  if (Array.isArray(after.textList)) nextParams.textList = after.textList;
  if (
    nextNodes === nodes &&
    nextEdges === edges &&
    JSON.stringify(nextParams) === JSON.stringify(params)
  )
    return { nodes, edges, unchanged: true };
  return {
    nodes: nextNodes.map((node) =>
      node.id === targetNodeId ? { ...node, data: { ...node.data, params: nextParams } } : node,
    ),
    edges: nextEdges,
  };
}
