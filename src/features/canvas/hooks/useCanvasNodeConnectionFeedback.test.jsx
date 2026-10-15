import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasNodeConnectionFeedback } from './useCanvasNodeConnectionFeedback.js';

let frames;
let sequence;
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  sequence = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const initial = {
  nodeId: 'b',
  documentKey: 'A',
  gestureId: 1,
  active: true,
  originIds: ['a'],
  edges: [],
  hoveredNodeId: 'b',
  cursor: { x: 300, y: 150 },
};
function setup(options = initial, wrapper) {
  const view = renderHook((value) => useCanvasNodeConnectionFeedback(value), {
    initialProps: options,
    wrapper,
  });
  const element = document.createElement('article');
  element.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 });
  view.result.current.elementRef.current = element;
  // The first effect runs before renderHook can attach its ref. A mounted view
  // attaches the ref in commit, so emulate its next controlled cursor sample.
  view.rerender({ ...options, cursor: { ...options.cursor } });
  return { ...view, element };
}
const flush = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(16));
  });

describe('captured pointer source feedback and view-only tilt', () => {
  it('tilts from a controlled physical hover with one frame for repeated pointer samples', () => {
    const view = setup({ ...initial, hoveredNodeId: null });
    view.rerender(initial);
    view.rerender({ ...initial, cursor: { x: 300, y: 150 } });
    expect(frames.size).toBe(1);
    flush();
    expect(view.result.current.isConnectionTarget).toBe(true);
    expect(view.result.current.tiltStyle).toEqual({
      transform: 'perspective(800px) rotateX(-8deg) rotateY(8deg)',
      transformOrigin: 'center center',
      transition: 'transform 80ms ease-out',
    });
  });
  it('treats controlled null as outside even when local mouse events fire on the capture origin', () => {
    const view = setup({ ...initial, hoveredNodeId: null });
    act(() => {
      view.result.current.onMouseEnter();
      view.result.current.onMouseMove({ clientX: 300, clientY: 150, currentTarget: view.element });
    });
    expect(view.result.current.isConnectionTarget).toBe(false);
    expect(view.result.current.tiltStyle).toEqual({});
    expect(frames.size).toBe(0);
  });
  it('returns to flat over 400ms on leave then removes the temporary transform', () => {
    const view = setup({ ...initial, hoveredNodeId: null });
    view.rerender(initial);
    flush();
    view.rerender({ ...initial, hoveredNodeId: null });
    expect(view.result.current.tiltStyle.transform).toBe(
      'perspective(800px) rotateX(0deg) rotateY(0deg)',
    );
    expect(view.result.current.tiltStyle.transition).toBe('transform 400ms ease-out');
    act(() => vi.advanceTimersByTime(399));
    expect(view.result.current.tiltStyle.transition).toBe('transform 400ms ease-out');
    act(() => vi.advanceTimersByTime(1));
    expect(view.result.current.tiltStyle).toEqual({});
  });
  it('invalidates queued tilt immediately when an edge or explicit invalid target changes', () => {
    const view = setup({ ...initial, hoveredNodeId: null });
    view.rerender(initial);
    expect(frames.size).toBe(1);
    view.rerender({ ...initial, invalidTargetId: 'b' });
    expect(view.result.current.isConnectionInvalid).toBe(true);
    expect(frames.size).toBe(0);
    flush();
    expect(view.result.current.tiltStyle).toEqual({});
    view.rerender({ ...initial, edges: [{ source: 'b', target: 'a' }] });
    expect(view.result.current.isConnectionBlocked).toBe(true);
    expect(view.result.current.isConnectionInvalid).toBe(false);
    expect(frames.size).toBe(0);
  });
  it.each([{ documentKey: 'B' }, { nodeId: 'c' }, { gestureId: 2 }, { frozen: true }])(
    'prevents a queued old owner from applying any rotation after %j',
    (patch) => {
      const view = setup({ ...initial, hoveredNodeId: null });
      view.rerender(initial);
      const callback = [...frames.values()][0];
      view.rerender({ ...initial, ...patch, hoveredNodeId: null });
      expect(frames.size).toBe(0);
      act(() => callback(16));
      expect(view.result.current.tiltStyle).toEqual({});
    },
  );
  it('does not resurrect a tilt or recovery timer across A to B to A', () => {
    const view = setup({ ...initial, hoveredNodeId: null });
    view.rerender(initial);
    flush();
    view.rerender({ ...initial, hoveredNodeId: null });
    expect(vi.getTimerCount()).toBe(1);
    view.rerender({ ...initial, documentKey: 'B', hoveredNodeId: null });
    view.rerender({ ...initial, hoveredNodeId: null });
    expect(vi.getTimerCount()).toBe(0);
    expect(view.result.current.tiltStyle).toEqual({});
  });
  it('cancels frame and recovery ownership on StrictMode unmount', () => {
    const view = setup({ ...initial, hoveredNodeId: null }, StrictMode);
    view.rerender(initial);
    expect(frames.size).toBe(1);
    flush();
    view.rerender({ ...initial, hoveredNodeId: null });
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('source local mouse semantics for click connection', () => {
  it('ordinary hover shows nodeHovered but never rotates; active mouse-enter waits for a move', () => {
    const view = setup({ ...initial, active: false, hoveredNodeId: undefined, cursor: undefined });
    act(() => view.result.current.onMouseEnter());
    expect(view.result.current.nodeHovered).toBe(true);
    expect(view.result.current.tiltStyle).toEqual({});
    view.rerender({ ...initial, hoveredNodeId: undefined, cursor: undefined });
    expect(view.result.current.nodeHovered).toBe(false);
    expect(view.result.current.isConnectionTarget).toBe(false);
    act(() => view.result.current.onMouseEnter());
    expect(view.result.current.isConnectionTarget).toBe(false);
    act(() =>
      view.result.current.onMouseMove({ clientX: 300, clientY: 150, currentTarget: view.element }),
    );
    flush();
    expect(view.result.current.isConnectionTarget).toBe(true);
    expect(view.result.current.tiltStyle.transform).toContain('rotateY(8deg)');
    act(() => view.result.current.onMouseLeave());
    expect(view.result.current.isConnectionTarget).toBe(false);
  });
  it('ignores a local move without a preceding enter and cannot tilt invalid geometry', () => {
    const view = setup({ ...initial, hoveredNodeId: undefined, cursor: undefined });
    const move = { clientX: 300, clientY: 150, currentTarget: view.element };
    act(() => view.result.current.onMouseMove(move));
    expect(view.result.current.isConnectionTarget).toBe(false);
    view.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 100 });
    act(() => {
      view.result.current.onMouseEnter();
      view.result.current.onMouseMove(move);
    });
    flush();
    expect(view.result.current.tiltStyle.transform).toContain('rotateY(0deg)');
  });
});
