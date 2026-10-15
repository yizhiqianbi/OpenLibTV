import { describe, expect, it, vi } from 'vitest';
import {
  collectReferencePickBoxIds,
  describeScriptV2ReferencePick,
  planScriptV2ReferenceDisconnect,
  planScriptV2ReferencePick,
} from './reference-pick-model.js';

const node = (id, type, data = {}, fields = {}) => ({
  id,
  type,
  data: {
    type,
    ...(type === 'image'
      ? { action: 'image_resource' }
      : type === 'script-v2'
        ? { action: 'script_generate' }
        : {}),
    ...data,
  },
  position: { x: 0, y: 0 },
  ...fields,
});
const target = () =>
  node('script', 'script-v2', {
    params: { prompt: '{{Image 1}}', imageListOrder: ['image-a'], model: 'existing' },
  });
const edge = (id, source, target = 'script', data) => ({
  id,
  source,
  target,
  ...(data ? { data } : {}),
});
const pick = (nodes, edges = [], options = {}) =>
  planScriptV2ReferencePick({
    nodes,
    edges,
    targetNodeId: 'script',
    sourceIds: ['image-a'],
    makeId: () => 'new-edge',
    ...options,
  });

describe('ScriptV2 IMAGE reference pick source rules (pure)', () => {
  it('permits canonical URLless generators, blob and hidden images but not other source kinds', () => {
    const nodes = [
      target(),
      node('empty', 'image', { action: 'image_generate' }),
      node('blob', 'image', { url: ['blob:pending'] }),
      node('hidden', 'image', {}, { hidden: true }),
      node('video', 'video'),
      node('text', 'text'),
      node('audio', 'audio'),
      node('character', 'group', { characterAsset: {} }),
    ];
    const result = describeScriptV2ReferencePick({ nodes, edges: [], targetNodeId: 'script' });
    expect([...result.pickableIds]).toEqual(['empty', 'blob', 'hidden']);
    expect(result.states.get('script')).toBe('self');
    expect(result.states.get('video')).toBe('blocked');
    expect(result.blockReasons.size).toBe(0);
    expect(result.limitCount).toBeNull();
  });
  it('honors source data type over flow type and the exact image action fallback', () => {
    const nodes = [
      target(),
      node('bad', 'image', { type: 'audio' }),
      node('good', 'custom', { type: 'image', action: 'image_edit' }),
      node('missing', 'image', { action: undefined }),
      node('row', 'image', { action: undefined, scriptRowHiddenUuid: 'shot' }),
    ];
    expect([
      ...describeScriptV2ReferencePick({ nodes, edges: [], targetNodeId: 'script' }).pickableIds,
    ]).toEqual(['good', 'row']);
  });
  it('does not invent a target action even though the separate source capacity helper allows a missing action', () => {
    const nodes = [node('script', 'script-v2', { action: undefined }), node('image-a', 'image')];
    const result = describeScriptV2ReferencePick({ nodes, edges: [], targetNodeId: 'script' });
    expect(result.valid).toBe(true);
    expect(result.pickableIds.size).toBe(0);
    expect(result.candidates[0].blockReason).toBe('modelUnsupported');
    expect(result.blockReasons.size).toBe(0);
  });
  it('applies source limit count only to capacity-blocked images and counts normal direct refs plus refImages', () => {
    const nodes = [
      node('script', 'script-v2', { action: 'script_resource', refImages: ['one', 'two'] }),
      node('connected', 'image'),
      node('virtual', 'image'),
      node('image-a', 'image'),
    ];
    const result = describeScriptV2ReferencePick({
      nodes,
      edges: [edge('e1', 'connected'), edge('e2', 'virtual', 'script', { assetVirtual: true })],
      targetNodeId: 'script',
    });
    expect(result.limitCount).toBe(3);
    expect(result.blockReasons.get('image-a')).toBe('limit');
    expect(result.candidates.find((item) => item.node.id === 'connected').connected).toBe(true);
  });
  it('keeps virtual-only refs connected but outside candidates and ordinary connected refs unpickable', () => {
    const nodes = [
      target(),
      node('image-a', 'image'),
      node('virtual', 'image'),
      node('both', 'image'),
    ];
    const edges = [
      edge('e1', 'image-a'),
      edge('e2', 'virtual', 'script', { portraitVirtual: true }),
      edge('e3', 'both', 'script', { assetVirtual: true }),
      edge('e4', 'both'),
    ];
    const result = describeScriptV2ReferencePick({ nodes, edges, targetNodeId: 'script' });
    expect([...result.connectedIds]).toEqual(['image-a', 'virtual', 'both']);
    expect(result.pickableIds.size).toBe(0);
    expect(result.candidates.map((item) => item.node.id)).toEqual(['image-a', 'both']);
    expect(result.states.get('virtual')).toBe('connected');
    expect(pick(nodes, edges).changed).toBe(false);
  });
  it('does not assign group-edge members connected state or erase ref exclusions to fabricate a direct ref', () => {
    const nodes = [
      target(),
      node('group', 'group'),
      node('image-a', 'image', {}, { parentId: 'group' }),
    ];
    const result = describeScriptV2ReferencePick({
      nodes,
      edges: [edge('existing', 'group')],
      targetNodeId: 'script',
    });
    expect(result.connectedIds.size).toBe(0);
    expect(result.pickableIds.has('image-a')).toBe(true);
    expect(result.groupPickableIds.has('group')).toBe(true);
  });
  it('uses source candidate highlighting before the commit-only reverse-duplicate check', () => {
    const nodes = [target(), node('image-a', 'image')],
      edges = [edge('reverse', 'script', 'image-a')];
    expect(
      describeScriptV2ReferencePick({ nodes, edges, targetNodeId: 'script' }).pickableIds.has(
        'image-a',
      ),
    ).toBe(true);
    const makeId = vi.fn();
    const result = pick(nodes, edges, { makeId });
    expect(result).toMatchObject({
      valid: true,
      changed: false,
      reason: 'duplicate',
      warnings: [],
    });
    expect(result.edges).toBe(edges);
    expect(makeId).not.toHaveBeenCalled();
  });
  it('rejects a dependency cycle at commit while ignoring source REFERENCE outgoing edges as the source connector does', () => {
    const nodes = [target(), node('image-a', 'image'), node('middle', 'text')],
      edges = [edge('a', 'script', 'middle'), edge('b', 'middle', 'image-a')];
    expect(
      describeScriptV2ReferencePick({ nodes, edges, targetNodeId: 'script' }).pickableIds.has(
        'image-a',
      ),
    ).toBe(true);
    expect(pick(nodes, edges).reason).toBe('cycle');
    const refs = [target(), node('image-a', 'image'), node('ref', 'reference')];
    expect(pick(refs, [edge('a', 'script', 'ref'), edge('b', 'ref', 'image-a')]).changed).toBe(
      true,
    );
  });
  it('adds one normal edge, preserves all nodes/params/tokens and returns only source selection operations', () => {
    const nodes = [target(), node('image-a', 'image')],
      edges = [];
    const before = structuredClone(nodes);
    const result = pick(nodes, edges);
    expect(result.nodes).toBe(nodes);
    expect(nodes).toEqual(before);
    expect(result.edges).toEqual([
      {
        id: 'new-edge',
        source: 'image-a',
        sourceHandle: 'source',
        target: 'script',
        targetHandle: 'target',
      },
    ]);
    expect(result.selectionChanges).toEqual([
      { id: 'image-a', type: 'select', selected: false },
      { id: 'script', type: 'select', selected: true },
    ]);
    expect(result.connectedCount).toBe(1);
    expect(result.removedEdgeIds).toEqual([]);
  });
  it('adds box IDs in document node order, not selection order, and only selects the target', () => {
    const nodes = [target(), node('image-a', 'image'), node('image-b', 'image')];
    let next = 0;
    const result = pick(nodes, [], {
      surface: 'box',
      sourceIds: ['image-b', 'image-a'],
      makeId: () => `edge-${++next}`,
    });
    expect(result.edges.map((item) => item.source)).toEqual(['image-a', 'image-b']);
    expect(result.selectionChanges).toEqual([{ id: 'script', type: 'select', selected: true }]);
  });
  it('expands flow GROUP descendants and warns for unsupported group members while preserving connected refs', () => {
    const nodes = [
      target(),
      node('group', 'group'),
      node('nested', 'group', {}, { parentId: 'group' }),
      node('image-a', 'image', {}, { parentId: 'nested' }),
      node('ready', 'image', {}, { parentId: 'group' }),
      node('video', 'video', {}, { parentId: 'group' }),
      node('text', 'text', {}, { parentId: 'group' }),
      node('reference', 'reference', {}, { parentId: 'group' }),
    ];
    const result = pick(nodes, [edge('existing', 'ready')], {
      surface: 'group',
      groupId: 'group',
      sourceIds: [],
    });
    expect(result.edges.at(-1).source).toBe('image-a');
    expect(result.alreadyConnected).toBe(1);
    expect(result.unsupportedSkipped).toBe(2);
    expect(result.warnings).toEqual(['referencePickGroupPartialUnsupported']);
    expect(result.selectionChanges).toEqual([
      { id: 'group', type: 'select', selected: false },
      { id: 'script', type: 'select', selected: true },
    ]);
    const description = describeScriptV2ReferencePick({ nodes, edges: [], targetNodeId: 'script' });
    expect([...description.groupPickableIds]).toEqual(['nested', 'group']);
  });
  it('does not recurse flow VIDEO_GROUP when expanding an ordinary group', () => {
    const nodes = [
      target(),
      node('group', 'group'),
      node('vg', 'video_group', {}, { parentId: 'group' }),
      node('image-a', 'image', {}, { parentId: 'vg' }),
    ];
    const result = pick(nodes, [], { groupId: 'group', surface: 'group', sourceIds: [] });
    expect(result.changed).toBe(false);
    expect(result.warnings).toEqual(['referencePickGroupAllUnsupported']);
    expect(
      describeScriptV2ReferencePick({
        nodes,
        edges: [],
        targetNodeId: 'script',
      }).groupPickableIds.has('group'),
    ).toBe(false);
  });
  it('returns source all-unsupported vs partial group warnings without affecting ordinary node/box clicks', () => {
    const nodes = [
      target(),
      node('group', 'group'),
      node('video', 'video', {}, { parentId: 'group' }),
    ];
    expect(pick(nodes, [], { surface: 'group', groupId: 'group', sourceIds: [] }).warnings).toEqual(
      ['referencePickGroupAllUnsupported'],
    );
    expect(pick(nodes, [], { sourceIds: ['video'] }).warnings).toEqual([]);
    expect(pick(nodes, [], { surface: 'box', sourceIds: ['video'] }).warnings).toEqual([]);
  });
  it('rolls back every staged edge when the second allocated ID is invalid or collides', () => {
    const nodes = [target(), node('image-a', 'image'), node('image-b', 'image')],
      edges = [];
    let n = 0;
    const result = pick(nodes, edges, {
      surface: 'box',
      sourceIds: ['image-a', 'image-b'],
      makeId: () => (++n === 1 ? 'first' : 'script'),
    });
    expect(result.valid).toBe(false);
    expect(result.nodes).toBe(nodes);
    expect(result.edges).toBe(edges);
    expect(result.addedEdgeIds).toEqual([]);
    expect(edges).toEqual([]);
  });
  it('refuses missing/throwing ID factories without publishing a partial graph or selection', () => {
    const nodes = [target(), node('image-a', 'image')];
    expect(pick(nodes, [], { makeId: undefined })).toMatchObject({
      valid: false,
      addedEdgeIds: [],
      selectionChanges: [],
    });
    expect(
      pick(nodes, [], {
        makeId: () => {
          throw Error('no id');
        },
      }),
    ).toMatchObject({ valid: false, changed: false });
  });
  it('preserves exact character edge metadata only with an explicit caller clock and a real source state', () => {
    const characterAsset = {
      roleId: 'role',
      roleName: '角色',
      characterUuid: 'char',
      versionId: 'ver',
      version: 2,
      defaultStateId: 'state',
      states: [
        { id: 'state', name: '状态', mainReferenceImageUrl: '/portrait', voice: { id: 'voice' } },
      ],
    };
    const nodes = [target(), node('image-a', 'image', { characterAsset })];
    expect(pick(nodes).valid).toBe(false);
    const result = pick(nodes, [], { nowMs: 1000 });
    expect(result.edges[0].data.characterRef).toEqual({
      roleId: 'role',
      roleName: '角色',
      characterUuid: 'char',
      versionId: 'ver',
      version: 2,
      stateId: 'state',
      stateName: '状态',
      mainReferenceImageUrl: '/portrait',
      voice: { id: 'voice' },
      capturedAtMs: 1000,
    });
    expect(result.edges[0].data.characterRef.voice).not.toBe(characterAsset.states[0].voice);
  });
  it('removes only the first direct edge including virtual metadata and leaves selections and later refs intact', () => {
    const nodes = [target(), node('image-a', 'image')],
      edges = [
        edge('virtual', 'image-a', 'script', { portraitVirtual: true }),
        edge('normal', 'image-a'),
      ];
    const result = planScriptV2ReferenceDisconnect({
      nodes,
      edges,
      targetNodeId: 'script',
      sourceId: 'image-a',
    });
    expect(result.nodes).toBe(nodes);
    expect(result.edges).toEqual([edges[1]]);
    expect(result.removedEdgeIds).toEqual(['virtual']);
    expect(result.selectionChanges).toEqual([]);
    expect(
      describeScriptV2ReferencePick({
        nodes,
        edges: result.edges,
        targetNodeId: 'script',
      }).states.get('image-a'),
    ).toBe('connected');
  });
  it('does not disconnect indirect group refs or fabricate an excluded member update', () => {
    const nodes = [
        target(),
        node('group', 'group'),
        node('image-a', 'image', {}, { parentId: 'group' }),
      ],
      edges = [edge('group-edge', 'group')];
    const result = planScriptV2ReferenceDisconnect({
      nodes,
      edges,
      targetNodeId: 'script',
      sourceId: 'image-a',
    });
    expect(result).toMatchObject({ valid: true, changed: false, reason: 'not-connected' });
    expect(result.edges).toBe(edges);
  });
  it('returns an atomic invalid result for duplicate graph IDs, wrong targets or malformed source requests', () => {
    const nodes = [target(), node('image-a', 'image')];
    expect(pick([...nodes, nodes[1]]).valid).toBe(false);
    expect(pick(nodes, [edge('image-a', 'image-a')]).valid).toBe(false);
    expect(pick(nodes, [], { targetNodeId: 'image-a' }).valid).toBe(false);
    expect(pick(nodes, [], { sourceIds: ['image-a', 'image-a'] }).valid).toBe(false);
  });
});

describe('source reference custom box geometry', () => {
  it('uses world parents, strict overlap and measured dimensions in document order', () => {
    const nodes = [
      node('g', 'group', {}, { position: { x: 100, y: 100 } }),
      node(
        'a',
        'image',
        {},
        {
          parentId: 'g',
          position: { x: 10, y: 10 },
          width: 100,
          height: 100,
          measured: { width: 20, height: 10 },
        },
      ),
      node('b', 'image', {}, { position: { x: 119, y: 119 }, width: 20, height: 20 }),
    ];
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds: new Set(['b', 'a']),
        rect: { x: 119, y: 119, width: 20, height: 20 },
      }),
    ).toEqual(['a', 'b']);
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds: new Set(['a']),
        rect: { x: 130, y: 110, width: 10, height: 10 },
      }),
    ).toEqual([]);
  });
  it('retains the source 200×120 fallback and excludes zero-area rectangles', () => {
    const nodes = [node('a', 'image')],
      pickableIds = new Set(['a']);
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds,
        rect: { x: 199, y: 119, width: 2, height: 2 },
      }),
    ).toEqual(['a']);
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds,
        rect: { x: 200, y: 120, width: 2, height: 2 },
      }),
    ).toEqual([]);
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds,
        rect: { x: 0, y: 0, width: 0, height: 10 },
      }),
    ).toEqual([]);
  });
  it('allows an explicit local renderer size projection without rewriting stored dimensions', () => {
    const nodes = [node('a', 'image', {}, { width: 10, height: 10 })],
      options = { nodes, pickableIds: new Set(['a']), rect: { x: 15, y: 15, width: 2, height: 2 } };
    expect(collectReferencePickBoxIds(options)).toEqual([]);
    expect(
      collectReferencePickBoxIds({ ...options, getNodeSize: () => ({ width: 20, height: 20 }) }),
    ).toEqual(['a']);
    expect(nodes[0].width).toBe(10);
  });
  it('stops parent projection at the exact source 32-ancestor bound', () => {
    const groups = Array.from({ length: 33 }, (_, index) =>
      node(
        `g${index}`,
        'group',
        {},
        { parentId: index === 32 ? undefined : `g${index + 1}`, position: { x: 1, y: 1 } },
      ),
    );
    const nodes = [...groups, node('a', 'image', {}, { parentId: 'g0', width: 1, height: 1 })];
    expect(
      collectReferencePickBoxIds({
        nodes,
        pickableIds: new Set(['a']),
        rect: { x: 32, y: 32, width: 1, height: 1 },
      }),
    ).toEqual(['a']);
  });
});
