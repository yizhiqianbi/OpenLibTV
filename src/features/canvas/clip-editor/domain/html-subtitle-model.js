import { placeTextCue, textFrameTime } from './text-timing-model.js';

/** Source ie/it/ir: one source can own several independent HTML documents. */
export const subtitleDocumentId = (nodeId, url) =>
  `subtitle:${JSON.stringify([nodeId, url.trim()])}`;
export function subtitleDocumentSource(documentId) {
  if (!documentId.startsWith('subtitle:')) return { nodeId: documentId, url: null };
  try {
    const value = JSON.parse(documentId.slice(9));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    )
      return { nodeId: value[0], url: value[1] };
  } catch {
    /* Retain unknown historical keys verbatim. */
  }
  return { nodeId: documentId, url: null };
}
export function staleSubtitleDocument(documentId, bindingClipIds, clips) {
  const { nodeId, url } = subtitleDocumentSource(documentId);
  if (!url || url.startsWith('clip:') || !bindingClipIds?.length) return false;
  const bound = clips.filter(
    (clip) => clip.sourceNodeId === nodeId && bindingClipIds.includes(clip.id),
  );
  return (
    bound.length > 0 &&
    bound.every((clip) => clip.subtitleHtmlUrl?.trim() && clip.subtitleHtmlUrl.trim() !== url)
  );
}
export function subtitleClipWindow(clip) {
  const speed = clip.speed ?? clip.playbackRate ?? 1;
  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const start = Math.max(0, clip.sourceOffset);
  return { start, end: start + clip.duration * rate, rate };
}

/** Source oU: a drag must fit in the selected clip's bounded source window. */
export function placeHtmlSubtitleCue(existing, proposed, window) {
  if (!(proposed.duration > 0) || proposed.duration > window.end - window.start) return null;
  const peers = existing
    .filter(
      (cue) =>
        cue.cueId !== proposed.cueId &&
        (cue.clipId ?? null) === (proposed.clipId ?? null) &&
        cue.trackIndex === proposed.trackIndex,
    )
    .sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = window.start;
  for (const peer of peers) {
    const start = Math.max(window.start, peer.start),
      end = Math.min(window.end, peer.start + peer.duration);
    if (end - start <= 0.001) continue;
    if (start - cursor - proposed.duration >= -0.001)
      gaps.push([cursor, start - proposed.duration]);
    cursor = Math.max(cursor, end);
  }
  if (window.end - cursor - proposed.duration >= -0.001)
    gaps.push([cursor, window.end - proposed.duration]);
  let best;
  for (const [start, end] of gaps) {
    const value = Math.min(Math.max(proposed.start, start), end),
      distance = Math.abs(value - proposed.start);
    if (!best || distance < best.distance - 0.001) best = { start: value, distance };
  }
  return best ? Math.round(best.start * 1000) / 1000 : null;
}

/** Source ic/id: keep source cue timing intact; clip instances only project visible intersections. */
export function subtitleCueInstances(cue, clips, nodeId) {
  if (
    !Number.isFinite(cue.start) ||
    !Number.isFinite(cue.duration) ||
    cue.duration <= 0 ||
    cue.clipId === '~'
  )
    return [];
  return clips
    .filter(
      (clip) =>
        clip.type !== 'audio' &&
        clip.sourceNodeId?.trim() === nodeId.trim() &&
        Number.isFinite(clip.startTime) &&
        Number.isFinite(clip.duration) &&
        clip.duration > 0 &&
        Number.isFinite(clip.sourceOffset) &&
        (!cue.clipId || clip.id === cue.clipId),
    )
    .sort((a, b) => a.startTime - b.startTime)
    .flatMap((clip) => {
      const window = subtitleClipWindow(clip);
      const from = Math.max(cue.start, window.start),
        to = Math.min(cue.start + cue.duration, window.end);
      if (to - from < 0.01) return [];
      const startTime = clip.startTime + (from - window.start) / window.rate;
      const endTime = clip.startTime + (to - window.start) / window.rate;
      return endTime - startTime < 0.2
        ? []
        : [{ startTime, endTime, clipId: clip.id ?? '', sourceStartTime: from, sourceEndTime: to }];
    });
}

/** Source iJ: subtitle source-time entry differs from the timeline overlay's iZ. */
export function planNewHtmlSubtitleCue({
  existing,
  clipId,
  tSource,
  duration = 2,
  maxEnd,
  trackIndex = 0,
  text = '默认文本',
}) {
  if (!Number.isFinite(tSource) || !Number.isFinite(duration) || duration <= 0) return null;
  const placed = placeTextCue(
    existing.filter((cue) => (cue.clipId ?? null) === (clipId ?? null)),
    {
      cueId: '',
      clipId,
      start: textFrameTime(tSource),
      duration,
      trackIndex: Math.max(0, Math.round(trackIndex)),
    },
    'forward',
  );
  const remaining = Number.isFinite(maxEnd) ? Math.max(0, maxEnd - placed.start) : placed.duration;
  if (remaining < 0.2) return null;
  return {
    ...(clipId ? { clipId } : {}),
    start: placed.start,
    duration: Math.min(placed.duration, remaining),
    trackIndex: placed.trackIndex,
    text,
  };
}

/** Source h0: crossing cues are cloned in full and filtered by each new clip window. */
export function planSubtitleClipLineage(kind, before, after, sourceClipId) {
  const beforeIds = new Set(before.map((clip) => clip.id));
  const afterIds = new Set(after.map((clip) => clip.id));
  const removed = before.filter((clip) => !afterIds.has(clip.id));
  const added = after.filter((clip) => !beforeIds.has(clip.id));
  if (kind === 'split' && removed.length === 1 && added.length === 2) {
    const source = removed[0];
    const [left, right] = [...added].sort((a, b) => a.sourceOffset - b.sourceOffset);
    if (
      !source.id ||
      !source.sourceNodeId ||
      !left.id ||
      !right.id ||
      added.some((clip) => clip.sourceNodeId !== source.sourceNodeId)
    )
      return null;
    const old = subtitleClipWindow(source),
      a = subtitleClipWindow(left),
      b = subtitleClipWindow(right);
    if (
      Math.abs(old.start - a.start) > 0.001 ||
      Math.abs(a.end - b.start) > 0.001 ||
      Math.abs(old.end - b.end) > 0.001
    )
      return null;
    return {
      kind,
      nodeId: source.sourceNodeId,
      removedId: source.id,
      leftId: left.id,
      rightId: right.id,
      cutSourceTime: b.start,
    };
  }
  if (kind === 'duplicate' && !removed.length && added.length === 1) {
    const source = before.find((clip) => clip.id === sourceClipId),
      copy = added[0];
    if (!source || !copy.id || !source.sourceNodeId || source.sourceNodeId !== copy.sourceNodeId)
      return null;
    const a = subtitleClipWindow(source),
      b = subtitleClipWindow(copy);
    if (Math.abs(a.start - b.start) >= 0.001 || Math.abs(a.end - b.end) >= 0.001) return null;
    return { kind, nodeId: source.sourceNodeId, fromClipId: sourceClipId, toClipId: copy.id };
  }
  return null;
}

export function subtitleLineagePatches(model, lineage) {
  if (
    !lineage ||
    !model.cues.every((cue) => cue.clipId != null) ||
    (!model.cues.length && !Object.keys(model.clipMeta).length)
  )
    return [];
  const sourceClipId = lineage.kind === 'split' ? lineage.removedId : lineage.fromClipId;
  if (
    !Object.prototype.hasOwnProperty.call(model.clipMeta, sourceClipId) &&
    !model.cues.some((cue) => cue.clipId === sourceClipId)
  )
    return [];
  if (lineage.kind === 'duplicate')
    return [
      { kind: 'cloneCuesToClip', fromClipId: lineage.fromClipId, toClipId: lineage.toClipId },
      { kind: 'setClipMeta', clipId: lineage.toClipId, ...model.clipMeta[lineage.fromClipId] },
    ];
  const patches = model.cues
    .filter((cue) => cue.clipId === lineage.removedId)
    .flatMap((cue) => [
      ...(cue.start < lineage.cutSourceTime && cue.start + cue.duration > lineage.cutSourceTime
        ? [
            {
              kind: 'cloneCuesToClip',
              fromClipId: lineage.removedId,
              toClipId: lineage.rightId,
              cueIds: [cue.cueId],
            },
          ]
        : []),
      {
        kind: 'retagCues',
        cueIds: [cue.cueId],
        toClipId: cue.start >= lineage.cutSourceTime ? lineage.rightId : lineage.leftId,
      },
    ]);
  if (model.clipMeta[lineage.removedId] || patches.length)
    patches.push(
      { kind: 'setClipMeta', clipId: lineage.leftId, ...model.clipMeta[lineage.removedId] },
      { kind: 'setClipMeta', clipId: lineage.rightId, ...model.clipMeta[lineage.removedId] },
      { kind: 'setClipMeta', clipId: lineage.removedId, remove: true },
    );
  return patches;
}
