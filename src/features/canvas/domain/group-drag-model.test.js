import { describe, expect, it, vi } from 'vitest';
import { planCanvasGroupDragDrop } from './group-drag-model.js';

const node = (id = 'node', patch = {}) => ({
  id,
  type: 'image',
  position: { x: 120, y: 140 },
  width: 40,
  height: 30,
  data: { name: id },
  ...patch,
});
const group = (id = 'group', patch = {}) =>
  node(id, {
    type: 'group',
    position: { x: 100, y: 100 },
    width: 200,
    height: 180,
    zIndex: -1001,
    data: { name: '分组 2 个节点', childNodeIds: ['first', 'second'] },
    ...patch,
  });
const plan = (nodes, options = {}) =>
  planCanvasGroupDragDrop({ nodes, draggedNodeId: 'node', ...options });

describe('ordinary node drag group plan', () => {
  it('attaches an entirely contained root with source child order and relative position', () => {
    const source = node('node', { extent: 'parent', zIndex: 4 });
    const target = group();
    const nodes = [target, source];
    const before = structuredClone(nodes);
    const result = plan(nodes);
    expect(result).toMatchObject({
      valid: true,
      changed: true,
      kind: 'attach',
      targetGroupId: 'group',
      transitionIds: ['node'],
      sourceGroupIds: [],
    });
    expect(result.nodes[1]).toMatchObject({
      parentId: 'group',
      position: { x: 20, y: 40 },
      extent: 'parent',
      zIndex: 4,
    });
    expect(result.nodes[0].data).toEqual({
      name: '分组 3 个节点',
      childNodeIds: ['first', 'second', 'node'],
    });
    for (const key of ['position', 'width', 'height', 'zIndex'])
      expect(result.nodes[0][key]).toEqual(target[key]);
    expect(nodes).toEqual(before);
  });

  it('allows inclusive full-containment edges but never center or mere overlap for an ordinary target', () => {
    expect(plan([group(), node('node', { position: { x: 260, y: 250 } })]).kind).toBe('attach');
    for (const position of [
      { x: 260.01, y: 250 },
      { x: 80, y: 110 },
      { x: 295, y: 110 },
    ]) {
      const nodes = [group(), node('node', { position })];
      expect(plan(nodes)).toMatchObject({ kind: 'none', changed: false, nodes });
    }
  });

  it('chooses the first containing group in source graph order, rather than the smallest or topmost', () => {
    const first = group('first', { width: 800, height: 800, zIndex: -2000 });
    const second = group('second', { zIndex: 100 });
    expect(plan([first, second, node()]).targetGroupId).toBe('first');
    expect(plan([second, first, node()]).targetGroupId).toBe('second');
  });

  it('preserves source hidden-target eligibility instead of inventing a visible-group filter', () => {
    const target = group('hidden', { hidden: true });
    expect(plan([target, group('visible'), node()]).targetGroupId).toBe('hidden');
    const special = group('hidden-special', {
      hidden: true,
      data: { storyboardGroupType: 'image' },
    });
    expect(plan([special, node(), node('other')], { draggedIds: ['node', 'other'] })).toMatchObject(
      {
        kind: 'blocked',
        targetGroupId: 'hidden-special',
        reason: 'storyboardMultiDrop',
      },
    );
  });

  it.each([
    { characterAsset: { id: 'character' } },
    { breakdownSourceNodeId: 'breakdown' },
    { storyboardGroupType: 'video', sourceScriptNodeId: 'script' },
  ])('does not invent an ordinary-target exclusion for special metadata %j', (data) => {
    expect(plan([group('group', { data }), node()]).kind).toBe('attach');
  });

  it('does not attach to a video_group target, while allowing a video_group source into a group', () => {
    expect(plan([group('group', { type: 'video_group' }), node()]).kind).toBe('none');
    expect(plan([group(), node('node', { type: 'video_group' })]).kind).toBe('attach');
  });

  it.each(['group', 'script', 'script-v2'])(
    'keeps dragged %s roots out of ordinary parenting',
    (type) => {
      const nodes = [group(), node('node', { type })];
      expect(plan(nodes)).toMatchObject({
        kind: 'none',
        changed: false,
        reason: 'ineligibleSource',
        nodes,
      });
    },
  );

  it('tests source node.type without treating a data.type as a second source gate', () => {
    expect(plan([group(), node('node', { data: { type: 'script' } })]).kind).toBe('attach');
  });

  it.each([
    { x: -39.99, y: 20 },
    { x: 199.99, y: 20 },
    { x: 20, y: -29.99 },
    { x: 20, y: 179.99 },
  ])(
    'retains any positive overlap with its parent at %j without shrinking or reordering the group',
    (position) => {
      const nodes = [group(), node('node', { parentId: 'group', position })];
      expect(plan(nodes)).toMatchObject({ kind: 'retain', changed: false, nodes });
    },
  );

  it.each([
    { x: -40, y: 20 },
    { x: 200, y: 20 },
    { x: 20, y: -30 },
    { x: 20, y: 180 },
  ])('detaches when there is no parent overlap, including edge contact %j', (position) => {
    const parent = group('group', {
      data: { name: '分组 3 个节点', childNodeIds: ['node', 'missing', 'sibling'] },
    });
    const source = node('node', { parentId: 'group', extent: 'parent', position, zIndex: 8 });
    const nodes = [parent, source];
    const result = plan(nodes);
    expect(result).toMatchObject({
      kind: 'detach',
      transitionIds: ['node'],
      sourceGroupIds: ['group'],
    });
    expect(result.nodes[1]).toMatchObject({
      position: { x: 100 + position.x, y: 100 + position.y },
      zIndex: 8,
    });
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[1]).not.toHaveProperty('extent');
    expect(result.nodes[0].data).toEqual({
      name: '分组 2 个节点',
      childNodeIds: ['missing', 'sibling'],
    });
    expect(result.nodes[0].width).toBe(parent.width);
    expect(result.nodes[0].height).toBe(parent.height);
  });

  it('detaches and attaches to another group in one immutable plan, preserving world position', () => {
    const first = group('first', { data: { name: '原组', childNodeIds: ['node', 'other'] } });
    const second = group('second', {
      position: { x: 320, y: 100 },
      data: { name: '目标组', childNodeIds: ['x'] },
    });
    const source = node('node', {
      parentId: 'first',
      position: { x: 240, y: 40 },
      extent: 'parent',
    });
    const nodes = [first, second, source];
    const result = plan(nodes);
    expect(result).toMatchObject({
      kind: 'attach',
      targetGroupId: 'second',
      sourceGroupIds: ['first'],
    });
    expect(result.nodes[2]).toMatchObject({ parentId: 'second', position: { x: 20, y: 40 } });
    expect(result.nodes[2]).not.toHaveProperty('extent');
    expect(result.nodes[0].data).toEqual({ name: '原组', childNodeIds: ['other'] });
    expect(result.nodes[1].data).toEqual({ name: '目标组', childNodeIds: ['x', 'node'] });
    expect(plan(result.nodes).kind).toBe('retain');
  });

  it('preserves existing target child metadata order and does not append duplicate IDs', () => {
    const target = group('group', {
      data: { name: '自定义', childNodeIds: ['stale', 'node', 'other'] },
    });
    const result = plan([target, node()]);
    expect(result.nodes[0]).toBe(target);
    expect(result.nodes[0].data.childNodeIds).toEqual(['stale', 'node', 'other']);
  });

  it('keeps an empty source group shell after its last child is dragged out', () => {
    const parent = group('group', { data: { name: '分组 1 个节点', childNodeIds: ['node'] } });
    const result = plan([parent, node('node', { parentId: 'group', position: { x: 200, y: 20 } })]);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0]).toMatchObject({
      id: 'group',
      width: 200,
      height: 180,
      data: { name: '分组 0 个节点', childNodeIds: [] },
    });
  });

  it.each([undefined, '', '分组 99 个节点', '分镜组 99 个节点'])(
    'updates only source-generated or missing count labels %j',
    (name) => {
      const result = plan([group('group', { data: { name, childNodeIds: [] } }), node()]);
      expect(result.nodes[0].data.name).toBe('分组 1 个节点');
    },
  );

  it('accumulates nested local parent transforms while preserving child world positions', () => {
    const outer = node('outer', { type: 'video_group', position: { x: 1000, y: 800 } });
    const parent = group('group', { parentId: 'outer', position: { x: 100, y: 100 } });
    const source = node('node', { parentId: 'group', position: { x: 200, y: 20 } });
    expect(plan([outer, parent, source]).nodes[2].position).toEqual({ x: 1300, y: 920 });
    const incoming = node('node', { position: { x: 1120, y: 940 } });
    expect(plan([outer, parent, incoming]).nodes[2]).toMatchObject({
      parentId: 'group',
      position: { x: 20, y: 40 },
    });
  });

  it('uses source child measured-first and group stored-first bounds unless the renderer adapter is injected', () => {
    const parent = group('group', { width: 200, measured: { width: 40, height: 180 } });
    const source = node('node', {
      position: { x: 240, y: 120 },
      measured: { width: 80, height: 30 },
    });
    expect(plan([parent, source]).kind).toBe('none');
    expect(
      plan([parent, source], {
        getNodeSize: (value) => ({ width: value.width, height: value.height }),
      }).kind,
    ).toBe('attach');
    expect(
      plan([
        group('group', { width: 0 }),
        node('node', { position: { x: 100, y: 100 }, width: 0, height: 0 }),
      ]).kind,
    ).toBe('attach');
  });

  it('does not infer source sizes when both stored and measured fields are absent', () => {
    const source = node('node', {
      width: undefined,
      height: undefined,
      position: { x: 300, y: 280 },
    });
    expect(plan([group(), source]).kind).toBe('attach');
  });
});

describe('source drag entry and special handler boundaries', () => {
  it('uses only the primary node for ordinary node-surface multi-drag fallback', () => {
    const other = node('other', { position: { x: 200, y: 150 } });
    const result = plan([group(), node(), other], { draggedIds: ['node', 'other'] });
    expect(result.nodes[1].parentId).toBe('group');
    expect(result.nodes[2]).toBe(other);
  });

  it('detaches only the primary selected child when ordinary multi-drag falls back to single stop', () => {
    const source = node('node', { parentId: 'group', position: { x: 200, y: 20 } });
    const other = node('other', { parentId: 'group', position: { x: 240, y: 20 } });
    const result = plan([group(), source, other], { draggedIds: ['node', 'other'] });
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[2]).toBe(other);
  });

  it.each([false, true])(
    'keeps selection surfaces out of ordinary group drop with liveAltCopy=%s',
    (liveAltCopy) => {
      const nodes = [group(), node()];
      expect(plan(nodes, { surface: 'selection', liveAltCopy })).toMatchObject({
        changed: false,
        nodes,
      });
    },
  );

  it('allows a selection stop or live-copy stop without a primary node because neither reparents it', () => {
    const nodes = [group(), node()];
    expect(
      planCanvasGroupDragDrop({ nodes, surface: 'selection', draggedIds: ['node'] }),
    ).toMatchObject({
      valid: true,
      changed: false,
      nodes,
      reason: 'selectionSurface',
    });
    expect(planCanvasGroupDragDrop({ nodes, liveAltCopy: true })).toMatchObject({
      valid: true,
      changed: false,
      nodes,
      reason: 'liveAltCopy',
    });
  });

  it('skips all stop parenting for a live single or selection Alt copy without consuming its marker', () => {
    const source = node('node', { data: { canvasAltDetachedCopy: true } });
    const nodes = [group(), source];
    expect(plan(nodes, { liveAltCopy: true })).toMatchObject({
      changed: false,
      nodes,
      reason: 'liveAltCopy',
    });
    expect(source.data.canvasAltDetachedCopy).toBe(true);
  });

  it('consumes a source Alt-detached marker on the next ordinary contained stop and skips that attachment', () => {
    const source = node('node', { data: { canvasAltDetachedCopy: true } });
    const nodes = [group(), source];
    const before = structuredClone(nodes);
    const result = plan(nodes);
    expect(result).toMatchObject({ changed: true, kind: 'alt-detached', targetGroupId: 'group' });
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[1].data.canvasAltDetachedCopy).toBe(false);
    expect(result.nodes[0]).toBe(nodes[0]);
    expect(nodes).toEqual(before);
    expect(plan(nodes)).toEqual(result);
    expect(plan(result.nodes).kind).toBe('attach');
  });

  it('clears a detached marker on an ordinary no-target stop while preserving unrelated data', () => {
    const source = node('node', {
      position: { x: 1000, y: 1000 },
      data: { canvasAltDetachedCopy: true, keep: 3 },
    });
    expect(plan([group(), source]).nodes[1].data).toEqual({
      canvasAltDetachedCopy: false,
      keep: 3,
    });
  });

  it('consumes only the primary detached marker before a special multi drop, without attaching its peers', () => {
    const target = group('special', { data: { storyboardGroupType: 'image' } });
    const source = node('node', { data: { canvasAltDetachedCopy: true } });
    const peer = node('other');
    const nodes = [target, source, peer];
    const result = plan(nodes, { draggedIds: ['node', 'other'] });
    expect(result).toMatchObject({
      kind: 'alt-detached',
      changed: true,
      targetGroupId: 'special',
      reason: 'storyboardMultiAltDetached',
    });
    expect(result.nodes[1].data.canvasAltDetachedCopy).toBe(false);
    expect(result.nodes[1]).not.toHaveProperty('parentId');
    expect(result.nodes[2]).toBe(peer);
    expect(source.data.canvasAltDetachedCopy).toBe(true);
  });

  it.each([
    { _explicitContentDims: false, params: { scene: 'group-generate' } },
    { _explicitContentDims: true, params: { scene: 'ordinary' } },
  ])('keeps unconfirmed detached video dimensions %j', (data) => {
    const source = node('node', {
      type: 'video',
      parentId: 'group',
      position: { x: 200, y: 20 },
      data,
    });
    const parent = group('group', {
      data: { storyboardGroupType: 'video', childNodeIds: ['node'] },
    });
    expect(plan([parent, source]).nodes[1].data).toBe(data);
  });

  it('clears only explicit group-generation video dimensions when leaving a source video storyboard group', () => {
    const source = node('node', {
      type: 'video',
      parentId: 'group',
      position: { x: 200, y: 20 },
      data: {
        _explicitContentDims: true,
        contentWidth: 500,
        contentHeight: 280,
        keep: 4,
        params: { scene: 'group-generate', prompt: 'keep' },
      },
    });
    const parent = group('group', {
      data: { storyboardGroupType: 'video', childNodeIds: ['node'] },
    });
    expect(plan([parent, source]).nodes[1].data).toEqual({ keep: 4, params: { prompt: 'keep' } });
  });

  it.each([
    { sourceScriptNodeId: 'script' },
    { storyboardGroupType: 'image' },
    { standaloneStoryboardImageGrid: true },
  ])('identifies image storyboard targets without an ordinary fallback %j', (data) => {
    const nodes = [group('group', { data }), node()];
    expect(plan(nodes)).toMatchObject({
      valid: true,
      changed: false,
      nodes,
      kind: 'blocked',
      reason: 'storyboardImageDrop',
    });
    expect(plan([nodes[0], node('node', { type: 'text' })]).reason).toBe('storyboardImageOnly');
  });

  it('preserves an ordinary detach even when a subsequent image-only target rejects the node', () => {
    const old = group('old', { data: { childNodeIds: ['node'] } });
    const target = group('target', {
      position: { x: 320, y: 100 },
      data: { storyboardGroupType: 'image' },
    });
    const source = node('node', { type: 'text', parentId: 'old', position: { x: 240, y: 40 } });
    const result = plan([old, target, source]);
    expect(result).toMatchObject({ kind: 'blocked', changed: true, reason: 'storyboardImageOnly' });
    expect(result.nodes[2]).not.toHaveProperty('parentId');
    expect(result.nodes[2].position).toEqual({ x: 340, y: 140 });
  });

  it('reserves standalone grid child movement and resizing for its dedicated handler', () => {
    const parent = group('group', {
      data: { standaloneStoryboardImageGrid: true, childNodeIds: ['node'] },
    });
    const nodes = [parent, node('node', { parentId: 'group', position: { x: 200, y: 20 } })];
    expect(plan(nodes)).toMatchObject({
      changed: false,
      kind: 'blocked',
      nodes,
      reason: 'standaloneStoryboardGrid',
    });
  });

  it('uses source special multi target priority: full containment before center before release point', () => {
    const centered = group('center', { data: { storyboardGroupType: 'image' } });
    const contained = group('full', {
      position: { x: 500, y: 100 },
      data: { storyboardGroupType: 'image' },
    });
    const first = node('node', { position: { x: 80, y: 140 } });
    const second = node('other', { position: { x: 520, y: 140 } });
    const result = plan([centered, contained, first, second], {
      draggedIds: ['node', 'other'],
      releasePoint: { x: 110, y: 110 },
    });
    expect(result).toMatchObject({
      kind: 'blocked',
      reason: 'storyboardMultiDrop',
      targetGroupId: 'full',
    });
    expect(
      plan([centered, first, node('other', { position: { x: 900, y: 900 } })], {
        draggedIds: ['node', 'other'],
      }).targetGroupId,
    ).toBe('center');
    expect(
      plan(
        [
          centered,
          node('node', { position: { x: 900, y: 900 } }),
          node('other', { position: { x: 900, y: 900 } }),
        ],
        { draggedIds: ['node', 'other'], releasePoint: { x: 110, y: 110 } },
      ).targetGroupId,
    ).toBe('center');
  });

  it('uses the current visible selection fallback when RF moving roots contain only its selected parent', () => {
    const parent = group('parent', { position: { x: 900, y: 900 } });
    const target = group('special', { data: { storyboardGroupType: 'image' } });
    const source = node('node', { parentId: 'parent', position: { x: -780, y: -760 } });
    const second = node('other', { parentId: 'parent', position: { x: -720, y: -760 } });
    const nodes = [parent, target, source, second];
    expect(
      plan(nodes, { draggedIds: ['parent'], selectedIds: ['parent', 'node', 'other'] }),
    ).toMatchObject({
      kind: 'blocked',
      targetGroupId: 'special',
      reason: 'storyboardMultiDrop',
    });
    // Selecting a parent never manufactures a selection of its unselected descendants.
    expect(
      plan(nodes, { draggedIds: ['parent'], selectedIds: ['parent', 'node'] }).reason,
    ).not.toBe('storyboardMultiDrop');
  });

  it.each([
    { hidden: true },
    { type: 'temp' },
    { data: { type: 'temp' } },
    { id: '__temp_connection_node__' },
  ])(
    'excludes a hidden or temporary store-selection member from the single-root fallback %j',
    (patch) => {
      const target = group('special', { data: { storyboardGroupType: 'image' } });
      const second = node('other', patch);
      expect(
        plan([target, node(), second], { draggedIds: ['node'], selectedIds: ['node', second.id] })
          .reason,
      ).toBe('storyboardImageDrop');
    },
  );

  it('prefers multiple RF moving roots over a larger unrelated current selection', () => {
    const target = group('special', { data: { storyboardGroupType: 'image' } });
    const first = node('node', { position: { x: 900, y: 900 } });
    const second = node('other', { position: { x: 900, y: 900 } });
    const third = node('selected', { position: { x: 120, y: 140 } });
    expect(
      plan([target, first, second, third], {
        draggedIds: ['node', 'other'],
        selectedIds: ['node', 'other', 'selected'],
      }).kind,
    ).toBe('none');
  });

  it('does not mistake selected, current-parent or excluded members for special multi targets', () => {
    const target = group('group', { data: { storyboardGroupType: 'image' } });
    const child = node('node', { parentId: 'group', position: { x: 20, y: 40 } });
    const excluded = node('script', { type: 'script' });
    expect(plan([target, child, excluded], { draggedIds: ['node', 'script'] }).kind).toBe('retain');
  });
});

describe('group drag plan invalid-data and repeat boundaries', () => {
  it.each([
    { nodes: undefined },
    { nodes: [node(), node()] },
    { nodes: [node('')] },
    { nodes: [node('node', { position: { x: NaN, y: 10 } })] },
    { nodes: [node('node', { parentId: 'missing' })] },
    { nodes: [node()], selectedIds: null },
    { nodes: [node()], surface: 'unknown' },
  ])('rejects corrupt caller data without a partial graph %j', (options) => {
    const result = planCanvasGroupDragDrop({ draggedNodeId: 'node', ...options });
    expect(result.valid).toBe(false);
    expect(result.changed).toBe(false);
    expect(result.nodes).toBe(options.nodes);
  });

  it('does not coerce invalid group ancestry into zero coordinates', () => {
    const nodes = [group('group', { position: { x: NaN, y: 0 } }), node()];
    expect(plan(nodes)).toMatchObject({
      valid: false,
      changed: false,
      nodes,
      reason: 'invalidDropData',
    });
  });

  it.each([
    () => ({ width: NaN, height: 30 }),
    () => {
      throw new Error('failed measurement');
    },
  ])('returns the original graph atomically if dimensions cannot be read', (getNodeSize) => {
    const nodes = [group(), node()];
    expect(plan(nodes, { getNodeSize })).toMatchObject({ valid: false, changed: false, nodes });
  });

  it('does not create a cycle by parenting a video_group into its own local descendant', () => {
    const source = node('node', { type: 'video_group', position: { x: 100, y: 100 } });
    const child = group('child', { parentId: 'node', position: { x: 0, y: 0 } });
    const nodes = [source, child];
    expect(plan(nodes)).toMatchObject({
      valid: false,
      changed: false,
      nodes,
      reason: 'cyclicParent',
    });
  });

  it('is deterministic and does not modify frozen source data on StrictMode updater replay', () => {
    const nodes = [group(), node()];
    for (const value of nodes) {
      Object.freeze(value.position);
      if (value.data.childNodeIds) Object.freeze(value.data.childNodeIds);
      Object.freeze(value.data);
      Object.freeze(value);
    }
    Object.freeze(nodes);
    const first = plan(nodes);
    expect(plan(nodes)).toEqual(first);
    expect(first.nodes[1].parentId).toBe('group');
    expect(nodes[1]).not.toHaveProperty('parentId');
    const measurement = vi.fn((value) => ({ width: value.width, height: value.height }));
    expect(plan(nodes, { getNodeSize: measurement }).valid).toBe(true);
    expect(measurement).toHaveBeenCalled();
  });
});
