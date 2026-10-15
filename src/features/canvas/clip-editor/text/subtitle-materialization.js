import { timedTextDigestSync } from '../../../../services/timed-text-digest.ts';
import { subtitleClipWindow, subtitleDocumentSource } from '../domain/html-subtitle-model.js';
import { readSubtitleHtml, serializeTextHtml, TEXT_HTML_ATTRIBUTES as A } from './html-document.js';
import { cueUnit } from './html-patches.js';
import { patchHtmlSubtitle } from './subtitle-archive.js';

/** Source r1.prepare: freeze opening ownership, union live windows, preserve full library cues. */
export function materializeHtmlSubtitles(layer, openingClips, liveClips) {
  const model = readSubtitleHtml(layer.html);
  if (!model.ok) throw new Error(model.issues[0].detail);
  const { url } = subtitleDocumentSource(layer.key);
  let clips = openingClips
    .filter((clip) => clip.type !== 'audio' && clip.sourceNodeId === layer.nodeId && clip.id)
    .sort((a, b) => a.startTime - b.startTime);
  if (url?.startsWith('clip:')) {
    // The creation key stays stable after split/copy. Explicit bindings are
    // authoritative owners too; restricting to that first ID drops saved copies.
    const bound = new Set([
      url.slice(5),
      ...Object.keys(model.clipMeta),
      ...model.cues.flatMap((cue) => (cue.clipId && cue.clipId !== '~' ? [cue.clipId] : [])),
    ]);
    clips = clips.filter((clip) => bound.has(clip.id));
  } else if (url && clips.some((clip) => clip.subtitleHtmlUrl?.trim() === url))
    clips = clips.filter((clip) => clip.subtitleHtmlUrl?.trim() === url);
  if (!clips.length) return layer.html;
  const unbound = model.cues.filter((cue) => !cue.clipId);
  let html = layer.html;
  if (unbound.length) {
    const used = new Set(model.cues.map((cue) => cue.cueId));
    const windows = clips.map((clip) => {
      const opening = subtitleClipWindow(clip),
        liveClip = liveClips.find(
          (item) => item.id === clip.id && item.sourceNodeId === clip.sourceNodeId,
        );
      const live = liveClip ? subtitleClipWindow(liveClip) : opening;
      return {
        clipId: clip.id,
        start: Math.min(opening.start, live.start),
        end: Math.max(opening.end, live.end),
        windows: [opening, live],
      };
    });
    for (const cue of unbound) {
      const unit = cueUnit(cue.element),
        parent = unit.parentElement;
      const matches = windows.filter((window) =>
        window.windows.some(
          (span) =>
            Math.min(cue.start + cue.duration, span.end) - Math.max(cue.start, span.start) >= 0.01,
        ),
      );
      if (!matches.length) {
        cue.element.setAttribute(A.clip, '~');
        continue;
      }
      matches.forEach((window, index) => {
        const copy = unit.cloneNode(true),
          target = unit === cue.element ? copy : copy.firstElementChild;
        let cueId = cue.cueId;
        if (index) {
          const base = `${cueId}~${timedTextDigestSync(window.clipId).slice(0, 6)}`;
          cueId = base;
          let ordinal = 2;
          while (used.has(cueId)) cueId = `${base}-${ordinal++}`;
        }
        used.add(cueId);
        target.setAttribute(A.cue, cueId);
        target.setAttribute(A.clip, window.clipId);
        target.setAttribute(A.libraryCue, cue.cueId);
        window.start = Math.min(window.start, cue.start);
        window.end = Math.max(window.end, cue.start + cue.duration);
        parent.insertBefore(copy, unit);
      });
      unit.remove();
    }
    const patched = patchHtmlSubtitle(
      serializeTextHtml(model.document),
      windows.map((window) => ({
        kind: 'setClipMeta',
        clipId: window.clipId,
        materialized: [window.start, window.end],
      })),
    );
    if (!patched.ok) throw new Error(patched.issues[0].detail);
    html = patched.html;
  }
  const current = readSubtitleHtml(html),
    ids = new Set(clips.map((clip) => clip.id));
  const patches = [
    ...current.cues
      .filter((cue) => cue.clipId && cue.clipId !== '~' && !ids.has(cue.clipId))
      .map((cue) => ({ kind: 'removeCue', cueId: cue.cueId })),
    ...Object.keys(current.clipMeta)
      .filter((id) => !ids.has(id))
      .map((clipId) => ({ kind: 'setClipMeta', clipId, remove: true })),
  ];
  if (!patches.length) return html;
  const gc = patchHtmlSubtitle(html, patches);
  if (!gc.ok) throw new Error(gc.issues[0].detail);
  if (!gc.model.cues.length && !Object.keys(gc.model.clipMeta).length) {
    const empty = patchHtmlSubtitle(
      gc.html,
      clips.map((clip) => {
        const span = subtitleClipWindow(clip);
        return { kind: 'setClipMeta', clipId: clip.id, materialized: [span.start, span.end] };
      }),
    );
    if (!empty.ok) throw new Error(empty.issues[0].detail);
    return empty.html;
  }
  return gc.html;
}
