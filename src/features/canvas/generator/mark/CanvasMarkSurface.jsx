import { forwardRef, useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, LoaderCircle, Sparkles, X } from 'lucide-react';
import { registerDialogChildDismissal } from '../../../../services/dialog-stack.ts';
import './mark.css';

const stop = (event) => event.stopPropagation();
const finitePoint = (point) => Number.isFinite(point?.relX) && Number.isFinite(point?.relY);
const validBox = (box) =>
  box &&
  [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
  box.width > 0 &&
  box.height > 0;

// Source tO: clamp the outer unscaled label to its content container, then inverse-scale chrome.
function useLabelPosition(labelRef, surfaceRef, point, loading, zoom, ownerKey) {
  useLayoutEffect(() => {
    const label = labelRef.current,
      surface = surfaceRef.current || label?.closest('.cv-mark-surface');
    if (!label || !surface) return;
    let current = true,
      frame = null;
    const place = () => {
      frame = null;
      if (
        !current ||
        labelRef.current !== label ||
        (surfaceRef.current || label.closest('.cv-mark-surface')) !== surface
      )
        return;
      const width = surface.clientWidth,
        height = surface.clientHeight;
      const labelWidth = label.offsetWidth,
        labelHeight = label.offsetHeight;
      if (
        ![width, height, labelWidth, labelHeight].every(
          (value) => Number.isFinite(value) && value > 0,
        )
      )
        return;
      const x = point.relX * width,
        y = point.relY * height;
      const left = Math.max(0, Math.min(x - labelWidth / 2, width - labelWidth));
      const top = Math.max(0, Math.min(y - labelHeight - 8, height - labelHeight));
      const centeredTop = Math.max(0, Math.min(y - labelHeight / 2, height - labelHeight));
      label.style.transform = `translate(${left - x}px, ${(loading ? centeredTop : top) - y}px)`;
    };
    const schedule = () => {
      if (!current || frame !== null) return;
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(surface);
    observer?.observe(label);
    window.addEventListener('resize', schedule);
    return () => {
      current = false;
      if (frame !== null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [labelRef, surfaceRef, point.relX, point.relY, point.suggestions, loading, zoom, ownerKey]);
}

function MarkPoint({ point, surfaceRef, zoom, ownerKey, disabled, onSelect, onDelete }) {
  const labelRef = useRef(null),
    triggerRef = useRef(null),
    menuRef = useRef(null);
  const timer = useRef(null),
    focusOnOpen = useRef(null),
    latest = useRef(null);
  const id = useId();
  const [opened, setOpened] = useState(null);
  const suggestions = Array.isArray(point.suggestions) ? point.suggestions : [];
  const pending = !point.apiResponseId;
  const selected = suggestions[point.selectedSuggestionIndex] ?? suggestions[0];
  const multiple = suggestions.length > 1;
  const open = !!opened && opened.owner === ownerKey && multiple && !disabled;
  latest.current = { ownerKey, disabled };
  const close = useCallback((restoreFocus = false) => {
    clearTimeout(timer.current);
    setOpened(null);
    if (restoreFocus && triggerRef.current?.isConnected)
      triggerRef.current.focus({ preventScroll: true });
  }, []);
  useLabelPosition(labelRef, surfaceRef, point, pending, zoom, ownerKey);
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const menu = menuRef.current,
      trigger = triggerRef.current;
    let current = true,
      frame = null;
    const matches = () =>
      current &&
      latest.current.ownerKey === ownerKey &&
      !latest.current.disabled &&
      menuRef.current === menu;
    const dismiss = (restore = false) => {
      if (matches()) close(restore);
    };
    const outside = (event) => {
      if (labelRef.current?.contains(event.target)) return;
      if (event.type === 'focusin') {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => dismiss(), 150);
      } else dismiss();
    };
    const escape = (event) => {
      if (!matches() || event.defaultPrevented || event.key !== 'Escape' || event.isComposing)
        return;
      if (
        event.target?.closest?.('[role="dialog"][aria-modal="true"]') &&
        !event.target.closest('[role="dialog"]').contains(trigger)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    };
    const position = () => {
      frame = null;
      if (!matches()) return;
      menu.style.marginLeft = '0px';
      if (window.innerWidth <= 600) {
        const rect = menu.getBoundingClientRect();
        const shift =
          rect.left < 8
            ? 8 - rect.left
            : rect.right > window.innerWidth - 8
              ? window.innerWidth - 8 - rect.right
              : 0;
        menu.style.marginLeft = `${shift}px`;
        const anchor = trigger.getBoundingClientRect();
        const available =
          point.relY > 0.6 ? anchor.top - 8 : window.innerHeight - anchor.bottom - 8;
        menu.style.maxHeight = `${Math.max(32, available)}px`;
      } else menu.style.maxHeight = '';
    };
    const schedule = () => {
      if (!matches() || frame !== null) return;
      frame = requestAnimationFrame(position);
    };
    const unregister = registerDialogChildDismissal(menu, () => dismiss(true), trigger);
    position();
    if (focusOnOpen.current !== null) {
      const buttons = menu.querySelectorAll('button');
      (focusOnOpen.current < 0 ? buttons[buttons.length - 1] : buttons[0])?.focus();
      focusOnOpen.current = null;
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(menu);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', schedule);
    return () => {
      current = false;
      clearTimeout(timer.current);
      if (frame !== null) cancelAnimationFrame(frame);
      unregister();
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
      document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', schedule);
    };
  }, [open, ownerKey, close, point.relY]);
  if (!pending && (!selected || typeof selected.label !== 'string')) return null;
  return (
    <>
      {!pending && validBox(selected.bbox) && (
        <div
          className="cv-mark-bbox"
          data-mark-bbox="true"
          style={{
            left: `${selected.bbox.x * 100}%`,
            top: `${selected.bbox.y * 100}%`,
            width: `${selected.bbox.width * 100}%`,
            height: `${selected.bbox.height * 100}%`,
          }}
        />
      )}
      <div
        ref={labelRef}
        className={`cv-mark-label${pending ? ' is-pending' : ''}${open ? ' is-open' : ''}`}
        data-mark-point-index={point.index}
        style={{ left: `${point.relX * 100}%`, top: `${point.relY * 100}%` }}
        onPointerDown={stop}
        onClick={stop}
        onDoubleClick={stop}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        }}
      >
        <div
          className="cv-mark-label-chrome"
          style={{
            transform: `scale(${zoom > 0 ? 1 / zoom : 1})`,
            transformOrigin: pending ? 'center' : 'center bottom',
          }}
        >
          {pending ? (
            <div className="cv-mark-loading" role="status">
              <LoaderCircle size={14} aria-hidden="true" />
              <span>分析中...</span>
            </div>
          ) : (
            <>
              <div className="cv-mark-label-row">
                <button
                  ref={triggerRef}
                  type="button"
                  className="cv-mark-label-trigger"
                  disabled={disabled}
                  aria-haspopup={multiple ? 'menu' : undefined}
                  aria-expanded={multiple ? open : undefined}
                  aria-controls={open ? id : undefined}
                  onClick={() => {
                    if (multiple) setOpened(open ? null : { owner: ownerKey });
                  }}
                  onKeyDown={(event) => {
                    if (!multiple || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    focusOnOpen.current = event.key === 'ArrowUp' ? -1 : 0;
                    setOpened({ owner: ownerKey });
                  }}
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span>{selected.label}</span>
                  {multiple && (
                    <ChevronDown size={14} className={open ? 'is-open' : ''} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  className="cv-mark-delete"
                  aria-label={`删除标记：${selected.label}`}
                  disabled={disabled || typeof onDelete !== 'function'}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    close();
                    onDelete?.(point.apiResponseId);
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </div>
              {open && (
                <div
                  ref={menuRef}
                  id={id}
                  className={`cv-mark-suggestions ${point.relY > 0.6 ? 'is-above' : 'is-below'}`}
                  role="menu"
                  aria-label="标记候选"
                  onKeyDown={(event) => {
                    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const fields = [...menuRef.current.querySelectorAll('button')];
                    const index = fields.indexOf(document.activeElement);
                    const next =
                      event.key === 'Home'
                        ? 0
                        : event.key === 'End'
                          ? fields.length - 1
                          : (index + (event.key === 'ArrowDown' ? 1 : fields.length - 1)) %
                            fields.length;
                    fields[next]?.focus();
                  }}
                >
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      role="menuitemradio"
                      aria-checked={index === point.selectedSuggestionIndex}
                      onClick={(event) => {
                        event.preventDefault();
                        close(true);
                        onSelect?.(point.apiResponseId, index);
                      }}
                    >
                      <span>{suggestion.label}</span>
                      {index === point.selectedSuggestionIndex && (
                        <span className="cv-mark-current" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const CanvasMarkSurface = forwardRef(function CanvasMarkSurface(
  {
    active = true,
    points = [],
    loading = false,
    zoom = 1,
    disabled = false,
    ownerKey,
    onPoint,
    onSelect,
    onDelete,
  },
  forwardedRef,
) {
  const surfaceRef = useRef(null);
  const setRef = useCallback(
    (element) => {
      surfaceRef.current = element;
      if (typeof forwardedRef === 'function') forwardedRef(element);
      else if (forwardedRef) forwardedRef.current = element;
    },
    [forwardedRef],
  );
  if (!active) return null;
  return (
    <div
      ref={setRef}
      className="cv-mark-surface nodrag"
      data-mark-surface="true"
      aria-busy={loading}
      onPointerDown={stop}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled && !loading && event.button === 0) onPoint?.(event);
      }}
      onDoubleClick={stop}
    >
      {points.filter(finitePoint).map((point) => (
        <MarkPoint
          key={`${point.index}:${point.apiResponseId || 'pending'}`}
          point={point}
          surfaceRef={surfaceRef}
          zoom={zoom}
          ownerKey={ownerKey}
          disabled={disabled}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
});

export default CanvasMarkSurface;
