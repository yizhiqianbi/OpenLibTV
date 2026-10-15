import { describe, expect, it } from 'vitest';
import { resolveStoryboardGridPresentation } from './storyboard-grid-presentation-model.js';

const group = (data = {}, extra = {}) => ({
  id: 'group',
  type: 'group',
  position: { x: 100, y: 200 },
  width: 212,
  height: 172,
  data: {
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    storyboardManualGridCols: 2,
    storyboardManualGridRows: 2,
    ...data,
  },
  ...extra,
});
const child = (id, extra = {}) => ({
  id,
  type: 'image',
  parentId: 'group',
  position: { x: 4, y: 4 },
  width: 100,
  height: 80,
  data: { name: id },
  ...extra,
});
const view = (node, nodes = [], extra = {}) =>
  resolveStoryboardGridPresentation({ node, nodes: [node, ...nodes], ...extra });

describe('source standalone grid presentation', () => {
  it.each([
    group({ standaloneStoryboardImageGrid: false }),
    group({ storyboardGroupType: 'video' }),
    group({ storyboardGroupType: undefined }),
    { ...group(), type: 'video_group' },
    null,
  ])('does not apply standalone image UI to an ordinary or incompatible group', (node) => {
    expect(view(node)).toBeNull();
  });

  it('uses actual image membership and ignores stale child IDs or foreign parents', () => {
    const node = group({ childNodeIds: ['foreign', 'missing', 'a'] });
    const result = view(node, [
      child('a'),
      child('b'),
      child('foreign', { parentId: 'other' }),
      child('text', { type: 'text' }),
    ]);
    expect(result.children.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.slots.map((slot) => slot.index)).toEqual([2, 3]);
    expect(result.slots[0]).toEqual({
      index: 2,
      position: { x: 4, y: 88 },
      size: { width: 100, height: 80 },
      highlighted: false,
      background: '#FFFFFF0D',
      color: '#737373',
    });
  });

  it('uses a complete preferred order across all actual children and otherwise numeric name order', () => {
    const nodes = [child('10'), child('2'), child('1'), child('text', { type: 'text' })];
    const complete = view(group({ childNodeIds: ['2', 'text', '10', '1'] }), nodes);
    expect(complete.children.map((node) => node.id)).toEqual(['2', '10', '1']);
    const incomplete = view(group({ childNodeIds: ['10', '2', '1'] }), nodes);
    expect(incomplete.children.map((node) => node.id)).toEqual(['1', '2', '10']);
    const duplicate = view(group({ childNodeIds: ['10', '10', '2', 'text'] }), nodes);
    expect(duplicate.children.map((node) => node.id)).toEqual(['1', '2', '10']);
  });

  it('preserves fixed empty slots and highlights only the incoming hover placeholders', () => {
    const result = view(group(), [child('a')], { hoverCount: 2.9 });
    expect(result.totalSlots).toBe(4);
    expect(result.hoverCount).toBe(2);
    expect(
      result.slots.map((slot) => [slot.index, slot.highlighted, slot.background, slot.color]),
    ).toEqual([
      [1, true, '#5DDCFF1F', '#5DDCFF'],
      [2, true, '#5DDCFF1F', '#5DDCFF'],
      [3, false, '#FFFFFF0D', '#737373'],
    ]);
  });

  it('supports an explicit zero hover override and sanitizes negative or nonfinite counts', () => {
    const node = group({ storyboardMultiDragHoverCount: 2 });
    expect(view(node, [child('a')]).hoverCount).toBe(2);
    for (const hoverCount of [0, -2, Infinity, NaN]) {
      const result = view(node, [child('a')], { hoverCount });
      expect(result.hoverCount).toBe(0);
      expect(result.slots.every((slot) => !slot.highlighted)).toBe(true);
    }
  });

  it('reverses shell dimensions into empty cell sizes and applies the source minimum of 48', () => {
    const result = view(group());
    expect(result.cellW).toBe(100);
    expect(result.cellH).toBe(80);
    expect(result.slots).toHaveLength(4);
    const small = view(group({}, { width: 8, height: 8 }));
    expect(small.cellW).toBe(48);
    expect(small.cellH).toBe(48);
    expect(small.slots[3]).toMatchObject({
      position: { x: 56, y: 56 },
      size: { width: 48, height: 48 },
    });
  });

  it('reads positive content dimensions before measured/stored sizes for uniform placeholders', () => {
    const result = view(group(), [
      child('a', {
        width: 10,
        height: 10,
        measured: { width: 20, height: 20 },
        data: { name: 'a', contentWidth: 300, contentHeight: 200 },
      }),
      child('b'),
    ]);
    expect(result.cellW).toBe(300);
    expect(result.cellH).toBe(200);
    expect(result.slots[0]).toMatchObject({
      position: { x: 4, y: 208 },
      size: { width: 300, height: 200 },
    });
    const tiny = view(group(), [child('a', { width: 10, height: 10 })]);
    expect(tiny.cellW).toBe(48);
    expect(tiny.cellH).toBe(48);
  });

  it('keeps variable child dimensions and row/column maxima, with fallback sizes for highlighted incoming cells', () => {
    const node = group({ storyboardPreserveChildDimensions: true, childNodeIds: ['a', 'b', 'c'] });
    const nodes = [
      child('a', { width: 300, height: 80 }),
      child('b', { width: 100, height: 100 }),
      child('c', { width: 50, height: 200 }),
    ];
    const plain = view(node, nodes);
    expect(plain.slots[0]).toMatchObject({
      index: 3,
      position: { x: 308, y: 108 },
      size: { width: 100, height: 200 },
    });
    const hover = view(node, nodes, { hoverCount: 1 });
    expect(hover.slots[0]).toMatchObject({
      index: 3,
      position: { x: 308, y: 108 },
      size: { width: 300, height: 200 },
      highlighted: true,
    });
  });

  it.each([
    [0.25, 4, 'calc(100% + 8px)', 53],
    [1, 1, 'calc(100% + 8px)', 212],
    [2, 0.5, 'calc(100% + 4px)', 424],
  ])('keeps the external title screen-sized at zoom %f', (zoom, scale, bottom, maxWidth) => {
    expect(view(group(), [], { zoom }).titleStyle).toMatchObject({
      left: 0,
      bottom,
      transform: `scale(${scale})`,
      transformOrigin: 'bottom left',
      padding: 0,
      maxWidth,
      fontSize: 13,
    });
  });

  it('falls back to measured shell dimensions and rejects malformed geometry without touching the graph', () => {
    const node = group(
      {},
      { width: undefined, height: undefined, measured: { width: 212, height: 172 } },
    );
    const nodes = [node, child('a')];
    const before = structuredClone(nodes);
    expect(resolveStoryboardGridPresentation({ node, nodes }).titleStyle.maxWidth).toBe(212);
    expect(nodes).toEqual(before);
    expect(view(group({}, { width: Infinity }))).toBeNull();
    expect(view(group(), [child('a', { data: { contentWidth: Infinity } })])).toBeNull();
    expect(resolveStoryboardGridPresentation({ node, nodes: null })).toBeNull();
  });
});
