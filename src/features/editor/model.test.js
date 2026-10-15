// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSnapshotHistory } from './model.js';

describe('editor snapshot history', () => {
  it('keeps a detached snapshot so later node edits do not change undo', () => {
    const history = createSnapshotHistory();
    const snapshot = { nodes: [{ data: { text: 'before' } }], edges: [] };
    history.record(snapshot);
    snapshot.nodes[0].data.text = 'after';
    expect(history.undo(snapshot).nodes[0].data.text).toBe('before');
    expect(history.redo({ nodes: [], edges: [] }).nodes[0].data.text).toBe('after');
  });

  it('discards redo when an edit starts a new branch', () => {
    const history = createSnapshotHistory();
    history.record({ value: 1 });
    history.undo({ value: 2 });
    history.record({ value: 3 });
    expect(history.redo({ value: 4 })).toBeNull();
    expect(history.undo({ value: 4 })).toEqual({ value: 3 });
  });

  it('bounds retained snapshots and clears both directions', () => {
    const history = createSnapshotHistory(2);
    [1, 2, 3].forEach((value) => history.record({ value }));
    expect(history.undo({ value: 4 })).toEqual({ value: 3 });
    expect(history.undo({ value: 3 })).toEqual({ value: 2 });
    expect(history.undo({ value: 2 })).toBeNull();
    history.clear();
    expect(history.future).toEqual([]);
    expect(history.past).toEqual([]);
  });
});
