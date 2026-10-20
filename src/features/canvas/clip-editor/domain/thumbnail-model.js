const DEFAULT_FRAME_COUNT = 6;

function finite(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeThumbnailFrames(value, { maxFrames = DEFAULT_FRAME_COUNT } = {}) {
  const raw = Array.isArray(value) ? value : value?.frames;
  if (!Array.isArray(raw)) return [];
  const limit = Math.max(1, Math.floor(Number(maxFrames) || DEFAULT_FRAME_COUNT));
  return raw.filter((frame) => typeof frame === 'string' && frame.trim()).slice(0, limit);
}

/** Source-time positions used by the visible clip filmstrip. */
export function thumbnailTimes(clip, count = DEFAULT_FRAME_COUNT) {
  const frameCount = Math.max(1, Math.floor(Number(count) || DEFAULT_FRAME_COUNT));
  const sourceDuration = Math.max(0, finite(clip?.sourceDuration) ?? finite(clip?.duration) ?? 0);
  const speed = Math.max(0.001, Math.abs(finite(clip?.speed) ?? 1));
  const clipDuration = Math.max(0, finite(clip?.duration) ?? 0);
  const sourceOffset = clamp(finite(clip?.sourceOffset) ?? 0, 0, sourceDuration);
  const visibleSourceDuration = Math.min(sourceDuration - sourceOffset, clipDuration * speed);
  if (frameCount === 1) return [sourceOffset];
  return Array.from({ length: frameCount }, (_, index) =>
    clamp(
      sourceOffset + (visibleSourceDuration * index) / (frameCount - 1),
      0,
      Math.max(sourceOffset, sourceDuration),
    ),
  );
}

export const thumbnailDefaults = Object.freeze({ frameCount: DEFAULT_FRAME_COUNT });
