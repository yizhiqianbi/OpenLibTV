import { readStoredState, writeStoredValue } from '../../../../services/storage.ts';
import sample from './sample.json';
import {
  filterSampleVoices,
  type VoiceFilterOptions,
  type VoicePage,
  type VoiceRecord,
  type VoiceRequest,
} from './model.ts';

export interface VoiceSource {
  list(request: VoiceRequest, options: { signal: AbortSignal }): Promise<VoicePage>;
  options?: VoiceFilterOptions;
  /** Absent for a read-only operator source. No original-account requests are made here. */
  setFavorite?(voiceId: string, next: boolean, options: { signal: AbortSignal }): Promise<void>;
  mode?: 'sample-local' | 'operator';
}
export interface OriginalVoiceReadResponse {
  code: number;
  msg?: string | null;
  data?: VoicePage | null;
}
export interface OriginalVoiceReadAdapter {
  list(
    body: Omit<VoiceRequest, 'tab'>,
    options: { signal: AbortSignal },
  ): Promise<OriginalVoiceReadResponse>;
  favorites(
    body: Omit<VoiceRequest, 'tab'>,
    options: { signal: AbortSignal },
  ): Promise<OriginalVoiceReadResponse>;
}
/** The operator supplies authorized reads. This maps the evidenced body without credentials or endpoint writes. */
export function originalVoiceSource(
  adapter: OriginalVoiceReadAdapter,
  options: VoiceFilterOptions,
): VoiceSource {
  return {
    mode: 'operator',
    options,
    async list({ tab, ...body }, requestOptions) {
      const response = await (tab === 'favorite'
        ? adapter.favorites(body, requestOptions)
        : adapter.list(body, requestOptions));
      if (response.code !== 0 || !response.data)
        throw new Error(response.msg || '音色列表读取失败');
      return response.data;
    },
  };
}
const favoriteKey = 'libtv-voice-favorites';
const favoriteIds = () => {
  const { value, error } = readStoredState<unknown>(favoriteKey, []);
  if (error && error.code !== 'WRITE_FAILED' && error.code !== 'REMOVE_FAILED') throw error;
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string'))
    throw new Error('本机音色收藏数据格式错误');
  return value as string[];
};
export const sampleVoiceSource: VoiceSource = {
  mode: 'sample-local',
  options: sample.options,
  async list(request, { signal }) {
    signal.throwIfAborted();
    const favorites = favoriteIds();
    const voices: VoiceRecord[] = sample.voices.map((v) => ({
      ...v,
      isSystem: true,
      isFavorited: favorites.includes(v.voiceId),
    }));
    const eligible =
      request.tab === 'my'
        ? []
        : request.tab === 'favorite'
          ? voices.filter((v) => v.isFavorited)
          : voices;
    const filtered = filterSampleVoices(eligible, request, sample.options);
    return {
      total: filtered.length,
      list: filtered.slice((request.page - 1) * request.pageSize, request.page * request.pageSize),
    };
  },
  async setFavorite(voiceId, next, { signal }) {
    signal.throwIfAborted();
    const current = favoriteIds();
    writeStoredValue(
      favoriteKey,
      next ? [...new Set([...current, voiceId])] : current.filter((id) => id !== voiceId),
    );
  },
};
