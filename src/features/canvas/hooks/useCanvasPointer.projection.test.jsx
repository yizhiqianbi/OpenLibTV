import { StrictMode, useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasPointer } from './useCanvasPointer.js';

function setup({ strict = false, ...callbacks } = {}) {
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });
  const article = document.createElement('article');
  article.className = 'cv-node';
  board.append(article);
  for (const element of [board, article]) {
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
  }
  const initial = [{ id: 'image', type: 'image', position: { x: 100, y: 100 } }];
  const onNodeDragCommitted = vi.fn();
  const finalizeNodeDrag =
    callbacks.finalizeNodeDrag ??
    vi.fn(({ nodes }) => ({
      nodes,
      completion: { selectedIds: [], warning: '准确完成' },
    }));
  const hook = renderHook(
    ({ documentKey, ready, readonly }) => {
      const [nodes, setNodes] = useState(initial);
      const [selected, setSelected] = useState(['image']);
      const viewRef = useRef({ x: 0, y: 0, z: 1 });
      const pointer = useCanvasPointer({
        storageKey: documentKey,
        documentReady: ready,
        readonly,
        nodes,
        selected,
        setNodes,
        setSelected,
        board: { current: board },
        viewRef,
        setView: vi.fn(),
        space: { current: false },
        setMenu: vi.fn(),
        setContext: vi.fn(),
        setSelectionRect: vi.fn(),
        setLinking: vi.fn(),
        record: vi.fn(),
        point: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
        ...callbacks,
        finalizeNodeDrag,
        onNodeDragCommitted: (completion, owner) => {
          onNodeDragCommitted(completion, owner);
          if (completion?.selectedIds) setSelected(completion.selectedIds);
        },
      });
      return { pointer, nodes, selected, setNodes };
    },
    {
      initialProps: { documentKey: 'A', ready: true, readonly: false },
      wrapper: strict ? StrictMode : undefined,
    },
  );
  const event = (type, point = { x: 10, y: 10 }) => ({
    type,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    currentTarget: type === 'pointerdown' ? article : board,
    target: type === 'pointerdown' ? article : board,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  });
  const down = () => hook.result.current.pointer.drag(event('pointerdown'), initial[0]);
  const move = (point) => hook.result.current.pointer.move(event('pointermove', point));
  const end = (point) => hook.result.current.pointer.end(event('pointerup', point));
  return { hook, down, move, end, onNodeDragCommitted, finalizeNodeDrag };
}

describe('node projection context and committed completion', () => {
  it('delivers selection completion only after the actual final node array commits, once in StrictMode', () => {
    const page = setup({ strict: true });
    act(page.down);
    act(() => page.move({ x: 30, y: 20 }));
    expect(
      page.onNodeDragCommitted.mock.calls.filter(([, owner]) => owner.phase === 'stop'),
    ).toHaveLength(0);
    act(() => page.end({ x: 50, y: 30 }));
    expect(page.hook.result.current.nodes[0].position).toEqual({ x: 140, y: 120 });
    expect(page.hook.result.current.selected).toEqual([]);
    const stopped = page.onNodeDragCommitted.mock.calls.filter(
      ([, owner]) => owner.phase === 'stop',
    );
    expect(stopped).toHaveLength(1);
    expect(stopped[0][1]).toMatchObject({ documentKey: 'A', selectedIds: ['image'] });
    page.hook.rerender({ documentKey: 'A', ready: true, readonly: false });
    expect(
      page.onNodeDragCommitted.mock.calls.filter(([, owner]) => owner.phase === 'stop'),
    ).toHaveLength(1);
  });

  it('commits a rejection with identical nodes and batched start/end without forcing fake node changes', () => {
    const initial = [{ id: 'image', type: 'image', position: { x: 100, y: 100 } }];
    const page = setup({
      strict: true,
      projectNodeDrag: () => ({ nodes: initial }),
      finalizeNodeDrag: ({ nodes }) => ({ nodes, completion: { warning: '组已满' } }),
    });
    act(() => {
      page.down();
      page.move({ x: 30, y: 20 });
      page.end({ x: 30, y: 20 });
    });
    expect(page.hook.result.current.nodes).toBe(initial);
    expect(
      page.onNodeDragCommitted.mock.calls.filter(([, owner]) => owner.phase === 'stop'),
    ).toHaveLength(1);
    expect(page.onNodeDragCommitted.mock.calls.at(-1)[0]).toEqual({ warning: '组已满' });
  });

  it('does not advance the same immutable stage twice during StrictMode updater replay', () => {
    const page = setup({
      strict: true,
      prepareNodeDrag: () => ({ count: 0 }),
      projectNodeDrag: ({ nodes, dragContext }) => ({
        nodes,
        dragContext: { count: dragContext.count + 1 },
        preview: { count: dragContext.count + 1 },
      }),
      finalizeNodeDrag: vi.fn(({ nodes, dragContext }) => ({
        nodes,
        completion: { count: dragContext.count },
      })),
    });
    act(page.down);
    act(() => page.move({ x: 30, y: 20 }));
    expect(page.hook.result.current.pointer.nodeDragPreview).toEqual({ count: 1 });
    act(() => page.move({ x: 40, y: 20 }));
    expect(page.hook.result.current.pointer.nodeDragPreview).toEqual({ count: 2 });
    act(() => page.end({ x: 40, y: 20 }));
    expect(page.onNodeDragCommitted.mock.calls.at(-1)[0]).toEqual({ count: 3 });
    expect(page.hook.result.current.pointer.nodeDragPreview).toBeUndefined();
  });

  it('continues from the last committed context after an external array update and preserves its fields', () => {
    const page = setup({
      strict: true,
      prepareNodeDrag: () => ({ count: 0 }),
      projectNodeDrag: ({ nodes, dragContext }) => ({
        nodes,
        dragContext: { count: dragContext.count + 1 },
        preview: { count: dragContext.count + 1 },
      }),
      finalizeNodeDrag: ({ nodes, dragContext }) => ({
        nodes,
        completion: { count: dragContext.count },
      }),
    });
    act(page.down);
    act(() => page.move({ x: 30, y: 20 }));
    act(() =>
      page.hook.result.current.setNodes((nodes) =>
        nodes.map((node) => ({ ...node, data: { ...node.data, name: '拖动中合法改名' } })),
      ),
    );
    act(() => page.move({ x: 40, y: 20 }));
    expect(page.hook.result.current.pointer.nodeDragPreview).toEqual({ count: 2 });
    act(() => page.end({ x: 50, y: 20 }));
    expect(page.onNodeDragCommitted.mock.calls.at(-1)[0]).toEqual({ count: 3 });
    expect(page.hook.result.current.nodes[0].data.name).toBe('拖动中合法改名');
    expect(page.hook.result.current.nodes[0].position).toEqual({ x: 140, y: 110 });
  });

  it.each(['cancel', 'document', 'readonly', 'loading'])(
    'rejects queued old completion when %s takes ownership',
    (boundary) => {
      const page = setup();
      act(page.down);
      act(() => page.move({ x: 30, y: 20 }));
      page.onNodeDragCommitted.mockClear();
      act(() => {
        page.end({ x: 50, y: 30 });
        if (boundary === 'cancel') page.hook.result.current.pointer.cancel();
        else
          page.hook.rerender({
            documentKey: boundary === 'document' ? 'B' : 'A',
            readonly: boundary === 'readonly',
            ready: boundary !== 'loading',
          });
      });
      expect(page.onNodeDragCommitted).not.toHaveBeenCalled();
      expect(page.hook.result.current.selected).toEqual(['image']);
    },
  );

  it('keeps model callbacks out of a simple click and starts their context only after drag intent', () => {
    const prepareNodeDrag = vi.fn(() => null),
      projectNodeDrag = vi.fn(({ nodes }) => ({ nodes }));
    const page = setup({ prepareNodeDrag, projectNodeDrag });
    act(page.down);
    act(() => page.end({ x: 12, y: 12 }));
    expect(prepareNodeDrag).not.toHaveBeenCalled();
    expect(projectNodeDrag).not.toHaveBeenCalled();
    expect(page.finalizeNodeDrag).not.toHaveBeenCalled();
    expect(page.onNodeDragCommitted).not.toHaveBeenCalled();
  });
});
