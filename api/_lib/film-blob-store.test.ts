// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobNotFoundError, get, head, put } from '@vercel/blob';
import { readFile } from 'node:fs/promises';
import { filmPublisher } from './film-publish';
import type { FilmManifest } from '../../src/services/interactive-film/types';

vi.mock('@vercel/blob', async (original) => ({
  ...(await original<typeof import('@vercel/blob')>()),
  get: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
}));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readFile: vi.fn(),
}));

const RELEASE = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'production-adapter-test-password';
const RUNTIME = 'globalThis.PenFilmPlayer={mount(){}};';
const manifest: FilmManifest = {
  schemaVersion: 1,
  runtimeVersion: '1',
  title: '立即提交',
  revision: 1,
  startNodeId: 'start',
  nodes: [
    { id: 'start', kind: 'start', title: '开始', position: { x: 0, y: 0 } },
    { id: 'end', kind: 'ending', title: '结束', position: { x: 1, y: 0 }, endingText: '结束' },
  ],
  edges: [{ id: 'next', source: 'start', sourcePort: 'next', target: 'end' }],
  variables: [],
  media: {},
};

beforeEach(() => {
  vi.stubEnv('FILM_PUBLISH_PASSWORD', PASSWORD);
  vi.stubEnv('FILM_PUBLISH_SECRET', 'production-adapter-test-signing-secret-32-characters');
  vi.mocked(get).mockReset();
  vi.mocked(head).mockReset();
  vi.mocked(put).mockReset();
  vi.mocked(readFile).mockResolvedValue(Buffer.from(RUNTIME));
});
afterEach(() => vi.unstubAllEnvs());

describe('production public Blob reads', () => {
  it('returns missing releases using metadata without creating a public CDN 404', async () => {
    vi.mocked(head).mockRejectedValue(new BlobNotFoundError());
    await expect(filmPublisher().release(RELEASE)).rejects.toMatchObject({
      code: 'RELEASE_NOT_FOUND',
      status: 404,
    });
    expect(head).toHaveBeenCalledWith(`films/${RELEASE}/release.json`);
    expect(get).not.toHaveBeenCalled();
  });

  it('commits and immediately reads a new release even when public missing reads would be negatively cached', async () => {
    const files = new Map<string, { body: string; mime: string }>();
    const negativeCache = new Set<string>();
    const pathname = (value: string) =>
      value.startsWith('https://') ? new URL(value).pathname.slice(1) : value;
    const metadata = (key: string, file: { body: string; mime: string }) => ({
      pathname: key,
      url: `https://test.public.blob.vercel-storage.com/${key}`,
      downloadUrl: '',
      contentType: file.mime,
      contentDisposition: '',
      cacheControl: 'public, max-age=31536000',
      uploadedAt: new Date(0),
      etag: 'etag',
      size: Buffer.byteLength(file.body),
    });
    vi.mocked(head).mockImplementation(async (value) => {
      const key = pathname(value);
      const file = files.get(key);
      if (!file) throw new BlobNotFoundError();
      return metadata(key, file);
    });
    vi.mocked(get).mockImplementation(async (value) => {
      const key = pathname(value);
      const file = files.get(key);
      if (!file || negativeCache.has(key)) {
        negativeCache.add(key);
        return null;
      }
      return {
        statusCode: 200,
        stream: new Response(file.body).body!,
        headers: new Headers(),
        blob: metadata(key, file),
      };
    });
    vi.mocked(put).mockImplementation(async (key, body, options) => {
      expect(options).toMatchObject({
        access: 'public',
        allowOverwrite: false,
        addRandomSuffix: false,
      });
      if (files.has(key)) throw new Error('immutable path already exists');
      const file = {
        body: typeof body === 'string' ? body : Buffer.from(body as Uint8Array).toString(),
        mime: options.contentType!,
      };
      files.set(key, file);
      return metadata(key, file);
    });
    const publisher = filmPublisher();
    const session = await publisher.start(PASSWORD, manifest);
    // A player checking the unpublished URL must also avoid seeding negative CDN state.
    await expect(publisher.release(session.releaseId)).rejects.toMatchObject({ status: 404 });
    const release = await publisher.complete(session.capability, manifest);
    expect(release.releaseId).toBe(session.releaseId);
    expect(negativeCache.size).toBe(0);
    expect(get).toHaveBeenCalledTimes(2);
    for (const [url, options] of vi.mocked(get).mock.calls) {
      expect(url).toMatch(/^https:\/\/test\.public\.blob\.vercel-storage\.com\//);
      expect(options).toEqual({ access: 'public' });
    }
    expect(await publisher.complete(session.capability, manifest)).toEqual(release);
    expect(await publisher.release(session.releaseId)).toEqual(release);
    expect(put).toHaveBeenCalledTimes(2);
  });
});
