import { useMemo } from 'react';
import { useStoredState } from './useLocalState.ts';
import { storageRepository } from '../services/storage.ts';
import {
  ASSET_LIBRARY_KEY,
  emptyAssetLibrary,
  normalizeAssetLibrary,
  type AssetLibrary,
} from '../services/asset-library/model.ts';

/** One write commits media, folders and tags together; all consumers share the same subscription. */
export function useAssetLibrary() {
  const legacyState = useStoredState<unknown>('libtv-assets', []);
  const legacy = useMemo(() => {
    try {
      return { value: normalizeAssetLibrary(legacyState.value), error: legacyState.error };
    } catch (error) {
      return {
        value: emptyAssetLibrary,
        error: error instanceof Error ? error : new Error('旧资产库读取失败'),
      };
    }
  }, [legacyState.value, legacyState.error]);
  const stored = useStoredState<AssetLibrary>(ASSET_LIBRARY_KEY, legacy.value, {
    version: 1,
    migrate: normalizeAssetLibrary,
  });
  const hasCanonical = storageRepository.getSnapshot(ASSET_LIBRARY_KEY).raw !== null;
  const normalized = useMemo(() => {
    try {
      return {
        value: normalizeAssetLibrary(hasCanonical ? stored.value : legacy.value),
        error: null,
      };
    } catch (error) {
      return {
        value: emptyAssetLibrary,
        error: error instanceof Error ? error : new Error('资产库加载失败'),
      };
    }
  }, [stored.value, legacy.value, hasCanonical]);
  return {
    ...stored,
    ...normalized,
    error: stored.error || normalized.error || (!hasCanonical ? legacy.error : null),
  };
}
