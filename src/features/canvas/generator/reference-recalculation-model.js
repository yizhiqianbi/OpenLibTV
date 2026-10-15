import {
  collectReconciledGeneratorInputs,
  expandGeneratorReferenceSources,
  generatorExcludedReferences,
} from './reference-incoming-model.js';
import {
  buildGeneratorMixedReferences,
  reconcileGeneratorIncomingPrompt,
  usesMixedGeneratorReferences,
} from './reference-reconciliation-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const nodeType = (node) => node?.data?.type || node?.type;
const mediaKeys = ['imageList', 'videoList', 'audioList'];
const segmentRangeToken = /\{\{SegmentRange:([^{}\s]+)\}\}/g;
const valueSignature = (value) =>
  value == null
    ? ''
    : ['string', 'number', 'boolean'].includes(typeof value)
      ? String(value)
      : JSON.stringify(value);

// Source il compares these fields, not every property on a model record.
const styleSignature = (models) =>
  models
    .map((value) => {
      const model = value ?? {};
      const template = Array.isArray(model.templateInfo)
        ? model.templateInfo
            .map((value) => {
              const field = value ?? {};
              return `${valueSignature(field.name)}:${valueSignature(field.default)}`;
            })
            .join(',')
        : '';
      const base = Array.isArray(model.baseType)
        ? model.baseType.map(valueSignature).join(',')
        : valueSignature(model.baseType);
      return [
        model.uuid,
        model.versionUuid,
        model.versionId,
        model.modelUuid,
        model.name,
        model.imageUrl,
        base,
        model.modelType,
        template,
        model.weight,
        model.srefCode,
        +!!model._fromStyleNode,
      ]
        .map(valueSignature)
        .join(':');
    })
    .join('|');

function recalculateMaterialStyles(target, incoming, byId) {
  const script = nodeType(target) === 'script';
  if (nodeType(target) !== 'image' && !script) return target;
  const params = (script ? target.data.imageGenConfig : target.data.params) ?? {};
  const styleEdges = incoming.filter(
    (edge) => nodeType(byId.get(edge.source)) === 'material-style',
  );
  const connected = styleEdges
    .map((edge) => byId.get(edge.source))
    .filter(Boolean)
    .map(({ data }) => ({
      uuid: data.styleVersionUuid || data.styleAssetUuid || '',
      name: data.styleName || data.name || '',
      imageUrl: data.coverUrl || '',
      baseType: data.baseType,
      modelType: data.modelType,
      versionUuid: data.styleVersionUuid || undefined,
      modelUuid: data.styleAssetUuid || undefined,
      versionId: data.styleVersionId,
      templateInfo: data.templateInfo,
      weight: data.weight ?? 0.8,
      srefCode: data.srefCode || undefined,
      _fromStyleNode: true,
    }))
    .filter((model) => model.uuid);
  const manual = array(params.fineTuneModels).filter((model) => !model?._fromStyleNode);
  const seen = new Set();
  const models = [];
  for (const model of [...connected, ...manual])
    if (model?.uuid && !seen.has(model.uuid)) {
      seen.add(model.uuid);
      models.push(model);
    }
  const first = styleEdges.length ? byId.get(styleEdges[0].source)?.data : undefined;
  const fineTuneType =
    first?.fineTuneType ?? (models.length === 0 ? undefined : params.fineTuneType);
  if (
    fineTuneType === params.fineTuneType &&
    styleSignature(params.fineTuneModels ?? []) === styleSignature(models)
  )
    return target;
  const nextParams = {
    ...params,
    fineTuneModels: models,
    ...(fineTuneType !== undefined ? { fineTuneType } : {}),
  };
  if (script) return { ...target, data: { ...target.data, imageGenConfig: nextParams } };
  const task = target.data.taskInfo;
  const stale = !!(task?.taskId && task.loading !== true && target.data.isStale !== true);
  return {
    ...target,
    data: {
      ...target.data,
      ...(stale ? { isStale: true, staleVersion: (target.data.staleVersion ?? 0) + 1 } : {}),
      params: nextParams,
    },
  };
}

function recalculateLensEffects(target, incoming, byId) {
  if (nodeType(target) !== 'video' || !target.data.params) return target;
  const params = target.data.params;
  const versions = new Set();
  const uuids = new Set();
  const connectedVersions = [];
  const models = [];
  for (const edge of incoming) {
    const source = byId.get(edge.source);
    if (nodeType(source) !== 'material-lens') continue;
    const data = source.data;
    const versionId = typeof data.lensVersionId === 'number' ? data.lensVersionId : undefined;
    const uuid = data.lensVersionUuid ?? '';
    if (versionId !== undefined && !versions.has(versionId)) {
      versions.add(versionId);
      connectedVersions.push(versionId);
    }
    if (uuid && !uuids.has(uuid)) {
      uuids.add(uuid);
      models.push({
        uuid,
        versionId,
        name: data.lensName ?? '',
        imageUrl: data.coverUrl ?? '',
        sourceNodeId: source.id,
        _fromLensNode: true,
      });
    }
  }
  const oldEffects = array(params.effects);
  const oldModels = array(params.lensModels);
  const ownedVersions = new Set(
    oldModels.map((model) => model.versionId).filter((version) => typeof version === 'number'),
  );
  const retained = oldEffects.filter(
    (effect) => typeof effect === 'number' && effect > 0 && !ownedVersions.has(effect),
  );
  const configuredEffect = target.data.extraConfig ? Number(target.data.extraConfig.effectId) : NaN;
  if (configuredEffect > 0 && !retained.includes(configuredEffect))
    retained.unshift(configuredEffect);
  const effects = [...retained];
  for (const version of connectedVersions) if (!retained.includes(version)) effects.push(version);
  const sameEffects = effects.length
    ? Array.isArray(params.effects) &&
      oldEffects.length === effects.length &&
      effects.every((effect, index) => oldEffects[index] === effect)
    : !('effects' in params);
  const sameModels = models.length
    ? oldModels.length === models.length &&
      models.every((model, index) => oldModels[index]?.uuid === model.uuid)
    : !('lensModels' in params);
  if (sameEffects && sameModels) return target;
  const nextParams = { ...params };
  if (effects.length) nextParams.effects = effects;
  else delete nextParams.effects;
  if (models.length) nextParams.lensModels = models;
  else delete nextParams.lensModels;
  return { ...target, data: { ...target.data, params: nextParams } };
}

function panoramaUrl(sources, nodes, target) {
  const expanded = expandGeneratorReferenceSources(
    sources,
    nodes,
    generatorExcludedReferences(target.data),
  );
  const first = expanded.find((node) => nodeType(node) === 'image');
  const data = first?.data;
  if (!data) return undefined;
  const urls =
    !['hidden', 'watermark'].includes(data.protectionType) && array(data.originalUrl).length
      ? data.originalUrl
      : data.url;
  const url = Array.isArray(urls) ? (urls[0] ?? '') : typeof urls === 'string' ? urls : '';
  return typeof url === 'string' && url.trim() ? url.trim() : undefined;
}

/**
 * Source store ig → il → 464913, using a post-mutation graph and the target's
 * original params plus latest input. Explicit pre-mutation fallback references
 * are only a compatibility adapter for local documents without persisted arrays.
 * The caller owns cascade, exclusion cleanup, drafts, CAS, history and saving.
 */
export function recalculateCanvasIncomingTarget({ nodes, edges, target, fallbackReferences } = {}) {
  if (!target?.data) return target;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const incoming = edges.filter((edge) => edge.target === target.id);
  const kind = nodeType(target);
  if (kind === 'space-scene-720' || kind === 'director-console-3d') {
    const sources = incoming
      .filter((edge) => !edge.data?.portraitVirtual && !edge.data?.assetVirtual)
      .map((edge) => byId.get(edge.source))
      .filter(Boolean);
    return {
      ...target,
      data: { ...target.data, panoramaUrl: panoramaUrl(sources, nodes, target) },
    };
  }
  if (kind === 'script') return recalculateMaterialStyles(target, incoming, byId);
  const params = target.data.params;
  if (!params) return target;
  const before = Object.fromEntries(
    mediaKeys.map((key) => [
      key,
      Array.isArray(params[key]) ? params[key] : array(fallbackReferences?.[key]),
    ]),
  );
  before.mixedList = buildGeneratorMixedReferences(before, params.mixedListOrder);
  const inputs = collectReconciledGeneratorInputs({ nodes, edges, target });
  const prompt = reconcileGeneratorIncomingPrompt(
    typeof params.prompt === 'string' ? params.prompt : '',
    before,
    inputs,
    usesMixedGeneratorReferences(params.modeType, params.model),
  );
  const draft = params.segmentRemakeDraft;
  const hasSource =
    !draft ||
    incoming.some(
      (edge) =>
        !edge.data?.portraitVirtual &&
        !edge.data?.assetVirtual &&
        nodeType(byId.get(edge.source)) !== 'reference' &&
        edge.source === draft.sourceNodeId,
    );
  const lists = {
    textList: inputs.textList,
    imageList: inputs.imageList,
    videoList: inputs.videoList,
    audioList: inputs.audioList,
  };
  let nextParams;
  if (params.segmentRemakeLock === true && draft?.phase === 'submitted' && !hasSource) {
    const { segmentRemakeDraft: _draft, segmentRemakeLock: _lock, ...retained } = params;
    nextParams = { ...retained, prompt: prompt.replace(segmentRangeToken, ''), ...lists };
  } else if (params.pictureEditLock && inputs.videoList.length === 0)
    nextParams = {
      prompt: '',
      model: params.model ?? '',
      modeType: '',
      count: 1,
      settings: {},
      ...lists,
    };
  else nextParams = { ...params, prompt, ...lists };
  let next = { ...target, data: { ...target.data, params: nextParams } };
  next = recalculateMaterialStyles(next, incoming, byId);
  return recalculateLensEffects(next, incoming, byId);
}
