import { describe, expect, it, vi } from 'vitest';
import {
  FOCUS_ASPECTS,
  applyFocusAspect,
  closestFocusAspect,
  deleteCanvasFocusRegion,
  drawFocusRegion,
  focusGeneratorCapability,
  moveFocusRegion,
  normalizeFocusPoint,
  planCanvasFocusRegion,
  resizeFocusRegion,
} from './focus-region-model.js';

const rect = { left: 100, top: 50, width: 200, height: 100 };
const region = { relX: 0.2, relY: 0.2, width: 0.4, height: 0.4 };
const image = (id, data = {}) => ({
  id,
  type: 'image',
  position: { x: 10, y: 20 },
  width: 350,
  height: 230,
  data: { type: 'image', action: 'image_generate', ...data },
});
const schema = { properties: { focus: true } };
const expectRegion = (actual, expected) => {
  expect(actual).not.toBeNull();
  for (const key of ['relX', 'relY', 'width', 'height'])
    expect(actual[key]).toBeCloseTo(expected[key], 12);
};

describe('source image focus capability', () => {
  it('requires strict schema focus true on an actual IMAGE generator', () => {
    expect(focusGeneratorCapability({ node: image('target'), schema })).toBe(true);
    for (const focus of [undefined, false, 'true', 1])
      expect(
        focusGeneratorCapability({ node: image('target'), schema: { properties: { focus } } }),
      ).toBe(false);
    for (const type of ['video', 'audio', 'text', 'script-v2', 'group'])
      expect(focusGeneratorCapability({ node: { ...image('target'), type }, schema })).toBe(false);
  });

  it('keeps source asset-board, fine-tune and hydrated slash entry gates separate', () => {
    for (const override of [
      { isAssetBoardMode: true },
      { onlyFineTune: true },
      { slashPreset: { scene: 'preset' } },
    ])
      expect(focusGeneratorCapability({ node: image('target'), schema, ...override })).toBe(false);
    expect(focusGeneratorCapability({ node: image('target'), schema, slashPreset: null })).toBe(
      true,
    );
  });

  it('does not turn ordinary uploaded resources into generators or change their action', () => {
    const resource = image('uploaded', {
      action: 'image_resource',
      uploaded: true,
      url: ['local'],
    });
    expect(focusGeneratorCapability({ node: resource, schema })).toBe(false);
    expect(resource.data.action).toBe('image_resource');
    expect(
      focusGeneratorCapability({
        node: image('explicit', { action: 'image_resource', showGenerator: true }),
        schema,
      }),
    ).toBe(true);
  });

  it('honors exact asset-sourced exception but excludes an in-place compliance certification', () => {
    for (const assetFields of [{ portraitAssetId: 'asset' }, { portraitCompliantExempt: true }]) {
      const node = image('asset', { action: 'image_resource', ...assetFields });
      expect(focusGeneratorCapability({ node, schema })).toBe(true);
      expect(
        focusGeneratorCapability({
          node: { ...node, data: { ...node.data, portraitCertifiedInPlace: true } },
          schema,
        }),
      ).toBe(false);
      expect(
        focusGeneratorCapability({
          node: { ...node, data: { ...node.data, showGenerator: false } },
          schema,
        }),
      ).toBe(false);
    }
  });

  it('requires explicit generator display for IMAGE_EDIT and never enables locked picture editing', () => {
    expect(
      focusGeneratorCapability({ node: image('edit', { action: 'image_edit' }), schema }),
    ).toBe(false);
    expect(
      focusGeneratorCapability({
        node: image('edit', { action: 'image_edit', showGenerator: true }),
        schema,
      }),
    ).toBe(true);
    for (const generatorType of [
      'picture_edit',
      'subtitle_erase',
      'picture-edit',
      'subtitle-erase',
      'enhance',
    ])
      expect(
        focusGeneratorCapability({
          node: image('locked', { generatorType, showGenerator: true }),
          schema,
        }),
      ).toBe(false);
  });
});

describe('client content normalization and draw/move geometry', () => {
  it('normalizes over the rendered content rect and clamps points outside it', () => {
    expect(normalizeFocusPoint({ x: 150, y: 125 }, rect)).toEqual({ x: 0.25, y: 0.75 });
    expect(normalizeFocusPoint({ x: 90, y: 300 }, rect)).toEqual({ x: 0, y: 1 });
    expect(normalizeFocusPoint({ x: 150, y: 125 }, { ...rect, width: 400, height: 200 })).toEqual({
      x: 0.125,
      y: 0.375,
    });
  });

  it('rejects unknown/nonfinite/zero content dimensions instead of guessing node size', () => {
    expect(normalizeFocusPoint({ x: Infinity, y: 10 }, rect)).toBeNull();
    for (const width of [undefined, 0, -1, NaN, Infinity])
      expect(normalizeFocusPoint({ x: 150, y: 75 }, { ...rect, width })).toBeNull();
  });

  it('draws reverse-direction regions and rejects strict .02-axis mouseup thresholds', () => {
    expectRegion(drawFocusRegion({ x: 250, y: 125 }, { x: 150, y: 75 }, rect), {
      relX: 0.25,
      relY: 0.25,
      width: 0.5,
      height: 0.5,
    });
    const simple = { left: 0, top: 0, width: 100, height: 100 };
    expect(drawFocusRegion({ x: 0, y: 0 }, { x: 2, y: 30 }, simple)).toBeNull();
    expect(drawFocusRegion({ x: 0, y: 0 }, { x: 30, y: 2 }, simple)).toBeNull();
    expect(drawFocusRegion({ x: 0, y: 0 }, { x: 3, y: 3 }, simple)).not.toBeNull();
  });

  it('clamps a draw to the actual image content and preserves zero coordinates', () => {
    expect(drawFocusRegion({ x: 0, y: 0 }, { x: 400, y: 200 }, rect)).toEqual({
      relX: 0,
      relY: 0,
      width: 1,
      height: 1,
    });
  });

  it('moves by current content pixel delta, clamps all sides and keeps dimensions/metadata', () => {
    const full = { ...region, nodeId: 'source' };
    const moved = moveFocusRegion(full, { x: 0, y: 0 }, { x: 20, y: 10 }, rect);
    expectRegion(moved, { ...region, relX: 0.3, relY: 0.3 });
    expect(moved.nodeId).toBe('source');
    expectRegion(moveFocusRegion(region, { x: 0, y: 0 }, { x: 1000, y: -1000 }, rect), {
      ...region,
      relX: 0.6,
      relY: 0,
    });
    expect(region).toEqual({ relX: 0.2, relY: 0.2, width: 0.4, height: 0.4 });
  });
});

describe('original focus aspect controls', () => {
  it('keeps the exact seven original labels in source order', () => {
    expect(FOCUS_ASPECTS.map((entry) => entry.label)).toEqual([
      '16:9',
      '3:2',
      '4:3',
      '1:1',
      '3:4',
      '2:3',
      '9:16',
    ]);
    expect(Object.isFrozen(FOCUS_ASPECTS)).toBe(true);
  });

  it('shrinks within the existing region from its top-left using physical output aspect', () => {
    expectRegion(applyFocusAspect(region, '1:1', 2), {
      relX: 0.2,
      relY: 0.2,
      width: 0.2,
      height: 0.4,
    });
    expectRegion(applyFocusAspect(region, '16:9', 1), {
      relX: 0.2,
      relY: 0.2,
      width: 0.4,
      height: 0.225,
    });
    expect(applyFocusAspect(region, 'unknown', 1)).toBeNull();
    expect(applyFocusAspect(region, '1:1', 0)).toBeNull();
  });

  it('chooses nearest physical ratio and preserves first-list precedence on exact ties', () => {
    expect(closestFocusAspect(region, 2)).toBe('16:9');
    expect(closestFocusAspect(region, 0.875)).toBe('1:1');
    expect(closestFocusAspect(region, NaN)).toBeNull();
  });

  it.each(FOCUS_ASPECTS)(
    'keeps $label physical aspect through a ratio button and a corner resize',
    ({ label, ratio }) => {
      const selected = applyFocusAspect(region, label, 1.5);
      expect((selected.width / selected.height) * 1.5).toBeCloseTo(ratio, 12);
      expect(closestFocusAspect(selected, 1.5)).toBe(label);
      const resized = resizeFocusRegion({
        region: selected,
        handle: 'se',
        startClient: { x: 220, y: 110 },
        currentClient: { x: 260, y: 130 },
        contentRect: rect,
        ratioLabel: label,
        containerAspectRatio: 1.5,
      });
      expect((resized.width / resized.height) * 1.5).toBeCloseTo(ratio, 12);
      expect(resized.relX).toBe(selected.relX);
      expect(resized.relY).toBe(selected.relY);
    },
  );
});

describe('eight-direction source focus resize', () => {
  it.each([
    ['n', { x: 140, y: 70 }, { x: 140, y: 60 }, { relX: 0.2, relY: 0.1, width: 0.4, height: 0.5 }],
    [
      's',
      { x: 140, y: 110 },
      { x: 140, y: 120 },
      { relX: 0.2, relY: 0.2, width: 0.4, height: 0.5 },
    ],
    ['w', { x: 140, y: 70 }, { x: 120, y: 70 }, { relX: 0.1, relY: 0.2, width: 0.5, height: 0.4 }],
    ['e', { x: 220, y: 70 }, { x: 240, y: 70 }, { relX: 0.2, relY: 0.2, width: 0.5, height: 0.4 }],
  ])(
    'resizes edge %s freely without applying the selected corner ratio',
    (handle, startClient, currentClient, expected) => {
      expectRegion(
        resizeFocusRegion({
          region,
          handle,
          startClient,
          currentClient,
          contentRect: rect,
          ratioLabel: '9:16',
        }),
        expected,
      );
    },
  );

  it.each([
    ['nw', { x: 140, y: 70 }, { x: 120, y: 60 }, { relX: 0.1, relY: 0.1, width: 0.5, height: 0.5 }],
    ['ne', { x: 220, y: 70 }, { x: 260, y: 60 }, { relX: 0.2, relY: 0.1, width: 0.5, height: 0.5 }],
    [
      'sw',
      { x: 140, y: 110 },
      { x: 120, y: 130 },
      { relX: 0.1, relY: 0.2, width: 0.5, height: 0.5 },
    ],
    [
      'se',
      { x: 220, y: 110 },
      { x: 260, y: 130 },
      { relX: 0.2, relY: 0.2, width: 0.6, height: 0.6 },
    ],
  ])(
    'keeps opposite anchor and current normalized ratio at corner %s',
    (handle, startClient, currentClient, expected) => {
      expectRegion(
        resizeFocusRegion({ region, handle, startClient, currentClient, contentRect: rect }),
        expected,
      );
    },
  );

  it('locks corners to output aspect divided by displayed container aspect and fits boundaries', () => {
    const resized = resizeFocusRegion({
      region,
      handle: 'se',
      startClient: { x: 220, y: 110 },
      currentClient: { x: 400, y: 300 },
      contentRect: rect,
      ratioLabel: '16:9',
      containerAspectRatio: 2,
    });
    expectRegion(resized, { relX: 0.2, relY: 0.2, width: 0.8 * (8 / 9), height: 0.8 });
  });

  it('retains original .02 edge and corner minimum arithmetic', () => {
    const options = {
      region,
      startClient: { x: 220, y: 110 },
      currentClient: { x: 0, y: 0 },
      contentRect: rect,
    };
    expectRegion(resizeFocusRegion({ ...options, handle: 'e' }), { ...region, width: 0.02 });
    expectRegion(resizeFocusRegion({ ...options, handle: 's' }), { ...region, height: 0.02 });
    expectRegion(resizeFocusRegion({ ...options, handle: 'se' }), {
      ...region,
      width: 0.02,
      height: 0.02,
    });
  });

  it('rejects stale/invalid rectangles and unknown handles instead of transforming canvas positions', () => {
    const options = {
      region,
      startClient: { x: 220, y: 110 },
      currentClient: { x: 240, y: 130 },
      contentRect: rect,
    };
    expect(resizeFocusRegion({ ...options, handle: 'unknown' })).toBeNull();
    expect(resizeFocusRegion({ ...options, handle: 'se', ratioLabel: 'unknown' })).toBeNull();
    expect(
      resizeFocusRegion({ ...options, handle: 'e', contentRect: { ...rect, width: 0 } }),
    ).toBeNull();
    expect(
      resizeFocusRegion({ ...options, handle: 'e', region: { ...region, relX: 0.9 } }),
    ).toBeNull();
  });
});

describe('source focus confirmation and removal graph plans', () => {
  const setup = () => {
    const source = image('source', {
      action: 'image_resource',
      url: ['first', 'second'],
      originalUrl: ['original'],
    });
    const target = image('target', {
      params: {
        model: 'model',
        modeType: 'text2image',
        count: 2,
        prompt: 'latest draft',
        settings: { quality: '2K', RaTiOChoice: '3:2' },
        advancedSettings: { seed: 42 },
      },
    });
    return {
      nodes: [source, target],
      edges: [],
      sourceNodeId: 'source',
      targetNodeId: 'target',
      region,
      containerAspectRatio: 2,
      makeEdgeId: () => 'focus-edge',
    };
  };

  it('saves exact region source URL/scene while preserving fresh params, action, graph dimensions and source identity', () => {
    const options = setup();
    const result = planCanvasFocusRegion(options);
    expect(result.edges).toEqual([{ id: 'focus-edge', source: 'source', target: 'target' }]);
    expect(result.nodes[0]).toBe(options.nodes[0]);
    expect(result.nodes[1].position).toBe(options.nodes[1].position);
    expect(result.nodes[1].width).toBe(350);
    expect(result.nodes[1].data.action).toBe('image_generate');
    expect(result.nodes[1].data.params).toEqual({
      ...options.nodes[1].data.params,
      focusRegion: { nodeId: 'source', ...region, imageUrl: 'first' },
      originImage: 'first',
      scene: 'camera_focus',
      settings: { quality: '2K', RaTiOChoice: '16:9' },
    });
    expect(options.nodes[1].data.params).not.toHaveProperty('focusRegion');
    expect(options.edges).toEqual([]);
  });

  it('uses selected output label, first ratio key insertion order and fallback ratio for empty settings', () => {
    const options = setup();
    options.nodes[1].data.params.settings = { ratioFirst: '16:9', RatioSecond: '3:2' };
    const first = planCanvasFocusRegion({ ...options, ratioLabel: '9:16' });
    expect(first.nodes[1].data.params.settings).toEqual({ ratioFirst: '9:16', RatioSecond: '3:2' });
    options.nodes[1].data.params.settings = {};
    expect(
      planCanvasFocusRegion({ ...options, ratioLabel: '1:1' }).nodes[1].data.params.settings,
    ).toEqual({ ratio: '1:1' });
  });

  it('reuses any existing source→target edge without allocating or rewriting its handles/data', () => {
    const options = setup();
    const existing = {
      id: 'existing',
      source: 'source',
      target: 'target',
      targetHandle: 'input',
      data: { assetVirtual: true },
    };
    const makeEdgeId = vi.fn();
    const result = planCanvasFocusRegion({ ...options, edges: [existing], makeEdgeId });
    expect(result.edges[0]).toBe(existing);
    expect(makeEdgeId).not.toHaveBeenCalled();
  });

  it('rejects self focus and inaccessible uploaded resource target without creating an edge or changing action', () => {
    const options = setup();
    const makeEdgeId = vi.fn();
    expect(planCanvasFocusRegion({ ...options, sourceNodeId: 'target', makeEdgeId })).toBeNull();
    options.nodes[1].data.action = 'image_resource';
    options.nodes[1].data.url = ['uploaded-target'];
    expect(planCanvasFocusRegion({ ...options, makeEdgeId })).toBeNull();
    expect(options.nodes[1].data.action).toBe('image_resource');
    expect(makeEdgeId).not.toHaveBeenCalled();
  });

  it('rejects invalid graph/IDs/URL shape/params/settings and unavailable ratio without partial graph mutation', () => {
    const options = setup();
    expect(planCanvasFocusRegion({ ...options, makeEdgeId: () => 'source' })).toBeNull();
    expect(planCanvasFocusRegion({ ...options, makeEdgeId: undefined })).toBeNull();
    expect(planCanvasFocusRegion({ ...options, ratioLabel: 'unknown' })).toBeNull();
    expect(planCanvasFocusRegion({ ...options, containerAspectRatio: 0 })).toBeNull();
    expect(
      planCanvasFocusRegion({ ...options, nodes: [...options.nodes, options.nodes[0]] }),
    ).toBeNull();
    options.nodes[0].data.url = 'url-is-not-an-array';
    expect(planCanvasFocusRegion(options)).toBeNull();
    options.nodes[0].data.url = ['first'];
    options.nodes[1].data.params.settings = [];
    expect(planCanvasFocusRegion(options)).toBeNull();
    options.nodes[1].data.params = 'corrupt';
    expect(planCanvasFocusRegion(options)).toBeNull();
  });

  it('allows source-style .02 resized region while new draw still requires strict > .02', () => {
    const options = setup();
    const result = planCanvasFocusRegion({
      ...options,
      region: { relX: 0, relY: 0, width: 0.02, height: 0.02 },
    });
    expect(result.nodes[1].data.params.focusRegion.width).toBe(0.02);
  });

  it('clears only focus fields and first corresponding edge, retaining unrelated settings, drafts and edges', () => {
    const options = setup();
    const result = planCanvasFocusRegion(options);
    const extra = { id: 'extra', source: 'source', target: 'target', data: { original: true } };
    const reverse = { id: 'reverse', source: 'target', target: 'source' };
    const cleared = deleteCanvasFocusRegion({
      nodes: result.nodes,
      edges: [...result.edges, extra, reverse],
      targetNodeId: 'target',
    });
    expect(cleared.edges).toEqual([extra, reverse]);
    expect(cleared.nodes[0]).toBe(result.nodes[0]);
    expect(cleared.nodes[1].data.params).toEqual({
      ...result.nodes[1].data.params,
      focusRegion: undefined,
      originImage: undefined,
      scene: undefined,
    });
    expect(cleared.nodes[1].data.params.prompt).toBe('latest draft');
    expect(cleared.nodes[1].data.action).toBe('image_generate');
    expect(result.nodes[1].data.params.scene).toBe('camera_focus');
  });

  it('clears missing source region without deleting unrelated edges and returns null when none is stored', () => {
    const options = setup();
    expect(deleteCanvasFocusRegion(options)).toBeNull();
    options.nodes[1].data.params.focusRegion = { ...region, nodeId: 'removed' };
    const edges = [{ id: 'unrelated', source: 'source', target: 'target' }];
    expect(deleteCanvasFocusRegion({ ...options, edges }).edges).toBe(edges);
  });
});
