import { describe, expect, it } from 'vitest';
import {
  buildStoryboardGridChildExplicitDims,
  buildStoryboardImageRatioPatch,
  canStoryboardImageGridAcceptIncoming,
  computeStoryboardGridCellSize,
  computeStoryboardGridLayout,
  computeStoryboardNodeDimensionsFromRatio,
  computeStoryboardVariableGridLayout,
  createStoryboardGridDragPreview,
  extractStoryboardRatioFromNodeParams,
  findNearestSlotIndex,
  findStandaloneStoryboardGridGroupAt,
  finishStoryboardGridDrag,
  getStableChildOrder,
  getStoryboardFixedManualGridCapacity,
  getStoryboardImageGridChildSize,
  isStoryboardImageGridFullForIncoming,
  leaveStoryboardGridDragPreview,
  prepareStoryboardGridDrag,
  reconcileStoryboardGridMembership,
  reorderStoryboardGridDragPreview,
  resolveStoryboardGridColumnCount,
  resolveStoryboardGridSlotCount,
  resolveStoryboardShotNumberFontPx,
  updateStoryboardGridDrag,
} from './storyboard-grid-model.js';

const image = (id, patch = {}) => ({
  id,
  type: 'image',
  position: { x: 4, y: 4 },
  width: 200,
  height: 120,
  data: { type: 'image', name: id },
  ...patch,
});
const group = (id = 'g', data = {}, patch = {}) => ({
  id,
  type: 'group',
  position: { x: 100, y: 100 },
  width: 1000,
  height: 900,
  data: {
    type: 'group',
    name: '分镜组 2 个节点',
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    childNodeIds: ['a', 'b'],
    ...data,
  },
  ...patch,
});
const replace = (nodes, id, patch) =>
  nodes.map((node) => (node.id === id ? { ...node, ...patch } : node));
const frozen = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
};

describe('standalone storyboard grid geometry and capacity', () => {
  it('takes independent positive content axes, then measured/stored/nullish fallbacks', () => {
    const node = image('a', {
      width: 400,
      height: 500,
      measured: { width: 300, height: 250 },
      data: { contentWidth: 90, contentHeight: 0 },
    });
    expect(getStoryboardImageGridChildSize(node)).toEqual({ w: 90, h: 250 });
    expect(
      getStoryboardImageGridChildSize(
        image('a', { width: undefined, height: undefined, measured: { width: 0 } }),
      ),
    ).toEqual({ w: 0, h: 120 });
    expect(computeStoryboardGridCellSize([])).toEqual({ cellW: 200, cellH: 120 });
    expect(
      computeStoryboardGridCellSize([
        image('a', { width: 30, height: 40 }),
        image('b', { width: 50, height: 20 }),
      ]),
    ).toEqual({ cellW: 50, cellH: 40 });
  });

  it.each([
    [0, 1],
    [1, 1],
    [2, 2],
    [4, 2],
    [5, 3],
    [9, 3],
    [10, 4],
    [17, 5],
    [26, 5],
  ])('resolves automatic %i-child columns to %i', (count, cols) => {
    expect(resolveStoryboardGridColumnCount(count)).toBe(cols);
  });

  it('rounds and clamps manual columns but keeps natural rows when they exceed five', () => {
    expect(resolveStoryboardGridColumnCount(17, 2.4)).toBe(2);
    expect(resolveStoryboardGridColumnCount(17, 20)).toBe(5);
    expect(resolveStoryboardGridColumnCount(17, 0)).toBe(5);
    expect(resolveStoryboardGridSlotCount(26, 1, 2)).toEqual({ cols: 1, rows: 26, totalSlots: 26 });
    expect(resolveStoryboardGridSlotCount(2, 2, 4.6)).toEqual({ cols: 2, rows: 5, totalSlots: 10 });
    expect(resolveStoryboardGridSlotCount(5, 2, 1)).toEqual({ cols: 2, rows: 3, totalSlots: 6 });
  });

  it('uses fixed capacity only when both manual axes are finite, independently of layout expansion', () => {
    expect(getStoryboardFixedManualGridCapacity(0, -3)).toBe(1);
    expect(getStoryboardFixedManualGridCapacity(2.6, 8)).toBe(15);
    expect(getStoryboardFixedManualGridCapacity(2, undefined)).toBeNull();
    expect(getStoryboardFixedManualGridCapacity(Infinity, 2)).toBeNull();
    expect(isStoryboardImageGridFullForIncoming(2, 2, 1)).toBe(true);
    expect(resolveStoryboardGridSlotCount(3, 2, 1).totalSlots).toBe(4);
    expect(isStoryboardImageGridFullForIncoming(24)).toBe(false);
    expect(isStoryboardImageGridFullForIncoming(25)).toBe(true);
  });

  it('checks each incoming image so auto grids grow but fixed or hard limits reject the whole batch', () => {
    expect(canStoryboardImageGridAcceptIncoming(9, 16)).toBe(true);
    expect(canStoryboardImageGridAcceptIncoming(9, 17)).toBe(false);
    expect(canStoryboardImageGridAcceptIncoming(2, 2, 2, 2)).toBe(true);
    expect(canStoryboardImageGridAcceptIncoming(2, 3, 2, 2)).toBe(false);
    expect(canStoryboardImageGridAcceptIncoming(25, 0)).toBe(true);
    expect(canStoryboardImageGridAcceptIncoming(NaN, 1)).toBe(false);
    expect(canStoryboardImageGridAcceptIncoming(1, Infinity)).toBe(false);
  });

  it('keeps four-pixel insets and gaps, with a full reserved last row', () => {
    const layout = computeStoryboardGridLayout(100, 60, 6, 3);
    expect(layout).toMatchObject({ cols: 3, rows: 2, width: 316, height: 132 });
    expect(layout.slotPositions).toEqual([
      { x: 4, y: 4 },
      { x: 108, y: 4 },
      { x: 212, y: 4 },
      { x: 4, y: 68 },
      { x: 108, y: 68 },
      { x: 212, y: 68 },
    ]);
    expect(layout.slotSizes).toHaveLength(6);
    expect(layout.slotSizes.every((size) => size.width === 100 && size.height === 60)).toBe(true);
    layout.slotSizes[0].width = 9;
    expect(layout.slotSizes[1].width).toBe(100);
  });

  it('uses maximum width per column and height per row, allowing populated cells below defaults', () => {
    const layout = computeStoryboardVariableGridLayout(
      [
        { width: 50, height: 20 },
        { width: 80, height: 30 },
        { width: 70, height: 40 },
      ],
      4,
      2,
    );
    expect(layout).toMatchObject({ width: 162, height: 82, cols: 2, rows: 2 });
    expect(layout.slotPositions).toEqual([
      { x: 4, y: 4 },
      { x: 78, y: 4 },
      { x: 4, y: 38 },
      { x: 78, y: 38 },
    ]);
    expect(layout.slotSizes).toEqual([
      { width: 70, height: 30 },
      { width: 80, height: 30 },
      { width: 70, height: 40 },
      { width: 80, height: 40 },
    ]);
  });

  it('reserves empty columns/rows using at least 200×120 or the largest child dimension', () => {
    const layout = computeStoryboardVariableGridLayout([{ width: 300, height: 40 }], 6, 3);
    expect(layout).toMatchObject({ width: 916, height: 172 });
    expect(layout.slotSizes[0]).toEqual({ width: 300, height: 40 });
    expect(layout.slotSizes[5]).toEqual({ width: 300, height: 120 });
    const empty = computeStoryboardVariableGridLayout([], 1);
    expect(empty).toMatchObject({ width: 208, height: 128 });
  });

  it('finds nearest slot centers, keeps the first equal-distance slot, and skips missing sizes', () => {
    const positions = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    const sizes = [
      { width: 10, height: 10 },
      { width: 10, height: 10 },
      { width: 100, height: 10 },
    ];
    expect(findNearestSlotIndex(10, 5, positions, sizes)).toBe(0);
    expect(findNearestSlotIndex(68, 5, positions, sizes)).toBe(2);
    expect(findNearestSlotIndex(10, 5, positions, [undefined, sizes[1]])).toBe(1);
    expect(findNearestSlotIndex(1, 1, [], [])).toBe(0);
  });

  it('hits only explicit standalone image groups by center, inclusive bounds and minimum stored area', () => {
    const large = group('large', {}, { width: 400, height: 400 });
    const small = group(
      'small',
      {},
      { width: 200, height: 200, measured: { width: 10, height: 10 }, hidden: true },
    );
    const tie = group('tie', {}, { width: 200, height: 200 });
    const derived = group(
      'derived',
      { standaloneStoryboardImageGrid: false, sourceScriptNodeId: 'script' },
      { width: 1, height: 1 },
    );
    const noSubtype = group('unknown', { storyboardGroupType: undefined }, { width: 1, height: 1 });
    expect(
      findStandaloneStoryboardGridGroupAt(300, 300, [large, small, tie, derived, noSubtype]),
    ).toBe(small);
    expect(findStandaloneStoryboardGridGroupAt(300.001, 300, [small])).toBeUndefined();
    expect(findStandaloneStoryboardGridGroupAt(101, 101, [large, small], 'small')).toBe(large);
  });

  it('uses a complete preferred order, otherwise sorts y only beyond the eight-pixel row band', () => {
    const a = image('a', { position: { x: 100, y: 0 } });
    const b = image('b', { position: { x: 10, y: 8 } });
    const c = image('c', { position: { x: 0, y: 17 } });
    expect(getStableChildOrder([a, b, c], ['missing', 'c', 'b', 'a'])).toEqual([c, b, a]);
    expect(getStableChildOrder([a, b, c], ['c'])).toEqual([b, a, c]);
    // This source primitive accepts corrupt duplicate preferred IDs; preview validation rejects them.
    expect(getStableChildOrder([a, b], ['a', 'a'])).toEqual([a, a]);
    expect([a, b, c].map((node) => node.id)).toEqual(['a', 'b', 'c']);
  });

  it('scales shot labels by the maximum row/column count', () => {
    expect(resolveStoryboardShotNumberFontPx(1, 2)).toBe(16);
    expect(resolveStoryboardShotNumberFontPx(5, 4)).toBe(40);
    expect(resolveStoryboardShotNumberFontPx(3, 1, 10)).toBe(15);
  });
});

describe('storyboard child ratio patches', () => {
  it('uses trimmed non-auto ratio fields in source order before aspect ratios', () => {
    expect(
      extractStoryboardRatioFromNodeParams({
        settings: { ratio: 'auto', ratio_custom: ' 3:4 ', ratio_other: '1:1', aspectRatio: '4:3' },
        aspectRatio: '16:9',
      }),
    ).toBe('3:4');
    expect(
      extractStoryboardRatioFromNodeParams({
        settings: { ratio: ' ', ratio_x: 1, aspectRatio: 'auto' },
        aspectRatio: ' 4:5 ',
      }),
    ).toBe('4:5');
    expect(extractStoryboardRatioFromNodeParams({ settings: { ratio: 'bad' } })).toBe('bad');
  });

  it.each([
    ['16:9', { width: 622, height: 350 }],
    ['9:16', { width: 350, height: 622 }],
    ['100:1', { width: 1050, height: 350 }],
    ['1:100', { width: 350, height: 1050 }],
    ['1.9:1', { width: 350, height: 350 }],
    ['auto', { width: 350, height: 350 }],
    ['0:2', { width: 350, height: 350 }],
    ['1:2:3', { width: 350, height: 350 }],
  ])('uses source parseInt/350-short-side/1050-cap for %s', (ratio, dimensions) => {
    expect(computeStoryboardNodeDimensionsFromRatio(ratio)).toEqual(dimensions);
  });

  it('prefers actual ordered image siblings, preserves params/settings, and returns only a partial data patch', () => {
    const target = group('g', {
      childNodeIds: ['not-child', 'self', 'b', 'a'],
      sourceScriptNodeId: 'script',
    });
    const self = image('self', {
      data: {
        params: { model: 'keep', settings: { seed: 12, ratio: '1:1' } },
        _explicitContentDims: true,
        contentWidth: 20,
      },
    });
    const nodes = [
      image('a', { parentId: 'g', data: { params: { settings: { ratio: '3:4' } } } }),
      image('b', { parentId: 'g', data: { params: { aspectRatio: '9:16' } } }),
      image('not-child', { parentId: 'other', data: { params: { settings: { ratio: '1:1' } } } }),
      self,
    ];
    const patch = buildStoryboardImageRatioPatch({ node: self, group: target, nodes });
    expect(patch).toEqual({
      data: {
        params: { model: 'keep', settings: { seed: 12, ratio: '9:16' } },
        contentWidth: undefined,
        contentHeight: undefined,
      },
      width: 350,
      height: 622,
      measured: { width: 350, height: 622 },
    });
    expect(patch.data).not.toHaveProperty('sourceScriptNodeId');
    expect(patch.data).not.toHaveProperty('_explicitContentDims');
    expect(self.data.params.settings.ratio).toBe('1:1');
  });

  it('falls back to graph order and finally 16:9, with preserve/video/nonimage gates', () => {
    const target = group('g', { childNodeIds: ['missing'] });
    const node = image('incoming');
    const sibling = image('sibling', {
      parentId: 'g',
      data: { params: { settings: { ratio: '4:5' } } },
    });
    expect(
      buildStoryboardImageRatioPatch({ node, group: target, nodes: [sibling] }).data.params.settings
        .ratio,
    ).toBe('4:5');
    expect(buildStoryboardImageRatioPatch({ node, group: target, nodes: [] }).width).toBe(622);
    expect(
      buildStoryboardImageRatioPatch({
        node,
        group: group('g', { storyboardPreserveChildDimensions: true }),
        nodes: [],
      }),
    ).toBeNull();
    expect(
      buildStoryboardImageRatioPatch({
        node,
        group: group('g', { storyboardGroupType: 'video' }),
        nodes: [],
      }),
    ).toBeNull();
    expect(
      buildStoryboardImageRatioPatch({
        node: { ...node, type: 'video' },
        group: target,
        nodes: [],
      }),
    ).toBeNull();
    expect(buildStoryboardGridChildExplicitDims(55, 40)).toEqual({
      _explicitContentDims: true,
      contentWidth: 55,
      contentHeight: 40,
    });
  });
});

describe('immutable grid drag projections', () => {
  it('counts only images for capacity but includes every direct child in reserved slots', () => {
    const nodes = [
      group('g', {
        storyboardManualGridCols: 2,
        storyboardManualGridRows: 1,
        childNodeIds: ['a', 'text'],
      }),
      image('a', { parentId: 'g' }),
      image('text', { parentId: 'g', type: 'text' }),
      image('incoming'),
    ];
    const preview = createStoryboardGridDragPreview({ nodes, groupId: 'g', draggedId: 'incoming' });
    expect(preview.order).toEqual(['incoming', 'a', 'text']);
    expect(preview.totalSlots).toBe(4);
    const full = [...nodes, image('second-image', { parentId: 'g' })];
    expect(
      createStoryboardGridDragPreview({ nodes: full, groupId: 'g', draggedId: 'incoming' }),
    ).toBeNull();
    expect(
      createStoryboardGridDragPreview({ nodes: full, groupId: 'g', draggedId: 'a' }),
    ).not.toBeNull();
  });

  it('keeps m4 flag-only eligibility separate from the strict target hit helper', () => {
    const nodes = [group('g', { storyboardGroupType: undefined }), image('incoming')];
    expect(
      createStoryboardGridDragPreview({ nodes, groupId: 'g', draggedId: 'incoming' }),
    ).not.toBeNull();
    expect(findStandaloneStoryboardGridGroupAt(150, 150, nodes)).toBeUndefined();
  });

  it('reorders the dragged slot and recomputes heterogeneous column/row dimensions without mutation', () => {
    const nodes = frozen([
      group('g', {
        childNodeIds: ['a', 'b'],
        storyboardManualGridCols: 2,
        storyboardManualGridRows: 2,
        storyboardPreserveChildDimensions: true,
      }),
      image('a', { parentId: 'g', width: 100, height: 40 }),
      image('b', { parentId: 'g', width: 50, height: 80 }),
      image('incoming', { width: 300, height: 20 }),
    ]);
    const preview = frozen(
      createStoryboardGridDragPreview({ nodes, groupId: 'g', draggedId: 'incoming', slotIndex: 0 }),
    );
    expect(preview.order).toEqual(['incoming', 'a', 'b']);
    const moved = reorderStoryboardGridDragPreview(preview, { x: 200, y: 180 });
    expect(moved.order).toEqual(['a', 'b', 'incoming']);
    expect(moved.slotSizes[0]).toEqual({ width: 300, height: 80 });
    expect(moved.slotSizes[1]).toEqual({ width: 50, height: 80 });
    expect(preview.order).toEqual(['incoming', 'a', 'b']);
    expect(reorderStoryboardGridDragPreview(moved, { x: 154, y: 98 })).toBe(moved);
  });

  it('previews sibling positions and group flow dimensions while leaving dragged and metadata unchanged', () => {
    const nodes = frozen([
      group(),
      image('a', { parentId: 'g', position: { x: 4, y: 4 } }),
      image('b', { parentId: 'g', position: { x: 900, y: 800 } }),
    ]);
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    expect(prepared.valid).toBe(true);
    expect(prepared.context.preview.draggedSlot).toBe(0);
    expect(prepared.nodes.find((node) => node.id === 'a')).toBe(nodes[1]);
    expect(prepared.nodes.find((node) => node.id === 'b').position).toEqual({ x: 208, y: 4 });
    expect(prepared.nodes[0]).toMatchObject({
      width: 412,
      height: 128,
      measured: { width: 412, height: 128 },
    });
    expect(prepared.nodes[0].data).toBe(nodes[0].data);
    expect(prepared.nodes[0].data).not.toHaveProperty('nodeWidth');
  });

  it('reorders an existing child by node center and commits final slot/ratio/data once on stop', () => {
    const nodes = frozen([
      group(),
      image('a', { parentId: 'g' }),
      image('b', {
        parentId: 'g',
        position: { x: 208, y: 4 },
        data: { params: { settings: { ratio: '9:16' } } },
      }),
    ]);
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const movedNodes = replace(prepared.nodes, 'a', { position: { x: 208, y: 4 } });
    const updated = updateStoryboardGridDrag({
      nodes: movedNodes,
      draggedId: 'a',
      context: prepared.context,
    });
    expect(updated.context.preview.order).toEqual(['b', 'a']);
    expect(updated.nodes.find((node) => node.id === 'b').position).toEqual({ x: 4, y: 4 });
    const result = finishStoryboardGridDrag({
      nodes: updated.nodes,
      draggedId: 'a',
      context: frozen(updated.context),
    });
    expect(result).toMatchObject({
      valid: true,
      kind: 'standaloneStoryboardGrid',
      transitionIds: [],
    });
    expect(result.nodes[0].data).toMatchObject({
      childNodeIds: ['b', 'a'],
      nodeWidth: 412,
      nodeHeight: 128,
      groupLayoutMode: 'grid',
    });
    expect(result.nodes[1]).toMatchObject({
      parentId: 'g',
      position: { x: 208, y: 4 },
      width: 350,
      height: 622,
      data: {
        _explicitContentDims: true,
        contentWidth: 200,
        contentHeight: 120,
        params: { settings: { ratio: '9:16' } },
      },
    });
    expect(nodes[0].data).not.toHaveProperty('nodeWidth');
  });

  it('enters a target at nearest slot, drops obsolete extent, and keeps other nodes/params/source metadata', () => {
    const nodes = frozen([
      group('g', { childNodeIds: ['a'], sourceScriptNodeId: 'script', name: 'My storyboard' }),
      image('a', { parentId: 'g' }),
      image('incoming', {
        position: { x: 115, y: 115 },
        extent: 'parent',
        data: { params: { model: 'keep', settings: { seed: 4 } }, taskInfo: { status: 'saved' } },
      }),
      image('outside', { position: { x: 2000, y: 2000 } }),
    ]);
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'incoming' });
    expect(prepared.nodes).toBe(nodes);
    const updated = updateStoryboardGridDrag({ ...prepared, draggedId: 'incoming' });
    expect(updated.context.preview.order).toEqual(['incoming', 'a']);
    const result = finishStoryboardGridDrag({ ...updated, draggedId: 'incoming' });
    const dropped = result.nodes.find((node) => node.id === 'incoming');
    expect(dropped).toMatchObject({
      parentId: 'g',
      position: { x: 4, y: 4 },
      width: 622,
      height: 350,
      data: {
        params: { model: 'keep', settings: { seed: 4, ratio: '16:9' } },
        taskInfo: { status: 'saved' },
        contentWidth: 200,
        contentHeight: 120,
      },
    });
    expect(dropped).not.toHaveProperty('extent');
    expect(dropped.data).not.toHaveProperty('sourceScriptNodeId');
    expect(result.nodes[0].data).toMatchObject({
      name: 'My storyboard',
      sourceScriptNodeId: 'script',
    });
    expect(result.nodes[3]).toBe(nodes[3]);
    expect(result.transitionIds).toEqual(['incoming']);
  });

  it('preserves heterogeneous child dimensions and ratio params when preserve mode is enabled', () => {
    const nodes = [
      group('g', { childNodeIds: ['a'], storyboardPreserveChildDimensions: true }),
      image('a', { parentId: 'g', width: 90, height: 140 }),
      image('incoming', {
        position: { x: 105, y: 105 },
        width: 30,
        height: 40,
        data: { params: { settings: { ratio: '4:5' } }, contentWidth: 30, contentHeight: 40 },
      }),
    ];
    const updated = updateStoryboardGridDrag({
      nodes,
      draggedId: 'incoming',
      context: { draggedId: 'incoming', preview: null },
    });
    const result = finishStoryboardGridDrag({ ...updated, draggedId: 'incoming' });
    const dropped = result.nodes[2];
    expect(dropped.width).toBe(30);
    expect(dropped.height).toBe(40);
    expect(dropped.data).toBe(nodes[2].data);
    expect(result.nodes[0]).toMatchObject({ width: 132, height: 148 });
  });

  it('leaving shrinks reserved slot count but keeps the largest uniform cell and defers metadata', () => {
    const nodes = [
      group('g', { childNodeIds: ['a', 'b'], storyboardManualGridCols: 2 }),
      image('a', { parentId: 'g', width: 500, height: 300 }),
      image('b', { parentId: 'g', width: 100, height: 60 }),
    ];
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const projected = replace(prepared.nodes, 'a', { position: { x: 2000, y: 3000 } });
    const updated = updateStoryboardGridDrag({
      nodes: projected,
      draggedId: 'a',
      context: prepared.context,
    });
    expect(updated.context.preview).toMatchObject({
      order: ['b'],
      isInside: false,
      draggedSlot: -1,
      cellW: 500,
      cellH: 300,
    });
    expect(updated.nodes[0].data.childNodeIds).toEqual(['a', 'b']);
    const result = finishStoryboardGridDrag({ ...updated, draggedId: 'a' });
    expect(result.nodes[1].position).toEqual({ x: 2100, y: 3100 });
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[0].data.childNodeIds).toEqual(['b']);
    expect(result.nodes[0].width).toBe(1012);
    expect(result.sourceGroupIds).toEqual(['g']);
  });

  it('keeps empty-group preview geometry and old order, then filters the departed ID at stop', () => {
    const nodes = [group('g', { childNodeIds: ['a'] }), image('a', { parentId: 'g' })];
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const preview = leaveStoryboardGridDragPreview(prepared.context.preview, prepared.nodes);
    expect(preview).toMatchObject({
      order: ['a'],
      isInside: false,
      draggedSlot: -1,
      currentGroupWidth: 208,
      currentGroupHeight: 128,
    });
    const moved = replace(prepared.nodes, 'a', { position: { x: 1000, y: 1000 } });
    const result = finishStoryboardGridDrag({
      nodes: moved,
      draggedId: 'a',
      context: { draggedId: 'a', preview },
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].data).toMatchObject({ childNodeIds: [], name: '分镜组 0 个节点' });
    expect(result.nodes[0].width).toBe(208);
  });

  it('recreates the source preview after leaving/reentering without permanently detaching during movement', () => {
    const nodes = [group(), image('a', { parentId: 'g' }), image('b', { parentId: 'g' })];
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const left = updateStoryboardGridDrag({
      nodes: replace(prepared.nodes, 'a', { position: { x: 2000, y: 2000 } }),
      draggedId: 'a',
      context: prepared.context,
    });
    expect(left.context.preview.isInside).toBe(false);
    expect(left.nodes[1].parentId).toBe('g');
    const reentered = updateStoryboardGridDrag({
      nodes: replace(left.nodes, 'a', { position: { x: 4, y: 4 } }),
      draggedId: 'a',
      context: left.context,
    });
    expect(reentered.context.preview.isInside).toBe(true);
    expect(reentered.context.preview.order).toEqual(['a', 'b']);
    expect(left.context.preview.isInside).toBe(false);
  });

  it('leaves the old preview when a different full target rejects entry, then detaches instead of snapping back', () => {
    const nodes = [
      group(),
      image('a', { parentId: 'g' }),
      image('b', { parentId: 'g' }),
      group(
        'full',
        { childNodeIds: ['occupied'], storyboardManualGridCols: 1, storyboardManualGridRows: 1 },
        { position: { x: 1000, y: 1000 }, width: 300, height: 300 },
      ),
      image('occupied', { parentId: 'full' }),
    ];
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const moving = replace(prepared.nodes, 'a', { position: { x: 950, y: 950 } });
    const rejected = updateStoryboardGridDrag({
      nodes: moving,
      draggedId: 'a',
      context: prepared.context,
    });
    expect(rejected).toMatchObject({
      valid: true,
      reason: 'fullOrInvalidPreview',
      targetGroupId: null,
    });
    expect(rejected.context.preview).toMatchObject({
      groupId: 'g',
      isInside: false,
      order: ['b'],
      draggedSlot: -1,
    });
    const result = finishStoryboardGridDrag({ ...rejected, draggedId: 'a' });
    expect(result.nodes[1].position).toEqual({ x: 1050, y: 1050 });
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[0].data.childNodeIds).toEqual(['b']);
    expect(result.nodes[3]).toBe(nodes[3]);
    expect(result.nodes[3].data.childNodeIds).toEqual(['occupied']);
  });

  it.each(['add', 'delete', 'reparent'])(
    'rejects an external %s of a target member without overwriting the latest graph',
    (change) => {
      const nodes = [
        group(),
        image('a', { parentId: 'g' }),
        image('b', { parentId: 'g' }),
        group('other', { standaloneStoryboardImageGrid: false }),
      ];
      const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
      let latest = prepared.nodes;
      if (change === 'add') {
        latest = [
          ...replace(latest, 'g', { data: { ...latest[0].data, childNodeIds: ['a', 'b', 'new'] } }),
          image('new', { parentId: 'g' }),
        ];
      } else if (change === 'delete') {
        latest = replace(
          latest.filter((node) => node.id !== 'b'),
          'g',
          { data: { ...latest[0].data, childNodeIds: ['a'] } },
        );
      } else {
        latest = replace(replace(latest, 'b', { parentId: 'other' }), 'g', {
          data: { ...latest[0].data, childNodeIds: ['a'] },
        });
      }
      const before = structuredClone(latest);
      const update = updateStoryboardGridDrag({
        nodes: frozen(latest),
        draggedId: 'a',
        context: frozen(prepared.context),
      });
      const finish = finishStoryboardGridDrag({
        nodes: latest,
        draggedId: 'a',
        context: prepared.context,
      });
      expect(update).toMatchObject({ valid: false, reason: 'stalePreview' });
      expect(update.nodes).toBe(latest);
      expect(finish).toMatchObject({ valid: false, changed: false, reason: 'stalePreview' });
      expect(finish.nodes).toBe(latest);
      expect(latest).toEqual(before);
    },
  );

  it('uses injected display size only for center hit while keeping source flow dimensions in the document', () => {
    const target = group('g', { childNodeIds: [] }, { width: 200, height: 200 });
    const dragged = image('a', {
      width: 622,
      height: 350,
      position: { x: 110, y: 110 },
      data: { _explicitContentDims: true, contentWidth: 30, contentHeight: 20 },
    });
    const nodes = [target, dragged];
    expect(updateStoryboardGridDrag({ nodes, draggedId: 'a' }).targetGroupId).toBeNull();
    const projected = updateStoryboardGridDrag({
      nodes,
      draggedId: 'a',
      getNodeSize: () => ({ width: 30, height: 20 }),
    });
    expect(projected.targetGroupId).toBe('g');
    expect(projected.nodes[1]).toBe(dragged);
    expect(projected.context.preview).toMatchObject({ cellW: 30, cellH: 20 });
    const invalid = updateStoryboardGridDrag({
      nodes,
      draggedId: 'a',
      getNodeSize: () => ({ width: NaN, height: 20 }),
    });
    expect(invalid).toMatchObject({ valid: false, reason: 'invalidDimensions', nodes });
  });

  it('retains immutable preview order across an external params update and reads current params at stop', () => {
    const nodes = [group(), image('a', { parentId: 'g' }), image('b', { parentId: 'g' })];
    const prepared = prepareStoryboardGridDrag({ nodes, draggedId: 'a' });
    const reordered = updateStoryboardGridDrag({
      nodes: replace(prepared.nodes, 'a', { position: { x: 208, y: 4 } }),
      draggedId: 'a',
      context: prepared.context,
    });
    const current = replace(
      replace(reordered.nodes, 'b', { data: { params: { settings: { ratio: '3:4' } } } }),
      'a',
      { data: { params: { prompt: 'latest', settings: { seed: 99 } } } },
    );
    const refreshed = updateStoryboardGridDrag({
      nodes: current,
      draggedId: 'a',
      context: reordered.context,
    });
    expect(refreshed.context).toBe(reordered.context);
    const result = finishStoryboardGridDrag({ ...refreshed, draggedId: 'a' });
    expect(result.nodes[0].data.childNodeIds).toEqual(['b', 'a']);
    expect(result.nodes[1].data.params).toEqual({
      prompt: 'latest',
      settings: { seed: 99, ratio: '3:4' },
    });
  });

  it('rejects an initially full target and rechecks changed manual capacity at stop', () => {
    const nodes = [
      group('g', { storyboardManualGridCols: 2, storyboardManualGridRows: 2 }),
      image('a', { parentId: 'g' }),
      image('b', { parentId: 'g' }),
      image('incoming', { position: { x: 110, y: 110 } }),
    ];
    const updated = updateStoryboardGridDrag({ nodes, draggedId: 'incoming' });
    expect(updated.context.preview.isInside).toBe(true);
    const smaller = replace(updated.nodes, 'g', {
      data: { ...updated.nodes[0].data, storyboardManualGridRows: 1 },
    });
    const result = finishStoryboardGridDrag({
      nodes: smaller,
      draggedId: 'incoming',
      context: updated.context,
    });
    expect(result).toMatchObject({ valid: true, kind: 'standaloneStoryboardGrid', reason: 'full' });
    expect(result.nodes[0].data.childNodeIds).toEqual(['a', 'b']);
    expect(result.nodes[3]).not.toHaveProperty('parentId');
    expect(result.nodes[3].data).not.toHaveProperty('_explicitContentDims');
    const rejected = updateStoryboardGridDrag({
      nodes: [smaller[0], nodes[1], nodes[2], nodes[3]],
      draggedId: 'incoming',
    });
    expect(rejected.reason).toBe('fullOrInvalidPreview');
    expect(rejected.context.preview).toBeNull();
  });

  it('does not create a grid preview for a nonimage target hit or an ordinary group', () => {
    const nodes = [group(), image('text', { type: 'text', position: { x: 110, y: 110 } })];
    const updated = updateStoryboardGridDrag({ nodes, draggedId: 'text' });
    expect(updated).toMatchObject({ valid: true, reason: 'imageOnly', context: { preview: null } });
    expect(updated.nodes).toBe(nodes);
    const ordinary = [
      group('g', { standaloneStoryboardImageGrid: false }),
      image('a', { parentId: 'g' }),
    ];
    expect(prepareStoryboardGridDrag({ nodes: ordinary, draggedId: 'a' }).nodes).toBe(ordinary);
    expect(finishStoryboardGridDrag({ nodes: ordinary, draggedId: 'a' }).kind).toBe('none');
  });

  it('keeps center geometry direct-parent based as in source, rather than using pointer or recursive ancestry', () => {
    const nodes = [
      group('target'),
      group(
        'parent',
        { standaloneStoryboardImageGrid: false },
        { position: { x: 100, y: 100 }, parentId: 'grand' },
      ),
      group('grand', { standaloneStoryboardImageGrid: false }, { position: { x: 5000, y: 5000 } }),
      image('a', { parentId: 'parent', position: { x: 10, y: 10 } }),
    ];
    const updated = updateStoryboardGridDrag({ nodes, draggedId: 'a' });
    expect(updated.targetGroupId).toBe('target');
    expect(updated.context.preview.originalParentId).toBe('parent');
  });

  it('returns unchanged invalid inputs for missing nodes/parents, duplicate IDs/order and nonfinite dimensions', () => {
    const duplicate = [image('a'), image('a')];
    expect(prepareStoryboardGridDrag({ nodes: duplicate, draggedId: 'a' })).toMatchObject({
      valid: false,
      nodes: duplicate,
      reason: 'invalidGraph',
    });
    expect(
      updateStoryboardGridDrag({ nodes: [image('a', { parentId: 'missing' })], draggedId: 'a' })
        .reason,
    ).toBe('missingParent');
    expect(
      createStoryboardGridDragPreview({
        nodes: [
          group('g', { childNodeIds: ['a', 'a'] }),
          image('a', { parentId: 'g' }),
          image('b', { parentId: 'g' }),
          image('incoming'),
        ],
        groupId: 'g',
        draggedId: 'incoming',
      }),
    ).toBeNull();
    expect(
      createStoryboardGridDragPreview({
        nodes: [group(), image('a', { width: Infinity })],
        groupId: 'g',
        draggedId: 'a',
      }),
    ).toBeNull();
    const good = [group(), image('a', { parentId: 'g' })];
    const context = prepareStoryboardGridDrag({ nodes: good, draggedId: 'a' }).context;
    const missing = [good[0]];
    expect(finishStoryboardGridDrag({ nodes: missing, draggedId: 'a', context })).toMatchObject({
      valid: false,
      changed: false,
      nodes: missing,
    });
    expect(
      updateStoryboardGridDrag({
        nodes: good,
        draggedId: 'a',
        context: { ...context, draggedId: 'other' },
      }).reason,
    ).toBe('invalidSource');
    expect(
      finishStoryboardGridDrag({
        nodes: [good[0], image('a'), image('b')],
        draggedId: 'b',
        context,
      }).reason,
    ).toBe('invalidSource');
  });
});

describe('standalone renderer membership reflow', () => {
  it('uses actual children, removes stale metadata IDs and keeps complete preferred order', () => {
    const nodes = frozen([
      group(
        'g',
        { childNodeIds: ['departed', 'b', 'a'] },
        { style: { width: 900, height: 800, border: 'keep' } },
      ),
      image('a', { parentId: 'g', width: 10, height: 20 }),
      image('b', { parentId: 'g', width: 30, height: 40 }),
      image('departed', { parentId: 'other' }),
    ]);
    const result = reconcileStoryboardGridMembership({ nodes, groupIds: ['g'] });
    expect(result).toMatchObject({ valid: true, changed: true, reconciledGroupIds: ['g'] });
    expect(result.nodes[0]).toMatchObject({
      width: 108,
      height: 56,
      style: { border: 'keep' },
      data: { childNodeIds: ['b', 'a'], nodeWidth: 108, nodeHeight: 56, groupLayoutMode: 'grid' },
    });
    expect(result.nodes[1].position).toEqual({ x: 56, y: 4 });
    expect(result.nodes[2].position).toEqual({ x: 4, y: 4 });
    expect(result.nodes[1].data).toMatchObject({
      _explicitContentDims: true,
      contentWidth: 48,
      contentHeight: 48,
    });
    expect(result.nodes[1].width).toBe(10);
    expect(result.nodes[3]).toBe(nodes[3]);
    expect(nodes[0].data.childNodeIds).toEqual(['departed', 'b', 'a']);
  });

  it('falls back to numeric name order after membership adds an uncovered child, including nonimage children', () => {
    const nodes = [
      group('g', { childNodeIds: ['old', 'ten'] }),
      image('ten', { parentId: 'g', position: { x: 0, y: 0 }, data: { name: 'Shot 10' } }),
      image('two', {
        parentId: 'g',
        type: 'text',
        position: { x: 200, y: 300 },
        data: { name: 'Shot 2' },
      }),
    ];
    const result = reconcileStoryboardGridMembership({ nodes, groupIds: ['g'] });
    expect(result.nodes[0].data.childNodeIds).toEqual(['two', 'ten']);
    expect(result.nodes[2].position).toEqual({ x: 4, y: 4 });
    expect(result.nodes[2].data._explicitContentDims).toBe(true);
  });

  it('preserves variable child dimensions, updates flow/measured, and retains reserved rows', () => {
    const nodes = [
      group('g', {
        storyboardManualGridCols: 2,
        storyboardManualGridRows: 2,
        storyboardPreserveChildDimensions: true,
      }),
      image('a', {
        parentId: 'g',
        width: 1000,
        height: 1000,
        data: { contentWidth: 30, contentHeight: 40 },
      }),
      image('b', { parentId: 'g', width: 80, height: 90 }),
    ];
    const result = reconcileStoryboardGridMembership({ nodes, groupIds: ['g'] });
    expect(result.nodes[0]).toMatchObject({ width: 122, height: 222 });
    expect(result.nodes[1]).toMatchObject({
      width: 30,
      height: 40,
      measured: { width: 30, height: 40 },
      data: { _explicitContentDims: true, contentWidth: 30, contentHeight: 40 },
    });
    expect(result.nodes[2]).toMatchObject({ width: 80, height: 90, position: { x: 38, y: 4 } });
  });

  it('does not reflow empty, nonstandalone, video or unknown-subtype groups', () => {
    const nodes = [
      group('empty', { childNodeIds: ['departed'] }),
      group('normal', { standaloneStoryboardImageGrid: false }),
      group('video', { storyboardGroupType: 'video' }),
      group('unknown', { storyboardGroupType: undefined }),
      image('a', { parentId: 'normal' }),
      image('b', { parentId: 'video' }),
      image('c', { parentId: 'unknown' }),
    ];
    const result = reconcileStoryboardGridMembership({
      nodes,
      groupIds: ['empty', 'normal', 'video', 'unknown', 'missing'],
    });
    expect(result).toMatchObject({ valid: true, changed: false, reconciledGroupIds: [] });
    expect(result.nodes).toBe(nodes);
    expect(nodes[0].data.childNodeIds).toEqual(['departed']);
  });

  it('keeps all requested groups atomic if one latest member has corrupt dimensions or preferred order', () => {
    const first = [group('g', { childNodeIds: ['a'] }), image('a', { parentId: 'g' })];
    const second = [
      group('bad', { childNodeIds: ['x', 'y'] }),
      image('x', { parentId: 'bad' }),
      image('y', { parentId: 'bad', data: { contentHeight: Infinity } }),
    ];
    const nodes = frozen([...first, ...second]);
    const result = reconcileStoryboardGridMembership({ nodes, groupIds: ['g', 'bad'] });
    expect(result).toMatchObject({
      valid: false,
      changed: false,
      reason: 'invalidDimensions',
      reconciledGroupIds: [],
    });
    expect(result.nodes).toBe(nodes);
    const duplicate = [
      group('bad', { childNodeIds: ['x', 'x'] }),
      image('x', { parentId: 'bad' }),
      image('y', { parentId: 'bad' }),
    ];
    expect(
      reconcileStoryboardGridMembership({ nodes: duplicate, groupIds: ['bad'] }),
    ).toMatchObject({ valid: false, changed: false, nodes: duplicate, reason: 'invalidOrder' });
  });
});
