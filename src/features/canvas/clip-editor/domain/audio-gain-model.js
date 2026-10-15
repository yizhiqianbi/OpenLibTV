// Source 613429/123721 fader constants.  The clip editor stores a linear
// slider position in the UI but persists the source-compatible decibel value
// on each clip.  Keeping the conversion here lets the timeline gesture and
// playback share one curve without manufacturing an audio waveform.
export const CLIP_AUDIO_FADER_MIN_DB = -60;
export const CLIP_AUDIO_FADER_MAX_DB = 20;
export const CLIP_AUDIO_FADER_MUTE_ZONE = 0.02;
export const CLIP_AUDIO_FADER_ZERO_DB_POSITION = 0.3;
export const CLIP_AUDIO_PLAYBACK_LINEAR_MAX = 5;

const faderCurve = (() => {
  const position =
    (CLIP_AUDIO_FADER_ZERO_DB_POSITION - CLIP_AUDIO_FADER_MUTE_ZONE) /
    (1 - CLIP_AUDIO_FADER_MUTE_ZONE);
  const ratio = -CLIP_AUDIO_FADER_MIN_DB / (CLIP_AUDIO_FADER_MAX_DB - CLIP_AUDIO_FADER_MIN_DB);
  let low = 1e-9;
  let high = 1e15;
  for (let index = 0; index < 64; index += 1) {
    const middle = Math.sqrt(low * high);
    if (Math.log(1 + middle * position) / Math.log(1 + middle) < ratio) low = middle;
    else high = middle;
  }
  return Math.sqrt(low * high);
})();

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clipAudioFaderPositionForDb(decibel) {
  if (decibel <= CLIP_AUDIO_FADER_MIN_DB) return CLIP_AUDIO_FADER_MUTE_ZONE;
  if (decibel >= CLIP_AUDIO_FADER_MAX_DB) return 1;
  return (
    CLIP_AUDIO_FADER_MUTE_ZONE +
    ((Math.pow(
      1 + faderCurve,
      (decibel - CLIP_AUDIO_FADER_MIN_DB) / (CLIP_AUDIO_FADER_MAX_DB - CLIP_AUDIO_FADER_MIN_DB),
    ) -
      1) /
      faderCurve) *
      (1 - CLIP_AUDIO_FADER_MUTE_ZONE)
  );
}

export function clipAudioFaderDbForPosition(position) {
  const value = clamp(position, 0, 1);
  if (Number.isNaN(value)) return Number.NaN;
  if (value <= CLIP_AUDIO_FADER_MUTE_ZONE) return CLIP_AUDIO_FADER_MIN_DB;
  return clamp(
    CLIP_AUDIO_FADER_MIN_DB +
      (CLIP_AUDIO_FADER_MAX_DB - CLIP_AUDIO_FADER_MIN_DB) *
        (Math.log(
          1 +
            ((value - CLIP_AUDIO_FADER_MUTE_ZONE) / (1 - CLIP_AUDIO_FADER_MUTE_ZONE)) * faderCurve,
        ) /
          Math.log(1 + faderCurve)),
    CLIP_AUDIO_FADER_MIN_DB,
    CLIP_AUDIO_FADER_MAX_DB,
  );
}

/** Playback keeps the source's -1000 mute sentinel; persisted edits use -60 dB. */
export function clipAudioPlaybackDbForPosition(position) {
  if (position <= CLIP_AUDIO_FADER_MUTE_ZONE) return -1000;
  return clipAudioFaderDbForPosition(position);
}

export function clipAudioFaderPosition(clip = {}) {
  const decibel = clip.decibel ?? clip.audioFaderDb;
  if (decibel != null && Number.isFinite(decibel))
    return clipAudioFaderPositionForDb(
      clamp(decibel, CLIP_AUDIO_FADER_MIN_DB, CLIP_AUDIO_FADER_MAX_DB),
    );
  if (clip.audioFaderT != null) {
    if (Number.isNaN(clip.audioFaderT)) return Number.NaN;
    if (Number.isFinite(clip.audioFaderT)) return clamp(clip.audioFaderT, 0, 1);
  }
  if (clip.audioVolume != null && clip.audioVolume > 0 && Number.isFinite(clip.audioVolume))
    return clipAudioFaderPositionForDb(
      clamp(
        20 * Math.log10(Math.max(1e-8, clip.audioVolume)),
        CLIP_AUDIO_FADER_MIN_DB,
        CLIP_AUDIO_FADER_MAX_DB,
      ),
    );
  return CLIP_AUDIO_FADER_ZERO_DB_POSITION;
}
