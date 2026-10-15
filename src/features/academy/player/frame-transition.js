/** Source player uses the decoded video frame, with a five-second recovery limit. */
export function requestDecodedFrame(video, callback) {
  if (typeof video.requestVideoFrameCallback === 'function') {
    const id = video.requestVideoFrameCallback(callback);
    return () => video.cancelVideoFrameCallback?.(id);
  }
  const id = requestAnimationFrame(callback);
  return () => cancelAnimationFrame(id);
}

export function captureVideoFrame(video, canvas) {
  if (!video || !canvas || video.readyState < 2 || !video.videoWidth || !video.videoHeight)
    return false;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    context.drawImage(video, 0, 0);
    canvas.style.opacity = '1';
    return true;
  } catch {
    // Cross-origin or undecodable media must still allow quality changes.
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.opacity = '0';
    return false;
  }
}

export function waitForRestoredFrame(video, position, onSettled) {
  let active = true;
  let cancelFrame;
  let timeout;
  const settle = () => {
    if (!active) return;
    active = false;
    cancelFrame?.();
    clearTimeout(timeout);
    onSettled();
  };
  const check = () => {
    if (!active) return;
    if (video.readyState >= 2 && Math.abs(video.currentTime - position) <= 0.5) settle();
    else cancelFrame = requestDecodedFrame(video, check);
  };
  timeout = setTimeout(settle, 5000);
  cancelFrame = requestDecodedFrame(video, check);
  return () => {
    active = false;
    cancelFrame?.();
    clearTimeout(timeout);
  };
}
