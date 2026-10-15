import { describe, expect, it } from 'vitest';
import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  canvasTouchMoved,
  canvasTouchPosition,
  createCanvasTouchPoint,
  projectCanvasTouchView,
  rebaseCanvasTouchPoint,
} from './touch-view-model.js';

const view = { x: 30, y: 40, z: 0.5 };
const point = (id, position) => createCanvasTouchPoint(id, position, view);

describe('canvas native touch projection', () => {
  it('normalizes client coordinates against the actual board bounds', () => {
    expect(canvasTouchPosition({ clientX: 100, clientY: 90 }, { left: 20, top: 30 })).toEqual({
      x: 80,
      y: 60,
    });
    expect(canvasTouchPosition({ clientX: Infinity, clientY: 10 }, { left: 0, top: 0 })).toBeNull();
  });
  it('keeps the world anchor under a moving single finger without changing scale', () => {
    const active = point(1, { x: 100, y: 100 });
    active.position = { x: 120, y: 130 };
    expect(projectCanvasTouchView(view, [active])).toEqual({ x: 50, y: 70, z: 0.5 });
  });
  it('combines pinch scale with movement of the current two-finger midpoint', () => {
    const left = point(1, { x: 100, y: 100 });
    const right = point(2, { x: 200, y: 100 });
    left.position = { x: 130, y: 150 };
    right.position = { x: 330, y: 150 };
    const next = projectCanvasTouchView(view, [left, right]);
    expect(next).toEqual({ x: -10, y: 30, z: 1 });
    expect((230 - next.x) / next.z).toBe((left.anchor.x + right.anchor.x) / 2);
    expect((150 - next.y) / next.z).toBe((left.anchor.y + right.anchor.y) / 2);
  });
  it.each([
    [0, CANVAS_ZOOM_MIN],
    [10000, CANVAS_ZOOM_MAX],
  ])(
    'clamps a %s pixel pinch to the shared source extent %s while retaining its midpoint',
    (x, z) => {
      const left = point(1, { x: 100, y: 100 });
      const right = point(2, { x: 200, y: 100 });
      right.position = { x: 100 + x, y: 100 };
      const next = projectCanvasTouchView(view, [left, right]);
      expect(next.z).toBe(z);
      expect(next.x + ((left.anchor.x + right.anchor.x) / 2) * z).toBe(100 + x / 2);
    },
  );
  it('rebases the surviving finger and continues pan from the last pinch view', () => {
    const active = point(1, { x: 100, y: 100 });
    active.position = { x: 130, y: 150 };
    const current = { x: -10, y: 30, z: 1 };
    const surviving = rebaseCanvasTouchPoint(active, current);
    expect(projectCanvasTouchView(current, [surviving])).toEqual(current);
    surviving.position = { x: 150, y: 170 };
    expect(projectCanvasTouchView(current, [surviving])).toEqual({ x: 10, y: 50, z: 1 });
  });
  it('retains measurable zoom for coincident anchors instead of emitting NaN or Infinity', () => {
    const left = point(1, { x: 100, y: 100 });
    const right = point(2, { x: 100, y: 100 });
    left.position = { x: 150, y: 120 };
    right.position = { x: 250, y: 120 };
    expect(projectCanvasTouchView(view, [left, right])).toEqual({ x: 130, y: 60, z: 0.5 });
  });
  it('does not allow a third point to displace the two owned finger anchors', () => {
    const left = point(1, { x: 100, y: 100 });
    const right = point(2, { x: 200, y: 100 });
    expect(projectCanvasTouchView(view, [left, right, point(3, { x: 1000, y: 1000 })])).toEqual(
      view,
    );
  });
  it.each([
    [{ x: 0, y: 0, z: 0 }, []],
    [{ x: NaN, y: 0, z: 1 }, []],
    [view, [{ position: { x: 0, y: 0 }, anchor: { x: Infinity, y: 0 } }]],
  ])('rejects an invalid view or anchor without manufacturing coordinates', (current, points) => {
    expect(projectCanvasTouchView(current, points)).toBeNull();
  });
  it('distinguishes a real four-pixel gesture from subthreshold tap jitter', () => {
    expect(canvasTouchMoved({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false);
    expect(canvasTouchMoved({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(true);
    expect(createCanvasTouchPoint(1, { x: 10, y: 10 }, { x: 0, y: 0, z: NaN })).toBeNull();
  });
});
