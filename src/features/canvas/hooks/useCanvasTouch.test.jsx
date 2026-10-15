import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasPointer } from './useCanvasPointer.js';
import { useCanvasTouch } from './useCanvasTouch.js';

afterEach(() => vi.useRealTimers());

function setup(patch = {}) {
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 20, top: 30, width: 800, height: 600 });
  const node = document.createElement('article');
  node.className = 'cv-node';
  board.append(node);
  document.body.append(board);
  const options = {
    board: { current: board },
    storageKey: 'doc',
    readonly: false,
    documentReady: true,
    viewRef: { current: { x: 30, y: 40, z: 0.5 } },
    cancelPointer: vi.fn(),
    setMenu: vi.fn(),
    setContext: vi.fn(),
    setLinking: vi.fn(),
    onFit: vi.fn(),
    ...patch,
  };
  options.setView = vi.fn((view) => {
    options.viewRef.current = typeof view === 'function' ? view(options.viewRef.current) : view;
  });
  const page = renderHook(() => useCanvasTouch(options));
  options.cancelPointer.mockClear();
  const touch = (id, x, y, target = board) => ({
    identifier: id,
    clientX: x + 20,
    clientY: y + 30,
    target,
  });
  const dispatch = (type, touches, changedTouches = touches, target = board) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: touches },
      changedTouches: { value: changedTouches },
    });
    act(() => target.dispatchEvent(event));
    return event;
  };
  const cleanup = () => {
    page.unmount();
    board.remove();
  };
  return { page, board, node, options, touch, dispatch, cleanup };
}

describe('native canvas touch ownership', () => {
  it('rejects a late native touch move immediately when the caller switches its document owner', () => {
    const p = setup();
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    p.dispatch('touchmove', [p.touch(1, 130, 140)]);
    p.options.storageKey = 'new-document';
    p.options.viewRef.current = { x: 800, y: 900, z: 1 };
    p.options.setView.mockClear();
    const late = p.dispatch('touchmove', [p.touch(1, 500, 500)]);
    expect(late.defaultPrevented).toBe(false);
    expect(p.options.viewRef.current).toEqual({ x: 800, y: 900, z: 1 });
    expect(p.options.setView).not.toHaveBeenCalled();
    p.page.rerender();
    expect(p.board.classList.contains('cv-panning')).toBe(false);
    p.cleanup();
  });
  it('pans a blank board on an actual touch even when the primary device is not coarse', () => {
    const p = setup();
    expect(p.page.result.current.touchMode).toBe(false);
    const first = p.touch(1, 100, 100);
    p.dispatch('touchstart', [first]);
    expect(p.options.setMenu).toHaveBeenCalledWith(null);
    const move = p.dispatch('touchmove', [p.touch(1, 130, 140)]);
    expect(move.defaultPrevented).toBe(true);
    expect(p.options.viewRef.current).toEqual({ x: 60, y: 80, z: 0.5 });
    p.dispatch('touchend', [], [p.touch(1, 140, 150)]);
    expect(p.options.viewRef.current).toEqual({ x: 70, y: 90, z: 0.5 });
    expect(p.board.classList.contains('cv-panning')).toBe(false);
    expect(
      p.page.result.current.shouldSuppressTouchClick({ detail: 1, pointerType: 'touch' }),
    ).toBe(true);
    expect(
      p.page.result.current.shouldSuppressTouchClick({ detail: 1, pointerType: 'touch' }),
    ).toBe(false);
    p.cleanup();
  });
  it('combines two-finger pinch and translation then continues one-finger pan without a jump', () => {
    const p = setup();
    const first = p.touch(1, 100, 100);
    const second = p.touch(2, 200, 100);
    p.dispatch('touchstart', [first]);
    const begin = p.dispatch('touchstart', [first, second], [second]);
    expect(begin.defaultPrevented).toBe(true);
    expect(p.options.cancelPointer).toHaveBeenCalledTimes(2);
    const left = p.touch(1, 130, 150);
    const right = p.touch(2, 330, 150);
    p.dispatch('touchmove', [left, right]);
    expect(p.options.viewRef.current).toEqual({ x: -10, y: 30, z: 1 });
    p.dispatch('touchend', [left], [right]);
    expect(p.options.viewRef.current).toEqual({ x: -10, y: 30, z: 1 });
    p.dispatch('touchmove', [p.touch(1, 150, 170)]);
    expect(p.options.viewRef.current).toEqual({ x: 10, y: 50, z: 1 });
    p.dispatch('touchend', [], [p.touch(1, 150, 170)]);
    expect(p.options.onFit).not.toHaveBeenCalled();
    p.cleanup();
  });
  it('preserves one-finger node pointer ownership but hands two fingers to the viewport', () => {
    const p = setup();
    p.dispatch('touchstart', [p.touch(1, 100, 100, p.node)], undefined, p.node);
    expect(p.options.cancelPointer).not.toHaveBeenCalled();
    const move = p.dispatch('touchmove', [p.touch(1, 120, 130, p.node)], undefined, p.node);
    expect(move.defaultPrevented).toBe(true);
    expect(p.options.setView).not.toHaveBeenCalled();
    const first = p.touch(1, 120, 130, p.node);
    const second = p.touch(2, 220, 130, p.node);
    p.dispatch('touchstart', [first, second], [second], p.node);
    expect(p.options.cancelPointer).toHaveBeenCalledOnce();
    p.dispatch(
      'touchmove',
      [p.touch(1, 100, 130, p.node), p.touch(2, 260, 130, p.node)],
      undefined,
      p.node,
    );
    expect(p.options.setView).toHaveBeenCalledOnce();
    p.cleanup();
  });
  it.each([{ readonly: true }, { tool: 'hand' }, { space: { current: true } }])(
    'pans a non-UI node surface for %j without losing readonly selection semantics',
    (patch) => {
      const p = setup(patch);
      p.dispatch('touchstart', [p.touch(1, 100, 100, p.node)], undefined, p.node);
      p.dispatch('touchmove', [p.touch(1, 120, 130, p.node)], undefined, p.node);
      expect(p.options.viewRef.current).toEqual({ x: 50, y: 70, z: 0.5 });
      p.cleanup();
    },
  );
  it.each([
    'textarea',
    'video',
    'button',
    'input',
    'contenteditable',
    'nopan',
    'nowheel',
    'scroll',
  ])('keeps %s native scrolling and gestures outside the board writer', (kind) => {
    const p = setup();
    const control = document.createElement(
      ['contenteditable', 'nopan', 'nowheel', 'scroll'].includes(kind) ? 'div' : kind,
    );
    if (kind === 'contenteditable') control.setAttribute('contenteditable', 'true');
    if (kind === 'nopan' || kind === 'nowheel') control.className = kind;
    if (kind === 'scroll') {
      control.style.overflowY = 'auto';
      Object.defineProperties(control, {
        scrollHeight: { value: 200 },
        clientHeight: { value: 100 },
      });
    }
    p.node.append(control);
    const first = p.touch(1, 100, 100, control);
    const start = p.dispatch('touchstart', [first], undefined, control);
    const move = p.dispatch('touchmove', [p.touch(1, 100, 150, control)], undefined, control);
    const end = p.dispatch('touchend', [], [p.touch(1, 100, 150, control)], control);
    expect([start.defaultPrevented, move.defaultPrevented, end.defaultPrevented]).toEqual([
      false,
      false,
      false,
    ]);
    expect(p.options.setView).not.toHaveBeenCalled();
    expect(p.options.cancelPointer).not.toHaveBeenCalled();
    p.cleanup();
  });
  it('yields an existing node gesture when another finger belongs to an input', () => {
    const p = setup();
    const input = document.createElement('textarea');
    p.node.append(input);
    const first = p.touch(1, 100, 100, p.node);
    p.dispatch('touchstart', [first], undefined, p.node);
    const second = p.touch(2, 220, 130, input);
    const start = p.dispatch('touchstart', [first, second], [second], input);
    const move = p.dispatch('touchmove', [first, second], undefined, p.node);
    expect(start.defaultPrevented).toBe(false);
    expect(move.defaultPrevented).toBe(false);
    expect(p.options.cancelPointer).toHaveBeenCalledOnce();
    expect(p.options.setView).not.toHaveBeenCalled();
    p.cleanup();
  });
  it('ignores a third touch rather than changing the chosen pinch anchors', () => {
    const p = setup();
    const first = p.touch(1, 100, 100);
    const second = p.touch(2, 200, 100);
    p.dispatch('touchstart', [first, second]);
    p.dispatch('touchstart', [first, second, p.touch(3, 900, 900)]);
    p.dispatch('touchmove', [first, second, p.touch(3, 1900, 1900)]);
    expect(p.options.viewRef.current).toEqual({ x: 30, y: 40, z: 0.5 });
    p.cleanup();
  });
  it('does not consume a fresh UI tap after suppressing an earlier board gesture', () => {
    const p = setup();
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    p.dispatch('touchmove', [p.touch(1, 130, 140)]);
    p.dispatch('touchend', [], [p.touch(1, 130, 140)]);
    const input = document.createElement('textarea');
    p.node.append(input);
    p.dispatch('touchstart', [p.touch(2, 100, 100, input)], undefined, input);
    expect(
      p.page.result.current.shouldSuppressTouchClick({ detail: 1, pointerType: 'touch' }),
    ).toBe(false);
    p.cleanup();
  });
  it.each([{ storageKey: 'other' }, { readonly: true }, { documentReady: false }])(
    'cancels a changed boundary %j before old touches can write a new view',
    (patch) => {
      const p = setup();
      p.dispatch('touchstart', [p.touch(1, 100, 100)]);
      Object.assign(p.options, patch);
      p.page.rerender();
      p.options.setView.mockClear();
      p.dispatch('touchmove', [p.touch(1, 900, 900)]);
      p.dispatch('touchend', [], [p.touch(1, 900, 900)]);
      expect(p.options.setView).not.toHaveBeenCalled();
      expect(p.board.classList.contains('cv-panning')).toBe(false);
      expect(p.options.onFit).not.toHaveBeenCalled();
      p.cleanup();
    },
  );
  it.each(['touchcancel', 'blur'])(
    'clears %s without applying its false final touch coordinates',
    (type) => {
      const p = setup();
      p.dispatch('touchstart', [p.touch(1, 100, 100)]);
      p.dispatch('touchmove', [p.touch(1, 110, 120)]);
      if (type === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else p.dispatch('touchcancel', [], [p.touch(1, 1000, 1000)]);
      p.dispatch('touchmove', [p.touch(1, 2000, 2000)]);
      expect(p.options.viewRef.current).toEqual({ x: 40, y: 60, z: 0.5 });
      expect(p.board.classList.contains('cv-panning')).toBe(false);
      p.cleanup();
    },
  );
  it('fits only two stationary taps on the same blank target within the source 300ms interval', () => {
    vi.useFakeTimers();
    const p = setup();
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    p.dispatch('touchend', [], [p.touch(1, 102, 101)]);
    act(() => vi.advanceTimersByTime(150));
    p.dispatch('touchstart', [p.touch(2, 100, 100)]);
    const end = p.dispatch('touchend', [], [p.touch(2, 100, 100)]);
    expect(end.defaultPrevented).toBe(true);
    expect(p.options.onFit).toHaveBeenCalledExactlyOnceWith({ padding: 0.15, duration: 300 });
    expect(p.page.result.current.shouldSuppressTouchClick({ detail: 0 })).toBe(false);
    expect(
      p.page.result.current.shouldSuppressTouchClick({ detail: 1, pointerType: 'mouse' }),
    ).toBe(false);
    expect(p.page.result.current.shouldSuppressTouchClick({ detail: 1 })).toBe(true);
    p.cleanup();
  });
  it('does not interpret a drag, pinch, node tap or different blank target as double fit', () => {
    vi.useFakeTimers();
    const p = setup();
    const other = document.createElement('div');
    p.board.append(other);
    const tap = (target, id) => {
      const point = p.touch(id, 100, 100, target);
      p.dispatch('touchstart', [point], undefined, target);
      p.dispatch('touchend', [], [point], target);
      act(() => vi.advanceTimersByTime(100));
    };
    tap(p.board, 1);
    tap(other, 2);
    tap(p.node, 3);
    tap(p.board, 4);
    p.dispatch('touchstart', [p.touch(5, 100, 100)]);
    p.dispatch('touchmove', [p.touch(5, 104, 100)]);
    p.dispatch('touchend', [], [p.touch(5, 104, 100)]);
    tap(p.board, 6);
    p.dispatch('touchstart', [p.touch(7, 100, 100), p.touch(8, 200, 100)]);
    p.dispatch('touchend', [], [p.touch(7, 100, 100), p.touch(8, 200, 100)]);
    tap(p.board, 9);
    expect(p.options.onFit).not.toHaveBeenCalled();
    p.cleanup();
  });
  it('does not take over loading documents or retain handlers after unmount', () => {
    const p = setup({ documentReady: false });
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    const move = p.dispatch('touchmove', [p.touch(1, 110, 120)]);
    expect(move.defaultPrevented).toBe(false);
    p.page.unmount();
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    p.dispatch('touchmove', [p.touch(1, 1000, 1000)]);
    expect(p.options.setView).not.toHaveBeenCalled();
    p.board.remove();
  });
  it('subscribes to coarse device changes and removes the exact listener on cleanup', () => {
    let changed;
    const media = {
      matches: true,
      addEventListener: vi.fn((type, listener) => {
        changed = listener;
      }),
      removeEventListener: vi.fn(),
    };
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => media);
    const p = setup();
    expect(p.page.result.current.touchMode).toBe(true);
    p.dispatch('touchstart', [p.touch(1, 100, 100)]);
    media.matches = false;
    act(() => changed());
    expect(p.page.result.current.touchMode).toBe(false);
    p.dispatch('touchmove', [p.touch(1, 1000, 1000)]);
    expect(p.options.setView).not.toHaveBeenCalled();
    p.cleanup();
    expect(media.removeEventListener).toHaveBeenCalledExactlyOnceWith('change', changed);
    window.matchMedia = original;
  });
  it('stops the real node pointer writer before the second finger starts pinch', () => {
    const board = document.createElement('main');
    const node = document.createElement('article');
    node.className = 'cv-node';
    board.append(node);
    document.body.append(board);
    board.getBoundingClientRect = () => ({ left: 0, top: 0 });
    node.setPointerCapture = vi.fn();
    node.releasePointerCapture = vi.fn();
    const options = {
      board: { current: board },
      storageKey: 'doc',
      readonly: false,
      documentReady: true,
      nodes: [{ id: 'node', position: { x: 100, y: 200 } }],
      selected: ['node'],
      space: { current: false },
      viewRef: { current: { x: 0, y: 0, z: 1 } },
      setMenu: vi.fn(),
      setContext: vi.fn(),
      setLinking: vi.fn(),
      setSelected: vi.fn(),
      setSelectionRect: vi.fn(),
      record: vi.fn(),
    };
    options.setView = vi.fn((view) => {
      options.viewRef.current = view;
    });
    options.setNodes = vi.fn((next) => {
      options.nodes = next(options.nodes);
    });
    const page = renderHook(() => {
      const pointer = useCanvasPointer(options);
      const touch = useCanvasTouch({ ...options, cancelPointer: pointer.cancel });
      return { pointer, touch };
    });
    const pointerEvent = (type, x) => ({
      type,
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: x,
      clientY: 0,
      target: node,
      currentTarget: node,
      stopPropagation: vi.fn(),
    });
    act(() => page.result.current.pointer.drag(pointerEvent('pointerdown', 100), options.nodes[0]));
    const native = (type, touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: touches },
      });
      act(() => node.dispatchEvent(event));
    };
    const first = { identifier: 1, clientX: 100, clientY: 0, target: node };
    native('touchstart', [first]);
    act(() => page.result.current.pointer.move(pointerEvent('pointermove', 110)));
    expect(options.nodes[0].position.x).toBe(110);
    expect(options.record).toHaveBeenCalledOnce();
    native('touchstart', [
      { ...first, clientX: 110 },
      { identifier: 2, clientX: 210, clientY: 0, target: node },
    ]);
    expect(page.result.current.pointer.draggingNode).toBe(false);
    expect(node.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    act(() => page.result.current.pointer.move(pointerEvent('pointermove', 1000)));
    expect(options.nodes[0].position.x).toBe(110);
    native('touchmove', [
      { ...first, clientX: 80 },
      { identifier: 2, clientX: 240, clientY: 0, target: node },
    ]);
    expect(options.viewRef.current.z).toBeCloseTo(1.6);
    expect(options.record).toHaveBeenCalledOnce();
    page.unmount();
    board.remove();
  });

  it('keeps one-finger selection overlay dragging with the pointer owner until a second finger takes over pinch', () => {
    const board = document.createElement('main'),
      overlay = document.createElement('div'),
      fill = document.createElement('div'),
      edge = document.createElement('div');
    overlay.className = 'cv-selection-overlay';
    fill.className = 'cv-selection-overlay-fill';
    edge.className = 'cv-selection-overlay-hit is-right-top';
    overlay.append(fill, edge);
    board.append(overlay);
    document.body.append(board);
    board.getBoundingClientRect = () => ({ left: 0, top: 0 });
    fill.setPointerCapture = vi.fn();
    fill.releasePointerCapture = vi.fn();
    const options = {
      board: { current: board },
      storageKey: 'doc',
      readonly: false,
      documentReady: true,
      nodes: [
        { id: 'a', position: { x: 100, y: 200 } },
        { id: 'b', position: { x: 400, y: 500 } },
      ],
      selected: ['a', 'b'],
      space: { current: false },
      viewRef: { current: { x: 0, y: 0, z: 1 } },
      setMenu: vi.fn(),
      setContext: vi.fn(),
      setLinking: vi.fn(),
      setSelected: vi.fn(),
      setSelectionRect: vi.fn(),
      record: vi.fn(),
    };
    options.setView = vi.fn((view) => {
      options.viewRef.current = view;
    });
    options.setNodes = vi.fn((next) => {
      options.nodes = next(options.nodes);
    });
    const cancelPointer = vi.fn();
    const page = renderHook(() => {
      const pointer = useCanvasPointer(options);
      cancelPointer.mockImplementation(pointer.cancel);
      const touch = useCanvasTouch({ ...options, cancelPointer });
      return { pointer, touch };
    });
    cancelPointer.mockClear();
    const pointerEvent = (type, x) => ({
      type,
      pointerType: 'touch',
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: x,
      clientY: 0,
      target: fill,
      currentTarget: fill,
      stopPropagation: vi.fn(),
    });
    const native = (type, touches, changedTouches = touches, target = fill) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: changedTouches },
      });
      act(() => target.dispatchEvent(event));
      return event;
    };
    const first = { identifier: 1, clientX: 100, clientY: 0, target: fill };
    act(() =>
      page.result.current.pointer.dragSelection(pointerEvent('pointerdown', 100), ['a', 'b']),
    );
    native('touchstart', [first]);
    expect(cancelPointer).not.toHaveBeenCalled();
    const movedFirst = { ...first, clientX: 130 };
    expect(native('touchmove', [movedFirst]).defaultPrevented).toBe(true);
    act(() => page.result.current.pointer.move(pointerEvent('pointermove', 130)));
    expect(options.nodes.map((node) => node.position)).toEqual([
      { x: 130, y: 200 },
      { x: 430, y: 500 },
    ]);
    expect(options.setView).not.toHaveBeenCalled();
    expect(cancelPointer).not.toHaveBeenCalled();
    expect(options.record).toHaveBeenCalledOnce();
    expect(page.result.current.pointer.draggingNode).toBe(true);

    const second = { identifier: 2, clientX: 230, clientY: 0, target: edge };
    expect(native('touchstart', [movedFirst, second], [second], edge).defaultPrevented).toBe(true);
    expect(cancelPointer).toHaveBeenCalledOnce();
    expect(page.result.current.pointer.draggingNode).toBe(false);
    expect(fill.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    act(() => {
      page.result.current.pointer.move(pointerEvent('pointermove', 1000));
      page.result.current.pointer.end(pointerEvent('pointerup', 1000));
    });
    expect(options.nodes.map((node) => node.position)).toEqual([
      { x: 130, y: 200 },
      { x: 430, y: 500 },
    ]);
    native('touchmove', [
      { ...first, clientX: 100 },
      { ...second, clientX: 260 },
    ]);
    expect(options.viewRef.current.z).toBeCloseTo(1.6);
    expect(options.setView).toHaveBeenCalledOnce();
    expect(options.record).toHaveBeenCalledOnce();
    page.unmount();
    board.remove();
  });
});
