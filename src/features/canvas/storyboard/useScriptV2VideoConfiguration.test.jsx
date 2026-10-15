import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScriptV2VideoConfiguration } from './useScriptV2VideoConfiguration.js';

const schema = {
  modelVendor: 'local-reader',
  properties: {
    modeType: { items: { mixed2video: [1, 4] }, mixed2videoConfig: { imageMax: 4 } },
    ratio: { enum: ['16:9', '1:1'], default: '16:9', originalField: 'aspect_ratio' },
    duration: { enum: [4, 6], default: 4 },
    resolution: { enum: ['720p', '1080p'], default: '720p' },
    enableSound: { enum: ['on', 'off'], default: 'off' },
    autoCompliance: { default: 1, enable: true },
  },
  config: {
    settings: { mixed2video: ['ratio', 'duration', 'resolution', 'enableSound'] },
    advancedSettings: ['autoCompliance'],
  },
};
const models = {
  default: { video: 'a' },
  videoModels: {
    a: schema,
    b: { ...schema, modelVendor: 'star-video2-local', properties: { ...schema.properties } },
  },
};
const support = { items: [{ modelKey: 'a', modelName: '普通模型' }, { modelKey: 'b' }] };
const snapshot = () => ({
  documentKey: 'A',
  ready: true,
  readonly: false,
  models,
  edges: [],
  nodes: [
    {
      id: 'script',
      type: 'script-v2',
      width: 350,
      position: { x: 10, y: 20 },
      data: {
        type: 'script-v2',
        name: '源脚本',
        rows: ['r1', 'r2'].map((hiddenUuid, index) => ({
          id: `row${index}`,
          hiddenUuid,
          shotNumber: index + 1,
          durationSeconds: 4,
          plotDescription: '晨光海岸',
          videoMotionPrompt: `@主角 推进${index + 1}`,
          imageGenerationPrompt: '主角沿海散步',
          characters: [{ characterAssetId: 'character' }],
        })),
        assets: {
          characters: [{ id: 'character', name: '主角', linkedNodeId: 'asset' }],
          scenes: [],
          props: [],
        },
      },
    },
    {
      id: 'asset',
      type: 'image',
      position: { x: -500, y: 20 },
      data: {
        name: '主角',
        url: ['https://asset.test/a.png'],
        originalUrl: ['https://asset.test/original.png'],
      },
    },
  ],
});
const deferred = () => {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
};
function mount(extra = {}) {
  const context = { graph: snapshot() };
  const props = {
    documentKey: 'A',
    projectId: 'project-a',
    scriptId: 'script',
    ready: true,
    readonly: false,
    enabled: true,
    nodes: context.graph.nodes,
    suspended: false,
    modelContent: { data: models, reload: vi.fn() },
    supportContent: { data: support, reload: vi.fn() },
    getDocument: () => context.graph,
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (
        expectedGraph.nodes !== context.graph.nodes ||
        expectedGraph.edges !== context.graph.edges
      )
        return false;
      context.graph = next;
      return true;
    }),
    flushGraph: vi.fn(() => true),
    setSelected: vi.fn(),
    focusCreatedGroup: vi.fn(),
    cancelOtherGestures: vi.fn(),
    notify: vi.fn(),
    ...extra,
  };
  const hook = renderHook((value) => useScriptV2VideoConfiguration(value), {
    initialProps: props,
    wrapper: StrictMode,
  });
  const open = () => act(() => hook.result.current.open());
  const change = (command) => act(() => hook.result.current.props.onChange(command));
  const submit = () => act(async () => hook.result.current.props.onConfirm());
  const refresh = (patch = {}) => {
    Object.assign(props, { nodes: context.graph.nodes, ...patch });
    hook.rerender({ ...props });
  };
  return { ...hook, props, context, open, change, submit, refresh };
}

afterEach(() => vi.useRealTimers());

describe('ScriptV2 configuration request ownership', () => {
  it('does not read the document or subscribe global pagehide listeners while idle', () => {
    const getDocument = vi.fn(),
      listener = vi.spyOn(window, 'addEventListener');
    mount({ getDocument });
    expect(getDocument).not.toHaveBeenCalled();
    expect(listener.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(0);
  });
  it('initializes all source shots without an image group, retains repeated open and preserves ordinary local edits', () => {
    const value = mount();
    value.open();
    const request = value.result.current.request;
    expect(value.result.current.props.state.selectedHiddenUuids).toEqual(new Set(['r1', 'r2']));
    expect(value.result.current.props.state.config.settings).toMatchObject({
      aspect_ratio: '16:9',
      enableSound: 'on',
    });
    value.change({ type: 'duration', hiddenUuid: 'r1', value: 6 });
    value.change({ type: 'toggleRow', hiddenUuid: 'r2' });
    value.open();
    expect(value.result.current.request).toBe(request);
    expect(value.result.current.props.state.perShotDurations.get('r1')).toBe(6);
    expect(value.props.commitGraph).not.toHaveBeenCalled();
  });
  it('creates only selected empty generators, commits one graph and flushes the synchronously published document', async () => {
    const value = mount();
    value.open();
    value.change({ type: 'duration', hiddenUuid: 'r1', value: 6 });
    value.change({ type: 'toggleRow', hiddenUuid: 'r2' });
    await value.submit();
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledWith(value.context.graph);
    const videos = value.context.graph.nodes.filter((node) => node.type === 'video');
    expect(videos).toHaveLength(1);
    expect(videos[0].data).toMatchObject({
      url: [],
      params: { modeType: 'mixed2video', settings: { duration: 6 } },
    });
    const source = value.context.graph.nodes.find((node) => node.id === 'script');
    expect(source.data.rows.map((row) => row.durationSeconds)).toEqual([4, 4]);
    expect(source.data.videoGenConfig).toBeUndefined();
    expect(value.result.current.request).toBeNull();
  });
  it('reports source per-shot reference fallback only after the graph is saved', async () => {
    const value = mount();
    const source = value.context.graph.nodes[0];
    const localModels = {
      ...models,
      videoModels: {
        ...models.videoModels,
        a: {
          ...schema,
          properties: { ...schema.properties, modeType: { items: { mixed2video: [2, 4] } } },
        },
      },
    };
    value.context.graph = {
      ...value.context.graph,
      models: localModels,
      nodes: [
        {
          ...source,
          data: {
            ...source.data,
            assets: {
              ...source.data.assets,
              scenes: [{ id: 'scene', name: '海岸', linkedNodeId: 'scene-node' }],
            },
            rows: source.data.rows.map((row, index) =>
              index ? { ...row, sceneAssetIds: ['scene'] } : row,
            ),
          },
        },
        value.context.graph.nodes[1],
        {
          id: 'scene-node',
          type: 'image',
          position: { x: -500, y: 600 },
          data: { url: ['https://asset.test/scene.png'] },
        },
      ],
    };
    value.refresh({ modelContent: { data: localModels } });
    value.open();
    expect(value.result.current.props.projection.canConfirm).toBe(true);
    expect(value.props.notify).not.toHaveBeenCalled();
    await value.submit();
    const videos = value.context.graph.nodes.filter((node) => node.type === 'video');
    expect(videos.map((node) => node.data.params.modeType)).toEqual(['text2video', 'mixed2video']);
    expect(videos[0].data.params.imageList).toEqual([]);
    expect(value.props.notify).toHaveBeenCalledWith(
      expect.stringContaining('1 个分镜共 1 张参考图未生效'),
    );
  });
  it('retains the committed graph after quota failure and retries only its persistence despite later catalogue failures', async () => {
    const value = mount({ flushGraph: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    value.open();
    await value.submit();
    expect(value.result.current.props.pendingSave).toBe(true);
    const count = value.context.graph.nodes.length;
    value.change({ type: 'model', value: 'b' });
    expect(value.result.current.props.state.config.model).toBe('a');
    value.refresh({ modelContent: { data: null, error: 'offline' }, enabled: false });
    await value.submit();
    expect(value.context.graph.nodes).toHaveLength(count);
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledTimes(2);
    expect(value.result.current.request).toBeNull();
  });
  it('keeps selected shots/configuration and blocks an audit-required model without a reader', async () => {
    const value = mount();
    value.open();
    value.change({ type: 'model', value: 'b' });
    await value.submit();
    expect(value.props.commitGraph).not.toHaveBeenCalled();
    expect(value.result.current.props.error).toContain('审核服务未连接');
    expect(value.result.current.props.state.config.model).toBe('b');
    expect(value.result.current.request).toBeTruthy();
  });
  it('consumes reload rejections without modifying the document', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('offline'));
    const value = mount({
      modelContent: { data: null, error: 'offline', reload },
      supportContent: { data: null, error: 'offline', reload },
    });
    value.open();
    let result;
    await act(async () => {
      result = await value.result.current.props.onRetryCatalog();
    });
    expect(result.map((entry) => entry.status)).toEqual(['rejected', 'rejected']);
    expect(value.result.current.props.catalogStatus).toBe('error');
    expect(value.props.commitGraph).not.toHaveBeenCalled();
  });
  it('offers catalogue retry for a malformed configuration and recovers without replacing the request', () => {
    const value = mount({
      supportContent: { data: { items: [...support.items, support.items[0]] }, reload: vi.fn() },
    });
    value.open();
    const request = value.result.current.request;
    expect(value.result.current.props.catalogStatus).toBe('error');
    expect(value.result.current.props.error).toContain('配置无效');
    value.refresh({ supportContent: { data: support } });
    expect(value.result.current.request).toBe(request);
    expect(value.result.current.props.catalogStatus).toBe('ready');
    expect(value.result.current.props.projection.canConfirm).toBe(true);
  });
  it('fits the saved group after the source 100ms delay and removes its gesture listener', async () => {
    vi.useFakeTimers();
    const board = document.createElement('div');
    const remove = vi.spyOn(board, 'removeEventListener');
    const value = mount({ selected: ['script'], board: { current: board } });
    value.open();
    await value.submit();
    expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    const group = value.context.graph.nodes.find((node) => node.type === 'group');
    expect(value.props.setSelected).toHaveBeenCalledWith([group.id]);
    expect(value.props.focusCreatedGroup).toHaveBeenCalledWith(group.id, value.context.graph.nodes);
    expect(remove.mock.calls.filter(([name]) => name === 'pointerdown')).toHaveLength(1);
  });
  it.each(['pointer', 'selection', 'document', 'pagehide', 'unmount'])(
    'does not let delayed group focus take over a new %s action',
    async (kind) => {
      vi.useFakeTimers();
      const board = document.createElement('div');
      const value = mount({ selected: ['script'], board: { current: board } });
      value.open();
      await value.submit();
      if (kind === 'pointer') act(() => board.dispatchEvent(new Event('pointerdown')));
      if (kind === 'selection') value.refresh({ selected: ['asset'] });
      if (kind === 'document') value.refresh({ documentKey: 'B' });
      if (kind === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
      if (kind === 'unmount') value.unmount();
      act(() => vi.advanceTimersByTime(100));
      expect(value.props.setSelected).not.toHaveBeenCalled();
      expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
    },
  );
  it.each([
    'close',
    'document',
    'ready',
    'readonly',
    'source',
    'nodes',
    'edges',
    'models',
    'pagehide',
    'unmount',
  ])('rejects a late asset audit after %s changes the request owner', async (kind) => {
    const response = deferred();
    const reader = vi.fn(() => response.promise);
    const value = mount({ source: { checkV2Portrait: reader } });
    value.open();
    value.change({ type: 'model', value: 'b' });
    let running;
    act(() => {
      running = value.result.current.props.onConfirm();
    });
    expect(reader).toHaveBeenCalledOnce();
    expect(reader.mock.calls[0][0].images[0]).toMatchObject({
      nodeId: 'asset',
      url: 'https://asset.test/a.png',
      originalUrl: ['https://asset.test/original.png'],
    });
    if (kind === 'close') act(() => value.result.current.props.onClose());
    if (kind === 'document') {
      value.context.graph = { ...value.context.graph, documentKey: 'B' };
      value.refresh({ documentKey: 'B' });
    }
    if (kind === 'ready') value.refresh({ ready: false });
    if (kind === 'readonly') value.refresh({ readonly: true });
    if (kind === 'source') value.refresh({ source: { checkV2Portrait: vi.fn() } });
    if (kind === 'nodes') {
      value.context.graph = { ...value.context.graph, nodes: [...value.context.graph.nodes] };
      value.refresh();
    }
    if (kind === 'edges') {
      value.context.graph = { ...value.context.graph, edges: [...value.context.graph.edges] };
      value.refresh();
    }
    if (kind === 'models') value.refresh({ modelContent: { data: { ...models } } });
    if (kind === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    if (kind === 'unmount') value.unmount();
    await act(async () => {
      response.resolve([
        {
          nodeId: 'asset',
          url: 'https://asset.test/a.png',
          status: 'approved',
          checkedAtMs: Date.now(),
          assetId: 'real-certificate',
        },
      ]);
      await running;
    });
    expect(reader.mock.calls[0][1].signal.aborted).toBe(true);
    expect(value.props.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
  });
  it('does not accept an undefined graph writer as success', async () => {
    const value = mount({ commitGraph: vi.fn() });
    value.open();
    await value.submit();
    expect(value.result.current.props.error).toContain('画布已经变化');
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.result.current.request).toBeTruthy();
  });
});
