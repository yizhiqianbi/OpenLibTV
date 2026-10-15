import {
  collectScriptV2GeneratorInputs,
  expandScriptV2GeneratorSources,
  scriptV2GeneratorInputIdentity,
} from './script-generator-inputs.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value) => (Array.isArray(value) ? value : []);
const lists = ['imageList', 'videoList', 'audioList'];
const tokens = new Set(['prompt', 'image', 'video', 'audio', 'media']);
const labels = {
  prompt: '提示词',
  image: '参考图片',
  video: '参考视频',
  audio: '参考音频',
  media: '参考素材',
};
const modeLabels = {
  text2video: '文生视频',
  singleImage2video: '图生视频',
  frames2video: '首尾帧',
  image2video: '图片参考',
  video2video: '视频参考',
  videoEdit2video: '视频编辑',
  audio2video: '音频参考',
  mixed2video: '全能参考',
  text2image: '文生图',
  image2image: '图生图',
};
const errorLabels = {
  'not-v2-script': '当前节点不是新版脚本',
  'missing-support': '脚本模型目录尚未加载',
  'invalid-support': '脚本模型目录无效，请重试',
  'duplicate-support-key': '脚本模型目录无效，请重试',
  'invalid-graph': '画布数据无效，请重新打开',
  'no-script': '脚本节点已删除',
  'invalid-inputs': '脚本参考数据无效，请检查画布',
  'invalid-params': '脚本参数无效，请重新打开',
  'missing-schema': '模型配置尚不可用',
};

/** Source 450439: schema is deliberately not consulted. */
export function initScriptV2GeneratorParams({ params, currentModel } = {}) {
  if (params != null && !record(params)) return null;
  return params
    ? !params.model && currentModel
      ? { ...params, model: currentModel }
      : params
    : { prompt: '', model: currentModel, count: 1 };
}

function ordered(values, order) {
  if (!order?.length || values.length <= 1) return values;
  const remaining = new Map(values.map((ref) => [ref.nodeId, ref])),
    result = [];
  for (const id of order) {
    if (!remaining.has(id)) continue;
    result.push(remaining.get(id));
    remaining.delete(id);
  }
  return [...result, ...remaining.values()];
}

/** Source 427044 $: projection only, including noncontiguous src_img index labels. */
export function buildScriptV2TaskParams({ nodeData, incomingData, currentModel } = {}) {
  const initial = initScriptV2GeneratorParams({ params: nodeData?.params, currentModel });
  if (
    !initial ||
    !record(incomingData) ||
    ['textList', ...lists].some(
      (key) => !Array.isArray(incomingData[key]) || incomingData[key].some((ref) => !record(ref)),
    ) ||
    lists.some((key) => initial[`${key}Order`] != null && !Array.isArray(initial[`${key}Order`]))
  )
    return null;
  const imageList = ordered(incomingData.imageList, initial.imageListOrder),
    sourceImages = imageList.flatMap((ref, index) =>
      ref?.nodeId && ref?.url
        ? [
            {
              ref_id: `src_img_${index + 1}`,
              node_id: ref.nodeId,
              url: ref.url,
              ...(ref.label ? { display_name: ref.label } : {}),
            },
          ]
        : [],
    );
  let scenePayload;
  if (sourceImages.length)
    scenePayload = { ...(initial.scenePayload ?? {}), source_images: sourceImages };
  else if (initial.scenePayload) {
    const { source_images: _removed, ...remaining } = initial.scenePayload;
    if (Object.keys(remaining).length) scenePayload = remaining;
  }
  return {
    ...initial,
    scene: 'script-generate-v2',
    textList: incomingData.textList,
    imageList,
    videoList: ordered(incomingData.videoList, initial.videoListOrder),
    audioList: ordered(incomingData.audioList, initial.audioListOrder),
    scenePayload,
  };
}

/** Source 704418: refresh only nonempty actual media node-ID order lists. */
export function ensureScriptV2MediaListOrder(params) {
  if (!record(params)) return null;
  let patch;
  for (const key of [...lists, 'mixedList']) {
    if (!Array.isArray(params[key])) continue;
    const ids = params[key]
      .map((ref) => (typeof ref?.nodeId === 'string' ? ref.nodeId : null))
      .filter((id) => id !== null);
    if (!ids.length) continue;
    const order = params[`${key}Order`];
    if (
      !Array.isArray(order) ||
      order.length !== ids.length ||
      !order.every((id, index) => id === ids[index])
    ) {
      patch ??= {};
      patch[`${key}Order`] = ids;
    }
  }
  return patch ? { ...params, ...patch } : params;
}

/** Source core A: shallow merge, retain hidden params, remove explicit undefined. */
export function patchScriptV2GeneratorParams({ params, patch } = {}) {
  return record(params) && record(patch)
    ? Object.fromEntries(
        Object.entries({ ...params, ...patch }).filter(([, value]) => value !== undefined),
      )
    : null;
}

/** Source core w: prune magic metadata and compact only referenced camera presets. */
export function patchScriptV2GeneratorPrompt({ params, prompt } = {}) {
  if (!record(params) || typeof prompt !== 'string') return null;
  let text = prompt;
  const patch = {},
    magic = params.magicList;
  if (magic && Object.keys(magic).length > 0) {
    const used = new Set();
    for (const match of text.matchAll(/\{\{magic:([^:}]+):(\d+)\}\}/g)) used.add(match[1]);
    if (Object.keys(magic).some((id) => !used.has(id))) {
      const remaining = Object.fromEntries(Object.entries(magic).filter(([id]) => used.has(id)));
      patch.magicList = Object.keys(remaining).length > 0 ? remaining : undefined;
    }
  }
  const presets = params.cameraPresets;
  if (Array.isArray(presets) && presets.length > 0) {
    const used = new Set();
    for (const match of text.matchAll(
      /\{\{(Image|Portrait|Video|Audio|Mixed|Element|CameraPreset)\s+(\d+)\}\}/g,
    ))
      if (match[1] === 'CameraPreset') used.add(Number.parseInt(match[2], 10));
    const remaining = [],
      indexes = new Map();
    for (let index = 0; index < presets.length; index += 1) {
      if (!used.has(index + 1)) continue;
      remaining.push(presets[index]);
      indexes.set(index + 1, remaining.length);
    }
    if (remaining.length !== presets.length) {
      patch.cameraPresets = remaining.length > 0 ? remaining : undefined;
      if (indexes.size > 0)
        text = text.replace(/\{\{CameraPreset\s+(\d+)\}\}/g, (_token, number) => {
          const index = indexes.get(Number.parseInt(number, 10));
          return index != null ? `{{CameraPreset ${index}}}` : '';
        });
    }
  }
  return patchScriptV2GeneratorParams({ params, patch: { prompt: text, ...patch } });
}

/** Source V only writes the typed order. Permutation/idempotence are local guards. */
export function reorderScriptV2References({ params, references, listType, order } = {}) {
  if (!record(params) || !['image', 'video', 'audio'].includes(listType) || !Array.isArray(order))
    return null;
  const values = references?.[`${listType}List`];
  if (!Array.isArray(values) || values.length !== order.length) return null;
  const counts = new Map();
  for (const ref of values) {
    if (typeof ref?.nodeId !== 'string' || !ref.nodeId) return null;
    counts.set(ref.nodeId, (counts.get(ref.nodeId) ?? 0) + 1);
  }
  for (const id of order) {
    if (typeof id !== 'string' || !counts.get(id)) return null;
    counts.set(id, counts.get(id) - 1);
  }
  const key = `${listType}ListOrder`,
    current = params[key] ?? values.map((ref) => ref.nodeId);
  return Array.isArray(current) &&
    current.length === order.length &&
    current.every((id, index) => id === order[index])
    ? null
    : { ...params, [key]: [...order] };
}

/** Source 814059: direct edge first, otherwise count all expanded group leaves. */
export function planScriptV2ReferenceRemoval({ nodes, edges, targetId, sourceId, prompt } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || typeof sourceId !== 'string') return null;
  const lookup = new Map();
  for (const node of nodes) {
    if (!record(node) || typeof node.id !== 'string' || lookup.has(node.id)) return null;
    lookup.set(node.id, node);
  }
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!record(edge) || typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id))
      return null;
    edgeIds.add(edge.id);
  }
  const target = lookup.get(targetId);
  if (
    (target?.type || target?.data?.type) !== 'script-v2' ||
    !record(target.data) ||
    (target.data.params != null && !record(target.data.params))
  )
    return null;
  let removed = edges.find((edge) => edge.source === sourceId && edge.target === targetId),
    excluded = array(target.data.groupRefExcludedNodeIds).filter((id) => typeof id === 'string'),
    excludeChild = false;
  if (!removed) {
    for (const edge of edges) {
      if (edge.target !== targetId) continue;
      const group = lookup.get(edge.source);
      if (!['group', 'video_group', 'video-story'].includes(group?.data?.type)) continue;
      const leaves = expandScriptV2GeneratorSources([group], nodes, new Set(excluded));
      if (!leaves.some((leaf) => leaf.id === sourceId)) continue;
      if (leaves.length <= 1) removed = edge;
      else {
        excluded = [...excluded, sourceId];
        excludeChild = true;
      }
      break;
    }
  }
  if (!removed && !excludeChild) return null;
  const params = { ...target.data.params };
  // Source collector does not revive stored lists. Purging stale local snapshots
  // keeps the same rule for callers still holding their pre-delete params.
  for (const key of ['textList', ...lists, 'mixedList']) {
    if (Array.isArray(params[key]))
      params[key] = params[key].filter((ref) => ref?.nodeId !== sourceId);
    if (Array.isArray(params[`${key}Order`]))
      params[`${key}Order`] = params[`${key}Order`].filter((id) => id !== sourceId);
  }
  if (typeof prompt === 'string') params.prompt = prompt;
  return {
    nodes: nodes.map((node) =>
      node === target
        ? {
            ...node,
            data: {
              ...node.data,
              params,
              ...(excludeChild ? { groupRefExcludedNodeIds: excluded } : {}),
            },
          }
        : node,
    ),
    edges: removed ? edges.filter((edge) => edge.id !== removed.id) : edges,
  };
}

function rulesFor(schema) {
  if (schema?.rules === undefined) return [{ require: ['prompt'], mode: 'all', whenHas: [] }];
  return array(schema.rules).flatMap((rule) => {
    if (!record(rule) || !Array.isArray(rule.require)) return [];
    const required = rule.require.filter((key) => tokens.has(key));
    if (!required.length) return [];
    const when = array(rule.whenHas).filter((key) => tokens.has(key));
    return [
      {
        require: required,
        mode: rule.mode === 'any' ? 'any' : 'all',
        whenHas: when,
        forModeTypes: Array.isArray(rule.forModeTypes) ? rule.forModeTypes : undefined,
        message: typeof rule.message === 'string' ? rule.message : undefined,
        messageI18nKey: typeof rule.messageI18nKey === 'string' ? rule.messageI18nKey : undefined,
      },
    ];
  });
}

function generateRules(params, incoming, schema, translate) {
  const prompt = (typeof params.prompt === 'string' ? params.prompt.trim() : '')
      .replace(/\{\{Panorama720\}\}/g, '')
      .replace(/\{\{SlashPreset:[^}]+\}\}/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim(),
    has = {
      prompt:
        !!prompt ||
        incoming.textList.some((ref) => Array.isArray(ref.content) && ref.content.length > 0),
      image: incoming.imageList.length > 0,
      video: incoming.videoList.length > 0,
      audio: incoming.audioList.length > 0,
    };
  has.media = has.image || has.video || has.audio;
  const reasons = [];
  for (const rule of rulesFor(schema)) {
    // useCanGenerate's ScriptV2 caller omits modeType; forModeTypes consequently
    // does not filter these rules even if a historical params.modeType is stored.
    if (rule.whenHas.length && !rule.whenHas.every((key) => has[key])) continue;
    const values = rule.require.map((key) => has[key]);
    if (rule.mode === 'any' ? values.some(Boolean) : values.every(Boolean)) continue;
    const translated = rule.messageI18nKey && translate?.(rule.messageI18nKey);
    if (translated && translated !== rule.messageI18nKey) reasons.push(translated);
    else if (typeof rule.message === 'string' && rule.message) reasons.push(rule.message);
    else {
      const text = rule.require
          .map((key) => `${key === 'prompt' ? '输入' : '添加'}${labels[key]}`)
          .join(rule.mode === 'any' ? '或' : '并'),
        prefix =
          rule.forModeTypes?.length === 1
            ? `${modeLabels[rule.forModeTypes[0]] ?? rule.forModeTypes[0]}模式下，`
            : '';
      reasons.push(
        `${prefix}${rule.whenHas.length ? `添加${rule.whenHas.map((key) => labels[key]).join('并')}时，需同时` : '请'}${text}`,
      );
    }
  }
  return { canGenerate: reasons.length === 0, reasons };
}

function disable(value, language) {
  const trim = (text) => (typeof text === 'string' ? text.trim() || undefined : undefined),
    plain = record(value) && Object.keys(value).length > 0;
  return {
    disabled: value === true || !!trim(value) || plain,
    disabledReason: plain ? (trim(value[language]) ?? trim(value.en)) : trim(value),
  };
}

/** ScriptV2 uses text schemas but its independent support directory and builder. */
export function resolveScriptV2Generator({
  node,
  nodes = [],
  edges = [],
  models,
  support,
  incomingData,
  params,
  language = 'zh',
  translate,
} = {}) {
  const failure = (reason) => ({
    valid: false,
    reason,
    model: params?.model || node?.data?.params?.model || models?.default?.text,
    modelList: [],
    modelKeys: [],
    schema: null,
    params: params ?? node?.data?.params,
    incoming: null,
    inputMedia: null,
    references: null,
    inputIdentity: [],
    canGenerate: false,
    reasons: [],
    error: errorLabels[reason] || '脚本参数尚不可用',
  });
  if ((node?.type || node?.data?.type) !== 'script-v2' || !record(node.data))
    return failure('not-v2-script');
  if (!Array.isArray(nodes) || nodes.some((item) => !record(item))) return failure('invalid-graph');
  if (support == null) return failure('missing-support');
  if (
    !Array.isArray(support) ||
    support.some((item) => !record(item) || typeof item.modelKey !== 'string' || !item.modelKey)
  )
    return failure('invalid-support');
  if (new Set(support.map((item) => item.modelKey)).size !== support.length)
    return failure('duplicate-support-key');
  const collected = incomingData
    ? { valid: true, incoming: incomingData }
    : collectScriptV2GeneratorInputs({ node, nodes, edges });
  if (!collected.valid) return failure(collected.reason);
  const incoming = collected.incoming;
  if (
    !record(incoming) ||
    ['textList', ...lists].some(
      (key) => !Array.isArray(incoming[key]) || incoming[key].some((ref) => !record(ref)),
    )
  )
    return failure('invalid-inputs');
  const model = (params ?? node.data.params)?.model || models?.default?.text,
    schema = models?.textModels?.[model] ?? null,
    projected = buildScriptV2TaskParams({
      nodeData: { ...node.data, params: params ?? node.data.params },
      incomingData: incoming,
      currentModel: model,
    });
  if (!projected) return failure('invalid-params');
  const modelList = support
      .map((item) => ({ ...item, ...disable(item.disable, language) }))
      .sort((a, b) => Number(a.disabled) - Number(b.disabled)),
    initialized = ensureScriptV2MediaListOrder(projected),
    lookup = new Map(nodes.map((item) => [item.id, item])),
    references = {
      textList: initialized.textList.map((ref) => ({
        ...ref,
        label:
          lookup.get(ref.nodeId)?.data?.name || lookup.get(ref.nodeId)?.data?.label || undefined,
      })),
    };
  for (const key of lists)
    references[key] = initialized[key].map((ref) => ({
      ...ref,
      mediaType: key.replace('List', ''),
    }));
  references.mixedList = lists.flatMap((key) => references[key]);
  const evaluated = generateRules(initialized, incoming, schema, translate),
    valid = record(schema),
    reason = valid ? '' : 'missing-schema';
  return {
    valid,
    reason,
    model,
    modelList,
    modelKeys: modelList.map((item) => item.modelKey),
    schema,
    params: projected,
    initializationParams: initialized,
    incoming,
    inputMedia: references,
    references,
    inputIdentity: scriptV2GeneratorInputIdentity(incoming),
    canGenerate: valid && evaluated.canGenerate,
    reasons: evaluated.reasons,
    error: (reason ? errorLabels[reason] : evaluated.reasons[0]) || '',
  };
}
