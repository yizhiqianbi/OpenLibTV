import { act, renderHook } from '@testing-library/react';
import { StrictMode, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import { useCanvasDeletionHistory } from './useCanvasDeletionHistory.js';

const original = {
  nodes: [{ id: 'source', data: { name: 'keep' } }, { id: 'target' }],
  edges: [{ id: 'ordinary', source: 'source', target: 'target' }, { id: 'linked' }],
};
const ordinary = {
  nodes: [{ id: 'source', data: { name: 'keep' } }, { id: 'target' }],
  edges: [{ id: 'linked' }],
};
const nodesRemoved = {
  nodes: [{ id: 'source', data: { name: 'keep' } }],
  edges: [{ id: 'linked' }],
};
const unlinked = { nodes: [{ id: 'source', data: { name: 'keep' } }], edges: [] };

function usePage({ key = 'A', ready = true, readonly = false, fail = false } = {}) {
  const [graph, setGraph] = useState(original);
  const document = useRef(graph);
  document.current = graph;
  const history = useSnapshotHistory(graph, { restore: setGraph });
  const notify = useRef(vi.fn()).current;
  const deletion = useCanvasDeletionHistory({
    documentKey: key,
    ready,
    readonly,
    recordSnapshot: history.recordSnapshot,
    captureSnapshot: () => {
      if (fail) throw new Error('projection');
      return document.current;
    },
    undo: history.undo,
    redo: history.redo,
    notify,
  });
  return { graph, setGraph, deletion, history, notify };
}

describe('accepted deletion phase history with the actual snapshot history', () => {
  it('preserves an accepted graph and pending before when Undo cannot read current drafts, then retries', () => {
    const page = renderHook(usePage);
    act(() => {
      const { deletion, setGraph } = page.result.current;
      deletion.capture(original);
      setGraph(ordinary);
      deletion.createWriter()(original, ordinary);
    });
    page.rerender({ fail: true });
    act(() => expect(page.result.current.deletion.undo()).toBe(false));
    expect(page.result.current.graph).toEqual(ordinary);
    expect(page.result.current.history.history.current).toEqual([original]);
    expect(page.result.current.history.future.current).toEqual([]);
    page.rerender({ fail: false });
    act(() => expect(page.result.current.deletion.undo()).toBe(true));
    expect(page.result.current.graph).toEqual(original);
    expect(page.result.current.history.history.current).toEqual([]);
    expect(page.result.current.history.future.current).toEqual([ordinary]);
  });

  it('keeps Redo available without restoring over unreadable current drafts, then retries', () => {
    const page = renderHook(usePage);
    act(() => {
      const { deletion, setGraph } = page.result.current;
      deletion.capture(original);
      setGraph(ordinary);
      deletion.createWriter()(original, ordinary);
    });
    act(() => expect(page.result.current.deletion.undo()).toBe(true));
    page.rerender({ fail: true });
    act(() => expect(page.result.current.deletion.redo()).toBe(false));
    expect(page.result.current.graph).toEqual(original);
    expect(page.result.current.history.history.current).toEqual([]);
    expect(page.result.current.history.future.current).toEqual([ordinary]);
    page.rerender({ fail: false });
    act(() => expect(page.result.current.deletion.redo()).toBe(true));
    expect(page.result.current.graph).toEqual(ordinary);
    expect(page.result.current.history.history.current).toEqual([original]);
    expect(page.result.current.history.future.current).toEqual([]);
  });
  it('captures without a graph/history write, and a no-op never creates undo', () => {
    const page = renderHook(usePage);
    let writer;
    act(() => {
      expect(page.result.current.deletion.capture()).toBe(true);
      writer = page.result.current.deletion.createWriter();
      expect(writer(original, original)).toBe(true);
      page.result.current.deletion.flush();
    });
    expect(page.result.current.graph).toEqual(original);
    expect(page.result.current.history.history.current).toEqual([]);
    expect(page.result.current.history.future.current).toEqual([]);
  });

  it('coalesces ordinary and node callbacks in one turn, with full undo/redo', () => {
    const page = renderHook(usePage);
    act(() => {
      const { deletion, setGraph } = page.result.current;
      const writer = deletion.createWriter();
      deletion.capture(original);
      setGraph(ordinary);
      writer(original, ordinary);
      deletion.capture(ordinary);
      setGraph(nodesRemoved);
      writer(ordinary, nodesRemoved);
    });
    expect(page.result.current.history.history.current).toEqual([original]);
    act(() => page.result.current.history.undo());
    expect(page.result.current.graph).toEqual(original);
    act(() => page.result.current.history.redo());
    expect(page.result.current.graph).toEqual(nodesRemoved);
  });

  it('starts a separate segment for delayed association acceptance', async () => {
    const page = renderHook(usePage);
    const writer = page.result.current.deletion.createWriter();
    act(() => {
      page.result.current.deletion.capture(original);
      page.result.current.setGraph(ordinary);
      writer(original, ordinary);
    });
    await act(async () => {});
    act(() => {
      page.result.current.deletion.capture(ordinary);
      page.result.current.setGraph({ nodes: ordinary.nodes, edges: [] });
      writer(ordinary, { nodes: ordinary.nodes, edges: [] });
    });
    expect(page.result.current.history.history.current).toEqual([original, ordinary]);
    act(() => page.result.current.history.undo());
    expect(page.result.current.graph).toEqual(ordinary);
    act(() => page.result.current.history.undo());
    expect(page.result.current.graph).toEqual(original);
    act(() => page.result.current.history.redo());
    expect(page.result.current.graph).toEqual(ordinary);
    act(() => page.result.current.history.redo());
    expect(page.result.current.graph).toEqual({ nodes: ordinary.nodes, edges: [] });
  });

  it('a captured initial confirmation supplies before to later bypass stages', async () => {
    const page = renderHook(usePage);
    let writer;
    act(() => {
      page.result.current.deletion.capture(original);
      writer = page.result.current.deletion.createWriter();
    });
    await act(async () => {});
    act(() => {
      page.result.current.setGraph(ordinary);
      writer(original, ordinary);
      page.result.current.setGraph(unlinked);
      writer(ordinary, unlinked);
    });
    expect(page.result.current.history.history.current).toEqual([original]);
  });

  it('finalizes changed pending before without waiting for an async callback', () => {
    const page = renderHook(usePage);
    act(() => {
      page.result.current.deletion.capture(original);
      page.result.current.setGraph(ordinary);
    });
    act(() => page.result.current.deletion.flush());
    expect(page.result.current.history.history.current).toEqual([original]);
  });

  it('other records keep their own segment and do not duplicate published before', () => {
    const page = renderHook(usePage);
    act(() => {
      const { deletion } = page.result.current;
      deletion.capture(original);
      deletion.createWriter()(original, ordinary);
      deletion.recordSnapshot(ordinary);
    });
    expect(page.result.current.history.history.current).toEqual([original, ordinary]);
  });

  it('a later unrelated record retires an unchanged before, without a phantom entry', () => {
    const page = renderHook(usePage);
    act(() => {
      page.result.current.deletion.capture(original);
      page.result.current.deletion.recordSnapshot(original);
    });
    expect(page.result.current.history.history.current).toEqual([original]);
  });

  it('copies before and ignores object-key order as a graph change', () => {
    const page = renderHook(usePage);
    const before = { nodes: [{ id: 'n', data: { name: 'original', value: 1 } }], edges: [] };
    act(() => {
      page.result.current.deletion.capture(before);
      before.nodes[0].data.name = 'external mutation';
      const writer = page.result.current.deletion.createWriter();
      writer(before, { nodes: [{ data: { value: 1, name: 'original' }, id: 'n' }], edges: [] });
    });
    expect(page.result.current.history.history.current).toEqual([]);
  });

  it('retires a captured writer on A→B→A even when node IDs match', () => {
    const page = renderHook(usePage, { initialProps: { key: 'A' } });
    const stale = page.result.current.deletion.createWriter();
    act(() => page.result.current.deletion.capture(original));
    page.rerender({ key: 'B' });
    page.rerender({ key: 'A' });
    act(() => {
      page.result.current.deletion.capture(original);
      expect(stale(original, ordinary)).toBe(false);
    });
    expect(page.result.current.history.history.current).toEqual([]);
    act(() => page.result.current.deletion.createWriter()(original, ordinary));
    expect(page.result.current.history.history.current).toEqual([original]);
  });

  it.each([{ ready: false }, { readonly: true }])('retires a writer when %j', (disabled) => {
    const page = renderHook(usePage, { initialProps: {} });
    const stale = page.result.current.deletion.createWriter();
    act(() => page.result.current.deletion.capture(original));
    page.rerender(disabled);
    page.rerender({});
    act(() => expect(stale(original, ordinary)).toBe(false));
    expect(page.result.current.history.history.current).toEqual([]);
  });

  it('works under StrictMode replay and retires writers at unmount', () => {
    const page = renderHook(usePage, { wrapper: StrictMode });
    const writer = page.result.current.deletion.createWriter();
    act(() => {
      expect(page.result.current.deletion.capture(original)).toBe(true);
      writer(original, ordinary);
    });
    expect(page.result.current.history.history.current).toEqual([original]);
    page.unmount();
    expect(writer(ordinary, unlinked)).toBe(false);
  });

  it('projection failures and explicit discard have no graph/history writes', () => {
    const page = renderHook(usePage, { initialProps: { fail: true } });
    act(() => expect(page.result.current.deletion.capture()).toBe(false));
    page.rerender({ fail: false });
    act(() => {
      page.result.current.deletion.capture(original);
      page.result.current.deletion.discard();
      page.result.current.deletion.createWriter()(original, ordinary);
    });
    expect(page.result.current.history.history.current).toEqual([]);
    expect(page.result.current.graph).toEqual(original);
  });
});
