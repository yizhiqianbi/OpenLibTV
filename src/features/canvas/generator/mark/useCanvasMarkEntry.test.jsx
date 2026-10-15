import { Component, StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasMarkEntry } from './useCanvasMarkEntry.js';

const models = {
  default: { image: 'magic' },
  imageModels: { magic: { modelKey: 'magic', properties: { magic: true } } },
};
const target = (id = 'target') => ({
  id,
  type: 'image',
  position: { x: 100, y: 100 },
  width: 350,
  height: 230,
  data: { type: 'image', action: 'image_generate', params: { model: 'magic', prompt: '原稿' } },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const actualModule = () => import('./CanvasMarkControllerBridge.jsx');

class ReviewBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div role="alert">bridge runtime failure: {this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

function harness({ strict = false, ...overrides } = {}) {
  let raw = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    models,
    nodes: [target(), target('other-target')],
    edges: [],
  };
  const holder = { current: null };
  let props = {
    ...raw,
    getDocument: () => raw,
    board: { current: null },
    getView: () => ({ x: 0, y: 0, z: 0.5 }),
    focusView: vi.fn(),
    setSelected: vi.fn(),
    cancelOtherModes: vi.fn(),
    cancelOtherGestures: vi.fn(),
    commitGraph: vi.fn(),
    flushGraph: vi.fn(),
    notify: vi.fn(),
    ...overrides,
  };
  function Host(value) {
    const entry = useCanvasMarkEntry(value);
    holder.current = entry;
    return (
      <>
        {entry.entry}
        <output data-testid="entry-state">
          {JSON.stringify({
            active: entry.active,
            targetId: entry.targetId,
            loading: entry.loadingEntry,
          })}
        </output>
      </>
    );
  }
  const view = () =>
    strict ? (
      <StrictMode>
        <ReviewBoundary>
          <Host {...props} />
        </ReviewBoundary>
      </StrictMode>
    ) : (
      <ReviewBoundary>
        <Host {...props} />
      </ReviewBoundary>
    );
  const page = render(view());
  const call = (callback) => {
    let result;
    act(() => {
      result = callback(holder.current);
    });
    return result;
  };
  return {
    ...page,
    holder,
    call,
    props: () => props,
    raw: () => raw,
    publish(next) {
      raw = next;
    },
    refresh(patch = {}) {
      props = { ...props, ...raw, ...patch };
      page.rerender(view());
    },
    async active(id = 'target') {
      await waitFor(() => expect(holder.current.active).toBe(true));
      expect(holder.current.targetId).toBe(id);
      expect(screen.getByRole('region', { name: '元素选择模式' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  };
}

describe('real mark lazy controller entry and bridge review', () => {
  it('keeps idle code unrequested and capability separate from a locked template', async () => {
    const loader = vi.fn(actualModule),
      page = harness({ loader });
    expect(page.call((api) => api.canTarget('target'))).toBe(true);
    await act(async () => {});
    expect(loader).not.toHaveBeenCalled();
    const before = page.raw();
    page.publish({
      ...before,
      nodes: before.nodes.map((node) =>
        node.id === 'target'
          ? {
              ...node,
              data: {
                ...node.data,
                extraConfig: {
                  scene: 'locked',
                  models: [{ modelKey: 'magic' }],
                  schema: { config: false },
                },
              },
            }
          : node,
      ),
    });
    page.refresh();
    expect(page.call((api) => api.canTarget('target'))).toBe(true);
    expect(page.call((api) => api.enter('target'))).toBe(false);
    expect(loader).not.toHaveBeenCalled();
    expect(page.props().cancelOtherModes).not.toHaveBeenCalled();
  });

  it('loads the actual bridge, consumes enter once, and reuses the loaded controller after exit', async () => {
    const loader = vi.fn(actualModule),
      page = harness({ loader });
    expect(page.call((api) => api.enter('target', { cursorOffset: 0 }))).toBe(true);
    await page.active();
    expect(loader).toHaveBeenCalledOnce();
    expect(page.props().cancelOtherModes).toHaveBeenCalledTimes(2);
    expect(page.call((api) => api.exit())).toBe(true);
    expect(page.holder.current.active).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
    expect(page.call((api) => api.enter('other-target'))).toBe(true);
    await page.active('other-target');
    expect(loader).toHaveBeenCalledOnce();
    expect(page.props().commitGraph).not.toHaveBeenCalled();
  });

  it('activates the actual newly mounted bridge under StrictMode effect replay without losing its API or request', async () => {
    const loader = vi.fn(actualModule),
      page = harness({ strict: true, loader });
    expect(page.call((api) => api.enter('target', { cursorOffset: 0 }))).toBe(true);
    await page.active();
    expect(loader).toHaveBeenCalledOnce();
    expect(page.holder.current.loadingEntry).toBe(false);
    expect(page.props().notify).not.toHaveBeenCalled();
    expect(page.call((api) => api.onEscape())).toBe(true);
    expect(page.holder.current.active).toBe(false);
    expect(page.raw().nodes[0].data.params.prompt).toBe('原稿');
  });

  it('keeps a failed import retryable and really reloads the module without changing graph', async () => {
    const first = deferred(),
      loader = vi.fn().mockReturnValueOnce(first.promise).mockImplementationOnce(actualModule),
      page = harness({ loader });
    expect(page.call((api) => api.enter('target'))).toBe(true);
    expect(page.holder.current.loadingEntry).toBe(true);
    await act(async () => first.reject(new Error('chunk unavailable')));
    expect(page.holder.current.loadingEntry).toBe(false);
    expect(page.holder.current.active).toBe(false);
    expect(page.props().notify).toHaveBeenCalledExactlyOnceWith(
      '元素选择工具加载失败，请重新点击标记重试',
    );
    expect(page.call((api) => api.enter('target'))).toBe(true);
    await page.active();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(page.props().commitGraph).not.toHaveBeenCalled();
  });

  it('canceling a pending import prevents late entry, and a fresh request may reuse the cached actual module', async () => {
    const request = deferred(),
      loader = vi.fn(() => request.promise),
      page = harness({ loader });
    page.call((api) => api.enter('target'));
    expect(page.holder.current.loadingEntry).toBe(true);
    page.call((api) => api.cancel());
    expect(page.holder.current.loadingEntry).toBe(false);
    await act(async () => request.resolve(await actualModule()));
    expect(page.holder.current.active).toBe(false);
    expect(screen.queryByRole('region')).toBeNull();
    expect(page.call((api) => api.enter('other-target'))).toBe(true);
    await page.active('other-target');
    expect(loader).toHaveBeenCalledOnce();
  });

  it('ignores an old pending document request across A→B→A and consumes only the new request', async () => {
    const request = deferred(),
      loader = vi.fn(() => request.promise),
      page = harness({ loader }),
      original = page.raw();
    page.call((api) => api.enter('target'));
    const old = page.holder.current;
    page.publish({ ...original, documentKey: 'B' });
    page.refresh();
    page.publish({ ...original, documentKey: 'A' });
    page.refresh();
    expect(page.call((api) => api.enter('other-target'))).toBe(true);
    await act(async () => request.resolve(await actualModule()));
    await page.active('other-target');
    expect(page.call(() => old.exit())).toBe(false);
    expect(page.call(() => old.onEscape())).toBe(false);
    expect(loader).toHaveBeenCalledOnce();
    expect(page.props().notify).not.toHaveBeenCalled();
  });

  it.each(['ready', 'readonly', 'target-capability'])(
    'retires a lazy request if %s is lost and later restored before import resolves',
    async (change) => {
      const request = deferred(),
        loader = vi.fn(() => request.promise),
        page = harness({ loader }),
        original = page.raw();
      page.call((api) => api.enter('target'));
      if (change === 'ready') page.publish({ ...original, ready: false });
      else if (change === 'readonly') page.publish({ ...original, readonly: true });
      else
        page.publish({ ...original, nodes: original.nodes.filter((node) => node.id !== 'target') });
      page.refresh();
      expect(page.holder.current.loadingEntry).toBe(false);
      page.publish(original);
      page.refresh();
      await act(async () => request.resolve(await actualModule()));
      expect(page.holder.current.active).toBe(false);
      expect(screen.queryByRole('region')).toBeNull();
      expect(page.props().commitGraph).not.toHaveBeenCalled();
    },
  );

  it('does not let a retained old-document cancel retire the new same-ID mode', async () => {
    const page = harness({ loader: vi.fn(actualModule) });
    page.call((api) => api.enter('target'));
    await page.active();
    const old = page.holder.current,
      original = page.raw();
    page.publish({ ...original, documentKey: 'B' });
    page.refresh();
    page.publish({ ...original, documentKey: 'A' });
    page.refresh();
    page.call((api) => api.enter('target'));
    await page.active();
    page.call(() => old.cancel());
    expect(page.holder.current.active).toBe(true);
    expect(screen.getByRole('region', { name: '元素选择模式' })).toBeTruthy();
  });

  it('unmounting while importing ignores late module completion and does not notify or mutate graph', async () => {
    const request = deferred(),
      page = harness({ loader: () => request.promise });
    page.call((api) => api.enter('target'));
    page.unmount();
    await act(async () => request.resolve(await actualModule()));
    expect(screen.queryByRole('region')).toBeNull();
    expect(page.props().notify).not.toHaveBeenCalled();
    expect(page.props().commitGraph).not.toHaveBeenCalled();
  });

  it('rejects a malformed lazy module as a real failure and permits another legal module request', async () => {
    const loader = vi.fn().mockResolvedValueOnce({}).mockImplementationOnce(actualModule),
      page = harness({ loader });
    page.call((api) => api.enter('target'));
    await waitFor(() => expect(page.holder.current.loadingEntry).toBe(false));
    expect(page.holder.current.active).toBe(false);
    expect(page.props().notify).toHaveBeenCalledOnce();
    page.call((api) => api.enter('target'));
    await page.active();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
