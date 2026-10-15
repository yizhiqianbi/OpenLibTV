import { useRef, useState } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import { useCanvasMultiConnection } from './useCanvasMultiConnection.js';

let frames, nextFrame;
const originalHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  frames = new Map();
  nextFrame = 1;
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = nextFrame++;
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
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  if (originalHitTest) Object.defineProperty(document, 'elementFromPoint', originalHitTest);
  else delete document.elementFromPoint;
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
  else delete document.hidden;
});
const node = (id, x, y, type = 'image') => ({
  id,
  type,
  position: { x, y },
  width: 200,
  height: 200,
  data: {
    type,
    action: `${type}_generate`,
    url: [`/${id}.${type === 'video' ? 'mp4' : 'png'}`],
    params: { model: models.default[type], prompt: '' },
  },
});
const group = (id, parentId) => ({
  id,
  type: 'group',
  ...(parentId ? { parentId } : {}),
  position: { x: 0, y: 0 },
  width: 400,
  height: 650,
  data: { type: 'group', name: id },
});
const groupNodes = (root = 'group-a') => [
  group(root),
  group('nested', root),
  { ...node('a', 100, 100), parentId: root },
  { ...node('b', 100, 400), parentId: 'nested' },
  node('target', 500, 100),
];
function setup(patch = {}) {
  const board = document.createElement('main'),
    handle = document.createElement('button');
  board.append(handle);
  document.body.append(board);
  board.getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    right: 1100,
    bottom: 750,
    width: 1000,
    height: 700,
  });
  board.setPointerCapture = vi.fn();
  board.releasePointerCapture = vi.fn();
  handle.setPointerCapture = vi.fn();
  const actions = { current: null },
    recorded = vi.fn(),
    connect = vi.fn((value) => actions.current.connectMultiNodes(value)),
    validate = vi.fn((value) => actions.current.planMultiConnection(value)),
    options = {
      documentKey: 'A',
      ready: true,
      readonly: false,
      sourceIds: ['a', 'b'],
      initialNodes: [node('a', 100, 100), node('b', 100, 400), node('target', 500, 100)],
      initialEdges: [],
      bounds: { x: 100, y: 100, width: 200, height: 500 },
      board: { current: board },
      viewRef: { current: { x: 0, y: 0, z: 1 } },
      cancelOtherGestures: vi.fn(),
      setMenu: vi.fn(),
      setContext: vi.fn(),
      setSelected: vi.fn(),
      ...patch,
    };
  options.point = (event) => {
    const rect = board.getBoundingClientRect(),
      view = options.viewRef.current;
    return {
      x: (event.clientX - rect.left - view.x) / view.z,
      y: (event.clientY - rect.top - view.y) / view.z,
    };
  };
  options.setView = vi.fn((next) => {
    options.viewRef.current = next;
  });
  const page = renderHook(() => {
    const [storedNodes, setNodes] = useState(options.initialNodes),
      [edges, setEdges] = useState(options.initialEdges),
      graph = useRef(null),
      nodes = options.nodesOverride || storedNodes;
    graph.current = {
      documentKey: options.documentKey,
      ready: options.ready,
      readonly: options.readonly,
      nodes,
      edges,
      models,
    };
    const history = useSnapshotHistory(
      { nodes, edges },
      {
        restore: (snapshot) => {
          setNodes(snapshot.nodes);
          setEdges(snapshot.edges);
        },
      },
    );
    actions.current = useCanvasGraphActions({
      documentKey: options.documentKey,
      currentDocument: graph,
      setNodes,
      setEdges,
      recordSnapshot: (snapshot) => {
        recorded(snapshot);
        history.recordSnapshot(snapshot);
      },
    });
    const connection = useCanvasMultiConnection({
      ...options,
      nodes,
      edges,
      models,
      getDocument: () => graph.current,
      validate,
      connectMultiNodes: connect,
    });
    return { ...connection, nodes, edges, graph, ...history };
  });
  const event = (patch = {}) => ({
    currentTarget: handle,
    target: handle,
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: 450,
    clientY: 300,
    detail: 1,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...patch,
  });
  const down = (patch = {}) => {
    const value = event(patch);
    act(() => page.result.current.start(value));
    return value;
  };
  const click = (patch = {}) => {
    const value = event(patch);
    act(() => page.result.current.click(value));
    return value;
  };
  const native = (type, patch = {}) => {
    const value = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(
      value,
      Object.fromEntries(
        Object.entries({ pointerId: 1, clientX: 700, clientY: 250, ...patch }).map(
          ([key, entry]) => [key, { value: entry }],
        ),
      ),
    );
    act(() => window.dispatchEvent(value));
    return value;
  };
  const frame = (timestamp) => {
    const [id, callback] = frames.entries().next().value || [];
    if (!callback) throw new Error('No multi-connection frame scheduled');
    frames.delete(id);
    act(() => callback(timestamp));
    return callback;
  };
  const rerender = (patch) => {
    Object.assign(options, patch);
    page.rerender();
  };
  return {
    page,
    options,
    board,
    handle,
    event,
    down,
    click,
    native,
    frame,
    rerender,
    recorded,
    connect,
    validate,
  };
}

describe('multi-selection connection gesture and request ownership', () => {
  it.each([{ button: 1 }, { isPrimary: false }])(
    'ignores a non-primary initiating pointer %j',
    (patch) => {
      const p = setup();
      p.down(patch);
      p.native('pointermove');
      p.native('pointerup');
      expect(p.board.setPointerCapture).not.toHaveBeenCalled();
      expect(p.page.result.current.preview).toBeNull();
      expect(p.page.result.current.menu).toBeNull();
      expect(p.recorded).not.toHaveBeenCalled();
    },
  );

  it('keeps the initiating pointer as owner and ignores composition Escape', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { pointerId: 2 });
    p.native('pointerup', { pointerId: 2 });
    expect(p.page.result.current.preview).toBeNull();
    p.native('pointermove');
    const preview = p.page.result.current.preview;
    p.native('keydown', { key: 'Escape', isComposing: true });
    expect(p.page.result.current.preview).toBe(preview);
    p.native('pointerup');
    expect(p.recorded).toHaveBeenCalledOnce();
  });

  it('keeps pending movement below 10px and captures the stable board at exactly 10px', () => {
    const p = setup();
    p.down();
    expect(p.board.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(p.handle.setPointerCapture).not.toHaveBeenCalled();
    const jitter = p.native('pointermove', { clientX: 459.99, clientY: 300 });
    expect(jitter.defaultPrevented).toBe(false);
    expect(p.page.result.current.preview).toBeNull();
    expect(frames.size).toBe(0);
    const move = p.native('pointermove', { clientX: 460, clientY: 300 });
    expect(move.defaultPrevented).toBe(true);
    expect(p.page.result.current.preview).toMatchObject({
      sourceIds: ['a', 'b'],
      screenPoint: { x: 460, y: 300 },
    });
    expect(frames.size).toBe(1);
    p.native('pointercancel');
    expect(p.page.result.current.preview).toBeNull();
    expect(p.page.result.current.menu).toBeNull();
    expect(p.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('opens only once before 300ms, suppresses the pointer click, and preserves keyboard toggling', () => {
    const p = setup();
    p.down();
    act(() => vi.advanceTimersByTime(299));
    p.native('pointerup', { clientX: 450, clientY: 300 });
    const menu = p.page.result.current.menu;
    expect(menu).toMatchObject({ kind: 'multi', opener: p.handle, sourceIds: ['a', 'b'] });
    expect(menu.point).toBeUndefined();
    p.click();
    expect(p.page.result.current.menu).toBe(menu);
    p.click({ detail: 0 });
    expect(p.page.result.current.menu).toBeNull();
    p.click({ detail: 0 });
    expect(p.page.result.current.menu).not.toBeNull();
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('does not turn a stationary 300ms hold or its following native click into a short press', () => {
    const p = setup();
    p.down();
    act(() => vi.advanceTimersByTime(300));
    p.native('pointerup', { clientX: 450, clientY: 300 });
    expect(p.page.result.current.menu).toBeNull();
    p.click();
    expect(p.page.result.current.menu).toBeNull();
    p.click({ detail: 0 });
    expect(p.page.result.current.menu).not.toBeNull();
  });

  it('connects the final release body in one history item even if its last pointermove was blank', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 520, clientY: 350 });
    expect(p.page.result.current.preview.target).toBeNull();
    p.native('pointerup', { clientX: 700, clientY: 250 });
    expect(p.connect).toHaveBeenCalledExactlyOnceWith({
      sourceIds: ['a', 'b'],
      targetId: 'target',
    });
    expect(p.page.result.current.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: 'target' },
      { source: 'b', target: 'target' },
    ]);
    expect(p.recorded).toHaveBeenCalledOnce();
    expect(p.page.result.current.preview).toBeNull();
    expect(p.page.result.current.menu).toBeNull();
    expect(frames.size).toBe(0);
    act(() => p.page.result.current.undo());
    expect(p.page.result.current.edges).toEqual([]);
    act(() => p.page.result.current.redo());
    expect(p.page.result.current.edges).toHaveLength(2);
  });

  it('uses the last overlapping body at release instead of the physical hover preview or nearby handles', () => {
    const p = setup({
        initialNodes: [
          node('a', 100, 100),
          node('b', 100, 400),
          node('bottom', 500, 100),
          node('top', 500, 100),
        ],
      }),
      body = document.createElement('article');
    body.className = 'cv-node';
    body.dataset.nodeId = 'bottom';
    p.board.append(body);
    document.elementFromPoint = () => body;
    p.down();
    p.native('pointermove', { clientX: 700, clientY: 250 });
    expect(p.page.result.current.preview.hoveredNodeId).toBe('bottom');
    p.native('pointerup', { clientX: 700, clientY: 250 });
    expect(p.connect).toHaveBeenCalledExactlyOnceWith({ sourceIds: ['a', 'b'], targetId: 'top' });
    p.down();
    p.native('pointerup', { clientX: 530, clientY: 250 });
    expect(p.connect).toHaveBeenCalledOnce();
    expect(p.page.result.current.menu.point).toEqual({ x: 430, y: 200 });
  });

  it.each(['invalid', 'already-connected'])(
    'opens creation for an %s target without adding graph or history state',
    (kind) => {
      const p = setup({
        initialNodes: [
          node('a', 100, 100),
          node('b', 100, 400, kind === 'invalid' ? 'video' : 'image'),
          node('target', 500, 100),
        ],
        initialEdges:
          kind === 'already-connected'
            ? [
                { id: 'a-target', source: 'a', target: 'target' },
                { id: 'b-target', source: 'b', target: 'target' },
              ]
            : [],
      });
      p.down();
      p.native('pointerup', { clientX: 700, clientY: 250 });
      expect(p.page.result.current.menu.point).toEqual({ x: 600, y: 200 });
      expect(p.page.result.current.nodes).toBe(p.options.initialNodes);
      expect(p.page.result.current.edges).toBe(p.options.initialEdges);
      expect(p.connect).not.toHaveBeenCalled();
      expect(p.recorded).not.toHaveBeenCalled();
    },
  );

  it('creates one shared target at the exact blank release point and undoes its fan edges together', () => {
    const p = setup();
    p.down();
    p.native('pointerup', { clientX: 100, clientY: 50 });
    const request = p.page.result.current.menu;
    expect(request.point).toEqual({ x: 0, y: 0 });
    expect(p.page.result.current.entries.find(({ type }) => type === 'video').disabled).toBe(false);
    act(() => expect(p.page.result.current.choose('video', request)).toBe(true));
    const created = p.page.result.current.nodes.at(-1);
    expect(created.position).toEqual({ x: 0, y: 0 });
    expect(p.page.result.current.nodes).toHaveLength(4);
    expect(p.page.result.current.edges.map(({ target }) => target)).toEqual([
      created.id,
      created.id,
    ]);
    expect(p.options.setSelected).toHaveBeenCalledExactlyOnceWith([created.id]);
    expect(p.recorded).toHaveBeenCalledOnce();
    expect(p.page.result.current.menu).toBeNull();
    act(() => p.page.result.current.undo());
    expect(p.page.result.current.nodes).toEqual(p.options.initialNodes);
    expect(p.page.result.current.edges).toEqual([]);
  });

  it('positions short-press creation beside the selection bounds while preserving all selected source positions', () => {
    const p = setup();
    p.click({ detail: 0 });
    const request = p.page.result.current.menu;
    act(() => expect(p.page.result.current.choose('image', request)).toBe(true));
    expect(p.page.result.current.nodes.at(-1).position).toEqual({ x: 400, y: 290 });
    expect(p.page.result.current.nodes.slice(0, 2)).toEqual(p.options.initialNodes.slice(0, 2));
  });

  it('keeps a failed creation request and dismisses an old request without closing a newer one', () => {
    const p = setup({
      initialNodes: [node('a', 100, 100), node('b', 100, 400, 'video'), node('target', 500, 100)],
    });
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    act(() => expect(p.page.result.current.choose('image', old)).toBe(false));
    expect(p.page.result.current.menu).toBe(old);
    expect(p.recorded).not.toHaveBeenCalled();
    p.click({ detail: 0 });
    p.click({ detail: 0 });
    const current = p.page.result.current.menu;
    expect(current).not.toBe(old);
    act(() => p.page.result.current.close(old));
    expect(p.page.result.current.menu).toBe(current);
    act(() => expect(p.page.result.current.choose('video', old)).toBe(false));
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it.each([
    { ready: false },
    { readonly: true },
    { sourceIds: ['b', 'a'] },
    { nodesOverride: [node('a', 100, 100), node('target', 500, 100)] },
  ])('cancels requests and old choose callbacks when ownership changes %j', (patch) => {
    const p = setup();
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    p.rerender(patch);
    expect(p.page.result.current.menu).toBeNull();
    act(() => expect(p.page.result.current.choose('video', old)).toBe(false));
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('does not let an A to B to A old request close or write the new A request', () => {
    const p = setup();
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    p.rerender({ documentKey: 'B' });
    p.rerender({ documentKey: 'A' });
    p.click({ detail: 0 });
    const current = p.page.result.current.menu;
    act(() => {
      p.page.result.current.close(old);
      expect(p.page.result.current.choose('video', old)).toBe(false);
    });
    expect(p.page.result.current.menu).toBe(current);
    expect(p.recorded).not.toHaveBeenCalled();
    act(() => expect(p.page.result.current.choose('video', current)).toBe(true));
    expect(p.recorded).toHaveBeenCalledOnce();
  });

  it.each(['blur', 'hidden', 'pointercancel', 'lostpointercapture', 'escape'])(
    'cleans capture and fan preview after %s and ignores a retained animation callback',
    (kind) => {
      const p = setup();
      p.handle.focus();
      p.down();
      p.native('pointermove', { clientX: 1060, clientY: 710 });
      const queued = frames.values().next().value;
      if (kind === 'hidden') {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      } else if (kind === 'escape') p.native('keydown', { key: 'Escape', isComposing: false });
      else p.native(kind);
      expect(p.page.result.current.preview).toBeNull();
      expect(p.page.result.current.menu).toBeNull();
      expect(frames.size).toBe(0);
      act(() => queued(2000));
      expect(p.options.setView).not.toHaveBeenCalled();
      p.native('pointerup');
      expect(p.recorded).not.toHaveBeenCalled();
      if (kind === 'escape') expect(document.activeElement).toBe(p.handle);
    },
  );

  it('integrates pan velocity over clamped elapsed time and releases using the latest view', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 1060, clientY: 710 });
    p.frame(1000);
    expect(p.options.viewRef.current).toEqual({ x: 0, y: 0, z: 1 });
    p.frame(1100);
    expect(p.options.viewRef.current).toEqual({ x: -18, y: -18, z: 1 });
    p.frame(1090);
    expect(p.options.viewRef.current).toEqual({ x: -18, y: -18, z: 1 });
    p.frame(1110);
    expect(p.options.viewRef.current).toEqual({ x: -25.2, y: -25.2, z: 1 });
    p.native('pointerup', { clientX: 850, clientY: 650 });
    expect(p.page.result.current.menu.point).toEqual({ x: 775.2, y: 625.2 });
    expect(frames.size).toBe(0);
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('blocks queued pan and captured callbacks when the source signature changes or the hook unmounts', () => {
    const p = setup();
    p.down();
    p.native('pointermove', { clientX: 1060, clientY: 710 });
    const queued = frames.values().next().value;
    p.rerender({ sourceIds: ['a'] });
    act(() => queued(2000));
    expect(p.options.setView).not.toHaveBeenCalled();
    expect(p.page.result.current.preview).toBeNull();
    const oldClick = p.page.result.current.click;
    p.page.unmount();
    p.options.setMenu.mockClear();
    p.options.setContext.mockClear();
    act(() => oldClick(p.event({ detail: 0 })));
    expect(p.options.setMenu).not.toHaveBeenCalled();
    expect(p.options.setContext).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });
});

describe('ordinary group multi-connection entry ownership', () => {
  const setupGroup = (patch = {}) =>
    setup({
      initialNodes: groupNodes(),
      entryKey: 'group:group-a',
      entryNodeId: 'group-a',
      entryFocusSelector: '[data-entry="group-a"]',
      ...patch,
    });
  const focusEntry = (p, id, className = '') => {
    const button = document.createElement('button');
    button.dataset.entry = id;
    button.className = className;
    p.board.append(button);
    return button;
  };
  const changeLiveNodes = (p, transform) => {
    const graph = p.page.result.current.graph.current;
    p.page.result.current.graph.current = { ...graph, nodes: transform(graph.nodes) };
  };

  it('connects recursive ordinary-group leaves through the unchanged release protocol in one undo step', () => {
    const p = setupGroup();
    p.down();
    p.native('pointermove', { clientX: 700, clientY: 250 });
    expect(p.page.result.current.preview.sourceIds).toEqual(['a', 'b']);
    p.native('pointerup', { clientX: 700, clientY: 250 });
    expect(p.connect).toHaveBeenCalledExactlyOnceWith({
      sourceIds: ['a', 'b'],
      targetId: 'target',
    });
    expect(p.recorded).toHaveBeenCalledOnce();
    expect(p.page.result.current.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: 'target' },
      { source: 'b', target: 'target' },
    ]);
    expect(p.page.result.current.nodes.slice(0, 4)).toEqual(p.options.initialNodes.slice(0, 4));
    act(() => p.page.result.current.undo());
    expect(p.page.result.current.edges).toEqual([]);
    expect(p.page.result.current.nodes).toEqual(p.options.initialNodes);
  });

  it.each(['menu', 'drag'])(
    'cancels a group %s when the same sources switch to the virtual selection entry',
    (kind) => {
      const p = setupGroup();
      let old, queued;
      if (kind === 'menu') {
        p.click({ detail: 0 });
        old = p.page.result.current.menu;
        act(() => old.restoreFocus());
        queued = frames.values().next().value;
      } else {
        p.down();
        p.native('pointermove', { clientX: 1060, clientY: 710 });
        queued = frames.values().next().value;
      }
      p.rerender({
        entryKey: 'virtual-selection',
        entryNodeId: undefined,
        entryFocusSelector: '.cv-selection-add-hit',
      });
      act(() => queued(2000));
      p.native('pointerup', { clientX: 700, clientY: 250 });
      expect(p.page.result.current.preview).toBeNull();
      expect(p.page.result.current.menu).toBeNull();
      expect(p.options.setView).not.toHaveBeenCalled();
      expect(p.connect).not.toHaveBeenCalled();
      expect(p.recorded).not.toHaveBeenCalled();
      if (old) act(() => expect(p.page.result.current.choose('video', old)).toBe(false));
    },
  );

  it('rejects an old group A request after A to B to A with unchanged leaf IDs', () => {
    const p = setupGroup();
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    act(() => {
      p.page.result.current.close(old);
      old.restoreFocus();
    });
    const oldFocus = frames.values().next().value;
    p.rerender({
      entryKey: 'group:group-b',
      entryNodeId: 'group-b',
      entryFocusSelector: '[data-entry="group-b"]',
      nodesOverride: groupNodes('group-b'),
    });
    p.rerender({
      entryKey: 'group:group-a',
      entryNodeId: 'group-a',
      entryFocusSelector: '[data-entry="group-a"]',
      nodesOverride: undefined,
    });
    p.click({ detail: 0 });
    const current = p.page.result.current.menu;
    expect(current).not.toBe(old);
    const external = document.createElement('input');
    document.body.append(external);
    external.focus();
    act(() => {
      oldFocus(2000);
      p.page.result.current.close(old);
      expect(p.page.result.current.choose('video', old)).toBe(false);
    });
    expect(document.activeElement).toBe(external);
    expect(p.page.result.current.menu).toBe(current);
    expect(p.recorded).not.toHaveBeenCalled();
    act(() => expect(p.page.result.current.choose('video', current)).toBe(true));
    expect(p.recorded).toHaveBeenCalledOnce();
    expect(p.page.result.current.edges).toHaveLength(2);
  });

  it.each(['menu', 'drag'])(
    'rejects a retained %s immediately after deleting the group while its children still exist',
    (kind) => {
      const p = setupGroup();
      let request;
      if (kind === 'menu') {
        p.click({ detail: 0 });
        request = p.page.result.current.menu;
      } else {
        p.down();
        p.native('pointermove', { clientX: 1060, clientY: 710 });
      }
      changeLiveNodes(p, (nodes) => nodes.filter((node) => node.id !== 'group-a'));
      if (request) act(() => expect(p.page.result.current.choose('video', request)).toBe(false));
      else p.native('pointerup', { clientX: 700, clientY: 250 });
      expect(p.page.result.current.graph.current.nodes.some((node) => node.id === 'a')).toBe(true);
      expect(p.page.result.current.graph.current.nodes.some((node) => node.id === 'b')).toBe(true);
      expect(p.connect).not.toHaveBeenCalled();
      expect(p.recorded).not.toHaveBeenCalled();
      expect(p.page.result.current.edges).toEqual([]);
    },
  );

  it.each([
    ['script group', { type: 'group', sourceScriptNodeId: 'script' }],
    ['breakdown group', { type: 'group', breakdownSourceNodeId: 'source' }],
  ])('cancels a group converted to a %s before rendering the new entry', (_, data) => {
    const p = setupGroup();
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    changeLiveNodes(p, (nodes) =>
      nodes.map((node) => (node.id === 'group-a' ? { ...node, data } : node)),
    );
    act(() => expect(p.page.result.current.choose('video', old)).toBe(false));
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it.each([
    { type: 'group', characterAsset: { states: [] } },
    { type: 'group', sourceScriptNodeId: '' },
    { type: 'group', breakdownSourceNodeId: '' },
    { type: 'group', breakdownSourceNodeId: 23 },
    { type: 'image', breakdownSourceNodeId: 'source' },
  ])('preserves ordinary group entry qualification for source-supported data %j', (data) => {
    const p = setupGroup({
      initialNodes: groupNodes().map((node) => (node.id === 'group-a' ? { ...node, data } : node)),
    });
    p.click({ detail: 0 });
    const menu = p.page.result.current.menu;
    expect(menu).toMatchObject({ sourceIds: ['a', 'b'] });
    act(() => expect(p.page.result.current.choose('video', menu)).toBe(true));
    expect(p.recorded).toHaveBeenCalledOnce();
    expect(p.page.result.current.edges).toHaveLength(2);
  });

  it.each([
    [
      'leaf moved out',
      (nodes) => nodes.map((node) => (node.id === 'a' ? { ...node, parentId: 'other' } : node)),
    ],
    [
      'nested group moved out',
      (nodes) =>
        nodes.map((node) => (node.id === 'nested' ? { ...node, parentId: 'other' } : node)),
    ],
    [
      'leaf moved between current descendants',
      (nodes) => nodes.map((node) => (node.id === 'a' ? { ...node, parentId: 'nested' } : node)),
    ],
    ['new descendant', (nodes) => [...nodes, { ...node('c', 100, 650), parentId: 'nested' }]],
    [
      'leaf became reference',
      (nodes) =>
        nodes.map((node) =>
          node.id === 'a' ? { ...node, type: 'reference', data: { type: 'reference' } } : node,
        ),
    ],
  ])('blocks old choose and queued focus when membership changes: %s', (_, transform) => {
    const p = setupGroup();
    const groupEntry = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    changeLiveNodes(p, transform);
    act(() => expect(p.page.result.current.choose('video', old)).toBe(false));
    act(() => {
      p.page.result.current.close(old);
      old.restoreFocus();
    });
    // Closing publishes React state; retain the external graph mutation at the next boundary.
    changeLiveNodes(p, transform);
    const queued = frames.values().next().value;
    act(() => queued(2000));
    expect(document.activeElement).not.toBe(groupEntry);
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it.each([
    ['removed leaf', (nodes) => nodes.filter((node) => node.id !== 'a')],
    ['new descendant', (nodes) => [...nodes, { ...node('c', 100, 650), parentId: 'nested' }]],
    [
      'nested group reparented',
      (nodes) =>
        nodes.map((node) => (node.id === 'nested' ? { ...node, parentId: 'other' } : node)),
    ],
  ])('cancels fan preview, capture and scheduled pan after %s is rendered', (_, transform) => {
    const p = setupGroup();
    p.down();
    p.native('pointermove', { clientX: 1060, clientY: 710 });
    const oldFrame = frames.values().next().value;
    p.rerender({ nodesOverride: transform(p.options.initialNodes) });
    expect(p.page.result.current.preview).toBeNull();
    expect(p.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
    expect(frames.size).toBe(0);
    act(() => oldFrame(2000));
    p.native('pointerup', { clientX: 700, clientY: 250 });
    expect(p.options.setView).not.toHaveBeenCalled();
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it.each([
    [
      'leaf moved out',
      (nodes) => nodes.map((node) => (node.id === 'a' ? { ...node, parentId: 'other' } : node)),
    ],
    ['new descendant', (nodes) => [...nodes, { ...node('c', 100, 650), parentId: 'nested' }]],
    [
      'derived script marker',
      (nodes) =>
        nodes.map((node) =>
          node.id === 'group-a'
            ? { ...node, data: { ...node.data, sourceScriptNodeId: 'script' } }
            : node,
        ),
    ],
  ])('blocks a release against the latest unrendered graph after %s', (_, transform) => {
    const p = setupGroup();
    p.down();
    p.native('pointermove', { clientX: 1060, clientY: 710 });
    changeLiveNodes(p, transform);
    p.native('pointerup', { clientX: 700, clientY: 250 });
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
    expect(p.page.result.current.preview).toBeNull();
    expect(p.page.result.current.menu).toBeNull();
    expect(frames.size).toBe(0);
    expect(p.board.releasePointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('returns fallback focus only to the exact group entry rather than the virtual add control', () => {
    const p = setupGroup();
    const virtual = focusEntry(p, 'virtual', 'cv-selection-add-hit');
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const menu = p.page.result.current.menu;
    p.handle.remove();
    act(() => {
      p.page.result.current.close(menu);
      menu.restoreFocus();
    });
    p.frame(1000);
    expect(document.activeElement).toBe(exact);
    expect(document.activeElement).not.toBe(virtual);
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('preserves the legacy virtual signature and fallback selector for callers without entry options', () => {
    const p = setup();
    const exact = focusEntry(p, 'virtual', 'cv-selection-add-hit');
    p.click({ detail: 0 });
    const menu = p.page.result.current.menu;
    expect(menu.signature).toBe(JSON.stringify(['a', 'b']));
    p.handle.remove();
    act(() => {
      p.page.result.current.close(menu);
      menu.restoreFocus();
    });
    p.frame(1000);
    expect(document.activeElement).toBe(exact);
  });

  it('does not steal focus from a newly opened request at the same group entry', () => {
    const p = setupGroup();
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    act(() => {
      p.page.result.current.close(old);
      old.restoreFocus();
    });
    const queued = frames.values().next().value;
    p.click({ detail: 0 });
    const current = p.page.result.current.menu;
    const external = document.createElement('input');
    document.body.append(external);
    external.focus();
    act(() => queued(1000));
    expect(document.activeElement).toBe(external);
    expect(document.activeElement).not.toBe(exact);
    expect(p.page.result.current.menu).toBe(current);
  });

  it('invalidates a queued focus restoration on public cancel without changing the selected sources', () => {
    const p = setupGroup();
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const menu = p.page.result.current.menu;
    let queued;
    act(() => {
      p.page.result.current.close(menu);
      menu.restoreFocus();
      queued = frames.values().next().value;
      p.page.result.current.cancel();
    });
    expect(frames.size).toBe(0);
    act(() => queued(1000));
    expect(document.activeElement).not.toBe(exact);
  });

  it('releases a scheduled focus frame on unmount and rejects its retained callback', () => {
    const p = setupGroup();
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const menu = p.page.result.current.menu;
    act(() => {
      p.page.result.current.close(menu);
      menu.restoreFocus();
    });
    const queued = frames.values().next().value;
    p.page.unmount();
    expect(frames.size).toBe(0);
    act(() => queued(1000));
    expect(document.activeElement).not.toBe(exact);
  });

  it('restores a recreated group entry after Escape cancels a drag whose opener disappeared', () => {
    const p = setupGroup();
    const exact = focusEntry(p, 'group-a');
    focusEntry(p, 'virtual', 'cv-selection-add-hit');
    p.down();
    p.native('pointermove', { clientX: 1060, clientY: 710 });
    p.handle.remove();
    p.native('keydown', { key: 'Escape', isComposing: false });
    expect(p.page.result.current.preview).toBeNull();
    expect(p.page.result.current.menu).toBeNull();
    p.frame(1000);
    expect(document.activeElement).toBe(exact);
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('mints the blank-release owner after shared takeover cancels this same hook', () => {
    const p = setupGroup({
      cancelOtherGestures: vi.fn(() => p.page.result.current.cancel()),
    });
    const exact = focusEntry(p, 'group-a');
    focusEntry(p, 'virtual', 'cv-selection-add-hit');
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    p.down();
    expect(p.options.cancelOtherGestures).toHaveBeenCalledOnce();
    p.native('pointermove', { clientX: 900, clientY: 650 });
    p.handle.remove();
    p.native('pointerup', { clientX: 900, clientY: 650 });
    const current = p.page.result.current.menu;
    expect(current).toMatchObject({ kind: 'multi', point: { x: 800, y: 600 } });
    expect(current).not.toBe(old);
    act(() => {
      p.page.result.current.close(old);
      expect(p.page.result.current.choose('video', old)).toBe(false);
    });
    expect(p.page.result.current.menu).toBe(current);
    act(() => {
      p.page.result.current.close(current);
      current.restoreFocus();
    });
    p.frame(1000);
    expect(document.activeElement).toBe(exact);
    expect(p.connect).not.toHaveBeenCalled();
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('keeps old focus callbacks isolated when shared takeover cancels and then opens a new request', () => {
    const p = setupGroup({
      cancelOtherGestures: vi.fn(() => p.page.result.current.cancel()),
    });
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    act(() => {
      p.page.result.current.close(old);
      old.restoreFocus();
    });
    const oldFocus = frames.values().next().value;
    p.down();
    p.native('pointerup', { clientX: 450, clientY: 300 });
    const current = p.page.result.current.menu;
    expect(current).not.toBe(old);
    const external = document.createElement('input');
    document.body.append(external);
    external.focus();
    act(() => oldFocus(1000));
    expect(document.activeElement).toBe(external);
    expect(document.activeElement).not.toBe(exact);
    expect(p.page.result.current.menu).toBe(current);
    expect(p.recorded).not.toHaveBeenCalled();
  });

  it('rejects an entry selector change even when the group and source IDs remain identical', () => {
    const p = setupGroup();
    const exact = focusEntry(p, 'group-a');
    p.click({ detail: 0 });
    const old = p.page.result.current.menu;
    p.rerender({ entryFocusSelector: '[data-entry="new-group-a"]' });
    expect(p.page.result.current.menu).toBeNull();
    act(() => {
      old.restoreFocus();
      expect(p.page.result.current.choose('video', old)).toBe(false);
    });
    p.frame(1000);
    expect(document.activeElement).not.toBe(exact);
    expect(p.recorded).not.toHaveBeenCalled();
  });
});
