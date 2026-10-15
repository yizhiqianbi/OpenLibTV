import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CanvasMarkSourceError,
  createCanvasMarkSource,
} from '../../../../services/canvas-mark-source.js';
import { useCanvasMarkMode } from './useCanvasMarkMode.js';

const models = {
  default: { image: 'magic', video: 'magic-video' },
  imageModels: {
    magic: { modelKey: 'magic', properties: { magic: true } },
    ordinary: { modelKey: 'ordinary', properties: { magic: false } },
  },
  videoModels: { 'magic-video': { modelKey: 'magic-video', properties: { magic: true } } },
};
const sourceUrl = 'https://example.test/source.png';
const response = {
  id: 'recognition',
  suggestions: [
    { label: '服务元素一', bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } },
    { label: '服务元素二', bbox: { x: 0.3, y: 0.4, width: 0.2, height: 0.1 } },
  ],
};
const image = (id, generator = false) => ({
  id,
  type: 'image',
  position: { x: 100, y: 200 },
  width: 350,
  height: 230,
  data: generator
    ? {
        type: 'image',
        action: 'image_generate',
        params: {
          model: 'magic',
          prompt: '原稿',
          count: 2,
          modeType: 'text2image',
          settings: { quality: '2K', ratio: '4:3' },
          advancedSettings: { seed: 42 },
        },
      }
    : { type: 'image', action: 'image_resource', url: [sourceUrl, '/second.png'] },
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const boards = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  boards.splice(0).forEach((board) => board.remove());
});

function harness(overrides = {}) {
  let raw = {
    documentKey: 'A',
    ready: true,
    readonly: false,
    models,
    nodes: [image('target', true), image('other-target', true), image('source'), image('source-b')],
    edges: [{ id: 'existing-reference', source: 'source', target: 'target' }],
  };
  const board = document.createElement('main');
  board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
  document.body.append(board);
  boards.push(board);
  const surfaces = new Map(),
    images = new Map();
  for (const id of ['target', 'other-target', 'source', 'source-b']) {
    const parent = document.createElement('div'),
      img = document.createElement('img'),
      surface = document.createElement('div');
    img.src = sourceUrl;
    surface.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 });
    parent.append(img, surface);
    board.append(parent);
    surfaces.set(id, surface);
    images.set(id, img);
  }
  const history = [],
    read = vi.fn().mockResolvedValue(response);
  let props = {
    ...raw,
    board: { current: board },
    getDocument: () => raw,
    getView: () => ({ x: 12, y: 30, z: 0.5 }),
    focusView: vi.fn(),
    setSelected: vi.fn(),
    cancelOtherModes: vi.fn(),
    cancelOtherGestures: vi.fn(),
    notify: vi.fn(),
    space: { current: false },
    tool: 'select',
    source: createCanvasMarkSource({ markClickSuggest: read }),
    readImage: vi.fn().mockResolvedValue('raw-png-base64'),
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (
        raw.documentKey !== expectedGraph.documentKey ||
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
  const hook = renderHook((value) => useCanvasMarkMode(value), { initialProps: props });
  const refs = () => {
    for (const [id, surface] of surfaces) hook.result.current.getSurfaceRef(id)(surface);
  };
  refs();
  const call = (run) => {
    let value;
    act(() => {
      value = run(hook.result.current);
    });
    return value;
  };
  const event = (id = 'source', extra = {}) => ({
    clientX: 60,
    clientY: 45,
    button: 0,
    currentTarget: surfaces.get(id),
    target: surfaces.get(id),
    ...extra,
  });
  const run = async (callback) => {
    let value;
    await act(async () => {
      value = await callback(hook.result.current);
    });
    return value;
  };
  const enter = (id = 'target', options) =>
    expect(call((api) => api.enter(id, options))).toBe(true);
  const start = (id = 'source', extra) => call((api) => api.point(id, event(id, extra)));
  return {
    ...hook,
    call,
    run,
    enter,
    event,
    start,
    read,
    images,
    surfaces,
    board,
    history,
    props: () => props,
    raw: () => raw,
    target: () => raw.nodes.find((node) => node.id === 'target'),
    publish(next) {
      raw = next;
    },
    refresh(patch = {}) {
      props = { ...props, ...raw, ...patch };
      hook.rerender(props);
      refs();
    },
    changeNode(id, change) {
      raw = { ...raw, nodes: raw.nodes.map((node) => (node.id === id ? change(node) : node)) };
    },
  };
}

describe('mark current raw graph, draft projection, CAS and persistence ownership', () => {
  it('uses the exact adapter payload and latest projected params with one raw CAS/history and no edge mutation', async () => {
    const request = deferred(),
      page = harness({
        projectGraph: (raw) => ({
          ...raw,
          nodes: raw.nodes.map((node) =>
            node.id === 'target'
              ? {
                  ...node,
                  data: { ...node.data, params: { ...node.data.params, prompt: '末次草稿' } },
                }
              : node,
          ),
        }),
        source: createCanvasMarkSource({ markClickSuggest: () => request.promise }),
        lang: 'en',
      });
    const before = page.raw();
    page.enter('target', { cursorOffset: 0 });
    const operation = page.start();
    expect(page.result.current.state).toMatchObject({ loading: true, points: [{ index: 1 }] });
    await act(async () => request.resolve(response));
    expect(await page.run(() => operation)).toBe(true);
    expect(page.target().data.params).toEqual({
      ...before.nodes[0].data.params,
      prompt: '{{magic:recognition_1:0}} 末次草稿',
      magicList: { recognition_1: { suggestions: response.suggestions, imageUrl: sourceUrl } },
    });
    expect(page.history).toEqual([before]);
    expect(page.props().commitGraph.mock.calls[0][1].expectedGraph).toBe(before);
    expect(page.raw().nodes[2]).toBe(before.nodes[2]);
    expect(page.raw().edges).toBe(before.edges);
    expect(page.props().flushGraph).toHaveBeenCalledExactlyOnceWith(page.raw());
    expect(page.result.current.active).toBe(true);
    expect(page.result.current.state.points[0]).toMatchObject({ apiResponseId: 'recognition_1' });
    expect(page.props().readImage).toHaveBeenCalledWith(page.images.get('source'), {
      signal: expect.any(AbortSignal),
    });
  });

  it('uses the real natural-image reader and typed source with no DOM encoding substitute in the controller', async () => {
    const page = harness({ readImage: undefined });
    Object.defineProperties(page.images.get('source'), {
      complete: { value: true },
      naturalWidth: { value: 1280 },
      naturalHeight: { value: 720 },
    });
    const drawImage = vi.fn(),
      context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage }),
      encode = vi
        .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
        .mockReturnValue('data:image/png;base64,iVBORw0KGgo=');
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(page.images.get('source'), 0, 0, 1280, 720);
    expect(context.mock.instances[0].width).toBe(0);
    expect(context.mock.instances[0].height).toBe(0);
    expect(encode).toHaveBeenCalledExactlyOnceWith('image/png');
    expect(page.read).toHaveBeenCalledExactlyOnceWith(
      { id: 'source', image_base64: 'iVBORw0KGgo=', point: [0.25, 0.25], lang: 'zh' },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('default unavailable service never reads the image or fabricates a pending point/token', async () => {
    const page = harness({ source: undefined });
    page.enter();
    const before = page.raw();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.props().readImage).not.toHaveBeenCalled();
    expect(page.result.current.state).toMatchObject({
      loading: false,
      points: [],
      saveError: false,
    });
    expect(page.result.current.state.error).toContain('元素识别服务未连接');
    expect(page.raw()).toBe(before);
    expect(page.history).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
  });

  it('keeps an accepted Quota graph and retries only persistence with the latest concurrent nodes', async () => {
    const flush = vi
        .fn()
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValue(true),
      page = harness({ flushGraph: flush });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    const accepted = page.raw();
    expect(page.result.current.state).toMatchObject({ saveError: true, loading: false });
    expect(page.result.current.state.points[0].apiResponseId).toBe('recognition_1');
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.call((api) => api.retrySave())).toBe(false);
    page.publish({
      ...accepted,
      nodes: [
        ...accepted.nodes,
        { id: 'during-retry', type: 'text', data: { text: '保存期间编辑' } },
      ],
    });
    page.refresh();
    expect(page.call((api) => api.retrySave())).toBe(true);
    expect(page.props().commitGraph).toHaveBeenCalledOnce();
    expect(page.history).toHaveLength(1);
    expect(page.read).toHaveBeenCalledOnce();
    expect(page.target().data.params.prompt).toBe('原稿 {{magic:recognition_1:0}}');
    expect(page.raw().nodes.at(-1).id).toBe('during-retry');
    expect(page.raw().edges).toBe(accepted.edges);
    expect(flush.mock.calls.at(-1)[0]).toBe(page.raw());
    expect(page.result.current.state.saveError).toBe(false);
  });

  it('treats thrown storage failure as accepted graph and preserves the single history on retry', async () => {
    const page = harness({
      flushGraph: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('QuotaExceededError');
        })
        .mockReturnValue(true),
    });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.result.current.state.points[0].apiResponseId).toBe('recognition_1');
    expect(page.call((api) => api.retrySave())).toBe(true);
    expect(page.history).toHaveLength(1);
  });

  it('rejects CAS after projection causes concurrent raw edits, preserving concurrent graph and no accepted point', async () => {
    let page;
    page = harness({
      projectGraph(raw) {
        if (page?.read.mock.calls.length) {
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
        }
        return raw;
      },
    });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.target().data.params.prompt).toBe('并发新稿');
    expect(page.target().data.params.magicList).toBeUndefined();
    expect(page.history).toEqual([]);
    expect(page.result.current.state.points).toEqual([]);
    expect(page.props().flushGraph).not.toHaveBeenCalled();
    expect(page.result.current.state.error).toContain('画布已变化');
  });

  it('does not read an image after draft projection failure', async () => {
    const page = harness({
      projectGraph: () => {
        throw new Error('draft failure');
      },
    });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.props().readImage).not.toHaveBeenCalled();
    expect(page.history).toEqual([]);
    expect(page.result.current.state.error).toContain('草稿');
  });
});

describe('mark serial operation and source-value continuation review', () => {
  it('serializes active loading and uses incrementing point index without reusing failed indices', async () => {
    const first = deferred(),
      reader = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('next-png'),
      page = harness({ readImage: reader });
    page.enter();
    const active = page.start();
    expect(await page.run((api) => api.point('source-b', page.event('source-b')))).toBe(false);
    expect(page.result.current.state.points).toHaveLength(1);
    await act(async () => first.reject(new Error('image failed')));
    expect(await page.run(() => active)).toBe(false);
    expect(page.result.current.state.points).toEqual([]);
    expect(await page.run((api) => api.point('source-b', page.event('source-b')))).toBe(true);
    expect(page.result.current.state.points[0].index).toBe(2);
    expect(page.target().data.params.magicList).toHaveProperty('recognition_2');
    expect(reader).toHaveBeenCalledTimes(2);
  });

  it.each(['before', 'response'])(
    'counts repeated occurrences at the %s boundary',
    async (boundary) => {
      const request = deferred(),
        page = harness({
          source: createCanvasMarkSource({ markClickSuggest: () => request.promise }),
        });
      page.enter();
      if (boundary === 'before') {
        page.changeNode('target', (node) => ({
          ...node,
          data: {
            ...node.data,
            params: { ...node.data.params, prompt: '{{magic:same:0}}'.repeat(20) },
          },
        }));
        expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
        expect(page.props().readImage).not.toHaveBeenCalled();
      } else {
        const active = page.start();
        await act(async () => {});
        page.changeNode('target', (node) => ({
          ...node,
          data: {
            ...node.data,
            params: { ...node.data.params, prompt: '{{magic:same:0}}'.repeat(20) },
          },
        }));
        await act(async () => request.resolve(response));
        expect(await page.run(() => active)).toBe(false);
      }
      expect(page.result.current.state.error).toBe('最多可选择20个元素');
      expect(page.target().data.params.magicList).toBeUndefined();
      expect(page.history).toEqual([]);
      expect(page.result.current.state.points).toEqual([]);
    },
  );

  it('allows a newly allocated same-value whole URL array while the recognition response is pending', async () => {
    const request = deferred(),
      page = harness({
        source: createCanvasMarkSource({ markClickSuggest: () => request.promise }),
      });
    page.enter();
    const active = page.start();
    await act(async () => {});
    page.changeNode('source', (node) => ({
      ...node,
      data: { ...node.data, url: [...node.data.url] },
    }));
    page.refresh();
    expect(page.result.current.state.loading).toBe(true);
    await act(async () => request.resolve(response));
    expect(await page.run(() => active)).toBe(true);
    expect(page.target().data.params.magicList.recognition_1.imageUrl).toBe(sourceUrl);
  });

  it.each(['front-url', 'later-url', 'source-delete', 'source-type', 'source-adapter'])(
    'retires only the pending operation on %s without accepting late response',
    async (change) => {
      const request = deferred(),
        page = harness({
          source: createCanvasMarkSource({ markClickSuggest: () => request.promise }),
        });
      page.enter();
      const active = page.start();
      await act(async () => {});
      if (change === 'source-delete')
        page.publish({
          ...page.raw(),
          nodes: page.raw().nodes.filter((node) => node.id !== 'source'),
        });
      else if (change === 'source-adapter')
        page.refresh({
          source: createCanvasMarkSource({ markClickSuggest: async () => response }),
        });
      else
        page.changeNode('source', (node) => ({
          ...node,
          type: change === 'source-type' ? 'video' : node.type,
          data: {
            ...node.data,
            url:
              change === 'front-url'
                ? ['/different.png', '/second.png']
                : change === 'later-url'
                  ? [sourceUrl, '/changed-second.png']
                  : node.data.url,
          },
        }));
      page.refresh();
      expect(page.result.current.state).toMatchObject({ loading: false, points: [] });
      expect(page.result.current.active).toBe(true);
      await act(async () => request.resolve(response));
      expect(await page.run(() => active)).toBe(false);
      expect(page.history).toEqual([]);
      expect(page.target().data.params.magicList).toBeUndefined();
    },
  );

  it('does not let old finally unlock a new operation after mode A→B→A', async () => {
    const oldRead = deferred(),
      currentRead = deferred(),
      page = harness({
        readImage: vi
          .fn()
          .mockReturnValueOnce(oldRead.promise)
          .mockReturnValueOnce(currentRead.promise),
      });
    page.enter();
    const oldApi = page.result.current,
      old = page.start();
    page.enter('other-target');
    page.enter('target');
    const current = page.start();
    await act(async () => oldRead.resolve('old-png'));
    expect(await page.run(() => old)).toBe(false);
    expect(page.result.current.state).toMatchObject({ loading: true, points: [{ index: 1 }] });
    expect(await page.run(() => oldApi.point('source', page.event()))).toBe(false);
    expect(page.call(() => oldApi.syncSuggestion('recognition_1', 1))).toBe(false);
    expect(page.call(() => oldApi.retrySave())).toBe(false);
    expect(page.call(() => oldApi.returnToTarget())).toBe(false);
    await act(async () => currentRead.resolve('current-png'));
    expect(await page.run(() => current)).toBe(true);
    expect(page.read).toHaveBeenCalledOnce();
    expect(page.history).toHaveLength(1);
  });

  it('retires document A→B→A continuations even with the same target/source IDs', async () => {
    const read = deferred(),
      page = harness({ readImage: () => read.promise });
    page.enter();
    const oldApi = page.result.current,
      old = page.start(),
      original = page.raw();
    page.publish({ ...original, documentKey: 'B' });
    page.refresh();
    page.publish({ ...original, documentKey: 'A' });
    page.refresh();
    page.enter();
    await act(async () => read.resolve('stale-png'));
    expect(await page.run(() => old)).toBe(false);
    expect(page.call(() => oldApi.exit())).toBe(false);
    expect(page.call(() => oldApi.setCursorOffset('target', 0))).toBe(false);
    expect(page.result.current.active).toBe(true);
    expect(page.history).toEqual([]);
    expect(page.read).not.toHaveBeenCalled();
  });
});

describe('mark target, source and lifecycle guards', () => {
  it('supports IMAGE self-source and a VIDEO target without changing edges or creating a self edge', async () => {
    const page = harness();
    page.changeNode('target', (node) => ({ ...node, data: { ...node.data, url: [sourceUrl] } }));
    page.refresh();
    page.enter();
    expect(await page.run((api) => api.point('target', page.event('target')))).toBe(true);
    expect(page.target().data.params.magicList.recognition_1.imageUrl).toBe(sourceUrl);
    expect(page.raw().edges).toHaveLength(1);
    page.call((api) => api.exit());
    page.changeNode('other-target', (node) => ({
      ...node,
      type: 'video',
      data: {
        ...node.data,
        type: 'video',
        action: 'video_generate',
        params: { ...node.data.params, model: 'magic-video' },
      },
    }));
    page.refresh();
    page.enter('other-target');
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    expect(page.raw().nodes[1].data.params.magicList.recognition_1.imageUrl).toBe(sourceUrl);
    expect(page.raw().edges).toHaveLength(1);
  });

  it.each([
    'readonly',
    'not-ready',
    'owner-delete',
    'owner-type',
    'schema',
    'locked-template',
    'protection',
  ])('rejects retained APIs and late reader after %s then restoration', async (kind) => {
    const read = deferred(),
      page = harness({ readImage: () => read.promise });
    page.enter();
    const before = page.raw(),
      oldApi = page.result.current,
      active = page.start();
    if (kind === 'readonly') page.publish({ ...before, readonly: true });
    else if (kind === 'not-ready') page.publish({ ...before, ready: false });
    else if (kind === 'owner-delete')
      page.publish({ ...before, nodes: before.nodes.filter((node) => node.id !== 'target') });
    else if (kind === 'protection') page.refresh({ protectionActive: true });
    else
      page.changeNode('target', (node) => ({
        ...node,
        type: kind === 'owner-type' ? 'text' : node.type,
        data: {
          ...node.data,
          params: kind === 'schema' ? { ...node.data.params, model: 'ordinary' } : node.data.params,
          ...(kind === 'locked-template'
            ? {
                extraConfig: {
                  scene: 'locked',
                  models: [{ modelKey: 'magic' }],
                  schema: { config: false },
                },
              }
            : {}),
        },
      }));
    page.refresh();
    expect(page.result.current.active).toBe(false);
    page.publish(before);
    page.refresh({ protectionActive: false });
    page.enter();
    await act(async () => read.resolve('late-png'));
    expect(await page.run(() => active)).toBe(false);
    expect(page.call(() => oldApi.exit())).toBe(false);
    expect(page.history).toEqual([]);
    expect(page.raw()).toBe(before);
  });

  it.each(['blur', 'visibilitychange'])(
    '%s cancels only the in-flight point, retaining successful parameters and mark mode',
    async (eventName) => {
      const pending = deferred(),
        page = harness({
          readImage: vi
            .fn()
            .mockResolvedValueOnce('first-png')
            .mockReturnValueOnce(pending.promise),
        });
      page.enter();
      expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
      const accepted = page.raw(),
        active = page.start('source-b');
      expect(page.result.current.state.points).toHaveLength(2);
      if (eventName === 'visibilitychange') {
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        act(() => document.dispatchEvent(new Event(eventName)));
      } else act(() => window.dispatchEvent(new Event(eventName)));
      expect(page.result.current.active).toBe(true);
      expect(page.result.current.state.loading).toBe(false);
      expect(page.result.current.state.points.map((point) => point.apiResponseId)).toEqual([
        'recognition_1',
      ]);
      await act(async () => pending.resolve('late-png'));
      expect(await page.run(() => active)).toBe(false);
      expect(page.raw()).toBe(accepted);
      expect(page.history).toHaveLength(1);
    },
  );

  it('pagehide retires mode and aborts in-flight recognition without rolling back accepted params/history', async () => {
    const pending = deferred(),
      reader = vi.fn().mockResolvedValueOnce('first-png').mockReturnValueOnce(pending.promise),
      page = harness({ readImage: reader });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    const accepted = page.raw(),
      active = page.start('source-b'),
      signal = reader.mock.calls[1][1].signal;
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(signal.aborted).toBe(true);
    expect(page.result.current.active).toBe(false);
    expect(page.result.current.state).toMatchObject({ loading: false, points: [] });
    await act(async () => pending.resolve('late-png'));
    expect(await page.run(() => active)).toBe(false);
    expect(page.raw()).toBe(accepted);
    expect(page.history).toHaveLength(1);
    expect(page.read).toHaveBeenCalledOnce();
  });

  it('a retained old-document cancel cannot clear the current same-ID mode after A→B→A', () => {
    const page = harness();
    page.enter();
    const old = page.result.current,
      original = page.raw();
    page.publish({ ...original, documentKey: 'B' });
    page.refresh();
    page.publish({ ...original, documentKey: 'A' });
    page.refresh();
    page.enter();
    const currentRaw = page.raw();
    page.call(() => old.cancel());
    expect(page.result.current.active).toBe(true);
    expect(page.result.current.targetId).toBe('target');
    expect(page.history).toEqual([]);
    expect(page.raw()).toBe(currentRaw);
  });

  it('a retained same-document mode cancel cannot cancel a new mode or its in-flight point after A→B→A', async () => {
    const pending = deferred(),
      page = harness({ readImage: () => pending.promise });
    page.enter();
    const old = page.result.current;
    page.enter('other-target');
    page.enter('target');
    const operation = page.start();
    page.call(() => old.cancel());
    expect(page.result.current.active).toBe(true);
    expect(page.result.current.state.loading).toBe(true);
    expect(page.result.current.state.points).toHaveLength(1);
    await act(async () => pending.resolve('current-png'));
    expect(await page.run(() => operation)).toBe(true);
    expect(page.history).toHaveLength(1);
    expect(page.target().data.params.magicList).toHaveProperty('recognition_1');
  });

  it.each(['blob', 'data-pending', 'empty', 'wrong-type', 'storyboard-child'])(
    'rejects the invalid %s source surface before reading or creating a temporary point',
    async (kind) => {
      const page = harness();
      page.enter();
      if (kind === 'storyboard-child')
        page.publish({
          ...page.raw(),
          nodes: [
            ...page.raw().nodes,
            { id: 'storyboard', type: 'group', data: { storyboardGroupType: 'image' } },
          ],
        });
      page.changeNode('source', (node) => ({
        ...node,
        type: kind === 'wrong-type' ? 'video' : node.type,
        ...(kind === 'storyboard-child' ? { parentId: 'storyboard' } : {}),
        data: {
          ...node.data,
          url:
            kind === 'blob'
              ? ['blob:pending']
              : kind === 'data-pending'
                ? ['data:image/png;base64,read-but-not-ready']
                : kind === 'empty'
                  ? []
                  : node.data.url,
        },
      }));
      page.refresh();
      expect(page.result.current.surfaceState('source')).toBeNull();
      expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
      expect(page.result.current.state.points).toEqual([]);
      expect(page.props().readImage).not.toHaveBeenCalled();
      expect(page.history).toEqual([]);
    },
  );

  it('keeps typed unavailable distinct from a malformed operational response and never inserts fake metadata', async () => {
    const read = vi
        .fn()
        .mockRejectedValueOnce(new CanvasMarkSourceError('UNAVAILABLE', 'service missing'))
        .mockResolvedValueOnce({ id: 'malformed', suggestions: [] })
        .mockResolvedValueOnce(response),
      page = harness({ source: createCanvasMarkSource({ markClickSuggest: read }) });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.result.current.state.error).toContain('元素识别服务未连接');
    expect(page.target().data.params.magicList).toBeUndefined();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(false);
    expect(page.result.current.state.error).toBe('未识别出任何内容，请重新尝试');
    expect(page.result.current.state.points).toEqual([]);
    expect(page.history).toEqual([]);
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    expect(page.result.current.state.points[0].index).toBe(3);
    expect(page.target().data.params.magicList).toHaveProperty('recognition_3');
    expect(page.history).toHaveLength(1);
  });

  it('checks the captured mode again in the pane RAF and keeps ordinary selections when adding the target', () => {
    const frames = [],
      page = harness();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      frames.push(callback);
      return frames.length;
    });
    page.enter();
    page.call((api) => api.paneClick());
    page.enter('other-target');
    page.enter('target');
    act(() => frames[0]());
    expect(page.props().setSelected).not.toHaveBeenCalled();
    page.call((api) => api.paneClick());
    act(() => frames[1]());
    expect(page.props().setSelected).toHaveBeenCalledOnce();
    expect(page.props().setSelected.mock.calls[0][0](['source-b'])).toEqual(['source-b', 'target']);
  });

  it('unmount aborts an in-flight reader and does not accept its late response', async () => {
    const pending = deferred(),
      page = harness({ readImage: vi.fn(() => pending.promise) });
    page.enter();
    const operation = page.start(),
      signal = page.props().readImage.mock.calls[0][1].signal;
    page.unmount();
    expect(signal.aborted).toBe(true);
    pending.resolve('late-png');
    expect(await operation).toBe(false);
    expect(page.read).not.toHaveBeenCalled();
    expect(page.history).toEqual([]);
  });

  it('Escape and return clear temporary points while preserving accepted graph, params and current zoom', async () => {
    const page = harness();
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    const accepted = page.raw();
    expect(page.call((api) => api.returnToTarget())).toBe(true);
    expect(page.props().focusView).toHaveBeenCalledExactlyOnceWith(
      { x: 262.5, y: 142.5, z: 0.5 },
      { duration: 400 },
    );
    expect(page.result.current.active).toBe(false);
    expect(page.result.current.state.points).toEqual([]);
    expect(page.raw()).toBe(accepted);
    page.enter();
    expect(page.call((api) => api.onEscape())).toBe(true);
    expect(page.raw()).toBe(accepted);
    expect(page.history).toHaveLength(1);
  });

  it.each([
    { button: 1 },
    { guard: 'space' },
    { guard: 'hand' },
    { guard: 'other-pointer' },
    { guard: 'tail-click' },
  ])('does not read or create a point for guarded ordinary gestures: %j', async (condition) => {
    const page = harness();
    page.enter();
    if (condition.guard === 'space') page.props().space.current = true;
    else if (condition.guard === 'hand') page.refresh({ tool: 'hand' });
    else if (condition.guard === 'other-pointer')
      page.refresh({ isOtherPointerActive: () => true });
    else if (condition.guard === 'tail-click') page.refresh({ shouldSuppressClick: () => true });
    expect(await page.run((api) => api.point('source', page.event('source', condition)))).toBe(
      false,
    );
    expect(page.props().readImage).not.toHaveBeenCalled();
    expect(page.result.current.state.points).toEqual([]);
  });
});

describe('mark prompt badge synchronization and first surface mutations', () => {
  it.each(['select', 'delete'])(
    'allows %s of an older confirmed point while another recognition is pending, retaining the change in its late response',
    async (action) => {
      const pending = deferred(),
        read = vi.fn().mockResolvedValueOnce(response).mockReturnValueOnce(pending.promise),
        page = harness({ source: createCanvasMarkSource({ markClickSuggest: read }) });
      page.enter();
      expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
      const originalEdges = page.raw().edges,
        second = page.start('source-b');
      await act(async () => {});
      expect(read).toHaveBeenCalledTimes(2);
      expect(page.result.current.state.loading).toBe(true);
      expect(page.result.current.state.points).toHaveLength(2);
      expect(
        page.call((api) =>
          action === 'select'
            ? api.surfaceState('source').onSelect('recognition_1', 1)
            : api.surfaceState('source').onDelete('recognition_1'),
        ),
      ).toBe(true);
      expect(page.result.current.state.loading).toBe(true);
      expect(page.history).toHaveLength(2);
      if (action === 'select') {
        expect(page.target().data.params.prompt).toBe('原稿 {{magic:recognition_1:1}}');
        expect(page.result.current.state.points[0].selectedSuggestionIndex).toBe(1);
      } else {
        expect(page.target().data.params.prompt).toBe('原稿');
        expect(page.target().data.params.magicList).toBeUndefined();
        expect(page.result.current.state.points.map((point) => point.index)).toEqual([2]);
      }
      await act(async () => pending.resolve(response));
      expect(await page.run(() => second)).toBe(true);
      expect(page.result.current.state.loading).toBe(false);
      expect(page.history).toHaveLength(3);
      expect(page.props().commitGraph).toHaveBeenCalledTimes(3);
      expect(page.props().flushGraph).toHaveBeenCalledTimes(3);
      expect(page.raw().edges).toBe(originalEdges);
      expect(page.target().data.params.magicList.recognition_2.imageUrl).toBe(sourceUrl);
      if (action === 'select') {
        expect(page.target().data.params.prompt).toBe(
          '原稿 {{magic:recognition_1:1}} {{magic:recognition_2:0}}',
        );
        expect(page.result.current.state.points[0].selectedSuggestionIndex).toBe(1);
        expect(page.target().data.params.magicList).toHaveProperty('recognition_1');
      } else {
        expect(page.target().data.params.prompt).toBe('原稿 {{magic:recognition_2:0}}');
        expect(page.target().data.params.magicList).not.toHaveProperty('recognition_1');
        expect(page.result.current.state.points.map((point) => point.apiResponseId)).toEqual([
          'recognition_2',
        ]);
      }
    },
  );

  it('persists the final uncommitted token-deletion draft while removing the real point even when its graph plan has no further change', async () => {
    let latestDraft = null;
    const page = harness({
      projectGraph: (raw) =>
        latestDraft === null
          ? raw
          : {
              ...raw,
              nodes: raw.nodes.map((node) =>
                node.id === 'target'
                  ? {
                      ...node,
                      data: {
                        ...node.data,
                        params: { ...node.data.params, prompt: latestDraft, magicList: undefined },
                      },
                    }
                  : node,
              ),
            },
    });
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    const raw = page.raw();
    latestDraft = '末次150ms尚未提交、最后token已删';
    expect(page.call((api) => api.surfaceState('source').onDelete('recognition_1'))).toBe(true);
    expect(page.target().data.params.prompt).toBe(latestDraft);
    expect(page.target().data.params.magicList).toBeUndefined();
    expect(page.result.current.state.points).toEqual([]);
    expect(page.history).toEqual([page.history[0], raw]);
    expect(page.props().commitGraph.mock.calls[1][1].expectedGraph).toBe(raw);
    expect(page.props().commitGraph).toHaveBeenCalledTimes(2);
    expect(page.props().flushGraph).toHaveBeenCalledTimes(2);
    expect(page.raw().edges).toBe(raw.edges);
  });

  it('can select and remove a previously recognized temporary point after Core prunes its last token/metadata, without a new graph write or history', async () => {
    const page = harness();
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    page.changeNode('target', (node) => ({
      ...node,
      data: {
        ...node.data,
        params: { ...node.data.params, prompt: '最后token已被输入删除', magicList: undefined },
      },
    }));
    page.refresh();
    const pruned = page.raw(),
      commits = page.props().commitGraph.mock.calls.length,
      flushes = page.props().flushGraph.mock.calls.length;
    expect(page.call((api) => api.surfaceState('source').onSelect('recognition_1', 1))).toBe(true);
    expect(page.result.current.state.points[0].selectedSuggestionIndex).toBe(1);
    expect(page.raw()).toBe(pruned);
    expect(page.call((api) => api.surfaceState('source').onDelete('recognition_1'))).toBe(true);
    expect(page.result.current.state.points).toEqual([]);
    expect(page.raw()).toBe(pruned);
    expect(page.props().commitGraph).toHaveBeenCalledTimes(commits);
    expect(page.props().flushGraph).toHaveBeenCalledTimes(flushes);
    expect(page.history).toHaveLength(1);
    expect(page.target().data.params.magicList).toBeUndefined();
  });

  it('syncs a prompt menu selection only to transient points, then surface select/delete each uses one projected CAS', async () => {
    const page = harness();
    page.enter();
    expect(await page.run((api) => api.point('source', page.event()))).toBe(true);
    const stableId = 'recognition_1';
    page.changeNode('target', (node) => ({
      ...node,
      data: {
        ...node.data,
        params: {
          ...node.data.params,
          prompt: '{{magic:recognition_1:0}} + {{magic:recognition_1:0}}',
        },
      },
    }));
    page.refresh();
    const raw = page.raw(),
      histories = page.history.length;
    expect(page.call((api) => api.syncSuggestion(stableId, 1))).toBe(true);
    expect(page.result.current.state.points[0].selectedSuggestionIndex).toBe(1);
    expect(page.raw()).toBe(raw);
    expect(page.history).toHaveLength(histories);
    expect(page.call((api) => api.surfaceState('source').onSelect(stableId, 1))).toBe(true);
    expect(page.target().data.params.prompt).toBe(
      '{{magic:recognition_1:1}} + {{magic:recognition_1:0}}',
    );
    expect(page.history).toHaveLength(histories + 1);
    const selected = page.raw();
    expect(page.call((api) => api.surfaceState('source').onDelete(stableId))).toBe(true);
    expect(page.target().data.params.prompt).toBe('+ {{magic:recognition_1:0}}');
    expect(page.target().data.params.magicList).toBeUndefined();
    expect(page.raw().edges).toBe(raw.edges);
    expect(page.raw().nodes[2]).toBe(selected.nodes[2]);
    expect(page.history).toHaveLength(histories + 2);
    expect(page.result.current.state.points).toEqual([]);
  });
});
