import { describe, expect, it, vi } from 'vitest';
import { readClipSubtitleVtt } from './clip-subtitle-source.js';
describe('read-only subtitle transport', () => {
  it('passes cancellation, accepts captured VTT and rejects HTML/error responses', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn().mockResolvedValue({ ok: true, text: async () => 'WEBVTT\n\n' });
    expect(await readClipSubtitleVtt('/source.vtt', { signal, fetcher })).toBe('WEBVTT\n\n');
    expect(fetcher).toHaveBeenCalledWith('/source.vtt', { signal });
    fetcher.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(readClipSubtitleVtt('/source.vtt', { fetcher })).rejects.toThrow('503');
    fetcher.mockResolvedValueOnce({ ok: true, text: async () => '<html>SPA fallback</html>' });
    await expect(readClipSubtitleVtt('/source.vtt', { fetcher })).rejects.toThrow('原数据已保留');
  });
});
