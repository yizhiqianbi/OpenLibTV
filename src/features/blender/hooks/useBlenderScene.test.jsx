import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlenderRuntime } from '../scene-runtime.js';
import { useBlenderScene } from './useBlenderScene.js';

vi.mock('../scene-runtime.js', () => ({ createBlenderRuntime: vi.fn() }));
let idleCallback, frames, nextFrame, observer, configuration, engine;
beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id) => frames.delete(id)),
  );
  window.requestIdleCallback = vi.fn((callback) => {
    idleCallback = callback;
    return 1;
  });
  window.cancelIdleCallback = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor() {
        observer = this;
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  const canvas = document.createElement('canvas');
  engine = {
    canvas,
    resize: vi.fn(),
    setPointer: vi.fn(),
    updateOptions: vi.fn(),
    setPaused: vi.fn(),
    syncVisibility: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn(() => canvas.remove()),
  };
  createBlenderRuntime.mockImplementation((options) => {
    configuration = options;
    options.host.appendChild(canvas);
    return engine;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.requestIdleCallback;
  delete window.cancelIdleCallback;
});
function fixture() {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 772, height: 900 });
  document.body.appendChild(host);
  const options = {
    videoUrl: '/video.webm',
    roughnessUrl: '/roughness.jpg',
    normalUrl: '/normal.jpg',
    videoTextureEnabled: true,
    reducedMotion: false,
    sweepActive: false,
    onLayout: vi.fn(),
  };
  const ref = { current: host };
  return { host, options, ref };
}
async function initialize() {
  await act(async () => {
    await idleCallback();
  });
}
function tick(time = 0) {
  const [id, callback] = frames.entries().next().value;
  frames.delete(id);
  act(() => callback(time));
}

describe('Blender WebGL hook lifecycle', () => {
  it('reveals only a rendered ready scene and recovers from a lost context without another runtime', async () => {
    const { host, options, ref } = fixture();
    const { result, unmount } = renderHook(() => useBlenderScene(ref, options));
    await initialize();
    expect(result.current).toBe(false);
    expect(host.dataset.sceneStage).toBe('loading-assets');
    act(() => configuration.onReady());
    tick();
    expect(result.current).toBe(true);
    expect(host.dataset.sceneStage).toBe('ready');
    const lost = new Event('webglcontextlost', { cancelable: true });
    act(() => engine.canvas.dispatchEvent(lost));
    expect(lost.defaultPrevented).toBe(true);
    expect(result.current).toBe(false);
    expect(engine.canvas.style.visibility).toBe('hidden');
    expect(engine.setPaused).toHaveBeenLastCalledWith(true);
    expect(frames.size).toBe(0);
    act(() => engine.canvas.dispatchEvent(new Event('webglcontextrestored')));
    tick(1000);
    expect(engine.setPaused).toHaveBeenLastCalledWith(false);
    expect(engine.canvas.style.visibility).toBe('');
    expect(result.current).toBe(true);
    expect(createBlenderRuntime).toHaveBeenCalledOnce();
    unmount();
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    host.remove();
  });

  it('keeps latest motion/CTA options and layout callback without recreating the WebGL scene', async () => {
    const { host, options, ref } = fixture();
    const { rerender, unmount } = renderHook(({ value }) => useBlenderScene(ref, value), {
      initialProps: { value: options },
    });
    await initialize();
    const onLayout = vi.fn();
    rerender({ value: { ...options, reducedMotion: true, sweepActive: true, onLayout } });
    expect(engine.updateOptions).toHaveBeenLastCalledWith({
      reducedMotion: true,
      sweepActive: true,
    });
    act(() => configuration.onLayout({ top: 100, titleScale: 0.5 }));
    expect(onLayout).toHaveBeenCalledWith({ top: 100, titleScale: 0.5 });
    expect(options.onLayout).not.toHaveBeenCalled();
    expect(createBlenderRuntime).toHaveBeenCalledOnce();
    unmount();
    host.remove();
  });

  it('pauses scheduled drawing when hidden and ignores a queued callback after unmount', async () => {
    const { host, options, ref } = fixture();
    const { unmount } = renderHook(() => useBlenderScene(ref, options));
    await initialize();
    const queued = frames.values().next().value;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(engine.syncVisibility).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    unmount();
    act(() => queued(1000));
    expect(engine.render).not.toHaveBeenCalled();
    expect(engine.dispose).toHaveBeenCalledOnce();
    host.remove();
  });

  it('does not allocate a runtime when the lazy initialization finishes after route removal', async () => {
    const { host, options, ref } = fixture();
    const { unmount } = renderHook(() => useBlenderScene(ref, options));
    let initialization;
    act(() => {
      initialization = idleCallback();
    });
    unmount();
    await act(async () => {
      await initialization;
    });
    expect(createBlenderRuntime).not.toHaveBeenCalled();
    expect(host.children).toHaveLength(0);
    host.remove();
  });

  it('falls back and releases the scene once when media or ground texture loading fails', async () => {
    const { host, options, ref } = fixture();
    const { result, unmount } = renderHook(() => useBlenderScene(ref, options));
    await initialize();
    act(() => configuration.onError('video', new Error('Unable to load video /video.webm')));
    expect(result.current).toBe(false);
    expect(engine.setPaused).toHaveBeenCalledWith(true);
    expect(engine.dispose).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
    expect(host.dataset.sceneStage).toBe('video-error');
    expect(host.dataset.sceneError).toBe('Unable to load video /video.webm');
    expect(frames.size).toBe(0);
    act(() => window.dispatchEvent(new Event('resize')));
    expect(engine.resize).toHaveBeenCalledTimes(1);
    unmount();
    expect(engine.dispose).toHaveBeenCalledOnce();
    host.remove();
  });

  it('keeps the poster available when WebGL creation is unavailable', async () => {
    const { host, options, ref } = fixture();
    createBlenderRuntime.mockImplementation(() => {
      throw new Error('WebGL unavailable');
    });
    const { result, unmount } = renderHook(() => useBlenderScene(ref, options));
    await initialize();
    expect(result.current).toBe(false);
    expect(host.children).toHaveLength(0);
    expect(host.dataset.sceneStage).toBe('initialization-error');
    expect(host.dataset.sceneError).toBe('WebGL unavailable');
    expect(frames.size).toBe(0);
    unmount();
    host.remove();
  });

  it('preserves render failure evidence after releasing the canvas and falling back', async () => {
    const { host, options, ref } = fixture();
    const { result, unmount } = renderHook(() => useBlenderScene(ref, options));
    await initialize();
    engine.render.mockImplementation(() => {
      throw new Error('Failed to upload video texture');
    });
    tick();
    expect(result.current).toBe(false);
    expect(host.dataset.sceneStage).toBe('render-error');
    expect(host.dataset.sceneError).toBe('Failed to upload video texture');
    expect(host.children).toHaveLength(0);
    expect(frames.size).toBe(0);
    expect(engine.dispose).toHaveBeenCalledOnce();
    unmount();
    expect(engine.dispose).toHaveBeenCalledOnce();
    host.remove();
  });
});
