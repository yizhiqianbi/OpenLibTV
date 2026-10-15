import { roleMediaReferenceMetadata } from './role-media-reference-model.js';
import {
  buildGeneratorMixedReferences,
  orderGeneratorMediaReferences,
} from './reference-reconciliation-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const type = (node) => node?.data?.type || node?.type;
const groups = new Set(['group', 'video_group', 'video-story', 'video_story']);
const content = (value) =>
  typeof value === 'string'
    ? value
      ? [value]
      : []
    : array(value).filter((item) => typeof item === 'string');
const isGroup = (node) => groups.has(type(node)) && !node.data?.characterAsset;

/** Source 417754: all leaves count, even ignored resources or nodes with an empty URL. */
export function expandGeneratorReferenceSources(sources, nodes, excluded) {
  if (!sources.some(isGroup)) return sources;
  const children = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  const seen = new Set();
  const result = [];
  const visit = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    if (depth > 0 && excluded?.has(node.id)) return;
    if (isGroup(node)) {
      if (depth >= 8) return;
      for (const child of children.get(node.id) || []) visit(child, depth + 1);
    } else result.push(node);
  };
  for (const source of sources) visit(source, 0);
  return result;
}

export function generatorExcludedReferences(data) {
  const ids = array(data?.groupRefExcludedNodeIds).filter((item) => typeof item === 'string');
  return ids.length ? new Set(ids) : undefined;
}

/** Source 799545 normalizes persisted assets, without treating URL-only records as graph nodes. */
export function normalizeStoredGeneratorMedia(items) {
  return array(items).flatMap((item, index) => {
    if (typeof item === 'string') return item ? [{ url: item, nodeId: `legacy-${index}` }] : [];
    if (!item || typeof item !== 'object') return [];
    if (Array.isArray(item.url)) {
      const url = item.url[0] ?? '';
      return url ? [{ ...item, url, nodeId: item.nodeId ?? `legacy-${index}` }] : [];
    }
    return typeof item.url === 'string' && item.url !== '' ? [item] : [];
  });
}

const assetReference = (item) =>
  typeof item.nodeId === 'string' && item.nodeId.startsWith('asset://');

function mediaReference(node, kind) {
  const data = node.data || {};
  const urls =
    kind === 'image' &&
    !['hidden', 'watermark'].includes(data.protectionType) &&
    array(data.originalUrl).length
      ? data.originalUrl
      : data.url;
  // String URLs are accepted only for existing local documents; source stores URL arrays.
  const url = Array.isArray(urls) ? (urls[0] ?? '') : typeof urls === 'string' ? urls : '';
  const result = {
    nodeId: node.id,
    url,
    label: data.name || data.label || undefined,
    ...roleMediaReferenceMetadata(node, kind),
  };
  const metadata = node.resourceMeta?.items?.[0];
  const metadataKeys =
    kind === 'audio'
      ? ['durationSec']
      : kind === 'video'
        ? ['durationSec', 'width', 'height']
        : ['width', 'height'];
  if (metadata?.kind === kind)
    for (const key of metadataKeys) if (metadata[key] != null) result[key] = metadata[key];
  if (kind === 'video') {
    for (const key of ['subtitleUrl', 'subtitleHtmlUrl'])
      if (typeof data[key] === 'string' && data[key].trim()) result[key] = data[key].trim();
    const transitions = data.transition ?? data.transitions;
    for (const transition of Array.isArray(transitions) ? transitions : [transitions]) {
      if (
        typeof transition?.type === 'string' &&
        transition.type.trim() &&
        Number.isFinite(transition.duration) &&
        transition.duration > 0
      ) {
        result.transition = { type: transition.type.trim(), duration: transition.duration };
        break;
      }
    }
  }
  return result;
}

/** Store ig input differs from renderer input: no refImages/focus filter or arbitrary stored refs. */
export function collectReconciledGeneratorInputs({ nodes, edges, target }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = edges.filter(
    (edge) =>
      edge.target === target.id &&
      !edge.data?.portraitVirtual &&
      !edge.data?.assetVirtual &&
      type(byId.get(edge.source)) !== 'reference',
  );
  const sources = incoming.map((edge) => byId.get(edge.source)).filter(Boolean);
  const expanded = expandGeneratorReferenceSources(
    sources,
    nodes,
    generatorExcludedReferences(target.data),
  );
  const lists = { textList: [], imageList: [], videoList: [], audioList: [] };
  for (const node of expanded) {
    const kind = type(node);
    if (kind === 'text')
      lists.textList.push({ nodeId: node.id, content: content(node.data?.content) });
    else if (['image', 'video', 'audio'].includes(kind))
      lists[kind + 'List'].push(mediaReference(node, kind));
  }
  for (const edge of incoming) {
    const reference = edge.data?.characterRef;
    if (reference?.mainReferenceImageUrl)
      lists.imageList.push({
        nodeId: edge.source,
        url: reference.mainReferenceImageUrl,
        label: reference.roleName,
        characterRef: reference,
      });
  }
  const params = target.data?.params || {};
  for (const kind of ['image', 'video', 'audio']) {
    const key = kind + 'List';
    lists[key] = orderGeneratorMediaReferences(
      [...lists[key], ...normalizeStoredGeneratorMedia(params[key]).filter(assetReference)],
      params[key + 'Order'],
    );
  }
  lists.mixedList = buildGeneratorMixedReferences(lists, params.mixedListOrder);
  return lists;
}

/** deleteEdges ih removes the detached group's leaf exclusions, keeping unrelated exclusions. */
export function clearDetachedGeneratorGroupExclusions(target, source, nodes) {
  if (!groups.has(type(source))) return target;
  const excluded = generatorExcludedReferences(target.data);
  if (!excluded) return target;
  const detachedIds = new Set(
    expandGeneratorReferenceSources([source], nodes).map((node) => node.id),
  );
  const remaining = [...excluded].filter((nodeId) => !detachedIds.has(nodeId));
  if (remaining.length === excluded.size) return target;
  const { groupRefExcludedNodeIds: _removed, ...data } = target.data;
  return {
    ...target,
    data: remaining.length ? { ...data, groupRefExcludedNodeIds: remaining } : data,
  };
}
