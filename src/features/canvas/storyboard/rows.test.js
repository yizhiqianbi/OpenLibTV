import { describe, expect, it } from 'vitest';
import {
  createStoryboardRow,
  deleteStoryboardRow,
  filterStoryboardRows,
  insertStoryboardRowAfter,
  moveStoryboardRow,
  patchStoryboardRow,
  reconcileStoryboardSelection,
  storyboardTableConfigPatch,
  storyboardViewPatch,
} from './rows.js';
const rows = [
  {
    id: 'a',
    hiddenUuid: 'ha',
    shotNumber: 1,
    plotDescription: 'Mountain',
    durationSeconds: 5,
    extra: { saved: true },
  },
  { id: 'b', hiddenUuid: 'hb', shotNumber: 2, plotDescription: 'Sea', durationSeconds: 8 },
];
describe('source storyboard row rules', () => {
  it('keeps identity and unknown metadata when editing, reordering and removing rows', () => {
    const patched = patchStoryboardRow(rows, 'a', { plotDescription: '山\n海' });
    expect(patched[0]).toMatchObject({
      id: 'a',
      hiddenUuid: 'ha',
      extra: { saved: true },
      plotDescription: '山\n海',
    });
    expect(patched[1]).toBe(rows[1]);
    expect(moveStoryboardRow(patched, 'a', 'b').map((row) => [row.id, row.shotNumber])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
    expect(deleteStoryboardRow(rows, 'a')).toEqual([{ ...rows[1], shotNumber: 1 }]);
    expect(moveStoryboardRow(rows, 'missing', 'b')).toBe(rows);
  });
  it('uses source five-second defaults, fresh stable IDs and renumbers insertion', () => {
    let id = 0;
    const makeId = () => `new-${++id}`;
    expect(createStoryboardRow(2, makeId)).toMatchObject({
      id: 'new-1',
      hiddenUuid: 'new-2',
      durationSeconds: 5,
      imageGenerationPrompt: '',
      videoMotionPrompt: '',
    });
    const result = insertStoryboardRowAfter(rows, 'a', makeId);
    expect(result.map((row) => row.shotNumber)).toEqual([1, 2, 3]);
    expect(result[0]).toBe(rows[0]);
    expect(result[2].hiddenUuid).toBe('hb');
  });
  it('applies case-insensitive AND filters and ignores unknown operators without altering rows', () => {
    expect(
      filterStoryboardRows(rows, [
        { id: 'plotDescription', value: { operator: 'contains', value: 'MOUN' } },
        { id: 'durationSeconds', value: { operator: 'lt', value: '6' } },
      ]),
    ).toEqual([rows[0]]);
    expect(
      filterStoryboardRows(rows, [
        { id: 'durationSeconds', value: { operator: 'gt', value: '5' } },
        { id: 'plotDescription', value: { operator: 'equals', value: 'SEA' } },
      ]),
    ).toEqual([rows[1]]);
    expect(
      filterStoryboardRows(rows, [
        { id: 'plotDescription', value: { operator: 'future', value: 'x' } },
      ]),
    ).toEqual(rows);
    expect(reconcileStoryboardSelection(rows, new Set(['ha', 'missing']))).toEqual(new Set(['ha']));
  });
  it('stores config only on active view and preserves other views and metadata', () => {
    const data = {
      activeViewId: 'custom',
      views: [
        { id: 'default', type: 'table', other: true },
        { id: 'custom', type: 'creative', extra: true },
      ],
    };
    const patch = storyboardTableConfigPatch(data, { columnVisibility: { dialogue: false } });
    expect(patch.views[0]).toBe(data.views[0]);
    expect(patch.views[1]).toMatchObject({
      extra: true,
      tableConfig: { columnVisibility: { dialogue: false } },
    });
    expect(storyboardViewPatch(data, 'table')).toEqual({
      viewMode: 'table',
      activeViewId: 'default',
    });
  });
});
