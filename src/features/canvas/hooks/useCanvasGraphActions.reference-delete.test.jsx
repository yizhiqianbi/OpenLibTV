import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

function fixture(project) {
  const nodes = ['first', 'second'].map((id) => ({
    id,
    type: 'image',
    data: { type: 'image', url: [`/${id}`] },
  }));
  nodes.push({
    id: 'target',
    type: 'video',
    data: {
      type: 'video',
      params: {
        model: 'star-video2',
        modeType: 'image2video',
        prompt: '{{Image 1}}',
        magicList: { unused: { suggestions: ['retained on refusal'] } },
      },
    },
  });
  nodes.push({ id: 'sibling', type: 'text', data: { params: { prompt: 'old sibling' } } });
  const original = {
    documentKey: 'doc',
    readonly: false,
    ready: true,
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
    notify = vi.fn();
  const pending = { writable: true, value: '{{Image 1}} {{Image 2}}', basePrompt: '{{Image 1}}' };
  const projection = vi.fn();
  const hook = renderHook(() => {
    const drafts = useCanvasDrafts();
    const actions = useCanvasGraphActions({
      documentKey: 'doc',
      currentDocument,
      recordSnapshot,
      setNodes,
      setEdges,
      notify,
      projectGraph: (snapshot, options) => {
        projection(snapshot, options);
        const next = drafts.project({ ...snapshot, storageKey: 'doc' }, options);
        return project ? project(next, options, currentDocument) : next;
      },
    });
    return { drafts, actions };
  });
  hook.result.current.drafts.register('doc', 'target', () => pending);
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
    pending,
    projection,
    remove: (id = 'second') =>
      hook.result.current.actions.deleteReference('target', id, pending.value),
  };
}

describe('reference deletion owns an explicit prompt transaction', () => {
  it('publishes the baseline-colliding cleaned value, preserving sibling drafts and the latest history prompt in one CAS', () => {
    const f = fixture();
    act(() => expect(f.remove()).toBe(true));
    const next = f.currentDocument.current;
    expect(next.nodes[2].data.params.prompt).toBe('{{Image 1}}');
    expect(next.nodes[2].data.params.magicList).toBeUndefined();
    expect(next.nodes[3].data.params.prompt).toBe('last sibling');
    expect(next.edges).toEqual([f.original.edges[0]]);
    expect(next.nodes.slice(0, 2)).toEqual(f.original.nodes.slice(0, 2));
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
    const previous = f.recordSnapshot.mock.lastCall[0];
    expect(previous.nodes[2].data.params.prompt).toBe(f.pending.value);
    expect(previous.nodes[2].data.params.magicList).toBeUndefined();
    expect(previous.nodes[3].data.params.prompt).toBe('last sibling');
    expect(previous.edges).toBe(f.original.edges);
    expect(f.projection).toHaveBeenCalledTimes(3);
    expect(f.projection.mock.calls[0][1]).toBeUndefined();
    expect(f.projection.mock.calls[1][1]).toEqual({ explicitPromptNodeIds: ['target'] });
    expect(f.projection.mock.calls[2][1]).toBeUndefined();
    expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(next.nodes);
    expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(next.edges);
    expect(f.pending.value).toBe('{{Image 1}} {{Image 2}}');
  });

  it.each([{ readonly: true }, { ready: false }, { documentKey: 'new' }])(
    'refuses owner %j without consuming a draft, pruning metadata or creating history',
    (patch) => {
      const f = fixture();
      const current = { ...f.original, ...patch };
      f.currentDocument.current = current;
      act(() => expect(f.remove()).toBe(false));
      expect(f.currentDocument.current).toBe(current);
      expect(f.pending.value).toBe('{{Image 1}} {{Image 2}}');
      expect(f.original.nodes[2].data.params.magicList).toHaveProperty('unused');
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setNodes).not.toHaveBeenCalled();
      expect(f.projection).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'asset://stored'])(
    'unknown or edge-free %s does not turn prompt cleanup into an accepted operation',
    (sourceId) => {
      const f = fixture();
      act(() => expect(f.remove(sourceId)).toBe(false));
      expect(f.currentDocument.current).toBe(f.original);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.projection).not.toHaveBeenCalled();
    },
  );

  it('retires captured callbacks after unmount with zero writes or history', () => {
    const f = fixture();
    const remove = f.result.current.actions.deleteReference;
    f.unmount();
    expect(remove('target', 'second', f.pending.value)).toBe(false);
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
  });

  it('projection failure preserves graph, unconsumed input and metadata for retry', () => {
    const f = fixture(() => {
      throw new Error('other draft is unreadable');
    });
    act(() => expect(f.remove()).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.pending.value).toBe('{{Image 1}} {{Image 2}}');
    expect(f.original.nodes[2].data.params.magicList).toHaveProperty('unused');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setEdges).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法删除，请重试');
  });

  it('CAS refuses a competing graph change during projection and leaves both edges and pending input intact', () => {
    let competing;
    const f = fixture((next, options, current) => {
      if (options?.explicitPromptNodeIds)
        current.current = competing = {
          ...current.current,
          nodes: [...current.current.nodes, { id: 'concurrent', type: 'text', data: {} }],
        };
      return next;
    });
    act(() => expect(f.remove()).toBe(false));
    expect(f.currentDocument.current).toBe(competing);
    expect(competing.edges).toBe(f.original.edges);
    expect(f.pending.value).toBe('{{Image 1}} {{Image 2}}');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
  });
});
