import { StrictMode, useCallback } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGeneratorSurfacePlacement } from './useGeneratorSurfacePlacement.js';

let observers, frames, frameId, viewportDescriptors;
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
const viewport = (width, height) =>
  Object.defineProperties(window, {
    innerWidth: { configurable: true, writable: true, value: width },
    innerHeight: { configurable: true, writable: true, value: height },
  });
const visualViewport = (extra = {}) =>
  Object.assign(new EventTarget(), {
    offsetLeft: 0,
    offsetTop: 0,
    width: 1280,
    height: 720,
    ...extra,
  });
function fixture(extra = {}) {
  const node = Object.freeze({
    id: 'target',
    type: 'video',
    width: 350,
    height: 230,
    position: Object.freeze({ x: 465, y: 150 }),
    data: Object.freeze({}),
  });
  const board = { current: null };
  return {
    boardRect: rect(0, 0, 1280, 720),
    nodeRect: rect(465, 150, 350, 230),
    groupRect: rect(200, 100, 800, 600),
    scrollHeight: 221,
    offsetHeight: 221,
    parent: 'node',
    config: {
      node,
      board,
      position: node.position,
      view: Object.freeze({ x: 0, y: 0, z: 1 }),
      zoom: 1,
      documentKey: 'A',
      kind: 'generic',
    },
    ...extra,
  };
}

/** Only jsdom's absent layout is supplied; the production hook and DOM owner tree are real. */
function Harness({ value, enabled = true, changes = {}, configured = true, nodeId }) {
  const result = useGeneratorSurfacePlacement(
    configured ? { ...value.config, ...changes } : null,
    enabled,
  );
  const attach = result.ref;
  const attachBoard = useCallback(
    (element) => {
      value.config.board.current = element;
      if (element) {
        value.board = element;
        value.boardRead = vi.fn(() => value.boardRect);
        element.getBoundingClientRect = value.boardRead;
      }
    },
    [value],
  );
  const attachNode = useCallback(
    (element) => {
      if (element) {
        value.node = element;
        value.nodeRead = vi.fn(() => value.nodeRect);
        element.getBoundingClientRect = value.nodeRead;
      }
    },
    [value],
  );
  const attachGroup = useCallback(
    (element) => {
      if (element) {
        value.group = element;
        element.getBoundingClientRect = () => value.groupRect;
      }
    },
    [value],
  );
  const attachTitle = useCallback(
    (element) => {
      if (element) {
        value.title = element;
        element.getBoundingClientRect = () => value.titleRect;
      }
    },
    [value],
  );
  const attachToolbar = useCallback(
    (element) => {
      if (element) {
        value.toolbar = element;
        value.toolbarRead = vi.fn(() => value.toolbarRect);
        element.getBoundingClientRect = value.toolbarRead;
      }
    },
    [value],
  );
  const attachSurface = useCallback(
    (element) => {
      if (element) {
        value.surface = element;
        Object.defineProperties(element, {
          scrollHeight: { configurable: true, get: () => value.scrollHeight },
          offsetHeight: { configurable: true, get: () => value.offsetHeight },
          offsetParent: {
            configurable: true,
            get: () =>
              value.parent === 'group'
                ? value.group
                : value.parent === 'body'
                  ? document.body
                  : value.parent === 'none'
                    ? null
                    : value.node,
          },
        });
      }
      attach(element);
    },
    [value, attach],
  );
  return (
    <div ref={attachBoard} data-testid="board">
      <div
        className="cv-world"
        ref={(element) => {
          if (element) value.world = element;
        }}
      >
        <div ref={attachGroup} data-testid="group">
          <article ref={attachNode} data-node-id={nodeId || value.config.node.id}>
            {value.titleRect && (
              <div
                ref={attachTitle}
                className="cv-node-title"
                style={{ display: value.titleHidden ? 'none' : undefined }}
              >
                节点标题
              </div>
            )}
            <section
              ref={attachSurface}
              data-testid="surface"
              data-side={result.side}
              style={{
                borderTopWidth: value.borderTop || 0,
                borderBottomWidth: value.borderBottom || 0,
                borderStyle: 'solid',
                ...result.style,
              }}
            >
              <input aria-label="保留的输入" defaultValue="未提交草稿" />
            </section>
          </article>
        </div>
      </div>
      {value.toolbarRect && (
        <aside className="cv-left-tools" ref={attachToolbar}>
          画布工具栏
        </aside>
      )}
    </div>
  );
}
const surface = () => screen.getByTestId('surface');
const number = (name) => Number.parseFloat(surface().style[name]);
const activeObserver = () => observers.findLast((observer) => !observer.retired);
const notify = (observer = activeObserver()) => act(() => observer.callback());
const transition = (target, type, propertyName = 'transform') => {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(target, event);
};
const flushFrame = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
  });

beforeEach(() => {
  viewportDescriptors = Object.fromEntries(
    ['innerWidth', 'innerHeight', 'visualViewport'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(window, key),
    ]),
  );
  viewport(1280, 720);
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });
  observers = [];
  frames = new Map();
  frameId = 0;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        this.retired = false;
        this.observe = vi.fn();
        this.disconnect = vi.fn(() => {
          this.retired = true;
        });
        observers.push(this);
      }
    },
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, descriptor] of Object.entries(viewportDescriptors)) {
    if (descriptor) Object.defineProperty(window, key, descriptor);
    else delete window[key];
  }
});

describe('actual generator surface measurement and lifecycle', () => {
  it('keeps a fitting card below its actual node, observes its owner, and never changes input or document data', () => {
    const value = fixture(),
      before = JSON.stringify(value.config);
    render(<Harness value={value} />);
    const input = screen.getByRole('textbox', { name: '保留的输入' });
    expect(surface().dataset.side).toBe('below');
    expect(number('left')).toBe(175);
    expect(number('top')).toBe(246); // 150 + 230 + 16, relative to the node's real top.
    expect(number('width')).toBe(660);
    expect(surface().style.transform).toBe('scale(1) translateX(-50%)');
    expect(surface().style.maxHeight).toBe('');
    expect(activeObserver().observe.mock.calls.map(([element]) => element)).toEqual([
      value.board,
      value.surface,
      value.node,
    ]);
    expect(frames.size).toBe(0);
    fireEvent.change(input, { target: { value: '光标所在草稿' } });
    value.nodeRect = rect(430, 130, 350, 230);
    notify();
    expect(screen.getByRole('textbox', { name: '保留的输入' })).toBe(input);
    expect(input.value).toBe('光标所在草稿');
    // Board refs are DOM ownership, not persisted document state.
    expect(JSON.stringify({ ...value.config, board: { current: null } })).toBe(before);
  });

  it('moves the measured default bottom VIDEO above without using stale saved positions', () => {
    const value = fixture({ nodeRect: rect(465, 385, 350, 230) });
    render(<Harness value={value} changes={{ position: { x: -9000, y: -8000 } }} />);
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-237);
    expect(number('top') + value.nodeRect.top).toBe(148);
    expect(148 + 221).toBe(369);
    expect(surface().style.maxHeight).toBe('');
    expect(surface().style.overflowY).toBe('');
  });

  it('keeps an above card clear of actual title overhang while preserving the below body anchor and invisible-title fallback', () => {
    const value = fixture({
      nodeRect: rect(465, 385, 350, 230),
      titleRect: rect(465, 360, 200, 15),
    });
    const page = render(<Harness value={value} />);
    const input = screen.getByRole('textbox', { name: '保留的输入' });
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-262);
    expect(value.nodeRect.top + number('top') + value.scrollHeight).toBe(344);
    expect(344).toBe(value.titleRect.top - 16);
    expect(344).toBeLessThan(value.nodeRect.top - 16);

    value.nodeRect = rect(465, 150, 350, 230);
    value.titleRect = rect(465, 125, 200, 15);
    notify();
    expect(surface().dataset.side).toBe('below');
    expect(value.nodeRect.top + number('top')).toBe(value.nodeRect.bottom + 16);

    value.nodeRect = rect(465, 385, 350, 230);
    value.titleRect = rect(465, 100, 0, 15);
    notify();
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-237);
    expect(value.nodeRect.top + number('top') + value.scrollHeight).toBe(value.nodeRect.top - 16);

    // display:none has zero layout geometry in a browser; jsdom receives that absent-layout result.
    value.titleHidden = true;
    value.titleRect = rect(0, 0, 0, 0);
    page.rerender(<Harness value={value} />);
    notify();
    expect(value.title.style.display).toBe('none');
    expect(number('top')).toBe(-237);
    value.titleRect = null;
    page.rerender(<Harness value={value} />);
    notify();
    expect(value.node.querySelector('.cv-node-title')).toBeNull();
    expect(number('top')).toBe(-237);
    expect(screen.getByRole('textbox', { name: '保留的输入' })).toBe(input);
  });

  it('measures natural scrollHeight plus borders and does not oscillate when maxHeight reduces offsetHeight', () => {
    const value = fixture({
      nodeRect: rect(465, 200, 350, 230),
      scrollHeight: 212,
      offsetHeight: 200,
      borderTop: 1,
      borderBottom: 2,
    });
    render(<Harness value={value} />);
    expect(surface().dataset.side).toBe('below');
    expect(number('top')).toBe(246);
    expect(number('maxHeight')).toBe(214);
    // The 3px borders make 212px natural content exceed the 214px available region.
    expect(surface().style.minHeight).toBe('0px');
    expect(surface().style.overflowY).toBe('auto');
    value.offsetHeight = 214;
    value.scrollHeight = 900;
    for (let index = 0; index < 3; index += 1) notify();
    expect(number('maxHeight')).toBe(214);
    expect(surface().style.overflowY).toBe('auto');
    value.scrollHeight = 150;
    value.offsetHeight = 153;
    notify();
    expect(surface().style.maxHeight).toBe('');
    expect(surface().style.overflowY).toBe('');
  });

  it('provides a scrollable dock in an extremely short viewport and recovers after resize', () => {
    const value = fixture({
      nodeRect: rect(465, 10, 350, 50),
      scrollHeight: 300,
      offsetHeight: 300,
    });
    viewport(1280, 80);
    render(<Harness value={value} />);
    expect(surface().dataset.side).toBe('docked');
    expect(number('top') + value.nodeRect.top).toBe(20);
    expect(number('maxHeight')).toBe(40);
    expect(surface().style.overflowY).toBe('auto');
    viewport(1280, 720);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(surface().dataset.side).toBe('below');
    expect(number('top') + value.nodeRect.top).toBe(76);
    expect(surface().style.maxHeight).toBe('');
  });

  it('uses explicit content dimensions for live scale and converts a nested group offsetParent only once', () => {
    const value = fixture({
      nodeRect: rect(500, 250, 300, 100),
      groupRect: rect(300, 100, 500, 500),
      parent: 'group',
    });
    value.config.node = Object.freeze({
      ...value.config.node,
      width: 350,
      height: 230,
      measured: { width: 111, height: 222 },
      parentId: 'inner-group',
      position: { x: 40, y: 30 },
      data: { _explicitContentDims: true, contentWidth: 600, contentHeight: 200 },
    });
    const page = render(<Harness value={value} />);
    expect(surface().style.transform).toBe('scale(2) translateX(-50%)');
    expect(number('left')).toBe(700); // (650 - group.left300) / .5
    expect(number('top')).toBe(532); // (350 + screen gap16 - group.top100) / .5
    expect(number('width')).toBe(660);
    value.groupRect = rect(250, 80, 500, 500);
    value.nodeRect = rect(450, 230, 300, 100);
    page.rerender(<Harness value={value} changes={{ position: { x: 800, y: 700 } }} />);
    expect(number('left')).toBe(700);
    expect(number('top')).toBe(532);
  });

  it('uses measured node dimensions and board coordinates when no matching DOM node is available', () => {
    const value = fixture({ boardRect: rect(80, 40, 900, 650), parent: 'none' });
    value.config.node = {
      id: 'target',
      type: 'audio',
      measured: { width: 400, height: 100 },
      position: { x: 100, y: 120 },
      data: {},
    };
    value.config.position = value.config.node.position;
    value.config.view = { x: 30, y: 20, z: 0.5 };
    value.config.zoom = 0.5;
    render(<Harness value={value} nodeId="old-node" />);
    expect(value.nodeRead).not.toHaveBeenCalled();
    expect(surface().style.transform).toBe('scale(2) translateX(-50%)');
    expect(number('left')).toBe(540); // visible left clamp center430 minus projected node.left160, divided by .5
    expect(160 + number('left') * 0.5).toBe(430);
    expect(number('top')).toBe(132); // projected height50 plus screen gap16, divided by .5
    expect(activeObserver().observe).not.toHaveBeenCalledWith(value.node);
  });

  it('preserves the ordinary screen gap and Script world gap with a measured half-scale node', () => {
    const value = fixture({ nodeRect: rect(500, 200, 175, 115) });
    const page = render(
      <Harness value={value} changes={{ zoom: 0.5, view: { x: 0, y: 0, z: 0.5 } }} />,
    );
    expect(number('top')).toBe(262); // (115 + screen gap16) / .5
    page.rerender(
      <Harness
        value={value}
        changes={{ zoom: 0.5, view: { x: 0, y: 1, z: 0.5 }, kind: 'script' }}
      />,
    );
    expect(number('top')).toBe(246); // (115 + 16 world*.5) / .5
  });

  it('follows actual middle-frame node scale and pan through only a world transform transition', () => {
    const value = fixture();
    const page = render(<Harness value={value} />);
    const input = screen.getByRole('textbox', { name: '保留的输入' });
    transition(value.world, 'transitionrun', 'opacity');
    transition(value.node, 'transitionstart');
    expect(frames.size).toBe(0);
    // React already has the destination camera; actual DOM is still at animation start.
    page.rerender(
      <Harness value={value} changes={{ zoom: 0.5, view: { x: 80, y: 20, z: 0.5 } }} />,
    );
    expect(surface().style.transform).toBe('scale(1) translateX(-50%)');
    expect(number('top') - value.nodeRect.height).toBe(16);
    transition(value.world, 'transitionrun');
    transition(value.world, 'transitionstart');
    expect(frames.size).toBe(1);
    transition(value.world, 'transitionend', 'opacity');
    transition(value.node, 'transitioncancel');
    expect(frames.size).toBe(1);
    value.nodeRect = rect(420, 130, 262.5, 172.5);
    flushFrame();
    expect(surface().style.transform).toBe(`scale(${1 / 0.75}) translateX(-50%)`);
    expect(number('top')).toBeCloseTo((172.5 + 16) / 0.75);
    expect(number('top') * 0.75 - value.nodeRect.height).toBeCloseTo(16);
    expect(number('left')).toBe(175);
    expect(number('width')).toBe(660);
    expect(frames.size).toBe(1);
    value.nodeRect = rect(400, 120, 175, 115);
    transition(value.world, 'transitionend');
    expect(surface().style.transform).toBe('scale(2) translateX(-50%)');
    expect(number('top')).toBe(262);
    expect(frames.size).toBe(0);
    expect(screen.getByRole('textbox', { name: '保留的输入' })).toBe(input);
  });

  it('stops RAF on transform cancellation and hidden documents without perpetually polling', () => {
    const value = fixture();
    render(<Harness value={value} />);
    transition(value.world, 'transitionstart');
    value.nodeRect = rect(450, 180, 350, 230);
    transition(value.world, 'transitioncancel');
    expect(frames.size).toBe(0);
    expect(number('top')).toBe(246);
    transition(value.world, 'transitionstart');
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    hidden.mockReturnValue(false);
    value.nodeRect = rect(465, 385, 350, 230);
    fireEvent(document, new Event('visibilitychange'));
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-237);
    expect(frames.size).toBe(0);
  });

  it('tracks visible visualViewport intersection and removes old resize and scroll callbacks on unmount', () => {
    const visual = visualViewport({ offsetLeft: 50, offsetTop: 100, width: 390, height: 300 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: visual });
    const value = fixture({ nodeRect: rect(100, 150, 350, 100) });
    const page = render(<Harness value={value} />);
    expect(surface().dataset.side).toBe('docked');
    expect(number('top')).toBe(-30);
    expect(number('left')).toBe(145);
    expect(number('width')).toBe(350);
    expect(number('maxHeight')).toBe(220);
    visual.height = 500;
    act(() => visual.dispatchEvent(new Event('resize')));
    expect(surface().dataset.side).toBe('below');
    expect(number('top')).toBe(116);
    expect(surface().style.maxHeight).toBe('');
    visual.offsetTop = 200;
    act(() => visual.dispatchEvent(new Event('scroll')));
    expect(number('top')).toBe(116);
    const observer = activeObserver();
    page.unmount();
    const reads = value.boardRead.mock.calls.length;
    act(() => {
      observer.callback();
      visual.dispatchEvent(new Event('resize'));
      visual.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(value.boardRead).toHaveBeenCalledTimes(reads);
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it('reacts to board ResizeObserver and external scroll while leaving card-internal scrolling alone', () => {
    const value = fixture();
    render(<Harness value={value} />);
    const input = screen.getByRole('textbox', { name: '保留的输入' });
    const reads = value.boardRead.mock.calls.length;
    fireEvent.scroll(input);
    expect(value.boardRead).toHaveBeenCalledTimes(reads);
    value.boardRect = rect(0, 0, 390, 720);
    notify();
    expect(number('width')).toBe(350);
    expect(number('left')).toBe(-270);
    value.nodeRect = rect(465, 385, 350, 230);
    fireEvent.scroll(value.board);
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-237);
    expect(screen.getByRole('textbox', { name: '保留的输入' })).toBe(input);
  });

  it('keeps the measured 390px generator clear of the left toolbar and retires zero, offscreen and detached toolbar geometry', () => {
    viewport(390, 844);
    const value = fixture({
      boardRect: rect(0, 0, 390, 720),
      nodeRect: rect(20, 385, 350, 230),
      toolbarRect: rect(9, 236, 46, 370),
    });
    const page = render(<Harness value={value} />);
    const observer = activeObserver();
    const horizontal = () => {
      const center = value.nodeRect.left + number('left');
      const width = number('width');
      return { left: center - width / 2, width, right: center + width / 2 };
    };
    expect(observer.observe).toHaveBeenCalledWith(value.toolbar);
    expect(horizontal()).toEqual({ left: 75, width: 295, right: 370 });
    expect(horizontal().left).toBe(value.toolbarRect.right + 20);

    // The column stays reserved even when this capped card ends above the toolbar;
    // reserving only overlapping Y ranges would make content wrapping oscillate.
    value.nodeRect = rect(20, 250, 350, 230);
    notify(observer);
    expect(value.nodeRect.top + number('top') + number('maxHeight')).toBe(234);
    expect(234).toBeLessThan(value.toolbarRect.top);
    expect(horizontal()).toEqual({ left: 75, width: 295, right: 370 });

    for (const invisible of [
      rect(9, 236, 0, 370),
      rect(9, 236, 46, 0),
      rect(500, 236, 46, 370),
      rect(-100, 236, 46, 370),
      rect(9, -380, 46, 370),
      rect(9, 900, 46, 370),
    ]) {
      value.toolbarRect = invisible;
      notify(observer);
      expect(horizontal()).toEqual({ left: 20, width: 350, right: 370 });
    }
    value.toolbarRect = rect(9, 236, 46, 370);
    notify(observer);
    expect(horizontal()).toEqual({ left: 75, width: 295, right: 370 });
    value.toolbar.remove();
    expect(value.toolbar.isConnected).toBe(false);
    notify(observer);
    expect(horizontal()).toEqual({ left: 20, width: 350, right: 370 });
    page.unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    const boardReads = value.boardRead.mock.calls.length,
      toolbarReads = value.toolbarRead.mock.calls.length;
    act(() => {
      observer.callback();
      window.dispatchEvent(new Event('resize'));
    });
    expect(value.boardRead).toHaveBeenCalledTimes(boardReads);
    expect(value.toolbarRead).toHaveBeenCalledTimes(toolbarReads);
  });

  it('retires all measured owners when expanded placement is disabled and resumes with fresh geometry', () => {
    const value = fixture();
    const page = render(<Harness value={value} />);
    const observer = activeObserver();
    transition(value.world, 'transitionstart');
    const queued = [...frames.values()];
    page.rerender(<Harness value={value} enabled={false} />);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(surface().dataset.side).toBeUndefined();
    const reads = value.boardRead.mock.calls.length;
    value.nodeRect = rect(465, 385, 350, 230);
    act(() => {
      observer.callback();
      for (const callback of queued) callback();
      window.dispatchEvent(new Event('resize'));
    });
    expect(value.boardRead).toHaveBeenCalledTimes(reads);
    page.rerender(<Harness value={value} />);
    expect(activeObserver()).not.toBe(observer);
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-237);
  });

  it('guards late observer and RAF publications across StrictMode and document A to B to A owners', () => {
    const value = fixture();
    const page = render(
      <StrictMode>
        <Harness value={value} />
      </StrictMode>,
    );
    expect(observers.filter((observer) => !observer.retired)).toHaveLength(1);
    const input = screen.getByRole('textbox', { name: '保留的输入' });
    const first = activeObserver();
    transition(value.world, 'transitionstart');
    const oldFrame = [...frames.values()][0];
    value.nodeRect = rect(465, 385, 350, 230);
    page.rerender(
      <StrictMode>
        <Harness value={value} changes={{ documentKey: 'B' }} />
      </StrictMode>,
    );
    const second = activeObserver();
    expect(first.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(surface().dataset.side).toBe('above');
    value.nodeRect = rect(465, 150, 350, 230);
    page.rerender(
      <StrictMode>
        <Harness value={value} />
      </StrictMode>,
    );
    expect(second.disconnect).toHaveBeenCalledOnce();
    const latest = activeObserver(),
      reads = value.boardRead.mock.calls.length;
    value.nodeRect = rect(465, 385, 350, 230);
    act(() => {
      first.callback();
      second.callback();
      oldFrame();
    });
    expect(value.boardRead).toHaveBeenCalledTimes(reads);
    expect(surface().dataset.side).toBe('below');
    notify(latest);
    expect(surface().dataset.side).toBe('above');
    expect(screen.getByRole('textbox', { name: '保留的输入' })).toBe(input);
    transition(value.world, 'transitionstart');
    const unmountFrame = [...frames.values()][0];
    page.unmount();
    expect(observers.every((observer) => observer.retired)).toBe(true);
    const after = value.boardRead.mock.calls.length;
    act(() => {
      latest.callback();
      oldFrame();
      unmountFrame();
      transition(value.world, 'transitionstart');
    });
    expect(value.boardRead).toHaveBeenCalledTimes(after);
    expect(frames.size).toBe(0);
  });

  it('keeps finite source fallback coordinates before DOM measurement and cancels placement with no configuration', () => {
    const value = fixture({ boardRect: rect(0, 0, 0, 0), parent: 'body' });
    const page = render(
      <Harness value={value} changes={{ coordinateOrigin: { x: 400, y: 100 } }} />,
    );
    expect(surface().dataset.side).toBeUndefined();
    expect(number('left')).toBe(240);
    expect(number('top')).toBe(296);
    expect(surface().style.transform).toBe('scale(1) translateX(-50%)');
    const old = activeObserver();
    page.rerender(<Harness value={value} configured={false} />);
    expect(old.disconnect).toHaveBeenCalledOnce();
    expect(surface().style.left).toBe('');
    expect(surface().style.top).toBe('');
  });

  it('places a mounted loading surface before its natural height is known and retains resize fallback without ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const value = fixture({ scrollHeight: 0, offsetHeight: 0 });
    const page = render(<Harness value={value} changes={{ minimumPanelHeight: 120 }} />);
    expect(observers).toHaveLength(0);
    expect(surface().dataset.side).toBe('below');
    expect(number('top')).toBe(246);
    value.nodeRect = rect(465, 385, 350, 230);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-136); // 385 - gap16 - pending minimum120, relative to top385
    value.scrollHeight = 500;
    value.offsetHeight = 500;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(surface().dataset.side).toBe('above');
    expect(number('top')).toBe(-365);
    expect(number('maxHeight')).toBe(349);
    expect(surface().style.overflowY).toBe('auto');
    page.unmount();
    const reads = value.boardRead.mock.calls.length;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(value.boardRead).toHaveBeenCalledTimes(reads);
  });
});
