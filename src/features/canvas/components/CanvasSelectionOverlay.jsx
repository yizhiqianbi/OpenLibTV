import { useCallback, useEffect, useRef } from 'react';
import {
  canvasSelectionAddHover,
  canvasSelectionOverlayProjection,
} from '../domain/selection-overlay-model.js';
import './canvas-selection-overlay.css';

const label = '拖拽连线或点击选择节点类型';

/** Source nB. Gesture ownership stays with the caller; this view owns hover paint only. */
export function CanvasSelectionAddIndicator({
  point,
  interactive = true,
  placement = 'right',
  dragging = false,
  visible = true,
  onPointerDown,
  onClick,
  onLostPointerCapture,
  ariaLabel = label,
  entryKey,
}) {
  const indicator = useRef(null);
  const transitionTimer = useRef(null);
  const shown = visible && point && Number.isFinite(point.x) && Number.isFinite(point.y);
  const clearTransitionTimer = useCallback(() => {
    if (transitionTimer.current !== null) {
      clearTimeout(transitionTimer.current);
      transitionTimer.current = null;
    }
  }, []);
  const transition = (duration, transform, timing) => {
    clearTransitionTimer();
    const element = indicator.current;
    if (!element) return;
    element.style.transition = `transform ${duration}ms ${timing}`;
    element.style.transform = transform;
    transitionTimer.current = setTimeout(() => {
      transitionTimer.current = null;
      if (indicator.current === element) element.style.transition = '';
    }, duration);
  };
  useEffect(() => {
    clearTransitionTimer();
    if (indicator.current) {
      indicator.current.style.transition = '';
      indicator.current.style.transform = interactive ? 'translate(-23px, 0px) scale(1)' : '';
    }
    return clearTransitionTimer;
  }, [clearTransitionTimer, interactive, shown]);
  if (!shown) return null;
  const glyph = (
    <span ref={indicator} className="cv-selection-add-indicator" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
  if (!interactive)
    return (
      <span
        className={`cv-selection-add-static${placement === 'center' ? ' is-centered' : ''}`}
        style={{ left: point.x, top: point.y }}
        aria-hidden="true"
      >
        {glyph}
      </span>
    );
  return (
    <button
      type="button"
      className="cv-selection-add-hit nodrag nopan"
      style={{ left: point.x, top: point.y, cursor: dragging ? 'grabbing' : 'crosshair' }}
      aria-label={ariaLabel}
      title={ariaLabel}
      data-canvas-connection-entry={entryKey ? encodeURIComponent(entryKey) : undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onLostPointerCapture={onLostPointerCapture}
      onMouseMove={(event) => {
        const movement = canvasSelectionAddHover(
          { x: event.clientX, y: event.clientY },
          event.currentTarget.getBoundingClientRect(),
        );
        if (movement)
          transition(80, `translate(${movement.x}px, ${movement.y}px) scale(1.1)`, 'ease-out');
      }}
      onMouseLeave={() =>
        transition(400, 'translate(-23px, 0px) scale(1)', 'cubic-bezier(0.34, 1.56, 0.64, 1)')
      }
    >
      {glyph}
    </button>
  );
}

/** Source iF: a screen-space frame; parent owns selection/drag/history and cancellation. */
export default function CanvasSelectionOverlay({
  bounds,
  view,
  zoom,
  ready = true,
  readonly = false,
  sourceNodes = [],
  dragging = false,
  altCopy = false,
  onPointerDown,
  onClick,
  onContextMenu,
  onWheelCapture,
  onLostPointerCapture,
  onAddPointerDown,
  onAddClick,
  onAddLostPointerCapture,
  addDragging = false,
  addVisible = true,
  addInteractive = true,
  addLabel,
  addEntryKey,
}) {
  const projection = canvasSelectionOverlayProjection({ bounds, view, zoom });
  if (!ready || readonly || !projection) return null;
  const cursor = altCopy ? 'copy' : dragging ? 'grabbing' : 'grab';
  const pointerProps = { onPointerDown, onClick, onLostPointerCapture };
  const { borderWidth, ...frame } = projection.frame;
  return (
    <>
      <div
        className="cv-selection-overlay"
        data-canvas-selection-overlay="true"
        style={{ ...frame, willChange: dragging ? 'transform' : undefined }}
        onWheelCapture={onWheelCapture}
        onContextMenu={onContextMenu}
      >
        <div
          className="cv-selection-overlay-fill"
          style={{ borderWidth, cursor, willChange: dragging ? 'transform' : undefined }}
          {...pointerProps}
        />
        {['top', 'right-top', 'right-bottom', 'bottom', 'left'].map((side) => (
          <div
            key={side}
            className={`cv-selection-overlay-hit is-${side}`}
            style={{ cursor }}
            {...pointerProps}
          />
        ))}
      </div>
      <CanvasSelectionAddIndicator
        point={projection.add}
        visible={addVisible && sourceNodes.length > 0}
        interactive={addInteractive}
        dragging={addDragging}
        onPointerDown={onAddPointerDown}
        onClick={onAddClick}
        onLostPointerCapture={onAddLostPointerCapture}
        ariaLabel={addLabel}
        entryKey={addEntryKey}
      />
    </>
  );
}
