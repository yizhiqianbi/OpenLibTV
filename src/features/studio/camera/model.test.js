import { describe, expect, it } from 'vitest';
import {
  addCameraWaypoint,
  cameraAtTime,
  cameraPreviewFrame,
  cameraPathProgress,
  cameraPathSettings,
  cameraWaypointStates,
  createCameraRig,
  normalizeCameraShots,
  parseCameraTimeline,
  removeCameraWaypoint,
  trimCameraShots,
} from './model.js';
import {
  activeCameraEasingPreset,
  applyCameraPreset,
  buildCameraPreset,
  CAMERA_PRESETS,
} from './presets.js';
import { changeCameraRigEntity } from './presentation.js';

const anchor = { origin: [0, 0, 10], focus: [0, 0, 0], radius: 10 };
let id = 0;
const makeRig = () =>
  createCameraRig(
    { id: 'camera', name: 'Camera' },
    anchor.origin,
    anchor.focus,
    6,
    () => `node-${++id}`,
  );
describe('source camera paths and shots', () => {
  it('uses the exact centred eighty-percent camera frame without changing the projection aspect', () => {
    expect(cameraPreviewFrame(1000, 600, 16 / 9)).toEqual({
      left: 100,
      top: 75,
      width: 800,
      height: 450,
    });
    expect(cameraPreviewFrame(390, 844, 9 / 16)).toMatchObject({ left: 39, width: 312 });
  });
  it('wraps or clamps time before quadratic easing and folds the bounce leg', () => {
    const settings = cameraPathSettings({ duration: 4, easing: 'in' });
    expect(cameraPathProgress(settings, 1)).toBe(0.0625);
    expect(cameraPathProgress(settings, 4)).toBe(0);
    expect(cameraPathProgress(settings, 4, false)).toBe(1);
    expect(cameraPathProgress(settings, -1)).toBe(0.5625);
    expect(cameraPathProgress({ ...settings, bounce: true, easing: 'linear' }, 5, false)).toBe(
      0.75,
    );
    expect(cameraPathProgress({ ...settings, easing: 'inout' }, 3)).toBe(0.875);
  });
  it('exposes exactly the six renderer presets with their real durations and geometry', () => {
    expect(CAMERA_PRESETS.map((preset) => preset.id)).toEqual([
      'arc-right',
      'dolly-in',
      'truck-left',
      'crane-up',
      'flyover',
      'reveal-behind',
    ]);
    expect(buildCameraPreset('dolly-in', anchor).points.map((point) => point.z)).toEqual([
      16, 11, 6,
    ]);
    expect(buildCameraPreset('truck-left', anchor).points.map((point) => point.x)).toEqual([
      9, 0, -9,
    ]);
    expect(buildCameraPreset('crane-up', anchor).settings.duration).toBe(8);
    expect(buildCameraPreset('flyover', anchor).settings).toMatchObject({
      duration: 10,
      easing: 'linear',
    });
    expect(buildCameraPreset('reveal-behind', anchor).points).toHaveLength(5);
    expect(
      buildCameraPreset('dolly-in', anchor, { framing: 'close', intensity: 0.5 }).points[0].z,
    ).toBeCloseTo(9.36);
    expect(activeCameraEasingPreset('inout')).toBe('ease-in-out');
    expect(buildCameraPreset('server-only', anchor)).toBeNull();
  });
  it('inserts relative to seek, renumbers states and keeps the source minimum of two', () => {
    const rig = makeRig();
    expect(rig.settings).toMatchObject({ enabled: false, aim: 'fixed', easing: 'linear' });
    expect(rig.waypoints.map((state) => state.transform.position)).toEqual([
      anchor.origin,
      anchor.origin,
    ]);
    const added = addCameraWaypoint(rig, 5, [1, 2, 3], () => 'inserted');
    expect(added.rig.waypoints[1]).toMatchObject({ id: 'inserted', name: 'WP_2' });
    expect(cameraWaypointStates(added.rig).map((state) => state.time)).toEqual([0, 3, 6]);
    const removed = removeCameraWaypoint(added.rig, 'inserted');
    expect(removed.waypoints.map((state) => state.name)).toEqual(['WP_1', 'WP_2']);
    expect(removeCameraWaypoint(removed, removed.waypoints[0].id)).toBe(removed);
    const named = changeCameraRigEntity(rig, rig.aim.id, { name: 'NewAim' });
    expect(named.settings.targetName).toBe('NewAim');
    expect(applyCameraPreset(rig, 'dolly-in').waypoints).toHaveLength(3);
  });
  it('normalizes simultaneous cameras and picks the latest-start shot or preceding gap', () => {
    const shots = normalizeCameraShots(
      [
        { cameraId: 'a', start: 0, end: 8 },
        { cameraId: 'b', start: 0, end: 8 },
        { cameraId: 'c', start: 6, end: 10 },
      ],
      10,
    );
    expect(shots).toEqual([
      { cameraId: 'a', start: 0, end: 3 },
      { cameraId: 'b', start: 3, end: 6 },
      { cameraId: 'c', start: 6, end: 10 },
    ]);
    expect(cameraAtTime(shots, 3, 10)).toBe('b');
    expect(
      cameraAtTime(
        [
          { cameraId: 'a', start: 2, end: 3 },
          { cameraId: 'b', start: 6, end: 8 },
        ],
        5,
        10,
      ),
    ).toBe('a');
    expect(cameraAtTime(shots, 100, 10)).toBe('c');
  });
  it('moves contiguous boundaries together and validates the stable-ID timeline envelope', () => {
    const shots = [
      { cameraId: 'a', start: 0, end: 3 },
      { cameraId: 'b', start: 3, end: 6 },
    ];
    expect(trimCameraShots(shots, 0, 'end', 4, 6)).toEqual([
      { cameraId: 'a', start: 0, end: 4 },
      { cameraId: 'b', start: 4, end: 6 },
    ]);
    expect(trimCameraShots(shots, 1, 'start', -5, 6)[0].end).toBe(0.1);
    const data = { version: 1, duration: 6, shots };
    expect(parseCameraTimeline(JSON.stringify(data))).toEqual(data);
    expect(
      parseCameraTimeline({ ...data, shots: [{ ...shots[0], cameraId: '../bad' }] }),
    ).toBeNull();
    expect(parseCameraTimeline({ ...data, duration: 601 })).toBeNull();
    expect(parseCameraTimeline({ ...data, shots: [{ ...shots[0], end: 4 }, shots[1]] })).toBeNull();
    expect(shots[0].end).toBe(3);
  });
});
