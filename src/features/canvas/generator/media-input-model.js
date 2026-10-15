import { fieldKeys, storeKey } from './schema.js';
import { roleMediaReferenceMetadata } from './role-media-reference-model.js';

// Public modules 469850, 396567, 493983 and 378565. No media probes or service calls.
const lists = ['imageList', 'videoList', 'audioList'];
const types = ['image', 'video', 'audio'];
const array = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const firstMediaUrl = (value) =>
  Array.isArray(value) ? value.find((url) => typeof url === 'string' && url.trim()) : value;
const texts = {
  text2video: '文生视频',
  singleImage2video: '图生视频',
  frames2video: '首尾帧',
  image2video: '图片参考',
  video2video: '视频参考',
  videoEdit2video: '视频编辑',
  audio2video: '音频参考',
  mixed2video: '全能参考',
  videoExtend2video: '视频续写',
  longVideo2video: '超长视频',
};
export const VIDEO_MEDIA_MODES = [
  ['text2video', null, 'libtv:mode-text2video'],
  ['singleImage2video', 'imageList', 'libtv:mode-single-image2video'],
  ['frames2video', 'imageList', 'libtv:mode-frames2video'],
  ['image2video', 'imageList', 'libtv:mode-image2video'],
  ['video2video', 'videoList', 'libtv:video-gen'],
  ['videoEdit2video', 'videoList', 'libtv:mode-video-edit2video'],
  ['audio2video', 'audioList', 'libtv:audio'],
  ['mixed2video', 'mixedList', 'libtv:mode-mixed2video'],
  ['videoExtend2video', 'mixedList', 'libtv:video-gen'],
  ['longVideo2video', 'mixedList', 'libtv:mode-long-video2video'],
].map(([key, listKey, icon]) => ({
  key,
  listKey,
  icon,
  label: texts[key],
  ...(key === 'longVideo2video' ? { badge: 'Beta' } : {}),
}));
const mixedModes = new Set(['mixed2video', 'videoExtend2video', 'longVideo2video']);
const count = (inputs, key) => array(inputs?.[key]).length;
const hasMedia = (inputs) => lists.some((key) => count(inputs, key) > 0);
const excludedModes = (schema) => array(schema?.config?.excludeModeTypes);
const isSeedance25 = (schema) =>
  ['star-video2.5', 'star-video2.5-draft'].includes(schema?.modelKey) ||
  schema?.modelVendor === 'star-video2.5';
const mixedAudio = (key, schema) =>
  mixedModes.has(key) || (key === 'videoEdit2video' && isSeedance25(schema));
function modeItems(schema) {
  const items = { ...schema?.properties?.modeType?.items };
  if (schema?.properties?.supportLongVideo !== true) delete items.longVideo2video;
  return items;
}
function modeConfig(schema, key) {
  const value = schema?.properties?.modeType?.[key + 'Config'];
  return record(value) && typeof value.videoMax === 'number' ? value : null;
}
function validRange(value) {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) &&
    value[1] >= value[0]
  );
}
const inRange = (value, range) => validRange(range) && value >= range[0] && value <= range[1];
const includeMixedAudio = (schema, options) =>
  options.includeAudioInMixedList === true &&
  (modeConfig(schema, 'mixed2video')?.audioMax || 0) > 0;

function usableRef(value, type) {
  const item = typeof value === 'string' ? { url: value } : record(value) ? value : null;
  const url = firstMediaUrl(item?.url);
  if (
    typeof url !== 'string' ||
    !url.trim() ||
    url.startsWith('blob:') ||
    (url.startsWith('data:') && item.localMediaReady !== true) ||
    ['uploading', 'pending', 'error', 'failed'].includes(item.status) ||
    item.pending === true ||
    item.uploading === true
  )
    return null;
  const result = { ...item, url, mediaType: type };
  for (const key of ['width', 'height', 'durationSec', 'byteSize'])
    if (!positive(result[key])) delete result[key];
  return result;
}
function uniqueRefs(values, type) {
  const seen = new Set();
  return array(values).flatMap((value) => {
    const item = usableRef(value, type);
    if (!item) return [];
    const identity = item.nodeId || item.url;
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [item];
  });
}

/** Source 417754: one current resource per connected node; box dimensions are never media metadata. */
export function collectGeneratorMediaInputs({
  target,
  nodes = [],
  edges = [],
  metadataByNodeId = {},
}) {
  const byId = new Map(array(nodes).map((node) => [node.id, node]));
  const excluded = new Set(array(target?.data?.groupRefExcludedNodeIds));
  const seen = new Set();
  const sources = [];
  function expand(node, depth = 0) {
    if (!node || seen.has(node.id) || (depth > 0 && excluded.has(node.id))) return;
    seen.add(node.id);
    const type = node.data?.type || node.type;
    if (['group', 'video_group', 'video-story'].includes(type) && !node.data?.characterAsset) {
      if (depth >= 8) return;
      for (const child of array(nodes).filter((item) => item.parentId === node.id))
        expand(child, depth + 1);
    } else sources.push(node);
  }
  for (const edge of array(edges))
    if (edge.target === target?.id && !edge.data?.portraitVirtual && !edge.data?.assetVirtual)
      expand(byId.get(edge.source));
  const result = Object.fromEntries(lists.map((key) => [key, []]));
  for (const node of sources) {
    const data = node.data || {};
    const type = data.type || node.type;
    if (!types.includes(type)) continue;
    const rawUrls =
      type === 'image' &&
      !['hidden', 'watermark'].includes(data.protectionType) &&
      array(data.originalUrl).length
        ? data.originalUrl
        : data.url;
    const url = firstMediaUrl(rawUrls);
    const resource = array(node.resourceMeta?.items).find(
      (item) => item?.kind === type && (!item.sourceUrl || item.sourceUrl === url),
    );
    const metadata = metadataByNodeId[node.id] || resource || {};
    const ref = usableRef({ ...data, nodeId: node.id, url, label: data.name || data.label }, type);
    if (!ref) continue;
    Object.assign(ref, roleMediaReferenceMetadata(node, type));
    // data.width/height describe the graph box in legacy documents, not the source media.
    for (const key of ['width', 'height', 'durationSec', 'byteSize']) {
      delete ref[key];
      if (positive(metadata[key])) ref[key] = metadata[key];
    }
    if (typeof metadata.extension === 'string') ref.extension = metadata.extension;
    if (typeof metadata.mimeType === 'string') ref.mimeType = metadata.mimeType;
    result[type + 'List'].push(ref);
  }
  for (const [index, key] of lists.entries())
    result[key] = uniqueRefs([...result[key], ...array(target?.data?.params?.[key])], types[index]);
  for (const edge of array(edges)) {
    const characterRef = edge.data?.characterRef;
    if (edge.target === target?.id && characterRef?.mainReferenceImageUrl) {
      const ref = usableRef(
        {
          nodeId: edge.source,
          url: characterRef.mainReferenceImageUrl,
          label: characterRef.roleName,
          characterRef,
        },
        'image',
      );
      if (ref) result.imageList.push(ref);
    }
  }
  array(target?.data?.refImages).forEach((url, index) => {
    const ref = usableRef({ nodeId: `${target.id}:ref-${index}`, url }, 'image');
    if (ref) result.imageList.push(ref);
  });
  const focusId = target?.data?.params?.focusRegion?.nodeId;
  if (focusId) result.imageList = result.imageList.filter((ref) => ref.nodeId !== focusId);
  return result;
}

function videoCombinationCompatible(schema, inputs, options) {
  const items = modeItems(schema),
    config = modeConfig(schema, 'mixed2video'),
    images = count(inputs, 'imageList'),
    videos = count(inputs, 'videoList'),
    audios = count(inputs, 'audioList');
  const total = images + videos + (includeMixedAudio(schema, options) ? audios : 0);
  const ranges = [items.mixed2video];
  if (!excludedModes(schema).includes('videoExtend2video')) ranges.push(items.videoExtend2video);
  let mixed = ranges.some((range) => range?.[1] > 0 && inRange(total, range));
  if (mixed && config)
    mixed =
      videos <= config.videoMax &&
      (typeof config.imageMax !== 'number' || images <= config.imageMax) &&
      (!videos ||
        typeof config.imageMaxWithVideo !== 'number' ||
        images <= config.imageMaxWithVideo);
  const mixedAudioValid =
    mixed && audios > 0 && typeof config?.audioMax === 'number' && audios <= config.audioMax;
  const editRange = items.videoEdit2video,
    editConfig = modeConfig(schema, 'videoEdit2video');
  const edit =
    videos > 0 &&
    editRange?.[1] > 0 &&
    inRange(videos, editRange) &&
    (!editConfig ||
      (videos <= editConfig.videoMax &&
        (typeof editConfig.imageMaxWithVideo !== 'number' ||
          images <= editConfig.imageMaxWithVideo)));
  const editAudio =
    edit &&
    mixedAudio('videoEdit2video', schema) &&
    typeof config?.audioMax === 'number' &&
    audios <= config.audioMax;
  return lists.every((key) => {
    const amount = count(inputs, key);
    if (
      !amount ||
      (mixed && key !== 'audioList') ||
      (edit && key === 'imageList') ||
      ((editAudio || mixedAudioValid) && key === 'audioList')
    )
      return true;
    return VIDEO_MEDIA_MODES.filter((mode) => mode.listKey === key).some((mode) => {
      const range = items[mode.key];
      const max =
        mode.key === 'videoEdit2video' && editConfig
          ? Math.min(range?.[1], editConfig.videoMax)
          : range?.[1];
      return range?.[1] > 0 && inRange(amount, [range[0], max]);
    });
  });
}

export function ignoredGeneratorMediaTypes(schema, modeType, inputs) {
  const mode = VIDEO_MEDIA_MODES.find((item) => item.key === modeType);
  if (!mode || mode.listKey === 'mixedList') return [];
  return lists.flatMap((key, index) =>
    count(inputs, key) > 0 &&
    key !== mode.listKey &&
    !(modeType === 'videoEdit2video' && key === 'imageList') &&
    !(mixedAudio(modeType, schema) && key === 'audioList')
      ? [types[index]]
      : [],
  );
}

function videoAvailability(schema, inputs, options) {
  const items = modeItems(schema),
    excluded = excludedModes(schema),
    compatible = !hasMedia(inputs) || videoCombinationCompatible(schema, inputs, options);
  const all = VIDEO_MEDIA_MODES.map((mode) => {
    const range = items[mode.key];
    if (mode.key === 'text2video')
      return {
        ...mode,
        visible: !excluded.includes(mode.key),
        enabled: !excluded.includes(mode.key) && !hasMedia(inputs),
        disabledReason: hasMedia(inputs) ? '已连接媒体输入，无法使用纯文生视频' : undefined,
      };
    const visible = validRange(range) && range[1] > 0 && !excluded.includes(mode.key);
    let enabled = false,
      disabledReason;
    if (visible && !compatible) disabledReason = '当前模型不支持已连接的媒体组合';
    if (visible && compatible) {
      const config = modeConfig(schema, mixedModes.has(mode.key) ? 'mixed2video' : mode.key);
      const min = mode.key === 'longVideo2video' ? 0 : range[0];
      const max =
        mode.key === 'videoEdit2video' && config ? Math.min(range[1], config.videoMax) : range[1];
      const amount =
        mode.listKey === 'mixedList'
          ? count(inputs, 'imageList') +
            count(inputs, 'videoList') +
            (includeMixedAudio(schema, options) ? count(inputs, 'audioList') : 0)
          : count(inputs, mode.listKey);
      enabled = inRange(amount, [min, max]);
      if (!enabled) {
        const label =
          mode.listKey === 'mixedList'
            ? includeMixedAudio(schema, options)
              ? '图片/视频/音频'
              : '图片/视频'
            : { imageList: '图片', videoList: '视频', audioList: '音频' }[mode.listKey];
        const text = min === max || min === 0 ? `${max}` : `${min}~${max}`;
        disabledReason =
          amount === 0
            ? `需要连接${label}节点（${text}个）`
            : `当前${label}数量 ${amount} 个，需要 ${text} 个`;
      }
      if (enabled && config && (mixedModes.has(mode.key) || mode.key === 'videoEdit2video')) {
        const videos = count(inputs, 'videoList'),
          images = count(inputs, 'imageList'),
          audios = count(inputs, 'audioList');
        if (videos > config.videoMax)
          disabledReason = `视频最多 ${config.videoMax} 个，当前 ${videos} 个`;
        else if (
          mixedModes.has(mode.key) &&
          typeof config.imageMax === 'number' &&
          images > config.imageMax
        )
          disabledReason = `图片最多 ${config.imageMax} 个，当前 ${images} 个`;
        else if (
          videos > 0 &&
          typeof config.imageMaxWithVideo === 'number' &&
          images > config.imageMaxWithVideo
        )
          disabledReason = `有视频时，图片最多 ${config.imageMaxWithVideo} 个，当前 ${images} 个`;
        else if (
          mixedAudio(mode.key, schema) &&
          typeof modeConfig(schema, 'mixed2video')?.audioMax === 'number' &&
          audios > modeConfig(schema, 'mixed2video').audioMax
        )
          disabledReason = `音频最多 ${modeConfig(schema, 'mixed2video').audioMax} 个，当前 ${audios} 个`;
        enabled = !disabledReason;
      }
    }
    const ignored = enabled ? ignoredGeneratorMediaTypes(schema, mode.key, inputs) : [];
    // Source menu warns only about connected image/video; the exported ignored list also includes audio.
    const warningLabels = ignored
      .filter((type) => type !== 'audio')
      .map((type) => (type === 'image' ? '图片' : '视频'));
    return {
      ...mode,
      label: mode.key === 'frames2video' && range?.[1] < 2 ? '首帧' : mode.label,
      visible,
      enabled,
      disabledReason,
      warningReason: warningLabels.length
        ? `该模式将忽略已连接的${warningLabels.join(' 和')}输入`
        : undefined,
    };
  });
  const hasMixed = all.some(
    (mode) => mode.visible && ['mixed2video', 'videoExtend2video'].includes(mode.key),
  );
  const visible = all.filter(
    (mode) =>
      mode.visible &&
      mode.key !== 'audio2video' &&
      (mode.key === 'text2video' ||
        hasMixed ||
        count(inputs, 'videoList') === 0 ||
        ['video2video', 'videoEdit2video'].includes(mode.key)),
  );
  const mixedIndex = visible.findIndex((mode) => mode.key === 'mixed2video');
  if (mixedIndex > 0) {
    const [mixed] = visible.splice(mixedIndex, 1);
    visible.splice(visible.findIndex((mode) => mode.key === 'text2video') + 1, 0, mixed);
  }
  return { all, visible, compatible };
}

export function generatorMediaModes(schema, inputs = {}, { type = 'video', ...options } = {}) {
  if (type === 'video') return videoAvailability(schema, inputs, options);
  const items = schema?.properties?.modeType?.items || {};
  const mode = inferGeneratorMediaMode(schema, inputs, { type });
  let compatible;
  if (type === 'image')
    compatible =
      count(inputs, 'imageList') === 0 ||
      (items.image2image?.[1] > 0 && inRange(count(inputs, 'imageList'), items.image2image));
  else if (type === 'audio')
    compatible =
      !(count(inputs, 'imageList') && count(inputs, 'audioList')) &&
      (mode === 'text2audio' ||
        (items[mode]?.[1] > 0 &&
          inRange(count(inputs, mode === 'image2audio' ? 'imageList' : 'audioList'), items[mode])));
  else
    compatible = lists.every(
      (key) =>
        !count(inputs, key) ||
        (items[key.replace('List', '2text')]?.[1] > 0 &&
          inRange(count(inputs, key), items[key.replace('List', '2text')])),
    );
  const modes = type === 'audio' ? audioTextModes(schema) : [`text2${type}`];
  const all = [...new Set([...modes, ...Object.keys(items)])].map((key) => ({
    key,
    label: key,
    visible: true,
    enabled: compatible && key === mode,
    disabledReason: compatible ? undefined : '当前模型不支持已连接的媒体组合',
  }));
  return {
    all,
    visible:
      type === 'audio' && !hasMedia(inputs)
        ? all.filter((item) => modes.includes(item.key)).map((item) => ({ ...item, enabled: true }))
        : all,
    compatible,
  };
}
function audioTextModes(schema) {
  const modes = array(schema?.config?.textModes).filter((mode) =>
    ['text2audio', 'lyrics2audio'].includes(mode),
  );
  return modes.length ? modes : ['text2audio'];
}
export function inferGeneratorMediaMode(
  schema,
  inputs = {},
  { type = 'video', currentModeType, ...options } = {},
) {
  if (type === 'image') return count(inputs, 'imageList') > 0 ? 'image2image' : 'text2image';
  if (type === 'audio')
    return count(inputs, 'imageList') > 0
      ? 'image2audio'
      : count(inputs, 'audioList') > 0
        ? 'audio2audio'
        : audioTextModes(schema).includes(currentModeType)
          ? currentModeType
          : 'text2audio';
  if (type !== 'video') return `text2${type}`;
  const { all } = videoAvailability(schema, inputs, options);
  if (!hasMedia(inputs)) {
    if (
      currentModeType &&
      currentModeType !== 'text2video' &&
      all.some((mode) => mode.key === currentModeType && mode.visible && mode.enabled)
    )
      return currentModeType;
    return excludedModes(schema).includes('text2video')
      ? all.find((mode) => mode.visible && mode.enabled)?.key ||
          all.find((mode) => mode.visible)?.key ||
          'text2video'
      : 'text2video';
  }
  const enabled = all.filter((mode) => mode.key !== 'text2video' && mode.visible && mode.enabled);
  if (count(inputs, 'imageList') && count(inputs, 'videoList')) {
    if (enabled.some((mode) => mode.key === 'mixed2video')) return 'mixed2video';
    if (enabled.some((mode) => mode.key === 'videoEdit2video')) return 'videoEdit2video';
  }
  if (count(inputs, 'videoList')) {
    const video = enabled.find((mode) => ['videoEdit2video', 'video2video'].includes(mode.key));
    if (video) return video.key;
  }
  return enabled.find((mode) => mode.key === 'mixed2video')?.key || enabled[0]?.key || 'text2video';
}

function refExtension(ref) {
  // Source uses URL pathname, not a guessed extension from a MIME label.
  // Explicit verified metadata also supports completed local media with a data URL.
  if (typeof ref.extension === 'string' && /^[a-z\d]+$/i.test(ref.extension))
    return ref.extension.toLowerCase();
  try {
    const url = new URL(ref._httpUrl || ref.url, 'https://local.invalid');
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    const filename = url.pathname.split('/').pop();
    return filename?.includes('.') ? filename.split('.').pop().toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}
function ruleMessages(schema, inputs, modeType, prompt, { cameraFocus, originImage } = {}) {
  const present = {
    prompt: cameraFocus || (typeof prompt === 'string' && !!prompt.trim()),
    image: cameraFocus ? !!originImage : count(inputs, 'imageList') > 0,
    video: count(inputs, 'videoList') > 0,
    audio: count(inputs, 'audioList') > 0,
    media: cameraFocus
      ? !!originImage || count(inputs, 'videoList') > 0 || count(inputs, 'audioList') > 0
      : hasMedia(inputs),
  };
  return array(schema?.rules).flatMap((rule) => {
    if (
      (array(rule.forModeTypes).length && modeType && !rule.forModeTypes.includes(modeType)) ||
      (array(rule.whenHas).length && !rule.whenHas.every((key) => present[key]))
    )
      return [];
    const required = array(rule.require),
      fulfilled = required.map((key) => !!present[key]);
    if (
      !required.length ||
      (rule.mode === 'any' ? fulfilled.some(Boolean) : fulfilled.every(Boolean))
    )
      return [];
    if (rule.message) return [rule.message];
    const labels = {
      prompt: '提示词',
      image: '参考图片',
      video: '参考视频',
      audio: '参考音频',
      media: '参考素材',
    };
    return [
      '请' +
        required
          .map((key) => (key === 'prompt' ? '输入' : '添加') + (labels[key] || key))
          .join(rule.mode === 'any' ? '或' : '并'),
    ];
  });
}

/** Unknown constraints are explicit, never substituted with graph box size or generated settings. */
export function validateGeneratorMediaInputs(
  schema,
  modeType,
  inputs = {},
  { type = 'video', prompt = '', includeAudioInMixedList = false, scene, originImage } = {},
) {
  const blockMessages = [],
    warnMessages = [],
    unresolved = [];
  const add = (action, message) => {
    const values = action === 'block' ? blockMessages : warnMessages;
    if (message && !values.includes(message)) values.push(message);
  };
  if (!schema) add('block', '模型配置尚未加载');
  const modes = generatorMediaModes(schema, inputs, { type, includeAudioInMixedList });
  if (!modes.compatible) add('block', '当前模型不支持已连接的媒体组合');
  const selected = modes.all.find((mode) => mode.key === modeType);
  if (type === 'video' && (!selected?.visible || !selected.enabled))
    add('block', selected?.disabledReason || '当前模式不可用');
  ruleMessages(schema, inputs, modeType, prompt, {
    cameraFocus: type === 'image' && scene === 'camera_focus',
    originImage,
  }).forEach((message) => add('block', message));
  const constraints = schema?.properties?.mediaConstraints;
  const video = constraints?.[modeType]?.video || constraints?.video;
  for (const ref of array(inputs.videoList)) {
    if (!video || !ref?.url) continue;
    const values = {
      formats: refExtension(ref),
      duration: positive(ref.durationSec) ? ref.durationSec : undefined,
      width: positive(ref.width) ? ref.width : undefined,
      height: positive(ref.height) ? ref.height : undefined,
      longSide:
        positive(ref.width) && positive(ref.height) ? Math.max(ref.width, ref.height) : undefined,
      shortSide:
        positive(ref.width) && positive(ref.height) ? Math.min(ref.width, ref.height) : undefined,
      size: positive(ref.byteSize) ? ref.byteSize : undefined,
    };
    for (const key of ['formats', 'duration', 'height', 'width', 'longSide', 'shortSide', 'size']) {
      const rule = video[key];
      if (!record(rule)) continue;
      const value = values[key];
      if (value === undefined) {
        unresolved.push({ nodeId: ref.nodeId, url: ref.url, field: key, action: rule.action });
        continue;
      }
      const violation =
        key === 'formats'
          ? !array(rule.allowed)
              .map((item) => item.toLowerCase())
              .includes(value)
          : (typeof rule.min === 'number' && value < rule.min) ||
            (typeof rule.max === 'number' && value > rule.max);
      if (violation) add(rule.action, rule.message);
    }
  }
  return {
    valid: blockMessages.length === 0 && unresolved.length === 0,
    sourceAccepted: blockMessages.length === 0,
    complete: unresolved.length === 0,
    blockMessages,
    warnMessages,
    unresolved,
  };
}

export function mergeGeneratorMediaSchema(schema, extraConfig) {
  const validExtra =
    typeof extraConfig?.scene === 'string' &&
    !!extraConfig.scene &&
    record(extraConfig.schema) &&
    Array.isArray(extraConfig.models) &&
    extraConfig.models.length > 0;
  if (!validExtra) return { schema, configLocked: false, modelKeys: null };
  const extra = extraConfig.schema,
    merged = structuredClone(schema || extra);
  if (schema)
    for (const [key, value] of Object.entries(extra)) {
      if (key === 'config' && value === false) continue;
      if (key === 'properties' && record(schema.properties) && record(value)) {
        merged.properties = { ...merged.properties };
        for (const [property, definition] of Object.entries(value))
          if (!['portrait', 'autoCompliance'].includes(property))
            merged.properties[property] = structuredClone(definition);
      } else merged[key] = structuredClone(value);
    }
  if (record(merged.defaultProperity) && record(merged.properties))
    for (const [key, value] of Object.entries(merged.defaultProperity))
      merged.properties[key] = {
        ...(record(merged.properties[key]) ? merged.properties[key] : {}),
        default: value,
      };
  return {
    schema: merged,
    configLocked: extra.config === false,
    modelKeys: extraConfig.models
      .map((model) => model?.modelKey)
      .filter((key) => typeof key === 'string' && key.length > 0),
  };
}

export function generatorSettingLocks(
  schema,
  params = {},
  {
    hiddenKeys = [],
    lockRatioOnly = false,
    forceSingleCount = false,
    inputs = params,
    configLocked = false,
  } = {},
) {
  const keys = fieldKeys(schema?.config?.settings, params.modeType);
  const hidden = new Set(array(hiddenKeys));
  if (params.segmentRemakeLock)
    keys.filter((key) => key.startsWith('ratio')).forEach((key) => hidden.add(key));
  const locked = new Set(
    configLocked ? keys : lockRatioOnly ? keys.filter((key) => key.startsWith('ratio')) : [],
  );
  const settingsPatch = {},
    unresolved = [];
  if (schema?.properties?.derivesDurationFromVideo === true) {
    const videoRefs = [
      ...array(inputs.videoList),
      ...array(inputs.mixedList).filter((ref) => ref?.mediaType === 'video'),
    ];
    const durations = videoRefs.map((ref) => ref.durationSec).filter(positive);
    if (durations.length) {
      const duration = Math.floor(Math.max(...durations));
      if (duration > 0) settingsPatch.duration = duration;
    }
    videoRefs
      .filter((ref) => !positive(ref.durationSec))
      .forEach((ref) => unresolved.push({ nodeId: ref.nodeId, url: ref.url, field: 'duration' }));
  }
  return {
    hiddenKeys: [...hidden],
    lockedKeys: [...locked],
    lockedStoreKeys: [...locked].map((key) => storeKey(key, schema?.properties?.[key])),
    settingsPatch,
    unresolved,
    forceSingleCount: forceSingleCount || params.modeType === 'longVideo2video',
    count: forceSingleCount || params.modeType === 'longVideo2video' ? 1 : params.count,
    modeLocked: params.pictureEditLock === true || params.segmentRemakeLock === true,
  };
}
