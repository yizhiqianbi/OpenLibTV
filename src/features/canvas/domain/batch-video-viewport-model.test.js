import { describe, expect, it } from 'vitest';
import { canvasBatchVideoFocusView } from './batch-video-viewport-model.js';

const group = { id: 'g', type: 'group', position: { x: 100, y: 200 } };
const container = { width: 1000, height: 700 };
const image = (extra = {}) => ({
  id: 'i',
  type: 'image',
  parentId: 'g',
  position: { x: 40, y: 70 },
  width: 400,
  height: 200,
  ...extra,
});
describe('batch video source focus viewport', () => {
  it('reserves source top/bottom/header height and caps zoom at 1.2', () => {
    expect(canvasBatchVideoFocusView({ nodes: [group, image()], groupId: 'g', container })).toEqual(
      { x: 92, y: -104, z: 1.2 },
    );
  });
  it('uses actual measured direct-image boxes, excludes other children and computes their union', () => {
    const result = canvasBatchVideoFocusView({
      nodes: [
        group,
        image({ measured: { width: 1000, height: 800 } }),
        image({ id: 'other', type: 'text', position: { x: -10000, y: -10000 } }),
      ],
      groupId: 'g',
      container,
    });
    expect(result.z).toBe(448 / 800);
    expect(result.x).toBeCloseTo(500 - 640 * result.z);
    expect(result.y).toBeCloseTo(340 - 670 * result.z);
  });
  it('uses source group 500×300 fallback when child dimensions are absent', () => {
    expect(
      canvasBatchVideoFocusView({
        nodes: [group, image({ width: undefined, height: undefined })],
        groupId: 'g',
        container,
      }),
    ).toEqual({ x: 80, y: -80, z: 1.2 });
  });
  it('adapts nested groups using world coordinates once', () => {
    const parent = { id: 'parent', type: 'group', position: { x: 300, y: 400 } };
    expect(
      canvasBatchVideoFocusView({
        nodes: [parent, { ...group, parentId: 'parent' }, image()],
        groupId: 'g',
        container,
      }),
    ).toEqual({ x: -268, y: -584, z: 1.2 });
  });
  it('uses source fallback zoom for tiny viewport and rejects invalid target bounds', () => {
    expect(
      canvasBatchVideoFocusView({
        nodes: [group, image()],
        groupId: 'g',
        container: { width: 120, height: 200 },
      }).z,
    ).toBe(1.2);
    expect(canvasBatchVideoFocusView({ nodes: [], groupId: 'g', container })).toBeNull();
    expect(
      canvasBatchVideoFocusView({ nodes: [{ ...group, width: NaN }], groupId: 'g', container }),
    ).toBeNull();
    expect(
      canvasBatchVideoFocusView({
        nodes: [group],
        groupId: 'g',
        container: { width: Infinity, height: 700 },
      }),
    ).toBeNull();
  });
});
