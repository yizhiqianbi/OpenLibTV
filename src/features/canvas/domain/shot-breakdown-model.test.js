import { describe, expect, it } from 'vitest';
import {
  collectShotBreakdownSource,
  describeShotBreakdownReferencePick,
  getShotBreakdownDimensions,
  planShotBreakdownReferencePick,
} from './shot-breakdown-model.js';

const target = () => ({ id: 'shot', type: 'shot-breakdown', data: { type: 'shot-breakdown' } });
const video = (id, url = `/${id}.mp4`, data = {}) => ({
  id,
  type: 'video',
  data: { type: 'video', url: [url], name: id, ...data },
});

describe('source ShotBreakdown projection and reference replacement', () => {
  it('defaults the three exact source keys, preserving an explicit empty selection', () => {
    expect(getShotBreakdownDimensions({})).toEqual(['storyboard', 'cameraMoves', 'musicRef']);
    expect(getShotBreakdownDimensions({ dimensions: null })).toEqual([
      'storyboard',
      'cameraMoves',
      'musicRef',
    ]);
    expect(getShotBreakdownDimensions({ dimensions: [] })).toEqual([]);
    expect(getShotBreakdownDimensions({ dimensions: ['musicRef', 'unknown'] })).toEqual([
      'musicRef',
      'unknown',
    ]);
  });

  it('projects the collector first video, using actual source metadata and never a local override', () => {
    const shot = target();
    shot.data.shotBreakdownSource = { url: '/fake.mp4' };
    const first = {
      ...video('a'),
      resourceMeta: { items: [{ kind: 'video', width: 1920, height: 1080, durationSec: 8 }] },
    };
    expect(
      collectShotBreakdownSource({
        node: shot,
        nodes: [shot, first, video('b')],
        edges: [
          { id: 'a', source: 'a', target: 'shot' },
          { id: 'b', source: 'b', target: 'shot' },
        ],
      }),
    ).toEqual({
      nodeId: 'a',
      url: '/a.mp4',
      label: 'a',
      width: 1920,
      height: 1080,
      durationSec: 8,
    });
  });

  it('does not promote a later ready video over an empty first input', () => {
    const shot = target();
    expect(
      collectShotBreakdownSource({
        node: shot,
        nodes: [shot, video('empty', ''), video('ready')],
        edges: [
          { id: 'e1', source: 'empty', target: 'shot' },
          { id: 'e2', source: 'ready', target: 'shot' },
        ],
      }),
    ).toBeNull();
  });

  it('uses the exact video data type and first string URL candidate gates', () => {
    const graph = {
      nodes: [
        target(),
        video('ready'),
        video('data', 'data:video/mp4;base64,AAAA'),
        video('blob', 'blob:pending'),
        video('empty', ''),
        video('raw', '', { url: '/not-array.mp4' }),
        { ...video('wrong'), data: { type: 'image', url: ['/wrong.mp4'] } },
        { ...video('data-type'), type: 'image' },
      ],
      edges: [],
      targetNodeId: 'shot',
    };
    const value = describeShotBreakdownReferencePick(graph);
    expect([...value.pickableIds]).toEqual(['ready', 'data', 'data-type']);
    expect([...value.groupPickableIds]).toEqual([]);
    expect(value.limitCount).toBeNull();
    expect(value.blockReasons.size).toBe(0);
    expect(value.states.get('blob')).toBe('blocked');
    expect(value.states.get('shot')).toBe('self');
  });

  it('collects all existing input IDs, even non-video and virtual edges, and excludes them from picking', () => {
    const value = describeShotBreakdownReferencePick({
      nodes: [target(), video('connected'), video('other')],
      edges: [
        { id: 'e1', source: 'connected', target: 'shot', data: { assetVirtual: true } },
        { id: 'e2', source: 'missing', target: 'shot' },
      ],
      targetNodeId: 'shot',
    });
    expect([...value.connectedIds]).toEqual(['connected', 'missing']);
    expect([...value.pickableIds]).toEqual(['other']);
    expect(value.states.get('connected')).toBe('connected');
  });

  it('replaces all target inputs in one plan while retaining every node and unrelated edge', () => {
    const nodes = [target(), video('old'), video('new')];
    const unrelated = { id: 'keep', source: 'old', target: 'new', data: { keep: true } };
    const edges = [
      { id: 'old', source: 'old', target: 'shot' },
      { id: 'virtual', source: 'missing', target: 'shot', data: { portraitVirtual: true } },
      unrelated,
    ];
    const before = JSON.stringify({ nodes, edges });
    const value = planShotBreakdownReferencePick({
      nodes,
      edges,
      targetNodeId: 'shot',
      sourceId: 'new',
      makeId: () => 'new-edge',
    });
    expect(value.changed).toBe(true);
    expect(value.nodes).toBe(nodes);
    expect(value.edges).toEqual([
      unrelated,
      {
        id: 'new-edge',
        source: 'new',
        sourceHandle: 'source',
        target: 'shot',
        targetHandle: 'target',
      },
    ]);
    expect(value.removedEdgeIds).toEqual(['old', 'virtual']);
    expect(value.selectionChanges).toEqual([]);
    expect(value.exitAfterCommit).toBe(true);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
  });

  it.each(['box', 'group'])('does not implement a %s multi-pick for the shot target', (surface) => {
    expect(
      planShotBreakdownReferencePick({
        nodes: [target(), video('a')],
        edges: [],
        targetNodeId: 'shot',
        sourceId: 'a',
        surface,
        makeId: () => 'new',
      }),
    ).toMatchObject({ changed: false, reason: 'single-node-only' });
  });

  it('refuses stale source URLs and duplicate generated IDs without changing graph', () => {
    const graph = {
      nodes: [target(), video('a', 'blob:pending')],
      edges: [],
      targetNodeId: 'shot',
    };
    expect(
      planShotBreakdownReferencePick({ ...graph, sourceId: 'a', makeId: () => 'edge' }),
    ).toMatchObject({
      changed: false,
      reason: 'source-not-pickable',
    });
    expect(
      planShotBreakdownReferencePick({
        ...graph,
        nodes: [target(), video('a')],
        sourceId: 'a',
        makeId: () => 'a',
      }),
    ).toMatchObject({ valid: false, changed: false, reason: 'invalid-edge-id' });
  });
});
