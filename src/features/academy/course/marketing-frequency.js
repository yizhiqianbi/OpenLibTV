import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';
import { marketingDateKey } from './marketing-model.js';

const KEY = 'libtv-course-marketing';
const empty = () => ({ version: 1, shown: {}, daily: {} });
const touchKey = ({ touch, uid, courseUuid }) => JSON.stringify([touch, uid, courseUuid]);
const dailyKey = (uid, date) => JSON.stringify([uid, marketingDateKey(date)]);

/** Original namespace's per-touch and daily limits, atomically stored locally. Reads fail closed. */
export function createMarketingFrequency({
  read = () => readStoredValue(KEY, empty(), { strict: true }),
  write = (value) => writeStoredValue(KEY, value),
  now = () => new Date(),
} = {}) {
  const shown = new Set();
  const daily = new Map();
  const load = () => {
    const value = read();
    if (value?.version !== 1 || !value.shown || !value.daily)
      throw new Error('Invalid course marketing frequency');
    return value;
  };
  return {
    async canShow(options) {
      const key = touchKey(options),
        day = dailyKey(options.uid, now());
      if (shown.has(key)) return false;
      try {
        const data = load(),
          stored = data.daily[day];
        const count = typeof stored === 'number' ? stored : stored ? options.dailyLimit : 0;
        return !data.shown[key] && Math.max(count, daily.get(day) || 0) < options.dailyLimit;
      } catch {
        return false;
      }
    },
    markShown(options, { suppress = [] } = {}) {
      const day = dailyKey(options.uid, now()),
        keys = [touchKey(options), ...suppress.map((touch) => touchKey({ ...options, touch }))];
      // Session memory still limits repetition if persistent storage becomes unavailable.
      keys.forEach((key) => shown.add(key));
      daily.set(day, (daily.get(day) || 0) + 1);
      const data = load();
      write({
        version: 1,
        shown: { ...data.shown, ...Object.fromEntries(keys.map((key) => [key, true])) },
        daily: { ...data.daily, [day]: (Number(data.daily[day]) || 0) + 1 },
      });
    },
  };
}
export const courseMarketingFrequency = createMarketingFrequency();
