export type ImageDimensions = { width: number; height: number };
export type ImageMetadataOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  createImage?: () => HTMLImageElement;
};

/** Read-only natural dimensions; a canceled owner never receives a late image. */
export function probeImageDimensions(
  url: string,
  { signal, timeoutMs = 10000, createImage = () => new Image() }: ImageMetadataOptions = {},
): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const abortError = () => new DOMException('Image metadata read canceled', 'AbortError');
    if (signal?.aborted) return reject(abortError());
    if (!url) return reject(new Error('Image URL unavailable'));
    let image: HTMLImageElement;
    try {
      image = createImage();
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const task: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = (dimensions?: ImageDimensions, error?: unknown, cancel = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(task.timer);
      signal?.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (cancel) image.src = '';
      if (error) reject(error);
      else if (dimensions) resolve(dimensions);
    };
    const abort = () => finish(undefined, abortError(), true);
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
      if (
        !Number.isFinite(dimensions.width) ||
        !Number.isFinite(dimensions.height) ||
        dimensions.width <= 0 ||
        dimensions.height <= 0
      )
        finish(undefined, new Error('Image dimensions unavailable'));
      else finish(dimensions);
    };
    image.onerror = () => finish(undefined, new Error('Image metadata read failed'));
    task.timer = setTimeout(
      () => finish(undefined, new Error('Image metadata read timed out'), true),
      Math.max(1, timeoutMs),
    );
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      image.src = url;
    } catch (error) {
      finish(undefined, error);
    }
  });
}
