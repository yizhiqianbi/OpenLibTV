import { describe, expect, it, vi } from 'vitest';
import {
  canvasEdgeGeometry,
  canvasEdgeNearestPoint,
  canvasEdgePresentation,
  canvasVisibleEdgeIds,
  createCanvasEdgeNearestLookup,
  resolveCanvasEdgeBezier,
  selectCanvasEdgeIds,
} from './edge-interaction-model.js';

// Gold values come from the frozen XYFlow equations, not a second implementation.
// Source: canvas-edge-geometry-source-proof.json, rf-get-bezier-path-export and controls.
describe('source Bezier geometry', () => {
  it('uses Bottom/Top and curvature .25 by default, including the source label offsets', () => {
    expect(resolveCanvasEdgeBezier({ sourceX: 0, sourceY: 0, targetX: 80, targetY: 160 })).toEqual({
      source: { x: 0, y: 0 },
      target: { x: 80, y: 160 },
      control1: { x: 0, y: 80 },
      control2: { x: 80, y: 80 },
      label: { x: 40, y: 80 },
      offset: { x: 40, y: 80 },
      path: 'M0,0 C0,80 80,80 80,160',
    });
  });

  it.each([
    ['right', 'left', 10, 20, 110, 220, { x: 60, y: 20 }, { x: 60, y: 220 }],
    ['left', 'right', 110, 20, 10, 220, { x: 60, y: 20 }, { x: 60, y: 220 }],
    ['top', 'bottom', 20, 110, 220, 10, { x: 20, y: 60 }, { x: 220, y: 60 }],
    ['bottom', 'top', 20, 10, 220, 110, { x: 20, y: 60 }, { x: 220, y: 60 }],
  ])(
    'uses distance/2 for a forward %s/%s pair',
    (sourcePosition, targetPosition, sourceX, sourceY, targetX, targetY, control1, control2) => {
      expect(
        resolveCanvasEdgeBezier({
          sourcePosition,
          targetPosition,
          sourceX,
          sourceY,
          targetX,
          targetY,
        }),
      ).toMatchObject({ control1, control2 });
    },
  );

  it.each([
    ['right', 'left', 110, 20, 10, 220, { x: 172.5, y: 20 }, { x: -52.5, y: 220 }],
    ['left', 'right', 10, 20, 110, 220, { x: -52.5, y: 20 }, { x: 172.5, y: 220 }],
    ['top', 'bottom', 20, 10, 220, 110, { x: 20, y: -52.5 }, { x: 220, y: 172.5 }],
    ['bottom', 'top', 20, 110, 220, 10, { x: 20, y: 172.5 }, { x: 220, y: -52.5 }],
  ])(
    'uses the square-root bend for a reversed %s/%s pair',
    (sourcePosition, targetPosition, sourceX, sourceY, targetX, targetY, control1, control2) => {
      expect(
        resolveCanvasEdgeBezier({
          sourcePosition,
          targetPosition,
          sourceX,
          sourceY,
          targetX,
          targetY,
        }),
      ).toMatchObject({ control1, control2 });
    },
  );

  it('uses an explicit curvature for reverse bends without changing forward distance/2', () => {
    const reverse = resolveCanvasEdgeBezier({
      sourceX: 110,
      sourceY: 20,
      targetX: 10,
      targetY: 220,
      sourcePosition: 'right',
      targetPosition: 'left',
      curvature: 0.5,
    });
    expect(reverse).toMatchObject({
      control1: { x: 235, y: 20 },
      control2: { x: -115, y: 220 },
      label: { x: 60, y: 120 },
      offset: { x: 50, y: 100 },
    });
    expect(reverse.path).toBe('M110,20 C235,20 -115,220 10,220');
    expect(
      resolveCanvasEdgeBezier({
        sourceX: 10,
        sourceY: 20,
        targetX: 110,
        targetY: 220,
        sourcePosition: 'right',
        targetPosition: 'left',
        curvature: 0.5,
      }).control1,
    ).toEqual({ x: 60, y: 20 });
  });

  it('accepts coincident axes and zero coordinates', () => {
    expect(
      resolveCanvasEdgeBezier({
        sourceX: 0,
        sourceY: 0,
        targetX: 0,
        targetY: 80,
        sourcePosition: 'right',
        targetPosition: 'left',
      }),
    ).toMatchObject({
      control1: { x: 0, y: 0 },
      control2: { x: 0, y: 80 },
      label: { x: 0, y: 40 },
    });
  });

  it('fails closed for corrupt coordinates, directions and overflowed output', () => {
    const input = { sourceX: 0, sourceY: 0, targetX: 80, targetY: 160 };
    for (const patch of [
      { sourceX: NaN },
      { sourceY: Infinity },
      { targetX: -Infinity },
      { targetY: '160' },
      { curvature: NaN },
      { sourcePosition: 'diagonal' },
      { targetPosition: null },
    ])
      expect(resolveCanvasEdgeBezier({ ...input, ...patch })).toBeNull();
    expect(
      resolveCanvasEdgeBezier({
        sourceX: 1e308,
        sourceY: 0,
        targetX: -1e308,
        targetY: 0,
        sourcePosition: 'right',
        targetPosition: 'left',
      }),
    ).toBeNull();
  });
});

function world() {
  return new Map([
    ['a', { id: 'a', position: { x: 0, y: 0 }, width: 100, height: 60 }],
    ['b', { id: 'b', position: { x: 300, y: 100 }, width: 80, height: 80 }],
  ]);
}

describe('current right/left handle contract', () => {
  it('uses resolved world positions and edge-center anchors with explicit or default handle IDs', () => {
    const nodes = world();
    for (const handles of [
      {},
      { sourceHandle: null, targetHandle: null },
      { sourceHandle: 'source', targetHandle: 'target' },
    ]) {
      expect(canvasEdgeGeometry(nodes, { source: 'a', target: 'b', ...handles })).toMatchObject({
        source: { x: 100, y: 30 },
        target: { x: 300, y: 140 },
        control1: { x: 200, y: 30 },
        control2: { x: 200, y: 140 },
        label: { x: 200, y: 85 },
        path: 'M100,30 C200,30 200,140 300,140',
      });
    }
    expect(nodes.get('a').position).toEqual({ x: 0, y: 0 });
  });

  it('does not render hidden, orphaned or invalid handle-ID edges', () => {
    const nodes = world(),
      edge = { source: 'a', target: 'b' };
    for (const patch of [
      { hidden: true },
      { source: 'missing' },
      { target: 'missing' },
      { sourceHandle: 'target' },
      { targetHandle: 'source' },
    ])
      expect(canvasEdgeGeometry(nodes, { ...edge, ...patch })).toBeNull();
  });

  it('rejects zero or invalid dimensions and coordinates instead of exposing a bogus hit path', () => {
    for (const [id, patch] of [
      ['a', { width: 0 }],
      ['b', { height: 0 }],
      ['a', { height: -1 }],
      ['b', { width: NaN }],
      ['a', { position: { x: Infinity, y: 0 } }],
      ['b', { position: { x: 300, y: undefined } }],
    ]) {
      const nodes = world();
      nodes.set(id, { ...nodes.get(id), ...patch });
      expect(canvasEdgeGeometry(nodes, { source: 'a', target: 'b' })).toBeNull();
    }
  });
});

function arcApi(total = 800) {
  return {
    getTotalLength: vi.fn(() => total),
    getPointAtLength: vi.fn((length) => ({ x: length, y: 0 })),
  };
}

describe('source arc-length nearest point contract', () => {
  it('builds 81 arc-length samples once and makes 11 fine samples for each query', () => {
    const api = arcApi(),
      lookup = createCanvasEdgeNearestLookup(api);
    expect(api.getTotalLength).toHaveBeenCalledOnce();
    expect(api.getPointAtLength).toHaveBeenCalledTimes(81);
    expect(api.getPointAtLength.mock.calls[0]).toEqual([0]);
    expect(api.getPointAtLength.mock.calls[40]).toEqual([400]);
    expect(api.getPointAtLength.mock.calls[80]).toEqual([800]);
    expect(lookup({ x: 404.3, y: 10 })).toEqual({ x: 404, y: 0 });
    expect(api.getPointAtLength).toHaveBeenCalledTimes(92);
    expect(lookup({ x: 404.3, y: -10 })).toEqual({ x: 404, y: 0 });
    expect(api.getPointAtLength).toHaveBeenCalledTimes(103);
    expect(api.getTotalLength).toHaveBeenCalledOnce();
  });

  it('keeps the first coarse and fine ties rather than choosing the later equal-distance point', () => {
    const api = arcApi();
    // The adapter supplies exact ties; binary noise in requested arc lengths must not bias them.
    api.getPointAtLength.mockImplementation((length) => ({
      x: Number(length.toFixed(10)),
      y: 0,
    }));
    const lookup = createCanvasEdgeNearestLookup(api);
    expect(lookup({ x: 405, y: 0 })).toEqual({ x: 404, y: 0 });
    const fine = api.getPointAtLength.mock.calls.slice(81).map(([length]) => length);
    const gold = [390, 392, 394, 396, 398, 400, 402, 404, 406, 408, 410];
    expect(fine).toHaveLength(11);
    fine.forEach((length, index) => expect(length).toBeCloseTo(gold[index], 10));
  });

  it('clamps fine sampling at an endpoint and accepts a zero-length native path', () => {
    const api = arcApi(),
      lookup = createCanvasEdgeNearestLookup(api);
    expect(lookup({ x: -10, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(api.getPointAtLength.mock.calls[81]).toEqual([0]);
    expect(api.getPointAtLength.mock.calls[91][0]).toBeCloseTo(10);
    const empty = arcApi(0);
    expect(canvasEdgeNearestPoint(empty, { x: 9, y: 6 })).toEqual({ x: 0, y: 0 });
  });

  it('rejects invalid lengths and unavailable APIs during construction', () => {
    for (const length of [-1, NaN, Infinity, '800'])
      expect(createCanvasEdgeNearestLookup(arcApi(length))).toBeNull();
    expect(createCanvasEdgeNearestLookup(null)).toBeNull();
    expect(
      createCanvasEdgeNearestLookup({
        getTotalLength: () => {
          throw Error('unavailable');
        },
      }),
    ).toBeNull();
    expect(canvasEdgeNearestPoint({}, { x: 0, y: 0 })).toBeNull();
  });

  it('rejects corrupt coarse points and invalid mouse coordinates', () => {
    const broken = arcApi();
    broken.getPointAtLength.mockImplementation((length) =>
      length === 400 ? { x: NaN, y: 0 } : { x: length, y: 0 },
    );
    expect(createCanvasEdgeNearestLookup(broken)).toBeNull();
    const api = arcApi(),
      lookup = createCanvasEdgeNearestLookup(api);
    for (const point of [null, { x: NaN, y: 0 }, { x: 0, y: Infinity }, { x: '0', y: 0 }])
      expect(lookup(point)).toBeNull();
    expect(api.getPointAtLength).toHaveBeenCalledTimes(81);
  });

  it('fails closed if a native sampler throws after coarse construction', () => {
    const api = arcApi(),
      lookup = createCanvasEdgeNearestLookup(api);
    api.getPointAtLength.mockImplementation(() => {
      throw Error('detached path');
    });
    expect(lookup({ x: 400, y: 0 })).toBeNull();
    expect(() => lookup({ x: 400, y: 0 })).not.toThrow();
  });

  it('fails closed for a nonfinite fine sample rather than leaving a stale target', () => {
    const api = arcApi(),
      lookup = createCanvasEdgeNearestLookup(api);
    api.getPointAtLength.mockReturnValue({ x: 0, y: Infinity });
    expect(lookup({ x: 400, y: 0 })).toBeNull();
  });
});

describe('source display and selection rules', () => {
  const edges = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
    { id: 'xy', source: 'x', target: 'y' },
    { id: 'hidden', source: 'a', target: 'c', hidden: true },
  ];

  it('hidden-edge mode shows only incident selected-node edges, preserving source order', () => {
    expect(canvasVisibleEdgeIds(edges)).toEqual(['ab', 'bc', 'xy']);
    expect(canvasVisibleEdgeIds(edges, false)).toEqual([]);
    expect(canvasVisibleEdgeIds(edges, false, ['b'])).toEqual(['ab', 'bc']);
    expect(canvasVisibleEdgeIds(edges, false, ['y'])).toEqual(['xy']);
    expect(canvasVisibleEdgeIds(edges, false, ['ab'])).toEqual([]);
  });

  it.each([
    [{}, '#fa0', 2, false],
    [{ selectedNodes: ['a'] }, 'var(--canvas-edge-hover)', 2, true],
    [{ hovered: true }, 'var(--canvas-edge-hover)', 4, true],
    [{ selectedEdge: true }, 'var(--canvas-edge-selected)', 3, true],
    [{ selectedEdge: true, hovered: true }, 'var(--canvas-edge-selected)', 4, true],
    [
      { selectedEdge: true, hovered: true, selectedNodes: ['a'], interactive: false },
      '#fa0',
      2,
      false,
    ],
  ])('resolves source paint priority for %j', (state, stroke, strokeWidth, highlighted) => {
    expect(
      canvasEdgePresentation({
        edge: { id: 'ab', source: 'a', target: 'b', style: { stroke: '#fa0' } },
        ...state,
      }),
    ).toMatchObject({ stroke, strokeWidth, highlighted });
  });

  it('keeps focusability independent of selectable and endpoint visibility', () => {
    const edge = { id: 'ab', source: 'a', target: 'b', selectable: false };
    expect(canvasEdgePresentation({ edge, interactive: false, disabled: true })).toMatchObject({
      selectable: false,
      focusable: true,
      deletable: false,
    });
    expect(canvasEdgePresentation({ edge: { ...edge, focusable: false } }).focusable).toBe(false);
  });

  it('keeps readonly selection and default paint, while write permission stays closed', () => {
    const edge = { id: 'ab', source: 'a', target: 'b' };
    expect(canvasEdgePresentation({ edge, readonly: true })).toMatchObject({
      selectable: true,
      focusable: true,
      deletable: false,
      stroke: 'var(--canvas-edge)',
      strokeWidth: 2,
    });
    expect(canvasEdgePresentation({ edge: { ...edge, deletable: false } }).deletable).toBe(false);
    expect(canvasEdgePresentation({ edge, disabled: true }).selectable).toBe(false);
  });

  it('uses the source data.type reference enum only when endpoints are interactive', () => {
    const edge = { id: 'ab', source: 'a', target: 'b' };
    expect(
      canvasEdgePresentation({ edge, sourceNode: { data: { type: 'reference' } } }).reference,
    ).toBe(true);
    expect(
      canvasEdgePresentation({
        edge,
        sourceNode: { type: 'reference' },
        targetNode: { data: { type: 'reference' } },
      }).reference,
    ).toBe(false);
    expect(
      canvasEdgePresentation({
        edge,
        sourceNode: { data: { type: 'reference' } },
        interactive: false,
      }).reference,
    ).toBe(false);
  });

  it('replaces ordinary selection and supports pointer toggle versus keyboard append without mutation', () => {
    const selected = Object.freeze(['ab', 'bc']);
    expect(selectCanvasEdgeIds(selected, 'xy')).toEqual(['xy']);
    expect(selectCanvasEdgeIds(selected, 'ab', { additive: true })).toEqual(['bc']);
    expect(selectCanvasEdgeIds(selected, 'ab', { additive: true, toggle: false })).toEqual([
      'ab',
      'bc',
    ]);
    expect(selectCanvasEdgeIds(selected, 'xy', { additive: true, toggle: false })).toEqual([
      'ab',
      'bc',
      'xy',
    ]);
    expect(selected).toEqual(['ab', 'bc']);
  });
});
