import { generatorMediaModes, mergeGeneratorMediaSchema } from '../media-input-model.js';
import {
  canvasConnectionAction,
  canvasConnectionActionsCompatible,
  collectCanvasConnectionInputs,
  connectionNodeType,
  simulateCanvasConnectionSource,
} from './connection-inputs.js';

const mediaKinds = ['image', 'video', 'audio'];
const targetKinds = [...mediaKinds, 'text'];
const reject = (reason, verified = true) => ({ allowed: false, verified, reason });
const accept = () => ({ allowed: true, verified: true, reason: null });
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const range = (value) =>
  Array.isArray(value) &&
  value.length >= 2 &&
  value.slice(0, 2).every((number) => Number.isFinite(number) && number >= 0) &&
  value[0] <= value[1];

function targetSchema(target, models) {
  const type = connectionNodeType(target);
  if (!targetKinds.includes(type)) return { error: reject('unverifiedTarget', false) };
  const generatorType = target.data?.generatorType;
  if (generatorType && generatorType !== 'default')
    return { error: reject('unverifiedGenerator', false) };
  const action =
    target.data?.action ||
    (type === 'text'
      ? 'text_generate'
      : type === 'image' && target.data?.scriptRowHiddenUuid
        ? 'image_generate'
        : null);
  if (action !== type + '_generate') return { error: reject('unverifiedTargetAction', false) };
  const model = target.data?.params?.model;
  const base = typeof model === 'string' && model ? models?.[type + 'Models']?.[model] : null;
  if (!record(base?.properties) || !record(base.properties.modeType?.items))
    return { error: reject('unverifiedModel', false) };
  const template = mergeGeneratorMediaSchema(
    base,
    type === 'video' ? target.data?.extraConfig : undefined,
  );
  if (template.modelKeys && !template.modelKeys.includes(model))
    return { error: reject('templateModel') };
  return { type, model, schema: template.schema };
}

function textMaximum(schema, kind) {
  const value = schema.properties.modeType.items[kind + '2text'];
  // These fallbacks are original 516779 R/w, after a real model has been verified.
  return Array.isArray(value) && value.length >= 2 ? value[1] : kind === 'image' ? 1 : 0;
}

/** Source 469850 M: subjects share the current mode's media limit; do not infer a new mode. */
export function canvasConnectionSubjectLimit(schema, inputs) {
  const config = schema.properties?.subjects?.items?.[inputs.modeType];
  if (!config) return { allowed: true, verified: true };
  const max =
    inputs.videoList.length > 0 && config.maxCountWithVideo != null
      ? config.maxCountWithVideo
      : config.maxCount;
  if (!Number.isFinite(max) || max < 0) return { allowed: false, verified: false };
  const subjects = Array.isArray(inputs.subjectList) ? inputs.subjectList.length : 0;
  const shared = config.sharedWith ? inputs[config.sharedWith] : null;
  if (config.sharedWith && !Array.isArray(shared)) return { allowed: false, verified: false };
  return { allowed: subjects + (shared?.length || 0) <= max, verified: true };
}

function modelAccepts(schema, type, inputs) {
  const items = schema.properties.modeType.items;
  if (type === 'image') {
    const count = inputs.imageList.length;
    return (
      count === 0 ||
      (range(items.image2image) &&
        items.image2image[1] > 0 &&
        count >= items.image2image[0] &&
        count <= items.image2image[1])
    );
  }
  if (type === 'audio') {
    const images = inputs.imageList.length;
    const audios = inputs.audioList.length;
    if (!images && !audios) return true;
    if (images && audios) return false;
    const value = images ? items.image2audio : items.audio2audio;
    const count = images || audios;
    return range(value) && value[1] > 0 && count >= value[0] && count <= value[1];
  }
  if (type === 'video') {
    const hasMedia = mediaKinds.some((kind) => inputs[kind + 'List'].length > 0);
    const enabled = hasMedia
      ? generatorMediaModes(schema, inputs, { type }).compatible
      : !schema.config?.excludeModeTypes?.includes('text2video');
    return enabled && canvasConnectionSubjectLimit(schema, inputs).allowed;
  }
  return true;
}

/** Same reachable directed-cycle check as original Canvas connection f; reference-source edges are excluded. */
export function canvasConnectionCreatesCycle(nodes, edges, sourceId, targetId) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map();
  for (const edge of [...edges, { source: sourceId, target: targetId }]) {
    if (connectionNodeType(byId.get(edge.source)) === 'reference') continue;
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source).push(edge.target);
  }
  const complete = new Set();
  const path = new Set([sourceId]);
  const stack = [{ id: sourceId, index: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1];
    const next = adjacency.get(frame.id) || [];
    if (frame.index >= next.length) {
      path.delete(frame.id);
      complete.add(frame.id);
      stack.pop();
    } else {
      const id = next[frame.index++];
      if (path.has(id)) return true;
      if (!complete.has(id)) {
        path.add(id);
        stack.push({ id, index: 0 });
      }
    }
  }
  return false;
}

/** Current-model-only capacity: original collector rejects candidates needing a model switch. */
export function getCanvasReferenceCapacity({
  nodes = [],
  edges = [],
  targetId,
  kind,
  models,
  pendingCounts,
}) {
  const target = nodes.find((node) => node.id === targetId);
  if (!target) return reject('missingTarget', false);
  const resolved = targetSchema(target, models);
  if (resolved.error) return resolved.error;
  const { schema, type } = resolved;
  const inputs = collectCanvasConnectionInputs({ nodes, edges, targetId, pendingCounts });
  if (type === 'text') {
    const imageMax = textMaximum(schema, 'image');
    const videoMax = textMaximum(schema, 'video');
    if (!Number.isFinite(imageMax) || !Number.isFinite(videoMax))
      return reject('unverifiedCapacity', false);
    const image = inputs.imageList.length < imageMax;
    const video = inputs.videoList.length < videoMax;
    return (
      kind === 'image' ? image : kind === 'video' ? video : kind === 'audio' || image || video
    )
      ? accept()
      : reject('limit');
  }
  const kinds =
    type === 'image'
      ? ['image']
      : type === 'audio'
        ? ['image', 'audio']
        : kind != null
          ? [kind]
          : mediaKinds;
  if (!kinds.every((value) => mediaKinds.includes(value))) return reject('unverifiedKind', false);
  for (const value of kinds) {
    const next = simulateCanvasConnectionSource(inputs, value);
    if (type === 'video' && !canvasConnectionSubjectLimit(schema, next).verified)
      return reject('unverifiedCapacity', false);
    if (modelAccepts(schema, type, next)) return accept();
  }
  return reject('limit');
}

export const canTargetAcceptCanvasReference = (options) =>
  getCanvasReferenceCapacity(options).allowed === true;

/** Source 516779 + ordinary connection f, fail closed without a known current model/policy. */
export function validateCanvasMentionConnection({
  nodes = [],
  edges = [],
  sourceId,
  targetId,
  models,
  localResourceActions = false,
  policy,
  policyRequired = false,
}) {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) return reject('missingNode', false);
  if (sourceId === targetId) return reject('self');
  if (!targetKinds.includes(connectionNodeType(source))) return reject('unverifiedSource', false);
  if (
    edges.some(
      (edge) =>
        (edge.source === sourceId && edge.target === targetId) ||
        (edge.source === targetId && edge.target === sourceId),
    )
  )
    return reject('duplicate');
  if (policyRequired && typeof policy !== 'function') return reject('unverifiedPolicy', false);
  if (policy) {
    const allowed = policy(source, target, { nodes, edges });
    if (allowed !== true)
      return reject(allowed === false ? 'policy' : 'unverifiedPolicy', allowed === false);
  }
  if (canvasConnectionCreatesCycle(nodes, edges, sourceId, targetId)) return reject('cycle');
  const resolved = targetSchema(target, models);
  if (resolved.error) return resolved.error;
  const sourceAction = canvasConnectionAction(source, { localResourceActions });
  if (!sourceAction) return reject('unverifiedSourceAction', false);
  const targetAction = resolved.type + '_generate';
  if (!canvasConnectionActionsCompatible(sourceAction, targetAction)) return reject('action');
  const kind = connectionNodeType(source);
  const { schema, type } = resolved;
  const inputs = collectCanvasConnectionInputs({ nodes, edges, targetId });
  const next = simulateCanvasConnectionSource(inputs, kind);
  if (type === 'text') {
    if (kind === 'text') return accept();
    const max = textMaximum(schema, kind);
    if (!Number.isFinite(max)) return reject('unverifiedCapacity', false);
    // f checks direct image/video endpoints, rather than expanded group children.
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const count = edges.filter((edge) => {
      if (edge.target !== targetId) return false;
      const source = byId.get(edge.source);
      return (
        connectionNodeType(source) === kind ||
        (kind === 'image' &&
          connectionNodeType(source) === 'group' &&
          !!source?.data?.characterAsset)
      );
    }).length;
    return count < max ? accept() : reject('limit');
  }
  // 516779 only performs image/audio model simulation for media sources, not text.
  if (kind === 'text' && (type === 'image' || type === 'audio')) return accept();
  if (type === 'video' && !canvasConnectionSubjectLimit(schema, next).verified)
    return reject('unverifiedCapacity', false);
  return modelAccepts(schema, type, next) ? accept() : reject('modelUnsupported');
}
