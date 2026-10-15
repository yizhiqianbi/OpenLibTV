import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

const metadata = {
  keep: { imageUrl: '/keep.png', suggestions: [{ label: '已知元数据' }] },
  removed: { imageUrl: '/removed.png', suggestions: [{ label: '已删除元素' }] },
};

function fixture({ type = 'video', raw = '{{Image 1}}', draft = '{{Image 2}}', project } = {}) {
  const sources = ['first', 'second'].map((id) => ({
    id,
    type: 'image',
    data: { type: 'image', action: 'image_resource', url: [`/${id}.png`] },
  }));
  const target = {
    id: 'target',
    type,
    data: {
      type,
      action: `${type}_generate`,
      params: {
        model: type === 'image' ? 'flux-2-pro' : 'star-video2',
        modeType: type === 'image' ? 'image2image' : 'image2video',
        prompt: raw,
        imageListOrder: ['first', 'second'],
        magicList: metadata,
        settings: { ratio: '16:9' },
        advancedSettings: { preserveUnknown: 7 },
        focusRegion: { nodeId: 'unrelated-focus' },
      },
    },
  };
  const sibling = { id: 'sibling', type: 'image', data: { params: { prompt: 'old sibling' } } };
  const graph = {
    documentKey: 'doc',
    ready: true,
    readonly: false,
    nodes: [...sources, target, sibling],
    edges: sources.map((source, index) => ({
      id: `edge-${index}`,
      source: source.id,
      target: 'target',
    })),
    models,
  };
  const currentDocument = { current: graph };
  const pending = { writable: true, basePrompt: raw, value: draft };
  const recordSnapshot = vi.fn();
  const setNodes = vi.fn();
  const setEdges = vi.fn();
  const notify = vi.fn();
  const projection = vi.fn();
  const page = renderHook(() => {
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
        const projected = drafts.project({ ...snapshot, storageKey: 'doc' }, options);
        return project ? project(projected, options, currentDocument) : projected;
      },
    });
    return { actions, drafts };
  });
  page.result.current.drafts.register('doc', 'target', () => pending);
  page.result.current.drafts.register('doc', 'sibling', () => ({
    writable: true,
    basePrompt: 'old sibling',
    value: 'last sibling input',
  }));
  const reorder = (order = ['second', 'first']) =>
    page.result.current.actions.reorderReference('target', 'imageList', order, pending.value);
  return {
    ...page,
    graph,
    pending,
    currentDocument,
    recordSnapshot,
    setNodes,
    setEdges,
    notify,
    projection,
    reorder,
    target: () => currentDocument.current.nodes.find((node) => node.id === 'target'),
  };
}

describe('ordinary reference reorder as an explicit prompt graph transaction', () => {
  it.each(['image', 'video'])(
    '%s preserves its source literal/remapped prompt, prunes Magic, and projects the sibling draft into next and history',
    (type) => {
      const f = fixture({ type });
      act(() => expect(f.reorder()).toBe(true));
      expect(f.target().data.params).toEqual({
        ...f.graph.nodes[2].data.params,
        prompt: type === 'image' ? '{{Image 2}}' : '{{Image 1}}',
        imageListOrder: ['second', 'first'],
        ...(type === 'video'
          ? {
              videoListOrder: [],
              audioListOrder: [],
              mixedListOrder: ['second', 'first'],
            }
          : {}),
        magicList: undefined,
      });
      expect(f.currentDocument.current.edges).toBe(f.graph.edges);
      expect(f.currentDocument.current.nodes.slice(0, 2)).toEqual(f.graph.nodes.slice(0, 2));
      expect(f.currentDocument.current.nodes[3].data.params.prompt).toBe('last sibling input');
      expect(f.recordSnapshot).toHaveBeenCalledOnce();
      const history = f.recordSnapshot.mock.lastCall[0];
      expect(history.edges).toBe(f.graph.edges);
      expect(history.nodes[2].data.params).toEqual({
        ...f.graph.nodes[2].data.params,
        prompt: '{{Image 2}}',
        magicList: undefined,
      });
      expect(history.nodes[3].data.params.prompt).toBe('last sibling input');
      expect(f.projection.mock.calls[0][1]).toEqual({ explicitPromptNodeIds: ['target'] });
      expect(f.projection.mock.calls[1][1]).toBeUndefined();
      expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(f.currentDocument.current.nodes);
      expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(f.graph.edges);
      expect(f.pending.value).toBe('{{Image 2}}');
      expect(f.graph.nodes[2].data.params.magicList).toBe(metadata);
    },
  );

  it('retains only actual lower-case Magic IDs in next and history without rewriting unknown token text or unrelated params', () => {
    const latest = '{{Image 2}} {{magic:keep:0}} {{magic:unknown:0}} {{Magic:removed:0}}';
    const f = fixture({ raw: '{{Image 1}} {{magic:removed:0}}', draft: latest });
    act(() => expect(f.reorder()).toBe(true));
    expect(f.target().data.params.prompt).toBe(latest.replace('{{Image 2}}', '{{Image 1}}'));
    expect(f.target().data.params.magicList).toEqual({ keep: metadata.keep });
    expect(f.target().data.params.magicList.keep).toBe(metadata.keep);
    const history = f.recordSnapshot.mock.lastCall[0].nodes[2].data.params;
    expect(history.prompt).toBe(latest);
    expect(history.magicList).toEqual({ keep: metadata.keep });
    expect(history.settings).toBe(f.graph.nodes[2].data.params.settings);
    expect(history.advancedSettings).toBe(f.graph.nodes[2].data.params.advancedSettings);
    expect(history.focusRegion).toBe(f.graph.nodes[2].data.params.focusRegion);
  });

  it.each([
    ['unchanged', ['first', 'second']],
    ['partial', ['second']],
    ['duplicate', ['first', 'first']],
    ['unknown', ['second', 'missing']],
  ])(
    'rejects an %s order without pruning the raw graph, consuming a draft or recording history',
    (_, order) => {
      const f = fixture();
      act(() => expect(f.reorder(order)).toBe(false));
      expect(f.currentDocument.current).toBe(f.graph);
      expect(f.pending).toEqual({
        writable: true,
        basePrompt: '{{Image 1}}',
        value: '{{Image 2}}',
      });
      expect(
        f.result.current.drafts.project({ ...f.graph, storageKey: 'doc' }).nodes[2].data.params
          .prompt,
      ).toBe('{{Image 2}}');
      expect(f.graph.nodes[2].data.params.magicList).toBe(metadata);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setNodes).not.toHaveBeenCalled();
      expect(f.setEdges).not.toHaveBeenCalled();
      expect(f.projection).not.toHaveBeenCalled();
    },
  );

  it.each([{ readonly: true }, { ready: false }, { documentKey: 'next' }])(
    'rejects current owner gates %j without a graph/history write or draft consumption',
    (patch) => {
      const f = fixture();
      const current = { ...f.graph, ...patch };
      f.currentDocument.current = current;
      act(() => expect(f.reorder()).toBe(false));
      expect(f.currentDocument.current).toBe(current);
      expect(f.pending.value).toBe('{{Image 2}}');
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.setNodes).not.toHaveBeenCalled();
      expect(f.setEdges).not.toHaveBeenCalled();
      expect(f.projection).not.toHaveBeenCalled();
    },
  );

  it('rejects a projection failure, keeping the original graph, Magic metadata and pending input', () => {
    const f = fixture({
      project: () => {
        throw new Error('unreadable other draft');
      },
    });
    act(() => expect(f.reorder()).toBe(false));
    expect(f.currentDocument.current).toBe(f.graph);
    expect(f.graph.nodes[2].data.params.magicList).toBe(metadata);
    expect(f.pending.value).toBe('{{Image 2}}');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
    expect(f.setEdges).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法保存，请重试');
  });

  it('rejects CAS when a competing graph edit occurs during projection, preserving that edit and the pending input with zero history', () => {
    let competing;
    const f = fixture({
      project: (projected, options, current) => {
        if (options?.explicitPromptNodeIds) {
          competing = {
            ...current.current,
            nodes: [
              ...current.current.nodes,
              { id: 'new-source', type: 'text', data: { content: ['new'] } },
            ],
          };
          current.current = competing;
        }
        return projected;
      },
    });
    act(() => expect(f.reorder()).toBe(false));
    expect(f.currentDocument.current).toBe(competing);
    expect(f.currentDocument.current.nodes.at(-1).id).toBe('new-source');
    expect(f.pending.value).toBe('{{Image 2}}');
    expect(f.target().data.params.imageListOrder).toEqual(['first', 'second']);
    expect(f.target().data.params.magicList).toBe(metadata);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
    expect(f.setEdges).not.toHaveBeenCalled();
  });

  it('rejects an unmounted callback without consuming the registered draft or writing graph/history', () => {
    const f = fixture();
    const reorder = f.result.current.actions.reorderReference;
    f.unmount();
    expect(reorder('target', 'imageList', ['second', 'first'], f.pending.value)).toBe(false);
    expect(f.currentDocument.current).toBe(f.graph);
    expect(f.pending.value).toBe('{{Image 2}}');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.setNodes).not.toHaveBeenCalled();
    expect(f.setEdges).not.toHaveBeenCalled();
  });
});
