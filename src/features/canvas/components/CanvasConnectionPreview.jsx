import { useEffect, useState } from 'react';
import { canvasHandlePoint } from '../domain/connection-gesture-model.js';
import './canvas-connection-preview.css';

const segments = Array.from({ length: 6 }, (_, index) => ({
  dash: index === 0 ? '36 64' : `0 ${6 * index} ${36 - 6 * index} 64`,
  opacity: 0.15 / (1 - 0.15 * index),
}));

/** Shared source EdgeFlowSegments paint; callers supply their distinct path geometry. */
export function CanvasConnectionFlow({ path, scale = 1 }) {
  return (
    <g className="cv-connection-flow" data-interaction-persistent="" fill="none">
      {[
        { dash: '36 64', opacity: 0.06, width: 12, cap: 'round' },
        { dash: '36 64', opacity: 0.12, width: 7, cap: 'round' },
        ...segments.map((segment) => ({ ...segment, width: 4, cap: 'butt' })),
      ].map((segment, index) => (
        <path
          key={index}
          className="cv-link-preview cv-connection-flow-path"
          d={path}
          pathLength={300}
          stroke="rgb(100, 180, 255)"
          strokeWidth={segment.width * scale}
          strokeOpacity={segment.opacity}
          strokeDasharray={segment.dash}
          strokeLinecap={segment.cap}
          style={{
            '--cv-flow-width': segment.width * scale,
            '--cv-flow-opacity': segment.opacity,
            '--cv-flow-dash': segment.dash,
          }}
        />
      ))}
    </g>
  );
}

/** Original XYFlow horizontal Bezier controls, default curvature .25. */
function previewPath(origin, endpoint, handleType) {
  const start = canvasHandlePoint(origin, handleType);
  const direction = handleType === 'target' ? -1 : 1;
  const distance = direction * (endpoint.x - start.x);
  const offset = distance >= 0 ? distance / 2 : 6.25 * Math.sqrt(-distance);
  return `M${start.x},${start.y} C${start.x + direction * offset},${start.y} ${endpoint.x - direction * offset},${endpoint.y} ${endpoint.x},${endpoint.y}`;
}

function InvalidConnectionTooltip({ point, zoom, reasonLabel }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 600);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const inverse = 1 / zoom;
  return (
    <foreignObject
      className="cv-connection-invalid-tooltip"
      x={point.x - 48 * inverse}
      y={point.y - 60 * inverse}
      width={96 * inverse}
      height={60 * inverse}
    >
      <div
        className="cv-connection-invalid-label"
        title={reasonLabel || undefined}
        style={{ transform: `scale(${inverse})` }}
      >
        无法连接
      </div>
    </foreignObject>
  );
}

/** SVG-only view: the controller owns target validation, snapping and pointer coordinates. */
export function CanvasConnectionPreview({ preview, origin, zoom = 1 }) {
  if (!preview || !origin || origin.id !== preview.nodeId) return null;
  const endpoint = preview.endpoint || preview.point;
  if (!endpoint || !Number.isFinite(endpoint.x) || !Number.isFinite(endpoint.y)) return null;
  const invalid = preview.status === 'invalid';
  const path = previewPath(origin, endpoint, preview.handleType);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const tooltipOwner = JSON.stringify([
    preview.documentKey,
    preview.gestureId,
    preview.nodeId,
    preview.handleType,
    preview.target?.nodeId || '',
  ]);
  return (
    <g
      className={`cv-connection-preview${invalid ? ' is-invalid' : ' cv-connection-preview-glow'}`}
      data-connection-status={preview.status || 'unknown'}
      style={{ pointerEvents: 'none' }}
    >
      <path
        className="cv-link-preview cv-connection-underlay"
        d={path}
        fill="none"
        stroke={invalid ? 'rgba(180, 180, 180, 0.2)' : 'rgba(100, 180, 255, 0.4)'}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <path
        className="cv-link-preview cv-connection-line"
        d={path}
        fill="none"
        stroke={invalid ? 'rgba(160, 160, 160, 0.6)' : 'var(--canvas-edge-hover, #c0c8d0)'}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {!invalid && <CanvasConnectionFlow path={path} />}
      {invalid && (
        <InvalidConnectionTooltip
          key={tooltipOwner}
          point={preview.point || endpoint}
          zoom={safeZoom}
          reasonLabel={preview.reasonLabel}
        />
      )}
    </g>
  );
}

export default CanvasConnectionPreview;
