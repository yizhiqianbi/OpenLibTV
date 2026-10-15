import { getVideoTrackIndex, resolveVideoTrackCount } from '../../clip-disconnect/track-model.js';
import { clipTimelinePlaybackSpeed } from './timeline-edit-model.js';
import { describeClipTransitionPlayback } from './transition-playback-model.js';
import {
  clipAudioPlaybackDbForPosition,
  clipAudioFaderPosition,
  CLIP_AUDIO_FADER_MAX_DB,
  CLIP_AUDIO_PLAYBACK_LINEAR_MAX,
} from './audio-gain-model.js';

/** Source C(clip); independent of global volume, track mute and audio readiness. */
export function clipGainForPlayback(clip) {
  const value = clipAudioPlaybackDbForPosition(clipAudioFaderPosition(clip));
  if (value <= -500) return 0;
  return value <= 0
    ? Math.pow(10, value / 20)
    : 1 +
        (Math.min(Math.max(value, 0), CLIP_AUDIO_FADER_MAX_DB) / CLIP_AUDIO_FADER_MAX_DB) *
          (CLIP_AUDIO_PLAYBACK_LINEAR_MAX - 1);
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Original740349: uniform scale, no skew/rotation; translation is output pixels. */
export function normalizeClipTransform(transform) {
  if (!Array.isArray(transform) || !Array.isArray(transform[0]) || !Array.isArray(transform[1]))
    return [
      [1, 0, 0],
      [0, 1, 0],
    ];
  const scale = Math.min(
    10,
    Math.max(0.05, finiteNumber(transform[0][0]) ?? finiteNumber(transform[1][1]) ?? 1),
  );
  return [
    [scale, 0, finiteNumber(transform[0][2]) ?? 0],
    [0, scale, finiteNumber(transform[1][2]) ?? 0],
  ];
}

function validTrack(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function audioTrackIndex(clip, videoTrackCount) {
  const global = validTrack(clip.zIndex);
  return global !== null
    ? Math.max(0, global - Math.max(0, videoTrackCount | 0))
    : (validTrack(clip.audioTrack) ?? 0);
}

function trackMuted(values, global, index) {
  return values != null && values.length > 0 ? (values[index] ?? false) : (global ?? false);
}

function positiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function contentFitRect(clip, outputSize) {
  if (!positiveFinite(clip.width) || !positiveFinite(clip.height)) return null;
  const width =
    positiveFinite(outputSize?.width) && positiveFinite(outputSize?.height)
      ? outputSize.width
      : clip.width;
  const height =
    positiveFinite(outputSize?.width) && positiveFinite(outputSize?.height)
      ? outputSize.height
      : clip.height;
  if (clip.width / clip.height <= width / height) {
    const fittedWidth = Math.round((height * clip.width) / clip.height);
    return { dx: Math.round((width - fittedWidth) / 2), dy: 0, dw: fittedWidth, dh: height };
  }
  const fittedHeight = Math.round((width * clip.height) / clip.width);
  return { dx: 0, dy: Math.round((height - fittedHeight) / 2), dw: width, dh: fittedHeight };
}

function knownAudioValue(knownVideoAudio, assetId) {
  return knownVideoAudio instanceof Map ? knownVideoAudio.get(assetId) : knownVideoAudio?.[assetId];
}

function describeClip(clip, timeline, time, videoTrackCount, options) {
  const isAudio = clip.type === 'audio';
  const trackIndex = isAudio ? audioTrackIndex(clip, videoTrackCount) : getVideoTrackIndex(clip);
  const hidden =
    (isAudio ? timeline.audioTrackHiddenPerTrack : timeline.videoTrackHiddenPerTrack)?.[
      trackIndex
    ] === true;
  const trackMute = isAudio
    ? trackMuted(timeline.audioTrackMutedPerTrack, timeline.audioTrackMuted, trackIndex)
    : trackMuted(timeline.videoAudioMutedPerTrack, timeline.videoAudioMuted, trackIndex);
  const muted = !!(
    hidden ||
    trackMute ||
    (!isAudio && clip.embedAudioMuted === true) ||
    options.audioOutputSuppressed
  );
  const speed = clipTimelinePlaybackSpeed(clip);
  const clipGain = clipGainForPlayback(clip);
  const globalVolume = Math.max(
    0,
    Math.min(1, (isAudio ? timeline.audioTrackVolume : timeline.videoAudioVolume) ?? 1),
  );
  const audioEligible =
    !muted &&
    globalVolume > 0 &&
    clipGain > 0 &&
    (isAudio || knownAudioValue(options.knownVideoAudio, clip.assetId) !== false);
  return {
    clip,
    id: clip.id,
    sourceNodeId: clip.sourceNodeId,
    assetId: clip.assetId,
    trackIndex,
    speed,
    sourceTime: clip.sourceOffset + (time - clip.startTime) * speed,
    nativePlaybackRate: Math.min(16, Math.max(0.0625, speed)),
    nativeRateSupported: speed <= 16,
    clipGain,
    globalVolume,
    gain: muted ? 0 : globalVolume * clipGain,
    muted,
    hidden,
    audioEligible,
    transform: isAudio ? null : normalizeClipTransform(clip.transform),
    maskShape: !isAudio && clip.maskShape === 'circle' ? 'circle' : undefined,
    contentFitRect: isAudio ? null : contentFitRect(clip, options.outputSize),
    ...(isAudio && clip.linkedVideoClipId != null
      ? { linkedVideoClipId: clip.linkedVideoClipId }
      : {}),
  };
}

function unsupportedFlags(
  timeline,
  time,
  descriptors,
  outputSize,
  overlayHtmlSupported,
  htmlSubtitlesSupported,
) {
  const flags = new Set();
  if (!Number.isFinite(time)) flags.add('invalid-playhead');
  if (outputSize && (!positiveFinite(outputSize.width) || !positiveFinite(outputSize.height)))
    flags.add('invalid-output-size');
  if (
    timeline.subtitles &&
    (!Array.isArray(timeline.subtitles.cues) ||
      timeline.subtitles.cues.some(
        (cue) => !Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime),
      ))
  )
    flags.add('subtitle-vtt');
  if (
    !htmlSubtitlesSupported &&
    ((timeline.subtitlesHtml && Object.keys(timeline.subtitlesHtml).length) ||
      descriptors.some(({ clip }) => clip.subtitleHtmlUrl))
  )
    flags.add('subtitle-html');
  if ((timeline.overlayHtmlUrl || timeline.overlayHtmlInline) && !overlayHtmlSupported)
    flags.add('overlay-html');
  if (descriptors.some(({ clip }) => clip.transition) || timeline.transitions?.length)
    flags.add('transition-preview');
  for (const descriptor of descriptors) {
    const { clip } = descriptor;
    if (!descriptor.nativeRateSupported) flags.add('native-high-speed');
    if (!Number.isFinite(descriptor.gain)) flags.add('invalid-audio-gain');
    if (
      !Number.isFinite(clip.startTime) ||
      !Number.isFinite(clip.duration) ||
      clip.duration <= 0 ||
      !Number.isFinite(clip.sourceOffset)
    )
      flags.add('invalid-clip-clock');
    if (clip.type !== 'audio' && !descriptor.contentFitRect) flags.add('unknown-media-size');
    if (clip.type !== 'audio' && clip.type !== undefined && clip.type !== 'video')
      flags.add('unsupported-clip-type');
    if (clip.maskShape && clip.maskShape !== 'circle') flags.add('unsupported-mask-shape');
  }
  return [...flags];
}

/**
 * Source28845 +eq describes currently visible layers and one Audio per track.
 * Browser readiness/frame decode/WebAudio ownership belongs to the caller.
 * Capability flags identify fields this base preview does not render; clip-level
 * subtitleUrl is rendered by the runtime's native track and is therefore not
 * reported as unsupported. No document field is changed or discarded when an
 * unsupported feature exists.
 */
export function describeClipTimelinePlayback(timeline, time, options = {}) {
  const { outputSize, knownVideoAudio, audioOutputSuppressed = false } = options;
  const includeEnd = options.includeEnd ?? true;
  const clips = timeline.clips ?? [];
  const videoTrackCount = resolveVideoTrackCount(clips, timeline.videoTrackCount);
  const audioTrackCount =
    clips.reduce(
      (maximum, clip) =>
        clip.type === 'audio' ? Math.max(maximum, audioTrackIndex(clip, videoTrackCount)) : maximum,
      -1,
    ) + 1;
  const activeVideos = clips
    .filter(
      (clip) =>
        clip.type !== 'audio' &&
        timeline.videoTrackHiddenPerTrack?.[getVideoTrackIndex(clip)] !== true &&
        !(
          time < clip.startTime ||
          (includeEnd
            ? time > clip.startTime + clip.duration
            : time >= clip.startTime + clip.duration)
        ),
    )
    .sort(
      (a, b) =>
        getVideoTrackIndex(b) - getVideoTrackIndex(a) ||
        a.startTime - b.startTime ||
        (a.id ?? '').localeCompare(b.id ?? ''),
    );
  const activeAudios = [];
  for (let index = 0; index < audioTrackCount; index++) {
    if (timeline.audioTrackHiddenPerTrack?.[index] === true) continue;
    const clip = clips.find(
      (clip) =>
        clip.type === 'audio' &&
        audioTrackIndex(clip, videoTrackCount) === index &&
        time >= clip.startTime &&
        time < clip.startTime + clip.duration,
    );
    if (clip) activeAudios.push(clip);
  }
  const descriptorOptions = { outputSize, knownVideoAudio, audioOutputSuppressed };
  const videos = activeVideos.map((clip) =>
    describeClip(clip, timeline, time, videoTrackCount, descriptorOptions),
  );
  const audios = activeAudios.map((clip) =>
    describeClip(clip, timeline, time, videoTrackCount, descriptorOptions),
  );
  return {
    time,
    videoTrackCount,
    audioTrackCount,
    activeVideos: videos,
    activeAudios: audios,
    transition: describeClipTransitionPlayback(timeline, time),
    unsupportedFlags: unsupportedFlags(
      timeline,
      time,
      [...videos, ...audios],
      outputSize,
      options.overlayHtmlSupported,
      options.htmlSubtitlesSupported,
    ),
  };
}
