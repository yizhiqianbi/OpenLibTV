import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FOCUS_ASPECTS } from './focus-region-model.js';
import './focus.css';

const stop = (event) => event.stopPropagation();

/** Non-modal source confirmation. Observers follow one rendered surface and owner only. */
export function CanvasFocusConfirmBar({
  active = true,
  region,
  selectedRatio,
  surfaceElement,
  ownerKey,
  disabled = false,
  error,
  onRetrySave,
  retryDisabled = false,
  onRatioChange,
  onCancel,
  onConfirm,
}) {
  const bar = useRef(null);
  const latest = useRef(null);
  const shown = !!(
    active &&
    region &&
    [region.relX, region.relY, region.width, region.height].every(Number.isFinite) &&
    region.width > 0 &&
    region.height > 0
  );
  latest.current = { shown, ownerKey, surfaceElement };
  useLayoutEffect(() => {
    const element = surfaceElement;
    const target = bar.current;
    if (!shown || !element || !target) return;
    let current = true;
    let frame = null;
    let frameVersion = 0;
    let transitioning = false;
    const viewport = element.closest('.cv-world,.react-flow__viewport');
    const matches = () =>
      current &&
      latest.current.shown &&
      latest.current.ownerKey === ownerKey &&
      latest.current.surfaceElement === element &&
      bar.current === target;
    const place = () => {
      if (!matches()) return;
      const rect = element.getBoundingClientRect();
      if (
        !element.isConnected ||
        ![rect.left, rect.top, rect.width, rect.height, rect.bottom].every(Number.isFinite) ||
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        target.style.visibility = 'hidden';
        return;
      }
      let center = rect.left + rect.width / 2;
      const viewportWidth = window.innerWidth;
      // Retain the source desktop anchor; narrow screens keep all actions reachable.
      if (Number.isFinite(viewportWidth) && viewportWidth > 0 && viewportWidth <= 600) {
        const width = target.getBoundingClientRect().width;
        if (Number.isFinite(width) && width > 0) {
          const minimum = 8 + width / 2;
          const maximum = viewportWidth - 8 - width / 2;
          center =
            maximum < minimum ? viewportWidth / 2 : Math.min(maximum, Math.max(minimum, center));
        }
      }
      target.style.left = `${center}px`;
      target.style.top = `${rect.bottom + 8}px`;
      target.style.visibility = 'visible';
    };
    const cancelFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      frameVersion += 1;
    };
    const schedule = () => {
      if (!matches() || frame !== null) return;
      const version = frameVersion;
      frame = requestAnimationFrame(() => {
        if (!matches() || version !== frameVersion) return;
        frame = null;
        place();
        if (transitioning) schedule();
      });
    };
    const isViewportTransform = (event) =>
      event.target === viewport && event.propertyName === 'transform' && !event.pseudoElement;
    const startTransition = (event) => {
      if (!matches() || !isViewportTransform(event)) return;
      transitioning = true;
      schedule();
    };
    const stopTransition = (event) => {
      if (!matches() || !isViewportTransform(event)) return;
      transitioning = false;
      cancelFrame();
      place();
    };
    place();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    const mutation =
      viewport && typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    resize?.observe(element);
    resize?.observe(target);
    mutation?.observe(viewport, { attributes: true, attributeFilter: ['style', 'transform'] });
    viewport?.addEventListener('transitionrun', startTransition);
    viewport?.addEventListener('transitionstart', startTransition);
    viewport?.addEventListener('transitionend', stopTransition);
    viewport?.addEventListener('transitioncancel', stopTransition);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      current = false;
      transitioning = false;
      cancelFrame();
      resize?.disconnect();
      mutation?.disconnect();
      viewport?.removeEventListener('transitionrun', startTransition);
      viewport?.removeEventListener('transitionstart', startTransition);
      viewport?.removeEventListener('transitionend', stopTransition);
      viewport?.removeEventListener('transitioncancel', stopTransition);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [shown, surfaceElement, ownerKey]);
  if (!shown || typeof document === 'undefined') return null;
  const errorMessage = typeof error === 'string' ? error : error?.message;
  return createPortal(
    <div
      ref={bar}
      className="cv-focus-confirm-bar nodrag nopan nowheel"
      role="region"
      aria-label="确认聚焦区域"
      data-focus-confirm-bar="true"
      style={{ visibility: 'hidden' }}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onWheel={stop}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      <div className="cv-focus-confirm-actions">
        {FOCUS_ASPECTS.map(({ label }) => (
          <button
            key={label}
            type="button"
            className="cv-focus-aspect-button"
            aria-pressed={selectedRatio === label}
            disabled={disabled}
            onClick={() => onRatioChange?.(label)}
          >
            {label}
          </button>
        ))}
        <span className="cv-focus-confirm-separator" aria-hidden="true" />
        <button
          type="button"
          className="cv-focus-cancel-button"
          disabled={disabled}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="cv-focus-confirm-button"
          disabled={disabled}
          onClick={onConfirm}
        >
          确认
        </button>
      </div>
      {errorMessage && (
        <div className="cv-focus-save-error" role="alert">
          <span>{errorMessage}</span>
          {typeof onRetrySave === 'function' && (
            <button type="button" disabled={retryDisabled} onClick={onRetrySave}>
              重试保存
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

export default CanvasFocusConfirmBar;
