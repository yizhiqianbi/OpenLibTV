// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  canvasMultiConnectionDropTarget,
  canvasMultiConnectionPanVelocity,
  canvasMultiConnectionPreviewPath,
} from './multi-connection-gesture-model.js';

const bounds = { left: 100, top: 50, right: 1100, bottom: 750 };
const node = (id, x, y, patch = {}) => ({
  id,
  type: 'image',
  position: { x, y },
  width: 200,
  height: 200,
  ...patch,
});

describe('multi-selection connection gesture geometry', () => {
  it('uses an independent 80px screen border and proportional 720px per second speed', () => {
    expect(canvasMultiConnectionPanVelocity({ x: 180, y: 130 }, bounds)).toEqual({ x: 0, y: 0 });
    expect(canvasMultiConnectionPanVelocity({ x: 140, y: 90 }, bounds)).toEqual({ x: 360, y: 360 });
    expect(canvasMultiConnectionPanVelocity({ x: 1060, y: 710 }, bounds)).toEqual({
      x: -360,
      y: -360,
    });
    expect(canvasMultiConnectionPanVelocity({ x: 1200, y: -100 }, bounds)).toEqual({
      x: -720,
      y: 720,
    });
    expect(canvasMultiConnectionPanVelocity(null, bounds)).toEqual({ x: 0, y: 0 });
    expect(canvasMultiConnectionPanVelocity({ x: 200, y: 200 }, null)).toEqual({ x: 0, y: 0 });
  });

  it('picks the last intersecting body and excludes selected origins, hidden nodes, and groups', () => {
    const nodes = [
      node('bottom', 500, 100),
      node('top', 500, 100),
      node('origin', 500, 100),
      node('hidden', 500, 100, { hidden: true }),
      node('group', 500, 100, { type: 'group' }),
    ];
    expect(canvasMultiConnectionDropTarget(nodes, ['origin'], { x: 550, y: 150 })).toBe('top');
    expect(canvasMultiConnectionDropTarget(nodes, ['origin', 'top'], { x: 550, y: 150 })).toBe(
      'bottom',
    );
    expect(canvasMultiConnectionDropTarget(nodes, ['origin'], { x: 430, y: 150 })).toBeNull();
  });

  it('uses a positive one-by-one release intersection rather than inclusive point edges', () => {
    const nodes = [node('target', 500, 100)];
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 499.5, y: 150 })).toBe('target');
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 550, y: 99.5 })).toBe('target');
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 499, y: 150 })).toBeNull();
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 700, y: 150 })).toBeNull();
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 550, y: 300 })).toBeNull();
  });

  it('resolves grouped children in world coordinates without mutating stored positions', () => {
    const group = node('group', 500, 400, { type: 'group' }),
      child = node('child', 20, 30, { parentId: 'group' }),
      nodes = [group, child];
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 550, y: 470 })).toBe('child');
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 50, y: 70 })).toBeNull();
    expect(child.position).toEqual({ x: 20, y: 30 });
  });

  it('uses declared or measured body sizes and rejects absent or nonfinite release points', () => {
    const nodes = [
      node('target', 0, 0, {
        width: undefined,
        height: undefined,
        measured: { width: 80, height: 60 },
      }),
    ];
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 70, y: 50 })).toBe('target');
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 90, y: 50 })).toBeNull();
    expect(canvasMultiConnectionDropTarget(nodes, [], null)).toBeNull();
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: NaN, y: 10 })).toBeNull();
    expect(canvasMultiConnectionDropTarget(nodes, [], { x: 10, y: Infinity })).toBeNull();
  });

  it('uses an individual half-distance cubic control with a minimum of 40 screen pixels', () => {
    expect(canvasMultiConnectionPreviewPath({ x: 100, y: 50 }, { x: 110, y: 70 })).toBe(
      'M100,50 C140,50 70,70 110,70',
    );
    expect(canvasMultiConnectionPreviewPath({ x: 100, y: 50 }, { x: 500, y: 70 })).toBe(
      'M100,50 C300,50 300,70 500,70',
    );
    expect(canvasMultiConnectionPreviewPath({ x: 500, y: 50 }, { x: 100, y: 70 })).toBe(
      'M500,50 C700,50 -100,70 100,70',
    );
    expect(canvasMultiConnectionPreviewPath({ x: NaN, y: 50 }, { x: 100, y: 70 })).toBeNull();
  });
});
