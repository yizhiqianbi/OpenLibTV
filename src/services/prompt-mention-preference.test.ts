import { describe, expect, it, vi } from 'vitest';
import { createPromptMentionPreferences, PROMPT_MENTION_KEY } from './prompt-mention-preference.ts';
import { createStorageRepository } from './storage.ts';

function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  const repository = createStorageRepository({ getStorage: () => storage });
  return { data, storage, preferences: createPromptMentionPreferences(repository) };
}
describe('AutoLink browser preference', () => {
  it('defaults on, stores exact raw 1/0 strings and notifies all active prompts', () => {
    const { data, preferences } = fixture();
    const listener = vi.fn();
    const stop = preferences.subscribe(listener);
    expect(preferences.enabled(preferences.getSnapshot())).toBe(true);
    expect(preferences.setEnabled(false)).toBe(true);
    expect(data.get(PROMPT_MENTION_KEY)).toBe('0');
    expect(preferences.enabled(preferences.getSnapshot())).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(preferences.setEnabled(true)).toBe(true);
    expect(data.get(PROMPT_MENTION_KEY)).toBe('1');
    stop();
  });
  it('reports a failed preference write while preserving the last stored setting', () => {
    const { data, storage, preferences } = fixture();
    preferences.setEnabled(true);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(preferences.setEnabled(false)).toBe(false);
    expect(preferences.enabled(preferences.getSnapshot())).toBe(true);
    expect(preferences.getSnapshot().error?.code).toBe('WRITE_FAILED');
    expect(data.get(PROMPT_MENTION_KEY)).toBe('1');
  });
  it('shows caret and batch tips once independently, including a storage-denied session', () => {
    const { storage, preferences } = fixture();
    expect(preferences.claimTip('caret')).toBe(true);
    expect(preferences.claimTip('caret')).toBe(false);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(preferences.claimTip('batch')).toBe(true);
    expect(preferences.claimTip('batch')).toBe(false);
  });
});
