import { describe, expect, it } from 'vitest';
import { fitGraphView } from './graph-geometry.js';

describe('source pending node focus limits are separate from normal canvas zoom', () => {
  const bounds = { width: 1280, height: 670 };
  const item = (width, height) => [{ position: { x: 100, y: 80 }, width, height }];
  const focus = { padding: 0.2, minZoom: 0.6, maxZoom: 1 };
  it('uses the actual viewport-fraction padding and source upper zoom cap', () => {
    expect(fitGraphView(item(100, 100), bounds, focus).z).toBe(1);
    const value = fitGraphView(item(712, 712), bounds, focus);
    const padY = Math.floor((670 - 670 / 1.2) / 2);
    expect(value.z).toBe((670 - 2 * padY) / 712);
    expect(value.y + 80 * value.z).toBeCloseTo(55);
  });
  it('keeps the source focus minimum without changing ordinary fit behavior', () => {
    expect(fitGraphView(item(6000, 6000), bounds, focus).z).toBe(0.6);
    expect(fitGraphView(item(100, 100), bounds).z).toBeGreaterThan(1);
    expect(fitGraphView(item(6000, 6000), bounds).z).toBeLessThan(0.6);
  });
});
