import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function ClipEditorSideRail({
  side,
  title,
  maximum,
  width,
  setWidth,
  children,
  onClose,
  footer,
  actions,
  leading,
}) {
  const root = useRef(null);
  const cancel = useRef(null);
  useEffect(() => () => cancel.current?.(), []);
  const changeWidth = (value) => setWidth(Math.min(maximum, Math.max(220, value)));
  const startResize = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancel.current?.();
    const start = event.clientX;
    const before = root.current.getBoundingClientRect().width;
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    let latestX = start;
    let frame = null;
    const applyWidth = () => {
      frame = null;
      changeWidth(before + (latestX - start) * (side === 'left' ? 1 : -1));
    };
    const move = (next) => {
      if (next.pointerId !== pointerId) return;
      latestX = next.clientX;
      if (frame == null) frame = requestAnimationFrame(applyWidth);
    };
    const finish = (next) => {
      if (next.type !== 'blur' && next.pointerId !== pointerId) return;
      if (next.type === 'pointerup') latestX = next.clientX;
      if (frame != null) cancelAnimationFrame(frame);
      applyWidth();
      cancel.current?.();
    };
    const dispose = () => {
      if (frame != null) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('blur', finish);
      handle.removeEventListener('lostpointercapture', finish);
      cancel.current = null;
      if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
    };
    cancel.current = dispose;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    handle.addEventListener('lostpointercapture', finish);
    handle.setPointerCapture?.(pointerId);
  };
  return (
    <aside
      ref={root}
      className={`cv-clip-transition-rail cv-clip-transition-${side}`}
      style={{ '--rail-width': `${width}px` }}
      aria-label={title}
    >
      <header>
        <div className="cv-clip-rail-title">
          {leading}
          <span>{title}</span>
        </div>
        <div className="cv-clip-rail-actions">
          {actions}
          {onClose && (
            <button type="button" aria-label={`关闭${title}`} onClick={onClose}>
              <X size={14} />
            </button>
          )}
        </div>
      </header>
      <div className="cv-clip-transition-rail-content">{children}</div>
      {footer}
      <div
        role="separator"
        aria-label={`调整${title}宽度`}
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuemax={maximum}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        className="cv-clip-transition-resize"
        onPointerDown={startResize}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          changeWidth(width + (event.key === 'ArrowRight' ? 8 : -8) * (side === 'left' ? 1 : -1));
        }}
      />
    </aside>
  );
}
