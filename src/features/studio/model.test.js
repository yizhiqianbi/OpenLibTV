// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  advanceStudioPlayback,
  createStudioObject,
  createStudioKeyframe,
  resolveStudioRoute,
  transformAt,
  upsertStudioKeyframe,
} from './model.js';

const object = { id: 'model', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
const frames = [
  { objectId: 'model', time: 4, position: [8, 4, 0], rotation: [0, 90, 0], scale: [3, 3, 3] },
  { objectId: 'other', time: 0, position: [99, 99, 99], rotation: [0, 0, 0], scale: [1, 1, 1] },
  { objectId: 'model', time: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
];

describe('studio timeline', () => {
  it('creates a source-shaped editable point light with stable local defaults', () => {
    expect(createStudioObject('light', '灯光', [])).toMatchObject({
      type: 'light',
      lightType: 'point',
      intensity: 8,
      range: 12,
      castShadow: true,
    });
  });
  it('interpolates the selected object while preserving frame order', () => {
    const result = transformAt(object, frames, 2);
    expect(result.position).toEqual([4, 2, 0]);
    expect(result.rotation).toEqual([0, 45, 0]);
    expect(result.scale).toEqual([2, 2, 2]);
    expect(frames[0].time).toBe(4);
  });

  it('clamps before/after the object animation and leaves unanimated objects alone', () => {
    expect(transformAt(object, frames, -1).position).toEqual([0, 0, 0]);
    expect(transformAt(object, frames, 8).position).toEqual([8, 4, 0]);
    expect(transformAt({ ...object, id: 'none' }, frames, 2).position).toEqual([0, 0, 0]);
  });

  it('replaces a nearby keyframe only on the same object', () => {
    const key = createStudioKeyframe(object, 0.025, {}, () => 'new');
    const result = upsertStudioKeyframe(frames, key, 0.025);
    expect(result).toHaveLength(3);
    expect(result.some((frame) => frame.objectId === 'other')).toBe(true);
    expect(result.find((frame) => frame.id === 'new').time).toBe(0.03);
    key.position[0] = 7;
    expect(object.position[0]).toBe(0);
  });

  it('wraps loop playback and stops non-loop playback at the end', () => {
    expect(advanceStudioPlayback(9.5, 1, 10, true)).toEqual({ time: 0.5, ended: false });
    expect(advanceStudioPlayback(9.5, 1, 10, false)).toEqual({ time: 10, ended: true });
  });
});

describe('studio routing', () => {
  it('accepts source share, both project keys and explicit creation', () => {
    expect(resolveStudioRoute('/animation-preview').validEntry).toBe(false);
    expect(resolveStudioRoute('/animation-preview?newProject=true').validEntry).toBe(true);
    expect(resolveStudioRoute('/animation-preview?sourceShareId=public').validEntry).toBe(true);
    expect(resolveStudioRoute('/animation-preview?project=legacy').givenId).toBe('legacy');
  });
});
