import { describe, expect, it } from 'vitest';
import { planStoryboardSlotInsert } from './storyboard-slot-model.js';

const image = (id, patch = {}) => ({
  id,
  type: 'image',
  position: { x: 4, y: 4 },
  width: 100,
  height: 80,
  data: { type: 'image', name: id, url: [`/${id}.png`], params: {} },
  ...patch,
});
const group = (data = {}, patch = {}) => ({
  id: 'g',
  type: 'group',
  position: { x: 100, y: 100 },
  width: 212,
  height: 172,
  data: {
    type: 'group',
    name: 'Custom storyboard',
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    storyboardManualGridCols: 2,
    storyboardManualGridRows: 2,
    childNodeIds: ['a'],
    ...data,
  },
  ...patch,
});
const frozen = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
};
const plan = (nodes, imageNode = image('new'), patch = {}) =>
  planStoryboardSlotInsert({ nodes, imageNode, groupId: 'g', slotIndex: 1, ...patch });

describe('source tJ storyboard empty-slot insertion', () => {
  it('inserts one actual image in the requested empty slot then runs real membership compaction atomically', () => {
    const outside = image('outside', { position: { x: 1000, y: 1000 } });
    const nodes = frozen([group(), image('a', { parentId: 'g' }), outside]);
    const incoming = frozen(
      image('new', { parentId: 'obsolete', extent: 'parent', position: { x: 900, y: 900 } }),
    );
    const result = plan(nodes, incoming, { slotIndex: 3 });
    expect(result).toMatchObject({
      valid: true,
      changed: true,
      insertedId: 'new',
      groupId: 'g',
      reconciledGroupIds: ['g'],
    });
    expect(result.nodes).toHaveLength(4);
    const inserted = result.nodes[3];
    expect(inserted).toMatchObject({
      parentId: 'g',
      position: { x: 108, y: 4 },
      width: 100,
      height: 80,
      measured: { width: 100, height: 80 },
      data: {
        type: 'image',
        action: 'image_resource',
        name: '分镜 #4',
        _explicitContentDims: true,
        contentWidth: 100,
        contentHeight: 80,
      },
    });
    expect(inserted).not.toHaveProperty('extent');
    expect(result.nodes[0].data).toMatchObject({
      childNodeIds: ['a', 'new'],
      name: 'Custom storyboard',
      nodeWidth: 212,
      nodeHeight: 172,
      groupLayoutMode: 'grid',
    });
    expect(result.nodes[2]).toBe(outside);
    expect(nodes[0].data.childNodeIds).toEqual(['a']);
    expect(incoming.parentId).toBe('obsolete');
  });

  it('does not apply sibling ratio or copy source-script fields and preserves current params/resource metadata', () => {
    const nodes = [
      group({ sourceScriptNodeId: 'script' }),
      image('a', { parentId: 'g', data: { params: { settings: { ratio: '9:16' } } } }),
    ];
    const incoming = image('new', {
      resourceMeta: { items: [{ kind: 'image', sourceUrl: '/new.png', byteSize: 9 }] },
      data: {
        type: 'image',
        localMediaReady: true,
        url: ['/new.png'],
        params: { prompt: 'keep prompt', settings: { ratio: '4:5', seed: 17 } },
      },
    });
    const result = plan(nodes, incoming);
    const inserted = result.nodes.at(-1);
    expect(inserted.data.params).toEqual({
      prompt: 'keep prompt',
      settings: { ratio: '4:5', seed: 17 },
    });
    expect(inserted.data).not.toHaveProperty('sourceScriptNodeId');
    expect(inserted.data).toMatchObject({ localMediaReady: true, action: 'image_resource' });
    expect(inserted.resourceMeta).toEqual(incoming.resourceMeta);
    expect(nodes[1].data.params.settings.ratio).toBe('9:16');
  });

  it('uses the source 48-pixel minimum for inserted flow dimensions as well as explicit content', () => {
    const result = plan([group(), image('a', { parentId: 'g', width: 10, height: 20 })]);
    expect(result.valid).toBe(true);
    expect(result.nodes.at(-1)).toMatchObject({
      width: 48,
      height: 48,
      measured: { width: 48, height: 48 },
      data: { contentWidth: 48, contentHeight: 48 },
    });
    expect(result.nodes[0]).toMatchObject({ width: 108, height: 108 });
  });

  it('uses measured group dimensions for an empty group without stored width/height', () => {
    const nodes = [
      group(
        { childNodeIds: [] },
        { width: undefined, height: undefined, measured: { width: 212, height: 172 } },
      ),
    ];
    const result = plan(nodes, image('new'), { slotIndex: 3 });
    expect(result.valid).toBe(true);
    expect(result.nodes.at(-1)).toMatchObject({
      width: 100,
      height: 80,
      position: { x: 4, y: 4 },
      data: { name: '分镜 #4' },
    });
    expect(result.nodes[0]).toMatchObject({
      width: 212,
      height: 172,
      data: { childNodeIds: ['new'] },
    });
  });

  it('preserves heterogeneous real slot sizes and reflows using the actual new member dimensions', () => {
    const nodes = frozen([
      group({ childNodeIds: ['a', 'b'], storyboardPreserveChildDimensions: true }),
      image('a', { parentId: 'g', width: 30, height: 40 }),
      image('b', { parentId: 'g', width: 80, height: 90, position: { x: 38, y: 4 } }),
    ]);
    const result = plan(nodes, image('new'), { slotIndex: 3 });
    expect(result.valid).toBe(true);
    expect(result.nodes.at(-1)).toMatchObject({
      width: 80,
      height: 120,
      measured: { width: 80, height: 120 },
      position: { x: 4, y: 98 },
      data: { contentWidth: 80, contentHeight: 120 },
    });
    expect(result.nodes[1]).toMatchObject({
      width: 30,
      height: 40,
      measured: { width: 30, height: 40 },
      data: { contentWidth: 30, contentHeight: 40 },
    });
    expect(result.nodes[0]).toMatchObject({
      width: 172,
      height: 222,
      data: { childNodeIds: ['a', 'b', 'new'] },
    });
  });

  it('uses complete actual preferred order, otherwise source numeric names instead of drag y/x order', () => {
    const a = image('a', { parentId: 'g', data: { name: 'Shot 10' }, position: { x: 0, y: 0 } });
    const b = image('b', { parentId: 'g', data: { name: 'Shot 2' }, position: { x: 999, y: 999 } });
    const fallback = plan([group({ childNodeIds: ['a'] }), a, b], image('new'), { slotIndex: 2 });
    expect(fallback.nodes[0].data.childNodeIds).toEqual(['b', 'a', 'new']);
    const preferred = plan([group({ childNodeIds: ['a', 'b'] }), a, b], image('new'), {
      slotIndex: 2,
    });
    expect(preferred.nodes[0].data.childNodeIds).toEqual(['a', 'b', 'new']);
  });

  it('applies tJ requested-index splice to raw preferred IDs before actual membership filters stale IDs', () => {
    const nodes = [
      group({ childNodeIds: ['missing', 'a', 'b'] }),
      image('a', { parentId: 'g' }),
      image('b', { parentId: 'g' }),
    ];
    const result = plan(nodes, image('new'), { slotIndex: 2 });
    expect(result.valid).toBe(true);
    expect(result.nodes[0].data.childNodeIds).toEqual(['a', 'new', 'b']);
    expect(result.nodes.at(-1).data.name).toBe('分镜 #3');
  });

  it('preserves a complete actual mixed-child order while capacity and empty slots count only images', () => {
    const nodes = [
      group({ childNodeIds: ['a', 'text'] }),
      image('a', { parentId: 'g', data: { name: 'zzzz' } }),
      image('text', { parentId: 'g', type: 'text', data: { name: 'aaaa' } }),
    ];
    const result = plan(nodes);
    expect(result.valid).toBe(true);
    expect(result.nodes[0].data.childNodeIds).toEqual(['a', 'new', 'text']);
    expect(result.nodes[2].parentId).toBe('g');
    expect(result.nodes.find((node) => node.id === 'new').position).toEqual({ x: 108, y: 4 });
  });

  it('rejects an occupied or no-longer-existing slot without returning a partial reflow', () => {
    const nodes = frozen([group(), image('a', { parentId: 'g' })]);
    for (const slotIndex of [0, 4]) {
      const result = plan(nodes, image('new'), { slotIndex });
      expect(result).toMatchObject({ valid: false, nodes, reason: 'missingSlot' });
      expect(result.nodes).toBe(nodes);
    }
  });

  it('honors fixed capacity despite possible layout expansion and the independent 25-image limit', () => {
    const fixed = frozen([
      group({ storyboardManualGridCols: 1, storyboardManualGridRows: 1 }),
      image('a', { parentId: 'g' }),
    ]);
    expect(plan(fixed)).toMatchObject({ valid: false, nodes: fixed, reason: 'full' });
    const children = Array.from({ length: 25 }, (_, index) =>
      image(`child-${index}`, { parentId: 'g' }),
    );
    const full = frozen([
      group({
        storyboardManualGridCols: 5,
        storyboardManualGridRows: 5,
        childNodeIds: children.map((node) => node.id),
      }),
      ...children,
    ]);
    expect(plan(full, image('new'), { slotIndex: 25 })).toMatchObject({
      valid: false,
      nodes: full,
      reason: 'full',
    });
    const almost = [full[0], ...children.slice(0, 24)];
    const accepted = plan(almost, image('new'), { slotIndex: 24 });
    expect(accepted.valid).toBe(true);
    expect(
      accepted.nodes.filter((node) => node.parentId === 'g' && node.type === 'image'),
    ).toHaveLength(25);
  });

  it.each([
    ['negative slot', { slotIndex: -1 }],
    ['fractional slot', { slotIndex: 1.5 }],
    ['nonimage', { imageNode: image('new', { type: 'video' }) }],
    ['duplicate new ID', { imageNode: image('a') }],
  ])('rejects %s and retains the original graph', (_, patch) => {
    const nodes = frozen([group(), image('a', { parentId: 'g' })]);
    expect(plan(nodes, image('new'), patch)).toMatchObject({
      valid: false,
      nodes,
      reason: 'invalidImage',
    });
  });

  it.each([
    { standaloneStoryboardImageGrid: false },
    { storyboardGroupType: 'video' },
    { storyboardGroupType: undefined },
  ])('rejects an ineligible standalone target %j', (data) => {
    const nodes = frozen([group(data), image('a', { parentId: 'g' })]);
    expect(plan(nodes)).toMatchObject({ valid: false, nodes, reason: 'missingGroup' });
  });

  it('rejects invalid content dimensions and duplicate graph IDs atomically', () => {
    const corrupt = frozen([
      group(),
      image('a', { parentId: 'g', data: { contentWidth: Infinity } }),
    ]);
    expect(plan(corrupt)).toMatchObject({
      valid: false,
      nodes: corrupt,
      reason: 'invalidDimensions',
    });
    const duplicate = frozen([
      group(),
      image('a', { parentId: 'g' }),
      image('a', { parentId: 'g' }),
    ]);
    const result = plan(duplicate, image('new'), { slotIndex: 2 });
    expect(result.valid).toBe(false);
    expect(result.nodes).toBe(duplicate);
  });
});
