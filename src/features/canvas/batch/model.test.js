// @vitest-environment node
import { describe, expect, it } from 'vitest';
import models from '../../../../public/data/models.json';
import { buildCanvasBatchPlan, canvasBatchConfirmation, canvasGroupMembers } from './model.js';

const group = { id: 'group', type: 'group', data: { childNodeIds: [] } };
const generator = (id, type = 'text', params = {}) => ({
  id,
  parentId: 'group',
  type,
  data: {
    type,
    name: id,
    action: `${type}_generate`,
    params: { model: models.default[type], prompt: `${id}独立提示词`, ...params },
  },
});
describe('ordinary canvas batch plan', () => {
  it('keeps mixed models and modes separate and resolves real referenced media per node', () => {
    const first = generator('first', 'video', { model: 'kling-v3-omni', modeType: 'frames2video' });
    const second = generator('second', 'video', {
      model: 'star-video2',
      settings: { resolution: '1080p', duration: 12 },
    });
    const images = [0, 1].map((index) => ({
      id: `ref${index}`,
      type: 'image',
      data: { type: 'image', action: 'image_resource', url: [`/ref${index}.png`] },
    }));
    const nodes = [group, first, second, ...images];
    const edges = images.map((image) => ({ source: image.id, target: 'first' }));
    const before = JSON.stringify(nodes);
    const plan = buildCanvasBatchPlan({ groupId: 'group', nodes, edges, models });
    expect(plan.nodeIds).toEqual(['first', 'second']);
    expect(plan.nodes[0].generator).toMatchObject({
      model: 'kling-v3-omni',
      params: { prompt: 'first独立提示词', modeType: 'frames2video' },
      inputCounts: { imageList: 2 },
      error: '',
    });
    expect(plan.nodes[1].generator).toMatchObject({
      model: 'star-video2',
      params: { prompt: 'second独立提示词', settings: { resolution: '1080p', duration: 12 } },
    });
    expect(JSON.stringify(nodes)).toBe(before);
  });
  it('uses parent links and ordered child IDs safely, with bounded nested group expansion', () => {
    const inner = {
      id: 'inner',
      parentId: 'group',
      type: 'group',
      data: { childNodeIds: ['deep', 'missing', 'group', 'foreign'] },
    };
    const deep = { ...generator('deep'), parentId: 'inner' };
    const foreign = { ...generator('foreign'), parentId: 'other' };
    const nodes = [
      { ...group, data: { childNodeIds: ['inner', 'legacy'] } },
      generator('plain'),
      inner,
      deep,
      foreign,
      { ...generator('legacy'), parentId: undefined },
    ];
    expect(canvasGroupMembers(nodes, 'group').map((item) => item.id)).toEqual([
      'inner',
      'deep',
      'legacy',
      'plain',
    ]);
    expect(canvasGroupMembers(nodes, 'group', 1).map((item) => item.id)).toEqual([
      'inner',
      'legacy',
      'plain',
    ]);
    expect(canvasGroupMembers(nodes, 'plain')).toEqual([]);
  });
  it('filters special nodes and resources, keeps incoming resource endpoints, and sorts graph layers', () => {
    const resource = {
      id: 'resource',
      parentId: 'group',
      type: 'image',
      data: { type: 'image', action: 'image_resource', url: ['/actual.png'] },
    };
    const ignored = { id: '3d', parentId: 'group', type: 'director-console-3d', data: {} };
    const linkedResource = { ...resource, id: 'linked' };
    const nodes = [
      group,
      generator('downstream'),
      resource,
      ignored,
      generator('upstream'),
      linkedResource,
    ];
    const edges = [
      { source: 'upstream', target: 'downstream' },
      { source: 'upstream', target: 'linked' },
    ];
    const plan = buildCanvasBatchPlan({ groupId: 'group', nodes, edges, models });
    expect(plan.nodeIds).toEqual(['upstream', 'downstream', 'linked']);
    expect(plan.layers).toEqual([['upstream'], ['downstream', 'linked']]);
    expect(plan.excluded).toEqual([
      { id: 'resource', reason: 'not_generator' },
      { id: '3d', reason: 'not_generator' },
    ]);
    expect(plan.nodes[2].existingResource).toBe(true);
  });
  it('never force-runs a cycle and supports local pre-action generator documents without re-running uploads', () => {
    const local = generator('local');
    delete local.data.action;
    const upload = generator('upload', 'image');
    delete upload.data.action;
    upload.data.url = ['/uploaded.png'];
    const nodes = [group, generator('a'), generator('b'), local, upload];
    const edges = [
      { source: 'a', target: 'b' },
      { source: 'b', target: 'a' },
    ];
    const plan = buildCanvasBatchPlan({ groupId: 'group', nodes, edges, models });
    expect(plan.nodeIds).toEqual(['local']);
    expect(plan.excluded).toContainEqual({ id: 'a', reason: 'cyclic_dependency' });
    expect(plan.excluded).toContainEqual({ id: 'upload', reason: 'not_generator' });
  });
  it('does not invent a model or zero estimate for missing services', () => {
    const plan = buildCanvasBatchPlan({
      groupId: 'group',
      nodes: [group, generator('x')],
      models: null,
    });
    expect(plan.nodes[0].generator.error).toContain('模型配置尚未加载');
    expect(canvasBatchConfirmation(plan, null)).toContain('计算异常');
    expect(canvasBatchConfirmation(plan, { totalPower: 0, hasError: false })).not.toContain(
      '计算异常',
    );
    expect(canvasBatchConfirmation(plan, { totalPower: 12, hasError: false })).toContain('12 积分');
    expect(
      canvasBatchConfirmation(plan, { totalPower: 0, billingMode: 'mixed-free-times' }),
    ).toContain('优先抵扣免费条数');
  });
});
