const LIMITS = Object.freeze({
  xPct: [0, 100],
  yPct: [0, 100],
  widthPct: [8, 100],
  scalePct: [10, 400],
});

const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, [min, max]) => Math.max(min, Math.min(max, value));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function normalizePreviewLayout(layout = {}) {
  return {
    xPct: round(clamp(finite(layout.xPct, 50), LIMITS.xPct)),
    yPct: round(clamp(finite(layout.yPct, 88), LIMITS.yPct)),
    widthPct: Math.round(clamp(finite(layout.widthPct, 86), LIMITS.widthPct)),
    scalePct: Math.round(clamp(finite(layout.scalePct, 100), LIMITS.scalePct)),
  };
}

/**
 * Maps a pointer gesture in the preview's CSS pixels to the source layout
 * fields. The source uses the cue center as the move anchor and expands width
 * around that center, so the same gesture remains stable at any preview scale.
 */
export function previewLayoutFromDrag({
  start,
  kind,
  deltaX = 0,
  deltaY = 0,
  stageWidth,
  stageHeight,
  cueWidth,
}) {
  const base = normalizePreviewLayout(start);
  const width = finite(stageWidth, 0);
  const height = finite(stageHeight, 0);
  if (width <= 0 || height <= 0) return base;
  if (kind === 'move')
    return normalizePreviewLayout({
      ...base,
      xPct: base.xPct + (deltaX / width) * 100,
      yPct: base.yPct + (deltaY / height) * 100,
    });
  if (kind === 'width')
    return normalizePreviewLayout({
      ...base,
      widthPct: base.widthPct + (2 * deltaX * 100) / (width * (base.scalePct / 100)),
    });
  if (kind === 'scale') {
    const measuredWidth = finite(cueWidth, (width * base.widthPct) / 100);
    return normalizePreviewLayout({
      ...base,
      scalePct: base.scalePct * (1 + deltaX / Math.max(1, measuredWidth)),
    });
  }
  return base;
}

export function previewLayoutLimits() {
  return LIMITS;
}
