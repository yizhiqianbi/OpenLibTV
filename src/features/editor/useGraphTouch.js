import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  canvasTouchMoved,
  canvasTouchPosition,
  createCanvasTouchPoint,
  projectCanvasTouchView,
  rebaseCanvasTouchPoint,
} from './graph-touch-model.js';

const isolatedSurface =
  '.nopan,.nowheel,button,textarea,input,select,a,audio,video,[contenteditable]';
const touchTarget = (touch, event) => {
  const target = touch.target || event.target;
  return target?.nodeType === 1 ? target : target?.parentElement;
};
function ownsNativeTouch(target, board, isolation = isolatedSurface) {
  if (!target || !board.contains(target) || target.closest(isolation)) return true;
  const window = board.ownerDocument.defaultView;
  for (let element = target; element && element !== board; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (
      (/(auto|scroll)/.test(style.overflowY || style.overflow) &&
        element.scrollHeight > element.clientHeight) ||
      (/(auto|scroll)/.test(style.overflowX || style.overflow) &&
        element.scrollWidth > element.clientWidth)
    )
      return true;
  }
  return false;
}

/** Native touch owns pane pan/pinch; the pointer controller owns one-finger node edits. */
export function useGraphTouch(options, fallbackProfile = {}) {
  const { board, storageKey, readonly, documentReady } = options;
  const latest = useRef(options);
  latest.current = options;
  const fallback = useRef(fallbackProfile);
  fallback.current = fallbackProfile;
  const profile = options.profile || fallbackProfile;
  const gesture = useRef(null);
  const lastTap = useRef(null);
  const suppressedClick = useRef(null);
  const [touchMode, setTouchMode] = useState(false);

  const clear = useCallback(() => {
    gesture.current?.board.classList.remove(gesture.current.panningClass || 'graph-panning');
    gesture.current = null;
    latest.current.cancelPointer?.();
  }, []);
  useLayoutEffect(() => {
    const media = window.matchMedia?.('(pointer: coarse) and (hover: none)');
    if (!media) return;
    const changed = () => {
      clear();
      lastTap.current = null;
      suppressedClick.current = null;
      setTouchMode(media.matches);
    };
    changed();
    if (media.addEventListener) media.addEventListener('change', changed);
    else media.addListener?.(changed);
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', changed);
      else media.removeListener?.(changed);
    };
  }, [clear]);

  // Install/retire the native owner in the commit that exposes writable controls.
  // Delayed cleanup must not cancel the new document's first pointer gesture.
  useLayoutEffect(() => {
    const element = board.current;
    clear();
    lastTap.current = null;
    suppressedClick.current = null;
    if (!element) return;
    const owner = { storageKey, readonly, documentReady };
    const currentOwner = () => {
      const current = latest.current;
      return (
        owner.documentReady &&
        current.documentReady &&
        owner.storageKey === current.storageKey &&
        owner.readonly === current.readonly
      );
    };
    const dismiss = () => {
      latest.current.setMenu?.(null);
      latest.current.setContext?.(null);
    };
    const suppress = () => {
      suppressedClick.current = { storageKey: owner.storageKey, endedAt: Date.now() };
    };
    const publish = (active) => {
      if (!currentOwner()) return;
      const current = latest.current;
      const next = projectCanvasTouchView(current.viewRef.current, [...active.points.values()]);
      if (!next) return;
      // Native move/end can run before React publishes the next render.
      current.viewRef.current = next;
      current.setView(next);
    };
    const eligible = (event) => {
      const currentProfile = latest.current.profile || fallback.current;
      const isolation = [
        isolatedSurface,
        currentProfile?.isolatedSurface,
        currentProfile?.editableSurface,
      ]
        .filter(Boolean)
        .join(',');
      return Array.from(event.touches).every(
        (touch) => !ownsNativeTouch(touchTarget(touch, event), element, isolation),
      );
    };
    const updatePoints = (active, touches) => {
      const bounds = element.getBoundingClientRect();
      for (const touch of Array.from(touches)) {
        const point = active.points.get(touch.identifier);
        const position = canvasTouchPosition(touch, bounds);
        if (point && position) {
          point.position = position;
          if (canvasTouchMoved(active.start, position)) active.moved = true;
        }
      }
    };
    const start = (event) => {
      if (!currentOwner()) return;
      // A fresh contact is intentional input, not the prior gesture's synthetic click.
      suppressedClick.current = null;
      if (!eligible(event)) {
        if (gesture.current) clear();
        lastTap.current = null;
        return;
      }
      const current = latest.current;
      const bounds = element.getBoundingClientRect();
      let active = gesture.current;
      if (active) updatePoints(active, event.touches);
      for (const touch of Array.from(event.touches)) {
        if (active?.points.has(touch.identifier) || active?.points.size === 2) continue;
        const target = touchTarget(touch, event);
        const position = canvasTouchPosition(touch, bounds);
        const point = createCanvasTouchPoint(touch.identifier, position, current.viewRef.current);
        if (!point) continue;
        if (!active) {
          const currentProfile = latest.current.profile || fallback.current;
          const node = target.closest(
            currentProfile.nodeSelector || '.graph-node,.graph-selection-overlay',
          );
          const pan =
            !node || current.readonly || current.tool === 'hand' || current.space?.current;
          active = {
            board: element,
            panningClass: currentProfile.panningClass || 'graph-panning',
            points: new Map(),
            mode: pan ? 'pan' : 'node',
            target,
            start: position,
            moved: false,
            multi: false,
            tapEligible: !node,
          };
          gesture.current = active;
          dismiss();
          if (pan) {
            clearNodePointer();
            current.setLinking?.(null);
            element.classList.add(active.panningClass);
          }
        }
        active.points.set(point.id, point);
      }
      if (!active) return;
      if (active.points.size === 2 && active.mode !== 'pinch') {
        clearNodePointer();
        current.setLinking?.(null);
        // A one-finger node drag moves its screen position without panning the view.
        // Both pinch anchors therefore begin at the actual takeover frame.
        active.points = new Map(
          [...active.points.values()].flatMap((point) => {
            const rebased = rebaseCanvasTouchPoint(point, current.viewRef.current);
            return rebased ? [[rebased.id, rebased]] : [];
          }),
        );
        if (active.points.size !== 2) {
          clear();
          return;
        }
        active.mode = 'pinch';
        active.multi = true;
        active.tapEligible = false;
        lastTap.current = null;
        element.classList.add(active.panningClass);
        event.preventDefault();
      }
    };
    const clearNodePointer = () => latest.current.cancelPointer?.();
    const move = (event) => {
      const active = gesture.current;
      if (!active || !currentOwner()) return;
      if (!eligible(event)) {
        clear();
        lastTap.current = null;
        return;
      }
      updatePoints(active, event.touches);
      event.preventDefault();
      if (active.mode !== 'node') publish(active);
    };
    const end = (event) => {
      const active = gesture.current;
      if (!active || !currentOwner()) return;
      if (event.type === 'touchcancel') {
        if (active.moved || active.multi) suppress();
        clear();
        lastTap.current = null;
        return;
      }
      updatePoints(active, event.changedTouches);
      updatePoints(active, event.touches);
      if (active.mode !== 'node' && (active.moved || active.multi)) publish(active);
      const remaining = new Set(Array.from(event.touches, (touch) => touch.identifier));
      for (const id of active.points.keys()) if (!remaining.has(id)) active.points.delete(id);
      if (active.points.size) {
        if (active.mode === 'pinch' && active.points.size === 1) {
          const point = [...active.points.values()][0];
          const rebased = rebaseCanvasTouchPoint(point, latest.current.viewRef.current);
          active.points = new Map(rebased ? [[rebased.id, rebased]] : []);
          active.mode = 'pan';
        }
        return;
      }
      if (active.moved || active.multi) {
        suppress();
        lastTap.current = null;
      } else if (active.tapEligible) {
        const now = Date.now();
        const tap = lastTap.current;
        if (
          tap &&
          tap.target === active.target &&
          now - tap.endedAt > 0 &&
          now - tap.endedAt < 300
        ) {
          event.preventDefault();
          latest.current.onFit?.({ padding: 0.15, duration: 300 });
          lastTap.current = null;
          suppress();
        } else lastTap.current = { target: active.target, endedAt: now };
      } else lastTap.current = null;
      clear();
    };
    const blur = () => {
      clear();
      lastTap.current = null;
      suppressedClick.current = null;
    };
    element.addEventListener('touchstart', start, { passive: false });
    element.addEventListener('touchmove', move, { passive: false });
    element.addEventListener('touchend', end, { passive: false });
    element.addEventListener('touchcancel', end, { passive: false });
    window.addEventListener('blur', blur);
    return () => {
      element.removeEventListener('touchstart', start);
      element.removeEventListener('touchmove', move);
      element.removeEventListener('touchend', end);
      element.removeEventListener('touchcancel', end);
      window.removeEventListener('blur', blur);
      clear();
    };
  }, [
    board,
    storageKey,
    readonly,
    documentReady,
    profile.isolatedSurface,
    profile.editableSurface,
    profile.nodeSelector,
    profile.panningClass,
    clear,
  ]);

  const shouldSuppressTouchClick = useCallback((event) => {
    const active = suppressedClick.current;
    if (
      !active ||
      active.storageKey !== latest.current.storageKey ||
      (event?.pointerType && event.pointerType !== 'touch') ||
      event?.detail === 0 ||
      Date.now() - active.endedAt > 500
    )
      return false;
    suppressedClick.current = null;
    return true;
  }, []);
  const cancel = useCallback(() => {
    clear();
    lastTap.current = null;
    suppressedClick.current = null;
  }, [clear]);
  return { touchMode, shouldSuppressTouchClick, cancel };
}
