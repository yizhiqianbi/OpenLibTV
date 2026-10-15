import { canvasNodeSize, canvasWorldPosition } from './groups.js';
import { planCanvasGroupDragDrop } from './group-drag-model.js';
import {
  planCanvasStoryboardGroupDrop,
  resolveCanvasStoryboardFrameDropHover,
} from './storyboard-group-drop-model.js';
import {
  findStandaloneStoryboardGridGroupAt,
  finishStoryboardGridDrag,
  isStoryboardImageGridFullForIncoming,
  prepareStoryboardGridDrag,
  reconcileStoryboardGridMembership,
  updateStoryboardGridDrag,
} from './storyboard-grid-model.js';
import { planCanvasParentBounds } from './parent-bounds-model.js';

function usesGridSession({ draggedNodeId, surface, copied }) {
  // Source node L/D starts the primary's grid session even with other selected nodes.
  // An active k preview is consumed before m3's multi-node stop; virtual Z is separate.
  return surface === 'node' && !copied && !!draggedNodeId;
}

export function prepareCanvasNodeDrag(context) {
  if (!usesGridSession(context)) return null;
  const prepared = prepareStoryboardGridDrag({
    nodes: context.nodes,
    draggedId: context.draggedNodeId,
  });
  return { grid: prepared.context, valid: prepared.valid };
}

function gridCapacityWarning(nodes, draggedNodeId) {
  const dragged = nodes.find((node) => node.id === draggedNodeId);
  if (dragged?.type !== 'image') return null;
  const parent = nodes.find((node) => node.id === dragged.parentId);
  const size = canvasNodeSize(dragged);
  const target = findStandaloneStoryboardGridGroupAt(
    dragged.position.x + (parent?.position.x ?? 0) + size.width / 2,
    dragged.position.y + (parent?.position.y ?? 0) + size.height / 2,
    nodes,
    dragged.id,
  );
  if (!target || dragged.parentId === target.id) return null;
  const count = nodes.filter((node) => node.parentId === target.id && node.type === 'image').length;
  return isStoryboardImageGridFullForIncoming(
    count,
    target.data?.storyboardManualGridCols,
    target.data?.storyboardManualGridRows,
  )
    ? { warning: '分镜宫格已满，无法继续添加', warningKey: 'storyboardGridFull', throttle: 1600 }
    : null;
}

export function projectCanvasNodeDrag(context) {
  const { nodes, nodeIds, surface, copied, draggedNodeId, dragContext } = context;
  if (surface === 'selection') {
    const hover = resolveCanvasStoryboardFrameDropHover({
      nodes,
      draggedIds: nodeIds,
      liveAltCopy: copied,
      getNodeSize: canvasNodeSize,
    });
    return { nodes, dragContext, preview: hover.valid ? hover : null };
  }
  if (!usesGridSession(context)) return { nodes, dragContext };
  if (dragContext?.valid === false) return { nodes, dragContext };
  const step = updateStoryboardGridDrag({
    nodes,
    draggedId: draggedNodeId,
    context: dragContext?.grid,
    getNodeSize: canvasNodeSize,
  });
  return {
    nodes: step.nodes,
    dragContext: { grid: step.context, valid: step.valid },
    completion: step.valid ? gridCapacityWarning(step.nodes, draggedNodeId) : null,
  };
}

function changedParents(before, after) {
  const old = new Map(before.map((node) => [node.id, node]));
  const groups = new Set();
  for (const node of after) {
    const previous = old.get(node.id);
    if (previous?.parentId !== node.parentId) {
      if (previous?.parentId) groups.add(previous.parentId);
      if (node.parentId) groups.add(node.parentId);
    }
  }
  return [...groups];
}

/** Source handler phases compose in one immutable gesture commit, without UI/store effects. */
export function finalizeCanvasNodeDrag(context) {
  const { nodes, draggedNodeId, nodeIds, selectedIds, surface, copied, releasePoint, dragContext } =
    context;
  if (surface === 'node' && copied) return { nodes };
  if (dragContext?.valid === false) return { nodes };
  let result;
  if (usesGridSession(context)) {
    result = finishStoryboardGridDrag({
      nodes,
      draggedId: draggedNodeId,
      context: dragContext?.grid,
    });
    if (!result.valid) return { nodes };
  }
  if (result?.kind !== 'standaloneStoryboardGrid') {
    result = planCanvasStoryboardGroupDrop({
      nodes,
      draggedNodeId,
      draggedIds: nodeIds,
      selectedIds,
      releasePoint,
      surface,
      liveAltCopy: copied,
      getNodeSize: canvasNodeSize,
    });
    if (!result.valid) return { nodes };
    if (!result.handled)
      result = planCanvasGroupDragDrop({
        nodes,
        draggedNodeId,
        draggedIds: nodeIds,
        selectedIds,
        releasePoint,
        surface,
        liveAltCopy: copied,
        getNodeSize: canvasNodeSize,
      });
  }
  if (!result?.valid) return { nodes };
  let next = result.nodes;
  const groups = changedParents(nodes, next);
  if (groups.length) {
    const reconciled = reconcileStoryboardGridMembership({ nodes: next, groupIds: groups });
    if (reconciled.valid) next = reconciled.nodes;
  }
  if (surface === 'node') {
    const parentId = next.find((node) => node.id === draggedNodeId)?.parentId;
    if (parentId) {
      const expanded = planCanvasParentBounds({
        nodes: next,
        groupIds: [parentId],
        getNodeSize: canvasNodeSize,
      });
      if (expanded.valid) next = expanded.nodes;
    }
  }
  return {
    nodes: next,
    completion:
      result.completion?.warningKey === 'storyboardGridFull'
        ? { ...result.completion, throttle: 1600 }
        : result.completion,
  };
}

/** World coordinates for a caller-owned slot action; no mutable view/store dependency. */
export function storyboardGroupWorldPosition(nodes, groupId) {
  const group = nodes.find((node) => node.id === groupId);
  return group ? canvasWorldPosition(group, nodes) : null;
}
