import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useDialogBehavior } from '../../../hooks/useDialogBehavior.js';
import { DialogFocusBoundary } from '../../../components/DialogFocusBoundary.jsx';
import { generatorExpandedSize, resizeExpandedGenerator } from './expanded-geometry.js';
import { useGeneratorSurfacePlacement } from './useGeneratorSurfacePlacement.js';

const directions = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];

/** Only the frame owns expansion. Prompt/controller state remains in its caller. */
export default function GeneratorFrame({
  children,
  label,
  readonly,
  ready,
  expandedSize,
  onExpandedSizeChange,
  onBeforeTransition,
  style,
  placement,
}) {
  const [expanded, setExpanded] = useState(false);
  const [size, setSize] = useState(() => generatorExpandedSize(expandedSize));
  const container = useRef(null),
    expandTrigger = useRef(null),
    returnToTrigger = useRef(false),
    resize = useRef(null),
    currentSize = useRef(size);
  currentSize.current = size;
  const surfacePlacement = useGeneratorSurfacePlacement(placement, !!placement && !expanded);
  const transition = (next) => {
    if (next && (readonly || !ready)) return;
    if (onBeforeTransition?.() === false) return;
    if (!next && expanded)
      returnToTrigger.current =
        container.current?.contains(document.activeElement) ||
        document.activeElement === document.body;
    resize.current = null;
    if (next) setSize(generatorExpandedSize(expandedSize));
    setExpanded(next);
  };
  useDialogBehavior(container, { enabled: expanded, onClose: () => transition(false) });
  useEffect(() => {
    if (expanded || !returnToTrigger.current) return;
    returnToTrigger.current = false;
    // Portal remounts disconnect the original expand button. Let dialog-stack
    // restore any valid opener first, then restore the replacement control only
    // when focus otherwise fell back to the body.
    if (!readonly && ready && document.activeElement === document.body)
      expandTrigger.current?.focus({ preventScroll: true });
  }, [expanded, readonly, ready]);
  useEffect(() => {
    if (!readonly && ready) return;
    resize.current = null;
    setExpanded(false);
  }, [readonly, ready]);
  const start = (direction, event) => {
    if (readonly || !ready) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resize.current = {
      direction,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ...currentSize.current,
      maxWidth: Math.floor(window.innerWidth * 0.9),
      maxHeight: Math.floor(window.innerHeight * 0.9),
    };
  };
  const move = (event) => {
    if (!resize.current || resize.current.pointerId !== event.pointerId) return;
    const next = resizeExpandedGenerator(resize.current, { x: event.clientX, y: event.clientY });
    currentSize.current = next;
    setSize(next);
  };
  const finish = (event) => {
    if (!resize.current || resize.current.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resize.current = null;
    if (!readonly && ready) onExpandedSizeChange?.(currentSize.current);
  };
  const content = (
    <section
      ref={surfacePlacement.ref}
      className={'cv-inline-generator cv-floating' + (expanded ? ' cv-generator-is-expanded' : '')}
      aria-label={label}
      data-generator-side={expanded ? undefined : surfacePlacement.side}
      style={expanded ? undefined : surfacePlacement.style || style}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children({
        expanded,
        collapse: () => transition(false),
        portalTarget: () => (expanded ? container.current : document.body),
      })}
      {!readonly && (
        <button
          type="button"
          ref={expandTrigger}
          className="cv-generator-expand"
          disabled={!ready}
          aria-label={expanded ? '收起生成器' : '展开生成器'}
          onClick={() => transition(!expanded)}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      )}
    </section>
  );
  if (!expanded) return content;
  return createPortal(
    <div
      className="cv-generator-expanded-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) transition(false);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={container}
        className="cv-generator-expanded-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={'展开' + label}
        tabIndex={-1}
        style={{ width: size.width, height: size.height }}
      >
        <DialogFocusBoundary edge="start" />
        {content}
        {directions.map((direction) => (
          <div
            key={direction}
            className={'cv-generator-resize cv-generator-resize-' + direction}
            data-resize-direction={direction}
            onPointerDown={(event) => start(direction, event)}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={finish}
          />
        ))}
        <span className="cv-generator-resize-mark" aria-hidden="true">
          ⌟
        </span>
        <DialogFocusBoundary edge="end" />
      </div>
    </div>,
    document.body,
  );
}
