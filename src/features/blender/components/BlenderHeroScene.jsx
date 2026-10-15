import { useEffect, useRef } from 'react';
import { BLENDER_ASSETS, shouldAvoidWebGlVideoTexture } from '../scene-config.js';
import { useBlenderScene } from '../hooks/useBlenderScene.js';

export function BlenderHeroScene({ asset, reducedMotion, sweepActive, onLayout }) {
  const host = useRef(null),
    fallbackVideo = useRef(null);
  const videoTextureEnabled = !shouldAvoidWebGlVideoTexture(navigator.userAgent);
  const videoUrl = asset(BLENDER_ASSETS.video);
  const ready = useBlenderScene(host, {
    videoUrl,
    roughnessUrl: asset(BLENDER_ASSETS.roughness),
    normalUrl: asset(BLENDER_ASSETS.normal),
    videoTextureEnabled,
    reducedMotion,
    sweepActive,
    onLayout,
  });
  useEffect(() => {
    const video = fallbackVideo.current;
    if (!video) return;
    const sync = () => {
      if (reducedMotion || document.hidden) {
        video.pause();
        if (reducedMotion) video.currentTime = 0;
      } else video.play().catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      video.pause();
    };
  }, [reducedMotion]);
  return (
    <>
      <div
        ref={host}
        className="blender-webgl"
        aria-hidden="true"
        data-scene-ready={ready}
        data-video-mode={videoTextureEnabled ? 'webgl' : 'dom'}
      />
      <div
        className={`blender-scene-fallback ${ready && videoTextureEnabled ? 'blender-scene-fallback-hidden' : ''}`}
        aria-hidden="true"
      >
        <div className="blender-preview">
          {videoTextureEnabled ? (
            <img
              src={asset(BLENDER_ASSETS.poster)}
              alt=""
              width="960"
              height="540"
              fetchPriority="high"
            />
          ) : (
            <video
              ref={fallbackVideo}
              autoPlay={!reducedMotion}
              loop={!reducedMotion}
              muted
              playsInline
              preload="auto"
              src={videoUrl}
              poster={asset(BLENDER_ASSETS.poster)}
            />
          )}
        </div>
      </div>
    </>
  );
}
