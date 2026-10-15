import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useAssetLibrary } from './useAssetLibrary.ts';
import { writeStoredValue } from '../services/storage.ts';
import { ASSET_LIBRARY_KEY, emptyAssetLibrary } from '../services/asset-library/model.ts';

beforeEach(() => localStorage.clear());
it('surfaces corrupt legacy data when no canonical library exists', () => {
  localStorage.setItem('libtv-assets', '{not-json');
  const { result } = renderHook(useAssetLibrary);
  expect(result.current.error).toBeTruthy();
  expect(result.current.value.assets).toEqual([]);
  expect(localStorage.getItem('libtv-assets')).toBe('{not-json');
  expect(localStorage.getItem(ASSET_LIBRARY_KEY)).toBeNull();
});
it('uses valid canonical data even if the unrelated old key is damaged', () => {
  localStorage.setItem('libtv-assets', '{not-json');
  writeStoredValue(ASSET_LIBRARY_KEY, emptyAssetLibrary, { version: 1 });
  const { result } = renderHook(useAssetLibrary);
  expect(result.current.error).toBeNull();
});
it('observes legacy and canonical changes in every mounted consumer', () => {
  const first = renderHook(useAssetLibrary);
  const second = renderHook(useAssetLibrary);
  act(() =>
    writeStoredValue('libtv-assets', [
      { id: 'old', name: '旧素材', type: 'image/png', url: 'data:image/png;base64,AA==' },
    ]),
  );
  expect(first.result.current.value.assets[0].name).toBe('旧素材');
  act(() => first.result.current.setValue((state) => ({ ...state, tags: ['共享更新'] })));
  expect(second.result.current.value.tags).toEqual(['共享更新']);
  expect(first.result.current.value.assets).toHaveLength(1);
});
