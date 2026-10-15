import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createLocalId } from '../../editor/model.js';
import { screenToCanvas, centerCanvasView } from '../geometry.js';
import {
  describeScriptV2ReferencePick,
  collectReferencePickBoxIds,
  planScriptV2ReferencePick,
  planScriptV2ReferenceDisconnect,
} from '../domain/reference-pick-model.js';
import { synchronizeScriptV2References } from '../storyboard/script-reference-graph.js';
import { projectScriptV2Card } from '../storyboard/script-card-model.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';
import {
  describeShotBreakdownReferencePick,
  isShotBreakdownNode,
  planShotBreakdownReferencePick,
} from '../domain/shot-breakdown-model.js';

const groupWarningLabels = {
  referencePickGroupPartialUnsupported: '部分节点不支持，已跳过',
  referencePickGroupLimitSkipped: '节点超出模型数量限制，已跳过',
  referencePickGroupAllUnsupported: '当前模型不支持所选节点',
};

function describeReferencePick(graph, targetId) {
  const target = graph?.nodes?.find((node) => node.id === targetId);
  const describe = isShotBreakdownNode(target)
    ? describeShotBreakdownReferencePick
    : describeScriptV2ReferencePick;
  return describe({ ...graph, targetNodeId: targetId });
}

function targetCanPick(target, graph) {
  if (isShotBreakdownNode(target)) return !target.data.taskInfo?.loading;
  const card =
    target && projectScriptV2Card({ node: target, nodes: graph.nodes, edges: graph.edges });
  return target?.type === 'script-v2' && card?.valid && !card.fullGenerationBusy;
}

/** Reference selection is a canvas gesture mode, not an ordinary selected-node edit. */
export function useCanvasReferencePick(props) {
  const owner = useMemo(() => ({ documentKey: props.documentKey }), [props.documentKey]);
  const latest = useRef(null),
    active = useRef(false),
    mode = useRef(null),
    gesture = useRef(null),
    selectionFrame = useRef(null),
    pendingSelection = useRef([]),
    suppressClick = useRef(false);
  latest.current = { ...props, owner };
  const [request, setRequest] = useState(null),
    [boxRect, setBoxRect] = useState(null);
  const fresh = useCallback((captured = mode.current) => {
    const value = latest.current,
      graph = value.getDocument?.();
    if (
      !active.current ||
      !captured ||
      captured !== mode.current ||
      captured.owner !== value.owner ||
      !value.ready ||
      value.readonly ||
      value.suspended ||
      graph?.documentKey !== captured.owner.documentKey ||
      !graph.ready ||
      graph.readonly
    )
      return null;
    const target = graph.nodes.find((node) => node.id === captured.targetId);
    return targetCanPick(target, graph) ? { value, graph, target } : null;
  }, []);
  const cancelBox = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    setBoxRect(null);
    try {
      current?.element?.releasePointerCapture?.(current.pointerId);
    } catch {
      // Pointer cancellation may have already released capture.
    }
  }, []);
  const exit = useCallback(() => {
    mode.current = null;
    suppressClick.current = false;
    cancelBox();
    if (selectionFrame.current !== null) cancelAnimationFrame(selectionFrame.current);
    selectionFrame.current = null;
    pendingSelection.current = [];
    setRequest(null);
  }, [cancelBox]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancelBox();
    };
    window.addEventListener('blur', cancelBox);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', cancelBox);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancelBox]);
  useLayoutEffect(() => {
    active.current = true;
    exit();
    return () => {
      active.current = false;
      exit();
    };
  }, [owner, exit]);
  useLayoutEffect(() => {
    if (mode.current && !fresh()) exit();
  }, [owner, props.nodes, props.edges, props.ready, props.readonly, props.suspended, fresh, exit]);
  const enter = (targetId) => {
    const value = latest.current,
      graph = value.getDocument?.();
    const description = describeReferencePick(graph, targetId);
    if (
      !active.current ||
      value.owner !== owner ||
      !value.ready ||
      value.readonly ||
      value.suspended ||
      graph?.documentKey !== owner.documentKey ||
      !description.valid ||
      !targetCanPick(description.target, graph)
    )
      return false;
    value.cancelOtherGestures?.();
    exit();
    const next = { owner, targetId };
    mode.current = next;
    setRequest(next);
    return true;
  };
  const description = useMemo(
    () =>
      request?.owner === owner
        ? describeReferencePick(
            {
              nodes: props.nodes,
              edges: props.edges,
            },
            request.targetId,
          )
        : null,
    [request, owner, props.nodes, props.edges],
  );
  const queueSelection = (captured, changes) => {
    if (!changes.length || !fresh(captured)) return;
    pendingSelection.current.push(...changes);
    if (selectionFrame.current !== null) return;
    selectionFrame.current = requestAnimationFrame(() => {
      selectionFrame.current = null;
      const changes = pendingSelection.current;
      pendingSelection.current = [];
      const context = fresh(captured);
      if (!context) return;
      context.value.setSelected((previous) => {
        let selected = [...previous];
        for (const change of changes) {
          if (change.selected && !selected.includes(change.id)) selected.push(change.id);
          else if (!change.selected) selected = selected.filter((id) => id !== change.id);
        }
        return selected;
      });
    });
  };
  const publish = (captured, plan, context) => {
    if (!plan?.valid || !plan.changed || !fresh(captured)) return false;
    let next;
    try {
      const projected = context.value.projectGraph?.({
        ...context.graph,
        nodes: plan.nodes,
        edges: plan.edges,
      }) || { ...context.graph, nodes: plan.nodes, edges: plan.edges };
      next = isShotBreakdownNode(context.target)
        ? projected
        : synchronizeScriptV2References(
            projected,
            captured.targetId,
            context.value.supportContent?.data?.items,
          );
    } catch {
      context.value.notify?.('当前画布草稿无法保存，请重试');
      return false;
    }
    if (context.value.commitGraph(next, { expectedGraph: context.graph }) !== true) return false;
    context.value.flushGraph?.(context.value.getDocument());
    if (plan.exitAfterCommit) {
      exit();
      return true;
    }
    queueSelection(captured, plan.selectionChanges || []);
    return true;
  };
  const pick = (sourceId, surface = 'node', sourceIds) => {
    const captured = mode.current,
      context = fresh(captured);
    if (!context) return false;
    if (isShotBreakdownNode(context.target))
      return publish(
        captured,
        planShotBreakdownReferencePick({
          ...context.graph,
          targetNodeId: captured.targetId,
          sourceId,
          surface: sourceIds ? 'box' : surface,
          makeId: createLocalId,
        }),
        context,
      );
    const node = context.graph.nodes.find((item) => item.id === sourceId);
    const group = node?.type === 'group';
    const plan = planScriptV2ReferencePick({
      ...context.graph,
      targetNodeId: captured.targetId,
      sourceIds: sourceIds || (group ? undefined : [sourceId]),
      groupId: group ? sourceId : undefined,
      surface: group ? 'group' : surface,
      makeId: createLocalId,
      nowMs: Date.now(),
    });
    for (const warning of plan.warnings || []) {
      const label = groupWarningLabels[warning];
      if (label) context.value.notify?.(label);
    }
    if (!plan.changed && ['cycle', 'duplicate'].includes(plan.reason))
      context.value.notify?.(canvasConnectionReasonLabel(plan.reason));
    return publish(captured, plan, context);
  };
  const disconnect = (sourceId) => {
    const captured = mode.current,
      context = fresh(captured);
    return (
      !!context &&
      !isShotBreakdownNode(context.target) &&
      publish(
        captured,
        planScriptV2ReferenceDisconnect({
          ...context.graph,
          targetNodeId: captured.targetId,
          sourceId,
        }),
        context,
      )
    );
  };
  const worldPoint = (event) =>
    screenToCanvas(
      { clientX: event.clientX, clientY: event.clientY },
      latest.current.board.current.getBoundingClientRect(),
      latest.current.getView(),
    );
  const beginBox = (event) => {
    if (isShotBreakdownNode(fresh()?.target)) return false;
    if (fresh() && (gesture.current || latest.current.isOtherPointerActive?.())) {
      event.preventDefault?.();
      event.stopPropagation?.();
      return true;
    }
    if (
      !fresh() ||
      event.button !== 0 ||
      event.isPrimary === false ||
      event.pointerType === 'touch' ||
      latest.current.space.current ||
      latest.current.tool === 'hand'
    )
      return false;
    if (
      event.target.closest('.cv-node,.cv-floating,.nopan,button,input,textarea,[contenteditable]')
    )
      return false;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
    gesture.current = {
      mode: mode.current,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      element: latest.current.board.current,
      rectangle: null,
    };
    try {
      gesture.current.element.setPointerCapture?.(event.pointerId);
    } catch {
      /* Native capture can be unavailable. */
    }
    return true;
  };
  const moveBox = (event) => {
    const current = gesture.current;
    if (!current || !fresh(current.mode)) return false;
    if (current.pointerId !== event.pointerId) return true;
    if (
      !current.rectangle &&
      Math.abs(event.clientX - current.x) <= 5 &&
      Math.abs(event.clientY - current.y) <= 5
    )
      return true;
    const end = worldPoint(event),
      start = worldPoint({ clientX: current.x, clientY: current.y });
    current.rectangle = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
    setBoxRect(current.rectangle);
    return true;
  };
  const endBox = (event, cancelled = false) => {
    const current = gesture.current;
    if (!current) return false;
    if (current.pointerId !== event.pointerId) return true;
    if (event.type === 'lostpointercapture' && event.target !== current.element) return true;
    const context = fresh(current.mode);
    if (!cancelled && context) moveBox(event);
    if (!cancelled && current.rectangle && context) {
      const state = describeScriptV2ReferencePick({
        ...context.graph,
        targetNodeId: current.mode.targetId,
      });
      // React Flow's source getNodes includes measured layout. The persisted
      // document intentionally does not; read only this owner's rendered shell.
      const sizes = new Map();
      const zoom = context.value.getView().z;
      for (const element of context.value.board.current?.querySelectorAll(
        '.cv-node[data-node-id]',
      ) || []) {
        const bounds = element.getBoundingClientRect();
        const width = element.offsetWidth || bounds.width / zoom;
        const height = element.offsetHeight || bounds.height / zoom;
        if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))
          sizes.set(element.dataset.nodeId, { width, height });
      }
      const ids = collectReferencePickBoxIds({
        nodes: context.graph.nodes,
        pickableIds: state.pickableIds,
        rect: current.rectangle,
        getNodeSize: (node) => sizes.get(node.id),
      });
      if (ids.length) pick(null, 'box', ids);
      suppressClick.current = true;
    } else if (!cancelled && context)
      queueSelection(current.mode, [{ id: current.mode.targetId, selected: true }]);
    cancelBox();
    return true;
  };
  return {
    active: Boolean(request?.owner === owner && description?.valid),
    targetId: request?.owner === owner ? request.targetId : null,
    description,
    boxRect,
    enter,
    exit,
    pick,
    disconnect,
    beginBox,
    moveBox,
    endBox,
    prepareNodeClick: () => {
      suppressClick.current = false;
    },
    suppressNodeClick: (event) => {
      if (event?.detail === 0) return false;
      if (!suppressClick.current) return false;
      suppressClick.current = false;
      return true;
    },
    returnToTarget: () => {
      const context = fresh();
      if (!context) return;
      const bounds = context.value.board.current?.getBoundingClientRect();
      const centered =
        bounds &&
        centerCanvasView(context.target, bounds, context.graph.nodes, context.value.getView());
      if (centered) context.value.focusView(centered, { duration: 400 });
      exit();
    },
  };
}
