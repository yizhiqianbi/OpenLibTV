import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './storyboard-group-controls.css';

export function SourceTooltip({ label, disabled, children, delay = 200 }) {
  const id = useId();
  const host = useRef(null),
    timer = useRef(null);
  const [position, setPosition] = useState(null);
  const close = () => {
    window.clearTimeout(timer.current);
    setPosition(null);
  };
  const schedule = () => {
    window.clearTimeout(timer.current);
    if (disabled) return;
    timer.current = window.setTimeout(() => {
      const rect = host.current?.getBoundingClientRect();
      if (rect)
        setPosition({
          left: Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8)),
          top: Math.max(8, rect.top - 8),
        });
    }, delay);
  };
  useEffect(() => {
    window.clearTimeout(timer.current);
    setPosition(null);
    return () => window.clearTimeout(timer.current);
  }, [disabled, label, delay]);
  return (
    <>
      <span
        ref={host}
        className="cv-storyboard-control-tooltip-anchor"
        onMouseEnter={schedule}
        onMouseLeave={close}
        onFocus={schedule}
        onBlur={close}
        onClick={close}
      >
        {cloneElement(children, { 'aria-describedby': position ? id : undefined })}
      </span>
      {position &&
        createPortal(
          <div id={id} className="cv-storyboard-control-tooltip" role="tooltip" style={position}>
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}
function menuKeys(event) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]:not(:disabled)')];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  event.preventDefault();
  event.stopPropagation();
  items[next].focus();
}
export function Menu({ popover, label, children, className = '', style }) {
  if (!popover.open) return null;
  return createPortal(
    <div
      ref={popover.popoverRef}
      {...popover.popoverProps}
      className={`cv-storyboard-control-menu nodrag nopan nowheel ${className}`}
      style={style ?? popover.popoverStyle}
      role="menu"
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={menuKeys}
    >
      {children}
    </div>,
    document.body,
  );
}
export function useToolbarPosition(anchor, portal, ref) {
  const anchorX = anchor?.x,
    anchorY = anchor?.y;
  const [style, setStyle] = useState({ visibility: 'hidden' });
  useLayoutEffect(() => {
    if (!portal || anchorX == null || anchorY == null || !ref.current) return;
    const place = () => {
      const bounds = portal.getBoundingClientRect();
      const width = bounds.width || portal.clientWidth || window.innerWidth;
      const height = bounds.height || portal.clientHeight || window.innerHeight;
      const maxWidth = Math.max(1, width - 16);
      const box = ref.current.getBoundingClientRect();
      const toolbarWidth = Math.min(maxWidth, box.width || ref.current.scrollWidth || maxWidth);
      const toolbarHeight = box.height || 49;
      setStyle({
        left: Math.max(8, Math.min(anchorX - toolbarWidth / 2, width - toolbarWidth - 8)),
        top: Math.max(8, Math.min(anchorY - 28 - toolbarHeight, height - toolbarHeight - 8)),
        maxWidth,
      });
    };
    place();
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(place) : null;
    observer?.observe(portal);
    observer?.observe(ref.current);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [anchorX, anchorY, portal, ref]);
  return style;
}

// Keep source tn's below-first placement while the shared hook owns dismissal/focus.
export function useSourceMenuPosition(
  popover,
  { width, count, align = 'left', anchor, parent, preferAbove = false },
) {
  const [style, setStyle] = useState(null);
  const { open, triggerRef, popoverRef } = popover;
  const anchorX = anchor?.x,
    anchorY = anchor?.y;
  const parentRef = parent?.popoverRef;
  useLayoutEffect(() => {
    if (!open) return;
    let frame;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const actualWidth = Math.min(width, Math.max(1, window.innerWidth - 16));
      const height =
        popoverRef.current?.getBoundingClientRect().height ||
        8 + 40 * count + 2 * Math.max(0, count - 1);
      let left, top, availableHeight;
      if (parentRef) {
        const panel = parentRef.current?.getBoundingClientRect();
        if (!panel) return;
        const right = panel.right + 6;
        const leftSide = panel.left - actualWidth - 6;
        if (right + actualWidth <= window.innerWidth - 8 || leftSide >= 8) {
          left = right + actualWidth <= window.innerWidth - 8 ? right : leftSide;
          top = Math.max(8, Math.min(panel.top, window.innerHeight - height - 8));
          availableHeight = window.innerHeight - top - 8;
        } else {
          // A clamped side flyout would cover its own hover/click trigger on mobile.
          const below = Math.max(0, window.innerHeight - 8 - panel.bottom - 6);
          const above = Math.max(0, panel.top - 14);
          const useBelow = preferAbove
            ? !(above >= height || above >= below)
            : below >= height || (above < height && below >= above);
          availableHeight = useBelow ? below : above;
          left = panel.left;
          top = useBelow
            ? Math.min(window.innerHeight - 8, panel.bottom + 6)
            : Math.max(8, panel.top - 6 - Math.min(height, availableHeight));
        }
      } else {
        const below = Math.max(0, window.innerHeight - 8 - trigger.bottom - 8);
        const above = Math.max(0, trigger.top - 16);
        const useBelow = preferAbove
          ? !(above >= height || above >= below)
          : below >= height || (above < height && below >= above);
        availableHeight = useBelow ? below : above;
        top = useBelow
          ? trigger.bottom + 8
          : Math.max(8, trigger.top - 8 - Math.min(height, availableHeight));
        left =
          align === 'center' ? trigger.left + trigger.width / 2 - actualWidth / 2 : trigger.left;
      }
      setStyle({
        position: 'fixed',
        left: Math.max(8, Math.min(left, window.innerWidth - actualWidth - 8)),
        top,
        width: actualWidth,
        maxHeight: availableHeight,
        zIndex: parentRef ? 1101 : 1100,
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (triggerRef.current) observer?.observe(triggerRef.current);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    if (parentRef?.current) observer?.observe(parentRef.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  }, [open, triggerRef, popoverRef, width, count, align, parentRef, anchorX, anchorY, preferAbove]);
  return style ?? popover.popoverStyle;
}
