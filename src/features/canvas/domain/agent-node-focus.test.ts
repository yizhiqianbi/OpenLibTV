import { describe, expect, it } from 'vitest';
import { canvasAgentNodeFocusView } from './agent-node-focus.ts';

describe('Canvas inline node viewport fit', () => {
  it('uses source numeric padding/min-max zoom and centers the actual node bounds', () => {
    const node = { id: 'n', position: { x: 100, y: 200 }, width: 1000, height: 800 };
    expect(canvasAgentNodeFocusView('n', [node], { width: 1200, height: 960 })).toEqual({
      x: 0,
      y: -120,
      z: 1,
    });
    const fitted = canvasAgentNodeFocusView('n', [node], { width: 800, height: 800 });
    expect(fitted?.z).toBeCloseTo(0.668);
    // Source floor-based side correction accounts for the fractional pixel on the left.
    expect(fitted?.x).toBeCloseTo(0.2);
    expect(fitted?.y).toBeCloseTo(-0.8);
    expect(canvasAgentNodeFocusView('n', [node], { width: 200, height: 200 })?.z).toBe(0.6);
  });
  it('resolves relative parent positions, measured dimensions and absolute internals', () => {
    const parent = { id: 'g', position: { x: 1000, y: 600 } };
    const child = {
      id: 'n',
      parentId: 'g',
      position: { x: 20, y: 40 },
      width: 100,
      height: 100,
      measured: { width: 200, height: 80 },
    };
    expect(canvasAgentNodeFocusView('n', [parent, child], { width: 800, height: 600 })).toEqual({
      x: -720,
      y: -380,
      z: 1,
    });
    expect(
      canvasAgentNodeFocusView(
        'n',
        [{ ...child, internals: { positionAbsolute: { x: 10, y: 20 } } }],
        { width: 800, height: 600 },
      ),
    ).toEqual({ x: 290, y: 240, z: 1 });
  });
  it('rejects missing IDs/zero-size surfaces and terminates cyclic parent data', () => {
    expect(canvasAgentNodeFocusView('missing', [], { width: 800, height: 600 })).toBeNull();
    expect(canvasAgentNodeFocusView('n', [{ id: 'n' }], { width: 0, height: 600 })).toBeNull();
    const result = canvasAgentNodeFocusView(
      'n',
      [{ id: 'n', parentId: 'n', position: { x: 10, y: 20 } }],
      { width: 800, height: 600 },
    );
    expect(result).toEqual({ x: 215, y: 165, z: 1 });
  });
});
