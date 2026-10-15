// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  applyFocusAspect,
  moveFocusRegion,
  planCanvasFocusRegion,
  resizeFocusRegion,
} from './focus-region-model.js';

function cornerChain(vertical = false) {
  const aspect = vertical ? 0.5 : 1.526;
  const rect = { left: 0, top: 0, width: aspect * 100, height: 100 };
  const initial = vertical
    ? { relX: 0.3, relY: 0.96, width: 0.05, height: 0.04 }
    : { relX: 0.96, relY: 0.3, width: 0.04, height: 0.05 };
  const label = vertical ? '16:9' : '9:16';
  const selected = applyFocusAspect(initial, label, aspect);
  const moved = moveFocusRegion(
    selected,
    { x: 0, y: 0 },
    vertical ? { x: 0, y: 999 } : { x: 999, y: 0 },
    rect,
  );
  const resized = resizeFocusRegion({
    region: moved,
    handle: 'se',
    startClient: {
      x: (moved.relX + moved.width) * rect.width,
      y: (moved.relY + moved.height) * rect.height,
    },
    currentClient: { x: 999, y: 999 },
    contentRect: rect,
    ratioLabel: label,
    containerAspectRatio: aspect,
  });
  return { aspect, rect, label, initial, selected, moved, resized };
}

function planFor(region, aspect, label) {
  const source = {
    id: 'source',
    type: 'image',
    data: { type: 'image', action: 'image_resource', url: ['/source.png', '/second.png'] },
  };
  const target = {
    id: 'target',
    type: 'image',
    position: { x: 200, y: 50 },
    data: {
      type: 'image',
      action: 'image_generate',
      params: {
        model: 'focus',
        prompt: '保留实际剧情',
        count: 2,
        modeType: 'text2image',
        settings: { quality: '2K', RaTiOFirst: '4:3' },
        advancedSettings: { seed: 42 },
      },
    },
  };
  const nodes = [source, target];
  const existing = {
    id: 'existing',
    source: 'source',
    target: 'target',
    data: { assetVirtual: true },
  };
  const makeEdgeId = vi.fn();
  return {
    nodes,
    existing,
    makeEdgeId,
    result: planCanvasFocusRegion({
      nodes,
      edges: [existing],
      sourceNodeId: 'source',
      targetNodeId: 'target',
      region,
      ratioLabel: label,
      containerAspectRatio: aspect,
      makeEdgeId,
    }),
  };
}

describe('source focus minimum arithmetic remains closed under subsequent editing', () => {
  it('retains the real ratio→move→SE .02 overflow and can still move, change ratio and confirm it', () => {
    const { aspect, rect, label, selected, moved, resized } = cornerChain();
    expect(selected.width).toBeCloseTo(0.0184305373525557, 14);
    expect(moved.relX).toBeCloseTo(0.9815694626474443, 14);
    expect(resized.width).toBe(0.02);
    expect(resized.relX + resized.width).toBeCloseTo(1.0015694626474443, 14);
    expect(resized.relX + resized.width).toBeGreaterThan(1);
    const movedAgain = moveFocusRegion(resized, { x: 0, y: 0 }, { x: -10, y: 0 }, rect);
    expect(movedAgain).not.toBeNull();
    expect(movedAgain.width).toBe(resized.width);
    expect(movedAgain.height).toBe(resized.height);
    expect(movedAgain.relX + movedAgain.width).toBeLessThanOrEqual(1);
    const ratioAgain = applyFocusAspect(resized, '1:1', aspect);
    expect(ratioAgain).not.toBeNull();
    expect(ratioAgain.relX).toBe(resized.relX);
    expect(ratioAgain.relX + ratioAgain.width).toBeGreaterThan(1);
    const { nodes, existing, makeEdgeId, result } = planFor(resized, aspect, label);
    expect(result).not.toBeNull();
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(result.edges).toEqual([existing]);
    expect(result.edges[0]).toBe(existing);
    expect(makeEdgeId).not.toHaveBeenCalled();
    expect(result.nodes[1].position).toBe(nodes[1].position);
    expect(result.nodes[1].data.action).toBe('image_generate');
    expect(result.nodes[1].data.params).toEqual({
      ...nodes[1].data.params,
      focusRegion: { nodeId: 'source', ...resized, imageUrl: '/source.png' },
      originImage: '/source.png',
      scene: 'camera_focus',
      settings: { ...nodes[1].data.params.settings, RaTiOFirst: label },
    });
    expect(planFor(ratioAgain, aspect, '1:1').result).not.toBeNull();
  });

  it.each([false, true])(
    'allows %s-axis N/W resize to preserve the source far edge even when dimension exceeds one',
    (vertical) => {
      const { aspect, rect, label, resized } = cornerChain(vertical);
      const extended = resizeFocusRegion({
        region: resized,
        handle: vertical ? 'n' : 'w',
        startClient: { x: resized.relX * rect.width, y: resized.relY * rect.height },
        currentClient: { x: -999, y: -999 },
        contentRect: rect,
        ratioLabel: label,
        containerAspectRatio: aspect,
      });
      expect(extended).not.toBeNull();
      const dimension = vertical ? 'height' : 'width';
      const origin = vertical ? 'relY' : 'relX';
      expect(extended[origin]).toBe(0);
      expect(extended[dimension]).toBeGreaterThan(1);
      expect(extended[dimension]).toBeLessThanOrEqual(1.02);
      expect(extended[origin] + extended[dimension]).toBeCloseTo(
        resized[origin] + resized[dimension],
        14,
      );
      expect(planFor(extended, aspect, label).result).not.toBeNull();
      expect(moveFocusRegion(extended, { x: 0, y: 0 }, { x: -10, y: -10 }, rect)).not.toBeNull();
      expect(applyFocusAspect(extended, '1:1', aspect)).not.toBeNull();
    },
  );

  it.each([
    { relX: 0.99, relY: 0, width: 0.04, height: 0.04 },
    { relX: 0, relY: 0.99, width: 0.04, height: 0.04 },
    { relX: -0.01, relY: 0, width: 0.04, height: 0.04 },
    { relX: 1.01, relY: 0, width: 0.001, height: 0.04 },
    { relX: 0, relY: -0.01, width: 0.04, height: 0.04 },
    { relX: 0, relY: 1.01, width: 0.04, height: 0.001 },
    { relX: 0, relY: 0, width: 0, height: 0.04 },
    { relX: 0, relY: 0, width: 0.04, height: -0.01 },
    { relX: NaN, relY: 0, width: 0.04, height: 0.04 },
    { relX: 0, relY: 0, width: Infinity, height: 0.04 },
  ])('still rejects malformed or greater-than-1.02 endpoint geometry %j', (region) => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(planFor(region, 1, '1:1').result).toBeNull();
    expect(moveFocusRegion(region, { x: 0, y: 0 }, { x: 1, y: 1 }, rect)).toBeNull();
    expect(applyFocusAspect(region, '1:1', 1)).toBeNull();
  });
});
