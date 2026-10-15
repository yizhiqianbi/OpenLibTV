import { describe, expect, it } from 'vitest';
import { createMarketingFrequency } from './marketing-frequency.js';

const options = {
  touch: 'progressHalf',
  uid: 'fixture-user',
  courseUuid: 'fixture-course',
  dailyLimit: 2,
};
describe('course marketing frequency boundary', () => {
  it('stores half/first suppression atomically, survives a new runtime, and applies the daily cap across courses', async () => {
    let value = { version: 1, shown: {}, daily: {} },
      count = 0;
    let date = new Date(2026, 9, 11, 20);
    const boundary = {
      read: () => value,
      write: (next) => {
        value = next;
        count += 1;
      },
      now: () => date,
    };
    const frequency = createMarketingFrequency(boundary);
    expect(await frequency.canShow(options)).toBe(true);
    frequency.markShown(options, { suppress: ['firstClipDone'] });
    expect(count).toBe(1);
    expect(await frequency.canShow({ ...options, touch: 'firstClipDone' })).toBe(false);
    const restarted = createMarketingFrequency(boundary);
    expect(await restarted.canShow(options)).toBe(false);
    restarted.markShown({ ...options, courseUuid: 'second' });
    expect(await restarted.canShow({ ...options, courseUuid: 'third' })).toBe(false);
    date = new Date(2026, 9, 12, 0);
    expect(await restarted.canShow({ ...options, courseUuid: 'third' })).toBe(true);
    expect(await restarted.canShow({ ...options, uid: 'other-user' })).toBe(true);
  });
  it('fails closed on corrupt or unavailable history and preserves in-memory suppression after a quota failure', async () => {
    const broken = createMarketingFrequency({
      read: () => {
        throw new Error('unavailable');
      },
    });
    expect(await broken.canShow(options)).toBe(false);
    const corrupt = createMarketingFrequency({ read: () => ({ version: 7 }) });
    expect(await corrupt.canShow(options)).toBe(false);
    const value = { version: 1, shown: {}, daily: {} };
    const quota = createMarketingFrequency({
      read: () => value,
      write: () => {
        throw new Error('quota');
      },
    });
    expect(() => quota.markShown(options)).toThrow('quota');
    expect(value.shown).toEqual({});
    expect(await quota.canShow(options)).toBe(false);
  });
});
