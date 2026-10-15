import { useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';

const initialNodes = ['upstream', 'a', 'b', 'downstream'].map((id, index) => ({
  id,
  type: 'text',
  position: { x: index * 400, y: 20 },
  data: { type: 'text', name: id, action: 'text_generate', params: { prompt: `${id}原始正文` } },
}));
const initialEdges = [
  { id: 'incoming', source: 'upstream', target: 'a' },
  { id: 'internal', source: 'a', target: 'b' },
  { id: 'outgoing', source: 'b', target: 'downstream' },
];

function fixture(projectGraph = true, graph = {}) {
  const recorded = vi.fn(),
    notify = vi.fn();
  const page = renderHook(() => {
    const [nodes, setNodes] = useState(graph.nodes || initialNodes),
      [edges, setEdges] = useState(graph.edges || initialEdges);
    const currentDocument = useRef();
    currentDocument.current = { documentKey: 'doc', ready: true, readonly: false, nodes, edges };
    const drafts = useCanvasDrafts({ storageKey: 'doc', nodes, ready: true });
    const history = useSnapshotHistory(
      { nodes, edges },
      {
        restore: (snapshot) => {
          setNodes(snapshot.nodes);
          setEdges(snapshot.edges);
        },
      },
    );
    const actions = useCanvasGraphActions({
      documentKey: 'doc',
      currentDocument,
      setNodes,
      setEdges,
      notify,
      recordSnapshot: (snapshot) => {
        recorded(snapshot);
        history.recordSnapshot(snapshot);
      },
      projectGraph:
        projectGraph === true
          ? (snapshot) => drafts.project({ ...snapshot, storageKey: 'doc' })
          : projectGraph && ((snapshot) => projectGraph(snapshot, currentDocument)),
    });
    return { actions, currentDocument, nodes, edges, drafts, ...history };
  });
  const command = (patch = {}) => ({
    documentKey: 'doc',
    sourceIds: ['a', 'b'],
    expectedNodes: page.result.current.nodes,
    expectedEdges: page.result.current.edges,
    ...patch,
  });
  return { ...page, command, recorded, notify };
}

describe('Alt selection-copy graph transaction', () => {
  it.each([false, true])(
    'single mode carries only upstream edges when copyEdges=%s',
    (copyEdges) => {
      const f = fixture();
      let copied;
      act(() => {
        copied = f.result.current.actions.createDragCopy(
          f.command({ copyMode: 'single', sourceIds: ['a'], copyEdges }),
        );
      });
      expect(copied.newAllIds).toHaveLength(1);
      const copy = f.result.current.nodes.at(-1);
      expect(copy.position).toEqual(initialNodes[1].position);
      expect(copy.data.name).toBe('a 副本');
      expect(f.result.current.nodes.slice(0, 4)).toEqual(initialNodes);
      expect(f.result.current.edges.slice(0, 3)).toEqual(initialEdges);
      expect(f.result.current.edges.slice(3).map(({ source, target }) => [source, target])).toEqual(
        copyEdges ? [['upstream', copy.id]] : [],
      );
      expect(f.recorded).toHaveBeenCalledOnce();
      act(() => f.result.current.undo());
      expect(f.result.current.nodes).toEqual(initialNodes);
      expect(f.result.current.edges).toEqual(initialEdges);
      act(() => f.result.current.redo());
      expect(f.result.current.nodes.at(-1)).toEqual(copy);
    },
  );

  it('single child detaches at its world position and clones unflushed input without copying the group', () => {
    const group = {
      id: 'group',
      type: 'group',
      position: { x: 80, y: 120 },
      data: { type: 'group', childNodeIds: ['a'] },
    };
    const child = {
      ...initialNodes[1],
      parentId: 'group',
      extent: 'parent',
      position: { x: 30, y: 40 },
    };
    const f = fixture(true, { nodes: [group, child], edges: [] });
    f.result.current.drafts.register('doc', 'a', () => ({
      writable: true,
      basePrompt: 'a原始正文',
      value: '尚未提交的新正文',
    }));
    act(() =>
      expect(
        f.result.current.actions.createDragCopy(
          f.command({ copyMode: 'single', sourceIds: ['a'] }),
        ),
      ).toBeTruthy(),
    );
    expect(f.result.current.nodes).toHaveLength(3);
    const copy = f.result.current.nodes.at(-1);
    expect(copy.position).toEqual({ x: 110, y: 160 });
    expect(copy).not.toHaveProperty('parentId');
    expect(copy).not.toHaveProperty('extent');
    expect(copy.data).toMatchObject({
      name: 'a',
      canvasAltDetachedCopy: true,
      params: { prompt: '尚未提交的新正文' },
    });
    expect(f.result.current.nodes[0]).toEqual(group);
    expect(f.result.current.nodes[1].position).toEqual(child.position);
    act(() => f.result.current.undo());
    expect(f.result.current.nodes).toHaveLength(2);
    expect(f.result.current.nodes[1].data.params.prompt).toBe('尚未提交的新正文');
  });

  it.each([
    { copyMode: 'unknown' },
    { copyMode: 'single', sourceIds: [] },
    { copyMode: 'single', sourceIds: ['a', 'b'] },
    { copyMode: 'single', sourceIds: [null] },
    { copyMode: 'single', sourceIds: ['missing'] },
  ])('rejects malformed copy mode and selection atomically: %o', (patch) => {
    const f = fixture();
    act(() => expect(f.result.current.actions.createDragCopy(f.command(patch))).toBe(false));
    expect(f.result.current.nodes).toBe(initialNodes);
    expect(f.result.current.edges).toBe(initialEdges);
    expect(f.recorded).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'commits copies with copyEdges=%s and undoes or redoes the entire transaction once',
    (copyEdges) => {
      const f = fixture();
      let copied;
      act(() => {
        copied = f.result.current.actions.createDragCopy(f.command({ copyEdges }));
      });
      expect(copied.newTopLevelIds).toHaveLength(2);
      expect(f.result.current.nodes.slice(0, 4)).toEqual(initialNodes);
      expect(f.result.current.nodes.slice(4).map((node) => node.position)).toEqual(
        initialNodes.slice(1, 3).map((node) => node.position),
      );
      expect(f.result.current.edges.slice(0, 3)).toEqual(initialEdges);
      expect(f.result.current.edges).toHaveLength(copyEdges ? 5 : 3);
      if (copyEdges)
        expect(
          f.result.current.edges.slice(3).map(({ source, target }) => [source, target]),
        ).toEqual([
          ['upstream', copied.newAllIds[0]],
          [copied.newAllIds[0], copied.newAllIds[1]],
        ]);
      const committed = { nodes: f.result.current.nodes, edges: f.result.current.edges };
      expect(f.recorded).toHaveBeenCalledExactlyOnceWith({
        nodes: initialNodes,
        edges: initialEdges,
      });
      act(() => f.result.current.undo());
      expect(f.result.current.nodes).toEqual(initialNodes);
      expect(f.result.current.edges).toEqual(initialEdges);
      expect(f.result.current.history.current).toHaveLength(0);
      act(() => f.result.current.redo());
      expect(f.result.current.nodes).toEqual(committed.nodes);
      expect(f.result.current.edges).toEqual(committed.edges);
    },
  );

  it('clones the latest unflushed input and retains that draft in originals and the undo snapshot', () => {
    const f = fixture();
    f.result.current.drafts.register('doc', 'a', () => ({
      writable: true,
      basePrompt: 'a原始正文',
      value: '最后150ms尚未提交的输入',
    }));
    act(() => expect(f.result.current.actions.createDragCopy(f.command())).toBeTruthy());
    expect(f.result.current.nodes.find((node) => node.id === 'a').data.params.prompt).toBe(
      '最后150ms尚未提交的输入',
    );
    expect(f.result.current.nodes[4].data.params.prompt).toBe('最后150ms尚未提交的输入');
    act(() => f.result.current.undo());
    expect(f.result.current.nodes.find((node) => node.id === 'a').data.params.prompt).toBe(
      '最后150ms尚未提交的输入',
    );
    expect(f.result.current.nodes).toHaveLength(4);
  });

  it.each(['nodes', 'edges', 'document', 'readonly', 'loading', 'unmounted'])(
    'rejects a stale %s owner without partial insertion or history',
    (kind) => {
      const f = fixture(),
        command = f.command(),
        before = f.result.current.currentDocument.current;
      if (kind === 'unmounted') f.unmount();
      else
        f.result.current.currentDocument.current = {
          ...before,
          ...(kind === 'nodes' ? { nodes: [...before.nodes] } : {}),
          ...(kind === 'edges' ? { edges: [...before.edges] } : {}),
          ...(kind === 'document' ? { documentKey: 'other' } : {}),
          ...(kind === 'readonly' ? { readonly: true } : {}),
          ...(kind === 'loading' ? { ready: false } : {}),
        };
      const latest = f.result.current.currentDocument.current;
      act(() => expect(f.result.current.actions.createDragCopy(command)).toBe(false));
      expect(f.result.current.currentDocument.current).toBe(latest);
      expect(f.recorded).not.toHaveBeenCalled();
    },
  );

  it.each(['throw', 'invalid', 'changedGraph'])(
    'leaves no copied IDs or undo item after %s during draft projection',
    (kind) => {
      const f = fixture((snapshot, ref) => {
        if (kind === 'throw') throw new Error('draft failed');
        if (kind === 'invalid') return { nodes: null, edges: [] };
        ref.current = { ...ref.current, nodes: [...ref.current.nodes] };
        return snapshot;
      });
      act(() => expect(f.result.current.actions.createDragCopy(f.command())).toBe(false));
      expect(f.result.current.currentDocument.current.nodes).toHaveLength(4);
      expect(f.result.current.currentDocument.current.edges).toEqual(initialEdges);
      expect(f.recorded).not.toHaveBeenCalled();
      if (kind !== 'changedGraph') expect(f.notify).toHaveBeenCalledOnce();
    },
  );
});
