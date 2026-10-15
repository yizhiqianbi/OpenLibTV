const cancelled = () => Object.assign(new Error('图片分析已取消'), { name: 'AbortError' });
const failure = () => new Error('无法读取图片内容，请检查图片访问权限后重试');
const imageUrl = (image) => image?.currentSrc || image?.src || '';

function waitForImage(image, expectedUrl, signal) {
  if (signal?.aborted) return Promise.reject(cancelled());
  if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return Promise.resolve();
  if (image.complete) return Promise.reject(failure());
  return new Promise((resolve, reject) => {
    const clean = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', errored);
      signal?.removeEventListener('abort', aborted);
    };
    const loaded = () => {
      clean();
      if (signal?.aborted) reject(cancelled());
      else if (
        imageUrl(image) !== expectedUrl ||
        !(image.naturalWidth > 0 && image.naturalHeight > 0)
      )
        reject(failure());
      else resolve();
    };
    const errored = () => {
      clean();
      reject(failure());
    };
    const aborted = () => {
      clean();
      reject(cancelled());
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', errored);
    signal?.addEventListener('abort', aborted, { once: true });
  });
}

function encode(image, expectedUrl, signal) {
  if (signal?.aborted) throw cancelled();
  if (imageUrl(image) !== expectedUrl) throw failure();
  const width = image.naturalWidth,
    height = image.naturalHeight;
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw failure();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw failure();
    context.drawImage(image, 0, 0, width, height);
    const url = canvas.toDataURL('image/png');
    if (!url.startsWith('data:image/png;base64,') || url.length <= 22) throw failure();
    if (signal?.aborted) throw cancelled();
    return url.slice(url.indexOf(',') + 1);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Original natural pixels as raw PNG base64; no upload or recognition request. */
export async function readCanvasMarkImage(image, { signal } = {}) {
  const url = imageUrl(image);
  if (!image || !url) throw failure();
  if (signal?.aborted) throw cancelled();
  await waitForImage(image, url, signal);
  try {
    return encode(image, url, signal);
  } catch (error) {
    if (error.name === 'AbortError' || imageUrl(image) !== url || signal?.aborted) throw error;
  }
  // The source retries tainted pictures with an anonymous CORS image. Keep the
  // displayed DOM image untouched and release only the reader-owned image.
  const fallback = new Image();
  fallback.crossOrigin = 'anonymous';
  fallback.src = url;
  try {
    await waitForImage(fallback, url, signal);
    return encode(fallback, url, signal);
  } finally {
    fallback.removeAttribute('src');
  }
}
