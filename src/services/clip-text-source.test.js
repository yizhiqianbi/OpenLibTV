import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClipTextHtml } from './clip-text-source.js';
afterEach(() => vi.unstubAllGlobals());
describe('HTML transport requirements', () => {
  it('retains strict composition checks by default but allows subtitle callers to defer parsing to their own reader', async () => {
    const html =
      '<body data-width="320" data-height="180"><p data-start="0" data-duration="1">旧字幕</p></body>';
    const fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => html });
    vi.stubGlobal('fetch', fetch);
    await expect(readClipTextHtml('/source.html')).rejects.toThrow('composition');
    const abort = new AbortController();
    await expect(
      readClipTextHtml('/source.html', { signal: abort.signal, requireComposition: false }),
    ).resolves.toBe(html);
    expect(fetch).toHaveBeenLastCalledWith('/source.html', { signal: abort.signal });
  });
  it('does not bypass HTTP failures for legacy subtitle callers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(readClipTextHtml('/source.html', { requireComposition: false })).rejects.toThrow(
      '503',
    );
  });
});
