/** Serializable clip metadata; animation keyframes remain in the original GLB source. */
// The source preview timeline accepts these discrete playback rates. Keep the
// values in the model so every timeline surface exposes the same contract.
export const STUDIO_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

export function animationMetadata(clips = []) {
  return clips.map((clip, index) => ({
    index,
    name: clip.name || `Clip ${index + 1}`,
    duration: Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0,
  }));
}

export function importedClipTracks(objects) {
  return objects.flatMap((object) =>
    (Array.isArray(object.clips) ? object.clips : []).map((clip, index) => ({
      objectId: object.id,
      index,
      name: clip.name || `Clip ${index + 1}`,
      duration: Number.isFinite(clip.duration) ? Math.max(0, clip.duration) : 0,
    })),
  );
}

export const sameClip = (first, second) =>
  !!first && !!second && first.objectId === second.objectId && first.index === second.index;

export function restoreStudioPlayback(document) {
  const duration =
    Number.isFinite(document?.duration) && document.duration > 0 ? document.duration : 10;
  const selection = document?.animationSelection;
  return {
    time: Number.isFinite(document?.time) ? Math.max(0, Math.min(duration, document.time)) : 0,
    animationSelection: importedClipTracks(document?.objects || []).some((clip) =>
      sameClip(clip, selection),
    )
      ? { objectId: selection.objectId, index: selection.index }
      : null,
  };
}
