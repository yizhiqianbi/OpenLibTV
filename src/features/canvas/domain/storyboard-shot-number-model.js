import { resolveStoryboardGridSlotCount } from './storyboard-grid-model.js';

/** Source image t8: preferred IDs, otherwise row tolerance8 and left-to-right order. */
export function resolveCanvasStoryboardShotNumber(node, nodes) {
  if (node?.type !== 'image' || !node.parentId || !Array.isArray(nodes)) return null;
  const parent = nodes.find((item) => item.id === node.parentId);
  const data = parent?.data;
  if (
    data?.storyboardGroupType === 'video' ||
    !(
      data?.storyboardGroupType === 'image' ||
      data?.standaloneStoryboardImageGrid === true ||
      (typeof data?.sourceScriptNodeId === 'string' && data.sourceScriptNodeId.length > 0)
    ) ||
    !data?.showStoryboardShotNumbers
  )
    return null;
  const children = nodes.filter((item) => item.parentId === parent.id && item.type === 'image');
  const preferredIndex = Array.isArray(data.childNodeIds) ? data.childNodeIds.indexOf(node.id) : -1;
  const index =
    preferredIndex >= 0
      ? preferredIndex + 1
      : [...children]
          .sort((a, b) => {
            const delta = a.position.y - b.position.y;
            return Math.abs(delta) > 8 ? delta : a.position.x - b.position.x;
          })
          .findIndex((item) => item.id === node.id) + 1;
  if (index < 1) return null;
  const { cols, rows } = resolveStoryboardGridSlotCount(
    Math.max(1, children.length),
    data.storyboardManualGridCols,
    data.storyboardManualGridRows,
  );
  return {
    index,
    label: String(index).padStart(2, '0'),
    fontSize: 16 * Math.max(1, Math.max(Math.round(cols), Math.round(rows), 1) / 2),
  };
}
