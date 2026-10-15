import { Crosshair, X } from 'lucide-react';
import './CanvasReferencePickBar.css';

const stopPropagation = (event) => event.stopPropagation();

/** Source reference-mode hint. Its controller owns exit, focus and viewport movement. */
export function CanvasReferencePickBar({
  active = true,
  onReturnToTarget,
  onExit,
  disabled = false,
  top = 12,
}) {
  if (!active) return null;
  return (
    <div
      className="cv-reference-pick-bar nodrag nopan"
      style={{ top }}
      role="region"
      aria-label="参考选择"
      onPointerDown={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
    >
      <div className="cv-reference-pick-bar-heading">
        <span className="cv-reference-pick-bar-icon" aria-hidden="true">
          <Crosshair size={16} />
        </span>
        <span className="cv-reference-pick-bar-title">从画布或资产管理选择参考</span>
      </div>
      <div className="cv-reference-pick-bar-actions">
        <button
          type="button"
          className="cv-reference-pick-bar-return"
          disabled={disabled}
          onClick={onReturnToTarget}
        >
          返回节点
        </button>
        <button
          type="button"
          className="cv-reference-pick-bar-exit"
          aria-label="退出参考选择"
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

export default CanvasReferencePickBar;
