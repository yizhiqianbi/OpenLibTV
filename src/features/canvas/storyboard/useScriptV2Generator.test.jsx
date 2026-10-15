import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import support from '../../../../public/data/script-text-support.json';
import { createCanvasScriptNode } from './script-model.js';
import { useScriptV2Generator } from './useScriptV2Generator.js';

const image = (id, url) => ({
  id,
  type: 'image',
  position: { x: 0, y: 0 },
  data: { type: 'image', name: id, url: [url], action: 'image_resource' },
});
function harness(overrides = {}) {
  const script = createCanvasScriptNode({ id: 'script' });
  script.data.params = {
    prompt: '原剧情',
    model: 'aurora-3-prime',
    settings: { custom: 1 },
    advancedSettings: { precision: 0.8 },
  };
  let raw = {
    documentKey: 'doc',
    nodes: [script, image('a', '/a.png'), image('b', '/b.png')],
    edges: [
      { id: 'edge-a', source: 'a', target: 'script' },
      { id: 'edge-b', source: 'b', target: 'script' },
    ],
    models,
    ready: true,
    readonly: false,
  };
  const history = [];
  const props = {
    node: script,
    nodes: raw.nodes,
    edges: raw.edges,
    documentKey: 'doc',
    ready: true,
    readonly: false,
    modelContent: { data: models, loading: false, error: null, reload: vi.fn() },
    supportContent: { data: support, loading: false, error: null, reload: vi.fn() },
    getDocument: () => raw,
    commitGraph: vi.fn((next, { expectedGraph }) => {
      if (
        raw.nodes !== expectedGraph.nodes ||
        raw.edges !== expectedGraph.edges ||
        raw.models !== expectedGraph.models ||
        raw.readonly ||
        !raw.ready
      )
        return false;
      history.push(raw);
      raw = next;
      return true;
    }),
    flushGraph: vi.fn(() => true),
    notify: vi.fn(),
    ...overrides,
  };
  const page = renderHook((value) => useScriptV2Generator(value), { initialProps: props });
  const call = (action) => {
    let result;
    act(() => {
      result = action(page.result.current);
    });
    return result;
  };
  return {
    ...page,
    props,
    call,
    history,
    raw: () => raw,
    publish: (next) => {
      raw = next;
    },
    refresh: (patch = {}) =>
      page.rerender({
        ...props,
        ...patch,
        node: raw.nodes.find((node) => node.id === 'script'),
        nodes: raw.nodes,
        edges: raw.edges,
      }),
  };
}

describe('dedicated ScriptV2 generator transactions', () => {
  it('applies the source prompt cleanup without a raw prompt patch restoring obsolete camera indices', () => {
    const owner = harness();
    const node = owner.raw().nodes[0];
    node.data.params.cameraPresets = [
      { name: '第一镜头' },
      { name: '第二镜头' },
      { name: '第三镜头' },
    ];
    node.data.params.magicList = { used: { value: '使用' }, unused: { value: '删除' } };
    owner.refresh();
    expect(
      owner.call((api) =>
        api.changeParams({ prompt: '{{CameraPreset 3}} {{magic:used:1}} {{Image 2}}' }),
      ),
    ).toBe(true);
    const params = owner.raw().nodes[0].data.params;
    expect(params.prompt).toBe('{{CameraPreset 1}} {{magic:used:1}} {{Image 2}}');
    expect(params.cameraPresets).toEqual([{ name: '第三镜头' }]);
    expect(params.magicList).toEqual({ used: { value: '使用' } });
    expect(owner.history).toHaveLength(1);
  });
  it('blocks a source-disabled model through the raw controller callback as well as the menu', () => {
    const disabledSupport = {
      items: support.items.map((item) =>
        item.modelKey === 'aurora-3-lite' ? { ...item, disable: true } : item,
      ),
    };
    const owner = harness({
      supportContent: { data: disabledSupport, loading: false, error: null },
    });
    expect(
      owner.result.current.projection.modelList.find((item) => item.modelKey === 'aurora-3-lite')
        .disabled,
    ).toBe(true);
    expect(owner.call((api) => api.changeParams({ model: 'aurora-3-lite' }))).toBe(false);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });
  it('projects the three source model choices and task scene without writing on mount', () => {
    const owner = harness();
    expect(owner.result.current.projection.modelKeys).toEqual(
      support.items.map((item) => item.modelKey),
    );
    expect(owner.result.current.projection.params.scene).toBe('script-generate-v2');
    expect(owner.result.current.projection.references.imageList.map((item) => item.nodeId)).toEqual(
      ['a', 'b'],
    );
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
    expect(owner.props.flushGraph).not.toHaveBeenCalled();
    expect(owner.raw().nodes[0].data.params).not.toHaveProperty('scene');
  });

  it('merges a last prompt and model choice in one CAS/history, preserving custom config without inferring media mode', () => {
    const owner = harness();
    const before = owner.raw();
    expect(owner.call((api) => api.changeParams({ model: 'aurora-3-lite' }, '最后剧情'))).toBe(
      true,
    );
    expect(owner.history).toEqual([before]);
    const params = owner.raw().nodes[0].data.params;
    expect(params).toMatchObject({
      prompt: '最后剧情',
      model: 'aurora-3-lite',
      scene: 'script-generate-v2',
      settings: { custom: 1 },
      advancedSettings: { precision: 0.8 },
    });
    expect(params).not.toHaveProperty('modeType');
    expect(owner.props.flushGraph).toHaveBeenCalledExactlyOnceWith(owner.raw());
    expect(owner.call((api) => api.changeParams({ model: 'unknown-model' }))).toBe(false);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
  });

  it('records only the dragged typed order and preserves prompt token indices and other ordering keys', () => {
    const owner = harness();
    const node = owner.raw().nodes[0];
    node.data.params = {
      ...node.data.params,
      videoListOrder: ['v'],
      mixedListOrder: ['b', 'a'],
      prompt: '{{Image 1}}与{{Image 2}}',
    };
    owner.refresh();
    expect(
      owner.call((api) => api.reorder('imageList', ['b', 'a'], '{{Image 1}}与{{Image 2}}最后输入')),
    ).toBe(true);
    expect(owner.raw().nodes[0].data.params).toMatchObject({
      imageListOrder: ['b', 'a'],
      videoListOrder: ['v'],
      mixedListOrder: ['b', 'a'],
      prompt: '{{Image 1}}与{{Image 2}}最后输入',
    });
    owner.refresh();
    expect(owner.call((api) => api.reorder('mixedList', ['a', 'b'], '不应写入'))).toBe(false);
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
  });

  it('removes a direct reference edge and purges stale params so it cannot revive after refresh', () => {
    const owner = harness();
    const node = owner.raw().nodes[0];
    node.data.params.imageList = [
      { nodeId: 'a', url: '/a.png' },
      { nodeId: 'b', url: '/b.png' },
    ];
    node.data.params.imageListOrder = ['a', 'b'];
    node.data.params.scenePayload = {
      retained: '场景信息',
      source_images: [{ ref_id: 'src_img_1', node_id: 'a', url: '/a.png' }],
    };
    owner.refresh();
    expect(owner.call((api) => api.removeReference('a', '最后输入'))).toBe(true);
    expect(owner.raw().nodes).toHaveLength(3);
    expect(owner.raw().edges.map((edge) => edge.id)).toEqual(['edge-b']);
    expect(owner.raw().nodes[0].data.params.imageListOrder).toEqual(['b']);
    expect(owner.raw().nodes[0].data.params.imageList.map((ref) => ref.nodeId)).toEqual(['b']);
    expect(owner.raw().nodes[0].data.params.scenePayload).toEqual({
      retained: '场景信息',
      source_images: [{ ref_id: 'src_img_1', node_id: 'b', url: '/b.png', display_name: 'b' }],
    });
    owner.refresh();
    expect(owner.result.current.projection.references.imageList.map((ref) => ref.nodeId)).toEqual([
      'b',
    ]);
    expect(owner.history).toHaveLength(1);
  });

  it('rejects an obsolete prompt baseline instead of replacing a fresh external prompt', () => {
    const owner = harness();
    owner.publish({
      ...owner.raw(),
      nodes: owner.raw().nodes.map((node) =>
        node.id === 'script'
          ? {
              ...node,
              data: { ...node.data, params: { ...node.data.params, prompt: '外部新剧情' } },
            }
          : node,
      ),
    });
    expect(owner.call((api) => api.changeParams({ model: 'aurora-3-lite' }, '旧DOM的剧情'))).toBe(
      false,
    );
    expect(owner.raw().nodes[0].data.params.prompt).toBe('外部新剧情');
    expect(owner.result.current.error).toContain('无法覆盖新内容');
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    'requires strict commit acceptance (%s), keeps failed input and does not persist the uncommitted plan',
    (result) => {
      const owner = harness({ commitGraph: vi.fn(() => result) });
      expect(owner.call((api) => api.changeParams({ prompt: '待保存' }))).toBe(false);
      expect(owner.raw().nodes[0].data.params.prompt).toBe('原剧情');
      expect(owner.props.flushGraph).not.toHaveBeenCalled();
      expect(owner.result.current.error).toContain('输入已保留');
    },
  );

  it('accepts the published input after Quota, retries only saving the latest graph and ignores later catalog failure', () => {
    const owner = harness({ flushGraph: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    expect(owner.call((api) => api.changeParams({ prompt: '配额失败仍保留' }))).toBe(true);
    expect(owner.result.current.pendingSave).toBe(true);
    owner.publish({
      ...owner.raw(),
      nodes: owner
        .raw()
        .nodes.map((node) => (node.id === 'b' ? { ...node, position: { x: 300, y: 400 } } : node)),
    });
    owner.refresh({ supportContent: { data: null, loading: false, error: new Error('离线') } });
    expect(owner.call((api) => api.retrySave())).toBe(true);
    expect(owner.props.flushGraph).toHaveBeenLastCalledWith(owner.raw());
    expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
    expect(owner.history).toHaveLength(1);
    expect(owner.result.current.pendingSave).toBe(false);
  });

  it('builds a source-compatible unsubmitted request from upstream TEXT even when the node prompt is explicitly empty', () => {
    const owner = harness();
    const raw = owner.raw();
    owner.publish({
      ...raw,
      nodes: [
        ...raw.nodes.map((node) =>
          node.id === 'script'
            ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: '' } } }
            : node,
        ),
        {
          id: 'story',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { type: 'text', content: ['完整上游剧本'] },
        },
      ],
      edges: [...raw.edges, { id: 'text-edge', source: 'story', target: 'script' }],
    });
    owner.refresh();
    const request = owner.call((api) => api.submit(''));
    expect(request).toMatchObject({
      submitted: false,
      params: {
        scene: 'script-generate-v2',
        textList: [{ nodeId: 'story', content: ['完整上游剧本'] }],
      },
    });
    expect(request.params.prompt).toBe('');
    expect(request.params.scenePayload.source_images).toMatchObject([
      { ref_id: 'src_img_1', node_id: 'a', url: '/a.png' },
      { ref_id: 'src_img_2', node_id: 'b', url: '/b.png' },
    ]);
    expect(owner.raw().nodes[0].data).not.toHaveProperty('taskInfo.loading');
    expect(owner.result.current.error).toContain('服务尚未接入');
    expect(owner.props.notify).toHaveBeenCalledTimes(1);
  });

  it.each(['readonly', 'ready', 'busy', 'document'])(
    'rejects old actions and save retries when %s changes',
    (kind) => {
      const owner = harness({ flushGraph: vi.fn(() => false) });
      const previous = owner.result.current;
      owner.call((api) => api.changeParams({ prompt: '未保存剧情' }));
      if (kind === 'busy')
        owner.publish({
          ...owner.raw(),
          nodes: owner
            .raw()
            .nodes.map((node) =>
              node.id === 'script'
                ? { ...node, data: { ...node.data, taskInfo: { loading: true, status: 1 } } }
                : node,
            ),
        });
      if (kind === 'document') owner.publish({ ...owner.raw(), documentKey: 'other-doc' });
      owner.refresh({
        ...(kind === 'readonly' ? { readonly: true } : {}),
        ...(kind === 'ready' ? { ready: false } : {}),
        ...(kind === 'document' ? { documentKey: 'other-doc' } : {}),
      });
      expect(owner.call(() => previous.changeParams({ prompt: '旧动作' }))).toBe(false);
      expect(owner.call(() => previous.retrySave())).toBe(false);
      expect(owner.props.commitGraph).toHaveBeenCalledTimes(1);
      expect(owner.props.flushGraph).toHaveBeenCalledTimes(1);
    },
  );

  it('writes source expanded width/height without introducing the generic expansion field', () => {
    const owner = harness();
    expect(owner.call((api) => api.changeExpandedSize({ width: 860, height: 500 }))).toBe(true);
    expect(owner.raw().nodes[0].data).toMatchObject({
      expandedGeneratorWidth: 860,
      expandedGeneratorHeight: 500,
    });
    expect(owner.raw().nodes[0].data).not.toHaveProperty('generatorExpandedSize');
  });

  it('consumes both rejected catalog reloads and prevents unavailable-schema writes', async () => {
    const owner = harness({
      supportContent: {
        data: null,
        loading: false,
        error: new Error('目录失败'),
        reload: vi.fn().mockRejectedValue(new Error('再失败')),
      },
    });
    owner.props.modelContent.reload.mockRejectedValue(new Error('模型失败'));
    expect(owner.result.current.catalogStatus).toBe('error');
    expect(owner.call((api) => api.changeParams({ prompt: '拒绝覆盖' }))).toBe(false);
    await expect(owner.result.current.reload()).resolves.toMatchObject([
      { status: 'rejected' },
      { status: 'rejected' },
    ]);
    expect(owner.props.commitGraph).not.toHaveBeenCalled();
  });
});
