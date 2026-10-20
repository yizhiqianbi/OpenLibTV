import { describe, expect, it } from 'vitest';
import { normalizePreviewLayout, previewLayoutFromDrag } from './preview-geometry-model.js';

describe('preview geometry layout model', () => {
  it('normalizes source layout fields to the same bounds as the inspector', () => {
    expect(normalizePreviewLayout({ xPct: -4, yPct: 120, widthPct: 1, scalePct: 999 })).toEqual({
      xPct: 0,
      yPct: 100,
      widthPct: 8,
      scalePct: 400,
    });
  });

  it('moves the cue center in output percentages', () => {
    expect(
      previewLayoutFromDrag({
        start: { xPct: 50, yPct: 80, widthPct: 60, scalePct: 100 },
        kind: 'move',
        deltaX: 96,
        deltaY: -54,
        stageWidth: 1920,
        stageHeight: 1080,
      }),
    ).toMatchObject({ xPct: 55, yPct: 75 });
  });

  it('changes width around the cue center and scales from the measured cue width', () => {
    expect(
      previewLayoutFromDrag({
        start: { xPct: 50, yPct: 80, widthPct: 40, scalePct: 100 },
        kind: 'width',
        deltaX: 96,
        stageWidth: 1920,
        stageHeight: 1080,
      }).widthPct,
    ).toBe(50);
    expect(
      previewLayoutFromDrag({
        start: { xPct: 50, yPct: 80, widthPct: 40, scalePct: 100 },
        kind: 'scale',
        deltaX: 40,
        cueWidth: 400,
        stageWidth: 1920,
        stageHeight: 1080,
      }).scalePct,
    ).toBe(110);
  });
});
