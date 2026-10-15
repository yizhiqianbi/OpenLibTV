import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from '../storyboard/script-model.js';
import { useCanvasReferencePick } from './useCanvasReferencePick.js';

let frames;
beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function harness() {
  const image = (id, x) => ({
    id,
    type: 'image',
    position: { x, y: 0 },
    width: 100,
    height: 100,
    data: { type: 'image', name: id, url: [`/${id}.png`], action: 'image_resource' },
  });
  let graph = {
    documentKey: 'gesture-review',
    ready: true,
    readonly: false,
    models,
    nodes: [
      createCanvasScriptNode({ id: 'script', position: { x: 400, y: 200 }, models }),
      image('a', 0),
      image('b', 150),
      { ...image('left', -90), width: 40 },
    ],
    edges: [],
  };
  let view = { x: 0, y: 0, z: 1 };
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
  const captures = new Set();
  board.setPointerCapture = vi.fn((id) => captures.add(id));
  board.hasPointerCapture = vi.fn((id) => captures.has(id));
  board.releasePointerCapture = vi.fn((id) => captures.delete(id));
  const props = {
    ...graph,
    board: { current: board },
    tool: 'select',
    space: { current: false },
    supportContent: { data: support },
    getDocument: () => graph,
    getView: () => view,
    focusView: vi.fn(),
    flushGraph: vi.fn(() => true),
    setSelected: vi.fn(),
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (graph !== expectedGraph) return false;
      graph = next;
      return true;
    }),
  };
  const hook = renderHook(() => useCanvasReferencePick(props));
  const call = (run) => {
    let result;
    act(() => {
      result = run(hook.result.current);
    });
    return result;
  };
  call((api) => api.enter('script'));
  const event = (x, y, extra = {}) => ({
    target: board,
    currentTarget: board,
    type: 'pointermove',
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: x,
    clientY: y,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra,
  });
  return {
    ...hook,
    props,
    call,
    event,
    board,
    graph: () => graph,
    setView: (next) => {
      view = next;
    },
  };
}

describe('reference pointer and viewport ownership review', () => {
  it('collects the final release rectangle even when the last move event covered fewer references', () => {
    const page = harness();
    page.call((api) => api.beginBox(page.event(-1, -1)));
    page.call((api) => api.moveBox(page.event(101, 101)));
    page.call((api) => api.endBox(page.event(301, 151, { type: 'pointerup' })));
    expect(page.graph().edges.map((edge) => edge.source)).toEqual(['a', 'b']);
  });

  it('converts both source client anchors with the current view after a wheel view change', () => {
    const page = harness();
    page.call((api) => api.beginBox(page.event(0, -1)));
    page.setView({ x: 100, y: 0, z: 1 });
    page.call((api) => api.moveBox(page.event(200, 101)));
    page.call((api) => api.endBox(page.event(200, 101, { type: 'pointerup' })));
    expect(page.graph().edges.map((edge) => edge.source)).toEqual(['a', 'left']);
  });

  it('returns to the target center while preserving the current zoom and source 400ms duration', () => {
    const page = harness();
    page.setView({ x: -50, y: 80, z: 0.3 });
    page.call((api) => api.returnToTarget());
    expect(page.props.focusView).toHaveBeenCalledWith(
      { x: 327.5, y: 287.5, z: 0.3 },
      { duration: 400 },
    );
    expect(page.result.current.active).toBe(false);
    expect(page.props.commitGraph).not.toHaveBeenCalled();
  });

  it.each(['blur', 'visibilitychange'])(
    'retires a transient box on %s so its delayed release cannot mutate the graph',
    (type) => {
      const page = harness();
      page.call((api) => api.beginBox(page.event(-1, -1)));
      page.call((api) => api.moveBox(page.event(301, 151)));
      if (type === 'visibilitychange') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event(type)));
      } else act(() => window.dispatchEvent(new Event(type)));
      expect(page.result.current.boxRect).toBeNull();
      expect(page.call((api) => api.endBox(page.event(301, 151, { type: 'pointerup' })))).toBe(
        false,
      );
      expect(page.graph().edges).toEqual([]);
      expect(page.props.flushGraph).not.toHaveBeenCalled();
      expect(page.board.releasePointerCapture).toHaveBeenCalledWith(1);
    },
  );

  it('does not overwrite the active pen pointer with a second mouse primary pointer', () => {
    const page = harness();
    expect(page.call((api) => api.beginBox(page.event(-1, -1, { pointerType: 'pen' })))).toBe(true);
    page.call((api) => api.moveBox(page.event(301, 151, { pointerType: 'pen' })));
    const rectangle = page.result.current.boxRect;
    expect(page.call((api) => api.beginBox(page.event(900, 500, { pointerId: 2 })))).toBe(true);
    expect(page.result.current.boxRect).toBe(rectangle);
    expect(page.board.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(page.call((api) => api.endBox(page.event(900, 500, { pointerId: 2 })))).toBe(true);
    page.call((api) => api.endBox(page.event(301, 151, { pointerType: 'pen', type: 'pointerup' })));
    expect(page.graph().edges).toHaveLength(2);
  });

  it('ignores a child lostcapture event when this board still owns the active pointer capture', () => {
    const page = harness();
    const child = document.createElement('div');
    page.board.appendChild(child);
    page.call((api) => api.beginBox(page.event(-1, -1)));
    page.call((api) => api.moveBox(page.event(301, 151)));
    const rectangle = page.result.current.boxRect;
    expect(
      page.call((api) =>
        api.endBox(page.event(301, 151, { type: 'lostpointercapture', target: child }), true),
      ),
    ).toBe(true);
    expect(page.result.current.boxRect).toBe(rectangle);
    page.call((api) => api.endBox(page.event(301, 151, { type: 'pointerup' })));
    expect(page.graph().edges).toHaveLength(2);
  });
});
