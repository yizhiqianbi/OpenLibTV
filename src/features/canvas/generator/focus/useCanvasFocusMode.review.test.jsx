import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanvasFocusMode } from './useCanvasFocusMode.js';

const models = {
  default: { image: 'focus' },
  imageModels: {
    focus: { modelKey: 'focus', properties: { focus: true } },
    ordinary: { modelKey: 'ordinary', properties: { focus: false } },
  },
};
const sourceUrl = 'https://example.test/source.png';
const lockedTemplate = {
  scene: 'focus-template',
  models: [{ modelKey: 'focus' }],
  schema: { config: false },
};
const image = (id, generate = false) => ({
  id,
  type: 'image',
  position: { x: 100, y: 200 },
  width: 350,
  height: 230,
  data: generate
    ? {
        type: 'image',
        action: 'image_generate',
        params: {
          model: 'focus',
          prompt: '原稿',
          count: 2,
          modeType: 'text2image',
          settings: { quality: '2K', RaTiOFirst: '4:3', ratioSecond: '3:2' },
          advancedSettings: { seed: 42 },
        },
      }
    : { type: 'image', action: 'image_resource', url: [sourceUrl, '/second.png'] },
});
const savedRegion = {
  nodeId: 'source',
  relX: 0.2,
  relY: 0.2,
  width: 0.4,
  height: 0.4,
  imageUrl: sourceUrl,
};
const mountedBoards = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mountedBoards.splice(0).forEach((board) => board.remove());
});

function harness({ saved = false, ...overrides } = {}) {
  let raw = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    models,
    nodes: [image('target', true), image('other-target', true), image('source'), image('source-b')],
    edges: [],
  };
  if (saved) {
    raw.nodes[0].data.params = {
      ...raw.nodes[0].data.params,
      focusRegion: savedRegion,
      originImage: sourceUrl,
      scene: 'camera_focus',
    };
    raw.edges = [
      { id: 'saved-edge', source: 'source', target: 'target', data: { assetVirtual: true } },
    ];
  }
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  board.setPointerCapture = vi.fn();
  board.releasePointerCapture = vi.fn();
  document.body.appendChild(board);
  mountedBoards.push(board);
  const surfaces = new Map();
  for (const id of ['source', 'source-b']) {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 });
    board.appendChild(element);
    surfaces.set(id, element);
  }
  const history = [];
  let props = {
    ...raw,
    board: { current: board },
    getView: () => ({ x: 12, y: 30, z: 0.5 }),
    focusView: vi.fn(),
    setSelected: vi.fn(),
    cancelOtherModes: vi.fn(),
    cancelOtherGestures: vi.fn(),
    notify: vi.fn(),
    space: { current: false },
    tool: 'select',
    getDocument: () => raw,
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
    flushGraph: vi.fn(() => true),
    ...overrides,
  };
  const hook = renderHook((value) => useCanvasFocusMode(value), { initialProps: props });
  const refs = () => {
    for (const [id, element] of surfaces) hook.result.current.getSurfaceRef(id)(element);
  };
  refs();
  const call = (run) => {
    let result;
    act(() => {
      result = run(hook.result.current);
    });
    return result;
  };
  const event = (x, y, extra = {}) => ({
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    type: 'pointermove',
    target: board,
    currentTarget: board,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...extra,
  });
  const enter = (id = 'target') => expect(call((api) => api.enter(id))).toBe(true);
  const draw = (id = 'source') => {
    expect(call((api) => api.surfaceState(id).onStart(event(30, 40)))).toBe(true);
    expect(call((api) => api.end(event(130, 90, { type: 'pointerup' })))).toBe(true);
  };
  return {
    ...hook,
    call,
    enter,
    draw,
    event,
    board,
    history,
    surfaces,
    raw: () => raw,
    target: () => raw.nodes.find((node) => node.id === 'target'),
    props: () => props,
    publish: (next) => {
      raw = next;
    },
    refresh: (patch = {}) => {
      props = { ...props, ...raw, ...patch };
      hook.rerender(props);
      refs();
    },
  };
}

describe('focus current graph, draft CAS and persistence review', () => {
  it('confirms the source minimum overflow reached through real draw, ratio, move and corner pointer actions', () => {
    const page = harness();
    const source = page.surfaces.get('source');
    source.getBoundingClientRect = () => ({ left: 0, top: 0, width: 152.6, height: 100 });
    const original = page.raw();
    page.enter();
    page.call((api) => api.surfaceState('source').onStart(page.event(0.96 * 152.6, 30)));
    page.call((api) => api.end(page.event(152.6, 35, { type: 'pointerup' })));
    expect(page.call((api) => api.chooseRatio('9:16'))).toBe(true);
    const narrowed = page.result.current.state.region;
    expect(narrowed.width).toBeLessThan(0.02);
    page.call((api) =>
      api
        .surfaceState('source')
        .onStart(page.event((narrowed.relX + narrowed.width / 2) * 152.6, 32.5)),
    );
    page.call((api) => api.end(page.event(999, 32.5, { type: 'pointerup' })));
    const moved = page.result.current.state.region;
    page.call((api) =>
      api.surfaceState('source').onResize('se', page.event((moved.relX + moved.width) * 152.6, 35)),
    );
    page.call((api) => api.end(page.event(999, 999, { type: 'pointerup' })));
    const resized = page.result.current.state.region;
    expect(resized.width).toBe(0.02);
    expect(resized.relX + resized.width).toBeGreaterThan(1);
    expect(resized.relX + resized.width).toBeLessThanOrEqual(1.02);
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.target().data.params.focusRegion).toEqual({
      nodeId: 'source',
      ...resized,
      imageUrl: sourceUrl,
    });
    expect(page.target().data.params.prompt).toBe(original.nodes[0].data.params.prompt);
    expect(page.target().data.params.settings.RaTiOFirst).toBe('9:16');
    expect(page.raw().edges).toHaveLength(1);
    expect(page.history).toHaveLength(1);
    expect(page.props().flushGraph).toHaveBeenCalledOnce();
  });

  it('confirms the final projected draft once, retaining fresh params and source, then centers without changing zoom', () => {
    const page = harness({
      projectGraph: (raw) => ({
        ...raw,
        nodes: raw.nodes.map((node) =>
          node.id === 'target'
            ? {
                ...node,
                data: { ...node.data, params: { ...node.data.params, prompt: '最后150ms草稿' } },
              }
            : node,
        ),
      }),
    });
    const original = page.raw();
    page.enter();
    page.draw();
    expect(page.call((api) => api.chooseRatio('1:1'))).toBe(true);
    const pendingRegion = page.result.current.state.region;
    expect(pendingRegion.relX).toBeCloseTo(0.1, 12);
    expect(pendingRegion.relY).toBeCloseTo(0.2, 12);
    expect(pendingRegion.width).toBeCloseTo(0.25, 12);
    expect(pendingRegion.height).toBeCloseTo(0.5, 12);
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.target().data.params).toEqual({
      ...original.nodes[0].data.params,
      prompt: '最后150ms草稿',
      focusRegion: { nodeId: 'source', ...pendingRegion, imageUrl: sourceUrl },
      originImage: sourceUrl,
      scene: 'camera_focus',
      settings: { ...original.nodes[0].data.params.settings, RaTiOFirst: '1:1' },
    });
    expect(page.raw().nodes[2]).toBe(original.nodes[2]);
    expect(page.target().position).toBe(original.nodes[0].position);
    expect(page.raw().edges).toMatchObject([{ source: 'source', target: 'target' }]);
    expect(page.history).toEqual([original]);
    expect(page.props().flushGraph).toHaveBeenCalledExactlyOnceWith(page.raw());
    expect(page.props().focusView).toHaveBeenCalledWith(
      { x: 262.5, y: 142.5, z: 0.5 },
      { duration: 400 },
    );
    expect(page.result.current.active).toBe(false);
  });

  it('reuses any existing edge without rewriting its handles or virtual metadata', () => {
    const page = harness();
    const edge = {
      id: 'existing',
      source: 'source',
      target: 'target',
      sourceHandle: 'custom',
      data: { assetVirtual: true },
    };
    page.publish({ ...page.raw(), edges: [edge] });
    page.refresh();
    page.enter();
    page.draw();
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.raw().edges).toEqual([edge]);
    expect(page.raw().edges[0]).toBe(edge);
    expect(page.history).toHaveLength(1);
  });

  it('keeps region and ratio after projection failure with no history or storage, and allows a later retry', () => {
    const project = vi.fn(() => {
      throw new Error('draft unavailable');
    });
    const page = harness({ projectGraph: project });
    page.enter();
    page.draw();
    page.call((api) => api.chooseRatio('3:2'));
    const pending = page.result.current.state.region;
    expect(page.call((api) => api.confirm())).toBe(false);
    expect(page.result.current.state).toMatchObject({ region: pending, ratio: '3:2' });
    expect(page.result.current.state.error).toContain('草稿');
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
    project.mockImplementation((value) => value);
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.history).toHaveLength(1);
  });

  it('rejects raw CAS after concurrent projection edits, preserving the new graph and pending region', () => {
    let page;
    page = harness({
      projectGraph: (raw) => {
        page.publish({
          ...raw,
          nodes: raw.nodes.map((node) =>
            node.id === 'target'
              ? {
                  ...node,
                  data: { ...node.data, params: { ...node.data.params, prompt: '并发新稿' } },
                }
              : node,
          ),
        });
        return raw;
      },
    });
    page.enter();
    page.draw();
    expect(page.call((api) => api.confirm())).toBe(false);
    expect(page.target().data.params.prompt).toBe('并发新稿');
    expect(page.target().data.params).not.toHaveProperty('focusRegion');
    expect(page.result.current.state.region).not.toBeNull();
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('retries accepted Quota failures without rebuilding edges/history, saving the latest graph', () => {
    const flush = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const page = harness({ flushGraph: flush });
    page.enter();
    page.draw();
    expect(page.call((api) => api.confirm())).toBe(false);
    const accepted = page.raw(),
      committed = page.target().data.params.focusRegion;
    expect(page.result.current.state.committed).toBe(committed);
    expect(page.result.current.active).toBe(true);
    expect(page.call((api) => api.confirm())).toBe(false);
    expect(page.raw()).toBe(accepted);
    page.publish({
      ...accepted,
      nodes: [...accepted.nodes, { id: 'during-retry', type: 'text', data: { text: '保留' } }],
    });
    page.refresh();
    expect(page.call((api) => api.retrySave())).toBe(true);
    expect(page.raw().nodes.at(-1).id).toBe('during-retry');
    expect(page.raw().edges).toHaveLength(1);
    expect(page.history).toHaveLength(1);
    expect(page.props().commitGraph).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls.at(-1)[0]).toBe(page.raw());
  });

  it('does not reapply an accepted region after undo changed it while persistence was blocked', () => {
    const page = harness({ flushGraph: vi.fn(() => false) });
    const original = page.raw();
    page.enter();
    page.draw();
    page.call((api) => api.confirm());
    page.publish(original);
    page.refresh();
    expect(page.call((api) => api.retrySave())).toBe(false);
    expect(page.raw()).toBe(original);
    expect(page.history).toHaveLength(1);
    expect(page.props().flushGraph).toHaveBeenCalledTimes(1);
    expect(page.target().data.params).not.toHaveProperty('focusRegion');
  });
});

describe('focus cancellation and mode owners', () => {
  it('keeps the source focus capability visible but rejects entering a locked template without side effects', () => {
    const page = harness();
    page.publish({
      ...page.raw(),
      nodes: page
        .raw()
        .nodes.map((node) =>
          node.id === 'target'
            ? { ...node, data: { ...node.data, extraConfig: lockedTemplate } }
            : node,
        ),
    });
    page.refresh();
    const original = page.raw();
    expect(page.result.current.canTarget('target')).toBe(true);
    expect(page.call((api) => api.enter('target'))).toBe(false);
    expect(page.result.current.active).toBe(false);
    expect(page.raw()).toBe(original);
    expect(page.history).toEqual([]);
    expect(page.props().cancelOtherModes).not.toHaveBeenCalled();
    expect(page.props().cancelOtherGestures).not.toHaveBeenCalled();
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('retires a pending focus when template config becomes locked without changing its previously saved region', () => {
    const page = harness({ saved: true });
    page.enter();
    page.draw();
    const old = page.result.current;
    page.publish({
      ...page.raw(),
      nodes: page
        .raw()
        .nodes.map((node) =>
          node.id === 'target'
            ? { ...node, data: { ...node.data, extraConfig: lockedTemplate } }
            : node,
        ),
    });
    page.refresh();
    const locked = page.raw();
    expect(page.result.current.active).toBe(false);
    expect(page.result.current.state.region).toBeNull();
    expect(page.call(() => old.confirm())).toBe(false);
    expect(page.raw()).toBe(locked);
    expect(page.target().data.params.focusRegion).toBe(savedRegion);
    expect(page.raw().edges).toEqual([
      { id: 'saved-edge', source: 'source', target: 'target', data: { assetVirtual: true } },
    ]);
    expect(page.history).toEqual([]);
    expect(page.props().commitGraph).not.toHaveBeenCalled();
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('first Escape cancels pending/editing and second exits, keeping the original saved region and graph intact', () => {
    const page = harness({ saved: true });
    const original = page.raw();
    page.enter();
    expect(page.result.current.surfaceState('source').region).toBe(savedRegion);
    page.draw();
    expect(page.call((api) => api.onEscape())).toBe(true);
    expect(page.result.current.active).toBe(true);
    expect(page.result.current.state.region).toBeNull();
    expect(page.result.current.surfaceState('source').region).toBe(savedRegion);
    expect(page.call((api) => api.onEscape())).toBe(true);
    expect(page.result.current.active).toBe(false);
    expect(page.raw()).toBe(original);
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('clears pending and stops an active draw before accepting its late release after Escape', () => {
    const page = harness();
    page.enter();
    page.call((api) => api.surfaceState('source').onStart(page.event(30, 40)));
    page.call((api) => api.move(page.event(130, 90)));
    expect(page.call((api) => api.onEscape())).toBe(true);
    expect(page.call((api) => api.end(page.event(130, 90, { type: 'pointerup' })))).toBe(false);
    expect(page.result.current.state.region).toBeNull();
    expect(page.result.current.active).toBe(true);
    expect(page.history).toEqual([]);
  });

  it('rejects retained confirm/ratio/return actions after same-document mode A→B→A', () => {
    const page = harness();
    page.enter();
    page.draw();
    const old = page.result.current;
    page.enter('other-target');
    page.enter();
    page.draw('source-b');
    const pending = page.result.current.state.region;
    expect(page.call(() => old.confirm())).toBe(false);
    expect(page.call(() => old.chooseRatio('1:1'))).toBe(false);
    expect(page.call(() => old.returnToTarget())).toBe(false);
    expect(page.result.current.state.region).toBe(pending);
    expect(page.history).toEqual([]);
    expect(page.props().focusView).not.toHaveBeenCalled();
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.target().data.params.focusRegion.nodeId).toBe('source-b');
  });

  it('rejects retained document A→B→A callbacks and an old source ref cannot replace the new owner surface', () => {
    const page = harness();
    page.enter();
    page.draw();
    const old = page.result.current,
      oldRef = old.getSurfaceRef('source');
    page.publish({ ...page.raw(), documentKey: 'B' });
    page.refresh();
    page.publish({ ...page.raw(), documentKey: 'A' });
    page.refresh();
    page.enter();
    page.draw();
    oldRef(null);
    expect(page.call(() => old.confirm())).toBe(false);
    expect(page.call(() => old.enter('target'))).toBe(false);
    expect(page.result.current.surfaceElement).toBe(page.surfaces.get('source'));
    expect(page.call((api) => api.confirm())).toBe(true);
  });

  it.each([
    'readonly',
    'loading',
    'target removed',
    'wrong type',
    'schema lost',
    'protection',
    'suspended',
  ])('retires owner/pending on %s without writing a region', (transition) => {
    const page = harness();
    page.enter();
    page.draw();
    const old = page.result.current;
    const raw = page.raw();
    if (transition === 'readonly') page.publish({ ...raw, readonly: true });
    else if (transition === 'loading') page.publish({ ...raw, ready: false });
    else if (transition === 'target removed')
      page.publish({ ...raw, nodes: raw.nodes.filter((node) => node.id !== 'target') });
    else if (transition === 'wrong type')
      page.publish({
        ...raw,
        nodes: raw.nodes.map((node) => (node.id === 'target' ? { ...node, type: 'text' } : node)),
      });
    else if (transition === 'schema lost')
      page.publish({ ...raw, models: { ...models, imageModels: {} } });
    page.refresh(
      transition === 'protection'
        ? { protectionActive: true }
        : transition === 'suspended'
          ? { suspended: true }
          : {},
    );
    expect(page.result.current.active).toBe(false);
    expect(page.result.current.state.region).toBeNull();
    expect(page.call(() => old.confirm())).toBe(false);
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it.each(['source removed', 'new URL', 'blob URL'])(
    'cancels a region on %s while keeping the target mode and graph unchanged',
    (transition) => {
      const page = harness();
      page.enter();
      page.draw();
      const raw = page.raw();
      page.publish({
        ...raw,
        nodes: raw.nodes.flatMap((node) =>
          node.id !== 'source'
            ? [node]
            : transition === 'source removed'
              ? []
              : [
                  {
                    ...node,
                    data: {
                      ...node.data,
                      url: [transition === 'new URL' ? '/new.png' : 'blob:pending'],
                    },
                  },
                ],
        ),
      });
      page.refresh();
      expect(page.result.current.state.region).toBeNull();
      expect(page.result.current.active).toBe(true);
      expect(page.call((api) => api.confirm())).toBe(false);
      expect(page.history).toEqual([]);
      expect(page.props().flushGraph).not.toHaveBeenCalled();
    },
  );

  it('does not retire a pending region for ordinary immutable params edits or same first URL array replacement', () => {
    const page = harness();
    page.enter();
    page.draw();
    const pending = page.result.current.state.region;
    page.publish({
      ...page.raw(),
      nodes: page
        .raw()
        .nodes.map((node) =>
          node.id === 'target'
            ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: '新内容' } } }
            : node.id === 'source'
              ? { ...node, data: { ...node.data, url: [sourceUrl, '/new-second.png'] } }
              : node,
        ),
    });
    page.refresh();
    expect(page.result.current.state.region).toBe(pending);
    expect(page.call((api) => api.confirm())).toBe(true);
    expect(page.target().data.params.prompt).toBe('新内容');
  });
});

describe('focus pointer lifetime and guarded removal', () => {
  it.each(['pointercancel', 'blur', 'visibilitychange'])(
    'does not recreate pending from a late release after %s',
    (transition) => {
      const page = harness();
      page.enter();
      page.call((api) => api.surfaceState('source').onStart(page.event(30, 40)));
      page.call((api) => api.move(page.event(130, 90)));
      if (transition === 'pointercancel')
        page.call((api) => api.end(page.event(130, 90, { type: transition }), true));
      else if (transition === 'blur') act(() => window.dispatchEvent(new Event('blur')));
      else {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      }
      expect(page.call((api) => api.end(page.event(130, 90, { type: 'pointerup' })))).toBe(false);
      expect(page.result.current.state.region).toBeNull();
      expect(page.history).toEqual([]);
      expect(page.board.releasePointerCapture).toHaveBeenCalledWith(1);
    },
  );

  it('consumes a second pointer and child lostcapture without replacing or canceling the active surface gesture', () => {
    const page = harness();
    page.enter();
    page.call((api) => api.surfaceState('source').onStart(page.event(30, 40)));
    expect(
      page.call((api) =>
        api.surfaceState('source-b').onStart(page.event(60, 60, { pointerId: 2 })),
      ),
    ).toBe(true);
    expect(page.board.setPointerCapture).toHaveBeenCalledTimes(1);
    page.call((api) => api.move(page.event(100, 100, { pointerId: 2 })));
    expect(page.result.current.state.region).toBeNull();
    page.call((api) => api.end(page.event(100, 100, { pointerId: 2, type: 'pointerup' })));
    page.call((api) =>
      api.end(
        page.event(100, 100, { type: 'lostpointercapture', target: page.surfaces.get('source') }),
        true,
      ),
    );
    page.call((api) => api.end(page.event(130, 90, { type: 'pointerup' })));
    expect(page.result.current.state).toMatchObject({ sourceId: 'source', drawing: false });
    expect(page.result.current.state.region.width).toBeCloseTo(0.5, 12);
    expect(page.result.current.state.region.height).toBeCloseTo(0.5, 12);
    expect(page.history).toEqual([]);
  });

  it('deletes only the first saved focus edge and preserves the final projected draft', () => {
    const page = harness({
      saved: true,
      projectGraph: (raw) => ({
        ...raw,
        nodes: raw.nodes.map((node) =>
          node.id === 'target'
            ? {
                ...node,
                data: { ...node.data, params: { ...node.data.params, prompt: '删除前最后草稿' } },
              }
            : node,
        ),
      }),
    });
    const extra = {
      id: 'second-edge',
      source: 'source',
      target: 'target',
      data: { preserve: true },
    };
    page.publish({ ...page.raw(), edges: [...page.raw().edges, extra] });
    page.refresh();
    page.enter();
    expect(page.call((api) => api.removeRegion('target'))).toBe(true);
    expect(page.raw().edges).toEqual([extra]);
    expect(page.target().data.params).toMatchObject({
      prompt: '删除前最后草稿',
      focusRegion: undefined,
      originImage: undefined,
      scene: undefined,
    });
    expect(page.history).toHaveLength(1);
    expect(page.result.current.active).toBe(false);
  });

  it('keeps the final registered draft when a model downgrade clears saved focus atomically', () => {
    const page = harness({
      saved: true,
      projectGraph: (raw) => ({
        ...raw,
        nodes: raw.nodes.map((node) =>
          node.id === 'target'
            ? {
                ...node,
                data: {
                  ...node.data,
                  params: { ...node.data.params, prompt: '模型切换前最后草稿' },
                },
              }
            : node,
        ),
      }),
    });
    page.enter();
    expect(
      page.call((api) =>
        api.patchNode('target', { params: { ...page.target().data.params, model: 'ordinary' } }),
      ),
    ).toBe(true);
    expect(page.target().data.params.prompt).toBe('模型切换前最后草稿');
    expect(page.target().data.params).toMatchObject({
      model: 'ordinary',
      focusRegion: undefined,
      originImage: undefined,
      scene: undefined,
    });
    expect(page.raw().edges).toEqual([]);
    expect(page.history).toHaveLength(1);
    expect(page.result.current.active).toBe(false);
  });

  it('does not let an old mode move/end callback manipulate a new same-pointer gesture after A→B→A', () => {
    const page = harness();
    page.enter();
    const old = page.result.current;
    page.enter('other-target');
    page.enter();
    page.call((api) => api.surfaceState('source-b').onStart(page.event(30, 40)));
    expect(page.call(() => old.move(page.event(180, 100)))).toBe(false);
    expect(page.call(() => old.end(page.event(180, 100, { type: 'pointerup' })))).toBe(false);
    expect(page.result.current.state).toMatchObject({
      sourceId: 'source-b',
      region: null,
      drawing: true,
    });
    page.call((api) => api.end(page.event(130, 90, { type: 'pointerup' })));
    expect(page.result.current.state.region.width).toBe(0.5);
  });

  it('honors an explicitly new empty prompt during model downgrade rather than reviving the registered draft', () => {
    const page = harness({
      saved: true,
      projectGraph: (raw) => ({
        ...raw,
        nodes: raw.nodes.map((node) =>
          node.id === 'target'
            ? {
                ...node,
                data: { ...node.data, params: { ...node.data.params, prompt: '旧待保存草稿' } },
              }
            : node,
        ),
      }),
    });
    expect(
      page.call((api) =>
        api.patchNode('target', {
          params: { ...page.target().data.params, model: 'ordinary', prompt: '' },
        }),
      ),
    ).toBe(true);
    expect(page.target().data.params.prompt).toBe('');
    expect(page.target().data.params.model).toBe('ordinary');
    expect(page.target().data.params.focusRegion).toBeUndefined();
    expect(page.history).toHaveLength(1);
  });

  it('returns handled false for a retired patch owner so an old host cannot fall through to ordinary update', () => {
    const page = harness({ saved: true });
    const old = page.result.current;
    page.publish({ ...page.raw(), documentKey: 'B' });
    page.refresh();
    page.publish({ ...page.raw(), documentKey: 'A' });
    page.refresh();
    expect(
      page.call(() =>
        old.patchNode('target', { params: { ...page.target().data.params, model: 'ordinary' } }),
      ),
    ).toBe(false);
    expect(page.target().data.params.model).toBe('focus');
    expect(page.target().data.params.focusRegion).toBe(savedRegion);
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('preserves the saved region and current mode when a model downgrade CAS is rejected', () => {
    const page = harness({ saved: true, commitGraph: vi.fn(() => false) });
    const original = page.raw();
    page.enter();
    expect(
      page.call((api) =>
        api.patchNode('target', { params: { ...page.target().data.params, model: 'ordinary' } }),
      ),
    ).toBe(false);
    expect(page.raw()).toBe(original);
    expect(page.target().data.params.focusRegion).toBe(savedRegion);
    expect(page.result.current.active).toBe(true);
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });
});
