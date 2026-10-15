import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasPointer } from './useCanvasPointer.js';
import {
  planCanvasSelectionDragCopy,
  planCanvasSingleNodeDragCopy,
} from '../domain/selection-copy-model.js';

describe('floating menu pointer ownership', () => {
  it('captures the actual storyboard title so stationary clicks and double clicks retain their target', () => {
    const page = setupGesture();
    const title = document.createElement('span');
    title.className = 'cv-storyboard-title-label';
    title.setPointerCapture = vi.fn();
    title.releasePointerCapture = vi.fn();
    page.article.append(title);
    page.down(createGesture(title, { currentTarget: page.article }));
    expect(title.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.article.setPointerCapture).not.toHaveBeenCalled();
    page.end({ target: title });
    expect(title.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.options.record).not.toHaveBeenCalled();
    page.down(createGesture(title, { currentTarget: page.article }));
    page.move({ clientX: 30, clientY: 20 });
    page.end({ target: title, clientX: 30, clientY: 20 });
    expect(page.options.nodes[0].position).toEqual({ x: 140, y: 200 });
    expect(page.options.record).toHaveBeenCalledOnce();
  });
  it('leaves a menu mounted until its click handler runs while blank canvas still dismisses it', () => {
    const setMenu = vi.fn(),
      setContext = vi.fn(),
      setSelectionRect = vi.fn();
    const board = document.createElement('main');
    board.setPointerCapture = vi.fn();
    const menu = document.createElement('div');
    menu.className = 'cv-floating';
    const button = document.createElement('button');
    menu.append(button);
    board.append(menu);
    const page = renderHook(() =>
      useCanvasPointer({
        storageKey: 'doc',
        readonly: false,
        documentReady: true,
        viewRef: { current: { x: 0, y: 0, z: 1 } },
        space: { current: false },
        nodes: [],
        selected: [],
        board: { current: board },
        point: () => ({ x: 0, y: 0 }),
        setMenu,
        setContext,
        setSelectionRect,
        setLinking: vi.fn(),
        setSelected: vi.fn(),
      }),
    );
    act(() => page.result.current.begin({ button: 0, target: button, currentTarget: board }));
    expect(setMenu).not.toHaveBeenCalled();
    expect(setContext).not.toHaveBeenCalled();
    act(() =>
      page.result.current.begin({ button: 0, target: board, currentTarget: board, pointerId: 1 }),
    );
    expect(setMenu).toHaveBeenCalledExactlyOnceWith(null);
    expect(board.setPointerCapture).toHaveBeenCalledWith(1);
  });
});

const createGesture = (target, patch = {}) => ({
  type: 'pointerdown',
  pointerId: 1,
  isPrimary: true,
  button: 0,
  clientX: 10,
  clientY: 20,
  target,
  currentTarget: target,
  stopPropagation: vi.fn(),
  preventDefault: vi.fn(),
  ...patch,
});
function setupGesture(patch = {}) {
  const board = document.createElement('main');
  const article = document.createElement('article');
  article.className = 'cv-node';
  board.append(article);
  for (const element of [board, article]) {
    element.setPointerCapture = vi.fn();
    element.releasePointerCapture = vi.fn();
  }
  const node = { id: 'node', position: { x: 100, y: 200 }, width: 20, height: 20 };
  const options = {
    storageKey: 'doc',
    readonly: false,
    documentReady: true,
    tool: 'select',
    space: { current: false },
    board: { current: board },
    viewRef: { current: { x: 30, y: 40, z: 0.5 } },
    nodes: [node],
    edges: [],
    selected: ['node'],
    point: (event) => ({ x: event.clientX, y: event.clientY }),
    record: vi.fn(),
    setMenu: vi.fn(),
    setContext: vi.fn(),
    setLinking: vi.fn(),
    setLinkPoint: vi.fn(),
    ...patch,
  };
  options.setView = vi.fn((view) => {
    options.viewRef.current = typeof view === 'function' ? view(options.viewRef.current) : view;
  });
  options.setNodes = vi.fn((nodes) => {
    options.nodes = typeof nodes === 'function' ? nodes(options.nodes) : nodes;
  });
  options.setSelected = vi.fn((selected) => {
    options.selected = typeof selected === 'function' ? selected(options.selected) : selected;
  });
  options.setSelectionRect = vi.fn((rectangle) => {
    options.selectionRect = rectangle;
  });
  const hook = renderHook(() => useCanvasPointer(options));
  for (const mock of [options.setLinking, options.setSelectionRect]) mock.mockClear();
  const down = (event = createGesture(article)) => act(() => hook.result.current.drag(event, node));
  const move = (event) =>
    act(() => hook.result.current.move(createGesture(board, { type: 'pointermove', ...event })));
  const end = (event) =>
    act(() => hook.result.current.end(createGesture(board, { type: 'pointerup', ...event })));
  return { options, hook, board, article, node, down, move, end };
}

describe('canvas node gesture arbitration', () => {
  it('leaves actual touch backgrounds to the native pan hook without starting box selection', () => {
    const page = setupGesture({ touchMode: true });
    const event = createGesture(page.board, { pointerType: 'touch' });
    act(() => page.hook.result.current.begin(event));
    page.move({ pointerType: 'touch', clientX: 100, clientY: 100 });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.options.setSelectionRect).not.toHaveBeenCalled();
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.setView).not.toHaveBeenCalled();
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
  });
  it('keeps an actual single touch on a writable node draggable and cancelable at pinch takeover', () => {
    const page = setupGesture({ touchMode: true });
    const cancel = page.hook.result.current.cancel;
    page.down(createGesture(page.article, { pointerType: 'touch' }));
    page.move({ pointerType: 'touch', clientX: 20, clientY: 30 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.options.record).toHaveBeenCalledOnce();
    act(() => cancel());
    expect(page.hook.result.current.cancel).toBe(cancel);
    expect(page.hook.result.current.draggingNode).toBe(false);
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    page.move({ pointerType: 'touch', clientX: 1000, clientY: 1000 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.options.record).toHaveBeenCalledOnce();
  });
  it('leaves a readonly touch node to native pan without capturing or moving it', () => {
    const page = setupGesture({ readonly: true });
    page.down(createGesture(page.article, { pointerType: 'touch' }));
    expect(page.article.setPointerCapture).not.toHaveBeenCalled();
    expect(page.options.setNodes).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
  });
  it('pans coarse-primary empty canvas mouse events according to the source touchMode props', () => {
    const page = setupGesture({ touchMode: true });
    act(() => page.hook.result.current.begin(createGesture(page.board)));
    page.move({ clientX: 30, clientY: 40 });
    expect(page.options.viewRef.current).toEqual({ x: 50, y: 60, z: 0.5 });
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
  });
  it('cancels a captured node gesture when the primary device capability changes', () => {
    const page = setupGesture({ touchMode: true });
    page.down();
    page.options.touchMode = false;
    page.hook.rerender();
    page.move({ clientX: 1000, clientY: 1000 });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });
  it('keeps a plain click and subthreshold jitter out of history and the dragging state', () => {
    const page = setupGesture({ selected: [] });
    page.down();
    expect(page.article.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    expect(page.options.selected).toEqual(['node']);
    expect(page.hook.result.current.draggingNode).toBe(false);
    page.move({ clientX: 12, clientY: 22 });
    page.end({ clientX: 12, clientY: 22 });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.setNodes).not.toHaveBeenCalled();
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1 })).toBe(false);
  });
  it('records one actual drag, keeps parent-relative positions and commits the final pointerup point', () => {
    const group = { id: 'group', type: 'group', position: { x: 100, y: 200 } };
    const child = { id: 'child', parentId: 'group', position: { x: 15, y: 25 } };
    const other = { id: 'other', position: { x: 400, y: 200 } };
    const page = setupGesture({ nodes: [group, child, other], selected: ['group', 'child'] });
    act(() => page.hook.result.current.drag(createGesture(page.article), group));
    page.move({ clientX: 14, clientY: 20 });
    expect(page.hook.result.current.draggingNode).toBe(true);
    expect(page.options.record).toHaveBeenCalledOnce();
    page.move({ clientX: 18, clientY: 26 });
    page.end({ clientX: 20, clientY: 30 });
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.options.nodes[1]).toBe(child);
    expect(page.options.nodes[2]).toBe(other);
    expect(page.hook.result.current.draggingNode).toBe(false);
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 1 })).toBe(true);
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 1 })).toBe(false);
  });
  it.each([{ tool: 'hand' }, { space: { current: true } }, { middle: true }])(
    'pans over a node for the explicit gesture %j without moving or selecting it',
    (gesture) => {
      const { middle, ...patch } = gesture;
      const page = setupGesture(patch);
      const event = createGesture(page.article, {
        button: middle ? 1 : 0,
        currentTarget: page.board,
      });
      act(() => page.hook.result.current.begin(event));
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(page.board.classList.contains('cv-panning')).toBe(true);
      page.move({ clientX: 35, clientY: 45 });
      page.end({ clientX: 40, clientY: 50 });
      expect(page.options.viewRef.current).toEqual({ x: 60, y: 70, z: 0.5 });
      expect(page.options.setNodes).not.toHaveBeenCalled();
      expect(page.options.setSelected).not.toHaveBeenCalled();
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.board.classList.contains('cv-panning')).toBe(false);
      expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 1 })).toBe(true);
    },
  );
  it('keeps readonly node clicks selectable while the readonly background remains pannable', () => {
    const page = setupGesture({ readonly: true, selected: [] });
    act(() =>
      page.hook.result.current.begin(createGesture(page.article, { currentTarget: page.board })),
    );
    page.down();
    expect(page.options.selected).toEqual(['node']);
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    act(() => page.hook.result.current.begin(createGesture(page.board)));
    page.move({ clientX: 20, clientY: 30 });
    expect(page.options.viewRef.current).toEqual({ x: 40, y: 50, z: 0.5 });
  });
  it.each([{ button: 2 }, { isPrimary: false }])('does not start a drag for %j', (patch) => {
    const page = setupGesture();
    page.down(createGesture(page.article, patch));
    page.move({ clientX: 60, clientY: 80 });
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.article.setPointerCapture).not.toHaveBeenCalled();
    expect(page.options.setNodes).not.toHaveBeenCalled();
  });
  it.each(['textarea', 'video', 'button', 'contenteditable'])(
    'leaves %s interaction inside a node owned by the control',
    (kind) => {
      const page = setupGesture({ tool: 'hand' });
      const control = document.createElement(kind === 'contenteditable' ? 'div' : kind);
      if (kind === 'contenteditable') control.setAttribute('contenteditable', 'true');
      page.article.append(control);
      const event = createGesture(control, { currentTarget: page.board });
      act(() => page.hook.result.current.begin(event));
      page.down(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(page.options.setView).not.toHaveBeenCalled();
      expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    },
  );
  it('leaves a connection target click intact instead of selecting, dragging or capturing it', () => {
    const page = setupGesture({ linking: 'source' });
    const event = createGesture(page.article);
    page.down(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.article.setPointerCapture).not.toHaveBeenCalled();
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1 })).toBe(false);
  });
  it('owns exactly one pointer and ignores another pointer move, down and release', () => {
    const page = setupGesture();
    page.down();
    page.move({ clientX: 20, clientY: 30 });
    page.down(createGesture(page.article, { pointerId: 2 }));
    page.move({ pointerId: 2, clientX: 1000, clientY: 1000 });
    page.end({ pointerId: 2, clientX: 1000, clientY: 1000 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.hook.result.current.draggingNode).toBe(true);
    expect(page.options.record).toHaveBeenCalledOnce();
    page.end({ clientX: 25, clientY: 35 });
    expect(page.options.nodes[0].position).toEqual({ x: 130, y: 230 });
    expect(page.hook.result.current.draggingNode).toBe(false);
  });
  it.each(['pointercancel', 'lostpointercapture', 'blur'])(
    'releases a canceled %s gesture without applying its false final coordinates',
    (type) => {
      const page = setupGesture();
      page.down();
      page.move({ clientX: 20, clientY: 30 });
      if (type === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else page.end({ type, clientX: 1000, clientY: 1000 });
      expect(page.hook.result.current.draggingNode).toBe(false);
      expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
      page.move({ clientX: 1500, clientY: 1500 });
      expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
      expect(page.hook.result.current.shouldSuppressClick({ detail: 1 })).toBe(false);
    },
  );
  it.each([{ storageKey: 'next-doc' }, { readonly: true }, { documentReady: false }])(
    'cancels the old document gesture before a changed boundary %j can move reused IDs',
    (patch) => {
      const page = setupGesture();
      page.down();
      Object.assign(page.options, patch);
      page.options.nodes = [{ ...page.node, position: { x: 700, y: 800 } }];
      page.hook.rerender();
      page.move({ clientX: 40, clientY: 60 });
      page.end({ clientX: 40, clientY: 60 });
      expect(page.options.nodes[0].position).toEqual({ x: 700, y: 800 });
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    },
  );
  it('uses the final selection rectangle without waiting for a React render', () => {
    const node = { id: 'inside', position: { x: 30, y: 30 }, width: 10, height: 10 };
    const page = setupGesture({ nodes: [node] });
    act(() => {
      page.hook.result.current.begin(createGesture(page.board, { clientX: 0, clientY: 0 }));
      page.hook.result.current.move(
        createGesture(page.board, { type: 'pointermove', clientX: 20, clientY: 20 }),
      );
      page.hook.result.current.end(
        createGesture(page.board, { type: 'pointerup', clientX: 50, clientY: 50 }),
      );
    });
    expect(page.options.selected).toEqual(['inside']);
  });
});

function selectionGesture(patch = {}) {
  const group = { id: 'group', type: 'group', position: { x: 100, y: 200 } };
  const child = { id: 'child', parentId: 'group', position: { x: 15, y: 25 } };
  const other = { id: 'other', position: { x: 400, y: 200 } };
  const outside = { id: 'outside', position: { x: 800, y: 600 } };
  const page = setupGesture({
    nodes: [group, child, other, outside],
    selected: ['group', 'child', 'other'],
    cancelOtherGestures: vi.fn(),
    ...patch,
  });
  const overlay = document.createElement('div');
  overlay.className = 'cv-selection-overlay';
  const fill = document.createElement('div');
  fill.className = 'cv-selection-overlay-fill';
  overlay.append(fill);
  page.board.append(overlay);
  fill.setPointerCapture = vi.fn();
  fill.releasePointerCapture = vi.fn();
  const selectionDown = (event = createGesture(fill), ids) =>
    act(() => page.hook.result.current.dragSelection(event, ids));
  return { ...page, overlay, fill, selectionDown, group, child, other, outside };
}

describe('explicit multi-selection surface ownership', () => {
  it('lets capture-phase begin leave the selection mounted before its explicit handler starts', () => {
    const page = selectionGesture();
    const event = createGesture(page.fill);
    act(() => page.hook.result.current.begin(event));
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.setSelectionRect).not.toHaveBeenCalled();
    expect(page.options.setMenu).not.toHaveBeenCalled();
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    page.selectionDown(event);
    expect(page.fill.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(page.options.cancelOtherGestures).toHaveBeenCalledOnce();
    page.move({ clientX: 12, clientY: 22 });
    page.end({ clientX: 12, clientY: 22 });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.setNodes).not.toHaveBeenCalled();
    expect(page.options.selected).toEqual(['group', 'child', 'other']);
  });

  it('records one actual shared drag and moves selected roots once while retaining child coordinates', () => {
    const page = selectionGesture();
    page.selectionDown();
    page.move({ clientX: 14, clientY: 20 });
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(page.hook.result.current.draggingNode).toBe(true);
    page.move({ clientX: 20, clientY: 30 });
    page.end({ clientX: 25, clientY: 35 });
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(page.options.nodes[0].position).toEqual({ x: 130, y: 230 });
    expect(page.options.nodes[1]).toBe(page.child);
    expect(page.options.nodes[2].position).toEqual({ x: 430, y: 230 });
    expect(page.options.nodes[3]).toBe(page.outside);
    expect(page.fill.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.hook.result.current.draggingNode).toBe(false);
    expect(page.hook.result.current.shouldSuppressClick({ pointerId: 1, detail: 1 })).toBe(true);
    expect(page.hook.result.current.shouldSuppressClick({ pointerId: 1, detail: 1 })).toBe(false);
  });

  it('uses caller drag IDs without replacing the visible operation selection', () => {
    const page = selectionGesture();
    page.selectionDown(createGesture(page.fill), ['child', 'other', 'missing', 'other']);
    page.move({ clientX: 20, clientY: 30 });
    page.end({ clientX: 20, clientY: 30 });
    expect(page.options.nodes[0]).toBe(page.group);
    expect(page.options.nodes[1].position).toEqual({ x: 35, y: 45 });
    expect(page.options.nodes[2].position).toEqual({ x: 420, y: 220 });
    expect(page.options.selected).toEqual(['group', 'child', 'other']);
    expect(page.options.setSelected).not.toHaveBeenCalled();
    expect(page.options.record).toHaveBeenCalledOnce();
  });

  it.each([{ tool: 'hand' }, { space: { current: true } }, { middle: true }])(
    'routes explicit viewport gesture %j over the frame to the existing pan owner',
    ({ middle, ...patch }) => {
      const page = selectionGesture(patch);
      const event = createGesture(page.fill, { button: middle ? 1 : 0 });
      act(() => page.hook.result.current.begin(event));
      page.selectionDown(event);
      expect(page.fill.setPointerCapture).not.toHaveBeenCalled();
      expect(page.board.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(page.board.classList.contains('cv-panning')).toBe(true);
      page.move({ clientX: 30, clientY: 40 });
      page.end({ clientX: 35, clientY: 45 });
      expect(page.options.viewRef.current).toEqual({ x: 55, y: 65, z: 0.5 });
      expect(page.options.setNodes).not.toHaveBeenCalled();
      expect(page.options.setSelected).not.toHaveBeenCalled();
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.options.selected).toEqual(['group', 'child', 'other']);
    },
  );

  it('keeps coarse-device mouse selection drags distinct from empty pane pan', () => {
    const page = selectionGesture({ touchMode: true });
    page.selectionDown();
    page.move({ clientX: 20, clientY: 30 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.options.setView).not.toHaveBeenCalled();
  });

  it('supports an actual single pointer touch on the frame with the same local drag transaction', () => {
    const page = selectionGesture({ touchMode: true });
    page.selectionDown(createGesture(page.fill, { pointerType: 'touch' }));
    page.move({ pointerType: 'touch', clientX: 20, clientY: 30 });
    page.end({ pointerType: 'touch', clientX: 25, clientY: 35 });
    expect(page.options.nodes[0].position).toEqual({ x: 130, y: 230 });
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(page.options.setView).not.toHaveBeenCalled();
  });

  it.each(['button', 'textarea', 'nopan'])(
    'does not acquire %s controls or the independent batch Add gesture',
    (kind) => {
      const page = selectionGesture();
      const control = document.createElement(kind === 'nopan' ? 'div' : kind);
      if (kind === 'nopan') control.className = 'nopan';
      page.fill.append(control);
      const event = createGesture(control, { currentTarget: page.fill });
      page.selectionDown(event);
      page.move({ clientX: 50, clientY: 60 });
      expect(page.fill.setPointerCapture).not.toHaveBeenCalled();
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.options.setSelected).not.toHaveBeenCalled();
    },
  );

  it.each([{ readonly: true }, { documentReady: false }, { linking: 'source' }])(
    'rejects an old or unavailable writable boundary %j without clearing operation IDs',
    (patch) => {
      const page = selectionGesture(patch);
      page.selectionDown();
      page.move({ clientX: 20, clientY: 30 });
      expect(page.fill.setPointerCapture).not.toHaveBeenCalled();
      expect(page.options.setNodes).not.toHaveBeenCalled();
      expect(page.options.setSelected).not.toHaveBeenCalled();
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.options.cancelOtherGestures).not.toHaveBeenCalled();
    },
  );

  it('rejects empty or removed drag IDs before capture or history acquisition', () => {
    const page = selectionGesture();
    page.selectionDown(createGesture(page.fill), ['missing']);
    page.move({ clientX: 20, clientY: 30 });
    expect(page.fill.setPointerCapture).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.cancelOtherGestures).not.toHaveBeenCalled();
    expect(page.options.setSelected).not.toHaveBeenCalled();
  });

  it('cancels the selection surface owner before reused IDs in another document can move', () => {
    const page = selectionGesture();
    page.selectionDown();
    page.options.storageKey = 'new-doc';
    page.options.nodes = [{ ...page.group, position: { x: 900, y: 950 } }];
    page.hook.rerender();
    page.move({ clientX: 40, clientY: 60 });
    page.end({ clientX: 40, clientY: 60 });
    expect(page.options.nodes[0].position).toEqual({ x: 900, y: 950 });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.fill.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('shares pointer identity and cancellation, without consuming another gesture final point', () => {
    const page = selectionGesture();
    page.selectionDown();
    page.selectionDown(createGesture(page.fill, { pointerId: 2 }));
    page.move({ pointerId: 2, clientX: 40, clientY: 60 });
    expect(page.options.record).not.toHaveBeenCalled();
    page.move({ clientX: 20, clientY: 30 });
    page.end({ type: 'lostpointercapture', clientX: 1000, clientY: 1000 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
    expect(page.hook.result.current.shouldSuppressClick({ pointerId: 1, detail: 1 })).toBe(false);
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(page.fill.setPointerCapture).toHaveBeenCalledOnce();
    page.move({ clientX: 2000, clientY: 2000 });
    expect(page.options.nodes[0].position).toEqual({ x: 120, y: 220 });
  });
});

function installDragCopy(page, patch = {}) {
  const history = vi.fn();
  let index = 0;
  const create = vi.fn((request) => {
    if (
      request.documentKey !== page.options.storageKey ||
      request.expectedNodes !== page.options.nodes ||
      request.expectedEdges !== page.options.edges
    )
      return false;
    const values = {
      nodes: page.options.nodes,
      edges: page.options.edges,
      copyEdges: request.copyEdges,
      makeId: () => `copied-${++index}`,
    };
    const plan =
      request.copyMode === 'single'
        ? planCanvasSingleNodeDragCopy({ ...values, sourceId: request.sourceIds[0] })
        : planCanvasSelectionDragCopy({ ...values, sourceIds: request.sourceIds });
    if (!plan.valid) return false;
    history(structuredClone({ nodes: page.options.nodes, edges: page.options.edges }));
    page.options.setNodes([...page.options.nodes, ...plan.copies]);
    page.options.edges = [...page.options.edges, ...plan.edgeCopies];
    return plan;
  });
  Object.assign(page.options, { createDragCopy: create, ...patch });
  page.hook.rerender();
  return { history, create };
}

describe('Alt copying through the explicit selection surface', () => {
  it('retains a plain Alt click and subthreshold jitter without allocating copies or history', () => {
    const page = selectionGesture();
    const transaction = installDragCopy(page);
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    expect(page.hook.result.current.altCopy).toBe(true);
    page.move({ clientX: 12, clientY: 22 });
    page.end({ clientX: 12, clientY: 22 });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(transaction.history).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes).toHaveLength(4);
    expect(page.options.selected).toEqual(['group', 'child', 'other']);
    expect(page.hook.result.current.altCopy).toBe(false);
  });

  it('copies once, moves copied roots and keeps originals and relative children unchanged', () => {
    const page = selectionGesture();
    const originals = structuredClone(page.options.nodes);
    const baselineNodes = page.options.nodes,
      baselineEdges = page.options.edges;
    const transaction = installDragCopy(page);
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    page.move({ clientX: 14, clientY: 20 });
    expect(transaction.create).toHaveBeenCalledExactlyOnceWith({
      sourceIds: ['group', 'child', 'other'],
      copyMode: 'selection',
      copyEdges: false,
      expectedNodes: baselineNodes,
      expectedEdges: baselineEdges,
      documentKey: 'doc',
    });
    expect(page.options.selected).toEqual(['copied-1', 'copied-2', 'copied-3']);
    page.move({ clientX: 20, clientY: 30 });
    page.end({ clientX: 25, clientY: 35 });
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.history).toHaveBeenCalledExactlyOnceWith({ nodes: originals, edges: [] });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes.slice(0, 4)).toEqual(originals);
    expect(page.options.nodes.slice(4)).toMatchObject([
      { id: 'copied-1', position: { x: 130, y: 230 } },
      { id: 'copied-2', parentId: 'copied-1', position: { x: 15, y: 25 } },
      { id: 'copied-3', position: { x: 430, y: 230 } },
    ]);
    expect(page.hook.result.current.altCopy).toBe(false);
    expect(page.hook.result.current.shouldSuppressClick({ detail: 1, pointerId: 1 })).toBe(true);
  });

  it.each(['metaKey', 'ctrlKey', 'nativeState'])(
    'fixes copy-edge %s at pointerdown and carries upstream as well as internal edges',
    (kind) => {
      const page = selectionGesture({
        edges: [
          { id: 'incoming', source: 'outside', target: 'child' },
          { id: 'internal', source: 'child', target: 'other' },
          { id: 'outgoing', source: 'other', target: 'outside' },
        ],
      });
      const transaction = installDragCopy(page);
      const patch =
        kind === 'nativeState'
          ? { nativeEvent: { getModifierState: (state) => state === 'Alt' || state === 'Meta' } }
          : { altKey: true, [kind]: true };
      page.selectionDown(createGesture(page.fill, patch));
      page.move({ clientX: 20, clientY: 30, altKey: false, metaKey: false, ctrlKey: false });
      page.end({ clientX: 25, clientY: 35 });
      expect(transaction.create.mock.calls[0][0].copyEdges).toBe(true);
      expect(page.options.edges.slice(3)).toMatchObject([
        { source: 'outside', target: 'copied-2' },
        { source: 'copied-2', target: 'copied-3' },
      ]);
      expect(transaction.create).toHaveBeenCalledOnce();
      expect(transaction.history).toHaveBeenCalledOnce();
    },
  );

  it('does not activate edge copying if Meta is first pressed after the pending gesture starts', () => {
    const page = selectionGesture();
    const transaction = installDragCopy(page);
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    page.move({ clientX: 20, clientY: 30, metaKey: true });
    expect(transaction.create.mock.calls[0][0].copyEdges).toBe(false);
  });

  it.each([false, undefined, new Error('allocation failed')])(
    'cancels an unavailable or failed copy transaction %s without moving originals or clearing selection',
    (result) => {
      const page = selectionGesture();
      const originals = page.options.nodes;
      const create = vi.fn(() => {
        if (result instanceof Error) throw result;
        return result;
      });
      installDragCopy(page, { createDragCopy: create });
      page.selectionDown(createGesture(page.fill, { altKey: true }));
      page.move({ clientX: 20, clientY: 30 });
      page.move({ clientX: 40, clientY: 50 });
      page.end({ clientX: 60, clientY: 70 });
      expect(create).toHaveBeenCalledOnce();
      expect(page.options.nodes).toBe(originals);
      expect(page.options.selected).toEqual(['group', 'child', 'other']);
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.hook.result.current.draggingNode).toBe(false);
      expect(page.hook.result.current.altCopy).toBe(false);
      expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each(['nodes', 'edges'])(
    'rejects a changed raw %s identity between pointerdown and threshold before moving anything',
    (key) => {
      const page = selectionGesture();
      const transaction = installDragCopy(page);
      page.selectionDown(createGesture(page.fill, { altKey: true }));
      page.options[key] = [...page.options[key]];
      const latestNodes = page.options.nodes;
      page.hook.rerender();
      page.move({ clientX: 20, clientY: 30 });
      expect(transaction.create).toHaveBeenCalledOnce();
      expect(transaction.history).not.toHaveBeenCalled();
      expect(page.options.nodes).toBe(latestNodes);
      expect(page.options.selected).toEqual(['group', 'child', 'other']);
      expect(page.options.record).not.toHaveBeenCalled();
    },
  );

  it.each(['pointercancel', 'lostpointercapture', 'blur'])(
    'keeps a canceled %s copy as one valid undoable graph and ignores false final coordinates',
    (type) => {
      const page = selectionGesture();
      const transaction = installDragCopy(page);
      page.selectionDown(createGesture(page.fill, { altKey: true }));
      page.move({ clientX: 20, clientY: 30 });
      if (type === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else page.end({ type, clientX: 1000, clientY: 1000 });
      const position = page.options.nodes.find((value) => value.id === 'copied-1').position;
      expect(position).toEqual({ x: 120, y: 220 });
      page.move({ clientX: 2000, clientY: 2000 });
      expect(page.options.nodes.find((value) => value.id === 'copied-1').position).toBe(position);
      expect(transaction.history).toHaveBeenCalledOnce();
      expect(page.hook.result.current.altCopy).toBe(false);
      expect(page.hook.result.current.shouldSuppressClick({ detail: 1 })).toBe(false);
    },
  );

  it.each([{ storageKey: 'next-doc' }, { readonly: true }, { documentReady: false }])(
    'cancels a pending copy before a changed boundary %j can allocate or move reused IDs',
    (patch) => {
      const page = selectionGesture();
      const transaction = installDragCopy(page);
      page.selectionDown(createGesture(page.fill, { altKey: true }));
      Object.assign(page.options, patch);
      page.options.nodes = [{ ...page.group, position: { x: 700, y: 800 } }];
      page.hook.rerender();
      page.move({ clientX: 20, clientY: 30 });
      page.end({ clientX: 1000, clientY: 1000 });
      expect(transaction.create).not.toHaveBeenCalled();
      expect(page.options.nodes[0].position).toEqual({ x: 700, y: 800 });
      expect(page.hook.result.current.altCopy).toBe(false);
    },
  );

  it('does not let another pointer commit a pending Alt copy and leaves unmount callbacks inert', () => {
    const page = selectionGesture();
    const transaction = installDragCopy(page);
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    page.move({ pointerId: 2, clientX: 30, clientY: 40 });
    page.end({ pointerId: 2, clientX: 30, clientY: 40 });
    expect(transaction.create).not.toHaveBeenCalled();
    const stale = page.hook.result.current;
    page.hook.unmount();
    act(() =>
      stale.move(createGesture(page.board, { type: 'pointermove', clientX: 50, clientY: 60 })),
    );
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.nodes).toHaveLength(4);
  });

  it('ends a successful old-document copy before reused copied IDs in the next document can move', () => {
    const page = selectionGesture();
    const transaction = installDragCopy(page);
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    page.move({ clientX: 20, clientY: 30 });
    page.options.storageKey = 'next-doc';
    page.options.nodes = [{ id: 'copied-1', position: { x: 900, y: 950 } }];
    page.options.selected = ['copied-1'];
    page.hook.rerender();
    page.move({ clientX: 1000, clientY: 1000 });
    page.end({ clientX: 1200, clientY: 1300 });
    expect(page.options.nodes[0].position).toEqual({ x: 900, y: 950 });
    expect(page.options.selected).toEqual(['copied-1']);
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.history).toHaveBeenCalledOnce();
    expect(page.hook.result.current.altCopy).toBe(false);
  });

  it('uses the source selection-copy protocol when Alt starts over a selected real group with descendants', () => {
    const page = selectionGesture();
    const transaction = installDragCopy(page);
    act(() =>
      page.hook.result.current.drag(createGesture(page.article, { altKey: true }), page.group),
    );
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      sourceIds: ['group', 'child', 'other'],
      copyMode: 'selection',
    });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(transaction.history).toHaveBeenCalledOnce();
    expect(page.options.nodes).toHaveLength(7);
    expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(page.options.nodes.find((node) => node.id === 'copied-1').position).toEqual({
      x: 120,
      y: 220,
    });
  });
});

describe('Alt copying from ordinary node and real-group surfaces', () => {
  it('transfers capture before inserting a copy and ignores the old surface loss while the board owns it', () => {
    const page = setupGesture();
    let captureOwner;
    page.article.setPointerCapture.mockImplementation(() => {
      captureOwner = page.article;
    });
    page.board.hasPointerCapture = vi.fn(() => captureOwner === page.board);
    page.board.setPointerCapture.mockImplementation(() => {
      captureOwner = page.board;
      // A transfer may dispatch the old capture's lifecycle event before insertion.
      page.hook.result.current.end(createGesture(page.article, { type: 'lostpointercapture' }));
    });
    const transaction = installDragCopy(page);
    const create = page.options.createDragCopy;
    page.options.createDragCopy = vi.fn((request) => {
      expect(captureOwner).toBe(page.board);
      return create(request);
    });
    page.down(createGesture(page.article, { altKey: true }));
    expect(captureOwner).toBe(page.article);
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create).toHaveBeenCalledOnce();
    page.end({ target: page.article, type: 'lostpointercapture', clientX: 1000, clientY: 1000 });
    expect(page.hook.result.current.draggingNode).toBe(true);
    page.move({ clientX: 30, clientY: 40 });
    page.end({ clientX: 35, clientY: 45 });
    expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(page.options.nodes[1].position).toEqual({ x: 150, y: 250 });
    expect(transaction.history).toHaveBeenCalledOnce();
    expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.article.releasePointerCapture).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'cancels a real board capture loss even with hasPointerCapture=%s',
    (held) => {
      const page = setupGesture();
      page.board.hasPointerCapture = vi.fn(() => held);
      const transaction = installDragCopy(page);
      page.down(createGesture(page.article, { altKey: true }));
      page.move({ clientX: 20, clientY: 30, altKey: true });
      const position = page.options.nodes[1].position;
      page.end({ type: 'lostpointercapture', target: page.board, clientX: 1000, clientY: 1000 });
      page.move({ clientX: 2000, clientY: 2000 });
      page.end({ clientX: 2000, clientY: 2000 });
      expect(page.hook.result.current.draggingNode).toBe(false);
      expect(page.options.nodes[1].position).toBe(position);
      expect(transaction.create).toHaveBeenCalledOnce();
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          pointerId: 1,
          detail: 1,
        }),
      ).toBe(true);
    },
  );

  it('cancels an old surface loss when the transferred board no longer holds capture', () => {
    const page = setupGesture();
    page.board.hasPointerCapture = vi.fn(() => false);
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.move({ clientX: 20, clientY: 30, altKey: true });
    const position = page.options.nodes[1].position;
    page.end({ type: 'lostpointercapture', target: page.article, clientX: 1000, clientY: 1000 });
    page.move({ clientX: 2000, clientY: 2000 });
    expect(page.hook.result.current.draggingNode).toBe(false);
    expect(page.options.nodes[1].position).toBe(position);
    expect(transaction.create).toHaveBeenCalledOnce();
  });

  it('keeps the original unmoved if stable capture transfer fails before the copy transaction', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.board.setPointerCapture.mockImplementation(() => {
      throw new Error('pointer expired');
    });
    page.down(createGesture(page.article, { altKey: true }));
    page.move({ clientX: 20, clientY: 30, altKey: true });
    page.end({ clientX: 1000, clientY: 1000 });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes).toHaveLength(1);
    expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('decides ordinary Alt intent at the first 4px event and fixes its upstream modifier afterward', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down();
    expect(page.hook.result.current.altCopy).toBe(false);
    expect(page.article.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    page.move({ clientX: 13, clientY: 20, altKey: true, ctrlKey: false });
    expect(transaction.create).not.toHaveBeenCalled();
    page.move({ clientX: 14, clientY: 20, altKey: true, ctrlKey: true });
    page.move({ clientX: 20, clientY: 30, altKey: false, ctrlKey: false });
    page.end({ clientX: 25, clientY: 35, altKey: false });
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'single',
      copyEdges: true,
    });
    expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
    expect(page.options.nodes[1].position).toEqual({ x: 130, y: 230 });
    expect(transaction.history).toHaveBeenCalledOnce();
  });

  it('clears the provisional copy cursor when Alt is released before ordinary drag start', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    expect(page.hook.result.current.altCopy).toBe(true);
    page.move({ clientX: 14, clientY: 20, altKey: false });
    expect(page.hook.result.current.altCopy).toBe(false);
    page.move({ clientX: 20, clientY: 30, altKey: true });
    page.end({ clientX: 25, clientY: 35, altKey: true });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.nodes).toHaveLength(1);
    expect(page.options.nodes[0].position).toEqual({ x: 130, y: 230 });
    expect(page.options.record).toHaveBeenCalledOnce();
  });

  it('copies the current post-selection graph, parameters and input without failing down-time CAS', () => {
    const page = setupGesture({ selected: [] });
    const transaction = installDragCopy(page);
    const downNodes = page.options.nodes;
    page.down(createGesture(page.article, { altKey: true }));
    const freshNodes = [
      { id: 'reference', type: 'image', position: { x: 0, y: 0 } },
      {
        ...page.node,
        position: { x: 150, y: 250 },
        data: {
          type: 'video',
          params: {
            modeType: 'image2video',
            prompt: '当前输入',
            imageList: [{ nodeId: 'reference', url: 'image.jpg' }],
          },
        },
      },
    ];
    const freshEdges = [{ id: 'incoming', source: 'reference', target: 'node' }];
    page.options.nodes = freshNodes;
    page.options.edges = freshEdges;
    page.hook.rerender();
    page.move({ clientX: 20, clientY: 30, altKey: true, metaKey: true });
    page.end({ clientX: 25, clientY: 35 });
    expect(freshNodes).not.toBe(downNodes);
    expect(transaction.create.mock.calls[0][0].expectedNodes).toBe(freshNodes);
    expect(transaction.create.mock.calls[0][0].expectedEdges).toBe(freshEdges);
    expect(page.options.nodes.slice(0, 2)).toEqual(freshNodes);
    expect(page.options.nodes.at(-1)).toMatchObject({
      position: { x: 180, y: 280 },
      data: {
        params: {
          modeType: 'image2video',
          prompt: '当前输入',
          imageList: [{ nodeId: 'reference', url: 'image.jpg' }],
        },
      },
    });
    expect(page.options.edges.at(-1)).toMatchObject({ source: 'reference', target: 'copied-1' });
    expect(transaction.history).toHaveBeenCalledExactlyOnceWith({
      nodes: freshNodes,
      edges: freshEdges,
    });
  });

  it('resolves the current visible selection at ordinary drag start rather than its down-time copy mode', () => {
    const page = setupGesture({
      nodes: [
        { id: 'node', type: 'image', position: { x: 100, y: 200 } },
        { id: 'other', type: 'image', position: { x: 500, y: 200 } },
        { id: 'hidden', type: 'image', hidden: true, position: { x: 800, y: 200 } },
      ],
    });
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.options.selected = ['node', 'other', 'hidden'];
    page.hook.rerender();
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'selection',
      sourceIds: ['node', 'other'],
    });
    expect(page.options.nodes).toHaveLength(5);
    expect(page.options.selected).toEqual(['copied-1', 'copied-2']);
  });

  it('rechecks real-group membership added after down before starting its selection copy', () => {
    const group = { id: 'node', type: 'group', position: { x: 100, y: 200 } };
    const page = setupGesture({ nodes: [group] });
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    expect(page.hook.result.current.altCopy).toBe(false);
    page.options.nodes = [
      group,
      { id: 'child', type: 'image', parentId: 'node', position: { x: 15, y: 25 } },
    ];
    page.hook.rerender();
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'selection',
      sourceIds: ['node'],
    });
    expect(page.options.nodes).toHaveLength(4);
    expect(page.options.nodes.at(-2).position).toEqual({ x: 120, y: 220 });
    expect(page.options.nodes.at(-1).position).toEqual({ x: 15, y: 25 });
  });

  it.each([
    { type: 'temp' },
    { data: { type: 'temp' } },
    { type: 'screenplay' },
    { hidden: true },
    { type: 'group' },
  ])('rechecks a source that becomes ineligible before ordinary drag start %j', (patch) => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.options.nodes = [{ ...page.node, ...patch }];
    page.hook.rerender();
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.hook.result.current.altCopy).toBe(false);
    expect(page.options.nodes).toHaveLength(1);
  });

  it('cancels a removed ordinary source before drag start and ignores later reuse of its ID', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.options.nodes = [];
    page.hook.rerender();
    page.move({ clientX: 20, clientY: 30, altKey: true });
    const reused = { ...page.node, position: { x: 900, y: 950 } };
    page.options.nodes = [reused];
    page.hook.rerender();
    page.move({ clientX: 1000, clientY: 1000, altKey: true });
    page.end({ clientX: 1200, clientY: 1200, altKey: true });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes).toEqual([reused]);
    expect(page.article.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([{ storageKey: 'next-doc' }, { readonly: true }, { documentReady: false }])(
    'cancels pending ordinary intent before a changed owner boundary %j can copy reused IDs',
    (patch) => {
      const page = setupGesture();
      const transaction = installDragCopy(page);
      page.down(createGesture(page.article, { altKey: true }));
      Object.assign(page.options, patch);
      const reused = { ...page.node, position: { x: 900, y: 950 } };
      page.options.nodes = [reused];
      page.hook.rerender();
      page.move({ clientX: 1000, clientY: 1000, altKey: true });
      page.end({ clientX: 1200, clientY: 1200, altKey: true });
      expect(transaction.create).not.toHaveBeenCalled();
      expect(page.options.nodes).toEqual([reused]);
      expect(page.options.record).not.toHaveBeenCalled();
    },
  );

  it('does not revive pending ordinary copy intent after an A to B to A document cycle', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.options.storageKey = 'next-doc';
    page.hook.rerender();
    page.options.storageKey = 'doc';
    const restored = { ...page.node, position: { x: 900, y: 950 } };
    page.options.nodes = [restored];
    page.hook.rerender();
    page.move({ clientX: 1000, clientY: 1000, altKey: true });
    page.end({ clientX: 1200, clientY: 1200, altKey: true });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.options.nodes).toEqual([restored]);
  });

  it.each([false, true])(
    'Escape cancels pending ordinary intent with down Alt=%s and guards the caller click',
    (altKey) => {
      const page = setupGesture();
      const transaction = installDragCopy(page);
      page.down(createGesture(page.article, { altKey }));
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      page.options.selected = [];
      page.move({ clientX: 1000, clientY: 1000, altKey: true });
      page.end({ clientX: 1200, clientY: 1200, altKey: true });
      expect(transaction.create).not.toHaveBeenCalled();
      expect(page.options.record).not.toHaveBeenCalled();
      expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          pointerId: 1,
          detail: 1,
        }),
      ).toBe(true);
      expect(page.options.selected).toEqual([]);
    },
  );

  it('uses one single-copy transaction after 4px and moves only the copy through final release', () => {
    const page = setupGesture();
    const original = structuredClone(page.options.nodes);
    const baselineNodes = page.options.nodes,
      baselineEdges = page.options.edges;
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    expect(page.hook.result.current.altCopy).toBe(true);
    expect(page.article.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.board.setPointerCapture).not.toHaveBeenCalled();
    page.move({ clientX: 13.99, clientY: 20 });
    expect(transaction.create).not.toHaveBeenCalled();
    page.move({ clientX: 14, clientY: 20, altKey: true });
    expect(page.board.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(transaction.create).toHaveBeenCalledExactlyOnceWith({
      sourceIds: ['node'],
      copyMode: 'single',
      copyEdges: false,
      documentKey: 'doc',
      expectedNodes: baselineNodes,
      expectedEdges: baselineEdges,
    });
    page.move({ clientX: 20, clientY: 30, altKey: false });
    page.end({ clientX: 25, clientY: 35 });
    expect(page.options.nodes[0]).toEqual(original[0]);
    expect(page.options.nodes[1]).toMatchObject({
      id: 'copied-1',
      position: { x: 130, y: 230 },
    });
    expect(page.options.selected).toEqual(['copied-1']);
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.history).toHaveBeenCalledExactlyOnceWith({ nodes: original, edges: [] });
    expect(page.options.record).not.toHaveBeenCalled();
    expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.hook.result.current.altCopy).toBe(false);
  });

  it.each([{ selected: [] }, { selected: ['other'] }])(
    'uses the normal singleton selection before resolving an initially unselected Alt target %j',
    ({ selected }) => {
      const page = setupGesture({
        selected,
        nodes: [
          { id: 'node', type: 'image', position: { x: 100, y: 200 } },
          { id: 'other', type: 'image', position: { x: 500, y: 200 } },
        ],
      });
      const original = structuredClone(page.options.nodes);
      const transaction = installDragCopy(page);
      page.down(createGesture(page.article, { altKey: true }));
      expect(page.options.selected).toEqual(['node']);
      page.move({ clientX: 20, clientY: 30, altKey: true });
      expect(transaction.create.mock.calls[0][0]).toMatchObject({
        copyMode: 'single',
        sourceIds: ['node'],
      });
      expect(page.options.nodes.slice(0, 2)).toEqual(original);
      expect(page.options.nodes).toHaveLength(3);
      expect(page.options.selected).toEqual(['copied-1']);
      expect(transaction.history).toHaveBeenCalledOnce();
    },
  );

  it('detaches a sole selected grouped child at world coordinates without copying parent or siblings', () => {
    const group = { id: 'group', type: 'group', position: { x: 100, y: 200 } };
    const child = {
      id: 'node',
      type: 'image',
      parentId: 'group',
      extent: 'parent',
      position: { x: 15, y: 25 },
      data: { type: 'image', name: '组内图片' },
    };
    const sibling = { id: 'sibling', parentId: 'group', position: { x: 50, y: 60 } };
    const page = setupGesture({ nodes: [group, child, sibling], selected: ['node'] });
    const originals = structuredClone(page.options.nodes);
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.move({ clientX: 20, clientY: 30, altKey: true });
    page.end({ clientX: 25, clientY: 35 });
    const copy = page.options.nodes.at(-1);
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'single',
      sourceIds: ['node'],
    });
    expect(page.options.nodes).toHaveLength(4);
    expect(page.options.nodes.slice(0, 3)).toEqual(originals);
    expect(copy.position).toEqual({ x: 145, y: 255 });
    expect(copy.parentId).toBeUndefined();
    expect(copy.extent).toBeUndefined();
    expect(copy.data.canvasAltDetachedCopy).toBe(true);
    expect(page.options.selected).toEqual([copy.id]);
    expect(transaction.history).toHaveBeenCalledOnce();
  });

  it.each(['metaKey', 'ctrlKey', 'nativeState'])(
    'samples single-copy upstream %s at drag start and keeps it fixed afterward',
    (kind) => {
      const originals = [
        { id: 'upstream', type: 'text', position: { x: 0, y: 0 } },
        { id: 'node', type: 'image', position: { x: 100, y: 200 } },
        { id: 'downstream', type: 'image', position: { x: 500, y: 200 } },
      ];
      const edges = [
        { id: 'incoming', source: 'upstream', target: 'node' },
        { id: 'self', source: 'node', target: 'node' },
        { id: 'outgoing', source: 'node', target: 'downstream' },
      ];
      const page = setupGesture({ nodes: originals, edges });
      const transaction = installDragCopy(page);
      const patch =
        kind === 'nativeState'
          ? { nativeEvent: { getModifierState: (state) => state === 'Alt' || state === 'Meta' } }
          : { altKey: true, [kind]: true };
      page.down(createGesture(page.article, patch));
      page.move({ clientX: 20, clientY: 30, ...patch });
      page.move({ clientX: 22, clientY: 32, altKey: false, metaKey: false, ctrlKey: false });
      page.end({ clientX: 25, clientY: 35 });
      expect(transaction.create.mock.calls[0][0]).toMatchObject({
        copyMode: 'single',
        copyEdges: true,
      });
      expect(page.options.nodes.slice(0, 3)).toEqual(originals);
      expect(page.options.edges.slice(0, 3)).toEqual(edges);
      expect(page.options.edges.slice(3)).toMatchObject([
        { source: 'upstream', target: 'copied-1' },
        { source: 'node', target: 'copied-1' },
      ]);
      expect(transaction.create).toHaveBeenCalledOnce();
      expect(transaction.history).toHaveBeenCalledOnce();
    },
  );

  it('copies a visible multi-selection when initiated over an already selected ordinary node', () => {
    const page = selectionGesture({ selected: ['child', 'other'] });
    const originals = structuredClone(page.options.nodes);
    const transaction = installDragCopy(page);
    act(() =>
      page.hook.result.current.drag(createGesture(page.article, { altKey: true }), page.child),
    );
    page.move({ clientX: 20, clientY: 30, altKey: true });
    page.end({ clientX: 25, clientY: 35 });
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'selection',
      sourceIds: ['child', 'other'],
    });
    expect(page.options.nodes.slice(0, 4)).toEqual(originals);
    expect(page.options.nodes).toHaveLength(7);
    expect(page.options.selected).toEqual(['copied-1', 'copied-2', 'copied-3']);
    expect(transaction.history).toHaveBeenCalledOnce();
    expect(page.options.record).not.toHaveBeenCalled();
  });

  it('copies a sole selected real group with one child through selection mode', () => {
    const page = selectionGesture({ selected: ['group'] });
    const originals = structuredClone(page.options.nodes);
    const transaction = installDragCopy(page);
    act(() =>
      page.hook.result.current.drag(createGesture(page.article, { altKey: true }), page.group),
    );
    page.move({ clientX: 20, clientY: 30, altKey: true });
    page.end({ clientX: 25, clientY: 35 });
    expect(transaction.create.mock.calls[0][0]).toMatchObject({
      copyMode: 'selection',
      sourceIds: ['group'],
    });
    expect(page.options.nodes.slice(0, 4)).toEqual(originals);
    expect(page.options.nodes).toHaveLength(6);
    expect(page.options.nodes.at(-2).position).toEqual({ x: 130, y: 230 });
    expect(page.options.nodes.at(-1).position).toEqual({ x: 15, y: 25 });
    expect(page.options.selected).toEqual(['copied-1', 'copied-2']);
    expect(transaction.history).toHaveBeenCalledOnce();
  });

  it.each([
    { type: 'group' },
    { type: 'video_group' },
    { type: 'screenplay' },
    { type: 'image', data: { type: 'screenplay' } },
    { type: 'temp' },
    { type: 'image', data: { type: 'temp' } },
    { type: 'image', hidden: true },
  ])('does not manufacture Alt-copy eligibility for an unavailable singleton %j', (patch) => {
    const page = setupGesture({
      nodes: [{ id: 'node', position: { x: 100, y: 200 }, ...patch }],
    });
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    expect(page.hook.result.current.altCopy).toBe(false);
    page.move({ clientX: 20, clientY: 30, altKey: true });
    expect(transaction.create).not.toHaveBeenCalled();
    expect(page.options.nodes).toHaveLength(1);
    expect(page.options.record).toHaveBeenCalledOnce();
  });

  it('keeps a virtual-frame copy captured by the board when parent expansion removes the original frame', () => {
    const page = selectionGesture({
      nodes: [
        { id: 'group', type: 'group', position: { x: 100, y: 200 } },
        { id: 'child', parentId: 'group', position: { x: 15, y: 25 } },
        { id: 'sibling', parentId: 'group', position: { x: 50, y: 60 } },
      ],
      selected: ['child', 'sibling'],
    });
    const originals = structuredClone(page.options.nodes);
    const transaction = installDragCopy(page);
    const setSelected = page.options.setSelected;
    page.options.setSelected = vi.fn((ids) => {
      setSelected(ids);
      page.overlay.remove();
    });
    page.selectionDown(createGesture(page.fill, { altKey: true }));
    expect(page.board.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.fill.setPointerCapture).not.toHaveBeenCalled();
    page.move({ clientX: 20, clientY: 30 });
    expect(page.overlay.parentNode).toBeNull();
    page.move({ clientX: 30, clientY: 40 });
    page.end({ clientX: 35, clientY: 45 });
    expect(page.options.nodes.slice(0, 3)).toEqual(originals);
    expect(page.options.nodes.find((node) => node.id === 'copied-1').position).toEqual({
      x: 150,
      y: 250,
    });
    expect(page.options.nodes.find((node) => node.id === 'copied-2').position).toEqual({
      x: 15,
      y: 25,
    });
    expect(transaction.create).toHaveBeenCalledOnce();
    expect(transaction.history).toHaveBeenCalledOnce();
    expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(page.fill.releasePointerCapture).not.toHaveBeenCalled();
  });

  it.each([false, undefined, new Error('copy blocked')])(
    'does not move originals or let a failed single copy %s reselect its source on compatibility click',
    (result) => {
      const page = setupGesture();
      const originals = page.options.nodes;
      const create = vi.fn(() => {
        if (result instanceof Error) throw result;
        return result;
      });
      installDragCopy(page, { createDragCopy: create });
      page.down(createGesture(page.article, { altKey: true }));
      page.move({ clientX: 20, clientY: 30, altKey: true });
      page.end({ clientX: 1000, clientY: 1000 });
      expect(page.options.nodes).toBe(originals);
      expect(page.options.record).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledOnce();
      const outside = document.createElement('article');
      expect(
        page.hook.result.current.shouldSuppressClick({ target: outside, detail: 1, pointerId: 1 }),
      ).toBe(false);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          detail: 0,
          pointerId: 1,
        }),
      ).toBe(false);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          detail: 1,
          pointerId: 2,
        }),
      ).toBe(false);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          detail: 1,
          pointerId: 1,
        }),
      ).toBe(true);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          detail: 1,
          pointerId: 1,
        }),
      ).toBe(false);
      expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'escape', 'public cancel'])(
    'stops a %s copy at its last valid position and suppresses only its caller compatibility click',
    (kind) => {
      const page = setupGesture();
      const originals = structuredClone(page.options.nodes);
      const transaction = installDragCopy(page);
      page.down(createGesture(page.article, { altKey: true }));
      page.move({ clientX: 20, clientY: 30, altKey: true });
      const position = page.options.nodes.at(-1).position;
      if (kind === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else if (kind === 'hidden') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      } else if (kind === 'escape')
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      else if (kind === 'public cancel') act(() => page.hook.result.current.cancel());
      else page.end({ type: kind, clientX: 1000, clientY: 1000 });
      page.move({ clientX: 2000, clientY: 2000 });
      page.end({ clientX: 2000, clientY: 2000 });
      expect(page.options.nodes[0]).toEqual(originals[0]);
      expect(page.options.nodes.at(-1).position).toBe(position);
      expect(page.hook.result.current.altCopy).toBe(false);
      expect(page.hook.result.current.draggingNode).toBe(false);
      expect(transaction.history).toHaveBeenCalledOnce();
      expect(page.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: document.createElement('article'),
          pointerId: 1,
          detail: 1,
        }),
      ).toBe(false);
      expect(
        page.hook.result.current.shouldSuppressClick({
          target: page.article,
          pointerId: 1,
          detail: 1,
        }),
      ).toBe(true);
    },
  );

  it('ignores composition Escape and clears the old cancelled-copy guard at the next fresh pointerdown', () => {
    const page = setupGesture();
    const transaction = installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    page.move({ clientX: 20, clientY: 30, altKey: true });
    act(() =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true })),
    );
    expect(page.hook.result.current.altCopy).toBe(true);
    act(() => page.hook.result.current.cancel());
    page.down(createGesture(page.article));
    expect(
      page.hook.result.current.shouldSuppressClick({
        target: page.article,
        pointerId: 1,
        detail: 1,
      }),
    ).toBe(false);
    expect(transaction.create).toHaveBeenCalledOnce();
  });

  it('expires a cancelled-copy compatibility guard without consuming a later click', () => {
    let now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const page = setupGesture();
    installDragCopy(page);
    page.down(createGesture(page.article, { altKey: true }));
    act(() => page.hook.result.current.cancel());
    now += 501;
    expect(
      page.hook.result.current.shouldSuppressClick({
        target: page.article,
        pointerId: 1,
        detail: 1,
      }),
    ).toBe(false);
  });
});

function setupPanFrames() {
  let id = 0;
  const pending = new Map();
  const callbacks = new Map();
  const request = vi.fn((callback) => {
    const nextId = ++id;
    pending.set(nextId, callback);
    callbacks.set(nextId, callback);
    return nextId;
  });
  const cancel = vi.fn((frameId) => pending.delete(frameId));
  vi.stubGlobal('requestAnimationFrame', request);
  vi.stubGlobal('cancelAnimationFrame', cancel);
  return {
    request,
    cancel,
    get size() {
      return pending.size;
    },
    get lastCallback() {
      return callbacks.get(id);
    },
    advance(timestamp) {
      const batch = [...pending.values()];
      pending.clear();
      act(() => batch.forEach((callback) => callback(timestamp)));
    },
  };
}

function setupPanGesture(kind = 'node') {
  const selection = kind === 'selection' || kind === 'selection copy';
  const copied = kind === 'node copy' || kind === 'selection copy';
  const page = kind === 'group' || selection ? selectionGesture() : setupGesture();
  const rectangle = { left: 100, top: 50, width: 500, height: 400, right: 600, bottom: 450 };
  page.board.getBoundingClientRect = vi.fn(() => rectangle);
  page.options.viewRef.current = { x: 0, y: 0, z: 1 };
  page.options.point = (event) => ({
    x:
      (event.clientX - rectangle.left - page.options.viewRef.current.x) /
      page.options.viewRef.current.z,
    y:
      (event.clientY - rectangle.top - page.options.viewRef.current.y) /
      page.options.viewRef.current.z,
  });
  const transaction = copied ? installDragCopy(page) : null;
  const event = createGesture(selection ? page.fill : page.article, {
    clientX: 200,
    clientY: 200,
    altKey: copied,
  });
  if (selection) page.selectionDown(event);
  else if (kind === 'group') act(() => page.hook.result.current.drag(event, page.group));
  else page.down(event);
  return {
    ...page,
    transaction,
    rectangle,
    edgeMove: (patch = {}) => page.move({ clientX: 600, clientY: 200, altKey: copied, ...patch }),
  };
}

describe('node and selection dragging edge pan', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(['node', 'group', 'node copy'])(
    'uses the ordinary per-frame protocol for %s and keeps originals and relative children stable',
    (kind) => {
      const frames = setupPanFrames();
      const page = setupPanGesture(kind);
      page.edgeMove();
      const movedId = kind === 'node copy' ? 'copied-1' : kind === 'group' ? 'group' : 'node';
      expect(page.options.nodes.find((node) => node.id === movedId).position).toEqual({
        x: 500,
        y: 200,
      });
      frames.advance(100);
      expect(page.options.viewRef.current).toEqual({ x: -15, y: 0, z: 1 });
      expect(page.options.nodes.find((node) => node.id === movedId).position).toEqual({
        x: 515,
        y: 200,
      });
      frames.advance(900);
      expect(page.options.viewRef.current.x).toBe(-30);
      expect(page.options.nodes.find((node) => node.id === movedId).position.x).toBe(530);
      if (kind === 'group')
        expect(page.options.nodes.find((node) => node.id === 'child').position).toEqual({
          x: 15,
          y: 25,
        });
      if (kind === 'node copy') {
        expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
        expect(page.transaction.history).toHaveBeenCalledOnce();
        expect(page.options.record).not.toHaveBeenCalled();
      } else expect(page.options.record).toHaveBeenCalledOnce();
      page.end({ clientX: 650, clientY: 200 });
      expect(page.options.nodes.find((node) => node.id === movedId).position.x).toBe(580);
      expect(frames.size).toBe(0);
    },
  );

  it.each(['selection', 'selection copy'])(
    'uses dt0 first, stationary next-frame pan and 50ms cap for %s',
    (kind) => {
      const frames = setupPanFrames();
      const page = setupPanGesture(kind);
      page.edgeMove();
      const movedId = kind === 'selection copy' ? 'copied-1' : 'group';
      frames.advance(100);
      expect(page.options.viewRef.current).toEqual({ x: 0, y: 0, z: 1 });
      expect(frames.size).toBe(1);
      frames.advance(116);
      expect(page.options.viewRef.current.x).toBeCloseTo(-11.52);
      expect(page.options.nodes.find((node) => node.id === movedId).position.x).toBeCloseTo(511.52);
      frames.advance(1116);
      expect(page.options.viewRef.current.x).toBeCloseTo(-47.52);
      expect(page.options.nodes.find((node) => node.id === movedId).position.x).toBeCloseTo(547.52);
      expect(
        page.options.nodes.find(
          (node) => node.id === (kind === 'selection copy' ? 'copied-2' : 'child'),
        ).position,
      ).toEqual({ x: 15, y: 25 });
      page.end({ clientX: 650, clientY: 200 });
      expect(page.options.nodes.find((node) => node.id === movedId).position.x).toBeCloseTo(597.52);
      expect(frames.size).toBe(0);
      if (kind === 'selection copy') {
        expect(page.options.nodes[0].position).toEqual({ x: 100, y: 200 });
        expect(page.transaction.history).toHaveBeenCalledOnce();
      } else expect(page.options.record).toHaveBeenCalledOnce();
    },
  );

  it('stops a virtual frame at the center and resumes its edge pan with a fresh dt0 tick', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture('selection');
    page.move({ clientX: 250, clientY: 200 });
    frames.advance(100);
    expect(frames.size).toBe(0);
    page.edgeMove();
    frames.advance(900);
    expect(page.options.viewRef.current.x).toBe(0);
    expect(frames.size).toBe(1);
    frames.advance(916);
    expect(page.options.viewRef.current.x).toBeCloseTo(-11.52);
    page.move({ clientX: 250, clientY: 200 });
    frames.advance(932);
    expect(frames.size).toBe(0);
    expect(page.options.nodes.find((node) => node.id === 'group').position.x).toBeCloseTo(161.52);
  });

  it.each(['node', 'selection'])(
    'reads the latest suppress callback cursor for %s without panning over the workspace panel',
    (kind) => {
      const frames = setupPanFrames();
      const page = setupPanGesture(kind);
      let suppressed = true;
      const suppress = vi.fn(() => suppressed);
      page.options.suppressAutoPan = suppress;
      page.edgeMove();
      frames.advance(100);
      expect(suppress).toHaveBeenLastCalledWith({ clientX: 600, clientY: 200 });
      expect(page.options.setView).not.toHaveBeenCalled();
      suppressed = false;
      page.edgeMove({ clientX: 610 });
      frames.advance(116);
      expect(suppress).toHaveBeenLastCalledWith({ clientX: 610, clientY: 200 });
      if (kind === 'selection') {
        expect(page.options.viewRef.current.x).toBe(0);
        frames.advance(132);
        expect(page.options.viewRef.current.x).toBeCloseTo(-11.52);
      } else expect(page.options.viewRef.current.x).toBe(-15);
    },
  );

  it('uses live zoom and board coordinates for ordinary world-cursor projection', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture();
    page.edgeMove();
    page.options.viewRef.current = { x: 0, y: 0, z: 2 };
    frames.advance(100);
    expect(page.options.viewRef.current).toEqual({ x: -15, y: 0, z: 2 });
    expect(page.options.nodes[0].position).toEqual({ x: 257.5, y: 125 });
    page.rectangle.left = 120;
    page.rectangle.top = 70;
    page.move({ clientX: 620, clientY: 220 });
    expect(page.options.nodes[0].position).toEqual({ x: 257.5, y: 125 });
  });

  it('accumulates virtual-frame pan compensation using each tick zoom', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture('selection');
    page.edgeMove();
    frames.advance(100);
    page.options.viewRef.current = { x: 0, y: 0, z: 2 };
    frames.advance(116);
    expect(page.options.nodes.find((node) => node.id === 'group').position.x).toBeCloseTo(305.76);
    page.options.viewRef.current = { ...page.options.viewRef.current, z: 1 };
    frames.advance(132);
    expect(page.options.nodes.find((node) => node.id === 'group').position.x).toBeCloseTo(517.28);
  });

  it.each([
    'cancel',
    'escape',
    'blur',
    'hidden',
    'pointercancel',
    'lostpointercapture',
    'document',
    'readonly',
    'loading',
    'touch takeover',
    'unmount',
  ])('cancels RAF ownership and ignores a late tick after %s', (kind) => {
    const frames = setupPanFrames();
    const page = setupPanGesture();
    page.edgeMove();
    frames.advance(100);
    const late = frames.lastCallback;
    const position = page.options.nodes[0].position;
    const view = page.options.viewRef.current;
    if (kind === 'escape')
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    else if (kind === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else if (kind === 'hidden') {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      act(() => document.dispatchEvent(new Event('visibilitychange')));
    } else if (kind === 'pointercancel' || kind === 'lostpointercapture') page.end({ type: kind });
    else if (kind === 'unmount') page.hook.unmount();
    else if (kind === 'document' || kind === 'readonly' || kind === 'loading') {
      Object.assign(
        page.options,
        kind === 'document'
          ? { storageKey: 'next' }
          : kind === 'readonly'
            ? { readonly: true }
            : { documentReady: false },
      );
      page.hook.rerender();
    } else act(() => page.hook.result.current.cancel());
    act(() => late(116));
    expect(frames.size).toBe(0);
    expect(frames.cancel).toHaveBeenCalled();
    expect(page.options.nodes[0].position).toBe(position);
    expect(page.options.viewRef.current).toBe(view);
  });

  it('lets another pointer neither move nor end the edge-pan owner and cancels if its moving node is deleted', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture();
    page.edgeMove();
    page.move({ clientX: 100, clientY: 200, pointerId: 2 });
    page.end({ type: 'pointercancel', pointerId: 2 });
    frames.advance(100);
    expect(page.options.viewRef.current.x).toBe(-15);
    page.options.nodes = [];
    frames.advance(116);
    expect(frames.size).toBe(0);
    expect(page.options.viewRef.current.x).toBe(-15);
    expect(page.hook.result.current.draggingNode).toBe(false);
  });

  it('does not start edge pan for plain click or subthreshold jitter', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture();
    page.move({ clientX: 203, clientY: 200 });
    page.end({ clientX: 203, clientY: 200 });
    expect(frames.request).not.toHaveBeenCalled();
    expect(page.options.record).not.toHaveBeenCalled();
  });

  it('runs the pure finalizer on final pointerup positions with current release point and one history entry', () => {
    const frames = setupPanFrames();
    const page = setupPanGesture();
    const finalize = vi.fn(({ nodes }) =>
      nodes.map((node) => (node.id === 'node' ? { ...node, data: { finalized: true } } : node)),
    );
    page.options.finalizeNodeDrag = finalize;
    page.edgeMove();
    frames.advance(100);
    expect(finalize).not.toHaveBeenCalled();
    page.end({ clientX: 650, clientY: 200 });
    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize.mock.calls[0][0]).toMatchObject({
      draggedNodeId: 'node',
      nodeIds: ['node'],
      selectedIds: ['node'],
      surface: 'node',
      copied: false,
      releasePoint: { x: 565, y: 150 },
      nodes: [{ id: 'node', position: { x: 565, y: 200 } }],
    });
    expect(page.options.nodes[0].data.finalized).toBe(true);
    expect(page.options.record).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
  });

  it.each(['node copy', 'selection'])(
    'passes finalizer source context for %s without adding history',
    (kind) => {
      setupPanFrames();
      const page = setupPanGesture(kind);
      const finalize = vi.fn(({ nodes }) => nodes);
      page.options.finalizeNodeDrag = finalize;
      page.edgeMove();
      page.end({ clientX: 650, clientY: 200 });
      expect(finalize).toHaveBeenCalledOnce();
      expect(finalize.mock.calls[0][0]).toMatchObject({
        surface: kind === 'selection' ? 'selection' : 'node',
        copied: kind === 'node copy',
        nodeIds: kind === 'node copy' ? ['copied-1'] : ['group', 'other'],
      });
      if (kind === 'node copy') expect(page.transaction.history).toHaveBeenCalledOnce();
      else expect(page.options.record).toHaveBeenCalledOnce();
    },
  );

  it('allows a delayed completed updater after capture cleanup and reuses its exact immutable projection on replay', () => {
    setupPanFrames();
    const page = setupPanGesture();
    const queued = [];
    page.options.setNodes = vi.fn((update) => queued.push(update));
    const finalize = vi.fn(({ nodes }) => nodes);
    page.options.finalizeNodeDrag = finalize;
    page.edgeMove();
    page.end({ clientX: 650, clientY: 200 });
    const finalUpdate = queued.at(-1);
    const baseline = page.options.nodes;
    expect(page.hook.result.current.draggingNode).toBe(false);
    const projected = finalUpdate(baseline);
    expect(projected[0].position).toEqual({ x: 550, y: 200 });
    expect(finalUpdate(baseline)).toBe(projected);
    expect(baseline[0].position).toEqual({ x: 100, y: 200 });
    expect(finalize).toHaveBeenCalledOnce();
    expect(page.options.record).toHaveBeenCalledOnce();
  });

  it.each(['new gesture', 'cancel', 'A to B to A'])(
    'rejects a delayed final updater after %s replaces its completed epoch',
    (kind) => {
      setupPanFrames();
      const page = setupPanGesture();
      const queued = [];
      page.options.setNodes = vi.fn((update) => queued.push(update));
      const finalize = vi.fn(({ nodes }) => nodes);
      page.options.finalizeNodeDrag = finalize;
      page.edgeMove();
      page.end({ clientX: 650, clientY: 200 });
      const finalUpdate = queued.at(-1);
      if (kind === 'new gesture') page.down();
      else if (kind === 'cancel') act(() => page.hook.result.current.cancel());
      else {
        page.options.storageKey = 'next';
        page.hook.rerender();
        page.options.storageKey = 'doc';
        page.hook.rerender();
      }
      const reused = [{ ...page.node, position: { x: 900, y: 950 } }];
      expect(finalUpdate(reused)).toBe(reused);
      expect(finalize).not.toHaveBeenCalled();
    },
  );
});
