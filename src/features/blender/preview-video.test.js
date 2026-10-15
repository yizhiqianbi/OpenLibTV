import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createPreviewVideo } from './preview-video.js';

function fixture(reducedMotion = false) {
  const video = new EventTarget();
  Object.assign(video, {
    readyState: 0,
    currentTime: 4,
    load: vi.fn(),
    pause: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn(),
  });
  const texture = { dispose: vi.fn() },
    onReady = vi.fn(),
    onError = vi.fn();
  const preview = createPreviewVideo({
    url: '/preview.webm',
    reducedMotion,
    onReady,
    onError,
    createVideo: () => video,
    createTexture: () => texture,
  });
  return { preview, video, texture, onReady, onError };
}
beforeEach(() => vi.spyOn(document, 'hidden', 'get').mockReturnValue(false));

describe('Blender detached video ownership', () => {
  it('configures the source media attributes and only exposes a loaded texture', () => {
    const { preview, video, texture, onReady } = fixture();
    expect(video).toMatchObject({
      crossOrigin: 'anonymous',
      preload: 'auto',
      muted: true,
      defaultMuted: true,
      loop: false,
      playsInline: true,
      src: '/preview.webm',
    });
    expect(onReady).not.toHaveBeenCalled();
    video.dispatchEvent(new Event('loadeddata'));
    expect(onReady).toHaveBeenCalledWith(texture);
    expect(texture).toMatchObject({
      colorSpace: THREE.NoColorSpace,
      anisotropy: 16,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      needsUpdate: true,
    });
    expect(video.play).toHaveBeenCalledOnce();
    preview.dispose();
  });

  it('pauses video at frame zero for reduced motion and pauses without rewinding on context loss', () => {
    const { preview, video } = fixture(true);
    video.dispatchEvent(new Event('loadeddata'));
    expect(video.currentTime).toBe(0);
    expect(video.loop).toBe(false);
    expect(video.play).not.toHaveBeenCalled();
    preview.setReducedMotion(false);
    expect(video.play).toHaveBeenCalledOnce();
    video.currentTime = 3;
    preview.setPaused(true);
    expect(video.currentTime).toBe(3);
    preview.setPaused(false);
    expect(video.play).toHaveBeenCalledTimes(2);
    preview.dispose();
  });

  it('releases its texture exactly once and ignores media events after route disposal', () => {
    const { preview, video, texture, onReady, onError } = fixture();
    preview.dispose();
    preview.dispose();
    video.dispatchEvent(new Event('loadeddata'));
    video.dispatchEvent(new Event('error'));
    expect(texture.dispose).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(onReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
  });

  it('reports active video errors so the hero can keep its original poster', () => {
    const { preview, video, onError } = fixture();
    video.dispatchEvent(new Event('error'));
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unable to load video /preview.webm' }),
    );
    preview.dispose();
  });
});
