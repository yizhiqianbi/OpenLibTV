import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useScriptV2ImageConfiguration } from './useScriptV2ImageConfiguration.js';

const schema = {
  properties: {
    modeType: { items: { image2image: [1, 3] } },
    ratio: { enum: ['16:9', '1:1'], default: '16:9', originalField: 'aspectRatio' },
    quality: { enum: ['medium', 'high'], default: 'medium' },
  },
  config: { settings: ['ratio', 'quality'] },
};
const models = { default: { image: 'a' }, imageModels: { a: schema, b: schema } };
const support = { items: [{ modelKey: 'a', modelName: '模型 A' }, { modelKey: 'b' }] };
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
        type: 'script-v2',
        width: 350,
        position: { x: 10, y: 20 },
        data: {
          type: 'script-v2',
          name: '源脚本',
          rows: [10, 30].map((shotNumber, index) => ({
            id: `row${index}`,
            hiddenUuid: `r${index}`,
            shotNumber,
            imageGenerationPrompt: `@主角 镜头${shotNumber}`,
            videoMotionPrompt: '不用于图像提示词',
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
        width: 350,
        height: 200,
        position: { x: -500, y: 20 },
        data: { name: '主角', url: ['https://fixture.test/a.png'] },
      },
    ],
  };
}
function mount(extra = {}) {
  const context = { graph: snapshot() };
  const props = {
    documentKey: 'A',
    scriptId: 'script',
    ready: true,
    readonly: false,
    selectionEligible: true,
    enabled: true,
    suspended: false,
    modelContent: { data: models, reload: vi.fn() },
    supportContent: { data: support, reload: vi.fn() },
    getDocument: vi.fn(() => context.graph),
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
    onCreated: vi.fn(),
    ...extra,
  };
  const hook = renderHook((value) => useScriptV2ImageConfiguration(value), {
    initialProps: props,
    wrapper: StrictMode,
  });
  const open = () => act(() => hook.result.current.open());
  const change = (command) => act(() => hook.result.current.props.onChange(command));
  const submit = () => act(async () => hook.result.current.props.onConfirm());
  const refresh = (patch = {}) => {
    Object.assign(props, patch);
    hook.rerender({ ...props });
  };
  return { ...hook, context, props, open, change, submit, refresh };
}

describe('ScriptV2 image configuration local transaction', () => {
  it('stays idle without reading documents or adding pagehide listeners', () => {
    const listener = vi.spyOn(window, 'addEventListener');
    const value = mount();
    expect(value.props.getDocument).not.toHaveBeenCalled();
    expect(listener.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(0);
  });

  it('selects every raw index, keeps edits through repeated open and resets only after a new opening', () => {
    const value = mount();
    value.open();
    const owner = value.result.current.request;
    expect(value.result.current.props.state.selectedIndices).toEqual(new Set([0, 1]));
    value.change({ type: 'toggleRow', index: 0 });
    value.change({ type: 'toggleExpanded', index: 1 });
    value.change({ type: 'setting', field: 'quality', value: 'high' });
    value.open();
    expect(value.result.current.request).toBe(owner);
    expect(value.result.current.props.state.config.settings.quality).toBe('high');
    expect(value.result.current.props.state.expandedIndices).toEqual(new Set([1]));
    act(() => value.result.current.props.onClose());
    value.open();
    expect(value.result.current.request).not.toBe(owner);
    expect(value.result.current.props.state.selectedIndices).toEqual(new Set([0, 1]));
    expect(value.result.current.props.state.config.settings.quality).toBe('medium');
    expect(value.props.commitGraph).not.toHaveBeenCalled();
  });

  it('saves one empty image group for a selected raw shot without selecting it or moving the viewport', async () => {
    const value = mount();
    const original = value.context.graph.nodes[0].data;
    value.open();
    value.change({ type: 'toggleRow', index: 0 });
    value.change({ type: 'setting', field: 'quality', value: 'high' });
    await value.submit();
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledWith(value.context.graph);
    const group = value.context.graph.nodes.find((node) => node.type === 'group');
    const image = value.context.graph.nodes.find((node) => node.parentId === group.id);
    expect(group.data).toMatchObject({ name: '分镜图 · 源脚本', groupLayoutMode: 'vertical' });
    expect(image.data).toMatchObject({
      name: '镜头 30',
      url: [],
      action: 'image_generate',
      scriptRowHiddenUuid: 'r1',
      params: { modeType: 'image2image', settings: { ratio: '16:9', quality: 'high' } },
    });
    expect(image.data.params.imageList).toEqual([
      { nodeId: 'asset', url: 'https://fixture.test/a.png' },
    ]);
    expect(image.data.params.prompt).toContain('镜头30');
    expect(image.data.params.prompt).not.toContain('不用于');
    expect(value.context.graph.nodes[0].data).toEqual({
      ...original,
      linkedImageGroupId: group.id,
    });
    expect(value.props.onCreated).toHaveBeenCalledWith(group);
    expect(value.props.setSelected).not.toHaveBeenCalled();
    expect(value.props.focusCreatedGroup).not.toHaveBeenCalled();
    expect(value.result.current.request).toBeNull();
    expect(value.props.notify).toHaveBeenCalledWith(expect.stringContaining('未提交任务'));
  });

  it('reads the latest published prompts at confirmation before React renders them', async () => {
    const value = mount();
    value.open();
    const script = value.context.graph.nodes[0];
    value.context.graph = {
      ...value.context.graph,
      nodes: [
        {
          ...script,
          data: {
            ...script.data,
            rows: script.data.rows.map((row) => ({ ...row, imageGenerationPrompt: '最后的草稿' })),
          },
        },
        value.context.graph.nodes[1],
      ],
    };
    await value.submit();
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    const images = value.context.graph.nodes.filter(
      (node) => node.data.action === 'image_generate',
    );
    expect(images.map((node) => node.data.params.prompt)).toEqual(['最后的草稿', '最后的草稿']);
  });

  it('blocks newly empty prompts published before React renders, preserving the original form', async () => {
    const value = mount();
    value.open();
    const script = value.context.graph.nodes[0];
    value.context.graph = {
      ...value.context.graph,
      nodes: [
        {
          ...script,
          data: {
            ...script.data,
            rows: script.data.rows.map((row) => ({ ...row, imageGenerationPrompt: '' })),
          },
        },
        value.context.graph.nodes[1],
      ],
    };
    await value.submit();
    expect(value.props.commitGraph).not.toHaveBeenCalled();
    expect(value.result.current.request).toBeTruthy();
    expect(value.result.current.props.error).toContain('已变化');
  });

  it('retains source raw-index selection when rows change while open', () => {
    const value = mount();
    value.open();
    value.change({ type: 'toggleRow', index: 0 });
    value.change({ type: 'toggleExpanded', index: 1 });
    const script = value.context.graph.nodes[0];
    value.context.graph = {
      ...value.context.graph,
      nodes: [
        { ...script, data: { ...script.data, rows: [script.data.rows[1]] } },
        value.context.graph.nodes[1],
      ],
    };
    value.refresh();
    expect(value.result.current.props.state.selectedIndices).toEqual(new Set([1]));
    expect(value.result.current.props.state.expandedIndices).toEqual(new Set([1]));
    expect(value.result.current.props.projection.selectedCount).toBe(1);
    expect(value.result.current.props.projection.totalCount).toBe(1);
  });

  it.each(['false', 'undefined', 'throw'])(
    'rejects a %s writer without flushing or discarding configuration',
    async (kind) => {
      const commitGraph = vi.fn(() => {
        if (kind === 'throw') throw new Error('writer failed');
        return kind === 'false' ? false : undefined;
      });
      const value = mount({ commitGraph });
      value.open();
      value.change({ type: 'setting', field: 'quality', value: 'high' });
      await value.submit();
      expect(value.props.flushGraph).not.toHaveBeenCalled();
      expect(value.result.current.props.state.config.settings.quality).toBe('high');
      expect(value.result.current.props.error).toBeTruthy();
      expect(value.result.current.props.busy).toBe(false);
      expect(value.result.current.props.pendingSave).toBe(false);
      expect(value.context.graph.nodes).toHaveLength(2);
    },
  );

  it.each(['false', 'throw'])(
    'retries only persistence after a %s flush failure even if the catalogue later fails',
    async (kind) => {
      const flushGraph = vi
        .fn()
        .mockImplementationOnce(() => {
          if (kind === 'throw') throw new Error('quota exceeded');
          return false;
        })
        .mockReturnValue(true);
      const value = mount({ flushGraph });
      value.open();
      await value.submit();
      const committed = value.context.graph;
      expect(value.result.current.props.pendingSave).toBe(true);
      expect(value.result.current.props.busy).toBe(false);
      value.change({ type: 'model', value: 'b' });
      expect(value.result.current.props.state.config.model).toBe('a');
      value.refresh({ enabled: false, modelContent: { data: null, error: new Error('offline') } });
      await value.submit();
      expect(value.context.graph).toBe(committed);
      expect(value.props.commitGraph).toHaveBeenCalledOnce();
      expect(value.props.flushGraph).toHaveBeenCalledTimes(2);
      expect(value.result.current.request).toBeNull();
    },
  );

  it('preserves a failed persistence retry and rejects restoring a deleted group', async () => {
    const value = mount({ flushGraph: vi.fn(() => false) });
    value.open();
    await value.submit();
    await value.submit();
    expect(value.result.current.props.pendingSave).toBe(true);
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    value.context.graph = {
      ...value.context.graph,
      nodes: value.context.graph.nodes.filter((node) => node.type !== 'group'),
    };
    await value.submit();
    expect(value.result.current.props.error).toContain('已移除');
    expect(value.props.flushGraph).toHaveBeenCalledTimes(2);
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
  });

  it('ignores a reentrant second confirmation inside the writer', async () => {
    const value = mount();
    const write = value.props.commitGraph.getMockImplementation();
    value.props.commitGraph.mockImplementation((...args) => {
      value.result.current.props.onConfirm();
      return write(...args);
    });
    value.open();
    await value.submit();
    expect(value.props.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledOnce();
  });

  it.each([
    'document',
    'script',
    'ready',
    'readonly',
    'selectionEligible',
    'suspended',
    'enabled',
    'pagehide',
    'unmount',
    'deleted',
  ])('rejects old callbacks after %s changes the owner', async (kind) => {
    const value = mount();
    value.open();
    const old = value.result.current.props;
    if (kind === 'document') value.refresh({ documentKey: 'B' });
    if (kind === 'script') value.refresh({ scriptId: 'another' });
    if (['ready', 'selectionEligible', 'enabled'].includes(kind)) value.refresh({ [kind]: false });
    if (['readonly', 'suspended'].includes(kind)) value.refresh({ [kind]: true });
    if (kind === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    if (kind === 'unmount') value.unmount();
    if (kind === 'deleted') {
      value.context.graph = { ...value.context.graph, nodes: value.context.graph.nodes.slice(1) };
      value.refresh();
    }
    await act(async () => old.onConfirm());
    act(() => old.onChange({ type: 'model', value: 'b' }));
    expect(value.props.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
  });

  it('does not let an old dialog close or submit a reopened request', async () => {
    const value = mount();
    value.open();
    const old = value.result.current.props;
    act(() => old.onClose());
    value.open();
    const owner = value.result.current.request;
    act(() => old.onClose());
    await act(async () => old.onConfirm());
    expect(value.result.current.request).toBe(owner);
    expect(value.props.commitGraph).not.toHaveBeenCalled();
  });

  it.each(['models', 'support'])(
    'keeps loading %s from becoming an empty usable catalogue',
    async (kind) => {
      const value = mount({
        [kind === 'models' ? 'modelContent' : 'supportContent']: { data: null },
      });
      value.open();
      expect(value.result.current.props.catalogStatus).toBe('loading');
      expect(value.result.current.props.state).toBeNull();
      await value.submit();
      expect(value.props.commitGraph).not.toHaveBeenCalled();
      value.refresh({ modelContent: { data: models }, supportContent: { data: support } });
      expect(value.result.current.props.projection.canConfirm).toBe(true);
    },
  );

  it('offers retry for duplicate malformed support and consumes failed reloads without replacing the request', async () => {
    const reload = vi.fn().mockRejectedValue(new Error('offline'));
    const value = mount({
      supportContent: { data: { items: [support.items[0], support.items[0]] }, reload },
      modelContent: { data: models, reload },
    });
    value.open();
    const owner = value.result.current.request;
    expect(value.result.current.props.catalogStatus).toBe('error');
    let outcomes;
    await act(async () => {
      outcomes = await value.result.current.props.onRetryCatalog();
    });
    expect(outcomes.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    value.refresh({ supportContent: { data: support } });
    expect(value.result.current.request).toBe(owner);
    expect(value.result.current.props.projection.canConfirm).toBe(true);
  });
});
