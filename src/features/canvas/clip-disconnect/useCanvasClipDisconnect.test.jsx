import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvasClipDisconnectController } from './clip-disconnect-controller.js';
import { useCanvasClipDisconnect } from './useCanvasClipDisconnect.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function documentFixture() {
  return {
    documentKey: 'doc-a',
    storeInstanceId: 'store-a',
    projectId: 'project-a',
    projectGeneration: 1,
    ready: true,
    readonly: false,
    view: { x: 20, y: 30, z: 0.5 },
    messages: [{ id: 'message', text: 'keep' }],
    nodes: [
      {
        id: 'video',
        type: 'video',
        position: { x: 0, y: 0 },
        data: { url: ['/video.mp4'], params: { prompt: 'source' } },
      },
      { id: 'audio', type: 'audio', data: { url: ['/audio.mp3'] } },
      { id: 'keep', type: 'video', data: { url: ['/keep.mp4'] } },
      {
        id: 'clip',
        type: 'video-clip',
        position: { x: 900, y: 300 },
        data: {
          name: 'clip target',
          params: { prompt: 'old draft' },
          rows: [{ id: 'raw-row', plotDescription: 'old row' }],
          clipTimelineData: {
            videoSourceNodeIds: ['video', 'keep'],
            audioSourceNodeIds: ['audio'],
            videoTrackCount: 1,
            totalDuration: 15,
            currentTime: 12,
            muteIds: ['removed-video'],
            clips: [
              {
                id: 'removed-video',
                type: 'video',
                sourceNodeId: 'video',
                startTime: 0,
                duration: 4,
                zIndex: 0,
              },
              {
                id: 'kept-video',
                type: 'video',
                sourceNodeId: 'keep',
                startTime: 10,
                duration: 5,
                zIndex: 0,
                transitionIn: 'remove-first-transition',
              },
              {
                id: 'kept-audio',
                type: 'audio',
                sourceNodeId: 'audio',
                startTime: 8,
                duration: 2,
                zIndex: 1,
                linkedVideoClipId: 'kept-video',
              },
            ],
          },
        },
      },
      { id: 'unrelated', type: 'text', data: { content: ['keep unrelated'] } },
    ],
    edges: [
      { id: 'video-edge', source: 'video', target: 'clip' },
      { id: 'audio-edge', source: 'audio', target: 'clip' },
      { id: 'keep-edge', source: 'keep', target: 'clip' },
    ],
  };
}

// Injectable local-workspace test port. It applies the supplied graph patch,
// not the production planner, and rejects a stale document reference. Real
// Canvas draft/storage/history integration is owned by the Root App tests.
function fixture(extra = {}) {
  let current = documentFixture();
  const history = [],
    requests = new Map();
  const notify = vi.fn(),
    selectNodes = vi.fn();
  const beforeApply = vi.fn(() => history.push(structuredClone(current)));
  const port = {
    mode: 'local-workspace',
    getDocument: vi.fn(() => current),
    requestLocks: vi.fn((id) => {
      const request = deferred();
      requests.set(id, request);
      return request.promise;
    }),
    releaseLocks: vi.fn(),
    commitTransaction: vi.fn((patch) => {
      if (patch.expectedDocument !== current) return false;
      patch.beforeApply?.();
      const data = new Map(patch.nodeDataPatches.map((item) => [item.nodeId, item.data]));
      const remove = new Set(patch.deleteEdgeIds);
      current = {
        ...current,
        nodes: current.nodes.map((node) =>
          data.has(node.id) ? { ...node, data: { ...node.data, ...data.get(node.id) } } : node,
        ),
        edges: current.edges.filter((edge) => !remove.has(edge.id)),
      };
      return true;
    }),
  };
  let options = {
    documentKey: 'doc-a',
    ready: true,
    readonly: false,
    port,
    notify,
    selectNodes,
    beforeApply,
    now: () => 500,
    ...extra,
  };
  const controller = createCanvasClipDisconnectController({ getOptions: () => options });
  return {
    controller,
    port,
    notify,
    selectNodes,
    beforeApply,
    history,
    requests,
    get current() {
      return current;
    },
    set current(value) {
      current = value;
    },
    get options() {
      return options;
    },
    setOptions(value) {
      options = { ...options, ...value };
    },
    settle(id, result = { ok: true }) {
      requests.get(id).resolve(result);
    },
    patchNode(id, patch) {
      current = {
        ...current,
        nodes: current.nodes.map((node) => (node.id === id ? patch(node) : node)),
      };
    },
  };
}

function expectedKeptTimeline() {
  return {
    videoSourceNodeIds: ['keep'],
    audioSourceNodeIds: ['audio'],
    videoTrackCount: 1,
    totalDuration: 5,
    currentTime: 5,
    muteIds: ['removed-video'],
    clips: [
      {
        id: 'kept-video',
        type: 'video',
        sourceNodeId: 'keep',
        startTime: 0,
        duration: 5,
        zIndex: 0,
      },
      {
        id: 'kept-audio',
        type: 'audio',
        sourceNodeId: 'audio',
        startTime: 0,
        duration: 2,
        zIndex: 1,
        linkedVideoClipId: 'kept-video',
      },
    ],
  };
}

afterEach(() => vi.useRealTimers());

describe('clip async target authorization and fresh-graph transaction port', () => {
  it('requires an explicit ready capability before requesting locks', async () => {
    const f = fixture({ ready: undefined });
    const pending = f.controller.disconnect(['video-edge']);
    for (const request of f.requests.values()) request.resolve({ ok: true });
    expect(await pending).toMatchObject({ status: 'retired', deletedEdgeIds: [] });
    expect(f.port.requestLocks).not.toHaveBeenCalled();
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
  });

  it('an adapter becoming unavailable while waiting retires the pending authorization', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge']);
    f.port.mode = 'unavailable';
    f.settle('video');
    f.settle('clip');
    expect(await pending).toMatchObject({ status: 'retired', deletedEdgeIds: [] });
    expect(f.current).toEqual(before);
    expect(f.history).toEqual([]);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
  });

  it('retires old local-workspace grants when the same port changes to collaboration, while a new operation remains usable', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge']);
    f.port.mode = 'collaboration';
    f.settle('video', { ok: false, reason: 'no_api' });
    f.settle('clip', { ok: false, reason: 'no_api' });
    expect(await pending).toMatchObject({ status: 'retired', deletedEdgeIds: [] });
    expect(f.current).toEqual(before);
    expect(f.history).toEqual([]);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);

    const current = f.controller.disconnect(['video-edge']);
    f.settle('video', { ok: false, reason: 'no_api' });
    f.settle('clip', { ok: false, reason: 'no_api' });
    expect(await current).toMatchObject({ status: 'applied', deletedEdgeIds: ['video-edge'] });
    expect(f.current.nodes[3].data.clipTimelineData).toEqual(expectedKeptTimeline());
    expect(f.port.commitTransaction).toHaveBeenCalledOnce();
    expect(f.history).toEqual([before]);
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(4);
  });

  it('overlapping operations do not retire the newer pending UI or duplicate a committed edge/history transaction', async () => {
    const f = fixture();
    const first = f.controller.disconnect(['video-edge']);
    const oldRequests = [...f.requests.values()];
    const firstId = f.controller.getState().operations[0];
    const second = f.controller.disconnect(['video-edge']);
    const secondId = f.controller.getState().operations[1];
    for (const request of oldRequests) request.resolve({ ok: true });
    expect(await first).toMatchObject({ status: 'applied', deletedEdgeIds: ['video-edge'] });
    expect(f.controller.getState().operations).toEqual([secondId]);
    expect(f.controller.cancel(firstId)).toBe(false);
    f.settle('video');
    f.settle('clip');
    expect(await second).toMatchObject({ status: 'noop', deletedEdgeIds: [] });
    expect(f.port.commitTransaction).toHaveBeenCalledOnce();
    expect(f.history).toHaveLength(1);
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(4);
    expect(f.controller.getState()).toMatchObject({
      pending: false,
      operations: [],
      lastResult: { status: 'noop' },
    });
  });

  it('HTTP failure feedback is distinct from denied selection when another target has actually committed locally', async () => {
    const f = fixture();
    f.current = {
      ...f.current,
      nodes: [...f.current.nodes, { id: 'second-clip', type: 'video-clip', data: {} }],
      edges: [
        ...f.current.edges,
        { id: 'other-target-edge', source: 'keep', target: 'second-clip' },
      ],
    };
    const pending = f.controller.disconnect(['video-edge', 'other-target-edge']);
    f.settle('video');
    f.settle('clip');
    f.settle('keep', { ok: false, reason: 'http_failed' });
    f.settle('second-clip');
    expect(await pending).toMatchObject({
      status: 'partial',
      deletedEdgeIds: ['video-edge'],
      acceptedTargetIds: ['clip'],
      failures: [{ nodeId: 'keep', reason: 'http_failed' }],
    });
    expect(f.current.nodes[3].data.clipTimelineData).toEqual(expectedKeptTimeline());
    expect(f.current.edges.map((edge) => edge.id)).toEqual([
      'audio-edge',
      'keep-edge',
      'other-target-edge',
    ]);
    expect(f.history).toHaveLength(1);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith(
      '删除已同步到本地，但同步到云端失败，请检查网络',
    );
    expect(f.selectNodes).not.toHaveBeenCalled();
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(4);
  });

  it('requests deduplicated endpoints concurrently, then commits one target once with literal latest timeline and complete unrelated data retained', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge', 'audio-edge', 'video-edge']);
    expect(f.port.requestLocks.mock.calls.map(([id]) => id)).toEqual(['video', 'clip', 'audio']);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.beforeApply).not.toHaveBeenCalled();
    for (const [, argument] of f.port.requestLocks.mock.calls) {
      expect(argument.timeoutMs).toBe(3000);
      expect(argument.owner).toEqual({
        storeInstanceId: 'store-a',
        projectId: 'project-a',
        projectGeneration: 1,
      });
      expect(argument.signal.aborted).toBe(false);
    }
    f.settle('video');
    f.settle('clip');
    f.settle('audio');
    expect(await pending).toMatchObject({
      status: 'applied',
      deletedEdgeIds: ['video-edge', 'audio-edge', 'video-edge'],
      acceptedTargetIds: ['clip'],
      failures: [],
    });
    expect(f.port.commitTransaction).toHaveBeenCalledTimes(1);
    const expected = structuredClone(before);
    expected.edges = [{ id: 'keep-edge', source: 'keep', target: 'clip' }];
    expected.nodes[3].data.clipTimelineData = {
      videoSourceNodeIds: ['keep'],
      audioSourceNodeIds: [],
      videoTrackCount: 1,
      totalDuration: 5,
      currentTime: 5,
      muteIds: ['removed-video'],
      clips: [
        {
          id: 'kept-video',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 0,
          duration: 5,
          zIndex: 0,
        },
      ],
    };
    expect(f.current).toEqual(expected);
    expect(f.history).toEqual([before]);
    expect(f.port.releaseLocks.mock.calls.map(([id]) => id)).toEqual(['video', 'clip', 'audio']);
    const operationSignal = f.port.requestLocks.mock.calls[0][1].signal;
    expect(
      f.port.requestLocks.mock.calls.every(([, options]) => options.signal === operationSignal),
    ).toBe(true);
    expect(f.port.commitTransaction.mock.calls[0][0].signal).toBe(operationSignal);
    expect(
      f.port.releaseLocks.mock.calls.every(([, options]) => options.signal === operationSignal),
    ).toBe(true);
    expect(f.controller.getState()).toMatchObject({
      pending: false,
      operations: [],
      lastResult: { status: 'applied', releaseFailures: [] },
    });
  });

  it('reads fresh prompt/raw rows/positions/view and timeline after waiting, never the captured old graph', async () => {
    const f = fixture();
    const pending = f.controller.disconnect(['video-edge']);
    f.patchNode('clip', (node) => ({
      ...node,
      position: { x: 2000, y: 400 },
      data: {
        ...node.data,
        params: { prompt: 'last 150ms draft', settings: { retain: true } },
        rows: [{ id: 'raw-row', plotDescription: 'latest raw row', unknown: { keep: 1 } }],
        clipTimelineData: {
          ...node.data.clipTimelineData,
          currentTime: 77,
          clips: node.data.clipTimelineData.clips.map((clip) =>
            clip.id === 'kept-video' ? { ...clip, duration: 9 } : clip,
          ),
        },
      },
    }));
    f.patchNode('unrelated', (node) => ({ ...node, data: { content: ['latest unrelated'] } }));
    f.current = { ...f.current, view: { x: 200, y: 300, z: 0.8 } };
    const fresh = f.current,
      expected = structuredClone(fresh);
    expected.edges = fresh.edges.slice(1);
    expected.nodes[3].data.clipTimelineData = {
      ...expectedKeptTimeline(),
      totalDuration: 9,
      currentTime: 9,
      clips: [
        {
          id: 'kept-video',
          type: 'video',
          sourceNodeId: 'keep',
          startTime: 0,
          duration: 9,
          zIndex: 0,
        },
        {
          id: 'kept-audio',
          type: 'audio',
          sourceNodeId: 'audio',
          startTime: 0,
          duration: 2,
          zIndex: 1,
          linkedVideoClipId: 'kept-video',
        },
      ],
    };
    f.settle('video');
    f.settle('clip');
    await pending;
    expect(f.port.commitTransaction.mock.calls[0][0].expectedDocument).toBe(fresh);
    expect(f.current).toEqual(expected);
    expect(f.history).toEqual([fresh]);
    expect(f.beforeApply).toHaveBeenCalledOnce();
  });

  it('denies an entire same-target set if one source lock fails, while another target commits once', async () => {
    const f = fixture();
    f.current = {
      ...f.current,
      nodes: [
        ...f.current.nodes,
        { id: 'second-clip', type: 'video-clip', data: { keep: 'no timeline' } },
      ],
      edges: [
        ...f.current.edges,
        { id: 'other-target-edge', source: 'keep', target: 'second-clip' },
      ],
    };
    const before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge', 'audio-edge', 'other-target-edge']);
    f.settle('video', { ok: false, reason: 'denied' });
    f.settle('clip');
    f.settle('audio');
    f.settle('keep');
    f.settle('second-clip');
    expect(await pending).toMatchObject({
      status: 'partial',
      deletedEdgeIds: ['other-target-edge'],
      acceptedTargetIds: ['second-clip'],
      failures: [{ nodeId: 'video', reason: 'denied' }],
    });
    expect(f.port.commitTransaction.mock.calls[0][0].nodeDataPatches).toEqual([]);
    expect(f.current).toEqual({ ...before, edges: before.edges.slice(0, 3) });
    expect(f.history).toEqual([before]);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('部分节点正在被其他成员编辑，已保留选中');
    expect(f.selectNodes).toHaveBeenCalledExactlyOnceWith(['video']);
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(5);
  });

  it('does not authorize a changed endpoint that was never locked and does not use ordinary fallback for a new passthrough kind', async () => {
    const f = fixture();
    const pending = f.controller.disconnect(['video-edge']);
    f.current = {
      ...f.current,
      edges: [{ id: 'video-edge', source: 'keep', target: 'clip' }, ...f.current.edges.slice(1)],
    };
    const latest = f.current;
    f.settle('video');
    f.settle('clip');
    expect(await pending).toMatchObject({ status: 'noop', deletedEdgeIds: [] });
    expect(f.current).toBe(latest);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.history).toEqual([]);

    const second = f.controller.disconnect(['audio-edge']);
    f.patchNode('audio', (node) => ({ ...node, type: 'image' }));
    const changedType = f.current;
    f.settle('audio');
    f.settle('clip');
    expect(await second).toMatchObject({ status: 'noop', deletedEdgeIds: [] });
    expect(f.current).toBe(changedType);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
  });

  it('replans when one edge disappears: the fresh remaining authorized target transaction is still valid', async () => {
    const f = fixture();
    const pending = f.controller.disconnect(['video-edge', 'audio-edge']);
    f.current = { ...f.current, edges: f.current.edges.filter((edge) => edge.id !== 'video-edge') };
    f.settle('video');
    f.settle('clip');
    f.settle('audio');
    expect(await pending).toMatchObject({
      status: 'applied',
      deletedEdgeIds: ['audio-edge'],
      acceptedTargetIds: ['clip'],
    });
    expect(f.port.commitTransaction.mock.calls[0][0].transactions[0].edgeIds).toEqual([
      'audio-edge',
    ]);
    expect(f.current.edges).toEqual([{ id: 'keep-edge', source: 'keep', target: 'clip' }]);
  });

  it('fresh busy state prevents deletion and emits only source busy feedback', async () => {
    const f = fixture();
    const pending = f.controller.disconnect(['video-edge']);
    f.patchNode('clip', (node) => ({
      ...node,
      data: { ...node.data, agentEditing: { state: 'running', startedAtMs: 0 } },
    }));
    const latest = f.current;
    f.settle('video');
    f.settle('clip');
    expect(await pending).toMatchObject({
      status: 'blocked',
      blockedEdgeIds: ['video-edge'],
      deletedEdgeIds: [],
    });
    expect(f.current).toBe(latest);
    expect(f.history).toEqual([]);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('智能剪辑进行中，暂时无法断开素材连线');
  });

  it('an agent exactly one hour old permits fresh deletion while preserving its metadata', async () => {
    const f = fixture({ now: () => 3_600_000 });
    f.patchNode('clip', (node) => ({
      ...node,
      data: { ...node.data, agentEditing: { state: 'running', startedAtMs: 0, task: 'retain' } },
    }));
    const pending = f.controller.disconnect(['video-edge']);
    f.settle('video');
    f.settle('clip');
    expect(await pending).toMatchObject({ status: 'applied' });
    expect(f.current.nodes[3].data.agentEditing).toEqual({
      state: 'running',
      startedAtMs: 0,
      task: 'retain',
    });
    expect(f.notify).not.toHaveBeenCalled();
  });

  it.each(['storeInstanceId', 'projectId', 'projectGeneration'])(
    'rejects changed fresh source owner %s and releases all locks with the old owner',
    async (field) => {
      const f = fixture();
      const pending = f.controller.disconnect(['video-edge']);
      f.current = { ...f.current, [field]: field === 'projectGeneration' ? 2 : 'new-owner' };
      const latest = f.current;
      f.settle('video');
      f.settle('clip');
      expect(await pending).toMatchObject({ status: 'retired', deletedEdgeIds: [] });
      expect(f.current).toBe(latest);
      expect(f.port.commitTransaction).not.toHaveBeenCalled();
      expect(f.beforeApply).not.toHaveBeenCalled();
      expect(f.notify).not.toHaveBeenCalled();
      expect(f.port.releaseLocks.mock.calls).toEqual([
        [
          'video',
          {
            owner: { storeInstanceId: 'store-a', projectId: 'project-a', projectGeneration: 1 },
            signal: f.port.requestLocks.mock.calls[0][1].signal,
          },
        ],
        [
          'clip',
          {
            owner: { storeInstanceId: 'store-a', projectId: 'project-a', projectGeneration: 1 },
            signal: f.port.requestLocks.mock.calls[1][1].signal,
          },
        ],
      ]);
    },
  );

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'doc-b' }])(
    'fresh document capability blocks a write before hook props catch up %j',
    async (patch) => {
      const f = fixture();
      const pending = f.controller.disconnect(['video-edge']);
      f.current = { ...f.current, ...patch };
      const latest = f.current;
      f.settle('video');
      f.settle('clip');
      await pending;
      expect(f.current).toBe(latest);
      expect(f.port.commitTransaction).not.toHaveBeenCalled();
      expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
    },
  );

  it('CAS false preserves the complete target transaction and draft with no snapshot, then explicit retry succeeds once', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    f.port.commitTransaction.mockReturnValueOnce(false);
    const first = f.controller.disconnect(['video-edge']);
    f.settle('video');
    f.settle('clip');
    expect(await first).toMatchObject({
      status: 'failed',
      deletedEdgeIds: [],
      failures: [{ nodeId: 'clip', reason: 'denied' }],
    });
    expect(f.current).toEqual(before);
    expect(f.history).toEqual([]);
    expect(f.beforeApply).not.toHaveBeenCalled();
    const retry = f.controller.disconnect(['video-edge']);
    f.settle('video');
    f.settle('clip');
    expect(await retry).toMatchObject({ status: 'applied', deletedEdgeIds: ['video-edge'] });
    expect(f.history).toEqual([before]);
    expect(f.current.nodes[3].data.clipTimelineData).toEqual(expectedKeptTimeline());
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(4);
  });

  it('a throwing commit or release cannot skip release of the other requested nodes or claim graph success', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    f.port.commitTransaction.mockImplementationOnce(() => {
      throw new Error('projection failed');
    });
    f.port.releaseLocks.mockImplementationOnce(() => {
      throw new Error('release failed');
    });
    const pending = f.controller.disconnect(['video-edge']);
    f.settle('video');
    f.settle('clip');
    expect(await pending).toMatchObject({
      status: 'failed',
      deletedEdgeIds: [],
      failures: [{ nodeId: 'clip', reason: 'commit_failed' }],
    });
    expect(f.current).toEqual(before);
    expect(f.history).toEqual([]);
    expect(f.port.releaseLocks.mock.calls.map(([id]) => id)).toEqual(['video', 'clip']);
    expect(f.controller.getState().lastResult.releaseFailures).toEqual(['video']);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('智能剪辑连线未断开，请重试');
  });

  it('enforces the 3000ms adapter deadline and releases an ignored-signal late grant without any late graph write', async () => {
    vi.useFakeTimers();
    const f = fixture(),
      before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge']);
    f.settle('clip');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toMatchObject({
      status: 'failed',
      failures: [{ nodeId: 'video', reason: 'timeout' }],
      deletedEdgeIds: [],
    });
    expect(f.current).toEqual(before);
    expect(f.port.releaseLocks.mock.calls.map(([id]) => id)).toEqual(['clip']);
    expect(f.selectNodes).toHaveBeenCalledExactlyOnceWith(['video']);
    f.settle('video');
    await Promise.resolve();
    await Promise.resolve();
    expect(f.port.releaseLocks.mock.calls.map(([id]) => id)).toEqual(['clip', 'video']);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancel aborts pending requests and retires only its operation; late completion only releases old locks', async () => {
    const f = fixture(),
      before = structuredClone(f.current);
    const pending = f.controller.disconnect(['video-edge']);
    const id = f.controller.getState().operations[0];
    expect(f.controller.cancel(id)).toBe(true);
    expect(f.port.requestLocks.mock.calls.every(([, args]) => args.signal.aborted)).toBe(true);
    expect(await pending).toMatchObject({ status: 'cancelled', deletedEdgeIds: [] });
    expect(f.controller.cancel(id)).toBe(false);
    f.settle('video');
    f.settle('clip');
    await Promise.resolve();
    await Promise.resolve();
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.current).toEqual(before);
    expect(f.history).toEqual([]);
    expect(f.notify).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'synchronous-throw'])(
    'adapter %s maps to aborted, releases both endpoints and does no feedback or writer work',
    async (kind) => {
      const f = fixture();
      if (kind === 'rejected')
        f.port.requestLocks.mockImplementationOnce(() => Promise.reject(new Error('abort')));
      else
        f.port.requestLocks.mockImplementationOnce(() => {
          throw new Error('abort');
        });
      const pending = f.controller.disconnect(['video-edge']);
      f.settle('clip');
      expect(await pending).toMatchObject({
        status: 'failed',
        failures: [{ nodeId: 'video', reason: 'aborted' }],
      });
      expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
      expect(f.port.commitTransaction).not.toHaveBeenCalled();
      expect(f.notify).not.toHaveBeenCalled();
    },
  );

  it('accepts no_api only through an explicitly provided local-workspace port', async () => {
    const f = fixture();
    const pending = f.controller.disconnect(['video-edge']);
    f.settle('video', { ok: false, reason: 'no_api' });
    f.settle('clip', { ok: false, reason: 'no_api' });
    expect(await pending).toMatchObject({ status: 'applied', deletedEdgeIds: ['video-edge'] });
    expect(f.current.nodes[3].data.clipTimelineData).toEqual(expectedKeptTimeline());
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('default unavailable and explicit unavailable preserve clip edges rather than use raw deletion', async () => {
    const f = fixture();
    const before = structuredClone(f.current);
    f.setOptions({ port: undefined, getDocument: () => f.current });
    expect(await f.controller.disconnect(['video-edge'])).toMatchObject({
      status: 'unavailable',
      unavailableEdgeIds: ['video-edge'],
      deletedEdgeIds: [],
    });
    f.setOptions({ port: { ...f.port, mode: 'unavailable' } });
    expect(await f.controller.disconnect(['video-edge'])).toMatchObject({
      status: 'unavailable',
      deletedEdgeIds: [],
    });
    expect(f.current).toEqual(before);
    expect(f.port.requestLocks).not.toHaveBeenCalled();
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.beforeApply).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledWith('智能剪辑断线暂不可用：未连接编辑锁服务');
  });

  it('fresh metadata edge clones are allowed and a disappeared original ID never invokes a fallback writer', async () => {
    const f = fixture();
    const first = f.controller.disconnect(['video-edge']);
    f.current = {
      ...f.current,
      edges: f.current.edges.map((edge) => ({ ...edge, metadata: 'latest' })),
    };
    f.settle('video');
    f.settle('clip');
    expect(await first).toMatchObject({ status: 'applied' });
    expect(f.current.edges).toEqual([
      { id: 'audio-edge', source: 'audio', target: 'clip', metadata: 'latest' },
      { id: 'keep-edge', source: 'keep', target: 'clip', metadata: 'latest' },
    ]);
    const calls = f.port.commitTransaction.mock.calls.length;
    expect(await f.controller.disconnect(['video-edge'])).toMatchObject({ status: 'noop' });
    expect(f.port.commitTransaction).toHaveBeenCalledTimes(calls);
  });
});

describe('React clip operation lifetime and opaque document owner', () => {
  function hookFixture(renderOptions = {}) {
    const f = fixture();
    const hook = renderHook((options) => useCanvasClipDisconnect(options), {
      initialProps: f.options,
      ...renderOptions,
    });
    return {
      f,
      hook,
      change(patch) {
        f.setOptions(patch);
        hook.rerender(f.options);
      },
    };
  }

  it('publishes pending without snapshot work, then actual accepted patch is the only beforeApply/history boundary', async () => {
    const { f, hook } = hookFixture();
    let pending;
    act(() => {
      pending = hook.result.current.disconnect(['video-edge']);
    });
    expect(hook.result.current.pending).toBe(true);
    expect(f.beforeApply).not.toHaveBeenCalled();
    await act(async () => {
      f.settle('video');
      f.settle('clip');
      await pending;
    });
    expect(hook.result.current.pending).toBe(false);
    expect(hook.result.current.lastResult).toMatchObject({
      status: 'applied',
      deletedEdgeIds: ['video-edge'],
    });
    expect(f.history).toHaveLength(1);
    hook.unmount();
  });

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'doc-b' }])(
    'owner capability change cancels promptly and late responses do not write %j',
    async (patch) => {
      const { f, hook, change } = hookFixture();
      let pending;
      act(() => {
        pending = hook.result.current.disconnect(['video-edge']);
      });
      const oldRequests = [...f.requests.values()];
      change(patch);
      expect(hook.result.current.pending).toBe(false);
      await act(async () => {
        await pending;
        for (const request of oldRequests) request.resolve({ ok: true });
        await Promise.resolve();
      });
      expect(f.port.commitTransaction).not.toHaveBeenCalled();
      expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
      expect(f.history).toEqual([]);
      hook.unmount();
    },
  );

  it('A→B→A cannot revive an old request or allow its old cancel token to cancel a new A operation', async () => {
    const { f, hook, change } = hookFixture();
    let oldPending;
    act(() => {
      oldPending = hook.result.current.disconnect(['video-edge']);
    });
    const oldId = hook.result.current.operations[0],
      oldRequests = [...f.requests.values()];
    f.current = {
      ...documentFixture(),
      documentKey: 'doc-b',
      projectId: 'project-b',
      projectGeneration: 2,
    };
    change({ documentKey: 'doc-b' });
    f.current = { ...documentFixture(), projectGeneration: 3 };
    change({ documentKey: 'doc-a' });
    let newPending;
    act(() => {
      newPending = hook.result.current.disconnect(['video-edge']);
    });
    const newId = hook.result.current.operations[0];
    expect(newId).not.toBe(oldId);
    expect(hook.result.current.cancel(oldId)).toBe(false);
    await act(async () => {
      for (const request of oldRequests) request.resolve({ ok: true });
      await oldPending;
    });
    expect(hook.result.current.operations).toEqual([newId]);
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    await act(async () => {
      f.settle('video');
      f.settle('clip');
      await newPending;
    });
    expect(f.port.commitTransaction).toHaveBeenCalledOnce();
    expect(f.port.commitTransaction.mock.calls[0][0].owner.projectGeneration).toBe(3);
    expect(f.port.releaseLocks.mock.calls.map(([, args]) => args.owner.projectGeneration)).toEqual([
      1, 1, 3, 3,
    ]);
    hook.unmount();
  });

  it.each(['normal', 'StrictMode'])(
    'observed same-port unavailable→local-workspace retires old grants and keeps the new operation live in %s',
    async (mode) => {
      const { f, hook, change } = hookFixture(mode === 'StrictMode' ? { wrapper: StrictMode } : {});
      const before = structuredClone(f.current);
      let oldPending;
      act(() => {
        oldPending = hook.result.current.disconnect(['video-edge']);
      });
      const oldId = hook.result.current.operations[0],
        oldRequests = [...f.requests.values()];
      try {
        f.port.mode = 'unavailable';
        change({});
        expect(hook.result.current.pending).toBe(false);
        expect(f.port.requestLocks.mock.calls.every(([, options]) => options.signal.aborted)).toBe(
          true,
        );

        f.port.mode = 'local-workspace';
        change({});
        let current;
        act(() => {
          current = hook.result.current.disconnect(['video-edge']);
        });
        const currentId = hook.result.current.operations[0];
        expect(currentId).not.toBe(oldId);
        expect(hook.result.current.cancel(oldId)).toBe(false);
        await act(async () => {
          for (const request of oldRequests) request.resolve({ ok: false, reason: 'no_api' });
          expect(await oldPending).toMatchObject({ status: 'cancelled', deletedEdgeIds: [] });
          await Promise.resolve();
        });
        expect(f.current).toEqual(before);
        expect(f.history).toEqual([]);
        expect(f.port.commitTransaction).not.toHaveBeenCalled();
        expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
        expect(hook.result.current.operations).toEqual([currentId]);

        await act(async () => {
          f.settle('video');
          f.settle('clip');
          expect(await current).toMatchObject({
            status: 'applied',
            deletedEdgeIds: ['video-edge'],
          });
        });
        expect(f.current.nodes[3].data.clipTimelineData).toEqual(expectedKeptTimeline());
        expect(f.history).toEqual([before]);
        expect(f.port.commitTransaction).toHaveBeenCalledOnce();
        expect(f.port.releaseLocks).toHaveBeenCalledTimes(4);
        expect(hook.result.current.pending).toBe(false);
      } finally {
        hook.unmount();
        for (const request of oldRequests) request.resolve({ ok: false, reason: 'no_api' });
        for (const request of f.requests.values()) request.resolve({ ok: true });
        await oldPending;
      }
    },
  );

  it('unmount aborts requests, rejects saved disconnect callbacks and releases ignored-signal late completions', async () => {
    const { f, hook } = hookFixture();
    let pending;
    act(() => {
      pending = hook.result.current.disconnect(['video-edge']);
    });
    const savedDisconnect = hook.result.current.disconnect;
    hook.unmount();
    expect(f.port.requestLocks.mock.calls.every(([, options]) => options.signal.aborted)).toBe(
      true,
    );
    await pending;
    f.settle('video');
    f.settle('clip');
    await Promise.resolve();
    await Promise.resolve();
    expect(await savedDisconnect(['video-edge'])).toMatchObject({ status: 'retired' });
    expect(f.port.commitTransaction).not.toHaveBeenCalled();
    expect(f.port.releaseLocks).toHaveBeenCalledTimes(2);
    expect(f.history).toEqual([]);
  });

  it('StrictMode effect replay retains a live current owner without accepting a retired operation', async () => {
    const f = fixture();
    const hook = renderHook((options) => useCanvasClipDisconnect(options), {
      initialProps: f.options,
      wrapper: StrictMode,
    });
    let pending;
    act(() => {
      pending = hook.result.current.disconnect(['video-edge']);
    });
    await act(async () => {
      f.settle('video');
      f.settle('clip');
      await pending;
    });
    expect(f.port.commitTransaction).toHaveBeenCalledOnce();
    expect(f.beforeApply).toHaveBeenCalledOnce();
    expect(hook.result.current.pending).toBe(false);
    hook.unmount();
  });
});
