import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasGroupResize } from './useCanvasGroupResize.js';

const snapshot = () => ({
  documentKey: 'A',
  ready: true,
  readonly: false,
  models: {},
  edges: [{ id: 'edge', source: 'child', target: 'other' }],
  nodes: [
    {
      id: 'g',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 200,
      height: 150,
      measured: { width: 200, height: 150 },
      data: { name: 'Group', childNodeIds: ['child'] },
    },
    {
      id: 'child',
      type: 'text',
      parentId: 'g',
      position: { x: 20, y: 20 },
      width: 80,
      height: 40,
      data: { content: ['Keep'], params: { prompt: 'Last input' } },
    },
  ],
});
let frames;
beforeEach(() => {
  frames = new Map();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());
const pointer = (type, x = 0, y = 0, pointerId = 1, target = window) => {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  act(() => target.dispatchEvent(event));
};
const paint = () =>
  act(() => {
    const queue = [...frames.values()];
    frames.clear();
    queue.forEach((callback) => callback(0));
  });
function mount(options = {}) {
  const context = { graph: snapshot() };
  const board = document.createElement('main');
  const group = document.createElement('article');
  group.dataset.nodeId = 'g';
  group.tabIndex = 0;
  board.append(group);
  document.body.append(board);
  let capture;
  board.setPointerCapture = vi.fn((id) => (capture = id));
  board.hasPointerCapture = vi.fn((id) => capture === id);
  board.releasePointerCapture = vi.fn(() => (capture = undefined));
  const commitGraph = vi.fn((next, { expectedGraph }) => {
    if (context.graph.nodes !== expectedGraph.nodes || context.graph.edges !== expectedGraph.edges)
      return false;
    context.graph = next;
    return true;
  });
  const flushGraph = vi.fn(() => true);
  const cancelOtherGestures = vi.fn();
  const props = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    tool: 'select',
    nodes: context.graph.nodes,
    selected: ['g'],
    board: { current: board },
    point: (event) => ({ x: event.clientX / 0.5, y: event.clientY / 0.5 }),
    getDocument: () => context.graph,
    commitGraph,
    flushGraph,
    cancelOtherGestures,
    ...options,
  };
  const hook = renderHook((next) => useCanvasGroupResize(next), {
    initialProps: props,
    wrapper: StrictMode,
  });
  const begin = (direction = 'bottom-right') =>
    act(() =>
      hook.result.current.begin(
        {
          button: 0,
          pointerId: 1,
          clientX: 0,
          clientY: 0,
          preventDefault() {},
          stopPropagation() {},
        },
        'g',
        direction,
      ),
    );
  return {
    ...hook,
    props,
    context,
    board,
    group,
    commitGraph,
    flushGraph,
    begin,
    cancelOtherGestures,
  };
}

describe('group resize pointer owner', () => {
  it('paints a preview without mutating canonical data and commits the final pointer in one transaction', () => {
    const page = mount();
    const original = page.context.graph;
    page.begin();
    pointer('pointermove', 20, 10);
    paint();
    expect(page.result.current.nodes[0]).toMatchObject({ width: 240, height: 170 });
    expect(page.context.graph).toBe(original);
    expect(page.commitGraph).not.toHaveBeenCalled();
    pointer('pointerup', 30, 15);
    expect(page.commitGraph).toHaveBeenCalledOnce();
    expect(page.commitGraph.mock.calls[0][1].expectedGraph).toBe(original);
    expect(page.context.graph.nodes[0]).toMatchObject({ width: 260, height: 180 });
    expect(page.context.graph.nodes[1]).toEqual(original.nodes[1]);
    expect(page.context.graph.edges).toBe(original.edges);
    expect(page.flushGraph).toHaveBeenCalledWith(page.context.graph);
    expect(page.result.current.active).toBe(false);
    expect(page.board.releasePointerCapture).toHaveBeenCalledWith(1);
    page.unmount();
    page.board.remove();
  });

  it('cancels on Escape, retains selection focus and ignores late frames and pointerup', () => {
    const page = mount();
    page.begin('top-left');
    pointer('pointermove', -20, -10);
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
    );
    paint();
    pointer('pointerup', -30, -15);
    expect(page.commitGraph).not.toHaveBeenCalled();
    expect(page.result.current.active).toBe(false);
    expect(document.activeElement).toBe(page.group);
    expect(frames.size).toBe(0);
    page.unmount();
    page.board.remove();
  });

  it('finishes a pending frame before pagehide persistence and retires its old pointer', () => {
    const page = mount();
    page.begin();
    pointer('pointermove', 20, 10);
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(page.context.graph.nodes[0]).toMatchObject({ width: 240, height: 170 });
    expect(page.commitGraph).toHaveBeenCalledOnce();
    expect(page.flushGraph).toHaveBeenCalledOnce();
    paint();
    pointer('pointerup', 80, 80);
    expect(page.commitGraph).toHaveBeenCalledOnce();
    page.unmount();
    page.board.remove();
  });

  it('does not commit an untouched handle or publish when CAS rejects a resize', () => {
    const page = mount();
    page.begin();
    pointer('pointerup');
    expect(page.commitGraph).not.toHaveBeenCalled();
    page.begin();
    page.commitGraph.mockReturnValueOnce(false);
    pointer('pointerup', 20, 10);
    expect(page.commitGraph).toHaveBeenCalledOnce();
    expect(page.context.graph.nodes[0].width).toBe(200);
    expect(page.flushGraph).not.toHaveBeenCalled();
    expect(page.result.current.active).toBe(false);
    page.unmount();
    page.board.remove();
  });

  it('rejects a stale document callback even when the new document reuses the group ID', () => {
    const page = mount();
    const oldBegin = page.result.current.begin;
    page.begin();
    pointer('pointermove', 20, 10);
    page.context.graph = { ...snapshot(), documentKey: 'B' };
    page.rerender({ ...page.props, documentKey: 'B', nodes: page.context.graph.nodes });
    pointer('pointerup', 40, 20);
    act(() => expect(oldBegin({ button: 0 }, 'g', 'right')).toBe(false));
    expect(page.commitGraph).not.toHaveBeenCalled();
    expect(page.result.current.nodes).toBe(page.context.graph.nodes);
    page.unmount();
    page.board.remove();
  });

  it.each([
    'readonly',
    'ready',
    'selection',
    'graph',
    'second-pointer',
    'lostcapture',
    'blur',
    'modal',
  ])('retires a resize after %s changes without overwriting data', (cause) => {
    const page = mount();
    page.begin();
    pointer('pointermove', 20, 10);
    if (cause === 'readonly') page.rerender({ ...page.props, readonly: true });
    if (cause === 'ready') page.rerender({ ...page.props, ready: false });
    if (cause === 'modal') page.rerender({ ...page.props, suspended: true });
    if (cause === 'selection') page.rerender({ ...page.props, selected: ['child'] });
    if (cause === 'graph') {
      page.context.graph = { ...page.context.graph, nodes: [...page.context.graph.nodes] };
      page.rerender({ ...page.props, nodes: page.context.graph.nodes });
    }
    if (cause === 'second-pointer') pointer('pointerdown', 1, 1, 2);
    if (cause === 'lostcapture') pointer('lostpointercapture', 0, 0, 1, page.board);
    if (cause === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    paint();
    pointer('pointerup', 40, 20);
    expect(page.commitGraph).not.toHaveBeenCalled();
    expect(page.context.graph.nodes[0].width).toBe(200);
    expect(page.result.current.active).toBe(false);
    page.unmount();
    page.board.remove();
  });

  it('ignores another pointer move/up and releases resources on unmount', () => {
    const page = mount();
    page.begin();
    pointer('pointermove', 20, 10, 2);
    pointer('pointerup', 20, 10, 2);
    expect(page.result.current.active).toBe(true);
    pointer('pointermove', 20, 10);
    page.unmount();
    paint();
    pointer('pointerup', 40, 20);
    expect(page.commitGraph).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(page.board.releasePointerCapture).toHaveBeenCalledOnce();
    page.board.remove();
  });

  it('filters captured board clicks but permits a fresh gesture, and preserves an edited title focus', () => {
    const page = mount();
    const input = document.createElement('input');
    page.group.append(input);
    input.focus();
    page.begin();
    pointer('pointerup');
    expect(page.result.current.shouldSuppressClick({ target: page.board })).toBe(true);
    act(() => page.result.current.cancel());
    expect(page.result.current.shouldSuppressClick({ target: page.board })).toBe(false);
    page.begin();
    pointer('pointermove', 20, 10);
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })),
    );
    expect(document.activeElement).toBe(input);
    expect(page.commitGraph).not.toHaveBeenCalled();
    page.unmount();
    page.board.remove();
  });
});
