import { readStoredValue, writeStoredValue } from '../../../services/storage.ts';

export const practiceUrl = (courseId, practiceNodeUuid) =>
  `/academy/practice/${courseId}${practiceNodeUuid ? `?sectionId=${encodeURIComponent(practiceNodeUuid)}` : ''}`;
export const openPracticeWindow = (courseId, practiceNodeUuid) =>
  window.open(practiceUrl(courseId, practiceNodeUuid), '_blank', 'noopener');

/** Source 29752 remembers the first introduction per user, and once per loaded runtime. */
export function createPracticeIntroMemory({
  read = (key) => readStoredValue(key, false, { strict: true }),
  write = (key) => writeStoredValue(key, true),
} = {}) {
  let shownInRuntime = false;
  const key = (uid) => `libtv-practice-intro:shown:${uid ?? 'anon'}`;
  return {
    async claim(uid) {
      if (shownInRuntime) return { show: false };
      let stored;
      try {
        stored = await read(key(uid));
      } catch {
        // The source treats unavailable history as already shown, allowing entry.
        return { show: false };
      }
      if (stored || shownInRuntime) return { show: false };
      shownInRuntime = true;
      try {
        await write(key(uid));
        return { show: true };
      } catch {
        return { show: true, error: '介绍记录未能保存，下次访问可能再次显示' };
      }
    },
  };
}
export const practiceIntroMemory = createPracticeIntroMemory();
