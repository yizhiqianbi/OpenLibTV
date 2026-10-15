import { describe, expect, it } from 'vitest';
import { describeTransitionInspectorStyle } from './transition-inspector-model.js';
import { clipTransitionInspectorDuration } from './timeline-edit-model.js';

describe('source inspector composition and duration rules', () => {
  it('crossfades both DOM layers and uses the symmetric black/white overlay', () => {
    expect(describeTransitionInspectorStyle('fade', 0.5)).toMatchObject({
      fromOpacity: 0.5,
      toOpacity: 0.5,
      fillOpacity: 0,
      toMask: '',
    });
    expect(describeTransitionInspectorStyle('fadeblack', 0.5)).toMatchObject({
      fromOpacity: 0,
      toOpacity: 1,
      fillOpacity: 1,
      fillColor: '#000',
    });
    expect(describeTransitionInspectorStyle('fadewhite', 0.25)).toMatchObject({
      fromOpacity: 1,
      toOpacity: 0,
      fillOpacity: 0.5,
      fillColor: '#fff',
    });
  });
  it('uses deterministic SVG cell masks with separate revealed and burn regions', () => {
    const svg = (value) => decodeURIComponent(value.slice(5, -2));
    const start = describeTransitionInspectorStyle('dissolve', 0);
    const half = describeTransitionInspectorStyle('dissolve', 0.5);
    const end = describeTransitionInspectorStyle('dissolve', 1);
    expect(svg(start.toMask)).not.toContain('<rect');
    expect(svg(end.toMask).match(/<rect/g) || []).toHaveLength(576);
    expect(svg(end.burnMask)).not.toContain('<rect');
    expect(half).toEqual(describeTransitionInspectorStyle('dissolve', 0.5));
    expect(svg(half.burnMask)).toContain('width="3.125" height="5.556"');
    expect(half.fromOpacity).toBe(1);
    expect(half.toOpacity).toBe(1);
  });
  it('rounds before applying the positive default, then clamps to adjacent clips', () => {
    for (const value of [0, -1, NaN, Infinity, 0.04])
      expect(clipTransitionInspectorDuration(value, 6)).toBe(2);
    expect(clipTransitionInspectorDuration(0.1, 6)).toBe(0.2);
    expect(clipTransitionInspectorDuration(0.86, 6)).toBe(0.9);
    expect(clipTransitionInspectorDuration(99, 6)).toBe(6);
    expect(clipTransitionInspectorDuration(0, 0.6)).toBe(0.6);
  });
});
