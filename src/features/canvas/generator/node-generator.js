import { generatorValidation, resolveGeneratorParams } from './schema.js';
import {
  collectGeneratorMediaInputs,
  generatorMediaModes,
  generatorSettingLocks,
  inferGeneratorMediaMode,
  mergeGeneratorMediaSchema,
  validateGeneratorMediaInputs,
} from './media-input-model.js';

export function withGeneratorMediaMetadata(inputs, metadata = {}) {
  return Object.fromEntries(
    ['imageList', 'videoList', 'audioList'].map((key) => [
      key,
      (inputs[key] || []).map((ref) => ({ ...ref, ...metadata[ref.url] })),
    ]),
  );
}

/** Metadata probing, renames and parameter edits do not create a new incoming resource. */
export function generatorIncomingIdentity(inputs) {
  return JSON.stringify(
    ['imageList', 'videoList', 'audioList'].map((key) =>
      (inputs[key] || []).map((ref) => [ref.nodeId || '', ref.url, ref.mediaType]),
    ),
  );
}

/** Inspector and submit share one model/mode/constraint/lock interpretation. */
export function resolveNodeGenerator(
  node,
  nodes,
  edges,
  models,
  { metadata = {}, syncIncoming = false } = {},
) {
  const type = node?.type;
  const modelList = models?.[type + 'Models'] || {};
  const model = node?.data?.params?.model || models?.default?.[type] || '';
  const template = mergeGeneratorMediaSchema(modelList[model], node?.data?.extraConfig);
  const schema = template.schema;
  const inputMedia = withGeneratorMediaMetadata(
    collectGeneratorMediaInputs({ target: node, nodes, edges }),
    metadata,
  );
  const inputCounts = Object.fromEntries(
    Object.entries(inputMedia).map(([key, values]) => [key, values.length]),
  );
  const initial = {
    ...node?.data?.params,
    model,
    prompt: node?.data?.params?.prompt ?? node?.data?.text ?? '',
  };
  const mediaModes = generatorMediaModes(schema, inputMedia, { type });
  const selectedModeUsable = mediaModes.visible.some(
    (item) => item.key === initial.modeType && item.enabled,
  );
  const lockedMode =
    initial.pictureEditLock ||
    initial.segmentRemakeLock ||
    template.modelKeys !== null ||
    schema?.properties?.motionImitation === true ||
    schema?.properties?.digitalHuman === true;
  const modeType =
    !syncIncoming || lockedMode || (type === 'video' && selectedModeUsable)
      ? initial.modeType
      : inferGeneratorMediaMode(schema, inputMedia, { type, currentModeType: initial.modeType });
  const resolved = schema
    ? resolveGeneratorParams({ ...initial, modeType }, schema, type, inputCounts)
    : initial;
  const locks = generatorSettingLocks(schema, resolved, {
    inputs: inputMedia,
    configLocked: template.configLocked,
  });
  const params = schema
    ? {
        ...resolved,
        count: locks.count,
        settings: { ...resolved.settings, ...locks.settingsPatch },
      }
    : initial;
  const mediaValidation = validateGeneratorMediaInputs(schema, params.modeType, inputMedia, {
    type,
    prompt: params.prompt,
    scene: params.scene,
    originImage: params.originImage,
  });
  const promptError = generatorValidation(params, schema, inputCounts);
  const error =
    (template.modelKeys && !template.modelKeys.includes(model)
      ? '当前模型不在此模板允许范围内，请选择可用模型'
      : '') ||
    promptError ||
    mediaValidation.blockMessages[0] ||
    (mediaValidation.unresolved.length || locks.unresolved.length
      ? '参考素材元数据尚未验证，请读取素材后重试'
      : '');
  return {
    modelList,
    model,
    schema,
    params,
    inputMedia,
    inputCounts,
    mediaModes,
    mediaValidation,
    locks,
    modelKeys: template.modelKeys,
    configLocked: template.configLocked,
    error,
  };
}
