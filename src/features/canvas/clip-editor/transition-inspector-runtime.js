import { awaitNative, nativeMedia, releaseMedia } from './native-media.js';
import { describeTransitionInspectorStyle } from './domain/transition-inspector-model.js';

/** Owns two frozen native frames; no audio, timeline clock or document writes. */
export function startTransitionInspectorPreview({ host, type, from, to, onState }) {
  const controller = new AbortController();
  const media = [];
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let prepared = false;
  let frame, started, lastPaint;
  let live = true;
  const fill = document.createElement('div');
  const burn = document.createElement('div');
  burn.style.background = 'linear-gradient(90deg, rgb(255 0 0), rgb(230 230 51))';
  burn.style.mixBlendMode = 'screen';
  burn.style.opacity = type === 'dissolve' ? '0.72' : '0';
  for (const element of [burn, fill]) {
    element.setAttribute('aria-hidden', 'true');
    element.style.pointerEvents = 'none';
  }
  const stop = () => {
    if (frame != null) cancelAnimationFrame(frame);
    frame = null;
  };
  const dispose = () => {
    if (!live) return;
    live = false;
    controller.abort();
    stop();
    document.removeEventListener('visibilitychange', visibility);
    motion?.removeEventListener('change', visibility);
    for (const element of media) releaseMedia(element);
    fill.remove();
    burn.remove();
  };
  const fail = (error) => {
    if (!live || error?.name === 'AbortError') return;
    dispose();
    onState({ error: error.message || '转场预览失败', ready: false });
  };
  const paint = (progress) => {
    const style = describeTransitionInspectorStyle(type, progress);
    media[0].style.opacity = String(style.fromOpacity);
    media[1].style.opacity = String(style.toOpacity);
    fill.style.opacity = String(style.fillOpacity);
    fill.style.background = style.fillColor;
    for (const [element, mask] of [
      [media[1], style.toMask],
      [burn, style.burnMask],
    ]) {
      element.style.maskImage = mask;
      element.style.webkitMaskImage = mask;
      element.style.maskRepeat = element.style.webkitMaskRepeat = 'no-repeat';
      element.style.maskSize = element.style.webkitMaskSize = '100% 100%';
    }
  };
  const draw = (now) => {
    frame = null;
    if (!live || document.hidden) return;
    started ??= now;
    const progress = motion?.matches ? 0.5 : ((now - started) % 1600) / 1600;
    if (media.some((element) => element.error || element.seeking || element.readyState < 2)) {
      fail(new Error('转场预览帧不可读取'));
      return;
    }
    if (lastPaint == null || now - lastPaint >= 40 || motion?.matches) {
      paint(progress);
      lastPaint = now;
    }
    if (!motion?.matches) frame = requestAnimationFrame(draw);
  };
  const visibility = () => {
    stop();
    started = undefined;
    lastPaint = undefined;
    if (live && prepared && !document.hidden) frame = requestAnimationFrame(draw);
  };
  onState({ ready: false, error: '' });
  const prepare = async ({ url, time }) => {
    if (!url) throw new Error('转场两侧没有可读取的视频');
    const element = nativeMedia('video', url);
    media.push(element);
    element.loop = true;
    host.appendChild(element);
    const options = { signal: controller.signal, timeoutMs: 15_000, label: '转场视频' };
    await awaitNative(element, () => element.readyState >= 1, {
      ...options,
      events: ['loadedmetadata', 'durationchange'],
    });
    if (
      !Number.isFinite(element.duration) ||
      element.duration <= 0 ||
      !element.videoWidth ||
      !element.videoHeight
    )
      throw new Error('转场视频没有可用的时长或画面尺寸');
    element.currentTime = Math.max(0, Math.min(time, element.duration - 0.001));
    await awaitNative(element, () => !element.seeking && element.readyState >= 2, {
      ...options,
      events: ['seeked', 'loadeddata', 'canplay'],
    });
  };
  Promise.all([prepare(from), prepare(to)])
    .then(() => {
      if (!live) return;
      host.append(fill, burn);
      paint(motion?.matches ? 0.5 : 0);
      prepared = true;
      document.addEventListener('visibilitychange', visibility);
      motion?.addEventListener('change', visibility);
      onState({ ready: true, error: '' });
      visibility();
    })
    .catch(fail);
  return dispose;
}
