import { Blob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { unzipSync } from 'three/addons/libs/fflate.module.js';
import { downloadLibraryAssets } from './download.js';

afterEach(() => vi.unstubAllGlobals());
it('downloads a real ZIP without overwriting duplicate filenames', async () => {
  vi.stubGlobal('Blob', Blob);
  const blobs = [];
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob);
    return 'blob:fixture';
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => ({
      ok: true,
      blob: async () => new Blob([url.endsWith('one') ? 'first' : 'second']),
    })),
  );
  await downloadLibraryAssets([
    { name: '同名', mimeType: 'image/png', url: 'data:one' },
    { name: '同名', mimeType: 'image/png', url: 'data:two' },
  ]);
  expect(create).toHaveBeenCalledOnce();
  expect(blobs[0].type).toBe('application/zip');
  const contents = unzipSync(new Uint8Array(await blobs[0].arrayBuffer()));
  expect(Object.keys(contents)).toEqual(['同名.png', '同名 (2).png']);
  expect(new TextDecoder().decode(contents['同名.png'])).toBe('first');
  expect(new TextDecoder().decode(contents['同名 (2).png'])).toBe('second');
});
it('does not save a partial download when one resource fails or the request is cancelled', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false })),
  );
  await expect(downloadLibraryAssets([{ name: '失败资源', url: 'data:bad' }])).rejects.toThrow(
    '下载失败',
  );
  expect(click).not.toHaveBeenCalled();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['x']) })),
  );
  const controller = new AbortController();
  controller.abort();
  await downloadLibraryAssets([{ name: '资源', url: 'data:x' }], controller.signal);
  expect(click).not.toHaveBeenCalled();
});
