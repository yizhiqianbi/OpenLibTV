const roundMs = (value) => Math.round(value * 1000) / 1000;
export const textFrameTime = (value) =>
  !Number.isFinite(value) || value <= 0 ? 0 : Math.floor(value * 30) / 30;
const end = (cue) => cue.start + cue.duration;

/** Source iv: same clip / same row, nearest or forward free interval. */
export function placeTextCue(existing, proposed, direction = 'nearest') {
  const duration = Math.max(0.001, proposed.duration),
    start = Math.max(0, proposed.start);
  const clipId =
    proposed.clipId ?? existing.find((cue) => cue.cueId === proposed.cueId)?.clipId ?? null;
  const neighbours = existing
    .filter(
      (cue) =>
        cue.cueId !== proposed.cueId &&
        (cue.clipId ?? null) === clipId &&
        cue.trackIndex === proposed.trackIndex,
    )
    .sort((a, b) => a.start - b.start);
  if (!neighbours.length)
    return { start, duration, trackIndex: proposed.trackIndex, snapped: false };
  const gaps = [];
  let cursor = 0;
  for (const cue of neighbours) {
    if (cue.start - cursor - duration >= -0.001)
      gaps.push({ from: cursor, to: cue.start - duration });
    cursor = Math.max(cursor, end(cue));
  }
  gaps.push({ from: cursor, to: Infinity });
  let best;
  for (const gap of gaps) {
    const candidate = Math.min(Math.max(start, gap.from), gap.to);
    if (direction === 'forward' && candidate < start - 0.001) continue;
    const distance = Math.abs(candidate - start);
    if (!best || distance < best.distance) best = { start: candidate, distance };
  }
  const placed = best ? Math.max(0, roundMs(best.start)) : start;
  return {
    start: placed,
    duration,
    trackIndex: proposed.trackIndex,
    snapped: Math.abs(placed - start) > 0.001,
  };
}

/** Source iZ. ID generation stays at the async service boundary. */
export function planNewOverlayCue({
  currentTime,
  totalDuration,
  existing,
  trackIndex = 0,
  duration = 3,
  text = '输入文本',
}) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(totalDuration) || totalDuration <= 0)
    return null;
  const placed = placeTextCue(
    existing,
    {
      cueId: '',
      start: textFrameTime(currentTime),
      duration: Math.min(Math.max(0.1, duration), totalDuration),
      trackIndex: Math.max(0, Math.round(trackIndex)),
    },
    'forward',
  );
  if (placed.start >= totalDuration) return null;
  const remaining = Math.min(placed.duration, totalDuration - placed.start);
  return remaining < 0.1
    ? null
    : { start: placed.start, duration: remaining, trackIndex: placed.trackIndex, text };
}

export const TEXT_NUMERIC_RULES = Object.freeze({
  xPct: [0, 100],
  yPct: [0, 100],
  widthPct: [8, 100],
  scalePct: [10, 400],
  fontSizePx: [8, 400],
  fontWeight: [100, 900],
  letterSpacingPx: [-20, 100],
  lineHeight: [0.5, 5],
  lineHeightPct: [50, 500],
  strokeWidthPx: [0, 20],
  backgroundOpacityPct: [0, 100],
  cornerRadiusPx: [0, 200],
  backgroundBlurPx: [0, 100],
});
export function textNumericValue(key, value) {
  const range = TEXT_NUMERIC_RULES[key];
  return range && Number.isFinite(value) ? Math.max(range[0], Math.min(range[1], value)) : null;
}

/** Source av/ax/ak: property pixels use the average composition/output ratio. */
export function textOutputScale(composition, output) {
  if (!(
    composition?.width > 0 &&
    composition?.height > 0 &&
    output?.width > 0 &&
    output?.height > 0
  ))
    return 1;
  const value = (output.width / composition.width + output.height / composition.height) / 2;
  return Number.isFinite(value) && value > 0 ? value : 1;
}
export const textPixelValue = (value, scale = 1) =>
  Number.isFinite(value) ? Math.round(value * scale * 100) / 100 : 0;
