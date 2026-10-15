import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCanvasRoleLibrary } from './useCanvasRoleLibrary.js';

const schema = {
  properties: {
    modeType: {
      items: {
        image2video: [1, 9],
        video2video: [1, 9],
        audio2video: [1, 1],
        mixed2video: [1, 12],
      },
      mixed2videoConfig: { imageMax: 9, videoMax: 9, audioMax: 3 },
    },
  },
  config: { settings: [], advancedSettings: [] },
};
const models = { default: { video: 'role-video' }, videoModels: { 'role-video': schema } };
const target = (id = 'video-target') => ({
  id,
  type: 'video',
  position: { x: 1200, y: 200 },
  data: {
    type: 'video',
    action: 'video_generate',
    params: { model: 'role-video', modeType: 'text2video', prompt: 'rendered prompt' },
  },
});
const resource = (id, type = 'image', data = {}) => ({
  id,
  type,
  position: { x: 200, y: 800 },
  data: { type, action: `${type}_resource`, url: [`https://media.test/${id}`], ...data },
});
const selected = (patch = {}) => ({ images: [], videos: [], audios: [], ...patch });
const deferred = () => {
  let resolve;
  const promise = new Promise((value) => {
    resolve = value;
  });
  return { promise, resolve };
};
const outcome = (promise) =>
  promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );

function mount(extra = {}) {
  const state = {
    graph: { documentKey: 'A', ready: true, readonly: false, nodes: [target()], edges: [], models },
    prompt: 'rendered prompt',
    history: [],
  };
  const commitGraph = vi.fn((next, { expectedGraph, historySnapshot }) => {
    if (
      state.graph.nodes !== expectedGraph.nodes ||
      state.graph.edges !== expectedGraph.edges ||
      state.graph.models !== expectedGraph.models ||
      state.graph.documentKey !== expectedGraph.documentKey
    )
      return false;
    state.history.push(historySnapshot);
    state.graph = next;
    return true;
  });
  const props = {
    node: state.graph.nodes[0],
    documentKey: 'A',
    source: { name: 'injected-public-reader-fixture' },
    ready: true,
    readonly: false,
    getDocument: () => state.graph,
    getPrompt: vi.fn(() => state.prompt),
    graphActions: { commitGraph },
    flushGraph: vi.fn(() => true),
    asset: (url) => url,
    readImageDimensions: vi.fn(async () => ({ width: 1200, height: 800 })),
    ...extra,
  };
  const hook = renderHook((value) => useCanvasRoleLibrary(value), {
    initialProps: props,
    wrapper: StrictMode,
  });
  const refresh = (patch = {}) => {
    const currentNode = state.graph.nodes.find((node) => node.id === props.node?.id);
    Object.assign(props, { node: currentNode || props.node }, patch);
    hook.rerender({ ...props });
  };
  const open = () => act(() => hook.result.current.toggle());
  const confirm = async (selection) => {
    let result;
    await act(async () => {
      result = await hook.result.current.confirm(selection);
    });
    return result;
  };
  return { ...hook, state, props, commitGraph, refresh, open, confirm };
}

describe('role picker graph request independent ownership review', () => {
  it.each([
    [
      'document switch',
      (value) => {
        value.state.graph = { ...value.state.graph, documentKey: 'B', nodes: [target()] };
        value.refresh({ documentKey: 'B', node: value.state.graph.nodes[0] });
      },
    ],
    ['source replacement', (value) => value.refresh({ source: { name: 'new-source' } })],
    [
      'target switch',
      (value) => {
        const next = target('other-video');
        value.state.graph = { ...value.state.graph, nodes: [...value.state.graph.nodes, next] };
        value.refresh({ node: next });
      },
    ],
    [
      'target deletion',
      (value) => {
        value.state.graph = { ...value.state.graph, nodes: [] };
        value.refresh();
      },
    ],
    ['caller readiness lost', (value) => value.refresh({ ready: false })],
    ['caller readonly', (value) => value.refresh({ readonly: true })],
    [
      'raw graph readiness lost',
      (value) => {
        value.state.graph = { ...value.state.graph, ready: false };
        value.refresh();
      },
    ],
    [
      'raw graph readonly',
      (value) => {
        value.state.graph = { ...value.state.graph, readonly: true };
        value.refresh();
      },
    ],
    [
      'raw document mismatch',
      (value) => {
        value.state.graph = { ...value.state.graph, documentKey: 'different-raw-document' };
        value.refresh();
      },
    ],
    [
      'target becomes another type',
      (value) => {
        value.state.graph = {
          ...value.state.graph,
          nodes: [{ ...target(), type: 'image', data: { type: 'image' } }],
        };
        value.refresh();
      },
    ],
    ['unmount', (value) => value.unmount()],
  ])(
    'retires pending image dimensions after %s without writing or saving',
    async (_, invalidate) => {
      const read = deferred();
      const value = mount({ readImageDimensions: vi.fn(() => read.promise) });
      value.open();
      expect(value.result.current.open).toBe(true);
      let pending;
      act(() => {
        pending = outcome(
          value.result.current.confirm(selected({ images: ['https://media.test/new-image'] })),
        );
      });
      expect(value.props.readImageDimensions).toHaveBeenCalledOnce();
      invalidate(value);
      const survivingGraph = value.state.graph;
      let result;
      await act(async () => {
        read.resolve({ width: 1920, height: 1080 });
        result = await pending;
      });
      expect(result.error?.name).toBe('AbortError');
      expect(value.state.graph).toBe(survivingGraph);
      expect(value.commitGraph).not.toHaveBeenCalled();
      expect(value.props.flushGraph).not.toHaveBeenCalled();
      expect(value.state.history).toEqual([]);
    },
  );

  it('A→B→A retires the old same-ID confirm callback and leaves the new owner usable', async () => {
    const value = mount();
    value.open();
    const oldOwner = value.result.current.owner;
    const oldConfirm = value.result.current.confirm;
    value.state.graph = { ...value.state.graph, documentKey: 'B', nodes: [target()] };
    value.refresh({ documentKey: 'B', node: value.state.graph.nodes[0] });
    value.state.graph = { ...value.state.graph, documentKey: 'A', nodes: [target()] };
    value.refresh({ documentKey: 'A', node: value.state.graph.nodes[0] });
    value.open();
    expect(value.result.current.owner).not.toBe(oldOwner);
    let staleResult;
    await act(async () => {
      staleResult = await oldConfirm(selected({ images: ['https://media.test/stale'] }));
    });
    expect(staleResult).toBe(false);
    expect(value.props.readImageDimensions).not.toHaveBeenCalled();
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(await value.confirm(selected({ images: ['https://media.test/current'] }))).toBe(true);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
    expect(
      value.state.graph.nodes.some((node) => node.data?.url?.[0] === 'https://media.test/current'),
    ).toBe(true);
  });

  it('cancel aborts the pending read, and its late result cannot enter a reopened same-ID document', async () => {
    const read = deferred();
    const value = mount({ readImageDimensions: vi.fn(() => read.promise) });
    value.open();
    let pending;
    act(() => {
      pending = outcome(
        value.result.current.confirm(selected({ images: ['https://media.test/cancelled'] })),
      );
    });
    const signal = value.props.readImageDimensions.mock.calls[0][1].signal;
    act(() => value.result.current.close());
    expect(signal.aborted).toBe(true);
    value.state.graph = { ...value.state.graph, documentKey: 'B', nodes: [target()] };
    value.refresh({ documentKey: 'B', node: value.state.graph.nodes[0] });
    value.open();
    const replacement = value.state.graph;
    let result;
    await act(async () => {
      read.resolve({ width: 900, height: 600 });
      result = await pending;
    });
    expect(result.error?.name).toBe('AbortError');
    expect(value.result.current.open).toBe(true);
    expect(value.state.graph).toBe(replacement);
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
  });

  it('plans against the latest graph and last prompt after a pending read, preserving concurrent appends and settings', async () => {
    const read = deferred();
    const value = mount({ readImageDimensions: vi.fn(() => read.promise) });
    value.open();
    let pending;
    act(() => {
      pending = outcome(
        value.result.current.confirm(selected({ images: ['https://media.test/new'] })),
      );
    });
    const appended = resource('during-read', 'text', { content: ['期间添加'] });
    const unrelatedEdge = {
      id: 'during-read-edge',
      source: 'during-read',
      target: 'unrelated-target',
    };
    const updatedTarget = {
      ...target(),
      data: {
        ...target().data,
        params: {
          ...target().data.params,
          settings: { ratio: '4:3' },
          magicList: [{ id: 'real-point' }],
          subjectList: [{ uuid: 'kept-subject' }],
        },
      },
    };
    value.state.graph = {
      ...value.state.graph,
      nodes: [appended, resource('unrelated-target', 'text'), updatedTarget],
      edges: [unrelatedEdge],
    };
    value.state.prompt = '最后输入 {{magic:real-point:0}}';
    value.refresh({ node: updatedTarget });
    const rawBeforeCommit = value.state.graph;
    let result;
    await act(async () => {
      read.resolve({ width: 1200, height: 800 });
      result = await pending;
    });
    expect(result.value).toBe(true);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    const [next, transaction] = value.commitGraph.mock.calls[0];
    expect(transaction.expectedGraph).toBe(rawBeforeCommit);
    expect(next.nodes.find((node) => node.id === appended.id)).toBe(appended);
    expect(next.edges).toContain(unrelatedEdge);
    const addedImage = next.nodes.find((node) => node.data?.url?.[0] === 'https://media.test/new');
    expect(addedImage.data).toMatchObject({
      action: 'image_resource',
      portraitCompliantExempt: true,
    });
    expect(addedImage.data).not.toHaveProperty('portraitAssetId');
    expect(addedImage.data).not.toHaveProperty('portraitComplianceCheckedAtMs');
    expect(addedImage.data).not.toHaveProperty('task');
    const params = next.nodes.find((node) => node.id === 'video-target').data.params;
    expect(params).toMatchObject({
      prompt: '最后输入 {{magic:real-point:0}}',
      settings: { ratio: '4:3' },
      magicList: [{ id: 'real-point' }],
      subjectList: [{ uuid: 'kept-subject' }],
    });
    expect(
      transaction.historySnapshot.nodes.find((node) => node.id === 'video-target').data.params
        .prompt,
    ).toBe(params.prompt);
    expect(transaction.historySnapshot.nodes.find((node) => node.id === appended.id)).toBe(
      appended,
    );
    expect(transaction.historySnapshot.edges).toBe(rawBeforeCommit.edges);
    expect(value.state.history).toHaveLength(1);
    expect(value.props.flushGraph).toHaveBeenCalledExactlyOnceWith(value.state.graph);
    expect(value.props.flushGraph.mock.calls[0][0].nodes).toBe(next.nodes);
    expect(value.props.flushGraph.mock.calls[0][0].edges).toBe(next.edges);
    expect(value.props.flushGraph.mock.calls[0][0].documentKey).toBe('A');
  });

  it('synchronous duplicate confirmation starts one read and accepts only one CAS/history entry', async () => {
    const read = deferred();
    const value = mount({ readImageDimensions: vi.fn(() => read.promise) });
    value.open();
    const selection = selected({ images: ['https://media.test/one'] });
    let first, duplicate;
    act(() => {
      first = outcome(value.result.current.confirm(selection));
      duplicate = value.result.current.confirm(selection);
    });
    expect(value.props.readImageDimensions).toHaveBeenCalledOnce();
    let results;
    await act(async () => {
      read.resolve({ width: 800, height: 800 });
      results = await Promise.all([first, duplicate]);
    });
    expect(results).toEqual([{ value: true }, false]);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
    expect(value.state.graph.nodes).toHaveLength(2);
    expect(value.state.graph.edges).toHaveLength(1);
  });

  it('after an accepted graph hits quota, the same selection retries only the current graph save', async () => {
    const flushGraph = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const value = mount({ flushGraph });
    value.open();
    const selection = selected({ images: ['https://media.test/one'] });
    let first;
    await act(async () => {
      first = await outcome(value.result.current.confirm(selection));
    });
    expect(first.error?.message).toContain('重试只保存当前画布');
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
    const acceptedGraph = value.state.graph;
    const acceptedNodes = value.state.graph.nodes;
    const acceptedEdges = value.state.graph.edges;
    const createdId = acceptedEdges[0].source;
    const appended = resource('after-quota', 'text');
    value.state.graph = { ...value.state.graph, nodes: [...acceptedNodes, appended] };
    value.refresh();
    const latestGraph = value.state.graph;
    expect(await value.confirm(selection)).toBe(true);
    expect(value.state.graph).toBe(latestGraph);
    expect(value.state.graph.edges).toBe(acceptedEdges);
    expect(value.state.graph.nodes.filter((node) => node.id === createdId)).toHaveLength(1);
    expect(value.state.graph.nodes).toContain(appended);
    expect(value.props.readImageDimensions).toHaveBeenCalledOnce();
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
    expect(flushGraph.mock.calls).toEqual([[acceptedGraph], [latestGraph]]);
    expect(flushGraph.mock.calls[0][0].nodes).toBe(acceptedNodes);
    expect(flushGraph.mock.calls[1][0].nodes).toBe(latestGraph.nodes);
    expect(flushGraph.mock.calls[1][0].edges).toBe(acceptedEdges);
    expect(flushGraph.mock.calls.map(([saved]) => saved.documentKey)).toEqual(['A', 'A']);
  });

  it('keeps a quota retry open after one public image fills capacity and retries only saving the accepted graph', async () => {
    const flushGraph = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const value = mount({ flushGraph });
    value.state.graph = {
      ...value.state.graph,
      models: {
        ...models,
        videoModels: {
          'role-video': {
            ...schema,
            properties: { modeType: { items: { image2video: [1, 1] } } },
          },
        },
      },
    };
    value.refresh();
    expect(value.result.current.context.imageSelectableCount).toBe(1);
    value.open();
    const selection = selected({ images: ['https://media.test/public-one'] });
    let first;
    await act(async () => {
      first = await outcome(value.result.current.confirm(selection));
    });
    expect(first.error?.message).toContain('重试只保存当前画布');
    const acceptedGraph = value.state.graph;
    const createdId = acceptedGraph.edges[0].source;
    value.refresh();
    expect(value.result.current.context.imageSelectableCount).toBe(0);
    expect(value.result.current.availability.visible).toBe(false);
    expect(value.result.current.open).toBe(true);
    expect(await value.confirm(selection)).toBe(true);
    expect(value.state.graph).toBe(acceptedGraph);
    expect(value.state.graph.nodes.find((node) => node.id === createdId).data).toMatchObject({
      action: 'image_resource',
      portraitCompliantExempt: true,
      url: ['https://media.test/public-one'],
    });
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.readImageDimensions).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
    expect(flushGraph.mock.calls).toEqual([[acceptedGraph], [acceptedGraph]]);
  });

  it('rechecks reduced capacity after a pending read and leaves the newly appended input untouched', async () => {
    const read = deferred();
    const value = mount({ readImageDimensions: vi.fn(() => read.promise) });
    value.state.graph = {
      ...value.state.graph,
      models: {
        ...models,
        videoModels: {
          'role-video': {
            ...schema,
            properties: { modeType: { items: { image2video: [1, 2] } } },
          },
        },
      },
    };
    value.refresh();
    value.open();
    let pending;
    act(() => {
      pending = outcome(
        value.result.current.confirm(
          selected({ images: ['https://media.test/one', 'https://media.test/two'] }),
        ),
      );
    });
    const concurrent = resource('new-ordinary-input');
    value.state.graph = {
      ...value.state.graph,
      nodes: [concurrent, ...value.state.graph.nodes],
      edges: [{ id: 'new-input-edge', source: concurrent.id, target: 'video-target' }],
    };
    value.refresh();
    expect(value.result.current.context.imageSelectableCount).toBe(1);
    const currentGraph = value.state.graph;
    let result;
    await act(async () => {
      read.resolve({ width: 1200, height: 800 });
      result = await pending;
    });
    expect(result.error?.message).toContain('参考素材数量已变化');
    expect(value.state.graph).toBe(currentGraph);
    expect(value.state.graph.nodes).toContain(concurrent);
    expect(value.result.current.open).toBe(true);
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.state.history).toEqual([]);
  });

  it('probes only new IMAGE selections, preserving existing asset identity and never probing VIDEO/AUDIO', async () => {
    const value = mount({ asset: (url) => `mapped:${url}` });
    const existing = resource('existing-image', 'image', {
      portraitAssetId: 'existing',
      portraitCertifiedInPlace: true,
    });
    const exempt = resource('existing-exempt', 'image', { portraitCompliantExempt: true });
    const existingEdge = { id: 'existing-edge', source: existing.id, target: 'video-target' };
    const exemptEdge = { id: 'exempt-edge', source: exempt.id, target: 'video-target' };
    value.state.graph = {
      ...value.state.graph,
      nodes: [existing, exempt, ...value.state.graph.nodes],
      edges: [existingEdge, exemptEdge],
    };
    value.refresh();
    value.open();
    const selection = selected({
      images: ['asset://existing', exempt.data.url[0], 'asset://new-image', 'asset://new-image'],
      videos: ['asset://new-video'],
      audios: ['asset://new-audio'],
      assets: [
        {
          assetId: 'new-image',
          assetUrl: 'https://media.test/new-image',
          complianceCheckedAtMs: 101,
          status: 1,
        },
        {
          assetId: 'new-video',
          assetUrl: 'https://media.test/new-video',
          complianceCheckedAtMs: 102,
          status: 1,
        },
        { assetId: 'new-audio', assetUrl: 'https://media.test/new-audio', status: 1 },
      ],
    });
    expect(await value.confirm(selection)).toBe(true);
    expect(value.props.readImageDimensions).toHaveBeenCalledExactlyOnceWith(
      'mapped:https://media.test/new-image',
      { signal: expect.any(AbortSignal) },
    );
    expect(value.state.graph.nodes.find((node) => node.id === existing.id)).toBe(existing);
    expect(value.state.graph.nodes.find((node) => node.id === exempt.id)).toBe(exempt);
    expect(value.state.graph.edges).toContain(existingEdge);
    expect(value.state.graph.edges).toContain(exemptEdge);
    expect(value.state.graph.nodes.filter((node) => node.type === 'image')).toHaveLength(3);
    expect(value.state.graph.nodes.filter((node) => node.type === 'video')).toHaveLength(2);
    expect(value.state.graph.nodes.filter((node) => node.type === 'audio')).toHaveLength(1);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.state.history).toHaveLength(1);
  });

  it('unresolved asset URI leaves raw graph, prompt and picker intact without probes, history or save', async () => {
    const value = mount();
    value.open();
    value.state.prompt = '未提交的最后输入';
    const before = value.state.graph;
    let result;
    await act(async () => {
      result = await outcome(
        value.result.current.confirm(selected({ images: ['asset://unknown'] })),
      );
    });
    expect(result.error?.message).toContain('无法读取');
    expect(value.result.current.open).toBe(true);
    expect(value.state.graph).toBe(before);
    expect(value.state.prompt).toBe('未提交的最后输入');
    expect(value.props.readImageDimensions).not.toHaveBeenCalled();
    expect(value.commitGraph).not.toHaveBeenCalled();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.state.history).toEqual([]);
  });

  it('a raw CAS conflict preserves the competing graph and reports failure without saving or accepting history', async () => {
    const value = mount();
    const rawCAS = value.commitGraph.getMockImplementation();
    const competitor = resource('competing-append', 'text');
    value.commitGraph.mockImplementation((next, options) => {
      value.state.graph = { ...value.state.graph, nodes: [...value.state.graph.nodes, competitor] };
      return rawCAS(next, options);
    });
    value.open();
    const before = value.state.graph;
    let result;
    await act(async () => {
      result = await outcome(
        value.result.current.confirm(selected({ images: ['https://media.test/new'] })),
      );
    });
    expect(result.error?.message).toContain('画布已变化');
    expect(value.state.graph).not.toBe(before);
    expect(value.state.graph.nodes).toEqual([...before.nodes, competitor]);
    expect(value.state.graph.edges).toBe(before.edges);
    expect(value.result.current.open).toBe(true);
    expect(value.commitGraph).toHaveBeenCalledOnce();
    expect(value.props.flushGraph).not.toHaveBeenCalled();
    expect(value.state.history).toEqual([]);
  });

  it.each([undefined, false])(
    'an unacknowledged save (%s) retains accepted graph and retries without rebuilding',
    async (acknowledgement) => {
      const flushGraph = vi.fn(() => acknowledgement);
      const value = mount({ flushGraph });
      value.open();
      const selection = selected({ images: ['https://media.test/new'] });
      let first;
      await act(async () => {
        first = await outcome(value.result.current.confirm(selection));
      });
      expect(first.error?.message).toContain('重试只保存当前画布');
      const acceptedGraph = value.state.graph;
      expect(value.state.history).toHaveLength(1);
      expect(value.commitGraph).toHaveBeenCalledOnce();
      flushGraph.mockReturnValue(true);
      expect(await value.confirm(selection)).toBe(true);
      expect(value.state.graph).toBe(acceptedGraph);
      expect(value.commitGraph).toHaveBeenCalledOnce();
      expect(value.state.history).toHaveLength(1);
      expect(value.props.readImageDimensions).toHaveBeenCalledOnce();
      expect(flushGraph.mock.calls).toEqual([[acceptedGraph], [acceptedGraph]]);
    },
  );
});
