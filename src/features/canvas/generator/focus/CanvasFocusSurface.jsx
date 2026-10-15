import { forwardRef } from 'react';
import './focus.css';

const HANDLES = [
  ['nw', '左上角'],
  ['n', '上边'],
  ['ne', '右上角'],
  ['e', '右边'],
  ['se', '右下角'],
  ['s', '下边'],
  ['sw', '左下角'],
  ['w', '左边'],
];

function FocusReticle({ scale }) {
  return (
    <div className="cv-focus-reticle" style={{ transform: `scale(${scale})` }} aria-hidden="true">
      <svg width="31" height="31" viewBox="0 0 31 31" fill="none">
        <path d="M8.5 0.5H2.5C1.39543 0.5 0.5 1.39543 0.5 2.5V8.5" stroke="white" />
        <path d="M8.5 30.5098H2.5C1.39543 30.5098 0.5 29.6143 0.5 28.5098V22.5098" stroke="white" />
        <path d="M22.2974 0.5H28.2974C29.4019 0.5 30.2974 1.39543 30.2974 2.5V8.5" stroke="white" />
        <path
          d="M22.2974 30.5098H28.2974C29.4019 30.5098 30.2974 29.6143 30.2974 28.5098V22.5098"
          stroke="white"
        />
      </svg>
      <svg className="cv-focus-crosshair" width="17" height="17" viewBox="0 0 17 17" fill="none">
        <line x1="0" y1="8" x2="17" y2="8" stroke="white" />
        <line x1="9" y1="0" x2="9" y2="17" stroke="white" />
      </svg>
    </div>
  );
}

/** Controlled source content overlay. Pointer ownership, geometry and graph writes stay upstream. */
export const CanvasFocusSurface = forwardRef(function CanvasFocusSurface(
  {
    region,
    active = true,
    drawing = false,
    interacting = false,
    resizeHandle,
    zoom = 1,
    disabled = false,
    onStart,
    onResize,
  },
  ref,
) {
  const usable = active && !disabled;
  const scale = Number.isFinite(zoom) && zoom > 0 ? 1 / zoom : 1;
  const resizeCursor =
    usable && interacting && HANDLES.some(([handle]) => handle === resizeHandle)
      ? `${resizeHandle}-resize`
      : undefined;
  const visible =
    region &&
    [region.relX, region.relY, region.width, region.height].every(Number.isFinite) &&
    region.width > 0 &&
    region.height > 0;
  return (
    <div
      ref={ref}
      className={`cv-focus-surface${active ? ' is-active' : ''}${drawing ? ' is-drawing' : ''}${interacting ? ' is-interacting' : ''}`}
      data-focus-surface="true"
      data-focus-resize-handle={resizeHandle || undefined}
      style={{ pointerEvents: usable ? 'auto' : 'none', cursor: resizeCursor }}
      onPointerDown={(event) => {
        if (!usable) return;
        event.stopPropagation();
        event.preventDefault();
        onStart?.(event);
      }}
      onClick={(event) => {
        if (usable) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        if (usable) event.stopPropagation();
      }}
    >
      {visible && (
        <div
          className="cv-focus-region"
          data-focus-region="true"
          style={{
            left: `${region.relX * 100}%`,
            top: `${region.relY * 100}%`,
            width: `${region.width * 100}%`,
            height: `${region.height * 100}%`,
            pointerEvents: usable && !drawing ? 'auto' : 'none',
            boxShadow: active ? '0 0 0 9999px rgba(0, 0, 0, 0.5)' : 'none',
            cursor: resizeCursor,
          }}
        >
          {active && <FocusReticle scale={scale} />}
          {usable &&
            !drawing &&
            HANDLES.map(([handle, label]) => (
              <div
                key={handle}
                className={`cv-focus-handle is-${handle}`}
                data-focus-handle={handle}
                title={`调整聚焦区域${label}`}
                style={{ '--cv-focus-handle-scale': scale }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onResize?.(handle, event);
                }}
              />
            ))}
        </div>
      )}
    </div>
  );
});

export function FocusModePlaceholder() {
  return (
    <div className="cv-focus-placeholder" data-focus-mode-placeholder="true">
      <span className="cv-focus-placeholder-title">聚焦模式</span>
      <span className="cv-focus-placeholder-hint">请选择一张图像进行「局部框选」操作</span>
      <span className="cv-focus-placeholder-escape">按ESC键可退出当前模式</span>
    </div>
  );
}

export default CanvasFocusSurface;
