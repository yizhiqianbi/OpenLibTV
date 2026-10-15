import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BlobNotFoundError, get, head, put } from '@vercel/blob';
import { validateFilmDocument } from '../../src/services/interactive-film/document.js';
import type {
  FilmDocument,
  FilmManifest,
  FilmMedia,
  FilmRelease,
} from '../../src/services/interactive-film/types.js';

const TOKEN_SECONDS = 30 * 60;
export const MAX_JSON_BYTES = 1_000_000;
const MAX_FILE_BYTES = 500_000_000;
const MAX_RELEASE_BYTES = 2_000_000_000;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const RELEASE_ID = /^[a-f0-9-]{36}$/;
const MIME: Record<FilmMedia['type'], Set<string>> = {
  image: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  video: new Set(['video/mp4', 'video/webm']),
  audio: new Set([
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm',
    'audio/aac',
    'audio/flac',
  ]),
};

export class FilmPublishError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export interface FilmUploadResource {
  id: string;
  pathname: string;
  bytes: number;
  mimeType: string;
}
export interface FilmCapability {
  version: 1;
  releaseId: string;
  manifestHash: string;
  runtimeVersion: '1';
  runtimeSha256: string;
  resources: FilmUploadResource[];
  expiresAt: number;
}
export interface FilmPublishSession {
  releaseId: string;
  capability: string;
  expiresAt: number;
  resources: FilmUploadResource[];
  uploaded: Record<string, string>;
}
export interface FilmBlobInfo {
  pathname: string;
  url: string;
  size: number;
  contentType: string;
}
export interface FilmBlobStore {
  head(pathname: string): Promise<FilmBlobInfo | null>;
  read(pathname: string): Promise<string | null>;
  put(pathname: string, body: string | Uint8Array, contentType: string): Promise<void>;
  runtime(): Promise<Uint8Array>;
}
interface FilmPublishConfig {
  password?: string;
  secret?: string;
  now?: () => number;
  makeId?: () => string;
}
type StoredRelease = FilmRelease & { sourceManifestSha256: string };

export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
const contentType = (value: string) => value.split(';')[0].trim().toLowerCase();
const validId = (value: unknown): value is string =>
  typeof value === 'string' &&
  ID.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const releasePath = (id: string, name: string) => `films/${id}/${name}`;

function json(value: unknown) {
  const result = JSON.stringify(value);
  if (!result || Buffer.byteLength(result) > MAX_JSON_BYTES)
    throw new FilmPublishError('INVALID_MANIFEST', '作品数据过大或格式无效');
  return result;
}
function safeEqual(a: string, b: string) {
  return timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );
}
function requireSecret(config: FilmPublishConfig) {
  if (!config.secret || config.secret.length < 32)
    throw new FilmPublishError('PUBLISH_NOT_CONFIGURED', '发布服务尚未配置', 503);
  return config.secret;
}

/** The client may submit only relative media references. URLs are resolved from our store on completion. */
export function validatePublishManifest(value: unknown): FilmManifest {
  json(value);
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    value.runtimeVersion !== '1' ||
    typeof value.title !== 'string' ||
    value.title.length > 300 ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !validId(value.startNodeId) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.variables) ||
    !object(value.media)
  ) {
    throw new FilmPublishError('INVALID_MANIFEST', '作品数据格式无效');
  }
  if (
    value.nodes.length > 2000 ||
    value.edges.length > 6000 ||
    value.variables.length > 200 ||
    Object.keys(value.media).length > 200
  )
    throw new FilmPublishError('INVALID_MANIFEST', '作品节点或素材数量超过发布上限');
  let total = 0;
  for (const [id, media] of Object.entries(value.media)) {
    if (
      !validId(id) ||
      !object(media) ||
      media.id !== id ||
      typeof media.name !== 'string' ||
      media.name.length > 500 ||
      !['image', 'video', 'audio'].includes(String(media.type)) ||
      typeof media.mimeType !== 'string' ||
      !MIME[media.type as FilmMedia['type']]?.has(media.mimeType) ||
      !Number.isSafeInteger(media.bytes) ||
      Number(media.bytes) <= 0 ||
      Number(media.bytes) > MAX_FILE_BYTES ||
      media.url !== `media/${id}`
    )
      throw new FilmPublishError('INVALID_MEDIA', '素材格式、大小或引用地址无效');
    total += Number(media.bytes);
  }
  if (total > MAX_RELEASE_BYTES)
    throw new FilmPublishError('INVALID_MEDIA', '本作品素材总量超过发布上限');
  for (const node of value.nodes) {
    if (
      !object(node) ||
      !validId(node.id) ||
      typeof node.title !== 'string' ||
      !object(node.position) ||
      !Number.isFinite(node.position.x) ||
      !Number.isFinite(node.position.y)
    )
      throw new FilmPublishError('INVALID_MANIFEST', '作品节点格式无效');
  }
  for (const edge of value.edges) {
    if (
      !object(edge) ||
      !validId(edge.id) ||
      !validId(edge.source) ||
      !validId(edge.target) ||
      typeof edge.sourcePort !== 'string'
    )
      throw new FilmPublishError('INVALID_MANIFEST', '作品连线格式无效');
  }
  for (const variable of value.variables) {
    if (
      !object(variable) ||
      !validId(variable.id) ||
      typeof variable.name !== 'string' ||
      !['number', 'boolean'].includes(String(variable.type)) ||
      (variable.type === 'number'
        ? !Number.isFinite(variable.initial)
        : typeof variable.initial !== 'boolean')
    )
      throw new FilmPublishError('INVALID_MANIFEST', '作品变量格式无效');
  }
  const manifest = value as unknown as FilmManifest;
  const document: FilmDocument = {
    schemaVersion: 1,
    id: 'publish-validation',
    title: manifest.title,
    revision: manifest.revision,
    savedAt: 0,
    view: { x: 0, y: 0, z: 1 },
    nodes: manifest.nodes,
    edges: manifest.edges,
    variables: manifest.variables,
    media: Object.values(manifest.media),
  };
  let issues;
  try {
    issues = validateFilmDocument(document);
  } catch {
    throw new FilmPublishError('INVALID_MANIFEST', '作品配置格式无效');
  }
  if (issues.length) throw new FilmPublishError('INVALID_GRAPH', issues[0].message);
  if (!manifest.nodes.some((node) => node.id === manifest.startNodeId && node.kind === 'start'))
    throw new FilmPublishError('INVALID_GRAPH', '入口节点无效');
  return manifest;
}

export function createFilmPublisher(config: FilmPublishConfig, store: FilmBlobStore) {
  const now = config.now ?? Date.now;
  const sign = (claim: FilmCapability) => {
    const payload = Buffer.from(json(claim)).toString('base64url');
    return `${payload}.${createHmac('sha256', requireSecret(config)).update(payload).digest('base64url')}`;
  };
  function verify(capability: unknown, allowExpired = false): FilmCapability {
    if (typeof capability !== 'string' || capability.length > MAX_JSON_BYTES * 2)
      throw new FilmPublishError('INVALID_CAPABILITY', '发布凭证无效', 401);
    const [payload, signature, extra] = capability.split('.');
    const expected = createHmac('sha256', requireSecret(config))
      .update(payload || '')
      .digest('base64url');
    if (!payload || !signature || extra || !safeEqual(signature, expected))
      throw new FilmPublishError('INVALID_CAPABILITY', '发布凭证无效', 401);
    let claim: FilmCapability;
    try {
      claim = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      throw new FilmPublishError('INVALID_CAPABILITY', '发布凭证无效', 401);
    }
    if (
      claim.version !== 1 ||
      !RELEASE_ID.test(claim.releaseId) ||
      claim.runtimeVersion !== '1' ||
      !/^[a-f0-9]{64}$/.test(claim.manifestHash) ||
      !/^[a-f0-9]{64}$/.test(claim.runtimeSha256) ||
      !Number.isSafeInteger(claim.expiresAt) ||
      !Array.isArray(claim.resources)
    )
      throw new FilmPublishError('INVALID_CAPABILITY', '发布凭证无效', 401);
    if (!allowExpired && claim.expiresAt <= now())
      throw new FilmPublishError(
        'CAPABILITY_EXPIRED',
        '发布凭证已过期，请再次输入管理口令后重试',
        401,
      );
    return claim;
  }
  async function inspectResources(resources: FilmUploadResource[], requireAll: boolean) {
    const uploaded: Record<string, string> = {};
    for (let index = 0; index < resources.length; index += 8) {
      await Promise.all(
        resources.slice(index, index + 8).map(async (resource) => {
          const info = await store.head(resource.pathname);
          if (!info) {
            if (requireAll)
              throw new FilmPublishError('MEDIA_MISSING', `素材 ${resource.id} 尚未上传完成`, 409);
            return;
          }
          if (
            info.pathname !== resource.pathname ||
            info.size !== resource.bytes ||
            contentType(info.contentType) !== resource.mimeType
          )
            throw new FilmPublishError(
              'MEDIA_MISMATCH',
              `素材 ${resource.id} 与本次作品不一致`,
              409,
            );
          const url = new URL(info.url);
          if (
            url.protocol !== 'https:' ||
            !url.hostname.endsWith('.public.blob.vercel-storage.com') ||
            decodeURIComponent(url.pathname.slice(1)) !== resource.pathname
          )
            throw new FilmPublishError('MEDIA_MISMATCH', '发布素材来源无效', 409);
          uploaded[resource.id] = info.url;
        }),
      );
    }
    return uploaded;
  }
  function parseRelease(raw: string, claim?: FilmCapability): StoredRelease {
    let value: StoredRelease;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new FilmPublishError('RELEASE_CORRUPTED', '已发布作品数据无效', 503);
    }
    if (
      !value ||
      !RELEASE_ID.test(value.releaseId) ||
      !value.manifest ||
      value.manifest.schemaVersion !== 1 ||
      value.manifest.runtimeVersion !== '1' ||
      typeof value.runtimeUrl !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.runtimeSha256)
    )
      throw new FilmPublishError('RELEASE_CORRUPTED', '已发布作品数据无效', 503);
    if (
      claim &&
      (value.releaseId !== claim.releaseId ||
        value.sourceManifestSha256 !== claim.manifestHash ||
        value.runtimeSha256 !== claim.runtimeSha256)
    )
      throw new FilmPublishError('RELEASE_CONFLICT', '发布版本不一致，请新建发布', 409);
    return value;
  }
  const publicRelease = (value: StoredRelease): FilmRelease => ({
    releaseId: value.releaseId,
    manifest: value.manifest,
    runtimeUrl: value.runtimeUrl,
    runtimeSha256: value.runtimeSha256,
  });
  return {
    verify,
    async start(
      password: unknown,
      value: unknown,
      resumeToken?: unknown,
    ): Promise<FilmPublishSession> {
      requireSecret(config);
      if (!config.password)
        throw new FilmPublishError('PUBLISH_NOT_CONFIGURED', '发布服务尚未配置', 503);
      if (
        typeof password !== 'string' ||
        password.length > 256 ||
        !safeEqual(password, config.password)
      )
        throw new FilmPublishError('INVALID_PASSWORD', '管理口令不正确', 401);
      const manifest = validatePublishManifest(value);
      const manifestHash = sha256(json(manifest));
      const runtimeSha256 = sha256(await store.runtime());
      const previous = resumeToken ? verify(resumeToken, true) : null;
      if (
        previous &&
        (previous.manifestHash !== manifestHash || previous.runtimeSha256 !== runtimeSha256)
      )
        throw new FilmPublishError('RELEASE_CONFLICT', '作品或播放器已变化，请重新发布', 409);
      const releaseId = previous?.releaseId ?? (config.makeId ?? randomUUID)();
      if (!RELEASE_ID.test(releaseId))
        throw new FilmPublishError('INVALID_RELEASE_ID', '发布标识无效', 503);
      const resources = Object.values(manifest.media).map((media) => ({
        id: media.id,
        pathname: releasePath(releaseId, `media/${media.id}`),
        bytes: media.bytes,
        mimeType: media.mimeType,
      }));
      const claim: FilmCapability = {
        version: 1,
        releaseId,
        runtimeVersion: '1',
        runtimeSha256,
        manifestHash,
        resources,
        expiresAt: now() + TOKEN_SECONDS * 1000,
      };
      return {
        releaseId,
        capability: sign(claim),
        expiresAt: claim.expiresAt,
        resources,
        uploaded: await inspectResources(resources, false),
      };
    },
    uploadConstraints(capability: unknown, pathname: string) {
      const claim = verify(capability);
      const resource = claim.resources.find((item) => item.pathname === pathname);
      if (!resource)
        throw new FilmPublishError('PATH_NOT_ALLOWED', '此发布凭证不能写入该文件', 403);
      return {
        addRandomSuffix: false,
        allowOverwrite: false,
        allowedContentTypes: [resource.mimeType],
        maximumSizeInBytes: resource.bytes,
        validUntil: claim.expiresAt,
        cacheControlMaxAge: 31536000,
      };
    },
    async complete(capability: unknown, value: unknown): Promise<FilmRelease> {
      const claim = verify(capability);
      const manifest = validatePublishManifest(value);
      if (sha256(json(manifest)) !== claim.manifestHash)
        throw new FilmPublishError('MANIFEST_MISMATCH', '作品已变化，不能混入此前发布', 409);
      const releaseFile = releasePath(claim.releaseId, 'release.json');
      const existing = await store.read(releaseFile);
      if (existing) return publicRelease(parseRelease(existing, claim));
      const urls = await inspectResources(claim.resources, true);
      const runtime = await store.runtime();
      if (sha256(runtime) !== claim.runtimeSha256)
        throw new FilmPublishError('RUNTIME_CHANGED', '播放器已升级，请重新发布', 409);
      const runtimePath = releasePath(claim.releaseId, 'player.iife.js');
      const writeOnce = async (pathname: string, body: string | Uint8Array, mime: string) => {
        try {
          await store.put(pathname, body, mime);
        } catch (error) {
          if (!(await store.head(pathname))) throw error;
        }
      };
      await writeOnce(runtimePath, runtime, 'application/javascript');
      const runtimeInfo = await store.head(runtimePath);
      const storedRuntime = await store.read(runtimePath);
      if (!runtimeInfo || !storedRuntime || sha256(storedRuntime) !== claim.runtimeSha256)
        throw new FilmPublishError('RUNTIME_MISMATCH', '播放器资源校验失败', 409);
      const releasedManifest: FilmManifest = {
        ...manifest,
        media: Object.fromEntries(
          Object.entries(manifest.media).map(([id, media]) => [id, { ...media, url: urls[id] }]),
        ),
      };
      const release: StoredRelease = {
        releaseId: claim.releaseId,
        manifest: releasedManifest,
        runtimeUrl: runtimeInfo.url,
        runtimeSha256: claim.runtimeSha256,
        sourceManifestSha256: claim.manifestHash,
      };
      await writeOnce(releaseFile, json(release), 'application/json');
      const committed = await store.read(releaseFile);
      if (!committed)
        throw new FilmPublishError('RELEASE_NOT_COMMITTED', '作品提交未完成，请重试', 503);
      return publicRelease(parseRelease(committed, claim));
    },
    async release(id: unknown): Promise<FilmRelease> {
      if (typeof id !== 'string' || !RELEASE_ID.test(id))
        throw new FilmPublishError('RELEASE_NOT_FOUND', '作品不存在', 404);
      const raw = await store.read(releasePath(id, 'release.json'));
      if (!raw) throw new FilmPublishError('RELEASE_NOT_FOUND', '作品尚未发布或不存在', 404);
      const result = parseRelease(raw);
      if (result.releaseId !== id)
        throw new FilmPublishError('RELEASE_CORRUPTED', '已发布作品标识无效', 503);
      return publicRelease(result);
    },
  };
}

export function filmPublisher() {
  const store: FilmBlobStore = {
    async head(pathname) {
      try {
        return await head(pathname);
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async read(pathname) {
      try {
        // Public get() ignores useCache:false. Check storage metadata first so an
        // absent release marker never seeds a CDN 404 before its immutable put().
        const info = await head(pathname);
        const result = await get(info.url, { access: 'public' });
        if (!result || result.statusCode !== 200) return null;
        if (result.blob.size > MAX_JSON_BYTES * 3) {
          await result.stream.cancel();
          throw new FilmPublishError('RELEASE_CORRUPTED', '发布文件大小异常', 503);
        }
        const text = await new Response(result.stream).text();
        if (Buffer.byteLength(text) > MAX_JSON_BYTES * 3)
          throw new FilmPublishError('RELEASE_CORRUPTED', '发布文件大小异常', 503);
        return text;
      } catch (error) {
        if (error instanceof BlobNotFoundError) return null;
        throw error;
      }
    },
    async put(pathname, body, mime) {
      await put(pathname, typeof body === 'string' ? body : Buffer.from(body), {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: mime,
        cacheControlMaxAge: 31536000,
      });
    },
    runtime: () => readFile(path.join(process.cwd(), 'dist-film/player.iife.js')),
  };
  return createFilmPublisher(
    { password: process.env.FILM_PUBLISH_PASSWORD, secret: process.env.FILM_PUBLISH_SECRET },
    store,
  );
}
