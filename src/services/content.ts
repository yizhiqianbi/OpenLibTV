import { api, serverConnected } from './api-client.ts';
import { ensureAssetMap } from './assets.ts';
import { fetchJson } from './json.ts';
import { createResourceCache, type ResourceLoadOptions } from './resource-cache.ts';

export function contentPath(name: string): string {
  const segments = name.split('/');
  if (
    !name ||
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..' || !/^[\w.-]+$/.test(segment),
    )
  ) {
    throw new Error(`Invalid content name: ${name}`);
  }
  return '/data/' + segments.map(encodeURIComponent).join('/') + '.json';
}

export function createContentRepository({
  read = (name: string, signal?: AbortSignal) =>
    serverConnected ? api.content(name, { signal }) : fetchJson(contentPath(name), { signal }),
  prepareAssets = ensureAssetMap,
  ttlMs = 5 * 60_000,
}: {
  read?: (name: string, signal?: AbortSignal) => Promise<unknown>;
  prepareAssets?: () => Promise<unknown>;
  ttlMs?: number;
} = {}) {
  return createResourceCache<unknown>(
    async (name, signal) => {
      contentPath(name);
      const [data] = await Promise.all([
        read(name, signal),
        // Mapping failure retains working original URLs. Its error remains observable through assets.ts.
        prepareAssets().catch(() => undefined),
      ]);
      return data;
    },
    { ttlMs },
  );
}

export const contentRepository = createContentRepository();
export const loadContent = <T = unknown>(name: string, options?: ResourceLoadOptions) =>
  contentRepository.load(name, options) as Promise<T>;
export const invalidateContent = (name?: string) => contentRepository.invalidate(name);
