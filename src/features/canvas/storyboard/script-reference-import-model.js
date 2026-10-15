import { resolveScriptV2ResourcePlacement } from './script-preset-model.js';

export const SCRIPT_V2_REFERENCE_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export const SCRIPT_V2_REFERENCE_FILE_MAX_BYTES = 30 * 1024 * 1024;
const imageTypes = new Set(SCRIPT_V2_REFERENCE_IMAGE_ACCEPT.split(','));
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const idValid = (value) => typeof value === 'string' && value.trim().length > 0;
const usable = (value) => typeof value === 'string' && value.trim().length > 0;
const failure = (reason) => ({
  valid: false,
  reason,
  addedNodes: [],
  addedEdges: [],
  nodeIds: [],
  results: [],
  added: 0,
  failed: 0,
  skipped: 0,
  submitted: false,
  uploaded: false,
});

/** Source M skips strictly >30MiB; MIME and malformed metadata guards are local. */
export function validateScriptV2ReferenceFile(file) {
  if (
    !record(file) ||
    typeof file.name !== 'string' ||
    !Number.isFinite(file.size) ||
    file.size < 0
  )
    return { valid: false, reason: 'invalid-file', skipped: false };
  if (file.size > SCRIPT_V2_REFERENCE_FILE_MAX_BYTES)
    return { valid: false, reason: 'file-too-large', skipped: true };
  if (!imageTypes.has(file.type))
    return { valid: false, reason: 'unsupported-file-type', skipped: false };
  return { valid: true, reason: '', skipped: false };
}

function firstUrl(value) {
  return Array.isArray(value) ? value.find(usable) : usable(value) ? value : undefined;
}

/** Source 55061 scans all items for the first IMAGE with a usable current/original URL. */
export function resolveScriptV2ImageAsset({ data, name } = {}) {
  const invalid = (reason) => ({ valid: false, reason, image: null });
  if (typeof data !== 'string') return invalid('invalid-asset');
  try {
    const parsed = JSON.parse(data),
      items = parsed?.items ?? [];
    if (!Array.isArray(items)) return invalid('invalid-asset');
    for (const item of items) {
      if (!record(item)) return invalid('invalid-asset');
      if (item.data?.type !== 'image') continue;
      const url = firstUrl(item.data.url) ?? firstUrl(item.data.originalUrl);
      if (!url) continue;
      return {
        valid: true,
        reason: '',
        image: { url, name: usable(item.data.name) ? item.data.name : name },
      };
    }
    return invalid('no-image-asset');
  } catch {
    return invalid('invalid-asset');
  }
}

/**
 * Source creates one new root per successful item, then appends its edge. addedNodes
 * is the final prepend order (reverse success order); nodeIds/edges keep input order.
 * Reads/upload jobs, actor ownership, history and persistence belong to the caller.
 */
export function planScriptV2ReferenceImport({ nodes, edges, targetId, items, makeId } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(items))
    return failure('invalid-input');
  const usedIds = new Set(),
    lookup = new Map();
  for (const node of nodes) {
    if (!record(node) || !idValid(node.id) || usedIds.has(node.id)) return failure('invalid-graph');
    usedIds.add(node.id);
    lookup.set(node.id, node);
  }
  for (const edge of edges) {
    if (
      !record(edge) ||
      !idValid(edge.id) ||
      usedIds.has(edge.id) ||
      !idValid(edge.source) ||
      !idValid(edge.target)
    )
      return failure('invalid-graph');
    usedIds.add(edge.id);
  }
  const target = lookup.get(targetId);
  if (!target) return failure('no-script');
  if ((target.type || target.data?.type) !== 'script-v2' || !record(target.data))
    return failure('not-v2-script');
  const initialPosition = { x: target.position?.x - 350 - 80, y: target.position?.y };
  if (!resolveScriptV2ResourcePlacement({ position: initialPosition, nodes }).valid)
    return failure('invalid-geometry');
  if (typeof makeId !== 'function') return failure('invalid-id-factory');
  let currentNodes = nodes;
  const addedNodes = [],
    addedEdges = [],
    nodeIds = [],
    results = [];
  for (const [index, item] of items.entries()) {
    let image,
      reason,
      skipped = false;
    if (!record(item)) reason = 'invalid-item';
    else if (item.kind === 'local') {
      const validated = validateScriptV2ReferenceFile(item.file);
      if (!validated.valid) {
        reason = validated.reason;
        skipped = validated.skipped;
      } else if (!usable(item.url)) reason = 'invalid-url';
      else image = { url: item.url, name: item.file.name };
    } else if (item.kind === 'asset') {
      const resolved = resolveScriptV2ImageAsset(item);
      if (!resolved.valid) reason = resolved.reason;
      else image = resolved.image;
    } else reason = 'unsupported-item-type';
    if (reason) {
      results.push({ index, status: skipped ? 'skipped' : 'failed', reason });
      continue;
    }
    const placement = resolveScriptV2ResourcePlacement({
      position: initialPosition,
      nodes: currentNodes,
    });
    if (!placement.valid) {
      results.push({ index, status: 'failed', reason: placement.reason });
      continue;
    }
    try {
      const nodeId = makeId('image'),
        edgeId = makeId('edge');
      if (
        !idValid(nodeId) ||
        !idValid(edgeId) ||
        nodeId === edgeId ||
        usedIds.has(nodeId) ||
        usedIds.has(edgeId)
      )
        throw new Error('Invalid import IDs');
      const name =
          image.name ||
          `图片${currentNodes.filter((node) => node.data?.type === 'image').length + 1}`,
        newNode = {
          id: nodeId,
          type: 'image',
          data: {
            type: 'image',
            name,
            url: [image.url],
            alt: image.name,
            action: 'image_resource',
            showGenerator: true,
          },
          position: placement.position,
        },
        newEdge = {
          id: edgeId,
          source: nodeId,
          sourceHandle: 'source',
          target: targetId,
          targetHandle: 'target',
        };
      usedIds.add(nodeId);
      usedIds.add(edgeId);
      addedNodes.unshift(newNode);
      addedEdges.push(newEdge);
      nodeIds.push(nodeId);
      currentNodes = [newNode, ...currentNodes];
      results.push({ index, status: 'added', reason: '', nodeId, edgeId });
    } catch {
      results.push({ index, status: 'failed', reason: 'invalid-id' });
    }
  }
  return {
    valid: true,
    reason: '',
    addedNodes,
    addedEdges,
    nodeIds,
    results,
    added: nodeIds.length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    submitted: false,
    uploaded: false,
  };
}

export function scriptV2ReferenceImportReasonLabel(reason) {
  const labels = {
    'invalid-input': '参考图导入数据无效',
    'invalid-graph': '画布数据无效，请重新打开',
    'no-script': '脚本节点已删除',
    'not-v2-script': '当前节点不是新版脚本',
    'invalid-geometry': '画布节点位置无效，未添加参考图',
    'invalid-id-factory': '参考图标识不可用，请重试',
    'invalid-id': '参考图标识无效，请重试',
    'invalid-file': '图片文件信息无效',
    'file-too-large': '图片不能超过30MiB',
    'unsupported-file-type': '仅支持PNG、JPEG、WebP和GIF图片',
    'invalid-url': '图片内容读取失败，请重试',
    'invalid-asset': '导入资产失败，请重试',
    'no-image-asset': '资产中没有可用图片',
    'invalid-item': '参考图导入数据无效',
    'unsupported-item-type': '仅能导入图片参考',
  };
  return labels[reason] || '参考图导入失败，请重试';
}
