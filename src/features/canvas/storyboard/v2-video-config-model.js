import { extractStoryboardRatioFromNodeParams } from '../domain/storyboard-grid-model.js';

export const SCRIPT_V2_VIDEO_MODE = 'mixed2video';
const inputCounts = { videoList: 0, imageList: 1, audioList: 0 };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const schemaFor = (models, key) => models?.videoModels?.[key];
const storedKey = (property, key) => property?.originalField ?? key;
const ratioField = (key, property) =>
  property?.originalField === 'ratio' || key === 'ratio' || /^ratio_\d+_\d+$/.test(key);
const enumValue = (entry) =>
  typeof entry === 'string' || typeof entry === 'number' ? entry : entry?.value;
const failure = (reason, state) => ({ valid: false, state, reason });

/** Source eB: a count above the maximum remains usable; the panel blocks those rows. */
export function resolveScriptV2VideoCapability(schema, requiredRefs) {
  const limits = schema?.properties?.modeType?.items?.mixed2video;
  const invalid = (maxRefs = 0) => ({
    usable: false,
    modeType: undefined,
    maxRefs,
    fullCoverage: false,
    willTruncate: false,
  });
  if (
    !Array.isArray(limits) ||
    limits.length < 2 ||
    !Number.isFinite(limits[0]) ||
    !Number.isFinite(limits[1]) ||
    limits[1] <= 0 ||
    limits[1] < limits[0]
  )
    return invalid();
  const imageMax = schema?.properties?.modeType?.mixed2videoConfig?.imageMax;
  const maximum = Math.max(
    0,
    Number.isFinite(imageMax) ? Math.min(limits[1], imageMax) : limits[1],
  );
  if (maximum <= 0) return invalid();
  const count = Number.isFinite(requiredRefs) ? Math.max(0, requiredRefs) : 0;
  if (count > 0 && count < limits[0]) return invalid(maximum);
  return {
    usable: true,
    modeType: SCRIPT_V2_VIDEO_MODE,
    maxRefs: maximum,
    fullCoverage: count <= maximum,
    willTruncate: count > maximum,
  };
}

export function extractScriptV2VideoDurationConstraint(schema) {
  const property = schema?.properties?.duration;
  if (!property) return null;
  const values = Array.isArray(property.enum)
    ? property.enum
        .map((entry) => (typeof entry === 'number' ? entry : entry?.value))
        .filter((value) => typeof value === 'number' && Number.isFinite(value))
    : [];
  if (values.length) return { type: 'enum', values };
  if (
    !Number.isFinite(property.min) ||
    !Number.isFinite(property.max) ||
    property.max < property.min
  )
    return null;
  return {
    type: 'slider',
    min: property.min,
    max: property.max,
    step: Number.isFinite(property.step) && property.step > 0 ? property.step : 1,
  };
}

export function isScriptV2VideoDurationSupported(value, constraint) {
  if (!Number.isFinite(value)) return false;
  if (!constraint) return true;
  if (constraint.type === 'enum') return constraint.values.includes(value);
  if (value < constraint.min || value > constraint.max) return false;
  const offset = (value - constraint.min) / constraint.step;
  return Math.abs(offset - Math.round(offset)) < 1e-9;
}

export function describeScriptV2VideoDurationConstraint(constraint) {
  return !constraint
    ? '不限'
    : constraint.type === 'enum'
      ? constraint.values.map((value) => `${value}s`).join(' / ')
      : `${constraint.min}-${constraint.max}s，步长 ${constraint.step}s`;
}

function resolveDisable(value, language) {
  const trim = (text) => (typeof text === 'string' ? text.trim() || undefined : undefined);
  const reason = typeof value === 'string' ? trim(value) : undefined;
  const record = object(value) && Object.keys(value).length > 0;
  return {
    disabled: value === true || !!reason || record,
    disabledReason: record ? (trim(value[language]) ?? trim(value.en)) : reason,
  };
}

/** Source rc filters malformed entries, ru uses the last metadata entry per key. */
export function resolveScriptV2VideoCatalogue({
  models,
  support,
  requiredRefs = 0,
  currentModel,
  language = 'zh',
} = {}) {
  if (support != null && !Array.isArray(support))
    return { valid: false, reason: 'invalid-support', keys: [], options: [] };
  const items = (support ?? []).filter((entry) => typeof entry?.modelKey === 'string');
  // A duplicate catalogue key cannot be represented by stable local menu identity.
  if (new Set(items.map((entry) => entry.modelKey)).size !== items.length)
    return { valid: false, reason: 'duplicate-support-key', keys: [], options: [] };
  const metadata = new Map(items.map((entry) => [entry.modelKey, entry]));
  const keys = items
    .filter(
      (entry) =>
        resolveScriptV2VideoCapability(schemaFor(models, entry.modelKey), requiredRefs).usable,
    )
    .map((entry) => entry.modelKey);
  const defaultModel = keys.length ? keys[0] : models?.default?.video;
  const optionKeys = keys.length || !currentModel ? keys : [currentModel];
  const options = optionKeys.map((key) => {
    const entry = metadata.get(key),
      schema = schemaFor(models, key);
    return {
      value: key,
      label:
        entry?.modelName ?? entry?.displayText ?? schema?.displayText ?? schema?.modelName ?? key,
      icon: entry?.icon,
      disable: entry?.disable,
      ...resolveDisable(entry?.disable, language),
    };
  });
  return { valid: true, reason: '', keys, defaultModel, options };
}

function fieldKeys(schema) {
  const config = schema?.config?.settings;
  const keys = Array.isArray(config)
    ? config
    : (config?.[SCRIPT_V2_VIDEO_MODE] ?? config?.text2video ?? []);
  return Array.isArray(keys) ? keys : [];
}

function forceSound(settings, schema) {
  if (!('enableSound' in (schema?.properties ?? {}))) return settings;
  const key = storedKey(schema.properties.enableSound, 'enableSound');
  return settings[key] === 'on' ? settings : { ...settings, [key]: 'on' };
}

function defaults(schema) {
  const settings = {};
  for (const key of fieldKeys(schema)) {
    const property = schema?.properties?.[key];
    if (property?.default !== undefined) settings[storedKey(property, key)] = property.default;
  }
  return forceSound(settings, schema);
}

function ratios(schema) {
  const values = new Set();
  for (const key of fieldKeys(schema)) {
    const property = schema?.properties?.[key];
    if (!key.startsWith('ratio') || !Array.isArray(property?.enum)) continue;
    for (const entry of property.enum) {
      const value = enumValue(entry);
      if (typeof value === 'string' && /^\d+:\d+$/.test(value.trim())) values.add(value);
    }
  }
  return values;
}

function inheritRatio(settings, schema, initialImageSettings) {
  const ratio = extractStoryboardRatioFromNodeParams({ settings: initialImageSettings });
  if (!ratio) return settings;
  const next = { ...settings };
  for (const [key, property] of Object.entries(schema?.properties ?? {})) {
    if (
      key.startsWith('ratio') &&
      typeof property?.default === 'string' &&
      /^\d+:\d+$/.test(property.default.trim()) &&
      Array.isArray(property.enum) &&
      property.enum
        .map((entry) =>
          typeof entry === 'string' || typeof entry === 'number' ? String(entry) : entry?.value,
        )
        .filter((value) => typeof value === 'string')
        .includes(ratio)
    )
      next[storedKey(property, key)] = ratio;
  }
  return next;
}

function initialConfig(model, schema, initialImageSettings) {
  const advancedSettings = {},
    property = schema?.properties?.autoCompliance;
  if (property && property.enable !== false && property.default !== undefined)
    advancedSettings[storedKey(property, 'autoCompliance')] = property.default;
  return {
    model,
    modeType: SCRIPT_V2_VIDEO_MODE,
    settings: inheritRatio(defaults(schema), schema, initialImageSettings),
    advancedSettings,
  };
}

function switchConfig(config, model, schema, initialImageSettings) {
  const next = initialConfig(model, schema, initialImageSettings),
    ratio = config.settings?.ratio;
  if (typeof ratio === 'string' && ratios(schema).has(ratio))
    next.settings = { ...defaults(schema), ratio };
  return next;
}

function matches(rule, values) {
  for (const [key, expected] of Object.entries(rule.when ?? {})) {
    const actual = key === 'modeType' ? SCRIPT_V2_VIDEO_MODE : values[key];
    if (Array.isArray(expected) ? !expected.includes(actual) : actual !== expected) return false;
  }
  for (const [key, expected] of Object.entries(rule.inputWhen ?? {}))
    if (expected === 'notEmpty' && (inputCounts[key] ?? 0) <= 0) return false;
  return true;
}

/** Source module 440398 differs from the generic generator rule sanitizer/fallback ordering. */
function evaluateRules(schema, settings) {
  const values = {};
  for (const [key, property] of Object.entries(schema?.properties ?? {})) {
    const stored = storedKey(property, key);
    if (stored in settings) values[key] = settings[stored];
  }
  const sanitized = (Array.isArray(schema?.settingsRules) ? schema.settingsRules : []).filter(
    (rule) =>
      object(rule) &&
      ((Array.isArray(rule.conflict) && rule.conflict.length >= 2) ||
        object(rule.when) ||
        object(rule.inputWhen)) &&
      (rule.disable === undefined || object(rule.disable)) &&
      (rule.override === undefined || object(rule.override)),
  );
  const expanded = sanitized.flatMap((rule) => {
    if (!Array.isArray(rule.conflict) || rule.conflict.length < 2) return [rule];
    return rule.conflict.map((target, index) => ({
      when: Object.fromEntries(
        rule.conflict
          .filter((_, other) => other !== index)
          .map((entry) => [
            entry.field,
            entry.values.length === 1 ? entry.values[0] : entry.values,
          ]),
      ),
      disable: { [target.field]: target.values },
      fallback: rule.fallback,
      forModeTypes: rule.forModeTypes,
      message: rule.message,
      messageI18nKey: rule.messageI18nKey,
    }));
  });
  const disabledMap = {},
    fallbacks = {},
    messages = {},
    messageI18nKeys = {},
    overrides = {};
  for (const rule of expanded) {
    if (
      (rule.forModeTypes?.length && !rule.forModeTypes.includes(SCRIPT_V2_VIDEO_MODE)) ||
      !matches(rule, values)
    )
      continue;
    for (const [key, items] of Object.entries(rule.disable ?? {})) {
      if (!Array.isArray(items)) continue;
      disabledMap[key] ??= new Set();
      for (const value of items) disabledMap[key].add(value);
      if (rule.message && !messages[key]) messages[key] = rule.message;
      if (rule.messageI18nKey && !messageI18nKeys[key]) messageI18nKeys[key] = rule.messageI18nKey;
    }
    for (const [key, override] of Object.entries(rule.override ?? {})) {
      if (override === null || typeof override !== 'object') continue;
      overrides[key] = { ...overrides[key], ...override };
      if (rule.message && !messages[key]) messages[key] = rule.message;
      if (rule.messageI18nKey && !messageI18nKeys[key]) messageI18nKeys[key] = rule.messageI18nKey;
    }
  }
  for (const [key, disabled] of Object.entries(disabledMap)) {
    if (!disabled.has(values[key])) continue;
    // Source fallback finder does not repeat the forModeTypes predicate.
    const rule = expanded.find(
      (rule) => rule.disable?.[key] && rule.fallback?.[key] !== undefined && matches(rule, values),
    );
    if (rule) fallbacks[key] = rule.fallback[key];
  }
  return { disabledMap, fallbacks, messages, messageI18nKeys, overrides, values };
}

function applyFallbacks(config, schema) {
  const rules = evaluateRules(schema, config.settings ?? {}),
    fallbacks = { ...rules.fallbacks },
    settings = config.settings ?? {};
  for (const key of fieldKeys(schema)) {
    const disabled = rules.disabledMap[key];
    if (!disabled?.has(rules.values[key]) || fallbacks[key] !== undefined) continue;
    const accepted = schema?.properties?.[key]?.enum?.find((entry) => {
      const value = enumValue(entry);
      return value !== undefined && !disabled.has(value);
    });
    const value = enumValue(accepted);
    if (value !== undefined) fallbacks[key] = value;
  }
  const patch = {};
  for (const [key, value] of Object.entries(fallbacks)) {
    const property = schema?.properties?.[key];
    if (ratioField(key, property)) continue;
    const stored = storedKey(property, key);
    if (settings[stored] !== value) patch[stored] = value;
  }
  return Object.keys(patch).length ? { ...config, settings: { ...settings, ...patch } } : config;
}

function sameRecord(left, right) {
  if (left === right) return true;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
function sameCollection(left, right) {
  if (left.size !== right.size) return false;
  if (!(left instanceof Map)) return [...left].every((entry) => right.has(entry));
  const entries = [...right];
  return [...left].every(
    ([key, value], index) => entries[index][0] === key && Object.is(entries[index][1], value),
  );
}
function validRows(rows) {
  if (!Array.isArray(rows) || rows.some((row) => !object(row))) return 'invalid-rows';
  const seen = new Set();
  for (const row of rows) {
    if (!row.hiddenUuid) continue;
    if (typeof row.hiddenUuid !== 'string') return 'invalid-row-hidden-uuid';
    if (seen.has(row.hiddenUuid)) return 'duplicate-row-hidden-uuid';
    seen.add(row.hiddenUuid);
  }
  return '';
}
function selectedRequiredRefs(selected, referenceDescription, fallback) {
  if (referenceDescription?.refCounts instanceof Map)
    return Math.max(0, ...[...selected].map((id) => referenceDescription.refCounts.get(id) ?? 0));
  return (
    fallback ?? referenceDescription?.requiredRefs ?? referenceDescription?.maxRequiredRefs ?? 0
  );
}

function settle({
  state,
  models,
  support,
  requiredRefs,
  referenceDescription,
  initialImageSettings,
  language,
}) {
  const count = selectedRequiredRefs(state.selectedHiddenUuids, referenceDescription, requiredRefs);
  let catalogue = resolveScriptV2VideoCatalogue({
    models,
    support,
    requiredRefs: count,
    currentModel: state.config.model,
    language,
  });
  if (!catalogue.valid) return failure(catalogue.reason, state);
  let config = state.config;
  if (catalogue.keys.length && !catalogue.keys.includes(config.model))
    config = initialConfig(
      catalogue.defaultModel,
      schemaFor(models, catalogue.defaultModel),
      initialImageSettings,
    );
  catalogue = resolveScriptV2VideoCatalogue({
    models,
    support,
    requiredRefs: count,
    currentModel: config.model,
    language,
  });
  if (config.model && catalogue.options.find((option) => option.value === config.model)?.disabled) {
    const option = catalogue.options.find((entry) => !entry.disabled);
    if (option && option.value !== config.model)
      config = switchConfig(
        config,
        option.value,
        schemaFor(models, option.value),
        initialImageSettings,
      );
  }
  const schema = schemaFor(models, config.model),
    snapshots = [];
  // This settles successive source effect commits. Cyclic malformed rules fail atomically.
  for (;;) {
    const next = applyFallbacks(config, schema);
    if (next === config) break;
    if (snapshots.some((snapshot) => sameRecord(snapshot, next.settings)))
      return failure('cyclic-settings-rules', state);
    snapshots.push(config.settings);
    config = next;
    if (snapshots.length > Math.max(32, Object.keys(schema?.properties ?? {}).length * 4))
      return failure('cyclic-settings-rules', state);
  }
  return { valid: true, reason: '', state: config === state.config ? state : { ...state, config } };
}

export function createScriptV2VideoConfigState({
  rows,
  models,
  support,
  requiredRefs,
  referenceDescription,
  initialImageSettings,
  language = 'zh',
} = {}) {
  const reason = validRows(rows);
  if (reason) return failure(reason);
  if (initialImageSettings != null && !object(initialImageSettings))
    return failure('invalid-image-settings');
  const selectedHiddenUuids = new Set(rows.map((row) => row.hiddenUuid).filter(Boolean));
  const count = selectedRequiredRefs(selectedHiddenUuids, referenceDescription, requiredRefs);
  const catalogue = resolveScriptV2VideoCatalogue({
    models,
    support,
    requiredRefs: count,
    language,
  });
  if (!catalogue.valid) return failure(catalogue.reason);
  const state = {
    rows,
    config: initialConfig(
      catalogue.defaultModel,
      schemaFor(models, catalogue.defaultModel),
      initialImageSettings,
    ),
    selectedHiddenUuids,
    perShotDurations: new Map(
      rows.filter((row) => row.hiddenUuid).map((row) => [row.hiddenUuid, row.durationSeconds]),
    ),
    ratioEdited: false,
  };
  return settle({
    state,
    models,
    support,
    requiredRefs,
    referenceDescription,
    initialImageSettings,
    language,
  });
}

export function reconcileScriptV2VideoConfigState({ state, rows = state?.rows, ...context } = {}) {
  const reason = validRows(rows);
  if (reason) return failure(reason, state);
  if (
    !object(state?.config) ||
    !object(state.config.settings) ||
    !(state.selectedHiddenUuids instanceof Set) ||
    !(state.perShotDurations instanceof Map)
  )
    return failure('invalid-state', state);
  const ids = new Set(rows.map((row) => row.hiddenUuid).filter(Boolean)),
    selected = new Set([...state.selectedHiddenUuids].filter((id) => ids.has(id))),
    durations = new Map(
      rows
        .filter((row) => row.hiddenUuid)
        .map((row) => [
          row.hiddenUuid,
          state.perShotDurations.get(row.hiddenUuid) ?? row.durationSeconds,
        ]),
    );
  const next =
    rows === state.rows &&
    sameCollection(selected, state.selectedHiddenUuids) &&
    sameCollection(durations, state.perShotDurations)
      ? state
      : {
          ...state,
          rows,
          selectedHiddenUuids: sameCollection(selected, state.selectedHiddenUuids)
            ? state.selectedHiddenUuids
            : selected,
          perShotDurations: sameCollection(durations, state.perShotDurations)
            ? state.perShotDurations
            : durations,
        };
  return settle({ state: next, ...context });
}

export function changeScriptV2VideoConfigState({ state, command, ...context } = {}) {
  const base = reconcileScriptV2VideoConfigState({ state, ...context });
  if (!base.valid) return base;
  state = base.state;
  let next = state;
  const id = command?.hiddenUuid;
  switch (command?.type) {
    case 'model': {
      if (command.value === state.config.model) return base;
      const count = selectedRequiredRefs(
          state.selectedHiddenUuids,
          context.referenceDescription,
          context.requiredRefs,
        ),
        catalogue = resolveScriptV2VideoCatalogue({
          ...context,
          requiredRefs: count,
          currentModel: state.config.model,
        });
      const option = catalogue.options.find((entry) => entry.value === command.value);
      if (!option || option.disabled) return failure('unavailable-model', state);
      next = {
        ...state,
        config: switchConfig(
          state.config,
          command.value,
          schemaFor(context.models, command.value),
          context.initialImageSettings,
        ),
      };
      break;
    }
    case 'setting': {
      const schema = schemaFor(context.models, state.config.model),
        property = schema?.properties?.[command.field];
      if (!property || !fieldKeys(schema).includes(command.field))
        return failure('invalid-setting-field', state);
      const key = storedKey(property, command.field),
        settings = forceSound({ ...state.config.settings, [key]: command.value }, schema),
        ratioEdited = state.ratioEdited || key === 'ratio';
      if (sameRecord(settings, state.config.settings) && ratioEdited === state.ratioEdited)
        return base;
      next = { ...state, ratioEdited, config: { ...state.config, settings } };
      break;
    }
    case 'toggleRow': {
      if (!state.rows.some((row) => row.hiddenUuid && row.hiddenUuid === id))
        return failure('missing-row', state);
      const selected = new Set(state.selectedHiddenUuids);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      next = { ...state, selectedHiddenUuids: selected };
      break;
    }
    case 'toggleAll': {
      const ids = state.rows.map((row) => row.hiddenUuid).filter(Boolean);
      next = {
        ...state,
        selectedHiddenUuids:
          state.selectedHiddenUuids.size === ids.length ? new Set() : new Set(ids),
      };
      break;
    }
    case 'duration': {
      if (!state.rows.some((row) => row.hiddenUuid && row.hiddenUuid === id))
        return failure('missing-row', state);
      const value = typeof command.value === 'number' ? command.value : Number(command.value);
      if (!Number.isFinite(value)) return failure('invalid-duration', state);
      if (state.perShotDurations.get(id) === value) return base;
      next = { ...state, perShotDurations: new Map(state.perShotDurations).set(id, value) };
      break;
    }
    default:
      return failure('invalid-command', state);
  }
  return settle({ state: next, ...context });
}

export function projectScriptV2VideoConfig({
  state,
  models,
  support,
  requiredRefs,
  referenceDescription,
  initialImageSettings,
  language = 'zh',
} = {}) {
  if (
    !state ||
    !object(state.config) ||
    !object(state.config.settings) ||
    validRows(state.rows) ||
    !(state.selectedHiddenUuids instanceof Set) ||
    !(state.perShotDurations instanceof Map)
  )
    return { valid: false, reason: 'invalid-state', fields: [], options: [], canConfirm: false };
  const selected = state.selectedHiddenUuids,
    count = selectedRequiredRefs(selected, referenceDescription, requiredRefs),
    catalogue = resolveScriptV2VideoCatalogue({
      models,
      support,
      requiredRefs: count,
      currentModel: state.config.model,
      language,
    }),
    schema = schemaFor(models, state.config.model),
    capability = resolveScriptV2VideoCapability(schema, count),
    rules = evaluateRules(schema, state.config.settings ?? {}),
    allowedRatios = ratios(schema);
  for (const [key, disabled] of Object.entries(rules.disabledMap))
    if (ratioField(key, schema?.properties?.[key]))
      for (const value of disabled) if (typeof value === 'string') allowedRatios.delete(value);
  const ratioLocked = allowedRatios.size <= 1,
    currentRatio =
      typeof state.config.settings?.ratio === 'string' ? state.config.settings.ratio : undefined,
    inheritedRatio = extractStoryboardRatioFromNodeParams({ settings: initialImageSettings }),
    ratioHint =
      ratioLocked && currentRatio
        ? `该模型固定为 ${currentRatio}`
        : state.ratioEdited
          ? null
          : inheritedRatio
            ? `默认继承上游图组 ${inheritedRatio}，可手动修改`
            : null;
  const fields = fieldKeys(schema)
    .filter(
      (key) =>
        schema?.properties?.[key] &&
        !schema.properties[key].barOnly &&
        key !== 'enableSound' &&
        key !== 'duration',
    )
    .map((key) => {
      const property = schema.properties[key],
        stored = storedKey(property, key),
        ratio = ratioField(key, property);
      return {
        key,
        storedKey: stored,
        property,
        value: state.config.settings?.[stored],
        override: rules.overrides[key],
        disabledValues: rules.disabledMap[key] ?? new Set(),
        ratio,
        ratioLocked: ratio && ratioLocked,
      };
    });
  const durationConstraint = extractScriptV2VideoDurationConstraint(schema),
    durationDescription = describeScriptV2VideoDurationConstraint(durationConstraint),
    durationFixed =
      durationConstraint?.type === 'enum'
        ? durationConstraint.values.length === 1
        : durationConstraint?.type === 'slider' &&
          durationConstraint.min === durationConstraint.max,
    durationFixedValue = durationFixed
      ? durationConstraint.type === 'enum'
        ? durationConstraint.values[0]
        : durationConstraint.min
      : undefined,
    durationValidationByRow = new Map(),
    rowWarnings = new Map(),
    missingReferenceRows = [],
    overLimitRows = [],
    emptyPromptRows = [],
    durationErrorRows = [];
  const refCounts = referenceDescription?.refCounts;
  for (const row of state.rows) {
    if (!row.hiddenUuid) continue;
    const value = state.perShotDurations.get(row.hiddenUuid) ?? row.durationSeconds,
      validation = {
        supported: isScriptV2VideoDurationSupported(value, durationConstraint),
        message: `当前模型支持 ${durationDescription}，脚本表格为 ${row.durationSeconds}s，请调整后再生成`,
      },
      references =
        refCounts instanceof Map
          ? (refCounts.get(row.hiddenUuid) ?? 0)
          : (referenceDescription?.refsByRow?.get?.(row.hiddenUuid)?.references?.length ?? 0),
      emptyPrompt = !(row.videoMotionPrompt || row.plotDescription || '').trim();
    durationValidationByRow.set(row.hiddenUuid, validation);
    rowWarnings.set(row.hiddenUuid, {
      duration: validation.supported ? undefined : validation.message,
      missingReferences: references === 0,
      overReferenceLimit:
        capability.usable && capability.maxRefs > 0 && references > capability.maxRefs,
      emptyPrompt,
    });
    if (!selected.has(row.hiddenUuid)) continue;
    if (!validation.supported) durationErrorRows.push(row);
    if (references === 0) missingReferenceRows.push(row);
    if (capability.usable && capability.maxRefs > 0 && references > capability.maxRefs)
      overLimitRows.push(row);
    if (emptyPrompt) emptyPromptRows.push(row);
  }
  const assetsReady =
      referenceDescription?.assetsReady ?? referenceDescription?.assetReadiness?.ready ?? false,
    option = catalogue.options.find((entry) => entry.value === state.config.model),
    durationErrorMessage = durationErrorRows.length
      ? `${durationErrorRows.map((row, index) => (index === 0 ? `镜头${row.shotNumber}` : `镜头 ${row.shotNumber}`)).join('、')} 时长超过模型限制，请调整时长或切换模型`
      : undefined,
    missingReferenceMessage = missingReferenceRows.length
      ? `镜头 ${missingReferenceRows.map((row) => row.shotNumber).join('、')} 缺少已生成的角色、场景或道具参考图，脚本批量生视频仅支持全能参考模式，请先生成资产图后再创建视频生成器组`
      : undefined,
    overLimitMessage = overLimitRows.length
      ? `镜头 ${overLimitRows.map((row) => row.shotNumber).join('、')} 的资产参考图过多，超出当前模型上限（最多 ${capability.maxRefs} 张）。请减少这些镜头的参考资产，或切换支持更多参考图的视频模型`
      : undefined,
    confirmTooltip =
      durationErrorMessage ??
      missingReferenceMessage ??
      overLimitMessage ??
      (!assetsReady ? '请先生成所有资产图后再创建视频生成器组' : undefined) ??
      (emptyPromptRows.length
        ? '请先合成提示词后再创建视频生成器组'
        : '创建视频生成器组后，可在画布中整组执行批量生视频'),
    totalCount = state.rows.filter((row) => row.hiddenUuid).length,
    canConfirm =
      catalogue.valid &&
      referenceDescription?.valid !== false &&
      selected.size > 0 &&
      catalogue.keys.length > 0 &&
      catalogue.keys.includes(state.config.model) &&
      !option?.disabled &&
      !durationErrorRows.length &&
      !missingReferenceRows.length &&
      !overLimitRows.length &&
      assetsReady &&
      !emptyPromptRows.length;
  return {
    valid: catalogue.valid,
    reason: catalogue.reason,
    config: state.config,
    schema,
    catalogue,
    options: catalogue.options,
    fields,
    rules,
    capability,
    requiredRefs: count,
    ratioLocked,
    ratioHint,
    durationConstraint,
    durationDescription,
    durationFixed: !!durationFixed,
    durationFixedValue,
    durationValidationByRow,
    rowWarnings,
    selectedCount: selected.size,
    totalCount,
    allSelected: totalCount > 0 && selected.size === totalCount,
    someSelected: selected.size > 0 && selected.size < totalCount,
    missingReferenceRows,
    overLimitRows,
    emptyPromptRows,
    durationErrorRows,
    durationErrorMessage,
    missingReferenceMessage,
    overLimitMessage,
    assetsReady,
    canConfirm,
    confirmTooltip,
  };
}

/** Source eP passes three arguments; compliance/service ownership stays outside this model. */
export function buildScriptV2VideoConfirmPayload({ state, schema, requiredRefs } = {}) {
  if (
    !state ||
    !(state.selectedHiddenUuids instanceof Set) ||
    !(state.perShotDurations instanceof Map)
  )
    return null;
  const capability = resolveScriptV2VideoCapability(schema, requiredRefs),
    perShotDurations = new Map();
  for (const id of state.selectedHiddenUuids) {
    const value = state.perShotDurations.get(id);
    if (typeof value === 'number' && Number.isFinite(value)) perShotDurations.set(id, value);
  }
  return {
    config: {
      ...state.config,
      modeType: capability.usable ? SCRIPT_V2_VIDEO_MODE : state.config.modeType,
      modelSchema: schema,
    },
    perShotDurations,
    selectedHiddenUuids: new Set(state.selectedHiddenUuids),
  };
}
