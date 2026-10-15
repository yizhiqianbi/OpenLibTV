export const PLAYBACK_RATES = [2, 1.5, 1, 0.75];
export const PLAYER_PREFERENCE_KEY = 'libtv-academy-player-preference';

export function normalizePreferences(value) {
  return {
    rate: PLAYBACK_RATES.includes(value?.rate) ? value.rate : 1,
    qualityHeight:
      Number.isFinite(value?.qualityHeight) && value.qualityHeight > 0 ? value.qualityHeight : null,
  };
}

export function normalizeQualities(qualities = []) {
  return qualities
    .filter((quality) => quality.url)
    .map((quality, index) => ({
      ...quality,
      index,
      height: Number(quality.height) || Number.parseInt(quality.label, 10) || null,
      label:
        quality.label ||
        (quality.height ? `${quality.height}P` : quality.name || `清晰度 ${index + 1}`),
    }));
}

export function selectQuality(qualities, height, defaultUrl) {
  return (
    qualities.find((quality) => quality.height === height) ||
    qualities.find((quality) => quality.url === defaultUrl) ||
    qualities[0] || { url: defaultUrl, label: '自动', height: null }
  );
}

export function playbackPosition(value, duration) {
  return Math.min(
    Math.max(0, Number.isFinite(value) ? value : 0),
    Number.isFinite(duration) ? Math.max(0, duration) : 0,
  );
}

export function resumePosition(value, duration) {
  return value > 0 && value < duration - 1 ? value : 0;
}

export function crossedMarker(markers, previous, current, consumed) {
  const delta = current - previous;
  if (delta <= 0 || delta > 1.5) return -1;
  return markers.findIndex(
    (marker, index) =>
      !consumed.has(index) &&
      previous < Math.max(marker.timeSec, 1) &&
      current >= Math.max(marker.timeSec, 1),
  );
}

export function playerShortcutAllowed(target) {
  return (
    target instanceof Element &&
    !target.closest(
      'input,textarea,select,button,a,[contenteditable="true"],[role="dialog"],.modal-overlay,.cv-modal-overlay',
    )
  );
}

export function formatPlayerTime(seconds) {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const tail = String(value % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}
