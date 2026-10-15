import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTransitionInspectorPreview } from './transition-inspector-runtime.js';
let videos, frames, motion;
beforeEach(() => {
  videos = [];
  frames = new Map();
  motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => motion);
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (key) => frames.delete(key));
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
    const element = create(tag, options);
    if (tag === 'video') {
      Object.defineProperties(element, {
        readyState: { configurable: true, value: 3 },
        duration: { value: 8 },
        videoWidth: { value: 320 },
        videoHeight: { value: 180 },
        currentTime: { configurable: true, writable: true, value: 0 },
      });
      videos.push(element);
    }
    return element;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const draw = (time) => {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  callback(time);
};
function start() {
  const onState = vi.fn();
  const host = document.createElement('div');
  const dispose = startTransitionInspectorPreview({
    host,
    type: 'fade',
    from: { url: '/a.mp4', time: 30 },
    to: { url: '/b.mp4', time: 2 },
    onState,
  });
  return { onState, dispose, host };
}
describe('transition inspector frozen-frame lifecycle', () => {
  it('clamps against actual duration and loops independently of the timeline clock', async () => {
    const { onState, dispose, host } = start();
    await settle();
    expect(videos.map((video) => video.currentTime)).toEqual([7.999, 2]);
    expect(videos.every((video) => video.muted)).toBe(true);
    expect(onState).toHaveBeenLastCalledWith({ ready: true, error: '' });
    draw(0);
    expect(videos.map((video) => video.style.opacity)).toEqual(['1', '0']);
    draw(800);
    expect(videos.map((video) => video.style.opacity)).toEqual(['0.5', '0.5']);
    draw(1600);
    expect(videos.map((video) => video.style.opacity)).toEqual(['1', '0']);
    dispose();
    expect(frames.size).toBe(0);
    expect(host.children).toHaveLength(0);
    expect(videos.every((video) => !video.hasAttribute('src'))).toBe(true);
    dispose();
    expect(host.children).toHaveLength(0);
  });
  it('cancels pending frame reads and ignores late native events', async () => {
    const { onState, dispose, host } = start();
    for (const video of videos) Object.defineProperty(video, 'readyState', { value: 1 });
    await Promise.resolve();
    dispose();
    for (const video of videos) video.dispatchEvent(new Event('loadeddata'));
    await settle();
    expect(host.children).toHaveLength(0);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
  it('releases broken decoding resources and allows a fresh retry', async () => {
    const { onState, host } = start();
    await settle();
    Object.defineProperty(videos[0], 'error', { value: { code: 3 } });
    draw(0);
    expect(onState).toHaveBeenLastCalledWith({ ready: false, error: '转场预览帧不可读取' });
    expect(host.children).toHaveLength(0);
    expect(frames.size).toBe(0);
    const next = start();
    await settle();
    expect(next.host.querySelectorAll('video')).toHaveLength(2);
    expect(next.onState).toHaveBeenLastCalledWith({ ready: true, error: '' });
    next.dispose();
  });
  it('uses a static midpoint for reduced motion and stops scheduling in a hidden page', async () => {
    motion.matches = true;
    const { dispose } = start();
    await settle();
    draw(0);
    expect(videos.map((video) => video.style.opacity)).toEqual(['0.5', '0.5']);
    expect(frames.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    dispose();
    expect(motion.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
