import { describe, expect, it, vi } from 'vitest';
import {
  GENERAL_GROUP_COLORS,
  GENERAL_GROUP_LAYOUTS,
  planCanvasGeneralGroupControl,
} from './general-group-controls-model.js';

const group = (data = {}, rest = {}) => ({
  id: 'g',
  type: 'group',
  position: { x: 100, y: 200 },
  width: 1000,
  height: 700,
  data: { name: '分组 2 个节点', childNodeIds: ['a', 'b'], ...data },
  style: { width: 999, height: 888, borderRadius: 12, background: 'old' },
  ...rest,
});
const child = (id, width, height, rest = {}) => ({
  id,
  type: 'image',
  parentId: 'g',
  extent: 'parent',
  position: { x: 10, y: 20 },
  width,
  height,
  data: { name: `Image ${id}`, params: { model: 'm', settings: { ratio: '1:1', quality: 'q' } } },
  ...rest,
});
const edges = [{ id: 'ab', source: 'a', target: 'b', data: { reference: true } }];
const at = (plan, id) => plan.nodes.find((node) => node.id === id);
const plan = (nodes, command, rest = {}) =>
  planCanvasGeneralGroupControl({ nodes, edges, groupId: 'g', command, ...rest });
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

describe('source General group controls', () => {
  it('exports the ten source palette entries and three layout modes', () => {
    expect(GENERAL_GROUP_COLORS).toEqual([
      '#7A7A7A',
      '#E74C3C',
      '#F28A2E',
      '#F4B740',
      '#2ECC71',
      '#08B6DD',
      '#3B82F6',
      '#8B5CF6',
      '#F63B97',
      '#E6E6E6',
    ]);
    expect(GENERAL_GROUP_LAYOUTS).toEqual(['grid', 'horizontal', 'vertical']);
  });

  it('uses complete preferred actual order and measured sizes in horizontal layout', () => {
    const nodes = freeze([
      group({ childNodeIds: ['gone', 'b', 'a'] }),
      child('a', 999, 999, { measured: { width: 100, height: 40 } }),
      child('b', 200, 80),
    ]);
    const result = plan(nodes, { type: 'layout', mode: 'horizontal' });
    expect(result).toMatchObject({ valid: true, changed: true });
    expect(at(result, 'b').position).toEqual({ x: 36, y: 66 });
    expect(at(result, 'a').position).toEqual({ x: 272, y: 66 });
    expect(at(result, 'g')).toMatchObject({
      width: 408,
      height: 182,
      measured: { width: 408, height: 182 },
    });
    expect(at(result, 'g').data).toMatchObject({
      childNodeIds: ['gone', 'b', 'a'],
      nodeWidth: 408,
      nodeHeight: 182,
      groupLayoutMode: 'horizontal',
    });
    expect(at(result, 'g').style).toEqual(nodes[0].style);
    expect(at(result, 'a').data).toBe(nodes[1].data);
    expect(at(result, 'a')).toMatchObject({
      parentId: 'g',
      extent: 'parent',
      width: 999,
      height: 999,
    });
    expect(at(result, 'g').position).toBe(nodes[0].position);
    expect(result.edges).toBe(edges);
    expect(result.fitGroupId).toBeUndefined();
  });

  it('discards incomplete preferred order entirely and sorts numeric names', () => {
    const nodes = [
      group({ childNodeIds: ['b'] }),
      child('b', 200, 80, { data: { name: 'Image 10' } }),
      child('a', 100, 40, { data: { name: 'Image 2' } }),
    ];
    const result = plan(nodes, { type: 'layout', mode: 'vertical' });
    expect(at(result, 'a').position).toEqual({ x: 36, y: 66 });
    expect(at(result, 'b').position).toEqual({ x: 36, y: 142 });
    expect(at(result, 'g')).toMatchObject({ width: 272, height: 258 });
    expect(at(result, 'g').data.childNodeIds).toEqual(['b']);
  });

  it('grid writes actual ordered membership and removes only style dimensions', () => {
    const nodes = [group({ childNodeIds: [] }), child('b', 200, 80), child('a', 100, 40)];
    const result = plan(nodes, { type: 'layout', mode: 'grid' });
    expect(at(result, 'g')).toMatchObject({ width: 508, height: 182 });
    expect(at(result, 'g').data).toMatchObject({
      childNodeIds: ['a', 'b'],
      groupLayoutMode: 'grid',
    });
    expect(at(result, 'g').style).toEqual({ borderRadius: 12, background: 'old' });
    expect(at(result, 'a').position).toEqual({ x: 36, y: 66 });
    expect(at(result, 'b').position).toEqual({ x: 272, y: 66 });
  });

  it.each(['grid', 'horizontal', 'vertical'])('supports a single child in %s', (mode) => {
    const nodes = [group({ childNodeIds: ['a'] }), child('a', 200, 80)];
    const result = plan(nodes, { type: 'layout', mode });
    expect(result.valid).toBe(true);
    expect(at(result, 'g')).toMatchObject({ width: 272, height: 182 });
    expect(at(result, 'a').position).toEqual({ x: 36, y: 66 });
  });

  it.each(['grid', 'horizontal', 'vertical'])('returns the original empty graph for %s', (mode) => {
    const nodes = [group()];
    const result = plan(nodes, { type: 'layout', mode });
    expect(result).toMatchObject({ valid: true, changed: false });
    expect(result.nodes).toBe(nodes);
    expect(result.fitGroupId).toBeUndefined();
  });

  it('uses nullish per-axis measured/stored/default dimensions, excluding explicit content/ratio', () => {
    const nodes = [
      group({ childNodeIds: ['a'] }),
      child('a', 90, undefined, {
        measured: { width: null, height: null },
        data: { contentWidth: 5000, contentHeight: 6000, params: { settings: { ratio: '21:9' } } },
      }),
    ];
    const result = plan(nodes, { type: 'layout', mode: 'horizontal' });
    expect(at(result, 'g')).toMatchObject({ width: 162, height: 222 });
    const defaults = plan([group({ childNodeIds: ['a'] }), child('a')], {
      type: 'layout',
      mode: 'grid',
    });
    expect(at(defaults, 'g')).toMatchObject({ width: 272, height: 222 });
  });

  it('supports an explicit renderer size adapter without changing stored child dimensions', () => {
    const nodes = [group({ childNodeIds: ['a'] }), child('a', 200, 80)];
    const result = plan(
      nodes,
      { type: 'layout', mode: 'grid' },
      { getNodeSize: () => ({ width: 500, height: 300 }) },
    );
    expect(at(result, 'g')).toMatchObject({ width: 572, height: 402 });
    expect(at(result, 'a')).toMatchObject({ width: 200, height: 80 });
  });

  it('uses legacy manual columns for grid, rounds/clamps them and ignores manual rows', () => {
    const children = ['a', 'b', 'c'].map((id) => child(id, 100, 40));
    const result = plan(
      [group({ storyboardManualGridCols: 1.4, storyboardManualGridRows: 5 }), ...children],
      { type: 'layout', mode: 'grid' },
    );
    expect(at(result, 'g')).toMatchObject({ width: 172, height: 294 });
    expect(at(result, 'c').position).toEqual({ x: 36, y: 218 });
    const wide = plan([group({ storyboardManualGridCols: 99 }), ...children], {
      type: 'layout',
      mode: 'grid',
    });
    expect(at(wide, 'g')).toMatchObject({ width: 716, height: 142 });
  });

  it('includes hidden/temporary/reference/child groups without expanding descendants', () => {
    const nodes = [
      group(),
      child('a', 100, 40, { type: 'reference', hidden: true, data: { temporary: true } }),
      child('b', 200, 80, { type: 'group' }),
      child('grandchild', 30, 20, { parentId: 'b' }),
    ];
    const result = plan(nodes, { type: 'layout', mode: 'horizontal' });
    expect(at(result, 'g')).toMatchObject({ width: 408, height: 182 });
    expect(at(result, 'grandchild')).toBe(nodes[3]);
    expect(at(result, 'a')).toMatchObject({ type: 'reference', hidden: true });
  });

  it('allows source-linked General and feature-disabled character metadata', () => {
    for (const data of [
      { sourceScriptNodeId: 's', storyboardGroupType: 'image' },
      { sourceScriptNodeId: 's', storyboardGroupType: 'video' },
      { characterAsset: { roleName: 'Role' } },
      { shotBreakdown: true },
    ]) {
      const nodes = [group(data), child('a', 100, 40), child('b', 200, 80)];
      expect(plan(nodes, { type: 'layout', mode: 'grid' }).valid).toBe(true);
      expect(plan(nodes, { type: 'color', value: '#E74C3C' }).valid).toBe(true);
    }
  });

  it.each([true, 'legacy-truthy'])(
    'rejects standalone image color/layout source entry (%s)',
    (flag) => {
      const nodes = [group({ standaloneStoryboardImageGrid: flag, storyboardGroupType: 'image' })];
      expect(plan(nodes, { type: 'color', value: null }).reason).toBe('unsupportedGroup');
      expect(plan(nodes, { type: 'layout', mode: 'grid' }).reason).toBe('unsupportedGroup');
      expect(plan(nodes, { type: 'convertToStoryboard' }).reason).toBe('unsupportedGroup');
      expect(plan(nodes, { type: 'rename', value: 'Renamed' }).valid).toBe(true);
    },
  );

  it('replaces the full color style and writes zIndex/data, preserving other nodes and edges', () => {
    const nodes = [group({ prompt: 'p' }, { selected: true, zIndex: 1000 }), child('a', 100, 40)];
    const result = plan(nodes, { type: 'color', value: '#E74C3C' });
    expect(at(result, 'g').style).toEqual({
      background: '#E74C3C1A',
      border: '1px solid #E74C3C33',
    });
    expect(at(result, 'g')).toMatchObject({
      zIndex: -1001,
      selected: true,
      width: 1000,
      height: 700,
      data: { prompt: 'p', groupColor: '#E74C3C' },
    });
    expect(at(result, 'a')).toBe(nodes[1]);
    expect(result.edges).toBe(edges);
    expect(result.fitGroupId).toBeUndefined();
    expect(plan(result.nodes, { type: 'color', value: '#E74C3C' }).changed).toBe(false);
  });

  it('clears color with null and chooses ordinary vs script-video shell background', () => {
    const ordinary = plan([group({ groupColor: '#E74C3C' })], { type: 'color', value: null });
    expect(at(ordinary, 'g').style).toEqual({
      background: 'var(--canvas-group-bg)',
      border: '1px solid var(--canvas-group-border)',
    });
    expect(at(ordinary, 'g').data.groupColor).toBeNull();
    const video = plan([group({ sourceScriptNodeId: 's', storyboardGroupType: 'video' })], {
      type: 'color',
      value: null,
    });
    expect(at(video, 'g').style.background).toBe('var(--storyboard-group-shell-bg, #212121)');
  });

  it('reuses general rename including legacy name canonicalization and raw caller value', () => {
    const nodes = [group({ name: undefined, label: 'Legacy' })];
    const result = plan(nodes, { type: 'rename', value: '  Custom  ' });
    expect(at(result, 'g').data.name).toBe('  Custom  ');
    expect(at(result, 'g').data).not.toHaveProperty('label');
    expect(result.fitGroupId).toBeUndefined();
    expect(plan(result.nodes, { type: 'rename', value: '  Custom  ' }).changed).toBe(false);
  });

  it('converts a one-image ordinary group, preserving graph identity and source explicit dimensions', () => {
    const nodes = freeze([
      group(
        { childNodeIds: ['a'], groupColor: '#3B82F6', prompt: 'gp' },
        { parentId: 'outer', selected: true },
      ),
      child('a', 70, 90, {
        data: {
          name: 'A',
          contentWidth: 1000,
          contentHeight: 2000,
          _explicitContentDims: false,
          url: ['local'],
          refs: ['up'],
          params: { model: 'm', settings: { ratio: '1:1', quality: 'q' } },
        },
      }),
      { id: 'outer', type: 'group', position: { x: 5, y: 8 }, data: {} },
    ]);
    const result = plan(nodes, { type: 'convertToStoryboard' });
    expect(result).toMatchObject({ valid: true, changed: true, fitGroupId: 'g' });
    expect(at(result, 'g')).toMatchObject({
      parentId: 'outer',
      selected: true,
      position: { x: 100, y: 200 },
      width: 630,
      height: 358,
      data: {
        name: '分镜组 1 个节点',
        prompt: 'gp',
        standaloneStoryboardImageGrid: true,
        storyboardGroupType: 'image',
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
        groupLayoutMode: 'grid',
        childNodeIds: ['a'],
      },
    });
    expect(at(result, 'g').style).toEqual({
      borderRadius: 12,
      background: '#3B82F61A',
      border: '1px solid #3B82F633',
    });
    expect(at(result, 'a')).toMatchObject({
      parentId: 'g',
      extent: 'parent',
      width: 622,
      height: 350,
      measured: { width: 622, height: 350 },
      position: { x: 4, y: 4 },
      data: {
        name: 'A',
        url: ['local'],
        refs: ['up'],
        contentWidth: 622,
        contentHeight: 350,
        _explicitContentDims: true,
        params: { model: 'm', settings: { ratio: '16:9', quality: 'q' } },
      },
    });
    expect(result.edges).toBe(edges);
    expect(at(result, 'outer')).toBe(nodes[2]);
  });

  it('clears script-row and task only when row identity is truthy', () => {
    const nodes = [
      group(),
      child('a', 100, 40, {
        data: { scriptRowHiddenUuid: 'row', taskInfo: { status: 3 }, params: {} },
      }),
      child('b', 200, 80, {
        data: { scriptRowHiddenUuid: '', taskInfo: { status: 1 }, params: {} },
      }),
    ];
    const result = plan(nodes, { type: 'convertToStoryboard' });
    expect(at(result, 'a').data).not.toHaveProperty('scriptRowHiddenUuid');
    expect(at(result, 'a').data).not.toHaveProperty('taskInfo');
    expect(at(result, 'b').data).toMatchObject({
      scriptRowHiddenUuid: '',
      taskInfo: { status: 1 },
    });
  });

  it('conversion final tH retains complete preferred order instead of initial numeric patch order', () => {
    const nodes = [
      group({ childNodeIds: ['b', 'a'] }),
      child('a', 100, 40, { data: { name: '2', params: {} } }),
      child('b', 200, 80, { data: { name: '10', params: {} } }),
    ];
    const result = plan(nodes, { type: 'convertToStoryboard' });
    expect(at(result, 'g').data.childNodeIds).toEqual(['b', 'a']);
    expect(at(result, 'b').position).toEqual({ x: 4, y: 4 });
    expect(at(result, 'a').position).toEqual({ x: 630, y: 4 });
    expect(at(result, 'g')).toMatchObject({ width: 1256, height: 712 });
  });

  it('conversion discards incomplete order, preserves custom names and old preserve-dimensions flag', () => {
    const nodes = [
      group({
        name: 'A custom group',
        childNodeIds: ['b'],
        storyboardPreserveChildDimensions: true,
      }),
      child('b', 100, 40, { data: { name: '10', params: {} } }),
      child('a', 200, 80, { data: { name: '2', params: {} } }),
    ];
    const result = plan(nodes, { type: 'convertToStoryboard' });
    expect(result.valid).toBe(true);
    expect(at(result, 'g').data).toMatchObject({
      name: 'A custom group',
      childNodeIds: ['a', 'b'],
      storyboardPreserveChildDimensions: true,
    });
    expect(at(result, 'a').data).toMatchObject({
      _explicitContentDims: true,
      contentWidth: 622,
      contentHeight: 350,
    });
  });

  it.each([undefined, '', '分组 2个节点', '分镜组 2 个节点'])(
    'updates source automatic/empty conversion name %s',
    (name) => {
      const result = plan([group({ name, childNodeIds: ['a'] }), child('a', 100, 40)], {
        type: 'convertToStoryboard',
      });
      expect(at(result, 'g').data.name).toBe('分镜组 1 个节点');
    },
  );

  it('does not impose the independent multi-selection creation count gates on conversion', () => {
    const children = Array.from({ length: 26 }, (_, index) => child(`i${index}`, 100, 40));
    const result = plan([group({ childNodeIds: [] }), ...children], {
      type: 'convertToStoryboard',
    });
    expect(result.valid).toBe(true);
    expect(at(result, 'g').data).toMatchObject({
      childNodeIds: expect.any(Array),
      storyboardManualGridCols: 6,
      storyboardManualGridRows: 6,
    });
    expect(at(result, 'g').data.childNodeIds).toHaveLength(26);
  });

  it.each(['text', 'group', 'reference'])(
    'rejects a nonimage actual %s child despite all-image stale metadata',
    (type) => {
      const nodes = [
        group({ childNodeIds: ['a'] }),
        child('a', 100, 40),
        child('b', 200, 80, { type }),
      ];
      const result = plan(nodes, { type: 'convertToStoryboard' });
      expect(result).toMatchObject({ valid: false, changed: false, reason: 'requiresImages' });
      expect(result.nodes).toBe(nodes);
    },
  );

  it('rejects empty and script-linked conversion without partial edits', () => {
    expect(plan([group()], { type: 'convertToStoryboard' }).reason).toBe('requiresImages');
    const nodes = [group({ sourceScriptNodeId: 's' }), child('a', 100, 40), child('b', 200, 80)];
    const result = plan(nodes, { type: 'convertToStoryboard' });
    expect(result.reason).toBe('scriptLinked');
    expect(result.nodes).toBe(nodes);
  });

  it.each([0, -1, NaN, Infinity, '100'])(
    'rejects malformed measured dimensions %s rather than falling back',
    (width) => {
      const nodes = [
        group(),
        child('a', 100, 40, { measured: { width, height: 40 } }),
        child('b', 200, 80),
      ];
      const result = plan(nodes, { type: 'layout', mode: 'grid' });
      expect(result).toMatchObject({ valid: false, changed: false });
      expect(result.nodes).toBe(nodes);
    },
  );

  it('rejects corrupt complete preferred duplicates and conversion params atomically', () => {
    const nodes = [group({ childNodeIds: ['a', 'a'] }), child('a', 100, 40), child('b', 200, 80)];
    for (const command of [{ type: 'layout', mode: 'grid' }, { type: 'convertToStoryboard' }]) {
      const result = plan(nodes, command);
      expect(result.valid).toBe(false);
      expect(result.nodes).toBe(nodes);
    }
    const bad = [
      group(),
      child('a', 100, 40),
      child('b', 200, 80, { data: { params: { settings: [] } } }),
    ];
    expect(plan(bad, { type: 'convertToStoryboard' }).nodes).toBe(bad);
    expect(plan(bad, { type: 'convertToStoryboard' }).valid).toBe(false);
  });

  it('does not create services or unsupported setting commands', () => {
    const nodes = [group(), child('a', 100, 40)];
    for (const command of [
      { type: 'color', value: '' },
      { type: 'color', value: '#fff' },
      { type: 'layout', mode: 'free' },
      { type: 'resize' },
      { type: 'run' },
      { type: 'workflow' },
      { type: 'aspect', value: '1:1' },
    ]) {
      const result = plan(nodes, command);
      expect(result.valid).toBe(false);
      expect(result.nodes).toBe(nodes);
    }
  });

  it('preserves input references for invalid nodes/edges and safe repeated layout projections', () => {
    const nodes = [group(), child('a', 100, 40), child('b', 200, 80)];
    const result = plan(nodes, { type: 'layout', mode: 'grid' });
    const repeated = plan(result.nodes, { type: 'layout', mode: 'grid' });
    expect(repeated).toMatchObject({ valid: true, changed: false });
    expect(repeated.nodes).toBe(result.nodes);
    const badNodes = [...nodes, nodes[1]];
    expect(plan(badNodes, { type: 'color', value: null }).nodes).toBe(badNodes);
    const badEdges = [edges[0], edges[0]];
    const bad = plan(nodes, { type: 'layout', mode: 'grid' }, { edges: badEdges });
    expect(bad.valid).toBe(false);
    expect(bad.nodes).toBe(nodes);
    expect(bad.edges).toBe(badEdges);
  });

  it('does not serialize unrelated media/content or affected shared data while detecting no-ops', () => {
    const toJSON = vi.fn(() => {
      throw new Error('Graph payload must not be serialized by a control plan');
    });
    const urls = ['data:image/png;base64,representative-payload'];
    const shared = { url: urls, content: ['long script body'], toJSON };
    const unrelated = {
      id: 'outside',
      type: 'image',
      position: { x: 800, y: 900 },
      data: shared,
    };
    const nodes = [
      group({ payload: shared }),
      child('a', 100, 40, { data: shared }),
      child('b', 200, 80),
      unrelated,
    ];
    const color = plan(nodes, { type: 'color', value: '#E74C3C' });
    expect(color).toMatchObject({ valid: true, changed: true });
    expect(at(color, 'g').data.payload).toBe(shared);
    const repeatedColor = plan(color.nodes, { type: 'color', value: '#E74C3C' });
    expect(repeatedColor).toMatchObject({ valid: true, changed: false });
    expect(repeatedColor.nodes).toBe(color.nodes);
    const layout = plan(nodes, { type: 'layout', mode: 'grid' });
    expect(layout).toMatchObject({ valid: true, changed: true });
    expect(at(layout, 'a').data).toBe(shared);
    const repeatedLayout = plan(layout.nodes, { type: 'layout', mode: 'grid' });
    expect(repeatedLayout).toMatchObject({ valid: true, changed: false });
    expect(repeatedLayout.nodes).toBe(layout.nodes);
    expect(at(repeatedLayout, 'outside')).toBe(unrelated);
    expect(toJSON).not.toHaveBeenCalled();
  });
});
