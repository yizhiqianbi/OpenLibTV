import { persistCanvasDocument, createCanvasNode } from '../../canvas/document-api.js';

export function assetCanvasSnapshot(assets, id = crypto.randomUUID()) {
  const nodes = assets
    .filter((item) => item.url && !item.deletedAt)
    .map((item, index) => {
      const type = ['image', 'video', 'audio'].includes(item.type) ? item.type : 'text';
      const node = createCanvasNode({
        type,
        label: item.name,
        nodes: [],
        position: { x: (index % 4) * 410, y: Math.floor(index / 4) * 330 },
      });
      return {
        ...node,
        data: {
          ...node.data,
          name: item.name,
          url: [item.url],
          localMediaReady:
            item.url.startsWith('data:') && ['image', 'video', 'audio'].includes(type),
          assetUuid: item.id,
          mimeType: item.mimeType,
        },
      };
    });
  if (!nodes.length) throw new Error('所选资产暂无可添加内容');
  return {
    key: id,
    storageKey: `libtv.canvas.${id}`,
    title: assets.length === 1 ? assets[0].name : '资产创作项目',
    nodes,
    edges: [],
    view: { x: 40, y: 40, z: 0.8 },
  };
}
export function createCanvasFromAssets(assets) {
  const snapshot = assetCanvasSnapshot(assets);
  persistCanvasDocument(snapshot);
  return `/canvas?projectId=${encodeURIComponent(snapshot.key)}&source=assets_library_batch`;
}
