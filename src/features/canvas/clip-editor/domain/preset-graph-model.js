import { canvasNodeSize, canvasWorldPosition } from '../../domain/groups.js';

/** 713118: node display dimensions, never a claim about prepared media metadata. */
export function videoComposePresetDisplaySize(material) {
  if (material.nodeType === 'audio') return { width: 350, height: 148 };
  const { width, height } = material;
  if (!(width > 0 && height > 0)) return { width: 350, height: 350 };
  return width >= height
    ? { width: Math.min(Math.round((width / height) * 350), 5600), height: 350 }
    : { width: 350, height: Math.min(Math.round((height / width) * 350), 5600) };
}

export function missingVideoComposePresetMaterials(mode, clipNodeId, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const existingTypes = new Set(
    edges.filter((edge) => edge.target === clipNodeId).map((edge) => byId.get(edge.source)?.type),
  );
  return (mode.preset?.materials ?? []).filter((material) => !existingTypes.has(material.nodeType));
}

/** 44980: choose the nearest free position to the left in world coordinates. */
export function videoComposePresetPosition(clip, nodes, size) {
  const anchor = canvasWorldPosition(clip, nodes);
  const targetX = anchor.x - 120 - size.width;
  const margin = 50;
  const bounds = nodes.map((node) => ({
    ...canvasWorldPosition(node, nodes),
    width:
      typeof node.data?.contentWidth === 'number' && node.data.contentWidth > 0
        ? node.data.contentWidth
        : (node.measured?.width ?? node.width ?? 350),
    height: node.measured?.height ?? node.height ?? 350,
  }));
  const intersects = (x, y, box) =>
    x < box.x + box.width + margin &&
    x + size.width + margin > box.x &&
    y < box.y + box.height + margin &&
    y + size.height + margin > box.y;
  if (!bounds.some((box) => intersects(targetX, anchor.y, box))) return { x: targetX, y: anchor.y };
  const nearestY = (x) => {
    const ranges = bounds
      .filter((box) => x < box.x + box.width + margin && x + size.width + margin > box.x)
      .map((box) => ({ top: box.y - size.height - margin, bottom: box.y + box.height + margin }))
      .sort((a, b) => a.top - b.top);
    if (!ranges.length) return anchor.y;
    const merged = [];
    for (const range of ranges) {
      const previous = merged.at(-1);
      if (previous && range.top <= previous.bottom)
        previous.bottom = Math.max(previous.bottom, range.bottom);
      else merged.push({ ...range });
    }
    let chosen = anchor.y,
      distance = Infinity;
    const consider = (y) => {
      const nextDistance = Math.abs(y - anchor.y);
      if (nextDistance < distance) {
        distance = nextDistance;
        chosen = y;
      }
    };
    consider(Math.min(anchor.y, merged[0].top));
    for (let index = 0; index < merged.length - 1; index++) {
      const bottom = merged[index].bottom;
      const top = merged[index + 1].top;
      if (top - bottom >= 1) consider(Math.max(bottom, Math.min(anchor.y, top)));
    }
    consider(Math.max(anchor.y, merged.at(-1).bottom));
    return chosen;
  };
  const candidates = new Set([targetX]);
  for (const box of bounds) {
    const right = box.x + box.width + margin;
    const left = box.x - size.width - margin;
    if (right <= targetX) candidates.add(right);
    if (left <= targetX) candidates.add(left);
  }
  let result = { x: targetX, y: anchor.y },
    distance = Infinity;
  for (const x of candidates) {
    const y = nearestY(x);
    const nextDistance = (x - targetX) ** 2 + (y - anchor.y) ** 2;
    if (nextDistance < distance) {
      result = { x, y };
      distance = nextDistance;
    }
  }
  return result;
}

/** 46997 / 44676: missing kinds are added together, then top-level nodes group at 40px. */
export function planVideoComposePresetGraph({ nodes, edges, nodeId, mode, prepared, makeId }) {
  const clip = nodes.find((node) => node.id === nodeId && node.type === 'video-clip');
  if (!clip) return null;
  const missing = new Set(missingVideoComposePresetMaterials(mode, nodeId, nodes, edges));
  const accepted = prepared.filter(({ material }) => missing.has(material));
  if (!accepted.length) return { nodes, edges, addedNodeIds: [], groupId: null };
  const nextNodes = [...nodes];
  const addedEdges = [];
  const addedNodeIds = [];
  const labels = { video: '视频', image: '图片', audio: '音频' };
  const slots = {
    video: '视频',
    image: '图片',
    audio: '音频',
    text: '文字',
    productImage: '产品图',
    refVideo: '参考视频',
    generatedVideo: '生成视频',
  };
  for (const { material, size } of accepted) {
    if (!labels[material.nodeType] || !material.url) continue;
    const id = makeId(material.nodeType);
    if (!id || nextNodes.some((node) => node.id === id)) return null;
    const node = {
      id,
      type: material.nodeType,
      position: videoComposePresetPosition(clip, nextNodes, size),
      sourcePosition: 'right',
      targetPosition: 'left',
      measured: { ...size },
      data: {
        type: material.nodeType,
        name: slots[material.slotKey] || material.slotKey,
        label: labels[material.nodeType],
        url: [material.url],
        action: `${material.nodeType}_resource`,
        generatorType: 'default',
        ...(material.nodeType === 'audio'
          ? {}
          : { contentWidth: size.width, contentHeight: size.height }),
      },
    };
    nextNodes.push(node);
    addedNodeIds.push(id);
    const edgeId = makeId('edge');
    if (!edgeId || [...edges, ...addedEdges].some((edge) => edge.id === edgeId)) return null;
    addedEdges.push({
      id: edgeId,
      source: id,
      sourceHandle: 'source',
      target: nodeId,
      targetHandle: 'target',
    });
  }
  const members = [...addedNodeIds, nodeId]
    .map((id) => nextNodes.find((node) => node.id === id))
    .filter(Boolean);
  if (members.length < 2 || members.some((node) => node.parentId))
    return { nodes: nextNodes, edges: [...edges, ...addedEdges], addedNodeIds, groupId: null };
  const bounds = members.map((node) => ({
    ...canvasWorldPosition(node, nextNodes),
    ...canvasNodeSize(node),
  }));
  const x = Math.min(...bounds.map((box) => box.x)) - 40;
  const y = Math.min(...bounds.map((box) => box.y)) - 40 - 36;
  const width = Math.max(...bounds.map((box) => box.x + box.width)) - x + 40;
  const height = Math.max(...bounds.map((box) => box.y + box.height)) - y + 40;
  const groupId = makeId('group');
  if (!groupId || nextNodes.some((node) => node.id === groupId)) return null;
  const memberIds = new Set(members.map((node) => node.id));
  const grouped = nextNodes.map((node) => {
    if (!memberIds.has(node.id)) return node;
    const position = canvasWorldPosition(node, nextNodes);
    return { ...node, parentId: groupId, position: { x: position.x - x, y: position.y - y } };
  });
  grouped.push({
    id: groupId,
    type: 'group',
    position: { x, y },
    zIndex: -1001,
    style: { background: 'var(--canvas-group-bg)', border: '1px solid var(--canvas-group-border)' },
    data: { type: 'group', name: `预设 - ${mode.name}`, childNodeIds: [...memberIds] },
    width,
    height,
    measured: { width, height },
  });
  return { nodes: grouped, edges: [...edges, ...addedEdges], addedNodeIds, groupId };
}
