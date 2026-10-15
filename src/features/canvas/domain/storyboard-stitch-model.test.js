import { describe, expect, it } from 'vitest';
import {
  findStoryboardStitchNodePosition,
  planStoryboardStitch,
  storyboardStitchCoverRect,
} from './storyboard-stitch-model.js';

const image = (id, patch = {}) => ({
  id,
  type: 'image',
  parentId: 'group-long-id',
  position: { x: 4, y: 4 },
  width: 100,
  height: 80,
  data: { name: id, url: [`/${id}.png`], params: {} },
  ...patch,
});
const group = (data = {}) => ({
  id: 'group-long-id',
  type: 'group',
  position: { x: 100, y: 200 },
  width: 212,
  height: 172,
  data: {
    standaloneStoryboardImageGrid: true,
    storyboardGroupType: 'image',
    storyboardManualGridCols: 2,
    storyboardManualGridRows: 2,
    ...data,
  },
});
const plan = (nodes, options = {}) =>
  planStoryboardStitch({ nodes, groupId: 'group-long-id', ...options });
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value)) freeze(item);
  }
  return value;
};

describe('source storyboard stitch planning with local URL preservation', () => {
  it('plans a real 2K PNG and every reserved slot without mutating source params, URLs or positions', () => {
    const nodes = freeze([group({ childNodeIds: ['a'] }), image('a')]);
    const result = plan(nodes);
    expect(result.valid).toBe(true);
    expect(result.plan).toMatchObject({
      name: '分镜拼接-2k',
      fileName: '分镜拼接-2k-group-lo.png',
      cols: 2,
      rows: 2,
      totalSlots: 4,
      imageCount: 1,
      emptyCellCount: 3,
      cellWidth: 960,
      cellHeight: 540,
      width: 2048,
      height: 1152,
      displaySize: { width: 622, height: 350 },
      position: { x: 432, y: 200 },
    });
    expect(result.plan.items).toEqual([
      {
        nodeId: 'a',
        url: '/a.png',
        index: 0,
        numberLabel: '01',
        x: 0,
        y: 0,
        width: 960,
        height: 540,
      },
      {
        nodeId: undefined,
        url: undefined,
        index: 1,
        numberLabel: '02',
        x: 960,
        y: 0,
        width: 960,
        height: 540,
      },
      {
        nodeId: undefined,
        url: undefined,
        index: 2,
        numberLabel: '03',
        x: 0,
        y: 540,
        width: 960,
        height: 540,
      },
      {
        nodeId: undefined,
        url: undefined,
        index: 3,
        numberLabel: '04',
        x: 960,
        y: 540,
        width: 960,
        height: 540,
      },
    ]);
    expect(nodes[1].data.params).toEqual({});
  });

  it('uses preferred complete image order, ignoring non-image members, and keeps hidden images in the stitch', () => {
    const nodes = [
      group({ childNodeIds: ['b', 'text', 'a'] }),
      image('a'),
      image('b', { hidden: true }),
      { ...image('text'), type: 'text' },
      image('other', { parentId: undefined, position: { x: 2500, y: 2500 } }),
    ];
    const result = plan(nodes).plan;
    expect(result.sourceIds).toEqual(['b', 'a']);
    expect(result.imageCount).toBe(2);
    expect(result.items.map((item) => item.nodeId)).toEqual(['b', 'a', undefined, undefined]);
  });

  it('falls back to numeric names for incomplete preferred order rather than drag y/x order', () => {
    const nodes = [
      group({ childNodeIds: ['a'] }),
      image('a', { position: { x: 4, y: 4 }, data: { name: '分镜 10', url: ['/a.png'] } }),
      image('b', { position: { x: 500, y: 500 }, data: { name: '分镜 2', url: ['/b.png'] } }),
    ];
    expect(plan(nodes).plan.sourceIds).toEqual(['b', 'a']);
  });

  it('records the source length-based duplicate preferred-order quirk without duplicating graph nodes', () => {
    const nodes = freeze([group({ childNodeIds: ['a', 'a'] }), image('a'), image('b')]);
    expect(plan(nodes).plan.sourceIds).toEqual(['a', 'a', 'b']);
    expect(nodes).toHaveLength(3);
  });

  it('prefers the first original URL and preserves processing and watermark query parameters exactly', () => {
    const url = 'https://example.test/a.png?x-oss-process=image/watermark&image_process=cover';
    const nodes = [
      group(),
      image('a', { data: { originalUrl: [null, '', url], url: ['/preview.png'], params: {} } }),
    ];
    expect(plan(nodes).plan.items[0].url).toBe(url);
    nodes[1].data.originalUrl = 'https://example.test/string-is-not-source-array.png';
    expect(plan(nodes).plan.items[0].url).toBe('/preview.png');
  });

  it('uses ratio from the first ordered image even if that image has no URL and ignores preserve-size geometry', () => {
    const nodes = [
      group({ storyboardPreserveChildDimensions: true, showStoryboardShotNumbers: true }),
      image('a', { width: 30, height: 500, data: { params: { settings: { ratio: '4:5' } } } }),
      image('b', { width: 800, height: 20 }),
    ];
    expect(plan(nodes, { resolution: '4k' }).plan).toMatchObject({
      ratio: '4:5',
      cellWidth: 540,
      cellHeight: 676,
      width: 3271,
      height: 4096,
      imageCount: 1,
      emptyCellCount: 3,
      showShotNumbers: true,
      shotNumberFontPx: 16,
    });
    expect(nodes[1].width).toBe(30);
  });

  it('bounds the long side to the selected resolution and retains the source area ceiling', () => {
    const nodes = [
      group({ storyboardManualGridCols: 5, storyboardManualGridRows: 5 }),
      ...Array.from({ length: 25 }, (_, index) =>
        image(`shot-${index}`, {
          data: { url: [`/${index}.png`], params: { settings: { ratio: '1:1' } } },
        }),
      ),
    ];
    const result = plan(nodes, { resolution: '4k' }).plan;
    expect([result.width, result.height]).toEqual([4096, 4096]);
    expect(result.width * result.height).toBeLessThanOrEqual(0x2000000);
    expect(result.items.at(-1).numberLabel).toBe('25');
    expect(result.shotNumberFontPx).toBe(40);
  });

  it('requires the source image-pack gate and separate grid flag/source link', () => {
    const noGrid = [group({ standaloneStoryboardImageGrid: false }), image('a')];
    expect(plan(noGrid)).toEqual({ valid: false, reason: 'notStoryboardGrid' });
    const linked = [
      group({ standaloneStoryboardImageGrid: false, sourceScriptNodeId: 'script' }),
      image('a'),
    ];
    expect(plan(linked).valid).toBe(true);
    linked[0].data.storyboardGroupType = 'video';
    expect(plan(linked)).toEqual({ valid: false, reason: 'notStoryboardImageGroup' });
  });

  it.each([
    [[], {}, 'missingGroup'],
    [[group()], {}, 'noImageNodes'],
    [[group(), image('a', { data: { url: [] } })], {}, 'noStitchableImages'],
    [[group(), image('a')], { resolution: '8k' }, 'invalidInput'],
    [[group(), image('a', { position: { x: Infinity, y: 0 } })], {}, 'invalidGeometry'],
    [[group(), image('a'), image('a')], {}, 'invalidGeometry'],
  ])('atomically rejects unusable input: %s', (nodes, options, reason) => {
    freeze(nodes);
    expect(plan(nodes, options)).toEqual({ valid: false, reason });
  });
});

describe('stitch world placement and cover crop', () => {
  it('uses source content-width priority, measured height and nested world parent coordinates', () => {
    const parent = { id: 'parent', position: { x: 500, y: 600 }, width: 20, height: 20 };
    const nested = {
      ...group(),
      parentId: 'parent',
      measured: { width: 212, height: 172 },
      data: { contentWidth: 300 },
    };
    expect(
      findStoryboardStitchNodePosition({
        group: nested,
        nodes: [parent, nested],
        size: { width: 100, height: 80 },
      }),
    ).toEqual({ x: 1020, y: 800 });
  });

  it('chooses the nearest collision-free candidate and preserves source vertical-first distance ties', () => {
    const target = group();
    const obstacle = { id: 'occupied', position: { x: 432, y: 200 }, width: 100, height: 100 };
    expect(
      findStoryboardStitchNodePosition({
        group: target,
        nodes: [target, obstacle],
        size: { width: 622, height: 350 },
      }),
    ).toEqual({ x: 432, y: 350 });
  });

  it('rejects broken/cyclic parents instead of looping or placing a partial result', () => {
    const target = { ...group(), parentId: 'missing' };
    expect(
      findStoryboardStitchNodePosition({
        group: target,
        nodes: [target],
        size: { width: 100, height: 80 },
      }),
    ).toBeNull();
    target.parentId = target.id;
    expect(
      findStoryboardStitchNodePosition({
        group: target,
        nodes: [target],
        size: { width: 100, height: 80 },
      }),
    ).toBeNull();
  });

  it('center-crops wide and tall natural images without stretching', () => {
    const wideCrop = storyboardStitchCoverRect(4000, 1000, 960, 540);
    expect(wideCrop.x).toBeCloseTo(1111.111111111111, 8);
    expect(wideCrop.width).toBeCloseTo(1777.7777777777778, 8);
    expect(wideCrop).toMatchObject({ y: 0, height: 1000 });
    expect(storyboardStitchCoverRect(1000, 4000, 960, 540)).toEqual({
      x: 0,
      y: 1718.75,
      width: 1000,
      height: 562.5,
    });
    expect(storyboardStitchCoverRect(0, 1000, 960, 540)).toBeNull();
    expect(storyboardStitchCoverRect(Infinity, 1000, 960, 540)).toBeNull();
  });
});
