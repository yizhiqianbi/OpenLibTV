// @vitest-environment node
import { gzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { DataLoadError, fetchJson } from './json.ts';

describe('JSON loading', () => {
  it('loads ordinary JSON with a caller signal', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"items":[1]}'));
    await expect(fetchJson('/data/test.json', { fetcher, signal })).resolves.toEqual({
      items: [1],
    });
    expect(fetcher).toHaveBeenCalledWith('/data/test.json', { signal, headers: undefined });
  });
  it('loads gzip bytes with a query string', async () => {
    const bytes = gzipSync(JSON.stringify({ nodes: ['a'] }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes));
    await expect(fetchJson('/data/canvas.json.gz?v=2', { fetcher })).resolves.toEqual({
      nodes: ['a'],
    });
  });
  it('does not decompress an already-decoded gzip response again', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"ok":true}', { headers: { 'Content-Encoding': 'gzip' } }));
    await expect(fetchJson('/data/item.json.gz', { fetcher })).resolves.toEqual({ ok: true });
  });
  it('rejects HTTP errors and invalid JSON with source context', async () => {
    const missing = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('missing', { status: 404 }));
    await expect(fetchJson('/data/missing.json', { fetcher: missing })).rejects.toMatchObject({
      name: 'DataLoadError',
      status: 404,
      url: '/data/missing.json',
    });
    const broken = vi.fn<typeof fetch>().mockResolvedValue(new Response('{'));
    await expect(fetchJson('/data/broken.json', { fetcher: broken })).rejects.toBeInstanceOf(
      DataLoadError,
    );
  });
  it('preserves abort errors instead of reporting an invalid payload', async () => {
    const error = new DOMException('cancelled', 'AbortError');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(fetchJson('/data/item.json', { fetcher })).rejects.toBe(error);
  });
});
