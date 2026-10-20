import { Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Desktop camera PIP. Position is transient viewport chrome, never document data. */
export function StudioFloatingPreview({ frame, label, playing, onTogglePlay, onClose }) {
  const root = useRef(null);
  const drag = useRef(null);
  const [position, setPosition] = useState(null);

  useEffect(() => {
    const stop = () => {
      drag.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
    };
  }, []);

  const move = (event) => {
    const active = drag.current;
    const host = root.current?.offsetParent;
    if (!active || !host) return;
    const bounds = host.getBoundingClientRect();
    const width = root.current.offsetWidth || 320;
    const height = root.current.offsetHeight || 210;
    setPosition({
      left: clamp(
        active.left + event.clientX - active.x,
        12,
        Math.max(12, bounds.width - width - 12),
      ),
      top: clamp(
        active.top + event.clientY - active.y,
        12,
        Math.max(12, bounds.height - height - 12),
      ),
    });
  };

  return (
    <aside
      ref={root}
      className="cv-studio-floating-preview"
      data-preview-pip
      aria-label="浮动机位预览"
      style={position ? { left: position.left, top: position.top } : undefined}
      onPointerMove={move}
    >
      <header
        className="cv-studio-floating-preview-header"
        onPointerDown={(event) => {
          if (event.button !== 0 || event.target.closest('button')) return;
          const rect = root.current?.getBoundingClientRect();
          const host = root.current?.offsetParent?.getBoundingClientRect();
          if (!rect || !host) return;
          event.preventDefault();
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: rect.left - host.left,
            top: rect.top - host.top,
          };
          root.current?.setPointerCapture?.(event.pointerId);
        }}
      >
        <span title={label}>{label}</span>
        <div className="cv-studio-floating-preview-actions">
          <button
            type="button"
            aria-label={playing ? '暂停浮动机位预览' : '播放浮动机位预览'}
            aria-pressed={playing}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onTogglePlay}
          >
            {playing ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button
            type="button"
            aria-label="关闭浮动机位预览"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <X size={12} />
          </button>
        </div>
      </header>
      <div className="cv-studio-floating-preview-frame">
        {frame ? <img src={frame} alt="" draggable={false} /> : <span>等待机位画面…</span>}
      </div>
    </aside>
  );
}

export default StudioFloatingPreview;
