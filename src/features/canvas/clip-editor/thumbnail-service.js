import { thumbnailTimes } from './domain/thumbnail-model.js';

function assertNotAborted(signal) {
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
}

function waitForEvent(target, eventName, errorName, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener(errorName, onError);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const onEvent = () => finish(resolve);
    const onError = () => finish(reject, new Error('无法读取视频帧'));
    const onAbort = () =>
      finish(reject, new DOMException('The operation was aborted.', 'AbortError'));
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener(errorName, onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function prepareVideo(video, url, signal) {
  assertNotAborted(signal);
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  const ready =
    video.readyState >= 1
      ? Promise.resolve()
      : waitForEvent(video, 'loadedmetadata', 'error', signal);
  video.src = url;
  video.load?.();
  await ready;
  assertNotAborted(signal);
}

async function seekVideo(video, time, signal) {
  assertNotAborted(signal);
  const target = Math.max(0, Math.min(Number(video.duration) || time, time));
  if (Math.abs((Number(video.currentTime) || 0) - target) < 0.01 && video.readyState >= 2) return;
  const settled = waitForEvent(video, 'seeked', 'error', signal);
  video.currentTime = target;
  await settled;
  assertNotAborted(signal);
}

function canReadVideoFrames(video) {
  return Boolean(
    video &&
    typeof video.load === 'function' &&
    (video.canPlayType?.('video/mp4') || video.canPlayType?.('video/webm')),
  );
}

/** Read a small real frame strip without changing the editor document. */
export async function extractVideoThumbnailFrames(
  url,
  clip,
  {
    signal,
    videoFactory = () => document.createElement('video'),
    canvasFactory = () => document.createElement('canvas'),
    frameCount = 6,
    width = 160,
    height = 90,
  } = {},
) {
  if (typeof url !== 'string' || !url.trim()) throw new Error('当前没有可读取的视频地址');
  assertNotAborted(signal);
  const video = videoFactory();
  if (!canReadVideoFrames(video)) return { status: 'unsupported', frames: [] };
  const canvas = canvasFactory();
  const context = canvas.getContext?.('2d');
  if (!context?.drawImage || typeof canvas.toDataURL !== 'function')
    return { status: 'unsupported', frames: [] };
  canvas.width = Math.max(1, Math.floor(width));
  canvas.height = Math.max(1, Math.floor(height));
  try {
    await prepareVideo(video, url, signal);
    const frames = [];
    for (const time of thumbnailTimes(clip, frameCount)) {
      await seekVideo(video, time, signal);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL('image/jpeg', 0.78));
    }
    return { status: 'ready', frames };
  } finally {
    video.pause?.();
    video.removeAttribute?.('src');
    video.load?.();
  }
}
