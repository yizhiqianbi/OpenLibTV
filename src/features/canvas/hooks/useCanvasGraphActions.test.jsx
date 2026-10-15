import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

function fixture() {
  const image = (id) => ({
    id,
    type: 'image',
    data: {
      type: 'image',
      action: 'image_generate',
      url: [`/${id}.png`],
      params: { model: models.default.image, prompt: '' },
    },
  });
  const ref = {
    current: {
      documentKey: 'doc',
      ready: true,
      readonly: false,
      nodes: [image('source'), image('target')],
      edges: [],
      models,
    },
  };
  const recordSnapshot = vi.fn(),
    setNodes = vi.fn(),
    setEdges = vi.fn();
  const page = renderHook(() =>
    useCanvasGraphActions({
      documentKey: 'doc',
      currentDocument: ref,
      recordSnapshot,
      setNodes,
      setEdges,
    }),
  );
  return { ref, recordSnapshot, setNodes, setEdges, ...page };
}
describe('mounted graph actions and current document ownership', () => {
  it('commits script asset binding and last unbinding atomically while preserving shared images', () => {
    const f = fixture();
    const script = {
      id: 'script',
      type: 'script-v2',
      data: {
        type: 'script-v2',
        rows: [],
        assets: {
          characters: [
            { id: 'a', role: 'character', name: '主角' },
            { id: 'b', role: 'character', name: '配角' },
          ],
          scenes: [],
          props: [],
        },
      },
    };
    f.ref.current = { ...f.ref.current, nodes: [...f.ref.current.nodes, script] };
    const mutate = (command) =>
      f.result.current.mutateScriptAsset('script', command, {
        documentKey: 'doc',
        expectedNode: f.ref.current.nodes.find((node) => node.id === 'script'),
      });
    act(() => expect(mutate({ type: 'replace', assetId: 'a', nodeId: 'source' }).ok).toBe(true));
    expect(f.ref.current.edges).toHaveLength(1);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
    expect(f.recordSnapshot.mock.lastCall[0].nodes.at(-1)).toBe(script);
    act(() => expect(mutate({ type: 'replace', assetId: 'b', nodeId: 'source' }).ok).toBe(true));
    expect(f.ref.current.edges).toHaveLength(1);
    act(() => expect(mutate({ type: 'clear', assetId: 'a' }).ok).toBe(true));
    expect(f.ref.current.edges).toHaveLength(1);
    act(() => expect(mutate({ type: 'delete', assetId: 'b', policy: 'keep_text' }).ok).toBe(true));
    expect(f.ref.current.edges).toEqual([]);
    expect(f.ref.current.nodes).toHaveLength(3);
    expect(f.ref.current.nodes[0].data.url).toEqual(['/source.png']);
    expect(f.recordSnapshot).toHaveBeenCalledTimes(4);
  });
  it('refuses stale script asset edits and callbacks after document changes or unmount', () => {
    const f = fixture();
    const script = {
      id: 'script',
      type: 'script-v2',
      data: {
        type: 'script-v2',
        assets: {
          characters: [
            { id: 'a', role: 'character', name: '最新名字', description: '', updatedAt: 9 },
          ],
        },
      },
    };
    f.ref.current = { ...f.ref.current, nodes: [script] };
    const command = { type: 'rename', assetId: 'a', name: '旧编辑器名字', syncRows: true };
    const context = { documentKey: 'doc', expectedNode: script };
    expect(
      f.result.current.mutateScriptAsset('script', command, {
        ...context,
        expectedNode: { ...script },
      }),
    ).toBeNull();
    expect(
      f.result.current.mutateScriptAsset('script', command, {
        ...context,
        expectedAssetFingerprint: 'stale',
      }),
    ).toMatchObject({ ok: false });
    const abort = new AbortController();
    abort.abort();
    expect(
      f.result.current.mutateScriptAsset('script', command, { ...context, signal: abort.signal }),
    ).toBeNull();
    f.ref.current = { ...f.ref.current, documentKey: 'new' };
    expect(f.result.current.mutateScriptAsset('script', command, context)).toBeNull();
    const mutate = f.result.current.mutateScriptAsset;
    f.unmount();
    f.ref.current = { ...f.ref.current, documentKey: 'doc' };
    expect(mutate('script', command, context)).toBeNull();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });
  it('imports a batch by URL reuse in one graph/history commit and keeps failed media out of the graph', () => {
    const f = fixture();
    const items = [
      { id: 'existing', name: '已有图', mediaType: 'image', url: '/source.png' },
      { id: 'new', name: '新图', mediaType: 'image', url: '/new.png' },
      { id: 'same', name: '同址另一资产', mediaType: 'image', url: '/new.png' },
      { id: 'text', name: '文本不作媒体引用', mediaType: 'text', content: '正文' },
    ];
    let result;
    act(() => {
      result = f.result.current.importAssetReferences('target', items, {
        promptOverride: 'pending@',
        expectedPrompts: ['', 'pending@'],
        sessionKey: 'doc:target',
      });
    });
    expect(result).toMatchObject({ success: 3, failed: 1, changed: true });
    expect(result.nodeIds[0]).toBe('source');
    expect(result.nodeIds[1]).toBe(result.nodeIds[2]);
    expect(f.ref.current.nodes).toHaveLength(3);
    expect(f.ref.current.edges).toHaveLength(2);
    expect(f.ref.current.nodes[1].data.params.prompt).toBe('pending@');
    expect(f.recordSnapshot).toHaveBeenCalledTimes(1);
    expect(f.recordSnapshot.mock.lastCall[0].edges).toEqual([]);
    expect(f.recordSnapshot.mock.lastCall[0].nodes).toHaveLength(2);
    expect(f.recordSnapshot.mock.lastCall[0].nodes[1].data.params.prompt).toBe('pending@');
  });
  it('reuses an already connected asset without creating another graph undo item', () => {
    const f = fixture();
    act(() => expect(f.result.current.connectMention('source', 'target')).toBe(true));
    f.recordSnapshot.mockClear();
    const graph = f.ref.current;
    const result = f.result.current.importAssetReferences('target', [
      { id: 'asset', name: '原图', mediaType: 'image', url: '/source.png' },
    ]);
    expect(result).toMatchObject({ nodeIds: ['source'], success: 1, failed: 0, changed: false });
    expect(f.ref.current).toBe(graph);
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });
  it('rejects a stale picker document, prompt, aborted request and callbacks after unmount', () => {
    const item = { id: 'asset', name: '新图', mediaType: 'image', url: '/new.png' };
    for (const patch of [{ readonly: true }, { ready: false }, { documentKey: 'next' }]) {
      const f = fixture();
      f.ref.current = { ...f.ref.current, ...patch };
      expect(f.result.current.importAssetReferences('target', [item])).toBeNull();
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      f.unmount();
    }
    const f = fixture();
    expect(
      f.result.current.importAssetReferences('target', [item], { expectedPrompts: ['obsolete'] }),
    ).toBeNull();
    const task = new AbortController();
    task.abort();
    expect(
      f.result.current.importAssetReferences('target', [item], { signal: task.signal }),
    ).toBeNull();
    expect(
      f.result.current.importAssetReferences('target', [item], { sessionKey: 'old:target' }),
    ).toBeNull();
    const action = f.result.current.importAssetReferences;
    f.unmount();
    expect(action('target', [item])).toBeNull();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
  });
  it('publishes a synchronous current graph with the pending prompt and records that prompt before the new edge', () => {
    const f = fixture();
    act(() =>
      expect(
        f.result.current.connectMention('source', 'target', { promptOverride: 'pending@' }),
      ).toBe(true),
    );
    expect(f.ref.current.edges).toHaveLength(1);
    expect(f.ref.current.nodes[1].data.params.prompt).toBe('pending@');
    expect(f.recordSnapshot).toHaveBeenCalledExactlyOnceWith({
      nodes: f.ref.current.nodes,
      edges: [],
    });
    expect(f.setNodes).toHaveBeenCalledWith(f.ref.current.nodes);
    act(() =>
      expect(f.result.current.deleteReference('target', 'source', 'pending {{Image 1}}')).toBe(
        true,
      ),
    );
    expect(f.ref.current.edges).toEqual([]);
    expect(f.ref.current.nodes).toHaveLength(2);
    expect(f.recordSnapshot.mock.lastCall[0].nodes[1].data.params.prompt).toBe(
      'pending {{Image 1}}',
    );
  });
  it('refuses ready/readonly/document switches and old callbacks after unmount', () => {
    for (const patch of [{ readonly: true }, { ready: false }, { documentKey: 'next' }]) {
      const f = fixture();
      f.ref.current = { ...f.ref.current, ...patch };
      expect(f.result.current.connectMention('source', 'target')).toBe(false);
      expect(f.result.current.deleteReference('target', 'source', 'old')).toBe(false);
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      f.unmount();
    }
    const f = fixture(),
      action = f.result.current.connectMention;
    f.unmount();
    expect(action('source', 'target')).toBe(false);
  });
  it('atomically appends a script plan and refuses duplicate IDs, missing edges or a stale source', () => {
    const f = fixture(),
      source = f.ref.current.nodes[0];
    const plan = {
      ok: true,
      sourceScriptNodeId: source.id,
      addedNodes: [{ id: 'g', type: 'group', data: {} }],
      addedEdges: [{ id: 'e', source: source.id, target: 'g' }],
      nodePatches: [{ nodeId: source.id, data: { linkedImageGroupId: 'g' } }],
    };
    const context = { documentKey: 'doc', nodeId: source.id, expectedNode: source };
    expect(
      f.result.current.applyStoryboardPlan({ ...plan, addedNodes: [{ id: 'target' }] }, context),
    ).toBe(false);
    expect(
      f.result.current.applyStoryboardPlan(
        { ...plan, addedEdges: [{ id: 'e', source: 'missing', target: 'g' }] },
        context,
      ),
    ).toBe(false);
    expect(
      f.result.current.applyStoryboardPlan(plan, { ...context, expectedNode: { ...source } }),
    ).toBe(false);
    act(() => expect(f.result.current.applyStoryboardPlan(plan, context)).toBe(true));
    expect(f.ref.current.nodes[0].data.linkedImageGroupId).toBe('g');
    expect(f.ref.current.nodes[2].id).toBe('g');
    expect(f.ref.current.edges).toEqual(plan.addedEdges);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
  });
});
