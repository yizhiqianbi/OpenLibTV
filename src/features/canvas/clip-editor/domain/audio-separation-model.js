import { insertPreparedClipTimelineMedia } from './timeline-edit-model.js';

export function audioSeparationBlockReason({ clip, sourceNode, media } = {}) {
  if (!clip || clip.type === 'audio') return '请先选中视频片段';
  if (clip.loading === true) return '请等待视频片段加载完成';
  if (clip.embedAudioMuted === true) return '该片段已分离过音轨，无法再次分离';
  if (sourceNode?.data?.videoHasAudioTrack === false) return '当前视频无音轨，无法分离音视频';
  if (!media?.url?.trim()) return '当前没有可分离的视频地址';
  return null;
}

/** Attach a prepared extracted audio source to a video clip in one timeline edit. */
export function attachDetachedAudio(
  timeline,
  { videoClipId, audioId, audioSourceNodeId, url, durationSec, name = '分离音轨.wav' } = {},
) {
  const video = timeline?.clips?.find((clip) => clip.id === videoClipId && clip.type !== 'audio');
  if (
    !video ||
    !audioId ||
    !audioSourceNodeId ||
    !url ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  )
    return { status: 'invalid', timeline, selectedClipIds: [] };
  if (video.embedAudioMuted === true)
    return { status: 'already-detached', timeline, selectedClipIds: [videoClipId] };
  const existing = timeline.clips.find(
    (clip) => clip.type === 'audio' && clip.sourceNodeId === audioSourceNodeId,
  );
  const added = existing
    ? { status: 'added', timeline, selectedClipIds: [videoClipId] }
    : insertPreparedClipTimelineMedia(
        timeline,
        {
          kind: 'audio',
          id: audioId,
          sourceNodeId: audioSourceNodeId,
          url,
          name,
          metadata: { url, sourceDuration: durationSec, width: 0, height: 0 },
        },
        {
          selectedClipIds: [videoClipId],
          linkedVideoClipId: videoClipId,
          alignStartTime: video.startTime,
          alignDurationHint: video.duration,
          timelineDuration: video.duration,
          clipDuration: video.duration,
        },
      );
  if (added.status !== 'added') return added;
  return {
    ...added,
    status: 'detached',
    timeline: {
      ...added.timeline,
      clips: added.timeline.clips.map((clip) => {
        if (clip.id === videoClipId) return { ...clip, embedAudioMuted: true };
        if (clip.type !== 'audio' || clip.sourceNodeId !== audioSourceNodeId) return clip;
        return {
          ...clip,
          linkedVideoClipId: videoClipId,
          startTime: video.startTime,
          duration: video.duration,
          sourceDuration: Math.max(clip.sourceDuration || 0, durationSec),
        };
      }),
    },
    selectedClipIds: [videoClipId],
    audioSourceNodeId,
  };
}
