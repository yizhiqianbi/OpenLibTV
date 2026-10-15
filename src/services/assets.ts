import { fetchJson } from './json.ts';
import { createResourceCache } from './resource-cache.ts';

export type AssetMap = Record<string, string>;
const mappings = createResourceCache<AssetMap>(() => fetchJson<AssetMap>('/data/asset-map.json'));
const key = 'asset-map';

export function asset(url?: string | null): string {
  return (url && mappings.getSnapshot(key).data?.[url]) || url || '';
}

export const ensureAssetMap = (options?: { force?: boolean }) => mappings.load(key, options);
export const getAssetMapSnapshot = () => mappings.getSnapshot(key);
export const subscribeAssetMap = (listener: () => void) => mappings.subscribe(key, listener);
export const invalidateAssetMap = () => mappings.invalidate(key);
