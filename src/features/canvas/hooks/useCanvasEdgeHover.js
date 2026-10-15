import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createCanvasEdgeNearestLookup } from '../domain/edge-interaction-model.js';

function entryIncarnations(entries, previous) {
  const snapshot = new Map();
  for (const { edge, presentation } of entries) {
    const next = {
      edge,
      selectable: Boolean(presentation.selectable),
      deletable: Boolean(presentation.deletable),
      focusable: Boolean(presentation.focusable),
      interactive: Boolean(presentation.interactive),
      present: true,
    };
    const old = previous.get(edge.id);
    const same =
      old?.present &&
      old.edge === next.edge &&
      old.selectable === next.selectable &&
      old.deletable === next.deletable &&
      old.focusable === next.focusable &&
      old.interactive === next.interactive;
    const token = same ? old : next;
    previous.set(edge.id, token);
    snapshot.set(edge.id, token);
  }
  for (const [id, value] of previous)
    if (value.present && !snapshot.has(id)) previous.set(id, { present: false });
  return snapshot;
}

function insideForeignObject(target) {
  for (let element = target; element; element = element.parentElement)
    if (
      element.localName?.toLowerCase() === 'foreignobject' ||
      element.hasAttribute?.('data-edge-cut-container')
    )
      return true;
  return false;
}

function pointerWorldPosition(path, pointer, board, view) {
  // CSS fit transitions can be between two viewport values. Read the actual
  // painted transform at this frame, including any transformed ancestors.
  if (typeof path?.getScreenCTM === 'function') {
    const inverse = path.getScreenCTM()?.inverse();
    if (!inverse) return null;
    const point = {
      x: inverse.a * pointer.x + inverse.c * pointer.y + inverse.e,
      y: inverse.b * pointer.x + inverse.d * pointer.y + inverse.f,
    };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
  }
  // Non-browser path adapters can supply only the arc-length API.
  if (!board || !Number.isFinite(view?.z) || view.z <= 0) return null;
  const rect = board.getBoundingClientRect();
  const point = {
    x: (pointer.x - (rect.x ?? rect.left) - view.x) / view.z,
    y: (pointer.y - (rect.y ?? rect.top) - view.y) / view.z,
  };
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

/** Main shared-edge renderer: leaving its group immediately retires the hover. */
export function useCanvasEdgeHover({
  entries = [],
  documentKey,
  ready = false,
  readonly = false,
  interactionDisabled = false,
  board,
  view,
}) {
  const [hover, setHover] = useState(null);
  const active = useRef(false);
  const session = useRef(null);
  const latest = useRef(null);
  const owner = useRef(null);
  const incarnations = useRef(new Map());
  const previous = owner.current;
  if (previous && previous.documentKey !== documentKey) incarnations.current = new Map();
  const entrySnapshot = entryIncarnations(entries, incarnations.current);
  const changed =
    !previous ||
    previous.documentKey !== documentKey ||
    previous.ready !== ready ||
    previous.readonly !== readonly ||
    previous.interactionDisabled !== interactionDisabled;
  const epoch = (previous?.epoch ?? 0) + (changed ? 1 : 0);
  owner.current = {
    documentKey,
    ready,
    readonly,
    interactionDisabled,
    epoch,
  };
  latest.current = { entries, ready, readonly, interactionDisabled, board, view };

  const currentEntry = useCallback((edge) => {
    const props = latest.current;
    if (!active.current || !props.ready || props.interactionDisabled) return null;
    const entry = props.entries.find((item) => item.edge === edge);
    return entry?.presentation.interactive && entry.presentation.selectable ? entry : null;
  }, []);
  const isCurrent = useCallback(
    (value) =>
      Boolean(
        value &&
        session.current === value &&
        value.epoch === owner.current.epoch &&
        incarnations.current.get(value.edge.id) === value.incarnation &&
        currentEntry(value.edge),
      ),
    [currentEntry],
  );
  const canShowScissors = useCallback(
    (value) =>
      isCurrent(value) &&
      !latest.current.readonly &&
      Boolean(currentEntry(value.edge)?.presentation.deletable),
    [isCurrent, currentEntry],
  );
  const publish = useCallback(
    (value) => {
      if (!isCurrent(value)) return;
      setHover({
        edgeId: value.edge.id,
        edge: value.edge,
        hovered: true,
        scissorsVisible: value.scissorsVisible,
        exiting: false,
        position: value.position,
      });
    },
    [isCurrent],
  );
  const retire = useCallback((updateState = true) => {
    const value = session.current;
    session.current = null;
    if (value) {
      if (value.timer !== null) clearTimeout(value.timer);
      if (value.frame !== null) cancelAnimationFrame(value.frame);
      value.timer = null;
      value.frame = null;
      value.pointer = null;
      value.lookup = null;
    }
    if (active.current && updateState) setHover(null);
  }, []);
  const schedulePosition = useCallback(
    (value) => {
      if (!canShowScissors(value) || !value.pointer || value.frame !== null) return;
      value.frame = requestAnimationFrame(() => {
        value.frame = null;
        if (!canShowScissors(value) || !value.pointer) return;
        const { board: currentBoard, view: currentView } = latest.current;
        let point;
        try {
          point = pointerWorldPosition(
            value.pathApi,
            value.pointer,
            currentBoard?.current,
            currentView,
          );
        } catch {
          point = null;
        }
        if (!point) {
          value.position = null;
          value.lastWorld = null;
          publish(value);
          return;
        }
        if (
          value.lastWorld &&
          (point.x - value.lastWorld.x) ** 2 + (point.y - value.lastWorld.y) ** 2 < 100
        )
          return;
        value.lastWorld = point;
        try {
          if (value.lookup === undefined)
            value.lookup = createCanvasEdgeNearestLookup(value.pathApi);
          const position = value.lookup?.(point);
          if (!isCurrent(value)) return;
          value.position = position || null;
          publish(value);
        } catch {
          // An unavailable native path must not leave a stale scissors target.
          value.lookup = null;
          value.position = null;
          publish(value);
        }
      });
    },
    [canShowScissors, isCurrent, publish],
  );
  const updatePosition = useCallback(
    (value, event, pathApi) => {
      if (!canShowScissors(value) || insideForeignObject(event?.target)) return;
      if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
      if (pathApi && pathApi !== value.pathApi) {
        value.pathApi = pathApi;
        value.lookup = undefined;
        value.lastWorld = null;
      }
      value.pointer = { x: event.clientX, y: event.clientY };
      schedulePosition(value);
    },
    [canShowScissors, schedulePosition],
  );
  const ownsEntry = useCallback(
    (edge) => {
      const token = entrySnapshot.get(edge?.id);
      return (
        epoch === owner.current.epoch &&
        token?.edge === edge &&
        token === incarnations.current.get(edge.id)
      );
    },
    [epoch, entrySnapshot],
  );
  const enter = useCallback(
    (edge, event, pathApi) => {
      if (!ownsEntry(edge)) return;
      const entry = currentEntry(edge);
      if (!entry) return;
      let value = session.current;
      if (!isCurrent(value) || value.edge !== edge) {
        retire();
        value = {
          edge,
          epoch,
          incarnation: entrySnapshot.get(edge.id),
          path: entry.geometry.path,
          pathApi,
          lookup: undefined,
          pointer: null,
          lastWorld: null,
          position: null,
          scissorsVisible: false,
          timer: null,
          frame: null,
        };
        session.current = value;
        if (canShowScissors(value))
          value.timer = setTimeout(() => {
            value.timer = null;
            if (!canShowScissors(value)) return;
            value.scissorsVisible = true;
            publish(value);
          }, 1000);
        publish(value);
      }
      updatePosition(value, event, pathApi);
    },
    [
      ownsEntry,
      currentEntry,
      isCurrent,
      retire,
      epoch,
      entrySnapshot,
      canShowScissors,
      publish,
      updatePosition,
    ],
  );
  const move = useCallback(
    (edge, event, pathApi) => {
      if (!ownsEntry(edge)) return;
      const value = session.current;
      if (isCurrent(value) && value.edge === edge) updatePosition(value, event, pathApi);
    },
    [ownsEntry, isCurrent, updatePosition],
  );
  const leave = useCallback(
    (edge) => {
      if (ownsEntry(edge) && session.current?.edge === edge) retire();
    },
    [ownsEntry, retire],
  );
  const clear = useCallback(() => {
    if (session.current ? ownsEntry(session.current.edge) : epoch === owner.current.epoch) retire();
  }, [epoch, ownsEntry, retire]);

  useLayoutEffect(() => {
    active.current = true;
    const blur = () => retire();
    window.addEventListener('blur', blur);
    return () => {
      active.current = false;
      retire(false);
      window.removeEventListener('blur', blur);
    };
  }, [retire]);
  useLayoutEffect(() => {
    const value = session.current;
    if (!value) return;
    if (!isCurrent(value)) {
      retire();
      return;
    }
    const path = currentEntry(value.edge).geometry.path;
    if (value.path !== path) {
      value.path = path;
      value.lookup = undefined;
      value.lastWorld = null;
      schedulePosition(value);
    }
  }, [entries, epoch, isCurrent, currentEntry, retire, schedulePosition]);

  return {
    hover: hover?.edge === session.current?.edge && isCurrent(session.current) ? hover : null,
    enter,
    move,
    leave,
    clear,
  };
}
