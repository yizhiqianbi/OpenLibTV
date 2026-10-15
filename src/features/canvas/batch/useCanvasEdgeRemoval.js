import { useCanvasGraphConfirmation } from '../hooks/useCanvasGraphConfirmation.js';
import {
  canvasStoryboardEdgeRequiresConfirmation,
  canvasStoryboardUnlinkIdentity,
  canvasStoryboardUnlinkNotice,
} from '../domain/storyboard-unlink-model.js';
import { sameCanvasConfirmationValue } from './confirmation-value-model.js';
import { canvasEditingSegmentTargetForEdge } from '../domain/destructive-delete-model.js';

/** UI edge deletion is distinct from the raw store deleteEdges protocol. */
export function useCanvasEdgeRemoval(props) {
  const controls = useCanvasGraphConfirmation({
    ...props,
    failureMessage: '当前连线无法断开，请重试',
    changedMessage: '待断开的连线或分镜关联已变化，请重新选择',
    describe: (graph, edgeId) => {
      const edge = graph.edges.find((item) => item.id === edgeId);
      if (!edge) return null;
      const linked =
        !canvasEditingSegmentTargetForEdge(graph.nodes, edge) &&
        canvasStoryboardEdgeRequiresConfirmation(graph.nodes, edge);
      return {
        operation: { edgeId, unlinkStoryboard: linked },
        notice: linked ? canvasStoryboardUnlinkNotice : null,
        identity: linked
          ? { edge, binding: canvasStoryboardUnlinkIdentity(graph.nodes, edge) }
          : null,
      };
    },
    validate: (graph, identity) => {
      const edge = graph.edges.find((item) => item.id === identity.edge.id);
      return (
        edge === identity.edge &&
        !canvasEditingSegmentTargetForEdge(graph.nodes, edge) &&
        canvasStoryboardEdgeRequiresConfirmation(graph.nodes, edge) &&
        sameCanvasConfirmationValue(
          identity.binding,
          canvasStoryboardUnlinkIdentity(graph.nodes, edge),
        )
      );
    },
    execute: ({ edgeId, unlinkStoryboard }) =>
      unlinkStoryboard
        ? props.unlinkEdge?.(edgeId) === true
        : props.deleteEdges?.([edgeId]) === true,
  });
  return { ...controls, remove: controls.requestOperation };
}
