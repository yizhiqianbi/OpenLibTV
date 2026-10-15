import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredState, writeStoredValue } from '../../../../services/storage.ts';
import { emptyVoiceFilters, voiceRequest } from './model.ts';
import { sampleVoiceSource } from './source.ts';

const key = 'libtv-voice-favorites';
const request = (tab: 'library' | 'favorite' | 'my') =>
  voiceRequest(tab, emptyVoiceFilters(), '', 1, 20);
const options = () => ({ signal: new AbortController().signal });
afterEach(() => {
  vi.restoreAllMocks();
  writeStoredValue(key, []);
});
describe('honest local voice sample source', () => {
  it('reports one representative voice and only persists actual local favorites', async () => {
    writeStoredValue(key, []);
    expect(await sampleVoiceSource.list(request('library'), options())).toMatchObject({
      total: 1,
      list: [{ voiceId: 'female-shaonv', isFavorited: false }],
    });
    expect(await sampleVoiceSource.list(request('my'), options())).toEqual({ list: [], total: 0 });
    await sampleVoiceSource.setFavorite!('female-shaonv', true, options());
    expect(readStoredState(key, []).value).toEqual(['female-shaonv']);
    expect(await sampleVoiceSource.list(request('favorite'), options())).toMatchObject({
      total: 1,
      list: [{ voiceId: 'female-shaonv', isFavorited: true }],
    });
  });
  it('blocks malformed saved favorites rather than overwriting them with an empty array', async () => {
    writeStoredValue(key, { invalid: true });
    await expect(sampleVoiceSource.list(request('library'), options())).rejects.toThrow(/格式错误/);
    await expect(sampleVoiceSource.setFavorite!('female-shaonv', true, options())).rejects.toThrow(
      /格式错误/,
    );
    expect(readStoredState(key, []).value).toEqual({ invalid: true });
  });
  it('keeps readable favorites after a quota error and permits saving again when storage recovers', async () => {
    writeStoredValue(key, []);
    const storage = window.localStorage;
    const spy = vi.spyOn(Object.getPrototypeOf(storage), 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(
      sampleVoiceSource.setFavorite!('female-shaonv', true, options()),
    ).rejects.toThrow();
    expect(readStoredState(key, [])).toMatchObject({ value: [], error: { code: 'WRITE_FAILED' } });
    expect(await sampleVoiceSource.list(request('library'), options())).toMatchObject({
      total: 1,
      list: [{ isFavorited: false }],
    });
    spy.mockRestore();
    await sampleVoiceSource.setFavorite!('female-shaonv', true, options());
    expect(readStoredState(key, [])).toMatchObject({ value: ['female-shaonv'], error: null });
  });
});
