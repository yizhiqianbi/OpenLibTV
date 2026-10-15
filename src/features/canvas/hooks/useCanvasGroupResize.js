import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  beginCanvasGroupResize,
  projectCanvasGroupResize,
  finalizeCanvasGroupResize,
} from '../domain/group-resize-model.js';

const samePointer = (owner, event) =>
  event?.pointerId === undefined || event.pointerId === owner.pointerId;

/** The resize preview has one owner; its final graph is one CAS and one undo step. */
export function useCanvasGroupResize(props) {
  const latest = useRef(props);
  latest.current = props;
  const active = useRef(false);
  const pending = useRef(null);
  const suppressedClick = useRef(null);
  const [preview, setPreview] = useState(null);
  const { documentKey, ready, readonly, tool, nodes, selected, suspended } = props;

  const clear = useCallback((publish = true) => {
    const owner = pending.current;
    pending.current = null;
    if (owner) {
      if (owner.frame !== null) cancelAnimationFrame(owner.frame);
      owner.detach?.();
      try {
        if (owner.capture?.hasPointerCapture?.(owner.pointerId))
          owner.capture.releasePointerCapture(owner.pointerId);
      } catch {
        // The browser may have implicitly released a canceled pointer.
      }
      suppressedClick.current = {
        groupId: owner.groupId,
        documentKey: owner.documentKey,
        capture: owner.capture,
        endedAt: Date.now(),
      };
    } else suppressedClick.current = null;
    if (publish && active.current) setPreview(null);
  }, []);

  useLayoutEffect(() => {
    active.current = true;
    clear();
    return () => {
      active.current = false;
      clear(false);
    };
  }, [documentKey, ready, readonly, tool, suspended, clear]);

  const currentFor = (owner) => {
    const state = latest.current;
    const graph = state.getDocument?.();
    return active.current &&
      pending.current === owner &&
      state.documentKey === owner.documentKey &&
      state.ready &&
      !state.readonly &&
      !state.suspended &&
      state.tool !== 'hand' &&
      state.selected?.length === 1 &&
      state.selected[0] === owner.groupId &&
      graph?.documentKey === owner.documentKey &&
      graph.ready &&
      !graph.readonly &&
      graph.nodes === owner.graph.nodes &&
      graph.edges === owner.graph.edges &&
      graph.models === owner.graph.models
      ? graph
      : null;
  };
  useLayoutEffect(() => {
    const owner = pending.current;
    if (owner && !currentFor(owner)) clear();
  }, [nodes, selected, documentKey, ready, readonly, tool, suspended, clear]);

  const begin = (event, groupId, direction) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    const state = latest.current;
    const graph = state.getDocument?.();
    if (
      !active.current ||
      state.documentKey !== documentKey ||
      !state.ready ||
      state.readonly ||
      state.suspended ||
      state.tool === 'hand' ||
      state.space?.current ||
      event.button !== 0 ||
      event.isPrimary === false ||
      state.selected?.length !== 1 ||
      state.selected[0] !== groupId ||
      graph?.documentKey !== documentKey ||
      !graph.ready ||
      graph.readonly ||
      state.isBusy?.(groupId)
    )
      return false;
    const initial = beginCanvasGroupResize({
      nodes: graph.nodes,
      groupId,
      direction,
      getNodeSize: state.getNodeSize,
    });
    if (!initial?.valid) return false;
    const session = initial.session;
    clear();
    state.cancelOtherGestures?.();
    // Cancellation can synchronously retire a graph or this document owner.
    if (state.getDocument?.() !== graph || latest.current.documentKey !== documentKey) return false;
    const start = state.point(event);
    if (!Number.isFinite(start?.x) || !Number.isFinite(start?.y)) return false;
    const capture = state.board.current;
    if (!capture) return false;
    const owner = {
      documentKey,
      graph,
      groupId,
      direction,
      pointerId: event.pointerId,
      capture,
      opener: capture.ownerDocument.activeElement,
      session,
      start,
      delta: { x: 0, y: 0 },
      didResize: false,
      plan: null,
      frame: null,
    };
    pending.current = owner;
    suppressedClick.current = null;
    try {
      capture.setPointerCapture?.(event.pointerId);
    } catch {
      clear();
      return false;
    }
    const publish = () => {
      owner.frame = null;
      if (!currentFor(owner)) {
        if (pending.current === owner) clear();
        return;
      }
      const plan = owner.plan;
      if (plan?.valid) setPreview({ documentKey, groupId, direction, graph, nodes: plan.nodes });
    };
    const readPoint = (native) => {
      const point = latest.current.point(native);
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
      owner.delta = { x: point.x - start.x, y: point.y - start.y };
      owner.plan = projectCanvasGroupResize({ session, delta: owner.delta });
      owner.didResize ||= owner.plan?.valid && owner.plan.changed;
      return true;
    };
    const move = (native) => {
      if (!samePointer(owner, native) || pending.current !== owner) return;
      if (!currentFor(owner)) return clear();
      if (!readPoint(native)) return;
      native.preventDefault?.();
      if (owner.frame === null) owner.frame = requestAnimationFrame(publish);
    };
    const finish = (native) => {
      if (!samePointer(owner, native) || pending.current !== owner) return false;
      const current = currentFor(owner);
      if (!current || (native && !readPoint(native))) {
        clear();
        return false;
      }
      const plan = finalizeCanvasGroupResize({
        session,
        delta: owner.delta,
        didResize: owner.didResize,
      });
      clear();
      if (!plan?.valid || !plan.changed) return false;
      const committed = latest.current.commitGraph?.(
        { ...current, nodes: plan.nodes },
        { expectedGraph: current },
      );
      if (committed !== true) return false;
      // The synchronous graph writer includes pending input before persistence.
      latest.current.flushGraph?.(latest.current.getDocument());
      return true;
    };
    const cancel = (native) => {
      if (pending.current === owner && samePointer(owner, native)) clear();
    };
    const lost = (native) => {
      if (native.target === capture) cancel(native);
    };
    const newPointer = (native) => {
      if (native.pointerId !== owner.pointerId && pending.current === owner) clear();
    };
    const keydown = (native) => {
      if (pending.current !== owner || native.isComposing) return;
      if (native.key === 'Escape') {
        native.preventDefault();
        native.stopImmediatePropagation();
        const currentOwner = Boolean(currentFor(owner));
        clear();
        if (currentOwner) {
          if (owner.opener?.isConnected && owner.opener !== capture.ownerDocument.body)
            owner.opener.focus();
          else
            [...capture.querySelectorAll('[data-node-id]')]
              .find((element) => element.dataset.nodeId === groupId)
              ?.focus();
        }
      } else if (
        native.key === '?' ||
        native.code === 'Space' ||
        native.key === 'Delete' ||
        native.key === 'Backspace' ||
        ((native.ctrlKey || native.metaKey) && /^(z|y|d|v)$/i.test(native.key))
      )
        clear();
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const pagehide = () => finish();
    const blur = () => clear();
    const listeners = [
      [window, 'pointermove', move],
      [window, 'pointerup', finish],
      [window, 'pointercancel', cancel],
      [window, 'pointerdown', newPointer],
      [window, 'keydown', keydown],
      [window, 'blur', blur],
      [window, 'pagehide', pagehide],
      [document, 'visibilitychange', visibility],
      [capture, 'lostpointercapture', lost],
    ];
    listeners.forEach(([target, name, listener]) =>
      target.addEventListener(name, listener, { capture: true, passive: false }),
    );
    owner.detach = () =>
      listeners.forEach(([target, name, listener]) =>
        target.removeEventListener(name, listener, true),
      );
    setPreview({ documentKey, groupId, direction, graph, nodes: graph.nodes });
    return true;
  };
  const visible =
    preview?.documentKey === documentKey &&
    preview.graph.nodes === nodes &&
    ready &&
    !readonly &&
    !suspended &&
    tool !== 'hand' &&
    selected?.length === 1 &&
    selected[0] === preview.groupId
      ? preview
      : null;
  return {
    begin,
    cancel: clear,
    active: Boolean(visible),
    groupId: visible?.groupId,
    direction: visible?.direction,
    nodes: visible?.nodes ?? nodes,
    shouldSuppressClick: (event) => {
      const guard = suppressedClick.current;
      return Boolean(
        guard &&
        guard.documentKey === latest.current.documentKey &&
        Date.now() - guard.endedAt < 400 &&
        (event.target === guard.capture ||
          event.target?.closest?.('[data-group-resize-direction]') ||
          event.target?.closest?.('[data-node-id]')?.dataset.nodeId === guard.groupId),
      );
    },
  };
}
