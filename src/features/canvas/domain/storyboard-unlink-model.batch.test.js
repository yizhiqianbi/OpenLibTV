import { describe, expect, it } from 'vitest';
import { planCanvasStoryboardUnlinks } from './storyboard-unlink-model.js';

const node = (id, type, data = {}) => ({
  id,
  type,
  position: { x: 20, y: 30 },
  data: { type, name: id, ...data },
});
const fixture = () => ({
  nodes: [
    node('first-script', 'script', {
      linkedImageGroupId: 'shared',
      linkedVideoGroupId: 'shared',
      rows: [{ hiddenUuid: 'row', plotDescription: '保留正文' }],
    }),
    node('second-script', 'script', { linkedVideoGroupId: 'shared' }),
    node('shared', 'group', {
      sourceScriptNodeId: 'first-script',
      storyboardTitle: '共享绑定',
      storyboardGroupType: 'image',
      childNodeIds: ['child'],
      storyboardSourceRowHiddenUuids: ['row'],
    }),
    { ...node('child', 'image', { scriptRowHiddenUuid: 'row' }), parentId: 'shared' },
    node('outside', 'text', { content: ['保留'] }),
  ],
  edges: [
    { id: 'first', source: 'first-script', target: 'shared', data: { keep: 1 } },
    { id: 'second', source: 'second-script', target: 'shared', data: { keep: 2 } },
  ],
});
const data = (plan, id) => plan.nodes.find((value) => value.id === id).data;

describe('prequalified storyboard unlink cohort, source helper ordering', () => {
  it('accepts both shared-group relations before the first helper clears their qualification', () => {
    const f = fixture(),
      before = structuredClone(f);
    const plan = planCanvasStoryboardUnlinks({ ...f, edgeIds: ['first', 'second'] });
    expect(plan.changedNodeIds).toEqual(['first-script', 'shared']);
    expect(data(plan, 'first-script')).not.toHaveProperty('linkedImageGroupId');
    expect(data(plan, 'first-script').linkedVideoGroupId).toBe('shared');
    expect(data(plan, 'second-script').linkedVideoGroupId).toBe('shared');
    expect(data(plan, 'shared')).not.toHaveProperty('sourceScriptNodeId');
    expect(data(plan, 'shared')).not.toHaveProperty('storyboardTitle');
    expect(data(plan, 'shared').childNodeIds).toEqual(['child']);
    expect(data(plan, 'shared').storyboardSourceRowHiddenUuids).toEqual(['row']);
    expect(data(plan, 'first-script').rows).toBe(f.nodes[0].data.rows);
    expect(plan.nodes.slice(3)).toEqual(before.nodes.slice(3));
    expect(plan.nodes[1]).toBe(f.nodes[1]);
    expect(plan.edges).toBe(f.edges);
    expect(f).toEqual(before);
  });

  it('preserves request order and reads latest patches rather than applying two frozen old bindings', () => {
    const f = fixture();
    const plan = planCanvasStoryboardUnlinks({ ...f, edgeIds: ['second', 'first'] });
    expect(plan.changedNodeIds).toEqual(['second-script', 'shared']);
    expect(data(plan, 'second-script')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(plan, 'first-script').linkedImageGroupId).toBe('shared');
    expect(data(plan, 'first-script').linkedVideoGroupId).toBe('shared');
    expect(plan.nodes[0]).toBe(f.nodes[0]);
    expect(data(plan, 'shared')).not.toHaveProperty('sourceScriptNodeId');
    expect(plan.edges).toBe(f.edges);
  });

  it('keeps duplicate requests in the source helper sequence without duplicate changed IDs', () => {
    const f = fixture();
    const plan = planCanvasStoryboardUnlinks({ ...f, edgeIds: ['first', 'first', 'second'] });
    expect(plan.changedNodeIds).toEqual(['first-script', 'shared']);
    expect(data(plan, 'first-script').linkedVideoGroupId).toBe('shared');
    expect(data(plan, 'second-script').linkedVideoGroupId).toBe('shared');
    expect(plan.edges).toBe(f.edges);
  });

  it.each(['missing', 'unrelated', 'v2'])(
    'rejects the whole cohort when its last relation is %s',
    (last) => {
      const f = fixture(),
        before = structuredClone(f);
      f.nodes.push(node('v2-script', 'script-v2'));
      f.edges.push({ id: 'unrelated', source: 'outside', target: 'shared' });
      f.edges.push({ id: 'v2', source: 'v2-script', target: 'shared' });
      const expanded = structuredClone(f);
      expect(planCanvasStoryboardUnlinks({ ...f, edgeIds: ['first', last] })).toBeNull();
      expect(f).toEqual(expanded);
      expect(f.nodes.slice(0, before.nodes.length)).toEqual(before.nodes);
    },
  );

  it.each([undefined, null, [], [''], [null], [23]])(
    'rejects invalid requested IDs %j',
    (edgeIds) => {
      const f = fixture();
      expect(planCanvasStoryboardUnlinks({ ...f, edgeIds })).toBeNull();
    },
  );

  it('does not replace a missing endpoint or broaden group/group direct-child qualification', () => {
    const f = fixture();
    f.nodes = f.nodes.filter((value) => value.id !== 'second-script');
    expect(planCanvasStoryboardUnlinks({ ...f, edgeIds: ['first', 'second'] })).toBeNull();
    f.nodes.push(node('other-group', 'group'));
    f.edges.push({ id: 'groups', source: 'shared', target: 'other-group' });
    f.nodes[2] = { ...f.nodes[2], parentId: 'nested' };
    expect(planCanvasStoryboardUnlinks({ ...f, edgeIds: ['first', 'groups'] })).toBeNull();
  });

  it('runs target-first fixed-video group/group helpers before the next direct script relation', () => {
    const f = {
      nodes: [
        node('s1', 'text', { linkedImageGroupId: 'g1', linkedVideoGroupId: 'g1' }),
        node('s2', 'script', { linkedVideoGroupId: 'g2' }),
        node('g1', 'group', {
          sourceScriptNodeId: 's1',
          storyboardGroupType: 'video',
          storyboardTitle: 'one',
        }),
        node('g2', 'group', {
          sourceScriptNodeId: 's2',
          storyboardGroupType: 'video',
          storyboardTitle: 'two',
        }),
        { ...node('child', 'image', { scriptRowHiddenUuid: 'row' }), parentId: 'g1' },
      ],
      edges: [
        { id: 'groups', source: 'g1', target: 'g2' },
        { id: 'direct', source: 's2', target: 'g2' },
      ],
    };
    const plan = planCanvasStoryboardUnlinks({ ...f, edgeIds: ['groups', 'direct'] });
    expect(plan.changedNodeIds).toEqual(['s2', 'g2', 's1', 'g1']);
    expect(data(plan, 's1').linkedImageGroupId).toBe('g1');
    expect(data(plan, 's1')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(plan, 's2')).not.toHaveProperty('linkedVideoGroupId');
    expect(data(plan, 'g1')).not.toHaveProperty('sourceScriptNodeId');
    expect(data(plan, 'g2')).not.toHaveProperty('sourceScriptNodeId');
    expect(plan.nodes[4]).toBe(f.nodes[4]);
    expect(plan.edges).toBe(f.edges);
  });
});
