/** Read-only source crop; cancellation retires an Image before any late canvas work. */
export function cropFocusRegionPreview(url, region, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Preview cancelled', 'AbortError'));
      return;
    }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', abort);
      image.removeAttribute('src');
    };
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => {
      finish(null, new DOMException('Preview cancelled', 'AbortError'));
    };
    image.onload = () => {
      if (settled) return;
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      const x = Math.max(0, Math.round(region.relX * naturalWidth));
      const y = Math.max(0, Math.round(region.relY * naturalHeight));
      let width = Math.round((region.width > 0 ? region.width : 1) * naturalWidth);
      let height = Math.round((region.height > 0 ? region.height : 1) * naturalHeight);
      if (x + width > naturalWidth) width = naturalWidth - x;
      if (y + height > naturalHeight) height = naturalHeight - y;
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        finish(null, new Error('Invalid crop region'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        finish(null, new Error('Canvas context unavailable'));
        return;
      }
      try {
        context.drawImage(image, x, y, width, height, 0, 0, width, height);
        finish(canvas.toDataURL('image/png'));
      } catch (error) {
        finish(null, error instanceof Error ? error : new Error(String(error)));
      }
    };
    image.onerror = () => finish(null, new Error('Image load failed'));
    signal?.addEventListener('abort', abort, { once: true });
    if (typeof url !== 'string' || !url) finish(null, new Error('Image URL unavailable'));
    else image.src = url;
  });
}
