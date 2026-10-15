// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createResourceCache } from './resource-cache.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('resource cache', () => {
  it('shares in-flight reads and exposes loading to subscribers', async () => {
    const pending = deferred<number>();
    const loader = vi.fn(() => pending.promise);
    const cache = createResourceCache(loader);
    const listener = vi.fn();
    const unsubscribe = cache.subscribe('item', listener);
    const first = cache.load('item');
    expect(cache.load('item')).toBe(first);
    expect(cache.getSnapshot('item').loading).toBe(true);
    pending.resolve(42);
    await expect(first).resolves.toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.getSnapshot('item')).toMatchObject({ data: 42, status: 'success', error: null });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('does not permanently cache failure and retains last good data during retry', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(2);
    const cache = createResourceCache<number>(loader);
    await cache.load('item');
    await expect(cache.load('item', { force: true })).rejects.toThrow('offline');
    expect(cache.getSnapshot('item')).toMatchObject({ data: 1, status: 'error', loading: false });
    await expect(cache.load('item')).resolves.toBe(2);
    expect(cache.getSnapshot('item').error).toBeNull();
  });

  it('expires successful reads and supports explicit invalidation', async () => {
    let now = 100;
    const loader = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);
    const cache = createResourceCache<number>(loader, { ttlMs: 10, now: () => now });
    await cache.load('item');
    now = 105;
    await expect(cache.load('item')).resolves.toBe(1);
    now = 110;
    await expect(cache.load('item')).resolves.toBe(2);
    cache.invalidate('item');
    expect(cache.getSnapshot('item').status).toBe('idle');
    await expect(cache.load('item')).resolves.toBe(3);
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('does not let an invalidated older response replace a newer response', async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const cache = createResourceCache<string>(loader);
    const first = cache.load('item');
    await Promise.resolve();
    cache.invalidate('item');
    const second = cache.load('item');
    fresh.resolve('new');
    await second;
    old.resolve('old');
    await first;
    expect(cache.getSnapshot('item').data).toBe('new');
    expect(loader.mock.calls[0][1].aborted).toBe(true);
  });

  it('caches valid null and isolates resources', async () => {
    const loader = vi.fn((key: string) => Promise.resolve(key === 'a' ? null : 2));
    const cache = createResourceCache(loader);
    await cache.load('a');
    await cache.load('b');
    await expect(cache.load('a')).resolves.toBeNull();
    cache.invalidate('b');
    expect(cache.getSnapshot('a').status).toBe('success');
    expect(cache.getSnapshot('b').status).toBe('idle');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
