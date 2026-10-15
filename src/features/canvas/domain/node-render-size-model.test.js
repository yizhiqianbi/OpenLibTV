// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canvasNodeSize, canvasWorldNodes } from './groups.js';
import { fitCanvasView, selectIntersectingNodes } from '../geometry.js';

const node = {
  id: 'image',
  type: 'image',
  position: { x: 0, y: 0 },
  width: 622,
  height: 350,
  measured: { width: 622, height: 350 },
  data: { _explicitContentDims: true, contentWidth: 200, contentHeight: 120 },
};
describe('explicit media display dimensions without rewriting source flow fields', () => {
  it.each(['image', 'video'])('uses finite positive explicit content dimensions for %s', (type) => {
    expect(canvasNodeSize({ ...node, type })).toEqual({ width: 200, height: 120 });
  });
  it.each([
    { _explicitContentDims: false },
    { contentWidth: 0 },
    { contentHeight: -1 },
    { contentWidth: Infinity },
    { contentHeight: NaN },
    { contentWidth: '200' },
  ])(
    'keeps existing stored/measured fallback for invalid or disabled content dimensions %j',
    (data) => {
      expect(canvasNodeSize({ ...node, data: { ...node.data, ...data } })).toEqual({
        width: 622,
        height: 350,
      });
    },
  );
  it.each(['text', 'audio', 'group', 'script'])('does not interpret media fields on %s', (type) => {
    expect(canvasNodeSize({ ...node, type })).toEqual({ width: 622, height: 350 });
  });
  it('shares the display box across world projection, fit and box selection without changing the original document', () => {
    const snapshot = structuredClone(node);
    expect(canvasWorldNodes([node])[0]).toMatchObject({ width: 200, height: 120 });
    expect(selectIntersectingNodes([node], { x: 201, y: 0, width: 10, height: 20 })).toEqual([]);
    expect(selectIntersectingNodes([node], { x: 199, y: 0, width: 10, height: 20 })).toEqual([
      'image',
    ]);
    expect(fitCanvasView([node], { width: 400, height: 240 }, [node], { padding: 0 }).z).toBe(2);
    expect(node).toEqual(snapshot);
  });
});
