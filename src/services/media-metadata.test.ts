import { describe, expect, it, vi } from 'vitest';
import { probeVideoMetadata } from './media-metadata.ts';

function videoFixture() {
  const element = document.createElement('video');
  Object.defineProperties(element, {
    videoWidth: { value: 1920 },
    videoHeight: { value: 1080 },
    duration: { value: 8.25 },
  });
  const pause = vi.spyOn(element, 'pause').mockImplementation(() => {});
  const load = vi.spyOn(element, 'load').mockImplementation(() => {});
  return { element, pause, load };
}
describe('read-only video resource metadata', () => {
  it('reads actual media and optional HEAD size and releases the detached element', async () => {
    const { element, pause, load } = videoFixture();
    const readSize = vi.fn(async () => 12345);
    const pending = probeVideoMetadata('/movie.mp4', {
      createVideo: () => element,
      needSize: true,
      readSize,
    });
    expect(element.preload).toBe('metadata');
    expect(element.getAttribute('src')).toBe('/movie.mp4');
    element.dispatchEvent(new Event('loadedmetadata'));
    expect(await pending).toEqual({
      metadata: { width: 1920, height: 1080, durationSec: 8.25, byteSize: 12345 },
      errors: [],
    });
    expect(pause).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(2);
    expect(element.hasAttribute('src')).toBe(false);
  });
  it('keeps verified dimensions if size cannot be read and does not invent size', async () => {
    const { element } = videoFixture();
    const pending = probeVideoMetadata('/movie.mp4', {
      createVideo: () => element,
      needSize: true,
      readSize: async () => {
        throw new Error('CORS');
      },
    });
    element.dispatchEvent(new Event('loadedmetadata'));
    expect(await pending).toEqual({
      metadata: { width: 1920, height: 1080, durationSec: 8.25 },
      errors: ['素材大小尚未读取'],
    });
  });
  it('cancels the element and HEAD request together and rejects late metadata', async () => {
    const { element, pause } = videoFixture();
    const controller = new AbortController();
    let headSignal: AbortSignal | undefined;
    const pending = probeVideoMetadata('/movie.mp4', {
      signal: controller.signal,
      createVideo: () => element,
      needSize: true,
      readSize: (_url, signal) =>
        new Promise((_resolve, reject) => {
          headSignal = signal;
          signal.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
        }),
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(headSignal?.aborted).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    element.dispatchEvent(new Event('loadedmetadata'));
    expect(pause).toHaveBeenCalledOnce();
  });
  it('times out an unreadable video and leaves metadata unresolved', async () => {
    const { element } = videoFixture();
    const pending = probeVideoMetadata('/movie.mp4', { createVideo: () => element, timeoutMs: 1 });
    expect(await pending).toEqual({ metadata: {}, errors: ['素材时长和尺寸读取失败'] });
  });
});
