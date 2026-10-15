import { describe, expect, it } from 'vitest';
import { canvasNodeSize } from './groups.js';
import {
  canvasMultiConnectionEntryProjection,
  resolveCanvasMultiConnectionEntry,
} from './multi-connection-entry-model.js';
import {
  canvasSelectionOverlayProjection,
  canvasVirtualSelection,
} from './selection-overlay-model.js';

const node = (id, type = 'image', extra = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  width: 200,
  height: 120,
  data: { type },
  ...extra,
});
const group = node('group', 'group', {
  position: { x: 100, y: 200 },
  width: 700,
  height: 500,
});
const leaf = node('leaf', 'image', { parentId: 'group', position: { x: 20, y: 30 } });

describe('multi-connection entry from virtual selection or one real group', () => {
  it('preserves every existing virtual descriptor field, source order, and projection', () => {
    const nodes = [group, leaf, node('outside', 'text', { position: { x: 1100, y: 500 } })];
    const input = { nodes, selectedIds: ['group', 'outside'], zoom: 0.25 };
    const virtual = canvasVirtualSelection(input);
    const entry = resolveCanvasMultiConnectionEntry(input);
    expect(entry).toEqual({
      ...virtual,
      kind: 'selection',
      entryKey: 'selection:["outside","leaf"]',
    });
    const view = { x: 17, y: 23, z: 0.25 };
    expect(canvasMultiConnectionEntryProjection({ entry, view })).toEqual(
      canvasSelectionOverlayProjection({ bounds: virtual.bounds, view }),
    );
    expect(entry).not.toHaveProperty('groupId');
  });

  it('exposes a real group with only one actionless non-reference leaf', () => {
    const entry = resolveCanvasMultiConnectionEntry({
      nodes: [group, leaf],
      selectedIds: ['group'],
    });
    expect(entry).toEqual({
      kind: 'group',
      entryKey: 'group:group',
      groupId: 'group',
      bounds: { x: 100, y: 200, width: 700, height: 500 },
      sourceSeedIds: ['leaf'],
    });
    expect(entry).not.toHaveProperty('visible');
    expect(entry).not.toHaveProperty('dragNodeIds');
  });

  it('keeps a group entry when that group and its non-group descendants are selected', () => {
    const nested = node('nested', 'group', { parentId: 'group' });
    const nestedLeaf = node('nested-leaf', 'audio', { parentId: 'nested' });
    const nodes = [nestedLeaf, group, leaf, nested];
    const entry = resolveCanvasMultiConnectionEntry({
      nodes,
      selectedIds: ['group', 'leaf', 'nested-leaf'],
    });
    expect(entry.kind).toBe('group');
    expect(entry.sourceSeedIds).toEqual(['nested-leaf', 'leaf']);
  });

  it('collects recursive leaves by current parent links, excluding all group/reference nodes', () => {
    const nodes = [
      group,
      node('old-child', 'image'),
      node('deep-leaf', 'video', { parentId: 'deep' }),
      node('deep', 'group', { parentId: 'nested' }),
      node('reference', 'reference', { parentId: 'group' }),
      node('nested', 'group', { parentId: 'group' }),
      leaf,
      node('legacy-reference', 'image', { parentId: 'deep', data: { type: 'reference' } }),
    ];
    const input = nodes.map((entry) =>
      entry.id === 'group'
        ? { ...entry, data: { ...entry.data, childNodeIds: ['old-child'] } }
        : entry,
    );
    expect(
      resolveCanvasMultiConnectionEntry({ nodes: input, selectedIds: ['group'] }).sourceSeedIds,
    ).toEqual(['deep-leaf', 'leaf']);
  });

  it('does not expose an empty or reference-only group', () => {
    const reference = node('reference', 'reference', { parentId: 'group' });
    for (const nodes of [[group], [group, reference]])
      expect(resolveCanvasMultiConnectionEntry({ nodes, selectedIds: ['group'] })).toBeNull();
  });

  it('excludes script-derived and source-identified shot-breakdown real groups', () => {
    for (const data of [
      { type: 'group', sourceScriptNodeId: 'script' },
      { type: 'group', breakdownSourceNodeId: 'source' },
    ])
      expect(
        resolveCanvasMultiConnectionEntry({
          nodes: [{ ...group, data }, leaf],
          selectedIds: ['group'],
        }),
      ).toBeNull();
  });

  it('matches the exact shot-breakdown source predicate rather than guessing from names', () => {
    for (const data of [
      { type: 'group', breakdownSourceNodeId: '' },
      { type: 'group', breakdownSourceNodeId: 23 },
      { type: 'group', name: '分镜组' },
      { type: 'image', breakdownSourceNodeId: 'source' },
    ])
      expect(
        resolveCanvasMultiConnectionEntry({
          nodes: [{ ...group, data }, leaf],
          selectedIds: ['group'],
        })?.kind,
      ).toBe('group');
  });

  it('does not apply a real-group gate to an existing virtual multi-selection', () => {
    const nodes = [
      { ...group, data: { type: 'group', sourceScriptNodeId: 'script' } },
      leaf,
      node('outside', 'text', { position: { x: 1100, y: 500 } }),
    ];
    const entry = resolveCanvasMultiConnectionEntry({
      nodes,
      selectedIds: ['group', 'outside'],
    });
    expect(entry.kind).toBe('selection');
    expect(entry.sourceSeedIds).toEqual(['outside', 'leaf']);
  });

  it('resolves nested real-group world bounds without using its children as the bounds', () => {
    const outer = node('outer', 'group', { position: { x: 1000, y: 300 } });
    const middle = node('middle', 'group', {
      parentId: 'outer',
      position: { x: 40, y: 50 },
    });
    const inner = { ...group, parentId: 'middle' };
    expect(
      resolveCanvasMultiConnectionEntry({
        nodes: [outer, middle, inner, leaf],
        selectedIds: ['group'],
      }).bounds,
    ).toEqual({ x: 1140, y: 550, width: 700, height: 500 });
  });

  it('honors source measured-first real bounds and permits caller renderer dimensions', () => {
    const nodes = [{ ...group, measured: { width: 200, height: 300 } }, leaf];
    expect(resolveCanvasMultiConnectionEntry({ nodes, selectedIds: ['group'] }).bounds).toEqual({
      x: 100,
      y: 200,
      width: 200,
      height: 300,
    });
    expect(
      resolveCanvasMultiConnectionEntry({
        nodes,
        selectedIds: ['group'],
        getNodeSize: canvasNodeSize,
      }).bounds,
    ).toEqual({ x: 100, y: 200, width: 700, height: 500 });
  });

  it.each([
    { width: 0, height: 10 },
    { width: 10, height: 0 },
    { width: -10, height: 10 },
    { width: 10, height: Infinity },
    { width: NaN, height: 10 },
  ])('rejects non-positive or non-finite group sizes %j', (size) => {
    expect(
      resolveCanvasMultiConnectionEntry({
        nodes: [{ ...group, ...size }, leaf],
        selectedIds: ['group'],
      }),
    ).toBeNull();
  });

  it('does not turn a missing or explicitly zero source measurement into a default-sized entry', () => {
    const { width: _width, height: _height, ...withoutSize } = group;
    for (const item of [withoutSize, { ...group, measured: { width: 0, height: 300 } }])
      expect(
        resolveCanvasMultiConnectionEntry({ nodes: [item, leaf], selectedIds: ['group'] }),
      ).toBeNull();
  });

  it('provides stable entry identity despite selection order, duplicates, or bounds updates', () => {
    const nodes = [group, leaf];
    const first = resolveCanvasMultiConnectionEntry({ nodes, selectedIds: ['group', 'leaf'] });
    const moved = resolveCanvasMultiConnectionEntry({
      nodes: [{ ...group, position: { x: 999, y: 888 } }, leaf],
      selectedIds: ['leaf', 'group', 'group', 'missing'],
    });
    expect(moved.entryKey).toBe(first.entryKey);
    expect(moved.bounds).not.toEqual(first.bounds);
    const other = node('other', 'group');
    const otherLeaf = { ...leaf, parentId: 'other' };
    expect(
      resolveCanvasMultiConnectionEntry({ nodes: [other, otherLeaf], selectedIds: ['other'] })
        .entryKey,
    ).not.toBe(first.entryKey);
  });

  it('does not mutate nodes, selection, or prior descriptors when group membership changes', () => {
    const nodes = [group, leaf];
    const selectedIds = ['group'];
    const before = structuredClone({ nodes, selectedIds });
    const first = resolveCanvasMultiConnectionEntry({ nodes, selectedIds });
    const second = resolveCanvasMultiConnectionEntry({
      nodes: [...nodes, node('second', 'audio', { parentId: 'group' })],
      selectedIds,
    });
    expect(second.entryKey).toBe(first.entryKey);
    expect(first.sourceSeedIds).toEqual(['leaf']);
    expect(second.sourceSeedIds).toEqual(['leaf', 'second']);
    expect({ nodes, selectedIds }).toEqual(before);
  });

  it('terminates corrupt ancestry cycles while preserving current parent-based membership', () => {
    const first = { ...group, parentId: 'cycle', position: { x: 10, y: 20 } };
    const cycle = node('cycle', 'group', { parentId: 'group', position: { x: 30, y: 40 } });
    const entry = resolveCanvasMultiConnectionEntry({
      nodes: [first, cycle, leaf],
      selectedIds: ['group'],
    });
    expect(entry.bounds).toEqual({ x: 40, y: 60, width: 700, height: 500 });
    expect(entry.sourceSeedIds).toEqual(['leaf']);
  });

  it.each([
    { nodes: null },
    { selectedIds: null },
    { zoom: 0 },
    { zoom: -1 },
    { zoom: Infinity },
    { getNodeSize: false },
  ])('rejects unusable descriptor input %j', (override) => {
    expect(
      resolveCanvasMultiConnectionEntry({
        nodes: [group, leaf],
        selectedIds: ['group'],
        ...override,
      }),
    ).toBeNull();
  });

  it('ignores missing selected identities and does not promote a single leaf to a group entry', () => {
    expect(
      resolveCanvasMultiConnectionEntry({ nodes: [group, leaf], selectedIds: ['missing'] }),
    ).toBeNull();
    expect(
      resolveCanvasMultiConnectionEntry({ nodes: [null, group, leaf], selectedIds: ['leaf'] }),
    ).toBeNull();
  });
});

describe('real-group entry board-local projection', () => {
  const entry = {
    kind: 'group',
    bounds: { x: 100, y: 200, width: 700, height: 500 },
  };

  it('projects the right midpoint directly and creates no virtual frame or toolbar', () => {
    expect(canvasMultiConnectionEntryProjection({ entry })).toEqual({ add: { x: 800, y: 450 } });
    expect(
      canvasMultiConnectionEntryProjection({ entry, view: { x: 17, y: 23, z: 0.25 } }),
    ).toEqual({ add: { x: 217, y: 135.5 } });
  });

  it('uses explicit zoom if supplied without adding the source virtual second-stage padding', () => {
    expect(
      canvasMultiConnectionEntryProjection({ entry, view: { x: -10, y: -20, z: 2 }, zoom: 0.25 }),
    ).toEqual({ add: { x: 190, y: 92.5 } });
  });

  it.each([
    {},
    { entry: { ...entry, kind: 'unknown' } },
    { entry: { ...entry, bounds: { ...entry.bounds, width: 0 } } },
    { entry: { ...entry, bounds: { ...entry.bounds, x: NaN } } },
    { entry, view: { z: 0 } },
    { entry, view: { x: Infinity } },
  ])('rejects unusable projection input %j', (input) => {
    expect(canvasMultiConnectionEntryProjection(input)).toBeNull();
  });
});
