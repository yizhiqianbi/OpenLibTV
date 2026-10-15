import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasBatchVideo } from './useCanvasBatchVideo.js';

const schema = {
  modelVendor: 'local-reader',
  properties: {
    modeType: { items: { singleImage2video: [1, 1], text2video: [0, 0] } },
    ratio: { enum: ['16:9', '4:3'], default: '16:9' },
    duration: { enum: [4, 6], default: 4 },
  },
  config: { settings: ['ratio', 'duration'], advancedSettings: [] },
};
const models = {
  default: { video: 'a' },
  videoModels: {
    a: schema,
    b: { ...schema, properties: { ...schema.properties, portrait: true } },
  },
};
const support = {
  items: [
    { modelKey: 'a', modelName: '模型甲' },
    { modelKey: 'b', modelName: '人像模型' },
  ],
};
function snapshot() {
  return {
    documentKey: 'A',
    ready: true,
    readonly: false,
    models,
    edges: [],
    nodes: [
      {
        id: 'script',
        type: 'screenplay',
        position: { x: 100, y: 200 },
        width: 600,
        data: {
          linkedImageGroupId: 'g',
          rows: [
            { hiddenUuid: 'r1', shotNumber: 1, videoMotionPrompt: '第一个镜头' },
            { hiddenUuid: 'r2', shotNumber: 2, videoMotionPrompt: '第二个镜头' },
          ],
          assets: { characters: [], scenes: [], props: [] },
        },
      },
      {
        id: 'g',
        type: 'group',
        position: { x: 900, y: 200 },
        width: 700,
        height: 500,
        data: {
          name: '分镜',
          sourceScriptNodeId: 'script',
          sourceScriptVersion: 'v1',
          storyboardGroupType: 'image',
        },
      },
      ...['r1', 'r2'].map((row, index) => ({
        id: `i${index + 1}`,
        type: 'image',
        parentId: 'g',
        position: { x: 40, y: 70 + index * 200 },
        width: 400,
        height: 200,
        data: {
          name: `图${index + 1}`,
          scriptRowHiddenUuid: row,
          contentWidth: 1600,
          contentHeight: 900,
          url: [`https://image.test/${row}.png`],
          params: { settings: { ratio: '16:9' } },
        },
      })),
    ],
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function mount(extra = {}) {
  const context = { graph: snapshot() };
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const commitGraph = vi.fn((next, { expectedGraph }) => {
    if (context.graph.nodes !== expectedGraph.nodes || context.graph.edges !== expectedGraph.edges)
      return false;
    context.graph = next;
    return true;
  });
  const props = {
    documentKey: 'A',
    projectId: 'project-a',
    ready: true,
    readonly: false,
    nodes: context.graph.nodes,
    selected: ['g'],
    suspended: false,
    modelContent: { data: models, reload: vi.fn() },
    supportContent: { data: support, reload: vi.fn() },
    getDocument: () => context.graph,
    commitGraph,
    flushGraph: vi.fn(() => true),
    getView: () => ({ x: 5, y: 6, z: 0.8 }),
    focusView: vi.fn(),
    focusCreatedGroup: vi.fn(),
    setSelected: vi.fn(),
    notify: vi.fn(),
    cancelOtherGestures: vi.fn(),
    board: { current: { getBoundingClientRect: () => ({ width: 1000, height: 700 }) } },
    ...extra,
  };
  const hook = renderHook((value) => useCanvasBatchVideo(value), {
    initialProps: props,
    wrapper: StrictMode,
  });
  const open = () => act(() => hook.result.current.open('g', opener));
  const change = (patch) =>
    act(() =>
      hook.result.current.props.onConfigChange({ ...hook.result.current.props.config, ...patch }),
    );
  const submit = () => act(async () => hook.result.current.props.onSubmit());
  const refresh = (patch = {}) => {
    Object.assign(props, patch);
    hook.rerender({ ...props });
  };
  return { ...hook, context, props, opener, commitGraph, open, change, submit, refresh };
}

describe('batch video request controller', () => {
  it('keeps repeated opener clicks on the same form and restores the first original viewport', () => {
    const value = mount();
    value.open();
    const owner = value.result.current.request;
    value.change({ settings: { ratio: '4:3', duration: 6 } });
    value.open();
    expect(value.result.current.request).toBe(owner);
    expect(value.result.current.props.config.settings.duration).toBe(6);
    expect(value.props.focusView).toHaveBeenCalledOnce();
    act(() => value.result.current.props.onClose());
    expect(value.props.focusView).toHaveBeenLastCalledWith(
      { x: 5, y: 6, z: 0.8 },
      { duration: 300 },
    );
  });
  it('consumes both failed reload promises and leaves loader errors available to the view', async () => {
    const value = mount({
      modelContent: {
        data: models,
        error: 'failed',
        reload: vi.fn().mockRejectedValue(new Error('models failed')),
      },
      supportContent: {
        data: support,
        error: 'failed',
        reload: vi.fn().mockRejectedValue(new Error('support failed')),
      },
    });
    value.open();
    let results;
    await act(async () => {
      results = await value.result.current.props.onRetry();
    });
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(value.result.current.props.disabledReason).toBe('模型配置加载失败');
  });
  it('refills missing raw ratio when first-image content dimensions arrive, retaining local edits', () => {
    const localSchema = {
      ...schema,
      properties: {
        modeType: schema.properties.modeType,
        duration: schema.properties.duration,
        ratio_raw: { enum: ['16:9', '1:1'] },
      },
      config: { settings: ['duration'], advancedSettings: [] },
    };
    const value = mount({ modelContent: { data: { ...models, videoModels: { a: localSchema } } } });
    value.context.graph = {
      ...value.context.graph,
      nodes: value.context.graph.nodes.map((node) =>
        node.id === 'i1'
          ? {
              ...node,
              data: {
                ...node.data,
                contentWidth: undefined,
                contentHeight: undefined,
                params: { settings: {} },
              },
            }
          : node,
      ),
    };
    value.refresh({ nodes: value.context.graph.nodes });
    value.open();
    value.change({ settings: { duration: 6 } });
    expect(value.result.current.props.config.settings.ratio_raw).toBeUndefined();
    value.context.graph = {
      ...value.context.graph,
      nodes: value.context.graph.nodes.map((node) =>
        node.id === 'i1'
          ? { ...node, data: { ...node.data, contentWidth: 1600, contentHeight: 900 } }
          : node,
      ),
    };
    value.refresh({ nodes: value.context.graph.nodes });
    expect(value.result.current.props.config.settings).toMatchObject({
      duration: 6,
      ratio_raw: '16:9',
    });
  });
  it('opens source local config, normalizes defaults, focuses viewport and restores opener without writing graph', () => {
    const value = mount();
    value.open();
    expect(value.result.current.props.config).toMatchObject({
      model: 'a',
      modeType: 'singleImage2video',
      settings: { ratio: '16:9', duration: 4 },
    });
    expect(value.props.focusView).toHaveBeenCalledWith(
      expect.objectContaining({ z: expect.any(Number) }),
      { duration: 300 },
    );
    expect(value.result.current.props.models.a.modelName).toBe('模型甲');
    expect(value.result.current.props.feeState.cost).toBe('-');
    expect(value.commitGraph).not.toHaveBeenCalled();
    act(() => value.result.current.props.onClose());
    expect(value.result.current.request).toBeNull();
    expect(value.props.focusView).toHaveBeenLastCalledWith(
      { x: 5, y: 6, z: 0.8 },
      { duration: 300 },
    );
    expect(document.activeElement).toBe(value.opener);
  });
  it('reopens from latest first image rather than last cancelled form', () => {
    const value = mount();
    value.open();
    value.change({ settings: { ratio: '4:3', duration: 6 } });
    act(() => value.result.current.props.onClose());
    value.context.graph = {
      ...value.context.graph,
      nodes: value.context.graph.nodes.map((node) =>
        node.id === 'i1'
          ? {
              ...node,
              data: { ...node.data, params: { settings: { ratio: '16:9', duration: 4 } } },
            }
          : node,
      ),
    };
    value.refresh({ nodes: value.context.graph.nodes });
    value.open();
    expect(value.result.current.props.config.settings).toMatchObject({
      ratio: '16:9',
      duration: 4,
    });
    expect(value.commitGraph).not.toHaveBeenCalled();
  });
  it('waits for independent catalogue, retries errors and refuses malformed loaded catalogues', async () => {
    const value = mount({ supportContent: { data: null, reload: vi.fn() } });
    value.open();
    expect(value.result.current.props.disabledReason).toBe('模型配置尚未就绪');
    value.refresh({ supportContent: { data: { items: {} }, reload: vi.fn() } });
    expect(value.result.current.props.disabledReason).toBe('模型配置加载失败');
    await act(async () => value.result.current.props.onRetry());
    expect(value.props.modelContent.reload).toHaveBeenCalledOnce();
    expect(value.props.supportContent.reload).toHaveBeenCalledOnce();
    value.refresh({ supportContent: { data: support } });
    expect(value.result.current.props.disabledReason).toBe('');
  });
  it('keeps unchanged model menu and normalized config references during panning renders', () => {
    const value = mount();
    value.open();
    const config = value.result.current.props.config,
      menu = value.result.current.props.models;
    value.refresh();
    expect(value.result.current.props.config).toBe(config);
    expect(value.result.current.props.models).toBe(menu);
  });
  it('debounces exact single-video fee, excludes advanced/media/count and multiplies only display', async () => {
    const source = {
      estimatePower: vi.fn(async () => ({ code: 0, data: { power: 3, originalPrice: 5 } })),
    };
    const value = mount({ source });
    value.open();
    value.change({ settings: { ratio: '4:3', duration: 6 }, advancedSettings: { extra: 8 } });
    await act(async () => vi.advanceTimersByTime(299));
    expect(source.estimatePower).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    const [request, options] = source.estimatePower.mock.calls[0];
    expect(request).toMatchObject({
      params: {
        prompt: '',
        count: 1,
        model: 'a',
        modeType: 'singleImage2video',
        settings: { ratio: '4:3', duration: 6 },
      },
      metadata: { node_id: 'g', project_id: 'project-a' },
      provider: 'local-reader',
      taskType: 'video',
    });
    expect(Object.keys(request.params).sort()).toEqual([
      'count',
      'modeType',
      'model',
      'prompt',
      'settings',
    ]);
    expect(options.signal.aborted).toBe(false);
    expect(value.result.current.props.feeState).toMatchObject({
      status: 'ready',
      cost: 6,
      originalCost: 10,
    });
  });
  it('aborts old fee, ignores late result and does not re-estimate only advanced changes', async () => {
    const first = deferred();
    const source = {
      estimatePower: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValue({ code: 0, data: { power: 9 } }),
    };
    const value = mount({ source });
    value.open();
    await act(async () => vi.advanceTimersByTime(300));
    const signal = source.estimatePower.mock.calls[0][1].signal;
    value.change({ settings: { ratio: '16:9', duration: 6 } });
    expect(signal.aborted).toBe(true);
    await act(async () => first.resolve({ code: 0, data: { power: 100 } }));
    expect(value.result.current.props.feeState.cost).toBe('-');
    await act(async () => vi.advanceTimersByTime(300));
    value.change({ advancedSettings: { internal: 12 } });
    await act(async () => vi.advanceTimersByTime(300));
    expect(source.estimatePower).toHaveBeenCalledTimes(2);
    expect(value.result.current.props.feeState.cost).toBe(18);
  });
  it('shows fee failure instead of fabricated zero and never estimates after close', async () => {
    const source = { estimatePower: vi.fn(async () => ({ code: 1 })) };
    const value = mount({ source });
    value.open();
    await act(async () => vi.advanceTimersByTime(300));
    expect(value.result.current.props.feeState).toMatchObject({ status: 'error', cost: '-' });
    value.change({ settings: { duration: 6 } });
    act(() => value.result.current.props.onClose());
    await act(async () => vi.advanceTimersByTime(300));
    expect(source.estimatePower).toHaveBeenCalledOnce();
  });
  it('commits one empty graph, saves once, then fits created group at 100ms without generation call', async () => {
    const value = mount();
    value.open();
    await value.submit();
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledOnce();
    const added = value.context.graph.nodes.slice(4);
    const videos = value.context.graph.nodes.filter((node) => node.type === 'video');
    expect(videos).toHaveLength(2);
    expect(videos[0].data.url).toEqual([]);
    expect(videos[0].data.params).toMatchObject({
      prompt: '第一个镜头',
      settings: { duration: 4 },
    });
    expect(videos[0].data.params.advancedSettings).toBeUndefined();
    expect(value.context.graph.edges).toHaveLength(3);
    expect(added.some((node) => node.type === 'group')).toBe(true);
    expect(value.result.current.request).toBeNull();
    expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(100));
    expect(value.props.focusCreatedGroup).toHaveBeenCalledOnce();
    expect(value.props.notify).toHaveBeenLastCalledWith(expect.stringContaining('未提交任务'));
  });
  it('retains graph/config on quota failure and retries only save without duplicate/history commits', async () => {
    const value = mount({ flushGraph: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    value.open();
    await value.submit();
    const committedNodes = value.context.graph.nodes;
    expect(value.result.current.props).toMatchObject({
      pendingSave: true,
      submitLabel: '重试保存',
    });
    const config = value.result.current.props.config;
    value.change({ settings: { duration: 6 } });
    expect(value.result.current.props.config).toBe(config);
    await value.submit();
    expect(value.context.graph.nodes).toBe(committedNodes);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledTimes(2);
    expect(value.result.current.request).toBeNull();
  });
  it('refuses portrait model without service, leaves whole graph untouched and keeps editable form', async () => {
    const value = mount();
    value.open();
    value.change({ model: 'b' });
    const original = value.context.graph;
    await value.submit();
    expect(value.context.graph).toBe(original);
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.result.current.props.error).toContain('人像审核');
    expect(value.result.current.props.busy).toBe(false);
  });
  it('requires service certificate bound to current child/url before committing, disables duplicate submit', async () => {
    const pending = deferred();
    const source = { checkPortrait: vi.fn(() => pending.promise) };
    const value = mount({ source });
    value.open();
    value.change({ model: 'b' });
    let operation;
    act(() => {
      operation = value.result.current.props.onSubmit();
    });
    expect(value.result.current.props.busy).toBe(true);
    await value.submit();
    expect(source.checkPortrait).toHaveBeenCalledOnce();
    const images = source.checkPortrait.mock.calls[0][0].images;
    await act(async () => {
      pending.resolve(
        images.map((image) => ({
          ...image,
          status: 'approved',
          assetId: `certificate-${image.childId}`,
          checkedAtMs: Date.now(),
        })),
      );
      await operation;
    });
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.context.graph.nodes.find((node) => node.id === 'i1').data.portraitAssetId).toBe(
      'certificate-i1',
    );
  });
  it.each([
    'close',
    'document',
    'readonly',
    'suspended',
    'selection',
    'source',
    'pagehide',
    'unmount',
  ])('cancels portrait operation on %s and ignores its late result', async (kind) => {
    const pending = deferred();
    const source = { checkPortrait: vi.fn(() => pending.promise) };
    const value = mount({ source });
    value.open();
    value.change({ model: 'b' });
    let operation;
    act(() => {
      operation = value.result.current.props.onSubmit();
    });
    const [request, options] = source.checkPortrait.mock.calls[0];
    if (kind === 'close') act(() => value.result.current.props.onClose());
    else if (kind === 'document') {
      value.context.graph = { ...snapshot(), documentKey: 'B' };
      value.refresh({ documentKey: 'B', nodes: value.context.graph.nodes });
    } else if (kind === 'readonly') value.refresh({ readonly: true });
    else if (kind === 'suspended') value.refresh({ suspended: true });
    else if (kind === 'selection') value.refresh({ selected: [] });
    else if (kind === 'source') value.refresh({ source: { checkPortrait: vi.fn() } });
    else if (kind === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    else value.unmount();
    expect(options.signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(
        request.images.map((image) => ({
          ...image,
          status: 'approved',
          exempt: true,
          checkedAtMs: Date.now(),
        })),
      );
      await operation;
    });
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
  });
  it('rejects async result when another edit changes raw graph, preserving newer content', async () => {
    const pending = deferred();
    const source = { checkPortrait: vi.fn(() => pending.promise) };
    const value = mount({ source });
    value.open();
    value.change({ model: 'b' });
    let operation;
    act(() => {
      operation = value.result.current.props.onSubmit();
    });
    value.context.graph = {
      ...value.context.graph,
      nodes: value.context.graph.nodes.map((node) =>
        node.id === 'script' ? { ...node, data: { ...node.data, name: '新编辑' } } : node,
      ),
    };
    await act(async () => {
      pending.resolve(
        source.checkPortrait.mock.calls[0][0].images.map((image) => ({
          ...image,
          status: 'approved',
          exempt: true,
          checkedAtMs: Date.now(),
        })),
      );
      await operation;
    });
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.context.graph.nodes[0].data.name).toBe('新编辑');
    expect(value.result.current.props.busy).toBe(false);
  });
  it('does not refit a new document or a deleted/replaced group after save', async () => {
    const value = mount();
    value.open();
    await value.submit();
    value.context.graph = { ...value.context.graph, nodes: snapshot().nodes };
    value.refresh({ nodes: value.context.graph.nodes });
    await act(async () => vi.advanceTimersByTime(100));
    expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
  });
  it.each(['selection', 'pointer'])(
    'cancels delayed fit when user starts another %s interaction',
    async (kind) => {
      const board = document.createElement('main');
      document.body.append(board);
      const value = mount({ board: { current: board } });
      value.open();
      await value.submit();
      if (kind === 'selection') value.refresh({ selected: ['i1'] });
      else act(() => board.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      await act(async () => vi.advanceTimersByTime(100));
      expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
      expect(value.props.setSelected).not.toHaveBeenCalled();
      board.remove();
    },
  );
  it('aborts portrait request when cached catalogue reload fails without replacing the old data', async () => {
    const pending = deferred(),
      source = { checkPortrait: vi.fn(() => pending.promise) };
    const value = mount({ source });
    value.open();
    value.change({ model: 'b' });
    let operation;
    act(() => {
      operation = value.result.current.props.onSubmit();
    });
    value.refresh({ supportContent: { data: support, error: new Error('reload failed') } });
    expect(source.checkPortrait.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(
        source.checkPortrait.mock.calls[0][0].images.map((image) => ({
          ...image,
          status: 'approved',
          exempt: true,
          checkedAtMs: Date.now(),
        })),
      );
      await operation;
    });
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
  });
  it('does not announce success or close when compare-and-swap commit fails', async () => {
    const value = mount({ commitGraph: vi.fn(() => false) });
    value.open();
    await value.submit();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.result.current.props.error).toContain('画布已经变化');
    expect(value.result.current.request).not.toBeNull();
  });
});
