import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishFilmDocument, loadFilmRelease } from './publish';
import { upload } from '@vercel/blob/client';
import { getFilmMediaBlob } from './media';
import type { FilmDocument, FilmManifest } from './types';

vi.mock('@vercel/blob/client', () => ({ upload: vi.fn() }));
vi.mock('./media', () => ({ getFilmMediaBlob: vi.fn() }));
vi.mock('./document', () => ({
  compileFilmDocument: (doc: FilmDocument, urls: Record<string, string>): FilmManifest => ({
    schemaVersion: 1,
    runtimeVersion: '1',
    title: doc.title,
    revision: doc.revision,
    startNodeId: 'start',
    nodes: doc.nodes,
    edges: doc.edges,
    variables: doc.variables,
    media: Object.fromEntries(
      doc.media.map((media) => [media.id, { ...media, url: urls[media.id] }]),
    ),
  }),
}));

let serial = 0;
function document(): FilmDocument {
  return {
    schemaVersion: 1,
    id: `publish-test-${serial++}`,
    title: '影片',
    revision: 1,
    savedAt: 100,
    view: { x: 0, y: 0, z: 1 },
    nodes: [],
    edges: [],
    variables: [],
    media: [{ id: 'photo', name: '图片', type: 'image', mimeType: 'image/png', bytes: 3 }],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function uploadResult(url: string): Awaited<ReturnType<typeof upload>> {
  return {
    url,
    downloadUrl: '',
    pathname: '',
    contentType: 'image/png',
    contentDisposition: '',
    etag: '',
  };
}
function fakeApi(
  doc: FilmDocument,
  uploaded: Record<string, string> = {},
  capability = 'short-scoped-capability',
) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const releaseId = `release-${doc.id}`;
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : {};
    calls.push({ url, body });
    const response = url.endsWith('/start')
      ? {
          releaseId,
          capability,
          expiresAt: Date.now() + 100000,
          resources: doc.media.map((media) => ({
            id: media.id,
            bytes: media.bytes,
            mimeType: media.mimeType,
            pathname: `films/${releaseId}/media/${media.id}`,
          })),
          uploaded,
        }
      : {
          releaseId,
          manifest: body.manifest,
          runtimeUrl: 'https://runtime.example/player.iife.js',
          runtimeSha256: 'hash',
        };
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock, releaseId };
}
beforeEach(() => {
  vi.mocked(getFilmMediaBlob).mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.mocked(upload).mockResolvedValue({
    url: 'https://uploaded.example/image',
    downloadUrl: '',
    pathname: '',
    contentType: 'image/png',
    contentDisposition: '',
    etag: 'etag',
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('film publishing client', () => {
  it('freezes graph content before asynchronous media or network work and returns its dedicated play URL', async () => {
    const doc = document();
    const { calls, releaseId } = fakeApi(doc);
    vi.mocked(getFilmMediaBlob).mockImplementationOnce(async () => {
      doc.title = 'new edit';
      return new Blob(['png'], { type: 'image/png' });
    });
    const progress = vi.fn();
    const result = await publishFilmDocument(doc, 'private-password', { onProgress: progress });
    expect((calls[0].body.manifest as FilmManifest).title).toBe('影片');
    expect(calls[0].body.password).toBe('private-password');
    expect(calls[1].body).not.toHaveProperty('password');
    expect(vi.mocked(upload).mock.calls[0][2]).toMatchObject({
      clientPayload: 'short-scoped-capability',
      access: 'public',
      contentType: 'image/png',
      handleUploadUrl: '/api/film/upload',
    });
    expect(result).toEqual({
      releaseId,
      url: new URL(`/interactive-film/play/${releaseId}`, window.location.origin).href,
    });
    expect(progress.mock.calls.map(([value]) => value.phase)).toEqual([
      'preparing',
      'uploading',
      'completing',
    ]);
  });
  it('keeps its release for retries and checks server upload status after a failed completion', async () => {
    const doc = document();
    const { calls, fetchMock } = fakeApi(doc);
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            releaseId: `release-${doc.id}`,
            capability: 'short-scoped-capability',
            expiresAt: 100,
            resources: [
              {
                id: 'photo',
                bytes: 3,
                mimeType: 'image/png',
                pathname: `films/release-${doc.id}/media/photo`,
              },
            ],
            uploaded: {},
          }),
          { status: 200 },
        ),
    );
    fetchMock.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ message: 'temporary completion failure' }), { status: 503 }),
    );
    await expect(publishFilmDocument(doc, 'password')).rejects.toThrow(
      'temporary completion failure',
    );
    vi.mocked(upload).mockClear();
    const second = fakeApi(doc, { photo: 'already-uploaded' });
    await publishFilmDocument(doc, 'password');
    expect(second.calls[0].body.resumeToken).toBe('short-scoped-capability');
    expect(upload).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
  it.each(['toString', 'hasOwnProperty'])(
    'uploads a legal imported media ID %s rather than treating an inherited property as an upload record',
    async (mediaId) => {
      const doc = document();
      doc.media[0].id = mediaId;
      const { releaseId } = fakeApi(doc);
      const progress = vi.fn();
      await publishFilmDocument(doc, 'password', { onProgress: progress });
      expect(upload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(upload).mock.calls[0][0]).toBe(`films/${releaseId}/media/${mediaId}`);
      expect(progress).toHaveBeenCalledWith({
        phase: 'uploading',
        uploadedBytes: 0,
        totalBytes: 3,
        mediaId,
      });
    },
  );
  it('never combines edits with a previous release', async () => {
    const doc = document();
    fakeApi(doc);
    vi.mocked(upload).mockRejectedValueOnce(new Error('upload failed'));
    await expect(publishFilmDocument(doc, 'password')).rejects.toThrow('upload failed');
    doc.title = '修改后的影片';
    doc.revision += 1;
    const { calls } = fakeApi(doc);
    await publishFilmDocument(doc, 'password');
    expect(calls[0].body).not.toHaveProperty('resumeToken');
    expect((calls[0].body.manifest as FilmManifest).title).toBe('修改后的影片');
  });
  it('starts a fresh frozen release when a deployment invalidates the retry capability', async () => {
    const doc = document();
    fakeApi(doc);
    vi.mocked(upload).mockRejectedValueOnce(new Error('upload failed'));
    await expect(publishFilmDocument(doc, 'password')).rejects.toThrow('upload failed');
    const retry = fakeApi(doc);
    retry.fetchMock.mockImplementationOnce(async (url: string, options?: RequestInit) => {
      retry.calls.push({ url, body: JSON.parse(String(options?.body)) });
      return new Response(JSON.stringify({ code: 'RELEASE_CONFLICT', message: '播放器已变化' }), {
        status: 409,
      });
    });
    await publishFilmDocument(doc, 'password');
    expect(retry.calls[0].body.resumeToken).toBe('short-scoped-capability');
    expect(retry.calls[1].body).not.toHaveProperty('resumeToken');
    expect((retry.calls[0].body.manifest as FilmManifest).title).toBe(
      (retry.calls[1].body.manifest as FilmManifest).title,
    );
  });
  it('aborts before publication and keeps an interrupted session available for retry', async () => {
    const doc = document();
    const controller = new AbortController();
    const { calls } = fakeApi(doc);
    vi.mocked(upload).mockImplementationOnce(async () => {
      controller.abort();
      throw new DOMException('cancelled', 'AbortError');
    });
    await expect(
      publishFilmDocument(doc, 'password', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls.map((call) => call.url)).toEqual(['/api/film/start']);
    vi.mocked(upload).mockResolvedValue({
      url: 'uploaded',
      downloadUrl: '',
      pathname: '',
      contentType: 'image/png',
      contentDisposition: '',
      etag: '',
    });
    const retry = fakeApi(doc, { photo: 'completed-before-cancel-response' });
    await publishFilmDocument(doc, 'password');
    expect(retry.calls[0].body.resumeToken).toBe('short-scoped-capability');
  });
  it('rejects cancellation immediately while the SDK is still waiting, cleans its listener and handles a late rejection', async () => {
    const doc = document();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const sdk = deferred<Awaited<ReturnType<typeof upload>>>();
    const started = deferred<void>();
    const { calls } = fakeApi(doc);
    vi.mocked(upload).mockImplementationOnce((_path, _blob, options) => {
      expect(options.abortSignal).toBe(controller.signal);
      started.resolve(undefined);
      return sdk.promise;
    });
    const operation = publishFilmDocument(doc, 'password', { signal: controller.signal });
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    // The SDK promise has not settled and no retry timer has advanced.
    await cancelled;
    expect(calls.map((call) => call.url)).toEqual(['/api/film/start']);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    sdk.reject(new Error('late network retry rejection'));
    await Promise.resolve();
  });
  it('retries the same release with completed media while a cancelled SDK upload is pending and ignores its late result', async () => {
    const doc = document();
    doc.media.push({ ...doc.media[0], id: 'second', name: '第二张图片' });
    const controller = new AbortController();
    const sdk = deferred<Awaited<ReturnType<typeof upload>>>();
    const started = deferred<void>();
    const oldProgress = vi.fn();
    let sdkProgress: Parameters<typeof upload>[2]['onUploadProgress'];
    fakeApi(doc);
    vi.mocked(upload)
      .mockResolvedValueOnce(uploadResult('https://uploaded.example/photo'))
      .mockImplementationOnce((_path, _blob, options) => {
        sdkProgress = options.onUploadProgress;
        started.resolve(undefined);
        return sdk.promise;
      });
    const operation = publishFilmDocument(doc, 'password', {
      signal: controller.signal,
      onProgress: oldProgress,
    });
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await started.promise;
    controller.abort();
    await cancelled;
    const progressCount = oldProgress.mock.calls.length;
    vi.mocked(upload).mockClear();
    const retry = fakeApi(doc, { photo: 'https://uploaded.example/photo' }, 'renewed-capability');
    const result = await publishFilmDocument(doc, 'password');
    expect(result.releaseId).toBe(retry.releaseId);
    expect(retry.calls[0].body.resumeToken).toBe('short-scoped-capability');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(vi.mocked(upload).mock.calls[0][0]).toBe(`films/${retry.releaseId}/media/second`);
    expect(retry.calls[1].body.capability).toBe('renewed-capability');
    sdkProgress?.({ loaded: 3, total: 3, percentage: 100 });
    sdk.resolve(uploadResult('https://uploaded.example/late-old-upload'));
    await Promise.resolve();
    expect(oldProgress).toHaveBeenCalledTimes(progressCount);
    const next = fakeApi(doc, { photo: 'uploaded-photo', second: 'uploaded-second' });
    vi.mocked(upload).mockClear();
    await publishFilmDocument(doc, 'password');
    expect(next.calls[0].body.resumeToken).toBe('renewed-capability');
    expect(upload).not.toHaveBeenCalled();
  });
  it('blocks missing or changed local media before requesting a release', async () => {
    const doc = document();
    const { fetchMock } = fakeApi(doc);
    vi.mocked(getFilmMediaBlob).mockResolvedValueOnce(
      new Blob(['different'], { type: 'image/png' }),
    );
    await expect(publishFilmDocument(doc, 'password')).rejects.toThrow('缺失或已变化');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('loads immutable releases without a password and rejects JSON errors safely', async () => {
    const doc = document();
    const { fetchMock } = fakeApi(doc);
    await loadFilmRelease('release/id');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/film/release?releaseId=release%2Fid', {
      signal: undefined,
    });
    fetchMock.mockResolvedValueOnce(new Response('<html>SPA fallback</html>', { status: 200 }));
    await expect(loadFilmRelease('id')).rejects.toThrow('发布接口不可用');
  });
});
