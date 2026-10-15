import { describe, expect, it } from 'vitest';
import { resolveCameraWaypointStep } from './useStudioCameras.js';

const waypoints = [
  { id: 'first', time: 0 },
  { id: 'middle', time: 3 },
  { id: 'last', time: 6 },
];

describe('resolveCameraWaypointStep', () => {
  it('moves to the nearest waypoint strictly after or before the current time', () => {
    expect(resolveCameraWaypointStep({ waypoints, time: 0, direction: 1 })?.id).toBe('middle');
    expect(resolveCameraWaypointStep({ waypoints, time: 6, direction: -1 })?.id).toBe('middle');
    expect(resolveCameraWaypointStep({ waypoints, time: 6, direction: 1 })).toBeNull();
  });

  it('uses the selected waypoint as the anchor and does not wrap at the ends', () => {
    expect(
      resolveCameraWaypointStep({ waypoints, stateId: 'middle', time: 3, direction: -1 })?.id,
    ).toBe('first');
    expect(
      resolveCameraWaypointStep({ waypoints, stateId: 'last', time: 6, direction: 1 }),
    ).toBeNull();
  });
});
