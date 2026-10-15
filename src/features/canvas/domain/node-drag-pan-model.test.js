import { describe, expect, it } from 'vitest';
import {
  canvasNodeDragPanCompensation,
  canvasNodeDragPanStep,
  canvasNodeDragPositionDelta,
} from './node-drag-pan-model.js';

const rect = { left: 100, top: 50, width: 800, height: 600 };
const view = { x: 20, y: -10, z: 2 };
const step = (patch = {}) =>
  canvasNodeDragPanStep({
    protocol: 'node',
    clientPoint: { x: 500, y: 350 },
    boardRect: rect,
    view,
    ...patch,
  });
const delta = (patch = {}) =>
  canvasNodeDragPositionDelta({
    protocol: 'node',
    originClient: { x: 300, y: 250 },
    clientPoint: { x: 340, y: 270 },
    originView: view,
    view,
    originBoardRect: rect,
    ...patch,
  });

describe('ordinary node XYDrag pan step', () => {
  it('leaves the interior view unchanged without mutating its input', () => {
    const frozen = Object.freeze({ ...view, marker: 'retained' });
    expect(step({ view: frozen })).toEqual({
      active: false,
      deltaScreen: { x: 0, y: 0 },
      nextView: frozen,
    });
    expect(step({ view: frozen }).nextView).not.toBe(frozen);
  });

  it.each([
    [140, 90],
    [860, 610],
  ])('keeps the exact 40px edge boundary stationary at (%s,%s)', (x, y) => {
    expect(step({ clientPoint: { x, y } }).deltaScreen).toEqual({ x: 0, y: 0 });
  });

  it('starts at the source 1px minimum penetration, even just within the boundary', () => {
    expect(step({ clientPoint: { x: 139.9, y: 350 } }).deltaScreen).toEqual({ x: 0.375, y: 0 });
    expect(step({ clientPoint: { x: 860.1, y: 350 } }).deltaScreen.x).toBe(-0.375);
  });

  it('uses half speed halfway through both edge zones without normalizing a diagonal', () => {
    expect(step({ clientPoint: { x: 120, y: 630 } }).deltaScreen).toEqual({ x: 7.5, y: -7.5 });
  });

  it('caps at 15 screen pixels per frame after the pointer leaves the board', () => {
    expect(step({ clientPoint: { x: -500, y: 1500 } })).toEqual({
      active: true,
      deltaScreen: { x: 15, y: -15 },
      nextView: { x: 35, y: -25, z: 2 },
    });
  });

  it('retains frame speed across elapsed times and zoom values', () => {
    const result = (elapsedMs, z) =>
      step({ clientPoint: { x: 100, y: 50 }, elapsedMs, view: { ...view, z } }).deltaScreen;
    expect(result(0, 0.1)).toEqual({ x: 15, y: 15 });
    expect(result(5000, 8)).toEqual(result(0, 0.1));
  });

  it('preserves left/top precedence when the source edge zones overlap', () => {
    expect(
      step({ boardRect: { ...rect, width: 60, height: 60 }, clientPoint: { x: 130, y: 80 } })
        .deltaScreen,
    ).toEqual({ x: 3.75, y: 3.75 });
  });
});

describe('virtual selection frame timed pan step', () => {
  const selectionStep = (patch = {}) => step({ protocol: 'selection', ...patch });

  it('has a stationary first frame when the owner supplies zero elapsed time', () => {
    const result = selectionStep({ clientPoint: { x: 100, y: 50 } });
    expect(result.deltaScreen).toEqual({ x: 0, y: 0 });
    expect(result.active).toBe(true);
    expect(selectionStep().active).toBe(false);
  });

  it('uses 720px per second at the outer edge, independently on both axes', () => {
    expect(selectionStep({ clientPoint: { x: 100, y: 650 }, elapsedMs: 25 }).deltaScreen).toEqual({
      x: 18,
      y: -18,
    });
  });

  it('uses an 80px edge zone without the ordinary 1px minimum', () => {
    expect(selectionStep({ clientPoint: { x: 140, y: 610 }, elapsedMs: 25 }).deltaScreen).toEqual({
      x: 9,
      y: -9,
    });
    expect(
      selectionStep({ clientPoint: { x: 179.9, y: 350 }, elapsedMs: 25 }).deltaScreen.x,
    ).toBeCloseTo(0.0225);
    expect(selectionStep({ clientPoint: { x: 180, y: 350 }, elapsedMs: 25 }).deltaScreen.x).toBe(0);
  });

  it('clamps a delayed tick to 50ms and a backward timestamp to zero', () => {
    expect(
      selectionStep({ clientPoint: { x: -1000, y: -1000 }, elapsedMs: 5000 }).deltaScreen,
    ).toEqual({ x: 36, y: 36 });
    expect(
      selectionStep({ clientPoint: { x: -1000, y: -1000 }, elapsedMs: -25 }).deltaScreen,
    ).toEqual({ x: 0, y: 0 });
  });

  it('keeps screen speed independent of zoom and board page offsets', () => {
    const a = selectionStep({ clientPoint: { x: 100, y: 50 }, elapsedMs: 25 });
    const b = selectionStep({
      clientPoint: { x: 250, y: 150 },
      boardRect: { ...rect, left: 250, top: 150 },
      view: { ...view, z: 0.1 },
      elapsedMs: 25,
    });
    expect(b.deltaScreen).toEqual(a.deltaScreen);
    expect(b.nextView.z).toBe(0.1);
  });
});

describe('drag position projection during pan and zoom', () => {
  it('moves ordinary roots in world units without applying pan twice', () => {
    expect(delta()).toEqual({ x: 20, y: 10 });
    expect(delta({ view: { ...view, x: 35, y: -25 } })).toEqual({ x: 12.5, y: 17.5 });
  });

  it('keeps a stationary dragged node under the same screen cursor over several ordinary pan frames', () => {
    const pointer = { x: 100, y: 350 };
    const origin = { x: (pointer.x - rect.left - view.x) / view.z, y: 155 };
    let current = view;
    for (let tick = 0; tick < 5; tick++) {
      current = step({ clientPoint: pointer, view: current }).nextView;
      const movement = delta({ originClient: pointer, clientPoint: pointer, view: current });
      expect((origin.x + movement.x) * current.z + current.x + rect.left).toBe(pointer.x);
      expect((origin.y + movement.y) * current.z + current.y + rect.top).toBe(pointer.y);
    }
    expect(delta({ originClient: pointer, clientPoint: pointer, view: current }).x).toBe(-37.5);
  });

  it('accounts for ordinary world anchors when wheel zoom changes during a drag', () => {
    const current = { x: -50, y: -20, z: 4 };
    const movement = delta({ view: current });
    expect(movement).toEqual({ x: -17.5, y: -45 });
    const originWorld = { x: 90, y: 105 };
    expect((originWorld.x + movement.x) * current.z + current.x + rect.left).toBe(340);
    expect((originWorld.y + movement.y) * current.z + current.y + rect.top).toBe(270);
  });

  it('defaults to the captured board origin and supports explicit local layout rebasing', () => {
    expect(delta()).toEqual({ x: 20, y: 10 });
    expect(delta({ boardRect: { ...rect, left: 120, top: 70 } })).toEqual({ x: 10, y: 0 });
  });

  it('retains the frame source current-zoom formula rather than substituting the ordinary world anchor', () => {
    expect(delta({ protocol: 'selection', view: { ...view, z: 4 } })).toEqual({ x: 10, y: 5 });
    expect(delta({ view: { ...view, z: 4 } })).toEqual({ x: -35, y: -47.5 });
  });

  it('accumulates virtual compensation at each tick zoom without redividing old pan', () => {
    const first = canvasNodeDragPanCompensation({ x: 0, y: 0 }, { x: 18, y: -9 }, 2);
    const second = canvasNodeDragPanCompensation(first, { x: 12, y: 6 }, 4);
    expect(first).toEqual({ x: -9, y: 4.5 });
    expect(second).toEqual({ x: -12, y: 3 });
    expect(
      delta({ protocol: 'selection', view: { ...view, z: 4 }, panCompensation: second }),
    ).toEqual({ x: -2, y: 8 });
  });

  it('keeps a stationary virtual frame under its cursor over variable frame intervals at fixed zoom', () => {
    let current = view;
    let compensation = { x: 0, y: 0 };
    for (const elapsedMs of [0, 16, 32, 1000]) {
      const pan = step({
        protocol: 'selection',
        clientPoint: { x: 100, y: 50 },
        elapsedMs,
        view: current,
      });
      current = pan.nextView;
      compensation = canvasNodeDragPanCompensation(compensation, pan.deltaScreen, current.z);
      const movement = delta({
        protocol: 'selection',
        originClient: { x: 100, y: 50 },
        clientPoint: { x: 100, y: 50 },
        view: current,
        panCompensation: compensation,
      });
      expect(movement.x * current.z + current.x).toBeCloseTo(view.x);
      expect(movement.y * current.z + current.y).toBeCloseTo(view.y);
    }
  });
});

describe('pure pan model local invalid-data guards', () => {
  it.each([
    { protocol: 'unknown' },
    { clientPoint: { x: NaN, y: 0 } },
    { boardRect: null },
    { boardRect: { ...rect, width: 0 } },
    { boardRect: { ...rect, height: Infinity } },
    { view: { ...view, z: 0 } },
    { view: { ...view, x: Infinity } },
    { protocol: 'selection', elapsedMs: NaN },
  ])('rejects a malformed pan request %j', (patch) => {
    expect(step(patch)).toBeNull();
  });

  it('does not overflow finite inputs into a persisted view or drag delta', () => {
    expect(
      step({ clientPoint: { x: 0, y: 0 }, view: { ...view, x: Number.MAX_VALUE } }),
    ).not.toBeNull();
    expect(delta({ view: { ...view, z: Number.MIN_VALUE } })).toBeNull();
    expect(
      canvasNodeDragPanCompensation({ x: 0, y: 0 }, { x: 1, y: 0 }, Number.MIN_VALUE),
    ).toBeNull();
  });

  it('rejects invalid projection state without requiring irrelevant ordinary fields on a frame', () => {
    expect(delta({ protocol: 'unknown' })).toBeNull();
    expect(delta({ originView: null })).toBeNull();
    expect(delta({ originBoardRect: { left: NaN, top: 0 } })).toBeNull();
    expect(delta({ protocol: 'selection', panCompensation: { x: Infinity, y: 0 } })).toBeNull();
    expect(delta({ protocol: 'selection', originView: null, originBoardRect: null })).toEqual({
      x: 20,
      y: 10,
    });
    expect(canvasNodeDragPanCompensation({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBeNull();
  });
});
