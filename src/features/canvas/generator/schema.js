// Public source 459812 / 92105 / 440398: schema keys and API store keys are distinct.
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
/** Shared by the inspector and submission so reference-driven rules cannot diverge. */
export function generatorInputCounts(node, nodes, edges) {
  const ids = new Set(edges.filter((edge) => edge.target === node.id).map((edge) => edge.source));
  const references = nodes.filter((reference) => ids.has(reference.id));
  return Object.fromEntries(
    ['image', 'video', 'audio'].map((type) => {
      const stored = node.data?.params?.[type + 'List'];
      const connected = references.filter((reference) => {
        if (
          reference.type !== type ||
          reference.data?.status === 'uploading' ||
          reference.data?.status === 'error'
        )
          return false;
        const urls = Array.isArray(reference.data?.url)
          ? reference.data.url
          : [reference.data?.url];
        return urls.some(
          (url) => typeof url === 'string' && url.trim() && !url.startsWith('blob:'),
        );
      }).length;
      return [
        type + 'List',
        Math.max(Array.isArray(stored) ? stored.filter(Boolean).length : 0, connected),
      ];
    }),
  );
}
export function fieldGroups(config, modeType) {
  let value = Array.isArray(config)
    ? config
    : record(config)
      ? modeType === undefined
        ? Object.values(config).find(Array.isArray) || []
        : config[modeType] || config.text2video || []
      : [];
  // Public Flight snapshot reuses sibling arrays for the three long-video models.
  // Resolve only a local config alias, never an arbitrary schema path or URL.
  const seen = new Set();
  while (typeof value === 'string' && !seen.has(value)) {
    seen.add(value);
    const match = value.match(
      /^\$[a-z\d]+:props:schema:[^:]+:[^:]+:config:(?:settings|advancedSettings):([^:]+)$/i,
    );
    value = match && Object.hasOwn(config, match[1]) ? config[match[1]] : [];
  }
  if (!Array.isArray(value)) return [];
  if (value.length && record(value[0]) && Array.isArray(value[0].fields))
    return value.filter((group) => record(group) && Array.isArray(group.fields));
  return [{ fields: value.filter((key) => typeof key === 'string') }];
}
export const fieldKeys = (config, modeType) =>
  fieldGroups(config, modeType).flatMap((group) => group.fields);
export const storeKey = (key, property) => property?.originalField ?? key;
export function enumOptions(property) {
  return Array.isArray(property?.enum)
    ? property.enum.map((item) =>
        record(item)
          ? { ...item, label: item.displayName ?? String(item.value) }
          : { value: item, label: String(item) },
      )
    : [];
}
const number = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : typeof value === 'string' && value.trim() && Number.isFinite(Number(value))
      ? Number(value)
      : undefined;
export function countOptions(schema) {
  const count = schema?.properties?.count;
  const values = Array.isArray(count) ? count : record(count) ? count.enum : [count];
  return [...new Set((values || []).map(number).filter((value) => value !== undefined))];
}
function countDefault(schema) {
  return number(schema?.properties?.count?.default) ?? countOptions(schema)[0] ?? 1;
}
function defaultValue(property) {
  return property?.default ?? enumOptions(property)[0]?.value;
}
export function visibleProperty(property, values) {
  if (!record(property?.visibleWhen)) return true;
  return Object.entries(property.visibleWhen).every(([key, expected]) =>
    record(expected) && Object.hasOwn(expected, 'ne')
      ? values[key] !== expected.ne
      : record(expected) && Object.hasOwn(expected, 'eq')
        ? values[key] === expected.eq
        : Array.isArray(expected)
          ? expected.includes(values[key])
          : values[key] === expected,
  );
}
function matches(rule, values, modeType, inputCounts) {
  if (rule.forModeTypes?.length && modeType && !rule.forModeTypes.includes(modeType)) return false;
  if (
    record(rule.when) &&
    !Object.entries(rule.when).every(([key, expected]) => {
      const actual = key === 'modeType' ? modeType : values[key];
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    })
  )
    return false;
  return (
    !record(rule.inputWhen) ||
    Object.entries(rule.inputWhen).every(
      ([key, condition]) => condition !== 'notEmpty' || (inputCounts[key] || 0) > 0,
    )
  );
}
export function evaluateGeneratorRules(schema, values, modeType, inputCounts = {}) {
  const rules = (Array.isArray(schema?.settingsRules) ? schema.settingsRules : []).flatMap(
    (rule) => {
      if (!record(rule)) return [];
      if (!Array.isArray(rule.conflict) || rule.conflict.length < 2) return [rule];
      return rule.conflict.map((entry, index) => ({
        ...rule,
        when: Object.fromEntries(
          rule.conflict
            .filter((_, i) => i !== index)
            .map((item) => [item.field, item.values.length === 1 ? item.values[0] : item.values]),
        ),
        disable: { [entry.field]: entry.values },
      }));
    },
  );
  const disabled = {},
    overrides = {},
    messages = {},
    fallbacks = {};
  for (const rule of rules) {
    if (!matches(rule, values, modeType, inputCounts)) continue;
    for (const [key, options] of Object.entries(rule.disable || {})) {
      if (!Array.isArray(options)) continue;
      disabled[key] ||= new Set();
      options.forEach((value) => disabled[key].add(value));
      if (rule.message) messages[key] ||= rule.message;
      if (disabled[key].has(values[key]) && rule.fallback?.[key] !== undefined)
        fallbacks[key] = rule.fallback[key];
    }
    for (const [key, override] of Object.entries(rule.override || {})) {
      if (!record(override)) continue;
      overrides[key] = { ...overrides[key], ...override };
      if (rule.message) messages[key] ||= rule.message;
    }
  }
  return { disabled, overrides, messages, fallbacks };
}
function resolveSection(raw, keys, schema, overrides = {}) {
  const properties = schema?.properties || {};
  const values = {},
    result = {};
  for (const key of keys) {
    const property = properties[key];
    if (!record(property)) continue;
    const stored = storeKey(key, property);
    const candidate = raw?.[stored];
    let value;
    if (property.component === 'slider') {
      const min = overrides[key]?.min ?? property.min ?? 0;
      const max = overrides[key]?.max ?? property.max ?? 100;
      value = Math.min(
        max,
        Math.max(min, number(candidate) ?? overrides[key]?.default ?? property.default ?? min),
      );
    } else if (property.component === 'switch') value = candidate ?? property.default ?? 0;
    else if (property.component === 'voiceCard') {
      const metaKey = `_${stored}_meta`;
      const existingMeta = raw?.[metaKey];
      const voice = record(candidate)
        ? candidate
        : record(existingMeta)
          ? existingMeta
          : property.default;
      value = typeof candidate === 'string' && candidate ? candidate : voice?.voiceId;
      if (record(voice) && voice.voiceId === value) result[metaKey] = voice;
    } else if (property.component === 'input') value = candidate ?? defaultValue(property);
    else {
      const options = enumOptions(property);
      value = options.some((option) => option.value === candidate)
        ? candidate
        : defaultValue(property);
    }
    if (value !== undefined) result[stored] = value;
    values[key] = value;
  }
  for (const [key, value] of Object.entries(raw || {}))
    if (key.startsWith('_') && value !== undefined) result[key] = value;
  return { result, values };
}
export function resolveGeneratorParams(params, schema, type, inputCounts = {}) {
  const defaultMode =
    schema?.config?.textModes?.[0] ??
    (type === 'image' && (inputCounts.imageList || params?.imageList?.length) > 0
      ? 'image2image'
      : `text2${type}`);
  const declaredModes = new Set([
    `text2${type}`,
    ...(schema?.config?.textModes || []),
    ...(record(schema?.config?.settings) ? Object.keys(schema.config.settings) : []),
    ...Object.entries(schema?.properties?.modeType?.items || {})
      .filter(([, limits]) => Array.isArray(limits) && limits[1] > 0)
      .map(([mode]) => mode),
  ]);
  const modeType = declaredModes.has(params?.modeType) ? params.modeType : defaultMode;
  const normalKeys = fieldKeys(schema?.config?.settings, modeType);
  const advancedKeys = fieldKeys(schema?.config?.advancedSettings, modeType);
  let normal = resolveSection(params?.settings, normalKeys, schema);
  let advanced = resolveSection(params?.advancedSettings, advancedKeys, schema);
  const rules = evaluateGeneratorRules(
    schema,
    { ...normal.values, ...advanced.values },
    modeType,
    inputCounts,
  );
  const applyRules = (section, keys, raw) => {
    const modified = { ...raw };
    for (const key of keys) {
      if (!schema?.properties?.[key]) continue;
      const blocked = rules.disabled[key];
      const fallback =
        rules.fallbacks[key] ??
        (blocked?.has(section.values[key])
          ? enumOptions(schema.properties[key]).find((option) => !blocked.has(option.value))?.value
          : undefined);
      if (fallback !== undefined) modified[storeKey(key, schema.properties[key])] = fallback;
    }
    return resolveSection(modified, keys, schema, rules.overrides);
  };
  normal = applyRules(normal, normalKeys, normal.result);
  advanced = applyRules(advanced, advancedKeys, advanced.result);
  const options = countOptions(schema);
  const existingCount = number(params?.count);
  const count =
    modeType === 'longVideo2video'
      ? 1
      : !options.length || options.includes(existingCount)
        ? (existingCount ?? countDefault(schema))
        : countDefault(schema);
  return {
    ...params,
    model: params?.model || schema?.modelKey || '',
    prompt: params?.prompt ?? '',
    modeType,
    count,
    settings: normal.result,
    advancedSettings: advanced.result,
  };
}
export function generatorValues(params, schema) {
  return Object.fromEntries(
    Object.entries(schema?.properties || {})
      .filter(([, property]) => record(property))
      .map(([key, property]) => [
        key,
        params.settings?.[storeKey(key, property)] ??
          params.advancedSettings?.[storeKey(key, property)],
      ]),
  );
}
export function generatorPrompt(schema, modeType) {
  const property = schema?.properties?.prompt || {};
  const override = property.modeTypePlaceholders?.[modeType];
  return {
    placeholder:
      typeof override === 'string'
        ? override
        : (override?.placeholder ?? property.placeholder ?? ''),
    maxLength: property.modeTypeMaxLengths?.[modeType] ?? property.maxLength ?? 0,
  };
}
export function generatorValidation(params, schema, inputCounts = {}) {
  if (!schema) return '模型配置尚未加载';
  const prompt = typeof params.prompt === 'string' ? params.prompt.trim() : '';
  const cameraFocus = params.scene === 'camera_focus';
  const hasPrompt = !!prompt || cameraFocus;
  const imageCount = cameraFocus ? Number(!!params.originImage) : inputCounts.imageList || 0;
  const mediaCount = imageCount + (inputCounts.videoList || 0) + (inputCounts.audioList || 0);
  const limits = generatorPrompt(schema, params.modeType);
  if (limits.maxLength > 0 && prompt.length > limits.maxLength)
    return `提示词最多 ${limits.maxLength} 字`;
  for (const rule of Array.isArray(schema.rules) ? schema.rules : []) {
    if (rule.forModeTypes?.length && !rule.forModeTypes.includes(params.modeType)) continue;
    const fulfilled = (rule.require || []).map((key) =>
      key === 'prompt'
        ? hasPrompt
        : key === 'media'
          ? mediaCount > 0
          : key === 'image'
            ? imageCount > 0
            : ['video', 'audio'].includes(key)
              ? (inputCounts[key + 'List'] || 0) > 0
              : !!params[key],
    );
    if (
      !fulfilled.length ||
      (rule.mode === 'any' ? fulfilled.some(Boolean) : fulfilled.every(Boolean))
    )
      continue;
    return (rule.require || []).includes('prompt') && !hasPrompt
      ? rule.mode === 'any'
        ? '请输入提示词或添加参考素材'
        : '请先输入提示词'
      : '请添加模型所需的参考素材';
  }
  return '';
}
