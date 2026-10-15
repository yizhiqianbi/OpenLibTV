import { readFileSync } from 'node:fs';
import { StrictMode, useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasClipComposer } from './useCanvasClipComposer.js';
import { useCanvasGraphActions } from '../hooks/useCanvasGraphActions.js';
import { useCanvasDrafts } from '../hooks/useCanvasDrafts.js';
import { useCanvasAutosave } from '../hooks/useCanvasDocument.js';

const config = JSON.parse(readFileSync('public/data/video-compose-agent-config.json', 'utf8'));
const actor = { uuid: 'local-clip-composer-review' };
const clip = (data = {}) => ({
  id: 'clip',
  type: 'video-clip',
  position: { x: 1000, y: 200 },
  measured: { width: 350, height: 350 },
  data: {
    type: 'video-clip',
    name: '剪辑',
    unknown: { keep: [0, false] },
    params: { model: 'ordinary-generator', volume: 0.7 },
    ...data,
  },
});
const graph = (documentKey = 'compose-A', nodes = [clip()], edges = []) => ({
  documentKey,
  storageKey: documentKey,
  ready: true,
  readonly: false,
  models: [],
  nodes,
  edges,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

// The planner, graph CAS, draft projection and storage are production code.
// Only the asynchronous display-metadata port and unavailable Agent executor
// are injected. No expected graph is computed with a production planner.
function mount(extra = {}) {
  const history = [],
    notify = vi.fn(),
    submitRequest = vi.fn(() => true);
  let serial = 0;
  const initial = extra.initialGraph || graph();
  const initialProps = {
    documentKey: initial.documentKey,
    projectId: 'project-local',
    ready: true,
    readonly: false,
    configContent: { data: config, loading: false, error: null },
    prepareDisplay: vi.fn(async (material) =>
      material.nodeType === 'audio'
        ? { width: 350, height: 148 }
        : material.nodeType === 'image'
          ? { width: 350, height: 350 }
          : { width: 350, height: 623 },
    ),
    ...extra,
  };
  const hook = renderHook(
    (props) => {
      const [document, setDocument] = useState(initial);
      const currentDocument = useRef(document);
      currentDocument.current = document;
      const drafts = useCanvasDrafts({
        storageKey: props.documentKey,
        nodes: document.nodes,
        ready: props.ready,
      });
      const actions = useCanvasGraphActions({
        documentKey: props.documentKey,
        currentDocument,
        setNodes: (nodes) => setDocument((previous) => ({ ...previous, nodes })),
        setEdges: (edges) => setDocument((previous) => ({ ...previous, edges })),
        recordSnapshot: (snapshot) => history.push(structuredClone(snapshot)),
        notify,
        projectGraph: (value, options) =>
          drafts.project({ ...value, storageKey: props.documentKey }, options),
        consumeDrafts: drafts.consume,
      });
      const autosave = useCanvasAutosave(
        {
          ...document,
          storageKey: props.documentKey,
          key: 'compose-test',
          title: '剪辑测试',
          view: { x: 0, y: 0, z: 1 },
        },
        {
          loaded: props.ready,
          readonly: props.readonly,
          user: actor,
          setSaved: () => {},
          notify,
          projectDrafts: drafts.project,
          acknowledgeDrafts: drafts.acknowledge,
        },
      );
      const controller = useCanvasClipComposer({
        ...props,
        getDocument: () => currentDocument.current,
        getNodeIncarnation: actions.getNodeIncarnation,
        projectGraph: (value) => drafts.project({ ...value, storageKey: props.documentKey }),
        commitGraph: actions.commitGraph,
        flushGraph: autosave.flushGraph,
        notify,
        submitRequest,
        makeId: (kind) => `${kind}-${++serial}`,
      });
      return { controller, document, currentDocument, setDocument, actions, autosave, drafts };
    },
    { initialProps, wrapper: StrictMode },
  );
  let props = initialProps;
  const refresh = (patch) => {
    props = { ...props, ...patch };
    hook.rerender(props);
  };
  const switchDocument = (documentKey) => {
    act(() => hook.result.current.setDocument(graph(documentKey)));
    refresh({ documentKey });
  };
  return { ...hook, initialProps, history, notify, submitRequest, refresh, switchDocument };
}
const apply = async (value, modeKey, withPreset = true) => {
  let accepted;
  await act(async () => {
    accepted = await value.result.current.controller.applyMode('clip', modeKey, withPreset);
  });
  return accepted;
};
const savedGraph = (key = 'compose-A') => {
  const saved = JSON.parse(localStorage.getItem(key));
  return { nodes: saved.nodes, edges: saved.edges };
};

beforeEach(() => localStorage.clear());

describe('actual clip composer graph/draft/autosave ownership', () => {
  it('keeps the four-mode fallback usable during operational config loading/error and uses separate compose params', async () => {
    const value = mount({
      configContent: { data: null, loading: true, error: new Error('offline') },
      remoteConfig: { modes: [] },
    });
    expect(value.result.current.controller.config.defaultMode.modeKey).toBe('default');
    expect(value.result.current.controller.config.modes.map((mode) => mode.modeKey)).toEqual([
      'explainerVideo',
      'batchAd',
      'smartMixCut',
    ]);
    expect(await apply(value, 'batchAd', false)).toBe(true);
    expect(value.result.current.document.nodes).toEqual([
      {
        id: 'clip',
        type: 'video-clip',
        position: { x: 1000, y: 200 },
        measured: { width: 350, height: 350 },
        data: {
          type: 'video-clip',
          name: '剪辑',
          unknown: { keep: [0, false] },
          params: { model: 'ordinary-generator', volume: 0.7 },
          agentComposerData: {
            modeKey: 'batchAd',
            prompt: undefined,
            params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
          },
        },
      },
    ]);
    expect(value.result.current.document.edges).toEqual([]);
    expect(value.history).toEqual([]);
    expect(value.initialProps.prepareDisplay).not.toHaveBeenCalled();
  });

  it('preserves nonempty prompt and old params on ordinary mode apply, but resets params on preset apply', async () => {
    const value = mount({
      initialGraph: graph('compose-A', [
        clip({
          agentComposerData: {
            modeKey: 'default',
            prompt: '  自己写的提示词  ',
            params: { aspectRatio: '9:16', duration: 17, resolution: '1080P', unknown: 1 },
          },
        }),
      ]),
    });
    expect(await apply(value, 'explainerVideo', false)).toBe(true);
    expect(value.result.current.document.nodes[0].data.agentComposerData).toEqual({
      modeKey: 'explainerVideo',
      prompt: '  自己写的提示词  ',
      params: { aspectRatio: '9:16', duration: 17, resolution: '1080P', unknown: 1 },
    });
    expect(await apply(value, 'explainerVideo')).toBe(true);
    expect(value.result.current.document.nodes[0].data.agentComposerData).toEqual({
      modeKey: 'explainerVideo',
      prompt: '  自己写的提示词  ',
      params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
    });
    expect(value.history).toHaveLength(1);
    expect(savedGraph().nodes[0].data.agentComposerData).toEqual({
      modeKey: 'explainerVideo',
      prompt: '  自己写的提示词  ',
      params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
    });
  });

  it('adds and persists one exact explainer graph, with one preset history and no synthetic task or metadata', async () => {
    const value = mount();
    expect(await apply(value, 'explainerVideo')).toBe(true);
    const gold = {
      nodes: [
        {
          id: 'clip',
          type: 'video-clip',
          position: { x: 510, y: 76 },
          measured: { width: 350, height: 350 },
          data: {
            type: 'video-clip',
            name: '剪辑',
            unknown: { keep: [0, false] },
            params: { model: 'ordinary-generator', volume: 0.7 },
            agentComposerData: {
              modeKey: 'explainerVideo',
              prompt: '根据我的音色和主题，生成讲解视频。我的主题是‘神经网络发展历史科普’',
              params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
            },
          },
          parentId: 'group-3',
        },
        {
          id: 'audio-1',
          type: 'audio',
          position: { x: 40, y: 76 },
          sourcePosition: 'right',
          targetPosition: 'left',
          measured: { width: 350, height: 148 },
          data: {
            type: 'audio',
            name: '音频',
            label: '音频',
            url: [
              'https://libtv-res.liblib.art/upload-images/5ef327e771bd41dd9256289dd7127f5a/d1ddfc1be40a56892133fb1090683a265c431273.wav',
            ],
            action: 'audio_resource',
            generatorType: 'default',
          },
          parentId: 'group-3',
        },
        {
          id: 'group-3',
          type: 'group',
          position: { x: 490, y: 124 },
          zIndex: -1001,
          style: {
            background: 'var(--canvas-group-bg)',
            border: '1px solid var(--canvas-group-border)',
          },
          data: { type: 'group', name: '预设 - 讲解视频', childNodeIds: ['audio-1', 'clip'] },
          width: 900,
          height: 466,
          measured: { width: 900, height: 466 },
        },
      ],
      edges: [
        {
          id: 'edge-2',
          source: 'audio-1',
          sourceHandle: 'source',
          target: 'clip',
          targetHandle: 'target',
        },
      ],
    };
    expect({
      nodes: value.result.current.document.nodes,
      edges: value.result.current.document.edges,
    }).toEqual(gold);
    expect(savedGraph()).toEqual(gold);
    expect(value.history).toEqual([
      {
        nodes: [
          {
            id: 'clip',
            type: 'video-clip',
            position: { x: 1000, y: 200 },
            measured: { width: 350, height: 350 },
            data: {
              type: 'video-clip',
              name: '剪辑',
              unknown: { keep: [0, false] },
              params: { model: 'ordinary-generator', volume: 0.7 },
              agentComposerData: {
                modeKey: 'explainerVideo',
                prompt: '根据我的音色和主题，生成讲解视频。我的主题是‘神经网络发展历史科普’',
                params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
              },
            },
          },
        ],
        edges: [],
      },
    ]);
    expect(value.submitRequest).not.toHaveBeenCalled();
    expect(value.result.current.controller.pendingIds).toEqual([]);
  });

  it('does not add a preset when a directly connected empty source of the same flow kind already exists', async () => {
    const empty = {
      id: 'empty',
      type: 'audio',
      position: { x: 0, y: 0 },
      data: { type: 'audio', url: [] },
    };
    const value = mount({
      initialGraph: graph(
        'compose-A',
        [clip(), empty],
        [{ id: 'edge-existing', source: 'empty', target: 'clip' }],
      ),
    });
    expect(await apply(value, 'explainerVideo')).toBe(true);
    expect(value.result.current.document.nodes.map((node) => node.id)).toEqual(['clip', 'empty']);
    expect(value.result.current.document.edges).toEqual([
      { id: 'edge-existing', source: 'empty', target: 'clip' },
    ]);
    expect(value.initialProps.prepareDisplay).not.toHaveBeenCalled();
    expect(value.history).toEqual([]);
  });

  it('rechecks incoming sources after a metadata delay and preserves simultaneous unrelated edits', async () => {
    const read = deferred();
    const value = mount({ prepareDisplay: vi.fn(() => read.promise) });
    let pending;
    act(() => {
      pending = value.result.current.controller.applyMode('clip', 'batchAd', true);
    });
    expect(value.result.current.controller.pendingIds).toEqual(['clip']);
    const incoming = {
      id: 'user-video',
      type: 'video',
      position: { x: -3000, y: 2000 },
      data: { type: 'video', url: ['/real.mp4'], name: '实际素材' },
    };
    act(() => {
      const before = value.result.current.currentDocument.current;
      expect(
        value.result.current.actions.commitGraph(
          {
            ...before,
            nodes: [...before.nodes, incoming],
            edges: [...before.edges, { id: 'live-edge', source: 'user-video', target: 'clip' }],
          },
          { expectedGraph: before },
        ),
      ).toBe(true);
    });
    act(() =>
      expect(value.result.current.controller.patch('clip', { prompt: '素材读取期间修改' })).toBe(
        true,
      ),
    );
    let accepted;
    await act(async () => {
      read.resolve({ width: 350, height: 350 });
      accepted = await pending;
    });
    expect(accepted).toBe(true);
    expect(value.result.current.document.nodes.map((node) => node.id)).toEqual([
      'clip',
      'user-video',
      'image-1',
      'group-3',
    ]);
    expect(value.result.current.document.nodes[0].data.agentComposerData.prompt).toBe(
      '素材读取期间修改',
    );
    expect(value.result.current.document.nodes[1]).toEqual(incoming);
    expect(value.result.current.document.edges).toEqual([
      { id: 'live-edge', source: 'user-video', target: 'clip' },
      {
        id: 'edge-2',
        source: 'image-1',
        sourceHandle: 'source',
        target: 'clip',
        targetHandle: 'target',
      },
    ]);
    expect(savedGraph()).toEqual({
      nodes: value.result.current.document.nodes,
      edges: value.result.current.document.edges,
    });
    expect(value.history).toHaveLength(2);
  });

  it.each(['readonly', 'not-ready', 'unmount', 'delete-target'])(
    'cancels a pending preset on %s and rejects late metadata without graph/history changes',
    async (reason) => {
      const read = deferred();
      let signal;
      const value = mount({
        prepareDisplay: vi.fn((_material, _mapUrl, nextSignal) => {
          signal = nextSignal;
          return read.promise;
        }),
      });
      let pending;
      act(() => {
        pending = value.result.current.controller.applyMode('clip', 'explainerVideo', true);
      });
      if (reason === 'readonly') value.refresh({ readonly: true });
      else if (reason === 'not-ready') value.refresh({ ready: false });
      else if (reason === 'unmount') value.unmount();
      else act(() => expect(value.result.current.actions.deleteNodes(['clip'])).toBe(true));
      const before = structuredClone(value.result.current.currentDocument.current);
      const beforeHistory = structuredClone(value.history);
      let accepted;
      await act(async () => {
        read.resolve({ width: 350, height: 148 });
        accepted = await pending;
      });
      expect(accepted).toBe(false);
      expect(value.result.current.currentDocument.current).toEqual(before);
      expect(value.history).toEqual(beforeHistory);
      if (reason !== 'delete-target') expect(signal.aborted).toBe(true);
      expect(value.notify).not.toHaveBeenCalled();
    },
  );

  it('A→B→A aborts the old generation, rejects stale callbacks, and accepts a fresh same-ID preset', async () => {
    const read = deferred();
    let signal;
    const value = mount({
      prepareDisplay: vi.fn((_material, _mapUrl, nextSignal) => {
        signal = nextSignal;
        return read.promise;
      }),
    });
    const oldPatch = value.result.current.controller.patch;
    let pending;
    act(() => {
      pending = value.result.current.controller.applyMode('clip', 'explainerVideo', true);
    });
    value.switchDocument('compose-B');
    value.switchDocument('compose-A');
    const newGraph = structuredClone(value.result.current.document);
    act(() => expect(oldPatch('clip', { prompt: 'stale owner' })).toBe(false));
    let accepted;
    await act(async () => {
      read.resolve({ width: 350, height: 148 });
      accepted = await pending;
    });
    expect(accepted).toBe(false);
    expect(signal.aborted).toBe(true);
    expect(value.result.current.document).toEqual(newGraph);
    expect(value.result.current.controller.pendingIds).toEqual([]);
    value.refresh({ prepareDisplay: vi.fn(async () => ({ width: 350, height: 148 })) });
    expect(await apply(value, 'explainerVideo')).toBe(true);
    expect(value.result.current.document.nodes.map((node) => node.id)).toEqual([
      'clip',
      'audio-1',
      'group-3',
    ]);
  });

  it('retires pending metadata when the target is deleted then restored with the same ID and mode', async () => {
    const read = deferred();
    const value = mount({ prepareDisplay: vi.fn(() => read.promise) });
    let pending;
    act(() => {
      pending = value.result.current.controller.applyMode('clip', 'explainerVideo', true);
    });
    const previousClip = structuredClone(value.result.current.document.nodes[0]);
    act(() => expect(value.result.current.actions.deleteNodes(['clip'])).toBe(true));
    act(() => value.result.current.setDocument(graph('compose-A', [previousClip])));
    const before = structuredClone(value.result.current.document);
    const beforeHistory = structuredClone(value.history);
    let accepted;
    await act(async () => {
      read.resolve({ width: 350, height: 148 });
      accepted = await pending;
    });
    expect(accepted).toBe(false);
    expect(value.result.current.document).toEqual(before);
    expect(value.history).toEqual(beforeHistory);
  });

  it('reports quota failure, retains the accepted graph/history, and permits real autosave retry without duplicate material', async () => {
    const value = mount();
    act(() =>
      expect(
        value.result.current.autosave.flushGraph(value.result.current.currentDocument.current),
      ).toBe(true),
    );
    const previous = localStorage.getItem('compose-A');
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    });
    try {
      expect(await apply(value, 'explainerVideo')).toBe(false);
      expect(value.result.current.document.nodes.map((node) => node.id)).toEqual([
        'clip',
        'audio-1',
        'group-3',
      ]);
      expect(value.result.current.autosave.saveError).toBe('本机保存失败');
      expect(value.history).toHaveLength(1);
      expect(localStorage.getItem('compose-A')).toBe(previous);
      expect(value.notify).toHaveBeenCalledWith('本机存储空间不足，请导出画布文件');
    } finally {
      write.mockRestore();
    }
    act(() => expect(value.result.current.autosave.retrySave()).toBe(true));
    expect(value.result.current.autosave.saveError).toBe('');
    expect(savedGraph()).toEqual({
      nodes: value.result.current.document.nodes,
      edges: value.result.current.document.edges,
    });
    expect(await apply(value, 'explainerVideo')).toBe(true);
    expect(value.result.current.document.nodes.map((node) => node.id)).toEqual([
      'clip',
      'audio-1',
      'group-3',
    ]);
    expect(value.history).toHaveLength(1);
  });

  it('keeps volume independently writable while Agent editing and config is unavailable, without touching ordinary params/timeline', () => {
    const value = mount({
      configContent: { data: null, loading: true, error: null },
      initialGraph: graph('compose-A', [
        clip({
          agentEditing: { state: 'running' },
          clipTimelineData: { clips: [], unknown: 42 },
          playbackVolume: 0.3,
        }),
      ]),
    });
    act(() =>
      expect(value.result.current.controller.patch('clip', { prompt: 'blocked' })).toBe(false),
    );
    act(() => expect(value.result.current.controller.changeVolume('clip', 2)).toBe(true));
    expect(value.result.current.document.nodes[0].data).toEqual({
      type: 'video-clip',
      name: '剪辑',
      unknown: { keep: [0, false] },
      params: { model: 'ordinary-generator', volume: 0.7 },
      agentEditing: { state: 'running' },
      clipTimelineData: { clips: [], unknown: 42 },
      playbackVolume: 1,
    });
    act(() => expect(value.result.current.controller.changeVolume('clip', -1)).toBe(true));
    expect(value.result.current.document.nodes[0].data.playbackVolume).toBe(0);
    const before = value.result.current.document;
    act(() => expect(value.result.current.controller.changeVolume('clip', NaN)).toBe(false));
    expect(value.result.current.document).toBe(before);
    expect(value.history).toEqual([]);
  });

  it('flushes exact submit parts before handing off to the local Agent and never invents pending/editing/task state', () => {
    const video = {
      id: 'actual-video',
      type: 'video',
      position: { x: 0, y: 0 },
      data: { type: 'video', name: '真实视频', url: ['/actual.mp4'] },
    };
    const value = mount({
      initialGraph: graph(
        'compose-A',
        [clip(), video],
        [{ id: 'in', source: 'actual-video', target: 'clip' }],
      ),
    });
    act(() =>
      expect(value.result.current.controller.submit('clip', '剪辑 {{Video 1}}')).toBe(true),
    );
    expect(value.submitRequest).toHaveBeenCalledWith(
      {
        type: 'agent-prompt',
        parts: [
          { type: 'text', text: '剪辑 {{ node:actual-video }}，参数是 16:9 · 30s · 720P' },
          {
            type: 'node',
            id: 'actual-video',
            nodeKey: 'actual-video',
            projectId: 'project-local',
            name: '真实视频',
            nodeType: 'video',
            url: '/actual.mp4',
            mediaType: 'video',
          },
        ],
        extra: {
          currentNodeKey: 'clip',
          entryItemKey: 'video_compose',
          videoComposeSubmitTracking: {
            nodeUuid: 'clip',
            projectUuid: 'project-local',
            functionKey: 'default',
            useAt: true,
            nodeReferenceList: [{ node_uuid: 'actual-video', node_type: 'video' }],
          },
        },
      },
      [],
    );
    expect(savedGraph().nodes[0].data).toEqual({
      type: 'video-clip',
      name: '剪辑',
      unknown: { keep: [0, false] },
      params: { model: 'ordinary-generator', volume: 0.7 },
      agentComposerData: {
        modeKey: 'default',
        prompt: '剪辑 {{Video 1}}',
        params: { aspectRatio: '16:9', duration: 30, resolution: '720P' },
      },
    });
    expect(value.result.current.controller.pendingIds).toEqual([]);
  });

  it('does not hand off on real storage quota failure and keeps the submitted prompt until retry', () => {
    const video = {
      id: 'video',
      type: 'video',
      position: { x: 0, y: 0 },
      data: { type: 'video', url: ['/video.mp4'] },
    };
    const value = mount({
      initialGraph: graph('compose-A', [clip(), video], [{ source: 'video', target: 'clip' }]),
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota full', 'QuotaExceededError');
    });
    try {
      act(() => expect(value.result.current.controller.submit('clip', '保留这句')).toBe(false));
      expect(value.submitRequest).not.toHaveBeenCalled();
      expect(value.result.current.document.nodes[0].data.agentComposerData.prompt).toBe('保留这句');
    } finally {
      write.mockRestore();
    }
    act(() => expect(value.result.current.controller.submit('clip', '保留这句')).toBe(true));
    expect(savedGraph().nodes[0].data.agentComposerData.prompt).toBe('保留这句');
  });

  it('preserves pending compose and ordinary drafts through an actual preset transaction and immediate save', async () => {
    const value = mount();
    act(() =>
      value.result.current.drafts.register(
        'compose-A',
        'clip',
        () => ({
          kind: 'clip-composer',
          writable: true,
          basePrompt: '',
          value: '还没 debounce 的提示词',
        }),
        'clip-composer',
      ),
    );
    expect(await apply(value, 'explainerVideo')).toBe(true);
    expect(savedGraph().nodes[0].data.agentComposerData.prompt).toBe('还没 debounce 的提示词');
    expect(value.result.current.document.nodes[0].data.params).toEqual({
      model: 'ordinary-generator',
      volume: 0.7,
    });
  });
});
