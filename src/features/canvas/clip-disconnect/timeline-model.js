import { getVideoTrackIndex, normalizeClipTrackZIndexes } from './track-model.js';

export const CLIP_MIN_TOTAL_DURATION = 60;

function recoverSources(sourceIds, clips, kind) {
  const ids = [...(sourceIds ?? [])];
  const known = new Set(ids);
  for (const clip of clips) {
    const matches = kind === 'audio' ? clip.type === 'audio' : clip.type !== 'audio';
    if (matches && clip.sourceNodeId && !known.has(clip.sourceNodeId)) {
      known.add(clip.sourceNodeId);
      ids.push(clip.sourceNodeId);
    }
  }
  return ids;
}

export function layoutConnectedClipTimeline(
  clips,
  videoSourceNodeIds,
  audioSourceNodeIds,
  options = {},
) {
  const videos = new Set(videoSourceNodeIds),
    audios = new Set(audioSourceNodeIds);
  const retained = clips.filter(
    (clip) => clip.sourceNodeId && (clip.type === 'audio' ? audios : videos).has(clip.sourceNodeId),
  );
  const first = normalizeClipTrackZIndexes(retained, { videoTrackCount: options.videoTrackCount });
  const mainTrack = Math.max(0, first.videoTrackCount - 1);
  const tracks = new Map();
  for (const clip of first.clips) {
    if (clip.type === 'audio') continue;
    const track = getVideoTrackIndex(clip);
    const group = tracks.get(track) ?? [];
    group.push(clip);
    tracks.set(track, group);
  }
  const nextVideo = [],
    byVideoId = new Map();
  for (const [track, group] of tracks) {
    const sorted = [...group].sort((a, b) => a.startTime - b.startTime);
    let mainTime = 0;
    for (const clip of sorted) {
      const next =
        track === mainTrack
          ? { ...clip, zIndex: track, startTime: mainTime }
          : { ...clip, zIndex: track };
      nextVideo.push(next);
      if (next.id) byVideoId.set(next.id, next);
      if (track === mainTrack) mainTime += clip.duration;
    }
  }
  const nextAudio = first.clips
    .filter((clip) => clip.type === 'audio')
    .map((clip) => {
      const linked =
        clip.linkedVideoClipId == null ? undefined : byVideoId.get(clip.linkedVideoClipId);
      if (linked) return { ...clip, startTime: linked.startTime };
      if (clip.linkedVideoClipId == null) return clip;
      const { linkedVideoClipId: _linkedVideoClipId, ...next } = clip;
      return next;
    });
  const second = normalizeClipTrackZIndexes([...nextVideo, ...nextAudio], {
    videoTrackCount: first.videoTrackCount,
  });
  const finalMain = Math.max(0, second.videoTrackCount - 1);
  const firstMain = second.clips
    .filter((clip) => clip.type !== 'audio' && getVideoTrackIndex(clip) === finalMain)
    .sort((a, b) => a.startTime - b.startTime)[0];
  const nextClips = second.clips.map((clip) => {
    if (clip !== firstMain || clip.transitionIn == null) return clip;
    const { transitionIn: _transitionIn, ...next } = clip;
    return next;
  });
  const duration = nextClips.reduce((maximum, clip) => {
    const end = Number(clip.startTime) + Number(clip.duration);
    return Number.isFinite(end) && end > maximum ? end : maximum;
  }, 0);
  return {
    clips: nextClips,
    totalDuration: duration > 0 ? duration : CLIP_MIN_TOTAL_DURATION,
    videoTrackCount: second.videoTrackCount,
  };
}

/** Literal disconnectTimelineSource. Numeric source times are not defaulted. */
export function disconnectClipTimelineSource(timeline, sourceId, kind) {
  if (!sourceId) return null;
  const clips = timeline.clips ?? [];
  const ids =
    kind === 'audio' ? (timeline.audioSourceNodeIds ?? []) : (timeline.videoSourceNodeIds ?? []);
  const hasClip = clips.some(
    (clip) =>
      clip.sourceNodeId === sourceId &&
      (kind === 'audio' ? clip.type === 'audio' : clip.type !== 'audio'),
  );
  if (!ids.includes(sourceId) && !hasClip) return null;
  if (!hasClip)
    return {
      ...timeline,
      ...(kind === 'video'
        ? { videoSourceNodeIds: ids.filter((id) => id !== sourceId) }
        : { audioSourceNodeIds: ids.filter((id) => id !== sourceId) }),
    };
  const videoSourceNodeIds = recoverSources(timeline.videoSourceNodeIds, clips, 'video').filter(
    (id) => kind !== 'video' || id !== sourceId,
  );
  const audioSourceNodeIds = recoverSources(timeline.audioSourceNodeIds, clips, 'audio').filter(
    (id) => kind !== 'audio' || id !== sourceId,
  );
  const next = layoutConnectedClipTimeline(clips, videoSourceNodeIds, audioSourceNodeIds, {
    videoTrackCount: timeline.videoTrackCount,
  });
  return {
    ...timeline,
    videoSourceNodeIds,
    audioSourceNodeIds,
    clips: next.clips,
    videoTrackCount: next.videoTrackCount,
    totalDuration: next.totalDuration,
    currentTime: Math.max(0, Math.min(timeline.currentTime, next.totalDuration)),
  };
}
