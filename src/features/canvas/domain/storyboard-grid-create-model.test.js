import { describe, expect, it } from 'vitest';
import {
  createStoryboardGridGroup,
  resolveStoryboardGridCreation,
  STORYBOARD_GRID_CREATION_DISABLED_REASON,
  STORYBOARD_GRID_SHELL_BACKGROUND,
} from './storyboard-grid-create-model.js';

const image = (id, x = 0, y = 0, extra = {}) => ({
  id,
  type: 'image',
  position: { x, y },
  width: 100,
  height: 100,
  data: { type: 'image', name: id, url: [`/${id}.png`] },
  ...extra,
});
const plan = (nodes, extra = {}) =>
  createStoryboardGridGroup({
    nodes,
    selectedIds: nodes.map((node) => node.id),
    makeId: () => 'grid',
    ...extra,
  });

describe('standalone storyboard grid creation', () => {
  it.each([
    [1, false, 2],
    [2, true, 2],
    [4, true, 2],
    [5, true, 3],
    [9, true, 3],
    [10, true, 4],
    [16, true, 4],
    [17, true, 5],
    [25, true, 5],
    [26, false, 5],
  ])(
    'uses the source image/count and automatic column gate for %i images',
    (count, allowed, cols) => {
      const nodes = Array.from({ length: count }, (_, index) => image(`i${index}`, index * 120));
      const result = resolveStoryboardGridCreation({
        nodes,
        selectedIds: nodes.map((node) => node.id),
      });
      expect(result.allowed).toBe(allowed);
      expect(result.columns).toBe(cols);
      expect(result.reason).toBe(allowed ? null : STORYBOARD_GRID_CREATION_DISABLED_REASON);
      if (allowed) {
        const created = plan(nodes);
        expect(created.group.data.storyboardManualGridCols).toBe(cols);
        expect(created.group.data.childNodeIds).toHaveLength(count);
      } else expect(plan(nodes).nodes).toBe(nodes);
    },
  );

  it('uses actual root non-script targets in graph order and does not steal selected children', () => {
    const child = image('child', 5, 5, { parentId: 'original' });
    const nodes = [
      image('b', 104),
      child,
      { id: 'script', type: 'script', position: { x: 0, y: 0 } },
      image('a'),
    ];
    const selectedIds = ['a', 'child', 'script', 'b', 'missing', 'a'];
    expect(resolveStoryboardGridCreation({ nodes, selectedIds }).sourceIds).toEqual(['b', 'a']);
    const result = plan(nodes, { selectedIds });
    expect(result.group.data.childNodeIds).toEqual(['a', 'b']);
    expect(result.nodes.find((node) => node.id === 'child')).toBe(child);
    expect(result.nodes.find((node) => node.id === 'child').parentId).toBe('original');
  });

  it.each(['text', 'video', 'audio', 'group', 'video_group'])(
    'rejects a root %s alongside images without modifying the graph',
    (type) => {
      const nodes = [
        image('a'),
        image('b', 104),
        { id: 'other', type, position: { x: 200, y: 0 } },
      ];
      const result = plan(nodes);
      expect(result.valid).toBe(false);
      expect(result.nodes).toBe(nodes);
      expect(result.group).toBeNull();
    },
  );

  it('assigns images to slots by the minimum total old-position distance rather than a greedy nearest match', () => {
    // Both images initially prefer the first slot, but b has the stronger claim.
    const result = plan([image('a', 60), image('b')]);
    expect(result.group.data.childNodeIds).toEqual(['b', 'a']);
    expect(result.nodes.find((node) => node.id === 'b').position).toEqual({ x: 4, y: 4 });
    expect(result.nodes.find((node) => node.id === 'a').position).toEqual({ x: 630, y: 4 });
  });

  it('matches an exhaustive assignment oracle when old positions and graph order disagree', () => {
    const nodes = [image('a', 110, 80), image('b', 0, 100), image('c', 50, 0), image('d', 20, 30)];
    const result = plan(nodes, { bounds: { x: -20, y: -56, width: 250, height: 250 } });
    const oldSlots = [
      { x: 4, y: 4 },
      { x: 108, y: 4 },
      { x: 4, y: 108 },
      { x: 108, y: 108 },
    ];
    const score = (ids) =>
      ids.reduce((total, id, index) => {
        const node = nodes.find((item) => item.id === id);
        const dx = node.position.x + 20 - oldSlots[index].x;
        const dy = node.position.y + 56 - oldSlots[index].y;
        return total + dx * dx + dy * dy;
      }, 0);
    const permutations = (ids) =>
      ids.length <= 1
        ? [ids]
        : ids.flatMap((id, index) =>
            permutations(ids.filter((_, item) => item !== index)).map((rest) => [id, ...rest]),
          );
    const optimum = Math.min(...permutations(nodes.map((node) => node.id)).map(score));
    expect(score(result.group.data.childNodeIds)).toBe(optimum);
    expect(result.group.data.childNodeIds).not.toEqual(nodes.map((node) => node.id));
  });

  it('uses measured old flow dimensions for assignment, while creating consistent 16:9 explicit child dimensions', () => {
    const nodes = [image('a', 60, 0, { measured: { width: 150, height: 80 } }), image('b')];
    const before = structuredClone(nodes);
    const result = plan(nodes);
    expect(result.group).toMatchObject({
      type: 'group',
      selected: true,
      position: { x: -20, y: -56 },
      width: 1256,
      height: 358,
      measured: { width: 1256, height: 358 },
      style: {
        background: STORYBOARD_GRID_SHELL_BACKGROUND,
        border: '1px solid var(--canvas-group-border)',
      },
      data: {
        name: '分镜组 2 个节点',
        childNodeIds: ['b', 'a'],
        standaloneStoryboardImageGrid: true,
        storyboardGroupType: 'image',
        storyboardManualGridCols: 2,
        groupLayoutMode: 'grid',
        nodeWidth: 1256,
        nodeHeight: 358,
      },
    });
    expect(result.group.data).not.toHaveProperty('storyboardManualGridRows');
    expect(result.group.data).not.toHaveProperty('storyboardPreserveChildDimensions');
    for (const child of result.nodes.filter((node) => node.type === 'image')) {
      expect(child).toMatchObject({
        parentId: 'grid',
        selected: false,
        width: 622,
        height: 350,
        measured: { width: 622, height: 350 },
      });
      expect(child.data).toMatchObject({
        params: { settings: { ratio: '16:9' } },
        contentWidth: 622,
        contentHeight: 350,
        _explicitContentDims: true,
      });
    }
    expect(nodes).toEqual(before);
  });

  it('preserves resource metadata, references, prompt, model and unrelated settings in the atomic final layout', () => {
    const a = image('a', 0, 0, {
      selected: true,
      resourceMeta: { items: [{ kind: 'image', width: 1920, height: 1080 }] },
      data: {
        type: 'image',
        name: '画面',
        url: ['/a.png'],
        contentWidth: 720,
        contentHeight: 720,
        params: {
          model: 'm',
          prompt: '保留',
          imageList: [{ nodeId: 'ref' }],
          settings: { ratio: '1:1', seed: 42 },
          advanced: { strength: 0.75 },
        },
      },
    });
    const unrelated = {
      id: 'ref',
      type: 'text',
      position: { x: -400, y: 0 },
      selected: true,
      data: { content: ['台词'] },
    };
    const nodes = [a, image('b', 1000), unrelated];
    const before = structuredClone(nodes);
    const result = plan(nodes, { selectedIds: ['a', 'b'] });
    const copied = result.nodes.find((node) => node.id === 'a');
    expect(copied.resourceMeta).toBe(a.resourceMeta);
    expect(copied.data.params).toEqual({
      ...a.data.params,
      settings: { ...a.data.params.settings, ratio: '16:9' },
    });
    expect(copied.data.url).toBe(a.data.url);
    expect(result.nodes.find((node) => node.id === 'ref')).toEqual({
      ...unrelated,
      selected: false,
    });
    expect(result.selectedIds).toEqual(['grid']);
    expect(nodes).toEqual(before);
    expect(plan(result.nodes, { selectedIds: ['a', 'b'] }).valid).toBe(false);
  });

  it('retains source double zoom compensation for the initial group origin', () => {
    const result = plan([image('a'), image('b', 500)], { zoom: 0.25 });
    expect(result.group.position).toEqual({ x: -60, y: -96 });
    expect(result.group.width).toBe(1256);
  });

  it.each([
    { makeId: () => 'a' },
    { makeId: () => '' },
    { bounds: { x: 0, y: 0, width: NaN, height: 100 } },
    { bounds: { x: Infinity, y: 0, width: 100, height: 100 } },
    { getNodeSize: () => ({ width: 0, height: 100 }) },
  ])('rejects malformed IDs or layout data without partially creating a group', (extra) => {
    const nodes = [image('a'), image('b', 104)];
    const result = plan(nodes, extra);
    expect(result.valid).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(nodes);
  });

  it('rejects a nonfinite source position before allocating a new group ID', () => {
    let allocated = false;
    const nodes = [image('a', NaN), image('b', 100)];
    const result = plan(nodes, {
      makeId: () => {
        allocated = true;
        return 'grid';
      },
    });
    expect(result.valid).toBe(false);
    expect(allocated).toBe(false);
    expect(result.nodes).toBe(nodes);
  });
});
