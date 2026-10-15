import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFilmMediaUrls,
  getFilmMediaBlob,
  importFilmMediaUrl,
  storeFilmMedia,
} from './media.ts';

// Controlled transaction delivery exercises durability and cancellation, not real browser codecs.
function controlledDatabase() {
  const records = new Map();
  const pending = [];
  const controls = { holdWrites: false, holdReads: new Set(), failWrites: false };
  const close = vi.fn();
  const database = {
    close,
    objectStoreNames: { contains: () => true },
    transaction: vi.fn((_, mode) => {
      let staged,
        aborted = false;
      const transaction = {
        error: null,
        abort: vi.fn(() => {
          aborted = true;
          transaction.onabort?.();
        }),
        commit: () => {
          if (aborted) return;
          if (staged) records.set(staged.id, staged);
          transaction.oncomplete?.();
        },
        objectStore: () => ({
          add: (record) => {
            staged = record;
            const request = { result: record.id };
            queueMicrotask(() => {
              if (aborted) return;
              if (controls.failWrites) {
                transaction.error = new DOMException('Quota full', 'QuotaExceededError');
                transaction.onerror?.();
              } else {
                request.onsuccess?.();
                if (!controls.holdWrites) transaction.commit();
              }
            });
            return request;
          },
          get: (id) => {
            const request = { result: records.get(id) };
            queueMicrotask(() => {
              if (aborted) return;
              request.onsuccess?.();
              if (!controls.holdReads.has(id)) transaction.commit();
            });
            return request;
          },
        }),
      };
      pending.push({ mode, transaction });
      return transaction;
    }),
  };
  const factory = {
    open: vi.fn(() => {
      const request = { result: database };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }),
  };
  vi.stubGlobal('indexedDB', factory);
  return { records, pending, controls, close, factory };
}

let elements, createUrl, revokeUrl;
beforeEach(() => {
  elements = [];
  const NativeURL = URL;
  createUrl = vi.fn(() => `blob:owned-${createUrl.mock.calls.length}`);
  revokeUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const element = original(tag, options);
    if (tag === 'video' || tag === 'audio') {
      Object.defineProperty(element, 'duration', { configurable: true, value: 12.5 });
      if (tag === 'video') {
        Object.defineProperty(element, 'videoWidth', { configurable: true, value: 1920 });
        Object.defineProperty(element, 'videoHeight', { configurable: true, value: 1080 });
      }
      elements.push(element);
    }
    return element;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const flush = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
const file = () => new File([new Uint8Array([1, 2, 3, 4])], 'actual.mp4', { type: 'video/mp4' });

describe('film media owns metadata, durable bytes and temporary URLs', () => {
  it('returns actual metadata only after the Blob transaction is durable', async () => {
    const db = controlledDatabase();
    db.controls.holdWrites = true;
    const source = file();
    const result = storeFilmMedia(source);
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    let resolved = false;
    result.then(() => {
      resolved = true;
    });
    await flush();
    expect(resolved).toBe(false);
    expect(db.records.size).toBe(0);
    db.pending[0].transaction.commit();
    const media = await result;
    expect(media).toMatchObject({
      name: 'actual.mp4',
      bytes: 4,
      mimeType: 'video/mp4',
      duration: 12.5,
      width: 1920,
      height: 1080,
    });
    expect(db.records.get(media.id).blob).toBe(source);
    expect(await getFilmMediaBlob(media.id)).toBe(source);
    expect(revokeUrl).toHaveBeenCalledWith('blob:owned-1');
    expect(elements[0].getAttribute('src')).toBeNull();
  });
  it('cancels metadata and ignores a late loadedmetadata event without opening persistence', async () => {
    const db = controlledDatabase(),
      controller = new AbortController();
    const result = storeFilmMedia(file(), { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejection;
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    await flush();
    expect(db.factory.open).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
  it('rejects quota failure and cannot return an unstored media record', async () => {
    const db = controlledDatabase();
    db.controls.failWrites = true;
    const result = storeFilmMedia(file());
    const rejection = expect(result).rejects.toMatchObject({ name: 'QuotaExceededError' });
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    await rejection;
    expect(db.records.size).toBe(0);
    expect(db.close).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
  it('aborts an in-flight write transaction and releases its database', async () => {
    const db = controlledDatabase();
    db.controls.holdWrites = true;
    const controller = new AbortController();
    const result = storeFilmMedia(file(), { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    await flush();
    controller.abort();
    await rejection;
    expect(db.pending[0].transaction.abort).toHaveBeenCalledOnce();
    db.pending[0].transaction.commit();
    expect(db.records.size).toBe(0);
    expect(db.close).toHaveBeenCalledOnce();
  });
  it('releases previous URLs when another asset fails and releases successful URLs exactly once', async () => {
    const db = controlledDatabase();
    db.records.set('one', { blob: file() });
    await expect(createFilmMediaUrls([{ id: 'one' }, { id: 'missing' }])).rejects.toMatchObject({
      message: '本机素材不存在，请重新导入',
      mediaId: 'missing',
    });
    expect(revokeUrl).toHaveBeenCalledWith('blob:owned-1');
    const result = await createFilmMediaUrls([{ id: 'one' }, { id: 'one' }]);
    expect(Object.keys(result.urls)).toEqual(['one']);
    result.dispose();
    result.dispose();
    expect(revokeUrl.mock.calls.map(([url]) => url)).toEqual(['blob:owned-1', 'blob:owned-2']);
  });
  it('cancels during the next asset and revokes all URLs already created', async () => {
    const db = controlledDatabase();
    db.records.set('one', { blob: file() });
    db.records.set('two', { blob: file() });
    db.controls.holdReads.add('two');
    const controller = new AbortController();
    const pending = createFilmMediaUrls([{ id: 'one' }, { id: 'two' }], {
      signal: controller.signal,
    });
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    await rejection;
    expect(revokeUrl).toHaveBeenCalledOnce();
    expect(db.pending.at(-1).transaction.abort).toHaveBeenCalledOnce();
  });
  it('rejects unsupported files and active data URLs before opening media resources', async () => {
    controlledDatabase();
    await expect(
      storeFilmMedia(new File(['x'], 'script.html', { type: 'text/html' })),
    ).rejects.toThrow('只支持');
    await expect(importFilmMediaUrl('inline', 'data:video/mp4;base64,eA==')).rejects.toThrow(
      '媒体 URL',
    );
    expect(createUrl).not.toHaveBeenCalled();
  });
  it('times out unreadable metadata without retaining an object URL or inventing a duration', async () => {
    vi.useFakeTimers();
    const db = controlledDatabase();
    const result = storeFilmMedia(file());
    const rejection = expect(result).rejects.toThrow('信息读取超时');
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    expect(db.factory.open).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledOnce();
  });
  it('times out a stalled database transaction and rejects its late completion', async () => {
    vi.useFakeTimers();
    const db = controlledDatabase();
    db.controls.holdWrites = true;
    const result = storeFilmMedia(file());
    const rejection = expect(result).rejects.toThrow('存储操作超时');
    elements[0].dispatchEvent(new Event('loadedmetadata'));
    await flush();
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    expect(db.pending[0].transaction.abort).toHaveBeenCalledOnce();
    db.pending[0].transaction.commit();
    expect(db.records.size).toBe(0);
    expect(db.close).toHaveBeenCalledOnce();
  });
});
