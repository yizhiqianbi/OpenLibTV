import { StrictMode, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import { useCanvasDeletionHistory } from './useCanvasDeletionHistory.js';
import { useCanvasClipDisconnectPort } from './useCanvasClipDisconnectPort.js';
import { useCanvasClipDisconnect } from '../clip-disconnect/useCanvasClipDisconnect.js';
import { createCanvasClipDisconnectController } from '../clip-disconnect/clip-disconnect-controller.js';

const oldPrompt = 'old {{Video 1}} {{Video 2}} {{Audio 1}} {{magic:stale:0}}';
const latestPrompt = 'last typed {{Video 1}} then {{Video 2}} {{Audio 1}} {{magic:stale:0}}';
const cleanedPrompt = 'last typed then {{Video 1}} {{Audio 1}} {{magic:stale:0}}';

function originalGraph() {
  return {
    documentKey: 'A',
    ready: true,
    readonly: false,
    models,
    view: { x: 70, y: 80, z: 0.7 },
    messages: [{ id: 'message', text: 'keep' }],
    nodes: [
      {
        id: 'removed',
        type: 'video',
        position: { x: 0, y: 0 },
        data: {
          type: 'video',
          name: 'removed source',
          url: ['/removed.mp4'],
          characterAsset: true,
          characterReferences: { cut: { reference: 'preserve iu field' }, other: { keep: true } },
        },
      },
      {
        id: 'keep',
        type: 'video',
        data: { type: 'video', name: 'keep source', url: ['/keep.mp4'] },
      },
      {
        id: 'audio',
        type: 'audio',
        data: { type: 'audio', name: 'audio source', url: ['/audio.mp3'] },
      },
      {
        id: 'clip',
        type: 'video-clip',
        position: { x: 1000, y: 300 },
        data: {
          type: 'video-clip',
          name: 'clip target',
          groupRefExcludedNodeIds: ['keep-exclusion'],
          rows: [{ id: 'clip-row', plotDescription: 'raw clip row', unknown: { keep: 1 } }],
          params: {
            prompt: oldPrompt,
            modeType: 'video2video',
            model: 'clip-model',
            settings: { untouched: true },
            advancedSettings: { precision: 2.5 },
            imageList: [],
            videoList: [
              { nodeId: 'removed', url: '/removed.mp4' },
              { nodeId: 'keep', url: '/keep.mp4' },
            ],
            audioList: [{ nodeId: 'audio', url: '/audio.mp3' }],
            videoListOrder: ['keep', 'removed'],
            mixedListOrder: ['removed', 'keep', 'audio'],
            magicList: { stale: { suggestions: ['preserve ordinary ig field'] } },
          },
          clipTimelineData: {
            videoSourceNodeIds: ['removed', 'keep'],
            audioSourceNodeIds: ['audio'],
            videoTrackCount: 1,
            totalDuration: 19,
            currentTime: 13,
            muteIds: ['removed-clip'],
            clips: [
              {
                id: 'removed-clip',
                type: 'video',
                sourceNodeId: 'removed',
                startTime: 0,
                duration: 4,
                zIndex: 0,
              },
              {
                id: 'keep-clip',
                type: 'video',
                sourceNodeId: 'keep',
                startTime: 14,
                duration: 5,
                zIndex: 0,
                transitionIn: 'remove-first',
              },
              {
                id: 'sound-clip',
                type: 'audio',
                sourceNodeId: 'audio',
                startTime: 12,
                duration: 2,
                zIndex: 1,
                linkedVideoClipId: 'keep-clip',
              },
            ],
          },
        },
      },
      {
        id: 'script',
        type: 'script-v2',
        data: {
          type: 'script-v2',
          name: 'unrelated script',
          params: { prompt: 'old script input', settings: { keep: 1 } },
          assets: { characters: [], scenes: [], props: [] },
          rows: [
            {
              id: 'script-row',
              hiddenUuid: 'hidden',
              shotNumber: 30,
              plotDescription: 'raw script row',
              videoMotionPrompt: 'old motion',
            },
          ],
        },
      },
    ],
    edges: [
      { id: 'cut', source: 'removed', target: 'clip' },
      { id: 'keep-edge', source: 'keep', target: 'clip' },
      { id: 'sound-edge', source: 'audio', target: 'clip' },
    ],
  };
}

function nextTimeline() {
  return {
    videoSourceNodeIds: ['keep'],
    audioSourceNodeIds: ['audio'],
    videoTrackCount: 1,
    totalDuration: 5,
    currentTime: 5,
    muteIds: ['removed-clip'],
    clips: [
      {
        id: 'keep-clip',
        type: 'video',
        sourceNodeId: 'keep',
        startTime: 0,
        duration: 5,
        zIndex: 0,
      },
      {
        id: 'sound-clip',
        type: 'audio',
        sourceNodeId: 'audio',
        startTime: 0,
        duration: 2,
        zIndex: 1,
        linkedVideoClipId: 'keep-clip',
      },
    ],
  };
}

function fixture({ strict = false } = {}) {
  const original = originalGraph(),
    currentDocument = { current: original };
  const controls = { project: null, failRead: false };
  const notify = vi.fn(),
    consumed = vi.fn(),
    projected = vi.fn(),
    accepts = vi.fn();
  let historyApi;
  const defaultRecord = vi.fn((value) => historyApi.recordSnapshot(value));
  const acceptedRecord = vi.fn((value) => historyApi.recordSnapshot(value));
  const clipPending = { writable: true, basePrompt: oldPrompt, value: latestPrompt };
  const scriptPending = {
    writable: true,
    basePrompt: 'old script input',
    value: 'last script input',
  };
  const rowPending = {
    writable: true,
    scriptPrompts: [
      {
        rowId: 'script-row',
        track: 'video',
        value: 'last raw motion',
        baseFingerprint: fingerprintScriptPromptBundle(
          getScriptPromptBundle(original.nodes[4].data.rows[0], 'video'),
        ),
      },
    ],
  };
  let props = { documentKey: 'A', ready: true, readonly: false, tick: 0 };
  const hook = renderHook(
    (value) => {
      const [nodes, setNodes] = useState(original.nodes);
      const [edges, setEdges] = useState(original.edges);
      const history = useSnapshotHistory(
        { nodes, edges },
        {
          restore(snapshot) {
            currentDocument.current = {
              ...currentDocument.current,
              nodes: snapshot.nodes,
              edges: snapshot.edges,
            };
            setNodes(snapshot.nodes);
            setEdges(snapshot.edges);
          },
        },
      );
      historyApi = history;
      const drafts = useCanvasDrafts({ storageKey: value.documentKey, nodes, ready: value.ready });
      const actions = useCanvasGraphActions({
        documentKey: value.documentKey,
        currentDocument,
        setNodes,
        setEdges,
        recordSnapshot: defaultRecord,
        notify,
        projectGraph(snapshot, options) {
          projected(snapshot, options);
          const next = drafts.project({ ...snapshot, storageKey: value.documentKey }, options);
          return controls.project ? controls.project(next, options, currentDocument) : next;
        },
        consumeDrafts(snapshot, options) {
          consumed(snapshot, options);
          drafts.consume({ ...snapshot, storageKey: value.documentKey }, options);
        },
      });
      const deletion = useCanvasDeletionHistory({
        documentKey: value.documentKey,
        ready: value.ready,
        readonly: value.readonly,
        recordSnapshot: acceptedRecord,
        captureSnapshot: actions.captureDeletionSnapshot,
        notify,
      });
      const port = useCanvasClipDisconnectPort({
        ...value,
        getDocument() {
          if (controls.failRead) throw new Error('read failed');
          return currentDocument.current;
        },
        graphActions: actions,
        history: deletion,
        notify,
      });
      const clip = useCanvasClipDisconnect({
        documentKey: value.documentKey,
        ready: value.ready,
        readonly: value.readonly,
        port,
        notify,
        now: () => 500,
        beforeApply: (before) => deletion.capture(before),
      });
      return { port, actions, drafts, history, deletion, clip };
    },
    { initialProps: props, ...(strict ? { wrapper: StrictMode } : {}) },
  );
  hook.result.current.drafts.register(
    'A',
    'clip',
    () => clipPending,
    'default',
    (value) => {
      accepts(value);
      clipPending.basePrompt = value;
      clipPending.value = value;
      return true;
    },
  );
  hook.result.current.drafts.register('A', 'script', () => scriptPending, 'script-generator');
  hook.result.current.drafts.register('A', 'script', () => rowPending, 'default');
  const beforeApply = vi.fn((before) => hook.result.current.deletion.capture(before));
  const baseline = {
    nodes: original.nodes.map((node) =>
      node.id === 'clip'
        ? { ...node, data: { ...node.data, params: { ...node.data.params, prompt: latestPrompt } } }
        : node.id === 'script'
          ? {
              ...node,
              data: {
                ...node.data,
                params: { ...node.data.params, prompt: 'last script input' },
                rows: [
                  {
                    ...node.data.rows[0],
                    videoMotionPrompt: 'last raw motion',
                    finalVideoPromptEntityRefs: undefined,
                  },
                ],
              },
            }
          : node,
    ),
    edges: original.edges,
  };
  return {
    ...hook,
    original,
    currentDocument,
    controls,
    notify,
    consumed,
    projected,
    accepts,
    defaultRecord,
    acceptedRecord,
    clipPending,
    scriptPending,
    rowPending,
    baseline,
    beforeApply,
    change(patch, updateRaw = true) {
      props = { ...props, ...patch };
      if (updateRaw)
        currentDocument.current = {
          ...currentDocument.current,
          documentKey: props.documentKey,
          ready: props.ready,
          readonly: props.readonly,
        };
      hook.rerender(props);
    },
  };
}

function owner(document) {
  return {
    storeInstanceId: document.storeInstanceId,
    projectId: document.projectId,
    projectGeneration: document.projectGeneration,
  };
}
async function lock(f, ids = ['removed', 'clip'], signal) {
  const port = f.result.current.port,
    document = port.getDocument(),
    identity = owner(document);
  const results = await Promise.all(
    ids.map((id) => port.requestLocks(id, { owner: identity, timeoutMs: 3000, signal })),
  );
  expect(results).toEqual(ids.map((nodeId) => ({ ok: true, nodeId })));
  return { port, owner: identity, signal, expectedDocument: port.getDocument() };
}
function patch(f, authorization, extra = {}) {
  return {
    ...authorization,
    transactions: [{ targetNodeId: 'clip', edgeIds: ['cut'], timelineDataPatch: nextTimeline() }],
    nodeDataPatches: [{ nodeId: 'clip', data: { clipTimelineData: nextTimeline() } }],
    deleteEdgeIds: ['cut'],
    beforeApply: f.beforeApply,
    ...extra,
  };
}
function expectedAfter(f) {
  return {
    nodes: f.baseline.nodes.map((node) =>
      node.id !== 'clip'
        ? node
        : {
            ...node,
            data: {
              ...node.data,
              clipTimelineData: nextTimeline(),
              params: {
                ...node.data.params,
                prompt: cleanedPrompt,
                textList: [],
                videoList: [{ nodeId: 'keep', url: '/keep.mp4', label: 'keep source' }],
                audioList: [{ nodeId: 'audio', url: '/audio.mp3', label: 'audio source' }],
              },
            },
          },
    ),
    edges: f.original.edges.slice(1),
  };
}
function graph(f) {
  return { nodes: f.currentDocument.current.nodes, edges: f.currentDocument.current.edges };
}
function zeroAccepted(f) {
  expect(f.beforeApply).not.toHaveBeenCalled();
  expect(f.defaultRecord).not.toHaveBeenCalled();
  expect(f.acceptedRecord).not.toHaveBeenCalled();
  expect(f.consumed).not.toHaveBeenCalled();
  expect(f.result.current.history.history.current).toEqual([]);
}
afterEach(() => vi.useRealTimers());

describe('real local clip port with actual GraphActions, drafts and history', () => {
  it('a cancelled overlapping controller cannot release the live operation grants it never acquired', async () => {
    const f = fixture(),
      actualPort = f.result.current.port;
    let releaseFirst, acquiredFirst, firstSignal;
    const held = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    const acquired = new Promise((resolve) => {
      acquiredFirst = resolve;
    });
    const port = {
      ...actualPort,
      requestLocks(nodeId, options) {
        firstSignal ??= options.signal;
        const result = actualPort.requestLocks(nodeId, options);
        return options.signal === firstSignal && nodeId === 'clip'
          ? result.then(async (value) => {
              acquiredFirst();
              await held;
              return value;
            })
          : result;
      },
    };
    const controller = createCanvasClipDisconnectController({
      getOptions: () => ({
        documentKey: 'A',
        ready: true,
        readonly: false,
        port,
        notify: f.notify,
        beforeApply: f.beforeApply,
        now: () => 500,
      }),
    });
    const first = controller.disconnect(['cut']);
    await acquired;
    const second = controller.disconnect(['cut']);
    const secondId = controller.getState().operations[1];
    expect(controller.cancel(secondId)).toBe(true);
    expect(await second).toMatchObject({ status: 'cancelled', deletedEdgeIds: [] });
    expect(graph(f)).toEqual({ nodes: f.original.nodes, edges: f.original.edges });
    zeroAccepted(f);
    let result;
    await act(async () => {
      releaseFirst();
      result = await first;
    });
    expect(result).toMatchObject({
      status: 'applied',
      deletedEdgeIds: ['cut'],
      acceptedTargetIds: ['clip'],
      failures: [],
    });
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.currentDocument.current).toEqual({ ...f.original, ...expectedAfter(f) });
    for (const key of ['signal', 'owner', 'storeInstanceId', 'projectId', 'projectGeneration'])
      expect(Object.hasOwn(f.currentDocument.current, key)).toBe(false);
    expect(f.beforeApply).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.consumed).toHaveBeenCalledOnce();
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    act(() => f.result.current.history.redo());
    expect(graph(f)).toEqual(expectedAfter(f));
    const identity = owner(actualPort.getDocument());
    expect(actualPort.releaseLocks('removed', { owner: identity, signal: firstSignal })).toBe(
      false,
    );
    expect(actualPort.releaseLocks('clip', { owner: identity, signal: firstSignal })).toBe(false);
    controller.retire();
    f.unmount();
  });

  it('composes the actual clip hook and local port: source timeline plan, latest inputs and real once undo/redo share one accepted phase', async () => {
    const f = fixture();
    let result;
    await act(async () => {
      result = await f.result.current.clip.disconnect(['cut']);
    });
    expect(result).toMatchObject({
      status: 'applied',
      deletedEdgeIds: ['cut'],
      acceptedTargetIds: ['clip'],
      blockedEdgeIds: [],
      failures: [],
    });
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.clipPending.value).toBe(cleanedPrompt);
    const document = f.result.current.port.getDocument();
    expect(f.result.current.port.releaseLocks('removed', { owner: owner(document) })).toBe(false);
    expect(f.result.current.port.releaseLocks('clip', { owner: owner(document) })).toBe(false);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    act(() => f.result.current.history.redo());
    expect(graph(f)).toEqual(expectedAfter(f));
    f.unmount();
  });

  it('the actual clip controller keeps a busy timeline edge and pending input without any local port/history write', async () => {
    const f = fixture();
    f.currentDocument.current = {
      ...f.original,
      nodes: f.original.nodes.map((node) =>
        node.id === 'clip'
          ? { ...node, data: { ...node.data, agentEditing: { state: 'running', startedAtMs: 0 } } }
          : node,
      ),
    };
    const busy = f.currentDocument.current;
    let result;
    await act(async () => {
      result = await f.result.current.clip.disconnect(['cut']);
    });
    expect(result).toMatchObject({
      status: 'blocked',
      deletedEdgeIds: [],
      blockedEdgeIds: ['cut'],
    });
    expect(f.currentDocument.current).toBe(busy);
    expect(f.clipPending.value).toBe(latestPrompt);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('智能剪辑进行中，暂时无法断开素材连线');
    zeroAccepted(f);
    const document = f.result.current.port.getDocument();
    expect(f.result.current.port.releaseLocks('clip', { owner: owner(document) })).toBe(false);
    f.unmount();
  });

  it('keeps immutable port identity across ordinary rerenders while reading latest graph, callbacks and draft values', async () => {
    const f = fixture(),
      first = f.result.current.port,
      actions = f.result.current.actions;
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.mode).toBe('local-workspace');
    const initialOwner = owner(first.getDocument());
    f.change({ tick: 1 });
    expect(f.result.current.port).toBe(first);
    expect(f.result.current.actions).not.toBe(actions);
    expect(owner(first.getDocument())).toEqual(initialOwner);
    f.currentDocument.current = { ...f.currentDocument.current, view: { x: 100, y: 200, z: 0.9 } };
    const granted = await lock(f);
    act(() => expect(first.commitTransaction(patch(f, granted))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.currentDocument.current.view).toEqual({ x: 100, y: 200, z: 0.9 });
    expect(f.beforeApply).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.defaultRecord).not.toHaveBeenCalled();
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.consumed.mock.calls[0][1]).toMatchObject({
      explicitPromptNodeIds: ['clip'],
      removedNodeIds: [],
    });
    expect(f.accepts).toHaveBeenCalledExactlyOnceWith(cleanedPrompt);
    expect(f.clipPending.value).toBe(cleanedPrompt);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    expect(f.result.current.history.history.current).toEqual([]);
    act(() => f.result.current.history.redo());
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.result.current.history.future.current).toEqual([]);
    f.unmount();
  });

  it('captures true projected before only after CAS and preserves iu character records, exclusions, raw rows and other all fields', async () => {
    const f = fixture(),
      granted = await lock(f);
    const callback = vi.fn((before) => {
      expect(f.currentDocument.current.edges.map((edge) => edge.id)).toEqual([
        'keep-edge',
        'sound-edge',
      ]);
      expect(before).toEqual(f.baseline);
      return f.result.current.deletion.capture(before);
    });
    act(() =>
      expect(granted.port.commitTransaction(patch(f, granted, { beforeApply: callback }))).toBe(
        true,
      ),
    );
    expect(callback).toHaveBeenCalledOnce();
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.currentDocument.current.nodes[0]).toEqual(f.original.nodes[0]);
    expect(f.currentDocument.current.nodes[0].data.characterReferences).toEqual({
      cut: { reference: 'preserve iu field' },
      other: { keep: true },
    });
    expect(f.currentDocument.current.nodes[3].data.groupRefExcludedNodeIds).toEqual([
      'keep-exclusion',
    ]);
    expect(f.currentDocument.current.nodes[3].data.params.magicList).toEqual({
      stale: { suggestions: ['preserve ordinary ig field'] },
    });
    expect(f.currentDocument.current.messages).toEqual(f.original.messages);
    f.unmount();
  });

  it('requests real reference-counted leases: one release keeps the second request valid, final release prevents a new write', async () => {
    const f = fixture(),
      first = await lock(f),
      second = await lock(f);
    expect(first.owner).toEqual(second.owner);
    expect(first.port.releaseLocks('removed', { owner: first.owner })).toBe(true);
    expect(first.port.releaseLocks('clip', { owner: first.owner })).toBe(true);
    act(() =>
      expect(
        first.port.commitTransaction(
          patch(f, { ...first, expectedDocument: first.port.getDocument() }),
        ),
      ).toBe(true),
    );
    act(() => f.result.current.history.undo());
    expect(first.port.releaseLocks('removed', { owner: first.owner })).toBe(true);
    expect(first.port.releaseLocks('clip', { owner: first.owner })).toBe(true);
    expect(first.port.releaseLocks('clip', { owner: first.owner })).toBe(false);
    act(() =>
      expect(
        first.port.commitTransaction(
          patch(f, { ...first, expectedDocument: first.port.getDocument() }),
        ),
      ).toBe(false),
    );
    expect(graph(f)).toEqual(f.baseline);
    expect(f.beforeApply).toHaveBeenCalledOnce();
    expect(f.result.current.history.history.current).toEqual([]);
    f.unmount();
  });

  it('rejects an unleased endpoint or mismatched transaction shape with zero draft/history work', async () => {
    const f = fixture();
    const initial = f.result.current.port.getDocument(),
      identity = owner(initial);
    expect(await f.result.current.port.requestLocks('clip', { owner: identity })).toEqual({
      ok: true,
      nodeId: 'clip',
    });
    const auth = { port: f.result.current.port, owner: identity, expectedDocument: initial };
    act(() => expect(auth.port.commitTransaction(patch(f, auth))).toBe(false));
    const granted = await lock(f);
    act(() =>
      expect(
        granted.port.commitTransaction(
          patch(f, granted, { transactions: [{ targetNodeId: 'clip', edgeIds: ['keep-edge'] }] }),
        ),
      ).toBe(false),
    );
    act(() =>
      expect(
        granted.port.commitTransaction(
          patch(f, granted, {
            nodeDataPatches: [{ nodeId: 'removed', data: { clipTimelineData: {} } }],
          }),
        ),
      ).toBe(false),
    );
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.projected).not.toHaveBeenCalled();
    zeroAccepted(f);
    f.unmount();
  });

  it.each(['storeInstanceId', 'projectId', 'projectGeneration'])(
    'strictly rejects altered %s in the transaction owner',
    async (field) => {
      const f = fixture(),
        granted = await lock(f);
      act(() =>
        expect(
          granted.port.commitTransaction(
            patch(f, granted, { owner: { ...granted.owner, [field]: 'different' } }),
          ),
        ).toBe(false),
      );
      expect(f.currentDocument.current).toBe(f.original);
      zeroAccepted(f);
      f.unmount();
    },
  );

  it.each(['nodes', 'edges', 'models'])(
    'rejects stale expected %s references before projection or history',
    async (field) => {
      const f = fixture(),
        granted = await lock(f);
      f.currentDocument.current = {
        ...f.currentDocument.current,
        [field]:
          field === 'models'
            ? { ...f.currentDocument.current.models }
            : [...f.currentDocument.current[field]],
      };
      const winning = f.currentDocument.current;
      act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(false));
      expect(f.currentDocument.current).toBe(winning);
      expect(f.projected).not.toHaveBeenCalled();
      zeroAccepted(f);
      f.unmount();
    },
  );

  it('projection failure preserves every pending input, then a fresh authorized retry commits with once undo', async () => {
    const f = fixture(),
      granted = await lock(f);
    f.controls.project = () => {
      throw new Error('draft read failed');
    };
    act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.clipPending.value).toBe(latestPrompt);
    expect(f.scriptPending.value).toBe('last script input');
    expect(f.rowPending.scriptPrompts[0].value).toBe('last raw motion');
    zeroAccepted(f);
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法删除，请重试');
    for (const id of ['removed', 'clip']) granted.port.releaseLocks(id, { owner: granted.owner });
    f.controls.project = null;
    const retry = await lock(f);
    act(() => expect(retry.port.commitTransaction(patch(f, retry))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.result.current.history.history.current).toHaveLength(1);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    f.unmount();
  });

  it('commit projection failure cannot capture pending history, publish a partial timeline or consume remapped prompt', async () => {
    const f = fixture(),
      granted = await lock(f);
    f.controls.project = (next, options) => {
      if (Array.isArray(options?.explicitPromptNodeIds)) throw new Error('commit projection');
      return next;
    };
    act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.clipPending.value).toBe(latestPrompt);
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法保存，请重试');
    zeroAccepted(f);
    f.unmount();
  });

  it.each(['preflight', 'commit'])(
    'CAS collision during %s projection retains the winning graph with zero history or consumption',
    async (phase) => {
      const f = fixture(),
        granted = await lock(f);
      let winner,
        changed = false;
      f.controls.project = (next, options, reference) => {
        if (
          !changed &&
          (phase === 'preflight' ? !options : Array.isArray(options?.explicitPromptNodeIds))
        ) {
          changed = true;
          winner = reference.current = {
            ...reference.current,
            nodes: [
              ...reference.current.nodes,
              { id: 'competing', type: 'text', data: { content: ['winner'] } },
            ],
          };
        }
        return next;
      };
      act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(false));
      expect(f.currentDocument.current).toBe(winner);
      expect(winner.edges).toBe(f.original.edges);
      expect(winner.nodes[3].data.clipTimelineData).toEqual(
        f.original.nodes[3].data.clipTimelineData,
      );
      expect(f.clipPending.value).toBe(latestPrompt);
      zeroAccepted(f);
      f.unmount();
    },
  );

  it('an unchanged plain prompt gets no explicit override while latest drafts still commit and once undo restores them', async () => {
    const f = fixture();
    f.clipPending.value = 'plain latest draft';
    const granted = await lock(f);
    act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(true));
    expect(f.currentDocument.current.nodes[3].data.params.prompt).toBe('plain latest draft');
    expect(f.consumed.mock.calls[0][1].explicitPromptNodeIds).toEqual([]);
    expect(f.accepts).not.toHaveBeenCalled();
    expect(f.currentDocument.current.nodes[3].data.clipTimelineData).toEqual(nextTimeline());
    expect(f.beforeApply.mock.calls[0][0].nodes[3].data.params.prompt).toBe('plain latest draft');
    expect(f.currentDocument.current.nodes[4].data.params.prompt).toBe('last script input');
    act(() => f.result.current.history.undo());
    expect(f.currentDocument.current.nodes[3].data.params.prompt).toBe('plain latest draft');
    expect(f.currentDocument.current.edges).toEqual(f.original.edges);
    f.unmount();
  });

  it('normalizes only patched data name/label, preserves old taskInfo and unrelated undefined fields', async () => {
    const f = fixture();
    const nodes = f.original.nodes.map((node) =>
      node.id === 'clip'
        ? {
            ...node,
            data: {
              ...node.data,
              name: '',
              label: 'legacy clip label',
              taskInfo: { loading: false, oldOnly: true },
              oldUndefined: undefined,
            },
          }
        : node,
    );
    f.currentDocument.current = { ...f.original, nodes };
    const granted = await lock(f);
    act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(true));
    const data = f.currentDocument.current.nodes[3].data;
    expect(data.name).toBe('legacy clip label');
    expect(Object.hasOwn(data, 'label')).toBe(false);
    expect(data.taskInfo).toEqual({ loading: false, oldOnly: true });
    expect(Object.hasOwn(data.taskInfo, 'ownerUserId')).toBe(false);
    expect(Object.hasOwn(data, 'oldUndefined')).toBe(true);
    expect(data.clipTimelineData).toEqual(nextTimeline());
    expect(f.currentDocument.current.nodes[0]).toEqual(f.original.nodes[0]);
    f.unmount();
  });

  it('two accepted targets apply their timelines before ordinary ig in a single CAS and one real history segment', async () => {
    const f = fixture();
    const second = {
      id: 'second',
      type: 'video-clip',
      data: {
        type: 'video-clip',
        name: 'second',
        clipTimelineData: {
          currentTime: 1,
          clips: [
            {
              id: 'old',
              sourceNodeId: 'audio',
              type: 'audio',
              startTime: 0,
              duration: 2,
              zIndex: 0,
            },
          ],
          audioSourceNodeIds: ['audio'],
          videoSourceNodeIds: [],
          videoTrackCount: 0,
          totalDuration: 2,
        },
      },
    };
    const secondEdge = { id: 'second-cut', source: 'audio', target: 'second' };
    f.currentDocument.current = {
      ...f.original,
      nodes: [...f.original.nodes, second],
      edges: [...f.original.edges, secondEdge],
    };
    const granted = await lock(f, ['removed', 'clip', 'audio', 'second']);
    const emptyTimeline = {
      currentTime: 1,
      totalDuration: 60,
      videoTrackCount: 0,
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
      clips: [],
    };
    const input = patch(f, granted, {
      transactions: [
        { targetNodeId: 'clip', edgeIds: ['cut'] },
        { targetNodeId: 'second', edgeIds: ['second-cut'] },
      ],
      nodeDataPatches: [
        { nodeId: 'clip', data: { clipTimelineData: nextTimeline() } },
        { nodeId: 'second', data: { clipTimelineData: emptyTimeline } },
      ],
      deleteEdgeIds: ['cut', 'second-cut'],
    });
    act(() => expect(granted.port.commitTransaction(input)).toBe(true));
    const expected = expectedAfter(f);
    expected.nodes.push({ ...second, data: { ...second.data, clipTimelineData: emptyTimeline } });
    expect(graph(f)).toEqual(expected);
    expect(f.beforeApply).toHaveBeenCalledOnce();
    expect(f.acceptedRecord).toHaveBeenCalledOnce();
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.result.current.history.history.current).toHaveLength(1);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual({
      nodes: [...f.baseline.nodes, second],
      edges: [...f.original.edges, secondEdge],
    });
    f.unmount();
  });

  it('does not partially apply a supplied target set when a second target was not actually leased', async () => {
    const f = fixture();
    const second = { id: 'second', type: 'video-clip', data: { name: 'unleased' } };
    const secondEdge = { id: 'second-cut', source: 'audio', target: 'second' };
    f.currentDocument.current = {
      ...f.original,
      nodes: [...f.original.nodes, second],
      edges: [...f.original.edges, secondEdge],
    };
    const granted = await lock(f);
    const latest = f.currentDocument.current;
    act(() =>
      expect(
        granted.port.commitTransaction(
          patch(f, granted, {
            transactions: [
              { targetNodeId: 'clip', edgeIds: ['cut'] },
              { targetNodeId: 'second', edgeIds: ['second-cut'] },
            ],
            deleteEdgeIds: ['cut', 'second-cut'],
          }),
        ),
      ).toBe(false),
    );
    expect(f.currentDocument.current).toBe(latest);
    zeroAccepted(f);
    f.unmount();
  });

  it('a history capture error after accepted CAS stays accepted, consumes drafts and reports history failure without creating a retryable duplicate', async () => {
    const f = fixture(),
      granted = await lock(f);
    const refusedHistory = vi.fn(() => false);
    act(() =>
      expect(
        granted.port.commitTransaction(patch(f, granted, { beforeApply: refusedHistory })),
      ).toBe(true),
    );
    expect(refusedHistory).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.currentDocument.current.edges.map((edge) => edge.id)).toEqual([
      'keep-edge',
      'sound-edge',
    ]);
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.clipPending.value).toBe(cleanedPrompt);
    expect(f.acceptedRecord).not.toHaveBeenCalled();
    expect(f.result.current.history.history.current).toEqual([]);
    expect(f.notify).toHaveBeenCalledWith('画布变更已接受，但历史记录失败');
    act(() =>
      expect(
        granted.port.commitTransaction(
          patch(f, { ...granted, expectedDocument: granted.port.getDocument() }),
        ),
      ).toBe(false),
    );
    expect(refusedHistory).toHaveBeenCalledOnce();
    f.unmount();
  });
});

describe('local lease owner, capability, deadline and disposal', () => {
  it('a signal-scoped A→B→A lease and late release cannot authorize or decrement the new A operation', async () => {
    const f = fixture(),
      staleSignal = new AbortController(),
      old = await lock(f, ['removed', 'clip'], staleSignal.signal);
    f.change({ documentKey: 'B' });
    f.change({ documentKey: 'A' });
    const activeSignal = new AbortController(),
      current = await lock(f, ['removed', 'clip'], activeSignal.signal);
    expect(current.owner.storeInstanceId).toBe(old.owner.storeInstanceId);
    expect(current.owner.projectId).toBe(old.owner.projectId);
    expect(current.owner.projectGeneration).not.toBe(old.owner.projectGeneration);
    for (const nodeId of ['removed', 'clip']) {
      expect(old.port.releaseLocks(nodeId, { owner: old.owner, signal: staleSignal.signal })).toBe(
        false,
      );
      expect(
        current.port.releaseLocks(nodeId, { owner: old.owner, signal: staleSignal.signal }),
      ).toBe(false);
      expect(
        current.port.releaseLocks(nodeId, { owner: current.owner, signal: staleSignal.signal }),
      ).toBe(false);
    }
    act(() => expect(old.port.commitTransaction(patch(f, old))).toBe(false));
    act(() =>
      expect(
        current.port.commitTransaction(patch(f, { ...current, signal: staleSignal.signal })),
      ).toBe(false),
    );
    zeroAccepted(f);
    act(() => expect(current.port.commitTransaction(patch(f, current))).toBe(true));
    expect(f.currentDocument.current).toEqual({ ...f.original, ...expectedAfter(f) });
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    for (const nodeId of ['removed', 'clip']) {
      expect(
        current.port.releaseLocks(nodeId, { owner: current.owner, signal: activeSignal.signal }),
      ).toBe(true);
      expect(
        current.port.releaseLocks(nodeId, { owner: current.owner, signal: activeSignal.signal }),
      ).toBe(false);
    }
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    f.unmount();
  });

  it('the canonical controller after StrictMode replay writes a signal-free document and releases only its real receipts', async () => {
    const f = fixture({ strict: true });
    const realPort = f.result.current.port;
    const signals = [];
    const port = {
      ...realPort,
      requestLocks: vi.fn((nodeId, options) => {
        signals.push(options.signal);
        return realPort.requestLocks(nodeId, options);
      }),
      releaseLocks: vi.fn((nodeId, options) => realPort.releaseLocks(nodeId, options)),
      commitTransaction: vi.fn((transaction) => realPort.commitTransaction(transaction)),
    };
    const controller = createCanvasClipDisconnectController({
      getOptions: () => ({
        documentKey: 'A',
        ready: true,
        readonly: false,
        port,
        notify: f.notify,
        beforeApply: f.beforeApply,
        now: () => 500,
      }),
    });
    let result;
    await act(async () => {
      result = await controller.disconnect(['cut']);
    });
    expect(result).toMatchObject({ status: 'applied', deletedEdgeIds: ['cut'], failures: [] });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
    expect(port.commitTransaction.mock.calls[0][0].signal).toBe(signals[0]);
    expect(port.releaseLocks.mock.calls).toEqual([
      ['removed', { owner: owner(realPort.getDocument()), signal: signals[0] }],
      ['clip', { owner: owner(realPort.getDocument()), signal: signals[0] }],
    ]);
    expect(f.currentDocument.current).toEqual({ ...f.original, ...expectedAfter(f) });
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    for (const nodeId of ['removed', 'clip']) {
      expect(
        realPort.releaseLocks(nodeId, { owner: owner(realPort.getDocument()), signal: signals[0] }),
      ).toBe(false);
      expect(realPort.releaseLocks(nodeId, { owner: owner(realPort.getDocument()) })).toBe(false);
    }
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    act(() => f.result.current.history.redo());
    expect(f.currentDocument.current).toEqual({ ...f.original, ...expectedAfter(f) });
    controller.retire();
    f.unmount();
  });

  it('isolates signal receipts from ungranted operations and the legacy bucket during release and authorization', async () => {
    const f = fixture(),
      first = new AbortController(),
      ungranted = new AbortController(),
      grants = await lock(f, ['removed', 'clip'], first.signal);
    for (const nodeId of ['removed', 'clip']) {
      expect(
        grants.port.releaseLocks(nodeId, { owner: grants.owner, signal: ungranted.signal }),
      ).toBe(false);
      expect(grants.port.releaseLocks(nodeId, { owner: grants.owner })).toBe(false);
    }
    act(() =>
      expect(grants.port.commitTransaction(patch(f, { ...grants, signal: ungranted.signal }))).toBe(
        false,
      ),
    );
    act(() =>
      expect(grants.port.commitTransaction(patch(f, { ...grants, signal: undefined }))).toBe(false),
    );
    zeroAccepted(f);
    act(() => expect(grants.port.commitTransaction(patch(f, grants))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    first.abort();
    act(() =>
      expect(
        grants.port.commitTransaction(
          patch(f, { ...grants, expectedDocument: grants.port.getDocument() }),
        ),
      ).toBe(false),
    );
    for (const nodeId of ['removed', 'clip']) {
      expect(grants.port.releaseLocks(nodeId, { owner: grants.owner, signal: first.signal })).toBe(
        true,
      );
      expect(grants.port.releaseLocks(nodeId, { owner: grants.owner, signal: first.signal })).toBe(
        false,
      );
    }
    expect(f.acceptedRecord).toHaveBeenCalledOnce();
    f.unmount();
  });

  it('legacy grants remain usable without authorizing or releasing a different signal scope', async () => {
    const f = fixture(),
      grants = await lock(f),
      other = new AbortController();
    for (const nodeId of ['removed', 'clip'])
      expect(grants.port.releaseLocks(nodeId, { owner: grants.owner, signal: other.signal })).toBe(
        false,
      );
    act(() =>
      expect(grants.port.commitTransaction(patch(f, { ...grants, signal: other.signal }))).toBe(
        false,
      ),
    );
    zeroAccepted(f);
    act(() => expect(grants.port.commitTransaction(patch(f, grants))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    for (const nodeId of ['removed', 'clip'])
      expect(grants.port.releaseLocks(nodeId, { owner: grants.owner })).toBe(true);
    f.unmount();
  });

  it('counts repeated requests within one signal while failed scopes cannot decrement them', async () => {
    const f = fixture(),
      own = new AbortController(),
      aborted = new AbortController(),
      timed = new AbortController(),
      first = await lock(f, ['removed', 'clip'], own.signal);
    await lock(f, ['removed', 'clip'], own.signal);
    aborted.abort();
    for (const nodeId of ['removed', 'clip']) {
      expect(
        await first.port.requestLocks(nodeId, { owner: first.owner, signal: aborted.signal }),
      ).toEqual({ ok: false, reason: 'aborted', nodeId });
      expect(
        await first.port.requestLocks(nodeId, {
          owner: first.owner,
          signal: timed.signal,
          timeoutMs: 0,
        }),
      ).toEqual({ ok: false, reason: 'timeout', nodeId });
      expect(first.port.releaseLocks(nodeId, { owner: first.owner, signal: aborted.signal })).toBe(
        false,
      );
      expect(first.port.releaseLocks(nodeId, { owner: first.owner, signal: timed.signal })).toBe(
        false,
      );
      expect(first.port.releaseLocks(nodeId, { owner: first.owner, signal: own.signal })).toBe(
        true,
      );
    }
    act(() => expect(first.port.commitTransaction(patch(f, first))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    for (const nodeId of ['removed', 'clip'])
      expect(first.port.releaseLocks(nodeId, { owner: first.owner, signal: own.signal })).toBe(
        true,
      );
    act(() =>
      expect(
        first.port.commitTransaction(
          patch(f, { ...first, expectedDocument: first.port.getDocument() }),
        ),
      ).toBe(false),
    );
    expect(f.acceptedRecord).toHaveBeenCalledOnce();
    f.unmount();
  });

  it('a timed-out operation late release cannot remove the newer controller receipt for the same target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const f = fixture(),
      actualPort = f.result.current.port;
    const held = new Map(),
      acquired = new Map(),
      releases = vi.fn((id, options) => actualPort.releaseLocks(id, options));
    const signals = [];
    const port = {
      ...actualPort,
      releaseLocks: releases,
      requestLocks(nodeId, options) {
        if (!signals.includes(options.signal)) signals.push(options.signal);
        return actualPort.requestLocks(nodeId, options).then(async (result) => {
          if (nodeId !== 'clip') return result;
          acquired.set(options.signal, result);
          await new Promise((resolve) => held.set(options.signal, resolve));
          return result;
        });
      },
    };
    const controller = createCanvasClipDisconnectController({
      getOptions: () => ({
        documentKey: 'A',
        ready: true,
        readonly: false,
        port,
        notify: f.notify,
        beforeApply: f.beforeApply,
        now: () => 500,
      }),
    });
    const first = controller.disconnect(['cut']);
    await Promise.resolve();
    await Promise.resolve();
    expect(acquired.get(signals[0])).toEqual({ ok: true, nodeId: 'clip' });
    await vi.advanceTimersByTimeAsync(2999);
    const second = controller.disconnect(['cut']);
    await Promise.resolve();
    await Promise.resolve();
    expect(acquired.get(signals[1])).toEqual({ ok: true, nodeId: 'clip' });
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toMatchObject({
      status: 'failed',
      deletedEdgeIds: [],
      failures: [{ nodeId: 'clip', reason: 'timeout' }],
    });
    expect(releases.mock.calls.map(([id]) => id)).toEqual(['removed']);
    zeroAccepted(f);
    held.get(signals[0])();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(releases.mock.calls.map(([id]) => id)).toEqual(['removed', 'clip']);
    let result;
    await act(async () => {
      held.get(signals[1])();
      result = await second;
    });
    expect(result).toMatchObject({ status: 'applied', deletedEdgeIds: ['cut'], failures: [] });
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.acceptedRecord).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(releases.mock.calls).toEqual([
      ['removed', { owner: owner(actualPort.getDocument()), signal: signals[0] }],
      ['clip', { owner: owner(actualPort.getDocument()), signal: signals[0] }],
      ['removed', { owner: owner(actualPort.getDocument()), signal: signals[1] }],
      ['clip', { owner: owner(actualPort.getDocument()), signal: signals[1] }],
    ]);
    act(() => f.result.current.history.undo());
    expect(graph(f)).toEqual(f.baseline);
    act(() => f.result.current.history.redo());
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(vi.getTimerCount()).toBe(0);
    controller.retire();
    f.unmount();
  });

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'B' }])(
    'retires captured callbacks and leases on %j and does not revive after recovery',
    async (capability) => {
      const f = fixture(),
        old = await lock(f);
      f.change(capability);
      expect(f.result.current.port).not.toBe(old.port);
      expect(old.port.getDocument()).toBeNull();
      expect(old.port.releaseLocks('clip', { owner: old.owner })).toBe(false);
      act(() => expect(old.port.commitTransaction(patch(f, old))).toBe(false));
      f.change({ documentKey: 'A', ready: true, readonly: false });
      const next = await lock(f);
      expect(next.owner.storeInstanceId).toBe(old.owner.storeInstanceId);
      expect(next.owner.projectId).toBe(old.owner.projectId);
      expect(next.owner.projectGeneration).not.toBe(old.owner.projectGeneration);
      expect(old.port.releaseLocks('clip', { owner: old.owner })).toBe(false);
      expect(next.port.releaseLocks('clip', { owner: old.owner })).toBe(false);
      act(() => expect(old.port.commitTransaction(patch(f, old))).toBe(false));
      zeroAccepted(f);
      act(() => expect(next.port.commitTransaction(patch(f, next))).toBe(true));
      expect(graph(f)).toEqual(expectedAfter(f));
      f.unmount();
    },
  );

  it('a signal aborted before microtask settlement grants no lease and cannot authorize a write', async () => {
    const f = fixture(),
      port = f.result.current.port,
      document = port.getDocument(),
      identity = owner(document),
      abort = new AbortController();
    const pending = port.requestLocks('removed', {
      owner: identity,
      signal: abort.signal,
      timeoutMs: 3000,
    });
    abort.abort();
    expect(await pending).toEqual({ ok: false, reason: 'aborted', nodeId: 'removed' });
    expect(port.releaseLocks('removed', { owner: identity })).toBe(false);
    act(() =>
      expect(
        port.commitTransaction(patch(f, { port, owner: identity, expectedDocument: document })),
      ).toBe(false),
    );
    zeroAccepted(f);
    f.unmount();
  });

  it('a local request exceeding its stated wall-clock deadline returns timeout without a fake cloud holder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const f = fixture(),
      port = f.result.current.port,
      identity = owner(port.getDocument());
    const pending = port.requestLocks('clip', { owner: identity, timeoutMs: 3000 });
    vi.setSystemTime(4000);
    expect(await pending).toEqual({ ok: false, reason: 'timeout', nodeId: 'clip' });
    expect(port.releaseLocks('clip', { owner: identity })).toBe(false);
    expect(f.notify).not.toHaveBeenCalled();
    zeroAccepted(f);
    expect(vi.getTimerCount()).toBe(0);
    f.unmount();
  });

  it('pending old-owner requests are aborted after A→B→A and cannot add a reference to the new lease map', async () => {
    const f = fixture(),
      oldPort = f.result.current.port,
      oldOwner = owner(oldPort.getDocument());
    const pending = oldPort.requestLocks('clip', { owner: oldOwner });
    f.change({ documentKey: 'B' });
    f.change({ documentKey: 'A' });
    expect(await pending).toEqual({ ok: false, reason: 'aborted', nodeId: 'clip' });
    expect(oldPort.releaseLocks('clip', { owner: oldOwner })).toBe(false);
    const next = await lock(f);
    expect(next.port.releaseLocks('clip', { owner: next.owner })).toBe(true);
    expect(next.port.releaseLocks('clip', { owner: next.owner })).toBe(false);
    zeroAccepted(f);
    f.unmount();
  });

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'B' }])(
    'fresh raw document capability %j rejects old permissions before props update',
    async (change) => {
      const f = fixture(),
        granted = await lock(f);
      f.currentDocument.current = { ...f.currentDocument.current, ...change };
      const fresh = f.currentDocument.current;
      expect(granted.port.getDocument()).toBeNull();
      expect(await granted.port.requestLocks('clip', { owner: granted.owner })).toEqual({
        ok: false,
        reason: 'aborted',
        nodeId: 'clip',
      });
      act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(false));
      expect(f.currentDocument.current).toBe(fresh);
      zeroAccepted(f);
      f.unmount();
    },
  );

  it('unmount retires pending and saved APIs while old release cannot become a new grant', async () => {
    const f = fixture(),
      granted = await lock(f);
    const pending = granted.port.requestLocks('audio', { owner: granted.owner });
    f.unmount();
    expect(await pending).toEqual({ ok: false, reason: 'aborted', nodeId: 'audio' });
    expect(granted.port.getDocument()).toBeNull();
    expect(granted.port.releaseLocks('clip', { owner: granted.owner })).toBe(false);
    expect(granted.port.commitTransaction(patch(f, granted))).toBe(false);
    expect(f.acceptedRecord).not.toHaveBeenCalled();
  });

  it('StrictMode replay has a live current generation and accepted graph/history only once', async () => {
    const f = fixture({ strict: true }),
      granted = await lock(f);
    act(() => expect(granted.port.commitTransaction(patch(f, granted))).toBe(true));
    expect(graph(f)).toEqual(expectedAfter(f));
    expect(f.beforeApply).toHaveBeenCalledOnce();
    expect(f.acceptedRecord).toHaveBeenCalledOnce();
    expect(f.result.current.history.history.current).toHaveLength(1);
    f.unmount();
  });

  it('missing/invalid nodes and a failed document read cannot be represented as other members holding locks', async () => {
    const f = fixture(),
      port = f.result.current.port,
      identity = owner(port.getDocument());
    for (const id of ['missing', ''])
      expect(await port.requestLocks(id, { owner: identity })).toEqual({
        ok: false,
        reason: 'aborted',
        nodeId: id,
      });
    f.controls.failRead = true;
    expect(port.getDocument()).toBeNull();
    expect(await port.requestLocks('clip', { owner: identity })).toEqual({
      ok: false,
      reason: 'aborted',
      nodeId: 'clip',
    });
    expect(f.notify).not.toHaveBeenCalled();
    zeroAccepted(f);
    f.unmount();
  });
});
