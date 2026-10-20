import { describe, expect, it } from 'vitest';
import { moveTrackOrder } from './track-order-model.js';

describe('track order movement', () => {
  it('moves a source row onto the drop target in either direction', () => {
    expect(moveTrackOrder([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
    expect(moveTrackOrder([0, 1, 2], 2, 0)).toEqual([2, 0, 1]);
  });

  it('keeps same-row drops immutable and rejects unknown rows', () => {
    expect(moveTrackOrder([0, 1], 1, 1)).toEqual([0, 1]);
    expect(moveTrackOrder([0, 1], 3, 1)).toBeNull();
    expect(moveTrackOrder([0, 1], 0, 4)).toBeNull();
  });
});
