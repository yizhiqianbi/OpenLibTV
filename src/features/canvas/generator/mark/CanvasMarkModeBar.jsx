import { MousePointerClick, X } from 'lucide-react';
import './mark.css';

const stop = (event) => event.stopPropagation();

export function CanvasMarkModeBar({
  active = true,
  onReturnToTarget,
  onExit,
  disabled = false,
  top = 12,
}) {
  if (!active) return null;
  return (
    <div
      className="cv-mark-mode-bar nodrag nopan"
      role="region"
      aria-label="元素选择模式"
      style={{ top }}
      onPointerDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      <div className="cv-mark-mode-heading">
        <span className="cv-mark-mode-icon" aria-hidden="true">
          <MousePointerClick size={16} />
        </span>
        <div className="cv-mark-mode-copy">
          <span className="cv-mark-mode-title">元素选择模式</span>
          <span className="cv-mark-mode-subtitle">点击图片选择局部元素</span>
        </div>
      </div>
      <div className="cv-mark-mode-actions">
        <button
          type="button"
          className="cv-mark-mode-return"
          disabled={disabled}
          onClick={onReturnToTarget}
        >
          返回节点
        </button>
        <button
          type="button"
          className="cv-mark-mode-exit"
          aria-label="退出元素选择模式"
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

export default CanvasMarkModeBar;
