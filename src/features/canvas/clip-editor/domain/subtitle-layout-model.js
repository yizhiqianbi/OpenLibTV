import { subtitleStyle } from './subtitle-model.js';

export function subtitleLayout(settings = '') {
  const read = (key, fallback) => {
    const match = String(settings).match(
      new RegExp(`(?:^|\\s)${key}:(-?\\d+(?:\\.\\d+)?)%(?:,[^\\s]+)?(?:\\s|$)`, 'i'),
    );
    return match ? Math.max(key === 'size' ? 1 : 0, Math.min(100, Number(match[1]))) : fallback;
  };
  const align =
    String(settings)
      .toLowerCase()
      .match(/(?:^|\s)align:(start|center|end|left|right)(?:\s|$)/)?.[1] || 'center';
  return { line: read('line', 88), position: read('position', 50), size: read('size', 86), align };
}
function clipRect(clip, output) {
  if (!clip || !(clip.width > 0) || !(clip.height > 0)) return null;
  const ratio = Math.min(output.width / clip.width, output.height / clip.height);
  const matrix = clip.transform;
  const scale =
    Array.isArray(matrix) && Number.isFinite(matrix[0]?.[0])
      ? Math.min(10, Math.max(0.05, matrix[0][0]))
      : 1;
  const x = Array.isArray(matrix) && Number.isFinite(matrix[0]?.[2]) ? matrix[0][2] : 0;
  const y = Array.isArray(matrix) && Number.isFinite(matrix[1]?.[2]) ? matrix[1][2] : 0;
  return {
    left: x + ((output.width - clip.width * ratio) / 2) * scale,
    top: y + ((output.height - clip.height * ratio) / 2) * scale,
    width: clip.width * ratio * scale,
    height: clip.height * ratio * scale,
  };
}
export const subtitleClipOutputRect = (clip, output) => clipRect(clip, output);
export function subtitleOutputRect(description, timeline, output) {
  const transition = description.transition;
  if (transition) {
    const from = clipRect(
      timeline.clips.find((clip) => clip.id === transition.leftClipId),
      output,
    );
    const to = clipRect(
      timeline.clips.find((clip) => clip.id === transition.rightClipId),
      output,
    );
    if (from && to)
      return Object.fromEntries(
        Object.keys(from).map((key) => [
          key,
          from[key] + (to[key] - from[key]) * transition.progress,
        ]),
      );
  }
  const top = description.activeVideos.at(-1)?.clip;
  return clipRect(top, output) || { left: 0, top: 0, ...output };
}
/** Source dv: VTT positions are transformed through the visible output rect. */
export function describeSubtitleOverlay(track, time, output, rect, screenScale = 1) {
  if (!track?.visible || !Array.isArray(track.cues) || !output) return [];
  const style = subtitleStyle(track);
  const percent = (value) => `${Math.round(Math.max(0, Math.min(100, value)) * 1000) / 1000}%`;
  return track.cues
    .filter((cue) => !cue.hidden && time >= cue.startTime && time < cue.endTime)
    .map((cue) => {
      const layout = subtitleLayout(cue.settings);
      const left = layout.align === 'start' || layout.align === 'left';
      const right = layout.align === 'end' || layout.align === 'right';
      const fontSize =
        style.fontSizeVh != null
          ? Math.max(1, Math.round((style.fontSizeVh / 100) * output.height))
          : style.fontSizePx;
      const stroke = (style.strokeWidthPx || 0) * screenScale;
      const color = style.strokeColor || '#FFFFFF';
      const hex = color.match(/^#([0-9a-f]{6})$/i);
      const strokeColor =
        hex && style.strokeOpacity != null && style.strokeOpacity < 100
          ? `rgba(${parseInt(hex[1].slice(0, 2), 16)}, ${parseInt(hex[1].slice(2, 4), 16)}, ${parseInt(hex[1].slice(4, 6), 16)}, ${style.strokeOpacity / 100})`
          : color;
      return {
        id: cue.id,
        text: cue.text,
        style: {
          left: percent(((rect.left + (rect.width * layout.position) / 100) / output.width) * 100),
          top: percent(((rect.top + (rect.height * layout.line) / 100) / output.height) * 100),
          width: percent(Math.max(1, (rect.width * layout.size) / output.width)),
          transform: `translate(${left ? '0' : right ? '-100%' : '-50%'}, -50%)`,
          textAlign: left ? 'left' : right ? 'right' : 'center',
          fontFamily: `"${style.fontFamily}", "Noto Sans SC", sans-serif`,
          fontSize: `${Math.max(1, fontSize * screenScale)}px`,
          fontWeight: String(style.fontWeight),
          lineHeight: style.lineHeight != null ? String(style.lineHeight) : '',
          letterSpacing:
            style.letterSpacingPx != null ? `${style.letterSpacingPx * screenScale}px` : '',
          color: style.color,
          textShadow: style.textShadow.replace(
            /(-?\d*\.?\d+)px/g,
            (_, number) => `${Math.round(Number(number) * screenScale * 100) / 100}px`,
          ),
          webkitTextStroke: stroke > 0 ? `${stroke}px ${strokeColor}` : '',
        },
      };
    });
}
