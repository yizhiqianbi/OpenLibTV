import { canvasWorldPosition } from '../domain/groups.js';
import { storyboardRows } from './rows.js';
import { scriptAssets, isScriptV2 } from './script-model.js';
import { resolveStoryboardImageShots } from './video-model.js';

const firstUrl = (node) => {
  const urls = Array.isArray(node?.data?.url) ? node.data.url : [node?.data?.url];
  return (
    urls.find((url) => typeof url === 'string' && url.trim() && !url.startsWith('blob:')) || ''
  );
};
const makeId = () => crypto.randomUUID();
const failed = (reason) => ({ ok: false, reason, addedNodes: [], addedEdges: [], nodePatches: [] });
function dimensions(config) {
  const ratio =
    Object.entries(config.settings || {}).find(([key]) => key.startsWith('ratio'))?.[1] || '1:1';
  const match = String(ratio).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  const value = match ? Number(match[1]) / Number(match[2]) : 1;
  return value >= 1
    ? { width: Math.min(5600, 350 * value), height: 350 }
    : { width: 350, height: Math.min(5600, 350 / value) };
}
/** Source 447ud3w8leoy-/225860: role order, explicit IDs, and a deduplicated linked-node list. */
export function storyboardRowReferences(row, data, nodes, sourceField = 'imageGenerationPrompt') {
  const assets = scriptAssets(data).flatMap((group) =>
    group.items.map((item) => ({
      ...item,
      role: group.key === 'characters' ? 'character' : group.key === 'scenes' ? 'scene' : 'prop',
    })),
  );
  const byId = new Map(assets.map((item) => [item.id, item]));
  const requested = new Set(
    [
      ...(row.characters || []).map((item) => item.characterAssetId),
      ...(sourceField === 'imageGenerationPrompt'
        ? row.finalImagePromptEntityRefs || []
        : row.finalVideoPromptEntityRefs || []
      ).map((item) => item.assetId),
      ...(row.sceneAssetIds || []),
      ...(row.propAssetIds || []),
    ].filter(Boolean),
  );
  const text = row[sourceField] || row.plotDescription || '';
  for (const item of assets)
    if (
      item.name &&
      (text.includes(`@${item.name}`) ||
        text.includes(`＠${item.name}`) ||
        text.includes(`@${item.id}`))
    )
      requested.add(item.id);
  const seen = new Set();
  const references = [],
    missing = [];
  for (const role of ['character', 'scene', 'prop'])
    for (const id of requested) {
      const item = byId.get(id);
      if (!item) {
        if (!missing.includes(id)) missing.push(id);
        continue;
      }
      if (item.role !== role) continue;
      const node = nodes.find((value) => value.id === item.linkedNodeId);
      const url = firstUrl(node);
      if (!node || !url || node.type !== 'image') {
        missing.push(id);
        continue;
      }
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      references.push({
        nodeId: node.id,
        url,
        assetId: id,
        name: item.name,
        role,
        ...(node.data?.portraitCompliantExempt ? { compliantExempt: true } : {}),
      });
    }
  return { references, missing };
}
function promptFor(row, references, field) {
  let text = row[field] || row.plotDescription || '';
  const entities = [
    ...(field === 'imageGenerationPrompt'
      ? row.finalImagePromptEntityRefs || []
      : row.finalVideoPromptEntityRefs || []),
    ...(row.plotDescriptionEntityRefs || []),
  ].sort((a, b) => b.text.length - a.text.length);
  const anchors = [];
  references.forEach((ref, index) => {
    const token = `{{Image ${index + 1}}}`;
    let mentioned = false;
    const mentions = new Set([
      `@${ref.name}`,
      `＠${ref.name}`,
      `@${ref.assetId}`,
      ...entities
        .filter((entity) => entity.assetId === ref.assetId && entity.text?.length >= 2)
        .map((entity) => entity.text),
    ]);
    for (const mention of mentions)
      if (mention && text.includes(mention)) {
        text = text.split(mention).join(ref.name || mention.replace(/^[@＠]/, ''));
        mentioned = true;
      }
    if (mentioned)
      anchors.push(
        `${ref.role === 'character' ? '角色' : ref.role === 'scene' ? '场景' : '道具'} ${ref.name} 的参考图是 ${token}`,
      );
  });
  return anchors.length ? `资产图锚定：\n${anchors.join('\n')}\n\n${text}` : text;
}
function sourceRows(script, selectedHiddenUuids) {
  const rows = storyboardRows(script.data);
  const selected = selectedHiddenUuids?.size
    ? rows.filter((row) => selectedHiddenUuids.has(row.hiddenUuid))
    : rows;
  const ids = selected.map((row) => row.hiddenUuid);
  if (!selected.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
  return selected;
}
function planBase(script, nodes, rows, kind, config, idFactory, groupPosition) {
  const id = idFactory();
  const size = dimensions(config);
  const world = canvasWorldPosition(script, nodes);
  const position = groupPosition || {
    x: world.x + (script.width || (isScriptV2(script) ? 350 : 800)) + 100,
    y: world.y,
  };
  const name = `${kind === 'image' ? '分镜图' : '视频组'} · ${script.data?.title || script.data?.name || '脚本'}`;
  const subset =
    rows.length < storyboardRows(script.data).length
      ? rows.map((row) => row.hiddenUuid)
      : undefined;
  const vertical = kind === 'image' && isScriptV2(script);
  const columns = vertical ? 1 : Math.ceil(Math.sqrt(rows.length));
  const top = vertical ? 60 : 70;
  const width = 80 + columns * size.width + (columns - 1) * 40;
  const height = vertical
    ? 60 + rows.length * (size.height + 40)
    : 110 +
      Math.ceil(rows.length / columns) * size.height +
      (Math.ceil(rows.length / columns) - 1) * 40;
  const group = {
    id,
    type: 'group',
    position,
    width,
    height,
    measured: { width, height },
    zIndex: -1001,
    data: {
      type: 'group',
      name,
      storyboardTitle: name,
      storyboardGroupType: kind,
      childNodeIds: [],
      sourceScriptNodeId: script.id,
      sourceScriptVersion: isScriptV2(script) ? 'v2' : 'v1',
      ...(subset ? { storyboardSourceRowHiddenUuids: subset } : {}),
      autoResizeToChildren: true,
      autoResizePadding: 40,
      layoutMode: vertical ? 'vertical' : 'script-storyboard-grid',
    },
  };
  return { group, size, columns, top };
}
function finalize(script, kind, group, children, edges, config, idFactory) {
  group.data.childNodeIds = children.map((node) => node.id);
  const linkKey = kind === 'image' ? 'linkedImageGroupId' : 'linkedVideoGroupId';
  return {
    ok: true,
    groupId: group.id,
    sourceScriptNodeId: script.id,
    kind,
    addedNodes: [group, ...children],
    addedEdges: [
      ...edges.map((edge) => ({
        id: idFactory(),
        sourceHandle: 'source',
        targetHandle: 'target',
        ...edge,
      })),
      {
        id: idFactory(),
        source: script.id,
        sourceHandle: 'source',
        target: group.id,
        targetHandle: 'target',
      },
    ],
    nodePatches: [
      {
        nodeId: script.id,
        data: {
          [linkKey]: group.id,
          [kind === 'image' ? 'imageGenConfig' : 'videoGenConfig']: config,
        },
      },
    ],
    submitted: false,
  };
}
export function buildStoryboardImageGraphPlan({
  script,
  nodes = [],
  selectedHiddenUuids,
  config,
  makeId: idFactory = makeId,
  groupPosition,
}) {
  const rows = script && sourceRows(script, selectedHiddenUuids);
  if (!rows) return failed('镜头缺少有效且唯一的 hiddenUuid，不能按位置绑定图组');
  if (!config?.model) return failed('请选择可用的分镜图片模型');
  const references = rows.map((row) => storyboardRowReferences(row, script.data, nodes));
  if (references.some((value) => value.missing.length))
    return failed('引用的角色 / 场景 / 道具尚未关联有效图片节点');
  const { group, size, columns, top } = planBase(
    script,
    nodes,
    rows,
    'image',
    config,
    idFactory,
    groupPosition,
  );
  const edges = [];
  const children = rows.map((row, index) => {
    const id = idFactory();
    const refs = references[index].references;
    edges.push(...refs.map((ref) => ({ source: ref.nodeId, target: id })));
    return {
      id,
      type: 'image',
      parentId: group.id,
      position: {
        x: 40 + (index % columns) * (size.width + 40),
        y: top + Math.floor(index / columns) * (size.height + 40),
      },
      ...size,
      measured: size,
      data: {
        type: 'image',
        name: `镜头 ${row.shotNumber}`,
        url: [],
        action: 'image_generate',
        contentWidth: size.width,
        contentHeight: size.height,
        _explicitContentDims: true,
        scriptRowHiddenUuid: row.hiddenUuid,
        showGenerator: true,
        params: {
          ...config,
          prompt: promptFor(row, refs, 'imageGenerationPrompt'),
          modeType: refs.length ? 'image2image' : config.modeType || 'text2image',
          ...(refs.length
            ? {
                imageList: refs.map(({ name: _name, role: _role, ...ref }) => ref),
                imageListOrder: refs.map((ref) => ref.nodeId),
                imageLabelList: refs.map((_, refIndex) => `图片 ${refIndex + 1}`),
              }
            : {}),
        },
      },
    };
  });
  return finalize(script, 'image', group, children, edges, config, idFactory);
}
/** Image-group path only: actual hiddenUuid association, never a row-index fallback. */
export function buildStoryboardVideoGraphPlan({
  script,
  nodes = [],
  selectedHiddenUuids,
  config,
  schema,
  makeId: idFactory = makeId,
  groupPosition,
}) {
  if (!script?.data?.linkedImageGroupId) return failed('请先为脚本创建并完成关联的分镜图组');
  const result = resolveStoryboardImageShots(
    nodes,
    script.data.linkedImageGroupId,
    selectedHiddenUuids?.size ? selectedHiddenUuids : undefined,
  );
  if (!result.shots.length)
    return failed(
      result.reason === 'stale-image-group'
        ? '分镜图组关联已失效'
        : '没有按镜头身份关联的已完成分镜图',
    );
  if (!config?.model || !schema) return failed('视频模型配置尚未加载');
  if (
    schema.properties?.portrait === true &&
    result.shots.some(
      ({ child }) => !child.data?.portraitAssetId && !child.data?.portraitCompliantExempt,
    )
  )
    return failed('此模型需要真实肖像合规状态，当前服务尚未连接');
  const rows = result.shots.map((shot) => shot.row);
  const { group, size, columns, top } = planBase(
    script,
    nodes,
    rows,
    'video',
    config,
    idFactory,
    groupPosition,
  );
  const edges = [];
  const children = result.shots.map(({ row, child }, index) => {
    const id = idFactory(),
      url = firstUrl(child);
    edges.push({ source: child.id, target: id });
    const items = schema.properties?.modeType?.items || {};
    const mode = Object.hasOwn(items, 'singleImage2video')
      ? 'singleImage2video'
      : Object.hasOwn(items, 'image2video')
        ? 'image2video'
        : null;
    if (!mode) return null;
    return {
      id,
      type: 'video',
      parentId: group.id,
      position: {
        x: 40 + (index % columns) * (size.width + 40),
        y: top + Math.floor(index / columns) * (size.height + 40),
      },
      ...size,
      measured: size,
      data: {
        type: 'video',
        name: `分镜视频-#${row.shotNumber}`,
        url: [],
        poster: url,
        action: 'video_generate',
        scriptRowHiddenUuid: row.hiddenUuid,
        contentWidth: size.width,
        contentHeight: size.height,
        _explicitContentDims: true,
        params: {
          ...config,
          prompt: row.videoMotionPrompt || '',
          modeType: mode,
          image: url,
          imageList: [{ nodeId: child.id, url }],
          imageListOrder: [child.id],
          imageLabelList: ['图片 1'],
          scene: 'group-generate',
        },
      },
    };
  });
  if (children.some((node) => !node)) return failed('当前视频模型不支持已确认的图生视频模式');
  return finalize(script, 'video', group, children, edges, config, idFactory);
}
