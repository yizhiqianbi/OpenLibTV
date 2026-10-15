/**
 * Pure selected/mixed deletion protocol from the actual RF -> li -> cl -> lo
 * caller. These descriptors do not mutate graph or history. Clip topology is
 * unresolved until the independent mD preflight resolves its transactions.
 */
import { canvasDeletionConfirmation } from '../batch/deletion-confirmation-model.js';
import { canvasEditingSegmentTargetForEdge } from './destructive-delete-model.js';
import {
  canvasStoryboardEdgeRequiresConfirmation,
  canvasStoryboardUnlinkNotice,
} from './storyboard-unlink-model.js';

/** RF getElementsToRemove: one node-array pass, then incident-first edges. */
export function collectCanvasSelectedDeleteCandidates({
  nodes = [],
  edges = [],
  selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id),
  selectedEdgeIds = edges.filter((edge) => edge.selected).map((edge) => edge.id),
} = {}) {
  const requestedNodes = new Set(selectedNodeIds);
  const nodesToRemove = [];
  for (const node of nodes) {
    if (node.deletable === false) continue;
    if (
      requestedNodes.has(node.id) ||
      (node.parentId && nodesToRemove.some((parent) => parent.id === node.parentId))
    )
      nodesToRemove.push(node);
  }

  const removableNodeIds = new Set(nodesToRemove.map((node) => node.id));
  const requestedEdges = new Set(selectedEdgeIds);
  const deletableEdges = edges.filter((edge) => edge.deletable !== false);
  const edgesToRemove = deletableEdges.filter(
    (edge) => removableNodeIds.has(edge.source) || removableNodeIds.has(edge.target),
  );
  for (const edge of deletableEdges)
    if (requestedEdges.has(edge.id) && !edgesToRemove.some((incident) => incident.id === edge.id))
      edgesToRemove.push(edge);

  // hidden/selectable are visual/selection-entry concerns. An already selected
  // element remains a deletion candidate unless deletable is strictly false.
  return {
    nodeIds: nodesToRemove.map((node) => node.id),
    edgeIds: edgesToRemove.map((edge) => edge.id),
    nodesToRemove,
    edgesToRemove,
  };
}

/** Actual li uses flow node.type, with no raw data.type fallback. */
export function describeCanvasSelectedDeleteRequest({ isMac = false, ...input } = {}) {
  const candidates = collectCanvasSelectedDeleteCandidates(input);
  const notice = canvasDeletionConfirmation({
    nodes: input.nodes || [],
    nodeIds: candidates.nodeIds,
    trigger: 'keyboard',
    isMac,
  });
  return {
    candidates,
    nodeConfirmation: notice
      ? {
          notice,
          // Actual li captures before graph before setting either bypass flag.
          takeSnapshotOnAcceptance: true,
          onAcceptFlags: { isConfirmedDelete: true, isScriptDeleteConfirmed: true },
          onCancel: 'cancel-all-removal-callbacks',
        }
      : null,
  };
}

// Only mD's topology helper uses this nullish flow/raw fallback. Node warning
// and storyboard qualification above retain their separate type contracts.
const clipNodeType = (node) => node?.type ?? node?.data?.type;
function isClipDisconnectCandidate(nodes, edge) {
  if (!edge) return false;
  const source = nodes.find((node) => node.id === edge.source);
  const target = nodes.find((node) => node.id === edge.target);
  return ['video', 'audio'].includes(clipNodeType(source)) && clipNodeType(target) === 'video-clip';
}

/**
 * Main cl -> lo invocation descriptors, not a final graph deletion plan.
 * Caller runs initial node preflight first and passes its accepted flags here.
 * Neither async starts nor offering the association warning blocks lo.
 */
export function planCanvasSelectedDeletePhases({
  nodes = [],
  edges = [],
  nodeIds = [],
  edgeIds = [],
  isConfirmedDelete = false,
  isScriptDeleteConfirmed = false,
} = {}) {
  const ordinaryEdgeIds = [];
  const storyboardEdgeIds = [];
  const clipCandidateEdgeIds = [];
  const editingTargets = new Set();

  for (const id of edgeIds) {
    const edge = edges.find((item) => item.id === id);
    const editingTargetId = canvasEditingSegmentTargetForEdge(nodes, edge);
    if (editingTargetId !== null) {
      editingTargets.add(editingTargetId);
      continue;
    }
    if (canvasStoryboardEdgeRequiresConfirmation(nodes, edge)) {
      storyboardEdgeIds.push(id);
      continue;
    }
    if (!isConfirmedDelete && isClipDisconnectCandidate(nodes, edge)) {
      clipCandidateEdgeIds.push(id);
      continue;
    }
    // Missing IDs and duplicate ordinary IDs are retained by the actual cl.
    ordinaryEdgeIds.push(id);
  }

  const editingTargetIds = [...editingTargets];
  const phases = [];
  if (ordinaryEdgeIds.length)
    phases.push({
      kind: 'ordinary-edges',
      edgeIds: ordinaryEdgeIds,
      execution: 'synchronous',
      takeSnapshot: !isConfirmedDelete,
    });
  if (clipCandidateEdgeIds.length)
    phases.push({
      kind: 'clip-disconnect',
      candidateEdgeIds: clipCandidateEdgeIds,
      execution: 'start-async',
      awaitBeforeNext: false,
      takeSnapshot: 'before-apply',
      requiresPreflight: 'mD',
    });
  if (editingTargetIds.length)
    phases.push({
      kind: 'editing-targets',
      nodeIds: editingTargetIds,
      atomicGroups: editingTargetIds.map((id) => [id]),
      ui: false,
      execution: 'start-async',
      awaitBeforeNext: false,
      takeSnapshot: ordinaryEdgeIds.length === 0 && !isConfirmedDelete,
    });
  if (storyboardEdgeIds.length)
    phases.push({
      kind: 'storyboard-associations',
      edgeIds: storyboardEdgeIds,
      execution: isScriptDeleteConfirmed ? 'synchronous' : 'offer-confirmation-and-continue',
      awaitBeforeNext: false,
      notice: isScriptDeleteConfirmed ? null : canvasStoryboardUnlinkNotice,
      takeSnapshotOnAcceptance: !isScriptDeleteConfirmed,
      onCancel: 'preserve-association-edges-only',
    });
  if (nodeIds.length)
    phases.push({
      kind: 'selected-nodes',
      nodeIds: [...nodeIds],
      ui: true,
      execution: 'start-async',
      awaitBeforeNext: false,
      skipLegacyNodeConfirmation: Boolean(isConfirmedDelete),
      takeSnapshot: !isConfirmedDelete,
    });

  return {
    ordinaryEdgeIds,
    editingTargetIds,
    storyboardEdgeIds,
    clipCandidateEdgeIds,
    // This is only topology recognition, not mD transactions/busy/timeline
    // resolution. Complete this synchronous preflight before any ordinary
    // commit; the actual async clip launch belongs after that ordinary phase.
    clipPreflight: clipCandidateEdgeIds.length
      ? {
          kind: 'mD',
          edgeIds: clipCandidateEdgeIds,
          resolved: false,
          before: 'ordinary-edges',
          requires: ['timeline-disconnect-model', 'clip-async-controller'],
        }
      : null,
    phases,
  };
}
