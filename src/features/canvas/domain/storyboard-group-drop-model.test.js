import { describe, expect, it, vi } from 'vitest';
import {
  planCanvasStoryboardGroupDrop,
  resolveCanvasStoryboardFrameDropHover,
} from './storyboard-group-drop-model.js';

const image = (id = 'node', patch = {}) => ({
  id,
  type: 'image',
  position: { x: 120, y: 140 },
  width: 40,
  height: 30,
  data: { name: id, params: { prompt: '提示词', settings: { seed: 7 } } },
  ...patch,
});
const group = (id = 'target', patch = {}) =>
  image(id, {
    type: 'group',
    position: { x: 100, y: 100 },
    width: 1000,
    height: 1000,
    measured: { width: 1000, height: 1000 },
    zIndex: -1001,
    data: { name: '分镜组 0 个节点', storyboardGroupType: 'image', childNodeIds: [] },
    ...patch,
  });
const plan = (nodes, options = {}) =>
  planCanvasStoryboardGroupDrop({ nodes, draggedNodeId: 'node', ...options });
const frame = (nodes, options = {}) =>
  planCanvasStoryboardGroupDrop({
    nodes,
    surface: 'selection',
    draggedIds: ['node', 'peer'],
    selectedIds: ['node', 'peer'],
    ...options,
  });
const byId = (result, id) => result.nodes.find((node) => node.id === id);
const ratioOf = (result, id) => byId(result, id).data.params.settings.ratio;

describe('non-standalone storyboard image group single stop', () => {
  it('attaches at world-relative position, applies the source ratio and preserves unrelated fields', () => {
    const node = image('node', {
      extent: 'parent',
      zIndex: 8,
      data: {
        name: '图像',
        _explicitContentDims: true,
        contentWidth: 123,
        contentHeight: 234,
        resourceMeta: { untouched: true },
        params: { prompt: '提示词', model: 'model', settings: { seed: 7 } },
      },
    });
    const target = group();
    const nodes = [node, target];
    const before = structuredClone(nodes);
    const result = plan(nodes);
    expect(result).toMatchObject({
      handled: true,
      valid: true,
      kind: 'attach',
      targetGroupId: 'target',
      transitionIds: ['node'],
      completion: {},
    });
    expect(byId(result, 'node')).toMatchObject({
      parentId: 'target',
      position: { x: 20, y: 40 },
      extent: 'parent',
      zIndex: 8,
      width: 622,
      height: 350,
      measured: { width: 622, height: 350 },
      data: {
        _explicitContentDims: true,
        resourceMeta: { untouched: true },
        params: { model: 'model', prompt: '提示词', settings: { seed: 7, ratio: '16:9' } },
      },
    });
    expect(byId(result, 'node').data).not.toHaveProperty('contentWidth');
    expect(byId(result, 'node').data).not.toHaveProperty('contentHeight');
    expect(byId(result, 'target').data).toMatchObject({
      childNodeIds: ['node'],
      name: '分镜组 1 个节点',
    });
    for (const key of ['position', 'width', 'height', 'measured', 'zIndex'])
      expect(byId(result, 'target')[key]).toEqual(target[key]);
    expect(result.nodes.map((node) => node.id)).toEqual(['target', 'node']);
    expect(nodes).toEqual(before);
  });

  it.each([
    { storyboardGroupType: 'image' },
    { sourceScriptNodeId: 'script' },
    { sourceScriptNodeId: 1, storyboardGroupType: 'unknown' },
    { storyboardGroupType: 'image', characterAsset: true, breakdownSourceNodeId: 'shot' },
  ])('accepts the source m3 target qualifier %j', (data) => {
    expect(plan([group('target', { data }), image()])).toMatchObject({
      handled: true,
      kind: 'attach',
    });
  });

  it.each([
    { storyboardGroupType: 'video', sourceScriptNodeId: 'script' },
    { characterAsset: true },
    { breakdownSourceNodeId: 'shot' },
    {},
  ])('leaves non-m3 targets to ordinary grouping %j', (data) => {
    const nodes = [group('target', { data }), image()];
    expect(plan(nodes)).toMatchObject({ handled: false, changed: false, nodes });
  });

  it('keeps hidden target eligibility and graph order ahead of target area or zIndex', () => {
    const first = group('first', { hidden: true, width: 2000, zIndex: -2000 });
    const second = group('second', { zIndex: 100 });
    expect(plan([first, second, image()]).targetGroupId).toBe('first');
    expect(plan([second, first, image()]).targetGroupId).toBe('second');
  });

  it('lets the first containing ordinary group win instead of skipping it for a later special group', () => {
    const ordinary = group('ordinary', { data: {} });
    const result = plan([ordinary, group(), image()]);
    expect(result.handled).toBe(false);
    expect(result.changed).toBe(false);
  });

  it.each(['group', 'script', 'script-v2'])(
    'does not attach a single source with node.type %s',
    (type) => {
      expect(plan([group(), image('node', { type })])).toMatchObject({
        handled: false,
        reason: 'ineligibleSource',
      });
    },
  );

  it('gates source type using node.type rather than data.type, action or canCopy', () => {
    const node = image('node', { data: { type: 'script', action: 'unsupported', canCopy: false } });
    expect(plan([group(), node]).kind).toBe('attach');
  });

  it('uses full containment, including equality, and ignores a center-only or release-point single hit', () => {
    const target = group('target', { width: 200, height: 180 });
    expect(plan([target, image('node', { position: { x: 260, y: 250 } })]).kind).toBe('attach');
    const node = image('node', { position: { x: 80, y: 140 } });
    expect(plan([target, node], { releasePoint: { x: 150, y: 150 } })).toMatchObject({
      handled: false,
      changed: false,
    });
  });

  it('leaves a child with any positive parent overlap to the ordinary retain protocol', () => {
    const old = group('old', { position: { x: 0, y: 0 }, width: 200, height: 180 });
    const node = image('node', { parentId: 'old', position: { x: 199.99, y: 140 } });
    expect(plan([old, group(), node])).toMatchObject({
      handled: false,
      changed: false,
      reason: 'parentOverlap',
    });
  });

  it('detaches completely before attaching to another group and consumes only the old child ID', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { name: '分组 3 个节点', childNodeIds: ['stale', 'node', 'other'] },
    });
    const node = image('node', { parentId: 'old', extent: 'parent', position: { x: 120, y: 140 } });
    const result = plan([node, old, group()]);
    expect(byId(result, 'node')).toMatchObject({ parentId: 'target', position: { x: 20, y: 40 } });
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'old').data).toEqual({
      name: '分组 2 个节点',
      childNodeIds: ['stale', 'other'],
    });
    expect(result.transitionIds).toEqual(['node']);
  });

  it('uses valid metadata siblings first, then graph order, and preserves stale target metadata IDs', () => {
    const target = group('target', {
      data: { storyboardGroupType: 'image', childNodeIds: ['stale', 'second', 'first'] },
    });
    const first = image('first', {
      parentId: 'target',
      data: { params: { settings: { ratio: '1:1' } } },
    });
    const second = image('second', {
      parentId: 'target',
      data: { params: { settings: { ratio: '3:4' } } },
    });
    const result = plan([target, first, second, image()]);
    expect(ratioOf(result, 'node')).toBe('3:4');
    expect(byId(result, 'node')).toMatchObject({ width: 350, height: 467 });
    expect(byId(result, 'target').data.childNodeIds).toEqual(['stale', 'second', 'first', 'node']);
    expect(ratioOf(plan([group(), first, second, image()]), 'node')).toBe('1:1');
  });

  it('keeps a custom name and does not duplicate or recount a source ID already in target metadata', () => {
    const target = group('target', {
      data: { name: '导演选图', storyboardGroupType: 'image', childNodeIds: ['node', 'stale'] },
    });
    const result = plan([target, image()]);
    expect(byId(result, 'target')).toBe(target);
    expect(byId(result, 'target').data.childNodeIds).toEqual(['node', 'stale']);
  });

  it('normalizes legacy image label only when source updateNodeData applies its ratio patch', () => {
    const result = plan([group(), image('node', { data: { label: '旧图片名', params: {} } })]);
    expect(byId(result, 'node').data.name).toBe('旧图片名');
    expect(byId(result, 'node').data).not.toHaveProperty('label');
  });

  it('preserves image dimensions and parameters when node M preserveChildDimensions is true', () => {
    const target = group('target', {
      data: { storyboardGroupType: 'image', storyboardPreserveChildDimensions: true },
    });
    const node = image('node', {
      measured: { width: 40, height: 30 },
      data: { params: 'kept', contentWidth: 5 },
    });
    const result = plan([target, node]);
    expect(result.kind).toBe('attach');
    expect(byId(result, 'node').data).toBe(node.data);
    expect(byId(result, 'node')).toMatchObject({ width: 40, height: 30, measured: node.measured });
  });

  it('rejects non-images with the exact warning while preserving completed ordinary detach metadata', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { name: '分组 1 个节点', childNodeIds: ['node'] },
    });
    const result = plan([
      old,
      group(),
      image('node', { type: 'text', parentId: 'old', extent: 'parent' }),
    ]);
    expect(result).toMatchObject({
      handled: true,
      kind: 'rejected',
      completion: {
        warningKey: 'storyboardGroupImageOnly',
        warning: '分镜组支持图像内容',
      },
    });
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'node').position).toEqual({ x: 120, y: 140 });
    expect(byId(result, 'old').data.childNodeIds).toEqual([]);
    expect(byId(result, 'target').data.childNodeIds).toEqual([]);
  });

  it('cleans only a detached explicit group-generated video before image-only rejection', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { storyboardGroupType: 'video', childNodeIds: ['node'] },
    });
    const node = image('node', {
      type: 'video',
      parentId: 'old',
      data: {
        _explicitContentDims: true,
        contentWidth: 640,
        contentHeight: 360,
        params: { scene: 'group-generate', model: 'video', prompt: '保留' },
      },
    });
    const result = plan([old, group(), node]);
    expect(byId(result, 'node').data).toEqual({ params: { model: 'video', prompt: '保留' } });
  });

  it('rejects a full manual grid and leaves the source at its world position', () => {
    const target = group('target', {
      data: {
        storyboardGroupType: 'image',
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
      },
    });
    const existing = image('existing', { parentId: 'target' });
    const result = plan([target, existing, image('node', { extent: 'parent' })]);
    expect(result).toMatchObject({
      kind: 'rejected',
      completion: {
        warningKey: 'storyboardGridFull',
        warning: '分镜宫格已满，无法继续添加',
      },
    });
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'node').width).toBe(40);
  });

  it('consumes the detached-copy marker before image-only or capacity rejection, without attaching', () => {
    const node = image('node', { type: 'text', data: { canvasAltDetachedCopy: true } });
    const result = plan([group(), node]);
    expect(result).toMatchObject({ kind: 'alt-detached', completion: {} });
    expect(byId(result, 'node').data.canvasAltDetachedCopy).toBe(false);
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(result.transitionIds).toEqual([]);
  });

  it('keeps live node Alt copy outside special drop and does not consume its marker', () => {
    const node = image('node', { data: { canvasAltDetachedCopy: true } });
    const nodes = [group(), node];
    expect(plan(nodes, { liveAltCopy: true })).toMatchObject({
      handled: false,
      changed: false,
      nodes,
      reason: 'liveAltCopy',
    });
  });

  it('defers standalone target/source to the grid owner and never skips an earlier standalone target', () => {
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true },
    });
    expect(plan([standalone, group(), image()])).toMatchObject({
      handled: false,
      changed: false,
      targetGroupId: 'standalone',
      reason: 'standaloneTarget',
    });
    expect(plan([standalone, group(), image('node', { parentId: 'standalone' })])).toMatchObject({
      handled: false,
      reason: 'standaloneSource',
    });
  });

  it('rejects a fully contained non-image standalone target without an active slot session', () => {
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true, childNodeIds: [] },
    });
    const text = image('node', { type: 'text', extent: 'parent' });
    const result = plan([standalone, group(), text]);
    expect(result).toMatchObject({
      handled: true,
      valid: true,
      kind: 'rejected',
      targetGroupId: 'standalone',
      transitionIds: ['node'],
      completion: {
        warningKey: 'storyboardGroupImageOnly',
        warning: '分镜组支持图像内容',
        parentBoundsGroupIds: [],
      },
    });
    expect(byId(result, 'node').position).toEqual(text.position);
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'standalone')).toBe(standalone);
  });

  it('rejects a non-image standalone hit after complete parent exit, preserving world position and source old metadata cleanup', () => {
    const old = group('old', {
      position: { x: 30, y: 40 },
      width: 100,
      height: 100,
      data: { name: '分组 2 个节点', childNodeIds: ['node', 'stale'] },
    });
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true, childNodeIds: [] },
    });
    const text = image('node', { type: 'text', parentId: 'old', extent: 'parent' });
    const result = plan([old, standalone, text]);
    expect(result).toMatchObject({ handled: true, kind: 'rejected', targetGroupId: 'standalone' });
    expect(byId(result, 'node').position).toEqual({ x: 150, y: 180 });
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'old').data).toEqual({ name: '分组 1 个节点', childNodeIds: ['stale'] });
    expect(byId(result, 'standalone')).toBe(standalone);
    expect(result.transitionIds).toEqual(['node']);
  });

  it('lets a legacy non-image leave a standalone source and rejects the new standalone target with world and metadata cleanup', () => {
    const old = group('old', {
      position: { x: 30, y: 40 },
      width: 100,
      height: 100,
      data: {
        standaloneStoryboardImageGrid: true,
        name: '分镜组 2 个节点',
        childNodeIds: ['node', 'stale'],
      },
    });
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true, childNodeIds: [] },
    });
    const text = image('node', { type: 'text', parentId: 'old', extent: 'parent' });
    const result = plan([old, standalone, text]);
    expect(result).toMatchObject({
      handled: true,
      kind: 'rejected',
      targetGroupId: 'standalone',
      transitionIds: ['node'],
      completion: { warningKey: 'storyboardGroupImageOnly', parentBoundsGroupIds: [] },
    });
    expect(byId(result, 'node').position).toEqual({ x: 150, y: 180 });
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'node')).not.toHaveProperty('extent');
    expect(byId(result, 'old').data).toEqual({
      standaloneStoryboardImageGrid: true,
      name: '分镜组 1 个节点',
      childNodeIds: ['stale'],
    });
    expect(byId(result, 'standalone')).toBe(standalone);
  });

  it('retains a legacy non-image with positive overlap in its standalone source before looking for a new target', () => {
    const old = group('old', {
      position: { x: 30, y: 40 },
      width: 100,
      height: 100,
      data: { standaloneStoryboardImageGrid: true, childNodeIds: ['node'] },
    });
    const text = image('node', {
      type: 'text',
      parentId: 'old',
      position: { x: 90, y: 90 },
      extent: 'parent',
    });
    const nodes = [old, group(), text];
    const result = plan(nodes);
    expect(result).toMatchObject({
      handled: false,
      changed: false,
      nodes,
      reason: 'parentOverlap',
    });
    expect(result.nodes).toBe(nodes);
    expect(result.completion).not.toHaveProperty('warning');
  });

  it.each(['manual', 'hard'])(
    'consumes a %s-full standalone target and detaches the image at world position',
    (capacity) => {
      const standalone = group('standalone', {
        data: {
          storyboardGroupType: 'image',
          standaloneStoryboardImageGrid: true,
          ...(capacity === 'manual'
            ? { storyboardManualGridCols: 1, storyboardManualGridRows: 1 }
            : {}),
        },
      });
      const old = group('old', {
        position: { x: 30, y: 40 },
        width: 100,
        height: 100,
        data: { name: '分组 1 个节点', childNodeIds: ['node'] },
      });
      const existing = Array.from({ length: capacity === 'manual' ? 1 : 25 }, (_, index) =>
        image(`existing-${index}`, { parentId: 'standalone' }),
      );
      const incoming = image('node', { parentId: 'old', extent: 'parent' });
      const result = plan([old, standalone, ...existing, incoming]);
      expect(result).toMatchObject({
        handled: true,
        kind: 'rejected',
        targetGroupId: 'standalone',
        completion: { warningKey: 'storyboardGridFull', warning: '分镜宫格已满，无法继续添加' },
      });
      expect(byId(result, 'node').position).toEqual({ x: 150, y: 180 });
      expect(byId(result, 'node')).not.toHaveProperty('parentId');
      expect(byId(result, 'node')).not.toHaveProperty('extent');
      expect(byId(result, 'node').data).toBe(incoming.data);
      expect(byId(result, 'old').data.childNodeIds).toEqual([]);
      expect(byId(result, 'standalone')).toBe(standalone);
    },
  );

  it('keeps source image-only rejection ahead of capacity for a full standalone target', () => {
    const standalone = group('standalone', {
      data: {
        standaloneStoryboardImageGrid: true,
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
      },
    });
    const result = plan([
      standalone,
      image('existing', { parentId: 'standalone' }),
      image('node', { type: 'text' }),
    ]);
    expect(result.completion.warningKey).toBe('storyboardGroupImageOnly');
  });

  it('consumes the source Alt marker before standalone image-only/capacity guards', () => {
    const standalone = group('standalone', {
      data: {
        standaloneStoryboardImageGrid: true,
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
      },
    });
    const result = plan([
      standalone,
      image('existing', { parentId: 'standalone' }),
      image('node', { type: 'text', data: { canvasAltDetachedCopy: true } }),
    ]);
    expect(result.kind).toBe('alt-detached');
    expect(result.completion).not.toHaveProperty('warning');
    expect(byId(result, 'node').data.canvasAltDetachedCopy).toBe(false);
  });

  it('does not publish a preplanned parent detach when an admissible standalone image defers', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { childNodeIds: ['node'] },
    });
    const standalone = group('standalone', { data: { standaloneStoryboardImageGrid: true } });
    const nodes = [old, standalone, image('node', { parentId: 'old', extent: 'parent' })];
    const snapshot = structuredClone(nodes);
    const result = plan(nodes);
    expect(result).toMatchObject({
      handled: false,
      changed: false,
      nodes,
      reason: 'standaloneTarget',
    });
    expect(result.nodes).toBe(nodes);
    expect(nodes).toEqual(snapshot);
  });

  it('returns an atomic invalid plan for malformed standalone target metadata instead of guessing an admissible drop', () => {
    const nodes = [
      group('standalone', { data: { standaloneStoryboardImageGrid: true, childNodeIds: {} } }),
      image(),
    ];
    expect(plan(nodes)).toMatchObject({ valid: false, changed: false, nodes });
  });
});

describe('node-surface storyboard multi drop', () => {
  it('attaches all eligible members in primary-first order without clearing selection or extent', () => {
    const nodes = [
      image('peer', { extent: 'parent', selected: true }),
      image('node', { extent: 'parent', selected: true }),
      group(),
    ];
    const result = plan(nodes, { draggedIds: ['peer', 'node'], selectedIds: ['peer', 'node'] });
    expect(result.kind).toBe('attach');
    expect(result.transitionIds).toEqual(['node', 'peer']);
    expect(byId(result, 'target').data.childNodeIds).toEqual(['node', 'peer']);
    // Source per-node updateNode stable-sort changes graph order as each root becomes a child.
    expect(result.nodes.map((node) => node.id)).toEqual(['target', 'peer', 'node']);
    for (const id of ['node', 'peer'])
      expect(byId(result, id)).toMatchObject({
        parentId: 'target',
        extent: 'parent',
        selected: true,
      });
    expect(result.completion).toEqual({ parentBoundsGroupIds: ['target'] });
  });

  it('attaches to the first standalone target with source M rules instead of a slot session', () => {
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true },
    });
    const node = image('node', { extent: 'parent', selected: true });
    const peer = image('peer', { extent: 'parent', selected: true });
    const result = plan([standalone, group(), node, peer], { draggedIds: ['node', 'peer'] });
    expect(result).toMatchObject({
      handled: true,
      kind: 'attach',
      targetGroupId: 'standalone',
      completion: { parentBoundsGroupIds: ['standalone'] },
    });
    for (const id of ['node', 'peer'])
      expect(byId(result, id)).toMatchObject({
        parentId: 'standalone',
        extent: 'parent',
        selected: true,
        width: 622,
        height: 350,
        position: { x: 20, y: 40 },
      });
    expect(byId(result, 'standalone').data.childNodeIds).toEqual(['node', 'peer']);
    expect(byId(result, 'standalone').width).toBe(standalone.width);
    expect(byId(result, 'standalone').height).toBe(standalone.height);
  });

  it('runs multi drop before the single standalone-source defer when no grid session consumed it', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      data: { standaloneStoryboardImageGrid: true, childNodeIds: ['node'] },
    });
    const node = image('node', { parentId: 'old' });
    const result = plan([old, group(), node, image('peer')], { draggedIds: ['node', 'peer'] });
    expect(result.kind).toBe('attach');
    expect(result.targetGroupId).toBe('target');
    expect(byId(result, 'node').parentId).toBe('target');
    expect(byId(result, 'old').data.childNodeIds).toEqual(['node']);
  });

  it('requests bounds only for the primary final parent when a filtered group primary has image peers', () => {
    const parent = group('parent', { position: { x: 3000, y: 3000 }, data: {} });
    const node = group('node', { parentId: 'parent', data: {} });
    const result = plan([parent, node, group(), image('peer'), image('other')], {
      draggedIds: ['node', 'peer', 'other'],
    });
    expect(result.kind).toBe('attach');
    expect(byId(result, 'peer').parentId).toBe('target');
    expect(byId(result, 'node').parentId).toBe('parent');
    expect(result.completion.parentBoundsGroupIds).toEqual(['parent']);
  });

  it('uses full containment before center before pointer, each in original target graph order', () => {
    const center = group('center', { position: { x: 100, y: 100 }, width: 30, height: 30 });
    const full = group('full');
    const pointer = group('pointer', { position: { x: 3000, y: 3000 } });
    const node = image('node', { position: { x: 90, y: 100 } });
    const peer = image('peer', { position: { x: 200, y: 200 } });
    expect(
      plan([center, full, pointer, node, peer], {
        draggedIds: ['node', 'peer'],
        releasePoint: { x: 3100, y: 3100 },
      }).targetGroupId,
    ).toBe('full');
    expect(
      plan([center, pointer, node, image('peer', { position: { x: 2000, y: 2000 } })], {
        draggedIds: ['node', 'peer'],
        releasePoint: { x: 3100, y: 3100 },
      }).targetGroupId,
    ).toBe('center');
    expect(
      plan([pointer, image(), peer], {
        draggedIds: ['node', 'peer'],
        releasePoint: { x: 3100, y: 3100 },
      }).targetGroupId,
    ).toBe('pointer');
  });

  it('lets a moved group primary be excluded while its two selected image roots still qualify', () => {
    const primary = group('node', { position: { x: -2000, y: -2000 } });
    const result = plan([primary, group(), image('first'), image('second')], {
      draggedIds: ['node', 'first', 'second'],
    });
    expect(result.kind).toBe('attach');
    expect(result.transitionIds).toEqual(['first', 'second']);
    expect(byId(result, 'node')).toBe(primary);
  });

  it('filters group/script/script-v2 members before the two-member multi gate', () => {
    const script = image('script', { type: 'script' });
    const v2 = image('v2', { type: 'script-v2' });
    const selectedGroup = group('selected', { position: { x: -2000, y: -2000 } });
    const result = plan([group(), image(), image('peer'), script, v2, selectedGroup], {
      draggedIds: ['script', 'selected', 'peer', 'v2', 'node'],
    });
    expect(result.transitionIds).toEqual(['node', 'peer']);
    expect(byId(result, 'script')).toBe(script);
    expect(byId(result, 'v2')).toBe(v2);
    expect(byId(result, 'selected')).toBe(selectedGroup);
  });

  it('uses visible selected fallback only when RF supplies fewer than two roots and includes primary', () => {
    const result = plan([group(), image(), image('peer')], {
      draggedIds: ['node'],
      selectedIds: ['node', 'peer'],
    });
    expect(result.transitionIds).toEqual(['node', 'peer']);
    const hidden = image('hidden', { hidden: true });
    const temp = image('temp', { data: { type: 'temp' } });
    const lone = plan([group(), image(), hidden, temp], {
      draggedIds: ['node'],
      selectedIds: ['node', 'hidden', 'temp'],
    });
    expect(lone.transitionIds).toEqual(['node']);
  });

  it('prioritizes RF moving roots over other selected items without expanding selected-parent descendants', () => {
    const result = plan([group(), image(), image('peer'), image('selected-extra')], {
      draggedIds: ['node', 'peer'],
      selectedIds: ['node', 'peer', 'selected-extra'],
    });
    expect(result.transitionIds).toEqual(['node', 'peer']);
    expect(byId(result, 'selected-extra')).not.toHaveProperty('parentId');
  });

  it('excludes primary parent and moved target IDs from multi candidates', () => {
    const target = group();
    const node = image('node', { parentId: 'target', position: { x: 20, y: 40 } });
    expect(
      plan([target, node, image('peer')], {
        draggedIds: ['node', 'peer'],
        releasePoint: { x: 200, y: 200 },
      }).handled,
    ).toBe(false);
    const fallback = plan([target, image(), image('peer')], {
      draggedIds: ['target', 'node', 'peer'],
    });
    // The excluded multi target can still win source's later primary-only single fallback.
    expect(fallback.transitionIds).toEqual(['node']);
    expect(byId(fallback, 'peer')).not.toHaveProperty('parentId');
    expect(
      plan([target, image(), image('peer')], {
        draggedNodeId: 'target',
        draggedIds: ['target', 'node', 'peer'],
      }).handled,
    ).toBe(false);
  });

  it('detaches every filtered member for mixed-type rejection and preserves old parent metadata as m9 does', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      data: { name: '旧组', childNodeIds: ['node', 'peer'] },
    });
    const node = image('node', { parentId: 'old', extent: 'parent' });
    const peer = image('peer', { type: 'text', parentId: 'old', extent: 'parent' });
    const result = plan([old, group(), node, peer], { draggedIds: ['node', 'peer'] });
    expect(result).toMatchObject({
      kind: 'rejected',
      transitionIds: ['node', 'peer'],
      completion: { warningKey: 'storyboardGroupImageOnly' },
    });
    for (const id of ['node', 'peer']) {
      expect(byId(result, id)).not.toHaveProperty('parentId');
      expect(byId(result, id)).not.toHaveProperty('extent');
    }
    expect(byId(result, 'old')).toBe(old);
    expect(byId(result, 'old').data.childNodeIds).toEqual(['node', 'peer']);
  });

  it('moves children to the new target without silently reconciling their old parent metadata', () => {
    const old = group('old', {
      position: { x: 0, y: 0 },
      data: { name: '旧组', childNodeIds: ['node', 'peer'] },
    });
    const result = plan(
      [old, group(), image('node', { parentId: 'old' }), image('peer', { parentId: 'old' })],
      { draggedIds: ['node', 'peer'] },
    );
    expect(result.kind).toBe('attach');
    expect(byId(result, 'old')).toBe(old);
    expect(byId(result, 'target').data.childNodeIds).toEqual(['node', 'peer']);
  });

  it('rejects a whole incoming batch atomically when sequential capacity checks run out of slots', () => {
    const target = group('target', {
      data: {
        storyboardGroupType: 'image',
        storyboardManualGridCols: 2,
        storyboardManualGridRows: 1,
      },
    });
    const existing = image('existing', { parentId: 'target' });
    const result = plan([target, existing, image(), image('peer')], {
      draggedIds: ['node', 'peer'],
    });
    expect(result.kind).toBe('rejected');
    expect(result.completion.warningKey).toBe('storyboardGridFull');
    expect(byId(result, 'node')).not.toHaveProperty('parentId');
    expect(byId(result, 'peer')).not.toHaveProperty('parentId');
    expect(byId(result, 'target')).toBe(target);
  });

  it('retains the source existing-minus-selected plus incoming capacity arithmetic', () => {
    const target = group('target', {
      data: {
        storyboardGroupType: 'image',
        storyboardManualGridCols: 2,
        storyboardManualGridRows: 1,
        childNodeIds: ['peer', 'existing'],
      },
    });
    const peer = image('peer', { parentId: 'target', position: { x: 20, y: 40 } });
    const existing = image('existing', { parentId: 'target', position: { x: 60, y: 40 } });
    const result = plan([target, existing, peer, image()], { draggedIds: ['node', 'peer'] });
    expect(result.kind).toBe('attach');
    expect(byId(result, 'target').data.childNodeIds).toEqual(['peer', 'existing', 'node']);
  });

  it('consumes only the included primary Alt marker ahead of mixed-type rejection, leaving peers unchanged', () => {
    const node = image('node', { data: { canvasAltDetachedCopy: true } });
    const peer = image('peer', { type: 'text' });
    const result = plan([group(), node, peer], { draggedIds: ['node', 'peer'] });
    expect(result.kind).toBe('alt-detached');
    expect(byId(result, 'node').data.canvasAltDetachedCopy).toBe(false);
    expect(byId(result, 'peer')).toBe(peer);
    expect(result.completion).toEqual({ parentBoundsGroupIds: [] });
  });

  it('sees previously attached sibling ratio updates in node M rather than a frozen frame snapshot', () => {
    const target = group('target', {
      data: { storyboardGroupType: 'image', childNodeIds: ['peer'] },
    });
    const peer = image('peer', {
      parentId: 'target',
      position: { x: 20, y: 40 },
      data: { params: { settings: { ratio: '3:4' } } },
    });
    const result = plan([target, image(), peer], { draggedIds: ['node', 'peer'] });
    expect(ratioOf(result, 'node')).toBe('3:4');
    expect(ratioOf(result, 'peer')).toBe('3:4');
  });
});

describe('virtual-frame storyboard stop Z/L', () => {
  it('clears only moving selections and frame after success, retains unrelated selected IDs, and clears extent', () => {
    const node = image('node', { selected: true, extent: 'parent' });
    const peer = image('peer', { selected: true, extent: 'parent' });
    const unrelated = image('unrelated', { selected: true, position: { x: 3000, y: 3000 } });
    const result = frame([node, peer, group(), unrelated], {
      selectedIds: ['node', 'unrelated', 'peer'],
    });
    expect(result).toMatchObject({
      handled: true,
      kind: 'attach',
      completion: {
        selectedIds: ['unrelated'],
        clearSelectionIds: ['node', 'peer'],
        clearHover: true,
        clearFrame: true,
      },
    });
    expect(result.nodes.map((node) => node.id)).toEqual(['target', 'unrelated', 'node', 'peer']);
    for (const id of ['node', 'peer']) {
      expect(byId(result, id)).toMatchObject({ parentId: 'target', selected: false });
      expect(byId(result, id)).not.toHaveProperty('extent');
    }
    expect(byId(result, 'unrelated')).toBe(unrelated);
  });

  it('accepts live frame Alt copies and retains their persistent marker instead of consuming it', () => {
    const result = frame(
      [group(), image('node', { data: { canvasAltDetachedCopy: true } }), image('peer')],
      { liveAltCopy: true },
    );
    expect(result.kind).toBe('attach');
    expect(byId(result, 'node').data.canvasAltDetachedCopy).toBe(true);
    expect(result.completion.clearFrame).toBe(true);
  });

  it('does not use pointer-only target hits', () => {
    const target = group('target', { position: { x: 3000, y: 3000 } });
    const result = frame([target, image(), image('peer')], { releasePoint: { x: 3100, y: 3100 } });
    expect(result).toMatchObject({ handled: false, changed: false, completion: {} });
  });

  it('accepts center-only frame hits and uses complete containment before center hits', () => {
    const center = group('center', { width: 30, height: 30 });
    const full = group('full');
    const nodes = [
      center,
      full,
      image('node', { position: { x: 90, y: 100 } }),
      image('peer', { position: { x: 200, y: 200 } }),
    ];
    expect(frame(nodes).targetGroupId).toBe('full');
    expect(frame(nodes.filter((node) => node.id !== 'full')).targetGroupId).toBe('center');
  });

  it.each(['text', 'group', 'script', 'script-v2', 'video', 'temp'])(
    'rejects frame member type %s without applying node-surface filtering or detachment',
    (type) => {
      const old = group('old', {
        position: { x: 0, y: 0 },
        data: { childNodeIds: ['node', 'peer'] },
      });
      const node = image('node', { parentId: 'old', extent: 'parent', selected: true });
      const peer = image('peer', { type, parentId: 'old', extent: 'parent', selected: true });
      const nodes = [old, group(), node, peer];
      const result = frame(nodes);
      expect(result).toMatchObject({
        handled: true,
        kind: 'rejected',
        changed: false,
        nodes,
        completion: {
          warningKey: 'storyboardGroupImageOnly',
          clearHover: true,
        },
      });
      expect(result.completion).not.toHaveProperty('clearFrame');
      expect(result.completion).not.toHaveProperty('selectedIds');
    },
  );

  it('rejects over-capacity frame batches without detaching or clearing selection/frame', () => {
    const target = group('target', {
      data: {
        storyboardGroupType: 'image',
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
      },
    });
    const nodes = [target, image(), image('peer')];
    expect(frame(nodes)).toMatchObject({
      kind: 'rejected',
      changed: false,
      nodes,
      completion: {
        warningKey: 'storyboardGridFull',
        clearHover: true,
      },
    });
  });

  it('overrides preserveChildDimensions because frame L lacks node M protection', () => {
    const target = group('target', {
      data: { storyboardGroupType: 'image', storyboardPreserveChildDimensions: true },
    });
    const result = frame([target, image(), image('peer')]);
    expect(byId(result, 'node')).toMatchObject({ width: 622, height: 350 });
    expect(ratioOf(result, 'peer')).toBe('16:9');
  });

  it('reads original sibling params for every frame ratio patch rather than newly attached peers', () => {
    const target = group('target', {
      data: { storyboardGroupType: 'image', childNodeIds: ['peer'] },
    });
    const peer = image('peer', {
      parentId: 'target',
      position: { x: 20, y: 40 },
      data: { params: { settings: { ratio: '3:4' } } },
    });
    const result = frame([target, image(), peer]);
    expect(ratioOf(result, 'node')).toBe('3:4');
    expect(ratioOf(result, 'peer')).toBe('16:9');
  });

  it('handles stale frame IDs by requiring at least two real members, without inventing nodes', () => {
    expect(frame([group(), image()], { draggedIds: ['node', 'deleted'] })).toMatchObject({
      handled: false,
      changed: false,
      reason: 'insufficientFrameMembers',
    });
    const result = frame([group(), image(), image('peer')], {
      draggedIds: ['node', 'deleted', 'peer'],
    });
    expect(result.completion.clearSelectionIds).toEqual(['node', 'peer']);
  });

  it('excludes a moved target itself and does not trigger a drop if all members already share the target', () => {
    const target = group();
    expect(
      frame([target, image(), image('peer')], { draggedIds: ['target', 'node', 'peer'] }).handled,
    ).toBe(false);
    const node = image('node', { parentId: 'target', position: { x: 20, y: 40 } });
    const peer = image('peer', { parentId: 'target', position: { x: 60, y: 40 } });
    expect(frame([target, node, peer]).handled).toBe(false);
  });

  it('attaches to the first standalone target using frame L and keeps slot layout for the renderer', () => {
    const standalone = group('standalone', {
      data: {
        storyboardGroupType: 'image',
        standaloneStoryboardImageGrid: true,
        storyboardPreserveChildDimensions: true,
      },
    });
    const result = frame([
      standalone,
      group(),
      image('node', { extent: 'parent' }),
      image('peer', { extent: 'parent' }),
    ]);
    expect(result).toMatchObject({
      handled: true,
      kind: 'attach',
      targetGroupId: 'standalone',
      completion: { clearSelectionIds: ['node', 'peer'], selectedIds: [], clearFrame: true },
    });
    for (const id of ['node', 'peer']) {
      expect(byId(result, id)).toMatchObject({ parentId: 'standalone', width: 622, height: 350 });
      expect(byId(result, id)).not.toHaveProperty('extent');
    }
    expect(result.completion).not.toHaveProperty('parentBoundsGroupIds');
    expect(byId(result, 'standalone').data.childNodeIds).toEqual(['node', 'peer']);
    expect(byId(result, 'standalone').width).toBe(standalone.width);
    expect(byId(result, 'standalone').height).toBe(standalone.height);
  });
});

describe('drop geometry, atomicity and replay', () => {
  it('uses source measured-first child bounds and stored-first group bounds by default', () => {
    const target = group('target', {
      width: 40,
      height: 30,
      measured: { width: 1000, height: 1000 },
    });
    const node = image('node', {
      position: { x: 100, y: 100 },
      width: 1000,
      height: 1000,
      measured: { width: 40, height: 30 },
    });
    expect(plan([target, node]).kind).toBe('attach');
  });

  it('distinguishes zero default single size from the source 350×350 missing multi flow size', () => {
    const target = group('target', { width: 100, height: 100 });
    const node = image('node', { width: undefined, height: undefined });
    const peer = image('peer', { width: undefined, height: undefined });
    expect(plan([target, node]).kind).toBe('attach');
    expect(frame([target, node, peer]).handled).toBe(false);
  });

  it('accepts an injected renderer size without changing canonical ratio-result dimensions', () => {
    const getNodeSize = vi.fn((node) =>
      node.type === 'group' ? { width: 200, height: 200 } : { width: 10, height: 10 },
    );
    const result = plan([group(), image('node', { position: { x: 290, y: 290 } })], {
      getNodeSize,
    });
    expect(result.kind).toBe('attach');
    expect(byId(result, 'node')).toMatchObject({ width: 622, height: 350 });
    expect(getNodeSize).toHaveBeenCalledWith(expect.objectContaining({ id: 'node' }), {
      role: 'single',
      surface: 'node',
    });
  });

  it('preserves nested parent world coordinates when migrating into a nested target', () => {
    const outer = group('outer', { position: { x: 1000, y: 2000 }, data: {} });
    const old = group('old', {
      parentId: 'outer',
      position: { x: 0, y: 0 },
      width: 100,
      height: 100,
      data: { childNodeIds: ['node'] },
    });
    const target = group('target', { parentId: 'outer' });
    const node = image('node', { parentId: 'old', extent: 'parent' });
    const result = plan([old, target, outer, node]);
    expect(result.kind).toBe('attach');
    expect(byId(result, 'node').position).toEqual({ x: 20, y: 40 });
    expect(byId(result, 'old').data.childNodeIds).toEqual([]);
  });

  it('keeps input immutable and deterministically replays a StrictMode updater on the same input', () => {
    const nodes = [group(), image(), image('peer')];
    const freeze = (value) => {
      if (!value || typeof value !== 'object') return value;
      Object.values(value).forEach(freeze);
      return Object.freeze(value);
    };
    freeze(nodes);
    const options = { draggedIds: ['node', 'peer'] };
    expect(plan(nodes, options)).toEqual(plan(nodes, options));
    expect(nodes[1]).not.toHaveProperty('parentId');
  });

  it.each([
    { nodes: null },
    { nodes: [image(), image()] },
    { nodes: [group(), image()], draggedIds: ['node', 'node'] },
    { nodes: [group(), image()], draggedIds: null },
    { nodes: [group(), image()], selectedIds: null },
    { nodes: [group(), image()], surface: 'unknown' },
    { nodes: [group(), image()], draggedNodeId: 'missing' },
  ])('rejects invalid input without modifying it %j', (options) => {
    const result = planCanvasStoryboardGroupDrop({ draggedNodeId: 'node', ...options });
    expect(result).toMatchObject({
      valid: false,
      handled: false,
      changed: false,
      nodes: options.nodes,
    });
  });

  it.each([
    image('node', { parentId: 'missing' }),
    image('node', { position: { x: NaN, y: 140 } }),
    image('node', { measured: { width: -1, height: 30 } }),
    image('node', { data: { params: { settings: [] } } }),
  ])(
    'fails atomic planning for malformed ancestry, geometry or mutable parameter shape',
    (node) => {
      const nodes = [group(), node];
      expect(plan(nodes)).toMatchObject({ valid: false, handled: false, changed: false, nodes });
    },
  );

  it('returns the original graph when a later peer is invalid after an earlier attachment was planned', () => {
    const nodes = [group(), image(), image('peer', { data: { params: { settings: [] } } })];
    expect(plan(nodes, { draggedIds: ['node', 'peer'] })).toMatchObject({
      valid: false,
      changed: false,
      nodes,
    });
  });

  it('returns the original graph for invalid target metadata or a throwing renderer adapter', () => {
    const nodes = [
      group('target', { data: { storyboardGroupType: 'image', childNodeIds: 'corrupt' } }),
      image(),
    ];
    expect(plan(nodes)).toMatchObject({ valid: false, changed: false, nodes });
    const validNodes = [group(), image()];
    expect(
      plan(validNodes, {
        getNodeSize: () => {
          throw new Error('renderer');
        },
      }),
    ).toMatchObject({ valid: false, changed: false, nodes: validNodes });
  });

  it('does not create a parent cycle when a malformed image ancestor contains a target group', () => {
    const node = image();
    const target = group('target', { parentId: 'node', position: { x: -20, y: -40 } });
    const nodes = [target, node];
    expect(plan(nodes)).toMatchObject({ valid: false, changed: false, nodes });
  });
});

describe('source virtual-frame hover J', () => {
  const hover = (nodes, options = {}) =>
    resolveCanvasStoryboardFrameDropHover({
      nodes,
      draggedIds: ['node', 'peer'],
      ...options,
    });

  it('returns only incoming count and keeps the graph unchanged', () => {
    const target = group();
    const nodes = [target, image(), image('peer')];
    const before = structuredClone(nodes);
    expect(hover(nodes)).toEqual({ valid: true, targetGroupId: 'target', count: 2 });
    expect(nodes).toEqual(before);
    const inside = image('peer', { parentId: 'target', position: { x: 20, y: 40 } });
    expect(hover([target, image(), inside])).toEqual({
      valid: true,
      targetGroupId: 'target',
      count: 1,
    });
  });

  it('suppresses live Alt hover even though final Z accepts the same copied frame', () => {
    const nodes = [group(), image(), image('peer')];
    expect(hover(nodes, { liveAltCopy: true })).toEqual({
      valid: true,
      targetGroupId: null,
      count: 0,
    });
    expect(frame(nodes, { liveAltCopy: true }).kind).toBe('attach');
  });

  it.each(['text', 'group', 'script', 'video'])(
    'clears hover without warnings for non-image member type %s',
    (type) => {
      expect(hover([group(), image(), image('peer', { type })])).toEqual({
        valid: true,
        targetGroupId: null,
        count: 0,
      });
    },
  );

  it('clears hover for insufficient real members or no target hit', () => {
    expect(hover([group(), image()], { draggedIds: ['node', 'missing'] }).count).toBe(0);
    expect(
      hover([group('target', { position: { x: 3000, y: 3000 } }), image(), image('peer')]).count,
    ).toBe(0);
  });

  it('uses containment before center and graph order without a standalone-only or hidden filter', () => {
    const center = group('center', { width: 30, height: 30 });
    const full = group('full', { hidden: true });
    const node = image('node', { position: { x: 90, y: 100 } });
    const peer = image('peer', { position: { x: 200, y: 200 } });
    expect(hover([center, full, node, peer]).targetGroupId).toBe('full');
    expect(hover([center, node, peer]).targetGroupId).toBe('center');
    const standalone = group('standalone', {
      data: { storyboardGroupType: 'image', standaloneStoryboardImageGrid: true },
    });
    expect(hover([standalone, group(), image(), peer]).targetGroupId).toBe('standalone');
  });

  it('clears hover when capacity is full without proceeding to a later available target', () => {
    const first = group('first', {
      data: {
        storyboardGroupType: 'image',
        storyboardManualGridCols: 1,
        storyboardManualGridRows: 1,
      },
    });
    expect(hover([first, group(), image(), image('peer')])).toEqual({
      valid: true,
      targetGroupId: null,
      count: 0,
    });
  });

  it('clears hover when all moved images are already inside the target', () => {
    const target = group();
    const node = image('node', { parentId: 'target', position: { x: 20, y: 40 } });
    const peer = image('peer', { parentId: 'target', position: { x: 60, y: 40 } });
    expect(hover([target, node, peer])).toEqual({ valid: true, targetGroupId: null, count: 0 });
  });

  it('uses injected renderer geometry while preserving the source count contract', () => {
    const getNodeSize = (node) =>
      node.type === 'group' ? { width: 200, height: 200 } : { width: 10, height: 10 };
    const nodes = [
      group(),
      image('node', { position: { x: 290, y: 290 } }),
      image('peer', { position: { x: 290, y: 290 } }),
    ];
    expect(hover(nodes, { getNodeSize })).toEqual({
      valid: true,
      targetGroupId: 'target',
      count: 2,
    });
  });

  it.each([
    { nodes: null },
    { nodes: [image(), image()] },
    { nodes: [group(), image(), image('peer')], draggedIds: ['node', 'node'] },
    { nodes: [group(), image(), image('peer')], getNodeSize: () => ({ width: NaN, height: 20 }) },
  ])('fails invalid hover geometry atomically', (options) => {
    expect(
      resolveCanvasStoryboardFrameDropHover({ draggedIds: ['node', 'peer'], ...options }),
    ).toEqual({
      valid: false,
      targetGroupId: null,
      count: 0,
    });
  });
});
