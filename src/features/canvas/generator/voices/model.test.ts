import { describe, expect, it } from 'vitest';
import sample from './sample.json';
import {
  countVoiceFilters,
  currentVoice,
  emptyVoiceFilters,
  filterSampleVoices,
  removeVoiceFilter,
  validateVoicePage,
  voiceFilterChips,
  voiceRequest,
  voiceSelectionPatch,
} from './model.ts';
import { originalVoiceSource } from './source.ts';

describe('evidenced MiniMax voice model', () => {
  it('writes the schema ID and six metadata fields without private record IDs', () => {
    const voice = { ...sample.voices[0], id: 'private', accent: '普通话', description: 'not sent' };
    const patch = voiceSelectionPatch({ originalField: 'voice_setting_voice_id' }, voice);
    expect(patch.voice_setting_voice_id).toBe('female-shaonv');
    expect(patch._voice_setting_voice_id_meta).toEqual({
      voiceId: 'female-shaonv',
      name: '少女音色',
      language: '中文(普通话)',
      accent: '普通话',
      gender: 'Female',
      voiceUrl: sample.voices[0].voiceUrl,
    });
    expect(currentVoice('another', voice)).toEqual({ voiceId: 'another', name: 'another' });
    expect(currentVoice('female-shaonv', voice)).toBe(voice);
  });
  it('keeps age multi-select count and language/accent dependency', () => {
    const filters = {
      language: '中文',
      accent: '粤语',
      gender: 'Female',
      ageGroup: ['Youth', 'Adult'],
    };
    expect(countVoiceFilters(filters)).toBe(4);
    expect(voiceFilterChips(filters, sample.options)).toHaveLength(5);
    expect(removeVoiceFilter(filters, 'language')).toEqual({
      ...filters,
      language: '',
      accent: '',
    });
    expect(removeVoiceFilter(filters, 'age:Adult').ageGroup).toEqual(['Youth']);
  });
  it('maps only read body fields and only My uses isSystem:false', async () => {
    const calls: unknown[] = [];
    const adapter = {
      list: async (body: unknown) => {
        calls.push(body);
        return { code: 0, data: { list: [], total: 0 } };
      },
      favorites: async (body: unknown) => {
        calls.push(body);
        return { code: 0, data: { list: [], total: 0 } };
      },
    };
    const source = originalVoiceSource(adapter, sample.options);
    await source.list(
      voiceRequest('my', { ...emptyVoiceFilters(), gender: 'Male' }, ' Jin ', 2, 10),
      { signal: new AbortController().signal },
    );
    await source.list(voiceRequest('favorite', emptyVoiceFilters(), '', 1, 20), {
      signal: new AbortController().signal,
    });
    expect(calls).toEqual([
      { page: 2, pageSize: 10, gender: 'Male', query: 'Jin', isSystem: false },
      { page: 1, pageSize: 20 },
    ]);
  });
  it('rejects malformed lists, deduplicates real IDs and matches only evidenced sample labels', () => {
    const voice = sample.voices[0];
    expect(validateVoicePage({ list: [voice, voice], total: 2 }).list).toEqual([voice]);
    expect(() => validateVoicePage({ list: [voice], total: -1 })).toThrow(/格式/);
    expect(
      filterSampleVoices(
        [voice],
        voiceRequest(
          'library',
          { ...emptyVoiceFilters(), language: '中文', accent: '普通话' },
          '',
          1,
          20,
        ),
        sample.options,
      ),
    ).toEqual([voice]);
    expect(
      filterSampleVoices(
        [voice],
        voiceRequest('library', { ...emptyVoiceFilters(), ageGroup: ['Youth'] }, '', 1, 20),
        sample.options,
      ),
    ).toEqual([]);
  });
});
