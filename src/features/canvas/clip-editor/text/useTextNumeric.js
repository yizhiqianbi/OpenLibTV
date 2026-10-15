import { useLayoutEffect, useRef, useState } from 'react';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';
import {
  parseTextNumeric,
  snapTextNumeric,
  settleTextNumeric,
  textNumericAtPointer,
} from '../domain/text-numeric-model.js';

const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
export function useTextNumeric(props) {
  const rootRef = useRef(null),
    inputRef = useRef(null),
    latest = useRef(props);
  latest.current = props;
  const raw = useRef(props.value == null ? '' : String(props.value));
  const last = useRef(props.value),
    editingRef = useRef(false),
    dirty = useRef(false);
  const interaction = useRef(null),
    drag = useRef(null),
    frame = useRef(null),
    dismiss = useRef(null);
  const lifecycle = useRef(null);
  const stopWatching = useRef(null);
  const [draft, setDraft] = useState(raw.current),
    [editing, setEditing] = useState(false),
    [dragging, setDragging] = useState(false);
  const setRaw = (value) => {
    raw.current = value;
    setDraft(value);
  };
  const reset = () => {
    last.current = latest.current.value;
    setRaw(last.current == null ? '' : String(last.current));
  };
  const pending = () => {
    const p = latest.current;
    return settleTextNumeric(raw.current, last.current, p.min, p.max, p.step, p.snapToStep);
  };
  const unlisten = () => {
    dismiss.current?.();
    dismiss.current = null;
  };
  const finish = (cancel = false) => {
    const current = interaction.current;
    interaction.current = null;
    unlisten();
    stopWatching.current?.();
    stopWatching.current = null;
    if (current) (cancel ? current.cancel : current.end)?.(current.token);
    reset();
  };
  const clearDrag = () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const previous = drag.current;
    drag.current = null;
    setDragging(false);
    if (previous?.handle.hasPointerCapture?.(previous.pointerId))
      previous.handle.releasePointerCapture(previous.pointerId);
  };
  const cancel = () => {
    clearDrag();
    editingRef.current = false;
    dirty.current = false;
    setEditing(false);
    finish(true);
    inputRef.current?.blur();
  };
  const ownEscape = () => {
    if (!dismiss.current && rootRef.current)
      dismiss.current = registerDialogChildDismissal(rootRef.current, cancel);
  };
  const begin = (kind) => {
    if (interaction.current) return true;
    const p = latest.current;
    const token = p.onInteractionStart?.({ kind, readPending: pending });
    if (!token) return false;
    interaction.current = {
      token,
      end: p.onInteractionEnd,
      cancel: p.onInteractionCancel,
      change: p.onValueChange,
    };
    watch();
    ownEscape();
    return true;
  };
  const emit = (value, kind, normalizeDraft = true) => {
    if (value == null || value === last.current) return true;
    if (!begin(kind)) return false;
    last.current = value;
    if (normalizeDraft) setRaw(String(value));
    return interaction.current.change?.(interaction.current.token, value) !== false;
  };
  const startInput = () => {
    if (latest.current.disabled || editingRef.current) return;
    editingRef.current = true;
    setEditing(true);
    ownEscape();
    watch();
  };
  lifecycle.current = {
    cancel,
    leave: () => {
      clearDrag();
      editingRef.current = false;
      dirty.current = false;
      setEditing(false);
      finish();
    },
  };
  const watch = () => {
    if (stopWatching.current) return;
    const blur = () => {
      if (drag.current) lifecycle.current.cancel();
    };
    const hidden = () => {
      if (document.hidden && drag.current) lifecycle.current.cancel();
    };
    const leave = () => lifecycle.current.leave();
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leave);
    stopWatching.current = () => {
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leave);
    };
  };
  useLayoutEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);
  useLayoutEffect(() => {
    if (!interaction.current && !editingRef.current && !drag.current) {
      last.current = props.value;
      raw.current = props.value == null ? '' : String(props.value);
      setDraft(raw.current);
    }
  }, [props.value]);
  useLayoutEffect(() => {
    const owner = props.owner;
    editingRef.current = false;
    dirty.current = false;
    setEditing(false);
    setDragging(false);
    last.current = latest.current.value;
    raw.current = last.current == null ? '' : String(last.current);
    setDraft(raw.current);
    return () => {
      stopWatching.current?.();
      stopWatching.current = null;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      const current = interaction.current;
      interaction.current = null;
      dismiss.current?.();
      dismiss.current = null;
      if (current)
        (latest.current.owner !== owner || latest.current.disabled
          ? current.cancel
          : current.end)?.(current.token);
      const previous = drag.current;
      drag.current = null;
      if (previous?.handle.hasPointerCapture?.(previous.pointerId))
        previous.handle.releasePointerCapture(previous.pointerId);
      editingRef.current = false;
      dirty.current = false;
    };
  }, [props.owner, props.disabled]);
  const atPointer = (x, active) => {
    const p = latest.current;
    return textNumericAtPointer(x, active.rect, p.min, p.max, p.step);
  };
  const flushPointer = (x) => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const active = drag.current;
    if (active) emit(atPointer(x, active), 'pointer');
  };
  const onInputBlur = () => {
    if (editingRef.current || dirty.current) {
      const value = pending();
      if (dirty.current && value != null) emit(value, 'input');
      dirty.current = false;
      editingRef.current = false;
      setEditing(false);
    }
    finish();
  };
  return {
    rootRef,
    inputRef,
    draft,
    editing,
    dragging,
    onPointerDown: (event) => {
      if (props.disabled || editingRef.current || drag.current || event.button !== 0) return;
      const focused = event.currentTarget.ownerDocument.activeElement;
      if (focused && focused !== inputRef.current) focused.blur?.();
      const readout = Boolean(
        event.target.closest(
          '[data-slot="control-number-input"],[data-slot="control-number-suffix"]',
        ),
      );
      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        rect: event.currentTarget.getBoundingClientRect(),
        moved: false,
        readout,
        handle: event.currentTarget,
      };
      watch();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      if (!readout) emit(atPointer(event.clientX, drag.current), 'pointer');
    },
    onPointerMove: (event) => {
      const active = drag.current;
      if (
        !active ||
        active.pointerId !== event.pointerId ||
        (!active.moved && Math.abs(event.clientX - active.startX) < 3)
      )
        return;
      active.moved = true;
      active.x = event.clientX;
      setDragging(true);
      if (frame.current == null)
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          const next = drag.current;
          if (next) emit(atPointer(next.x, next), 'pointer');
        });
    },
    onPointerUp: (event) => {
      const active = drag.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (active.moved) flushPointer(event.clientX);
      clearDrag();
      if (!active.moved && active.readout) startInput();
      else finish();
    },
    onPointerCancel: (event) => {
      if (drag.current?.pointerId === event.pointerId) cancel();
    },
    onLostPointerCapture: (event) => {
      if (drag.current?.pointerId === event.pointerId) cancel();
    },
    onInputClick: (event) => {
      if (event.detail === 0) startInput();
    },
    onInputChange: (event) => {
      startInput();
      setRaw(event.currentTarget.value);
      dirty.current = true;
      // Register a pending reader even before an out-of-range draft becomes a
      // valid preview. Persistence can then settle the actual final input.
      if (!begin('input')) return;
      const value = parseTextNumeric(event.currentTarget.value),
        p = latest.current;
      if (value != null && value >= p.min && value <= p.max)
        emit(p.snapToStep ? snapTextNumeric(value, p.min, p.max, p.step) : value, 'input');
    },
    onInputBlur,
    onInputKeyDown: (event) => {
      event.stopPropagation();
      if (props.disabled) return;
      if (event.key === 'Escape' && (editingRef.current || interaction.current)) {
        event.preventDefault();
        cancel();
        return;
      }
      if (editingRef.current) {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        startInput();
        return;
      }
      if (!arrowKeys.includes(event.key)) return;
      event.preventDefault();
      const value = parseTextNumeric(raw.current) ?? props.value ?? props.min;
      const delta = props.step * (event.shiftKey ? 10 : 1);
      const next =
        event.key === 'Home'
          ? props.min
          : event.key === 'End'
            ? props.max
            : value + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -delta : delta);
      emit(snapTextNumeric(next, props.min, props.max, props.step), 'keyboard');
    },
    onInputKeyUp: (event) => {
      if (!editingRef.current && arrowKeys.includes(event.key)) finish();
    },
  };
}
