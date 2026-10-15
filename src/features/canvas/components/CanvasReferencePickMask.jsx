import './CanvasReferencePickBar.css';

const stopPropagation = (event) => event.stopPropagation();

/** Content-only reference feedback. Target generators remain outside this surface. */
export function CanvasReferencePickMask({
  state,
  blockReason,
  onPick,
  onDisconnect,
  onPointerDown,
  label,
  group = false,
  disabled = false,
  zoom = 1,
}) {
  if (!['pickable', 'blocked', 'connected'].includes(state) || (group && state !== 'pickable'))
    return null;
  const classes = `cv-reference-pick-mask is-${state}${group ? ' is-group' : ''}`;
  if (state === 'blocked')
    return (
      <div
        className={`${classes}${blockReason === 'limit' ? ' is-limit' : ''}`}
        data-ref-block-reason={blockReason || undefined}
        aria-hidden="true"
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.(event);
        }}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
      />
    );
  if (state === 'pickable')
    return (
      <button
        type="button"
        className={`${classes} nodrag nopan`}
        aria-label={label ? `选择 ${label}` : '选择参考'}
        disabled={disabled}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onPick?.(event);
        }}
        onDoubleClick={stopPropagation}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        }}
      />
    );
  return (
    <div className={classes}>
      <button
        type="button"
        className="cv-reference-pick-disconnect nodrag nopan"
        style={{ transform: `scale(${zoom > 0 && Number.isFinite(zoom) ? 1 / zoom : 1})` }}
        disabled={disabled}
        onPointerDown={(event) => {
          event.stopPropagation();
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onDisconnect?.(event);
        }}
        onDoubleClick={stopPropagation}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
        }}
      >
        取消选择
      </button>
    </div>
  );
}

export default CanvasReferencePickMask;
