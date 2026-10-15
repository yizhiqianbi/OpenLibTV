import { CANVAS_GROUP_RESIZE_DIRECTIONS } from '../domain/group-resize-model.js';
import './CanvasGroupResizer.css';

const labels = {
  top: '上边',
  right: '右边',
  bottom: '下边',
  left: '左边',
  'top-left': '左上角',
  'top-right': '右上角',
  'bottom-left': '左下角',
  'bottom-right': '右下角',
};

/** Source NodeResizer: four edge lines and four auto-scaled corner handles. */
export function CanvasGroupResizer({
  groupId,
  visible = false,
  selected = false,
  zoom = 1,
  disabled = false,
  onResizeStart,
}) {
  if (!visible) return null;
  const unavailable = disabled || typeof onResizeStart !== 'function';
  const scale = Math.max(1 / (Number.isFinite(zoom) && zoom > 0 ? zoom : 1), 1);
  return CANVAS_GROUP_RESIZE_DIRECTIONS.map((direction) => {
    const corner = direction.includes('-');
    return (
      <button
        key={direction}
        type="button"
        tabIndex={-1}
        aria-label={`调整分组大小 ${labels[direction]}`}
        data-group-resize-direction={direction}
        className={`cv-group-resize-control cv-group-resize-${corner ? 'handle' : 'line'} nodrag nopan`}
        disabled={unavailable}
        style={
          corner
            ? {
                scale,
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: 'var(--canvas-node-border-selected)',
                border: 'none',
              }
            : { borderColor: selected ? 'var(--canvas-node-border-selected)' : 'transparent' }
        }
        onPointerDown={(event) => {
          event.stopPropagation();
          event.preventDefault();
          if (!unavailable) onResizeStart(event, groupId, direction);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    );
  });
}
