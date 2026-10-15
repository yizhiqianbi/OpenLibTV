import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** The WebGL scene owns all GPU/media resources for one mounted hero. */
export function useBlenderScene(
  host,
  { videoUrl, roughnessUrl, normalUrl, videoTextureEnabled, reducedMotion, sweepActive, onLayout },
) {
  const [ready, setReady] = useState(false);
  const runtime = useRef(null),
    latest = useRef({ reducedMotion, sweepActive, onLayout });
  useLayoutEffect(() => {
    latest.current = { reducedMotion, sweepActive, onLayout };
    runtime.current?.updateOptions({ reducedMotion, sweepActive });
  }, [reducedMotion, sweepActive, onLayout]);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    let active = true,
      contextLost = false,
      animation = null,
      previousTime = null,
      observer;
    let engine,
      engineDisposed = false,
      sceneReady = false,
      shown = false,
      failed = false;
    setReady(false);
    // Keep failure evidence inspectable while the original poster remains the user-facing fallback.
    root.dataset.sceneStage = 'scheduled';
    delete root.dataset.sceneError;
    const release = () => {
      if (engine && !engineDisposed) {
        engineDisposed = true;
        if (runtime.current === engine) runtime.current = null;
        engine.dispose();
      }
    };
    const stop = () => {
      if (animation !== null) cancelAnimationFrame(animation);
      animation = null;
      previousTime = null;
    };
    const fail = (stage, error) => {
      if (!active || failed) return;
      failed = true;
      shown = false;
      root.dataset.sceneStage = `${stage}-error`;
      root.dataset.sceneError = error?.message || String(error || `Unable to initialize ${stage}`);
      if (engine) engine.canvas.style.visibility = 'hidden';
      engine?.setPaused(true);
      release();
      setReady(false);
      stop();
    };
    const frame = (time) => {
      animation = null;
      if (!active || contextLost || document.hidden || failed || !engine || engineDisposed) return;
      try {
        engine.render(previousTime === null ? 1 / 60 : (time - previousTime) / 1000);
        previousTime = time;
        if (sceneReady && !shown) {
          shown = true;
          engine.canvas.style.visibility = '';
          root.dataset.sceneStage = 'ready';
          setReady(true);
        }
        animation = requestAnimationFrame(frame);
      } catch (error) {
        fail('render', error);
      }
    };
    const start = () => {
      if (
        active &&
        engine &&
        !engineDisposed &&
        !failed &&
        !contextLost &&
        !document.hidden &&
        animation === null
      )
        animation = requestAnimationFrame(frame);
    };
    const resize = () => {
      if (!active || !engine || engineDisposed) return;
      const { width, height } = root.getBoundingClientRect();
      engine.resize(width, height);
      start();
    };
    const pointerMove = (event) => {
      if (!engine || engineDisposed) return;
      const bounds = root.getBoundingClientRect();
      if (bounds.width && bounds.height)
        engine.setPointer(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          1 - ((event.clientY - bounds.top) / bounds.height) * 2,
        );
    };
    const lost = (event) => {
      event.preventDefault();
      contextLost = true;
      shown = false;
      root.dataset.sceneStage = 'context-lost';
      stop();
      engine?.setPaused(true);
      if (engine) engine.canvas.style.visibility = 'hidden';
      if (active) setReady(false);
    };
    const restored = () => {
      if (!active || engineDisposed) return;
      contextLost = false;
      root.dataset.sceneStage = 'recovering';
      engine?.setPaused(false);
      resize();
      start();
    };
    const visibility = () => {
      engine?.syncVisibility();
      if (document.hidden) stop();
      else start();
    };
    const init = async () => {
      let stage = 'module';
      try {
        root.dataset.sceneStage = 'loading-module';
        const { createBlenderRuntime } = await import('../scene-runtime.js');
        if (!active) return;
        stage = 'initialization';
        root.dataset.sceneStage = 'initializing';
        engine = createBlenderRuntime({
          host: root,
          videoUrl,
          roughnessUrl,
          normalUrl,
          videoTextureEnabled,
          reducedMotion: latest.current.reducedMotion,
          onLayout: (layout) => {
            if (active) latest.current.onLayout?.(layout);
          },
          onReady: () => {
            if (active) sceneReady = true;
          },
          onError: fail,
        });
        if (!active || failed) {
          release();
          return;
        }
        root.dataset.sceneStage = 'loading-assets';
        runtime.current = engine;
        engine.updateOptions(latest.current);
        engine.canvas.addEventListener('pointermove', pointerMove);
        engine.canvas.addEventListener('webglcontextlost', lost);
        engine.canvas.addEventListener('webglcontextrestored', restored);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('resize', resize);
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(resize);
          observer.observe(root);
        }
        resize();
        start();
      } catch (error) {
        fail(stage, error);
        release();
      }
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(init, { timeout: 600 })
      : window.setTimeout(init, 0);
    return () => {
      active = false;
      if (window.requestIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stop();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      engine?.canvas.removeEventListener('pointermove', pointerMove);
      engine?.canvas.removeEventListener('webglcontextlost', lost);
      engine?.canvas.removeEventListener('webglcontextrestored', restored);
      if (runtime.current === engine) runtime.current = null;
      release();
    };
  }, [host, videoUrl, roughnessUrl, normalUrl, videoTextureEnabled]);
  return ready;
}
