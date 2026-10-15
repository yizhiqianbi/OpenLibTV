import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import models from '../../../../public/data/models.json';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import {
  fingerprintScriptPromptBundle,
  getScriptPromptBundle,
} from '../storyboard/prompt-compose-model.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

function fixture(project) {
  const nodes = [
    {
      id: 'script',
      type: 'script',
      position: { x: 20, y: 30 },
      data: {
        type: 'script',
        name: 'legacy script',
        linkedImageGroupId: 'group',
        linkedVideoGroupId: 'other-video-group',
        params: { prompt: 'old legacy input', settings: { retained: true } },
        rows: [
          {
            id: 'legacy-row',
            hiddenUuid: 'legacy-hidden',
            shotNumber: 10,
            plotDescription: 'legacy raw plot',
          },
        ],
      },
    },
    {
      id: 'group',
      type: 'group',
      position: { x: 1000, y: 400 },
      width: 800,
      height: 400,
      data: {
        type: 'group',
        sourceScriptNodeId: 'script',
        sourceScriptVersion: 'v1',
        storyboardGroupType: 'image',
        storyboardTitle: 'linked title',
        childNodeIds: ['child'],
      },
    },
    {
      id: 'child',
      type: 'image',
      parentId: 'group',
      position: { x: 20, y: 30 },
      data: { type: 'image', scriptRowHiddenUuid: 'legacy-hidden', url: ['/source.webp'] },
    },
    {
      id: 'v2',
      type: 'script-v2',
      data: {
        type: 'script-v2',
        name: 'independent V2',
        params: { prompt: 'old v2 input' },
        assets: { characters: [], scenes: [], props: [] },
        rows: [
          {
            id: 'v2-row',
            hiddenUuid: 'v2-hidden',
            shotNumber: 30,
            plotDescription: 'v2 raw plot',
            videoMotionPrompt: 'old row motion',
          },
        ],
      },
    },
  ];
  const original = {
    documentKey: 'doc',
    ready: true,
    readonly: false,
    nodes,
    edges: [{ id: 'edge', source: 'script', target: 'group' }],
    models,
  };
  const currentDocument = { current: original };
  let historyApi, publishNodes, publishEdges;
  const recordSnapshot = vi.fn((snapshot) => historyApi.recordSnapshot(snapshot));
  const setNodes = vi.fn((next) => publishNodes(next));
  const setEdges = vi.fn((next) => publishEdges(next));
  const consumed = vi.fn(),
    projection = vi.fn(),
    notify = vi.fn();
  const pending = { writable: true, basePrompt: 'old legacy input', value: 'last legacy input' };
  const v2Pending = { writable: true, basePrompt: 'old v2 input', value: 'last v2 input' };
  const rowDraft = {
    writable: true,
    scriptPrompts: [
      {
        rowId: 'v2-row',
        track: 'video',
        value: 'last row motion',
        baseFingerprint: fingerprintScriptPromptBundle(
          getScriptPromptBundle(nodes[3].data.rows[0], 'video'),
        ),
      },
    ],
  };
  const hook = renderHook(() => {
    const [currentNodes, setCurrentNodes] = useState(nodes);
    const [currentEdges, setCurrentEdges] = useState(original.edges);
    publishNodes = setCurrentNodes;
    publishEdges = setCurrentEdges;
    const history = useSnapshotHistory(
      { nodes: currentNodes, edges: currentEdges },
      {
        restore(snapshot) {
          currentDocument.current = {
            ...currentDocument.current,
            nodes: snapshot.nodes,
            edges: snapshot.edges,
          };
          setCurrentNodes(snapshot.nodes);
          setCurrentEdges(snapshot.edges);
        },
      },
    );
    historyApi = history;
    const drafts = useCanvasDrafts({ storageKey: 'doc', nodes: currentNodes, ready: true });
    const actions = useCanvasGraphActions({
      documentKey: 'doc',
      currentDocument,
      recordSnapshot,
      setNodes,
      setEdges,
      notify,
      projectGraph(snapshot, options) {
        projection(snapshot, options);
        const next = drafts.project({ ...snapshot, storageKey: 'doc' }, options);
        return project ? project(next, options, currentDocument) : next;
      },
      consumeDrafts(snapshot, options) {
        consumed(snapshot, options);
        drafts.consume({ ...snapshot, storageKey: 'doc' }, options);
      },
    });
    return { actions, drafts, history };
  });
  const reads = vi.fn(() => pending);
  hook.result.current.drafts.register('doc', 'script', reads);
  hook.result.current.drafts.register('doc', 'v2', () => v2Pending, 'script-generator');
  hook.result.current.drafts.register('doc', 'v2', () => rowDraft, 'default');
  const baseline = {
    nodes: original.nodes.map((node) =>
      node.id === 'script'
        ? {
            ...node,
            data: { ...node.data, params: { ...node.data.params, prompt: 'last legacy input' } },
          }
        : node.id === 'v2'
          ? {
              ...node,
              data: {
                ...node.data,
                params: { ...node.data.params, prompt: 'last v2 input' },
                rows: [
                  {
                    ...node.data.rows[0],
                    videoMotionPrompt: 'last row motion',
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
    recordSnapshot,
    setNodes,
    setEdges,
    consumed,
    projection,
    notify,
    pending,
    v2Pending,
    rowDraft,
    baseline,
    reads,
  };
}

function noPublication(f) {
  expect(f.recordSnapshot).not.toHaveBeenCalled();
  expect(f.setNodes).not.toHaveBeenCalled();
  expect(f.setEdges).not.toHaveBeenCalled();
  expect(f.consumed).not.toHaveBeenCalled();
  expect(f.result.current.history.history.current).toHaveLength(0);
}
function stillPending(f) {
  expect(f.pending.value).toBe('last legacy input');
  expect(f.v2Pending.value).toBe('last v2 input');
  expect(f.rowDraft.scriptPrompts[0].value).toBe('last row motion');
  const projected = f.result.current.drafts.project({ ...f.original, storageKey: 'doc' });
  expect({ nodes: projected.nodes, edges: projected.edges }).toEqual(f.baseline);
}

describe('public storyboard unlink API, actual drafts and snapshot history', () => {
  it('commits both bindings and all latest prompt/row drafts in one graph CAS and real undo/redo', () => {
    const f = fixture();
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(true));
    const next = f.currentDocument.current;
    const expected = {
      nodes: f.baseline.nodes.map((node) => {
        if (node.id === 'script') {
          const { linkedImageGroupId: _link, ...data } = node.data;
          return { ...node, data };
        }
        if (node.id === 'group') {
          const { sourceScriptNodeId: _source, storyboardTitle: _title, ...data } = node.data;
          return { ...node, data };
        }
        return node;
      }),
      edges: [],
    };
    expect({ nodes: next.nodes, edges: next.edges }).toEqual(expected);
    expect(f.recordSnapshot).toHaveBeenCalledExactlyOnceWith(f.baseline);
    expect(f.setNodes).toHaveBeenCalledExactlyOnceWith(next.nodes);
    expect(f.setEdges).toHaveBeenCalledExactlyOnceWith(next.edges);
    expect(f.consumed).toHaveBeenCalledOnce();
    expect(f.result.current.history.history.current).toHaveLength(1);
    const retried = f.result.current.drafts.project({ ...next, storageKey: 'doc' });
    expect({ nodes: retried.nodes, edges: retried.edges }).toEqual(expected);
    act(() => f.result.current.history.undo());
    expect({
      nodes: f.currentDocument.current.nodes,
      edges: f.currentDocument.current.edges,
    }).toEqual(f.baseline);
    expect(f.result.current.history.history.current).toHaveLength(0);
    act(() => f.result.current.history.redo());
    expect({
      nodes: f.currentDocument.current.nodes,
      edges: f.currentDocument.current.edges,
    }).toEqual(expected);
    expect(f.result.current.history.future.current).toHaveLength(0);
  });

  it('direct public unlink rejects an editing-priority target without projecting, consuming or publishing anything', () => {
    const f = fixture();
    const current = {
      ...f.original,
      nodes: f.original.nodes.map((node) =>
        node.id === 'group'
          ? {
              ...node,
              data: {
                ...node.data,
                params: {
                  segmentRemakeLock: true,
                  segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'script' },
                },
              },
            }
          : node,
      ),
    };
    f.currentDocument.current = current;
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(false));
    expect(f.currentDocument.current).toBe(current);
    expect(f.projection).not.toHaveBeenCalled();
    noPublication(f);
    stillPending(f);
  });

  it('rechecks editing priority introduced by the fresh draft projection before invoking the dedicated unlink plan', () => {
    const f = fixture((next) => ({
      ...next,
      nodes: next.nodes.map((node) =>
        node.id === 'group'
          ? {
              ...node,
              data: {
                ...node.data,
                params: {
                  segmentRemakeLock: true,
                  segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'script' },
                },
              },
            }
          : node,
      ),
    }));
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.projection).toHaveBeenCalledOnce();
    noPublication(f);
    stillPending(f);
  });

  it('preflight projection failure keeps the untouched graph and every pending channel available for retry', () => {
    const f = fixture(() => {
      throw new Error('unreadable input');
    });
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法删除，请重试');
    noPublication(f);
    stillPending(f);
  });

  it('a compare-and-swap collision during next projection preserves the competing graph with no history or draft consumption', () => {
    let competing;
    const f = fixture((next, options, current) => {
      if (Array.isArray(options?.explicitPromptNodeIds))
        current.current = competing = {
          ...current.current,
          nodes: [
            ...current.current.nodes,
            { id: 'concurrent', type: 'text', data: { content: ['winner'] } },
          ],
        };
      return next;
    });
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(false));
    expect(f.currentDocument.current).toBe(competing);
    expect(competing.edges).toBe(f.original.edges);
    expect(competing.nodes[0].data.linkedImageGroupId).toBe('group');
    expect(competing.nodes[1].data.sourceScriptNodeId).toBe('script');
    noPublication(f);
    stillPending(f);
  });

  it('commit projection failure cannot publish partial unlink fields or consume projected drafts', () => {
    const f = fixture((next, options) => {
      if (Array.isArray(options?.explicitPromptNodeIds))
        throw new Error('next graph projection failed');
      return next;
    });
    act(() => expect(f.result.current.actions.unlinkStoryboardEdge('edge')).toBe(false));
    expect(f.currentDocument.current).toBe(f.original);
    expect(f.original.nodes[0].data.linkedImageGroupId).toBe('group');
    expect(f.original.nodes[1].data.storyboardTitle).toBe('linked title');
    expect(f.notify).toHaveBeenCalledWith('当前画布草稿无法保存，请重试');
    noPublication(f);
    stillPending(f);
  });
});
