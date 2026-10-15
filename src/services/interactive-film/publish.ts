import { upload } from '@vercel/blob/client';
import { compileFilmDocument } from './document';
import { getFilmMediaBlob } from './media';
import type { FilmDocument, FilmManifest, FilmRelease } from './types';

interface UploadResource {
  id: string;
  pathname: string;
  bytes: number;
  mimeType: string;
}
interface PublishSession {
  releaseId: string;
  capability: string;
  expiresAt: number;
  resources: UploadResource[];
  uploaded: Record<string, string>;
}
export interface FilmPublishProgress {
  phase: 'preparing' | 'uploading' | 'completing';
  uploadedBytes: number;
  totalBytes: number;
  mediaId?: string;
}
export interface FilmPublishOptions {
  signal?: AbortSignal;
  onProgress?: (progress: FilmPublishProgress) => void;
}
const sessions = new Map<string, { fingerprint: string; session: PublishSession }>();
const publishing = new Set<string>();
class FilmPublishClientError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const abort = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('发布已取消', 'AbortError');
};

function waitForUpload<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cancelled = () => {
      signal.removeEventListener('abort', cancelled);
      reject(new DOMException('发布已取消', 'AbortError'));
    };
    // Keep both handlers attached after cancellation: the SDK may still be waiting
    // for its retry backoff, and its eventual rejection must remain handled.
    pending.then(
      (value) => {
        signal.removeEventListener('abort', cancelled);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancelled);
        reject(error);
      },
    );
    if (signal.aborted) cancelled();
    else signal.addEventListener('abort', cancelled, { once: true });
  });
}

async function request<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  abort(signal);
  const response = await fetch(
    url,
    body === undefined
      ? { signal }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        },
  );
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    abort(signal);
    throw new Error('发布接口不可用，请使用已配置发布服务的工作区');
  }
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'message' in value && typeof value.message === 'string'
        ? value.message
        : '发布失败，请稍后重试';
    const code =
      value && typeof value === 'object' && 'code' in value && typeof value.code === 'string'
        ? value.code
        : 'PUBLISH_FAILED';
    throw new FilmPublishClientError(code, message);
  }
  abort(signal);
  return value as T;
}
function validSession(value: PublishSession, manifest: FilmManifest) {
  if (
    !value ||
    typeof value.releaseId !== 'string' ||
    typeof value.capability !== 'string' ||
    !Array.isArray(value.resources) ||
    !value.uploaded
  )
    throw new Error('发布服务返回的凭证无效');
  const ids = new Set(Object.keys(manifest.media));
  for (const resource of value.resources) {
    const media = manifest.media[resource.id];
    if (
      !ids.delete(resource.id) ||
      !media ||
      resource.bytes !== media.bytes ||
      resource.mimeType !== media.mimeType ||
      resource.pathname !== `films/${value.releaseId}/media/${resource.id}`
    )
      throw new Error('发布服务返回的素材协议无效');
  }
  if (ids.size) throw new Error('发布服务缺少素材上传凭证');
}

/** Each call freezes one graph; retries reuse its immutable release and already uploaded media. Passwords are never retained. */
export async function publishFilmDocument(
  document: FilmDocument,
  password: string,
  options: FilmPublishOptions = {},
): Promise<{ url: string; releaseId: string }> {
  const { signal, onProgress } = options;
  const documentId = document.id;
  abort(signal);
  if (publishing.has(documentId)) throw new Error('此作品正在发布');
  publishing.add(documentId);
  try {
    const frozen: FilmDocument = JSON.parse(JSON.stringify(document));
    const fingerprint = JSON.stringify(frozen);
    const urls = Object.fromEntries(frozen.media.map((media) => [media.id, `media/${media.id}`]));
    const manifest = compileFilmDocument(frozen, urls);
    const blobs = new Map<string, Blob>();
    const totalBytes = Object.values(manifest.media).reduce((sum, media) => sum + media.bytes, 0);
    onProgress?.({ phase: 'preparing', uploadedBytes: 0, totalBytes });
    for (const media of Object.values(manifest.media)) {
      abort(signal);
      const blob = await getFilmMediaBlob(media.id, { signal });
      abort(signal);
      if (!blob || blob.size !== media.bytes || (blob.type && blob.type !== media.mimeType))
        throw new Error(`素材「${media.name}」缺失或已变化，请重新导入后发布`);
      blobs.set(media.id, blob);
    }
    const previous = sessions.get(frozen.id);
    const resumeToken =
      previous?.fingerprint === fingerprint ? previous.session.capability : undefined;
    let session: PublishSession;
    try {
      session = await request<PublishSession>(
        '/api/film/start',
        { password, manifest, ...(resumeToken ? { resumeToken } : {}) },
        signal,
      );
    } catch (error) {
      // A new deployment or signing-secret rotation cannot reuse an older capability.
      // Start a new immutable release, keeping the frozen graph and local media intact.
      if (
        !resumeToken ||
        !(error instanceof FilmPublishClientError) ||
        !['RELEASE_CONFLICT', 'INVALID_CAPABILITY'].includes(error.code)
      )
        throw error;
      sessions.delete(frozen.id);
      session = await request<PublishSession>('/api/film/start', { password, manifest }, signal);
    }
    validSession(session, manifest);
    sessions.set(frozen.id, { fingerprint, session });
    let uploadedBytes = session.resources
      .filter((resource) => Object.hasOwn(session.uploaded, resource.id))
      .reduce((sum, resource) => sum + resource.bytes, 0);
    for (const resource of session.resources) {
      abort(signal);
      if (Object.hasOwn(session.uploaded, resource.id)) continue;
      const baseBytes = uploadedBytes;
      onProgress?.({ phase: 'uploading', uploadedBytes, totalBytes, mediaId: resource.id });
      let uploadActive = true;
      try {
        const blob = await waitForUpload(
          upload(resource.pathname, blobs.get(resource.id)!, {
            access: 'public',
            contentType: resource.mimeType,
            handleUploadUrl: '/api/film/upload',
            clientPayload: session.capability,
            abortSignal: signal,
            multipart: resource.bytes >= 5_000_000,
            onUploadProgress: ({ loaded }) => {
              if (!uploadActive || signal?.aborted) return;
              onProgress?.({
                phase: 'uploading',
                uploadedBytes: baseBytes + Math.min(loaded, resource.bytes),
                totalBytes,
                mediaId: resource.id,
              });
            },
          }),
          signal,
        );
        abort(signal);
        // Keep successful uploads even when the next file, completion request or cancellation fails.
        session = { ...session, uploaded: { ...session.uploaded, [resource.id]: blob.url } };
        sessions.set(frozen.id, { fingerprint, session });
        uploadedBytes += resource.bytes;
      } finally {
        uploadActive = false;
      }
    }
    abort(signal);
    onProgress?.({ phase: 'completing', uploadedBytes, totalBytes });
    const release = await request<FilmRelease>(
      '/api/film/complete',
      { capability: session.capability, manifest },
      signal,
    );
    if (release.releaseId !== session.releaseId) throw new Error('发布版本返回不一致');
    return {
      releaseId: release.releaseId,
      url: new URL(
        `/interactive-film/play/${encodeURIComponent(release.releaseId)}`,
        window.location.origin,
      ).href,
    };
  } finally {
    publishing.delete(documentId);
  }
}

export function loadFilmRelease(
  releaseId: string,
  options: { signal?: AbortSignal } = {},
): Promise<FilmRelease> {
  return request<FilmRelease>(
    `/api/film/release?releaseId=${encodeURIComponent(releaseId)}`,
    undefined,
    options.signal,
  );
}
