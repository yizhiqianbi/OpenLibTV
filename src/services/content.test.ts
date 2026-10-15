// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { contentPath, createContentRepository } from './content.ts';

describe('content repository', () => {
  it('supports bundle names and individual record names through one adapter', async () => {
    const read = vi.fn().mockResolvedValue({ detail: { id: 'a' } });
    const repository = createContentRepository({ read, prepareAssets: () => Promise.resolve({}) });
    await expect(repository.load('gallery-details/a')).resolves.toEqual({ detail: { id: 'a' } });
    expect(read).toHaveBeenCalledWith('gallery-details/a', expect.any(AbortSignal));
    expect(contentPath('gallery-details/a')).toBe('/data/gallery-details/a.json');
  });
  it('keeps content failures visible and retryable', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([]);
    const repository = createContentRepository({ read, prepareAssets: () => Promise.resolve({}) });
    await expect(repository.load('activities')).rejects.toThrow('unavailable');
    expect(repository.getSnapshot('activities').error?.message).toBe('unavailable');
    await expect(repository.load('activities')).resolves.toEqual([]);
  });
  it('allows original media URLs to remain usable if the optional local map is missing', async () => {
    const repository = createContentRepository({
      read: () => Promise.resolve({ cover: 'https://media.test/a' }),
      prepareAssets: () => Promise.reject(new Error('missing map')),
    });
    await expect(repository.load('gallery')).resolves.toMatchObject({
      cover: 'https://media.test/a',
    });
  });
  it('rejects invalid logical names before invoking an adapter', async () => {
    const read = vi.fn();
    const repository = createContentRepository({ read, prepareAssets: () => Promise.resolve({}) });
    await expect(repository.load('../secret')).rejects.toThrow('Invalid content name');
    expect(read).not.toHaveBeenCalled();
  });
});
