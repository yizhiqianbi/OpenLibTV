/** Source module 28845: finite nonnegative integer tracks, not UI geometry. */
function validTrack(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

export function getVideoTrackIndex(clip) {
  return validTrack(clip.zIndex) ?? 0;
}

export function computeVideoTrackCount(clips) {
  let maximum = -1;
  for (const clip of clips) {
    if (clip.type !== 'audio') maximum = Math.max(maximum, getVideoTrackIndex(clip));
  }
  return maximum + 1;
}

export function resolveVideoTrackCount(clips, hint) {
  const count = computeVideoTrackCount(clips);
  const validHint = validTrack(hint);
  return validHint === null ? count : Math.max(validHint, count);
}

export function getMainVideoTrackIndex(count) {
  return Math.max(0, count | 0) - 1;
}

function compressedTracks(indices) {
  return new Map([...new Set(indices)].sort((a, b) => a - b).map((value, index) => [value, index]));
}

function isIdentity(remap) {
  return [...remap].every(([before, after]) => before === after);
}

export function normalizeClipTrackZIndexes(clips, options = {}) {
  const videoIndices = clips.filter((clip) => clip.type !== 'audio').map(getVideoTrackIndex);
  const oldVideoCount = resolveVideoTrackCount(
    clips,
    validTrack(options.videoTrackCount) ?? undefined,
  );
  const mainIndex = getMainVideoTrackIndex(oldVideoCount);
  const videoRemap = compressedTracks(
    oldVideoCount > 0 ? [...videoIndices, mainIndex] : videoIndices,
  );
  const videoTrackCount = videoRemap.size;
  const audioIndices = new Map();
  clips.forEach((clip, index) => {
    if (clip.type !== 'audio') return;
    const oldGlobal = validTrack(clip.zIndex);
    audioIndices.set(
      index,
      validTrack(clip.audioTrack) ??
        (oldGlobal === null ? 0 : Math.max(0, oldGlobal - oldVideoCount)),
    );
  });
  const audioRemap = compressedTracks([...audioIndices.values()]);
  const audioChanged = !isIdentity(audioRemap);
  let changed = !isIdentity(videoRemap) || audioChanged;
  const normalized = clips.map((clip, index) => {
    const { audioTrack: _audioTrack, ...next } = clip;
    const zIndex =
      clip.type === 'audio'
        ? videoTrackCount + (audioRemap.get(audioIndices.get(index) ?? 0) ?? 0)
        : (videoRemap.get(getVideoTrackIndex(clip)) ?? 0);
    if (next.zIndex !== zIndex || Object.hasOwn(clip, 'audioTrack')) changed = true;
    return { ...next, zIndex };
  });
  return {
    clips: normalized,
    changed,
    videoTrackCount,
    audioTrackCount: audioRemap.size,
    audioTrackRemap: audioChanged ? audioRemap : null,
  };
}
