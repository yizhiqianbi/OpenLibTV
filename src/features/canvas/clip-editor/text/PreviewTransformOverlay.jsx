import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { previewLayoutFromDrag, normalizePreviewLayout } from './preview-geometry-model.js';

function fallbackRect(root, layout) {
  const rect = root?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return null;
  const width = (rect.width * layout.widthPct * layout.scalePct) / 10_000;
  const height = Math.max(28, Math.min(rect.height * 0.3, width * 0.32));
  return {
    left: (rect.width * layout.xPct) / 100 - width / 2,
    top: (rect.height * layout.yPct) / 100 - height / 2,
    width,
    height,
  };
}

export default function PreviewTransformOverlay({
  rootRef,
  playback,
  selection,
  onBeginEdit,
  onEditPreview,
  onEndEdit,
  onCancelEdit,
}) {
  const [rect, setRect] = useState(null);
  const drag = useRef(null);
  const root = rootRef?.current;
  const layout = useMemo(() => normalizePreviewLayout(selection?.layout), [selection?.layout]);
  const refresh = useCallback(() => {
    if (!selection?.active || !selection.canEditLayout || !root) {
      setRect(null);
      return;
    }
    const rootRect = root.getBoundingClientRect?.();
    const stage = root.querySelector('.cv-clip-preview-stage');
    const stageRect = stage?.getBoundingClientRect?.();
    const measured = playback?.measurePreviewCueRect?.(selection);
    const local = measured || fallbackRect(stage || root, layout);
    if (!local || !rootRect || !stageRect) {
      setRect(null);
      return;
    }
    const next = {
      left: stageRect.left - rootRect.left + local.left,
      top: stageRect.top - rootRect.top + local.top,
      width: local.width,
      height: local.height,
    };
    setRect((previous) =>
      previous &&
      previous.left === next.left &&
      previous.top === next.top &&
      previous.width === next.width &&
      previous.height === next.height
        ? previous
        : next,
    );
  }, [layout, playback, root, selection]);
  useLayoutEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [refresh]);
  if (!selection?.active || !selection.canEditLayout || !rect) return null;

  const begin = (event, kind) => {
    if (event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const token = { type: 'preview-geometry', owner: selection.owner, cueId: selection.cueId };
    if (onBeginEdit?.({ ownerToken: token }) === false) return;
    const stage = root.querySelector('.cv-clip-preview-stage');
    const stageRect = stage?.getBoundingClientRect?.();
    if (!stageRect?.width || !stageRect?.height) {
      onCancelEdit?.(token);
      return;
    }
    drag.current = {
      token,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      stageWidth: stageRect.width,
      stageHeight: stageRect.height,
      cueWidth: rect.width,
      startLayout: layout,
      moved: false,
      handle: event.currentTarget,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    const active = drag.current;
    if (
      !active ||
      (active.handle !== event.currentTarget &&
        active.handle?.hasPointerCapture?.(event.pointerId) === false)
    )
      return;
    const deltaX = event.clientX - active.startX;
    const deltaY = event.clientY - active.startY;
    if (!active.moved && Math.hypot(deltaX, deltaY) < 3) return;
    active.moved = true;
    const next = previewLayoutFromDrag({
      start: active.startLayout,
      kind: active.kind,
      deltaX,
      deltaY,
      stageWidth: active.stageWidth,
      stageHeight: active.stageHeight,
      cueWidth: active.cueWidth,
    });
    const fields =
      active.kind === 'move'
        ? { xPct: next.xPct, yPct: next.yPct }
        : active.kind === 'width'
          ? { widthPct: next.widthPct }
          : { scalePct: next.scalePct };
    onEditPreview?.(selection.operation, { fields });
  };
  const finish = (event, cancelled = false) => {
    const active = drag.current;
    if (!active) return;
    if (event?.pointerId != null && active.handle?.releasePointerCapture)
      active.handle.releasePointerCapture(event.pointerId);
    drag.current = null;
    if (cancelled) onCancelEdit?.(active.token);
    else onEndEdit?.(active.token);
    refresh();
  };
  return (
    <div className="cv-clip-preview-transform" aria-label={`${selection.label || '文字'}画面操作`}>
      <button
        type="button"
        className="cv-clip-preview-transform-move"
        aria-label={`拖动${selection.label || '文字'}`}
        style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        onPointerDown={(event) => begin(event, 'move')}
        onPointerMove={move}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(event, true);
          }
        }}
      />
      <button
        type="button"
        className="cv-clip-preview-transform-width"
        aria-label={`调整${selection.label || '文字'}宽度`}
        style={{ left: rect.left + rect.width - 6, top: rect.top + rect.height / 2 - 12 }}
        onPointerDown={(event) => begin(event, 'width')}
        onPointerMove={move}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
      />
      <button
        type="button"
        className="cv-clip-preview-transform-scale"
        aria-label={`缩放${selection.label || '文字'}`}
        style={{ left: rect.left + rect.width - 7, top: rect.top + rect.height - 7 }}
        onPointerDown={(event) => begin(event, 'scale')}
        onPointerMove={move}
        onPointerUp={(event) => finish(event)}
        onPointerCancel={(event) => finish(event, true)}
      />
    </div>
  );
}
