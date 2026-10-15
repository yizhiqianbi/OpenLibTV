// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  patchStudioRow,
  revealStudioRow,
  studioNameError,
  studioOutlinerRows,
  toggleStudioSubtree,
  visibleStudioRows,
} from './model.js';

export const treeObjects = [
  {
    id: 'model',
    name: 'Scene',
    type: 'glb',
    visible: true,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    subtree: [
      {
        path: [0],
        name: 'Branch',
        type: 'group',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        path: [0, 0],
        name: 'Leaf',
        type: 'mesh',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      {
        path: [1],
        name: 'Other',
        type: 'mesh',
        position: [0, 1, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
    ],
  },
];
describe('source Studio outliner contracts', () => {
  it('keeps hierarchical counts, hidden ancestors and search ancestors independent of collapse', () => {
    const objects = patchStudioRow(treeObjects, 'model:node:0', { visible: false });
    const rows = studioOutlinerRows(objects);
    expect(rows[0]).toMatchObject({ childCount: 2, descendantCount: 3 });
    expect(rows[2]).toMatchObject({ parentId: 'model:node:0', hiddenByAncestorId: 'model:node:0' });
    const collapsed = toggleStudioSubtree(rows, new Set(), 'model', true);
    expect([...collapsed]).toEqual(['model', 'model:node:0']);
    expect(visibleStudioRows(rows, collapsed).map((row) => row.name)).toEqual(['Scene']);
    expect(visibleStudioRows(rows, collapsed, 'lEaF').map((row) => row.name)).toEqual([
      'Scene',
      'Branch',
      'Leaf',
    ]);
    expect(
      visibleStudioRows(rows, toggleStudioSubtree(rows, collapsed, 'model', true)),
    ).toHaveLength(4);
    expect([...revealStudioRow(rows, collapsed, 'model:node:0.0')]).toEqual([]);
  });
  it('patches one stable path without rewriting original GLB metadata or a similarly named object', () => {
    const objects = patchStudioRow(treeObjects, 'model:node:0.0', {
      position: [7, 2, 0],
      name: 'Renamed',
    });
    expect(objects[0].nodeEdits).toEqual({ '0.0': { position: [7, 2, 0], name: 'Renamed' } });
    expect(treeObjects[0].subtree[1].position).toEqual([1, 0, 0]);
    expect(studioOutlinerRows(objects)[2]).toMatchObject({ name: 'Renamed', position: [7, 2, 0] });
    expect(patchStudioRow(objects, 'not-a-real-node', { name: 'wrong' })).toBe(objects);
  });
  it('removes a source node and its descendants while preserving stable paths for undo', () => {
    const removed = patchStudioRow(treeObjects, 'model:node:0', { deleted: true });
    expect(studioOutlinerRows(removed).map((row) => row.id)).toEqual(['model', 'model:node:1']);
    expect(removed[0].subtree).toHaveLength(3);
    const restored = patchStudioRow(removed, 'model:node:0', { deleted: false });
    expect(studioOutlinerRows(restored).map((row) => row.id)).toEqual([
      'model',
      'model:node:0',
      'model:node:0.0',
      'model:node:1',
    ]);
  });
  it('enforces source binding-safe unique rename rules and permits unchanged imported filenames', () => {
    const rows = studioOutlinerRows(treeObjects);
    for (const name of [
      '',
      ' '.repeat(3),
      'x'.repeat(129),
      'Part.one',
      'Part:one',
      '[Part]',
      'Part/one',
      'Other',
    ])
      expect(studioNameError(rows, 'model:node:0', name)).not.toBe('');
    expect(studioNameError(rows, 'model:node:0', ' Unique part ')).toBe('');
    expect(studioNameError([{ id: 'id', name: 'original.glb' }], 'id', 'original.glb')).toBe('');
  });
});
