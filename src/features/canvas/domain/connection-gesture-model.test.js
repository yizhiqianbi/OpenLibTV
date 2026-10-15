import { describe, expect, it } from 'vitest';
import {
  canvasConnectedNodePosition,
  canvasConnectionPair,
  canvasConnectionPanVelocity,
  canvasConnectionTarget,
  canvasHandlePoint,
} from './connection-gesture-model.js';

const node = (id, x, y, patch = {}) => ({
  id,
  type: 'text',
  position: { x, y },
  width: 200,
  height: 200,
  ...patch,
});

describe('connection direction and world geometry', () => {
  it('keeps source output and target input on the opposite node edges', () => {
    const current = node('a', 40, 60);
    expect(canvasHandlePoint(current, 'source')).toEqual({ x: 240, y: 160 });
    expect(canvasHandlePoint(current, 'target')).toEqual({ x: 40, y: 160 });
    expect(canvasConnectionPair('a', 'source', 'b')).toEqual({ sourceId: 'a', targetId: 'b' });
    expect(canvasConnectionPair('a', 'target', 'b')).toEqual({ sourceId: 'b', targetId: 'a' });
  });

  it('uses the 80 flow-unit circle rather than a rectangular or screen-pixel radius', () => {
    const nodes = [node('origin', 0, 0), node('target', 500, 0)];
    const target = (point) =>
      canvasConnectionTarget({ nodes, originId: 'origin', handleType: 'source', point });
    expect(target({ x: 420, y: 100 })).toMatchObject({ nodeId: 'target' });
    expect(target({ x: 419.99, y: 100 })).toBeNull();
    expect(target({ x: 440, y: 40 })).toBeNull();
    // At zoom 0.5, 40 screen px reaches the same exact flow boundary.
    const fromScreen = (x, z) => ({ x: x / z, y: 100 });
    expect(target(fromScreen(210, 0.5))).toMatchObject({ nodeId: 'target' });
    expect(target(fromScreen(209, 0.5))).toBeNull();
    expect(target(fromScreen(840, 2))).toMatchObject({ nodeId: 'target' });
  });

  it('chooses the nearest opposite handle before a node body underneath it', () => {
    const nodes = [
      node('origin', 0, 0),
      node('near', 500, 0),
      node('body', 350, 0, { width: 100, height: 250 }),
    ];
    expect(
      canvasConnectionTarget({
        nodes,
        originId: 'origin',
        handleType: 'source',
        point: { x: 440, y: 100 },
      }),
    ).toEqual({ nodeId: 'near', sourceId: 'origin', targetId: 'near' });
  });

  it('falls back to the last intersecting node body and supports input-initiated direction', () => {
    const nodes = [node('origin', 0, 0), node('first', 500, 0), node('top', 510, 10)];
    expect(
      canvasConnectionTarget({
        nodes,
        originId: 'origin',
        handleType: 'target',
        point: { x: 570, y: 175 },
      }),
    ).toEqual({ nodeId: 'top', sourceId: 'top', targetId: 'origin' });
  });

  it('excludes the origin, all ordinary group frames and its parent from body targets', () => {
    const nodes = [
      node('parent', 100, 100, { type: 'group', width: 1000, height: 1000 }),
      node('origin', 10, 20, { parentId: 'parent' }),
      node('other-group', 0, 0, { type: 'group', width: 1500, height: 1500 }),
    ];
    for (const point of [
      { x: 250, y: 250 },
      { x: 800, y: 800 },
    ])
      expect(
        canvasConnectionTarget({ nodes, originId: 'origin', handleType: 'source', point }),
      ).toBeNull();
  });

  it('resolves children at their parent world position and leaves persisted positions unchanged', () => {
    const nodes = [
      node('origin', 0, 0),
      node('group', 400, 300, { type: 'group' }),
      node('child', 40, 20, { parentId: 'group' }),
    ];
    expect(
      canvasConnectionTarget({
        nodes,
        originId: 'origin',
        handleType: 'source',
        point: { x: 440, y: 420 },
      }),
    ).toMatchObject({ nodeId: 'child' });
    expect(nodes[2].position).toEqual({ x: 40, y: 20 });
    expect(canvasConnectedNodePosition(nodes, 'child', 'source')).toEqual({ x: 740, y: 305 });
    expect(
      canvasConnectedNodePosition(nodes, 'child', 'target', { width: 350, height: 230 }),
    ).toEqual({
      x: -10,
      y: 305,
    });
    expect(canvasConnectedNodePosition(nodes, 'missing', 'source')).toBeNull();
  });
});

describe('connection edge pan source limits', () => {
  const bounds = { left: 100, top: 50, width: 1000, height: 700 };
  it.each([
    [
      { x: 140, y: 90 },
      { x: 0, y: 0 },
    ],
    [
      { x: 120, y: 70 },
      { x: 7.5, y: 7.5 },
    ],
    [
      { x: 100, y: 50 },
      { x: 15, y: 15 },
    ],
    [
      { x: -1000, y: -1000 },
      { x: 15, y: 15 },
    ],
    [
      { x: 1060, y: 710 },
      { x: 0, y: 0 },
    ],
    [
      { x: 1080, y: 730 },
      { x: -7.5, y: -7.5 },
    ],
    [
      { x: 1100, y: 750 },
      { x: -15, y: -15 },
    ],
    [
      { x: 5000, y: 5000 },
      { x: -15, y: -15 },
    ],
    [
      { x: 139.5, y: 350 },
      { x: 0.375, y: 0 },
    ],
  ])('computes the screen border velocity for %j', (point, expected) => {
    expect(canvasConnectionPanVelocity(point, bounds)).toEqual(expected);
  });
});
