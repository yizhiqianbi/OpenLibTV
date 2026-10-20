import { useCallback, useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, Type } from 'lucide-react';
import { registerDialogChildDismissal } from '../../../services/dialog-stack.ts';

export default function ClipSubtitleTimelineRow({
  timeline,
  selectedSubtitleId,
  blocked,
  trackReadOnly = false,
  draftSession,
  onSelectSubtitle,
  onEditSubtitle,
  onBeginEdit,
  onEditPreview,
  onEndEdit,
  onCancelEdit,
  onMoveTrack,
  onTrackDrop,
  trackIndex,
  trackOrder = [],
  label = '字幕',
  kind = 'subtitle',
  emptyLabel = '默认文本',
}) {
  const root = useRef(null),
    drag = useRef(null);
  const release = (active) => {
    if (active.handle?.hasPointerCapture?.(active.pointerId))
      active.handle.releasePointerCapture(active.pointerId);
  };
  const cancel = useCallback(() => {
    const active = drag.current;
    if (!active) return;
    drag.current = null;
    active.dismiss?.();
    active.cancel();
    release(active);
  }, []);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancel();
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [draftSession, blocked, cancel]);
  if (!timeline.subtitles || !Array.isArray(timeline.subtitles.cues)) return null;
  const start = (event, cue, mode) => {
    if (blocked || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectSubtitle?.(cue.id);
    if (cue.readOnly) return;
    if (onBeginEdit?.() !== true) return;
    const active = {
      pointerId: event.pointerId,
      x: event.clientX,
      scale: Math.max(1, timeline.scale),
      cueId: cue.id,
      mode,
      preview: onEditPreview,
      end: onEndEdit,
      cancel: onCancelEdit,
      handle: event.currentTarget,
    };
    drag.current = active;
    active.dismiss = registerDialogChildDismissal(root.current, cancel);
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    event.stopPropagation();
    active.preview('subtitle', {
      kind: 'gesture',
      cueId: active.cueId,
      mode: active.mode,
      delta: (event.clientX - active.x) / active.scale,
    });
  };
  const finish = (event) => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    move(event);
    drag.current = null;
    active.dismiss?.();
    active.end();
    release(active);
  };
  const key = (event, cue, mode) => {
    if ((event.key === 'Enter' || event.key === ' ') && !blocked) {
      event.preventDefault();
      event.stopPropagation();
      onSelectSubtitle(cue.id);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || blocked || cue.readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectSubtitle(cue.id);
    if (onBeginEdit?.() !== true) return;
    onEditPreview('subtitle', {
      kind: 'gesture',
      cueId: cue.id,
      mode,
      delta: event.key === 'ArrowRight' ? 0.1 : -0.1,
    });
    onEndEdit();
  };
  const position = trackOrder.indexOf(trackIndex);
  const canMoveUp = position > 0;
  const canMoveDown = position >= 0 && position < trackOrder.length - 1;
  const startTrackDrag = (event) => {
    if (blocked || trackReadOnly || !onTrackDrop || !event.dataTransfer) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(trackIndex));
  };
  const dropTrack = (event) => {
    if (blocked || trackReadOnly || !onTrackDrop || !event.dataTransfer) return;
    event.preventDefault();
    event.stopPropagation();
    const source = Number(event.dataTransfer.getData('text/plain'));
    if (Number.isInteger(source)) onTrackDrop(source, trackIndex);
  };
  return (
    <div
      ref={root}
      className="cv-clip-timeline-track-row cv-clip-subtitle-timeline-row"
      onDragOver={(event) => {
        if (onTrackDrop && !blocked && !trackReadOnly) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={dropTrack}
    >
      <div className="cv-clip-timeline-track-controls">
        <Type size={16} aria-hidden="true" />
        {onTrackDrop && (
          <button
            type="button"
            className="cv-clip-timeline-action cv-clip-timeline-track-drag"
            aria-label={`拖动${label}`}
            draggable={!blocked && !trackReadOnly}
            disabled={blocked || trackReadOnly}
            onDragStart={startTrackDrag}
          >
            <GripVertical size={14} />
          </button>
        )}
        <button
          type="button"
          className="cv-clip-timeline-action"
          aria-label={`${timeline.subtitles.visible === false ? '显示' : '隐藏'}${label}`}
          aria-pressed={timeline.subtitles.visible !== false}
          disabled={blocked || trackReadOnly}
          onClick={() => onEditSubtitle({ kind: 'visible' })}
        >
          {timeline.subtitles.visible === false ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {onMoveTrack && (
          <>
            <button
              type="button"
              className="cv-clip-timeline-action"
              aria-label={`${label}上移`}
              disabled={blocked || trackReadOnly || !canMoveUp}
              onClick={() => onMoveTrack(trackIndex, 'up')}
            >
              <ChevronUp size={14} />
            </button>
            <button
              type="button"
              className="cv-clip-timeline-action"
              aria-label={`${label}下移`}
              disabled={blocked || trackReadOnly || !canMoveDown}
              onClick={() => onMoveTrack(trackIndex, 'down')}
            >
              <ChevronDown size={14} />
            </button>
          </>
        )}
      </div>
      <div className="cv-clip-timeline-track" aria-label={`${label}轨道`}>
        {timeline.subtitles.cues.map((cue) => (
          <div
            key={cue.id}
            role="button"
            tabIndex={blocked ? -1 : 0}
            data-subtitle-id={kind === 'subtitle' ? cue.id : undefined}
            data-text-cue-id={kind === 'text' ? cue.id : undefined}
            aria-label={`${label} ${cue.id} ${cue.text}`}
            aria-pressed={cue.id === selectedSubtitleId}
            className={`cv-clip-subtitle-cue${cue.id === selectedSubtitleId ? ' is-selected' : ''}`}
            style={{
              left: 6 + cue.startTime * timeline.scale - timeline.scrollX,
              width: Math.max(4, (cue.endTime - cue.startTime) * timeline.scale),
              opacity: timeline.subtitles.visible === false || cue.hidden ? 0.4 : 1,
            }}
            onClick={() => !blocked && onSelectSubtitle(cue.id)}
            onPointerDown={(event) => start(event, cue, 'move')}
            onPointerMove={move}
            onPointerUp={finish}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
            onKeyDown={(event) => key(event, cue, 'move')}
          >
            <span>{cue.text || emptyLabel}</span>
            {cue.id === selectedSubtitleId &&
              ['resize-start', 'resize-end'].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`cv-clip-subtitle-handle ${mode}`}
                  aria-label={`调整${label}${mode === 'resize-start' ? '开始时间' : '结束时间'} ${cue.id}`}
                  disabled={blocked || cue.readOnly}
                  onPointerDown={(event) => start(event, cue, mode)}
                  onPointerMove={move}
                  onPointerUp={finish}
                  onPointerCancel={cancel}
                  onLostPointerCapture={cancel}
                  onKeyDown={(event) => key(event, cue, mode)}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
