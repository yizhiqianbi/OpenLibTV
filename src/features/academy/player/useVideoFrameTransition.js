import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { captureVideoFrame, waitForRestoredFrame } from './frame-transition.js';

export function useVideoFrameTransition(video, playbackKey, poster) {
  const canvas = useRef(null);
  const pending = useRef(null);
  const latestPoster = useRef(poster);
  const [swapping, setSwapping] = useState(false);
  useLayoutEffect(() => {
    latestPoster.current = poster;
  }, [poster]);
  const clear = useCallback(() => {
    const element = pending.current?.video || video.current;
    const surface = pending.current?.canvas || canvas.current;
    pending.current?.cancel();
    pending.current = null;
    if (surface) {
      surface.style.opacity = '0';
      surface.width = 0;
      surface.height = 0;
    }
    if (element && latestPoster.current) element.setAttribute('poster', latestPoster.current);
  }, [video]);
  const settle = useCallback(() => {
    clear();
    setSwapping(false);
  }, [clear]);
  const capture = useCallback(() => {
    // A second selection invalidates every callback from the earlier source.
    clear();
    const element = video.current;
    if (!element) return;
    element.removeAttribute('poster');
    captureVideoFrame(element, canvas.current);
    const transaction = {
      position: element.currentTime,
      video: element,
      canvas: canvas.current,
      cancel: () => {},
    };
    pending.current = transaction;
    const timeout = setTimeout(() => {
      if (pending.current === transaction) settle();
    }, 5000);
    transaction.cancel = () => clearTimeout(timeout);
    setSwapping(true);
  }, [video, clear, settle]);
  const restored = useCallback(() => {
    const transaction = pending.current;
    const element = video.current;
    if (!transaction || !element) return;
    // Start decoding only after metadata has restored the desired position.
    // The original overall timeout remains active for stalled metadata loads.
    const cancelTimeout = transaction.cancel;
    const cancelFrame = waitForRestoredFrame(element, transaction.position, () => {
      if (pending.current === transaction) settle();
    });
    transaction.cancel = () => {
      cancelTimeout();
      cancelFrame();
    };
  }, [video, settle]);
  useEffect(() => {
    settle();
    return clear;
  }, [playbackKey, clear, settle]);
  return { canvas, swapping, capture, restored, settle };
}
