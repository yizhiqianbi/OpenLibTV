import {
  normalizeSubtitleStyle,
  normalizeSubtitleTrack,
  subtitlePlainText,
  subtitleStyle,
  SUBTITLE_FONTS,
} from './subtitle-model.js';

export function parseSubtitleTime(value) {
  const parts = value.trim().replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const seconds = Number(parts.at(-1)),
    minutes = Number(parts.at(-2)),
    hours = parts.length === 3 ? Number(parts[0]) : 0;
  return [seconds, minutes, hours].every(Number.isFinite) &&
    minutes >= 0 &&
    minutes < 60 &&
    seconds >= 0 &&
    seconds < 60
    ? hours * 3600 + minutes * 60 + seconds
    : null;
}
export function formatSubtitleTime(value) {
  const ms = Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 1000);
  const seconds = Math.floor(ms / 1000),
    minutes = Math.floor(seconds / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
function cssStyle(css) {
  const result = {};
  const names = {
    'font-family': 'fontFamily',
    'font-weight': 'fontWeight',
    'line-height': 'lineHeight',
    color: 'color',
    'text-shadow': 'textShadow',
  };
  for (const declaration of css.split(';')) {
    const split = declaration.indexOf(':');
    if (split < 0) continue;
    const key = declaration.slice(0, split).trim().toLowerCase(),
      value = declaration.slice(split + 1).trim();
    if (key === 'font-size') {
      const match = value.match(/^(-?\d+(?:\.\d+)?)(px|vh)$/i);
      if (match)
        result[match[2].toLowerCase() === 'px' ? 'fontSizePx' : 'fontSizeVh'] = Number(match[1]);
    } else if (key === 'letter-spacing') result.letterSpacingPx = Number(value.replace(/px$/i, ''));
    else if (names[key])
      result[names[key]] =
        key === 'font-family'
          ? value.split(',')[0].trim()
          : key === 'font-weight'
            ? value === 'bold'
              ? 700
              : value === 'normal'
                ? 400
                : value
            : value;
    else if (key === '-webkit-text-stroke' || key === 'text-stroke') {
      const match = value.match(/(-?\d+(?:\.\d+)?)px/i);
      if (match) {
        result.strokeWidthPx = Number(match[1]);
        result.strokeColor = value.replace(match[0], '').trim();
      }
    }
  }
  return normalizeSubtitleStyle(result);
}

export function parseSubtitleVtt(raw, sourceUrl) {
  const blocks = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/);
  const classStyles = {},
    cues = [];
  let defaultStyle;
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim());
    if (lines[0]?.startsWith('WEBVTT')) lines.shift();
    const first = lines[0]?.trim();
    if (!first || first.startsWith('NOTE') || first === 'REGION') continue;
    if (first === 'STYLE' || first.startsWith('::cue')) {
      const css = lines.join('\n');
      const base = css.match(/::cue\s*\{([\s\S]*?)\}/);
      if (base) defaultStyle = cssStyle(base[1]);
      for (const match of css.matchAll(/::cue\(\.([a-zA-Z0-9_-]+)\)\s*\{([\s\S]*?)\}/g))
        classStyles[match[1]] = cssStyle(match[2]);
      continue;
    }
    const index = lines.findIndex((line) => line.includes('-->'));
    if (index < 0) continue;
    const match = lines[index].match(/^(\S+)\s+-->\s+(\S+)(.*)$/);
    if (!match) continue;
    const startTime = parseSubtitleTime(match[1]),
      endTime = parseSubtitleTime(match[2]);
    if (startTime == null || endTime == null || endTime <= startTime) continue;
    const text = lines
      .slice(index + 1)
      .join('\n')
      .trimEnd();
    const parts = [];
    let offset = 0;
    for (const item of text.matchAll(/<c((?:\.[a-zA-Z0-9_-]+)*)>([\s\S]*?)<\/c>/g)) {
      const leading = subtitlePlainText(text.slice(offset, item.index)).replace(/^\n+/, '');
      if (leading.trim()) parts.push({ text: leading });
      parts.push({ text: subtitlePlainText(item[2]), className: item[1].slice(1) });
      offset = item.index + item[0].length;
    }
    if (parts.length && subtitlePlainText(text.slice(offset)).trim())
      parts.push({ text: subtitlePlainText(text.slice(offset)).replace(/^\n+/, '') });
    cues.push({
      ...(index > 0 ? { id: lines.slice(0, index).join(' ').trim() } : {}),
      startTime,
      endTime,
      text: parts.length ? parts.map((part) => part.text).join('\n') : subtitlePlainText(text),
      ...(parts.length ? { textParts: parts } : {}),
      ...(match[3].trim() ? { settings: match[3].trim() } : {}),
    });
  }
  // Source generated per-cue classes are private style payloads, not reusable classes.
  for (const cue of cues) {
    const classes = cue.textParts?.flatMap((part) => part.className?.split('.') || []) || [];
    const generated = classes.find((name) => name.startsWith('subtitle-cue-'));
    if (generated && classStyles[generated]) cue.style = classStyles[generated];
    if (cue.textParts) {
      cue.textParts = cue.textParts.map((part) => ({
        ...part,
        className:
          part.className
            ?.split('.')
            .filter((name) => !name.startsWith('subtitle-cue-'))
            .join('.') || undefined,
      }));
      if (!cue.textParts.some((part) => part.className)) delete cue.textParts;
    }
  }
  for (const key of Object.keys(classStyles))
    if (key.startsWith('subtitle-cue-')) delete classStyles[key];
  return normalizeSubtitleTrack({
    visible: true,
    sourceUrl,
    rawVtt: raw,
    cues,
    ...(defaultStyle ? { defaultStyle } : {}),
    ...(Object.keys(classStyles).length ? { classStyles } : {}),
  });
}

function styleCss(style, explicitShadowNone = false) {
  const names = {
    fontFamily: 'font-family',
    fontSizePx: 'font-size',
    fontSizeVh: 'font-size',
    fontWeight: 'font-weight',
    lineHeight: 'line-height',
    letterSpacingPx: 'letter-spacing',
    color: 'color',
    textShadow: 'text-shadow',
  };
  const rows = Object.entries(normalizeSubtitleStyle(style)).flatMap(([key, value]) =>
    names[key] && !(key === 'textShadow' && value === 'none' && !explicitShadowNone)
      ? [
          `${names[key]}: ${key === 'fontFamily' ? [value, ...SUBTITLE_FONTS.filter((name) => name !== value)].map((name) => `"${name}"`).join(', ') + ', sans-serif' : String(value).replace(/[{};\n]/g, '')}${key.endsWith('Px') ? 'px' : key.endsWith('Vh') ? 'vh' : ''};`,
        ]
      : [],
  );
  if (style.strokeWidthPx > 0)
    rows.push(
      `-webkit-text-stroke: ${style.strokeWidthPx}px ${String(style.strokeColor || '#FFFFFF').replace(/[{};\n]/g, '')};`,
    );
  rows.push('background: transparent;');
  return rows.join('\n');
}
export function serializeSubtitleVtt(value) {
  const track = normalizeSubtitleTrack(value);
  const styles = [];
  // Source's global-only mode retains class markup but emits only the global rule.
  if (
    track.defaultStyle ||
    Object.keys(track.classStyles || {}).length ||
    track.cues.some((cue) => cue.style && Object.keys(cue.style).length)
  )
    styles.push(
      `::cue {\n${styleCss(subtitleStyle(track), track.defaultStyle?.textShadow === 'none')}\n}`,
    );
  const cues = track.cues
    .filter((cue) => !cue.hidden)
    .map((cue) => {
      const text = cue.textParts?.some((part) => part.className)
        ? cue.textParts
            .map((part) =>
              part.className && /^[a-zA-Z0-9_.-]+$/.test(part.className)
                ? `<c.${part.className}>${subtitlePlainText(part.text)}</c>`
                : subtitlePlainText(part.text),
            )
            .join('\n')
        : subtitlePlainText(cue.text);
      return `${formatSubtitleTime(cue.startTime)} --> ${formatSubtitleTime(cue.endTime)}${cue.settings ? ` ${cue.settings}` : ''}\n${text}`;
    });
  return `WEBVTT\n\n${styles.length ? `STYLE\n${styles.join('\n')}\n\n` : ''}${cues.join('\n\n')}\n`;
}

export function mergeSubtitleSources(sources, clips) {
  const cues = [];
  for (const { clipId, track } of sources) {
    const clip = clips.find((entry) => entry.id === clipId);
    if (!clip || track.visible === false) continue;
    const speed = Number(clip.speed) > 0 ? Number(clip.speed) : 1;
    for (const cue of track.cues) {
      if (cue.hidden) continue;
      const start = Math.max(clip.sourceOffset, cue.startTime),
        end = Math.min(clip.sourceOffset + clip.duration * speed, cue.endTime);
      if (end - start < 0.01 || (end - start) / speed < 0.1) continue;
      cues.push({
        ...cue,
        id: `${clip.sourceNodeId}-${clip.id}-${cue.id}-${cues.length + 1}`
          .replace(/[^a-zA-Z0-9_-]+/g, '-')
          .slice(0, 80),
        startTime: clip.startTime + (start - clip.sourceOffset) / speed,
        endTime: clip.startTime + (end - clip.sourceOffset) / speed,
      });
    }
  }
  return normalizeSubtitleTrack({
    visible: sources.some(({ track }) => track.visible),
    cues,
    defaultStyle: sources.find(({ track }) => track.defaultStyle)?.track.defaultStyle,
    classStyles: sources.find(({ track }) => track.classStyles)?.track.classStyles,
  });
}
