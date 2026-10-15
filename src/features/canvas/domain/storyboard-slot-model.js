import {
  isStoryboardImageGridFullForIncoming,
  reconcileStoryboardGridMembership,
} from './storyboard-grid-model.js';
import { resolveStoryboardGridPresentation } from './storyboard-grid-presentation-model.js';

export function planStoryboardSlotInsert({ nodes, groupId, slotIndex, imageNode } = {}) {
  const invalid = (reason) => ({ valid: false, nodes, reason });
  if (
    !Array.isArray(nodes) ||
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    imageNode?.type !== 'image' ||
    !imageNode.id ||
    nodes.some((node) => node.id === imageNode.id)
  )
    return invalid('invalidImage');
  const group = nodes.find((node) => node.id === groupId);
  if (
    group?.type !== 'group' ||
    group.data?.standaloneStoryboardImageGrid !== true ||
    group.data?.storyboardGroupType !== 'image'
  )
    return invalid('missingGroup');
  const presentation = resolveStoryboardGridPresentation({ node: group, nodes, hoverCount: 0 });
  if (!presentation) return invalid('invalidDimensions');
  const children = presentation.children;
  if (
    isStoryboardImageGridFullForIncoming(
      children.length,
      group.data.storyboardManualGridCols,
      group.data.storyboardManualGridRows,
    )
  )
    return invalid('full');
  const slot = presentation.slots.find((item) => item.index === slotIndex);
  if (!slot) return invalid('missingSlot');
  const slotSize = slot.size;
  const inserted = {
    ...imageNode,
    parentId: groupId,
    position: { ...slot.position },
    width: slotSize.width,
    height: slotSize.height,
    measured: { ...slotSize },
    data: {
      ...imageNode.data,
      type: 'image',
      action: 'image_resource',
      name: `分镜 #${slotIndex + 1}`,
      _explicitContentDims: true,
      contentWidth: slotSize.width,
      contentHeight: slotSize.height,
    },
  };
  delete inserted.extent;
  const ids = Array.isArray(group.data.childNodeIds)
    ? [...group.data.childNodeIds]
    : children.map((node) => node.id);
  ids.splice(Math.min(slotIndex, ids.length), 0, inserted.id);
  const next = [
    ...nodes.map((node) =>
      node.id === groupId ? { ...node, data: { ...node.data, childNodeIds: ids } } : node,
    ),
    inserted,
  ];
  const result = reconcileStoryboardGridMembership({ nodes: next, groupIds: [groupId] });
  return result.valid ? { ...result, groupId, insertedId: inserted.id } : invalid(result.reason);
}
