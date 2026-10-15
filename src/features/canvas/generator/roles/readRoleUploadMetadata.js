/** Read only browser metadata; no file upload, certification or guessed dimensions. */
export function readRoleUploadMetadata(file, type, { signal }) {
  if (signal.aborted) return Promise.reject(new DOMException('素材读取已取消', 'AbortError'));
  return new Promise((resolve, reject) => {
    const element = type === 'image' ? new Image() : document.createElement(type);
    let objectUrl;
    let timeout;
    let settled = false;
    const finish = (cause, metadata) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      element.onload = element.onloadedmetadata = element.onerror = null;
      if (type !== 'image') {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } else element.removeAttribute('src');
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (cause) reject(cause);
      else resolve(metadata);
    };
    const abort = () => finish(new DOMException('素材读取已取消', 'AbortError'));
    const failure = () =>
      finish(
        new Error(
          { image: '无法读取图片信息', video: '无法读取视频信息', audio: '无法读取音频信息' }[type],
        ),
      );
    signal.addEventListener('abort', abort, { once: true });
    element.onerror = failure;
    if (type === 'image')
      element.onload = () =>
        finish(null, { width: element.naturalWidth, height: element.naturalHeight });
    else {
      element.preload = 'metadata';
      element.onloadedmetadata = () =>
        finish(null, {
          duration: element.duration,
          ...(type === 'video' ? { width: element.videoWidth, height: element.videoHeight } : {}),
        });
    }
    try {
      objectUrl = URL.createObjectURL(file);
      timeout = setTimeout(failure, 10_000);
      element.src = objectUrl;
    } catch (cause) {
      finish(cause);
    }
  });
}
