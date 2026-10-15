import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { registerDialogChildDismissal } from '../services/dialog-stack.ts';

const openPopovers = [];
const focusable = 'button:not(:disabled),[href],input:not(:disabled),[tabindex="0"]';

export function agentToolbarPosition(anchor, size, viewport, { width, maxHeight, offset = 8 }) {
  const margin = 8;
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  const actualWidth = Math.min(width, availableWidth);
  const above = Math.max(0, anchor.top - offset - margin);
  const below = Math.max(0, viewport.height - anchor.bottom - offset - margin);
  const contentHeight = Math.min(size.height || maxHeight, maxHeight);
  const useAbove = above >= contentHeight || above >= below;
  const availableHeight = useAbove ? above : below;
  const height = Math.min(contentHeight, availableHeight);
  return {
    position: 'fixed',
    left: Math.max(
      margin,
      Math.min(
        anchor.left + anchor.width / 2 - actualWidth / 2,
        viewport.width - actualWidth - margin,
      ),
    ),
    top: useAbove ? Math.max(margin, anchor.top - offset - height) : anchor.bottom + offset,
    width: actualWidth,
    maxHeight: Math.min(maxHeight, availableHeight),
    zIndex: 1100,
  };
}

/** Non-modal source popover: outside focus is preserved; only Escape restores the trigger. */
export function useAgentToolbarPopover({
  width = 370,
  maxHeight = 384,
  offset = 8,
  openDelay = 80,
  closeDelay = 200,
  closeOnOutsideScroll = true,
  trigger = 'click',
  disabled = false,
  onOpen,
  onClose,
} = {}) {
  const id = useId();
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const latest = useRef({ disabled, onOpen, onClose });
  const openRef = useRef(false);
  const timer = useRef(null);
  const focusOnOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({
    position: 'fixed',
    width,
    maxHeight,
    zIndex: 1100,
  });
  useLayoutEffect(() => {
    latest.current = { disabled, onOpen, onClose };
  });
  const clearTimer = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(
    ({ restoreFocus = false } = {}) => {
      clearTimer();
      if (!openRef.current) return;
      openRef.current = false;
      setOpen(false);
      latest.current.onClose?.();
      if (restoreFocus && triggerRef.current?.isConnected) triggerRef.current.focus();
    },
    [clearTimer],
  );
  const openPopover = useCallback(
    ({ focus = false } = {}) => {
      clearTimer();
      if (latest.current.disabled || openRef.current) return;
      focusOnOpen.current = focus;
      openRef.current = true;
      setOpen(true);
      latest.current.onOpen?.();
    },
    [clearTimer],
  );
  const toggle = useCallback(
    () => (openRef.current ? close() : openPopover()),
    [close, openPopover],
  );
  const scheduleOpen = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => openPopover(), openDelay);
  }, [clearTimer, openPopover, openDelay]);
  const scheduleClose = useCallback(() => {
    clearTimer();
    timer.current = setTimeout(() => close(), closeDelay);
  }, [clearTimer, close, closeDelay]);

  useLayoutEffect(() => {
    if (!open) return;
    openPopovers.push(id);
    const dismissChild = popoverRef.current
      ? registerDialogChildDismissal(
          popoverRef.current,
          () => close({ restoreFocus: true }),
          triggerRef.current,
        )
      : () => {};
    let frame;
    const position = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      const size = popoverRef.current?.getBoundingClientRect();
      if (!anchor || !size) return;
      setPopoverStyle(
        agentToolbarPosition(
          anchor,
          size,
          { width: window.innerWidth, height: window.innerHeight },
          { width, maxHeight, offset },
        ),
      );
    };
    const schedulePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    const outside = (event) => {
      if (openPopovers.at(-1) !== id) return;
      const target = event.target;
      if (
        !(target instanceof Node) ||
        (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target))
      )
        close();
    };
    const scroll = (event) => {
      if (closeOnOutsideScroll && trigger === 'click') outside(event);
      if (event.type === 'scroll') schedulePosition();
    };
    const keydown = (event) => {
      if (openPopovers.at(-1) !== id || event.key !== 'Escape') return;
      // A modal opened above this non-modal menu owns its own keyboard lifecycle.
      if (
        event.target?.closest?.('.modal-overlay,.cv-modal-overlay') &&
        !popoverRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
    };
    position();
    if (focusOnOpen.current) {
      focusOnOpen.current = false;
      popoverRef.current?.querySelector(focusable)?.focus();
    }
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('wheel', scroll, { capture: true, passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePosition) : null;
    if (popoverRef.current) observer?.observe(popoverRef.current);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    return () => {
      dismissChild();
      const index = openPopovers.indexOf(id);
      if (index >= 0) openPopovers.splice(index, 1);
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('wheel', scroll, true);
    };
  }, [open, id, close, width, maxHeight, offset, closeOnOutsideScroll, trigger]);
  useLayoutEffect(() => {
    if (disabled) close();
  }, [disabled, close]);
  useLayoutEffect(
    () => () => {
      clearTimer();
      openRef.current = false;
    },
    [clearTimer],
  );

  return {
    open,
    triggerRef,
    popoverRef,
    popoverStyle,
    close,
    openPopover,
    toggle,
    triggerProps: {
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
      'aria-haspopup': 'dialog',
      onClick: (event) => {
        event.stopPropagation();
        if (trigger === 'click') toggle();
        else openPopover();
      },
      onKeyDown: (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          openPopover({ focus: true });
        }
      },
      ...(trigger === 'hover'
        ? { onMouseEnter: scheduleOpen, onMouseLeave: scheduleClose, onFocus: () => openPopover() }
        : {}),
    },
    popoverProps: {
      id,
      ...(trigger === 'hover' ? { onMouseEnter: clearTimer, onMouseLeave: scheduleClose } : {}),
    },
  };
}
