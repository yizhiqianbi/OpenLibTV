import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeImageDimensions } from './browser-image-metadata.ts';

const image = () =>
  ({
    src: '',
    naturalWidth: 1200,
    naturalHeight: 800,
    onload: null,
    onerror: null,
  }) as unknown as HTMLImageElement;
afterEach(() => vi.useRealTimers());

describe('natural image dimension ownership', () => {
  it('returns the loaded natural dimensions and detaches all callbacks', async () => {
    const value = image();
    const signal = new AbortController().signal;
    const remove = vi.spyOn(signal, 'removeEventListener');
    const pending = probeImageDimensions('/original?x-oss-process=watermark', {
      createImage: () => value,
      signal,
    });
    expect(value.src).toBe('/original?x-oss-process=watermark');
    value.onload!(new Event('load'));
    expect(await pending).toEqual({ width: 1200, height: 800 });
    expect(value.onload).toBeNull();
    expect(value.onerror).toBeNull();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('cancels the actual request and ignores a previously captured load callback', async () => {
    const value = image();
    const controller = new AbortController();
    const pending = probeImageDimensions('/old.png', {
      createImage: () => value,
      signal: controller.signal,
    });
    const late = value.onload!;
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(value.src).toBe('');
    late.call(value, new Event('load'));
    expect(value.onload).toBeNull();
    expect(value.onerror).toBeNull();
  });

  it('rejects an already canceled signal before creating an image', async () => {
    const controller = new AbortController();
    controller.abort();
    const createImage = vi.fn(image);
    await expect(
      probeImageDimensions('/a', { signal: controller.signal, createImage }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(createImage).not.toHaveBeenCalled();
  });

  it('handles cancellation during image construction without starting a request', async () => {
    const controller = new AbortController();
    const value = image();
    const pending = probeImageDimensions('/late', {
      signal: controller.signal,
      createImage: () => {
        controller.abort();
        return value;
      },
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(value.src).toBe('');
  });

  it('clears a timeout and cannot accept a late natural size', async () => {
    vi.useFakeTimers();
    const value = image();
    const pending = probeImageDimensions('/slow', { createImage: () => value, timeoutMs: 50 });
    const late = value.onload!;
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    late.call(value, new Event('load'));
    expect(value.src).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, NaN, Infinity])('rejects unusable natural dimensions %s', async (width) => {
    const value = image();
    Object.defineProperty(value, 'naturalWidth', { value: width });
    const pending = probeImageDimensions('/a', { createImage: () => value });
    value.onload!(new Event('load'));
    await expect(pending).rejects.toThrow('dimensions unavailable');
  });

  it('cleans up errors thrown when assigning the source', async () => {
    const value = image();
    Object.defineProperty(value, 'src', {
      set: () => {
        throw new Error('source failed');
      },
    });
    await expect(probeImageDimensions('/a', { createImage: () => value })).rejects.toThrow(
      'source failed',
    );
    expect(value.onload).toBeNull();
    expect(value.onerror).toBeNull();
  });
});
