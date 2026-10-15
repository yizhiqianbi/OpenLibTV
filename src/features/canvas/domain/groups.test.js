// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  canvasSelectionRoots,
  canvasWorldNodes,
  canvasWorldPosition,
  createCanvasGroup,
  layoutCanvasNodes,
  ungroupCanvasNodes,
} from './groups.js';
import { duplicateCanvasSelection, removeCanvasNodes } from '../model.js';
import { fitCanvasView, selectIntersectingNodes } from '../geometry.js';
const group = {
  id: 'g',
  type: 'group',
  position: { x: 1000, y: -300 },
  width: 800,
  height: 600,
  data: { name: '组', childNodeIds: ['a', 'b'] },
};
const a = {
  id: 'a',
  type: 'image',
  parentId: 'g',
  position: { x: 36, y: 66 },
  width: 100,
  height: 80,
  data: { name: 'A', url: ['a.png'], params: { prompt: '原文' } },
};
const b = {
  ...a,
  id: 'b',
  position: { x: 236, y: 66 },
  width: 200,
  height: 120,
  data: { name: 'B', url: ['b.png'] },
};
const nodes = [a, b, group];
describe('canvas parent-relative coordinates and ordinary group operations', () => {
  it('grouping and ungrouping do not rewrite an unrelated storyboard preferred order', () => {
    const unrelated = {
      ...group,
      id: 'storyboard',
      data: {
        name: '分镜',
        standaloneStoryboardImageGrid: true,
        storyboardGroupType: 'image',
        childNodeIds: ['second', 'first'],
      },
    };
    const first = { ...a, id: 'first', parentId: unrelated.id };
    const second = { ...b, id: 'second', parentId: unrelated.id };
    const graph = [
      unrelated,
      first,
      second,
      { ...a, parentId: undefined },
      { ...b, parentId: undefined },
    ];
    const created = createCanvasGroup(graph, ['a', 'b'], { makeId: () => 'new-group' });
    expect(created.nodes.find((node) => node.id === unrelated.id)).toBe(unrelated);
    const ungrouped = ungroupCanvasNodes(created.nodes, 'new-group');
    expect(ungrouped.nodes.find((node) => node.id === unrelated.id)).toBe(unrelated);
    expect(unrelated.data.childNodeIds).toEqual(['second', 'first']);
    expect(ungrouped.nodes.find((node) => node.id === 'a').parentId).toBeUndefined();
  });
  it('resolves nested world coordinates independently of source array order, without changing saved relative positions', () => {
    const nested = {
      ...group,
      id: 'inner',
      parentId: 'g',
      position: { x: 20, y: 30 },
      data: { childNodeIds: ['leaf'] },
    };
    const leaf = { ...a, id: 'leaf', parentId: 'inner' };
    expect(canvasWorldPosition(leaf, [leaf, nested, group])).toEqual({ x: 1056, y: -204 });
    expect(canvasWorldNodes(nodes)[0].position).toEqual({ x: 1036, y: -234 });
    expect(a.position).toEqual({ x: 36, y: 66 });
  });
  it('bounds malformed parent cycles rather than looping', () => {
    expect(
      canvasWorldPosition({ ...group, parentId: 'a' }, [{ ...group, parentId: 'a' }, a]),
    ).toEqual({ x: 1036, y: -234 });
  });
  it('does not move selected children twice when their ancestor is selected', () => {
    expect(canvasSelectionRoots(nodes, ['a', 'b', 'g']).map((node) => node.id)).toEqual(['g']);
    expect(canvasSelectionRoots(nodes, ['a', 'b']).map((node) => node.id)).toEqual(['a', 'b']);
  });
  it('uses world coordinates for box selection and selected-only fit', () => {
    expect(selectIntersectingNodes(nodes, { x: 1035, y: -235, width: 102, height: 82 })).toEqual([
      'a',
      'g',
    ]);
    const fitted = fitCanvasView([a], { width: 500, height: 400 }, nodes);
    expect(fitted.z).toBeCloseTo(4.55);
    expect(fitted.x + (1036 + a.width / 2) * fitted.z).toBeCloseTo(250);
    // Source's floored screen padding compensates one pixel at this floating point boundary.
    expect(fitted.y + (-234 + a.height / 2) * fitted.z).toBeCloseTo(201);
  });
  it('creates an ordinary group with source padding and reparents selected nodes without jumping', () => {
    const result = createCanvasGroup(nodes, ['a', 'b'], { makeId: () => 'new' });
    expect(result.group).toMatchObject({
      position: { x: 1016, y: -290 },
      width: 440,
      height: 196,
      zIndex: -1001,
      data: { childNodeIds: ['a', 'b'] },
    });
    expect(result.nodes.find((node) => node.id === 'g').data.childNodeIds).toEqual([]);
    expect(
      canvasWorldPosition(
        result.nodes.find((node) => node.id === 'a'),
        result.nodes,
      ),
    ).toEqual({ x: 1036, y: -234 });
    expect(createCanvasGroup(nodes, ['a']).group).toBeNull();
    expect(
      createCanvasGroup(nodes, ['a', 'b'], { zoom: 0.25, makeId: () => 'zoom-group' }).group
        .position,
    ).toEqual({ x: 976, y: -330 });
  });
  it('ungroups nested children back into the surviving parent without changing world positions', () => {
    const inner = {
      ...group,
      id: 'inner',
      parentId: 'g',
      position: { x: 10, y: 20 },
      data: { childNodeIds: ['leaf'] },
    };
    const leaf = { ...a, id: 'leaf', parentId: 'inner' };
    const result = ungroupCanvasNodes([group, inner, leaf], 'inner');
    expect(result.nodes.find((node) => node.id === 'leaf')).toMatchObject({
      parentId: 'g',
      position: { x: 46, y: 86 },
    });
    expect(result.nodes.find((node) => node.id === 'g').data.childNodeIds).toEqual(['leaf']);
  });
  it('deleting a group keeps children, repairs surviving membership and removes only incident edges', () => {
    const result = removeCanvasNodes(
      nodes,
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ga', source: 'g', target: 'a' },
      ],
      ['g'],
    );
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].parentId).toBeUndefined();
    expect(result.nodes[0].position).toEqual({ x: 1036, y: -234 });
    expect(result.edges.map((edge) => edge.id)).toEqual(['ab']);
    expect(
      removeCanvasNodes(nodes, [], ['a']).nodes.find((node) => node.id === 'g').data.childNodeIds,
    ).toEqual(['b']);
  });
  it('copies a selected group, maps internal edges and leaves relative children unchanged', () => {
    let next = 0;
    const result = duplicateCanvasSelection(
      nodes,
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'outside', source: 'a', target: 'external' },
      ],
      ['g', 'a'],
      () => `copy${++next}`,
    );
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes[2]).toMatchObject({
      id: 'copy3',
      position: { x: 1036, y: -264 },
      data: { childNodeIds: ['copy1', 'copy2'] },
    });
    expect(result.nodes[0]).toMatchObject({ parentId: 'copy3', position: a.position });
    expect(result.nodes[0].data.name).toBe('A');
    expect(result.edges).toEqual([{ id: 'copy4', source: 'copy1', target: 'copy2' }]);
    result.nodes[0].data.params.prompt = '变更';
    expect(a.data.params.prompt).toBe('原文');
  });
  it('copying one grouped child expands the whole parent group and siblings as the source does', () => {
    let next = 0;
    const result = duplicateCanvasSelection(nodes, [], ['a'], () => `single${++next}`);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.find((node) => node.type === 'group').data.childNodeIds).toEqual([
      'single1',
      'single2',
    ]);
  });
  it('lays out direct children with source gaps, resized bounds and a five-column limit', () => {
    const horizontal = layoutCanvasNodes(nodes, [], 'horizontal', { groupId: 'g' });
    expect(horizontal.find((node) => node.id === 'b').position).toEqual({ x: 172, y: 66 });
    expect(horizontal.find((node) => node.id === 'g')).toMatchObject({ width: 408, height: 222 });
    const vertical = layoutCanvasNodes(nodes, [], 'vertical', { groupId: 'g' });
    expect(vertical.find((node) => node.id === 'b').position).toEqual({ x: 36, y: 182 });
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...a,
      id: `n${i}`,
      parentId: undefined,
      position: { x: 0, y: 0 },
    }));
    const grid = layoutCanvasNodes(
      many,
      many.map((node) => node.id),
      'grid',
      { columns: 99 },
    );
    expect(grid[3].position).toEqual({ x: 0, y: 180 });
    const grouped = [
      ...many.map((node) => ({ ...node, parentId: 'g' })),
      { ...group, data: { childNodeIds: many.map((node) => node.id) } },
    ];
    const groupGrid = layoutCanvasNodes(grouped, [], 'grid', { groupId: 'g', columns: 99 });
    expect(groupGrid[5].position).toEqual({ x: 36, y: 182 });
  });
  it('ordinary multi-selection layout ignores grouped children and sorts root names numerically with 100px gaps', () => {
    const roots = [
      {
        ...a,
        id: 'n10',
        parentId: undefined,
        data: { name: '节点 10' },
        position: { x: 900, y: 300 },
      },
      {
        ...a,
        id: 'n2',
        parentId: undefined,
        data: { name: '节点 2' },
        position: { x: 500, y: 200 },
      },
    ];
    const result = layoutCanvasNodes([...nodes, ...roots], ['a', 'n10', 'n2'], 'horizontal');
    expect(result.find((node) => node.id === 'a')).toBe(a);
    expect(result.find((node) => node.id === 'n2').position).toEqual({ x: 500, y: 200 });
    expect(result.find((node) => node.id === 'n10').position).toEqual({ x: 700, y: 200 });
  });
});
