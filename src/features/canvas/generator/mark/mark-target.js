import { resolveNodeGenerator } from '../node-generator.js';
import { markGeneratorCapability } from './mark-capability.js';

/** Source factory/attachment capability; write locks remain separate from visible capability. */
export function resolveCanvasMarkTarget(graph, id, options = {}) {
  const node = graph?.nodes?.find((item) => item.id === id);
  if (!node || options.protectionActive) return null;
  const parent = graph.nodes.find((item) => item.id === node.parentId),
    data = parent?.data;
  if (
    parent?.type === 'group' &&
    data?.storyboardGroupType === 'image' &&
    data.standaloneStoryboardImageGrid === true &&
    !(typeof data.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0)
  )
    return null;
  if (node.data?.localMediaReady && !node.data.action && !node.data.showGenerator) return null;
  const resolved = resolveNodeGenerator(node, graph.nodes, graph.edges, graph.models);
  return markGeneratorCapability({
    node,
    schema: resolved.schema,
    isAssetBoardMode: options.isAssetBoardMode,
    onlyFineTune: node.data?.onlyFineTune,
    slashPreset: node.data?.slashPreset,
  })
    ? { target: node, resolved }
    : null;
}

/** Front IMAGE content; unlike focus, the IMAGE generator may mark its own result. */
export function canvasMarkSurfaceAvailable(node, nodes, protectionActive = false) {
  if (protectionActive || node?.type !== 'image') return false;
  const url = Array.isArray(node.data?.url) ? node.data.url[0] : null;
  if (typeof url !== 'string' || !url || url.startsWith('blob:')) return false;
  if (url.startsWith('data:') && !node.data.localMediaReady) return false;
  const parent = nodes.find((item) => item.id === node.parentId),
    data = parent?.data;
  return !(
    parent?.type === 'group' &&
    data?.storyboardGroupType !== 'video' &&
    (data?.storyboardGroupType === 'image' ||
      data?.standaloneStoryboardImageGrid === true ||
      (typeof data?.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0))
  );
}
