import { createLocalId } from '../../editor/model.js';

export const CAMERA_PATH_DEFAULTS = {
  enabled: true,
  curve: 'centripetal',
  tension: 0.5,
  closed: false,
  aim: 'tangent',
  targetName: null,
  duration: 6,
  easing: 'inout',
  bounce: false,
  roll: 0,
  presetId: null,
  intensity: 1,
  framing: 'medium',
  speed: 1,
};
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const finite = (value, fallback) => (Number.isFinite(value) ? value : fallback);
export const identityTransform = () => ({
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
export function cameraPathSettings(value = {}) {
  const defaults = CAMERA_PATH_DEFAULTS;
  return {
    ...defaults,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
    curve: ['centripetal', 'chordal', 'catmullrom'].includes(value.curve)
      ? value.curve
      : defaults.curve,
    tension: clamp(finite(value.tension, defaults.tension), 0, 1),
    closed: typeof value.closed === 'boolean' ? value.closed : defaults.closed,
    aim: ['tangent', 'target', 'fixed'].includes(value.aim) ? value.aim : defaults.aim,
    targetName: typeof value.targetName === 'string' && value.targetName ? value.targetName : null,
    duration: Math.max(finite(value.duration, defaults.duration), 0.1),
    easing: ['linear', 'in', 'out', 'inout'].includes(value.easing)
      ? value.easing
      : defaults.easing,
    bounce: typeof value.bounce === 'boolean' ? value.bounce : defaults.bounce,
    roll: finite(value.roll, defaults.roll),
    presetId: typeof value.presetId === 'string' && value.presetId ? value.presetId : null,
    intensity: clamp(finite(value.intensity, defaults.intensity), 0.25, 2),
    framing: ['close', 'medium', 'wide'].includes(value.framing) ? value.framing : defaults.framing,
    speed: finite(value.speed, defaults.speed),
  };
}
export const cameraPathSpan = (settings) =>
  Math.max(settings.duration, 0.1) * (settings.bounce ? 2 : 1);

/** Source eal keeps a centred camera preview at eighty percent of its fitted frame. */
export function cameraPreviewFrame(width, height, aspect) {
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : width / height;
  const frameWidth = 0.8 * Math.min(width, height * ratio),
    frameHeight = frameWidth / ratio;
  return {
    left: (width - frameWidth) / 2,
    top: (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}
/** Source eoK: quadratic easing after bounce and wrapped/clamped path progress. */
export function cameraPathProgress(settings, time, loop = true) {
  const duration = Math.max(settings.duration, 0.1),
    span = cameraPathSpan(settings);
  const fraction = (loop ? ((time % span) + span) % span : clamp(time, 0, span)) / duration;
  const value = clamp(settings.bounce && fraction > 1 ? 2 - fraction : Math.min(fraction, 1), 0, 1);
  return settings.easing === 'in'
    ? value * value
    : settings.easing === 'out'
      ? 1 - (1 - value) * (1 - value)
      : settings.easing === 'inout'
        ? value < 0.5
          ? 2 * value * value
          : 1 - (-2 * value + 2) ** 2 / 2
        : value;
}
export const cameraWaypointStates = (rig) =>
  rig.waypoints.map((waypoint, index) => ({
    ...waypoint,
    index,
    time: (cameraPathSpan(rig.settings) * index) / Math.max(rig.waypoints.length - 1, 1),
  }));

/** Source creates two coincident waypoints for a previously static shot. */
export function createCameraRig(
  camera,
  origin,
  focus,
  duration = 6,
  makeId = () => createLocalId('camera'),
) {
  const anchor = {
    origin: [...origin],
    focus: [...focus],
    radius: Math.hypot(...origin.map((value, i) => value - focus[i])) || 1,
  };
  const entity = (name, position) => ({
    id: makeId(),
    name,
    transform: { ...identityTransform(), position: [...position] },
  });
  const aim = entity(`Aim_${camera.name}`, focus);
  return {
    ...entity(`Path_${camera.name}`, [0, 0, 0]),
    cameraId: camera.id,
    settings: cameraPathSettings({
      enabled: false,
      aim: 'fixed',
      targetName: aim.name,
      duration,
      easing: 'linear',
    }),
    anchor,
    waypoints: [entity('WP_1', origin), entity('WP_2', origin)],
    aim,
    focus: entity(`Focus_${camera.name}`, [0, 0, 0]),
    focusParent: 'aim',
    bake: true,
  };
}
export function addCameraWaypoint(rig, time, position, makeId = () => createLocalId('waypoint')) {
  const count = rig.waypoints.length;
  const index =
    count <= 1
      ? Math.max(count, 0)
      : clamp(
          Math.round(clamp(time / cameraPathSpan(rig.settings), 0, 1) * (count - 1)),
          1,
          count - 1,
        );
  const waypoint = {
    id: makeId(),
    name: '',
    transform: { ...identityTransform(), position: [...position] },
  };
  const waypoints = [...rig.waypoints];
  waypoints.splice(index, 0, waypoint);
  return {
    rig: {
      ...rig,
      bake: true,
      waypoints: waypoints.map((item, i) => ({ ...item, name: `WP_${i + 1}` })),
    },
    id: waypoint.id,
  };
}
export function removeCameraWaypoint(rig, id) {
  if (rig.waypoints.length <= 2 || !rig.waypoints.some((item) => item.id === id)) return rig;
  return {
    ...rig,
    bake: true,
    waypoints: rig.waypoints
      .filter((item) => item.id !== id)
      .map((item, i) => ({ ...item, name: `WP_${i + 1}` })),
  };
}

/** Source eib evenly divides concurrent camera clip intervals before the next start. */
export function normalizeCameraShots(shots, duration) {
  if (!shots.length) return [];
  const sorted = [...shots].sort((a, b) => a.start - b.start || a.end - b.end);
  const end = sorted.reduce((value, shot) => Math.max(value, shot.end), Math.max(duration, 0));
  const groups = [];
  for (const shot of sorted) {
    const group = groups.at(-1);
    if (group && Math.abs(group[0].start - shot.start) <= 0.001) group.push(shot);
    else groups.push([shot]);
  }
  return groups
    .flatMap((group, i) => {
      const start = group[0].start;
      const finish = Math.max(
        Math.min(Math.max(...group.map((shot) => shot.end)), groups[i + 1]?.[0].start ?? end),
        start,
      );
      const interval = (finish - start) / group.length;
      return group.map((shot, j) => ({
        cameraId: shot.cameraId,
        start: start + j * interval,
        end: j === group.length - 1 ? finish : start + (j + 1) * interval,
      }));
    })
    .filter((shot) => shot.end > shot.start);
}
export function cameraAtTime(shots, time, duration) {
  if (!shots.length) return null;
  const value = duration > 0 ? clamp(time, 0, duration) : Math.max(time, 0);
  let first = shots[0],
    previous = null,
    current = null;
  for (const shot of shots) {
    if (shot.start < first.start) first = shot;
    if (shot.start <= value && (!previous || shot.start > previous.start)) previous = shot;
    if (
      value >= shot.start &&
      value <= shot.end &&
      (!current ||
        shot.start > current.start ||
        (shot.start === current.start && shot.end < current.end))
    )
      current = shot;
  }
  return current?.cameraId ?? previous?.cameraId ?? first.cameraId;
}
export function trimCameraShots(shots, index, edge, value, duration) {
  if (!shots[index] || !Number.isFinite(value)) return shots;
  const next = shots.map((shot) => ({ ...shot }));
  const shot = next[index];
  if (edge === 'start') {
    const previous = next[index - 1];
    const start = clamp(value, previous ? previous.start + 0.1 : 0, shot.end - 0.1);
    if (previous)
      previous.end =
        Math.abs(previous.end - shot.start) <= 0.001 ? start : Math.min(previous.end, start);
    shot.start = start;
  } else {
    const following = next[index + 1];
    const end = clamp(
      value,
      shot.start + 0.1,
      following ? following.end - 0.1 : Math.max(duration, shot.end),
    );
    if (following)
      following.start =
        Math.abs(following.start - shot.end) <= 0.001 ? end : Math.max(following.start, end);
    shot.end = end;
  }
  return next;
}
export function parseCameraTimeline(value) {
  if (typeof value === 'string') {
    try {
      return parseCameraTimeline(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (
    !value ||
    value.version !== 1 ||
    !Number.isFinite(value.duration) ||
    value.duration < 0 ||
    value.duration > 600 ||
    !Array.isArray(value.shots) ||
    value.shots.length > 256
  )
    return null;
  const shots = [];
  for (const shot of value.shots) {
    if (
      !shot ||
      typeof shot.cameraId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(shot.cameraId) ||
      !Number.isFinite(shot.start) ||
      !Number.isFinite(shot.end) ||
      shot.start < (shots.at(-1)?.end ?? 0) ||
      shot.end <= shot.start ||
      shot.end > value.duration
    )
      return null;
    shots.push({ cameraId: shot.cameraId, start: shot.start, end: shot.end });
  }
  return { version: 1, duration: value.duration, shots };
}
