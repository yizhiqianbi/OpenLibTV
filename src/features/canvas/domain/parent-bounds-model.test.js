import { describe, expect, it, vi } from 'vitest';
import { planCanvasParentBounds } from './parent-bounds-model.js';
import { canvasWorldPosition } from './groups.js';

const group = (id = 'group', patch = {}) => ({
  id,
  type: 'group',
  position: { x: 300, y: 400 },
  width: 100,
  height: 100,
  data: { childNodeIds: [], name: '组', nodeWidth: 99, layoutMode: 'custom' },
  ...patch,
});
const child = (id = 'child', patch = {}) => ({
  id,
  type: 'image',
  parentId: 'group',
  position: { x: 0, y: 0 },
  width: 40,
  height: 30,
  data: {},
  ...patch,
});
const plan = (nodes, options = {}) =>
  planCanvasParentBounds({ nodes, groupIds: ['group'], ...options });
const node = (result, id = 'group') => result.nodes.find((entry) => entry.id === id);
const world = (nodes, id) =>
  canvasWorldPosition(
    nodes.find((entry) => entry.id === id),
    new Map(nodes.map((n) => [n.id, n])),
  );

describe('source pF parent grow plan', () => {
  it('grows left and title padding, compensates every child, and preserves source fields and world position', () => {
    const target = group();
    const image = child();
    const unrelated = child('root', { parentId: undefined });
    const nodes = [image, unrelated, target];
    const snapshot = structuredClone(nodes);
    const result = plan(nodes);
    expect(result).toMatchObject({ valid: true, changed: true, changedGroupIds: ['group'] });
    expect(node(result)).toMatchObject({
      width: 120,
      height: 156,
      position: { x: 280, y: 344 },
      measured: { width: 120, height: 156 },
      data: target.data,
    });
    expect(node(result, 'child').position).toEqual({ x: 20, y: 56 });
    expect(world(result.nodes, 'child')).toEqual(world(nodes, 'child'));
    expect(node(result, 'root')).toBe(unrelated);
    expect(result.nodes.map((entry) => entry.id)).toEqual(nodes.map((entry) => entry.id));
    expect(nodes).toEqual(snapshot);
  });

  it('grows right and bottom without replacing already suitable child positions', () => {
    const image = child('child', { position: { x: 80, y: 90 } });
    const target = group();
    const result = plan([target, image]);
    expect(node(result)).toMatchObject({
      position: target.position,
      width: 140,
      height: 140,
      measured: { width: 140, height: 140 },
    });
    expect(node(result, 'child')).toBe(image);
  });

  it('combines all four growth amounts rather than fitting or shrinking the shell', () => {
    const a = child('a', { position: { x: -10, y: -20 } });
    const b = child('b', { position: { x: 90, y: 100 } });
    const result = plan([group(), a, b]);
    expect(node(result)).toMatchObject({ width: 180, height: 226, position: { x: 270, y: 324 } });
    expect(node(result, 'a').position).toEqual({ x: 20, y: 56 });
    expect(node(result, 'b').position).toEqual({ x: 120, y: 176 });
  });

  it('is grow-only and retains original graph references once all margins are sufficient', () => {
    const nodes = [
      group('group', { width: 1000, height: 1000 }),
      child('child', { position: { x: 20, y: 56 } }),
    ];
    expect(plan(nodes)).toEqual({ valid: true, changed: false, nodes, changedGroupIds: [] });
    const first = plan([group(), child()]);
    expect(plan(first.nodes).nodes).toBe(first.nodes);
    expect(plan(first.nodes).changed).toBe(false);
  });

  it.each(['group', 'video_group'])(
    'grows eligible source type %s without a derived-group data gate',
    (type) => {
      expect(plan([group('group', { type, data: {} }), child()]).changed).toBe(true);
    },
  );

  it.each(['image', 'video', 'script', 'script-v2', 'character'])(
    'skips source-ineligible type %s',
    (type) => {
      const nodes = [group('group', { type }), child()];
      expect(plan(nodes)).toMatchObject({ valid: true, changed: false, nodes });
    },
  );

  it('skips standalone grids, missing groups and childless shells without sizing anything', () => {
    const getNodeSize = vi.fn();
    const nodes = [
      group('group', { data: { standaloneStoryboardImageGrid: true } }),
      child(),
      group('empty'),
    ];
    expect(plan(nodes, { groupIds: ['group', 'empty', 'missing'], getNodeSize }).nodes).toBe(nodes);
    expect(getNodeSize).not.toHaveBeenCalled();
  });

  it('uses actual direct membership including hidden/type/temporary children, ignoring child metadata and grandchildren', () => {
    const nodes = [
      group('group', { data: { childNodeIds: ['stale'] } }),
      child('hidden', { hidden: true, position: { x: -10, y: 60 } }),
      child('__temp_connection_node__', { type: 'temp', position: { x: 20, y: 90 } }),
      child('script', { type: 'script', position: { x: 80, y: 60 } }),
      child('grandchild', { parentId: 'hidden', position: { x: -1000, y: -1000 } }),
    ];
    const result = plan(nodes);
    expect(node(result)).toMatchObject({ width: 170, height: 140, position: { x: 270, y: 400 } });
    expect(node(result).data).toBe(nodes[0].data);
    expect(node(result, 'grandchild')).toBe(nodes[4]);
    for (const id of ['hidden', '__temp_connection_node__', 'script', 'grandchild'])
      expect(world(result.nodes, id)).toEqual(world(nodes, id));
  });

  it('uses stored group dimensions before measured, preserving measured extras only when unchanged', () => {
    const target = group('group', { measured: { width: 900, height: 900, old: true } });
    const result = plan([target, child()]);
    expect(node(result).measured).toEqual({ width: 120, height: 156 });
    const measuredOnly = group('group', {
      width: undefined,
      height: undefined,
      measured: { width: 100, height: 100 },
    });
    expect(node(plan([measuredOnly, child()])).width).toBe(120);
    const zero = group('group', { width: 0, height: 0 });
    expect(node(plan([zero, child()]))).toMatchObject({ width: 80, height: 106 });
  });

  it('preserves nested world positions, processes group IDs in source order, and deduplicates IDs', () => {
    const outer = group('outer', { position: { x: 100, y: 200 }, width: 500, height: 500 });
    const inner = group('group', { parentId: 'outer', position: { x: 0, y: 0 } });
    const image = child();
    const nodes = [outer, inner, image];
    const result = plan(nodes, { groupIds: ['group', 'outer', 'group'] });
    expect(result.changedGroupIds).toEqual(['group', 'outer']);
    expect(world(result.nodes, 'child')).toEqual(world(nodes, 'child'));
    expect(node(result, 'outer').width).toBeGreaterThanOrEqual(outer.width);
    expect(node(result, 'group').width).toBe(120);
  });
});

describe('source estimateNodeFlowSize priorities and explicit renderer adapter', () => {
  const sizePlan = (patch, options = {}) =>
    plan(
      [
        group('group', { width: 0, height: 0 }),
        child('child', { position: { x: 20, y: 56 }, ...patch }),
      ],
      options,
    );
  const expandedSize = (result) => ({
    width: node(result).width - 40,
    height: node(result).height - 76,
  });

  it.each([
    [true, { width: 70, height: 80 }],
    [false, { width: 90, height: 100 }],
  ])(
    'uses matching media display size after explicit=%s content priority',
    (explicit, expected) => {
      const result = sizePlan({
        data: {
          _explicitContentDims: explicit,
          contentWidth: 70,
          contentHeight: 80,
          url: ['current'],
          mediaDisplaySize: { sourceUrl: 'current', width: 90, height: 100 },
          params: { settings: { ratio: '16:9' } },
        },
      });
      expect(expandedSize(result)).toEqual(expected);
    },
  );

  it('rejects stale media URL and uses legacy content dimensions before cache or ratio', () => {
    const lookupImageDim = vi.fn(() => ({ width: 900, height: 900 }));
    const result = sizePlan(
      {
        data: {
          contentWidth: 70,
          contentHeight: 80,
          url: ['current'],
          mediaDisplaySize: { sourceUrl: 'old', width: 90, height: 100 },
          params: { settings: { ratio: '16:9' } },
        },
      },
      { lookupImageDim },
    );
    expect(expandedSize(result)).toEqual({ width: 70, height: 80 });
    expect(lookupImageDim).not.toHaveBeenCalled();
  });

  it('uses a valid cache hit for the first array URL before ratio, measured or stored', () => {
    const lookupImageDim = vi.fn(() => ({ width: 80, height: 90 }));
    const result = sizePlan(
      {
        measured: { width: 100, height: 110 },
        data: {
          url: ['first', 'second'],
          params: { settings: { ratio: '16:9' } },
        },
      },
      { lookupImageDim },
    );
    expect(lookupImageDim).toHaveBeenCalledExactlyOnceWith('first');
    expect(expandedSize(result)).toEqual({ width: 80, height: 90 });
  });

  it('skips invalid cache and uses extracted ratio before measured and stored, including a source invalid-ratio square', () => {
    const lookupImageDim = vi.fn(() => ({ width: 0, height: 80 }));
    const result = sizePlan(
      {
        measured: { width: 100, height: 110 },
        data: {
          url: ['first'],
          params: { settings: { ratio: '16:9' } },
        },
      },
      { lookupImageDim },
    );
    expect(expandedSize(result)).toEqual({ width: 622, height: 350 });
    expect(
      expandedSize(
        sizePlan({
          measured: { width: 100, height: 110 },
          data: { params: { settings: { ratio: 'invalid' } } },
        }),
      ),
    ).toEqual({ width: 350, height: 350 });
  });

  it.each([
    [{ measured: { width: 100, height: 110 } }, { width: 100, height: 110 }],
    [{ measured: { width: 0, height: 110 } }, { width: 40, height: 30 }],
    [
      { width: 0, height: 30 },
      { width: 350, height: 350 },
    ],
    [
      { width: '50', height: '50' },
      { width: 350, height: 350 },
    ],
  ])(
    'uses finite positive measured pairs, then stored pairs, then the source empty default %j',
    (patch, expected) => {
      expect(expandedSize(sizePlan(patch))).toEqual(expected);
    },
  );

  it('does not infer source dimensions from resourceMeta or a scalar URL', () => {
    const lookupImageDim = vi.fn();
    const result = sizePlan(
      {
        data: {
          url: 'scalar',
          resourceMeta: { width: 800, height: 900 },
          mediaDisplaySize: { sourceUrl: 'scalar', width: 100, height: 200 },
        },
      },
      { lookupImageDim },
    );
    expect(expandedSize(result)).toEqual({ width: 40, height: 30 });
    expect(lookupImageDim).not.toHaveBeenCalled();
  });

  it('lets the caller inject actual renderer child bounds while retaining source group-size priority', () => {
    const getNodeSize = vi.fn(() => ({ width: 800, height: 900 }));
    const result = sizePlan(
      { data: { _explicitContentDims: true, contentWidth: 1, contentHeight: 2 } },
      { getNodeSize },
    );
    expect(expandedSize(result)).toEqual({ width: 800, height: 900 });
    expect(getNodeSize).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'child' }), {
      role: 'bounds',
      surface: 'node',
    });
  });
});

describe('parent bounds atomic local-document guards', () => {
  it.each([undefined, {}, [group(), group()], [group('')], [null]])(
    'rejects malformed graph %j without publishing changes',
    (nodes) => {
      expect(plan(nodes)).toEqual({ valid: false, changed: false, nodes, changedGroupIds: [] });
    },
  );

  it.each([null, {}, [''], [1]])('rejects malformed target ID input %j', (groupIds) => {
    const nodes = [group(), child()];
    expect(plan(nodes, { groupIds })).toMatchObject({ valid: false, changed: false, nodes });
  });

  it.each([{ position: { x: NaN, y: 0 } }, { width: -1 }, { height: Infinity }, { width: '100' }])(
    'rejects invalid relevant group geometry %j',
    (patch) => {
      const nodes = [group('group', patch), child()];
      expect(plan(nodes).nodes).toBe(nodes);
      expect(plan(nodes).valid).toBe(false);
    },
  );

  it('does not expose an earlier valid group update if a later group, adapter or cache fails', () => {
    const nodes = [
      group(),
      child(),
      group('later'),
      child('bad', { parentId: 'later', position: { x: NaN, y: 0 } }),
    ];
    expect(plan(nodes, { groupIds: ['group', 'later'] })).toEqual({
      valid: false,
      changed: false,
      nodes,
      changedGroupIds: [],
    });
    const valid = [group(), child()];
    for (const getNodeSize of [
      () => ({ width: -1, height: 30 }),
      () => {
        throw new Error('adapter');
      },
    ])
      expect(plan(valid, { getNodeSize }).nodes).toBe(valid);
    const cached = [group(), child('child', { data: { url: ['url'] } })];
    expect(
      plan(cached, {
        lookupImageDim: () => {
          throw new Error('cache');
        },
      }).valid,
    ).toBe(false);
  });

  it('supports safe repeated pure updater calls on the same input and leaves input unchanged', () => {
    const nodes = [group(), child()];
    const snapshot = structuredClone(nodes);
    expect(plan(nodes)).toEqual(plan(nodes));
    expect(nodes).toEqual(snapshot);
    expect(plan(nodes, { groupIds: [] }).nodes).toBe(nodes);
  });
});
