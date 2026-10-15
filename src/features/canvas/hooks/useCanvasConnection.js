import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONNECTION_DRAG_THRESHOLD,
  canvasConnectionPanVelocity,
  canvasConnectionTarget,
  canvasHandlePoint,
} from '../domain/connection-gesture-model.js';
import { canvasWorldNodes } from '../domain/groups.js';
import { canvasConnectionReasonLabel } from '../domain/connection-presentation.js';

/** A connection owns its pointer, frame loop and originating loaded document. */
export function useCanvasConnection(options) {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef(null);
  const gestureSequence = useRef(0);
  const epoch = useRef(0);
  const frame = useRef(null);
  const suppressClick = useRef(null);
  const [preview, setPreview] = useState(null);
  const { documentKey, ready, readonly } = options;
  const clear = useCallback(() => {
    const previous = gesture.current;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (previous?.capture) {
      try {
        if (previous.capture.hasPointerCapture?.(previous.pointerId))
          previous.capture.releasePointerCapture(previous.pointerId);
      } catch {
        // Native pointerup/cancel may already have released capture.
      }
    }
    setPreview(null);
  }, []);
  useEffect(() => {
    epoch.current += 1;
    clear();
    suppressClick.current = null;
    return clear;
  }, [documentKey, ready, readonly, clear]);

  const owned = useCallback((value) => {
    const current = latest.current;
    return (
      value &&
      value.epoch === epoch.current &&
      value.documentKey === current.documentKey &&
      current.ready &&
      !current.readonly &&
      current.nodes.some((node) => node.id === value.nodeId)
    );
  }, []);
  const targetAt = useCallback((value, allowBody = true) => {
    const current = latest.current;
    const board = current.board.current;
    const hit = board?.ownerDocument.elementFromPoint?.(value.x, value.y)?.closest?.('.cv-handle');
    const opposite = value.handleType === 'target' ? 'source' : 'target';
    const directNodeId =
      hit && board.contains(hit) && !hit.disabled && hit.dataset.handleType === opposite
        ? hit.closest('[data-node-id]')?.dataset.nodeId
        : undefined;
    return canvasConnectionTarget({
      nodes: current.nodes,
      originId: value.nodeId,
      handleType: value.handleType,
      point: current.point({ clientX: value.x, clientY: value.y }),
      directNodeId,
      allowBody,
    });
  }, []);
  const updatePreview = useCallback(
    (value) => {
      if (!owned(value)) return;
      const current = latest.current;
      const point = current.point({ clientX: value.x, clientY: value.y });
      const target = targetAt(value, false);
      const plan = target ? current.validate?.(target) : null;
      const status = target ? (plan?.valid === false ? 'invalid' : 'valid') : 'unknown';
      const targetNode =
        status === 'valid' &&
        canvasWorldNodes(current.nodes).find((node) => node.id === target?.nodeId);
      // Pointer capture retargets native events to the origin. Read the physical
      // hit separately: node hover is not the handle candidate or its validity.
      const board = current.board.current;
      const hovered = board?.ownerDocument
        .elementFromPoint?.(value.x, value.y)
        ?.closest?.('.cv-node');
      const hoveredNodeId =
        hovered &&
        board.contains(hovered) &&
        current.nodes.some((node) => node.id === hovered.dataset.nodeId && !node.hidden)
          ? hovered.dataset.nodeId
          : null;
      const endpoint = targetNode
        ? canvasHandlePoint(targetNode, value.handleType === 'target' ? 'source' : 'target')
        : point;
      setPreview({
        nodeId: value.nodeId,
        handleType: value.handleType,
        point,
        endpoint,
        target,
        status,
        hoveredNodeId,
        screenPoint: { x: value.x, y: value.y },
        documentKey: value.documentKey,
        gestureId: value.gestureId,
        reasonLabel: plan?.valid === false ? canvasConnectionReasonLabel(plan.reason) : undefined,
      });
    },
    [owned, targetAt],
  );
  useEffect(() => {
    const value = gesture.current;
    if (value && !owned(value)) clear();
    else if (value?.dragged) updatePreview(value);
  }, [options.nodes, options.edges, options.models, owned, clear, updatePreview]);
  const pan = useCallback(
    function advance() {
      frame.current = null;
      const value = gesture.current;
      if (!owned(value)) {
        clear();
        return;
      }
      if (!value.dragged) return;
      const current = latest.current;
      const bounds = current.board.current?.getBoundingClientRect();
      if (!bounds) return;
      const velocity = canvasConnectionPanVelocity({ x: value.x, y: value.y }, bounds);
      if (velocity.x || velocity.y) {
        const view = current.viewRef.current;
        const next = { ...view, x: view.x + velocity.x, y: view.y + velocity.y };
        current.viewRef.current = next;
        current.setView(next);
        updatePreview(value);
      }
      frame.current = requestAnimationFrame(advance);
    },
    [owned, updatePreview, clear],
  );

  useEffect(() => {
    const move = (event) => {
      const value = gesture.current;
      if (!value || event.pointerId !== value.pointerId) return;
      if (!owned(value)) {
        clear();
        return;
      }
      value.x = event.clientX;
      value.y = event.clientY;
      if (
        !value.dragged &&
        (value.x - value.startX) ** 2 + (value.y - value.startY) ** 2 >
          CONNECTION_DRAG_THRESHOLD ** 2
      ) {
        value.dragged = true;
        latest.current.closeMenu?.();
        latest.current.setLinking(null);
        latest.current.setLinkPoint(null);
        if (frame.current === null) frame.current = requestAnimationFrame(pan);
      }
      if (value.dragged) {
        event.preventDefault();
        updatePreview(value);
      }
    };
    const end = (event) => {
      const value = gesture.current;
      if (!value || event.pointerId !== value.pointerId) return;
      const canceled = event.type === 'pointercancel' || event.type === 'lostpointercapture';
      if (owned(value) && !canceled) {
        value.x = event.clientX;
        value.y = event.clientY;
        const traveled = Math.hypot(value.x - value.startX, value.y - value.startY);
        if (value.dragged || traveled > CONNECTION_DRAG_THRESHOLD) {
          const current = latest.current;
          const target = targetAt(value);
          if (target) current.onConnect(target);
          else
            current.onOpenMenu?.({
              ...value,
              clientX: value.x,
              clientY: value.y,
              point: current.point(event),
            });
          suppressClick.current = { pointerId: value.pointerId, endedAt: Date.now() };
        } else if (Date.now() - value.startedAt < 300 && traveled < 10) {
          latest.current.onOpenMenu?.({ ...value, clientX: value.x, clientY: value.y });
          suppressClick.current = { pointerId: value.pointerId, endedAt: Date.now() };
        }
      }
      clear();
    };
    const cancel = () => clear();
    const visibility = () => {
      if (document.hidden) clear();
    };
    const escape = (event) => {
      if (event.key !== 'Escape' || !gesture.current) return;
      event.preventDefault();
      event.stopPropagation();
      const opener = gesture.current.capture;
      clear();
      opener?.focus?.({ preventScroll: true });
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('lostpointercapture', end);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape, true);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [clear, owned, pan, updatePreview, targetAt]);
  const start = (event, nodeId, handleType) => {
    event.stopPropagation();
    const current = latest.current;
    if (
      event.button !== 0 ||
      event.isPrimary === false ||
      gesture.current ||
      !current.ready ||
      current.readonly
    )
      return;
    if (!current.nodes.some((node) => node.id === nodeId)) return;
    event.preventDefault();
    current.cancelPointer?.();
    current.cancelTouch?.();
    current.closeMenu?.();
    suppressClick.current = null;
    const capture = event.currentTarget;
    try {
      capture.setPointerCapture?.(event.pointerId);
    } catch {
      /* Native cancellation. */
    }
    gesture.current = {
      gestureId: ++gestureSequence.current,
      nodeId,
      handleType,
      documentKey: current.documentKey,
      epoch: epoch.current,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      startedAt: Date.now(),
      dragged: false,
      capture,
      opener: capture,
    };
  };
  const shouldSuppressConnectionClick = useCallback((event) => {
    const value = suppressClick.current;
    if (!value || event?.detail === 0 || Date.now() - value.endedAt > 500) return false;
    if (event?.pointerId != null && event.pointerId !== value.pointerId) return false;
    suppressClick.current = null;
    return true;
  }, []);
  const cancel = useCallback(() => {
    clear();
    suppressClick.current = null;
  }, [clear]);
  return { start, preview, cancel, shouldSuppressConnectionClick };
}
