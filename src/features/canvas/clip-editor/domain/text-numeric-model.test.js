import { describe, expect, it } from 'vitest';
import {
  parseTextNumeric,
  snapTextNumeric,
  settleTextNumeric,
  textNumericAtPointer,
} from './text-numeric-model.js';
describe('source s2/s5 numerical rules', () => {
  it('snaps from the minimum instead of a zero origin and uses step precision', () => {
    expect(snapTextNumeric(20, 8, 400, 5)).toBe(18);
    expect(snapTextNumeric(1.26, 0.5, 5, 0.1)).toBe(1.3);
    expect(textNumericAtPointer(50, { left: 0, width: 200 }, 8, 400, 1)).toBe(106);
    expect(textNumericAtPointer(50, { left: 0, width: 0 }, 8, 400, 1)).toBeNull();
  });
  it('keeps ordinary typed decimals independent of drag step, with optional source snap for special fields', () => {
    expect(settleTextNumeric('20.125', 56, 8, 400, 5)).toBe(20.125);
    expect(settleTextNumeric('20.125', 56, 8, 400, 5, true)).toBe(18);
    expect(settleTextNumeric('999', 56, 8, 400, 1)).toBe(400);
    expect(settleTextNumeric('', 45.125, 8, 400, 1)).toBe(45.125);
    expect(parseTextNumeric(' Infinity ')).toBeNull();
    expect(parseTextNumeric('  ')).toBeNull();
  });
});
