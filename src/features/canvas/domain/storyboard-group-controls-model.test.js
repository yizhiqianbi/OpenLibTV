import { describe, expect, it } from 'vitest';
import {
  captureStoryboardGroupControlSignature,
  computeStoryboardNaturalDimensions,
  planStoryboardGroupControl,
  STORYBOARD_GROUP_ASPECTS,
} from './storyboard-group-controls-model.js';

const group = (patch = {}) => ({
  id: 'group',
  type: 'group',
  position: { x: 300, y: 400 },
  width: 500,
  height: 300,
  measured: { width: 500, height: 300 },
  style: { width: 999, height: 888, background: 'old-background', border: 'custom' },
  data: {
    name: '分镜组 2 个节点',
    storyboardGroupType: 'image',
    standaloneStoryboardImageGrid: true,
    storyboardManualGridCols: 2,
    storyboardManualGridRows: 2,
    childNodeIds: ['a', 'b'],
    custom: 'keep',
  },
  ...patch,
});
const image = (id = 'a', patch = {}) => ({
  id,
  type: 'image',
  parentId: 'group',
  position: { x: 4, y: 4 },
  width: 60,
  height: 40,
  extent: 'parent',
  zIndex: 5,
  data: {
    name: `图片${id}`,
    _explicitContentDims: true,
    contentWidth: 60,
    contentHeight: 40,
    url: [`https://sample/${id}`],
    params: { prompt: '词', model: 'old-model', settings: { ratio: '16:9', seed: 7 } },
  },
  ...patch,
});
const graph = () => [group(), image(), image('b')];
const plan = (nodes, command, options = {}) =>
  planStoryboardGroupControl({ nodes, edges: [], groupId: 'group', command, ...options });
const byId = (result, id = 'group') => result.nodes.find((node) => node.id === id);

describe('source standalone aspect control', () => {
  it.each([
    ['21:9', 817, 350],
    ['16:9', 622, 350],
    ['4:3', 467, 350],
    ['1:1', 350, 350],
    ['3:4', 350, 467],
    ['9:16', 350, 622],
  ])(
    'applies actual source aspect %s to images and reflows even with unchanged membership',
    (value, width, height) => {
      const nodes = graph();
      const result = plan(nodes, { type: 'aspect', value });
      expect(result).toMatchObject({ valid: true, changed: true });
      for (const id of ['a', 'b']) {
        expect(byId(result, id)).toMatchObject({
          width,
          height,
          measured: { width, height },
          extent: 'parent',
          zIndex: 5,
          data: {
            _explicitContentDims: true,
            contentWidth: width,
            contentHeight: height,
            params: { prompt: '词', model: 'old-model', settings: { ratio: value, seed: 7 } },
          },
        });
        expect(byId(result, id).data.url).toBe(nodes.find((node) => node.id === id).data.url);
      }
      expect(byId(result).data).toMatchObject({
        custom: 'keep',
        childNodeIds: ['a', 'b'],
        groupLayoutMode: 'grid',
      });
      expect(byId(result).style).toEqual({ background: 'old-background', border: 'custom' });
      expect(result).not.toHaveProperty('fitGroupId');
    },
  );

  it('clears preserve mode and old explicit content before uniform ratio dimensions are measured', () => {
    const target = group();
    target.data.storyboardPreserveChildDimensions = true;
    const nodes = [
      target,
      image('a', {
        data: { contentWidth: 2000, contentHeight: 10, params: { settings: { ratio: '1:1' } } },
      }),
      image('b'),
    ];
    const result = plan(nodes, { type: 'aspect', value: '16:9' });
    expect(byId(result).data).not.toHaveProperty('storyboardPreserveChildDimensions');
    expect(byId(result)).toMatchObject({
      width: 1256,
      height: 712,
      measured: { width: 1256, height: 712 },
    });
    expect(byId(result, 'a').data.contentWidth).toBe(622);
    expect(byId(result, 'a').data.contentHeight).toBe(350);
    expect(byId(result, 'b').position).toEqual({ x: 630, y: 4 });
  });

  it('updates only image params while retaining and reflowing existing non-image members', () => {
    const legacy = image('b', {
      type: 'text',
      data: { name: '旧文本', contentWidth: 900, contentHeight: 30, params: { keep: true } },
    });
    const result = plan([group(), image(), legacy], { type: 'aspect', value: '1:1' });
    expect(byId(result, 'b').data.params).toBe(legacy.data.params);
    expect(byId(result, 'b').type).toBe('text');
    expect(byId(result, 'b').data.contentWidth).toBe(900);
    expect(byId(result, 'a').data.contentWidth).toBe(900);
    expect(byId(result).data.childNodeIds).toEqual(['a', 'b']);
  });

  it('does nothing for an empty or legacy non-image-only group, retaining preserve mode', () => {
    const target = group();
    target.data.storyboardPreserveChildDimensions = true;
    for (const nodes of [[target], [target, image('a', { type: 'text' })]])
      expect(plan(nodes, { type: 'aspect', value: '1:1' })).toMatchObject({
        valid: true,
        changed: false,
        nodes,
      });
  });

  it.each(['auto', '3:2', '2:3', 'invalid', '', null])(
    'rejects an aspect %s absent from this source toolbar',
    (value) => {
      const nodes = graph();
      expect(plan(nodes, { type: 'aspect', value })).toMatchObject({
        valid: false,
        changed: false,
        nodes,
        reason: 'invalidAspect',
      });
    },
  );
});

describe('source manual grid controls', () => {
  it('records both axes and reflows a same-membership group without resetting ratio or params', () => {
    const nodes = graph();
    const result = plan(nodes, { type: 'grid', cols: 3, rows: 2 });
    expect(result).toMatchObject({
      valid: true,
      fitGroupId: 'group',
      detachedIds: [],
      immediateFlush: false,
    });
    expect(byId(result)).toMatchObject({
      width: 196,
      height: 108,
      data: {
        storyboardManualGridCols: 3,
        storyboardManualGridRows: 2,
        nodeWidth: 196,
        nodeHeight: 108,
        groupLayoutMode: 'grid',
      },
    });
    expect(byId(result, 'a').data.params).toBe(nodes[1].data.params);
    expect(byId(result, 'a')).toMatchObject({
      width: 60,
      height: 40,
      data: { contentWidth: 60, contentHeight: 48 },
    });
    expect(byId(result, 'b').position).toEqual({ x: 68, y: 4 });
  });

  it('clears manual rows for a columns-only command and allows natural rows above five without detaching', () => {
    const children = Array.from({ length: 8 }, (_, index) => image(String(index)));
    const target = group();
    target.data.childNodeIds = children.map((node) => node.id);
    const result = plan([target, ...children], { type: 'grid', cols: 1 });
    expect(byId(result).data).not.toHaveProperty('storyboardManualGridRows');
    expect(byId(result).data.childNodeIds).toHaveLength(8);
    expect(byId(result).height).toBe(420);
    expect(result.detachedIds).toEqual([]);
  });

  it('keeps the source preferred first capacity images and docks overflow roots to the right using flow height', () => {
    const ids = ['c', 'a', 'b', 'd', 'e', 'f'];
    const target = group();
    target.data.childNodeIds = ids;
    const children = ids.map((id) =>
      image(id, {
        measured: { width: 60, height: id === 'e' ? 77 : 33 },
        data: {
          name: id,
          contentWidth: 60,
          contentHeight: 40,
          params: { keep: id },
          scriptRowHiddenUuid: id,
        },
      }),
    );
    const nodes = [target, ...children];
    const edges = [{ id: 'edge', source: 'e', target: 'a' }];
    const snapshot = structuredClone(nodes);
    const result = plan(nodes, { type: 'grid', cols: 2, rows: 2 }, { edges });
    expect(result).toMatchObject({
      valid: true,
      fitGroupId: 'group',
      detachedIds: ['e', 'f'],
      immediateFlush: true,
    });
    expect(byId(result).data.childNodeIds).toEqual(['c', 'a', 'b', 'd']);
    expect(byId(result).width).toBe(132);
    expect(byId(result, 'e').position).toEqual({ x: 532, y: 400 });
    expect(byId(result, 'f').position).toEqual({ x: 532, y: 577 });
    for (const id of ['e', 'f']) {
      expect(byId(result, id)).not.toHaveProperty('parentId');
      expect(byId(result, id)).not.toHaveProperty('extent');
      expect(byId(result, id).data).toBe(children.find((node) => node.id === id).data);
    }
    expect(result.nodes.slice(0, 3).map((node) => node.id)).toEqual(['group', 'e', 'f']);
    expect(result.edges).toBe(edges);
    expect(nodes).toEqual(snapshot);
  });

  it('falls back to numeric names when child metadata is incomplete and preserves unrelated stale IDs only until reflow', () => {
    const target = group();
    target.data.childNodeIds = ['stale', 'ten'];
    const ten = image('ten', { data: { name: '图10' } });
    const two = image('two', { data: { name: '图2' } });
    const result = plan([target, ten, two], { type: 'grid', cols: 1, rows: 1 });
    expect(byId(result).data.childNodeIds).toEqual(['two']);
    expect(result.detachedIds).toEqual(['ten']);
  });

  it('keeps preserve mode and each child size while adjusting variable columns and rows', () => {
    const target = group();
    target.data.storyboardPreserveChildDimensions = true;
    const result = plan(
      [
        target,
        image('a', { data: { name: 'a', contentWidth: 60, contentHeight: 40 } }),
        image('b', { data: { name: 'b', contentWidth: 100, contentHeight: 80 } }),
      ],
      { type: 'grid', cols: 2, rows: 1 },
    );
    expect(byId(result)).toMatchObject({
      width: 172,
      height: 88,
      data: { storyboardPreserveChildDimensions: true },
    });
    expect(byId(result, 'a')).toMatchObject({
      width: 60,
      height: 40,
      measured: { width: 60, height: 40 },
    });
    expect(byId(result, 'b')).toMatchObject({ width: 100, height: 80, position: { x: 68, y: 4 } });
  });

  it('handles an explicit empty-grid layout command rather than the empty membership-effect no-op', () => {
    const target = group();
    target.data.childNodeIds = [];
    const result = plan([target], { type: 'grid', cols: 3, rows: 2 });
    expect(byId(result)).toMatchObject({
      width: 500,
      height: 300,
      data: {
        childNodeIds: [],
        storyboardManualGridCols: 3,
        storyboardManualGridRows: 2,
        groupLayoutMode: 'grid',
      },
    });
    expect(byId(result).style).not.toHaveProperty('width');
    expect(byId(result).style).not.toHaveProperty('height');
  });

  it('supports script-linked standalone grid changes while its aspect and normal conversion remain locked', () => {
    const target = group();
    target.data.sourceScriptNodeId = 'script';
    const nodes = [target, image(), image('b')];
    expect(plan(nodes, { type: 'grid', cols: 3, rows: 2 }).valid).toBe(true);
    for (const command of [{ type: 'aspect', value: '1:1' }, { type: 'convertToNormal' }])
      expect(plan(nodes, command)).toMatchObject({ valid: false, nodes, reason: 'scriptLinked' });
  });

  it.each([
    { cols: 0 },
    { cols: 6 },
    { cols: 1.5 },
    { cols: '2' },
    { cols: 2, rows: 0 },
    { cols: 2, rows: 6 },
    { cols: 2, rows: NaN },
  ])('rejects values absent from the 1–5 source manual selector %j', (value) => {
    const nodes = graph();
    expect(plan(nodes, { type: 'grid', ...value })).toMatchObject({
      valid: false,
      changed: false,
      nodes,
      reason: 'invalidGrid',
    });
  });
});

describe('shot-number and title metadata commands', () => {
  it('toggles shot numbering without layout, params, edges or other node writes', () => {
    const nodes = graph();
    const edges = [{ id: 'x', source: 'a', target: 'b' }];
    const result = plan(nodes, { type: 'toggleShotNumbers' }, { edges });
    expect(byId(result).data.showStoryboardShotNumbers).toBe(true);
    expect(byId(result, 'a')).toBe(nodes[1]);
    expect(result.edges).toBe(edges);
    expect(byId(result).position).toBe(nodes[0].position);
    expect(
      byId(plan(result.nodes, { type: 'toggleShotNumbers' })).data.showStoryboardShotNumbers,
    ).toBe(false);
  });

  it.each([
    {},
    { storyboardGroupType: 'image', sourceScriptNodeId: 'script' },
    { characterAsset: true },
  ])('allows the shared group-title rename without enabling standalone controls for %j', (data) => {
    const target = group({ data });
    const result = plan([target], { type: 'rename', value: '新的组名' });
    expect(byId(result).data.name).toBe('新的组名');
    expect(byId(result).data).toMatchObject(data);
    expect(byId(result).width).toBe(target.width);
    expect(plan(result.nodes, { type: 'rename', value: '新的组名' }).changed).toBe(false);
  });

  it('canonicalizes legacy label when a title update writes name and leaves exact supplied text untouched', () => {
    const result = plan([group({ data: { label: '旧标题' } })], {
      type: 'rename',
      value: '  新标题  ',
    });
    expect(byId(result).data).toEqual({ name: '  新标题  ' });
    expect(plan(graph(), { type: 'rename', value: 1 }).reason).toBe('invalidName');
  });
});

describe('source clear group graph plan', () => {
  it('deletes actual children and their incoming/outgoing edges, preserving the group shell, stale name and unrelated graph', () => {
    const nodes = [...graph(), image('root', { parentId: undefined })];
    const edges = [
      { id: 'incoming', source: 'root', target: 'a' },
      { id: 'outgoing', source: 'b', target: 'root' },
      { id: 'internal', source: 'a', target: 'b' },
      { id: 'keep', source: 'root', target: 'group' },
    ];
    const result = plan(nodes, { type: 'clear' }, { edges });
    expect(result.removedIds).toEqual(['a', 'b']);
    expect(result.nodes.map((node) => node.id)).toEqual(['group', 'root']);
    expect(byId(result)).toMatchObject({
      width: 500,
      height: 300,
      data: { name: '分镜组 2 个节点', childNodeIds: [], nodeWidth: 500, nodeHeight: 300 },
    });
    expect(byId(result).style).toEqual({ background: 'old-background', border: 'custom' });
    expect(byId(result, 'root')).toBe(nodes[3]);
    expect(result.edges).toEqual([edges[3]]);
    expect(result).not.toHaveProperty('fitGroupId');
  });

  it('leaves an already empty group and stale child metadata untouched, matching the source early return', () => {
    const nodes = [group()];
    expect(plan(nodes, { type: 'clear' })).toMatchObject({ valid: true, changed: false, nodes });
    expect(plan(nodes, { type: 'clear' }).nodes).toBe(nodes);
  });

  it('uses variable empty-layout fallback after clearing a preserve grid instead of assuming fixed shell dimensions', () => {
    const nodes = graph();
    nodes[0].data.storyboardPreserveChildDimensions = true;
    const result = plan(nodes, { type: 'clear' });
    expect(byId(result)).toMatchObject({
      width: 412,
      height: 252,
      data: { storyboardPreserveChildDimensions: true, childNodeIds: [] },
    });
  });

  it('uses two source snapshot passes for segment-remake cascade and is independent of edge order', () => {
    const chain = ['d', 'e', 'f'].map((id, index) =>
      image(id, {
        parentId: undefined,
        data: {
          params: {
            segmentRemakeLock: true,
            segmentRemakeDraft: { phase: 'editing', sourceNodeId: ['a', 'd', 'e'][index] },
          },
        },
      }),
    );
    const nodes = [group(), image(), ...chain];
    const edges = [
      { id: 'ad', source: 'a', target: 'd' },
      { id: 'de', source: 'd', target: 'e' },
      { id: 'ef', source: 'e', target: 'f' },
    ];
    for (const list of [edges, [...edges].reverse()]) {
      const result = plan(nodes, { type: 'clear' }, { edges: list });
      expect(result.removedIds).toEqual(['a', 'd', 'e']);
      expect(byId(result, 'f')).toBe(chain[2]);
    }
  });

  it('frees surviving descendants of a removed legacy group and clears linked-group metadata references', () => {
    const target = group();
    target.data.childNodeIds = ['inner'];
    const inner = image('inner', { type: 'group' });
    const surviving = image('surviving', {
      parentId: 'inner',
      position: { x: 5, y: 6 },
      data: { linkedImageGroupId: 'inner', linkedVideoGroupId: 'unrelated' },
    });
    const result = plan([target, inner, surviving], { type: 'clear' });
    expect(result.removedIds).toEqual(['inner']);
    expect(byId(result, 'surviving')).toMatchObject({
      position: { x: 309, y: 410 },
      data: { linkedVideoGroupId: 'unrelated' },
    });
    expect(byId(result, 'surviving')).not.toHaveProperty('parentId');
    expect(byId(result, 'surviving')).not.toHaveProperty('extent');
    expect(byId(result, 'surviving').data).not.toHaveProperty('linkedImageGroupId');
  });
});

describe('source conversion to an ordinary group', () => {
  it('uses persisted content before loaded dimensions, loaded values before ratio, and a source 36/66 grid', () => {
    const nodes = graph();
    nodes[1].data.contentWidth = 80;
    nodes[1].data.contentHeight = 90;
    delete nodes[2].data.contentWidth;
    delete nodes[2].data.contentHeight;
    const result = plan(
      nodes,
      { type: 'convertToNormal' },
      {
        dimensions: new Map([
          ['a', { width: 999, height: 999 }],
          ['b', { width: 700, height: 350 }],
        ]),
      },
    );
    expect(byId(result)).toMatchObject({
      width: 1508,
      height: 452,
      measured: { width: 1508, height: 452 },
    });
    expect(byId(result, 'a')).toMatchObject({
      width: 80,
      height: 90,
      position: { x: 36, y: 66 },
      parentId: 'group',
      extent: 'parent',
    });
    expect(byId(result, 'b')).toMatchObject({
      width: 700,
      height: 350,
      position: { x: 772, y: 66 },
    });
    for (const id of ['a', 'b']) {
      const data = byId(result, id).data;
      expect(data).not.toHaveProperty('_explicitContentDims');
      expect(data).not.toHaveProperty('contentWidth');
      expect(data).not.toHaveProperty('contentHeight');
      expect(data.params).toBe(nodes.find((node) => node.id === id).data.params);
    }
    expect(byId(result).style).toEqual({ background: 'old-background', border: 'custom' });
    for (const key of [
      'standaloneStoryboardImageGrid',
      'storyboardManualGridCols',
      'storyboardManualGridRows',
      'showStoryboardShotNumbers',
      'storyboardGroupType',
      'storyboardPreserveChildDimensions',
    ])
      expect(byId(result).data).not.toHaveProperty(key);
    expect(result).not.toHaveProperty('fitGroupId');
  });

  it('preserves relative explicit dimensions only when the captured source preserve flag is true', () => {
    const target = group();
    target.data.storyboardPreserveChildDimensions = true;
    target.data.nodeWidth = 999;
    target.data.nodeHeight = 888;
    target.data.groupLayoutMode = 'grid';
    const result = plan([target, image(), image('b')], { type: 'convertToNormal' });
    expect(byId(result, 'a').data).toMatchObject({
      _explicitContentDims: true,
      contentWidth: 60,
      contentHeight: 40,
    });
    expect(byId(result).data).toMatchObject({
      name: target.data.name,
      childNodeIds: ['a', 'b'],
      nodeWidth: 999,
      nodeHeight: 888,
      groupLayoutMode: 'grid',
    });
  });

  it('uses the source ratio fallback for missing/null loaded values and does not use the old measured box', () => {
    const incoming = image('a', {
      measured: { width: 1, height: 2 },
      data: { params: { settings: { ratio: '9:16' } } },
    });
    const target = group();
    target.data.childNodeIds = ['a'];
    const result = plan(
      [target, incoming],
      { type: 'convertToNormal' },
      { dimensions: { a: null } },
    );
    expect(byId(result, 'a')).toMatchObject({ width: 350, height: 622 });
    expect(byId(result)).toMatchObject({ width: 422, height: 724 });
  });

  it('converts an empty shell by clearing source flags/style dimensions while keeping its geometry and name', () => {
    const target = group();
    target.data.childNodeIds = [];
    const result = plan([target], { type: 'convertToNormal' });
    expect(byId(result)).toMatchObject({
      width: 500,
      height: 300,
      position: target.position,
      data: { name: target.data.name },
    });
    expect(byId(result).style).not.toHaveProperty('width');
    expect(byId(result).style).not.toHaveProperty('height');
  });

  it('uses actual tf order for placement and only patches explicit metadata of image children', () => {
    const target = group();
    target.data.childNodeIds = ['b', 'a'];
    const video = image('b', { type: 'video' });
    const result = plan([target, image(), video], { type: 'convertToNormal' });
    expect(byId(result, 'b').position).toEqual({ x: 36, y: 66 });
    expect(byId(result, 'a').position).toEqual({ x: 132, y: 66 });
    expect(byId(result, 'b').data).toBe(video.data);
    expect(byId(result).data.childNodeIds).toEqual(['b', 'a']);
  });
});

describe('natural dimensions and async owner signature', () => {
  it.each([
    [4000, 1000, { width: 1400, height: 350 }],
    [1000, 4000, { width: 350, height: 1400 }],
    [100000, 1, { width: 5600, height: 350 }],
    [1, 100000, { width: 350, height: 5600 }],
    [10, 10, { width: 350, height: 350 }],
    [0, 10, { width: 350, height: 350 }],
    [NaN, 10, { width: 350, height: 350 }],
    [Infinity, 10, { width: 350, height: 350 }],
  ])('normalizes source natural %s×%s independently of ratio cap', (width, height, expected) => {
    expect(computeStoryboardNaturalDimensions(width, height)).toEqual(expected);
  });

  it('captures the exact tZ group and ordered member evidence including first nonempty array URL and fallback ratio', () => {
    const nodes = graph();
    nodes[0].data.childNodeIds = ['b', 'a'];
    nodes[1].data.url = ['', 'first', 'second'];
    nodes[2].data.params = { settings: { ratio: 'auto', ratioOther: '3:4' } };
    const signature = captureStoryboardGroupControlSignature(nodes, 'group');
    expect(Object.keys(signature.group)).toEqual([
      'sourceScriptNodeId',
      'storyboardGroupType',
      'standaloneStoryboardImageGrid',
      'storyboardManualGridCols',
      'storyboardManualGridRows',
      'storyboardPreserveChildDimensions',
    ]);
    expect(signature.children.map((node) => node.id)).toEqual(['b', 'a']);
    expect(signature.children[1].displayUrl).toBe('first');
    expect(signature.children[0].fallbackRatio).toBe('3:4');
    expect(Object.keys(signature.children[0])).toEqual([
      'id',
      'parentId',
      'type',
      'displayUrl',
      'contentWidth',
      'contentHeight',
      'fallbackRatio',
    ]);
  });

  it('ignores transient position/measured/selection/name/prompt changes but detects control/URL/membership/order changes', () => {
    const nodes = graph();
    const signature = captureStoryboardGroupControlSignature(nodes, 'group');
    const moved = structuredClone(nodes);
    moved[0].position.x += 100;
    moved[0].data.name = '改组名';
    moved[1].data.name = '改图片名';
    moved[1].measured = { width: 1, height: 2 };
    moved[1].selected = true;
    moved[1].data.params.prompt = '新词';
    expect(captureStoryboardGroupControlSignature(moved, 'group')).toEqual(signature);
    for (const change of [
      (list) => {
        list[0].data.storyboardManualGridRows = 3;
      },
      (list) => {
        list[1].data.url = ['new'];
      },
      (list) => {
        list[1].parentId = undefined;
      },
      (list) => {
        list[0].data.childNodeIds = ['b', 'a'];
      },
    ]) {
      const updated = structuredClone(nodes);
      change(updated);
      expect(captureStoryboardGroupControlSignature(updated, 'group')).not.toEqual(signature);
    }
  });

  it('returns null for missing target or malformed graph/order rather than fabricating an owner identity', () => {
    const nodes = graph();
    nodes[0].data.childNodeIds = ['a', 'a'];
    expect(captureStoryboardGroupControlSignature(nodes, 'group')).toBeNull();
    expect(captureStoryboardGroupControlSignature(graph(), 'missing')).toBeNull();
    expect(captureStoryboardGroupControlSignature(null, 'group')).toBeNull();
  });
});

describe('source entry gates and atomic local guards', () => {
  it.each([
    {},
    { storyboardGroupType: 'image' },
    { sourceScriptNodeId: 'script', storyboardGroupType: 'image' },
    { standaloneStoryboardImageGrid: true, storyboardGroupType: 'video' },
  ])('does not enable standalone commands for another group variant %j', (data) => {
    const nodes = [group({ data })];
    for (const type of ['aspect', 'grid', 'toggleShotNumbers', 'clear', 'convertToNormal'])
      expect(plan(nodes, { type, value: '1:1', cols: 2, rows: 2 })).toMatchObject({
        valid: false,
        nodes,
        reason: 'unsupportedGroup',
      });
  });

  it('leaves service/UI-only commands to their owners and never fabricates stitch/run/preserve completion', () => {
    const nodes = graph();
    for (const type of ['stitch', 'run', 'preserve', 'color', 'unknown'])
      expect(plan(nodes, { type })).toMatchObject({
        valid: false,
        changed: false,
        nodes,
        reason: 'unsupportedCommand',
      });
  });

  it('does not publish partial control changes for malformed child data, order or dimensions', () => {
    const corruptions = [
      (nodes) => {
        nodes[2].data.params = 'invalid';
      },
      (nodes) => {
        nodes[0].data.childNodeIds = ['a', 'a'];
      },
      (nodes) => {
        nodes[2].position.x = NaN;
      },
    ];
    for (const corrupt of corruptions) {
      const nodes = graph();
      corrupt(nodes);
      const snapshot = structuredClone(nodes);
      expect(plan(nodes, { type: 'aspect', value: '1:1' })).toMatchObject({
        valid: false,
        changed: false,
        nodes,
      });
      expect(nodes).toEqual(snapshot);
    }
    const nodes = graph();
    delete nodes[2].data.contentWidth;
    expect(
      plan(
        nodes,
        { type: 'convertToNormal' },
        { dimensions: new Map([['b', { width: NaN, height: 1 }]]) },
      ),
    ).toMatchObject({ valid: false, changed: false, nodes });
  });

  it('rejects malformed edge input and graph duplicate IDs before attempting any mutation', () => {
    const nodes = graph();
    for (const edges of [
      null,
      [{ id: 'x', source: 'a' }],
      [
        { id: 'x', source: 'a', target: 'b' },
        { id: 'x', source: 'a', target: 'b' },
      ],
    ])
      expect(plan(nodes, { type: 'clear' }, { edges })).toMatchObject({
        valid: false,
        changed: false,
        nodes,
      });
    const duplicated = [...nodes, nodes[1]];
    expect(plan(duplicated, { type: 'grid', cols: 2 })).toMatchObject({
      valid: false,
      changed: false,
      nodes: duplicated,
    });
  });

  it('rejects overflow geometry failure without changing earlier group metadata or reflowed members', () => {
    const nodes = [...graph(), image('c', { measured: { height: Infinity } })];
    nodes[0].data.childNodeIds = ['a', 'b', 'c'];
    const snapshot = structuredClone(nodes);
    expect(plan(nodes, { type: 'grid', cols: 1, rows: 1 })).toMatchObject({
      valid: false,
      changed: false,
      nodes,
    });
    expect(nodes).toEqual(snapshot);
  });

  it('supports repeatable pure updater calls without modifying nodes/edges/dimensions inputs', () => {
    const nodes = graph();
    const edges = [{ id: 'x', source: 'a', target: 'b' }];
    const before = structuredClone(nodes);
    const dimensionMap = new Map([['a', { width: 900, height: 350 }]]);
    for (const command of [
      { type: 'aspect', value: '1:1' },
      { type: 'grid', cols: 1, rows: 1 },
      { type: 'clear' },
      { type: 'convertToNormal' },
    ])
      expect(plan(nodes, command, { edges, dimensions: dimensionMap })).toEqual(
        plan(nodes, command, { edges, dimensions: dimensionMap }),
      );
    expect(nodes).toEqual(before);
    expect(edges).toEqual([{ id: 'x', source: 'a', target: 'b' }]);
    expect(dimensionMap.get('a')).toEqual({ width: 900, height: 350 });
    expect(STORYBOARD_GROUP_ASPECTS).toHaveLength(6);
  });
});
