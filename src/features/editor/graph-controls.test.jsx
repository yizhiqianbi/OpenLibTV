import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGraphPointer } from './useGraphPointer.js';
import { useGraphTouch } from './useGraphTouch.js';
import { useGraphWheel } from './useGraphWheel.js';

const surfaces = [];
afterEach(() => surfaces.splice(0).forEach((element) => element.remove()));
const profile = {
  isolatedSurface: '.film-controls',
  editableSurface: 'button,input,textarea',
  nodeSelector: '.film-spec-node',
  selectionSelector: '.film-selection',
  panningClass: 'film-spec-panning',
};
function surface() {
  const board = document.createElement('main'),
    article = document.createElement('article');
  article.className = 'film-spec-node';
  board.append(article);
  document.body.append(board);
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  for (const element of [board, article]) {
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
  }
  surfaces.push(board);
  return { board, article };
}
function pointerFixture(strategies = {}) {
  const { board, article } = surface();
  const node = { id: 'same-id', position: { x: 100, y: 100 }, width: 260, height: 150 };
  const options = {
    storageKey: 'A',
    documentReady: true,
    readonly: false,
    tool: 'select',
    profile,
    board: { current: board },
    viewRef: { current: { x: 0, y: 0, z: 1 } },
    space: { current: false },
    nodes: [node],
    edges: [],
    selected: [node.id],
    point: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
    record: vi.fn(),
    setMenu: vi.fn(),
    setContext: vi.fn(),
    setLinking: vi.fn(),
    setLinkPoint: vi.fn(),
    setSelectionRect: vi.fn(),
  };
  options.setView = vi.fn((next) => {
    options.viewRef.current = typeof next === 'function' ? next(options.viewRef.current) : next;
  });
  options.setNodes = vi.fn((next) => {
    options.nodes = typeof next === 'function' ? next(options.nodes) : next;
  });
  options.setSelected = vi.fn((next) => {
    options.selected = typeof next === 'function' ? next(options.selected) : next;
  });
  const hook = renderHook(() => useGraphPointer(options, strategies));
  options.setSelectionRect.mockClear();
  options.setLinking.mockClear();
  const event = (target = article, patch = {}) => ({
    type: 'pointerdown',
    pointerId: 1,
    button: 0,
    isPrimary: true,
    target,
    currentTarget: target,
    clientX: 100,
    clientY: 100,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...patch,
  });
  return { hook, options, board, article, node, event };
}

function touchFixture() {
  const { board, article } = surface();
  const options = {
    storageKey: 'A',
    documentReady: true,
    readonly: false,
    profile,
    board: { current: board },
    viewRef: { current: { x: 0, y: 0, z: 1 } },
    cancelPointer: vi.fn(),
    setMenu: vi.fn(),
    setContext: vi.fn(),
    setLinking: vi.fn(),
  };
  options.setView = vi.fn((next) => {
    options.viewRef.current = next;
  });
  const hook = renderHook(() => useGraphTouch(options));
  options.cancelPointer.mockClear();
  const touch = (identifier, clientX, clientY, target = board) => ({
    identifier,
    clientX,
    clientY,
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
  return { hook, options, board, article, touch, dispatch };
}

describe('shared pointer strategy and profile ownership', () => {
  it('honors film selectors and injected selection rules without importing Canvas semantics', () => {
    const intersect = vi.fn(() => ['domain-selected']);
    const page = pointerFixture({ selectIntersectingNodes: intersect });
    const controls = document.createElement('div');
    controls.className = 'film-controls';
    page.board.append(controls);
    act(() => page.hook.result.current.begin(page.event(controls)));
    expect(page.options.setMenu).not.toHaveBeenCalled();
    act(() => page.hook.result.current.begin(page.event(page.board, { clientX: 10, clientY: 10 })));
    act(() =>
      page.hook.result.current.move(
        page.event(page.board, { type: 'pointermove', clientX: 60, clientY: 70 }),
      ),
    );
    act(() =>
      page.hook.result.current.end(
        page.event(page.board, { type: 'pointerup', clientX: 60, clientY: 70 }),
      ),
    );
    expect(intersect).toHaveBeenCalledWith(page.options.nodes, {
      x: 10,
      y: 10,
      width: 50,
      height: 60,
    });
    expect(page.options.selected).toEqual(['domain-selected']);
  });
  it('uses a callback replaced in the caller options and replays a delayed completed projection immutably', () => {
    const page = pointerFixture();
    const oldSetNodes = page.options.setNodes;
    const queued = [];
    page.options.setNodes = vi.fn((updater) => queued.push(updater));
    act(() => page.hook.result.current.drag(page.event(), page.node));
    act(() =>
      page.hook.result.current.move(page.event(page.board, { type: 'pointermove', clientX: 140 })),
    );
    act(() =>
      page.hook.result.current.end(page.event(page.board, { type: 'pointerup', clientX: 140 })),
    );
    expect(oldSetNodes).not.toHaveBeenCalled();
    expect(queued.length).toBeGreaterThan(0);
    const baseline = page.options.nodes;
    const completed = queued.at(-1)(baseline);
    expect(completed[0].position.x).toBe(140);
    expect(queued.at(-1)(baseline)).toBe(completed);
    expect(baseline[0].position.x).toBe(100);
    expect(page.hook.result.current.draggingNode).toBe(false);
    expect(page.article.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it('cancels old gestures on a document switch even when the new graph reuses a node ID', () => {
    const page = pointerFixture();
    act(() => page.hook.result.current.drag(page.event(), page.node));
    const lateMove = page.hook.result.current.move;
    page.options.storageKey = 'B';
    page.options.nodes = [{ ...page.node, position: { x: 900, y: 900 } }];
    page.hook.rerender();
    act(() =>
      lateMove(page.event(page.board, { type: 'pointermove', clientX: 500, clientY: 500 })),
    );
    expect(page.options.nodes[0].position).toEqual({ x: 900, y: 900 });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.article.releasePointerCapture).toHaveBeenCalledOnce();
  });
  it('removes the owner profile class and cancels motion when profile values change', () => {
    const page = pointerFixture();
    page.options.tool = 'hand';
    act(() => page.hook.result.current.begin(page.event(page.board)));
    expect(page.board.classList.contains('film-spec-panning')).toBe(true);
    const late = page.hook.result.current.move;
    page.options.profile = { ...profile, panningClass: 'replacement-panning' };
    page.hook.rerender();
    expect(page.board.classList.contains('film-spec-panning')).toBe(false);
    act(() => late(page.event(page.board, { clientX: 200, type: 'pointermove' })));
    expect(page.options.viewRef.current.x).toBe(0);
    act(() => page.hook.result.current.begin(page.event(page.board)));
    expect(page.board.classList.contains('replacement-panning')).toBe(true);
    act(() => page.hook.result.current.cancel());
    expect(page.board.classList.contains('replacement-panning')).toBe(false);
  });
  it('does not cancel a gesture solely because a caller recreated an equivalent profile object', () => {
    const page = pointerFixture();
    act(() => page.hook.result.current.drag(page.event(), page.node));
    page.options.profile = { ...profile };
    page.hook.rerender();
    act(() =>
      page.hook.result.current.move(page.event(page.board, { type: 'pointermove', clientX: 140 })),
    );
    expect(page.options.nodes[0].position.x).toBe(140);
    expect(page.options.record).toHaveBeenCalledOnce();
  });
});

describe('shared native touch lifecycle with a film profile', () => {
  it('keeps native controls and a custom editable surface native under a custom isolated selector', () => {
    const page = touchFixture();
    page.options.profile = { ...profile, editableSurface: '.film-editable' };
    page.hook.rerender();
    page.options.cancelPointer.mockClear();
    const button = document.createElement('button'),
      editable = document.createElement('div');
    editable.className = 'film-editable';
    page.article.append(button, editable);
    for (const target of [button, editable]) {
      const start = page.dispatch(
        'touchstart',
        [page.touch(1, 100, 100, target)],
        undefined,
        target,
      );
      const move = page.dispatch('touchmove', [page.touch(1, 200, 200, target)], undefined, target);
      expect(start.defaultPrevented).toBe(false);
      expect(move.defaultPrevented).toBe(false);
    }
    expect(page.options.setView).not.toHaveBeenCalled();
    expect(page.options.cancelPointer).not.toHaveBeenCalled();
    expect(page.board.classList.contains('film-spec-panning')).toBe(false);
  });
  it('leaves a custom isolated control native and uses the custom panning class for board touches', () => {
    const page = touchFixture(),
      control = document.createElement('div');
    control.className = 'film-controls';
    page.board.append(control);
    page.dispatch('touchstart', [page.touch(1, 100, 100, control)], undefined, control);
    page.dispatch('touchmove', [page.touch(1, 200, 200, control)], undefined, control);
    expect(page.options.setView).not.toHaveBeenCalled();
    page.dispatch('touchstart', [page.touch(1, 100, 100)]);
    expect(page.board.classList.contains('film-spec-panning')).toBe(true);
    page.dispatch('touchmove', [page.touch(1, 120, 130)]);
    expect(page.options.viewRef.current).toEqual({ x: 20, y: 30, z: 1 });
    page.dispatch('touchend', [], [page.touch(1, 120, 130)]);
    expect(page.board.classList.contains('film-spec-panning')).toBe(false);
  });
  it('keeps one-finger custom node editing with Pointer and cancels Pointer once when pinch takes over', () => {
    const page = touchFixture();
    const first = page.touch(1, 100, 100, page.article);
    page.dispatch('touchstart', [first], undefined, page.article);
    page.dispatch('touchmove', [page.touch(1, 120, 100, page.article)], undefined, page.article);
    expect(page.options.setView).not.toHaveBeenCalled();
    expect(page.options.cancelPointer).not.toHaveBeenCalled();
    const left = page.touch(1, 120, 100, page.article),
      right = page.touch(2, 220, 100, page.article);
    page.dispatch('touchstart', [left, right], [right], page.article);
    expect(page.options.cancelPointer).toHaveBeenCalledOnce();
    page.dispatch(
      'touchmove',
      [left, page.touch(2, 320, 100, page.article)],
      undefined,
      page.article,
    );
    expect(page.options.viewRef.current.z).toBe(2);
    expect(page.board.classList.contains('film-spec-panning')).toBe(true);
  });
  it.each(['cancel', 'touchcancel', 'document', 'profile', 'unmount'])(
    'cleans touch ownership and ignores a late move after %s',
    (reason) => {
      const page = touchFixture();
      page.dispatch('touchstart', [page.touch(1, 100, 100)]);
      page.dispatch('touchmove', [page.touch(1, 120, 130)]);
      const settledView = page.options.viewRef.current;
      if (reason === 'cancel') act(() => page.hook.result.current.cancel());
      else if (reason === 'touchcancel')
        page.dispatch('touchcancel', [], [page.touch(1, 120, 130)]);
      else if (reason === 'document') {
        page.options.storageKey = 'B';
        page.hook.rerender();
      } else if (reason === 'profile') {
        page.options.profile = { ...profile, panningClass: 'new-profile' };
        page.hook.rerender();
      } else page.hook.unmount();
      expect(page.board.classList.contains('film-spec-panning')).toBe(false);
      page.dispatch('touchmove', [page.touch(1, 600, 600)]);
      expect(page.options.viewRef.current).toBe(settledView);
      expect(page.options.cancelPointer).toHaveBeenCalled();
    },
  );
});

describe('shared wheel profile', () => {
  it('updates isolation and current callbacks and detaches the listener on unmount', () => {
    const { board } = surface(),
      controls = document.createElement('div');
    controls.className = 'film-controls';
    board.append(controls);
    const options = {
      board: { current: board },
      isolatedSurface: '.film-controls',
      setView: vi.fn(),
      zoom: vi.fn(),
    };
    const page = renderHook(() => useGraphWheel(options));
    const wheel = (target) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 });
      act(() => target.dispatchEvent(event));
      return event;
    };
    expect(wheel(controls).defaultPrevented).toBe(false);
    options.isolatedSurface = '.another-controls';
    options.setView = vi.fn();
    page.rerender();
    expect(wheel(controls).defaultPrevented).toBe(true);
    expect(options.setView).toHaveBeenCalledOnce();
    page.unmount();
    expect(wheel(board).defaultPrevented).toBe(false);
    expect(options.setView).toHaveBeenCalledOnce();
  });
});
