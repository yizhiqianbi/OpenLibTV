const mediaKinds = ['image', 'video', 'audio'];
const groupKinds = new Set(['group', 'video_group', 'video-story']);
export const connectionNodeType = (node) => node?.data?.type ?? node?.type;
const array = (value) => (Array.isArray(value) ? value : []);

/** Source 417754/516779 count graph references even when their current URL is empty. */
export function collectCanvasConnectionInputs({ nodes = [], edges = [], targetId, pendingCounts }) {
  const target = nodes.find((node) => node.id === targetId);
  const incomingIds = new Set(
    edges.filter((edge) => edge.target === targetId).map((edge) => edge.source),
  );
  const excluded = new Set(array(target?.data?.groupRefExcludedNodeIds));
  const children = new Map();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId).push(node);
  }
  const expanded = [];
  const visited = new Set();
  const expand = (node, depth = 0) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (depth > 0 && excluded.has(node.id)) return;
    if (groupKinds.has(connectionNodeType(node)) && !node.data?.characterAsset) {
      if (depth >= 8) return;
      for (const child of children.get(node.id) || []) expand(child, depth + 1);
    } else expanded.push(node);
  };
  for (const node of nodes) if (incomingIds.has(node.id)) expand(node);
  const inputs = { textList: [], imageList: [], videoList: [], audioList: [] };
  for (const node of expanded) {
    const data = node.data || {};
    const kind = connectionNodeType(node);
    if (kind === 'text') inputs.textList.push({ nodeId: node.id });
    else if (mediaKinds.includes(kind)) {
      const raw =
        kind === 'image' &&
        !['hidden', 'watermark'].includes(data.protectionType) &&
        array(data.originalUrl).length
          ? data.originalUrl
          : data.url;
      inputs[kind + 'List'].push({
        nodeId: node.id,
        url: Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''),
        ...roleMediaReferenceMetadata(node, kind),
      });
    } else if (kind === 'group' && data.characterAsset) {
      const character = data.characterAsset;
      const states = array(character.states);
      const state = states.find((item) => item.id === character.defaultStateId) ?? states[0];
      if (state) inputs.imageList.push({ nodeId: node.id, url: state.mainReferenceImageUrl });
    }
  }
  for (const kind of mediaKinds) {
    const pending = pendingCounts?.[kind];
    if (Number.isInteger(pending) && pending > 0)
      for (let index = 0; index < pending; index += 1)
        inputs[kind + 'List'].push({ nodeId: `${targetId}:pending-${kind}-${index}`, url: '' });
  }
  array(target?.data?.refImages).forEach((url, index) => {
    inputs.imageList.push({ nodeId: `${targetId}:ref-${index}`, url });
  });
  return { ...target?.data?.params, ...inputs };
}

export function simulateCanvasConnectionSource(inputs, kind) {
  const key = mediaKinds.includes(kind) ? kind + 'List' : null;
  return key
    ? { ...inputs, [key]: [...inputs[key], { nodeId: '__simulated__', url: '' }] }
    : inputs;
}

/** Explicit local adapter; original remote nodes must keep their declared action. */
export function canvasConnectionAction(node, { localResourceActions = false } = {}) {
  const data = node?.data || {};
  const type = connectionNodeType(node);
  if (typeof data.action === 'string' && data.action) return data.action;
  if (type === 'text') return 'text_generate';
  if (type === 'image' && data.scriptRowHiddenUuid) return 'image_generate';
  if (
    localResourceActions &&
    mediaKinds.includes(type) &&
    data.localMediaReady === true &&
    data.pending !== true &&
    data.uploading !== true &&
    !['pending', 'uploading', 'error', 'failed'].includes(data.status)
  ) {
    const urls = Array.isArray(data.url) ? data.url : [data.url];
    if (urls.some((url) => typeof url === 'string' && url.trim() && !url.startsWith('blob:')))
      return type + '_resource';
  }
  // This fallback is present in original 516779, independent of the local adapter.
  if (type === 'video') return array(data.url).length ? 'video_resource' : 'video_generate';
  return null;
}

/** Ordinary-source subset of original action matrix 591290; absent actions stay unverified. */
export function canvasConnectionActionsCompatible(sourceAction, targetAction) {
  const families = {
    text_generate: [
      'text_generate',
      'image_generate',
      'video_generate',
      'video_edit',
      'audio_generate',
    ],
    text_resource: [
      'text_generate',
      'image_generate',
      'video_generate',
      'video_edit',
      'audio_generate',
    ],
    image_generate: [
      'text_generate',
      'image_generate',
      'image_edit',
      'video_generate',
      'video_edit',
      'audio_generate',
    ],
    image_edit: [
      'text_generate',
      'image_generate',
      'image_edit',
      'video_generate',
      'video_edit',
      'audio_generate',
    ],
    image_resource: [
      'text_generate',
      'image_generate',
      'image_edit',
      'video_generate',
      'video_edit',
      'audio_generate',
    ],
    video_generate: ['text_generate', 'video_generate', 'video_edit'],
    video_edit: ['text_generate', 'video_generate', 'video_edit'],
    video_resource: ['text_generate', 'video_generate', 'video_edit'],
    audio_generate: ['video_generate', 'video_edit', 'audio_generate'],
    audio_resource: ['video_generate', 'video_edit', 'audio_generate'],
  };
  return families[sourceAction]?.includes(targetAction) === true;
}
import { roleMediaReferenceMetadata } from '../role-media-reference-model.js';
