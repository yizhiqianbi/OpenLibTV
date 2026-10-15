import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

function setup({ retire = false, project, failOnFourthRead = false } = {}) {
  const image = (id) => ({
    id,
    type: 'image',
    position: { x: 10, y: 20 },
    data: { type: 'image', url: [`/${id}`] },
  });
  const nodes = [
    image('first'),
    image('second'),
    {
      id: 'target',
      type: 'video',
      position: { x: 800, y: 20 },
      data: {
        type: 'video',
        params: {
          model: 'star-video2',
          modeType: 'image2video',
          prompt: '{{Image 1}}',
          imageList: [
            { nodeId: 'first', url: '/first' },
            { nodeId: 'second', url: '/second' },
          ],
          videoList: [],
          audioList: [],
          magicList: { stale: { suggestions: ['old'] } },
        },
      },
    },
    { id: 'sibling', type: 'text', data: { params: { prompt: 'old sibling' } } },
  ];
  const original = {
    documentKey: 'doc',
    ready: true,
    readonly: false,
    nodes,
    edges: [
      { id: 'one', source: 'first', target: 'target' },
      { id: 'two', source: 'second', target: 'target' },
    ],
    models,
  };
  const currentDocument = { current: original };
  const recordSnapshot = vi.fn(),
    setNodes = vi.fn(),
    setEdges = vi.fn(),
    notify = vi.fn(),
    consumed = vi.fn();
  let pending = { writable: true, value: '{{Image 1}} {{Image 2}}', basePrompt: '{{Image 1}}' };
  const accept = vi.fn((value) => {
    pending = { ...pending, value, basePrompt: value };
    return true;
  });
  const hook = renderHook(() => {
    const drafts = useCanvasDrafts();
    const actions = useCanvasGraphActions({
      documentKey: 'doc',
      currentDocument,
      recordSnapshot,
      setNodes,
      setEdges,
      notify,
      projectGraph: (graph, options) => {
        const projected = drafts.project({ ...graph, storageKey: 'doc' }, options);
        return project ? project(projected, options, currentDocument) : projected;
      },
      consumeDrafts: (graph, options) => {
        consumed(graph, options);
        drafts.consume({ ...graph, storageKey: 'doc' }, options);
      },
    });
    return { drafts, actions };
  });
  let reads = 0;
  const release = hook.result.current.drafts.register(
    'doc',
    'target',
    () => {
      reads += 1;
      if (failOnFourthRead && reads === 4) throw new Error('input rebuilding after CAS');
      return pending;
    },
    'default',
    accept,
  );
  if (retire) release();
  hook.result.current.drafts.register('doc', 'sibling', () => ({
    writable: true,
    value: 'last sibling',
    basePrompt: 'old sibling',
  }));
  return {
    ...hook,
    original,
    currentDocument,
    recordSnapshot,
    setNodes,
    setEdges,
    notify,
    consumed,
    accept,
    release,
    pending: () => pending,
    reads: () => reads,
    edit: (value) => {
      pending = { ...pending, value };
    },
  };
}

describe('destructive deletion owns graph, last inputs and post-CAS consumption', () => {
  it.each(['nodes', 'edges'])(
    'a temporary post-CAS reader failure in %s deletion still consumes the accepted plain prompt before save retry',
    (kind) => {
      const f = setup({ failOnFourthRead: true });
      act(() =>
        expect(
          kind === 'nodes'
            ? f.result.current.actions.deleteNodes(['second'])
            : f.result.current.actions.deleteEdges(['two']),
        ).toBe(true),
      );
      const next = f.currentDocument.current;
      const target = next.nodes.find((node) => node.id === 'target');
      expect(target.data.params.prompt).toBe('{{Image 1}}');
      expect(f.reads()).toBe(4);
      expect.soft(f.accept).toHaveBeenCalledExactlyOnceWith('{{Image 1}}');
      const retried = f.result.current.drafts.project({ ...next, storageKey: 'doc' });
      expect.soft(retried.nodes).toEqual(next.nodes);
      expect(f.recordSnapshot).toHaveBeenCalledOnce();
      expect(f.recordSnapshot.mock.lastCall[0].nodes[2].data.params.prompt).toBe(
        '{{Image 1}} {{Image 2}}',
      );
      expect(f.currentDocument.current).toBe(next);
    },
  );
  it.each([false, true])(
    'deletes an upstream node with an %s retired input, keeps last history and cannot reproject the deleted occurrence',
    (retire) => {
      const f = setup({ retire });
      act(() => expect(f.result.current.actions.deleteNodes(['second'])).toBe(true));
      const next = f.currentDocument.current;
      expect(next.nodes.map((n) => n.id)).toEqual(['first', 'target', 'sibling']);
      expect(next.edges).toEqual([f.original.edges[0]]);
      expect(next.nodes.find((n) => n.id === 'target').data.params.prompt).toBe('{{Image 1}}');
      expect(next.nodes.find((n) => n.id === 'sibling').data.params.prompt).toBe('last sibling');
      expect(f.recordSnapshot).toHaveBeenCalledOnce();
      const before = f.recordSnapshot.mock.lastCall[0];
      expect(before.nodes[2].data.params.prompt).toBe('{{Image 1}} {{Image 2}}');
      expect(before.nodes[2].data.params.magicList).toBeUndefined();
      expect(before.nodes[3].data.params.prompt).toBe('last sibling');
      expect(before.edges).toBe(f.original.edges);
      expect(f.consumed).toHaveBeenCalledExactlyOnceWith(next, {
        explicitPromptNodeIds: ['target'],
        removedNodeIds: ['second'],
      });
      expect(f.result.current.drafts.project({ ...next, storageKey: 'doc' }).nodes).toEqual(
        next.nodes,
      );
      expect(f.accept).toHaveBeenCalledTimes(retire ? 0 : 1);
      f.release();
      expect(f.result.current.drafts.project({ ...next, storageKey: 'doc' }).nodes).toEqual(
        next.nodes,
      );
    },
  );

  it('removes only a requested edge, consumes an active input at a baseline collision and still accepts later user editing', () => {
    const f = setup();
    act(() => expect(f.result.current.actions.deleteEdges(['two'])).toBe(true));
    const next = f.currentDocument.current;
    expect(next.nodes.map((n) => n.id)).toEqual(f.original.nodes.map((n) => n.id));
    expect(next.nodes.slice(0, 2)).toEqual(f.original.nodes.slice(0, 2));
    expect(next.edges).toEqual([f.original.edges[0]]);
    expect(f.pending().value).toBe('{{Image 1}}');
    expect(f.accept).toHaveBeenCalledExactlyOnceWith('{{Image 1}}');
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
    expect(f.recordSnapshot.mock.lastCall[0].nodes[2].data.params.prompt).toBe(
      '{{Image 1}} {{Image 2}}',
    );
    f.edit('next user input');
    expect(
      f.result.current.drafts.project({ ...next, storageKey: 'doc' }).nodes[2].data.params.prompt,
    ).toBe('next user input');
  });

  it.each([{ readonly: true }, { ready: false }, { documentKey: 'new' }])(
    'refuses current owner %j without accepting drafts, writes or history',
    (patch) => {
      const f = setup();
      f.currentDocument.current = { ...f.original, ...patch };
      act(() => {
        expect(f.result.current.actions.deleteNodes(['second'])).toBe(false);
        expect(f.result.current.actions.deleteEdges(['two'])).toBe(false);
      });
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setNodes).not.toHaveBeenCalled();
      expect(f.consumed).not.toHaveBeenCalled();
      expect(f.accept).not.toHaveBeenCalled();
      expect(f.pending().value).toBe('{{Image 1}} {{Image 2}}');
    },
  );

  it('retained methods reject after unmount', () => {
    const f = setup();
    const { deleteNodes, deleteEdges } = f.result.current.actions;
    f.unmount();
    expect(deleteNodes(['second'])).toBe(false);
    expect(deleteEdges(['two'])).toBe(false);
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.consumed).not.toHaveBeenCalled();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });

  it.each(['preflight', 'next'])(
    'an unreadable %s projection does not publish or consume input',
    (phase) => {
      const f = setup({
        project: (graph, options) => {
          if (phase === 'preflight' || options?.explicitPromptNodeIds)
            throw new Error('unreadable draft');
          return graph;
        },
      });
      act(() => expect(f.result.current.actions.deleteEdges(['two'])).toBe(false));
      expect(f.currentDocument.current).toBe(f.original);
      expect(f.pending().value).toBe('{{Image 1}} {{Image 2}}');
      expect(f.accept).not.toHaveBeenCalled();
      expect(f.consumed).not.toHaveBeenCalled();
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setEdges).not.toHaveBeenCalled();
    },
  );

  it.each(['preflight', 'next'])(
    'a competing %s graph mutation survives CAS, without draft acceptance or deletion history',
    (phase) => {
      let competing;
      const f = setup({
        project: (graph, options, current) => {
          if (
            (phase === 'preflight' && !options) ||
            (phase === 'next' && options?.explicitPromptNodeIds)
          )
            current.current = competing = {
              ...current.current,
              nodes: [...current.current.nodes, { id: 'concurrent', type: 'text', data: {} }],
            };
          return graph;
        },
      });
      act(() => expect(f.result.current.actions.deleteEdges(['two'])).toBe(false));
      expect(f.currentDocument.current).toBe(competing);
      expect(competing.edges).toBe(f.original.edges);
      expect(f.pending().value).toBe('{{Image 1}} {{Image 2}}');
      expect(f.consumed).not.toHaveBeenCalled();
      expect(f.recordSnapshot).not.toHaveBeenCalled();
    },
  );

  it('empty or stale deletion requests create no history and do not consume another node input', () => {
    const f = setup();
    act(() => {
      expect(f.result.current.actions.deleteNodes([])).toBe(false);
      expect(f.result.current.actions.deleteNodes(['unknown'])).toBe(false);
      expect(f.result.current.actions.deleteEdges([])).toBe(false);
      expect(f.result.current.actions.deleteEdges(['unknown'])).toBe(false);
    });
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.consumed).not.toHaveBeenCalled();
  });
});
