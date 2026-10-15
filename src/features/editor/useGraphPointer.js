import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  canvasNodeDragPanCompensation,
  canvasNodeDragPanStep,
  canvasNodeDragPositionDelta,
} from './graph-drag-pan.js';
import { selectGraphNodes } from './graph-geometry.js';

const flatSelectionRoots = (nodes, ids) => nodes.filter((node) => ids.includes(node.id));
const flatCopyMode = ({ selectedIds, nodeId }) => ({
  copyMode: 'selection',
  sourceIds: selectedIds.includes(nodeId) ? selectedIds : [nodeId],
});

// Local interaction tuning, not a claimed source-site threshold.
const nodeDragThreshold = 4;
const isolatedSurface = '.nopan';
const editableSurface = 'button,textarea,input,select,a,audio,video,[contenteditable]';
const validButton = (event) => event.button === 0 || event.button === 1;
const samePointer = (gesture, event) =>
  !event || gesture.pointerId === undefined || event.pointerId === gesture.pointerId;
const modifier = (event, key, state) => {
  const native = event?.nativeEvent ?? event;
  return Boolean(
    native?.[key] ||
    (typeof native?.getModifierState === 'function' && native.getModifierState(state)),
  );
};

/** Pointer ownership follows one document; node positions remain parent-relative. */
export function useGraphPointer(options, strategies = {}) {
  const { storageKey, readonly, documentReady, touchMode } = options;
  const latest = useRef(options);
  latest.current = options;
  const strategyRef = useRef(strategies);
  strategyRef.current = strategies;
  const profileFor = (current) => current.profile || strategyRef.current.profile || {};
  const profile = options.profile || strategies.profile || {};
  const pointer = useRef(null);
  const gestureEpoch = useRef(0);
  const pendingNodeCommit = useRef(null);
  const suppressedClick = useRef(null);
  const [pointerActive, setPointerActive] = useState(false);
  const [draggingNode, setDraggingNode] = useState(false);
  const [altCopy, setAltCopy] = useState(false);
  const [finalizationVersion, setFinalizationVersion] = useState(0);

  const capture = (event, preferred) => {
    const element = preferred?.setPointerCapture ? preferred : latest.current.board.current;
    try {
      element?.setPointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have been canceled by the browser.
    }
    return element;
  };
  const clearGesture = useCallback((completed = false) => {
    const gesture = pointer.current;
    pointer.current = null;
    setPointerActive(false);
    if (!completed) {
      gestureEpoch.current += 1;
      pendingNodeCommit.current = null;
    }
    if (gesture?.autoPanFrame !== undefined && gesture.autoPanFrame !== null)
      cancelAnimationFrame(gesture.autoPanFrame);
    gesture?.board?.classList.remove(gesture.panningClass || 'graph-panning');
    if (gesture?.pointerId !== undefined) {
      try {
        if (
          !gesture.capture?.hasPointerCapture ||
          gesture.capture.hasPointerCapture(gesture.pointerId)
        )
          gesture.capture?.releasePointerCapture?.(gesture.pointerId);
      } catch {
        // Implicit pointerup/cancel release is already complete.
      }
    }
    setDraggingNode(false);
    setAltCopy(false);
    latest.current.setSelectionRect(null);
  }, []);
  const cancel = useCallback(() => {
    const gesture = pointer.current;
    if (gesture?.mode === 'node')
      suppressedClick.current = {
        pointerId: gesture.pointerId,
        endedAt: Date.now(),
        surface: gesture.surface,
        board: gesture.board,
      };
    clearGesture();
  }, [clearGesture]);
  // Retire the preceding document owner before the newly ready DOM can take input.
  // A passive cleanup could otherwise cancel a gesture started after this commit.
  useLayoutEffect(() => {
    clearGesture();
    suppressedClick.current = null;
    latest.current.setLinking(null);
    return clearGesture;
  }, [
    storageKey,
    readonly,
    documentReady,
    touchMode,
    profile.isolatedSurface,
    profile.editableSurface,
    profile.nodeSelector,
    profile.selectionSelector,
    profile.panningClass,
    clearGesture,
  ]);
  useEffect(() => {
    const blur = () => {
      latest.current.space.current = false;
      suppressedClick.current = null;
      cancel();
    };
    const escape = (event) => {
      if (event.key === 'Escape' && !event.isComposing && pointer.current?.mode === 'node')
        cancel();
    };
    const visibility = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [cancel]);

  // Updaters only compute projections. UI completion runs for the array React committed,
  // including either result of a StrictMode replay, never for an abandoned projection.
  useEffect(() => {
    const pending = pendingNodeCommit.current;
    if (!pending) return;
    const current = latest.current,
      gesture = pending;
    if (
      gesture.epoch !== gestureEpoch.current ||
      gesture.documentKey !== current.storageKey ||
      !current.documentReady ||
      current.readonly ||
      document.hidden
    ) {
      pendingNodeCommit.current = null;
      return;
    }
    const output = gesture.outputs?.get(current.nodes);
    if (output) gesture.committedContext = output.dragContext;
    if (
      !output ||
      output.projectionSequence !== gesture.projectionSequence ||
      output === gesture.deliveredOutput
    )
      return;
    gesture.deliveredOutput = output;
    if (output.final) pendingNodeCommit.current = null;
    current.onNodeDragCommitted?.(output.completion, {
      documentKey: gesture.documentKey,
      phase: output.final ? 'stop' : 'move',
      selectedIds: output.selectedIds,
    });
  }, [options.nodes, draggingNode, finalizationVersion, storageKey, readonly, documentReady]);

  const begin = (event, fromSelectionOverlay = false) => {
    const current = latest.current;
    if (!validButton(event) || event.isPrimary === false || pointer.current) return;
    // An independent native press starts a new intent even on an isolated
    // control. Only the click queued by the preceding gesture stays suppressed.
    suppressedClick.current = null;
    // The selection surface owns its explicit entry; capture must not clear it first.
    if (
      event.target.closest?.(profileFor(current).selectionSelector || '.graph-selection-overlay') &&
      !fromSelectionOverlay
    )
      return;
    if (event.target.closest?.(profileFor(current).isolatedSurface || isolatedSurface)) return;
    if (event.target.closest?.(profileFor(current).editableSurface || editableSurface)) return;
    const onNode = event.target.closest?.(profileFor(current).nodeSelector || '.graph-node');
    // Native touch owns board pan/pinch; one-finger writable node edits still use drag.
    if (event.pointerType === 'touch') return;
    const pan =
      (current.readonly && !onNode) ||
      (current.touchMode && !onNode) ||
      current.tool === 'hand' ||
      current.space.current ||
      event.button === 1;
    // Capture-phase arbitration handles pan before a node starts its own drag.
    if (onNode && !pan) return;
    current.setMenu(null);
    current.setContext(null);
    current.cancelOtherGestures?.();
    event.preventDefault?.();
    if (pan) event.stopPropagation?.();
    const board = current.board.current;
    const gesture = {
      epoch: ++gestureEpoch.current,
      documentKey: current.storageKey,
      pointerId: event.pointerId,
      capture: capture(event, board),
      board,
      panningClass: profileFor(current).panningClass || 'graph-panning',
      x: event.clientX,
      y: event.clientY,
      view: { ...current.viewRef.current },
    };
    pendingNodeCommit.current = null;
    if (pan) {
      gesture.mode = 'pan';
      board?.classList.add(gesture.panningClass);
    } else {
      current.setSelected([]);
      const start = current.point(event);
      gesture.mode = 'selection';
      gesture.start = start;
      gesture.rectangle = { x: start.x, y: start.y, width: 0, height: 0 };
      current.setSelectionRect(gesture.rectangle);
    }
    pointer.current = gesture;
    setPointerActive(true);
  };
  const startNodeGesture = (event, current, ids, copyRequest, nodeId) => {
    const copy = !nodeId && copyRequest && modifier(event, 'altKey', 'Alt');
    const clickSelector = profileFor(current).clickCaptureSelector;
    const clickTarget = clickSelector ? event.target.closest?.(clickSelector) : null;
    const surfaceTarget =
      clickTarget && event.currentTarget?.contains?.(clickTarget)
        ? clickTarget
        : event.currentTarget;
    const boardRect = current.board.current?.getBoundingClientRect();
    pointer.current = {
      epoch: ++gestureEpoch.current,
      documentKey: current.storageKey,
      pointerId: event.pointerId,
      // Plain clicks retain their native node target. Copy expansion uses a stable board.
      capture: capture(event, copy ? current.board.current : surfaceTarget),
      surface: event.currentTarget,
      board: current.board.current,
      panningClass: profileFor(current).panningClass || 'graph-panning',
      mode: 'node',
      moving: false,
      x: event.clientX,
      y: event.clientY,
      view: { ...current.viewRef.current },
      protocol: nodeId ? 'node' : 'selection',
      originBoardRect: { left: boardRect?.left ?? 0, top: boardRect?.top ?? 0 },
      clientPoint: { x: event.clientX, y: event.clientY },
      panCompensation: { x: 0, y: 0 },
      outputs: new WeakMap(),
      calculations: new WeakMap(),
      projectionSequence: 0,
      ids: (current.selectionRoots || strategyRef.current.selectionRoots || flatSelectionRoots)(
        current.nodes,
        ids,
      ).map((value) => value.id),
      positions: new Map(current.nodes.map((value) => [value.id, value.position])),
      ...(nodeId ? { nodeId, copyIntentPending: true } : {}),
      ...(copy
        ? {
            copySelectionIds: [...copyRequest.sourceIds],
            copyMode: copyRequest.copyMode,
            copyEdges: modifier(event, 'metaKey', 'Meta') || modifier(event, 'ctrlKey', 'Control'),
            expectedNodes: current.nodes,
            expectedEdges: current.edges,
          }
        : {}),
    };
    setPointerActive(true);
    pendingNodeCommit.current = null;
    setAltCopy(Boolean(copyRequest && modifier(event, 'altKey', 'Alt')));
  };
  const drag = (event, node) => {
    const current = latest.current;
    if (!validButton(event) || event.isPrimary === false || pointer.current) return;
    if (
      event.target.closest?.(profileFor(current).isolatedSurface || isolatedSurface) ||
      event.target.closest?.(profileFor(current).editableSurface || editableSurface)
    )
      return;
    if (
      current.tool === 'hand' ||
      current.space.current ||
      event.button === 1 ||
      (event.pointerType === 'touch' && current.readonly)
    ) {
      begin(event);
      return;
    }
    suppressedClick.current = null;
    event.stopPropagation();
    // A target click belongs to the existing connection action, not a node move.
    if (current.linking) return;
    current.cancelOtherGestures?.();
    current.setMenu(null);
    current.setContext(null);
    if (event.shiftKey) {
      const selection = (selected) =>
        selected.includes(node.id)
          ? selected.filter((id) => id !== node.id)
          : [...selected, node.id];
      if (current.onNodeSelection)
        current.onNodeSelection(selection, { additive: true, nodeId: node.id });
      else current.setSelected(selection);
      return;
    }
    const ids = current.selected.includes(node.id) ? current.selected : [node.id];
    // React Flow selects an unselected drag target before its onNodeDragStart callback.
    const copyRequest = modifier(event, 'altKey', 'Alt')
      ? (current.resolveDragCopyMode || strategyRef.current.resolveDragCopyMode || flatCopyMode)({
          nodes: current.nodes,
          selectedIds: ids,
          nodeId: node.id,
        })
      : null;
    if (current.onNodeSelection) current.onNodeSelection(ids, { additive: false, nodeId: node.id });
    else current.setSelected(ids);
    if (current.readonly || !current.documentReady) return;
    startNodeGesture(event, current, ids, copyRequest, node.id);
  };
  const dragSelection = (event, ids = latest.current.selected) => {
    const current = latest.current;
    if (!validButton(event) || event.isPrimary === false || pointer.current) return;
    if (
      event.target.closest?.(profileFor(current).isolatedSurface || isolatedSurface) ||
      event.target.closest?.(profileFor(current).editableSurface || editableSurface)
    )
      return;
    if (current.tool === 'hand' || current.space.current || event.button === 1) {
      begin(event, true);
      return;
    }
    event.stopPropagation?.();
    if (current.linking || current.readonly || !current.documentReady) return;
    const roots = (
      current.selectionRoots ||
      strategyRef.current.selectionRoots ||
      flatSelectionRoots
    )(current.nodes, Array.isArray(ids) ? ids : []);
    if (!roots.length) return;
    suppressedClick.current = null;
    current.cancelOtherGestures?.();
    current.setMenu(null);
    current.setContext(null);
    event.preventDefault?.();
    // Selection IDs stay intact. Moving the parent already moves its relative children.
    startNodeGesture(
      event,
      current,
      roots.map((node) => node.id),
      { copyMode: 'selection', sourceIds: Array.isArray(ids) ? ids : [] },
    );
  };
  const projectNodePositions = (gesture, final = false) => {
    const current = latest.current;
    const selectedIds = [...(gesture.copySelectedIds ?? current.selected)];
    const releasePoint = current.point?.({
      clientX: gesture.clientPoint.x,
      clientY: gesture.clientPoint.y,
    });
    const delta = canvasNodeDragPositionDelta({
      protocol: gesture.protocol,
      originClient: { x: gesture.x, y: gesture.y },
      clientPoint: gesture.clientPoint,
      originView: gesture.view,
      view: current.viewRef.current,
      originBoardRect: gesture.originBoardRect,
      boardRect: gesture.board?.getBoundingClientRect(),
      panCompensation: gesture.panCompensation,
    });
    if (!delta) return;
    const projectionSequence = ++gesture.projectionSequence;
    pendingNodeCommit.current = gesture;
    current.setNodes((list) => {
      const owner = latest.current;
      // A completed updater may run after end clears capture, but never after a new owner.
      if (
        gesture.epoch !== gestureEpoch.current ||
        gesture.documentKey !== owner.storageKey ||
        !owner.documentReady ||
        owner.readonly ||
        document.hidden
      )
        return list;
      const previousCalculation = gesture.calculations.get(list)?.get(projectionSequence);
      if (previousCalculation) {
        gesture.outputs.set(previousCalculation.nodes, previousCalculation.output);
        return previousCalculation.nodes;
      }
      let changed = false;
      const projected = list.map((node) => {
        const position = gesture.positions.get(node.id);
        if (!gesture.ids.includes(node.id) || !position) return node;
        const x = position.x + delta.x,
          y = position.y + delta.y;
        if (node.position?.x === x && node.position?.y === y) return node;
        changed = true;
        return { ...node, position: { x, y } };
      });
      let nodes = changed ? projected : list;
      const previous = gesture.outputs.get(list);
      const context = {
        draggedNodeId: gesture.nodeId,
        nodeIds: [...gesture.ids],
        selectedIds,
        releasePoint,
        surface: gesture.protocol,
        copied: Boolean(gesture.copySelectionIds),
        dragContext: previous?.dragContext ?? gesture.committedContext ?? gesture.preparedContext,
      };
      const stage = owner.projectNodeDrag?.({ ...context, nodes });
      if (Array.isArray(stage?.nodes)) nodes = stage.nodes;
      const dragContext = stage?.dragContext ?? context.dragContext;
      const plan = final ? owner.finalizeNodeDrag?.({ ...context, nodes, dragContext }) : undefined;
      if (Array.isArray(plan)) nodes = plan;
      else if (Array.isArray(plan?.nodes)) nodes = plan.nodes;
      const output = {
        dragContext,
        preview: stage?.preview,
        completion: final ? plan?.completion : stage?.completion,
        selectedIds,
        final,
        projectionSequence,
      };
      gesture.outputs.set(nodes, output);
      let calculations = gesture.calculations.get(list);
      if (!calculations) {
        calculations = new Map();
        gesture.calculations.set(list, calculations);
      }
      calculations.set(projectionSequence, { nodes, output });
      return nodes;
    });
    // A rejected drop can return the same nodes. It still needs a committed stop signal.
    if (final) setFinalizationVersion((version) => version + 1);
  };
  const scheduleAutoPan = (gesture) => {
    if (gesture.autoPanFrame !== undefined && gesture.autoPanFrame !== null) return;
    gesture.lastPanFrame = undefined;
    const advance = (timestamp) => {
      gesture.autoPanFrame = null;
      if (pointer.current !== gesture) return;
      const current = latest.current;
      if (
        gesture.epoch !== gestureEpoch.current ||
        gesture.documentKey !== current.storageKey ||
        !current.documentReady ||
        current.readonly ||
        document.hidden ||
        current.board.current !== gesture.board ||
        !gesture.ids.every((id) => current.nodes.some((node) => node.id === id))
      ) {
        cancel();
        return;
      }
      const suppressed =
        typeof current.suppressAutoPan === 'function'
          ? current.suppressAutoPan({
              clientX: gesture.clientPoint.x,
              clientY: gesture.clientPoint.y,
            })
          : current.suppressAutoPan;
      const elapsedMs = timestamp - (gesture.lastPanFrame ?? timestamp);
      gesture.lastPanFrame = timestamp;
      const step = !suppressed
        ? canvasNodeDragPanStep({
            protocol: gesture.protocol,
            clientPoint: gesture.clientPoint,
            boardRect: gesture.board?.getBoundingClientRect(),
            view: current.viewRef.current,
            elapsedMs,
          })
        : null;
      if (step && (step.deltaScreen.x || step.deltaScreen.y)) {
        if (gesture.protocol === 'selection')
          gesture.panCompensation = canvasNodeDragPanCompensation(
            gesture.panCompensation,
            step.deltaScreen,
            current.viewRef.current.z,
          );
        current.viewRef.current = step.nextView;
        current.setView(step.nextView);
        projectNodePositions(gesture);
      }
      if (pointer.current !== gesture) return;
      // RF keeps checking at the center; the virtual frame resumes on its next move.
      if (gesture.protocol === 'node' || step?.active)
        gesture.autoPanFrame = requestAnimationFrame(advance);
    };
    gesture.autoPanFrame = requestAnimationFrame(advance);
  };
  const projectMove = (event, gesture, final = false) => {
    const current = latest.current;
    if (gesture.documentKey !== current.storageKey) return;
    if (gesture.mode !== 'pan' && (current.readonly || !current.documentReady)) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.mode === 'pan')
      current.setView({ ...gesture.view, x: gesture.view.x + dx, y: gesture.view.y + dy });
    else if (gesture.mode === 'node') {
      gesture.clientPoint = { x: event.clientX, y: event.clientY };
      if (!gesture.moving) {
        if (dx * dx + dy * dy < nodeDragThreshold * nodeDragThreshold) return;
        if (gesture.copyIntentPending) {
          if (!current.nodes.some((node) => node.id === gesture.nodeId)) {
            cancel();
            return;
          }
          // Ordinary onNodeDragStart samples this event and the post-selection graph.
          // Inline generator initialization may have updated it since pointerdown.
          const copyRequest = modifier(event, 'altKey', 'Alt')
            ? (
                current.resolveDragCopyMode ||
                strategyRef.current.resolveDragCopyMode ||
                flatCopyMode
              )({
                nodes: current.nodes,
                selectedIds: current.selected,
                nodeId: gesture.nodeId,
              })
            : null;
          gesture.copyIntentPending = false;
          gesture.positions = new Map(current.nodes.map((node) => [node.id, node.position]));
          if (copyRequest) {
            gesture.copySelectionIds = [...copyRequest.sourceIds];
            gesture.copyMode = copyRequest.copyMode;
            gesture.copyEdges =
              modifier(event, 'metaKey', 'Meta') || modifier(event, 'ctrlKey', 'Control');
            gesture.expectedNodes = current.nodes;
            gesture.expectedEdges = current.edges;
            if (gesture.capture !== gesture.board) {
              const previousCapture = gesture.capture;
              // Take ownership before the old surface's lostcapture can bubble.
              gesture.capture = gesture.board;
              try {
                if (typeof gesture.capture?.setPointerCapture !== 'function')
                  throw new Error('Canvas pointer capture unavailable');
                gesture.capture.setPointerCapture(gesture.pointerId);
              } catch {
                gesture.capture = previousCapture;
                cancel();
                return;
              }
              if (pointer.current !== gesture) return;
            }
          }
          setAltCopy(Boolean(copyRequest));
        }
        if (gesture.copySelectionIds) {
          let copy;
          try {
            copy = current.createDragCopy?.({
              sourceIds: gesture.copySelectionIds,
              copyMode: gesture.copyMode,
              copyEdges: gesture.copyEdges,
              expectedNodes: gesture.expectedNodes,
              expectedEdges: gesture.expectedEdges,
              documentKey: gesture.documentKey,
            });
          } catch {
            copy = null;
          }
          if (
            !copy ||
            copy.valid === false ||
            !Array.isArray(copy.newTopLevelIds) ||
            !copy.newTopLevelIds.length ||
            !Array.isArray(copy.newAllIds) ||
            !(copy.positions instanceof Map)
          ) {
            cancel();
            return;
          }
          // The injected transaction may synchronously end or replace this owner.
          if (
            pointer.current !== gesture ||
            latest.current.storageKey !== gesture.documentKey ||
            latest.current.readonly ||
            !latest.current.documentReady
          )
            return;
          gesture.ids = [...copy.newTopLevelIds];
          gesture.positions = copy.positions;
          gesture.copySelectedIds = [...copy.newAllIds];
          current.setSelected(copy.newAllIds);
        } else current.record();
        gesture.preparedContext = current.prepareNodeDrag?.({
          nodes: current.nodes,
          draggedNodeId: gesture.nodeId,
          nodeIds: [...gesture.ids],
          selectedIds: [...(gesture.copySelectedIds ?? current.selected)],
          surface: gesture.protocol,
          copied: Boolean(gesture.copySelectionIds),
        });
        gesture.moving = true;
        setDraggingNode(true);
      }
      projectNodePositions(gesture, final);
      if (!final) scheduleAutoPan(gesture);
    } else if (gesture.mode === 'selection') {
      const point = current.point(event);
      gesture.rectangle = {
        x: Math.min(gesture.start.x, point.x),
        y: Math.min(gesture.start.y, point.y),
        width: Math.abs(gesture.start.x - point.x),
        height: Math.abs(gesture.start.y - point.y),
      };
      current.setSelectionRect(gesture.rectangle);
    }
  };
  const move = (event) => {
    const gesture = pointer.current;
    if (gesture && !samePointer(gesture, event)) return;
    const current = latest.current;
    if (current.linking && event.isPrimary !== false) current.setLinkPoint(current.point(event));
    if (gesture) projectMove(event, gesture);
  };
  const end = (event) => {
    const gesture = pointer.current;
    if (!gesture || !samePointer(gesture, event)) return;
    if (
      event?.type === 'lostpointercapture' &&
      gesture.capture === gesture.board &&
      event.target !== gesture.capture &&
      gesture.capture?.hasPointerCapture?.(gesture.pointerId)
    )
      return;
    const canceled = event?.type === 'pointercancel' || event?.type === 'lostpointercapture';
    if (!canceled) {
      // A release finalizes a node drag; only pointermove may start that drag.
      // Real PointerEvents carry their final position; older MouseEvent fixtures do not.
      if (
        (gesture.mode !== 'node' || gesture.moving) &&
        event?.pointerId !== undefined &&
        Number.isFinite(event.clientX) &&
        Number.isFinite(event.clientY)
      )
        projectMove(event, gesture, true);
      const current = latest.current;
      if (
        gesture.documentKey === current.storageKey &&
        gesture.mode === 'selection' &&
        current.documentReady &&
        !current.readonly
      )
        current.setSelected(
          (
            current.selectIntersectingNodes ||
            strategyRef.current.selectIntersectingNodes ||
            selectGraphNodes
          )(current.nodes, gesture.rectangle),
        );
      if (gesture.mode === 'pan' || gesture.moving)
        suppressedClick.current = { pointerId: gesture.pointerId, endedAt: Date.now() };
    } else {
      suppressedClick.current = null;
      if (gesture.mode === 'node') {
        cancel();
        return;
      }
    }
    clearGesture(true);
  };
  const shouldSuppressClick = useCallback((event) => {
    const gesture = suppressedClick.current;
    if (!gesture || event?.detail === 0 || Date.now() - gesture.endedAt > 500) return false;
    if (
      event?.pointerId !== undefined &&
      gesture.pointerId !== undefined &&
      event.pointerId !== gesture.pointerId
    )
      return false;
    if (
      gesture.surface &&
      (!event?.target ||
        (event.target !== gesture.board && !gesture.surface.contains(event.target)))
    )
      return false;
    suppressedClick.current = null;
    return true;
  }, []);
  return {
    begin,
    drag,
    dragSelection,
    move,
    end,
    cancel,
    pointerActive,
    panning: pointerActive && pointer.current?.mode === 'pan',
    draggingNode,
    nodeDragPreview:
      pointer.current?.mode === 'node'
        ? pointer.current.outputs.get(options.nodes)?.preview
        : undefined,
    altCopy,
    shouldSuppressClick,
    isPointerActive: () => pointer.current !== null,
  };
}
