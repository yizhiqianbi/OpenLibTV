import { Target, X } from 'lucide-react';
import './focus.css';

const stop = (event) => event.stopPropagation();

/** Source mode hint; its caller owns Escape, viewport return and mode cancellation. */
export function CanvasFocusModeBar({
  active = true,
  onReturnToTarget,
  onExit,
  disabled = false,
  top = 12,
}) {
  if (!active) return null;
  return (
    <div
      className="cv-focus-mode-bar nodrag nopan"
      style={{ top }}
      role="region"
      aria-label="聚焦编辑模式"
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      <div className="cv-focus-mode-heading">
        <span className="cv-focus-mode-icon" aria-hidden="true">
          <Target size={16} />
        </span>
        <div className="cv-focus-mode-copy">
          <span className="cv-focus-mode-title">聚焦编辑模式</span>
          <span className="cv-focus-mode-subtitle">请在图片上框选聚焦区域</span>
        </div>
      </div>
      <div className="cv-focus-mode-actions">
        <button
          type="button"
          className="cv-focus-mode-return"
          disabled={disabled}
          onClick={onReturnToTarget}
        >
          返回节点
        </button>
        <button
          type="button"
          className="cv-focus-mode-exit"
          aria-label="退出聚焦模式"
          title="退出"
          disabled={disabled}
          onClick={onExit}
        >
          <X size={12} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default CanvasFocusModeBar;
