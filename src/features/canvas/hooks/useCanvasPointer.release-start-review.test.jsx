import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasPointer } from './useCanvasPointer.js';
import { useGraphPointer } from '../../editor/useGraphPointer.js';

afterEach(() => vi.unstubAllGlobals());

function setup(usePointer = useCanvasPointer, initialSelected = []) {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const board = document.createElement('main');
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 700,
  });
  const article = document.createElement('article');
  article.className = 'cv-node graph-node';
  const selection = document.createElement('div');
  selection.className = 'cv-selection-overlay graph-selection-overlay';
  board.append(article, selection);
  for (const element of [board, article, selection]) {
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
  }
  const original = { id: 'image', type: 'image', position: { x: 50, y: 50 } };
  const record = vi.fn();
  const createDragCopy = vi.fn();
  const viewRef = { current: { x: 30, y: 40, z: 0.5 } };
  const hook = renderHook(() => {
    const [nodes, setNodes] = useState([original]);
    const [selected, setSelected] = useState(initialSelected);
    const pointer = usePointer({
      storageKey: 'release-review',
      documentReady: true,
      readonly: false,
      tool: 'select',
      board: { current: board },
      viewRef,
      space: { current: false },
      nodes,
      edges: [],
      selected,
      setNodes,
      setSelected,
      record,
      createDragCopy,
      point: ({ clientX, clientY }) => ({
        x: (clientX - viewRef.current.x) / viewRef.current.z,
        y: (clientY - viewRef.current.y) / viewRef.current.z,
      }),
      setView: vi.fn(),
      setMenu: vi.fn(),
      setContext: vi.fn(),
      setSelectionRect: vi.fn(),
      setLinking: vi.fn(),
      setLinkPoint: vi.fn(),
    });
    return { nodes, selected, ...pointer };
  });
  const event = (type, x, y, extra = {}) => ({
    type,
    pointerId: 7,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: x,
    clientY: y,
    target: article,
    currentTarget: article,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...extra,
  });
  const selectionEvent = (type, x, y, extra = {}) =>
    event(type, x, y, { target: selection, currentTarget: selection, ...extra });
  return {
    hook,
    original,
    record,
    createDragCopy,
    viewRef,
    event,
    selectionEvent,
    article,
    selection,
  };
}

describe.each([
  ['Canvas pointer', useCanvasPointer],
  ['shared pointer used by FilmGraph', useGraphPointer],
])('%s move-start and final release boundary', (_name, usePointer) => {
  it('keeps a genuinely started drag final pointerup position with one history entry', () => {
    const page = setup(usePointer);
    act(() => page.hook.result.current.drag(page.event('pointerdown', 400, 300), page.original));
    act(() => page.hook.result.current.move(page.event('pointermove', 405, 300)));
    expect(page.hook.result.current.draggingNode).toBe(true);
    act(() => page.hook.result.current.end(page.event('pointerup', 410, 310)));
    expect(page.hook.result.current.nodes[0].position).toEqual({ x: 70, y: 70 });
    expect(page.record).toHaveBeenCalledTimes(1);
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 7 })).toBe(true);
  });

  it('does not start an ordinary drag solely from a release coordinate when no move crossed the threshold', () => {
    // Archived RF XYDrag @109735 end: !c returns; C is reached from drag, not end.
    // Preserve the local final-release adaptation for an existing drag above,
    // while a native click whose up coordinate differs is still not a move-start.
    const page = setup(usePointer);
    act(() => page.hook.result.current.drag(page.event('pointerdown', 400, 300), page.original));
    expect(page.hook.result.current.selected).toEqual(['image']);
    expect(page.hook.result.current.draggingNode).toBe(false);
    act(() => page.hook.result.current.end(page.event('pointerup', 410, 310)));
    expect(page.hook.result.current.nodes).toEqual([page.original]);
    expect(page.record).not.toHaveBeenCalled();
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 7 })).toBe(false);
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    expect(page.viewRef.current).toEqual({ x: 30, y: 40, z: 0.5 });
  });

  it('does not turn a subthreshold move into a drag on a distant release', () => {
    const page = setup(usePointer);
    act(() => page.hook.result.current.drag(page.event('pointerdown', 400, 300), page.original));
    act(() => page.hook.result.current.move(page.event('pointermove', 402, 302)));
    expect(page.hook.result.current.draggingNode).toBe(false);
    act(() => page.hook.result.current.end(page.event('pointerup', 450, 350)));
    expect(page.hook.result.current.nodes).toEqual([page.original]);
    expect(page.record).not.toHaveBeenCalled();
    expect(page.createDragCopy).not.toHaveBeenCalled();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not create an ordinary Alt copy or history from down and distant up alone', () => {
    const page = setup(usePointer, ['image']);
    act(() =>
      page.hook.result.current.drag(
        page.event('pointerdown', 400, 300, { altKey: true }),
        page.original,
      ),
    );
    expect(page.hook.result.current.altCopy).toBe(true);
    act(() => page.hook.result.current.end(page.event('pointerup', 450, 350, { altKey: true })));
    expect(page.hook.result.current.nodes).toEqual([page.original]);
    expect(page.hook.result.current.selected).toEqual(['image']);
    expect(page.createDragCopy).not.toHaveBeenCalled();
    expect(page.record).not.toHaveBeenCalled();
    expect(page.hook.result.current.altCopy).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps an unstarted virtual-frame gesture still on release with Alt=%s',
    (altKey) => {
      // Source iF end flushes I.current, not the up coordinates; its down start
      // callback is immediate. Local 4px/copy deferral remains an explicit adaptation.
      const page = setup(usePointer, ['image']);
      act(() =>
        page.hook.result.current.dragSelection(
          page.selectionEvent('pointerdown', 400, 300, { altKey }),
          ['image'],
        ),
      );
      act(() =>
        page.hook.result.current.move(page.selectionEvent('pointermove', 402, 302, { altKey })),
      );
      expect(page.hook.result.current.draggingNode).toBe(false);
      act(() =>
        page.hook.result.current.end(page.selectionEvent('pointerup', 450, 350, { altKey })),
      );
      expect(page.hook.result.current.nodes).toEqual([page.original]);
      expect(page.hook.result.current.selected).toEqual(['image']);
      expect(page.createDragCopy).not.toHaveBeenCalled();
      expect(page.record).not.toHaveBeenCalled();
      expect(requestAnimationFrame).not.toHaveBeenCalled();
      expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 7 })).toBe(false);
    },
  );

  it('keeps the started virtual frame final pointerup position and its visible selection', () => {
    const page = setup(usePointer, ['image']);
    act(() =>
      page.hook.result.current.dragSelection(page.selectionEvent('pointerdown', 400, 300), [
        'image',
      ]),
    );
    act(() => page.hook.result.current.move(page.selectionEvent('pointermove', 405, 300)));
    expect(page.hook.result.current.draggingNode).toBe(true);
    act(() => page.hook.result.current.end(page.selectionEvent('pointerup', 410, 310)));
    expect(page.hook.result.current.nodes[0].position).toEqual({ x: 70, y: 70 });
    expect(page.hook.result.current.selected).toEqual(['image']);
    expect(page.record).toHaveBeenCalledTimes(1);
    expect(page.createDragCopy).not.toHaveBeenCalled();
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 7 })).toBe(true);
  });
});
