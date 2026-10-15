import type { FilmMedia } from './types.ts';

const DATABASE = 'libtv-interactive-film-media';
const STORE = 'blobs';
const TIMEOUT = 15000;
interface MediaRecord {
  id: string;
  blob: Blob;
  media: FilmMedia;
}
interface MediaOptions {
  signal?: AbortSignal;
}
const aborted = () => new DOMException('素材读取已取消', 'AbortError');
const checkSignal = (signal?: AbortSignal) => {
  if (signal?.aborted) throw aborted();
};
const kind = (type: string): FilmMedia['type'] => {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  throw new Error('影游只支持图片、视频和音频文件');
};

function openMediaDatabase(signal?: AbortSignal): Promise<IDBDatabase> {
  checkSignal(signal);
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('当前浏览器无法持久保存影游素材'));
  return new Promise((resolve, reject) => {
    let settled = false;
    let request: IDBOpenDBRequest;
    const timer = setTimeout(
      () => finish(new Error('素材数据库打开超时，请关闭其他影游标签后重试')),
      TIMEOUT,
    );
    const cancel = () => finish(aborted());
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const finish = (error?: Error, database?: IDBDatabase) => {
      if (settled) {
        database?.close();
        return;
      }
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (database) {
        database.onversionchange = () => database.close();
        resolve(database);
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (settled || signal?.aborted) {
          request.transaction?.abort();
          return;
        }
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => finish(undefined, request.result);
      request.onerror = () => finish(request.error || new Error('素材数据库打开失败'));
      request.onblocked = () => finish(new Error('素材数据库被其他标签页占用，请关闭后重试'));
    } catch (error) {
      finish(error as Error);
    }
  });
}

async function transactMedia<T>(
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore) => IDBRequest<T>,
  signal?: AbortSignal,
): Promise<T> {
  const database = await openMediaDatabase(signal);
  try {
    checkSignal(signal);
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      let result: T,
        settled = false;
      const timer = setTimeout(() => {
        finish(new Error('素材存储操作超时，请重新导入或重试'));
        try {
          transaction.abort();
        } catch {
          /* A completed transaction needs no cancellation. */
        }
      }, TIMEOUT);
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () => {
        try {
          transaction.abort();
        } catch {
          /* The completed transaction is already durable. */
        }
        finish(aborted());
      };
      signal?.addEventListener('abort', cancel, { once: true });
      transaction.oncomplete = () => finish(signal?.aborted ? aborted() : undefined);
      transaction.onerror = () =>
        finish(transaction.error || new Error('素材保存失败，文件仍保留在当前导入中'));
      transaction.onabort = () =>
        finish(
          signal?.aborted
            ? aborted()
            : transaction.error || new Error('素材保存失败，请检查浏览器存储空间'),
        );
      try {
        const request = operate(transaction.objectStore(STORE));
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          /* The transaction error owns rollback and rejection. */
        };
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          /* Aborted or inactive. */
        }
        finish(error as Error);
      }
    });
  } finally {
    database.close();
  }
}

function readMediaMetadata(
  file: Blob,
  type: FilmMedia['type'],
  signal?: AbortSignal,
): Promise<Pick<FilmMedia, 'duration' | 'width' | 'height'>> {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement(type === 'image' ? 'img' : type);
    let settled = false;
    const event = type === 'image' ? 'load' : 'loadedmetadata';
    const timer = setTimeout(() => finish(new Error('素材信息读取超时，请重新选择文件')), TIMEOUT);
    const cancel = () => finish(aborted());
    const fail = () => finish(new Error('素材无法解码，请检查文件或选择浏览器支持的格式'));
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      element.removeEventListener(event, ready);
      element.removeEventListener('error', fail);
      element.removeAttribute('src');
      if (element instanceof HTMLMediaElement) {
        try {
          element.load();
        } catch {
          /* Disposal must not retain the temporary URL. */
        }
      }
      URL.revokeObjectURL(url);
    };
    const finish = (error?: Error, metadata?: Pick<FilmMedia, 'duration' | 'width' | 'height'>) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(metadata || {});
    };
    const ready = () => {
      if (signal?.aborted) {
        finish(aborted());
        return;
      }
      if (element instanceof HTMLImageElement) {
        if (element.naturalWidth <= 0 || element.naturalHeight <= 0) {
          fail();
          return;
        }
        finish(undefined, { width: element.naturalWidth, height: element.naturalHeight });
      } else {
        const media = element as HTMLMediaElement;
        if (!Number.isFinite(media.duration) || media.duration <= 0) {
          fail();
          return;
        }
        const metadata: Pick<FilmMedia, 'duration' | 'width' | 'height'> = {
          duration: media.duration,
        };
        if (element instanceof HTMLVideoElement) {
          if (element.videoWidth <= 0 || element.videoHeight <= 0) {
            fail();
            return;
          }
          Object.assign(metadata, { width: element.videoWidth, height: element.videoHeight });
        }
        finish(undefined, metadata);
      }
    };
    signal?.addEventListener('abort', cancel, { once: true });
    element.addEventListener(event, ready);
    element.addEventListener('error', fail);
    if (element instanceof HTMLMediaElement) element.preload = 'metadata';
    element.setAttribute('src', url);
  });
}

export async function storeFilmMedia(
  file: File,
  { signal }: MediaOptions = {},
): Promise<FilmMedia> {
  checkSignal(signal);
  if (!file.size) throw new Error('不能导入空素材文件');
  const type = kind(file.type);
  const metadata = await readMediaMetadata(file, type, signal);
  checkSignal(signal);
  const media: FilmMedia = {
    id: `media-${crypto.randomUUID()}`,
    name: file.name || '未命名素材',
    type,
    mimeType: file.type,
    bytes: file.size,
    ...metadata,
  };
  await transactMedia(
    'readwrite',
    (store) => store.add({ id: media.id, blob: file, media } satisfies MediaRecord),
    signal,
  );
  checkSignal(signal);
  return media;
}

export async function getFilmMediaBlob(id: string, { signal }: MediaOptions = {}): Promise<Blob> {
  if (!id.trim()) throw new Error('缺少素材 ID');
  const record = await transactMedia<MediaRecord | undefined>(
    'readonly',
    (store) => store.get(id),
    signal,
  );
  checkSignal(signal);
  if (!record?.blob || typeof record.blob.size !== 'number')
    throw Object.assign(new Error('本机素材不存在，请重新导入'), { mediaId: id });
  return record.blob;
}

export async function createFilmMediaUrls(
  media: FilmMedia[],
  { signal }: MediaOptions = {},
): Promise<{ urls: Record<string, string>; dispose: () => void }> {
  checkSignal(signal);
  const urls: Record<string, string> = {};
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    for (const url of Object.values(urls)) URL.revokeObjectURL(url);
  };
  signal?.addEventListener('abort', dispose, { once: true });
  try {
    for (const item of media) {
      if (urls[item.id]) continue;
      const blob = await getFilmMediaBlob(item.id, { signal });
      checkSignal(signal);
      if (disposed) throw aborted();
      urls[item.id] = URL.createObjectURL(blob);
    }
    checkSignal(signal);
    return { urls, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export async function importFilmMediaUrl(
  name: string,
  url: string,
  { signal }: MediaOptions = {},
): Promise<FilmMedia> {
  checkSignal(signal);
  const resolved = new URL(url, window.location.href);
  if (!['http:', 'https:', 'blob:'].includes(resolved.protocol))
    throw new Error('仅支持可读取的媒体 URL');
  const response = await fetch(resolved.href, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`素材读取失败 (${response.status})`);
  const blob = await response.blob();
  checkSignal(signal);
  kind(blob.type);
  return storeFilmMedia(new File([blob], name || '导入素材', { type: blob.type }), { signal });
}
