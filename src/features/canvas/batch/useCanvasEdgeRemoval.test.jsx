import { createRef } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasEdgeRemoval } from './useCanvasEdgeRemoval.js';

function graph() {
  return {
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    nodes: [
      {
        id: 'script',
        type: 'script',
        position: { x: 0, y: 0 },
        data: {
          type: 'script',
          name: 'source',
          linkedImageGroupId: 'group',
          linkedVideoGroupId: 'other-video',
          params: { prompt: 'old input' },
          rows: [
            { id: 'row', hiddenUuid: 'hidden', shotNumber: 10, plotDescription: 'old raw plot' },
          ],
        },
      },
      {
        id: 'group',
        type: 'group',
        position: { x: 1000, y: 400 },
        data: {
          type: 'group',
          sourceScriptNodeId: 'script',
          storyboardGroupType: 'image',
          storyboardTitle: 'old title',
        },
      },
      {
        id: 'child',
        type: 'image',
        parentId: 'group',
        position: { x: 20, y: 30 },
        data: { type: 'image', scriptRowHiddenUuid: 'hidden', url: ['/source.webp'] },
      },
      { id: 'unrelated', type: 'text', data: { type: 'text', content: ['keep unrelated'] } },
    ],
    edges: [{ id: 'edge', source: 'script', target: 'group' }],
  };
}

function fixture(extra = {}) {
  const document = createRef();
  document.current = graph();
  const unlinkEdge = vi.fn(() => true),
    deleteEdges = vi.fn(() => true),
    notify = vi.fn();
  let props = {
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    getDocument: () => document.current,
    unlinkEdge,
    deleteEdges,
    notify,
    ...extra,
  };
  const rendered = renderHook((value) => useCanvasEdgeRemoval(value), { initialProps: props });
  return {
    ...rendered,
    document,
    unlinkEdge,
    deleteEdges,
    notify,
    change(next) {
      props = { ...props, ...next };
      rendered.rerender(props);
    },
  };
}
function open(f) {
  act(() => expect(f.result.current.remove('edge')).toBe(false));
  const request = f.result.current.request;
  expect(request).toBeTruthy();
  return request;
}
function patchNode(f, id, update) {
  f.document.current = {
    ...f.document.current,
    nodes: f.document.current.nodes.map((node) => (node.id === id ? update(node) : node)),
  };
}
function noWriters(f) {
  expect(f.unlinkEdge).not.toHaveBeenCalled();
  expect(f.deleteEdges).not.toHaveBeenCalled();
}

describe('source edge confirmation owner and GraphActions boundary', () => {
  it('does zero writer work before confirmation and exposes exact source notice with an opaque frozen token', () => {
    const f = fixture(),
      request = open(f);
    expect(request).toEqual({
      title: '断开连线',
      message: '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
      confirmText: '确定断开',
      cancelText: '取消',
      closeOnBackdrop: false,
      showCloseButton: false,
    });
    expect(Object.isFrozen(request)).toBe(true);
    expect(request).not.toHaveProperty('edgeId');
    noWriters(f);
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.unlinkEdge).toHaveBeenCalledExactlyOnceWith('edge');
    expect(f.deleteEdges).not.toHaveBeenCalled();
    expect(f.result.current.request).toBeNull();
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.unlinkEdge).toHaveBeenCalledTimes(1);
  });

  it('cancels with no writer or history boundary call and cannot later confirm the token', () => {
    const f = fixture(),
      request = open(f);
    act(() => expect(f.result.current.cancel(request)).toBe(true));
    expect(f.result.current.request).toBeNull();
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    noWriters(f);
  });

  it.each(['ordinary', 'script-v2', 'editing'])(
    'delegates raw %s removal without a warning or dedicated unlink call',
    (kind) => {
      const f = fixture();
      if (kind === 'ordinary')
        patchNode(f, 'script', (node) => ({
          ...node,
          type: 'image',
          data: { ...node.data, type: 'image' },
        }));
      if (kind === 'script-v2')
        patchNode(f, 'script', (node) => ({
          ...node,
          type: 'script-v2',
          data: { ...node.data, type: 'script-v2' },
        }));
      if (kind === 'editing')
        patchNode(f, 'group', (node) => ({
          ...node,
          data: {
            ...node.data,
            params: {
              segmentRemakeLock: true,
              segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'script' },
            },
          },
        }));
      act(() => expect(f.result.current.remove('edge')).toBe(true));
      expect(f.result.current.request).toBeNull();
      expect(f.deleteEdges).toHaveBeenCalledExactlyOnceWith(['edge']);
      expect(f.unlinkEdge).not.toHaveBeenCalled();
    },
  );

  it('returns the raw writer acceptance without inventing a retry dialog for ordinary edges', () => {
    const f = fixture();
    patchNode(f, 'script', (node) => ({ ...node, data: { ...node.data, type: 'image' } }));
    f.deleteEdges.mockReturnValue(false);
    act(() => expect(f.result.current.remove('edge')).toBe(false));
    expect(f.result.current.request).toBeNull();
    expect(f.unlinkEdge).not.toHaveBeenCalled();
  });

  it('keeps the same token on synchronous false and retries once through the dedicated writer', () => {
    const f = fixture(),
      request = open(f);
    f.unlinkEdge.mockReturnValueOnce(false).mockReturnValueOnce(true);
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBe(request);
    expect(f.unlinkEdge).toHaveBeenCalledTimes(1);
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.unlinkEdge).toHaveBeenCalledTimes(2);
    expect(f.result.current.request).toBeNull();
    expect(f.deleteEdges).not.toHaveBeenCalled();
  });

  it('retains its local retryable dialog on a thrown writer and reports the actual adapter failure', () => {
    const f = fixture(),
      request = open(f);
    f.unlinkEdge.mockImplementationOnce(() => {
      throw new Error('CAS failed');
    });
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBe(request);
    expect(f.notify).toHaveBeenCalledWith('当前连线无法断开，请重试');
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.unlinkEdge).toHaveBeenCalledTimes(2);
    expect(f.result.current.request).toBeNull();
  });

  it('old explicit tokens and captured no-argument confirm/cancel callbacks cannot affect a new request', () => {
    const f = fixture(),
      first = open(f),
      oldConfirm = f.result.current.confirm,
      oldCancel = f.result.current.cancel;
    const second = open(f);
    expect(second).not.toBe(first);
    act(() => {
      expect(oldConfirm()).toBe(false);
      expect(oldCancel()).toBe(false);
      expect(f.result.current.confirm(first)).toBe(false);
      expect(f.result.current.cancel(first)).toBe(false);
    });
    expect(f.result.current.request).toBe(second);
    noWriters(f);
    act(() => expect(f.result.current.confirm()).toBe(true));
    expect(f.unlinkEdge).toHaveBeenCalledOnce();
  });

  it('A to B to A retires an old request even if the new document uses the same endpoint and edge IDs', () => {
    const f = fixture(),
      first = open(f),
      oldConfirm = f.result.current.confirm,
      oldCancel = f.result.current.cancel;
    f.document.current = { ...graph(), documentKey: 'doc-b' };
    f.change({ documentKey: 'doc-b' });
    expect(f.result.current.request).toBeNull();
    f.document.current = graph();
    f.change({ documentKey: 'doc-a' });
    const second = open(f);
    act(() => {
      expect(oldConfirm(first)).toBe(false);
      expect(oldCancel(first)).toBe(false);
    });
    expect(f.result.current.request).toBe(second);
    noWriters(f);
  });

  it.each([{ ready: false }, { readonly: true }])(
    'retires requests on owner capability change and does not revive them on recovery (%j)',
    (changes) => {
      const f = fixture(),
        request = open(f),
        oldConfirm = f.result.current.confirm;
      f.change(changes);
      expect(f.result.current.request).toBeNull();
      act(() => expect(oldConfirm(request)).toBe(false));
      f.change({ ready: true, readonly: false });
      act(() => expect(f.result.current.confirm(request)).toBe(false));
      noWriters(f);
    },
  );

  it.each([{ documentKey: 'doc-b' }, { ready: false }, { readonly: true }])(
    'checks the fresh document owner before props catch up (%j)',
    (patch) => {
      const f = fixture(),
        request = open(f);
      f.document.current = { ...f.document.current, ...patch };
      act(() => expect(f.result.current.confirm(request)).toBe(false));
      noWriters(f);
    },
  );

  it('rejects old callbacks after unmount', () => {
    const f = fixture(),
      request = open(f),
      confirm = f.result.current.confirm,
      cancel = f.result.current.cancel;
    f.unmount();
    expect(confirm(request)).toBe(false);
    expect(cancel(request)).toBe(false);
    noWriters(f);
  });

  it.each([
    'source-link',
    'group-source',
    'group-kind',
    'child-binding',
    'edge-clone',
    'edge-replaced',
    'missing-endpoint',
  ])('rejects a changed %s identity and closes only that request without writing', (kind) => {
    const f = fixture(),
      request = open(f);
    if (kind === 'source-link')
      patchNode(f, 'script', (node) => ({
        ...node,
        data: { ...node.data, linkedImageGroupId: 'another-group' },
      }));
    if (kind === 'group-source')
      patchNode(f, 'group', (node) => ({
        ...node,
        data: { ...node.data, sourceScriptNodeId: 'another-script' },
      }));
    if (kind === 'group-kind')
      patchNode(f, 'group', (node) => ({
        ...node,
        data: { ...node.data, storyboardGroupType: 'video' },
      }));
    if (kind === 'child-binding')
      patchNode(f, 'child', (node) => ({
        ...node,
        data: { ...node.data, scriptRowHiddenUuid: 'new-row-binding' },
      }));
    if (kind === 'edge-clone')
      f.document.current = {
        ...f.document.current,
        edges: f.document.current.edges.map((edge) => ({ ...edge })),
      };
    if (kind === 'edge-replaced')
      f.document.current = {
        ...f.document.current,
        edges: [{ id: 'edge', source: 'unrelated', target: 'group' }],
      };
    if (kind === 'missing-endpoint')
      f.document.current = {
        ...f.document.current,
        nodes: f.document.current.nodes.filter((node) => node.id !== 'script'),
      };
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBeNull();
    expect(f.notify).toHaveBeenCalledWith('待断开的连线或分镜关联已变化，请重新选择');
    noWriters(f);
  });

  it('does not confirm the old unlink request after an editing continuation becomes the higher-priority operation', () => {
    const f = fixture(),
      request = open(f);
    patchNode(f, 'group', (node) => ({
      ...node,
      data: {
        ...node.data,
        params: {
          segmentRemakeLock: true,
          segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'script' },
        },
      },
    }));
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBeNull();
    noWriters(f);
    act(() => expect(f.result.current.remove('edge')).toBe(true));
    expect(f.deleteEdges).toHaveBeenCalledExactlyOnceWith(['edge']);
    expect(f.unlinkEdge).not.toHaveBeenCalled();
  });

  it('accepts latest prompt, raw rows and position changes plus unrelated edits, and the writer reads that fresh currentDocument', () => {
    const f = fixture(),
      request = open(f);
    patchNode(f, 'script', (node) => ({
      ...node,
      position: { x: 300, y: 450 },
      data: {
        ...node.data,
        params: { ...node.data.params, prompt: 'latest input' },
        rows: [
          {
            ...node.data.rows[0],
            plotDescription: 'latest raw row',
            videoMotionPrompt: 'latest motion',
            shotNumber: 30,
          },
        ],
      },
    }));
    patchNode(f, 'group', (node) => ({
      ...node,
      position: { x: 1800, y: 1200 },
      data: { ...node.data, storyboardTitle: 'new display title' },
    }));
    patchNode(f, 'unrelated', (node) => ({
      ...node,
      data: { ...node.data, content: ['latest unrelated content'] },
    }));
    const fresh = f.document.current;
    f.unlinkEdge.mockImplementation(() => {
      expect(f.document.current).toBe(fresh);
      expect(f.document.current.nodes[0].data.params.prompt).toBe('latest input');
      expect(f.document.current.nodes[0].data.rows).toEqual([
        {
          id: 'row',
          hiddenUuid: 'hidden',
          shotNumber: 30,
          plotDescription: 'latest raw row',
          videoMotionPrompt: 'latest motion',
        },
      ]);
      expect(f.document.current.nodes[0].position).toEqual({ x: 300, y: 450 });
      expect(f.document.current.nodes[3].data.content).toEqual(['latest unrelated content']);
      return true;
    });
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.unlinkEdge).toHaveBeenCalledExactlyOnceWith('edge');
    expect(f.deleteEdges).not.toHaveBeenCalled();
  });

  it('uses the latest writer after rerender instead of a captured stale service callback', () => {
    const f = fixture(),
      request = open(f),
      nextWriter = vi.fn(() => true);
    f.change({ unlinkEdge: nextWriter });
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(nextWriter).toHaveBeenCalledExactlyOnceWith('edge');
    expect(f.unlinkEdge).not.toHaveBeenCalled();
  });

  it('an old accepted writer cannot close a synchronously opened new request', () => {
    const f = fixture(),
      first = open(f);
    f.unlinkEdge.mockImplementation(() => {
      f.result.current.remove('edge');
      return true;
    });
    act(() => expect(f.result.current.confirm(first)).toBe(true));
    expect(f.result.current.request).not.toBe(first);
    expect(f.result.current.request?.title).toBe('断开连线');
  });

  it('ignores missing edge IDs and unavailable fresh graph reads without writing or showing a fake dialog', () => {
    const f = fixture();
    act(() => expect(f.result.current.remove('missing')).toBe(false));
    f.change({
      getDocument: () => {
        throw new Error('unavailable');
      },
    });
    act(() => expect(f.result.current.remove('edge')).toBe(false));
    expect(f.result.current.request).toBeNull();
    noWriters(f);
  });
});
