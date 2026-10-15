import './mark.css';

export function MarkAttachment({ available = false, active = false, disabled = false, onToggle }) {
  if (!available) return null;
  return (
    <button
      type="button"
      className={`cv-mark-attachment mark-mode-toggle nodrag nopan${active ? ' is-active' : ''}`}
      aria-label="标记"
      aria-pressed={Boolean(active)}
      disabled={disabled || typeof onToggle !== 'function'}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
        onToggle?.(event.currentTarget);
      }}
    >
      <span className="cv-mark-attachment-icon" aria-hidden="true" />
      <span>标记</span>
    </button>
  );
}

export default MarkAttachment;
