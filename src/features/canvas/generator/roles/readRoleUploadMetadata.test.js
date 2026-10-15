import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readRoleUploadMetadata } from './readRoleUploadMetadata.js';

let images, makeUrl, releaseUrl;
beforeEach(() => {
  images = [];
  const OriginalURL = URL;
  makeUrl = vi.fn(() => 'blob:role-upload');
  releaseUrl = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static createObjectURL = makeUrl;
      static revokeObjectURL = releaseUrl;
    },
  );
  vi.stubGlobal(
    'Image',
    class {
      constructor() {
        const image = document.createElement('img');
        images.push(image);
        return image;
      }
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('owned role upload metadata reader', () => {
  it('returns actual image metadata and releases the URL and event handlers once', async () => {
    const controller = new AbortController();
    const file = new File(['actual file bytes'], 'reference.png', { type: 'image/png' });
    const pending = readRoleUploadMetadata(file, 'image', { signal: controller.signal });
    const image = images[0];
    Object.defineProperties(image, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
    image.onload();
    await expect(pending).resolves.toEqual({ width: 640, height: 480 });
    expect(makeUrl).toHaveBeenCalledWith(file);
    expect(releaseUrl).toHaveBeenCalledExactlyOnceWith('blob:role-upload');
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(image.hasAttribute('src')).toBe(false);
    controller.abort();
    expect(releaseUrl).toHaveBeenCalledTimes(1);
  });

  it('does not allocate a reader for an already cancelled owner', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readRoleUploadMetadata(new File([], 'a.png'), 'image', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(images).toHaveLength(0);
    expect(makeUrl).not.toHaveBeenCalled();
  });

  it('cancels a pending owner and ignores a captured late image callback', async () => {
    const controller = new AbortController();
    const pending = readRoleUploadMetadata(new File([], 'a.png'), 'image', {
      signal: controller.signal,
    });
    const lateLoad = images[0].onload;
    controller.abort();
    lateLoad();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(releaseUrl).toHaveBeenCalledTimes(1);
    expect(images[0].onload).toBeNull();
  });

  it('keeps failed image decoding explicit rather than returning zero dimensions', async () => {
    const pending = readRoleUploadMetadata(new File([], 'broken.png'), 'image', {
      signal: new AbortController().signal,
    });
    images[0].onerror();
    await expect(pending).rejects.toThrow('无法读取图片信息');
    expect(releaseUrl).toHaveBeenCalledTimes(1);
  });

  it('times out unreadable metadata and clears its scheduled work on success', async () => {
    vi.useFakeTimers();
    const pending = readRoleUploadMetadata(new File([], 'broken.png'), 'image', {
      signal: new AbortController().signal,
    });
    const rejected = expect(pending).rejects.toThrow('无法读取图片信息');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(releaseUrl).toHaveBeenCalledTimes(1);
  });

  it('reads video metadata and releases the actual media element when completed', async () => {
    const original = document.createElement.bind(document),
      elements = [];
    vi.spyOn(document, 'createElement').mockImplementation((name, options) => {
      const element = original(name, options);
      if (name === 'video') elements.push(element);
      return element;
    });
    const pending = readRoleUploadMetadata(new File(['bytes'], 'a.mp4'), 'video', {
      signal: new AbortController().signal,
    });
    const video = elements[0];
    Object.defineProperties(video, {
      videoWidth: { value: 1280 },
      videoHeight: { value: 720 },
      duration: { value: 12 },
    });
    video.onloadedmetadata();
    await expect(pending).resolves.toEqual({ width: 1280, height: 720, duration: 12 });
    expect(video.onloadedmetadata).toBeNull();
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.load).toHaveBeenCalledOnce();
    expect(releaseUrl).toHaveBeenCalledOnce();
  });
});
