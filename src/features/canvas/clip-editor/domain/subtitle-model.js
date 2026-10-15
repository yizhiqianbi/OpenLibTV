export const SUBTITLE_FONTS = Object.freeze([
  'Source Han Sans CN',
  'Noto Sans SC',
  'Noto Serif SC',
  'Roboto',
  'Inter',
]);
export const SUBTITLE_PRESETS = Object.freeze([
  { id: 'none', name: '默认', color: '#FFFFFF' },
  { id: 'outline', name: '白字黑边', color: '#FFFFFF', strokeColor: '#000000' },
  { id: 'soft', name: '黑字白边', color: '#000000', strokeColor: '#FFFFFF' },
  { id: 'strong', name: '黄字黑边', color: '#FFDC00', strokeColor: '#000000' },
  { id: 'glow', name: '白字粉边', color: '#FFFFFF', strokeColor: '#FF827B' },
  { id: 'warm', name: '粉字黑边', color: '#FF827B', strokeColor: '#000000' },
]);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const subtitlePlainText = (text = '') =>
  String(text)
    .replace(/<\/?c(?:\.[^>\s]+)?>/g, '')
    .replace(/<\/?(?:b|i|u|ruby|rt)>/g, '')
    .replace(/<v(?:\.[^>\s]+)?(?:\s+[^>]*)?>/g, '')
    .replace(/<\/v>/g, '')
    .trimEnd();

/** Source472616's global VTT style rules. HTML/text have different limits. */
export function normalizeSubtitleStyle(input = {}) {
  const style = {};
  const numeric = {
    fontSizePx: [12, 72, 1],
    fontSizeVh: [0.5, 30, 0.01],
    fontWeight: [100, 900, 100],
    lineHeight: [0.5, 3, 0.01],
    letterSpacingPx: [0, 100, 0.01],
    strokeWidthPx: [0, 20, 0.01],
    strokeOpacity: [0, 100, 1],
  };
  for (const [key, [min, max, step]] of Object.entries(numeric)) {
    if (input[key] == null) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value)) continue;
    const result = clamp(Math.round(clamp(value, min, max) / step) * step, min, max);
    if ((key === 'letterSpacingPx' || key === 'strokeWidthPx') && result === 0) continue;
    style[key] = Math.round(result * 100) / 100;
  }
  if (style.fontSizePx != null) delete style.fontSizeVh;
  if (typeof input.fontFamily === 'string') {
    const family = input.fontFamily
      .replace(/^['"]|['"]$/g, '')
      .replace(/[;{}"'\\]/g, '')
      .trim()
      .slice(0, 64);
    if (family)
      style.fontFamily =
        SUBTITLE_FONTS.find((name) => name.toLowerCase() === family.toLowerCase()) || family;
  }
  for (const key of ['color', 'textShadow', 'strokeColor', 'presetId'])
    if (typeof input[key] === 'string' && input[key].trim()) style[key] = input[key].trim();
  return style;
}

export function normalizeSubtitleTrack(input) {
  if (input == null) return { visible: true, cues: [] };
  if (typeof input !== 'object' || (input.cues != null && !Array.isArray(input.cues)))
    throw new Error('字幕数据无法读取，原数据已保留');
  const cues = (input.cues || [])
    .flatMap((cue, index) => {
      const start = Number(cue?.startTime),
        end = Number(cue?.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
      const startTime = Math.max(0, start),
        endTime = Math.max(startTime + 0.1, end);
      const id =
        typeof cue.id === 'string' && cue.id.trim()
          ? cue.id.trim().replace(/\s+/g, '-').slice(0, 80)
          : `subtitle-${index + 1}-${Math.round(startTime * 1000)}-${Math.round(endTime * 1000)}`;
      return [
        {
          ...cue,
          id,
          startTime,
          endTime,
          text: subtitlePlainText(cue.text ?? ''),
          ...(cue.style ? { style: normalizeSubtitleStyle(cue.style) } : {}),
        },
      ];
    })
    .sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  if (new Set(cues.map((cue) => cue.id)).size !== cues.length)
    throw new Error('字幕编号重复，原数据已保留');
  return {
    ...input,
    visible: input.visible !== false,
    cues,
    ...(input.defaultStyle ? { defaultStyle: normalizeSubtitleStyle(input.defaultStyle) } : {}),
  };
}

export function subtitleStyle(track) {
  const style = {
    fontFamily: 'Source Han Sans CN',
    fontSizePx: 28,
    fontWeight: 600,
    color: '#FFFFFF',
    textShadow: 'none',
    ...normalizeSubtitleStyle(track?.defaultStyle),
  };
  if (style.fontSizeVh != null && track?.defaultStyle?.fontSizePx == null) delete style.fontSizePx;
  return style;
}

/** Source sh/sc/sd; used by both future HTML text and subtitle entry controllers. */
export function planTimedTextEntry({ kind, currentTime, rows, activeRowId, targetRowId }) {
  if (!Number.isFinite(currentTime) || currentTime < 0) return { type: 'unavailable' };
  const ids = new Set();
  for (const row of rows) {
    if (
      !row.rowId.trim() ||
      ids.has(row.rowId) ||
      row.cues.some(
        (cue) =>
          !cue.cueId.trim() ||
          !Number.isFinite(cue.startTime) ||
          !Number.isFinite(cue.endTime) ||
          cue.startTime < 0 ||
          cue.endTime <= cue.startTime,
      )
    )
      return { type: 'unavailable' };
    ids.add(row.rowId);
  }
  const matching = rows.filter((row) => row.kind === kind);
  if (!matching.length) return { type: 'create-track-and-cue', trackIndex: 0 };
  if (targetRowId)
    return matching.some((row) => row.rowId === targetRowId)
      ? { type: 'insert-cue', rowId: targetRowId }
      : { type: 'unavailable' };
  const active = matching.find((row) => row.rowId === activeRowId);
  const cueAt = (row) =>
    row.cues.find((cue) => currentTime >= cue.startTime && currentTime < cue.endTime);
  const row = active || (matching.length === 1 ? matching[0] : null);
  if (row) {
    const cue = cueAt(row);
    return cue
      ? { type: 'select-cue', rowId: row.rowId, cueId: cue.cueId }
      : { type: 'insert-cue', rowId: row.rowId };
  }
  const hits = matching.flatMap((entry) => {
    const cue = cueAt(entry);
    return cue ? [{ row: entry, cue }] : [];
  });
  return hits.length === 1
    ? { type: 'select-cue', rowId: hits[0].row.rowId, cueId: hits[0].cue.cueId }
    : {
        type: 'request-track-choice',
        rowIds: (hits.length ? hits.map((entry) => entry.row) : matching).map(
          (entry) => entry.rowId,
        ),
      };
}

export function editSubtitleTrack(
  timeline,
  { kind, cueId, text, style, afterId, mode, delta = 0 } = {},
) {
  const track = normalizeSubtitleTrack(timeline.subtitles);
  let next = track,
    selectedId = cueId;
  const cue = track.cues.find((entry) => entry.id === cueId);
  if (kind === 'add') {
    const after = track.cues.find((entry) => entry.id === afterId);
    const maximum = Math.max(timeline.totalDuration, timeline.currentTime + 2);
    const startTime = clamp(after ? after.endTime : timeline.currentTime, 0, maximum);
    let ordinal = track.cues.length + 1;
    while (track.cues.some((entry) => entry.id === `subtitle-${ordinal}`)) ordinal++;
    selectedId = `subtitle-${ordinal}`;
    next = {
      ...track,
      visible: true,
      userCleared: false,
      cues: [
        ...track.cues,
        {
          id: selectedId,
          startTime,
          endTime: Math.max(startTime + 0.2, Math.min(maximum, startTime + 2)),
          text: '默认文本',
        },
      ].sort((a, b) => a.startTime - b.startTime),
    };
  } else if (kind === 'visible') next = { ...track, visible: !track.visible };
  else if (kind === 'style' && cue) {
    const merged = { ...track.defaultStyle, ...style };
    delete merged.presetId;
    if (style.fontSizePx != null) delete merged.fontSizeVh;
    if (style.presetId != null) delete merged.textShadow;
    // VTT fallback is explicitly global-only in source472616.
    next = { ...track, defaultStyle: normalizeSubtitleStyle(merged) };
  } else if (kind === 'delete' && cue) {
    const cues = track.cues.filter((entry) => entry.id !== cueId);
    next = { ...track, cues, ...(!cues.length ? { userCleared: true } : {}) };
    selectedId = cues[0]?.id ?? null;
  } else if (kind === 'apply-all' && cue) {
    const defaults = { line: '88%', position: '50%', align: 'center', size: '86%' };
    const settings = Object.keys(defaults).map(
      (key) =>
        String(cue.settings || '')
          .split(/\s+/)
          .find((token) => token.startsWith(key + ':')) || `${key}:${defaults[key]}`,
    );
    const { classStyles: _classStyles, ...rest } = track;
    next = {
      ...rest,
      defaultStyle: normalizeSubtitleStyle(subtitleStyle(track)),
      cues: track.cues.map((entry) => {
        const { style: _style, ...rest } = entry;
        return {
          ...rest,
          settings: [
            ...settings,
            ...String(entry.settings || '')
              .split(/\s+/)
              .filter((token) => token && !/^(?:line|position|align|size):/.test(token)),
          ].join(' '),
        };
      }),
    };
  } else if (kind === 'text' && cue) {
    const plain = subtitlePlainText(text);
    const parts = cue.textParts?.some((part) => part.className)
      ? plain.split('\n').map((line, index) => ({
          text: line,
          ...(cue.textParts[index]?.className ? { className: cue.textParts[index].className } : {}),
        }))
      : undefined;
    next = {
      ...track,
      cues: track.cues.map((entry) =>
        entry.id === cueId
          ? { ...entry, text: plain, ...(entry.textParts ? { textParts: parts } : {}) }
          : entry,
      ),
    };
  } else if (kind === 'gesture' && cue && Number.isFinite(delta)) {
    const duration = Math.max(0.2, cue.endTime - cue.startTime);
    const maximum = Math.max(timeline.totalDuration, cue.endTime);
    const startTime =
      mode === 'move'
        ? clamp(cue.startTime + delta, 0, Math.max(0, maximum - duration))
        : mode === 'resize-start'
          ? clamp(cue.startTime + delta, 0, cue.endTime - 0.2)
          : cue.startTime;
    const endTime =
      mode === 'move'
        ? startTime + duration
        : mode === 'resize-end'
          ? clamp(cue.endTime + delta, cue.startTime + 0.2, Math.max(cue.startTime + 0.2, maximum))
          : cue.endTime;
    next = {
      ...track,
      cues: track.cues.map((entry) =>
        entry.id === cueId ? { ...entry, startTime, endTime } : entry,
      ),
    };
  }
  if (JSON.stringify(track) === JSON.stringify(next))
    return { timeline, selectedSubtitleId: selectedId };
  return { timeline: { ...timeline, subtitles: next }, selectedSubtitleId: selectedId };
}
