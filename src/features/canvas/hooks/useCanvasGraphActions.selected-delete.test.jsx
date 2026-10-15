import { createRef, useState } from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import NodeGeneratorPrompt from '../generator/NodeGeneratorPrompt.jsx';

afterEach(() => vi.useRealTimers());

const node = (id, type, data = {}, position = { x: 20, y: 30 }) => ({
  id,
  type,
  position,
  data: { type, name: id, ...data },
});
const data = (graph, id) => graph.nodes.find((value) => value.id === id)?.data;

function fixture({ project, editingType } = {}) {
  const nodes = [
    node('first-script', 'script', {
      linkedImageGroupId: 'shared',
      linkedVideoGroupId: 'shared',
      params: { prompt: 'old legacy' },
      rows: [{ hiddenUuid: 'legacy-row', plotDescription: '保留剧情' }],
    }),
    node('second-script', 'script', { linkedVideoGroupId: 'shared' }),
    node(
      'shared',
      'group',
      {
        sourceScriptNodeId: 'first-script',
        storyboardTitle: '共享绑定',
        storyboardGroupType: 'image',
        childNodeIds: ['child'],
        storyboardSourceRowHiddenUuids: ['legacy-row'],
      },
      { x: 1000, y: 400 },
    ),
    { ...node('child', 'image', { scriptRowHiddenUuid: 'legacy-row' }), parentId: 'shared' },
    node('v2', 'script-v2', {
      params: { prompt: 'old v2' },
      rows: [{ id: 'v2-row', hiddenUuid: 'v2-hidden', videoMotionPrompt: 'old motion' }],
    }),
    node('image-one', 'image', { url: ['/one.webp'] }),
    node('image-two', 'image', { url: ['/two.webp'] }),
    node('ordinary', 'video', {
      params: {
        model: 'star-video2',
        modeType: 'image2video',
        prompt: 'old ordinary',
        imageList: [
          { nodeId: 'image-one', url: '/one.webp' },
          { nodeId: 'image-two', url: '/two.webp' },
        ],
        videoList: [],
        audioList: [],
      },
    }),
  ];
  const edges = [
    { id: 'first', source: 'first-script', target: 'shared' },
    { id: 'second', source: 'second-script', target: 'shared' },
    { id: 'ordinary-one', source: 'image-one', target: 'ordinary' },
    { id: 'ordinary-two', source: 'image-two', target: 'ordinary' },
  ];
  if (editingType) {
    nodes.push(
      node(
        'editing',
        editingType,
        {
          params: {
            segmentRemakeLock: true,
            segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'first-script' },
          },
        },
        { x: 300, y: 400 },
      ),
    );
    nodes.push({ ...node('editing-child', 'image'), parentId: 'editing' });
    edges.push({ id: 'editing-edge', source: 'first-script', target: 'editing' });
  }
  const original = { documentKey: 'doc', ready: true, readonly: false, nodes, edges, models };
  let currentGraph = original;
  const graphWrites = vi.fn((value) => {
    currentGraph = value;
  });
  const currentDocument = {
    get current() {
      return currentGraph;
    },
    set current(value) {
      graphWrites(value);
    },
  };
  const projection = vi.fn(),
    consumed = vi.fn(),
    notify = vi.fn();
  let historyApi, publishNodes, publishEdges;
  const recordSnapshot = vi.fn((snapshot) => historyApi.recordSnapshot(snapshot));
  const setNodes = vi.fn((next) => publishNodes(next));
  const setEdges = vi.fn((next) => publishEdges(next));
  const hook = renderHook(
    ({ documentKey }) => {
      const [currentNodes, setCurrentNodes] = useState(nodes);
      const [currentEdges, setCurrentEdges] = useState(edges);
      publishNodes = setCurrentNodes;
      publishEdges = setCurrentEdges;
      const history = useSnapshotHistory(
        { nodes: currentNodes, edges: currentEdges },
        {
          restore(snapshot) {
            currentDocument.current = { ...currentDocument.current, ...snapshot };
            setCurrentNodes(snapshot.nodes);
            setCurrentEdges(snapshot.edges);
          },
        },
      );
      historyApi = history;
      const drafts = useCanvasDrafts({ storageKey: documentKey, nodes: currentNodes, ready: true });
      const actions = useCanvasGraphActions({
        documentKey,
        currentDocument,
        recordSnapshot,
        setNodes,
        setEdges,
        notify,
        projectGraph(graph, options) {
          projection(graph, options);
          const projected = drafts.project({ ...graph, storageKey: documentKey }, options);
          return project
            ? project(projected, options, currentDocument, projection.mock.calls.length)
            : projected;
        },
        consumeDrafts(graph, options) {
          consumed(graph, options);
          drafts.consume({ ...graph, storageKey: documentKey }, options);
        },
      });
      return { actions, drafts, history };
    },
    { initialProps: { documentKey: 'doc' } },
  );
  const legacyDraft = { writable: true, basePrompt: 'old legacy', value: 'last legacy' };
  const v2Draft = { writable: true, basePrompt: 'old v2', value: 'last v2' };
  const ordinaryDraft = { writable: true, basePrompt: 'old ordinary', value: 'last ordinary' };
  const rowDraft = {
    writable: true,
    scriptPrompts: [
      {
        rowId: 'v2-row',
        track: 'video',
        value: 'last motion',
        baseFingerprint: fingerprintScriptPromptBundle(
          getScriptPromptBundle(nodes[4].data.rows[0], 'video'),
        ),
      },
    ],
  };
  const acceptedOrdinary = vi.fn((value) => {
    ordinaryDraft.basePrompt = value;
    ordinaryDraft.value = value;
    return true;
  });
  hook.result.current.drafts.register('doc', 'first-script', () => legacyDraft);
  hook.result.current.drafts.register('doc', 'v2', () => v2Draft, 'script-generator');
  hook.result.current.drafts.register('doc', 'v2', () => rowDraft, 'default');
  hook.result.current.drafts.register(
    'doc',
    'ordinary',
    () => ordinaryDraft,
    'default',
    acceptedOrdinary,
  );
  return {
    ...hook,
    original,
    currentDocument,
    graphWrites,
    projection,
    consumed,
    notify,
    recordSnapshot,
    setNodes,
    setEdges,
    legacyDraft,
    v2Draft,
    ordinaryDraft,
    rowDraft,
    acceptedOrdinary,
  };
}

function noCommit(f) {
  expect(f.recordSnapshot).not.toHaveBeenCalled();
  expect(f.consumed).not.toHaveBeenCalled();
  expect(f.setNodes).not.toHaveBeenCalled();
  expect(f.setEdges).not.toHaveBeenCalled();
  expect(f.result.current.history.history.current).toHaveLength(0);
}
function latestDrafts(graph, ordinaryValue = 'last ordinary') {
  expect(data(graph, 'first-script').params.prompt).toBe('last legacy');
  expect(data(graph, 'v2').params.prompt).toBe('last v2');
  expect(data(graph, 'v2').rows[0].videoMotionPrompt).toBe('last motion');
  expect(data(graph, 'ordinary').params.prompt).toBe(ordinaryValue);
}

describe('batch deletion APIs preserve phase CAS, history and latest channels', () => {
  it('unlinks a shared-group cohort once and restores both metadata and edges with real undo/redo', () => {
    const f = fixture();
    let accepted;
    const writer = vi.fn((before, committed) => {
      expect(f.currentDocument.current).toBe(committed);
      latestDrafts(before);
      accepted = committed;
      f.result.current.history.recordSnapshot(before);
    });
    act(() =>
      expect(
        f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
          historyWriter: writer,
        }),
      ).toBe(true),
    );
    expect(f.currentDocument.current).toBe(accepted);
    expect(f.graphWrites).toHaveBeenCalledExactlyOnceWith(accepted);
    expect(accepted.edges.map((e) => e.id)).toEqual(['ordinary-one', 'ordinary-two']);
    expect(accepted.nodes.map((n) => n.id)).toEqual(f.original.nodes.map((n) => n.id));
    expect(data(accepted, 'first-script')).not.toHaveProperty('linkedImageGroupId');
    expect(data(accepted, 'first-script').linkedVideoGroupId).toBe('shared');
    expect(data(accepted, 'second-script').linkedVideoGroupId).toBe('shared');
    expect(data(accepted, 'shared')).not.toHaveProperty('sourceScriptNodeId');
    expect(data(accepted, 'shared')).not.toHaveProperty('storyboardTitle');
    expect(data(accepted, 'shared').childNodeIds).toEqual(['child']);
    expect(data(accepted, 'child').scriptRowHiddenUuid).toBe('legacy-row');
    latestDrafts(accepted);
    expect(writer).toHaveBeenCalledOnce();
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.consumed).toHaveBeenCalledExactlyOnceWith(accepted, {
      explicitPromptNodeIds: [],
      removedNodeIds: [],
    });
    expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(accepted.nodes);
    expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(accepted.edges);
    expect(f.result.current.history.history.current).toHaveLength(1);
    const before = writer.mock.calls[0][0];
    act(() => f.result.current.history.undo());
    expect({
      nodes: f.currentDocument.current.nodes,
      edges: f.currentDocument.current.edges,
    }).toEqual(before);
    expect(data(f.currentDocument.current, 'shared').sourceScriptNodeId).toBe('first-script');
    act(() => f.result.current.history.redo());
    expect({
      nodes: f.currentDocument.current.nodes,
      edges: f.currentDocument.current.edges,
    }).toEqual({ nodes: accepted.nodes, edges: accepted.edges });
  });

  it('keeps the original single-edge default history and consumption interface', () => {
    const f = fixture();
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('first')).toBe(true));
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.currentDocument.current.edges.map((e) => e.id)).toEqual([
      'second',
      'ordinary-one',
      'ordinary-two',
    ]);
    latestDrafts(f.recordSnapshot.mock.calls[0][0]);
  });

  it('deletes an entire ordinary phase with one custom history and preserves unrelated storyboard bindings', () => {
    const f = fixture();
    const writer = vi.fn();
    act(() =>
      expect(
        f.result.current.actions.deleteEdges(['ordinary-two', 'ordinary-one'], {
          historyWriter: writer,
        }),
      ).toBe(true),
    );
    const accepted = f.currentDocument.current;
    expect(accepted.edges.map((e) => e.id)).toEqual(['first', 'second']);
    expect(data(accepted, 'first-script').linkedImageGroupId).toBe('shared');
    expect(data(accepted, 'shared').sourceScriptNodeId).toBe('first-script');
    expect(data(accepted, 'ordinary').params.imageList).toEqual([]);
    expect(writer).toHaveBeenCalledExactlyOnceWith(expect.any(Object), accepted);
    latestDrafts(writer.mock.calls[0][0]);
    latestDrafts(accepted);
    expect(f.acceptedOrdinary).toHaveBeenCalledExactlyOnceWith('last ordinary');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.setNodes).toHaveBeenCalledOnce();
    expect(f.setEdges).toHaveBeenCalledOnce();
    expect(f.graphWrites).toHaveBeenCalledExactlyOnceWith(accepted);
    const retry = f.result.current.drafts.project({ ...accepted, storageKey: 'doc' });
    expect(retry.nodes).toEqual(accepted.nodes);
    expect(retry.edges).toBe(accepted.edges);
  });

  it('projects a real pending 150ms prompt together with all script channels, then cancels its accepted timer', () => {
    vi.useFakeTimers();
    const f = fixture();
    const ref = createRef(),
      onChange = vi.fn();
    const page = render(
      <NodeGeneratorPrompt
        ref={ref}
        value="old ordinary"
        onChange={onChange}
        references={{ imageList: [] }}
        sessionKey="doc:ordinary"
      />,
    );
    const accept = vi.fn((value) => ref.current.acceptCommittedValue(value));
    f.result.current.drafts.register(
      'doc',
      'ordinary',
      () => ({
        writable: true,
        basePrompt: 'old ordinary',
        value: ref.current.getValue(),
      }),
      'default',
      accept,
    );
    const editor = screen.getByRole('textbox');
    editor.textContent = 'latest within 150ms';
    fireEvent.input(editor);
    expect(onChange).not.toHaveBeenCalled();
    const writer = vi.fn();
    act(() =>
      expect(
        f.result.current.actions.deleteEdges(['ordinary-one', 'ordinary-two'], {
          historyWriter: writer,
        }),
      ).toBe(true),
    );
    latestDrafts(writer.mock.calls[0][0], 'latest within 150ms');
    latestDrafts(f.currentDocument.current, 'latest within 150ms');
    expect(accept).toHaveBeenCalledExactlyOnceWith('latest within 150ms');
    const accepted = f.currentDocument.current;
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).not.toHaveBeenCalled();
    expect(writer).toHaveBeenCalledOnce();
    expect(f.currentDocument.current).toBe(accepted);
    expect(f.consumed).toHaveBeenCalledOnce();
    page.unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['group', 'text', 'script'])(
    'passes ui=false for an editing %s without applying ordinary group subtree deletion',
    (type) => {
      const f = fixture({ editingType: type });
      const writer = vi.fn();
      act(() =>
        expect(
          f.result.current.actions.deleteNodes(['editing'], {
            ui: false,
            reconcileGroupConsumers: true,
            historyWriter: writer,
          }),
        ).toBe(true),
      );
      const accepted = f.currentDocument.current;
      expect(accepted.nodes.map((n) => n.id)).toEqual([
        ...f.original.nodes.slice(0, -2).map((n) => n.id),
        'editing-child',
      ]);
      expect(accepted.nodes.find((n) => n.id === 'editing-child')).toMatchObject({
        position: { x: 320, y: 430 },
      });
      expect(accepted.nodes.find((n) => n.id === 'editing-child')).not.toHaveProperty('parentId');
      expect(accepted.edges.some((e) => e.id === 'editing-edge')).toBe(false);
      expect(writer).toHaveBeenCalledOnce();
      expect(f.recordSnapshot).not.toHaveBeenCalled();
      expect(f.consumed.mock.calls[0][1].removedNodeIds).toEqual(['editing']);
      latestDrafts(writer.mock.calls[0][0]);
    },
  );

  it('preserves the existing default ui=true group subtree behavior', () => {
    const f = fixture({ editingType: 'group' });
    act(() => expect(f.result.current.actions.deleteNodes(['editing'])).toBe(true));
    expect(f.currentDocument.current.nodes.some((n) => n.id === 'editing')).toBe(false);
    expect(f.currentDocument.current.nodes.some((n) => n.id === 'editing-child')).toBe(false);
    expect(f.recordSnapshot).toHaveBeenCalledOnce();
    expect(f.consumed.mock.calls[0][1].removedNodeIds).toEqual(['editing', 'editing-child']);
  });

  it('treats a throwing post-CAS history writer as an accepted edit, consumes once and never falls back or retries it', () => {
    const f = fixture();
    const writer = vi.fn((before, committed) => {
      expect(f.currentDocument.current).toBe(committed);
      f.result.current.history.recordSnapshot(before);
      throw new Error('history failed after recording');
    });
    act(() =>
      expect(
        f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
          historyWriter: writer,
        }),
      ).toBe(true),
    );
    const accepted = f.currentDocument.current;
    expect(accepted.edges.map((e) => e.id)).toEqual(['ordinary-one', 'ordinary-two']);
    expect(f.notify).toHaveBeenCalledExactlyOnceWith('画布变更已接受，但历史记录失败');
    expect(f.recordSnapshot).not.toHaveBeenCalled();
    expect(f.result.current.history.history.current).toHaveLength(1);
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(accepted.nodes);
    expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(accepted.edges);
    act(() =>
      expect(
        f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
          historyWriter: writer,
        }),
      ).toBe(false),
    );
    expect(f.currentDocument.current).toBe(accepted);
    expect(writer).toHaveBeenCalledOnce();
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.graphWrites).toHaveBeenCalledExactlyOnceWith(accepted);
  });

  it.each([1, 2, 3])(
    'a projection throw at call %s leaves every phase and pending channel available for retry',
    (failureAt) => {
      let fail = true;
      const f = fixture({
        project(next, _options, _current, call) {
          if (fail && call === failureAt) throw new Error('cannot read latest input');
          return next;
        },
      });
      const writer = vi.fn();
      act(() =>
        expect(
          f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
            historyWriter: writer,
          }),
        ).toBe(false),
      );
      expect(f.currentDocument.current).toBe(f.original);
      expect(writer).not.toHaveBeenCalled();
      noCommit(f);
      expect(f.ordinaryDraft.value).toBe('last ordinary');
      fail = false;
      act(() =>
        expect(
          f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
            historyWriter: writer,
          }),
        ).toBe(true),
      );
      latestDrafts(writer.mock.calls[0][0]);
      latestDrafts(f.currentDocument.current);
      expect(writer).toHaveBeenCalledOnce();
      expect(f.consumed).toHaveBeenCalledOnce();
    },
  );

  it.each(['nodes', 'edges', 'models', 'readonly', 'ready', 'documentKey'])(
    'a %s collision during the final projection preserves the winner and publishes no partial unlink',
    (field) => {
      let winner;
      const f = fixture({
        project(next, _options, current, call) {
          if (call === 3) {
            const changed =
              field === 'nodes'
                ? [...current.current.nodes, node('winner', 'text')]
                : field === 'edges'
                  ? [
                      ...current.current.edges,
                      { id: 'winner-edge', source: 'image-one', target: 'ordinary' },
                    ]
                  : field === 'models'
                    ? { ...current.current.models }
                    : field === 'readonly'
                      ? true
                      : field === 'ready'
                        ? false
                        : 'other-doc';
            winner = current.current = { ...current.current, [field]: changed };
          }
          return next;
        },
      });
      const writer = vi.fn();
      act(() =>
        expect(
          f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
            historyWriter: writer,
          }),
        ).toBe(false),
      );
      expect(f.currentDocument.current).toBe(winner);
      expect(data(winner, 'first-script').linkedImageGroupId).toBe('shared');
      expect(data(winner, 'shared').sourceScriptNodeId).toBe('first-script');
      expect(writer).not.toHaveBeenCalled();
      noCommit(f);
    },
  );

  it('validates all edges before any projection and rechecks every projected relation before committing', () => {
    const f = fixture();
    const writer = vi.fn();
    act(() =>
      expect(
        f.result.current.actions.unlinkStoryboardEdges(['first', 'ordinary-one'], {
          historyWriter: writer,
        }),
      ).toBe(false),
    );
    expect(f.projection).not.toHaveBeenCalled();
    noCommit(f);
    const changed = fixture({
      project(next) {
        return {
          ...next,
          nodes: next.nodes.map((n) =>
            n.id === 'second-script' ? { ...n, data: { ...n.data, type: 'script-v2' } } : n,
          ),
        };
      },
    });
    act(() =>
      expect(
        changed.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
          historyWriter: writer,
        }),
      ).toBe(false),
    );
    expect(changed.currentDocument.current).toBe(changed.original);
    expect(changed.projection).toHaveBeenCalledOnce();
    expect(writer).not.toHaveBeenCalled();
    noCommit(changed);
  });

  it.each([false, true])(
    'editing-priority introduced in %s raw/projected nodes rejects the whole storyboard phase',
    (projected) => {
      const addEditing = (graph) => ({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === 'shared'
            ? {
                ...n,
                data: {
                  ...n.data,
                  params: {
                    segmentRemakeLock: true,
                    segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'second-script' },
                  },
                },
              }
            : n,
        ),
      });
      const f = fixture({ project: projected ? addEditing : undefined });
      if (!projected) f.currentDocument.current = addEditing(f.original);
      const before = f.currentDocument.current;
      act(() =>
        expect(f.result.current.actions.unlinkStoryboardEdges(['first', 'second'])).toBe(false),
      );
      expect(f.currentDocument.current).toBe(before);
      expect(f.projection).toHaveBeenCalledTimes(projected ? 1 : 0);
      noCommit(f);
    },
  );
});

describe('captureDeletionSnapshot is a projected read, not a graph transaction', () => {
  it('captures ordinary, legacy, V2 generator and V2 row channels without consuming or publishing them', () => {
    const f = fixture();
    const before = f.result.current.actions.captureDeletionSnapshot();
    expect(Object.keys(before)).toEqual(['nodes', 'edges']);
    latestDrafts(before);
    expect(before.edges).toBe(f.original.edges);
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.graphWrites).not.toHaveBeenCalled();
    expect(f.projection).toHaveBeenCalledOnce();
    expect(f.acceptedOrdinary).not.toHaveBeenCalled();
    noCommit(f);
  });

  it.each(['throw', 'invalid', 'race'])(
    'returns null for %s projection while preserving the graph and all pending channels',
    (failure) => {
      let winner;
      const f = fixture({
        project(next, _options, current) {
          if (failure === 'throw') throw new Error('unavailable input');
          if (failure === 'invalid') return { nodes: null, edges: [] };
          winner = current.current = { ...current.current, edges: [...current.current.edges] };
          return next;
        },
      });
      expect(f.result.current.actions.captureDeletionSnapshot()).toBeNull();
      expect(f.currentDocument.current).toBe(failure === 'race' ? winner : f.original);
      expect(f.legacyDraft.value).toBe('last legacy');
      expect(f.rowDraft.scriptPrompts[0].value).toBe('last motion');
      noCommit(f);
    },
  );

  it.each([{ readonly: true }, { ready: false }, { documentKey: 'other-doc' }])(
    'blocks unavailable owner %j for capture and every deletion API',
    (patch) => {
      const f = fixture();
      f.currentDocument.current = { ...f.original, ...patch };
      const before = f.currentDocument.current;
      const writer = vi.fn();
      expect(f.result.current.actions.captureDeletionSnapshot()).toBeNull();
      expect(f.result.current.actions.deleteNodes(['child'], { historyWriter: writer })).toBe(
        false,
      );
      expect(
        f.result.current.actions.deleteEdges(['ordinary-one'], { historyWriter: writer }),
      ).toBe(false);
      expect(
        f.result.current.actions.unlinkStoryboardEdges(['first', 'second'], {
          historyWriter: writer,
        }),
      ).toBe(false);
      expect(f.currentDocument.current).toBe(before);
      expect(f.projection).not.toHaveBeenCalled();
      expect(writer).not.toHaveBeenCalled();
      noCommit(f);
    },
  );

  it('blocks retained callbacks after unmount and rejects an invalid custom history before CAS', () => {
    const f = fixture();
    const { captureDeletionSnapshot, deleteNodes, deleteEdges, unlinkStoryboardEdges } =
      f.result.current.actions;
    act(() => expect(deleteEdges(['ordinary-one'], { historyWriter: null })).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    noCommit(f);
    f.unmount();
    expect(captureDeletionSnapshot()).toBeNull();
    expect(deleteNodes(['child'])).toBe(false);
    expect(deleteEdges(['ordinary-one'])).toBe(false);
    expect(unlinkStoryboardEdges(['first', 'second'])).toBe(false);
    noCommit(f);
  });
});
