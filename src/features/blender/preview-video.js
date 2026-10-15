import * as THREE from 'three';

/** Own the detached media element and its VideoTexture, including late media events. */
export function createPreviewVideo({
  url,
  reducedMotion = false,
  onReady,
  onError,
  createVideo = () => document.createElement('video'),
  createTexture = (video) => new THREE.VideoTexture(video),
}) {
  let active = true,
    ready = false,
    motionReduced = reducedMotion,
    paused = false;
  const video = createVideo(),
    texture = createTexture(video);
  const playback = () => {
    if (!active || !ready) return;
    video.autoplay = !motionReduced;
    video.loop = !motionReduced;
    if (paused || motionReduced || document.hidden) {
      video.pause();
      if (motionReduced) video.currentTime = 0;
    } else video.play().catch(() => {});
  };
  const loaded = () => {
    if (!active || ready) return;
    ready = true;
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 16;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    playback();
    onReady?.(texture);
  };
  const failed = () => {
    if (active) {
      const detail =
        video.error?.message || (video.error?.code ? `media code ${video.error.code}` : '');
      onError?.(new Error(`Unable to load video ${url}${detail ? `: ${detail}` : ''}`));
    }
  };
  video.addEventListener('loadeddata', loaded);
  video.addEventListener('error', failed);
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = false;
  video.playsInline = true;
  video.src = url;
  video.load();
  if (video.readyState >= 2) loaded();
  return {
    texture,
    video,
    get ready() {
      return ready;
    },
    setReducedMotion(value) {
      motionReduced = value;
      playback();
    },
    setPaused(value) {
      paused = value;
      playback();
    },
    syncVisibility: playback,
    dispose() {
      if (!active) return;
      active = false;
      video.removeEventListener('loadeddata', loaded);
      video.removeEventListener('error', failed);
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
    },
  };
}
