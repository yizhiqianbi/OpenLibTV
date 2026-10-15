/** Native elements and cancellable readiness shared by timeline and inspector. */
export function releaseMedia(element) {
  try {
    element.pause();
  } catch {
    /* Disposal continues after a native refusal. */
  }
  element.removeAttribute('src');
  try {
    element.load();
  } catch {
    /* Detached native media may no longer load. */
  }
  element.remove();
}

export function nativeMedia(kind, url) {
  const element = document.createElement(kind === 'audio' ? 'audio' : 'video');
  element.preload = 'auto';
  element.crossOrigin = 'anonymous';
  if (kind !== 'audio') {
    element.muted = true;
    element.playsInline = true;
  }
  element.controls = false;
  element.setAttribute('aria-hidden', 'true');
  element.src = url;
  return element;
}

export function awaitNative(element, predicate, { signal, timeoutMs, events, label }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      element.removeEventListener('error', failed);
      for (const event of events) element.removeEventListener(event, check);
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (predicate()) finish();
    };
    const cancel = () => finish(new DOMException('播放准备已取消', 'AbortError'));
    const failed = () => finish(new Error(`${label}不可读取`));
    const timer = setTimeout(() => finish(new Error(`${label}准备超时`)), timeoutMs);
    signal.addEventListener('abort', cancel, { once: true });
    element.addEventListener('error', failed);
    for (const event of events) element.addEventListener(event, check);
    if (signal.aborted) cancel();
    else if (element.error) failed();
    else check();
  });
}
