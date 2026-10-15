import { describe, expect, it, vi } from 'vitest';
import {
  beginCanvasGroupResize,
  projectCanvasGroupResize,
  finalizeCanvasGroupResize,
  CANVAS_GROUP_RESIZE_DIRECTIONS,
  CANVAS_GROUP_RESIZE_MIN_SIZE,
} from './group-resize-model.js';

const group = (rest = {}) => ({
  id: 'g',
  type: 'group',
  position: { x: 100, y: 200 },
  width: 500,
  height: 400,
  data: { name: 'Group', childNodeIds: ['stale'], groupLayoutMode: 'vertical' },
  ...rest,
});
const child = (id = 'a', rest = {}) => ({
  id,
  type: 'image',
  parentId: 'g',
  position: { x: 30, y: 50 },
  width: 100,
  height: 80,
  data: { params: { settings: { ratio: '1:1' } }, url: ['sample'] },
  ...rest,
});
const begin = (nodes, direction = 'bottom-right', rest = {}) =>
  beginCanvasGroupResize({ nodes, groupId: 'g', direction, ...rest });
const project = (session, x, y) => projectCanvasGroupResize({ session, delta: { x, y } });
const finish = (session, x, y, rest = {}) =>
  finalizeCanvasGroupResize({ session, delta: { x, y }, ...rest });
const at = (plan, id = 'g') => plan.nodes.find((node) => node.id === id);
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const world = (nodes, id) => {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  let x = 0,
    y = 0,
    node = lookup.get(id);
  while (node) {
    x += node.position.x;
    y += node.position.y;
    node = lookup.get(node.parentId);
  }
  return { x, y };
};

describe('source ordinary group resize', () => {
  it('exports four lines, four corners and source min bounds', () => {
    expect(CANVAS_GROUP_RESIZE_DIRECTIONS).toEqual([
      'top',
      'right',
      'bottom',
      'left',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]);
    expect(CANVAS_GROUP_RESIZE_MIN_SIZE).toEqual({ width: 120, height: 80 });
  });

  it.each([
    ['top', { x: 100, y: 225, width: 500, height: 375 }],
    ['right', { x: 100, y: 200, width: 540, height: 400 }],
    ['bottom', { x: 100, y: 200, width: 500, height: 425 }],
    ['left', { x: 140, y: 200, width: 460, height: 400 }],
    ['top-left', { x: 140, y: 225, width: 460, height: 375 }],
    ['top-right', { x: 100, y: 225, width: 540, height: 375 }],
    ['bottom-left', { x: 140, y: 200, width: 460, height: 425 }],
    ['bottom-right', { x: 100, y: 200, width: 540, height: 425 }],
  ])(
    'projects %s from the original pointer and compensates direct children',
    (direction, expected) => {
      const nodes = freeze([
        group(),
        child(),
        child('b', {
          hidden: true,
          temporary: true,
          type: 'reference',
          position: { x: 70, y: 80 },
        }),
        child('nested', { type: 'group', position: { x: 220, y: 120 } }),
        child('grandchild', { parentId: 'nested', position: { x: 5, y: 6 } }),
        { id: 'other', type: 'text', position: { x: 900, y: 900 }, data: { content: 'unrelated' } },
      ]);
      const initial = begin(nodes, direction);
      expect(initial.valid).toBe(true);
      expect(Object.isFrozen(initial.session)).toBe(true);
      const result = project(initial.session, 40.9, 25.9);
      expect(result).toMatchObject({ valid: true, changed: true, candidate: expected });
      expect(at(result)).toMatchObject({
        position: { x: expected.x, y: expected.y },
        width: expected.width,
        height: expected.height,
        measured: { width: expected.width, height: expected.height },
        resizing: true,
      });
      for (const id of ['a', 'b', 'nested', 'grandchild'])
        expect(world(result.nodes, id)).toEqual(world(nodes, id));
      expect(at(result, 'grandchild')).toBe(nodes[4]);
      expect(at(result, 'other')).toBe(nodes[5]);
      expect(at(result).data).toBe(nodes[0].data);
      expect(at(result, 'a').data).toBe(nodes[1].data);
      const direct = project(initial.session, 50, 30);
      expect(at(direct, 'a').position).toEqual({
        x: 30 - (direction.includes('left') ? 50 : 0),
        y: 50 - (direction.includes('top') ? 30 : 0),
      });
    },
  );

  it.each([
    ['top', { x: 100, y: 160, width: 500, height: 440 }],
    ['right', { x: 100, y: 200, width: 460, height: 400 }],
    ['bottom', { x: 100, y: 200, width: 500, height: 360 }],
    ['left', { x: 60, y: 200, width: 540, height: 400 }],
    ['top-left', { x: 60, y: 160, width: 540, height: 440 }],
    ['top-right', { x: 100, y: 160, width: 460, height: 440 }],
    ['bottom-left', { x: 60, y: 200, width: 540, height: 360 }],
    ['bottom-right', { x: 100, y: 200, width: 460, height: 360 }],
  ])('projects negative %s motion without changing the opposite edge', (direction, expected) => {
    expect(project(begin([group()], direction).session, -40, -40).candidate).toEqual(expected);
  });

  it('floors negative flow deltas and ignores irrelevant axes', () => {
    const session = begin([group()], 'right').session;
    expect(project(session, -0.01, 99).candidate).toEqual({
      x: 100,
      y: 200,
      width: 499,
      height: 400,
    });
    expect(project(session, 0.99, -0.99)).toMatchObject({ changed: false });
    expect(project(session, 0.99, -0.99).nodes).toBe(session.nodes);
  });

  it.each([
    ['bottom-right', -1000, -1000, { x: 100, y: 200, width: 120, height: 80 }],
    ['top-left', 1000, 1000, { x: 480, y: 520, width: 120, height: 80 }],
  ])('clamps %s to min120x80 while preserving its opposite anchor', (direction, x, y, expected) => {
    const session = begin([group(), child()], direction).session;
    expect(project(session, x, y).candidate).toEqual(expected);
    expect(world(project(session, x, y).nodes, 'a')).toEqual(world(session.nodes, 'a'));
  });

  it.each(['extent', 'expandParent'])(
    'constrains shrinking to %s children without final12padding',
    (gate) => {
      const c = child('a', {
        position: { x: 30, y: 50 },
        width: 400,
        height: 300,
        ...(gate === 'extent' ? { extent: 'parent' } : { expandParent: true }),
      });
      const nodes = [group(), c];
      expect(project(begin(nodes, 'top-left').session, 200, 200).candidate).toEqual({
        x: 130,
        y: 250,
        width: 470,
        height: 350,
      });
      expect(project(begin(nodes, 'bottom-right').session, -300, -300).candidate).toEqual({
        x: 100,
        y: 200,
        width: 430,
        height: 350,
      });
      const stop = finish(begin(nodes, 'top-left').session, 200, 200);
      expect(stop.bounds).toEqual({ x: 118, y: 238, width: 482, height: 362 });
      expect(at(stop, 'a').position).toEqual({ x: 12, y: 12 });
    },
  );

  it('uses union of constrained children and does not clamp to unconstrained siblings', () => {
    const nodes = [
      group(),
      child('a', { extent: 'parent', position: { x: 30, y: 50 } }),
      child('b', { extent: 'parent', position: { x: 250, y: 160 }, width: 200, height: 200 }),
      child('free', { position: { x: 900, y: 900 } }),
    ];
    expect(project(begin(nodes).session, -1000, -1000).candidate).toEqual({
      x: 100,
      y: 200,
      width: 450,
      height: 360,
    });
  });

  it('honors explicit group extent during outward expansion', () => {
    const nodes = [
      group({
        extent: [
          [0, 0],
          [800, 700],
        ],
      }),
    ];
    expect(project(begin(nodes, 'top-left').session, -999, -999).candidate).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 600,
    });
    expect(project(begin(nodes).session, 999, 999).candidate).toEqual({
      x: 100,
      y: 200,
      width: 700,
      height: 500,
    });
  });

  it('keeps parent-relative coordinates and child/grandchild world points through final corrections', () => {
    const nodes = [
      group({ id: 'ancestor', position: { x: 900, y: 600 }, width: 1200, height: 1000 }),
      group({ parentId: 'ancestor', extent: 'parent' }),
      child(),
      child('nested', { type: 'group', position: { x: 180, y: 140 } }),
      child('grandchild', { parentId: 'nested', position: { x: 7, y: 9 } }),
    ];
    const session = begin(nodes, 'top-left').session;
    const result = finish(session, 100, 90);
    expect(result.candidate).toEqual({ x: 200, y: 290, width: 400, height: 310 });
    expect(result.bounds).toEqual({ x: 118, y: 238, width: 482, height: 362 });
    for (const id of ['a', 'nested', 'grandchild'])
      expect(world(result.nodes, id)).toEqual(world(nodes, id));
    expect(at(result, 'ancestor')).toBe(nodes[0]);
    expect(at(result, 'grandchild')).toBe(nodes[4]);
  });

  it('finalize grows only the direct ordinary parent and compensates all siblings in one plan', () => {
    const nodes = freeze([
      group({ id: 'root', position: { x: 1000, y: 1000 }, width: 50, height: 50 }),
      group({ id: 'p', parentId: 'root', position: { x: 80, y: 100 }, width: 250, height: 180 }),
      group({ parentId: 'p', position: { x: 10, y: 20 }, width: 200, height: 150 }),
      child('a', { position: { x: 30, y: 50 } }),
      child('sibling', { parentId: 'p', position: { x: 50, y: 60 }, width: 50, height: 40 }),
    ]);
    const getNodeSize = (node) => ({ width: node.width ?? 200, height: node.height ?? 120 });
    const session = begin(nodes, 'bottom-right', { getNodeSize }).session;
    const result = finish(session, 100, 100);
    expect(result).toMatchObject({ valid: true, changed: true });
    expect(at(result, 'p')).toMatchObject({
      position: { x: 70, y: 64 },
      width: 340,
      height: 326,
      measured: { width: 340, height: 326 },
    });
    expect(result.bounds).toEqual({ x: 20, y: 56, width: 300, height: 250 });
    expect(at(result, 'sibling').position).toEqual({ x: 60, y: 96 });
    expect(at(result, 'p').data).toBe(nodes[1].data);
    for (const id of ['g', 'a', 'sibling'])
      expect(world(result.nodes, id)).toEqual(world(nodes, id));
    expect(at(result, 'root')).toBe(nodes[0]);
  });

  it('uses source pF20/56 padding for the direct parent, distinct from tB12', () => {
    const nodes = [
      group({ id: 'p', width: 300, height: 300 }),
      group({ parentId: 'p', position: { x: 0, y: 0 }, width: 200, height: 150 }),
    ];
    const result = finish(begin(nodes).session, 10, 10);
    expect(at(result, 'p')).toMatchObject({ position: { x: 80, y: 144 }, width: 320, height: 356 });
    expect(result.bounds).toEqual({ x: 20, y: 56, width: 210, height: 160 });
    expect(world(result.nodes, 'g')).toEqual(world(nodes, 'g'));
  });

  it('retains exact pF standalone-parent no-op and strict true rather than truthy gate', () => {
    const nodes = [
      group({ id: 'p', width: 300, height: 300, data: { standaloneStoryboardImageGrid: true } }),
      group({ parentId: 'p', position: { x: 0, y: 0 }, width: 200, height: 150 }),
    ];
    const result = finish(begin(nodes).session, 10, 10);
    expect(at(result, 'p')).toBe(nodes[0]);
    expect(result.bounds).toEqual({ x: 0, y: 0, width: 210, height: 160 });
    const legacy = [{ ...nodes[0], data: { standaloneStoryboardImageGrid: 'legacy' } }, nodes[1]];
    expect(at(finish(begin(legacy).session, 10, 10), 'p')).not.toBe(legacy[0]);
  });

  it.each([
    { type: 'group', breakdownSourceNodeId: 'source' },
    { type: 'group', longVideoSegmentGroup: true },
  ])('rejects exact special direct parent instead of applying generic pF: %j', (data) => {
    const nodes = [group({ id: 'p', data }), group({ parentId: 'p' })];
    expect(begin(nodes)).toMatchObject({
      valid: false,
      nodes,
      reason: 'Unsupported special parent resize-end layout',
    });
  });

  it.each([
    { breakdownSourceNodeId: 'source', longVideoSegmentGroup: true },
    { type: 'group', breakdownSourceNodeId: '' },
    { type: 'image', breakdownSourceNodeId: 'source' },
    { type: 'group', longVideoSegmentGroup: 'true' },
  ])('does not infer special-parent gates from incomplete markers: %j', (data) => {
    expect(begin([group({ id: 'p', data }), group({ parentId: 'p' })]).valid).toBe(true);
  });

  it('an indirect special ancestor does not block the direct-parent-only source protocol', () => {
    const nodes = [
      group({ id: 'root', data: { type: 'group', breakdownSourceNodeId: 'source' } }),
      group({ id: 'p', parentId: 'root' }),
      group({ parentId: 'p' }),
    ];
    const initial = begin(nodes);
    expect(initial.valid).toBe(true);
    expect(at(finish(initial.session, 10, 10), 'root')).toBe(nodes[0]);
  });

  it('clamps a parent-relative group to parent measured bounds', () => {
    const nodes = [
      group({ id: 'p', width: 2000, height: 2000, measured: { width: 800, height: 700 } }),
      group({ parentId: 'p', extent: 'parent' }),
    ];
    expect(project(begin(nodes).session, 900, 900).candidate).toEqual({
      x: 100,
      y: 200,
      width: 700,
      height: 500,
    });
  });

  it('applies source tB to unconstrained right/bottom overflow and includes hidden temporary children', () => {
    const nodes = [
      group(),
      child('a', {
        position: { x: 450, y: 390 },
        hidden: true,
        temporary: true,
        type: 'reference',
      }),
    ];
    const result = finish(begin(nodes).session, -200, -200);
    expect(result.bounds).toEqual({ x: 100, y: 200, width: 562, height: 482 });
    expect(at(result).data).toEqual({ ...nodes[0].data, nodeWidth: 562, nodeHeight: 482 });
    expect(at(result, 'a')).toBe(nodes[1]);
    // RF onEnd fires after tB with the original candidate measured dimensions.
    expect(at(result).measured).toEqual({ width: 300, height: 200 });
    expect(at(result).resizing).toBe(false);
  });

  it('retains exact tB width math when left compensation and right overflow coincide', () => {
    const nodes = [group(), child('a', { position: { x: -20, y: 20 }, width: 600, height: 80 })];
    const result = finish(begin(nodes, 'right').session, 10, 0);
    expect(result.bounds).toEqual({ x: 68, y: 200, width: 592, height: 400 });
    expect(at(result, 'a').position).toEqual({ x: 12, y: 20 });
    expect(world(result.nodes, 'a')).toEqual(world(nodes, 'a'));
  });

  it('empty stop changes geometry without data/style cleanup, fit or membership changes', () => {
    const nodes = [
      group({
        style: { width: 777, height: 555, color: 'red' },
        data: { label: 'Legacy', childNodeIds: [] },
      }),
    ];
    const result = finish(begin(nodes).session, 20, 10);
    expect(at(result).data).toBe(nodes[0].data);
    expect(at(result).style).toBe(nodes[0].style);
    expect(at(result)).toMatchObject({ width: 520, height: 410, resizing: false });
    expect(result.fitGroupId).toBeUndefined();
  });

  it('nonempty stop keeps metadata except source size fields and canonical legacy title', () => {
    const nodes = [
      group({
        data: { label: 'Legacy', childNodeIds: ['gone'], groupLayoutMode: 'grid', extra: { x: 1 } },
      }),
      child(),
    ];
    const result = finish(begin(nodes).session, 20, 10);
    expect(at(result).data).toEqual({
      name: 'Legacy',
      childNodeIds: ['gone'],
      groupLayoutMode: 'grid',
      extra: { x: 1 },
      nodeWidth: 520,
      nodeHeight: 410,
    });
    expect(at(result).data.extra).toBe(nodes[0].data.extra);
    expect(at(result, 'a').parentId).toBe('g');
  });

  it.each([
    { sourceScriptNodeId: 'script', storyboardGroupType: 'image' },
    { sourceScriptNodeId: 'script', storyboardGroupType: undefined },
    { storyboardGroupType: 'video' },
    { characterAsset: { roleName: 'character' } },
    { standaloneStoryboardImageGrid: true, storyboardGroupType: 'video' },
  ])('allows ordinary and script-image source caller data %j', (data) => {
    expect(begin([group({ data })]).valid).toBe(true);
  });

  it.each([
    { sourceScriptNodeId: 'script', storyboardGroupType: 'video' },
    { standaloneStoryboardImageGrid: true, storyboardGroupType: 'image' },
    { standaloneStoryboardImageGrid: 'legacy-truthy', storyboardGroupType: 'image' },
  ])('rejects exact excluded source caller data %j', (data) => {
    const nodes = [group({ data })];
    expect(begin(nodes)).toMatchObject({ valid: false, nodes });
  });

  it('uses measured-first source dimensions and200x120 final child fallback', () => {
    const nodes = [
      group({ measured: { width: 450, height: 320 } }),
      child('a', { width: undefined, height: undefined, position: { x: 400, y: 300 } }),
    ];
    const result = finish(begin(nodes).session, 10, 10);
    expect(result.candidate).toEqual({ x: 100, y: 200, width: 460, height: 330 });
    expect(result.bounds).toEqual({ x: 100, y: 200, width: 612, height: 432 });
  });

  it('caller size injection is explicit for group preview, constrained children and final bounds', () => {
    const nodes = [
      group({ measured: { width: 999, height: 999 } }),
      child('a', { extent: 'parent' }),
    ];
    const getNodeSize = vi.fn((node, { phase, role }) =>
      role === 'group'
        ? { width: 500, height: 400 }
        : phase === 'preview'
          ? { width: 200, height: 150 }
          : { width: 250, height: 180 },
    );
    const session = begin(nodes, 'bottom-right', { getNodeSize }).session;
    const result = finish(session, -1000, -1000);
    expect(result.candidate).toEqual({ x: 100, y: 200, width: 230, height: 200 });
    expect(result.bounds).toEqual({ x: 100, y: 200, width: 292, height: 242 });
    expect(getNodeSize.mock.calls.map(([, context]) => context)).toEqual([
      { phase: 'preview', role: 'group' },
      { phase: 'preview', role: 'child' },
      { phase: 'finalize', role: 'child' },
    ]);
  });

  it('a floor0 gesture does not repair existing padding or write metadata', () => {
    const nodes = [group(), child('a', { position: { x: -20, y: -30 } })];
    const result = finish(begin(nodes).session, 0.99, 0.99);
    expect(result).toMatchObject({ valid: true, changed: false });
    expect(result.nodes).toBe(nodes);
  });

  it('a completely constrained gesture does not run tB without an earlier effective resize', () => {
    const nodes = [
      group(),
      child('a', { extent: 'parent', position: { x: 0, y: 0 }, width: 500, height: 400 }),
    ];
    const session = begin(nodes).session;
    expect(finish(session, -200, -200)).toMatchObject({ valid: true, changed: false });
    expect(finish(session, -200, -200).nodes).toBe(nodes);
  });

  it('honors source didResize after a real preview returns to its initial point', () => {
    const nodes = [group(), child('a', { position: { x: 0, y: 0 } })];
    const session = begin(nodes).session;
    expect(project(session, 10, 10).changed).toBe(true);
    const result = finish(session, 0, 0, { didResize: true });
    expect(result.bounds).toEqual({ x: 88, y: 188, width: 512, height: 412 });
    expect(at(result, 'a').position).toEqual({ x: 12, y: 12 });
    expect(world(result.nodes, 'a')).toEqual(world(nodes, 'a'));
  });

  it('does not serialize or clone unrelated large payloads during resize', () => {
    const toJSON = vi.fn(() => {
      throw new Error('must not serialize');
    });
    const payload = { toJSON, content: 'large payload represented by a shared object' };
    const nodes = [
      group({ data: { name: 'Group', payload } }),
      child(),
      { id: 'other', position: { x: 0, y: 0 }, data: payload },
    ];
    const result = finish(begin(nodes, 'left').session, 100, 0);
    expect(toJSON).not.toHaveBeenCalled();
    expect(at(result, 'other')).toBe(nodes[2]);
    expect(at(result).data.payload).toBe(payload);
  });

  it.each([
    [],
    [group({ type: 'video_group' })],
    [group({ width: NaN })],
    [group({ width: 0 })],
    [group(), group()],
    [group({ data: 'invalid' })],
    [group({ parentId: 'missing' })],
    [group({ parentId: 'p' }), group({ id: 'p', parentId: 'g' })],
    [group({ origin: [0.5, 0.5] })],
    [group(), child('a', { origin: [0.5, 0] })],
    [
      group({
        extent: [
          [1, 0],
          [0, 100],
        ],
      }),
    ],
    [group(), child('a', { position: { x: Infinity, y: 0 } })],
    [group(), child('a', { measured: { width: NaN, height: 20 } })],
    [group({ parentId: 'p', expandParent: true }), group({ id: 'p' })],
  ])('rejects corrupt or unimplemented graph atomically: %j', (nodes) => {
    const result = begin(nodes);
    expect(result).toMatchObject({ valid: false, changed: false });
    expect(result.nodes).toBe(nodes);
  });

  it('rejects malformed API input and leaves immutable source graph untouched', () => {
    const nodes = freeze([group(), child()]);
    expect(begin(nodes, 'diagonal').valid).toBe(false);
    expect(begin(nodes, 'right', { getNodeSize: () => null }).valid).toBe(false);
    const session = begin(nodes).session;
    expect(project(session, NaN, 0)).toMatchObject({ valid: false, nodes });
    expect(finish(session, Infinity, 1)).toMatchObject({ valid: false, nodes });
    expect(projectCanvasGroupResize({}).valid).toBe(false);
    expect(finalizeCanvasGroupResize({}).valid).toBe(false);
    const first = finish(session, 20, 30);
    const second = finish(session, 20, 30);
    expect(first).toEqual(second);
    expect(nodes[0]).toEqual(group());
    expect(nodes[1]).toEqual(child());
  });
});
