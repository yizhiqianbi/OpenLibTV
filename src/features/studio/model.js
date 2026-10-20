import { cloneSnapshot, createLocalId } from '../editor/model.js';
import { DEFAULT_MATERIAL } from './material.js';

export const radians = (value) => ((value || 0) * Math.PI) / 180;
const lerp = (a, b, fraction) => a.map((value, index) => value + (b[index] - value) * fraction);

export function transformAt(object, frames, time) {
  const keys = frames
    .filter((frame) => frame.objectId === object.id)
    .sort((a, b) => a.time - b.time);
  if (!keys.length) return object;
  let start = keys[0],
    end = keys.at(-1);
  for (let index = 0; index < keys.length - 1; index++) {
    if (time >= keys[index].time && time <= keys[index + 1].time) {
      start = keys[index];
      end = keys[index + 1];
      break;
    }
  }
  if (time < keys[0].time) end = start;
  if (time > keys.at(-1).time) start = end;
  const fraction =
    start.time === end.time
      ? 0
      : Math.max(0, Math.min(1, (time - start.time) / (end.time - start.time)));
  return {
    ...object,
    position: lerp(start.position, end.position, fraction),
    rotation: lerp(start.rotation, end.rotation, fraction),
    scale: lerp(start.scale, end.scale, fraction),
  };
}

export function resolveStudioRoute(path, search = '') {
  const query = new URLSearchParams(path.includes('?') ? path.split('?')[1] : search);
  const givenId = query.get('projectId') || query.get('project');
  const validEntry = !!(
    givenId ||
    query.get('newProject') === 'true' ||
    query.has('sourceShareId') ||
    query.get('mode') === 'studio'
  );
  return { query, givenId, validEntry };
}

export function createStudioObject(type, label, objects, makeId = () => createLocalId('studio')) {
  const object = {
    id: makeId(),
    name: `${label} ${objects.filter((object) => object.type === type).length + 1}`,
    type,
    position: [
      0,
      ['cube', 'sphere', 'cylinder'].includes(type) ? 0.5 : type === 'camera' ? 2 : 0,
      0,
    ],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible: true,
    color: type === 'light' ? '#fff4d2' : DEFAULT_MATERIAL.color,
  };
  if (type !== 'light') Object.assign(object, DEFAULT_MATERIAL);
  if (type === 'light')
    Object.assign(object, {
      lightType: 'point',
      intensity: 8,
      range: 12,
      angle: 45,
      penumbra: 0.1,
      castShadow: true,
    });
  return object;
}

export function createStudioKeyframe(
  object,
  time,
  changes = {},
  makeId = () => createLocalId('studio'),
) {
  return {
    id: makeId(),
    objectId: object.id,
    time: Number(time.toFixed(2)),
    position: [...object.position],
    rotation: [...object.rotation],
    scale: [...object.scale],
    ...changes,
  };
}

export function upsertStudioKeyframe(frames, keyframe, time = keyframe.time) {
  return [
    ...frames.filter(
      (frame) => !(frame.objectId === keyframe.objectId && Math.abs(frame.time - time) < 0.04),
    ),
    keyframe,
  ];
}

/** Update only an existing local keyframe; base object state remains untouched. */
export function patchStudioKeyframe(frames, { objectId, time, changes, tolerance = 0.04 } = {}) {
  if (!Array.isArray(frames) || !objectId || !Number.isFinite(time) || !changes) return frames;
  let changed = false;
  const next = frames.map((frame) => {
    if (frame.objectId !== objectId || Math.abs(frame.time - time) >= tolerance) return frame;
    changed = true;
    return {
      ...frame,
      ...Object.fromEntries(
        Object.entries(changes).filter(
          ([property, value]) =>
            ['position', 'rotation', 'scale'].includes(property) &&
            Array.isArray(value) &&
            value.length === 3 &&
            value.every(Number.isFinite),
        ),
      ),
    };
  });
  return changed ? next : frames;
}

export function duplicateStudioObject(object, makeId = () => createLocalId('studio')) {
  return {
    ...cloneSnapshot(object),
    id: makeId(),
    name: `${object.name} 副本`,
    position: [object.position[0] + 1, ...object.position.slice(1)],
  };
}

/** A copied imported subtree keeps the source GLB/path immutable. */
export function createStudioNodeCopy(row, makeId = () => createLocalId('studio-copy')) {
  if (!row?.subtree || !Array.isArray(row.path) || !row.path.length) return null;
  return {
    id: makeId(),
    sourcePath: [...row.path],
    name: `${row.name || '节点'} 副本`,
    position: [(row.position?.[0] || 0) + 1, row.position?.[1] || 0, row.position?.[2] || 0],
    rotation: Array.isArray(row.rotation) ? [...row.rotation] : [0, 0, 0],
    scale: Array.isArray(row.scale) ? [...row.scale] : [1, 1, 1],
    visible: row.visible !== false,
    edits: {},
  };
}

export function advanceStudioPlayback(time, elapsed, duration, loop) {
  const next = time + elapsed;
  return next >= duration
    ? { time: loop ? next % duration : duration, ended: !loop }
    : { time: next, ended: false };
}
