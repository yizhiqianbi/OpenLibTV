// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { planCanvasEdgeDeletion, planCanvasNodeDeletion } from './destructive-delete-model.js';

const node = (id, type = 'image', extra = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  width: 30,
  height: 40,
  data: { type, url: [`/${id}`] },
  ...extra,
});
const ref = (nodeId) => ({ nodeId, url: `/${nodeId}` });
const target = (id = 'target', params = {}, extra = {}) =>
  node(id, 'video', { data: { type: 'video', params }, ...extra });
const edge = (id, source, to = 'target', data) => ({ id, source, target: to, data });
const group = (id, extra = {}) =>
  node(id, 'group', {
    position: { x: 100, y: 200 },
    width: 600,
    height: 400,
    data: { type: 'group', childNodeIds: ['original-membership'] },
    ...extra,
  });
const get = (plan, id) => plan.nodes.find((value) => value.id === id);
const raw = (nodes, edges, nodeIds, extra = {}) =>
  planCanvasNodeDeletion({ nodes, edges, nodeIds, ui: false, ...extra });

describe('raw node deletion iv, linked metadata and postgraph incoming effects', () => {
  it('removes every incident edge and the selected node while preserving other nodes and stable prompt bindings', () => {
    const a = node('a'),
      b = node('b');
    const settings = { duration: 5 };
    const owner = target('target', {
      prompt: '{{Image 1}} {{Image 2}}',
      imageList: [ref('a'), ref('b')],
      settings,
    });
    const nodes = [a, b, owner, node('unrelated')];
    const edges = [
      edge('first', 'a'),
      edge('duplicate', 'a'),
      edge('b', 'b'),
      edge('out', 'target', 'unrelated'),
    ];
    const plan = raw(nodes, edges, ['a', 'a']);
    expect(plan.removedNodeIds).toEqual(['a']);
    expect(plan.affectedTargetIds).toEqual(['target']);
    expect(plan.explicitPromptNodeIds).toEqual(['target']);
    expect(plan.edges).toEqual([edges[2], edges[3]]);
    expect(plan.nodes.map((value) => value.id)).toEqual(['b', 'target', 'unrelated']);
    expect(get(plan, 'b')).toBe(b);
    expect(get(plan, 'unrelated')).toBe(nodes[3]);
    expect(get(plan, 'target').data.params.prompt).toBe('{{Image 1}}');
    expect(get(plan, 'target').data.params.settings).toBe(settings);
    expect(owner.data.params.prompt).toBe('{{Image 1}} {{Image 2}}');
    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(4);
  });

  it('uses original outgoing edge order for targets and reads each fallback from the original target once', () => {
    const first = target('first', { prompt: '{{Image 1}}' });
    const second = target('second', { prompt: '{{Image 1}}' });
    const read = vi.fn(() => ({ imageList: [ref('a')] }));
    const plan = raw(
      [node('a'), first, second],
      [edge('two', 'a', 'second'), edge('one', 'a', 'first'), edge('dup', 'a', 'second')],
      ['a'],
      { getFallbackReferences: read },
    );
    expect(plan.affectedTargetIds).toEqual(['second', 'first']);
    expect(read.mock.calls.map(([value]) => value)).toEqual([second, first]);
    expect(get(plan, 'first').data.params.prompt).toBe('');
    expect(get(plan, 'second').data.params.prompt).toBe('');
  });

  it('performs editing cascade only once from requested seeds and has no VIDEO type restriction', () => {
    const a = node('a');
    const b = target(
      'b',
      { segmentRemakeLock: true, segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' } },
      {
        type: 'custom',
        data: {
          type: 'custom',
          params: {
            segmentRemakeLock: true,
            segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' },
          },
        },
      },
    );
    const c = target('c', {
      prompt: '{{Video 1}}',
      videoList: [ref('b')],
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'b' },
    });
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];
    const plan = raw([a, b, c], edges, ['a']);
    expect(plan.removedNodeIds).toEqual(['a', 'b']);
    expect(plan.nodes.map((value) => value.id)).toEqual(['c']);
    expect(plan.edges).toEqual([]);
    expect(get(plan, 'c').data.params).toMatchObject({
      prompt: '',
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'b' },
    });
    expect(plan.affectedTargetIds).toEqual(['c']);
  });

  it('raw group deletion frees surviving immediate children in full world coordinates, without deleting grandchildren or repairing membership', () => {
    const outer = group('outer', { position: { x: 1000, y: 2000 } });
    const parent = group('g', { parentId: 'outer', position: { x: 100, y: 200 } });
    const inner = group('inner', { parentId: 'g', position: { x: 30, y: 40 } });
    const leaf = node('leaf', 'image', {
      parentId: 'inner',
      position: { x: 5, y: 6 },
      extent: 'parent',
    });
    const plan = raw([outer, parent, inner, leaf], [], ['g']);
    expect(plan.removedNodeIds).toEqual(['g']);
    expect(get(plan, 'inner')).toEqual({
      ...inner,
      parentId: undefined,
      position: { x: 1130, y: 2240 },
    });
    expect(get(plan, 'inner')).not.toHaveProperty('parentId');
    expect(get(plan, 'leaf')).toBe(leaf);
    expect(get(plan, 'outer')).toBe(outer);
    expect(get(plan, 'outer').data.childNodeIds).toEqual(['original-membership']);
  });

  it('clears only the two source linked-group fields to undefined, preserving other bindings', () => {
    const script = node('s', 'script', {
      data: {
        type: 'script',
        linkedImageGroupId: 'g',
        linkedVideoGroupId: 'other',
        sourceScriptNodeId: 'g',
        custom: 3,
      },
    });
    const other = target(
      'other',
      {},
      { data: { type: 'video', linkedVideoGroupId: 'g', params: {} } },
    );
    const plan = raw([group('g'), script, other], [], ['g']);
    expect(get(plan, 's').data).toEqual({ ...script.data, linkedImageGroupId: undefined });
    expect(get(plan, 'other').data).toEqual({ ...other.data, linkedVideoGroupId: undefined });
    expect(script.data.linkedImageGroupId).toBe('g');
  });

  it('node deletion does not clear removed-group exclusions, unlike edge deletion', () => {
    const owner = target(
      'target',
      { prompt: '{{Image 1}}', imageList: [ref('a')] },
      {
        data: {
          type: 'video',
          params: { prompt: '{{Image 1}}', imageList: [ref('a')] },
          groupRefExcludedNodeIds: ['a', 'unrelated'],
        },
      },
    );
    const a = node('a', 'image', { parentId: 'g' });
    const plan = raw([group('g'), a, owner], [edge('group-edge', 'g')], ['g']);
    expect(get(plan, 'target').data.groupRefExcludedNodeIds).toBe(
      owner.data.groupRefExcludedNodeIds,
    );
    expect(plan.edges).toEqual([]);
  });

  it('runs picture reset, panorama replacement and lens ownership cleanup for affected targets', () => {
    const v = node('v', 'video');
    const picture = target('picture', {
      pictureEditLock: true,
      model: 'm',
      prompt: 'old',
      settings: { old: true },
      videoList: [ref('v')],
    });
    const panorama = node('p', 'space-scene-720', {
      data: { type: 'space-scene-720', panoramaUrl: '/v' },
    });
    const l = node('l', 'material-lens', {
      data: { type: 'material-lens', lensVersionId: 9, lensVersionUuid: 'lens' },
    });
    const owner = target('target', {
      prompt: 'keep',
      effects: [2, 9],
      lensModels: [{ uuid: 'lens', versionId: 9 }],
    });
    const plan = raw(
      [v, picture, panorama, l, owner],
      [edge('vp', 'v', 'picture'), edge('vl', 'v', 'p'), edge('l', 'l')],
      ['v', 'l'],
    );
    expect(get(plan, 'picture').data.params).toEqual({
      prompt: '',
      model: 'm',
      modeType: '',
      count: 1,
      settings: {},
      textList: [],
      imageList: [],
      videoList: [],
      audioList: [],
    });
    expect(get(plan, 'p').data).toHaveProperty('panoramaUrl', undefined);
    expect(get(plan, 'target').data.params.effects).toEqual([2]);
    expect(get(plan, 'target').data.params).not.toHaveProperty('lensModels');
    expect(plan.affectedTargetIds).toEqual(['picture', 'p', 'target']);
    expect(plan.explicitPromptNodeIds).toEqual(['picture', 'target']);
  });

  it('marks style changes stale during recalculation, then clears truthy stale for node deletion only', () => {
    const style = node('style', 'material-style', {
      data: { type: 'material-style', styleVersionUuid: 'style' },
    });
    const image = node('image', 'image', {
      data: {
        type: 'image',
        params: { prompt: 'keep', fineTuneModels: [{ uuid: 'style', _fromStyleNode: true }] },
        taskInfo: { taskId: 'done', loading: false },
        staleVersion: 4,
      },
    });
    const nodes = [style, image],
      edges = [edge('style-edge', 'style', 'image')];
    const byNode = raw(nodes, edges, ['style']);
    const byEdge = planCanvasEdgeDeletion({ nodes, edges, edgeIds: ['style-edge'] });
    expect(get(byNode, 'image').data).toMatchObject({
      isStale: false,
      staleVersion: 5,
      params: { fineTuneModels: [], prompt: 'keep' },
    });
    expect(get(byEdge, 'image').data).toMatchObject({
      isStale: true,
      staleVersion: 5,
      params: { fineTuneModels: [], prompt: 'keep' },
    });
    expect(get(byEdge, 'style')).toBe(style);
  });
});

describe('actual UI group expansion and one-level parent geometry', () => {
  it.each(['group', 'video_group'])(
    'expands %s descendants breadth first according to parentId, ignoring childNodeIds',
    (type) => {
      const g = group('g', { type });
      const inner = group('inner', { parentId: 'g' });
      const first = node('first', 'image', { parentId: 'g' });
      const deep = node('deep', 'text', { parentId: 'inner' });
      const last = node('last', 'audio', { parentId: 'g' });
      const nodes = [g, inner, first, deep, last, node('outside')];
      const plan = planCanvasNodeDeletion({ nodes, edges: [], nodeIds: ['g'] });
      expect(plan.removedNodeIds).toEqual(['g', 'inner', 'first', 'last', 'deep']);
      expect(plan.nodes).toEqual([nodes[5]]);
    },
  );

  it('does not apply ordinary group expansion to video-story and frees its surviving child instead', () => {
    const g = group('g', { type: 'video-story' });
    const child = node('child', 'image', { parentId: 'g', position: { x: 30, y: 50 } });
    const plan = planCanvasNodeDeletion({ nodes: [g, child], edges: [], nodeIds: ['g'] });
    expect(plan.removedNodeIds).toEqual(['g']);
    expect(get(plan, 'child').position).toEqual({ x: 130, y: 250 });
    expect(get(plan, 'child')).not.toHaveProperty('parentId');
  });

  it('dissolves an immediate parent with one remaining child, preserving nested world position without recomputing the grandparent', () => {
    const outer = group('outer', { position: { x: 1000, y: 2000 }, width: 999 });
    const g = group('g', { parentId: 'outer', position: { x: 100, y: 200 } });
    const gone = node('gone', 'image', { parentId: 'g' });
    const kept = node('kept', 'image', {
      parentId: 'g',
      position: { x: 30, y: 40 },
      extent: 'parent',
    });
    const plan = planCanvasNodeDeletion({
      nodes: [outer, g, gone, kept],
      edges: [],
      nodeIds: ['gone'],
    });
    expect(plan.removedNodeIds).toEqual(['gone', 'g']);
    expect(get(plan, 'kept').position).toEqual({ x: 1130, y: 2240 });
    expect(get(plan, 'kept')).not.toHaveProperty('parentId');
    expect(get(plan, 'kept')).not.toHaveProperty('extent');
    expect(get(plan, 'outer')).toBe(outer);
  });

  it.each([
    [1, { x: 130, y: 270 }, 200, 220, { x: 20, y: 20 }, { x: 120, y: 120 }],
    [0.25, { x: 110, y: 250 }, 240, 260, { x: 40, y: 40 }, { x: 140, y: 140 }],
  ])(
    'resizes a remaining parent once at zoom %s with no title padding and source measured-size priority',
    (zoom, position, width, height, aPos, bPos) => {
      const g = group('g', {
        style: { preserve: true },
        data: { type: 'group', childNodeIds: ['gone', 'a', 'b'], name: 'Group' },
        measured: { width: 600, height: 400, custom: 3 },
      });
      const gone = node('gone', 'image', { parentId: 'g' });
      const a = node('a', 'image', { parentId: 'g', position: { x: 50, y: 90 } });
      const b = node('b', 'video', {
        parentId: 'g',
        position: { x: 150, y: 190 },
        width: 999,
        height: 999,
        measured: { width: 60, height: 80 },
      });
      const plan = planCanvasNodeDeletion({
        nodes: [g, gone, a, b],
        edges: [],
        nodeIds: ['gone'],
        zoom,
      });
      expect(get(plan, 'g')).toEqual({
        ...g,
        position,
        width,
        height,
        measured: { width, height },
      });
      expect(get(plan, 'g').data).toBe(g.data);
      expect(get(plan, 'g').style).toBe(g.style);
      expect(get(plan, 'a').position).toEqual(aPos);
      expect(get(plan, 'b').position).toEqual(bPos);
      expect(g.data.childNodeIds).toEqual(['gone', 'a', 'b']);
    },
  );

  it.each([
    ['gone-inner', 'gone-outer'],
    ['gone-outer', 'gone-inner'],
  ])(
    'applies every parent resize before every child-position patch, preserving resized nested dimensions for seed order %j / %j',
    (first, second) => {
      const outer = group('outer', { position: { x: 1000, y: 2000 } });
      const inner = group('inner', { parentId: 'outer', position: { x: 100, y: 200 } });
      const goneOuter = node('gone-outer', 'image', { parentId: 'outer' });
      const goneInner = node('gone-inner', 'image', { parentId: 'inner' });
      const outerChild = node('outer-child', 'image', {
        parentId: 'outer',
        position: { x: 800, y: 700 },
      });
      const a = node('a', 'image', { parentId: 'inner', position: { x: 50, y: 90 } });
      const b = node('b', 'image', {
        parentId: 'inner',
        position: { x: 150, y: 190 },
        measured: { width: 60, height: 80 },
      });
      const nodes = [outer, inner, goneOuter, goneInner, outerChild, a, b];
      const plan = planCanvasNodeDeletion({ nodes, edges: [], nodeIds: [first, second] });
      expect(get(plan, 'outer')).toEqual({
        ...outer,
        position: { x: 1080, y: 2180 },
        width: 770,
        height: 580,
        measured: { width: 770, height: 580 },
      });
      expect(get(plan, 'inner')).toEqual({
        ...inner,
        position: { x: 20, y: 20 },
        width: 200,
        height: 220,
        measured: { width: 200, height: 220 },
      });
      expect(get(plan, 'a').position).toEqual({ x: 20, y: 20 });
      expect(get(plan, 'b').position).toEqual({ x: 120, y: 120 });
      expect(get(plan, 'outer-child').position).toEqual({ x: 720, y: 520 });
      expect(inner.width).toBe(600);
      expect(inner.position).toEqual({ x: 100, y: 200 });
    },
  );

  it('does not re-run parent dissolution for a newly added editing continuation cascade', () => {
    const g = group('g');
    const a = node('a');
    const b = target(
      'b',
      { segmentRemakeLock: true, segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' } },
      { parentId: 'g' },
    );
    const kept = node('kept', 'image', { parentId: 'g' });
    const plan = planCanvasNodeDeletion({
      nodes: [a, g, b, kept],
      edges: [edge('ab', 'a', 'b')],
      nodeIds: ['a'],
    });
    expect(plan.removedNodeIds).toEqual(['a', 'b']);
    expect(get(plan, 'g')).toBe(g);
    expect(get(plan, 'kept')).toBe(kept);
  });
});

describe('image storyboard deletion binding p2 / module 556544', () => {
  it('retains partial preferred ordering and duplicate entries, using original image indices for row fallback', () => {
    const script = node('script', 'script-v2', {
      data: {
        type: 'script-v2',
        rows: [
          { hiddenUuid: 'row0' },
          { hiddenUuid: 'row1' },
          { hiddenUuid: 'row2' },
          { hiddenUuid: 'row3' },
        ],
      },
    });
    const g = group('g', {
      data: {
        type: 'group',
        storyboardGroupType: 'image',
        sourceScriptNodeId: 'script',
        childNodeIds: ['third', 'missing', 'first', 'first'],
        name: 'keep',
      },
    });
    const first = node('first', 'image', { parentId: 'g', data: { type: 'image', name: '1' } });
    const second = node('second', 'image', { parentId: 'g', data: { type: 'image', name: '2' } });
    const third = node('third', 'image', {
      parentId: 'g',
      data: { type: 'image', name: '3', scriptRowHiddenUuid: 'explicit-third' },
    });
    const plan = planCanvasNodeDeletion({
      nodes: [script, g, first, second, third],
      edges: [],
      nodeIds: ['first'],
    });
    expect(get(plan, 'g').data).toEqual({
      ...g.data,
      childNodeIds: ['third', 'second'],
      storyboardSourceRowHiddenUuids: ['explicit-third', 'row3'],
    });
    expect(script.data.rows).toHaveLength(4);
  });

  it('filters rows by existing hidden IDs in script row order, not set order, and preserves empty arrays', () => {
    const script = node('script', 'script-v2', {
      data: {
        type: 'script-v2',
        rows: [
          { hiddenUuid: 'r0' },
          { hiddenUuid: 'r1' },
          { hiddenUuid: 'r2' },
          { hiddenUuid: 'r3' },
        ],
      },
    });
    const g = group('g', {
      data: {
        type: 'group',
        storyboardGroupType: 'image',
        sourceScriptNodeId: 'script',
        childNodeIds: [],
        storyboardSourceRowHiddenUuids: ['r3', 'r1'],
      },
    });
    const a = node('a', 'image', { parentId: 'g', data: { type: 'image', name: '1' } });
    const b = node('b', 'image', { parentId: 'g', data: { type: 'image', name: '2' } });
    const spare = node('spare', 'reference', { parentId: 'g' });
    const plan = planCanvasNodeDeletion({
      nodes: [script, g, a, b, spare],
      edges: [],
      nodeIds: ['a'],
    });
    expect(get(plan, 'g').data.childNodeIds).toEqual(['b']);
    expect(get(plan, 'g').data.storyboardSourceRowHiddenUuids).toEqual(['r3']);
    const empty = planCanvasNodeDeletion({
      nodes: [script, g, a, b, spare, node('spare2', 'text', { parentId: 'g' })],
      edges: [],
      nodeIds: ['a', 'b'],
    });
    expect(get(empty, 'g').data.childNodeIds).toEqual([]);
    expect(get(empty, 'g').data.storyboardSourceRowHiddenUuids).toEqual([]);
  });

  it('leaves source bindings and childNodeIds unchanged for a raw deletion or deletion of only a non-image child', () => {
    const g = group('g', {
      data: {
        type: 'group',
        storyboardGroupType: 'image',
        sourceScriptNodeId: 'script',
        childNodeIds: ['a', 'b', 'text'],
        storyboardSourceRowHiddenUuids: ['r1', 'r2'],
      },
    });
    const a = node('a', 'image', { parentId: 'g' }),
      b = node('b', 'image', { parentId: 'g' }),
      text = node('text', 'text', { parentId: 'g' });
    const nodes = [g, a, b, text];
    expect(get(raw(nodes, [], ['a']), 'g').data).toBe(g.data);
    expect(get(planCanvasNodeDeletion({ nodes, edges: [], nodeIds: ['text'] }), 'g').data).toBe(
      g.data,
    );
  });
});

describe('authorized local surviving-group consumer consistency', () => {
  const fixture = () => {
    const g = group('g');
    const a = node('a', 'image', { parentId: 'g' }),
      b = node('b', 'image', { parentId: 'g' }),
      spare = node('spare', 'reference', { parentId: 'g' });
    const consumer = target('consumer', {
      prompt: '{{Image 1}} {{Image 2}}',
      imageList: [ref('a'), ref('b')],
    });
    const direct = target('direct', { prompt: '{{Image 1}}', imageList: [ref('a')] });
    const unrelated = target('unrelated', { prompt: '{{Image 99}}' });
    return {
      nodes: [g, a, b, spare, consumer, direct, unrelated],
      edges: [edge('gc', 'g', 'consumer'), edge('ad', 'a', 'direct')],
      nodeIds: ['a'],
    };
  };

  it('is an explicit UI opt-in: default/raw preserve the source group-consumer omission', () => {
    const args = fixture();
    expect(get(planCanvasNodeDeletion(args), 'consumer')).toBe(args.nodes[4]);
    expect(
      get(
        planCanvasNodeDeletion({ ...args, ui: false, reconcileGroupConsumers: true }),
        'consumer',
      ),
    ).toBe(args.nodes[4]);
  });

  it('recalculates only surviving pre-tree ancestors’ real consumers, after source direct targets and without scanning unrelated targets', () => {
    const args = fixture();
    const read = vi.fn(() => undefined);
    const plan = planCanvasNodeDeletion({
      ...args,
      reconcileGroupConsumers: true,
      getFallbackReferences: read,
    });
    expect(plan.affectedTargetIds).toEqual(['direct', 'consumer']);
    expect(plan.explicitPromptNodeIds).toEqual(['direct', 'consumer']);
    expect(get(plan, 'consumer').data.params.prompt).toBe('{{Image 1}}');
    expect(get(plan, 'consumer').data.params.imageList.map((value) => value.nodeId)).toEqual(['b']);
    expect(get(plan, 'unrelated')).toBe(args.nodes[6]);
    expect(read.mock.calls.map(([value]) => value.id)).toEqual(['direct', 'consumer']);
    expect(plan.edges).toEqual([args.edges[0]]);
  });

  it('does not include virtual consumers or missing ancestors', () => {
    const args = fixture();
    args.edges[0] = { ...args.edges[0], data: { assetVirtual: true } };
    expect(
      planCanvasNodeDeletion({ ...args, reconcileGroupConsumers: true }).affectedTargetIds,
    ).toEqual(['direct']);
  });
});

describe('edge deletion iS → raw node deletion → ih → incoming recalculation', () => {
  it('removes only the detached edge’s persisted character reference, retaining other records and the character asset', () => {
    const first = { roleName: 'first', mainReferenceImageUrl: '/first' };
    const second = { roleName: 'second', mainReferenceImageUrl: '/second' };
    const characterAsset = { states: [{ id: 'state' }] };
    const character = group('character', {
      data: {
        type: 'group',
        characterAsset,
        characterReferences: { first, second, unrelated: { keep: true } },
      },
    });
    const owner = target('target', { prompt: '{{Image 1}}', imageList: [ref('character')] });
    const edges = [
      edge('first', 'character', 'target', { characterRef: first }),
      edge('second', 'character', 'other', { characterRef: second }),
    ];
    const other = target('other', {});
    const plan = planCanvasEdgeDeletion({
      nodes: [character, owner, other],
      edges,
      edgeIds: ['first'],
    });
    expect(get(plan, 'character').data).toEqual({
      ...character.data,
      characterReferences: { second, unrelated: { keep: true } },
    });
    expect(get(plan, 'character').data.characterAsset).toBe(characterAsset);
    expect(get(plan, 'character').data.characterReferences.second).toBe(second);
    expect(get(plan, 'other')).toBe(other);
    expect(character.data.characterReferences).toHaveProperty('first', first);
  });

  it('retains an empty persisted character-reference object, but leaves absent keys and non-character sources unchanged', () => {
    const character = group('character', {
      data: { type: 'group', characterAsset: {}, characterReferences: { one: { keep: true } } },
    });
    const owner = target('target');
    const plan = planCanvasEdgeDeletion({
      nodes: [character, owner],
      edges: [edge('one', 'character')],
      edgeIds: ['one'],
    });
    expect(get(plan, 'character').data.characterReferences).toEqual({});
    expect(get(plan, 'character').data).toHaveProperty('characterReferences');
    const missing = planCanvasEdgeDeletion({
      nodes: [character, owner],
      edges: [edge('absent', 'character')],
      edgeIds: ['absent'],
    });
    expect(get(missing, 'character')).toBe(character);
    const ordinary = { ...character, data: { ...character.data, characterAsset: undefined } };
    expect(
      get(
        planCanvasEdgeDeletion({
          nodes: [ordinary, owner],
          edges: [edge('one', 'character')],
          edgeIds: ['one'],
        }),
        'character',
      ),
    ).toBe(ordinary);
  });

  it('does not apply edge-only character-reference cleanup when deleting a target node or its editing cascade', () => {
    const character = group('character', {
      data: { type: 'group', characterAsset: {}, characterReferences: { one: { keep: true } } },
    });
    const owner = target('target');
    const nodes = [character, owner],
      edges = [edge('one', 'character')];
    expect(get(raw(nodes, edges, ['target']), 'character')).toBe(character);
    const editing = target('target', {
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'character' },
    });
    expect(
      get(
        planCanvasEdgeDeletion({ nodes: [character, editing], edges, edgeIds: ['one'] }),
        'character',
      ),
    ).toBe(character);
  });

  it('deletes only requested edges while preserving duplicate-source membership, source nodes and unrelated graph identity', () => {
    const a = node('a');
    const owner = target('target', { prompt: '{{Image 1}}', imageList: [ref('a')] });
    const nodes = [a, owner],
      edges = [edge('first', 'a'), edge('second', 'a')];
    const plan = planCanvasEdgeDeletion({ nodes, edges, edgeIds: ['first'] });
    expect(plan.edges).toEqual([edges[1]]);
    expect(plan.removedNodeIds).toEqual([]);
    expect(get(plan, 'a')).toBe(a);
    expect(get(plan, 'target').data.params.prompt).toBe('{{Image 1}}');
    expect(plan.affectedTargetIds).toEqual(['target']);
  });

  it('clears only detached-group exclusions and keeps asset:// references and unrelated exclusions', () => {
    const g = group('g'),
      a = node('a', 'image', { parentId: 'g' });
    const owner = target(
      'target',
      { prompt: '{{Image 1}} {{Image 2}}', imageList: [ref('a'), ref('asset://keep')] },
      {
        data: {
          type: 'video',
          groupRefExcludedNodeIds: ['a', 'other-group'],
          params: { prompt: '{{Image 1}} {{Image 2}}', imageList: [ref('a'), ref('asset://keep')] },
        },
      },
    );
    const plan = planCanvasEdgeDeletion({
      nodes: [g, a, owner],
      edges: [edge('group-edge', 'g')],
      edgeIds: ['group-edge'],
    });
    expect(get(plan, 'g')).toBe(g);
    expect(get(plan, 'a')).toBe(a);
    expect(get(plan, 'target').data.groupRefExcludedNodeIds).toEqual(['other-group']);
    expect(get(plan, 'target').data.params.prompt).toBe('{{Image 1}}');
    expect(get(plan, 'target').data.params.imageList).toEqual([ref('asset://keep')]);
  });

  it('deletes editing targets of any type, then only one downstream cascade pass, preserving the original source', () => {
    const a = node('a');
    const b = target(
      'b',
      { segmentRemakeLock: true, segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' } },
      {
        type: 'custom',
        data: {
          type: 'custom',
          params: {
            segmentRemakeLock: true,
            segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' },
          },
        },
      },
    );
    const c = target('c', {
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'b' },
    });
    const d = target('d', {
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'c' },
    });
    const plan = planCanvasEdgeDeletion({
      nodes: [a, b, c, d],
      edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('cd', 'c', 'd')],
      edgeIds: ['ab'],
    });
    expect(plan.removedNodeIds).toEqual(['b', 'c']);
    expect(plan.nodes.map((value) => value.id)).toEqual(['a', 'd']);
    expect(get(plan, 'a')).toBe(a);
    expect(get(plan, 'd').data.params.segmentRemakeLock).toBe(true);
    expect(plan.edges).toEqual([]);
    expect(plan.affectedTargetIds).toEqual(['d']);
  });

  it('does not run partial-parent UI dissolution for an edge-triggered editing target deletion', () => {
    const g = group('g'),
      a = node('a');
    const b = target(
      'b',
      { segmentRemakeLock: true, segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' } },
      { parentId: 'g' },
    );
    const child = node('child', 'image', { parentId: 'g' });
    const plan = planCanvasEdgeDeletion({
      nodes: [g, a, b, child],
      edges: [edge('ab', 'a', 'b')],
      edgeIds: ['ab'],
    });
    expect(plan.removedNodeIds).toEqual(['b']);
    expect(get(plan, 'g')).toBe(g);
    expect(get(plan, 'child')).toBe(child);
  });

  it('handles subsequent requested edges after node cascade, preserving target stage order and one fallback read per target', () => {
    const a = node('a'),
      other = node('other');
    const b = target('b', {
      segmentRemakeLock: true,
      segmentRemakeDraft: { phase: 'editing', sourceNodeId: 'a' },
    });
    const d = target('d', {
      prompt: '{{Image 1}} {{Image 2}}',
      imageList: [ref('b'), ref('other')],
    });
    const read = vi.fn();
    const edges = [edge('ab', 'a', 'b'), edge('bd', 'b', 'd'), edge('od', 'other', 'd')];
    const plan = planCanvasEdgeDeletion({
      nodes: [a, other, b, d],
      edges,
      edgeIds: ['ab', 'od'],
      getFallbackReferences: read,
    });
    expect(plan.removedNodeIds).toEqual(['b']);
    expect(plan.affectedTargetIds).toEqual(['d']);
    expect(get(plan, 'd').data.params.prompt).toBe('');
    expect(plan.edges).toEqual([]);
    expect(read).toHaveBeenCalledExactlyOnceWith(d);
  });

  it('returns null for absent node/edge requests without any graph or resolver mutation', () => {
    const nodes = [node('a')],
      edges = [];
    const read = vi.fn();
    expect(raw(nodes, edges, [], { getFallbackReferences: read })).toBeNull();
    expect(raw(nodes, edges, ['missing'], { getFallbackReferences: read })).toBeNull();
    expect(
      planCanvasEdgeDeletion({ nodes, edges, edgeIds: ['missing'], getFallbackReferences: read }),
    ).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(nodes[0].data.url).toEqual(['/a']);
  });
});
