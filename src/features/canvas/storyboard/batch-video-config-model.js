import { fieldGroups, fieldKeys, resolveGeneratorParams, storeKey } from '../generator/schema.js';
import { extractStoryboardRatioFromNodeParams } from '../domain/storyboard-grid-model.js';
import { storyboardClosestRatio } from './video-model.js';

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const failure = (reason) => ({
  valid: false,
  enabled: false,
  reason,
  rows: [],
  children: [],
  shots: [],
  readyCount: 0,
});
const readyUrl = (url) =>
  Array.isArray(url) && url.some((entry) => typeof entry === 'string' && entry.trim());

/** Source e6/eX (open) and eZ/eX (submit) have distinct direct-child scan orders. */
export function resolveStoryboardBatchVideoShots({ nodes, groupId, phase = 'open' } = {}) {
  if (!Array.isArray(nodes) || !['open', 'submit'].includes(phase)) return failure('invalid-input');
  const lookup = new Map();
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || lookup.has(node.id))
      return failure('invalid-node-identity');
    lookup.set(node.id, node);
  }
  const group = lookup.get(groupId),
    data = group?.data;
  if (!group || group.type !== 'group' || !object(data)) return failure('no-source');
  if (
    !data.sourceScriptNodeId ||
    data.sourceScriptVersion === 'v2' ||
    data.storyboardGroupType === 'video' ||
    (data.standaloneStoryboardImageGrid && data.storyboardGroupType === 'image')
  )
    return failure('not-v1-image-group');
  const script = lookup.get(data.sourceScriptNodeId);
  if (!script || !object(script.data)) return failure('no-script');
  const sourceRows = script.data.rows ?? [];
  if (!Array.isArray(sourceRows) || sourceRows.some((row) => !object(row)))
    return failure('invalid-rows');
  const children = nodes.filter((node) => node.parentId === groupId && node.type === 'image');
  if (children.some((node) => node.data != null && !object(node.data)))
    return failure('invalid-image-data');
  if (phase === 'submit') {
    if (children.some((node) => node.data?.name != null && typeof node.data.name !== 'string'))
      return failure('invalid-image-name');
    children.sort((a, b) =>
      (a.data?.name ?? '').localeCompare(b.data?.name ?? '', undefined, { numeric: true }),
    );
  }
  const byRow = new Map();
  for (const child of children) {
    const id = child.data?.scriptRowHiddenUuid;
    if (!id || !readyUrl(child.data?.url)) continue;
    // Source's first winner can differ between open and submit. This malformed
    // identity is rejected atomically instead of silently binding another image.
    if (byRow.has(id)) return failure('duplicate-image-hidden-uuid');
    byRow.set(id, child);
  }
  const rowIds = new Set(),
    shots = [];
  for (const row of sourceRows) {
    if (!row.hiddenUuid) continue;
    if (rowIds.has(row.hiddenUuid)) return failure('duplicate-row-hidden-uuid');
    rowIds.add(row.hiddenUuid);
    const child = byRow.get(row.hiddenUuid);
    if (child) shots.push({ row, child, firstImageUrl: child.data.url?.[0] || '' });
  }
  const first = shots[0]?.child.data;
  const replaced = script.data.linkedImageGroupId && script.data.linkedImageGroupId !== groupId;
  return {
    valid: true,
    enabled: !replaced && shots.length > 0,
    reason: replaced ? 'stale-image-group' : shots.length ? '' : 'no-children',
    group,
    script,
    shots,
    rows: shots.map((shot) => shot.row),
    children: shots.map((shot) => shot.child),
    readyCount: shots.length,
    initialImageSettings: first?.params?.settings,
    firstChildDimensions:
      typeof first?.contentWidth === 'number' && typeof first?.contentHeight === 'number'
        ? { width: first.contentWidth, height: first.contentHeight }
        : undefined,
  };
}

/** The source support catalogue is not filtered to models with a loaded schema. */
export function storyboardBatchVideoModelKeys(support) {
  if (support == null) return [];
  if (
    !Array.isArray(support) ||
    support.some((item) => !object(item) || typeof item.modelKey !== 'string' || !item.modelKey)
  )
    return null;
  const keys = support.map((item) => item.modelKey);
  return new Set(keys).size === keys.length ? keys : null;
}

export function resolveStoryboardBatchVideoDefaultModel({ models, support } = {}) {
  const keys = storyboardBatchVideoModelKeys(support);
  if (!keys) return null;
  return keys.includes('kling-v3-omni')
    ? 'kling-v3-omni'
    : (keys[0] ?? models?.default?.video ?? '');
}

/** eM uses key presence, including a zero-capacity mode, rather than incoming inference. */
export function resolveStoryboardBatchVideoMode(schema) {
  const items = schema?.properties?.modeType?.items;
  return object(items) && 'singleImage2video' in items
    ? 'singleImage2video'
    : object(items) && 'image2video' in items
      ? 'image2video'
      : 'text2video';
}

function ratioKey(schema) {
  return Object.keys(schema?.properties ?? {}).find((key) => key.startsWith('ratio'));
}

/** Exact useState initializer: raw schema ratio key, no enum/store-key normalization. */
export function initialStoryboardBatchVideoConfig({
  models,
  support,
  initialImageSettings,
  firstChildDimensions,
} = {}) {
  if (initialImageSettings != null && !object(initialImageSettings)) return null;
  const model = resolveStoryboardBatchVideoDefaultModel({ models, support });
  if (model == null) return null;
  const settings = initialImageSettings?.resolution
    ? { resolution: initialImageSettings.resolution }
    : {};
  const ratio =
    extractStoryboardRatioFromNodeParams({ settings: initialImageSettings }) ??
    storyboardClosestRatio(firstChildDimensions?.width, firstChildDimensions?.height);
  const key = ratioKey(models?.videoModels?.[model]);
  if (ratio && key) settings[key] = ratio;
  return { model, modeType: 'singleImage2video', settings };
}

/** Source effect's !enum short-circuit deliberately does not refill anything. */
export function refillStoryboardBatchVideoRatio({ config, schema, firstChildDimensions } = {}) {
  if (!object(config) || (config.settings != null && !object(config.settings))) return null;
  const ratio = storyboardClosestRatio(firstChildDimensions?.width, firstChildDimensions?.height);
  const key = ratioKey(schema),
    property = schema?.properties?.[key];
  if (!ratio || !key || !Array.isArray(property?.enum) || config.settings?.[key]) return config;
  const accepted = property.enum
    .map((entry) => (typeof entry === 'string' ? entry : entry?.value))
    .includes(ratio);
  return accepted ? { ...config, settings: { ...config.settings, [key]: ratio } } : config;
}

function advancedGroups(schema, modeType) {
  const config = schema?.config?.advancedSettings;
  const groups = Array.isArray(config)
    ? fieldGroups(config)
    : object(config) && Object.hasOwn(config, modeType)
      ? fieldGroups(config, modeType)
      : fieldGroups([]);
  return groups.map((group) => ({
    ...group,
    fields: group.fields.filter(
      (key) =>
        schema.properties?.[key]?.enable !== false && schema.properties?.[key]?.batch === true,
    ),
  }));
}

/** Ordinary settings are untouched. The UI suppresses count; no invented count schema. */
export function storyboardBatchVideoSettingsSchema(schema, modeType) {
  if (!object(schema)) return null;
  return {
    ...schema,
    config: { ...schema.config, advancedSettings: advancedGroups(schema, modeType) },
  };
}

function allAdvancedKeys(schema) {
  const config = schema?.config?.advancedSettings;
  if (Array.isArray(config)) return fieldKeys(config);
  if (!object(config)) return [];
  return [...new Set(Object.keys(config).flatMap((mode) => fieldKeys(config, mode)))];
}

function sameRecord(a, b) {
  if (a === b) return true;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && Object.is(a[key], b[key]))
  );
}

function normalizeConfig(config, schema, sourceSchema, previousModel) {
  const modelSwitch = previousModel != null && previousModel !== config.model;
  const advanced = { ...config.advancedSettings };
  const activeKeys = fieldKeys(schema.config?.advancedSettings, config.modeType);
  const accepted = new Set(
    activeKeys.flatMap((key) => {
      const property = schema.properties?.[key],
        stored = storeKey(key, property);
      if (modelSwitch && property?.resetOnModelSwitch === true) {
        delete advanced[stored];
        delete advanced[`_${stored}_meta`];
      }
      return property?.component === 'voiceCard' ? [stored, `_${stored}_meta`] : [stored];
    }),
  );
  // The full unfiltered source catalogue is supplied separately below.
  const known = new Set(
    allAdvancedKeys(sourceSchema).flatMap((key) => {
      const property = schema.properties?.[key],
        stored = storeKey(key, property);
      return property?.component === 'voiceCard' ? [stored, `_${stored}_meta`] : [stored];
    }),
  );
  for (const key of Object.keys(advanced))
    if (known.has(key) && !accepted.has(key)) delete advanced[key];
  // eM declares its local mode by key presence, even when the generic node
  // resolver would discard zero-capacity limits. Keep rules/defaults in that
  // source mode without changing the shared schema or inventing media inputs.
  const declared = schema.config?.textModes ?? [];
  const normalizationSchema = declared.includes(config.modeType)
    ? schema
    : {
        ...schema,
        config: { ...schema.config, textModes: [...declared, config.modeType] },
      };
  const normalized = resolveGeneratorParams(
    {
      prompt: '',
      model: config.model,
      modeType: config.modeType,
      count: 1,
      settings: config.settings ?? {},
      advancedSettings: advanced,
    },
    normalizationSchema,
    'video',
    { imageList: 0, videoList: 0, audioList: 0 },
  );
  const settings = { ...config.settings, ...normalized.settings };
  const advancedSettings = { ...advanced, ...normalized.advancedSettings };
  const sameSettings = sameRecord(config.settings ?? {}, settings);
  const sameAdvanced = sameRecord(config.advancedSettings ?? {}, advancedSettings);
  return sameSettings && sameAdvanced
    ? config
    : {
        ...config,
        ...(!sameSettings ? { settings } : {}),
        ...(!sameAdvanced ? { advancedSettings } : {}),
      };
}

/** Local effects only by default; explicit normalization reuses the common pure rules. */
export function reconcileStoryboardBatchVideoConfig({
  config,
  models,
  support,
  firstChildDimensions,
  normalize = false,
  previousModel,
} = {}) {
  if (
    !object(config) ||
    (config.settings != null && !object(config.settings)) ||
    (config.advancedSettings != null && !object(config.advancedSettings))
  )
    return null;
  const keys = storyboardBatchVideoModelKeys(support),
    defaultModel = resolveStoryboardBatchVideoDefaultModel({ models, support });
  if (!keys || defaultModel == null) return null;
  let next =
    keys.length && (!config.model || !keys.includes(config.model))
      ? { ...config, model: defaultModel }
      : config;
  const activeModel = next.model || defaultModel,
    schema = models?.videoModels?.[activeModel];
  const modeType = resolveStoryboardBatchVideoMode(schema);
  if (next.modeType !== modeType) next = { ...next, modeType };
  next = refillStoryboardBatchVideoRatio({ config: next, schema, firstChildDimensions });
  if (!next || !normalize || !schema) return next;
  return normalizeConfig(
    next,
    storyboardBatchVideoSettingsSchema(schema, modeType),
    schema,
    previousModel,
  );
}

/** Switching changes local model only, preserving ordinary settings for schema refill. */
export function switchStoryboardBatchVideoModel({ config, model, ...context } = {}) {
  if (!object(config) || typeof model !== 'string' || !model) return null;
  return reconcileStoryboardBatchVideoConfig({
    ...context,
    config: model === config.model ? config : { ...config, model },
    previousModel: config.model,
  });
}

/** Exact per-video calculator input. IDs are injected; this model performs no I/O. */
export function buildStoryboardBatchVideoFeeRequest({
  config,
  schema,
  nodeId,
  projectId,
  requestId,
} = {}) {
  if (
    !object(config) ||
    typeof config.model !== 'string' ||
    !object(config.settings ?? {}) ||
    typeof requestId !== 'string' ||
    !requestId
  )
    return null;
  return {
    params: {
      prompt: '',
      model: config.model,
      modeType: resolveStoryboardBatchVideoMode(schema),
      count: 1,
      settings: config.settings ?? {},
    },
    metadata: { node_id: nodeId ?? '', project_id: projectId ?? '' },
    provider: schema?.modelVendor || '',
    model: config.model,
    taskType: 'video',
    requestId,
  };
}

/** Source multiplies a numeric fee and differing original price by the ready-row count. */
export function projectStoryboardBatchVideoFee({ feeResult, totalCount = 1 } = {}) {
  const power = feeResult?.power ?? '-';
  if (typeof power !== 'number') return { cost: String(power), originalCost: undefined };
  const original = feeResult?.originalPrice;
  if (original == null || original === power)
    return { cost: power * totalCount, originalCost: undefined };
  const cost = totalCount === 1 ? power : power * totalCount;
  const originalCost = totalCount === 1 ? original : original * totalCount;
  return { cost, originalCost: originalCost === cost ? undefined : originalCost };
}

/** Source notify strings plus explicit local corrupt-document diagnostics. */
export function storyboardBatchVideoReasonLabel(reason) {
  if (!reason) return undefined;
  const labels = {
    'stale-image-group': '当前分镜组已与脚本解除关联或被新组取代，请使用最新分镜组',
    'no-children': '没有可用于生成视频的分镜图',
    'not-v1-image-group': '当前分组不支持此批量视频配置',
    'no-source': '未找到分镜组关联的脚本，请检查分组关联',
    'no-script': '未找到分镜组关联的脚本，请检查分组关联',
    'invalid-input': '分镜数据无效，请检查配置',
    'invalid-node-identity': '分镜数据无效，请检查节点标识',
    'invalid-rows': '分镜数据无效，请检查脚本行',
    'invalid-image-data': '分镜数据无效，请检查图片数据',
    'invalid-image-name': '分镜数据无效，请检查图片名称',
    'duplicate-image-hidden-uuid': '分镜数据无效，请检查重复的镜头标识',
    'duplicate-row-hidden-uuid': '分镜数据无效，请检查重复的镜头标识',
  };
  return Object.hasOwn(labels, reason) ? labels[reason] : '批量生成视频组失败，请稍后重试';
}
