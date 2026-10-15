import { describe, expect, it } from 'vitest';
import {
  TEMP_CONNECTION_EDGE_ID,
  TEMP_CONNECTION_NODE_ID,
  canvasConnectionGhost,
  canvasConnectionGhostPath,
  canvasSourceConnectedCreationPosition,
} from './connection-ghost-model.js';
import { canvasNodeSize } from './groups.js';

const origin = {
  id: 'image',
  type: 'image',
  position: { x: 100, y: 50 },
  width: 200,
  height: 200,
  data: { type: 'image', action: 'image_resource' },
};
const menu = {
  nodeId: 'image',
  documentKey: 'A',
  handleType: 'source',
  clientX: 800,
  clientY: 500,
  point: { x: 500, y: 300 },
};
const project = (patch = {}) =>
  canvasConnectionGhost({ menu, nodes: [origin], documentKey: 'A', ready: true, ...patch });

describe('source temporary blank-release endpoint', () => {
  it('projects the tiny transient node and ordinary edge from a release request without mutating the graph or request', () => {
    const nodes = [structuredClone(origin)];
    const request = structuredClone(menu);
    const before = structuredClone({ nodes, request });
    const ghost = project({ nodes, menu: request });
    expect(ghost.node).toEqual({
      id: TEMP_CONNECTION_NODE_ID,
      type: 'temp',
      position: { x: 500, y: 300 },
      width: 1,
      height: 1,
      data: {},
      draggable: false,
      selectable: false,
    });
    expect(ghost.edge).toEqual({
      id: TEMP_CONNECTION_EDGE_ID,
      source: 'image',
      target: TEMP_CONNECTION_NODE_ID,
      sourceHandle: 'source',
      targetHandle: 'target',
      style: { stroke: 'var(--canvas-edge)', strokeWidth: 2 },
    });
    expect(ghost.sourcePoint).toEqual({ x: 300, y: 150 });
    // Source width1+border1 has a 2px used border-box; RF targets the 6px input's outer edge.
    expect(ghost.targetPoint).toEqual({ x: 498, y: 301 });
    expect(ghost.path).toBe('M300,150 C399,150 399,301 498,301');
    expect({ nodes, request }).toEqual(before);
    expect(ghost.node.position).not.toBe(request.point);
  });

  it('reverses the actual edge for an input-initiated release, including its source-side handle envelope', () => {
    const ghost = project({ menu: { ...menu, handleType: 'target', point: { x: -200, y: 300 } } });
    expect(ghost.edge.source).toBe(TEMP_CONNECTION_NODE_ID);
    expect(ghost.edge.target).toBe('image');
    expect(ghost.sourcePoint).toEqual({ x: -196, y: 301 });
    expect(ghost.targetPoint).toEqual({ x: 100, y: 150 });
    expect(ghost.path).toBe('M-196,301 C-48,301 -48,150 100,150');
  });

  it.each(['source', 'target'])(
    'keeps the original 6 4 dash when the anchor is a reference, for %s direction',
    (handleType) => {
      const reference = { ...origin, type: 'reference', data: { type: 'reference' } };
      const ghost = project({ nodes: [reference], menu: { ...menu, handleType } });
      expect(ghost.edge.style.strokeDasharray).toBe('6 4');
      expect(ghost.edge.style.strokeWidth).toBe(2);
    },
  );

  it('resolves a grouped origin at world coordinates and uses the latest origin geometry', () => {
    const nodes = [
      { id: 'group', type: 'group', position: { x: 400, y: 500 }, data: {} },
      { ...origin, parentId: 'group', measured: { width: 300, height: 400 } },
    ];
    const ghost = project({ nodes });
    expect(ghost.sourcePoint).toEqual({ x: 800, y: 750 });
    expect(ghost.node.position).toEqual(menu.point);
    expect(nodes[1].position).toEqual(origin.position);
    const moved = project({ nodes: nodes.map((node) => ({ ...node, position: { x: 0, y: 0 } })) });
    expect(moved.sourcePoint).toEqual({ x: 300, y: 200 });
    expect(moved.node.position).toEqual(menu.point);
  });

  it('accepts the local rendered-size protocol without letting mismatched source measurements detach the ghost edge', () => {
    const nodes = [{ ...origin, measured: { width: 300, height: 400 } }];
    expect(project({ nodes }).sourcePoint).toEqual({ x: 400, y: 250 });
    expect(project({ nodes, getNodeSize: canvasNodeSize }).sourcePoint).toEqual({
      x: 300,
      y: 150,
    });
    expect(
      project({ nodes, getNodeSize: canvasNodeSize, menu: { ...menu, handleType: 'target' } })
        .targetPoint,
    ).toEqual({ x: 100, y: 150 });
    expect(nodes[0].measured).toEqual({ width: 300, height: 400 });
  });

  it('accepts exact zero and negative world coordinates instead of replacing them with default positions', () => {
    const ghost = project({ menu: { ...menu, point: { x: 0, y: -100 } } });
    expect(ghost.node.position).toEqual({ x: 0, y: -100 });
    expect(ghost.targetPoint).toEqual({ x: -2, y: -99 });
  });

  it('does not create a temporary node for a short port click, which only owns a future creation position', () => {
    expect(project({ menu: { ...menu, point: undefined } })).toBeNull();
    expect(project({ menu: { ...menu, point: null } })).toBeNull();
  });

  it.each([
    { ready: false },
    { readonly: true },
    { menu: null },
    { documentKey: 'B' },
    { menu: { ...menu, documentKey: undefined } },
    { menu: { ...menu, handleType: 'bottom' } },
    { menu: { ...menu, point: { x: NaN, y: 3 } } },
    { menu: { ...menu, point: { x: 1, y: Infinity } } },
    { nodes: [] },
    { nodes: [{ ...origin, hidden: true }] },
    { nodes: [{ ...origin, position: { x: Infinity, y: 3 } }] },
    { nodes: [{ ...origin, measured: { width: 0 } }] },
    { nodes: [{ ...origin, height: NaN }] },
  ])('does not render a ghost for an unavailable or stale owner %j', (patch) => {
    expect(project(patch)).toBeNull();
  });
});

describe('source port-click creation position', () => {
  it('uses the source empty350 size independently of the eventual local candidate dimensions', () => {
    expect(canvasSourceConnectedCreationPosition([origin], 'image', 'source')).toEqual({
      x: 400,
      y: -25,
    });
    expect(canvasSourceConnectedCreationPosition([origin], 'image', 'target')).toEqual({
      x: -350,
      y: -25,
    });
  });

  it('uses measured size before stored size, plus a grouped world position', () => {
    const nodes = [
      { id: 'group', type: 'group', position: { x: 400, y: 500 }, data: {} },
      { ...origin, parentId: 'group', measured: { width: 300, height: 400 } },
    ];
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source')).toEqual({
      x: 900,
      y: 575,
    });
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'target')).toEqual({
      x: 50,
      y: 575,
    });
  });

  it('keeps source empty350 positioning while using the injected local rendered dimensions in both directions', () => {
    const nodes = [{ ...origin, measured: { width: 300, height: 400 } }];
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source')).toEqual({
      x: 500,
      y: 75,
    });
    expect(
      canvasSourceConnectedCreationPosition(nodes, 'image', 'source', {
        getNodeSize: canvasNodeSize,
      }),
    ).toEqual({ x: 400, y: -25 });
    expect(
      canvasSourceConnectedCreationPosition(nodes, 'image', 'target', {
        getNodeSize: canvasNodeSize,
      }),
    ).toEqual({ x: -350, y: -25 });
  });

  it('passes a grouped world origin to a renderer-size adapter while preserving local relative coordinates', () => {
    const nodes = [
      { id: 'group', type: 'group', position: { x: 400, y: 500 }, data: {} },
      { ...origin, parentId: 'group', measured: { width: 300, height: 400 } },
    ];
    const options = { getNodeSize: canvasNodeSize };
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source', options)).toEqual({
      x: 800,
      y: 475,
    });
    expect(project({ nodes, ...options }).sourcePoint).toEqual({ x: 700, y: 650 });
    expect(nodes[1].position).toEqual(origin.position);
  });

  it('keeps explicit media display dimensions isolated from the default source flow dimensions', () => {
    const nodes = [
      {
        ...origin,
        width: 622,
        height: 350,
        measured: { width: 700, height: 400 },
        data: {
          ...origin.data,
          _explicitContentDims: true,
          contentWidth: 200,
          contentHeight: 120,
        },
      },
    ];
    const before = structuredClone(nodes);
    const options = { getNodeSize: canvasNodeSize };
    expect(project({ nodes, ...options }).sourcePoint).toEqual({ x: 300, y: 110 });
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source', options)).toEqual({
      x: 400,
      y: -65,
    });
    expect(project({ nodes }).sourcePoint).toEqual({ x: 800, y: 250 });
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source')).toEqual({
      x: 900,
      y: 75,
    });
    expect(nodes).toEqual(before);
  });

  it('rejects invalid raw source dimensions even when explicit media display dimensions are available', () => {
    const nodes = [
      {
        ...origin,
        width: Infinity,
        height: NaN,
        data: {
          ...origin.data,
          _explicitContentDims: true,
          contentWidth: 200,
          contentHeight: 120,
        },
      },
    ];
    expect(project({ nodes })).toBeNull();
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source')).toBeNull();
    // The manual renderer explicitly supplies its valid visible box.
    expect(project({ nodes, getNodeSize: canvasNodeSize }).sourcePoint).toEqual({
      x: 300,
      y: 110,
    });
  });

  it.each([null, () => null, () => ({ width: Infinity, height: 2 }), () => ({ width: 2 })])(
    'does not invent a renderer size when an explicitly injected adapter is unavailable',
    (getNodeSize) => {
      expect(project({ getNodeSize })).toBeNull();
      expect(
        canvasSourceConnectedCreationPosition([origin], 'image', 'source', { getNodeSize }),
      ).toBeNull();
    },
  );

  it('falls back to source350 dimensions when none are measured or stored', () => {
    const nodes = [{ ...origin, width: undefined, height: undefined }];
    expect(canvasSourceConnectedCreationPosition(nodes, 'image', 'source')).toEqual({
      x: 550,
      y: 50,
    });
    expect(project({ nodes }).sourcePoint).toEqual({ x: 450, y: 225 });
  });

  it.each([
    [[], 'image', 'source'],
    [[origin], 'deleted', 'source'],
    [[origin], 'image', 'top'],
    [[{ ...origin, width: Infinity }], 'image', 'target'],
  ])('rejects an unavailable origin or invalid direction', (nodes, id, direction) => {
    expect(canvasSourceConnectedCreationPosition(nodes, id, direction)).toBeNull();
  });
});

describe('source temporary-edge Bezier', () => {
  it('uses the source .25 curvature for a release behind the initiating output', () => {
    expect(canvasConnectionGhostPath({ x: 300, y: 150 }, { x: 200, y: 300 })).toBe(
      'M300,150 C362.5,150 137.5,300 200,300',
    );
  });
  it.each([
    [null, { x: 3, y: 4 }],
    [
      { x: 1, y: NaN },
      { x: 3, y: 4 },
    ],
  ])('does not create SVG coordinates from missing or invalid positions', (source, target) =>
    expect(canvasConnectionGhostPath(source, target)).toBeNull(),
  );
});
