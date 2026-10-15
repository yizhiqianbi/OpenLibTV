import { describe, expect, it } from 'vitest';
import {
  canvasToScreen,
  fitGraphView,
  screenToCanvas,
  selectGraphNodes,
  zoomCanvasView,
} from './graph-geometry.js';
import { fitCanvasView, selectIntersectingNodes } from '../canvas/geometry.js';

describe('shared graph geometry retains Canvas adapters and independent sizing', () => {
  it('fits provided film card sizes without introducing generator node defaults', () => {
    const card = { id: 'film', position: { x: 0, y: 0 }, width: 260, height: 150 };
    const view = fitGraphView([card], { width: 520, height: 300 }, { padding: 0 });
    expect(view).toEqual({ x: 0, y: 0, z: 2 });
    expect(fitGraphView([{ ...card, hidden: true }], { width: 520, height: 300 })).toEqual({
      x: 60,
      y: 10,
      z: 1,
    });
  });
  it('keeps Canvas parent-relative positions and explicit media dimensions in its adapter', () => {
    const parent = {
      id: 'parent',
      type: 'group',
      position: { x: 100, y: 200 },
      width: 500,
      height: 500,
    };
    const child = {
      id: 'image',
      parentId: 'parent',
      type: 'image',
      position: { x: 10, y: 20 },
      width: 350,
      height: 230,
      data: { _explicitContentDims: true, contentWidth: 120, contentHeight: 80 },
    };
    const geometry = { ...child, position: { x: 110, y: 220 }, width: 120, height: 80 };
    expect(
      fitCanvasView([child], { width: 240, height: 160 }, [parent, child], { padding: 0 }),
    ).toEqual(fitGraphView([geometry], { width: 240, height: 160 }, { padding: 0 }));
    const rect = { x: 225, y: 295, width: 2, height: 2 };
    expect(selectIntersectingNodes([parent, child], rect)).toContain('image');
    expect(selectGraphNodes([geometry], rect)).toEqual(['image']);
  });
  it('round trips coordinates and preserves the zoom anchor when reaching maximum zoom', () => {
    const bounds = { left: 33, top: 44 },
      view = { x: -80, y: 20, z: 0.4 };
    const point = { x: 120, y: -40 },
      screen = canvasToScreen(point, bounds, view);
    expect(screenToCanvas({ clientX: screen.x, clientY: screen.y }, bounds, view)).toEqual(point);
    const anchor = { x: 90, y: 70 };
    const next = zoomCanvasView(view, 100, anchor);
    expect(next.z).toBe(8);
    expect((anchor.x - next.x) / next.z).toBe((anchor.x - view.x) / view.z);
    expect((anchor.y - next.y) / next.z).toBe((anchor.y - view.y) / view.z);
  });
});
