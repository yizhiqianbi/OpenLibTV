import { generatorMediaModes, mergeGeneratorMediaSchema } from '../generator/media-input-model.js';
import { enumOptions, fieldKeys, storeKey } from '../generator/schema.js';
import {
  canvasConnectionAction,
  collectCanvasConnectionInputs,
  connectionNodeType,
  simulateCanvasConnectionSource,
} from '../generator/mentions-enhanced/connection-inputs.js';

const array = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const mediaTypes = ['image', 'video', 'audio'];
const groupTypes = new Set(['group', 'video_group', 'video-story', 'video_story']);
const ordinaryTypes = new Set([
  'text',
  'image',
  'video',
  'audio',
  'script',
  'storyboard',
  'script-v2',
  'video-clip',
  'reference',
  'shot-breakdown',
]);

// Public config-182 captured 2026-10-10. The caller can replace this ordered catalogue
// through models.support; schema object enumeration is not a support-model order.
const capturedSupport = {
  image: [
    'lib-image-2.5-s',
    'lib-image-2.5-f',
    'lib-image-2',
    'nebula-ultra',
    'nebula-2.1',
    'nebula-2-flash',
    'doubao-seedream-5-0-pro',
    'flux-3-image',
    'qwen-image-3',
    'mj-v8.2',
    'mj-v8.1',
    'mj-v7',
    'mj-niji7',
    'jimeng-4.6',
    'seedream-5',
    'seedream-4.5',
    'z-image',
    'qwen',
    'qwen-edit',
    'seedream-4',
  ],
  video: [
    'star-video2.5',
    'star-video2.5-draft',
    'star-video2',
    'wanx3.0',
    'wanx3.0-prime',
    'vidu-q4',
    'MiniMax-Hailuo-H3',
    'MiniMax-Hailuo-H3-Max',
    'star-video2-fast',
    'star-video2-mini',
    'happy-horse-1.1',
    'happy-horse-1',
    'kling-v3-omni',
    'kling-v3-turbo',
    'kling-video-o3',
    'wanx2.7-video',
    'kling-video-o1',
    'wanxiang-v2-6',
    'MiniMax-Hailuo-2.3-Fast',
    'MiniMax-Hailuo-2.3',
    'kling-v2-6',
    'kling-v3-motion-control',
    'midjourney-video',
    'MiniMax-Hailuo-o2',
    'viduq2',
    'viduq2-pro',
    'viduq2-turbo',
    'viduq3-pro',
    'omnihuman-1.5',
    'kling-v2-5-turbo-pro',
    'wanxiang-plus',
    'wanxiang-preview',
    'pixverse-v5.5',
    'pixverse-v5',
  ],
  audio: [
    'seed-audio-1.0',
    'speech-2.8-hd',
    'speech-2.8-turbo',
    'vocal-v3',
    'vocal-music',
    'mureka-8',
  ],
};

// True entries of source module 591290, limited to ordinary endpoints implemented here.
const textTargets = [
  'text_generate',
  'image_generate',
  'video_generate',
  'video_edit',
  'video_clip_resource',
  'audio_generate',
  'script_generate',
];
const imageTargets = [...textTargets, 'image_edit', 'director_console_panorama_input'];
const videoTargets = [
  'text_generate',
  'video_generate',
  'video_edit',
  'video_clip_resource',
  'script_generate',
  'shot_breakdown_resource',
];
const audioTargets = ['video_generate', 'video_edit', 'video_clip_resource', 'audio_generate'];
const actionTargets = {
  text_generate: textTargets,
  text_resource: textTargets,
  image_generate: imageTargets,
  image_edit: imageTargets,
  image_resource: imageTargets,
  video_generate: videoTargets,
  video_edit: videoTargets,
  video_resource: videoTargets,
  video_clip_resource: ['text_generate', 'video_generate', 'video_edit', 'script_generate'],
  audio_generate: audioTargets,
  audio_resource: audioTargets,
  script_generate: [],
  script_resource: [],
  video_story_resource: [],
};

function action(node) {
  const kind = connectionNodeType(node);
  if (kind === 'group' && node.data?.characterAsset && !node.data.action) return 'image_resource';
  if (kind === 'video-clip' && !node.data?.action) return 'video_clip_resource';
  if (kind === 'shot-breakdown' && !node.data?.action) return 'shot_breakdown_resource';
  return canvasConnectionAction(node, { localResourceActions: true });
}

/** Source f DFS: reference-source edges do not participate in dependency cycles. */
function createsCycle(nodes, edges, sourceId, targetId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of [...edges, { source: sourceId, target: targetId }]) {
    if (connectionNodeType(byId.get(edge.source)) === 'reference') continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(edge.target);
  }
  const visited = new Set(),
    path = new Set();
  const stack = [{ id: sourceId, entered: false, next: 0 }];
  while (stack.length) {
    const entry = stack[stack.length - 1];
    if (!entry.entered) {
      entry.entered = true;
      visited.add(entry.id);
      path.add(entry.id);
    }
    const targets = outgoing.get(entry.id) || [];
    if (entry.next >= targets.length) {
      path.delete(entry.id);
      stack.pop();
      continue;
    }
    const id = targets[entry.next++];
    if (path.has(id)) return true;
    if (!visited.has(id)) stack.push({ id, entered: false, next: 0 });
  }
  return false;
}

function sourceChildren(source, nodes) {
  const result = [],
    visited = new Set();
  const expand = (node, depth = 0) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    if (groupTypes.has(connectionNodeType(node)) && !node.data?.characterAsset) {
      if (depth >= 8) return;
      for (const child of nodes) if (child.parentId === node.id) expand(child, depth + 1);
    } else result.push(node);
  };
  expand(source);
  return result;
}

function subjectLimit(schema, inputs) {
  const limit = schema.properties?.subjects?.items?.[inputs.modeType];
  if (!limit) return true;
  const maximum =
    inputs.videoList.length && limit.maxCountWithVideo != null
      ? limit.maxCountWithVideo
      : limit.maxCount;
  if (!Number.isFinite(maximum)) return null;
  const shared = limit.sharedWith ? inputs[limit.sharedWith] : [];
  if (limit.sharedWith && shared != null && !Array.isArray(shared)) return null;
  return array(inputs.subjectList).length + array(shared).length <= maximum;
}

function modelAllows(schema, type, inputs) {
  if (!record(schema?.properties)) return null;
  if (type === 'video' && subjectLimit(schema, inputs) === null) return null;
  const compatible = generatorMediaModes(schema, inputs, { type }).compatible;
  const enabled =
    type !== 'video' || mediaTypes.some((kind) => inputs[kind + 'List'].length)
      ? compatible
      : !array(schema.config?.excludeModeTypes).includes('text2video');
  return enabled && (type !== 'video' || subjectLimit(schema, inputs));
}

/** Source px resets new normal defaults and clears obsolete normal keys, preserving all other params. */
function switchParams(target, previous, next, modelKey) {
  const raw = target.data?.params || {},
    mode = raw.modeType ?? 'text2video';
  const oldKeys = fieldKeys(previous?.config?.settings, mode);
  const nextKeys = fieldKeys(next?.config?.settings, mode);
  const oldProperties = previous?.properties || {},
    properties = next?.properties || {};
  const params = { ...raw, model: modelKey },
    patch = {};
  for (const key of nextKeys) {
    const property = properties[key];
    if (!property) continue;
    patch[storeKey(key, property)] =
      property.default !== undefined ? property.default : enumOptions(property)[0]?.value;
  }
  const retained = new Set(nextKeys.map((key) => storeKey(key, properties[key])));
  for (const key of oldKeys) {
    const stored = storeKey(key, oldProperties[key]);
    if (!retained.has(stored)) patch[stored] = undefined;
  }
  Object.assign(params, patch);
  // Existing local documents keep normal values in settings; map the same source patch there.
  if (record(raw.settings)) params.settings = { ...raw.settings, ...patch };
  return { params };
}

// Small pure primitives shared by the source's separate aggregate multi-selection protocol.
// Its support-first selection must not call the ordinary current-model-first resolver.
export const canvasConnectionActionsAllowed = (sourceAction, targetAction) =>
  actionTargets[sourceAction]?.includes(targetAction) === true;
export const canvasConnectionModelAllows = modelAllows;
export const canvasConnectionSwitchParams = switchParams;
export function canvasConnectionOrderedModelKeys(models, type) {
  const supplied = models?.support?.[type];
  if (supplied != null && !Array.isArray(supplied)) return null;
  return (supplied ?? capturedSupport[type] ?? []).map((entry) =>
    typeof entry === 'string' ? entry : entry?.modelKey,
  );
}

function selectModel({ target, type, sourceType, nodes, edges, models }) {
  const catalogue = models?.[type + 'Models'];
  if (!record(catalogue)) return { reason: 'modelsUnavailable' };
  const inputs = simulateCanvasConnectionSource(
    collectCanvasConnectionInputs({ nodes, edges, targetId: target.id }),
    sourceType,
  );
  const raw = target.data?.params || {},
    current = raw.model;
  const extra = type === 'video' ? target.data?.extraConfig : undefined;
  const template = mergeGeneratorMediaSchema(catalogue[current], extra);
  const getSchema = (key) => {
    if (!record(catalogue[key])) return null;
    return type === 'video' && template.modelKeys?.includes(key)
      ? mergeGeneratorMediaSchema(catalogue[key], extra).schema
      : catalogue[key];
  };
  const currentSchema = getSchema(current);
  if (currentSchema && modelAllows(currentSchema, type, inputs) === true) return {};
  const locked =
    type === 'video' &&
    ([...array(raw.imageList), ...array(raw.videoList), ...array(raw.audioList)].some(
      (item) => item?.assetId,
    ) ||
      raw.segmentRemakeLock ||
      array(inputs.subjectList).length);
  if (locked) return { reason: currentSchema ? 'lockedModelUnsupported' : 'modelsUnavailable' };
  const supplied = models.support?.[type];
  if (supplied != null && !Array.isArray(supplied)) return { reason: 'modelCatalogueUnavailable' };
  const candidateKeys = (supplied ?? capturedSupport[type]).map((entry) =>
    typeof entry === 'string' ? entry : entry?.modelKey,
  );
  let unknown = current && !currentSchema;
  for (const key of candidateKeys) {
    if (!key || key === current || (template.modelKeys && !template.modelKeys.includes(key)))
      continue;
    const schema = getSchema(key);
    if (!schema) {
      unknown = true;
      continue;
    }
    const allowed = modelAllows(schema, type, inputs);
    if (allowed == null) {
      unknown = true;
      continue;
    }
    if (allowed)
      return { targetPatch: switchParams(target, catalogue[current], catalogue[key], key) };
  }
  return { reason: unknown ? 'modelsUnavailable' : 'modelUnsupported' };
}

function generatorConnection(source, target, context) {
  const sourceType = connectionNodeType(source),
    targetType = connectionNodeType(target);
  if (groupTypes.has(sourceType) && !source.data?.characterAsset) {
    const children = sourceChildren(source, context.nodes);
    if (!children.length) return { reason: 'emptyGroup' };
    const results = children.map((child) => generatorConnection(child, target, context));
    return results.find((result) => !result.reason) || results[0];
  }
  if (targetType === 'reference')
    return sourceType === 'reference' ? {} : { reason: 'referenceTarget' };
  if (sourceType === 'reference') return {};
  const effectiveSource =
    sourceType === 'group' && source.data?.characterAsset ? 'image' : sourceType;
  if (!ordinaryTypes.has(targetType)) return { reason: 'unverifiedTarget' };
  if (!ordinaryTypes.has(effectiveSource)) return { reason: 'unverifiedSource' };
  if (targetType === 'script-v2' && ['video', 'video-clip'].includes(effectiveSource))
    return { reason: 'scriptVideo' };
  const sourceAction = action(source),
    targetAction = action(target);
  if (!sourceAction || !targetAction) return { reason: 'actionUnavailable' };
  if (!actionTargets[sourceAction]?.includes(targetAction)) return { reason: 'action' };
  const incoming = context.edges.filter((edge) => edge.target === target.id);
  const generator = target.data?.generatorType;
  if (generator === 'enhance') {
    if (!['image', 'video'].includes(targetType) || targetType !== effectiveSource)
      return { reason: 'enhanceType' };
    return incoming.length ? { reason: 'singleInput' } : {};
  }
  if (generator === 'picture-edit' || generator === 'pictureEdit')
    return targetType === 'video' && effectiveSource === 'video' && !incoming.length
      ? {}
      : { reason: 'pictureEditInput' };
  if (generator && generator !== 'default') return { reason: 'unverifiedGenerator' };
  if (targetType === 'shot-breakdown')
    return effectiveSource === 'video' && !incoming.length ? {} : { reason: 'singleInput' };
  if (targetType === 'text') {
    if (targetAction === 'text_resource') return { reason: 'resourceTarget' };
    if (effectiveSource === 'text') return {};
    if (!['image', 'video'].includes(effectiveSource)) return { reason: 'textSource' };
    const model = target.data?.params?.model || context.models?.default?.text;
    const items = context.models?.textModels?.[model]?.properties?.modeType?.items;
    const limits = items?.[effectiveSource + '2text'];
    const maximum =
      Array.isArray(limits) && limits.length >= 2 ? limits[1] : effectiveSource === 'image' ? 1 : 0;
    if (!Number.isFinite(maximum) || maximum < 0) return { reason: 'capacityUnavailable' };
    const byId = new Map(context.nodes.map((node) => [node.id, node]));
    const count = incoming.filter((edge) => {
      const node = byId.get(edge.source),
        type = connectionNodeType(node);
      return (
        type === effectiveSource ||
        (effectiveSource === 'image' && type === 'group' && node?.data?.characterAsset)
      );
    }).length;
    return count < maximum ? {} : { reason: 'limit' };
  }
  if (targetAction === 'video_generate' && ['text', ...mediaTypes].includes(effectiveSource))
    return selectModel({ ...context, sourceType: effectiveSource, target, type: 'video' });
  if (targetAction === 'image_generate' && effectiveSource === 'image')
    return selectModel({ ...context, sourceType: 'image', target, type: 'image' });
  if (targetAction === 'audio_generate' && ['image', 'audio'].includes(effectiveSource))
    return selectModel({ ...context, sourceType: effectiveSource, target, type: 'audio' });
  return {};
}

/** Pure plan. IDs are already normalized from the initiating input/output handle by the controller. */
export function resolveCanvasConnection({ nodes = [], edges = [], models, sourceId, targetId }) {
  const base = { sourceId, targetId };
  const reject = (reason) => ({ ...base, valid: false, reason });
  const source = nodes.find((node) => node.id === sourceId),
    target = nodes.find((node) => node.id === targetId);
  if (!source || !target) return reject('missingNode');
  // Programmatic source v explicitly rejects this; local click/drag use the same invariant.
  if (sourceId === targetId) return reject('self');
  if (
    edges.some(
      (edge) =>
        (edge.source === sourceId && edge.target === targetId) ||
        (edge.source === targetId && edge.target === sourceId),
    )
  )
    return reject('duplicate');
  const sourceType = connectionNodeType(source),
    targetType = connectionNodeType(target);
  const storyboardGroup = (node) =>
    connectionNodeType(node) === 'group' &&
    ['image', 'video'].includes(node.data?.storyboardGroupType);
  if (
    (sourceType === 'script-v2' && storyboardGroup(target)) ||
    (targetType === 'script-v2' && storyboardGroup(source))
  )
    return reject('scriptStoryboardGroup');
  if (targetType === 'video-clip') {
    if (
      ['video', 'audio'].includes(sourceType) &&
      array(source.data?.url).some((url) => typeof url === 'string' && url.startsWith('blob:'))
    )
      return reject('uploadRequired');
    const clips = array(target.data?.clipTimelineData?.clips);
    if (
      sourceType === 'video' &&
      clips.filter((clip) => clip.type !== 'audio').length >= 30 &&
      !clips.some((clip) => clip.type !== 'audio' && clip.sourceNodeId === sourceId)
    )
      return reject('clipLimit');
  }
  if (createsCycle(nodes, edges, sourceId, targetId)) return reject('cycle');
  const result = generatorConnection(source, target, { nodes, edges, models });
  return result.reason ? reject(result.reason) : { ...base, valid: true, reason: null, ...result };
}

const creationActions = {
  text: ['text_generate', 'text_resource'],
  image: ['image_generate', 'image_edit', 'image_resource'],
  video: ['video_generate', 'video_edit', 'video_resource'],
  audio: ['audio_generate', 'audio_resource'],
  script: ['script_generate', 'script_resource'],
  storyboard: ['script_generate', 'script_resource'],
  'script-v2': ['script_generate', 'script_resource'],
  'video-clip': ['video_clip_resource'],
  'shot-breakdown': ['shot_breakdown_resource'],
  reference: ['reference_node'],
};

/**
 * Source 859654 X and 265672 eM: menu-created edges use type eligibility and raw addEdge,
 * not ordinary generator capacity/model switching. Only a newly created endpoint may use this.
 */
export function resolveCanvasConnectedCreation({
  nodes = [],
  edges = [],
  sourceId,
  targetId,
  createdNodeId,
}) {
  const base = { sourceId, targetId };
  const reject = (reason) => ({ ...base, valid: false, reason });
  if (![sourceId, targetId].includes(createdNodeId)) return reject('creationEndpoint');
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) return reject('missingNode');
  if (sourceId === targetId) return reject('self');
  if (
    edges.some(
      (edge) =>
        (edge.source === sourceId && edge.target === targetId) ||
        (edge.source === targetId && edge.target === sourceId),
    )
  )
    return reject('duplicate');
  if (createsCycle(nodes, edges, sourceId, targetId)) return reject('cycle');
  const sourceType = connectionNodeType(source),
    targetType = connectionNodeType(target);
  const outgoing = createdNodeId === targetId;
  const anchor = outgoing ? source : target;
  const createdType = outgoing ? targetType : sourceType;
  if (!creationActions[createdType]) return reject('unverifiedCreationType');
  if (outgoing && sourceType === 'reference') return { ...base, valid: true, reason: null };
  if (!outgoing && targetType === 'reference')
    return sourceType === 'reference'
      ? { ...base, valid: true, reason: null }
      : reject('referenceTarget');
  // The source UI shows a disabled reference row for ordinary anchors; it is not an exception.
  if (createdType === 'reference') return reject('action');
  if (!outgoing && ['script', 'storyboard'].includes(createdType))
    return reject('creationTypeHidden');
  if (targetType === 'script-v2' && ['video', 'video-clip'].includes(sourceType))
    return reject('scriptVideo');
  const anchorAction = action(anchor);
  if (!anchorAction) return reject('actionUnavailable');
  const valid = outgoing
    ? creationActions[createdType].some((candidate) =>
        actionTargets[anchorAction]?.includes(candidate),
      )
    : creationActions[createdType].some((candidate) =>
        actionTargets[candidate]?.includes(anchorAction),
      );
  return valid ? { ...base, valid: true, reason: null } : reject('action');
}
