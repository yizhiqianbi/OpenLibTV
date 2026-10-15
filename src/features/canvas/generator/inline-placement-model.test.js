import { describe, expect, it } from 'vitest';
import {
  inlineGeneratorCenter,
  inlineGeneratorWidth,
  resolveInlineGeneratorVerticalPlacement as resolve,
} from './inline-placement-model.js';

describe('shared inline generator horizontal geometry', () => {
  it('keeps the 660px maximum and two 20px board insets, including fractional widths', () => {
    expect(inlineGeneratorWidth(1280)).toBe(660);
    expect(inlineGeneratorWidth(700)).toBe(660);
    expect(inlineGeneratorWidth(390)).toBe(350);
    expect(inlineGeneratorWidth(390.25)).toBe(350.25);
    expect(inlineGeneratorWidth(40)).toBe(0);
    expect(inlineGeneratorWidth(30)).toBe(0);
  });

  it('keeps unknown or invalid board widths unmeasured instead of coercing them', () => {
    for (const width of [undefined, null, 0, -1, NaN, Infinity, '888'])
      expect(inlineGeneratorWidth(width)).toBeUndefined();
  });

  it('preserves a valid fractional center exactly rather than projecting it back', () => {
    const center = 565.123456789;
    expect(inlineGeneratorCenter(center, { x: 12.34, z: 0.9 }, 1280)).toBe(center);
    expect(inlineGeneratorCenter(350, { x: 0, z: 1 }, 888)).toBe(350);
    expect(inlineGeneratorCenter(538, { x: 0, z: 1 }, 888)).toBe(538);
  });

  it('clamps both horizontal edges in screen pixels through pan and zoom', () => {
    const view = Object.freeze({ x: -100, z: 0.5 });
    expect(inlineGeneratorCenter(-800, view, 888)).toBe(900);
    expect(inlineGeneratorCenter(2000, view, 888)).toBe(1276);
    expect(view).toEqual({ x: -100, z: 0.5 });
  });

  it('returns the board midpoint when even the two insets cannot fit', () => {
    expect(inlineGeneratorCenter(705, { x: 0, z: 1 }, 30)).toBe(15);
    expect(inlineGeneratorCenter(705, { x: -100, z: 0.5 }, 30)).toBe(230);
  });

  it('preserves the input center until a valid board and view can be measured', () => {
    for (const width of [undefined, null, 0, -1, NaN, Infinity])
      expect(inlineGeneratorCenter(565, { x: -500, z: 0.25 }, width)).toBe(565);
    for (const view of [null, { x: NaN, z: 1 }, { x: 0, z: 0 }, { x: 0, z: Infinity }])
      expect(inlineGeneratorCenter(565, view, 888)).toBe(565);
    expect(inlineGeneratorCenter(Infinity, { x: 0, z: 1 }, 888)).toBe(Infinity);
    expect(inlineGeneratorCenter(NaN, { x: 0, z: 1 }, 888)).toBeNaN();
  });
});

const initial = { nodeTop: 335, nodeBottom: 565, panelHeight: 221, viewportBottom: 610 };

describe('inline generator vertical screen placement', () => {
  it('moves the observed clipped initial card above its node without moving the viewport', () => {
    expect(resolve(initial)).toEqual({ top: 98, side: 'above', scrollable: false });
    expect(98 + initial.panelHeight).toBe(initial.nodeTop - 16);
  });

  it('keeps the exact original below formula when both sides can contain the card', () => {
    const geometry = {
      nodeTop: 335.123456789,
      nodeBottom: 565.987654321,
      panelHeight: 221,
      viewportBottom: 1000,
      gap: 16.25,
    };
    expect(resolve(geometry)).toEqual({
      top: geometry.nodeBottom + geometry.gap,
      side: 'below',
      scrollable: false,
    });
  });

  it('accepts an exact below fit before considering the larger above space', () => {
    expect(resolve({ ...initial, viewportBottom: 802 })).toEqual({
      top: 581,
      side: 'below',
      scrollable: false,
    });
    expect(resolve({ ...initial, viewportBottom: 801.5 })).toEqual({
      top: 98,
      side: 'above',
      scrollable: false,
    });
  });

  it('accepts an exact above fit and constrains the same side once natural content grows', () => {
    expect(resolve({ ...initial, panelHeight: 299 })).toEqual({
      top: 20,
      side: 'above',
      scrollable: false,
    });
    expect(resolve({ ...initial, panelHeight: 299.5 })).toEqual({
      top: 20,
      side: 'above',
      maxHeight: 299,
      scrollable: true,
    });
  });

  it.each([
    ['below', { nodeTop: 180, nodeBottom: 260 }, 276, 334],
    ['above', { nodeTop: 420, nodeBottom: 500 }, 20, 384],
  ])(
    'puts long content on the larger %s side and makes the whole card scrollable',
    (side, node, top, maxHeight) => {
      expect(resolve({ ...initial, ...node, panelHeight: 1200 })).toEqual({
        top,
        side,
        maxHeight,
        scrollable: true,
      });
    },
  );

  it('uses below for equal constrained spaces to preserve the preferred direction', () => {
    expect(
      resolve({ nodeTop: 250, nodeBottom: 350, panelHeight: 500, viewportBottom: 580 }),
    ).toEqual({
      top: 366,
      side: 'below',
      maxHeight: 214,
      scrollable: true,
    });
  });

  it('allows constrained space exactly at the configured minimum', () => {
    expect(
      resolve({ nodeTop: 50, nodeBottom: 500, panelHeight: 100, viewportBottom: 596 }),
    ).toEqual({
      top: 516,
      side: 'below',
      maxHeight: 80,
      scrollable: true,
    });
    expect(
      resolve({ nodeTop: 116, nodeBottom: 500, panelHeight: 100, viewportBottom: 550 }),
    ).toEqual({
      top: 20,
      side: 'above',
      maxHeight: 80,
      scrollable: true,
    });
  });

  it('explicitly docks when neither side reaches the minimum instead of silently overlapping below', () => {
    expect(
      resolve({ nodeTop: 115.5, nodeBottom: 500, panelHeight: 100, viewportBottom: 595.5 }),
    ).toEqual({
      top: 20,
      side: 'docked',
      maxHeight: 575.5,
      scrollable: true,
    });
  });

  it('does not reject a fully fitting small card just because it is shorter than the minimum', () => {
    expect(resolve({ nodeTop: 21, nodeBottom: 50, panelHeight: 20, viewportBottom: 90 })).toEqual({
      top: 66,
      side: 'below',
      scrollable: false,
    });
  });

  it('docks to the entire actual viewport height even when it is smaller than the minimum', () => {
    expect(resolve({ nodeTop: 22, nodeBottom: 39, panelHeight: 221, viewportBottom: 40 })).toEqual({
      top: 20,
      side: 'docked',
      maxHeight: 20,
      scrollable: true,
    });
    expect(resolve({ nodeTop: 20, nodeBottom: 20, panelHeight: 1, viewportBottom: 20.5 })).toEqual({
      top: 20,
      side: 'docked',
      maxHeight: 0.5,
      scrollable: true,
    });
  });

  it('lets the caller customize the minimum without changing the available side geometry', () => {
    const geometry = { nodeTop: 40, nodeBottom: 500, panelHeight: 221, viewportBottom: 550 };
    expect(resolve(geometry).side).toBe('docked');
    expect(resolve({ ...geometry, minimumHeight: 30 })).toEqual({
      top: 516,
      side: 'below',
      maxHeight: 34,
      scrollable: true,
    });
  });

  it.each([
    ['partly above', -80, 60, 'below', 76],
    ['fully above', -300, -50, 'below', 20],
    ['partly below', 550, 850, 'above', 313],
    ['fully below', 800, 1000, 'above', 389],
  ])(
    'clips the usable side to the board for a node %s',
    (_label, nodeTop, nodeBottom, side, top) => {
      expect(resolve({ ...initial, nodeTop, nodeBottom })).toEqual({
        top,
        side,
        scrollable: false,
      });
    },
  );

  it.each([
    ['above', -300, -50, 'below'],
    ['below', 800, 1000, 'above'],
  ])(
    'makes the whole board usable for a long card when the node is wholly %s',
    (_label, nodeTop, nodeBottom, side) => {
      expect(resolve({ ...initial, nodeTop, nodeBottom, panelHeight: 1200 })).toEqual({
        top: 20,
        side,
        maxHeight: 590,
        scrollable: true,
      });
    },
  );

  it('uses docked placement when the node spans the entire board', () => {
    expect(resolve({ ...initial, nodeTop: -100, nodeBottom: 800 })).toEqual({
      top: 20,
      side: 'docked',
      maxHeight: 590,
      scrollable: true,
    });
  });

  it('uses custom board insets rather than assuming window coordinates', () => {
    expect(
      resolve({
        nodeTop: 10,
        nodeBottom: 30,
        panelHeight: 100,
        viewportTop: 100,
        viewportBottom: 400,
      }),
    ).toEqual({
      top: 100,
      side: 'below',
      scrollable: false,
    });
    expect(
      resolve({
        nodeTop: 250,
        nodeBottom: 500,
        panelHeight: 100,
        viewportTop: 100,
        viewportBottom: 400,
      }),
    ).toEqual({
      top: 134,
      side: 'above',
      scrollable: false,
    });
  });

  it('accepts a zero-height node and a zero gap without using truthy defaults', () => {
    expect(
      resolve({
        nodeTop: 0,
        nodeBottom: 0,
        panelHeight: 100,
        viewportTop: 0,
        viewportBottom: 100,
        gap: 0,
      }),
    ).toEqual({
      top: 0,
      side: 'below',
      scrollable: false,
    });
  });

  it.each([
    [0.5, -80, 46, 38],
    [2, -200, 256, 272],
  ])(
    'keeps ordinary 16px and Script 16-world-unit gaps distinct at zoom %s',
    (zoom, panY, ordinaryTop, scriptTop) => {
      // Hosts convert world node geometry once; this model receives only screen pixels.
      const geometry = {
        nodeTop: panY + 100 * zoom,
        nodeBottom: panY + 220 * zoom,
        panelHeight: 100,
        viewportBottom: 900,
      };
      expect(resolve(geometry)).toEqual({ top: ordinaryTop, side: 'below', scrollable: false });
      expect(resolve({ ...geometry, gap: 16 * zoom })).toEqual({
        top: scriptTop,
        side: 'below',
        scrollable: false,
      });
    },
  );

  it('accepts final world geometry for a grouped node without applying its parent offset again', () => {
    const screen = (worldY) => -100 + worldY * 0.5;
    const geometry = {
      nodeTop: screen(600 + 100),
      nodeBottom: screen(600 + 100 + 230),
      panelHeight: 221,
      viewportBottom: 610,
    };
    expect(resolve(geometry)).toEqual({ top: 381, side: 'below', scrollable: false });
  });

  it('does not mutate frozen input or carry placement from one node into the next', () => {
    const geometry = Object.freeze({ ...initial });
    expect(resolve(geometry)).toEqual({ top: 98, side: 'above', scrollable: false });
    const later = resolve({ ...geometry, nodeTop: 80, nodeBottom: 200 });
    expect(later).toEqual({ top: 216, side: 'below', scrollable: false });
    expect(geometry).toEqual(initial);
    expect(resolve(geometry)).toEqual({ top: 98, side: 'above', scrollable: false });
  });

  it('keeps every non-docked card visible and separate from its owner over varied board geometry', () => {
    for (const [nodeTop, nodeBottom] of [
      [-300, -50],
      [-80, 60],
      [20, 250],
      [335, 565],
      [550, 850],
      [800, 1000],
    ]) {
      for (const panelHeight of [20, 221, 1200]) {
        for (const gap of [0, 8, 16, 32]) {
          const result = resolve({ nodeTop, nodeBottom, panelHeight, viewportBottom: 610, gap });
          const visibleHeight = result.maxHeight ?? panelHeight;
          expect(result.top).toBeGreaterThanOrEqual(20);
          expect(result.top + visibleHeight).toBeLessThanOrEqual(610);
          expect(visibleHeight).toBeGreaterThan(0);
          if (result.side === 'below') expect(result.top).toBeGreaterThanOrEqual(nodeBottom + gap);
          if (result.side === 'above')
            expect(result.top + visibleHeight).toBeLessThanOrEqual(nodeTop - gap);
          if (result.side !== 'docked' && result.scrollable)
            expect(visibleHeight).toBeLessThan(panelHeight);
        }
      }
    }
  });

  it.each([
    ['unknown node top', { nodeTop: undefined }],
    ['unknown node bottom', { nodeBottom: undefined }],
    ['unknown natural height', { panelHeight: undefined }],
    ['unknown board height', { viewportBottom: undefined }],
    ['null node coordinate', { nodeTop: null }],
    ['numeric string', { panelHeight: '221' }],
    ['NaN coordinate', { nodeBottom: NaN }],
    ['infinite natural height', { panelHeight: Infinity }],
    ['infinite board height', { viewportBottom: Infinity }],
    ['invalid inset', { viewportTop: NaN }],
    ['invalid gap', { gap: Infinity }],
    ['invalid minimum', { minimumHeight: null }],
    ['zero natural height', { panelHeight: 0 }],
    ['negative natural height', { panelHeight: -1 }],
    ['inverted node', { nodeTop: 600 }],
    ['zero board height', { viewportBottom: 20 }],
    ['inverted board', { viewportBottom: 19 }],
    ['negative gap', { gap: -1 }],
    ['zero minimum', { minimumHeight: 0 }],
    ['negative minimum', { minimumHeight: -1 }],
    ['overflowed below coordinate', { nodeTop: 1e308, nodeBottom: 1e308, gap: 1e308 }],
    ['overflowed above coordinate', { nodeTop: -1e308, nodeBottom: -1e308, gap: 1e308 }],
    ['overflowed board range', { viewportTop: -1e308, viewportBottom: 1e308 }],
  ])(
    'returns null for %s instead of inventing a placement from unmeasured geometry',
    (_label, patch) => {
      expect(resolve({ ...initial, ...patch })).toBeNull();
    },
  );

  it.each([undefined, null, false, 5, 'geometry', [], {}])(
    'returns null for absent or non-object input %s',
    (options) => {
      expect(resolve(options)).toBeNull();
    },
  );
});
