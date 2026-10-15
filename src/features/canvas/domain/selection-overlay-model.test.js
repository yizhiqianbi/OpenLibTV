import { describe, expect, it } from 'vitest';
import { canvasNodeSize } from './groups.js';
import {
  canvasSelectionAddHover,
  canvasSelectionOverlayProjection,
  canvasSelectionSingleRealGroup,
  canvasSelectionZoomPadding,
  canvasVirtualSelection,
} from './selection-overlay-model.js';

const node = (id, x, y, extra = {}) => ({
  id,
  type: 'image',
  position: { x, y },
  width: 200,
  height: 120,
  ...extra,
});
const nodes = [node('a', 100, 200), node('b', 500, 300)];

describe('source virtual selection and visual projection', () => {
  it('includes the title and visible handle extents, with the toolbar above the resulting bounds', () => {
    const selection = canvasVirtualSelection({ nodes, selectedIds: ['a', 'b'] });
    expect(selection).toEqual({
      visible: true,
      bounds: { x: 55, y: 144, width: 690, height: 296 },
      position: { x: 400, y: 144 },
      targetNodeIds: ['a', 'b'],
      sourceSeedIds: ['a', 'b'],
      dragNodeIds: ['a', 'b'],
      groupsToRemoveIds: [],
    });
    expect(canvasSelectionOverlayProjection({ bounds: selection.bounds })).toEqual({
      frame: { left: 55, top: 144, width: 690, height: 296, borderWidth: 1 },
      toolbar: { x: 400, y: 144 },
      add: { x: 745, y: 292 },
    });
  });

  it('retains both distinct compensation stages under zoom and keeps controls in screen space', () => {
    const selection = canvasVirtualSelection({ nodes, selectedIds: ['a', 'b'], zoom: 0.25 });
    expect(canvasSelectionZoomPadding(0.25)).toBe(20);
    expect(selection.bounds).toEqual({ x: 35, y: 124, width: 730, height: 336 });
    expect(
      canvasSelectionOverlayProjection({
        bounds: selection.bounds,
        view: { x: 17, y: 23, z: 0.25 },
      }),
    ).toEqual({
      frame: { left: 20.75, top: 49, width: 192.5, height: 94, borderWidth: 0.75 },
      toolbar: { x: 117, y: 54 },
      add: { x: 208.25, y: 96 },
    });
  });

  it('uses renderer dimensions only when the caller injects its adapter, preserving the source default', () => {
    const data = [
      node('a', 100, 200, { width: 300, height: 240, measured: { width: 50, height: 70 } }),
      node('b', 500, 300),
    ];
    expect(canvasVirtualSelection({ nodes: data, selectedIds: ['a', 'b'] }).bounds.height).toBe(
      296,
    );
    const adapted = canvasVirtualSelection({
      nodes: data,
      selectedIds: ['a', 'b'],
      getNodeSize: canvasNodeSize,
    });
    expect(adapted.bounds.height).toBe(316);
    expect(adapted.bounds.width).toBe(690);
  });

  it('uses source 200×120 fallbacks for nodes without measurements', () => {
    const data = nodes.map(({ width: _width, height: _height, ...rest }) => rest);
    expect(canvasVirtualSelection({ nodes: data, selectedIds: ['a', 'b'] }).bounds).toEqual({
      x: 55,
      y: 144,
      width: 690,
      height: 296,
    });
  });

  it('hides the virtual frame for one ordinary real group and any selected descendants', () => {
    const data = [
      node('group', 10, 20, { type: 'group' }),
      node('child', 40, 50, { parentId: 'group' }),
      node('nested', 1, 2, { type: 'group', parentId: 'group' }),
      node('leaf', 3, 4, { parentId: 'nested' }),
    ];
    expect(canvasSelectionSingleRealGroup(data, ['group', 'child', 'leaf'])?.id).toBe('group');
    expect(
      canvasVirtualSelection({ nodes: data, selectedIds: ['group', 'child', 'leaf'] }),
    ).toBeNull();
    expect(canvasVirtualSelection({ nodes: data, selectedIds: ['group'] })).toBeNull();
    expect(canvasSelectionSingleRealGroup(data, ['group', 'nested'])).toBeNull();
  });

  it('expands selected groups once and leaves nested source eligibility to the batch protocol', () => {
    const data = [
      node('group', 1000, 500, { type: 'group' }),
      node('child', 10, 20, { parentId: 'group' }),
      node('nested', 30, 40, { type: 'group', parentId: 'group' }),
      node('grandchild', 1, 2, { parentId: 'nested' }),
      node('outside', 100, 200, { data: { type: 'reference' } }),
    ];
    const result = canvasVirtualSelection({
      nodes: data,
      selectedIds: ['group', 'child', 'outside'],
    });
    expect(result.targetNodeIds).toEqual(['child', 'outside', 'nested']);
    expect(result.sourceSeedIds).toEqual(['child', 'outside', 'nested']);
    expect(result.dragNodeIds).toEqual(['group', 'outside']);
    expect(result.groupsToRemoveIds).toEqual(['group']);
    expect(result.bounds).toEqual({ x: 55, y: 144, width: 1220, height: 536 });
    expect(result.targetNodeIds).not.toContain('grandchild');
  });

  it('resolves nested selected leaf positions in the shared world-coordinate protocol', () => {
    const data = [
      node('g', 1000, 500, { type: 'group' }),
      node('nested', 50, 60, { type: 'group', parentId: 'g' }),
      node('a', 10, 20, { parentId: 'nested' }),
      node('b', 500, 300),
    ];
    expect(canvasVirtualSelection({ nodes: data, selectedIds: ['a', 'b'] }).bounds).toEqual({
      x: 455,
      y: 244,
      width: 850,
      height: 476,
    });
  });

  it('deduplicates selected IDs, ignores missing identities, and keeps all input objects unchanged', () => {
    const before = structuredClone(nodes);
    const ids = ['a', 'missing', 'a', 'b'];
    const result = canvasVirtualSelection({ nodes, selectedIds: ids });
    expect(result.targetNodeIds).toEqual(['a', 'b']);
    result.sourceSeedIds.push('new');
    expect(result.targetNodeIds).toEqual(['a', 'b']);
    expect(nodes).toEqual(before);
    expect(ids).toEqual(['a', 'missing', 'a', 'b']);
  });

  it('does not confuse video groups with the ordinary group-shell hiding rule', () => {
    const data = [node('video', 100, 200, { type: 'video_group' }), node('b', 500, 300)];
    expect(canvasSelectionSingleRealGroup(data, ['video', 'b'])).toBeNull();
    expect(
      canvasVirtualSelection({ nodes: data, selectedIds: ['video', 'b'] }).targetNodeIds,
    ).toEqual(['video', 'b']);
  });

  it('terminates malformed ancestry cycles when checking a real group or resolving world positions', () => {
    const data = [
      node('g', 10, 20, { type: 'group' }),
      node('a', 1, 2, { parentId: 'b' }),
      node('b', 3, 4, { parentId: 'a' }),
    ];
    expect(canvasSelectionSingleRealGroup(data, ['g', 'a'])).toBeNull();
    expect(canvasVirtualSelection({ nodes: data, selectedIds: ['a', 'b'] }).bounds.x).toBe(-41);
  });

  it.each([0, -1, Infinity, NaN])(
    'rejects unusable zoom %s rather than projecting an infinite frame',
    (zoom) => {
      expect(canvasVirtualSelection({ nodes, selectedIds: ['a', 'b'], zoom })).toBeNull();
      expect(
        canvasSelectionOverlayProjection({ bounds: { x: 0, y: 0, width: 10, height: 10 }, zoom }),
      ).toBeNull();
      expect(canvasSelectionZoomPadding(zoom)).toBe(0);
    },
  );

  it.each([
    undefined,
    null,
    {},
    { x: 0, y: 0, width: 0, height: 1 },
    { x: Infinity, y: 0, width: 10, height: 10 },
  ])('rejects unusable bounds %j', (bounds) => {
    expect(canvasSelectionOverlayProjection({ bounds })).toBeNull();
  });

  it('does not show virtual UI for one actual target or invalid measured adapter data', () => {
    expect(canvasVirtualSelection({ nodes, selectedIds: ['a', 'a', 'missing'] })).toBeNull();
    expect(
      canvasVirtualSelection({
        nodes,
        selectedIds: ['a', 'b'],
        getNodeSize: () => ({ width: NaN, height: 1 }),
      }),
    ).toBeNull();
    expect(
      canvasSelectionOverlayProjection({
        bounds: { x: 0, y: 0, width: 10, height: 10 },
        view: { x: NaN },
      }),
    ).toBeNull();
  });
});

describe('source magnetic multi-selection add glyph', () => {
  it('uses the hit-target center and clamps each screen axis to ±28 independently', () => {
    const rect = { left: 100, top: 200, width: 80, height: 80 };
    expect(canvasSelectionAddHover({ x: 140, y: 240 }, rect)).toEqual({ x: 0, y: 0 });
    expect(canvasSelectionAddHover({ x: 100, y: 280 }, rect)).toEqual({ x: -28, y: 28 });
    expect(canvasSelectionAddHover({ x: 500, y: -100 }, rect)).toEqual({ x: 28, y: -28 });
    expect(canvasSelectionAddHover({ x: 128, y: 247 }, rect)).toEqual({ x: -12, y: 7 });
  });

  it('does not fabricate hover geometry while the target is unavailable', () => {
    expect(canvasSelectionAddHover({ x: 1, y: 2 }, null)).toBeNull();
    expect(
      canvasSelectionAddHover({ x: NaN, y: 2 }, { left: 0, top: 0, width: 80, height: 80 }),
    ).toBeNull();
  });
});
