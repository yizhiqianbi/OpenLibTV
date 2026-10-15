import { inferGeneratorMediaMode } from '../generator/media-input-model.js';
import { connectionNodeType } from '../generator/mentions-enhanced/connection-inputs.js';
import {
  canvasConnectionActionsAllowed,
  canvasConnectionModelAllows,
  canvasConnectionOrderedModelKeys,
  canvasConnectionSwitchParams,
} from './connection-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const mediaTypes = ['image', 'video', 'audio'];
const sourceTypes = new Set(['text', ...mediaTypes, 'script', 'script-v2', 'video-clip', 'group']);
const creationActions = {
  text: ['text_generate', 'text_resource'],
  image: ['image_generate', 'image_edit', 'image_resource'],
  video: ['video_generate', 'video_edit', 'video_resource'],
  audio: ['audio_generate', 'audio_resource'],
  'video-clip': ['video_clip_resource'],
  'script-v2': ['script_generate', 'script_resource'],
};

/** Source 189224: virtual selection already expands selected groups' direct children. */
export function getCanvasMultiConnectionSources(nodes = [], seedIds = []) {
  const ids = new Set(array(seedIds));
  return nodes.filter((node) => ids.has(node.id) && connectionNodeType(node) !== 'reference');
}

/** Source 189224: a real group's output instead collects all descendant non-group leaves. */
export function getCanvasGroupConnectionSources(nodes = [], groupId) {
  const groups = new Set([groupId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (
        connectionNodeType(node) === 'group' &&
        groups.has(node.parentId) &&
        !groups.has(node.id)
      ) {
        groups.add(node.id);
        changed = true;
      }
  }
  return nodes.filter(
    (node) =>
      !!node.parentId &&
      groups.has(node.parentId) &&
      !['group', 'reference'].includes(connectionNodeType(node)),
  );
}

/** Source 516779 m: count direct sources, without ordinary single-connection group expansion. */
function collectDirectInputs(nodes) {
  const inputs = { textList: [], imageList: [], videoList: [], audioList: [] };
  for (const node of nodes) {
    const data = node.data || {},
      type = connectionNodeType(node);
    if (type === 'text') inputs.textList.push({ nodeId: node.id });
    else if (mediaTypes.includes(type)) {
      const raw =
        type === 'image' &&
        !['hidden', 'watermark'].includes(data.protectionType) &&
        array(data.originalUrl).length
          ? data.originalUrl
          : data.url;
      inputs[type + 'List'].push({
        nodeId: node.id,
        url: Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''),
      });
    } else if (type === 'group' && data.characterAsset) {
      const character = data.characterAsset,
        states = array(character.states),
        state = states.find((entry) => entry.id === character.defaultStateId) ?? states[0];
      if (state) inputs.imageList.push({ nodeId: node.id, url: state.mainReferenceImageUrl });
    }
  }
  return inputs;
}

function prepare({ nodes = [], edges = [], sourceIds = [], targetId }) {
  const ids = [...new Set(array(sourceIds))],
    byId = new Map(nodes.map((node) => [node.id, node])),
    target = byId.get(targetId),
    base = { targetId, sourceIds: ids, edgeSourceIds: [] };
  if (!target || ids.some((id) => !byId.has(id))) return { base, reason: 'missingNode' };
  if (ids.includes(targetId)) return { base, reason: 'self' };
  const sources = ids
    .map((id) => byId.get(id))
    .filter((node) => connectionNodeType(node) !== 'reference');
  base.sourceIds = sources.map((node) => node.id);
  if (!sources.length) return { base, reason: 'emptySources' };
  // The original validator ignores actionless nodes but its handler retains their requested edges.
  const qualified = sources.filter((node) => node.data?.action);
  base.qualifiedSourceIds = qualified.map((node) => node.id);
  if (!qualified.length) return { base, reason: 'actionUnavailable' };
  if (qualified.some((node) => !sourceTypes.has(connectionNodeType(node))))
    return { base, reason: 'unverifiedSource' };
  const incomingIds = new Set(
    edges.filter((edge) => edge.target === targetId).map((edge) => edge.source),
  );
  base.edgeSourceIds = base.sourceIds.filter((id) => !incomingIds.has(id));
  return { base, target, sources, qualified, incomingIds };
}

function basicCompatibility(source, target) {
  const sourceType = connectionNodeType(source),
    targetType = connectionNodeType(target);
  if (targetType === 'script-v2' && ['video', 'video-clip'].includes(sourceType))
    return 'scriptVideo';
  const targetAction =
    target.data?.action ||
    (targetType === 'text'
      ? 'text_generate'
      : targetType === 'video-clip'
        ? 'video_clip_resource'
        : null);
  return canvasConnectionActionsAllowed(source.data?.action, targetAction) ? null : 'action';
}

function textCapacity(inputs, models, params) {
  const modelKey = params?.model || models?.default?.text,
    items = models?.textModels?.[modelKey]?.properties?.modeType?.items;
  for (const [type, fallback] of [
    ['image', 1],
    ['video', 0],
  ]) {
    const range = items?.[type + '2text'],
      maximum = Array.isArray(range) && range.length >= 2 ? range[1] : fallback;
    if (!Number.isFinite(maximum) || maximum < 0) return 'capacityUnavailable';
    if (inputs[type + 'List'].length > maximum) return 'limit';
  }
  return null;
}

function pickModel(models, type, inputs) {
  const catalogue = models?.[type + 'Models'],
    keys = canvasConnectionOrderedModelKeys(models, type);
  if (!record(catalogue)) return { reason: 'modelsUnavailable' };
  if (!keys) return { reason: 'modelCatalogueUnavailable' };
  let unknown = false;
  for (const key of keys) {
    const allowed = key ? canvasConnectionModelAllows(catalogue[key], type, inputs) : null;
    if (allowed === null) unknown = true;
    else if (allowed) return { modelKey: key, schema: catalogue[key] };
  }
  return { reason: unknown ? 'modelsUnavailable' : 'modelUnsupported' };
}

function existingType(target) {
  const type = connectionNodeType(target),
    action = target.data?.action;
  for (const media of ['video', 'image', 'audio'])
    if (type === media || action === media + '_generate') return media;
  if (action === 'text_generate' || (!action && type === 'text')) return 'text';
  if (type === 'script' || action === 'script_generate') return 'script';
  if (type === 'video-clip' || action === 'video_clip_resource') return 'video-clip';
  return null;
}

/** Aggregate, support-first source protocol. A rejection never contains a partial edge plan. */
export function resolveCanvasMultiConnection({
  nodes = [],
  edges = [],
  models,
  sourceIds,
  targetId,
}) {
  const prepared = prepare({ nodes, edges, sourceIds, targetId }),
    { base, target, qualified, incomingIds } = prepared,
    reject = (reason) => ({ ...base, edgeSourceIds: [], valid: false, reason }),
    accept = (patch = {}) => ({ ...base, valid: true, reason: null, ...patch });
  if (prepared.reason) return reject(prepared.reason);
  const type = existingType(target);
  if (!type) return reject('unverifiedTarget');
  if (mediaTypes.includes(type) && target.data?.action !== type + '_generate')
    return reject('resourceTarget');
  if (
    type === 'script' &&
    (!['script', 'script-v2'].includes(connectionNodeType(target)) ||
      target.data?.action !== 'script_generate')
  )
    return reject('unverifiedTarget');
  if (type === 'video-clip' && connectionNodeType(target) !== 'video-clip')
    return reject('unverifiedTarget');
  const incompatible = qualified.map((source) => basicCompatibility(source, target)).find(Boolean);
  if (incompatible) return reject(incompatible);
  if (qualified.every((source) => incomingIds.has(source.id))) return reject('duplicate');
  const union = new Set([...incomingIds, ...qualified.map((node) => node.id)]),
    aggregate = collectDirectInputs(nodes.filter((node) => union.has(node.id)));
  if (type === 'text') {
    const reason = textCapacity(aggregate, models, target.data?.params);
    return reason ? reject(reason) : accept();
  }
  if (['script', 'video-clip'].includes(type)) {
    // Source h is rechecked for new sources only here, not for aggregate media generators.
    if (target.data?.generatorType && target.data.generatorType !== 'default')
      return reject('unverifiedGenerator');
    return accept();
  }
  if (type === 'image' && (aggregate.videoList.length || aggregate.audioList.length))
    return reject('imageMedia');
  // Source appends refImages for image/video model evaluation, but not text/audio capacity.
  if (['image', 'video'].includes(type))
    array(target.data?.refImages).forEach((url, index) =>
      aggregate.imageList.push({ nodeId: `${targetId}:ref-${index}`, url }),
    );
  const raw = target.data?.params || {},
    inputs = { ...raw, ...aggregate };
  if (
    type === 'video' &&
    raw.model &&
    mediaTypes.some((media) => array(raw[media + 'List']).some((item) => item?.assetId))
  ) {
    const allowed = canvasConnectionModelAllows(models?.videoModels?.[raw.model], type, inputs);
    return allowed === true
      ? accept()
      : reject(allowed === null ? 'modelsUnavailable' : 'lockedModelUnsupported');
  }
  const choice = pickModel(models, type, inputs);
  if (choice.reason) {
    if (
      type === 'video' &&
      choice.reason === 'modelUnsupported' &&
      !mediaTypes.some((media) => aggregate[media + 'List'].length)
    )
      return accept();
    return reject(choice.reason);
  }
  return choice.modelKey === raw.model
    ? accept()
    : accept({
        modelKey: choice.modelKey,
        targetPatch: canvasConnectionSwitchParams(
          target,
          models?.[type + 'Models']?.[raw.model],
          choice.schema,
          choice.modelKey,
        ),
      });
}

/** One shared newly created target, with source creation eligibility rather than existing-target rules. */
export function resolveCanvasMultiConnectedCreation({
  nodes = [],
  edges = [],
  models,
  sourceIds,
  targetId,
  createdNodeId,
}) {
  const prepared = prepare({ nodes, edges, sourceIds, targetId }),
    { base, target, qualified } = prepared,
    reject = (reason) => ({ ...base, edgeSourceIds: [], valid: false, reason }),
    accept = (choice = {}) => ({
      ...base,
      valid: true,
      reason: null,
      ...choice,
      ...(choice.modelKey || choice.modeType
        ? {
            targetPatch: {
              params: {
                ...target.data?.params,
                ...(choice.modelKey ? { model: choice.modelKey } : {}),
                ...(choice.modeType ? { modeType: choice.modeType } : {}),
              },
            },
          }
        : {}),
    });
  if (createdNodeId !== targetId) return reject('creationEndpoint');
  if (prepared.reason) return reject(prepared.reason);
  if (!base.edgeSourceIds.length) return reject('duplicate');
  const type = connectionNodeType(target),
    actions = creationActions[type];
  if (!actions) return reject('unverifiedCreationType');
  if (
    type === 'script-v2' &&
    qualified.some((node) =>
      ['video_generate', 'video_edit', 'video_resource', 'video_clip_resource'].includes(
        node.data.action,
      ),
    )
  )
    return reject('scriptVideo');
  if (
    !qualified.every((node) =>
      actions.some((action) => canvasConnectionActionsAllowed(node.data.action, action)),
    )
  )
    return reject('action');
  const inputs = collectDirectInputs(qualified);
  if (type === 'text') {
    // Source canMultiSelectCreateNode checks the global default text model, not the new target's params.
    const reason = textCapacity(inputs, models);
    return reason ? reject(reason) : accept();
  }
  if (type === 'video-clip') return inputs.videoList.length ? accept() : reject('videoRequired');
  if (type === 'script-v2') return accept();
  if (type === 'image' && (inputs.videoList.length || inputs.audioList.length))
    return reject('imageMedia');
  if (type === 'image' && !inputs.imageList.length) return accept();
  if (type === 'audio' && !inputs.imageList.length && !inputs.audioList.length) return accept();
  const choice = pickModel(models, type, inputs);
  if (choice.reason) {
    // These two no-enabled-model fallbacks are explicit in the source's creation branch.
    if (choice.reason === 'modelUnsupported' && type === 'image')
      return accept({ modeType: 'image2image' });
    if (
      choice.reason === 'modelUnsupported' &&
      type === 'video' &&
      !mediaTypes.some((media) => inputs[media + 'List'].length)
    )
      return accept();
    return reject(choice.reason);
  }
  return accept({
    modelKey: choice.modelKey,
    modeType: inferGeneratorMediaMode(choice.schema, inputs, { type }),
  });
}
