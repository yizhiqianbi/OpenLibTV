import { createTimedTextCueIdSync } from '../../../../services/timed-text-id.js';
import { normalizeSubtitleTrack, subtitleStyle } from '../domain/subtitle-model.js';
import { planSubtitleMigration } from '../domain/subtitle-migration-model.js';
import { subtitleLayout } from '../domain/subtitle-layout-model.js';
import { textColor, textColorWithOpacity } from '../domain/text-color-model.js';
import { createSubtitleHtml, readSubtitleHtml } from './html-document.js';
import { patchHtmlSubtitle, archiveHtmlSubtitle } from './subtitle-archive.js';
import { materializeHtmlSubtitles } from './subtitle-materialization.js';

const systemFonts = new Set([
  'pingfang sc',
  'source han sans',
  '思源黑体',
  'helvetica neue',
  'arial',
  'apple sd gothic neo',
  'sans-serif',
  'serif',
  'monospace',
  'system-ui',
  '-apple-system',
  'blinkmacsystemfont',
  'helvetica',
  'segoe ui',
  'times new roman',
  'pingfang tc',
  'pingfang hk',
  'hiragino sans gb',
  'heiti sc',
  'stheiti',
  'microsoft yahei',
  '微软雅黑',
  'simhei',
  '黑体',
  'simsun',
  '宋体',
  'malgun gothic',
  'apple sd gothic',
]);
const round = (value) => Math.round(value * 100) / 100;
const clipRate = (clip) =>
  Number(clip.speed ?? clip.playbackRate) > 0 ? Number(clip.speed ?? clip.playbackRate) : 1;
const firstFont = (value) =>
  String(value || '')
    .split(',')
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
    .find(Boolean) || '';
function styleVars(style, scale, outputHeight, { roundFont = false, fields } = {}) {
  const font = firstFont(style.fontFamily);
  const family = font || 'Source Han Sans CN';
  const size = style.fontSizePx ?? (outputHeight * (style.fontSizeVh ?? 0)) / 100;
  const vars = {
    '--libtvSubtitleFontFamily': `"${family}", "Noto Sans SC", sans-serif`,
    '--libtvSubtitleFontSize': `${roundFont ? Math.max(1, Math.round(size / scale)) : round(size / scale)}px`,
    '--libtvSubtitleFontWeight': String(style.fontWeight),
    '--libtvSubtitleLineHeight': String(style.lineHeight ?? 1.4),
    '--libtvSubtitleColor': style.color,
    '--libtvSubtitleLetterSpacing': `${round((style.letterSpacingPx || 0) / scale)}px`,
    '--libtvSubtitleTextShadow': String(style.textShadow || 'none').replace(
      /(-?\d+(?:\.\d+)?)px/g,
      (_, n) => `${round(Number(n) / scale)}px`,
    ),
    '--libtvSubtitleStrokeWidth': `${round((style.strokeWidthPx || 0) / scale)}px`,
    '--libtvSubtitleStrokeColor':
      style.strokeOpacity == null
        ? style.strokeColor || '#FFFFFF'
        : textColorWithOpacity(
            textColor(style.strokeColor || '#FFFFFF').color,
            style.strokeOpacity,
          ),
  };
  if (!fields) return vars;
  const properties = {
    fontFamily: ['FontFamily'],
    fontSizePx: ['FontSize'],
    fontSizeVh: ['FontSize'],
    fontWeight: ['FontWeight'],
    lineHeight: ['LineHeight'],
    color: ['Color'],
    letterSpacingPx: ['LetterSpacing'],
    textShadow: ['TextShadow'],
    strokeWidthPx: ['StrokeWidth', 'StrokeColor'],
    strokeColor: ['StrokeWidth', 'StrokeColor'],
    strokeOpacity: ['StrokeWidth', 'StrokeColor'],
  };
  const allowed = new Set(
    fields.flatMap((field) => properties[field] || []).map((name) => `--libtvSubtitle${name}`),
  );
  return Object.fromEntries(Object.entries(vars).filter(([key]) => allowed.has(key)));
}

/** Source pi/aV: all nodes convert or all remain VTT; no trimming/dropping to force success. */
export function migrateSubtitleDocuments({
  currentTrack,
  sources,
  clips,
  origins,
  outputSize,
  reservedTrackIndexes = [],
}) {
  const plan = planSubtitleMigration({ currentTrack, sources, clips, origins });
  if (!plan.ok) return plan;
  const layers = [],
    timelineCueIdMap = new Map();
  try {
    for (const node of plan.nodes) {
      const owned = clips.filter(
        (clip) => clip.type !== 'audio' && clip.sourceNodeId?.trim() === node.nodeId,
      );
      const visual = owned.find((clip) => clip.width > 0 && clip.height > 0) || owned[0];
      if (!visual) return { ok: false, reason: 'missing-source-track' };
      const width = Math.max(1, Math.round(visual.width || outputSize.width)),
        height = Math.max(1, Math.round(visual.height || outputSize.height));
      const duration = Math.max(
        0.1,
        ...owned.map((clip) =>
          Math.max(
            Number(clip.sourceDuration) || 0,
            clip.sourceOffset + clip.duration * clipRate(clip),
          ),
        ),
      );
      const scale = Math.min(outputSize.width / width, outputSize.height / height);
      if (!(scale > 0)) return { ok: false, reason: 'invalid-output-size' };
      const track = normalizeSubtitleTrack(node.track),
        ends = [],
        cues = [],
        mappings = new Map(),
        patches = [];
      const used = new Set(),
        reserved = new Set(reservedTrackIndexes);
      for (const cue of track.cues) {
        if (!cue.text.trim()) return { ok: false, reason: 'empty-cue' };
        const start = Math.round(cue.startTime * 1000) / 1000,
          end = Math.round(cue.endTime * 1000) / 1000;
        if (!(end > start)) return { ok: false, reason: 'conversion-loss' };
        let row = ends.findIndex((value) => value <= start);
        if (row < 0) row = ends.length;
        if (row >= 4) return { ok: false, reason: 'conversion-loss' };
        ends[row] = end;
        let index = -1,
          trackIndex = 0;
        for (; ; trackIndex++) if (!reserved.has(trackIndex) && ++index === row) break;
        const cueId = createTimedTextCueIdSync(
          cue.text,
          start,
          end - start,
          node.nodeId,
          [...used].map((cueId) => ({ cueId })),
        );
        used.add(cueId);
        mappings.set(cue.id, cueId);
        cues.push({
          cueId,
          start,
          duration: end - start,
          trackIndex,
          text: cue.text,
          ...(cue.textParts ? { textParts: structuredClone(cue.textParts) } : {}),
        });
        const defaults = subtitleStyle(track);
        if (systemFonts.has(firstFont(defaults.fontFamily).toLowerCase()))
          defaults.fontFamily = 'Source Han Sans CN';
        const resolved = { ...defaults, ...cue.style };
        if (cue.style?.fontSizeVh != null && cue.style.fontSizePx == null)
          delete resolved.fontSizePx;
        patches.push({
          kind: 'styleVar',
          scope: { type: 'cue', cueId },
          vars: styleVars(resolved, scale, outputSize.height, {
            roundFont: cue.style?.fontSizePx == null && cue.style?.fontSizeVh == null,
          }),
        });
        for (const className of new Set(
          (cue.textParts || []).map((part) => part.className?.trim()).filter(Boolean),
        )) {
          const style = className
            .split('.')
            .reduce((value, name) => ({ ...value, ...track.classStyles?.[name] }), {});
          const resolvedClass = { ...resolved, ...style };
          if (style.fontSizeVh != null && style.fontSizePx == null) delete resolvedClass.fontSizePx;
          if (Object.keys(style).length)
            patches.push({
              kind: 'styleVar',
              scope: { type: 'cueLang', cueId, lang: className },
              vars: styleVars(resolvedClass, scale, outputSize.height, {
                fields: Object.keys(style),
              }),
            });
        }
        const layout = subtitleLayout(cue.settings),
          x =
            layout.align === 'start' || layout.align === 'left'
              ? layout.position + layout.size / 2
              : layout.align === 'end' || layout.align === 'right'
                ? layout.position - layout.size / 2
                : layout.position;
        patches.push({
          kind: 'layout',
          cueId,
          xPct: Math.max(0, Math.min(100, x)),
          yPct: layout.line,
          widthPct: layout.size,
        });
        if (cue.hidden) patches.push({ kind: 'cueHidden', cueId, hidden: true });
      }
      if (track.visible === false)
        for (const trackIndex of new Set(cues.map((cue) => cue.trackIndex)))
          patches.push({ kind: 'trackVisible', trackIndex, visible: false });
      let html = createSubtitleHtml({
        compositionId: `sub-libtv-${node.nodeId}`,
        width,
        height,
        duration,
        sourceAssetKey: track.sourceUrl,
        cues,
      });
      const edited = patchHtmlSubtitle(html, patches);
      if (!edited.ok) return { ok: false, reason: 'conversion-loss' };
      html = materializeHtmlSubtitles(
        { key: node.nodeId, nodeId: node.nodeId, html: edited.html },
        owned,
        clips,
      );
      const model = readSubtitleHtml(html);
      if (!model.ok) return { ok: false, reason: 'conversion-loss' };
      if (!cues.length) {
        const empty = patchHtmlSubtitle(
          html,
          owned.map((clip) => ({
            kind: 'setClipMeta',
            clipId: clip.id,
            materialized: [clip.sourceOffset, clip.sourceOffset + clip.duration * clipRate(clip)],
          })),
        );
        if (!empty.ok) return { ok: false, reason: 'conversion-loss' };
        html = empty.html;
      }
      const archive = archiveHtmlSubtitle({
        html,
        nodeId: node.nodeId,
        key: node.nodeId,
        savedAt: Date.now(),
      });
      layers.push({ key: node.nodeId, nodeId: node.nodeId, html, archive });
      for (const [migrationId, ids] of node.timelineIds)
        for (const id of ids) {
          const base = mappings.get(migrationId);
          if (!base) return { ok: false, reason: 'conversion-loss' };
          const clipId =
            currentTrack.cues.find((cue) => cue.id === id)?.clipId ||
            origins?.find((origin) => origin.timelineCueId === id)?.clipId;
          const materialized = model.cues.find(
            (cue) =>
              (cue.libraryCueId === base || cue.cueId === base) &&
              (!clipId || cue.clipId === clipId),
          );
          timelineCueIdMap.set(id, {
            key: node.nodeId,
            cueId: materialized?.cueId || base,
            clipId: materialized?.clipId || clipId,
          });
        }
    }
    return { ok: true, layers, timelineCueIdMap };
  } catch {
    return { ok: false, reason: 'archive-not-restorable' };
  }
}
