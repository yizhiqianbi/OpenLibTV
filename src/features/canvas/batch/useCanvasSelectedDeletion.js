import { useLayoutEffect, useRef, useState } from 'react';
import { useCanvasGraphConfirmation } from '../hooks/useCanvasGraphConfirmation.js';
import {
  describeCanvasSelectedDeleteRequest,
  planCanvasSelectedDeletePhases,
} from '../domain/selected-delete-model.js';
import {
  canvasStoryboardEdgeRequiresConfirmation,
  canvasStoryboardUnlinkIdentity,
  canvasStoryboardUnlinkNotice,
} from '../domain/storyboard-unlink-model.js';
import { canvasEditingSegmentTargetForEdge } from '../domain/destructive-delete-model.js';
import { resolveCanvasClipDisconnect } from '../clip-disconnect/disconnect-model.js';
import { sameCanvasConfirmationValue } from './confirmation-value-model.js';

function nodeIdentity(node) {
  const { text: _text, generationError: _error, params, ...data } = node.data || {};
  const { prompt: _prompt, magicList: _magic, ...businessParams } = params || {};
  return { id: node.id, type: node.type, data, params: businessParams };
}

/**
 * Initial node warnings pause ReactFlow before its edge callback runs. Keep
 * the exact candidate edge objects alongside the node identity so a graph
 * replacement while the warning is open cannot make ordinary, clip, or
 * editing edge phases delete a newly-reused ID. The source callback receives
 * the candidate objects from the same RF snapshot; this is the local owner
 * guard for that paused batch.
 */
function edgeIdentities(edges, edgeIds) {
  return edgeIds.map((id) => ({ id, edge: edges.find((item) => item.id === id) }));
}

/**
 * RF selected candidates -> li -> cl -> lo. Offering the association warning
 * does not hold the node callback; async completion is distinct from launch.
 * Opaque local owners retire callbacks across A -> B -> A, unlike key-only APIs.
 */
export function useCanvasSelectedDeletion(props) {
  const latest = useRef(props),
    active = useRef(false),
    jobs = useRef(new Set()),
    owner = useRef(null);
  latest.current = props;
  if (
    !owner.current ||
    owner.current.documentKey !== props.documentKey ||
    owner.current.ready !== props.ready ||
    owner.current.readonly !== props.readonly
  ) {
    owner.current = {
      documentKey: props.documentKey,
      ready: props.ready,
      readonly: props.readonly,
    };
    jobs.current.clear();
  }
  const renderedOwner = owner.current;
  const [pendingOwner, setPendingOwner] = useState({ owner: renderedOwner, count: 0 });
  useLayoutEffect(() => {
    const ownedJobs = jobs.current;
    active.current = true;
    setPendingOwner({ owner: owner.current, count: ownedJobs.size });
    return () => {
      active.current = false;
      owner.current = { ...owner.current };
      ownedJobs.clear();
    };
  }, [props.documentKey, props.ready, props.readonly]);
  const current = (token = renderedOwner, checkDisabled = false) => {
    const value = latest.current;
    if (
      !active.current ||
      token !== owner.current ||
      value.ready !== true ||
      value.readonly !== false ||
      (checkDisabled && value.isDisabled?.())
    )
      return null;
    try {
      const graph = value.getDocument?.();
      return graph?.documentKey === value.documentKey &&
        graph.ready === true &&
        graph.readonly === false &&
        Array.isArray(graph.nodes) &&
        Array.isArray(graph.edges)
        ? { value, graph }
        : null;
    } catch {
      return null;
    }
  };
  const publishPending = () => {
    if (active.current) setPendingOwner({ owner: owner.current, count: jobs.current.size });
  };
  const accepted = (token) => {
    const context = current(token);
    if (context) context.value.onAccepted?.(context.graph);
  };
  const launch = (result, token) => {
    if (!current(token)) {
      // An adapter may synchronously retire the owner before returning its
      // promise. Observe rejection, without publishing old work into a new owner.
      if (result && typeof result.then === 'function') Promise.resolve(result).catch(() => {});
      return false;
    }
    if (!result || typeof result.then !== 'function') {
      if (result === true) accepted(token);
      return result === true;
    }
    const job = {};
    jobs.current.add(job);
    publishPending();
    Promise.resolve(result)
      .then((value) => {
        if (value === true && jobs.current.has(job)) accepted(token);
      })
      .catch(() => {
        if (current(token)) latest.current.notify?.('当前节点无法删除，请重试');
      })
      .finally(() => {
        if (jobs.current.delete(job)) publishPending();
      });
    return true;
  };
  const bindingIdentity = (graph, edgeIds) =>
    edgeIds.map((id) => {
      const edge = graph.edges.find((item) => item.id === id);
      return { edge, binding: canvasStoryboardUnlinkIdentity(graph.nodes, edge) };
    });
  const executeStages = (operation) => {
    const context = current();
    if (!context) return false;
    const token = owner.current,
      { value, graph } = context,
      flags = operation.confirmed ? { isConfirmedDelete: true, isScriptDeleteConfirmed: true } : {};
    if (operation.confirmed && !value.history.capture()) return false;
    const phases = planCanvasSelectedDeletePhases({
      ...graph,
      nodeIds: operation.nodeIds,
      edgeIds: operation.edgeIds,
      ...flags,
    });
    let ordinaryEdgeIds = phases.ordinaryEdgeIds,
      clipEdgeIds = [];
    if (phases.clipPreflight) {
      const ordinary = new Set([...ordinaryEdgeIds, ...phases.clipCandidateEdgeIds]);
      const input = operation.edgeIds.filter((id) => ordinary.has(id));
      const preflight = resolveCanvasClipDisconnect({
        ...graph,
        edgeIds: input,
        now: value.now?.(),
      });
      ordinaryEdgeIds = preflight.passthroughEdgeIds;
      const eligible = new Set(
        preflight.transactions.flatMap((transaction) => transaction.edgeIds),
      );
      clipEdgeIds = input.filter((id) => eligible.has(id));
      if (preflight.blockedEdgeIds.length) value.notify?.('智能剪辑进行中，暂时无法断开素材连线');
    }
    let started = false;
    const writer = () => latest.current.history.createWriter();
    if (ordinaryEdgeIds.length) {
      if (!operation.confirmed && !value.history.capture()) return false;
      started = value.deleteEdges(ordinaryEdgeIds, { historyWriter: writer() }) === true;
      if (started) accepted(token);
    }
    if (clipEdgeIds.length && current(token)) {
      // The dedicated controller owns target-atomic locks and fresh mD. Never
      // turn a failed/retired clip transaction into a raw deletion fallback.
      const result = value.disconnectClip?.(clipEdgeIds);
      if (result && typeof result.then === 'function') {
        launch(
          Promise.resolve(result).then((entry) => entry.deletedEdgeIds?.length > 0),
          token,
        );
        started = true;
      }
    }
    if (phases.editingTargetIds.length && current(token)) {
      if (!ordinaryEdgeIds.length && !operation.confirmed && !value.history.capture())
        return started;
      const result = value.deleteNodes(phases.editingTargetIds, {
        ui: false,
        atomicGroups: phases.editingTargetIds.map((id) => [id]),
        historyWriter: writer(),
        canCommit: () => Boolean(current(token)),
      });
      started = launch(result, token) || started;
    }
    if (phases.storyboardEdgeIds.length && current(token)) {
      if (operation.confirmed) {
        const done = value.unlinkStoryboardEdges(phases.storyboardEdgeIds, {
          historyWriter: writer(),
        });
        if (done === true) accepted(token);
        started = done === true || started;
      } else {
        controls.requestOperation({
          kind: 'associations',
          edgeIds: phases.storyboardEdgeIds,
          identity: bindingIdentity(graph, phases.storyboardEdgeIds),
        });
      }
    }
    if (operation.nodeIds.length && current(token)) {
      if (!operation.confirmed && !value.history.capture()) return started;
      const result = value.deleteNodes(operation.nodeIds, {
        ui: true,
        zoom: value.zoom,
        reconcileGroupConsumers: true,
        historyWriter: writer(),
        canCommit: () => Boolean(current(token)),
      });
      started = launch(result, token) || started;
    }
    return started;
  };
  const controls = useCanvasGraphConfirmation({
    ...props,
    failureMessage: '当前选择无法删除，请重试',
    changedMessage: '待删除内容或分镜关联已变化，请重新选择',
    describe: (graph, input) => {
      if (input.kind === 'associations')
        return {
          operation: input,
          identity: input.identity,
          notice: { ...canvasStoryboardUnlinkNotice, stage: 'associations' },
        };
      const selection = input.kind === 'edges' ? input : input.selection;
      const description = describeCanvasSelectedDeleteRequest({
        ...graph,
        selectedNodeIds: selection.nodeIds || [],
        selectedEdgeIds: selection.edgeIds || [],
        isMac: latest.current.isMac,
      });
      const { candidates, nodeConfirmation } = description;
      const edgeIds = input.kind === 'edges' ? selection.edgeIds : candidates.edgeIds;
      if (!candidates.nodeIds.length && !edgeIds.length) return null;
      return {
        operation: {
          kind: 'selected',
          nodeIds: candidates.nodeIds,
          edgeIds,
          confirmed: Boolean(nodeConfirmation),
        },
        identity: {
          nodes: candidates.nodesToRemove.map(nodeIdentity),
          edges: edgeIdentities(graph.edges, edgeIds),
        },
        notice: nodeConfirmation
          ? {
              ...nodeConfirmation.notice,
              stage: 'nodes',
              closeOnBackdrop: false,
              showCloseButton: false,
            }
          : null,
      };
    },
    validate: (graph, identity, operation) => {
      if (!current()) return false;
      if (operation.kind === 'associations')
        return identity.every(({ edge, binding }) => {
          const currentEdge = graph.edges.find((item) => item.id === edge.id);
          return (
            currentEdge === edge &&
            !canvasEditingSegmentTargetForEdge(graph.nodes, currentEdge) &&
            canvasStoryboardEdgeRequiresConfirmation(graph.nodes, currentEdge) &&
            sameCanvasConfirmationValue(
              binding,
              canvasStoryboardUnlinkIdentity(graph.nodes, currentEdge),
            )
          );
        });
      const nodeIdentityValues = Array.isArray(identity) ? identity : identity?.nodes || [],
        edgeIdentityValues = Array.isArray(identity) ? [] : identity?.edges || [];
      return (
        edgeIdentityValues.every(
          ({ id, edge }) => graph.edges.find((item) => item.id === id) === edge,
        ) &&
        nodeIdentityValues.every((before) => {
          const node = graph.nodes.find((item) => item.id === before.id);
          return node && sameCanvasConfirmationValue(before, nodeIdentity(node));
        })
      );
    },
    execute: (operation) => {
      const context = current();
      if (!context) return false;
      if (operation.kind !== 'associations') return executeStages(operation);
      if (!context.value.history.capture()) return false;
      const done = context.value.unlinkStoryboardEdges(operation.edgeIds, {
        historyWriter: context.value.history.createWriter(),
      });
      if (done === true) accepted(owner.current);
      return done === true;
    },
  });
  return {
    request: controls.request,
    pending: pendingOwner.owner === owner.current && pendingOwner.count > 0,
    // The current confirmation isolates the canvas background with inert. Its
    // own buttons must remain actionable; owner/write eligibility still applies.
    confirm: (request) => (current() ? controls.confirm(request) : false),
    cancel: (request) =>
      active.current && renderedOwner === owner.current ? controls.cancel(request) : false,
    remove: (selection) => {
      const context = current(renderedOwner, true);
      if (!context || controls.getPendingRequest()) return false;
      return controls.requestOperation({
        kind: 'selected',
        selection: selection || context.value.getSelection?.() || {},
      });
    },
    removeEdges: (edgeIds) => {
      if (
        !current(renderedOwner, true) ||
        controls.getPendingRequest() ||
        !Array.isArray(edgeIds) ||
        !edgeIds.length
      )
        return false;
      return controls.requestOperation({ kind: 'edges', nodeIds: [], edgeIds });
    },
  };
}
