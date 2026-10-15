import { StrictMode, useRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasGeneratorEntry } from './CanvasGeneratorEntry.jsx';
import GeneratorFrame from '../generator/GeneratorFrame.jsx';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
});

let layout, observers, frames, viewport, reads;

beforeEach(() => {
  layout = {
    board: rect(100, 50, 888, 620),
    node: rect(400, 335, 350, 230),
    title: null,
    origin: null,
    pendingHeight: 80,
    errorHeight: 120,
    fullHeight: 221,
  };
  observers = [];
  frames = new Map();
  reads = vi.fn();
  let nextFrame = 0;
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 768);
  viewport = Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    width: 1280,
    height: 768,
  });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.observe = vi.fn();
        this.disconnect = vi.fn();
        observers.push(this);
      }
    },
  );
  // jsdom has no layout engine. Only browser geometry primitives are supplied;
  // the mounted entry, loading boundary, frame and placement hook are real.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    reads(this);
    if (this.classList.contains('cv-board')) return layout.board;
    if (this.matches('[data-node-id]')) return layout.node;
    if (this.classList.contains('cv-node-title')) return layout.title || rect(0, 0, 0, 0);
    if (this.classList.contains('cv-surface-origin')) return layout.origin || layout.node;
    return rect(0, 0, 0, 0);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () {
    return this.classList.contains('cv-inline-generator')
      ? this.closest('.cv-surface-origin')
      : null;
  });
  const naturalHeight = (element) =>
    !element.classList.contains('cv-inline-generator')
      ? 0
      : element.classList.contains('cv-generator-load-state')
        ? element.querySelector('[role="alert"]')
          ? layout.errorHeight
          : layout.pendingHeight
        : layout.fullHeight;
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () {
    return naturalHeight(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
    const natural = naturalHeight(this);
    return this.style.maxHeight ? Math.min(natural, parseFloat(this.style.maxHeight)) : natural;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = (overrides = {}) => ({
  node: {
    id: 'node',
    type: 'image',
    position: { x: 100, y: 200 },
    width: 350,
    height: 230,
    data: { name: '节点', params: { prompt: '保持草稿' } },
  },
  documentKey: 'doc-a',
  ready: true,
  readonly: false,
  position: { x: 100, y: 200 },
  coordinateOrigin: { x: 100, y: 200 },
  zoom: 1,
  view: { x: 0, y: 0, z: 1 },
  ...overrides,
});

function FullSurface(value) {
  if (value.fail) throw new Error('render boundary fixture');
  return (
    <GeneratorFrame
      label="完整生成器"
      readonly={value.readonly}
      ready={value.ready}
      placement={{ ...value, kind: value.placementKind || 'generic' }}
    >
      {() => (
        <div data-testid="full-surface">
          <p>{value.documentKey + ':' + (value.marker || '')}</p>
          <button type="button">底部操作</button>
        </div>
      )}
    </GeneratorFrame>
  );
}

function MountedEntry({ loader, kind = 'generic', ...value }) {
  const board = useRef(null);
  return (
    <main className="cv-board" ref={board}>
      <div className="cv-world">
        <article data-node-id={value.node.id}>
          {value.showTitle && <header className="cv-node-title">节点标题</header>}
          <div className="cv-surface-origin">
            <CanvasGeneratorEntry loader={loader} kind={kind} {...value} board={board} />
          </div>
        </article>
      </div>
    </main>
  );
}

const fallback = () => document.querySelector('.cv-generator-load-state');
const full = () => screen.getByTestId('full-surface').closest('section');
const activeObserver = (surface) =>
  observers.findLast(
    (observer) =>
      observer.disconnect.mock.calls.length === 0 &&
      observer.observe.mock.calls.some(([element]) => element === surface),
  );
const notifySize = (surface) => act(() => activeObserver(surface).callback([{ target: surface }]));

function expectPlacement(surface, side, screenTop, scale = 1) {
  expect(surface.dataset.generatorSide).toBe(side);
  expect(parseFloat(surface.style.top)).toBeCloseTo(
    (screenTop - (layout.origin || layout.node).top) / scale,
  );
  expect(surface.style.transform).toBe(`scale(${1 / scale}) translateX(-50%)`);
}

function transition(target, type, propertyName = 'transform') {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  act(() => target.dispatchEvent(event));
}

function frame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

describe('actual mounted generator loading surfaces', () => {
  it('places pending and full cards by their actual different heights and retires the pending observer', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const value = props();
    const original = structuredClone(value);
    render(<MountedEntry loader={loader} {...value} />);
    const loading = fallback();
    const oldObserver = activeObserver(loading);
    expectPlacement(loading, 'above', 239);
    expect(loading.style.width).toBe('660px');
    expect(oldObserver.observe.mock.calls.map(([element]) => element)).toEqual([
      document.querySelector('.cv-board'),
      loading,
      document.querySelector('[data-node-id]'),
    ]);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(() => request.resolve({ default: FullSurface }));
    expect(fallback()).toBeNull();
    expectPlacement(full(), 'above', 98);
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
    const currentTop = full().style.top;
    const before = reads.mock.calls.length;
    act(() => oldObserver.callback([{ target: loading }]));
    expect(reads).toHaveBeenCalledTimes(before);
    expect(full().style.top).toBe(currentTop);
    expect(value).toEqual(original);
  });

  it('repositions an import error and its retry placeholder, then hands ownership to the full card', async () => {
    const first = deferred();
    const second = deferred();
    const loader = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    render(<MountedEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(() => first.reject(new Error('chunk offline')));
    expect(screen.getByRole('alert').textContent).toContain('chunk offline');
    notifySize(fallback());
    expectPlacement(fallback(), 'above', 199);
    const errorObserver = activeObserver(fallback());
    fireEvent.click(screen.getByRole('button', { name: '重新加载生成器' }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('status').textContent).toContain('正在加载');
    notifySize(fallback());
    expectPlacement(fallback(), 'above', 239);
    await act(() => second.resolve({ default: FullSurface }));
    expectPlacement(full(), 'above', 98);
    expect(errorObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps an above card clear of its actual node title and preserves a valid below placement', async () => {
    layout.title = rect(400, 299, 350, 35);
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    render(<MountedEntry loader={loader} {...props({ showTitle: true })} />);
    expectPlacement(fallback(), 'above', 203);
    expect(203 + layout.pendingHeight).toBe(layout.title.top - 16);
    await act(() => request.resolve({ default: FullSurface }));
    expectPlacement(full(), 'above', 70);
    expect(full().style.maxHeight).toBe('213px');
    expect(full().style.overflowY).toBe('auto');
    expect(70 + 213).toBe(layout.title.top - 16);
    layout.node = rect(400, 100, 350, 230);
    layout.title = rect(400, 64, 350, 35);
    notifySize(full());
    expectPlacement(full(), 'below', 346);
    expect(full().style.maxHeight).toBe('');
  });

  it('keeps render-boundary errors measured while a loaded implementation is broken and retries the cached code', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const loader = vi.fn().mockResolvedValue({ default: FullSurface });
    const page = render(<MountedEntry loader={loader} {...props({ fail: true })} />);
    await screen.findByRole('alert');
    const errorSurface = fallback();
    expectPlacement(errorSurface, 'above', 199);
    const errorObserver = activeObserver(errorSurface);
    expect(errorObserver).toBeTruthy();
    layout.node = rect(400, 100, 350, 230);
    fireEvent.resize(window);
    expectPlacement(errorSurface, 'below', 346);
    page.rerender(<MountedEntry loader={loader} {...props({ fail: false })} />);
    fireEvent.click(screen.getByRole('button', { name: '重新加载生成器' }));
    await screen.findByTestId('full-surface');
    expectPlacement(full(), 'below', 346);
    expect(errorObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('preserves overflow natural height after maxHeight is applied and clears the cap after content shrinks', async () => {
    layout.pendingHeight = 1200;
    const request = deferred();
    render(<MountedEntry loader={() => request.promise} {...props()} />);
    const loading = fallback();
    expectPlacement(loading, 'above', 70);
    expect(loading.style.maxHeight).toBe('249px');
    expect(loading.style.minHeight).toBe('0px');
    expect(loading.style.overflowY).toBe('auto');
    for (let index = 0; index < 3; index++) {
      notifySize(loading);
      expect(loading.style.maxHeight).toBe('249px');
      expectPlacement(loading, 'above', 70);
    }
    layout.pendingHeight = 100;
    notifySize(loading);
    expectPlacement(loading, 'above', 219);
    expect(loading.style.maxHeight).toBe('');
    expect(loading.style.minHeight).toBe('');
    expect(loading.style.overflowY).toBe('');
  });

  it('explicitly docks a mounted fallback when its owner fills the visible board', () => {
    layout.node = rect(400, 50, 350, 620);
    const request = deferred();
    render(<MountedEntry loader={() => request.promise} {...props()} />);
    expectPlacement(fallback(), 'docked', 70);
    expect(fallback().style.maxHeight).toBe('540px');
    expect(fallback().style.overflowY).toBe('auto');
  });

  it('uses the actual offset parent for a grouped surface rather than adding a stored parent origin twice', () => {
    layout.origin = rect(380, 315, 350, 230);
    const request = deferred();
    render(
      <MountedEntry
        loader={() => request.promise}
        {...props({ coordinateOrigin: { x: 900, y: 800 } })}
      />,
    );
    expectPlacement(fallback(), 'above', 239);
    expect(fallback().style.left).toBe('195px');
    expect(fallback().style.top).toBe('-76px');
  });

  it('derives live scale from explicit image content dimensions rather than the old stored box', () => {
    const value = props();
    Object.assign(value.node.data, {
      _explicitContentDims: true,
      contentWidth: 700,
      contentHeight: 525,
    });
    layout.node = rect(400, 335, 350, 262.5);
    const request = deferred();
    render(<MountedEntry loader={() => request.promise} {...value} />);
    expectPlacement(fallback(), 'above', 239, 0.5);
    expect(fallback().style.left).toBe('350px');
    expect(fallback().style.width).toBe('660px');
  });

  it('starts with source geometry for an unmeasured board and responds to resize without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    layout.board = rect(100, 50, 0, 0);
    const request = deferred();
    const page = render(<MountedEntry loader={() => request.promise} {...props()} />);
    const loading = fallback();
    expect(loading.dataset.generatorSide).toBeUndefined();
    expect(loading.style.top).toBe('246px');
    layout.board = rect(100, 50, 888, 620);
    fireEvent.resize(window);
    expectPlacement(loading, 'above', 239);
    page.unmount();
    const before = reads.mock.calls.length;
    fireEvent.resize(window);
    expect(reads).toHaveBeenCalledTimes(before);
  });

  it('intersects visualViewport geometry and retires its listeners on removal', () => {
    const request = deferred();
    const page = render(<MountedEntry loader={() => request.promise} {...props()} />);
    const loading = fallback();
    viewport.offsetTop = 200;
    viewport.height = 300;
    viewport.offsetLeft = 300;
    viewport.width = 500;
    act(() => viewport.dispatchEvent(new Event('resize')));
    expectPlacement(loading, 'above', 239);
    expect(loading.style.width).toBe('460px');
    expect(loading.style.left).toBe('150px');
    page.unmount();
    const before = reads.mock.calls.length;
    act(() => {
      viewport.dispatchEvent(new Event('resize'));
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(reads).toHaveBeenCalledTimes(before);
  });

  it('keeps fallback placement active after readiness is lost and prevents the late implementation from mounting', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const page = render(<MountedEntry loader={loader} {...props()} />);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    page.rerender(<MountedEntry loader={loader} {...props({ ready: false })} />);
    await act(() => request.resolve({ default: FullSurface }));
    expect(screen.queryByTestId('full-surface')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('画布加载中');
    layout.node = rect(400, 100, 350, 230);
    fireEvent.resize(window);
    expectPlacement(fallback(), 'below', 346);
    page.rerender(<MountedEntry loader={loader} {...props({ marker: 'resumed' })} />);
    await screen.findByTestId('full-surface');
    expect(screen.getByTestId('full-surface').textContent).toContain('doc-a:resumed');
    expectPlacement(full(), 'below', 346);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retires A→B→A observer and transition callbacks even when the same fallback DOM remains mounted', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    const page = render(<MountedEntry loader={loader} {...props({ marker: 'old-a' })} />);
    const loading = fallback();
    const oldObserver = activeObserver(loading);
    const world = document.querySelector('.cv-world');
    transition(world, 'transitionrun');
    const oldFrame = [...frames.values()][0];
    expect(frames.size).toBe(1);
    layout.node = rect(400, 100, 350, 230);
    page.rerender(<MountedEntry loader={loader} {...props({ documentKey: 'doc-b' })} />);
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    layout.node = rect(400, 335, 350, 230);
    page.rerender(<MountedEntry loader={loader} {...props({ marker: 'fresh-a' })} />);
    expect(fallback()).toBe(loading);
    expectPlacement(loading, 'above', 239);
    const before = reads.mock.calls.length;
    act(() => {
      oldObserver.callback([{ target: loading }]);
      oldFrame();
    });
    expect(reads).toHaveBeenCalledTimes(before);
    expect(frames.size).toBe(0);
    await act(() => request.resolve({ default: FullSurface }));
    expect(screen.getByTestId('full-surface').textContent).toContain('doc-a:fresh-a');
  });

  it('cancels the pending transition frame, observer and import publication when unmounted', async () => {
    const request = deferred();
    const implementation = vi.fn(() => <p>late full surface</p>);
    const page = render(<MountedEntry loader={() => request.promise} {...props()} />);
    const loading = fallback();
    const observer = activeObserver(loading);
    transition(document.querySelector('.cv-world'), 'transitionstart');
    const staleFrame = [...frames.values()][0];
    expect(frames.size).toBe(1);
    page.unmount();
    expect(frames.size).toBe(0);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    const before = reads.mock.calls.length;
    act(() => {
      observer.callback([{ target: loading }]);
      staleFrame();
      window.dispatchEvent(new Event('resize'));
    });
    await act(() => request.resolve({ default: implementation }));
    expect(reads).toHaveBeenCalledTimes(before);
    expect(implementation).not.toHaveBeenCalled();
  });

  it('maintains a 16px Generic screen gap while actual world scale differs from final zoom during a transition', () => {
    const request = deferred();
    layout.node = rect(400, 335, 350 * 0.75, 230 * 0.75);
    render(
      <MountedEntry
        loader={() => request.promise}
        {...props({ zoom: 0.5, view: { x: 0, y: 0, z: 0.5 } })}
      />,
    );
    const loading = fallback();
    // Below has 86.5px: the entire 80px placeholder remains accessible at a
    // stable 16-screen-pixel gap even though props already hold the final zoom.
    expectPlacement(loading, 'below', 523.5, 0.75);
    transition(document.querySelector('.cv-world'), 'transitionrun');
    layout.node = rect(400, 335, 350 * 0.5, 230 * 0.5);
    frame();
    expectPlacement(loading, 'below', 466, 0.5);
    transition(document.querySelector('.cv-world'), 'transitionend');
    expect(frames.size).toBe(0);
  });

  it('keeps the Script source gap at 16 world units while measuring rendered transition scale', () => {
    const request = deferred();
    layout.node = rect(400, 335, 350 * 0.75, 230 * 0.75);
    render(
      <MountedEntry
        loader={() => request.promise}
        kind="script"
        {...props({ zoom: 0.5, view: { x: 0, y: 0, z: 0.5 } })}
      />,
    );
    expectPlacement(fallback(), 'below', 519.5, 0.75);
    transition(document.querySelector('.cv-world'), 'transitionrun');
    layout.node = rect(400, 335, 350 * 0.5, 230 * 0.5);
    frame();
    expectPlacement(fallback(), 'below', 458, 0.5);
  });

  it('publishes a measured fallback after StrictMode replay and loads the implementation only once', async () => {
    const request = deferred();
    const loader = vi.fn(() => request.promise);
    render(
      <StrictMode>
        <MountedEntry loader={loader} {...props()} />
      </StrictMode>,
    );
    expectPlacement(fallback(), 'above', 239);
    expect(activeObserver(fallback())).toBeTruthy();
    layout.node = rect(400, 100, 350, 230);
    fireEvent.resize(window);
    expectPlacement(fallback(), 'below', 346);
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(() => request.resolve({ default: FullSurface }));
    expectPlacement(full(), 'below', 346);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('retires inline measurement when the loaded frame expands and measures its replacement on collapse', async () => {
    const loader = vi.fn().mockResolvedValue({ default: FullSurface });
    render(<MountedEntry loader={loader} {...props()} />);
    await screen.findByTestId('full-surface');
    const inline = full();
    const oldObserver = activeObserver(inline);
    transition(document.querySelector('.cv-world'), 'transitionstart');
    const oldFrame = [...frames.values()][0];
    fireEvent.click(screen.getByRole('button', { name: '展开生成器' }));
    const dialog = screen.getByRole('dialog', { name: '展开完整生成器' });
    expect(dialog.contains(full())).toBe(true);
    expect(full().dataset.generatorSide).toBeUndefined();
    expect(full().style.top).toBe('');
    expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    const before = reads.mock.calls.length;
    act(() => {
      oldObserver.callback([{ target: inline }]);
      oldFrame();
    });
    expect(reads).toHaveBeenCalledTimes(before);
    layout.node = rect(400, 100, 350, 230);
    fireEvent.click(screen.getByRole('button', { name: '收起生成器' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expectPlacement(full(), 'below', 346);
    expect(activeObserver(full())).toBeTruthy();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
