export const SCROLL_STAGE_FALLBACK_WIDTH =
  'min(clamp(412px, 100vw - 388px, 1212px), calc((100dvh - 232px) * 16 / 9))';

export function scrollStageBox(viewportWidth, viewportHeight, metaHeight = 0) {
  const width = Math.min(1212, Math.max(412, viewportWidth - 388));
  const height = viewportHeight - 112 - metaHeight;
  if (width <= 0 || height <= 0) return null;
  return width / height > 16 / 9
    ? { width: (height * 16) / 9, height }
    : { width, height: (width * 9) / 16 };
}
