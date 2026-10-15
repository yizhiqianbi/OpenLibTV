import {
  buildScriptAssetIdToNameMap,
  buildScriptAssetNameMap,
  findScriptPromptRefMatches,
  parseScriptAssetMentions,
} from './prompt-compose-model.js';
import { resolveStoryboardBatchVideoShots } from './batch-video-config-model.js';
import {
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
} from '../domain/storyboard-grid-model.js';

const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const finitePosition = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const ascii = (value) => /^[A-Za-z0-9]$/.test(value);
const buckets = (assets) => ['characters', 'scenes', 'props'].map((key) => assets?.[key] ?? []);
const roles = ['character', 'scene', 'prop'];
const CERTIFICATE_MAX_AGE_MS = 5_184_000_000;
const failureMessages = {
  'invalid-graph': '画布节点或连线数据无效，未创建视频组',
  'invalid-config': '视频配置无效，未创建视频组',
  'invalid-first-image-url': '分镜首张图片地址无效，未创建视频组',
  'invalid-group-label': '分镜组名称无效，未创建视频组',
  'invalid-position': '视频组位置无效，未创建视频组',
  'invalid-build-input': '分镜数据或新节点标识无效，未创建视频组',
  'stale-image-group': '此分镜组已被替换，请打开当前关联的图片组',
  'no-children': '当前没有可用于创建视频组的分镜图',
  'no-script': '关联脚本已删除，未创建视频组',
  'no-source': '分镜图片组已删除，未创建视频组',
  'not-v1-image-group': '此分组不支持当前批量视频配置',
};

function cloneValue(value, seen = new Set()) {
  if (value === null || value === undefined || ['string', 'boolean'].includes(typeof value))
    return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || seen.has(value)) throw new Error('Invalid document value');
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => cloneValue(item, seen))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item, seen)]));
  seen.delete(value);
  return result;
}

function validateAssetsAndRows(assets, rows) {
  if (assets != null && !object(assets)) throw new Error('Invalid assets');
  for (const items of buckets(assets)) {
    if (!Array.isArray(items) || items.some((item) => !object(item)))
      throw new Error('Invalid assets');
  }
  const refs = (items) => {
    if (
      items != null &&
      (!Array.isArray(items) ||
        items.some((item) => !object(item) || typeof item.text !== 'string'))
    )
      throw new Error('Invalid entity references');
  };
  for (const row of rows) {
    for (const key of ['videoMotionPrompt', 'plotDescription'])
      if (row[key] != null && typeof row[key] !== 'string') throw new Error('Invalid prompt');
    for (const key of ['characters', 'sceneAssetIds', 'propAssetIds', 'dialogueLines'])
      if (row[key] != null && !Array.isArray(row[key])) throw new Error('Invalid row references');
    if (row.characters?.some((item) => !object(item))) throw new Error('Invalid characters');
    refs(row.finalVideoPromptEntityRefs);
    refs(row.plotDescriptionEntityRefs);
    for (const line of row.dialogueLines ?? []) {
      if (!object(line)) throw new Error('Invalid dialogue');
      refs(line.entityRefs);
    }
  }
}

function assetRoleMap(assets) {
  const result = new Map();
  buckets(assets).forEach((items, index) => {
    for (const item of items)
      if (typeof item.id === 'string' && item.id.trim()) result.set(item.id, roles[index]);
  });
  return result;
}

/** 225860 e_: this caller supplies url[0], not the script asset's thumbnail or asset ID. */
function assetLinkedMap(assets, nodes, getNodeUrl) {
  const result = new Map();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const items of buckets(assets)) {
    for (const item of items) {
      if (!item.id || !item.linkedNodeId) continue;
      const value = getNodeUrl
        ? getNodeUrl(item.linkedNodeId)
        : byId.get(item.linkedNodeId)?.data?.url?.[0];
      if (typeof value === 'string' && value.length)
        result.set(item.id, { nodeId: item.linkedNodeId, url: value });
      else if (object(value) && typeof value.url === 'string' && value.url) {
        result.set(item.id, {
          nodeId: item.linkedNodeId,
          url: value.url,
          ...(value.assetId ? { assetId: value.assetId } : {}),
          ...(value.compliantExempt ? { compliantExempt: true } : {}),
          ...(value.complianceCheckedAtMs
            ? { complianceCheckedAtMs: value.complianceCheckedAtMs }
            : {}),
          ...(value.sourceCreatedAtMs ? { sourceCreatedAtMs: value.sourceCreatedAtMs } : {}),
          ...(value.sourceCreatedAtMsIsLocalPlaceholder
            ? { sourceCreatedAtMsIsLocalPlaceholder: true }
            : {}),
        });
      }
    }
  }
  return result;
}

/** 892147 collectRowAssetReferences: role buckets preserve their source insertion order. */
function rowAssetReferences(row, assets, roleById) {
  const groups = { character: [], scene: [], prop: [] };
  const seen = new Set();
  const add = (id, fallback) => {
    if (!id || seen.has(id)) return;
    const role = roleById.get(id) ?? fallback;
    if (role) {
      seen.add(id);
      groups[role].push(id);
    }
  };
  for (const item of row.characters ?? []) add(item.characterAssetId, 'character');
  for (const ref of row.finalVideoPromptEntityRefs ?? []) add(ref.assetId);
  for (const id of row.sceneAssetIds ?? []) add(id, 'scene');
  for (const id of row.propAssetIds ?? []) add(id, 'prop');
  const prompt = row.videoMotionPrompt || row.plotDescription || '';
  for (const part of parseScriptAssetMentions(prompt, buildScriptAssetNameMap(assets)))
    if (part.type === 'mention') add(part.assetId);
  for (const match of prompt.matchAll(/[@＠]([A-Za-z0-9_-]+)/g)) add(match[1]);
  return [...groups.character, ...groups.scene, ...groups.prop];
}

function replaceAtMentions(text, names, linked, indexes) {
  const nameToId = new Map();
  for (const [id, name] of names) {
    const trimmed = name.trim();
    if (trimmed && !nameToId.has(trimmed)) nameToId.set(trimmed, id);
  }
  const orderedNames = [...nameToId.keys()].sort((a, b) => b.length - a.length);
  const matches = [];
  for (let offset = 0; offset < text.length;) {
    if (!['@', '＠'].includes(text[offset]) || (offset > 0 && ascii(text[offset - 1]))) {
      offset += 1;
      continue;
    }
    const id = text.slice(offset + 1).match(/^[A-Za-z0-9_-]+/)?.[0];
    if (id && names.has(id)) {
      matches.push({ start: offset, end: offset + 1 + id.length, id, name: names.get(id) });
      offset += 1 + id.length;
      continue;
    }
    const name = orderedNames.find((item) => {
      const end = offset + 1 + item.length;
      return text.startsWith(item, offset + 1) && !ascii(text[end] ?? '');
    });
    if (name) {
      const end = offset + 1 + name.length;
      matches.push({ start: offset, end, id: nameToId.get(name), name });
      offset = end;
    } else offset += 1;
  }
  let result = text;
  for (const match of matches.reverse()) {
    if (
      result.slice(match.end, match.end + 9) === '({{Image ' &&
      result.slice(match.start, match.end) === `@${match.name}`
    )
      continue;
    const index = indexes.get(linked.get(match.id)?.nodeId);
    const value = index == null ? match.name : `@${match.name}({{Image ${index + 1}}})`;
    result = result.slice(0, match.start) + value + result.slice(match.end);
  }
  return result;
}

/** 52013 sanitizes only quotes introduced as spoken dialogue, not ordinary quoted descriptions. */
function sanitizeSpoken(text, refs, names) {
  const ordered = [
    ...new Set(
      [...refs.map((ref) => ref.text.trim()), ...names.values()]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length);
  const strip = (content) => {
    let result = '';
    for (let index = 0; index < content.length; index += 1) {
      if (
        ['@', '＠'].includes(content[index]) &&
        !(index > 0 && ascii(content[index - 1])) &&
        ordered.some(
          (name) =>
            content.startsWith(name, index + 1) && !ascii(content[index + 1 + name.length] ?? ''),
        )
      )
        continue;
      result += content[index];
    }
    for (const name of ordered) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(`${escaped}\\(\\{\\{Image \\d+\\}\\}\\)`, 'g'), name);
    }
    return result;
  };
  let result = '';
  for (let offset = 0; offset < text.length;) {
    const open = text[offset];
    const close = open === '"' ? '"' : open === '“' ? '”' : null;
    if (!close) {
      result += open;
      offset += 1;
      continue;
    }
    const end = text.indexOf(close, offset + 1);
    if (end < 0) return result + text.slice(offset);
    const prefix = text.slice(Math.max(0, offset - 48), offset).toLowerCase();
    const spoken =
      /(?:对白|旁白|台词|dialogue|voiceover)\s*[:：]?\s*$|(?:说道|说|喊|问|答|道|says?|said)\s*[:：]?\s*$/.test(
        prefix,
      );
    const content = text.slice(offset + 1, end);
    result += open + (spoken ? strip(content) : content) + close;
    offset = end + 1;
  }
  return result;
}

function promptWithRefs(row, references, linked, names, roleById) {
  const original = row.videoMotionPrompt || row.plotDescription || '';
  const indexes = new Map(references.map((ref, index) => [ref.nodeId, index]));
  const allRefs = [
    ...(row.finalVideoPromptEntityRefs ?? []),
    ...(row.plotDescriptionEntityRefs ?? []),
    ...(row.dialogueLines ?? []).flatMap((line) => line.entityRefs ?? []),
  ].sort((a, b) => b.text.length - a.text.length);
  const eligible = allRefs.filter((ref) => {
    const min = /[A-Za-z0-9]/.test(ref.text) ? 3 : 2;
    return Array.from(ref.text).length >= min && names.has(ref.assetId);
  });
  let prompt = original;
  for (const match of findScriptPromptRefMatches(original, eligible).reverse()) {
    const name = names.get(match.ref.assetId);
    if (!name || original.slice(match.end, match.end + 9) === '({{Image ') continue;
    const index = indexes.get(linked.get(match.ref.assetId)?.nodeId);
    const value = index == null ? name : `@${name}({{Image ${index + 1}}})`;
    prompt = prompt.slice(0, match.start) + value + prompt.slice(match.end);
  }
  prompt = sanitizeSpoken(replaceAtMentions(prompt, names, linked, indexes), allRefs, names);
  const namesByIndex = new Map();
  for (const [id, name] of names) {
    const index = indexes.get(linked.get(id)?.nodeId);
    if (index == null) continue;
    const entries = namesByIndex.get(index + 1) ?? new Map();
    entries.set(name, roleById.get(id));
    namesByIndex.set(index + 1, entries);
  }
  const removeTokens = (text) =>
    text.replace(/\{\{(?:Image|Portrait|Video|Audio|Mixed)\s+\d+\}\}/g, '');
  const anchors = new Map();
  prompt = prompt.replace(/[@＠]([^@＠\n]+?)\(\{\{Image (\d+)\}\}\)/g, (_match, name, number) => {
    const index = Number.parseInt(number, 10);
    const entries = namesByIndex.get(index);
    const cleaned = removeTokens(name);
    if (!entries?.has(name)) return cleaned;
    if (!anchors.has(index)) anchors.set(index, { name: cleaned, role: entries.get(name) });
    return cleaned;
  });
  if (anchors.size) {
    const roleLabels = { character: '角色', scene: '场景', prop: '道具' };
    const lines = [...anchors]
      .sort(([a], [b]) => a - b)
      .map(
        ([index, ref]) =>
          `${roleLabels[ref.role] ?? '资产'} ${ref.name} 的参考图是 {{Image ${index}}}`,
      );
    prompt = `资产图锚定：\n${lines.join('\n')}\n\n${prompt}`;
  }
  return { prompt, imageLabelList: references.map((_ref, index) => `图片 ${index + 1}`) };
}

function modeLimits(schema, mode) {
  const value = schema?.properties?.modeType?.items?.[mode];
  if (!Array.isArray(value) || value.length < 2) return null;
  const [min, max] = value;
  return Number.isFinite(min) && Number.isFinite(max) && max > 0 && max >= min ? [min, max] : null;
}
function mixedMax(schema) {
  const limits = modeLimits(schema, 'mixed2video');
  if (!limits) return 0;
  const configured = schema.properties?.modeType?.mixed2videoConfig?.imageMax;
  return Math.max(0, Number.isFinite(configured) ? Math.min(limits[1], configured) : limits[1]);
}
function preferredMixedMode(schema, required, current) {
  const limits = modeLimits(schema, 'mixed2video');
  const max = mixedMax(schema);
  if (!limits || max <= 0) return null;
  if (current === 'mixed2video' && required > 0 && required >= limits[0] && required <= max)
    return current;
  return required > 0 && required < limits[0] ? null : 'mixed2video';
}
function directMode(schema, count) {
  const items = schema?.properties?.modeType?.items ?? {};
  const max = (mode) =>
    Array.isArray(items[mode]) && typeof items[mode][1] === 'number' ? items[mode][1] : 0;
  if (count === 0) return 'text2video' in items ? 'text2video' : null;
  if (max('image2video') >= count) return 'image2video';
  return count === 1 && max('singleImage2video') >= 1 ? 'singleImage2video' : null;
}

function certificateFresh(value, nowMs) {
  return positive(value) && value <= nowMs && nowMs - value < CERTIFICATE_MAX_AGE_MS;
}
function certificateTime(child) {
  const data = child.data ?? {};
  return positive(data.portraitComplianceCheckedAtMs)
    ? data.portraitComplianceCheckedAtMs
    : child.createdAtMsIsLocalPlaceholder
      ? undefined
      : child.createdAtMs;
}
function existingCertificate(child, nowMs) {
  const data = child.data ?? {};
  if (!certificateFresh(certificateTime(child), nowMs)) return null;
  if (typeof data.portraitAssetId === 'string' && data.portraitAssetId)
    return { assetId: data.portraitAssetId };
  return data.portraitCompliantExempt === true ? { exempt: true } : null;
}
function autoComplianceEnabled(config) {
  const property = config.modelSchema.properties?.autoCompliance;
  if (property?.enable !== true) return false;
  const value = config.advancedSettings?.autoCompliance;
  return value === undefined
    ? property.default === 1 || property.default === true
    : value === 1 || value === true;
}

/** Source 240669 uses stored flow positions and measured→stored widths, with a 200px gap. */
function autoGroupPosition(script, nodes) {
  const width = (node, fallback) => {
    const value =
      typeof node.measured?.width === 'number'
        ? node.measured.width
        : typeof node.width === 'number'
          ? node.width
          : fallback;
    if (!Number.isFinite(value)) throw new Error('Invalid layout size');
    return value;
  };
  const scriptWidth = width(script, 600);
  const related = nodes.filter(
    (node) =>
      ['group', 'video_group'].includes(node.type) &&
      node.data?.sourceScriptNodeId === script.id &&
      node.position.x >= script.position.x + scriptWidth / 2,
  );
  return {
    x: related.length
      ? Math.max(...related.map((node) => node.position.x + width(node, 0))) + 200
      : script.position.x + scriptWidth + 200,
    y: script.position.y,
  };
}

/** Shared 225860/892147 glue. V1 keeps its URL-only getter; V2 supplies node metadata. */
export function createStoryboardVideoReferenceContext({ nodes, assets, getNodeUrl } = {}) {
  validateAssetsAndRows(assets, []);
  return {
    linked: assetLinkedMap(assets, nodes, getNodeUrl),
    names: buildScriptAssetIdToNameMap(assets),
    roleById: assetRoleMap(assets),
    assets,
  };
}

export function collectStoryboardVideoRowReferences({ row, context } = {}) {
  validateAssetsAndRows(context.assets, [row]);
  const references = [],
    seen = new Set();
  for (const id of rowAssetReferences(row, context.assets, context.roleById)) {
    const ref = context.linked.get(id);
    if (!ref || seen.has(ref.nodeId)) continue;
    seen.add(ref.nodeId);
    references.push({ ...ref });
  }
  return references;
}

export function projectStoryboardVideoPrompt({ row, references, context } = {}) {
  return promptWithRefs(row, references, context.linked, context.names, context.roleById);
}

export {
  cloneValue as cloneStoryboardVideoValue,
  autoGroupPosition as resolveStoryboardVideoAutoPosition,
  preferredMixedMode as resolveStoryboardVideoReferenceMode,
  mixedMax as storyboardVideoReferenceMax,
};

/**
 * Pure v1 image-group→empty-video-group plan. Caller owns CAS, drafts, history, saving and services.
 * makeId(kind) is explicitly supplied; no clock/crypto/store/network is accessed here.
 * portraitResults are trusted adapter results, bound to current child ID and its exact url[0].
 */
export function planCanvasBatchVideoGraph({
  nodes,
  edges,
  imageGroupId,
  config,
  makeId,
  groupPosition,
  portraitResults = [],
  nowMs,
} = {}) {
  const failed = (reason, blocked = false, message = '') => ({
    ok: false,
    reason,
    blocked,
    message: message || failureMessages[reason] || '分镜数据已变化或无效，未创建视频组',
    addedNodes: [],
    addedEdges: [],
    nodePatches: [],
    warnings: [],
    portraitRequired: [],
    submitted: false,
  });
  try {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return failed('invalid-graph');
    const occupied = new Set();
    for (const node of nodes) {
      if (
        !node ||
        typeof node.id !== 'string' ||
        !node.id ||
        occupied.has(node.id) ||
        !finitePosition(node.position)
      )
        return failed('invalid-graph');
      occupied.add(node.id);
    }
    for (const edge of edges) {
      if (
        !edge ||
        typeof edge.id !== 'string' ||
        !edge.id ||
        occupied.has(edge.id) ||
        typeof edge.source !== 'string' ||
        typeof edge.target !== 'string'
      )
        return failed('invalid-graph');
      occupied.add(edge.id);
    }
    const source = resolveStoryboardBatchVideoShots({
      nodes,
      groupId: imageGroupId,
      phase: 'submit',
    });
    if (!source.valid || !source.enabled) return failed(source.reason || 'invalid-target');
    if (
      !object(config) ||
      typeof config.model !== 'string' ||
      !config.model ||
      !object(config.modelSchema) ||
      typeof makeId !== 'function'
    )
      return failed('model-unavailable', true, '视频模型配置尚未加载');
    if (config.settings != null && !object(config.settings)) return failed('invalid-config');
    if (config.modeType != null && typeof config.modeType !== 'string')
      return failed('invalid-config');
    const { group, script, shots, rows } = source;
    const label =
      group.data?.name || group.data?.characterAsset?.roleName || group.data?.label || '分镜组';
    if (typeof label !== 'string') return failed('invalid-group-label');
    validateAssetsAndRows(script.data?.assets, rows);
    if (shots.some((shot) => typeof shot.firstImageUrl !== 'string'))
      return failed('invalid-first-image-url');
    const settings = cloneValue(config.settings ?? {});
    const linked = assetLinkedMap(script.data?.assets, nodes);
    const names = buildScriptAssetIdToNameMap(script.data?.assets);
    const roleById = assetRoleMap(script.data?.assets);
    const portrait = config.modelSchema.properties?.portrait === true;
    const certificates = new Map();
    const nodePatches = [];
    if (portrait) {
      const portraitShots = shots.filter((shot) => shot.firstImageUrl);
      const blocked = (required = portraitShots) => ({
        ...failed(
          'portrait-unverified',
          true,
          '该模型需要有效的人像审核，审核服务尚未连接或证书已失效，未创建视频组',
        ),
        portraitRequired: required.map((shot) => ({
          childId: shot.child.id,
          url: shot.firstImageUrl,
        })),
      });
      if (!Array.isArray(portraitResults) || (portraitShots.length && !positive(nowMs)))
        return blocked();
      const certifiedShots = shots.filter(
        ({ child }) => child.data?.portraitAssetId || child.data?.portraitCompliantExempt,
      );
      if (certifiedShots.length && !positive(nowMs)) return blocked();
      if (
        !autoComplianceEnabled(config) &&
        certifiedShots.some(({ child }) => !certificateFresh(certificateTime(child), nowMs))
      )
        return failed(
          'compliance-failed',
          true,
          '该分镜的人像审核已失效，请先重新完成审核，未创建视频组',
        );
      const results = new Map();
      for (const result of portraitResults) {
        const shot = portraitShots.find((value) => value.child.id === result?.childId);
        if (!shot || results.has(result.childId) || result.url !== shot.firstImageUrl)
          return failed(
            'portrait-owner-changed',
            true,
            '人像合规结果与当前分镜图不匹配，请重新检查',
          );
        if (
          result.status !== 'approved' ||
          !certificateFresh(result.checkedAtMs, nowMs) ||
          !((typeof result.assetId === 'string' && result.assetId) || result.exempt === true)
        )
          return blocked();
        results.set(result.childId, result);
      }
      const required = [];
      for (const shot of portraitShots) {
        const { child } = shot;
        const result = results.get(child.id);
        const certificate = result
          ? typeof result.assetId === 'string' && result.assetId
            ? { assetId: result.assetId }
            : { exempt: true }
          : existingCertificate(child, nowMs);
        if (!certificate) {
          required.push(shot);
          continue;
        }
        certificates.set(child.id, certificate);
        if (result)
          nodePatches.push({
            nodeId: child.id,
            data: {
              portraitAssetId: certificate.assetId,
              portraitCompliantExempt: certificate.exempt || undefined,
              portraitComplianceCheckedAtMs: result.checkedAtMs,
            },
          });
      }
      if (required.length) return blocked(required);
    }
    const size = computeStoryboardNodeDimensionsFromRatio(
      extractStoryboardRatioFromNodeParams(config),
    );
    const position = groupPosition ?? autoGroupPosition(script, nodes);
    if (!finitePosition(position)) return failed('invalid-position');
    const columns = Math.ceil(Math.sqrt(Math.max(shots.length, 1)));
    const stats = {
      portraitTruncatedCount: 0,
      portraitTruncatedShotCount: 0,
      directModeTruncatedCount: 0,
      directModeTruncatedShotCount: 0,
      modeTruncatedCount: 0,
      modeTruncatedShotCount: 0,
      unsupportedCount: 0,
      unsupportedShotCount: 0,
    };
    const plans = shots.map(({ row, child, firstImageUrl: url }) => {
      const certificate = certificates.get(child.id);
      const refs = url
        ? [
            {
              nodeId: child.id,
              url,
              ...(certificate?.assetId ? { assetId: certificate.assetId } : {}),
            },
          ]
        : [];
      const seen = new Set(refs.map((ref) => ref.nodeId));
      for (const id of rowAssetReferences(row, script.data?.assets, roleById)) {
        const asset = linked.get(id);
        if (!asset || seen.has(asset.nodeId)) continue;
        seen.add(asset.nodeId);
        refs.push({
          nodeId: asset.nodeId,
          url: asset.url,
          ...(asset.assetId ? { assetId: asset.assetId } : {}),
          ...(asset.compliantExempt ? { compliantExempt: true } : {}),
        });
      }
      if (portrait && url && refs.length > 1) {
        stats.portraitTruncatedCount += refs.length - 1;
        stats.portraitTruncatedShotCount += 1;
        refs.length = 1;
      }
      let modeType;
      if (!url && !refs.length) modeType = 'text2video';
      else if (!url) {
        modeType = preferredMixedMode(config.modelSchema, refs.length, config.modeType);
        const max = modeType ? mixedMax(config.modelSchema) : 0;
        if (modeType && max > 0) {
          if (refs.length > max) {
            stats.directModeTruncatedCount += refs.length - max;
            stats.directModeTruncatedShotCount += 1;
            refs.length = max;
          }
        } else {
          modeType = 'text2video';
          stats.unsupportedCount += refs.length;
          stats.unsupportedShotCount += 1;
          refs.length = 0;
        }
      } else {
        modeType =
          directMode(config.modelSchema, refs.length) ?? config.modeType ?? 'singleImage2video';
        if (modeType === 'singleImage2video' && refs.length > 1) {
          stats.modeTruncatedCount += refs.length - 1;
          stats.modeTruncatedShotCount += 1;
          refs.length = 1;
        } else if (modeType === 'text2video' && refs.length) {
          stats.modeTruncatedCount += refs.length;
          stats.modeTruncatedShotCount += 1;
          refs.length = 0;
        }
      }
      return { row, url, refs, modeType, ...promptWithRefs(row, refs, linked, names, roleById) };
    });
    const nextId = (kind) => {
      const id = makeId(kind);
      if (typeof id !== 'string' || !id || occupied.has(id)) throw new Error('Invalid new ID');
      occupied.add(id);
      return id;
    };
    const groupId = nextId('video_group');
    const addedEdges = [];
    const addedChildren = plans.map((plan, index) => {
      const id = nextId('video');
      addedEdges.push(
        ...plan.refs.map((ref) => ({
          id: nextId('edge'),
          source: ref.nodeId,
          sourceHandle: 'source',
          target: id,
          targetHandle: 'target',
        })),
      );
      return {
        id,
        type: 'video',
        parentId: groupId,
        ...size,
        measured: { ...size },
        position: {
          x: 40 + (index % columns) * (size.width + 40),
          y: 70 + Math.floor(index / columns) * (size.height + 40),
        },
        data: {
          type: 'video',
          action: 'video_generate',
          name: `分镜视频-#${plan.row.shotNumber ?? index + 1}`,
          url: [],
          poster: plan.url,
          params: {
            prompt: plan.prompt,
            model: config.model,
            modeType: plan.modeType,
            settings: cloneValue(settings),
            image: plan.modeType === 'text2video' ? '' : plan.url,
            imageList: plan.refs,
            imageListOrder: plan.refs.length ? plan.refs.map((ref) => ref.nodeId) : undefined,
            imageLabelList: plan.refs.length ? plan.imageLabelList : undefined,
            scene: 'group-generate',
          },
          _explicitContentDims: true,
          contentWidth: size.width,
          contentHeight: size.height,
        },
      };
    });
    addedEdges.push({
      id: nextId('edge'),
      source: group.id,
      sourceHandle: 'source',
      target: groupId,
      targetHandle: 'target',
    });
    const gridRows = Math.ceil(addedChildren.length / columns);
    const gridWidth = 80 + columns * size.width + (columns - 1) * 40;
    const gridHeight = 110 + gridRows * size.height + (gridRows - 1) * 40;
    const name = `视频组 · ${label}`;
    const addedGroup = {
      id: groupId,
      type: 'group',
      position: { ...position },
      width: gridWidth,
      height: gridHeight,
      measured: { width: gridWidth, height: gridHeight },
      zIndex: -1001,
      style: {
        background: 'var(--canvas-storyboard-group-shell-bg, #212121)',
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        type: 'group',
        name,
        groupColor: null,
        sourceScriptNodeId: script.id,
        sourceImageGroupId: group.id,
        storyboardTitle: name,
        storyboardGroupType: 'video',
        sourceScriptVersion: 'v1',
      },
    };
    nodePatches.push({ nodeId: script.id, data: { linkedVideoGroupId: groupId } });
    const warnings = [];
    const warn = (count, key, shotCount, refCount) => {
      if (count > 0) warnings.push({ key, values: { shotCount, refCount } });
    };
    warn(
      stats.portraitTruncatedCount,
      'canvas:videoRefTruncatePortraitSingleFrame',
      stats.portraitTruncatedShotCount,
      stats.portraitTruncatedCount,
    );
    warn(
      stats.directModeTruncatedCount,
      'canvas:videoRefTruncateDirectCapacity',
      stats.directModeTruncatedShotCount,
      stats.directModeTruncatedCount,
    );
    warn(
      stats.modeTruncatedCount,
      'canvas:videoRefTruncateModeCapacity',
      stats.modeTruncatedShotCount,
      stats.modeTruncatedCount,
    );
    warn(
      stats.unsupportedCount,
      'canvas:storyboardVideoRefUnsupportedByModel',
      stats.unsupportedShotCount,
      stats.unsupportedCount,
    );
    return {
      ok: true,
      reason: '',
      blocked: false,
      groupId,
      sourceScriptNodeId: script.id,
      addedNodes: [addedGroup, ...addedChildren],
      addedEdges,
      nodePatches,
      gridWidth,
      gridHeight,
      warnings,
      portraitRequired: [],
      submitted: false,
    };
  } catch {
    return failed('invalid-build-input');
  }
}
