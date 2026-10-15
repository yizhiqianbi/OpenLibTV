import { describe, expect, it, vi } from 'vitest';
import {
  planCanvasSelectionDragCopy,
  planCanvasSingleNodeDragCopy,
  resolveCanvasNodeDragCopyMode,
} from './selection-copy-model.js';

const node = (id, patch = {}) => ({
  id,
  type: 'image',
  position: { x: 10, y: 20 },
  data: { type: 'image', name: id },
  ...patch,
});
const edge = (id, source, target, patch = {}) => ({ id, source, target, ...patch });
const ids = () => {
  let index = 0;
  return () => `copy-${++index}`;
};
const plan = (nodes, patch = {}) =>
  planCanvasSelectionDragCopy({
    nodes,
    edges: [],
    sourceIds: nodes.map((value) => value.id),
    makeId: ids(),
    ...patch,
  });

describe('same-position Alt selection copy plan', () => {
  it('creates immutable same-position additions without appending or offsetting source nodes', () => {
    const nodes = [node('a'), node('b', { position: { x: 300, y: -40 } })];
    const before = structuredClone(nodes);
    const result = plan(nodes);
    expect(result.valid).toBe(true);
    expect(result.copies.map((value) => value.position)).toEqual([
      { x: 10, y: 20 },
      { x: 300, y: -40 },
    ]);
    expect(result.newAllIds).toEqual(['copy-1', 'copy-2']);
    expect(result.newTopLevelIds).toEqual(result.newAllIds);
    expect(result.edgeCopies).toEqual([]);
    expect(result.positions.get('copy-1')).toEqual({ x: 10, y: 20 });
    result.copies[0].data.name = 'mutated';
    expect(nodes).toEqual(before);
  });

  it('expands a group child to the parent and siblings, remapping child order and relative positions', () => {
    const group = node('g', {
      type: 'group',
      position: { x: 100, y: 200 },
      data: { type: 'group', name: '分组', childNodeIds: ['b', 'a', 'missing'] },
    });
    const a = node('a', { parentId: 'g', extent: 'parent', position: { x: 5, y: 6 } });
    const b = node('b', { parentId: 'g', position: { x: 20, y: 30 } });
    const result = plan([a, group, b, node('outside')], { sourceIds: ['a'] });
    expect(result.copies.map((value) => value.id)).toEqual(['copy-2', 'copy-1', 'copy-3']);
    expect(result.newTopLevelIds).toEqual(['copy-2']);
    expect(result.copies[0].data.childNodeIds).toEqual(['copy-3', 'copy-1']);
    expect(result.copies[0].data.name).toBe('分组 副本');
    expect(result.copies[1]).toMatchObject({
      parentId: 'copy-2',
      extent: 'parent',
      position: { x: 5, y: 6 },
      data: { name: 'a' },
    });
    expect(result.copies[2].position).toEqual({ x: 20, y: 30 });
  });

  it('keeps complete nested local subtrees and orders parents before grandchildren', () => {
    const nodes = [
      node('child', { parentId: 'nested' }),
      node('nested', { type: 'group', parentId: 'parent', data: { childNodeIds: ['child'] } }),
      node('parent', { type: 'group', data: { childNodeIds: ['nested'] } }),
    ];
    const result = plan(nodes, { sourceIds: ['parent'] });
    expect(result.copies.map((value) => value.id)).toEqual(['copy-3', 'copy-2', 'copy-1']);
    expect(result.newTopLevelIds).toEqual(['copy-3']);
    expect(result.copies[1].parentId).toBe('copy-3');
    expect(result.copies[2].parentId).toBe('copy-2');
  });

  it('detaches a non-group parent in world coordinates and clears its obsolete extent', () => {
    const parent = node('p', { position: { x: 100, y: 200 } });
    const child = node('a', { parentId: 'p', extent: 'parent', position: { x: 5, y: 6 } });
    const result = plan([parent, child], { sourceIds: ['a'] });
    expect(result.copies).toHaveLength(1);
    expect(result.copies[0].position).toEqual({ x: 105, y: 206 });
    expect(result.copies[0].parentId).toBeUndefined();
    expect(result.copies[0]).not.toHaveProperty('extent');
  });

  it('filters screenplay nodes and removes excluded children from the copied group', () => {
    const group = node('g', { type: 'group', data: { childNodeIds: ['a', 'screenplay'] } });
    const nodes = [
      group,
      node('a', { parentId: 'g' }),
      node('screenplay', { parentId: 'g', type: 'screenplay' }),
    ];
    const result = plan(nodes, { sourceIds: ['g'] });
    expect(result.newAllIds).toEqual(['copy-1', 'copy-2']);
    expect(result.copies[0].data.childNodeIds).toEqual(['copy-2']);
    expect(plan(nodes, { sourceIds: ['screenplay'] })).toEqual({
      valid: false,
      reason: 'emptySelection',
    });
  });

  it('clears copied task and guide state while preserving ready media and source state', () => {
    const source = node('a', {
      measured: { width: 500 },
      data: {
        name: '海岸',
        url: 'data:image/png;base64,ready',
        guide: {},
        guideMeta: {},
        taskInfo: { id: 'old' },
        directorAgentSessionId: 'old',
        openingUsed: true,
        isStale: true,
      },
    });
    const result = plan([source]);
    expect(result.copies[0]).not.toHaveProperty('measured');
    expect(result.copies[0].data).toEqual({
      name: '海岸 副本',
      url: source.data.url,
      isStale: false,
    });
    expect(source.data.taskInfo).toEqual({ id: 'old' });
    expect(source.measured).toEqual({ width: 500 });
  });

  it('adds root name and script title suffix only once, leaving unnamed source content unnamed', () => {
    const result = plan([
      node('a', { data: { type: 'script-v2', name: '海岸 副本', title: '脚本', assets: {} } }),
      node('b', { data: { name: '' } }),
    ]);
    expect(result.copies[0].data).toMatchObject({ name: '海岸 副本', title: '脚本 副本' });
    expect(result.copies[1].data.name).toBe('');
  });

  it('remaps media, focus, group and script references without guessing unknown external references', () => {
    const a = node('a');
    const b = node('b', {
      data: {
        type: 'script-v2',
        sourceScriptNodeId: 'a',
        linkedImageGroupId: 'outside',
        params: {
          imageList: [{ nodeId: 'a', url: 'ready' }, { nodeId: 'outside' }],
          textList: [{ nodeId: 'a' }],
          imageListOrder: ['a', 'outside'],
          mixedListOrder: ['a'],
          focusRegion: { nodeId: 'a', x: 3 },
          scenePayload: { source_images: [{ node_id: 'a' }, { node_id: 'outside' }] },
        },
        assets: {
          characters: [{ linkedNodeId: 'a', thumbnailUrl: 'ready' }],
          scenes: [{ linkedNodeId: 'outside' }],
        },
      },
    });
    const result = plan([a, b]);
    expect(result.copies[1].data).toMatchObject({
      sourceScriptNodeId: 'copy-1',
      linkedImageGroupId: 'outside',
      params: {
        imageList: [{ nodeId: 'copy-1', url: 'ready' }, { nodeId: 'outside' }],
        textList: [{ nodeId: 'copy-1' }],
        imageListOrder: ['copy-1', 'outside'],
        mixedListOrder: ['copy-1'],
        focusRegion: { nodeId: 'copy-1', x: 3 },
        scenePayload: { source_images: [{ node_id: 'copy-1' }, { node_id: 'outside' }] },
      },
      assets: {
        characters: [{ linkedNodeId: 'copy-1', thumbnailUrl: 'ready' }],
        scenes: [{ linkedNodeId: 'outside' }],
      },
    });
    expect(b.data.params.imageList[0].nodeId).toBe('a');
  });

  it('carries internal and incoming upstream edges only when the modifier requests them', () => {
    const nodes = [node('upstream'), node('a'), node('b'), node('downstream')];
    const edges = [
      edge('incoming', 'upstream', 'a', { style: { stroke: 'blue' }, data: { label: '原样' } }),
      edge('internal', 'a', 'b', { sourceHandle: 'out', targetHandle: 'in' }),
      edge('outgoing', 'b', 'downstream'),
      edge('external', 'upstream', 'downstream'),
      edge('missing', 'removed', 'a'),
    ];
    const before = structuredClone(edges);
    expect(plan(nodes, { sourceIds: ['a', 'b'], edges }).edgeCopies).toEqual([]);
    const result = plan(nodes, { sourceIds: ['a', 'b'], edges, copyEdges: true });
    expect(result.edgeCopies).toEqual([
      {
        id: 'copy-3',
        source: 'upstream',
        target: 'copy-1',
        sourceHandle: 'source',
        targetHandle: 'target',
        style: { stroke: 'blue' },
        data: { label: '原样' },
      },
      { id: 'copy-4', source: 'copy-1', target: 'copy-2', sourceHandle: 'out', targetHandle: 'in' },
    ]);
    result.edgeCopies[0].data.label = 'changed';
    expect(edges).toEqual(before);
  });

  it.each([undefined, ['a'], ['outside', 'a'], ['removed', 'outside', 'a']])(
    'normalizes a missing, partial or stale media order %j to the remapped stored list',
    (order) => {
      const source = node('b', {
        data: {
          params: {
            imageList: [{ nodeId: 'a' }, { url: 'media-without-node' }, { nodeId: 'outside' }],
            ...(order ? { imageListOrder: order } : {}),
            videoList: [{ nodeId: 'outside' }, { nodeId: 'a' }],
            audioList: [{ nodeId: 'a' }, { nodeId: 'a' }],
            mixedList: [{ nodeId: 'a' }, { nodeId: 'outside' }],
            textList: [{ nodeId: 'a' }],
          },
        },
      });
      const result = plan([node('a'), source]);
      expect(result.copies[1].data.params).toMatchObject({
        imageListOrder: ['copy-1', 'outside'],
        videoListOrder: ['outside', 'copy-1'],
        audioListOrder: ['copy-1', 'copy-1'],
        mixedListOrder: ['copy-1', 'outside'],
      });
      expect(result.copies[1].data.params).not.toHaveProperty('textListOrder');
      expect(source.data.params.imageListOrder).toEqual(order);
    },
  );

  it('preserves an order when its media list is absent, empty, or only URL-based', () => {
    const source = node('a', {
      data: {
        params: {
          imageList: [],
          imageListOrder: ['external'],
          videoList: [{ url: 'ready-video' }],
          videoListOrder: ['external'],
          audioListOrder: ['external'],
        },
      },
    });
    expect(plan([source]).copies[0].data.params).toEqual(source.data.params);
  });

  it.each([
    ['invalid arrays', { nodes: null }],
    ['duplicate node IDs', { nodes: [node('a'), node('a')] }],
    ['invalid position', { nodes: [node('a', { position: { x: NaN, y: 0 } })] }],
    ['ID collision', { makeId: () => 'a' }],
    [
      'ID factory failure',
      {
        makeId: () => {
          throw new Error('failed');
        },
      },
    ],
  ])('rejects %s without publishing any partial additions', (_name, patch) => {
    const result = plan([node('a')], patch);
    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty('copies');
    expect(result).not.toHaveProperty('edgeCopies');
  });

  it('rejects cyclic copied parents and clone failures atomically', () => {
    const nodes = [
      node('a', { type: 'group', parentId: 'b' }),
      node('b', { type: 'group', parentId: 'a' }),
    ];
    expect(plan(nodes).valid).toBe(false);
    const source = node('a');
    source.data.loop = source.data;
    expect(plan([source])).toEqual({ valid: false, reason: 'copyFailed' });
  });

  it('does not allocate an ID for a missing-only selection', () => {
    const makeId = vi.fn();
    expect(plan([node('a')], { sourceIds: ['missing'], makeId })).toEqual({
      valid: false,
      reason: 'emptySelection',
    });
    expect(makeId).not.toHaveBeenCalled();
  });

  it('cleans explicit group-generation dimensions only on copied roots, keeping child dimensions and ordinary params', () => {
    const sceneData = {
      _explicitContentDims: true,
      contentWidth: 480,
      contentHeight: 270,
      params: { scene: 'group-generate', settings: { quality: 'high' }, prompt: 'unchanged' },
    };
    const group = node('g', { type: 'group', data: { childNodeIds: ['child'] } });
    const child = node('child', { parentId: 'g', data: structuredClone(sceneData) });
    const root = node('root', { data: structuredClone(sceneData) });
    const ordinary = node('ordinary', {
      data: {
        ...structuredClone(sceneData),
        params: { scene: 'ordinary', settings: { quality: 'high' } },
      },
    });
    const result = plan([group, child, root, ordinary]);
    expect(result.copies.find((value) => value.id === 'copy-2').data).toMatchObject(sceneData);
    const copiedRoot = result.copies.find((value) => value.id === 'copy-3').data;
    expect(copiedRoot).not.toHaveProperty('_explicitContentDims');
    expect(copiedRoot).not.toHaveProperty('contentWidth');
    expect(copiedRoot).not.toHaveProperty('contentHeight');
    expect(copiedRoot.params).toEqual({ settings: { quality: 'high' }, prompt: 'unchanged' });
    expect(result.copies.find((value) => value.id === 'copy-4').data).toMatchObject(ordinary.data);
    expect(root.data).toEqual(sceneData);
  });
});

describe('source data eligibility for Alt node drag', () => {
  it('selects single mode for exactly one selected visible ordinary node', () => {
    const nodes = [node('a'), node('b')];
    expect(resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['a'], nodeId: 'a' })).toEqual({
      copyMode: 'single',
      sourceIds: ['a'],
    });
    expect(resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['a'], nodeId: 'b' })).toBeNull();
    // React Flow's normal down selection can provide the newly selected singleton.
    expect(resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['b'], nodeId: 'b' })).toEqual({
      copyMode: 'single',
      sourceIds: ['b'],
    });
  });

  it('uses graph order and excludes hidden selection entries before counting single mode', () => {
    const nodes = [node('a'), node('hidden', { hidden: true }), node('b')];
    expect(
      resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['hidden', 'b', 'a', 'a'], nodeId: 'b' }),
    ).toEqual({ copyMode: 'selection', sourceIds: ['a', 'b'] });
    expect(
      resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['hidden', 'a'], nodeId: 'a' }),
    ).toEqual({ copyMode: 'single', sourceIds: ['a'] });
    expect(
      resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['hidden', 'a'], nodeId: 'hidden' }),
    ).toBeNull();
  });

  it.each(['group', 'video_group'])(
    'copies a selected %s with direct members through selection mode',
    (type) => {
      const group = node('g', { type });
      const child = node('child', { parentId: 'g', hidden: true });
      expect(
        resolveCanvasNodeDragCopyMode({ nodes: [group, child], selectedIds: ['g'], nodeId: 'g' }),
      ).toEqual({ copyMode: 'selection', sourceIds: ['g'] });
      expect(
        resolveCanvasNodeDragCopyMode({ nodes: [group], selectedIds: ['g'], nodeId: 'g' }),
      ).toBeNull();
    },
  );

  it('does not expand a singleton child into its parent group when deciding single mode', () => {
    const nodes = [
      node('g', { type: 'group' }),
      node('a', { parentId: 'g' }),
      node('b', { parentId: 'g' }),
    ];
    expect(resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['a'], nodeId: 'a' })).toEqual({
      copyMode: 'single',
      sourceIds: ['a'],
    });
  });

  it('allows a mixed selection with some copyable content even if the clicked selected item is screenplay', () => {
    const nodes = [node('screenplay', { type: 'screenplay' }), node('a')];
    expect(
      resolveCanvasNodeDragCopyMode({
        nodes,
        selectedIds: ['screenplay', 'a'],
        nodeId: 'screenplay',
      }),
    ).toEqual({ copyMode: 'selection', sourceIds: ['screenplay', 'a'] });
    expect(
      resolveCanvasNodeDragCopyMode({ nodes, selectedIds: ['screenplay'], nodeId: 'screenplay' }),
    ).toBeNull();
  });

  it.each([
    { id: '__temp_connection_node__' },
    { type: 'temp' },
    { data: { type: 'temp' } },
    { hidden: true },
  ])('rejects a dragged hidden or temporary node %j without granting multi mode', (patch) => {
    const value = node('a', patch);
    expect(
      resolveCanvasNodeDragCopyMode({
        nodes: [value, node('b')],
        selectedIds: [value.id, 'b'],
        nodeId: value.id,
      }),
    ).toBeNull();
  });

  it('rejects missing selection and IDs without allocating or consulting browser events', () => {
    expect(
      resolveCanvasNodeDragCopyMode({ nodes: [node('a')], selectedIds: [], nodeId: 'a' }),
    ).toBeNull();
    expect(
      resolveCanvasNodeDragCopyMode({
        nodes: [node('a')],
        selectedIds: ['missing'],
        nodeId: 'missing',
      }),
    ).toBeNull();
    expect(resolveCanvasNodeDragCopyMode()).toBeNull();
  });
});

const single = (nodes, patch = {}) =>
  planCanvasSingleNodeDragCopy({ nodes, edges: [], sourceId: 'a', makeId: ids(), ...patch });

describe('single-node Alt copy additions', () => {
  it('copies an immutable top-level node at the same position and clears task/guide state', () => {
    const source = node('a', {
      measured: { width: 400 },
      data: {
        type: 'script-v2',
        name: '海岸',
        title: '剧本',
        url: ['ready'],
        guide: {},
        guideMeta: {},
        taskInfo: { task: 'old' },
        openingUsed: true,
        directorAgentSessionId: 'old',
        isStale: true,
        params: { prompt: 'original prompt', settings: { quality: 'high' } },
      },
    });
    const before = structuredClone(source);
    const result = single([source]);
    expect(result).toMatchObject({
      valid: true,
      newAllIds: ['copy-1'],
      newTopLevelIds: ['copy-1'],
      edgeCopies: [],
    });
    expect(result.copies[0]).toMatchObject({
      id: 'copy-1',
      position: source.position,
      selected: false,
      dragging: false,
      data: {
        type: 'script-v2',
        name: '海岸 副本',
        title: '剧本 副本',
        url: ['ready'],
        isStale: false,
        params: source.data.params,
      },
    });
    for (const key of ['guide', 'guideMeta', 'taskInfo', 'openingUsed', 'directorAgentSessionId'])
      expect(result.copies[0].data).not.toHaveProperty(key);
    expect(result.copies[0]).not.toHaveProperty('measured');
    result.copies[0].data.params.settings.quality = 'changed';
    expect(source).toEqual(before);
  });

  it('detaches a group child into world coordinates without copying siblings or adding a new suffix', () => {
    const parent = node('g', {
      type: 'group',
      position: { x: 100, y: 200 },
      data: { childNodeIds: ['a', 'b'] },
    });
    const child = node('a', {
      parentId: 'g',
      extent: 'parent',
      position: { x: 5, y: 6 },
      data: {
        type: 'script-v2',
        name: '子项',
        title: '子剧本',
        _explicitContentDims: true,
        contentWidth: 480,
        contentHeight: 270,
        params: { scene: 'group-generate', settings: { ratio: '16:9' }, prompt: 'unchanged' },
      },
    });
    const sibling = node('b', { parentId: 'g' });
    const nodes = [parent, child, sibling];
    const before = structuredClone(nodes);
    const result = single(nodes);
    expect(result.copies).toHaveLength(1);
    expect(result.copies[0]).toMatchObject({
      position: { x: 105, y: 206 },
      data: {
        name: '子项',
        title: '子剧本',
        canvasAltDetachedCopy: true,
        params: { settings: { ratio: '16:9' }, prompt: 'unchanged' },
      },
    });
    for (const key of ['parentId', 'extent']) expect(result.copies[0]).not.toHaveProperty(key);
    for (const key of ['_explicitContentDims', 'contentWidth', 'contentHeight'])
      expect(result.copies[0].data).not.toHaveProperty(key);
    expect(result.copies[0].data.params).not.toHaveProperty('scene');
    expect(result.positions.get('copy-1')).toEqual({ x: 105, y: 206 });
    expect(nodes).toEqual(before);
    expect(plan(nodes, { sourceIds: ['a'] }).copies).toHaveLength(3);
  });

  it('accumulates nested group ancestors before detaching a single child', () => {
    const nodes = [
      node('outer', { type: 'group', position: { x: 100, y: 200 } }),
      node('g', { type: 'video_group', parentId: 'outer', position: { x: 30, y: 40 } }),
      node('a', { parentId: 'g', position: { x: -10, y: 5 } }),
    ];
    expect(single(nodes).copies[0]).toMatchObject({
      position: { x: 120, y: 245 },
      data: { canvasAltDetachedCopy: true },
    });
  });

  it('keeps a non-group parent, its relative coordinates and extent without adding a suffix', () => {
    const parent = node('parent');
    const child = node('a', { parentId: 'parent', extent: 'parent', position: { x: 5, y: 6 } });
    expect(single([parent, child]).copies[0]).toMatchObject({
      parentId: 'parent',
      extent: 'parent',
      position: { x: 5, y: 6 },
      data: { name: 'a' },
    });
    expect(single([parent, child]).copies[0].data).not.toHaveProperty('canvasAltDetachedCopy');
  });

  it.each([
    { _explicitContentDims: false, params: { scene: 'group-generate' } },
    { _explicitContentDims: true, params: { scene: 'ordinary' } },
  ])('preserves ordinary or unconfirmed dimensions after group detachment %j', (data) => {
    const source = node('a', {
      parentId: 'g',
      data: { ...data, contentWidth: 480, contentHeight: 270 },
    });
    const result = single([node('g', { type: 'group' }), source]);
    expect(result.copies[0].data).toMatchObject(source.data);
  });

  it('does not normalize an already top-level single node just because its explicit scene matches', () => {
    const source = node('a', {
      data: {
        _explicitContentDims: true,
        contentWidth: 480,
        contentHeight: 270,
        params: { scene: 'group-generate' },
      },
    });
    expect(single([source]).copies[0].data).toMatchObject(source.data);
  });

  it('detaches external generator references while preserving literal media, self references and unknown prompt text', () => {
    const source = node('a', {
      data: {
        type: 'script-v2',
        sourceScriptNodeId: 'outside',
        linkedImageGroupId: 'a',
        linkedVideoGroupId: 'outside',
        sourceImageGroupNodeId: 'outside',
        params: {
          prompt: '{{Image 1}} literal',
          imageList: [{ nodeId: 'outside', url: 'external' }, { nodeId: 'a' }, { url: 'literal' }],
          imageListOrder: ['outside', 'a'],
          videoList: [{ nodeId: 'outside' }],
          videoListOrder: ['outside'],
          textList: [{ nodeId: 'outside' }],
          mixedList: [{ nodeId: 'a' }, { nodeId: 'outside' }],
          scenePayload: {
            type: 'scene',
            source_images: [{ node_id: 'outside' }, { node_id: 'a' }, { url: 'unknown' }],
          },
          focusRegion: { nodeId: 'outside' },
        },
        assets: {
          characters: [
            { name: '角色', linkedNodeId: 'outside', thumbnailUrl: 'external' },
            { name: '本身', linkedNodeId: 'a', thumbnailUrl: 'self' },
          ],
          scenes: [{ name: '无关联', thumbnailUrl: 'unlinked' }],
          props: [{ name: '道具', linkedNodeId: 'outside' }],
        },
      },
    });
    const before = structuredClone(source);
    const copied = single([source, node('outside')]).copies[0].data;
    expect(copied.linkedImageGroupId).toBe('copy-1');
    for (const key of ['sourceScriptNodeId', 'linkedVideoGroupId', 'sourceImageGroupNodeId'])
      expect(copied).not.toHaveProperty(key);
    expect(copied.params).toMatchObject({
      prompt: '{{Image 1}} literal',
      imageList: [{ nodeId: 'copy-1' }, { url: 'literal' }],
      imageListOrder: ['copy-1'],
      videoList: [],
      videoListOrder: [],
      textList: [],
      mixedList: [{ nodeId: 'copy-1' }],
      mixedListOrder: ['copy-1'],
      scenePayload: { type: 'scene', source_images: [{ node_id: 'copy-1' }] },
    });
    expect(copied.params).not.toHaveProperty('focusRegion');
    expect(copied.assets).toEqual({
      characters: [
        { name: '角色' },
        { name: '本身', linkedNodeId: 'copy-1', thumbnailUrl: 'self' },
      ],
      scenes: [{ name: '无关联' }],
      props: [{ name: '道具' }],
    });
    expect(source).toEqual(before);
  });

  it('removes an empty detached scene payload but preserves other scene fields', () => {
    const empty = node('a', {
      data: { params: { scenePayload: { source_images: [{ node_id: 'outside' }] } } },
    });
    expect(single([empty]).copies[0].data.params).not.toHaveProperty('scenePayload');
    const named = node('a', {
      data: {
        params: { scenePayload: { name: 'scene', source_images: [{ node_id: 'outside' }] } },
      },
    });
    expect(single([named]).copies[0].data.params.scenePayload).toEqual({ name: 'scene' });
  });

  it('with Meta preserves external references and copies only original upstream targets, including self-loop source identity', () => {
    const source = node('a', {
      data: {
        sourceScriptNodeId: 'up',
        params: {
          imageList: [{ nodeId: 'up' }, { nodeId: 'a' }],
          imageListOrder: ['a'],
          focusRegion: { nodeId: 'up' },
        },
      },
    });
    const nodes = [source, node('up'), node('down')];
    const edges = [
      edge('incoming', 'up', 'a', { data: { label: 'unchanged' }, targetHandle: 'special-in' }),
      edge('self', 'a', 'a'),
      edge('outgoing', 'a', 'down'),
      edge('unrelated', 'up', 'down'),
      edge('missing', 'removed', 'a'),
    ];
    const before = structuredClone(edges);
    const result = single(nodes, { edges, copyEdges: true });
    expect(result.copies[0].data).toMatchObject({
      sourceScriptNodeId: 'up',
      params: {
        imageList: [{ nodeId: 'up' }, { nodeId: 'copy-1' }],
        imageListOrder: ['up', 'copy-1'],
        focusRegion: { nodeId: 'up' },
      },
    });
    expect(result.edgeCopies).toEqual([
      {
        id: 'copy-2',
        source: 'up',
        target: 'copy-1',
        data: { label: 'unchanged' },
        targetHandle: 'special-in',
      },
      { id: 'copy-3', source: 'a', target: 'copy-1' },
    ]);
    result.edgeCopies[0].data.label = 'changed';
    expect(edges).toEqual(before);
  });

  it('normalizes source-preserve empty references without erasing literal media or virtual-copy compatibility', () => {
    const source = node('a', {
      data: {
        params: {
          imageList: [{ nodeId: '' }, { url: 'ready' }],
          imageListOrder: [''],
          scenePayload: { source_images: [] },
        },
      },
    });
    const result = single([source], { copyEdges: true });
    expect(result.copies[0].data.params).toEqual({
      imageList: [{ url: 'ready' }],
      imageListOrder: [],
    });
    const virtual = plan([source]);
    expect(virtual.copies[0].data.params.imageList).toEqual(source.data.params.imageList);
    expect(virtual.copies[0].data.params.scenePayload).toEqual(source.data.params.scenePayload);
  });

  it.each([
    { type: 'screenplay' },
    { data: { type: 'screenplay' } },
    { type: 'group' },
    { type: 'video_group' },
    { hidden: true },
    { id: '__temp_connection_node__' },
    { type: 'temp' },
    { data: { type: 'temp' } },
    { parentId: 'removed' },
    { position: { x: NaN, y: 0 } },
  ])('rejects unqualified or invalid source %j before allocating additions', (patch) => {
    const source = node('a', patch);
    const makeId = vi.fn();
    const result = single([source], { sourceId: source.id, makeId });
    expect(result.valid).toBe(false);
    expect(result).not.toHaveProperty('copies');
    expect(makeId).not.toHaveBeenCalled();
  });

  it('rejects clone and edge-ID collision failures without returning a partial node or edge', () => {
    const cyclic = node('a');
    cyclic.data.loop = cyclic.data;
    expect(single([cyclic])).toEqual({ valid: false, reason: 'copyFailed' });
    let count = 0;
    const source = node('a');
    const result = single([source, node('up')], {
      edges: [edge('collision', 'up', 'a')],
      copyEdges: true,
      makeId: () => (++count === 1 ? 'valid-copy' : 'collision'),
    });
    expect(result).toEqual({ valid: false, reason: 'copyFailed' });
    expect(source.data.name).toBe('a');
  });
});
