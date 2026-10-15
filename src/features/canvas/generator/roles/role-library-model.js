import { usesMixedGeneratorReferences } from '../reference-actions-model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;
const uri = (value) => typeof value === 'string' && value.length > 0;
const config = (schema, key) => {
  const value = schema?.properties?.modeType?.[key + 'Config'];
  return record(value) && finite(value.videoMax) ? value : null;
};
const maximum = (items, key) => {
  const range = items[key];
  return Array.isArray(range) && range.length === 2 && finite(range[1]) && range[1] >= 0
    ? range[1]
    : 0;
};

export const PUBLIC_ROLE_PAGE_SIZES = Object.freeze([10, 20, 50]);
export const COMPLIANCE_ROLE_PAGE_SIZES = Object.freeze([15, 20, 30]);
export const ROLE_COMPLIANCE_MAX_AGE_MS = 5_184_000_000;

/** Source file-upload tW/t$/tY; the caller reads/cancels DOM metadata and owns File.type accept. */
export function roleUploadSizeError(type, size) {
  const kind = type === 'portrait' ? 'image' : type;
  const readError = {
    image: '无法读取图片信息',
    video: '无法读取视频信息',
    audio: '无法读取音频信息',
  }[kind];
  if (!readError) return '不支持的素材类型';
  if (!finite(size) || size < 0) return readError;
  const maxSize = { image: 30, video: 50, audio: 15 }[kind] * 1024 * 1024;
  if (size > maxSize)
    return {
      image: '图片大小不能超过 30MB',
      video: '视频大小不能超过 50MB',
      audio: '音频大小不能超过 15MB',
    }[kind];
  return null;
}

export function validateRoleUploadMetadata({ type, size, width, height, duration } = {}) {
  const sizeError = roleUploadSizeError(type, size);
  if (sizeError) return sizeError;
  const kind = type === 'portrait' ? 'image' : type;
  const readError = {
    image: '无法读取图片信息',
    video: '无法读取视频信息',
    audio: '无法读取音频信息',
  }[kind];
  // Unknown/NaN media metadata cannot become a successful operator upload.
  if (kind !== 'image' && !positive(duration)) return readError;
  if (kind === 'audio') return duration < 2 || duration > 15 ? '音频时长需在 2s ~ 15s 之间' : null;
  if (kind === 'video' && (duration < 2 || duration > 30)) return '视频时长需在 2s ~ 30s 之间';
  if (!positive(width) || !positive(height)) return readError;
  if (width < 300 || width > 6000 || height < 300 || height > 6000)
    return kind === 'image'
      ? '图片宽高需在 300px ~ 6000px 之间'
      : '视频宽高需在 300px ~ 6000px 之间';
  const ratio = width / height;
  if (kind === 'image' ? ratio <= 0.4 || ratio >= 2.5 : ratio < 0.4 || ratio > 2.5)
    return kind === 'image' ? '图片宽高比需在 0.4 ~ 2.5 之间' : '视频宽高比需在 0.4 ~ 2.5 之间';
  return kind === 'video' && width * height < 409600 ? '视频分辨率需不低于 480p' : null;
}

export function roleAssetId(value) {
  return typeof value === 'string' && value.startsWith('asset://') && value.length > 8
    ? value.slice(8)
    : undefined;
}

export function roleAssetKey(asset) {
  return uri(asset?.assetId) ? asset.assetId : uri(asset?.assetUrl) ? asset.assetUrl : '';
}

export function roleLibraryPage({ page = 1, pageSize = 10, total = 0 } = {}) {
  const size = positive(pageSize) ? Math.max(1, Math.floor(pageSize)) : 10;
  const count = finite(total) ? Math.max(0, Math.floor(total)) : 0;
  const pageCount = Math.max(1, Math.ceil(count / size));
  return {
    page: finite(page) ? Math.max(1, Math.min(pageCount, Math.floor(page))) : 1,
    pageSize: size,
    total: count,
    pageCount,
  };
}

export function roleSelectionCount(selection = {}) {
  return ['images', 'videos', 'audios'].reduce(
    (total, key) =>
      total + (selection[key] instanceof Set ? selection[key].size : array(selection[key]).length),
    0,
  );
}

/** VIDEO 580897 ao/ac/au: ordinary references occupy slots; asset selections occupy the Set. */
export function roleLibraryCapacities({ schema, params = {} } = {}) {
  const images = array(params.imageList),
    videos = array(params.videoList),
    audios = array(params.audioList);
  const ordinaryImages = images.filter((item) => !item?.assetId).length,
    ordinaryVideos = videos.filter((item) => !item?.assetId).length,
    ordinaryAudios = audios.filter((item) => !item?.assetId).length;
  const items = record(schema?.properties?.modeType?.items) ? schema.properties.modeType.items : {};
  const mode = params.modeType ?? 'text2video';
  const mixed = config(schema, 'mixed2video'),
    edit = config(schema, 'videoEdit2video');
  const excludes = array(schema?.config?.excludeModeTypes);
  const mixedImageMaximum = (key) => {
    let count = Math.max(0, maximum(items, key) - videos.length);
    if (finite(mixed?.imageMax)) count = Math.min(count, mixed.imageMax);
    if (videos.length > 0 && finite(mixed?.imageMaxWithVideo))
      count = Math.min(count, mixed.imageMaxWithVideo);
    return count;
  };
  const mixedVideoMaximum = (key) => {
    const count = Math.max(0, maximum(items, key) - images.length);
    return mixed ? Math.min(count, mixed.videoMax) : count;
  };
  const editVideoMaximum = () =>
    Math.min(maximum(items, 'videoEdit2video'), edit?.videoMax ?? Infinity);
  let imageMaximum = 0,
    videoMaximum = 0;
  if (Object.keys(items).length === 0) imageMaximum = videoMaximum = 10;
  else {
    if (['singleImage2video', 'frames2video', 'image2video'].includes(mode))
      imageMaximum = maximum(items, mode);
    else if (['mixed2video', 'videoExtend2video', 'longVideo2video'].includes(mode))
      imageMaximum = mixedImageMaximum(mode);
    else if (mode === 'videoEdit2video')
      imageMaximum =
        videos.length > 0 && finite(edit?.imageMaxWithVideo) ? edit.imageMaxWithVideo : 0;
    if (imageMaximum === 0)
      imageMaximum = Math.max(
        ...['singleImage2video', 'frames2video', 'image2video'].map((key) => maximum(items, key)),
        mixedImageMaximum('mixed2video'),
        ...(excludes.includes('videoExtend2video') ? [] : [mixedImageMaximum('videoExtend2video')]),
      );
    if (['video2video', 'audio2video'].includes(mode)) videoMaximum = maximum(items, mode);
    else if (mode === 'videoEdit2video') videoMaximum = editVideoMaximum();
    else if (['mixed2video', 'videoExtend2video', 'longVideo2video'].includes(mode))
      videoMaximum = mixedVideoMaximum(mode);
    if (videoMaximum === 0)
      videoMaximum = Math.max(
        maximum(items, 'video2video'),
        editVideoMaximum(),
        mixedVideoMaximum('mixed2video'),
        ...(excludes.includes('videoExtend2video') ? [] : [mixedVideoMaximum('videoExtend2video')]),
        maximum(items, 'audio2video'),
      );
    // This source fallback is picker capacity, not proof of an enabled video mode.
    if (videoMaximum === 0) videoMaximum = 9;
  }
  const audioMaximum =
    usesMixedGeneratorReferences(mode, params.model, schema) && finite(mixed?.audioMax)
      ? mixed.audioMax
      : 1;
  return {
    imageSelectableCount: Math.max(0, imageMaximum - ordinaryImages),
    videoSelectableCount: Math.max(0, videoMaximum - ordinaryVideos),
    audioSelectableCount: Math.max(0, audioMaximum - ordinaryAudios),
  };
}

/** Source chip gate and host write gates remain separate. A visible entry may be locked. */
export function roleLibraryAvailability({
  schema,
  params,
  isValidExtraConfig = false,
  restricted = false,
  digitalHuman = schema?.properties?.digitalHuman === true,
  readonly = false,
  ready = true,
  configLocked = false,
  protectionActive = false,
} = {}) {
  const capacities = roleLibraryCapacities({ schema, params });
  return {
    visible:
      capacities.imageSelectableCount > 0 && !isValidExtraConfig && !restricted && !digitalHuman,
    disabled: !ready || readonly || configLocked || protectionActive,
    seedanceTabVisible:
      schema?.properties?.portrait === true ||
      (typeof schema?.modelVendor === 'string' && schema.modelVendor.startsWith('star-video2')),
    capacities,
  };
}

/** Source re.X: preserve the first material for each exact URL, in block/item order. */
export function flattenPublicRoleMaterials(detail) {
  const seen = new Set(),
    result = [];
  for (const block of array(detail?.mediaBlocks))
    for (const item of array(block?.items)) {
      if (!uri(item?.url) || seen.has(item.url)) continue;
      seen.add(item.url);
      result.push({
        url: item.url,
        thumbUrl: item.thumbUrl,
        blockName: block.blockName,
        name: item.label || block.blockName || detail?.name || '',
        assetId: item.assetId,
        complianceCheckedAtMs: item.complianceCheckedAtMs,
        createdAtMs: item.createdAtMs,
      });
    }
  return result;
}

export function publicRoleRemainingCapacity(imageSelectableCount, existingImageUris = []) {
  return finite(imageSelectableCount)
    ? Math.max(0, imageSelectableCount - array(existingImageUris).length)
    : 4;
}

export function toggleRoleSelection(selection, key, limit) {
  if (!(selection instanceof Set) || !uri(key)) return selection;
  const next = new Set(selection);
  if (next.has(key)) next.delete(key);
  else {
    if (!finite(limit) || next.size >= limit) return selection;
    next.add(key);
  }
  return next;
}

export function roleComplianceCheckedAt(asset) {
  return positive(asset?.complianceCheckedAtMs)
    ? asset.complianceCheckedAtMs
    : asset?.createdAtMsIsLocalPlaceholder
      ? undefined
      : positive(asset?.createdAtMs)
        ? asset.createdAtMs
        : undefined;
}

export function isRoleComplianceExpired(asset, now = Date.now()) {
  const checkedAt = roleComplianceCheckedAt(asset);
  return (
    checkedAt === undefined ||
    !finite(now) ||
    checkedAt > now ||
    now - checkedAt >= ROLE_COMPLIANCE_MAX_AGE_MS
  );
}

/** A read-only plan: new/expired material requires an explicit writer, never fake certificates. */
export function publicRoleCompliancePlan({ selected, materials, now = Date.now() } = {}) {
  const byUrl = new Map(array(materials).map((item) => [item?.url, item]));
  const readyUris = [],
    cachedAssets = [],
    requests = [];
  for (const url of selected instanceof Set ? selected : array(selected)) {
    if (!uri(url)) continue;
    const item = byUrl.get(url);
    if (uri(item?.assetId) && !isRoleComplianceExpired(item, now)) {
      readyUris.push(`asset://${item.assetId}`);
      const checkedAt = roleComplianceCheckedAt(item);
      cachedAssets.push({
        uuid: item.assetId,
        assetUrl: url,
        assetId: item.assetId,
        assetType: 'image',
        status: 1,
        createdAtMs: item.createdAtMs ?? checkedAt ?? 0,
        updatedAtMs: item.createdAtMs ?? checkedAt ?? 0,
        complianceCheckedAtMs: checkedAt,
      });
    } else requests.push({ url, force: !!item?.assetId });
  }
  return { readyUris, cachedAssets, requests };
}

const keyed = (entries, key) => (entries instanceof Map ? entries.get(key) : entries?.[key]);
/** Explicit per-URL results are supplied by a real/injected adapter, not manufactured here. */
export function publicRoleConfirmUris({
  selected,
  existingImages = [],
  existingVideos = [],
  existingAudios = [],
  requireCompliance = false,
  certificates,
} = {}) {
  const urls = [...new Set(selected instanceof Set ? selected : array(selected))].filter(uri);
  if (urls.length === 0) return null;
  const incoming = [],
    assets = [];
  let partialFailed = false;
  for (const url of urls) {
    if (!requireCompliance) incoming.push(url);
    else {
      const certificate = keyed(certificates, url);
      if (certificate?.status === 1 && uri(certificate.assetId)) {
        incoming.push(`asset://${certificate.assetId}`);
        if (record(certificate.asset)) assets.push(certificate.asset);
      } else if (certificate?.status === 1 && certificate.exempt === true) {
        incoming.push(url);
        if (record(certificate.asset)) assets.push(certificate.asset);
      } else partialFailed = true;
    }
  }
  if (incoming.length === 0) return null;
  return {
    images: [...new Set([...array(existingImages), ...incoming])],
    videos: array(existingVideos),
    audios: array(existingAudios),
    assets,
    partialFailed,
  };
}

/** Source t4.tm: image/portrait use the same Set; selected records survive pagination. */
export function complianceRoleSelectionUris({
  images,
  videos,
  audios,
  assetsByKey,
  now = Date.now(),
} = {}) {
  const assets = [];
  const convert = (selection) =>
    [...(selection instanceof Set ? selection : array(selection))].flatMap((key) => {
      if (!uri(key)) return [];
      const asset = keyed(assetsByKey, key);
      if (asset && isRoleComplianceExpired(asset, now)) return [];
      if (asset) assets.push(asset);
      return [
        uri(asset?.assetId)
          ? `asset://${asset.assetId}`
          : uri(asset?.assetUrl)
            ? asset.assetUrl
            : key.startsWith('http')
              ? key
              : `asset://${key}`,
      ];
    });
  return {
    images: convert(images),
    videos: convert(videos),
    audios: convert(audios),
    assets,
    partialFailed: false,
  };
}
