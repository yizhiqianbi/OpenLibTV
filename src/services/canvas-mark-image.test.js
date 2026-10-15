import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCanvasMarkImage } from './canvas-mark-image.js';

function picture({ loaded = true, url = 'https://sample.example/picture.png' } = {}) {
  const image = new EventTarget();
  Object.assign(image, {
    src: url,
    currentSrc: url,
    complete: loaded,
    naturalWidth: loaded ? 1280 : 0,
    naturalHeight: loaded ? 720 : 0,
    removeAttribute: vi.fn(),
  });
  return image;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function canvasReader() {
  const canvas = document.createElement('canvas');
  const drawImage = vi.fn();
  vi.spyOn(document, 'createElement').mockReturnValue(canvas);
  vi.spyOn(canvas, 'getContext').mockReturnValue({ drawImage });
  vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,originalPNG');
  return { canvas, drawImage };
}

describe('natural image reader for Mark', () => {
  it('reads natural 1280×720 pixels as PNG raw base64 and releases the canvas', async () => {
    const { canvas, drawImage } = canvasReader();
    const image = picture();
    await expect(readCanvasMarkImage(image)).resolves.toBe('originalPNG');
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 1280, 720);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(image.removeAttribute).not.toHaveBeenCalled();
  });

  it('waits for the actual displayed picture, then rejects a changed URL', async () => {
    const { drawImage } = canvasReader();
    const image = picture({ loaded: false });
    const reading = readCanvasMarkImage(image);
    image.currentSrc = 'https://sample.example/replacement.png';
    image.complete = true;
    image.naturalWidth = 1280;
    image.naturalHeight = 720;
    image.dispatchEvent(new Event('load'));
    await expect(reading).rejects.toThrow('无法读取图片内容');
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('cancels pending loading, removes listeners, and ignores late load', async () => {
    const image = picture({ loaded: false });
    const remove = vi.spyOn(image, 'removeEventListener');
    const signal = new AbortController();
    const reading = readCanvasMarkImage(image, { signal: signal.signal });
    signal.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    image.naturalWidth = 100;
    image.naturalHeight = 100;
    image.dispatchEvent(new Event('load'));
    expect(remove.mock.calls.map(([type]) => type)).toEqual(['load', 'error']);
  });

  it('rejects already failed and pre-aborted pictures without starting CORS reads', async () => {
    const create = vi.fn();
    vi.stubGlobal('Image', create);
    const failed = picture({ loaded: false });
    failed.complete = true;
    await expect(readCanvasMarkImage(failed)).rejects.toThrow('无法读取图片内容');
    const operation = new AbortController();
    operation.abort();
    await expect(
      readCanvasMarkImage(picture(), { signal: operation.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('retries tainted canvas with anonymous CORS without changing the displayed image', async () => {
    const { canvas, drawImage } = canvasReader();
    const displayed = picture();
    const fallback = picture();
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          return fallback;
        }
      },
    );
    canvas.toDataURL.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    await expect(readCanvasMarkImage(displayed)).resolves.toBe('originalPNG');
    expect(fallback.crossOrigin).toBe('anonymous');
    expect(fallback.src).toBe(displayed.currentSrc);
    expect(drawImage.mock.calls.map(([image]) => image)).toEqual([displayed, fallback]);
    expect(fallback.removeAttribute).toHaveBeenCalledWith('src');
    expect(displayed.removeAttribute).not.toHaveBeenCalled();
  });

  it('cancels a CORS fallback and releases its URL without allowing late encode', async () => {
    const { canvas, drawImage } = canvasReader();
    const displayed = picture();
    const fallback = picture({ loaded: false });
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          return fallback;
        }
      },
    );
    canvas.toDataURL.mockImplementationOnce(() => {
      throw new Error('SecurityError');
    });
    const operation = new AbortController();
    const reading = readCanvasMarkImage(displayed, { signal: operation.signal });
    await Promise.resolve();
    operation.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    fallback.naturalWidth = fallback.naturalHeight = 200;
    fallback.dispatchEvent(new Event('load'));
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(fallback.removeAttribute).toHaveBeenCalledWith('src');
  });
});
