// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { archiveEntryNames, createDownloadArchive } from './download-archive.ts';
it('returns a real ZIP with safe unique names, UTF-8 text and the exact fetched bytes', async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  const progress = vi.fn();
  const blob = await createDownloadArchive(
    [
      { name: '../镜头.md', content: '中文提示词' },
      { name: '镜头.md', content: '另一段' },
      { name: '视频.mp4', url: 'remote' },
    ],
    { asset: () => '/assets/local', fetcher, onProgress: progress },
  );
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  expect(Object.keys(files).sort()).toEqual(['_镜头.md', '镜头.md', '视频.mp4'].sort());
  expect(strFromU8(files['_镜头.md'])).toBe('中文提示词');
  expect(Array.from(files['视频.mp4'])).toEqual([1, 2, 3]);
  expect(fetcher).toHaveBeenCalledWith(
    '/assets/local',
    expect.objectContaining({ credentials: 'omit' }),
  );
  expect(progress).toHaveBeenLastCalledWith({ finished: 3, total: 3, bytes: 27 });
  expect(archiveEntryNames([{ name: 'x.txt' }, { name: 'X.txt' }, { name: 'x.txt' }])).toEqual([
    'x.txt',
    'X (2).txt',
    'x (3).txt',
  ]);
});
it('never silently bypasses protected exports or reports success on a failed fetch', async () => {
  const fetcher = vi.fn(async () => new Response('', { status: 403 }));
  await expect(
    createDownloadArchive([{ name: 'x.mp4', url: 'x', protectionType: 'watermark' }], { fetcher }),
  ).rejects.toThrow('水印');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(createDownloadArchive([{ name: 'x.mp4', url: 'x' }], { fetcher })).rejects.toThrow(
    '403',
  );
});
it('cancels ongoing fetches and rejects late bytes without producing an archive', async () => {
  const controller = new AbortController();
  let resolve!: (response: Response) => void;
  const fetcher = vi.fn(
    (_url, _options) =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const job = createDownloadArchive([{ name: 'x.mp4', url: 'x' }], {
    fetcher,
    signal: controller.signal,
  });
  controller.abort();
  resolve(new Response('late'));
  await expect(job).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
it('enforces actual byte capacity and stops parallel work after one failure', async () => {
  await expect(
    createDownloadArchive([{ name: '大文件.md', content: '12345' }], { maxBytes: 4 }),
  ).rejects.toThrow('容量');
  const controller = new AbortController();
  controller.abort();
  await expect(
    createDownloadArchive([{ name: 'x', content: 'x' }], { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
