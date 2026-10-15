import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBlenderRuntime } from './scene-runtime.js';

function fixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const renderer = {
    domElement: document.createElement('canvas'),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    dispose: vi.fn(),
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    render: vi.fn(),
    xr: { enabled: false },
    shadowMap: { autoUpdate: true },
    autoClear: true,
    state: { buffers: { depth: { setMask: vi.fn() } } },
  };
  const loads = [],
    textureLoader = {
      load: (url, loaded, progress, failed) => loads.push({ url, loaded, failed }),
    };
  const onReady = vi.fn(),
    onError = vi.fn(),
    onLayout = vi.fn();
  const runtime = createBlenderRuntime({
    host,
    roughnessUrl: '/roughness.jpg',
    normalUrl: '/normal.jpg',
    videoTextureEnabled: false,
    rendererFactory: () => renderer,
    textureLoader,
    onReady,
    onError,
    onLayout,
  });
  return { host, renderer, runtime, loads, onReady, onError, onLayout };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('Blender scene lifecycle', () => {
  it('shows readiness only after textures and a rendered scene, then caps narrow-screen GPU resolution', async () => {
    const { host, renderer, runtime, loads, onReady, onLayout } = fixture();
    runtime.resize(772, 900);
    runtime.render(1 / 60);
    expect(onReady).not.toHaveBeenCalled();
    loads.forEach((load) => load.loaded(new THREE.Texture()));
    await flush();
    runtime.render(1 / 60);
    expect(onReady).toHaveBeenCalledOnce();
    expect(onLayout).toHaveBeenCalledWith(
      expect.objectContaining({ top: expect.any(Number), titleScale: expect.any(Number) }),
    );
    runtime.resize(390, 844);
    runtime.render(1 / 60);
    expect(renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    const targets = renderer.setRenderTarget.mock.calls.map(([target]) => target).filter(Boolean);
    expect(targets.at(-1).width).toBe(256);
    runtime.dispose();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
    host.remove();
  });

  it('disposes late textures without updating or reviving an unmounted scene', async () => {
    const { host, renderer, runtime, loads, onReady, onLayout } = fixture();
    runtime.resize(772, 900);
    const count = onLayout.mock.calls.length;
    runtime.dispose();
    runtime.dispose();
    const textures = [new THREE.Texture(), new THREE.Texture()];
    const disposed = textures.map((texture) => vi.spyOn(texture, 'dispose'));
    loads.forEach((load, index) => load.loaded(textures[index]));
    await flush();
    runtime.resize(390, 844);
    runtime.render(1 / 60);
    expect(onReady).not.toHaveBeenCalled();
    expect(onLayout).toHaveBeenCalledTimes(count);
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    disposed.forEach((dispose) => expect(dispose).toHaveBeenCalledOnce());
    host.remove();
  });

  it('retains ownership of a texture when the other texture fails and releases it on fallback', async () => {
    const { host, runtime, loads, onError, onReady } = fixture();
    const texture = new THREE.Texture(),
      disposed = vi.spyOn(texture, 'dispose');
    loads[0].loaded(texture);
    loads[1].failed(new Error('missing normal map'));
    await flush();
    expect(onError).toHaveBeenCalledWith(
      'texture',
      expect.objectContaining({
        message: 'Unable to load texture /normal.jpg: missing normal map',
      }),
    );
    runtime.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(onReady).not.toHaveBeenCalled();
    host.remove();
  });
});
