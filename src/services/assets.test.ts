// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asset, ensureAssetMap, getAssetMapSnapshot, invalidateAssetMap } from './assets.ts';

beforeEach(invalidateAssetMap);
afterEach(() => {
  invalidateAssetMap();
  vi.unstubAllGlobals();
});

describe('asset mapping', () => {
  it('resolves local mapped URLs and preserves unmapped URLs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{"https://media.test/a":"/assets/a.webp"}'))),
    );
    expect(asset('https://media.test/a')).toBe('https://media.test/a');
    await ensureAssetMap();
    expect(asset('https://media.test/a')).toBe('/assets/a.webp');
    expect(asset('https://media.test/b')).toBe('https://media.test/b');
    expect(asset(null)).toBe('');
  });
  it('keeps failures observable and permits a subsequent map request', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    await expect(ensureAssetMap()).rejects.toThrow('Network request failed');
    expect(getAssetMapSnapshot().error).not.toBeNull();
    await expect(ensureAssetMap()).resolves.toEqual({});
    expect(getAssetMapSnapshot().error).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
