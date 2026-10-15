import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCanvasEdgeHover } from './useCanvasEdgeHover.js';

let frames;
let requestFrame;
let cancelFrame;

beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  let id = 0;
  requestFrame = vi.fn((callback) => {
    const frame = ++id;
    frames.set(frame, callback);
    return frame;
  });
  cancelFrame = vi.fn((frame) => frames.delete(frame));
  vi.stubGlobal('requestAnimationFrame', requestFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelFrame);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function entry(id = 'edge', patch = {}) {
  return {
    edge: { id, source: 'source', target: 'target' },
    geometry: { path: 'M0,0 L100,0', source: { x: 0, y: 0 }, target: { x: 100, y: 0 } },
    presentation: {
      selectable: true,
      deletable: true,
      focusable: true,
      interactive: true,
      stroke: 'var(--canvas-edge)',
      strokeWidth: 2,
      reference: false,
      highlighted: false,
      label: 'Edge from source to target',
      ...patch,
    },
  };
}

function path(y = 0) {
  return {
    getTotalLength: vi.fn(() => 100),
    getPointAtLength: vi.fn((length) => ({ x: length, y })),
  };
}

function fixture(patch = {}, wrapper) {
  const first = entry();
  const second = entry('second');
  const element = document.createElement('main');
  element.getBoundingClientRect = vi.fn(() => ({ x: 100, y: 50, width: 800, height: 600 }));
  let props = {
    entries: [first, second],
    documentKey: 'doc',
    ready: true,
    readonly: false,
    interactionDisabled: false,
    board: { current: element },
    view: { x: 20, y: 30, z: 0.5 },
    ...patch,
  };
  const hook = renderHook((options) => useCanvasEdgeHover(options), {
    initialProps: props,
    wrapper,
  });
  const api = path();
  const event = (x = 50, y = 20, target = element) => ({
    clientX: 100 + 20 + x * 0.5,
    clientY: 50 + 30 + y * 0.5,
    target,
  });
  const change = (next) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const enter = (item = first, pointer = event(), nativePath = api) =>
    act(() => hook.result.current.enter(item.edge, pointer, nativePath));
  const move = (pointer, item = first, nativePath = api) =>
    act(() => hook.result.current.move(item.edge, pointer, nativePath));
  const leave = (item = first) => act(() => hook.result.current.leave(item.edge));
  const advance = (milliseconds) => act(() => vi.advanceTimersByTime(milliseconds));
  const flush = () =>
    act(() => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    });
  return { first, second, element, hook, api, event, change, enter, move, leave, advance, flush };
}

it('shows scissors only at 1000 ms, using the nearest native arc-length point in world coordinates', () => {
  const f = fixture();
  f.enter();
  expect(f.hook.result.current.hover).toEqual({
    edgeId: 'edge',
    edge: f.first.edge,
    hovered: true,
    scissorsVisible: false,
    exiting: false,
    position: null,
  });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(92);
  f.advance(999);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('repeated enter within the same edge does not restart its existing hover timer', () => {
  const f = fixture();
  f.enter();
  f.advance(500);
  f.enter();
  expect(vi.getTimerCount()).toBe(1);
  f.advance(499);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it.each([0, 999, 1000])('main shared leave at %s ms immediately retires all owned work', (time) => {
  const f = fixture();
  f.enter();
  const lateFrame = [...frames.values()][0];
  f.advance(time);
  f.leave();
  expect(f.hook.result.current.hover).toBeNull();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(cancelFrame).toHaveBeenCalledOnce();
  act(() => lateFrame());
  for (const delay of [119, 1, 149, 1, 1000]) {
    f.advance(delay);
    expect(f.hook.result.current.hover).toBeNull();
  }
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
});

it('main shared re-entry after leaving at 999 ms starts a new full second', () => {
  const f = fixture();
  f.enter();
  f.advance(999);
  f.leave();
  f.enter();
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(998);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('another edge retires the prior timer and RAF; a late prior leave cannot remove the new hover', () => {
  const f = fixture();
  f.enter();
  const oldFrame = [...frames.values()][0];
  f.advance(500);
  const secondPath = path(30);
  f.enter(f.second, f.event(75), secondPath);
  f.leave(f.first);
  act(() => oldFrame());
  expect(f.hook.result.current.hover.edge).toBe(f.second.edge);
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
  f.advance(500);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 75, y: 30 });
  f.advance(500);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it.each(['blur', 'clear'])(
  '%s cancels pending work and permits only a fresh hover afterward',
  (action) => {
    const f = fixture();
    f.enter();
    f.advance(999);
    act(() => {
      if (action === 'blur') window.dispatchEvent(new Event('blur'));
      else f.hook.result.current.clear();
    });
    expect(f.hook.result.current.hover).toBeNull();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    f.enter();
    f.advance(999);
    expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
    f.advance(1);
    expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
  },
);

it.each([
  ['not ready', { ready: false }],
  ['interaction disabled', { interactionDisabled: true }],
  ['no visible endpoint', { entries: [entry('edge', { interactive: false })] }],
  ['not selectable', { entries: [entry('edge', { selectable: false })] }],
])('does not enter while %s', (name, options) => {
  const f = fixture(options);
  const candidate = options.entries?.[0] ?? f.first;
  f.enter(candidate);
  expect(f.hook.result.current.hover).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(requestFrame).not.toHaveBeenCalled();
});

it.each(['readonly', 'not deletable'])(
  '%s still allows hover but schedules neither scissors nor nearest-point work',
  (mode) => {
    const f = fixture(mode === 'readonly' ? { readonly: true } : {});
    if (mode === 'not deletable')
      f.change({
        entries: [{ ...f.first, presentation: { ...f.first.presentation, deletable: false } }],
      });
    f.enter();
    f.move(f.event(90));
    f.advance(2000);
    expect(f.hook.result.current.hover).toEqual({
      edgeId: 'edge',
      edge: f.first.edge,
      hovered: true,
      scissorsVisible: false,
      exiting: false,
      position: null,
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(requestFrame).not.toHaveBeenCalled();
    expect(f.api.getTotalLength).not.toHaveBeenCalled();
  },
);

it.each([
  ['document', { documentKey: 'other' }, { documentKey: 'doc' }],
  ['readiness', { ready: false }, { ready: true }],
  ['readonly', { readonly: true }, { readonly: false }],
  ['disabled', { interactionDisabled: true }, { interactionDisabled: false }],
])('%s A→B→A retires earlier closures and native callbacks', (name, away, back) => {
  const f = fixture();
  const old = f.hook.result.current;
  f.enter();
  const oldFrame = [...frames.values()][0];
  f.advance(999);
  f.change(away);
  expect(f.hook.result.current.hover).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.size).toBe(0);
  f.change(back);
  act(() => {
    old.enter(f.first.edge, f.event(), f.api);
    old.move(f.first.edge, f.event(90), f.api);
    oldFrame();
  });
  f.advance(1000);
  expect(f.hook.result.current.hover).toBeNull();
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
  f.enter();
  act(() => {
    old.leave(f.first.edge);
    old.clear();
  });
  f.advance(999);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it.each(['selectable', 'deletable', 'focusable', 'interactive'])(
  'a %s capability round-trip retires the old entry incarnation',
  (capability) => {
    const f = fixture();
    const old = f.hook.result.current;
    f.enter();
    f.advance(999);
    f.change({
      entries: [{ ...f.first, presentation: { ...f.first.presentation, [capability]: false } }],
    });
    expect(f.hook.result.current.hover).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    f.change({ entries: [f.first, f.second] });
    act(() => old.enter(f.first.edge, f.event(), f.api));
    expect(f.hook.result.current.hover).toBeNull();
    f.enter();
    f.advance(1000);
    expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
  },
);

it('replacing an edge with the same ID rejects both the prior edge and its pending RAF', () => {
  const f = fixture();
  const old = f.hook.result.current;
  f.enter();
  const oldFrame = [...frames.values()][0];
  const replacement = entry();
  f.change({ entries: [replacement] });
  act(() => {
    oldFrame();
    old.enter(f.first.edge, f.event(), f.api);
    f.hook.result.current.enter(f.first.edge, f.event(), f.api);
  });
  expect(f.hook.result.current.hover).toBeNull();
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
  f.enter(replacement);
  act(() => old.leave(replacement.edge));
  f.flush();
  f.advance(1000);
  expect(f.hook.result.current.hover.edge).toBe(replacement.edge);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('unmount cancels work and an old hook instance cannot revive or clear the remounted one', () => {
  const f = fixture();
  const old = f.hook.result.current;
  f.enter();
  const oldFrame = [...frames.values()][0];
  f.hook.unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  const next = fixture({ entries: [f.first] });
  next.enter(f.first);
  act(() => {
    old.enter(f.first.edge, f.event(), f.api);
    old.move(f.first.edge, f.event(90), f.api);
    old.leave(f.first.edge);
    old.clear();
    oldFrame();
  });
  next.flush();
  next.advance(1000);
  expect(next.hook.result.current.hover.edge).toBe(f.first.edge);
  expect(next.hook.result.current.hover.scissorsVisible).toBe(true);
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
});

it('StrictMode effect replay still permits one owned timer and RAF', () => {
  const f = fixture({}, ({ children }) => <StrictMode>{children}</StrictMode>);
  f.enter();
  expect(vi.getTimerCount()).toBe(1);
  expect(frames.size).toBe(1);
  f.flush();
  f.advance(1000);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('coalesces pointer movements into one RAF using the most recent pointer', () => {
  const f = fixture();
  f.enter();
  f.move(f.event(75));
  f.move(f.event(90));
  expect(requestFrame).toHaveBeenCalledOnce();
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 90, y: 0 });
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
});

it('reads the current board rectangle and viewport at RAF execution rather than the earlier event', () => {
  const f = fixture();
  f.enter();
  f.element.getBoundingClientRect.mockReturnValue({ x: 110, y: 60, width: 800, height: 600 });
  f.change({ view: { x: 10, y: 0, z: 1 } });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 25, y: 0 });
});

it('caches 81 coarse arc-length samples and skips movements below 10 world units, including at low zoom', () => {
  const f = fixture();
  f.enter();
  f.flush();
  const sampled = f.api.getPointAtLength.mock.calls.length;
  expect(sampled).toBe(92);
  f.move(f.event(56));
  f.flush();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(sampled);
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  f.move(f.event(60));
  f.flush();
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(sampled + 11);
  expect(f.hook.result.current.hover.position).toEqual({ x: 60, y: 0 });
});

it.each(['foreignObject', 'marked foreignObject', 'marked HTML container'])(
  '%s movements do not let the scissors escape the current native nearest point',
  (container) => {
    const f = fixture();
    f.enter();
    f.flush();
    const foreign =
      container === 'marked HTML container'
        ? document.createElement('div')
        : document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    if (container !== 'foreignObject') foreign.setAttribute('data-edge-cut-container', '');
    const button = document.createElement('button');
    foreign.append(button);
    expect(button.parentElement).toBe(foreign);
    f.move(f.event(90, 20, button));
    expect(frames.size).toBe(0);
    expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
    expect(f.api.getPointAtLength).toHaveBeenCalledTimes(92);
  },
);

it('a path change on the same edge rebuilds lookup and reprojects the last pointer without resetting hover time', () => {
  const f = fixture();
  f.enter();
  f.flush();
  f.advance(999);
  f.api.getPointAtLength.mockImplementation((length) => ({ x: length, y: 30 }));
  f.change({ entries: [{ ...f.first, geometry: { ...f.first.geometry, path: 'M0,30 L100,30' } }] });
  expect(frames.size).toBe(1);
  f.flush();
  expect(f.api.getTotalLength).toHaveBeenCalledTimes(2);
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(184);
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 30 });
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('a replacement native path invalidates cached samples even with the same geometry and pointer', () => {
  const f = fixture();
  f.enter();
  f.flush();
  const replacement = path(30);
  f.move(f.event(), f.first, replacement);
  f.flush();
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(replacement.getTotalLength).toHaveBeenCalledOnce();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 30 });
});

it('appearance-only updates preserve the timer, cache and current hover owner', () => {
  const f = fixture();
  f.enter();
  f.flush();
  f.advance(999);
  f.change({
    entries: [
      { ...f.first, presentation: { ...f.first.presentation, strokeWidth: 3, highlighted: true } },
      f.second,
    ],
  });
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
});

it.each(['add', 'remove', 'capability'])(
  'a quiet sibling %s preserves the hovered edge timer and cache',
  (action) => {
    const f = fixture();
    const original = f.hook.result.current;
    f.enter();
    f.flush();
    f.advance(999);
    const entries =
      action === 'add'
        ? [f.first, f.second, entry('third')]
        : action === 'remove'
          ? [f.first]
          : [
              f.first,
              { ...f.second, presentation: { ...f.second.presentation, selectable: false } },
            ];
    f.change({ entries });
    expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
    act(() => original.move(f.first.edge, f.event(60), f.api));
    f.flush();
    expect(f.api.getTotalLength).toHaveBeenCalledOnce();
    expect(f.hook.result.current.hover.position).toEqual({ x: 60, y: 0 });
    f.advance(1);
    expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
  },
);

it('removing and reinserting the exact same edge object does not revive its earlier incarnation', () => {
  const f = fixture();
  const old = f.hook.result.current;
  f.enter();
  const oldFrame = [...frames.values()][0];
  f.advance(999);
  f.change({ entries: [f.second] });
  f.change({ entries: [f.first, f.second] });
  act(() => {
    old.enter(f.first.edge, f.event(), f.api);
    old.move(f.first.edge, f.event(90), f.api);
    oldFrame();
  });
  expect(f.hook.result.current.hover).toBeNull();
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
  f.enter();
  act(() => {
    old.leave(f.first.edge);
    old.clear();
  });
  f.advance(999);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('an explicitly invoked cancelled timeout cannot make scissors appear on a later same-ID incarnation', () => {
  const spy = vi.spyOn(globalThis, 'setTimeout');
  const f = fixture();
  f.enter();
  const cancelledTimeout = spy.mock.calls.find((call) => call[1] === 1000)[0];
  f.leave();
  f.enter();
  act(() => cancelledTimeout());
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(999);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it.each([0, -1, NaN, Infinity])('invalid viewport zoom %s never samples the native path', (z) => {
  const f = fixture({ view: { x: 20, y: 30, z } });
  f.enter();
  f.flush();
  expect(f.hook.result.current.hover.position).toBeNull();
  expect(f.api.getTotalLength).not.toHaveBeenCalled();
});

it('a missing board or failed native path is contained and cannot retain an earlier scissors position', () => {
  const f = fixture();
  f.enter();
  f.flush();
  f.api.getTotalLength.mockImplementation(() => {
    throw new Error('native path detached');
  });
  f.change({ entries: [{ ...f.first, geometry: { ...f.first.geometry, path: 'invalid path' } }] });
  expect(() => f.flush()).not.toThrow();
  expect(f.hook.result.current.hover.position).toBeNull();
  f.change({ board: { current: null } });
  f.move(f.event(90));
  expect(() => f.flush()).not.toThrow();
  expect(f.hook.result.current.hover.position).toBeNull();
});

it('hover, leave and timer completion never mutate the graph or viewport', () => {
  const first = entry();
  Object.freeze(first.edge);
  Object.freeze(first.geometry.source);
  Object.freeze(first.geometry.target);
  Object.freeze(first.geometry);
  Object.freeze(first.presentation);
  Object.freeze(first);
  const view = Object.freeze({ x: 20, y: 30, z: 0.5 });
  const f = fixture({ entries: Object.freeze([first]), view });
  const before = JSON.stringify({ first, view });
  f.enter(first);
  f.flush();
  f.advance(1000);
  f.leave(first);
  expect(JSON.stringify({ first, view })).toBe(before);
});

it('uses the painted CTM at the 150 ms midpoint of a 300 ms fit, ignoring the final viewport and board guess', () => {
  const f = fixture({ view: { x: 500, y: 600, z: 2 } });
  const startInverse = { a: 4, b: 0, c: 0, d: 4, e: -400, f: -200 };
  const midpointInverse = { a: 4 / 3, b: 0, c: 0, d: 4 / 3, e: -440 / 3, f: -80 };
  let painted = { a: 0.25, b: 0, c: 0, d: 0.25, e: 100, f: 50, inverse: () => startInverse };
  f.api.getScreenCTM = vi.fn(() => painted);
  const pointer = { clientX: 147.5, clientY: 75, target: f.element };
  f.enter(f.first, pointer);
  expect(f.api.getScreenCTM).not.toHaveBeenCalled();
  f.advance(150);
  painted = {
    a: 0.75,
    b: 0,
    c: 0,
    d: 0.75,
    e: 110,
    f: 60,
    inverse: vi.fn(() => midpointInverse),
  };
  f.flush();
  expect(painted.inverse).toHaveBeenCalledOnce();
  expect(f.api.getScreenCTM).toHaveBeenCalledOnce();
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(849);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(false);
  f.advance(1);
  expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
});

it('a valid native CTM works without a board and despite an invalid final viewport', () => {
  const f = fixture({ board: { current: null }, view: { x: NaN, y: Infinity, z: 0 } });
  const inverse = { a: 0.5, b: 0, c: 0, d: 0.25, e: -10, f: -20 };
  f.api.getScreenCTM = vi.fn(() => ({
    a: 2,
    b: 0,
    c: 0,
    d: 4,
    e: 20,
    f: 80,
    inverse: vi.fn(() => inverse),
  }));
  f.enter(f.first, { clientX: 120, clientY: 160, target: f.element });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
});

it('the actual rotated nonuniform ancestor matrix transforms both pointer axes before arc-length projection', () => {
  const f = fixture({ view: { x: 300, y: 400, z: 3 } });
  // Forward: (x,y) -> (300 - 3y, 100 + 2x). Pointer (240,200) is world (50,20).
  // The diagonal segment's hardcoded nearest point is (35,35), not either screen axis.
  const diagonal = {
    getTotalLength: vi.fn(() => 100 * Math.SQRT2),
    getPointAtLength: vi.fn((length) => ({ x: length / Math.SQRT2, y: length / Math.SQRT2 })),
    getScreenCTM: vi.fn(() => ({
      a: 0,
      b: 2,
      c: -3,
      d: 0,
      e: 300,
      f: 100,
      inverse: () => ({ a: 0, b: -1 / 3, c: 0.5, d: 0, e: -50, f: 100 }),
    })),
  };
  f.enter(f.first, { clientX: 240, clientY: 200, target: f.element }, diagonal);
  f.flush();
  expect(f.hook.result.current.hover.position.x).toBeCloseTo(35, 10);
  expect(f.hook.result.current.hover.position.y).toBeCloseTo(35, 10);
  expect(diagonal.getTotalLength).toHaveBeenCalledOnce();
  expect(diagonal.getPointAtLength).toHaveBeenCalledTimes(92);
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
});

it('handles cross-axis shear combined with ancestor scale using the complete inverse rather than only scale and translation', () => {
  const f = fixture({ view: { x: -500, y: 900, z: 0.1 } });
  // Forward: (x,y) -> (2x+y+100, x+3y+50); (50,20) -> (220,160).
  const diagonal = {
    getTotalLength: vi.fn(() => 100 * Math.SQRT2),
    getPointAtLength: vi.fn((length) => ({ x: length / Math.SQRT2, y: length / Math.SQRT2 })),
    getScreenCTM: vi.fn(() => ({
      a: 2,
      b: 1,
      c: 1,
      d: 3,
      e: 100,
      f: 50,
      inverse: () => ({ a: 0.6, b: -0.2, c: -0.2, d: 0.4, e: -50, f: 0 }),
    })),
  };
  f.enter(f.first, { clientX: 220, clientY: 160, target: f.element }, diagonal);
  f.flush();
  expect(f.hook.result.current.hover.position.x).toBeCloseTo(35, 10);
  expect(f.hook.result.current.hover.position.y).toBeCloseTo(35, 10);
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
});

it.each([
  'null CTM',
  'CTM throws',
  'inverse throws',
  'inverse null',
  'missing inverse',
  'singular native inverse',
  'nonfinite inverse',
])(
  '%s clears a previous position without a board fallback, then recovers with the identical pointer',
  (failure) => {
    const f = fixture();
    const inverse = { a: 10, b: 0, c: 0, d: 10, e: -2000, f: -3000 };
    const valid = { a: 0.1, b: 0, c: 0, d: 0.1, e: 200, f: 300, inverse: () => inverse };
    f.api.getScreenCTM = vi.fn(() => valid);
    const pointer = { clientX: 205, clientY: 302, target: f.element };
    f.enter(f.first, pointer);
    f.flush();
    f.advance(1000);
    expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
    expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
    if (failure === 'null CTM') f.api.getScreenCTM.mockReturnValue(null);
    else if (failure === 'CTM throws')
      f.api.getScreenCTM.mockImplementation(() => {
        throw new Error('detached SVG');
      });
    else if (failure === 'inverse throws')
      f.api.getScreenCTM.mockReturnValue({
        a: 0,
        b: 0,
        c: 0,
        d: 0,
        e: 200,
        f: 300,
        inverse: () => {
          throw new Error('singular screen matrix');
        },
      });
    else if (failure === 'inverse null')
      f.api.getScreenCTM.mockReturnValue({ ...valid, inverse: () => null });
    else if (failure === 'missing inverse')
      f.api.getScreenCTM.mockReturnValue({ a: 0.1, b: 0, c: 0, d: 0.1, e: 200, f: 300 });
    else if (failure === 'singular native inverse')
      f.api.getScreenCTM.mockReturnValue({
        a: 0,
        b: 0,
        c: 0,
        d: 0,
        e: 200,
        f: 300,
        inverse: () => ({ a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }),
      });
    else
      f.api.getScreenCTM.mockReturnValue({
        ...valid,
        inverse: () => ({ a: 10, b: 0, c: 0, d: Infinity, e: -2000, f: -3000 }),
      });
    f.move(pointer);
    expect(() => f.flush()).not.toThrow();
    expect(f.hook.result.current.hover.position).toBeNull();
    expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
    expect(f.api.getTotalLength).toHaveBeenCalledOnce();
    expect(f.api.getPointAtLength).toHaveBeenCalledTimes(92);
    f.api.getScreenCTM.mockReturnValue(valid);
    f.move(pointer);
    f.flush();
    expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
    expect(f.hook.result.current.hover.scissorsVisible).toBe(true);
    expect(f.api.getTotalLength).toHaveBeenCalledOnce();
    expect(f.api.getPointAtLength).toHaveBeenCalledTimes(103);
  },
);

it('CTM frames retain the 81-point cache and the strict 10-world-unit movement boundary at 10% zoom', () => {
  const f = fixture();
  f.api.getScreenCTM = vi.fn(() => ({
    a: 0.1,
    b: 0,
    c: 0,
    d: 0.1,
    e: 200,
    f: 300,
    inverse: () => ({ a: 10, b: 0, c: 0, d: 10, e: -2000, f: -3000 }),
  }));
  f.enter(f.first, { clientX: 205, clientY: 302, target: f.element });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  f.move({ clientX: 205.6, clientY: 302, target: f.element });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(92);
  f.move({ clientX: 206, clientY: 302, target: f.element });
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 60, y: 0 });
  expect(f.api.getScreenCTM).toHaveBeenCalledTimes(3);
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(103);
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
});

it('reprojects an identical client pointer when the painted CTM changes, retaining the native arc-length cache', () => {
  const f = fixture();
  let inverse = { a: 10, b: 0, c: 0, d: 10, e: -2000, f: -3000 };
  let paintedX = 200;
  f.api.getScreenCTM = vi.fn(() => ({
    a: 0.1,
    b: 0,
    c: 0,
    d: 0.1,
    e: paintedX,
    f: 300,
    inverse: () => inverse,
  }));
  const pointer = { clientX: 205, clientY: 302, target: f.element };
  f.enter(f.first, pointer);
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  paintedX = 195;
  inverse = { a: 10, b: 0, c: 0, d: 10, e: -1950, f: -3000 };
  f.move(pointer);
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 100, y: 0 });
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(103);
  expect(f.element.getBoundingClientRect).not.toHaveBeenCalled();
});

it('uses the legacy board/view adapter only when the arc-length path has no CTM API at all', () => {
  const f = fixture();
  expect('getScreenCTM' in f.api).toBe(false);
  f.enter();
  f.flush();
  expect(f.hook.result.current.hover.position).toEqual({ x: 50, y: 0 });
  expect(f.element.getBoundingClientRect).toHaveBeenCalledOnce();
  expect(f.api.getTotalLength).toHaveBeenCalledOnce();
  expect(f.api.getPointAtLength).toHaveBeenCalledTimes(92);
});
