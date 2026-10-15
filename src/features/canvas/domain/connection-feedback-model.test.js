import { describe, expect, it } from 'vitest';
import {
  canvasNodeConnectionFeedback,
  canvasNodeConnectionTilt,
} from './connection-feedback-model.js';

const source = { nodeId: 'b', active: true, hovered: true, originIds: ['a'], edges: [] };
const expected = {
  isDraggingConnection: true,
  isConnectionTarget: true,
  isConnectionBlocked: false,
  isConnectionInvalid: false,
};

describe('source node hover connection feedback', () => {
  it('shows eligibility on physical body hover independently of snapped validation', () => {
    expect(canvasNodeConnectionFeedback(source)).toEqual(expected);
    expect(canvasNodeConnectionFeedback({ ...source, invalidTargetId: 'c' })).toEqual(expected);
  });
  it.each([{ active: false }, { frozen: true }, { hovered: false }])(
    'does not add hover feedback for %j',
    (patch) => {
      const value = canvasNodeConnectionFeedback({ ...source, ...patch });
      expect(value.isConnectionTarget).toBe(false);
      expect(value.isConnectionBlocked).toBe(false);
      expect(value.isConnectionInvalid).toBe(false);
    },
  );
  it('marks only the explicitly invalid hovered target and keeps this separate from blocked', () => {
    expect(canvasNodeConnectionFeedback({ ...source, invalidTargetId: 'b' })).toEqual({
      ...expected,
      isConnectionTarget: false,
      isConnectionInvalid: true,
    });
  });
  it.each([
    { nodeId: 'a', invalidTargetId: 'a' },
    { edges: [{ source: 'a', target: 'b' }], invalidTargetId: 'b' },
    { edges: [{ source: 'b', target: 'a', data: { reference: true } }], invalidTargetId: 'b' },
    { originIds: ['c', 'a'], edges: [{ source: 'b', target: 'c' }] },
  ])('gives origin and bidirectional existing edges priority over invalid %j', (patch) => {
    expect(canvasNodeConnectionFeedback({ ...source, ...patch })).toEqual({
      ...expected,
      isConnectionTarget: false,
      isConnectionBlocked: true,
    });
  });
  it('does not treat transitive connections as directly connected', () => {
    expect(
      canvasNodeConnectionFeedback({
        ...source,
        edges: [
          { source: 'a', target: 'c' },
          { source: 'c', target: 'b' },
        ],
      }),
    ).toEqual(expected);
  });
});

describe('source screen-space tilt', () => {
  const bounds = { left: 100, top: 50, width: 200, height: 100 };
  it('keeps center flat and uses opposite vertical and matching horizontal ±8 degrees', () => {
    expect(canvasNodeConnectionTilt({ x: 200, y: 100 }, bounds)).toEqual({ x: -0, y: 0 });
    expect(canvasNodeConnectionTilt({ x: 100, y: 50 }, bounds)).toEqual({ x: 8, y: -8 });
    expect(canvasNodeConnectionTilt({ x: 300, y: 150 }, bounds)).toEqual({ x: -8, y: 8 });
    expect(canvasNodeConnectionTilt({ x: -100, y: 1000 }, bounds)).toEqual({ x: -8, y: -8 });
  });
  it('uses the actual displayed rectangle rather than a world-space width', () => {
    expect(
      canvasNodeConnectionTilt({ x: 150, y: 75 }, { ...bounds, width: 100, height: 50 }),
    ).toEqual({ x: -0, y: 0 });
  });
  it.each([
    [null, bounds],
    [{ x: NaN, y: 20 }, bounds],
    [{ x: 10, y: Infinity }, bounds],
    [
      { x: 10, y: 20 },
      { ...bounds, width: 0 },
    ],
    [
      { x: 10, y: 20 },
      { ...bounds, height: -1 },
    ],
    [
      { x: 10, y: 20 },
      { ...bounds, left: undefined },
    ],
  ])('ignores unreadable displayed geometry %j %j', (point, rect) => {
    expect(canvasNodeConnectionTilt(point, rect)).toBeNull();
  });
});
