import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasDeleteConfirmation } from './useCanvasDeleteConfirmation.js';

const script = (id = 'script') => ({
  id,
  type: 'script',
  data: { name: id, params: { prompt: 'original' } },
});
function fixture(extra = {}) {
  let graph = {
    documentKey: 'a',
    ready: true,
    readonly: false,
    nodes: [script(), { id: 'image', type: 'image', data: {} }],
    edges: [],
  };
  const deleteNodes = vi.fn(() => true),
    notify = vi.fn();
  let props = {
    documentKey: 'a',
    ready: true,
    readonly: false,
    getDocument: () => graph,
    deleteNodes,
    selectedIds: ['script'],
    zoom: 0.8,
    isMac: true,
    notify,
    ...extra,
  };
  const rendered = renderHook((value) => useCanvasDeleteConfirmation(value), {
    initialProps: props,
  });
  return {
    ...rendered,
    deleteNodes,
    notify,
    get graph() {
      return graph;
    },
    set graph(next) {
      graph = next;
    },
    change(next) {
      props = { ...props, ...next };
      rendered.rerender(props);
    },
    get props() {
      return props;
    },
  };
}
const open = (f, ids, options) => {
  act(() => expect(f.result.current.remove(ids, options)).toBe(false));
  return f.result.current.request;
};

describe('delete confirmation ownership and commit boundary', () => {
  it('does not write/history before confirmation and confirms exactly the requested IDs once', () => {
    const f = fixture();
    const request = open(f);
    expect(request.title).toBe('确认删除');
    expect(Object.isFrozen(request)).toBe(true);
    expect(f.deleteNodes).not.toHaveBeenCalled();
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledExactlyOnceWith(['script'], {
      zoom: 0.8,
      reconcileGroupConsumers: true,
    });
    expect(f.result.current.request).toBeNull();
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.deleteNodes).toHaveBeenCalledTimes(1);
  });
  it('cancels with zero mutations', () => {
    const f = fixture(),
      request = open(f);
    act(() => expect(f.result.current.cancel(request)).toBe(true));
    expect(f.result.current.request).toBeNull();
    expect(f.deleteNodes).not.toHaveBeenCalled();
    act(() => expect(f.result.current.confirm(request)).toBe(false));
  });
  it('directly deletes ordinary keyboard nodes through the same fresh GraphActions API', () => {
    const f = fixture({ selectedIds: ['image'] });
    act(() => expect(f.result.current.remove()).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledExactlyOnceWith(['image'], {
      zoom: 0.8,
      reconcileGroupConsumers: true,
    });
    expect(f.result.current.request).toBeNull();
  });
  it('uses latest selected IDs and zoom instead of stale callback props', () => {
    const f = fixture(),
      oldRemove = f.result.current.remove;
    f.change({ selectedIds: ['image'], zoom: 0.5 });
    act(() => expect(oldRemove()).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledExactlyOnceWith(['image'], {
      zoom: 0.5,
      reconcileGroupConsumers: true,
    });
  });
  it('filters missing IDs and deduplicates source IDs without broadening selection', () => {
    const f = fixture();
    const request = open(f, ['script', 'script', 'missing']);
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledWith(['script'], expect.anything());
  });
  it('preserves the requested source ID order for the downstream deletion planner', () => {
    const f = fixture(),
      request = open(f, ['image', 'script', 'image']);
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledExactlyOnceWith(['image', 'script'], {
      zoom: 0.8,
      reconcileGroupConsumers: true,
    });
  });
  it('lets GraphActions read the latest prompt commit and preserves fresh zoom on confirmation', () => {
    const f = fixture(),
      request = open(f);
    f.graph = {
      ...f.graph,
      nodes: f.graph.nodes.map((node) =>
        node.id === 'script'
          ? {
              ...node,
              data: {
                ...node.data,
                params: { ...node.data.params, prompt: 'latest committed input' },
              },
            }
          : node,
      ),
    };
    f.change({ zoom: 1.25 });
    f.deleteNodes.mockImplementation(() => {
      expect(f.graph.nodes[0].data.params.prompt).toBe('latest committed input');
      return true;
    });
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.deleteNodes).toHaveBeenCalledExactlyOnceWith(['script'], {
      zoom: 1.25,
      reconcileGroupConsumers: true,
    });
  });
  it('allows a position-only source copy sharing its business data identity', () => {
    const f = fixture(),
      request = open(f);
    f.graph = {
      ...f.graph,
      nodes: [{ ...f.graph.nodes[0], position: { x: 10, y: 20 } }, f.graph.nodes[1]],
    };
    act(() => expect(f.result.current.confirm(request)).toBe(true));
  });
  it.each([
    { model: 'another-model' },
    { settings: { ratio: '9:16' } },
    { segmentRemakeLock: true },
  ])('rejects changed business params even when a new prompt is present (%j)', (params) => {
    const f = fixture(),
      request = open(f),
      original = f.graph.nodes[0];
    f.graph = {
      ...f.graph,
      nodes: [
        {
          ...original,
          data: {
            ...original.data,
            params: { ...original.data.params, prompt: 'new input', ...params },
          },
        },
        f.graph.nodes[1],
      ],
    };
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.deleteNodes).not.toHaveBeenCalled();
    expect(f.result.current.request).toBeNull();
  });
  it('allows equivalent rematerialized settings and prompt-derived magic metadata on a normal input commit', () => {
    const f = fixture();
    const original = f.graph.nodes[0];
    original.data.params.settings = { duration: 5, ratio: '16:9' };
    const request = open(f);
    f.graph = {
      ...f.graph,
      nodes: [
        {
          ...original,
          data: {
            ...original.data,
            params: {
              ...original.data.params,
              settings: { ratio: '16:9', duration: 5 },
              prompt: 'new input',
              magicList: {},
            },
          },
        },
        f.graph.nodes[1],
      ],
    };
    act(() => expect(f.result.current.confirm(request)).toBe(true));
  });
  it.each(['missing', 'type', 'business', 'clone'])(
    'rejects a %s source identity replacement',
    (change) => {
      const f = fixture(),
        request = open(f),
        original = f.graph.nodes[0];
      const replacement =
        change === 'missing'
          ? []
          : [
              change === 'type'
                ? { ...original, type: 'image' }
                : change === 'business'
                  ? { ...original, data: { ...original.data, name: 'another source' } }
                  : structuredClone(original),
            ];
      f.graph = { ...f.graph, nodes: [...replacement, f.graph.nodes[1]] };
      act(() => expect(f.result.current.confirm(request)).toBe(false));
      expect(f.deleteNodes).not.toHaveBeenCalled();
      expect(f.result.current.request).toBeNull();
      expect(f.notify).toHaveBeenCalledWith('待删除节点已变化，请重新选择');
    },
  );
  it('retains the same request after a failed CAS so confirmation can retry', () => {
    const f = fixture(),
      request = open(f);
    f.deleteNodes.mockReturnValueOnce(false).mockReturnValueOnce(true);
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBe(request);
    act(() => expect(f.result.current.confirm(request)).toBe(true));
    expect(f.result.current.request).toBeNull();
    expect(f.deleteNodes).toHaveBeenCalledTimes(2);
  });
  it('reports thrown deletion without closing the retryable dialog', () => {
    const f = fixture(),
      request = open(f);
    f.deleteNodes.mockImplementation(() => {
      throw new Error('CAS failed');
    });
    act(() => expect(f.result.current.confirm(request)).toBe(false));
    expect(f.result.current.request).toBe(request);
    expect(f.notify).toHaveBeenCalledWith('当前节点无法删除，请重试');
  });
  it('old explicit tokens and captured default callbacks cannot confirm or cancel a later request', () => {
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
    expect(f.deleteNodes).not.toHaveBeenCalled();
    act(() => expect(f.result.current.confirm()).toBe(true));
  });
  it('retires the old confirmation on A to B to A even when all node IDs are reused', () => {
    const f = fixture(),
      first = open(f),
      oldConfirm = f.result.current.confirm;
    f.graph = { ...f.graph, documentKey: 'b', nodes: [script(), f.graph.nodes[1]] };
    f.change({ documentKey: 'b' });
    expect(f.result.current.request).toBeNull();
    f.graph = { ...f.graph, documentKey: 'a', nodes: [script(), f.graph.nodes[1]] };
    f.change({ documentKey: 'a' });
    const second = open(f);
    act(() => {
      expect(oldConfirm()).toBe(false);
      expect(f.result.current.confirm(first)).toBe(false);
    });
    expect(f.result.current.request).toBe(second);
    expect(f.deleteNodes).not.toHaveBeenCalled();
  });
  it.each([{ ready: false }, { readonly: true }])(
    'retires requests on capability loss and does not revive them on recovery (%j)',
    (changes) => {
      const f = fixture(),
        request = open(f);
      f.change(changes);
      expect(f.result.current.request).toBeNull();
      act(() => expect(f.result.current.confirm(request)).toBe(false));
      f.change({ ready: true, readonly: false });
      act(() => expect(f.result.current.confirm(request)).toBe(false));
      expect(f.deleteNodes).not.toHaveBeenCalled();
    },
  );
  it('rejects fresh graph owner/permission changes before props catch up', () => {
    const f = fixture(),
      request = open(f);
    for (const patch of [{ documentKey: 'b' }, { ready: false }, { readonly: true }]) {
      f.graph = { ...f.graph, documentKey: 'a', ready: true, readonly: false, ...patch };
      act(() => expect(f.result.current.confirm(request)).toBe(false));
    }
    expect(f.deleteNodes).not.toHaveBeenCalled();
  });
  it('rejects callbacks after unmount', () => {
    const f = fixture(),
      request = open(f),
      confirm = f.result.current.confirm;
    f.unmount();
    expect(confirm(request)).toBe(false);
    expect(f.deleteNodes).not.toHaveBeenCalled();
  });
  it('does not close a new request opened synchronously during the old deletion', () => {
    const f = fixture(),
      first = open(f);
    f.deleteNodes.mockImplementation(() => {
      f.result.current.remove(['script']);
      return true;
    });
    act(() => expect(f.result.current.confirm(first)).toBe(true));
    expect(f.result.current.request).not.toBe(first);
    expect(f.result.current.request?.title).toBe('确认删除');
  });
  it('rejects empty selections, invalid triggers and unavailable graph reads without mutation', () => {
    const f = fixture();
    act(() => {
      expect(f.result.current.remove([])).toBe(false);
      expect(f.result.current.remove(['missing'])).toBe(false);
      expect(f.result.current.remove(['script'], { trigger: 'other' })).toBe(false);
    });
    f.change({
      getDocument: () => {
        throw new Error('unavailable');
      },
    });
    act(() => expect(f.result.current.remove()).toBe(false));
    expect(f.deleteNodes).not.toHaveBeenCalled();
    expect(f.result.current.request).toBeNull();
  });
});
