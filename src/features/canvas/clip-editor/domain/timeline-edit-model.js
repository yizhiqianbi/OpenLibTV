import {
  computeVideoTrackCount,
  getMainVideoTrackIndex,
  getVideoTrackIndex,
  normalizeClipTrackZIndexes,
  resolveVideoTrackCount,
} from '../../clip-disconnect/track-model.js';
import {
  CLIP_EDITOR_MIN_DURATION,
  CLIP_EDITOR_MIN_EXTENT,
  compactClipTimelineDocument,
  seekClipTimelineDocument,
} from './timeline-document-model.js';
import { clipAudioFaderDbForPosition } from './audio-gain-model.js';

export const CLIP_EDIT_MIN_DURATION = 0.5;
export const CLIP_EDIT_VIDEO_LIMIT = 30;
export const CLIP_EDIT_LOADING_ASSET_ID = '__timeline_loading__';

// The source editor stores a transition on the clip entering a cut.  Keep the
// local editor on that same contract instead of inventing a separate graph
// entity. The library hides dissolve, but imported cuts can still use it.
// `crossfade` is the source's legacy alias for `fade`.
export const CLIP_TIMELINE_TRANSITION_TYPES = Object.freeze([
  'fade',
  'dissolve',
  'fadeblack',
  'fadewhite',
]);
const CLIP_TIMELINE_TRANSITION_DEFAULT_DURATION = 2;

function transitionType(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const resolved = normalized === 'crossfade' ? 'fade' : normalized;
  return CLIP_TIMELINE_TRANSITION_TYPES.includes(resolved) ? resolved : 'fade';
}

function orderedMainVideoClips(timeline) {
  const clips = (timeline?.clips ?? []).filter((clip) => clip.type !== 'audio');
  const videoTrackCount = resolveVideoTrackCount(clips, timeline?.videoTrackCount);
  const main = getMainVideoTrackIndex(videoTrackCount);
  const primary = clips.filter((clip) => getVideoTrackIndex(clip) === main);
  const ordered = primary.length > 0 ? primary : clips;
  return [...ordered].sort((a, b) => {
    const time = a.startTime - b.startTime;
    return Math.abs(time) > 1e-6
      ? time
      : (a.zIndex ?? 0) - (b.zIndex ?? 0) || String(a.id).localeCompare(String(b.id));
  });
}

function transitionMaximumDuration(ordered, cutIndex) {
  const left = ordered[cutIndex];
  const right = ordered[cutIndex + 1];
  if (!left || !right) return 0.2;
  // Source uj caps the centered window's half-duration to either neighbour.
  return Math.max(0.2, Math.min(10, 2 * left.duration, 2 * right.duration));
}

function normalizeTransition(transition, ordered, cutIndex) {
  const type = transitionType(transition?.type);
  const fallback =
    Number.isFinite(transition?.duration) && transition.duration > 0
      ? transition.duration
      : CLIP_TIMELINE_TRANSITION_DEFAULT_DURATION;
  const maximum = transitionMaximumDuration(ordered, cutIndex);
  return {
    type,
    duration: Math.min(maximum, Math.max(0.2, fallback)),
  };
}

/** Source f2 -> u$ -> uU -> uF: round before positive-duration fallback. */
export function clipTransitionInspectorDuration(value, maximum) {
  const rounded = Number.isFinite(value) ? Math.round(10 * value) / 10 : value;
  const duration = rounded > 0 && Number.isFinite(rounded) ? rounded : 2;
  return Math.min(maximum, Math.max(0.2, duration));
}

function resolveTransitionCutIndex(timeline, selectedClipIds = [], rightClipId) {
  const ordered = orderedMainVideoClips(timeline);
  // Inspector actions target the selected cut by stable identity, never by a
  // changing playhead or a stale array index.
  if (rightClipId != null) {
    const index = ordered.findIndex((clip) => clip.id === rightClipId);
    return index > 0
      ? { ordered, cutIndex: index - 1, status: 'ready' }
      : { ordered, status: 'no-selection' };
  }
  const selected = (timeline?.clips ?? []).filter((clip) => selectedClipIds.includes(clip.id));
  if (selected.length === 1 && selected[0].type === 'audio')
    return { ordered, status: 'not-video' };
  if (selectedClipIds.length > 1 || (selectedClipIds.length && !selected.length))
    return { ordered, status: 'no-selection' };
  if (selected.length && !ordered.some((clip) => clip.id === selected[0].id))
    return { ordered, status: 'not-main-video' };
  if (ordered.length < 2) return { ordered, status: 'no-next-clip' };
  const selectedIndex = ordered.findIndex((clip) => selectedClipIds.includes(clip.id));
  if (selectedIndex >= 0)
    return {
      ordered,
      cutIndex: selectedIndex === 0 ? 0 : selectedIndex - 1,
      status: 'ready',
    };
  const main = getMainVideoTrackIndex(resolveVideoTrackCount(ordered, timeline.videoTrackCount));
  if (!ordered.some((clip) => getVideoTrackIndex(clip) === main))
    return { ordered, status: 'no-selection' };
  const atTime = ordered.findIndex((clip, index) => {
    const end = clip.startTime + clip.duration;
    return (
      timeline.currentTime >= clip.startTime &&
      (timeline.currentTime < end || (index === ordered.length - 1 && timeline.currentTime <= end))
    );
  });
  if (atTime < 0) return { ordered, status: 'no-selection' };
  return {
    ordered,
    cutIndex: atTime === 0 ? 0 : atTime - 1,
    status: 'ready',
  };
}

/** Returns source-shaped transition markers for the local timeline UI. */
export function describeClipTimelineTransitions(timeline) {
  const ordered = orderedMainVideoClips(timeline);
  return ordered.slice(1).flatMap((right, index) => {
    if (!right?.transitionIn) return [];
    const transition = normalizeTransition(right.transitionIn, ordered, index);
    const cutTime = right.startTime;
    return [
      {
        id: right.transitionIn.id || `clip-transition-right-${right.id}`,
        ...transition,
        cutIndex: index,
        cutTime,
        startTime: Math.max(0, cutTime - transition.duration / 2),
        endTime: cutTime + transition.duration / 2,
        leftClipId: ordered[index].id,
        rightClipId: right.id,
        leftSourceNodeId: ordered[index].sourceNodeId,
        rightSourceNodeId: right.sourceNodeId,
        maximumDuration: transitionMaximumDuration(ordered, index),
      },
    ];
  });
}

/**
 * Adds or updates a clip-level transition.  It is intentionally local and
 * undoable; the preview consumes the same marker clock without changing clips.
 */
export function setClipTimelineTransition(timeline, options = {}) {
  const selectedClipIds = [...(options.selectedClipIds ?? [])];
  const resolved = resolveTransitionCutIndex(timeline, selectedClipIds, options.rightClipId);
  if (resolved.status !== 'ready') return outcome(resolved.status, timeline, selectedClipIds);
  const { ordered, cutIndex } = resolved;
  const right = ordered[cutIndex + 1];
  if (!right) return outcome('no-next-clip', timeline, selectedClipIds);
  const nextTransition = normalizeTransition(
    {
      type: options.type ?? right.transitionIn?.type,
      duration: options.inspectorDuration
        ? clipTransitionInspectorDuration(
            options.duration,
            transitionMaximumDuration(ordered, cutIndex),
          )
        : (options.duration ?? right.transitionIn?.duration),
    },
    ordered,
    cutIndex,
  );
  const nextClips = timeline.clips.map((clip) =>
    clip.id === right.id ? { ...clip, transitionIn: nextTransition } : clip,
  );
  const changed =
    right.transitionIn?.type !== nextTransition.type ||
    Math.abs((right.transitionIn?.duration ?? NaN) - nextTransition.duration) > 1e-6;
  return outcome(
    changed ? 'edited' : 'unchanged',
    changed ? { ...timeline, clips: nextClips } : timeline,
    selectedClipIds,
    {
      transition: { ...nextTransition, cutIndex, cutTime: right.startTime, rightClipId: right.id },
    },
  );
}

/** Removes the transition entering a selected cut while retaining all fields. */
export function deleteClipTimelineTransition(timeline, options = {}) {
  const selectedClipIds = [...(options.selectedClipIds ?? [])];
  const resolved = resolveTransitionCutIndex(timeline, selectedClipIds, options.rightClipId);
  if (resolved.status !== 'ready') return outcome(resolved.status, timeline, selectedClipIds);
  const right = resolved.ordered[resolved.cutIndex + 1];
  if (!right?.transitionIn) return outcome('unchanged', timeline, selectedClipIds);
  return outcome(
    'deleted',
    {
      ...timeline,
      clips: timeline.clips.map((clip) => {
        if (clip.id !== right.id) return clip;
        const { transitionIn: _transitionIn, ...rest } = clip;
        return rest;
      }),
    },
    selectedClipIds,
  );
}

export function clipTimelinePlaybackSpeed(clip) {
  const speed = clip.speed;
  return speed == null || !Number.isFinite(speed) || speed <= 0
    ? 1
    : Math.min(8192, Math.max(0.0625, speed));
}

/** Applies the source clip-level volume-line gesture to a local timeline. */
export function setClipTimelineClipGain(timeline, { clipId, position } = {}) {
  if (!clipId || !Number.isFinite(position))
    return { status: 'invalid', timeline, selectedClipIds: [] };
  const clip = timeline.clips.find((entry) => entry.id === clipId);
  if (!clip) return { status: 'missing', timeline, selectedClipIds: [] };
  const decibel = clipAudioFaderDbForPosition(Math.max(0, Math.min(1, position)));
  if (
    Number.isFinite(clip.decibel) &&
    Math.abs(clip.decibel - decibel) < 1e-4 &&
    clip.audioFaderDb === undefined &&
    clip.audioFaderT === undefined &&
    clip.audioVolume === undefined
  )
    return { status: 'unchanged', timeline, selectedClipIds: [clipId] };
  const nextClips = timeline.clips.map((entry) =>
    entry.id === clipId
      ? {
          ...entry,
          decibel,
          audioFaderDb: undefined,
          audioFaderT: undefined,
          audioVolume: undefined,
        }
      : entry,
  );
  return {
    status: 'edited',
    timeline: { ...timeline, clips: nextClips },
    selectedClipIds: [clipId],
  };
}

function extent(clips) {
  return clips.length === 0
    ? CLIP_EDITOR_MIN_DURATION
    : Math.max(CLIP_EDITOR_MIN_EXTENT, ...clips.map((clip) => clip.startTime + clip.duration));
}

function audioIndex(clip, videoCount) {
  if (typeof clip.zIndex === 'number' && Number.isFinite(clip.zIndex) && clip.zIndex >= 0)
    return Math.max(0, Math.floor(clip.zIndex) - Math.max(0, videoCount | 0));
  return typeof clip.audioTrack === 'number' &&
    Number.isFinite(clip.audioTrack) &&
    clip.audioTrack >= 0
    ? Math.floor(clip.audioTrack)
    : 0;
}

function audioCount(clips, videoCount) {
  return (
    clips.reduce(
      (maximum, clip) =>
        clip.type === 'audio' ? Math.max(maximum, audioIndex(clip, videoCount)) : maximum,
      -1,
    ) + 1
  );
}

function controlValue(values, global, index) {
  return values?.length > 0 ? (values[index] ?? false) : global === true;
}

function audioControlArray(clips, videoCount, values, global, remap = null) {
  const count = audioCount(clips, videoCount);
  if (!remap)
    return Array.from({ length: count }, (_, index) => controlValue(values, global, index));
  const result = Array(count).fill(false);
  for (const [oldIndex, nextIndex] of remap)
    if (nextIndex >= 0 && nextIndex < count)
      result[nextIndex] = controlValue(values, global, oldIndex);
  return result;
}

function videoControlArray(clips, hint, values, global) {
  const count = resolveVideoTrackCount(clips, hint);
  const indices = new Set(clips.filter((clip) => clip.type !== 'audio').map(getVideoTrackIndex));
  if (count > 0) indices.add(getMainVideoTrackIndex(count));
  return [...indices].sort((a, b) => a - b).map((index) => controlValue(values, global, index));
}

function insertControlRow(values, global, index, count) {
  return Array.from({ length: count }, (_, next) =>
    next === index ? false : controlValue(values, global, next < index ? next : next - 1),
  );
}

function sortByTime(a, b) {
  return a.startTime - b.startTime || a.id.localeCompare(b.id);
}

function withoutAudioLink(clip) {
  const { linkedVideoClipId: _linkedVideoClipId, ...next } = clip;
  return next;
}

function outcome(status, timeline, selectedClipIds = [], extras = {}) {
  return {
    status,
    timeline,
    selectedClipIds: [...selectedClipIds],
    pauseRequired: false,
    ...extras,
  };
}

export function pickClipTimelineVideoAtTime(timeline, time) {
  const clips = timeline.clips.filter(
    (clip) =>
      clip.type !== 'audio' &&
      timeline.videoTrackHiddenPerTrack?.[getVideoTrackIndex(clip)] !== true &&
      time >= clip.startTime &&
      time <= clip.startTime + clip.duration,
  );
  clips.sort((a, b) => getVideoTrackIndex(b) - getVideoTrackIndex(a) || sortByTime(a, b));
  return clips.at(-1) ?? null;
}

function selectedAudioAtPlayhead(timeline, selectedClipIds) {
  if (selectedClipIds.length !== 1) return null;
  const clip = timeline.clips.find((clip) => selectedClipIds.includes(clip.id));
  return clip?.type === 'audio' &&
    timeline.currentTime > clip.startTime + 0.001 &&
    timeline.currentTime < clip.startTime + clip.duration - 0.001
    ? clip
    : null;
}

function playheadClip(timeline, kind, selectedClipIds) {
  return kind === 'audio'
    ? selectedAudioAtPlayhead(timeline, selectedClipIds)
    : pickClipTimelineVideoAtTime(timeline, timeline.currentTime);
}

function isPrepared(clip) {
  return clip && clip.loading !== true && clip.assetId !== CLIP_EDIT_LOADING_ASSET_ID;
}

export function splitClipTimelineAtPlayhead(timeline, options = {}) {
  const {
    kind = 'video',
    selectedClipIds = [],
    leftId,
    rightId,
    rightSegmentSourceNodeId,
    minDuration = CLIP_EDIT_MIN_DURATION,
  } = options;
  const unchanged = (status) => outcome(status, timeline, selectedClipIds);
  if (
    kind !== 'audio' &&
    timeline.clips.filter((clip) => clip.type !== 'audio').length >= CLIP_EDIT_VIDEO_LIMIT
  )
    return unchanged('video-limit');
  const clip = playheadClip(timeline, kind, selectedClipIds);
  if (!isPrepared(clip)) return unchanged('unavailable');
  const time = timeline.currentTime,
    start = clip.startTime,
    end = start + clip.duration;
  const leftDuration = time - start,
    rightDuration = end - time;
  if (
    time <= start + 0.001 ||
    time >= end - 0.001 ||
    leftDuration < minDuration ||
    rightDuration < minDuration
  )
    return unchanged('invalid-range');
  const speed = clipTimelinePlaybackSpeed(clip);
  if (
    clip.sourceOffset + leftDuration * speed > clip.sourceDuration + 0.001 ||
    clip.sourceOffset + clip.duration * speed > clip.sourceDuration + 0.001
  )
    return unchanged('source-overflow');
  if (
    !leftId ||
    !rightId ||
    leftId === rightId ||
    timeline.clips.some((item) => item.id === leftId || item.id === rightId)
  )
    return unchanged('invalid-id');
  const { id: _id, ...fields } = kind === 'audio' ? withoutAudioLink(clip) : clip;
  const left = {
    ...fields,
    id: leftId,
    startTime: start,
    duration: leftDuration,
    sourceOffset: clip.sourceOffset,
  };
  const right = {
    ...fields,
    id: rightId,
    startTime: time,
    duration: rightDuration,
    sourceOffset: clip.sourceOffset + leftDuration * speed,
    sourceNodeId:
      kind === 'audio' ? (rightSegmentSourceNodeId ?? clip.sourceNodeId) : clip.sourceNodeId,
  };
  const clips = timeline.clips.flatMap((item) => (item.id === clip.id ? [left, right] : [item]));
  const cropRange =
    timeline.cropRange?.start < time && timeline.cropRange.end > time ? null : timeline.cropRange;
  return outcome(
    'edited',
    seekClipTimelineDocument({ ...timeline, clips, totalDuration: extent(clips), cropRange }, time),
    [rightId],
    { pauseRequired: true },
  );
}

export function trimClipTimelineAtPlayhead(timeline, options = {}) {
  const {
    kind = 'video',
    side = 'left',
    selectedClipIds = [],
    minDuration = CLIP_EDIT_MIN_DURATION,
    viewportWidth = 0,
  } = options;
  const unchanged = (status) => outcome(status, timeline, selectedClipIds);
  const clip = playheadClip(timeline, kind, selectedClipIds);
  if (!isPrepared(clip)) return unchanged('unavailable');
  const time = timeline.currentTime,
    start = clip.startTime,
    end = start + clip.duration;
  if (time <= start + 0.001 || time >= end - 0.001) return unchanged('invalid-range');
  const duration = side === 'left' ? end - time : time - start;
  if (duration < minDuration) return unchanged('invalid-range');
  const speed = clipTimelinePlaybackSpeed(clip);
  const offset = side === 'left' ? clip.sourceOffset + (time - start) * speed : clip.sourceOffset;
  if (offset + duration * speed > clip.sourceDuration + 0.001) return unchanged('source-overflow');
  const fields = kind === 'audio' ? withoutAudioLink(clip) : clip;
  const updated = {
    ...fields,
    startTime: side === 'left' ? time : start,
    duration,
    sourceOffset: offset,
  };
  const clips = timeline.clips.map((item) => (item.id === clip.id ? updated : item));
  const compacted = compactClipTimelineDocument(
    { ...timeline, clips, totalDuration: extent(clips), cropRange: null },
    [clip.id],
    viewportWidth,
  );
  const next = compacted.clips.find((item) => item.id === clip.id);
  const seek = side === 'left' && next ? next.startTime : Math.min(time, compacted.totalDuration);
  return outcome('edited', seekClipTimelineDocument(compacted, seek), [clip.id], {
    pauseRequired: true,
  });
}

export function trimClipTimelineRealtime(timeline, options = {}) {
  const {
    edge,
    time,
    selectedClipIds = [],
    minDuration = CLIP_EDIT_MIN_DURATION,
    viewportWidth = 0,
  } = options;
  const unchanged = (status) => outcome(status, timeline, selectedClipIds);
  if (timeline.clips.length === 0 || !timeline.cropRange) return unchanged('unavailable');
  const clip =
    (selectedClipIds.length > 0
      ? timeline.clips.find((item) => selectedClipIds.includes(item.id))
      : null) ??
    timeline.clips.find(
      (item) =>
        timeline.cropRange.start >= item.startTime &&
        timeline.cropRange.start < item.startTime + item.duration,
    ) ??
    timeline.clips.find(
      (item) =>
        timeline.cropRange.start < item.startTime + item.duration &&
        timeline.cropRange.end > item.startTime,
    );
  if (!clip) return unchanged('unavailable');
  const right = edge === 'crop-right';
  const speed = clipTimelinePlaybackSpeed(clip);
  const start = right ? clip.startTime : Math.max(0, time);
  const duration = right ? time - clip.startTime : clip.startTime + clip.duration - time;
  const offset = right ? clip.sourceOffset : clip.sourceOffset + (time - clip.startTime) * speed;
  if (duration <= 0 || duration < minDuration) return unchanged('invalid-range');
  if (offset < 0 || offset + duration * speed > clip.sourceDuration)
    return unchanged('source-overflow');
  const delta = start + duration - (clip.startTime + clip.duration);
  const videoCount = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  const track = clip.type === 'audio' ? audioIndex(clip, videoCount) : getVideoTrackIndex(clip);
  const clips = timeline.clips.map((item) => {
    if (item.id === clip.id)
      return {
        ...item,
        startTime: start,
        sourceOffset: offset,
        duration,
        sourceDuration: clip.sourceDuration,
      };
    const same =
      clip.type === 'audio'
        ? item.type === 'audio' && audioIndex(item, videoCount) === track
        : item.type !== 'audio' && getVideoTrackIndex(item) === track;
    return same && item.startTime >= clip.startTime
      ? { ...item, startTime: item.startTime + delta }
      : item;
  });
  const totalDuration = extent(clips);
  const scrollX = Math.min(
    timeline.scrollX,
    Math.max(0, totalDuration * timeline.scale - viewportWidth + 12),
  );
  return outcome(
    'edited',
    { ...timeline, clips, totalDuration, scrollX, cropRange: { start, end: start + duration } },
    selectedClipIds,
  );
}

export function moveClipTimelineRealtime(timeline, options = {}) {
  const {
    kind = 'video',
    time,
    trackIndex,
    selectedClipIds = [],
    videoDragBaseTrackCount,
    dragInsertVideoTrackIdx,
  } = options;
  const clip = timeline.clips.find((item) => item.id === selectedClipIds[0]);
  if (!clip || (kind === 'audio' ? clip.type !== 'audio' : clip.type === 'audio'))
    return outcome('unavailable', timeline, selectedClipIds);
  const videoCount = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  const track =
    trackIndex == null
      ? kind === 'audio'
        ? audioIndex(clip, videoCount)
        : getVideoTrackIndex(clip)
      : Math.max(0, trackIndex);
  const main = getMainVideoTrackIndex(videoCount);
  if (
    kind !== 'audio' &&
    getVideoTrackIndex(clip) === main &&
    track !== main &&
    timeline.clips.filter((item) => item.type !== 'audio' && getVideoTrackIndex(item) === main)
      .length === 1
  )
    return outcome('main-track-protected', timeline, selectedClipIds);
  const zIndex = kind === 'audio' ? Math.max(0, videoCount | 0) + Math.max(0, track | 0) : track;
  const clips = timeline.clips.map((item) =>
    item.id === clip.id ? { ...item, startTime: time, zIndex } : item,
  );
  const next = {
    ...timeline,
    clips,
    totalDuration: extent(clips),
    cropRange: { start: time, end: time + clip.duration },
  };
  if (kind === 'audio') {
    next.audioTrackMutedPerTrack = audioControlArray(
      clips,
      videoCount,
      timeline.audioTrackMutedPerTrack,
      timeline.audioTrackMuted,
    );
    next.audioTrackHiddenPerTrack = audioControlArray(
      clips,
      videoCount,
      timeline.audioTrackHiddenPerTrack,
      false,
    );
    next.audioTrackMuted = false;
  } else {
    const base = videoDragBaseTrackCount ?? videoCount;
    const count =
      dragInsertVideoTrackIdx == null ? base : Math.max(base + 1, dragInsertVideoTrackIdx + 1);
    next.videoTrackCount = Math.max(count, track + 1, computeVideoTrackCount(clips));
  }
  return outcome('edited', next, selectedClipIds);
}

export function reorderClipTimelineVideo(
  timeline,
  { clipId, index, selectedClipIds = [], viewportWidth = 0 } = {},
) {
  const target = timeline.clips.find((clip) => clip.id === clipId);
  if (!target || target.type === 'audio') return outcome('unavailable', timeline, selectedClipIds);
  const videoCount = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  const track = getVideoTrackIndex(target);
  if (track !== getMainVideoTrackIndex(videoCount)) {
    const normalized = normalizeClipTrackZIndexes(timeline.clips, { videoTrackCount: videoCount });
    return outcome(
      'edited',
      {
        ...timeline,
        clips: normalized.clips,
        videoTrackCount: normalized.videoTrackCount,
        totalDuration: extent(normalized.clips),
        videoAudioMuted: false,
        videoAudioMutedPerTrack: videoControlArray(
          timeline.clips,
          videoCount,
          timeline.videoAudioMutedPerTrack,
          timeline.videoAudioMuted,
        ),
        videoTrackHiddenPerTrack: videoControlArray(
          timeline.clips,
          videoCount,
          timeline.videoTrackHiddenPerTrack,
          false,
        ),
      },
      selectedClipIds,
    );
  }
  const primary = timeline.clips
    .filter((clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) === track)
    .sort(sortByTime);
  const others = primary.filter((clip) => clip.id !== clipId);
  const position = Math.max(0, Math.min(index, others.length));
  let time = 0;
  const ordered = [...others.slice(0, position), target, ...others.slice(position)].map((clip) => {
    const next = { ...clip, startTime: time };
    time += clip.duration;
    return next;
  });
  const clips = [
    ...timeline.clips.filter((clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) !== track),
    ...ordered,
    ...timeline.clips.filter((clip) => clip.type === 'audio'),
  ];
  const normalized = normalizeClipTrackZIndexes(clips, { videoTrackCount: videoCount });
  return outcome(
    'edited',
    compactClipTimelineDocument(
      {
        ...timeline,
        clips: normalized.clips,
        videoTrackCount: normalized.videoTrackCount,
        totalDuration: extent(normalized.clips),
      },
      selectedClipIds,
      viewportWidth,
    ),
    selectedClipIds,
  );
}

function freeAudioTrack(clips, startTime, duration, videoCount) {
  const count = audioCount(clips, videoCount);
  for (let index = 0; index < count; index++) {
    const collision = clips.some(
      (clip) =>
        clip.type === 'audio' &&
        audioIndex(clip, videoCount) === index &&
        startTime < clip.startTime + clip.duration - 1e-6 &&
        startTime + duration > clip.startTime + 1e-6,
    );
    if (!collision) return index;
  }
  return count;
}

function mediaName(url) {
  try {
    return decodeURIComponent(url.split('/').at(-1)?.split('?')[0] || 'video');
  } catch {
    return 'video';
  }
}

/**
 * Keep the source editor's in-editor clipboard contract local to the timeline.
 * Only one video clip can be copied; audio clips are intentionally rejected by
 * the source's `clipCopyVideoOnly` guard. No upload or server task is started.
 */
export function copyClipTimelineSelection(timeline, { selectedClipIds = [] } = {}) {
  const selected = timeline.clips.filter((clip) => selectedClipIds.includes(clip.id));
  if (selected.length !== 1) return { status: 'no-selection', clipboard: null };
  const clip = selected[0];
  if (clip.type === 'audio') return { status: 'video-only', clipboard: null };
  return {
    status: 'copied',
    clipboard: {
      kind: 'video-clip',
      sourceNodeId: clip.sourceNodeId,
      clip: structuredClone(clip),
    },
  };
}

/**
 * Paste one copied video clip at the playhead (or an explicit time). The
 * Canvas source node is reused; a fresh timeline id and normal insertion
 * layout are still produced so the controller can persist through CAS/history.
 */
export function pasteClipTimelineSelection(
  timeline,
  { clipboard, id, media, atTime, selectedClipIds = [] } = {},
) {
  const copied = clipboard?.kind === 'video-clip' ? clipboard.clip : null;
  if (!copied || copied.type === 'audio') return outcome('video-only', timeline, selectedClipIds);
  if (!id || timeline.clips.some((clip) => clip.id === id))
    return outcome('invalid-id', timeline, selectedClipIds);
  if (!media?.url || media.metadata?.url !== media.url)
    return outcome('media-unavailable', timeline, selectedClipIds);
  const speed = clipTimelinePlaybackSpeed(copied);
  const sourceDuration = Number(media.metadata.sourceDuration);
  const sourceOffset = Math.max(
    0,
    Math.min(
      Number.isFinite(copied.sourceOffset) ? copied.sourceOffset : 0,
      Math.max(0, sourceDuration - CLIP_EDIT_MIN_DURATION * speed),
    ),
  );
  const maximumDuration = Math.max(CLIP_EDIT_MIN_DURATION, (sourceDuration - sourceOffset) / speed);
  const duration = Math.min(
    Math.max(CLIP_EDIT_MIN_DURATION, Number(copied.duration) || CLIP_EDIT_MIN_DURATION),
    maximumDuration,
  );
  const fields = { ...copied };
  for (const key of [
    'id',
    'sourceNodeId',
    'startTime',
    'duration',
    'sourceOffset',
    'sourceDuration',
    'width',
    'height',
    'zIndex',
  ])
    delete fields[key];
  const result = insertPreparedClipTimelineMedia(
    timeline,
    {
      kind: 'video',
      id,
      sourceNodeId: copied.sourceNodeId,
      url: media.url,
      name: copied.name || media.name,
      metadata: media.metadata,
      clipFields: fields,
    },
    {
      selectedClipIds,
      insertAtTime: Number.isFinite(atTime) ? atTime : timeline.currentTime,
      clipDuration: duration,
      sourceOffset,
      speed: copied.speed,
    },
  );
  if (result.status !== 'added') return result;
  return {
    ...result,
    status: 'pasted',
    selectedClipIds: [id],
    copiedClipId: copied.id,
  };
}

/** Ready media only. Metadata is supplied by a URL-matching decoder/probe owned by the controller. */
export function insertPreparedClipTimelineMedia(timeline, media, options = {}) {
  const { kind = 'video', id, sourceNodeId, url, name, metadata, clipFields = {} } = media;
  const selectedClipIds = options.selectedClipIds ?? [];
  if (!id || timeline.clips.some((clip) => clip.id === id))
    return outcome('invalid-id', timeline, selectedClipIds);
  if (
    typeof url !== 'string' ||
    !url ||
    !metadata ||
    metadata.url !== url ||
    !Number.isFinite(metadata.sourceDuration) ||
    metadata.sourceDuration <= 0 ||
    (kind !== 'audio' &&
      (!Number.isFinite(metadata.width) ||
        metadata.width <= 0 ||
        !Number.isFinite(metadata.height) ||
        metadata.height <= 0))
  )
    return outcome('invalid-media', timeline, selectedClipIds);
  if (
    kind !== 'audio' &&
    timeline.clips.filter((clip) => clip.type !== 'audio').length >= CLIP_EDIT_VIDEO_LIMIT
  )
    return outcome('video-limit', timeline, selectedClipIds);
  const measuredDuration = Math.max(0.1, metadata.sourceDuration);
  const requestedOffset = Number.isFinite(options.sourceOffset)
    ? Math.max(0, Math.min(options.sourceOffset, Math.max(0, metadata.sourceDuration - 0.1)))
    : 0;
  const requestedDuration = Number.isFinite(options.clipDuration)
    ? Math.max(0.1, options.clipDuration)
    : null;
  const availableDuration = Math.max(
    0.1,
    (metadata.sourceDuration - requestedOffset) /
      clipTimelinePlaybackSpeed({ speed: options.speed }),
  );
  const stagedDuration =
    kind === 'audio'
      ? Math.max(0.1, options.timelineDuration ?? measuredDuration)
      : Math.min(requestedDuration ?? measuredDuration, availableDuration);
  const linkedVideo =
    kind === 'audio' && options.linkedVideoClipId != null
      ? timeline.clips.find(
          (clip) => clip.id === options.linkedVideoClipId && clip.type !== 'audio',
        )
      : null;
  const duration = kind === 'audio' && !linkedVideo ? measuredDuration : stagedDuration;
  const videoCount =
    kind === 'audio'
      ? resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount)
      : Math.max(1, resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount));
  let track = getMainVideoTrackIndex(videoCount),
    startTime,
    insertionIndex;
  if (kind === 'audio') {
    startTime =
      options.alignStartTime == null
        ? Math.max(0, timeline.currentTime)
        : Math.max(0, options.alignStartTime);
    track =
      options.forceAudioTrack == null
        ? freeAudioTrack(
            timeline.clips,
            startTime,
            Math.max(stagedDuration, options.alignDurationHint ?? 0, 0.001),
            videoCount,
          )
        : Math.max(0, options.forceAudioTrack);
  } else {
    const videos = timeline.clips.filter((clip) => clip.type !== 'audio');
    const after = options.afterSourceNodeId
      ? videos.find((clip) => clip.sourceNodeId === options.afterSourceNodeId)
      : null;
    if (after) {
      track = getVideoTrackIndex(after);
      startTime = after.startTime + after.duration;
      insertionIndex =
        videos
          .filter((clip) => getVideoTrackIndex(clip) === track)
          .sort(sortByTime)
          .findIndex((clip) => clip.id === after.id) + 1;
    } else {
      const primary = videos.filter((clip) => getVideoTrackIndex(clip) === track).sort(sortByTime);
      if (options.insertAtTime != null && !options.afterSourceNodeId) {
        const time = Math.max(0, options.insertAtTime);
        const index = primary.findIndex((clip) => clip.startTime + clip.duration > time + 1e-9);
        startTime =
          index >= 0 && primary[index].startTime <= time + 1e-9 ? primary[index].startTime : time;
        insertionIndex = index >= 0 ? index : primary.length;
      } else {
        startTime =
          primary.length > 0
            ? Math.max(...primary.map((clip) => clip.startTime + clip.duration))
            : 0;
        insertionIndex = primary.length;
      }
    }
  }
  const clip = {
    ...clipFields,
    id,
    ...(kind === 'audio' ? { type: 'audio', decibel: 0 } : {}),
    sourceNodeId,
    name: name?.trim() || mediaName(url),
    zIndex: kind === 'audio' ? Math.max(0, videoCount | 0) + Math.max(0, track | 0) : track,
    startTime: linkedVideo ? linkedVideo.startTime : startTime,
    duration,
    sourceOffset: requestedOffset,
    sourceDuration:
      kind === 'audio'
        ? linkedVideo
          ? Math.max(
              measuredDuration,
              duration * clipTimelinePlaybackSpeed({ speed: options.speed }),
            )
          : measuredDuration
        : metadata.sourceDuration,
    width: kind === 'audio' ? 0 : metadata.width,
    height: kind === 'audio' ? 0 : metadata.height,
    ...(options.speed == null ? {} : { speed: options.speed }),
    ...(options.linkedVideoClipId == null ? {} : { linkedVideoClipId: options.linkedVideoClipId }),
  };
  let clips;
  if (kind === 'audio') {
    const delta = duration - stagedDuration;
    const stageEnd = startTime + stagedDuration;
    clips = [
      ...timeline.clips.map((item) =>
        item.type === 'audio' &&
        audioIndex(item, videoCount) === (track | 0) &&
        Math.abs(delta) > 1e-6 &&
        item.startTime >= stageEnd - 1e-9
          ? { ...item, startTime: item.startTime + delta }
          : item,
      ),
      clip,
    ];
  } else if (track !== getMainVideoTrackIndex(videoCount))
    clips = [
      ...timeline.clips.filter((item) => item.type !== 'audio'),
      clip,
      ...timeline.clips.filter((item) => item.type === 'audio'),
    ];
  else {
    const primary = timeline.clips
      .filter((item) => item.type !== 'audio' && getVideoTrackIndex(item) === track)
      .sort(sortByTime);
    const shifted = primary
      .slice(insertionIndex)
      .map((item) => ({ ...item, startTime: item.startTime + duration }));
    clips = [
      ...timeline.clips.filter(
        (item) => item.type !== 'audio' && getVideoTrackIndex(item) !== track,
      ),
      ...primary.slice(0, insertionIndex),
      clip,
      ...shifted,
      ...timeline.clips.filter((item) => item.type === 'audio'),
    ];
    // The source insertion shifts only the video track. Linked audio is synchronized elsewhere.
  }
  const normalized = normalizeClipTrackZIndexes(clips, { videoTrackCount: videoCount });
  const next = {
    ...timeline,
    clips: normalized.clips,
    videoTrackCount: normalized.videoTrackCount,
    totalDuration: extent(normalized.clips),
  };
  if (kind === 'audio') {
    // Audio ingestion does not compact/renumber existing tracks before its hydration phase.
    next.clips = clips;
    next.videoTrackCount = videoCount;
    next.audioTrackMutedPerTrack = audioControlArray(
      clips,
      videoCount,
      timeline.audioTrackMutedPerTrack,
      timeline.audioTrackMuted,
    );
    next.audioTrackHiddenPerTrack = audioControlArray(
      clips,
      videoCount,
      timeline.audioTrackHiddenPerTrack,
      false,
    );
    next.audioTrackMuted = false;
  } else {
    next.videoAudioMutedPerTrack = videoControlArray(
      normalized.clips,
      normalized.videoTrackCount,
      timeline.videoAudioMutedPerTrack,
      timeline.videoAudioMuted,
    );
    next.videoTrackHiddenPerTrack = videoControlArray(
      normalized.clips,
      normalized.videoTrackCount,
      timeline.videoTrackHiddenPerTrack,
      false,
    );
    next.videoAudioMuted = false;
  }
  return outcome('added', next, selectedClipIds, {
    mediaSource: { clipId: id, sourceNodeId, url, metadata: { ...metadata } },
  });
}

/** Exact eU source-duration/layout resolver; no pixel size is inferred from Canvas nodes. */
export function resolvePreparedClipTimelineBounds(
  existing,
  saved,
  speed,
  { followFullSourceWhenChanged = false } = {},
) {
  const sourceDuration = Math.max(
    Number.isFinite(existing.sourceDuration) && existing.sourceDuration > 0
      ? existing.sourceDuration
      : Math.max(0.1, saved.sourceDuration || 0.1),
    existing.sourceOffset + existing.duration * clipTimelinePlaybackSpeed(existing),
  );
  const savedSource =
    Number.isFinite(saved.sourceDuration) && saved.sourceDuration > 0
      ? saved.sourceDuration
      : sourceDuration;
  const savedDuration =
    Number.isFinite(saved.duration) && saved.duration > 0 ? saved.duration : 0.1;
  const savedOffset =
    Number.isFinite(saved.sourceOffset) && saved.sourceOffset > 0 ? saved.sourceOffset : 0;
  const effectiveSpeed = clipTimelinePlaybackSpeed({ ...existing, speed });
  const tolerance = Math.max(0.001, 1e-6 * savedSource);
  const changedSource = Math.abs(sourceDuration - savedSource) > 0.001;
  const wasFullSource =
    savedOffset <= tolerance &&
    Math.abs(savedOffset + savedDuration * effectiveSpeed - savedSource) <= tolerance;
  const maximumDuration = Math.max(0.001, sourceDuration / effectiveSpeed);
  const sourceOffset =
    followFullSourceWhenChanged && changedSource && wasFullSource
      ? 0
      : Math.min(
          savedOffset,
          Math.max(
            0,
            sourceDuration - Math.min(0.1, savedDuration, maximumDuration) * effectiveSpeed,
          ),
        );
  const duration =
    followFullSourceWhenChanged && changedSource && wasFullSource
      ? maximumDuration
      : Math.min(savedDuration, Math.max(0.001, (sourceDuration - sourceOffset) / effectiveSpeed));
  return {
    duration,
    sourceOffset,
    sourceDuration,
    width: existing.width,
    height: existing.height,
    timelineBoundsChanged:
      Math.abs(duration - saved.duration) > 0.001 ||
      Math.abs(sourceOffset - saved.sourceOffset) > 0.001 ||
      Math.abs(sourceDuration - saved.sourceDuration) > 0.001,
  };
}

export function finishClipTimelineTrackInsertion(timeline, options = {}) {
  const {
    kind = 'video',
    selectedClipIds = [],
    insertTrackIndex,
    videoDragBaseTrackCount,
    viewportWidth = 0,
  } = options;
  const target = timeline.clips.find((clip) => clip.id === selectedClipIds[0]);
  if (!target || (kind === 'audio' ? target.type !== 'audio' : target.type === 'audio'))
    return outcome('unavailable', timeline, selectedClipIds);
  if (insertTrackIndex == null) {
    if (kind !== 'audio')
      return outcome(
        'edited',
        compactClipTimelineDocument(timeline, selectedClipIds, viewportWidth),
        selectedClipIds,
      );
    const count = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
    const normalized = normalizeClipTrackZIndexes(timeline.clips, { videoTrackCount: count });
    if (!normalized.changed) return outcome('edited', timeline, selectedClipIds);
    return outcome(
      'edited',
      {
        ...timeline,
        clips: normalized.clips,
        videoTrackCount: normalized.videoTrackCount,
        totalDuration: extent(normalized.clips),
        audioTrackMutedPerTrack: audioControlArray(
          normalized.clips,
          normalized.videoTrackCount,
          timeline.audioTrackMutedPerTrack,
          timeline.audioTrackMuted,
          normalized.audioTrackRemap,
        ),
        audioTrackHiddenPerTrack: audioControlArray(
          normalized.clips,
          normalized.videoTrackCount,
          timeline.audioTrackHiddenPerTrack,
          false,
          normalized.audioTrackRemap,
        ),
        audioTrackMuted: false,
      },
      selectedClipIds,
    );
  }
  const count = resolveVideoTrackCount(timeline.clips, timeline.videoTrackCount);
  if (
    kind === 'video' &&
    getVideoTrackIndex(target) === getMainVideoTrackIndex(count) &&
    timeline.clips.filter(
      (clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) === getMainVideoTrackIndex(count),
    ).length === 1
  )
    return outcome(
      'main-track-protected',
      compactClipTimelineDocument(timeline, selectedClipIds, viewportWidth),
      selectedClipIds,
    );
  if (kind === 'audio') {
    const oldAudioCount = audioCount(timeline.clips, count);
    let clips = timeline.clips;
    let muted = timeline.audioTrackMutedPerTrack,
      hidden = timeline.audioTrackHiddenPerTrack;
    if (insertTrackIndex < oldAudioCount) {
      clips = clips.map((clip) => {
        if (clip.type !== 'audio') return clip;
        const index =
          clip.id === target.id
            ? insertTrackIndex
            : audioIndex(clip, count) >= insertTrackIndex
              ? audioIndex(clip, count) + 1
              : audioIndex(clip, count);
        return { ...clip, zIndex: Math.max(0, count | 0) + Math.max(0, index | 0) };
      });
      const nextCount = audioCount(clips, count);
      muted = insertControlRow(muted, timeline.audioTrackMuted, insertTrackIndex, nextCount);
      hidden = insertControlRow(hidden, false, insertTrackIndex, nextCount);
    } else if (insertTrackIndex === oldAudioCount) {
      clips = clips.map((clip) =>
        clip.id === target.id ? { ...clip, zIndex: count + oldAudioCount } : clip,
      );
      muted = audioControlArray(clips, count, muted, timeline.audioTrackMuted);
      hidden = audioControlArray(clips, count, hidden, false);
    }
    const normalized = normalizeClipTrackZIndexes(clips, { videoTrackCount: count });
    return outcome(
      'edited',
      {
        ...timeline,
        clips: normalized.clips,
        videoTrackCount: normalized.videoTrackCount,
        totalDuration: extent(normalized.clips),
        audioTrackMutedPerTrack: audioControlArray(
          normalized.clips,
          normalized.videoTrackCount,
          muted,
          timeline.audioTrackMuted,
          normalized.audioTrackRemap,
        ),
        audioTrackHiddenPerTrack: audioControlArray(
          normalized.clips,
          normalized.videoTrackCount,
          hidden,
          false,
          normalized.audioTrackRemap,
        ),
        audioTrackMuted: false,
      },
      selectedClipIds,
    );
  }
  const base = videoDragBaseTrackCount ?? count;
  let clips = timeline.clips.map((clip) =>
    clip.type === 'audio'
      ? clip
      : {
          ...clip,
          zIndex:
            clip.id === target.id
              ? insertTrackIndex
              : getVideoTrackIndex(clip) >= insertTrackIndex
                ? getVideoTrackIndex(clip) + 1
                : getVideoTrackIndex(clip),
        },
  );
  const expanded = Math.max(base + 1, computeVideoTrackCount(clips));
  if (expanded !== base)
    clips = clips.map((clip) =>
      clip.type !== 'audio' ? clip : { ...clip, zIndex: expanded + audioIndex(clip, base) },
    );
  const normalized = normalizeClipTrackZIndexes(clips, { videoTrackCount: expanded });
  const next = {
    ...timeline,
    clips: normalized.clips,
    videoTrackCount: normalized.videoTrackCount,
    totalDuration: extent(normalized.clips),
    videoAudioMutedPerTrack: insertControlRow(
      timeline.videoAudioMutedPerTrack,
      timeline.videoAudioMuted,
      insertTrackIndex,
      normalized.videoTrackCount,
    ),
    videoTrackHiddenPerTrack: insertControlRow(
      timeline.videoTrackHiddenPerTrack,
      false,
      insertTrackIndex,
      normalized.videoTrackCount,
    ),
    videoAudioMuted: false,
    audioTrackMutedPerTrack: audioControlArray(
      normalized.clips,
      normalized.videoTrackCount,
      timeline.audioTrackMutedPerTrack,
      timeline.audioTrackMuted,
      normalized.audioTrackRemap,
    ),
    audioTrackHiddenPerTrack: audioControlArray(
      normalized.clips,
      normalized.videoTrackCount,
      timeline.audioTrackHiddenPerTrack,
      false,
      normalized.audioTrackRemap,
    ),
    audioTrackMuted: false,
  };
  return outcome(
    'edited',
    compactClipTimelineDocument(next, selectedClipIds, viewportWidth),
    selectedClipIds,
  );
}
