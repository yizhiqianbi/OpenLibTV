// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createFilmPublisher,
  FilmPublishError,
  sha256,
  validatePublishManifest,
  type FilmBlobStore,
} from './film-publish';
import type { FilmManifest } from '../../src/services/interactive-film/types';

const RELEASE = '11111111-1111-4111-8111-111111111111';
const PASSWORD = 'a-private-management-password';
const SECRET = 'independent-publish-signing-secret-32-chars';
function manifest(): FilmManifest {
  return {
    schemaVersion: 1,
    runtimeVersion: '1',
    title: '分支影片',
    revision: 1,
    startNodeId: 'start',
    nodes: [
      { id: 'start', kind: 'start', title: '开始', position: { x: 0, y: 0 } },
      {
        id: 'play',
        kind: 'play',
        title: '片段',
        position: { x: 200, y: 0 },
        mediaId: 'photo',
        displaySeconds: 1,
      },
      {
        id: 'ending',
        kind: 'ending',
        title: '结局',
        position: { x: 400, y: 0 },
        endingText: '结束',
      },
    ],
    edges: [
      { id: 'edge-1', source: 'start', sourcePort: 'next', target: 'play' },
      { id: 'edge-2', source: 'play', sourcePort: 'next', target: 'ending' },
    ],
    variables: [],
    media: {
      photo: {
        id: 'photo',
        name: '照片.png',
        type: 'image',
        mimeType: 'image/png',
        bytes: 3,
        width: 100,
        height: 100,
        url: 'media/photo',
      },
    },
  };
}
function fixture() {
  const files = new Map<string, { body: string; contentType: string }>();
  const writes: string[] = [];
  let runtime = 'globalThis.PenFilmPlayer={mount(){}};';
  let time = 1_000_000;
  const store: FilmBlobStore = {
    async head(pathname) {
      const file = files.get(pathname);
      return file
        ? {
            pathname,
            url: `https://test.public.blob.vercel-storage.com/${pathname}`,
            size: Buffer.byteLength(file.body),
            contentType: file.contentType,
          }
        : null;
    },
    async read(pathname) {
      return files.get(pathname)?.body ?? null;
    },
    async put(pathname, body, contentType) {
      if (files.has(pathname)) throw new Error('immutable path already exists');
      writes.push(pathname);
      files.set(pathname, {
        body: typeof body === 'string' ? body : Buffer.from(body).toString(),
        contentType,
      });
    },
    async runtime() {
      return Buffer.from(runtime);
    },
  };
  const publisher = createFilmPublisher(
    { password: PASSWORD, secret: SECRET, makeId: () => RELEASE, now: () => time },
    store,
  );
  return {
    publisher,
    store,
    files,
    writes,
    runtime: (value: string) => {
      runtime = value;
    },
    advance: (value: number) => {
      time += value;
    },
  };
}

describe('film publishing authorization and manifest validation', () => {
  it('does not enable publishing without independent server secrets', async () => {
    const { store } = fixture();
    await expect(
      createFilmPublisher({ password: PASSWORD }, store).start(PASSWORD, manifest()),
    ).rejects.toMatchObject({ status: 503, code: 'PUBLISH_NOT_CONFIGURED' });
    await expect(
      createFilmPublisher({ secret: SECRET }, store).start(PASSWORD, manifest()),
    ).rejects.toMatchObject({ status: 503 });
  });
  it('rejects an incorrect password before any store write', async () => {
    const { publisher, writes } = fixture();
    await expect(publisher.start('incorrect', manifest())).rejects.toMatchObject({
      code: 'INVALID_PASSWORD',
      status: 401,
    });
    expect(writes).toEqual([]);
  });
  it('binds a short-lived capability to exact resource paths, MIME, bytes and immutable writes', async () => {
    const { publisher, advance } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    expect(
      publisher.uploadConstraints(session.capability, session.resources[0].pathname),
    ).toMatchObject({
      allowedContentTypes: ['image/png'],
      maximumSizeInBytes: 3,
      allowOverwrite: false,
      addRandomSuffix: false,
      validUntil: session.expiresAt,
    });
    for (const pathname of [
      'films/other/media/photo',
      `films/${RELEASE}/release.json`,
      `films/${RELEASE}/player.iife.js`,
      `${session.resources[0].pathname}/../other`,
    ]) {
      expect(() => publisher.uploadConstraints(session.capability, pathname)).toThrow(
        '此发布凭证不能写入该文件',
      );
    }
    expect(() => publisher.verify(session.capability + 'x')).toThrow('发布凭证无效');
    const [encoded, signature] = session.capability.split('.');
    const claim = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    claim.resources[0].bytes = 1000;
    expect(() =>
      publisher.verify(`${Buffer.from(JSON.stringify(claim)).toString('base64url')}.${signature}`),
    ).toThrow('发布凭证无效');
    advance(30 * 60 * 1000);
    expect(() => publisher.verify(session.capability)).toThrow('发布凭证已过期');
  });
  it('rejects remote URLs, executable media, unsafe paths and broken graph configuration', () => {
    const remote = manifest();
    remote.media.photo.url = 'https://example.com/file.png';
    expect(() => validatePublishManifest(remote)).toThrow('素材格式');
    const svg = manifest();
    svg.media.photo.mimeType = 'image/svg+xml';
    expect(() => validatePublishManifest(svg)).toThrow('素材格式');
    const unsafe = manifest();
    unsafe.media['../escape'] = { ...unsafe.media.photo, id: '../escape', url: 'media/../escape' };
    expect(() => validatePublishManifest(unsafe)).toThrow('素材格式');
    const broken = manifest();
    broken.edges[0].target = 'missing';
    expect(() => validatePublishManifest(broken)).toThrow(FilmPublishError);
    const oversized = manifest();
    oversized.media.photo.bytes = 500_000_001;
    expect(() => validatePublishManifest(oversized)).toThrow('素材格式');
    expect(() => validatePublishManifest({ ...manifest(), nodes: [null] })).toThrow('节点格式');
  });
});

describe('immutable film releases', () => {
  it('does not commit an incomplete upload; renews an expired capability while retaining uploaded resources', async () => {
    const { publisher, store, writes, advance } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    await expect(publisher.complete(session.capability, manifest())).rejects.toMatchObject({
      code: 'MEDIA_MISSING',
    });
    expect(writes).toEqual([]);
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    advance(31 * 60 * 1000);
    const resumed = await publisher.start(PASSWORD, manifest(), session.capability);
    expect(resumed.releaseId).toBe(session.releaseId);
    expect(resumed.uploaded.photo).toContain(`/films/${RELEASE}/media/photo`);
    expect(resumed.expiresAt).toBeGreaterThan(session.expiresAt);
  });
  it('blocks actual file size or MIME changes before writing runtime or release', async () => {
    for (const file of [
      { body: 'longer', contentType: 'image/png' },
      { body: 'png', contentType: 'text/html' },
    ]) {
      const { publisher, files, writes } = fixture();
      const session = await publisher.start(PASSWORD, manifest());
      files.set(session.resources[0].pathname, file);
      await expect(publisher.complete(session.capability, manifest())).rejects.toMatchObject({
        code: 'MEDIA_MISMATCH',
      });
      expect(writes).toEqual([]);
    }
  });
  it('publishes the trusted runtime then the manifest marker and repeats completion without overwriting', async () => {
    const { publisher, store, writes } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    const release = await publisher.complete(session.capability, manifest());
    expect(writes).toEqual([
      session.resources[0].pathname,
      `films/${RELEASE}/player.iife.js`,
      `films/${RELEASE}/release.json`,
    ]);
    expect(release.manifest.media.photo.url).toBe(
      `https://test.public.blob.vercel-storage.com/${session.resources[0].pathname}`,
    );
    expect(release.runtimeSha256).toBe(sha256('globalThis.PenFilmPlayer={mount(){}};'));
    expect(await publisher.complete(session.capability, manifest())).toEqual(release);
    expect(await publisher.release(RELEASE)).toEqual(release);
    expect(writes).toHaveLength(3);
  });
  it('makes concurrent completion idempotent', async () => {
    const { publisher, store, writes } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    const releases = await Promise.all([
      publisher.complete(session.capability, manifest()),
      publisher.complete(session.capability, manifest()),
    ]);
    expect(releases[0]).toEqual(releases[1]);
    expect(writes.filter((pathname) => pathname.endsWith('release.json'))).toHaveLength(1);
  });
  it('keeps a failed final marker unavailable and completes it on retry', async () => {
    const fixtureData = fixture();
    const { publisher, store, writes } = fixtureData;
    const session = await publisher.start(PASSWORD, manifest());
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    const originalPut = store.put;
    let fail = true;
    store.put = async (pathname, body, mime) => {
      if (fail && pathname.endsWith('release.json')) {
        fail = false;
        throw new Error('temporary provider failure');
      }
      return originalPut(pathname, body, mime);
    };
    await expect(publisher.complete(session.capability, manifest())).rejects.toThrow(
      'temporary provider failure',
    );
    await expect(publisher.release(RELEASE)).rejects.toMatchObject({ status: 404 });
    const released = await publisher.complete(session.capability, manifest());
    expect(released.releaseId).toBe(RELEASE);
    expect(writes.filter((pathname) => pathname.endsWith('player.iife.js'))).toHaveLength(1);
  });
  it('rejects a corrupt previously written runtime instead of accepting a file-exists error', async () => {
    const { publisher, store, files } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    files.set(`films/${RELEASE}/player.iife.js`, {
      body: 'untrusted script',
      contentType: 'application/javascript',
    });
    await expect(publisher.complete(session.capability, manifest())).rejects.toMatchObject({
      code: 'RUNTIME_MISMATCH',
    });
    expect(files.has(`films/${RELEASE}/release.json`)).toBe(false);
  });
  it('prevents mixing an edited graph or changed runtime into a pending release', async () => {
    const { publisher, store, runtime, writes } = fixture();
    const session = await publisher.start(PASSWORD, manifest());
    const changed = manifest();
    changed.title = '另一个版本';
    await expect(publisher.complete(session.capability, changed)).rejects.toMatchObject({
      code: 'MANIFEST_MISMATCH',
    });
    await expect(publisher.start(PASSWORD, changed, session.capability)).rejects.toMatchObject({
      code: 'RELEASE_CONFLICT',
    });
    await store.put(session.resources[0].pathname, 'png', 'image/png');
    runtime('new-version');
    await expect(publisher.complete(session.capability, manifest())).rejects.toMatchObject({
      code: 'RUNTIME_CHANGED',
    });
    expect(writes).toHaveLength(1);
  });
  it('keeps unfinished, missing and invalid releases unavailable', async () => {
    const { publisher } = fixture();
    for (const id of [RELEASE, '../escape', ['bad'], 'https://example.com'])
      await expect(publisher.release(id)).rejects.toMatchObject({
        code: 'RELEASE_NOT_FOUND',
        status: 404,
      });
  });
});
