import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { expect, it, vi } from 'vitest';
import { useCanvasSelectionActions } from './useCanvasSelectionActions.js';
import { createSnapshotHistory } from '../../editor/model.js';
import { STORYBOARD_GRID_CREATION_DISABLED_REASON } from '../domain/storyboard-grid-create-model.js';
import { useCanvasDrafts } from '../hooks/useCanvasDrafts.js';
import { useCanvasGraphActions } from '../hooks/useCanvasGraphActions.js';
const nodes = [
  {
    id: 'a',
    type: 'text',
    position: { x: 0, y: 0 },
    data: { type: 'text', name: '台词', content: ['你好'] },
  },
  {
    id: 'b',
    type: 'video',
    position: { x: 400, y: 0 },
    data: { type: 'video', name: '视频', url: ['/video.mp4'] },
  },
];
function props(extra = {}) {
  return {
    documentKey: 'A',
    projectId: 'project',
    nodes,
    edges: [],
    selected: ['a', 'b'],
    ready: true,
    readonly: false,
    change: vi.fn(),
    setSelected: vi.fn(),
    setPanel: vi.fn(),
    setDialog: vi.fn(),
    notify: vi.fn(),
    zoom: 1,
    ...extra,
  };
}
it('keeps Chat node identities and Skill parts while moving writes behind one permission boundary', () => {
  const current = props({ onAddToChat: vi.fn(), onSkillRequest: vi.fn() });
  const hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: current,
  });
  act(() => {
    hook.result.current.toolbarProps.onAddToChat(['a', 'b']);
    hook.result.current.toolbarProps.onCreateSkill(['a', 'b']);
    hook.result.current.group(['a', 'b']);
  });
  expect(current.onAddToChat.mock.calls[0][0].map((part) => [part.type, part.id])).toEqual([
    ['node', 'a'],
    ['node', 'b'],
  ]);
  expect(current.onSkillRequest.mock.calls[0][0].parts[0].text).toBe(
    '{{ node:a }}{{ node:b }}根据这些画布节点总结 Skill',
  );
  expect(current.change).toHaveBeenCalledOnce();
  hook.rerender({ ...current, readonly: true });
  act(() => {
    hook.result.current.remove();
    hook.result.current.toolbarProps.onCreateAsset(['a', 'b']);
  });
  expect(current.change).toHaveBeenCalledOnce();
  expect(current.setDialog).not.toHaveBeenCalled();
});
it('publishes a completed real archive only for the current live document and cancels a late old result', async () => {
  let resolve;
  const createArchive = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
    download = vi.fn();
  const current = props({ createArchive, download });
  const hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: current,
  });
  let job;
  act(() => {
    job = hook.result.current.toolbarProps.onDownloadAll(['a', 'b']);
  });
  expect(hook.result.current.toolbarProps.isDownloading).toBe(true);
  hook.rerender({ ...current, documentKey: 'B' });
  expect(createArchive.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => {
    resolve(new Blob(['late']));
    await job;
  });
  expect(download).not.toHaveBeenCalled();
  act(() => {
    job = hook.result.current.toolbarProps.onDownloadAll(['a', 'b']);
  });
  await act(async () => {
    resolve(new Blob(['zip'], { type: 'application/zip' }));
    await job;
  });
  expect(download).toHaveBeenCalledOnce();
  expect(download.mock.calls[0][0]).toBe('画布素材.zip');
});
it('retains content after download failure and lets the user cancel without publishing', async () => {
  const current = props({
    createArchive: vi.fn(async () => {
      throw new Error('网络失败');
    }),
    download: vi.fn(),
  });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  await act(async () => {
    await hook.result.current.toolbarProps.onDownloadAll(['a', 'b']);
  });
  expect(current.notify).toHaveBeenCalledWith('网络失败');
  expect(current.change).not.toHaveBeenCalled();
  expect(current.download).not.toHaveBeenCalled();
});

const storyboardImages = () => [
  {
    id: 'a',
    type: 'image',
    position: { x: 0, y: 0 },
    width: 350,
    height: 350,
    data: {
      type: 'image',
      name: '画面 A',
      params: { prompt: '保留 A', settings: { ratio: '1:1', seed: 42 } },
      url: ['/a.png'],
    },
  },
  {
    id: 'b',
    type: 'image',
    position: { x: 500, y: 0 },
    width: 350,
    height: 350,
    data: { type: 'image', name: '画面 B', params: { model: 'image-model' }, url: ['/b.png'] },
  },
];

it('creates a complete standalone grid in one history write and publishes its exact node list to fit', () => {
  const initialNodes = storyboardImages();
  const edges = [{ id: 'edge', source: 'a', target: 'b' }];
  const history = createSnapshotHistory();
  let document = { nodes: initialNodes, edges };
  const onStoryboardGroupCreated = vi.fn();
  const current = props({
    nodes: initialNodes,
    edges,
    onStoryboardGroupCreated,
    change: vi.fn((next) => {
      history.record(document);
      document = { nodes: next, edges };
    }),
  });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  expect(hook.result.current.toolbarProps.canStoryboardGroup).toBe(true);
  act(() => hook.result.current.toolbarProps.onGroupStoryboard(['a', 'b']));
  expect(current.change).toHaveBeenCalledOnce();
  expect(current.change.mock.calls[0]).toHaveLength(1);
  expect(history.past).toHaveLength(1);
  const group = document.nodes.find((node) => node.type === 'group');
  expect(group.data).toMatchObject({
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    childNodeIds: ['a', 'b'],
    groupLayoutMode: 'grid',
  });
  expect(document.nodes.find((node) => node.id === 'a').data).toMatchObject({
    contentWidth: 622,
    contentHeight: 350,
    _explicitContentDims: true,
    params: { prompt: '保留 A', settings: { ratio: '16:9', seed: 42 } },
  });
  expect(current.setSelected).toHaveBeenCalledWith([group.id]);
  expect(current.setPanel).toHaveBeenCalledWith(null);
  expect(onStoryboardGroupCreated).toHaveBeenCalledExactlyOnceWith(group.id, document.nodes);
  expect(document.edges).toBe(edges);
  expect(history.undo(document)).toEqual({ nodes: initialNodes, edges });
  expect(history.redo({ nodes: initialNodes, edges })).toEqual(document);
});

it('refreshes storyboard eligibility from current selection and graph instead of a previous toolbar render', () => {
  const current = props({ nodes: storyboardImages() });
  const hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: current,
  });
  const oldClick = hook.result.current.toolbarProps.onGroupStoryboard;
  hook.rerender({ ...current, nodes: [current.nodes[0], { ...current.nodes[1], type: 'video' }] });
  expect(hook.result.current.toolbarProps.canStoryboardGroup).toBe(false);
  expect(hook.result.current.toolbarProps.storyboardGroupDisabledReason).toBe(
    STORYBOARD_GRID_CREATION_DISABLED_REASON,
  );
  act(() => oldClick(['a', 'b']));
  expect(current.change).not.toHaveBeenCalled();
  expect(current.notify).toHaveBeenCalledWith(STORYBOARD_GRID_CREATION_DISABLED_REASON);
  hook.rerender({ ...current, selected: ['a'] });
  expect(hook.result.current.toolbarProps.canStoryboardGroup).toBe(false);
  hook.rerender({ ...current, selected: ['a', 'b'] });
  expect(hook.result.current.toolbarProps.canStoryboardGroup).toBe(true);
});

it.each([{ readonly: true }, { ready: false }])(
  'blocks storyboard creation behind current permission and readiness',
  (guard) => {
    const current = props({ nodes: storyboardImages(), onStoryboardGroupCreated: vi.fn() });
    const hook = renderHook((options) => useCanvasSelectionActions(options), {
      initialProps: current,
    });
    const oldClick = hook.result.current.toolbarProps.onGroupStoryboard;
    hook.rerender({ ...current, ...guard });
    expect(hook.result.current.toolbarProps.canStoryboardGroup).toBe(false);
    act(() => oldClick(['a', 'b']));
    expect(current.change).not.toHaveBeenCalled();
    expect(current.setSelected).not.toHaveBeenCalled();
    expect(current.onStoryboardGroupCreated).not.toHaveBeenCalled();
  },
);

it.each([
  () => false,
  () => {
    throw new Error('配额不足');
  },
])('does not publish selection or fit after a rejected or failed atomic write', (change) => {
  const current = props({
    nodes: storyboardImages(),
    change: vi.fn(change),
    onStoryboardGroupCreated: vi.fn(),
  });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  act(() => hook.result.current.toolbarProps.onGroupStoryboard(['a', 'b']));
  expect(current.change).toHaveBeenCalledOnce();
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.setPanel).not.toHaveBeenCalled();
  expect(current.onStoryboardGroupCreated).not.toHaveBeenCalled();
});

it('does not select or fit a completed old write after the callback switches to another document', () => {
  let hook;
  const current = props({ nodes: storyboardImages(), onStoryboardGroupCreated: vi.fn() });
  current.change = vi.fn(() => flushSync(() => hook.rerender({ ...current, documentKey: 'B' })));
  hook = renderHook((options) => useCanvasSelectionActions(options), { initialProps: current });
  act(() => hook.result.current.toolbarProps.onGroupStoryboard(['a', 'b']));
  expect(current.change).toHaveBeenCalledOnce();
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.onStoryboardGroupCreated).not.toHaveBeenCalled();
});

it('blocks a retained storyboard action after the hook unmounts', () => {
  const current = props({ nodes: storyboardImages(), onStoryboardGroupCreated: vi.fn() });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  const click = hook.result.current.toolbarProps.onGroupStoryboard;
  hook.unmount();
  act(() => click(['a', 'b']));
  expect(current.change).not.toHaveBeenCalled();
  expect(current.onStoryboardGroupCreated).not.toHaveBeenCalled();
});

function graphWriter(current, initialNodes = current.nodes, initialEdges = current.edges) {
  let graph = {
    documentKey: current.documentKey,
    ready: true,
    readonly: false,
    models: {},
    nodes: initialNodes,
    edges: initialEdges,
  };
  const history = createSnapshotHistory();
  const getDocument = vi.fn(() => graph);
  const commitGraph = vi.fn((next, { expectedGraph }) => {
    if (graph !== expectedGraph) return false;
    history.record({ nodes: graph.nodes, edges: graph.edges });
    graph = next;
    return true;
  });
  return {
    getDocument,
    commitGraph,
    history,
    get graph() {
      return graph;
    },
    replace(next) {
      graph = next;
    },
  };
}

const ordinaryGroup = () => ({
  id: 'g',
  type: 'group',
  position: { x: 200, y: 300 },
  data: { childNodeIds: ['a', 'b'] },
});

it('ungroups the newest graph and atomically preserves concurrent edits, source row refs and undo state', () => {
  const group = {
    ...ordinaryGroup(),
    data: { ...ordinaryGroup().data, sourceScriptNodeId: 'script' },
  };
  const script = {
    id: 'script',
    type: 'script',
    position: { x: 0, y: 0 },
    data: { linkedImageGroupId: 'g', linkedVideoGroupId: 'other', rows: [{ hiddenUuid: 'row' }] },
  };
  const initialNodes = [group, script, ...nodes.map((node) => ({ ...node, parentId: 'g' }))];
  const current = props({ nodes: initialNodes });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  const concurrentChild = {
    ...initialNodes[2],
    extent: 'parent',
    data: {
      ...initialNodes[2].data,
      content: ['最新文字'],
      scriptRowHiddenUuid: 'row',
      _explicitContentDims: true,
      contentWidth: 622,
      contentHeight: 350,
      params: { scene: 'group-generate', prompt: '最新草稿', seed: 12 },
    },
  };
  const external = {
    id: 'external',
    type: 'image',
    position: { x: 900, y: 100 },
    data: { url: ['/keep.png'] },
  };
  const latestNodes = [group, script, concurrentChild, initialNodes[3], external];
  const edge = { id: 'keep', source: 'external', target: 'a' };
  const before = {
    ...writer.graph,
    nodes: latestNodes,
    edges: [{ id: 'link', source: 'script', target: 'g' }, edge],
  };
  writer.replace(before);
  act(() => hook.result.current.ungroup('g'));
  expect(current.change).not.toHaveBeenCalled();
  expect(writer.commitGraph).toHaveBeenCalledOnce();
  expect(writer.commitGraph.mock.calls[0][1].expectedGraph).toBe(before);
  const child = writer.graph.nodes.find((node) => node.id === 'a');
  expect(child.position).toEqual({ x: 200, y: 300 });
  expect(child).not.toHaveProperty('parentId');
  expect(child).not.toHaveProperty('extent');
  expect(child.data).toMatchObject({
    content: ['最新文字'],
    scriptRowHiddenUuid: 'row',
    params: { prompt: '最新草稿', seed: 12 },
  });
  expect(child.data).not.toHaveProperty('_explicitContentDims');
  expect(child.data).not.toHaveProperty('contentWidth');
  expect(child.data.params).not.toHaveProperty('scene');
  expect(writer.graph.nodes.find((node) => node.id === 'script').data).toEqual({
    linkedVideoGroupId: 'other',
    rows: script.data.rows,
  });
  expect(writer.graph.nodes.find((node) => node.id === 'external')).toBe(external);
  expect(writer.graph.edges).toEqual([edge]);
  expect(current.setSelected).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
  expect(current.setPanel).toHaveBeenCalledExactlyOnceWith(null);
  expect(writer.history.past).toHaveLength(1);
  expect(writer.history.undo(writer.graph)).toEqual({ nodes: latestNodes, edges: before.edges });
});

it('only clears the matching source link and preserves ordinary content dimensions and non-group scene values', () => {
  const group = { ...ordinaryGroup(), data: { sourceScriptNodeId: 'script' } };
  const script = {
    id: 'script',
    type: 'script',
    data: { linkedImageGroupId: 'new-image', linkedVideoGroupId: 'g' },
  };
  const child = {
    ...nodes[0],
    parentId: 'g',
    data: {
      contentWidth: 99,
      contentHeight: 88,
      params: { scene: 'custom' },
      scriptRowHiddenUuid: 'keep',
    },
  };
  const unrelated = { id: 'other-script', type: 'script', data: { linkedImageGroupId: 'g' } };
  const current = props({ nodes: [group, script, child, unrelated], selected: ['g'] });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.ungroup('g'));
  expect(writer.graph.nodes.find((node) => node.id === 'script').data).toEqual({
    linkedImageGroupId: 'new-image',
  });
  expect(writer.graph.nodes.find((node) => node.id === 'a').data).toBe(child.data);
  expect(writer.graph.nodes.find((node) => node.id === 'other-script')).toBe(unrelated);
});

it.each([false, undefined, 'success'])(
  'publishes no selection or panel changes without a strict successful graph CAS (%s)',
  (result) => {
    const current = props({
      nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
    });
    const writer = graphWriter(current);
    writer.commitGraph.mockImplementation(() => result);
    const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
    act(() => hook.result.current.ungroup('g'));
    expect(writer.commitGraph).toHaveBeenCalledOnce();
    expect(current.change).not.toHaveBeenCalled();
    expect(current.setSelected).not.toHaveBeenCalled();
    expect(current.setPanel).not.toHaveBeenCalled();
    expect(writer.history.past).toHaveLength(0);
  },
);

it('retains selection and graph when a writer throws, and reports its actual failure', () => {
  const current = props({
    nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
  });
  const writer = graphWriter(current);
  writer.commitGraph.mockImplementation(() => {
    throw new Error('提交失败');
  });
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.ungroup('g'));
  expect(current.notify).toHaveBeenCalledWith('提交失败');
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.setPanel).not.toHaveBeenCalled();
  expect(writer.graph.nodes).toBe(current.nodes);
});

it('delegates group layout to the source group controller while virtual selection keeps its own CAS layout', () => {
  const current = props({
    nodes: [ordinaryGroup(), ...nodes],
    onGeneralGroupCommand: vi.fn(() => true),
  });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.layout('vertical', [], 'g'));
  expect(current.onGeneralGroupCommand).toHaveBeenCalledExactlyOnceWith('g', {
    type: 'layout',
    mode: 'vertical',
  });
  expect(writer.commitGraph).not.toHaveBeenCalled();
  expect(current.change).not.toHaveBeenCalled();
  const latest = {
    ...writer.graph,
    nodes: [
      ...writer.graph.nodes,
      {
        id: 'concurrent',
        type: 'text',
        position: { x: 1000, y: 1000 },
        data: { content: ['保留'] },
      },
    ],
  };
  writer.replace(latest);
  act(() => hook.result.current.layout('vertical', ['a', 'b']));
  expect(writer.commitGraph).toHaveBeenCalledOnce();
  expect(writer.commitGraph.mock.calls[0][1].expectedGraph).toBe(latest);
  expect(writer.graph.nodes.find((node) => node.id === 'b').position).toEqual({ x: 0, y: 220 });
  expect(writer.graph.nodes.find((node) => node.id === 'concurrent')).toBe(latest.nodes.at(-1));
  expect(writer.graph.edges).toBe(latest.edges);
  expect(writer.history.past).toHaveLength(1);
});

it.each([{ documentKey: 'B' }, { readonly: true }, { ready: false }])(
  'blocks retained graph writes and group delegation after the owner changes (%j)',
  (next) => {
    const current = props({
      nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
      onGeneralGroupCommand: vi.fn(),
    });
    const writer = graphWriter(current);
    const hook = renderHook((options) => useCanvasSelectionActions(options), {
      initialProps: { ...current, ...writer },
    });
    const old = hook.result.current;
    writer.replace({ ...writer.graph, ...next });
    hook.rerender({ ...current, ...writer, ...next });
    act(() => {
      old.ungroup('g');
      old.layout('grid', [], 'g');
      old.duplicate(['a']);
      old.remove();
      old.group(['a', 'b']);
    });
    expect(writer.commitGraph).not.toHaveBeenCalled();
    expect(current.change).not.toHaveBeenCalled();
    expect(current.onGeneralGroupCommand).not.toHaveBeenCalled();
    expect(current.setSelected).not.toHaveBeenCalled();
    expect(current.setPanel).not.toHaveBeenCalled();
  },
);

it('guards current raw graph readiness even before the corresponding props render, and rejects a missing group', () => {
  const current = props({ nodes: [ordinaryGroup(), ...nodes] });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  writer.replace({ ...writer.graph, readonly: true });
  act(() => hook.result.current.ungroup('g'));
  writer.replace({ ...writer.graph, readonly: false });
  act(() => hook.result.current.ungroup('gone'));
  expect(writer.commitGraph).not.toHaveBeenCalled();
  expect(current.setSelected).not.toHaveBeenCalled();
});

it('does not overwrite a previous synchronous commit when two selection writes occur before a React render', () => {
  const current = props({ selected: ['a'] });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => {
    hook.result.current.duplicate(['a']);
    hook.result.current.remove();
  });
  expect(writer.commitGraph).toHaveBeenCalledTimes(2);
  expect(writer.graph.nodes).toHaveLength(2);
  expect(writer.graph.nodes.some((node) => node.id === 'a')).toBe(false);
  expect(writer.graph.nodes.some((node) => node.data?.content?.[0] === '你好')).toBe(true);
  expect(writer.history.past).toHaveLength(2);
});

it('does not publish an old commit into selection UI after the callback switches documents', () => {
  const current = props({
    nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
  });
  const writer = graphWriter(current);
  let hook;
  writer.commitGraph.mockImplementation(() => {
    writer.replace({ ...writer.graph, documentKey: 'B' });
    flushSync(() => hook.rerender({ ...current, ...writer, documentKey: 'B' }));
    return true;
  });
  hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: { ...current, ...writer },
  });
  act(() => hook.result.current.ungroup('g'));
  expect(writer.commitGraph).toHaveBeenCalledOnce();
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.setPanel).not.toHaveBeenCalled();
});

it('keeps group download progress tied to its launching group when another group becomes selected', async () => {
  let resolve;
  const current = props({
    createArchive: vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    ),
    download: vi.fn(),
  });
  const hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: current,
  });
  let job;
  act(() => {
    job = hook.result.current.toolbarProps.onDownloadAll(['b'], { groupId: 'first' });
  });
  expect(hook.result.current.downloadState).toMatchObject({
    running: true,
    finished: 0,
    total: 1,
    groupId: 'first',
  });
  hook.rerender({ ...current, selected: ['second'] });
  act(() => current.createArchive.mock.calls[0][1].onProgress({ finished: 1, total: 1 }));
  expect(hook.result.current.downloadState).toMatchObject({
    running: true,
    finished: 1,
    groupId: 'first',
  });
  await act(async () => {
    resolve(new Blob(['zip']));
    await job;
  });
  expect(current.download).toHaveBeenCalledOnce();
  expect(hook.result.current.downloadState).toMatchObject({ running: false, groupId: 'first' });
});

it('rejects a graph changed between planning and commit without overwriting new membership or selection', () => {
  const current = props({
    nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
  });
  const writer = graphWriter(current);
  const before = writer.graph;
  const added = {
    id: 'new-child',
    type: 'text',
    parentId: 'g',
    position: { x: 100, y: 100 },
    data: { content: ['并发添加'] },
  };
  const concurrent = { ...before, nodes: [...before.nodes, added] };
  writer.getDocument
    .mockImplementationOnce(() => before)
    .mockImplementation(() => {
      writer.replace(concurrent);
      return concurrent;
    });
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.ungroup('g'));
  expect(writer.commitGraph).toHaveBeenCalledOnce();
  expect(writer.commitGraph.mock.calls[0][1].expectedGraph).toBe(before);
  expect(writer.graph).toBe(concurrent);
  expect(writer.history.past).toHaveLength(0);
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.setPanel).not.toHaveBeenCalled();
});

it.each(['duplicate', 'remove', 'group'])(
  'keeps UI state after the shared %s commit is rejected',
  (action) => {
    const current = props();
    const writer = graphWriter(current);
    writer.commitGraph.mockReturnValue(false);
    const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
    act(() => hook.result.current[action](['a', 'b']));
    expect(writer.commitGraph).toHaveBeenCalledOnce();
    expect(current.change).not.toHaveBeenCalled();
    expect(current.setSelected).not.toHaveBeenCalled();
    expect(current.setPanel).not.toHaveBeenCalled();
  },
);

it('retains the legacy undefined change success contract for ungroup callers without a graph writer', () => {
  const current = props({
    nodes: [ordinaryGroup(), ...nodes.map((node) => ({ ...node, parentId: 'g' }))],
  });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  act(() => hook.result.current.ungroup('g'));
  expect(current.change).toHaveBeenCalledOnce();
  expect(current.setSelected).toHaveBeenCalledExactlyOnceWith(['a', 'b']);
  expect(current.setPanel).toHaveBeenCalledWith(null);
});

it('rejects retained ordinary writes after unmount and does not delegate layout', () => {
  const current = props({ nodes: [ordinaryGroup(), ...nodes], onGeneralGroupCommand: vi.fn() });
  const writer = graphWriter(current);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  const old = hook.result.current;
  hook.unmount();
  act(() => {
    old.ungroup('g');
    old.layout('grid', [], 'g');
    old.duplicate(['a']);
  });
  expect(writer.commitGraph).not.toHaveBeenCalled();
  expect(current.onGeneralGroupCommand).not.toHaveBeenCalled();
});

it('copies the last uncommitted prompt into originals and copies with a real draft projection and one complete undo', () => {
  const source = {
    id: 'a',
    type: 'video',
    position: { x: 0, y: 0 },
    data: { params: { prompt: 'saved', model: 'video-model' } },
  };
  const initialEdges = [{ id: 'self', source: 'a', target: 'a' }];
  const history = createSnapshotHistory();
  const current = props({ nodes: [source], edges: initialEdges, selected: ['a'] });
  const hook = renderHook(() => {
    const [items, setItems] = useState(current.nodes);
    const [edges, setEdges] = useState(current.edges);
    const graph = useRef(null);
    graph.current = {
      documentKey: 'A',
      ready: true,
      readonly: false,
      nodes: items,
      edges,
      models: {},
    };
    const drafts = useCanvasDrafts({ storageKey: 'A', nodes: items, ready: true });
    const projectGraph = (snapshot) => drafts.project({ ...snapshot, storageKey: 'A' });
    const actions = useCanvasGraphActions({
      documentKey: 'A',
      currentDocument: graph,
      setNodes: setItems,
      setEdges,
      recordSnapshot: (snapshot) => history.record(snapshot),
      projectGraph,
    });
    const selection = useCanvasSelectionActions({
      ...current,
      nodes: items,
      edges,
      getDocument: () => graph.current,
      commitGraph: actions.commitGraph,
      projectGraph,
    });
    return { selection, drafts, graph: graph.current };
  });
  let unregister;
  act(() => {
    unregister = hook.result.current.drafts.register('A', 'a', () => ({
      writable: true,
      basePrompt: 'saved',
      value: '最后 150ms 的输入',
    }));
    hook.result.current.selection.duplicate(['a']);
  });
  const committed = hook.result.current.graph;
  expect(committed.nodes).toHaveLength(2);
  expect(committed.nodes.every((node) => node.data.params.prompt === '最后 150ms 的输入')).toBe(
    true,
  );
  expect(committed.nodes.every((node) => node.data.params.model === 'video-model')).toBe(true);
  expect(committed.edges).toHaveLength(2);
  expect(history.past).toHaveLength(1);
  const previous = history.undo({ nodes: committed.nodes, edges: committed.edges });
  expect(previous.nodes).toHaveLength(1);
  expect(previous.nodes[0].data.params.prompt).toBe('最后 150ms 的输入');
  expect(previous.edges).toEqual(initialEdges);
  expect(history.redo(previous)).toEqual(
    JSON.parse(JSON.stringify({ nodes: committed.nodes, edges: committed.edges })),
  );
  act(() => unregister());
});

it.each([
  () => null,
  () => ({ nodes: [], edges: undefined }),
  () => {
    throw new Error('broken projection');
  },
])('does not write or change selection when copy source projection fails', (projectGraph) => {
  const current = props({ projectGraph });
  const writer = graphWriter(current);
  const before = writer.graph;
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.duplicate(['a']));
  expect(writer.graph).toBe(before);
  expect(writer.commitGraph).not.toHaveBeenCalled();
  expect(current.change).not.toHaveBeenCalled();
  expect(current.setSelected).not.toHaveBeenCalled();
  expect(current.notify).toHaveBeenCalledExactlyOnceWith('当前画布草稿无法复制，请重试');
});

it('keeps the raw expected graph when a copy projection returns a different graph object', () => {
  const current = props();
  const writer = graphWriter(current);
  const raw = writer.graph;
  const projected = {
    ...raw,
    nodes: raw.nodes.map((node) => ({ ...node, data: { ...node.data, content: ['projected'] } })),
  };
  current.projectGraph = vi.fn(() => projected);
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.duplicate(['a']));
  expect(current.projectGraph).toHaveBeenCalledExactlyOnceWith(raw);
  expect(writer.commitGraph.mock.calls[0][1].expectedGraph).toBe(raw);
  expect(writer.graph.nodes.every((node) => node.data.content?.[0] === 'projected')).toBe(true);
  expect(writer.history.past).toHaveLength(1);
});

it('rejects copy atomically when another graph replaces the raw source during projection', () => {
  const current = props();
  const writer = graphWriter(current);
  const raw = writer.graph;
  const concurrent = {
    ...raw,
    nodes: [...raw.nodes, { id: 'new', type: 'text', position: { x: 1, y: 1 }, data: {} }],
  };
  current.projectGraph = vi.fn((snapshot) => {
    writer.replace(concurrent);
    return snapshot;
  });
  const hook = renderHook(() => useCanvasSelectionActions({ ...current, ...writer }));
  act(() => hook.result.current.duplicate(['a']));
  expect(writer.commitGraph.mock.calls[0][1].expectedGraph).toBe(raw);
  expect(writer.graph).toBe(concurrent);
  expect(writer.history.past).toHaveLength(0);
  expect(current.setSelected).not.toHaveBeenCalled();
});

it('does not let an old document cancellation abort a new document download', async () => {
  const jobs = [];
  const current = props({
    createArchive: vi.fn(
      (_entries, options) =>
        new Promise((resolve) => {
          jobs.push({ resolve, signal: options.signal });
        }),
    ),
    download: vi.fn(),
  });
  const hook = renderHook((options) => useCanvasSelectionActions(options), {
    initialProps: current,
  });
  const oldCancel = hook.result.current.toolbarProps.onCancelDownload;
  let oldJob, newJob;
  act(() => {
    oldJob = hook.result.current.toolbarProps.onDownloadAll(['b'], { groupId: 'same-id' });
  });
  hook.rerender({ ...current, documentKey: 'B' });
  expect(jobs[0].signal.aborted).toBe(true);
  act(() => {
    newJob = hook.result.current.toolbarProps.onDownloadAll(['b'], { groupId: 'same-id' });
  });
  act(() => oldCancel('same-id'));
  expect(jobs[1].signal.aborted).toBe(false);
  await act(async () => {
    jobs[0].resolve(new Blob(['old']));
    jobs[1].resolve(new Blob(['new']));
    await Promise.all([oldJob, newJob]);
  });
  expect(current.download).toHaveBeenCalledOnce();
});

it('only cancels the requested group owner while preserving the generic virtual selection cancellation', async () => {
  const jobs = [];
  const current = props({
    createArchive: vi.fn(
      (_entries, options) =>
        new Promise((resolve) => {
          jobs.push({ resolve, signal: options.signal });
        }),
    ),
    download: vi.fn(),
  });
  const hook = renderHook(() => useCanvasSelectionActions(current));
  let first, second;
  act(() => {
    first = hook.result.current.toolbarProps.onDownloadAll(['b'], { groupId: 'first' });
  });
  await act(async () => {
    jobs[0].resolve(new Blob(['first']));
    await first;
  });
  act(() => {
    second = hook.result.current.toolbarProps.onDownloadAll(['b'], { groupId: 'second' });
  });
  act(() => hook.result.current.toolbarProps.onCancelDownload('first'));
  expect(jobs[1].signal.aborted).toBe(false);
  act(() => hook.result.current.toolbarProps.onCancelDownload('second'));
  expect(jobs[1].signal.aborted).toBe(true);
  await act(async () => {
    jobs[1].resolve(new Blob(['cancelled']));
    await second;
  });
  let virtual;
  act(() => {
    virtual = hook.result.current.toolbarProps.onDownloadAll(['b']);
  });
  act(() => hook.result.current.toolbarProps.onCancelDownload());
  expect(jobs[2].signal.aborted).toBe(true);
  await act(async () => {
    jobs[2].resolve(new Blob(['cancelled']));
    await virtual;
  });
  expect(current.download).toHaveBeenCalledOnce();
});
