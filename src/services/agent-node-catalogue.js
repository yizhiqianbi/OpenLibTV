import { isAgentReference } from './agent-content.js';

const nodeLabels = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
  custom: '自定义',
  group: '分组',
  script: '脚本',
  'script-v2': '脚本 V2',
  'video-story': '视频故事',
  video_group: '视频组',
  'video-clip': '智能剪辑',
  'space-scene-720': '720°全景',
  'material-style': '风格',
  'material-lens': '特效',
  reference: '参考节点',
  'director-console-3d': '导演台',
  'director-studio': 'Director Studio',
  'shot-breakdown': '逐帧拉片',
  screenplay: '剧本',
  storyboard: '脚本',
  temp: '临时',
};
const groups = new Set(['group', 'video_group']);
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');
const firstUrl = (value) =>
  Array.isArray(value) ? value.map(trimmed).find(Boolean) : trimmed(value);
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

export function isCanvasMentionNode(node, pendingNodeIds) {
  const urls = [node?.data?.url, node?.data?.originalUrl].flatMap((value) =>
    Array.isArray(value) ? value : [value],
  );
  const pendingUrl = urls.some(
    (url) =>
      typeof url === 'string' &&
      (url.startsWith('blob:') ||
        (url.startsWith('data:') && node?.data?.localMediaReady !== true)),
  );
  return Boolean(
    node &&
    typeof node.id === 'string' &&
    node.id.trim() === node.id &&
    node.id &&
    !/[{}\r\n]/.test(node.id) &&
    node.id !== '__temp_connection_node__' &&
    node.type !== 'temp' &&
    node.data?.type !== 'temp' &&
    !pendingNodeIds?.has(node.id) &&
    !['uploading', 'reviewing'].includes(node.data?.uploadStatus) &&
    !pendingUrl,
  );
}

/** Source 682580: labels do not derive identity from user-entered text. */
export function canvasMentionLabel(node) {
  const data = node.data || {};
  const label = trimmed(data.name) || trimmed(data.title) || trimmed(data.label);
  return label || nodeLabels[trimmed(data.type) || node.type] || '节点';
}

/** Source 650551 only serializes image previews; a node is not a media attachment. */
export function canvasNodeReference(node, projectId) {
  if (!isCanvasMentionNode(node)) return null;
  const data = node.data || {};
  const imageUrl = data.type === 'image' && (firstUrl(data.url) || firstUrl(data.originalUrl));
  return {
    type: 'node',
    id: node.id,
    nodeKey: node.id,
    name: canvasMentionLabel(node),
    nodeType: trimmed(node.type) || 'node',
    ...(projectId ? { projectId } : {}),
    ...(imageUrl ? { url: imageUrl, mediaType: 'image' } : {}),
  };
}

/** Source 457060 converts the viewport transform to a rectangle in canvas coordinates. */
export function canvasMentionViewport(view, boardBounds) {
  const zoom = view?.zoom ?? view?.z;
  if (!(zoom > 0) || !(boardBounds?.width > 0) || !(boardBounds?.height > 0)) return null;
  return {
    x: -finite(view.x) / zoom,
    y: -finite(view.y) / zoom,
    width: boardBounds.width / zoom,
    height: boardBounds.height / zoom,
  };
}

export function canvasMentionBounds(
  node,
  nodes,
  lookup = new Map(nodes.map((item) => [item.id, item])),
) {
  const position = (item) => {
    const seen = new Set();
    let x = 0,
      y = 0;
    while (item && !seen.has(item.id)) {
      seen.add(item.id);
      x += finite(item.position?.x);
      y += finite(item.position?.y);
      item = lookup.get(item.parentId);
    }
    return { x, y };
  };
  const rect = (item) => {
    const { x, y } = position(item);
    const width = finite(item.measured?.width, finite(item.width, 350));
    const height = finite(item.measured?.height, finite(item.height, 350));
    return { left: x, top: y, right: x + width, bottom: y + height };
  };
  const bounds = rect(node);
  // Source 662493 includes direct children's bounds for group viewport hits.
  if (groups.has(node.type))
    for (const child of nodes) {
      if (child.parentId !== node.id) continue;
      const next = rect(child);
      bounds.left = Math.min(bounds.left, next.left);
      bounds.top = Math.min(bounds.top, next.top);
      bounds.right = Math.max(bounds.right, next.right);
      bounds.bottom = Math.max(bounds.bottom, next.bottom);
    }
  return bounds;
}

export function orderCanvasMentionNodeIds(nodes, viewport, pendingNodeIds) {
  const eligible = nodes.filter((node) => isCanvasMentionNode(node, pendingNodeIds));
  if (!viewport) return eligible.map((node) => node.id);
  const visible = [],
    remaining = [];
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  for (const node of eligible) {
    const bounds = canvasMentionBounds(node, nodes, lookup);
    const hit =
      bounds.left < viewport.x + viewport.width &&
      bounds.right > viewport.x &&
      bounds.top < viewport.y + viewport.height &&
      bounds.bottom > viewport.y;
    (hit ? visible : remaining).push(node.id);
  }
  return [...visible, ...remaining];
}

export function canvasModelReferences(models) {
  const entries = Array.isArray(models)
    ? models
    : ['text', 'image', 'video'].flatMap((modality) =>
        (models?.[modality] || []).map((model) => ({ ...model, modality })),
      );
  return entries
    .filter((model) => model && typeof model === 'object')
    .map((model) => ({
      ...model,
      type: 'model',
      id: model.id || model.modelKey,
      name: model.name || model.modelName,
      modality: model.modality || 'text',
    }))
    .filter(isAgentReference);
}

/** Rows match source 457060/116132. Filtering never manufactures a reference from a placeholder. */
export function buildCanvasMentionRows({
  nodes = [],
  models,
  query = '',
  projectId,
  viewport,
  nodeIds,
  nodeLimit = 3,
  references = [],
  pendingNodeIds,
} = {}) {
  const term = query.trim().toLowerCase();
  const matches = (reference) =>
    `${reference.name || ''} ${reference.id}`.toLowerCase().includes(term);
  const lookup = new Map(
    nodes
      .filter((node) => isCanvasMentionNode(node, pendingNodeIds))
      .map((node) => [node.id, node]),
  );
  const orderedIds = nodeIds || orderCanvasMentionNodeIds(nodes, viewport, pendingNodeIds);
  const eligibleIds = [...new Set(orderedIds)].filter((id) => lookup.has(id));
  const nodeRefs = (term ? [...lookup.values()] : eligibleIds.map((id) => lookup.get(id)))
    .map((node) => canvasNodeReference(node, projectId))
    .filter(Boolean)
    .filter(matches)
    .slice(0, term ? 48 : nodeLimit);
  const item = (reference, prefix) => ({
    rowKind: 'item',
    id: `${prefix}${prefix === '__mdl__' ? `${reference.modality}__` : ''}${prefix === '__tag__' ? reference.referenceKey || `${reference.type}:${reference.id}` : reference.id}`,
    label: reference.name || reference.id,
    reference,
    disabled: !!reference.disabled,
    disabledReason: reference.disabledReason || '',
    icon: reference.icon,
    vip: !!reference.vip,
  });
  const section = (id, label, refs, prefix, empty) => [
    { rowKind: 'header', id: `at-h-${id}`, label },
    ...(refs.length
      ? refs.map((ref) => item(ref, prefix))
      : [{ rowKind: 'empty', id: `at-e-${id}`, label: empty }]),
  ];
  const rows = section('nodes', '节点', nodeRefs, '__cnd__', term ? '无匹配节点' : '暂无节点');
  if (!term && nodeRefs.length && eligibleIds.length > nodeLimit)
    rows.push({ rowKind: 'loadMore', id: 'at-load-more-nodes', label: '加载更多' });
  rows.push(
    ...section(
      'models',
      '模型',
      canvasModelReferences(models)
        .filter((reference) =>
          `${reference.name || ''} __mdl__${reference.modality}__${reference.id}`
            .toLowerCase()
            .includes(term),
        )
        .slice(0, term ? 48 : Infinity),
      '__mdl__',
      term ? '无匹配模型' : '暂无模型',
    ),
  );
  const seen = new Set();
  const resources = references.filter((ref) => {
    if (!isAgentReference(ref) || ['node', 'skill'].includes(ref.type)) return false;
    const key = ref.referenceKey || `${ref.type}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const resourceMatches = resources.filter((reference) =>
    `${reference.name || ''} ${reference.id} ${reference.referenceKey || ''} ${reference.type}`
      .toLowerCase()
      .includes(term),
  );
  if (resourceMatches.length)
    rows.push(
      ...section(
        'res',
        '资源',
        resourceMatches.slice(0, term ? 32 : Infinity),
        '__tag__',
        '无匹配资源',
      ),
    );
  return rows;
}
