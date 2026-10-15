import { describe, expect, it } from 'vitest';
import {
  canvasStoryboardEdgeRequiresConfirmation,
  canvasStoryboardUnlinkIdentity,
  canvasStoryboardUnlinkNotice,
  planCanvasStoryboardUnlink,
} from './storyboard-unlink-model.js';

const node = (id, type, data = {}) => ({
  id,
  type,
  position: { x: 20, y: 30 },
  data: { type, name: id, ...data },
});
const edge = { id: 'link', source: 's', target: 'g', data: { preserved: true } };
const legacy = () => [
  node('s', 'script', {
    linkedImageGroupId: 'g',
    linkedVideoGroupId: 'other',
    rows: [{ hiddenUuid: 'row', shotNumber: 37, plotDescription: '保留' }],
    params: { prompt: '保留末次输入', model: 'model' },
  }),
  node('g', 'group', {
    sourceScriptNodeId: 's',
    storyboardTitle: '保留镜头内容的关联组',
    sourceScriptVersion: 'v1',
    storyboardGroupType: 'image',
    childNodeIds: ['child'],
    storyboardSourceRowHiddenUuids: ['row'],
  }),
  { ...node('child', 'image', { scriptRowHiddenUuid: 'row' }), parentId: 'g' },
  node('outside', 'text', { content: ['保留'] }),
];
const data = (value, id) => value.nodes.find((item) => item.id === id).data;

describe('source raw-type storyboard edge confirmation', () => {
  it.each([false, true])(
    'confirms a legacy script/group relation in either direction: %s',
    (reverse) => {
      expect(
        canvasStoryboardEdgeRequiresConfirmation(
          legacy(),
          reverse ? { ...edge, source: 'g', target: 's' } : edge,
        ),
      ).toBe(true);
    },
  );

  it('uses exact source locale and source default dismiss controls', () => {
    expect(canvasStoryboardUnlinkNotice).toEqual({
      title: '断开连线',
      message: '断开后脚本关联关系将消失，重新生成时将不再关联脚本信息了。确定要断开吗？',
      confirmText: '确定断开',
      cancelText: '取消',
      closeOnBackdrop: false,
      showCloseButton: false,
    });
  });

  it('does not broaden the source to a reachable programmatic script-v2/group edge', () => {
    const nodes = legacy();
    nodes[0] = node('s', 'script-v2', nodes[0].data);
    nodes[0].data.type = 'script-v2';
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, edge)).toBe(false);
    nodes[0].type = 'script';
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, edge)).toBe(false);
    nodes[0].data.type = 'script';
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, edge)).toBe(true);
  });

  it.each([undefined, '', null, false])(
    'requires a truthy script source on the group: %s',
    (value) => {
      const nodes = legacy();
      nodes[1].data.sourceScriptNodeId = value;
      expect(canvasStoryboardEdgeRequiresConfirmation(nodes, edge)).toBe(false);
    },
  );

  it('requires both endpoints without inferring node kind from a local type', () => {
    expect(canvasStoryboardEdgeRequiresConfirmation(legacy().slice(1), edge)).toBe(false);
    const nodes = legacy();
    delete nodes[0].data.type;
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, edge)).toBe(false);
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, null)).toBe(false);
  });

  it('allows group/group with a v2 source and real direct row child, regardless of source node type', () => {
    const nodes = legacy();
    nodes[0] = node('s', 'script-v2');
    nodes.push(node('g2', 'group'));
    const relation = { ...edge, source: 'g', target: 'g2' };
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, relation)).toBe(true);
    nodes[0].data.type = 'text';
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, relation)).toBe(true);
    nodes[2].parentId = 'nested';
    expect(canvasStoryboardEdgeRequiresConfirmation(nodes, relation)).toBe(false);
  });

  it('prefers the source group relation even if the target group has a valid source and row', () => {
    const nodes = legacy();
    nodes[1].data.sourceScriptNodeId = 'missing';
    nodes.push(node('g2', 'group', { sourceScriptNodeId: 's' }));
    nodes.push({ ...node('c2', 'image', { scriptRowHiddenUuid: 'other-row' }), parentId: 'g2' });
    expect(
      canvasStoryboardEdgeRequiresConfirmation(nodes, { ...edge, source: 'g', target: 'g2' }),
    ).toBe(false);
    nodes[1].data.sourceScriptNodeId = '';
    expect(
      canvasStoryboardEdgeRequiresConfirmation(nodes, { ...edge, source: 'g', target: 'g2' }),
    ).toBe(true);
  });
});

describe('source unlinkByEdge with preserveEdge', () => {
  it('clears only matching image link and group source/title, retaining nodes, rows, bindings and edges', () => {
    const nodes = legacy(),
      before = structuredClone(nodes),
      edges = [edge];
    const result = planCanvasStoryboardUnlink({ nodes, edges, edgeId: edge.id });
    const expected = structuredClone(before);
    delete expected[0].data.linkedImageGroupId;
    delete expected[1].data.sourceScriptNodeId;
    delete expected[1].data.storyboardTitle;
    expect(result.nodes).toEqual(expected);
    expect(result.edges).toBe(edges);
    expect(result.changedNodeIds).toEqual(['s', 'g']);
    expect(result.nodes[2]).toBe(nodes[2]);
    expect(data(result, 's').rows).toBe(nodes[0].data.rows);
    expect(data(result, 'g').childNodeIds).toBe(nodes[1].data.childNodeIds);
    expect(nodes).toEqual(before);
  });

  it('infers matching video in reverse direction without changing the image pointer', () => {
    const nodes = legacy();
    nodes[0].data.linkedImageGroupId = 'other';
    nodes[0].data.linkedVideoGroupId = 'g';
    const edges = [{ ...edge, source: 'g', target: 's' }];
    const result = planCanvasStoryboardUnlink({ nodes, edges, edgeId: edge.id });
    expect(data(result, 's').linkedImageGroupId).toBe('other');
    expect(data(result, 's')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(result, 'g')).not.toHaveProperty('sourceScriptNodeId');
    expect(result.edges).toBe(edges);
  });

  it('uses image priority when both linked fields point to the same direct group', () => {
    const nodes = legacy();
    nodes[0].data.linkedVideoGroupId = 'g';
    const result = planCanvasStoryboardUnlink({ nodes, edges: [edge], edgeId: edge.id });
    expect(data(result, 's')).not.toHaveProperty('linkedImageGroupId');
    expect(data(result, 's').linkedVideoGroupId).toBe('g');
  });

  it('retains a replaced script pointer while unlinking the actual group metadata', () => {
    const nodes = legacy();
    nodes[0].data.linkedImageGroupId = 'replacement';
    const result = planCanvasStoryboardUnlink({ nodes, edges: [edge], edgeId: edge.id });
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(data(result, 'g')).not.toHaveProperty('sourceScriptNodeId');
    expect(result.changedNodeIds).toEqual(['g']);
  });

  it('does not retarget a direct legacy relation to the group source ID', () => {
    const nodes = legacy();
    nodes[1].data.sourceScriptNodeId = 'different';
    nodes.push(node('different', 'script', { linkedImageGroupId: 'g' }));
    const result = planCanvasStoryboardUnlink({ nodes, edges: [edge], edgeId: edge.id });
    expect(data(result, 's')).not.toHaveProperty('linkedImageGroupId');
    expect(result.nodes[4]).toBe(nodes[4]);
    expect(data(result, 'different').linkedImageGroupId).toBe('g');
  });

  it('updates group/group video endpoints target first, using fixed video kind with a v2 script', () => {
    const nodes = [
      node('s1', 'script-v2', { linkedImageGroupId: 'g1', linkedVideoGroupId: 'g1' }),
      node('s2', 'script-v2', { linkedVideoGroupId: 'g2' }),
      node('g1', 'group', {
        sourceScriptNodeId: 's1',
        storyboardTitle: 'one',
        storyboardGroupType: 'video',
      }),
      node('g2', 'group', {
        sourceScriptNodeId: 's2',
        storyboardTitle: 'two',
        storyboardGroupType: 'video',
      }),
    ];
    const edges = [{ ...edge, source: 'g1', target: 'g2' }];
    const result = planCanvasStoryboardUnlink({ nodes, edges, edgeId: edge.id });
    expect(result.changedNodeIds).toEqual(['s2', 'g2', 's1', 'g1']);
    expect(data(result, 's1').linkedImageGroupId).toBe('g1');
    expect(data(result, 's1')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(result, 's2')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(result, 'g1')).not.toHaveProperty('sourceScriptNodeId');
    expect(data(result, 'g2')).not.toHaveProperty('sourceScriptNodeId');
    expect(result.edges).toBe(edges);
  });

  it('preserves the image endpoint of group/group and clears video metadata even if its source node is missing', () => {
    const nodes = [
      node('g1', 'group', {
        sourceScriptNodeId: 's1',
        storyboardTitle: 'image',
        storyboardGroupType: 'image',
      }),
      node('g2', 'group', {
        sourceScriptNodeId: 'missing',
        storyboardTitle: 'video',
        storyboardGroupType: 'video',
      }),
    ];
    const result = planCanvasStoryboardUnlink({
      nodes,
      edges: [{ ...edge, source: 'g1', target: 'g2' }],
      edgeId: edge.id,
    });
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(data(result, 'g2')).toEqual({ type: 'group', name: 'g2', storyboardGroupType: 'video' });
    expect(result.changedNodeIds).toEqual(['g2']);
  });

  it('retains existing undefined keys outside the unlink patch, as source t6 does', () => {
    const nodes = legacy();
    nodes[0].data.unrelatedUndefined = undefined;
    nodes[2].data.unrelatedUndefined = undefined;
    const result = planCanvasStoryboardUnlink({ nodes, edges: [edge], edgeId: edge.id });
    expect(Object.hasOwn(data(result, 's'), 'unrelatedUndefined')).toBe(true);
    expect(Object.hasOwn(data(result, 'child'), 'unrelatedUndefined')).toBe(true);
  });

  it('normalizes legacy label/name on the whole merged updated data, without touching child data', () => {
    const nodes = legacy();
    nodes[0].data.name = '';
    nodes[0].data.label = '原脚本标签';
    nodes[1].data.name = undefined;
    nodes[1].data.label = '原组标签';
    nodes[2].data.label = '子节点不在本次patch中';
    const result = planCanvasStoryboardUnlink({ nodes, edges: [edge], edgeId: edge.id });
    expect(data(result, 's').name).toBe('原脚本标签');
    expect(data(result, 'g').name).toBe('原组标签');
    expect(data(result, 's')).not.toHaveProperty('label');
    expect(data(result, 'g')).not.toHaveProperty('label');
    expect(data(result, 'child').label).toBe('子节点不在本次patch中');
  });

  it('returns null for a removed edge or endpoint without mutating anything', () => {
    expect(planCanvasStoryboardUnlink({ nodes: legacy(), edges: [], edgeId: edge.id })).toBeNull();
    expect(
      planCanvasStoryboardUnlink({ nodes: legacy().slice(1), edges: [edge], edgeId: edge.id }),
    ).toBeNull();
  });
});

describe('confirmation binding identity', () => {
  it('permits latest prompts, script rows, positions and measurements while detecting replaced bindings', () => {
    const nodes = legacy(),
      before = canvasStoryboardUnlinkIdentity(nodes, edge);
    const next = structuredClone(nodes);
    next[0].data.params.prompt = '最后150ms输入';
    next[0].data.rows[0].plotDescription = '最新未保存行';
    next[1].position.x += 100;
    next[1].measured = { width: 500, height: 200 };
    expect(canvasStoryboardUnlinkIdentity(next, edge)).toEqual(before);
    next[0].data.linkedImageGroupId = 'new-owner';
    expect(canvasStoryboardUnlinkIdentity(next, edge)).not.toEqual(before);
  });

  it('detects child-row binding change or missing script without comparing unrelated node edits', () => {
    const nodes = legacy(),
      before = canvasStoryboardUnlinkIdentity(nodes, edge);
    nodes[3].data.content = ['changed'];
    expect(canvasStoryboardUnlinkIdentity(nodes, edge)).toEqual(before);
    nodes[2].data.scriptRowHiddenUuid = 'new-row';
    expect(canvasStoryboardUnlinkIdentity(nodes, edge)).not.toEqual(before);
    expect(canvasStoryboardUnlinkIdentity(nodes.slice(1), edge)).not.toEqual(before);
  });
});
