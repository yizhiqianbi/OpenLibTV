import {
  cloneStoryboardVideoValue,
  collectStoryboardVideoRowReferences,
  createStoryboardVideoReferenceContext,
  resolveStoryboardVideoAutoPosition,
} from './batch-video-graph-model.js';
import { findScriptPromptRefMatches } from './prompt-compose-model.js';
import { normalizeScriptAssets } from './script-assets-model.js';
import { hasScriptAssetMedia } from './workflow-model.js';
import {
  computeStoryboardNodeDimensionsFromRatio,
  extractStoryboardRatioFromNodeParams,
} from '../domain/storyboard-grid-model.js';

const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const positionValid = (value) => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const ascii = (value) => /^[A-Za-z0-9]$/.test(value);
const messages = {
  'invalid-graph': '画布数据无效，未创建分镜图片组',
  'invalid-script': '当前脚本数据无效，未创建分镜图片组',
  'no-script': '脚本已删除，未创建分镜图片组',
  'not-v2-script': '当前节点不是新版脚本，未创建分镜图片组',
  'invalid-selection': '镜头选择已变化，请重新选择',
  'no-children': '请至少选择一个镜头',
  'invalid-config': '图片模型配置无效，未创建分镜图片组',
  'invalid-position': '分镜图片组位置无效，未创建分镜图片组',
};
const failure = (reason) => ({
  ok: false,
  reason,
  message: messages[reason] || '脚本数据或新节点标识无效，未创建分镜图片组',
  addedNodes: [],
  addedEdges: [],
  nodePatches: [],
  warnings: [],
  submitted: false,
});

function imageRow(row) {
  if (!object(row)) throw new Error('Invalid row');
  if (row.hiddenUuid != null && typeof row.hiddenUuid !== 'string')
    throw new Error('Invalid row UUID');
  if (
    row.shotNumber != null &&
    typeof row.shotNumber !== 'string' &&
    !Number.isFinite(row.shotNumber)
  )
    throw new Error('Invalid shot number');
  if (row.imageGenerationPrompt != null && typeof row.imageGenerationPrompt !== 'string')
    throw new Error('Invalid image prompt');
  if (
    row.finalImagePromptEntityRefs != null &&
    (!Array.isArray(row.finalImagePromptEntityRefs) ||
      row.finalImagePromptEntityRefs.some((ref) => !object(ref) || typeof ref.text !== 'string'))
  )
    throw new Error('Invalid image references');
  // The shared collector has video-named fields, but its role/name/ID ordering
  // is identical. Project only the image source fields; never read video refs.
  return {
    ...row,
    videoMotionPrompt: row.imageGenerationPrompt || row.plotDescription || '',
    finalVideoPromptEntityRefs: row.finalImagePromptEntityRefs,
  };
}

function replaceAtMentions(text, context, indexes) {
  const { names, linked } = context;
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
    const name = orderedNames.find((value) => {
      const end = offset + 1 + value.length;
      return text.startsWith(value, offset + 1) && !ascii(text[end] ?? '');
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

/** 892147 defaults to imageGenerationPrompt; its spoken-text sanitizer is video-only. */
function imagePrompt(row, references, context) {
  const { linked, names, roleById } = context;
  const original = row.imageGenerationPrompt || row.plotDescription || '';
  const indexes = new Map(references.map((ref, index) => [ref.nodeId, index]));
  const allRefs = [
    ...(row.finalImagePromptEntityRefs ?? []),
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
  prompt = replaceAtMentions(prompt, context, indexes);
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
    const labels = { character: '角色', scene: '场景', prop: '道具' };
    const lines = [...anchors]
      .sort(([a], [b]) => a - b)
      .map(
        ([index, ref]) => `${labels[ref.role] ?? '资产'} ${ref.name} 的参考图是 {{Image ${index}}}`,
      );
    prompt = `资产图锚定：\n${lines.join('\n')}\n\n${prompt}`;
  }
  return { prompt, imageLabelList: references.map((_ref, index) => `图片 ${index + 1}`) };
}

/** Raw row indices stay intact; no UUID filtering or generated poster reference is applied. */
export function describeScriptV2ImageReferences({ nodes, scriptId } = {}) {
  const failed = (reason) => ({
    valid: false,
    reason,
    rows: [],
    refsByRow: new Map(),
    refCounts: new Map(),
    prompts: new Map(),
    requiredRefs: 0,
    maxRequiredRefs: 0,
    assetsReady: false,
    assetReadiness: { total: 0, readyCount: 0, pendingCount: 0, pendingAssetIds: [], ready: false },
  });
  try {
    if (!Array.isArray(nodes)) return failed('invalid-graph');
    const lookup = new Map();
    for (const node of nodes) {
      if (!object(node) || typeof node.id !== 'string' || !node.id || lookup.has(node.id))
        return failed('invalid-graph');
      lookup.set(node.id, node);
    }
    const script = lookup.get(scriptId);
    if (!script) return failed('no-script');
    if ((script.type || script.data?.type) !== 'script-v2') return failed('not-v2-script');
    if (!object(script.data) || !Array.isArray(script.data.rows)) return failed('invalid-script');
    const getNodeUrl = (id) => {
      const urls = lookup.get(id)?.data?.url;
      if (urls != null && !Array.isArray(urls)) throw new Error('Invalid URL list');
      const url = urls?.[0];
      if (url != null && typeof url !== 'string') throw new Error('Invalid primary URL');
      return url || undefined;
    };
    const context = createStoryboardVideoReferenceContext({
      nodes,
      assets: script.data.assets,
      getNodeUrl,
    });
    const assetItems = normalizeScriptAssets(script.data).flatMap((group) => group.items);
    const pendingAssetIds = assetItems
      .filter((asset) => !hasScriptAssetMedia(asset, getNodeUrl))
      .map((asset) => asset.id);
    const assetReadiness = {
      total: assetItems.length,
      readyCount: assetItems.length - pendingAssetIds.length,
      pendingCount: pendingAssetIds.length,
      pendingAssetIds,
      ready: !pendingAssetIds.length,
    };
    const refsByRow = new Map(),
      refCounts = new Map(),
      prompts = new Map();
    let requiredRefs = 0;
    const rows = script.data.rows;
    rows.forEach((row, index) => {
      const references = collectStoryboardVideoRowReferences({ row: imageRow(row), context });
      const projected = imagePrompt(row, references, context);
      const previewPrompt = projected.prompt.replace(/\{\{Image (\d+)\}\}/g, '图片$1');
      refsByRow.set(index, { row, references, ...projected, previewPrompt });
      refCounts.set(index, references.length);
      prompts.set(index, previewPrompt);
      requiredRefs = Math.max(requiredRefs, references.length);
    });
    return {
      valid: true,
      reason: '',
      script,
      rows,
      refsByRow,
      refCounts,
      prompts,
      requiredRefs,
      maxRequiredRefs: requiredRefs,
      assetsReady: assetReadiness.ready,
      assetReadiness,
    };
  } catch {
    return failed('invalid-script');
  }
}

function subsetHiddenUuids(rows, allRows) {
  const unique = (items) => [...new Set(items.map((row) => row.hiddenUuid).filter(Boolean))];
  const selected = unique(rows),
    all = unique(allRows);
  return !selected.length || (all.length && all.every((id) => selected.includes(id)))
    ? undefined
    : selected;
}

/** Source store e5: raw flow boxes, 50px margin, vertical minimum penetration, 30 steps. */
function avoidDefaultPlacementOverlap(position, size, nodes) {
  const boxes = nodes.map((node) => {
    const width = node.measured?.width ?? node.width ?? 350,
      height = node.measured?.height ?? node.height ?? 350;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
      throw new Error('Invalid placement dimensions');
    return { ...node.position, width, height };
  });
  const margin = 50;
  let { x, y } = position;
  for (let iteration = 0; iteration < 30; iteration++) {
    let penetration = 0;
    for (const box of boxes)
      if (
        x < box.x + box.width + margin &&
        x + size.width + margin > box.x &&
        y < box.y + box.height + margin &&
        y + size.height + margin > box.y
      )
        penetration = Math.max(
          penetration,
          Math.min(
            Math.abs(box.y + box.height + margin - y),
            Math.abs(y + size.height + margin - box.y),
          ),
        );
    if (penetration === 0) break;
    y += penetration;
  }
  return { x, y };
}

/** Pure sC plan, including its normal two-RAF visual reflow in this one atomic result. */
export function planCanvasScriptV2ImageGraph({
  nodes,
  edges,
  scriptId,
  selectedIndices,
  config,
  modelSchema,
  makeId,
  groupPosition,
} = {}) {
  try {
    const description = describeScriptV2ImageReferences({ nodes, scriptId });
    if (!description.valid) return failure(description.reason);
    if (
      !(selectedIndices instanceof Set) ||
      [...selectedIndices].some(
        (index) => !Number.isInteger(index) || index < 0 || index >= description.rows.length,
      )
    )
      return failure('invalid-selection');
    if (!Array.isArray(edges) || nodes.some((node) => !positionValid(node.position)))
      return failure('invalid-graph');
    const occupied = new Set(nodes.map((node) => node.id));
    for (const edge of edges) {
      if (
        !object(edge) ||
        typeof edge.id !== 'string' ||
        !edge.id ||
        occupied.has(edge.id) ||
        typeof edge.source !== 'string' ||
        typeof edge.target !== 'string'
      )
        return failure('invalid-graph');
      occupied.add(edge.id);
    }
    if (
      !object(config) ||
      typeof config.model !== 'string' ||
      !config.model ||
      (config.settings != null && !object(config.settings)) ||
      (modelSchema != null && !object(modelSchema)) ||
      typeof makeId !== 'function'
    )
      return failure('invalid-config');
    const params = cloneStoryboardVideoValue(config);
    const indices = description.rows
      .map((_row, index) => index)
      .filter((index) => selectedIndices.has(index));
    if (!indices.length) return failure('no-children');
    const { script } = description;
    const label = script.data.title || script.data.name || script.data.label || '脚本';
    if (typeof label !== 'string') return failure('invalid-script');
    const proposedPosition = groupPosition ?? resolveStoryboardVideoAutoPosition(script, nodes);
    if (!positionValid(proposedPosition)) return failure('invalid-position');
    const size = computeStoryboardNodeDimensionsFromRatio(
      extractStoryboardRatioFromNodeParams(params),
    );
    const initialWidth = size.width + 80,
      initialHeight = 60 + indices.length * (size.height + 40);
    const position =
      groupPosition === undefined || groupPosition === null
        ? avoidDefaultPlacementOverlap(
            proposedPosition,
            { width: initialWidth, height: initialHeight },
            nodes,
          )
        : { ...proposedPosition };
    if (!positionValid(position)) return failure('invalid-position');
    // Source 710487's visual vertical reflow is grow-only (36/66/36 layout).
    const width = Math.max(initialWidth, size.width + 72, 80),
      height = Math.max(initialHeight, 66 + indices.length * (size.height + 36), 80);
    const nextId = (kind) => {
      const id = makeId(kind);
      if (typeof id !== 'string' || !id || occupied.has(id)) throw new Error('Invalid ID');
      occupied.add(id);
      return id;
    };
    const groupId = nextId('group'),
      addedEdges = [];
    const children = indices.map((index, ordinal) => {
      const { row, references, prompt, imageLabelList } = description.refsByRow.get(index);
      const id = nextId('image');
      addedEdges.push(
        ...references.map((ref) => ({
          id: nextId('edge'),
          source: ref.nodeId,
          sourceHandle: 'source',
          target: id,
          targetHandle: 'target',
        })),
      );
      return {
        id,
        type: 'image',
        parentId: groupId,
        position: { x: 36, y: 66 + ordinal * (size.height + 36) },
        ...size,
        measured: { ...size },
        data: {
          type: 'image',
          name: `镜头 ${row.shotNumber}`,
          url: [],
          action: 'image_generate',
          contentWidth: size.width,
          contentHeight: size.height,
          _explicitContentDims: true,
          scriptRowHiddenUuid: row.hiddenUuid,
          params: {
            ...cloneStoryboardVideoValue(params),
            prompt,
            modeType: references.length ? 'image2image' : params.modeType || 'text2image',
            imageList: references.length ? references : undefined,
            imageListOrder: references.length ? references.map((ref) => ref.nodeId) : undefined,
            imageLabelList: references.length ? imageLabelList : undefined,
          },
          showGenerator: true,
        },
      };
    });
    addedEdges.push({
      id: nextId('edge'),
      source: scriptId,
      sourceHandle: 'source',
      target: groupId,
      targetHandle: 'target',
    });
    const name = `分镜图 · ${label}`;
    const subset = subsetHiddenUuids(
      indices.map((index) => description.rows[index]),
      description.rows,
    );
    const group = {
      id: groupId,
      type: 'group',
      position: { ...position },
      width,
      height,
      measured: { width, height },
      zIndex: -1001,
      style: {
        background: 'var(--canvas-group-bg)',
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        type: 'group',
        name,
        storyboardGroupType: 'image',
        storyboardTitle: name,
        childNodeIds: children.map((node) => node.id),
        ...(subset ? { storyboardSourceRowHiddenUuids: subset } : {}),
        sourceScriptNodeId: scriptId,
        sourceScriptVersion: 'v2',
        autoResizeToChildren: true,
        autoResizePadding: 40,
        groupLayoutMode: 'vertical',
        nodeWidth: width,
        nodeHeight: height,
      },
    };
    return {
      ok: true,
      reason: '',
      message: '',
      kind: 'image',
      groupId,
      sourceScriptNodeId: scriptId,
      addedNodes: [group, ...children],
      addedEdges,
      nodePatches: [{ nodeId: scriptId, data: { linkedImageGroupId: groupId } }],
      gridWidth: width,
      gridHeight: height,
      initialBounds: { ...position, width: initialWidth, height: initialHeight },
      bounds: { ...position, width, height },
      warnings: [],
      submitted: false,
    };
  } catch {
    return failure('invalid-build-input');
  }
}
