import {
  getMainVideoTrackIndex,
  getVideoTrackIndex,
  normalizeClipTrackZIndexes,
  resolveVideoTrackCount,
} from '../../clip-disconnect/track-model.js';

export const CLIP_EDITOR_HISTORY_LIMIT = 10;
export const CLIP_EDITOR_MIN_DURATION = 60;
export const CLIP_EDITOR_MIN_EXTENT = 0.05;
export const CLIP_EDITOR_MIN_SCALE = 2;
export const CLIP_EDITOR_MAX_SCALE = 500;

export function hasAuthoritativeClipTimeline(timeline) {
  return timeline?.clipsAuthoritative === true;
}

export function shouldUseAuthoritativeClipTimeline(nodeData) {
  return hasAuthoritativeClipTimeline(nodeData?.clipTimelineData) || nodeData?.agentEditing != null;
}

/** Documents keep the original schema, including fields this editor does not edit. */
export function cloneClipTimelineDocument(timeline) {
  return structuredClone(timeline);
}

export function createClipTimelineDocument(initial = {}) {
  if (initial.clips !== undefined && !Array.isArray(initial.clips))
    throw new TypeError('clipTimelineData.clips must be an array');
  return cloneClipTimelineDocument({
    videoSourceNodeIds: [],
    audioSourceNodeIds: [],
    clips: [],
    videoTrackCount: 0,
    totalDuration: CLIP_EDITOR_MIN_DURATION,
    currentTime: 0,
    scale: 100,
    scrollX: 0,
    videoAudioMuted: false,
    videoAudioMutedPerTrack: [],
    videoTrackHiddenPerTrack: [],
    videoAudioVolume: 1,
    audioTrackMuted: false,
    audioTrackMutedPerTrack: [],
    audioTrackHiddenPerTrack: [],
    audioTrackVolume: 1,
    ...initial,
  });
}

function audioTrackIndex(clip, videoCount) {
  if (typeof clip.zIndex === 'number' && Number.isFinite(clip.zIndex) && clip.zIndex >= 0)
    return Math.max(0, Math.floor(clip.zIndex) - Math.max(0, videoCount | 0));
  return typeof clip.audioTrack === 'number' &&
    Number.isFinite(clip.audioTrack) &&
    clip.audioTrack >= 0
    ? Math.floor(clip.audioTrack)
    : 0;
}

function audioTrackCount(clips, videoCount) {
  return (
    clips.reduce(
      (maximum, clip) =>
        clip.type === 'audio' ? Math.max(maximum, audioTrackIndex(clip, videoCount)) : maximum,
      -1,
    ) + 1
  );
}

function trackValue(values, fallback, index) {
  return values?.length > 0 ? (values[index] ?? false) : fallback === true;
}

function videoControls(clips, hint, values, fallback) {
  const count = resolveVideoTrackCount(clips, hint);
  const indices = new Set(clips.filter((clip) => clip.type !== 'audio').map(getVideoTrackIndex));
  if (count > 0) indices.add(getMainVideoTrackIndex(count));
  return [...indices].sort((a, b) => a - b).map((index) => trackValue(values, fallback, index));
}

function audioControls(clips, videoCount, values, fallback, remap = null) {
  const count = audioTrackCount(clips, videoCount);
  if (!remap)
    return Array.from({ length: count }, (_, index) => trackValue(values, fallback, index));
  const next = Array(count).fill(false);
  for (const [previous, current] of remap)
    if (current >= 0 && current < count) next[current] = trackValue(values, fallback, previous);
  return next;
}

export function clipTimelineSourceDifferences(before, after) {
  const previous = new Set(
    before.clips.flatMap((clip) => (clip.sourceNodeId ? [clip.sourceNodeId] : [])),
  );
  const next = new Set(
    after.clips.flatMap((clip) => (clip.sourceNodeId ? [clip.sourceNodeId] : [])),
  );
  return {
    restoredSourceNodeIds: [...next].filter((id) => !previous.has(id)),
    deletedSourceNodeIds: [...previous].filter((id) => !next.has(id)),
  };
}

/** eq.compactClips differs from Canvas disconnect layout; only track normalization is shared. */
function compactEditorDocument(timeline, selectedClipIds, viewportWidth) {
  const clips = timeline.clips;
  if (clips.length === 0) {
    const videoTrackCount = Number(timeline.videoTrackCount > 0);
    return {
      ...timeline,
      videoTrackCount,
      totalDuration: CLIP_EDITOR_MIN_DURATION,
      currentTime: Math.max(0, Math.min(timeline.currentTime, CLIP_EDITOR_MIN_DURATION)),
      cropRange: null,
      videoAudioMutedPerTrack: videoControls(
        [],
        videoTrackCount,
        timeline.videoAudioMutedPerTrack,
        timeline.videoAudioMuted,
      ),
      videoTrackHiddenPerTrack: videoControls(
        [],
        videoTrackCount,
        timeline.videoTrackHiddenPerTrack,
        false,
      ),
      audioTrackHiddenPerTrack: [],
      videoAudioMuted: false,
    };
  }
  const first = normalizeClipTrackZIndexes(clips, { videoTrackCount: timeline.videoTrackCount });
  const main = getMainVideoTrackIndex(first.videoTrackCount);
  const tracks = new Map();
  for (const clip of first.clips) {
    if (clip.type === 'audio') continue;
    const index = getVideoTrackIndex(clip);
    const group = tracks.get(index) ?? [];
    group.push(clip);
    tracks.set(index, group);
  }
  const videos = [];
  for (const [index, group] of tracks) {
    const sorted = [...group].sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
    let time = 0;
    for (const clip of sorted) {
      videos.push({ ...clip, zIndex: index, ...(index === main ? { startTime: time } : {}) });
      if (index === main) time += clip.duration;
    }
  }
  const next = normalizeClipTrackZIndexes(
    [...videos, ...first.clips.filter((clip) => clip.type === 'audio')],
    { videoTrackCount: first.videoTrackCount },
  );
  const totalDuration = Math.max(
    CLIP_EDITOR_MIN_EXTENT,
    ...next.clips.map((clip) => clip.startTime + clip.duration),
  );
  const selected = next.clips.find((clip) => selectedClipIds.includes(clip.id));
  const scrollMaximum = Math.max(0, totalDuration * timeline.scale - viewportWidth + 12);
  return {
    ...timeline,
    clips: next.clips,
    videoTrackCount: next.videoTrackCount,
    totalDuration,
    currentTime: Math.max(0, Math.min(timeline.currentTime, totalDuration)),
    cropRange:
      selected && timeline.cropRange
        ? { start: selected.startTime, end: selected.startTime + selected.duration }
        : timeline.cropRange,
    scrollX: Math.min(timeline.scrollX, scrollMaximum),
    videoAudioMutedPerTrack: videoControls(
      clips,
      timeline.videoTrackCount,
      timeline.videoAudioMutedPerTrack,
      timeline.videoAudioMuted,
    ),
    videoTrackHiddenPerTrack: videoControls(
      clips,
      timeline.videoTrackCount,
      timeline.videoTrackHiddenPerTrack,
      false,
    ),
    videoAudioMuted: false,
    audioTrackMutedPerTrack: audioControls(
      next.clips,
      next.videoTrackCount,
      timeline.audioTrackMutedPerTrack,
      timeline.audioTrackMuted,
      next.audioTrackRemap,
    ),
    audioTrackHiddenPerTrack: audioControls(
      next.clips,
      next.videoTrackCount,
      timeline.audioTrackHiddenPerTrack,
      false,
      next.audioTrackRemap,
    ),
    audioTrackMuted: false,
  };
}

/** Editor operations share eq's compact pass; Canvas disconnection has a separate layout. */
export function compactClipTimelineDocument(timeline, selectedClipIds = [], viewportWidth = 0) {
  return compactEditorDocument(timeline, selectedClipIds, viewportWidth);
}

export function deleteClipTimelineSelection(timeline, clipIds, options = {}) {
  const selectedClipIds = [...(options.selectedClipIds ?? [])];
  const ids = new Set(clipIds);
  const unchanged = (status) => ({ status, timeline, selectedClipIds, deletedSourceNodeIds: [] });
  if (
    ids.size === 0 ||
    (options.selectionMode === 'single' && !timeline.clips.some((clip) => ids.has(clip.id)))
  )
    return unchanged('unchanged');
  const main = getMainVideoTrackIndex(
    resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount),
  );
  const primary = timeline.clips.filter(
    (clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) === main,
  );
  if (primary.length > 0 && primary.every((clip) => ids.has(clip.id)))
    return unchanged('main-track-protected');
  const crop = timeline.cropRange;
  const clearCrop =
    options.selectionMode !== 'single' &&
    crop &&
    timeline.clips.some(
      (clip) =>
        ids.has(clip.id) &&
        crop.start >= clip.startTime &&
        crop.end <= clip.startTime + clip.duration,
    );
  const nextSelected = selectedClipIds.filter((id) => !ids.has(id));
  const next = compactEditorDocument(
    {
      ...timeline,
      clips: timeline.clips.filter((clip) => !ids.has(clip.id)),
      ...(clearCrop ? { cropRange: null } : {}),
    },
    nextSelected,
    options.viewportWidth ?? 0,
  );
  return {
    status: 'deleted',
    timeline: next,
    selectedClipIds: next.clips.length === 0 ? [] : nextSelected,
    deletedSourceNodeIds: clipTimelineSourceDifferences(timeline, next).deletedSourceNodeIds,
  };
}

export function seekClipTimelineDocument(timeline, time) {
  return {
    ...timeline,
    currentTime: Math.max(0, Math.min(time, Math.max(0, timeline.totalDuration))),
  };
}

export function setClipTimelineView(timeline, { scale, scrollX }) {
  return {
    ...timeline,
    ...(scale === undefined
      ? {}
      : { scale: Math.max(CLIP_EDITOR_MIN_SCALE, Math.min(scale, CLIP_EDITOR_MAX_SCALE)) }),
    ...(scrollX === undefined ? {} : { scrollX: Math.max(0, scrollX) }),
  };
}

export function setClipTimelineTrackControl(timeline, { kind, control, trackIndex, value }) {
  if (!['video', 'audio'].includes(kind) || !['muted', 'hidden'].includes(control))
    throw new TypeError('Unknown clip timeline track control');
  const videoCount = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  const index = Math.max(0, trackIndex | 0);
  const field =
    kind === 'video'
      ? control === 'muted'
        ? 'videoAudioMutedPerTrack'
        : 'videoTrackHiddenPerTrack'
      : control === 'muted'
        ? 'audioTrackMutedPerTrack'
        : 'audioTrackHiddenPerTrack';
  const count = Math.max(
    kind === 'video' ? videoCount : audioTrackCount(timeline.clips, videoCount),
    index + 1,
  );
  const original = timeline[field] ?? [];
  const values = [...original];
  const fallback =
    kind === 'video' &&
    control === 'muted' &&
    original.length === 0 &&
    timeline.videoAudioMuted === true;
  while (values.length < count) values.push(fallback);
  values[index] = value;
  return {
    ...timeline,
    [field]: values,
    ...(control === 'muted'
      ? { [kind === 'video' ? 'videoAudioMuted' : 'audioTrackMuted']: false }
      : {}),
  };
}

export function createClipTimelineHistory() {
  return { past: [], future: [] };
}

export function pushClipTimelineHistory(history, timeline, selectedClipIds = []) {
  return {
    past: [
      ...history.past,
      { timeline: cloneClipTimelineDocument(timeline), selectedClipIds: [...selectedClipIds] },
    ].slice(-CLIP_EDITOR_HISTORY_LIMIT),
    future: [],
  };
}

/** History retains the current playhead, clamped to the restored extent, rather than rewinding it. */
export function restoreClipTimelineSnapshot(current, snapshot) {
  const restored = cloneClipTimelineDocument(snapshot.timeline);
  const maximum = Math.max(0, restored.totalDuration);
  const time = Math.max(0, Math.min(current.currentTime, maximum));
  const hasClip = restored.clips.some(
    (clip) => time >= clip.startTime && time < clip.startTime + clip.duration,
  );
  const currentTime =
    restored.clips.length === 0 || hasClip || current.currentTime === time ? time : maximum;
  const videoTrackCount = restored.videoTrackCount ?? resolveVideoTrackCount(restored.clips);
  const timeline = {
    ...restored,
    videoTrackCount,
    currentTime,
    videoAudioMutedPerTrack: videoControls(
      restored.clips,
      videoTrackCount,
      restored.videoAudioMutedPerTrack,
      restored.videoAudioMuted,
    ),
    videoTrackHiddenPerTrack: videoControls(
      restored.clips,
      videoTrackCount,
      restored.videoTrackHiddenPerTrack,
      false,
    ),
    audioTrackMuted: false,
    audioTrackMutedPerTrack: audioControls(
      restored.clips,
      videoTrackCount,
      restored.audioTrackMutedPerTrack,
      restored.audioTrackMuted,
    ),
    audioTrackHiddenPerTrack: audioControls(
      restored.clips,
      videoTrackCount,
      restored.audioTrackHiddenPerTrack,
      false,
    ),
  };
  return {
    timeline,
    selectedClipIds: [...snapshot.selectedClipIds],
    ...clipTimelineSourceDifferences(current, timeline),
  };
}

export function stepClipTimelineHistory(history, direction, timeline, selectedClipIds = []) {
  if (!['undo', 'redo'].includes(direction))
    throw new TypeError('Unknown clip timeline history direction');
  const source = direction === 'undo' ? history.past : history.future;
  if (source.length === 0) return null;
  const current = {
    timeline: cloneClipTimelineDocument(timeline),
    selectedClipIds: [...selectedClipIds],
  };
  const nextHistory =
    direction === 'undo'
      ? { past: history.past.slice(0, -1), future: [...history.future, current] }
      : { past: [...history.past, current], future: history.future.slice(0, -1) };
  return { history: nextHistory, ...restoreClipTimelineSnapshot(timeline, source.at(-1)) };
}
