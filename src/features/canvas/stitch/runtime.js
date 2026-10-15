import { storyboardStitchCoverRect } from '../domain/storyboard-stitch-model.js';

const abortError = () => new DOMException('已取消', 'AbortError');
const checkAbort = (signal) => {
  if (signal?.aborted) throw abortError();
};
const clearImage = (image) => {
  image.onload = null;
  image.onerror = null;
  try {
    image.src = '';
  } catch {
    // Clearing a failed resource must not mask the original error or abort.
  }
};

function resolveResourceUrl(url, resolveUrl, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let finished = false;
    const complete = (error, value) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => complete(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => resolveUrl(url))
      .then(
        (value) => complete(null, value),
        (error) => complete(error),
      );
  });
}

function loadImage(url, signal, timeoutMs) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const image = new Image();
    let finished = false,
      timer;
    const complete = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      image.onload = null;
      image.onerror = null;
      if (error) {
        clearImage(image);
        reject(error);
      } else resolve(image);
    };
    const abort = () => complete(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    image.onload = () => complete();
    image.onerror = () => complete(new Error('图片加载失败'));
    timer = setTimeout(() => complete(new Error('图片加载超时')), timeoutMs);
    if (url.startsWith('http://') || url.startsWith('https://')) image.crossOrigin = 'anonymous';
    try {
      image.src = url;
      if (signal?.aborted) abort();
    } catch (error) {
      complete(error);
    }
  });
}

function exportPng(canvas, signal) {
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    let finished = false;
    const complete = (error, blob) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(blob);
    };
    const abort = () => complete(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    try {
      canvas.toBlob((blob) => {
        if (signal?.aborted) return abort();
        if (!blob || blob.size === 0) return complete(new Error('导出拼接图失败'));
        complete(null, blob);
      }, 'image/png');
    } catch (error) {
      complete(error);
    }
  });
}

function drawShotNumber(context, item, fontPx) {
  const inset = Math.max(4, Math.min(14, Math.round(0.035 * Math.min(item.width, item.height))));
  const x = item.x + inset,
    y = item.y + item.height - inset;
  context.save();
  context.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1.5, 0.14 * fontPx);
  context.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  context.strokeText(item.numberLabel, x, y);
  context.shadowColor = 'rgba(0, 0, 0, 0.28)';
  context.shadowBlur = Math.max(4, 0.4 * fontPx);
  context.shadowOffsetX = 0;
  context.shadowOffsetY = Math.max(2, Math.round(0.18 * fontPx));
  context.fillStyle = '#ffffff';
  context.fillText(item.numberLabel, x, y);
  context.shadowColor = 'rgba(0, 0, 0, 0.2)';
  context.shadowBlur = Math.max(2, 0.22 * fontPx);
  context.shadowOffsetY = Math.max(1, Math.round(0.1 * fontPx));
  context.fillText(item.numberLabel, x, y);
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fillText(item.numberLabel, x, y);
  context.restore();
}

/** Real local Canvas composition; upload, graph ownership and notification belong to the caller. */
export async function composeStoryboardStitch(
  plan,
  { signal, resolveUrl = (url) => url, imageTimeoutMs = 10000 } = {},
) {
  checkAbort(signal);
  if (
    !Number.isFinite(plan?.width) ||
    plan.width <= 0 ||
    !Number.isFinite(plan?.height) ||
    plan.height <= 0 ||
    !Array.isArray(plan.items) ||
    !Number.isFinite(plan.scale) ||
    plan.scale <= 0 ||
    !Number.isFinite(imageTimeoutMs) ||
    imageTimeoutMs <= 0
  )
    throw new Error('拼接配置不可用');
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  let image;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建画布');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#171717';
    context.fillRect(0, 0, plan.width, plan.height);
    context.save();
    try {
      context.scale(plan.scale, plan.scale);
      for (const item of plan.items) {
        checkAbort(signal);
        let drawn = false;
        if (item.url) {
          try {
            const url = await resolveResourceUrl(item.url, resolveUrl, signal);
            checkAbort(signal);
            if (typeof url !== 'string' || !url) throw new Error('图片地址不可用');
            image = await loadImage(url, signal, imageTimeoutMs);
            checkAbort(signal);
            const crop = storyboardStitchCoverRect(
              image.naturalWidth,
              image.naturalHeight,
              item.width,
              item.height,
            );
            if (crop) {
              context.drawImage(
                image,
                crop.x,
                crop.y,
                crop.width,
                crop.height,
                item.x,
                item.y,
                item.width,
                item.height,
              );
              drawn = true;
            }
          } catch (error) {
            if (error?.name === 'AbortError' || signal?.aborted) throw abortError();
            // Source paints an unavailable image dark and continues the remaining cells.
          } finally {
            if (image) clearImage(image);
            image = null;
          }
        }
        if (!drawn) {
          context.fillStyle = '#171717';
          context.fillRect(item.x, item.y, item.width, item.height);
        }
        if (plan.showShotNumbers) drawShotNumber(context, item, plan.shotNumberFontPx);
      }
    } finally {
      context.restore();
    }
    const blob = await exportPng(canvas, signal);
    checkAbort(signal);
    return {
      file: new File([blob], plan.fileName, { type: 'image/png' }),
      width: plan.width,
      height: plan.height,
    };
  } finally {
    if (image) clearImage(image);
    // Release the potentially large backing store after success, export failure or cancellation.
    canvas.width = 0;
    canvas.height = 0;
  }
}
