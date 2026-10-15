import {
  clipTimelinePlaybackSpeed,
  describeClipTimelineTransitions,
} from './timeline-edit-model.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Source u2 clamps to the trimmed clip and then to the actual source duration.
function sourceTime(clip, time) {
  const at = clamp(
    time,
    clip.startTime,
    Math.max(clip.startTime, clip.startTime + clip.duration - 0.001),
  );
  return clamp(
    clip.sourceOffset + (at - clip.startTime) * clipTimelinePlaybackSpeed(clip),
    0,
    Math.max(0, clip.sourceDuration - 0.001),
  );
}

/** Source f8 without timelineTime: frozen cut frames for the 1600ms tile loop. */
export function describeClipTransitionThumbnail(timeline, rightClipId) {
  const transition = describeClipTimelineTransitions(timeline).find(
    (entry) => entry.rightClipId === rightClipId,
  );
  if (!transition) return null;
  const left = timeline.clips.find((clip) => clip.id === transition.leftClipId);
  const right = timeline.clips.find((clip) => clip.id === rightClipId);
  return {
    fromSourceNodeId: left.sourceNodeId,
    fromTime: sourceTime(left, Math.max(left.startTime, transition.cutTime - 0.2)),
    toSourceNodeId: right.sourceNodeId,
    toTime: sourceTime(right, right.startTime),
  };
}

/** Source f8/ge: a centered cut with the opposite side held during each half. */
export function describeClipTransitionPlayback(timeline, time) {
  if (!Number.isFinite(time)) return null;
  const transition = describeClipTimelineTransitions(timeline).find(
    (entry) => time >= entry.startTime && time < entry.endTime,
  );
  if (!transition) return null;
  const left = timeline.clips.find((clip) => clip.id === transition.leftClipId);
  const right = timeline.clips.find((clip) => clip.id === transition.rightClipId);
  if (!left || !right) return null;
  const clock = (at) => {
    const elapsed = clamp(at - transition.startTime, 0, transition.duration);
    const half = transition.duration / 2;
    return {
      from: sourceTime(left, transition.cutTime - half + Math.min(elapsed, half)),
      to: sourceTime(right, right.startTime + Math.max(0, elapsed - half)),
    };
  };
  const current = clock(time);
  const next = clock(Math.min(transition.endTime, time + 1 / 60));
  return {
    ...transition,
    progress: clamp(
      (time - transition.startTime) / (transition.endTime - transition.startTime),
      0,
      1,
    ),
    phase: time - transition.startTime < transition.duration / 2 ? 'from' : 'to',
    from: {
      clipId: left.id,
      sourceNodeId: left.sourceNodeId,
      time: current.from,
      rate: Math.max(0, (next.from - current.from) * 60),
    },
    to: {
      clipId: right.id,
      sourceNodeId: right.sourceNodeId,
      time: current.to,
      rate: Math.max(0, (next.to - current.to) * 60),
    },
  };
}
