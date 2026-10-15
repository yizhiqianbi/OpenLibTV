import { useRef, useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import publicModels from '../../../../public/data/models.json';
import { useSnapshotHistory } from '../../editor/useSnapshotHistory.js';
import { createCanvasNode } from '../model.js';
import { useCanvasGraphActions } from './useCanvasGraphActions.js';
import { useCanvasDrafts } from './useCanvasDrafts.js';

const node = (id, type = 'image', data = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {
    type,
    action: `${type}_generate`,
    url: [`/${id}.${type === 'video' ? 'mp4' : 'png'}`],
    params: { model: publicModels.default[type], prompt: '' },
    ...data,
  },
});
const edge = (source, target, id = `${source}-${target}`) => ({ id, source, target });
const imageSchema = (maximum) => ({
  properties: {
    modeType: { items: { image2image: [0, maximum] } },
    quality: { component: 'input', default: 'source-default' },
    seed: { component: 'slider', min: 0, max: 100, default: 1 },
  },
  config: { settings: ['quality'], advancedSettings: ['seed'] },
});

function fixture({
  nodes: initialNodes = [node('a'), node('b'), node('target')],
  edges: initialEdges = [],
  models = publicModels,
  projectGraph,
} = {}) {
  const recorded = vi.fn(),
    notify = vi.fn();
  const page = renderHook(
    (owner) => {
      const [nodes, setNodes] = useState(initialNodes),
        [edges, setEdges] = useState(initialEdges),
        currentDocument = useRef(null);
      currentDocument.current = { ...owner, nodes, edges, models };
      const drafts = useCanvasDrafts({ storageKey: owner.documentKey, nodes, ready: owner.ready });
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
        documentKey: owner.documentKey,
        currentDocument,
        setNodes,
        setEdges,
        recordSnapshot: (snapshot) => {
          recorded(snapshot);
          history.recordSnapshot(snapshot);
        },
        notify,
        projectGraph:
          projectGraph === true
            ? (snapshot) => drafts.project({ ...snapshot, storageKey: owner.documentKey })
            : projectGraph
              ? (snapshot) => projectGraph(snapshot, currentDocument)
              : undefined,
      });
      return { actions, nodes, edges, currentDocument, drafts, ...history };
    },
    { initialProps: { documentKey: 'doc', ready: true, readonly: false } },
  );
  return { ...page, recorded, notify };
}

describe('atomic multi-selection graph connection actions', () => {
  it('appends all missing inputs once, preserves existing edges, and undoes or redoes the whole operation', () => {
    const initialNodes = [
        node('a'),
        node('b'),
        node('c'),
        node('target', 'video', {
          text: '旧文本不能替代空提示词',
          params: { model: 'kling-v3-omni', prompt: '', modeType: 'text2video' },
        }),
      ],
      existing = edge('a', 'target'),
      f = fixture({ nodes: initialNodes, edges: [existing] });
    const plan = f.result.current.actions.planMultiConnection({
      sourceIds: ['a', 'b', 'c', 'b'],
      targetId: 'target',
    });
    expect(plan).toMatchObject({ valid: true, edgeSourceIds: ['b', 'c'] });
    expect(f.recorded).not.toHaveBeenCalled();
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({
          sourceIds: ['a', 'b', 'c', 'b'],
          targetId: 'target',
        }),
      ).toBe(true);
    });
    const connected = f.result.current;
    expect(connected.edges[0]).toBe(existing);
    expect(connected.edges.map(({ source }) => source)).toEqual(['a', 'b', 'c']);
    expect(new Set(connected.edges.map(({ id }) => id)).size).toBe(3);
    expect(connected.nodes.at(-1).data.params).toMatchObject({
      model: 'star-video2.5',
      modeType: 'mixed2video',
      prompt: '',
    });
    expect(f.recorded).toHaveBeenCalledExactlyOnceWith({
      nodes: initialNodes,
      edges: [existing],
    });
    expect(connected.history.current).toHaveLength(1);
    act(() => f.result.current.undo());
    expect(f.result.current.nodes).toEqual(initialNodes);
    expect(f.result.current.edges).toEqual([existing]);
    expect(f.result.current.history.current).toHaveLength(0);
    act(() => f.result.current.redo());
    expect(f.result.current.nodes).toEqual(connected.nodes);
    expect(f.result.current.edges).toEqual(connected.edges);
  });

  it('selects a model for the aggregate input count and records its parameter patch with all edges', () => {
    const models = {
        default: { image: 'old' },
        imageModels: { old: imageSchema(1), new: imageSchema(3) },
        support: { image: ['old', 'new'] },
      },
      initialNodes = [
        node('a'),
        node('b'),
        node('target', 'image', {
          params: {
            model: 'old',
            prompt: '保留当前提示词',
            modeType: 'image2image',
            quality: 'previous',
            count: 3,
            advancedSettings: { seed: 23 },
          },
        }),
      ],
      f = fixture({ nodes: initialNodes, models });
    expect(
      f.result.current.actions.planMultiConnection({ sourceIds: ['a', 'b'], targetId: 'target' }),
    ).toMatchObject({ valid: true, targetPatch: { params: { model: 'new' } } });
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(true);
    });
    expect(f.result.current.nodes.at(-1).data.params).toMatchObject({
      model: 'new',
      prompt: '保留当前提示词',
      modeType: 'image2image',
      quality: 'source-default',
      count: 3,
      advancedSettings: { seed: 23 },
    });
    expect(f.result.current.edges).toHaveLength(2);
    expect(f.recorded).toHaveBeenCalledOnce();
    act(() => f.result.current.undo());
    expect(f.result.current.nodes).toEqual(initialNodes);
    expect(f.result.current.edges).toEqual([]);
  });

  it('rejects the whole set when one input is incompatible without leaving an eligible first edge', () => {
    const initialNodes = [node('a'), node('b', 'video'), node('target')],
      f = fixture({ nodes: initialNodes });
    expect(
      f.result.current.actions.planMultiConnection({ sourceIds: ['a', 'b'], targetId: 'target' })
        .valid,
    ).toBe(false);
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(false);
    });
    expect(f.result.current.nodes).toBe(initialNodes);
    expect(f.result.current.edges).toEqual([]);
    expect(f.recorded).not.toHaveBeenCalled();
  });

  it('rejects aggregate capacity even when either image alone would fit the current catalogue', () => {
    const models = {
        default: { image: 'one' },
        imageModels: { one: imageSchema(1) },
        support: { image: ['one'] },
      },
      initialNodes = [
        node('a'),
        node('b'),
        node('target', 'image', { params: { model: 'one', prompt: '保留' } }),
      ],
      f = fixture({ nodes: initialNodes, models });
    expect(
      f.result.current.actions.planMultiConnection({ sourceIds: ['a', 'b'], targetId: 'target' })
        .valid,
    ).toBe(false);
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(false);
    });
    expect(f.result.current.nodes).toBe(initialNodes);
    expect(f.result.current.edges).toEqual([]);
    expect(f.recorded).not.toHaveBeenCalled();
  });

  it('returns false quietly when every source is already connected so a drop can open creation', () => {
    const initialEdges = [edge('a', 'target'), edge('b', 'target')],
      f = fixture({ edges: initialEdges });
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(false);
    });
    expect(f.result.current.edges).toBe(initialEdges);
    expect(f.recorded).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
  });

  it('creates a shared target and all its inputs at the exact position in one undo item', () => {
    const initialNodes = [node('a'), node('b')],
      f = fixture({ nodes: initialNodes }),
      created = createCanvasNode({
        type: 'video',
        label: '视频',
        nodes: initialNodes,
        models: publicModels,
        position: { x: 0, y: 0 },
        makeId: () => 'created',
      });
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({
          sourceIds: ['a', 'b'],
          targetId: created.id,
          newNode: created,
        }),
      ).toBe(true);
    });
    const connected = f.result.current;
    expect(connected.nodes).toHaveLength(3);
    expect(connected.nodes.at(-1)).toMatchObject({
      id: 'created',
      position: { x: 0, y: 0 },
      data: { params: { prompt: '' } },
    });
    expect(connected.edges.map(({ source, target }) => ({ source, target }))).toEqual([
      { source: 'a', target: 'created' },
      { source: 'b', target: 'created' },
    ]);
    expect(f.recorded).toHaveBeenCalledExactlyOnceWith({ nodes: initialNodes, edges: [] });
    act(() => f.result.current.undo());
    expect(f.result.current.nodes).toEqual(initialNodes);
    expect(f.result.current.edges).toEqual([]);
    act(() => f.result.current.redo());
    expect(f.result.current.nodes).toEqual(connected.nodes);
    expect(f.result.current.edges).toEqual(connected.edges);
  });

  it.each(['incompatible', 'duplicate-id', 'missing-source', 'wrong-target'])(
    'leaves no orphan target or history entry after a %s creation failure',
    (failure) => {
      const initialNodes = [node('a'), node('b', failure === 'incompatible' ? 'video' : 'image')],
        f = fixture({ nodes: initialNodes }),
        created = createCanvasNode({
          type: 'image',
          label: '图片',
          nodes: initialNodes,
          models: publicModels,
          position: { x: 12, y: 34 },
          makeId: () => (failure === 'duplicate-id' ? 'a' : 'created'),
        });
      act(() => {
        expect(
          f.result.current.actions.connectMultiNodes({
            sourceIds: failure === 'missing-source' ? ['a', 'missing'] : ['a', 'b'],
            targetId: failure === 'wrong-target' ? 'a' : created.id,
            newNode: created,
          }),
        ).toBe(false);
      });
      expect(f.result.current.nodes).toBe(initialNodes);
      expect(f.result.current.edges).toEqual([]);
      expect(f.recorded).not.toHaveBeenCalled();
    },
  );

  it.each([{ ready: false }, { readonly: true }, { documentKey: 'other' }])(
    'rejects plan and creation callbacks for an unavailable graph owner %j',
    (patch) => {
      const f = fixture(),
        originalGraph = f.result.current.currentDocument.current;
      f.result.current.currentDocument.current = { ...originalGraph, ...patch };
      expect(
        f.result.current.actions.planMultiConnection({
          sourceIds: ['a', 'b'],
          targetId: 'target',
        }).valid,
      ).toBe(false);
      act(() => {
        expect(
          f.result.current.actions.connectMultiNodes({
            sourceIds: ['a', 'b'],
            targetId: 'target',
          }),
        ).toBe(false);
        expect(
          f.result.current.actions.connectMultiNodes({
            sourceIds: ['a', 'b'],
            targetId: 'created',
            newNode: { ...node('created'), data: { ...node('created').data, url: [] } },
          }),
        ).toBe(false);
      });
      expect(f.result.current.nodes).toBe(originalGraph.nodes);
      expect(f.result.current.edges).toBe(originalGraph.edges);
      expect(f.recorded).not.toHaveBeenCalled();
    },
  );

  it('refuses previously captured multi callbacks after switching the document or unmounting', () => {
    const f = fixture(),
      oldActions = f.result.current.actions;
    f.rerender({ documentKey: 'next', ready: true, readonly: false });
    expect(
      oldActions.planMultiConnection({ sourceIds: ['a', 'b'], targetId: 'target' }).valid,
    ).toBe(false);
    expect(oldActions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' })).toBe(false);
    const mountedActions = f.result.current.actions;
    f.unmount();
    expect(
      mountedActions.planMultiConnection({ sourceIds: ['a', 'b'], targetId: 'target' }).valid,
    ).toBe(false);
    expect(mountedActions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' })).toBe(
      false,
    );
    expect(f.recorded).not.toHaveBeenCalled();
  });

  it.each(['nodes', 'edges', 'models'])(
    'rejects a plan whose %s identity changed before its graph commit',
    (changed) => {
      const models = {
          default: { image: 'old' },
          imageModels: { old: imageSchema(1), new: imageSchema(3) },
          support: {},
        },
        initialNodes = [
          node('a'),
          node('b'),
          node('target', 'image', { params: { model: 'old', prompt: '当前输入' } }),
        ],
        f = fixture({ nodes: initialNodes, models });
      let replacement;
      Object.defineProperty(models.support, 'image', {
        get: () => {
          const graph = f.result.current.currentDocument.current;
          replacement ||= {
            nodes: [...graph.nodes, node('concurrent')],
            edges: [...graph.edges, edge('concurrent', 'target')],
            models: { ...models },
          }[changed];
          f.result.current.currentDocument.current = { ...graph, [changed]: replacement };
          return ['old', 'new'];
        },
      });
      act(() => {
        expect(
          f.result.current.actions.connectMultiNodes({
            sourceIds: ['a', 'b'],
            targetId: 'target',
          }),
        ).toBe(false);
      });
      expect(f.result.current.currentDocument.current[changed]).toBe(replacement);
      expect(f.result.current.nodes).toBe(initialNodes);
      expect(f.result.current.edges).toEqual([]);
      expect(f.recorded).not.toHaveBeenCalled();
    },
  );

  it('keeps grouped sources in their parent-relative positions when connecting their world selection', () => {
    const group = { id: 'group', type: 'group', position: { x: 600, y: 400 }, data: {} },
      child = { ...node('a'), parentId: 'group', position: { x: 20, y: 30 } },
      initialNodes = [group, child, node('b'), node('target')],
      f = fixture({ nodes: initialNodes });
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(true);
    });
    expect(f.result.current.nodes[0]).toBe(group);
    expect(f.result.current.nodes[1]).toBe(child);
    expect(f.result.current.nodes[1]).toMatchObject({
      parentId: 'group',
      position: { x: 20, y: 30 },
    });
    expect(f.result.current.edges.map(({ source }) => source)).toEqual(['a', 'b']);
  });

  it('merges retained input drafts into the committed graph and its undo snapshot before save acknowledgement', () => {
    const initialNodes = [node('a'), node('b'), node('target'), node('second')],
      f = fixture({ nodes: initialNodes, projectGraph: true });
    for (const id of ['a', 'target']) {
      const unregister = f.result.current.drafts.register('doc', id, () => ({
        writable: true,
        basePrompt: '',
        value: `未到150ms的${id}输入`,
      }));
      unregister();
    }
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(true);
    });
    const prompt = (nodes, id) => nodes.find((item) => item.id === id).data.params.prompt;
    for (const id of ['a', 'target']) {
      expect(prompt(f.result.current.nodes, id)).toBe(`未到150ms的${id}输入`);
      expect(prompt(f.recorded.mock.lastCall[0].nodes, id)).toBe(`未到150ms的${id}输入`);
      expect(prompt(f.result.current.currentDocument.current.nodes, id)).toBe(
        `未到150ms的${id}输入`,
      );
    }
    const saved = f.result.current.drafts.project({
      storageKey: 'doc',
      nodes: f.result.current.nodes,
      edges: f.result.current.edges,
    });
    f.result.current.drafts.acknowledge(saved);
    act(() => {
      expect(f.result.current.actions.connectNodes({ sourceId: 'a', targetId: 'second' })).toBe(
        true,
      );
    });
    expect(prompt(f.result.current.nodes, 'a')).toBe('未到150ms的a输入');
    expect(prompt(f.result.current.nodes, 'target')).toBe('未到150ms的target输入');
    act(() => f.result.current.undo());
    act(() => f.result.current.undo());
    expect(f.result.current.edges).toEqual([]);
    expect(prompt(f.result.current.nodes, 'a')).toBe('未到150ms的a输入');
    expect(prompt(f.result.current.nodes, 'target')).toBe('未到150ms的target输入');
    expect(f.result.current.drafts.project({ ...saved, nodes: f.result.current.nodes }).nodes).toBe(
      f.result.current.nodes,
    );
  });

  it.each([
    () => {
      throw new Error('Draft read failed');
    },
    () => ({ nodes: [], edges: null }),
  ])('does not publish any graph or history when draft projection fails', (projectGraph) => {
    const f = fixture({ projectGraph }),
      graph = f.result.current.currentDocument.current;
    act(() => {
      expect(
        f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
      ).toBe(false);
    });
    expect(f.result.current.currentDocument.current).toBe(graph);
    expect(f.result.current.nodes).toBe(graph.nodes);
    expect(f.result.current.edges).toBe(graph.edges);
    expect(f.recorded).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledOnce();
  });

  it.each(['nodes', 'edges', 'models'])(
    'rechecks raw graph %s identity after draft projection',
    (changed) => {
      let replacement;
      const f = fixture({
          projectGraph: (snapshot, currentDocument) => {
            const graph = currentDocument.current;
            replacement ||= {
              nodes: [...graph.nodes],
              edges: [...graph.edges],
              models: { ...graph.models },
            }[changed];
            currentDocument.current = { ...graph, [changed]: replacement };
            return snapshot;
          },
        }),
        graph = f.result.current.currentDocument.current;
      act(() => {
        expect(
          f.result.current.actions.connectMultiNodes({ sourceIds: ['a', 'b'], targetId: 'target' }),
        ).toBe(false);
      });
      expect(f.result.current.currentDocument.current[changed]).toBe(replacement);
      expect(f.result.current.nodes).toBe(graph.nodes);
      expect(f.result.current.edges).toBe(graph.edges);
      expect(f.recorded).not.toHaveBeenCalled();
    },
  );
});
