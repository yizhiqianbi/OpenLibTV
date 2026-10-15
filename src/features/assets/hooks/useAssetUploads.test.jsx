import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAssetUploads } from './useAssetUploads.js';

let readers;
class Reader {
  constructor() {
    readers.push(this);
  }
  abort = vi.fn();
  readAsDataURL = vi.fn();
  complete(value) {
    this.result = value;
    this.onload();
  }
}
beforeEach(() => {
  readers = [];
  vi.stubGlobal('FileReader', Reader);
});
afterEach(() => vi.unstubAllGlobals());
const file = () => new File(['image'], '角色.png', { type: 'image/png' });
it('cancels removed and unmounted reads, ignoring late callbacks', () => {
  const { result, unmount } = renderHook(useAssetUploads);
  act(() => result.current.addFiles([file()]));
  const id = result.current.files[0].id;
  act(() => result.current.removeFile(id));
  act(() => readers[0].complete('data:image/png;base64,OLD'));
  expect(result.current.files).toEqual([]);
  act(() => result.current.addFiles([file()]));
  unmount();
  expect(readers[1].abort).toHaveBeenCalledOnce();
  act(() => readers[1].complete('data:image/png;base64,LATE'));
});
it('preserves source files for a retry and clears failure only after a successful read', () => {
  const { result } = renderHook(useAssetUploads);
  act(() => result.current.addFiles([file()]));
  act(() => readers[0].onerror());
  expect(result.current.files[0].status).toBe('error');
  act(() => result.current.retryFile(result.current.files[0].id));
  act(() => readers[1].complete('data:image/png;base64,READY'));
  expect(result.current.files[0]).toMatchObject({
    status: 'ready',
    url: 'data:image/png;base64,READY',
    type: 'image',
    error: '',
  });
});
it('reports unsupported files without starting a reader', () => {
  const { result } = renderHook(useAssetUploads);
  act(() => result.current.addFiles([new File(['model'], 'x.glb')]));
  expect(readers).toHaveLength(0);
  expect(result.current.files[0]).toMatchObject({ status: 'error' });
  expect(result.current.reading).toBe(false);
});
