import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from '../storyboard/script-model.js';
import { useCanvasReferencePick } from './useCanvasReferencePick.js';

const image = (id, x = 0) => ({
  id,
  type: 'image',
  position: { x, y: 0 },
  width: 100,
  height: 100,
  data: { type: 'image', name: id, url: [`/${id}.png`], action: 'image_resource' },
});
let frames;
function harness(overrides = {}) {
  const script = createCanvasScriptNode({ id: 'script', position: { x: 400, y: 200 }, models });
  const initialNodes = overrides.initialNodes ?? [script, image('a'), image('b', 150)];
  const initialEdges = overrides.initialEdges ?? [];
  const { initialNodes: _initialNodes, initialEdges: _initialEdges, ...hookOverrides } = overrides;
  let raw = {
    documentKey: 'doc',
    nodes: initialNodes,
    edges: initialEdges,
    models,
    ready: true,
    readonly: false,
  };
  let selected = ['b', 'unrelated'];
  const history = [];
  const board = document.createElement('div');
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 800 });
  board.setPointerCapture = vi.fn();
  board.releasePointerCapture = vi.fn();
  const props = {
    ...raw,
    getDocument: () => raw,
    getView: () => ({ x: 0, y: 0, z: 1 }),
    board: { current: board },
    space: { current: false },
    tool: 'select',
    supportContent: { data: support },
    cancelOtherGestures: vi.fn(),
    notify: vi.fn(),
    focusView: vi.fn(),
    setSelected: vi.fn((value) => {
      selected = typeof value === 'function' ? value(selected) : value;
    }),
    flushGraph: vi.fn(() => true),
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (
        raw.nodes !== expectedGraph.nodes ||
        raw.edges !== expectedGraph.edges ||
        raw.models !== expectedGraph.models
      )
        return false;
      history.push(raw);
      raw = next;
      return true;
    }),
    ...hookOverrides,
  };
  const page = renderHook((value) => useCanvasReferencePick(value), { initialProps: props });
  const call = (action) => {
    let value;
    act(() => {
      value = action(page.result.current);
    });
    return value;
  };
  const drain = () =>
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback());
    });
  return {
    ...page,
    props,
    call,
    drain,
    history,
    raw: () => raw,
    selected: () => selected,
    publish: (value) => {
      raw = value;
    },
    refresh: (patch = {}) => page.rerender({ ...props, ...raw, ...patch }),
  };
}
const event = (board, x, y, extra = {}) => ({
  target: board,
  currentTarget: board,
  pointerId: 1,
  button: 0,
  clientX: x,
  clientY: y,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn(),
  ...extra,
});

beforeEach(() => {
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (value) => frames.delete(value));
});
afterEach(() => vi.unstubAllGlobals());

describe('canvas-owned ScriptV2 reference gestures', () => {
  it('enter keeps the unrelated selection; accepted click only deselects its source and selects its explicit target', () => {
    const page = harness();
    expect(page.call((api) => api.enter('script'))).toBe(true);
    expect(page.result.current.targetId).toBe('script');
    expect(page.selected()).toEqual(['b', 'unrelated']);
    expect(page.props.cancelOtherGestures).toHaveBeenCalledOnce();
    expect(page.call((api) => api.pick('b'))).toBe(true);
    expect(page.raw().edges).toHaveLength(1);
    expect(page.history).toHaveLength(1);
    expect(page.props.flushGraph).toHaveBeenCalledWith(page.raw());
    page.drain();
    expect(page.selected()).toEqual(['unrelated', 'script']);
    expect(page.result.current.active).toBe(true);
    const target = page.raw().nodes.find((node) => node.id === 'script');
    expect(target.data.params.scenePayload.source_images[0]).toMatchObject({
      node_id: 'b',
      url: '/b.png',
    });
  });
  it('connected body clicks do nothing; explicit disconnect removes exactly one edge and recomputes source_images', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    page.call((api) => api.pick('a'));
    expect(page.call((api) => api.pick('a'))).toBe(false);
    expect(page.history).toHaveLength(1);
    expect(page.call((api) => api.disconnect('a'))).toBe(true);
    expect(page.raw().edges).toEqual([]);
    expect(page.history).toHaveLength(2);
    expect(page.raw().nodes[0].data.params.scenePayload).toBeUndefined();
    expect(page.result.current.active).toBe(true);
  });
  it('Escape-style exit cancels pending selection frames and does not clear the original selection', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    page.call((api) => api.pick('b'));
    page.call((api) => api.exit());
    page.drain();
    expect(page.selected()).toEqual(['b', 'unrelated']);
    expect(page.result.current.active).toBe(false);
  });
  it('rejects a stale enter callback across A→B→A, and never cancels a new document gesture', () => {
    const page = harness();
    const oldEnter = page.result.current.enter;
    page.publish({ ...page.raw(), documentKey: 'other' });
    page.refresh();
    expect(page.call(() => oldEnter('script'))).toBe(false);
    page.publish({ ...page.raw(), documentKey: 'doc' });
    page.refresh();
    expect(page.call(() => oldEnter('script'))).toBe(false);
    expect(page.props.cancelOtherGestures).not.toHaveBeenCalled();
    expect(page.call((api) => api.enter('script'))).toBe(true);
  });
  it('retires a deleted target before a same-ID target is recreated', () => {
    const page = harness();
    const target = page.raw().nodes[0];
    page.call((api) => api.enter('script'));
    page.publish({ ...page.raw(), nodes: page.raw().nodes.slice(1) });
    page.refresh();
    page.publish({ ...page.raw(), nodes: [target, ...page.raw().nodes] });
    page.refresh();
    expect(page.call((api) => api.pick('a'))).toBe(false);
    expect(page.history).toEqual([]);
  });
  it('CAS rejection does not save or publish delayed selection', () => {
    const page = harness({ commitGraph: vi.fn(() => false) });
    page.call((api) => api.enter('script'));
    expect(page.call((api) => api.pick('a'))).toBe(false);
    page.drain();
    expect(page.props.flushGraph).not.toHaveBeenCalled();
    expect(page.props.setSelected).not.toHaveBeenCalled();
    expect(page.raw().edges).toEqual([]);
  });
  it('accepted quota failures retain the graph and a repeated body click cannot add duplicates', () => {
    const page = harness({ flushGraph: vi.fn(() => false) });
    page.call((api) => api.enter('script'));
    expect(page.call((api) => api.pick('a'))).toBe(true);
    expect(page.call((api) => api.pick('a'))).toBe(false);
    expect(page.raw().edges).toHaveLength(1);
    expect(page.history).toHaveLength(1);
  });
  it('projects the final debounced script draft in the same reference transaction', () => {
    const page = harness({
      projectGraph: (graph) => ({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === 'script'
            ? {
                ...node,
                data: { ...node.data, params: { ...node.data.params, prompt: '最后150ms剧情' } },
              }
            : node,
        ),
      }),
    });
    page.call((api) => api.enter('script'));
    page.call((api) => api.pick('a'));
    expect(page.raw().nodes[0].data.params.prompt).toBe('最后150ms剧情');
    expect(page.history).toHaveLength(1);
  });
  it('keeps gesture and graph intact when draft projection fails', () => {
    const page = harness({
      projectGraph: () => {
        throw new Error('draft unavailable');
      },
    });
    page.call((api) => api.enter('script'));
    expect(page.call((api) => api.pick('a'))).toBe(false);
    expect(page.raw().edges).toEqual([]);
    expect(page.props.notify).toHaveBeenCalledWith('当前画布草稿无法保存，请重试');
    expect(page.result.current.active).toBe(true);
  });
  it('starts box selection only beyond source 5px and adds image nodes in source order', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    const board = page.props.board.current;
    page.call((api) => api.beginBox(event(board, -1, -1)));
    page.call((api) => api.moveBox(event(board, 4, 4)));
    expect(page.result.current.boxRect).toBeNull();
    page.call((api) => api.moveBox(event(board, 300, 150)));
    expect(page.result.current.boxRect).toEqual({ x: -1, y: -1, width: 301, height: 151 });
    page.call((api) => api.endBox(event(board, 300, 150)));
    expect(page.raw().edges.map((edge) => edge.source)).toEqual(['a', 'b']);
    expect(page.history).toHaveLength(1);
    page.drain();
    expect(page.selected()).toEqual(['b', 'unrelated', 'script']);
    expect(page.call((api) => api.suppressNodeClick())).toBe(true);
    expect(page.call((api) => api.suppressNodeClick())).toBe(false);
  });
  it('leaves Space, hand, middle-button and input interaction to their existing owners', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    const board = page.props.board.current;
    page.props.space.current = true;
    expect(page.call((api) => api.beginBox(event(board, 0, 0)))).toBe(false);
    page.props.space.current = false;
    expect(page.call((api) => api.beginBox(event(board, 0, 0, { button: 1 })))).toBe(false);
    page.refresh({ tool: 'hand' });
    expect(page.call((api) => api.beginBox(event(board, 0, 0)))).toBe(false);
  });
  it('cancels an unfinished box when ownership changes, without adding to a new same-ID document', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    const board = page.props.board.current;
    page.call((api) => api.beginBox(event(board, -1, -1)));
    page.call((api) => api.moveBox(event(board, 300, 150)));
    page.publish({ ...page.raw(), documentKey: 'new' });
    page.refresh();
    expect(page.call((api) => api.endBox(event(board, 300, 150)))).toBe(false);
    expect(page.raw().edges).toEqual([]);
    expect(page.history).toEqual([]);
  });
  it('returns to the actual target with the source 400ms view transition then exits', () => {
    const page = harness();
    page.call((api) => api.enter('script'));
    page.call((api) => api.returnToTarget());
    expect(page.props.focusView).toHaveBeenCalledWith(
      expect.objectContaining({ z: expect.any(Number) }),
      { duration: 400 },
    );
    expect(page.result.current.active).toBe(false);
    expect(page.selected()).toEqual(['b', 'unrelated']);
  });

  it('uses the dedicated ShotBreakdown video candidate branch and replaces all incoming edges on click', () => {
    const shot = { id: 'shot', type: 'shot-breakdown', data: { type: 'shot-breakdown' } };
    const page = harness({
      initialNodes: [
        shot,
        image('not-video'),
        { ...image('a'), type: 'video', data: { type: 'video', url: ['/a.mp4'] } },
        { ...image('b'), type: 'video', data: { type: 'video', url: ['blob:pending'] } },
        { ...image('c'), type: 'video', data: { type: 'video', url: ['/c.mp4'] } },
      ],
      initialEdges: [
        { id: 'old', source: 'a', target: 'shot' },
        { id: 'keep', source: 'c', target: 'not-shot' },
      ],
    });
    expect(page.call((api) => api.enter('shot'))).toBe(true);
    expect(page.result.current.description.pickableIds).toEqual(new Set(['c']));
    expect(page.result.current.description.states.get('b')).toBe('blocked');
    expect(page.call((api) => api.pick('c'))).toBe(true);
    expect(page.raw().edges).toEqual([
      { id: 'keep', source: 'c', target: 'not-shot' },
      expect.objectContaining({
        source: 'c',
        target: 'shot',
        sourceHandle: 'source',
        targetHandle: 'target',
      }),
    ]);
    expect(page.result.current.active).toBe(false);
  });

  it('does not start box mode or disconnect controls for a ShotBreakdown target', () => {
    const shot = { id: 'shot', type: 'shot-breakdown', data: { type: 'shot-breakdown' } };
    const page = harness({
      initialNodes: [
        shot,
        { ...image('a'), type: 'video', data: { type: 'video', url: ['/a.mp4'] } },
      ],
      initialEdges: [{ id: 'old', source: 'a', target: 'shot' }],
    });
    page.call((api) => api.enter('shot'));
    const board = page.props.board.current;
    expect(page.call((api) => api.beginBox(event(board, 0, 0)))).toBe(false);
    expect(page.call((api) => api.disconnect('a'))).toBe(false);
    expect(page.raw().edges).toEqual([{ id: 'old', source: 'a', target: 'shot' }]);
  });
});
