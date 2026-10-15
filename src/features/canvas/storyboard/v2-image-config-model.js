const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const schemaFor = (models, key) => models?.imageModels?.[key];
const failure = (reason, state) => ({ valid: false, reason, state });

function resolveDisable(value, language) {
  const trim = (text) => (typeof text === 'string' ? text.trim() || undefined : undefined);
  const reason = typeof value === 'string' ? trim(value) : undefined;
  const localized = record(value) && Object.keys(value).length > 0;
  return {
    disabled: value === true || !!reason || localized,
    disabledReason: localized ? (trim(value[language]) ?? trim(value.en)) : reason,
  };
}

function labelFor(entry, schema) {
  if (typeof entry.modelName === 'string' && entry.modelName.length > 0) return entry.modelName;
  const text = schema?.displayText;
  return typeof text === 'string' && text.length > 0 ? text : entry.modelKey;
}

/** r3 only applies image2image's inclusive range when selected references exceed zero. */
export function resolveScriptV2ImageCatalogue({
  models,
  support,
  requiredRefs = 0,
  currentModel,
  language = 'zh',
} = {}) {
  const invalid = (reason) => ({ valid: false, reason, keys: [], options: [] });
  if (!Number.isInteger(requiredRefs) || requiredRefs < 0)
    return invalid('invalid-reference-counts');
  if (support != null && !Array.isArray(support)) return invalid('invalid-support');
  const items = support ?? [];
  if (items.some((entry) => !record(entry) || typeof entry.modelKey !== 'string'))
    return invalid('invalid-support');
  if (new Set(items.map((entry) => entry.modelKey)).size !== items.length)
    return invalid('duplicate-support-key');
  const entries = items.filter((entry) => {
    if (requiredRefs <= 0) return true;
    const limits = schemaFor(models, entry.modelKey)?.properties?.modeType?.items?.image2image;
    if (!Array.isArray(limits)) return false;
    const [minimum, maximum] = limits;
    return (
      typeof minimum === 'number' &&
      typeof maximum === 'number' &&
      minimum <= requiredRefs &&
      requiredRefs <= maximum
    );
  });
  const keys = entries.map((entry) => entry.modelKey),
    defaultModel = keys[0] ?? models?.default?.image,
    options = entries.map((entry) => ({
      value: entry.modelKey,
      label: labelFor(entry, schemaFor(models, entry.modelKey)),
      icon: entry.icon,
      disable: entry.disable,
      ...resolveDisable(entry.disable, language),
    }));
  return {
    valid: true,
    reason: '',
    keys,
    defaultModel,
    currentModel: currentModel || defaultModel,
    options,
  };
}

function defaultsFor(schema) {
  const configured = schema?.config?.settings ?? schema?.config?.setting ?? [],
    keys = Array.isArray(configured)
      ? configured
      : (configured?.text2image ?? configured?.image2image ?? []);
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) return null;
  return Object.fromEntries(
    keys
      .filter((key) => schema?.properties?.[key]?.default !== undefined)
      .map((key) => [key, schema.properties[key].default]),
  );
}

function configFor(model, models) {
  const settings = defaultsFor(schemaFor(models, model));
  return settings === null ? null : { model, modeType: 'text2image', settings };
}

function validRows(rows) {
  return Array.isArray(rows) && rows.every(record);
}

function validIndices(indices) {
  return (
    indices instanceof Set && [...indices].every((index) => Number.isInteger(index) && index >= 0)
  );
}

function validState(state) {
  return (
    validRows(state?.rows) &&
    record(state?.config) &&
    record(state.config.settings) &&
    validIndices(state.selectedIndices) &&
    validIndices(state.expandedIndices)
  );
}

function selectedReferenceCount(state, refCounts) {
  if (refCounts != null && !(refCounts instanceof Map)) return null;
  let maximum = 0;
  for (let index = 0; index < state.rows.length; index += 1) {
    if (!state.selectedIndices.has(index)) continue;
    const count = refCounts?.get(index) ?? 0;
    if (!Number.isInteger(count) || count < 0) return null;
    maximum = Math.max(maximum, count);
  }
  return maximum;
}

function settle({ state, models, support, refCounts, language }) {
  const requiredRefs = selectedReferenceCount(state, refCounts);
  if (requiredRefs === null) return failure('invalid-reference-counts', state);
  let config = state.config,
    catalogue = resolveScriptV2ImageCatalogue({
      models,
      support,
      requiredRefs,
      currentModel: config.model,
      language,
    });
  if (!catalogue.valid) return failure(catalogue.reason, state);
  // No candidate leaves the previous model intact, rather than installing a fallback.
  if (config.model && !catalogue.keys.includes(config.model) && catalogue.keys.length) {
    config = configFor(catalogue.keys[0], models);
    if (!config) return failure('invalid-default-fields', state);
    catalogue = resolveScriptV2ImageCatalogue({
      models,
      support,
      requiredRefs,
      currentModel: config.model,
      language,
    });
  }
  // The shared selector's disabled-option effect is independent of capability filtering.
  if (config.model && catalogue.options.find((entry) => entry.value === config.model)?.disabled) {
    const available = catalogue.options.find((entry) => !entry.disabled);
    if (available && available.value !== config.model) {
      config = configFor(available.value, models);
      if (!config) return failure('invalid-default-fields', state);
    }
  }
  return { valid: true, reason: '', state: config === state.config ? state : { ...state, config } };
}

/** Fresh r3 mount first opens with zero selected references, then settles all-selected effects. */
export function createScriptV2ImageConfigState({
  rows,
  initialSelected = rows,
  models,
  support,
  refCounts,
  language = 'zh',
} = {}) {
  if (!validRows(rows)) return failure('invalid-rows');
  if (!Array.isArray(initialSelected)) return failure('invalid-initial-selection');
  const catalogue = resolveScriptV2ImageCatalogue({ models, support, language }),
    config = configFor(catalogue.defaultModel, models);
  if (!catalogue.valid) return failure(catalogue.reason);
  if (!config) return failure('invalid-default-fields');
  return settle({
    state: {
      rows,
      config,
      selectedIndices: new Set(initialSelected.map((_, index) => index)),
      expandedIndices: new Set(),
    },
    models,
    support,
    refCounts,
    language,
  });
}

/** Open rows may change, but source selection/expansion remain raw index Sets without pruning. */
export function reconcileScriptV2ImageConfigState({ state, rows = state?.rows, ...context } = {}) {
  if (!validState(state)) return failure('invalid-state', state);
  if (!validRows(rows)) return failure('invalid-rows', state);
  return settle({ state: rows === state.rows ? state : { ...state, rows }, ...context });
}

function schemaLabel(entry, translate) {
  if (typeof translate === 'function' && entry.displayNameI18nKey) {
    const translated = translate(entry.displayNameI18nKey);
    if (translated && translated !== entry.displayNameI18nKey) return translated;
  }
  return entry.displayName;
}

function fieldsFor(schema, settings, translate) {
  const keys = schema?.config?.settings ?? [];
  // Two public Nebula schemas use mode objects. r3 calls .map and throws; no video flattening.
  if (!Array.isArray(keys)) return { valid: true, fields: [], visibleSettingsSupported: false };
  if (keys.some((key) => typeof key !== 'string'))
    return {
      valid: false,
      reason: 'invalid-setting-fields',
      fields: [],
      visibleSettingsSupported: false,
    };
  const fields = [];
  for (const key of keys) {
    const property = schema?.properties?.[key],
      items = property?.enum ?? [];
    if (!Array.isArray(items))
      return {
        valid: false,
        reason: 'invalid-setting-enum',
        fields: [],
        visibleSettingsSupported: false,
      };
    fields.push({
      key,
      type: property?.type ?? 'string',
      values: items.map((entry) => {
        if (typeof entry === 'string') return { value: entry, label: entry };
        if (entry !== null && typeof entry === 'object') {
          const value = entry.value ?? entry.key ?? String(entry);
          return {
            value,
            label: schemaLabel(entry, translate) || entry.label || entry.name || value,
          };
        }
        return { value: String(entry), label: String(entry) };
      }),
      originalField: property?.originalField,
      isAspect:
        property?.originalField === 'aspectRatio' ||
        key === 'aspectRatio' ||
        key.startsWith('ratio'),
      currentValue: settings[key] ?? '',
    });
  }
  return { valid: true, fields, visibleSettingsSupported: true };
}

export function changeScriptV2ImageConfigState({ state, command, ...context } = {}) {
  const base = reconcileScriptV2ImageConfigState({ state, ...context });
  if (!base.valid) return base;
  state = base.state;
  let next;
  switch (command?.type) {
    case 'model': {
      if (command.value === state.config.model) return base;
      const catalogue = resolveScriptV2ImageCatalogue({
          ...context,
          requiredRefs: selectedReferenceCount(state, context.refCounts),
        }),
        option = catalogue.options.find((entry) => entry.value === command.value);
      if (!option || option.disabled) return failure('unavailable-model', state);
      const config = configFor(command.value, context.models);
      if (!config) return failure('invalid-default-fields', state);
      next = { ...state, config };
      break;
    }
    case 'setting': {
      const fields = fieldsFor(
          schemaFor(context.models, state.config.model),
          state.config.settings,
          context.translate,
        ),
        field = fields.fields.find((entry) => entry.key === command.field);
      if (!field || !field.values.some((entry) => entry.value === command.value))
        return failure('unavailable-setting', state);
      if (state.config.settings[command.field] === command.value) return base;
      next = {
        ...state,
        config: {
          ...state.config,
          settings: { ...state.config.settings, [command.field]: command.value },
        },
      };
      break;
    }
    case 'toggleRow':
    case 'toggleExpanded': {
      if (
        !Number.isInteger(command.index) ||
        command.index < 0 ||
        command.index >= state.rows.length
      )
        return failure('missing-row', state);
      const key = command.type === 'toggleRow' ? 'selectedIndices' : 'expandedIndices',
        indices = new Set(state[key]);
      if (indices.has(command.index)) indices.delete(command.index);
      else indices.add(command.index);
      next = { ...state, [key]: indices };
      break;
    }
    case 'toggleAll': {
      if (state.rows.length === 0) return base;
      next = {
        ...state,
        selectedIndices:
          state.selectedIndices.size === state.rows.length
            ? new Set()
            : new Set(state.rows.map((_, index) => index)),
      };
      break;
    }
    default:
      return failure('invalid-command', state);
  }
  return settle({ state: next, ...context });
}

export function projectScriptV2ImageConfig({
  state,
  models,
  support,
  refCounts,
  language = 'zh',
  translate,
} = {}) {
  const invalid = (reason) => ({
    valid: false,
    reason,
    fields: [],
    options: [],
    canConfirm: false,
    visibleSettingsSupported: false,
  });
  if (!validState(state)) return invalid('invalid-state');
  const requiredRefs = selectedReferenceCount(state, refCounts);
  if (requiredRefs === null) return invalid('invalid-reference-counts');
  const catalogue = resolveScriptV2ImageCatalogue({
      models,
      support,
      requiredRefs,
      currentModel: state.config.model,
      language,
    }),
    model = catalogue.currentModel,
    schema = schemaFor(models, model),
    fieldProjection = fieldsFor(schema, state.config.settings, translate);
  if (!catalogue.valid) return invalid(catalogue.reason);
  if (!fieldProjection.valid) return invalid(fieldProjection.reason);
  const emptyPromptIndices = [],
    rowDisplay = state.rows.map((row, index) => {
      const selected = state.selectedIndices.has(index);
      if (selected && !row.imageGenerationPrompt) emptyPromptIndices.push(index);
      return {
        index,
        row,
        prompt: row.imageGenerationPrompt || row.plotDescription || '（空）',
        selected,
        expanded: state.expandedIndices.has(index),
      };
    }),
    selectedCount = state.selectedIndices.size,
    totalCount = state.rows.length,
    option = catalogue.options.find((entry) => entry.value === model),
    canConfirm =
      selectedCount > 0 &&
      catalogue.keys.includes(model) &&
      !!option &&
      !option.disabled &&
      emptyPromptIndices.length === 0;
  return {
    valid: true,
    reason: '',
    config: state.config,
    schema,
    catalogue,
    currentModel: model,
    options: catalogue.options,
    fields: fieldProjection.fields,
    visibleSettingsSupported: fieldProjection.visibleSettingsSupported,
    selectedCount,
    totalCount,
    allSelected: totalCount > 0 && selectedCount === totalCount,
    someSelected: selectedCount > 0 && selectedCount < totalCount,
    requiredRefs,
    emptyPromptIndices,
    rowDisplay,
    canConfirm,
    confirmTooltip: emptyPromptIndices.length
      ? '请先合成提示词后再创建分镜图生成器组'
      : '创建分镜图生成器组后，可在画布中整组执行批量生图',
    confirmLabel: `确认并创建生成器组 (${selectedCount})`,
  };
}

/** Source onConfirm receives current raw rows' ascending indices, not Set insertion order. */
export function buildScriptV2ImageConfirmPayload(context = {}) {
  const projection = projectScriptV2ImageConfig(context);
  if (!projection.canConfirm) return null;
  return {
    config: { ...context.state.config, settings: { ...context.state.config.settings } },
    selectedIndices: context.state.rows
      .map((_, index) => index)
      .filter((index) => context.state.selectedIndices.has(index)),
  };
}
